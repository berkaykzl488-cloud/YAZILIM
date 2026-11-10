<?php
/**
 * GET /api/paytr_hakedis.php?key=GİZLİ_ANAHTAR — zamanlanmış görev (cron).
 * Adresin tamamı (anahtar dahil) Yönetim › Entegrasyonlar › "Otomatik hakediş (cron)" kutusunda gösterilir.
 *
 * Yaptıkları:
 *  1) Başarılı PayTR ödemelerini özetler (test ödemeleri hariç).
 *  2) Paraşüt'te "PayTR tahsilatlarını otomatik kaydet" açıksa, henüz muhasebeleşmemiş her ödeme için
 *     seçilen kasa/banka hesabına para girişi kaydı oluşturur (her ödeme yalnızca bir kez).
 *  3) PayTR İşlem Dökümü API'sinden dünün işlem sayısını alır (mutabakat bilgisi).
 */
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/parasut_client.php';
yp_boot(['methods' => ['GET', 'POST'], 'origin' => false]);
yp_require_installed();

yp_rl_enforce('hakedis_hata', 10, 900, false);
$key = isset($_GET['key']) && is_string($_GET['key']) ? $_GET['key'] : '';
$admin = yp_admin();
if ($key === '' || empty($admin['cron_key']) || !hash_equals((string)$admin['cron_key'], $key)) {
    yp_rl_add('hakedis_hata', 900);
    yp_log('guvenlik', 'Hakediş: geçersiz anahtar', ['ip' => yp_client_ip()]);
    yp_error('Geçersiz veya eksik anahtar.', 'bad_key', 403);
}

$run = yp_lock('hakedis', true);
if (!$run) {
    yp_error('Hakediş işlemi zaten çalışıyor.', 'busy', 409);
}

$s = yp_settings();
$sonuc = [
    'ok'          => true,
    't'           => date('c'),
    'basarili'    => 0,
    'toplam_tl'   => 0.0,
    'muhasebe'    => ['servis' => null, 'kaydedilen' => 0, 'hatali' => 0, 'bekleyen' => 0, 'mesaj' => ''],
    'islem_dokumu'=> null,
];

// --- 1) + 2) ---
$data = yp_json_read(YP_DATA . '/odemeler.json');
$odemeler = isset($data['odemeler']) && is_array($data['odemeler']) ? $data['odemeler'] : [];
$bekleyen = [];
foreach ($odemeler as $oid => $o) {
    if (!isset($o['durum']) || $o['durum'] !== 'basarili' || !empty($o['test_mode'])) {
        continue;
    }
    $sonuc['basarili']++;
    $sonuc['toplam_tl'] += ((int)$o['toplam']) / 100;
    if (empty($o['muhasebe'])) {
        $bekleyen[$oid] = $o;
    }
}
$sonuc['toplam_tl'] = round($sonuc['toplam_tl'], 2);
$sonuc['muhasebe']['bekleyen'] = count($bekleyen);

$parasutAktif = yp_service_configured($s, 'parasut') && yp_bool($s['parasut']['hakedis_kaydi']) && !empty($s['parasut']['account_id']);
if ($parasutAktif && $bekleyen) {
    $sonuc['muhasebe']['servis'] = 'parasut';
    $client = new ParasutClient($s['parasut']);
    $islenen = [];
    $limit = 50; // tek çalıştırmada en fazla
    foreach ($bekleyen as $oid => $o) {
        if ($limit-- <= 0) {
            break;
        }
        $tarih = substr(isset($o['islem']) ? $o['islem'] : date('c'), 0, 10);
        $r = $client->createTahsilatGirisi(round(((int)$o['toplam']) / 100, 2), $tarih, 'PayTR tahsilat ' . $oid);
        if ($r['ok']) {
            $islenen[$oid] = ['servis' => 'parasut', 'id' => $r['id'], 't' => date('c')];
            $sonuc['muhasebe']['kaydedilen']++;
        } else {
            $sonuc['muhasebe']['hatali']++;
            $sonuc['muhasebe']['mesaj'] = $r['msg'];
            if (stripos($r['msg'], 'ulaşılamadı') !== false || stripos($r['msg'], 'giriş') !== false) {
                break; // bağlantı/kimlik sorunu: kalanları denemeye gerek yok
            }
        }
    }
    if ($islenen) {
        yp_json_update(YP_DATA . '/odemeler.json', function ($d) use ($islenen) {
            foreach ($islenen as $oid => $m) {
                if (isset($d['odemeler'][$oid])) {
                    $d['odemeler'][$oid]['muhasebe'] = $m;
                }
            }
            return $d;
        });
    }
    $sonuc['muhasebe']['bekleyen'] = count($bekleyen) - count($islenen);
} elseif ($bekleyen) {
    $sonuc['muhasebe']['mesaj'] = 'Otomatik muhasebe kaydı kapalı (Paraşüt kartında "PayTR tahsilatlarını otomatik kaydet" ve hesap No gerekli).';
}

// --- 3) PayTR İşlem Dökümü (dün) ---
if (yp_service_configured($s, 'paytr')) {
    $c = $s['paytr'];
    $start = date('Y-m-d 00:00:00', strtotime('-1 day'));
    $end = date('Y-m-d 23:59:59', strtotime('-1 day'));
    $r = yp_http('POST', YP_PAYTR_REPORT_URL, ['form' => [
        'merchant_id' => $c['merchant_id'],
        'start_date'  => $start,
        'end_date'    => $end,
        'paytr_token' => yp_paytr_report_hash($c['merchant_id'], $start, $end, $c['merchant_salt'], $c['merchant_key']),
    ], 'timeout' => 30]);
    if ($r['error'] !== '') {
        $sonuc['islem_dokumu'] = ['ok' => false, 'msg' => 'PayTR sunucusuna ulaşılamadı: ' . $r['error']];
    } elseif (is_array($r['json']) && isset($r['json']['status']) && $r['json']['status'] === 'success') {
        $n = 0;
        foreach ($r['json'] as $k => $v) {
            if (is_array($v)) {
                $n += count($v);
            }
        }
        $sonuc['islem_dokumu'] = ['ok' => true, 'tarih' => substr($start, 0, 10), 'kayit' => $n, 'msg' => 'Dünün işlem dökümü alındı.'];
    } else {
        $m = is_array($r['json']) ? (isset($r['json']['err_msg']) ? $r['json']['err_msg'] : (isset($r['json']['reason']) ? $r['json']['reason'] : '')) : '';
        $sonuc['islem_dokumu'] = ['ok' => false, 'msg' => 'PayTR yanıtı: ' . ($m !== '' ? yp_str($m, 300) : 'HTTP ' . $r['code'])];
    }
}

yp_json_update(yp_status_file(), function ($d) use ($sonuc) {
    $d['hakedis_son'] = [
        't'          => $sonuc['t'],
        'kaydedilen' => $sonuc['muhasebe']['kaydedilen'],
        'hatali'     => $sonuc['muhasebe']['hatali'],
        'bekleyen'   => $sonuc['muhasebe']['bekleyen'],
    ];
    return $d;
});
yp_log('hakedis', 'Hakediş çalıştı', ['kaydedilen' => $sonuc['muhasebe']['kaydedilen'], 'hatali' => $sonuc['muhasebe']['hatali'], 'bekleyen' => $sonuc['muhasebe']['bekleyen']]);
yp_unlock($run);
yp_json($sonuc);
