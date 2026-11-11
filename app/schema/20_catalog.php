<?php
/**
 * Katalog (PLAN §3.3, P1): serverlar, ilanlar, medya, ilan görselleri, hazır ilan görselleri; engellenen mesajlar (§3.8).
 * Para: BIGINT kuruş. Zamanlar: BIGINT unix ms. Kurulu sitede eksik tablolar açılışta otomatik eklenir (YP\Updater).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'servers' => [
        'cols' => [
            'id' => 'pk', 'sec' => 'enum:tr,pvp', 'name' => 'str:60', 'slug' => 'str:90',
            'type' => 'str:30=', 'lv' => 'str:20=', 'c1' => 'char:7=#444444', 'c2' => 'char:7=#888888',
            'online' => 'int=0', 'open_at' => 'bigint?', 'descr' => 'text?', 'seo' => 'text?', 'url' => 'str:255=',
            'ep_on' => 'tinyint=0', 'partner_url' => 'str:255?', 'partner_at' => 'bigint?', 'logo_media_id' => 'ref?',
            'active' => 'tinyint=1', 'sort' => 'int=0', 'added_at' => 'bigint', 'updated_at' => 'bigint=0',
            'deleted_at' => 'bigint?', 'demo_id' => 'str:12?',
        ],
        'unique' => [['slug']],
        'index'  => [['sec', 'sort'], ['active', 'sec']],
    ],
    'listings' => [
        'cols' => [
            'id' => 'pk', 'no' => 'bigint?', 'seller_id' => 'ref', 'game' => 'enum:metin2,cs2,diger=metin2', 'server_id' => 'ref?',
            'sec' => 'enum:tr,pvp?', 'cat' => 'str:20', 'sub' => 'str:40=',
            'title' => 'str:120', 'title_norm' => 'str:190', 'price' => 'bigint', 'stock' => 'int=1', 'del_txt' => 'str:30=', 'descr' => 'text?',
            'status' => 'enum:aktif,beklemede,satildi,kaldirildi=aktif', 'cover' => 'str:20=', 'skin' => 'text?', 'views' => 'int=0',
            'bump_at' => 'bigint', 'free_bump_at' => 'bigint=0', 'dop_vitrin' => 'bigint=0', 'dop_acil' => 'bigint=0', 'dop_renk' => 'bigint=0',
            'removed_by' => 'ref?', 'removed_reason' => 'str:200?', 'approved_by' => 'ref?',
            'created_at' => 'bigint', 'updated_at' => 'bigint',
        ],
        'unique' => [['no']],
        'index'  => [['status', 'server_id', 'cat', 'bump_at'], ['status', 'sec', 'cat'], ['seller_id', 'status'], ['status', 'bump_at'], ['status', 'price']],
        'fk'     => ['seller_id' => ['users', 'id', 'RESTRICT'], 'server_id' => ['servers', 'id', 'SET NULL']],
    ],
    'media' => [
        // vis=public → uploads/Y/m/<rastgele>.<uzantı> (doğrudan sunulur); private → storage/media/… (api/v1 media/{id} ile, yetki denetimli)
        'cols' => [
            'id' => 'pk', 'owner_id' => 'ref?', 'kind' => 'str:20', 'vis' => 'enum:public,private', 'path' => 'str:255',
            'mime' => 'str:60', 'bytes' => 'bigint=0', 'w' => 'int=0', 'h' => 'int=0', 'sha256' => 'char:64=',
            'orig_name' => 'str:120=', 'ref_type' => 'str:20=', 'ref_id' => 'bigint?', 'created_at' => 'bigint',
        ],
        'index' => [['owner_id', 'created_at'], ['ref_type', 'ref_id'], ['created_at']],
        'fk'    => ['owner_id' => ['users', 'id', 'SET NULL']],
    ],
    'listing_media' => [
        'cols'  => ['listing_id' => 'ref', 'media_id' => 'ref', 'pos' => 'int=0'],
        'pk'    => ['listing_id', 'pos'],
        'index' => [['media_id']],
        'fk'    => ['listing_id' => ['listings', 'id', 'CASCADE'], 'media_id' => ['media', 'id', 'CASCADE']],
    ],
    'covers' => [
        // k: 'yang-1' … 'ep-10' (ön yüzdeki COVER_CATS × COVER_N)
        'cols' => ['k' => 'str:20', 'media_id' => 'ref', 'updated_at' => 'bigint=0', 'updated_by' => 'ref?'],
        'pk'   => ['k'],
        'fk'   => ['media_id' => ['media', 'id', 'CASCADE']],
    ],
    'flagged' => [
        // Sansürlenen iletişim bilgisi denemeleri (ilan başlığı/açıklaması; P6'da mesajlar da). Yönetim › Engellenen mesajlar [mesaj]
        'cols'  => ['id' => 'pk', 'user_id' => 'ref?', 'ctx' => 'str:120=', 'orig' => 'text', 'seen' => 'tinyint=0', 't' => 'bigint'],
        'index' => [['seen', 'id'], ['user_id', 't']],
        'fk'    => ['user_id' => ['users', 'id', 'SET NULL']],
    ],
];
