<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Log;
use YP\Media;
use YP\Seo;
use YP\Settings;
use YP\Store;

/**
 * Gömülebilir yang fiyat widget'ı (ön yüzdeki vWidget'ın sunucu karşılığı): GET /widget/yang/?server=<slug>
 * Başka sitelerin <iframe>'ine girebilen TEK sayfa (frame-ancestors *, X-Frame-Options yok — widget/.htaccess).
 * Hafif, betiksiz HTML; veri yalnız herkese açık ilan sayıları ve başlangıç fiyatlarıdır. 5 dakika önbelleklenebilir.
 */
final class Widget
{
    public static function data(Db $db, $slug = '')
    {
        $slug = is_string($slug) && preg_match('/^[a-z0-9][a-z0-9\-]{0,60}$/', $slug) ? $slug : '';
        $rows = $db->all("SELECT s.id, s.name, s.slug, s.sec, COUNT(l.id) AS n, MIN(l.price) AS pmin FROM {servers} s
            JOIN {listings} l ON l.server_id=s.id AND l.status='aktif' AND l.stock>0 AND l.cat='yang'
            WHERE s.deleted_at IS NULL AND s.active=1" . ($slug !== '' ? ' AND s.slug=?' : '') . '
            GROUP BY s.id, s.name, s.slug, s.sec ORDER BY n DESC, s.name LIMIT ' . ($slug !== '' ? 1 : 10), $slug !== '' ? [$slug] : []);
        $one = null;
        if ($slug !== '') {
            $one = $db->one('SELECT * FROM {servers} WHERE slug=? AND deleted_at IS NULL AND active=1', [$slug]);
        }
        return [$rows, $one];
    }

    public static function html(Db $db, $slug = '')
    {
        list($site, $SE, $nm) = Seo::settings($db);
        $base = Seo::base($site);
        $mode = Seo::mode($SE);
        list($rows, $one) = self::data($db, $slug);
        $e = function ($s) {
            return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        };
        $tl = function ($k) {
            $v = ((int)$k) / 100;
            return number_format($v, (int)$k % 100 ? 2 : 0, ',', '.') . ' ₺';
        };
        $title = $one ? $one['name'] . ' yang fiyatı' : 'Metin2 yang fiyatları';
        $link = $one ? $base . Seo::href(Seo::srvPath($one) . '/' . Seo::catSlug('yang', $one['sec']), $mode) : $base . Seo::href('/metin2-pvp', $mode);
        $tr = '';
        foreach ($rows as $r) {
            $u = $base . Seo::href('/' . Seo::secPath($r['sec']) . '/' . $r['slug'] . '/' . Seo::catSlug('yang', $r['sec']), $mode);
            $tr .= '<tr><td><a href="' . $e($u) . '" target="_blank" rel="noopener">' . $e($r['name']) . '</a></td><td class="p">' . $e($tl($r['pmin'])) . '</td><td class="n">' . (int)$r['n'] . ' ilan</td></tr>';
        }
        if ($tr === '') {
            $tr = '<tr><td colspan="3" class="m">' . ($one ? 'Şu an bu server için yang ilanı yok.' : 'Şu an yang ilanı yok.') . '</td></tr>';
        }
        $day = gmdate('d.m.Y', (int)floor(yp_now_ms() / 1000) + 10800);
        return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<meta name="robots" content="noindex"><title>' . $e($title) . ' · ' . $e($nm) . '</title><style>'
            . ':root{color-scheme:light dark;--bg:#fff;--fg:#1c2230;--mu:#596172;--li:#dcd7cc;--ac:#8a6214}'
            . '@media (prefers-color-scheme:dark){:root{--bg:#1c2029;--fg:#dfe3ea;--mu:#9ba3b3;--li:#333a48;--ac:#e2bd76}}'
            . 'html,body{margin:0;background:var(--bg);color:var(--fg);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}'
            . '.w{border:1px solid var(--li);border-radius:10px;overflow:hidden;max-width:100%}.h{display:flex;justify-content:space-between;gap:8px;padding:9px 12px;border-bottom:1px solid var(--li)}'
            . '.h b{font-size:14px}.h span{color:var(--mu);font-size:12px}table{width:100%;border-collapse:collapse}td{padding:6px 12px;border-bottom:1px solid var(--li)}'
            . 'tr:last-child td{border-bottom:0}td a{color:inherit;text-decoration:none;font-weight:600}.p{text-align:right;font-weight:700;color:var(--ac);white-space:nowrap}'
            . '.n{text-align:right;color:var(--mu);white-space:nowrap}.m{color:var(--mu)}.f{display:block;padding:8px 12px;border-top:1px solid var(--li);color:var(--ac);text-decoration:none;font-weight:600}'
            . '</style></head><body><div class="w"><div class="h"><b>' . $e($title) . '</b><span>' . $e($day) . '</span></div><table>' . $tr . '</table>'
            . '<a class="f" href="' . $e($link) . '" target="_blank" rel="noopener">' . $e($nm) . '\'da gör →</a></div></body></html>';
    }

    /** widget/yang/index.php: veritabanına bağlanır, sayfayı basar; hiçbir zaman PHP hatası göstermez */
    public static function serve()
    {
        if (!headers_sent()) {
            header_remove('X-Powered-By');
            header('Content-Type: text/html; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'none'");
            header('Referrer-Policy: strict-origin-when-cross-origin');
            header('X-Robots-Tag: noindex');
        }
        try {
            if (!Store::installed()) {
                http_response_code(503);
                echo 'Site kurulmadı.';
                return;
            }
            if (!Db::hasMain()) {
                Store::requireKey();
                Db::setMain(Db::connect(Store::dbConfig()));
            }
            $db = Db::main();
            \YP\Updater::ensure($db);
            $html = self::html($db, isset($_GET['server']) && is_string($_GET['server']) ? strtolower($_GET['server']) : '');
            if (!headers_sent()) {
                header('Cache-Control: public, max-age=300');
            }
            echo $html;
        } catch (\Throwable $e) {
            try {
                Log::write('hata', 'Widget: ' . get_class($e) . ': ' . $e->getMessage());
            } catch (\Throwable $e2) {
            }
            http_response_code(503);
            echo 'Fiyatlar şu an alınamıyor.';
        }
    }
}
