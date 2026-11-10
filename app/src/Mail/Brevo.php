<?php
namespace YP\Mail;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** Brevo (eski adı Sendinblue) işlemsel e-posta API'si: POST https://api.brevo.com/v3/smtp/email */
final class Brevo implements Transport
{
    const URL = 'https://api.brevo.com/v3/smtp/email';
    private $key;
    private $http;

    public function __construct($apiKey, callable $http)
    {
        $this->key = (string)$apiKey;
        $this->http = $http;
    }

    public function name()
    {
        return 'brevo';
    }

    public function send(array $m)
    {
        $payload = [
            'sender'      => array_filter(['email' => $m['from'], 'name' => isset($m['fromName']) ? Mime::clean($m['fromName']) : '']),
            'to'          => [array_filter(['email' => $m['to'], 'name' => isset($m['toName']) ? Mime::clean($m['toName']) : ''])],
            'subject'     => Mime::clean($m['subject']),
            'textContent' => (string)$m['text'],
        ];
        if (!empty($m['html'])) {
            $payload['htmlContent'] = (string)$m['html'];
        }
        $r = call_user_func($this->http, 'POST', self::URL, [
            'headers' => ['api-key: ' . $this->key],
            'json'    => $payload,
            'timeout' => 15,
        ]);
        if ($r['error'] !== '') {
            return ['ok' => false, 'id' => null, 'error' => 'Brevo sunucusuna ulaşılamadı: ' . $r['error'], 'retry' => true];
        }
        $j = is_array($r['json']) ? $r['json'] : [];
        if ($r['code'] >= 200 && $r['code'] < 300 && !empty($j['messageId'])) {
            return ['ok' => true, 'id' => (string)$j['messageId'], 'error' => '', 'retry' => false];
        }
        if ($r['code'] === 401) {
            $msg = 'Brevo API anahtarı geçersiz ya da yetkisiz.';
        } elseif ($r['code'] === 429) {
            $msg = 'Brevo gönderim sınırına ulaşıldı.';
        } else {
            $msg = 'Brevo yanıtı (HTTP ' . (int)$r['code'] . '): ' . yp_str(isset($j['message']) ? $j['message'] : 'bilinmeyen hata', 200);
        }
        return ['ok' => false, 'id' => null, 'error' => $msg, 'retry' => $r['code'] >= 429 || $r['code'] === 0];
    }
}
