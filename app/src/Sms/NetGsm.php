<?php
namespace YP\Sms;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * NetGSM REST v2: POST https://api.netgsm.com.tr/sms/rest/v2/send (Basic: abone no / API alt kullanıcı şifresi).
 * NOT: Gerçek NetGSM hesabıyla henüz denenmedi; yanıt kodları NetGSM belgesine göre eşlendi.
 */
final class NetGsm implements Provider
{
    const URL = 'https://api.netgsm.com.tr/sms/rest/v2/send';
    const ERRORS = [
        '20' => 'Mesaj metni hatalı ya da çok uzun.',
        '30' => 'NetGSM kullanıcı adı/şifresi hatalı ya da API erişimi kapalı (IP kısıtı olabilir).',
        '40' => 'SMS başlığı (gönderici adı) NetGSM\'de tanımlı değil.',
        '50' => 'İYS kontrollü gönderim hatası.',
        '51' => 'İYS marka bilgisi bulunamadı.',
        '70' => 'Hatalı istek (parametre eksik).',
        '80' => 'Gönderim sınırı aşıldı.',
        '85' => 'Aynı numaraya çok sık gönderim.',
    ];
    private $user;
    private $pass;
    private $header;
    private $http;

    public function __construct($user, $pass, $header, callable $http)
    {
        $this->user = (string)$user;
        $this->pass = (string)$pass;
        $this->header = (string)$header;
        $this->http = $http;
    }

    public function name()
    {
        return 'netgsm';
    }

    public function send($to, $text)
    {
        $r = call_user_func($this->http, 'POST', self::URL, [
            'headers' => ['Authorization: Basic ' . base64_encode($this->user . ':' . $this->pass)],
            'json'    => [
                'msgheader' => $this->header,
                'encoding'  => preg_match('/[^\x20-\x7E\r\n]/', $text) ? 'TR' : '',
                'iysfilter' => '0',
                'messages'  => [['msg' => (string)$text, 'no' => (string)$to]],
            ],
            'timeout' => 15,
        ]);
        if ($r['error'] !== '') {
            return ['ok' => false, 'id' => null, 'error' => 'NetGSM sunucusuna ulaşılamadı: ' . $r['error'], 'retry' => true];
        }
        $j = is_array($r['json']) ? $r['json'] : [];
        $code = isset($j['code']) ? (string)$j['code'] : '';
        if ($r['code'] >= 200 && $r['code'] < 300 && $code === '00') {
            return ['ok' => true, 'id' => isset($j['jobid']) ? (string)$j['jobid'] : null, 'error' => '', 'retry' => false];
        }
        $msg = isset(self::ERRORS[$code]) ? self::ERRORS[$code] : ('NetGSM yanıtı (HTTP ' . (int)$r['code'] . ($code !== '' ? ', kod ' . yp_str($code, 8) : '') . ').');
        return ['ok' => false, 'id' => null, 'error' => $msg, 'retry' => in_array($code, ['80', '85', ''], true)];
    }
}
