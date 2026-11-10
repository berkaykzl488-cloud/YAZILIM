<?php
/**
 * yangpazar.com kurulum sihirbazı — /kurulum/
 *
 * Adımlar: (kurulum kodu) → ortam denetimi → veritabanı (bağlantı testi) → tablolar → site adı ve adresi →
 *          yönetici hesabı → isteğe bağlı demo → cron komutu + PayTR bildirim adresi → KİLİT.
 * Kurulum bitince storage/kurulum_tamam.php yazılır ve bu sayfa bir daha çalışmaz.
 * Bu dosyada düzenlenecek bir değer yoktur.
 */
require dirname(__DIR__) . '/app/bootstrap.php';

use YP\Db;
use YP\Schema;
use YP\Settings;
use YP\Store;
use YP\Text;
use YP\V;

@ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, max-age=0');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
header_remove('X-Powered-By');

function h($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function kur_page($title, $body, $step = 0, $http = 200)
{
    http_response_code($http);
    header('Content-Type: text/html; charset=utf-8');
    $steps = ['Ortam', 'Veritabanı', 'Tablolar', 'Site', 'Yönetici', 'Bitiş'];
    $nav = '';
    foreach ($steps as $i => $s) {
        $n = $i + 1;
        $nav .= '<li class="' . ($n < $step ? 'ok' : ($n === $step ? 'cur' : '')) . '">' . $n . '. ' . h($s) . '</li>';
    }
    echo '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="robots" content="noindex,nofollow"><title>' . h($title) . ' · yangpazar kurulum</title><style>'
        . ':root{--bg:#f5f6f8;--fg:#1b1f27;--mut:#5d6675;--card:#fff;--bd:#dfe3ea;--pri:#0f6e70;--bad:#b42318;--good:#137333;--warn:#9a6700}'
        . '@media (prefers-color-scheme:dark){:root{--bg:#12151b;--fg:#e8ebf0;--mut:#9aa3b2;--card:#1b1f27;--bd:#2c323d;--pri:#45bde4;--bad:#ff8a80;--good:#7ee2a8;--warn:#f2cc60}}'
        . '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
        . 'main{max-width:760px;margin:0 auto;padding:24px 16px 60px}h1{font-size:22px;margin:8px 0 16px}h2{font-size:17px;margin:20px 0 8px}'
        . '.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:18px;margin:12px 0}'
        . 'ol.steps{display:flex;flex-wrap:wrap;gap:6px;list-style:none;padding:0;margin:0 0 8px;font-size:12.5px}ol.steps li{padding:3px 9px;border-radius:99px;border:1px solid var(--bd);color:var(--mut)}'
        . 'ol.steps li.cur{border-color:var(--pri);color:var(--pri);font-weight:600}ol.steps li.ok{color:var(--good)}'
        . 'label{display:block;font-weight:600;font-size:13.5px;margin:12px 0 4px}input[type=text],input[type=password],input[type=email],input[type=url],input[type=number]{width:100%;padding:10px 12px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit}'
        . '.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:560px){.row{grid-template-columns:1fr}}'
        . 'button{margin-top:16px;padding:10px 18px;border-radius:8px;border:1px solid var(--pri);background:var(--pri);color:#fff;font:inherit;font-weight:600;cursor:pointer}'
        . 'button.sec{background:transparent;color:var(--pri)}.hint{color:var(--mut);font-size:13px;margin:4px 0 0}'
        . '.ok{color:var(--good)}.bad{color:var(--bad)}.warn{color:var(--warn)}.note{border-left:4px solid var(--pri);padding:10px 12px;background:var(--bg);border-radius:6px;margin:10px 0}'
        . '.note.bad{border-color:var(--bad)}.note.good{border-color:var(--good)}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-bottom:1px solid var(--bd);vertical-align:top}'
        . 'code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}pre{white-space:pre-wrap;word-break:break-all;background:var(--bg);border:1px solid var(--bd);border-radius:8px;padding:10px;margin:6px 0}'
        . '</style></head><body><main><ol class="steps">' . $nav . '</ol><h1>' . h($title) . '</h1>' . $body . '</main></body></html>';
    exit;
}

function kur_err($msg)
{
    return '<div class="note bad">' . h($msg) . '</div>';
}

/* ---------------- Kilit ---------------- */

if (Store::installed()) {
    kur_page('Kurulum tamamlanmış', '<div class="card"><p>Bu site zaten kurulu. Güvenlik nedeniyle kurulum sihirbazı kilitlendi ve tekrar çalıştırılamaz.</p>'
        . '<p class="hint">Yeniden kurmanız gerekirse hosting firmanızdan destek alın (storage klasöründeki kurulum dosyalarının silinmesi gerekir).</p>'
        . '<p><a href="../">Siteye git</a></p></div>', 0, $_SERVER['REQUEST_METHOD'] === 'POST' ? 409 : 403);
}

/* ---------------- Oturum ---------------- */

try {
    Store::ensureDirs();
} catch (Throwable $e) {
    // ortam denetiminde gösterilir
}
$sdir = YP_STORAGE . '/sessions';
if (is_dir($sdir) && is_writable($sdir)) {
    session_save_path($sdir);
}
@ini_set('session.use_strict_mode', '1');
@ini_set('session.use_only_cookies', '1');
session_cache_limiter('');
session_name('YPKUR');
session_set_cookie_params(['lifetime' => 0, 'path' => '/kurulum', 'secure' => yp_is_https(), 'httponly' => true, 'samesite' => 'Strict']);
session_start();
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
$S = &$_SESSION;
$csrf = $S['csrf'];
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
$P = $isPost ? $_POST : [];
$test = yp_test_mode();

function hidden_csrf()
{
    return '<input type="hidden" name="csrf" value="' . h($_SESSION['csrf']) . '">';
}

if ($isPost) {
    if (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && strtolower($_SERVER['HTTP_SEC_FETCH_SITE']) === 'cross-site') {
        kur_page('Hata', kur_err('Başka bir siteden gelen istekler kabul edilmez.'), 0, 403);
    }
    if (!empty($_SERVER['HTTP_ORIGIN']) && strtolower(rtrim($_SERVER['HTTP_ORIGIN'], '/')) !== yp_request_origin()) {
        kur_page('Hata', kur_err('Başka bir siteden gelen istekler kabul edilmez.'), 0, 403);
    }
    $given = isset($P['csrf']) && is_string($P['csrf']) ? $P['csrf'] : '';
    if (!hash_equals($csrf, $given)) {
        kur_page('Oturum yenilendi', kur_err('Güvenlik doğrulaması başarısız (sayfa çok uzun süre açık kalmış olabilir). Lütfen tekrar deneyin.')
            . '<p><a href="./">Kuruluma dön</a></p>', 0, 403);
    }
    if (!YP\RateLimit::hit('kurulum_ip:' . yp_client_ip(), 60, 600)['allowed']) {
        kur_page('Biraz bekleyin', kur_err('Çok fazla deneme yapıldı. 10 dakika sonra tekrar deneyin.'), 0, 429);
    }
}
$action = isset($P['action']) && is_string($P['action']) ? $P['action'] : '';

/* ---------------- Kurulum kodu (zip ile gelen tek kullanımlık kod) ---------------- */

$codeFile = YP_STORAGE . '/kurulum_kodu.php';
if (is_file($codeFile) && empty($S['code_ok'])) {
    $err = '';
    if ($action === 'code') {
        $expected = (string)yp_read_php_string($codeFile);
        $given = isset($P['install_code']) && is_string($P['install_code']) ? trim($P['install_code']) : '';
        if ($expected !== '' && $given !== '' && hash_equals($expected, $given)) {
            $S['code_ok'] = 1;
            header('Location: ./', true, 303);
            exit;
        }
        YP\RateLimit::add('kurulum_kod:' . yp_client_ip(), 3600);
        $err = 'Kurulum kodu eşleşmedi.';
    }
    if (!YP\RateLimit::hit('kurulum_kod:' . yp_client_ip(), 10, 3600, false)['allowed']) {
        kur_page('Biraz bekleyin', kur_err('Çok fazla hatalı kod denendi. Bir saat sonra tekrar deneyin.'), 0, 429);
    }
    kur_page('Kurulum kodu', ($err ? kur_err($err) : '') . '<form method="post" class="card">' . hidden_csrf()
        . '<input type="hidden" name="action" value="code"><p>Bu paket tek kullanımlık bir kurulum koduyla korunuyor. Kodu, paketi indirdiğiniz sayfada ya da paketle gelen <code>KURULUM-KODU.txt</code> dosyasında bulabilirsiniz.</p>'
        . '<label for="ic">Kurulum kodu</label><input type="text" id="ic" name="install_code" autocomplete="off" required><button>Devam</button></form>', 1);
}

/* ---------------- Durum ---------------- */

$tokFile = 'kurulum_durum';
$dbCfg = Store::exists('db') && Store::loadKey() ? Store::read('db') : null;
$own = false;
if ($dbCfg) {
    $st = Store::exists($tokFile) ? Store::read($tokFile) : [];
    $own = !empty($S['tok']) && !empty($st['tok']) && hash_equals($st['tok'], hash('sha256', $S['tok']));
    if (!$own) {
        kur_page('Kurulum başka bir tarayıcıda başlatılmış', '<div class="card"><p>Veritabanı bilgileri daha önce başka bir oturumda kaydedilmiş. Güvenlik için kurulum yalnız o tarayıcıdan sürdürülebilir.</p>'
            . '<p class="hint">Kurulumu baştan yapmak için cPanel Dosya Yöneticisi\'nde <code>storage/db.php</code> ve <code>storage/kurulum_durum.php</code> dosyalarını silip bu sayfayı yenileyin.</p></div>', 2, 403);
    }
}
$db = null;
if ($dbCfg) {
    try {
        $db = Db::connect($dbCfg);
        Db::setMain($db);
    } catch (Throwable $e) {
        $db = null;
    }
}
$hasTables = $db && $db->tableExists('users') && $db->tableExists('settings');
$site = $hasTables ? Settings::get('site', $db) : [];
$siteDone = $hasTables && !empty($site['siteUrl']);
$admin = $hasTables ? $db->one("SELECT id, name FROM {users} WHERE role='admin' ORDER BY id LIMIT 1") : null;

/* ---------------- 1. Ortam denetimi ---------------- */

function env_checks($test)
{
    $c = [];
    $c[] = ['PHP sürümü 8.1 veya üstü', version_compare(PHP_VERSION, '8.1.0', '>='), true, 'Şu an: ' . PHP_VERSION . '. cPanel › MultiPHP Manager\'dan PHP 8.1+ seçin.'];
    $c[] = ['pdo_mysql eklentisi (MySQL/MariaDB)', extension_loaded('pdo_mysql'), !$test, 'cPanel › Select PHP Version › Extensions bölümünden pdo_mysql açın.'];
    $c[] = ['Şifreleme (sodium veya openssl)', yp_crypto_mode() !== 'none', true, 'Şu an: ' . yp_crypto_mode() . '. PHP sodium eklentisini açın.'];
    $c[] = ['curl eklentisi (e-posta/SMS/PayTR bağlantıları)', function_exists('curl_init'), true, 'PHP curl eklentisini açın.'];
    $c[] = ['mbstring eklentisi', function_exists('mb_strtolower'), true, 'PHP mbstring eklentisini açın.'];
    $c[] = ['gd eklentisi (görsel küçültme; ilanlar aşamasında gerekli)', extension_loaded('gd'), false, 'PHP gd eklentisini açın.'];
    $c[] = ['zip eklentisi (yedek/güncelleme)', class_exists('ZipArchive'), false, 'PHP zip eklentisini açın.'];
    $c[] = ['storage/ klasörü yazılabilir', is_dir(YP_STORAGE) && is_writable(YP_STORAGE), true, 'Dosya Yöneticisi\'nde storage klasörüne sağ tıklayıp izni 755 yapın.'];
    $up = YP_ROOT . '/uploads';
    if (!is_dir($up)) {
        @mkdir($up, 0755, true);
    }
    if (is_dir($up) && !is_file($up . '/.htaccess')) {
        @file_put_contents($up . '/.htaccess', "# Yüklenen dosyalar asla program olarak çalıştırılmaz.\nOptions -Indexes -ExecCGI\n<FilesMatch \"(?i)\\.(php[0-9]?|phtml|phar|pht|phps|cgi|pl|py|sh|shtml|htaccess)$\">\n  Require all denied\n</FilesMatch>\n<IfModule mod_mime.c>\n  RemoveHandler .php .phtml .phar .php5 .php7 .php8\n  RemoveType .php .phtml .phar\n</IfModule>\n");
    }
    $c[] = ['uploads/ klasörü yazılabilir', is_dir($up) && is_writable($up), false, 'public_html içinde uploads klasörü oluşturup izni 755 yapın.'];
    $c[] = ['Güvenli bağlantı (https)', yp_is_https(), false, 'cPanel › SSL/TLS Status\'tan ücretsiz AutoSSL sertifikasını açın.'];
    return $c;
}

if (empty($S['env_ok']) && !$dbCfg) {
    $checks = env_checks($test);
    $req = true;
    $rows = '';
    foreach ($checks as $ch) {
        list($label, $ok, $required, $hint) = $ch;
        if ($required && !$ok) {
            $req = false;
        }
        $rows .= '<tr><td>' . ($ok ? '<b class="ok">✓</b>' : ($required ? '<b class="bad">✗</b>' : '<b class="warn">!</b>')) . '</td><td>' . h($label)
            . ($ok ? '' : '<div class="hint">' . h($hint) . ($required ? '' : ' (zorunlu değil)') . '</div>') . '</td></tr>';
    }
    if ($action === 'env' && $req) {
        $S['env_ok'] = 1;
        header('Location: ./', true, 303);
        exit;
    }
    $lim = '<tr><td></td><td>Yükleme sınırı: <b>' . h(ini_get('upload_max_filesize')) . '</b> · POST sınırı: <b>' . h(ini_get('post_max_size'))
        . '</b> · Bellek: <b>' . h(ini_get('memory_limit')) . '</b><div class="hint">Teslim videoları için en az 64M önerilir: cPanel › MultiPHP INI Editor › upload_max_filesize ve post_max_size.</div></td></tr>';
    kur_page('Ortam denetimi', '<div class="card"><table>' . $rows . $lim . '</table></div>'
        . ($req ? '<form method="post">' . hidden_csrf() . '<input type="hidden" name="action" value="env"><button>Devam</button></form>'
                : kur_err('Kırmızı işaretli gereksinimler karşılanmadan kuruluma devam edilemez. Düzelttikten sonra sayfayı yenileyin.')), 1);
}

/* ---------------- 2. Veritabanı ---------------- */

function db_form_cfg(array $P, $test)
{
    if ($test && isset($P['driver']) && $P['driver'] === 'sqlite') {
        $path = isset($P['sqlite_path']) && is_string($P['sqlite_path']) ? $P['sqlite_path'] : '';
        return ['driver' => 'sqlite', 'path' => $path, 'prefix' => 'yp_'];
    }
    $g = function ($k, $d = '') use ($P) {
        return isset($P[$k]) && is_string($P[$k]) ? trim($P[$k]) : $d;
    };
    return [
        'driver' => 'mysql', 'host' => $g('host', 'localhost') ?: 'localhost', 'port' => (int)$g('port', '3306') ?: 3306,
        'name' => $g('name'), 'user' => $g('user'), 'pass' => isset($P['pass']) && is_string($P['pass']) ? $P['pass'] : '',
        'prefix' => strtolower($g('prefix', 'yp_')) ?: 'yp_',
    ];
}

if (!$dbCfg) {
    $err = '';
    $info = '';
    $cfg = db_form_cfg($P, $test);
    if ($action === 'dbtest' || $action === 'dbsave') {
        $bad = [];
        if ($cfg['driver'] === 'mysql') {
            if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $cfg['name'])) {
                $bad[] = 'Veritabanı adı geçersiz (cPanel\'deki tam adı yazın, ör. kullanici_yangpazar).';
            }
            if (!preg_match('/^[A-Za-z0-9_.\-@]{1,80}$/', $cfg['user'])) {
                $bad[] = 'Veritabanı kullanıcı adı geçersiz.';
            }
            if (!preg_match('/^[A-Za-z0-9.\-]{1,120}$/', $cfg['host'])) {
                $bad[] = 'Sunucu adı geçersiz (genellikle localhost).';
            }
            if (!preg_match('/^[a-z][a-z0-9_]{0,15}$/', $cfg['prefix'])) {
                $bad[] = 'Tablo öneki yalnız küçük harf, rakam ve _ içerebilir (ör. yp_).';
            }
        } elseif ($cfg['path'] === '' || strpos($cfg['path'], "\0") !== false) {
            $bad[] = 'SQLite dosya yolu gerekli.';
        }
        if ($bad) {
            $err = implode(' ', $bad);
        } else {
            try {
                $t = Db::connect($cfg);
                $si = $t->serverInfo();
                $info = '<div class="note good"><b>Bağlantı başarılı.</b> Sunucu: ' . h($si['version']) . ($si['charset'] ? ' · Karakter seti: ' . h($si['charset']) : '')
                    . ($si['dialect'] === 'mysql' && !$si['skip_locked'] ? '<div class="hint">Not: Bu sürüm SKIP LOCKED desteklemiyor; site yine çalışır (EP satışında kısa kilit kullanılır).</div>' : '') . '</div>';
                if ($t->tableExists('users')) {
                    $err = 'Bu veritabanında "' . $cfg['prefix'] . 'users" tablosu zaten var. Boş bir veritabanı kullanın ya da farklı bir tablo öneki yazın.';
                } elseif ($action === 'dbsave') {
                    Store::createKey();
                    Store::write('db', $cfg);
                    if (!Store::exists('app')) {
                        Store::write('app', ['pepper' => base64_encode(random_bytes(32)), 'cron_key' => bin2hex(random_bytes(24)),
                            'install_id' => bin2hex(random_bytes(16)), 'installed_at' => null]);
                    }
                    $S['tok'] = bin2hex(random_bytes(24));
                    Store::write($tokFile, ['tok' => hash('sha256', $S['tok'])]);
                    header('Location: ./', true, 303);
                    exit;
                }
            } catch (Throwable $e) {
                $m = $e->getMessage();
                if (stripos($m, 'Access denied') !== false) {
                    $err = 'Veritabanı kullanıcı adı veya şifresi hatalı ya da kullanıcı bu veritabanına eklenmemiş (cPanel › MySQL Databases › Add User To Database › ALL PRIVILEGES).';
                } elseif (stripos($m, 'Unknown database') !== false) {
                    $err = 'Bu adla bir veritabanı yok. cPanel\'deki tam adı (önekiyle) yazın.';
                } elseif (stripos($m, 'getaddrinfo') !== false || stripos($m, 'Connection refused') !== false || stripos($m, 'No such file') !== false) {
                    $err = 'Veritabanı sunucusuna bağlanılamadı. Sunucu adını "localhost" olarak deneyin.';
                } else {
                    $err = 'Bağlantı kurulamadı: ' . yp_str($m, 200);
                }
            }
        }
    }
    $v = function ($k, $d = '') use ($cfg) {
        return h(isset($cfg[$k]) && $cfg[$k] !== '' ? $cfg[$k] : $d);
    };
    $testFields = $test ? '<fieldset class="card"><legend>Test ortamı (YP_TEST=1)</legend><label>Sürücü</label><input type="text" name="driver" value="mysql">'
        . '<label>SQLite dosyası</label><input type="text" name="sqlite_path" value=""></fieldset>' : '';
    kur_page('Veritabanı bilgileri', ($err ? kur_err($err) : '') . $info
        . '<form method="post" class="card" autocomplete="off">' . hidden_csrf()
        . '<p class="hint">Bu bilgileri cPanel › <b>MySQL Database Wizard</b> ile veritabanı oluştururken belirlediniz. Şifre sunucuda şifreli olarak saklanır.</p>'
        . '<div class="row"><div><label for="host">Sunucu</label><input type="text" id="host" name="host" value="' . $v('host', 'localhost') . '"></div>'
        . '<div><label for="port">Port</label><input type="number" id="port" name="port" value="' . $v('port', '3306') . '"></div></div>'
        . '<label for="name">Veritabanı adı</label><input type="text" id="name" name="name" value="' . $v('name') . '" placeholder="kullanici_yangpazar">'
        . '<div class="row"><div><label for="user">Kullanıcı adı</label><input type="text" id="user" name="user" value="' . $v('user') . '" placeholder="kullanici_yp"></div>'
        . '<div><label for="pass">Şifre</label><input type="password" id="pass" name="pass" value=""></div></div>'
        . '<label for="prefix">Tablo öneki</label><input type="text" id="prefix" name="prefix" value="' . $v('prefix', 'yp_') . '"><p class="hint">Değiştirmeniz gerekmez.</p>'
        . $testFields
        . '<button name="action" value="dbtest" class="sec">Bağlantıyı test et</button> <button name="action" value="dbsave">Kaydet ve devam et</button></form>', 2);
}

if (!$db) {
    kur_page('Veritabanına bağlanılamıyor', kur_err('Kaydedilen bilgilerle veritabanına bağlanılamadı. Bilgileri yeniden girmek için storage/db.php ve storage/kurulum_durum.php dosyalarını silip sayfayı yenileyin.'), 2, 500);
}

/* ---------------- 3. Tablolar ---------------- */

if (!$hasTables) {
    $err = '';
    if ($action === 'schema') {
        try {
            $done = Schema::install($db);
            $S['schema_log'] = $done;
            header('Location: ./', true, 303);
            exit;
        } catch (Throwable $e) {
            YP\Log::write('hata', 'kurulum şema: ' . $e->getMessage());
            $err = 'Tablolar oluşturulamadı: ' . yp_str($e->getMessage(), 300);
        }
    }
    $list = '';
    foreach (array_keys(Schema::load()) as $t) {
        $list .= '<code>' . h($db->prefix . $t) . '</code> ';
    }
    kur_page('Tabloları oluştur', ($err ? kur_err($err) : '') . '<div class="note good">Veritabanı bağlantısı kaydedildi.</div><form method="post" class="card">' . hidden_csrf()
        . '<p>Şu tablolar oluşturulacak:</p><p>' . $list . '</p><button name="action" value="schema">Tabloları oluştur</button></form>', 3);
}

/* ---------------- 4. Site adı ve adresi ---------------- */

if (!$siteDone) {
    $err = '';
    $name = isset($P['site_name']) ? yp_str($P['site_name'], 60) : 'yangpazar.com';
    $url = isset($P['site_url']) ? yp_str($P['site_url'], 200) : 'https://' . preg_replace('/:\d+$/', '', isset($_SERVER['HTTP_HOST']) ? strtolower($_SERVER['HTTP_HOST']) : 'yangpazar.com');
    if ($action === 'site') {
        $origin = yp_origin_of($url);
        $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
        if ($name === '') {
            $err = 'Site adını yazın.';
        } elseif ($origin === '' || !yp_valid_url($origin . '/')) {
            $err = 'Site adresi geçersiz. Örnek: https://yangpazar.com';
        } elseif ($scheme !== 'https' && !$test) {
            $err = 'Site adresi https:// ile başlamalı (cPanel › SSL/TLS Status ile ücretsiz sertifika açılır).';
        } else {
            $s = Settings::get('site', $db);
            $s['siteName'] = $name;
            $s['siteUrl'] = $origin;
            Settings::set('site', $s, null, $db);
            header('Location: ./', true, 303);
            exit;
        }
    }
    $log = !empty($S['schema_log']) ? '<div class="note good">' . count($S['schema_log']) . ' tablo/işlem tamamlandı.</div>' : '';
    kur_page('Site adı ve adresi', $log . ($err ? kur_err($err) : '') . '<form method="post" class="card">' . hidden_csrf()
        . '<label for="sn">Site adı</label><input type="text" id="sn" name="site_name" value="' . h($name) . '" required>'
        . '<label for="su">Site adresi</label><input type="url" id="su" name="site_url" value="' . h($url) . '" required><p class="hint">Alan adınızın tam adresi, https:// ile.</p>'
        . '<button name="action" value="site">Kaydet ve devam et</button></form>', 4);
}

/* ---------------- 5. Yönetici hesabı ---------------- */

if (!$admin) {
    $err = '';
    $fields = [];
    if ($action === 'admin') {
        $v = new V($P);
        $name = $v->str('name', 3, 20, V::RX_NAME, 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi.');
        $email = $v->email('email');
        $pass = $v->password('password', 10, 'Şifre en az 10 karakter olmalı.');
        if ($pass !== null && (!isset($P['password2']) || $P['password2'] !== $pass)) {
            $v->err('password2', 'Şifreler aynı değil.');
        }
        $fields = $v->errors;
        if (!$fields) {
            $now = yp_now_ms();
            $db->tx(function (Db $db) use ($name, $email, $pass, $now) {
                $id = $db->insert('users', [
                    'name' => $name, 'name_norm' => Text::fold($name), 'email' => $email, 'tel' => '', 'ad' => '', 'soyad' => '',
                    'pass_hash' => password_hash($pass, PASSWORD_DEFAULT), 'role' => 'admin', 'status' => 'active', 'verified' => 1,
                    'joined_at' => $now, 'ref_code' => Text::refCode($name), 'session_ver' => 1, 'created_at' => $now,
                ]);
                $db->insert('wallets', ['user_id' => $id, 'cash' => 0, 'credit' => 0, 'updated_at' => $now]);
                YP\Audit::log($db, $id, 'install_admin', 'user', $id);
            });
            header('Location: ./', true, 303);
            exit;
        }
        $err = 'Lütfen işaretli alanları düzeltin.';
    }
    $fe = function ($k) use ($fields) {
        return isset($fields[$k]) ? '<p class="hint bad">' . h($fields[$k]) . '</p>' : '';
    };
    $pv = function ($k) use ($P) {
        return isset($P[$k]) && is_string($P[$k]) ? h($P[$k]) : '';
    };
    kur_page('Yönetici hesabı', ($err ? kur_err($err) : '') . '<form method="post" class="card" autocomplete="off">' . hidden_csrf()
        . '<p class="hint">Siteye bu kullanıcı adı ve şifreyle "Giriş Yap" düğmesinden girersiniz. Yönetici her yetkiye sahiptir.</p>'
        . '<label for="an">Kullanıcı adı</label><input type="text" id="an" name="name" value="' . $pv('name') . '" required>' . $fe('name')
        . '<label for="ae">E-posta</label><input type="email" id="ae" name="email" value="' . $pv('email') . '" required>' . $fe('email')
        . '<div class="row"><div><label for="ap">Şifre (en az 10 karakter)</label><input type="password" id="ap" name="password" required>' . $fe('password') . '</div>'
        . '<div><label for="ap2">Şifre (tekrar)</label><input type="password" id="ap2" name="password2" required>' . $fe('password2') . '</div></div>'
        . '<p class="hint">2 adımlı doğrulama isteğe bağlıdır: e-posta ayarlarını (Brevo) yaptıktan sonra Hesabım sayfasından açabilirsiniz.</p>'
        . '<button name="action" value="admin">Yöneticiyi oluştur</button></form>', 5);
}

/* ---------------- 6–7. Demo seçeneği, bitiş ve kilit ---------------- */

$siteUrl = rtrim($site['siteUrl'], '/');
if ($action !== 'finish') {
    kur_page('Son adım', '<div class="note good">Yönetici hesabı oluşturuldu: <b>' . h($admin['name']) . '</b></div><form method="post" class="card">' . hidden_csrf()
        . '<label><input type="checkbox" name="demo" value="1"> Demo verileriyle kur</label>'
        . '<p class="hint">Yalnız deneme sitesi (ör. test.yangpazar.com) için. Demo hesap değiştirme açılır; örnek ilan ve üyeler sonraki sürümde eklenecek. Gerçek sitede işaretlemeyin.</p>'
        . '<button name="action" value="finish">Kurulumu bitir</button></form>', 6);
}

Settings::set('demo_mode', !empty($P['demo']) ? 1 : 0, (int)$admin['id'], $db);
$app = Store::app();
$app['installed_at'] = date('c');
Store::write('app', $app);
yp_write_php_string(YP_STORAGE . '/kurulum_tamam.php', base64_encode(json_encode(['t' => date('c'), 'v' => YP_APP_VERSION])));
Store::delete($tokFile);
@unlink($codeFile);
YP\Audit::log($db, (int)$admin['id'], 'install_done', 'system', '', ['demo' => !empty($P['demo'])]);
$S = ['csrf' => bin2hex(random_bytes(32))];

$cronPath = realpath(YP_APP . '/cron.php') ?: (YP_APP . '/cron.php');
$cronCmd = '/usr/local/bin/php ' . $cronPath . ' >/dev/null 2>&1';
$cronUrl = $siteUrl . '/api/v1/cron?key=' . $app['cron_key'];
$paytr = $siteUrl . '/api/paytr_bildirim.php';
kur_page('Kurulum tamamlandı', '<div class="note good"><b>Tebrikler!</b> Site kuruldu ve bu sihirbaz kilitlendi. Bu sayfadaki bilgileri bir yere not edin; sayfa bir daha açılmayacak.</div>'
    . '<div class="card"><h2>1. Cron (zamanlanmış görev)</h2><p>cPanel › <b>Cron Jobs</b> › Common Settings: <b>Once Per Five Minutes (*/5 * * * *)</b> seçin ve Command alanına şunu yapıştırın:</p>'
    . '<pre>' . h($cronCmd) . '</pre><p class="hint">Hostinginiz cron vermiyorsa cron-job.org\'a şu adresi 5 dakikada bir ekleyin (anahtar gizlidir, paylaşmayın):</p><pre>' . h($cronUrl) . '</pre></div>'
    . '<div class="card"><h2>2. PayTR Bildirim URL</h2><p>PayTR Mağaza Paneli › Destek & Kurulum › Ayarlar › <b>Bildirim URL</b> alanına:</p><pre>' . h($paytr) . '</pre></div>'
    . '<div class="card"><h2>3. E-posta (Brevo)</h2><p>Siteye yönetici olarak girin › Yönetim › E-posta & SMS bölümünden Brevo API anahtarınızı ve gönderen adresinizi girin, "Deneme e-postası gönder" ile kontrol edin.</p></div>'
    . '<p><a href="' . h($siteUrl) . '/">Siteye git</a></p>', 7);
