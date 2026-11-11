<?php
/*
 * yangpazar.com ön yüz derleyicisi (PHP 8 CLI, bağımlılık yok).
 *
 *   php tools/build.php --single        src/ → index.html (kök; tek dosya, demo verisiyle). Kökteki index.html bu komutun çıktısıdır.
 *   php tools/build.php --check         index.html, src/ ile güncel mi? (değilse çıkış kodu 1)
 *   php tools/build.php --prod          src/ → dist/: cPanel belge köküne doğrudan yüklenebilen canlı site paketi
 *                                       index.php (açılış verisi YP_BOOT + YP_MODE='prod'), assets/ (?v=<hash>), app/, api/, kurulum/,
 *                                       storage/ ve uploads/ (yalnız koruma dosyaları), .htaccess. demo/ hariç, prod/ dahil.
 *   php tools/build.php --prod --zip    aynı + dist/yangpazar-site-<sürüm>.zip (içine tek kullanımlık kurulum kodu: storage/kurulum_kodu.php)
 *                                       ve dist/yangpazar-site-<sürüm>-KURULUM-KODU.txt (zip'in DIŞINDA; kod ekrana da yazılır)
 *   php tools/build.php --prod --demo   çok dosyalı demo: index.html + assets/ (demo/ dahil, prod/ hariç, YP_MODE='demo'; sunucu gerekmez)
 *   --out=<klasör>                      dist/ yerine başka bir klasöre yaz (boş olmalı ya da önceki bir derleme olmalı; testler için)
 *   php tools/build.php --embed-api     api/ klasörünü src/js/demo/kits.js içindeki API_KIT_FILES'a yeniden gömer
 *
 * Kaynaklar: src/shell.html (<!--@CSS--> ve <!--@JS--> yer tutucuları), src/app.css, src/js/manifest.txt (sıra), src/js/**.js,
 *            src/index-head.php.tpl (canlı index.php'nin PHP başlığı)
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

const ROOT = __DIR__ . '/..';
const SRC  = ROOT . '/src';

function fail(string $m): never { fwrite(STDERR, "HATA: $m\n"); exit(1); }
function rd(string $p): string { $c = @file_get_contents($p); if ($c === false) fail("okunamadı: $p"); return $c; }
function wr(string $p, string $c): void {
  $d = dirname($p); if (!is_dir($d) && !mkdir($d, 0777, true)) fail("klasör açılamadı: $d");
  if (file_put_contents($p, $c) === false) fail("yazılamadı: $p");
}
function rel(string $p): string { $r = realpath(ROOT) ?: ROOT; foreach ([ROOT, $r] as $b) if (str_starts_with($p, $b . '/')) return ltrim(substr($p, strlen($b)), '/'); return $p; }

/** manifest.txt → sıralı dosya listesi; diskteki .js dosyalarıyla birebir eşleşmeli. */
function manifest(): array {
  $list = [];
  foreach (preg_split('/\R/', rd(SRC . '/js/manifest.txt')) as $ln) {
    $ln = trim($ln); if ($ln === '' || $ln[0] === '#') continue;
    if (!preg_match('~^(?:(demo|prod)/)?[A-Za-z0-9._-]+\.js$~', $ln)) fail("manifest satırı geçersiz: $ln");
    if (in_array($ln, $list, true)) fail("manifest'te iki kez: $ln");
    $list[] = $ln;
  }
  $disk = [];
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(SRC . '/js', FilesystemIterator::SKIP_DOTS));
  foreach ($it as $f) if (str_ends_with($f->getFilename(), '.js')) $disk[] = str_replace('\\', '/', substr($f->getPathname(), strlen(SRC . '/js/')));
  if ($x = array_diff($disk, $list)) fail("manifest'te olmayan dosya: " . implode(', ', $x));
  if ($x = array_diff($list, $disk)) fail("manifest'teki dosya yok: " . implode(', ', $x));
  return $list;
}
function kind(string $f): string { return str_starts_with($f, 'demo/') ? 'demo' : (str_starts_with($f, 'prod/') ? 'prod' : 'core'); }

function shell(): string {
  $s = rd(SRC . '/shell.html');
  foreach (['<!--@CSS-->', '<!--@JS-->'] as $ph) if (substr_count($s, $ph) !== 1) fail("shell.html: $ph tam bir kez olmalı");
  return $s;
}

/** Tek dosya: CSS ve tüm JS (demo dahil, prod/ hariç) sırayla gömülür. Dosyalar satır sınırından bölündüğü için birleştirme bayt-bayt aynıdır. */
function single(): string {
  $js = '';
  foreach (manifest() as $f) if (kind($f) !== 'prod') $js .= rd(SRC . "/js/$f");
  return strtr(shell(), [
    '<!--@CSS-->' => '<style>' . rd(SRC . '/app.css') . '</style>',
    '<!--@JS-->'  => "<script>\n" . $js . '</script>',
  ]);
}

/** Klasörü içeriğiyle siler (yalnız boş ya da önceki bir derleme ise; yanlış klasörü silmeye karşı). */
function cleanOut(string $out): void {
  if (!is_dir($out)) return;
  $items = array_diff(scandir($out) ?: [], ['.', '..']);
  if ($items && !is_dir("$out/assets") && realpath($out) !== realpath(ROOT . '/dist')) fail("çıktı klasörü boş değil ve bir derleme değil: $out");
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($out, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
  foreach ($it as $f) $f->isDir() && !$f->isLink() ? rmdir($f->getPathname()) : unlink($f->getPathname());
}
/** Sunucu dosyalarını kopyalar ($skip: göreli yol için true dönerse atlanır). */
function copyTree(string $from, string $to, ?callable $skip = null): int {
  $n = 0; $base = strlen(rtrim($from, '/')) + 1;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($from, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
  foreach ($it as $f) {
    $rel = str_replace('\\', '/', substr($f->getPathname(), $base));
    if ($skip && $skip($rel)) continue;
    if ($f->isDir()) { if (!is_dir("$to/$rel")) mkdir("$to/$rel", 0777, true); continue; }
    wr("$to/$rel", rd($f->getPathname())); $n++;
  }
  return $n;
}
function appVersion(): string {
  if (!preg_match("~define\('YP_APP_VERSION',\s*'([0-9A-Za-z.\-]+)'\)~", rd(ROOT . '/app/bootstrap.php'), $m)) fail('YP_APP_VERSION bulunamadı');
  return $m[1];
}

function prod(bool $demo, string $out, bool $zip): void {
  cleanOut($out);
  $h = fn(string $c) => substr(sha1($c), 0, 10);
  $css = rd(SRC . '/app.css'); wr("$out/assets/app.css", $css);
  $tags = [];
  foreach (manifest() as $f) {
    $k = kind($f); if ($k === ($demo ? 'prod' : 'demo')) continue;
    $c = rd(SRC . "/js/$f"); wr("$out/assets/js/$f", $c);
    $tags[] = '<script src="assets/js/' . $f . '?v=' . $h($c) . '"></script>';
  }
  $page = fn(string $boot) => strtr(shell(), [
    '<!--@CSS-->' => '<link rel="stylesheet" href="assets/app.css?v=' . $h($css) . '">',
    '<!--@JS-->'  => $boot . "\n" . implode("\n", $tags),
  ]);
  if ($demo) {
    wr("$out/index.html", $page('<script>window.YP_MODE="demo";</script>'));
    echo rel($out) . '/ yazıldı (' . count($tags) . " js, demo dahil; index.html)\n";
    return;
  }
  $html = $page('<?php echo $ypBootTag; ?>');
  if (str_contains($html, '<?') && substr_count($html, '<?') !== 1) fail('shell.html içinde "<?" olamaz (PHP olarak yorumlanır)');
  wr("$out/index.php", rd(SRC . '/index-head.php.tpl') . $html);
  // sunucu tarafı: app/ api/ kurulum/ ve koruma dosyaları
  $n = copyTree(ROOT . '/app', "$out/app");
  $n += copyTree(ROOT . '/api', "$out/api", fn($r) => preg_match('~^(data/.+|[^/]+\.(md|txt))$~', $r) && !in_array($r, ['data/.htaccess', 'data/index.php'], true));
  $n += copyTree(ROOT . '/kurulum', "$out/kurulum");
  foreach (['storage', 'uploads'] as $d) foreach (['.htaccess', 'index.php'] as $g) { wr("$out/$d/$g", rd(ROOT . "/$d/$g")); $n++; }
  wr("$out/.htaccess", rd(ROOT . '/.htaccess')); $n++;
  $v = appVersion();
  echo rel($out) . '/ yazıldı (' . count($tags) . " js, demo hariç; index.php + $n sunucu dosyası; sürüm $v)\n";
  if ($zip) makeZip($out, $v);
}

/** Yüklemeye hazır zip: dist/ ağacı + tek kullanımlık kurulum kodu (storage/kurulum_kodu.php, kurulum/index.php bunu sorar). */
function makeZip(string $out, string $v): void {
  if (!class_exists('ZipArchive')) fail('PHP zip eklentisi yok (ZipArchive)');
  $name = "yangpazar-site-$v.zip"; $zf = "$out/$name";
  $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $code = '';
  for ($i = 0; $i < 12; $i++) $code .= $abc[random_int(0, strlen($abc) - 1)];
  $z = new ZipArchive();
  if ($z->open($zf, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) fail("zip açılamadı: $zf");
  $base = strlen(rtrim($out, '/')) + 1; $n = 0;
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($out, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST);
  foreach ($it as $f) {
    $rel = str_replace('\\', '/', substr($f->getPathname(), $base));
    if (preg_match('~^yangpazar-site-.*\.(zip|txt)$~', $rel)) continue;
    if ($rel === 'app/routes/90_test.php') continue; // yalnız test kancası (YP_TEST=1 + SQLite); yüklenecek pakete girmez
    if ($f->isDir()) { $z->addEmptyDir($rel); continue; }
    $z->addFile($f->getPathname(), $rel); $n++;
  }
  $z->addFromString('storage/kurulum_kodu.php', "<?php\n// Tek kullanımlık kurulum kodu. Kurulum bitince sihirbaz bu dosyayı siler.\nreturn '$code';\n");
  if (!$z->close()) fail("zip yazılamadı: $zf");
  $tf = "$out/yangpazar-site-$v-KURULUM-KODU.txt";
  wr($tf, "yangpazar.com kurulum kodu\n\nPaket: $name\nKurulum kodu: $code\n\nKurulum sihirbazı (https://ALANADI/kurulum/) ilk açılışta bu kodu ister.\nBu dosyayı sunucuya YÜKLEMEYİN; kodu kimseyle paylaşmayın.\n");
  echo rel($zf) . ' yazıldı (' . ($n + 1) . " dosya, " . round(filesize($zf) / 1024) . " KB)\n";
  echo "KURULUM KODU: $code   (ayrıca " . rel($tf) . ")\n";
}

/** api/ dosyalarını API_KIT_FILES dizisine String.raw olarak gömer (eski embed_kit.js'in PHP karşılığı). */
function embedApi(): void {
  $kit = SRC . '/js/demo/kits.js'; $api = ROOT . '/api';
  $h = rd($kit);
  $b = strpos($h, '/* API_KIT_BEGIN */'); $e = strpos($h, '/* API_KIT_END */');
  if ($b === false || $e === false || $e < $b) fail('API_KIT_BEGIN/END işaretleri bulunamadı');
  preg_match_all("~\\['(api/[^']+)',~", substr($h, $b, $e - $b), $m);
  $out = [];
  foreach ($m[1] as $p) {
    $f = $api . '/' . substr($p, 4);
    if (!is_file($f)) fail("dosya yok: $f");
    $c = rd($f);
    if (str_contains($c, '`') || str_contains($c, '${') || str_ends_with($c, '\\')) fail("gömülemez karakter (` veya \${ veya sonda \\): $p");
    $out[] = "  ['$p', String.raw`$c`]";
  }
  $all = [];
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($api, FilesystemIterator::SKIP_DOTS));
  foreach ($it as $f) if ($f->isFile()) $all[] = 'api/' . str_replace('\\', '/', substr($f->getPathname(), strlen($api) + 1));
  $nb = "/* API_KIT_BEGIN */\nconst API_KIT_FILES = [\n" . implode(",\n", $out) . "\n];\n";
  wr($kit, substr($h, 0, $b) . $nb . substr($h, $e));
  $extra = array_values(array_diff($all, $m[1]));
  echo count($out) . ' dosya gömüldü; listede olmayan: ' . ($extra ? implode(', ', $extra) : '-') . "\n";
  echo "Şimdi: php tools/build.php --single\n";
}

$a = array_slice($argv, 1);
if (in_array('--single', $a, true)) { $s = single(); wr(ROOT . '/index.html', $s); echo 'index.html yazıldı (' . strlen($s) . " bayt)\n"; }
elseif (in_array('--check', $a, true)) {
  if (single() !== rd(ROOT . '/index.html')) { fwrite(STDERR, "index.html güncel değil: php tools/build.php --single\n"); exit(1); }
  echo "index.html güncel.\n";
}
elseif (in_array('--prod', $a, true) || in_array('--zip', $a, true)) {
  $out = ROOT . '/dist';
  foreach ($a as $x) if (str_starts_with($x, '--out=')) { $out = substr($x, 6); if ($out === '') fail('--out= boş'); if ($out[0] !== '/') $out = getcwd() . '/' . $out; }
  $demo = in_array('--demo', $a, true);
  if ($demo && in_array('--zip', $a, true)) fail('--zip yalnız canlı paket (--prod) içindir');
  prod($demo, rtrim($out, '/'), in_array('--zip', $a, true));
}
elseif (in_array('--embed-api', $a, true)) embedApi();
else { fwrite(STDERR, "Kullanım: php tools/build.php --single | --check | --prod [--demo|--zip] [--out=klasör] | --embed-api\n"); exit(2); }
