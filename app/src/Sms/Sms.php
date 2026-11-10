<?php
namespace YP\Sms;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** SMS fabrikası ve numara biçimi. Yeni sağlayıcılar Provider arayüzünü uygulayıp buraya eklenir. */
final class Sms
{
    /** Testler için: fn(array $settings): ?Provider */
    public static $factory = null;

    public static function providers()
    {
        return ['netgsm' => 'NetGSM'];
    }

    /** @return Provider|null */
    public static function fromSettings(array $s, ?callable $http = null)
    {
        if (self::$factory) {
            return call_user_func(self::$factory, $s);
        }
        $http = $http ?: 'yp_http';
        $p = isset($s['provider']) ? $s['provider'] : 'netgsm';
        if ($p === 'netgsm' && !empty($s['user']) && !empty($s['pass']) && !empty($s['header'])) {
            return new NetGsm($s['user'], $s['pass'], $s['header'], $http);
        }
        return null;
    }

    /** "0555 111 22 33" / "+905551112233" → "5551112233" (geçersizse '') */
    public static function normalize($tel)
    {
        $d = preg_replace('/\D/', '', (string)$tel);
        if (strlen($d) === 12 && strncmp($d, '90', 2) === 0) {
            $d = substr($d, 2);
        }
        if (strlen($d) === 11 && $d[0] === '0') {
            $d = substr($d, 1);
        }
        return preg_match('/^5[0-9]{9}$/', $d) ? $d : '';
    }
}
