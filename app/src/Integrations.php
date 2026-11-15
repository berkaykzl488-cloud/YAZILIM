<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Accounting\BizimHesap;
use YP\Accounting\Parasut;
use YP\Http\HttpError;

/**
 * Yönetim › Entegrasyonlar (P3): PayTR, Paraşüt, Bizim Hesap bilgilerinin TEK kaynağı.
 * Her servis settings tablosunda kendi anahtarıyla (paytr / parasut / bizimhesap) bütünüyle şifreli (yp_encrypt) saklanır.
 * Alan tanımları eski api/ paketindeki yp_schema() ile aynıdır (api/_lib.php). Gizli alanlar yalnız maskeli gösterilir;
 * boş ya da maskeli gönderilen gizli alan mevcut değeri KORUR (35_admin_mail.php ile aynı kural).
 * Eski api/data/ayarlar.php deposundaki bilgiler 0004 göçüyle bir kez buraya aktarılır.
 */
final class Integrations
{
    const SVCS = ['paytr', 'parasut', 'bizimhesap'];
    /** Servis → gereken yetki (yönetici her şeyi yapar) */
    const PERM = ['paytr' => 'odeme', 'parasut' => 'muhasebe', 'bizimhesap' => 'muhasebe'];
    const NAMES = ['paytr' => 'PayTR', 'parasut' => 'Paraşüt', 'bizimhesap' => 'Bizim Hesap'];

    /** Testler: ['paytr' => fn() => ['ok'=>…,'msg'=>…]] */
    public static $testFn = [];

    public static function schema($svc)
    {
        $s = yp_schema();
        if (!isset($s[$svc])) {
            throw HttpError::notFound('Bilinmeyen entegrasyon.');
        }
        return $s[$svc];
    }

    /** Kayıtlı değerler (varsayılanlarla) */
    public static function raw($svc, ?Db $db = null)
    {
        $v = Settings::get($svc, $db);
        $out = [];
        foreach (self::schema($svc) as $f => $def) {
            $out[$f] = is_array($v) && array_key_exists($f, $v) ? $v[$f] : (isset($def['default']) ? $def['default'] : '');
        }
        return $out;
    }

    /** Zorunlu alanlar dolu mu? */
    public static function complete($svc, array $vals)
    {
        return yp_service_configured([$svc => $vals], $svc);
    }

    public static function configured($svc, ?Db $db = null)
    {
        return self::complete($svc, self::raw($svc, $db));
    }

    public static function masked($svc, ?Db $db = null)
    {
        return yp_masked_service([$svc => self::raw($svc, $db)], $svc);
    }

    public static function can($u, $svc)
    {
        return Perm::has($u, self::PERM[$svc]);
    }

    public static function status(?Db $db = null)
    {
        $s = Settings::get('integ_status', $db);
        return is_array($s) ? $s : [];
    }

    private static function setStatus(Db $db, $svc, $ok, $msg)
    {
        $s = self::status($db);
        $s[$svc] = $ok === null ? null : ['ok' => (bool)$ok, 'msg' => yp_str($msg, 300), 't' => yp_now_ms()];
        Settings::set('integ_status', $s, null, $db);
    }

    /** Alan tanımları (ön yüz formu) */
    public static function fields($svc)
    {
        $out = [];
        foreach (self::schema($svc) as $f => $def) {
            $out[] = ['k' => $f, 'label' => $def['label'], 'type' => $def['type'], 'secret' => isset($def['secret']) ? $def['secret'] : '',
                'required' => !empty($def['required']), 'hint' => isset($def['hint']) ? $def['hint'] : '',
                'min' => isset($def['min']) ? $def['min'] : null, 'max' => isset($def['max']) ? $def['max'] : null];
        }
        return $out;
    }

    public static function view($svc, ?Db $db = null)
    {
        $st = self::status($db);
        return ['id' => $svc, 'n' => self::NAMES[$svc], 'configured' => self::configured($svc, $db), 'values' => self::masked($svc, $db),
            'fields' => self::fields($svc), 'lastTest' => isset($st[$svc]) ? $st[$svc] : null, 'perm' => self::PERM[$svc]];
    }

    /** api/ayarlar.php doğrulama kuralları. Dönüş: maskeli değerler */
    public static function save(Db $db, array $staff, $svc, array $values, array $clear = [])
    {
        $schema = self::schema($svc);
        $errors = [];
        $changes = [];
        foreach ($schema as $f => $def) {
            if (in_array($f, $clear, true)) {
                $changes[$f] = isset($def['default']) ? $def['default'] : '';
                continue;
            }
            if (!array_key_exists($f, $values)) {
                continue;
            }
            $raw = $values[$f];
            switch ($def['type']) {
                case 'bool':
                    $changes[$f] = yp_bool($raw);
                    break;
                case 'int':
                    if ($raw === '' || $raw === null) {
                        $raw = isset($def['default']) ? $def['default'] : 0;
                    }
                    if (!is_numeric($raw) || (int)$raw != $raw || (int)$raw < $def['min'] || (int)$raw > $def['max']) {
                        $errors[$f] = $def['label'] . ': ' . $def['min'] . '–' . $def['max'] . ' arası tam sayı olmalı';
                        break;
                    }
                    $changes[$f] = (int)$raw;
                    break;
                case 'url':
                    $v = yp_str(is_scalar($raw) ? (string)$raw : '', 400);
                    if ($v !== '' && !yp_valid_url($v)) {
                        $errors[$f] = $def['label'] . ': geçerli bir http(s) adresi olmalı';
                        break;
                    }
                    $changes[$f] = $v;
                    break;
                case 'email':
                    $v = yp_str(is_scalar($raw) ? (string)$raw : '', 200);
                    if ($v === '' || yp_is_masked_input($v)) {
                        break;
                    }
                    if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
                        $errors[$f] = $def['label'] . ': geçerli bir e-posta olmalı';
                        break;
                    }
                    $changes[$f] = $v;
                    break;
                default:
                    $max = isset($def['max']) ? $def['max'] : 200;
                    $v = is_scalar($raw) ? trim((string)$raw) : '';
                    if (!empty($def['secret']) && ($v === '' || yp_is_masked_input($v))) {
                        break; // gizli alan boş/maskeli → eski değer korunur
                    }
                    if (strlen($v) > $max || preg_match('/[\x00-\x1F\x7F]/', $v)) {
                        $errors[$f] = $def['label'] . ': geçersiz değer';
                        break;
                    }
                    if (isset($def['pattern']) && $v !== '' && !preg_match($def['pattern'], $v)) {
                        $errors[$f] = $def['label'] . (isset($def['hint']) ? ': ' . $def['hint'] : ': geçersiz biçim');
                        break;
                    }
                    $changes[$f] = $v;
            }
        }
        if ($errors) {
            throw new HttpError(422, 'Bazı alanlar hatalı: ' . implode('; ', array_values($errors)), 'validation', ['fields' => $errors]);
        }
        $cur = self::raw($svc, $db);
        foreach ($changes as $f => $v) {
            $cur[$f] = $v;
        }
        Settings::set($svc, $cur, $staff['id'], $db);
        self::setStatus($db, $svc, null, '');
        if ($svc === 'paytr') {
            Money\Paytr::clear();
        }
        Audit::log($db, $staff['id'], 'integration_save', 'settings', $svc, ['fields' => array_keys($changes)]);
        return self::view($svc, $db);
    }

    /** Bağlantı testi: PayTR 1,00 TL test token'ı, Paraşüt OAuth + firma, Bizim Hesap depo listesi */
    public static function test(Db $db, array $staff, $svc, $ip, $siteBase)
    {
        if (!self::configured($svc, $db)) {
            throw new HttpError(422, 'Önce bu servisin bilgilerini girip Kaydet\'e basın.', 'not_configured');
        }
        $c = self::raw($svc, $db);
        if (isset(self::$testFn[$svc])) {
            $res = call_user_func(self::$testFn[$svc], $c);
        } elseif ($svc === 'paytr') {
            $m = TestMock::get('paytr');
            if ($m !== null) {
                $res = $m === 'ok' ? ['ok' => true, 'msg' => ''] : ['ok' => false, 'msg' => 'PayTR sunucusuna ulaşılamadı: bağlantı kurulamadı.'];
            } else {
                $host = parse_url($siteBase, PHP_URL_HOST);
                $res = yp_paytr_get_token($c, [
                    'tip' => 'kart', 'oid' => yp_paytr_new_oid('YPTEST'), 'ip' => $ip, 'email' => 'test@' . ($host ?: 'example.com'), 'kurus' => 100,
                    'ad' => 'Baglanti Testi', 'adres' => 'Turkiye', 'tel' => '05000000000', 'sepet' => [['Baglanti testi', '1.00', 1]], 'test_mode' => 1,
                ]);
            }
            if ($res['ok']) {
                $res['msg'] = 'PayTR bağlantısı başarılı: test modunda 1,00 TL için ödeme token\'ı alındı.'
                    . (yp_bool($c['test_mode']) ? ' Şu an TEST modundasınız; canlıya geçince test modunu kapatın.' : '');
            }
        } elseif ($svc === 'parasut') {
            $res = (new Parasut($c))->testConnection();
        } else {
            $res = (new BizimHesap($c))->testConnection();
        }
        $res = ['ok' => !empty($res['ok']), 'msg' => isset($res['msg']) ? (string)$res['msg'] : ''];
        self::setStatus($db, $svc, $res['ok'], $res['msg']);
        Audit::log($db, $staff['id'], 'integration_test', 'settings', $svc, ['ok' => $res['ok']]);
        return $res;
    }

    /**
     * Eski api/data/ayarlar.php deposundaki PayTR/Paraşüt/Bizim Hesap bilgilerini (varsa ve burada henüz yoksa) aktarır.
     * Eski deponun şifreleme anahtarı (api/data/anahtar.php) farklıdır; okuma sırasında geçici olarak kullanılır.
     */
    public static function importLegacy(Db $db)
    {
        if (!is_file(YP_DATA . '/anahtar.php') || !is_file(YP_DATA . '/ayarlar.php')) {
            return [];
        }
        try {
            $old = Money\Paytr::withApiKey(function () {
                return yp_settings();
            });
        } catch (\Throwable $e) {
            Log::write('hata', 'Eski Entegrasyon ayarları okunamadı: ' . $e->getMessage());
            return [];
        }
        $done = [];
        foreach (self::SVCS as $svc) {
            if ($db->val('SELECT k FROM {settings} WHERE k=?', [$svc]) || !isset($old[$svc]) || !yp_service_configured($old, $svc)) {
                continue;
            }
            $vals = [];
            foreach (self::schema($svc) as $f => $def) {
                if (array_key_exists($f, $old[$svc])) {
                    $vals[$f] = $old[$svc][$f];
                }
            }
            Settings::set($svc, $vals, null, $db);
            $done[] = $svc;
        }
        if ($done) {
            Audit::log($db, null, 'integration_import', 'settings', implode(',', $done));
        }
        return $done;
    }

    /** PayTR bildirim adresi (PayTR paneline yapıştırılır; değişmez) */
    public static function paytrNotifyUrl($siteBase)
    {
        return rtrim($siteBase, '/') . '/api/paytr_bildirim.php';
    }
}
