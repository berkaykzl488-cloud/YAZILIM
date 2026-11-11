<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Catalog;
use YP\Censor;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Notify;
use YP\Perm;
use YP\Text;

/**
 * Havuzlu sipariş (PLAN §1.4 Escrow): ön yüzdeki doBuy / complete / refund / autoConfirm / o-ready / deliver / disp /
 * ochat / resolve / guarantee işlevlerinin sunucu karşılığı. Tüm para hareketleri Ledger üzerinden, satır kilitleriyle.
 * Kilit sırası (kilitlenme olmasın): sipariş → ilan → cüzdanlar (artan üye kimliği).
 * Her yöntem bir Db::tx içinde çağrılmalıdır.
 */
final class Orders
{
    const OPEN = ['odendi', 'teslim', 'itiraz'];
    const PLACES = ['Mavi bayrak gardiyanı', 'Pazar alanı depocu'];
    const DISPUTE_REASONS = ['Ürün teslim edilmedi', 'Ürün ilandaki gibi değil', 'Eksik teslim edildi', 'Satıcı yanıt vermiyor', 'Diğer'];
    const MAX_TOTAL = 10000000000; // 100.000.000 TL

    public static function lock(Db $db, $ref)
    {
        $id = is_int($ref) ? $ref : View::parseOrder($ref);
        $o = $db->one('SELECT * FROM {orders} WHERE id=?' . $db->forUpdate(), [$id]);
        if (!$o) {
            throw HttpError::notFound('Sipariş bulunamadı.');
        }
        return $o;
    }

    public static function row(Db $db, $id)
    {
        return $db->one('SELECT * FROM {orders} WHERE id=?', [(int)$id]);
    }

    public static function event(Db $db, $orderId, $actorId, $x)
    {
        $db->insert('order_events', ['order_id' => (int)$orderId, 'actor_id' => $actorId ? (int)$actorId : null, 'x' => yp_str($x, 2000), 't' => yp_now_ms()]);
    }

    private static function set(Db $db, array $o, array $set)
    {
        $set['updated_at'] = yp_now_ms();
        $db->update('orders', $set, 'id=?', [(int)$o['id']]);
    }

    public static function no(array $o)
    {
        return View::orderId($o['id']);
    }

    private static function link(array $o)
    {
        return '#siparis-' . self::no($o);
    }

    /** "%8" / "%7.5" (JS sayı yazımı) */
    public static function pctTxt($bp)
    {
        $v = (int)$bp / 100;
        return floor($v) == $v ? (string)(int)$v : rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.');
    }

    /** ön yüzdeki teslimatTxt(o) */
    public static function teslimatTxt(array $o)
    {
        if ($o['ch'] !== '' || $o['place'] !== '') {
            return ($o['info'] !== '' ? $o['info'] : '-') . ' karakteriyle CH' . ($o['ch'] !== '' ? $o['ch'] : '?') . ' · ' . ($o['place'] !== '' ? $o['place'] : '-');
        }
        if (strpos($o['info'], '@') !== false) {
            return 'Hesap devri ' . $o['info'] . ' adresine yapılacak';
        }
        return $o['info'] !== '' ? 'Bilgi: ' . $o['info'] : '';
    }

    /** ön yüzdeki delivTxt(o) */
    public static function delivTxt(array $o)
    {
        $p = array_filter([$o['info'], $o['ch'] !== '' ? 'CH' . $o['ch'] : '', $o['place']], 'strlen');
        return $p ? implode(' · ', $p) : '-';
    }

    private static function party(array $o, $user)
    {
        if (!$user) {
            return null;
        }
        if ((int)$user['id'] === (int)$o['buyer_id']) {
            return 'buyer';
        }
        if ((int)$user['id'] === (int)$o['seller_id']) {
            return 'seller';
        }
        return null;
    }

    /** Görebilir mi: alıcı, satıcı, [siparis] yetkilisi */
    public static function canView(array $o, $user)
    {
        return self::party($o, $user) !== null || Perm::has($user, 'siparis');
    }

    /* ================= satın alma (doBuy) ================= */

    /** $in: qty, info, ch, place. Dönüş: sipariş satırı */
    public static function buy(Db $db, array $buyer, $listingRef, array $in)
    {
        $qty = isset($in['qty']) ? $in['qty'] : 1;
        if (!is_numeric($qty) || (int)$qty != $qty || (int)$qty < 1 || (int)$qty > 1000000) {
            throw HttpError::validation(['qty' => 'Geçerli bir miktar girin.']);
        }
        $qty = (int)$qty;
        $info = isset($in['info']) && is_scalar($in['info']) ? trim((string)$in['info']) : '';
        $ch = isset($in['ch']) && is_scalar($in['ch']) ? trim((string)$in['ch']) : '';
        $place = isset($in['place']) && is_scalar($in['place']) ? trim((string)$in['place']) : '';
        if ($ch !== '' && !preg_match('/^[1-6]$/', $ch)) {
            throw HttpError::validation(['ch' => 'Kanal seçin (CH1–CH6).']);
        }
        if ($place !== '' && !in_array($place, self::PLACES, true)) {
            $place = '';
        }
        if ($buyer['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız yasaklı, işlem yapamazsınız.');
        }

        $l = Catalog::listingRow($db, $listingRef, true); // ilan satırı kilitli: stok aşılamaz
        if ((int)$l['seller_id'] === (int)$buyer['id']) {
            throw HttpError::conflict('Kendi ilanınızı satın alamazsınız.');
        }
        if ($l['status'] !== 'aktif' || (int)$l['stock'] < $qty) {
            throw new HttpError(409, (int)$l['stock'] > 0 && $l['status'] === 'aktif' ? 'Stokta yalnız ' . (int)$l['stock'] . ' adet var.' : 'Bu ilan artık satışta değil.', 'sold_out');
        }
        $seller = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$l['seller_id']]);
        if (!$seller || $seller['status'] !== 'active') {
            throw new HttpError(409, 'Bu ilan artık satışta değil.', 'sold_out');
        }
        // karakter / hesap / EP: teslim bilgisi e-posta adresidir, satıcı görmeli; gizlenmez
        $rawInfo = in_array($l['cat'], ['karakter', 'hesap', 'ep', 'epin'], true) || $l['game'] === 'cs2';
        if ($rawInfo && $l['game'] !== 'cs2' && !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $info)) {
            throw HttpError::validation(['info' => 'Geçerli bir e-posta adresi yazın.']);
        }
        if (!$rawInfo && $info === '') {
            throw HttpError::validation(['info' => 'Karakter adınızı yazın.']);
        }
        $flagged = false;
        if ($rawInfo) {
            $info = yp_str($info, 200);
        } else {
            $c = Censor::apply(yp_str($info, 200));
            $flagged = $c['flagged'];
            $info = yp_str($c['text'], 255);
        }
        $total = (int)$l['price'] * $qty;
        if ($total <= 0 || $total > self::MAX_TOTAL) {
            throw HttpError::validation(['qty' => 'Tutar çok yüksek.']);
        }
        $site = Rules::site($db);
        $rate = Rules::rateBp($site['commission'], (int)$seller['vol'], Rules::vipLevels($db));

        $w = Ledger::lockWallets($db, [$buyer['id']])[(int)$buyer['id']];
        $split = Rules::split($w['cash'], $w['credit'], $total);
        if ($split === null) {
            throw new HttpError(409, 'Bakiye yetersiz. ' . Rules::tl($total - $w['cash'] - $w['credit']) . ' daha yüklemeniz gerekiyor.', 'insufficient',
                ['need' => Text::tl($total - $w['cash'] - $w['credit'])]);
        }
        $now = yp_now_ms();
        $id = $db->insert('orders', [
            'listing_id' => (int)$l['id'], 'title' => $l['title'], 'cat' => $l['cat'], 'del_txt' => $l['del_txt'],
            'buyer_id' => (int)$buyer['id'], 'seller_id' => (int)$seller['id'], 'qty' => $qty, 'price' => (int)$l['price'], 'total' => $total,
            'paid_cash' => $split[0], 'paid_credit' => $split[1], 'rate_bp' => $rate, 'status' => 'odendi',
            'info' => $info, 'ch' => $ch, 'place' => $place, 'created_at' => $now, 'updated_at' => $now,
        ]);
        $o = self::row($db, $id);
        $no = self::no($o);
        $lbl = 'Satın alma #' . $no;
        Ledger::post($db, 'satin_alma', ['ref_type' => 'order', 'ref_id' => $no, 'user' => $buyer['id'], 'amount' => $total, 'actor' => $buyer['id'],
            'meta' => ['ref' => $no, 'm' => $l['title']]], [
            [Ledger::cash($buyer['id']), -$split[0], $lbl],
            [Ledger::credit($buyer['id']), -$split[1], $lbl],
            ['ESCROW:ORD', $total],
        ]);
        $n = $db->exec("UPDATE {listings} SET stock=stock-?, status=CASE WHEN stock-?<=0 THEN 'satildi' ELSE status END, updated_at=? WHERE id=? AND stock>=? AND status='aktif'",
            [$qty, $qty, $now, (int)$l['id'], $qty]);
        if ($n !== 1) {
            throw new HttpError(409, 'Bu ilan artık satışta değil.', 'sold_out');
        }
        self::event($db, $id, $buyer['id'], 'Ödeme alındı, tutar güvenli havuza aktarıldı. Satıcıya bildirim ve SMS gönderildi.');
        if ($ch !== '' || $place !== '') {
            self::event($db, $id, $buyer['id'], 'Teslimat: ' . self::delivTxt($o));
        }
        if ($flagged) {
            Censor::log($db, $buyer['id'], 'Sipariş teslim bilgisi #' . $no, (string)$in['info']);
        }
        $tes = self::teslimatTxt($o);
        Notify::send($db, $seller['id'], '“' . $l['title'] . '” ilanınız satıldı (#' . $no . '). Teslimat: ' . $tes . '. Lütfen siparişi açıp teslim edin.', self::link($o), 'sold',
            ['ilan' => $l['title'], 'no' => $no, 'teslimat' => $tes, 'tutar' => Rules::tl($total)]);
        Notify::send($db, $buyer['id'], '#' . $no . ' siparişiniz alındı. Ödemeniz havuzda güvende; satıcı teslime hazır olunca haber vereceğiz.', self::link($o), 'order_new',
            ['ilan' => $l['title'], 'no' => $no, 'tutar' => Rules::tl($total), 'teslimat' => $tes]);
        if ((int)$l['stock'] - $qty <= 0 && ($qty > 1 || (int)$db->val('SELECT COUNT(*) FROM {orders} WHERE listing_id=?', [(int)$l['id']]) > 1)) {
            Notify::send($db, $seller['id'], '“' . $l['title'] . '” ilanınızın stoğu bitti, ilan yayından kalktı.', '#hesabim', 'stock_out', ['ilan' => $l['title']]);
        }
        return self::row($db, $id);
    }

    /* ================= satıcı: teslime hazır, teslim ettim ================= */

    public static function ready(Db $db, array $o, array $u)
    {
        if (self::party($o, $u) !== 'seller') {
            throw HttpError::forbidden('Bu işlemi yalnız satıcı yapabilir.');
        }
        if ($o['status'] !== 'odendi') {
            throw HttpError::conflict('Bu sipariş için teslime hazır bildirimi yapılamaz.');
        }
        if ($o['ready_at'] !== null) {
            return false;
        }
        self::set($db, $o, ['ready_at' => yp_now_ms()]);
        self::event($db, $o['id'], $u['id'], 'Satıcı teslime hazır olduğunu bildirdi.');
        $tes = self::teslimatTxt($o);
        Notify::send($db, $o['buyer_id'], '#' . self::no($o) . ' siparişiniz teslime hazır! ' . $tes . '. Lütfen oyunda bekleyin.', self::link($o), 'ready',
            ['no' => self::no($o), 'ilan' => $o['title'], 'teslimat' => $tes]);
        return true;
    }

    /** Kanıt medyası: $kind türünde, $userId yüklemiş, başka kayda bağlanmamış */
    private static function proofMedia(Db $db, array $ids, $userId, $kind, $type, $field, $orderId)
    {
        $out = [];
        foreach ($ids as $raw) {
            try {
                $mid = Ids::media(is_array($raw) && isset($raw['id']) ? $raw['id'] : $raw);
            } catch (HttpError $e) {
                throw HttpError::validation([$field => 'Dosya bulunamadı.']);
            }
            $m = $db->one('SELECT * FROM {media} WHERE id=?', [$mid]);
            if (!$m || (int)$m['owner_id'] !== (int)$userId || $m['kind'] !== $kind) {
                throw HttpError::validation([$field => 'Dosya bulunamadı ya da size ait değil.']);
            }
            if ($m['ref_type'] !== '' && !($m['ref_type'] === 'order' && (int)$m['ref_id'] === (int)$orderId)) {
                throw HttpError::validation([$field => 'Bu dosya başka bir kayıtta kullanılıyor.']);
            }
            if (strncmp($m['mime'], $type . '/', strlen($type) + 1) !== 0) {
                throw HttpError::validation([$field => $type === 'video' ? 'Teslimat videosu MP4/WEBM olmalı.' : 'Görsel dosyası seçin.']);
            }
            $out[$mid] = $m;
        }
        return array_values($out);
    }

    private static function attachProofs(Db $db, array $o, $grp, array $media)
    {
        $pos = (int)$db->val('SELECT COALESCE(MAX(pos)+1,0) FROM {order_proofs} WHERE order_id=? AND grp=?', [(int)$o['id'], $grp]);
        foreach ($media as $m) {
            $db->insert('order_proofs', ['order_id' => (int)$o['id'], 'grp' => $grp, 'media_id' => (int)$m['id'], 'pos' => $pos++]);
            $db->update('media', ['ref_type' => 'order', 'ref_id' => (int)$o['id']], 'id=?', [(int)$m['id']]);
        }
    }

    /** $in: dpre[], dpost[] (1–3 görsel, zorunlu), dvid (isteğe bağlı video), note */
    public static function deliver(Db $db, array $o, array $u, array $in)
    {
        if (self::party($o, $u) !== 'seller') {
            throw HttpError::forbidden('Bu işlemi yalnız satıcı yapabilir.');
        }
        if ($o['status'] !== 'odendi') {
            throw HttpError::conflict('Bu sipariş zaten teslim edildi ya da kapandı.');
        }
        $arr = function ($k) use ($in) {
            if (!isset($in[$k]) || $in[$k] === '' || $in[$k] === null) {
                return [];
            }
            return is_array($in[$k]) ? array_values($in[$k]) : [$in[$k]];
        };
        $pre = $arr('dpre');
        $post = $arr('dpost');
        $vid = $arr('dvid');
        if (!$pre || !$post) {
            throw HttpError::validation(['dpre' => 'Teslimat öncesi ve sonrası görsellerini yüklemeden “Teslim Ettim” diyemezsiniz.']);
        }
        if (count($pre) > 3 || count($post) > 3 || count($vid) > 1) {
            throw HttpError::validation(['dpre' => 'En fazla 3 teslimat öncesi, 3 teslimat sonrası görsel ve 1 video yükleyebilirsiniz.']);
        }
        $pre = self::proofMedia($db, $pre, $u['id'], 'proof', 'image', 'dpre', $o['id']);
        $post = self::proofMedia($db, $post, $u['id'], 'proof', 'image', 'dpost', $o['id']);
        $vid = self::proofMedia($db, $vid, $u['id'], 'proof', 'video', 'dvid', $o['id']);
        $dup = array_intersect(array_column($pre, 'id'), array_column($post, 'id'));
        if ($dup) {
            throw HttpError::validation(['dpost' => 'Öncesi ve sonrası için ayrı görseller yükleyin.']);
        }
        $now = yp_now_ms();
        self::attachProofs($db, $o, 'dpre', $pre);
        self::attachProofs($db, $o, 'dpost', $post);
        self::attachProofs($db, $o, 'dvid', $vid);
        self::set($db, $o, ['status' => 'teslim', 'delivered_at' => $now, 'warned_at' => null]);
        self::event($db, $o['id'], $u['id'], 'Satıcı teslim ettiğini bildirdi: ' . count($pre) . ' teslimat öncesi, ' . count($post) . ' teslimat sonrası görsel'
            . ($vid ? ' ve teslimat videosu' : '') . ' yükledi (yalnızca yönetim görür). Alıcıya bildirim ve SMS gönderildi.');
        $note = isset($in['note']) && is_scalar($in['note']) ? trim((string)$in['note']) : '';
        if ($note !== '') {
            self::chat($db, $o, $u, $note, false);
        }
        $h = Rules::site($db)['autoConfirm'];
        Notify::send($db, $o['buyer_id'], 'Sipariş #' . self::no($o) . ' teslim edildi. Kontrol edip onaylayın; ' . $h . ' saat içinde işlem yapılmazsa otomatik onaylanır.',
            self::link($o), 'delivered', ['no' => self::no($o), 'ilan' => $o['title'], 'saat' => $h]);
    }

    /* ================= tamamlama (complete) ================= */

    /**
     * ESCROW:ORD → satıcı nakit (net) + REV:commission (siparişte dondurulan oran). Satıcı satış/hacim/puanlama, alıcı puan/hacim,
     * davet ödülü (refCheck). $o kilitli satır olmalı.
     */
    public static function complete(Db $db, array $o, $stars = null, $actorId = null)
    {
        if (!in_array($o['status'], ['teslim', 'itiraz'], true)) {
            throw HttpError::conflict('Bu sipariş şu an onaylanamaz.');
        }
        $buyer = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$o['buyer_id']]);
        $seller = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$o['seller_id']]);
        Ledger::lockWallets($db, [$o['buyer_id'], $o['seller_id'], $buyer['ref_by']]);
        $total = (int)$o['total'];
        $fee = Rules::fee($total, (int)$o['rate_bp']);
        $net = $total - $fee;
        $no = self::no($o);
        $now = yp_now_ms();
        $levels = Rules::vipLevels($db);
        $pts = Rules::points($total, Rules::vip((int)$buyer['vol'], $levels)['cb']);

        Ledger::post($db, 'satis', ['ref_type' => 'order', 'ref_id' => $no, 'user' => $o['seller_id'], 'amount' => $total, 'actor' => $actorId,
            'meta' => ['fee' => $fee, 'net' => $net, 'ref' => $no, 'm' => $o['title']]], [
            ['ESCROW:ORD', -$total],
            [Ledger::cash($o['seller_id']), $net, 'Satış #' . $no . ' (komisyon %' . self::pctTxt($o['rate_bp']) . ' düşüldü)'],
            ['REV:commission', $fee],
        ]);
        $set = ['status' => 'tamam', 'confirmed_at' => $now, 'fee' => $fee, 'net' => $net, 'pts' => $pts];
        $sellerSet = 'sales=sales+1, vol=vol+?';
        $sp = [$total];
        if ($stars !== null) {
            $stars = max(1, min(5, (int)$stars));
            $set['stars'] = $stars;
            $sellerSet .= ', rating=?, rating_n=rating_n+1';
            $sp[] = Rules::rating($seller['rating'], $stars);
        }
        $sp[] = (int)$seller['id'];
        $db->exec('UPDATE {users} SET ' . $sellerSet . ' WHERE id=?', $sp);
        $db->exec('UPDATE {users} SET pts=pts+?, vol=vol+? WHERE id=?', [$pts, $total, (int)$buyer['id']]);
        if ($pts) {
            $db->insert('points_log', ['user_id' => (int)$buyer['id'], 'delta' => $pts, 'reason' => 'siparis', 'ref' => $no, 't' => $now]);
        }
        self::set($db, $o, $set);
        self::refCheck($db, $buyer, $total);
        self::event($db, $o['id'], $actorId, 'Sipariş onaylandı. Satıcıya ' . Rules::tl($net) . ' aktarıldı, ' . Rules::tl($fee) . ' komisyon kesildi. Alıcı ' . Rules::num($pts) . ' puan kazandı.');
        Notify::send($db, $o['seller_id'], 'Sipariş #' . $no . ' onaylandı, ' . Rules::tl($net) . ' bakiyenize geçti.', self::link($o), 'confirmed', ['no' => $no, 'tutar' => Rules::tl($net)]);
        Notify::send($db, $o['buyer_id'], '#' . $no . ' siparişiniz tamamlandı. Teşekkür ederiz!', self::link($o), 'completed', ['no' => $no, 'ilan' => $o['title']]);
        return ['fee' => $fee, 'net' => $net, 'pts' => $pts];
    }

    /** refCheck(b,total): ilk tamamlanan alışveriş refMin üstündeyse davet edene ve davetliye bir kez hediye (kredi) */
    public static function refCheck(Db $db, array $b, $total)
    {
        $s = Rules::site($db);
        if (empty($s['refOn']) || !$b['ref_by'] || (int)$b['ref_paid'] || (int)$total < Rules::k($s['refMin'])) {
            return false;
        }
        $R = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$b['ref_by']]);
        if (!$R) {
            return false;
        }
        if ($db->exec('UPDATE {users} SET ref_paid=1 WHERE id=? AND ref_paid=0', [(int)$b['id']]) !== 1) {
            return false;
        }
        if ($db->exec('UPDATE {users} SET refs=refs+1 WHERE id=? AND refs<?', [(int)$R['id'], (int)$s['refMax']]) !== 1) {
            $db->exec('UPDATE {users} SET ref_paid=0 WHERE id=?', [(int)$b['id']]);
            return false;
        }
        $rb = Rules::k($s['refBonus']);
        $rf = Rules::k($s['refFriend']);
        if ($rb > 0) {
            Ledger::post($db, 'bonus', ['ref_type' => 'user', 'ref_id' => Ids::u($b['id']), 'user' => $R['id'], 'amount' => $rb, 'meta' => ['m' => 'Davet ödülü', 'src' => 'davet']], [
                ['EXP:referral', -$rb], [Ledger::credit($R['id']), $rb, 'Davet ödülü (' . $b['name'] . ') · sadece alışveriş'],
            ]);
            Notify::send($db, $R['id'], $b['name'] . ' ilk alışverişini yaptı, ' . Rules::tl($rb) . ' davet ödülü kazandın.', '#hesabim');
        }
        if ($rf > 0) {
            Ledger::post($db, 'bonus', ['ref_type' => 'user', 'ref_id' => Ids::u($R['id']), 'user' => $b['id'], 'amount' => $rf, 'meta' => ['m' => 'Davet hoş geldin', 'src' => 'davet']], [
                ['EXP:referral', -$rf], [Ledger::credit($b['id']), $rf, 'Davet hoş geldin ödülü · sadece alışveriş'],
            ]);
            Notify::send($db, $b['id'], 'Davet koduyla ilk alışverişin için ' . Rules::tl($rf) . ' hediye bakiye yüklendi.', '#hesabim');
        }
        return true;
    }

    /* ================= iade (refund) ================= */

    /** ESCROW:ORD → alıcının ödediği kovalara (nakit/kredi) geri. Stok ilana geri döner. $o kilitli satır olmalı. */
    public static function refund(Db $db, array $o, $msg, $actorId = null)
    {
        if (!in_array($o['status'], self::OPEN, true)) {
            throw HttpError::conflict('Bu sipariş iade edilemez.');
        }
        $l = $db->one('SELECT * FROM {listings} WHERE id=?' . $db->forUpdate(), [(int)$o['listing_id']]);
        $no = self::no($o);
        $lbl = 'İade #' . $no;
        Ledger::post($db, 'iade', ['ref_type' => 'order', 'ref_id' => $no, 'user' => $o['buyer_id'], 'amount' => (int)$o['total'], 'actor' => $actorId,
            'meta' => ['ref' => $no, 'm' => $o['title']]], [
            ['ESCROW:ORD', -(int)$o['total']],
            [Ledger::cash($o['buyer_id']), (int)$o['paid_cash'], $lbl],
            [Ledger::credit($o['buyer_id']), (int)$o['paid_credit'], $lbl],
        ]);
        self::set($db, $o, ['status' => 'iade', 'refunded_at' => yp_now_ms()]);
        if ($l) {
            $db->exec("UPDATE {listings} SET stock=stock+?, status=CASE WHEN status='satildi' THEN 'aktif' ELSE status END, updated_at=? WHERE id=?",
                [(int)$o['qty'], yp_now_ms(), (int)$l['id']]);
        }
        self::event($db, $o['id'], $actorId, $msg);
        Notify::send($db, $o['buyer_id'], 'Sipariş #' . $no . ' iptal edildi: ' . Rules::tl($o['total']) . ' bakiyenize iade edildi.', self::link($o), 'refund',
            ['no' => $no, 'tutar' => Rules::tl($o['total'])]);
        Notify::send($db, $o['seller_id'], 'Sipariş #' . $no . ' iptal edildi ve alıcıya iade yapıldı. Bu sipariş için teslimat yapmayın.', self::link($o), 'cancel_s', ['no' => $no]);
    }

    /* ================= alıcı: onay, teslim garantisi, itiraz ================= */

    public static function confirm(Db $db, array $o, array $u, $stars)
    {
        if (self::party($o, $u) !== 'buyer') {
            throw HttpError::forbidden('Bu işlemi yalnız alıcı yapabilir.');
        }
        if ($o['status'] !== 'teslim') {
            throw HttpError::conflict('Bu sipariş şu an onaylanamaz.');
        }
        return self::complete($db, $o, $stars === null ? null : max(1, min(5, (int)$stars)), $u['id']);
    }

    /** Teslim süresi (sunucu saatine göre) aşıldıysa alıcıya anında iade */
    public static function guarantee(Db $db, array $o, array $u)
    {
        if (self::party($o, $u) !== 'buyer') {
            throw HttpError::forbidden('Bu işlemi yalnız alıcı yapabilir.');
        }
        if ($o['status'] !== 'odendi') {
            throw HttpError::conflict('Teslim garantisi yalnız teslim edilmemiş siparişlerde kullanılabilir.');
        }
        $at = Rules::guaranteeAt($o['created_at'], $o['del_txt']);
        $left = $at - yp_now_ms();
        if ($left > 0) {
            throw new HttpError(409, 'Teslim süresi henüz dolmadı. ' . (int)ceil($left / 60000) . ' dk sonra teslim edilmezse iade isteyebilirsiniz.', 'not_late', ['lateAt' => $at]);
        }
        self::refund($db, $o, 'Teslim süresi aşıldı. Teslim garantisi kapsamında alıcıya anında iade yapıldı.', $u['id']);
    }

    /** $in: r (neden), d (açıklama), media[] (kind=dispute, isteğe bağlı, en çok 3) */
    public static function dispute(Db $db, array $o, array $u, array $in)
    {
        $side = self::party($o, $u);
        if (!$side) {
            throw HttpError::forbidden('Bu sipariş size ait değil.');
        }
        if (!in_array($o['status'], ['odendi', 'teslim'], true)) {
            throw HttpError::conflict($o['status'] === 'itiraz' ? 'Bu sipariş için zaten itiraz açık.' : 'Kapanmış siparişe itiraz açılamaz.');
        }
        $r = isset($in['r']) && is_string($in['r']) && in_array($in['r'], self::DISPUTE_REASONS, true) ? $in['r'] : 'Diğer';
        $d = isset($in['d']) && is_scalar($in['d']) ? Catalog::multiline((string)$in['d']) : '';
        if (mb_strlen($d, 'UTF-8') < 3) {
            throw HttpError::validation(['d' => 'Ne olduğunu kısaca anlatın.']);
        }
        $c = Censor::apply(mb_substr($d, 0, 1000, 'UTF-8'));
        $media = [];
        if (!empty($in['media'])) {
            $ids = is_array($in['media']) ? array_values($in['media']) : [$in['media']];
            if (count($ids) > 3) {
                throw HttpError::validation(['media' => 'En fazla 3 kanıt ekleyebilirsiniz.']);
            }
            $media = self::proofMedia($db, $ids, $u['id'], 'dispute', 'image', 'media', $o['id']);
        }
        $reason = $r . ': ' . $c['text'];
        $now = yp_now_ms();
        self::attachProofs($db, $o, 'dispute', $media);
        self::set($db, $o, ['status' => 'itiraz', 'reason' => yp_str($reason, 600), 'disputed_by' => (int)$u['id'], 'disputed_at' => $now]);
        self::event($db, $o['id'], $u['id'], ($side === 'seller' ? 'Satıcı' : 'Alıcı') . ' itiraz açtı: ' . $reason);
        if ($c['flagged']) {
            Censor::log($db, $u['id'], 'İtiraz #' . self::no($o), $d);
        }
        Notify::send($db, $side === 'seller' ? $o['buyer_id'] : $o['seller_id'], 'Sipariş #' . self::no($o) . ' için itiraz açıldı.', self::link($o), 'dispute', ['no' => self::no($o)]);
    }

    /** Sipariş mesajı (o.chat). $notify: karşı tarafa bildirim */
    public static function chat(Db $db, array $o, array $u, $x, $notify = true)
    {
        $staff = Perm::has($u, 'siparis');
        $side = self::party($o, $u);
        if (!$side && !$staff) {
            throw HttpError::forbidden('Bu sipariş size ait değil.');
        }
        if (in_array($o['status'], ['tamam', 'iade'], true)) {
            throw HttpError::conflict('Kapanmış siparişe mesaj yazılamaz.');
        }
        $x = Catalog::multiline((string)$x);
        if ($x === '' || mb_strlen($x, 'UTF-8') > 1000) {
            throw HttpError::validation(['x' => 'Mesaj 1-1000 karakter olmalı.']);
        }
        $c = Censor::apply($x);
        $db->insert('order_messages', ['order_id' => (int)$o['id'], 'from_id' => (int)$u['id'], 'x' => $c['text'], 'flagged' => $c['flagged'] ? 1 : 0, 't' => yp_now_ms()]);
        self::set($db, $o, []);
        if ($c['flagged']) {
            Censor::log($db, $u['id'], 'Sipariş #' . self::no($o), $x);
        }
        if ($notify) {
            $to = $side === 'buyer' ? [$o['seller_id']] : ($side === 'seller' ? [$o['buyer_id']] : [$o['buyer_id'], $o['seller_id']]);
            foreach ($to as $t) {
                Notify::send($db, $t, 'Sipariş #' . self::no($o) . ' için yeni mesaj.', self::link($o));
            }
        }
        return $c['flagged'];
    }

    /* ================= yönetim kararı (resolve) ================= */

    /** $to: 'seller' (ödemeyi aktar) | 'buyer' (iade) */
    public static function resolve(Db $db, array $o, array $staff, $to)
    {
        $was = $o['status'];
        if ($to === 'seller') {
            if (!in_array($was, ['itiraz', 'teslim'], true)) {
                throw HttpError::conflict('Bu sipariş satıcı lehine sonuçlandırılamaz (teslim edilmemiş ya da kapanmış).');
            }
            self::complete($db, $o, null, $staff['id']);
            self::event($db, $o['id'], $staff['id'], $staff['name'] . ' itirazı satıcı lehine sonuçlandırdı.');
            if ($was === 'itiraz') {
                Notify::send($db, $o['buyer_id'], '#' . self::no($o) . ' itirazı sonuçlandı: ödeme satıcıya aktarıldı.', self::link($o), 'dispute_done',
                    ['no' => self::no($o), 'durum' => 'ödeme satıcıya aktarıldı']);
            }
        } elseif ($to === 'buyer') {
            if (!in_array($was, self::OPEN, true)) {
                throw HttpError::conflict('Bu sipariş kapanmış.');
            }
            self::refund($db, $o, $staff['name'] . ' itirazı alıcı lehine sonuçlandırdı. ' . Rules::tl($o['total']) . ' iade edildi.', $staff['id']);
            if ($was === 'itiraz') {
                Notify::send($db, $o['seller_id'], '#' . self::no($o) . ' itirazı sonuçlandı: tutar alıcıya iade edildi.', self::link($o), 'dispute_done',
                    ['no' => self::no($o), 'durum' => 'tutar alıcıya iade edildi']);
            }
        } else {
            throw HttpError::validation(['to' => 'Karar seçin: satıcı ya da alıcı.']);
        }
        $db->update('orders', ['resolved_by' => (int)$staff['id']], 'id=?', [(int)$o['id']]);
        Audit::log($db, $staff['id'], 'order_resolve', 'order', self::no($o), ['to' => $to, 'from' => $was, 'total' => (int)$o['total']]);
    }

    /* ================= otomatik onay (yalnız cron) ================= */

    /** 1 saat kala uyarı, süre dolunca onay. Her sipariş kendi işleminde, kilitli ve durum yeniden denetlenerek. */
    public static function autoConfirm(Db $db, $limit = 100, $deadline = null)
    {
        $now = yp_now_ms();
        $ac = View::autoConfirmMs($db);
        $out = ['warned' => 0, 'confirmed' => 0];
        $warn = $db->all("SELECT id FROM {orders} WHERE status='teslim' AND warned_at IS NULL AND delivered_at<=? AND delivered_at>? ORDER BY id LIMIT " . (int)$limit,
            [$now - $ac + Rules::H, $now - $ac]);
        foreach ($warn as $r) {
            $db->tx(function (Db $db) use ($r, $now, $ac, &$out) {
                $o = self::lock($db, (int)$r['id']);
                if ($o['status'] !== 'teslim' || $o['warned_at'] !== null) {
                    return;
                }
                $at = (int)$o['delivered_at'] + $ac;
                if (!($at > $now && $at - $now <= Rules::H)) {
                    return;
                }
                $db->update('orders', ['warned_at' => $now], 'id=?', [(int)$o['id']]);
                Notify::send($db, $o['buyer_id'], '#' . self::no($o) . ' siparişiniz yaklaşık 1 saat sonra otomatik onaylanacak. Ürünü almadıysanız hemen itiraz edin.',
                    self::link($o), 'autosoon', ['no' => self::no($o)]);
                $out['warned']++;
            });
        }
        $due = $db->all("SELECT id FROM {orders} WHERE status='teslim' AND delivered_at<? ORDER BY delivered_at, id LIMIT " . (int)$limit, [$now - $ac]);
        foreach ($due as $r) {
            if ($deadline && microtime(true) > $deadline) {
                break;
            }
            $db->tx(function (Db $db) use ($r, $now, $ac, &$out) {
                $o = self::lock($db, (int)$r['id']);
                if ($o['status'] !== 'teslim' || (int)$o['delivered_at'] + $ac >= $now) {
                    return;
                }
                self::complete($db, $o, null, null);
                self::event($db, $o['id'], null, 'Süre dolduğu için otomatik onaylandı.');
                $out['confirmed']++;
            });
        }
        return $out;
    }

    /* ================= teslim kanıtı saklama ================= */

    /** Kapanmış (tamam/iade) siparişlerin $days günden eski teslim/itiraz kanıtlarını siler (disk sınırlı) */
    public static function purgeProofs(Db $db, $days, $limit = 300)
    {
        $days = max(1, (int)$days);
        $rows = $db->all("SELECT op.order_id, op.grp, op.pos, m.* FROM {order_proofs} op JOIN {media} m ON m.id=op.media_id JOIN {orders} o ON o.id=op.order_id
            WHERE o.status IN ('tamam','iade') AND m.created_at<? ORDER BY m.id LIMIT " . (int)$limit, [yp_now_ms() - $days * Rules::D]);
        foreach ($rows as $m) {
            $db->exec('DELETE FROM {order_proofs} WHERE order_id=? AND grp=? AND pos=?', [(int)$m['order_id'], $m['grp'], (int)$m['pos']]);
            \YP\Media::delete($db, $m);
        }
        return count($rows);
    }
}
