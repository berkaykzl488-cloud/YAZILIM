<?php
/**
 * P7 site ayarları [ayar] (PLAN §4 P7).
 *   GET  admin/settings/site            site ayarları + şirket bilgisi + ETBİS
 *   PUT  admin/settings/site            site adı, slogan, siteUrl, komisyon, otomatik onay, en az çekim, WhatsApp, destek saatleri,
 *                                       popup, 2FA anahtarı, puan oranı, ilan onayı — hepsi sunucuda doğrulanır; bilinmeyen alan 422
 *   PUT  admin/settings/company         şirket bilgisi (yasal sayfalardaki [ŞİRKET UNVANI] vb. buradan dolar)
 *   PUT  admin/settings/etbis           {on, url, code, date, imgData?}  (ETBİS'in verdiği koddaki karekod data: adresiyle gelebilir)
 *   POST admin/settings/etbis/img       multipart file=<görsel>  · DELETE admin/settings/etbis/img
 *   GET  admin/golive                   yayına alma kontrol listesi (sunucuda hesaplanır)  [ayar | bakim]
 *   PUT  admin/settings/golive          {demoMode}  — yalnız yönetici (demo hesap değiştiriciyi açar/kapatır)
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Admin\Content;
use YP\Admin\GoLive;
use YP\Admin\Site;
use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Media;
use YP\Perm;
use YP\RateLimit;
use YP\Seo;
use YP\Settings;

return function (Router $r) {
    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $out = function (Db $db) {
        $site = Settings::get('site', $db);
        $keys = ['siteName', 'slogan', 'siteUrl', 'commission', 'autoConfirm', 'minWithdraw', 'whatsapp', 'supportHours', 'popupOn', 'popupDelay', 'tfaOn', 'ptRate', 'moderation'];
        $s = [];
        foreach ($keys as $k) {
            $s[$k] = isset($site[$k]) ? $site[$k] : null;
        }
        return ['site' => $s, 'company' => Content::company($db), 'etbis' => Site::etbis($db), 'demoMode' => (bool)(int)Settings::get('demo_mode', $db)];
    };

    $r->get('admin/settings/site', function (Req $q, Db $db) use ($out) {
        return ['data' => $out($db)];
    }, $S('ayar'));

    $r->put('admin/settings/site', function (Req $q, Db $db) use ($out) {
        $patch = Site::sitePatch($q->body());
        $old = Settings::get('site', $db);
        Settings::set('site', array_replace($old, $patch), Auth::$user['id'], $db);
        if (isset($patch['siteUrl']) && $patch['siteUrl'] !== (string)$old['siteUrl']) {
            try {
                Seo::writeFiles($db); // site haritası / robots.txt yeni adresle
            } catch (\Throwable $e) {
            }
        }
        Audit::log($db, Auth::$user['id'], 'settings_site', 'settings', 'site', ['keys' => array_keys($patch)]);
        return ['msg' => 'Ayarlar kaydedildi.', 'data' => $out($db), 'patch' => ['set' => $patch]];
    }, $S('ayar'));

    $r->put('admin/settings/company', function (Req $q, Db $db) use ($out) {
        $patch = Site::companyPatch($q->body());
        $cur = Content::company($db);
        Settings::set('company', array_replace($cur, $patch), Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_company', 'settings', 'company', ['keys' => array_keys($patch)]);
        $miss = Content::missingCompany(Content::company($db));
        return ['msg' => 'Şirket bilgileri kaydedildi.' . ($miss ? ' Eksik: ' . implode(', ', array_map(function ($k) {
            return Content::COMPANY[$k][0];
        }, $miss)) . '.' : ' Yasal sayfalar güncel bilgilerle gösteriliyor.'), 'data' => $out($db) + ['legal' => Content::legalStatus($db)]];
    }, $S('ayar'));

    $r->put('admin/settings/etbis', function (Req $q, Db $db) use ($out) {
        $in = $q->body();
        $E = Site::etbisPatch($db, $in);
        if (isset($in['imgData']) && $in['imgData'] !== '' && $in['imgData'] !== null) {
            $tmp = Site::dataUrlFile($in['imgData']);
            try {
                $img = Site::etbisSetImage($db, Auth::$user, $tmp);
                $E['img'] = $img['img'];
                $E['imgId'] = $img['imgId'];
            } finally {
                @unlink($tmp);
            }
        }
        Settings::set('etbis', $E, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_etbis', 'settings', 'etbis', ['on' => (bool)$E['on'], 'img' => $E['img'] !== '']);
        return ['msg' => $E['on'] ? 'ETBİS bilgileri kaydedildi; rozet sitenin alt kısmında görünüyor.' : 'ETBİS bilgileri kaydedildi.',
            'data' => $out($db), 'patch' => ['set' => ['etbis' => $E]]];
    }, $S('ayar'));

    $r->post('admin/settings/etbis/img', function (Req $q, Db $db) use ($out) {
        $f = isset($_FILES['file']) && is_array($_FILES['file']) ? $_FILES['file'] : null;
        if (!$f || is_array($f['error']) || (int)$f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
            throw HttpError::validation(['file' => $f && !is_array($f['error']) ? Media::uploadError($f['error']) : 'Görsel seçilmedi (alan adı: file).']);
        }
        RateLimit::enforce('upload:' . (int)Auth::$user['id'], 30, 600, true, 'Çok fazla dosya yüklediniz. Lütfen 10 dakika sonra tekrar deneyin.');
        $E = Site::etbisSetImage($db, Auth::$user, $f['tmp_name'], isset($f['name']) ? (string)$f['name'] : 'etbis.png');
        Settings::set('etbis', $E, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_etbis_img', 'settings', 'etbis');
        return ['msg' => 'Karekod yüklendi.', 'data' => $out($db), 'patch' => ['set' => ['etbis' => $E]]];
    }, $S('ayar'));

    $r->delete('admin/settings/etbis/img', function (Req $q, Db $db) use ($out) {
        $E = Site::etbis($db);
        Site::etbisDropImage($db, $E);
        $E['img'] = '';
        $E['imgId'] = null;
        Settings::set('etbis', $E, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_etbis_img_del', 'settings', 'etbis');
        return ['msg' => 'Karekod kaldırıldı.', 'data' => $out($db), 'patch' => ['set' => ['etbis' => $E]]];
    }, $S('ayar'));

    $r->get('admin/golive', function (Req $q, Db $db) {
        return ['data' => GoLive::checks($db)];
    }, $S(['ayar', 'bakim']));

    $r->put('admin/settings/golive', function (Req $q, Db $db) use ($out) {
        if (!Perm::isAdmin(Auth::$user)) {
            throw HttpError::forbidden('Demo modunu yalnız yönetici değiştirebilir.');
        }
        $in = $q->body();
        if (!isset($in['demoMode']) || !is_bool($in['demoMode'])) {
            throw HttpError::validation(['demoMode' => 'Açık / kapalı olmalı.']);
        }
        Settings::set('demo_mode', $in['demoMode'] ? 1 : 0, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_demo_mode', 'settings', 'demo_mode', ['on' => $in['demoMode']]);
        return ['msg' => $in['demoMode'] ? 'Demo modu açıldı.' : 'Demo modu kapatıldı.', 'data' => $out($db) + GoLive::checks($db), 'patch' => ['set' => ['demoMode' => $in['demoMode']]]];
    }, $S('ayar'));
};
