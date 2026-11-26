<?php
/**
 * Üyeden üyeye mesajlar ve engellenen mesajlar (PLAN §4 P6). Kurallar: app/src/Dm.php, app/src/Censor.php
 *   GET  dm                       konuşmalar (son iletiyle) + karşı taraflar (herkese açık alanlar) + okunmamış konuşma sayısı
 *   GET  dm/{peer}?after=<no>     konuşma (okundu işaretlenir); after: yalnız yeni iletiler (yoklama)
 *   POST dm/{peer} {x, listing?}  mesaj; sansür + engellenen mesaj kaydı, hız sınırı
 * Yönetim [mesaj]:
 *   GET  admin/flagged?f=yeni|tumu&q=   sansürlenen orijinal metinler
 *   POST admin/flagged/{id}/seen        incelendi
 *   POST admin/flagged/seen-all {q?}    (aramaya uyan) tümü incelendi
 * Yoklama (poll) okunmamış konuşma sayısını (unread.dm) ve [mesaj] yetkilisine kuyruk sayısını (queues.flagged) ekler.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Dm;
use YP\Hooks;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Perm;
use YP\Present;
use YP\Text;

return function (Router $r) {
    Hooks::on('boot', function (array $data, Db $db, $u) {
        if ($u) {
            $data['unread']['dm'] = Dm::unreadCount($db, $u['id']);
        }
        return $data;
    }, 'dm');
    Hooks::on('poll', function (array $data, Db $db, $u) {
        $data['unread']['dm'] = Dm::unreadCount($db, $u['id']);
        if (Perm::has($u, 'mesaj')) {
            $data['queues']['flagged'] = (int)$db->val('SELECT COUNT(*) FROM {flagged} WHERE seen=0');
        }
        return $data;
    }, 'dm');
    // admin/today zaten 'flagged' sayıyor (30_admin.php); yalnız [mesaj] yetkilisine gösterilsin
    Hooks::on('admin_queues', function (array $q, Db $db, $u) {
        if (!Perm::has($u, 'mesaj')) {
            $q['flagged'] = 0;
        }
        return $q;
    }, 'dm');

    $pubUsers = function (Db $db, array $ids) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) {
            return [];
        }
        return array_map([Present::class, 'publicUser'], $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids));
    };

    $r->get('dm', function (Req $q, Db $db) use ($pubUsers) {
        $u = Auth::$user;
        list($threads, $peers) = Dm::inbox($db, $u);
        return ['data' => ['dms' => $threads, 'users' => $pubUsers($db, $peers), 'unread' => Dm::unreadCount($db, $u['id'])]];
    }, ['auth' => 'user', 'csrf' => false]);

    $r->get('dm/{peer}', function (Req $q, Db $db) use ($pubUsers) {
        $u = Auth::$user;
        $p = Dm::peer($db, $u, $q->param('peer'));
        $a = $q->q('after');
        $after = $a !== '' && preg_match('/^(?:dmm)?([0-9]{1,18})$/', $a, $m) ? (int)$m[1] : 0;
        $th = Dm::conversation($db, $u, $p, $after);
        $L = $th ? array_values(array_filter(array_map(function ($m) {
            return isset($m['l']) ? Ids::listing($m['l']) : null;
        }, $th['msgs']))) : [];
        return ['data' => ['dm' => $th, 'users' => $pubUsers($db, [$p['id']]), 'unread' => Dm::unreadCount($db, $u['id']), 'listings' => $L ? \YP\Catalog::presentMany($db,
            $db->all('SELECT * FROM {listings} WHERE id IN (' . implode(',', array_fill(0, count($L), '?')) . ')', $L))[0] : []]];
    }, ['auth' => 'user', 'csrf' => false]);

    $r->post('dm/{peer}', function (Req $q, Db $db) {
        $u = Auth::$user;
        $p = Dm::peer($db, $u, $q->param('peer'));
        $in = $q->body();
        $res = Dm::send($db, $u, $p, isset($in['x']) && is_string($in['x']) ? $in['x'] : '', isset($in['listing']) && is_scalar($in['listing']) ? (string)$in['listing'] : null);
        $out = ['data' => ['msg' => Dm::presentMsg($res['msg']), 'dm' => Dm::presentThread($res['thread'], $u['id'], [$res['msg']], $res['msg']), 'flagged' => $res['flagged']]];
        if ($res['flagged']) {
            $out['msg'] = 'İletişim bilgisi gizlendi. Site dışı ticarette havuz güvencesi yoktur.';
        }
        return $out;
    });

    /* ---------------- yönetim [mesaj] ---------------- */

    $flagWhere = function (Req $q, array &$p, $onlyNew) {
        $w = [$onlyNew ? 'f.seen=0' : '1=1'];
        $s = trim(yp_str($q instanceof Req ? $q->q('q') : '', 60));
        if ($s !== '') {
            $like = '%' . Text::likeEscape(Text::fold($s)) . '%';
            $w[] = "(u.name_norm LIKE ? ESCAPE '!' OR f.orig LIKE ? ESCAPE '!')";
            array_push($p, $like, '%' . Text::likeEscape($s) . '%');
        }
        return implode(' AND ', $w);
    };

    $r->get('admin/flagged', function (Req $q, Db $db) use ($flagWhere) {
        $f = $q->q('f') === 'yeni' ? 'yeni' : 'tumu';
        $p = [];
        $rows = $db->all('SELECT f.* FROM {flagged} f LEFT JOIN {users} u ON u.id=f.user_id WHERE ' . $flagWhere($q, $p, $f === 'yeni') . ' ORDER BY f.id DESC LIMIT 300', $p);
        $p2 = [];
        $base = $flagWhere($q, $p2, false);
        $cnt = $db->one('SELECT COUNT(*) AS n, SUM(CASE WHEN f.seen=0 THEN 1 ELSE 0 END) AS y FROM {flagged} f LEFT JOIN {users} u ON u.id=f.user_id WHERE ' . $base, $p2);
        $ids = array_values(array_unique(array_filter(array_map('intval', array_column($rows, 'user_id')))));
        $canSee = Perm::has(Auth::$user, 'uye');
        $users = $ids ? array_map(function ($x) use ($db, $canSee) {
            return $canSee ? Present::staffUser($db, $x) : Present::publicUser($x);
        }, $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids)) : [];
        return ['data' => ['flagged' => array_map(function ($x) {
            return ['id' => 'f' . (int)$x['id'], 'u' => Ids::u($x['user_id']), 'ctx' => $x['ctx'], 'orig' => $x['orig'], 'seen' => (bool)(int)$x['seen'], 't' => (int)$x['t']];
        }, $rows), 'users' => $users, 'counts' => ['tumu' => (int)$cnt['n'], 'yeni' => (int)$cnt['y']],
            'pending' => (int)$db->val('SELECT COUNT(*) FROM {flagged} WHERE seen=0')]];
    }, ['auth' => 'staff', 'perm' => 'mesaj']);

    $r->post('admin/flagged/seen-all', function (Req $q, Db $db) use ($flagWhere) {
        $in = $q->body();
        $fake = new Req('GET', 'x', ['q' => isset($in['q']) && is_string($in['q']) ? $in['q'] : '']);
        $p = [];
        $ids = array_map('intval', array_column($db->all('SELECT f.id FROM {flagged} f LEFT JOIN {users} u ON u.id=f.user_id WHERE ' . $flagWhere($fake, $p, true) . ' LIMIT 2000', $p), 'id'));
        $n = 0;
        foreach (array_chunk($ids, 500) as $ch) {
            $n += $db->exec('UPDATE {flagged} SET seen=1 WHERE seen=0 AND id IN (' . implode(',', array_fill(0, count($ch), '?')) . ')', $ch);
        }
        Audit::log($db, Auth::$user['id'], 'flagged_seen_all', 'flagged', '', ['n' => $n]);
        return ['msg' => $n . ' mesaj incelendi olarak işaretlendi.', 'data' => ['n' => $n, 'pending' => (int)$db->val('SELECT COUNT(*) FROM {flagged} WHERE seen=0')]];
    }, ['auth' => 'staff', 'perm' => 'ui:act:fl-seen-all']);

    $r->post('admin/flagged/{id}/seen', function (Req $q, Db $db) {
        $id = Ids::parse($q->param('id'), 'f');
        if (!$db->val('SELECT id FROM {flagged} WHERE id=?', [$id])) {
            throw HttpError::notFound('Kayıt bulunamadı.');
        }
        $db->exec('UPDATE {flagged} SET seen=1 WHERE id=?', [$id]);
        return ['data' => ['id' => 'f' . $id, 'pending' => (int)$db->val('SELECT COUNT(*) FROM {flagged} WHERE seen=0')]];
    }, ['auth' => 'staff', 'perm' => 'ui:act:fl-seen']);
};
