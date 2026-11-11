<?php
/**
 * Medya yükleme/sunma ve SEO dosyaları (PLAN §4 P1).
 *   POST media              multipart: file=<dosya>, kind=listing|cover|logo|proof|… (yükle-önce; dönen kimlik formla gönderilir)
 *   GET  media/{id}         dosyanın kendisi; özel (private) türlerde yalnız sahibi ve yetkili çalışan
 *   GET  seo/sitemap.xml    GET seo/robots.txt   (site kökündeki dosyalar yazılamadığında da çalışır)
 *   GET  admin/system/update  POST admin/system/update [bakim]   veritabanı güncelleme durumu / elle uygula
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Raw;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Media;
use YP\Perm;
use YP\RateLimit;
use YP\Seo;
use YP\Updater;

return function (Router $r) {
    $r->post('media', function (Req $q, Db $db) {
        $u = Auth::$user;
        $kind = isset($_POST['kind']) && is_string($_POST['kind']) ? $_POST['kind'] : $q->q('kind', 'listing');
        $k = Media::kind($kind);
        if ($k[4] !== null && !Perm::has($u, $k[4])) {
            throw HttpError::forbidden('Bu tür dosyayı yükleme yetkiniz yok.');
        }
        $f = isset($_FILES['file']) && is_array($_FILES['file']) ? $_FILES['file'] : null;
        if (!$f || is_array($f['error'])) {
            if (empty($_FILES) && (int)$q->header('content-length', '0') > 0) {
                throw new HttpError(413, Media::uploadError(UPLOAD_ERR_INI_SIZE), 'too_large');
            }
            throw HttpError::validation(['file' => 'Dosya seçilmedi (alan adı: file; tek dosya).']);
        }
        if ((int)$f['error'] !== UPLOAD_ERR_OK) {
            throw new HttpError(in_array((int)$f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 413 : 422, Media::uploadError($f['error']), 'upload', ['fields' => ['file' => Media::uploadError($f['error'])]]);
        }
        if (!is_uploaded_file($f['tmp_name'])) {
            throw HttpError::validation(['file' => 'Dosya yüklenemedi.']);
        }
        RateLimit::enforce('upload:' . (int)$u['id'], 30, 600, true, 'Çok fazla dosya yüklediniz. Lütfen 10 dakika sonra tekrar deneyin.');
        $m = Media::store($db, $u, $f['tmp_name'], $kind, isset($f['name']) ? (string)$f['name'] : '');
        return ['data' => ['media' => Media::present($m)]];
    }, ['auth' => 'user']);

    $r->get('media/{id}', function (Req $q, Db $db) {
        $m = $db->one('SELECT * FROM {media} WHERE id=?', [Ids::media($q->param('id'))]);
        if (!$m) {
            throw HttpError::notFound('Dosya bulunamadı.');
        }
        if (!Media::canView(Auth::$user, $m)) {
            if (!Auth::$user) {
                throw HttpError::auth('Bu dosyayı görmek için giriş yapmanız gerekiyor.');
            }
            throw HttpError::forbidden('Bu dosyayı görme yetkiniz yok.');
        }
        $abs = Media::absPath($m);
        if (!is_file($abs)) {
            throw HttpError::notFound('Dosya bulunamadı.');
        }
        return Raw::file($m['mime'], $abs, [
            'Cache-Control' => $m['vis'] === 'public' ? 'public, max-age=604800' : 'private, max-age=3600',
            'Content-Security-Policy' => "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
            'Content-Disposition' => 'inline; filename="' . Ids::m($m['id']) . '.' . pathinfo($m['path'], PATHINFO_EXTENSION) . '"',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }, ['auth' => 'none', 'csrf' => false]);

    $r->get('seo/sitemap.xml', function (Req $q, Db $db) {
        return Raw::text('application/xml; charset=utf-8', Seo::sitemapXml($db), ['Cache-Control' => 'public, max-age=3600', 'X-Robots-Tag' => 'noindex']);
    }, ['auth' => 'none', 'csrf' => false]);

    $r->get('seo/robots.txt', function (Req $q, Db $db) {
        return Raw::text('text/plain; charset=utf-8', Seo::robotsTxt($db), ['Cache-Control' => 'public, max-age=3600']);
    }, ['auth' => 'none', 'csrf' => false]);

    // Sunucu tarafı meta (index.php kullanamıyorsa ön yüz de sorabilir): ?path=/ilan/…-l12
    $r->get('seo/meta', function (Req $q, Db $db) {
        $x = Seo::head($db, $q->q('path', '/'));
        unset($x['html']);
        return ['data' => $x];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->get('admin/system/update', function (Req $q, Db $db) {
        return ['data' => Updater::status($db)];
    }, ['auth' => 'staff', 'perm' => 'bakim']);

    // "Güncellemeleri uygula": eksik tablo/sütun/dizin + bekleyen göçler (zaten otomatik; elle tetikleme ve sonucu görme)
    $r->post('admin/system/update', function (Req $q, Db $db) {
        $done = Updater::ensure($db, true);
        $files = Seo::writeFiles($db);
        YP\Audit::log($db, Auth::$user['id'], 'schema_update_manual', 'system', '', ['done' => $done]);
        return ['msg' => $done ? 'Veritabanı güncellendi (' . count($done) . ' işlem).' : 'Veritabanı zaten güncel.', 'data' => ['done' => $done, 'seo' => $files] + Updater::status($db)];
    }, ['auth' => 'staff', 'perm' => 'bakim']);
};
