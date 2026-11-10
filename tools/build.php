<?php
/*
 * yangpazar.com ön yüz derleyicisi (PHP 8 CLI, bağımlılık yok).
 *
 *   php tools/build.php --single        src/ → index.html (kök; tek dosya, demo verisiyle). Kökteki index.html bu komutun çıktısıdır.
 *   php tools/build.php --check         index.html, src/ ile güncel mi? (değilse çıkış kodu 1)
 *   php tools/build.php --prod          src/ → dist/ (assets/app.css, assets/js/*.js ?v=<hash>; demo/ hariç, prod/ saplamaları dahil)
 *   php tools/build.php --prod --demo   aynı, ama demo/ dosyaları dahil ve prod/ saplamaları hariç (çok dosyalı demo)
 *   php tools/build.php --embed-api     api/ klasörünü src/js/demo/kits.js içindeki API_KIT_FILES'a yeniden gömer
 *
 * Kaynaklar: src/shell.html (<!--@CSS--> ve <!--@JS--> yer tutucuları), src/app.css, src/js/manifest.txt (sıra), src/js/**.js
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
function rel(string $p): string { return ltrim(substr($p, strlen(ROOT)), '/'); }

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

function prod(bool $demo): void {
  $out = ROOT . '/dist';
  if (is_dir($out)) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($out, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
  }
  $h = fn(string $c) => substr(sha1($c), 0, 10);
  $css = rd(SRC . '/app.css'); wr("$out/assets/app.css", $css);
  $tags = [];
  foreach (manifest() as $f) {
    $k = kind($f); if ($k === ($demo ? 'prod' : 'demo')) continue;
    $c = rd(SRC . "/js/$f"); wr("$out/assets/js/$f", $c);
    $tags[] = '<script src="assets/js/' . $f . '?v=' . $h($c) . '"></script>';
  }
  wr("$out/index.html", strtr(shell(), [
    '<!--@CSS-->' => '<link rel="stylesheet" href="assets/app.css?v=' . $h($css) . '">',
    '<!--@JS-->'  => implode("\n", $tags),
  ]));
  echo 'dist/ yazıldı (' . count($tags) . ' js' . ($demo ? ', demo dahil' : ', demo hariç') . ")\n";
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
elseif (in_array('--prod', $a, true)) prod(in_array('--demo', $a, true));
elseif (in_array('--embed-api', $a, true)) embedApi();
else { fwrite(STDERR, "Kullanım: php tools/build.php --single | --check | --prod [--demo] | --embed-api\n"); exit(2); }
