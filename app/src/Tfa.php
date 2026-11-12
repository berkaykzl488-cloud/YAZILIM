<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * 2 adımlı doğrulama (isteğe bağlı; her kullanıcı kendisi açar — sahibin kararı, PLAN §9).
 * 6 haneli kod, 3 dakika geçerli, en fazla 5 hatalı deneme. Kod veritabanında HMAC(pepper) olarak tutulur.
 * Gönderim sınırı: kanal başına 60 saniyede 1, kullanıcı başına saatte 5.
 * Kod doğru girilince tarayıcıya imzalı YPT çerezi yazılır; süre (site.tfaTrustMin, varsayılan 180 dk) dolana
 * kadar aynı tarayıcıdan girişte yeniden kod gönderilmez (SMS/e-posta tasarrufu).
 */
final class Tfa
{
    const TTL_MS = 180000;
    const MAX_TRIES = 5;
    const RESEND_SEC = 60;
    const HOURLY = 5;

    public static function hashCode($cid, $code)
    {
        return hash_hmac('sha256', (int)$cid . '|' . (string)$code, Store::pepper());
    }

    public static function dest(array $u, $ch)
    {
        return $ch === 'sms' ? Text::maskTel($u['tel']) : Text::maskMail($u['email']);
    }

    /** Kanal kullanılabilir mi? (adres var + SMS açık) */
    public static function channelOk(Db $db, array $u, $ch)
    {
        if ($ch === 'mail') {
            return (string)$u['email'] !== '';
        }
        if ($ch === 'sms') {
            $s = Settings::get('sms', $db);
            return (string)$u['tel'] !== '' && !empty($s['on']);
        }
        return false;
    }

    private static function limit($uid, $ch)
    {
        RateLimit::enforce('tfa_m:' . (int)$uid . ':' . $ch, 1, self::RESEND_SEC, true,
            'Yeni kod istemeden önce biraz bekleyin.');
        RateLimit::enforce('tfa_h:' . (int)$uid, self::HOURLY, 3600, true,
            'Bir saat içinde çok fazla kod istendi. Lütfen daha sonra tekrar deneyin.');
    }

    private static function info(array $row, array $u)
    {
        $wait = max(0, self::RESEND_SEC - (int)floor((yp_now_ms() - (int)$row['sent_at']) / 1000));
        return ['id' => (int)$row['id'], 'ch' => $row['channel'], 'dest' => self::dest($u, $row['channel']),
                'wait' => $wait, 'exp' => (int)$row['expires_at'], 'purpose' => $row['purpose'],
                'alt' => (string)$u['tel'] !== '' && (string)$u['email'] !== '' && $row['purpose'] !== 'enable'];
    }

    private static function newCode()
    {
        return str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    /** Yeni doğrulama başlatır ve kodu gönderir. */
    public static function start(Db $db, array $u, $purpose, $ch)
    {
        if (!in_array($purpose, ['login', 'enable', 'disable', 'withdraw'], true) || !in_array($ch, ['mail', 'sms'], true)) {
            throw new \InvalidArgumentException('tfa');
        }
        if (!self::channelOk($db, $u, $ch)) {
            if ($purpose === 'login' && $ch === 'sms' && self::channelOk($db, $u, 'mail')) {
                $ch = 'mail'; // SMS kapalıysa girişte e-postaya düş
            } else {
                throw new HttpError(422, $ch === 'sms' ? 'SMS ile doğrulama şu an kullanılamıyor.' : 'Önce profilinize e-posta ekleyin.', 'tfa_channel');
            }
        }
        self::limit($u['id'], $ch);
        $now = yp_now_ms();
        $code = self::newCode();
        $row = $db->tx(function (Db $db) use ($u, $purpose, $ch, $now, $code) {
            $db->exec('UPDATE {auth_challenges} SET consumed_at=? WHERE user_id=? AND purpose=? AND consumed_at IS NULL', [$now, (int)$u['id'], $purpose]);
            $cid = $db->insert('auth_challenges', [
                'user_id' => (int)$u['id'], 'purpose' => $purpose, 'channel' => $ch, 'code_hash' => str_repeat('0', 64),
                'expires_at' => $now + self::TTL_MS, 'tries' => 0, 'sends' => 1, 'sent_at' => $now, 'created_at' => $now, 'ip' => yp_client_ip(),
            ]);
            $db->exec('UPDATE {auth_challenges} SET code_hash=? WHERE id=?', [self::hashCode($cid, $code), $cid]);
            return $db->one('SELECT * FROM {auth_challenges} WHERE id=?', [$cid]);
        });
        Notify::otp($db, $u, $ch, $code);
        Audit::log($db, $u['id'], 'tfa_send', 'user', $u['id'], ['purpose' => $purpose, 'ch' => $ch]);
        return self::info($row, $u);
    }

    private static function open(Db $db, $cid, $uid, array $purposes)
    {
        $row = $db->one('SELECT * FROM {auth_challenges} WHERE id=? AND user_id=?', [(int)$cid, (int)$uid]);
        if (!$row || $row['consumed_at'] !== null || !in_array($row['purpose'], $purposes, true)) {
            throw new HttpError(400, 'Doğrulama isteği bulunamadı veya kullanıldı. Lütfen baştan deneyin.', 'tfa_gone');
        }
        return $row;
    }

    /** Aynı doğrulama için yeni kod (isteğe bağlı olarak diğer kanala geçerek). */
    public static function resend(Db $db, array $u, $cid, array $purposes, $switch = false)
    {
        $row = self::open($db, $cid, $u['id'], $purposes);
        $ch = $row['channel'];
        if ($switch) {
            if ($row['purpose'] === 'enable') {
                throw new HttpError(400, 'Açılan yöntem için kanal değiştirilemez.', 'tfa_switch');
            }
            $ch = $ch === 'sms' ? 'mail' : 'sms';
            if (!self::channelOk($db, $u, $ch)) {
                throw new HttpError(422, $ch === 'sms' ? 'SMS ile doğrulama şu an kullanılamıyor.' : 'Hesabınızda e-posta adresi yok.', 'tfa_channel');
            }
        }
        self::limit($u['id'], $ch);
        $now = yp_now_ms();
        $code = self::newCode();
        $db->exec('UPDATE {auth_challenges} SET channel=?, code_hash=?, expires_at=?, tries=0, sends=sends+1, sent_at=? WHERE id=? AND consumed_at IS NULL',
            [$ch, self::hashCode($row['id'], $code), $now + self::TTL_MS, $now, (int)$row['id']]);
        Notify::otp($db, $u, $ch, $code);
        Audit::log($db, $u['id'], $switch ? 'tfa_switch' : 'tfa_resend', 'user', $u['id'], ['ch' => $ch]);
        return self::info($db->one('SELECT * FROM {auth_challenges} WHERE id=?', [(int)$row['id']]), $u);
    }

    /** Kodu doğrular; başarılıysa doğrulama satırını döndürür (tek kullanımlık). */
    public static function verify(Db $db, $cid, $uid, $code, array $purposes)
    {
        $row = self::open($db, $cid, $uid, $purposes);
        $now = yp_now_ms();
        if ((int)$row['tries'] >= self::MAX_TRIES) {
            $db->exec('UPDATE {auth_challenges} SET consumed_at=? WHERE id=?', [$now, (int)$row['id']]);
            throw new HttpError(429, 'Çok fazla hatalı deneme. Lütfen baştan deneyin.', 'tfa_locked');
        }
        if ($now > (int)$row['expires_at']) {
            throw new HttpError(400, 'Kodun süresi doldu. “Kodu tekrar gönder” ile yeni kod isteyin.', 'tfa_expired');
        }
        $code = preg_replace('/\D/', '', (string)$code);
        if (strlen($code) !== 6 || !hash_equals((string)$row['code_hash'], self::hashCode($row['id'], $code))) {
            $db->exec('UPDATE {auth_challenges} SET tries=tries+1 WHERE id=?', [(int)$row['id']]);
            $left = self::MAX_TRIES - ((int)$row['tries'] + 1);
            Audit::log($db, $uid, 'tfa_fail', 'user', $uid, ['purpose' => $row['purpose']]);
            if ($left <= 0) {
                $db->exec('UPDATE {auth_challenges} SET consumed_at=? WHERE id=?', [$now, (int)$row['id']]);
                throw new HttpError(429, 'Çok fazla hatalı deneme. Lütfen baştan deneyin.', 'tfa_locked');
            }
            throw new HttpError(400, 'Kod hatalı. Kalan deneme hakkı: ' . $left, 'tfa_bad', ['remaining' => $left]);
        }
        if (!$db->exec('UPDATE {auth_challenges} SET consumed_at=? WHERE id=? AND consumed_at IS NULL', [$now, (int)$row['id']])) {
            throw new HttpError(400, 'Doğrulama isteği bulunamadı veya kullanıldı. Lütfen baştan deneyin.', 'tfa_gone');
        }
        return $row;
    }

    /* ---------- güvenilir cihaz: kod bir kez girilince bu tarayıcıda X dakika tekrar sorulmaz ---------- */

    const TRUST_COOKIE = 'YPT';
    const TRUST_DEFAULT = 180;
    const TRUST_MAX = 43200; // 30 gün

    /** Yönetimden ayarlanan süre (dakika). 0 = her girişte kod iste. */
    public static function trustMinutes(?Db $db = null)
    {
        $s = Settings::get('site', $db);
        $m = isset($s['tfaTrustMin']) && is_numeric($s['tfaTrustMin']) ? (int)$s['tfaTrustMin'] : self::TRUST_DEFAULT;
        return max(0, min(self::TRUST_MAX, $m));
    }

    /** İmza; şifre, 2FA kanalı ya da "tüm oturumları kapat" (session_ver) değişirse eski çerez geçersiz olur. */
    private static function trustSig(array $u, $exp)
    {
        return hash_hmac('sha256', 'trust|' . (int)$u['id'] . '|' . (int)$exp . '|' . (string)$u['tfa'] . '|'
            . (int)$u['session_ver'] . '|' . (string)$u['pass_hash'], Store::pepper());
    }

    /** Başarılı kod girişinden sonra çağrılır. */
    public static function trust(Db $db, array $u)
    {
        $min = self::trustMinutes($db);
        if ($min <= 0 || headers_sent()) {
            return;
        }
        $exp = time() + 60 * $min;
        $_COOKIE[self::TRUST_COOKIE] = (int)$u['id'] . '.' . $exp . '.' . self::trustSig($u, $exp);
        setcookie(self::TRUST_COOKIE, $_COOKIE[self::TRUST_COOKIE], [
            'expires' => $exp, 'path' => '/', 'domain' => '', 'secure' => yp_is_https(), 'httponly' => true, 'samesite' => 'Lax',
        ]);
    }

    /** Bu tarayıcı, bu kullanıcı için süresi dolmamış bir doğrulama taşıyor mu? */
    public static function trusted(Db $db, array $u)
    {
        $c = isset($_COOKIE[self::TRUST_COOKIE]) && is_string($_COOKIE[self::TRUST_COOKIE]) ? $_COOKIE[self::TRUST_COOKIE] : '';
        if (!preg_match('/^(\d{1,12})\.(\d{9,12})\.([a-f0-9]{64})$/', $c, $m)) {
            return false;
        }
        if ((int)$m[1] !== (int)$u['id'] || (int)$m[2] < time() || self::trustMinutes($db) <= 0) {
            return false;
        }
        // Yönetici süreyi kısaltırsa eski uzun çerezler de kısalır
        if ((int)$m[2] > time() + 60 * self::trustMinutes($db) + 60) {
            return false;
        }
        return hash_equals(self::trustSig($u, (int)$m[2]), $m[3]);
    }
}
