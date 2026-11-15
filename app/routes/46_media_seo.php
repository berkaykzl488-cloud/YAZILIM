<?php
/**
 * Medya yükleme/sunma ve SEO dosyaları (PLAN §4 P1).
 *   POST media              multipart: file=<dosya>, kind=listing|cover|logo|proof|… (yükle-önce; dönen kimlik formla gönderilir)
 *   GET  media/{id}         dosyanın kendisi; özel (private) türlerde yalnız sahibi ve yetkili çalışan
 *   GET  seo/sitemap.xml    GET seo/robots.txt   (site kökündeki dosyalar yazılamadığında da çalışır)
 *   GET  admin/system/update  POST admin/system/update [bakim]   veritabanı güncelleme durumu / elle uygula
 *   GET  admin/settings/seo   PUT admin/settings/seo [seo]        SEO ayarları (temiz adresler, başlık, açıklama, doğrulama kodları)
 *   POST admin/seo/probe [seo]                                     tarayıcının rewrite denetimi sonucu ({ok, code})
 *   boot.set.seo: herkese açık SEO ayarları + adres kipi (mode: clean | p)
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Db;
use YP\Hooks;
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
use YP\V;

return function (Router $r) {
    // boot: SEO ayarları ve adres kipi (ön yüz bağlantıları temiz adres ya da ?p= olarak yazar)
    Hooks::on('boot', function (array $data, Db $db, $u) {
        if (isset($data['set']) && is_array($data['set'])) {
            $data['set']['seo'] = Seo::publicSeo($db);
        }
        return $data;
    }, 'seo');

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
        unset($x['html'], $x['srv'], $x['lst'], $x['cnt'], $x['priv'], $x['intro']); // ham satırlar dışarı çıkmaz
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

    $seoOut = function (Db $db) {
        list(, $SE, ) = Seo::settings($db);
        $base = rtrim(Media::webBase(), '/');
        return ['seo' => Seo::publicSeo($db), 'probe' => $base . '/metin2-pvp?yp_probe=1', 'sitemap' => $base . '/sitemap.xml', 'robots' => $base . '/robots.txt',
            'example' => ['clean' => '/metin2-pvp/albamt2/karakter', 'p' => '/?p=metin2-pvp/albamt2/karakter']];
    };
    $r->get('admin/settings/seo', function (Req $q, Db $db) use ($seoOut) {
        return ['data' => $seoOut($db)];
    }, ['auth' => 'staff', 'perm' => 'seo']);

    $r->put('admin/settings/seo', function (Req $q, Db $db) use ($seoOut) {
        $v = new V($q->body());
        $patch = [];
        foreach (['homeTitle' => 70, 'desc' => 170, 'ogImg' => 300, 'gsc' => 120, 'bing' => 120, 'yandex' => 120] as $k => $max) {
            if ($v->has($k)) {
                $patch[$k] = $v->str($k, 0, $max, $k === 'ogImg' ? '#^https?://\S+$#i' : ($max === 120 ? '/^[A-Za-z0-9_=.\-]+$/' : null));
            }
        }
        if ($v->has('sep')) {
            $patch['sep'] = $v->oneOf('sep', [' | ', ' · ', ' - ', ' – ']);
        }
        foreach (['clean', 'noindex'] as $k) {
            if ($v->has($k)) {
                $patch[$k] = $v->bool($k);
            }
        }
        $v->done();
        list(, $old, ) = Seo::settings($db);
        $SE = Seo::saveSeo($db, $patch, Auth::$user['id']);
        if (Seo::mode($old) !== Seo::mode($SE) || (bool)$old['noindex'] !== (bool)$SE['noindex']) {
            Seo::writeFiles($db);
        }
        YP\Audit::log($db, Auth::$user['id'], 'settings_seo', 'settings', 'seo', ['keys' => array_keys($patch), 'clean' => (bool)$SE['clean'], 'noindex' => (bool)$SE['noindex']]);
        return ['msg' => 'SEO ayarları kaydedildi.', 'data' => $seoOut($db), 'patch' => ['set' => ['seo' => Seo::publicSeo($db)]]];
    }, ['auth' => 'staff', 'perm' => 'seo']);

    // Tarayıcıdaki denetim: /metin2-pvp?yp_probe=… yanıtında X-YP-Page: probe var mı? Başarı index.php'de zaten kaydedilir
    // (istek temiz adresle ulaştı); burada başarısızlık kaydedilir → site ?p= adreslerine döner.
    $r->post('admin/seo/probe', function (Req $q, Db $db) use ($seoOut) {
        $in = $q->body();
        $ok = !empty($in['ok']);
        $code = isset($in['code']) && is_numeric($in['code']) ? (int)$in['code'] : 0;
        list(, $SE, ) = Seo::settings($db);
        if ($ok) {
            Seo::noteRewrite($db, true, 'yonetim', $code);
        } else {
            Seo::noteRewrite($db, false, 'yonetim', $code);
        }
        $out = $seoOut($db);
        return ['msg' => $ok ? 'Temiz adresler çalışıyor.' : 'Temiz adresler bu sunucuda çalışmıyor; site ?p= adresleriyle devam ediyor.', 'data' => $out,
            'patch' => ['set' => ['seo' => $out['seo']]]];
    }, ['auth' => 'staff', 'perm' => 'seo']);
};
