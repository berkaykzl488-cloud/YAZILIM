<?php
/**
 * Yönetim › Entegrasyonlar (P3): sahip API bağlantılarını yalnız panelden kurar; hiçbir dosya düzenlenmez.
 *   GET  admin/integrations                 [muhasebe|odeme]  servisler (maskeli), PayTR bildirim adresi, ETBİS, e-posta/WhatsApp durumu
 *   PUT  admin/integrations/{svc}           paytr [odeme] · parasut, bizimhesap [muhasebe] — {values:{…}, clear?:[alan]}
 *                                           boş ya da maskeli gizli alan eski değeri korur
 *   POST admin/integrations/{svc}/test      "Bağlantıyı test et"
 *   PUT  admin/integrations/etbis           [muhasebe|odeme]  {on, url, code, date}
 * Eski api/ayarlar.php · giris.php · cikis.php · kurulum.php · test.php (ayrı "API şifresi") kapatıldı; aynı işler burada,
 * birleşik çalışan oturumuyla yapılır.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Integrations;
use YP\Money\Api;
use YP\Money\Paytr;
use YP\Perm;
use YP\Settings;

return function (Router $r) {
    $S = function ($perm, $csrf = true) {
        return ['auth' => 'staff', 'perm' => $perm, 'csrf' => $csrf];
    };
    $svc = function (Req $q) {
        $s = $q->param('svc');
        if (!in_array($s, Integrations::SVCS, true)) {
            throw HttpError::notFound('Bilinmeyen entegrasyon.');
        }
        if (!Integrations::can(Auth::$user, $s)) {
            throw HttpError::forbidden('Bu entegrasyonu düzenleme yetkiniz yok (' . \YP\PermMap::PERMS[Integrations::PERM[$s]] . ').');
        }
        return $s;
    };
    $page = function (Db $db) {
        $u = Auth::$user;
        $base = Api::siteBase($db);
        $out = ['services' => [], 'urls' => ['paytrNotify' => Integrations::paytrNotifyUrl($base), 'site' => rtrim($base, '/')]];
        foreach (Integrations::SVCS as $s) {
            $v = Integrations::view($s, $db);
            $v['canEdit'] = Integrations::can($u, $s);
            $out['services'][] = $v;
        }
        $out['etbis'] = Settings::get('etbis', $db);
        $mail = Settings::get('mail', $db);
        $sms = Settings::get('sms', $db);
        $out['mail'] = ['on' => !empty($mail['on']), 'provider' => (string)$mail['provider'], 'canEdit' => Perm::has($u, 'sms')];
        // telefon kanalı (iç ad sms) = WhatsApp Business Cloud API
        $out['sms'] = ['on' => !empty($sms['on']), 'provider' => 'whatsapp', 'configured' => \YP\Sms\WhatsApp::configured($sms), 'canEdit' => Perm::has($u, 'sms')];
        $out['paytr'] = ['configured' => Paytr::configured(), 'testMode' => (bool)Paytr::testMode()];
        return $out;
    };

    $r->get('admin/integrations', function (Req $q, Db $db) use ($page) {
        return ['data' => $page($db)];
    }, $S(['muhasebe', 'odeme'], false));

    $r->put('admin/integrations/etbis', function (Req $q, Db $db) use ($page) {
        $in = Api::body($q);
        $E = Settings::get('etbis', $db);
        $E['on'] = Api::bool(isset($in['on']) ? $in['on'] : false);
        foreach (['url' => 300, 'code' => 60, 'date' => 20, 'img' => 300] as $k => $max) {
            if (array_key_exists($k, $in)) {
                $v = yp_str(trim(is_scalar($in[$k]) ? (string)$in[$k] : ''), $max);
                if (in_array($k, ['url', 'img'], true) && $v !== '' && !yp_valid_url($v)) {
                    throw HttpError::validation(['etb_' . $k => 'Geçerli bir https adresi yazın.']);
                }
                $E[$k] = $v;
            }
        }
        Settings::set('etbis', $E, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'integration_save', 'settings', 'etbis', ['on' => $E['on']]);
        return ['msg' => 'ETBİS bilgileri kaydedildi.', 'data' => $page($db), 'patch' => ['set' => ['etbis' => $E]]];
    }, $S(['muhasebe', 'odeme']));

    $r->put('admin/integrations/{svc}', function (Req $q, Db $db) use ($svc, $page) {
        $s = $svc($q);
        $in = Api::body($q);
        $values = isset($in['values']) && is_array($in['values']) ? $in['values'] : [];
        $clear = isset($in['clear']) && is_array($in['clear']) ? array_values(array_filter($in['clear'], 'is_string')) : [];
        $v = Integrations::save($db, Auth::$user, $s, $values, $clear);
        return ['msg' => Integrations::NAMES[$s] . ' bilgileri kaydedildi.' . ($v['configured'] ? ' Şimdi "Bağlantıyı test et" ile deneyin.' : ' Zorunlu alanlar eksik.'),
            'data' => ['service' => $v] + $page($db)];
    }, $S(['muhasebe', 'odeme']));

    $r->post('admin/integrations/{svc}/test', function (Req $q, Db $db) use ($svc) {
        $s = $svc($q);
        \YP\RateLimit::enforce('integ_test:' . (int)Auth::$user['id'], 20, 300, true, 'Çok fazla deneme yaptınız. 5 dakika sonra tekrar deneyin.');
        $res = Integrations::test($db, Auth::$user, $s, $q->ip, Api::siteBase($db));
        return ['data' => ['ok' => $res['ok'], 'msg' => $res['msg'], 'service' => Integrations::view($s, $db)], 'msg' => $res['ok'] ? $res['msg'] : null];
    }, $S(['muhasebe', 'odeme']));
};
