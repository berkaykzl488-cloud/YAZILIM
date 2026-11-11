<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Katalog: serverlar, ilanlar, hazır ilan görselleri. Sunucu satırlarını ön yüzün S şekline çevirir
 * (S.servers / S.listings alanları: id, sec, name, c:[c1,c2] … / id, no, seller, server, cat, title, price(TL), stock, del, status, t, bump…).
 */
final class Catalog
{
    const M2_CATS = ['yang', 'ep', 'item', 'karakter'];
    const DIGER_CATS = ['hesap', 'epin', 'yang', 'item'];
    const DELS = ['Anında', '5 dk', '15 dk', '30 dk', '1 saat', '3 saat', '24 saat'];
    const MAX_IMGS = 10;                 // ön yüzdeki PUP_MAX
    const FREE_BUMP_MS = 7200000;        // 2 saat
    const MAX_PRICE = 1000000000;        // 10.000.000 TL (kuruş)
    const COVER_RX = '/^(yang|item|karakter|ep)-(10|[1-9])$/';

    /* ---------------- serverlar ---------------- */

    public static function presentServer(array $s, array $counts = [])
    {
        $n = isset($counts[(int)$s['id']]) ? $counts[(int)$s['id']] : [];
        $out = [
            'id' => Ids::sv($s['id']), 'sec' => $s['sec'], 'name' => $s['name'], 'slug' => $s['slug'], 'type' => $s['type'], 'lv' => $s['lv'],
            'c' => [$s['c1'], $s['c2']], 'online' => (int)$s['online'], 'desc' => (string)$s['descr'], 'url' => $s['url'],
            'ep' => (bool)(int)$s['ep_on'], 'partner' => $s['partner_at'] !== null, 'added' => (int)$s['added_at'], 'sort' => (int)$s['sort'],
            'n' => ['all' => array_sum($n)] + array_fill_keys(self::M2_CATS, 0),
        ];
        foreach ($n as $cat => $c) {
            $out['n'][$cat] = (int)$c;
        }
        if ($s['open_at'] !== null) {
            $out['open'] = (int)$s['open_at'];
        }
        if ((string)$s['seo'] !== '') {
            $out['seo'] = (string)$s['seo'];
        }
        if (!(int)$s['active']) {
            $out['hidden'] = true;
        }
        if (!empty($s['logo_url'])) {
            $out['logo'] = $s['logo_url'];
        }
        return $out;
    }

    /** Server başına kategori bazında aktif ilan sayıları: [server_id => [cat => n]] */
    public static function counts(Db $db)
    {
        $out = [];
        foreach ($db->all("SELECT server_id, cat, COUNT(*) AS n FROM {listings} WHERE status='aktif' AND stock>0 AND server_id IS NOT NULL GROUP BY server_id, cat") as $r) {
            $out[(int)$r['server_id']][$r['cat']] = (int)$r['n'];
        }
        return $out;
    }

    /** Sıralı server listesi (silinenler hiç yok; pasifler yalnız $all ile) */
    public static function servers(Db $db, $all = false)
    {
        $rows = $db->all('SELECT s.*, m.path AS logo_path, m.vis AS logo_vis, m.id AS logo_mid FROM {servers} s LEFT JOIN {media} m ON m.id=s.logo_media_id
            WHERE s.deleted_at IS NULL' . ($all ? '' : ' AND s.active=1') . " ORDER BY CASE WHEN s.sec='tr' THEN 0 ELSE 1 END, s.sort, s.id");
        $counts = self::counts($db);
        return array_map(function ($s) use ($counts) {
            if ($s['logo_path']) {
                $s['logo_url'] = Media::url(['vis' => $s['logo_vis'], 'path' => $s['logo_path'], 'id' => $s['logo_mid']]);
            }
            return self::presentServer($s, $counts);
        }, $rows);
    }

    public static function serverRow(Db $db, $id, $withDeleted = false)
    {
        $s = $db->one('SELECT * FROM {servers} WHERE id=?' . ($withDeleted ? '' : ' AND deleted_at IS NULL'), [Ids::server($id)]);
        if (!$s) {
            throw HttpError::notFound('Server bulunamadı.');
        }
        return $s;
    }

    /** Benzersiz adres parçası (aynı ad varsa -2, -3 …) */
    public static function uniqueSlug(Db $db, $name, $exceptId = 0)
    {
        $base = Text::slug($name);
        $slug = $base;
        for ($i = 2; $db->val('SELECT id FROM {servers} WHERE slug=? AND id<>?', [$slug, (int)$exceptId]); $i++) {
            $slug = substr($base, 0, 64) . '-' . $i;
        }
        return $slug;
    }

    /** Server formu doğrulama (ekle/düzenle). $old: düzenlenen satır */
    public static function serverInput(array $in, ?array $old = null)
    {
        $v = new V($in);
        $name = $v->str('name', $old ? 0 : 2, 60, null, 'Server adı 2-60 karakter olmalı.');
        $sec = $v->oneOf('sec', ['tr', 'pvp'], $old ? $old['sec'] : 'tr');
        $type = $v->str('type', 0, 30);
        $lv = $v->str('lv', 0, 20);
        $url = $v->str('url', 0, 255);
        if ($url !== null && $url !== '' && !preg_match('#^https?://[^\s<>"\']+$#i', $url)) {
            $v->err('url', 'Web adresi http:// ya da https:// ile başlamalı.');
        }
        $partner = $v->str('partnerUrl', 0, 255);
        if ($partner !== null && $partner !== '' && !preg_match('#^https?://[^\s<>"\']+$#i', $partner)) {
            $v->err('partnerUrl', 'Partner adresi http:// ya da https:// ile başlamalı.');
        }
        $c = isset($in['c']) && is_array($in['c']) ? array_values($in['c']) : [isset($in['c1']) ? $in['c1'] : null, isset($in['c2']) ? $in['c2'] : null];
        $col = [];
        foreach ([0, 1] as $i) {
            $x = isset($c[$i]) && is_string($c[$i]) ? strtolower(trim($c[$i])) : '';
            if ($x !== '' && !preg_match('/^#[0-9a-f]{6}$/', $x)) {
                $v->err('c', 'Renk #rrggbb biçiminde olmalı.');
            }
            $col[$i] = $x;
        }
        $desc = $v->str('desc', 0, 2000);
        $seo = $v->str('seo', 0, 2000);
        $online = $v->int('online', 0, 10000000);
        $sort = $v->int('sort', -100000, 100000);
        $v->done();
        $row = [];
        if ($name !== null && $name !== '') {
            $row['name'] = $name;
        }
        $row['sec'] = $sec;
        foreach (['type' => $type, 'lv' => $lv, 'url' => $url, 'descr' => $desc, 'seo' => $seo] as $k => $x) {
            if ($v->has($k === 'descr' ? 'desc' : $k)) {
                $row[$k] = (string)$x;
            }
        }
        if ($v->has('partnerUrl')) {
            $row['partner_url'] = $partner === '' ? null : $partner;
        }
        if ($v->has('partner')) {
            $row['partner_at'] = $v->bool('partner') ? ($old && $old['partner_at'] ? (int)$old['partner_at'] : yp_now_ms()) : null;
        }
        if ($col[0] !== '') {
            $row['c1'] = $col[0];
        }
        if ($col[1] !== '') {
            $row['c2'] = $col[1];
        }
        if ($online !== null) {
            $row['online'] = $online;
        }
        if ($sort !== null) {
            $row['sort'] = $sort;
        }
        if ($v->has('ep')) {
            $row['ep_on'] = $sec === 'pvp' && $v->bool('ep') ? 1 : 0;
        } elseif ($sec === 'tr') {
            $row['ep_on'] = 0;
        }
        if ($v->has('active')) {
            $row['active'] = $v->bool('active') ? 1 : 0;
        }
        if ($v->has('open')) {
            $o = $v->raw('open');
            $row['open_at'] = $o === null || $o === '' ? null : (is_numeric($o) ? (int)$o : (strtotime((string)$o) ?: null) * 1000);
        }
        return $row;
    }

    /* ---------------- ilanlar ---------------- */

    public static function presentListing(array $l, array $media = [])
    {
        $imgs = array_map(function ($m) {
            return Media::url($m);
        }, $media);
        $out = [
            'id' => Ids::l($l['id']), 'no' => (int)$l['no'], 'seller' => Ids::u($l['seller_id']), 'game' => $l['game'],
            'server' => $l['server_id'] !== null ? Ids::sv($l['server_id']) : null, 'cat' => $l['cat'],
            'title' => $l['title'], 'price' => Text::tl($l['price']), 'stock' => (int)$l['stock'], 'del' => $l['del_txt'],
            'desc' => (string)$l['descr'], 'status' => $l['status'], 't' => (int)$l['created_at'], 'bump' => (int)$l['bump_at'],
            'views' => (int)$l['views'], 'dop' => (object)[], 'freeBump' => (int)$l['free_bump_at'], 'cover' => $l['cover'],
            'img' => $imgs ? $imgs[0] : null, 'imgs' => $imgs,
            'media' => array_map(function ($m) {
                return ['id' => Ids::m($m['id']), 'url' => Media::url($m), 'w' => (int)$m['w'], 'h' => (int)$m['h']];
            }, $media),
            'up' => (int)$l['updated_at'],
        ];
        if ($l['sec'] !== null && $l['server_id'] === null) {
            $out['sec'] = $l['sec'];
        }
        if ($l['sub'] !== '') {
            $out['sub'] = $l['sub'];
        }
        if ($l['skin'] !== null && $l['skin'] !== '') {
            $out['skin'] = json_decode($l['skin'], true);
        }
        return $out;
    }

    /** [listing_id => [media satırları (pos sırasıyla)]] */
    public static function mediaFor(Db $db, array $ids)
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (!$ids) {
            return [];
        }
        $out = [];
        $rows = $db->all('SELECT lm.listing_id, lm.pos, m.* FROM {listing_media} lm JOIN {media} m ON m.id=lm.media_id WHERE lm.listing_id IN ('
            . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY lm.listing_id, lm.pos', $ids);
        foreach ($rows as $r) {
            $out[(int)$r['listing_id']][] = $r;
        }
        return $out;
    }

    /** Satırları sunar + bahsi geçen satıcıların herkese açık kayıtları */
    public static function presentMany(Db $db, array $rows)
    {
        $media = self::mediaFor($db, array_column($rows, 'id'));
        $L = array_map(function ($l) use ($media) {
            return self::presentListing($l, isset($media[(int)$l['id']]) ? $media[(int)$l['id']] : []);
        }, $rows);
        return [$L, self::publicUsers($db, array_column($rows, 'seller_id'))];
    }

    public static function publicUsers(Db $db, array $ids)
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) {
            return [];
        }
        $rows = $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
        return array_map([Present::class, 'publicUser'], $rows);
    }

    /** Herkes görebilir mi? Taslak/bekleyen/kaldırılan yalnız sahibine ve [ilan] yetkilisine */
    public static function visibleTo(array $l, $user)
    {
        if (in_array($l['status'], ['aktif', 'satildi'], true)) {
            return true;
        }
        if (!$user) {
            return false;
        }
        return (int)$l['seller_id'] === (int)$user['id'] || Perm::has($user, 'ilan');
    }

    public static function listingRow(Db $db, $id, $lock = false)
    {
        $l = $db->one('SELECT * FROM {listings} WHERE id=?' . ($lock ? $db->forUpdate() : ''), [Ids::listing($id)]);
        if (!$l) {
            throw HttpError::notFound('İlan bulunamadı.');
        }
        return $l;
    }

    /* ---- anahtar kümesi (keyset) sayfalama ---- */

    const SORTS = ['yeni' => ['bump_at', 'DESC'], 'ucuz' => ['price', 'ASC'], 'pahali' => ['price', 'DESC'], 'eski' => ['bump_at', 'ASC']];

    public static function cursor(array $row, $sort)
    {
        $col = self::SORTS[$sort][0];
        return $row[$col] . '_' . (int)$row['id'];
    }

    /**
     * Filtreler: sec, server, cat, game, q, seller, status(dizi; varsayılan herkese açık: aktif + stok>0), sort, after
     * Dönüş: [satırlar, next|null]
     */
    public static function query(Db $db, array $f, $limit = 24)
    {
        $limit = max(1, min(100, (int)$limit));
        $sort = isset($f['sort']) && isset(self::SORTS[$f['sort']]) ? $f['sort'] : 'yeni';
        list($col, $dir) = self::SORTS[$sort];
        $w = [];
        $p = [];
        if (!empty($f['status'])) {
            $st = array_values(array_intersect((array)$f['status'], ['aktif', 'beklemede', 'satildi', 'kaldirildi']));
            $w[] = 'status IN (' . implode(',', array_fill(0, max(1, count($st)), '?')) . ')';
            $p = array_merge($p, $st ?: ['-']);
        } else {
            $w[] = "status='aktif'";
            $w[] = 'stock>0';
        }
        if (!empty($f['sec'])) {
            $w[] = '(sec=? OR server_id IN (SELECT id FROM {servers} WHERE sec=?))';
            array_push($p, $f['sec'], $f['sec']);
        }
        if (!empty($f['server_id'])) {
            $w[] = 'server_id=?';
            $p[] = (int)$f['server_id'];
        }
        if (!empty($f['cat'])) {
            $w[] = 'cat=?';
            $p[] = $f['cat'];
        }
        if (!empty($f['game'])) {
            $w[] = 'game=?';
            $p[] = $f['game'];
        }
        if (!empty($f['seller_id'])) {
            $w[] = 'seller_id=?';
            $p[] = (int)$f['seller_id'];
        }
        if (isset($f['q']) && trim((string)$f['q']) !== '') {
            $q = yp_str($f['q'], 60);
            $or = ["title_norm LIKE ? ESCAPE '!'"];
            $p[] = '%' . Text::likeEscape(Text::fold($q)) . '%';
            if (preg_match('/^#?([0-9]{3,15})$/', $q, $m)) {
                $or[] = 'no=?';
                $p[] = (int)$m[1];
            }
            $w[] = '(' . implode(' OR ', $or) . ')';
        }
        if (!empty($f['after']) && preg_match('/^([0-9]{1,18})_([0-9]{1,18})$/', (string)$f['after'], $m)) {
            $op = $dir === 'DESC' ? '<' : '>';
            $w[] = "($col $op ? OR ($col = ? AND id $op ?))";
            array_push($p, (int)$m[1], (int)$m[1], (int)$m[2]);
        }
        $sql = 'SELECT * FROM {listings} WHERE ' . implode(' AND ', $w) . " ORDER BY $col $dir, id $dir LIMIT " . ($limit + 1);
        $rows = $db->all($sql, $p);
        $more = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        return [$rows, $more && $rows ? self::cursor(end($rows), $sort) : null];
    }

    /** İstek sorgusundan filtre */
    public static function filtersFrom(array $q)
    {
        $g = function ($k) use ($q) {
            return isset($q[$k]) && is_scalar($q[$k]) ? trim((string)$q[$k]) : '';
        };
        $f = ['sort' => $g('sort') ?: 'yeni', 'after' => $g('after'), 'q' => $g('q')];
        if (in_array($g('sec'), ['tr', 'pvp'], true)) {
            $f['sec'] = $g('sec');
        }
        if ($g('server') !== '') {
            $f['server_id'] = Ids::server($g('server'));
        }
        if (preg_match('/^[a-z]{2,12}$/', $g('cat'))) {
            $f['cat'] = $g('cat');
        }
        if (in_array($g('game'), ['metin2', 'cs2', 'diger'], true)) {
            $f['game'] = $g('game');
        }
        if ($g('seller') !== '') {
            $f['seller_id'] = Ids::user($g('seller'));
        }
        return $f;
    }

    /**
     * İlan formu doğrulama. $create: yeni ilan (oyun/server/kategori zorunlu). Dönüş: [satır, sansür bayrakları, medya kimlikleri|null]
     */
    public static function listingInput(Db $db, array $in, $create, array $site)
    {
        foreach (['dop', 'dops', 'dopings', 'doping', 'vitrin', 'acil', 'renk', 'ust'] as $k) {
            if (!empty($in[$k])) {
                throw new HttpError(400, 'İlan dopingleri (vitrin, acil, renkli, üste taşı) yakında açılacak. Şimdilik dopingsiz yayınlayabilirsiniz; ücretsiz üste taşıma 2 saatte bir kullanılabilir.', 'doping_soon');
            }
        }
        $v = new V($in);
        $row = [];
        $flags = [];
        if ($create || $v->has('title')) {
            $t = $v->str('title', 5, 90, null, 'Başlık 5-90 karakter olmalı.');
            if ($t !== null) {
                $c = Censor::apply($t);
                // '[gizlendi]' kısa parçaları uzatabilir: sütun sınırı (MySQL katı kip "Data too long" vermesin)
                $row['title'] = yp_str($c['text'], 120);
                if ($c['flagged']) {
                    $flags['title'] = $t;
                }
            }
        }
        if ($create || $v->has('price')) {
            $k = Text::kurus($v->raw('price'));
            if ($k === null || $k < 1 || $k > self::MAX_PRICE) {
                $v->err('price', 'Geçerli bir fiyat girin (0,01 – 10.000.000 TL).');
            } else {
                $row['price'] = $k;
            }
        }
        if ($create || $v->has('stock')) {
            $s = $v->int('stock', $create ? 1 : 0, 1000000, $create ? 1 : null);
            if ($s !== null) {
                $row['stock'] = $s;
            }
        }
        if ($create || $v->has('del')) {
            $d = $v->str('del', 0, 20);
            $row['del_txt'] = in_array($d, self::DELS, true) ? $d : ($d === '' || $d === null ? '15 dk' : null);
            if ($row['del_txt'] === null) {
                $v->err('del', 'Teslim süresini listeden seçin.');
            }
        }
        if ($create || $v->has('desc')) {
            $raw = $v->raw('desc');
            if ($raw !== null && !is_scalar($raw)) {
                $v->err('desc', 'Açıklama geçersiz.');
            } else {
                $d = self::multiline($raw === null ? '' : (string)$raw);
                if (mb_strlen($d, 'UTF-8') > 3000) {
                    $v->err('desc', 'Açıklama en fazla 3000 karakter olabilir.');
                } else {
                    $c = Censor::apply($d);
                    $row['descr'] = mb_substr($c['text'], 0, 6000, 'UTF-8');
                    if ($c['flagged']) {
                        $flags['desc'] = $d;
                    }
                }
            }
        }
        if ($v->has('cover')) {
            $cv = $v->raw('cover');
            if ($cv !== '' && (!is_string($cv) || !preg_match(self::COVER_RX, $cv))) {
                $v->err('cover', 'Geçersiz ilan görseli.');
            } else {
                $row['cover'] = (string)$cv;
            }
        }
        if ($create) {
            $game = $v->oneOf('game', ['metin2', 'mtr', 'mpvp', 'cs2', 'diger'], 'metin2');
            if ($game === 'mtr' || $game === 'mpvp') {
                $game = 'metin2';
            }
            $row['game'] = $game;
            if ($game === 'metin2') {
                $cat = $v->oneOf('cat', self::M2_CATS);
                $sid = $v->raw('server');
                $srv = null;
                if ($sid === null || $sid === '') {
                    $v->err('server', 'Server seçin.');
                } else {
                    try {
                        $srv = $db->one('SELECT * FROM {servers} WHERE id=? AND deleted_at IS NULL AND active=1', [Ids::server($sid)]);
                    } catch (HttpError $e) {
                        $srv = null;
                    }
                    if (!$srv) {
                        $v->err('server', 'Server bulunamadı.');
                    }
                }
                if ($cat === null && !$v->has('cat')) {
                    $v->err('cat', 'Kategori seçin.');
                }
                if ($cat === 'ep' && (!$srv || $srv['sec'] === 'tr' || empty($site['pvpEpOn']))) {
                    $v->err('cat', 'EP ilanı verilemez. EP yalnızca site tarafından satılır.');
                }
                $row['cat'] = (string)$cat;
                $row['server_id'] = $srv ? (int)$srv['id'] : null;
                $row['sec'] = $srv ? $srv['sec'] : null;
            } elseif ($game === 'diger') {
                $row['cat'] = (string)$v->oneOf('cat', self::DIGER_CATS, 'item');
                $row['sub'] = $v->str('sub', 0, 40) ?: 'Diğer';
                $row['server_id'] = null;
                $row['sec'] = null;
            } else {
                if (empty($site['cs2On'])) {
                    throw new HttpError(400, 'CS2 ilanları şu an kapalı.', 'cs2_off');
                }
                $sk = isset($in['skin']) && is_array($in['skin']) ? $in['skin'] : [];
                $wear = isset($sk['wear']) && in_array($sk['wear'], ['FN', 'MW', 'FT', 'WW', 'BS'], true) ? $sk['wear'] : 'FT';
                $row['cat'] = 'skin';
                $row['skin'] = json_encode(['w' => yp_str(isset($sk['w']) ? $sk['w'] : 'rifle', 20), 'wear' => $wear,
                    'fl' => max(0, min(1, round((float)(isset($sk['fl']) ? $sk['fl'] : 0.2), 4))), 'st' => !empty($sk['st']), 'r' => yp_str(isset($sk['r']) ? $sk['r'] : 'Askeri', 20)], JSON_UNESCAPED_UNICODE);
                $row['server_id'] = null;
                $row['sec'] = null;
            }
            if (!isset($row['cover'])) {
                $c = $row['game'] === 'diger' ? (['hesap' => 'karakter', 'epin' => 'ep', 'yang' => 'yang', 'item' => 'item'][$row['cat']] ?? 'item') : (in_array($row['cat'], self::M2_CATS, true) ? $row['cat'] : 'item');
                $row['cover'] = $c . '-1';
            }
        }
        $mediaIds = null;
        if ($v->has('media') || $v->has('imgs')) {
            $raw = $v->has('media') ? $v->raw('media') : $v->raw('imgs');
            if (!is_array($raw)) {
                $v->err('media', 'Görsel listesi geçersiz.');
            } else {
                if (count($raw) > self::MAX_IMGS) {
                    $v->err('media', 'En fazla ' . self::MAX_IMGS . ' fotoğraf ekleyebilirsiniz.');
                }
                $mediaIds = [];
                foreach ($raw as $x) {
                    try {
                        $mediaIds[] = Ids::media(is_array($x) && isset($x['id']) ? $x['id'] : $x);
                    } catch (HttpError $e) {
                        $v->err('media', 'Görsel bulunamadı.');
                    }
                }
                $mediaIds = array_values(array_unique($mediaIds));
            }
        }
        $v->done();
        if (isset($row['title'])) {
            $row['title_norm'] = yp_str(Text::fold($row['title']), 190);
        }
        return [$row, $flags, $mediaIds];
    }

    /** Çok satırlı metin: satır sonları korunur, diğer denetim karakterleri ve geçersiz UTF-8 atılır */
    public static function multiline($s)
    {
        $s = str_replace(["\r\n", "\r"], "\n", (string)$s);
        $s = preg_replace('/[\x00-\x08\x0B-\x1F\x7F]/u', '', $s);
        if ($s === null) {
            return '';
        }
        return trim(preg_replace("/\n{3,}/", "\n\n", $s));
    }

    /** İlanın görsellerini değiştirir: medya yükleyenin olmalı, 'listing' türünde ve başka ilana bağlı olmamalı */
    public static function attachMedia(Db $db, $listingId, array $mediaIds, $userId)
    {
        $rows = [];
        foreach ($mediaIds as $mid) {
            $m = $db->one('SELECT * FROM {media} WHERE id=?', [(int)$mid]);
            if (!$m || (int)$m['owner_id'] !== (int)$userId || $m['kind'] !== 'listing') {
                throw HttpError::validation(['media' => 'Görsel bulunamadı ya da size ait değil.']);
            }
            if ($m['ref_type'] === 'listing' && (int)$m['ref_id'] !== (int)$listingId) {
                throw HttpError::validation(['media' => 'Bu görsel başka bir ilanda kullanılıyor.']);
            }
            $rows[] = $m;
        }
        $old = array_map('intval', array_column($db->all('SELECT media_id FROM {listing_media} WHERE listing_id=?', [(int)$listingId]), 'media_id'));
        $db->exec('DELETE FROM {listing_media} WHERE listing_id=?', [(int)$listingId]);
        foreach ($rows as $i => $m) {
            $db->insert('listing_media', ['listing_id' => (int)$listingId, 'media_id' => (int)$m['id'], 'pos' => $i]);
            $db->update('media', ['ref_type' => 'listing', 'ref_id' => (int)$listingId], 'id=?', [(int)$m['id']]);
        }
        // çıkarılan görseller sahipsiz kalır; cron 24 saat sonra siler
        $gone = array_diff($old, $mediaIds);
        foreach ($gone as $mid) {
            $db->update('media', ['ref_type' => '', 'ref_id' => null, 'created_at' => yp_now_ms()], 'id=?', [(int)$mid]);
        }
    }

    /* ---------------- hazır ilan görselleri ---------------- */

    /** {k: url} (S.covers) */
    public static function covers(Db $db)
    {
        $out = [];
        foreach ($db->all('SELECT c.k, m.id, m.path, m.vis FROM {covers} c JOIN {media} m ON m.id=c.media_id ORDER BY c.k') as $r) {
            $out[$r['k']] = Media::url($r);
        }
        return (object)$out;
    }
}
