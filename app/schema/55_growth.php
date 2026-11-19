<?php
/**
 * Reklam, kampanya ve büyüme (PLAN §3.7 — P5). Para: BIGINT kuruş. Zamanlar: BIGINT unix ms.
 * Kurulu sitede bu tablolar ilk istekte otomatik eklenir (YP\Updater); mevcut veriye dokunulmaz.
 *
 *   ads            satılan reklam alanları. Ücret satın almada üyenin nakit/kredisinden ESCROW:ADS hesabına alınır;
 *                  yönetici onaylayınca ESCROW:ADS → REV:ads (gelir onayda tanınır), reddedilirse aynı kovalara iade.
 *                  status: onay (bekliyor) | onayli | red. new_srv: listede olmayan server bilgisi (JSON; onayda servers satırı açılır).
 *   ad_slots       reklam türü başına kilit satırı: takvim doluluğu bu satır FOR UPDATE ile kilitlenip yeniden denetlenir
 *                  (aynı alana eşzamanlı iki rezervasyondan yalnız biri kazanır).
 *   ad_media       reklam görselleri / videoları (media.kind='ad'), dönüşümlü gösterim sırası.
 *   ad_stats       günlük gösterim / tıklama (gün: Europe/Istanbul, Y-m-d).
 *   slides         site görselleri (ana sayfa slider'ı, sponsorlu reklamlardan önce).
 *   raffles        çekilişler. per: kaç kuruş alışverişe 1 bilet; cats: JSON (boş = tüm harcamalar); min_vip: VIP seviye kimliği.
 *                  draw_meta: çekiliş anındaki bilet anlık görüntüsü + tohum (seed) + algoritma → sonuç yeniden üretilebilir.
 *   raffle_tickets üye başına bilet sayısı (n) ve bir sonraki bilete biriken harcama (acc, kuruş).
 *   raffle_free    günlük ücretsiz bilet: (çekiliş, üye, gün, kuşak) benzersiz. gen: yönetimin "hakları yenile" kuşağı.
 *   spins          şans çarkı: (üye, gün, kuşak) benzersiz → günde bir çevirme sunucuda zorunlu.
 *   winback        geri kazanım kampanyaları (outbox üzerinden, saatlik sınıra uyarak gönderilir).
 *   mkt_optout     üyenin kampanya e-postası / SMS'i almama tercihi (winback buna uyar).
 *   ref_flags      davet kötüye kullanım şüphesi (aynı IP vb.): engellemez, yönetime işaretler.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'ads' => [
        'cols' => [
            'id' => 'pk', 'owner_id' => 'ref?', 'type' => 'str:20', 'server_id' => 'ref?', 'new_srv' => 'text?',
            'title' => 'str:80=', 'text' => 'str:200=', 'btn' => 'str:40=', 'link' => 'str:255=', 'c1' => 'str:9=', 'c2' => 'str:9=',
            'start_at' => 'bigint', 'until_at' => 'bigint', 'days' => 'int=1', 'active' => 'tinyint=1',
            'status' => 'enum:onay,onayli,red=onay', 'reason' => 'str:255=',
            'price' => 'bigint=0', 'paid_cash' => 'bigint=0', 'paid_credit' => 'bigint=0', 'free' => 'tinyint=0',
            'ok_at' => 'bigint?', 'ok_by' => 'ref?', 'views' => 'bigint=0', 'clicks' => 'bigint=0',
            'journal_id' => 'ref?', 'created_at' => 'bigint', 'updated_at' => 'bigint=0',
        ],
        'index' => [['type', 'status', 'start_at', 'until_at'], ['owner_id', 'id'], ['status', 'created_at']],
    ],
    'ad_slots' => [
        'cols' => ['type' => 'str:20', 'cap' => 'int=1', 'updated_at' => 'bigint=0'],
        'pk'   => ['type'],
    ],
    'ad_media' => [
        'cols'  => ['ad_id' => 'ref', 'media_id' => 'ref', 'pos' => 'int=0'],
        'pk'    => ['ad_id', 'pos'],
        'index' => [['media_id']],
        'fk'    => ['ad_id' => ['ads', 'id', 'CASCADE'], 'media_id' => ['media', 'id', 'CASCADE']],
    ],
    'ad_stats' => [
        'cols' => ['ad_id' => 'ref', 'day' => 'char:10', 'imp' => 'int=0', 'clk' => 'int=0'],
        'pk'   => ['ad_id', 'day'],
        'fk'   => ['ad_id' => ['ads', 'id', 'CASCADE']],
    ],
    'slides' => [
        'cols' => ['id' => 'pk', 'is_on' => 'tinyint=1', 'title' => 'str:80=', 'text' => 'str:200=', 'link' => 'str:255=', 'btn' => 'str:40=',
                   'c1' => 'str:9=', 'c2' => 'str:9=', 'sort' => 'int=0', 'created_by' => 'ref?', 'created_at' => 'bigint', 'updated_at' => 'bigint=0'],
        'index' => [['is_on', 'sort']],
    ],
    'slide_media' => [
        'cols'  => ['slide_id' => 'ref', 'media_id' => 'ref', 'pos' => 'int=0'],
        'pk'    => ['slide_id', 'pos'],
        'index' => [['media_id']],
        'fk'    => ['slide_id' => ['slides', 'id', 'CASCADE'], 'media_id' => ['media', 'id', 'CASCADE']],
    ],
    'raffles' => [
        'cols' => [
            'id' => 'pk', 'title' => 'str:120', 'kind' => 'enum:bal,item=bal', 'value' => 'bigint=0', 'end_at' => 'bigint',
            'c1' => 'str:9=', 'c2' => 'str:9=', 'w' => 'str:20=', 'per' => 'bigint=10000', 'cats' => 'text?', 'min_vip' => 'str:20=',
            'max_tk' => 'int=0', 'free' => 'tinyint=1', 'winner_id' => 'ref?', 'drawn_at' => 'bigint?', 'drawn_by' => 'ref?',
            'draw_meta' => 'mediumtext?', 'journal_id' => 'ref?', 'created_by' => 'ref?', 'created_at' => 'bigint', 'deleted_at' => 'bigint?',
        ],
        'index' => [['deleted_at', 'end_at'], ['winner_id']],
    ],
    'raffle_tickets' => [
        'cols'  => ['raffle_id' => 'ref', 'user_id' => 'ref', 'n' => 'int=0', 'acc' => 'bigint=0', 'updated_at' => 'bigint=0'],
        'pk'    => ['raffle_id', 'user_id'],
        'index' => [['user_id']],
        'fk'    => ['raffle_id' => ['raffles', 'id', 'CASCADE'], 'user_id' => ['users', 'id', 'CASCADE']],
    ],
    'raffle_free' => [
        'cols'  => ['raffle_id' => 'ref', 'user_id' => 'ref', 'day' => 'char:10', 'gen' => 'int=0', 't' => 'bigint'],
        'pk'    => ['raffle_id', 'user_id', 'day', 'gen'],
        'fk'    => ['raffle_id' => ['raffles', 'id', 'CASCADE'], 'user_id' => ['users', 'id', 'CASCADE']],
    ],
    'spins' => [
        // k: bal | pt | tk; v: bal için kuruş, pt için puan, tk için bilet
        'cols'  => ['user_id' => 'ref', 'day' => 'char:10', 'gen' => 'int=0', 'prize' => 'str:40=', 'k' => 'str:4=', 'v' => 'bigint=0',
                    'idx' => 'int=0', 'journal_id' => 'ref?', 't' => 'bigint'],
        'pk'    => ['user_id', 'day', 'gen'],
        'index' => [['day']],
        'fk'    => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
    'winback' => [
        'cols' => ['id' => 'pk', 't' => 'bigint', 'by_id' => 'ref?', 'tpl' => 'text', 'user_ids' => 'text', 'n' => 'int=0', 'coupon_code' => 'str:40=',
                   'gift' => 'bigint=0', 'ch_mail' => 'tinyint=0', 'ch_sms' => 'tinyint=0', 'ch_ntf' => 'tinyint=1',
                   'mail_q' => 'int=0', 'sms_q' => 'int=0', 'skipped' => 'int=0', 'days' => 'int=30'],
        'index' => [['t']],
    ],
    'mkt_optout' => [
        'cols' => ['user_id' => 'ref', 'mail' => 'tinyint=0', 'sms' => 'tinyint=0', 't' => 'bigint'],
        'pk'   => ['user_id'],
        'fk'   => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
    'ref_flags' => [
        'cols'  => ['id' => 'pk', 'referrer_id' => 'ref', 'referred_id' => 'ref', 'reason' => 'str:60', 'ip' => 'str:45=', 'paid' => 'tinyint=0',
                    'seen' => 'tinyint=0', 'seen_by' => 'ref?', 't' => 'bigint'],
        'unique' => [['referred_id', 'reason']],
        'index' => [['seen', 't'], ['referrer_id']],
    ],
];
