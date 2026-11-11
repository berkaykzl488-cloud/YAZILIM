<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }


/**
 * Zamanlanmış görevler: cPanel cron'u 5 dakikada bir `php …/app/cron.php` çalıştırır
 * (ya da cron-job.org: /api/v1/cron?key=…). Her görevin kendi aralığı ve veritabanı kilidi (cron_runs.lock_until) vardır;
 * toplam süre bütçesi 45 sn.
 */
final class Cron
{
    /** görev => [aralık ms, işlev(Db, bitiş zamanı)] */
    public static function tasks()
    {
        return [
            'outbox'  => [0, function (Db $db, $deadline) {
                return Outbox::tick($db, null, null, $deadline);
            }],
            'cleanup' => [86400000, function (Db $db, $deadline) {
                $now = yp_now_ms();
                $r = [];
                $r['challenges'] = $db->exec('DELETE FROM {auth_challenges} WHERE expires_at<?', [$now - 86400000]);
                $r['idem'] = Idem::cleanup($db);
                $r['notifs'] = $db->exec('DELETE FROM {notifications} WHERE is_read=1 AND t<?', [$now - 180 * 86400000]);
                $r['outbox'] = $db->exec("DELETE FROM {outbox} WHERE status IN ('sent','failed') AND created_at<?", [$now - 90 * 86400000]);
                RateLimit::gc();
                $r['media'] = Media::cleanupOrphans($db);
                return $r;
            }],
            // sitemap.xml + robots.txt site köküne: katalog değiştiyse en çok 10 dakikada bir, değişmese de günde bir
            'seo' => [0, function (Db $db, $deadline) {
                $f = Media::publicRoot() . '/sitemap.xml';
                clearstatcache(true, $f);
                $gen = is_file($f) ? (int)filemtime($f) * 1000 : 0;
                $now = (int)floor(microtime(true) * 1000);
                if ($gen && ($now - $gen < 600000 || (Seo::changedAt($db) < $gen && $now - $gen < 86400000))) {
                    return ['skip' => true];
                }
                return Seo::writeFiles($db);
            }],
            // P2+: autoconfirm, deposit_expiry, accounting_jobs, ad_stats; saatlik hakediş; günlük yedek ve defter denetimi
        ];
    }

    public static function lock(Db $db, $task, $ttlMs)
    {
        $now = yp_now_ms();
        $db->insertIgnore('cron_runs', ['task' => $task, 'last_start' => 0, 'last_ok' => 0, 'lock_until' => 0, 'runs' => 0]);
        return $db->exec('UPDATE {cron_runs} SET lock_until=?, last_start=? WHERE task=? AND lock_until<?', [$now + $ttlMs, $now, $task, $now]) === 1;
    }

    public static function done(Db $db, $task, $error = null)
    {
        $set = ['lock_until' => 0, 'last_error' => $error === null ? null : yp_str($error, 255)];
        if ($error === null) {
            $set['last_ok'] = yp_now_ms();
        }
        $db->update('cron_runs', $set, 'task=?', [$task]);
        $db->exec('UPDATE {cron_runs} SET runs=runs+1 WHERE task=?', [$task]);
    }

    /** Ana tik 10 dakikadan uzun süredir çalışmadı mı? */
    public static function late(Db $db)
    {
        $last = (int)$db->val("SELECT last_start FROM {cron_runs} WHERE task='tick'");
        return yp_now_ms() - $last > 600000;
    }

    public static function run(Db $db, $budgetSec = 45, $via = 'cli')
    {
        $deadline = microtime(true) + $budgetSec;
        if (!self::lock($db, 'tick', ($budgetSec + 15) * 1000)) {
            return ['ok' => false, 'msg' => 'Başka bir cron çalışması sürüyor.'];
        }
        $out = ['ok' => true, 'via' => $via, 'tasks' => []];
        try {
            foreach (self::tasks() as $name => $t) {
                if (microtime(true) > $deadline) {
                    break;
                }
                list($interval, $fn) = $t;
                $last = (int)$db->val('SELECT last_ok FROM {cron_runs} WHERE task=?', [$name]);
                if ($interval > 0 && yp_now_ms() - $last < $interval) {
                    continue;
                }
                if (!self::lock($db, $name, $budgetSec * 1000)) {
                    continue;
                }
                try {
                    $out['tasks'][$name] = $fn($db, $deadline);
                    self::done($db, $name);
                } catch (\Throwable $e) {
                    self::done($db, $name, $e->getMessage());
                    Log::write('hata', 'cron ' . $name . ': ' . $e->getMessage());
                    $out['tasks'][$name] = ['error' => $e->getMessage()];
                }
            }
        } finally {
            self::done($db, 'tick');
        }
        return $out;
    }
}
