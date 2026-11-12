<?php
/**
 * P2 birim testleri (tests/run.php içinden yüklenir): para kuralları, JS↔PHP parite (Node ile asıl ön yüz işlevleri),
 * çift taraflı defter özellik testi (rastgele işlem dizileri: her kayıt toplamı 0, cüzdanlar = postings, eksi bakiye yok,
 * havuz = açık siparişler), işlem içi Idempotency-Key, PayTR bildirimi (tekrar, hatalı tutar, test modu), kupon tek kullanım,
 * otomatik onay (YP_TEST_NOW), teslim kanıtı saklama, PayTR ayarı yokken otomatik kapalı yöntemler.
 */
if (PHP_SAPI !== 'cli' || !function_exists('section')) {
    exit;
}

use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Money\Deposits;
use YP\Money\IdemTx;
use YP\Money\Jobs;
use YP\Money\Ledger;
use YP\Money\Orders;
use YP\Money\Paytr;
use YP\Money\Rules;
use YP\Money\View;
use YP\Money\Wallet;
use YP\Settings;
use YP\Text;

function p2Db()
{
    $db = freshDb();
    Paytr::$override = false;
    Paytr::$tokenFn = null;
    return $db;
}
function p2Srv(Db $db)
{
    return $db->one("SELECT * FROM {servers} WHERE sec='tr' ORDER BY id LIMIT 1");
}
function p2Media(Db $db, $owner, $kind = 'proof', $mime = 'image/webp')
{
    $id = $db->insert('media', ['owner_id' => (int)$owner, 'kind' => $kind, 'vis' => 'private', 'path' => 'media/t/' . bin2hex(random_bytes(6)) . '.webp',
        'mime' => $mime, 'bytes' => 10, 'w' => 1, 'h' => 1, 'sha256' => '', 'orig_name' => '', 'ref_type' => '', 'ref_id' => null, 'created_at' => yp_now_ms()]);
    return 'm' . $id;
}
function p2Fund(Db $db, $admin, $user, $kurus, $w = true)
{
    return $db->tx(function (Db $db) use ($admin, $user, $kurus, $w) {
        return Wallet::adjust($db, $admin, $user, $kurus, $w, false, 'Test yüklemesi');
    });
}
function p2W(Db $db, $u)
{
    return Ledger::wallet($db, is_array($u) ? $u['id'] : $u);
}
function p2Node()
{
    return trim((string)@shell_exec('command -v node 2>/dev/null'));
}
/** src/js'den bir tanımı (const X = … ; ya da function X(){…}) metin olarak çıkarır */
function p2JsDef($src, $name)
{
    if (preg_match('/^const ' . preg_quote($name, '/') . ' = .*$/m', $src, $m)) {
        return $m[0];
    }
    if (preg_match('/^function ' . preg_quote($name, '/') . '\(.*$/m', $src, $m)) {
        $start = strpos($src, $m[0]);
        $depth = 0;
        $len = strlen($src);
        for ($i = strpos($src, '{', $start); $i < $len; $i++) {
            if ($src[$i] === '{') {
                $depth++;
            } elseif ($src[$i] === '}') {
                $depth--;
                if ($depth === 0) {
                    return substr($src, $start, $i - $start + 1);
                }
            }
        }
    }
    return null;
}
function p2RunNode($js, $input)
{
    $f = sys_get_temp_dir() . '/yp-p2-' . getmypid() . '-' . bin2hex(random_bytes(3)) . '.js';
    file_put_contents($f, $js);
    $proc = proc_open([p2Node(), $f], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    fwrite($pipes[0], json_encode($input, JSON_UNESCAPED_UNICODE));
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]);
    $err = stream_get_contents($pipes[2]);
    proc_close($proc);
    @unlink($f);
    $j = json_decode($out, true);
    if (!is_array($j)) {
        echo "      (node hata: " . substr($err, 0, 400) . ")\n";
    }
    return $j;
}

section('money-schema', function () {
    $db = p2Db();
    foreach (['accounts', 'journal', 'postings', 'deposits', 'coupons', 'coupon_uses', 'gateways', 'banks', 'crypto_nets', 'orders', 'order_events', 'order_messages', 'order_proofs', 'points_log'] as $t) {
        ok('tablo var: ' . $t, $db->tableExists($t));
    }
    ok('varsayılan yöntemler: paytr, paytr_eft, havale, kripto', array_column($db->all('SELECT id FROM {gateways} ORDER BY sort'), 'id') === ['paytr', 'paytr_eft', 'havale', 'kripto']);
    ok('MySQL DDL üretilir (enum onaylandı, FK)', strpos(implode("\n", YP\Schema::ddl('mysql')), "'onaylandı'") !== false);
});

section('money-rules', function () {
    ok('mulDiv yarım yukarı', Rules::mulDiv(5, 1, 10) === 1 && Rules::mulDiv(4, 1, 10) === 0 && Rules::mulDiv(15, 1, 10) === 2);
    ok('komisyon %8: 100,00 TL → 8,00', Rules::fee(10000, 800) === 800);
    ok('komisyon %7,5: 12,34 → 0,93', Rules::fee(1234, 750) === 93);
    ok('spend: önce kredi', Rules::split(1000, 300, 500) === [200, 300] && Rules::split(100, 300, 500) === null && Rules::split(0, 300, 200) === [0, 200]);
    ok('refundPart: önce kredi kısmı', Rules::refundSplit(700, 300, 400) === [100, 300]);
    ok('delMin', Rules::delMin('Anında') === 10 && Rules::delMin('5 dk') === 5 && Rules::delMin('1 saat') === 60 && Rules::delMin('24 saat') === 1440 && Rules::delMin('') === 10);
    $L = Rules::VIP0;
    ok('vip: 2.500 TL → Gümüş, 49.999,99 → Altın', Rules::vip(250000, $L)['id'] === 'gumus' && Rules::vip(4999999, $L)['id'] === 'altin' && Rules::vip(0, $L)['id'] === 'bronz');
    ok('rateFor: %8 − Elmas 2 = 6 → 600 bp', Rules::rateBp(8, 5000000, $L) === 600 && Rules::rateBp(1, 5000000, $L) === 0);
    ok('dopCost: vitrin 3 gün = 21 TL, acil 1 gün 4,5 TL', Rules::dopCost('vitrin', Rules::DOPINGS0['vitrin'], 3) === 2100 && Rules::dopCost('acil', Rules::DOPINGS0['acil'], 1) === 450);
    ok('kupon bonusu min(max, %)', Rules::couponBonus(100000, 500, 5000) === 5000 && Rules::couponBonus(20000, 500, 5000) === 1000);
    ok('puan → kuruş (ptRate 100): 500 puan = 5 TL', Rules::pointsToKurus(500, 100) === 500);
    ok('TL biçimi', Rules::tl(123450) === '₺1.234,50');
});

section('money-parity', function () {
    if (p2Node() === '') {
        ok('Node parite testi atlandı (node yok)', true);
        return;
    }
    $root = dirname(__DIR__) . '/src/js/';
    $core = file_get_contents($root . '00-core.js');
    $dom = file_get_contents($root . '02-domain.js');
    $act = file_get_contents($root . '75-actions-core.js');
    $mod = file_get_contents($root . '71-modals.js');
    $frm = file_get_contents($root . '81-form.js');
    $defs = [];
    foreach ([[$core, 'r2'], [$core, 'delMin'], [$core, 'VIP0'], [$dom, 'vip'], [$dom, 'rateFor'], [$dom, 'dopCost'], [$dom, 'spend'], [$dom, 'refundPart'], [$act, 'complete']] as $x) {
        $d = p2JsDef($x[0], $x[1]);
        ok('JS tanımı bulundu: ' . $x[1], $d !== null);
        $defs[] = $d;
    }
    // kupon bonusu ve hizmet bedeli: depCalc içindeki asıl ifadeler; puan dönüşümü: FORM.pts
    ok('depCalc ifadeleri bulundu', preg_match('/const bonus=c&&!used\?(r2\(Math\.min\(c\.max,a\*c\.pct\/100\)\)):0;/', $mod, $mb) && preg_match('/const fee=(r2\(a\*g\.fee\/100\));/', $mod, $mf)
        && preg_match('/const tl=(r2\(p\/S\.set\.ptRate\));/', $frm, $mp));
    mt_srand(20261111);
    $levels = Rules::VIP0;
    $F = ['orders' => [], 'spend' => [], 'dop' => [], 'del' => ['Anında', '5 dk', '15 dk', '30 dk', '1 saat', '3 saat', '24 saat', ''], 'cp' => [], 'pts' => []];
    $comms = [8, 7.5, 10, 5.25, 12, 1];
    for ($i = 0; $i < 400; $i++) {
        $total = mt_rand(1, 800000) * (mt_rand(0, 3) ? 1 : 10);
        $F['orders'][] = ['total' => $total, 'comm' => $comms[mt_rand(0, count($comms) - 1)], 'svol' => mt_rand(0, 6000000), 'bvol' => mt_rand(0, 6000000),
            'stars' => mt_rand(0, 5), 'rating' => mt_rand(100, 500) / 100];
        $cash = mt_rand(0, 100000);
        $credit = mt_rand(0, 100000);
        $F['spend'][] = ['cash' => $cash, 'credit' => $credit, 'a' => mt_rand(1, $cash + $credit + 1)];
        $k = ['vitrin', 'acil', 'renk'][mt_rand(0, 2)];
        $d = ['p' => mt_rand(100, 99999) / 100, 'pd' => mt_rand(0, 2) ? mt_rand(1, 9999) / 100 : 0, 'max' => 30];
        $F['dop'][] = ['k' => $k, 'd' => $d, 'days' => Rules::DOP_DAYS[mt_rand(0, 8)]];
        $F['cp'][] = ['a' => mt_rand(1000, 5000000), 'pct' => [5, 3, 10, 7.5, 2.25][mt_rand(0, 4)], 'max' => mt_rand(1, 300) * 100, 'fee' => [2.99, 0, 1.5, 3.49][mt_rand(0, 3)]];
        $F['pts'][] = ['p' => mt_rand(5, 500) * 100, 'rate' => [100, 50, 200, 75][mt_rand(0, 3)]];
    }
    $js = implode("\n", $defs) . "\n" . <<<'JS'
let S={set:{commission:8}}; let VIP=VIP0; let USERS={};
const user=id=>USERS[id]; const now=()=>0; const NUM=n=>String(n); const TL=n=>String(n);
function addTx(){} function addRev(){} function ledger(){} function refCheck(){} function notify(){}
const I=JSON.parse(require("fs").readFileSync(0,"utf8")); const out={orders:[],spend:[],dop:[],del:[],cp:[],pts:[]};
I.orders.forEach(f=>{ S.set.commission=f.comm; USERS={s:{id:'s',vol:f.svol/100,rating:f.rating,sales:0,bal:0},b:{id:'b',vol:f.bvol/100,pts:0}};
  const o={id:'S1',seller:'s',buyer:'b',total:f.total/100,title:'x',log:[]}; o.rate=rateFor('s'); complete(o,f.stars||undefined);
  out.orders.push({rate:o.rate,fee:o.fee,net:o.net,pts:o.pts,rating:USERS.s.rating,sbal:USERS.s.bal}); });
I.spend.forEach(f=>{ const u={bal:f.cash/100,bonus:f.credit/100}; const p=spend(u,f.a/100); out.spend.push({w:p.w,nw:p.nw}); });
I.dop.forEach(f=>{ S.dopings={[f.k]:f.d}; out.dop.push(dopCost(f.k,f.days)); });
I.del.forEach(s=>out.del.push(delMin(s)));
I.cp.forEach(f=>{ const c={max:f.cp_max||f.max/100,pct:f.pct}, a=f.a/100, g={fee:f.fee}; out.cp.push({bonus:__BONUS__, fee:__FEE__}); });
I.pts.forEach(f=>{ S.set.ptRate=f.rate; const p=f.p; out.pts.push(__PTS__); });
process.stdout.write(JSON.stringify(out));
JS;
    $js = str_replace(['__BONUS__', '__FEE__', '__PTS__'], [$mb[1], $mf[1], $mp[1]], $js);
    $R = p2RunNode($js, $F);
    ok('Node çıktı verdi', is_array($R) && count($R['orders']) === 400);
    if (!is_array($R)) {
        return;
    }
    $k = function ($tl) {
        return (int)round($tl * 100);
    };
    $bad = [];
    foreach ($F['orders'] as $i => $f) {
        $rate = Rules::rateBp($f['comm'], $f['svol'], $levels);
        $fee = Rules::fee($f['total'], $rate);
        $pts = Rules::points($f['total'], Rules::vip($f['bvol'], $levels)['cb']);
        $j = $R['orders'][$i];
        $rt = $f['stars'] ? Rules::rating($f['rating'], $f['stars']) : $f['rating'];
        if ($rate !== $k($j['rate']) || $fee !== $k($j['fee']) || $f['total'] - $fee !== $k($j['net']) || $pts !== (int)$j['pts'] || abs($rt - $j['rating']) > 0.0001 || $k($j['sbal']) !== $f['total'] - $fee) {
            $bad[] = ['f' => $f, 'js' => $j, 'php' => compact('rate', 'fee', 'pts', 'rt')];
        }
    }
    ok('complete(): oran/komisyon/net/puan/puanlama = JS (400 sipariş)', !$bad, array_slice($bad, 0, 3));
    $bad = [];
    foreach ($F['spend'] as $i => $f) {
        $s = Rules::split($f['cash'], $f['credit'], $f['a']);
        $j = $R['spend'][$i];
        if ($s === null) {
            if ($k($j['w']) <= $f['cash']) {
                $bad[] = ['f' => $f, 'js' => $j, 'php' => null];
            }
        } elseif ($s !== [$k($j['w']), $k($j['nw'])]) {
            $bad[] = ['f' => $f, 'js' => $j, 'php' => $s];
        }
    }
    ok('spend(): nakit/kredi ayrımı = JS (400; yetersizde PHP reddeder)', !$bad, array_slice($bad, 0, 3));
    $bad = [];
    foreach ($F['dop'] as $i => $f) {
        if (Rules::dopCost($f['k'], $f['d'], $f['days']) !== $k($R['dop'][$i])) {
            $bad[] = ['f' => $f, 'js' => $R['dop'][$i], 'php' => Rules::dopCost($f['k'], $f['d'], $f['days'])];
        }
    }
    ok('dopCost() = JS (400)', !$bad, array_slice($bad, 0, 3));
    $bad = [];
    foreach ($F['del'] as $i => $s) {
        if (Rules::delMin($s) !== $R['del'][$i]) {
            $bad[] = [$s, $R['del'][$i]];
        }
    }
    ok('delMin() = JS', !$bad, $bad);
    $bad = [];
    foreach ($F['cp'] as $i => $f) {
        $b = Rules::couponBonus($f['a'], Rules::bp($f['pct']), $f['max']);
        $fe = Rules::gwFee($f['a'], Rules::bp($f['fee']));
        if ($b !== $k($R['cp'][$i]['bonus']) || $fe !== $k($R['cp'][$i]['fee'])) {
            $bad[] = ['f' => $f, 'js' => $R['cp'][$i], 'php' => [$b, $fe]];
        }
    }
    ok('kupon bonusu + hizmet bedeli (depCalc) = JS (400)', !$bad, array_slice($bad, 0, 3));
    $bad = [];
    foreach ($F['pts'] as $i => $f) {
        if (Rules::pointsToKurus($f['p'], $f['rate']) !== $k($R['pts'][$i])) {
            $bad[] = ['f' => $f, 'js' => $R['pts'][$i]];
        }
    }
    ok('puan dönüşümü (FORM.pts) = JS (400)', !$bad, array_slice($bad, 0, 3));
});

section('ledger-core', function () {
    $db = p2Db();
    $a = mkUser($db, 'Defter1');
    $e = throws(function () use ($db, $a) {
        $db->tx(function (Db $db) use ($a) {
            Ledger::post($db, 'bonus', [], [[Ledger::credit($a['id']), 100], ['EXP:bonus', -99]]);
        });
    });
    ok('dengesiz kayıt reddedilir', $e instanceof RuntimeException && strpos($e->getMessage(), 'dengesiz') !== false);
    ok('dengesiz kayıttan iz kalmaz', (int)$db->val('SELECT COUNT(*) FROM {journal}') === 0 && p2W($db, $a)['credit'] === 0);
    ok('tx dışında post reddedilir', throws(function () use ($db, $a) {
        Ledger::post($db, 'bonus', [], [[Ledger::credit($a['id']), 100], ['EXP:bonus', -100]]);
    }) instanceof RuntimeException);
    ok('tamsayı olmayan tutar reddedilir', throws(function () use ($db, $a) {
        $db->tx(function (Db $db) use ($a) {
            Ledger::post($db, 'bonus', [], [[Ledger::credit($a['id']), 1.5], ['EXP:bonus', -1.5]]);
        });
    }) instanceof RuntimeException);
    $db->tx(function (Db $db) use ($a) {
        Ledger::post($db, 'bonus', ['user' => $a['id'], 'amount' => 500, 'meta' => ['m' => 'x']], [[Ledger::credit($a['id']), 500, 'Hediye'], ['EXP:bonus', -500]]);
    });
    ok('kayıt + cüzdan aynı işlemde', p2W($db, $a) === ['cash' => 0, 'credit' => 500] && Ledger::check($db)['ok']);
    $e = throws(function () use ($db, $a) {
        $db->tx(function (Db $db) use ($a) {
            Ledger::post($db, 'duzeltme', [], [[Ledger::credit($a['id']), -501], ['ADJ', 501]]);
        });
    });
    ok('eksi bakiye: InsufficientFunds, geri alınır', $e instanceof YP\Money\InsufficientFunds && p2W($db, $a)['credit'] === 500 && Ledger::check($db)['ok']);
    $db->exec('UPDATE {wallets} SET cash=cash+1 WHERE user_id=?', [(int)$a['id']]);
    $c = Ledger::check($db);
    ok('denetim: elle değiştirilmiş cüzdanı yakalar', !$c['ok'] && strpos(implode(' ', $c['errors']), 'Cüzdan uyuşmuyor') !== false);
    mkUser($db, 'Yonetici9', ['role' => 'admin']);
    Jobs::ledgerCheck($db);
    ok('tutarsızlık → yöneticiye bildirim + audit', (int)$db->val("SELECT COUNT(*) FROM {notifications} n JOIN {users} u ON u.id=n.user_id WHERE u.role='admin' AND n.x LIKE 'Defter%'") === 1
        && (int)$db->val("SELECT COUNT(*) FROM {audit_log} WHERE action='ledger_check_fail'") === 1);
});

section('orders-flow', function () {
    $db = p2Db();
    $adm = mkUser($db, 'Admin2', ['role' => 'admin']);
    $s = mkUser($db, 'Satici2');
    $b = mkUser($db, 'Alici2');
    $l = mkListing($db, $s['id'], p2Srv($db), ['price' => 12500, 'stock' => 2, 'del_txt' => '5 dk']);
    p2Fund($db, $adm, $b, 10000, true);
    p2Fund($db, $adm, $b, 5000, false);
    $o = $db->tx(function (Db $db) use ($b, $l) {
        return Orders::buy($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 'l' . $l['id'], ['qty' => 1, 'info' => 'KarakterAdi', 'ch' => '3', 'place' => 'Pazar alanı depocu']);
    });
    ok('satın alma: önce kredi (50) + nakit (75)', (int)$o['paid_credit'] === 5000 && (int)$o['paid_cash'] === 7500 && p2W($db, $b) === ['cash' => 2500, 'credit' => 0]);
    ok('havuz = 125 TL, stok 1', Ledger::balance($db, 'ESCROW:ORD') === 12500 && (int)$db->val('SELECT stock FROM {listings} WHERE id=?', [$l['id']]) === 1);
    ok('oran siparişte donduruldu (%8)', (int)$o['rate_bp'] === 800);
    ok('satıcıya "sold", alıcıya "order_new" bildirimi', (int)$db->val("SELECT COUNT(*) FROM {notifications} WHERE user_id=? AND ev='sold'", [$s['id']]) === 1
        && (int)$db->val("SELECT COUNT(*) FROM {notifications} WHERE user_id=? AND ev='order_new'", [$b['id']]) === 1);
    $e = throws(function () use ($db, $s, $l) {
        $db->tx(function (Db $db) use ($s, $l) {
            Orders::buy($db, $s, 'l' . $l['id'], ['info' => 'x']);
        });
    });
    ok('kendi ilanını alamaz', $e instanceof HttpError && $e->http === 409);
    $e = throws(function () use ($db, $b, $l) {
        $db->tx(function (Db $db) use ($b, $l) {
            Orders::buy($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 'l' . $l['id'], ['info' => 'x']);
        });
    });
    ok('bakiye yetersiz → 409 insufficient, iz yok', $e instanceof HttpError && $e->errCode === 'insufficient' && (int)$db->val('SELECT COUNT(*) FROM {orders}') === 1 && Ledger::check($db)['ok']);
    // Ön yüz şekli
    $po = View::order($db, $o, $b);
    ok('S.orders şekli', $po['id'] === 'S' . (100000 + $o['id']) && $po['status'] === 'odendi' && $po['total'] == 125 && $po['paid'] == ['nw' => 50, 'w' => 75]
        && $po['rate'] == 8 && $po['buyer'] === 'u' . $b['id'] && count($po['log']) === 2 && $po['chat'] === [] && !isset($po['dpre']));
    // teslim
    $ord = function () use ($db, $o) {
        return Orders::lock($db, (int)$o['id']);
    };
    $e = throws(function () use ($db, $ord, $b) {
        $db->tx(function (Db $db) use ($ord, $b) {
            Orders::deliver($db, $ord(), $b, ['dpre' => ['m1'], 'dpost' => ['m2']]);
        });
    });
    ok('alıcı teslim edemez', $e instanceof HttpError && $e->http === 403);
    $e = throws(function () use ($db, $ord, $s) {
        $db->tx(function (Db $db) use ($ord, $s) {
            Orders::deliver($db, $ord(), $s, ['dpre' => [p2Media($db, $s['id'])]]);
        });
    });
    ok('kanıtsız teslim → 422', $e instanceof HttpError && $e->http === 422);
    $bm = p2Media($db, $b['id']);
    $e = throws(function () use ($db, $ord, $s, $bm) {
        $db->tx(function (Db $db) use ($ord, $s, $bm) {
            Orders::deliver($db, $ord(), $s, ['dpre' => [$bm], 'dpost' => [p2Media($db, $s['id'])]]);
        });
    });
    ok('başkasının dosyası kanıt olamaz', $e instanceof HttpError && $e->http === 422);
    $db->tx(function (Db $db) use ($ord, $s) {
        Orders::ready($db, $ord(), $s);
        Orders::deliver($db, $ord(), $s, ['dpre' => [p2Media($db, $s['id'])], 'dpost' => [p2Media($db, $s['id'])], 'dvid' => p2Media($db, $s['id'], 'proof', 'video/mp4'), 'note' => 'ara 0555 123 45 67']);
    });
    $o2 = Orders::row($db, $o['id']);
    ok('teslim: durum teslim, kanıtlar bağlı', $o2['status'] === 'teslim' && (int)$db->val('SELECT COUNT(*) FROM {order_proofs} WHERE order_id=?', [$o['id']]) === 3);
    ok('teslim notu sansürlü mesaj + flagged', strpos($db->val('SELECT x FROM {order_messages} WHERE order_id=?', [$o['id']]), '[gizlendi]') !== false && (int)$db->val('SELECT COUNT(*) FROM {flagged}') === 1);
    ok('kanıtları satıcı ve yetkili görür, alıcı görmez', isset(View::order($db, $o2, $s)['dpre'][0]) && isset(View::order($db, $o2, $adm)['dvid']) && !isset(View::order($db, $o2, $b)['dpre']));
    $mid = (int)$db->val("SELECT media_id FROM {order_proofs} WHERE order_id=? AND grp='dpre'", [$o['id']]);
    $mrow = $db->one('SELECT * FROM {media} WHERE id=?', [$mid]);
    ok('Media::canView: alıcı teslim kanıtını göremez', !YP\Media::canView($b, $mrow) && YP\Media::canView($s, $mrow) && YP\Media::canView($adm, $mrow));
    $e = throws(function () use ($db, $ord, $b) {
        $db->tx(function (Db $db) use ($ord, $b) {
            Orders::guarantee($db, $ord(), $b);
        });
    });
    ok('teslim edilmiş siparişte garanti yok', $e instanceof HttpError && $e->http === 409);
    $db->tx(function (Db $db) use ($ord, $b) {
        Orders::confirm($db, $ord(), $b, 4);
    });
    $o3 = Orders::row($db, $o['id']);
    ok('onay: satıcıya net 115 TL nakit, komisyon 10 TL', p2W($db, $s)['cash'] === 11500 && Ledger::balance($db, 'REV:commission') === 1000 && (int)$o3['fee'] === 1000 && $o3['status'] === 'tamam');
    $su = $db->one('SELECT * FROM {users} WHERE id=?', [$s['id']]);
    $bu = $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]);
    ok('satıcı satış/hacim/puanlama, alıcı puan (bronz cb .5 → 63)', (int)$su['sales'] === 1 && (int)$su['vol'] === 12500 && abs((float)$su['rating'] - 4.95) < 0.001
        && (int)$bu['pts'] === 63 && (int)$bu['vol'] === 12500 && (int)$o3['pts'] === 63);
    ok('havuz 0 + denetim temiz', Ledger::balance($db, 'ESCROW:ORD') === 0 && Ledger::check($db)['ok']);
    ok('S.tx: alıcı ve satıcı hareketleri', (function () use ($db, $b, $s) {
        list($tb) = View::txList($db, $b['id']);
        list($ts) = View::txList($db, $s['id']);
        return $tb[0]['l'] === 'Satın alma #S' . (100000 + 1) && $tb[0]['a'] == -125 && $ts[0]['a'] == 115 && strpos($ts[0]['l'], 'komisyon %8') !== false;
    })());
    $e = throws(function () use ($db, $ord, $b) {
        $db->tx(function (Db $db) use ($ord, $b) {
            Orders::confirm($db, $ord(), $b, 5);
        });
    });
    ok('ikinci onay → 409, çift ödeme yok', $e instanceof HttpError && $e->http === 409 && p2W($db, $s)['cash'] === 11500);
    // S.ledger satırı
    $j = $db->one("SELECT * FROM {journal} WHERE kind='satis'");
    $lr = View::ledgerRow($j);
    ok('S.ledger satis: a=total, fee, net, ref', $lr['k'] === 'satis' && $lr['a'] == 125 && $lr['fee'] == 10 && $lr['net'] == 115 && $lr['ref'] === 'S100001' && $lr['u'] === 'u' . $s['id']);
});

section('orders-dispute-refund', function () {
    $db = p2Db();
    $adm = mkUser($db, 'Admin3', ['role' => 'admin']);
    $s = mkUser($db, 'Satici3');
    $b = mkUser($db, 'Alici3');
    $l = mkListing($db, $s['id'], p2Srv($db), ['price' => 4000, 'stock' => 1, 'del_txt' => 'Anında']);
    p2Fund($db, $adm, $b, 3000, false);
    p2Fund($db, $adm, $b, 5000, true);
    $buy = function () use ($db, $b, $l) {
        return $db->tx(function (Db $db) use ($b, $l) {
            return Orders::buy($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 'l' . $l['id'], ['info' => 'Kar']);
        });
    };
    $o = $buy();
    ok('stok 1 → satildi', $db->val('SELECT status FROM {listings} WHERE id=?', [$l['id']]) === 'satildi');
    $db->tx(function (Db $db) use ($o, $b) {
        Orders::dispute($db, Orders::lock($db, (int)$o['id']), $b, ['r' => 'Ürün teslim edilmedi', 'd' => 'Satıcı gelmedi', 'media' => [p2Media($db, $b['id'], 'dispute')]]);
    });
    $x = Orders::row($db, $o['id']);
    ok('itiraz: durum itiraz, gerekçe, satıcıya bildirim', $x['status'] === 'itiraz' && $x['reason'] === 'Ürün teslim edilmedi: Satıcı gelmedi'
        && (int)$db->val("SELECT COUNT(*) FROM {notifications} WHERE user_id=? AND ev='dispute'", [$s['id']]) === 1);
    ok('itiraz kanıtını iki taraf da görür', isset(View::order($db, $x, $s)['proof']) && YP\Media::canView($s, $db->one("SELECT m.* FROM {media} m JOIN {order_proofs} p ON p.media_id=m.id WHERE p.grp='dispute'")));
    $db->tx(function (Db $db) use ($o, $adm) {
        Orders::resolve($db, Orders::lock($db, (int)$o['id']), $db->one('SELECT * FROM {users} WHERE id=?', [$adm['id']]), 'buyer');
    });
    ok('alıcı lehine: kovalara aynen iade (30 kredi + 10 nakit), stok geri', p2W($db, $b) === ['cash' => 5000, 'credit' => 3000]
        && $db->val('SELECT status FROM {listings} WHERE id=?', [$l['id']]) === 'aktif' && (int)$db->val('SELECT stock FROM {listings} WHERE id=?', [$l['id']]) === 1);
    ok('karar audit kaydı', (int)$db->val("SELECT COUNT(*) FROM {audit_log} WHERE action='order_resolve'") === 1 && Ledger::check($db)['ok']);
    // satıcı lehine (itiraz) → tamamlanır
    $o = $buy();
    $db->tx(function (Db $db) use ($o, $b) {
        Orders::dispute($db, Orders::lock($db, (int)$o['id']), $b, ['r' => 'Diğer', 'd' => 'İnceleyin lütfen']);
    });
    $db->tx(function (Db $db) use ($o, $adm) {
        Orders::resolve($db, Orders::lock($db, (int)$o['id']), $db->one('SELECT * FROM {users} WHERE id=?', [$adm['id']]), 'seller');
    });
    ok('satıcı lehine: tamam, satıcıya net', Orders::row($db, $o['id'])['status'] === 'tamam' && p2W($db, $s)['cash'] === 4000 - Rules::fee(4000, 800) && Ledger::check($db)['ok']);
    // teslim garantisi: süre sunucu saatine göre
    $db->exec("UPDATE {listings} SET stock=1, status='aktif' WHERE id=?", [$l['id']]);
    $o = $buy();
    $e = throws(function () use ($db, $o, $b) {
        $db->tx(function (Db $db) use ($o, $b) {
            Orders::guarantee($db, Orders::lock($db, (int)$o['id']), $b);
        });
    });
    ok('garanti: süre dolmadan → 409 not_late', $e instanceof HttpError && $e->errCode === 'not_late');
    $db->exec('UPDATE {orders} SET created_at=? WHERE id=?', [yp_now_ms() - 21 * 60000, (int)$o['id']]); // Anında: 10 dk × 2
    $before = p2W($db, $b);
    $db->tx(function (Db $db) use ($o, $b) {
        Orders::guarantee($db, Orders::lock($db, (int)$o['id']), $b);
    });
    ok('garanti: süre dolunca anında iade', Orders::row($db, $o['id'])['status'] === 'iade' && p2W($db, $b)['cash'] + p2W($db, $b)['credit'] === $before['cash'] + $before['credit'] + 4000);
    ok('sipariş mesajı kapanmış siparişte reddedilir', throws(function () use ($db, $o, $b) {
        $db->tx(function (Db $db) use ($o, $b) {
            Orders::chat($db, Orders::lock($db, (int)$o['id']), $b, 'merhaba');
        });
    }) instanceof HttpError);
});

section('orders-autoconfirm', function () {
    $db = p2Db();
    $adm = mkUser($db, 'Admin4', ['role' => 'admin']);
    $s = mkUser($db, 'Satici4');
    $b = mkUser($db, 'Alici4');
    $l = mkListing($db, $s['id'], p2Srv($db), ['price' => 1000, 'stock' => 5]);
    p2Fund($db, $adm, $b, 10000, true);
    $o = $db->tx(function (Db $db) use ($b, $l, $s) {
        $o = Orders::buy($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 'l' . $l['id'], ['info' => 'Kar']);
        Orders::deliver($db, Orders::lock($db, (int)$o['id']), $s, ['dpre' => [p2Media($db, $s['id'])], 'dpost' => [p2Media($db, $s['id'])]]);
        return $o;
    });
    $t0 = (int)Orders::row($db, $o['id'])['delivered_at'];
    $run = function ($at) use ($db) {
        putenv('YP_TEST=1');
        putenv('YP_TEST_NOW=' . $at);
        try {
            return Orders::autoConfirm($db);
        } finally {
            putenv('YP_TEST_NOW');
            putenv('YP_TEST');
        }
    };
    ok('22 saat sonra: işlem yok', $run($t0 + 22 * Rules::H) === ['warned' => 0, 'confirmed' => 0]);
    ok('23,5 saat: uyarı (bir kez)', $run($t0 + 23 * Rules::H + 1800000) === ['warned' => 1, 'confirmed' => 0] && $run($t0 + 23 * Rules::H + 1900000)['warned'] === 0
        && (int)$db->val("SELECT COUNT(*) FROM {notifications} WHERE ev='autosoon'") === 1);
    ok('24 saat + 1 dk: otomatik onay, satıcıya net', $run($t0 + 24 * Rules::H + 60000)['confirmed'] === 1 && Orders::row($db, $o['id'])['status'] === 'tamam'
        && p2W($db, $s)['cash'] === 920 && $db->val('SELECT x FROM {order_events} WHERE order_id=? ORDER BY id DESC LIMIT 1', [$o['id']]) === 'Süre dolduğu için otomatik onaylandı.');
    ok('tekrar çalıştırma: çift ödeme yok', $run($t0 + 25 * Rules::H)['confirmed'] === 0 && p2W($db, $s)['cash'] === 920 && Ledger::check($db)['ok']);
    ok('cron görevleri kayıtlı', isset(YP\Cron::tasks()['autoconfirm'], YP\Cron::tasks()['deposit_expiry'], YP\Cron::tasks()['ledger_check'], YP\Cron::tasks()['proof_retention']));
    // kanıt saklama: kapanmış sipariş + 90 günden eski kanıt
    $db->exec('UPDATE {media} SET created_at=? WHERE kind=?', [yp_now_ms() - 91 * Rules::D, 'proof']);
    ok('91 günlük kanıtlar silinir (kapanmış sipariş)', Orders::purgeProofs($db, 90) === 2 && (int)$db->val('SELECT COUNT(*) FROM {order_proofs}') === 0);
});

section('referral-points', function () {
    $db = p2Db();
    $adm = mkUser($db, 'Admin5', ['role' => 'admin']);
    $R = mkUser($db, 'Davetci');
    $b = mkUser($db, 'Davetli', ['ref_by' => null]);
    $db->update('users', ['ref_by' => (int)$R['id']], 'id=?', [(int)$b['id']]);
    $s = mkUser($db, 'Satici5');
    $l = mkListing($db, $s['id'], p2Srv($db), ['price' => 5000, 'stock' => 5]);
    p2Fund($db, $adm, $b, 100000, true);
    $flow = function ($price) use ($db, $b, $l, $s) {
        $db->update('listings', ['price' => $price], 'id=?', [(int)$l['id']]);
        return $db->tx(function (Db $db) use ($b, $l, $s) {
            $o = Orders::buy($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 'l' . $l['id'], ['info' => 'Kar']);
            Orders::deliver($db, Orders::lock($db, (int)$o['id']), $s, ['dpre' => [p2Media($db, $s['id'])], 'dpost' => [p2Media($db, $s['id'])]]);
            Orders::confirm($db, Orders::lock($db, (int)$o['id']), $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), null);
            return $o;
        });
    };
    $flow(5000); // 50 TL < refMin 100
    ok('refMin altı: ödül yok', p2W($db, $R)['credit'] === 0);
    $flow(15000);
    ok('ilk uygun alışveriş: davet edene 25, davetliye 10 TL kredi', p2W($db, $R)['credit'] === 2500 && p2W($db, $b)['credit'] === 1000
        && (int)$db->val('SELECT refs FROM {users} WHERE id=?', [$R['id']]) === 1);
    $flow(15000);
    ok('davet ödülü bir kez', p2W($db, $R)['credit'] === 2500 && Ledger::check($db)['ok']);
    $pts = (int)$db->val('SELECT pts FROM {users} WHERE id=?', [$b['id']]);
    ok('alıcı puanı birikti (bronz .5 × 350 TL = 175)', $pts === 175, $pts);
    $db->update('users', ['pts' => 1250], 'id=?', [(int)$b['id']]);
    $e = throws(function () use ($db, $b) {
        $db->tx(function (Db $db) use ($b) {
            Wallet::convertPoints($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 400);
        });
    });
    ok('500 puan altı → 422', $e instanceof HttpError && $e->http === 422);
    $cr = p2W($db, $b)['credit'];
    $db->tx(function (Db $db) use ($b) {
        Wallet::convertPoints($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 1250);
    });
    ok('1250 → 1200 puan çevrilir = 12 TL kredi, 50 puan kalır', p2W($db, $b)['credit'] === $cr + 1200 && (int)$db->val('SELECT pts FROM {users} WHERE id=?', [$b['id']]) === 50);
    ok('yetersiz puan → 422', throws(function () use ($db, $b) {
        $db->tx(function (Db $db) use ($b) {
            Wallet::convertPoints($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 600);
        });
    }) instanceof HttpError && Ledger::check($db)['ok']);
});

section('dopings', function () {
    $db = p2Db();
    $adm = mkUser($db, 'Admin6', ['role' => 'admin']);
    $s = mkUser($db, 'Satici6');
    $l = mkListing($db, $s['id'], p2Srv($db));
    $spec = Wallet::dopSpec($db, ['vitrin' => 3, 'acil' => 1]);
    ok('dopSpec', $spec === ['vitrin' => 3, 'acil' => 1] && Wallet::dopTotal($db, $spec) === 2550);
    ok('geçersiz doping → 422', throws(function () use ($db) {
        Wallet::dopSpec($db, ['altin' => 3]);
    }) instanceof HttpError);
    $e = throws(function () use ($db, $s, $l, $spec) {
        $db->tx(function (Db $db) use ($s, $l, $spec) {
            Wallet::applyDopings($db, $s, Orders::row($db, 0) ?: $db->one('SELECT * FROM {listings} WHERE id=?', [$l['id']]), $spec, 'dope');
        });
    });
    ok('bakiye yok → 409', $e instanceof HttpError && $e->errCode === 'insufficient');
    p2Fund($db, $adm, $s, 3000, false);
    $db->tx(function (Db $db) use ($s, $l, $spec) {
        Wallet::applyDopings($db, $s, YP\Catalog::listingRow($db, 'l' . $l['id'], true), $spec, 'dope');
    });
    $x = $db->one('SELECT * FROM {listings} WHERE id=?', [$l['id']]);
    ok('doping: 25,50 TL REV:doping, bitiş zamanları', Ledger::balance($db, 'REV:doping') === 2550 && p2W($db, $s)['credit'] === 450
        && (int)$x['dop_vitrin'] > yp_now_ms() + 2 * Rules::D && (int)$x['dop_acil'] > yp_now_ms());
    $p = YP\Catalog::presentListing($x);
    ok('ilan şekli: dop {vitrin, acil}', isset($p['dop']->vitrin, $p['dop']->acil) && !isset($p['dop']->renk));
    $D = Wallet::setDopings($db, $adm, ['vitrin' => ['p' => 10, 'max' => 7]]);
    ok('dopset: günlük 10 TL, 7 günlük 70, en çok 7 gün', $D['vitrin']['pd'] == 10 && $D['vitrin']['p'] == 70 && $D['vitrin']['max'] === 7 && Rules::dopings($db)['vitrin']['pd'] == 10);
    ok('max dışındaki gün → 422', throws(function () use ($db) {
        Wallet::dopSpec($db, ['vitrin' => 10]);
    }) instanceof HttpError);
    $st = mkUser($db, 'Reklamci', ['role' => 'staff', 'perms' => json_encode(['reklam'])]);
    $l2 = mkListing($db, $st['id'], p2Srv($db));
    $db->tx(function (Db $db) use ($st, $l2) {
        Wallet::applyDopings($db, $db->one('SELECT * FROM {users} WHERE id=?', [$st['id']]), YP\Catalog::listingRow($db, 'l' . $l2['id'], true), ['renk' => 2], 'dope');
    });
    ok('[reklam] yetkilisine ücretsiz (audit)', (int)$db->val("SELECT COUNT(*) FROM {audit_log} WHERE action='doping_free'") === 1 && Ledger::check($db)['ok']);
});

section('deposits-manual-coupon', function () {
    $db = p2Db();
    $adm = mkUser($db, 'Admin7', ['role' => 'admin']);
    $u = mkUser($db, 'Yukleyen');
    $db->insert('banks', ['b' => 'Ziraat Bankası', 'n' => 'YangPazar Ltd', 'iban' => 'TR00 0001', 'sort' => 0, 'created_at' => 0]);
    $cn = $db->insert('crypto_nets', ['coin' => 'USDT', 'net' => 'TRC20', 'addr' => 'TAdresAdres12345', 'note' => '', 'is_on' => 1, 'sort' => 0, 'created_at' => 0]);
    $cp = $db->insert('coupons', ['code' => 'HOSGELDIN', 'pct_bp' => 500, 'max' => 5000, 'is_on' => 1, 'uses' => 0, 'created_at' => 0]);
    $now = yp_now_ms();
    $mk = function (array $in) use ($db, $u) {
        return $db->tx(function (Db $db) use ($u, $in) {
            return Deposits::manualCreate($db, $db->one('SELECT * FROM {users} WHERE id=?', [$u['id']]), $in);
        });
    };
    $e = throws(function () use ($mk, $now) {
        $mk(['gw' => 'havale', 'amount' => 500, 'txAt' => $now + 3600000, 'toBank' => 'Ziraat Bankası']);
    });
    ok('ileri tarihli dekont → 422', $e instanceof HttpError && isset($e->extra['fields']['txAt']));
    ok('hesaplarımızda olmayan banka → 422', throws(function () use ($mk, $now) {
        $mk(['gw' => 'havale', 'amount' => 500, 'txAt' => $now, 'toBank' => 'Uydurma Bank']);
    }) instanceof HttpError);
    ok('PayTR yöntemiyle elle bildirim → 422', throws(function () use ($mk, $now) {
        $mk(['gw' => 'paytr', 'amount' => 500, 'txAt' => $now]);
    }) instanceof HttpError);
    $d = $mk(['gw' => 'havale', 'amount' => '1.000,00', 'txAt' => gmdate('Y-m-d\TH:i', (int)($now / 1000) + 3 * 3600 - 600), 'toBank' => 'Ziraat Bankası', 'note' => 'Ali V. · Ziraat', 'coupon' => 'hosgeldin']);
    ok('havale bildirimi: bekliyor, bonus 50 TL (kupon ayrıldı), cüzdan değişmedi', $d['status'] === 'bekliyor' && (int)$d['bonus'] === 5000 && (int)$d['withdrawable'] === 1
        && p2W($db, $u) === ['cash' => 0, 'credit' => 0] && $db->val('SELECT status FROM {coupon_uses} WHERE coupon_id=?', [$cp]) === 'reserved');
    ok('aynı kupon ikinci bekleyen bildirimde reddedilir', throws(function () use ($mk, $now) {
        $mk(['gw' => 'havale', 'amount' => 100, 'txAt' => $now, 'toBank' => 'Ziraat Bankası', 'coupon' => 'HOSGELDIN']);
    }) instanceof HttpError);
    $pd = View::deposit($db, $d);
    ok('S.deps şekli', $pd['id'] === 'd' . $d['id'] && $pd['gw'] === 'havale' && $pd['amount'] == 1000 && $pd['bonus'] == 50 && $pd['toBank'] === 'Ziraat Bankası' && $pd['status'] === 'bekliyor' && $pd['coupon'] === 'HOSGELDIN');
    $db->tx(function (Db $db) use ($adm, $d) {
        Deposits::approve($db, $adm, $d['id']);
    });
    ok('onay: 1000 çekilebilir (EFT) + 50 kredi bonus, kupon kullanıldı', p2W($db, $u) === ['cash' => 100000, 'credit' => 5000]
        && $db->val('SELECT status FROM {coupon_uses} WHERE coupon_id=?', [$cp]) === 'used' && (int)$db->val('SELECT uses FROM {coupons} WHERE id=?', [$cp]) === 1);
    ok('ikinci onay → 409', throws(function () use ($db, $adm, $d) {
        $db->tx(function (Db $db) use ($adm, $d) {
            Deposits::approve($db, $adm, $d['id']);
        });
    }) instanceof HttpError && p2W($db, $u)['cash'] === 100000);
    ok('kupon tekrar kullanılamaz', throws(function () use ($mk, $now) {
        $mk(['gw' => 'havale', 'amount' => 100, 'txAt' => $now, 'toBank' => 'Ziraat Bankası', 'coupon' => 'HOSGELDIN']);
    }) instanceof HttpError);
    $k = $mk(['gw' => 'kripto', 'amount' => 200, 'txAt' => $now, 'net' => 'cn' . $cn, 'txid' => '0xabcdef123456']);
    $db->tx(function (Db $db) use ($adm, $k) {
        Deposits::approve($db, $adm, $k['id']);
    });
    ok('kripto (cüzdan): yalnız alışveriş bakiyesi', p2W($db, $u) === ['cash' => 100000, 'credit' => 25000]);
    $r = $mk(['gw' => 'havale', 'amount' => 300, 'txAt' => $now, 'toBank' => 'Ziraat Bankası']);
    $db->tx(function (Db $db) use ($adm, $r) {
        Deposits::reject($db, $adm, $r['id'], 'Dekont bulunamadı');
    });
    ok('red: bakiye yok, bildirim deposit_no, audit', p2W($db, $u) === ['cash' => 100000, 'credit' => 25000] && Deposits::row($db, $r['id'])['status'] === 'reddedildi'
        && (int)$db->val("SELECT COUNT(*) FROM {notifications} WHERE ev='deposit_no'") === 1 && (int)$db->val("SELECT COUNT(*) FROM {audit_log} WHERE action='deposit_reject'") === 1);
    $ln = View::ledgerRow($db->one("SELECT * FROM {journal} WHERE kind='yukleme' ORDER BY id LIMIT 1"));
    ok('S.ledger yukleme: w, cat, m', $ln['w'] === true && $ln['cat'] === 'eft' && strpos($ln['m'], 'Manuel havale → Ziraat Bankası') === 0 && $ln['a'] == 1000);
    ok('defter temiz', Ledger::check($db)['ok']);
});

section('deposits-paytr', function () {
    $db = p2Db();
    $u = mkUser($db, 'Kartci', ['email' => 'kart@ornek.com', 'tel' => '0555 222 33 44']);
    ok('PayTR ayarı yok: yöntemler otomatik kapalı (soon)', (function () use ($db) {
        $g = array_column(View::gateways($db), null, 'id');
        return $g['paytr']['on'] === false && !empty($g['paytr']['soon']) && $g['paytr_eft']['on'] === false && $g['havale']['on'] === true;
    })());
    $e = throws(function () use ($db, $u) {
        $db->tx(function (Db $db) use ($u) {
            Deposits::paytrCreate($db, $u, ['gw' => 'paytr', 'amount' => 100]);
        });
    });
    ok('PayTR ayarı yok → 400 "Kart ile ödeme yakında"', $e instanceof HttpError && $e->http === 400 && $e->errCode === 'paytr_off' && strpos($e->getMessage(), 'Kart ile ödeme yakında') === 0);
    Paytr::$override = ['merchant_id' => '123456', 'merchant_key' => 'AbCdEf1234567890', 'merchant_salt' => 'SaLt0987654321zz', 'test_mode' => true, 'max_installment' => 0, 'ok_url' => '', 'fail_url' => ''];
    $calls = [];
    Paytr::$tokenFn = function ($cfg, $p) use (&$calls) {
        $calls[] = $p;
        return ['ok' => true, 'token' => 'TOK' . $p['oid'], 'msg' => ''];
    };
    ok('ayar varsa yöntem açık', array_column(View::gateways($db), null, 'id')['paytr']['on'] === true);
    $db->insert('coupons', ['code' => 'KART10', 'pct_bp' => 1000, 'max' => 1000, 'is_on' => 1, 'uses' => 0, 'created_at' => 0]);
    $d = $db->tx(function (Db $db) use ($u) {
        return Deposits::paytrCreate($db, $u, ['gw' => 'paytr', 'amount' => 100, 'coupon' => 'KART10']);
    });
    ok('bekleyen yükleme: beklenen = 100 + %2,99 = 102,99 TL; bonus 10 TL', (int)$d['expected'] === 10299 && (int)$d['fee'] === 299 && (int)$d['bonus'] === 1000 && (int)$d['test_mode'] === 1);
    $t = Deposits::paytrToken($db, $d, $u, '1.2.3.4', 'https://site.test/');
    ok('token: kuruş tutar, iframe adresi', $calls[0]['kurus'] === 10299 && $t['iframe'] === 'https://www.paytr.com/odeme/guvenli/TOK' . $d['merchant_oid'] && strpos($calls[0]['ok_url'], 'odeme=basarili') !== false);
    $cb = function ($status, $total, $pay = null, $tm = '1') use ($db, $d) {
        return Deposits::paytrCallback($db, ['merchant_oid' => $d['merchant_oid'], 'status' => $status, 'total_amount' => (string)$total, 'payment_amount' => $pay, 'test_mode' => $tm]);
    };
    ok('bilinmeyen sipariş → null (eski dosya kaydı)', Deposits::paytrCallback($db, ['merchant_oid' => 'YOKBOYLE1', 'status' => 'success', 'total_amount' => '1']) === null);
    for ($i = 0; $i < 5; $i++) {
        $r = $cb('success', 10299, 10299);
    }
    ok('5 tekrar bildirim: bir kez yüklenir (kart → yalnız alışveriş 100 + bonus 10)', $r === 'OK' && p2W($db, $u) === ['cash' => 0, 'credit' => 11000]
        && (int)Deposits::row($db, $d['id'])['callbacks'] === 5 && Deposits::row($db, $d['id'])['status'] === 'onaylandı');
    ok('hizmet bedeli REV:hizmet, GW:paytr −102,99', Ledger::balance($db, 'REV:hizmet') === 299 && Ledger::balance($db, 'GW:paytr') === -10299 && Ledger::check($db)['ok']);
    // hatalı tutar
    $d2 = $db->tx(function (Db $db) use ($u) {
        return Deposits::paytrCreate($db, $u, ['gw' => 'paytr_eft', 'amount' => 50]);
    });
    $r = Deposits::paytrCallback($db, ['merchant_oid' => $d2['merchant_oid'], 'status' => 'success', 'total_amount' => '4000', 'payment_amount' => '4000', 'test_mode' => '1']);
    ok('tutar uyuşmazlığı: OK ama bakiye yok, basarisiz', $r === 'OK' && p2W($db, $u) === ['cash' => 0, 'credit' => 11000] && Deposits::row($db, $d2['id'])['status'] === 'basarisiz');
    // test ödemesi canlı modda
    Paytr::$override['test_mode'] = false;
    $d3 = $db->tx(function (Db $db) use ($u) {
        return Deposits::paytrCreate($db, $u, ['gw' => 'paytr_eft', 'amount' => 50]);
    });
    Deposits::paytrCallback($db, ['merchant_oid' => $d3['merchant_oid'], 'status' => 'success', 'total_amount' => '5000', 'payment_amount' => '5000', 'test_mode' => '1']);
    ok('canlı modda test ödemesi yüklenmez', Deposits::row($db, $d3['id'])['status'] === 'basarisiz' && p2W($db, $u)['cash'] === 0);
    $d4 = $db->tx(function (Db $db) use ($u) {
        return Deposits::paytrCreate($db, $u, ['gw' => 'paytr_eft', 'amount' => 50]);
    });
    Deposits::paytrCallback($db, ['merchant_oid' => $d4['merchant_oid'], 'status' => 'success', 'total_amount' => '5000', 'payment_amount' => '5000', 'test_mode' => '0']);
    ok('PayTR Havale/EFT → çekilebilir bakiye', p2W($db, $u)['cash'] === 5000);
    // başarısız ödeme kuponu serbest bırakır
    $db->insert('coupons', ['code' => 'TEKRAR', 'pct_bp' => 1000, 'max' => 1000, 'is_on' => 1, 'uses' => 0, 'created_at' => 0]);
    $d5 = $db->tx(function (Db $db) use ($u) {
        return Deposits::paytrCreate($db, $u, ['gw' => 'paytr', 'amount' => 100, 'coupon' => 'TEKRAR']);
    });
    Deposits::paytrCallback($db, ['merchant_oid' => $d5['merchant_oid'], 'status' => 'failed', 'total_amount' => '10299', 'failed_reason_msg' => 'Kart reddedildi']);
    ok('failed: kupon serbest, yeniden kullanılabilir', Deposits::row($db, $d5['id'])['status'] === 'basarisiz' && !$db->val("SELECT 1 FROM {coupon_uses} WHERE deposit_id=?", [$d5['id']]));
    // süre dolumu (3 gün) + kupon serbest
    $d6 = $db->tx(function (Db $db) use ($u) {
        return Deposits::paytrCreate($db, $u, ['gw' => 'paytr', 'amount' => 100, 'coupon' => 'TEKRAR']);
    });
    $db->exec('UPDATE {deposits} SET created_at=? WHERE id=?', [yp_now_ms() - 4 * Rules::D, $d6['id']]);
    ok('3 günden eski bekleyen → suresi_doldu, kupon serbest', Deposits::expire($db) === 1 && Deposits::row($db, $d6['id'])['status'] === 'suresi_doldu'
        && !$db->val('SELECT 1 FROM {coupon_uses} WHERE deposit_id=?', [$d6['id']]));
    $bal = p2W($db, $u);
    Deposits::paytrCallback($db, ['merchant_oid' => $d6['merchant_oid'], 'status' => 'success', 'total_amount' => '10299', 'payment_amount' => '10299', 'test_mode' => '0']);
    ok('süresi dolmuşa geç gelen başarılı ödeme: tutar yüklenir, bonus yok', p2W($db, $u)['credit'] === $bal['credit'] + 10000 && Ledger::check($db)['ok']);
    // token alınamazsa
    Paytr::$tokenFn = function () {
        return ['ok' => false, 'token' => '', 'msg' => 'PayTR yanıtı: hata'];
    };
    $d7 = $db->tx(function (Db $db) use ($u) {
        return Deposits::paytrCreate($db, $u, ['gw' => 'paytr', 'amount' => 100]);
    });
    $e = throws(function () use ($db, $d7, $u) {
        Deposits::paytrToken($db, $d7, $u, '1.1.1.1', 'https://x/');
    });
    ok('token hatası → 502, yükleme basarisiz', $e instanceof HttpError && $e->http === 502 && Deposits::row($db, $d7['id'])['status'] === 'basarisiz');
    Paytr::$override = false;
    Paytr::$tokenFn = null;
});

section('idem-tx', function () {
    $db = p2Db();
    $adm = mkUser($db, 'Admin8', ['role' => 'admin']);
    $s = mkUser($db, 'Satici8');
    $b = mkUser($db, 'Alici8');
    $l = mkListing($db, $s['id'], p2Srv($db), ['price' => 1000, 'stock' => 10]);
    p2Fund($db, $adm, $b, 10000, true);
    Auth::$user = $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]);
    $fn = function (Db $db) use ($b, $l) {
        $o = Orders::buy($db, $db->one('SELECT * FROM {users} WHERE id=?', [$b['id']]), 'l' . $l['id'], ['info' => 'Kar']);
        return YP\Money\Api::orderBody($db, $o['id'], 'tamam');
    };
    $r1 = IdemTx::run($db, $b['id'], 'buy-key-000001', 'POST orders', $fn);
    $r2 = IdemTx::run($db, $b['id'], 'buy-key-000001', 'POST orders', $fn);
    ok('aynı anahtar: aynı sipariş, ikinci ödeme yok', $r1['data']['order']['id'] === $r2['data']['order']['id'] && !empty($r2['replayed'])
        && (int)$db->val('SELECT COUNT(*) FROM {orders}') === 1 && p2W($db, $b)['cash'] === 9000);
    ok('anahtar başka işlemde → 409', throws(function () use ($db, $b, $fn) {
        IdemTx::run($db, $b['id'], 'buy-key-000001', 'POST deposits/manual', $fn);
    }) instanceof HttpError);
    $e = throws(function () use ($db, $b) {
        IdemTx::run($db, $b['id'], 'buy-key-000002', 'POST orders', function (Db $db) {
            throw HttpError::conflict('olmadı');
        });
    });
    ok('hata: anahtar yazılmaz (düzeltip aynı anahtarla tekrar denenebilir)', $e instanceof HttpError && !$db->val("SELECT 1 FROM {idempotency_keys} WHERE ikey='buy-key-000002'"));
    Auth::$user = null;
});

section('ledger-property', function () {
    $db = p2Db();
    mt_srand(424242);
    $adm = mkUser($db, 'AdminP', ['role' => 'admin']);
    $U = [];
    for ($i = 0; $i < 6; $i++) {
        $U[] = mkUser($db, 'Uye' . $i);
    }
    $db->update('users', ['ref_by' => (int)$U[0]['id']], 'id IN (?,?)', [(int)$U[1]['id'], (int)$U[2]['id']]);
    $db->insert('banks', ['b' => 'Ziraat Bankası', 'n' => 'Y', 'iban' => 'TR00', 'sort' => 0, 'created_at' => 0]);
    $db->insert('coupons', ['code' => 'PROP', 'pct_bp' => 700, 'max' => 3000, 'is_on' => 1, 'uses' => 0, 'created_at' => 0]);
    $srv = p2Srv($db);
    $L = [];
    foreach ($U as $i => $u) {
        $L[] = mkListing($db, $u['id'], $srv, ['price' => mt_rand(100, 300000), 'stock' => mt_rand(1, 4), 'del_txt' => ['Anında', '5 dk', '1 saat'][mt_rand(0, 2)]]);
    }
    $pick = function (array $a) {
        return $a[mt_rand(0, count($a) - 1)];
    };
    $fresh = function ($id) use ($db) {
        return $db->one('SELECT * FROM {users} WHERE id=?', [(int)$id]);
    };
    $ordersIn = function ($st) use ($db) {
        return array_column($db->all('SELECT id FROM {orders} WHERE status IN (' . implode(',', array_map(function ($x) {
            return "'" . $x . "'";
        }, (array)$st)) . ')'), 'id');
    };
    $ops = ['fund', 'fund', 'deduct', 'buy', 'buy', 'buy', 'deliver', 'deliver', 'confirm', 'dispute', 'resolve', 'guarantee', 'dope', 'points', 'manual', 'decide', 'restock', 'chat'];
    $stats = array_fill_keys($ops, 0);
    $fails = 0;
    $broken = null;
    for ($n = 0; $n < 600 && !$broken; $n++) {
        $op = $pick($ops);
        try {
            $db->tx(function (Db $db) use ($op, $U, $L, $adm, $pick, $fresh, $ordersIn) {
                $u = $fresh($pick($U)['id']);
                switch ($op) {
                    case 'fund':
                        Wallet::adjust($db, $adm, $u, mt_rand(1, 500000), (bool)mt_rand(0, 1), false, 'Yükleme');
                        break;
                    case 'deduct':
                        Wallet::adjust($db, $adm, $u, mt_rand(1, 100000), (bool)mt_rand(0, 1), true, 'Düşüm');
                        break;
                    case 'buy':
                        Orders::buy($db, $u, 'l' . $pick($L)['id'], ['qty' => mt_rand(1, 2), 'info' => 'Kar' . mt_rand(1, 9)]);
                        break;
                    case 'deliver':
                        $ids = $ordersIn('odendi');
                        if ($ids) {
                            $o = Orders::lock($db, (int)$pick($ids));
                            Orders::deliver($db, $o, $fresh($o['seller_id']), ['dpre' => [p2Media($db, $o['seller_id'])], 'dpost' => [p2Media($db, $o['seller_id'])]]);
                        }
                        break;
                    case 'confirm':
                        $ids = $ordersIn('teslim');
                        if ($ids) {
                            $o = Orders::lock($db, (int)$pick($ids));
                            Orders::confirm($db, $o, $fresh($o['buyer_id']), mt_rand(0, 5) ?: null);
                        }
                        break;
                    case 'dispute':
                        $ids = $ordersIn(['odendi', 'teslim']);
                        if ($ids) {
                            $o = Orders::lock($db, (int)$pick($ids));
                            Orders::dispute($db, $o, $fresh(mt_rand(0, 1) ? $o['buyer_id'] : $o['seller_id']), ['r' => 'Diğer', 'd' => 'Sorun var']);
                        }
                        break;
                    case 'resolve':
                        $ids = $ordersIn(['itiraz', 'odendi', 'teslim']);
                        if ($ids) {
                            Orders::resolve($db, Orders::lock($db, (int)$pick($ids)), $fresh($adm['id']), mt_rand(0, 1) ? 'seller' : 'buyer');
                        }
                        break;
                    case 'guarantee':
                        $ids = $ordersIn('odendi');
                        if ($ids) {
                            $o = Orders::lock($db, (int)$pick($ids));
                            if (mt_rand(0, 1)) {
                                $db->exec('UPDATE {orders} SET created_at=created_at-? WHERE id=?', [200 * 60000, (int)$o['id']]);
                                $o = Orders::lock($db, (int)$o['id']);
                            }
                            Orders::guarantee($db, $o, $fresh($o['buyer_id']));
                        }
                        break;
                    case 'dope':
                        $l = $db->one('SELECT * FROM {listings} WHERE id=?' . $db->forUpdate(), [(int)$pick($L)['id']]);
                        Wallet::applyDopings($db, $fresh($l['seller_id']), $l, [$pick(['vitrin', 'acil', 'renk']) => $pick([1, 2, 3, 7])], 'dope');
                        break;
                    case 'points':
                        $db->exec('UPDATE {users} SET pts=pts+? WHERE id=?', [mt_rand(0, 900), (int)$u['id']]);
                        Wallet::convertPoints($db, $fresh($u['id']), mt_rand(400, 1500));
                        break;
                    case 'manual':
                        Deposits::manualCreate($db, $u, ['gw' => $pick(['havale', 'havale', 'kripto']) === 'kripto' ? 'havale' : 'havale', 'amount' => mt_rand(10, 5000), 'txAt' => yp_now_ms(),
                            'toBank' => 'Ziraat Bankası', 'coupon' => mt_rand(0, 3) ? '' : 'PROP']);
                        break;
                    case 'decide':
                        $d = $db->val("SELECT id FROM {deposits} WHERE status='bekliyor' ORDER BY id LIMIT 1");
                        if ($d) {
                            mt_rand(0, 2) ? Deposits::approve($db, $fresh($adm['id']), $d) : Deposits::reject($db, $fresh($adm['id']), $d, 'yok');
                        }
                        break;
                    case 'restock':
                        $db->exec("UPDATE {listings} SET stock=stock+1, status='aktif' WHERE id=?", [(int)$pick($L)['id']]);
                        break;
                    case 'chat':
                        $ids = $ordersIn(['odendi', 'teslim', 'itiraz']);
                        if ($ids) {
                            $o = Orders::lock($db, (int)$pick($ids));
                            Orders::chat($db, $o, $fresh($o['buyer_id']), 'mesaj ' . mt_rand());
                        }
                        break;
                }
            });
            $stats[$op]++;
        } catch (HttpError $e) {
            $fails++; // iş kuralı reddi (bakiye yetersiz, stok yok, kendi ilanı …): işlem tümüyle geri alınmış olmalı
        }
        $c = Ledger::check($db);
        if (!$c['ok']) {
            $broken = ['op' => $op, 'n' => $n, 'errors' => $c['errors']];
        }
    }
    ok('600 rastgele işlem sonrası defter tutarlı (her adımda denetlendi)', $broken === null, $broken);
    ok('işlem çeşitliliği (her tür en az bir kez başarılı)', min($stats) > 0, $stats);
    ok('reddedilen işlemler de oldu (geri alma yolu sınandı)', $fails > 20, $fails);
    $sumAll = (int)$db->val('SELECT COALESCE(SUM(amount),0) FROM {postings}');
    $neg = (int)$db->val('SELECT COUNT(*) FROM {wallets} WHERE cash<0 OR credit<0');
    ok('tüm postings toplamı 0, eksi cüzdan yok', $sumAll === 0 && $neg === 0);
    $w = $db->one('SELECT SUM(cash) AS c, SUM(credit) AS k FROM {wallets}');
    $outside = -array_sum(array_values(Ledger::balancesLike($db, 'ADJ'))) - array_sum(Ledger::balancesLike($db, 'EXP:')) - array_sum(Ledger::balancesLike($db, 'GW:'));
    $inside = (int)$w['c'] + (int)$w['k'] + Ledger::balance($db, 'ESCROW:ORD') + array_sum(Ledger::balancesLike($db, 'REV:'));
    ok('para korunumu: dışarıdan giren = cüzdanlar + havuz + gelirler', $outside === $inside, [$outside, $inside]);
});
