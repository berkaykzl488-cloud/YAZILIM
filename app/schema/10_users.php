<?php
/** Üyeler ve kimlik doğrulama (PLAN §3.2). Para: BIGINT kuruş. */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'users' => [
        'cols' => [
            'id' => 'pk',
            'name' => 'str:40', 'name_norm' => 'str:40',          // name_norm: TR katlanmış küçük harf (benzersiz)
            'email' => 'str:190?', 'tel' => 'str:20=', 'ad' => 'str:60=', 'soyad' => 'str:60=',
            'pass_hash' => 'str:255',
            'role' => 'enum:member,staff,admin=member', 'perms' => 'text?', 'status' => 'enum:active,banned=active',
            'verified' => 'tinyint=0',
            'rating' => 'dec:4,2=5', 'rating_n' => 'int=0', 'sales' => 'int=0', 'vol' => 'bigint=0', 'pts' => 'int=0',
            'joined_at' => 'bigint', 'last_seen' => 'bigint=0',
            'tfa' => 'enum:,sms,mail=',
            'ref_by' => 'ref?', 'ref_code' => 'str:40?', 'ref_paid' => 'tinyint=0', 'refs' => 'int=0', 'src' => 'str:60?',
            'tc_ok' => 'tinyint=0', 'tc_enc' => 'text?', 'tc_hash' => 'char:64?', 'tc_mask' => 'str:20?', 'tc_year' => 'int?',
            'tc_by' => 'ref?', 'tc_at' => 'bigint?', 'tc_tries' => 'int=0', 'tc_lock_until' => 'bigint?', 'tc_ask_at' => 'bigint?',
            'session_ver' => 'int=1', 'created_at' => 'bigint',
        ],
        'unique' => [['name_norm'], ['email'], ['tc_hash']],
        'index'  => [['role'], ['last_seen'], ['ref_code']],
        'fk'     => ['ref_by' => ['users', 'id', 'SET NULL']],
    ],
    'wallets' => [
        // cash = çekilebilir (UI: bal), credit = yalnız alışveriş (UI: bonus)
        'cols' => ['user_id' => 'ref', 'cash' => 'bigint=0', 'credit' => 'bigint=0', 'updated_at' => 'bigint=0'],
        'pk'   => ['user_id'],
        'fk'   => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
    'user_ibans' => [
        'cols'  => ['id' => 'pk', 'user_id' => 'ref', 'bank' => 'str:60=', 'holder' => 'str:80=', 'iban_enc' => 'text',
                    'iban_last4' => 'char:4', 'iban_hash' => 'char:64', 'created_at' => 'bigint'],
        'index' => [['user_id']],
        'unique' => [['user_id', 'iban_hash']],
        'fk'    => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
    'auth_challenges' => [
        'cols'  => ['id' => 'pk', 'user_id' => 'ref', 'purpose' => 'enum:login,enable,disable,withdraw', 'channel' => 'enum:mail,sms',
                    'code_hash' => 'char:64', 'expires_at' => 'bigint', 'tries' => 'int=0', 'sends' => 'int=1', 'sent_at' => 'bigint',
                    'consumed_at' => 'bigint?', 'created_at' => 'bigint', 'ip' => 'str:45='],
        'index' => [['user_id', 'purpose'], ['expires_at']],
        'fk'    => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
    'notifications' => [
        // is_read: PLAN'daki "read" (MySQL'de ayrılmış sözcük); sunucu çıktısında "read" adıyla verilir
        'cols'  => ['id' => 'pk', 'user_id' => 'ref', 'x' => 'text', 'link' => 'str:255=', 'ev' => 'str:40=', 'is_read' => 'tinyint=0', 't' => 'bigint'],
        'index' => [['user_id', 'id'], ['user_id', 'is_read']],
        'fk'    => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
];
