<?php
/**
 * P4 parite testi: src/js/50-exchange.js'teki ASIL exQuote / exApplyFills / exPair / exUnpair / exDeliver / exFinish / exCancelOrder
 * işlevleri (Node'da, S/notify/user… saplamalarıyla) ile YP\Exchange\Engine aynı rastgele örnekler (tohumlu) üzerinde çalıştırılır;
 * tüm ara durumlar (eşlemeler, teklif kalanları, teslim, satıcı ödemeleri, gelir, iade, ödeme kovaları) kuruş olarak karşılaştırılır.
 * Kullanım: php tests/http/p4-parity.php [örnek sayısı]   (çıkış: "PARITE <ad> <geçen>/<toplam>" satırları; hata varsa çıkış 1)
 */
if (PHP_SAPI !== 'cli') {
    exit;
}
$TMP = sys_get_temp_dir() . '/yp-p4par-' . getmypid();
@mkdir($TMP, 0700, true);
define('YP_STORAGE', $TMP);
require dirname(__DIR__, 2) . '/app/bootstrap.php';
register_shutdown_function(function () use ($TMP) {
    exec('rm -rf ' . escapeshellarg($TMP));
});

use YP\Exchange\Engine;

$N = isset($argv[1]) ? max(10, (int)$argv[1]) : 300;
$node = trim((string)@shell_exec('command -v node 2>/dev/null'));
if ($node === '') {
    echo "PARITE atlandı (node yok)\n";
    exit(0);
}
$root = dirname(__DIR__, 2) . '/src/js/';
$ex = file_get_contents($root . '50-exchange.js');
$core = file_get_contents($root . '00-core.js');
$dom = file_get_contents($root . '02-domain.js');
function jsDef($src, $name)
{
    if (preg_match('/^const ' . preg_quote($name, '/') . ' = .*$/m', $src, $m)) {
        return $m[0];
    }
    if (preg_match('/^function ' . preg_quote($name, '/') . '\(/m', $src, $m, PREG_OFFSET_CAPTURE)) {
        $start = $m[0][1];
        $depth = 0;
        for ($i = strpos($src, '{', $start); $i < strlen($src); $i++) {
            if ($src[$i] === '{') {
                $depth++;
            } elseif ($src[$i] === '}' && --$depth === 0) {
                return substr($src, $start, $i - $start + 1);
            }
        }
    }
    fwrite(STDERR, "JS tanımı bulunamadı: $name\n");
    exit(2);
}
$defs = [jsDef($core, 'r2'), jsDef($dom, 'refundPart')];
foreach (['exM', 'exBook', 'exStock', 'exQuote', 'exMatched', 'exApplyFills', 'exPair', 'exUnpair', 'exDeliver', 'exFinish', 'exCancelOrder'] as $f) {
    $defs[] = jsDef($ex, $f);
}

/* ---------------- örnekler ---------------- */
mt_srand(20261119);
$margins = [0, 5, 10, 12, 15, 20, 25];
$F = [];
for ($i = 0; $i < $N; $i++) {
    $nOff = mt_rand(0, 7);
    $offers = [];
    for ($k = 1; $k <= $nOff; $k++) {
        $qty = mt_rand(1, 40);
        $st = mt_rand(0, 9) < 8 ? 'aktif' : (mt_rand(0, 1) ? 'satildi' : 'iptal');
        $offers[] = ['id' => $k, 'u' => 's' . mt_rand(1, 4), 'qty' => $qty, 'left' => $st === 'aktif' ? mt_rand(1, $qty) : 0, 'price' => mt_rand(1, 3000),
            'status' => $st, 't' => mt_rand(1, 50)];
    }
    $q = mt_rand(1, 60);
    $price = mt_rand(1, 4000);
    $total = $q * $price;
    $nw = mt_rand(0, 2) ? mt_rand(0, $total) : 0;
    $F[] = ['m' => $margins[mt_rand(0, count($margins) - 1)], 'offers' => $offers, 'q' => $q, 'price' => $price, 'paid' => ['w' => $total - $nw, 'nw' => $nw],
        'quoteQ' => mt_rand(1, 70), 'pairOf' => $nOff ? mt_rand(1, $nOff) : 0, 'pairQ' => mt_rand(0, 25), 'unpair' => mt_rand(0, 3) === 0, 'deliverFrac' => mt_rand(0, 100),
        'end' => mt_rand(0, 1) ? 'finish' : 'cancel'];
}

/* ---------------- PHP ---------------- */
$P = [];
foreach ($F as $f) {
    $offers = [];
    foreach ($f['offers'] as $o) {
        $offers[$o['id']] = $o;
    }
    $mbp = (int)round($f['m'] * 100);
    $r = [];
    $qt = Engine::quote($offers, $f['quoteQ'], $mbp);
    $r['quote'] = ['ok' => $qt['ok'], 'total' => $qt['total'], 'cost' => $qt['cost'], 'avg' => $qt['avg'],
        'fills' => array_map(function ($x) { return [$x['of'], $x['qty'], $x['price'], $x['sell']]; }, $qt['fills'])];
    $o = ['id' => 1, 'u' => 'b', 'qty' => $f['q'], 'price' => $f['price'], 'total' => $f['q'] * $f['price'], 'paid' => $f['paid'], 'delivered' => 0, 'cost' => 0, 'reserve' => 0, 'fills' => []];
    // eşleme: alıcının ihtiyacı kadar teklif (motor) — JS ile aynı biçimde exQuote sonucunu exApplyFills'e verir
    $need = $o['qty'];
    $qt2 = Engine::quote($offers, $need, $mbp);
    Engine::applyFills($o, $offers, $qt2['fills']);
    $r['apply'] = ['fills' => array_map(function ($x) { return [$x['of'], $x['qty'], $x['price'], $x['sell'], $x['paidQty']]; }, $o['fills']), 'cost' => $o['cost'],
        'offers' => array_map(function ($x) { return [$x['left'], $x['status']]; }, array_values($offers))];
    $err = $f['pairOf'] ? Engine::pair($o, $offers, $f['pairOf'], $f['pairQ']) : 'yok';
    $r['pair'] = ['err' => $err === null ? 0 : 1, 'matched' => Engine::matched($o), 'offers' => array_map(function ($x) { return [$x['left'], $x['status']]; }, array_values($offers))];
    $un = 0;
    if ($f['unpair'] && $o['fills']) {
        $un = Engine::unpair($o, $offers, $o['fills'][0]['of']);
    }
    $r['unpair'] = ['n' => $un, 'cost' => $o['cost'], 'matched' => Engine::matched($o)];
    $to = (int)floor(Engine::matched($o) * $f['deliverFrac'] / 100);
    $d = Engine::deliver($o, $offers, $to);
    $pay = [];
    foreach ($d['pay'] as $p) {
        $pay[$p[0]] = (isset($pay[$p[0]]) ? $pay[$p[0]] : 0) + $p[3];
    }
    ksort($pay);
    $r['deliver'] = ['d' => $d['d'], 'val' => $d['val'], 'cost' => $d['cost'], 'pay' => $pay, 'delivered' => $o['delivered'],
        'paidQty' => array_map(function ($x) { return $x['paidQty']; }, $o['fills'])];
    if ($f['end'] === 'finish') {
        $d2 = Engine::deliver($o, $offers, Engine::matched($o));
        $fin = Engine::finish($o);
        $r['end'] = ['back' => $fin['back'], 'total' => $o['total'], 'paid' => [$o['paid']['w'], $o['paid']['nw']], 'val2' => $d2['val']];
    } else {
        $c = Engine::cancel($o, $offers);
        $r['end'] = ['back' => $c['back'], 'total' => $o['total'], 'paid' => [$o['paid']['w'], $o['paid']['nw']], 'val2' => 0,
            'offers' => array_map(function ($x) { return [$x['left'], $x['status']]; }, array_values($offers)), 'fills' => count($o['fills'])];
    }
    $P[] = $r;
}

/* ---------------- JS (asıl işlevler) ---------------- */
$js = implode("\n", $defs) . "\n" . <<<'JS'
let S={set:{exMargin:0},exOffers:[],exchange:[],exOrders:[]}; let USERS={}; let REC=null;
const K=x=>Math.round(x*100);
const notify=()=>{}; const addRev=()=>{}; const toast=()=>{}; const render=()=>{}; const save=()=>{}; const TL=n=>String(n); const now=()=>0; const me=()=>({name:'op'});
const user=id=>USERS[id]||(USERS[id]={id,bal:0,bonus:0}); function addTx(u,l,a){ if(REC) REC.tx.push([u,l,a]); } function ledger(k,u,a,m){ if(REC&&k==='borsa') REC.led.push([a,m.cost]); } function wipeOffer(){}
const I=JSON.parse(require('fs').readFileSync(0,'utf8')); const out=[];
const offSt=()=>S.exOffers.map(o=>[o.left,o.status]);
for(const f of I){ USERS={}; S.set.exMargin=f.m; S.exOffers=f.offers.map(o=>({id:o.id,ex:'x1',u:o.u,qty:o.qty,left:o.left/1,price:o.price/100,status:o.status,t:o.t}));
  const x={id:'x1',margin:null}; S.exchange=[x]; const r={};
  const qt=exQuote(x,f.quoteQ); r.quote={ok:qt.ok,total:K(qt.total),cost:K(qt.cost),avg:K(qt.avg),fills:qt.fills.map(z=>[z.of,z.qty,K(z.price),K(z.sell)])};
  const o={id:'B1',u:'b',ex:'x1',qty:f.q,price:f.price/100,total:f.q*f.price/100,paid:{w:f.paid.w/100,nw:f.paid.nw/100},delivered:0,cost:0,reserve:0,fills:[],log:[]}; user('b');
  const qt2=exQuote(x,o.qty); exApplyFills(o,x,qt2.fills);
  r.apply={fills:o.fills.map(z=>[z.of,z.qty,K(z.price),K(z.sell),z.paidQty||0]),cost:K(o.cost),offers:offSt()};
  let perr=1; if(f.pairOf){ const of=S.exOffers.find(z=>z.id===f.pairOf); const n=exPair(o,of,f.pairQ); perr=n?0:1; }
  r.pair={err:perr,matched:exMatched(o),offers:offSt()};
  let un=0; if(f.unpair&&o.fills.length) un=exUnpair(o,o.fills[0].of);
  r.unpair={n:un,cost:K(o.cost),matched:exMatched(o)};
  REC={tx:[],led:[]}; const to=Math.floor(exMatched(o)*f.deliverFrac/100); const d=exDeliver(o,to);
  const pay={}; REC.tx.forEach(([u,l,a])=>{ pay[u]=(pay[u]||0)+K(a); }); const led=REC.led[0]||[0,0];
  r.deliver={d:d,val:K(led[0]),cost:K(led[1]),pay:Object.fromEntries(Object.entries(pay).sort()),delivered:o.delivered,paidQty:o.fills.map(z=>z.paidQty||0)};
  if(f.end==='finish'){ REC={tx:[],led:[]}; exDeliver(o,exMatched(o)); const v2=REC.led[0]?K(REC.led[0][0]):0; const t0=o.total; exFinish(o); const back=K(t0)-K(o.total);
    r.end={back:back,total:K(o.total),paid:[K(o.paid.w),K(o.paid.nw)],val2:v2}; }
  else { REC=null; const back=exCancelOrder(o,'x',true); r.end={back:Math.max(0,K(back)),total:K(o.total),paid:[K(o.paid.w),K(o.paid.nw)],val2:0,offers:offSt(),fills:o.fills.length}; }
  out.push(r); }
process.stdout.write(JSON.stringify(out));
JS;
$f = $TMP . '/par.js';
file_put_contents($f, $js);
$proc = proc_open([$node, $f], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
fwrite($pipes[0], json_encode($F));
fclose($pipes[0]);
$outJs = stream_get_contents($pipes[1]);
$err = stream_get_contents($pipes[2]);
proc_close($proc);
$J = json_decode($outJs, true);
if (!is_array($J) || count($J) !== count($P)) {
    echo "PARITE node-hata 0/1\n" . substr($err, 0, 800) . "\n";
    exit(1);
}
$norm = function ($v) use (&$norm) {
    if (is_array($v)) {
        $o = [];
        foreach ($v as $k => $x) {
            $o[$k] = $norm($x);
        }
        return $o;
    }
    if (is_bool($v)) {
        return $v;
    }
    if (is_int($v) || is_float($v)) {
        return (int)$v;
    }
    return is_numeric($v) ? (int)$v : $v;
};
$bad = 0;
$tot = [];
$ok = [];
foreach (['quote' => 'exQuote', 'apply' => 'exApplyFills', 'pair' => 'exPair', 'unpair' => 'exUnpair', 'deliver' => 'exDeliver', 'end' => 'exFinish/exCancelOrder'] as $k => $nm) {
    $tot[$nm] = 0;
    $ok[$nm] = 0;
    foreach ($P as $i => $r) {
        $tot[$nm]++;
        $a = $norm($r[$k]);
        $b = $norm($J[$i][$k]);
        if ($k === 'deliver') {
            $a['pay'] = (array)$a['pay'];
            $b['pay'] = (array)$b['pay'];
        }
        if ($a == $b) {
            $ok[$nm]++;
        } elseif ($bad++ < 5) {
            echo "  fark #$i $nm\n    PHP " . json_encode($a, JSON_UNESCAPED_UNICODE) . "\n    JS  " . json_encode($b, JSON_UNESCAPED_UNICODE) . "\n";
        }
    }
}
$fin = ['finish' => 0, 'cancel' => 0];
foreach ($F as $f) {
    $fin[$f['end']]++;
}
foreach ($tot as $nm => $n) {
    echo 'PARITE ' . $nm . ' ' . $ok[$nm] . '/' . $n . "\n";
}
echo 'ÖRNEK ' . count($F) . ' (bitiş ' . $fin['finish'] . ', iptal ' . $fin['cancel'] . ')' . "\n";
exit($bad ? 1 : 0);
