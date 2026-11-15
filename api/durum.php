<?php
/**
 * GET /api/durum.php — herkese açık, sır içermeyen sağlık bilgisi (sunucu ayakta mı, site kurulu mu).
 * P3: eski api/ paketinin ayrı oturumu ve servis ayarları kaldırıldı; entegrasyon durumu Yönetim › Entegrasyonlar'da.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['GET']]);

$installed = is_file(dirname(__DIR__) . '/storage/kurulum_tamam.php');
yp_json([
    'ok'        => true,
    'installed' => $installed,
    'version'   => YP_VERSION,
    'php'       => PHP_VERSION,
    'curl'      => function_exists('curl_init'),
    'crypto'    => yp_crypto_mode(),
    'panel'     => '/#yonetim/entegrasyon',
]);
