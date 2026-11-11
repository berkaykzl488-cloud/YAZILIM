<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Settings;

/**
 * Para kuralları — ön yüzdeki JS işlevlerinin tamsayı (kuruş) karşılıkları. Saf işlevler; parite testleri (Node) bunları
 * src/js içindeki asıl işlevlerle aynı örnekler üzerinde karşılaştırır.
 *   rateFor (02-domain.js)  vip  dopCost  spend  refundPart  delMin (00-core.js)  complete() içindeki komisyon/puan/puanlama
 * Yuvarlama: JS Math.round(x*100)/100 (yarım yukarı) → tamsayı yarım-yukarı bölme.
 */
final class Rules
{
    const H = 3600000;
    const D = 86400000;
    const DOP_DAYS = [1, 2, 3, 5, 7, 10, 14, 21, 30];

    /** Ön yüzdeki VIP0 (S.vip yoksa) */
    const VIP0 = [
        ['id' => 'bronz', 'n' => 'Bronz', 'min' => 0, 'disc' => 0, 'cb' => 0.5, 'c' => '#9a5f36'],
        ['id' => 'gumus', 'n' => 'Gümüş', 'min' => 2500, 'disc' => 0.5, 'cb' => 1, 'c' => '#7d8796'],
        ['id' => 'altin', 'n' => 'Altın', 'min' => 10000, 'disc' => 1, 'cb' => 1.5, 'c' => '#b8890f'],
        ['id' => 'elmas', 'n' => 'Elmas', 'min' => 50000, 'disc' => 2, 'cb' => 2, 'c' => '#1f8fb3'],
    ];

    /** Ön yüzdeki varsayılan dopingler (S.dopings). p: TL (vitrin/acil/renk için 7 günlük), pd: günlük TL */
    const DOPINGS0 = [
        'vitrin' => ['name' => 'Vitrin', 'desc' => 'Kendi serverının vitrininde ve ana sayfada', 'p' => 49, 'pd' => 7, 'max' => 30],
        'acil'   => ['name' => 'Acil Satılık', 'desc' => 'Kırmızı ACİL etiketi', 'p' => 29, 'pd' => 4.5, 'max' => 30],
        'renk'   => ['name' => 'Renkli Arka Plan', 'desc' => 'Listede dikkat çeken zemin', 'p' => 19, 'pd' => 3, 'max' => 30],
    ];

    /** Varsayılan para ayarları (site ayarlarında yoksa) */
    const SITE0 = ['commission' => 8, 'autoConfirm' => 24, 'ptRate' => 100, 'refOn' => true, 'refBonus' => 25, 'refFriend' => 10,
                   'refMin' => 100, 'refMax' => 50, 'proofDays' => 90, 'minDeposit' => 10, 'maxDeposit' => 100000];

    /* ---------------- tamsayı yardımcıları ---------------- */

    /** round_half_up($a * $num / $den), $a,$num ≥ 0 */
    public static function mulDiv($a, $num, $den)
    {
        $a = (int)$a;
        $num = (int)$num;
        $den = (int)$den;
        if ($a < 0 || $num < 0 || $den <= 0) {
            throw new \InvalidArgumentException('mulDiv: negatif değer');
        }
        return intdiv($a * $num * 2 + $den, 2 * $den);
    }

    /** TL sayı → kuruş (ör. 4.5 → 450). JS r2 ile aynı yuvarlama. */
    public static function k($tl)
    {
        return (int)round(((float)$tl) * 100);
    }

    /** Yüzde (8, 7.5) → baz puan (800, 750) */
    public static function bp($pct)
    {
        return (int)round(((float)$pct) * 100);
    }

    /* ---------------- ayarlar ---------------- */

    public static function site(?Db $db = null)
    {
        $s = Settings::get('site', $db);
        return array_replace(self::SITE0, is_array($s) ? $s : []);
    }

    public static function vipLevels(?Db $db = null)
    {
        $v = Settings::get('vip', $db);
        $L = is_array($v) && $v ? array_values($v) : self::VIP0;
        usort($L, function ($a, $b) {
            return ((float)$a['min']) <=> ((float)$b['min']);
        });
        return $L;
    }

    public static function dopings(?Db $db = null)
    {
        $d = Settings::get('dopings', $db);
        return is_array($d) && $d ? $d : self::DOPINGS0;
    }

    /* ---------------- ön yüz işlevleri ---------------- */

    /** vip(u): hacmi (kuruş) karşılayan en yüksek seviye. JS: [...VIP].reverse().find(v=>(u.vol||0)>=v.min) || VIP[0] */
    public static function vip($volKurus, array $levels)
    {
        $best = $levels[0];
        foreach ($levels as $v) {
            if ((int)$volKurus >= self::k($v['min'])) {
                $best = $v;
            }
        }
        // JS reverse().find: aynı min'e sahip seviyelerde listede SONRAKİ kazanır — yukarıdaki döngü de öyle
        return $best;
    }

    /** rateFor(sid) → baz puan. JS: r2(Math.max(0, S.set.commission - vip(user(sid)).disc)) */
    public static function rateBp($commissionPct, $sellerVolKurus, array $levels)
    {
        $disc = (float)self::vip($sellerVolKurus, $levels)['disc'];
        $r = round(max(0, (float)$commissionPct - $disc), 2);
        return self::bp($r);
    }

    /** Komisyon (kuruş): JS r2(o.total*o.rate/100) */
    public static function fee($totalKurus, $rateBp)
    {
        return self::mulDiv($totalKurus, $rateBp, 10000);
    }

    /** Alıcı puanı: JS Math.round(o.total*vip(b).cb) (o.total TL) */
    public static function points($totalKurus, $cb)
    {
        return self::mulDiv($totalKurus, (int)round(((float)$cb) * 1000), 100000);
    }

    /** Satıcı puanı: JS r2(((+s.rating||5)*20+stars)/21) */
    public static function rating($rating, $stars)
    {
        $r = (float)$rating;
        if (!$r) {
            $r = 5.0;
        }
        return round(($r * 20 + (int)$stars) / 21, 2);
    }

    /** spend(u,a): önce kredi (bonus) kullanılır. Dönüş [nakit, kredi] (kuruş) ya da null (yetersiz) */
    public static function split($cash, $credit, $amount)
    {
        $amount = (int)$amount;
        $nw = min(max(0, (int)$credit), $amount);
        $w = $amount - $nw;
        if ($w > (int)$cash) {
            return null;
        }
        return [$w, $nw];
    }

    /** refundPart(u,o,amt): kısmi iadede önce kredi kısmı geri verilir. Dönüş [nakit, kredi] */
    public static function refundSplit($paidCash, $paidCredit, $amount)
    {
        $nw = min((int)$amount, (int)$paidCredit);
        return [(int)$amount - $nw, $nw];
    }

    /** delMin(s): teslim süresi metni → dakika */
    public static function delMin($s)
    {
        $s = (string)$s;
        if ($s === '' || mb_stripos($s, 'anında', 0, 'UTF-8') !== false) {
            return 10;
        }
        $n = (int)$s;
        if (!$n) {
            $n = 15;
        }
        return strpos($s, 'saat') !== false ? $n * 60 : $n;
    }

    /** Teslim garantisi zamanı: sipariş + delMin × 2 dk (vOrder'daki "late") */
    public static function guaranteeAt($createdAt, $delTxt)
    {
        return (int)$createdAt + self::delMin($delTxt) * 2 * 60000;
    }

    /** dopDays(k) */
    public static function dopDays(array $d)
    {
        $max = isset($d['max']) && (int)$d['max'] > 0 ? (int)$d['max'] : 30;
        return array_values(array_filter(self::DOP_DAYS, function ($n) use ($max) {
            return $n <= $max;
        }));
    }

    /** dopCost(k,days) → kuruş. JS: k==='ust' ? +d.p : r2((+d.pd||r2(d.p/7))*Math.max(1,+days||1)) */
    public static function dopCost($k, array $d, $days)
    {
        if ($k === 'ust') {
            return self::k($d['p']);
        }
        $pd = isset($d['pd']) && (float)$d['pd'] ? self::k($d['pd']) : self::mulDiv(self::k($d['p']), 1, 7);
        return $pd * max(1, (int)$days);
    }

    /** Kupon bonusu: JS r2(Math.min(c.max, a*c.pct/100)) */
    public static function couponBonus($amountKurus, $pctBp, $maxKurus)
    {
        return min((int)$maxKurus, self::mulDiv($amountKurus, $pctBp, 10000));
    }

    /** Hizmet bedeli: JS r2(a*g.fee/100) */
    public static function gwFee($amountKurus, $feeBp)
    {
        return self::mulDiv($amountKurus, $feeBp, 10000);
    }

    /** wdOK(g): EFT ile yüklenen bakiye çekilebilir (cash), diğerleri yalnız alışveriş (credit) */
    public static function withdrawable($cat)
    {
        return $cat === 'eft';
    }

    /** Puan → kredi (kuruş): JS r2(p/S.set.ptRate) */
    public static function pointsToKurus($pts, $ptRate)
    {
        $rate = max(1, (int)round((float)$ptRate * 100));
        return self::mulDiv((int)$pts * 100, 100, $rate);
    }

    /** NUM(): Türkçe binlik ayırıcı */
    public static function num($n)
    {
        return number_format((int)$n, 0, ',', '.');
    }

    /** TL(): "₺1.234,50" (ön yüzdeki Intl tr-TR TRY biçimi; bildirim metinleri) */
    public static function tl($kurus)
    {
        $k = (int)$kurus;
        $s = number_format(abs($k) / 100, 2, ',', '.');
        return ($k < 0 ? '-' : '') . '₺' . $s;
    }
}
