<?php
/**
 * Bakiye yükleme (PLAN §4 P2).
 *   POST deposits/paytr   {gw:'paytr'|'paytr_eft', amount, coupon?, bank?}  → {oid, token, iframe}  (Idempotency-Key zorunlu)
 *        Ön yüz iframe'i açar; ödeme sonucu PayTR'dan /api/paytr_bildirim.php'ye gelir ve bakiye orada yüklenir.
 *        Dönüşte (?odeme=basarili&oid=…) GET deposits/{oid} birkaç saniyede bir yoklanır (status: bekliyor → onaylandı).
 *        PayTR ayarları (Entegrasyonlar) yapılmamışsa 400 paytr_off: "Kart ile ödeme yakında".
 *   GET  deposits/{oid}   kendi yüklemesinin durumu (merchant_oid ya da d5)
 *   POST deposits/manual  {gw:'havale'|'kripto', amount, coupon?, txAt, toBank?, net?, txid?, note?, receipt?} → ekip onayı bekler
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Money\Api;
use YP\Money\Deposits;
use YP\Money\IdemTx;
use YP\Money\Paytr;
use YP\Money\View;
use YP\RateLimit;

return function (Router $r) {
    $r->post('deposits/paytr', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        $gw = isset($in['gw']) && is_string($in['gw']) ? $in['gw'] : 'paytr';
        Deposits::assertPaytr($db, $gw); // ayar yoksa: "Kart ile ödeme yakında" (400 paytr_off)
        $body = IdemTx::run($db, $u['id'], $key, 'POST deposits/paytr', function (Db $db) use ($u, $in) {
            RateLimit::enforce('paytr_token:' . (int)$u['id'], 15, 600, true, 'Çok fazla ödeme denemesi yaptınız. Lütfen 10 dakika sonra tekrar deneyin.');
            $d = Deposits::paytrCreate($db, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]), $in);
            return ['data' => ['oid' => $d['merchant_oid'], 'id' => View::depositId($d['id'])]];
        });
        $d = Deposits::find($db, $body['data']['oid']);
        if (!$d || (int)$d['user_id'] !== (int)$u['id']) {
            throw HttpError::notFound('Yükleme kaydı bulunamadı.');
        }
        $tip = $d['gw'] === 'paytr_eft' ? 'eft' : 'kart';
        if ($d['paytr_token'] === null) {
            if (!empty($body['replayed'])) {
                if ($d['status'] !== 'bekliyor') {
                    throw new HttpError(502, 'Ödeme başlatılamadı. ' . $d['reason'], 'paytr_error');
                }
                throw new HttpError(409, 'Ödeme ekranı hazırlanıyor. Lütfen birkaç saniye sonra tekrar deneyin.', 'idem_busy');
            }
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $t = Deposits::paytrToken($db, $d, $me, $q->ip, Api::siteBase($db));
            $db->update('deposits', ['paytr_token' => yp_str($t['token'], 255)], 'id=?', [(int)$d['id']]);
            $d['paytr_token'] = $t['token'];
        }
        return ['data' => ['oid' => $d['merchant_oid'], 'token' => $d['paytr_token'], 'iframe' => Paytr::iframeUrl($tip, $d['paytr_token']), 'tip' => $tip,
            'deposit' => View::deposit($db, $d), 'testMode' => (bool)(int)$d['test_mode']]];
    }, ['auth' => 'user']);

    $r->get('deposits/{oid}', function (Req $q, Db $db) {
        $d = Deposits::find($db, $q->param('oid'));
        if (!$d || (int)$d['user_id'] !== (int)Auth::$user['id']) {
            throw HttpError::notFound('Yükleme kaydı bulunamadı.');
        }
        return ['data' => ['deposit' => View::deposit($db, $d), 'done' => $d['status'] !== 'bekliyor'], 'patch' => ['me' => Api::me($db)]];
    }, ['auth' => 'user', 'csrf' => false]);

    $r->post('deposits/manual', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        return IdemTx::run($db, $u['id'], $key, 'POST deposits/manual', function (Db $db) use ($u, $in) {
            RateLimit::enforce('dep_manual:' . (int)$u['id'], 10, 3600, true, 'Bir saatte en fazla 10 yükleme bildirimi yapabilirsiniz.');
            $d = Deposits::manualCreate($db, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]), $in);
            $p = View::deposit($db, $d);
            return ['msg' => 'Bildiriminiz alındı. Onaylanınca bakiyenize eklenecek.', 'data' => ['deposit' => $p], 'patch' => ['upsert' => ['deps' => [$p]]]];
        });
    }, ['auth' => 'user']);
};
