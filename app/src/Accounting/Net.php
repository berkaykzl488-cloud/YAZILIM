<?php
namespace YP\Accounting;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\TestMock;

/**
 * Muhasebe servisleri için HTTP katmanı: varsayılan yp_http (api/_lib.php). Testler:
 *   Net::$fn = function($method, $url, $opts) { return ['ok'=>…,'code'=>…,'body'=>…,'json'=>…,'error'=>…]; };
 *   ya da storage/test_mock.json {"acct":"down"} (YALNIZ YP_TEST=1 + SQLite): servis "ulaşılamıyor" gibi davranır;
 *   {"acct":"ok"}: başarılı sahte yanıtlar (dış servise gidilmez).
 */
final class Net
{
    /** @var callable|null */
    public static $fn = null;

    public static function http($method, $url, array $o = [])
    {
        if (self::$fn) {
            return call_user_func(self::$fn, $method, $url, $o);
        }
        $m = TestMock::get('acct');
        if ($m === 'down') {
            return ['ok' => false, 'code' => 0, 'body' => '', 'json' => null, 'error' => 'Bağlantı kurulamadı (sunucu yanıt vermiyor).'];
        }
        if ($m === 'ok') {
            return self::fake($method, $url);
        }
        return yp_http($method, $url, $o);
    }

    /** Test: her uca makul, başarılı bir yanıt */
    public static function fake($method, $url)
    {
        $id = (string)random_int(100000, 999999);
        if (strpos($url, 'oauth/token') !== false) {
            $j = ['access_token' => 'TESTTOKEN', 'expires_in' => 7200];
        } elseif (strpos($url, 'bizimhesap') !== false) {
            $j = strpos($url, 'warehouses') !== false ? ['data' => ['warehouses' => [['id' => 1]]]] : ['guid' => 'T-' . $id, 'url' => ''];
        } elseif ($method === 'GET') {
            $j = ['data' => []];
        } else {
            $j = ['data' => ['id' => $id]];
        }
        return ['ok' => true, 'code' => 200, 'body' => json_encode($j), 'json' => $j, 'error' => ''];
    }
}
