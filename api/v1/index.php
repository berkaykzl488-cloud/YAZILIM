<?php
/**
 * yangpazar API v1 ön denetleyicisi. Tüm /api/v1/* istekleri .htaccess ile buraya yönlenir
 * (mod_rewrite yoksa: /api/v1/index.php?r=auth/login). Bu dosyada düzenlenecek bir şey yoktur.
 */
require dirname(__DIR__, 2) . '/app/bootstrap.php';
YP\Http\Kernel::run();
