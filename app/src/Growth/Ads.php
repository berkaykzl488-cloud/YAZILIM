<?php
namespace YP\Growth;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Catalog;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Media;
use YP\Money\Ledger;
use YP\Money\Rules;
use YP\Notify;
use YP\Perm;
use YP\Settings;
use YP\Text;

/**
 * Reklam satışı (PLAN §1.4 "Ads and dopings", §3.7): ön yüzdeki buyad / ad-ok / adrej / ad-toggle / ad-ext / ad-del /
 * admediaadd / ad-media-clear / packs, adBooked / adRangeFree / liveAds işlevlerinin sunucu karşılığı.
 *   - Fiyat sunucuda: packs[tür].p[süre] (TL) → kuruş. [reklam] yetkilisi ücretsiz ekler ve reklam onaylı başlar.
 *   - Takvim kilidi: ad_slots satırı (tür başına) FOR UPDATE ile kilitlenir, doluluk kilit altında yeniden sayılır →
 *     aynı alana eşzamanlı iki rezervasyondan yalnız biri kazanır (SQLite: BEGIN IMMEDIATE zaten sıralar).
 *   - Ödeme: P2 harcama önceliği (önce kredi/yalnız alışveriş, sonra nakit) → ESCROW:ADS. Onay: ESCROW:ADS → REV:ads
 *     (gelir onayda tanınır). Red / onaysız silme: ESCROW:ADS → üyenin ödediği kovalara iade.
 * Gün sınırları Europe/Istanbul (UTC+3, yaz saati yok). Her yöntem bir Db::tx içinde çağrılmalıdır (okuma yardımcıları hariç).
 */
final class Ads
{
    const D = 86400000;
    const TZ = 10800000; // +03:00
    const DUR = [1, 7, 30];
    /** Ön yüzdeki AD_SIZE: görsel/video kabul eden alanlar */
    const MEDIA_TYPES = ['yan', 'slider', 'banner', 'altbanner', 'popup'];
    const MAX_MEDIA = 6;

    /** Ön yüzdeki varsayılan paketler (S.packs). p: [1 gün, 7 gün, 30 gün] TL; cap: aynı anda en fazla */
    const PACKS0 = [
        'slider' => ['name' => 'Ana Sayfa Slider', 'desc' => 'Ana sayfanın en üstünde geniş vitrin, dönüşümlü gösterim.', 'p' => [350, 1500, 4900], 'cap' => 5],
        'popup' => ['name' => 'Açılış Popup Reklamı', 'desc' => 'Siteye giren her ziyaretçiye oturum başına bir kez tam ekran.', 'p' => [400, 2200, 7500], 'cap' => 2],
        'premium' => ['name' => 'Premium Server Listesi', 'desc' => 'Server listesinde ve sol sütunda altın çerçeveli en üst sıralar.', 'p' => [150, 900, 2900], 'cap' => 6],
        'banner' => ['name' => 'Kenar Banner 300×250', 'desc' => 'Ana sayfa ve ilan sayfalarında sağ sütun.', 'p' => [120, 700, 2400], 'cap' => 3],
        'altbanner' => ['name' => 'Sağ Sütun Alt Banner 300×600', 'desc' => 'Ana sayfa sağ sütunun en altında, büyük görselli dikey alan.', 'p' => [150, 850, 2900], 'cap' => 1],
        'text' => ['name' => 'Metin Reklam (Üst Şerit)', 'desc' => 'Sitenin en üstündeki kayan şeritte tek satır.', 'p' => [60, 350, 1100], 'cap' => 6],
        'yan' => ['name' => 'Yan Reklam (Sağ + Sol)', 'desc' => 'Geniş ekranlarda sayfanın sağ ve sol boşluğunda, iki taraf birlikte satılır.', 'p' => [250, 1400, 4900], 'cap' => 1],
    ];

    /* ---------------- gün / paket yardımcıları ---------------- */

    public static function dayStart($t)
    {
        return intdiv((int)$t + self::TZ, self::D) * self::D - self::TZ;
    }

    public static function dayKey($t)
    {
        return gmdate('Y-m-d', intdiv((int)$t + self::TZ, 1000));
    }

    public static function packs(?Db $db = null)
    {
        $s = Settings::get('packs', $db);
        $out = self::PACKS0;
        if (is_array($s)) {
            foreach ($s as $k => $p) {
                if (isset($out[$k]) && is_array($p)) {
                    $out[$k] = array_replace($out[$k], array_intersect_key($p, ['name' => 1, 'desc' => 1, 'p' => 1, 'cap' => 1]));
                }
            }
        }
        foreach ($out as &$p) {
            $p['p'] = array_values(array_map('floatval', array_slice(array_pad((array)$p['p'], 3, 0), 0, 3)));
            $p['cap'] = max(1, (int)$p['cap']);
        }
        unset($p);
        return $out;
    }

    public static function pack(Db $db, $type)
    {
        $P = self::packs($db);
        if (!is_string($type) || !isset($P[$type])) {
            throw HttpError::validation(['type' => 'Geçersiz reklam alanı.']);
        }
        return $P[$type];
    }

    /** PUT admin/packs: {k:{p:[a,b,c], cap}} (TL) */
    public static function setPacks(Db $db, array $staff, $in)
    {
        if (!is_array($in)) {
            throw HttpError::validation(['packs' => 'Paket listesi geçersiz.']);
        }
        $P = self::packs($db);
        foreach ($P as $k => &$p) {
            if (!isset($in[$k]) || !is_array($in[$k])) {
                continue;
            }
            $x = $in[$k];
            if (isset($x['p']) && is_array($x['p'])) {
                $np = [];
                foreach ([0, 1, 2] as $i) {
                    $v = isset($x['p'][$i]) ? Text::kurus($x['p'][$i]) : null;
                    if ($v === null || $v < 0 || $v > 100000000) {
                        throw HttpError::validation(['packs' => $p['name'] . ': fiyatları kontrol edin.']);
                    }
                    $np[] = $v / 100;
                }
                $p['p'] = $np;
            }
            if (isset($x['cap'])) {
                if (!is_numeric($x['cap']) || (int)$x['cap'] < 1 || (int)$x['cap'] > 50) {
                    throw HttpError::validation(['packs' => $p['name'] . ': aynı anda en fazla 1–50 reklam olabilir.']);
                }
                $p['cap'] = (int)$x['cap'];
            }
            foreach (['name' => 60, 'desc' => 200] as $f => $max) {
                if (isset($x[$f]) && is_string($x[$f]) && trim($x[$f]) !== '') {
                    $p[$f] = yp_str(trim($x[$f]), $max);
                }
            }
        }
        unset($p);
        Settings::set('packs', $P, $staff['id'], $db);
        Audit::log($db, $staff['id'], 'packs_set', 'settings', 'packs', ['packs' => $P]);
        return $P;
    }

    /* ---------------- takvim ---------------- */

    /** adBooked(type, ds): o gün alanı kaplayan reklam sayısı (reddedilen ve durdurulanlar hariç) */
    public static function booked(Db $db, $type, $ds, $exceptId = 0)
    {
        return (int)$db->val("SELECT COUNT(*) FROM {ads} WHERE type=? AND status<>'red' AND active=1 AND start_at<? AND until_at>? AND id<>?",
            [$type, (int)$ds + self::D, (int)$ds, (int)$exceptId]);
    }

    /** adRangeFree: [start, start+days) içinde dolu ilk günün başlangıcı (yoksa 0) */
    public static function clash(Db $db, $type, $start, $days, $cap, $exceptId = 0)
    {
        $d0 = self::dayStart($start);
        for ($i = 0; $i < max(1, (int)$days); $i++) {
            if (self::booked($db, $type, $d0 + $i * self::D, $exceptId) >= $cap) {
                return $d0 + $i * self::D;
            }
        }
        return 0;
    }

    /** [from, until) aralığı için (gün sayısına çevirerek) doluluk denetimi */
    public static function clashRange(Db $db, $type, $from, $until, $cap, $exceptId = 0)
    {
        $d0 = self::dayStart($from);
        $n = (int)ceil(((int)$until - $d0) / self::D);
        return self::clash($db, $type, $d0, max(1, $n), $cap, $exceptId);
    }

    /** Tür kilidi: ad_slots satırı (yoksa açılır) FOR UPDATE */
    public static function lockSlot(Db $db, $type, $cap)
    {
        $db->insertIgnore('ad_slots', ['type' => $type, 'cap' => (int)$cap, 'updated_at' => yp_now_ms()]);
        $db->one('SELECT type FROM {ad_slots} WHERE type=?' . $db->forUpdate(), [$type]);
        $db->exec('UPDATE {ad_slots} SET cap=?, updated_at=? WHERE type=?', [(int)$cap, yp_now_ms(), $type]);
    }

    /** GET ads/availability: bugünden (ya da $from) itibaren 42 günün doluluğu {ds: n} */
    public static function availability(Db $db, $type, $from = null, $days = 42)
    {
        $p = self::pack($db, $type);
        $today = self::dayStart(yp_now_ms());
        $d0 = $from ? max($today, self::dayStart($from)) : $today;
        $end = $d0 + $days * self::D;
        $rows = $db->all("SELECT start_at, until_at FROM {ads} WHERE type=? AND status<>'red' AND active=1 AND start_at<? AND until_at>?", [$type, $end, $d0]);
        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $ds = $d0 + $i * self::D;
            $n = 0;
            foreach ($rows as $r) {
                if ((int)$r['start_at'] < $ds + self::D && (int)$r['until_at'] > $ds) {
                    $n++;
                }
            }
            $out[(string)$ds] = $n;
        }
        return ['type' => $type, 'cap' => $p['cap'], 'from' => $d0, 'today' => $today, 'days' => $out];
    }

    /* ---------------- kayıt ---------------- */

    public static function parseId($v)
    {
        return Ids::parse($v, 'a');
    }

    public static function lock(Db $db, $ref)
    {
        $a = $db->one('SELECT * FROM {ads} WHERE id=?' . $db->forUpdate(), [self::parseId($ref)]);
        if (!$a) {
            throw HttpError::notFound('Reklam bulunamadı.');
        }
        return $a;
    }

    public static function row(Db $db, $id)
    {
        return $db->one('SELECT * FROM {ads} WHERE id=?', [(int)$id]);
    }

    /** Medya doğrulama: tür 'ad', yükleyen $ownerId (null: herhangi bir yetkili), başka kayda bağlı değil */
    private static function mediaRows(Db $db, $raw, $ownerId, $adId = 0)
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return [];
        }
        $L = is_array($raw) ? array_values($raw) : [$raw];
        if (count($L) > self::MAX_MEDIA) {
            throw HttpError::validation(['media' => 'En fazla ' . self::MAX_MEDIA . ' görsel/video ekleyebilirsiniz.']);
        }
        $out = [];
        foreach ($L as $x) {
            try {
                $mid = Ids::media(is_array($x) && isset($x['id']) ? $x['id'] : $x);
            } catch (HttpError $e) {
                throw HttpError::validation(['media' => 'Dosya bulunamadı.']);
            }
            $m = $db->one('SELECT * FROM {media} WHERE id=?', [$mid]);
            if (!$m || $m['kind'] !== 'ad' || ($ownerId !== null && (int)$m['owner_id'] !== (int)$ownerId)) {
                throw HttpError::validation(['media' => 'Dosya bulunamadı ya da size ait değil.']);
            }
            if ($m['ref_type'] !== '' && !($m['ref_type'] === 'ad' && (int)$m['ref_id'] === (int)$adId)) {
                throw HttpError::validation(['media' => 'Bu dosya başka bir kayıtta kullanılıyor.']);
            }
            $out[$mid] = $m;
        }
        return array_values($out);
    }

    private static function attach(Db $db, $adId, array $media)
    {
        $pos = (int)$db->val('SELECT COALESCE(MAX(pos)+1,0) FROM {ad_media} WHERE ad_id=?', [(int)$adId]);
        foreach ($media as $m) {
            if ($db->val('SELECT 1 FROM {ad_media} WHERE ad_id=? AND media_id=?', [(int)$adId, (int)$m['id']])) {
                continue;
            }
            $db->insert('ad_media', ['ad_id' => (int)$adId, 'media_id' => (int)$m['id'], 'pos' => $pos++]);
            $db->update('media', ['ref_type' => 'ad', 'ref_id' => (int)$adId], 'id=?', [(int)$m['id']]);
        }
    }

    private static function color($c, $def)
    {
        $c = is_string($c) ? strtolower(trim($c)) : '';
        return preg_match('/^#[0-9a-f]{6}$/', $c) ? $c : $def;
    }

    /** Reklam yetkilisi olan çalışanlar (yeni başvuru bildirimi) */
    public static function staffWith(Db $db, $perm)
    {
        $out = [];
        foreach ($db->all("SELECT * FROM {users} WHERE role IN ('staff','admin') AND status='active' ORDER BY id LIMIT 200") as $u) {
            if (Perm::has($u, $perm)) {
                $out[] = $u;
            }
        }
        return $out;
    }

    /**
     * buyad: {type, dur (0|1|2) | days (1|7|30), start (gün ms), server ('sv3' | '_new'), srv:{name,lv,type,url,c1,c2,open},
     *         title, text, media:['m1',…]}. Dönüş: reklam satırı.
     */
    public static function buy(Db $db, array $u, array $in)
    {
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız askıda olduğu için reklam veremezsiniz.');
        }
        $type = isset($in['type']) ? (string)$in['type'] : '';
        $P = self::pack($db, $type);
        if (isset($in['days']) && in_array((int)$in['days'], self::DUR, true)) {
            $di = array_search((int)$in['days'], self::DUR, true);
        } else {
            $di = isset($in['dur']) && is_numeric($in['dur']) ? (int)$in['dur'] : 1;
        }
        if (!isset(self::DUR[$di])) {
            throw HttpError::validation(['dur' => 'Süreyi seçin (1, 7 ya da 30 gün).']);
        }
        $days = self::DUR[$di];
        $now = yp_now_ms();
        $today = self::dayStart($now);
        $start = isset($in['start']) && is_numeric($in['start']) ? self::dayStart((int)$in['start']) : 0;
        if (!$start || $start < $today) {
            throw HttpError::validation(['start' => 'Takvimden bir başlangıç tarihi seçin.']);
        }
        if ($start > $today + 366 * self::D) {
            throw HttpError::validation(['start' => 'En fazla bir yıl sonrası için rezervasyon yapılabilir.']);
        }
        $text = isset($in['text']) && is_scalar($in['text']) ? trim(preg_replace('/\s+/u', ' ', (string)$in['text'])) : '';
        $title = isset($in['title']) && is_scalar($in['title']) ? trim(preg_replace('/\s+/u', ' ', (string)$in['title'])) : '';
        if ($type !== 'premium' && $text === '') {
            throw HttpError::validation(['text' => 'Reklam metnini yazın.']);
        }
        if (mb_strlen($text, 'UTF-8') > 110 || mb_strlen($title, 'UTF-8') > 60) {
            throw HttpError::validation(['text' => 'Başlık en fazla 60, metin en fazla 110 karakter olabilir.']);
        }
        // server: listeden ya da yeni (onayda servers tablosuna eklenir)
        $sid = isset($in['server']) && is_scalar($in['server']) ? (string)$in['server'] : '';
        $srv = null;
        $newSrv = null;
        if ($sid === '_new') {
            $sx = isset($in['srv']) && is_array($in['srv']) ? $in['srv'] : [];
            $row = Catalog::serverInput(array_merge($sx, ['sec' => 'pvp']));
            if (empty($row['name'])) {
                throw HttpError::validation(['srv' => 'Server adını yazın.']);
            }
            $dup = $db->one('SELECT * FROM {servers} WHERE slug=? AND deleted_at IS NULL', [Text::slug($row['name'])]);
            if ($dup) {
                $srv = $dup;
            } else {
                $newSrv = array_intersect_key($row, ['name' => 1, 'type' => 1, 'lv' => 1, 'url' => 1, 'c1' => 1, 'c2' => 1, 'open_at' => 1]);
            }
        } else {
            try {
                $srv = $db->one('SELECT * FROM {servers} WHERE id=? AND deleted_at IS NULL', [Ids::server($sid)]);
            } catch (HttpError $e) {
                $srv = null;
            }
            if (!$srv) {
                throw HttpError::validation(['server' => 'Server seçin.']);
            }
        }
        $media = in_array($type, self::MEDIA_TYPES, true) ? self::mediaRows($db, isset($in['media']) ? $in['media'] : [], $u['id']) : [];
        $free = Perm::has($u, 'reklam');
        $price = $free ? 0 : Rules::k($P['p'][$di]);

        self::lockSlot($db, $type, $P['cap']);
        $c = self::clash($db, $type, $start, $days, $P['cap']);
        if ($c) {
            throw new HttpError(409, self::dstr($c) . ' tarihi dolu. Başka bir başlangıç günü seçin.', 'ad_full', ['day' => $c]);
        }
        $split = [0, 0];
        if ($price > 0) {
            $w = Ledger::lockWallets($db, [$u['id']])[(int)$u['id']];
            $split = Rules::split($w['cash'], $w['credit'], $price);
            if ($split === null) {
                throw new HttpError(409, 'Bakiye yetersiz. ' . Rules::tl($price - $w['cash'] - $w['credit']) . ' daha yükleyin.', 'insufficient',
                    ['need' => Text::tl($price - $w['cash'] - $w['credit'])]);
            }
        }
        $c1 = self::color(isset($newSrv['c1']) ? $newSrv['c1'] : ($srv ? $srv['c1'] : ''), '#333333');
        $c2 = self::color(isset($newSrv['c2']) ? $newSrv['c2'] : ($srv ? $srv['c2'] : ''), '#777777');
        $name = $srv ? $srv['name'] : $newSrv['name'];
        $id = $db->insert('ads', [
            'owner_id' => (int)$u['id'], 'type' => $type, 'server_id' => $srv ? (int)$srv['id'] : null,
            'new_srv' => $newSrv ? json_encode($newSrv, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'title' => yp_str($title !== '' ? $title : $name, 80), 'text' => yp_str($text, 200), 'link' => $srv ? '' : yp_str(isset($newSrv['url']) ? $newSrv['url'] : '', 255),
            'c1' => $c1, 'c2' => $c2,
            'start_at' => max($start, $now), 'until_at' => $start + $days * self::D, 'days' => $days, 'active' => 1,
            'status' => $free ? 'onayli' : 'onay', 'price' => $price, 'paid_cash' => $split[0], 'paid_credit' => $split[1], 'free' => $free ? 1 : 0,
            'ok_at' => $free ? $now : null, 'ok_by' => $free ? (int)$u['id'] : null, 'created_at' => $now, 'updated_at' => $now,
        ]);
        self::attach($db, $id, $media);
        $no = 'a' . $id;
        if ($price > 0) {
            $lbl = 'Reklam rezervasyonu: ' . $P['name'] . ' (' . $days . ' gün) · onay bekliyor';
            $jid = Ledger::post($db, 'reklam', ['ref_type' => 'ad', 'ref_id' => $no, 'user' => $u['id'], 'amount' => $price, 'actor' => $u['id'],
                'meta' => ['m' => $P['name'] . ' · ' . $name . ' · ' . $days . ' gün', 'ref' => $no, 'stage' => 'odeme']], [
                [Ledger::cash($u['id']), -$split[0], $lbl],
                [Ledger::credit($u['id']), -$split[1], $lbl],
                ['ESCROW:ADS', $price],
            ]);
            $db->update('ads', ['journal_id' => $jid], 'id=?', [$id]);
        }
        $a = self::row($db, $id);
        if ($free) {
            Audit::log($db, $u['id'], 'ad_add_free', 'ad', $no, ['type' => $type, 'days' => $days, 'start' => $a['start_at']]);
            if ($newSrv) {
                self::createServer($db, $a, $u);
                $a = self::row($db, $id);
            }
        } else {
            foreach (self::staffWith($db, 'reklam') as $s) {
                Notify::send($db, $s['id'], 'Yeni reklam onay bekliyor: ' . $P['name'] . ' · ' . $name . ' · ' . self::dstr($a['start_at']), '#yonetim/reklam/onay');
            }
            Notify::send($db, $u['id'], 'Reklam rezervasyonunuz alındı (' . self::dstr($a['start_at']) . ' – ' . self::dstr($a['until_at'] - 1) . '). Yönetici onayından sonra yayına girecek.', '#reklam-ver');
        }
        return $a;
    }

    public static function dstr($t)
    {
        return gmdate('d.m.Y', intdiv((int)$t + self::TZ, 1000));
    }

    /** Listede olmayan server: onayda servers tablosuna eklenir (PVP), reklam o servera bağlanır */
    private static function createServer(Db $db, array $a, array $staff)
    {
        $x = json_decode((string)$a['new_srv'], true);
        if (!is_array($x) || empty($x['name'])) {
            return null;
        }
        $slug = Text::slug($x['name']);
        $ex = $db->one('SELECT * FROM {servers} WHERE slug=? AND deleted_at IS NULL', [$slug]);
        if ($ex) {
            $sid = (int)$ex['id'];
        } else {
            $now = yp_now_ms();
            $row = [
                'sec' => 'pvp', 'name' => $x['name'], 'slug' => Catalog::uniqueSlug($db, $x['name']), 'type' => isset($x['type']) && $x['type'] !== '' ? $x['type'] : 'PVP',
                'lv' => isset($x['lv']) ? (string)$x['lv'] : '', 'url' => isset($x['url']) ? (string)$x['url'] : '',
                'c1' => self::color(isset($x['c1']) ? $x['c1'] : '', '#1d6fa5'), 'c2' => self::color(isset($x['c2']) ? $x['c2'] : '', '#e0a020'),
                'open_at' => isset($x['open_at']) && $x['open_at'] ? (int)$x['open_at'] : $now, 'descr' => '', 'ep_on' => 0, 'active' => 1,
                'sort' => (int)$db->val("SELECT COALESCE(MAX(sort),0)+1 FROM {servers} WHERE sec='pvp'"), 'added_at' => $now, 'updated_at' => $now,
            ];
            $sid = $db->insert('servers', $row);
            Audit::log($db, $staff['id'], 'server_add', 'server', $sid, ['name' => $row['name'], 'sec' => 'pvp', 'via' => 'ad', 'ad' => 'a' . $a['id']]);
        }
        $db->update('ads', ['server_id' => $sid, 'new_srv' => null, 'updated_at' => yp_now_ms()], 'id=?', [(int)$a['id']]);
        return $sid;
    }

    /** ad-ok: onay. ESCROW:ADS → REV:ads. Başlangıç geçtiyse yayın süresi kaydırılır (yer varsa). */
    public static function approve(Db $db, array $staff, array $a)
    {
        if ($a['status'] !== 'onay') {
            throw HttpError::conflict('Bu reklam onay beklemiyor.');
        }
        $P = self::pack($db, $a['type']);
        $now = yp_now_ms();
        $set = ['status' => 'onayli', 'active' => 1, 'ok_at' => $now, 'ok_by' => (int)$staff['id'], 'updated_at' => $now];
        if ((int)$a['start_at'] < $now) {
            $until = (int)$a['until_at'] + ($now - (int)$a['start_at']);
            self::lockSlot($db, $a['type'], $P['cap']);
            if (!self::clashRange($db, $a['type'], (int)$a['until_at'], $until, $P['cap'], (int)$a['id'])) {
                $set['until_at'] = $until;
            }
            $set['start_at'] = $now;
        }
        $no = 'a' . $a['id'];
        if ((int)$a['price'] > 0) {
            $jid = Ledger::post($db, 'reklam', ['ref_type' => 'ad', 'ref_id' => $no, 'user' => $a['owner_id'], 'amount' => (int)$a['price'], 'actor' => $staff['id'],
                'meta' => ['m' => $P['name'] . ' onaylandı', 'ref' => $no, 'stage' => 'onay']], [
                ['ESCROW:ADS', -(int)$a['price']],
                ['REV:ads', (int)$a['price']],
            ]);
        }
        $db->update('ads', $set, 'id=?', [(int)$a['id']]);
        if ($a['new_srv']) {
            self::createServer($db, $a, $staff);
        }
        $a = self::row($db, $a['id']);
        Audit::log($db, $staff['id'], 'ad_approve', 'ad', $no, ['price' => (int)$a['price'], 'start' => (int)$a['start_at'], 'until' => (int)$a['until_at']]);
        if ($a['owner_id']) {
            Notify::send($db, $a['owner_id'], 'Reklamınız onaylandı: ' . $P['name'] . ' · ' . self::dstr($a['start_at']) . ' – ' . self::dstr($a['until_at'] - 1)
                . ((int)$a['start_at'] > $now ? ' tarihinde yayına girecek.' : ' şu an yayında.'), '#hesabim', 'ad');
        }
        return $a;
    }

    /** ESCROW:ADS → üyenin ödediği kovalar */
    private static function refund(Db $db, array $a, $actorId, $why)
    {
        if ((int)$a['price'] <= 0 || !$a['owner_id']) {
            return 0;
        }
        $P = self::pack($db, $a['type']);
        $no = 'a' . $a['id'];
        $lbl = 'Reklam iadesi: ' . $P['name'];
        Ledger::post($db, 'reklam', ['ref_type' => 'ad', 'ref_id' => $no, 'user' => $a['owner_id'], 'amount' => -(int)$a['price'], 'actor' => $actorId,
            'meta' => ['m' => $P['name'] . ' · ' . $why, 'ref' => $no, 'stage' => 'iade']], [
            ['ESCROW:ADS', -(int)$a['price']],
            [Ledger::cash($a['owner_id']), (int)$a['paid_cash'], $lbl],
            [Ledger::credit($a['owner_id']), (int)$a['paid_credit'], $lbl],
        ]);
        return (int)$a['price'];
    }

    /** adrej: red + iade */
    public static function reject(Db $db, array $staff, array $a, $reason)
    {
        if ($a['status'] !== 'onay') {
            throw HttpError::conflict('Bu reklam onay beklemiyor.');
        }
        $r = trim(is_scalar($reason) ? (string)$reason : '');
        if ($r === '') {
            $r = 'Reklam içeriği kurallarımıza uygun bulunmadı.';
        }
        $r = yp_str($r, 255);
        $back = self::refund($db, $a, $staff['id'], 'reddedildi');
        $db->update('ads', ['status' => 'red', 'reason' => $r, 'active' => 0, 'updated_at' => yp_now_ms()], 'id=?', [(int)$a['id']]);
        Audit::log($db, $staff['id'], 'ad_reject', 'ad', 'a' . $a['id'], ['reason' => $r, 'refund' => $back]);
        if ($a['owner_id']) {
            Notify::send($db, $a['owner_id'], 'Reklam başvurunuz onaylanmadı: ' . $r . ($back ? ' · ' . Rules::tl($back) . ' bakiyenize iade edildi.' : ''), '#reklam-ver', 'ad');
        }
        return self::row($db, $a['id']);
    }

    /** ad-toggle: durdur / başlat (başlatırken takvimde yer olmalı) */
    public static function toggle(Db $db, array $staff, array $a)
    {
        if ($a['status'] === 'red') {
            throw HttpError::conflict('Reddedilen reklam yayına alınamaz.');
        }
        $on = (int)$a['active'] ? 0 : 1;
        if ($on && (int)$a['until_at'] > yp_now_ms()) {
            $P = self::pack($db, $a['type']);
            self::lockSlot($db, $a['type'], $P['cap']);
            $c = self::clashRange($db, $a['type'], max((int)$a['start_at'], yp_now_ms()), (int)$a['until_at'], $P['cap'], (int)$a['id']);
            if ($c) {
                throw new HttpError(409, self::dstr($c) . ' tarihinde bu alan dolu; reklam başlatılamaz.', 'ad_full', ['day' => $c]);
            }
        }
        $db->update('ads', ['active' => $on, 'updated_at' => yp_now_ms()], 'id=?', [(int)$a['id']]);
        Audit::log($db, $staff['id'], $on ? 'ad_start' : 'ad_stop', 'ad', 'a' . $a['id']);
        return self::row($db, $a['id']);
    }

    /** ad-ext: +7 gün (yönetici, ücretsiz). Uzatılan günlerde yer olmalı. */
    public static function extend(Db $db, array $staff, array $a, $days = 7)
    {
        if ($a['status'] === 'red') {
            throw HttpError::conflict('Reddedilen reklam uzatılamaz.');
        }
        $now = yp_now_ms();
        $from = max((int)$a['until_at'], $now);
        $until = $from + (int)$days * self::D;
        $P = self::pack($db, $a['type']);
        self::lockSlot($db, $a['type'], $P['cap']);
        $c = self::clashRange($db, $a['type'], $from, $until, $P['cap'], (int)$a['id']);
        if ($c) {
            throw new HttpError(409, self::dstr($c) . ' tarihinde bu alan dolu; reklam uzatılamaz.', 'ad_full', ['day' => $c]);
        }
        $set = ['until_at' => $until, 'active' => 1, 'updated_at' => $now];
        if ((int)$a['until_at'] < $now) {
            $set['start_at'] = $now;
        }
        $db->update('ads', $set, 'id=?', [(int)$a['id']]);
        Audit::log($db, $staff['id'], 'ad_extend', 'ad', 'a' . $a['id'], ['days' => (int)$days, 'until' => $until]);
        return self::row($db, $a['id']);
    }

    /** ad-del: onay bekleyen ücretli reklam silinirse önce iade edilir */
    public static function delete(Db $db, array $staff, array $a)
    {
        $back = $a['status'] === 'onay' ? self::refund($db, $a, $staff['id'], 'silindi') : 0;
        $mids = array_map('intval', array_column($db->all('SELECT media_id FROM {ad_media} WHERE ad_id=?', [(int)$a['id']]), 'media_id'));
        $db->exec('DELETE FROM {ad_media} WHERE ad_id=?', [(int)$a['id']]);
        $db->exec('DELETE FROM {ad_stats} WHERE ad_id=?', [(int)$a['id']]);
        $db->exec('DELETE FROM {ads} WHERE id=?', [(int)$a['id']]);
        foreach ($mids as $mid) {
            $db->update('media', ['ref_type' => '', 'ref_id' => null], 'id=?', [$mid]); // 24 saat sonra cron temizler
        }
        Audit::log($db, $staff['id'], 'ad_delete', 'ad', 'a' . $a['id'], ['type' => $a['type'], 'status' => $a['status'], 'refund' => $back, 'price' => (int)$a['price']]);
        if ($back && $a['owner_id']) {
            Notify::send($db, $a['owner_id'], 'Reklam başvurunuz iptal edildi · ' . Rules::tl($back) . ' bakiyenize iade edildi.', '#reklam-ver', 'ad');
        }
        return $back;
    }

    /** admediaadd: yönetim yüklemesi (media kind=ad, herhangi bir yetkili yüklemiş olabilir) */
    public static function mediaAdd(Db $db, array $staff, array $a, $raw)
    {
        if (!in_array($a['type'], self::MEDIA_TYPES, true)) {
            throw HttpError::validation(['media' => 'Bu reklam alanı görsel kullanmaz.']);
        }
        $media = self::mediaRows($db, $raw, null, $a['id']);
        if (!$media) {
            throw HttpError::validation(['media' => 'Dosya seçin.']);
        }
        $n = (int)$db->val('SELECT COUNT(*) FROM {ad_media} WHERE ad_id=?', [(int)$a['id']]);
        if ($n + count($media) > self::MAX_MEDIA) {
            throw HttpError::validation(['media' => 'Bir reklamda en fazla ' . self::MAX_MEDIA . ' görsel/video olabilir.']);
        }
        self::attach($db, $a['id'], $media);
        Audit::log($db, $staff['id'], 'ad_media_add', 'ad', 'a' . $a['id'], ['n' => count($media)]);
        return self::row($db, $a['id']);
    }

    public static function mediaClear(Db $db, array $staff, array $a)
    {
        $mids = array_column($db->all('SELECT media_id FROM {ad_media} WHERE ad_id=?', [(int)$a['id']]), 'media_id');
        $db->exec('DELETE FROM {ad_media} WHERE ad_id=?', [(int)$a['id']]);
        foreach ($mids as $mid) {
            $db->update('media', ['ref_type' => '', 'ref_id' => null], 'id=?', [(int)$mid]);
        }
        Audit::log($db, $staff['id'], 'ad_media_clear', 'ad', 'a' . $a['id'], ['n' => count($mids)]);
        return self::row($db, $a['id']);
    }

    /* ---------------- istatistik (beacon) ---------------- */

    /** POST ads/events: {imp:['a1',…], clk:['a2',…]} — yalnız yayındaki reklamlar sayılır */
    public static function events(Db $db, $imp, $clk)
    {
        $now = yp_now_ms();
        $day = self::dayKey($now);
        $n = 0;
        foreach (['imp' => $imp, 'clk' => $clk] as $k => $L) {
            if (!is_array($L)) {
                continue;
            }
            $ids = [];
            foreach (array_slice(array_values($L), 0, 30) as $x) {
                try {
                    $ids[self::parseId($x)] = 1;
                } catch (HttpError $e) {
                    // geçersiz kimlik: yok say
                }
            }
            foreach (array_keys($ids) as $id) {
                $ok = $db->val("SELECT 1 FROM {ads} WHERE id=? AND status='onayli' AND active=1 AND start_at<=? AND until_at>?", [$id, $now, $now]);
                if (!$ok) {
                    continue;
                }
                $db->insertIgnore('ad_stats', ['ad_id' => $id, 'day' => $day, 'imp' => 0, 'clk' => 0]);
                $db->exec('UPDATE {ad_stats} SET ' . $k . '=' . $k . '+1 WHERE ad_id=? AND day=?', [$id, $day]);
                $db->exec('UPDATE {ads} SET ' . ($k === 'imp' ? 'views=views+1' : 'clicks=clicks+1') . ' WHERE id=?', [$id]);
                $n++;
            }
        }
        return $n;
    }

    /* ---------------- sunum ---------------- */

    /** [ad_id => [{id,url,video}]] */
    public static function mediaFor(Db $db, array $ids, $table = 'ad_media', $col = 'ad_id')
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (!$ids) {
            return [];
        }
        $rows = $db->all('SELECT x.' . $col . ' AS rid, m.* FROM {' . $table . '} x JOIN {media} m ON m.id=x.media_id WHERE x.' . $col . ' IN ('
            . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY x.' . $col . ', x.pos', $ids);
        $out = [];
        foreach ($rows as $m) {
            $out[(int)$m['rid']][] = ['id' => Ids::m($m['id']), 'url' => Media::url($m), 'video' => strncmp($m['mime'], 'video/', 6) === 0];
        }
        return $out;
    }

    /**
     * S.ads şekli. $level: public (yayındaki reklam), owner (Reklamlarım), admin (yönetim).
     * Para TL; zamanlar ms.
     */
    public static function present(Db $db, array $rows, $level = 'public')
    {
        $media = self::mediaFor($db, array_column($rows, 'id'));
        $out = [];
        foreach ($rows as $a) {
            $x = [
                'id' => 'a' . (int)$a['id'], 'type' => $a['type'], 'server' => Ids::sv($a['server_id']), 'title' => $a['title'], 'text' => $a['text'],
                'btn' => $a['btn'], 'link' => $a['link'], 'c' => [$a['c1'] ?: '#333333', $a['c2'] ?: '#777777'],
                'start' => (int)$a['start_at'], 'until' => (int)$a['until_at'], 'days' => (int)$a['days'], 'active' => (bool)(int)$a['active'],
                'status' => $a['status'], 'media' => isset($media[(int)$a['id']]) ? $media[(int)$a['id']] : [],
            ];
            if ($level !== 'public') {
                $ns = $a['new_srv'] ? json_decode((string)$a['new_srv'], true) : null;
                $x += [
                    'owner' => Ids::u($a['owner_id']), 'price' => Text::tl($a['price']), 'reason' => $a['reason'], 'bookedAt' => (int)$a['created_at'],
                    'okAt' => $a['ok_at'] !== null ? (int)$a['ok_at'] : null, 'views' => (int)$a['views'], 'clicks' => (int)$a['clicks'], 'free' => (bool)(int)$a['free'],
                    'newSrv' => is_array($ns) ? ['name' => $ns['name'], 'lv' => isset($ns['lv']) ? $ns['lv'] : '', 'type' => isset($ns['type']) ? $ns['type'] : '', 'url' => isset($ns['url']) ? $ns['url'] : ''] : null,
                ];
            }
            if ($level === 'admin') {
                $x += ['paid' => ['w' => Text::tl($a['paid_cash']), 'nw' => Text::tl($a['paid_credit'])], 'okBy' => Ids::u($a['ok_by'])];
            }
            $out[] = $x;
        }
        return $out;
    }

    public static function liveRows(Db $db)
    {
        $now = yp_now_ms();
        return $db->all("SELECT * FROM {ads} WHERE status='onayli' AND active=1 AND start_at<=? AND until_at>? ORDER BY ok_at, id LIMIT 200", [$now, $now]);
    }

    /** Reklam ayrıntısı (ad-detail): günlük istatistikler */
    public static function stats(Db $db, $adId, $days = 30)
    {
        $out = [];
        foreach ($db->all('SELECT day, imp, clk FROM {ad_stats} WHERE ad_id=? ORDER BY day DESC LIMIT ' . (int)$days, [(int)$adId]) as $r) {
            $out[$r['day']] = [(int)$r['imp'], (int)$r['clk']];
        }
        return $out;
    }

    /** Defter tutarlılığı: onay bekleyen ücretli reklamların toplamı = ESCROW:ADS */
    public static function escrowCheck(Db $db)
    {
        $pend = (int)$db->val("SELECT COALESCE(SUM(price),0) FROM {ads} WHERE status='onay'");
        $esc = Ledger::balance($db, 'ESCROW:ADS');
        return $pend === $esc ? null : 'Reklam havuzu uyuşmuyor: onay bekleyen reklamlar ' . $pend . ', ESCROW:ADS ' . $esc;
    }
}
