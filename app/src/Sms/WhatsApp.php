<?php
namespace YP\Sms;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\TestMock;

/**
 * WhatsApp Business Cloud API (Meta) ile şablon iletisi:
 *   POST https://graph.facebook.com/{API_VERSION}/{phone_number_id}/messages   (Authorization: Bearer {erişim anahtarı})
 *
 * Meta, işletmenin başlattığı her ileti için ONAYLI bir şablon ister:
 *   - doğrulama kodu (tfa, test): Kimlik doğrulama (Authentication) şablonu, "Kodu kopyala" butonlu.
 *     Gövde parametresi = kod; buton bileşeni type=button, sub_type=url, index="0", parametre = kod (Meta belgesindeki biçim).
 *   - bildirimler: Yardımcı program (Utility) şablonu, tek gövde parametresi = ileti metni (satır sonları tek boşluğa indirgenir).
 *   - kampanya (winback): yalnız ayrı bir Pazarlama (Marketing) şablonu ayarlıysa; Utility şablonu kampanya için KULLANILMAZ.
 * Testler: storage/test_mock.json {"wa":"ok"|"notwa"|"token"|"rate"|"down"} (YALNIZ YP_TEST=1 + SQLite) → sahte Graph yanıtı,
 * istekler storage/test_wa.jsonl dosyasına (anahtarsız) yazılır.
 */
final class WhatsApp implements Provider
{
    /** Graph API sürümü: Meta eski sürümleri ~2 yıl sonra kapatır; gerektiğinde yalnız bunu artırın. */
    const API_VERSION = 'v21.0';
    const BASE = 'https://graph.facebook.com/';
    /** Bildirim parametresinin en fazla uzunluğu (Meta: gövde toplamı 1024 karakter) */
    const NOTE_MAX = 600;

    const ERR_TOKEN = 'Erişim anahtarı geçersiz veya süresi dolmuş. Yönetim › E-posta & WhatsApp › WhatsApp bölümünden yeni (kalıcı) anahtarı girin.';

    /** Graph hata kodu → [Türkçe açıklama, yeniden denensin mi] */
    const ERRORS = [
        190    => [self::ERR_TOKEN, false],
        10     => ['Erişim anahtarının whatsapp_business_messaging izni yok.', false],
        200    => ['Erişim anahtarının whatsapp_business_messaging izni yok.', false],
        100    => ['İstek geçersiz: Telefon numarası kimliğini (Phone number ID) ve şablon ayarlarını kontrol edin.', false],
        4      => ['Meta istek sınırına ulaşıldı; biraz sonra yeniden denenecek.', true],
        80007  => ['WhatsApp hesabı gönderim sınırına ulaştı; biraz sonra yeniden denenecek.', true],
        130429 => ['WhatsApp saniyelik gönderim sınırına ulaşıldı; biraz sonra yeniden denenecek.', true],
        131056 => ['Aynı numaraya çok sık ileti gönderildi; biraz sonra yeniden denenecek.', true],
        131048 => ['Numara ileti sınırlamasında (spam önlemi); biraz sonra yeniden denenecek.', true],
        131000 => ['WhatsApp tarafında geçici bir hata oluştu; yeniden denenecek.', true],
        131016 => ['WhatsApp hizmeti geçici olarak kullanılamıyor; yeniden denenecek.', true],
        131026 => ['İleti teslim edilemedi: numara WhatsApp kullanmıyor ya da iletiyi alamıyor.', false],
        131030 => ['Alıcı numara izin listesinde değil (Meta test numarası yalnız kayıtlı numaralara gönderir).', false],
        131031 => ['WhatsApp işletme hesabı kilitli; Meta Business Suite\'i kontrol edin.', false],
        131042 => ['Meta hesabında ödeme yöntemi sorunu var; WhatsApp Yöneticisi › Ödeme ayarlarını kontrol edin.', false],
        131045 => ['Gönderen numara kaydı tamamlanmamış (sertifika eksik).', false],
        131047 => ['24 saatlik görüşme penceresi kapalı; yalnız onaylı şablon gönderilebilir.', false],
        131051 => ['Desteklenmeyen ileti türü.', false],
        132000 => ['Şablon parametre sayısı uyuşmuyor: şablonda tam bir değişken ({{1}}) olmalı.', false],
        132001 => ['Şablon bulunamadı ya da bu dilde onaylı değil. Şablon adını ve dil kodunu kontrol edin.', false],
        132005 => ['Şablon metni çok uzun.', false],
        132007 => ['Şablon içeriği Meta kurallarına uymuyor.', false],
        132012 => ['Şablon parametre biçimi uyuşmuyor (kimlik doğrulama şablonunda "Kodu kopyala" butonu olmalı).', false],
        132015 => ['Şablon Meta tarafından duraklatıldı (düşük kalite).', false],
        132016 => ['Şablon Meta tarafından devre dışı bırakıldı.', false],
        133010 => ['Gönderen telefon numarası WhatsApp Cloud API\'ye kayıtlı değil.', false],
        368    => ['Hesap kural ihlali nedeniyle geçici olarak engellendi.', false],
    ];

    private $s;
    private $http;

    public function __construct(array $settings, callable $http)
    {
        $this->s = $settings;
        $this->http = $http;
    }

    public static function configured(array $s)
    {
        return trim((string)(isset($s['wa_phone_id']) ? $s['wa_phone_id'] : '')) !== ''
            && (string)(isset($s['wa_token']) ? $s['wa_token'] : '') !== '';
    }

    public function name()
    {
        return 'whatsapp';
    }

    public static function url($phoneId, $path = '/messages')
    {
        return self::BASE . self::API_VERSION . '/' . rawurlencode((string)$phoneId) . $path;
    }

    private function opt($k, $def = '')
    {
        $v = isset($this->s[$k]) ? trim((string)$this->s[$k]) : '';
        return $v !== '' ? $v : $def;
    }

    /** Doğrulama kodu şablonu (Authentication + "Kodu kopyala" butonu) */
    public static function otpPayload($to, $code, $tpl, $lang)
    {
        $code = (string)$code;
        return [
            'messaging_product' => 'whatsapp',
            'recipient_type'    => 'individual',
            'to'                => (string)$to,
            'type'              => 'template',
            'template'          => [
                'name'       => (string)$tpl,
                'language'   => ['code' => (string)$lang],
                'components' => [
                    ['type' => 'body', 'parameters' => [['type' => 'text', 'text' => $code]]],
                    ['type' => 'button', 'sub_type' => 'url', 'index' => '0', 'parameters' => [['type' => 'text', 'text' => $code]]],
                ],
            ],
        ];
    }

    /** Bildirim / kampanya şablonu: tek gövde parametresi */
    public static function textPayload($to, $text, $tpl, $lang, $site = '')
    {
        return [
            'messaging_product' => 'whatsapp',
            'recipient_type'    => 'individual',
            'to'                => (string)$to,
            'type'              => 'template',
            'template'          => [
                'name'       => (string)$tpl,
                'language'   => ['code' => (string)$lang],
                'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => self::param($text, $site)]]]],
            ],
        ];
    }

    /** Şablon parametresi: Meta satır sonu, sekme ve 4'ten fazla ardışık boşluğa izin vermez; uzunluk sınırlı. */
    public static function param($text, $site = '')
    {
        $t = trim(preg_replace('/\s+/u', ' ', (string)$text));
        // Şablon gövdesi zaten "yangpazar.com: {{1}}" ile başlar; metnin başındaki site adını tekrar etme
        if ($site !== '' && stripos($t, $site . ':') === 0) {
            $t = ltrim(substr($t, strlen($site) + 1));
        }
        if ($t === '') {
            $t = '-';
        }
        if (mb_strlen($t, 'UTF-8') > self::NOTE_MAX) {
            $t = rtrim(mb_substr($t, 0, self::NOTE_MAX - 1, 'UTF-8')) . '…';
        }
        return $t;
    }

    /** Metindeki 4–8 haneli kod (doğrulama ve deneme iletisi) */
    public static function codeOf($text)
    {
        return preg_match('/(?<!\d)(\d{4,8})(?!\d)/', (string)$text, $m) ? $m[1] : '';
    }

    public function send($to, $text, array $meta = [])
    {
        $ev = isset($meta['ev']) ? (string)$meta['ev'] : '';
        $kind = Sms::kind($ev);
        if ($kind === 'otp') {
            $code = self::codeOf($text);
            if ($code === '') {
                return ['ok' => false, 'id' => null, 'error' => 'Doğrulama kodu iletide bulunamadı.', 'retry' => false];
            }
            $payload = self::otpPayload($to, $code, $this->opt('wa_otp_tpl', 'yangpazar_kod'), $this->opt('wa_otp_lang', 'tr'));
        } elseif ($kind === 'mkt') {
            $tpl = $this->opt('wa_mkt_tpl');
            if ($tpl === '') {
                return ['ok' => false, 'id' => null, 'error' => 'Kampanya iletisi için WhatsApp pazarlama şablonu ayarlanmamış (yalnız e-posta ile gider).', 'retry' => false];
            }
            $payload = self::textPayload($to, $text, $tpl, $this->opt('wa_mkt_lang', 'tr'), isset($meta['site']) ? (string)$meta['site'] : '');
        } else {
            $tpl = !empty($this->s['wa_note_on']) ? $this->opt('wa_note_tpl') : '';
            if ($tpl === '') {
                return ['ok' => false, 'id' => null, 'error' => 'WhatsApp bildirim şablonu ayarlanmamış; bildirim yalnız e-posta ile gider.', 'retry' => false];
            }
            $payload = self::textPayload($to, $text, $tpl, $this->opt('wa_note_lang', 'tr'), isset($meta['site']) ? (string)$meta['site'] : '');
        }
        $r = call_user_func($this->http, 'POST', self::url($this->opt('wa_phone_id')), [
            'headers' => ['Authorization: Bearer ' . (string)$this->s['wa_token']],
            'json'    => $payload,
            'timeout' => 15,
            'connect_timeout' => 8,
        ]);
        $j = is_array($r['json']) ? $r['json'] : [];
        if ($r['error'] === '' && $r['code'] >= 200 && $r['code'] < 300 && !empty($j['messages'][0]['id'])) {
            return ['ok' => true, 'id' => (string)$j['messages'][0]['id'], 'error' => '', 'retry' => false];
        }
        $e = self::mapError((int)$r['code'], $j, (string)$r['error']);
        return ['ok' => false, 'id' => null, 'error' => $e['error'], 'retry' => $e['retry']];
    }

    /** Graph yanıtı → ['error' => Türkçe, 'retry' => bool, 'code' => int] */
    public static function mapError($http, array $j, $netErr = '')
    {
        if ($netErr !== '') {
            return ['error' => 'WhatsApp sunucusuna ulaşılamadı: ' . $netErr, 'retry' => true, 'code' => 0];
        }
        $err = isset($j['error']) && is_array($j['error']) ? $j['error'] : [];
        $code = isset($err['code']) ? (int)$err['code'] : 0;
        if ($code && isset(self::ERRORS[$code])) {
            return ['error' => self::ERRORS[$code][0] . ' (kod ' . $code . ')', 'retry' => self::ERRORS[$code][1], 'code' => $code];
        }
        if ($http === 401) {
            return ['error' => self::ERR_TOKEN, 'retry' => false, 'code' => 190];
        }
        $msg = isset($err['error_data']['details']) ? (string)$err['error_data']['details'] : (isset($err['message']) ? (string)$err['message'] : '');
        $retry = $http === 0 || $http === 429 || $http >= 500;
        return ['error' => 'WhatsApp yanıtı (HTTP ' . (int)$http . ($code ? ', kod ' . $code : '') . ')' . ($msg !== '' ? ': ' . yp_str($msg, 160) : '.'),
                'retry' => $retry, 'code' => $code];
    }

    /** Bağlantı testi: GET /{phone_number_id}?fields=display_phone_number,verified_name */
    public function check()
    {
        $r = call_user_func($this->http, 'GET', self::url($this->opt('wa_phone_id'), '?fields=display_phone_number,verified_name,quality_rating'), [
            'headers' => ['Authorization: Bearer ' . (string)$this->s['wa_token']],
            'timeout' => 15,
            'connect_timeout' => 8,
        ]);
        $j = is_array($r['json']) ? $r['json'] : [];
        if ($r['error'] === '' && $r['code'] >= 200 && $r['code'] < 300 && isset($j['display_phone_number'])) {
            return ['ok' => true, 'name' => (string)(isset($j['verified_name']) ? $j['verified_name'] : ''), 'number' => (string)$j['display_phone_number'],
                    'quality' => (string)(isset($j['quality_rating']) ? $j['quality_rating'] : ''), 'error' => ''];
        }
        $e = self::mapError((int)$r['code'], $j, (string)$r['error']);
        return ['ok' => false, 'name' => '', 'number' => '', 'quality' => '', 'error' => $e['error']];
    }

    /** Varsayılan HTTP katmanı: yp_http; testte (YP_TEST=1 + SQLite + storage/test_mock.json "wa") sahte Graph yanıtı */
    public static function http($method, $url, array $o = [])
    {
        $m = TestMock::get('wa');
        if ($m === null) {
            return yp_http($method, $url, $o);
        }
        return self::fake($m, $method, $url, $o);
    }

    public static function fake($mode, $method, $url, array $o = [])
    {
        @file_put_contents(YP_STORAGE . '/test_wa.jsonl', json_encode(['method' => $method, 'url' => $url, 'auth' => isset($o['headers'][0]) ? substr($o['headers'][0], 0, 22) : '',
            'json' => isset($o['json']) ? $o['json'] : null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND);
        $res = function ($code, array $j) {
            return ['ok' => $code >= 200 && $code < 300, 'code' => $code, 'body' => json_encode($j), 'json' => $j, 'error' => ''];
        };
        $gerr = function ($code, $http, $msg) use ($res) {
            return $res($http, ['error' => ['message' => $msg, 'type' => 'OAuthException', 'code' => $code, 'fbtrace_id' => 'TEST']]);
        };
        if ($mode === 'down') {
            return ['ok' => false, 'code' => 0, 'body' => '', 'json' => null, 'error' => 'Bağlantı kurulamadı (sunucu yanıt vermiyor).'];
        }
        if ($mode === 'token') {
            return $gerr(190, 401, 'Error validating access token: Session has expired.');
        }
        if ($method === 'GET') {
            return $res(200, ['display_phone_number' => '+90 555 000 00 00', 'verified_name' => 'Yang Test', 'quality_rating' => 'GREEN', 'id' => '106540352242922']);
        }
        if ($mode === 'notwa') {
            return $gerr(131026, 400, 'Message Undeliverable.');
        }
        if ($mode === 'rate') {
            return $gerr(130429, 400, 'Rate limit hit');
        }
        $to = isset($o['json']['to']) ? (string)$o['json']['to'] : '';
        return $res(200, ['messaging_product' => 'whatsapp', 'contacts' => [['input' => $to, 'wa_id' => $to]],
            'messages' => [['id' => 'wamid.TEST' . bin2hex(random_bytes(8)), 'message_status' => 'accepted']]]);
    }
}
