<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Sunucu tarafı SEO: index.php'nin <head>'e yazacağı <title>/meta/canonical/JSON-LD, <main id="app"> içine önceden
 * oluşturulmuş içerik (H1, kısa giriş, alt sayfa bağlantıları), 301 yönlendirmeleri, sitemap.xml, robots.txt.
 * Ön yüzdeki seoData()/routeToPath()/pathToRoute() (src/js/90-seo.js) ile aynı adresler ve metinler.
 *
 * Adres şeması (sayfadaki "Ana Sayfa › Metin2 PVP › Albamt2 › Karakter" konum çubuğuyla aynı hiyerarşi):
 *   /                                         ana sayfa
 *   /metin2-tr  /metin2-pvp                   bölüm (server listesi)
 *   /metin2-pvp/<server>                      server sayfası
 *   /metin2-pvp/<server>/<kategori>           yang | won (TR'de yang) | item | karakter | ep | hepsi
 *   /metin2-pvp/<server>/<kategori>/<başlık>-l<id>   ilan (kimlik sonda: başlık/server/kategori değişse de bulunur → 301)
 *   /ilan/<başlık>-l<id>                      serversiz ilan; /rehber/<slug>, /sayfa/<slug>, /uye/u<id>, /<rota> (borsa, reklam-ver …)
 * Eski biçimler (/server/<slug>[/<kat>], /ilan/<slug>-l<id> serverlı ilan, tek parça /server-sv3-yang) kalıcı (301) olarak yenisine gider.
 *
 * Adres kipi (mode): 'clean' → /metin2-pvp/albamt2; 'p' → /?p=metin2-pvp/albamt2 (yönlendirmesi/rewrite'ı çalışmayan sunucu).
 * Temiz adresler ayar açık (seo.clean, varsayılan açık) VE rewrite doğrulanmışsa (seo.rw.ok) kullanılır:
 *   - kendiliğinden: bir istek index.php'ye temiz adresle ulaştıysa rewrite çalışıyordur (forRequest bunu kaydeder);
 *   - yönetim: Yönetim › SEO açıldığında (ve yönetici girişlerinde günde bir) tarayıcı /metin2-pvp?yp_probe=… ister,
 *     X-YP-Page: probe başlığını arar; gelmezse sonuç POST admin/seo/probe ile "çalışmıyor" olarak kaydedilir → ?p= adresleri.
 *
 * sitemap.xml ve robots.txt site köküne GERÇEK DOSYA olarak yazılır (cron, katalog değiştikçe; rewrite gerekmez).
 * Yazılamazsa api/v1/index.php?r=seo/sitemap.xml ve ?r=seo/robots.txt aynı içeriği verir.
 */
final class Seo
{
    const MARK = '# yangpazar: otomatik üretildi';

    /** Bölüm → adres parçası (server.sec) */
    const SECS = ['tr' => 'metin2-tr', 'pvp' => 'metin2-pvp'];
    /** Kategori adres parçası → katalog kategorisi (TR'de "won" = yang) */
    const CAT_SLUGS = ['yang' => 'yang', 'won' => 'yang', 'item' => 'item', 'karakter' => 'karakter', 'ep' => 'ep', 'hepsi' => 'hepsi'];
    /** Canlı sitede henüz "Yakında" olan sayfalar (ön yüzdeki P_SOON_R, src/js/prod/97-p0b-views.js): noindex, site haritasında yok.
     *  Bölüm açıldığında buradan da çıkarın. */
    const SOON = ['borsa', 'metin2-ep', 'cekilis', 'reklam-ver', 'ortaklik', 'yang-fiyatlari'];
    /** Özel sayfalar (ön yüzdeki PRIV_R): noindex, robots.txt'de kapalı */
    const PRIV_RX = '/^(hesabim|yonetim|mesajlar|bildirimler|siparis-|ilan-ver$|ara$|davet-|widget-)/';
    /** Bilinen tek parça rotalar; bunlar ve server/ilan/sayfa/rehber/üye dışındaki her adres gerçek 404 döner */
    const KNOWN_RX = '/^(home|metin2-tr|metin2-pvp|metin2-ep|serverler|borsa|cekilis|reklam-ver|guvenli|yang-fiyatlari|ortaklik|rehber|ara|ilan-ver|hesabim|mesajlar|bildirimler|widget-yang)$|^(mesajlar|siparis|davet|widget-yang|kategori)-[A-Za-z0-9_-]{1,60}$|^yonetim([\/?].*)?$/';

    /** Statik rotalar: [başlık, açıklama] (ön yüzdeki P tablosu) */
    public static function pages($siteName)
    {
        return [
            'metin2-tr' => ['Metin2 TR Won, Yang ve Item İlanları', 'Metin2 TR resmi serverlarında won, yang, item ve karakter ilanları. Ödemeniz teslim onaylanana kadar güvenli havuzda bekler.'],
            'metin2-pvp' => ['Metin2 PVP Serverlar · Item, Yang ve EP İlanları', 'Tüm Metin2 PVP serverları için item, yang, EP ve karakter ilanları tek yerde. Serverınızı seçin, güvenle alın veya satın.'],
            'metin2-ep' => ['Metin2 EP Satın Al · Anında Kod Teslimi', 'Metin2 EP (Ejderha Parası) kodları; ödeme sonrası kod anında ekranda ve hesabınızda.'],
            'borsa' => ['Yang Borsası · Güncel Yang Alış ve Satış', 'Metin2 yang ve won için güncel alış satış fiyatları. Siteye yang satın veya siteden yang satın alın.'],
            'cekilis' => ['Çekiliş ve Şans Çarkı', 'Haftalık çekiliş ve günlük şans çarkıyla bakiye ve EP kazanın.'],
            'reklam-ver' => ['Reklam Ver · Serverınızı Tanıtın', 'Metin2 PVP serverınızı vitrinde, slaytta ve açılış penceresinde tanıtın.'],
            'guvenli' => ['Güvenli Alışveriş ve Sıkça Sorulan Sorular', $siteName . ' aracılı alışveriş nasıl çalışır: ödeme havuzu, teslim onayı, itiraz ve iade.'],
            'yang-fiyatlari' => ['Metin2 Yang ve Won Fiyatları (Güncel)', 'Tüm Metin2 TR ve PVP serverlarında güncel yang ilanı sayısı, başlangıç fiyatları ve Yang Borsası fiyatları tek tabloda.'],
            'ortaklik' => ['Ortaklık ve Server Partnerliği', 'Server sahipleri, yayıncılar ve site sahipleri için ücretsiz ortaklık: rozet, fiyat widget\'ı ve davet linki.'],
            'rehber' => ['Metin2 Rehberi', 'Metin2 yang, EP, item ve karakter alım satımında güvenli alışveriş ipuçları ve rehberler.'],
        ];
    }

    const STATIC_PAGES = ['hakkimizda' => 'Hakkımızda', 'kvkk' => 'KVKK Aydınlatma Metni', 'mesafeli' => 'Mesafeli Satış Sözleşmesi', 'iletisim' => 'İletişim'];

    /** SEO ayarlarının varsayılanları (settings.seo) */
    public static function defaults()
    {
        return ['homeTitle' => '', 'desc' => 'Metin2 item, yang, won, EP ve karakter alım satımı. Ödemeniz teslim onaylanana kadar güvenli havuzda bekler.',
            'sep' => ' | ', 'ogImg' => '', 'ga' => '', 'gsc' => '', 'bing' => '', 'yandex' => '', 'noindex' => false,
            // clean: temiz adresler (sahibin anahtarı; varsayılan açık). rw: rewrite denetimi {ok: true|false, t: ms, via, code}
            'clean' => true, 'rw' => null];
    }

    public static function settings(Db $db)
    {
        $site = Settings::get('site', $db);
        $seo = Settings::get('seo', $db);
        $seo = array_replace(self::defaults(), is_array($seo) ? $seo : []);
        $name = !empty($site['siteName']) ? (string)$site['siteName'] : 'yangpazar.com';
        return [$site, $seo, $name];
    }

    public static function base(array $site)
    {
        $u = !empty($site['siteUrl']) ? (string)$site['siteUrl'] : '';
        if ($u === '' || !preg_match('#^https?://#i', $u)) {
            $u = 'https://www.yangpazar.com';
        }
        return rtrim($u, '/');
    }

    /* ---------------- adres kipi ve rewrite denetimi ---------------- */

    /** 'clean' (temiz adresler) ya da 'p' (?p= yedeği) */
    public static function mode(array $SE)
    {
        return !empty($SE['clean']) && is_array($SE['rw']) && !empty($SE['rw']['ok']) ? 'clean' : 'p';
    }

    /** Temiz yol (/metin2-pvp/x) → site köküne göre adres: clean → aynısı, p → /?p=metin2-pvp/x */
    public static function href($path, $mode)
    {
        $path = '/' . ltrim((string)$path, '/');
        if ($mode === 'clean' || $path === '/') {
            return $path;
        }
        return '/?p=' . str_replace('%2F', '/', rawurlencode(substr($path, 1)));
    }

    /** Ham settings.seo (varsayılanlarla birleştirilmemiş) üzerine yamalar */
    public static function saveSeo(Db $db, array $patch, $byId = null)
    {
        $cur = Settings::get('seo', $db);
        $cur = is_array($cur) ? $cur : [];
        Settings::set('seo', array_replace($cur, $patch), $byId, $db);
        return self::settings($db)[1];
    }

    /** Ön yüze giden SEO ayarları (boot.set.seo): sır içermez */
    public static function publicSeo(Db $db)
    {
        list(, $SE, ) = self::settings($db);
        $out = [];
        foreach (['homeTitle', 'desc', 'sep', 'ogImg', 'ga', 'gsc', 'bing', 'yandex'] as $k) {
            $out[$k] = (string)$SE[$k];
        }
        $rw = is_array($SE['rw']) ? $SE['rw'] : null;
        $out['noindex'] = (bool)$SE['noindex'];
        $out['clean'] = (bool)$SE['clean'];
        $out['mode'] = self::mode($SE);
        $out['rw'] = $rw ? ['ok' => !empty($rw['ok']), 't' => (int)(isset($rw['t']) ? $rw['t'] : 0), 'via' => (string)(isset($rw['via']) ? $rw['via'] : ''),
            'code' => (int)(isset($rw['code']) ? $rw['code'] : 0)] : null;
        return $out;
    }

    /**
     * Rewrite denetimi sonucu. $ok=true: index.php'ye temiz adresle bir istek ulaştı (kanıt). Değişmeyen "çalışıyor" kaydı
     * günde bir tazelenir (her sayfa görüntülenmesinde veritabanına yazılmaz).
     */
    public static function noteRewrite(Db $db, $ok, $via, $code = 0)
    {
        list(, $SE, ) = self::settings($db);
        $rw = is_array($SE['rw']) ? $SE['rw'] : [];
        $now = yp_now_ms();
        if ($ok && !empty($rw['ok']) && $via === 'istek' && $now - (int)(isset($rw['t']) ? $rw['t'] : 0) < 86400000) {
            return $SE;
        }
        $was = self::mode($SE);
        $SE = self::saveSeo($db, ['rw' => ['ok' => (bool)$ok, 't' => $now, 'via' => (string)$via, 'code' => (int)$code]]);
        if (self::mode($SE) !== $was) {
            self::writeFiles($db); // site haritası yeni adres biçimiyle
        }
        return $SE;
    }

    /* ---------------- adresler ---------------- */

    public static function secPath($sec)
    {
        return isset(self::SECS[$sec]) ? self::SECS[$sec] : 'metin2-pvp';
    }

    /** Katalog kategorisi → adres parçası (TR serverlarında yang = "won", ön yüzdeki catLabel) */
    public static function catSlug($cat, $sec)
    {
        return $cat === 'yang' && $sec === 'tr' ? 'won' : (string)$cat;
    }

    public static function catFromSlug($slug)
    {
        $slug = strtolower((string)$slug);
        return isset(self::CAT_SLUGS[$slug]) ? self::CAT_SLUGS[$slug] : null;
    }

    public static function srvPath(array $s)
    {
        return '/' . self::secPath($s['sec']) . '/' . $s['slug'];
    }

    /** İlan yolu: serverlı Metin2 ilanı server/kategori altında, diğerleri /ilan/… */
    public static function lstPath(array $l, ?array $s = null)
    {
        $tail = Text::slug($l['title']) . '-' . Ids::l($l['id']);
        if ($s && $l['game'] === 'metin2' && (int)$l['server_id'] === (int)$s['id'] && in_array($l['cat'], Catalog::M2_CATS, true)) {
            return self::srvPath($s) . '/' . self::catSlug($l['cat'], $s['sec']) . '/' . $tail;
        }
        return '/ilan/' . $tail;
    }

    /** Rota → temiz yol (ön yüzdeki routeToPath; $srv/$lst önceden yüklenmiş satırlar) */
    public static function path($route, ?array $srv = null, ?array $lst = null)
    {
        if ($route === '' || $route === 'home') {
            return '/';
        }
        if ($route === 'serverler' || $route === 'kategori-metin2') {
            return '/metin2-pvp';
        }
        if (preg_match('/^server-([^-]+)(?:-(.+))?$/', $route, $m) && $srv) {
            return self::srvPath($srv) . (isset($m[2]) && $m[2] !== '' ? '/' . self::catSlug($m[2], $srv['sec']) : '');
        }
        if (strpos($route, 'ilan-') === 0 && $route !== 'ilan-ver' && $lst) {
            return self::lstPath($lst, $srv);
        }
        foreach (['rehber', 'sayfa', 'uye'] as $k) {
            if (strpos($route, $k . '-') === 0) {
                return '/' . $k . '/' . substr($route, strlen($k) + 1);
            }
        }
        return '/' . $route;
    }

    private static function srvBy(Db $db, $col, $v)
    {
        return $db->one('SELECT * FROM {servers} WHERE ' . ($col === 'id' ? 'id' : 'slug') . '=? AND deleted_at IS NULL AND active=1', [$v]);
    }

    private static function lstBy(Db $db, $tail)
    {
        $id = substr((string)$tail, strrpos((string)$tail, '-') === false ? 0 : strrpos((string)$tail, '-') + 1);
        $l = preg_match('/^l?([1-9][0-9]{0,17})$/', $id, $m) ? $db->one('SELECT * FROM {listings} WHERE id=?', [(int)$m[1]]) : null;
        $s = $l && $l['server_id'] ? $db->one('SELECT * FROM {servers} WHERE id=? AND deleted_at IS NULL', [(int)$l['server_id']]) : null;
        return ['ilan-' . ($l ? Ids::l($l['id']) : $id), $s, $l];
    }

    /**
     * Adres → ['r' => rota, 's' => server satırı|null, 'l' => ilan satırı|null, 'form' => path|p|root, 'asked' => istenen yol, 'q' => sorgu]
     * (ön yüzdeki pathToRoute). form: path = temiz adres (rewrite ile geldi), p = ?p= yedeği, root = site kökü.
     */
    public static function resolve(Db $db, $uri)
    {
        $path = (string)parse_url((string)$uri, PHP_URL_PATH);
        parse_str((string)parse_url((string)$uri, PHP_URL_QUERY), $q);
        $form = 'root';
        $viaIndex = false;
        if (isset($q['p']) && is_string($q['p']) && trim($q['p'], '/') !== '') {
            $raw = $q['p'];
            $form = 'p';
        } else {
            $raw = rawurldecode($path);
            // site bir alt klasörde kuruluysa (/test/…) baştaki kök yolu at
            $wb = rtrim(Media::webBase(), '/');
            if ($wb !== '' && strpos($raw, $wb . '/') === 0) {
                $raw = substr($raw, strlen($wb));
            }
            $raw = ltrim($raw, '/');
            if (preg_match('#^index\.(php|html)(/|$)#', $raw)) {
                $viaIndex = true;
                $raw = (string)substr($raw, strpos($raw . '/', '/') + 1);
            }
            if (trim($raw, '/') !== '') {
                $form = $viaIndex ? 'pathinfo' : 'path';
            }
        }
        $asked = '/' . ltrim($raw, '/');
        $out = ['r' => 'home', 's' => null, 'l' => null, 'form' => $form, 'asked' => $asked, 'q' => $q];
        $p = trim(preg_replace('#(^|/)index\.(php|html)$#', '', trim($raw, '/')), '/');
        if ($p === '' || $p === 'home') {
            return $out;
        }
        $a = explode('/', $p);
        $a0 = strtolower($a[0]);
        $n = count($a);
        $set = function ($r, $s = null, $l = null) use (&$out) {
            $out['r'] = $r;
            $out['s'] = $s;
            $out['l'] = $l;
            return $out;
        };
        if (in_array($a0, self::SECS, true)) {
            if ($n === 1) {
                return $set($a0);
            }
            $s = self::srvBy($db, 'slug', strtolower($a[1]));
            if (!$s || $n > 4) {
                return $set('yok');
            }
            if ($n === 2) {
                return $set('server-' . Ids::sv($s['id']), $s);
            }
            $c = self::catFromSlug($a[2]);
            if ($c === null) {
                return $set('yok');
            }
            if ($n === 3) {
                return $set('server-' . Ids::sv($s['id']) . '-' . $c, $s);
            }
            list($r, $ls, $l) = self::lstBy($db, $a[3]);
            return $set($r, $ls, $l);
        }
        // eski biçim: /server/<slug>[/<kategori>]
        if ($a0 === 'server' && $n >= 2 && $n <= 3) {
            $s = self::srvBy($db, 'slug', strtolower($a[1]));
            $c = $n === 3 ? self::catFromSlug($a[2]) : '';
            return $s && $c !== null ? $set('server-' . Ids::sv($s['id']) . ($c !== '' ? '-' . $c : ''), $s) : $set('yok');
        }
        if ($a0 === 'ilan' && $n === 2) {
            list($r, $ls, $l) = self::lstBy($db, $a[1]);
            return $set($r, $ls, $l);
        }
        if (in_array($a0, ['rehber', 'sayfa', 'uye'], true)) {
            return $n === 2 ? $set($a0 . '-' . $a[1]) : $set('yok');
        }
        if ($a0 === 'yonetim') {
            return $set(implode('/', $a));
        }
        if ($n === 1) {
            // hash rotasının tek parça hali (/server-sv3-yang, /ilan-l7): ön yüz adresi çözemediğinde düşer → 301 ile yenisine
            if (preg_match('/^server-(sv)?([1-9][0-9]{0,17})(?:-([a-z]+))?$/', $a0, $m)) {
                $s = self::srvBy($db, 'id', (int)$m[2]);
                $c = isset($m[3]) ? self::catFromSlug($m[3]) : '';
                return $s && $c !== null ? $set('server-' . Ids::sv($s['id']) . ($c !== '' ? '-' . $c : ''), $s) : $set('yok');
            }
            if (preg_match('/^ilan-(l?[1-9][0-9]{0,17})$/', $a0, $m)) {
                list($r, $ls, $l) = self::lstBy($db, $m[1]);
                return $set($r, $ls, $l);
            }
        }
        return $set(implode('-', $a));
    }

    private static function catLabel($cat, $sec)
    {
        if ($cat === 'yang') {
            return $sec === 'tr' ? 'Won' : 'Yang';
        }
        if ($cat === 'ep') {
            return $sec === 'tr' ? 'Metin2 EP' : 'EP / Coin';
        }
        $L = ['item' => 'Item', 'karakter' => 'Karakter', 'skin' => 'CS2 Skin', 'hesap' => 'Hesap', 'epin' => 'E-pin', 'hepsi' => 'Tüm ilanlar'];
        return isset($L[$cat]) ? $L[$cat] : ucfirst((string)$cat);
    }

    private static function tlText($kurus)
    {
        $tl = ((int)$kurus) / 100;
        $s = number_format($tl, (int)$kurus % 100 === 0 ? 0 : 2, ',', '.');
        return $s . ' ₺';
    }

    /** Server başına kategori bazında aktif ilan sayıları */
    private static function srvCounts(Db $db, $sid)
    {
        $n = ['all' => 0];
        foreach ($db->all("SELECT cat, COUNT(*) AS n FROM {listings} WHERE server_id=? AND status='aktif' AND stock>0 GROUP BY cat", [(int)$sid]) as $x) {
            $n[$x['cat']] = (int)$x['n'];
            $n['all'] += (int)$x['n'];
        }
        return $n;
    }

    /** Server açıklaması (ön yüzdeki srvAuto) */
    public static function srvAuto(Db $db, array $s, $siteName)
    {
        $n = (int)$db->val("SELECT COUNT(*) FROM {listings} WHERE server_id=? AND status='aktif' AND stock>0", [(int)$s['id']]);
        $ep = $s['sec'] === 'pvp' && (int)$s['ep_on'];
        return $s['name'] . ', ' . ($s['sec'] === 'tr' ? 'Metin2 TR' : 'Metin2 PVP') . ' bölümündeki serverlardan biridir. ' . $siteName . ' üzerinde '
            . $s['name'] . ' item, yang' . ($ep ? ', EP' : '') . ' ve karakter ilanlarını inceleyebilir, kendi ilanınızı verebilirsiniz'
            . ($n ? '; şu an ' . $n . ' aktif ilan var' : '') . '. Ödemeniz, ürünü teslim aldığınızı onaylayana kadar güvenli havuzda bekler.';
    }

    /** Server sayfası başlığı (ön yüzdeki seoData ile aynı) */
    private static function srvTitle(array $s, $c)
    {
        $ep = $s['sec'] === 'pvp' && (int)$s['ep_on'];
        if ($c === 'ep') {
            return $s['name'] . ' EP Satın Al · Anında Kod';
        }
        if ($c === 'hepsi') {
            return $s['name'] . ' Tüm İlanlar';
        }
        if ($c !== '') {
            return $s['name'] . ' ' . self::catLabel($c, $s['sec']) . ' İlanları';
        }
        return $s['name'] . ' ' . ($s['sec'] === 'tr' ? 'Won' : 'Yang') . ', Item' . ($ep ? ', EP' : '') . ' ve Karakter İlanları';
    }

    /**
     * Sayfa için meta bilgileri. Dönüş: title, desc, canonical, robots, type, img, ld (dizi), status (200|404), route, html,
     * redirect (site köküne göre 301 hedefi ya da null), mode, h1, crumbs, srv, lst, cat (body() için)
     */
    public static function head(Db $db, $uri, $mode = null)
    {
        list($site, $SE, $nm) = self::settings($db);
        $base = self::base($site);
        $mode = $mode ?: self::mode($SE);
        $x = self::resolve($db, $uri);
        $r = $x['r'];
        $s = $x['s'];
        $l = $x['l'];
        $P = self::pages($nm);
        $t = '';
        $d = '';
        $type = 'website';
        $canon = $r;
        $priv = (bool)preg_match(self::PRIV_RX, $r);
        $noidx = $priv || !empty($SE['noindex']);
        $img = (string)$SE['ogImg'];
        $ld = [];
        $cr = [];
        $status = (bool)preg_match(self::KNOWN_RX, $r) ? 200 : 404;
        $canonPath = null;
        $cat = '';
        $cnt = null;
        $u = function ($path) use ($base, $mode) {
            return $base . self::href($path, $mode);
        };
        if ($r === 'serverler' || $r === 'kategori-metin2') {
            $canon = 'metin2-pvp';
        } elseif (strpos($r, 'kategori-') === 0) {
            $noidx = true;
        }
        if ($r === 'home') {
            $t = $SE['homeTitle'] !== '' ? $SE['homeTitle'] : $nm . ' · Metin2 Item, Yang, Won, EP ve Karakter Pazarı';
            $d = $SE['desc'];
            $q = self::href('/ara', $mode);
            $ld[] = ['@type' => 'WebSite', '@id' => $base . '/#website', 'url' => $base . '/', 'name' => $nm, 'inLanguage' => 'tr-TR', 'publisher' => ['@id' => $base . '/#org'],
                'potentialAction' => ['@type' => 'SearchAction', 'target' => ['@type' => 'EntryPoint', 'urlTemplate' => $base . $q . (strpos($q, '?') === false ? '?' : '&') . 'q={search_term_string}'],
                    'query-input' => 'required name=search_term_string']];
            $ld[] = ['@type' => 'Organization', '@id' => $base . '/#org', 'name' => $nm, 'url' => $base . '/', 'logo' => $base . '/rozet.svg'];
        } elseif (isset($P[$canon])) {
            list($t, $d) = $P[$canon];
            $cr[] = [$t, '/' . $canon];
            if (in_array($canon, self::SOON, true) || $canon === 'rehber') {
                $noidx = true; // canlıda "Yakında" ya da (rehber yazıları sunucuda değil) boş sayfa
            }
        }
        if (preg_match('/^server-([^-]+)(?:-(.+))?$/', $r, $m)) {
            $c = isset($m[2]) ? (string)$m[2] : '';
            if ($s && ($c === '' || in_array($c, array_merge(Catalog::M2_CATS, ['hepsi']), true)) && ($c !== 'ep' || ($s['sec'] === 'pvp' && (int)$s['ep_on']))) {
                $cat = $c;
                $cnt = self::srvCounts($db, $s['id']);
                $about = (string)$s['seo'] !== '' ? (string)$s['seo'] : self::srvAuto($db, $s, $nm);
                $cl = $c === 'ep' ? 'EP' : ($c ? self::catLabel($c, $s['sec']) : '');
                $t = self::srvTitle($s, $c);
                $d = Text::cut($c === 'ep' ? $s['name'] . ' EP kodları ' . $nm . ' tarafından satılır; ödeme sonrası kod anında teslim edilir. ' . $about
                    : ($c && $c !== 'hepsi' ? $s['name'] . ' ' . mb_strtolower($cl, 'UTF-8') . ' ilanları. ' . $about : $about), 158);
                $cr[] = [$s['sec'] === 'tr' ? 'Metin2 TR' : 'Metin2 PVP', '/' . self::secPath($s['sec'])];
                $cr[] = [$s['name'], self::srvPath($s)];
                if ($c) {
                    $cr[] = [$cl, self::path('server-x-' . $c, $s)];
                }
                $canonPath = self::path('server-x' . ($c !== '' ? '-' . $c : ''), $s);
                // EP (yakında), "tüm ilanlar" (kategori sayfalarının toplamı) ve ilanı olmayan kategori: dizine eklenmez
                if ($c === 'ep' || $c === 'hepsi' || ($c !== '' && empty($cnt[$c]))) {
                    $noidx = true;
                }
                $status = 200;
            } else {
                $noidx = true;
                $status = 404;
            }
        }
        if (strpos($r, 'ilan-') === 0 && $r !== 'ilan-ver') {
            $status = $l ? 200 : 404; // bekleyen/kaldırılan ilan sahibine görünür; dizine eklenmez
            if ($l && in_array($l['status'], ['aktif', 'satildi'], true)) {
                $sname = $s ? $s['name'] : '';
                $sec = $s ? $s['sec'] : ($l['sec'] ?: 'pvp');
                $t = $l['title'] . ($s && mb_stripos($l['title'], $sname, 0, 'UTF-8') === false ? ' · ' . $sname : '');
                $d = Text::cut(self::tlText($l['price']) . ' · ' . ($s ? $sname . ' ' : '') . self::catLabel($l['cat'], $sec) . '. ' . (string)$l['descr'], 158);
                $type = 'product';
                $canonPath = self::lstPath($l, $s);
                if ($s) {
                    $cr[] = [$s['sec'] === 'tr' ? 'Metin2 TR' : 'Metin2 PVP', '/' . self::secPath($s['sec'])];
                    $cr[] = [$s['name'], self::srvPath($s)];
                    if (strpos($canonPath, '/ilan/') !== 0) {
                        $cr[] = [self::catLabel($l['cat'], $s['sec']), self::srvPath($s) . '/' . self::catSlug($l['cat'], $s['sec'])];
                    }
                }
                $cr[] = [Text::cut($l['title'], 40), $canonPath];
                $m1 = $db->one('SELECT m.* FROM {listing_media} lm JOIN {media} m ON m.id=lm.media_id WHERE lm.listing_id=? ORDER BY lm.pos LIMIT 1', [(int)$l['id']]);
                if ($m1 && $m1['vis'] === 'public') {
                    $img = $base . '/' . $m1['path'];
                }
                $seller = $db->one('SELECT name FROM {users} WHERE id=?', [(int)$l['seller_id']]);
                $prod = ['@type' => 'Product', 'name' => $l['title'], 'description' => Text::cut((string)$l['descr'] !== '' ? $l['descr'] : $l['title'], 300),
                    'category' => 'Metin2 ' . ($s ? $sname . ' ' : '') . self::catLabel($l['cat'], $sec)];
                if ($l['no'] !== null) {
                    $prod['sku'] = (string)$l['no'];
                }
                if ($img !== '') {
                    $prod['image'] = $img;
                }
                $prod['offers'] = ['@type' => 'Offer', 'price' => (string)Text::tl($l['price']), 'priceCurrency' => 'TRY',
                    'availability' => 'https://schema.org/' . ($l['status'] === 'aktif' && (int)$l['stock'] > 0 ? 'InStock' : 'SoldOut'),
                    'url' => $u($canonPath), 'seller' => ['@type' => 'Person', 'name' => $seller ? $seller['name'] : 'Satıcı']];
                $ld[] = $prod;
            } else {
                $noidx = true;
                if ($l) {
                    $canonPath = self::lstPath($l, $s);
                } else {
                    $t = 'İlan bulunamadı';
                }
            }
        }
        if (strpos($r, 'sayfa-') === 0) {
            $k = substr($r, 6);
            if (isset(self::STATIC_PAGES[$k])) {
                $t = self::STATIC_PAGES[$k];
                $cr[] = [$t, '/sayfa/' . $k];
                $status = 200;
            } else {
                $noidx = true;
                $status = 404;
            }
        }
        // satıcı profili: herkese açık ama ince içerik (ilanlar zaten kendi sayfalarında) → noindex, follow
        if (preg_match('/^uye-u?([1-9][0-9]{0,17})$/', $r, $m)) {
            $usr = $db->one("SELECT id, name FROM {users} WHERE id=?", [(int)$m[1]]);
            if ($usr) {
                $t = $usr['name'] . ' · Satıcı Profili';
                $d = $usr['name'] . ' adlı satıcının ' . $nm . ' üzerindeki aktif Metin2 ilanları.';
                $status = 200;
            } else {
                $status = 404;
            }
            $noidx = true;
        }
        if ($status === 404) {
            $noidx = true;
            $canonPath = null;
        }
        if ($t === '') {
            $t = strpos($r, 'yonetim') === 0 ? 'Yönetim paneli' : ($status === 404 ? 'Sayfa bulunamadı' : $nm);
        }
        if ($d === '') {
            $d = $SE['desc'];
        }
        $crumbs = [];
        if ($cr) {
            $crumbs = array_merge([['Ana Sayfa', '/']], $cr);
            $ld[] = ['@type' => 'BreadcrumbList', 'itemListElement' => array_map(function ($x, $i) use ($u) {
                return ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $x[0], 'item' => $u($x[1])];
            }, $crumbs, array_keys($crumbs))];
        }
        // kanonik yol ve 301: eski biçim, ?p= (temiz kipte), temiz adres (?p= kipinde), sonda /, büyük harf, değişen başlık/server/kategori
        $want = $status === 200 && strpos($r, 'yonetim') !== 0 ? ($canonPath !== null ? $canonPath : self::path($canon)) : null;
        $redir = null;
        if ($want !== null && $x['form'] !== 'root') {
            $asked = $x['asked'];
            if ($mode === 'clean' && ($x['form'] !== 'path' || $asked !== $want)) {
                $redir = $want;
            } elseif ($mode !== 'clean' && ($x['form'] !== 'p' || $asked !== $want)) {
                $redir = self::href($want, 'p');
            }
            if ($redir !== null) {
                $extra = $x['q'];
                unset($extra['p']);
                if ($extra) {
                    $redir .= (strpos($redir, '?') === false ? '?' : '&') . http_build_query($extra, '', '&', PHP_QUERY_RFC3986);
                }
            }
        }
        $title = $r === 'home' ? $t : Text::cut($t, 60) . ($SE['sep'] !== '' ? $SE['sep'] : ' | ') . $nm;
        $url = $u($want !== null ? $want : self::path($canon, $s, $l));
        $out = ['title' => $title, 'desc' => Text::cut($d, 160), 'canonical' => $noidx ? '' : $url, 'url' => $url,
            'robots' => $noidx ? 'noindex, follow' : 'index, follow, max-image-preview:large', 'type' => $type, 'img' => $img, 'ld' => $ld,
            'status' => $status, 'route' => $r, 'site' => $nm, 'verify' => ['gsc' => $SE['gsc'], 'bing' => $SE['bing'], 'yandex' => $SE['yandex']],
            'redirect' => $redir, 'mode' => $mode, 'path' => $want, 'h1' => $t, 'intro' => $d, 'crumbs' => $crumbs, 'srv' => $s, 'lst' => $l, 'cat' => $cat, 'cnt' => $cnt, 'priv' => $priv];
        $out['html'] = self::html($out);
        return $out;
    }

    /**
     * index.php için tek çağrı: bağlantı yoksa kurar, HİÇBİR ZAMAN hata fırlatmaz (sorun olursa null; sayfa statik başlıkla açılır).
     *   $seo = YP\Seo::forRequest();  if ($seo) { echo $seo['html']; if ($seo['status'] === 404) http_response_code(404); }
     * Gerçek bir web isteği temiz adresle (rewrite üzerinden) geldiyse bunu rewrite denetimi olarak kaydeder.
     */
    public static function forRequest($uri = null)
    {
        try {
            if (!Db::hasMain()) {
                if (!Store::installed()) {
                    return null;
                }
                Store::requireKey();
                Db::setMain(Db::connect(Store::dbConfig()));
            }
            $db = Db::main();
            $live = $uri === null && PHP_SAPI !== 'cli';
            $uri = $uri !== null ? $uri : (isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : '/');
            // ErrorDocument ile index.php'ye düşen 404'ler (REDIRECT_STATUS=404) rewrite sayılmaz
            $rs = isset($_SERVER['REDIRECT_STATUS']) ? (string)$_SERVER['REDIRECT_STATUS'] : '';
            if ($live && ($rs === '' || $rs === '200') && self::resolve($db, $uri)['form'] === 'path') {
                self::noteRewrite($db, true, 'istek');
            }
            return self::head($db, $uri);
        } catch (\Throwable $e) {
            Log::write('hata', 'SEO meta: ' . get_class($e) . ': ' . $e->getMessage());
            return null;
        }
    }

    /* ---------------- önceden oluşturulmuş içerik (<main id="app">) ---------------- */

    /**
     * Arama motorları için hafif içerik: H1, kısa giriş, konum çubuğu ve alt sayfa bağlantıları (bölümdeki serverlar,
     * serverın kategorileri, son ilanlar). Uygulama açılınca #app'i kendi görünümüyle değiştirir (aynı içerik; gizleme yok).
     */
    public static function body(Db $db, array $h)
    {
        if (!empty($h['priv']) || strpos((string)$h['route'], 'yonetim') === 0) {
            return '';
        }
        $e = function ($s) {
            return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        };
        $wb = rtrim(Media::webBase(), '/');
        $mode = $h['mode'];
        $a = function ($path, $text, $extra = '') use ($e, $wb, $mode) {
            return '<a href="' . $e($wb . self::href($path, $mode)) . '">' . $e($text) . '</a>' . $extra;
        };
        $srvAll = null;
        $srvs = function () use ($db, &$srvAll) {
            if ($srvAll === null) {
                $srvAll = [];
                foreach ($db->all("SELECT * FROM {servers} WHERE deleted_at IS NULL AND active=1 ORDER BY CASE WHEN sec='tr' THEN 0 ELSE 1 END, sort, id") as $s) {
                    $srvAll[(int)$s['id']] = $s;
                }
            }
            return $srvAll;
        };
        $lstLinks = function ($where, array $args, $lim) use ($db, $a, $srvs) {
            $S = $srvs();
            $out = '';
            foreach ($db->all("SELECT id, title, price, cat, game, server_id FROM {listings} WHERE status='aktif' AND stock>0" . $where . ' ORDER BY bump_at DESC, id DESC LIMIT ' . (int)$lim, $args) as $l) {
                $s = $l['server_id'] && isset($S[(int)$l['server_id']]) ? $S[(int)$l['server_id']] : null;
                $out .= '<li>' . $a(self::lstPath($l, $s), $l['title'], ' · ' . self::tlText($l['price']) . ($s ? ' · ' . htmlspecialchars($s['name'], ENT_QUOTES, 'UTF-8') : '')) . '</li>';
            }
            return $out !== '' ? '<ul class="ssr-l">' . $out . '</ul>' : '';
        };
        $h1 = $h['route'] === 'home' ? $h['h1'] : ($h['cat'] !== '' && $h['srv'] ? $h['srv']['name'] . ' · ' . self::catLabel($h['cat'], $h['srv']['sec']) : $h['h1']);
        $html = '';
        if ($h['crumbs']) {
            $c = $h['crumbs'];
            $last = array_pop($c);
            $html .= '<nav class="crumbs" aria-label="Konum">' . implode(' › ', array_map(function ($x) use ($a) {
                return $a($x[1], $x[0]);
            }, $c)) . ' › <span>' . $e($last[0]) . '</span></nav>';
        }
        $html .= '<h1>' . $e($h1) . '</h1>';
        if ($h['status'] === 404) {
            return '<div class="wrap ssr" data-ssr>' . $html . '<p>Aradığınız sayfa kaldırılmış veya bağlantı hatalı olabilir.</p><p>' . $a('/', 'Ana sayfaya dön') . '</p></div>';
        }
        $html .= '<p>' . $e($h['intro']) . '</p>';
        $r = $h['route'];
        if ($r === 'home' || $r === 'metin2-tr' || $r === 'metin2-pvp' || $r === 'serverler' || $r === 'kategori-metin2') {
            $cnt = [];
            foreach ($db->all("SELECT server_id, COUNT(*) AS n FROM {listings} WHERE status='aktif' AND stock>0 AND server_id IS NOT NULL GROUP BY server_id") as $x) {
                $cnt[(int)$x['server_id']] = (int)$x['n'];
            }
            foreach ($r === 'home' ? ['tr', 'pvp'] : [$r === 'metin2-tr' ? 'tr' : 'pvp'] as $sec) {
                $li = '';
                foreach ($srvs() as $s) {
                    if ($s['sec'] === $sec) {
                        $li .= '<li>' . $a(self::srvPath($s), $s['name'], ' (' . (isset($cnt[(int)$s['id']]) ? $cnt[(int)$s['id']] : 0) . ' ilan)') . '</li>';
                    }
                }
                $title = $sec === 'tr' ? 'Metin2 TR' : 'Metin2 PVP';
                $html .= '<h2>' . ($r === 'home' ? $a('/' . self::secPath($sec), $title . ' serverları') : $e($title . ' serverları')) . '</h2>' . ($li !== '' ? '<ul class="ssr-l">' . $li . '</ul>' : '');
            }
            if ($r === 'home' && ($ls = $lstLinks('', [], 12)) !== '') {
                $html .= '<h2>Son eklenen ilanlar</h2>' . $ls;
            }
        } elseif ($h['srv'] && strpos($r, 'server-') === 0) {
            $s = $h['srv'];
            $n = is_array($h['cnt']) ? $h['cnt'] : ['all' => 0];
            $cats = ['yang', 'item', 'karakter'];
            $li = '<li>' . $a(self::srvPath($s) . '/hepsi', 'Tüm ilanlar', ' (' . (int)$n['all'] . ')') . '</li>';
            foreach ($cats as $c) {
                $li .= '<li>' . $a(self::srvPath($s) . '/' . self::catSlug($c, $s['sec']), $s['name'] . ' ' . self::catLabel($c, $s['sec']), ' (' . (isset($n[$c]) ? (int)$n[$c] : 0) . ')') . '</li>';
            }
            if ($s['sec'] === 'pvp' && (int)$s['ep_on']) {
                $li .= '<li>' . $a(self::srvPath($s) . '/ep', $s['name'] . ' EP') . '</li>';
            }
            $html .= '<h2>' . $e($s['name']) . ' kategorileri</h2><ul class="ssr-l">' . $li . '</ul>';
            $c = $h['cat'];
            if ($c === '' || $c === 'hepsi') {
                $ls = $lstLinks(' AND server_id=?', [(int)$s['id']], $c === '' ? 12 : 48);
            } elseif ($c !== 'ep') {
                $ls = $lstLinks(' AND server_id=? AND cat=?', [(int)$s['id'], $c], 48);
            } else {
                $ls = '';
            }
            if ($ls !== '') {
                $html .= '<h2>' . ($c === '' ? 'Son eklenen ilanlar' : $e($h1) . ' ilanları') . '</h2>' . $ls;
            }
        } elseif ($h['lst'] && strpos($r, 'ilan-') === 0 && $h['canonical'] !== '') {
            $l = $h['lst'];
            $seller = $db->one('SELECT name FROM {users} WHERE id=?', [(int)$l['seller_id']]);
            $html .= '<p><b>' . $e(self::tlText($l['price'])) . '</b> · Stok: ' . (int)$l['stock'] . ($l['del_txt'] !== '' ? ' · Teslimat: ' . $e($l['del_txt']) : '')
                . ($seller ? ' · Satıcı: ' . $e($seller['name']) : '') . ($l['no'] !== null ? ' · İlan #' . (int)$l['no'] : '') . '</p>';
            if ((string)$l['descr'] !== '') {
                $html .= '<p>' . nl2br($e(Text::cut($l['descr'], 1200))) . '</p>';
            }
            if ($h['srv'] && ($ls = $lstLinks(' AND server_id=? AND cat=? AND id<>?', [(int)$h['srv']['id'], $l['cat'], (int)$l['id']], 8)) !== '') {
                $html .= '<h2>Benzer ilanlar</h2>' . $ls;
            }
        }
        return '<div class="wrap ssr" data-ssr>' . $html . '</div>';
    }

    /** <head> etiketleri (HTML kaçışlı; JSON-LD içinde </script> kırılamaz) */
    public static function html(array $x)
    {
        $e = function ($s) {
            return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        };
        $h = '<title>' . $e($x['title']) . "</title>\n";
        $h .= '<meta name="description" content="' . $e($x['desc']) . "\">\n";
        $h .= '<meta name="robots" content="' . $e($x['robots']) . "\">\n";
        if ($x['canonical'] !== '') {
            $h .= '<link rel="canonical" href="' . $e($x['canonical']) . "\">\n";
        }
        $og = ['og:site_name' => $x['site'], 'og:locale' => 'tr_TR', 'og:type' => in_array($x['type'], ['product', 'article'], true) ? $x['type'] : 'website',
            'og:title' => $x['title'], 'og:description' => $x['desc'], 'og:url' => $x['url']];
        if ($x['img'] !== '') {
            $og['og:image'] = $x['img'];
        }
        foreach ($og as $k => $v) {
            $h .= '<meta property="' . $k . '" content="' . $e($v) . "\">\n";
        }
        $h .= '<meta name="twitter:card" content="' . ($x['img'] !== '' ? 'summary_large_image' : 'summary') . "\">\n";
        $h .= '<meta name="twitter:title" content="' . $e($x['title']) . "\">\n";
        $h .= '<meta name="twitter:description" content="' . $e($x['desc']) . "\">\n";
        foreach (['gsc' => 'google-site-verification', 'bing' => 'msvalidate.01', 'yandex' => 'yandex-verification'] as $k => $n) {
            if (!empty($x['verify'][$k])) {
                $h .= '<meta name="' . $n . '" content="' . $e($x['verify'][$k]) . "\">\n";
            }
        }
        if ($x['ld']) {
            $j = json_encode(['@context' => 'https://schema.org', '@graph' => $x['ld']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
            $h .= '<script type="application/ld+json" id="ldjson">' . $j . "</script>\n";
        }
        return $h;
    }

    /* ---------------- sitemap / robots ---------------- */

    /**
     * Site haritası: ana sayfa, bölümler, dizine açık sayfalar, serverlar, ilanı olan server/kategori sayfaları, aktif ilanlar.
     * Adresler geçerli kipte (temiz ya da ?p=). Özel, "Yakında" ve boş sayfalar yok.
     */
    public static function sitemapUrls(Db $db, $max = 45000)
    {
        list($site, $SE, ) = self::settings($db);
        $base = self::base($site);
        $mode = self::mode($SE);
        $iso = function ($ms) {
            return gmdate('Y-m-d', (int)floor($ms / 1000));
        };
        $day = $iso(yp_now_ms());
        $U = [];
        $add = function ($path, $lm, $pr, $cf) use (&$U, $base, $mode) {
            $U[] = ['loc' => $base . self::href($path, $mode), 'lm' => $lm, 'pr' => $pr, 'cf' => $cf];
        };
        $agg = [];
        foreach ($db->all("SELECT server_id, cat, MAX(bump_at) AS lm FROM {listings} WHERE status='aktif' AND stock>0 AND server_id IS NOT NULL GROUP BY server_id, cat") as $x) {
            $agg[(int)$x['server_id']][$x['cat']] = (int)$x['lm'];
        }
        $srvs = $db->all("SELECT * FROM {servers} WHERE deleted_at IS NULL AND active=1 ORDER BY CASE WHEN sec='tr' THEN 0 ELSE 1 END, sort, id");
        $secLm = [];
        foreach ($srvs as $s) {
            if (!empty($agg[(int)$s['id']])) {
                $secLm[$s['sec']] = max(isset($secLm[$s['sec']]) ? $secLm[$s['sec']] : 0, max($agg[(int)$s['id']]));
            }
        }
        $add('/', $secLm ? $iso(max($secLm)) : $day, '1.0', 'hourly');
        foreach (self::SECS as $sec => $p) {
            $add('/' . $p, isset($secLm[$sec]) ? $iso($secLm[$sec]) : $day, '0.9', 'daily');
        }
        foreach (array_keys(self::pages('')) as $r) {
            if (!in_array($r, self::SECS, true) && !in_array($r, self::SOON, true) && $r !== 'rehber') {
                $add('/' . $r, $day, '0.5', 'monthly');
            }
        }
        foreach (array_keys(self::STATIC_PAGES) as $k) {
            $add('/sayfa/' . $k, $day, '0.3', 'yearly');
        }
        $byId = [];
        foreach ($srvs as $s) {
            $byId[(int)$s['id']] = $s;
            $L = isset($agg[(int)$s['id']]) ? $agg[(int)$s['id']] : [];
            $add(self::srvPath($s), $L ? $iso(max($L)) : $day, '0.8', 'daily');
            foreach (['yang', 'item', 'karakter'] as $c) {
                if (isset($L[$c])) {
                    $add(self::srvPath($s) . '/' . self::catSlug($c, $s['sec']), $iso($L[$c]), '0.7', 'hourly');
                }
            }
        }
        $rows = $db->all("SELECT id, title, cat, game, server_id, bump_at, updated_at FROM {listings} WHERE status='aktif' AND stock>0 ORDER BY bump_at DESC, id DESC LIMIT " . (int)max(0, $max - count($U)));
        foreach ($rows as $l) {
            $s = $l['server_id'] && isset($byId[(int)$l['server_id']]) ? $byId[(int)$l['server_id']] : null;
            $add(self::lstPath($l, $s), $iso(max((int)$l['bump_at'], (int)$l['updated_at'])), '0.6', 'daily');
        }
        return $U;
    }

    public static function sitemapXml(Db $db)
    {
        $x = function ($s) {
            return htmlspecialchars((string)$s, ENT_QUOTES | ENT_XML1, 'UTF-8');
        };
        $out = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
        foreach (self::sitemapUrls($db) as $u) {
            $out .= '  <url><loc>' . $x($u['loc']) . '</loc><lastmod>' . $u['lm'] . '</lastmod><changefreq>' . $u['cf'] . '</changefreq><priority>' . $u['pr'] . "</priority></url>\n";
        }
        return $out . "</urlset>\n";
    }

    public static function robotsTxt(Db $db)
    {
        list($site, $SE, ) = self::settings($db);
        $base = self::base($site);
        $out = self::MARK . " (yönetim panelinden düzenlenir; bu satırı silerseniz dosyaya artık dokunulmaz)\nUser-agent: *\n";
        if (!empty($SE['noindex'])) {
            $out .= "Disallow: /\n";
        } else {
            // özel sayfalar hem temiz (/hesabim) hem ?p= (/?p=hesabim) biçimiyle kapalı
            $out .= "Allow: /\n";
            foreach (['hesabim', 'yonetim', 'mesajlar', 'bildirimler', 'siparis-', 'ilan-ver', 'ara$', 'davet-', 'widget-'] as $k) {
                $out .= 'Disallow: /' . $k . "\nDisallow: /*?p=" . $k . "\n";
            }
            $out .= "Disallow: /*yp_probe=\nDisallow: /api/\nDisallow: /kurulum/\nAllow: /uploads/\n";
        }
        return $out . "\nSitemap: " . $base . "/sitemap.xml\n";
    }

    /** Son değişiklik zamanı (ilan ya da server) — cron yalnız değişince yeniden yazar */
    public static function changedAt(Db $db)
    {
        return max((int)$db->val('SELECT MAX(updated_at) FROM {listings}'), (int)$db->val('SELECT MAX(updated_at) FROM {servers}'));
    }

    /**
     * sitemap.xml ve robots.txt dosyalarını site köküne yazar. robots.txt sahibi tarafından elle yazılmışsa (işaret satırı yoksa) dokunulmaz.
     * Dönüş: ['sitemap' => bool, 'robots' => bool|'elle', 'urls' => n]
     */
    public static function writeFiles(Db $db, $dir = null)
    {
        $dir = $dir ?: Media::publicRoot();
        $xml = self::sitemapXml($db);
        $res = ['sitemap' => false, 'robots' => false, 'urls' => substr_count($xml, '<url>')];
        $put = function ($f, $c) {
            $tmp = $f . '.tmp-' . bin2hex(random_bytes(4));
            if (@file_put_contents($tmp, $c) === false) {
                return false;
            }
            @chmod($tmp, 0644);
            if (!@rename($tmp, $f)) {
                @unlink($tmp);
                return false;
            }
            return true;
        };
        $res['sitemap'] = $put($dir . '/sitemap.xml', $xml);
        $rf = $dir . '/robots.txt';
        $cur = @file_get_contents($rf);
        if ($cur !== false && strpos($cur, self::MARK) === false) {
            $res['robots'] = 'elle';
        } else {
            $txt = self::robotsTxt($db);
            $res['robots'] = $cur === $txt ? true : $put($rf, $txt);
        }
        if (!$res['sitemap']) {
            Log::write('hata', 'sitemap.xml site köküne yazılamadı (klasör yazılabilir değil); api/v1/index.php?r=seo/sitemap.xml kullanılabilir.');
        }
        return $res;
    }
}
