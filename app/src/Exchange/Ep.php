<?php
namespace YP\Exchange;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Money\Ledger;
use YP\Money\Orders;
use YP\Money\Rules;
use YP\Notify;
use YP\Settings;
use YP\Store;
use YP\Text;

/**
 * EP mağazası (PLAN §1.4 EP store): ön yüzdeki epbuy / epadd / epprod / ep-toggle / ep-del / ep-cdel / hhset karşılığı.
 * Kodlar şifreli (yp_encrypt) ve HMAC özetiyle benzersiz saklanır. Satış: stoktaki ilk kod satır kilidiyle
 * (MariaDB ≥10.6 / MySQL 8: FOR UPDATE SKIP LOCKED; SQLite: BEGIN IMMEDIATE zaten sıralar) ve koşullu UPDATE ile alınır;
 * son koda aynı anda gelen iki alımdan yalnız biri kazanır, diğeri "tükendi" alır.
 * Para: alıcının kovaları (önce kredi, sonra nakit) → REV:ep. Kod yalnız alıcıya gösterilir; yönetim görünümü maskeli,
 * açılması audit'e yazılır. Her yöntem bir Db::tx içinde çağrılmalıdır.
 */
final class Ep
{
    const MAX_CODES = 2000;

    public static function pid($id)
    {
        return 'ep' . (int)$id;
    }

    public static function oid($id)
    {
        return 'EP' . (int)$id;
    }

    public static function cid($id)
    {
        return 'c' . (int)$id;
    }

    public static function parseProduct($ref)
    {
        $s = is_scalar($ref) ? (string)$ref : '';
        if (!preg_match('/^(?:ep)?([1-9][0-9]{0,17})$/', $s, $m)) {
            throw HttpError::notFound('EP paketi bulunamadı.');
        }
        return (int)$m[1];
    }

    public static function parseCode($ref)
    {
        $s = is_scalar($ref) ? (string)$ref : '';
        if (!preg_match('/^c?([1-9][0-9]{0,17})$/', $s, $m)) {
            throw HttpError::notFound('Kod bulunamadı.');
        }
        return (int)$m[1];
    }

    public static function parseOrder($ref)
    {
        $s = is_scalar($ref) ? (string)$ref : '';
        if (!preg_match('/^(?:EP)?([1-9][0-9]{0,17})$/', $s, $m)) {
            throw HttpError::notFound('EP siparişi bulunamadı.');
        }
        return (int)$m[1];
    }

    /* ================= Happy Hour ================= */

    public static function hh(?Db $db = null)
    {
        $h = Settings::get('hh', $db);
        return array_replace(['on' => false, 'pct' => 30, 'until' => null], is_array($h) ? $h : []);
    }

    public static function hhOn(?Db $db = null)
    {
        $h = self::hh($db);
        return !empty($h['on']) && (empty($h['until']) || (int)$h['until'] > yp_now_ms());
    }

    /** epAmt(p): Math.round(p.ep*(1+pct/100)) */
    public static function epAmt($ep, $hh, $pct)
    {
        if (!$hh) {
            return (int)$ep;
        }
        $bp = (int)round((float)$pct * 100);
        return Rules::mulDiv((int)$ep, 10000 + max(0, $bp), 10000);
    }

    public static function setHh(Db $db, array $staff, array $in)
    {
        $on = !empty($in['on']) && $in['on'] !== 'false';
        $pct = isset($in['pct']) && is_numeric($in['pct']) ? (int)round((float)$in['pct']) : 30;
        $pct = max(1, min(200, $pct));
        $until = null;
        if (isset($in['until']) && $in['until'] !== '' && $in['until'] !== null) {
            if (is_numeric($in['until'])) {
                $until = (int)$in['until'];
            } else {
                $ts = strtotime((string)$in['until']);
                if ($ts === false) {
                    throw HttpError::validation(['hh_u' => 'Bitiş zamanı geçersiz.']);
                }
                $until = $ts * 1000;
            }
            if ($until <= yp_now_ms()) {
                throw HttpError::validation(['hh_u' => 'Bitiş zamanı gelecekte olmalı.']);
            }
        }
        $h = ['on' => $on, 'pct' => $pct, 'until' => $until];
        Settings::set('hh', $h, $staff['id'], $db);
        Audit::log($db, $staff['id'], 'hh_set', 'settings', 'hh', $h);
        return $h;
    }

    /* ================= ürünler ================= */

    public static function product(Db $db, $id, $lock = false)
    {
        return $db->one('SELECT * FROM {ep_products} WHERE id=? AND deleted_at IS NULL' . ($lock ? $db->forUpdate() : ''), [(int)$id]);
    }

    /** epName(p) */
    public static function name(Db $db, $serverId)
    {
        if ($serverId) {
            $n = $db->val('SELECT name FROM {servers} WHERE id=?', [(int)$serverId]);
            if ($n) {
                return $n . ' EP';
            }
        }
        return 'Metin2 EP';
    }

    /** Satışta olabilir mi: PVP grubunda server "EP satışı: Olacak" olmalı */
    private static function serverOk(Db $db, $serverId)
    {
        if (!$serverId) {
            return true;
        }
        $s = $db->one('SELECT sec, ep_on, active FROM {servers} WHERE id=?', [(int)$serverId]);
        return $s && $s['sec'] === 'pvp' && (int)$s['ep_on'];
    }

    private static function stockCounts(Db $db, array $ids)
    {
        $out = [];
        if (!$ids) {
            return $out;
        }
        foreach ($db->all("SELECT product_id, COUNT(*) AS n FROM {ep_codes} WHERE status='stok' AND product_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ') GROUP BY product_id', $ids) as $r) {
            $out[(int)$r['product_id']] = (int)$r['n'];
        }
        return $out;
    }

    public static function mask($tail, $len = 12)
    {
        return str_repeat('•', max(4, min(12, (int)$len - mb_strlen((string)$tail, 'UTF-8')))) . $tail;
    }

    /**
     * S.epProducts şekli. $admin: maskeli stok kodları (codes) ve kimlikleri (codeIds); değilse yalnız stok adedi (stock).
     */
    public static function present(Db $db, array $rows, $admin = false)
    {
        $ids = array_map('intval', array_column($rows, 'id'));
        $cnt = self::stockCounts($db, $ids);
        $codes = [];
        if ($admin && $ids) {
            foreach ($db->all("SELECT id, product_id, code_tail FROM {ep_codes} WHERE status='stok' AND product_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY id', $ids) as $c) {
                $codes[(int)$c['product_id']][] = [self::cid($c['id']), self::mask($c['code_tail'])];
            }
        }
        $names = [];
        return array_map(function ($p) use ($db, $cnt, $codes, $admin, &$names) {
            $sid = $p['server_id'] !== null ? (int)$p['server_id'] : 0;
            if (!isset($names[$sid])) {
                $names[$sid] = self::name($db, $sid);
            }
            $o = ['id' => self::pid($p['id']), 'srv' => $sid ? Ids::sv($sid) : null, 'grp' => $names[$sid], 'ep' => (int)$p['ep'], 'price' => Text::tl($p['price']),
                'hh' => (bool)(int)$p['hh'], 'v' => (int)$p['v'], 'on' => (bool)(int)$p['is_on'], 'soldN' => (int)$p['sold_n'],
                'stock' => isset($cnt[(int)$p['id']]) ? $cnt[(int)$p['id']] : 0];
            if ($admin) {
                $L = isset($codes[(int)$p['id']]) ? $codes[(int)$p['id']] : [];
                $o['codes'] = array_column($L, 1);
                $o['codeIds'] = array_column($L, 0);
            }
            return $o;
        }, $rows);
    }

    public static function publicProducts(Db $db)
    {
        $rows = array_values(array_filter($db->all('SELECT * FROM {ep_products} WHERE deleted_at IS NULL AND is_on=1 ORDER BY sort, ep, id'), function ($p) use ($db) {
            return self::serverOk($db, $p['server_id']);
        }));
        return self::present($db, $rows, false);
    }

    public static function adminProducts(Db $db)
    {
        return self::present($db, $db->all('SELECT * FROM {ep_products} WHERE deleted_at IS NULL ORDER BY sort, ep, id'), true);
    }

    private static function readProduct(Db $db, array $in, ?array $old = null)
    {
        $out = [];
        if (array_key_exists('srv', $in) || !$old) {
            $s = isset($in['srv']) ? $in['srv'] : null;
            if ($s === null || $s === '' || $s === false) {
                $out['server_id'] = null;
            } else {
                try {
                    $sid = Ids::server($s);
                } catch (HttpError $e) {
                    throw HttpError::validation(['srv' => 'Server bulunamadı.']);
                }
                if (!self::serverOk($db, $sid)) {
                    throw HttpError::validation(['srv' => 'Bu PVP serverda EP satışı kapalı. Serverlar bölümünden "EP satışı: Olacak" seçin.']);
                }
                $out['server_id'] = $sid;
            }
        }
        if (array_key_exists('ep', $in) || !$old) {
            $ep = isset($in['ep']) && is_numeric($in['ep']) ? (int)$in['ep'] : 0;
            if ($ep < 1 || $ep > 10000000) {
                throw HttpError::validation(['ep' => 'EP miktarı 1 veya daha büyük olmalı.']);
            }
            $out['ep'] = $ep;
        }
        if (array_key_exists('price', $in) || !$old) {
            $p = isset($in['price']) ? Text::kurus($in['price']) : null;
            if ($p === null || $p < 0 || $p > 1000000000) {
                throw HttpError::validation(['price' => 'Geçerli bir fiyat girin.']);
            }
            $out['price'] = $p;
        }
        if (array_key_exists('hh', $in)) {
            $out['hh'] = !empty($in['hh']) && $in['hh'] !== 'false' ? 1 : 0;
        }
        if (array_key_exists('v', $in)) {
            $out['v'] = max(1, min(20, (int)$in['v']));
        }
        return $out;
    }

    /** Kod ekleme: tekrar edenler (bu listede ya da daha önce eklenmiş/satılmış) atlanır; silinmiş kod yeniden eklenebilir. Dönüş [eklenen, atlanan] */
    public static function addCodes(Db $db, array $staff, $productId, $raw)
    {
        $L = is_array($raw) ? $raw : preg_split('/\R/u', (string)$raw);
        $L = array_values(array_unique(array_filter(array_map(function ($c) {
            return is_scalar($c) ? trim((string)$c) : '';
        }, $L), 'strlen')));
        if (count($L) > self::MAX_CODES) {
            throw HttpError::validation(['codes' => 'Tek seferde en fazla ' . self::MAX_CODES . ' kod eklenebilir.']);
        }
        $n = 0;
        $dup = 0;
        $now = yp_now_ms();
        foreach ($L as $c) {
            if (mb_strlen($c, 'UTF-8') > 120 || preg_match('/[\x00-\x1F\x7F]/', $c)) {
                throw HttpError::validation(['codes' => 'Geçersiz kod: en fazla 120 karakter, satır başına bir kod.']);
            }
            $h = hash_hmac('sha256', 'ep|' . $c, Store::pepper());
            $old = $db->one('SELECT id, status FROM {ep_codes} WHERE code_hash=?', [$h]);
            if ($old && $old['status'] === 'silindi') {
                $db->update('ep_codes', ['product_id' => (int)$productId, 'code_enc' => yp_encrypt($c), 'status' => 'stok', 'order_id' => null, 'added_at' => $now,
                    'added_by' => (int)$staff['id'], 'sold_at' => null], 'id=?', [(int)$old['id']]);
                $n++;
                continue;
            }
            if ($old) {
                $dup++;
                continue;
            }
            $ok = $db->insertIgnore('ep_codes', ['product_id' => (int)$productId, 'code_enc' => yp_encrypt($c), 'code_hash' => $h,
                'code_tail' => mb_substr($c, -4, null, 'UTF-8'), 'status' => 'stok', 'added_at' => $now, 'added_by' => (int)$staff['id']]);
            if ($ok) {
                $n++;
            } else {
                $dup++;
            }
        }
        return [$n, $dup];
    }

    public static function create(Db $db, array $staff, array $in)
    {
        $row = self::readProduct($db, $in);
        $now = yp_now_ms();
        $row += ['hh' => $row['server_id'] ? 0 : 1, 'v' => $row['server_id'] ? 2 : 1, 'is_on' => 1, 'sold_n' => 0, 'created_at' => $now, 'updated_at' => $now];
        $row['grp'] = self::name($db, $row['server_id']);
        $id = $db->insert('ep_products', $row);
        list($n, $dup) = self::addCodes($db, $staff, $id, isset($in['codes']) ? $in['codes'] : '');
        Audit::log($db, $staff['id'], 'ep_product_add', 'ep_product', self::pid($id), ['ep' => $row['ep'], 'price' => $row['price'], 'codes' => $n]);
        return [$id, $n, $dup];
    }

    public static function update(Db $db, array $staff, $ref, array $in)
    {
        $id = self::parseProduct($ref);
        $p = self::product($db, $id, true);
        if (!$p) {
            throw HttpError::notFound('EP paketi bulunamadı.');
        }
        $set = self::readProduct($db, $in, $p);
        if (array_key_exists('server_id', $set)) {
            $set['grp'] = self::name($db, $set['server_id']);
        }
        $set['updated_at'] = yp_now_ms();
        $db->update('ep_products', $set, 'id=?', [$id]);
        list($n, $dup) = self::addCodes($db, $staff, $id, isset($in['codes']) ? $in['codes'] : '');
        Audit::log($db, $staff['id'], 'ep_product_save', 'ep_product', self::pid($id), array_merge(array_diff_key($set, ['updated_at' => 1]), ['codes' => $n]));
        return [$id, $n, $dup];
    }

    public static function toggle(Db $db, array $staff, $ref)
    {
        $id = self::parseProduct($ref);
        $p = self::product($db, $id, true);
        if (!$p) {
            throw HttpError::notFound('EP paketi bulunamadı.');
        }
        $on = (int)$p['is_on'] ? 0 : 1;
        $db->update('ep_products', ['is_on' => $on, 'updated_at' => yp_now_ms()], 'id=?', [$id]);
        Audit::log($db, $staff['id'], 'ep_product_toggle', 'ep_product', self::pid($id), ['on' => (bool)$on]);
        return (bool)$on;
    }

    /** Paket silinir (satış kayıtları için yumuşak silme), stoktaki kodları "silindi" olur */
    public static function delete(Db $db, array $staff, $ref)
    {
        $id = self::parseProduct($ref);
        $p = self::product($db, $id, true);
        if (!$p) {
            throw HttpError::notFound('EP paketi bulunamadı.');
        }
        $now = yp_now_ms();
        $n = $db->exec("UPDATE {ep_codes} SET status='silindi', code_enc='' WHERE product_id=? AND status='stok'", [$id]);
        $db->update('ep_products', ['deleted_at' => $now, 'is_on' => 0, 'updated_at' => $now], 'id=?', [$id]);
        Audit::log($db, $staff['id'], 'ep_product_del', 'ep_product', self::pid($id), ['codes' => $n]);
    }

    public static function deleteCode(Db $db, array $staff, $ref)
    {
        $id = self::parseCode($ref);
        $c = $db->one('SELECT * FROM {ep_codes} WHERE id=?' . $db->forUpdate(), [$id]);
        if (!$c || $c['status'] !== 'stok') {
            throw HttpError::notFound('Stokta böyle bir kod yok (satılmış ya da silinmiş olabilir).');
        }
        $db->update('ep_codes', ['status' => 'silindi', 'code_enc' => ''], 'id=?', [$id]);
        Audit::log($db, $staff['id'], 'ep_code_del', 'ep_code', self::cid($id), ['product' => self::pid($c['product_id'])]);
        return (int)$c['product_id'];
    }

    /* ================= satış (epbuy) ================= */

    /** Dönüş: ep_orders satırı. Hata: 409 sold_out ("tükendi"), 409 insufficient */
    public static function buy(Db $db, array $u, $ref)
    {
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız askıda olduğu için işlem yapamazsınız.');
        }
        $id = self::parseProduct($ref);
        $p = self::product($db, $id);
        if (!$p || !(int)$p['is_on'] || !self::serverOk($db, $p['server_id'])) {
            throw new HttpError(409, 'Bu ürün şu an satışta değil.', 'sold_out');
        }
        $price = (int)$p['price'];
        $w = Ledger::lockWallets($db, [$u['id']])[(int)$u['id']];
        $split = Rules::split($w['cash'], $w['credit'], $price);
        if ($split === null) {
            throw new HttpError(409, 'Bakiye yetersiz. ' . Rules::tl($price - $w['cash'] - $w['credit']) . ' daha yükleyin.', 'insufficient',
                ['need' => Text::tl($price - $w['cash'] - $w['credit'])]);
        }
        $code = null;
        for ($i = 0; $i < 5 && !$code; $i++) {
            $c = $db->one("SELECT id FROM {ep_codes} WHERE product_id=? AND status='stok' ORDER BY id LIMIT 1" . $db->skipLocked(), [$id]);
            if (!$c) {
                break;
            }
            if ($db->exec("UPDATE {ep_codes} SET status='satildi', sold_at=? WHERE id=? AND status='stok'", [yp_now_ms(), (int)$c['id']]) === 1) {
                $code = (int)$c['id'];
            }
        }
        if (!$code) {
            throw new HttpError(409, 'Bu ürün tükendi.', 'sold_out');
        }
        $hh = self::hhOn($db) && (int)$p['hh'];
        $shown = self::epAmt($p['ep'], $hh, self::hh($db)['pct']);
        $now = yp_now_ms();
        $oid = $db->insert('ep_orders', ['user_id' => (int)$u['id'], 'product_id' => $id, 'server_id' => $p['server_id'], 'ep' => (int)$p['ep'], 'ep_shown' => $shown,
            'hh' => $hh ? 1 : 0, 'code_id' => $code, 'price' => $price, 'paid_cash' => $split[0], 'paid_credit' => $split[1], 't' => $now]);
        $db->update('ep_codes', ['order_id' => $oid], 'id=?', [$code]);
        $db->exec('UPDATE {ep_products} SET sold_n=sold_n+1 WHERE id=?', [$id]);
        $no = self::oid($oid);
        $nm = self::name($db, $p['server_id']);
        $lbl = $nm . ' ' . Rules::num($shown) . ' · #' . $no;
        $jid = Ledger::post($db, 'ep', ['ref_type' => 'eporder', 'ref_id' => $no, 'user' => $u['id'], 'amount' => $price, 'actor' => $u['id'],
            'meta' => ['ref' => $no, 'm' => Rules::num($shown) . ' EP']], [
            [Ledger::cash($u['id']), -$split[0], $lbl],
            [Ledger::credit($u['id']), -$split[1], $lbl],
            ['REV:ep', $price],
        ]);
        $db->update('ep_orders', ['journal_id' => $jid], 'id=?', [$oid]);
        // VIP hacmi + puan (complete() ile aynı oran), davet ödülü (refCheck)
        $buyer = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
        $pts = Rules::points($price, Rules::vip((int)$buyer['vol'], Rules::vipLevels($db))['cb']);
        $db->exec('UPDATE {users} SET pts=pts+?, vol=vol+? WHERE id=?', [$pts, $price, (int)$u['id']]);
        if ($pts) {
            $db->insert('points_log', ['user_id' => (int)$u['id'], 'delta' => $pts, 'reason' => 'ep', 'ref' => $no, 't' => $now]);
        }
        Orders::refCheck($db, $buyer, $price);
        \YP\Growth\Events::spent($db, (int)$u['id'], $price, 'epstore'); // çekiliş bileti (P5)
        Notify::send($db, $u['id'], Rules::num($shown) . ' EP kodunuz teslim edildi. Kod: Hesabım › EP kodlarım', '#hesabim', 'ep_code', ['ep' => Rules::num($shown), 'no' => $no]);
        return $db->one('SELECT * FROM {ep_orders} WHERE id=?', [$oid]);
    }

    /** S.epOrders şekli. $code: 'plain' (yalnız alıcı), 'mask' (yönetim) */
    public static function presentOrders(Db $db, array $rows, $code)
    {
        if (!$rows) {
            return [];
        }
        $ids = array_values(array_unique(array_map('intval', array_column($rows, 'code_id'))));
        $C = [];
        foreach ($db->all('SELECT id, code_enc, code_tail FROM {ep_codes} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) as $c) {
            $C[(int)$c['id']] = $c;
        }
        return array_map(function ($o) use ($C, $code) {
            $c = isset($C[(int)$o['code_id']]) ? $C[(int)$o['code_id']] : null;
            $txt = '';
            if ($c) {
                if ($code === 'plain' && $c['code_enc'] !== '') {
                    $d = yp_decrypt($c['code_enc']);
                    $txt = $d === false || $d === null ? '' : (string)$d;
                } else {
                    $txt = self::mask($c['code_tail']);
                }
            }
            return ['id' => self::oid($o['id']), 'u' => Ids::u($o['user_id']), 'pid' => self::pid($o['product_id']), 'ep' => (int)$o['ep'], 'epShown' => (int)$o['ep_shown'],
                'hh' => (bool)(int)$o['hh'], 'code' => $txt, 'price' => Text::tl($o['price']), 'paid' => ['w' => Text::tl($o['paid_cash']), 'nw' => Text::tl($o['paid_credit'])],
                't' => (int)$o['t'], 'srv' => $o['server_id'] !== null ? Ids::sv($o['server_id']) : null];
        }, $rows);
    }

    /** Yönetim: satılan kodu açar (audit) */
    public static function revealCode(Db $db, array $staff, $ref)
    {
        $o = $db->one('SELECT * FROM {ep_orders} WHERE id=?', [self::parseOrder($ref)]);
        if (!$o) {
            throw HttpError::notFound('EP siparişi bulunamadı.');
        }
        Audit::log($db, $staff['id'], 'ep_code_reveal', 'ep_order', self::oid($o['id']), ['user' => Ids::u($o['user_id'])]);
        return self::presentOrders($db, [$o], 'plain')[0]['code'];
    }
}
