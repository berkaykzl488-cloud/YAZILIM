<?php
/**
 * POST /api/cekim_onayla.php — yönetici çekim (para çekme) onayı → muhasebe kaydı (oturum + X-CSRF-Token).
 * Gövde: {id, ad, tckn, iban, brut, stopaj, net, aciklama, belge_no, ettn}
 * Yanıt: {ok:true, id, belge_no, banka_aciklama, parasut:{...}|null, bizimhesap:{...}|null}
 *
 * Bağlı muhasebe servislerinde (Paraşüt / Bizim Hesap) e-Gider Pusulası karşılığı gider/alış kaydı oluşturur.
 * Aynı id tekrar gönderilirse başarılı olmuş kayıtlar YENİDEN oluşturulmaz (yalnızca hatalı olanlar denenir).
 * Not: Banka transferi bu uç nokta tarafından yapılmaz; açıklama metni (banka_aciklama) havale açıklamasında kullanılır.
 */
require_once __DIR__ . '/_lib.php';
require_once __DIR__ . '/parasut_client.php';
require_once __DIR__ . '/bizimhesap_client.php';
yp_boot(['methods' => ['POST']]);
yp_require_auth();
yp_require_csrf();

$in = yp_input();
$e = [];

$id = yp_str(isset($in['id']) ? $in['id'] : '', 64);
if (!preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $id)) {
    $e['id'] = 'Çekim numarası geçersiz';
}
$ad = yp_str(isset($in['ad']) ? $in['ad'] : '', 100);
if (yp_strlen($ad) < 3 || preg_match('/[<>{}]/', $ad)) {
    $e['ad'] = 'Ad soyad geçersiz';
}
$tckn = preg_replace('/\s+/', '', yp_str(isset($in['tckn']) ? $in['tckn'] : '', 20));
if (!yp_valid_tckn($tckn)) {
    $e['tckn'] = 'T.C. Kimlik No geçersiz';
}
$iban = strtoupper(preg_replace('/\s+/', '', yp_str(isset($in['iban']) ? $in['iban'] : '', 40)));
if (!yp_valid_iban_tr($iban)) {
    $e['iban'] = 'IBAN geçersiz (TR ile başlayan 26 karakter)';
}
$brut = yp_money(isset($in['brut']) ? $in['brut'] : null);
$stopaj = yp_money(isset($in['stopaj']) ? $in['stopaj'] : 0);
$net = yp_money(isset($in['net']) ? $in['net'] : null);
if ($brut === null || $brut <= 0 || $brut > 1000000) {
    $e['brut'] = 'Brüt tutar geçersiz';
}
if ($stopaj === null || $stopaj < 0) {
    $e['stopaj'] = 'Stopaj tutarı geçersiz';
}
if ($net === null || $net <= 0) {
    $e['net'] = 'Net tutar geçersiz';
}
if (!isset($e['brut']) && !isset($e['stopaj']) && !isset($e['net']) && abs($brut - $stopaj - $net) > 0.01) {
    $e['net'] = 'Net tutar = Brüt − Stopaj olmalı';
}
$aciklama = yp_str(isset($in['aciklama']) ? $in['aciklama'] : '', 200);
$belge = strtoupper(yp_str(isset($in['belge_no']) ? $in['belge_no'] : '', 32));
if ($belge === '') {
    $belge = 'YGP' . date('Y') . str_pad((string)random_int(0, 999999999), 9, '0', STR_PAD_LEFT);
} elseif (!preg_match('/^[A-Z0-9]{3,32}$/', $belge)) {
    $e['belge_no'] = 'Belge No yalnızca harf ve rakam olmalı (3–32)';
}
$ettn = strtolower(yp_str(isset($in['ettn']) ? $in['ettn'] : '', 36));
if ($ettn !== '' && !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $ettn)) {
    $e['ettn'] = 'ETTN geçersiz (UUID biçiminde olmalı)';
}

if ($e) {
    yp_error('Bazı alanlar hatalı: ' . implode('; ', array_values($e)), 'validation', 422, ['fields' => $e]);
}

// Aynı çekimin eşzamanlı iki kez işlenmesini engelle
$lock = yp_lock('cekim');
$onceki = yp_store_read('cekimler');
$kayit = isset($onceki[$id]) ? $onceki[$id] : null;
if ($kayit && $kayit['belge_no'] !== $belge && !empty($in['belge_no'])) {
    yp_unlock($lock);
    yp_error('Bu çekim daha önce farklı bir belge numarasıyla onaylanmış (' . $kayit['belge_no'] . ').', 'conflict', 409);
}
if ($kayit) {
    $belge = $kayit['belge_no'];
}

$s = yp_settings();
$p = [
    'ad' => $ad, 'tckn' => $tckn, 'iban' => $iban, 'brut' => $brut, 'stopaj' => $stopaj, 'net' => $net,
    'aciklama' => $aciklama, 'belge_no' => $belge, 'ettn' => $ettn, 'tarih' => date('Y-m-d'),
];

$sonuclar = ['parasut' => null, 'bizimhesap' => null];
$tekrar = true;
foreach (['parasut', 'bizimhesap'] as $svc) {
    if ($kayit && !empty($kayit[$svc]['ok'])) {
        $sonuclar[$svc] = $kayit[$svc] + ['tekrar' => true];
        continue;
    }
    if (!yp_service_configured($s, $svc)) {
        continue;
    }
    $tekrar = false;
    $client = $svc === 'parasut' ? new ParasutClient($s['parasut']) : new BizimHesapClient($s['bizimhesap']);
    try {
        $sonuclar[$svc] = $client->createGiderPusulasi($p);
    } catch (Exception $ex) {
        yp_log('hata', 'cekim_onayla ' . $svc . ': ' . $ex->getMessage());
        $sonuclar[$svc] = ['ok' => false, 'msg' => 'Beklenmeyen hata oluştu.'];
    }
}

yp_store_update('cekimler', function ($d) use ($id, $belge, $sonuclar, $brut, $net) {
    $d[$id] = [
        'belge_no'   => $belge,
        't'          => date('c'),
        'brut'       => $brut,
        'net'        => $net,
        'parasut'    => $sonuclar['parasut'],
        'bizimhesap' => $sonuclar['bizimhesap'],
    ];
    return $d;
});
yp_unlock($lock);

yp_log('cekim', 'Çekim onaylandı', [
    'id'         => $id,
    'belge_no'   => $belge,
    'brut'       => $brut,
    'parasut'    => $sonuclar['parasut'] ? ($sonuclar['parasut']['ok'] ? 'ok' : 'hata') : 'yok',
    'bizimhesap' => $sonuclar['bizimhesap'] ? ($sonuclar['bizimhesap']['ok'] ? 'ok' : 'hata') : 'yok',
]);

$out = [
    'ok'             => true,
    'id'             => $id,
    'belge_no'       => $belge,
    'banka_aciklama' => 'YangPazar Cekim Odemesi Ref: ' . $id . ' - ' . $ad, // müşterinin dekontunda görünür: pusula ifadesi içermez
    'parasut'        => $sonuclar['parasut'],
    'bizimhesap'     => $sonuclar['bizimhesap'],
];
if (!$sonuclar['parasut'] && !$sonuclar['bizimhesap']) {
    $out['uyari'] = 'Bağlı muhasebe servisi yok; kayıt yalnızca bu sunucuda tutuldu.';
} elseif ($tekrar) {
    $out['tekrar'] = true;
}
yp_json($out);
