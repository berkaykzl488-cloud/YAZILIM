<?php
/**
 * 0.6.1: SMS (NetGSM) kaldırıldı, telefon kanalı WhatsApp Business Cloud API (Meta) oldu. İç ad "sms" kaldı
 * (users.tfa='sms' olan üyeler kodu artık WhatsApp'tan alır; outbox satırlarına dokunulmaz).
 *   - kayıtlı settings.sms (şifreli): provider → whatsapp; NetGSM kullanıcı adı/şifre/başlık silinir;
 *     WhatsApp bilgileri girilene kadar gönderim KAPALI (on=false). Saatlik sınır ve olay anahtarları korunur.
 *   - eski sipariş geçmişindeki "bildirim ve SMS gönderildi" ifadesi "bildirim gönderildi" olur.
 * Kayıt yoksa (yeni kurulum) varsayılanlar zaten WhatsApp'tır; bir şey yapılmaz.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Settings;

return function (Db $db) {
    Settings::clearCache();
    if ($db->one("SELECT k FROM {settings} WHERE k='sms'")) {
        $c = Settings::get('sms', $db);
        if (is_array($c) && (!isset($c['provider']) || $c['provider'] !== 'whatsapp' || isset($c['user']) || isset($c['pass']) || isset($c['header']))) {
            $wasOn = !empty($c['on']) && (!isset($c['provider']) || $c['provider'] !== 'whatsapp');
            unset($c['header'], $c['user'], $c['pass']);
            $c['provider'] = 'whatsapp';
            if ($wasOn || empty($c['wa_phone_id']) || empty($c['wa_token'])) {
                $c['on'] = false;
            }
            Settings::set('sms', $c, null, $db);
        }
    }
    if ($db->tableExists('order_events')) {
        $db->exec("UPDATE {order_events} SET x=REPLACE(x, 'bildirim ve SMS gönderildi', 'bildirim gönderildi') WHERE x LIKE '%bildirim ve SMS gönderildi%'");
    }
};
