<?php
/**
 * Canlı destek (PLAN §4 P6). Kurallar: app/src/Support.php
 * Üye (giriş gerekli):
 *   GET  support/ticket?after=<no>&seen=1    açık talep (yoksa null) + destek durumu; after: yalnız yeni iletiler; seen=1: okundu
 *   POST support/messages {x, order?, media?} mesaj (+ isteğe bağlı sipariş no ve görsel: önce POST media kind=support)
 *   POST support/escalate                    temsilciye bağlan
 *   POST support/rate {n}                    kapanan görüşmeyi 1-5 yıldızla değerlendir
 * Yönetim [destek]:
 *   GET  admin/tickets?f=aktif|kapali|hepsi  liste (son iletiyle) + temsilciler + memnuniyet özeti
 *   GET  admin/tickets/{id}?after=<no>       tüm iletiler (iç notlar dahil) + üye kartı; temsilcinin okumadıkları sıfırlanır
 *   POST admin/tickets/{id}/claim | /reply {x, note} | /close | /transfer {to}
 *   GET|PUT admin/settings/support           çalışma saatleri, açık/kapalı, asistan adı, bekleme süresi, kapalı mesajı, hazır yanıtlar
 * Açılış verisi (boot.support) ve yoklama (poll: tk = okunmamış destek iletisi; yönetim kuyruğu: tickets) YP\Hooks ile eklenir.
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
use YP\Perm;
use YP\RateLimit;
use YP\Settings;
use YP\Support;
use YP\V;

return function (Router $r) {
    Hooks::on('boot', function (array $data, Db $db, $u) {
        $data['support'] = Support::publicCfg($db, $u);
        if ($u) {
            $t = Support::current($db, $u['id']);
            $data['unread']['tk'] = $t ? (int)$t['unread_u'] : 0;
        }
        return $data;
    }, 'support');
    Hooks::on('poll', function (array $data, Db $db, $u) {
        $t = Support::current($db, $u['id']);
        $data['unread']['tk'] = $t ? (int)$t['unread_u'] : 0;
        $sc = Support::cfg($db);
        $data['support'] = ['mode' => $sc['mode'], 'open' => Support::isOpen($sc), 'on' => $sc['mode'] !== 'closed'];
        if (Perm::has($u, 'destek')) {
            $data['queues']['tickets'] = (int)$db->val("SELECT COUNT(*) FROM {tickets} WHERE status='bekliyor'");
        }
        return $data;
    }, 'support');
    Hooks::on('admin_queues', function (array $q, Db $db, $u) {
        $q['tickets'] = Perm::has($u, 'destek') ? (int)$db->val("SELECT COUNT(*) FROM {tickets} WHERE status='bekliyor'") : 0;
        return $q;
    }, 'support');

    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $after = function (Req $q, $prefix) {
        $a = $q->q('after');
        return $a !== '' && preg_match('/^' . $prefix . '?([0-9]{1,18})$/', $a, $m) ? (int)$m[1] : 0;
    };

    /* ---------------- üye ---------------- */

    $r->get('support/ticket', function (Req $q, Db $db) use ($after) {
        $u = Auth::$user;
        $t = Support::current($db, $u['id']);
        if ($t && $q->q('seen') === '1' && (int)$t['unread_u'] > 0) {
            $db->exec('UPDATE {tickets} SET unread_u=0 WHERE id=?', [(int)$t['id']]);
            $t['unread_u'] = 0;
        }
        return ['data' => ['ticket' => $t ? Support::present($db, $t, 'member', $after($q, 'tm')) : null, 'support' => Support::publicCfg($db, $u),
            'agents' => $t && $t['agent_id'] ? Support::users($db, [$t['agent_id']], false) : []]];
    }, ['auth' => 'user', 'csrf' => false]);

    $r->post('support/messages', function (Req $q, Db $db) {
        $u = Auth::$user;
        RateLimit::enforce('chat:' . (int)$u['id'], 20, 60, true, 'Çok hızlı mesaj gönderiyorsunuz. Lütfen biraz bekleyin.');
        $in = $q->body();
        $x = isset($in['x']) && is_string($in['x']) ? $in['x'] : '';
        $ref = Support::orderRef($db, $u['id'], isset($in['order']) && is_string($in['order']) ? $in['order'] : '');
        $media = null;
        if (!empty($in['media'])) {
            $media = $db->one("SELECT * FROM {media} WHERE id=? AND kind='support' AND owner_id=? AND ref_type=''", [Ids::media($in['media']), (int)$u['id']]);
            if (!$media) {
                throw HttpError::validation(['media' => 'Görsel bulunamadı; yeniden yükleyin.']);
            }
        }
        $res = Support::send($db, $u, $x, $ref, $media);
        $db->exec('UPDATE {tickets} SET unread_u=0 WHERE id=?', [(int)$res['ticket']['id']]);
        $t = Support::row($db, $res['ticket']['id']);
        $out = ['data' => ['ticket' => Support::present($db, $t, 'member'), 'flagged' => $res['flagged']]];
        if ($res['flagged']) {
            $out['msg'] = 'İletişim bilgisi gizlendi. Güvenliğiniz için site dışı iletişim paylaşmayın.';
        }
        return $out;
    });

    $r->post('support/escalate', function (Req $q, Db $db) {
        $u = Auth::$user;
        RateLimit::enforce('chat:' . (int)$u['id'], 20, 60, true, 'Çok hızlı istek gönderiyorsunuz. Lütfen biraz bekleyin.');
        $t = $db->tx(function (Db $db) use ($u) {
            $t = Support::open($db, $u);
            Support::escalate($db, $t);
            $db->exec('UPDATE {tickets} SET unread_u=0 WHERE id=?', [(int)$t['id']]);
            return Support::row($db, $t['id']);
        });
        return ['data' => ['ticket' => Support::present($db, $t, 'member')]];
    });

    $r->post('support/rate', function (Req $q, Db $db) {
        $in = $q->body();
        $t = Support::rate($db, Auth::$user, isset($in['n']) && is_scalar($in['n']) ? $in['n'] : 0);
        return ['msg' => 'Değerlendirmeniz için teşekkürler.', 'data' => ['ticket' => Support::present($db, $t, 'member')]];
    });

    /* ---------------- yönetim [destek] ---------------- */

    $agents = function (Db $db) {
        $rows = $db->all("SELECT * FROM {users} WHERE role IN ('staff','admin') AND status='active' ORDER BY role='admin' DESC, name");
        $out = [];
        foreach ($rows as $s) {
            if (Perm::has($s, 'destek')) {
                $out[] = ['id' => Ids::u($s['id']), 'name' => $s['name']];
            }
        }
        return $out;
    };

    $r->get('admin/tickets', function (Req $q, Db $db) use ($agents) {
        $f = in_array($q->q('f'), ['aktif', 'kapali', 'hepsi'], true) ? $q->q('f') : 'aktif';
        $where = $f === 'aktif' ? "status<>'kapandi'" : ($f === 'kapali' ? "status='kapandi'" : '1=1');
        $rows = $db->all('SELECT * FROM {tickets} WHERE ' . $where . " ORDER BY status='bekliyor' DESC, last_at DESC LIMIT 200");
        $L = array_map(function ($t) use ($db) {
            return Support::present($db, $t, 'staff', 0, 1);
        }, $rows);
        $cnt = ['aktif' => (int)$db->val("SELECT COUNT(*) FROM {tickets} WHERE status<>'kapandi'"), 'kapali' => (int)$db->val("SELECT COUNT(*) FROM {tickets} WHERE status='kapandi'")];
        $cnt['hepsi'] = $cnt['aktif'] + $cnt['kapali'];
        $rt = $db->one('SELECT COUNT(*) AS n, AVG(rating) AS a FROM {tickets} WHERE rating>0');
        $dist = [];
        foreach ($db->all('SELECT rating, COUNT(*) AS n FROM {tickets} WHERE rating>0 GROUP BY rating') as $x) {
            $dist[(string)(int)$x['rating']] = (int)$x['n'];
        }
        $byAgent = [];
        foreach ($db->all('SELECT t.agent_id, u.name, COUNT(*) AS n, AVG(t.rating) AS a FROM {tickets} t JOIN {users} u ON u.id=t.agent_id WHERE t.rating>0 GROUP BY t.agent_id, u.name ORDER BY n DESC LIMIT 20') as $x) {
            $byAgent[] = ['id' => Ids::u($x['agent_id']), 'name' => $x['name'], 'n' => (int)$x['n'], 'avg' => round((float)$x['a'], 2)];
        }
        $ids = array_merge(array_column($rows, 'user_id'), array_column($rows, 'agent_id'));
        return ['data' => ['tickets' => $L, 'counts' => $cnt, 'waiting' => (int)$db->val("SELECT COUNT(*) FROM {tickets} WHERE status='bekliyor'"),
            'users' => Support::users($db, $ids, Perm::has(Auth::$user, 'uye')), 'agents' => $agents($db),
            'rating' => ['n' => (int)$rt['n'], 'avg' => $rt['n'] ? round((float)$rt['a'], 2) : null, 'dist' => $dist, 'byAgent' => $byAgent],
            'support' => Support::publicCfg($db, Auth::$user)]];
    }, $S('destek'));

    $detail = function (Db $db, $t, $afterId = 0) {
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$t['user_id']]);
        $orders = array_map(function ($o) use ($t) {
            return ['id' => \YP\Money\View::orderId($o['id']), 'title' => $o['title'], 'status' => $o['status'], 'mine' => (int)$o['buyer_id'] === (int)$t['user_id'] ? 'aldı' : 'sattı', 't' => (int)$o['created_at']];
        }, $db->all('SELECT id, title, status, buyer_id, created_at FROM {orders} WHERE buyer_id=? OR seller_id=? ORDER BY id DESC LIMIT 5', [(int)$t['user_id'], (int)$t['user_id']]));
        return ['ticket' => Support::present($db, $t, 'staff', $afterId), 'users' => Support::users($db, array_filter([$t['user_id'], $t['agent_id']]), Perm::has(Auth::$user, 'uye')),
            'orders' => $orders];
    };

    $r->get('admin/tickets/{id}', function (Req $q, Db $db) use ($detail, $after) {
        $t = Support::row($db, Support::tid($q->param('id')));
        if ((int)$t['unread_s'] > 0 && ((int)$t['agent_id'] === (int)Auth::$user['id'] || !$t['agent_id'])) {
            $db->exec('UPDATE {tickets} SET unread_s=0 WHERE id=?', [(int)$t['id']]);
            $t['unread_s'] = 0;
        }
        return ['data' => $detail($db, $t, $after($q, 'tm'))];
    }, $S('destek'));

    $r->post('admin/tickets/{id}/claim', function (Req $q, Db $db) use ($detail) {
        $t = Support::claim($db, Auth::$user, Support::tid($q->param('id')));
        Audit::log($db, Auth::$user['id'], 'ticket_claim', 'ticket', $t['id']);
        return ['msg' => 'Görüşmeyi üstlendiniz.', 'data' => $detail($db, $t)];
    }, $S('ui:act:tk-claim'));

    $r->post('admin/tickets/{id}/reply', function (Req $q, Db $db) use ($detail) {
        $in = $q->body();
        $t = Support::reply($db, Auth::$user, Support::tid($q->param('id')), isset($in['x']) && is_string($in['x']) ? $in['x'] : '', !empty($in['note']) && yp_bool($in['note']));
        return ['data' => $detail($db, $t)];
    }, $S('ui:form:tkreply'));

    $r->post('admin/tickets/{id}/close', function (Req $q, Db $db) use ($detail) {
        $t = Support::close($db, Auth::$user, Support::tid($q->param('id')));
        Audit::log($db, Auth::$user['id'], 'ticket_close', 'ticket', $t['id']);
        return ['msg' => 'Görüşme kapatıldı; üyeden değerlendirme istendi.', 'data' => $detail($db, $t)];
    }, $S('ui:act:tk-close'));

    $r->post('admin/tickets/{id}/transfer', function (Req $q, Db $db) use ($detail) {
        $in = $q->body();
        $t = Support::transfer($db, Auth::$user, Support::tid($q->param('id')), isset($in['to']) ? $in['to'] : '');
        Audit::log($db, Auth::$user['id'], 'ticket_transfer', 'ticket', $t['id'], ['to' => $t['agent_id']]);
        return ['msg' => 'Görüşme aktarıldı.', 'data' => $detail($db, $t)];
    }, $S('ui:chg:tkxfer'));

    $r->get('admin/settings/support', function (Req $q, Db $db) {
        return ['data' => ['support' => Support::publicCfg($db, Auth::$user) + ['canned' => Support::cfg($db)['canned']]]];
    }, $S('destek'));

    $r->put('admin/settings/support', function (Req $q, Db $db) {
        $in = $q->body();
        $v = new V($in);
        $old = Support::cfg($db);
        $new = $old;
        $new['mode'] = $v->oneOf('mode', ['auto', 'open', 'closed'], $old['mode']);
        if ($v->has('hours')) {
            $h = is_array($in['hours']) ? $in['hours'] : [];
            $rx = '/^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/';
            foreach (range(0, 6) as $d) {
                $x = isset($h[$d]) ? $h[$d] : (isset($h[(string)$d]) ? $h[(string)$d] : null);
                if (!is_array($x) || count($x) < 3 || !is_string($x[0]) || !is_string($x[1]) || !preg_match($rx, $x[0]) || !preg_match($rx, $x[1])) {
                    $v->err('hours', 'Çalışma saatlerini SS:DD biçiminde yazın (ör. 09:00 – 24:00).');
                    break;
                }
                $new['hours'][(string)$d] = [$x[0], $x[1], yp_bool($x[2])];
            }
        }
        if ($v->has('aiName')) {
            $new['aiName'] = $v->str('aiName', 1, 40) ?: 'Asistan';
        }
        if ($v->has('wait')) {
            $new['wait'] = $v->str('wait', 0, 20);
        }
        if ($v->has('offline')) {
            $new['offline'] = $v->str('offline', 0, 400);
        }
        if ($v->has('canned')) {
            $c = [];
            foreach (is_array($in['canned']) ? $in['canned'] : [] as $x) {
                if (is_array($x) && count($x) >= 2 && is_string($x[0]) && is_string($x[1]) && trim($x[0]) !== '' && trim($x[1]) !== '') {
                    $c[] = [yp_str(trim($x[0]), 60), yp_str(trim($x[1]), 600)];
                }
            }
            if (count($c) > 40) {
                $v->err('canned', 'En fazla 40 hazır yanıt kaydedebilirsiniz.');
            }
            $new['canned'] = array_slice($c, 0, 40);
        }
        $v->done();
        $new['ai'] = false;
        Settings::set('support', $new, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_support', 'settings', 'support', ['mode' => $new['mode'], 'canned' => count($new['canned'])]);
        return ['msg' => 'Destek ayarları kaydedildi.', 'data' => ['support' => Support::publicCfg($db, Auth::$user)]];
    }, $S('ui:form:supportset'));
};
