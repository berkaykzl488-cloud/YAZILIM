<?php
/**
 * EP mağazası (PLAN §4 P4).
 *   GET  ep/products                     satıştaki paketler (stok adedi; kod yok)
 *   POST ep/orders {product}             satın al (Idempotency-Key ZORUNLU) → kod yalnız bu yanıtta ve Hesabım › EP kodlarım'da
 *   GET  me/ep-orders                    EP kodlarım (kodlar açık — yalnız sahibine)
 * Yönetim [ep]:
 *   GET  admin/ep/products · POST admin/ep/products {srv, ep, price, codes} · PUT admin/ep/products/{id} {srv, ep, price, hh, v, codes}
 *   POST admin/ep/products/{id}/toggle · DELETE admin/ep/products/{id} · DELETE admin/ep/codes/{id}
 *   PUT  admin/settings/hh {on, pct, until} · GET admin/ep/log?g= (kodlar maskeli) · GET admin/ep/orders/{id}/code (kodu aç, audit)
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Catalog;
use YP\Db;
use YP\Exchange\Ep;
use YP\Exchange\Exchange;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Money\Api;
use YP\Money\IdemTx;
use YP\Money\Rules;
use YP\RateLimit;
use YP\Text;

return function (Router $r) {
    $S = function ($perm, $csrf = true) {
        return ['auth' => 'staff', 'perm' => $perm, 'csrf' => $csrf];
    };

    $r->get('ep/products', function (Req $q, Db $db) {
        return ['data' => ['epProducts' => Ep::publicProducts($db), 'hh' => Ep::hh($db), 'hhOn' => Ep::hhOn($db)]];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->post('ep/orders', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        RateLimit::enforce('epbuy:' . (int)$u['id'], 30, 60, true, 'Çok hızlı işlem yapıyorsunuz. Lütfen biraz bekleyin.');
        // Yanıt idempotency_keys tablosuna KODSUZ yazılır; kod, işlem bittikten sonra (yeniden oynatmada da) sahibine eklenir.
        $body = IdemTx::run($db, $u['id'], $key, 'POST ep/orders', function (Db $db) use ($u, $in) {
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $o = Ep::buy($db, $me, isset($in['product']) ? $in['product'] : (isset($in['id']) ? $in['id'] : ''));
            $p = Ep::presentOrders($db, [$o], 'mask')[0];
            $p['code'] = '';
            $prod = Ep::publicProducts($db);
            return ['msg' => Rules::num($p['epShown']) . ' EP kodunuz teslim edildi.', 'data' => ['order' => $p, 'epProducts' => $prod],
                'patch' => ['upsert' => ['epOrders' => [$p]], 'me' => Api::me($db)]];
        });
        $id = Ep::parseOrder($body['data']['order']['id']);
        $o = $db->one('SELECT * FROM {ep_orders} WHERE id=? AND user_id=?', [$id, (int)$u['id']]);
        if ($o) {
            $p = Ep::presentOrders($db, [$o], 'plain')[0];
            $body['data']['order'] = $p;
            $body['patch']['upsert']['epOrders'] = [$p];
            $body['patch']['me'] = Api::me($db);
        }
        return $body;
    }, ['auth' => 'user']);

    $r->get('me/ep-orders', function (Req $q, Db $db) {
        $p = [(int)Auth::$user['id']];
        $w = '';
        if ($a = Api::after($q)) {
            $w = ' AND id<?';
            $p[] = $a;
        }
        $lim = Api::limit($q, 50, 200);
        $rows = $db->all('SELECT * FROM {ep_orders} WHERE user_id=?' . $w . ' ORDER BY id DESC LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        return ['data' => ['epOrders' => Ep::presentOrders($db, $rows, 'plain'), 'next' => $more && $rows ? (string)end($rows)['id'] : null]];
    }, ['auth' => 'user', 'csrf' => false]);

    /* ---------------- yönetim [ep] ---------------- */

    $prodBody = function (Db $db, $msg) {
        $d = ['epProducts' => Ep::adminProducts($db), 'hh' => Ep::hh($db)];
        return ['msg' => $msg, 'data' => $d, 'patch' => ['replace' => ['epProducts' => $d['epProducts']], 'set' => ['hh' => $d['hh']]]];
    };
    $r->get('admin/ep/products', function (Req $q, Db $db) {
        return ['data' => ['epProducts' => Ep::adminProducts($db), 'hh' => Ep::hh($db)]];
    }, $S('ep', false));

    $codeMsg = function ($pre, $n, $dup) {
        return $pre . ($n ? ', ' . $n . ' kod eklendi' : '') . ($dup ? ', ' . $dup . ' tekrar eden kod atlandı' : '') . '.';
    };
    $r->post('admin/ep/products', function (Req $q, Db $db) use ($prodBody, $codeMsg) {
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($in, $prodBody, $codeMsg) {
            list($id, $n, $dup) = Ep::create($db, Auth::$user, $in);
            $p = Ep::product($db, $id);
            return $prodBody($db, $codeMsg(Ep::name($db, $p['server_id']) . ' paketi eklendi', $n, $dup) . ($n ? '' : ' Şimdi kodlarını girin.'));
        });
    }, $S('ep'));
    $r->put('admin/ep/products/{id}', function (Req $q, Db $db) use ($prodBody, $codeMsg) {
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($q, $in, $prodBody, $codeMsg) {
            list($id, $n, $dup) = Ep::update($db, Auth::$user, $q->param('id'), $in);
            return $prodBody($db, $codeMsg('Kaydedildi', $n, $dup));
        });
    }, $S('ep'));
    $r->post('admin/ep/products/{id}/toggle', function (Req $q, Db $db) use ($prodBody) {
        return $db->tx(function (Db $db) use ($q, $prodBody) {
            $on = Ep::toggle($db, Auth::$user, $q->param('id'));
            return $prodBody($db, $on ? 'Paket satışta.' : 'Paket satıştan kaldırıldı.');
        });
    }, $S('ep'));
    $r->delete('admin/ep/products/{id}', function (Req $q, Db $db) use ($prodBody) {
        return $db->tx(function (Db $db) use ($q, $prodBody) {
            Ep::delete($db, Auth::$user, $q->param('id'));
            return $prodBody($db, 'Paket silindi.');
        });
    }, $S('ep'));
    $r->delete('admin/ep/codes/{id}', function (Req $q, Db $db) use ($prodBody) {
        return $db->tx(function (Db $db) use ($q, $prodBody) {
            Ep::deleteCode($db, Auth::$user, $q->param('id'));
            return $prodBody($db, 'Kod silindi.');
        });
    }, $S('ep'));
    $r->put('admin/settings/hh', function (Req $q, Db $db) {
        $h = Ep::setHh($db, Auth::$user, Api::body($q));
        return ['msg' => $h['on'] ? 'Happy Hour açıldı: EP\'lerde +%' . $h['pct'] . '.' : 'Happy Hour kapatıldı.', 'data' => ['hh' => $h], 'patch' => ['set' => ['hh' => $h]]];
    }, $S('ep'));

    $r->get('admin/ep/log', function (Req $q, Db $db) {
        $g = $q->q('g', 'all');
        $w = '1=1';
        $p = [];
        if ($g === '' || $g === '_tr') {
            $w = 'server_id IS NULL';
        } elseif ($g !== 'all') {
            $w = 'server_id=?';
            $p[] = Ids::server($g);
        }
        $rows = $db->all('SELECT * FROM {ep_orders} WHERE ' . $w . ' ORDER BY id DESC LIMIT ' . Api::limit($q, 150, 500), $p);
        $per = [];
        foreach ($db->all('SELECT server_id, COUNT(*) AS n, COALESCE(SUM(price),0) AS a FROM {ep_orders} GROUP BY server_id') as $x) {
            $per[$x['server_id'] === null ? '' : Ids::sv($x['server_id'])] = ['n' => (int)$x['n'], 'a' => Text::tl($x['a'])];
        }
        return ['data' => ['epOrders' => Ep::presentOrders($db, $rows, 'mask'), 'per' => (object)$per,
            'users' => Exchange::staffUsers($db, array_column($rows, 'user_id'))]];
    }, $S('ep', false));

    $r->get('admin/ep/orders/{id}/code', function (Req $q, Db $db) {
        return ['data' => ['code' => Ep::revealCode($db, Auth::$user, $q->param('id'))]];
    }, $S('ep', false));
};
