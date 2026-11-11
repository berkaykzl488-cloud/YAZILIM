<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * PayTR köprüsü. Mağaza bilgileri (merchant_id/key/salt, test modu) Yönetim › Entegrasyonlar sayfasından api/ paketine
 * kaydedilir: api/data/ayarlar.php (api/data/anahtar.php ile şifreli). Bu sınıf o depoyu YALNIZ OKUR; api/_lib.php
 * yardımcılarını (yp_settings, yp_service_configured, yp_paytr_get_token, yp_paytr_callback_hash) olduğu gibi kullanır.
 *
 * api/ deposunun şifreleme anahtarı uygulamanınkinden (storage/anahtar.php) farklıdır; okuma sırasında anahtar geçici olarak
 * değiştirilir ve hemen geri konur.
 *
 * Ayarlar yapılmamışsa PayTR yöntemleri üyelere hiç gösterilmez ve deposits/paytr "Kart ile ödeme yakında" der (elle kapatma gerekmez).
 */
final class Paytr
{
    /** Testler: ['merchant_id'=>…] ya da false (yapılandırılmamış). null: gerçek depo */
    public static $override = null;
    /** Testler: function(array $cfg, array $p): ['ok','token','msg'] */
    public static $tokenFn = null;

    private static $cache = false;

    public static function clear()
    {
        self::$cache = false;
    }

    /** api/data anahtarıyla çalıştır */
    public static function withApiKey(callable $fn)
    {
        $saved = $GLOBALS['yp_key'];
        $GLOBALS['yp_key'] = null; // yp_key() api/data/anahtar.php'yi okusun
        try {
            return $fn();
        } finally {
            $GLOBALS['yp_key'] = $saved;
        }
    }

    /** Yapılandırılmış PayTR ayarları ya da null */
    public static function config()
    {
        if (self::$override !== null) {
            return self::$override ?: null;
        }
        if (self::$cache !== false) {
            return self::$cache;
        }
        $cfg = null;
        if (is_file(YP_DATA . '/anahtar.php') && is_file(YP_DATA . '/ayarlar.php')) {
            try {
                $cfg = self::withApiKey(function () {
                    $s = yp_settings();
                    return yp_service_configured($s, 'paytr') ? $s['paytr'] : null;
                });
            } catch (\Throwable $e) {
                \YP\Log::write('hata', 'PayTR ayarları okunamadı: ' . $e->getMessage());
                $cfg = null;
            }
        }
        return self::$cache = $cfg;
    }

    public static function configured()
    {
        return self::config() !== null;
    }

    public static function testMode()
    {
        $c = self::config();
        return $c ? (yp_bool(isset($c['test_mode']) ? $c['test_mode'] : true) ? 1 : 0) : 1;
    }

    /** Ödeme ekranı anahtarı (token). $p: tip, oid, ip, email, kurus, ad, adres, tel, sepet, ok_url, fail_url */
    public static function token(array $p)
    {
        $cfg = self::config();
        if (!$cfg) {
            return ['ok' => false, 'token' => '', 'msg' => 'PayTR ayarları yapılmamış.'];
        }
        if (!empty($p['ok_url']) && empty($cfg['ok_url'])) {
            $cfg['ok_url'] = $p['ok_url'];
        }
        if (!empty($p['fail_url']) && empty($cfg['fail_url'])) {
            $cfg['fail_url'] = $p['fail_url'];
        }
        if (self::$tokenFn) {
            return call_user_func(self::$tokenFn, $cfg, $p);
        }
        // Yalnız test ortamı (YP_TEST=1 + SQLite + YP_TEST_PAYTR=fake): PayTR'a gitmeden sahte token
        if (yp_test_mode() && getenv('YP_TEST_PAYTR') === 'fake' && \YP\Db::hasMain() && \YP\Db::main()->dialect === 'sqlite') {
            return ['ok' => true, 'token' => 'TEST' . $p['oid'], 'msg' => 'sahte'];
        }
        return self::withApiKey(function () use ($cfg, $p) {
            return yp_paytr_get_token($cfg, $p);
        });
    }

    /** Bildirim hash'i doğru mu? */
    public static function verify(array $cfg, $oid, $status, $total, $hash)
    {
        $exp = yp_paytr_callback_hash((string)$oid, (string)$cfg['merchant_salt'], (string)$status, (string)$total, (string)$cfg['merchant_key']);
        return is_string($hash) && hash_equals($exp, $hash);
    }

    public static function iframeUrl($tip, $token)
    {
        return 'https://www.paytr.com/odeme/' . ($tip === 'eft' ? 'api' : 'guvenli') . '/' . rawurlencode($token);
    }
}
