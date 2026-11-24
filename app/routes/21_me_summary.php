<?php
/**
 * Hesabım › Özetim (TASARIM-hesabim-borsa §2.3, eleştiri B-5).
 *   açılış (boot): girişli üyeye yalnız summary.todo (3 toplu sorgu) — alt çubuktaki Hesabım rozeti için. Yoklamaya alan EKLENMEZ.
 *   GET me/summary: Özetim kartları (yalnız kişinin kendi verisi, yazma yok). Tutarlar sayı (Text::tl → TL, float).
 * Yönetici (role admin) için {todo:{total:0}} döner, sorgu çalışmaz.
 *
 * Formüller (eleştiri A4 düzeltmeleriyle):
 *   todo.buy        orders buyer_id=? AND status='teslim'            (onayın bekleniyor)
 *   todo.sell       orders seller_id=? AND status='odendi'           (teslimat seni bekliyor)
 *   todo.disp       orders (alıcı ya da satıcı) status='itiraz'
 *   todo.exCall     ex_orders açık (bekliyor|islemde|bilgi|kismen), called_at dolu, ready_at boş ya da called_at'ten önce
 *   todo.exInfo     ex_orders status='bilgi'
 *   buy.open/escrow orders buyer_id=? AND status IN (odendi,teslim,itiraz): COUNT, SUM(total)
 *   buy.monthSpend  üyenin cüzdan kayıtları (postings.user_id) · journal.kind IN (satin_alma, ep, doping, reklam, iade), bu ay (İstanbul):
 *                   −SUM(tutar) (iadeler düşer); monthN: harcama kaydı sayısı. Not: sonradan gelen fiyat farkı iadesi başka aya düşebilir.
 *   sell.escrowNet  orders seller_id=? AND status IN (odendi,teslim,itiraz): SUM(total − Rules::fee(total, rate_bp))  (orders.net DEĞİL:
 *                   net yalnız tamamlanınca yazılır)
 *   sell.d1/d7/d30  orders seller_id=? AND status='tamam' AND confirmed_at ≥ (bugün 00:00 İstanbul | şimdi−7 gün | şimdi−30 gün): COUNT, SUM(net)
 *   ex.escrowLeft   ex_orders açık: SUM(total − released)  (= ESCROW:EX payı)
 *   ex.activeOffers ex_offers status='aktif': COUNT, SUM(left_qty)
 *   wd.pending/n    withdrawals status='bekliyor': SUM(amount), COUNT
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Db;
use YP\Hooks;
use YP\Http\Req;
use YP\Http\Router;
use YP\Money\Rules;
use YP\Text;

if (!function_exists('yp_hs_aggs')) {
    /** @return array [todo, buyAgg, exAgg] — boot ve me/summary ortak */
    function yp_hs_aggs(Db $db, $uid)
    {
        $uid = (int)$uid;
        $b = $db->one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS s, COALESCE(SUM(CASE WHEN status='teslim' THEN 1 ELSE 0 END),0) AS t,
            COALESCE(SUM(CASE WHEN status='itiraz' THEN 1 ELSE 0 END),0) AS d FROM {orders} WHERE buyer_id=? AND status IN ('odendi','teslim','itiraz')", [$uid]);
        $s = $db->one("SELECT COALESCE(SUM(CASE WHEN status='odendi' THEN 1 ELSE 0 END),0) AS o, COALESCE(SUM(CASE WHEN status='itiraz' THEN 1 ELSE 0 END),0) AS d
            FROM {orders} WHERE seller_id=? AND status IN ('odendi','teslim','itiraz')", [$uid]);
        $x = ['n' => 0, 's' => 0, 'c' => 0, 'i' => 0];
        if ($db->tableExists('ex_orders')) {
            $x = $db->one("SELECT COUNT(*) AS n, COALESCE(SUM(total - released),0) AS s,
                COALESCE(SUM(CASE WHEN called_at IS NOT NULL AND (ready_at IS NULL OR ready_at < called_at) THEN 1 ELSE 0 END),0) AS c,
                COALESCE(SUM(CASE WHEN status='bilgi' THEN 1 ELSE 0 END),0) AS i
                FROM {ex_orders} WHERE user_id=? AND status IN ('bekliyor','islemde','bilgi','kismen')", [$uid]);
        }
        $todo = ['buy' => (int)$b['t'], 'sell' => (int)$s['o'], 'disp' => (int)$b['d'] + (int)$s['d'], 'exCall' => (int)$x['c'], 'exInfo' => (int)$x['i']];
        $todo['total'] = array_sum($todo);
        return [$todo, $b, $x];
    }

    function yp_hs_todo(Db $db, $u)
    {
        if (!$u || $u['role'] === 'admin') {
            return ['total' => 0];
        }
        return yp_hs_aggs($db, $u['id'])[0];
    }

    /** İstanbul saatiyle bugün / bu ay başlangıcı (unix ms) */
    function yp_hs_start($nowMs, $fmt)
    {
        $d = (new \DateTime('@' . intdiv((int)$nowMs, 1000)))->setTimezone(new \DateTimeZone('Europe/Istanbul'));
        $s = new \DateTime($d->format($fmt), new \DateTimeZone('Europe/Istanbul'));
        return $s->getTimestamp() * 1000;
    }

    function yp_hs_summary(Db $db, array $u)
    {
        if ($u['role'] === 'admin') {
            return ['todo' => ['total' => 0]];
        }
        $uid = (int)$u['id'];
        $now = yp_now_ms();
        list($todo, $b, $x) = yp_hs_aggs($db, $uid);
        $month = yp_hs_start($now, 'Y-m-01 00:00:00');
        $day = yp_hs_start($now, 'Y-m-d 00:00:00');
        $sp = $db->one("SELECT COALESCE(SUM(p.amount),0) AS a, COUNT(DISTINCT CASE WHEN p.amount<0 AND j.kind<>'iade' THEN j.id END) AS n
            FROM {postings} p JOIN {journal} j ON j.id=p.journal_id
            WHERE p.user_id=? AND p.t>=? AND j.kind IN ('satin_alma','ep','doping','reklam','iade')", [$uid, $month]);
        $esc = 0;
        foreach ($db->all("SELECT total, rate_bp FROM {orders} WHERE seller_id=? AND status IN ('odendi','teslim','itiraz')", [$uid]) as $o) {
            $esc += (int)$o['total'] - Rules::fee((int)$o['total'], (int)$o['rate_bp']);
        }
        $d7 = $now - 7 * 86400000;
        $d30 = $now - 30 * 86400000;
        $st = $db->one("SELECT
            COALESCE(SUM(CASE WHEN confirmed_at>=? THEN 1 ELSE 0 END),0) AS n1, COALESCE(SUM(CASE WHEN confirmed_at>=? THEN net ELSE 0 END),0) AS s1,
            COALESCE(SUM(CASE WHEN confirmed_at>=? THEN 1 ELSE 0 END),0) AS n7, COALESCE(SUM(CASE WHEN confirmed_at>=? THEN net ELSE 0 END),0) AS s7,
            COUNT(*) AS n30, COALESCE(SUM(net),0) AS s30
            FROM {orders} WHERE seller_id=? AND status='tamam' AND confirmed_at>=?", [$day, $day, $d7, $d7, $uid, $d30]);
        $ls = $db->one("SELECT COALESCE(SUM(CASE WHEN status='aktif' AND stock>0 THEN 1 ELSE 0 END),0) AS a, COALESCE(SUM(CASE WHEN status='beklemede' THEN 1 ELSE 0 END),0) AS p
            FROM {listings} WHERE seller_id=? AND status IN ('aktif','beklemede')", [$uid]);
        $of = ['n' => 0, 's' => 0];
        if ($db->tableExists('ex_offers')) {
            $of = $db->one("SELECT COUNT(*) AS n, COALESCE(SUM(left_qty),0) AS s FROM {ex_offers} WHERE user_id=? AND status='aktif'", [$uid]);
        }
        $wd = ['n' => 0, 's' => 0];
        if ($db->tableExists('withdrawals')) {
            $wd = $db->one("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS s FROM {withdrawals} WHERE user_id=? AND status='bekliyor'", [$uid]);
        }
        $p = function ($n, $s) { return ['n' => (int)$n, 'net' => Text::tl((int)$s)]; };
        return [
            'todo' => $todo,
            'buy'  => ['open' => (int)$b['n'], 'escrow' => Text::tl((int)$b['s']), 'monthSpend' => Text::tl(max(0, -(int)$sp['a'])), 'monthN' => (int)$sp['n']],
            'sell' => ['deliver' => $todo['sell'], 'escrowNet' => Text::tl($esc), 'd1' => $p($st['n1'], $st['s1']), 'd7' => $p($st['n7'], $st['s7']),
                'd30' => $p($st['n30'], $st['s30']), 'activeListings' => (int)$ls['a'], 'pendingListings' => (int)$ls['p']],
            'ex'   => ['openOrders' => (int)$x['n'], 'escrowLeft' => Text::tl((int)$x['s']), 'activeOffers' => (int)$of['n'], 'offersLeft' => (int)$of['s']],
            'wd'   => ['pending' => Text::tl((int)$wd['s']), 'n' => (int)$wd['n']],
        ];
    }
}

return function (Router $r) {
    Hooks::on('boot', function (array $data, Db $db, $u) {
        if ($u) {
            $data['summary'] = ['todo' => yp_hs_todo($db, $u)];
        }
        return $data;
    }, 'me_summary');

    $r->get('me/summary', function (Req $q, Db $db) {
        return ['data' => yp_hs_summary($db, Auth::$user)];
    }, ['auth' => 'user', 'csrf' => false]);
};
