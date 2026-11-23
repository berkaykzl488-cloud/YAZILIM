<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Bildirim şablonları (ön yüzdeki MAILSUB / MAILBODY / SMSDEF ile aynı metinler; P0b'de gerekenler).
 * Sahip, şablonları P6'da Yönetim › E-posta & WhatsApp › Mesaj şablonları'ndan değiştirebilecek (settings.tpl).
 * SMS = telefon kanalı (WhatsApp) metinleri: doğrulama kodunda yalnız kod Meta'daki kimlik doğrulama şablonuna geçer;
 * diğerleri WhatsApp bildirim şablonunun {{1}} değişkenine yazılır (baştaki "{site}:" şablonda olduğu için atılır).
 */
final class Templates
{
    const MAIL_SUB = [
        'welcome' => '{site} ailesine hoş geldin {ad}!',
        'tfa'     => '{site} doğrulama kodunuz: {kod}',
        'pass'    => 'Hesap şifreniz değiştirildi',
        'test'    => '{site} deneme e-postası',
        'withdraw_req' => 'Çekim talebiniz alındı',
        'withdraw'     => '{tutar} çekim talebiniz gönderildi',
        'withdraw_no'  => 'Çekim talebiniz reddedildi',
        'tc_ok'        => 'Kimliğiniz doğrulandı',
        'tc_ask'       => 'Kimlik doğrulamanız gerekiyor',
    ];
    const MAIL_BODY = [
        'welcome' => "Merhaba {ad},\n\n{site} hesabın oluşturuldu. Artık item, yang, EP ve karakter alım satımı yapabilir, Yang Borsası’nı kullanabilir ve çekilişlere katılabilirsin.\n\nÖdemen her zaman, ürünü teslim aldığını onaylayana kadar güvenli havuzda bekler.\n\nİyi oyunlar,\n{site} ekibi",
        'tfa'     => "Merhaba {ad},\n\nDoğrulama kodunuz: {kod}\nKod 3 dakika geçerlidir. Bu işlemi siz yapmadıysanız şifrenizi değiştirin ve bizimle iletişime geçin.\n\n{site}",
        'pass'    => "Merhaba {ad},\n\nHesabınızın şifresi değiştirildi. Bu işlemi siz yapmadıysanız hemen canlı destekten bize ulaşın.\n\n{site} ekibi",
        'test'    => "Merhaba,\n\nBu bir deneme e-postasıdır. Bu iletiyi aldıysanız {site} e-posta ayarları doğru çalışıyor.\n\n{site}",
        'withdraw_req' => "Merhaba {ad},\n\nÇekim talebiniz alındı. IBAN'ınıza net {tutar} gönderilecek. Talepler mesai saatlerinde 2-6 saat içinde işlenir.\n\n{site} ekibi",
        'withdraw'     => "Merhaba {ad},\n\n{tutar} çekim talebiniz IBAN'ınıza gönderildi. Bankanıza göre hesabınıza geçmesi birkaç dakika sürebilir.\n\n{site} ekibi",
        'withdraw_no'  => "Merhaba {ad},\n\nÇekim talebiniz reddedildi ve {tutar} bakiyenize iade edildi.\nGerekçe: {durum}\n\nSorunuz varsa canlı destekten bize yazın.\n\n{site} ekibi",
    ];
    const SMS = [
        'tfa'  => '{site} doğrulama kodunuz: {kod}. Kodu kimseyle paylaşmayın.',
        'test' => '{site} WhatsApp deneme mesajı. Deneme kodu: {kod}',
        'withdraw_req' => '{site}: Çekim talebiniz alındı. IBAN\'ınıza net {tutar} gönderilecek.',
        'withdraw'     => '{site}: {tutar} çekim talebiniz IBAN\'ınıza gönderildi.',
        'withdraw_no'  => '{site}: Çekim talebiniz reddedildi, {tutar} bakiyenize iade edildi.',
    ];

    public static function fill($t, array $vars)
    {
        $m = (string)$t;
        foreach ($vars as $k => $v) {
            $m = str_replace('{' . $k . '}', $v === null ? '' : (string)$v, $m);
        }
        $m = preg_replace('/\{[a-z_]+\}/', '', $m);
        return trim(preg_replace('/ {2,}/', ' ', $m));
    }

    public static function vars(?array $user = null, array $extra = [])
    {
        $site = Settings::get('site');
        return array_merge([
            'site' => isset($site['siteName']) ? $site['siteName'] : 'yangpazar.com',
            'ad'   => $user ? ($user['ad'] !== '' ? $user['ad'] : $user['name']) : '',
            'saat' => isset($site['autoConfirm']) ? $site['autoConfirm'] : 24,
        ], $extra);
    }

    /** [konu, metin] */
    public static function mail($ev, array $vars)
    {
        $tpl = Settings::get('tpl') ?: [];
        $sub = isset($tpl['mail'][$ev]['s']) ? $tpl['mail'][$ev]['s'] : (isset(self::MAIL_SUB[$ev]) ? self::MAIL_SUB[$ev] : '{site}');
        $body = isset($tpl['mail'][$ev]['b']) ? $tpl['mail'][$ev]['b'] : (isset(self::MAIL_BODY[$ev]) ? self::MAIL_BODY[$ev] : "Merhaba {ad},\n\n{mesaj}\n\nİyi oyunlar,\n{site} ekibi");
        return [self::fill($sub, $vars), self::fill($body, $vars)];
    }

    public static function sms($ev, array $vars)
    {
        $tpl = Settings::get('tpl') ?: [];
        $t = isset($tpl['sms'][$ev]) ? $tpl['sms'][$ev] : (isset(self::SMS[$ev]) ? self::SMS[$ev] : '{site}: {mesaj}');
        return self::fill($t, $vars);
    }
}
