<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Bildirim şablonları (ön yüzdeki MAILSUB / MAILBODY / SMSDEF ile aynı metinler; P0b'de gerekenler).
 * Sahip, şablonları P6'da Yönetim › E-posta & SMS › Mesaj şablonları'ndan değiştirebilecek (settings.tpl).
 */
final class Templates
{
    const MAIL_SUB = [
        'welcome' => '{site} ailesine hoş geldin {ad}!',
        'tfa'     => '{site} doğrulama kodunuz: {kod}',
        'pass'    => 'Hesap şifreniz değiştirildi',
        'test'    => '{site} deneme e-postası',
    ];
    const MAIL_BODY = [
        'welcome' => "Merhaba {ad},\n\n{site} hesabın oluşturuldu. Artık item, yang, EP ve karakter alım satımı yapabilir, Yang Borsası’nı kullanabilir ve çekilişlere katılabilirsin.\n\nÖdemen her zaman, ürünü teslim aldığını onaylayana kadar güvenli havuzda bekler.\n\nİyi oyunlar,\n{site} ekibi",
        'tfa'     => "Merhaba {ad},\n\nDoğrulama kodunuz: {kod}\nKod 3 dakika geçerlidir. Bu işlemi siz yapmadıysanız şifrenizi değiştirin ve bizimle iletişime geçin.\n\n{site}",
        'pass'    => "Merhaba {ad},\n\nHesabınızın şifresi değiştirildi. Bu işlemi siz yapmadıysanız hemen canlı destekten bize ulaşın.\n\n{site} ekibi",
        'test'    => "Merhaba,\n\nBu bir deneme e-postasıdır. Bu iletiyi aldıysanız {site} e-posta ayarları doğru çalışıyor.\n\n{site}",
    ];
    const SMS = [
        'tfa'  => '{site} doğrulama kodunuz: {kod}. Kodu kimseyle paylaşmayın.',
        'test' => '{site} deneme SMS mesajı.',
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
