<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;
use YP\Sms\Sms;

/**
 * "Şifremi unuttum" (P6).
 * - İstek (auth/forgot {login}): yanıt HER ZAMAN aynıdır; hesabın var olup olmadığı söylenmez. Yanıt süresi en az MIN_MS'ye
 *   tamamlanır ve gönderim (mümkünse) yanıt kullanıcıya gittikten SONRA yapılır; böylece var olan / olmayan hesap süreden de ayırt edilemez.
 * - Kanal: hesabın e-postası varsa ve e-posta gönderimi açıksa e-posta (6 haneli kod + tek kullanımlık bağlantı);
 *   yoksa hesapta telefon varsa ve WhatsApp ayarlıysa WhatsApp (yalnız kod; Meta'daki kimlik doğrulama şablonu).
 * - Token (64 hex) ve kod yalnız HMAC özeti olarak saklanır; 30 dk geçerli, tek kullanımlık; kodda en çok 5 deneme.
 *   Yeni istek öncekileri geçersiz kılar.
 * - Sıfırlama (auth/reset {token|login+code, password}): şifre değişir, session_ver artar (tüm oturumlar düşer; güvenilir cihaz
 *   çerezi de imzasında session_ver ve şifre özeti olduğu için geçersizleşir), üyeye "şifreniz değişti" bildirimi gider.
 *   Yalnız Google ile açılmış (şifresiz) hesap bu yolla ilk şifresini belirleyebilir. 2 adımlı doğrulama ayarı değişmez;
 *   sıfırlamadan sonra giriş yine kod ister.
 */
final class PassReset
{
    const TTL = 1800000;      // 30 dk
    const MAX_TRIES = 5;
    const MIN_MS = 700;        // auth/forgot en kısa yanıt süresi

    /** yanıttan sonra gönderilecek outbox satırları */
    private static $pending = [];
    private static $hooked = false;

    public static function generic()
    {
        return 'Bu bilgilerle kayıtlı bir hesap varsa şifre sıfırlama kodu e-posta adresine ya da WhatsApp’a gönderildi. Kod 30 dakika geçerlidir.';
    }

    public static function hashToken($token)
    {
        return hash_hmac('sha256', 'reset-token|' . strtolower((string)$token), Store::pepper());
    }

    public static function hashCode($rid, $code)
    {
        return hash_hmac('sha256', 'reset-code|' . (int)$rid . '|' . (string)$code, Store::pepper());
    }

    public static function findUser(Db $db, $login)
    {
        $login = trim((string)$login);
        if ($login === '') {
            return null;
        }
        if (strpos($login, '@') !== false) {
            return $db->one('SELECT * FROM {users} WHERE email=?', [strtolower($login)]);
        }
        return $db->one('SELECT * FROM {users} WHERE name_norm=?', [Text::fold($login)]);
    }

    /** Hangi kanaldan gönderilebilir? 'mail' | 'sms' | null */
    public static function channel(Db $db, array $u)
    {
        $mail = Settings::get('mail', $db);
        if (!empty($mail['on']) && (string)$u['email'] !== '') {
            return 'mail';
        }
        if ((string)$u['tel'] !== '' && Sms::canSend(Settings::get('sms', $db), 'reset') && Sms::e164($u['tel']) !== '') {
            return 'sms';
        }
        return null;
    }

    public static function link(Db $db, $token)
    {
        $site = Settings::get('site', $db);
        $base = !empty($site['siteUrl']) ? rtrim((string)$site['siteUrl'], '/') . '/' : Media::webBase();
        return $base . '#sifre-' . $token;
    }

    /**
     * auth/forgot gövdesi. Var olmayan / askıdaki / kanalı olmayan hesapta da aynı işlemler (özet hesapları) yapılır, satır yazılmaz.
     * Dönüş: gönderim kanalı ya da null (yalnız testler ve audit için; istemciye verilmez).
     */
    public static function request(Db $db, $login, $ip)
    {
        $u = self::findUser($db, $login);
        $token = bin2hex(random_bytes(32));
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $th = self::hashToken($token);
        $ch = $u && $u['status'] === 'active' ? self::channel($db, $u) : null;
        if (!$ch) {
            self::hashCode(0, $code); // aynı iş yükü
            Audit::log($db, $u ? $u['id'] : null, 'pass_reset_req', 'user', $u ? $u['id'] : '', ['sent' => false, 'login' => yp_str($login, 60)], $ip);
            return null;
        }
        $now = yp_now_ms();
        $id = $db->tx(function (Db $db) use ($u, $th, $ch, $now, $ip) {
            $db->exec('UPDATE {password_resets} SET used_at=? WHERE user_id=? AND used_at IS NULL', [$now, (int)$u['id']]);
            return $db->insert('password_resets', ['user_id' => (int)$u['id'], 'token_hash' => $th, 'code_hash' => str_repeat('0', 64), 'channel' => $ch,
                'expires_at' => $now + self::TTL, 'tries' => 0, 'ip' => yp_str($ip, 45), 'created_at' => $now]);
        });
        $db->exec('UPDATE {password_resets} SET code_hash=? WHERE id=?', [self::hashCode($id, $code), (int)$id]);
        $v = Templates::vars($u, ['kod' => $code, 'link' => self::link($db, $token)]);
        if ($ch === 'mail') {
            list($s, $b) = Templates::mail('reset', $v);
            if (strpos($b, $code) === false) {
                $b .= "\n\nKod: " . $code;
            }
            $oid = Outbox::queue($db, 'mail', $u['id'], $u['email'], 'reset', $s, $b, Outbox::PRIO_OTP);
        } else {
            $body = Templates::sms('reset', $v);
            if (strpos($body, $code) === false) {
                $body .= ' ' . $code;
            }
            $oid = Outbox::queue($db, 'sms', $u['id'], $u['tel'], 'reset', '', $body, Outbox::PRIO_OTP);
        }
        self::later($db, $oid);
        Audit::log($db, $u['id'], 'pass_reset_req', 'user', $u['id'], ['sent' => true, 'ch' => $ch], $ip);
        return $ch;
    }

    /** Gönderimi yanıttan sonraya bırakır (LiteSpeed / PHP-FPM). Yanıt kesilemiyorsa hemen gönderir (süre MIN_MS ile örtülür). */
    private static function later(Db $db, $oid)
    {
        $finish = function_exists('litespeed_finish_request') || function_exists('fastcgi_finish_request');
        if (!$finish || PHP_SAPI === 'cli') {
            Outbox::sendNow($db, $oid);
            return;
        }
        self::$pending[] = (int)$oid;
        if (!self::$hooked) {
            self::$hooked = true;
            register_shutdown_function(function () use ($db) {
                $f = function_exists('litespeed_finish_request') ? 'litespeed_finish_request' : 'fastcgi_finish_request';
                @$f();
                foreach (self::$pending as $id) {
                    try {
                        Outbox::sendNow($db, $id);
                    } catch (\Throwable $e) {
                        Log::write('hata', 'Şifre sıfırlama iletisi gönderilemedi: ' . $e->getMessage());
                    }
                }
                self::$pending = [];
            });
        }
    }

    /** Süreyi en az $minMs'ye tamamlar */
    public static function pad($t0, $minMs = self::MIN_MS)
    {
        $left = $minMs - (int)round((microtime(true) - $t0) * 1000);
        if ($left > 0) {
            usleep($left * 1000);
        }
    }

    /** auth/reset: başarılıysa kullanıcı satırı (güncel), değilse HttpError */
    public static function reset(Db $db, array $in, $ip)
    {
        $bad = new HttpError(400, 'Kod ya da bağlantı geçersiz veya süresi dolmuş. Lütfen yeni kod isteyin.', 'reset_invalid');
        $pass = isset($in['password']) && is_string($in['password']) ? $in['password'] : '';
        $token = isset($in['token']) && is_string($in['token']) ? strtolower(trim($in['token'])) : '';
        $code = isset($in['code']) && is_scalar($in['code']) ? preg_replace('/\D/', '', (string)$in['code']) : '';
        $now = yp_now_ms();
        if ($token !== '') {
            if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
                throw $bad;
            }
            $r = $db->one('SELECT * FROM {password_resets} WHERE token_hash=?', [self::hashToken($token)]);
        } else {
            $login = isset($in['login']) && is_string($in['login']) ? $in['login'] : '';
            if ($login === '' || strlen($code) !== 6) {
                throw HttpError::validation(array_filter([
                    'login' => $login === '' ? 'Kullanıcı adınızı veya e-postanızı yazın.' : null,
                    'code' => strlen($code) !== 6 ? '6 haneli kodu yazın.' : null,
                ]));
            }
            $u = self::findUser($db, $login);
            $r = $u ? $db->one('SELECT * FROM {password_resets} WHERE user_id=? ORDER BY id DESC LIMIT 1', [(int)$u['id']]) : null;
        }
        if (!$r || $r['used_at'] !== null || (int)$r['expires_at'] < $now || (int)$r['tries'] >= self::MAX_TRIES) {
            throw $bad;
        }
        if ($token === '') {
            $db->exec('UPDATE {password_resets} SET tries=tries+1 WHERE id=?', [(int)$r['id']]);
            if (!hash_equals((string)$r['code_hash'], self::hashCode($r['id'], $code))) {
                throw $bad;
            }
        }
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$r['user_id']]);
        if (!$u || $u['status'] !== 'active') {
            throw $bad;
        }
        $staff = in_array($u['role'], ['staff', 'admin'], true);
        $v = new V($in);
        $v->password('password', $staff ? 10 : 8);
        $v->done();
        $first = !Google::hasPassword($u);
        $ok = $db->tx(function (Db $db) use ($r, $u, $pass, $now) {
            // tek kullanımlık: aynı anda iki istekten yalnız biri geçer
            if (!$db->exec('UPDATE {password_resets} SET used_at=? WHERE id=? AND used_at IS NULL', [$now, (int)$r['id']])) {
                return false;
            }
            $db->exec('UPDATE {password_resets} SET used_at=? WHERE user_id=? AND used_at IS NULL', [$now, (int)$u['id']]);
            $db->update('users', ['pass_hash' => Auth::hash($pass)], 'id=?', [(int)$u['id']]);
            return true;
        });
        if (!$ok) {
            throw $bad;
        }
        Auth::bumpSessionVer($db, $u['id']); // tüm oturumlar ve güvenilir cihaz çerezleri geçersiz
        RateLimit::reset('login_acc:' . Text::fold(strtolower((string)$u['name'])));
        if ((string)$u['email'] !== '') {
            RateLimit::reset('login_acc:' . Text::fold(strtolower((string)$u['email'])));
        }
        Notify::send($db, $u['id'], $first ? 'Hesabınıza şifre eklendi (Şifremi unuttum). Artık şifrenizle de giriş yapabilirsiniz.'
            : 'Hesap şifreniz “Şifremi unuttum” ile sıfırlandı. Bu işlemi siz yapmadıysanız hemen canlı destekten bize ulaşın.', '#hesabim', 'pass');
        Audit::log($db, $u['id'], 'pass_reset', 'user', $u['id'], ['via' => $token !== '' ? 'link' : 'code', 'first' => $first], $ip);
        return $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
    }
}
