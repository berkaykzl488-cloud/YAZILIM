<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * settings tablosu: k → JSON. Gizli anahtarlar (mail, sms) bütünüyle yp_encrypt ile şifrelenir.
 */
final class Settings
{
    private static $cache = [];

    const SECRET_KEYS = ['mail', 'sms'];

    public static function defaults()
    {
        return [
            'site' => [
                'siteName' => 'yangpazar.com', 'slogan' => 'Oyuncu pazaryeri', 'siteUrl' => '', 'commission' => 8, 'popupOn' => true,
                'popupDelay' => 1.5, 'autoConfirm' => 24, 'minWithdraw' => 50, 'moderation' => false, 'whatsapp' => '',
                'supportHours' => '7/24', 'wheelOn' => true, 'ptRate' => 100, 'refOn' => true, 'refBonus' => 25, 'refFriend' => 10,
                'tfaOn' => true,
            ],
            'mail' => [
                'on' => false, 'provider' => '', 'from' => '', 'fromName' => '', 'hourly' => 80, 'fallback' => true,
                'brevo_key' => '', 'mailjet_key' => '', 'mailjet_secret' => '',
                'smtp_host' => '', 'smtp_port' => 587, 'smtp_sec' => 'tls', 'smtp_user' => '', 'smtp_pass' => '',
                'ev' => ['welcome' => true, 'pass' => true],
            ],
            'sms' => [
                'on' => false, 'provider' => 'netgsm', 'header' => '', 'user' => '', 'pass' => '', 'hourly' => 60, 'userPrice' => 0,
                'ev' => [],
            ],
            'demo_mode' => 0,
        ];
    }

    public static function clearCache()
    {
        self::$cache = [];
    }

    public static function get($k, ?Db $db = null)
    {
        if (array_key_exists($k, self::$cache)) {
            return self::$cache[$k];
        }
        $db = $db ?: Db::main();
        $row = $db->one('SELECT v, secret FROM {settings} WHERE k=?', [$k]);
        $def = self::defaults();
        $val = isset($def[$k]) ? $def[$k] : null;
        if ($row) {
            $json = (int)$row['secret'] ? yp_decrypt($row['v']) : $row['v'];
            $v = json_decode($json, true);
            if (is_array($val) && is_array($v)) {
                $val = array_replace($val, $v);
            } elseif ($v !== null) {
                $val = $v;
            }
        }
        self::$cache[$k] = $val;
        return $val;
    }

    public static function set($k, $value, $byId = null, ?Db $db = null)
    {
        $db = $db ?: Db::main();
        $secret = in_array($k, self::SECRET_KEYS, true);
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $db->upsert('settings', [
            'k' => $k, 'v' => $secret ? yp_encrypt($json) : $json, 'secret' => $secret ? 1 : 0,
            'updated_at' => yp_now_ms(), 'updated_by' => $byId,
        ], ['k']);
        unset(self::$cache[$k]);
    }

    /** Herkese açık ayarlar (boot.set) — sır içermez */
    public static function publicSet(?Db $db = null)
    {
        $s = self::get('site', $db);
        $mail = self::get('mail', $db);
        $sms = self::get('sms', $db);
        $out = $s;
        $out['mailOn'] = !empty($mail['on']);
        $out['smsOn'] = !empty($sms['on']);
        $out['demoMode'] = (bool)self::get('demo_mode', $db);
        return $out;
    }
}
