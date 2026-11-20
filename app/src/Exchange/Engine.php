<?php
namespace YP\Exchange;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Money\Rules;

/**
 * Yang Borsası motoru — src/js/50-exchange.js'teki exQuote / exApplyFills / exDeliver / exFinish / exCancelOrder / exPair /
 * exUnpair / exMatch işlevlerinin tamsayı (kuruş) karşılığı. Saf işlevler (veritabanı yok); YP\Exchange\Exchange bunları kilitli
 * satırlar üzerinde çalıştırır, parite testi (tests/http/p4-parity.php) asıl JS işlevleriyle aynı örneklerde karşılaştırır.
 *
 * Veri şekilleri (JS ile aynı alan adları, para kuruş):
 *   teklif  ['id', 'u', 'qty', 'left', 'price', 'status' (aktif|satildi|iptal), 't']
 *   sipariş ['id', 'u', 'qty', 'price', 'total', 'paid' => ['w' => nakit, 'nw' => kredi], 'delivered', 'cost', 'reserve',
 *            'fills' => [['id'?, 'of', 'u', 'qty', 'price', 'sell', 'paidQty'], …]]
 * Teklifler $offers dizisinde kimliğe göre tutulur (referansla değiştirilir).
 */
final class Engine
{
    /** exM(x): pazar payı (yüzde × 100); pazarınki yoksa genel */
    public static function marginBp($marketBp, $globalBp)
    {
        return max(0, (int)($marketBp !== null && $marketBp !== '' ? $marketBp : $globalBp));
    }

    /** JS Math.round(x) (yarım yukarı, IEEE double — PHP float işlemleri JS Number ile aynıdır) */
    public static function jsRound($x)
    {
        return (int)floor($x + 0.5);
    }

    /**
     * r2(o.price*(1+exM(x)/100)) — ön yüzle BİREBİR aynı sonuç için aynı double işlemleriyle (ör. 19,54 × 1,25 = 24,4249… → 24,42).
     * Sonuç tamsayı kuruştur; para hareketleri bu tamsayı üzerinden yapılır.
     */
    public static function sellOf($price, $marginBp)
    {
        $m = max(0, (int)$marginBp) / 100;
        return self::jsRound(((int)$price / 100) * (1 + $m / 100) * 100);
    }

    /** exBook(x): aktif ve kalanı olan emirler, ucuzdan pahalıya, aynı fiyatta eskiden yeniye */
    public static function book(array $offers)
    {
        $L = array_values(array_filter($offers, function ($o) {
            return $o['status'] === 'aktif' && (int)$o['left'] > 0;
        }));
        usort($L, function ($a, $b) {
            return ((int)$a['price'] <=> (int)$b['price']) ?: (((int)$a['t'] <=> (int)$b['t']) ?: ((int)$a['id'] <=> (int)$b['id']));
        });
        return $L;
    }

    public static function stock(array $offers)
    {
        $n = 0;
        foreach (self::book($offers) as $o) {
            $n += (int)$o['left'];
        }
        return $n;
    }

    /** exQuote(x,q) */
    public static function quote(array $offers, $q, $marginBp)
    {
        $q = (int)$q;
        $left = $q;
        $tot = 0;
        $totF = 0.0; // JS'deki ondalık toplam (yalnız ortalama gösterimi için; tutarlar tamsayı)
        $cost = 0;
        $fills = [];
        foreach (self::book($offers) as $o) {
            if ($left <= 0) {
                break;
            }
            $n = min($left, (int)$o['left']);
            $p = self::sellOf($o['price'], $marginBp);
            $fills[] = ['of' => $o['id'], 'u' => $o['u'], 'qty' => $n, 'price' => (int)$o['price'], 'sell' => $p];
            $tot += $n * $p;
            $totF += $n * ($p / 100);
            $cost += $n * (int)$o['price'];
            $left -= $n;
        }
        return ['ok' => $left <= 0 && $q > 0, 'fills' => $fills, 'total' => $tot, 'cost' => $cost, 'avg' => $q > 0 ? self::jsRound(($totF / $q) * 100) : 0];
    }

    /** exMatched(o) */
    public static function matched(array $o)
    {
        $n = 0;
        foreach ($o['fills'] as $f) {
            $n += (int)$f['qty'];
        }
        return $n;
    }

    public static function costOf(array $o)
    {
        $c = 0;
        foreach ($o['fills'] as $f) {
            $c += (int)$f['qty'] * (int)$f['price'];
        }
        return $c;
    }

    private static function sortFills(array &$o)
    {
        usort($o['fills'], function ($a, $b) {
            return (int)$a['price'] <=> (int)$b['price']; // PHP 8 usort kararlı: JS Array.sort gibi eşitlerde sıra korunur
        });
    }

    /**
     * exApplyFills(o,x,fills): teklif kalanları düşer (0 → satildi); aynı teklif + aynı fiyattaki eşleme birleştirilir.
     * Dönüş: eşleşen [teklif kimliği => adet] (satıcıya bildirim için)
     */
    public static function applyFills(array &$o, array &$offers, array $fills)
    {
        $hit = [];
        foreach ($fills as $fl) {
            $of = &$offers[$fl['of']];
            $of['left'] = (int)$of['left'] - (int)$fl['qty'];
            if ($of['left'] <= 0) {
                $of['left'] = 0;
                $of['status'] = 'satildi';
            }
            unset($of);
            $hit[$fl['of']] = (isset($hit[$fl['of']]) ? $hit[$fl['of']] : 0) + (int)$fl['qty'];
            $merged = false;
            foreach ($o['fills'] as &$ex) {
                if ($ex['of'] == $fl['of'] && (int)$ex['price'] === (int)$fl['price']) {
                    $ex['qty'] = (int)$ex['qty'] + (int)$fl['qty'];
                    $merged = true;
                    break;
                }
            }
            unset($ex);
            if (!$merged) {
                $o['fills'][] = ['of' => $fl['of'], 'u' => $fl['u'], 'qty' => (int)$fl['qty'], 'price' => (int)$fl['price'], 'sell' => (int)$fl['sell'], 'paidQty' => 0];
            }
        }
        self::sortFills($o);
        $o['cost'] = self::costOf($o);
        return $hit;
    }

    /** exPair(o,of,q) doğrulaması + eşleme (alıcı fiyatı: siparişin birim fiyatı). Dönüş: hata metni ya da null */
    public static function pair(array &$o, array &$offers, $ofId, $q)
    {
        $need = (int)$o['qty'] - self::matched($o);
        $q = (int)floor((float)$q);
        if (!($q > 0)) {
            return 'Eşlenecek adedi yazın.';
        }
        if ($q > $need) {
            return 'Bu siparişte eşlenecek ' . $need . ' adet kaldı.';
        }
        if (!isset($offers[$ofId]) || $q > (int)$offers[$ofId]['left']) {
            return 'Bu satış emrinde ' . (isset($offers[$ofId]) ? (int)$offers[$ofId]['left'] : 0) . ' adet var.';
        }
        $of = $offers[$ofId];
        self::applyFills($o, $offers, [['of' => $ofId, 'u' => $of['u'], 'qty' => $q, 'price' => (int)$of['price'], 'sell' => (int)$o['price']]]);
        return null;
    }

    /** exUnpair(o,ofId): teslim alınmamış kısım satış emrine döner. Dönüş: geri dönen adet */
    public static function unpair(array &$o, array &$offers, $ofId)
    {
        foreach ($o['fills'] as $i => $fl) {
            if ($fl['of'] == $ofId && (int)$fl['paidQty'] < (int)$fl['qty']) {
                $rest = (int)$fl['qty'] - (int)$fl['paidQty'];
                if (isset($offers[$ofId])) {
                    $offers[$ofId]['left'] = (int)$offers[$ofId]['left'] + $rest;
                    if ($offers[$ofId]['status'] === 'satildi') {
                        $offers[$ofId]['status'] = 'aktif';
                    }
                }
                $o['fills'][$i]['qty'] = (int)$fl['paidQty'];
                $o['fills'] = array_values(array_filter($o['fills'], function ($f) {
                    return (int)$f['qty'] > 0;
                }));
                $o['cost'] = self::costOf($o);
                return $rest;
            }
        }
        return 0;
    }

    /**
     * exMatch için tek sipariş: eksik miktarı defterin en ucuz emirleriyle eşler. Alıcıdan siparişin birim fiyatından fazlası
     * alınamayacağı için (havuz eksiye düşmesin) eşleme alıcı fiyatı en çok sipariş fiyatıdır (JS'de bu sınır yok; bkz. rapor).
     * Dönüş: [eşlenen adet, fills]
     */
    public static function matchOne(array &$o, array &$offers, $marginBp)
    {
        $need = (int)$o['qty'] - self::matched($o);
        if ($need <= 0) {
            return [0, []];
        }
        $qt = self::quote($offers, $need, $marginBp);
        if (!$qt['fills']) {
            return [0, []];
        }
        foreach ($qt['fills'] as &$f) {
            $f['sell'] = min((int)$f['sell'], (int)$o['price']);
        }
        unset($f);
        self::applyFills($o, $offers, $qt['fills']);
        $got = 0;
        foreach ($qt['fills'] as $f) {
            $got += (int)$f['qty'];
        }
        return [$got, $qt['fills']];
    }

    /**
     * exDeliver(o,to): teslim edilen toplamı to'ya çıkarır; sıradaki (ucuzdan) eşlemelerin satıcılarına ödeme.
     * Dönüş: ['d' => yeni teslim, 'val' => alıcı değeri, 'cost' => satıcılara, 'pay' => [[u, of, n, amt], …], 'wipe' => [teklif kimlikleri]]
     */
    public static function deliver(array &$o, array &$offers, $to)
    {
        $to = max(0, min((int)$to, self::matched($o)));
        $add = $to - (int)$o['delivered'];
        $out = ['d' => 0, 'val' => 0, 'cost' => 0, 'pay' => [], 'wipe' => []];
        if ($add <= 0) {
            return $out;
        }
        $val = 0;
        $cost = 0;
        foreach ($o['fills'] as &$fl) {
            if ($add <= 0) {
                break;
            }
            $n = min($add, (int)$fl['qty'] - (int)$fl['paidQty']);
            if ($n <= 0) {
                continue;
            }
            $fl['paidQty'] = (int)$fl['paidQty'] + $n;
            $add -= $n;
            $amt = $n * (int)$fl['price'];
            $val += $n * ((int)$fl['sell'] ?: (int)$fl['price']);
            $cost += $amt;
            $out['pay'][] = [$fl['u'], $fl['of'], $n, $amt];
            if (isset($offers[$fl['of']]) && $offers[$fl['of']]['status'] !== 'aktif' && (int)$fl['paidQty'] >= (int)$fl['qty']) {
                $out['wipe'][] = $fl['of'];
            }
        }
        unset($fl);
        $out['d'] = $to - (int)$o['delivered'];
        $o['delivered'] = $to;
        $out['val'] = $val;
        $out['cost'] = $cost;
        return $out;
    }

    /** refundPart(u,o,amt): önce kredi kısmı. Dönüş [nakit, kredi] ve $o['paid'] güncellenir */
    public static function refundPart(array &$o, $amt)
    {
        $amt = (int)$amt;
        if ($amt <= 0) {
            return [0, 0];
        }
        $nw = min($amt, (int)$o['paid']['nw']);
        $o['paid']['nw'] = (int)$o['paid']['nw'] - $nw;
        $o['paid']['w'] = (int)$o['paid']['w'] - ($amt - $nw);
        return [$amt - $nw, $nw];
    }

    /** Eşlemelerin alıcı değeri: Σ qty × (sell||price) */
    public static function actual(array $o)
    {
        $a = 0;
        foreach ($o['fills'] as $f) {
            $a += (int)$f['qty'] * ((int)$f['sell'] ?: (int)$f['price']);
        }
        return $a;
    }

    /** exFinish(o): daha ucuza eşleşen kısmın fiyat farkı iade. Dönüş: ['back', 'split' => [nakit, kredi]] */
    public static function finish(array &$o)
    {
        $actual = self::actual($o);
        $back = (int)$o['total'] - $actual;
        $split = [0, 0];
        if ($back > 0) {
            $split = self::refundPart($o, $back);
            $o['total'] = $actual;
        } else {
            $back = 0;
        }
        $o['reserve'] = 0;
        return ['back' => $back, 'split' => $split];
    }

    /**
     * exCancelOrder(o): teslim edilmeyen eşlemeler satış emirlerine döner, kalan tutar iade.
     * Dönüş: ['back', 'split', 'returned' => [teklif => adet]]
     */
    public static function cancel(array &$o, array &$offers)
    {
        $delVal = 0;
        $ret = [];
        foreach ($o['fills'] as &$fl) {
            $pq = (int)$fl['paidQty'];
            $delVal += $pq * ((int)$fl['sell'] ?: (int)$fl['price']);
            $rest = (int)$fl['qty'] - $pq;
            if ($rest > 0) {
                if (isset($offers[$fl['of']])) {
                    $offers[$fl['of']]['left'] = (int)$offers[$fl['of']]['left'] + $rest;
                    if ($offers[$fl['of']]['status'] === 'satildi') {
                        $offers[$fl['of']]['status'] = 'aktif';
                    }
                }
                $ret[$fl['of']] = (isset($ret[$fl['of']]) ? $ret[$fl['of']] : 0) + $rest;
                $fl['qty'] = $pq;
            }
        }
        unset($fl);
        $o['fills'] = array_values(array_filter($o['fills'], function ($f) {
            return (int)$f['qty'] > 0;
        }));
        $back = (int)$o['total'] - $delVal;
        $split = [0, 0];
        if ($back > 0) {
            $split = self::refundPart($o, $back);
        } else {
            $back = 0;
        }
        $o['total'] = $delVal;
        $o['reserve'] = 0;
        return ['back' => $back, 'split' => $split, 'returned' => $ret];
    }
}
