<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use RuntimeException;

/**
 * Şema: app/schema/NN_alan.php dosyaları PHP dizisi döndürür; buradan iki lehçe için DDL üretilir.
 *
 * Sütun tanımı: 'tür[:argümanlar][?][=varsayılan]'
 *   pk                 otomatik artan BIGINT birincil anahtar
 *   ref                BIGINT (başka tabloya kimlik)
 *   int | bigint | tinyint | bool
 *   str:N | char:N     VARCHAR(N) / CHAR(N)  (dizinlenecekse N ≤ 190)
 *   text | mediumtext
 *   dec:P,S            DECIMAL(P,S)
 *   enum:a,b,c         MySQL ENUM; SQLite TEXT + CHECK
 *   ?                  NULL olabilir (varsayılan NULL)
 *   =x                 varsayılan değer (sayı ya da metin)
 * Tablo anahtarları: cols, pk (bileşik), unique, index, fk => [sütun => [tablo, sütun, 'CASCADE'|'SET NULL']]
 *
 * Göçler (migrations): app/migrations/NNNN_ad.php → function (Db $db) {…}; schema_migrations tablosunda izlenir.
 */
final class Schema
{
    /** Tüm şema dosyalarını sırayla birleştirir. */
    public static function load($dir = null)
    {
        $dir = $dir ?: YP_APP . '/schema';
        $files = glob($dir . '/[0-9][0-9]_*.php') ?: [];
        sort($files, SORT_STRING);
        $all = [];
        foreach ($files as $f) {
            $part = require $f;
            if (!is_array($part)) {
                throw new RuntimeException('Şema dosyası dizi döndürmüyor: ' . basename($f));
            }
            foreach ($part as $t => $def) {
                if (isset($all[$t])) {
                    throw new RuntimeException('Tablo iki kez tanımlanmış: ' . $t);
                }
                $all[$t] = $def;
            }
        }
        return $all;
    }

    public static function parseCol($spec)
    {
        $c = ['type' => '', 'args' => [], 'null' => false, 'default' => null, 'has_default' => false];
        $s = (string)$spec;
        $eq = strpos($s, '=');
        if ($eq !== false) {
            $c['has_default'] = true;
            $c['default'] = substr($s, $eq + 1);
            $s = substr($s, 0, $eq);
        }
        if (substr($s, -1) === '?') {
            $c['null'] = true;
            $s = substr($s, 0, -1);
        }
        $colon = strpos($s, ':');
        if ($colon !== false) {
            $c['type'] = substr($s, 0, $colon);
            $c['args'] = explode(',', substr($s, $colon + 1));
        } else {
            $c['type'] = $s;
        }
        $known = ['pk', 'ref', 'int', 'bigint', 'tinyint', 'bool', 'str', 'char', 'text', 'mediumtext', 'dec', 'enum'];
        if (!in_array($c['type'], $known, true)) {
            throw new RuntimeException('Bilinmeyen sütun türü: ' . $spec);
        }
        return $c;
    }

    private static function quoteDefault($v, $type)
    {
        if (in_array($type, ['int', 'bigint', 'tinyint', 'bool', 'ref', 'dec'], true)) {
            if (!preg_match('/^-?[0-9]+(\.[0-9]+)?$/', $v)) {
                throw new RuntimeException('Sayısal varsayılan değer geçersiz: ' . $v);
            }
            return $v;
        }
        return "'" . str_replace("'", "''", $v) . "'";
    }

    public static function colDdl($dialect, $name, $spec)
    {
        Db::checkIdent($name);
        $c = self::parseCol($spec);
        $q = '`' . $name . '`';
        $my = $dialect === 'mysql';
        switch ($c['type']) {
            case 'pk':
                return $q . ($my ? ' BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY' : ' INTEGER PRIMARY KEY AUTOINCREMENT');
            case 'ref':
            case 'bigint':
                $t = $my ? 'BIGINT' : 'INTEGER';
                break;
            case 'int':
                $t = $my ? 'INT' : 'INTEGER';
                break;
            case 'tinyint':
            case 'bool':
                $t = $my ? 'TINYINT' : 'INTEGER';
                break;
            case 'str':
                $t = $my ? 'VARCHAR(' . (int)$c['args'][0] . ')' : 'TEXT';
                break;
            case 'char':
                $t = $my ? 'CHAR(' . (int)$c['args'][0] . ')' : 'TEXT';
                break;
            case 'text':
                $t = 'TEXT';
                break;
            case 'mediumtext':
                $t = $my ? 'MEDIUMTEXT' : 'TEXT';
                break;
            case 'dec':
                $t = $my ? 'DECIMAL(' . (int)$c['args'][0] . ',' . (int)(isset($c['args'][1]) ? $c['args'][1] : 0) . ')' : 'NUMERIC';
                break;
            case 'enum':
                $vals = array_map(function ($v) {
                    if (!preg_match('/^[\p{L}0-9_]*$/u', $v)) {
                        throw new RuntimeException('Geçersiz enum değeri: ' . $v);
                    }
                    return "'" . $v . "'";
                }, $c['args']);
                $t = $my ? 'ENUM(' . implode(',', $vals) . ')' : 'TEXT';
                break;
            default:
                throw new RuntimeException('Bilinmeyen tür');
        }
        $out = $q . ' ' . $t . ($c['null'] ? ' NULL' : ' NOT NULL');
        if ($c['has_default']) {
            $out .= ' DEFAULT ' . self::quoteDefault($c['default'], $c['type']);
        } elseif ($c['null']) {
            $out .= ' DEFAULT NULL';
        }
        if ($c['type'] === 'enum' && !$my) {
            $out .= ' CHECK (' . $q . ' IN (' . implode(',', array_map(function ($v) {
                return "'" . $v . "'";
            }, $c['args'])) . ')' . ($c['null'] ? ' OR ' . $q . ' IS NULL' : '') . ')';
        }
        return $out;
    }

    public static function indexName($prefix, $table, array $cols, $unique)
    {
        $n = $prefix . $table . '__' . ($unique ? 'uq_' : 'ix_') . implode('_', $cols);
        if (strlen($n) > 64) {
            $n = substr($n, 0, 55) . '_' . substr(sha1($n), 0, 8);
        }
        return $n;
    }

    /** Tek tablo için CREATE TABLE + CREATE INDEX ifadeleri */
    public static function tableDdl($dialect, $prefix, $table, array $def)
    {
        Db::checkIdent($table);
        $my = $dialect === 'mysql';
        $lines = [];
        foreach ($def['cols'] as $col => $spec) {
            $lines[] = '  ' . self::colDdl($dialect, $col, $spec);
        }
        if (!empty($def['pk'])) {
            $lines[] = '  PRIMARY KEY (`' . implode('`,`', $def['pk']) . '`)';
        }
        $inline = [];
        if ($my) {
            foreach (isset($def['unique']) ? $def['unique'] : [] as $cols) {
                $inline[] = '  UNIQUE KEY `' . self::indexName($prefix, $table, $cols, true) . '` (`' . implode('`,`', $cols) . '`)';
            }
            foreach (isset($def['index']) ? $def['index'] : [] as $cols) {
                $inline[] = '  KEY `' . self::indexName($prefix, $table, $cols, false) . '` (`' . implode('`,`', $cols) . '`)';
            }
            foreach (isset($def['fulltext']) ? $def['fulltext'] : [] as $cols) {
                $inline[] = '  FULLTEXT KEY `' . self::indexName($prefix, $table, $cols, false) . '_ft` (`' . implode('`,`', $cols) . '`)';
            }
        }
        foreach (isset($def['fk']) ? $def['fk'] : [] as $col => $ref) {
            $on = isset($ref[2]) ? strtoupper($ref[2]) : 'CASCADE';
            if (!in_array($on, ['CASCADE', 'SET NULL', 'RESTRICT'], true)) {
                throw new RuntimeException('Geçersiz FK davranışı');
            }
            $fkName = $my ? 'CONSTRAINT `' . substr($prefix . $table . '__fk_' . $col, 0, 64) . '` ' : '';
            $inline[] = '  ' . $fkName . 'FOREIGN KEY (`' . $col . '`) REFERENCES `' . $prefix . $ref[0] . '` (`' . $ref[1] . '`) ON DELETE ' . $on;
        }
        $sql = 'CREATE TABLE IF NOT EXISTS `' . $prefix . $table . "` (\n" . implode(",\n", array_merge($lines, $inline)) . "\n)";
        if ($my) {
            $sql .= ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        }
        $out = [$sql];
        if (!$my) {
            foreach (isset($def['unique']) ? $def['unique'] : [] as $cols) {
                $out[] = 'CREATE UNIQUE INDEX IF NOT EXISTS `' . self::indexName($prefix, $table, $cols, true) . '` ON `' . $prefix . $table . '` (`' . implode('`,`', $cols) . '`)';
            }
            foreach (isset($def['index']) ? $def['index'] : [] as $cols) {
                $out[] = 'CREATE INDEX IF NOT EXISTS `' . self::indexName($prefix, $table, $cols, false) . '` ON `' . $prefix . $table . '` (`' . implode('`,`', $cols) . '`)';
            }
        }
        return $out;
    }

    /** Tüm şemanın DDL'i (veritabanı gerekmez; testler ve inceleme için). */
    public static function ddl($dialect, $prefix = 'yp_', ?array $schema = null)
    {
        $schema = $schema ?: self::load();
        $out = [];
        foreach ($schema as $t => $def) {
            $out = array_merge($out, self::tableDdl($dialect, $prefix, $t, $def));
        }
        return $out;
    }

    /**
     * Veritabanını şemaya getirir: eksik tabloları oluşturur, eksik sütun ve dizinleri ekler.
     * Hiçbir şeyi silmez. Dönüş: yapılan işlemler listesi.
     */
    public static function sync(Db $db, ?array $schema = null)
    {
        $schema = $schema ?: self::load();
        $done = [];
        foreach ($schema as $t => $def) {
            if (!$db->tableExists($t)) {
                foreach (self::tableDdl($db->dialect, $db->prefix, $t, $def) as $stmt) {
                    $db->pdo->exec($stmt);
                }
                $done[] = 'tablo oluşturuldu: ' . $db->prefix . $t;
                continue;
            }
            $have = $db->columns($t);
            foreach ($def['cols'] as $col => $spec) {
                if (in_array(strtolower($col), $have, true)) {
                    continue;
                }
                $c = self::parseCol($spec);
                if ($c['type'] === 'pk') {
                    throw new RuntimeException($t . '.' . $col . ': birincil anahtar sonradan eklenemez.');
                }
                if (!$c['null'] && !$c['has_default']) {
                    throw new RuntimeException($t . '.' . $col . ': sonradan eklenen sütun NULL olabilmeli ya da varsayılan değeri olmalı.');
                }
                $ddl = self::colDdl($db->dialect, $col, $spec);
                $db->pdo->exec('ALTER TABLE `' . $db->prefix . $t . '` ADD COLUMN ' . $ddl);
                $done[] = 'sütun eklendi: ' . $db->prefix . $t . '.' . $col;
            }
            $idx = $db->indexes($t);
            foreach (['unique' => true, 'index' => false] as $k => $uq) {
                foreach (isset($def[$k]) ? $def[$k] : [] as $cols) {
                    $name = self::indexName($db->prefix, $t, $cols, $uq);
                    if (in_array($name, $idx, true)) {
                        continue;
                    }
                    if ($db->dialect === 'mysql') {
                        $db->pdo->exec('ALTER TABLE `' . $db->prefix . $t . '` ADD ' . ($uq ? 'UNIQUE ' : '') . 'INDEX `' . $name . '` (`' . implode('`,`', $cols) . '`)');
                    } else {
                        $db->pdo->exec('CREATE ' . ($uq ? 'UNIQUE ' : '') . 'INDEX IF NOT EXISTS `' . $name . '` ON `' . $db->prefix . $t . '` (`' . implode('`,`', $cols) . '`)');
                    }
                    $done[] = 'dizin eklendi: ' . $name;
                }
            }
        }
        if ($db->tableExists('schema_migrations')) {
            $ver = 'schema:' . substr(sha1(json_encode($schema)), 0, 16);
            $db->insertIgnore('schema_migrations', ['version' => $ver, 'applied_at' => yp_now_ms()]);
        }
        return $done;
    }

    /** Uygulanmamış göçleri sırayla çalıştırır. */
    public static function migrate(Db $db, $dir = null)
    {
        $dir = $dir ?: YP_APP . '/migrations';
        $files = glob($dir . '/[0-9][0-9][0-9][0-9]_*.php') ?: [];
        sort($files, SORT_STRING);
        $applied = array_column($db->all('SELECT version FROM {schema_migrations}'), 'version');
        $ran = [];
        foreach ($files as $f) {
            $ver = 'm:' . basename($f, '.php');
            if (in_array($ver, $applied, true)) {
                continue;
            }
            $fn = require $f;
            if (!is_callable($fn)) {
                throw new RuntimeException('Göç dosyası bir fonksiyon döndürmüyor: ' . basename($f));
            }
            $db->tx(function (Db $db) use ($fn, $ver) {
                $fn($db);
                $db->insert('schema_migrations', ['version' => $ver, 'applied_at' => yp_now_ms()]);
            });
            $ran[] = $ver;
        }
        return $ran;
    }

    /** Kurulum/güncelleme: şema + göçler */
    public static function install(Db $db)
    {
        $a = self::sync($db);
        $b = self::migrate($db);
        return array_merge($a, array_map(function ($v) {
            return 'göç uygulandı: ' . $v;
        }, $b));
    }
}
