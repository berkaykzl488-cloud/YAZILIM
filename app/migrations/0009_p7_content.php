<?php
/**
 * P7: kurumsal / yasal sayfalar ve şirket bilgisi.
 *   - pages tablosu boşsa altı sayfa app/seed/yasal/*.md taslaklarıyla oluşturulur (Hakkımızda, İletişim/Künye, KVKK, Mesafeli
 *     satış / üyelik sözleşmesi, İade/iptal/cayma, Gizlilik & çerez). Yönetimden düzenlenen sayfalara dokunulmaz.
 *   - settings.company yoksa e-Gider ayarlarındaki şirket bilgisi (unvan, vergi dairesi, VKN, MERSİS, adres) içe aktarılır
 *     (tek kaynak: Yönetim › Site ayarları › Şirket & yasal sayfalar).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Admin\Content;
use YP\Db;
use YP\Settings;

return function (Db $db) {
    Settings::clearCache();
    Content::seedPages($db);
    if (!$db->one("SELECT k FROM {settings} WHERE k='company'")) {
        $e = Settings::get('egp', $db);
        $c = ['type' => 'sirket'];
        foreach (['unvan' => 'company', 'vd' => 'vd', 'vkn' => 'vkn', 'mersis' => 'mersis', 'adres' => 'addr'] as $to => $from) {
            $v = is_array($e) && isset($e[$from]) && is_scalar($e[$from]) ? trim((string)$e[$from]) : '';
            if ($v !== '') {
                $c[$to] = yp_str($v, Content::COMPANY[$to][1]);
            }
        }
        Settings::set('company', $c, null, $db);
    }
};
