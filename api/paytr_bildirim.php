<?php
/**
 * POST /api/paytr_bildirim.php — PayTR Bildirim URL'si (callback).
 * Bu adresi PayTR Mağaza Paneli › Destek & Kurulum › Ayarlar › Bildirim URL alanına yapıştırın.
 *
 * - hash: base64(hmac_sha256(merchant_oid + merchant_salt + status + total_amount, merchant_key)), hash_equals ile karşılaştırılır
 * - İdempotent: aynı merchant_oid ikinci kez gelirse yeniden işlenmez, yine "OK" döner
 * - Geçerli bildirimlerde düz metin "OK" döner (PayTR "OK" görene kadar tekrar dener)
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST'], 'origin' => false, 'text' => true]);

if (!yp_installed()) {
    yp_text('PAYTR notification failed: not installed', 503);
}
$s = yp_settings();
if (!yp_service_configured($s, 'paytr')) {
    yp_text('PAYTR notification failed: not configured', 503);
}
$cfg = $s['paytr'];

$p = is_array($_POST) ? $_POST : [];
$f = function ($k) use ($p) {
    return isset($p[$k]) && is_scalar($p[$k]) ? (string)$p[$k] : '';
};
$oid = $f('merchant_oid');
$status = $f('status');
$total = $f('total_amount');
$hash = $f('hash');

if ($oid === '' || $hash === '' || $status === '' || $total === '') {
    yp_text('PAYTR notification failed: bad request', 400);
}

$expected = yp_paytr_callback_hash($oid, (string)$cfg['merchant_salt'], $status, $total, (string)$cfg['merchant_key']);
if (!hash_equals($expected, $hash)) {
    yp_log('paytr', 'Bildirim reddedildi: hash hatalı', ['merchant_oid' => yp_str($oid, 64), 'ip' => yp_client_ip()]);
    yp_text('PAYTR notification failed: bad hash', 400);
}

if (!preg_match('/^[A-Za-z0-9]{1,64}$/', $oid) || !in_array($status, ['success', 'failed'], true) || !preg_match('/^[0-9]{1,12}$/', $total)) {
    yp_log('paytr', 'Bildirim reddedildi: geçersiz alan', ['merchant_oid' => yp_str($oid, 64)]);
    yp_text('PAYTR notification failed: bad request', 400);
}

$paymentAmount = preg_match('/^[0-9]{1,12}$/', $f('payment_amount')) ? (int)$f('payment_amount') : null;
$sonuc = 'yeni';

yp_json_update(YP_DATA . '/odemeler.json', function ($d) use ($oid, $status, $total, $paymentAmount, $f, &$sonuc) {
    if (!isset($d['odemeler']) || !is_array($d['odemeler'])) {
        $d['odemeler'] = [];
    }
    $mevcut = isset($d['odemeler'][$oid]) ? $d['odemeler'][$oid] : null;
    if ($mevcut && isset($mevcut['durum']) && in_array($mevcut['durum'], ['basarili', 'basarisiz'], true)) {
        $sonuc = 'tekrar';
        $d['odemeler'][$oid]['tekrar_bildirim'] = (isset($mevcut['tekrar_bildirim']) ? (int)$mevcut['tekrar_bildirim'] : 0) + 1;
        return $d;
    }
    $kayit = $mevcut ? $mevcut : ['olusturma' => null, 'beklenen' => null];
    $kayit['durum'] = $status === 'success' ? 'basarili' : 'basarisiz';
    $kayit['toplam'] = (int)$total;                // taksit farkı dahil tahsil edilen (kuruş)
    $kayit['odeme_tutari'] = $paymentAmount;       // sipariş tutarı (kuruş)
    $kayit['para_birimi'] = yp_str($f('currency'), 5);
    $kayit['odeme_tipi'] = yp_str($f('payment_type'), 10);
    $kayit['taksit'] = (int)$f('installment_count');
    $kayit['test_mode'] = (int)$f('test_mode');
    $kayit['islem'] = date('c');
    $kayit['islem_ts'] = time();
    $kayit['muhasebe'] = null;
    if ($status !== 'success') {
        $kayit['hata_kodu'] = yp_str($f('failed_reason_code'), 10);
        $kayit['hata_mesaji'] = yp_str($f('failed_reason_msg'), 200);
    }
    if ($status === 'success' && $kayit['beklenen'] !== null && $paymentAmount !== null && (int)$kayit['beklenen'] !== $paymentAmount) {
        $kayit['uyari'] = 'tutar_uyusmazligi';
    }
    unset($kayit['olusturma_ts']);
    $d['odemeler'][$oid] = $kayit;
    return $d;
});

if ($sonuc === 'tekrar') {
    yp_log('paytr', 'Tekrarlanan bildirim (işlenmedi)', ['merchant_oid' => $oid, 'status' => $status]);
} else {
    yp_log('paytr', 'Bildirim işlendi', ['merchant_oid' => $oid, 'status' => $status, 'total_amount' => $total]);
}

yp_text('OK');
