<?php
namespace YP\Exchange;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Money\Ledger;
use YP\Money\Rules;
use YP\Notify;
use YP\Perm;
use YP\Settings;
use YP\Text;

/**
 * Yang Borsası sunucu hizmeti (PLAN §1.4 Exchange, §4 P4): ön yüzdeki exorder / exoffer / of-cancel / exfix / ex-ready ve operatör
 * işlemlerinin (ex-claim, ex-pair, ex-unpair, ex-unpair-all, ex-match, exst/exdq/ex-done, ex-cancel, excall, exinfo, ex-power …)
 * karşılığı. Hesaplar YP\Exchange\Engine (JS paritesi) ile, para hareketleri Ledger üzerinden, satır kilitleriyle.
 *
 * Para akışı: alım siparişi → alıcının kovaları (önce kredi, sonra nakit: P2 spend kuralı) → ESCROW:EX. Her teslimde
 * ESCROW:EX → satıcı nakit (satış emri fiyatı × adet) + REV:borsa (alıcı fiyatı − satıcı fiyatı). Bitişte fiyat farkı, iptalde
 * kalan tutar alıcının ödediği kovalara (önce kredi) iade edilir. Satış emri para tutmaz.
 * Kilit sırası: sipariş(ler) (artan kimlik) → satış emirleri (artan kimlik) → cüzdanlar (Ledger, artan üye kimliği).
 * Her yöntem bir Db::tx içinde çağrılmalıdır.
 */
final class Exchange
{
    const OPEN = ['bekliyor', 'islemde', 'bilgi', 'kismen'];
    const EXS = ['bekliyor' => 'İşlem bekliyor', 'islemde' => 'İşlem bekliyor · üstlenildi', 'bilgi' => 'İşlem bekliyor · bilgi istendi',
                 'kismen' => 'Kısmen teslim edildi', 'tamam' => 'Tamamlandı', 'iptal' => 'İptal edildi'];
    const MAX_QTY = 1000000000;
    const MAX_TOTAL = 10000000000; // 100.000.000 TL
    const WIPE_DAYS = 7;
    const MASK = '••••••';
    const TYPES = ['text', 'password', 'number', 'select'];

    const RULES0 = "Teslimat sırasında oyuna girmeyin, aksi halde operatör hesaptan atılır.\nHesabınızda iki adımlı doğrulama açıksa geçici olarak kapatın veya kodu canlı destekten iletin.\nHesap bilgileriniz yalnızca teslimat için kullanılır ve işlem bitince sistemden silinir.";

    const FIELDS0 = [
        'buy' => [
            ['b1', 'Oyun içi kullanıcı (karakter) adı', 'text', '', 'Yang bu karaktere teslim edilir', 1, 0],
        ],
        'sell' => [
            ['f1', 'Oyun hesap adı (ID)', 'text', '', 'Oyuna giriş yaptığınız kullanıcı adı', 1, 0],
            ['f2', 'Hesap şifresi', 'password', '', 'Teslimattan sonra şifrenizi değiştirmenizi öneririz', 1, 1],
            ['f3', 'Karakter adı', 'text', '', 'Yangın yükleneceği / alınacağı karakter', 1, 0],
            ['f4', 'Depo şifresi', 'password', '', 'Yang depodaysa', 0, 1],
            ['f5', 'Hesaba bağlı e-posta', 'text', '', 'Girişte doğrulama kodu istenirse size ulaşmak için', 0, 0],
            ['f6', 'Giriş için uygun zaman', 'select', 'Hemen,Bugün 18:00 sonrası,Yarın sabah', '', 1, 0],
        ],
    ];

    /* ================= ayarlar ================= */

    public static function defaults()
    {
        return ['exOn' => true, 'exBuyOn' => true, 'exSellOn' => true, 'exPlace' => 'CH2 · Mavi bayrak · Gardiyan yanı', 'exMargin' => 12,
            'exOffMsg' => 'Yang Borsası kısa bir süreliğine hizmet vermiyor. Çok yakında yeniden açılacak.', 'exOffAt' => null, 'exAffected' => [],
            'rules' => self::RULES0];
    }

    public static function cfg(?Db $db = null)
    {
        $s = Settings::get('ex', $db);
        return array_replace(self::defaults(), is_array($s) ? $s : []);
    }

    public static function setCfg(Db $db, array $patch, $by)
    {
        Settings::set('ex', array_replace(self::cfg($db), $patch), $by, $db);
    }

    /** boot.set'e eklenen herkese açık borsa ayarları */
    public static function publicCfg(Db $db)
    {
        $c = self::cfg($db);
        return ['exOn' => (bool)$c['exOn'], 'exBuyOn' => (bool)$c['exBuyOn'], 'exSellOn' => (bool)$c['exSellOn'], 'exPlace' => (string)$c['exPlace'],
            'exMargin' => (float)$c['exMargin'], 'exOffMsg' => (string)$c['exOffMsg'], 'exOffAt' => $c['exOffAt'] !== null ? (int)$c['exOffAt'] : null];
    }

    public static function globalMarginBp(Db $db)
    {
        return Rules::bp(self::cfg($db)['exMargin']);
    }

    /* ================= kimlikler ================= */

    public static function oid($id)
    {
        return 'B' . (1000 + (int)$id);
    }

    public static function ofid($id)
    {
        return 'E' . (int)$id;
    }

    public static function xid($id)
    {
        return 'x' . (int)$id;
    }

    public static function parseOrder($ref)
    {
        $s = is_scalar($ref) ? (string)$ref : '';
        if (!preg_match('/^B([0-9]{4,18})$/', $s, $m) || (int)$m[1] <= 1000) {
            throw HttpError::notFound('Borsa siparişi bulunamadı.');
        }
        return (int)$m[1] - 1000;
    }

    public static function parseOffer($ref)
    {
        $s = is_scalar($ref) ? (string)$ref : '';
        if (!preg_match('/^E?([1-9][0-9]{0,17})$/', $s, $m)) {
            throw HttpError::notFound('Satış emri bulunamadı.');
        }
        return (int)$m[1];
    }

    public static function parseMarket($ref)
    {
        $s = is_scalar($ref) ? (string)$ref : '';
        if (!preg_match('/^x?([1-9][0-9]{0,17})$/', $s, $m)) {
            throw HttpError::notFound('Borsa satırı bulunamadı.');
        }
        return (int)$m[1];
    }

    /* ================= pazarlar ================= */

    public static function market(Db $db, $id)
    {
        return $db->one('SELECT * FROM {ex_markets} WHERE id=?', [(int)$id]);
    }

    public static function markets(Db $db, $onlyOn = false)
    {
        return $db->all('SELECT * FROM {ex_markets}' . ($onlyOn ? ' WHERE is_on=1' : '') . ' ORDER BY sort, id');
    }

    public static function presentMarket(array $m)
    {
        return ['id' => self::xid($m['id']), 'server' => Ids::sv($m['server_id']), 'unit' => (string)$m['unit'], 'max' => Text::tl($m['max']),
            'buy' => $m['buy'] === null ? null : Text::tl($m['buy']), 'margin' => $m['margin_bp'] === null ? null : ((int)$m['margin_bp']) / 100,
            'on' => (bool)(int)$m['is_on']];
    }

    /* ================= bilgi alanları ================= */

    public static function fields(Db $db, $set)
    {
        return $db->all('SELECT * FROM {ex_fields} WHERE fset=? ORDER BY pos, id', [$set]);
    }

    public static function presentField(array $f)
    {
        return ['id' => $f['fkey'], 'label' => $f['label'], 'type' => $f['type'], 'opts' => (string)$f['opts'], 'note' => (string)$f['note'],
            'req' => (bool)(int)$f['req'], 'secret' => (bool)(int)$f['secret']];
    }

    /** Varsayılan alanlar (göç 0005 ve boş tablo) */
    public static function seedFields(Db $db)
    {
        foreach (self::FIELDS0 as $set => $L) {
            if ((int)$db->val('SELECT COUNT(*) FROM {ex_fields} WHERE fset=?', [$set]) > 0) {
                continue;
            }
            foreach ($L as $i => $f) {
                $db->insertIgnore('ex_fields', ['fset' => $set, 'fkey' => $f[0], 'label' => $f[1], 'type' => $f[2], 'opts' => $f[3], 'note' => $f[4],
                    'req' => $f[5], 'secret' => $f[6], 'pos' => $i, 'updated_at' => yp_now_ms()]);
            }
        }
    }

    /**
     * Üyenin doldurduğu alanlar → satırlar. Hata: 422 (alan: exb_<id> / exf_<id>). Dönüş: [fkey => [label, secret, value]]
     */
    public static function readFields(Db $db, $set, $in, $prefix, $partial = false)
    {
        $in = is_array($in) ? $in : [];
        $out = [];
        $err = [];
        foreach (self::fields($db, $set) as $f) {
            $k = $f['fkey'];
            $v = isset($in[$k]) && is_scalar($in[$k]) ? trim(preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string)$in[$k])) : '';
            if ($partial && $v === '') {
                continue;
            }
            if (mb_strlen($v, 'UTF-8') > 200) {
                $err[$prefix . $k] = $f['label'] . ' en fazla 200 karakter olabilir.';
                continue;
            }
            if ($v === '' && (int)$f['req']) {
                $err[$prefix . $k] = $f['label'] . ' alanını doldurun.';
                continue;
            }
            if ($v !== '' && $f['type'] === 'number' && !is_numeric(str_replace(',', '.', $v))) {
                $err[$prefix . $k] = $f['label'] . ' bir sayı olmalı.';
                continue;
            }
            if ($v !== '' && $f['type'] === 'select') {
                $opts = array_values(array_filter(array_map('trim', explode(',', (string)$f['opts'])), 'strlen'));
                if ($opts && !in_array($v, $opts, true)) {
                    $err[$prefix . $k] = $f['label'] . ' için listeden seçin.';
                    continue;
                }
            }
            $out[$k] = [$f['label'], (int)$f['secret'], $v];
        }
        if ($err) {
            throw HttpError::validation($err);
        }
        return $out;
    }

    private static function writeFields(Db $db, $table, $col, $id, array $vals)
    {
        $now = yp_now_ms();
        foreach ($vals as $k => $x) {
            list($label, $secret, $v) = $x;
            $row = [$col => (int)$id, 'fkey' => $k, 'label' => yp_str($label, 120), 'secret' => $secret ? 1 : 0,
                'value' => $secret ? '' : yp_str($v, 500), 'value_enc' => $secret && $v !== '' ? yp_encrypt($v) : null, 'set_at' => $now];
            $db->upsert($table, $row, [$col, 'fkey']);
        }
    }

    /**
     * Alan değerleri (S.exOrders[].f / S.exOffers[].f şekli). $reveal: gizli değerler açık (yalnız [borsa], audit'li);
     * değilse kayıtlı gizli değer '••••••', silinmişse ''.
     */
    public static function fieldValues(Db $db, $table, $col, array $ids, $reveal = false)
    {
        $out = [];
        if (!$ids) {
            return $out;
        }
        $ids = array_values(array_unique(array_map('intval', $ids)));
        foreach ($db->all('SELECT * FROM {' . $table . '} WHERE ' . $col . ' IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) as $r) {
            $v = (string)$r['value'];
            if ((int)$r['secret']) {
                if ($r['value_enc'] === null) {
                    $v = '';
                } elseif ($reveal) {
                    $d = yp_decrypt($r['value_enc']);
                    $v = $d === false || $d === null ? '' : (string)$d;
                } else {
                    $v = self::MASK;
                }
            }
            $out[(int)$r[$col]][$r['fkey']] = $v;
        }
        return $out;
    }

    /* ================= gizli bilgilerin silinmesi ================= */

    public static function wipeOrder(Db $db, $orderId)
    {
        $n = $db->exec('UPDATE {ex_order_fields} SET value_enc=NULL WHERE order_id=? AND value_enc IS NOT NULL', [(int)$orderId]);
        $db->exec('UPDATE {ex_orders} SET wiped_at=? WHERE id=? AND wiped_at IS NULL', [yp_now_ms(), (int)$orderId]);
        return $n;
    }

    public static function wipeOffer(Db $db, $offerId)
    {
        $n = $db->exec('UPDATE {ex_offer_fields} SET value_enc=NULL WHERE offer_id=? AND value_enc IS NOT NULL', [(int)$offerId]);
        $db->exec('UPDATE {ex_offers} SET wiped_at=? WHERE id=? AND wiped_at IS NULL', [yp_now_ms(), (int)$offerId]);
        return $n;
    }

    /** Satış emri artık kullanılmıyorsa (aktif değil ve açık siparişlerde teslim bekleyen eşlemesi yok) gizli bilgileri silinir. */
    public static function wipeOfferIfDone(Db $db, $offerId)
    {
        $of = $db->one('SELECT status FROM {ex_offers} WHERE id=?', [(int)$offerId]);
        if (!$of || $of['status'] === 'aktif') {
            return 0;
        }
        $pending = (int)$db->val("SELECT COUNT(*) FROM {ex_fills} f JOIN {ex_orders} o ON o.id=f.order_id WHERE f.offer_id=? AND f.paid_qty<f.qty
            AND o.status IN ('bekliyor','islemde','bilgi','kismen')", [(int)$offerId]);
        return $pending ? 0 : self::wipeOffer($db, $offerId);
    }

    /* ================= motor ↔ satırlar ================= */

    public static function engOffer(array $r)
    {
        return ['id' => (int)$r['id'], 'u' => (int)$r['user_id'], 'qty' => (int)$r['qty'], 'left' => (int)$r['left_qty'], 'price' => (int)$r['price'],
            'status' => $r['status'], 't' => (int)$r['created_at']];
    }

    public static function fillsOf(Db $db, $orderId)
    {
        return $db->all('SELECT * FROM {ex_fills} WHERE order_id=? ORDER BY price, id', [(int)$orderId]);
    }

    public static function engOrder(array $r, array $fills)
    {
        return ['id' => (int)$r['id'], 'u' => (int)$r['user_id'], 'qty' => (int)$r['qty'], 'price' => (int)$r['price'], 'total' => (int)$r['total'],
            'paid' => ['w' => (int)$r['paid_cash'], 'nw' => (int)$r['paid_credit']], 'delivered' => (int)$r['delivered'], 'cost' => (int)$r['cost'],
            'reserve' => (int)$r['reserve'],
            'fills' => array_map(function ($f) {
                return ['id' => (int)$f['id'], 'of' => (int)$f['offer_id'], 'u' => (int)$f['seller_id'], 'qty' => (int)$f['qty'], 'price' => (int)$f['price'],
                    'sell' => (int)$f['sell'], 'paidQty' => (int)$f['paid_qty']];
            }, $fills)];
    }

    /** Kilitli sipariş satırı */
    public static function lockOrder(Db $db, $ref)
    {
        $id = is_int($ref) ? $ref : self::parseOrder($ref);
        $o = $db->one('SELECT * FROM {ex_orders} WHERE id=?' . $db->forUpdate(), [$id]);
        if (!$o) {
            throw HttpError::notFound('Borsa siparişi bulunamadı.');
        }
        return $o;
    }

    /** Satış emirlerini artan kimlik sırasıyla kilitler. Dönüş [id => motor teklifi] */
    public static function lockOffers(Db $db, array $ids)
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        sort($ids, SORT_NUMERIC);
        if (!$ids) {
            return [];
        }
        $out = [];
        foreach ($db->all('SELECT * FROM {ex_offers} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY id' . $db->forUpdate(), $ids) as $r) {
            $out[(int)$r['id']] = self::engOffer($r);
        }
        return $out;
    }

    private static function marketOffers(Db $db, $marketId, $lock)
    {
        $out = [];
        foreach ($db->all("SELECT * FROM {ex_offers} WHERE market_id=? AND status='aktif' AND left_qty>0 ORDER BY id" . ($lock ? $db->forUpdate() : ''), [(int)$marketId]) as $r) {
            $out[(int)$r['id']] = self::engOffer($r);
        }
        return $out;
    }

    /** Motorun değiştirdiği siparişi (ve eşlemelerini) yazar. $set: ek sütunlar */
    private static function saveOrder(Db $db, array $row, array $orig, array $o, array $set = [])
    {
        $now = yp_now_ms();
        $keep = [];
        foreach ($o['fills'] as $f) {
            if (!empty($f['id'])) {
                $keep[(int)$f['id']] = true;
                $db->update('ex_fills', ['qty' => (int)$f['qty'], 'paid_qty' => (int)$f['paidQty']], 'id=?', [(int)$f['id']]);
            } else {
                $db->insert('ex_fills', ['order_id' => (int)$row['id'], 'offer_id' => (int)$f['of'], 'seller_id' => (int)$f['u'], 'qty' => (int)$f['qty'],
                    'paid_qty' => (int)$f['paidQty'], 'price' => (int)$f['price'], 'sell' => (int)$f['sell'], 'created_at' => $now]);
            }
        }
        foreach ($orig['fills'] as $f) {
            if (!isset($keep[(int)$f['id']])) {
                $db->exec('DELETE FROM {ex_fills} WHERE id=?', [(int)$f['id']]);
            }
        }
        $db->update('ex_orders', array_merge(['total' => (int)$o['total'], 'paid_cash' => (int)$o['paid']['w'], 'paid_credit' => (int)$o['paid']['nw'],
            'delivered' => (int)$o['delivered'], 'cost' => (int)$o['cost'], 'reserve' => (int)$o['reserve'], 'updated_at' => $now,
            'version' => (int)$row['version'] + 1], $set), 'id=?', [(int)$row['id']]);
    }

    private static function saveOffers(Db $db, array $orig, array $offers)
    {
        $now = yp_now_ms();
        foreach ($offers as $id => $of) {
            $o0 = isset($orig[$id]) ? $orig[$id] : null;
            if ($o0 && (int)$o0['left'] === (int)$of['left'] && $o0['status'] === $of['status']) {
                continue;
            }
            $set = ['left_qty' => (int)$of['left'], 'status' => $of['status'], 'updated_at' => $now];
            if ($of['status'] !== 'aktif' && (!$o0 || $o0['status'] === 'aktif')) {
                $set['closed_at'] = $now;
            } elseif ($of['status'] === 'aktif') {
                $set['closed_at'] = null;
            }
            $db->update('ex_offers', $set, 'id=?', [(int)$id]);
        }
    }

    public static function event(Db $db, $orderId, $actorId, $x)
    {
        $db->insert('ex_events', ['order_id' => (int)$orderId, 'actor_id' => $actorId ? (int)$actorId : null, 'x' => yp_str($x, 2000), 't' => yp_now_ms()]);
    }

    /** exStatus(o,status,msg,noteUser) */
    private static function status(Db $db, array $row, $status, $msg, $noteUser, $actorId, array $set = [])
    {
        $db->update('ex_orders', array_merge(['status' => $status, 'updated_at' => yp_now_ms(), 'version' => (int)$row['version'] + 1], $set), 'id=?', [(int)$row['id']]);
        self::event($db, $row['id'], $actorId, $msg);
        $t = $noteUser ?: self::EXS[$status];
        Notify::send($db, $row['user_id'], 'Borsa siparişi #' . self::oid($row['id']) . ': ' . $t, '#hesabim', 'borsa', ['no' => self::oid($row['id']), 'durum' => $t]);
    }

    private static function bumpVersion(Db $db, $orderId)
    {
        $db->exec('UPDATE {ex_orders} SET version=version+1, updated_at=? WHERE id=?', [yp_now_ms(), (int)$orderId]);
    }

    private static function unitOf(Db $db, $marketId)
    {
        $m = self::market($db, $marketId);
        return $m ? (string)$m['unit'] : '';
    }

    private static function name($u)
    {
        return is_array($u) ? (string)$u['name'] : 'Ekip';
    }

    private static function requireOpen(array $o)
    {
        if (!in_array($o['status'], self::OPEN, true)) {
            throw HttpError::conflict('Bu borsa siparişi kapandı.');
        }
    }

    /* ================= üye: alım siparişi (exorder) ================= */

    /** $in: market ('x1'), qty, f {b1:…}. Dönüş: sipariş satırı */
    public static function placeOrder(Db $db, array $u, array $in)
    {
        $c = self::cfg($db);
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız askıda olduğu için işlem yapamazsınız.');
        }
        if (empty($c['exOn']) || empty($c['exBuyOn'])) {
            throw new HttpError(409, trim('Siteden yang alımı şu an kapalı. ' . (string)$c['exOffMsg']), 'ex_closed');
        }
        $m = self::market($db, self::parseMarket(isset($in['market']) ? $in['market'] : (isset($in['ex']) ? $in['ex'] : '')));
        if (!$m || !(int)$m['is_on']) {
            throw new HttpError(409, 'Bu server şu an borsada değil.', 'ex_market');
        }
        if ($m['buy'] === null || (int)$m['buy'] <= 0) {
            throw new HttpError(409, 'Bu server için satış fiyatı henüz belirlenmedi.', 'ex_price');
        }
        $q = isset($in['qty']) ? $in['qty'] : null;
        if (!is_numeric($q) || (int)$q != $q || (int)$q < 1 || (int)$q > self::MAX_QTY) {
            throw HttpError::validation(['ex_qty' => 'Geçerli bir adet girin.']);
        }
        $q = (int)$q;
        $bp = (int)$m['buy'];
        $total = $q * $bp;
        if ($total > self::MAX_TOTAL) {
            throw HttpError::validation(['ex_qty' => 'Tutar çok yüksek.']);
        }
        $vals = self::readFields($db, 'buy', isset($in['f']) ? $in['f'] : [], 'exb_');
        $w = Ledger::lockWallets($db, [$u['id']])[(int)$u['id']];
        $split = Rules::split($w['cash'], $w['credit'], $total);
        if ($split === null) {
            throw new HttpError(409, 'Bakiye yetersiz. ' . Rules::tl($total - $w['cash'] - $w['credit']) . ' daha yükleyin.', 'insufficient',
                ['need' => Text::tl($total - $w['cash'] - $w['credit'])]);
        }
        $stk = Engine::stock(self::marketOffers($db, $m['id'], false));
        $miss = max(0, $q - $stk);
        $now = yp_now_ms();
        $id = $db->insert('ex_orders', ['user_id' => (int)$u['id'], 'dir' => 'al', 'market_id' => (int)$m['id'], 'server_id' => (int)$m['server_id'],
            'qty' => $q, 'price' => $bp, 'total' => $total, 'paid_cash' => $split[0], 'paid_credit' => $split[1], 'place' => yp_str($c['exPlace'], 160),
            'status' => 'bekliyor', 'created_at' => $now, 'updated_at' => $now]);
        self::writeFields($db, 'ex_order_fields', 'order_id', $id, $vals);
        $no = self::oid($id);
        $lbl = 'Borsa alımı #' . $no;
        $jid = Ledger::post($db, 'satin_alma', ['ref_type' => 'exorder', 'ref_id' => $no, 'user' => $u['id'], 'amount' => $total, 'actor' => $u['id'],
            'meta' => ['ref' => $no, 'm' => 'Borsa alımı · ' . Rules::num($q) . ' ' . $m['unit']]], [
            [Ledger::cash($u['id']), -$split[0], $lbl],
            [Ledger::credit($u['id']), -$split[1], $lbl],
            ['ESCROW:EX', $total],
        ]);
        $db->update('ex_orders', ['journal_id' => $jid], 'id=?', [$id]);
        self::event($db, $id, $u['id'], 'Sipariş alındı: ' . Rules::num($q) . ' adet × ' . Rules::tl($bp) . ' = ' . Rules::tl($total) . ' bakiyeden çekildi.'
            . ($miss ? ' Sipariş anında stok ' . Rules::num($stk) . ' adetti.' : ''));
        $char = isset($vals['b1']) && $vals['b1'][2] !== '' && !$vals['b1'][1] ? $vals['b1'][2] : 'karakterinize';
        Notify::send($db, $u['id'], 'Borsa siparişiniz #' . $no . ' sıraya alındı.' . ($miss ? ' Stok şu an ' . Rules::num($stk) . ' adet; kalan kısım yeni satış emirleriyle tamamlanacak.' : '')
            . ' Operatör ' . $c['exPlace'] . ' noktasında ' . $char . ' teslim edecek.', '#hesabim', 'borsa', ['no' => $no, 'durum' => 'Sıraya alındı']);
        return $db->one('SELECT * FROM {ex_orders} WHERE id=?', [$id]);
    }

    /* ================= üye: satış emri (exoffer) ================= */

    public static function placeOffer(Db $db, array $u, array $in)
    {
        $c = self::cfg($db);
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız askıda olduğu için işlem yapamazsınız.');
        }
        if (empty($c['exOn']) || empty($c['exSellOn'])) {
            throw new HttpError(409, trim('Satış emri verme şu an kapalı. ' . (string)$c['exOffMsg']), 'ex_closed');
        }
        $m = self::market($db, self::parseMarket(isset($in['market']) ? $in['market'] : (isset($in['ex']) ? $in['ex'] : '')));
        if (!$m || !(int)$m['is_on']) {
            throw new HttpError(409, 'Bu server şu an borsada değil.', 'ex_market');
        }
        $q = isset($in['qty']) ? $in['qty'] : null;
        if (!is_numeric($q) || (int)$q != $q || (int)$q < 1 || (int)$q > self::MAX_QTY) {
            throw HttpError::validation(['ex_qty' => 'Geçerli bir adet girin.']);
        }
        $q = (int)$q;
        $p = isset($in['price']) ? Text::kurus($in['price']) : null;
        if ($p === null || $p <= 0) {
            throw HttpError::validation(['ex_price' => 'Geçerli bir fiyat girin.']);
        }
        if ($p > (int)$m['max']) {
            throw HttpError::validation(['ex_price' => 'Bu server için en fazla ' . Rules::tl($m['max']) . ' fiyat girebilirsiniz.']);
        }
        if ($q * $p > self::MAX_TOTAL) {
            throw HttpError::validation(['ex_qty' => 'Tutar çok yüksek.']);
        }
        $vals = self::readFields($db, 'sell', isset($in['f']) ? $in['f'] : [], 'exf_');
        if (empty($in['ok'])) {
            throw HttpError::validation(['ex_ok' => 'Satış kurallarını onaylayın.']);
        }
        $now = yp_now_ms();
        $id = $db->insert('ex_offers', ['user_id' => (int)$u['id'], 'market_id' => (int)$m['id'], 'qty' => $q, 'left_qty' => $q, 'price' => $p,
            'status' => 'aktif', 'created_at' => $now, 'updated_at' => $now]);
        self::writeFields($db, 'ex_offer_fields', 'offer_id', $id, $vals);
        $rank = 0;
        foreach (Engine::book(self::marketOffers($db, $m['id'], false)) as $i => $o) {
            if ((int)$o['id'] === (int)$id) {
                $rank = $i + 1;
            }
        }
        Notify::send($db, $u['id'], 'Satış emriniz #' . self::ofid($id) . ' yayında: ' . Rules::num($q) . ' adet × ' . Rules::tl($p) . '.' . ($rank ? ' Sıradaki yeriniz: ' . $rank . '.' : ''),
            '#hesabim', 'borsa', ['no' => self::ofid($id), 'durum' => 'Yayında']);
        return [$db->one('SELECT * FROM {ex_offers} WHERE id=?', [$id]), $rank];
    }

    /** of-cancel: sahibi ya da [borsa]. Eşlenmiş ama teslim edilmemiş adetler siparişlerde kalır (operatör eşlemeyi silebilir). */
    public static function cancelOffer(Db $db, array $u, $ref)
    {
        $id = self::parseOffer($ref);
        $of = $db->one('SELECT * FROM {ex_offers} WHERE id=?' . $db->forUpdate(), [$id]);
        if (!$of) {
            throw HttpError::notFound('Satış emri bulunamadı.');
        }
        $staff = Perm::has($u, 'borsa');
        if ((int)$of['user_id'] !== (int)$u['id'] && !$staff) {
            throw HttpError::forbidden('Bu satış emri size ait değil.');
        }
        if ($of['status'] !== 'aktif') {
            throw HttpError::conflict('Bu satış emri zaten kapandı.');
        }
        $now = yp_now_ms();
        $db->update('ex_offers', ['status' => 'iptal', 'updated_at' => $now, 'closed_at' => $now], 'id=?', [$id]);
        self::wipeOfferIfDone($db, $id);
        if ((int)$of['user_id'] !== (int)$u['id']) {
            Audit::log($db, $u['id'], 'ex_offer_cancel', 'ex_offer', self::ofid($id), ['left' => (int)$of['left_qty']]);
        }
        Notify::send($db, $of['user_id'], 'Satış emriniz #' . self::ofid($id) . ' iptal edildi.', '#hesabim', 'borsa', ['no' => self::ofid($id), 'durum' => 'İptal edildi']);
        return $db->one('SELECT * FROM {ex_offers} WHERE id=?', [$id]);
    }

    /* ================= üye: bilgileri güncelle (exfix), hazırım (ex-ready) ================= */

    public static function fixFields(Db $db, array $u, array $o, $in)
    {
        if ((int)$o['user_id'] !== (int)$u['id']) {
            throw HttpError::forbidden('Bu sipariş size ait değil.');
        }
        self::requireOpen($o);
        $vals = self::readFields($db, 'buy', $in, 'fx_', true);
        if (!$vals) {
            throw HttpError::validation(['fx' => 'Güncellenecek bilgiyi yazın.']);
        }
        self::writeFields($db, 'ex_order_fields', 'order_id', $o['id'], $vals);
        $db->update('ex_orders', ['status' => (int)$o['delivered'] > 0 ? 'kismen' : 'bekliyor', 'note' => '', 'updated_at' => yp_now_ms(),
            'version' => (int)$o['version'] + 1], 'id=?', [(int)$o['id']]);
        self::event($db, $o['id'], $u['id'], 'Üye bilgilerini güncelledi.');
    }

    public static function ready(Db $db, array $u, array $o)
    {
        if ((int)$o['user_id'] !== (int)$u['id']) {
            throw HttpError::forbidden('Bu sipariş size ait değil.');
        }
        self::requireOpen($o);
        $now = yp_now_ms();
        $db->update('ex_orders', ['ready_at' => $now, 'updated_at' => $now, 'version' => (int)$o['version'] + 1], 'id=?', [(int)$o['id']]);
        self::event($db, $o['id'], $u['id'], 'Alıcı teslimat noktasında hazır olduğunu bildirdi.');
        $f = self::fieldValues($db, 'ex_order_fields', 'order_id', [$o['id']]);
        $char = isset($f[(int)$o['id']]['b1']) && $f[(int)$o['id']]['b1'] !== self::MASK && $f[(int)$o['id']]['b1'] !== '' ? $f[(int)$o['id']]['b1'] : $u['name'];
        $to = $o['staff_id'] ? [(int)$o['staff_id']] : array_map('intval', array_column($db->all("SELECT id FROM {users} WHERE role='admin' AND status='active'"), 'id'));
        foreach ($to as $sid) {
            Notify::send($db, $sid, 'Borsa #' . self::oid($o['id']) . ': alıcı hazır · ' . $char . ' · ' . ($o['place'] !== '' ? $o['place'] : self::cfg($db)['exPlace']),
                '#yonetim/borsa/siparisler?id=' . self::oid($o['id']));
        }
    }

    /* ================= operatör [borsa] ================= */

    public static function claim(Db $db, array $staff, array $o)
    {
        self::requireOpen($o);
        if ($o['staff_id'] && (int)$o['staff_id'] !== (int)$staff['id']) {
            $n = $db->val('SELECT name FROM {users} WHERE id=?', [(int)$o['staff_id']]);
            throw HttpError::conflict('Bu sipariş ' . ($n ?: 'başka bir çalışan') . ' tarafından üstlenildi.');
        }
        $place = $o['place'] !== '' ? $o['place'] : self::cfg($db)['exPlace'];
        self::status($db, $o, in_array($o['status'], ['bekliyor', 'bilgi'], true) ? 'islemde' : $o['status'], self::name($staff) . ' işlemi üstlendi.',
            'Operatör yola çıktı, ' . $place . ' noktasında ticaret açacak.', $staff['id'], ['staff_id' => (int)$staff['id']]);
    }

    public static function callMsg(Db $db, array $o)
    {
        $f = self::fieldValues($db, 'ex_order_fields', 'order_id', [$o['id']]);
        $b1 = isset($f[(int)$o['id']]['b1']) && $f[(int)$o['id']]['b1'] !== self::MASK ? $f[(int)$o['id']]['b1'] : '';
        return 'Teslimat için hazırız! ' . ($o['place'] !== '' ? $o['place'] : self::cfg($db)['exPlace']) . ' noktasına ' . ($b1 !== '' ? $b1 . ' karakterinizle ' : '')
            . 'gelin, operatörümüz ticaret açacak.';
    }

    public static function call(Db $db, array $staff, array $o, $msg)
    {
        self::requireOpen($o);
        $m = trim(is_scalar($msg) ? (string)$msg : '');
        if ($m === '') {
            $m = self::callMsg($db, $o);
        }
        $m = yp_str($m, 400);
        $now = yp_now_ms();
        $db->update('ex_orders', ['called_at' => $now, 'call_msg' => $m, 'staff_id' => $o['staff_id'] ?: (int)$staff['id'],
            'status' => $o['status'] === 'bekliyor' ? 'islemde' : $o['status'], 'updated_at' => $now, 'version' => (int)$o['version'] + 1], 'id=?', [(int)$o['id']]);
        self::event($db, $o['id'], $staff['id'], self::name($staff) . ' alıcıyı çağırdı: ' . $m);
        Notify::send($db, $o['user_id'], 'Borsa #' . self::oid($o['id']) . ': ' . $m, '#borsa', 'call', ['no' => self::oid($o['id']), 'mesaj' => $m]);
    }

    public static function info(Db $db, array $staff, array $o, $msg)
    {
        self::requireOpen($o);
        $m = trim(is_scalar($msg) ? (string)$msg : '');
        $m = yp_str($m !== '' ? $m : 'Hesap bilgilerinizi kontrol edin.', 400);
        self::status($db, $o, 'bilgi', self::name($staff) . ' üyeden bilgi istedi: ' . $m, 'Girişte sorun var: ' . $m, $staff['id'], ['note' => $m]);
    }

    /** ex-pair: {offer:'E4', qty} */
    public static function pair(Db $db, array $staff, array $row, $offerRef, $qty)
    {
        self::requireOpen($row);
        $ofId = self::parseOffer($offerRef);
        $fills = self::fillsOf($db, $row['id']);
        $offers = self::lockOffers($db, [$ofId]);
        if (!isset($offers[$ofId])) {
            throw HttpError::notFound('Satış emri bulunamadı.');
        }
        if ((int)$db->val('SELECT market_id FROM {ex_offers} WHERE id=?', [$ofId]) !== (int)$row['market_id']) {
            throw HttpError::conflict('Bu satış emri başka bir servera ait.');
        }
        if ($offers[$ofId]['status'] !== 'aktif') {
            throw HttpError::conflict('Bu satış emri artık satışta değil.');
        }
        $orig = self::engOrder($row, $fills);
        $o = $orig;
        $off0 = $offers;
        $err = Engine::pair($o, $offers, $ofId, $qty);
        if ($err !== null) {
            throw HttpError::validation(['pq' => $err]);
        }
        $q = Engine::matched($o) - Engine::matched($orig);
        self::saveOffers($db, $off0, $offers);
        self::saveOrder($db, $row, $orig, $o);
        $rest = (int)$o['qty'] - Engine::matched($o);
        $of = $offers[$ofId];
        Notify::send($db, $of['u'], 'Satış emriniz #' . self::ofid($ofId) . ': ' . Rules::num($q) . ' adet eşleşti. Operatör hesabınıza girip yangı alacak.', '#hesabim', 'borsa',
            ['no' => self::ofid($ofId), 'durum' => 'Eşleşti']);
        self::event($db, $row['id'], $staff['id'], self::name($staff) . ' satış emri #' . self::ofid($ofId) . ' ile ' . Rules::num($q) . ' adet × ' . Rules::tl($of['price'])
            . ' eşledi.' . ($rest > 0 ? ' Eşlenecek kalan: ' . Rules::num($rest) . ' adet.' : ' Siparişin tamamı eşlendi.'));
        Notify::send($db, $row['user_id'], 'Borsa siparişiniz #' . self::oid($row['id']) . ': ' . Rules::num($q) . ' adet hazırlanıyor.' . ($rest > 0 ? '' : ' Teslimat için operatör sizi çağıracak.'),
            '#hesabim', 'borsa', ['no' => self::oid($row['id']), 'durum' => 'Hazırlanıyor']);
        return $q;
    }

    /** ex-unpair {offer} | ex-unpair-all (offer null). Dönüş: satış emirlerine dönen adet */
    public static function unpair(Db $db, array $staff, array $row, $offerRef = null)
    {
        self::requireOpen($row);
        $fills = self::fillsOf($db, $row['id']);
        $orig = self::engOrder($row, $fills);
        $targets = [];
        if ($offerRef === null) {
            foreach ($orig['fills'] as $f) {
                if ($f['paidQty'] < $f['qty']) {
                    $targets[] = $f['of'];
                }
            }
            $targets = array_values(array_unique($targets));
        } else {
            $targets = [self::parseOffer($offerRef)];
        }
        if (!$targets) {
            return 0;
        }
        $offers = self::lockOffers($db, $targets);
        $off0 = $offers;
        $o = $orig;
        $n = 0;
        foreach ($targets as $id) {
            $r = Engine::unpair($o, $offers, $id);
            if ($r > 0) {
                $n += $r;
                self::event($db, $row['id'], $staff['id'], self::name($staff) . ' satış emri #' . self::ofid($id) . ' eşlemesini geri aldı (' . Rules::num($r) . ' adet emre iade edildi).');
            }
        }
        if ($n > 0) {
            self::saveOffers($db, $off0, $offers);
            self::saveOrder($db, $row, $orig, $o);
        }
        return $n;
    }

    /** ex-match: pazarın eksik siparişlerini (eskiden yeniye) en ucuz satış emirleriyle eşler. Dönüş: eşlenen adet */
    public static function match(Db $db, array $staff, $marketId)
    {
        $m = self::market($db, $marketId);
        if (!$m) {
            throw HttpError::notFound('Borsa satırı bulunamadı.');
        }
        $rows = $db->all("SELECT * FROM {ex_orders} WHERE market_id=? AND status IN ('bekliyor','islemde','bilgi','kismen') ORDER BY id" . $db->forUpdate(), [(int)$marketId]);
        $offers = self::marketOffers($db, $marketId, true);
        $off0 = $offers;
        $mbp = Engine::marginBp($m['margin_bp'], self::globalMarginBp($db));
        usort($rows, function ($a, $b) {
            return ((int)$a['created_at'] <=> (int)$b['created_at']) ?: ((int)$a['id'] <=> (int)$b['id']);
        });
        $n = 0;
        $hit = [];
        foreach ($rows as $row) {
            $orig = self::engOrder($row, self::fillsOf($db, $row['id']));
            if (Engine::matched($orig) >= (int)$row['qty']) {
                continue;
            }
            $o = $orig;
            list($got, $fl) = Engine::matchOne($o, $offers, $mbp);
            if (!$got) {
                continue;
            }
            $n += $got;
            foreach ($fl as $f) {
                $hit[$f['of']] = (isset($hit[$f['of']]) ? $hit[$f['of']] : 0) + $f['qty'];
            }
            self::saveOrder($db, $row, $orig, $o);
            $rest = (int)$o['qty'] - Engine::matched($o);
            self::event($db, $row['id'], $staff['id'], 'Eksik miktar için ' . Rules::num($got) . ' adet en ucuz satış emirleriyle eşleşti (' . implode(', ', array_map(function ($f) {
                return Rules::num($f['qty']) . ' × ' . Rules::tl($f['price']);
            }, $fl)) . ').' . ($rest > 0 ? ' Hâlâ eksik: ' . Rules::num($rest) . ' adet.' : ' Siparişin tamamı karşılandı.'));
            Notify::send($db, $row['user_id'], 'Borsa siparişiniz #' . self::oid($row['id']) . ': ' . Rules::num($got) . ' adet daha eşleşti.' . ($rest > 0 ? ' Eksik: ' . Rules::num($rest)
                : ' Siparişin tamamı karşılandı, teslimat yapılacak.'), '#hesabim', 'borsa', ['no' => self::oid($row['id']), 'durum' => 'Eşleşti']);
        }
        self::saveOffers($db, $off0, $offers);
        foreach ($hit as $ofId => $q) {
            Notify::send($db, $offers[$ofId]['u'], 'Satış emriniz #' . self::ofid($ofId) . ': ' . Rules::num($q) . ' adet eşleşti. Operatör hesabınıza girip yangı alacak.', '#hesabim', 'borsa',
                ['no' => self::ofid($ofId), 'durum' => 'Eşleşti']);
        }
        return $n;
    }

    /** exDeliver'ın defter ve yan etkileri (kilitli sipariş + teklifler; $o motor durumu güncellenmiş) */
    private static function postDelivery(Db $db, array $row, array $o, array $offers, array $r, $actorId)
    {
        if ($r['d'] <= 0) {
            return;
        }
        $no = self::oid($row['id']);
        $unit = self::unitOf($db, $row['market_id']);
        $lines = [['ESCROW:EX', -$r['val']]];
        foreach ($r['pay'] as $p) {
            list($su, $ofId, $n, $amt) = $p;
            $lines[] = [Ledger::cash($su), $amt, 'Borsa satışı (emir #' . self::ofid($ofId) . ')'];
        }
        $lines[] = ['REV:borsa', $r['val'] - $r['cost']];
        Ledger::post($db, 'borsa', ['ref_type' => 'exorder', 'ref_id' => $no, 'user' => $row['user_id'], 'amount' => $r['val'], 'actor' => $actorId,
            'meta' => ['cost' => $r['cost'], 'profit' => Text::tl($r['val'] - $r['cost']), 'ref' => $no, 'm' => Rules::num($r['d']) . ' ' . $unit]], $lines);
        $db->exec('UPDATE {ex_orders} SET released=released+? WHERE id=?', [$r['val'], (int)$row['id']]);
        foreach ($r['pay'] as $p) {
            list($su, $ofId, $n, $amt) = $p;
            Notify::send($db, $su, 'Satış emrinizden ' . Rules::num($n) . ' adet satıldı, ' . Rules::tl($amt) . ' bakiyenize geçti.', '#hesabim', 'borsa',
                ['no' => self::ofid($ofId), 'durum' => 'Ödendi']);
        }
        // alıcı hacmi ve puanı teslim edilen değer kadar (PLAN §1.4 VIP: borsa)
        $buyer = $db->one('SELECT id, vol FROM {users} WHERE id=?', [(int)$row['user_id']]);
        if ($buyer) {
            $pts = Rules::points($r['val'], Rules::vip((int)$buyer['vol'], Rules::vipLevels($db))['cb']);
            $db->exec('UPDATE {users} SET pts=pts+?, vol=vol+? WHERE id=?', [$pts, $r['val'], (int)$buyer['id']]);
            if ($pts) {
                $db->insert('points_log', ['user_id' => (int)$buyer['id'], 'delta' => $pts, 'reason' => 'borsa', 'ref' => $no, 't' => yp_now_ms()]);
            }
            \YP\Growth\Events::spent($db, (int)$buyer['id'], (int)$r['val'], 'borsa'); // çekiliş bileti (P5), teslim edilen değer kadar
        }
        foreach (array_unique($r['wipe']) as $ofId) {
            self::wipeOfferIfDone($db, $ofId);
        }
    }

    private static function postRefund(Db $db, array $row, array $split, $label, $actorId, $memo)
    {
        $back = $split[0] + $split[1];
        if ($back <= 0) {
            return;
        }
        $no = self::oid($row['id']);
        Ledger::post($db, 'iade', ['ref_type' => 'exorder', 'ref_id' => $no, 'user' => $row['user_id'], 'amount' => $back, 'actor' => $actorId,
            'meta' => ['ref' => $no, 'm' => $memo]], [
            ['ESCROW:EX', -$back],
            [Ledger::cash($row['user_id']), $split[0], $label],
            [Ledger::credit($row['user_id']), $split[1], $label],
        ]);
    }

    /** exst / exdq / ex-done: teslim edilen toplam adet. Hepsi → Tamamlandı (+ fiyat farkı iadesi, gizli bilgiler silinir); bir kısmı → Kısmen. */
    public static function deliver(Db $db, array $staff, array $row, $qty)
    {
        self::requireOpen($row);
        if (!is_numeric($qty) || (int)$qty != $qty) {
            throw HttpError::validation(['exdq' => 'Geçerli bir adet yazın.']);
        }
        $q = (int)$qty;
        $d = (int)$row['delivered'];
        if ($q < 0) {
            throw HttpError::validation(['exdq' => 'Geçerli bir adet yazın.']);
        }
        if ($q === $d) {
            return ['same' => true];
        }
        if ($q < $d) {
            throw HttpError::validation(['exdq' => 'Daha önce ' . Rules::num($d) . ' adet teslim edildi kaydı var; adet azaltılamaz.']);
        }
        if ($q > (int)$row['qty']) {
            throw HttpError::validation(['exdq' => 'Sipariş ' . Rules::num($row['qty']) . ' adet; daha fazlası girilemez.']);
        }
        $fills = self::fillsOf($db, $row['id']);
        $orig = self::engOrder($row, $fills);
        $m = Engine::matched($orig);
        if ($q === (int)$row['qty'] && $m < $q) {
            throw HttpError::validation(['exdq' => Rules::num($q - $m) . ' adet henüz eşlenmedi. Önce satış emirlerinden “Eşle” ile eşleyin; şimdilik teslim ettiğiniz kadarını yazın.']);
        }
        if ($q > $m) {
            throw HttpError::validation(['exdq' => 'Şu an eşlenen miktar ' . Rules::num($m) . ' adet. Daha fazlası teslim edilemez; önce satış emri eşleyin.']);
        }
        $offers = self::lockOffers($db, array_column($orig['fills'], 'of'));
        $o = $orig;
        $r = Engine::deliver($o, $offers, $q);
        $set = ['staff_id' => $row['staff_id'] ?: (int)$staff['id']];
        $done = $q === (int)$row['qty'];
        $fin = ['back' => 0, 'split' => [0, 0]];
        if ($done) {
            $fin = Engine::finish($o);
            $set['closed_at'] = yp_now_ms();
        }
        self::saveOrder($db, $row, $orig, $o, $set);
        self::postDelivery($db, $row, $o, $offers, $r, $staff['id']);
        $row = $db->one('SELECT * FROM {ex_orders} WHERE id=?', [(int)$row['id']]);
        if ($done) {
            if ($fin['back'] > 0) {
                self::postRefund($db, $row, $fin['split'], 'Borsa #' . self::oid($row['id']) . ' fiyat farkı iadesi', $staff['id'], 'Borsa fiyat farkı');
                self::event($db, $row['id'], $staff['id'], 'Eksik miktar daha ucuza eşleştiği için ' . Rules::tl($fin['back']) . ' fiyat farkı iade edildi.');
            }
            self::wipeOrder($db, $row['id']);
            foreach (array_column($o['fills'], 'of') as $ofId) {
                self::wipeOfferIfDone($db, $ofId);
            }
            self::event($db, $row['id'], $staff['id'], 'Gizli hesap bilgileri sistemden silindi.');
            self::status($db, $row, 'tamam', self::name($staff) . ' siparişin tamamını teslim etti (' . Rules::num($row['qty']) . ' adet), satıcılara ödeme yapıldı.',
                'Yang karakterinize teslim edildi.', $staff['id']);
        } else {
            self::status($db, $row, 'kismen', self::name($staff) . ' kısmi teslim yaptı: ' . Rules::num($q) . ' / ' . Rules::num($row['qty']) . ' adet. Kalan '
                . Rules::num((int)$row['qty'] - $q) . ' adet bekliyor.', 'Kısmen teslim edildi: ' . Rules::num($q) . ' / ' . Rules::num($row['qty']) . ' adet. Kalanı eşleşince teslim edilecek.', $staff['id']);
        }
        return ['done' => $done, 'd' => $r['d'], 'back' => $fin['back']];
    }

    /** exCancelOrder: teslim edilmeyen kısım iade. $why: üyeye gidecek açıklama (borsa kapatma); $quiet: bildirim ayrıca toplu gider */
    public static function cancel(Db $db, $actor, array $row, $why = null, $quiet = false)
    {
        self::requireOpen($row);
        $fills = self::fillsOf($db, $row['id']);
        $orig = self::engOrder($row, $fills);
        $offers = self::lockOffers($db, array_column($orig['fills'], 'of'));
        $off0 = $offers;
        $o = $orig;
        $res = Engine::cancel($o, $offers);
        $now = yp_now_ms();
        self::saveOffers($db, $off0, $offers);
        self::saveOrder($db, $row, $orig, $o, ['closed_at' => $now]);
        $row2 = $db->one('SELECT * FROM {ex_orders} WHERE id=?', [(int)$row['id']]);
        $actorId = is_array($actor) ? $actor['id'] : null;
        self::postRefund($db, $row2, $res['split'], 'Borsa iadesi #' . self::oid($row['id']), $actorId, 'Borsa iptali');
        self::wipeOrder($db, $row['id']);
        $dl = (int)$row['delivered'] > 0;
        $msg = ($why ?: (self::name($actor) . ' ' . ($dl ? 'kalan miktarı' : 'siparişi') . ' iptal etti')) . ', ' . Rules::tl($res['back']) . ' iade edildi.';
        if ($quiet) {
            $db->update('ex_orders', ['status' => 'iptal', 'updated_at' => $now, 'version' => (int)$row2['version'] + 1], 'id=?', [(int)$row['id']]);
            self::event($db, $row['id'], $actorId, $msg);
        } else {
            self::status($db, $row2, 'iptal', $msg, 'Sipariş ' . ($dl ? 'kalan kısmı ' : '') . 'iptal edildi, ' . Rules::tl($res['back']) . ' iade edildi.', $actorId);
        }
        return $res['back'];
    }

    /* ================= borsayı kapat / aç (ex-power), alım/satış anahtarı, kapalı mesajı ================= */

    /** exShutdown: tüm açık siparişler iptal + iade, aktif satış emirleri iptal; toplam denetimi. */
    public static function shutdown(Db $db, array $staff)
    {
        $rows = $db->all("SELECT * FROM {ex_orders} WHERE status IN ('bekliyor','islemde','bilgi','kismen') ORDER BY id" . $db->forUpdate());
        $expect = 0;
        foreach ($rows as $r) {
            $expect += (int)$r['total'] - (int)$r['released'];
        }
        $aff = [];
        $A = function ($uid) use (&$aff) {
            if (!isset($aff[$uid])) {
                $aff[$uid] = ['o' => 0, 'f' => 0, 'back' => 0];
            }
        };
        $sum = 0;
        foreach ($rows as $r) {
            $b = self::cancel($db, $staff, $db->one('SELECT * FROM {ex_orders} WHERE id=?', [(int)$r['id']]), 'Yang Borsası geçici olarak kapatıldığı için sipariş iptal edildi', true);
            $A((int)$r['user_id']);
            $aff[(int)$r['user_id']]['o']++;
            $aff[(int)$r['user_id']]['back'] += $b;
            $sum += $b;
        }
        $offs = $db->all("SELECT * FROM {ex_offers} WHERE status='aktif' ORDER BY id" . $db->forUpdate());
        $now = yp_now_ms();
        foreach ($offs as $of) {
            $db->update('ex_offers', ['status' => 'iptal', 'updated_at' => $now, 'closed_at' => $now], 'id=?', [(int)$of['id']]);
            self::wipeOffer($db, $of['id']); // açık sipariş kalmadığı için hiçbir eşleme teslim beklemiyor
            $A((int)$of['user_id']);
            $aff[(int)$of['user_id']]['f']++;
        }
        if ($sum !== $expect) {
            throw new \RuntimeException('Borsa kapatma toplamı tutmuyor: iade ' . $sum . ', beklenen ' . $expect);
        }
        $esc = Ledger::balance($db, 'ESCROW:EX');
        $open = (int)$db->val('SELECT COALESCE(SUM(total-released),0) FROM {ex_orders}');
        if ($esc !== $open) {
            throw new \RuntimeException('Borsa havuzu tutmuyor: ESCROW:EX ' . $esc . ', siparişler ' . $open);
        }
        $site = Settings::get('site', $db);
        $sname = isset($site['siteName']) ? $site['siteName'] : 'yangpazar.com';
        foreach ($aff as $uid => $x) {
            $parts = implode(' ve ', array_filter([$x['o'] ? $x['o'] . ' alım siparişiniz' : '', $x['f'] ? $x['f'] . ' satış emriniz' : '']));
            Notify::send($db, $uid, 'Yang Borsası kısa bir süreliğine hizmet vermiyor. ' . $parts . ' iptal edildi' . ($x['back'] ? ' ve ' . Rules::tl($x['back']) . ' bakiyenize iade edildi' : '')
                . '. Hizmet yeniden açıldığında kolayca yeniden oluşturabilirsiniz. Anlayışınız için teşekkür ederiz.', '#borsa', 'borsa_off',
                ['durum' => $sname . ': Yang Borsası kısa süreliğine kapandı.']);
        }
        self::setCfg($db, ['exOn' => false, 'exOffAt' => $now, 'exAffected' => array_map(function ($id) {
            return (int)$id;
        }, array_keys($aff))], $staff['id']);
        Audit::log($db, $staff['id'], 'ex_power_off', 'settings', 'ex', ['orders' => count($rows), 'offers' => count($offs), 'refunded' => $sum]);
        return ['orders' => count($rows), 'offers' => count($offs), 'refunded' => $sum, 'expected' => $expect, 'users' => count($aff)];
    }

    public static function powerOn(Db $db, array $staff)
    {
        $c = self::cfg($db);
        foreach ((array)$c['exAffected'] as $uid) {
            if ((int)$uid > 0 && $db->val('SELECT id FROM {users} WHERE id=?', [(int)$uid])) {
                Notify::send($db, (int)$uid, 'Yang Borsası yeniden hizmette! Siparişlerinizi ve satış emirlerinizi yeniden oluşturabilirsiniz. Beklediğiniz için teşekkür ederiz.', '#borsa');
            }
        }
        self::setCfg($db, ['exOn' => true, 'exAffected' => []], $staff['id']);
        Audit::log($db, $staff['id'], 'ex_power_on', 'settings', 'ex', ['notified' => count((array)$c['exAffected'])]);
        return count((array)$c['exAffected']);
    }

    /* ================= gösterim ================= */

    /** S.exOrders şekli. $view: 'owner' (alıcı) | 'staff'. $log: işlem geçmişi eklensin mi */
    public static function presentOrders(Db $db, array $rows, $view, $log = false)
    {
        if (!$rows) {
            return [];
        }
        $ids = array_map('intval', array_column($rows, 'id'));
        $in = implode(',', array_fill(0, count($ids), '?'));
        $F = [];
        foreach ($db->all('SELECT * FROM {ex_fills} WHERE order_id IN (' . $in . ') ORDER BY price, id', $ids) as $f) {
            $F[(int)$f['order_id']][] = $f;
        }
        $E = [];
        if ($log) {
            foreach ($db->all('SELECT * FROM {ex_events} WHERE order_id IN (' . $in . ') ORDER BY id', $ids) as $e) {
                $E[(int)$e['order_id']][] = ['t' => (int)$e['t'], 'x' => $e['x']];
            }
        }
        $vals = self::fieldValues($db, 'ex_order_fields', 'order_id', $ids);
        $staff = $view === 'staff';
        return array_map(function ($r) use ($F, $E, $vals, $staff, $log) {
            $id = (int)$r['id'];
            $fills = array_map(function ($f) use ($staff) {
                $x = ['qty' => (int)$f['qty'], 'paidQty' => (int)$f['paid_qty']];
                if ($staff) {
                    $x += ['of' => self::ofid($f['offer_id']), 'u' => Ids::u($f['seller_id']), 'price' => Text::tl($f['price']), 'sell' => Text::tl($f['sell'])];
                }
                return $x;
            }, isset($F[$id]) ? $F[$id] : []);
            $cost = 0;
            foreach (isset($F[$id]) ? $F[$id] : [] as $f) {
                $cost += (int)$f['qty'] * (int)$f['price'];
            }
            $o = ['id' => self::oid($id), 'u' => Ids::u($r['user_id']), 'dir' => $r['dir'], 'ex' => self::xid($r['market_id']), 'server' => Ids::sv($r['server_id']),
                'qty' => (int)$r['qty'], 'price' => Text::tl($r['price']), 'total' => Text::tl($r['total']), 'reserve' => Text::tl($r['reserve']),
                'paid' => ['w' => Text::tl($r['paid_cash']), 'nw' => Text::tl($r['paid_credit'])], 'fills' => $fills, 'delivered' => (int)$r['delivered'],
                'place' => (string)$r['place'], 'status' => $r['status'], 't' => (int)$r['created_at'], 'f' => isset($vals[$id]) ? $vals[$id] : (object)[],
                'staff' => Ids::u($r['staff_id']), 'note' => (string)$r['note'], 'called' => $r['called_at'] !== null ? (int)$r['called_at'] : null,
                'callMsg' => (string)$r['call_msg'], 'ready' => $r['ready_at'] !== null ? (int)$r['ready_at'] : null, 'v' => (int)$r['version'],
                'up' => (int)$r['updated_at']];
            if ($staff) {
                $o['cost'] = Text::tl($cost);
            }
            if ($log) {
                $o['log'] = isset($E[$id]) ? $E[$id] : [];
            }
            return $o;
        }, $rows);
    }

    /**
     * S.exOffers şekli. $view: 'public' (başkasının emri: kimlik maskeli, alan yok), 'owner' (kendi emri: alanlar, gizliler maskeli),
     * 'staff' (gerçek kimlik; $reveal ise gizli alanlar açık). $me: izleyen üye kimliği
     */
    public static function presentOffers(Db $db, array $rows, $view, $me = null, $reveal = false)
    {
        if (!$rows) {
            return [];
        }
        $fieldsFor = [];
        foreach ($rows as $r) {
            if ($view === 'staff' || ($me && (int)$r['user_id'] === (int)$me)) {
                $fieldsFor[] = (int)$r['id'];
            }
        }
        $vals = self::fieldValues($db, 'ex_offer_fields', 'offer_id', $fieldsFor, $reveal);
        return array_map(function ($r) use ($vals, $view, $me) {
            $mine = $me && (int)$r['user_id'] === (int)$me;
            $o = ['id' => self::ofid($r['id']), 'u' => $view === 'staff' || $mine ? Ids::u($r['user_id']) : 'xs' . (int)$r['id'], 'ex' => self::xid($r['market_id']),
                'qty' => (int)$r['qty'], 'left' => (int)$r['left_qty'], 'price' => Text::tl($r['price']), 't' => (int)$r['created_at'], 'status' => $r['status']];
            $o['f'] = isset($vals[(int)$r['id']]) ? $vals[(int)$r['id']] : (object)[];
            if ($view === 'staff') {
                $o['wiped'] = $r['wiped_at'] !== null;
            }
            return $o;
        }, $rows);
    }

    /** Herkese açık deftere maskeli satıcı adları (ön yüzdeki maskU: ilk 2 harf + ***) */
    public static function maskedSellers(Db $db, array $rows, $me = null)
    {
        $ids = [];
        foreach ($rows as $r) {
            if (!$me || (int)$r['user_id'] !== (int)$me) {
                $ids[(int)$r['user_id']] = true;
            }
        }
        if (!$ids) {
            return [];
        }
        $k = array_keys($ids);
        $names = [];
        foreach ($db->all('SELECT id, name FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($k), '?')) . ')', $k) as $u) {
            $names[(int)$u['id']] = mb_substr((string)$u['name'], 0, 2, 'UTF-8');
        }
        $out = [];
        foreach ($rows as $r) {
            if (!$me || (int)$r['user_id'] !== (int)$me) {
                $out[] = ['id' => 'xs' . (int)$r['id'], 'name' => isset($names[(int)$r['user_id']]) ? $names[(int)$r['user_id']] : '??', 'rating' => 0, 'sales' => 0,
                    'joined' => '-', 'vol' => 0, 'pts' => 0, 'mask' => true];
            }
        }
        return $out;
    }

    /** Operatörün gördüğü üye kartı (ad, ad soyad, telefon — demo ekranındaki gibi; bakiye yok) */
    public static function staffUsers(Db $db, array $ids)
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) {
            return [];
        }
        return array_map(function ($u) {
            return ['id' => Ids::u($u['id']), 'name' => $u['name'], 'ad' => $u['ad'], 'soyad' => $u['soyad'], 'tel' => $u['tel'], 'rating' => (float)$u['rating'],
                'sales' => (int)$u['sales'], 'joined' => Text::monthYear($u['joined_at']), 'admin' => $u['role'] === 'admin', 'staff' => $u['role'] === 'staff',
                'lastSeen' => (int)$u['last_seen']];
        }, $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids));
    }

    /** Yoklama imzası: üyenin borsa kayıtları değişti mi */
    public static function memberSig(Db $db, $uid)
    {
        $a = $db->one('SELECT COUNT(*) AS n, COALESCE(MAX(updated_at),0) AS t, COALESCE(SUM(version),0) AS v FROM {ex_orders} WHERE user_id=?', [(int)$uid]);
        $b = $db->one('SELECT COUNT(*) AS n, COALESCE(MAX(updated_at),0) AS t FROM {ex_offers} WHERE user_id=?', [(int)$uid]);
        return $a['n'] . '.' . $a['t'] . '.' . $a['v'] . '.' . $b['n'] . '.' . $b['t'];
    }

    public static function staffSig(Db $db)
    {
        $a = $db->one("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at),0) AS t FROM {ex_orders}");
        $b = $db->one("SELECT COUNT(*) AS n, COALESCE(MAX(updated_at),0) AS t FROM {ex_offers}");
        return ['open' => (int)$db->val("SELECT COUNT(*) FROM {ex_orders} WHERE status IN ('bekliyor','islemde','bilgi','kismen')"),
            'v' => $a['n'] . '.' . $a['t'] . '.' . $b['n'] . '.' . $b['t']];
    }
}
