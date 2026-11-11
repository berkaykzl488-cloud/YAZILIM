<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Sunucu tarafı SEO (PLAN §4 P1): index.php'nin <head>'e yazacağı <title>/meta/canonical/JSON-LD, sitemap.xml, robots.txt.
 * Ön yüzdeki seoData()/routeToPath()/pathToRoute()/sitemapUrls()/robotsTxt() (src/js/90-seo.js) ile aynı adresler ve metinler.
 *
 * index.php kullanımı:
 *   $seo = YP\Seo::head($db, $_SERVER['REQUEST_URI']);   // ['title','desc','canonical','robots','status','route','html']
 *   echo $seo['html'];                                    // <head> içinde, statik <title>/<meta description> yerine
 *   if ($seo['status'] === 404) http_response_code(404);
 * Temiz adresler: /server/<slug>[/<kategori>], /ilan/<başlık-slug>-l<id>, /rehber/<slug>, /sayfa/<slug>, /<rota>.
 * Yönlendirme (rewrite) çalışmayan sunucular için aynı yol ?p=<yol> ile de verilebilir: /index.php?p=ilan/ejder-l12
 *
 * sitemap.xml ve robots.txt site köküne GERÇEK DOSYA olarak yazılır (cron, katalog değiştikçe; rewrite gerekmez).
 * Yazılamazsa api/v1/index.php?r=seo/sitemap.xml ve ?r=seo/robots.txt aynı içeriği verir.
 */
final class Seo
{
    const MARK = '# yangpazar: otomatik üretildi';

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

    public static function settings(Db $db)
    {
        $site = Settings::get('site', $db);
        $seo = Settings::get('seo', $db);
        $seo = array_replace(['homeTitle' => '', 'desc' => 'Metin2 item, yang, won, EP ve karakter alım satımı. Ödemeniz teslim onaylanana kadar güvenli havuzda bekler.',
            'sep' => ' | ', 'ogImg' => '', 'gsc' => '', 'bing' => '', 'yandex' => '', 'noindex' => false], is_array($seo) ? $seo : []);
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

    /** Rota → temiz adres (ön yüzdeki routeToPath; $srv/$lst önceden yüklenmiş satırlar) */
    public static function path($route, ?array $srv = null, ?array $lst = null)
    {
        if ($route === '' || $route === 'home') {
            return '/';
        }
        if (preg_match('/^server-([^-]+)(?:-(.+))?$/', $route, $m) && $srv) {
            return '/server/' . $srv['slug'] . (isset($m[2]) ? '/' . $m[2] : '');
        }
        if (strpos($route, 'ilan-') === 0 && $route !== 'ilan-ver' && $lst) {
            return '/ilan/' . Text::slug($lst['title']) . '-' . Ids::l($lst['id']);
        }
        if (strpos($route, 'rehber-') === 0) {
            return '/rehber/' . substr($route, 7);
        }
        if (strpos($route, 'sayfa-') === 0) {
            return '/sayfa/' . substr($route, 6);
        }
        return '/' . $route;
    }

    /** Adres → [rota, server satırı|null, ilan satırı|null] (ön yüzdeki pathToRoute) */
    public static function resolve(Db $db, $uri)
    {
        $path = (string)parse_url((string)$uri, PHP_URL_PATH);
        $qs = (string)parse_url((string)$uri, PHP_URL_QUERY);
        parse_str($qs, $q);
        if (isset($q['p']) && is_string($q['p'])) {
            $path = $q['p'];
        }
        $p = rawurldecode($path);
        // site bir alt klasörde kuruluysa (/test/…) baştaki kök yolu at
        $wb = rtrim(Media::webBase(), '/');
        if ($wb !== '' && strpos($p, $wb . '/') === 0) {
            $p = substr($p, strlen($wb));
        }
        $p = preg_replace('#/index\.(php|html)$#', '', trim($p, '/'));
        $p = trim((string)$p, '/');
        if ($p === '' || $p === 'index.php' || $p === 'index.html') {
            return ['home', null, null];
        }
        $a = explode('/', $p);
        if ($a[0] === 'server' && isset($a[1])) {
            $s = $db->one('SELECT * FROM {servers} WHERE slug=? AND deleted_at IS NULL AND active=1', [$a[1]]);
            return [$s ? 'server-' . Ids::sv($s['id']) . (isset($a[2]) && $a[2] !== '' ? '-' . $a[2] : '') : 'yok', $s, null];
        }
        if ($a[0] === 'ilan' && isset($a[1])) {
            $id = substr($a[1], strrpos($a[1], '-') === false ? 0 : strrpos($a[1], '-') + 1);
            $l = null;
            if (preg_match('/^l?([1-9][0-9]{0,17})$/', $id, $m)) {
                $l = $db->one('SELECT * FROM {listings} WHERE id=?', [(int)$m[1]]);
            }
            $s = $l && $l['server_id'] ? $db->one('SELECT * FROM {servers} WHERE id=?', [(int)$l['server_id']]) : null;
            return ['ilan-' . $id, $s, $l];
        }
        if (in_array($a[0], ['rehber', 'sayfa'], true) && isset($a[1])) {
            return [$a[0] . '-' . $a[1], null, null];
        }
        if ($a[0] === 'yonetim') {
            return [implode('/', $a), null, null];
        }
        return [implode('-', $a), null, null];
    }

    private static function catLabel($cat, $sec)
    {
        if ($cat === 'yang') {
            return $sec === 'tr' ? 'Won' : 'Yang';
        }
        if ($cat === 'ep') {
            return $sec === 'tr' ? 'Metin2 EP' : 'EP / Coin';
        }
        $L = ['item' => 'Item', 'karakter' => 'Karakter', 'skin' => 'CS2 Skin', 'hesap' => 'Hesap', 'epin' => 'E-pin'];
        return isset($L[$cat]) ? $L[$cat] : ucfirst((string)$cat);
    }

    private static function tlText($kurus)
    {
        $tl = ((int)$kurus) / 100;
        $s = number_format($tl, (int)$kurus % 100 === 0 ? 0 : 2, ',', '.');
        return $s . ' ₺';
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

    /**
     * Sayfa için meta bilgileri. Dönüş: title, desc, canonical, robots, type, img, ld (dizi), status (200|404), route, html
     */
    public static function head(Db $db, $uri)
    {
        list($site, $SE, $nm) = self::settings($db);
        $base = self::base($site);
        list($r, $s, $l) = self::resolve($db, $uri);
        $P = self::pages($nm);
        $t = '';
        $d = '';
        $type = 'website';
        $canon = $r;
        $priv = (bool)preg_match('/^(hesabim|yonetim|mesajlar|bildirimler|siparis-|ilan-ver$|ara$|davet-|widget-)/', $r);
        $noidx = $priv || !empty($SE['noindex']);
        $img = (string)$SE['ogImg'];
        $ld = [];
        $cr = [];
        $status = 200;
        $canonPath = null;
        if ($r === 'serverler' || $r === 'kategori-metin2') {
            $canon = 'metin2-pvp';
        }
        if ($r === 'home') {
            $t = $SE['homeTitle'] !== '' ? $SE['homeTitle'] : $nm . ' · Metin2 Item, Yang, Won, EP ve Karakter Pazarı';
            $d = $SE['desc'];
            $ld[] = ['@type' => 'WebSite', '@id' => $base . '/#website', 'url' => $base . '/', 'name' => $nm, 'inLanguage' => 'tr-TR'];
            $ld[] = ['@type' => 'Organization', '@id' => $base . '/#org', 'name' => $nm, 'url' => $base . '/', 'logo' => $base . '/rozet.svg'];
        } elseif (isset($P[$canon])) {
            list($t, $d) = $P[$canon];
            $cr[] = [$t, '/' . $canon];
        }
        if (preg_match('/^server-([^-]+)(?:-(.+))?$/', $r, $m)) {
            if ($s) {
                $c = isset($m[2]) && $m[2] !== 'hepsi' ? $m[2] : '';
                if ($c !== '' && !in_array($c, Catalog::M2_CATS, true)) {
                    $c = '';
                }
                $cl = $c === 'ep' ? 'EP' : ($c ? self::catLabel($c, $s['sec']) : '');
                $ep = $s['sec'] === 'pvp' && (int)$s['ep_on'];
                $about = (string)$s['seo'] !== '' ? (string)$s['seo'] : self::srvAuto($db, $s, $nm);
                $t = $c === 'ep' ? $s['name'] . ' EP Satın Al · Anında Kod' : ($c ? $s['name'] . ' ' . $cl . ' İlanları' : $s['name'] . ' Item, Yang' . ($ep ? ', EP' : '') . ' ve Karakter İlanları');
                $d = Text::cut($c === 'ep' ? $s['name'] . ' EP kodları ' . $nm . ' tarafından satılır; ödeme sonrası kod anında teslim edilir. ' . $about
                    : ($c ? $s['name'] . ' ' . mb_strtolower($cl, 'UTF-8') . ' ilanları. ' . $about : $about), 158);
                $cr[] = [$s['sec'] === 'tr' ? 'Metin2 TR' : 'Metin2 PVP', $s['sec'] === 'tr' ? '/metin2-tr' : '/metin2-pvp'];
                $cr[] = [$s['name'], self::path('server-x', $s)];
                if ($c) {
                    $cr[] = [$cl, self::path('server-x-' . $c, $s)];
                }
                $canonPath = self::path('server-x' . (isset($m[2]) ? '-' . $m[2] : ''), $s);
                // SSS (ön yüzdeki srvFaq yerine kısa ve sabit sorular; sayfadaki details.faq ile örtüşür)
            } else {
                $noidx = true;
                $status = 404;
            }
        }
        if ($r === 'yok') {
            $noidx = true;
            $status = 404;
        }
        if (strpos($r, 'ilan-') === 0 && $r !== 'ilan-ver') {
            if ($l && in_array($l['status'], ['aktif', 'satildi'], true)) {
                $sname = $s ? $s['name'] : '';
                $t = $l['title'] . ($s && mb_stripos($l['title'], $sname, 0, 'UTF-8') === false ? ' · ' . $sname : '');
                $d = Text::cut(self::tlText($l['price']) . ' · ' . ($s ? $sname . ' ' : '') . self::catLabel($l['cat'], $s ? $s['sec'] : ($l['sec'] ?: 'pvp')) . '. ' . (string)$l['descr'], 158);
                $type = 'product';
                if ($s) {
                    $cr[] = [$s['sec'] === 'tr' ? 'Metin2 TR' : 'Metin2 PVP', $s['sec'] === 'tr' ? '/metin2-tr' : '/metin2-pvp'];
                    $cr[] = [$s['name'], self::path('server-x', $s)];
                }
                $canonPath = self::path('ilan-x', null, $l);
                $cr[] = [Text::cut($l['title'], 40), $canonPath];
                $m1 = $db->one('SELECT m.* FROM {listing_media} lm JOIN {media} m ON m.id=lm.media_id WHERE lm.listing_id=? ORDER BY lm.pos LIMIT 1', [(int)$l['id']]);
                if ($m1 && $m1['vis'] === 'public') {
                    $img = $base . '/' . $m1['path'];
                }
                $seller = $db->one('SELECT name FROM {users} WHERE id=?', [(int)$l['seller_id']]);
                $prod = ['@type' => 'Product', 'name' => $l['title'], 'description' => Text::cut((string)$l['descr'] !== '' ? $l['descr'] : $l['title'], 300),
                    'category' => 'Metin2 ' . ($s ? $sname . ' ' : '') . $l['cat']];
                if ($img !== '') {
                    $prod['image'] = $img;
                }
                $prod['offers'] = ['@type' => 'Offer', 'price' => (string)Text::tl($l['price']), 'priceCurrency' => 'TRY',
                    'availability' => 'https://schema.org/' . ($l['status'] === 'aktif' && (int)$l['stock'] > 0 ? 'InStock' : 'SoldOut'),
                    'url' => $base . $canonPath, 'seller' => ['@type' => 'Person', 'name' => $seller ? $seller['name'] : 'Satıcı']];
                $ld[] = $prod;
            } else {
                $noidx = true;
                $status = $l ? 200 : 404; // bekleyen/kaldırılan ilan sahibine görünür; dizine eklenmez
                if (!$l) {
                    $t = 'İlan bulunamadı';
                }
            }
        }
        if (strpos($r, 'sayfa-') === 0) {
            $k = substr($r, 6);
            if (isset(self::STATIC_PAGES[$k])) {
                $t = self::STATIC_PAGES[$k];
                $cr[] = [$t, '/sayfa/' . $k];
            } else {
                $noidx = true;
                $status = 404;
            }
        }
        if ($t === '') {
            $t = strpos($r, 'yonetim') === 0 ? 'Yönetim paneli' : ($status === 404 ? 'Sayfa bulunamadı' : $nm);
        }
        if ($d === '') {
            $d = $SE['desc'];
        }
        if ($cr) {
            $items = [['Ana sayfa', '/']];
            foreach ($cr as $x) {
                $items[] = $x;
            }
            $ld[] = ['@type' => 'BreadcrumbList', 'itemListElement' => array_map(function ($x, $i) use ($base) {
                return ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $x[0], 'item' => $base . $x[1]];
            }, $items, array_keys($items))];
        }
        $title = $r === 'home' ? $t : Text::cut($t, 60) . ($SE['sep'] !== '' ? $SE['sep'] : ' | ') . $nm;
        $url = $base . ($canonPath !== null ? $canonPath : self::path($canon));
        $out = ['title' => $title, 'desc' => Text::cut($d, 160), 'canonical' => $noidx ? '' : $url, 'url' => $url,
            'robots' => $noidx ? 'noindex, follow' : 'index, follow, max-image-preview:large', 'type' => $type, 'img' => $img, 'ld' => $ld,
            'status' => $status, 'route' => $r, 'site' => $nm, 'verify' => ['gsc' => $SE['gsc'], 'bing' => $SE['bing'], 'yandex' => $SE['yandex']]];
        $out['html'] = self::html($out);
        return $out;
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

    public static function sitemapUrls(Db $db, $max = 45000)
    {
        list($site, , ) = self::settings($db);
        $base = self::base($site);
        $iso = function ($ms) {
            return gmdate('Y-m-d', (int)floor($ms / 1000));
        };
        $day = $iso(yp_now_ms());
        $U = [];
        $add = function ($path, $lm, $pr, $cf) use (&$U, $base) {
            $U[] = ['loc' => $base . $path, 'lm' => $lm, 'pr' => $pr, 'cf' => $cf];
        };
        $add('/', $day, '1.0', 'hourly');
        foreach (['metin2-tr', 'metin2-pvp', 'metin2-ep', 'borsa', 'cekilis', 'reklam-ver', 'guvenli', 'rehber'] as $r) {
            $add('/' . $r, $day, '0.8', 'daily');
        }
        foreach (array_keys(self::STATIC_PAGES) as $k) {
            $add('/sayfa/' . $k, $day, '0.3', 'yearly');
        }
        $agg = [];
        foreach ($db->all("SELECT server_id, cat, MAX(bump_at) AS lm FROM {listings} WHERE status='aktif' AND stock>0 AND server_id IS NOT NULL GROUP BY server_id, cat") as $x) {
            $agg[(int)$x['server_id']][$x['cat']] = (int)$x['lm'];
        }
        $srvs = $db->all("SELECT * FROM {servers} WHERE deleted_at IS NULL AND active=1 ORDER BY CASE WHEN sec='tr' THEN 0 ELSE 1 END, sort, id");
        foreach ($srvs as $s) {
            $L = isset($agg[(int)$s['id']]) ? $agg[(int)$s['id']] : [];
            $lm = $L ? $iso(max($L)) : $day;
            $add('/server/' . $s['slug'], $lm, '0.9', 'hourly');
            foreach (['yang', 'item', 'karakter'] as $c) {
                if (isset($L[$c])) {
                    $add('/server/' . $s['slug'] . '/' . $c, $lm, '0.7', 'hourly');
                }
            }
            if ($s['sec'] === 'pvp' && (int)$s['ep_on']) {
                $add('/server/' . $s['slug'] . '/ep', $day, '0.7', 'daily');
            }
        }
        $rows = $db->all("SELECT id, title, bump_at FROM {listings} WHERE status='aktif' AND stock>0 ORDER BY bump_at DESC, id DESC LIMIT " . (int)max(0, $max - count($U)));
        foreach ($rows as $l) {
            $add('/ilan/' . Text::slug($l['title']) . '-' . Ids::l($l['id']), $iso($l['bump_at']), '0.6', 'daily');
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
            $out .= "Allow: /\nDisallow: /hesabim\nDisallow: /yonetim\nDisallow: /mesajlar\nDisallow: /bildirimler\nDisallow: /siparis-\nDisallow: /ilan-ver\nDisallow: /ara$\n"
                . "Disallow: /widget-\nDisallow: /api/\nDisallow: /kurulum/\nAllow: /uploads/\n";
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
