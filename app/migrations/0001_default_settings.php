<?php
/** Varsayılan site ayarlarını yazar (varsa dokunmaz). */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Settings;

return function (Db $db) {
    $d = Settings::defaults();
    foreach (['site', 'demo_mode'] as $k) {
        $db->insertIgnore('settings', ['k' => $k, 'v' => json_encode($d[$k], JSON_UNESCAPED_UNICODE), 'secret' => 0, 'updated_at' => yp_now_ms()]);
    }
};
