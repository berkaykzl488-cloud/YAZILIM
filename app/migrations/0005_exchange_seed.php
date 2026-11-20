<?php
/**
 * P4: Yang Borsası ve EP mağazası başlangıç verisi (yalnız eksikse; mevcut veriye dokunulmaz):
 *   - varsayılan bilgi alanları (alımda karakter adı; satış emrinde hesap adı, şifre, karakter, depo şifresi …)
 *   - borsa ayarları (settings.ex) ve Happy Hour (settings.hh) kaydı yoksa varsayılanlar
 *   - borsa / EP bildirimleri: e-posta ve SMS olay anahtarları (Yönetim › Borsa › Kurlar › Bildirimler'den kapatılabilir)
 *     ve e-posta konu satırları (settings.tpl — sahibi Mesaj şablonlarından değiştirebilir)
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Exchange\Exchange;
use YP\Settings;

return function (Db $db) {
    Exchange::seedFields($db);
    Settings::clearCache();
    if (!$db->one("SELECT k FROM {settings} WHERE k='ex'")) {
        Settings::set('ex', Exchange::defaults(), null, $db);
    }
    if (!$db->one("SELECT k FROM {settings} WHERE k='hh'")) {
        Settings::set('hh', ['on' => false, 'pct' => 30, 'until' => null], null, $db);
    }
    foreach (['mail' => ['borsa' => true, 'call' => true, 'ep_code' => true, 'borsa_off' => true], 'sms' => ['call' => true, 'borsa_off' => true]] as $k => $evs) {
        $c = Settings::get($k, $db);
        if (!is_array($c)) {
            continue;
        }
        $ev = isset($c['ev']) && is_array($c['ev']) ? $c['ev'] : [];
        $ch = false;
        foreach ($evs as $e => $on) {
            if (!array_key_exists($e, $ev)) {
                $ev[$e] = $on;
                $ch = true;
            }
        }
        if ($ch) {
            $c['ev'] = $ev;
            Settings::set($k, $c, null, $db);
        }
    }
    $tpl = Settings::get('tpl', $db);
    $tpl = is_array($tpl) ? $tpl : [];
    $sub = ['borsa' => 'Borsa işleminiz: {durum}', 'call' => 'Operatörümüz sizi bekliyor', 'ep_code' => '{ep} EP kodunuz hazır', 'borsa_off' => 'Yang Borsası kısa bir moladır'];
    $ch = false;
    foreach ($sub as $e => $s) {
        if (!isset($tpl['mail'][$e])) {
            $tpl['mail'][$e] = ['s' => $s, 'b' => "Merhaba {ad},\n\n{mesaj}\n\nİyi oyunlar,\n{site} ekibi"];
            $ch = true;
        }
    }
    if ($ch) {
        Settings::set('tpl', $tpl, null, $db);
    }
};
