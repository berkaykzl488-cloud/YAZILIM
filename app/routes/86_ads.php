<?php
/**
 * Reklam satışı ve site görselleri (PLAN §4 P5): takvim, satın alma (bakiyeden, Idempotency-Key, takvim kilidi), gösterim /
 * tıklama sayacı (beacon), yönetim: onay (gelir tanınır) / red (iade) / durdur / +7 gün / sil / medya / paket fiyatları [reklam];
 * site görselleri [reklam]. Yayındaki reklamlar, site görselleri ve paketler açılış verisine (boot) eklenir (YP\Hooks).
 * Yanıt: data.ad (S.ads şekli), patch {upsert:{ads}, me}.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Db;
use YP\Growth\Ads;
use YP\Growth\Slides;
use YP\Hooks;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Money\Api;
use YP\Money\IdemTx;
use YP\Money\Rules;
use YP\Perm;
use YP\Present;
use YP\RateLimit;

return function (Router $r) {
    // boot: yayındaki reklamlar, açık site görselleri, paket fiyatları
    Hooks::on('boot', function (array $data, Db $db, $u) {
        $data['ads'] = Ads::present($db, Ads::liveRows($db), 'public');
        $data['slides'] = Slides::all($db, true);
        $data['packs'] = Ads::packs($db);
        return $data;
    }, 'ads');
    // Yönetim iş kuyruğu: onay bekleyen reklamlar
    Hooks::on('admin_queues', function (array $q, Db $db, $u) {
        $q['ads'] = Perm::has($u, 'reklam') ? (int)$db->val("SELECT COUNT(*) FROM {ads} WHERE status='onay'") : 0;
        return $q;
    }, 'ads');

    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    /** Reklam sahibinin iletişim bilgisi ([reklam] yetkilisi görür: ad, soyad, telefon) */
    $owners = function (Db $db, array $rows) {
        $ids = array_values(array_unique(array_filter(array_map('intval', array_column($rows, 'owner_id')))));
        if (!$ids) {
            return [];
        }
        return array_map(function ($u) {
            return array_merge(Present::publicUser($u), ['ad' => $u['ad'], 'soyad' => $u['soyad'], 'tel' => $u['tel']]);
        }, $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids));
    };
    $adBody = function (Db $db, $id, $msg = null, $level = 'admin') use ($owners) {
        $a = Ads::row($db, $id);
        $pa = Ads::present($db, [$a], $level)[0];
        $out = ['data' => ['ad' => $pa, 'users' => $owners($db, [$a])], 'patch' => ['upsert' => ['ads' => [$pa]]]];
        if ($msg) {
            $out['msg'] = $msg;
        }
        return $out;
    };

    /* ---------------- üye ---------------- */

    // Takvim: ?type=slider&from=<ms> → 42 günün doluluğu
    $r->get('ads/availability', function (Req $q, Db $db) {
        $from = $q->q('from');
        return ['data' => Ads::availability($db, $q->q('type'), preg_match('/^[0-9]{10,15}$/', $from) ? (int)$from : null)];
    }, ['auth' => 'none', 'csrf' => false]);

    // buyad: {type, dur|days, start, server|_new, srv:{…}, title, text, media:[…]} — bakiyeden, Idempotency-Key zorunlu
    $r->post('ads', function (Req $q, Db $db) use ($adBody) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        RateLimit::enforce('adbuy:' . (int)$u['id'], 10, 600, true, 'Çok fazla rezervasyon denemesi. Lütfen biraz bekleyin.');
        return IdemTx::run($db, $u['id'], $key, 'POST ads', function (Db $db) use ($u, $in, $adBody) {
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $a = Ads::buy($db, $me, $in);
            $b = $adBody($db, $a['id'], $a['status'] === 'onayli' ? 'Reklam eklendi ve onaylandı.' : 'Rezervasyon alındı, yönetici onayına gönderildi.', 'owner');
            $b['patch']['me'] = Present::me($db, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]));
            return $b;
        });
    }, ['auth' => 'user']);

    // Reklamlarım
    $r->get('me/ads', function (Req $q, Db $db) {
        $rows = $db->all('SELECT * FROM {ads} WHERE owner_id=? ORDER BY id DESC LIMIT 100', [(int)Auth::$user['id']]);
        return ['data' => ['ads' => Ads::present($db, $rows, 'owner')]];
    }, ['auth' => 'user', 'csrf' => false]);

    // Gösterim / tıklama: {imp:['a1'], clk:['a2']} (ziyaretçiler dahil; IP başına sınırlı)
    $r->post('ads/events', function (Req $q, Db $db) {
        if (!RateLimit::hit('adev:' . $q->ip, 240, 600)['allowed']) {
            return ['data' => ['n' => 0, 'limited' => true]];
        }
        $in = Api::body($q);
        $n = $db->tx(function (Db $db) use ($in) {
            return Ads::events($db, isset($in['imp']) ? $in['imp'] : [], isset($in['clk']) ? $in['clk'] : []);
        });
        return ['data' => ['n' => $n]];
    }, ['auth' => 'none']);

    /* ---------------- yönetim [reklam] ---------------- */

    // ?status=onay|onayli|red|tumu &type= &q=
    $r->get('admin/ads', function (Req $q, Db $db) use ($owners) {
        $w = '1=1';
        $p = [];
        $st = $q->q('status', 'tumu');
        if (in_array($st, ['onay', 'onayli', 'red'], true)) {
            $w .= ' AND status=?';
            $p[] = $st;
        }
        $t = $q->q('type');
        if ($t !== '' && isset(Ads::packs($db)[$t])) {
            $w .= ' AND type=?';
            $p[] = $t;
        }
        $rows = $db->all('SELECT * FROM {ads} WHERE ' . $w . ' ORDER BY ' . ($st === 'onay' ? 'created_at, id' : 'id DESC') . ' LIMIT 300', $p);
        $counts = [];
        foreach ($db->all('SELECT status, COUNT(*) AS n FROM {ads} GROUP BY status') as $c) {
            $counts[$c['status']] = (int)$c['n'];
        }
        $types = [];
        foreach ($db->all('SELECT type, COUNT(*) AS n FROM {ads} GROUP BY type') as $c) {
            $types[$c['type']] = (int)$c['n'];
        }
        return ['data' => ['ads' => Ads::present($db, $rows, 'admin'), 'users' => $owners($db, $rows), 'counts' => $counts, 'types' => $types,
            'pending' => isset($counts['onay']) ? $counts['onay'] : 0, 'escrow' => \YP\Text::tl(\YP\Money\Ledger::balance($db, 'ESCROW:ADS')),
            'revenue' => \YP\Text::tl(\YP\Money\Ledger::balance($db, 'REV:ads'))]];
    }, ['auth' => 'staff', 'perm' => 'reklam', 'csrf' => false]);

    // ad-detail: günlük istatistikler
    $r->get('admin/ads/{id}', function (Req $q, Db $db) use ($adBody) {
        $a = $db->one('SELECT * FROM {ads} WHERE id=?', [Ads::parseId($q->param('id'))]);
        if (!$a) {
            throw HttpError::notFound('Reklam bulunamadı.');
        }
        $b = $adBody($db, $a['id']);
        $b['data']['stats'] = Ads::stats($db, $a['id']);
        unset($b['patch']);
        return $b;
    }, ['auth' => 'staff', 'perm' => 'reklam', 'csrf' => false]);

    $act = function ($fn, $perm) use ($r, $S, $adBody) {
        return function (Req $q, Db $db) use ($fn, $adBody) {
            $staff = Auth::$user;
            $in = Api::body($q);
            return IdemTx::run($db, $staff['id'], IdemTx::key($q, false), $q->method . ' ' . $q->path, function (Db $db) use ($q, $staff, $in, $fn, $adBody) {
                $a = Ads::lock($db, $q->param('id'));
                list($row, $msg) = $fn($db, $staff, $a, $in);
                return $adBody($db, $row['id'], $msg);
            });
        };
    };
    $r->post('admin/ads/{id}/approve', $act(function (Db $db, $staff, $a) {
        $x = Ads::approve($db, $staff, $a);
        return [$x, 'Reklam onaylandı.'];
    }, 'ad-ok'), $S('ui:act:ad-ok'));
    $r->post('admin/ads/{id}/reject', $act(function (Db $db, $staff, $a, $in) {
        $x = Ads::reject($db, $staff, $a, isset($in['reason']) ? $in['reason'] : '');
        return [$x, 'Reklam reddedildi' . ((int)$a['price'] > 0 ? ', ücret iade edildi.' : '.')];
    }, 'adrej'), $S('ui:form:adrej'));
    $r->post('admin/ads/{id}/toggle', $act(function (Db $db, $staff, $a) {
        $x = Ads::toggle($db, $staff, $a);
        return [$x, (int)$x['active'] ? 'Reklam yayına alındı.' : 'Reklam durduruldu.'];
    }, 'ad-toggle'), $S('ui:act:ad-toggle'));
    $r->post('admin/ads/{id}/extend', $act(function (Db $db, $staff, $a) {
        return [Ads::extend($db, $staff, $a, 7), 'Reklam 7 gün uzatıldı.'];
    }, 'ad-ext'), $S('ui:act:ad-ext'));
    // admediaadd: {media:['m3',…]} (önce POST media kind=ad)
    $r->post('admin/ads/{id}/media', $act(function (Db $db, $staff, $a, $in) {
        return [Ads::mediaAdd($db, $staff, $a, isset($in['media']) ? $in['media'] : []), 'Medya eklendi.'];
    }, 'admediaadd'), $S('ui:chg:admediaadd'));
    $r->delete('admin/ads/{id}/media', $act(function (Db $db, $staff, $a) {
        return [Ads::mediaClear($db, $staff, $a), 'Medya temizlendi.'];
    }, 'ad-media-clear'), $S('ui:act:ad-media-clear'));
    $r->delete('admin/ads/{id}', function (Req $q, Db $db) {
        $staff = Auth::$user;
        return IdemTx::run($db, $staff['id'], IdemTx::key($q, false), 'DELETE ' . $q->path, function (Db $db) use ($q, $staff) {
            $a = Ads::lock($db, $q->param('id'));
            $back = Ads::delete($db, $staff, $a);
            return ['msg' => 'Reklam silindi' . ($back ? ', ' . Rules::tl($back) . ' iade edildi.' : '.'), 'data' => ['id' => 'a' . $a['id'], 'refund' => \YP\Text::tl($back)],
                'patch' => ['remove' => ['ads' => ['a' . $a['id']]]]];
        });
    }, $S('ui:act:ad-del'));

    // packs: {k:{p:[1 gün, 7 gün, 30 gün], cap}}
    $r->put('admin/packs', function (Req $q, Db $db) {
        $in = Api::body($q);
        $P = $db->tx(function (Db $db) use ($in) {
            return Ads::setPacks($db, Auth::$user, isset($in['packs']) ? $in['packs'] : $in);
        });
        return ['msg' => 'Paket fiyatları güncellendi.', 'data' => ['packs' => $P], 'patch' => ['replace' => ['packs' => $P]]];
    }, $S('ui:form:packs'));

    /* ---------------- site görselleri [reklam] ---------------- */

    $r->get('admin/slides', function (Req $q, Db $db) {
        return ['data' => ['slides' => Slides::all($db)]];
    }, ['auth' => 'staff', 'perm' => 'reklam', 'csrf' => false]);
    $slideOut = function (Db $db, $row, $msg) {
        $s = Slides::present($db, [$row])[0];
        return ['msg' => $msg, 'data' => ['slide' => $s], 'patch' => ['upsert' => ['slides' => [$s]]]];
    };
    $r->post('admin/slides', function (Req $q, Db $db) use ($slideOut) {
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($in, $slideOut) {
            return $slideOut($db, Slides::create($db, Auth::$user, $in), 'Site görseli ana sayfa slider\'ına eklendi.');
        });
    }, $S('ui:form:slideadd'));
    $slide = function ($fn) use ($slideOut) {
        return function (Req $q, Db $db) use ($fn, $slideOut) {
            $in = Api::body($q);
            return $db->tx(function (Db $db) use ($q, $in, $fn, $slideOut) {
                $s = Slides::lock($db, $q->param('id'));
                list($row, $msg) = $fn($db, Auth::$user, $s, $in);
                return $slideOut($db, $row, $msg);
            });
        };
    };
    $r->post('admin/slides/{id}/toggle', $slide(function (Db $db, $st, $s) {
        $x = Slides::toggle($db, $st, $s);
        return [$x, (int)$x['is_on'] ? 'Site görseli yayında.' : 'Site görseli kapatıldı.'];
    }), $S('ui:act:slide-toggle'));
    $r->post('admin/slides/{id}/media', $slide(function (Db $db, $st, $s, $in) {
        return [Slides::mediaAdd($db, $st, $s, isset($in['media']) ? $in['media'] : []), 'Görsel eklendi.'];
    }), $S('ui:chg:slidemedia'));
    $r->delete('admin/slides/{id}/media', $slide(function (Db $db, $st, $s) {
        return [Slides::mediaClear($db, $st, $s), 'Görseller temizlendi.'];
    }), $S('ui:act:slide-clear'));
    $r->delete('admin/slides/{id}', function (Req $q, Db $db) {
        return $db->tx(function (Db $db) use ($q) {
            $s = Slides::lock($db, $q->param('id'));
            Slides::delete($db, Auth::$user, $s);
            return ['msg' => 'Site görseli silindi.', 'data' => ['id' => 'sl' . $s['id']], 'patch' => ['remove' => ['slides' => ['sl' . $s['id']]]]];
        });
    }, $S('ui:act:slide-del'));
};
