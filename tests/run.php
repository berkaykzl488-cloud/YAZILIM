<?php
/**
 * P0b + P1 birim testleri (PHPUnit gerekmez). SQLite bellek içi veritabanı + geçici storage klasörü.
 * Çalıştırma:  php tests/run.php            (hepsi)
 *              php tests/run.php smtp outbox  (yalnız adı eşleşen bölümler)
 */
if (PHP_SAPI !== 'cli') {
    exit;
}
error_reporting(E_ALL);
ini_set('display_errors', '1');

$TMP = sys_get_temp_dir() . '/yp-unit-' . getmypid() . '-' . bin2hex(random_bytes(3));
mkdir($TMP . '/storage', 0700, true);
mkdir($TMP . '/public', 0755, true);
define('YP_STORAGE', $TMP . '/storage');
define('YP_PUBLIC', $TMP . '/public'); // uploads/, sitemap.xml, robots.txt (deponun köküne yazılmasın)
require dirname(__DIR__) . '/app/bootstrap.php';
register_shutdown_function(function () use ($TMP) {
    exec('rm -rf ' . escapeshellarg($TMP));
});
set_error_handler(function ($no, $str, $file, $line) {
    if (!(error_reporting() & $no)) {
        return false;
    }
    throw new ErrorException($str, 0, $no, $file, $line);
});

use YP\Audit;
use YP\Auth;
use YP\Cron;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Router;
use YP\Idem;
use YP\Mail\Brevo;
use YP\Mail\Mailjet;
use YP\Mail\Mime;
use YP\Mail\PhpMail;
use YP\Mail\Smtp;
use YP\Mailer;
use YP\Notify;
use YP\Outbox;
use YP\Perm;
use YP\PermMap;
use YP\RateLimit;
use YP\Schema;
use YP\Settings;
use YP\Sms\NetGsm;
use YP\Sms\Sms;
use YP\Store;
use YP\Text;
use YP\Tfa;
use YP\V;

$PASS = 0;
$FAIL = 0;
$ONLY = array_slice($argv, 1);
$CUR = '';
function ok($name, $cond, $info = '')
{
    global $PASS, $FAIL, $CUR;
    if ($cond) {
        $PASS++;
        echo "PASS  [$CUR] $name\n";
    } else {
        $FAIL++;
        echo "FAIL  [$CUR] $name" . ($info !== '' ? "\n      → " . (is_string($info) ? $info : json_encode($info, JSON_UNESCAPED_UNICODE)) : '') . "\n";
    }
}
/** $fn hata fırlatmalı; dönüş: yakalanan istisna ya da null */
function throws(callable $fn)
{
    try {
        $fn();
    } catch (Throwable $e) {
        return $e;
    }
    return null;
}
function section($name, callable $fn)
{
    global $ONLY, $CUR, $FAIL;
    if ($ONLY && !array_filter($ONLY, function ($o) use ($name) {
        return stripos($name, $o) !== false;
    })) {
        return;
    }
    $CUR = $name;
    try {
        $fn();
    } catch (Throwable $e) {
        $FAIL++;
        echo "FAIL  [$name] beklenmeyen istisna: " . get_class($e) . ': ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine() . "\n";
    }
}
/** Taze bellek içi veritabanı + şema */
function freshDb()
{
    $db = Db::connect(['driver' => 'sqlite', 'path' => ':memory:']);
    Db::setMain($db);
    Settings::clearCache();
    Schema::install($db);
    return $db;
}
function mkUser(Db $db, $name, array $x = [])
{
    $now = yp_now_ms();
    $id = $db->insert('users', array_merge([
        'name' => $name, 'name_norm' => Text::fold($name), 'email' => strtolower($name) . '@ornek.com', 'tel' => '0555 111 22 33',
        'ad' => 'Ali', 'soyad' => 'Veli', 'pass_hash' => password_hash('Gizli-Sifre-123', PASSWORD_DEFAULT), 'role' => 'member',
        'joined_at' => $now, 'created_at' => $now, 'ref_code' => Text::refCode($name),
    ], $x));
    $db->insert('wallets', ['user_id' => $id, 'cash' => 0, 'credit' => 0]);
    return $db->one('SELECT * FROM {users} WHERE id=?', [$id]);
}
/** Sahte taşıyıcı: gönderilenleri toplar */
class FakeMail implements YP\Mail\Transport
{
    public $sent = [];
    public $fail = false;
    public $retry = true;

    public function name()
    {
        return 'fake';
    }

    public function send(array $m)
    {
        if ($this->fail) {
            return ['ok' => false, 'id' => null, 'error' => 'sahte hata', 'retry' => $this->retry];
        }
        $this->sent[] = $m;
        return ['ok' => true, 'id' => 'F' . count($this->sent), 'error' => '', 'retry' => false];
    }
}
class FakeSms implements YP\Sms\Provider
{
    public $sent = [];

    public function name()
    {
        return 'fakesms';
    }

    public function send($to, $text)
    {
        $this->sent[] = [$to, $text];
        return ['ok' => true, 'id' => 'S' . count($this->sent), 'error' => '', 'retry' => false];
    }
}
/** Sahte HTTP: istekleri kaydeder, sırayla hazır yanıt döndürür */
function fakeHttp(array &$calls, array $responses)
{
    return function ($method, $url, array $o) use (&$calls, &$responses) {
        $calls[] = ['method' => $method, 'url' => $url, 'o' => $o];
        $r = array_shift($responses) ?: [200, '{}'];
        return ['ok' => $r[0] >= 200 && $r[0] < 300, 'code' => $r[0], 'body' => $r[1], 'json' => json_decode($r[1], true), 'error' => isset($r[2]) ? $r[2] : ''];
    };
}

// Depo: anahtar + uygulama sırları
Store::ensureDirs();
Store::createKey();
Store::write('app', ['pepper' => base64_encode(random_bytes(32)), 'cron_key' => bin2hex(random_bytes(24)), 'install_id' => 'test']);

/* ====================================================================== */

section('db', function () {
    $db = freshDb();
    ok('lehçe sqlite, sürüm okundu', $db->dialect === 'sqlite' && preg_match('/^3\./', $db->version));
    ok('{tablo} → `yp_tablo`', $db->sql('SELECT * FROM {users} u JOIN {wallets} w') === 'SELECT * FROM `yp_users` u JOIN `yp_wallets` w');
    $u = mkUser($db, 'KurtPazar');
    ok('insert + one', $u && $u['name'] === 'KurtPazar' && (int)$u['session_ver'] === 1 && $u['role'] === 'member');
    ok('val', (int)$db->val('SELECT COUNT(*) FROM {users}') === 1);
    ok('update rowCount', $db->update('users', ['verified' => 1], 'id=?', [$u['id']]) === 1);
    $db->upsert('settings', ['k' => 'x', 'v' => '1', 'secret' => 0, 'updated_at' => 1], ['k']);
    $db->upsert('settings', ['k' => 'x', 'v' => '2', 'secret' => 0, 'updated_at' => 2], ['k']);
    ok('upsert (ON CONFLICT) günceller', $db->val("SELECT v FROM {settings} WHERE k='x'") === '2' && (int)$db->val("SELECT COUNT(*) FROM {settings} WHERE k='x'") === 1);
    ok('insertIgnore: ilk true, ikinci false', $db->insertIgnore('cron_runs', ['task' => 't1']) === true && $db->insertIgnore('cron_runs', ['task' => 't1']) === false);
    $e = throws(function () use ($db) {
        $db->insert('users', ['name' => 'kurtpazar', 'name_norm' => 'kurtpazar', 'pass_hash' => 'x', 'joined_at' => 1, 'created_at' => 1]);
    });
    ok('benzersiz ihlali isDuplicate', $e instanceof PDOException && $db->isDuplicate($e));
    ok('geçersiz sütun adı reddedilir', throws(function () use ($db) {
        $db->insert('users', ['name; DROP' => 1]);
    }) instanceof RuntimeException);
    ok('forUpdate/skipLocked sqlite\'ta boş', $db->forUpdate() === '' && $db->skipLocked() === '');
    // işlemler
    $db->tx(function (Db $d) use ($u) {
        $d->update('users', ['pts' => 5], 'id=?', [$u['id']]);
    });
    ok('tx commit', (int)$db->val('SELECT pts FROM {users} WHERE id=?', [$u['id']]) === 5);
    throws(function () use ($db, $u) {
        $db->tx(function (Db $d) use ($u) {
            $d->update('users', ['pts' => 99], 'id=?', [$u['id']]);
            throw new RuntimeException('geri al');
        });
    });
    ok('tx rollback', (int)$db->val('SELECT pts FROM {users} WHERE id=?', [$u['id']]) === 5);
    $db->tx(function (Db $d) use ($u) {
        $d->tx(function (Db $d2) use ($u) {
            $d2->update('users', ['pts' => 7], 'id=?', [$u['id']]);
        });
        ok('iç içe tx dıştakine katılır', $d->inTx());
    });
    ok('iç içe tx commit', (int)$db->val('SELECT pts FROM {users} WHERE id=?', [$u['id']]) === 7);
    $n = 0;
    $db->tx(function () use (&$n) {
        if (++$n === 1) {
            $e = new PDOException('database is locked');
            $e->errorInfo = ['HY000', 5, 'database is locked'];
            throw $e;
        }
    });
    ok('kilitlenmede (BUSY) yeniden dener', $n === 2);
    $n = 0;
    $e = throws(function () use ($db, &$n) {
        $db->tx(function () use (&$n) {
            $n++;
            $e = new PDOException('x');
            $e->errorInfo = ['HY000', 5, 'x'];
            throw $e;
        });
    });
    ok('en fazla 3 deneme', $n === 3 && $e instanceof PDOException);

    // MySQL lehçesi (bağlantısız): yapılandırıcı atlanarak SQL üretimi denetlenir
    $my = (new ReflectionClass(Db::class))->newInstanceWithoutConstructor();
    $my->dialect = 'mysql';
    $my->prefix = 'yp_';
    $my->version = '10.6.18-MariaDB-cll-lve';
    ok('MariaDB 10.6 → SKIP LOCKED', $my->supportsSkipLocked() && $my->skipLocked() === ' FOR UPDATE SKIP LOCKED' && $my->forUpdate() === ' FOR UPDATE');
    $my->version = '10.3.39-MariaDB';
    ok('MariaDB 10.3 → yalnız FOR UPDATE', !$my->supportsSkipLocked() && $my->skipLocked() === ' FOR UPDATE');
    $my->version = '8.0.36';
    ok('MySQL 8 → SKIP LOCKED', $my->supportsSkipLocked());
    $my->version = '5.7.44-log';
    ok('MySQL 5.7 → yok', !$my->supportsSkipLocked());
    $e1 = new PDOException('Deadlock');
    $e1->errorInfo = ['40001', 1213, 'Deadlock found'];
    $e2 = new PDOException('Lock wait');
    $e2->errorInfo = ['HY000', 1205, 'Lock wait timeout'];
    $e3 = new PDOException('Dup');
    $e3->errorInfo = ['23000', 1062, 'Duplicate entry'];
    ok('MySQL 1213/1205 yeniden denenebilir, 1062 çift kayıt', $my->isRetryable($e1) && $my->isRetryable($e2) && !$my->isRetryable($e3) && $my->isDuplicate($e3));
});

section('schema', function () {
    $sq = Schema::ddl('sqlite');
    $my = Schema::ddl('mysql');
    $all = implode("\n", $my);
    ok('MySQL DDL: tüm tablolar', count(array_filter($my, function ($s) {
        return strpos($s, 'CREATE TABLE') === 0;
    })) === count(Schema::load()));
    ok('MySQL DDL: InnoDB utf8mb4', substr_count($all, 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci') === count(Schema::load()));
    $noUtf = [];
    foreach (Schema::load() as $t => $def) {
        $c = Schema::tableDdl('mysql', 'yp_', $t, $def)[0];
        if (substr($c, -strlen(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci')) !== ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' || stripos($c, 'latin1') !== false) {
            $noUtf[] = $t;
        }
    }
    ok('MySQL DDL: HER tablo utf8mb4_unicode_ci (sunucu varsayılanı latin1 olsa bile)', !$noUtf, $noUtf);
    ok('MySQL bağlantısı: DSN charset=utf8mb4 + SET NAMES utf8mb4', strpos(file_get_contents(YP_APP . '/src/Db.php'), ';charset=utf8mb4') !== false
        && strpos(file_get_contents(YP_APP . '/src/Db.php'), "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci") !== false);
    ok('MariaDB 10.11.19 → SKIP LOCKED', (function () {
        $my = (new ReflectionClass(Db::class))->newInstanceWithoutConstructor();
        $my->dialect = 'mysql';
        $my->version = '10.11.19-MariaDB';
        return $my->supportsSkipLocked();
    })());
    ok('MySQL DDL: AUTO_INCREMENT pk', strpos($all, '`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY') !== false);
    ok('MySQL DDL: ENUM + varsayılan', strpos($all, "`role` ENUM('member','staff','admin') NOT NULL DEFAULT 'member'") !== false
        && strpos($all, "`tfa` ENUM('','sms','mail') NOT NULL DEFAULT ''") !== false);
    ok('MySQL DDL: benzersiz + FK', strpos($all, 'UNIQUE KEY `yp_users__uq_name_norm` (`name_norm`)') !== false
        && strpos($all, 'FOREIGN KEY (`user_id`) REFERENCES `yp_users` (`id`) ON DELETE CASCADE') !== false);
    ok('MySQL DDL: bileşik PK', strpos($all, 'PRIMARY KEY (`user_id`,`ikey`)') !== false);
    ok('MySQL DDL: DECIMAL, MEDIUMTEXT, CHAR', strpos($all, 'DECIMAL(4,2)') !== false && strpos($all, 'MEDIUMTEXT') !== false && strpos($all, 'CHAR(64)') !== false);
    $long = [];
    foreach (Schema::load() as $t => $def) {
        foreach (array_merge(isset($def['unique']) ? $def['unique'] : [], isset($def['index']) ? $def['index'] : [], isset($def['pk']) ? [$def['pk']] : []) as $cols) {
            foreach ($cols as $c) {
                $p = Schema::parseCol($def['cols'][$c]);
                if (in_array($p['type'], ['str', 'char'], true) && (int)$p['args'][0] > 190) {
                    $long[] = "$t.$c";
                }
                if (in_array($p['type'], ['text', 'mediumtext'], true)) {
                    $long[] = "$t.$c (TEXT)";
                }
            }
        }
    }
    ok('MySQL: dizinlenen metin sütunları ≤ 190 karakter', !$long, $long);
    ok('SQLite DDL: CHECK ile enum', strpos(implode("\n", $sq), "CHECK (`role` IN ('member','staff','admin'))") !== false);
    ok('SQLite DDL: ayrı CREATE INDEX', count(array_filter($sq, function ($s) {
        return strpos($s, 'CREATE UNIQUE INDEX') === 0;
    })) >= 4);
    $db = freshDb();
    ok('SQLite: tüm tablolar oluştu', count(array_filter(array_keys(Schema::load()), [$db, 'tableExists'])) === count(Schema::load()));
    ok('enum CHECK çalışır', throws(function () use ($db) {
        $db->insert('users', ['name' => 'a', 'name_norm' => 'a', 'pass_hash' => 'x', 'role' => 'tanri', 'joined_at' => 1, 'created_at' => 1]);
    }) instanceof PDOException);
    ok('ikinci kurulum boş (idempotent)', Schema::install($db) === []);
    $mig = $db->all('SELECT version FROM {schema_migrations}');
    ok('schema_migrations kayıtları', count($mig) >= 2 && in_array('m:0001_default_settings', array_column($mig, 'version'), true));
    // şema değişikliği: yeni sütun + dizin eklenir
    $s = Schema::load();
    $s['users']['cols']['yeni_alan'] = 'str:20=';
    $s['users']['index'][] = ['yeni_alan'];
    $done = Schema::sync($db, $s);
    ok('sync: eksik sütun ve dizin eklendi', in_array('yeni_alan', $db->columns('users'), true) && count($done) === 2, $done);
    $s['users']['cols']['zorunlu'] = 'int';
    ok('sync: NOT NULL ve varsayılansız sütun reddedilir', throws(function () use ($db, $s) {
        Schema::sync($db, $s);
    }) instanceof RuntimeException);
    ok('bilinmeyen tür reddedilir', throws(function () {
        Schema::colDdl('mysql', 'x', 'json');
    }) instanceof RuntimeException);
    ok('enum değerinde tırnak reddedilir', throws(function () {
        Schema::colDdl('mysql', 'x', "enum:a,b'c");
    }) instanceof RuntimeException);
    ok('varsayılan site ayarları yazıldı', Settings::get('site', $db)['siteName'] === 'yangpazar.com');
});

section('text', function () {
    ok('fold: KURTPAZAR', Text::fold('KurtPAZAR') === 'kurtpazar');
    ok('fold: Işık / ISIK / işık aynı', Text::fold('Işık') === 'isik' && Text::fold('ISIK') === 'isik' && Text::fold('İŞIK') === 'isik');
    ok('fold: ÇĞÖŞÜ', Text::fold('ÇağrıÖzŞÜ') === 'cagriozsu');
    ok('maskTel', Text::maskTel('0555 111 22 33') === '0••• ••• 22 33');
    ok('maskMail', Text::maskMail('deniz@ornek.com') === 'de•••@ornek.com');
    ok('maskIban', Text::maskIban('TR33 0006 1005 1978 6457 8413 26') === 'TR33••••••1326');
    ok('formatTel', Text::formatTel('5551112233') === '0555 111 22 33');
    ok('refCode (ön yüzle aynı)', Text::refCode('YangUstası') === 'YANGUSTAS26' && Text::refCode('çğ') === 'UYE26');
    ok('monthYear', Text::monthYear(strtotime('2021-04-15 12:00:00 UTC') * 1000) === 'Nisan 2021');
    ok('likeEscape', Text::likeEscape('a%b_c!') === 'a!%b!_c!!');
});

section('validation', function () {
    $v = new V(['name' => 'ab', 'email' => 'x@y', 'tel' => '05551112233', 'password' => 'kisa', 'ad' => 'Ali1']);
    $v->str('name', 3, 20, V::RX_NAME, 'ad hatası');
    $v->email('email');
    $tel = $v->tel('tel');
    $v->password('password', 8);
    $v->str('ad', 2, 40, V::RX_PERSON, 'kişi');
    ok('tel biçimlendi', $tel === '0555 111 22 33');
    ok('hatalar toplandı', array_keys($v->errors) === ['name', 'email', 'password', 'ad'], $v->errors);
    $e = throws(function () use ($v) {
        $v->done();
    });
    ok('done → 422 fields', $e instanceof HttpError && $e->http === 422 && isset($e->body()['fields']['email']));
    $v2 = new V(['name' => 'Kurt_Pazar', 'email' => 'Ali@Ornek.COM', 'tel' => '+90 555 111 22 33']);
    ok('geçerli değerler', $v2->str('name', 3, 20, V::RX_NAME) === 'Kurt_Pazar' && $v2->email('email') === 'ali@ornek.com' && $v2->tel('tel') === '0555 111 22 33' && !$v2->errors);
    $v3 = new V(['name' => "a\x00b<script>"]);
    ok('kontrol karakteri temizlenir, desen reddeder', $v3->str('name', 3, 20, V::RX_NAME) === null);
});

section('perm', function () {
    $admin = ['role' => 'admin', 'perms' => null];
    $staff = ['role' => 'staff', 'perms' => json_encode(['uye', 'calisan', 'bogus'])];
    $member = ['role' => 'member', 'perms' => json_encode(['uye'])];
    ok('PERMS anahtarları ön yüzle aynı (23)', count(Perm::keys()) === 23 && Perm::keys()[0] === 'panel' && in_array('bakim', Perm::keys(), true));
    ok('admin her yetki', Perm::has($admin, 'cekim') && count(Perm::of($admin)) === 23);
    ok('çalışan: sahip olduğu', Perm::has($staff, 'uye') && !Perm::has($staff, 'cekim'));
    ok('bilinmeyen yetki atılır', Perm::of($staff) === ['uye', 'calisan']);
    ok('üye hiçbir yetkiye sahip değil', !Perm::has($member, 'uye') && Perm::of($member) === []);
    ok('dizi = herhangi biri', Perm::has($staff, ['cekim', 'uye']) && !Perm::has($staff, ['cekim', 'muhasebe']));
    ok('ui:act:u-ban → uye', Perm::resolve('ui:act:u-ban') === 'uye' && Perm::has($staff, 'ui:act:u-ban'));
    ok('ui:form:staffadd → calisan', Perm::resolve('ui:form:staffadd') === 'calisan');
    ok('ui:act:tc-ask → [cekim, muhasebe]', Perm::resolve('ui:act:tc-ask') === ['cekim', 'muhasebe'] && !Perm::has($staff, 'ui:act:tc-ask'));
    ok('tabloda olmayan ui anahtarı hata', throws(function () {
        Perm::resolve('ui:act:yok-boyle');
    }) instanceof RuntimeException);
    ok('admin istediğini verir', Perm::grant($admin, [], ['cekim', 'uye']) === ['cekim', 'uye']);
    $e = throws(function () use ($staff) {
        Perm::grant($staff, [], ['uye', 'cekim']);
    });
    ok('çalışan sahip olmadığı yetkiyi veremez (403 perm_grant)', $e instanceof HttpError && $e->http === 403 && $e->errCode === 'perm_grant' && $e->extra['perms'] === ['cekim']);
    ok('çalışan: sahip olmadığı mevcut yetki korunur, kendi yetkisini kaldırabilir',
        Perm::grant($staff, ['uye', 'cekim'], ['cekim']) === ['cekim']);
    ok('çalışan: mevcut yetkiyi korurken kendi yetkisini ekler', Perm::grant($staff, ['cekim'], ['cekim', 'uye', 'calisan']) === ['cekim', 'uye', 'calisan']);
    ok('çalışan: listede olmayan sahip olmadığı yetki silinmez', Perm::grant($staff, ['cekim', 'uye'], []) === ['cekim']);
    $e = throws(function () use ($admin) {
        Perm::grant($admin, [], ['root']);
    });
    ok('bilinmeyen yetki → 422', $e instanceof HttpError && $e->http === 422);
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(dirname(__DIR__) . '/tools/gen-permmap.php') . ' --check 2>&1', $o, $rc);
    ok('PermMap src/js ile güncel (gen-permmap --check)', $rc === 0, implode(' ', $o));
    ok('PermMap: ADM_ACT/FORM/CHG dolu', count(PermMap::ACT) > 80 && count(PermMap::FORM) > 50 && count(PermMap::CHG) >= 10);
});

section('routes', function () {
    $db = freshDb();
    $r = Router::loadDir();
    $routes = $r->all();
    $admin = array_filter($routes, function ($x) {
        return strpos($x['pattern'], 'admin/') === 0;
    });
    ok('tüm admin rotaları staff + yetki ile korunuyor', count($admin) > 10 && !array_filter($admin, function ($x) {
        return $x['opt']['auth'] !== 'staff' || $x['opt']['perm'] === null;
    }));
    $bad = [];
    foreach ($admin as $x) {
        try {
            if ($x['opt']['perm'] !== 'staff') {
                foreach ((array)Perm::resolve($x['opt']['perm']) as $p) {
                    if (!isset(PermMap::PERMS[$p])) {
                        $bad[] = $x['pattern'];
                    }
                }
            }
        } catch (Throwable $e) {
            $bad[] = $x['pattern'];
        }
    }
    ok('rota yetkileri PERMS içinde', !$bad, $bad);
    ok('GET dışı rotalarda CSRF açık', !array_filter($routes, function ($x) {
        return $x['method'] !== 'GET' && !$x['opt']['csrf'];
    }));
    list($m, $p) = $r->match('PUT', 'admin/staff/u12');
    ok('eşleme + parametre', $m && $p['id'] === 'u12');
    list($m, , $allowed) = $r->match('GET', 'auth/login');
    ok('yanlış yöntem → izinli yöntemler', $m === null && $allowed === ['POST']);
    ok('test rotası YP_TEST yokken yüklenmez', !$r->match('GET', '_test/outbox')[0]);
});

section('auth', function () {
    $db = freshDb();
    $u = mkUser($db, 'Işıklı');
    ok('kullanıcı adı TR katlamalı ve büyük/küçük harf duyarsız', Auth::verifyCredentials($db, 'ISIKLI', 'Gizli-Sifre-123')['id'] === $u['id']);
    mkUser($db, 'Deniz', ['email' => 'deniz@ornek.com']);
    ok('e-posta ile giriş (büyük harf)', Auth::verifyCredentials($db, 'DENIZ@Ornek.com', 'Gizli-Sifre-123')['name'] === 'Deniz');
    ok('yanlış şifre → null', Auth::verifyCredentials($db, 'Işıklı', 'yanlis') === null);
    ok('olmayan kullanıcı → null', Auth::verifyCredentials($db, 'yokboyle', 'Gizli-Sifre-123') === null);
    ok('boş/çok uzun şifre → null', Auth::verifyCredentials($db, 'Işıklı', '') === null && Auth::verifyCredentials($db, 'Işıklı', str_repeat('a', 201)) === null);
    $t0 = microtime(true);
    Auth::verifyCredentials($db, 'yokboyle', 'x');
    $dt = microtime(true) - $t0;
    ok('olmayan kullanıcıda da hash doğrulaması yapılır (zamanlama)', $dt > 0.01, round($dt, 4));
    $now = time();
    $s = ['uid' => $u['id'], 'sv' => 1, 't' => $now - 100, 'rem' => 0];
    ok('oturum geçerli', Auth::sessionValid($u, $s, $now));
    ok('session_ver farklı → geçersiz', !Auth::sessionValid($u, ['sv' => 2] + $s, $now));
    ok('yasaklı → geçersiz', !Auth::sessionValid(['status' => 'banned'] + $u, $s, $now));
    ok('üye: 12 saat hareketsizlik', Auth::sessionValid($u, ['t' => $now - 43000] + $s, $now) && !Auth::sessionValid($u, ['t' => $now - 43300] + $s, $now));
    ok('üye + beni hatırla: 30 gün', Auth::sessionValid($u, ['t' => $now - 20 * 86400, 'rem' => 1] + $s, $now));
    $st = ['role' => 'staff'] + $u;
    ok('çalışan: 2 saat (beni hatırla geçmez)', !Auth::sessionValid($st, ['t' => $now - 7300, 'rem' => 1] + $s, $now) && Auth::sessionValid($st, ['t' => $now - 7000] + $s, $now));
    ok('başka uid → geçersiz', !Auth::sessionValid($u, ['uid' => $u['id'] + 1] + $s, $now));
    ok('bumpSessionVer', Auth::bumpSessionVer($db, $u['id']) === 2);
    Auth::reset();
    $e = throws(function () {
        Auth::requireUser();
    });
    ok('oturumsuz → 401', $e instanceof HttpError && $e->http === 401);
    Auth::$user = $u;
    $e = throws(function () {
        Auth::requireStaff('uye');
    });
    ok('üye yönetime → 403', $e instanceof HttpError && $e->http === 403);
    Auth::$user = ['role' => 'staff', 'perms' => '["ara"]'] + $u;
    ok('çalışan yetkisiz rota → 403', throws(function () {
        Auth::requireStaff('uye');
    }) instanceof HttpError && Auth::requireStaff('ara'));
    Auth::reset();
});

section('tfa', function () {
    $db = freshDb();
    $fake = new FakeMail();
    Mailer::$factory = function () use ($fake) {
        return new Mailer($fake, null, 'noreply@yangpazar.com', 'yangpazar');
    };
    $u = mkUser($db, 'Deniz_TR');
    $t = Tfa::start($db, $u, 'enable', 'mail');
    ok('bilgi: kanal, maskeli adres, bekleme', $t['ch'] === 'mail' && $t['dest'] === 'de•••@ornek.com' && $t['wait'] === 60 && $t['purpose'] === 'enable');
    ok('kod e-postayla hemen gitti (öncelik 0)', count($fake->sent) === 1 && (int)$db->val("SELECT priority FROM {outbox} WHERE ev='tfa'") === 0
        && $db->val("SELECT status FROM {outbox} WHERE ev='tfa'") === 'sent');
    preg_match('/\b(\d{6})\b/', $fake->sent[0]['text'], $m);
    $code = $m[1];
    ok('kod konu ve metinde', strpos($fake->sent[0]['subject'], $code) !== false);
    ok('veritabanında kod düz metin değil', strpos(json_encode($db->all('SELECT * FROM {auth_challenges}')), $code) === false);
    $e = throws(function () use ($db, $t, $u, $code) {
        Tfa::verify($db, $t['id'], $u['id'], $code === '000000' ? '111111' : '000000', ['enable']);
    });
    ok('yanlış kod → 400, kalan 4', $e instanceof HttpError && $e->errCode === 'tfa_bad' && $e->extra['remaining'] === 4);
    ok('başka kullanıcının doğrulaması bulunamaz', throws(function () use ($db, $t, $u, $code) {
        Tfa::verify($db, $t['id'], $u['id'] + 1, $code, ['enable']);
    })->errCode === 'tfa_gone');
    ok('yanlış amaç bulunamaz', throws(function () use ($db, $t, $u, $code) {
        Tfa::verify($db, $t['id'], $u['id'], $code, ['login']);
    })->errCode === 'tfa_gone');
    $row = Tfa::verify($db, $t['id'], $u['id'], substr($code, 0, 3) . ' ' . substr($code, 3), ['enable']);
    ok('doğru kod (boşluklu) kabul', $row['purpose'] === 'enable' && $row['channel'] === 'mail');
    ok('tekrar kullanım → tfa_gone', throws(function () use ($db, $t, $u, $code) {
        Tfa::verify($db, $t['id'], $u['id'], $code, ['enable']);
    })->errCode === 'tfa_gone');
    $e = throws(function () use ($db, $u) {
        Tfa::start($db, $u, 'login', 'mail');
    });
    ok('60 sn içinde yeni kod → 429', $e instanceof HttpError && $e->http === 429);
    RateLimit::reset('tfa_m:' . $u['id'] . ':mail');
    $t2 = Tfa::start($db, $u, 'login', 'mail');
    for ($i = 0; $i < 4; $i++) {
        throws(function () use ($db, $t2, $u) {
            Tfa::verify($db, $t2['id'], $u['id'], '999999', ['login']);
        });
    }
    $e = throws(function () use ($db, $t2, $u) {
        Tfa::verify($db, $t2['id'], $u['id'], '999999', ['login']);
    });
    ok('5. hatalı deneme → kilit (429)', $e instanceof HttpError && $e->errCode === 'tfa_locked');
    ok('kilitten sonra doğrulama kapandı', throws(function () use ($db, $t2, $u) {
        Tfa::verify($db, $t2['id'], $u['id'], '123456', ['login']);
    })->errCode === 'tfa_gone');
    // saatlik sınır (60 sn sınırını her seferinde sıfırlayarak)
    $hits = 0;
    for ($i = 0; $i < 6; $i++) {
        RateLimit::reset('tfa_m:' . $u['id'] . ':mail');
        if (!throws(function () use ($db, $u) {
            Tfa::start($db, $u, 'login', 'mail');
        })) {
            $hits++;
        }
    }
    ok('saatte en fazla 5 kod', $hits === 3, $hits); // 2 kod zaten gönderildi
    // süre dolumu
    RateLimit::reset('tfa_h:' . $u['id']);
    RateLimit::reset('tfa_m:' . $u['id'] . ':mail');
    $t3 = Tfa::start($db, $u, 'login', 'mail');
    $db->exec('UPDATE {auth_challenges} SET expires_at=? WHERE id=?', [yp_now_ms() - 1, $t3['id']]);
    ok('süresi dolan kod → tfa_expired', throws(function () use ($db, $t3, $u) {
        Tfa::verify($db, $t3['id'], $u['id'], '123456', ['login']);
    })->errCode === 'tfa_expired');
    // SMS kapalıyken girişte e-postaya düşer; aç/kapat'ta hata
    RateLimit::reset('tfa_m:' . $u['id'] . ':mail');
    $t4 = Tfa::start($db, $u, 'login', 'sms');
    ok('SMS kapalı: giriş kodu e-postaya düşer', $t4['ch'] === 'mail');
    ok('SMS kapalı: SMS ile açma 422', throws(function () use ($db, $u) {
        Tfa::start($db, $u, 'enable', 'sms');
    })->errCode === 'tfa_channel');
    // kanal değiştirme (SMS açık)
    $fs = new FakeSms();
    Sms::$factory = function () use ($fs) {
        return $fs;
    };
    Settings::set('sms', array_merge(Settings::get('sms'), ['on' => true, 'user' => 'u', 'pass' => 'p', 'header' => 'YANGPAZAR']));
    RateLimit::reset('tfa_h:' . $u['id']);
    $t5 = Tfa::resend($db, $u, $t4['id'], ['login'], true);
    ok('kanal değiştir → SMS, numaraya 10 hane', $t5['ch'] === 'sms' && $fs->sent[0][0] === '5551112233' && preg_match('/\d{6}/', $fs->sent[0][1]));
    ok('açma doğrulamasında kanal değişmez', throws(function () use ($db, $u) {
        RateLimit::reset('tfa_m:' . $u['id'] . ':mail');
        $t = Tfa::start($db, $u, 'enable', 'mail');
        Tfa::resend($db, $u, $t['id'], ['enable'], true);
    })->errCode === 'tfa_switch');
    Mailer::$factory = null;
    Sms::$factory = null;
});

section('mailer', function () {
    // Brevo
    $calls = [];
    $b = new Brevo('xkeysib-ABC', fakeHttp($calls, [[201, '{"messageId":"<2026@smtp-relay.mailin.fr>"}']]));
    $r = $b->send(['to' => 'ali@ornek.com', 'toName' => 'Ali', 'from' => 'noreply@yangpazar.com', 'fromName' => 'yangpazar', 'subject' => "Konu\r\nBcc: x@y", 'text' => 'Merhaba']);
    ok('Brevo: başarılı, messageId', $r['ok'] && $r['id'] === '<2026@smtp-relay.mailin.fr>');
    ok('Brevo: URL ve api-key başlığı', $calls[0]['url'] === 'https://api.brevo.com/v3/smtp/email' && in_array('api-key: xkeysib-ABC', $calls[0]['o']['headers'], true));
    $j = $calls[0]['o']['json'];
    ok('Brevo: gövde biçimi', $j['sender']['email'] === 'noreply@yangpazar.com' && $j['to'][0]['email'] === 'ali@ornek.com' && $j['textContent'] === 'Merhaba');
    ok('Brevo: konuda satır sonu temizlendi', strpos($j['subject'], "\n") === false);
    $calls = [];
    $r = (new Brevo('bad', fakeHttp($calls, [[401, '{"code":"unauthorized","message":"Key not found"}']])))->send(['to' => 'a@b.co', 'from' => 'n@y.com', 'subject' => 's', 'text' => 't']);
    ok('Brevo 401 → Türkçe hata, yeniden deneme yok', !$r['ok'] && strpos($r['error'], 'Brevo API anahtarı') !== false && !$r['retry']);
    $r = (new Brevo('k', fakeHttp($calls, [[0, '', 'Bağlantı zaman aşımına uğradı.']])))->send(['to' => 'a@b.co', 'from' => 'n@y.com', 'subject' => 's', 'text' => 't']);
    ok('Brevo ağ hatası → yeniden denenir', !$r['ok'] && $r['retry'] && strpos($r['error'], 'ulaşılamadı') !== false);
    // Mailjet
    $calls = [];
    $mj = new Mailjet('pub', 'priv', fakeHttp($calls, [[200, '{"Messages":[{"Status":"success","To":[{"Email":"a@b.co","MessageID":576460752}]}]}']]));
    $r = $mj->send(['to' => 'a@b.co', 'from' => 'n@y.com', 'fromName' => 'YP', 'subject' => 'Ş', 'text' => 'ü', 'html' => '<b>ü</b>']);
    ok('Mailjet: başarılı + MessageID', $r['ok'] && $r['id'] === '576460752');
    ok('Mailjet: Basic yetkilendirme', in_array('Authorization: Basic ' . base64_encode('pub:priv'), $calls[0]['o']['headers'], true) && $calls[0]['url'] === 'https://api.mailjet.com/v3.1/send');
    ok('Mailjet: Messages biçimi', $calls[0]['o']['json']['Messages'][0]['From']['Email'] === 'n@y.com' && $calls[0]['o']['json']['Messages'][0]['HTMLPart'] === '<b>ü</b>');
    $r = (new Mailjet('p', 'q', fakeHttp($calls, [[400, '{"Messages":[{"Status":"error","Errors":[{"ErrorMessage":"Sender not validated"}]}]}']])))->send(['to' => 'a@b.co', 'from' => 'n@y.com', 'subject' => 's', 'text' => 't']);
    ok('Mailjet hata mesajı aktarılır', !$r['ok'] && strpos($r['error'], 'Sender not validated') !== false);
    // Mailer: seçim + yedek
    $m = Mailer::fromSettings(['provider' => 'brevo', 'brevo_key' => 'k', 'from' => 'n@y.com', 'fallback' => true]);
    ok('fromSettings: Brevo + mail() yedeği', $m->primary instanceof Brevo && $m->fallback instanceof PhpMail && $m->configured());
    ok('fromSettings: anahtarsız sağlayıcı = yok', Mailer::fromSettings(['provider' => 'mailjet', 'mailjet_key' => 'x', 'from' => 'n@y.com'])->primary === null);
    ok('fromSettings: smtp', Mailer::fromSettings(['provider' => 'smtp', 'smtp_host' => 'smtp.ornek.com', 'from' => 'n@y.com'])->primary instanceof Smtp);
    $phpCalls = [];
    $fail = new FakeMail();
    $fail->fail = true;
    $mm = new Mailer($fail, new PhpMail(function ($to, $sub, $body, $hdr, $extra) use (&$phpCalls) {
        $phpCalls[] = compact('to', 'sub', 'body', 'hdr', 'extra');
        return true;
    }), 'noreply@yangpazar.com', 'Yang Pazar');
    $r = $mm->send('ali@ornek.com', 'Doğrulama kodunuz', "Kod: 123456\n.\nson");
    ok('sağlayıcı hata verince mail() yedeği kullanılır', $r['ok'] && $r['provider'] === 'phpmail' && count($phpCalls) === 1);
    ok('mail(): UTF-8 başlık kodlu, -f gönderen', strpos($phpCalls[0]['sub'], '=?UTF-8?B?') === 0 && $phpCalls[0]['extra'] === '-fnoreply@yangpazar.com'
        && strpos($phpCalls[0]['hdr'], 'Content-Transfer-Encoding: base64') !== false && strpos($phpCalls[0]['hdr'], 'Subject:') === false);
    $none = new Mailer(null, null, 'n@y.com');
    ok('sağlayıcı yok → Türkçe hata', !$none->send('a@b.co', 's', 't')['ok'] && !$none->configured());
    ok('geçersiz alıcı reddedilir', !$mm->send("a@b.co\r\nBcc: x@y.z", 's', 't')['ok'] && count($phpCalls) === 1);
    ok('gönderen yoksa hata', !(new Mailer(new FakeMail(), null, ''))->send('a@b.co', 's', 't')['ok']);
    list($h, $body) = Mime::build(['to' => 'a@b.co', 'from' => 'n@y.com', 'fromName' => 'Yang Pazar Ş', 'subject' => str_repeat('Çok uzun konu ', 8), 'text' => "a\nb"]);
    ok('MIME: uzun UTF-8 konu katlandı', strpos(implode("\r\n", $h), "\r\n =?UTF-8?B?") !== false);
    ok('MIME: gövde base64 CRLF', base64_decode(str_replace("\r\n", '', $body)) === "a\r\nb");
});

section('smtp', function () {
    $dir = YP_STORAGE . '/smtp';
    @mkdir($dir);
    $sink = function ($mode, $addr = '127.0.0.1', $cert = null) use ($dir) {
        $port = random_int(20000, 45000);
        $out = $dir . '/' . $mode . '-' . $port . '.json';
        $cmd = [PHP_BINARY, dirname(__DIR__) . '/tests/lib/smtp_sink.php', $addr, (string)$port, $mode, $out];
        if ($cert) {
            $cmd[] = $cert;
        }
        $p = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $ready = trim((string)fgets($pipes[1]));
        return [$p, $port, $out, $ready, $pipes];
    };
    $finish = function ($s) {
        for ($i = 0; $i < 50 && !is_file($s[2]); $i++) {
            usleep(50000);
        }
        proc_close($s[0]);
        return json_decode((string)@file_get_contents($s[2]), true);
    };
    $msg = ['to' => 'ali@ornek.com', 'toName' => 'Ali', 'from' => 'noreply@yangpazar.com', 'fromName' => 'yangpazar', 'subject' => 'Doğrulama kodunuz: 123456', 'text' => "Merhaba\n.\nNokta satırı"];

    $s = $sink('plain');
    ok('sahte SMTP hazır', $s[3] === 'READY', $s[3]);
    $c = new Smtp('127.0.0.1', $s[1], '', 'kullanici@yangpazar.com', 'S1fre!', ['timeout' => 5]);
    $r = $c->send($msg);
    $log = $finish($s);
    ok('düz bağlantı (yerel) + AUTH LOGIN → gönderildi', $r['ok'] && $r['id'] === 'SINK123', $r);
    ok('AUTH LOGIN kullanıcı/şifre doğru iletildi', $log['auth']['user'] === 'kullanici@yangpazar.com' && $log['auth']['pass'] === 'S1fre!');
    ok('MAIL FROM / RCPT TO', $log['mail_from'] === '<noreply@yangpazar.com>' && $log['rcpt'] === '<ali@ornek.com>');
    ok('ileti: kodlanmış konu, base64 gövde', strpos($log['data'], 'Subject: =?UTF-8?B?') !== false && strpos($log['data'], 'Content-Transfer-Encoding: base64') !== false);
    $parts = explode("\r\n\r\n", $log['data'], 2);
    ok('gövde çözülünce aynı (nokta satırı korunur)', base64_decode(str_replace("\r\n", '', $parts[1])) === "Merhaba\r\n.\r\nNokta satırı");
    ok('istemci günlüğünde şifre maskeli', strpos(implode("\n", $c->log), base64_encode('S1fre!')) === false && strpos(implode("\n", $c->log), '[şifre]') !== false);
    ok('QUIT gönderildi', in_array('QUIT', $log['lines'], true));

    // STARTTLS — kendinden imzalı sertifika
    $cert = $dir . '/sink.pem';
    $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
    $csr = openssl_csr_new(['commonName' => '127.0.0.1'], $key, ['digest_alg' => 'sha256']);
    $x = openssl_csr_sign($csr, null, $key, 1, ['digest_alg' => 'sha256']);
    openssl_x509_export($x, $pemC);
    openssl_pkey_export($key, $pemK);
    file_put_contents($cert, $pemC . $pemK);
    $s = $sink('starttls', '127.0.0.1', $cert);
    $c = new Smtp('127.0.0.1', $s[1], 'tls', 'u@yangpazar.com', 'TLS-sifre', ['timeout' => 5, 'verify' => false]);
    $r = $c->send($msg);
    $log = $finish($s);
    ok('STARTTLS kuruldu, AUTH TLS içinde', $r['ok'] && $log['tls'] === true && $log['auth']['tls'] === true && $log['auth']['pass'] === 'TLS-sifre', [$r, $log ? array_slice($log['lines'], 0, 6) : null]);
    ok('STARTTLS sonrası ikinci EHLO', count(array_filter($log['lines'], function ($l) {
        return strpos($l, 'EHLO') === 0;
    })) === 2);
    $s = $sink('starttls', '127.0.0.1', $cert);
    $r = (new Smtp('127.0.0.1', $s[1], 'tls', 'u', 'p', ['timeout' => 5]))->send($msg);
    $finish($s);
    ok('sertifika doğrulanamazsa gönderilmez (verify açık)', !$r['ok'] && strpos($r['error'], 'TLS') !== false, $r);

    $s = $sink('authfail');
    $r = (new Smtp('127.0.0.1', $s[1], '', 'u', 'yanlis', ['timeout' => 5]))->send($msg);
    $finish($s);
    ok('535 → "kullanıcı adı veya şifresi hatalı", yeniden deneme yok', !$r['ok'] && strpos($r['error'], 'şifresi hatalı') !== false && !$r['retry']);

    $s = $sink('plain', '127.0.0.2');
    if ($s[3] === 'READY') {
        $r = (new Smtp('127.0.0.2', $s[1], '', 'u', 'p', ['timeout' => 5]))->send($msg);
        $log = $finish($s);
        ok('şifrelenmemiş bağlantıda uzak sunucuya şifre gönderilmez', !$r['ok'] && strpos($r['error'], 'şifrelenmemiş') !== false && $log['auth'] === null);
    } else {
        $finish($s);
        ok('127.0.0.2 dinlenemedi (atlandı)', true);
    }
    $s = $sink('plain');
    $r = (new Smtp('127.0.0.1', $s[1], 'tls', '', '', ['timeout' => 5]))->send($msg);
    $finish($s);
    ok('TLS istenip sunucu STARTTLS sunmazsa hata', !$r['ok'] && strpos($r['error'], 'STARTTLS') !== false);
    $r = (new Smtp('127.0.0.1', 1, '', '', '', ['timeout' => 2]))->send($msg);
    ok('bağlanılamayan port → Türkçe hata', !$r['ok'] && strpos($r['error'], 'bağlanılamadı') !== false);
});

section('sms', function () {
    $calls = [];
    $n = new NetGsm('8503000000', 'sifre', 'YANGPAZAR', fakeHttp($calls, [[200, '{"code":"00","jobid":"17377215342605050417149344","description":"queued"}'], [200, '{"code":"30"}']]));
    $r = $n->send('5551112233', 'yangpazar doğrulama kodunuz: 123456');
    ok('NetGSM: başarılı, jobid', $r['ok'] && $r['id'] === '17377215342605050417149344');
    $o = $calls[0]['o'];
    ok('NetGSM: REST v2 URL, Basic, gövde', $calls[0]['url'] === 'https://api.netgsm.com.tr/sms/rest/v2/send'
        && in_array('Authorization: Basic ' . base64_encode('8503000000:sifre'), $o['headers'], true)
        && $o['json']['msgheader'] === 'YANGPAZAR' && $o['json']['messages'][0]['no'] === '5551112233' && $o['json']['encoding'] === 'TR');
    $r = $n->send('5551112233', 'kod');
    ok('NetGSM 30 → Türkçe hata', !$r['ok'] && strpos($r['error'], 'kullanıcı adı') !== false && !$r['retry']);
    ok('numara biçimi', Sms::normalize('0555 111 22 33') === '5551112233' && Sms::normalize('+90 555 111 2233') === '5551112233' && Sms::normalize('0212 111 22 33') === '');
    ok('fromSettings: eksik bilgi → yok', Sms::fromSettings(['provider' => 'netgsm', 'user' => 'u', 'pass' => '', 'header' => 'H']) === null);
    ok('fromSettings: NetGSM', Sms::fromSettings(['provider' => 'netgsm', 'user' => 'u', 'pass' => 'p', 'header' => 'H']) instanceof NetGsm);
});

section('outbox', function () {
    $db = freshDb();
    $fake = new FakeMail();
    $m = new Mailer($fake, null, 'noreply@yangpazar.com');
    Settings::set('mail', array_merge(Settings::get('mail'), ['hourly' => 24]));
    for ($i = 0; $i < 30; $i++) {
        Outbox::queue($db, 'mail', null, "u$i@ornek.com", 'welcome', 'Hoş geldin', 'metin');
    }
    ok('saatlik 24 → tik başına 2', Outbox::budget($db, 'mail', 24) === 2 && Outbox::budget($db, 'mail', 5) === 1 && Outbox::budget($db, 'mail', 80) === 6);
    $s = Outbox::tick($db, $m);
    ok('ilk tik 2 ileti', $s['mail'] === 2 && count($fake->sent) === 2, $s);
    for ($i = 0; $i < 20; $i++) {
        Outbox::tick($db, $m);
    }
    ok('bir saatte 24\'ü aşmaz', count($fake->sent) === 24 && Outbox::sentLastHour($db, 'mail') === 24, count($fake->sent));
    ok('kalanlar kuyrukta bekler', (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE status='queued'") === 6);
    $otp = Outbox::queue($db, 'mail', null, 'otp@ornek.com', 'tfa', 'Kod 123456', 'Kod 123456', Outbox::PRIO_OTP);
    $s = Outbox::tick($db, $m);
    ok('bütçe dolu olsa da doğrulama kodu gider', $s['otp'] === 1 && $s['mail'] === 0 && $db->val('SELECT status FROM {outbox} WHERE id=?', [$otp]) === 'sent');
    ok('sıra: öncelik, sonra id (FIFO)', $fake->sent[0]['to'] === 'u0@ornek.com' && $fake->sent[23]['to'] === 'u23@ornek.com' && end($fake->sent)['to'] === 'otp@ornek.com');
    // saat geçince devam
    $db->exec('UPDATE {outbox} SET sent_at=sent_at-3700000');
    ok('bir saat sonra bütçe yenilenir', Outbox::tick($db, $m)['mail'] === 2);
    // hata ve geri çekilme
    $db2 = freshDb();
    $bad = new FakeMail();
    $bad->fail = true;
    $mb = new Mailer($bad, null, 'n@y.com');
    $id = Outbox::queue($db2, 'mail', null, 'a@b.co', 'x', 's', 'b');
    Outbox::tick($db2, $mb);
    $row = $db2->one('SELECT * FROM {outbox} WHERE id=?', [$id]);
    ok('hata → kuyrukta, 1 dk sonra yeniden', $row['status'] === 'queued' && (int)$row['tries'] === 1 && (int)$row['next_at'] > yp_now_ms() + 50000 && $row['last_error'] === 'sahte hata');
    ok('beklemedeyken gönderilmez', Outbox::tick($db2, $mb)['failed'] === 0);
    for ($i = 0; $i < 6; $i++) {
        $db2->exec('UPDATE {outbox} SET next_at=0 WHERE id=?', [$id]);
        Outbox::tick($db2, $mb);
    }
    ok('5 denemeden sonra failed', $db2->val('SELECT status FROM {outbox} WHERE id=?', [$id]) === 'failed' && (int)$db2->val('SELECT tries FROM {outbox} WHERE id=?', [$id]) === 5);
    $bad->retry = false;
    $id2 = Outbox::queue($db2, 'mail', null, 'a@b.co', 'x', 's', 'b');
    Outbox::tick($db2, $mb);
    ok('kalıcı hata → hemen failed', $db2->val('SELECT status FROM {outbox} WHERE id=?', [$id2]) === 'failed');
    // SMS bütçesi ayrı
    $db3 = freshDb();
    $fs = new FakeSms();
    Settings::set('sms', array_merge(Settings::get('sms'), ['hourly' => 12]));
    for ($i = 0; $i < 3; $i++) {
        Outbox::queue($db3, 'sms', null, '0555 111 22 3' . $i, 'x', '', 'mesaj');
    }
    Outbox::queue($db3, 'sms', null, '0212 111 22 33', 'x', '', 'sabit hat');
    $s = Outbox::tick($db3, null, $fs);
    ok('SMS: saatlik 12 → tik başına 1', $s['sms'] === 1 && count($fs->sent) === 1 && $fs->sent[0][0] === '5551112230');
    for ($i = 0; $i < 4; $i++) {
        Outbox::tick($db3, null, $fs);
    }
    ok('SMS: geçersiz numara kalıcı hata', $db3->val("SELECT status FROM {outbox} WHERE to_addr='0212 111 22 33'") === 'failed');
});

section('notify', function () {
    $db = freshDb();
    $u = mkUser($db, 'Deniz');
    $nid = Notify::send($db, $u['id'], 'Hoş geldin', '#hesabim', 'welcome');
    ok('bildirim satırı', (int)$db->val('SELECT COUNT(*) FROM {notifications} WHERE user_id=?', [$u['id']]) === 1 && $nid > 0);
    ok('e-posta kapalıyken kuyruğa eklenmez', (int)$db->val('SELECT COUNT(*) FROM {outbox}') === 0);
    Settings::set('mail', array_merge(Settings::get('mail'), ['on' => true]));
    Notify::send($db, $u['id'], 'Hoş geldin', '#hesabim', 'welcome');
    $o = $db->one('SELECT * FROM {outbox} LIMIT 1');
    ok('e-posta açık + olay açık → kuyrukta, şablonlu', $o && $o['subject'] === 'yangpazar.com ailesine hoş geldin Ali!' && strpos($o['body'], 'Merhaba Ali') === 0 && (int)$o['priority'] === 5);
    Notify::send($db, $u['id'], 'x', '', 'sold');
    ok('olay kapalıysa e-posta yok', (int)$db->val('SELECT COUNT(*) FROM {outbox}') === 1);
    Settings::set('mail', array_merge(Settings::get('mail'), ['on' => true, 'brevo_key' => 'xkeysib-GIZLI', 'provider' => 'brevo']));
    $raw = $db->val("SELECT v FROM {settings} WHERE k='mail'");
    ok('mail ayarı veritabanında şifreli', strpos($raw, 'GIZLI') === false && (int)$db->val("SELECT secret FROM {settings} WHERE k='mail'") === 1);
    Settings::clearCache();
    ok('şifreli ayar geri okunur', Settings::get('mail')['brevo_key'] === 'xkeysib-GIZLI');
});

section('idem', function () {
    $db = freshDb();
    $u = mkUser($db, 'Alici');
    $n = 0;
    $fn = function () use (&$n) {
        $n++;
        return ['ok' => true, 'msg' => 'yapıldı', 'n' => $n];
    };
    list($h1, $b1, $rep1) = Idem::run($db, $u['id'], 'anahtar-12345678', 'POST orders', $fn);
    list($h2, $b2, $rep2) = Idem::run($db, $u['id'], 'anahtar-12345678', 'POST orders', $fn);
    ok('ilk çalışır, tekrar aynı yanıtı döndürür', $n === 1 && !$rep1 && $rep2 && $b1 === $b2 && $h2 === 200);
    ok('başka rota → 409', throws(function () use ($db, $u, $fn) {
        Idem::run($db, $u['id'], 'anahtar-12345678', 'POST withdrawals', $fn);
    })->http === 409);
    ok('geçersiz anahtar → 400', throws(function () use ($db, $u, $fn) {
        Idem::run($db, $u['id'], 'kısa', 'POST x', $fn);
    })->errCode === 'idem_key');
    list(, , $rep3) = Idem::run($db, $u['id'] + 0, 'baska-anahtar-1', 'POST orders', $fn);
    ok('farklı anahtar yeniden çalışır', !$rep3 && $n === 2);
    $db->exec('UPDATE {idempotency_keys} SET t=0');
    ok('24 saat temizliği', Idem::cleanup($db) === 2);
});

section('audit', function () {
    $db = freshDb();
    Audit::log($db, 1, 'staff_add', 'user', 5, ['email' => 'gizli@ornek.com', 'perms' => ['uye']], '1.2.3.4');
    $r = $db->one('SELECT * FROM {audit_log}');
    ok('denetim kaydı + IP', $r['action'] === 'staff_add' && $r['entity_id'] === '5' && $r['ip'] === '1.2.3.4');
    ok('kişisel veri maskeli', strpos($r['data'], 'gizli@ornek.com') === false && strpos($r['data'], 'uye') !== false);
});

section('cron', function () {
    $db = freshDb();
    $fake = new FakeMail();
    Mailer::$factory = function () use ($fake) {
        return new Mailer($fake, null, 'n@y.com');
    };
    Outbox::queue($db, 'mail', null, 'a@b.co', 'x', 's', 'b');
    ok('ilk çalıştırma: geç (hiç çalışmamış)', Cron::late($db));
    $r = Cron::run($db, 10);
    ok('tik: outbox + cleanup çalıştı', $r['ok'] && isset($r['tasks']['outbox']) && isset($r['tasks']['cleanup']) && count($fake->sent) === 1, $r);
    ok('artık geç değil', !Cron::late($db));
    $r = Cron::run($db, 10);
    ok('günlük görev tekrar çalışmaz', !isset($r['tasks']['cleanup']) && isset($r['tasks']['outbox']));
    ok('kilit: aynı anda ikinci tik reddedilir', Cron::lock($db, 'tick', 60000) && Cron::run($db, 5)['ok'] === false);
    Cron::done($db, 'tick');
    ok('kilit bırakıldı', Cron::run($db, 5)['ok'] === true);
    Mailer::$factory = null;
});

section('store', function () {
    $f = YP_STORAGE . '/db.php';
    Store::write('db', ['driver' => 'mysql', 'host' => 'localhost', 'name' => 'u_yp', 'user' => 'u_yp', 'pass' => 'VeritabaniSifresi!']);
    $raw = file_get_contents($f);
    ok('db.php: <?php return \'<base64>\'; biçimi', (bool)preg_match("/^<\\?php\n.*\nreturn '[A-Za-z0-9+\\/=]+';\n$/s", $raw));
    ok('db.php: şifre düz metin değil', strpos($raw, 'VeritabaniSifresi') === false && strpos(base64_decode(substr($raw, strpos($raw, "'") + 1, -3)), 'VeritabaniSifresi') === false);
    ok('db.php geri okunur', Store::dbConfig()['pass'] === 'VeritabaniSifresi!');
    ok('pepper 32 bayt', strlen(Store::pepper()) === 32);
    ok('geçersiz depo adı reddedilir', throws(function () {
        Store::path('../api/data/admin');
    }) instanceof RuntimeException);
    ok('storage/.htaccess deny (repo)', strpos(file_get_contents(dirname(__DIR__) . '/storage/.htaccess'), 'Require all denied') !== false
        && strpos(file_get_contents(dirname(__DIR__) . '/app/.htaccess'), 'Require all denied') !== false);
    $guard = [];
    foreach (array_merge(glob(dirname(__DIR__) . '/app/src/*.php'), glob(dirname(__DIR__) . '/app/src/*/*.php'), glob(dirname(__DIR__) . '/app/routes/*.php'), glob(dirname(__DIR__) . '/app/schema/*.php')) as $file) {
        $c = file_get_contents($file);
        if (basename($file) !== 'index.php' && strpos($c, "defined('YP_APP')") === false) {
            $guard[] = basename($file);
        }
    }
    ok('tüm app/ dosyalarında doğrudan çağrı koruması', !$guard, $guard);
});

require __DIR__ . '/unit_p1.php';

echo "\nSONUÇ (birim): $PASS geçti, $FAIL kaldı\n";
exit($FAIL ? 1 : 0);
