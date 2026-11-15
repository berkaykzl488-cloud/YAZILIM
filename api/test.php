<?php
/**
 * POST /api/test.php — KAPATILDI (P3). Bağlantı testi artık site uygulamasında: POST admin/integrations/{servis}/test.
 * Eski api/ paketinin ayrı "API şifresi" ile açılan oturumu kaldırıldı; ayarlar Yönetim › Entegrasyonlar sayfasından,
 * birleşik çalışan oturumuyla ([muhasebe|odeme] yetkisi) yapılır. Bu dosya güncelleme paketiyle eski sürümün ÜZERİNE yazılsın diye
 * duruyor: hiçbir ayarı okumaz/yazmaz, hiçbir bakiye ya da kayıt oluşturmaz; her istekte 404 döner.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['GET', 'POST', 'PUT', 'DELETE'], 'origin' => false]);
yp_error('Bu eski adres kapatıldı. Bağlantı testi artık Yönetim › Entegrasyonlar ve yönetim panelinden, kendi çalışan hesabınızla yapılır.', 'moved', 404, ['moved_to' => '#yonetim/entegrasyon']);
