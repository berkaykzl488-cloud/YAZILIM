<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * NVİ KPSPublic (TCKimlikNoDogrula) SOAP istemcisi — ön yüzdeki TC_PHP kitinin sunucu karşılığı.
 * Ad ve soyad veritabanından gelir (üye yalnız TC ve doğum tarihini girer); Türkçe büyük harfe çevrilir (i → İ, ı → I).
 * Dönüş: 'ok' (eşleşti) | 'fail' (eşleşmedi) | 'down' (servise ulaşılamadı → ekip elle inceler).
 * Testler: Nvi::$fn = function($tc, $ad, $soyad, $yil) {…}; ya da storage/test_mock.json {"nvi": …} (YP\TestMock).
 */
final class Nvi
{
    const URL = 'https://tckimlik.nvi.gov.tr/Service/KPSPublic.asmx';
    const ACTION = 'http://tckimlik.nvi.gov.tr/WS/TCKimlikNoDogrula';

    /** @var callable|null */
    public static $fn = null;

    public static function upper($s)
    {
        return mb_strtoupper(str_replace(['i', 'ı'], ['İ', 'I'], trim((string)$s)), 'UTF-8');
    }

    public static function envelope($tc, $ad, $soyad, $yil)
    {
        $x = function ($v) {
            return htmlspecialchars((string)$v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        };
        return '<?xml version="1.0" encoding="utf-8"?>'
            . '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
            . '<soap:Body><TCKimlikNoDogrula xmlns="http://tckimlik.nvi.gov.tr/WS">'
            . '<TCKimlikNo>' . $x(preg_replace('/\D/', '', $tc)) . '</TCKimlikNo>'
            . '<Ad>' . $x(self::upper($ad)) . '</Ad>'
            . '<Soyad>' . $x(self::upper($soyad)) . '</Soyad>'
            . '<DogumYili>' . (int)$yil . '</DogumYili>'
            . '</TCKimlikNoDogrula></soap:Body></soap:Envelope>';
    }

    /** SOAP yanıtını yorumlar: true → ok, false → fail, başka → down */
    public static function parse($body)
    {
        if (preg_match('/<TCKimlikNoDogrulaResult>\s*(true|false)\s*<\/TCKimlikNoDogrulaResult>/i', (string)$body, $m)) {
            return strtolower($m[1]) === 'true' ? 'ok' : 'fail';
        }
        return 'down';
    }

    public static function check($tc, $ad, $soyad, $yil)
    {
        if (self::$fn) {
            return call_user_func(self::$fn, $tc, $ad, $soyad, $yil);
        }
        $mock = TestMock::get('nvi');
        if ($mock !== null) {
            return in_array($mock, ['ok', 'fail', 'down'], true) ? $mock : 'down';
        }
        if (!function_exists('curl_init')) {
            return 'down';
        }
        $ch = curl_init(self::URL);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => self::envelope($tc, $ad, $soyad, $yil), CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 15, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER => ['Content-Type: text/xml; charset=utf-8', 'SOAPAction: "' . self::ACTION . '"'],
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_errno($ch);
        curl_close($ch);
        if ($body === false || $err || $code !== 200) {
            Log::write('uyari', 'NVİ servisine ulaşılamadı', ['http' => $code, 'curl' => $err]);
            return 'down';
        }
        return self::parse($body);
    }
}
