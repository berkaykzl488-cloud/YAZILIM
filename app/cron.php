<?php
/**
 * Zamanlanmış görevler (cPanel › Cron Jobs, 5 dakikada bir):
 *   /usr/local/bin/php /home/KULLANICI/<sitenin-kök-klasörü>/app/cron.php
 *   (ör. public_html ya da test.yangpazar.com — tam yol kurulumun son sayfasında gösterilir)
 * Yalnız komut satırından çalışır; tarayıcıdan açılamaz (app/ klasörü zaten kapalıdır).
 * Dış zamanlayıcı (cron-job.org) için: https://SITE/api/v1/cron?key=… (kurulum sonunda gösterilir)
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/bootstrap.php';

use YP\Cron;
use YP\Db;
use YP\Store;

if (!Store::installed()) {
    fwrite(STDERR, "Kurulum tamamlanmamış.\n");
    exit(1);
}
try {
    Store::requireKey();
    $db = Db::connect(Store::dbConfig());
    Db::setMain($db);
    YP\Updater::ensure($db);
    $r = Cron::run($db, 45, 'cli');
    echo json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
    exit(!empty($r['ok']) ? 0 : 2);
} catch (Throwable $e) {
    YP\Log::write('hata', 'cron: ' . $e->getMessage());
    fwrite(STDERR, 'Cron hatası: ' . $e->getMessage() . "\n");
    exit(1);
}
