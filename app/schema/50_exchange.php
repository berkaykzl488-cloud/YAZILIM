<?php
/**
 * Yang Borsası ve EP mağazası (PLAN §3.6 — P4). Para: BIGINT kuruş. Zamanlar: BIGINT unix ms.
 * Kurulu sitede bu tablolar ilk istekte otomatik eklenir (YP\Updater); mevcut veriye dokunulmaz.
 *
 *   ex_markets        borsadaki server satırı (S.exchange): buy = siteden satın al fiyatı (alıcı bunu öder), max = satış emri tavanı,
 *                     margin_bp = otomatik eşleşmede satış emri fiyatına eklenen pay (NULL → genel ayar ex.exMargin)
 *   ex_fields         bilgi alanları (S.exFieldsBuy = fset 'buy', S.exFields = fset 'sell'); fkey ön yüz kimliği (b1, f2 …)
 *   ex_orders         alım siparişi. total alıcının ödediği (siparişte ESCROW:EX'e geçer), released = teslimle havuzdan çıkan
 *                     (satıcılara + REV:borsa). Açık siparişlerin (total − released) toplamı = ESCROW:EX bakiyesi (Ledger::check)
 *   ex_order_fields   alıcı bilgileri. Gizli alan değeri yalnız value_enc'te (yp_encrypt); iş bitince NULL
 *   ex_offers         satış emri (para tutmaz). left_qty = eşlenmemiş kalan
 *   ex_offer_fields   satıcı hesap bilgileri. Gizli (şifre) değerler value_enc'te; emir bitince / iptalde / 7 gün sonra (cron) NULL
 *   ex_fills          sipariş ↔ satış emri eşlemesi (qty, paid_qty = teslim edilip satıcıya ödenen, price = satıcı fiyatı, sell = alıcı fiyatı)
 *   ex_events         sipariş geçmişi (o.log)
 *   ep_products       EP paketi (server_id NULL = Metin2 TR EP)
 *   ep_codes          kod stoğu: code_enc (yp_encrypt), code_hash (HMAC, benzersiz — aynı kod iki kez eklenemez), code_tail (son 4)
 *   ep_orders         EP satışı: kod yalnız alıcıya gösterilir (yönetim görünümü maskeli, açma audit'e yazılır)
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'ex_markets' => [
        'cols'   => ['id' => 'pk', 'server_id' => 'ref', 'unit' => 'str:40=', 'buy' => 'bigint?', 'max' => 'bigint=0', 'margin_bp' => 'int?',
                     'is_on' => 'tinyint=0', 'sort' => 'int=0', 'created_at' => 'bigint=0', 'updated_at' => 'bigint=0'],
        'unique' => [['server_id']],
    ],
    'ex_fields' => [
        'cols'   => ['id' => 'pk', 'fset' => 'enum:buy,sell', 'fkey' => 'str:20', 'label' => 'str:120', 'type' => 'enum:text,password,number,select=text',
                     'opts' => 'str:500=', 'note' => 'str:255=', 'req' => 'tinyint=0', 'secret' => 'tinyint=0', 'pos' => 'int=0', 'updated_at' => 'bigint=0'],
        'unique' => [['fset', 'fkey']],
        'index'  => [['fset', 'pos']],
    ],
    'ex_orders' => [
        'cols' => [
            'id' => 'pk', 'user_id' => 'ref', 'dir' => 'str:4=al', 'market_id' => 'ref', 'server_id' => 'ref',
            'qty' => 'bigint', 'price' => 'bigint', 'total' => 'bigint', 'reserve' => 'bigint=0', 'paid_cash' => 'bigint=0', 'paid_credit' => 'bigint=0',
            'cost' => 'bigint=0', 'delivered' => 'bigint=0', 'released' => 'bigint=0', 'place' => 'str:160=',
            'status' => 'enum:bekliyor,islemde,bilgi,kismen,tamam,iptal=bekliyor', 'staff_id' => 'ref?', 'note' => 'str:500=',
            'called_at' => 'bigint?', 'call_msg' => 'str:500=', 'ready_at' => 'bigint?', 'created_at' => 'bigint', 'updated_at' => 'bigint=0',
            'closed_at' => 'bigint?', 'wiped_at' => 'bigint?', 'version' => 'int=0', 'journal_id' => 'ref?',
        ],
        'index' => [['market_id', 'status', 'created_at'], ['user_id', 'id'], ['status', 'created_at'], ['updated_at']],
        'fk'    => ['user_id' => ['users', 'id', 'RESTRICT']],
    ],
    'ex_order_fields' => [
        'cols' => ['order_id' => 'ref', 'fkey' => 'str:20', 'label' => 'str:120=', 'secret' => 'tinyint=0', 'value' => 'str:500=', 'value_enc' => 'text?', 'set_at' => 'bigint=0'],
        'pk'   => ['order_id', 'fkey'],
        'fk'   => ['order_id' => ['ex_orders', 'id', 'CASCADE']],
    ],
    'ex_offers' => [
        'cols'  => ['id' => 'pk', 'user_id' => 'ref', 'market_id' => 'ref', 'qty' => 'bigint', 'left_qty' => 'bigint', 'price' => 'bigint',
                    'status' => 'enum:aktif,satildi,iptal=aktif', 'created_at' => 'bigint', 'updated_at' => 'bigint=0', 'closed_at' => 'bigint?', 'wiped_at' => 'bigint?'],
        'index' => [['market_id', 'status', 'price', 'created_at'], ['user_id', 'id'], ['status', 'updated_at']],
        'fk'    => ['user_id' => ['users', 'id', 'RESTRICT']],
    ],
    'ex_offer_fields' => [
        'cols' => ['offer_id' => 'ref', 'fkey' => 'str:20', 'label' => 'str:120=', 'secret' => 'tinyint=0', 'value' => 'str:500=', 'value_enc' => 'text?', 'set_at' => 'bigint=0'],
        'pk'   => ['offer_id', 'fkey'],
        'fk'   => ['offer_id' => ['ex_offers', 'id', 'CASCADE']],
    ],
    'ex_fills' => [
        'cols'  => ['id' => 'pk', 'order_id' => 'ref', 'offer_id' => 'ref', 'seller_id' => 'ref', 'qty' => 'bigint', 'paid_qty' => 'bigint=0',
                    'price' => 'bigint', 'sell' => 'bigint', 'created_at' => 'bigint=0'],
        'index' => [['order_id', 'price', 'id'], ['offer_id']],
        'fk'    => ['order_id' => ['ex_orders', 'id', 'CASCADE']],
    ],
    'ex_events' => [
        'cols'  => ['id' => 'pk', 'order_id' => 'ref', 'actor_id' => 'ref?', 'x' => 'str:2000', 't' => 'bigint'],
        'index' => [['order_id', 'id']],
        'fk'    => ['order_id' => ['ex_orders', 'id', 'CASCADE']],
    ],
    'ep_products' => [
        'cols'  => ['id' => 'pk', 'server_id' => 'ref?', 'grp' => 'str:80=', 'ep' => 'int', 'price' => 'bigint', 'hh' => 'tinyint=1', 'v' => 'int=1',
                    'is_on' => 'tinyint=1', 'sold_n' => 'int=0', 'sort' => 'int=0', 'created_at' => 'bigint=0', 'updated_at' => 'bigint=0', 'deleted_at' => 'bigint?'],
        'index' => [['server_id', 'is_on']],
    ],
    'ep_codes' => [
        'cols'   => ['id' => 'pk', 'product_id' => 'ref', 'code_enc' => 'text', 'code_hash' => 'char:64', 'code_tail' => 'str:8=',
                     'status' => 'enum:stok,satildi,silindi=stok', 'order_id' => 'ref?', 'added_at' => 'bigint', 'added_by' => 'ref?', 'sold_at' => 'bigint?'],
        'unique' => [['code_hash']],
        'index'  => [['product_id', 'status', 'id']],
    ],
    'ep_orders' => [
        'cols'  => ['id' => 'pk', 'user_id' => 'ref', 'product_id' => 'ref', 'server_id' => 'ref?', 'ep' => 'int', 'ep_shown' => 'int', 'hh' => 'tinyint=0',
                    'code_id' => 'ref', 'price' => 'bigint', 'paid_cash' => 'bigint=0', 'paid_credit' => 'bigint=0', 'journal_id' => 'ref?', 't' => 'bigint'],
        'index' => [['user_id', 'id'], ['t'], ['server_id', 'id']],
        'fk'    => ['user_id' => ['users', 'id', 'RESTRICT']],
    ],
];
