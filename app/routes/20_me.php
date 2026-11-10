<?php
/** Hesabım: profil, 2FA, IBAN'lar, bildirimler, demo hesap değiştirme (PLAN §4 P0) */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Notify;
use YP\Present;
use YP\Settings;
use YP\Store;
use YP\Tfa;
use YP\V;

return function (Router $r) {
    $fresh = function (Db $db) {
        return $db->one('SELECT * FROM {users} WHERE id=?', [(int)Auth::$user['id']]);
    };

    $r->put('me/profile', function (Req $q, Db $db) use ($fresh) {
        $u = Auth::$user;
        $in = $q->body();
        $v = new V($in);
        $set = [];
        if (!(int)$u['tc_ok']) { // TC doğrulandıysa ad/soyad kimlikten gelir, değişmez
            if ($v->has('ad')) {
                $set['ad'] = $v->str('ad', 2, 40, V::RX_PERSON, 'Ad ve soyadı kimliğinizdeki gibi, yalnızca harflerle yazın.');
            }
            if ($v->has('soyad')) {
                $set['soyad'] = $v->str('soyad', 2, 40, V::RX_PERSON, 'Ad ve soyadı kimliğinizdeki gibi, yalnızca harflerle yazın.');
            }
        }
        if ($v->has('tel')) {
            $set['tel'] = $v->tel('tel', false);
        }
        $email = $v->has('email') ? $v->email('email') : null;
        $newPass = $v->has('password') && $in['password'] !== '' ? $v->password('password', in_array($u['role'], ['staff', 'admin'], true) ? 10 : 8) : null;
        $v->done();
        $emailChanged = $email !== null && $email !== (string)$u['email'];
        if ($emailChanged || $newPass !== null) {
            $cur = isset($in['current_password']) && is_string($in['current_password']) ? $in['current_password'] : '';
            if ($cur === '' || !password_verify($cur, $u['pass_hash'])) {
                throw HttpError::validation(['current_password' => 'Mevcut şifreniz hatalı.'], $emailChanged && $newPass === null
                    ? 'E-posta adresini değiştirmek için mevcut şifrenizi yazın.' : 'Mevcut şifreniz hatalı.');
            }
        }
        if ($emailChanged) {
            if ($db->val('SELECT id FROM {users} WHERE email=? AND id<>?', [$email, (int)$u['id']])) {
                throw HttpError::validation(['email' => 'Bu e-posta ile kayıtlı bir hesap var.']);
            }
            if ($email === '' && $u['tfa'] === 'mail') {
                throw HttpError::validation(['email' => 'E-posta ile 2 adımlı doğrulama açıkken e-posta silinemez.']);
            }
            $set['email'] = $email;
        }
        if (isset($set['tel']) && $set['tel'] === '' && $u['tfa'] === 'sms') {
            throw HttpError::validation(['tel' => 'SMS ile 2 adımlı doğrulama açıkken telefon silinemez.']);
        }
        if ($newPass !== null) {
            $set['pass_hash'] = Auth::hash($newPass);
        }
        if ($set) {
            $db->update('users', $set, 'id=?', [(int)$u['id']]);
        }
        if ($newPass !== null) {
            $ver = Auth::bumpSessionVer($db, $u['id']); // diğer cihazlardaki oturumlar düşer
            Auth::keepCurrent($ver);
            Notify::send($db, $u['id'], 'Hesap şifreniz değiştirildi.', '#hesabim', 'pass');
            Audit::log($db, $u['id'], 'password_change', 'user', $u['id']);
        }
        if ($emailChanged) {
            Audit::log($db, $u['id'], 'email_change', 'user', $u['id']);
        }
        return ['msg' => 'Bilgileriniz kaydedildi.', 'patch' => ['me' => Present::me($db, $fresh($db))]];
    });

    // 2FA aç/kapat: önce doğrulama kodu gönderilir; ardından auth/tfa/verify
    $r->post('me/tfa', function (Req $q, Db $db) {
        $u = Auth::$user;
        $v = new V($q->body());
        $to = $v->oneOf('tfa', ['', 'mail', 'sms'], null);
        if ($to === null) {
            $v->err('tfa', 'Bir doğrulama yöntemi seçin.');
        }
        $v->done();
        if ($to === (string)$u['tfa']) {
            throw new HttpError(400, 'Değişiklik yok.', 'no_change');
        }
        if ($to === 'sms' && (string)$u['tel'] === '') {
            throw HttpError::validation(['tfa' => 'Önce profilinize telefon ekleyin.']);
        }
        if ($to === 'mail' && (string)$u['email'] === '') {
            throw HttpError::validation(['tfa' => 'Önce profilinize e-posta ekleyin.']);
        }
        $t = $to !== '' ? Tfa::start($db, $u, 'enable', $to) : Tfa::start($db, $u, 'disable', $u['tfa']);
        return ['tfa' => $t, 'msg' => 'Doğrulama kodu gönderildi.'];
    });

    $r->post('me/ibans', function (Req $q, Db $db) use ($fresh) {
        $u = Auth::$user;
        $in = $q->body();
        $v = new V($in);
        $bank = $v->str('bank', 2, 60, null, 'Banka adını yazın.');
        $holder = $v->str('name', 3, 80, '/^[\p{L}\' .\-]{3,80}$/u', 'Hesap sahibinin adını soyadını yazın.');
        $iban = strtoupper(preg_replace('/\s+/', '', is_scalar(isset($in['iban']) ? $in['iban'] : null) ? (string)$in['iban'] : ''));
        if (!preg_match('/^TR\d{24}$/', $iban)) {
            $v->err('iban', 'IBAN TR ile başlamalı ve 26 karakter olmalı.');
        } elseif (!yp_valid_iban_tr($iban)) {
            $v->err('iban', 'IBAN doğrulanamadı; rakamları kontrol edin.');
        }
        $v->done();
        if ((int)$db->val('SELECT COUNT(*) FROM {user_ibans} WHERE user_id=?', [(int)$u['id']]) >= 5) {
            throw new HttpError(422, 'En fazla 5 IBAN kaydedebilirsiniz.', 'limit');
        }
        $h = hash_hmac('sha256', 'iban|' . $iban, Store::pepper());
        if ($db->val('SELECT id FROM {user_ibans} WHERE user_id=? AND iban_hash=?', [(int)$u['id'], $h])) {
            throw HttpError::validation(['iban' => 'Bu IBAN zaten kayıtlı.']);
        }
        $db->insert('user_ibans', ['user_id' => (int)$u['id'], 'bank' => $bank, 'holder' => $holder, 'iban_enc' => yp_encrypt($iban),
            'iban_last4' => substr($iban, -4), 'iban_hash' => $h, 'created_at' => yp_now_ms()]);
        return ['msg' => 'IBAN kaydedildi.', 'patch' => ['me' => Present::me($db, $fresh($db))]];
    });

    $r->delete('me/ibans/{id}', function (Req $q, Db $db) use ($fresh) {
        $id = Ids::parse($q->param('id'), 'ib');
        if (!$db->exec('DELETE FROM {user_ibans} WHERE id=? AND user_id=?', [$id, (int)Auth::$user['id']])) {
            throw HttpError::notFound('IBAN bulunamadı.');
        }
        return ['msg' => 'IBAN silindi.', 'patch' => ['me' => Present::me($db, $fresh($db))]];
    });

    $unread = function (Db $db) {
        return (int)$db->val('SELECT COUNT(*) FROM {notifications} WHERE user_id=? AND is_read=0', [(int)Auth::$user['id']]);
    };

    $r->post('me/notifications/read-all', function (Req $q, Db $db) use ($unread) {
        $db->exec('UPDATE {notifications} SET is_read=1 WHERE user_id=? AND is_read=0', [(int)Auth::$user['id']]);
        return ['msg' => 'Tüm bildirimler okundu olarak işaretlendi.', 'data' => ['unread' => ['n' => $unread($db)]]];
    });

    $r->post('me/notifications/{id}/read', function (Req $q, Db $db) use ($unread) {
        $id = Ids::parse($q->param('id'), 'n');
        $db->exec('UPDATE {notifications} SET is_read=1 WHERE id=? AND user_id=?', [$id, (int)Auth::$user['id']]);
        return ['data' => ['unread' => ['n' => $unread($db)]]];
    });

    $r->delete('me/notifications/read', function (Req $q, Db $db) use ($unread) {
        $n = $db->exec('DELETE FROM {notifications} WHERE user_id=? AND is_read=1', [(int)Auth::$user['id']]);
        return ['msg' => $n . ' bildirim silindi.', 'data' => ['deleted' => $n, 'unread' => ['n' => $unread($db)]]];
    });

    // Demo hesap değiştirici — yalnız settings.demo_mode=1 iken (gerçek sitede kapalı)
    $r->post('demo/as', function (Req $q, Db $db) {
        if (!(int)Settings::get('demo_mode', $db)) {
            throw new HttpError(403, 'Demo hesap girişi kapalı.', 'demo_off');
        }
        $in = $q->body();
        $t = $db->one('SELECT * FROM {users} WHERE id=?', [Ids::user(isset($in['id']) ? $in['id'] : '')]);
        if (!$t || $t['status'] !== 'active') {
            throw HttpError::notFound('Üye bulunamadı.');
        }
        $me = Auth::$user;
        if ($t['role'] !== 'member' && !($me && $me['role'] === 'admin')) {
            throw HttpError::forbidden('Çalışan hesaplarına demo girişi yapılamaz.');
        }
        $csrf = Auth::login($db, $t, false);
        Audit::log($db, $me ? $me['id'] : null, 'demo_as', 'user', $t['id']);
        return ['data' => ['me' => Present::me($db, $t), 'csrf' => $csrf]];
    }, ['auth' => 'none']);
};
