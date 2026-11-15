<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Dış servis sahteleri (YALNIZ test): YP_TEST=1 ortam değişkeni VE SQLite veritabanı birlikte varsa storage/test_mock.json okunur
 * (ör. {"nvi":"ok"|"fail"|"down", "acct":"ok"|"down", "paytr":"ok"|"down"}). Canlı sitede (MySQL, YP_TEST yok) her zaman null döner
 * ve gerçek servis çağrılır. HTTP testleri sunucuyu yeniden başlatmadan dosyayı değiştirerek senaryo değiştirir.
 */
final class TestMock
{
    public static function get($k)
    {
        if (!yp_test_mode() || !Db::hasMain() || Db::main()->dialect !== 'sqlite') {
            return null;
        }
        $f = YP_STORAGE . '/test_mock.json';
        clearstatcache(true, $f);
        $j = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        return is_array($j) && isset($j[$k]) && is_string($j[$k]) ? $j[$k] : null;
    }
}
