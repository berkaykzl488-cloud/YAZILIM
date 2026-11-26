<?php
/**
 * İçerik ve pazarlama (PLAN §3.7 — P7). Zamanlar BIGINT unix ms. Kurulu sitede ilk istekte otomatik eklenir (YP\Updater).
 *
 *   posts         rehber yazıları. body: güvenli Markdown (HTML etiketleri kayıtta atılır; YP\Admin\Markdown).
 *                 status: taslak | yayinda. cover_id: media (kind=post, herkese açık). seo_title / seo_desc boşsa başlık / özet.
 *   pages         yönetimden düzenlenen kurumsal / yasal sayfalar (/sayfa/<k>): hakkimizda, iletisim, kvkk, mesafeli, iade, gizlilik.
 *                 body Markdown; [ŞİRKET UNVANI] gibi yer tutucular gösterimde settings.company'den doldurulur.
 *   backlinks     geri bağlantı takibi (st: aktif | kontrol | kayip; nf: nofollow).
 *   partner_apps  herkese açık ortaklık başvurusu (st: bekliyor | onay | red). ip_hash: kötüye kullanım takibi (ham IP saklanmaz).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'posts' => [
        'cols' => [
            'id' => 'pk', 'slug' => 'str:120', 'title' => 'str:120', 'excerpt' => 'str:300=', 'body' => 'mediumtext',
            'cover_id' => 'ref?', 'seo_title' => 'str:80=', 'seo_desc' => 'str:200=', 'status' => 'enum:taslak,yayinda=taslak',
            'author_id' => 'ref?', 'published_at' => 'bigint?', 'created_at' => 'bigint', 'updated_at' => 'bigint=0',
        ],
        'unique' => [['slug']],
        'index' => [['status', 'published_at']],
    ],
    'pages' => [
        'cols' => ['k' => 'str:40', 'title' => 'str:120', 'body' => 'mediumtext', 'updated_at' => 'bigint=0', 'updated_by' => 'ref?'],
        'pk' => ['k'],
    ],
    'backlinks' => [
        'cols' => [
            'id' => 'pk', 'url' => 'str:400', 'target' => 'str:200=', 'anchor' => 'str:120=', 'k' => 'str:20=diger', 'nf' => 'tinyint=0',
            'st' => 'enum:aktif,kontrol,kayip=kontrol', 'ck' => 'bigint?', 'app_id' => 'ref?', 'created_by' => 'ref?', 'created_at' => 'bigint',
        ],
        'index' => [['st', 'created_at']],
    ],
    'partner_apps' => [
        'cols' => [
            'id' => 'pk', 'tp' => 'enum:server,yayinci,site=site', 'n' => 'str:60', 's' => 'str:40=', 'u' => 'str:300', 'l' => 'str:300=',
            'c' => 'str:80', 'x' => 'str:200=', 'st' => 'enum:bekliyor,onay,red=bekliyor', 'ip_hash' => 'char:16=',
            'user_id' => 'ref?', 'by_id' => 'ref?', 'decided_at' => 'bigint?', 'created_at' => 'bigint',
        ],
        'index' => [['st', 'created_at']],
    ],
];
