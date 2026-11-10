<?php
/**
 * POST /api/kurulum.php — ilk kurulum. YALNIZCA API henüz kurulmamışken çalışır.
 * Gövde: {password, site_url}
 * Şifreleme anahtarını, panel API şifresinin özetini ve cron anahtarını üretir.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);

if (yp_installed()) {
    yp_error('Kurulum zaten tamamlanmış. Yeniden kurulum yapılamaz.', 'already_installed', 409);
}
if (yp_crypto_mode() === 'none') {
    yp_error('Sunucuda libsodium veya OpenSSL bulunamadı. Hosting firmanızdan PHP sodium ya da openssl eklentisini açmasını isteyin.', 'no_crypto', 500);
}
if (!is_dir(YP_DATA) || !is_writable(YP_DATA)) {
    yp_error('api/data klasörü yazılabilir değil. cPanel Dosya Yöneticisi\'nde data klasörüne sağ tıklayıp izinleri 755 (veya 775) yapın.', 'data_not_writable', 500);
}

yp_rl_enforce('kurulum', 10, 900);

$in = yp_input();

// Kurulum kodu: panel zip'i indirirken data/kurulum_kodu.php içine tek kullanımlık rastgele bir kod koyar
// ve aynı kodu kurulum isteğiyle gönderir. Böylece zip yüklendikten sonra kurulumu başkası yapamaz.
$codeFile = YP_DATA . '/kurulum_kodu.php';
if (is_file($codeFile)) {
    $expected = (string) yp_read_php_string($codeFile);
    $given = isset($in['install_code']) && is_string($in['install_code']) ? $in['install_code'] : '';
    if ($expected === '' || $given === '' || !hash_equals($expected, $given)) {
        yp_error('Kurulum kodu eşleşmedi. Kurulumu, bu paketi indirdiğiniz yönetim panelinden yapın (Yönetim › Entegrasyonlar).', 'bad_install_code', 403);
    }
}

$password = isset($in['password']) && is_string($in['password']) ? $in['password'] : '';
$siteUrl = yp_str(isset($in['site_url']) ? $in['site_url'] : '', 300);

if (yp_strlen($password) < 10) {
    yp_error('API şifresi en az 10 karakter olmalıdır.', 'validation', 422, ['fields' => ['password' => 'En az 10 karakter']]);
}
if (strlen($password) > 200) {
    yp_error('API şifresi çok uzun (en fazla 200 karakter).', 'validation', 422, ['fields' => ['password' => 'En fazla 200 karakter']]);
}
if ($siteUrl === '') {
    $siteUrl = yp_request_origin();
}
if (!preg_match('#^https?://#i', $siteUrl)) {
    $siteUrl = 'https://' . $siteUrl;
}
$origin = yp_origin_of($siteUrl);
if ($origin === '' || !yp_valid_url($origin . '/')) {
    yp_error('Site adresi geçersiz. Örnek: https://yangpazar.com', 'validation', 422, ['fields' => ['site_url' => 'Geçersiz adres']]);
}

$lock = yp_lock('kurulum');
try {
    if (yp_installed()) { // yarış durumu
        yp_error('Kurulum zaten tamamlanmış. Yeniden kurulum yapılamaz.', 'already_installed', 409);
    }

    // 1) Şifreleme anahtarı
    $key = random_bytes(32);
    yp_write_php_string(YP_DATA . '/anahtar.php', base64_encode($key));
    $GLOBALS['yp_key'] = $key;

    // 2) Boş ayarlar, klasörler. Eski anahtarla şifrelenmiş artık dosyalar (şifre sıfırlama) silinir.
    yp_store_write('ayarlar', ['paytr' => [], 'parasut' => [], 'bizimhesap' => []]);
    @unlink(YP_DATA . '/onbellek.php');
    @unlink(YP_DATA . '/cekimler.php');
    yp_ensure_dir(YP_DATA . '/log');
    yp_ensure_dir(YP_DATA . '/rl');
    if (!is_file(YP_DATA . '/odemeler.json')) {
        yp_json_write(YP_DATA . '/odemeler.json', ['odemeler' => new stdClass()]);
    }
    @unlink(yp_status_file());

    // 3) Yönetici kaydı EN SON yazılır (varlığı = kurulum tamam)
    $admin = [
        'hash'       => password_hash($password, PASSWORD_DEFAULT),
        'cron_key'   => bin2hex(random_bytes(24)),
        'install_id' => bin2hex(random_bytes(16)),
        'kurulum'    => date('c'),
        'site_url'   => $origin,
    ];
    yp_store_write('admin', $admin);
    @unlink($codeFile); // tek kullanımlık
} finally {
    yp_unlock($lock);
}

$csrf = yp_login_session($admin);
yp_log('guvenlik', 'Kurulum tamamlandı', ['ip' => yp_client_ip(), 'site_url' => $origin]);

yp_json(['ok' => true, 'csrf' => $csrf, 'site_url' => $origin]);
