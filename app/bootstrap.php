<?php
/**
 * yangpazar · uygulama başlatıcı (app/bootstrap.php)
 *
 * api/_lib.php içindeki yardımcıları (şifreleme, atomik dosya yazımı, yp_http, yp_str, PayTR…) yeniden kullanır,
 * YP\ sınıfları için basit bir otomatik yükleyici kurar. Composer gerekmez.
 *
 * Bu dosyada düzenlenecek değer yoktur. Ayarlar veritabanında (settings) ve storage/ içinde şifreli tutulur.
 */
if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && @realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
if (defined('YP_APP')) {
    return;
}

define('YP_APP', __DIR__);
define('YP_ROOT', dirname(__DIR__));
if (!defined('YP_STORAGE')) {
    define('YP_STORAGE', YP_ROOT . '/storage');
}
define('YP_APP_VERSION', '0.3.0-p1');

require_once YP_ROOT . '/api/_lib.php';

spl_autoload_register(function ($cls) {
    if (strncmp($cls, 'YP\\', 3) !== 0) {
        return;
    }
    $rel = str_replace('\\', '/', substr($cls, 3));
    if (!preg_match('#^[A-Za-z0-9_/]+$#', $rel)) {
        return;
    }
    $f = YP_APP . '/src/' . $rel . '.php';
    if (is_file($f)) {
        require_once $f;
    }
});

/** Yalnız test ortamı: YP_TEST=1 ortam değişkeni (üretimde asla ayarlanmaz). */
function yp_test_mode()
{
    return getenv('YP_TEST') === '1';
}

/** Şu anki zaman (ms). Testlerde YP_TEST_NOW ile sabitlenebilir. */
function yp_now_ms()
{
    if (yp_test_mode()) {
        $n = getenv('YP_TEST_NOW');
        if ($n !== false && $n !== '' && ctype_digit($n)) {
            return (int)$n;
        }
    }
    return (int)floor(microtime(true) * 1000);
}
