<?php
/**
 * P2: varsayılan ödeme yöntemleri (yalnız gateways tablosu BOŞSA). Gizli anahtar yok; PayTR mağaza bilgileri
 * Yönetim › Entegrasyonlar sayfasından girilir. PayTR ayarları yapılana kadar kart ve PayTR Havale/EFT üyelere
 * otomatik olarak gösterilmez ("yakında"); manuel havale ve kripto bildirimleri ekip onayıyla çalışır.
 * Havale hesapları ve kripto ağları boş başlar (Yönetim › Ödemeler).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;

return function (Db $db) {
    if ((int)$db->val('SELECT COUNT(*) FROM {gateways}') > 0) {
        return;
    }
    $now = yp_now_ms();
    $rows = [
        ['paytr', 'PayTR', 'Kredi / Banka Kartı', 299, 1, 0, 'kart', 1],
        ['paytr_eft', 'PayTR Havale/EFT', 'Otomatik eşleşme · 7/24', 0, 1, 0, 'eft', 2],
        ['havale', 'Manuel havale', 'Kendi hesaplarımıza · ekip onaylı', 0, 1, 1, 'eft', 3],
        ['kripto', 'Kripto', 'USDT · birden fazla ağ · onaylı', 0, 1, 1, 'cuzdan', 4],
    ];
    foreach ($rows as $r) {
        $db->insertIgnore('gateways', ['id' => $r[0], 'n' => $r[1], 't' => $r[2], 'fee_bp' => $r[3], 'is_on' => $r[4], 'manual' => $r[5], 'cat' => $r[6], 'sort' => $r[7], 'updated_at' => $now]);
    }
};
