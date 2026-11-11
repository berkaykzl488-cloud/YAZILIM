<?php
/**
 * P1: varsayılan server listesi (16 Metin2 TR resmi + PVP serverları; app/seed/servers.php, demo verisinden üretilir).
 * Yalnız servers tablosu BOŞSA yazar (yönetim panelinden eklenen/silinen serverlara dokunmaz). İlan vb. demo verisi YOKTUR.
 * Kurulu sitede yeni paket yüklenince YP\Updater bunu otomatik ve bir kez çalıştırır.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Text;

return function (Db $db) {
    if ((int)$db->val('SELECT COUNT(*) FROM {servers}') > 0) {
        return;
    }
    $list = require YP_APP . '/seed/servers.php';
    $now = yp_now_ms();
    $used = [];
    foreach ($list as $i => $s) {
        $slug = Text::slug($s['name']);
        for ($k = 2; isset($used[$slug]); $k++) {
            $slug = Text::slug($s['name']) . '-' . $k;
        }
        $used[$slug] = 1;
        $db->insertIgnore('servers', [
            'sec' => $s['sec'], 'name' => $s['name'], 'slug' => $slug, 'type' => $s['type'], 'lv' => $s['lv'],
            'c1' => $s['c1'], 'c2' => $s['c2'], 'online' => 0, 'open_at' => null, 'descr' => $s['descr'], 'url' => $s['url'],
            'ep_on' => (int)$s['ep'], 'active' => 1, 'sort' => $i, 'added_at' => $now, 'updated_at' => $now, 'demo_id' => $s['demo_id'],
        ]);
    }
    // Varsayılan ayar: yeni ilanlar onaysız yayına girer (site.moderation=false; yönetim › İlanlar'dan açılır)
};
