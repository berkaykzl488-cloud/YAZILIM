<?php
/**
 * Halı Saha Kadrosu · sunucu tarafı (PHP 7.4+, veritabanı gerekmez)
 *
 * Veriler data/kadro.php dosyasında JSON olarak tutulur. Dosyanın başındaki
 * PHP satırı, dosya tarayıcıdan açılırsa içeriği göstermeden çıkar.
 * Kişi sınırı burada uygulanır; tarayıcıdan aşılamaz.
 */

declare(strict_types=1);

const DATA_DIR      = __DIR__ . '/data';
const DATA_FILE     = DATA_DIR . '/kadro.php';
const GUARD         = "<?php http_response_code(404); exit; ?>\n";
const MIN_CAP       = 2;
const MAX_CAP       = 40;
const MAX_RESERVE   = 20;
const MAX_ENTRIES   = 80;   // yedekler dahil toplam kayıt üst sınırı
const NAME_MAX      = 30;
const LOGIN_TRIES   = 5;    // bu kadar hatalı denemeden sonra
const LOGIN_LOCK    = 600;  // saniye boyunca giriş kapalı
const SESSION_TTL   = 60 * 60 * 24 * 14; // yönetici oturumu 14 gün

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// ---------- yardımcılar ----------

function fail(int $code, string $msg): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function default_state(): array
{
    return [
        'settings' => ['capacity' => 14, 'reserve' => 3, 'title' => 'Halı Saha', 'when' => '', 'place' => ''],
        'players'  => [],
        'admin'    => ['hash' => '', 'version' => 1],
        'logins'   => [],
    ];
}

/** Veri dosyasını kilitleyip açar; $fn durumu değiştirebilir. Dönüş: $fn'in sonucu. */
function with_state(callable $fn, bool $write = true)
{
    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0750, true)) {
        fail(500, 'Veri klasörü oluşturulamadı. halisaha/data klasörüne yazma izni verin.');
    }
    $fh = @fopen(DATA_FILE, 'c+');
    if (!$fh) fail(500, 'Veri dosyası açılamadı. halisaha/data klasörüne yazma izni verin.');
    flock($fh, $write ? LOCK_EX : LOCK_SH);
    $raw = stream_get_contents($fh);
    $state = default_state();
    if ($raw !== false && $raw !== '') {
        $json = substr($raw, strlen(GUARD));
        $dec = json_decode($json, true);
        if (is_array($dec)) $state = array_replace_recursive(default_state(), $dec);
        if (isset($dec['players']) && is_array($dec['players'])) $state['players'] = array_values($dec['players']);
        if (isset($dec['logins']) && is_array($dec['logins'])) $state['logins'] = $dec['logins'];
    }
    $before = json_encode($state);
    $result = $fn($state);
    if ($write && json_encode($state) !== $before) {
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, GUARD . json_encode($state, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        fflush($fh);
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $result;
}

function clean_text($v, int $max): string
{
    $s = is_string($v) ? $v : '';
    $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    return mb_substr($s, 0, $max);
}

function same_name(string $a, string $b): bool
{
    return mb_strtolower($a, 'UTF-8') === mb_strtolower($b, 'UTF-8');
}

function player_token_hash(): string
{
    $t = $_SERVER['HTTP_X_PLAYER_TOKEN'] ?? '';
    if (!is_string($t) || !preg_match('/^[a-f0-9]{32,64}$/', $t)) return '';
    return hash('sha256', $t);
}

function client_ip(): string
{
    return (string)($_SERVER['REMOTE_ADDR'] ?? '0');
}

function start_session(): void
{
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('halisaha_yonetici');
    session_set_cookie_params([
        'lifetime' => SESSION_TTL,
        'path'     => $dir,
        'secure'   => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.gc_maxlifetime', (string)SESSION_TTL);
    ini_set('session.use_strict_mode', '1');
    session_start();
}

function is_admin(array $state): bool
{
    return !empty($_SESSION['admin'])
        && $state['admin']['hash'] !== ''
        && ($_SESSION['admin_v'] ?? 0) === $state['admin']['version'];
}

function public_view(array $state, bool $admin): array
{
    $me = player_token_hash();
    $players = [];
    foreach ($state['players'] as $p) {
        $players[] = [
            'id'     => $p['id'],
            'name'   => $p['name'],
            'manual' => !empty($p['manual']),
            'mine'   => $me !== '' && isset($p['token']) && hash_equals($p['token'], $me),
        ];
    }
    return [
        'ok'         => true,
        'settings'   => $state['settings'],
        'players'    => $players,
        'admin'      => $admin,
        'needsSetup' => $state['admin']['hash'] === '',
    ];
}

function login_locked(array &$state): int
{
    $ip = client_ip();
    $now = time();
    foreach ($state['logins'] as $k => $l) {
        if (($l['until'] ?? 0) < $now && ($l['at'] ?? 0) < $now - LOGIN_LOCK) unset($state['logins'][$k]);
    }
    $l = $state['logins'][$ip] ?? null;
    return ($l && ($l['until'] ?? 0) > $now) ? (int)$l['until'] - $now : 0;
}

function login_failed(array &$state): void
{
    $ip = client_ip();
    $l = $state['logins'][$ip] ?? ['n' => 0, 'at' => 0, 'until' => 0];
    $l['n'] = ($l['n'] ?? 0) + 1;
    $l['at'] = time();
    if ($l['n'] >= LOGIN_TRIES) { $l['until'] = time() + LOGIN_LOCK; $l['n'] = 0; }
    $state['logins'][$ip] = $l;
}

// ---------- istek ----------

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? 'state');
start_session();

if ($method === 'GET') {
    if ($action !== 'state') fail(404, 'Bilinmeyen işlem.');
    $out = with_state(fn(array &$s) => public_view($s, is_admin($s)), false);
    session_write_close();
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method !== 'POST') fail(405, 'Desteklenmeyen istek.');

// Başka sitelerden gönderilen formları reddet (CSRF): yalnız JSON ve aynı köken.
$ctype = (string)($_SERVER['CONTENT_TYPE'] ?? '');
if (stripos($ctype, 'application/json') !== 0) fail(415, 'İstek biçimi hatalı.');
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '') {
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    $oh = parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '');
    if (!hash_equals(strtolower($host), strtolower($oh))) fail(403, 'Bu istek başka bir siteden geldi.');
}

$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) $in = [];

$out = with_state(function (array &$s) use ($action, $in) {
    $admin = is_admin($s);
    $cap = (int)$s['settings']['capacity'];
    $reserve = max(0, (int)($s['settings']['reserve'] ?? 3));
    $limit = $cap + $reserve;   // kadro + yedek
    // Sıra = katılım sırası. Kadrodan biri çıkınca listedeki sonraki kişi (1. yedek) kendiliğinden kadroya girer.
    $placed = function () use (&$s, $cap): string {
        $n = count($s['players']);
        return $n <= $cap ? 'Kadrodasın! Görüşürüz sahada.'
                          : 'Kadro dolu, ' . ($n - $cap) . '. yedek olarak yazıldın. Biri çıkarsa sırayla kadroya geçeceksin.';
    };

    switch ($action) {

        // ----- oyuncu -----
        case 'join': {
            $tok = player_token_hash();
            if ($tok === '') fail(400, 'Tarayıcı kimliği eksik. Sayfayı yenileyip tekrar dene.');
            $name = clean_text($in['name'] ?? '', NAME_MAX);
            if ($name === '') fail(400, 'Önce adını yaz.');
            foreach ($s['players'] as $p) {
                if (isset($p['token']) && hash_equals($p['token'], $tok)) fail(409, 'Zaten kadrodasın.');
                if (same_name($p['name'], $name)) fail(409, 'Bu isim listede zaten var. Soyadının ilk harfini ekle.');
            }
            if (count($s['players']) >= $limit) {
                fail(409, $reserve > 0 ? 'Kadro ve yedek listesi doldu, son yer başkasına gitti.' : 'Kadro doldu, son yer başkasına gitti.');
            }
            $s['players'][] = ['id' => bin2hex(random_bytes(8)), 'name' => $name, 'token' => $tok, 'manual' => false, 'at' => time()];
            return ['msg' => $placed()];
        }

        case 'leave': {
            $tok = player_token_hash();
            $idx = -1;
            foreach ($s['players'] as $i => $p) {
                if ($tok !== '' && isset($p['token']) && hash_equals($p['token'], $tok)) { $idx = $i; break; }
            }
            if ($idx < 0) fail(404, 'Listede kaydın bulunamadı.');
            $promoted = ($idx < $cap && isset($s['players'][$cap])) ? $s['players'][$cap]['name'] : '';
            array_splice($s['players'], $idx, 1);
            if ($idx >= $cap) return ['msg' => 'Yedek listesinden çıktın.'];
            return ['msg' => $promoted !== '' ? "Kadrodan çıktın. Yerine yedekten $promoted geçti." : 'Kadrodan çıktın. Yerin boşaldı.'];
        }

        // ----- yönetici girişi -----
        case 'setup': {
            if ($s['admin']['hash'] !== '') fail(409, 'Yönetici şifresi zaten oluşturulmuş. Giriş yap.');
            $pw = (string)($in['password'] ?? '');
            if (mb_strlen($pw) < 8) fail(400, 'Şifre en az 8 karakter olmalı.');
            $s['admin']['hash'] = password_hash($pw, PASSWORD_DEFAULT);
            $s['admin']['version'] = ($s['admin']['version'] ?? 0) + 1;
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            $_SESSION['admin_v'] = $s['admin']['version'];
            return ['msg' => 'Yönetici şifresi oluşturuldu. Giriş yaptın.'];
        }

        case 'login': {
            if ($s['admin']['hash'] === '') fail(409, 'Önce yönetici şifresi oluşturulmalı.');
            $wait = login_locked($s);
            if ($wait > 0) fail(429, 'Çok fazla hatalı deneme. ' . (int)ceil($wait / 60) . ' dakika sonra tekrar dene.');
            $pw = (string)($in['password'] ?? '');
            if (!password_verify($pw, $s['admin']['hash'])) {
                login_failed($s);
                // with_state'in dosyayı kaydetmesi için hata yerine işaret döndür
                return ['__fail' => [401, 'Şifre yanlış.']];
            }
            unset($s['logins'][client_ip()]);
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            $_SESSION['admin_v'] = $s['admin']['version'];
            return ['msg' => 'Yönetici olarak giriş yaptın.'];
        }

        case 'logout': {
            $_SESSION = [];
            session_regenerate_id(true);
            return ['msg' => 'Çıkış yaptın.'];
        }
    }

    // ----- buradan sonrası yalnız yönetici -----
    if (!$admin) fail(403, 'Bu işlem için yönetici girişi gerekli.');

    switch ($action) {
        case 'settings': {
            $c = (int)($in['capacity'] ?? 0);
            if ($c < MIN_CAP || $c > MAX_CAP) fail(400, 'Kişi sayısı ' . MIN_CAP . ' ile ' . MAX_CAP . ' arasında olmalı.');
            $r = (int)($in['reserve'] ?? 3);
            if ($r < 0 || $r > MAX_RESERVE) fail(400, 'Yedek sayısı 0 ile ' . MAX_RESERVE . ' arasında olmalı.');
            $when = (string)($in['when'] ?? '');
            if ($when !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $when)) $when = '';
            $s['settings'] = [
                'capacity' => $c,
                'reserve'  => $r,
                'title'    => clean_text($in['title'] ?? '', 40),
                'when'     => $when,
                'place'    => clean_text($in['place'] ?? '', 60),
            ];
            $over = count($s['players']) - $c;
            return ['msg' => "Kaydedildi. Kadro $c kişi, $r yedek." . ($over > 0 ? " Şu an $over kişi yedekte." : '')];
        }

        case 'add': {
            $name = clean_text($in['name'] ?? '', NAME_MAX);
            if ($name === '') fail(400, 'Eklenecek kişinin adını yaz.');
            foreach ($s['players'] as $p) if (same_name($p['name'], $name)) fail(409, 'Bu isim listede zaten var.');
            if (count($s['players']) >= $limit) fail(409, 'Kadro ve yedek dolu. Önce kişi ya da yedek sayısını artır veya birini çıkar.');
            if (count($s['players']) >= MAX_ENTRIES) fail(409, 'Liste çok uzun.');
            $s['players'][] = ['id' => bin2hex(random_bytes(8)), 'name' => $name, 'token' => '', 'manual' => true, 'at' => time()];
            return ['msg' => "$name listeye eklendi."];
        }

        case 'remove': {
            $id = (string)($in['id'] ?? '');
            $idx = -1;
            foreach ($s['players'] as $i => $p) if ($p['id'] === $id) { $idx = $i; break; }
            if ($idx < 0) fail(404, 'Oyuncu bulunamadı.');
            $promoted = ($idx < $cap && isset($s['players'][$cap])) ? $s['players'][$cap]['name'] : '';
            array_splice($s['players'], $idx, 1);
            return ['msg' => 'Oyuncu listeden çıkarıldı.' . ($promoted !== '' ? " Yerine yedekten $promoted geçti." : '')];
        }

        case 'clear': {
            $s['players'] = [];
            return ['msg' => 'Liste temizlendi. Yeni hafta için hazır.'];
        }

        case 'password': {
            if (!password_verify((string)($in['current'] ?? ''), $s['admin']['hash'])) fail(401, 'Mevcut şifre yanlış.');
            $pw = (string)($in['password'] ?? '');
            if (mb_strlen($pw) < 8) fail(400, 'Yeni şifre en az 8 karakter olmalı.');
            $s['admin']['hash'] = password_hash($pw, PASSWORD_DEFAULT);
            $s['admin']['version']++;          // diğer cihazlardaki oturumlar kapanır
            $_SESSION['admin_v'] = $s['admin']['version'];
            return ['msg' => 'Şifre değişti. Diğer cihazlardaki yönetici oturumları kapandı.'];
        }
    }

    fail(404, 'Bilinmeyen işlem.');
});

if (isset($out['__fail'])) fail($out['__fail'][0], $out['__fail'][1]);

$view = with_state(fn(array &$s) => public_view($s, is_admin($s)), false);
session_write_close();
echo json_encode(array_merge($view, ['msg' => $out['msg'] ?? '']), JSON_UNESCAPED_UNICODE);
