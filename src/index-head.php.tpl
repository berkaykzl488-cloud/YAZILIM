<?php
/*
 * yangpazar.com · ana sayfa (tools/build.php --prod üretir; elle düzenlemeyin, değişiklikleri src/ içinde yapın)
 *
 * - Kurulum tamamlanmadıysa /kurulum/ sihirbazına yönlendirir.
 * - Açılış verisini (GET /api/v1/boot ile aynı: CSRF, herkese açık ayarlar, oturumdaki üye, bildirimler)
 *   sayfaya window.YP_BOOT olarak yazar; böylece ilk açılışta ayrı bir istek gerekmez.
 * - window.YP_MODE='prod': ön yüz localStorage demo yerine sunucu API'sini kullanır.
 */
require __DIR__ . '/app/bootstrap.php';

if (!headers_sent()) {
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Cache-Control: no-store, max-age=0');
    header_remove('X-Powered-By');
}
if (!YP\Store::installed()) {
    header('Location: kurulum/', true, 302);
    exit;
}
$ypBoot = null;
try {
    $h = [];
    foreach ($_SERVER as $k => $v) {
        if (strncmp($k, 'HTTP_', 5) === 0) {
            $h[strtolower(str_replace('_', '-', substr($k, 5)))] = (string)$v;
        }
    }
    // Sayfa açılışı bir gezinmedir (Google'dan gelen ziyaretçi dahil): köken denetimi API çağrıları içindir.
    unset($h['origin'], $h['sec-fetch-site']);
    $out = YP\Http\Kernel::dispatch(new YP\Http\Req('GET', 'boot', [], null, $h, yp_client_ip()));
    if (!empty($out[1]['ok']) && isset($out[1]['data'])) {
        $ypBoot = $out[1]['data'];
    }
} catch (\Throwable $e) {
    try {
        YP\Log::write('hata', 'Ana sayfa açılış verisi: ' . get_class($e) . ': ' . $e->getMessage());
    } catch (\Throwable $e2) {
    }
}
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
$ypBase = rtrim(str_replace('\\', '/', dirname(isset($_SERVER['SCRIPT_NAME']) ? (string)$_SERVER['SCRIPT_NAME'] : '/index.php')), '/') . '/';
$ypJ = function ($v) {
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_PARTIAL_OUTPUT_ON_ERROR);
};
$ypBootTag = '<script>window.YP_MODE="prod";window.YP_BASE=' . $ypJ($ypBase) . ';window.YP_BOOT=' . $ypJ($ypBoot) . ';</script>';
?>
