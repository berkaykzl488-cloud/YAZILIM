<?php
/**
 * Para çekme, T.C. kimlik, e-Gider Pusulası (PLAN §4 P3). Her para hareketi Idempotency-Key ile, satır kilidiyle, defterde.
 *
 * Üye:
 *   POST me/tc/verify   {tc, dt}          NVİ (KPSPublic) ile doğrulama; NVİ'ye ulaşılamazsa "inceleme" (ekip elle onaylar)
 *   POST me/tc/confirm  {tc}              doğrulanmış ama tam numarası kayıtlı olmayan eski kayıt için tam numara onayı
 *   POST withdrawals    {amount, iban}    Idempotency-Key zorunlu; tutar çekilebilir bakiyeden hemen ayrılır
 *   GET  me/withdrawals                   çekim taleplerim (belge bilgisi YOK)
 * Yönetim:
 *   GET  admin/withdrawals?f=&q=          [cekim|muhasebe]  tablo (tam IBAN, açıklama, belge no) — görüntüleme audit'e yazılır
 *   POST admin/withdrawals/{id}/approve   [cekim]  "Gönderildi & Pusula Kes" (iki kez onay: tek numara)
 *   POST admin/withdrawals/{id}/reject    [cekim]  {why} tutar bakiyeye iade
 *   POST admin/withdrawals/{id}/egp       [cekim]  pusula kes / açıklamayı güncelle (bekleyende onay + kes)
 *   GET  admin/withdrawals/{id}/egp       [cekim|muhasebe]  belge (tam TC; her gösterim audit)
 *   GET  admin/egp?q=                     [cekim|muhasebe]  belge no / ETTN / çekim no ile bul
 *   GET|POST admin/users/{id}/tc-full     [cekim|muhasebe]  tam TC göster (audit) / gir
 *   POST admin/users/{id}/tc-reset [uye] · tc-ask [cekim|muhasebe] · tc-approve [cekim|uye]
 *   GET  admin/settings/withdraw · PUT admin/settings/tc | wdfee | egp   [cekim]
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Hooks;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Kimlik;
use YP\Money\Api;
use YP\Money\IdemTx;
use YP\Money\Rules;
use YP\Money\Withdraw;
use YP\Perm;
use YP\Present;
use YP\RateLimit;
use YP\Settings;
use YP\Text;

return function (Router $r) {
    $S = function ($perm, $csrf = true) {
        return ['auth' => 'staff', 'perm' => $perm, 'csrf' => $csrf];
    };
    $member = function (Db $db, $ref) {
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [Ids::user($ref)]);
        if (!$u) {
            throw HttpError::notFound('Üye bulunamadı.');
        }
        return $u;
    };
    $staffUsers = function (Db $db, array $ids) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) {
            return [];
        }
        $rows = $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
        $out = [];
        foreach ($rows as $u) {
            $out[(int)$u['id']] = $u;
        }
        return $out;
    };

    // Yönetim › Bugün: bekleyen çekim sayısı (rozet)
    Hooks::on('admin_queues', function (array $q, Db $db, $u) {
        if (Perm::has($u, 'cekim') || Perm::has($u, 'muhasebe')) {
            $q['wd'] = (int)$db->val("SELECT COUNT(*) FROM {withdrawals} WHERE status='bekliyor'");
        }
        return $q;
    }, 'withdraw');

    /* ---------------- üye: kimlik ---------------- */

    $r->post('me/tc/verify', function (Req $q, Db $db) {
        $res = Kimlik::verify($db, Auth::$user, Api::body($q));
        return ['msg' => $res['msg'], 'data' => ['state' => $res['state']], 'patch' => ['me' => Api::me($db)]];
    }, ['auth' => 'user']);

    $r->post('me/tc/confirm', function (Req $q, Db $db) {
        RateLimit::enforce('tcc:' . (int)Auth::$user['id'], 10, 3600, true, 'Çok fazla deneme yaptınız. Lütfen bir saat sonra tekrar deneyin.');
        $in = Api::body($q);
        $msg = Kimlik::confirm($db, Auth::$user, isset($in['tc']) ? $in['tc'] : '');
        return ['msg' => $msg, 'patch' => ['me' => Api::me($db)]];
    }, ['auth' => 'user']);

    /* ---------------- üye: çekim ---------------- */

    $r->post('withdrawals', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        return IdemTx::run($db, $u['id'], $key, 'POST withdrawals', function (Db $db) use ($u, $in) {
            RateLimit::enforce('wd_req:' . (int)$u['id'], 10, 3600, true, 'Bir saatte en fazla 10 çekim talebi oluşturabilirsiniz.');
            $w = Withdraw::request($db, $u, $in);
            $p = Withdraw::memberView($w);
            return ['msg' => 'Çekim talebiniz alındı. IBAN\'ınıza net ' . Rules::tl($w['net']) . ' gönderilecek.', 'data' => ['withdrawal' => $p],
                'patch' => ['upsert' => ['wd' => [$p]], 'me' => Api::me($db)]];
        });
    }, ['auth' => 'user']);

    $r->get('me/withdrawals', function (Req $q, Db $db) {
        $p = [(int)Auth::$user['id']];
        $w = '';
        if ($a = Api::after($q)) {
            $w = ' AND id<?';
            $p[] = $a;
        }
        $lim = Api::limit($q, 30, 100);
        $rows = $db->all('SELECT * FROM {withdrawals} WHERE user_id=?' . $w . ' ORDER BY id DESC LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)Auth::$user['id']]);
        $gate = Withdraw::gate($db, $u);
        return ['data' => ['wd' => array_map([Withdraw::class, 'memberView'], $rows), 'next' => $more && $rows ? Withdraw::ref(end($rows)['id']) : null,
            'gate' => $gate ? ['code' => $gate[0], 'msg' => $gate[1]] : null, 'minWithdraw' => Rules::site($db)['minWithdraw'],
            'wdDailyMax' => (float)(Rules::site($db)['wdDailyMax'] ?? 0)]];
    }, ['auth' => 'user', 'csrf' => false]);

    /* ---------------- yönetim: tablo ---------------- */

    $r->get('admin/withdrawals', function (Req $q, Db $db) use ($staffUsers) {
        $f = $q->q('f', 'bekliyor');
        $w = ['1=1'];
        $p = [];
        if (in_array($f, ['bekliyor', 'onaylandı', 'reddedildi'], true)) {
            $w[] = 'w.status=?';
            $p[] = $f;
        }
        $s = yp_str(trim($q->q('q')), 60);
        if (yp_strlen($s) >= 2) {
            $like = '%' . Text::likeEscape(Text::fold($s)) . '%';
            $or = ["u.name_norm LIKE ? ESCAPE '!'", "LOWER(w.holder) LIKE ? ESCAPE '!'", "LOWER(COALESCE(w.egp_no,'')) LIKE ? ESCAPE '!'", "LOWER(COALESCE(w.egp_ettn,'')) LIKE ? ESCAPE '!'"];
            array_push($p, $like, '%' . Text::likeEscape(mb_strtolower($s, 'UTF-8')) . '%', '%' . Text::likeEscape(strtolower($s)) . '%', '%' . Text::likeEscape(strtolower($s)) . '%');
            if (preg_match('/^w?([1-9][0-9]{0,17})$/i', $s, $m)) {
                $or[] = 'w.id=?';
                $p[] = (int)$m[1];
            }
            $dg = preg_replace('/\D/', '', $s);
            if (strlen($dg) >= 4) {
                $or[] = 'w.iban_last4=?';
                $p[] = substr($dg, -4);
            }
            $w[] = '(' . implode(' OR ', $or) . ')';
        }
        if ($a = Api::after($q)) {
            $w[] = 'w.id<?';
            $p[] = $a;
        }
        $lim = Api::limit($q, 100, 200);
        $order = $f === 'bekliyor' ? 'w.created_at ASC, w.id ASC' : 'w.id DESC';
        $rows = $db->all('SELECT w.* FROM {withdrawals} w JOIN {users} u ON u.id=w.user_id WHERE ' . implode(' AND ', $w) . ' ORDER BY ' . $order . ' LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        $U = $staffUsers($db, array_column($rows, 'user_id'));
        $list = [];
        foreach ($rows as $x) {
            $list[] = Withdraw::staffView($db, $x, isset($U[(int)$x['user_id']]) ? $U[(int)$x['user_id']] : null);
        }
        if ($rows) {
            Audit::log($db, Auth::$user['id'], 'iban_view', 'withdrawal', 'list', ['ids' => array_map([Withdraw::class, 'ref'], array_column($rows, 'id')), 'f' => $f]);
        }
        $counts = [];
        foreach ($db->all('SELECT status, COUNT(*) AS n FROM {withdrawals} GROUP BY status') as $c) {
            $counts[$c['status']] = (int)$c['n'];
        }
        $day = Withdraw::dayStart(yp_now_ms());
        return ['data' => [
            'wd' => $list,
            'users' => array_values(array_map(function ($u) use ($db) {
                return Present::staffUser($db, $u);
            }, $U)),
            'counts' => $counts + ['bekliyor' => 0, 'onaylandı' => 0, 'reddedildi' => 0],
            'pendingNet' => Text::tl($db->val("SELECT COALESCE(SUM(net),0) FROM {withdrawals} WHERE status='bekliyor'")),
            'oldest' => ($o = $db->val("SELECT MIN(created_at) FROM {withdrawals} WHERE status='bekliyor'")) ? (int)$o : null,
            'today' => ['n' => (int)$db->val("SELECT COUNT(*) FROM {withdrawals} WHERE status='onaylandı' AND paid_at>=?", [$day]),
                'net' => Text::tl($db->val("SELECT COALESCE(SUM(net),0) FROM {withdrawals} WHERE status='onaylandı' AND paid_at>=?", [$day]))],
            'next' => $more && $rows ? (string)end($rows)['id'] : null,
        ]];
    }, $S(['cekim', 'muhasebe'], false));

    $one = function (Db $db, $id) {
        $w = Withdraw::find($db, $id);
        return Withdraw::staffView($db, $w);
    };

    $r->post('admin/withdrawals/{id}/approve', function (Req $q, Db $db) use ($one) {
        $in = Api::body($q);
        $staff = Auth::$user;
        list($w, $st, $notc) = $db->tx(function (Db $db) use ($q, $in, $staff) {
            return Withdraw::approve($db, $staff, Withdraw::id($q->param('id')), $in);
        });
        $p = $one($db, $w['id']);
        $msg = $st === 'already' ? 'Bu talep zaten onaylanmış' . ($w['egp_no'] ? ' (' . $w['egp_no'] . ').' : '.')
            : ($notc ? 'Ödeme onaylandı ancak e-Gider Pusulası kesilmedi: ' . Kimlik::NOTC . '. Talepte "Pusula Kes" ile tamamlayın.'
                : ($w['egp_no'] ? 'Ödeme onaylandı ve ' . $w['egp_no'] . ' nolu e-Gider Pusulası kesildi.' : 'Ödeme gönderildi olarak işaretlendi.'));
        return ['msg' => $msg, 'data' => ['withdrawal' => $p, 'already' => $st === 'already', 'noTc' => $notc], 'patch' => ['upsert' => ['wd' => [$p]]]];
    }, $S('ui:act:wd-ok'));

    $r->post('admin/withdrawals/{id}/reject', function (Req $q, Db $db) use ($one) {
        $in = Api::body($q);
        $staff = Auth::$user;
        list($w, $st) = $db->tx(function (Db $db) use ($q, $in, $staff) {
            return Withdraw::reject($db, $staff, Withdraw::id($q->param('id')), isset($in['why']) ? $in['why'] : '');
        });
        $p = $one($db, $w['id']);
        return ['msg' => $st === 'already' ? 'Bu talep zaten reddedilmiş.' : 'Talep reddedildi; ' . Rules::tl($w['amount']) . ' üyenin bakiyesine iade edildi.',
            'data' => ['withdrawal' => $p], 'patch' => ['upsert' => ['wd' => [$p]]]];
    }, $S('ui:act:wd-no'));

    $r->post('admin/withdrawals/{id}/egp', function (Req $q, Db $db) use ($one) {
        $in = Api::body($q);
        $staff = Auth::$user;
        list($w, $was) = $db->tx(function (Db $db) use ($q, $in, $staff) {
            return Withdraw::issueFor($db, $staff, Withdraw::id($q->param('id')), $in);
        });
        $p = $one($db, $w['id']);
        return ['msg' => $w['egp_no'] . ' nolu e-Gider Pusulası ' . ($was ? 'güncellendi.' : 'oluşturuldu.'), 'data' => ['withdrawal' => $p],
            'patch' => ['upsert' => ['wd' => [$p]]]];
    }, $S('ui:form:egpissue'));

    $r->get('admin/withdrawals/{id}/egp', function (Req $q, Db $db) {
        $w = Withdraw::find($db, $q->param('id'));
        $d = Withdraw::docView($db, $w);
        Audit::log($db, Auth::$user['id'], 'egp_view', 'withdrawal', Withdraw::ref($w['id']), ['no' => $w['egp_no'], 'draft' => $d['draft'], 'tc' => $d['tckn'] !== '']);
        return ['data' => ['doc' => $d, 'withdrawal' => Withdraw::staffView($db, $w)]];
    }, $S(['cekim', 'muhasebe'], false));

    $r->get('admin/egp', function (Req $q, Db $db) {
        $s = strtoupper(preg_replace('/\s+/', '', yp_str($q->q('q'), 64)));
        if (strlen($s) < 3) {
            throw HttpError::validation(['q' => 'Belge numarasını (YGP...) yazın.']);
        }
        $w = $db->one('SELECT id FROM {withdrawals} WHERE egp_no=? OR LOWER(egp_ettn)=?', [$s, strtolower($s)]);
        if (!$w && preg_match('/^W?([1-9][0-9]{0,17})$/', $s, $m)) {
            $w = $db->one('SELECT id FROM {withdrawals} WHERE id=?', [(int)$m[1]]);
        }
        if (!$w) {
            $w = $db->one("SELECT id FROM {withdrawals} WHERE egp_no LIKE ? ESCAPE '!' ORDER BY id DESC LIMIT 1", ['%' . Text::likeEscape($s) . '%']);
        }
        if (!$w) {
            throw HttpError::notFound('Belge numarası eşleşen e-Gider Pusulası bulunamadı.');
        }
        return ['data' => ['id' => Withdraw::ref($w['id'])]];
    }, $S(['cekim', 'muhasebe'], false));

    /* ---------------- yönetim: kimlik ---------------- */

    $r->get('admin/users/{id}/tc-full', function (Req $q, Db $db) use ($member) {
        $u = $member($db, $q->param('id'));
        $t = Kimlik::reveal($db, Auth::$user, $u, $q->q('why'));
        if ($t === null) {
            throw HttpError::notFound(Kimlik::NOTC . '.');
        }
        return ['data' => ['tc' => $t, 'mask' => (string)$u['tc_mask']]];
    }, $S('ui:form:egptc', false));

    $r->post('admin/users/{id}/tc-full', function (Req $q, Db $db) use ($member) {
        $u = $member($db, $q->param('id'));
        $in = Api::body($q);
        $msg = Kimlik::setFull($db, Auth::$user, $u, isset($in['tc']) ? $in['tc'] : '');
        return ['msg' => $msg, 'data' => ['user' => Present::staffUser($db, $member($db, $u['id']))]];
    }, $S('ui:form:egptc'));

    $r->post('admin/users/{id}/tc-reset', function (Req $q, Db $db) use ($member) {
        $u = $member($db, $q->param('id'));
        Kimlik::reset($db, Auth::$user, $u);
        return ['msg' => 'Kimlik doğrulaması sıfırlandı; üye yeniden doğrulamalı.', 'data' => ['user' => Present::staffUser($db, $member($db, $u['id']))]];
    }, $S('ui:act:tc-reset'));

    $r->post('admin/users/{id}/tc-ask', function (Req $q, Db $db) use ($member) {
        $u = $member($db, $q->param('id'));
        Kimlik::ask($db, Auth::$user, $u);
        return ['msg' => 'Üyeye doğrulama bildirimi gönderildi.', 'data' => ['user' => Present::staffUser($db, $member($db, $u['id']))]];
    }, $S('ui:act:tc-ask'));

    $r->post('admin/users/{id}/tc-approve', function (Req $q, Db $db) use ($member) {
        $u = $member($db, $q->param('id'));
        Kimlik::approveManual($db, Auth::$user, $u);
        return ['msg' => 'Kimlik elle onaylandı.', 'data' => ['user' => Present::staffUser($db, $member($db, $u['id']))]];
    }, $S(['cekim', 'uye']));

    /* ---------------- yönetim: ayarlar [cekim] ---------------- */

    $settingsBody = function (Db $db) {
        $site = Rules::site($db);
        $tc = Settings::get('tc', $db);
        return ['tc' => ['req' => !empty($tc['req']), 'url' => ''], 'wdFee' => Settings::get('wdFee', $db), 'egp' => Settings::get('egp', $db),
            'minWithdraw' => $site['minWithdraw'], 'wdDailyMax' => isset($site['wdDailyMax']) ? $site['wdDailyMax'] : 0,
            'tcCounts' => ['ok' => (int)$db->val("SELECT COUNT(*) FROM {users} WHERE role='member' AND tc_ok=1"),
                'no' => (int)$db->val("SELECT COUNT(*) FROM {users} WHERE role='member' AND tc_ok=0"),
                'review' => (int)$db->val("SELECT COUNT(*) FROM {users} WHERE role='member' AND tc_ok=0 AND tc_state='inceleme'")]];
    };

    $r->get('admin/settings/withdraw', function (Req $q, Db $db) use ($settingsBody) {
        return ['data' => $settingsBody($db)];
    }, $S(['cekim', 'muhasebe'], false));

    $r->put('admin/settings/tc', function (Req $q, Db $db) use ($settingsBody) {
        $in = Api::body($q);
        $v = ['req' => Api::bool(isset($in['req']) ? $in['req'] : true)];
        Settings::set('tc', $v, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_tc', 'settings', 'tc', $v);
        return ['msg' => 'Kimlik doğrulama ayarları kaydedildi.', 'data' => $settingsBody($db), 'patch' => ['set' => ['tc' => $v + ['url' => '']]]];
    }, $S('ui:form:tcset'));

    $r->put('admin/settings/wdfee', function (Req $q, Db $db) use ($settingsBody) {
        $in = Api::body($q);
        $n = function ($k) use ($in) {
            $x = Text::kurus(isset($in[$k]) ? $in[$k] : 0);
            return $x === null ? 0 : max(0, min(100000000, $x)) / 100;
        };
        $type = isset($in['type']) && $in['type'] === 'yuzde' ? 'yuzde' : 'sabit';
        $val = $n('val');
        if ($type === 'yuzde' && $val > 50) {
            throw HttpError::validation(['wf_v' => 'Yüzde ücret en fazla %50 olabilir.']);
        }
        $f = ['on' => Api::bool(isset($in['on']) ? $in['on'] : false), 'type' => $type, 'val' => $val, 'min' => $n('min'), 'max' => $n('max')];
        Settings::set('wdFee', $f, Auth::$user['id'], $db);
        if (isset($in['minWithdraw']) || isset($in['wdDailyMax'])) {
            $site = Settings::get('site', $db);
            if (isset($in['minWithdraw'])) {
                $site['minWithdraw'] = $n('minWithdraw');
            }
            if (isset($in['wdDailyMax'])) {
                $site['wdDailyMax'] = $n('wdDailyMax');
            }
            Settings::set('site', $site, Auth::$user['id'], $db);
        }
        Audit::log($db, Auth::$user['id'], 'settings_wdfee', 'settings', 'wdFee', $f);
        return ['msg' => 'Para çekme ücreti kaydedildi.', 'data' => $settingsBody($db), 'patch' => ['set' => ['wdFee' => $f]]];
    }, $S('ui:form:wdfee'));

    $r->put('admin/settings/egp', function (Req $q, Db $db) use ($settingsBody) {
        $in = Api::body($q);
        $E = Settings::get('egp', $db);
        foreach (['company' => 160, 'vd' => 80, 'vkn' => 20, 'mersis' => 20, 'addr' => 200, 'provider' => 80, 'descTpl' => 500] as $k => $max) {
            if (isset($in[$k]) && is_string($in[$k]) && trim($in[$k]) !== '') {
                $E[$k] = yp_str(trim($in[$k]), $max);
            }
        }
        if (isset($in['vkn']) && is_string($in['vkn']) && trim($in['vkn']) !== '' && !preg_match('/^[0-9]{10,16}$/', trim($in['vkn']))) {
            throw HttpError::validation(['egp_vkn' => 'VKN / MERSİS yalnız rakam olmalı (10–16 hane).']);
        }
        if (isset($in['seri'])) {
            $E['seri'] = Withdraw::seri(['seri' => (string)$in['seri']]);
        }
        if (isset($in['stopaj']) && is_numeric($in['stopaj'])) {
            $E['stopaj'] = max(0, min(40, round((float)$in['stopaj'] * 2) / 2));
        }
        if (isset($in['autoOnApprove'])) {
            $E['autoOnApprove'] = Api::bool($in['autoOnApprove']);
        }
        if (isset($in['on'])) {
            $E['on'] = Api::bool($in['on']);
        }
        Settings::set('egp', $E, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_egp', 'settings', 'egp', ['seri' => $E['seri'], 'stopaj' => $E['stopaj'], 'auto' => $E['autoOnApprove']]);
        return ['msg' => 'e-Gider Pusulası ayarları kaydedildi.', 'data' => $settingsBody($db), 'patch' => ['set' => ['wdTax' => !empty($E['on']) ? (float)$E['stopaj'] : 0]]];
    }, $S('ui:form:egpset'));
};
