<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;
use YP\Http\Req;

/**
 * Üye ve çalışan için tek oturum.
 * - Çerez YPS: HttpOnly, Secure (https), SameSite=Lax (PayTR dönüşünde oturum düşmesin diye Strict değil).
 * - Oturum dosyaları storage/sessions; istek başında okunur ve HEMEN kapatılır (read_and_close), yalnız
 *   giriş/çıkış/2FA/dokunma anında yazılır. Böylece yoklama (poll) istekleri birbirini kilitlemez.
 * - users.session_ver her istekte karşılaştırılır: yasaklama veya şifre değişikliği diğer oturumları düşürür.
 * - Hareketsizlik: çalışan/yönetici 2 saat; üye 12 saat, "beni hatırla" ile 30 gün.
 */
final class Auth
{
    const COOKIE = 'YPS';
    const IDLE_STAFF = 7200;
    const IDLE_MEMBER = 43200;
    const REMEMBER = 2592000;
    const DUMMY_HASH = '$2y$10$JOEOy2YiRyiWWFHhMHTsH.UyXYlJ8woFYlPTxdurdYLM5wpieYwfe';

    /** @var array|null geçerli kullanıcı satırı */
    public static $user = null;
    /** @var array oturum verisinin kopyası */
    public static $sess = [];
    /** oturum vardı ama süresi doldu / geçersizleşti */
    public static $expired = false;

    public static function reset()
    {
        self::$user = null;
        self::$sess = [];
        self::$expired = false;
    }

    private static function configure($lifetime = 0)
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        @ini_set('session.use_strict_mode', '1');
        @ini_set('session.use_only_cookies', '1');
        @ini_set('session.use_trans_sid', '0');
        @ini_set('session.cookie_httponly', '1');
        @ini_set('session.gc_maxlifetime', (string)self::REMEMBER);
        @ini_set('session.gc_probability', '1');
        @ini_set('session.gc_divisor', '200');
        $dir = YP_STORAGE . '/sessions';
        if (!is_dir($dir)) {
            try {
                yp_ensure_dir($dir);
            } catch (\Throwable $e) {
            }
        }
        if (is_dir($dir) && is_writable($dir)) {
            session_save_path($dir);
        }
        session_cache_limiter('');
        session_name(self::COOKIE);
        session_set_cookie_params([
            'lifetime' => (int)$lifetime, 'path' => '/', 'domain' => '', 'secure' => yp_is_https(), 'httponly' => true, 'samesite' => 'Lax',
        ]);
    }

    private static function hasCookie()
    {
        return isset($_COOKIE[self::COOKIE]) && is_string($_COOKIE[self::COOKIE]) && preg_match('/^[A-Za-z0-9,\-]{22,256}$/', $_COOKIE[self::COOKIE]);
    }

    /** Oturumu kilitlemeden okur */
    private static function read()
    {
        if (!self::hasCookie()) {
            return [];
        }
        self::configure();
        @session_start(['read_and_close' => true]);
        return isset($_SESSION) && is_array($_SESSION) ? $_SESSION : [];
    }

    /** Oturumu açıp $fn(&$sess) ile değiştirir ve kapatır (yoksa oluşturur). */
    public static function write(callable $fn, $lifetime = 0)
    {
        self::configure($lifetime);
        session_start();
        $fn($_SESSION);
        self::$sess = $_SESSION;
        session_write_close();
    }

    public static function idleFor(array $u, array $s)
    {
        if (in_array($u['role'], ['staff', 'admin'], true)) {
            return self::IDLE_STAFF;
        }
        return !empty($s['rem']) ? self::REMEMBER : self::IDLE_MEMBER;
    }

    /** Oturum verisi + kullanıcı satırı geçerli mi? (saf işlev; testlerde kullanılır) */
    public static function sessionValid($u, array $s, $now)
    {
        if (!$u || empty($s['uid']) || (int)$u['id'] !== (int)$s['uid']) {
            return false;
        }
        if ($u['status'] !== 'active') {
            return false;
        }
        if (!isset($s['sv']) || (int)$s['sv'] !== (int)$u['session_ver']) {
            return false;
        }
        return !empty($s['t']) && $now - (int)$s['t'] <= self::idleFor($u, $s);
    }

    /** Her istek başında: oturumu okur, kullanıcıyı doğrular. */
    public static function boot(Db $db, Req $req)
    {
        self::reset();
        $s = self::read();
        self::$sess = $s;
        if (empty($s['uid'])) {
            return;
        }
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$s['uid']]);
        $now = time();
        if (!self::sessionValid($u, $s, $now)) {
            self::$expired = true;
            self::write(function (&$x) {
                $csrf = isset($x['csrf']) ? $x['csrf'] : null;
                $x = $csrf ? ['csrf' => $csrf] : [];
            });
            return;
        }
        self::$user = $u;
        if ($now - (int)$s['t'] > 60) {
            self::write(function (&$x) use ($now) {
                $x['t'] = $now;
            });
            $db->exec('UPDATE {users} SET last_seen=? WHERE id=?', [yp_now_ms(), (int)$u['id']]);
        }
    }

    public static function csrf()
    {
        if (empty(self::$sess['csrf'])) {
            self::write(function (&$x) {
                if (empty($x['csrf'])) {
                    $x['csrf'] = bin2hex(random_bytes(32));
                }
            });
        }
        return self::$sess['csrf'];
    }

    public static function checkCsrf(Req $req)
    {
        $h = (string)$req->header('x-csrf-token');
        $s = isset(self::$sess['csrf']) ? (string)self::$sess['csrf'] : '';
        if ($h === '' || $s === '' || !hash_equals($s, $h)) {
            throw new HttpError(403, 'Güvenlik doğrulaması (CSRF) başarısız. Sayfayı yenileyip tekrar deneyin.', 'csrf');
        }
    }

    /** Başarılı giriş: oturum kimliği yenilenir, yeni CSRF üretilir. */
    public static function login(Db $db, array $u, $remember)
    {
        $csrf = bin2hex(random_bytes(32));
        $remember = $remember && !in_array($u['role'], ['staff', 'admin'], true);
        self::configure($remember ? self::REMEMBER : 0);
        session_start();
        session_regenerate_id(true);
        $_SESSION = ['uid' => (int)$u['id'], 'sv' => (int)$u['session_ver'], 't' => time(), 'rem' => $remember ? 1 : 0, 'csrf' => $csrf, 'iat' => time()];
        self::$sess = $_SESSION;
        session_write_close();
        self::$user = $u;
        $db->exec('UPDATE {users} SET last_seen=? WHERE id=?', [yp_now_ms(), (int)$u['id']]);
        return $csrf;
    }

    /** Çıkış: oturum verisi silinir, kimlik yenilenir; yeni (anonim) CSRF döner. */
    public static function logout()
    {
        $csrf = bin2hex(random_bytes(32));
        self::configure(0);
        session_start();
        session_regenerate_id(true);
        $_SESSION = ['csrf' => $csrf];
        self::$sess = $_SESSION;
        session_write_close();
        self::$user = null;
        return $csrf;
    }

    /** Kullanıcı adı veya e-posta + şifre. Bulunamazsa da aynı süre harcanır. */
    public static function verifyCredentials(Db $db, $login, $password)
    {
        $login = trim((string)$login);
        if ($login === '' || !is_string($password) || $password === '' || strlen($password) > 200) {
            password_verify('x', self::DUMMY_HASH);
            return null;
        }
        if (strpos($login, '@') !== false) {
            $u = $db->one('SELECT * FROM {users} WHERE email=?', [strtolower($login)]);
        } else {
            $u = $db->one('SELECT * FROM {users} WHERE name_norm=?', [Text::fold($login)]);
        }
        $ok = password_verify($password, $u ? $u['pass_hash'] : self::DUMMY_HASH);
        if (!$u || !$ok) {
            return null;
        }
        if (password_needs_rehash($u['pass_hash'], PASSWORD_DEFAULT)) {
            $db->exec('UPDATE {users} SET pass_hash=? WHERE id=?', [password_hash($password, PASSWORD_DEFAULT), (int)$u['id']]);
        }
        return $u;
    }

    public static function hash($password)
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    /** Diğer tüm oturumları geçersiz kılar. Dönüş: yeni sürüm. */
    public static function bumpSessionVer(Db $db, $userId)
    {
        $db->exec('UPDATE {users} SET session_ver=session_ver+1 WHERE id=?', [(int)$userId]);
        return (int)$db->val('SELECT session_ver FROM {users} WHERE id=?', [(int)$userId]);
    }

    /** Kendi oturumunu yeni sürüme taşır (şifre değişince bu cihaz açık kalsın). */
    public static function keepCurrent($newVer)
    {
        self::write(function (&$x) use ($newVer) {
            $x['sv'] = (int)$newVer;
        });
        if (self::$user) {
            self::$user['session_ver'] = (int)$newVer;
        }
    }

    public static function requireUser()
    {
        if (!self::$user) {
            throw self::$expired
                ? new HttpError(401, 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.', 'auth')
                : HttpError::auth();
        }
        return self::$user;
    }

    public static function requireStaff($perm = null)
    {
        $u = self::requireUser();
        if (!Perm::isStaff($u)) {
            throw new HttpError(403, 'Bu bölüm yalnız yetkili çalışanlar içindir.', 'forbidden');
        }
        if ($perm !== null && !Perm::has($u, $perm)) {
            throw HttpError::forbidden();
        }
        return $u;
    }
}
