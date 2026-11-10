<?php
/**
 * GET  /api/ayarlar.php — servis ayarlarını MASKELİ döndürür (oturum gerekir).
 * POST /api/ayarlar.php — {service, values:{...}, clear?:[alan]} kaydeder (oturum + X-CSRF-Token).
 *   Boş ya da maskeli gönderilen gizli alanlar mevcut değeri KORUR.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['GET', 'POST']]);
yp_require_auth();

$schema = yp_schema();

function yp_ayar_urls()
{
    $admin = yp_admin();
    return [
        'paytr_bildirim' => yp_api_url('paytr_bildirim.php'),
        'cron_hakedis'   => yp_api_url('paytr_hakedis.php') . '?key=' . (isset($admin['cron_key']) ? $admin['cron_key'] : ''),
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $s = yp_settings();
    $out = [];
    foreach (array_keys($schema) as $svc) {
        $out[$svc] = yp_masked_service($s, $svc);
    }
    yp_json(['ok' => true, 'services' => $out, 'urls' => yp_ayar_urls(), 'csrf' => $_SESSION['yp_csrf']]);
}

// ---- POST ----
yp_require_csrf();
$in = yp_input();
$svc = isset($in['service']) && is_string($in['service']) ? $in['service'] : '';
if (!isset($schema[$svc])) {
    yp_error('Geçersiz servis. paytr, parasut veya bizimhesap olmalı.', 'validation', 422);
}
$values = isset($in['values']) && is_array($in['values']) ? $in['values'] : [];
$clear = isset($in['clear']) && is_array($in['clear']) ? $in['clear'] : [];

$errors = [];
$changes = [];
foreach ($schema[$svc] as $f => $def) {
    if (in_array($f, $clear, true)) {
        $changes[$f] = isset($def['default']) ? $def['default'] : '';
        continue;
    }
    if (!array_key_exists($f, $values)) {
        continue; // gönderilmeyen alan değişmez
    }
    $raw = $values[$f];
    switch ($def['type']) {
        case 'bool':
            $changes[$f] = yp_bool($raw);
            break;
        case 'int':
            if ($raw === '' || $raw === null) {
                $raw = isset($def['default']) ? $def['default'] : 0;
            }
            if (!is_numeric($raw) || (int)$raw != $raw || (int)$raw < $def['min'] || (int)$raw > $def['max']) {
                $errors[$f] = $def['label'] . ': ' . $def['min'] . '–' . $def['max'] . ' arası tam sayı olmalı';
                break;
            }
            $changes[$f] = (int)$raw;
            break;
        case 'url':
            $v = yp_str($raw, 400);
            if ($v !== '' && !yp_valid_url($v)) {
                $errors[$f] = $def['label'] . ': geçerli bir http(s) adresi olmalı';
                break;
            }
            $changes[$f] = $v;
            break;
        case 'email':
            $v = yp_str($raw, 200);
            if ($v === '' || yp_is_masked_input($v)) {
                break; // boş → koru
            }
            if (!filter_var($v, FILTER_VALIDATE_EMAIL)) {
                $errors[$f] = $def['label'] . ': geçerli bir e-posta olmalı';
                break;
            }
            $changes[$f] = $v;
            break;
        default: // str
            $max = isset($def['max']) ? $def['max'] : 200;
            $v = is_scalar($raw) ? trim((string)$raw) : '';
            if (!empty($def['secret']) && ($v === '' || yp_is_masked_input($v))) {
                break; // gizli alan boş/maskeli → mevcut değer korunur
            }
            if (strlen($v) > $max || preg_match('/[\x00-\x1F\x7F]/', $v)) {
                $errors[$f] = $def['label'] . ': geçersiz değer';
                break;
            }
            if (isset($def['pattern']) && $v !== '' && !preg_match($def['pattern'], $v)) {
                $errors[$f] = $def['label'] . (isset($def['hint']) ? ': ' . $def['hint'] : ': geçersiz biçim');
                break;
            }
            $changes[$f] = $v;
    }
}

if ($errors) {
    yp_error('Bazı alanlar hatalı: ' . implode('; ', array_values($errors)), 'validation', 422, ['fields' => $errors]);
}

$saved = yp_store_update('ayarlar', function ($s) use ($svc, $changes) {
    if (!isset($s[$svc]) || !is_array($s[$svc])) {
        $s[$svc] = [];
    }
    foreach ($changes as $f => $v) {
        $s[$svc][$f] = $v;
    }
    $s[$svc]['_guncelleme'] = date('c');
    return $s;
});

if ($svc === 'parasut') {
    // Kimlik bilgisi değiştiyse önbellekteki Paraşüt erişim jetonunu at.
    yp_store_update('onbellek', function ($c) {
        unset($c['parasut']);
        return $c;
    });
}
yp_set_last_test($svc, null, '');
yp_log('ayar', 'Ayarlar güncellendi', ['service' => $svc, 'alanlar' => implode(',', array_keys($changes)), 'ip' => yp_client_ip()]);

$full = yp_settings();
yp_json([
    'ok'         => true,
    'service'    => $svc,
    'configured' => yp_service_configured($full, $svc),
    'masked'     => yp_masked_service($full, $svc),
]);
