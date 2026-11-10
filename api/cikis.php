<?php
/**
 * POST /api/cikis.php — panel API oturumunu kapatır.
 */
require_once __DIR__ . '/_lib.php';
yp_boot(['methods' => ['POST']]);
yp_require_auth();

$_SESSION = [];
$p = session_get_cookie_params();
setcookie(session_name(), '', [
    'expires'  => time() - 3600,
    'path'     => $p['path'],
    'domain'   => $p['domain'],
    'secure'   => $p['secure'],
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_destroy();
yp_json(['ok' => true]);
