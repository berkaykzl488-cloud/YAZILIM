<?php
namespace YP\Sms;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Telefon kanalı sağlayıcısı (iç kanal adı "sms"; canlıda WhatsApp Business Cloud API).
 * send() dönüşü: ['ok'=>bool, 'id'=>?string, 'error'=>string, 'retry'=>bool]
 */
interface Provider
{
    public function name();

    /**
     * $to:   E.164 rakamları, başında + olmadan (ör. 905551112233)
     * $text: ileti metni (doğrulama kodunda kod bu metnin içindedir)
     * $meta: ['ev' => olay anahtarı (tfa, test, withdraw, winback …)]
     */
    public function send($to, $text, array $meta = []);
}
