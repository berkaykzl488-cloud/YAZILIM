<?php
/**
 * POST /api/paytr_bildirim.php — PayTR Bildirim URL'si (callback). BU ADRES DEĞİŞMEZ (PayTR Mağaza Paneli › Ayarlar › Bildirim URL).
 * İnce kabuk: site uygulamasını (app/) başlatır ve bildirimi YP\Money\Paytr::notify'a verir:
 *   - mağaza bilgileri Yönetim › Entegrasyonlar'dan (tek kaynak, şifreli)
 *   - hash hash_equals ile doğrulanır; yükleme satır kilidiyle tek kez onaylanır, tutar beklenenle aynı olmalı
 *   - tekrar bildirimler "OK" döner ve hiçbir şeyi değiştirmez; geçerli bildirimde düz metin "OK"
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST'], 'origin' => false, 'text' => true]);

$appBoot = dirname(__DIR__) . '/app/bootstrap.php';
if (!is_file($appBoot)) {
    yp_text('PAYTR notification failed: not installed', 503);
}
require_once $appBoot;
if (!YP\Store::installed()) {
    yp_text('PAYTR notification failed: not installed', 503);
}
try {
    YP\Store::requireKey();
    $db = YP\Db::connect(YP\Store::dbConfig());
    YP\Db::setMain($db);
    YP\Settings::clearCache();
    YP\Updater::ensure($db);
    list($http, $txt) = YP\Money\Paytr::notify($db, is_array($_POST) ? $_POST : []);
} catch (Throwable $e) {
    yp_log('hata', 'PayTR bildirimi işlenemedi: ' . get_class($e) . ': ' . $e->getMessage());
    yp_text('PAYTR notification failed: server error', 500); // PayTR yeniden dener
}
yp_text($txt, $http);
