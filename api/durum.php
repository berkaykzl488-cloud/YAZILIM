<?php
/**
 * GET /api/durum.php — herkese açık durum bilgisi. Hiçbir sır döndürmez.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['GET']]);

$installed = yp_installed();
$services = [];
$status = yp_get_status();
$settings = [];
$settingsOk = true;
if ($installed) {
    try {
        $settings = yp_settings();
    } catch (Exception $e) {
        $settingsOk = false;
        yp_log('hata', 'durum: ayarlar okunamadı: ' . $e->getMessage());
    }
}

foreach (array_keys(yp_schema()) as $svc) {
    $row = [
        'configured' => $installed && $settingsOk && yp_service_configured($settings, $svc),
        'last_test'  => isset($status['last_test'][$svc]) ? $status['last_test'][$svc] : null,
    ];
    if ($svc === 'paytr') {
        $row['test_mode'] = isset($settings['paytr']['test_mode']) ? yp_bool($settings['paytr']['test_mode']) : true;
    }
    $services[$svc] = $row;
}

$urls = ['paytr_bildirim' => null, 'cron_hakedis_masked' => null];
$siteUrl = null;
if ($installed) {
    $admin = yp_admin_safe();
    $siteUrl = isset($admin['site_url']) ? $admin['site_url'] : null;
    $urls['paytr_bildirim'] = yp_api_url('paytr_bildirim.php');
    if (!empty($admin['cron_key'])) {
        $urls['cron_hakedis_masked'] = yp_api_url('paytr_hakedis.php') . '?key=' . substr($admin['cron_key'], 0, 4) . '••••••••';
    }
}

yp_json([
    'ok'            => true,
    'installed'     => $installed,
    'version'       => YP_VERSION,
    'php'           => PHP_VERSION,
    'curl'          => function_exists('curl_init'),
    'crypto'        => yp_crypto_mode(),
    'data_writable' => is_dir(YP_DATA) && is_writable(YP_DATA),
    'logged_in'     => $installed ? yp_logged_in() : false,
    'site_url'      => $siteUrl,
    'services'      => $services,
    'urls'          => $urls,
    'hakedis_son'   => isset($status['hakedis_son']) ? $status['hakedis_son'] : null,
]);
