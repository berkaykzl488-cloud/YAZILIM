<?php
/**
 * php -S yönlendiricisi: kök .htaccess kurallarının test karşılığı.
 *   - app/, storage/, tests/, tools/, docs/ ve gizli dosyalar → 403
 *   - /api/v1/* → api/v1/index.php
 *   - geri kalanı (api/*.php, kurulum/, statik dosyalar) olduğu gibi
 */
$uri = (string)parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/', PHP_URL_PATH);
$root = rtrim($_SERVER['DOCUMENT_ROOT'], '/');
if (preg_match('#^/(app|storage|tests|tools|docs)(/|$)#', $uri) || preg_match('#(^|/)\.(?!well-known/)#', $uri)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    return true;
}
// uploads/: yalnız görsel/video (uploads/.htaccess karşılığı)
if (preg_match('#^/uploads/#', $uri) && preg_match('#\.(php[0-9]?|phtml|phar|pht|phps|cgi|pl|py|sh|shtml|htaccess|html?|svgz?|js|xml)$#i', $uri)) {
    http_response_code(403);
    echo 'Forbidden';
    return true;
}
// sitemap.xml / robots.txt: dosya yoksa API üretir (kök .htaccess karşılığı)
if (in_array($uri, ['/sitemap.xml', '/robots.txt'], true) && !is_file($root . $uri)) {
    $_GET['r'] = 'seo' . $uri;
    $_SERVER['SCRIPT_NAME'] = '/api/v1/index.php';
    $_SERVER['REQUEST_URI'] = '/api/v1/index.php?r=seo' . $uri;
    require $root . '/api/v1/index.php';
    return true;
}
if (preg_match('#^/api/v1(/|$)#', $uri)) {
    $_SERVER['SCRIPT_NAME'] = '/api/v1/index.php';
    require $root . '/api/v1/index.php';
    return true;
}
if (preg_match('#^/kurulum/?(index\.php)?$#', $uri)) {
    $_SERVER['SCRIPT_NAME'] = '/kurulum/index.php';
    require $root . '/kurulum/index.php';
    return true;
}
return false;
