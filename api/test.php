<?php
/**
 * POST /api/test.php — {service} bağlantı testi (oturum + X-CSRF-Token).
 *  PayTR:      test_mode=1 ile 1,00 TL'lik get-token isteği (token döndüyse başarılı; PayTR hata metni aynen iletilir)
 *  Paraşüt:    OAuth password-grant + firma erişim kontrolü
 *  Bizim Hesap: kimlik doğrulamalı hafif çağrı (depo listesi)
 * Sonuç last_test olarak saklanır.
 */
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/parasut_client.php';
require_once __DIR__ . '/bizimhesap_client.php';
yp_boot(['methods' => ['POST']]);
yp_require_auth();
yp_require_csrf();
yp_rl_enforce('test', 20, 300);

$in = yp_input();
$svc = isset($in['service']) && is_string($in['service']) ? $in['service'] : '';
if (!isset(yp_schema()[$svc])) {
    yp_error('Geçersiz servis. paytr, parasut veya bizimhesap olmalı.', 'validation', 422);
}

$s = yp_settings();
if (!yp_service_configured($s, $svc)) {
    yp_error('Önce bu servisin bilgilerini girip Kaydet\'e basın.', 'not_configured', 422);
}

$res = ['ok' => false, 'msg' => 'Bilinmeyen servis'];
if ($svc === 'paytr') {
    $ip = yp_client_ip();
    $host = parse_url(yp_site_url(), PHP_URL_HOST);
    $res = yp_paytr_get_token($s['paytr'], [
        'tip'       => 'kart',
        'oid'       => yp_paytr_new_oid('YPTEST'),
        'ip'        => $ip,
        'email'     => 'test@' . ($host ? $host : 'example.com'),
        'kurus'     => 100, // 1,00 TL
        'ad'        => 'Baglanti Testi',
        'adres'     => 'Turkiye',
        'tel'       => '05000000000',
        'sepet'     => [['Baglanti testi', '1.00', 1]],
        'test_mode' => 1,
    ]);
    if ($res['ok']) {
        $res['msg'] = 'PayTR bağlantısı başarılı: test modunda 1,00 TL için ödeme token\'ı alındı.'
            . (yp_bool($s['paytr']['test_mode']) ? ' Şu an TEST modundasınız; canlıya geçince test modunu kapatın.' : '');
    }
} elseif ($svc === 'parasut') {
    $res = (new ParasutClient($s['parasut']))->testConnection();
} elseif ($svc === 'bizimhesap') {
    $res = (new BizimHesapClient($s['bizimhesap']))->testConnection();
}

yp_set_last_test($svc, $res['ok'], $res['msg']);
yp_log('test', 'Bağlantı testi', ['service' => $svc, 'sonuc' => $res['ok'] ? 'basarili' : 'hata', 'mesaj' => $res['msg']]);

$out = ['ok' => (bool)$res['ok'], 'service' => $svc, 'msg' => $res['msg']];
if (!$res['ok']) {
    $out['error'] = $res['msg'];
    $out['code'] = 'test_failed';
}
yp_json($out);
