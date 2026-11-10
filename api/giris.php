<?php
/**
 * POST /api/giris.php — panel API oturumu açar. Gövde: {password}
 * Hız sınırı: aynı IP'den 15 dakikada en fazla 5 hatalı deneme.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);
yp_require_installed();

$bucket = 'giris';
$limit = 5;
$window = 900;

// Önce kontrol (saymadan): sınır aşıldıysa doğru şifre bile denenmez.
yp_rl_enforce($bucket, $limit, $window, false);

$in = yp_input();
$password = isset($in['password']) && is_string($in['password']) ? $in['password'] : '';
$admin = yp_admin();

if ($password === '' || strlen($password) > 200 || empty($admin['hash']) || !password_verify($password, $admin['hash'])) {
    $r = yp_rl_add($bucket, $window);
    usleep(300000); // kaba kuvvet denemelerini yavaşlat
    yp_log('guvenlik', 'Hatalı giriş denemesi', ['ip' => yp_client_ip()]);
    $left = max(0, $limit - $r['count']);
    yp_error('Şifre hatalı.' . ($left > 0 ? ' Kalan deneme hakkı: ' . $left . '.' : ' Çok fazla hatalı deneme; 15 dakika bekleyin.'),
        'bad_password', 401, ['remaining' => $left]);
}

if (password_needs_rehash($admin['hash'], PASSWORD_DEFAULT)) {
    $newHash = password_hash($password, PASSWORD_DEFAULT);
    yp_store_update('admin', function ($a) use ($newHash) {
        $a['hash'] = $newHash;
        return $a;
    });
}

yp_rl_reset($bucket);
$csrf = yp_login_session($admin);
yp_log('guvenlik', 'Giriş yapıldı', ['ip' => yp_client_ip()]);
yp_json(['ok' => true, 'csrf' => $csrf]);
