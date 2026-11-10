<?php
/**
 * YALNIZ TEST: YP_TEST=1 ortam değişkeni VE SQLite veritabanı birlikte varsa yüklenir. Canlı sitede (MySQL) asla etkin değildir.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Http\Req;
use YP\Http\Router;

return function (Router $r) {
    if (!yp_test_mode() || !Db::hasMain() || Db::main()->dialect !== 'sqlite') {
        return;
    }
    // e-posta/SMS kuyruğundaki son iletiler (doğrulama kodunu okumak için)
    $r->get('_test/outbox', function (Req $q, Db $db) {
        $rows = $db->all('SELECT id, channel, to_addr, ev, subject, body, priority, status, last_error FROM {outbox} WHERE to_addr=? ORDER BY id DESC LIMIT 20', [$q->q('to')]);
        return ['data' => ['rows' => $rows]];
    }, ['auth' => 'none', 'csrf' => false]);
};
