<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use PDO;
use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Log;
use YP\Money\Ledger;
use YP\Schema;
use YP\Settings;
use YP\Updater;

/**
 * Veritabanı yedeği (PLAN §1.6): saf PHP/PDO SQL dökümü — exec/mysqldump GEREKMEZ (paylaşımlı hostingde kapalıdır).
 *   - storage/backups/ altında .sql.gz (klasörde "Require all denied" .htaccess; storage/ zaten kapalı). Kayıt: backups tablosu.
 *   - Satırlar tablo tablo, akışla okunur (MySQL'de tamponsuz sorgu) ve gzip'e yazılır; bellek kullanımı tablo boyutundan bağımsız.
 *   - Biçim, phpMyAdmin'e doğrudan içe aktarılabilen MySQL SQL'idir (dizgeler MySQL kaçışlı, tek satırda). Baş/son satırlarındaki
 *     "-- @yp-backup {…}" ve "-- @yp-end {…}" işaretleri dosyanın eksiksiz olduğunu gösterir (yarım yüklenen dosya reddedilir).
 *   - Geri yükleme SQL'i ÇALIŞTIRMAZ: her INSERT satırı ayrıştırılır (yalnız düz değerler kabul edilir), değerler hazır ifadelerle
 *     yazılır. Böylece yüklenen bir dosya veritabanında yedek verisinden başka bir şey yapamaz; MariaDB ↔ SQLite arasında da çalışır.
 *   - Geri yükleme yalnız bakım modunda, önce mevcut durumun yedeği alınarak yapılır; sonra şema/göçler uygulanır ve defter
 *     tutarlılık denetimi (Ledger::check) çalışır. Bakım ve yedek ayarları geri yüklenen veriyle ezilmez.
 * Saklama: otomatik yedeklerden son N (ayar, varsayılan 7), güncelleme/geri yükleme öncesi yedeklerden son 3; elle alınan ve
 * yüklenen yedekler silinene kadar kalır.
 */
final class Backup
{
    const VERSION = 1;
    const KINDS = ['manual' => 'Elle alınan', 'auto' => 'Otomatik', 'pre_update' => 'Güncelleme öncesi', 'pre_restore' => 'Geri yükleme öncesi', 'upload' => 'Yüklenen dosya'];
    /** Yedeklenmeyen / geri yüklemede ezilmeyen tablolar (yedek listesinin kendisi) */
    const SKIP = ['backups'];
    /** Geri yüklemede korunan ayarlar (bakım modu açık kalsın, yedek ayarı değişmesin) */
    const KEEP_SETTINGS = ['maint', 'backup'];
    const ROWS_PER_INSERT = 200;
    const BYTES_PER_INSERT = 900000;
    const AUTO = ['off' => 0, 'daily' => 86400000, '12h' => 43200000, '6h' => 21600000];

    public static function dir()
    {
        $d = YP_STORAGE . '/backups';
        yp_ensure_dir($d);
        if (!is_file($d . '/.htaccess')) {
            @file_put_contents($d . '/.htaccess', "# yedekler: dışarıdan erişilemez\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\nOptions -Indexes\n");
        }
        if (!is_file($d . '/index.php')) {
            @file_put_contents($d . '/index.php', "<?php\n// boş\n");
        }
        return $d;
    }

    public static function settings(Db $db)
    {
        $s = Settings::get('backup', $db);
        $s = is_array($s) ? $s : [];
        $auto = isset($s['auto']) && isset(self::AUTO[$s['auto']]) ? $s['auto'] : 'daily';
        $keep = isset($s['keep']) ? max(1, min(60, (int)$s['keep'])) : 7;
        return ['auto' => $auto, 'keep' => $keep];
    }

    private static function long()
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(600);
        }
        @ignore_user_abort(true);
    }

    /* ================= döküm ================= */

    /** MySQL dizge değişmezi (tek satır) */
    public static function lit($v)
    {
        if ($v === null) {
            return 'NULL';
        }
        if (is_int($v) || is_float($v)) {
            return (string)$v;
        }
        if (is_bool($v)) {
            return $v ? '1' : '0';
        }
        return "'" . strtr((string)$v, ["\\" => "\\\\", "\0" => "\\0", "\n" => "\\n", "\r" => "\\r", "'" => "\\'", "\x1a" => "\\Z"]) . "'";
    }

    private static function pkCols(array $def)
    {
        if (!empty($def['pk'])) {
            return $def['pk'];
        }
        foreach ($def['cols'] as $c => $spec) {
            if ($spec === 'pk') {
                return [$c];
            }
        }
        return [array_keys($def['cols'])[0]];
    }

    /** Yedek alır. Dönüş: backups satırı */
    public static function create(Db $db, $kind, $byId = null, $note = '')
    {
        if (!isset(self::KINDS[$kind])) {
            throw new \InvalidArgumentException('yedek türü');
        }
        self::long();
        $dir = self::dir();
        $name = 'yp-' . gmdate('Ymd-His', (int)floor(yp_now_ms() / 1000) + 10800) . '-' . $kind . '-' . bin2hex(random_bytes(4)) . '.sql.gz';
        $abs = $dir . '/' . $name;
        $t0 = microtime(true);
        $st = self::dump($db, $abs . '.part');
        if (!@rename($abs . '.part', $abs)) {
            @unlink($abs . '.part');
            throw new \RuntimeException('Yedek dosyası yazılamadı (storage/backups).');
        }
        @chmod($abs, 0600);
        $id = $db->insert('backups', ['t' => yp_now_ms(), 'kind' => $kind, 'by_id' => $byId, 'file' => $name, 'bytes' => (int)filesize($abs), 'sha256' => hash_file('sha256', $abs)]);
        Log::write('bilgi', 'Yedek alındı: ' . $name, ['tablo' => $st['tables'], 'satir' => $st['rows'], 'ms' => (int)round((microtime(true) - $t0) * 1000)]);
        self::prune($db);
        $row = $db->one('SELECT * FROM {backups} WHERE id=?', [$id]);
        $row['_rows'] = $st['rows'];
        $row['_tables'] = $st['tables'];
        return $row;
    }

    /** Akışlı döküm → gzip dosyası. Dönüş: ['tables' => n, 'rows' => n] */
    public static function dump(Db $db, $path)
    {
        $gz = @gzopen($path, 'wb6');
        if (!$gz) {
            throw new \RuntimeException('Yedek dosyası açılamadı (storage/backups yazılabilir değil).');
        }
        $schema = Schema::load();
        $meta = ['v' => self::VERSION, 'app' => YP_APP_VERSION, 'dialect' => $db->dialect, 'prefix' => $db->prefix, 't' => yp_now_ms(),
            'db' => $db->version, 'esc' => 'mysql'];
        gzwrite($gz, "-- yangpazar.com veritabanı yedeği · " . gmdate('Y-m-d H:i', (int)floor($meta['t'] / 1000) + 10800) . " (TSİ)\n"
            . '-- @yp-backup ' . json_encode($meta, JSON_UNESCAPED_SLASHES) . "\n"
            . "-- Geri yükleme: Yönetim › Yedek & bakım › Yedekler (önerilir) ya da phpMyAdmin › İçe aktar.\n"
            . "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n");
        $my = $db->dialect === 'mysql';
        $tx = false;
        if (!$db->inTx()) {
            try {
                $db->pdo->exec($my ? 'START TRANSACTION WITH CONSISTENT SNAPSHOT' : 'BEGIN');
                $tx = true;
            } catch (\Throwable $e) {
            }
        }
        $buffered = null;
        if ($my) {
            $buffered = $db->pdo->getAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY);
            $db->pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
        }
        $tables = 0;
        $rows = 0;
        try {
            foreach ($schema as $t => $def) {
                if (in_array($t, self::SKIP, true)) {
                    continue;
                }
                $exists = $my ? null : $db->tableExists($t);
                if ($my) {
                    // tamponsuz kipte araya başka sorgu giremez: varlığı önce tamponlu sorguyla öğren
                    $db->pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
                    $exists = $db->tableExists($t);
                    $cols = $exists ? $db->columns($t) : [];
                    $db->pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
                } else {
                    $cols = $exists ? $db->columns($t) : [];
                }
                if (!$exists) {
                    continue;
                }
                $tables++;
                $full = $db->prefix . $t;
                $cl = '`' . implode('`,`', $cols) . '`';
                gzwrite($gz, "\n-- @table " . $t . ' ' . json_encode(['cols' => $cols]) . "\nDELETE FROM `" . $full . "`;\n");
                $pk = array_values(array_filter(self::pkCols($def), function ($c) use ($cols) {
                    return in_array(strtolower($c), $cols, true);
                }));
                $st = $db->pdo->query('SELECT ' . $cl . ' FROM `' . $full . '`' . ($pk ? ' ORDER BY `' . implode('`,`', $pk) . '`' : ''));
                $buf = [];
                $bytes = 0;
                $n = 0;
                $head = 'INSERT INTO `' . $full . '` (' . $cl . ') VALUES ';
                while (($r = $st->fetch(PDO::FETCH_NUM)) !== false) {
                    $x = '(' . implode(',', array_map([__CLASS__, 'lit'], $r)) . ')';
                    $buf[] = $x;
                    $bytes += strlen($x);
                    $n++;
                    if (count($buf) >= self::ROWS_PER_INSERT || $bytes >= self::BYTES_PER_INSERT) {
                        gzwrite($gz, $head . implode(',', $buf) . ";\n");
                        $buf = [];
                        $bytes = 0;
                    }
                }
                $st->closeCursor();
                if ($buf) {
                    gzwrite($gz, $head . implode(',', $buf) . ";\n");
                }
                gzwrite($gz, '-- @end-table ' . $t . ' ' . $n . "\n");
                $rows += $n;
            }
        } finally {
            if ($my) {
                $db->pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, $buffered === null ? true : $buffered);
            }
            if ($tx) {
                try {
                    $db->pdo->exec('COMMIT');
                } catch (\Throwable $e) {
                }
            }
        }
        gzwrite($gz, "\nSET FOREIGN_KEY_CHECKS=1;\n-- @yp-end " . json_encode(['tables' => $tables, 'rows' => $rows]) . "\n");
        if (!gzclose($gz)) {
            throw new \RuntimeException('Yedek dosyası kapatılamadı (disk dolu olabilir).');
        }
        return ['tables' => $tables, 'rows' => $rows];
    }

    /* ================= okuma / ayrıştırma ================= */

    /** INSERT … VALUES (…),(…); kuyruğunu düz değerlere ayırır. Yalnız NULL, sayı ve tırnaklı dizge kabul edilir. */
    public static function parseValues($s, $pos)
    {
        $len = strlen($s);
        $rows = [];
        $skip = function () use ($s, $len, &$pos) {
            while ($pos < $len && ($s[$pos] === ' ' || $s[$pos] === "\t")) {
                $pos++;
            }
        };
        while (true) {
            $skip();
            if ($pos >= $len || $s[$pos] !== '(') {
                throw new \RuntimeException('beklenen (');
            }
            $pos++;
            $row = [];
            while (true) {
                $skip();
                if ($pos >= $len) {
                    throw new \RuntimeException('satır yarım');
                }
                $c = $s[$pos];
                if ($c === "'") {
                    $pos++;
                    $out = '';
                    while (true) {
                        $q = strcspn($s, "'\\", $pos);
                        $out .= substr($s, $pos, $q);
                        $pos += $q;
                        if ($pos >= $len) {
                            throw new \RuntimeException('dizge kapanmadı');
                        }
                        if ($s[$pos] === '\\') {
                            $e = $pos + 1 < $len ? $s[$pos + 1] : '';
                            $map = ['0' => "\0", 'n' => "\n", 'r' => "\r", 'Z' => "\x1a", 't' => "\t", 'b' => "\x08"];
                            $out .= isset($map[$e]) ? $map[$e] : $e;
                            $pos += 2;
                            continue;
                        }
                        if ($pos + 1 < $len && $s[$pos + 1] === "'") {
                            $out .= "'";
                            $pos += 2;
                            continue;
                        }
                        $pos++;
                        break;
                    }
                    $row[] = $out;
                } elseif (strncasecmp(substr($s, $pos, 4), 'NULL', 4) === 0) {
                    $row[] = null;
                    $pos += 4;
                } elseif (preg_match('/\G-?[0-9]+(\.[0-9]+)?(E[+-]?[0-9]+)?/iA', $s, $m, 0, $pos)) {
                    $row[] = isset($m[1]) && $m[1] !== '' || isset($m[2]) ? (float)$m[0] : (strlen(ltrim($m[0], '-')) > 18 ? $m[0] : (int)$m[0]);
                    $pos += strlen($m[0]);
                } else {
                    throw new \RuntimeException('geçersiz değer');
                }
                $skip();
                if ($pos < $len && $s[$pos] === ',') {
                    $pos++;
                    continue;
                }
                if ($pos < $len && $s[$pos] === ')') {
                    $pos++;
                    break;
                }
                throw new \RuntimeException('beklenen , ya da )');
            }
            $rows[] = $row;
            $skip();
            if ($pos < $len && $s[$pos] === ',') {
                $pos++;
                continue;
            }
            if ($pos < $len && $s[$pos] === ';') {
                $pos++;
                $skip();
                if ($pos !== $len) {
                    throw new \RuntimeException('satır sonunda fazladan içerik');
                }
                return $rows;
            }
            throw new \RuntimeException('beklenen , ya da ;');
        }
    }

    /**
     * Dosyayı baştan sona okur. $fn verilirse her INSERT için $fn(tablo, sütunlar, satırlar) çağrılır.
     * Dönüş: ['meta' => başlık, 'tables' => [tablo => satır], 'rows' => n]. Bozuk/yarım dosya → RuntimeException (Türkçe)
     */
    public static function scan($path, ?callable $fn = null)
    {
        $fh = @gzopen($path, 'rb');
        if (!$fh) {
            throw new \RuntimeException('Yedek dosyası açılamadı.');
        }
        $meta = null;
        $end = null;
        $cur = null;
        $cols = null;
        $tables = [];
        $rows = 0;
        $ln = 0;
        try {
            while (($line = gzgets($fh)) !== false) {
                $ln++;
                $line = rtrim($line, "\r\n");
                if ($line === '') {
                    continue;
                }
                if ($meta === null) {
                    if (strncmp($line, '-- @yp-backup ', 14) === 0) {
                        $meta = json_decode(substr($line, 14), true);
                        if (!is_array($meta) || !isset($meta['v'], $meta['prefix']) || (int)$meta['v'] > self::VERSION) {
                            throw new \RuntimeException('Yedek başlığı okunamadı ya da bu sürümle uyumsuz.');
                        }
                        continue;
                    }
                    if ($ln > 5 || strncmp($line, '--', 2) !== 0) {
                        throw new \RuntimeException('Bu dosya bir yangpazar.com yedeği değil (başlık satırı yok).');
                    }
                    continue;
                }
                if ($end !== null) {
                    throw new \RuntimeException('Yedek sonu işaretinden sonra fazladan içerik var.');
                }
                if (strncmp($line, '-- @table ', 10) === 0) {
                    $p = explode(' ', substr($line, 10), 2);
                    $j = isset($p[1]) ? json_decode($p[1], true) : null;
                    if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/', $p[0]) || !is_array($j) || !isset($j['cols']) || !is_array($j['cols'])) {
                        throw new \RuntimeException('Tablo başlığı bozuk (satır ' . $ln . ').');
                    }
                    foreach ($j['cols'] as $c) {
                        if (!is_string($c) || !preg_match('/^[a-z][a-z0-9_]{0,63}$/', $c)) {
                            throw new \RuntimeException('Sütun adı geçersiz (satır ' . $ln . ').');
                        }
                    }
                    $cur = $p[0];
                    $cols = $j['cols'];
                    $tables[$cur] = 0;
                    continue;
                }
                if (strncmp($line, '-- @end-table ', 14) === 0) {
                    $p = explode(' ', substr($line, 14));
                    if ($p[0] !== $cur || !isset($p[1]) || (int)$p[1] !== $tables[$cur]) {
                        throw new \RuntimeException('Tablo satır sayısı tutmuyor: ' . $p[0] . ' (dosya eksik ya da bozuk).');
                    }
                    $cur = null;
                    continue;
                }
                if (strncmp($line, '-- @yp-end ', 11) === 0) {
                    $end = json_decode(substr($line, 11), true);
                    if (!is_array($end) || (int)$end['rows'] !== $rows || (int)$end['tables'] !== count($tables)) {
                        throw new \RuntimeException('Yedek sonu özeti tutmuyor (dosya eksik ya da bozuk).');
                    }
                    continue;
                }
                if (strncmp($line, '--', 2) === 0 || preg_match('/^SET (NAMES utf8mb4|FOREIGN_KEY_CHECKS=[01]);$/', $line)) {
                    continue;
                }
                if (preg_match('/^DELETE FROM `([a-z0-9_]+)`;$/', $line, $m)) {
                    if ($cur === null || $m[1] !== $meta['prefix'] . $cur) {
                        throw new \RuntimeException('Beklenmeyen DELETE satırı (satır ' . $ln . ').');
                    }
                    continue;
                }
                $head = 'INSERT INTO `' . $meta['prefix'] . $cur . '` (`' . implode('`,`', (array)$cols) . '`) VALUES ';
                if ($cur === null || strncmp($line, $head, strlen($head)) !== 0) {
                    throw new \RuntimeException('Yedekte tanınmayan SQL satırı var (satır ' . $ln . '); yalnız yangpazar.com yedekleri geri yüklenebilir.');
                }
                try {
                    $vals = self::parseValues($line, strlen($head));
                } catch (\RuntimeException $e) {
                    throw new \RuntimeException('Yedek satırı bozuk (satır ' . $ln . ': ' . $e->getMessage() . ').');
                }
                foreach ($vals as $r) {
                    if (count($r) !== count($cols)) {
                        throw new \RuntimeException('Sütun sayısı tutmuyor (satır ' . $ln . ').');
                    }
                }
                $tables[$cur] += count($vals);
                $rows += count($vals);
                if ($fn) {
                    $fn($cur, $cols, $vals);
                }
            }
        } finally {
            gzclose($fh);
        }
        if ($meta === null) {
            throw new \RuntimeException('Bu dosya bir yangpazar.com yedeği değil.');
        }
        if ($end === null || $cur !== null) {
            throw new \RuntimeException('Yedek dosyası eksik (sonu yok); yarım yüklenmiş ya da kesilmiş olabilir.');
        }
        return ['meta' => $meta, 'tables' => $tables, 'rows' => $rows];
    }

    /* ================= liste / dosya ================= */

    public static function path(array $row)
    {
        if (!preg_match('/^yp-[0-9]{8}-[0-9]{6}-[a-z_]+-[0-9a-f]{8}\.sql\.gz$/', (string)$row['file'])) {
            throw HttpError::notFound('Yedek dosyası bulunamadı.');
        }
        return self::dir() . '/' . $row['file'];
    }

    public static function row(Db $db, $id)
    {
        $n = is_scalar($id) && preg_match('/^(bk)?([1-9][0-9]{0,17})$/', (string)$id, $m) ? (int)$m[2] : 0;
        $r = $n ? $db->one('SELECT * FROM {backups} WHERE id=?', [$n]) : null;
        if (!$r) {
            throw HttpError::notFound('Yedek bulunamadı.');
        }
        return $r;
    }

    public static function present(Db $db, array $r, array $names = [])
    {
        $f = null;
        try {
            $f = self::path($r);
        } catch (\Throwable $e) {
        }
        return ['id' => 'bk' . (int)$r['id'], 't' => (int)$r['t'], 'kind' => $r['kind'], 'label' => isset(self::KINDS[$r['kind']]) ? self::KINDS[$r['kind']] : $r['kind'],
            'by' => $r['by_id'] ? (isset($names[(int)$r['by_id']]) ? $names[(int)$r['by_id']] : 'u' . (int)$r['by_id']) : 'Sistem (otomatik)',
            'size' => (int)$r['bytes'], 'file' => $r['file'], 'ok' => $f !== null && is_file($f), 'sha' => substr((string)$r['sha256'], 0, 12)];
    }

    public static function listAll(Db $db)
    {
        $rows = $db->all('SELECT * FROM {backups} ORDER BY t DESC, id DESC LIMIT 200');
        $ids = array_values(array_unique(array_filter(array_map(function ($r) {
            return (int)$r['by_id'];
        }, $rows))));
        $names = [];
        if ($ids) {
            foreach ($db->all('SELECT id, name, role FROM {users} WHERE id IN (' . implode(',', $ids) . ')') as $u) {
                $names[(int)$u['id']] = $u['name'] . ($u['role'] === 'admin' ? ' (yönetici)' : ' (çalışan)');
            }
        }
        return array_map(function ($r) use ($db, $names) {
            return self::present($db, $r, $names);
        }, $rows);
    }

    public static function delete(Db $db, array $row)
    {
        try {
            @unlink(self::path($row));
        } catch (\Throwable $e) {
        }
        $db->exec('DELETE FROM {backups} WHERE id=?', [(int)$row['id']]);
    }

    /** Saklama kuralları */
    public static function prune(Db $db)
    {
        $keep = ['auto' => self::settings($db)['keep'], 'pre_update' => 3, 'pre_restore' => 3];
        $n = 0;
        foreach ($keep as $k => $max) {
            foreach ($db->all('SELECT * FROM {backups} WHERE kind=? ORDER BY t DESC, id DESC LIMIT 1000 OFFSET ' . (int)$max, [$k]) as $r) {
                self::delete($db, $r);
                $n++;
            }
        }
        return $n;
    }

    /** Yüklenen dosya (.sql.gz ya da .sql): doğrulanır, gzip'li olarak yedek listesine eklenir */
    public static function upload(Db $db, $tmp, $origName, $byId)
    {
        self::long();
        try {
            $info = self::scan($tmp);
        } catch (\RuntimeException $e) {
            throw HttpError::validation(['file' => $e->getMessage()]);
        }
        $dir = self::dir();
        $name = 'yp-' . gmdate('Ymd-His', (int)floor(yp_now_ms() / 1000) + 10800) . '-upload-' . bin2hex(random_bytes(4)) . '.sql.gz';
        $abs = $dir . '/' . $name;
        $in = gzopen($tmp, 'rb');
        $out = gzopen($abs . '.part', 'wb6');
        if (!$in || !$out) {
            throw new \RuntimeException('Yüklenen yedek kaydedilemedi.');
        }
        while (!gzeof($in)) {
            gzwrite($out, gzread($in, 262144));
        }
        gzclose($in);
        gzclose($out);
        rename($abs . '.part', $abs);
        @chmod($abs, 0600);
        $id = $db->insert('backups', ['t' => yp_now_ms(), 'kind' => 'upload', 'by_id' => $byId, 'file' => $name, 'bytes' => (int)filesize($abs), 'sha256' => hash_file('sha256', $abs)]);
        Audit::log($db, $byId, 'backup_upload', 'backup', 'bk' . $id, ['orig' => yp_str(basename((string)$origName), 120), 'rows' => $info['rows'], 'app' => isset($info['meta']['app']) ? $info['meta']['app'] : '']);
        return [$db->one('SELECT * FROM {backups} WHERE id=?', [$id]), $info];
    }

    /* ================= geri yükleme ================= */

    /**
     * Yedeği geri yükler. Koşul: bakım modu açık. Sıra: dosya doğrulama → geri yükleme öncesi yedek → tablolar boşaltılıp
     * yedekteki satırlar yazılır (tek işlem) → şema/göçler → defter denetimi. Dönüş: ['log' => [...], 'check' => Ledger::check, …]
     */
    public static function restore(Db $db, array $row, array $actor)
    {
        if (!Maint::active($db)) {
            throw new HttpError(409, 'Geri yükleme yalnız bakım modunda yapılabilir. Önce Bakım modu sekmesinden bakımı açın.', 'maint_required');
        }
        self::long();
        $log = [];
        $path = self::path($row);
        if (!is_file($path)) {
            throw HttpError::notFound('Yedek dosyası diskte yok.');
        }
        if ((string)$row['sha256'] !== '' && !hash_equals((string)$row['sha256'], hash_file('sha256', $path))) {
            throw new HttpError(409, 'Yedek dosyası kayıtlı özetle (SHA-256) uyuşmuyor; dosya değişmiş ya da bozulmuş. Geri yüklenmedi.', 'backup_corrupt');
        }
        try {
            $info = self::scan($path);
        } catch (\RuntimeException $e) {
            throw new HttpError(409, 'Yedek dosyası bozuk: ' . $e->getMessage(), 'backup_corrupt');
        }
        $log[] = 'Yedek doğrulandı: ' . count($info['tables']) . ' tablo, ' . $info['rows'] . ' satır (sürüm ' . (isset($info['meta']['app']) ? $info['meta']['app'] : '?') . ').';
        $pre = self::create($db, 'pre_restore', (int)$actor['id']);
        $log[] = 'Geri yükleme öncesi yedek alındı: ' . $pre['file'];
        $keep = [];
        foreach (self::KEEP_SETTINGS as $k) {
            $keep[$k] = $db->one('SELECT * FROM {settings} WHERE k=?', [$k]);
        }
        $schema = Schema::load();
        // yedek eski bir sürümdense eksik tablolar/sütunlar önce eklenir (hiçbir şey silinmez)
        Schema::sync($db, $schema);
        $have = [];
        foreach (array_keys($schema) as $t) {
            if (!in_array($t, self::SKIP, true) && $db->tableExists($t)) {
                $have[$t] = $db->columns($t);
            }
        }
        $my = $db->dialect === 'mysql';
        $db->pdo->exec($my ? 'SET FOREIGN_KEY_CHECKS=0' : 'PRAGMA foreign_keys=OFF');
        $written = 0;
        $skipped = [];
        try {
            $db->tx(function (Db $db) use ($path, $have, &$written, &$skipped) {
                foreach (array_reverse(array_keys($have)) as $t) {
                    $db->pdo->exec('DELETE FROM `' . $db->prefix . $t . '`');
                }
                self::scan($path, function ($t, $cols, $vals) use ($db, $have, &$written, &$skipped) {
                    if (!isset($have[$t])) {
                        $skipped[$t] = true;
                        return;
                    }
                    $idx = [];
                    foreach ($cols as $i => $c) {
                        if (in_array($c, $have[$t], true)) {
                            $idx[$i] = $c;
                        }
                    }
                    if (!$idx) {
                        return;
                    }
                    $ph = '(' . implode(',', array_fill(0, count($idx), '?')) . ')';
                    foreach (array_chunk($vals, 100) as $chunk) {
                        $args = [];
                        foreach ($chunk as $r) {
                            foreach ($idx as $i => $c) {
                                $args[] = $r[$i];
                            }
                        }
                        $st = $db->pdo->prepare('INSERT INTO `' . $db->prefix . $t . '` (`' . implode('`,`', $idx) . '`) VALUES ' . implode(',', array_fill(0, count($chunk), $ph)));
                        foreach ($args as $k => $v) {
                            $st->bindValue($k + 1, $v, $v === null ? PDO::PARAM_NULL : (is_int($v) ? PDO::PARAM_INT : PDO::PARAM_STR));
                        }
                        $st->execute();
                        $written += count($chunk);
                    }
                });
                // bakım ve yedek ayarları geri yüklenen veriyle değişmez
                $db->exec('DELETE FROM {settings} WHERE k IN (' . implode(',', array_fill(0, count(self::KEEP_SETTINGS), '?')) . ')', self::KEEP_SETTINGS);
            });
        } finally {
            $db->pdo->exec($my ? 'SET FOREIGN_KEY_CHECKS=1' : 'PRAGMA foreign_keys=ON');
        }
        foreach ($keep as $k => $r) {
            if ($r) {
                $db->insert('settings', $r);
            }
        }
        $db->exec('UPDATE {cron_runs} SET lock_until=0');
        Settings::clearCache();
        $log[] = $written . ' satır geri yüklendi.' . ($skipped ? ' Bu sürümde olmayan tablolar atlandı: ' . implode(', ', array_keys($skipped)) . '.' : '');
        $done = Updater::ensure($db, true);
        $log[] = $done ? 'Şema ve göçler uygulandı (' . count($done) . ' işlem).' : 'Şema güncel.';
        $chk = Ledger::check($db);
        $log[] = $chk['ok'] ? 'Defter tutarlılık denetimi: geçti.' : 'Defter tutarlılık denetimi BAŞARISIZ: ' . implode('; ', array_slice($chk['errors'], 0, 5));
        // işlemi yapan yöneticinin oturumu açık kalsın (geri yüklenen kayıtta varsa)
        $me = $db->one('SELECT id, session_ver, status, role FROM {users} WHERE id=?', [(int)$actor['id']]);
        $relogin = !$me || $me['status'] !== 'active' || $me['role'] !== 'admin';
        if (!$relogin) {
            try {
                Auth::keepCurrent((int)$me['session_ver']);
            } catch (\Throwable $e) {
            }
        } else {
            $log[] = 'Hesabınız geri yüklenen veride yönetici değil; yeniden giriş yapmanız gerekebilir.';
        }
        Audit::log($db, (int)$actor['id'], 'backup_restore', 'backup', 'bk' . (int)$row['id'], ['file' => $row['file'], 'rows' => $written, 'pre' => $pre['file'], 'ledger' => $chk['ok']]);
        if (!$chk['ok']) {
            Log::write('hata', 'Geri yükleme sonrası defter denetimi başarısız', ['errors' => $chk['errors']]);
        }
        return ['log' => $log, 'check' => $chk, 'rows' => $written, 'pre' => 'bk' . (int)$pre['id'], 'relogin' => $relogin, 'done' => $done];
    }

    /* ================= cron ================= */

    /** Otomatik yedek zamanı geldi mi? */
    public static function due(Db $db)
    {
        $s = self::settings($db);
        $iv = self::AUTO[$s['auto']];
        if (!$iv) {
            return false;
        }
        $last = (int)$db->val("SELECT MAX(t) FROM {backups} WHERE kind='auto'");
        return yp_now_ms() - $last >= $iv - 300000; // 5 dk tolerans (cron aralığı)
    }

    public static function lastAt(Db $db)
    {
        return (int)$db->val('SELECT MAX(t) FROM {backups}');
    }
}
