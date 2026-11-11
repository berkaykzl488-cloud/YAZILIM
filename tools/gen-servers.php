<?php
/**
 * Demo verisindeki (src/js/demo/seed.js + migrate.js) varsayılan server listesinden app/seed/servers.php üretir.
 * Yalnız serverlar alınır (ilan, üye vb. demo verisi alınmaz). Sonuç, demo'nun migrate() sonrası listesiyle aynıdır:
 *   - TR: migrate.js NEWTR (16 resmi server, sırası ve renkleriyle)
 *   - PVP: migrate.js ALL listesi; seed.js'teki s1–s8 (REN ile yeniden adlandırılan) renklerini korur, diğerleri PAL döngüsü
 *   - EP satışı açık serverlar: Ejderha2/Asuman2/Altınorda → (REN) Ejder2/Aisha2/Anka2
 * Kullanım:
 *   php tools/gen-servers.php          # yazar
 *   php tools/gen-servers.php --check  # güncel mi? (değilse çıkış 1)
 */
$root = dirname(__DIR__);
$seed = file_get_contents($root . '/src/js/demo/seed.js');
$mig = file_get_contents($root . '/src/js/demo/migrate.js');

function fail($m)
{
    fwrite(STDERR, "gen-servers: $m\n");
    exit(2);
}
/** const NAME=<json-benzeri dizi/nesne>; → PHP dizisi (tek tırnaklar çift tırnağa çevrilir) */
function jsLiteral($src, $name)
{
    if (!preg_match('/const ' . preg_quote($name, '/') . '=(\[|\{)/', $src, $m, PREG_OFFSET_CAPTURE)) {
        fail("bulunamadı: $name");
    }
    $s = $m[1][1];
    $open = $src[$s];
    $close = $open === '[' ? ']' : '}';
    $depth = 0;
    $q = null;
    for ($i = $s; $i < strlen($src); $i++) {
        $c = $src[$i];
        if ($q) {
            if ($c === '\\') {
                $i++;
                continue;
            }
            if ($c === $q) {
                $q = null;
            }
            continue;
        }
        if ($c === '"' || $c === "'") {
            $q = $c;
            continue;
        }
        if ($c === '[' || $c === '{') {
            $depth++;
        }
        if ($c === ']' || $c === '}') {
            $depth--;
            if ($depth === 0) {
                $lit = substr($src, $s, $i - $s + 1);
                $lit = preg_replace("/'([^'\\\\]*)'/", '"$1"', $lit);
                $v = json_decode($lit, true);
                if (!is_array($v)) {
                    fail("çözümlenemedi: $name");
                }
                return $v;
            }
        }
    }
    fail("kapanmadı: $name");
}

$NEWTR = jsLiteral($mig, 'NEWTR');
$REN = jsLiteral($mig, 'REN');
$ALL = jsLiteral($mig, 'ALL');
$PAL = jsLiteral($mig, 'PAL');

// seed.js: PVP s1..s8 renkleri
$seedPvp = [];
preg_match_all("/\{id:'(s[0-9]+)',sec:'pvp',name:'([^']+)'[^}]*?c:\['(#[0-9a-fA-F]{6})','(#[0-9a-fA-F]{6})'\]/u", $seed, $mm, PREG_SET_ORDER);
foreach ($mm as $x) {
    $seedPvp[$x[1]] = ['name' => $x[2], 'c' => [$x[3], $x[4]]];
}
if (count($seedPvp) < 8) {
    fail('seed.js PVP serverları bulunamadı');
}
// EP açık serverlar (migrate.js: ['Ejderha2','Asuman2','Altınorda'] → REN)
if (!preg_match("/const pick=\[((?:'[^']+',?)+)\]/u", $mig, $pm)) {
    fail('EP server listesi bulunamadı');
}
preg_match_all("/'([^']+)'/u", $pm[1], $pp);
$epOld = $pp[1];

$trDesc = 'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.';
$out = [];
foreach ($NEWTR as $i => $t) {
    $out[] = ['sec' => 'tr', 'name' => $t[1], 'type' => 'Resmi', 'lv' => '1-120', 'c1' => $t[2], 'c2' => $t[3], 'descr' => $trDesc,
        'url' => 'https://tr.metin2.gameforge.com', 'ep' => 0, 'demo_id' => $t[0]];
}
$lower = function ($s) {
    return mb_strtolower(str_replace(['I', 'İ'], ['ı', 'i'], $s), 'UTF-8');
};
$have = [];
// s1..s8 (seed sırasıyla), REN'deki yeni adlarıyla
foreach ($seedPvp as $id => $sv) {
    if (!isset($REN[$id])) {
        continue;
    }
    $nm = $REN[$id][1];
    $out[] = ['sec' => 'pvp', 'name' => $nm, 'type' => 'PVP', 'lv' => '', 'c1' => $sv['c'][0], 'c2' => $sv['c'][1], 'descr' => '', 'url' => '',
        'ep' => in_array($sv['name'], $epOld, true) ? 1 : 0, 'demo_id' => $id];
    $have[$lower($nm)] = 1;
}
$n = 0;
foreach ($ALL as $i => $nm) {
    if (isset($have[$lower($nm)])) {
        continue;
    }
    $have[$lower($nm)] = 1;
    $n++;
    $c = $PAL[$i % count($PAL)];
    $out[] = ['sec' => 'pvp', 'name' => $nm, 'type' => 'PVP', 'lv' => '', 'c1' => $c[0], 'c2' => $c[1], 'descr' => '', 'url' => '', 'ep' => 0, 'demo_id' => 'p' . $n];
}

$php = "<?php\n/**\n * OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: src/js/demo/seed.js + migrate.js (yalnız server listesi).\n"
    . " * Yeniden üretmek: php tools/gen-servers.php\n * Göç 0002 bu listeyi BOŞ servers tablosuna bir kez yazar; sonra serverlar yönetim panelinden düzenlenir.\n */\n"
    . "if (!defined('YP_APP')) { http_response_code(404); exit; }\n\nreturn [\n";
foreach ($out as $s) {
    $php .= '    ' . var_export($s, true) . ",\n";
}
$php .= "];\n";
$php = preg_replace("/array \(\n\s*/", '[', $php);
$php = preg_replace("/,\n\s*\)/", ']', $php);
$php = preg_replace("/,\n\s+'/", ", '", $php);

$file = $root . '/app/seed/servers.php';
if (in_array('--check', $argv, true)) {
    if (!is_file($file) || file_get_contents($file) !== $php) {
        fwrite(STDERR, "app/seed/servers.php güncel değil: php tools/gen-servers.php\n");
        exit(1);
    }
    echo 'servers.php güncel (' . count($out) . " server)\n";
    exit(0);
}
if (!is_dir(dirname($file))) {
    mkdir(dirname($file), 0755, true);
}
file_put_contents($file, $php);
$tr = count(array_filter($out, function ($s) {
    return $s['sec'] === 'tr';
}));
echo 'app/seed/servers.php yazıldı (' . count($out) . " server: $tr TR, " . (count($out) - $tr) . " PVP)\n";
