<?php
namespace YP\Mail;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** Mailjet Send API v3.1: POST https://api.mailjet.com/v3.1/send (Basic: API anahtarı : gizli anahtar) */
final class Mailjet implements Transport
{
    const URL = 'https://api.mailjet.com/v3.1/send';
    private $key;
    private $secret;
    private $http;

    public function __construct($apiKey, $secretKey, callable $http)
    {
        $this->key = (string)$apiKey;
        $this->secret = (string)$secretKey;
        $this->http = $http;
    }

    public function name()
    {
        return 'mailjet';
    }

    public function send(array $m)
    {
        $msg = [
            'From'     => array_filter(['Email' => $m['from'], 'Name' => isset($m['fromName']) ? Mime::clean($m['fromName']) : '']),
            'To'       => [array_filter(['Email' => $m['to'], 'Name' => isset($m['toName']) ? Mime::clean($m['toName']) : ''])],
            'Subject'  => Mime::clean($m['subject']),
            'TextPart' => (string)$m['text'],
        ];
        if (!empty($m['html'])) {
            $msg['HTMLPart'] = (string)$m['html'];
        }
        $r = call_user_func($this->http, 'POST', self::URL, [
            'headers' => ['Authorization: Basic ' . base64_encode($this->key . ':' . $this->secret)],
            'json'    => ['Messages' => [$msg]],
            'timeout' => 15,
        ]);
        if ($r['error'] !== '') {
            return ['ok' => false, 'id' => null, 'error' => 'Mailjet sunucusuna ulaşılamadı: ' . $r['error'], 'retry' => true];
        }
        $j = is_array($r['json']) ? $r['json'] : [];
        $first = isset($j['Messages'][0]) && is_array($j['Messages'][0]) ? $j['Messages'][0] : [];
        if ($r['code'] >= 200 && $r['code'] < 300 && isset($first['Status']) && $first['Status'] === 'success') {
            $id = isset($first['To'][0]['MessageID']) ? (string)$first['To'][0]['MessageID'] : (isset($first['To'][0]['MessageUUID']) ? (string)$first['To'][0]['MessageUUID'] : '');
            return ['ok' => true, 'id' => $id, 'error' => '', 'retry' => false];
        }
        if ($r['code'] === 401) {
            $err = 'Mailjet API anahtarı veya gizli anahtarı geçersiz.';
        } else {
            $e = isset($first['Errors'][0]['ErrorMessage']) ? $first['Errors'][0]['ErrorMessage'] : (isset($j['ErrorMessage']) ? $j['ErrorMessage'] : 'bilinmeyen hata');
            $err = 'Mailjet yanıtı (HTTP ' . (int)$r['code'] . '): ' . yp_str($e, 200);
        }
        return ['ok' => false, 'id' => null, 'error' => $err, 'retry' => $r['code'] >= 429 || $r['code'] === 0];
    }
}
