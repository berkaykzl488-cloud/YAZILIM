<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Kurulu sitede otomatik veritabanı güncellemesi. Sahip yeni paketi (zip/FTP) yükleyince ilk istekte:
 *   - app/schema ve app/migrations dosyalarının imzası (ad+boyut+tarih) storage/cache/schema_ver.txt ile karşılaştırılır
 *     (veritabanına gitmeden, yalnız stat çağrıları);
 *   - farklıysa dosya kilidi (storage/cache/migrate.lock) alınır, Schema::install (eksik tablo/sütun/dizin + göçler) çalışır,
 *     sonuç storage/log ve audit_log'a yazılır, imza kaydedilir. Hiçbir tablo/sütun silinmez.
 *   - Aynı anda gelen diğer istekler kilidi en çok 15 sn bekler; bekleyemezse "güncelleniyor" (503) döner.
 *   - Hata olursa site çalışmaya devam eder; 5 dakika sonra yeniden denenir.
 * Elle tetikleme: POST admin/system/update [bakim] ("Güncellemeleri uygula").
 */
final class Updater
{
    const RETRY_MS = 300000;

    public static function dir()
    {
        return YP_STORAGE . '/cache';
    }

    /** Kod tarafındaki şema/göç imzası */
    public static function codeVersion()
    {
        $parts = [];
        foreach (array_merge(glob(YP_APP . '/schema/[0-9][0-9]_*.php') ?: [], glob(YP_APP . '/migrations/[0-9][0-9][0-9][0-9]_*.php') ?: []) as $f) {
            $parts[] = basename(dirname($f)) . '/' . basename($f) . ':' . (int)@filesize($f) . ':' . (int)@filemtime($f);
        }
        sort($parts, SORT_STRING);
        return substr(sha1(implode('|', $parts) . '|' . YP_APP_VERSION), 0, 20);
    }

    public static function marker()
    {
        $raw = @file_get_contents(self::dir() . '/schema_ver.txt');
        return $raw === false ? '' : trim($raw);
    }

    private static function writeMarker($v)
    {
        try {
            yp_ensure_dir(self::dir());
            yp_write_atomic(self::dir() . '/schema_ver.txt', $v . "\n");
        } catch (\Throwable $e) {
            Log::write('hata', 'Şema imzası yazılamadı: ' . $e->getMessage());
        }
    }

    /** Her istekte çağrılır; güncel ise yalnız bir dosya okur. Dönüş: yapılan işlemler (güncelse []) */
    public static function ensure(Db $db, $force = false)
    {
        $ver = self::codeVersion();
        $m = self::marker();
        if (!$force) {
            if ($m === $ver) {
                return [];
            }
            if (preg_match('/^fail:([0-9a-f]+):([0-9]+)$/', $m, $x) && $x[1] === $ver && yp_now_ms() - (int)$x[2] < self::RETRY_MS) {
                return [];
            }
        }
        yp_ensure_dir(self::dir());
        $fh = @fopen(self::dir() . '/migrate.lock', 'c');
        if (!$fh) {
            Log::write('hata', 'Güncelleme kilidi açılamadı (storage/cache yazılabilir değil).');
            return [];
        }
        $got = false;
        $until = microtime(true) + 15;
        while (!($got = flock($fh, LOCK_EX | LOCK_NB)) && microtime(true) < $until) {
            usleep(200000);
        }
        if (!$got) {
            fclose($fh);
            throw new HttpError(503, 'Site şu an güncelleniyor. Lütfen birkaç saniye sonra tekrar deneyin.', 'updating', [], ['Retry-After' => '10']);
        }
        try {
            if (!$force && self::marker() === $ver) {
                return []; // başka bir istek biz beklerken bitirdi
            }
            $t0 = microtime(true);
            try {
                $done = Schema::install($db);
            } catch (\Throwable $e) {
                self::writeMarker('fail:' . $ver . ':' . yp_now_ms());
                Log::write('hata', 'Veritabanı güncellemesi başarısız: ' . get_class($e) . ': ' . $e->getMessage());
                if ($force) {
                    throw $e;
                }
                return [];
            }
            self::writeMarker($ver);
            if ($done) {
                $ms = (int)round((microtime(true) - $t0) * 1000);
                Log::write('bilgi', 'Veritabanı güncellendi (' . $ms . ' ms): ' . implode('; ', $done));
                Audit::log($db, null, 'schema_update', 'system', $ver, ['done' => $done, 'ms' => $ms, 'app' => YP_APP_VERSION]);
            }
            return $done;
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }

    /** Yönetim › Bakım: durum */
    public static function status(Db $db)
    {
        $rows = $db->all('SELECT version, applied_at FROM {schema_migrations} ORDER BY applied_at DESC, version');
        return [
            'app' => YP_APP_VERSION, 'code' => self::codeVersion(), 'marker' => self::marker(),
            'upToDate' => self::marker() === self::codeVersion(),
            'migrations' => array_map(function ($r) {
                return ['v' => $r['version'], 't' => (int)$r['applied_at']];
            }, $rows),
            'db' => $db->serverInfo(),
        ];
    }
}
