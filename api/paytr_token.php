<?php
/**
 * POST /api/paytr_token.php — ödeme iFrame token'ı (hash SUNUCUDA hesaplanır, sırlar tarayıcıya gitmez).
 * Gövde: {tip:"kart"|"eft", tutar, banka?, email, ad, tel, adres?, sepet?:[[ad, fiyat, adet],...]}
 * Yanıt: {ok:true, token, merchant_oid, iframe_url}
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);
yp_require_installed();
yp_rl_enforce('paytr_token', 15, 600);

$s = yp_settings();
if (!yp_service_configured($s, 'paytr')) {
    yp_error('Online ödeme şu anda kullanılamıyor (PayTR ayarları yapılmamış).', 'not_configured', 503);
}

$in = yp_input();
$errors = [];

$tip = isset($in['tip']) && is_string($in['tip']) ? strtolower($in['tip']) : 'kart';
if (!in_array($tip, ['kart', 'eft'], true)) {
    $errors['tip'] = 'Ödeme tipi kart veya eft olmalı';
}
$tutar = yp_money(isset($in['tutar']) ? $in['tutar'] : null);
if ($tutar === null || $tutar < 1 || $tutar > 100000) {
    $errors['tutar'] = 'Tutar 1 ile 100.000 TL arasında olmalı';
}
$email = yp_str(isset($in['email']) ? $in['email'] : '', 100);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Geçerli bir e-posta adresi girin';
}
$ad = yp_str(isset($in['ad']) ? $in['ad'] : '', 60);
if (yp_strlen($ad) < 2) {
    $errors['ad'] = 'Ad soyad girin';
}
$tel = preg_replace('/[^0-9+]/', '', yp_str(isset($in['tel']) ? $in['tel'] : '', 30));
if ($tip === 'kart' && !preg_match('/^\+?[0-9]{10,15}$/', (string)$tel)) {
    $errors['tel'] = 'Geçerli bir telefon numarası girin';
}
$adres = yp_str(isset($in['adres']) ? $in['adres'] : '', 400);
if ($adres === '') {
    $adres = 'Türkiye';
}
$banka = yp_str(isset($in['banka']) ? $in['banka'] : '', 40);

$kurus = (int)round(($tutar === null ? 0 : $tutar) * 100);
$sepet = [];
if (isset($in['sepet']) && is_array($in['sepet']) && $in['sepet']) {
    if (count($in['sepet']) > 50) {
        $errors['sepet'] = 'Sepette en fazla 50 kalem olabilir';
    } else {
        foreach ($in['sepet'] as $i => $row) {
            if (!is_array($row) || count($row) < 3) {
                $errors['sepet'] = 'Sepet biçimi hatalı: [ad, fiyat, adet]';
                break;
            }
            $row = array_values($row);
            $pName = yp_str($row[0], 100);
            $pPrice = yp_money($row[1]);
            $pQty = (int)$row[2];
            if ($pName === '' || $pPrice === null || $pPrice <= 0 || $pQty < 1 || $pQty > 1000) {
                $errors['sepet'] = 'Sepet kalemi hatalı (satır ' . ($i + 1) . ')';
                break;
            }
            $sepet[] = [$pName, number_format($pPrice, 2, '.', ''), $pQty];
        }
    }
}
if (!$sepet && $tutar !== null) {
    $sepet = [['YangPazar bakiye yükleme', number_format($tutar, 2, '.', ''), 1]];
}

if ($errors) {
    yp_error('Bazı alanlar hatalı: ' . implode('; ', array_values($errors)), 'validation', 422, ['fields' => $errors]);
}

$oid = yp_paytr_new_oid('YP');
$testMode = yp_bool($s['paytr']['test_mode']) ? 1 : 0;

// Bekleyen siparişi kaydet (kişisel veri saklanmaz; yalnızca tutar ve durum).
yp_json_update(YP_DATA . '/odemeler.json', function ($d) use ($oid, $tip, $kurus, $testMode, $banka) {
    if (!isset($d['odemeler']) || !is_array($d['odemeler'])) {
        $d['odemeler'] = [];
    }
    // Bildirimi hiç gelmemiş 3 günden eski bekleyenleri temizle
    $now = time();
    foreach ($d['odemeler'] as $k => $o) {
        if (isset($o['durum']) && $o['durum'] === 'bekliyor' && isset($o['olusturma_ts']) && $o['olusturma_ts'] < $now - 3 * 86400) {
            unset($d['odemeler'][$k]);
        }
    }
    $d['odemeler'][$oid] = [
        'durum'        => 'bekliyor',
        'tip'          => $tip,
        'beklenen'     => $kurus,
        'banka'        => $banka,
        'test_mode'    => $testMode,
        'olusturma'    => date('c'),
        'olusturma_ts' => $now,
    ];
    return $d;
});

$res = yp_paytr_get_token($s['paytr'], [
    'tip'   => $tip,
    'oid'   => $oid,
    'ip'    => yp_client_ip(),
    'email' => $email,
    'kurus' => $kurus,
    'ad'    => $ad,
    'adres' => $adres,
    'tel'   => (string)$tel,
    'sepet' => $sepet,
]);

if (!$res['ok']) {
    yp_log('paytr', 'Token alınamadı', ['merchant_oid' => $oid, 'mesaj' => $res['msg']]);
    yp_error('Ödeme başlatılamadı. ' . $res['msg'], 'paytr_error', 502);
}

yp_json([
    'ok'           => true,
    'token'        => $res['token'],
    'merchant_oid' => $oid,
    'iframe_url'   => 'https://www.paytr.com/odeme/guvenli/' . rawurlencode($res['token']),
]);
