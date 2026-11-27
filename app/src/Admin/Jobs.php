<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Log;

/**
 * P7 cron görevleri (YP\Cron::tasks() ekler):
 *   backup  her tik: otomatik yedek zamanı geldiyse (settings.backup.auto: daily | 12h | 6h | off) yedek alır, saklama kuralını uygular.
 */
final class Jobs
{
    public static function tasks()
    {
        return [
            'backup' => [0, function (Db $db, $deadline) {
                if (!Backup::due($db)) {
                    return ['skip' => true];
                }
                if (microtime(true) > $deadline - 5) {
                    return ['skip' => 'budget'];
                }
                try {
                    $r = Backup::create($db, 'auto', null);
                    return ['file' => $r['file'], 'rows' => $r['_rows'], 'bytes' => (int)$r['bytes']];
                } catch (\Throwable $e) {
                    Log::write('hata', 'Otomatik yedek alınamadı: ' . $e->getMessage());
                    \YP\Money\Jobs::alertAdmins($db, 'Otomatik veritabanı yedeği alınamadı: ' . yp_str($e->getMessage(), 160));
                    throw $e;
                }
            }],
        ];
    }
}
