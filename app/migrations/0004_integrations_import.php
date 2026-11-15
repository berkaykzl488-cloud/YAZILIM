<?php
/**
 * P3: Entegrasyonlar tek kaynak. Eski api/ paketinin (Yönetim › Entegrasyonlar eski sürümü, ayrı "API şifresi" girişli)
 * api/data/ayarlar.php deposunda PayTR / Paraşüt / Bizim Hesap bilgileri varsa, settings tablosuna (şifreli) bir kez aktarılır.
 * Burada zaten kayıt varsa dokunulmaz. Eski depo silinmez (api/data/ .htaccess ile kapalı).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Integrations;

return function (Db $db) {
    Integrations::importLegacy($db);
};
