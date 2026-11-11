<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Media;
use YP\Perm;
use YP\Present;
use YP\Text;

/**
 * Para dilimlerinin ön yüz (S) şekilleri. Alan adları demodakiyle aynı; tutarlar TL sayı.
 *   S.orders  {id:'S100001', lid, title, buyer, seller, qty, total, rate, status, t, info, ch, place, paid:{nw,w}, log, chat, ready, dt, ct, …}
 *   S.tx      {id, u, l, a, t, k}
 *   S.ledger  {id, t, k, u, a, m?, ref?, fee?, net?, cat?, w?}
 *   S.deps    {id:'d5', u, gw, amount, bonus, fee, t, txAt, toBank, net, addr, status, note, oid, cat, w, receipt}
 *   S.gws     {id, n, t, fee, on, manual, cat, keys:{}}   S.banks {id:'bk1', b, n, i}   S.cryptoNets {id:'cn1', coin, net, addr, note, on}
 *   S.coupons {id:'cp1', code, pct, max, on, used:[…], n}
 */
final class View
{
    public static function tl($k)
    {
        return $k === null ? null : Text::tl($k);
    }

    /* ---------------- kimlikler ---------------- */

    public static function orderId($id)
    {
        return 'S' . (100000 + (int)$id);
    }

    public static function parseOrder($v)
    {
        $s = is_scalar($v) ? (string)$v : '';
        if (!preg_match('/^S?([1-9][0-9]{5,17})$/', $s, $m) || (int)$m[1] <= 100000) {
            throw HttpError::notFound('Sipariş bulunamadı.');
        }
        return (int)$m[1] - 100000;
    }

    public static function parse($v, $prefix, $what = 'Kayıt')
    {
        try {
            return Ids::parse($v, $prefix);
        } catch (HttpError $e) {
            throw HttpError::notFound($what . ' bulunamadı.');
        }
    }

    /* ---------------- siparişler ---------------- */

    /**
     * $viewer: oturumdaki üye. Teslim kanıtlarını (dpre/dpost/dvid) yalnız satıcı ve [siparis] yetkilisi görür; alıcı görmez.
     * $full: log/chat dahil (liste görünümünde de gönderilir; sipariş başına en çok 200 kayıt)
     */
    public static function order(Db $db, array $o, $viewer, $full = true)
    {
        $id = (int)$o['id'];
        $out = [
            'id' => self::orderId($id), 'lid' => Ids::l($o['listing_id']), 'title' => $o['title'], 'cat' => $o['cat'],
            'buyer' => Ids::u($o['buyer_id']), 'seller' => Ids::u($o['seller_id']), 'qty' => (int)$o['qty'],
            'price' => self::tl($o['price']), 'total' => self::tl($o['total']), 'rate' => round((int)$o['rate_bp'] / 100, 2),
            'status' => $o['status'], 't' => (int)$o['created_at'], 'up' => (int)$o['updated_at'],
            'info' => $o['info'], 'ch' => $o['ch'], 'place' => $o['place'], 'del' => $o['del_txt'],
            'paid' => ['nw' => self::tl($o['paid_credit']), 'w' => self::tl($o['paid_cash'])],
            'ready' => $o['ready_at'] !== null ? (int)$o['ready_at'] : null,
            'dt' => $o['delivered_at'] !== null ? (int)$o['delivered_at'] : null,
            'ct' => $o['confirmed_at'] !== null ? (int)$o['confirmed_at'] : null,
            'warned' => $o['warned_at'] !== null ? (int)$o['warned_at'] : null,
            'fee' => self::tl($o['fee']), 'net' => self::tl($o['net']), 'pts' => (int)$o['pts'],
            'stars' => $o['stars'] !== null ? (int)$o['stars'] : null, 'reason' => $o['reason'],
            // sunucunun hesapladığı zamanlar: teslim garantisi (gecikme) ve otomatik onay
            'lateAt' => Rules::guaranteeAt($o['created_at'], $o['del_txt']),
            'acAt' => $o['delivered_at'] !== null ? (int)$o['delivered_at'] + self::autoConfirmMs($db) : null,
        ];
        if ($full) {
            $out['log'] = array_map(function ($e) {
                return ['t' => (int)$e['t'], 'x' => $e['x']];
            }, $db->all('SELECT t, x FROM {order_events} WHERE order_id=? ORDER BY id LIMIT 200', [$id]));
            $out['chat'] = array_map(function ($m) {
                return ['id' => 'om' . (int)$m['id'], 'f' => $m['from_id'] !== null ? Ids::u($m['from_id']) : 'admin', 'x' => $m['x'], 't' => (int)$m['t'], 'flag' => (bool)(int)$m['flagged']];
            }, $db->all('SELECT id, from_id, x, t, flagged FROM {order_messages} WHERE order_id=? ORDER BY id LIMIT 200', [$id]));
            $staff = Perm::has($viewer, 'siparis');
            $isSeller = $viewer && (int)$viewer['id'] === (int)$o['seller_id'];
            $proofs = [];
            foreach ($db->all('SELECT op.grp, op.pos, m.* FROM {order_proofs} op JOIN {media} m ON m.id=op.media_id WHERE op.order_id=? ORDER BY op.grp, op.pos', [$id]) as $m) {
                $proofs[$m['grp']][] = $m;
            }
            $url = function ($m) {
                return Media::url($m);
            };
            if ($staff || $isSeller) {
                $out['dpre'] = array_map($url, isset($proofs['dpre']) ? $proofs['dpre'] : []);
                $out['dpost'] = array_map($url, isset($proofs['dpost']) ? $proofs['dpost'] : []);
                $out['dvid'] = isset($proofs['dvid'][0]) ? $url($proofs['dvid'][0]) : null;
                $out['dproof'] = array_merge($out['dpre'], $out['dpost']);
                if (!$out['dproof'] && $o['delivered_at'] === null) {
                    unset($out['dpre'], $out['dpost'], $out['dproof']);
                }
            }
            if (isset($proofs['dispute'][0])) {
                $out['proof'] = $url($proofs['dispute'][0]);
                $out['proofs'] = array_map($url, $proofs['dispute']);
            }
        }
        return $out;
    }

    public static function autoConfirmMs(Db $db)
    {
        $h = (float)Rules::site($db)['autoConfirm'];
        return (int)round(max(1, $h) * Rules::H);
    }

    /** Siparişlerde geçen üyeler: herkese açık alanlar; [siparis] yetkilisine ad/soyad da */
    public static function orderUsers(Db $db, array $orders, $viewer)
    {
        $ids = [];
        foreach ($orders as $o) {
            $ids[] = (int)$o['buyer_id'];
            $ids[] = (int)$o['seller_id'];
        }
        $ids = array_values(array_unique(array_filter($ids)));
        if (!$ids) {
            return [];
        }
        $staff = Perm::has($viewer, 'siparis');
        $rows = $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
        return array_map(function ($u) use ($staff) {
            $p = Present::publicUser($u);
            if ($staff) {
                $p['ad'] = $u['ad'];
                $p['soyad'] = $u['soyad'];
            }
            return $p;
        }, $rows);
    }

    /* ---------------- hesap hareketleri ve defter ---------------- */

    /** Üyenin hareketleri (S.tx): üye hesaplarındaki postings, kayıt + etiket başına toplanır. Dönüş [satırlar, next] */
    public static function txList(Db $db, $userId, $after = 0, $limit = 50)
    {
        $limit = max(1, min(200, (int)$limit));
        $p = [(int)$userId];
        $w = '';
        if ((int)$after > 0) {
            $w = ' AND journal_id<?';
            $p[] = (int)$after;
        }
        $rows = $db->all('SELECT journal_id, label, SUM(amount) AS a, MIN(id) AS pid, MAX(t) AS t FROM {postings} WHERE user_id=?' . $w
            . ' GROUP BY journal_id, label ORDER BY journal_id DESC, pid DESC LIMIT ' . ($limit + 1), $p);
        $more = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        $kinds = [];
        if ($rows) {
            $ids = array_values(array_unique(array_map('intval', array_column($rows, 'journal_id'))));
            foreach ($db->all('SELECT id, kind FROM {journal} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) as $j) {
                $kinds[(int)$j['id']] = $j['kind'];
            }
        }
        $out = array_map(function ($r) use ($userId, $kinds) {
            return ['id' => 't' . (int)$r['pid'], 'u' => Ids::u($userId), 'l' => $r['label'], 'a' => Text::tl($r['a']), 't' => (int)$r['t'],
                'k' => isset($kinds[(int)$r['journal_id']]) ? $kinds[(int)$r['journal_id']] : ''];
        }, array_values(array_filter($rows, function ($r) {
            return (int)$r['a'] !== 0;
        })));
        return [$out, $more && $rows ? (int)end($rows)['journal_id'] : null];
    }

    /** Yönetim defteri satırı (S.ledger) */
    public static function ledgerRow(array $j)
    {
        $out = ['id' => 'g' . (int)$j['id'], 't' => (int)$j['t'], 'k' => $j['kind'], 'u' => Ids::u($j['user_id']), 'a' => Text::tl($j['amount'])];
        $m = $j['meta'] !== null ? json_decode($j['meta'], true) : null;
        if (is_array($m)) {
            foreach ($m as $k => $v) {
                if (in_array($k, ['fee', 'net', 'cost'], true) && is_int($v)) {
                    $v = Text::tl($v);
                }
                $out[$k] = $v;
            }
        }
        if ($j['memo'] !== '' && !isset($out['m'])) {
            $out['m'] = $j['memo'];
        }
        if ($j['actor_id'] !== null) {
            $out['by'] = Ids::u($j['actor_id']);
        }
        return $out;
    }

    /* ---------------- yüklemeler ve ödeme yöntemleri ---------------- */

    public static function depositId($id)
    {
        return 'd' . (int)$id;
    }

    public static function deposit(Db $db, array $d, $staff = false)
    {
        $out = [
            'id' => self::depositId($d['id']), 'u' => Ids::u($d['user_id']), 'gw' => $d['gw'], 'cat' => $d['cat'],
            'amount' => Text::tl($d['amount']), 'fee' => Text::tl($d['fee']), 'bonus' => Text::tl($d['bonus']), 'pay' => Text::tl((int)$d['amount'] + (int)$d['fee']),
            'w' => (bool)(int)$d['withdrawable'], 'status' => $d['status'], 't' => (int)$d['created_at'],
            'txAt' => $d['tx_at'] !== null ? (int)$d['tx_at'] : null, 'toBank' => $d['bank'], 'net' => $d['net_label'], 'addr' => $d['addr'],
            'note' => $d['note'], 'txid' => $d['txid'], 'oid' => $d['merchant_oid'], 'reason' => $d['reason'],
            'decidedAt' => $d['decided_at'] !== null ? (int)$d['decided_at'] : null,
        ];
        if ($d['coupon_id']) {
            $out['coupon'] = (string)$db->val('SELECT code FROM {coupons} WHERE id=?', [(int)$d['coupon_id']]);
        }
        if ($d['receipt_media_id']) {
            $m = $db->one('SELECT * FROM {media} WHERE id=?', [(int)$d['receipt_media_id']]);
            if ($m) {
                $out['receipt'] = Media::url($m);
            }
        }
        if ($staff) {
            $out['by'] = Ids::u($d['decided_by']);
            $out['testMode'] = (bool)(int)$d['test_mode'];
            $out['callbacks'] = (int)$d['callbacks'];
            if ($d['paytr_total'] !== null) {
                $out['paytrTotal'] = Text::tl($d['paytr_total']);
            }
        }
        return $out;
    }

    /** PayTR yöntemleri: ayarlar yapılmadıysa otomatik kapalı (soon:true) */
    public static function gateway(array $g, $forStaff = false)
    {
        $paytr = in_array($g['id'], Deposits::PAYTR_GWS, true);
        $on = (bool)(int)$g['is_on'];
        $out = ['id' => $g['id'], 'n' => $g['n'], 't' => $g['t'], 'fee' => round((int)$g['fee_bp'] / 100, 2), 'on' => $on, 'manual' => (bool)(int)$g['manual'],
            'cat' => $g['cat'], 'w' => Rules::withdrawable($g['cat']), 'keys' => (object)[], 'sort' => (int)$g['sort']];
        if ($paytr && !Paytr::configured()) {
            $out['on'] = false;
            $out['soon'] = true;
            if ($forStaff) {
                $out['setOn'] = $on;
                $out['configured'] = false;
            }
        }
        return $out;
    }

    public static function gateways(Db $db, $forStaff = false)
    {
        return array_map(function ($g) use ($forStaff) {
            return self::gateway($g, $forStaff);
        }, $db->all('SELECT * FROM {gateways} ORDER BY sort, id'));
    }

    public static function bank(array $b)
    {
        return ['id' => 'bk' . (int)$b['id'], 'b' => $b['b'], 'n' => $b['n'], 'i' => $b['iban']];
    }

    public static function cnet(array $n)
    {
        return ['id' => 'cn' . (int)$n['id'], 'coin' => $n['coin'], 'net' => $n['net'], 'addr' => $n['addr'], 'note' => $n['note'], 'on' => (bool)(int)$n['is_on']];
    }

    public static function coupon(Db $db, array $c)
    {
        $used = array_map(function ($r) {
            return Ids::u($r['user_id']);
        }, $db->all("SELECT user_id FROM {coupon_uses} WHERE coupon_id=? AND status='used' ORDER BY t DESC LIMIT 500", [(int)$c['id']]));
        return ['id' => 'cp' . (int)$c['id'], 'code' => $c['code'], 'pct' => round((int)$c['pct_bp'] / 100, 2), 'max' => Text::tl($c['max']),
            'on' => (bool)(int)$c['is_on'], 'used' => $used, 'n' => (int)$c['uses'],
            'reserved' => (int)$db->val("SELECT COUNT(*) FROM {coupon_uses} WHERE coupon_id=? AND status='reserved'", [(int)$c['id']]),
            't' => (int)$c['created_at']];
    }

    /** Herkese açık para ayarları (boot): yöntemler, havale hesapları, kripto ağları, dopingler, VIP seviyeleri */
    public static function publicSlices(Db $db)
    {
        return [
            'gws' => self::gateways($db),
            'banks' => array_map([__CLASS__, 'bank'], $db->all('SELECT * FROM {banks} ORDER BY sort, id')),
            'cryptoNets' => array_map([__CLASS__, 'cnet'], $db->all('SELECT * FROM {crypto_nets} WHERE is_on=1 ORDER BY sort, id')),
            'dopings' => Rules::dopings($db),
            'vip' => Rules::vipLevels($db),
        ];
    }
}
