<?php
/**
 * Halı Saha Kadrosu · sunucu tarafı (PHP 7.4+, veritabanı gerekmez)
 *
 * Veriler data/kadro.php dosyasında JSON olarak tutulur. Dosyanın başındaki
 * PHP satırı, dosya tarayıcıdan açılırsa içeriği göstermeden çıkar.
 * Kişi sınırı, kaleciler, otomatik kura ve kadro hareketleri burada yönetilir;
 * tarayıcıdan aşılamaz.
 */

declare(strict_types=1);

const DATA_DIR      = __DIR__ . '/data';
const DATA_FILE     = DATA_DIR . '/kadro.php';
const GUARD         = "<?php http_response_code(404); exit; ?>\n";
const TIMEZONE      = 'Europe/Istanbul';   // maç saati bu saat diliminde yorumlanır
const MIN_CAP       = 2;
const MAX_CAP       = 40;
const MAX_RESERVE   = 20;
const MAX_FEE       = 100000;
const AUTO_DRAW_OPTIONS = [0, 1, 2, 3, 6, 12, 24]; // maça kaç saat kala otomatik kura (0 = kapalı)
const AUTO_DRAW_GRACE   = 3 * 3600;  // maç saatinden bu kadar sonrasına kadar otomatik kura yapılabilir
const LOG_MAX       = 40;
const MAX_ENTRIES   = 80;   // yedekler dahil toplam kayıt üst sınırı
const NAME_MAX      = 30;
const LOGIN_TRIES   = 5;    // bu kadar hatalı denemeden sonra
const LOGIN_LOCK    = 600;  // saniye boyunca giriş kapalı
const SESSION_TTL   = 60 * 60 * 24 * 14; // yönetici oturumu 14 gün

date_default_timezone_set(TIMEZONE);
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
        'settings' => [
            'capacity' => 14,      // toplam kadro (kaleciler ayrıysa onlar dahil)
            'reserve'  => 3,
            'title'    => 'Halı Saha',
            'when'     => '',      // "2026-11-18T21:00" (TIMEZONE)
            'place'    => '',
            'fee'      => 0,       // kişi başı ücret, ₺ (0 = gösterme)
            'keepers'  => true,    // kaleciler yönetici tarafından ayrı atanır
            'gkA'      => '',
            'gkB'      => '',
            'autoDraw' => 2,       // maça kaç saat kala takımlar otomatik kurulur (0 = kapalı)
        ],
        'players'  => [],
        'admin'    => ['user' => '', 'hash' => '', 'version' => 1],
        'logins'   => [],
        'teams'    => null,   // ['a' => [id], 'b' => [id], 'auto' => bool, 'at' => unix]
        'log'      => [],     // [['t' => unix, 'm' => mesaj]], en yeni başta
    ];
}

/** Veri dosyasını kilitleyip açar; $fn durumu değiştirebilir. Dönüş: $fn'in sonucu. */
function with_state(callable $fn)
{
    if (!is_dir(DATA_DIR) && !@mkdir(DATA_DIR, 0750, true)) {
        fail(500, 'Veri klasörü oluşturulamadı. halisaha/data klasörüne yazma izni verin.');
    }
    $fh = @fopen(DATA_FILE, 'c+');
    if (!$fh) fail(500, 'Veri dosyası açılamadı. halisaha/data klasörüne yazma izni verin.');
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $state = default_state();
    if ($raw !== false && $raw !== '') {
        $dec = json_decode(substr($raw, strlen(GUARD)), true);
        if (is_array($dec)) {
            $old = is_array($dec['settings'] ?? null) ? $dec['settings'] : [];
            // Kaleci özelliğinden önceki kurulumlar: kadro sayısı değişmesin diye kapalı başlar.
            if ($old && !array_key_exists('keepers', $old)) $old['keepers'] = false;
            $state['settings'] = array_replace($state['settings'], $old);
            $state['admin']    = array_replace($state['admin'], is_array($dec['admin'] ?? null) ? $dec['admin'] : []);
            foreach (['players', 'logins', 'log'] as $k) {
                if (isset($dec[$k]) && is_array($dec[$k])) $state[$k] = $k === 'logins' ? $dec[$k] : array_values($dec[$k]);
            }
            $t = $dec['teams'] ?? null;
            $state['teams'] = (isset($t['a'], $t['b']) && is_array($t['a']) && is_array($t['b']))
                ? ['a' => array_values($t['a']), 'b' => array_values($t['b']), 'auto' => !empty($t['auto']), 'at' => (int)($t['at'] ?? 0)]
                : null;
        }
    }
    $before = json_encode($state);
    $result = $fn($state);
    if (json_encode($state) !== $before) {
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

function log_add(array &$state, string $msg): void
{
    array_unshift($state['log'], ['t' => time(), 'm' => $msg]);
    $state['log'] = array_slice($state['log'], 0, LOG_MAX);
}

/** Kadrodaki oyuncu yeri sayısı (kaleciler ayrıysa onlar hariç). */
function field_cap(array $state): int
{
    $c = (int)$state['settings']['capacity'];
    return max(1, $c - (!empty($state['settings']['keepers']) ? 2 : 0));
}

/** Kadrodaki (ilk field_cap kişi) oyuncuların id'leri, sırayla. */
function squad_ids(array $state): array
{
    return array_map(fn($p) => $p['id'], array_slice($state['players'], 0, field_cap($state)));
}

/** Maç saatinin unix zamanı; tarih girilmemişse null. */
function kickoff_ts(array $state): ?int
{
    $w = (string)$state['settings']['when'];
    if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $w)) return null;
    $d = DateTime::createFromFormat('Y-m-d\TH:i', $w, new DateTimeZone(TIMEZONE));
    return $d ? $d->getTimestamp() : null;
}

/**
 * Kayıtlı takımları güncel kadroya uydurur: kadrodan çıkanlar düşer,
 * sonradan kadroya girenler (ör. yedekten geçen) sayısı az olan takıma eklenir.
 */
function current_teams(array $state): ?array
{
    if (!$state['teams']) return null;
    $squad = squad_ids($state);
    $in = array_flip($squad);
    $a = array_values(array_filter($state['teams']['a'], fn($id) => isset($in[$id])));
    $inA = array_flip($a);
    $b = array_values(array_filter($state['teams']['b'], fn($id) => isset($in[$id]) && !isset($inA[$id])));
    $seen = array_flip(array_merge($a, $b));
    foreach ($squad as $id) {
        if (isset($seen[$id])) continue;
        if (count($a) <= count($b)) $a[] = $id; else $b[] = $id;
    }
    return ['a' => $a, 'b' => $b, 'auto' => $state['teams']['auto'], 'at' => $state['teams']['at']];
}

/** Kadroyu rastgele iki takıma böler (tek sayıda kişide fazlası A'ya). */
function shuffle_teams(array $state, bool $auto): array
{
    $ids = squad_ids($state);
    for ($i = count($ids) - 1; $i > 0; $i--) {
        $j = random_int(0, $i);
        [$ids[$i], $ids[$j]] = [$ids[$j], $ids[$i]];
    }
    $half = (int)ceil(count($ids) / 2);
    return ['a' => array_slice($ids, 0, $half), 'b' => array_slice($ids, $half), 'auto' => $auto, 'at' => time()];
}

/** Maça "autoDraw" saat kala takımlar henüz kurulmadıysa kurar. Her istekte çağrılır. */
function maybe_auto_draw(array &$state): void
{
    $h = (int)$state['settings']['autoDraw'];
    $ko = kickoff_ts($state);
    if ($h <= 0 || $ko === null || $state['teams']) return;
    $now = time();
    if ($now < $ko - $h * 3600 || $now > $ko + AUTO_DRAW_GRACE) return;
    if (count(squad_ids($state)) < 2) return;
    $state['teams'] = shuffle_teams($state, true);
    log_add($state, "Maça $h saat kala takımlar otomatik kuruldu.");
}

/** Kayıtlı yönetici kullanıcı adı (eski kurulumlarda boşsa "yonetici"). */
function admin_user(array $state): string
{
    return $state['admin']['user'] !== '' ? $state['admin']['user'] : 'yonetici';
}

function clean_username($v): string
{
    $u = is_string($v) ? trim($v) : '';
    if (!preg_match('/^[\p{L}\p{N}._-]{3,30}$/u', $u)) {
        fail(400, 'Kullanıcı adı 3-30 karakter olmalı; harf, rakam, nokta, alt çizgi ve tire kullanılabilir.');
    }
    return $u;
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
    $ko = kickoff_ts($state);
    return [
        'ok'         => true,
        'settings'   => $state['settings'],
        'fieldCap'   => field_cap($state),
        'players'    => $players,
        'admin'      => $admin,
        'needsSetup' => $state['admin']['hash'] === '',
        'teams'      => current_teams($state),
        'log'        => array_slice($state['log'], 0, 15),
        'kickoff'    => $ko !== null ? $ko * 1000 : null,
        'now'        => (int)round(microtime(true) * 1000),
        'user'       => $admin ? admin_user($state) : null,
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

/** $idx'teki oyuncuyu çıkarır; kadrodan çıktıysa yerine geçen yedeğin adını döndürür. */
function remove_at(array &$state, int $idx): string
{
    $cap = field_cap($state);
    $promoted = ($idx < $cap && isset($state['players'][$cap])) ? $state['players'][$cap]['name'] : '';
    array_splice($state['players'], $idx, 1);
    return $promoted;
}

// ---------- istek ----------

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? 'state');
start_session();

if ($method === 'GET') {
    if ($action !== 'state') fail(404, 'Bilinmeyen işlem.');
    $out = with_state(function (array &$s) {
        maybe_auto_draw($s);
        return public_view($s, is_admin($s));
    });
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
    $cap = field_cap($s);
    $reserve = max(0, (int)$s['settings']['reserve']);
    $limit = $cap + $reserve;   // kadro + yedek
    $placeMsg = function () use (&$s, $cap): string {
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
                if (isset($p['token']) && hash_equals($p['token'], $tok)) fail(409, 'Zaten listedesin.');
                if (same_name($p['name'], $name)) fail(409, 'Bu isim listede zaten var. Soyadının ilk harfini ekle.');
            }
            foreach (['gkA', 'gkB'] as $g) {
                if (!empty($s['settings']['keepers']) && $s['settings'][$g] !== '' && same_name($s['settings'][$g], $name)) {
                    fail(409, 'Bu isim kaleci olarak zaten kadroda.');
                }
            }
            if (count($s['players']) >= $limit) {
                fail(409, $reserve > 0 ? 'Kadro ve yedek listesi doldu, son yer başkasına gitti.' : 'Kadro doldu, son yer başkasına gitti.');
            }
            $s['players'][] = ['id' => bin2hex(random_bytes(8)), 'name' => $name, 'token' => $tok, 'manual' => false, 'at' => time()];
            $n = count($s['players']);
            log_add($s, $n <= $cap ? "$name kadroya yazıldı." : "$name " . ($n - $cap) . '. yedek olarak yazıldı.');
            maybe_auto_draw($s);
            return ['msg' => $placeMsg()];
        }

        case 'leave': {
            $tok = player_token_hash();
            $idx = -1;
            foreach ($s['players'] as $i => $p) {
                if ($tok !== '' && isset($p['token']) && hash_equals($p['token'], $tok)) { $idx = $i; break; }
            }
            if ($idx < 0) fail(404, 'Listede kaydın bulunamadı.');
            $name = $s['players'][$idx]['name'];
            $promoted = remove_at($s, $idx);
            if ($idx >= $cap) {
                log_add($s, "$name yedek listesinden çıktı.");
                return ['msg' => 'Yedek listesinden çıktın.'];
            }
            log_add($s, "$name kadrodan çıktı." . ($promoted !== '' ? " Yerine yedekten $promoted geçti." : ''));
            return ['msg' => $promoted !== '' ? "Kadrodan çıktın. Yerine yedekten $promoted geçti." : 'Kadrodan çıktın. Yerin boşaldı.'];
        }

        // ----- yönetici girişi -----
        case 'setup': {
            if ($s['admin']['hash'] !== '') fail(409, 'Yönetici hesabı zaten oluşturulmuş. Giriş yap.');
            $user = clean_username($in['username'] ?? '');
            $pw = (string)($in['password'] ?? '');
            if (mb_strlen($pw) < 8) fail(400, 'Şifre en az 8 karakter olmalı.');
            $s['admin']['user'] = $user;
            $s['admin']['hash'] = password_hash($pw, PASSWORD_DEFAULT);
            $s['admin']['version'] = ($s['admin']['version'] ?? 0) + 1;
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            $_SESSION['admin_v'] = $s['admin']['version'];
            return ['msg' => 'Yönetici hesabı oluşturuldu. Giriş yaptın.'];
        }

        case 'login': {
            if ($s['admin']['hash'] === '') fail(409, 'Önce yönetici hesabı oluşturulmalı.');
            $wait = login_locked($s);
            if ($wait > 0) fail(429, 'Çok fazla hatalı deneme. ' . (int)ceil($wait / 60) . ' dakika sonra tekrar dene.');
            $pw = (string)($in['password'] ?? '');
            $user = is_string($in['username'] ?? null) ? trim($in['username']) : '';
            $userOk = hash_equals(mb_strtolower(admin_user($s), 'UTF-8'), mb_strtolower($user, 'UTF-8'));
            $pwOk = password_verify($pw, $s['admin']['hash']);   // kullanıcı adı yanlış olsa da çalışır (süre farkı olmasın)
            if (!$userOk || !$pwOk) {
                login_failed($s);
                // with_state'in dosyayı kaydetmesi için hata yerine işaret döndür
                return ['__fail' => [401, 'Kullanıcı adı veya şifre yanlış.']];
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
            $keepers = !empty($in['keepers']);
            $min = $keepers ? MIN_CAP + 2 : MIN_CAP;
            $c = (int)($in['capacity'] ?? 0);
            if ($c < $min || $c > MAX_CAP) fail(400, 'Kadro sayısı ' . $min . ' ile ' . MAX_CAP . ' arasında olmalı.');
            $r = (int)($in['reserve'] ?? 3);
            if ($r < 0 || $r > MAX_RESERVE) fail(400, 'Yedek sayısı 0 ile ' . MAX_RESERVE . ' arasında olmalı.');
            $fee = (int)($in['fee'] ?? 0);
            if ($fee < 0 || $fee > MAX_FEE) fail(400, 'Ücret 0 ile ' . MAX_FEE . ' ₺ arasında olmalı.');
            $auto = (int)($in['autoDraw'] ?? 2);
            if (!in_array($auto, AUTO_DRAW_OPTIONS, true)) $auto = 2;
            $when = (string)($in['when'] ?? '');
            if ($when !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $when)) $when = '';
            $gkA = $keepers ? clean_text($in['gkA'] ?? '', NAME_MAX) : '';
            $gkB = $keepers ? clean_text($in['gkB'] ?? '', NAME_MAX) : '';
            if ($gkA !== '' && $gkB !== '' && same_name($gkA, $gkB)) fail(400, 'İki takımın kalecisi aynı kişi olamaz.');
            $s['settings'] = [
                'capacity' => $c,
                'reserve'  => $r,
                'title'    => clean_text($in['title'] ?? '', 40),
                'when'     => $when,
                'place'    => clean_text($in['place'] ?? '', 60),
                'fee'      => $fee,
                'keepers'  => $keepers,
                'gkA'      => $gkA,
                'gkB'      => $gkB,
                'autoDraw' => $auto,
            ];
            $fc = field_cap($s);
            log_add($s, 'Yönetici maç ayarlarını güncelledi: ' . ($keepers ? "2 kaleci + $fc oyuncu" : "$fc oyuncu") . ", $r yedek.");
            maybe_auto_draw($s);
            $over = count($s['players']) - $fc;
            return ['msg' => 'Kaydedildi. Kadro ' . ($keepers ? "2 kaleci + $fc oyuncu" : "$fc oyuncu") . ", $r yedek."
                . ($over > 0 ? " Şu an $over kişi yedekte." : '')];
        }

        case 'swap_gk': {
            if (empty($s['settings']['keepers'])) fail(409, 'Kaleci ataması kapalı.');
            [$s['settings']['gkA'], $s['settings']['gkB']] = [$s['settings']['gkB'], $s['settings']['gkA']];
            log_add($s, 'Kaleciler takım değiştirdi.');
            return ['msg' => 'Kaleciler yer değiştirdi.'];
        }

        case 'add': {
            $name = clean_text($in['name'] ?? '', NAME_MAX);
            if ($name === '') fail(400, 'Eklenecek kişinin adını yaz.');
            foreach ($s['players'] as $p) if (same_name($p['name'], $name)) fail(409, 'Bu isim listede zaten var.');
            if (count($s['players']) >= $limit) fail(409, 'Kadro ve yedek dolu. Önce kişi ya da yedek sayısını artır veya birini çıkar.');
            if (count($s['players']) >= MAX_ENTRIES) fail(409, 'Liste çok uzun.');
            $s['players'][] = ['id' => bin2hex(random_bytes(8)), 'name' => $name, 'token' => '', 'manual' => true, 'at' => time()];
            $n = count($s['players']);
            log_add($s, $n <= $cap ? "Yönetici $name adlı oyuncuyu kadroya ekledi." : "Yönetici $name adlı oyuncuyu " . ($n - $cap) . '. yedek olarak ekledi.');
            maybe_auto_draw($s);
            return ['msg' => "$name listeye eklendi."];
        }

        case 'remove': {
            $id = (string)($in['id'] ?? '');
            $idx = -1;
            foreach ($s['players'] as $i => $p) if ($p['id'] === $id) { $idx = $i; break; }
            if ($idx < 0) fail(404, 'Oyuncu bulunamadı.');
            $name = $s['players'][$idx]['name'];
            $promoted = remove_at($s, $idx);
            log_add($s, "Yönetici $name adlı oyuncuyu listeden çıkardı." . ($promoted !== '' ? " Yerine yedekten $promoted geçti." : ''));
            return ['msg' => 'Oyuncu listeden çıkarıldı.' . ($promoted !== '' ? " Yerine yedekten $promoted geçti." : '')];
        }

        case 'teams': {
            if (count(squad_ids($s)) < 2) fail(409, 'Takım kurmak için kadroda en az 2 oyuncu olmalı.');
            $had = (bool)$s['teams'];
            $s['teams'] = shuffle_teams($s, false);
            log_add($s, $had ? 'Yönetici takımları yeniden karıştırdı.' : 'Yönetici takımları kurdu.');
            return ['msg' => $had ? 'Takımlar yeniden karıştırıldı.' : 'Takımlar kuruldu.'];
        }

        case 'teams_reset': {
            $s['teams'] = null;
            log_add($s, 'Yönetici takımları kaldırdı.');
            return ['msg' => 'Takımlar kaldırıldı.' . ((int)$s['settings']['autoDraw'] > 0 ? ' Otomatik kura zamanı geldiyse yeniden kurulur.' : '')];
        }

        case 'move': {
            $t = current_teams($s);
            if (!$t) fail(409, 'Önce takımları kur.');
            $id = (string)($in['id'] ?? '');
            if (($k = array_search($id, $t['a'], true)) !== false) {
                array_splice($t['a'], $k, 1); $t['b'][] = $id;
            } elseif (($k = array_search($id, $t['b'], true)) !== false) {
                array_splice($t['b'], $k, 1); $t['a'][] = $id;
            } else fail(404, 'Oyuncu kadroda değil.');
            $s['teams'] = $t;
            return ['msg' => 'Oyuncu diğer takıma geçti. ' . count($t['a']) . ' - ' . count($t['b'])];
        }

        case 'clear': {
            $s['teams'] = null;
            $s['players'] = [];
            $s['log'] = [];
            log_add($s, 'Yeni hafta: liste temizlendi.');
            return ['msg' => 'Liste temizlendi. Yeni maçın tarihini girmeyi unutma.'];
        }

        case 'account': {
            if (!password_verify((string)($in['current'] ?? ''), $s['admin']['hash'])) fail(401, 'Mevcut şifre yanlış.');
            $user = clean_username($in['username'] ?? '');
            $pw = (string)($in['password'] ?? '');
            if ($pw !== '' && mb_strlen($pw) < 8) fail(400, 'Yeni şifre en az 8 karakter olmalı.');
            $changed = [];
            if ($user !== admin_user($s)) { $s['admin']['user'] = $user; $changed[] = 'kullanıcı adı'; }
            if ($pw !== '') {
                $s['admin']['hash'] = password_hash($pw, PASSWORD_DEFAULT);
                $s['admin']['version']++;          // diğer cihazlardaki oturumlar kapanır
                $_SESSION['admin_v'] = $s['admin']['version'];
                $changed[] = 'şifre';
            }
            if (!$changed) return ['msg' => 'Değişiklik yok.'];
            $what = count($changed) === 2 ? 'Kullanıcı adı ve şifre' : ($changed[0] === 'şifre' ? 'Şifre' : 'Kullanıcı adı');
            return ['msg' => $what . ' güncellendi.' . ($pw !== '' ? ' Diğer cihazlardaki oturumlar kapandı.' : '')];
        }
    }

    fail(404, 'Bilinmeyen işlem.');
});

if (isset($out['__fail'])) fail($out['__fail'][0], $out['__fail'][1]);

$view = with_state(fn(array &$s) => public_view($s, is_admin($s)));
session_write_close();
echo json_encode(array_merge($view, ['msg' => $out['msg'] ?? '']), JSON_UNESCAPED_UNICODE);
