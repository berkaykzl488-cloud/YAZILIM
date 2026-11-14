<?php
/**
 * Para çekme, belge sıra numaraları, muhasebe kuyruğu (PLAN §3.4 — P3). Para: BIGINT kuruş. Zamanlar: BIGINT unix ms.
 * Kurulu sitede bu tablolar ilk istekte otomatik eklenir (YP\Updater); mevcut veriye dokunulmaz.
 *
 *   withdrawals       üyenin çekim talebi. Talep anında tutar çekilebilir bakiyeden (cash) PAYABLE:WD hesabına ayrılır.
 *                     iban_enc: talep anındaki IBAN (şifreli kopya; üye kayıtlı IBAN'ını silse de talep bozulmaz).
 *                     egp_*: yalnız iç muhasebe (yönetim [cekim|muhasebe]); üye yanıtlarında HİÇ yer almaz.
 *                     egp_doc_enc: kesilen belgenin şifreli anlık görüntüsü (tam T.C. kimlik no dahil).
 *                     acct: muhasebe servisi sonuçları (JSON, sır yok).
 *   doc_sequences     boşluksuz sıra numarası: (seri, yıl) satırı kilitlenerek artırılır; numara çekim onayıyla AYNI işlemde
 *                     alındığı için işlem geri alınırsa numara da geri alınır (atlama olmaz).
 *   accounting_jobs   Paraşüt / Bizim Hesap kayıtları: onaydan sonra cron ile gönderilir, hata olursa artan beklemeyle yeniden denenir.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

return [
    'withdrawals' => [
        'cols' => [
            'id' => 'pk', 'user_id' => 'ref', 'amount' => 'bigint', 'fee' => 'bigint=0', 'brut' => 'bigint', 'stopaj_bp' => 'int=0',
            'stopaj' => 'bigint=0', 'net' => 'bigint',
            'bank' => 'str:60=', 'holder' => 'str:80=', 'iban_enc' => 'text', 'iban_mask' => 'str:40=', 'iban_last4' => 'char:4=',
            'status' => 'enum:bekliyor,onaylandı,reddedildi=bekliyor', 'why' => 'str:255=', 'note' => 'str:255=',
            'created_at' => 'bigint', 'decided_at' => 'bigint?', 'decided_by' => 'ref?', 'paid_at' => 'bigint?',
            'egp_no' => 'str:32?', 'egp_ettn' => 'char:36?', 'egp_at' => 'bigint?', 'egp_by' => 'ref?', 'egp_doc_enc' => 'mediumtext?',
            'acct' => 'text?', 'journal_id' => 'ref?', 'paid_journal_id' => 'ref?',
        ],
        'unique' => [['egp_no']],
        'index'  => [['status', 'created_at'], ['user_id', 'id'], ['paid_at']],
        'fk'     => ['user_id' => ['users', 'id', 'RESTRICT']],
    ],
    'doc_sequences' => [
        'cols' => ['series' => 'str:20', 'year' => 'int', 'next_no' => 'bigint=1', 'updated_at' => 'bigint=0'],
        'pk'   => ['series', 'year'],
    ],
    'accounting_jobs' => [
        // kind: cekim (e-Gider kaydı) | hakedis (PayTR tahsilatı). service: parasut | bizimhesap
        'cols' => [
            'id' => 'pk', 'kind' => 'str:20', 'ref_id' => 'str:40', 'service' => 'str:20',
            'status' => 'enum:bekliyor,tamam,hata=bekliyor', 'tries' => 'int=0', 'last_error' => 'str:255=', 'next_at' => 'bigint=0',
            'result' => 'text?', 'created_at' => 'bigint', 'done_at' => 'bigint?', 'lock_until' => 'bigint=0',
        ],
        'unique' => [['kind', 'ref_id', 'service']],
        'index'  => [['status', 'next_at']],
    ],
];
