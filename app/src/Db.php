<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use PDO;
use PDOException;
use PDOStatement;
use RuntimeException;

/**
 * PDO sarmalayıcı. Lehçe: 'mysql' (MariaDB/MySQL, canlı) ya da 'sqlite' (testler).
 * SQL içinde tablo adları {tablo} biçiminde yazılır; önek (yp_) burada eklenir.
 * Lehçe farkları YALNIZ bu sınıftadır.
 */
final class Db
{
    /** @var PDO */
    public $pdo;
    /** @var string */
    public $dialect;
    /** @var string */
    public $prefix;
    /** @var string */
    public $version = '';
    private $depth = 0;

    /** @var Db|null */
    private static $main = null;

    public function __construct(PDO $pdo, $dialect, $prefix = 'yp_')
    {
        if (!in_array($dialect, ['mysql', 'sqlite'], true)) {
            throw new RuntimeException('Desteklenmeyen veritabanı türü.');
        }
        if (!preg_match('/^[a-z0-9_]{0,20}$/', $prefix)) {
            throw new RuntimeException('Geçersiz tablo öneki.');
        }
        $this->pdo = $pdo;
        $this->dialect = $dialect;
        $this->prefix = $prefix;
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        if ($dialect === 'mysql') {
            $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo->exec("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
            $pdo->exec("SET time_zone='+03:00'");
            $this->version = (string)$pdo->query('SELECT VERSION()')->fetchColumn();
        } else {
            $pdo->exec('PRAGMA foreign_keys=ON');
            $pdo->exec('PRAGMA busy_timeout=8000');
            $this->version = (string)$pdo->query('SELECT sqlite_version()')->fetchColumn();
        }
    }

    /**
     * $cfg: driver(mysql|sqlite), host, port, name, user, pass, prefix | sqlite: path (':memory:' olabilir)
     */
    public static function connect(array $cfg)
    {
        $driver = isset($cfg['driver']) ? $cfg['driver'] : 'mysql';
        $prefix = isset($cfg['prefix']) ? (string)$cfg['prefix'] : 'yp_';
        $opt = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 8];
        if ($driver === 'sqlite') {
            $path = isset($cfg['path']) ? (string)$cfg['path'] : ':memory:';
            $pdo = new PDO('sqlite:' . $path, null, null, $opt);
            if ($path !== ':memory:') {
                $pdo->exec('PRAGMA journal_mode=WAL');
            }
            return new Db($pdo, 'sqlite', $prefix);
        }
        if ($driver !== 'mysql') {
            throw new RuntimeException('Desteklenmeyen veritabanı türü.');
        }
        $host = isset($cfg['host']) && $cfg['host'] !== '' ? (string)$cfg['host'] : 'localhost';
        $port = isset($cfg['port']) ? (int)$cfg['port'] : 3306;
        $dsn = 'mysql:host=' . $host . ';port=' . ($port ?: 3306) . ';dbname=' . (string)$cfg['name'] . ';charset=utf8mb4';
        $opt[PDO::ATTR_EMULATE_PREPARES] = false;
        $opt[PDO::MYSQL_ATTR_FOUND_ROWS] = true;
        $pdo = new PDO($dsn, (string)$cfg['user'], (string)$cfg['pass'], $opt);
        return new Db($pdo, 'mysql', $prefix);
    }

    public static function setMain(?Db $db = null)
    {
        self::$main = $db;
    }

    /** @return Db */
    public static function main()
    {
        if (!self::$main) {
            throw new RuntimeException('Veritabanı bağlantısı yok.');
        }
        return self::$main;
    }

    public static function hasMain()
    {
        return self::$main !== null;
    }

    /* ---------------------------------------------------------------- */

    /** {tablo} → `yp_tablo` */
    public function sql($sql)
    {
        $p = $this->prefix;
        return preg_replace_callback('/\{([a-z][a-z0-9_]*)\}/', function ($m) use ($p) {
            return '`' . $p . $m[1] . '`';
        }, $sql);
    }

    public function table($name)
    {
        return '`' . $this->prefix . $name . '`';
    }

    /** @return PDOStatement */
    public function q($sql, array $params = [])
    {
        $st = $this->pdo->prepare($this->sql($sql));
        $i = 0;
        foreach ($params as $k => $v) {
            $key = is_int($k) ? ++$i : (strpos($k, ':') === 0 ? $k : ':' . $k);
            if (is_int($v)) {
                $st->bindValue($key, $v, PDO::PARAM_INT);
            } elseif (is_bool($v)) {
                $st->bindValue($key, $v ? 1 : 0, PDO::PARAM_INT);
            } elseif ($v === null) {
                $st->bindValue($key, null, PDO::PARAM_NULL);
            } else {
                $st->bindValue($key, (string)$v, PDO::PARAM_STR);
            }
        }
        $st->execute();
        return $st;
    }

    public function one($sql, array $params = [])
    {
        $r = $this->q($sql, $params)->fetch();
        return $r === false ? null : $r;
    }

    public function all($sql, array $params = [])
    {
        return $this->q($sql, $params)->fetchAll();
    }

    public function val($sql, array $params = [])
    {
        $v = $this->q($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    /** Etkilenen satır sayısı */
    public function exec($sql, array $params = [])
    {
        return $this->q($sql, $params)->rowCount();
    }

    public function insert($table, array $row)
    {
        $cols = array_keys($row);
        foreach ($cols as $c) {
            self::checkIdent($c);
        }
        $sql = 'INSERT INTO {' . $table . '} (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
        $this->q($sql, array_values($row));
        return (int)$this->pdo->lastInsertId();
    }

    /** UPDATE {table} SET … WHERE $where ($where içinde ? yer tutucuları) */
    public function update($table, array $set, $where, array $whereParams = [])
    {
        $parts = [];
        foreach (array_keys($set) as $c) {
            self::checkIdent($c);
            $parts[] = '`' . $c . '`=?';
        }
        return $this->exec('UPDATE {' . $table . '} SET ' . implode(',', $parts) . ' WHERE ' . $where,
            array_merge(array_values($set), $whereParams));
    }

    /**
     * Ekle ya da güncelle. $keys: benzersiz anahtar sütunları. $updateCols null ise anahtar dışı tüm sütunlar.
     */
    public function upsert($table, array $row, array $keys, ?array $updateCols = null)
    {
        $cols = array_keys($row);
        foreach ($cols as $c) {
            self::checkIdent($c);
        }
        if ($updateCols === null) {
            $updateCols = array_values(array_diff($cols, $keys));
        }
        $sql = 'INSERT INTO {' . $table . '} (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
        if ($this->dialect === 'mysql') {
            $u = [];
            foreach ($updateCols as $c) {
                $u[] = '`' . $c . '`=VALUES(`' . $c . '`)';
            }
            $sql .= $u ? ' ON DUPLICATE KEY UPDATE ' . implode(',', $u) : ' ON DUPLICATE KEY UPDATE `' . $keys[0] . '`=`' . $keys[0] . '`';
        } else {
            $u = [];
            foreach ($updateCols as $c) {
                $u[] = '`' . $c . '`=excluded.`' . $c . '`';
            }
            $sql .= ' ON CONFLICT(`' . implode('`,`', $keys) . '`) DO ' . ($u ? 'UPDATE SET ' . implode(',', $u) : 'NOTHING');
        }
        return $this->exec($sql, array_values($row));
    }

    /** INSERT, varsa sessizce atla. Eklendiyse true. */
    public function insertIgnore($table, array $row)
    {
        $cols = array_keys($row);
        foreach ($cols as $c) {
            self::checkIdent($c);
        }
        $verb = $this->dialect === 'mysql' ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
        $sql = $verb . ' INTO {' . $table . '} (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
        return $this->exec($sql, array_values($row)) > 0;
    }

    /* ---- kilitler ---- */

    public function forUpdate()
    {
        return $this->dialect === 'mysql' ? ' FOR UPDATE' : '';
    }

    public function supportsSkipLocked()
    {
        if ($this->dialect !== 'mysql') {
            return false;
        }
        $v = strtolower($this->version);
        if (!preg_match('/^(\d+)\.(\d+)/', $v, $m)) {
            return false;
        }
        $maj = (int)$m[1];
        $min = (int)$m[2];
        if (strpos($v, 'mariadb') !== false) {
            return $maj > 10 || ($maj === 10 && $min >= 6);
        }
        return $maj >= 8;
    }

    public function skipLocked()
    {
        if ($this->dialect !== 'mysql') {
            return '';
        }
        return $this->supportsSkipLocked() ? ' FOR UPDATE SKIP LOCKED' : ' FOR UPDATE';
    }

    /** Büyük/küçük harf duyarsız LIKE (her iki lehçede) */
    public function like()
    {
        return 'LIKE';
    }

    /* ---- işlem (transaction) ---- */

    /**
     * $fn($db) bir işlem içinde çalışır. Kilitlenme (MySQL 1213/1205, SQLite BUSY) olursa 3 kez yeniden dener.
     * İç içe çağrılar dıştaki işleme katılır.
     */
    public function tx(callable $fn)
    {
        if ($this->depth > 0) {
            $this->depth++;
            try {
                return $fn($this);
            } finally {
                $this->depth--;
            }
        }
        $attempt = 0;
        while (true) {
            $attempt++;
            $this->begin();
            $this->depth = 1;
            try {
                $r = $fn($this);
                $this->depth = 0;
                $this->commit();
                return $r;
            } catch (\Throwable $e) {
                $this->depth = 0;
                $this->rollback();
                if ($attempt < 3 && $e instanceof PDOException && $this->isRetryable($e)) {
                    usleep(20000 * $attempt + random_int(0, 20000));
                    continue;
                }
                throw $e;
            }
        }
    }

    public function inTx()
    {
        return $this->depth > 0;
    }

    private function begin()
    {
        if ($this->dialect === 'sqlite') {
            $this->pdo->exec('BEGIN IMMEDIATE');
        } else {
            $this->pdo->beginTransaction();
        }
    }

    private function commit()
    {
        if ($this->dialect === 'sqlite') {
            $this->pdo->exec('COMMIT');
        } else {
            $this->pdo->commit();
        }
    }

    private function rollback()
    {
        try {
            if ($this->dialect === 'sqlite') {
                $this->pdo->exec('ROLLBACK');
            } elseif ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
        } catch (\Throwable $e) {
            // bağlantı koptuysa geri alınacak bir şey yok
        }
    }

    public function isRetryable(PDOException $e)
    {
        $info = $e->errorInfo;
        $code = is_array($info) && isset($info[1]) ? (int)$info[1] : 0;
        if ($this->dialect === 'mysql') {
            return in_array($code, [1213, 1205], true);
        }
        return in_array($code, [5, 6], true); // SQLITE_BUSY, SQLITE_LOCKED
    }

    /** Benzersiz anahtar ihlali mi? */
    public function isDuplicate(PDOException $e)
    {
        $info = $e->errorInfo;
        if ($this->dialect === 'mysql') {
            return is_array($info) && isset($info[1]) && (int)$info[1] === 1062;
        }
        return is_array($info) && isset($info[1]) && (int)$info[1] === 19 && stripos((string)$e->getMessage(), 'UNIQUE') !== false;
    }

    public static function checkIdent($c)
    {
        if (!preg_match('/^[a-z][a-z0-9_]{0,63}$/', (string)$c)) {
            throw new RuntimeException('Geçersiz sütun adı.');
        }
    }

    /* ---- şema keşfi ---- */

    public function tableExists($name)
    {
        $t = $this->prefix . $name;
        if ($this->dialect === 'mysql') {
            return (bool)$this->val('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [$t]);
        }
        return (bool)$this->val("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", [$t]);
    }

    public function columns($name)
    {
        $t = $this->prefix . $name;
        if ($this->dialect === 'mysql') {
            return array_map('strtolower', array_column($this->all('SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [$t]), 'c'));
        }
        self::checkIdent($t);
        return array_map('strtolower', array_column($this->pdo->query('PRAGMA table_info(`' . $t . '`)')->fetchAll(PDO::FETCH_ASSOC), 'name'));
    }

    public function indexes($name)
    {
        $t = $this->prefix . $name;
        if ($this->dialect === 'mysql') {
            return array_values(array_unique(array_column($this->all('SELECT INDEX_NAME AS i FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [$t]), 'i')));
        }
        self::checkIdent($t);
        return array_column($this->pdo->query('PRAGMA index_list(`' . $t . '`)')->fetchAll(PDO::FETCH_ASSOC), 'name');
    }

    /**
     * Veritabanının varsayılan karakter setini utf8mb4 yapar (sunucu varsayılanı latin1 olabilir).
     * Yetki yoksa sessizce geçer; tablolar zaten CREATE TABLE … DEFAULT CHARSET=utf8mb4 ile açılır.
     * Dönüş: true (değişti/zaten utf8mb4) | false (yetki yok ya da başarısız)
     */
    public function ensureUtf8mb4Database()
    {
        if ($this->dialect !== 'mysql') {
            return true;
        }
        try {
            $name = (string)$this->pdo->query('SELECT DATABASE()')->fetchColumn();
            if ($name === '' || !preg_match('/^[A-Za-z0-9_$]{1,64}$/', $name)) {
                return false;
            }
            $cs = strtolower((string)$this->pdo->query('SELECT @@character_set_database')->fetchColumn());
            $co = strtolower((string)$this->pdo->query('SELECT @@collation_database')->fetchColumn());
            if ($cs === 'utf8mb4' && $co === 'utf8mb4_unicode_ci') {
                return true;
            }
            $this->pdo->exec('ALTER DATABASE `' . $name . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public function serverInfo()
    {
        $info = ['dialect' => $this->dialect, 'version' => $this->version, 'charset' => '', 'skip_locked' => $this->supportsSkipLocked()];
        if ($this->dialect === 'mysql') {
            try {
                $info['charset'] = (string)$this->pdo->query('SELECT @@character_set_database')->fetchColumn()
                    . ' / ' . (string)$this->pdo->query('SELECT @@collation_database')->fetchColumn();
                $info['server_charset'] = (string)$this->pdo->query('SELECT @@character_set_server')->fetchColumn();
                $info['connection_charset'] = (string)$this->pdo->query('SELECT @@character_set_connection')->fetchColumn();
            } catch (\Throwable $e) {
            }
        } else {
            $info['charset'] = 'UTF-8';
        }
        return $info;
    }
}
