<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * PayTR köprüsü. Mağaza bilgileri (merchant_id/key/salt, test modu) P3'ten itibaren yalnız Yönetim › Entegrasyonlar
 * sayfasından girilir ve settings tablosunda şifreli tutulur (YP\Integrations, tek kaynak). api/_lib.php yardımcıları
 * (yp_paytr_get_token, yp_paytr_callback_hash) olduğu gibi kullanılır.
 *
 * withApiKey(): eski api/data deposunu (farklı anahtar) yalnız bir kez aktarmak için (0004 göçü).
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
        try {
            // P3: tek kaynak Yönetim › Entegrasyonlar (settings.paytr, şifreli). Eski api/data deposu 0004 göçüyle aktarılır.
            $cfg = \YP\Integrations::configured('paytr') ? \YP\Integrations::raw('paytr') : null;
        } catch (\Throwable $e) {
            \YP\Log::write('hata', 'PayTR ayarları okunamadı: ' . $e->getMessage());
            $cfg = null;
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
        return yp_paytr_get_token($cfg, $p);
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

    /**
     * PayTR Bildirim URL'si (/api/paytr_bildirim.php) — ince kabuk bu yöntemi çağırır. $post: $_POST.
     * hash: base64(hmac_sha256(merchant_oid + merchant_salt + status + total_amount, merchant_key)) — hash_equals.
     * Doğru hash'li bildirim satır kilidiyle tek kez işlenir (Deposits::paytrCallback); tekrarlar "OK" döner, hiçbir şeyi değiştirmez.
     * Dönüş: [http kodu, düz metin]. PayTR "OK" görene kadar yeniden dener; geçici hatada 500 döneriz ki yeniden denesin.
     */
    public static function notify(\YP\Db $db, array $post)
    {
        $cfg = self::config();
        if (!$cfg) {
            return [503, 'PAYTR notification failed: not configured'];
        }
        $f = function ($k) use ($post) {
            return isset($post[$k]) && is_scalar($post[$k]) ? (string)$post[$k] : '';
        };
        $oid = $f('merchant_oid');
        $status = $f('status');
        $total = $f('total_amount');
        $hash = $f('hash');
        if ($oid === '' || $hash === '' || $status === '' || $total === '') {
            return [400, 'PAYTR notification failed: bad request'];
        }
        if (!self::verify($cfg, $oid, $status, $total, $hash)) {
            \YP\Log::write('paytr', 'Bildirim reddedildi: hash hatalı', ['merchant_oid' => yp_str($oid, 64), 'ip' => yp_client_ip()]);
            return [400, 'PAYTR notification failed: bad hash'];
        }
        if (!preg_match('/^[A-Za-z0-9]{1,64}$/', $oid) || !in_array($status, ['success', 'failed'], true) || !preg_match('/^[0-9]{1,12}$/', $total)) {
            \YP\Log::write('paytr', 'Bildirim reddedildi: geçersiz alan', ['merchant_oid' => yp_str($oid, 64)]);
            return [400, 'PAYTR notification failed: bad request'];
        }
        $pay = preg_match('/^[0-9]{1,12}$/', $f('payment_amount')) ? (int)$f('payment_amount') : null;
        $res = Deposits::paytrCallback($db, [
            'merchant_oid' => $oid, 'status' => $status, 'total_amount' => $total, 'payment_amount' => $pay,
            'test_mode' => $f('test_mode'), 'payment_type' => $f('payment_type'), 'failed_reason_msg' => $f('failed_reason_msg'),
        ]);
        if ($res === null) {
            // Bu sitede açılmamış sipariş numarası (ör. eski paytr_token.php ile): bakiye yüklenmez; PayTR'ın yeniden denemesi durur.
            \YP\Log::write('paytr', 'Tanınmayan sipariş numarası (işlenmedi)', ['merchant_oid' => $oid, 'status' => $status]);
            \YP\Audit::log($db, null, 'paytr_unknown_oid', 'deposit', $oid, ['status' => $status, 'total' => $total]);
        }
        return [200, 'OK'];
    }
}
