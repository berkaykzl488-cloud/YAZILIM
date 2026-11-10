<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use RuntimeException;

/**
 * storage/ klasörü: şifreleme anahtarı, şifreli veritabanı bilgileri (db.php), uygulama sırları (app.php),
 * kurulum işareti. Biçim api/data ile aynı: "<?php return '<base64>';" (doğrudan açılırsa hiçbir şey göstermez).
 */
final class Store
{
    public static function path($name)
    {
        if (!preg_match('/^[a-z0-9_]{1,40}$/', $name)) {
            throw new RuntimeException('Geçersiz depo adı.');
        }
        return YP_STORAGE . '/' . $name . '.php';
    }

    public static function exists($name)
    {
        return is_file(self::path($name));
    }

    /** Anahtarı yükler; yoksa false. api/ paketinin anahtarından BAĞIMSIZDIR (storage/anahtar.php). */
    public static function loadKey()
    {
        $raw = yp_read_php_string(self::path('anahtar'));
        $k = $raw === null ? false : base64_decode($raw, true);
        if ($k === false || strlen($k) !== 32) {
            return false;
        }
        $GLOBALS['yp_key'] = $k;
        return true;
    }

    public static function createKey()
    {
        if (self::loadKey()) {
            return;
        }
        $key = random_bytes(32);
        yp_write_php_string(self::path('anahtar'), base64_encode($key));
        $GLOBALS['yp_key'] = $key;
    }

    public static function requireKey()
    {
        if (!self::loadKey()) {
            throw new RuntimeException('Şifreleme anahtarı (storage/anahtar.php) bulunamadı.');
        }
    }

    public static function read($name)
    {
        $b64 = yp_read_php_string(self::path($name));
        if ($b64 === null || $b64 === '') {
            return [];
        }
        self::requireKey();
        $d = json_decode(yp_decrypt($b64), true);
        return is_array($d) ? $d : [];
    }

    public static function write($name, array $data)
    {
        self::requireKey();
        yp_ensure_dir(YP_STORAGE);
        yp_write_php_string(self::path($name), yp_encrypt(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));
    }

    public static function delete($name)
    {
        @unlink(self::path($name));
    }

    public static function dbConfig()
    {
        return self::exists('db') ? self::read('db') : null;
    }

    /** Uygulama sırları: pepper (HMAC), cron_key, install_id */
    public static function app()
    {
        static $c = null;
        if ($c === null) {
            $c = self::exists('app') ? self::read('app') : [];
        }
        return $c;
    }

    public static function pepper()
    {
        $a = self::app();
        if (empty($a['pepper'])) {
            throw new RuntimeException('Uygulama sırrı (pepper) bulunamadı. Kurulum tamamlanmamış.');
        }
        return base64_decode($a['pepper']);
    }

    public static function installed()
    {
        return is_file(YP_STORAGE . '/kurulum_tamam.php');
    }

    public static function ensureDirs()
    {
        foreach (['', '/rl', '/log', '/sessions', '/media', '/backups', '/cache'] as $d) {
            yp_ensure_dir(YP_STORAGE . $d);
        }
    }
}
