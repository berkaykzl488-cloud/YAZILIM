const TC_PHP = String.raw`<?php
// yangpazar.com · TC kimlik doğrulama (NVİ KPSPublic servisi). Site bu adrese JSON gönderir: {tc, yil}
// Ad ve soyad, üyenin kayıtlı bilgilerinden alınır; üye yalnızca TC ve doğum tarihini girer.
header('Content-Type: application/json; charset=utf-8');
if($_SERVER['REQUEST_METHOD'] !== 'POST'){ http_response_code(405); exit; }
if(session_status() !== PHP_SESSION_ACTIVE) session_start();

/* >>> KENDİ SİTENİZE BAĞLAYIN ----------------------------------------------- */
function uye(){ return $_SESSION['uye'] ?? null; }                 // ['id'=>..., 'ad'=>..., 'soyad'=>...]
function tc_baska_hesapta($hash, $uye_id){ return false; }        // aynı TC başka üyede doğrulanmış mı?
function tc_kaydet($uye_id, $hash, $maske, $yil, $tc){ }          // üyeye "TC doğrulandı" işareti koyun; tam no yalnızca e-Gider Pusulası için (şifreli) saklanır
/* --------------------------------------------------------------------------- */

function cevap($ok, $hata = ''){ echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $hata]); exit; }
$u = uye(); if(!$u){ http_response_code(401); cevap(false, 'Oturum bulunamadı, tekrar giriş yapın.'); }

// deneme sınırı: saatte 5
$_SESSION['tc_deneme'] = array_values(array_filter($_SESSION['tc_deneme'] ?? [], function($t){ return $t > time() - 3600; }));
if(count($_SESSION['tc_deneme']) >= 5) cevap(false, 'Çok fazla deneme yaptınız, 1 saat sonra tekrar deneyin.');
$_SESSION['tc_deneme'][] = time();

$g   = json_decode(file_get_contents('php://input'), true) ?: [];
$tc  = preg_replace('/\D/', '', (string)($g['tc'] ?? ''));
$yil = (int)($g['yil'] ?? 0);
function tc_gecerli($t){
  if(!preg_match('/^[1-9][0-9]{10}$/', $t)) return false;
  $d = array_map('intval', str_split($t));
  $tek = $d[0] + $d[2] + $d[4] + $d[6] + $d[8]; $cift = $d[1] + $d[3] + $d[5] + $d[7];
  if(((($tek * 7 - $cift) % 10) + 10) % 10 !== $d[9]) return false;
  return array_sum(array_slice($d, 0, 10)) % 10 === $d[10];
}
function buyuk($s){ return mb_strtoupper(str_replace(['i', 'ı'], ['İ', 'I'], trim($s)), 'UTF-8'); }
if(!tc_gecerli($tc)) cevap(false, 'TC kimlik numarası geçersiz.');
if($yil < 1900 || $yil > (int)date('Y') - 18) cevap(false, 'Para çekmek için 18 yaşını doldurmuş olmalısınız.');
$hash = hash('sha256', $tc.'|yangpazar');
if(tc_baska_hesapta($hash, $u['id'])) cevap(false, 'Bu TC kimlik numarası başka bir hesapta kullanılıyor.');

$xml = '<?xml version="1.0" encoding="utf-8"?>'
  .'<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
  .'<soap:Body><TCKimlikNoDogrula xmlns="http://tckimlik.nvi.gov.tr/WS">'
  .'<TCKimlikNo>'.$tc.'</TCKimlikNo>'
  .'<Ad>'.htmlspecialchars(buyuk($u['ad']), ENT_XML1).'</Ad>'
  .'<Soyad>'.htmlspecialchars(buyuk($u['soyad']), ENT_XML1).'</Soyad>'
  .'<DogumYili>'.$yil.'</DogumYili>'
  .'</TCKimlikNoDogrula></soap:Body></soap:Envelope>';
$ch = curl_init('https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx');
curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $xml, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20,
  CURLOPT_HTTPHEADER => ['Content-Type: text/xml; charset=utf-8', 'SOAPAction: "http://tckimlik.nvi.gov.tr/WS/TCKimlikNoDogrula"']]);
$yanit = curl_exec($ch); $kod = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
if($yanit === false || $kod !== 200) cevap(false, 'Nüfus servisine şu an ulaşılamıyor, biraz sonra tekrar deneyin.');
if(!preg_match('/<TCKimlikNoDogrulaResult>\s*true\s*<\/TCKimlikNoDogrulaResult>/i', $yanit))
  cevap(false, 'Bilgiler nüfus kayıtlarıyla eşleşmedi. Doğum tarihinizi ve profilinizdeki ad soyadı kimliğinizdeki gibi kontrol edin.');
tc_kaydet($u['id'], $hash, substr($tc, 0, 3).'******'.substr($tc, -2), $yil, $tc);
cevap(true);
`;
const TC_README = `YANGPAZAR.COM · TC KİMLİK DOĞRULAMA KURULUMU
=====================================

1) "kimlik" klasörünü sitenizin kök dizinine yükleyin (ör. https://siteniz.com/kimlik/dogrula.php).
   Sunucuda PHP 7.4+, curl ve mbstring açık olmalı.
2) dogrula.php'nin başındaki üç fonksiyonu kendi sisteminize bağlayın:
   - uye(): giriş yapmış üyenin id, ad ve soyadı (kayıtta girilen)
   - tc_baska_hesapta(): aynı TC'nin başka hesapta doğrulanıp doğrulanmadığı
   - tc_kaydet(): üyeyi "doğrulandı" olarak işaretler; hash ve maskeyi saklayın. Tam TC yalnızca
     e-Gider Pusulası için gereklidir: şifreli sütunda tutun, sitede herkese maskeli gösterin (KVKK).
3) Para çekme isteğini sunucuda da kontrol edin: doğrulanmamış üyenin çekim talebini reddedin.

Üye yalnızca TC kimlik numarası ve doğum tarihini girer. Ad ve soyad üyelik bilgilerinden
alınır. NVİ'nin herkese açık servisi (KPSPublic) TC no, ad, soyad ve doğum yılı ile eşleştirme
yapar. Doğum tarihinin yalnızca yılı kontrol edilir.
`;
function zipFiles(files) {
  const enc = new TextEncoder();
  const T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = b => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  const d = new Date(),
    dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
    dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  const parts = [], cen = [];
  let off = 0;
  for (const [name, content] of files) {
    const nb = enc.encode(name);
    const raw = typeof content === 'string' ? enc.encode(content) : (content instanceof Uint8Array ? content : new Uint8Array(content));
    const c = crc(raw);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0, true);
    h.setUint16(8, 0, true);
    h.setUint16(10, dt, true);
    h.setUint16(12, dd, true);
    h.setUint32(14, c, true);
    h.setUint32(18, raw.length, true);
    h.setUint32(22, raw.length, true);
    h.setUint16(26, nb.length, true);
    h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, raw);

    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0, true);
    e.setUint16(10, 0, true);
    e.setUint16(12, dt, true);
    e.setUint16(14, dd, true);
    e.setUint32(16, c, true);
    e.setUint32(20, raw.length, true);
    e.setUint32(24, raw.length, true);
    e.setUint16(28, nb.length, true);
    e.setUint32(42, off, true);
    cen.push(new Uint8Array(e.buffer), nb);
    off += 30 + nb.length + raw.length;
  }
  const cs = cen.reduce((a, b) => a + b.length, 0);
  const z = new DataView(new ArrayBuffer(22));
  z.setUint32(0, 0x06054b50, true);
  z.setUint16(8, files.length, true);
  z.setUint16(10, files.length, true);
  z.setUint32(12, cs, true);
  z.setUint32(16, off, true);
  const all = [...parts, ...cen, new Uint8Array(z.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  all.forEach(b => {
    out.set(b, p);
    p += b.length;
  });
  return out;
}

/* R8: API paketi (zip kökü api/). İçerikler derleme betiğiyle gerçek dosyalarla değiştirilir; işaretleri silmeyin.
   config.php yok: tüm ayarlar Yönetim › Entegrasyonlar'dan girilir ve sunucuda şifreli saklanır. */
/* API_KIT_BEGIN */
const API_KIT_FILES = [
  ['api/_lib.php', String.raw`<?php
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
`],
  ['api/kurulum.php', String.raw`<?php
/**
 * POST /api/kurulum.php — ilk kurulum. YALNIZCA API henüz kurulmamışken çalışır.
 * Gövde: {password, site_url}
 * Şifreleme anahtarını, panel API şifresinin özetini ve cron anahtarını üretir.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);

if (yp_installed()) {
    yp_error('Kurulum zaten tamamlanmış. Yeniden kurulum yapılamaz.', 'already_installed', 409);
}
if (yp_crypto_mode() === 'none') {
    yp_error('Sunucuda libsodium veya OpenSSL bulunamadı. Hosting firmanızdan PHP sodium ya da openssl eklentisini açmasını isteyin.', 'no_crypto', 500);
}
if (!is_dir(YP_DATA) || !is_writable(YP_DATA)) {
    yp_error('api/data klasörü yazılabilir değil. cPanel Dosya Yöneticisi\'nde data klasörüne sağ tıklayıp izinleri 755 (veya 775) yapın.', 'data_not_writable', 500);
}

yp_rl_enforce('kurulum', 10, 900);

$in = yp_input();

// Kurulum kodu: panel zip'i indirirken data/kurulum_kodu.php içine tek kullanımlık rastgele bir kod koyar
// ve aynı kodu kurulum isteğiyle gönderir. Böylece zip yüklendikten sonra kurulumu başkası yapamaz.
$codeFile = YP_DATA . '/kurulum_kodu.php';
if (is_file($codeFile)) {
    $expected = (string) yp_read_php_string($codeFile);
    $given = isset($in['install_code']) && is_string($in['install_code']) ? $in['install_code'] : '';
    if ($expected === '' || $given === '' || !hash_equals($expected, $given)) {
        yp_error('Kurulum kodu eşleşmedi. Kurulumu, bu paketi indirdiğiniz yönetim panelinden yapın (Yönetim › Entegrasyonlar).', 'bad_install_code', 403);
    }
}

$password = isset($in['password']) && is_string($in['password']) ? $in['password'] : '';
$siteUrl = yp_str(isset($in['site_url']) ? $in['site_url'] : '', 300);

if (yp_strlen($password) < 10) {
    yp_error('API şifresi en az 10 karakter olmalıdır.', 'validation', 422, ['fields' => ['password' => 'En az 10 karakter']]);
}
if (strlen($password) > 200) {
    yp_error('API şifresi çok uzun (en fazla 200 karakter).', 'validation', 422, ['fields' => ['password' => 'En fazla 200 karakter']]);
}
if ($siteUrl === '') {
    $siteUrl = yp_request_origin();
}
if (!preg_match('#^https?://#i', $siteUrl)) {
    $siteUrl = 'https://' . $siteUrl;
}
$origin = yp_origin_of($siteUrl);
if ($origin === '' || !yp_valid_url($origin . '/')) {
    yp_error('Site adresi geçersiz. Örnek: https://yangpazar.com', 'validation', 422, ['fields' => ['site_url' => 'Geçersiz adres']]);
}

$lock = yp_lock('kurulum');
try {
    if (yp_installed()) { // yarış durumu
        yp_error('Kurulum zaten tamamlanmış. Yeniden kurulum yapılamaz.', 'already_installed', 409);
    }

    // 1) Şifreleme anahtarı
    $key = random_bytes(32);
    yp_write_php_string(YP_DATA . '/anahtar.php', base64_encode($key));
    $GLOBALS['yp_key'] = $key;

    // 2) Boş ayarlar, klasörler. Eski anahtarla şifrelenmiş artık dosyalar (şifre sıfırlama) silinir.
    yp_store_write('ayarlar', ['paytr' => [], 'parasut' => [], 'bizimhesap' => []]);
    @unlink(YP_DATA . '/onbellek.php');
    @unlink(YP_DATA . '/cekimler.php');
    yp_ensure_dir(YP_DATA . '/log');
    yp_ensure_dir(YP_DATA . '/rl');
    if (!is_file(YP_DATA . '/odemeler.json')) {
        yp_json_write(YP_DATA . '/odemeler.json', ['odemeler' => new stdClass()]);
    }
    @unlink(yp_status_file());

    // 3) Yönetici kaydı EN SON yazılır (varlığı = kurulum tamam)
    $admin = [
        'hash'       => password_hash($password, PASSWORD_DEFAULT),
        'cron_key'   => bin2hex(random_bytes(24)),
        'install_id' => bin2hex(random_bytes(16)),
        'kurulum'    => date('c'),
        'site_url'   => $origin,
    ];
    yp_store_write('admin', $admin);
    @unlink($codeFile); // tek kullanımlık
} finally {
    yp_unlock($lock);
}

$csrf = yp_login_session($admin);
yp_log('guvenlik', 'Kurulum tamamlandı', ['ip' => yp_client_ip(), 'site_url' => $origin]);

yp_json(['ok' => true, 'csrf' => $csrf, 'site_url' => $origin]);
`],
  ['api/giris.php', String.raw`<?php
/**
 * POST /api/giris.php — panel API oturumu açar. Gövde: {password}
 * Hız sınırı: aynı IP'den 15 dakikada en fazla 5 hatalı deneme.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);
yp_require_installed();

$bucket = 'giris';
$limit = 5;
$window = 900;

// Önce kontrol (saymadan): sınır aşıldıysa doğru şifre bile denenmez.
yp_rl_enforce($bucket, $limit, $window, false);

$in = yp_input();
$password = isset($in['password']) && is_string($in['password']) ? $in['password'] : '';
$admin = yp_admin();

if ($password === '' || strlen($password) > 200 || empty($admin['hash']) || !password_verify($password, $admin['hash'])) {
    $r = yp_rl_add($bucket, $window);
    usleep(300000); // kaba kuvvet denemelerini yavaşlat
    yp_log('guvenlik', 'Hatalı giriş denemesi', ['ip' => yp_client_ip()]);
    $left = max(0, $limit - $r['count']);
    yp_error('Şifre hatalı.' . ($left > 0 ? ' Kalan deneme hakkı: ' . $left . '.' : ' Çok fazla hatalı deneme; 15 dakika bekleyin.'),
        'bad_password', 401, ['remaining' => $left]);
}

if (password_needs_rehash($admin['hash'], PASSWORD_DEFAULT)) {
    $newHash = password_hash($password, PASSWORD_DEFAULT);
    yp_store_update('admin', function ($a) use ($newHash) {
        $a['hash'] = $newHash;
        return $a;
    });
}

yp_rl_reset($bucket);
$csrf = yp_login_session($admin);
yp_log('guvenlik', 'Giriş yapıldı', ['ip' => yp_client_ip()]);
yp_json(['ok' => true, 'csrf' => $csrf]);
`],
  ['api/cikis.php', String.raw`<?php
/**
 * POST /api/cikis.php — panel API oturumunu kapatır.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);
yp_require_auth();

$_SESSION = [];
$p = session_get_cookie_params();
setcookie(session_name(), '', [
    'expires'  => time() - 3600,
    'path'     => $p['path'],
    'domain'   => $p['domain'],
    'secure'   => $p['secure'],
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_destroy();
yp_json(['ok' => true]);
`],
  ['api/durum.php', String.raw`<?php
/**
 * GET /api/durum.php — herkese açık durum bilgisi. Hiçbir sır döndürmez.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['GET']]);

$installed = yp_installed();
$services = [];
$status = yp_get_status();
$settings = [];
$settingsOk = true;
if ($installed) {
    try {
        $settings = yp_settings();
    } catch (Exception $e) {
        $settingsOk = false;
        yp_log('hata', 'durum: ayarlar okunamadı: ' . $e->getMessage());
    }
}

foreach (array_keys(yp_schema()) as $svc) {
    $row = [
        'configured' => $installed && $settingsOk && yp_service_configured($settings, $svc),
        'last_test'  => isset($status['last_test'][$svc]) ? $status['last_test'][$svc] : null,
    ];
    if ($svc === 'paytr') {
        $row['test_mode'] = isset($settings['paytr']['test_mode']) ? yp_bool($settings['paytr']['test_mode']) : true;
    }
    $services[$svc] = $row;
}

$urls = ['paytr_bildirim' => null, 'cron_hakedis_masked' => null];
$siteUrl = null;
if ($installed) {
    $admin = yp_admin_safe();
    $siteUrl = isset($admin['site_url']) ? $admin['site_url'] : null;
    $urls['paytr_bildirim'] = yp_api_url('paytr_bildirim.php');
    if (!empty($admin['cron_key'])) {
        $urls['cron_hakedis_masked'] = yp_api_url('paytr_hakedis.php') . '?key=' . substr($admin['cron_key'], 0, 4) . '••••••••';
    }
}

yp_json([
    'ok'            => true,
    'installed'     => $installed,
    'version'       => YP_VERSION,
    'php'           => PHP_VERSION,
    'curl'          => function_exists('curl_init'),
    'crypto'        => yp_crypto_mode(),
    'data_writable' => is_dir(YP_DATA) && is_writable(YP_DATA),
    'logged_in'     => $installed ? yp_logged_in() : false,
    'site_url'      => $siteUrl,
    'services'      => $services,
    'urls'          => $urls,
    'hakedis_son'   => isset($status['hakedis_son']) ? $status['hakedis_son'] : null,
]);
`],
  ['api/ayarlar.php', String.raw`<?php
/**
 * GET  /api/ayarlar.php — servis ayarlarını MASKELİ döndürür (oturum gerekir).
 * POST /api/ayarlar.php — {service, values:{...}, clear?:[alan]} kaydeder (oturum + X-CSRF-Token).
 *   Boş ya da maskeli gönderilen gizli alanlar mevcut değeri KORUR.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['GET', 'POST']]);
yp_require_auth();

$schema = yp_schema();

function yp_ayar_urls()
{
    $admin = yp_admin();
    return [
        'paytr_bildirim' => yp_api_url('paytr_bildirim.php'),
        'cron_hakedis'   => yp_api_url('paytr_hakedis.php') . '?key=' . (isset($admin['cron_key']) ? $admin['cron_key'] : ''),
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $s = yp_settings();
    $out = [];
    foreach (array_keys($schema) as $svc) {
        $out[$svc] = yp_masked_service($s, $svc);
    }
    yp_json(['ok' => true, 'services' => $out, 'urls' => yp_ayar_urls(), 'csrf' => $_SESSION['yp_csrf']]);
}

// ---- POST ----
yp_require_csrf();
$in = yp_input();
$svc = isset($in['service']) && is_string($in['service']) ? $in['service'] : '';
if (!isset($schema[$svc])) {
    yp_error('Geçersiz servis. paytr, parasut veya bizimhesap olmalı.', 'validation', 422);
}
$values = isset($in['values']) && is_array($in['values']) ? $in['values'] : [];
$clear = isset($in['clear']) && is_array($in['clear']) ? $in['clear'] : [];

$errors = [];
$changes = [];
foreach ($schema[$svc] as $f => $def) {
    if (in_array($f, $clear, true)) {
        $changes[$f] = isset($def['default']) ? $def['default'] : '';
        continue;
    }
    if (!array_key_exists($f, $values)) {
        continue; // gönderilmeyen alan değişmez
    }
    $raw = $values[$f];
    switch ($def['type']) {
        case 'bool':
            $changes[$f] = yp_bool($raw);
            break;
        case 'int':
            if ($raw === '' || $raw === null) {
                $raw = isset($def['default']) ? $def['default'] : 0;
            }
            if (!is_numeric($raw) || (int)$raw != $raw || (int)$raw < $def['min'] || (int)$raw > $def['max']) {
                $errors[$f] = $def['label'] . ': ' . $def['min'] . '–' . $def['max'] . ' arası tam sayı olmalı';
                break;
            }
            $changes[$f] = (int)$raw;
            break;
        case 'url':
            $v = yp_str($raw, 400);
            if ($v !== '' && !yp_valid_url($v)) {
                $errors[$f] = $def['label'] . ': geçerli bir http(s) adresi olmalı';
                break;
            }
            $changes[$f] = $v;
            break;
        case 'email':
            $v = yp_str($raw, 200);
            if ($v === '' || yp_is_masked_input($v)) {
                break; // boş → koru
            }
            if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
                $errors[$f] = $def['label'] . ': geçerli bir e-posta olmalı';
                break;
            }
            $changes[$f] = $v;
            break;
        default: // str
            $max = isset($def['max']) ? $def['max'] : 200;
            $v = is_scalar($raw) ? trim((string)$raw) : '';
            if (!empty($def['secret']) && ($v === '' || yp_is_masked_input($v))) {
                break; // gizli alan boş/maskeli → mevcut değer korunur
            }
            if (strlen($v) > $max || preg_match('/[\x00-\x1F\x7F]/', $v)) {
                $errors[$f] = $def['label'] . ': geçersiz değer';
                break;
            }
            if (isset($def['pattern']) && $v !== '' && !preg_match($def['pattern'], $v)) {
                $errors[$f] = $def['label'] . (isset($def['hint']) ? ': ' . $def['hint'] : ': geçersiz biçim');
                break;
            }
            $changes[$f] = $v;
    }
}

if ($errors) {
    yp_error('Bazı alanlar hatalı: ' . implode('; ', array_values($errors)), 'validation', 422, ['fields' => $errors]);
}

$saved = yp_store_update('ayarlar', function ($s) use ($svc, $changes) {
    if (!isset($s[$svc]) || !is_array($s[$svc])) {
        $s[$svc] = [];
    }
    foreach ($changes as $f => $v) {
        $s[$svc][$f] = $v;
    }
    $s[$svc]['_guncelleme'] = date('c');
    return $s;
});

if ($svc === 'parasut') {
    // Kimlik bilgisi değiştiyse önbellekteki Paraşüt erişim jetonunu at.
    yp_store_update('onbellek', function ($c) {
        unset($c['parasut']);
        return $c;
    });
}
yp_set_last_test($svc, null, '');
yp_log('ayar', 'Ayarlar güncellendi', ['service' => $svc, 'alanlar' => implode(',', array_keys($changes)), 'ip' => yp_client_ip()]);

$full = yp_settings();
yp_json([
    'ok'         => true,
    'service'    => $svc,
    'configured' => yp_service_configured($full, $svc),
    'masked'     => yp_masked_service($full, $svc),
]);
`],
  ['api/test.php', String.raw`<?php
/**
 * POST /api/test.php — {service} bağlantı testi (oturum + X-CSRF-Token).
 *  PayTR:      test_mode=1 ile 1,00 TL'lik get-token isteği (token döndüyse başarılı; PayTR hata metni aynen iletilir)
 *  Paraşüt:    OAuth password-grant + firma erişim kontrolü
 *  Bizim Hesap: kimlik doğrulamalı hafif çağrı (depo listesi)
 * Sonuç last_test olarak saklanır.
 */
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/parasut_client.php';
require_once __DIR__ . '/bizimhesap_client.php';
yp_boot(['methods' => ['POST']]);
yp_require_auth();
yp_require_csrf();
yp_rl_enforce('test', 20, 300);

$in = yp_input();
$svc = isset($in['service']) && is_string($in['service']) ? $in['service'] : '';
if (!isset(yp_schema()[$svc])) {
    yp_error('Geçersiz servis. paytr, parasut veya bizimhesap olmalı.', 'validation', 422);
}

$s = yp_settings();
if (!yp_service_configured($s, $svc)) {
    yp_error('Önce bu servisin bilgilerini girip Kaydet\'e basın.', 'not_configured', 422);
}

$res = ['ok' => false, 'msg' => 'Bilinmeyen servis'];
if ($svc === 'paytr') {
    $ip = yp_client_ip();
    $host = parse_url(yp_site_url(), PHP_URL_HOST);
    $res = yp_paytr_get_token($s['paytr'], [
        'tip'       => 'kart',
        'oid'       => yp_paytr_new_oid('YPTEST'),
        'ip'        => $ip,
        'email'     => 'test@' . ($host ? $host : 'example.com'),
        'kurus'     => 100, // 1,00 TL
        'ad'        => 'Baglanti Testi',
        'adres'     => 'Turkiye',
        'tel'       => '05000000000',
        'sepet'     => [['Baglanti testi', '1.00', 1]],
        'test_mode' => 1,
    ]);
    if ($res['ok']) {
        $res['msg'] = 'PayTR bağlantısı başarılı: test modunda 1,00 TL için ödeme token\'ı alındı.'
            . (yp_bool($s['paytr']['test_mode']) ? ' Şu an TEST modundasınız; canlıya geçince test modunu kapatın.' : '');
    }
} elseif ($svc === 'parasut') {
    $res = (new ParasutClient($s['parasut']))->testConnection();
} elseif ($svc === 'bizimhesap') {
    $res = (new BizimHesapClient($s['bizimhesap']))->testConnection();
}

yp_set_last_test($svc, $res['ok'], $res['msg']);
yp_log('test', 'Bağlantı testi', ['service' => $svc, 'sonuc' => $res['ok'] ? 'basarili' : 'hata', 'mesaj' => $res['msg']]);

$out = ['ok' => (bool)$res['ok'], 'service' => $svc, 'msg' => $res['msg']];
if (!$res['ok']) {
    $out['error'] = $res['msg'];
    $out['code'] = 'test_failed';
}
yp_json($out);
`],
  ['api/paytr_token.php', String.raw`<?php
/**
 * POST /api/paytr_token.php — ödeme iFrame token'ı (hash SUNUCUDA hesaplanır, sırlar tarayıcıya gitmez).
 * Gövde: {tip:"kart"|"eft", tutar, banka?, email, ad, tel, adres?, sepet?:[[ad, fiyat, adet],...]}
 * Yanıt: {ok:true, token, merchant_oid, iframe_url}
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);
yp_require_installed();
yp_rl_enforce('paytr_token', 15, 600);

$s = yp_settings();
if (!yp_service_configured($s, 'paytr')) {
    yp_error('Online ödeme şu anda kullanılamıyor (PayTR ayarları yapılmamış).', 'not_configured', 503);
}

$in = yp_input();
$errors = [];

$tip = isset($in['tip']) && is_string($in['tip']) ? strtolower($in['tip']) : 'kart';
if (!in_array($tip, ['kart', 'eft'], true)) {
    $errors['tip'] = 'Ödeme tipi kart veya eft olmalı';
}
$tutar = yp_money(isset($in['tutar']) ? $in['tutar'] : null);
if ($tutar === null || $tutar < 1 || $tutar > 100000) {
    $errors['tutar'] = 'Tutar 1 ile 100.000 TL arasında olmalı';
}
$email = yp_str(isset($in['email']) ? $in['email'] : '', 100);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Geçerli bir e-posta adresi girin';
}
$ad = yp_str(isset($in['ad']) ? $in['ad'] : '', 60);
if (yp_strlen($ad) < 2) {
    $errors['ad'] = 'Ad soyad girin';
}
$tel = preg_replace('/[^0-9+]/', '', yp_str(isset($in['tel']) ? $in['tel'] : '', 30));
if ($tip === 'kart' && !preg_match('/^\+?[0-9]{10,15}$/', (string)$tel)) {
    $errors['tel'] = 'Geçerli bir telefon numarası girin';
}
$adres = yp_str(isset($in['adres']) ? $in['adres'] : '', 400);
if ($adres === '') {
    $adres = 'Türkiye';
}
$banka = yp_str(isset($in['banka']) ? $in['banka'] : '', 40);

$kurus = (int)round(($tutar === null ? 0 : $tutar) * 100);
$sepet = [];
if (isset($in['sepet']) && is_array($in['sepet']) && $in['sepet']) {
    if (count($in['sepet']) > 50) {
        $errors['sepet'] = 'Sepette en fazla 50 kalem olabilir';
    } else {
        foreach ($in['sepet'] as $i => $row) {
            if (!is_array($row) || count($row) < 3) {
                $errors['sepet'] = 'Sepet biçimi hatalı: [ad, fiyat, adet]';
                break;
            }
            $row = array_values($row);
            $pName = yp_str($row[0], 100);
            $pPrice = yp_money($row[1]);
            $pQty = (int)$row[2];
            if ($pName === '' || $pPrice === null || $pPrice <= 0 || $pQty < 1 || $pQty > 1000) {
                $errors['sepet'] = 'Sepet kalemi hatalı (satır ' . ($i + 1) . ')';
                break;
            }
            $sepet[] = [$pName, number_format($pPrice, 2, '.', ''), $pQty];
        }
    }
}
if (!$sepet && $tutar !== null) {
    $sepet = [['YangPazar bakiye yükleme', number_format($tutar, 2, '.', ''), 1]];
}

if ($errors) {
    yp_error('Bazı alanlar hatalı: ' . implode('; ', array_values($errors)), 'validation', 422, ['fields' => $errors]);
}

$oid = yp_paytr_new_oid('YP');
$testMode = yp_bool($s['paytr']['test_mode']) ? 1 : 0;

// Bekleyen siparişi kaydet (kişisel veri saklanmaz; yalnızca tutar ve durum).
yp_json_update(YP_DATA . '/odemeler.json', function ($d) use ($oid, $tip, $kurus, $testMode, $banka) {
    if (!isset($d['odemeler']) || !is_array($d['odemeler'])) {
        $d['odemeler'] = [];
    }
    // Bildirimi hiç gelmemiş 3 günden eski bekleyenleri temizle
    $now = time();
    foreach ($d['odemeler'] as $k => $o) {
        if (isset($o['durum']) && $o['durum'] === 'bekliyor' && isset($o['olusturma_ts']) && $o['olusturma_ts'] < $now - 3 * 86400) {
            unset($d['odemeler'][$k]);
        }
    }
    $d['odemeler'][$oid] = [
        'durum'        => 'bekliyor',
        'tip'          => $tip,
        'beklenen'     => $kurus,
        'banka'        => $banka,
        'test_mode'    => $testMode,
        'olusturma'    => date('c'),
        'olusturma_ts' => $now,
    ];
    return $d;
});

$res = yp_paytr_get_token($s['paytr'], [
    'tip'   => $tip,
    'oid'   => $oid,
    'ip'    => yp_client_ip(),
    'email' => $email,
    'kurus' => $kurus,
    'ad'    => $ad,
    'adres' => $adres,
    'tel'   => (string)$tel,
    'sepet' => $sepet,
]);

if (!$res['ok']) {
    yp_log('paytr', 'Token alınamadı', ['merchant_oid' => $oid, 'mesaj' => $res['msg']]);
    yp_error('Ödeme başlatılamadı. ' . $res['msg'], 'paytr_error', 502);
}

yp_json([
    'ok'           => true,
    'token'        => $res['token'],
    'merchant_oid' => $oid,
    'iframe_url'   => 'https://www.paytr.com/odeme/guvenli/' . rawurlencode($res['token']),
]);
`],
  ['api/paytr_bildirim.php', String.raw`<?php
/**
 * POST /api/paytr_bildirim.php — PayTR Bildirim URL'si (callback).
 * Bu adresi PayTR Mağaza Paneli › Destek & Kurulum › Ayarlar › Bildirim URL alanına yapıştırın.
 *
 * - hash: base64(hmac_sha256(merchant_oid + merchant_salt + status + total_amount, merchant_key)), hash_equals ile karşılaştırılır
 * - İdempotent: aynı merchant_oid ikinci kez gelirse yeniden işlenmez, yine "OK" döner
 * - Geçerli bildirimlerde düz metin "OK" döner (PayTR "OK" görene kadar tekrar dener)
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST'], 'origin' => false, 'text' => true]);

if (!yp_installed()) {
    yp_text('PAYTR notification failed: not installed', 503);
}
$s = yp_settings();
if (!yp_service_configured($s, 'paytr')) {
    yp_text('PAYTR notification failed: not configured', 503);
}
$cfg = $s['paytr'];

$p = is_array($_POST) ? $_POST : [];
$f = function ($k) use ($p) {
    return isset($p[$k]) && is_scalar($p[$k]) ? (string)$p[$k] : '';
};
$oid = $f('merchant_oid');
$status = $f('status');
$total = $f('total_amount');
$hash = $f('hash');

if ($oid === '' || $hash === '' || $status === '' || $total === '') {
    yp_text('PAYTR notification failed: bad request', 400);
}

$expected = yp_paytr_callback_hash($oid, (string)$cfg['merchant_salt'], $status, $total, (string)$cfg['merchant_key']);
if (!hash_equals($expected, $hash)) {
    yp_log('paytr', 'Bildirim reddedildi: hash hatalı', ['merchant_oid' => yp_str($oid, 64), 'ip' => yp_client_ip()]);
    yp_text('PAYTR notification failed: bad hash', 400);
}

if (!preg_match('/^[A-Za-z0-9]{1,64}$/', $oid) || !in_array($status, ['success', 'failed'], true) || !preg_match('/^[0-9]{1,12}$/', $total)) {
    yp_log('paytr', 'Bildirim reddedildi: geçersiz alan', ['merchant_oid' => yp_str($oid, 64)]);
    yp_text('PAYTR notification failed: bad request', 400);
}

$paymentAmount = preg_match('/^[0-9]{1,12}$/', $f('payment_amount')) ? (int)$f('payment_amount') : null;
$sonuc = 'yeni';

yp_json_update(YP_DATA . '/odemeler.json', function ($d) use ($oid, $status, $total, $paymentAmount, $f, &$sonuc) {
    if (!isset($d['odemeler']) || !is_array($d['odemeler'])) {
        $d['odemeler'] = [];
    }
    $mevcut = isset($d['odemeler'][$oid]) ? $d['odemeler'][$oid] : null;
    if ($mevcut && isset($mevcut['durum']) && in_array($mevcut['durum'], ['basarili', 'basarisiz'], true)) {
        $sonuc = 'tekrar';
        $d['odemeler'][$oid]['tekrar_bildirim'] = (isset($mevcut['tekrar_bildirim']) ? (int)$mevcut['tekrar_bildirim'] : 0) + 1;
        return $d;
    }
    $kayit = $mevcut ? $mevcut : ['olusturma' => null, 'beklenen' => null];
    $kayit['durum'] = $status === 'success' ? 'basarili' : 'basarisiz';
    $kayit['toplam'] = (int)$total;                // taksit farkı dahil tahsil edilen (kuruş)
    $kayit['odeme_tutari'] = $paymentAmount;       // sipariş tutarı (kuruş)
    $kayit['para_birimi'] = yp_str($f('currency'), 5);
    $kayit['odeme_tipi'] = yp_str($f('payment_type'), 10);
    $kayit['taksit'] = (int)$f('installment_count');
    $kayit['test_mode'] = (int)$f('test_mode');
    $kayit['islem'] = date('c');
    $kayit['islem_ts'] = time();
    $kayit['muhasebe'] = null;
    if ($status !== 'success') {
        $kayit['hata_kodu'] = yp_str($f('failed_reason_code'), 10);
        $kayit['hata_mesaji'] = yp_str($f('failed_reason_msg'), 200);
    }
    if ($status === 'success' && $kayit['beklenen'] !== null && $paymentAmount !== null && (int)$kayit['beklenen'] !== $paymentAmount) {
        $kayit['uyari'] = 'tutar_uyusmazligi';
    }
    unset($kayit['olusturma_ts']);
    $d['odemeler'][$oid] = $kayit;
    return $d;
});

if ($sonuc === 'tekrar') {
    yp_log('paytr', 'Tekrarlanan bildirim (işlenmedi)', ['merchant_oid' => $oid, 'status' => $status]);
} else {
    yp_log('paytr', 'Bildirim işlendi', ['merchant_oid' => $oid, 'status' => $status, 'total_amount' => $total]);
}

yp_text('OK');
`],
  ['api/paytr_hakedis.php', String.raw`<?php
/**
 * GET /api/paytr_hakedis.php?key=GİZLİ_ANAHTAR — zamanlanmış görev (cron).
 * Adresin tamamı (anahtar dahil) Yönetim › Entegrasyonlar › "Otomatik hakediş (cron)" kutusunda gösterilir.
 *
 * Yaptıkları:
 *  1) Başarılı PayTR ödemelerini özetler (test ödemeleri hariç).
 *  2) Paraşüt'te "PayTR tahsilatlarını otomatik kaydet" açıksa, henüz muhasebeleşmemiş her ödeme için
 *     seçilen kasa/banka hesabına para girişi kaydı oluşturur (her ödeme yalnızca bir kez).
 *  3) PayTR İşlem Dökümü API'sinden dünün işlem sayısını alır (mutabakat bilgisi).
 */
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/parasut_client.php';
yp_boot(['methods' => ['GET', 'POST'], 'origin' => false]);
yp_require_installed();

yp_rl_enforce('hakedis_hata', 10, 900, false);
$key = isset($_GET['key']) && is_string($_GET['key']) ? $_GET['key'] : '';
$admin = yp_admin();
if ($key === '' || empty($admin['cron_key']) || !hash_equals((string)$admin['cron_key'], $key)) {
    yp_rl_add('hakedis_hata', 900);
    yp_log('guvenlik', 'Hakediş: geçersiz anahtar', ['ip' => yp_client_ip()]);
    yp_error('Geçersiz veya eksik anahtar.', 'bad_key', 403);
}

$run = yp_lock('hakedis', true);
if (!$run) {
    yp_error('Hakediş işlemi zaten çalışıyor.', 'busy', 409);
}

$s = yp_settings();
$sonuc = [
    'ok'          => true,
    't'           => date('c'),
    'basarili'    => 0,
    'toplam_tl'   => 0.0,
    'muhasebe'    => ['servis' => null, 'kaydedilen' => 0, 'hatali' => 0, 'bekleyen' => 0, 'mesaj' => ''],
    'islem_dokumu'=> null,
];

// --- 1) + 2) ---
$data = yp_json_read(YP_DATA . '/odemeler.json');
$odemeler = isset($data['odemeler']) && is_array($data['odemeler']) ? $data['odemeler'] : [];
$bekleyen = [];
foreach ($odemeler as $oid => $o) {
    if (!isset($o['durum']) || $o['durum'] !== 'basarili' || !empty($o['test_mode'])) {
        continue;
    }
    $sonuc['basarili']++;
    $sonuc['toplam_tl'] += ((int)$o['toplam']) / 100;
    if (empty($o['muhasebe'])) {
        $bekleyen[$oid] = $o;
    }
}
$sonuc['toplam_tl'] = round($sonuc['toplam_tl'], 2);
$sonuc['muhasebe']['bekleyen'] = count($bekleyen);

$parasutAktif = yp_service_configured($s, 'parasut') && yp_bool($s['parasut']['hakedis_kaydi']) && !empty($s['parasut']['account_id']);
if ($parasutAktif && $bekleyen) {
    $sonuc['muhasebe']['servis'] = 'parasut';
    $client = new ParasutClient($s['parasut']);
    $islenen = [];
    $limit = 50; // tek çalıştırmada en fazla
    foreach ($bekleyen as $oid => $o) {
        if ($limit-- <= 0) {
            break;
        }
        $tarih = substr(isset($o['islem']) ? $o['islem'] : date('c'), 0, 10);
        $r = $client->createTahsilatGirisi(round(((int)$o['toplam']) / 100, 2), $tarih, 'PayTR tahsilat ' . $oid);
        if ($r['ok']) {
            $islenen[$oid] = ['servis' => 'parasut', 'id' => $r['id'], 't' => date('c')];
            $sonuc['muhasebe']['kaydedilen']++;
        } else {
            $sonuc['muhasebe']['hatali']++;
            $sonuc['muhasebe']['mesaj'] = $r['msg'];
            if (stripos($r['msg'], 'ulaşılamadı') !== false || stripos($r['msg'], 'giriş') !== false) {
                break; // bağlantı/kimlik sorunu: kalanları denemeye gerek yok
            }
        }
    }
    if ($islenen) {
        yp_json_update(YP_DATA . '/odemeler.json', function ($d) use ($islenen) {
            foreach ($islenen as $oid => $m) {
                if (isset($d['odemeler'][$oid])) {
                    $d['odemeler'][$oid]['muhasebe'] = $m;
                }
            }
            return $d;
        });
    }
    $sonuc['muhasebe']['bekleyen'] = count($bekleyen) - count($islenen);
} elseif ($bekleyen) {
    $sonuc['muhasebe']['mesaj'] = 'Otomatik muhasebe kaydı kapalı (Paraşüt kartında "PayTR tahsilatlarını otomatik kaydet" ve hesap No gerekli).';
}

// --- 3) PayTR İşlem Dökümü (dün) ---
if (yp_service_configured($s, 'paytr')) {
    $c = $s['paytr'];
    $start = date('Y-m-d 00:00:00', strtotime('-1 day'));
    $end = date('Y-m-d 23:59:59', strtotime('-1 day'));
    $r = yp_http('POST', YP_PAYTR_REPORT_URL, ['form' => [
        'merchant_id' => $c['merchant_id'],
        'start_date'  => $start,
        'end_date'    => $end,
        'paytr_token' => yp_paytr_report_hash($c['merchant_id'], $start, $end, $c['merchant_salt'], $c['merchant_key']),
    ], 'timeout' => 30]);
    if ($r['error'] !== '') {
        $sonuc['islem_dokumu'] = ['ok' => false, 'msg' => 'PayTR sunucusuna ulaşılamadı: ' . $r['error']];
    } elseif (is_array($r['json']) && isset($r['json']['status']) && $r['json']['status'] === 'success') {
        $n = 0;
        foreach ($r['json'] as $k => $v) {
            if (is_array($v)) {
                $n += count($v);
            }
        }
        $sonuc['islem_dokumu'] = ['ok' => true, 'tarih' => substr($start, 0, 10), 'kayit' => $n, 'msg' => 'Dünün işlem dökümü alındı.'];
    } else {
        $m = is_array($r['json']) ? (isset($r['json']['err_msg']) ? $r['json']['err_msg'] : (isset($r['json']['reason']) ? $r['json']['reason'] : '')) : '';
        $sonuc['islem_dokumu'] = ['ok' => false, 'msg' => 'PayTR yanıtı: ' . ($m !== '' ? yp_str($m, 300) : 'HTTP ' . $r['code'])];
    }
}

yp_json_update(yp_status_file(), function ($d) use ($sonuc) {
    $d['hakedis_son'] = [
        't'          => $sonuc['t'],
        'kaydedilen' => $sonuc['muhasebe']['kaydedilen'],
        'hatali'     => $sonuc['muhasebe']['hatali'],
        'bekleyen'   => $sonuc['muhasebe']['bekleyen'],
    ];
    return $d;
});
yp_log('hakedis', 'Hakediş çalıştı', ['kaydedilen' => $sonuc['muhasebe']['kaydedilen'], 'hatali' => $sonuc['muhasebe']['hatali'], 'bekleyen' => $sonuc['muhasebe']['bekleyen']]);
yp_unlock($run);
yp_json($sonuc);
`],
  ['api/cekim_onayla.php', String.raw`<?php
/**
 * POST /api/cekim_onayla.php — yönetici çekim (para çekme) onayı → muhasebe kaydı (oturum + X-CSRF-Token).
 * Gövde: {id, ad, tckn, iban, brut, stopaj, net, aciklama, belge_no, ettn}
 * Yanıt: {ok:true, id, belge_no, banka_aciklama, parasut:{...}|null, bizimhesap:{...}|null}
 *
 * Bağlı muhasebe servislerinde (Paraşüt / Bizim Hesap) e-Gider Pusulası karşılığı gider/alış kaydı oluşturur.
 * Aynı id tekrar gönderilirse başarılı olmuş kayıtlar YENİDEN oluşturulmaz (yalnızca hatalı olanlar denenir).
 * Not: Banka transferi bu uç nokta tarafından yapılmaz; açıklama metni (banka_aciklama) havale açıklamasında kullanılır.
 */
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/parasut_client.php';
require_once __DIR__ . '/bizimhesap_client.php';
yp_boot(['methods' => ['POST']]);
yp_require_auth();
yp_require_csrf();

$in = yp_input();
$e = [];

$id = yp_str(isset($in['id']) ? $in['id'] : '', 64);
if (!preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $id)) {
    $e['id'] = 'Çekim numarası geçersiz';
}
$ad = yp_str(isset($in['ad']) ? $in['ad'] : '', 100);
if (yp_strlen($ad) < 3 || preg_match('/[<>{}]/', $ad)) {
    $e['ad'] = 'Ad soyad geçersiz';
}
$tckn = preg_replace('/\s+/', '', yp_str(isset($in['tckn']) ? $in['tckn'] : '', 20));
if (!yp_valid_tckn($tckn)) {
    $e['tckn'] = 'T.C. Kimlik No geçersiz';
}
$iban = strtoupper(preg_replace('/\s+/', '', yp_str(isset($in['iban']) ? $in['iban'] : '', 40)));
if (!yp_valid_iban_tr($iban)) {
    $e['iban'] = 'IBAN geçersiz (TR ile başlayan 26 karakter)';
}
$brut = yp_money(isset($in['brut']) ? $in['brut'] : null);
$stopaj = yp_money(isset($in['stopaj']) ? $in['stopaj'] : 0);
$net = yp_money(isset($in['net']) ? $in['net'] : null);
if ($brut === null || $brut <= 0 || $brut > 1000000) {
    $e['brut'] = 'Brüt tutar geçersiz';
}
if ($stopaj === null || $stopaj < 0) {
    $e['stopaj'] = 'Stopaj tutarı geçersiz';
}
if ($net === null || $net <= 0) {
    $e['net'] = 'Net tutar geçersiz';
}
if (!isset($e['brut']) && !isset($e['stopaj']) && !isset($e['net']) && abs($brut - $stopaj - $net) > 0.01) {
    $e['net'] = 'Net tutar = Brüt − Stopaj olmalı';
}
$aciklama = yp_str(isset($in['aciklama']) ? $in['aciklama'] : '', 200);
$belge = strtoupper(yp_str(isset($in['belge_no']) ? $in['belge_no'] : '', 32));
if ($belge === '') {
    $belge = 'YGP' . date('Y') . str_pad((string)random_int(0, 999999999), 9, '0', STR_PAD_LEFT);
} elseif (!preg_match('/^[A-Z0-9]{3,32}$/', $belge)) {
    $e['belge_no'] = 'Belge No yalnızca harf ve rakam olmalı (3–32)';
}
$ettn = strtolower(yp_str(isset($in['ettn']) ? $in['ettn'] : '', 36));
if ($ettn !== '' && !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $ettn)) {
    $e['ettn'] = 'ETTN geçersiz (UUID biçiminde olmalı)';
}

if ($e) {
    yp_error('Bazı alanlar hatalı: ' . implode('; ', array_values($e)), 'validation', 422, ['fields' => $e]);
}

// Aynı çekimin eşzamanlı iki kez işlenmesini engelle
$lock = yp_lock('cekim');
$onceki = yp_store_read('cekimler');
$kayit = isset($onceki[$id]) ? $onceki[$id] : null;
if ($kayit && $kayit['belge_no'] !== $belge && !empty($in['belge_no'])) {
    yp_unlock($lock);
    yp_error('Bu çekim daha önce farklı bir belge numarasıyla onaylanmış (' . $kayit['belge_no'] . ').', 'conflict', 409);
}
if ($kayit) {
    $belge = $kayit['belge_no'];
}

$s = yp_settings();
$p = [
    'ad' => $ad, 'tckn' => $tckn, 'iban' => $iban, 'brut' => $brut, 'stopaj' => $stopaj, 'net' => $net,
    'aciklama' => $aciklama, 'belge_no' => $belge, 'ettn' => $ettn, 'tarih' => date('Y-m-d'),
];

$sonuclar = ['parasut' => null, 'bizimhesap' => null];
$tekrar = true;
foreach (['parasut', 'bizimhesap'] as $svc) {
    if ($kayit && !empty($kayit[$svc]['ok'])) {
        $sonuclar[$svc] = $kayit[$svc] + ['tekrar' => true];
        continue;
    }
    if (!yp_service_configured($s, $svc)) {
        continue;
    }
    $tekrar = false;
    $client = $svc === 'parasut' ? new ParasutClient($s['parasut']) : new BizimHesapClient($s['bizimhesap']);
    try {
        $sonuclar[$svc] = $client->createGiderPusulasi($p);
    } catch (Exception $ex) {
        yp_log('hata', 'cekim_onayla ' . $svc . ': ' . $ex->getMessage());
        $sonuclar[$svc] = ['ok' => false, 'msg' => 'Beklenmeyen hata oluştu.'];
    }
}

yp_store_update('cekimler', function ($d) use ($id, $belge, $sonuclar, $brut, $net) {
    $d[$id] = [
        'belge_no'   => $belge,
        't'          => date('c'),
        'brut'       => $brut,
        'net'        => $net,
        'parasut'    => $sonuclar['parasut'],
        'bizimhesap' => $sonuclar['bizimhesap'],
    ];
    return $d;
});
yp_unlock($lock);

yp_log('cekim', 'Çekim onaylandı', [
    'id'         => $id,
    'belge_no'   => $belge,
    'brut'       => $brut,
    'parasut'    => $sonuclar['parasut'] ? ($sonuclar['parasut']['ok'] ? 'ok' : 'hata') : 'yok',
    'bizimhesap' => $sonuclar['bizimhesap'] ? ($sonuclar['bizimhesap']['ok'] ? 'ok' : 'hata') : 'yok',
]);

$out = [
    'ok'             => true,
    'id'             => $id,
    'belge_no'       => $belge,
    'banka_aciklama' => 'YangPazar Cekim Odemesi Ref: ' . $id . ' - ' . $ad, // müşterinin dekontunda görünür: pusula ifadesi içermez
    'parasut'        => $sonuclar['parasut'],
    'bizimhesap'     => $sonuclar['bizimhesap'],
];
if (!$sonuclar['parasut'] && !$sonuclar['bizimhesap']) {
    $out['uyari'] = 'Bağlı muhasebe servisi yok; kayıt yalnızca bu sunucuda tutuldu.';
} elseif ($tekrar) {
    $out['tekrar'] = true;
}
yp_json($out);
`],
  ['api/parasut_client.php', String.raw`<?php
/**
 * Paraşüt v4 REST API istemcisi.
 * Ayarlar Yönetim › Entegrasyonlar › Paraşüt kartından girilir; bu dosyada düzenlenecek bir şey yoktur.
 *
 * OAuth: POST https://api.parasut.com/oauth/token (grant_type=password, redirect_uri=urn:ietf:wg:oauth:2.0:oob)
 * API:   https://api.parasut.com/v4/{company_id}/...
 */
if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && @realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/_lib.php';

class ParasutClient
{
    const OAUTH_URL = 'https://api.parasut.com/oauth/token';
    const API_BASE = 'https://api.parasut.com/v4/';
    const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

    private $c;
    private $token = '';

    public function __construct(array $cfg)
    {
        $this->c = $cfg;
    }

    public static function fromSettings()
    {
        $s = yp_settings();
        return new self($s['parasut']);
    }

    public function isConfigured()
    {
        return yp_service_configured(['parasut' => $this->c], 'parasut');
    }

    private function fingerprint()
    {
        return hash('sha256', $this->c['company_id'] . '|' . $this->c['client_id'] . '|' . $this->c['username']);
    }

    /** Erişim jetonu alır (şifreli önbellekte saklanır). */
    public function authenticate($force = false)
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'msg' => 'Paraşüt ayarları eksik. Firma No, Client ID, Client Secret, e-posta ve şifreyi girin.'];
        }
        $fp = $this->fingerprint();
        if (!$force) {
            $cache = yp_store_read('onbellek');
            if (!empty($cache['parasut']['token']) && $cache['parasut']['fp'] === $fp && $cache['parasut']['exp'] > time() + 60) {
                $this->token = $cache['parasut']['token'];
                return ['ok' => true, 'msg' => 'Önbellekten'];
            }
        }
        $r = yp_http('POST', self::OAUTH_URL, ['form' => [
            'grant_type'    => 'password',
            'client_id'     => $this->c['client_id'],
            'client_secret' => $this->c['client_secret'],
            'username'      => $this->c['username'],
            'password'      => $this->c['password'],
            'redirect_uri'  => self::REDIRECT_URI,
        ], 'timeout' => 20]);
        if ($r['error'] !== '') {
            return ['ok' => false, 'msg' => 'Paraşüt sunucusuna ulaşılamadı: ' . $r['error']];
        }
        $j = $r['json'];
        if ($r['ok'] && is_array($j) && !empty($j['access_token'])) {
            $this->token = (string)$j['access_token'];
            $exp = time() + (isset($j['expires_in']) ? (int)$j['expires_in'] : 7200);
            $tok = $this->token;
            yp_store_update('onbellek', function ($cache) use ($tok, $exp, $fp) {
                $cache['parasut'] = ['token' => $tok, 'exp' => $exp, 'fp' => $fp];
                return $cache;
            });
            return ['ok' => true, 'msg' => 'Giriş başarılı'];
        }
        $err = is_array($j) && isset($j['error']) ? (string)$j['error'] : '';
        $tr = [
            'invalid_client'         => 'Client ID veya Client Secret hatalı.',
            'invalid_grant'          => 'Paraşüt e-posta adresi veya şifresi hatalı.',
            'unauthorized_client'    => 'Bu uygulamanın (Client ID) password grant yetkisi yok; Paraşüt destekten API erişimi isteyin.',
            'invalid_request'        => 'Paraşüt isteği reddetti (eksik alan).',
        ];
        $msg = isset($tr[$err]) ? $tr[$err] : ('Paraşüt girişi başarısız (HTTP ' . $r['code'] . ($err !== '' ? ', ' . yp_str($err, 60) : '') . ').');
        return ['ok' => false, 'msg' => $msg];
    }

    /** JSON:API isteği. 401 gelirse bir kez yeniden giriş yapar. */
    public function request($method, $path, $body = null, array $query = [], $retry = true)
    {
        if ($this->token === '') {
            $a = $this->authenticate();
            if (!$a['ok']) {
                return ['ok' => false, 'code' => 0, 'json' => null, 'msg' => $a['msg']];
            }
        }
        $url = self::API_BASE . rawurlencode((string)$this->c['company_id']) . '/' . ltrim($path, '/');
        if ($query) {
            $url .= '?' . http_build_query($query, '', '&');
        }
        $o = ['headers' => ['Authorization: Bearer ' . $this->token], 'timeout' => 30];
        if ($body !== null) {
            $o['json'] = $body;
        }
        $r = yp_http($method, $url, $o);
        if ($r['error'] !== '') {
            return ['ok' => false, 'code' => 0, 'json' => null, 'msg' => 'Paraşüt sunucusuna ulaşılamadı: ' . $r['error']];
        }
        if ($r['code'] === 401 && $retry) {
            $a = $this->authenticate(true);
            if (!$a['ok']) {
                return ['ok' => false, 'code' => 401, 'json' => null, 'msg' => $a['msg']];
            }
            return $this->request($method, $path, $body, $query, false);
        }
        if (!$r['ok']) {
            return ['ok' => false, 'code' => $r['code'], 'json' => $r['json'], 'msg' => self::errorText($r)];
        }
        return ['ok' => true, 'code' => $r['code'], 'json' => $r['json'], 'msg' => ''];
    }

    private static function errorText(array $r)
    {
        $j = $r['json'];
        $detail = '';
        if (is_array($j) && !empty($j['errors'][0])) {
            $e = $j['errors'][0];
            $detail = isset($e['detail']) ? $e['detail'] : (isset($e['title']) ? $e['title'] : '');
        }
        $base = [403 => 'Bu işlem için yetkiniz yok.', 404 => 'Kayıt veya firma bulunamadı (Firma No hatalı olabilir).',
                 422 => 'Paraşüt kaydı kabul etmedi.', 429 => 'Paraşüt istek sınırı aşıldı, biraz sonra tekrar deneyin.'];
        $m = isset($base[$r['code']]) ? $base[$r['code']] : 'Paraşüt hatası (HTTP ' . $r['code'] . ').';
        return $m . ($detail !== '' ? ' ' . yp_str($detail, 300) : '');
    }

    /** Bağlantı testi: OAuth + firma erişimi. */
    public function testConnection()
    {
        $a = $this->authenticate(true);
        if (!$a['ok']) {
            return ['ok' => false, 'msg' => $a['msg']];
        }
        $r = $this->request('GET', 'accounts', null, ['page[size]' => 1]);
        if (!$r['ok']) {
            if ($r['code'] === 404 || $r['code'] === 403) {
                return ['ok' => false, 'msg' => 'Giriş başarılı ancak Firma No (' . $this->c['company_id'] . ') bu kullanıcıya ait değil veya hatalı.'];
            }
            return ['ok' => false, 'msg' => $r['msg']];
        }
        return ['ok' => true, 'msg' => 'Paraşüt bağlantısı başarılı (Firma No: ' . $this->c['company_id'] . ').'];
    }

    /** TCKN ile tedarikçi (kişi) bulur; yoksa oluşturur. */
    public function findOrCreateSupplier($ad, $tckn, $iban)
    {
        $r = $this->request('GET', 'contacts', null, ['filter[tax_number]' => $tckn, 'page[size]' => 1]);
        if ($r['ok'] && !empty($r['json']['data'][0]['id'])) {
            return ['ok' => true, 'id' => (string)$r['json']['data'][0]['id']];
        }
        $r = $this->request('POST', 'contacts', ['data' => [
            'type'       => 'contacts',
            'attributes' => [
                'name'         => $ad,
                'contact_type' => 'person',
                'tax_number'   => $tckn,
                'account_type' => 'supplier',
                'iban'         => $iban,
            ],
        ]]);
        if ($r['ok'] && !empty($r['json']['data']['id'])) {
            return ['ok' => true, 'id' => (string)$r['json']['data']['id']];
        }
        return ['ok' => false, 'id' => null, 'msg' => $r['msg']];
    }

    /**
     * Çekim (kullanıcıya ödeme) için e-Gider Pusulası karşılığı gider kaydı:
     *  1) tedarikçi kişi (TCKN) → 2) gider/alış faturası kaydı (purchase_bills) → 3) hesap No girildiyse net ödeme.
     * $p: ad, tckn, iban, brut, stopaj, net, aciklama, belge_no, ettn, tarih(Y-m-d)
     */
    public function createGiderPusulasi(array $p)
    {
        $a = $this->authenticate();
        if (!$a['ok']) {
            return ['ok' => false, 'msg' => $a['msg']];
        }
        $contact = $this->findOrCreateSupplier($p['ad'], $p['tckn'], $p['iban']);

        $desc = 'e-Gider Pusulası ' . $p['belge_no'] . ' - ' . $p['ad']
              . ($p['stopaj'] > 0 ? ' (stopaj ' . number_format($p['stopaj'], 2, '.', '') . ' TL)' : '')
              . ($p['ettn'] !== '' ? ' ETTN ' . $p['ettn'] : '')
              . ($p['aciklama'] !== '' ? ' - ' . $p['aciklama'] : '');
        $bill = ['data' => [
            'type'       => 'purchase_bills',
            'attributes' => [
                'item_type'   => 'purchase_bill',
                'description' => yp_str($desc, 250),
                'issue_date'  => $p['tarih'],
                'due_date'    => $p['tarih'],
                'invoice_no'  => $p['belge_no'],
                'currency'    => 'TRL',
                'net_total'   => $p['brut'],
                'total_vat'   => 0,
            ],
        ]];
        if ($contact['ok']) {
            $bill['data']['relationships'] = ['supplier' => ['data' => ['id' => $contact['id'], 'type' => 'contacts']]];
        }
        // Not: dokümandaki "purchase_bills#basic" yalnızca sayfa çapasıdır; HTTP isteği /purchase_bills adresine gider.
        $r = $this->request('POST', 'purchase_bills', $bill);
        if (!$r['ok'] || empty($r['json']['data']['id'])) {
            return ['ok' => false, 'msg' => 'Gider kaydı oluşturulamadı: ' . ($r['msg'] !== '' ? $r['msg'] : 'yanıt boş'),
                    'contact_id' => $contact['ok'] ? $contact['id'] : null];
        }
        $billId = (string)$r['json']['data']['id'];

        $paymentId = null;
        $payMsg = '';
        if (!empty($this->c['account_id'])) {
            $pr = $this->request('POST', 'purchase_bills/' . rawurlencode($billId) . '/payments', ['data' => [
                'type'       => 'payments',
                'attributes' => [
                    'account_id' => (int)$this->c['account_id'],
                    'date'       => $p['tarih'],
                    'amount'     => $p['net'],
                    'notes'      => yp_str('YangPazar e-Gider Pusulasi No: ' . $p['belge_no'] . ' - ' . $p['ad'], 250),
                ],
            ]]);
            if ($pr['ok'] && !empty($pr['json']['data']['id'])) {
                $paymentId = (string)$pr['json']['data']['id'];
            } else {
                $payMsg = ' Ödeme kaydı eklenemedi: ' . $pr['msg'];
            }
        }
        return [
            'ok'               => true,
            'contact_id'       => $contact['ok'] ? $contact['id'] : null,
            'purchase_bill_id' => $billId,
            'payment_id'       => $paymentId,
            'msg'              => 'Paraşüt gider kaydı oluşturuldu.' . $payMsg,
        ];
    }

    /** PayTR tahsilatı için kasa/banka hesabına para girişi kaydı. */
    public function createTahsilatGirisi($amount, $date, $description)
    {
        if (empty($this->c['account_id'])) {
            return ['ok' => false, 'msg' => 'Paraşüt kasa/banka hesap No girilmemiş.'];
        }
        $r = $this->request('POST', 'accounts/' . rawurlencode((string)$this->c['account_id']) . '/debit_transactions', ['data' => [
            'type'       => 'transactions',
            'attributes' => [
                'date'        => $date,
                'amount'      => $amount,
                'description' => yp_str($description, 250),
            ],
        ]]);
        if ($r['ok']) {
            return ['ok' => true, 'id' => isset($r['json']['data']['id']) ? (string)$r['json']['data']['id'] : null, 'msg' => 'Kaydedildi'];
        }
        return ['ok' => false, 'msg' => $r['msg']];
    }
}
`],
  ['api/bizimhesap_client.php', String.raw`<?php
/**
 * Bizim Hesap B2B REST API istemcisi.
 * Ayarlar Yönetim › Entegrasyonlar › Bizim Hesap kartından girilir; bu dosyada düzenlenecek bir şey yoktur.
 *
 * Uç noktalar: https://bizimhesap.com/api/b2b/{warehouses|addinvoice|...}
 * Kimlik: "Token" başlığı = Firma ID (ve gövdede firmId), varsa "Key" başlığı = API anahtarı.
 * Fatura tipi: 3 = Satış, 5 = Alış (e-Gider Pusulası karşılığı alış kaydı olarak 5 kullanılır).
 */
if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && @realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/_lib.php';

class BizimHesapClient
{
    const BASE = 'https://bizimhesap.com/api/b2b/';
    const TYPE_SALE = 3;
    const TYPE_PURCHASE = 5;

    private $c;

    public function __construct(array $cfg)
    {
        $this->c = $cfg;
    }

    public static function fromSettings()
    {
        $s = yp_settings();
        return new self($s['bizimhesap']);
    }

    public function isConfigured()
    {
        return yp_service_configured(['bizimhesap' => $this->c], 'bizimhesap');
    }

    private function headers()
    {
        $h = ['Token: ' . $this->c['firm_id']];
        if (!empty($this->c['api_key'])) {
            $h[] = 'Key: ' . $this->c['api_key'];
        }
        return $h;
    }

    /** Yanıttaki hata metnini çıkarır ('' = hata yok). */
    private static function apiError(array $r)
    {
        $j = $r['json'];
        if (is_array($j)) {
            if (isset($j['resultCode']) && (int)$j['resultCode'] === 0 && !empty($j['errorText'])) {
                return yp_str($j['errorText'], 300);
            }
            if (!empty($j['Message'])) {
                return yp_str($j['Message'], 300);
            }
            if (!empty($j['error']) && is_string($j['error'])) {
                return yp_str($j['error'], 300);
            }
        }
        if (!$r['ok']) {
            return 'HTTP ' . $r['code'];
        }
        if (!is_array($j)) {
            return 'Beklenmeyen yanıt';
        }
        return '';
    }

    private function call($method, $path, $body = null)
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'json' => null, 'msg' => 'Bizim Hesap ayarları eksik. Firma ID girin.'];
        }
        $o = ['headers' => $this->headers(), 'timeout' => 30];
        if ($body !== null) {
            $o['json'] = $body;
        }
        $r = yp_http($method, self::BASE . $path, $o);
        if ($r['error'] !== '') {
            return ['ok' => false, 'json' => null, 'msg' => 'Bizim Hesap sunucusuna ulaşılamadı: ' . $r['error']];
        }
        $e = self::apiError($r);
        if ($e !== '') {
            $hint = ($r['code'] === 401 || $r['code'] === 403) ? ' (Firma ID / API anahtarı hatalı olabilir)' : '';
            return ['ok' => false, 'json' => $r['json'], 'msg' => 'Bizim Hesap hatası: ' . $e . $hint];
        }
        return ['ok' => true, 'json' => $r['json'], 'msg' => ''];
    }

    /** Bağlantı testi: kimlik doğrulamalı hafif çağrı (depo listesi). */
    public function testConnection()
    {
        $r = $this->call('GET', 'warehouses');
        if (!$r['ok']) {
            return ['ok' => false, 'msg' => $r['msg']];
        }
        $n = null;
        if (isset($r['json']['data']['warehouses']) && is_array($r['json']['data']['warehouses'])) {
            $n = count($r['json']['data']['warehouses']);
        } elseif (isset($r['json']['warehouses']) && is_array($r['json']['warehouses'])) {
            $n = count($r['json']['warehouses']);
        }
        return ['ok' => true, 'msg' => 'Bizim Hesap bağlantısı başarılı' . ($n !== null ? ' (' . $n . ' depo).' : '.')];
    }

    /**
     * Çekim için e-Gider Pusulası karşılığı ALIŞ kaydı (invoiceType=5).
     * $p: ad, tckn, iban, brut, stopaj, net, aciklama, belge_no, ettn, tarih(Y-m-d)
     */
    public function createGiderPusulasi(array $p)
    {
        $dt = $p['tarih'] . 'T' . date('H:i:s');
        $brut = round((float)$p['brut'], 2);
        $note = 'YangPazar e-Gider Pusulasi No: ' . $p['belge_no'] . ' - ' . $p['ad']
              . ' | Brüt ' . number_format($brut, 2, '.', '') . ' TL, Stopaj ' . number_format($p['stopaj'], 2, '.', '')
              . ' TL, Net ' . number_format($p['net'], 2, '.', '') . ' TL'
              . ($p['ettn'] !== '' ? ' | ETTN ' . $p['ettn'] : '')
              . ($p['aciklama'] !== '' ? ' | ' . $p['aciklama'] : '');
        $body = [
            'firmId'      => $this->c['firm_id'],
            'invoiceNo'   => $p['belge_no'],
            'invoiceType' => self::TYPE_PURCHASE,
            'note'        => yp_str($note, 250),
            'dates'       => ['invoiceDate' => $dt, 'dueDate' => $dt, 'deliveryDate' => $dt],
            'customer'    => [
                'customerId' => 'YP-' . substr(hash('sha256', $p['tckn']), 0, 12),
                'title'      => $p['ad'],
                'taxOffice'  => '',
                'taxNo'      => $p['tckn'],
                'email'      => '',
                'phone'      => '',
                'address'    => '',
            ],
            'amounts'     => ['currency' => 'TL', 'gross' => $brut, 'discount' => 0, 'net' => $brut, 'tax' => 0, 'total' => $brut],
            'details'     => [[
                'productId'   => 'YP-EGP',
                'productName' => 'Dijital oyun ürünü alımı (e-Gider Pusulası)',
                'note'        => yp_str($p['aciklama'], 100),
                'barcode'     => '',
                'taxRate'     => 0,
                'quantity'    => 1,
                'unitPrice'   => $brut,
                'grossPrice'  => $brut,
                'discount'    => 0,
                'net'         => $brut,
                'tax'         => 0,
                'total'       => $brut,
            ]],
        ];
        $r = $this->call('POST', 'addinvoice', $body);
        if (!$r['ok']) {
            return ['ok' => false, 'msg' => $r['msg']];
        }
        return [
            'ok'   => true,
            'guid' => isset($r['json']['guid']) ? (string)$r['json']['guid'] : null,
            'url'  => isset($r['json']['url']) ? (string)$r['json']['url'] : null,
            'msg'  => 'Bizim Hesap alış kaydı oluşturuldu.',
        ];
    }
}
`],
  ['api/data/.htaccess', String.raw`# yangpazar API · data/ klasörü dışarıdan ERİŞİLEMEZ.
# Apache 2.4
<IfModule mod_authz_core.c>
    Require all denied
</IfModule>
# Apache 2.2
<IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
</IfModule>
Options -Indexes
`],
  ['api/data/index.php', String.raw`<?php
// boş
`],
  ['api/.htaccess', String.raw`# yangpazar API · bu dosyada düzenlenecek bir şey yoktur.
Options -Indexes
DirectoryIndex durum.php

# data/ klasörü ve yardımcı dosyalar doğrudan açılamaz
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^data(/|$) - [F,L]
</IfModule>

<FilesMatch "^(_lib|parasut_client|bizimhesap_client)\.php$|\.(md|log|json|lock)$">
    <IfModule mod_authz_core.c>
        Require all denied
    </IfModule>
    <IfModule !mod_authz_core.c>
        Order allow,deny
        Deny from all
    </IfModule>
</FilesMatch>

<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "no-referrer"
</IfModule>
`],
  ['api/KURULUM.txt', String.raw`YANGPAZAR ÖDEME VE MUHASEBE BAĞLANTISI · KURULUM (3 ADIM)
==========================================================

Hiçbir dosyayı açıp düzenlemenize gerek yok. Bütün bilgiler sitenizin
yönetim panelinden girilir ve sunucuda şifreli olarak saklanır.


1. ADIM · Dosyaları hostinge yükleyin (5 dakika)
-------------------------------------------------
  1) Hosting panelinize (cPanel) girin ve "Dosya Yöneticisi"ni açın.
  2) Sitenizin ana klasörüne gidin (genellikle "public_html").
  3) Üstteki "Yükle" düğmesiyle yangpazar-api.zip dosyasını yükleyin.
  4) Yüklenen zip dosyasına sağ tıklayın → "Ayıkla" (Extract) deyin.
     Sonunda public_html içinde "api" adında bir klasör görmelisiniz.
  5) Zip dosyasını silebilirsiniz.

  Kontrol: Tarayıcıda https://siteniz.com/api/durum.php adresini açın.
  İçinde "ok":true yazan bir satır görüyorsanız bu adım tamamdır.


2. ADIM · Panelden kurulumu tamamlayın ve PayTR bilgilerini girin
------------------------------------------------------------------
  1) Sitenizi açın → Yönetim › Entegrasyonlar sayfasına gidin.
  2) "Kurulumu tamamla" kartında:
       - Kendinize bir API şifresi belirleyin (en az 10 karakter).
         Bu şifreyi bir yere not edin; panele her girişte sorulur.
       - Site adresinizi yazın (ör. https://yangpazar.com).
     "Kurulumu tamamla" düğmesine basın.
     (Kurulum yalnızca bir kez yapılır; sonra kimse tekrar kurulum yapamaz.)
  3) PayTR kartına şu üç bilgiyi girin. Bunlar PayTR Mağaza Paneli'nde
     "Bilgi" sayfasında yazar:
       - Mağaza No
       - Mağaza Parola
       - Mağaza Gizli Anahtar
  4) ÖNCE "Test modu" açık kalsın. "Kaydet"e, ardından
     "Bağlantıyı test et"e basın. "Bağlı ✓" görmelisiniz.
     Hata çıkarsa ekrandaki PayTR mesajını okuyun (genellikle bilgilerden
     biri yanlış yazılmıştır).
  5) Test kartıyla küçük bir deneme ödemesi yapın. Her şey yolundaysa
     "Test modu"nu kapatıp "Kaydet"e basın; artık CANLI ödemeler alınır.

  Paraşüt veya Bizim Hesap kullanıyorsanız aynı sayfadaki kartlarına
  bilgilerinizi girip yine "Kaydet" ve "Bağlantıyı test et" yapın.
  Gizli alanlar kaydedildikten sonra yıldızlı görünür; değiştirmek
  istemiyorsanız boş bırakmanız yeterlidir, eski değer korunur.


3. ADIM · PayTR Mağaza Paneli'ne Bildirim adresini yapıştırın
-------------------------------------------------------------
  1) Entegrasyonlar sayfasındaki "PayTR panelinde yapman gereken tek şey"
     kutusunda Bildirim URL'si yazar
     (ör. https://siteniz.com/api/paytr_bildirim.php). "Kopyala"ya basın.
  2) PayTR Mağaza Paneli › Destek & Kurulum › Ayarlar › "Bildirim URL"
     alanına yapıştırıp kaydedin.
     Bu adım yapılmazsa ödemeler sitenize "tamamlandı" olarak düşmez.


İSTEĞE BAĞLI · Otomatik hakediş (her saat çalışan görev)
--------------------------------------------------------
  Entegrasyonlar sayfasındaki "Otomatik hakediş (cron)" kutusundaki
  adresi kopyalayın. Bu adres gizli bir anahtar içerir; kimseyle
  paylaşmayın.
  - Ücretsiz yol: https://cron-job.org adresinde hesap açın →
    "Create cronjob" → adresi yapıştırın → "Every hour" (her saat başı)
    seçin → kaydedin.
  - Ya da cPanel › "Cron Jobs" bölümüne saatlik bir görev olarak ekleyin.


SORUN ÇÖZME
-----------
  - "data klasörü yazılabilir değil" hatası: Dosya Yöneticisi'nde
    api/data klasörüne sağ tıklayın → "İzinleri Değiştir" → 755 yapın.
  - API şifrenizi unuttuysanız: Dosya Yöneticisi'nde api/data klasöründeki
    admin.php dosyasını silin, ardından Entegrasyonlar'dan kurulumu yeniden
    yapın (PayTR bilgilerini de yeniden girmeniz gerekir).
  - 5 kez yanlış şifre girerseniz 15 dakika beklemeniz gerekir.
`],
  ['api/KURULUM_VE_VERGI_REHBERI.md', String.raw`# yangpazar.com · Ön Muhasebe, Vergi Matrahı ve e-Gider Pusulası Rehberi

## 1. Vergi Matrahı Mantığı (Nasıl Vergiden Düşeceksin?)
Pazaryeri modelinde şirket banka hesabına giren tüm para sizin kârınız değildir.
- Brüt Giriş (Gelir / Ciro): PayTR ile yüklenen toplam para.
- Resmi Çıkış (Gider / Maliyet): Kullanıcı IBAN'ına gönderilen ve adına kesilen e-Gider Pusulası tutarları.
- Vergi Matrahı = Toplam Giriş (Ciro) - e-Gider Pusulaları Toplamı - İşletme Giderleri
Maliye nezdinde şirketiniz cironun tamamı üzerinden değil, yalnızca komisyon kârı üzerinden vergilendirilir.
`]
];
/* API_KIT_END */

const muhasebeFiles = () => API_KIT_FILES;

function mMuhasebeKit(){
  const files = muhasebeFiles().concat([[ENT_CODE_FILE,'']]); const canEnt = admCan(['muhasebe','odeme']);
  modal(`<div class="md" style="width:min(640px,100%)" role="dialog" aria-modal="true" aria-labelledby="mkit_t">
    <div class="md-h"><div><h3 id="mkit_t">API paketi · yangpazar-api.zip</h3><small class="muted" style="font-size:12px">PayTR, Paraşüt ve Bizim Hesap bağlantısı için sunucu dosyaları</small></div><button class="md-x" data-act="close" aria-label="Kapat">×</button></div>
    <div class="md-b stack">
      <div class="note note-ok" style="font-size:14px"><b>Hiçbir dosyayı düzenlemenize gerek yok.</b></div>
      <ol class="ent-ol mkit-ol" id="mkit_steps"><li><b>1)</b> Zip'i hostinginize <b>/api</b> olarak yükleyin</li><li><b>2)</b> Yönetim › Entegrasyonlar'dan kurulumu tamamlayın</li><li><b>3)</b> PayTR Bildirim URL'sini yapıştırın.</li></ol>
      <span class="muted" style="font-size:12.5px;line-height:1.5">Yükleme: cPanel › Dosya Yöneticisi › public_html › Yükle, ardından zip'e sağ tıklayıp Ayıkla. Şifre ve anahtarlar pakette yoktur; onları Entegrasyonlar sayfasında girersiniz ve yalnız sunucunuzda şifreli saklanır.</span>
      <details class="panel ent-adv"><summary>Paketteki dosyalar (${files.length})</summary><div class="panel-b"><ul class="ent-files">${files.map(([n])=>`<li>${esc(n)}</li>`).join('')}</ul></div></details>
      <div class="hstack" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Kapat</button><button type="button" class="btn" data-act="muhasebe-zip-dl">Paketi indir</button>${canEnt?`<button type="button" class="btn btn-primary" data-act="ent-go">Entegrasyonlar'a git</button>`:''}</div>
    </div>
  </div>`);
}

const muhasebeKit = () => zipFiles(muhasebeFiles());

const tcKit = () => zipFiles([['kimlik/dogrula.php',TC_PHP],['kimlik/KURULUM.txt',TC_README]]);

