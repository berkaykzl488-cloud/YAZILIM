<?php
/** Sistem tabloları (PLAN §3.1). Tablo adlarına yp_ öneki eklenir. Zamanlar BIGINT unix ms. */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'schema_migrations' => [
        'cols' => ['version' => 'str:120', 'applied_at' => 'bigint'],
        'pk'   => ['version'],
    ],
    'settings' => [
        // v: JSON. secret=1 ise v, yp_encrypt ile şifrelenmiş JSON'dur.
        'cols' => ['k' => 'str:64', 'v' => 'mediumtext', 'secret' => 'tinyint=0', 'updated_at' => 'bigint=0', 'updated_by' => 'ref?'],
        'pk'   => ['k'],
    ],
    'audit_log' => [
        'cols'  => ['id' => 'pk', 'actor_id' => 'ref?', 'action' => 'str:60', 'entity' => 'str:40=', 'entity_id' => 'str:64=',
                    'ip' => 'str:45=', 'data' => 'text?', 't' => 'bigint'],
        'index' => [['entity', 'entity_id'], ['actor_id', 't'], ['action', 't']],
    ],
    'idempotency_keys' => [
        'cols'  => ['user_id' => 'ref', 'ikey' => 'str:80', 'route' => 'str:120', 'http' => 'int=200', 'response' => 'mediumtext', 't' => 'bigint'],
        'pk'    => ['user_id', 'ikey'],
        'index' => [['t']],
    ],
    'cron_runs' => [
        'cols' => ['task' => 'str:40', 'last_start' => 'bigint=0', 'last_ok' => 'bigint=0', 'last_error' => 'str:255?',
                   'lock_until' => 'bigint=0', 'runs' => 'int=0'],
        'pk'   => ['task'],
    ],
    'backups' => [
        'cols' => ['id' => 'pk', 't' => 'bigint', 'kind' => 'str:20', 'by_id' => 'ref?', 'file' => 'str:255', 'bytes' => 'bigint=0', 'sha256' => 'char:64='],
        'index' => [['t']],
    ],
    'outbox' => [
        // priority 0 = doğrulama kodu (hemen ve bütçeden bağımsız gönderilir); 5 = olağan
        'cols'  => ['id' => 'pk', 'channel' => 'enum:mail,sms', 'user_id' => 'ref?', 'to_addr' => 'str:190', 'ev' => 'str:40=',
                    'subject' => 'str:255=', 'body' => 'text', 'priority' => 'tinyint=5',
                    'status' => 'enum:queued,sending,sent,failed=queued', 'tries' => 'int=0', 'next_at' => 'bigint=0',
                    'last_error' => 'str:255?', 'provider' => 'str:20?', 'provider_id' => 'str:120?', 'created_at' => 'bigint', 'sent_at' => 'bigint?'],
        'index' => [['status', 'priority', 'next_at'], ['channel', 'sent_at'], ['to_addr', 'id']],
    ],
];
