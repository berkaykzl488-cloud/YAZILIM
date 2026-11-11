<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * İletişim bilgisi sansürü: ön yüzdeki CENSOR düzenli ifadelerinin (src/js/40-views-public.js) birebir PHP karşılığı.
 * JS'teki \w ve \d (u bayrağıyla bile) ASCII'dir; PCRE'de /u bunları Unicode yaptığı için açıkça [A-Za-z0-9_] / [0-9] yazılır.
 * Eşleşen her parça '[gizlendi]' olur. Testler aynı metinleri Node'daki asıl ifadelerle karşılaştırır.
 */
final class Censor
{
    const MASK = '[gizlendi]';

    public static function patterns()
    {
        $w = 'A-Za-z0-9_';
        return [
            '/(?:\+?90[\s\-]*)?\(?0?\s*5[0-9]{2}\)?[\s\-\.]*[0-9]{3}[\s\-\.]*[0-9]{2}[\s\-\.]*[0-9]{2}/u',
            '/(?:[0-9][\s\-]?){10,}/u',
            '/[' . $w . '.+-]+@[' . $w . '-]+\.[' . $w . '.]+/u',
            '/(?:https?:\/\/|www\.)\S+/iu',
            '/(?<![\p{L}0-9])[' . $w . '-]+\.(?:com|net|org|gg|io|tr|xyz|me|link|ly)(?![\p{L}])\S*/iu',
            '/(?<![\p{L}])(?:whatsapp|whatsap|watsap|vatsap|wpden|wp|discord|dc|telegram|telgram|tg|instagram|insta|ig|snapchat|snap|skype|facebook|fb|tiktok)(?![\p{L}])/iu',
            '/(?<![\p{L}])(?:iban|papara no|elden|site dışı|site disi|dışarıda|disarida|dışardan|disardan|komisyonsuz|numaram|numaranı|numaran|numarami|tel no|telefonum|telefonunu|gsm)(?![\p{L}])/iu',
        ];
    }

    /** @return array ['text' => sansürlü metin, 'flagged' => bool] */
    public static function apply($x)
    {
        $out = (string)$x;
        $flagged = false;
        foreach (self::patterns() as $rx) {
            $r = preg_replace_callback($rx, function () use (&$flagged) {
                $flagged = true;
                return self::MASK;
            }, $out);
            if ($r !== null) {
                $out = $r;
            }
        }
        return ['text' => $out, 'flagged' => $flagged];
    }

    /** Sansürlenen metni flagged tablosuna yazar (yönetim › Engellenen mesajlar). */
    public static function log(Db $db, $userId, $ctx, $orig)
    {
        try {
            $db->insert('flagged', ['user_id' => $userId ? (int)$userId : null, 'ctx' => yp_str($ctx, 120), 'orig' => yp_str($orig, 5000), 'seen' => 0, 't' => yp_now_ms()]);
        } catch (\Throwable $e) {
            Log::write('hata', 'flagged yazılamadı: ' . $e->getMessage());
        }
    }
}
