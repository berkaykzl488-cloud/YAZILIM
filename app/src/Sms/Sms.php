<?php
namespace YP\Sms;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Telefon kanalı fabrikası ve numara biçimi. İç kanal adı "sms" olarak kaldı (users.tfa, outbox.channel, settings.sms;
 * veritabanı göçü gerekmesin diye); gönderim WhatsApp Business Cloud API (Meta) ile yapılır. NetGSM kaldırıldı (0.6.1).
 *
 * İleti türleri (Meta şablon kategorileri):
 *   otp  doğrulama kodu ve deneme mesajı → Kimlik doğrulama (Authentication) şablonu, her zaman (kanal açıksa)
 *   note diğer bildirimler            → Yardımcı program (Utility) şablonu; yalnız "bildirimler de gitsin" açık ve şablon adı varsa
 *   mkt  kampanya / geri kazanım       → Pazarlama (Marketing) şablonu; yalnız ayrı bir pazarlama şablonu adı yazılmışsa
 */
final class Sms
{
    /** Testler için: fn(array $settings): ?Provider */
    public static $factory = null;

    const LABEL = 'WhatsApp';
    const OTP_EVS = ['tfa', 'test'];
    const MKT_EVS = ['winback'];

    public static function providers()
    {
        return ['whatsapp' => 'WhatsApp Business (Meta Cloud API)'];
    }

    /** @return Provider|null */
    public static function fromSettings(array $s, ?callable $http = null)
    {
        if (self::$factory) {
            return call_user_func(self::$factory, $s);
        }
        if (!WhatsApp::configured($s)) {
            return null;
        }
        return new WhatsApp($s, $http ?: [WhatsApp::class, 'http']);
    }

    /** otp | note | mkt */
    public static function kind($ev)
    {
        if (in_array((string)$ev, self::OTP_EVS, true)) {
            return 'otp';
        }
        return in_array((string)$ev, self::MKT_EVS, true) ? 'mkt' : 'note';
    }

    /** Bu olay için WhatsApp iletisi kuyruğa alınmalı mı? (kanal açık + o türün şablonu ayarlı) */
    public static function canSend(array $s, $ev)
    {
        if (empty($s['on'])) {
            return false;
        }
        $k = self::kind($ev);
        if ($k === 'otp') {
            return trim((string)(isset($s['wa_otp_tpl']) ? $s['wa_otp_tpl'] : '')) !== '';
        }
        if ($k === 'mkt') {
            return trim((string)(isset($s['wa_mkt_tpl']) ? $s['wa_mkt_tpl'] : '')) !== '';
        }
        return !empty($s['wa_note_on']) && trim((string)(isset($s['wa_note_tpl']) ? $s['wa_note_tpl'] : '')) !== '';
    }

    /** "0555 111 22 33" / "+905551112233" → "5551112233" (geçersizse '') */
    public static function normalize($tel)
    {
        $d = preg_replace('/\D/', '', (string)$tel);
        if (strlen($d) === 12 && strncmp($d, '90', 2) === 0) {
            $d = substr($d, 2);
        }
        if (strlen($d) === 11 && $d[0] === '0') {
            $d = substr($d, 1);
        }
        return preg_match('/^5[0-9]{9}$/', $d) ? $d : '';
    }

    /** WhatsApp için E.164, + olmadan: "0555 111 22 33" → "905551112233" (geçersizse '') */
    public static function e164($tel)
    {
        $d = self::normalize($tel);
        return $d === '' ? '' : '90' . $d;
    }
}
