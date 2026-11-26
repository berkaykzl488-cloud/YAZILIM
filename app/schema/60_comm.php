<?php
/**
 * İletişim (PLAN §3.8 — P6): canlı destek talepleri, üyeden üyeye mesajlar, şifre sıfırlama.
 * Kurulu sitede bu tablolar ilk istekte otomatik eklenir (YP\Updater); mevcut veriye dokunulmaz. Zamanlar BIGINT unix ms.
 *
 *   tickets          canlı destek talebi (üye başına aynı anda bir açık talep). status: acik (asistan ya da temsilciyle görüşülüyor) |
 *                    bekliyor (temsilci sırasında) | kapandi. unread_u: üyenin okumadığı temsilci/asistan iletisi; unread_s: temsilcinin
 *                    okumadığı üye iletisi. rated: değerlendirme yapıldı ya da atlandı (yeni talep açılabilir).
 *   ticket_messages  f: u (üye) | b (asistan, kural tabanlı) | a (temsilci) | s (sistem) | n (iç not; üye görmez). order_ref: 'S100004' /
 *                    'B1001'. media_id: üyenin eklediği ekran görüntüsü (media.kind='support', özel; yalnız sahibi ve [destek] görür).
 *   dm_threads       iki üye arasındaki konuşma; a_id < b_id. a_read/b_read: o tarafın okuduğu son ileti no'su.
 *   dm_messages      x: sansürlenmiş metin (telefon, link, site dışı iletişim [gizlendi]); flagged: sansür uygulandı (orijinal metin
 *                    yalnız flagged tablosunda, [mesaj] yetkilisine).
 *   password_resets  "Şifremi unuttum": token ve 6 haneli kod yalnız özet (HMAC) olarak saklanır; 30 dk geçerli, tek kullanımlık.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'tickets' => [
        'cols' => [
            'id' => 'pk', 'user_id' => 'ref', 'status' => 'enum:acik,bekliyor,kapandi=acik', 'agent_id' => 'ref?',
            'rating' => 'tinyint=0', 'rated' => 'tinyint=0', 'unread_u' => 'int=0', 'unread_s' => 'int=0',
            'queued_at' => 'bigint?', 'created_at' => 'bigint', 'closed_at' => 'bigint?', 'closed_by' => 'ref?', 'last_at' => 'bigint=0',
        ],
        'index' => [['user_id', 'id'], ['status', 'last_at'], ['agent_id']],
        'fk'    => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
    'ticket_messages' => [
        'cols'  => ['id' => 'pk', 'ticket_id' => 'ref', 'f' => 'enum:u,b,a,s,n', 'by_id' => 'ref?', 'x' => 'text', 'order_ref' => 'str:20=',
                    'media_id' => 'ref?', 'flagged' => 'tinyint=0', 't' => 'bigint'],
        'index' => [['ticket_id', 'id']],
        'fk'    => ['ticket_id' => ['tickets', 'id', 'CASCADE']],
    ],
    'dm_threads' => [
        'cols'   => ['id' => 'pk', 'a_id' => 'ref', 'b_id' => 'ref', 'last_id' => 'bigint=0', 'last_at' => 'bigint=0',
                     'a_read' => 'bigint=0', 'b_read' => 'bigint=0', 'created_at' => 'bigint'],
        'unique' => [['a_id', 'b_id']],
        'index'  => [['a_id', 'last_at'], ['b_id', 'last_at']],
        'fk'     => ['a_id' => ['users', 'id', 'CASCADE'], 'b_id' => ['users', 'id', 'CASCADE']],
    ],
    'dm_messages' => [
        'cols'  => ['id' => 'pk', 'thread_id' => 'ref', 'from_id' => 'ref', 'x' => 'text', 'flagged' => 'tinyint=0', 'listing_id' => 'ref?', 't' => 'bigint'],
        'index' => [['thread_id', 'id']],
        'fk'    => ['thread_id' => ['dm_threads', 'id', 'CASCADE']],
    ],
    'password_resets' => [
        'cols'   => ['id' => 'pk', 'user_id' => 'ref', 'token_hash' => 'char:64', 'code_hash' => 'char:64', 'channel' => 'enum:mail,sms',
                     'expires_at' => 'bigint', 'used_at' => 'bigint?', 'tries' => 'int=0', 'ip' => 'str:45=', 'created_at' => 'bigint'],
        'unique' => [['token_hash']],
        'index'  => [['user_id', 'created_at'], ['expires_at']],
        'fk'     => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
];
