<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** audit_log: çalışan işlemleri, girişler, 2FA olayları, gizli veri gösterimleri. Veri yp_redact'ten geçer. */
final class Audit
{
    public static function log(Db $db, $actorId, $action, $entity = '', $entityId = '', array $data = [], $ip = null)
    {
        try {
            $db->insert('audit_log', [
                'actor_id' => $actorId ? (int)$actorId : null, 'action' => yp_str($action, 60), 'entity' => yp_str($entity, 40),
                'entity_id' => yp_str((string)$entityId, 64), 'ip' => $ip !== null ? $ip : yp_client_ip(),
                'data' => $data ? json_encode(yp_redact($data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                't' => yp_now_ms(),
            ]);
        } catch (\Throwable $e) {
            Log::write('hata', 'audit yazılamadı: ' . $e->getMessage());
        }
    }
}
