<?php
/** Üyelik, giriş, 2 adımlı doğrulama, çıkış (PLAN §4 P0) */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Notify;
use YP\Present;
use YP\RateLimit;
use YP\Settings;
use YP\Text;
use YP\Tfa;
use YP\V;

return function (Router $r) {
    $r->post('auth/register', function (Req $q, Db $db) {
        RateLimit::enforce('reg_ip:' . $q->ip, 5, 3600, false, 'Bu bağlantıdan bir saat içinde çok fazla üyelik açıldı. Lütfen daha sonra tekrar deneyin.');
        if (Auth::$user) {
            throw new HttpError(409, 'Zaten giriş yapmış durumdasınız.', 'logged_in');
        }
        $in = $q->body();
        $v = new V($in);
        $name = $v->str('name', 3, 20, V::RX_NAME, 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi kullanın.');
        $email = $v->email('email');
        $tel = $v->tel('tel');
        $ad = $v->str('ad', 2, 40, V::RX_PERSON, 'Ad ve soyadı kimliğinizdeki gibi, yalnızca harflerle yazın.');
        $soyad = $v->str('soyad', 2, 40, V::RX_PERSON, 'Ad ve soyadı kimliğinizdeki gibi, yalnızca harflerle yazın.');
        $pass = $v->password('password', 8);
        $ref = strtoupper((string)$v->str('ref', 0, 40));
        $src = $v->str('src', 0, 60);
        $v->done();

        $norm = Text::fold($name);
        if ($db->val('SELECT id FROM {users} WHERE name_norm=?', [$norm])) {
            throw HttpError::validation(['name' => 'Bu kullanıcı adı alınmış.']);
        }
        if ($db->val('SELECT id FROM {users} WHERE email=?', [$email])) {
            throw HttpError::validation(['email' => 'Bu e-posta ile kayıtlı bir hesap var.']);
        }
        $site = Settings::get('site', $db);
        $refUser = null;
        if ($ref !== '' && !empty($site['refOn'])) {
            $refUser = $db->one("SELECT id, name FROM {users} WHERE ref_code=? AND role<>'admin' AND status='active' ORDER BY id LIMIT 1", [$ref]);
            if (!$refUser) {
                throw HttpError::validation(['ref' => 'Davet kodu bulunamadı.']);
            }
        }
        $now = yp_now_ms();
        try {
            $id = $db->tx(function (Db $db) use ($name, $norm, $email, $tel, $ad, $soyad, $pass, $refUser, $src, $now) {
                $id = $db->insert('users', [
                    'name' => $name, 'name_norm' => $norm, 'email' => $email, 'tel' => $tel, 'ad' => $ad, 'soyad' => $soyad,
                    'pass_hash' => Auth::hash($pass), 'role' => 'member', 'status' => 'active', 'joined_at' => $now, 'last_seen' => $now,
                    'ref_by' => $refUser ? (int)$refUser['id'] : null, 'ref_code' => Text::refCode($name), 'src' => $src ?: null,
                    'session_ver' => 1, 'created_at' => $now,
                ]);
                $db->insert('wallets', ['user_id' => $id, 'cash' => 0, 'credit' => 0, 'updated_at' => $now]);
                return $id;
            });
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw HttpError::validation(['name' => 'Bu kullanıcı adı veya e-posta zaten kayıtlı.']);
            }
            throw $e;
        }
        RateLimit::add('reg_ip:' . $q->ip, 3600);
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [$id]);
        Notify::send($db, $id, 'Hoş geldin ' . $name . '! Hesabın oluşturuldu.', '#hesabim', 'welcome');
        if ($refUser) {
            Notify::send($db, $refUser['id'], $name . ' davet linkin/kodunla üye oldu. İlk alışverişini tamamlayınca ' . $site['refBonus'] . ' TL hediye bakiye kazanacaksın.', '#hesabim');
        }
        Audit::log($db, $id, 'register', 'user', $id, ['ref' => $refUser ? $refUser['id'] : null]);
        $remember = !array_key_exists('remember', $in) || yp_bool($in['remember']);
        $csrf = Auth::login($db, $u, $remember);
        return ['msg' => 'Hoş geldin ' . $name . '!', 'data' => ['me' => Present::me($db, $u), 'csrf' => $csrf]];
    }, ['auth' => 'none']);

    $r->post('auth/login', function (Req $q, Db $db) {
        $in = $q->body();
        $login = yp_str(isset($in['login']) ? $in['login'] : (isset($in['name']) ? $in['name'] : ''), 190);
        $pass = isset($in['password']) && is_string($in['password']) ? $in['password'] : '';
        if ($login === '' || $pass === '') {
            throw HttpError::validation(array_filter([
                'login' => $login === '' ? 'Kullanıcı adı veya e-posta yazın.' : null,
                'password' => $pass === '' ? 'Şifrenizi yazın.' : null,
            ]));
        }
        $acc = 'login_acc:' . Text::fold(strtolower($login));
        RateLimit::enforce('login_ip:' . $q->ip, 5, 900, false);
        RateLimit::enforce($acc, 10, 3600, false, 'Bu hesap için çok fazla hatalı deneme yapıldı. Lütfen bir saat sonra tekrar deneyin.');
        $u = Auth::verifyCredentials($db, $login, $pass);
        if (!$u) {
            RateLimit::add('login_ip:' . $q->ip, 900);
            RateLimit::add($acc, 3600);
            usleep(250000);
            Audit::log($db, null, 'login_fail', 'login', '', ['login' => yp_str($login, 60)]);
            throw new HttpError(401, 'Kullanıcı adı veya şifre hatalı.', 'bad_login');
        }
        if ($u['status'] !== 'active') {
            Audit::log($db, $u['id'], 'login_banned', 'user', $u['id']);
            throw new HttpError(403, 'Hesabınız askıya alınmış. Canlı destekle görüşün.', 'banned');
        }
        RateLimit::reset($acc);
        $remember = !empty($in['remember']) && yp_bool($in['remember']);
        if ($u['tfa'] !== '') {
            $t = Tfa::start($db, $u, 'login', $u['tfa']);
            Auth::write(function (&$s) use ($t, $u, $remember) {
                $s['tfa'] = ['cid' => $t['id'], 'uid' => (int)$u['id'], 'rem' => $remember ? 1 : 0, 'exp' => time() + 900];
            });
            return ['tfa' => $t, 'msg' => 'Doğrulama kodu gönderildi.'];
        }
        $csrf = Auth::login($db, $u, $remember);
        Audit::log($db, $u['id'], 'login', 'user', $u['id'], ['staff' => $u['role'] !== 'member']);
        return ['msg' => 'Hoş geldin ' . $u['name'] . '!', 'data' => ['me' => Present::me($db, $u), 'csrf' => $csrf]];
    }, ['auth' => 'none']);

    /** Girişte bekleyen 2FA mı, yoksa oturumdaki kullanıcının aç/kapat doğrulaması mı? */
    $ctx = function (Db $db) {
        $p = isset(Auth::$sess['tfa']) && is_array(Auth::$sess['tfa']) ? Auth::$sess['tfa'] : null;
        if ($p && (int)$p['exp'] > time()) {
            $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$p['uid']]);
            if ($u && $u['status'] === 'active') {
                return [$u, ['login'], $p];
            }
        }
        if (Auth::$user) {
            return [Auth::$user, ['enable', 'disable'], null];
        }
        throw new HttpError(400, 'Doğrulama isteği bulunamadı veya süresi doldu. Lütfen baştan deneyin.', 'tfa_gone');
    };

    $r->post('auth/tfa/verify', function (Req $q, Db $db) use ($ctx) {
        list($u, $purposes, $pending) = $ctx($db);
        $in = $q->body();
        $cid = isset($in['id']) && is_scalar($in['id']) ? (int)$in['id'] : ($pending ? (int)$pending['cid'] : 0);
        if ($pending && $cid !== (int)$pending['cid']) {
            throw new HttpError(400, 'Doğrulama isteği bulunamadı veya kullanıldı. Lütfen baştan deneyin.', 'tfa_gone');
        }
        $row = Tfa::verify($db, $cid, $u['id'], isset($in['code']) && is_scalar($in['code']) ? (string)$in['code'] : '', $purposes);
        if ($row['purpose'] === 'login') {
            $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $csrf = Auth::login($db, $u, !empty($pending['rem']));
            Audit::log($db, $u['id'], 'login', 'user', $u['id'], ['tfa' => $row['channel'], 'staff' => $u['role'] !== 'member']);
            return ['msg' => 'Hoş geldin ' . $u['name'] . '!', 'data' => ['me' => Present::me($db, $u), 'csrf' => $csrf]];
        }
        if ($row['purpose'] === 'enable') {
            $db->exec('UPDATE {users} SET tfa=? WHERE id=?', [$row['channel'], (int)$u['id']]);
            Notify::send($db, $u['id'], '2 adımlı doğrulama açıldı (' . ($row['channel'] === 'sms' ? 'SMS' : 'e-posta') . ').', '#hesabim');
            Audit::log($db, $u['id'], 'tfa_enable', 'user', $u['id'], ['ch' => $row['channel']]);
            $msg = '2 adımlı doğrulama açıldı.';
        } else {
            $db->exec("UPDATE {users} SET tfa='' WHERE id=?", [(int)$u['id']]);
            Notify::send($db, $u['id'], '2 adımlı doğrulama kapatıldı.', '#hesabim');
            Audit::log($db, $u['id'], 'tfa_disable', 'user', $u['id']);
            $msg = '2 adımlı doğrulama kapatıldı.';
        }
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
        return ['msg' => $msg, 'patch' => ['me' => Present::me($db, $u)]];
    }, ['auth' => 'none']);

    $resend = function ($switch) use ($ctx) {
        return function (Req $q, Db $db) use ($ctx, $switch) {
            list($u, $purposes, $pending) = $ctx($db);
            $in = $q->body();
            $cid = isset($in['id']) && is_scalar($in['id']) ? (int)$in['id'] : ($pending ? (int)$pending['cid'] : 0);
            if ($pending && $cid !== (int)$pending['cid']) {
                throw new HttpError(400, 'Doğrulama isteği bulunamadı veya kullanıldı. Lütfen baştan deneyin.', 'tfa_gone');
            }
            $t = Tfa::resend($db, $u, $cid, $purposes, $switch);
            return ['tfa' => $t, 'msg' => 'Yeni kod gönderildi.'];
        };
    };
    $r->post('auth/tfa/resend', $resend(false), ['auth' => 'none']);
    $r->post('auth/tfa/switch', $resend(true), ['auth' => 'none']);

    $r->post('auth/logout', function (Req $q, Db $db) {
        $uid = Auth::$user ? (int)Auth::$user['id'] : null;
        $csrf = Auth::logout();
        if ($uid) {
            Audit::log($db, $uid, 'logout', 'user', $uid);
        }
        return ['msg' => 'Çıkış yapıldı.', 'data' => ['csrf' => $csrf, 'me' => null]];
    }, ['auth' => 'none']);
};
