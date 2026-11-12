<?php
/**
 * Yönetim: çalışanlar ve yetkileri, üyeler (liste/arama/doğrula/yasakla), Bugün, komut paleti araması (PLAN §4 P0).
 * Yetki: 'ui:…' anahtarları PermMap'ten (ön yüzdeki ADM_ACT / ADM_FORM) çözülür.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Notify;
use YP\Perm;
use YP\PermMap;
use YP\Present;
use YP\Text;
use YP\V;

return function (Router $r) {
    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $load = function (Db $db, $id) {
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [Ids::user($id)]);
        if (!$u) {
            throw HttpError::notFound('Üye bulunamadı.');
        }
        return $u;
    };

    /* ---------------- Çalışanlar ---------------- */

    $r->get('admin/staff', function (Req $q, Db $db) {
        $rows = $db->all("SELECT * FROM {users} WHERE role IN ('staff','admin') ORDER BY role='admin' DESC, id");
        return ['data' => [
            'staff' => array_map(function ($u) use ($db) {
                return Present::staffUser($db, $u);
            }, $rows),
            'permLabels' => PermMap::PERMS, 'permGroups' => PermMap::GROUPS,
        ]];
    }, $S('calisan'));

    $r->post('admin/staff', function (Req $q, Db $db) use ($load) {
        $actor = Auth::$user;
        $in = $q->body();
        $perms = Perm::grant($actor, [], isset($in['perms']) ? $in['perms'] : []);
        $now = yp_now_ms();
        if (!empty($in['existing'])) {
            $t = $load($db, $in['existing']);
            if ($t['role'] !== 'member') {
                throw HttpError::conflict($t['name'] . ' zaten çalışan.');
            }
            if ($t['status'] !== 'active') {
                throw HttpError::conflict('Askıdaki bir hesap çalışan yapılamaz.');
            }
            $db->update('users', ['role' => 'staff', 'perms' => json_encode($perms)], 'id=?', [(int)$t['id']]);
            Auth::bumpSessionVer($db, $t['id']); // çalışan oturum kuralları (2 saat) hemen geçerli olsun
            Audit::log($db, $actor['id'], 'staff_add', 'user', $t['id'], ['perms' => $perms, 'existing' => true]);
            Notify::send($db, $t['id'], 'Hesabınıza çalışan yetkisi verildi. Lütfen yeniden giriş yapın.', '#yonetim');
            $t = $load($db, $t['id']);
            return ['msg' => $t['name'] . ' artık çalışan.', 'data' => ['user' => Present::staffUser($db, $t)]];
        }
        $v = new V($in);
        $name = $v->str('name', 3, 20, V::RX_NAME, 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi kullanın.');
        $email = $v->email('email');
        $tel = $v->tel('tel', false);
        $ad = $v->str('ad', 2, 40, V::RX_PERSON, 'Ad ve soyadı yalnızca harflerle yazın.');
        $soyad = $v->str('soyad', 2, 40, V::RX_PERSON, 'Ad ve soyadı yalnızca harflerle yazın.');
        $pass = $v->password('password', 10);
        $v->done();
        $norm = Text::fold($name);
        if ($db->val('SELECT id FROM {users} WHERE name_norm=?', [$norm])) {
            throw HttpError::validation(['name' => 'Bu kullanıcı adı alınmış.']);
        }
        if ($db->val('SELECT id FROM {users} WHERE email=?', [$email])) {
            throw HttpError::validation(['email' => 'Bu e-posta ile kayıtlı bir hesap var.']);
        }
        $id = $db->tx(function (Db $db) use ($name, $norm, $email, $tel, $ad, $soyad, $pass, $perms, $now) {
            $id = $db->insert('users', [
                'name' => $name, 'name_norm' => $norm, 'email' => $email, 'tel' => (string)$tel, 'ad' => $ad, 'soyad' => $soyad,
                'pass_hash' => Auth::hash($pass), 'role' => 'staff', 'perms' => json_encode($perms), 'status' => 'active',
                'verified' => 1, 'joined_at' => $now, 'ref_code' => Text::refCode($name), 'session_ver' => 1, 'created_at' => $now,
            ]);
            $db->insert('wallets', ['user_id' => $id, 'cash' => 0, 'credit' => 0, 'updated_at' => $now]);
            return $id;
        });
        Audit::log($db, $actor['id'], 'staff_add', 'user', $id, ['perms' => $perms]);
        return ['msg' => 'Çalışan eklendi. Kullanıcı adı ve şifresiyle giriş yapabilir.', 'data' => ['user' => Present::staffUser($db, $load($db, $id))]];
    }, $S('ui:form:staffadd'));

    $r->put('admin/staff/{id}', function (Req $q, Db $db) use ($load) {
        $actor = Auth::$user;
        $t = $load($db, $q->param('id'));
        if ($t['role'] === 'admin') {
            throw HttpError::forbidden('Yöneticinin yetkileri değiştirilemez.');
        }
        if ($t['role'] !== 'staff') {
            throw HttpError::conflict($t['name'] . ' çalışan değil.');
        }
        $in = $q->body();
        $perms = Perm::grant($actor, Perm::of($t), isset($in['perms']) ? $in['perms'] : null);
        $db->update('users', ['perms' => json_encode($perms)], 'id=?', [(int)$t['id']]);
        Audit::log($db, $actor['id'], 'staff_perm', 'user', $t['id'], ['from' => Perm::of($t), 'to' => $perms]);
        return ['msg' => $t['name'] . ' yetkileri kaydedildi.', 'data' => ['user' => Present::staffUser($db, $load($db, $t['id']))]];
    }, $S('ui:form:staffperm'));

    $r->delete('admin/staff/{id}', function (Req $q, Db $db) use ($load) {
        $actor = Auth::$user;
        $t = $load($db, $q->param('id'));
        if ($t['role'] === 'admin') {
            throw HttpError::forbidden('Yönetici hesabı çalışanlıktan çıkarılamaz.');
        }
        if ($t['role'] !== 'staff') {
            throw HttpError::conflict($t['name'] . ' çalışan değil.');
        }
        if ((int)$t['id'] === (int)$actor['id']) {
            throw HttpError::forbidden('Kendinizi çalışanlıktan çıkaramazsınız.');
        }
        if (!Perm::isAdmin($actor) && array_diff(Perm::of($t), Perm::of($actor))) {
            throw HttpError::forbidden('Sizde olmayan yetkilere sahip bir çalışanı kaldıramazsınız.');
        }
        $db->update('users', ['role' => 'member', 'perms' => null], 'id=?', [(int)$t['id']]);
        Auth::bumpSessionVer($db, $t['id']);
        Audit::log($db, $actor['id'], 'staff_del', 'user', $t['id'], ['perms' => Perm::of($t)]);
        return ['msg' => $t['name'] . ' artık çalışan değil.'];
    }, $S('ui:act:staff-del'));

    /* ---------------- Üyeler ---------------- */

    $r->get('admin/users', function (Req $q, Db $db) {
        $limit = max(1, min(100, (int)$q->q('limit', '50')));
        $where = ['1=1'];
        $p = [];
        $after = $q->q('after');
        if ($after !== '') {
            $where[] = 'id<?';
            $p[] = Ids::user($after);
        }
        $f = $q->q('f');
        if ($f === 'staff') {
            $where[] = "role IN ('staff','admin')";
        } elseif ($f === 'banned') {
            $where[] = "status='banned'";
        } elseif ($f === 'unverified') {
            $where[] = 'verified=0';
        }
        $s = trim($q->q('q'));
        if ($s !== '') {
            $s = yp_str($s, 60);
            $like = '%' . Text::likeEscape(Text::fold($s)) . '%';
            $digits = preg_replace('/\D/', '', $s);
            $or = ["name_norm LIKE ? ESCAPE '!'", "email LIKE ? ESCAPE '!'"];
            array_push($p, $like, '%' . Text::likeEscape(strtolower($s)) . '%');
            if (strlen($digits) >= 4) {
                $or[] = "REPLACE(tel,' ','') LIKE ?";
                $p[] = '%' . $digits . '%';
            }
            if (preg_match('/^u?([1-9][0-9]{0,17})$/i', $s, $m)) {
                $or[] = 'id=?';
                $p[] = (int)$m[1];
            }
            $where[] = '(' . implode(' OR ', $or) . ')';
        }
        $rows = $db->all('SELECT * FROM {users} WHERE ' . implode(' AND ', $where) . ' ORDER BY id DESC LIMIT ' . ($limit + 1), $p);
        $more = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        return ['data' => [
            'users' => array_map(function ($u) use ($db) {
                return Present::staffUser($db, $u);
            }, $rows),
            'next' => $more ? Ids::u(end($rows)['id']) : null,
        ]];
    }, $S(['uye', 'ara']));

    $r->get('admin/users/{id}', function (Req $q, Db $db) use ($load) {
        $u = $load($db, $q->param('id'));
        $out = Present::staffUser($db, $u);
        $out['ibans'] = array_map([Present::class, 'iban'],
            $db->all('SELECT id, bank, holder, iban_last4, iban_enc FROM {user_ibans} WHERE user_id=? ORDER BY id', [(int)$u['id']]));
        return ['data' => ['user' => $out]];
    }, $S('uye'));

    $r->post('admin/users/{id}/verify', function (Req $q, Db $db) use ($load) {
        $actor = Auth::$user;
        $t = $load($db, $q->param('id'));
        $in = $q->body();
        $on = array_key_exists('verified', $in) ? yp_bool($in['verified']) : !(int)$t['verified'];
        $db->update('users', ['verified' => $on ? 1 : 0], 'id=?', [(int)$t['id']]);
        Audit::log($db, $actor['id'], $on ? 'user_verify' : 'user_unverify', 'user', $t['id']);
        return ['msg' => $t['name'] . ($on ? ' doğrulandı.' : ' doğrulaması kaldırıldı.'), 'data' => ['user' => Present::staffUser($db, $load($db, $t['id']))]];
    }, $S('ui:act:u-ver'));

    $r->post('admin/users/{id}/ban', function (Req $q, Db $db) use ($load) {
        $actor = Auth::$user;
        $t = $load($db, $q->param('id'));
        if ((int)$t['id'] === (int)$actor['id']) {
            throw HttpError::forbidden('Kendi hesabınızı askıya alamazsınız.');
        }
        if ($t['role'] === 'admin' || ($t['role'] === 'staff' && !Perm::isAdmin($actor))) {
            throw HttpError::forbidden('Çalışan hesaplarını yalnız yönetici askıya alabilir.');
        }
        $in = $q->body();
        $ban = array_key_exists('banned', $in) ? yp_bool($in['banned']) : $t['status'] !== 'banned';
        $db->update('users', ['status' => $ban ? 'banned' : 'active'], 'id=?', [(int)$t['id']]);
        if ($ban) {
            Auth::bumpSessionVer($db, $t['id']); // açık oturumlar hemen düşer
        }
        Audit::log($db, $actor['id'], $ban ? 'user_ban' : 'user_unban', 'user', $t['id'], ['reason' => yp_str(isset($in['reason']) ? $in['reason'] : '', 200)]);
        return ['msg' => $t['name'] . ($ban ? ' askıya alındı.' : ' hesabı yeniden açıldı.'), 'data' => ['user' => Present::staffUser($db, $load($db, $t['id']))]];
    }, $S('ui:act:u-ban'));

    /* ---------------- Bugün ve arama ---------------- */

    // İş kuyruğu sayıları her çalışana açık; gelir/KPI alanları yalnız [panel] yetkisiyle (ön yüzdeki PERMS.panel açıklaması)
    $r->get('admin/today', function (Req $q, Db $db) {
        $u = Auth::$user;
        $day = (new \DateTime('today', new \DateTimeZone('Europe/Istanbul')))->getTimestamp() * 1000;
        $out = [
            // P2: bekleyen elle yükleme bildirimleri, teslim bekleyen ve itirazlı siparişler
            'queues' => ['deps' => (int)$db->val("SELECT COUNT(*) FROM {deposits} WHERE status='bekliyor' AND gw IN (SELECT id FROM {gateways} WHERE manual=1)"),
                'wd' => 0, 'orders' => (int)$db->val("SELECT COUNT(*) FROM {orders} WHERE status='odendi'"),
                'disputes' => (int)$db->val("SELECT COUNT(*) FROM {orders} WHERE status='itiraz'"), 'tickets' => 0, 'ex' => 0,
                'listings' => (int)$db->val("SELECT COUNT(*) FROM {listings} WHERE status='beklemede'"),
                'flagged' => (int)$db->val('SELECT COUNT(*) FROM {flagged} WHERE seen=0')],
            'outbox' => ['queued' => (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE status='queued'"),
                         'failed' => (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE status='failed'")],
        ];
        if (Perm::has($u, 'panel')) {
            $out['kpi'] = [
                'users' => (int)$db->val('SELECT COUNT(*) FROM {users}'),
                'newToday' => (int)$db->val('SELECT COUNT(*) FROM {users} WHERE created_at>=?', [$day]),
                'online' => (int)$db->val('SELECT COUNT(*) FROM {users} WHERE last_seen>=?', [yp_now_ms() - 300000]),
                'staff' => (int)$db->val("SELECT COUNT(*) FROM {users} WHERE role IN ('staff','admin')"),
                'banned' => (int)$db->val("SELECT COUNT(*) FROM {users} WHERE status='banned'"),
                'revenue' => 0, 'orders' => 0, 'volume' => 0, // P2'de dolacak
            ];
        }
        return ['data' => $out];
    }, $S('staff'));

    $r->get('admin/search', function (Req $q, Db $db) {
        $s = yp_str(trim($q->q('q')), 60);
        $users = [];
        if (yp_strlen($s) >= 2) {
            $like = '%' . Text::likeEscape(Text::fold($s)) . '%';
            $users = $db->all("SELECT * FROM {users} WHERE name_norm LIKE ? ESCAPE '!' OR email LIKE ? ESCAPE '!' ORDER BY id DESC LIMIT 8",
                [$like, '%' . Text::likeEscape(strtolower($s)) . '%']);
        }
        $canSee = Perm::has(Auth::$user, 'uye');
        $listings = [];
        if (yp_strlen($s) >= 2) {
            list($rows) = \YP\Catalog::query($db, ['q' => $s, 'status' => ['aktif', 'beklemede', 'satildi', 'kaldirildi']], 8);
            list($listings) = \YP\Catalog::presentMany($db, $rows);
        }
        return ['data' => [
            'users' => array_map(function ($u) use ($db, $canSee) {
                return $canSee ? Present::staffUser($db, $u) : Present::publicUser($u);
            }, $users),
            'orders' => [], 'listings' => $listings, 'withdrawals' => [], // P2–P3
        ]];
    }, $S('ara'));
};
