<?php
/**
 * P3 birim testleri (tests/run.php içinden yüklenir): para çekme ücret/kesinti hesabının JS ile paritesi (Node, asıl ön yüz
 * wdFee / wdBreakdown), TC (geçerlilik, maske, HMAC benzersizliği, NVİ sahte ok/fail/down), çekim talebi (çekilebilir bakiye,
 * kart bakiyesi çekilemez, IBAN sahibi adı), onay (iki kez onay → tek numara, boşluksuz seri), red (iade), defter denetimi
 * (PAYABLE:WD), muhasebe kuyruğu (servis kapalıyken artan beklemeyle yeniden deneme), Entegrasyonlar (maskeli, eski değer korunur),
 * PayTR yapılandırması tek kaynak + bildirim (Paytr::notify), üye görünümünde belge/pusula ifadesi yok.
 */
if (PHP_SAPI !== 'cli' || !function_exists('section')) {
    exit;
}

use YP\Accounting\Net;
use YP\Accounting\Queue;
use YP\Db;
use YP\Http\HttpError;
use YP\Integrations;
use YP\Kimlik;
use YP\Money\Ledger;
use YP\Money\Paytr;
use YP\Money\Rules;
use YP\Money\Wallet;
use YP\Money\Withdraw;
use YP\Nvi;
use YP\Settings;
use YP\Store;

function p3Db()
{
    $db = freshDb();
    Paytr::$override = false;
    Nvi::$fn = function () {
        return 'ok';
    };
    Net::$fn = null;
    if (!Store::exists('app')) {
        Store::write('app', ['pepper' => base64_encode(random_bytes(32))]);
    }
    return $db;
}
/** Doğrulanmış üye (tam TC ile) */
function p3Member(Db $db, $name, $tc, array $x = [])
{
    $u = mkUser($db, $name, $x + ['ad' => 'Deniz', 'soyad' => 'Yılmaz']);
    if ($tc) {
        Kimlik::verify($db, $u, ['tc' => $tc, 'dt' => '1990-05-05']);
    }
    return $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
}
function p3Fund(Db $db, $admin, $u, $kurus, $w)
{
    $db->tx(function (Db $db) use ($admin, $u, $kurus, $w) {
        Wallet::adjust($db, $admin, $u, $kurus, $w, false, 'Test bakiyesi');
    });
}
function p3Req(Db $db, $u, array $in)
{
    return $db->tx(function (Db $db) use ($u, $in) {
        return Withdraw::request($db, $u, $in);
    });
}
const P3_IBAN = 'TR330006100519786457841326';
const P3_TC1 = '10000000146';
const P3_TC2 = '12345678950';

section('p3-schema', function () {
    $db = p3Db();
    foreach (['withdrawals', 'doc_sequences', 'accounting_jobs'] as $t) {
        ok('tablo var: ' . $t, $db->tableExists($t));
    }
    $c = $db->columns('users');
    ok('users: tc_state, tc_enc, tc_hash', in_array('tc_state', $c, true) && in_array('tc_enc', $c, true) && in_array('tc_hash', $c, true));
    ok('MySQL DDL: withdrawals + doc_sequences PK', strpos(implode("\n", YP\Schema::ddl('mysql')), 'doc_sequences') !== false);
    ok('göç 0004 kayıtlı', (bool)$db->val("SELECT version FROM {schema_migrations} WHERE version='m:0004_integrations_import'"));
});

section('p3-parity', function () {
    ok('wdFee sabit 5 TL', Withdraw::fee(10000, ['on' => true, 'type' => 'sabit', 'val' => 5]) === 500);
    ok('wdFee kapalı → 0', Withdraw::fee(10000, ['on' => false, 'type' => 'sabit', 'val' => 5]) === 0);
    ok('wdFee yüzde 2, en az 3 TL', Withdraw::fee(10000, ['on' => true, 'type' => 'yuzde', 'val' => 2, 'min' => 3, 'max' => 0]) === 300);
    ok('wdFee tutarı geçemez', Withdraw::fee(200, ['on' => true, 'type' => 'sabit', 'val' => 5]) === 200);
    $b = Withdraw::breakdown(10000, ['on' => true, 'type' => 'sabit', 'val' => 5], ['on' => true, 'stopaj' => 2.5]);
    ok('breakdown: 100 TL, 5 ücret, %2,5 stopaj → net 92,63', $b['fee'] === 500 && $b['brut'] === 9500 && $b['stopaj'] === 238 && $b['net'] === 9262, $b);
    if (p2Node() === '') {
        ok('Node parite testi atlandı (node yok)', true);
        return;
    }
    $src = file_get_contents(dirname(__DIR__) . '/src/js/30-wallet-egp.js');
    $core = file_get_contents(dirname(__DIR__) . '/src/js/00-core.js');
    $defs = [p2JsDef($core, 'r2'), p2JsDef($src, 'wdFee'), p2JsDef($src, 'wdBreakdown')];
    ok('JS tanımları bulundu: r2, wdFee, wdBreakdown', !in_array(null, $defs, true));
    mt_srand(20261114);
    $F = [];
    for ($i = 0; $i < 600; $i++) {
        $type = mt_rand(0, 1) ? 'yuzde' : 'sabit';
        $F[] = ['a' => mt_rand(1, 3) === 1 ? mt_rand(1, 999) : mt_rand(1000, 5000000), 'fee' => ['on' => (bool)mt_rand(0, 3), 'type' => $type,
            'val' => $type === 'yuzde' ? [0, 1, 1.5, 2, 2.75, 5, 7.25][mt_rand(0, 6)] : [0, 1, 2.5, 5, 7.99, 10][mt_rand(0, 5)],
            'min' => [0, 0, 1, 2.5, 5][mt_rand(0, 4)], 'max' => [0, 0, 20, 50, 99.99][mt_rand(0, 4)]],
            'egp' => ['on' => (bool)mt_rand(0, 4), 'stopaj' => [0, 0, 0.5, 1, 2.5, 5, 15, 20][mt_rand(0, 7)]], 'tf' => (bool)mt_rand(0, 5)];
    }
    $js = implode("\n", $defs) . "\n" . <<<'JS'
let S={set:{}}; let E={}; function egpCfg(){ return E; }
const I=JSON.parse(require("fs").readFileSync(0,"utf8"));
process.stdout.write(JSON.stringify(I.map(f=>{ S.set.wdFee=f.fee; E=f.egp; return wdBreakdown(f.a/100, f.tf); })));
JS;
    $R = p2RunNode($js, $F);
    ok('Node çıktı verdi (600 örnek)', is_array($R) && count($R) === 600);
    if (!is_array($R)) {
        return;
    }
    $k = function ($tl) {
        return (int)round($tl * 100);
    };
    $bad = [];
    foreach ($F as $i => $f) {
        $p = Withdraw::breakdown($f['a'], $f['fee'], $f['egp'], $f['tf']);
        $j = $R[$i];
        if ($p['fee'] !== $k($j['fee']) || $p['brut'] !== $k($j['brut']) || abs($p['stopajPct'] - $j['stopajPct']) > 1e-9 || $p['stopaj'] !== $k($j['stopaj']) || $p['net'] !== $k($j['net'])) {
            $bad[] = ['f' => $f, 'js' => $j, 'php' => $p];
        }
    }
    ok('wdBreakdown(): ücret / brüt / stopaj / net = JS (600 örnek)', !$bad, array_slice($bad, 0, 3));
});

section('p3-tc', function () {
    $db = p3Db();
    ok('TC geçerli/geçersiz', Kimlik::valid(P3_TC1) && Kimlik::valid(P3_TC2) && !Kimlik::valid('12345678901') && !Kimlik::valid('01234567890'));
    ok('maske 3+6+2', Kimlik::mask(P3_TC1) === '100******46');
    ok('HMAC (pepper) — düz sha256 değil', Kimlik::hash(P3_TC1) !== hash('sha256', P3_TC1 . '|yangpazar') && strlen(Kimlik::hash(P3_TC1)) === 64);
    ok('NVİ zarfı: büyük harf (i → İ), doğum yılı', strpos(Nvi::envelope(P3_TC1, 'ilker', 'şimşek', 1990), '<Ad>İLKER</Ad><Soyad>ŞİMŞEK</Soyad><DogumYili>1990</DogumYili>') !== false);
    ok('NVİ yanıtı: true/false/bozuk', Nvi::parse('<TCKimlikNoDogrulaResult>true</TCKimlikNoDogrulaResult>') === 'ok'
        && Nvi::parse('<TCKimlikNoDogrulaResult>false</TCKimlikNoDogrulaResult>') === 'fail' && Nvi::parse('<html>502</html>') === 'down');
    $a = p3Member($db, 'TcA', P3_TC1);
    ok('NVİ ok → doğrulandı, şifreli + maske', (int)$a['tc_ok'] === 1 && $a['tc_mask'] === '100******46' && strpos($a['tc_enc'], P3_TC1) === false && Kimlik::full($a) === P3_TC1);
    $p = Kimlik::present($a);
    ok('üye görünümü maskeli (numara yok)', $p['mask'] === '100******46' && $p['full'] === true && strpos(json_encode($p), P3_TC1) === false);
    $b = mkUser($db, 'TcB', ['ad' => 'Ayşe', 'soyad' => 'Kaya']);
    $e = throws(function () use ($db, $b) {
        Kimlik::verify($db, $b, ['tc' => P3_TC1, 'dt' => '1991-01-01']);
    });
    ok('aynı TC ikinci hesapta → 422', $e instanceof HttpError && $e->http === 422 && strpos($e->getMessage(), 'başka bir hesapta') !== false);
    Nvi::$fn = function () {
        return 'fail';
    };
    for ($i = 0; $i < 5; $i++) {
        throws(function () use ($db, $b) {
            Kimlik::verify($db, $b, ['tc' => P3_TC2, 'dt' => '1991-01-01']);
        });
    }
    $b2 = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$b['id']]);
    ok('NVİ eşleşmedi 5 kez → 24 saat kilit', (int)$b2['tc_ok'] === 0 && (int)$b2['tc_lock_until'] > yp_now_ms());
    $e = throws(function () use ($db, $b) {
        Kimlik::verify($db, $b, ['tc' => P3_TC2, 'dt' => '1991-01-01']);
    });
    ok('kilitliyken 429', $e instanceof HttpError && $e->http === 429);
    Nvi::$fn = function () {
        return 'down';
    };
    $c = mkUser($db, 'TcC', ['ad' => 'Can', 'soyad' => 'Er']);
    $r = Kimlik::verify($db, $c, ['tc' => P3_TC2, 'dt' => '1990-02-02']);
    $c = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$c['id']]);
    ok('NVİ ulaşılamıyor → inceleme (Türkçe mesaj), numara kaydedildi, doğrulanmadı', $r['state'] === 'inceleme' && strpos($r['msg'], 'elle kontrol') !== false
        && $c['tc_state'] === 'inceleme' && (int)$c['tc_ok'] === 0 && Kimlik::hasFull($c));
    $e = throws(function () use ($db, $c) {
        p3Req($db, $c, ['amount' => 50, 'iban' => P3_IBAN, 'bank' => 'Ziraat', 'name' => 'Can Er']);
    });
    ok('incelemedeyken çekim yok', $e instanceof HttpError && $e->errCode === 'tc_review');
    $adm = mkUser($db, 'TcAdm', ['role' => 'admin']);
    Kimlik::approveManual($db, $adm, $c);
    ok('ekip elle onayladı', (int)$db->val('SELECT tc_ok FROM {users} WHERE id=?', [(int)$c['id']]) === 1);
    $e = throws(function () use ($db) {
        Kimlik::verify($db, mkUser($db, 'TcKid', ['ad' => 'Küçük', 'soyad' => 'Üye']), ['tc' => '11111111110', 'dt' => date('Y-m-d', time() - 10 * 365 * 86400)]);
    });
    ok('18 yaş altı → 422', $e instanceof HttpError && $e->http === 422);
    // eski kayıt: doğrulanmış, tam numara yok → tam numara onayı (maske eşleşmeli)
    $d = mkUser($db, 'TcD', ['tc_ok' => 1, 'tc_mask' => '111******10', 'ad' => 'Eski', 'soyad' => 'Kayit']);
    $e = throws(function () use ($db, $d) {
        Kimlik::confirm($db, $d, P3_TC2);
    });
    ok('tam numara onayı: maske uyuşmuyor → 422', $e instanceof HttpError && $e->http === 422);
    Kimlik::confirm($db, $d, '11111111110');
    ok('tam numara onaylandı', Kimlik::full($db->one('SELECT * FROM {users} WHERE id=?', [(int)$d['id']])) === '11111111110');
    Kimlik::reset($db, $adm, $a);
    $a = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$a['id']]);
    ok('tc-reset: alanlar temizlendi', (int)$a['tc_ok'] === 0 && $a['tc_enc'] === null && $a['tc_hash'] === null);
    ok('reveal audit\'e yazıldı', Kimlik::reveal($db, $adm, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$c['id']])) === P3_TC2
        && (int)$db->val("SELECT COUNT(*) FROM {audit_log} WHERE action='tc_reveal'") === 1);
});

section('p3-withdraw', function () {
    $db = p3Db();
    $adm = mkUser($db, 'WdAdm', ['role' => 'admin']);
    $u = p3Member($db, 'WdUye', P3_TC1);
    Settings::set('wdFee', ['on' => true, 'type' => 'sabit', 'val' => 5, 'min' => 0, 'max' => 0]);
    Settings::set('egp', array_merge(Settings::get('egp'), ['stopaj' => 0, 'company' => 'Test Ltd', 'seri' => 'YGP']));
    p3Fund($db, $adm, $u, 30000, true);   // çekilebilir 300
    p3Fund($db, $adm, $u, 50000, false);  // kart/bonus 500 (çekilemez)
    $new = ['iban' => P3_IBAN, 'bank' => 'Ziraat Bankası', 'name' => 'Deniz Yılmaz', 'save' => true];
    $e = throws(function () use ($db, $u, $new) {
        p3Req($db, $u, ['amount' => 400] + $new);
    });
    ok('çekilebilirden fazla (kart bakiyesi var) → 409, Türkçe', $e instanceof HttpError && $e->http === 409 && strpos($e->getMessage(), 'Kart, mobil ödeme') !== false);
    $e = throws(function () use ($db, $u, $new) {
        p3Req($db, $u, ['amount' => 10] + $new);
    });
    ok('en az çekim (50 TL)', $e instanceof HttpError && strpos($e->getMessage(), 'En az') !== false);
    $e = throws(function () use ($db, $u, $new) {
        p3Req($db, $u, ['amount' => 100, 'name' => 'Başka Biri'] + $new);
    });
    ok('IBAN sahibi üyenin adı olmalı → 422', $e instanceof HttpError && $e->http === 422 && strpos($e->getMessage(), 'aynı olmalı') !== false);
    $w = p3Req($db, $u, ['amount' => 100, 'name' => 'deniz  YILMAZ'] + $new);
    ok('talep: ücret 5, net 95; bakiye hemen ayrıldı', (int)$w['fee'] === 500 && (int)$w['net'] === 9500 && Ledger::wallet($db, $u['id'])['cash'] === 20000);
    ok('IBAN kaydedildi (şifreli)', (int)$db->val('SELECT COUNT(*) FROM {user_ibans} WHERE user_id=?', [(int)$u['id']]) === 1);
    ok('defter: PAYABLE:WD = bekleyen', Ledger::balance($db, 'PAYABLE:WD') === 10000 && Ledger::check($db)['ok']);
    $mv = json_encode(Withdraw::memberView($w), JSON_UNESCAPED_UNICODE);
    ok('üye görünümünde gider/pusula/VUK/ETTN yok, IBAN maskeli', !preg_match('/gider|pusula|VUK|ETTN|egp/i', $mv) && strpos($mv, P3_IBAN) === false);
    $notif = (string)$db->val('SELECT x FROM {notifications} WHERE user_id=? ORDER BY id DESC LIMIT 1', [(int)$u['id']]);
    ok('bildirim: net tutar, pusula ifadesi yok', strpos($notif, '₺95,00') !== false && !preg_match('/gider|pusula/i', $notif));
    // onay iki kez → tek numara
    list($w1, $st1) = $db->tx(function (Db $db) use ($adm, $w) {
        return Withdraw::approve($db, $adm, $w['id']);
    });
    list($w2, $st2) = $db->tx(function (Db $db) use ($adm, $w) {
        return Withdraw::approve($db, $adm, $w['id']);
    });
    $yr = date('Y');
    ok('onay: YGP' . $yr . '000000001, ETTN UUIDv4', $w1['egp_no'] === 'YGP' . $yr . '000000001' && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $w1['egp_ettn']));
    ok('ikinci onay: aynı numara, defter değişmedi', $st2 === 'already' && $w2['egp_no'] === $w1['egp_no'] && (int)$db->val("SELECT COUNT(*) FROM {journal} WHERE kind='cekim_odendi'") === 1);
    ok('defter: BANK:OUT 95, REV:cekim 5, PAYABLE 0', Ledger::balance($db, 'BANK:OUT') === 9500 && Ledger::balance($db, 'REV:cekim') === 500 && Ledger::balance($db, 'PAYABLE:WD') === 0 && Ledger::check($db)['ok']);
    $d = Withdraw::docView($db, $w1);
    ok('pusula: TAM TC, sistem adı, telefon (maske değil)', $d['tckn'] === P3_TC1 && $d['sellerName'] === 'Deniz Yılmaz' && $d['tel'] !== '' && strpos(json_encode($d), '******') === false);
    $e = throws(function () use ($db, $adm, $w) {
        $db->tx(function (Db $db) use ($adm, $w) {
            Withdraw::reject($db, $adm, $w['id'], 'Geç kaldı');
        });
    });
    ok('onaylanmış talep reddedilemez', $e instanceof HttpError && $e->http === 409);
    // red → iade
    $w3 = p3Req($db, $u, ['amount' => 60, 'iban' => 'ib' . $db->val('SELECT id FROM {user_ibans} WHERE user_id=?', [(int)$u['id']])]);
    ok('kayıtlı IBAN ile talep', $w3['bank'] === 'Ziraat Bankası' && Ledger::wallet($db, $u['id'])['cash'] === 14000);
    $e = throws(function () use ($db, $adm, $w3) {
        $db->tx(function (Db $db) use ($adm, $w3) {
            Withdraw::reject($db, $adm, $w3['id'], '');
        });
    });
    ok('red gerekçesiz → 422', $e instanceof HttpError && $e->http === 422);
    $db->tx(function (Db $db) use ($adm, $w3) {
        Withdraw::reject($db, $adm, $w3['id'], 'IBAN hesap sahibi uyuşmuyor');
    });
    ok('red: tutar çekilebilir bakiyeye iade, ücret yok', Ledger::wallet($db, $u['id'])['cash'] === 20000 && Ledger::balance($db, 'PAYABLE:WD') === 0 && Ledger::check($db)['ok']);
    // doğrulanmış ama tam numarası olmayan eski kayıt → talep engellenir (önce numara onayı)
    $v = mkUser($db, 'WdNoTc', ['ad' => 'Mert', 'soyad' => 'Ak', 'tc_ok' => 1, 'tc_mask' => '123******50']);
    p3Fund($db, $adm, $v, 10000, true);
    $e = throws(function () use ($db, $v) {
        p3Req($db, $v, ['amount' => 50, 'iban' => P3_IBAN, 'bank' => 'Ziraat', 'name' => 'Mert Ak']);
    });
    ok('tam TC kayıtlı değil → 409 tc_full', $e instanceof HttpError && $e->errCode === 'tc_full');
    // TC zorunlu değilse talep olur; onayda pusula kesilmez (numara tüketilmez), ekip tam numarayı girince kesilir
    Settings::set('tc', ['req' => false]);
    $z = mkUser($db, 'WdTcsiz', ['ad' => 'Zeki', 'soyad' => 'Su']);
    p3Fund($db, $adm, $z, 10000, true);
    $wz = p3Req($db, $z, ['amount' => 50, 'iban' => P3_IBAN, 'bank' => 'Ziraat', 'name' => 'Zeki Su']);
    list($wz1, , $notc) = $db->tx(function (Db $db) use ($adm, $wz) {
        return Withdraw::approve($db, $adm, $wz['id']);
    });
    ok('TC yok: ödendi, pusula yok (noTc), sıra tüketilmedi', $notc === true && $wz1['egp_no'] === null && $wz1['status'] === 'onaylandı'
        && (int)$db->val("SELECT next_no FROM {doc_sequences} WHERE series='EGP:YGP'") === 2);
    $e = throws(function () use ($db, $adm, $wz) {
        $db->tx(function (Db $db) use ($adm, $wz) {
            Withdraw::issueFor($db, $adm, $wz['id'], []);
        });
    });
    ok('tam TC olmadan pusula kesilmez → 409', $e instanceof HttpError && $e->errCode === 'tc_full');
    Kimlik::setFull($db, $adm, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$z['id']]), P3_TC2);
    list($wz2) = $db->tx(function (Db $db) use ($adm, $wz) {
        return Withdraw::issueFor($db, $adm, $wz['id'], ['desc' => 'Özel açıklama']);
    });
    ok('ekip tam TC girdi → pusula 2. sıra, açıklama', $wz2['egp_no'] === 'YGP' . $yr . '000000002' && Withdraw::doc($wz2)['desc'] === 'Özel açıklama'
        && Withdraw::doc($wz2)['tckn'] === P3_TC2);
    list($wz3) = $db->tx(function (Db $db) use ($adm, $wz) {
        return Withdraw::issueFor($db, $adm, $wz['id'], ['desc' => 'Güncel açıklama']);
    });
    ok('güncelleme: numara ve ETTN korunur, açıklama değişir', $wz3['egp_no'] === $wz2['egp_no'] && $wz3['egp_ettn'] === $wz2['egp_ettn'] && Withdraw::doc($wz3)['desc'] === 'Güncel açıklama');
    // seri boşluksuz: 5 talep ardışık onay
    p3Fund($db, $adm, $u, 30000, true);
    $nos = [];
    for ($i = 0; $i < 5; $i++) {
        $x = p3Req($db, $u, ['amount' => 50, 'iban' => P3_IBAN, 'bank' => 'Ziraat', 'name' => 'Deniz Yılmaz']);
        if ($i === 2) {
            // ortada hata: onay işlemi geri alınırsa numara da geri alınır
            throws(function () use ($db, $adm, $x) {
                $db->tx(function (Db $db) use ($adm, $x) {
                    Withdraw::approve($db, $adm, $x['id']);
                    throw new RuntimeException('test geri alma');
                });
            });
        }
        list($y) = $db->tx(function (Db $db) use ($adm, $x) {
            return Withdraw::approve($db, $adm, $x['id']);
        });
        $nos[] = (int)substr($y['egp_no'], -9);
    }
    ok('numaralar boşluksuz (geri alınan onay numara tüketmedi): 3..7', $nos === [3, 4, 5, 6, 7], $nos);
    ok('defter tutarlı', Ledger::check($db)['ok'], Ledger::check($db));
    $sv = Withdraw::staffView($db, $db->one('SELECT * FROM {withdrawals} WHERE id=?', [(int)$w['id']]));
    ok('yönetim görünümü: tam IBAN, açıklama, belge no', $sv['iban'] === 'TR33 0006 1005 1978 6457 8413 26' && strpos($sv['desc'], 'TR33 0006') !== false && $sv['egp']['no'] === $w1['egp_no']);
    Settings::set('site', array_merge(Settings::get('site'), ['wdDailyMax' => 100]));
    p3Fund($db, $adm, $u, 50000, true);
    $e = throws(function () use ($db, $u) {
        p3Req($db, $u, ['amount' => 60, 'iban' => P3_IBAN, 'bank' => 'Ziraat', 'name' => 'Deniz Yılmaz']);
    });
    ok('günlük üst sınır (açılış haftası) → 422', $e instanceof HttpError && strpos($e->getMessage(), 'Günlük en fazla') !== false);
});

section('p3-accounting', function () {
    $db = p3Db();
    $adm = mkUser($db, 'AcAdm', ['role' => 'admin']);
    Integrations::save($db, $adm, 'parasut', ['company_id' => '12345', 'client_id' => 'client_abcdef12', 'client_secret' => 'secret_abcdef12',
        'username' => 'muhasebe@ornek.com', 'password' => 'ParasutSifre1']);
    ok('Paraşüt ayarlı', Integrations::configured('parasut', $db));
    $u = p3Member($db, 'AcUye', P3_TC1);
    p3Fund($db, $adm, $u, 20000, true);
    $w = p3Req($db, $u, ['amount' => 100, 'iban' => P3_IBAN, 'bank' => 'Ziraat', 'name' => 'Deniz Yılmaz']);
    $db->tx(function (Db $db) use ($adm, $w) {
        Withdraw::approve($db, $adm, $w['id']);
    });
    ok('onay → kuyrukta 1 Paraşüt işi', (int)$db->val("SELECT COUNT(*) FROM {accounting_jobs} WHERE service='parasut' AND status='bekliyor'") === 1);
    $calls = 0;
    Net::$fn = function () use (&$calls) {
        $calls++;
        return ['ok' => false, 'code' => 0, 'body' => '', 'json' => null, 'error' => 'Bağlantı kurulamadı.'];
    };
    $r = Queue::run($db);
    $j = $db->one('SELECT * FROM {accounting_jobs}');
    ok('servis kapalı: başarısız, yeniden denenecek (1 dk sonra)', $r['failed'] === 1 && $j['status'] === 'bekliyor' && (int)$j['tries'] === 1
        && (int)$j['next_at'] > yp_now_ms() + 50000 && strpos($j['last_error'], 'ulaşılamadı') !== false, $j);
    ok('zamanı gelmeden tekrar denenmez', Queue::run($db)['failed'] === 0);
    ok('artan bekleme 1,2,4…dk, en çok 6 sa', Queue::backoff(1) === 60000 && Queue::backoff(3) === 240000 && Queue::backoff(20) === 21600000);
    $db->exec('UPDATE {accounting_jobs} SET next_at=0');
    $sent = [];
    Net::$fn = function ($m, $url, $o) use (&$sent) {
        $sent[] = [$m, $url, $o];
        return Net::fake($m, $url);
    };
    $r = Queue::run($db);
    $j = $db->one('SELECT * FROM {accounting_jobs}');
    ok('servis açıldı: kayıt gönderildi (tamam, 2. deneme)', $r['done'] === 1 && $j['status'] === 'tamam' && (int)$j['tries'] === 2);
    $bill = null;
    foreach ($sent as $x) {
        if (strpos($x[1], 'purchase_bills') !== false) {
            $bill = $x[2]['json'];
        }
    }
    ok('Paraşüt alış kaydı: belge no + brüt tutar', $bill && $bill['data']['attributes']['invoice_no'] === $db->val('SELECT egp_no FROM {withdrawals}') && (float)$bill['data']['attributes']['net_total'] === 100.0);
    ok('withdrawals.acct sonuç', json_decode($db->val('SELECT acct FROM {withdrawals}'), true)['parasut']['ok'] === true);
    ok('başarılı iş yeniden gönderilmez', Queue::run($db)['done'] === 0 && !Queue::retry($db, $adm, (int)$j['id']));
    // 8 denemede vazgeç → yöneticiye bildirim
    Queue::enqueue($db, 'cekim', 'w' . $w['id'], 'bizimhesap');
    Net::$fn = function () {
        return ['ok' => false, 'code' => 0, 'body' => '', 'json' => null, 'error' => 'Bağlantı kurulamadı.'];
    };
    Integrations::save($db, $adm, 'bizimhesap', ['firm_id' => 'AB12-CD34', 'api_key' => 'KEY-1234567890-22']);
    for ($i = 0; $i < 8; $i++) {
        $db->exec("UPDATE {accounting_jobs} SET next_at=0 WHERE service='bizimhesap'");
        Queue::run($db);
    }
    $jb = $db->one("SELECT * FROM {accounting_jobs} WHERE service='bizimhesap'");
    ok('8 başarısız deneme → hata + yöneticiye bildirim', $jb['status'] === 'hata' && (int)$jb['tries'] === 8
        && (int)$db->val("SELECT COUNT(*) FROM {notifications} WHERE user_id=? AND x LIKE '%Bizim Hesap muhasebe kaydı%'", [(int)$adm['id']]) === 1);
    ok('yeniden dene → bekliyor', Queue::retry($db, $adm, (int)$jb['id']) && $db->val('SELECT status FROM {accounting_jobs} WHERE id=?', [(int)$jb['id']]) === 'bekliyor');
    Net::$fn = null;
});

section('p3-integrations', function () {
    $db = p3Db();
    Paytr::$override = null;
    Paytr::clear();
    $adm = mkUser($db, 'InAdm', ['role' => 'admin']);
    ok('PayTR ayarsız', !Paytr::configured());
    $v = Integrations::save($db, $adm, 'paytr', ['merchant_id' => '123456', 'merchant_key' => 'AbCdEf1234567890', 'merchant_salt' => 'SaLt0987654321zz', 'test_mode' => true]);
    ok('kaydedildi, maskeli', $v['configured'] && $v['values']['merchant_key'] === '••••••90' && $v['values']['merchant_id'] === '12****');
    $raw = (string)$db->val("SELECT v FROM {settings} WHERE k='paytr'");
    ok('veritabanında şifreli (düz metin yok)', strpos($raw, 'AbCdEf') === false && (int)$db->val("SELECT secret FROM {settings} WHERE k='paytr'") === 1);
    Integrations::save($db, $adm, 'paytr', ['merchant_id' => '12****', 'merchant_key' => '', 'merchant_salt' => '••••••zz', 'max_installment' => 6]);
    $r = Integrations::raw('paytr', $db);
    ok('boş/maskeli gizli alan eski değeri korur', $r['merchant_key'] === 'AbCdEf1234567890' && $r['merchant_salt'] === 'SaLt0987654321zz' && $r['merchant_id'] === '123456' && $r['max_installment'] === 6);
    $e = throws(function () use ($db, $adm) {
        Integrations::save($db, $adm, 'paytr', ['merchant_id' => 'abc']);
    });
    ok('geçersiz değer → 422 alan hatası', $e instanceof HttpError && $e->http === 422 && isset($e->extra['fields']['merchant_id']));
    Paytr::clear();
    ok('PayTR yapılandırması tek kaynaktan (Entegrasyonlar)', Paytr::configured() && Paytr::config()['merchant_id'] === '123456');
    Integrations::$testFn['paytr'] = function () {
        return ['ok' => false, 'msg' => 'PayTR sunucusuna ulaşılamadı.'];
    };
    $t = Integrations::test($db, $adm, 'paytr', '127.0.0.1', 'https://ornek.com/');
    ok('bağlantı testi sonucu saklanır', $t['ok'] === false && Integrations::view('paytr', $db)['lastTest']['ok'] === false);
    Integrations::$testFn = [];
    // bildirim (Paytr::notify): yanlış hash, doğru hash ama tanınmayan sipariş
    $bad = Paytr::notify($db, ['merchant_oid' => 'YP1', 'status' => 'success', 'total_amount' => '1000', 'hash' => 'x']);
    ok('bildirim: yanlış hash → 400', $bad[0] === 400 && $bad[1] === 'PAYTR notification failed: bad hash');
    $h = yp_paytr_callback_hash('YPYOK1', 'SaLt0987654321zz', 'success', '1000', 'AbCdEf1234567890');
    ok('bildirim: doğru hash, tanınmayan sipariş → OK (bakiye yok)', Paytr::notify($db, ['merchant_oid' => 'YPYOK1', 'status' => 'success', 'total_amount' => '1000', 'hash' => $h]) === [200, 'OK']
        && (int)$db->val("SELECT COUNT(*) FROM {audit_log} WHERE action='paytr_unknown_oid'") === 1);
    Paytr::$override = false;
});
