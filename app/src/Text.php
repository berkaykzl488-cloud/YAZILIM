<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** Türkçe metin yardımcıları ve maskeler (ön yüzdeki maskTel/maskMail/maskIban ile aynı çıktı). */
final class Text
{
    const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    /** Türkçe katlama: küçük harf + ç→c ğ→g ı/i̇→i ö→o ş→s ü→u â→a î→i û→u (kullanıcı adı benzersizliği ve arama) */
    public static function fold($s)
    {
        $s = str_replace(['I', 'İ'], ['ı', 'i'], (string)$s);
        $s = mb_strtolower($s, 'UTF-8');
        return strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'i̇' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u']);
    }

    /** LIKE için kaçış; sorguda ESCAPE '!' kullanılır (MySQL ve SQLite'ta aynı davranır) */
    public static function likeEscape($s)
    {
        return strtr((string)$s, ['!' => '!!', '%' => '!%', '_' => '!_']);
    }

    public static function maskTel($t)
    {
        $s = preg_replace('/\D/', '', (string)$t);
        return strlen($s) >= 4 ? '0••• ••• ' . substr($s, -4, 2) . ' ' . substr($s, -2) : '—';
    }

    public static function maskMail($m)
    {
        $p = explode('@', (string)$m, 2);
        if (count($p) !== 2 || $p[0] === '' || $p[1] === '') {
            return '—';
        }
        return mb_substr($p[0], 0, 2, 'UTF-8') . '•••@' . $p[1];
    }

    /** "TR33••••••1326" — ön yüzdeki maskIban() bunu "TR33 •••• •••• 1326" olarak gösterir */
    public static function maskIban($i)
    {
        $s = preg_replace('/\s/', '', (string)$i);
        return substr($s, 0, 4) . '••••••' . substr($s, -4);
    }

    /** "05xx xxx xx xx" */
    public static function formatTel($digits)
    {
        $d = preg_replace('/\D/', '', (string)$digits);
        if (strlen($d) === 10 && $d[0] === '5') {
            $d = '0' . $d;
        }
        if (strlen($d) !== 11) {
            return $d;
        }
        return substr($d, 0, 4) . ' ' . substr($d, 4, 3) . ' ' . substr($d, 7, 2) . ' ' . substr($d, 9, 2);
    }

    /** "Nisan 2021" (ön yüzün joined alanı) */
    public static function monthYear($ms)
    {
        $t = (int)floor($ms / 1000);
        $dt = new \DateTime('@' . $t);
        $dt->setTimezone(new \DateTimeZone('Europe/Istanbul'));
        return self::MONTHS[(int)$dt->format('n') - 1] . ' ' . $dt->format('Y');
    }

    /** Davet kodu: ön yüzdeki refCode() ile aynı (ASCII harf/rakam büyük harf + "26") */
    public static function refCode($name)
    {
        $s = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)$name));
        return ($s === '' ? 'UYE' : $s) . '26';
    }

    /**
     * Adres parçası: ön yüzdeki slugify() ile aynı (tr-TR küçük harf, ç ğ ı ö ş ü â → ASCII, diğerleri '-', en çok 70, boşsa 'sayfa').
     */
    public static function slug($s)
    {
        $s = str_replace(['I', 'İ'], ['ı', 'i'], (string)$s);
        $s = mb_strtolower($s, 'UTF-8');
        $s = strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'i̇' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a']);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s);
        $s = substr(trim($s, '-'), 0, 70);
        return $s === '' ? 'sayfa' : $s;
    }

    /** Kuruş → TL sayı (ön yüzün TL()/r2() biçimi) */
    public static function tl($kurus)
    {
        return round(((int)$kurus) / 100, 2);
    }

    /** TL girdisi ("1.234,56" / 12.5) → kuruş; geçersizse null */
    public static function kurus($v)
    {
        $f = yp_money($v);
        return $f === null ? null : (int)round($f * 100);
    }

    /** Kısalt (ön yüzdeki cut()): boşlukları sadeleştirir, sözcük ortasında kesmez */
    public static function cut($t, $n)
    {
        $t = trim(preg_replace('/\s+/u', ' ', (string)$t));
        if (mb_strlen($t, 'UTF-8') <= $n) {
            return $t;
        }
        $c = mb_substr($t, 0, $n - 1, 'UTF-8');
        $c2 = preg_replace('/\s+\S*$/u', '', $c);
        return ($c2 === '' || $c2 === null ? $c : $c2) . '…';
    }
}
