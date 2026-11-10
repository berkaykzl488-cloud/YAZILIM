<?php
/**
 * Paraşüt v4 REST API istemcisi.
 * Ayarlar Yönetim › Entegrasyonlar › Paraşüt kartından girilir; bu dosyada düzenlenecek bir şey yoktur.
 *
 * OAuth: POST https://api.parasut.com/oauth/token (grant_type=password, redirect_uri=urn:ietf:wg:oauth:2.0:oob)
 * API:   https://api.parasut.com/v4/{company_id}/...
 */
if (PHP_SAPI !== 'cli' && isset($_SERVER['SCRIPT_FILENAME']) && @realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/_lib.php';

class ParasutClient
{
    const OAUTH_URL = 'https://api.parasut.com/oauth/token';
    const API_BASE = 'https://api.parasut.com/v4/';
    const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

    private $c;
    private $token = '';

    public function __construct(array $cfg)
    {
        $this->c = $cfg;
    }

    public static function fromSettings()
    {
        $s = yp_settings();
        return new self($s['parasut']);
    }

    public function isConfigured()
    {
        return yp_service_configured(['parasut' => $this->c], 'parasut');
    }

    private function fingerprint()
    {
        return hash('sha256', $this->c['company_id'] . '|' . $this->c['client_id'] . '|' . $this->c['username']);
    }

    /** Erişim jetonu alır (şifreli önbellekte saklanır). */
    public function authenticate($force = false)
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'msg' => 'Paraşüt ayarları eksik. Firma No, Client ID, Client Secret, e-posta ve şifreyi girin.'];
        }
        $fp = $this->fingerprint();
        if (!$force) {
            $cache = yp_store_read('onbellek');
            if (!empty($cache['parasut']['token']) && $cache['parasut']['fp'] === $fp && $cache['parasut']['exp'] > time() + 60) {
                $this->token = $cache['parasut']['token'];
                return ['ok' => true, 'msg' => 'Önbellekten'];
            }
        }
        $r = yp_http('POST', self::OAUTH_URL, ['form' => [
            'grant_type'    => 'password',
            'client_id'     => $this->c['client_id'],
            'client_secret' => $this->c['client_secret'],
            'username'      => $this->c['username'],
            'password'      => $this->c['password'],
            'redirect_uri'  => self::REDIRECT_URI,
        ], 'timeout' => 20]);
        if ($r['error'] !== '') {
            return ['ok' => false, 'msg' => 'Paraşüt sunucusuna ulaşılamadı: ' . $r['error']];
        }
        $j = $r['json'];
        if ($r['ok'] && is_array($j) && !empty($j['access_token'])) {
            $this->token = (string)$j['access_token'];
            $exp = time() + (isset($j['expires_in']) ? (int)$j['expires_in'] : 7200);
            $tok = $this->token;
            yp_store_update('onbellek', function ($cache) use ($tok, $exp, $fp) {
                $cache['parasut'] = ['token' => $tok, 'exp' => $exp, 'fp' => $fp];
                return $cache;
            });
            return ['ok' => true, 'msg' => 'Giriş başarılı'];
        }
        $err = is_array($j) && isset($j['error']) ? (string)$j['error'] : '';
        $tr = [
            'invalid_client'         => 'Client ID veya Client Secret hatalı.',
            'invalid_grant'          => 'Paraşüt e-posta adresi veya şifresi hatalı.',
            'unauthorized_client'    => 'Bu uygulamanın (Client ID) password grant yetkisi yok; Paraşüt destekten API erişimi isteyin.',
            'invalid_request'        => 'Paraşüt isteği reddetti (eksik alan).',
        ];
        $msg = isset($tr[$err]) ? $tr[$err] : ('Paraşüt girişi başarısız (HTTP ' . $r['code'] . ($err !== '' ? ', ' . yp_str($err, 60) : '') . ').');
        return ['ok' => false, 'msg' => $msg];
    }

    /** JSON:API isteği. 401 gelirse bir kez yeniden giriş yapar. */
    public function request($method, $path, $body = null, array $query = [], $retry = true)
    {
        if ($this->token === '') {
            $a = $this->authenticate();
            if (!$a['ok']) {
                return ['ok' => false, 'code' => 0, 'json' => null, 'msg' => $a['msg']];
            }
        }
        $url = self::API_BASE . rawurlencode((string)$this->c['company_id']) . '/' . ltrim($path, '/');
        if ($query) {
            $url .= '?' . http_build_query($query, '', '&');
        }
        $o = ['headers' => ['Authorization: Bearer ' . $this->token], 'timeout' => 30];
        if ($body !== null) {
            $o['json'] = $body;
        }
        $r = yp_http($method, $url, $o);
        if ($r['error'] !== '') {
            return ['ok' => false, 'code' => 0, 'json' => null, 'msg' => 'Paraşüt sunucusuna ulaşılamadı: ' . $r['error']];
        }
        if ($r['code'] === 401 && $retry) {
            $a = $this->authenticate(true);
            if (!$a['ok']) {
                return ['ok' => false, 'code' => 401, 'json' => null, 'msg' => $a['msg']];
            }
            return $this->request($method, $path, $body, $query, false);
        }
        if (!$r['ok']) {
            return ['ok' => false, 'code' => $r['code'], 'json' => $r['json'], 'msg' => self::errorText($r)];
        }
        return ['ok' => true, 'code' => $r['code'], 'json' => $r['json'], 'msg' => ''];
    }

    private static function errorText(array $r)
    {
        $j = $r['json'];
        $detail = '';
        if (is_array($j) && !empty($j['errors'][0])) {
            $e = $j['errors'][0];
            $detail = isset($e['detail']) ? $e['detail'] : (isset($e['title']) ? $e['title'] : '');
        }
        $base = [403 => 'Bu işlem için yetkiniz yok.', 404 => 'Kayıt veya firma bulunamadı (Firma No hatalı olabilir).',
                 422 => 'Paraşüt kaydı kabul etmedi.', 429 => 'Paraşüt istek sınırı aşıldı, biraz sonra tekrar deneyin.'];
        $m = isset($base[$r['code']]) ? $base[$r['code']] : 'Paraşüt hatası (HTTP ' . $r['code'] . ').';
        return $m . ($detail !== '' ? ' ' . yp_str($detail, 300) : '');
    }

    /** Bağlantı testi: OAuth + firma erişimi. */
    public function testConnection()
    {
        $a = $this->authenticate(true);
        if (!$a['ok']) {
            return ['ok' => false, 'msg' => $a['msg']];
        }
        $r = $this->request('GET', 'accounts', null, ['page[size]' => 1]);
        if (!$r['ok']) {
            if ($r['code'] === 404 || $r['code'] === 403) {
                return ['ok' => false, 'msg' => 'Giriş başarılı ancak Firma No (' . $this->c['company_id'] . ') bu kullanıcıya ait değil veya hatalı.'];
            }
            return ['ok' => false, 'msg' => $r['msg']];
        }
        return ['ok' => true, 'msg' => 'Paraşüt bağlantısı başarılı (Firma No: ' . $this->c['company_id'] . ').'];
    }

    /** TCKN ile tedarikçi (kişi) bulur; yoksa oluşturur. */
    public function findOrCreateSupplier($ad, $tckn, $iban)
    {
        $r = $this->request('GET', 'contacts', null, ['filter[tax_number]' => $tckn, 'page[size]' => 1]);
        if ($r['ok'] && !empty($r['json']['data'][0]['id'])) {
            return ['ok' => true, 'id' => (string)$r['json']['data'][0]['id']];
        }
        $r = $this->request('POST', 'contacts', ['data' => [
            'type'       => 'contacts',
            'attributes' => [
                'name'         => $ad,
                'contact_type' => 'person',
                'tax_number'   => $tckn,
                'account_type' => 'supplier',
                'iban'         => $iban,
            ],
        ]]);
        if ($r['ok'] && !empty($r['json']['data']['id'])) {
            return ['ok' => true, 'id' => (string)$r['json']['data']['id']];
        }
        return ['ok' => false, 'id' => null, 'msg' => $r['msg']];
    }

    /**
     * Çekim (kullanıcıya ödeme) için e-Gider Pusulası karşılığı gider kaydı:
     *  1) tedarikçi kişi (TCKN) → 2) gider/alış faturası kaydı (purchase_bills) → 3) hesap No girildiyse net ödeme.
     * $p: ad, tckn, iban, brut, stopaj, net, aciklama, belge_no, ettn, tarih(Y-m-d)
     */
    public function createGiderPusulasi(array $p)
    {
        $a = $this->authenticate();
        if (!$a['ok']) {
            return ['ok' => false, 'msg' => $a['msg']];
        }
        $contact = $this->findOrCreateSupplier($p['ad'], $p['tckn'], $p['iban']);

        $desc = 'e-Gider Pusulası ' . $p['belge_no'] . ' - ' . $p['ad']
              . ($p['stopaj'] > 0 ? ' (stopaj ' . number_format($p['stopaj'], 2, '.', '') . ' TL)' : '')
              . ($p['ettn'] !== '' ? ' ETTN ' . $p['ettn'] : '')
              . ($p['aciklama'] !== '' ? ' - ' . $p['aciklama'] : '');
        $bill = ['data' => [
            'type'       => 'purchase_bills',
            'attributes' => [
                'item_type'   => 'purchase_bill',
                'description' => yp_str($desc, 250),
                'issue_date'  => $p['tarih'],
                'due_date'    => $p['tarih'],
                'invoice_no'  => $p['belge_no'],
                'currency'    => 'TRL',
                'net_total'   => $p['brut'],
                'total_vat'   => 0,
            ],
        ]];
        if ($contact['ok']) {
            $bill['data']['relationships'] = ['supplier' => ['data' => ['id' => $contact['id'], 'type' => 'contacts']]];
        }
        // Not: dokümandaki "purchase_bills#basic" yalnızca sayfa çapasıdır; HTTP isteği /purchase_bills adresine gider.
        $r = $this->request('POST', 'purchase_bills', $bill);
        if (!$r['ok'] || empty($r['json']['data']['id'])) {
            return ['ok' => false, 'msg' => 'Gider kaydı oluşturulamadı: ' . ($r['msg'] !== '' ? $r['msg'] : 'yanıt boş'),
                    'contact_id' => $contact['ok'] ? $contact['id'] : null];
        }
        $billId = (string)$r['json']['data']['id'];

        $paymentId = null;
        $payMsg = '';
        if (!empty($this->c['account_id'])) {
            $pr = $this->request('POST', 'purchase_bills/' . rawurlencode($billId) . '/payments', ['data' => [
                'type'       => 'payments',
                'attributes' => [
                    'account_id' => (int)$this->c['account_id'],
                    'date'       => $p['tarih'],
                    'amount'     => $p['net'],
                    'notes'      => yp_str('YangPazar e-Gider Pusulasi No: ' . $p['belge_no'] . ' - ' . $p['ad'], 250),
                ],
            ]]);
            if ($pr['ok'] && !empty($pr['json']['data']['id'])) {
                $paymentId = (string)$pr['json']['data']['id'];
            } else {
                $payMsg = ' Ödeme kaydı eklenemedi: ' . $pr['msg'];
            }
        }
        return [
            'ok'               => true,
            'contact_id'       => $contact['ok'] ? $contact['id'] : null,
            'purchase_bill_id' => $billId,
            'payment_id'       => $paymentId,
            'msg'              => 'Paraşüt gider kaydı oluşturuldu.' . $payMsg,
        ];
    }

    /** PayTR tahsilatı için kasa/banka hesabına para girişi kaydı. */
    public function createTahsilatGirisi($amount, $date, $description)
    {
        if (empty($this->c['account_id'])) {
            return ['ok' => false, 'msg' => 'Paraşüt kasa/banka hesap No girilmemiş.'];
        }
        $r = $this->request('POST', 'accounts/' . rawurlencode((string)$this->c['account_id']) . '/debit_transactions', ['data' => [
            'type'       => 'transactions',
            'attributes' => [
                'date'        => $date,
                'amount'      => $amount,
                'description' => yp_str($description, 250),
            ],
        ]]);
        if ($r['ok']) {
            return ['ok' => true, 'id' => isset($r['json']['data']['id']) ? (string)$r['json']['data']['id'] : null, 'msg' => 'Kaydedildi'];
        }
        return ['ok' => false, 'msg' => $r['msg']];
    }
}
