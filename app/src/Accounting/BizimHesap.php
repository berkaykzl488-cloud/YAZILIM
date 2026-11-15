<?php
namespace YP\Accounting;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Bizim Hesap B2B API istemcisi (eski api/bizimhesap_client.php'nin uygulama içi karşılığı; mantık aynı).
 * Ayarlar: Yönetim › Entegrasyonlar (settings.bizimhesap, şifreli). Çağrılar accounting_jobs kuyruğundan cron ile yapılır.
 */
final class BizimHesap
{
    const BASE = 'https://bizimhesap.com/api/b2b/';
    const TYPE_SALE = 3;
    const TYPE_PURCHASE = 5;

    private $c;

    public function __construct(array $cfg)
    {
        $this->c = $cfg;
    }

    public function isConfigured()
    {
        return \YP\Integrations::complete('bizimhesap', $this->c);
    }

    private function headers()
    {
        $h = ['Token: ' . $this->c['firm_id']];
        if (!empty($this->c['api_key'])) {
            $h[] = 'Key: ' . $this->c['api_key'];
        }
        return $h;
    }

    /** Yanıttaki hata metnini çıkarır ('' = hata yok). */
    private static function apiError(array $r)
    {
        $j = $r['json'];
        if (is_array($j)) {
            if (isset($j['resultCode']) && (int)$j['resultCode'] === 0 && !empty($j['errorText'])) {
                return yp_str($j['errorText'], 300);
            }
            if (!empty($j['Message'])) {
                return yp_str($j['Message'], 300);
            }
            if (!empty($j['error']) && is_string($j['error'])) {
                return yp_str($j['error'], 300);
            }
        }
        if (!$r['ok']) {
            return 'HTTP ' . $r['code'];
        }
        if (!is_array($j)) {
            return 'Beklenmeyen yanıt';
        }
        return '';
    }

    private function call($method, $path, $body = null)
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'json' => null, 'msg' => 'Bizim Hesap ayarları eksik. Firma ID girin.'];
        }
        $o = ['headers' => $this->headers(), 'timeout' => 30];
        if ($body !== null) {
            $o['json'] = $body;
        }
        $r = Net::http($method, self::BASE . $path, $o);
        if ($r['error'] !== '') {
            return ['ok' => false, 'json' => null, 'msg' => 'Bizim Hesap sunucusuna ulaşılamadı: ' . $r['error']];
        }
        $e = self::apiError($r);
        if ($e !== '') {
            $hint = ($r['code'] === 401 || $r['code'] === 403) ? ' (Firma ID / API anahtarı hatalı olabilir)' : '';
            return ['ok' => false, 'json' => $r['json'], 'msg' => 'Bizim Hesap hatası: ' . $e . $hint];
        }
        return ['ok' => true, 'json' => $r['json'], 'msg' => ''];
    }

    /** Bağlantı testi: kimlik doğrulamalı hafif çağrı (depo listesi). */
    public function testConnection()
    {
        $r = $this->call('GET', 'warehouses');
        if (!$r['ok']) {
            return ['ok' => false, 'msg' => $r['msg']];
        }
        $n = null;
        if (isset($r['json']['data']['warehouses']) && is_array($r['json']['data']['warehouses'])) {
            $n = count($r['json']['data']['warehouses']);
        } elseif (isset($r['json']['warehouses']) && is_array($r['json']['warehouses'])) {
            $n = count($r['json']['warehouses']);
        }
        return ['ok' => true, 'msg' => 'Bizim Hesap bağlantısı başarılı' . ($n !== null ? ' (' . $n . ' depo).' : '.')];
    }

    /**
     * Çekim için e-Gider Pusulası karşılığı ALIŞ kaydı (invoiceType=5).
     * $p: ad, tckn, iban, brut, stopaj, net, aciklama, belge_no, ettn, tarih(Y-m-d)
     */
    public function createGiderPusulasi(array $p)
    {
        $dt = $p['tarih'] . 'T' . date('H:i:s');
        $brut = round((float)$p['brut'], 2);
        $note = 'YangPazar e-Gider Pusulasi No: ' . $p['belge_no'] . ' - ' . $p['ad']
              . ' | Brüt ' . number_format($brut, 2, '.', '') . ' TL, Stopaj ' . number_format($p['stopaj'], 2, '.', '')
              . ' TL, Net ' . number_format($p['net'], 2, '.', '') . ' TL'
              . ($p['ettn'] !== '' ? ' | ETTN ' . $p['ettn'] : '')
              . ($p['aciklama'] !== '' ? ' | ' . $p['aciklama'] : '');
        $body = [
            'firmId'      => $this->c['firm_id'],
            'invoiceNo'   => $p['belge_no'],
            'invoiceType' => self::TYPE_PURCHASE,
            'note'        => yp_str($note, 250),
            'dates'       => ['invoiceDate' => $dt, 'dueDate' => $dt, 'deliveryDate' => $dt],
            'customer'    => [
                'customerId' => 'YP-' . substr(hash('sha256', $p['tckn']), 0, 12),
                'title'      => $p['ad'],
                'taxOffice'  => '',
                'taxNo'      => $p['tckn'],
                'email'      => '',
                'phone'      => '',
                'address'    => '',
            ],
            'amounts'     => ['currency' => 'TL', 'gross' => $brut, 'discount' => 0, 'net' => $brut, 'tax' => 0, 'total' => $brut],
            'details'     => [[
                'productId'   => 'YP-EGP',
                'productName' => 'Dijital oyun ürünü alımı (e-Gider Pusulası)',
                'note'        => yp_str($p['aciklama'], 100),
                'barcode'     => '',
                'taxRate'     => 0,
                'quantity'    => 1,
                'unitPrice'   => $brut,
                'grossPrice'  => $brut,
                'discount'    => 0,
                'net'         => $brut,
                'tax'         => 0,
                'total'       => $brut,
            ]],
        ];
        $r = $this->call('POST', 'addinvoice', $body);
        if (!$r['ok']) {
            return ['ok' => false, 'msg' => $r['msg']];
        }
        return [
            'ok'   => true,
            'guid' => isset($r['json']['guid']) ? (string)$r['json']['guid'] : null,
            'url'  => isset($r['json']['url']) ? (string)$r['json']['url'] : null,
            'msg'  => 'Bizim Hesap alış kaydı oluşturuldu.',
        ];
    }
}
