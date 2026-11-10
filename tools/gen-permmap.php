<?php
/**
 * src/js içindeki PERMS / PERM_GROUPS / ADM_ACT / ADM_FORM / ADM_CHG tablolarından app/src/PermMap.php üretir.
 * Kullanım:
 *   php tools/gen-permmap.php          # yazar
 *   php tools/gen-permmap.php --check  # güncel mi? (değilse çıkış 1)
 */
$root = dirname(__DIR__);
$js = '';
foreach (['40-views-public.js', '99-wiring.js'] as $f) {
    $js .= file_get_contents($root . '/src/js/' . $f) . "\n";
}

function objBody($js, $name)
{
    $p = strpos($js, 'const ' . $name);
    if ($p === false) {
        fwrite(STDERR, "bulunamadı: $name\n");
        exit(2);
    }
    $s = strpos($js, '{', $p);
    $depth = 0;
    $q = null;
    for ($i = $s; $i < strlen($js); $i++) {
        $c = $js[$i];
        if ($q) {
            if ($c === '\\') { $i++; continue; }
            if ($c === $q) { $q = null; }
            continue;
        }
        if ($c === "'" || $c === '"') { $q = $c; continue; }
        if ($c === '{') { $depth++; }
        if ($c === '}') { $depth--; if ($depth === 0) { return substr($js, $s + 1, $i - $s - 1); } }
    }
    exit(2);
}

/** {'a-b':'x', c:"y", d:['p','q']} → [k => 'x' | ['p','q']] */
function parsePairs($body)
{
    $out = [];
    preg_match_all('/(?:\'([^\']+)\'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:\s*(\'[^\']*\'|"[^"]*"|\[[^\]]*\])/u', $body, $m, PREG_SET_ORDER);
    foreach ($m as $x) {
        $k = $x[1] !== '' ? $x[1] : ($x[2] !== '' ? $x[2] : $x[3]);
        $v = $x[4];
        if ($v[0] === '[') {
            preg_match_all('/\'([^\']*)\'|"([^"]*)"/', $v, $mm, PREG_SET_ORDER);
            $out[$k] = array_map(function ($y) { return $y[1] !== '' ? $y[1] : $y[2]; }, $mm);
        } else {
            $out[$k] = substr($v, 1, -1);
        }
    }
    return $out;
}

$perms = parsePairs(objBody($js, 'PERMS_ '));
if (preg_match('/const PERMS = Object\.assign\(\{\},PERMS_,\{(.*?)\}\);/su', $js, $m)) {
    $perms = array_merge($perms, parsePairs($m[1]));
}
$groups = [];
if (preg_match('/const PERM_GROUPS=\[(.*?)\];/su', $js, $m)) {
    preg_match_all("/\\['([^']+)',\\[([^\\]]*)\\]\\]/u", $m[1], $gm, PREG_SET_ORDER);
    foreach ($gm as $g) {
        preg_match_all("/'([^']+)'/", $g[2], $km);
        $groups[] = [$g[1], $km[1]];
    }
}
$act = parsePairs(objBody($js, 'ADM_ACT'));
$form = parsePairs(objBody($js, 'ADM_FORM'));
$chg = parsePairs(objBody($js, 'ADM_CHG'));
// Sonradan eklenenler: ADM_FORM.x='y'; ADM_ACT['a-b']='y';
preg_match_all("/ADM_(ACT|FORM|CHG)(?:\\.([A-Za-z_]\\w*)|\\['([^']+)'\\])\\s*=\\s*'([^']+)'/", $js, $am, PREG_SET_ORDER);
foreach ($am as $a) {
    $k = $a[2] !== '' ? $a[2] : $a[3];
    if ($a[1] === 'ACT') { $act[$k] = $a[4]; } elseif ($a[1] === 'FORM') { $form[$k] = $a[4]; } else { $chg[$k] = $a[4]; }
}
// PLAN §1.2 düzeltmeleri: pazarlama/backlink/rehber → seo, dopset → ilan (zaten ilan)
$fix = ['dopset' => 'ilan'];
foreach ($fix as $k => $v) {
    if (isset($form[$k])) { $form[$k] = $v; }
}
foreach ([$act, $form, $chg] as $tbl) {
    foreach ($tbl as $k => $v) {
        foreach ((array)$v as $p) {
            if (!isset($perms[$p])) {
                fwrite(STDERR, "bilinmeyen yetki anahtarı: $k → $p\n");
                exit(2);
            }
        }
    }
}

function ex($v, $ind = '    ')
{
    if (is_array($v) && array_keys($v) === range(0, count($v) - 1)) {
        return '[' . implode(', ', array_map(function ($x) use ($ind) { return ex($x, $ind); }, $v)) . ']';
    }
    if (is_array($v)) {
        $o = "[\n";
        foreach ($v as $k => $x) {
            $o .= $ind . '    ' . var_export((string)$k, true) . ' => ' . ex($x, $ind . '    ') . ",\n";
        }
        return $o . $ind . ']';
    }
    return var_export($v, true);
}

$php = "<?php\nnamespace YP;\n\nif (!defined('YP_APP')) { http_response_code(404); exit; }\n\n"
     . "/**\n * OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Kaynak: src/js/40-views-public.js (PERMS, PERM_GROUPS) ve\n"
     . " * src/js/99-wiring.js (ADM_ACT / ADM_FORM / ADM_CHG). Yeniden üretmek: php tools/gen-permmap.php\n"
     . " * Bir değer dizi ise yetkilerden HERHANGİ BİRİ yeterlidir.\n */\nfinal class PermMap\n{\n"
     . '    const PERMS = ' . ex($perms) . ";\n\n"
     . '    const GROUPS = ' . ex($groups) . ";\n\n"
     . '    const ACT = ' . ex($act) . ";\n\n"
     . '    const FORM = ' . ex($form) . ";\n\n"
     . '    const CHG = ' . ex($chg) . ";\n}\n";

$target = $root . '/app/src/PermMap.php';
if (in_array('--check', $argv, true)) {
    $cur = is_file($target) ? file_get_contents($target) : '';
    if ($cur !== $php) {
        fwrite(STDERR, "app/src/PermMap.php güncel değil: php tools/gen-permmap.php\n");
        exit(1);
    }
    echo "PermMap güncel (" . count($perms) . " yetki, " . (count($act) + count($form) + count($chg)) . " eylem)\n";
    exit(0);
}
file_put_contents($target, $php);
echo "yazıldı: app/src/PermMap.php (" . count($perms) . " yetki, " . count($act) . " ACT, " . count($form) . " FORM, " . count($chg) . " CHG)\n";
