<?php
/** Çekirdek: boot, poll, cron (PLAN §4 P0) */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Cron;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Perm;
use YP\PermMap;
use YP\Present;
use YP\RateLimit;
use YP\Settings;
use YP\Store;

return function (Router $r) {
    // Sayfa açılışında gereken her şey: CSRF, sunucu saati, herkese açık ayarlar, oturumdaki üye, bildirimler.
    $r->get('boot', function (Req $q, Db $db) {
        $u = Auth::$user;
        $data = [
            'csrf' => Auth::csrf(),
            'now'  => yp_now_ms(),
            'set'  => Settings::publicSet($db),
            'me'   => $u ? Present::me($db, $u) : null,
            'cur'  => $u ? 'u' . (int)$u['id'] : null,
            'notifs' => [],
            'unread' => ['n' => 0],
        ];
        if ($u) {
            $rows = $db->all('SELECT * FROM {notifications} WHERE user_id=? ORDER BY id DESC LIMIT 50', [(int)$u['id']]);
            $data['notifs'] = array_map([Present::class, 'notif'], $rows);
            $data['unread']['n'] = (int)$db->val('SELECT COUNT(*) FROM {notifications} WHERE user_id=? AND is_read=0', [(int)$u['id']]);
            if (Perm::isStaff($u)) {
                $data['permLabels'] = PermMap::PERMS;
                $data['permGroups'] = PermMap::GROUPS;
            }
        }
        return ['data' => $data];
    }, ['auth' => 'none', 'csrf' => false]);

    // Kısa yoklama: ?n=<son bildirim no> → yeni bildirimler + okunmamış sayısı
    $r->get('poll', function (Req $q, Db $db) {
        $u = Auth::$user;
        $after = 0;
        $n = $q->q('n');
        if ($n !== '' && preg_match('/^n?([0-9]{1,18})$/', $n, $m)) {
            $after = (int)$m[1];
        }
        $rows = $db->all('SELECT * FROM {notifications} WHERE user_id=? AND id>? ORDER BY id DESC LIMIT 50', [(int)$u['id'], $after]);
        return ['data' => [
            'now'    => yp_now_ms(),
            'notifs' => array_map([Present::class, 'notif'], $rows),
            'unread' => ['n' => (int)$db->val('SELECT COUNT(*) FROM {notifications} WHERE user_id=? AND is_read=0', [(int)$u['id']])],
        ]];
    }, ['auth' => 'user', 'csrf' => false]);

    // cron-job.org gibi dış zamanlayıcılar için: /api/v1/cron?key=…
    $r->get('cron', function (Req $q, Db $db) {
        RateLimit::enforce('cron_ip:' . $q->ip, 30, 600);
        $app = Store::app();
        $key = $q->q('key');
        if ($key === '' || empty($app['cron_key']) || !hash_equals((string)$app['cron_key'], $key)) {
            throw new HttpError(403, 'Cron anahtarı hatalı.', 'bad_key');
        }
        return ['data' => Cron::run($db, 25, 'url')];
    }, ['auth' => 'none', 'csrf' => false]);
};
