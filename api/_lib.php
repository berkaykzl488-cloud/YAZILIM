<?php
/**
 * yangpazar.com API paketi · ortak kitaplık (_lib.php)
 *
 * BU DOSYADA DÜZENLENECEK HİÇBİR DEĞER YOKTUR.
 * Tüm ayarlar (PayTR, Paraşüt, Bizim Hesap) Yönetim › Entegrasyonlar sayfasından yapılır
 * ve data/ klasöründe ŞİFRELİ olarak saklanır.
 *
 * PHP 7.4 – 8.3 uyumlu. Composer / MySQL gerekmez.
 */

// Doğrudan çağrılırsa hiçbir şey gösterme.
if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && @realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

define('YP_VERSION', '1.0');
define('YP_DIR', __DIR__);
define('YP_DATA', __DIR__ . '/data');
define('YP_MAX_BODY', 65536);
define('YP_SESSION_IDLE', 7200);           // 2 saat hareketsizlikte oturum düşer
define('YP_PAYTR_TOKEN_URL', 'https://www.paytr.com/odeme/api/get-token');
define('YP_PAYTR_REPORT_URL', 'https://www.paytr.com/rapor/islem-dokumu');

error_reporting(E_ALL);
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');

$GLOBALS['yp_text_mode'] = false;   // paytr_bildirim.php düz metin yanıt verir
$GLOBALS['yp_key'] = null;

/* ------------------------------------------------------------------ *
 *  Başlatma, hata yakalama, yanıt
 * ------------------------------------------------------------------ */

/**
 * Her uç noktanın en başında çağrılır.
 * $opt: methods => ['GET','POST'], origin => bool (aynı-origin zorunlu), text => bool
 */
function yp_boot(array $opt = [])
{
    $GLOBALS['yp_text_mode'] = !empty($opt['text']);

    set_error_handler(function ($no, $str, $file, $line) {
        if (!(error_reporting() & $no)) {
            return false; // @ ile susturulmuş
        }
        throw new ErrorException($str, 0, $no, $file, $line);
    });

    set_exception_handler(function ($e) {
        yp_log('hata', 'Yakalanmamış hata: ' . get_class($e) . ': ' . $e->getMessage(), [
            'dosya' => basename($e->getFile()) . ':' . $e->getLine(),
        ]);
        if ($GLOBALS['yp_text_mode']) {
            yp_text('PAYTR notification failed: server error', 500);
        }
        yp_error('Sunucuda beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.', 'server_error', 500);
    });

    register_shutdown_function(function () {
        $e = error_get_last();
        if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            yp_log('hata', 'Ölümcül hata: ' . $e['message'], ['dosya' => basename($e['file']) . ':' . $e['line']]);
            if (!headers_sent()) {
                if ($GLOBALS['yp_text_mode']) {
                    header('Content-Type: text/plain; charset=utf-8', true, 500);
                    echo 'PAYTR notification failed: server error';
                } else {
                    header('Content-Type: application/json; charset=utf-8', true, 500);
                    echo '{"ok":false,"error":"Sunucuda beklenmeyen bir hata oluştu.","code":"server_error"}';
                }
            }
        }
    });

    if (!headers_sent()) {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header('Cache-Control: no-store, max-age=0');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        header_remove('X-Powered-By');
    }

    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';

    // CORS: yalnızca aynı origin. Hiçbir Access-Control-Allow-* başlığı gönderilmez,
    // böylece başka sitelerden gelen tarayıcı istekleri yanıtı okuyamaz.
    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    $methods = isset($opt['methods']) ? $opt['methods'] : ['GET'];
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        if ($GLOBALS['yp_text_mode']) {
            yp_text('PAYTR notification failed: method not allowed', 405);
        }
        yp_error('Bu adres bu yöntemle (' . $method . ') kullanılamaz.', 'method', 405);
    }

    if (!array_key_exists('origin', $opt) || $opt['origin']) {
        yp_check_origin();
    }
}

function yp_json(array $data, $http = 200)
{
    if (!headers_sent()) {
        http_response_code($http);
        header('Content-Type: application/json; charset=utf-8');
    }
    $out = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    echo $out === false ? '{"ok":false,"error":"Yanıt oluşturulamadı.","code":"encode"}' : $out;
    exit;
}

function yp_error($msg, $code = 'error', $http = 400, array $extra = [])
{
    yp_json(array_merge(['ok' => false, 'error' => $msg, 'code' => $code], $extra), $http);
}

function yp_text($txt, $http = 200)
{
    if (!headers_sent()) {
        http_response_code($http);
        header('Content-Type: text/plain; charset=utf-8');
    }
    echo $txt;
    exit;
}

/* ------------------------------------------------------------------ *
 *  İstek yardımcıları
 * ------------------------------------------------------------------ */

function yp_is_https()
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    if (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443) {
        return true;
    }
    if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') {
        return true;
    }
    return false;
}

function yp_request_origin()
{
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    if (!preg_match('/^[A-Za-z0-9.\-]+(:[0-9]{1,5})?$/', $host)) {
        $host = 'localhost';
    }
    return (yp_is_https() ? 'https' : 'http') . '://' . strtolower($host);
}

/** API klasörünün URL yolu, ör. "/api/" */
function yp_api_path()
{
    $sn = isset($_SERVER['SCRIPT_NAME']) ? str_replace('\\', '/', $_SERVER['SCRIPT_NAME']) : '/api/x.php';
    $dir = rtrim(str_replace('\\', '/', dirname($sn)), '/');
    return $dir . '/';
}

function yp_origin_of($url)
{
    $p = @parse_url((string)$url);
    if (!$p || empty($p['scheme']) || empty($p['host'])) {
        return '';
    }
    $o = strtolower($p['scheme']) . '://' . strtolower($p['host']);
    if (!empty($p['port'])) {
        $o .= ':' . (int)$p['port'];
    }
    return $o;
}

/** Başka bir siteden gelen tarayıcı isteklerini reddeder (CSRF / CORS savunması). */
function yp_check_origin()
{
    if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && strtolower($_SERVER['HTTP_SEC_FETCH_SITE']) === 'cross-site') {
        yp_error('Başka bir siteden gelen istekler kabul edilmez.', 'origin', 403);
    }
    if (empty($_SERVER['HTTP_ORIGIN'])) {
        return; // aynı-origin GET'ler ve sunucudan sunucuya istekler Origin göndermez
    }
    $origin = strtolower(rtrim($_SERVER['HTTP_ORIGIN'], '/'));
    $allowed = [yp_request_origin()];
    $admin = yp_admin_safe();
    if ($admin && !empty($admin['site_url'])) {
        $allowed[] = yp_origin_of($admin['site_url']);
    }
    if (!in_array($origin, $allowed, true)) {
        yp_error('Başka bir siteden gelen istekler kabul edilmez.', 'origin', 403);
    }
}

function yp_input()
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $len = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
    if ($len > YP_MAX_BODY) {
        yp_error('İstek çok büyük.', 'too_large', 413);
    }
    $ct = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($ct, 'application/json') !== false) {
        $raw = (string)@file_get_contents('php://input', false, null, 0, YP_MAX_BODY + 1);
        if (strlen($raw) > YP_MAX_BODY) {
            yp_error('İstek çok büyük.', 'too_large', 413);
        }
        if (trim($raw) === '') {
            $cache = [];
        } else {
            $d = json_decode($raw, true);
            if (!is_array($d)) {
                yp_error('İstek gövdesi geçerli bir JSON değil.', 'bad_json', 400);
            }
            $cache = $d;
        }
    } else {
        $cache = is_array($_POST) ? $_POST : [];
    }
    return $cache;
}

/** Skaler değeri güvenli, kırpılmış metne çevirir (kontrol karakterleri atılır). */
function yp_str($v, $max = 255)
{
    if (is_bool($v)) {
        return $v ? '1' : '0';
    }
    if (!is_scalar($v)) {
        return '';
    }
    $s = trim((string)$v);
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s);
    if ($s === null) {
        return ''; // geçersiz UTF-8
    }
    if (yp_strlen($s) > $max) {
        $s = function_exists('mb_substr') ? mb_substr($s, 0, $max, 'UTF-8') : substr($s, 0, $max);
    }
    return $s;
}

function yp_strlen($s)
{
    return function_exists('mb_strlen') ? mb_strlen((string)$s, 'UTF-8') : strlen((string)$s);
}

function yp_bool($v)
{
    if (is_bool($v)) {
        return $v;
    }
    if (is_int($v) || is_float($v)) {
        return $v != 0;
    }
    $s = strtolower(trim((string)$v));
    return in_array($s, ['1', 'true', 'on', 'yes', 'evet'], true);
}

/** "1.234,56" / "1234.56" / 1234.56 → float ya da null */
function yp_money($v)
{
    if (is_int($v) || is_float($v)) {
        return round((float)$v, 2);
    }
    if (!is_string($v)) {
        return null;
    }
    $s = str_replace([' ', '₺', 'TL'], '', trim($v));
    if (strpos($s, ',') !== false) {
        $s = str_replace('.', '', $s);
        $s = str_replace(',', '.', $s);
    }
    if (!preg_match('/^-?[0-9]+(\.[0-9]{1,2})?$/', $s)) {
        return null;
    }
    return round((float)$s, 2);
}

function yp_client_ip()
{
    // Yalnızca REMOTE_ADDR: X-Forwarded-For istemci tarafından taklit edilebilir.
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

/* ------------------------------------------------------------------ *
 *  Dosya depolama (kilitli, atomik)
 * ------------------------------------------------------------------ */

function yp_ensure_dir($dir)
{
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new RuntimeException('Klasör oluşturulamadı: ' . basename($dir));
        }
        @file_put_contents($dir . '/index.php', "<?php\n// boş\n");
    }
}

function yp_write_atomic($file, $content)
{
    $dir = dirname($file);
    yp_ensure_dir($dir);
    $tmp = $dir . '/.tmp-' . bin2hex(random_bytes(6)) . '.php';
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
        throw new RuntimeException('Veri dosyası yazılamadı (data/ klasörü yazılabilir değil).');
    }
    @chmod($tmp, 0600);
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('Veri dosyası kaydedilemedi.');
    }
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($file, true);
    }
}

/** Ada göre özel kilit alır; yp_unlock ile bırakılır. */
function yp_lock($name, $nonBlocking = false)
{
    yp_ensure_dir(YP_DATA);
    $h = @fopen(YP_DATA . '/.' . preg_replace('/[^a-z0-9_]/', '', $name) . '.lock', 'c');
    if (!$h) {
        throw new RuntimeException('Kilit dosyası açılamadı (data/ klasörü yazılabilir değil).');
    }
    $flags = LOCK_EX | ($nonBlocking ? LOCK_NB : 0);
    if (!flock($h, $flags)) {
        fclose($h);
        return null;
    }
    return $h;
}

function yp_unlock($h)
{
    if ($h) {
        flock($h, LOCK_UN);
        fclose($h);
    }
}

/** "<?php return '...';" biçimindeki dosyadan dizeyi okur (include KULLANMAZ → opcache sorunu yok). */
function yp_read_php_string($file)
{
    if (!is_file($file)) {
        return null;
    }
    $s = @file_get_contents($file);
    if ($s === false) {
        return null;
    }
    if (!preg_match("/return\\s+'([A-Za-z0-9+\\/=]*)';/", $s, $m)) {
        return null;
    }
    return $m[1];
}

function yp_write_php_string($file, $b64)
{
    if (!preg_match('/^[A-Za-z0-9+\/=]*$/', $b64)) {
        throw new RuntimeException('Geçersiz veri biçimi.');
    }
    $c = "<?php\n// yangpazar API veri dosyası. Şifrelidir; doğrudan açılırsa hiçbir şey göstermez. Elle düzenlemeyin.\n"
       . "return '" . $b64 . "';\n";
    yp_write_atomic($file, $c);
}

function yp_json_read($file)
{
    if (!is_file($file)) {
        return [];
    }
    $d = json_decode((string)@file_get_contents($file), true);
    return is_array($d) ? $d : [];
}

function yp_json_write($file, array $data)
{
    yp_write_atomic($file, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
}

/** Kilitli oku-değiştir-yaz (düz JSON dosyası). $fn(array $data): array */
function yp_json_update($file, callable $fn)
{
    $h = yp_lock('j_' . basename($file, '.json'));
    try {
        $data = yp_json_read($file);
        $new = $fn($data);
        if (is_array($new)) {
            yp_json_write($file, $new);
            return $new;
        }
        return $data;
    } finally {
        yp_unlock($h);
    }
}

/* ------------------------------------------------------------------ *
 *  Şifreleme (libsodium varsa secretbox, yoksa OpenSSL AES-256-GCM)
 * ------------------------------------------------------------------ */

function yp_crypto_mode()
{
    if (function_exists('sodium_crypto_secretbox')) {
        return 'sodium';
    }
    if (function_exists('openssl_encrypt') && in_array('aes-256-gcm', array_map('strtolower', openssl_get_cipher_methods()), true)) {
        return 'openssl';
    }
    return 'none';
}

function yp_key()
{
    if ($GLOBALS['yp_key'] !== null) {
        return $GLOBALS['yp_key'];
    }
    $raw = yp_read_php_string(YP_DATA . '/anahtar.php');
    $k = $raw === null ? false : base64_decode($raw, true);
    if ($k === false || strlen($k) !== 32) {
        throw new RuntimeException('Şifreleme anahtarı bulunamadı veya bozuk.');
    }
    $GLOBALS['yp_key'] = $k;
    return $k;
}

function yp_encrypt($plain)
{
    $key = yp_key();
    $mode = yp_crypto_mode();
    if ($mode === 'sodium') {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return base64_encode("\x01" . $nonce . sodium_crypto_secretbox($plain, $nonce, $key));
    }
    if ($mode === 'openssl') {
        $iv = random_bytes(12);
        $tag = '';
        $c = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'yangpazar', 16);
        if ($c === false) {
            throw new RuntimeException('Şifreleme başarısız.');
        }
        return base64_encode("\x02" . $iv . $tag . $c);
    }
    throw new RuntimeException('Sunucuda libsodium veya OpenSSL bulunamadı; ayarlar güvenle saklanamaz.');
}

function yp_decrypt($b64)
{
    $bin = base64_decode((string)$b64, true);
    if ($bin === false || strlen($bin) < 2) {
        throw new RuntimeException('Şifreli veri bozuk.');
    }
    $key = yp_key();
    $v = $bin[0];
    if ($v === "\x01") {
        if (!function_exists('sodium_crypto_secretbox_open')) {
            throw new RuntimeException('Bu veri libsodium ile şifrelenmiş; sunucuda libsodium yok.');
        }
        $nonce = substr($bin, 1, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $c = substr($bin, 1 + SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $p = sodium_crypto_secretbox_open($c, $nonce, $key);
    } elseif ($v === "\x02") {
        $iv = substr($bin, 1, 12);
        $tag = substr($bin, 13, 16);
        $c = substr($bin, 29);
        $p = openssl_decrypt($c, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'yangpazar');
    } else {
        throw new RuntimeException('Bilinmeyen şifreleme biçimi.');
    }
    if ($p === false) {
        throw new RuntimeException('Şifreli veri çözülemedi (anahtar uyuşmuyor).');
    }
    return $p;
}

/** Şifreli depo: data/{ad}.php */
function yp_store_read($name)
{
    $b64 = yp_read_php_string(YP_DATA . '/' . $name . '.php');
    if ($b64 === null || $b64 === '') {
        return [];
    }
    $d = json_decode(yp_decrypt($b64), true);
    return is_array($d) ? $d : [];
}

function yp_store_write($name, array $data)
{
    yp_write_php_string(YP_DATA . '/' . $name . '.php', yp_encrypt(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)));
}

/** Kilitli oku-değiştir-yaz (şifreli depo). */
function yp_store_update($name, callable $fn)
{
    $h = yp_lock('s_' . $name);
    try {
        $data = yp_store_read($name);
        $new = $fn($data);
        if (is_array($new)) {
            yp_store_write($name, $new);
            return $new;
        }
        return $data;
    } finally {
        yp_unlock($h);
    }
}

/* ------------------------------------------------------------------ *
 *  Kurulum / yönetici / ayarlar
 * ------------------------------------------------------------------ */

function yp_installed()
{
    return is_file(YP_DATA . '/admin.php');
}

function yp_admin()
{
    static $a = null;
    if ($a === null) {
        $a = yp_installed() ? yp_store_read('admin') : [];
    }
    return $a;
}

/** Hata fırlatmayan sürüm (origin kontrolü vb. için). */
function yp_admin_safe()
{
    try {
        return yp_installed() ? yp_admin() : [];
    } catch (Exception $e) {
        return [];
    }
}

function yp_require_installed()
{
    if (!yp_installed()) {
        yp_error('API henüz kurulmadı. Yönetim › Entegrasyonlar sayfasından kurulumu tamamlayın.', 'not_installed', 409);
    }
}

/** Sitenin kök adresi (ör. https://yangpazar.com) */
function yp_site_url()
{
    $a = yp_admin_safe();
    if (!empty($a['site_url'])) {
        return rtrim($a['site_url'], '/');
    }
    return yp_request_origin();
}

function yp_api_url($file = '')
{
    return yp_site_url() . yp_api_path() . $file;
}

function yp_settings()
{
    $s = yp_store_read('ayarlar');
    foreach (array_keys(yp_schema()) as $svc) {
        if (!isset($s[$svc]) || !is_array($s[$svc])) {
            $s[$svc] = [];
        }
        foreach (yp_schema()[$svc] as $f => $def) {
            if (!array_key_exists($f, $s[$svc])) {
                $s[$svc][$f] = isset($def['default']) ? $def['default'] : '';
            }
        }
    }
    return $s;
}

/**
 * Servis alanları. secret: id (baş 2 karakter görünür) | secret (son 2 görünür) | pw (hiç görünmez)
 * Gizli alan boş (veya maskeli değer) gönderilirse mevcut değer KORUNUR.
 */
function yp_schema()
{
    return [
        'paytr' => [
            'merchant_id'     => ['label' => 'Mağaza No', 'type' => 'str', 'secret' => 'id', 'pattern' => '/^[0-9]{1,20}$/', 'hint' => 'yalnızca rakam', 'required' => true],
            'merchant_key'    => ['label' => 'Mağaza Parola (merchant_key)', 'type' => 'str', 'secret' => 'secret', 'pattern' => '/^[A-Za-z0-9]{6,64}$/', 'hint' => 'harf ve rakam, 6–64 karakter', 'required' => true],
            'merchant_salt'   => ['label' => 'Mağaza Gizli Anahtar (merchant_salt)', 'type' => 'str', 'secret' => 'secret', 'pattern' => '/^[A-Za-z0-9]{6,64}$/', 'hint' => 'harf ve rakam, 6–64 karakter', 'required' => true],
            'test_mode'       => ['label' => 'Test modu', 'type' => 'bool', 'default' => true],
            'max_installment' => ['label' => 'En fazla taksit', 'type' => 'int', 'min' => 0, 'max' => 12, 'default' => 0],
            'ok_url'          => ['label' => 'Başarılı ödeme sayfası', 'type' => 'url'],
            'fail_url'        => ['label' => 'Hatalı ödeme sayfası', 'type' => 'url'],
        ],
        'parasut' => [
            'company_id'      => ['label' => 'Firma No (company_id)', 'type' => 'str', 'pattern' => '/^[0-9]{1,20}$/', 'hint' => 'yalnızca rakam', 'required' => true],
            'client_id'       => ['label' => 'Client ID', 'type' => 'str', 'secret' => 'secret', 'pattern' => '/^[A-Za-z0-9_\-]{8,200}$/', 'hint' => 'harf, rakam, - ve _', 'required' => true],
            'client_secret'   => ['label' => 'Client Secret', 'type' => 'str', 'secret' => 'secret', 'pattern' => '/^[A-Za-z0-9_\-]{8,200}$/', 'hint' => 'harf, rakam, - ve _', 'required' => true],
            'username'        => ['label' => 'Kullanıcı e-postası', 'type' => 'email', 'required' => true],
            'password'        => ['label' => 'Şifre', 'type' => 'str', 'secret' => 'pw', 'max' => 200, 'required' => true],
            'account_id'      => ['label' => 'Kasa/Banka hesap No (isteğe bağlı)', 'type' => 'str', 'pattern' => '/^[0-9]{0,20}$/', 'hint' => 'yalnızca rakam'],
            'hakedis_kaydi'   => ['label' => 'PayTR tahsilatlarını otomatik kaydet', 'type' => 'bool', 'default' => false],
        ],
        'bizimhesap' => [
            'firm_id'         => ['label' => 'Firma ID (Token)', 'type' => 'str', 'secret' => 'id', 'pattern' => '/^[A-Za-z0-9\-]{4,64}$/', 'hint' => 'harf, rakam ve -', 'required' => true],
            'api_key'         => ['label' => 'API anahtarı (Key)', 'type' => 'str', 'secret' => 'secret', 'pattern' => '/^[A-Za-z0-9\-]{0,128}$/', 'hint' => 'harf, rakam ve -'],
        ],
    ];
}

function yp_service_configured(array $settings, $svc)
{
    foreach (yp_schema()[$svc] as $f => $def) {
        if (!empty($def['required']) && (!isset($settings[$svc][$f]) || $settings[$svc][$f] === '')) {
            return false;
        }
    }
    return true;
}

/* ------------------------------------------------------------------ *
 *  Maskeleme
 * ------------------------------------------------------------------ */

function yp_substr($s, $start, $len = null)
{
    if (function_exists('mb_substr')) {
        return mb_substr($s, $start, $len, 'UTF-8');
    }
    return $len === null ? substr($s, $start) : substr($s, $start, $len);
}

function yp_mask_secret($v)
{
    $v = (string)$v;
    if ($v === '') {
        return '';
    }
    if (yp_strlen($v) < 8) {
        return '••••';
    }
    return '••••••' . yp_substr($v, -2);
}

function yp_mask_id($v)
{
    $v = (string)$v;
    if ($v === '') {
        return '';
    }
    if (yp_strlen($v) <= 3) {
        return '****';
    }
    return yp_substr($v, 0, 2) . '****';
}

function yp_mask_value($v, $kind)
{
    if ($kind === 'id') {
        return yp_mask_id($v);
    }
    if ($kind === 'pw') {
        return (string)$v === '' ? '' : '••••';
    }
    return yp_mask_secret($v);
}

function yp_is_masked_input($v)
{
    $v = (string)$v;
    return strpos($v, '•') !== false || strpos($v, '****') !== false || strpos($v, '…') !== false;
}

function yp_masked_service(array $settings, $svc)
{
    $out = [];
    foreach (yp_schema()[$svc] as $f => $def) {
        $val = isset($settings[$svc][$f]) ? $settings[$svc][$f] : (isset($def['default']) ? $def['default'] : '');
        if (!empty($def['secret'])) {
            $out[$f] = yp_mask_value($val, $def['secret']);
        } else {
            $out[$f] = $val;
        }
    }
    return $out;
}

/** Log/hata bağlamındaki gizli alanları maskeler. */
function yp_redact($data)
{
    if (!is_array($data)) {
        return $data;
    }
    $out = [];
    foreach ($data as $k => $v) {
        if (is_array($v)) {
            $out[$k] = yp_redact($v);
        } elseif (preg_match('/key|salt|secret|pass|sifre|şifre|token|hash|authorization|iban|tckn|tax_number|email|tel|phone/i', (string)$k)) {
            $out[$k] = is_scalar($v) && (string)$v !== '' ? yp_mask_secret((string)$v) : $v;
        } else {
            $out[$k] = is_string($v) ? yp_str($v, 300) : $v;
        }
    }
    return $out;
}

/* ------------------------------------------------------------------ *
 *  Log (sırlar maskelenir)
 * ------------------------------------------------------------------ */

function yp_log($channel, $msg, array $ctx = [])
{
    try {
        $dir = YP_DATA . '/log';
        if (!is_dir(YP_DATA)) {
            return;
        }
        yp_ensure_dir($dir);
        $line = date('c') . ' [' . preg_replace('/[^a-z_]/', '', $channel) . '] '
              . str_replace(["\r", "\n"], ' ', (string)$msg);
        if ($ctx) {
            $line .= ' ' . json_encode(yp_redact($ctx), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        @file_put_contents($dir . '/' . date('Y-m') . '.log', $line . "\n", FILE_APPEND | LOCK_EX);
    } catch (Exception $e) {
        // log yazılamazsa sessizce geç
    }
}

/* ------------------------------------------------------------------ *
 *  Oturum + CSRF
 * ------------------------------------------------------------------ */

function yp_session_start()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.use_only_cookies', '1');
    @ini_set('session.use_trans_sid', '0');
    @ini_set('session.cookie_httponly', '1');
    session_name('YPAPI');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => yp_api_path(),
        'domain'   => '',
        'secure'   => yp_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function yp_logged_in()
{
    if (!isset($_COOKIE['YPAPI']) || !yp_installed()) {
        return false;
    }
    yp_session_start();
    $a = yp_admin();
    if (empty($_SESSION['yp_auth']) || empty($a['install_id']) || !isset($_SESSION['yp_iid'])
        || !hash_equals((string)$a['install_id'], (string)$_SESSION['yp_iid'])) {
        return false;
    }
    if (empty($_SESSION['yp_t']) || time() - (int)$_SESSION['yp_t'] > YP_SESSION_IDLE) {
        $_SESSION = [];
        return false;
    }
    $_SESSION['yp_t'] = time();
    return true;
}

function yp_require_auth()
{
    yp_require_installed();
    if (!yp_logged_in()) {
        yp_error('Oturum açmanız gerekiyor. Lütfen API şifrenizle giriş yapın.', 'auth', 401);
    }
}

function yp_require_csrf()
{
    $h = isset($_SERVER['HTTP_X_CSRF_TOKEN']) ? (string)$_SERVER['HTTP_X_CSRF_TOKEN'] : '';
    $s = isset($_SESSION['yp_csrf']) ? (string)$_SESSION['yp_csrf'] : '';
    if ($h === '' || $s === '' || !hash_equals($s, $h)) {
        yp_error('Güvenlik doğrulaması (CSRF) başarısız. Sayfayı yenileyip tekrar deneyin.', 'csrf', 403);
    }
}

/** Başarılı giriş/kurulum sonrası: oturum kimliğini yenile, CSRF üret. */
function yp_login_session(array $admin)
{
    yp_session_start();
    session_regenerate_id(true);
    $_SESSION = [
        'yp_auth' => true,
        'yp_iid'  => (string)$admin['install_id'],
        'yp_t'    => time(),
        'yp_csrf' => bin2hex(random_bytes(32)),
    ];
    return $_SESSION['yp_csrf'];
}

/* ------------------------------------------------------------------ *
 *  Hız sınırı (dosya tabanlı, IP başına)
 * ------------------------------------------------------------------ */

function yp_rl_file($bucket)
{
    return YP_DATA . '/rl/' . hash('sha256', $bucket . '|' . yp_client_ip()) . '.json';
}

function yp_rl_load($fh, $window)
{
    rewind($fh);
    $d = json_decode((string)stream_get_contents($fh), true);
    $now = time();
    $out = [];
    if (is_array($d)) {
        foreach ($d as $t) {
            if (is_int($t) && $t > $now - $window) {
                $out[] = $t;
            }
        }
    }
    return $out;
}

/**
 * $add=true: isteği say. Dönüş: ['allowed'=>bool, 'retry'=>saniye, 'count'=>int]
 */
function yp_rl($bucket, $limit, $window, $add = true)
{
    yp_ensure_dir(YP_DATA . '/rl');
    if (mt_rand(1, 100) === 1) {
        yp_rl_gc();
    }
    $fh = @fopen(yp_rl_file($bucket), 'c+');
    if (!$fh) {
        return ['allowed' => true, 'retry' => 0, 'count' => 0];
    }
    flock($fh, LOCK_EX);
    $hits = yp_rl_load($fh, $window);
    $allowed = count($hits) < $limit;
    if ($add && $allowed) {
        $hits[] = time();
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($hits));
    flock($fh, LOCK_UN);
    fclose($fh);
    $retry = $allowed || !$hits ? 0 : max(1, min($hits) + $window - time());
    return ['allowed' => $allowed, 'retry' => $retry, 'count' => count($hits)];
}

/** Sınırı aşmışsa 429 ile durdurur. */
function yp_rl_enforce($bucket, $limit, $window, $add = true)
{
    $r = yp_rl($bucket, $limit, $window, $add);
    if (!$r['allowed']) {
        header('Retry-After: ' . $r['retry']);
        yp_error('Çok fazla deneme yapıldı. Lütfen ' . max(1, (int)ceil($r['retry'] / 60)) . ' dakika sonra tekrar deneyin.', 'rate_limit', 429, ['retry_after' => $r['retry']]);
    }
    return $r;
}

function yp_rl_add($bucket, $window)
{
    return yp_rl($bucket, PHP_INT_MAX, $window, true);
}

function yp_rl_reset($bucket)
{
    @unlink(yp_rl_file($bucket));
}

function yp_rl_gc()
{
    foreach ((array)@glob(YP_DATA . '/rl/*.json') as $f) {
        if ($f && @filemtime($f) < time() - 86400) {
            @unlink($f);
        }
    }
}

/* ------------------------------------------------------------------ *
 *  Dışa HTTP (cURL, zaman aşımlı)
 * ------------------------------------------------------------------ */

function yp_curl_error_tr($errno)
{
    $map = [
        6  => 'Sunucu adı çözülemedi (DNS).',
        7  => 'Karşı sunucuya bağlanılamadı.',
        28 => 'Bağlantı zaman aşımına uğradı.',
        35 => 'Güvenli bağlantı (SSL) kurulamadı.',
        51 => 'Karşı sunucunun SSL sertifikası doğrulanamadı.',
        56 => 'Bağlantı kesildi; hosting güvenlik duvarı dış bağlantıyı engelliyor olabilir.',
        58 => 'SSL sertifika hatası.',
        60 => 'Karşı sunucunun SSL sertifikası doğrulanamadı (sunucunun CA paketi eski olabilir).',
    ];
    $m = isset($map[$errno]) ? $map[$errno] : 'Bağlantı hatası.';
    return $m . ' (cURL #' . (int)$errno . ')';
}

/**
 * $o: headers[], form[], json[], timeout, connect_timeout
 * Dönüş: ['ok'=>bool(2xx), 'code'=>int, 'body'=>string, 'json'=>array|null, 'error'=>string(ağ hatası)]
 */
function yp_http($method, $url, array $o = [])
{
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'code' => 0, 'body' => '', 'json' => null,
                'error' => 'Sunucunuzda PHP cURL eklentisi kurulu değil. Hosting firmanızdan açmasını isteyin.'];
    }
    $headers = isset($o['headers']) ? $o['headers'] : [];
    $headers[] = 'Accept: application/json';
    $opts = [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => isset($o['connect_timeout']) ? (int)$o['connect_timeout'] : 10,
        CURLOPT_TIMEOUT        => isset($o['timeout']) ? (int)$o['timeout'] : 25,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADER         => false,
        CURLOPT_USERAGENT      => 'yangpazar-api/' . YP_VERSION,
    ];
    if (defined('CURLOPT_PROTOCOLS') && defined('CURLPROTO_HTTPS')) {
        $opts[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
    }
    if ($method === 'POST') {
        $opts[CURLOPT_POST] = true;
        if (isset($o['json'])) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($o['json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $headers[] = 'Content-Type: application/json';
        } elseif (isset($o['form'])) {
            $opts[CURLOPT_POSTFIELDS] = http_build_query($o['form'], '', '&');
        } else {
            $opts[CURLOPT_POSTFIELDS] = '';
        }
    } elseif ($method !== 'GET') {
        $opts[CURLOPT_CUSTOMREQUEST] = $method;
    }
    $opts[CURLOPT_HTTPHEADER] = $headers;

    $ch = curl_init();
    curl_setopt_array($ch, $opts);
    $body = curl_exec($ch);
    $errno = curl_errno($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $errno) {
        return ['ok' => false, 'code' => $code, 'body' => '', 'json' => null, 'error' => yp_curl_error_tr($errno)];
    }
    $json = json_decode((string)$body, true);
    return ['ok' => $code >= 200 && $code < 300, 'code' => $code, 'body' => (string)$body,
            'json' => is_array($json) ? $json : null, 'error' => ''];
}

/* ------------------------------------------------------------------ *
 *  PayTR (formüller: PayTR resmi entegrasyon örnekleri ile doğrulandı)
 * ------------------------------------------------------------------ */

/** iFrame API (kart) paytr_token */
function yp_paytr_iframe_hash($merchantId, $userIp, $merchantOid, $email, $paymentAmount, $userBasket,
                              $noInstallment, $maxInstallment, $currency, $testMode, $merchantSalt, $merchantKey)
{
    $hashStr = $merchantId . $userIp . $merchantOid . $email . $paymentAmount . $userBasket
             . $noInstallment . $maxInstallment . $currency . $testMode;
    return base64_encode(hash_hmac('sha256', $hashStr . $merchantSalt, $merchantKey, true));
}

/** Havale/EFT iFrame API paytr_token */
function yp_paytr_eft_hash($merchantId, $userIp, $merchantOid, $email, $paymentAmount, $paymentType,
                           $testMode, $merchantSalt, $merchantKey)
{
    $hashStr = $merchantId . $userIp . $merchantOid . $email . $paymentAmount . $paymentType . $testMode;
    return base64_encode(hash_hmac('sha256', $hashStr . $merchantSalt, $merchantKey, true));
}

/** Bildirim (callback) hash'i */
function yp_paytr_callback_hash($merchantOid, $merchantSalt, $status, $totalAmount, $merchantKey)
{
    return base64_encode(hash_hmac('sha256', $merchantOid . $merchantSalt . $status . $totalAmount, $merchantKey, true));
}

/** İşlem Dökümü API paytr_token */
function yp_paytr_report_hash($merchantId, $startDate, $endDate, $merchantSalt, $merchantKey)
{
    return base64_encode(hash_hmac('sha256', $merchantId . $startDate . $endDate . $merchantSalt, $merchantKey, true));
}

/** Sepet: [[ad, birim_fiyat("18.00"), adet], ...] → base64(json) */
function yp_paytr_basket(array $items)
{
    return base64_encode(json_encode($items));
}

function yp_paytr_new_oid($prefix = 'YP')
{
    // PayTR: alfanümerik, en fazla 64 karakter, benzersiz
    return $prefix . date('ymdHis') . strtoupper(bin2hex(random_bytes(5)));
}

/**
 * PayTR get-token isteği.
 * $p: tip(kart|eft), oid, ip, email, kurus(int), ad, adres, tel, sepet(array), test_mode(0/1)
 * Dönüş: ['ok'=>bool, 'token'=>string, 'msg'=>string]
 */
function yp_paytr_get_token(array $cfg, array $p)
{
    $mid = (string)$cfg['merchant_id'];
    $key = (string)$cfg['merchant_key'];
    $salt = (string)$cfg['merchant_salt'];
    $testMode = isset($p['test_mode']) ? (int)$p['test_mode'] : (yp_bool($cfg['test_mode']) ? 1 : 0);
    $amount = (string)(int)$p['kurus'];
    $site = yp_site_url();
    $okUrl = !empty($cfg['ok_url']) ? $cfg['ok_url'] : $site . '/?odeme=basarili';
    $failUrl = !empty($cfg['fail_url']) ? $cfg['fail_url'] : $site . '/?odeme=hatali';

    if ($p['tip'] === 'eft') {
        $paymentType = 'eft';
        $form = [
            'merchant_id'    => $mid,
            'user_ip'        => $p['ip'],
            'merchant_oid'   => $p['oid'],
            'email'          => $p['email'],
            'payment_amount' => $amount,
            'payment_type'   => $paymentType,
            'paytr_token'    => yp_paytr_eft_hash($mid, $p['ip'], $p['oid'], $p['email'], $amount, $paymentType, $testMode, $salt, $key),
            'debug_on'       => $testMode ? 1 : 0,
            'test_mode'      => $testMode,
            'timeout_limit'  => 30,
        ];
    } else {
        $maxInst = (int)$cfg['max_installment'];
        $noInst = $maxInst === 1 ? 1 : 0;
        if ($maxInst === 1) {
            $maxInst = 0;
        }
        $currency = 'TL';
        $basket = yp_paytr_basket($p['sepet']);
        $form = [
            'merchant_id'       => $mid,
            'user_ip'           => $p['ip'],
            'merchant_oid'      => $p['oid'],
            'email'             => $p['email'],
            'payment_amount'    => $amount,
            'paytr_token'       => yp_paytr_iframe_hash($mid, $p['ip'], $p['oid'], $p['email'], $amount, $basket, $noInst, $maxInst, $currency, $testMode, $salt, $key),
            'user_basket'       => $basket,
            'debug_on'          => $testMode ? 1 : 0,
            'no_installment'    => $noInst,
            'max_installment'   => $maxInst,
            'user_name'         => $p['ad'],
            'user_address'      => $p['adres'],
            'user_phone'        => $p['tel'],
            'merchant_ok_url'   => $okUrl,
            'merchant_fail_url' => $failUrl,
            'timeout_limit'     => 30,
            'currency'          => $currency,
            'test_mode'         => $testMode,
            'lang'              => 'tr',
        ];
    }

    $r = yp_http('POST', YP_PAYTR_TOKEN_URL, ['form' => $form, 'timeout' => 20]);
    if ($r['error'] !== '') {
        return ['ok' => false, 'token' => '', 'msg' => 'PayTR sunucusuna ulaşılamadı: ' . $r['error']];
    }
    $j = $r['json'];
    if (!is_array($j)) {
        return ['ok' => false, 'token' => '', 'msg' => 'PayTR beklenmeyen bir yanıt verdi (HTTP ' . $r['code'] . ').'];
    }
    if (isset($j['status']) && $j['status'] === 'success' && !empty($j['token'])) {
        return ['ok' => true, 'token' => (string)$j['token'], 'msg' => 'PayTR token alındı.'];
    }
    $reason = isset($j['reason']) ? yp_str($j['reason'], 500) : 'bilinmeyen hata';
    return ['ok' => false, 'token' => '', 'msg' => 'PayTR yanıtı: ' . $reason];
}

/* ------------------------------------------------------------------ *
 *  Test sonuçları / genel durum dosyası (sır içermez)
 * ------------------------------------------------------------------ */

function yp_status_file()
{
    return YP_DATA . '/testler.json';
}

function yp_set_last_test($svc, $ok, $msg)
{
    yp_json_update(yp_status_file(), function ($d) use ($svc, $ok, $msg) {
        $d['last_test'][$svc] = $ok === null ? null : ['ok' => (bool)$ok, 't' => date('c'), 'msg' => yp_str($msg, 500)];
        return $d;
    });
}

function yp_get_status()
{
    return yp_json_read(yp_status_file());
}

/* ------------------------------------------------------------------ *
 *  Doğrulayıcılar
 * ------------------------------------------------------------------ */

function yp_valid_tckn($t)
{
    if (!preg_match('/^[1-9][0-9]{10}$/', $t)) {
        return false;
    }
    $d = array_map('intval', str_split($t));
    $odd = $d[0] + $d[2] + $d[4] + $d[6] + $d[8];
    $even = $d[1] + $d[3] + $d[5] + $d[7];
    $c10 = (($odd * 7) - $even) % 10;
    if ($c10 < 0) {
        $c10 += 10;
    }
    if ($c10 !== $d[9]) {
        return false;
    }
    return (array_sum(array_slice($d, 0, 10)) % 10) === $d[10];
}

function yp_valid_iban_tr($iban)
{
    if (!preg_match('/^TR[0-9]{24}$/', $iban)) {
        return false;
    }
    $r = substr($iban, 4) . substr($iban, 0, 4);
    $num = '';
    foreach (str_split($r) as $ch) {
        $num .= ctype_alpha($ch) ? (string)(ord($ch) - 55) : $ch;
    }
    $mod = 0;
    foreach (str_split($num, 7) as $chunk) {
        $mod = (int)(($mod . $chunk) % 97);
    }
    return $mod === 1;
}

function yp_valid_url($u)
{
    if (!is_string($u) || strlen($u) > 400 || !filter_var($u, FILTER_VALIDATE_URL)) {
        return false;
    }
    $s = strtolower((string)parse_url($u, PHP_URL_SCHEME));
    return $s === 'https' || $s === 'http';
}
