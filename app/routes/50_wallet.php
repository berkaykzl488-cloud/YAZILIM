<?php
/**
 * Cüzdan (PLAN §4 P2): hesap hareketleri (S.tx), yüklemelerim (S.deps), puan → bakiye, kupon önizleme, ilan dopingi.
 * Açılış verisine (boot) ödeme yöntemleri, havale hesapları, kripto ağları, dopingler ve VIP seviyeleri eklenir (YP\Hooks).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Catalog;
use YP\Db;
use YP\Hooks;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Money\Api;
use YP\Money\Deposits;
use YP\Money\IdemTx;
use YP\Money\Rules;
use YP\Money\View;
use YP\Money\Wallet;
use YP\RateLimit;
use YP\Text;

return function (Router $r) {
    // boot: herkese açık para dilimleri (PayTR ayarlanmadıysa PayTR yöntemleri on:false, soon:true)
    Hooks::on('boot', function (array $data, Db $db, $u) {
        return array_merge($data, View::publicSlices($db));
    }, 'money');
    // poll: güncel bakiye (yükleme onaylanınca/satış tamamlanınca ekran yenilensin)
    Hooks::on('poll', function (array $data, Db $db, $u) {
        if ($u) {
            $w = $db->one('SELECT cash, credit FROM {wallets} WHERE user_id=?', [(int)$u['id']]) ?: ['cash' => 0, 'credit' => 0];
            $pts = (int)$db->val('SELECT pts FROM {users} WHERE id=?', [(int)$u['id']]);
            $data['wallet'] = ['bal' => Text::tl($w['cash']), 'bonus' => Text::tl($w['credit']), 'pts' => $pts];
        }
        return $data;
    }, 'money');

    // Hesap hareketleri: ?after=<next> &limit=
    $r->get('me/tx', function (Req $q, Db $db) {
        list($tx, $next) = View::txList($db, Auth::$user['id'], Api::after($q), Api::limit($q, 50, 200));
        return ['data' => ['tx' => $tx, 'next' => $next === null ? null : (string)$next]];
    }, ['auth' => 'user', 'csrf' => false]);

    $r->get('me/deposits', function (Req $q, Db $db) {
        $p = [(int)Auth::$user['id']];
        $w = '';
        if ($a = Api::after($q)) {
            $w = ' AND id<?';
            $p[] = $a;
        }
        $lim = Api::limit($q, 30, 100);
        $rows = $db->all('SELECT * FROM {deposits} WHERE user_id=?' . $w . ' ORDER BY id DESC LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        return ['data' => ['deps' => array_map(function ($d) use ($db) {
            return View::deposit($db, $d);
        }, $rows), 'next' => $more && $rows ? (string)end($rows)['id'] : null]];
    }, ['auth' => 'user', 'csrf' => false]);

    // Puanı bakiyeye çevir: {pts}
    $r->post('me/points/convert', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        return IdemTx::run($db, $u['id'], $key, 'POST me/points/convert', function (Db $db) use ($u, $in) {
            list($p, $k) = Wallet::convertPoints($db, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]), isset($in['pts']) ? $in['pts'] : 0);
            return ['msg' => Rules::tl($k) . ' bakiyenize eklendi.', 'data' => ['pts' => $p, 'amount' => Text::tl($k)], 'patch' => ['me' => Api::me($db)]];
        });
    }, ['auth' => 'user']);

    // Kupon önizleme (bakiye yükleme penceresi, depCalc): ?code=&amount=
    $r->get('coupons/check', function (Req $q, Db $db) {
        RateLimit::enforce('cpcheck:' . (int)Auth::$user['id'], 40, 600);
        $amount = Text::kurus($q->q('amount', '0'));
        try {
            list($c, $bonus) = Deposits::coupon($db, $q->q('code'), Auth::$user['id'], max(0, (int)$amount));
        } catch (HttpError $e) {
            return ['data' => ['ok' => false, 'error' => $e->getMessage(), 'bonus' => 0]];
        }
        if (!$c) {
            return ['data' => ['ok' => false, 'error' => '', 'bonus' => 0]];
        }
        return ['data' => ['ok' => true, 'code' => $c['code'], 'pct' => round((int)$c['pct_bp'] / 100, 2), 'max' => Text::tl($c['max']), 'bonus' => Text::tl($bonus)]];
    }, ['auth' => 'user', 'csrf' => false]);

    // İlan dopingi satın al: {k:'vitrin', days:3} ya da {dop:{vitrin:3, acil:1}}
    $r->post('listings/{id}/dope', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        return IdemTx::run($db, $u['id'], $key, 'POST ' . $q->path, function (Db $db) use ($q, $u, $in) {
            $spec = isset($in['dop']) ? Wallet::dopSpec($db, $in['dop'], isset($in['dopDays']) ? $in['dopDays'] : null)
                : Wallet::dopSpec($db, isset($in['k']) ? (string)$in['k'] : null, isset($in['days']) ? $in['days'] : 1);
            if (!$spec) {
                throw HttpError::validation(['k' => 'Doping seçin.']);
            }
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $l = Catalog::listingRow($db, $q->param('id'), true);
            list($cost, $txt) = Wallet::applyDopings($db, $me, $l, $spec, 'dope');
            $out = Api::listing($db, $l['id']);
            return ['msg' => $txt . ' uygulandı (' . Rules::tl($cost) . ').', 'data' => ['listing' => $out, 'cost' => Text::tl($cost)],
                'patch' => ['upsert' => ['listings' => [$out]], 'me' => Api::me($db)]];
        });
    }, ['auth' => 'user']);
};
