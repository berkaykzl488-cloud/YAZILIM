<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Dosya tabanlı kayan pencere hız sınırı (api/_lib.php yp_rl ile aynı algoritma), storage/rl altında.
 * Anahtar serbesttir: 'login_ip:1.2.3.4', 'login_acc:42', 'tfa_h:42' …
 */
final class RateLimit
{
    private static function file($key)
    {
        return YP_STORAGE . '/rl/' . hash('sha256', $key) . '.json';
    }

    /** Dönüş: ['allowed'=>bool, 'retry'=>saniye, 'count'=>int] */
    public static function hit($key, $limit, $window, $add = true)
    {
        yp_ensure_dir(YP_STORAGE . '/rl');
        if (mt_rand(1, 200) === 1) {
            self::gc();
        }
        $fh = @fopen(self::file($key), 'c+');
        if (!$fh) {
            return ['allowed' => true, 'retry' => 0, 'count' => 0];
        }
        flock($fh, LOCK_EX);
        rewind($fh);
        $d = json_decode((string)stream_get_contents($fh), true);
        $now = time();
        $hits = [];
        if (is_array($d)) {
            foreach ($d as $t) {
                if (is_int($t) && $t > $now - $window) {
                    $hits[] = $t;
                }
            }
        }
        $allowed = count($hits) < $limit;
        if ($add && $allowed) {
            $hits[] = $now;
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($hits));
        flock($fh, LOCK_UN);
        fclose($fh);
        $retry = $allowed || !$hits ? 0 : max(1, min($hits) + $window - $now);
        return ['allowed' => $allowed, 'retry' => $retry, 'count' => count($hits)];
    }

    public static function enforce($key, $limit, $window, $add = true, $msg = null)
    {
        $r = self::hit($key, $limit, $window, $add);
        if (!$r['allowed']) {
            $min = max(1, (int)ceil($r['retry'] / 60));
            throw new HttpError(429, $msg ?: ('Çok fazla deneme yapıldı. Lütfen ' . ($r['retry'] < 60 ? $r['retry'] . ' saniye' : $min . ' dakika') . ' sonra tekrar deneyin.'),
                'rate_limit', ['retry_after' => $r['retry']], ['Retry-After' => (string)$r['retry']]);
        }
        return $r;
    }

    public static function add($key, $window)
    {
        return self::hit($key, PHP_INT_MAX, $window, true);
    }

    public static function reset($key)
    {
        @unlink(self::file($key));
    }

    public static function gc()
    {
        foreach ((array)@glob(YP_STORAGE . '/rl/*.json') as $f) {
            if ($f && @filemtime($f) < time() - 86400) {
                @unlink($f);
            }
        }
    }
}
