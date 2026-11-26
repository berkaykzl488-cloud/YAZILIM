<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Media;
use YP\Seo;
use YP\Settings;
use YP\Text;

/**
 * P7 içerik: rehber yazıları, kurumsal/yasal sayfalar (şirket bilgisi yer tutucuları), backlink ve ortaklık başvuruları.
 * Ön yüz şekilleri demodakiyle aynıdır (S.posts, S.backlinks, S.partnerApps): kimlikler p12, bl3, pa4.
 */
final class Content
{
    /** Yasal / kurumsal sayfalar: anahtar => [başlık, tohum dosyası (app/seed/yasal)] */
    const PAGES = [
        'hakkimizda' => ['Hakkımızda', 'hakkimizda.md'],
        'iletisim' => ['İletişim ve Künye', 'iletisim-kunye.md'],
        'kvkk' => ['KVKK Aydınlatma Metni', 'kvkk-aydinlatma.md'],
        'mesafeli' => ['Üyelik ve Aracı Hizmet Sözleşmesi (Mesafeli Satış)', 'uyelik-ve-aracilik-sozlesmesi.md'],
        'iade' => ['İade, İptal ve Cayma Koşulları', 'iade-iptal-cayma.md'],
        'gizlilik' => ['Gizlilik ve Çerez Politikası', 'gizlilik-ve-cerez.md'],
    ];

    /** Şirket bilgisi alanları (settings.company): alan => [etiket, azami uzunluk] */
    const COMPANY = [
        'unvan' => ['Şirket unvanı', 160], 'adres' => ['Adres', 300], 'vd' => ['Vergi dairesi', 80], 'vkn' => ['VKN / TCKN', 11],
        'mersis' => ['MERSİS no', 16], 'sicil' => ['Ticaret sicil no', 40], 'tel' => ['Telefon', 30], 'email' => ['E-posta', 120],
        'kep' => ['KEP adresi', 120], 'oda' => ['Meslek odası', 120], 'verbis' => ['VERBİS kaydı', 120],
        'hosting' => ['Barındırma (hosting) firması', 120], 'msg' => ['Mesaj (SMS / WhatsApp) sağlayıcısı', 120],
    ];
    /** Yer tutucu → şirket alanı */
    const PH = [
        'ŞİRKET UNVANI' => 'unvan', 'ADRES' => 'adres', 'VERGİ DAİRESİ' => 'vd', 'VKN/TCKN' => 'vkn', 'MERSİS NO' => 'mersis',
        'TİCARET SİCİL NO' => 'sicil', 'TELEFON' => 'tel', 'E-POSTA' => 'email', 'KEP ADRESİ' => 'kep', 'ODA ADI' => 'oda',
        'VERBİS' => 'verbis', 'HOSTING FİRMASI' => 'hosting', 'SMS FİRMASI' => 'msg',
    ];
    /** İsteğe bağlı alanlar: boşsa sayfa "eksik" sayılmaz (yoksa "—") */
    const OPTIONAL = ['oda', 'verbis'];
    /** Boş alanın herkese açık sayfadaki nötr metni (asla "[ŞİRKET UNVANI]" görünmez) */
    const NEUTRAL = 'bilgi güncelleniyor';

    const BL_KINDS = ['rozet', 'widget', 'yazi', 'forum', 'yayinci', 'dizin', 'diger'];
    const BL_ST = ['aktif', 'kontrol', 'kayip'];
    const PA_TP = ['server', 'yayinci', 'site'];

    /* ================= şirket bilgisi ================= */

    public static function company(Db $db)
    {
        $c = Settings::get('company', $db);
        $out = ['type' => 'sirket'];
        foreach (array_keys(self::COMPANY) as $k) {
            $out[$k] = '';
        }
        if (is_array($c)) {
            foreach ($c as $k => $v) {
                if (isset($out[$k]) && is_scalar($v)) {
                    $out[$k] = (string)$v;
                }
            }
        }
        $out['type'] = in_array($out['type'], ['sirket', 'sahis'], true) ? $out['type'] : 'sirket';
        return $out;
    }

    /** Zorunlu alanlar: şahıs işletmesinde MERSİS, ticaret sicil ve KEP zorunlu değildir */
    public static function requiredCompany(array $c)
    {
        $r = ['unvan', 'adres', 'vd', 'vkn', 'tel', 'email'];
        if ($c['type'] === 'sirket') {
            $r = array_merge($r, ['mersis', 'sicil', 'kep']);
        }
        return $r;
    }

    public static function missingCompany(array $c)
    {
        return array_values(array_filter(self::requiredCompany($c), function ($k) use ($c) {
            return trim((string)$c[$k]) === '';
        }));
    }

    /* ================= yasal sayfalar ================= */

    /** Tohum metni (app/seed/yasal/*.md). İlk "# Başlık" satırı atılır (sayfanın kendi başlığı var). */
    public static function seedBody($k)
    {
        if (!isset(self::PAGES[$k])) {
            return '';
        }
        $raw = @file_get_contents(YP_APP . '/seed/yasal/' . self::PAGES[$k][1]);
        if ($raw === false) {
            return '';
        }
        $raw = str_replace(["\r\n", "\r"], "\n", $raw);
        $raw = preg_replace('/^#\s+[^\n]*\n+/u', '', ltrim($raw), 1);
        return Markdown::strip($raw);
    }

    /** Eksik sayfaları tohum metniyle oluşturur (göç ve onarım; var olanlara dokunmaz). Dönüş: eklenen anahtarlar */
    public static function seedPages(Db $db)
    {
        $have = array_column($db->all('SELECT k FROM {pages}'), 'k');
        $add = [];
        foreach (self::PAGES as $k => $p) {
            if (in_array($k, $have, true)) {
                continue;
            }
            $db->insert('pages', ['k' => $k, 'title' => $p[0], 'body' => self::seedBody($k), 'updated_at' => yp_now_ms(), 'updated_by' => null]);
            $add[] = $k;
        }
        return $add;
    }

    public static function pageRow(Db $db, $k)
    {
        if (!is_string($k) || !isset(self::PAGES[$k])) {
            return null;
        }
        return $db->one('SELECT * FROM {pages} WHERE k=?', [$k]) ?: null;
    }

    /**
     * Yer tutucuları doldurur ve HTML üretir. $admin: boş alanlar ve avukat notları vurgulu görünür (yalnız yönetim);
     * herkese açık sürümde boş alan nötr metin, iç notlar hiç görünmez.
     * Dönüş: ['html', 'missing' => [alan…], 'notes' => n, 'unknown' => [yer tutucu…]]
     */
    public static function renderPage(Db $db, array $row, $admin = false, $map = null)
    {
        $c = self::company($db);
        $site = Settings::get('site', $db);
        $nm = !empty($site['siteName']) ? (string)$site['siteName'] : 'yangpazar.com';
        $missing = [];
        $unknown = [];
        $notes = 0;
        $date = (int)$row['updated_at'] ? gmdate('d.m.Y', (int)floor(((int)$row['updated_at'] + 10800000) / 1000)) : '';
        $src = preg_replace_callback('/\[([^\[\]\n]{1,200})\](?!\()/u', function ($m) use ($c, $nm, $admin, &$missing, &$unknown, &$notes, $date) {
            $key = trim($m[1]);
            if ($key === 'TARİH') {
                return $date !== '' ? $date : '';
            }
            if (isset(self::PH[$key])) {
                $f = self::PH[$key];
                $v = trim((string)$c[$f]);
                if ($v !== '') {
                    return str_replace(['[', ']'], ['(', ')'], $v);
                }
                if (in_array($f, self::OPTIONAL, true)) {
                    return $admin ? "\u{E022}" . $key . ' (isteğe bağlı, boş)' . "\u{E023}" : '—'; // meslek odası / VERBİS yoksa
                }
                $missing[$f] = true;
                if ($admin) {
                    return "\u{E020}" . $key . "\u{E021}";
                }
                return $f === 'unvan' ? $nm : self::NEUTRAL;
            }
            if (preg_match('/^(AVUKAT|NOT\b|NOT:)/u', $key)) {
                $notes++;
                return $admin ? "\u{E022}" . $key . "\u{E023}" : '';
            }
            if (preg_match('/^[A-ZÇĞİÖŞÜ0-9 \/\-]{1,40}$/u', $key)) {
                $unknown[$key] = true;
                return $admin ? "\u{E020}" . $key . "\u{E021}" : self::NEUTRAL;
            }
            return $m[0];
        }, (string)$row['body']);
        $html = Markdown::html($src, ['map' => $map]);
        $html = preg_replace('/\x{E020}([^\x{E021}]*)\x{E021}/u', '<mark class="ph" title="Şirket bilgisi eksik — Site ayarları › Şirket & yasal sayfalar">[$1]</mark>', $html);
        $html = preg_replace('/\x{E022}([^\x{E023}]*)\x{E023}/u', '<mark class="ph-note" title="Yalnız yönetim görür">[$1]</mark>', $html);
        $html = preg_replace('/<p>\s*<\/p>/', '', $html);
        return ['html' => $html, 'missing' => array_keys($missing), 'notes' => $notes, 'unknown' => array_keys($unknown)];
    }

    public static function presentPage(Db $db, array $row, $admin = false, $map = null)
    {
        $r = self::renderPage($db, $row, $admin, $map);
        $out = ['k' => $row['k'], 'title' => $row['title'], 'html' => $r['html'], 'up' => (int)$row['updated_at']];
        if ($admin) {
            $out['body'] = $row['body'];
            $out['missing'] = $r['missing'];
            $out['notes'] = $r['notes'];
            $out['unknown'] = $r['unknown'];
        }
        return $out;
    }

    /** Tüm sayfalar eksiksiz mi? (yayına alma kontrolü) */
    public static function legalStatus(Db $db)
    {
        $c = self::company($db);
        $miss = self::missingCompany($c);
        $pages = [];
        foreach (self::PAGES as $k => $p) {
            $row = self::pageRow($db, $k);
            if (!$row || trim((string)$row['body']) === '') {
                $pages[$k] = ['ok' => false, 'why' => 'boş'];
                continue;
            }
            $r = self::renderPage($db, $row, true);
            $pages[$k] = ['ok' => !$r['missing'] && !$r['unknown'], 'missing' => $r['missing'], 'unknown' => $r['unknown'], 'notes' => $r['notes']];
        }
        $ok = !$miss && !array_filter($pages, function ($p) {
            return !$p['ok'];
        });
        return ['ok' => $ok, 'missingCompany' => $miss, 'pages' => $pages];
    }

    /* ================= rehber yazıları ================= */

    public static function postBySlug(Db $db, $slug, $drafts = false)
    {
        if (!is_string($slug) || !preg_match('/^[a-z0-9][a-z0-9\-]{0,119}$/', $slug)) {
            return null;
        }
        $p = $db->one('SELECT * FROM {posts} WHERE slug=?', [$slug]);
        if (!$p || (!$drafts && $p['status'] !== 'yayinda')) {
            return null;
        }
        return $p;
    }

    public static function postId($v)
    {
        return Ids::parse($v, 'p');
    }

    public static function coverOf(Db $db, $mid)
    {
        if (!$mid) {
            return null;
        }
        $m = $db->one('SELECT * FROM {media} WHERE id=?', [(int)$mid]);
        return $m && $m['vis'] === 'public' ? Media::present($m) : null;
    }

    /** İç bağlantı (#borsa, #rehber-x) → geçerli kipte site adresi (sunucu tarafı içerik için) */
    public static function linkMap(Db $db)
    {
        list(, $SE, ) = Seo::settings($db);
        $mode = Seo::mode($SE);
        $wb = rtrim(Media::webBase(), '/');
        return function ($h) use ($mode, $wb) {
            $r = substr($h, 1);
            return $wb . Seo::href(Seo::path($r), $mode);
        };
    }

    public static function presentPost(Db $db, array $p, $full = false, $admin = false)
    {
        $out = [
            'id' => 'p' . (int)$p['id'], 'slug' => $p['slug'], 'title' => $p['title'], 'ozet' => (string)$p['excerpt'] !== '' ? $p['excerpt'] : Markdown::text($p['body'], 200),
            'on' => $p['status'] === 'yayinda', 't' => (int)($p['published_at'] ?: $p['created_at']), 'up' => (int)$p['updated_at'],
            'cover' => self::coverOf($db, $p['cover_id']), 'min' => max(1, (int)round(count(preg_split('/\s+/u', trim((string)$p['body']))) / 180)),
        ];
        if ($full || $admin) {
            $out['html'] = Markdown::html($p['body'], ['map' => $admin ? null : self::linkMap($db)]);
        }
        if ($admin) {
            $out['body'] = $p['body'];
            $out['seoTitle'] = (string)$p['seo_title'];
            $out['seoDesc'] = (string)$p['seo_desc'];
            $out['excerpt'] = (string)$p['excerpt'];
        }
        return $out;
    }

    public static function publishedPosts(Db $db, $limit = 50)
    {
        return $db->all("SELECT * FROM {posts} WHERE status='yayinda' ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT " . (int)$limit);
    }

    public static function publishedCount(Db $db)
    {
        return $db->tableExists('posts') ? (int)$db->val("SELECT COUNT(*) FROM {posts} WHERE status='yayinda'") : 0;
    }

    public static function uniqueSlug(Db $db, $want, $exceptId = 0)
    {
        $base = Text::slug($want);
        $base = trim(substr($base, 0, 110), '-');
        if ($base === '') {
            $base = 'yazi';
        }
        $s = $base;
        $i = 2;
        while ($db->val('SELECT id FROM {posts} WHERE slug=? AND id<>?', [$s, (int)$exceptId])) {
            $s = $base . '-' . ($i++);
        }
        return $s;
    }

    /** Yazı formu doğrulaması; dönüş: sütunlar */
    public static function postInput(Db $db, array $in, $u, ?array $cur = null)
    {
        $v = new \YP\V($in);
        $title = $v->str('title', 3, 120, null, 'Başlık 3–120 karakter olmalı.');
        $slugIn = $v->str('slug', 0, 120);
        $ex = $v->str('ozet', 0, 300);
        $st = $v->str('seoTitle', 0, 80);
        $sd = $v->str('seoDesc', 0, 200);
        $raw = isset($in['body']) && is_string($in['body']) ? $in['body'] : '';
        $body = Markdown::strip($raw);
        if (mb_strlen(trim($body), 'UTF-8') < 10) {
            $v->err('body', 'İçerik en az 10 karakter olmalı (HTML etiketleri kabul edilmez; Markdown kullanın).');
        }
        $on = $v->bool('on', $cur ? $cur['status'] === 'yayinda' : false);
        $cover = $cur ? $cur['cover_id'] : null;
        if (array_key_exists('cover', $in)) {
            $cv = $in['cover'];
            if ($cv === null || $cv === '') {
                $cover = null;
            } else {
                $mid = is_scalar($cv) && preg_match('/^m?([1-9][0-9]{0,17})$/', (string)$cv, $mm) ? (int)$mm[1] : 0;
                $m = $mid ? $db->one('SELECT * FROM {media} WHERE id=?', [$mid]) : null;
                if (!$m || $m['vis'] !== 'public' || strpos((string)$m['mime'], 'image/') !== 0) {
                    $v->err('cover', 'Kapak görseli bulunamadı; önce görseli yükleyin.');
                } else {
                    $cover = (int)$m['id'];
                }
            }
        }
        if ($slugIn !== null && $slugIn !== '' && !preg_match('/^[A-Za-z0-9ÇĞİÖŞÜçğıöşü \-]{1,120}$/u', $slugIn)) {
            $v->err('slug', 'Adres yalnız harf, rakam ve tire içerebilir.');
        }
        $v->done();
        $slug = self::uniqueSlug($db, $slugIn !== '' && $slugIn !== null ? $slugIn : $title, $cur ? (int)$cur['id'] : 0);
        $now = yp_now_ms();
        $row = ['slug' => $slug, 'title' => $title, 'excerpt' => (string)$ex, 'body' => $body, 'cover_id' => $cover,
            'seo_title' => (string)$st, 'seo_desc' => (string)$sd, 'status' => $on ? 'yayinda' : 'taslak', 'updated_at' => $now];
        if ($on && (!$cur || !$cur['published_at'])) {
            $row['published_at'] = $now;
        }
        return $row;
    }

    /* ================= SEO (YP\Seo çağırır) ================= */

    /** Site haritası satırları: [yol, son değişiklik ms, öncelik, sıklık] */
    public static function sitemapRows(Db $db)
    {
        $out = [];
        if (!$db->tableExists('posts')) {
            return $out;
        }
        $P = self::publishedPosts($db, 5000);
        if ($P) {
            $out[] = ['/rehber', max(array_map(function ($p) {
                return max((int)$p['updated_at'], (int)$p['published_at']);
            }, $P)), '0.6', 'weekly'];
        }
        foreach ($P as $p) {
            $out[] = ['/rehber/' . $p['slug'], max((int)$p['updated_at'], (int)$p['published_at'], (int)$p['created_at']), '0.6', 'monthly'];
        }
        foreach ($db->all('SELECT k, updated_at FROM {pages} ORDER BY k') as $g) {
            if (isset(self::PAGES[$g['k']])) {
                $out[] = ['/sayfa/' . $g['k'], (int)$g['updated_at'], '0.3', 'yearly'];
            }
        }
        return $out;
    }

    /** index.php'nin önceden oluşturduğu içerik: rehber listesi, yazı, kurumsal sayfa. İlgisiz rota → null */
    public static function ssrBody(Db $db, array $h, callable $a)
    {
        $r = (string)$h['route'];
        $e = function ($s) {
            return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        };
        if ($r === 'rehber') {
            $li = '';
            foreach (self::publishedPosts($db, 100) as $p) {
                $li .= '<li>' . $a('/rehber/' . $p['slug'], $p['title'], ' · ' . $e((string)$p['excerpt'] !== '' ? $p['excerpt'] : Markdown::text($p['body'], 160))) . '</li>';
            }
            return $li !== '' ? '<ul class="ssr-l">' . $li . '</ul>' : '<p>Henüz rehber yazısı yok.</p>';
        }
        if (strpos($r, 'rehber-') === 0 && !empty($h['post'])) {
            $p = $h['post'];
            $x = '<article class="post prose">' . Markdown::html($p['body'], ['map' => self::linkMap($db)]) . '</article>';
            $li = '';
            foreach (self::publishedPosts($db, 6) as $o) {
                if ((int)$o['id'] !== (int)$p['id']) {
                    $li .= '<li>' . $a('/rehber/' . $o['slug'], $o['title']) . '</li>';
                }
            }
            return $x . ($li !== '' ? '<h2>Diğer rehberler</h2><ul class="ssr-l">' . $li . '</ul>' : '');
        }
        if (strpos($r, 'sayfa-') === 0) {
            $row = self::pageRow($db, substr($r, 6));
            return $row ? '<div class="prose">' . self::renderPage($db, $row, false, self::linkMap($db))['html'] . '</div>' : null;
        }
        return null;
    }

    /* ================= backlink / ortaklık ================= */

    public static function presentBacklink(array $b)
    {
        return ['id' => 'bl' . (int)$b['id'], 'url' => $b['url'], 'target' => $b['target'], 'anchor' => $b['anchor'], 'k' => $b['k'],
            'nf' => (bool)(int)$b['nf'], 'st' => $b['st'], 'ck' => $b['ck'] !== null ? (int)$b['ck'] : null, 't' => (int)$b['created_at']];
    }

    public static function presentApp(array $a)
    {
        return ['id' => 'pa' . (int)$a['id'], 'tp' => $a['tp'], 'n' => $a['n'], 's' => $a['s'], 'u' => $a['u'], 'l' => $a['l'], 'c' => $a['c'],
            'x' => $a['x'], 'st' => $a['st'], 't' => (int)$a['created_at'], 'decided' => $a['decided_at'] !== null ? (int)$a['decided_at'] : null];
    }

    /** Hedef sayfa: site içi yol (/…) ya da tam adres */
    public static function target($v)
    {
        $v = trim((string)$v);
        if ($v === '') {
            return '/';
        }
        if (preg_match('#^/[A-Za-z0-9_\-./?=&%]{0,199}$#', $v) || (yp_valid_url($v) && strlen($v) <= 200)) {
            return $v;
        }
        throw HttpError::validation(['target' => 'Hedef sayfa / ile başlayan bir yol ya da https:// adresi olmalı.']);
    }

    public static function ipHash($ip)
    {
        return substr(hash_hmac('sha256', (string)$ip, 'partner|' . bin2hex(substr(\YP\Store::pepper(), 0, 8))), 0, 16);
    }
}
