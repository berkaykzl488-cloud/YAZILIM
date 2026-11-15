<?php
/**
 * Muhasebe & raporlar (PLAN §4 P3) [muhasebe]. Defter listesi P2'de (GET admin/ledger); burada günlük / aylık toplamlar,
 * Excel'de açılan CSV dışa aktarımları (UTF-8 BOM, ";" ayraç, virgüllü ondalık — Türkçe karakterler bozulmaz) ve
 * Paraşüt / Bizim Hesap kuyruğu (accounting_jobs).
 *   GET  admin/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD     gün gün hesap toplamları (TL)
 *   GET  admin/reports/monthly?year=2026                       ay ay
 *   GET  admin/reports/export?type=journal|withdrawals|daily|monthly&from&to   CSV dosyası
 *   GET  admin/accounting/jobs?status=   POST admin/accounting/jobs/{id}/retry   POST admin/accounting/run
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Accounting\Queue;
use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Raw;
use YP\Http\Req;
use YP\Http\Router;
use YP\Kimlik;
use YP\Money\Withdraw;
use YP\Text;

return function (Router $r) {
    $S = function ($perm, $csrf = true) {
        return ['auth' => 'staff', 'perm' => $perm, 'csrf' => $csrf];
    };
    // Rapor sütunları: hesap kodu → başlık (hesap bakiyesinin işareti: GW eksi biriktirir → tahsilat olarak artı gösterilir)
    $COLS = [
        'yukleme' => 'Bakiye yükleme (tahsilat)', 'REV:commission' => 'Satış komisyonu', 'REV:doping' => 'Doping geliri', 'REV:cekim' => 'Çekim işlem ücreti',
        'BANK:OUT' => 'IBAN\'a gönderilen (net)', 'TAX:stopaj' => 'GV stopajı (tahakkuk)', 'EXP' => 'Bonus / puan gideri', 'PAYABLE:WD' => 'Bekleyen çekim (değişim)',
        'ESCROW:ORD' => 'Havuz (değişim)',
    ];
    $range = function (Req $q, $defDays = 31) {
        $tz = new \DateTimeZone('Europe/Istanbul');
        $p = function ($s) use ($tz) {
            return preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$s) ? (new \DateTime($s, $tz))->getTimestamp() * 1000 : null;
        };
        $to = $p($q->q('to'));
        $to = $to !== null ? $to + 86400000 : Withdraw::dayStart(yp_now_ms()) + 86400000;
        $from = $p($q->q('from'));
        $from = $from !== null ? $from : $to - $defDays * 86400000;
        if ($to <= $from || $to - $from > 400 * 86400000) {
            throw HttpError::validation(['from' => 'Tarih aralığı geçersiz (en çok 400 gün).']);
        }
        return [$from, $to];
    };
    /** [gün => [sütun => kuruş]] */
    $daily = function (Db $db, $from, $to) {
        $day = $db->dialect === 'mysql' ? 'FLOOR((p.t+10800000)/86400000)' : '((p.t+10800000)/86400000)';
        $rows = $db->all('SELECT ' . $day . ' AS d, a.code, a.type, j.kind, SUM(p.amount) AS s FROM {postings} p JOIN {accounts} a ON a.id=p.account_id
            JOIN {journal} j ON j.id=p.journal_id WHERE p.t>=? AND p.t<? GROUP BY ' . $day . ', a.code, a.type, j.kind', [$from, $to]);
        $out = [];
        foreach ($rows as $x) {
            $k = null;
            $s = (int)$x['s'];
            if ($x['type'] === 'gateway' && strpos($x['code'], 'GW:') === 0 && $x['kind'] === 'yukleme') {
                $k = 'yukleme';
                $s = -$s;
            } elseif (in_array($x['code'], ['REV:commission', 'REV:doping', 'REV:cekim', 'BANK:OUT', 'TAX:stopaj', 'PAYABLE:WD', 'ESCROW:ORD'], true)) {
                $k = $x['code'];
            } elseif ($x['type'] === 'expense') {
                $k = 'EXP';
                $s = -$s;
            }
            if ($k === null) {
                continue;
            }
            $d = gmdate('Y-m-d', ((int)$x['d']) * 86400);
            $out[$d][$k] = (isset($out[$d][$k]) ? $out[$d][$k] : 0) + $s;
        }
        ksort($out);
        return $out;
    };
    $tlRow = function (array $r) {
        return array_map(function ($v) {
            return Text::tl($v);
        }, $r);
    };

    $r->get('admin/reports/daily', function (Req $q, Db $db) use ($range, $daily, $COLS, $tlRow) {
        list($from, $to) = $range($q);
        $D = $daily($db, $from, $to);
        $rows = [];
        $tot = [];
        foreach ($D as $d => $c) {
            $rows[] = ['day' => $d, 'v' => $tlRow($c)];
            foreach ($c as $k => $v) {
                $tot[$k] = (isset($tot[$k]) ? $tot[$k] : 0) + $v;
            }
        }
        $wd = $db->one("SELECT COUNT(*) AS n, COALESCE(SUM(net),0) AS net, COALESCE(SUM(fee),0) AS fee, COALESCE(SUM(stopaj),0) AS st FROM {withdrawals} WHERE status='onaylandı' AND paid_at>=? AND paid_at<?", [$from, $to]);
        return ['data' => ['cols' => $COLS, 'rows' => $rows, 'total' => $tlRow($tot), 'from' => gmdate('Y-m-d', intdiv($from + 10800000, 1000)),
            'to' => gmdate('Y-m-d', intdiv($to - 1 + 10800000, 1000)),
            'withdrawals' => ['n' => (int)$wd['n'], 'net' => Text::tl($wd['net']), 'fee' => Text::tl($wd['fee']), 'stopaj' => Text::tl($wd['st'])],
            'egp' => (int)$db->val('SELECT COUNT(*) FROM {withdrawals} WHERE egp_no IS NOT NULL AND paid_at>=? AND paid_at<?', [$from, $to])]];
    }, $S('muhasebe', false));

    $monthly = function (Db $db, $year) use ($daily) {
        $tz = new \DateTimeZone('Europe/Istanbul');
        $from = (new \DateTime($year . '-01-01', $tz))->getTimestamp() * 1000;
        $to = (new \DateTime(($year + 1) . '-01-01', $tz))->getTimestamp() * 1000;
        $M = [];
        foreach ($daily($db, $from, $to) as $d => $c) {
            $m = substr($d, 0, 7);
            foreach ($c as $k => $v) {
                $M[$m][$k] = (isset($M[$m][$k]) ? $M[$m][$k] : 0) + $v;
            }
        }
        return $M;
    };

    $r->get('admin/reports/monthly', function (Req $q, Db $db) use ($monthly, $COLS, $tlRow) {
        $y = ctype_digit($q->q('year')) ? (int)$q->q('year') : (int)Withdraw::tz(yp_now_ms(), 'Y');
        if ($y < 2020 || $y > 2100) {
            throw HttpError::validation(['year' => 'Yıl geçersiz.']);
        }
        $rows = [];
        foreach ($monthly($db, $y) as $m => $c) {
            $rows[] = ['month' => $m, 'v' => $tlRow($c)];
        }
        return ['data' => ['cols' => $COLS, 'rows' => $rows, 'year' => $y]];
    }, $S('muhasebe', false));

    /* ---------------- CSV (Excel) ---------------- */
    $csv = function (array $head, array $rows) {
        $esc = function ($v) {
            if (is_float($v) || is_int($v)) {
                $v = str_replace('.', ',', (string)$v);
            }
            $v = (string)$v;
            if (preg_match('/^[=+\-@\t\r]/', $v) && !preg_match('/^-?[0-9]+(,[0-9]+)?$/', $v)) {
                $v = "'" . $v; // Excel formül enjeksiyonu
            }
            return '"' . str_replace('"', '""', $v) . '"';
        };
        $o = "\xEF\xBB\xBF" . "sep=;\r\n" . implode(';', array_map($esc, $head)) . "\r\n";
        foreach ($rows as $r) {
            $o .= implode(';', array_map($esc, $r)) . "\r\n";
        }
        return $o;
    };
    $dt = function ($ms) {
        return $ms ? Withdraw::tz($ms, 'd.m.Y H:i') : '';
    };

    $r->get('admin/reports/export', function (Req $q, Db $db) use ($range, $daily, $monthly, $COLS, $csv, $dt) {
        $type = $q->q('type', 'journal');
        $me = Auth::$user;
        if ($type === 'daily' || $type === 'monthly') {
            if ($type === 'daily') {
                list($from, $to) = $range($q);
                $D = $daily($db, $from, $to);
                $first = 'Gün';
            } else {
                $y = ctype_digit($q->q('year')) ? (int)$q->q('year') : (int)Withdraw::tz(yp_now_ms(), 'Y');
                $D = $monthly($db, $y);
                $first = 'Ay';
            }
            $rows = [];
            foreach ($D as $d => $c) {
                $row = [$d];
                foreach (array_keys($COLS) as $k) {
                    $row[] = Text::tl(isset($c[$k]) ? $c[$k] : 0);
                }
                $rows[] = $row;
            }
            $body = $csv(array_merge([$first], array_values($COLS)), $rows);
            $name = 'yangpazar-' . ($type === 'daily' ? 'gunluk' : 'aylik') . '-rapor.csv';
        } elseif ($type === 'withdrawals') {
            list($from, $to) = $range($q, 31);
            $rows = [];
            $tcN = 0;
            foreach ($db->all('SELECT w.*, u.name AS uname, u.ad, u.soyad FROM {withdrawals} w JOIN {users} u ON u.id=w.user_id WHERE w.created_at>=? AND w.created_at<? ORDER BY w.id', [$from, $to]) as $w) {
                $d = Withdraw::doc($w);
                if ($d && $d['tckn'] !== '') {
                    $tcN++;
                }
                $rows[] = [$dt($w['created_at']), $dt($w['paid_at']), $w['uname'], trim($w['ad'] . ' ' . $w['soyad']), $d ? $d['tckn'] : '',
                    $w['bank'], Withdraw::fmtIban(Withdraw::ibanOf($w)), $w['holder'], $w['status'], (string)$w['egp_no'], (string)$w['egp_ettn'],
                    Text::tl($w['amount']), Text::tl($w['fee']), Text::tl($w['brut']), Text::tl($w['stopaj']), Text::tl($w['net'])];
            }
            Audit::log($db, $me['id'], 'export_withdrawals', 'report', 'withdrawals', ['rows' => count($rows), 'tc' => $tcN]);
            $body = $csv(['Talep tarihi', 'Ödeme tarihi', 'Kullanıcı adı', 'Ad soyad', 'T.C. Kimlik No', 'Banka', 'IBAN', 'Hesap sahibi', 'Durum',
                'e-Gider Pusulası No', 'ETTN', 'Talep tutarı', 'İşlem ücreti', 'Brüt tutar', 'GV stopajı', 'Net ödenen'], $rows);
            $name = 'yangpazar-cekimler.csv';
        } elseif ($type === 'journal') {
            list($from, $to) = $range($q, 31);
            $rows = [];
            foreach ($db->all('SELECT j.*, u.name AS uname FROM {journal} j LEFT JOIN {users} u ON u.id=j.user_id WHERE j.t>=? AND j.t<? ORDER BY j.id LIMIT 50000', [$from, $to]) as $j) {
                $m = $j['meta'] ? (json_decode($j['meta'], true) ?: []) : [];
                $rows[] = [$dt($j['t']), 'g' . $j['id'], $j['kind'], (string)$j['uname'], Text::tl($j['amount']),
                    isset($m['m']) && is_string($m['m']) ? $m['m'] : $j['memo'], isset($m['ref']) && is_string($m['ref']) ? $m['ref'] : $j['ref_id']];
            }
            Audit::log($db, $me['id'], 'export_journal', 'report', 'journal', ['rows' => count($rows)]);
            $body = $csv(['Tarih', 'Kayıt', 'Tür', 'Üye', 'Tutar (TL)', 'Açıklama', 'Referans'], $rows);
            $name = 'yangpazar-defter.csv';
        } else {
            throw HttpError::validation(['type' => 'Rapor türü geçersiz.']);
        }
        return Raw::text('text/csv; charset=utf-8', $body, ['Content-Disposition' => 'attachment; filename="' . $name . '"', 'Cache-Control' => 'no-store']);
    }, $S('muhasebe', false));

    /* ---------------- muhasebe kuyruğu ---------------- */

    $r->get('admin/accounting/jobs', function (Req $q, Db $db) {
        $st = $q->q('status');
        $w = in_array($st, ['bekliyor', 'tamam', 'hata'], true) ? 'WHERE status=?' : '';
        $rows = $db->all('SELECT * FROM {accounting_jobs} ' . $w . ' ORDER BY id DESC LIMIT 100', $w ? [$st] : []);
        $c = [];
        foreach ($db->all('SELECT status, COUNT(*) AS n FROM {accounting_jobs} GROUP BY status') as $x) {
            $c[$x['status']] = (int)$x['n'];
        }
        return ['data' => ['jobs' => array_map([Queue::class, 'view'], $rows), 'counts' => $c + ['bekliyor' => 0, 'tamam' => 0, 'hata' => 0]]];
    }, $S('muhasebe', false));

    $r->post('admin/accounting/jobs/{id}/retry', function (Req $q, Db $db) {
        $id = \YP\Ids::parse($q->param('id'), 'aj');
        if (!Queue::retry($db, Auth::$user, $id)) {
            throw HttpError::notFound('İş bulunamadı ya da zaten tamamlandı.');
        }
        return ['msg' => 'İş yeniden kuyruğa alındı.'];
    }, $S('muhasebe'));

    $r->post('admin/accounting/run', function (Req $q, Db $db) {
        $res = Queue::run($db, microtime(true) + 20, 10);
        Audit::log($db, Auth::$user['id'], 'acct_run', 'system', 'accounting_jobs', $res);
        return ['msg' => $res['done'] . ' kayıt gönderildi' . ($res['failed'] + $res['gaveUp'] ? ', ' . ($res['failed'] + $res['gaveUp']) . ' kayıt gönderilemedi (yeniden denenecek).' : '.'), 'data' => $res];
    }, $S('muhasebe'));
};
