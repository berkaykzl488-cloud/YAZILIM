<?php
/**
 * Para çekirdeği (PLAN §3.4, §3.5 — P2): çift taraflı defter (accounts/journal/postings), bakiye yüklemeleri, kuponlar,
 * ödeme yöntemleri, havale hesapları, kripto ağları, puan geçmişi, havuzlu siparişler.
 * Para: BIGINT kuruş. Zamanlar: BIGINT unix ms. Kurulu sitede eksik tablolar ilk istekte otomatik eklenir (YP\Updater).
 *
 * Defter işaret kuralı: bir hesabın bakiyesi = postings.amount toplamı. Üye nakit/kredi, havuz ve gelir hesapları artı,
 * ödeme kuruluşu (GW:*), gider (EXP:*) ve düzeltme (ADJ) hesapları eksi bakiye biriktirir. Her journal'ın toplamı 0'dır.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'accounts' => [
        // code: U<id>:cash | U<id>:credit | ESCROW:ORD | REV:commission|doping|hizmet | GW:<yöntem> | EXP:bonus|points|referral | ADJ
        'cols'   => ['id' => 'pk', 'code' => 'str:60', 'type' => 'enum:user_cash,user_credit,escrow,revenue,gateway,payable,tax,expense,equity',
                     'user_id' => 'ref?', 'created_at' => 'bigint=0'],
        'unique' => [['code']],
        'index'  => [['user_id'], ['type']],
    ],
    'journal' => [
        // user_id/amount: yönetim defterinde (S.ledger) gösterilen üye ve tutar (u, a); meta: m, ref, fee, net, cat, w … (JSON)
        'cols'   => ['id' => 'pk', 'kind' => 'str:30', 'ref_type' => 'str:20=', 'ref_id' => 'str:40=', 'user_id' => 'ref?', 'amount' => 'bigint=0',
                     'actor_id' => 'ref?', 'memo' => 'str:255=', 'meta' => 'text?', 'idem' => 'str:120?', 't' => 'bigint'],
        'unique' => [['idem']],
        'index'  => [['kind', 't'], ['user_id', 't'], ['ref_type', 'ref_id'], ['t']],
    ],
    'postings' => [
        // label: üyenin hesap hareketlerinde (S.tx) görünen metin. user_id: üye hesabıysa (hızlı S.tx sorgusu)
        'cols'  => ['id' => 'pk', 'journal_id' => 'ref', 'account_id' => 'ref', 'user_id' => 'ref?', 'amount' => 'bigint', 'label' => 'str:255=', 't' => 'bigint'],
        'index' => [['account_id', 'id'], ['user_id', 'journal_id'], ['journal_id']],
        'fk'    => ['journal_id' => ['journal', 'id', 'RESTRICT'], 'account_id' => ['accounts', 'id', 'RESTRICT']],
    ],
    'gateways' => [
        // Gizli anahtar yok (PayTR sırları api/data şifreli deposunda, Entegrasyonlar sayfasından). cat: kart|eft|cuzdan (eft → çekilebilir)
        'cols' => ['id' => 'str:20', 'n' => 'str:60', 't' => 'str:120=', 'fee_bp' => 'int=0', 'is_on' => 'tinyint=1', 'manual' => 'tinyint=0',
                   'cat' => 'enum:kart,eft,cuzdan=kart', 'sort' => 'int=0', 'updated_at' => 'bigint=0'],
        'pk'   => ['id'],
    ],
    'banks' => [
        'cols'  => ['id' => 'pk', 'b' => 'str:60', 'n' => 'str:120', 'iban' => 'str:60', 'sort' => 'int=0', 'created_at' => 'bigint=0'],
        'index' => [['sort']],
    ],
    'crypto_nets' => [
        'cols' => ['id' => 'pk', 'coin' => 'str:20', 'net' => 'str:60', 'addr' => 'str:200', 'note' => 'str:200=', 'is_on' => 'tinyint=1', 'sort' => 'int=0', 'created_at' => 'bigint=0'],
    ],
    'coupons' => [
        // pct_bp: yüzde × 100 (5 → 500); max: kuruş
        'cols'   => ['id' => 'pk', 'code' => 'str:40', 'pct_bp' => 'int', 'max' => 'bigint', 'is_on' => 'tinyint=1', 'uses' => 'int=0',
                     'created_by' => 'ref?', 'created_at' => 'bigint', 'deleted_at' => 'bigint?'],
        'unique' => [['code']],
    ],
    'coupon_uses' => [
        // Üye başına tek kullanım (birincil anahtar). reserved: bekleyen yüklemede ayrıldı; used: yükleme başarılı
        'cols'  => ['coupon_id' => 'ref', 'user_id' => 'ref', 'deposit_id' => 'ref', 'status' => 'enum:reserved,used=reserved', 't' => 'bigint'],
        'pk'    => ['coupon_id', 'user_id'],
        'index' => [['deposit_id']],
        'fk'    => ['coupon_id' => ['coupons', 'id', 'CASCADE'], 'user_id' => ['users', 'id', 'CASCADE']],
    ],
    'deposits' => [
        // amount: bakiyeye geçecek tutar (hizmet bedeli hariç); fee: hizmet bedeli; expected: PayTR'dan beklenen payment_amount (amount+fee)
        'cols' => [
            'id' => 'pk', 'user_id' => 'ref', 'gw' => 'str:20', 'cat' => 'str:10', 'amount' => 'bigint', 'fee' => 'bigint=0', 'bonus' => 'bigint=0',
            'coupon_id' => 'ref?', 'withdrawable' => 'tinyint=0',
            'status' => 'enum:bekliyor,onaylandı,reddedildi,basarisiz,suresi_doldu=bekliyor',
            'merchant_oid' => 'str:64?', 'expected' => 'bigint=0', 'paytr_total' => 'bigint?', 'paytr_payment' => 'bigint?', 'test_mode' => 'tinyint=0',
            'bank' => 'str:60=', 'crypto_net_id' => 'ref?', 'net_label' => 'str:90=', 'addr' => 'str:200=', 'txid' => 'str:160=', 'tx_at' => 'bigint?',
            'note' => 'str:255=', 'receipt_media_id' => 'ref?', 'callbacks' => 'int=0', 'paytr_token' => 'str:255?', 'reason' => 'str:255=', 'journal_id' => 'ref?',
            'created_at' => 'bigint', 'decided_at' => 'bigint?', 'decided_by' => 'ref?',
        ],
        'unique' => [['merchant_oid']],
        'index'  => [['status', 'created_at'], ['user_id', 'id']],
        'fk'     => ['user_id' => ['users', 'id', 'RESTRICT']],
    ],
    'points_log' => [
        'cols'  => ['id' => 'pk', 'user_id' => 'ref', 'delta' => 'int', 'reason' => 'str:40', 'ref' => 'str:40=', 't' => 'bigint'],
        'index' => [['user_id', 'id']],
        'fk'    => ['user_id' => ['users', 'id', 'CASCADE']],
    ],
    'orders' => [
        // rate_bp: satıcının komisyon oranı × 100, siparişte dondurulur (ön yüzdeki rateFor). fee/net tamamlanınca yazılır.
        'cols' => [
            'id' => 'pk', 'listing_id' => 'ref', 'title' => 'str:120', 'cat' => 'str:20=', 'del_txt' => 'str:30=',
            'buyer_id' => 'ref', 'seller_id' => 'ref', 'qty' => 'int=1', 'price' => 'bigint', 'total' => 'bigint',
            'paid_cash' => 'bigint=0', 'paid_credit' => 'bigint=0', 'rate_bp' => 'int=0', 'fee' => 'bigint?', 'net' => 'bigint?',
            'status' => 'enum:odendi,teslim,itiraz,tamam,iade=odendi',
            'info' => 'str:255=', 'ch' => 'str:4=', 'place' => 'str:60=', 'note' => 'str:500=',
            'ready_at' => 'bigint?', 'delivered_at' => 'bigint?', 'confirmed_at' => 'bigint?', 'warned_at' => 'bigint?', 'refunded_at' => 'bigint?',
            'reason' => 'str:600?', 'disputed_by' => 'ref?', 'disputed_at' => 'bigint?', 'resolved_by' => 'ref?',
            'stars' => 'tinyint?', 'pts' => 'int=0', 'created_at' => 'bigint', 'updated_at' => 'bigint',
        ],
        'index' => [['buyer_id', 'created_at'], ['seller_id', 'created_at'], ['status', 'delivered_at'], ['listing_id'], ['status', 'created_at']],
        'fk'    => ['listing_id' => ['listings', 'id', 'RESTRICT'], 'buyer_id' => ['users', 'id', 'RESTRICT'], 'seller_id' => ['users', 'id', 'RESTRICT']],
    ],
    'order_events' => [
        // o.log
        'cols'  => ['id' => 'pk', 'order_id' => 'ref', 'actor_id' => 'ref?', 'x' => 'text', 't' => 'bigint'],
        'index' => [['order_id', 'id']],
        'fk'    => ['order_id' => ['orders', 'id', 'CASCADE']],
    ],
    'order_messages' => [
        // o.chat
        'cols'  => ['id' => 'pk', 'order_id' => 'ref', 'from_id' => 'ref?', 'x' => 'text', 'flagged' => 'tinyint=0', 't' => 'bigint'],
        'index' => [['order_id', 'id']],
        'fk'    => ['order_id' => ['orders', 'id', 'CASCADE']],
    ],
    'order_proofs' => [
        // Teslim kanıtları (yalnız yönetim ve satıcı görür) ve itiraz kanıtı. Saklama süresi: site.proofDays (varsayılan 90 gün)
        'cols'  => ['order_id' => 'ref', 'grp' => 'enum:dpre,dpost,dvid,dispute', 'media_id' => 'ref', 'pos' => 'int=0'],
        'pk'    => ['order_id', 'grp', 'pos'],
        'index' => [['media_id']],
        'fk'    => ['order_id' => ['orders', 'id', 'CASCADE'], 'media_id' => ['media', 'id', 'CASCADE']],
    ],
];
