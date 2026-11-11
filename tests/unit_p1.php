<?php
/**
 * P1 birim testleri (tests/run.php içinden yüklenir): sansür (Node'daki asıl CENSOR ile birebir), medya doğrulama ve yeniden
 * kodlama (GD ile üretilen GIF/PNG/JPEG/WEBP, .jpg adlı PHP, betikli SVG, çok büyük dosya, dev çözünürlük, gizlenmiş kod),
 * anahtar kümesi sayfalama, kurulu P0b veritabanına otomatik güncelleme (Updater), SEO (meta, sitemap, robots), ilan girdisi.
 */
if (PHP_SAPI !== 'cli' || !function_exists('section')) {
    exit;
}

use YP\Catalog;
use YP\Censor;
use YP\Db;
use YP\Http\HttpError;
use YP\Media;
use YP\Schema;
use YP\Seo;
use YP\Settings;
use YP\Text;
use YP\Updater;

/** Test ilanı */
function mkListing(Db $db, $seller, $server, array $x = [])
{
    static $n = 0;
    $n++;
    $now = yp_now_ms();
    $t = isset($x['title']) ? $x['title'] : 'Test ilanı ' . $n;
    $id = $db->insert('listings', array_merge([
        'seller_id' => (int)$seller, 'game' => 'metin2', 'server_id' => $server ? (int)$server['id'] : null, 'sec' => $server ? $server['sec'] : null,
        'cat' => 'yang', 'title' => $t, 'title_norm' => Text::fold($t), 'price' => 1000, 'stock' => 5, 'del_txt' => '5 dk', 'descr' => '',
        'status' => 'aktif', 'cover' => 'yang-1', 'bump_at' => $now, 'created_at' => $now, 'updated_at' => $now,
    ], $x));
    $db->update('listings', ['no' => 100000 + $id], 'id=?', [$id]);
    return $db->one('SELECT * FROM {listings} WHERE id=?', [$id]);
}

section('censor', function () {
    $cases = [
        'Satıyorum, ara 0555 123 45 67', 'whatsapp: +90 532 111 22 33 yaz', 'mail: deneme.k@ornek.com.tr', 'site www.kotusite.net/x',
        'https://bit.ly/abc girin', 'discord kanalım var', 'DC: ali#1234', 'tg ile yaz', 'Instagram hesabım', 'iban ver komisyonsuz olsun',
        'elden teslim, site dışı ödeme', 'numaram 05321112233', 'kotu-site.com üzerinden', 'yangpazar.com.tr adresi', 'kartımı 1234 5678 9012 3456',
        'Normal başlık +9 Ejderha Kılıcı', '100M yang 7/24 teslim', 'Dctr yazmayın wpdeneme', 'Şaman 120 Lv full set', 'Dışarıda buluşalım', 'GSM no yok',
        'fiyat 1.250,00 TL', 'Instagramda değil', 'e-posta: Ali_Veli+x@mail-server.io', 'tel no: 0 (532) 111-22-33', "çok satırlı\nwww.a.com\nson",
    ];
    $bad = [];
    foreach ($cases as $c) {
        $r = Censor::apply($c);
        if ($r['flagged'] !== (strpos($r['text'], '[gizlendi]') !== false)) {
            $bad[] = $c;
        }
    }
    ok('flagged ⇔ metinde [gizlendi]', !$bad, $bad);
    ok('telefon gizlenir', Censor::apply('ara 0555 123 45 67')['text'] === 'ara [gizlendi]');
    ok('e-posta + site gizlenir', strpos(Censor::apply('mail: deneme.k@ornek.com.tr')['text'], 'ornek') === false);
    ok('normal başlık dokunulmaz', Censor::apply('Normal başlık +9 Ejderha Kılıcı') === ['text' => 'Normal başlık +9 Ejderha Kılıcı', 'flagged' => false]);
    ok('Türkçe harfle bitişik sözcük (Instagramda) — JS ile aynı: \\p{L} sınırı', Censor::apply('Instagramda değil')['flagged'] === false);
    // Node'daki ASIL ifadelerle birebir karşılaştırma
    $js = file_get_contents(dirname(__DIR__) . '/src/js/40-views-public.js');
    $p = strpos($js, 'const CENSOR = [');
    $e = strpos($js, '];', $p);
    $node = trim((string)@shell_exec('command -v node 2>/dev/null'));
    if ($p === false || $e === false || $node === '') {
        ok('Node parite testi atlandı (node yok)', true);
        return;
    }
    $src = substr($js, $p, $e - $p + 2) . "\nfunction censor(x){ let flagged=false, out=String(x||''); CENSOR.forEach(rx=>{ out=out.replace(rx,()=>{flagged=true; return '[gizlendi]';}); }); return {text:out, flagged}; }\n"
        . 'const C=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(JSON.stringify(C.map(censor)));';
    $f = sys_get_temp_dir() . '/yp-censor-' . getmypid() . '.js';
    file_put_contents($f, $src);
    $proc = proc_open([$node, $f], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    fwrite($pipes[0], json_encode($cases, JSON_UNESCAPED_UNICODE));
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]);
    proc_close($proc);
    @unlink($f);
    $jsr = json_decode($out, true);
    $diff = [];
    foreach ($cases as $i => $c) {
        $ph = Censor::apply($c);
        if (!isset($jsr[$i]) || $jsr[$i]['text'] !== $ph['text'] || $jsr[$i]['flagged'] !== $ph['flagged']) {
            $diff[] = ['in' => $c, 'js' => isset($jsr[$i]) ? $jsr[$i] : null, 'php' => $ph];
        }
    }
    ok('PHP sansürü = ön yüz CENSOR (Node, ' . count($cases) . ' örnek)', is_array($jsr) && !$diff, $diff);
    $db = freshDb();
    Censor::log($db, null, 'İlan açıklaması #1', 'numaram 0555');
    ok('flagged tablosuna yazılır', (int)$db->val('SELECT COUNT(*) FROM {flagged} WHERE seen=0') === 1);
});

section('media', function () {
    $dir = sys_get_temp_dir() . '/yp-media-' . getmypid();
    @mkdir($dir, 0700, true);
    $img = function ($w, $h, $alpha = false) {
        $im = imagecreatetruecolor($w, $h);
        if ($alpha) {
            imagealphablending($im, false);
            imagesavealpha($im, true);
            imagefill($im, 0, 0, imagecolorallocatealpha($im, 255, 0, 0, 80));
        } else {
            imagefill($im, 0, 0, imagecolorallocate($im, 30, 120, 200));
        }
        imagefilledrectangle($im, 5, 5, (int)($w / 2), (int)($h / 2), imagecolorallocate($im, 250, 200, 0));
        return $im;
    };
    $f = [];
    $im = $img(2400, 1200);
    imagejpeg($im, $f['jpg'] = "$dir/a.jpg", 90);
    // JPEG'e sahte EXIF (APP1) bölümü ekle: içinde konum benzeri gizli metin
    $j = file_get_contents($f['jpg']);
    $exif = "Exif\0\0" . 'MM' . "\0*\0\0\0\x08" . str_repeat("\0", 6) . 'GIZLI-GPS-41.0082N';
    $app1 = "\xFF\xE1" . pack('n', strlen($exif) + 2) . $exif;
    file_put_contents($f['jpg'], substr($j, 0, 2) . $app1 . substr($j, 2));
    imagepng($img(300, 200, true), $f['png'] = "$dir/b.png");
    imagegif($img(120, 80), $f['gif'] = "$dir/c.gif");
    imagewebp($img(640, 480), $f['webp'] = "$dir/d.webp", 80);
    file_put_contents($f['php'] = "$dir/kabuk.jpg", "<?php system(\$_GET['c']); ?>\n");
    file_put_contents($f['svg'] = "$dir/x.jpg", '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    file_put_contents($f['html'] = "$dir/y.png", '<html><body><script>alert(1)</script></body></html>');
    // GIF başlığı + PHP (polyglot)
    file_put_contents($f['poly'] = "$dir/p.gif", file_get_contents($f['gif']) . '<?php echo 1; ?>');
    $fh = fopen($f['big'] = "$dir/big.jpg", 'wb');
    fwrite($fh, "\xFF\xD8\xFF\xE0");
    ftruncate($fh, 10 * 1048576 + 1);
    fclose($fh);
    // dev çözünürlük: IHDR'de 20000×20000 (piksel verisi yok — bellek bombası denemesi)
    imagepng($img(10, 10), $f['huge'] = "$dir/huge.png");
    $png = file_get_contents($f['huge']);
    file_put_contents($f['huge'], substr($png, 0, 16) . pack('NN', 20000, 20000) . substr($png, 24));
    file_put_contents($f['empty'] = "$dir/e.jpg", '');
    file_put_contents($f['mp4'] = "$dir/v.mp4", "\0\0\0\x18ftypmp42\0\0\0\0mp42isom" . str_repeat("\0", 64));

    $err = function ($path, $kind = 'listing') {
        try {
            Media::inspect($path, $kind);
        } catch (HttpError $e) {
            return $e->http . ':' . (isset($e->extra['fields']['file']) ? $e->extra['fields']['file'] : $e->getMessage());
        }
        return 'ok';
    };
    foreach (['jpg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp'] as $k => $mime) {
        $m = Media::inspect($f[$k], 'listing');
        ok("geçerli $k → $mime", $m['type'] === 'image' && $m['mime'] === $mime);
    }
    ok('.jpg adlı PHP dosyası reddedilir (içerik text/x-php)', strpos($err($f['php']), '422:Bu dosya türü yüklenemez') === 0, $err($f['php']));
    ok('betikli SVG (.jpg adıyla) reddedilir', strpos($err($f['svg']), '422:Bu dosya türü yüklenemez') === 0, $err($f['svg']));
    ok('HTML (.png adıyla) reddedilir', strpos($err($f['html']), '422:') === 0);
    ok('GIF + gömülü PHP (polyglot) reddedilir', strpos($err($f['poly']), '422:Görsel dosyası geçersiz içerik') === 0, $err($f['poly']));
    ok('10 MB üstü reddedilir (Türkçe sınır)', $err($f['big']) === '422:Dosya çok büyük (en fazla 10 MB).', $err($f['big']));
    ok('20000×20000 (piksel bombası) reddedilir', strpos($err($f['huge']), 'çözünürlüğü çok yüksek') !== false, $err($f['huge']));
    ok('boş dosya reddedilir', strpos($err($f['empty']), '422:') === 0);
    ok('video: ilan görseli olarak reddedilir', strpos($err($f['mp4']), '422:Bu dosya türü') === 0);
    ok('video: teslim kanıtı (proof) türünde kabul', Media::inspect($f['mp4'], 'proof')['type'] === 'video');
    ok('bilinmeyen tür reddedilir', throws(function () use ($f) {
        Media::inspect($f['jpg'], 'exe');
    }) instanceof HttpError);

    $db = freshDb();
    $u = mkUser($db, 'Yukleyici');
    $m = Media::store($db, $u, $f['jpg'], 'listing', 'tatil fotoğrafı.jpg');
    $abs = Media::absPath($m);
    $out = file_get_contents($abs);
    $ext = function_exists('imagewebp') ? 'webp' : 'jpg';
    ok('yeniden kodlandı: ' . $ext . ', en uzun kenar 1600', $m['mime'] === (function_exists('imagewebp') ? 'image/webp' : 'image/jpeg') && (int)$m['w'] === 1600 && (int)$m['h'] === 800, [$m['mime'], $m['w'], $m['h']]);
    ok('EXIF/gömülü metin atıldı', strpos($out, 'GIZLI-GPS') === false && strpos($out, 'Exif') === false);
    ok('rastgele ad, uploads/Y/m/ altında', (bool)preg_match('#^uploads/\d{4}/\d{2}/[0-9a-f]{32}\.' . $ext . '$#', $m['path']), $m['path']);
    ok('herkese açık klasör 0755, dosya 0644 (web sunucusu okuyabilsin)', (fileperms(dirname($abs)) & 0777) === 0755 && (fileperms($abs) & 0777) === 0644, sprintf('%o %o', fileperms(dirname($abs)) & 0777, fileperms($abs) & 0777));
    ok('alt klasörde boş index.php', is_file(dirname($abs) . '/index.php'));
    ok('sha256 + boyut kaydedildi', $m['sha256'] === hash_file('sha256', $abs) && (int)$m['bytes'] === filesize($abs));
    ok('özgün ad yalnız bilgi amaçlı', $m['orig_name'] === 'tatil fotoğrafı.jpg');
    $pm = Media::store($db, $u, $f['png'], 'support');
    ok('özel tür storage/media altında, 0600', strpos($pm['path'], 'media/') === 0 && is_file(YP_STORAGE . '/' . $pm['path']) && (fileperms(YP_STORAGE . '/' . $pm['path']) & 0777) === 0600);
    ok('özel tür adresi API üzerinden', strpos(Media::url($pm), 'api/v1/index.php?r=media/m' . $pm['id']) !== false);
    $g = Media::store($db, $u, $f['gif'], 'listing');
    ok('GIF de yeniden kodlanır (animasyon/eklenti atılır)', $g['mime'] !== 'image/gif' && (int)$g['w'] === 120);
    $other = mkUser($db, 'Baskasi');
    $staff = mkUser($db, 'Destekci', ['role' => 'staff', 'perms' => json_encode(['destek'])]);
    $ilanci = mkUser($db, 'Ilanci', ['role' => 'staff', 'perms' => json_encode(['ilan'])]);
    ok('özel dosya: sahibi görür', Media::canView($u, $pm));
    ok('özel dosya: başka üye göremez', !Media::canView($other, $pm));
    ok('özel dosya: ziyaretçi göremez', !Media::canView(null, $pm));
    ok('özel destek dosyası: [destek] görür, [ilan] göremez', Media::canView($staff, $pm) && !Media::canView($ilanci, $pm));
    ok('herkese açık dosya: herkes', Media::canView(null, $m));
    // sahipsiz yüklemeler 24 saat sonra silinir
    $db->update('media', ['created_at' => yp_now_ms() - 2 * 86400000], 'id=?', [(int)$g['id']]);
    ok('sahipsiz eski yükleme temizlenir', Media::cleanupOrphans($db) === 1 && !is_file(Media::absPath($g)) && !$db->val('SELECT id FROM {media} WHERE id=?', [(int)$g['id']]));
    exec('rm -rf ' . escapeshellarg($dir));
});

section('catalog', function () {
    $db = freshDb();
    ok('göç: varsayılan serverlar (16 TR + PVP) yazıldı', (int)$db->val("SELECT COUNT(*) FROM {servers} WHERE sec='tr'") === 16
        && (int)$db->val('SELECT COUNT(*) FROM {servers}') === count(require YP_APP . '/seed/servers.php'));
    ok('göç: demo ilanı YOK', (int)$db->val('SELECT COUNT(*) FROM {listings}') === 0);
    ok('server adresleri benzersiz, ön yüz slugify ile aynı', (int)$db->val('SELECT COUNT(DISTINCT slug) FROM {servers}') === (int)$db->val('SELECT COUNT(*) FROM {servers}')
        && $db->val("SELECT slug FROM {servers} WHERE name='Ruby Türkiye Charon'") === 'ruby-turkiye-charon');
    ok('EP açık PVP serverları (Ejder2, Aisha2, Anka2)', array_column($db->all('SELECT name FROM {servers} WHERE ep_on=1 ORDER BY sort'), 'name') === ['Ejder2', 'Aisha2', 'Anka2']);
    $srvs = Catalog::servers($db);
    ok('server S şekli: id sv…, c:[c1,c2], n sayıları', $srvs[0]['id'] === 'sv1' && $srvs[0]['name'] === 'Diamond Nite' && $srvs[0]['c'] === ['#16325c', '#4fa3e8'] && $srvs[0]['n']['all'] === 0);
    $s1 = $db->one('SELECT * FROM {servers} WHERE id=1');
    $s2 = $db->one("SELECT * FROM {servers} WHERE sec='pvp' ORDER BY id LIMIT 1");
    $a = mkUser($db, 'Satici1');
    $b = mkUser($db, 'Satici2');
    $t0 = 1700000000000;
    $all = [];
    for ($i = 0; $i < 57; $i++) {
        // tekrar eden bump_at ve fiyatlar: eşitlikte id ile sıralama denenir
        $all[] = mkListing($db, $i % 2 ? $a['id'] : $b['id'], $i % 3 ? $s1 : $s2, ['bump_at' => $t0 + intdiv($i, 4) * 1000, 'price' => 100 * (1 + $i % 7),
            'cat' => $i % 5 ? 'yang' : 'item', 'title' => ($i % 9 ? 'Won satışı ' : 'Ejderha Kılıcı ') . $i]);
    }
    mkListing($db, $a['id'], $s1, ['status' => 'beklemede']);
    mkListing($db, $a['id'], $s1, ['status' => 'kaldirildi']);
    mkListing($db, $a['id'], $s1, ['stock' => 0]);
    $page = function (array $f, $limit) use ($db) {
        $ids = [];
        $after = null;
        for ($guard = 0; $guard < 100; $guard++) {
            list($rows, $next) = Catalog::query($db, $f + ['after' => $after], $limit);
            foreach ($rows as $r) {
                $ids[] = (int)$r['id'];
            }
            if (!$next) {
                break;
            }
            $after = $next;
        }
        return $ids;
    };
    foreach (['yeni' => [['bump_at', -1]], 'ucuz' => [['price', 1]], 'pahali' => [['price', -1]], 'eski' => [['bump_at', 1]]] as $sort => $o) {
        $exp = $all;
        $col = $o[0][0];
        $dir = $o[0][1];
        usort($exp, function ($x, $y) use ($col, $dir) {
            return $dir * (($x[$col] <=> $y[$col]) ?: ((int)$x['id'] <=> (int)$y['id']));
        });
        $exp = array_map('intval', array_column($exp, 'id'));
        foreach ([1, 7, 10, 60] as $lim) {
            $got = $page(['sort' => $sort], $lim);
            ok("keyset $sort / limit $lim: eksiksiz, tekrarsız, doğru sıra", $got === $exp, ['got' => array_slice($got, 0, 12), 'exp' => array_slice($exp, 0, 12)]);
        }
    }
    ok('herkese açık listede bekleyen/kaldırılan/stoksuz yok', count($page([], 100)) === 57);
    ok('filtre: server + kategori', $page(['server_id' => (int)$s1['id'], 'cat' => 'item'], 5) === array_values(array_map('intval', array_column(array_reverse(array_values(array_filter($all, function ($l) use ($s1) {
        return (int)$l['server_id'] === (int)$s1['id'] && $l['cat'] === 'item';
    }))), 'id'))) || count($page(['server_id' => (int)$s1['id'], 'cat' => 'item'], 5)) === count(array_filter($all, function ($l) use ($s1) {
        return (int)$l['server_id'] === (int)$s1['id'] && $l['cat'] === 'item';
    })));
    ok('filtre: bölüm (sec=pvp)', count($page(['sec' => 'pvp'], 9)) === count(array_filter($all, function ($l) {
        return $l['sec'] === 'pvp';
    })));
    ok('arama: TR katlamalı (EJDERHA kılıcı)', count($page(['q' => 'EJDERHA KILICI'], 50)) === 7);
    ok('arama: ilan numarası', count($page(['q' => '#' . $all[3]['no']], 50)) === 1);
    ok('arama: LIKE jokerleri kaçışlı', count($page(['q' => '%'], 50)) === 0 && count($page(['q' => '_'], 50)) === 0);
    ok('filtre: satıcı', count($page(['seller_id' => (int)$a['id']], 50)) === 28);
    ok('bozuk imleç yok sayılır', count(Catalog::query($db, ['after' => "1' OR 1=1"], 100)[0]) === 57);
    list($L, $U) = Catalog::presentMany($db, [$all[0]]);
    $x = $L[0];
    ok('ilan S şekli (fiyat TL, id l…, server sv…, satıcı u…)', $x['id'] === 'l' . $all[0]['id'] && $x['price'] === 1.0 && $x['server'] === 'sv' . $s2['id'] && $x['seller'] === 'u' . $b['id']
        && $x['no'] === 100000 + (int)$all[0]['id'] && $x['status'] === 'aktif' && $x['imgs'] === [] && $x['img'] === null && is_object($x['dop']));
    ok('satıcılar herkese açık alanlarla (e-posta/telefon yok)', count($U) === 1 && !isset($U[0]['email']) && !isset($U[0]['tel']) && $U[0]['name'] === 'Satici2');
    ok('server sayıları (n) aktif ilanlardan', Catalog::servers($db)[0]['n']['all'] === count(array_filter($all, function ($l) use ($s1) {
        return (int)$l['server_id'] === (int)$s1['id'];
    })));

    // ilan girdisi
    $site = Settings::get('site', $db);
    $in = ['game' => 'metin2', 'server' => 'sv1', 'cat' => 'yang', 'title' => 'Won satılık, whatsapp 0555 111 22 33', 'price' => '1.250,50', 'stock' => 3, 'del' => '5 dk', 'desc' => "Satır 1\nwww.kotu.com\n\n\n\nSon"];
    list($row, $flags) = Catalog::listingInput($db, $in, true, $site);
    ok('fiyat kuruş (1.250,50 → 125050)', $row['price'] === 125050);
    ok('başlık ve açıklama sansürlenir + bayrak', strpos($row['title'], '[gizlendi]') !== false && strpos($row['descr'], 'kotu') === false && isset($flags['title'], $flags['desc']));
    ok('açıklama satır sonları korunur, fazlası sadeleşir', $row['descr'] === "Satır 1\n[gizlendi]\n\nSon", $row['descr']);
    ok('server bölümü ilana yazılır, kapak varsayılanı', $row['sec'] === 'tr' && $row['server_id'] === 1 && $row['cover'] === 'yang-1');
    $e = throws(function () use ($db, $in, $site) {
        Catalog::listingInput($db, $in + ['dop' => ['vitrin' => 3]], true, $site);
    });
    ok('doping alanı → 400 Türkçe "yakında"', $e instanceof HttpError && $e->http === 400 && $e->errCode === 'doping_soon' && strpos($e->getMessage(), 'yakında') !== false);
    $e = throws(function () use ($db, $in, $site) {
        Catalog::listingInput($db, array_merge($in, ['cat' => 'ep']), true, $site);
    });
    ok('TR serverda EP ilanı reddedilir', $e instanceof HttpError && isset($e->extra['fields']['cat']));
    $e = throws(function () use ($db, $site) {
        Catalog::listingInput($db, ['game' => 'metin2', 'server' => 'sv99999', 'cat' => 'yang', 'title' => 'abc', 'price' => 0], true, $site);
    });
    ok('doğrulama: server, başlık, fiyat alanları', $e instanceof HttpError && $e->http === 422 && isset($e->extra['fields']['server'], $e->extra['fields']['title'], $e->extra['fields']['price']));
    $e = throws(function () use ($db, $in, $site) {
        Catalog::listingInput($db, $in + ['media' => array_fill(0, 11, 'm1')], true, $site);
    });
    ok('en fazla 10 görsel', $e instanceof HttpError && isset($e->extra['fields']['media']));
});

section('updater', function () {
    // Canlı sitedeki durum: P0b kurulumu (yalnız sistem + üye tabloları, göç 0001) → yeni paket → ilk istek
    $file = sys_get_temp_dir() . '/yp-upd-' . getmypid() . '.sqlite';
    @unlink($file);
    $db = Db::connect(['driver' => 'sqlite', 'path' => $file]);
    Db::setMain($db);
    Settings::clearCache();
    $p0b = [];
    foreach (['00_system.php', '10_users.php'] as $sf) {
        $p0b += require YP_APP . '/schema/' . $sf;
    }
    Schema::sync($db, $p0b);
    $mdir = sys_get_temp_dir() . '/yp-mig-' . getmypid();
    @mkdir($mdir);
    copy(YP_APP . '/migrations/0001_default_settings.php', $mdir . '/0001_default_settings.php');
    Schema::migrate($db, $mdir);
    $u = mkUser($db, 'EskiUye', ['email' => 'eski@ornek.com']);
    Settings::set('site', array_merge(Settings::get('site', $db), ['siteName' => 'Canlı Site']), null, $db);
    ok('ön koşul: P0b veritabanında katalog tabloları yok', !$db->tableExists('listings') && !$db->tableExists('servers'));
    @unlink(YP_STORAGE . '/cache/schema_ver.txt');
    $done = Updater::ensure($db);
    ok('ilk istekte tablolar otomatik oluştu', $db->tableExists('servers') && $db->tableExists('listings') && $db->tableExists('media')
        && $db->tableExists('listing_media') && $db->tableExists('covers') && $db->tableExists('flagged'), $done);
    ok('göç 0002 uygulandı (serverlar yazıldı)', in_array('göç uygulandı: m:0002_catalog_seed', $done, true) && (int)$db->val('SELECT COUNT(*) FROM {servers}') > 200);
    ok('mevcut veri korundu (üye, ayarlar)', $db->val('SELECT name FROM {users} WHERE id=?', [(int)$u['id']]) === 'EskiUye' && Settings::get('site', $db)['siteName'] === 'Canlı Site');
    ok('güncelleme audit_log + imza dosyasına yazıldı', (int)$db->val("SELECT COUNT(*) FROM {audit_log} WHERE action='schema_update'") === 1 && Updater::marker() === Updater::codeVersion());
    ok('ikinci istek: hiçbir şey yapmaz', Updater::ensure($db) === [] && Schema::install($db) === []);
    // panel serverları silerse göç tekrar çalışsa bile yeniden yazmaz
    $db->exec('DELETE FROM {servers} WHERE id>3');
    $fn = require YP_APP . '/migrations/0002_catalog_seed.php';
    $fn($db);
    ok('0002 yalnız boş tabloya yazar (idempotent)', (int)$db->val('SELECT COUNT(*) FROM {servers}') === 3);
    // imza değişince (yeni dosya yüklendi) tekrar dener; şema güncelse boş döner
    file_put_contents(YP_STORAGE . '/cache/schema_ver.txt', "eski\n");
    ok('imza farklı → yeniden denetler, değişiklik yoksa sessiz', Updater::ensure($db) === [] && Updater::marker() === Updater::codeVersion());
    // başarısız güncelleme siteyi durdurmaz; 5 dk geri çekilir
    file_put_contents(YP_STORAGE . '/cache/schema_ver.txt', "eski\n");
    $db->pdo->exec('PRAGMA query_only=ON'); // her yazma başarısız olur
    $r1 = Updater::ensure($db);
    ok('hata → istek sürer, fail imzası yazılır', $r1 === [] && strpos(Updater::marker(), 'fail:' . Updater::codeVersion()) === 0);
    ok('geri çekilme süresinde yeniden denemez', Updater::ensure($db) === [] && strpos(Updater::marker(), 'fail:') === 0);
    $db->pdo->exec('PRAGMA query_only=OFF');
    // MySQL DDL: yeni tablolar da utf8mb4_unicode_ci (sunucu varsayılanı latin1)
    $cat = require YP_APP . '/schema/20_catalog.php';
    $bad = [];
    foreach ($cat as $t => $def) {
        $sql = Schema::tableDdl('mysql', 'yp_', $t, $def)[0];
        if (substr($sql, -66) !== ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci') {
            $bad[] = $t;
        }
    }
    ok('MySQL DDL: tüm P1 tabloları utf8mb4_unicode_ci', !$bad && count($cat) === 6, $bad);
    $my = implode("\n", Schema::tableDdl('mysql', 'yp_', 'listings', $cat['listings']));
    ok('MySQL DDL: listings dizinleri ve FK', strpos($my, 'KEY `yp_listings__ix_status_server_id_cat_bump_at`') !== false
        && strpos($my, 'FOREIGN KEY (`server_id`) REFERENCES `yp_servers` (`id`) ON DELETE SET NULL') !== false
        && strpos($my, "`status` ENUM('aktif','beklemede','satildi','kaldirildi') NOT NULL DEFAULT 'aktif'") !== false
        && strpos($my, "`sec` ENUM('tr','pvp') NULL DEFAULT NULL") !== false, $my);
    $sq = implode("\n", Schema::tableDdl('sqlite', 'yp_', 'listings', $cat['listings']));
    ok('SQLite DDL: CHECK + ayrı dizin', strpos($sq, "CHECK (`sec` IN ('tr','pvp') OR `sec` IS NULL)") !== false && strpos($sq, 'CREATE INDEX IF NOT EXISTS `yp_listings__ix_status_bump_at`') !== false);
    Db::setMain(null);
    $db = null;
    @unlink($file);
    exec('rm -rf ' . escapeshellarg($mdir));
});

section('seo', function () {
    $db = freshDb();
    Settings::set('site', array_merge(Settings::get('site', $db), ['siteName' => 'Yang Test', 'siteUrl' => 'https://test.yangpazar.com/']), null, $db);
    $u = mkUser($db, 'SeoSatici');
    $s = $db->one("SELECT * FROM {servers} WHERE name='Ruby Türkiye Charon'");
    $l = mkListing($db, $u['id'], $s, ['title' => '1 Won <script>x</script> & hızlı', 'price' => 2650, 'descr' => 'Anında teslim "tırnak"']);
    $pend = mkListing($db, $u['id'], $s, ['status' => 'beklemede', 'title' => 'Bekleyen ilan']);
    $h = Seo::head($db, '/ilan/' . Text::slug($l['title']) . '-l' . $l['id']);
    ok('ilan: başlık + server adı + site adı', $h['title'] === Text::cut('1 Won <script>x</script> & hızlı · Ruby Türkiye Charon', 60) . ' | Yang Test', $h['title']);
    ok('ilan: canonical temiz adres', $h['canonical'] === 'https://test.yangpazar.com/ilan/' . Text::slug($l['title']) . '-l' . $l['id']);
    ok('ilan: açıklama fiyatla', strpos($h['desc'], '26,50 ₺ · Ruby Türkiye Charon Won.') === 0, $h['desc']);
    ok('ilan: JSON-LD Product + Offer InStock + Breadcrumb', strpos($h['html'], '"@type":"Product"') !== false && strpos($h['html'], 'https://schema.org/InStock') !== false
        && strpos($h['html'], '"@type":"BreadcrumbList"') !== false && strpos($h['html'], '"price":"26.5"') !== false);
    ok('HTML kaçışı: <script> yok, JSON-LD kırılamaz', substr_count($h['html'], '<script') === 1 && strpos($h['html'], '&lt;script&gt;') !== false && strpos($h['html'], '<script') !== false);
    ok('index, follow', $h['robots'] === 'index, follow, max-image-preview:large');
    $h2 = Seo::head($db, '/index.php?p=ilan/x-l' . $pend['id']);
    ok('bekleyen ilan (?p= yolu): noindex, canonical yok', $h2['robots'] === 'noindex, follow' && $h2['canonical'] === '' && strpos($h2['html'], 'Bekleyen') === false);
    ok('olmayan ilan → 404 + noindex', Seo::head($db, '/ilan/yok-l999999')['status'] === 404);
    $hs = Seo::head($db, '/server/ruby-turkiye-charon/yang');
    ok('server kategori sayfası', $hs['title'] === 'Ruby Türkiye Charon Won İlanları | Yang Test' && $hs['canonical'] === 'https://test.yangpazar.com/server/ruby-turkiye-charon/yang', $hs);
    ok('server açıklaması (srvAuto, ilan sayısı; 158 karakterde kesilir)', strpos(Seo::srvAuto($db, $s, 'Yang Test'), 'şu an 1 aktif ilan var') !== false
        && mb_strlen(Seo::head($db, '/server/ruby-turkiye-charon')['desc']) <= 160);
    ok('olmayan server → 404', Seo::head($db, '/server/boyle-yok')['status'] === 404);
    $hh = Seo::head($db, '/');
    ok('ana sayfa: WebSite + Organization', $hh['title'] === 'Yang Test · Metin2 Item, Yang, Won, EP ve Karakter Pazarı' && strpos($hh['html'], '"@type":"WebSite"') !== false && $hh['canonical'] === 'https://test.yangpazar.com/');
    ok('statik sayfa (metin2-pvp)', Seo::head($db, '/metin2-pvp')['title'] === 'Metin2 PVP Serverlar · Item, Yang ve EP İlanları | Yang Test');
    ok('özel sayfa (hesabim) noindex', Seo::head($db, '/hesabim')['robots'] === 'noindex, follow');
    $xml = Seo::sitemapXml($db);
    ok('sitemap: geçerli XML', @simplexml_load_string($xml) !== false);
    ok('sitemap: server, server/kategori, aktif ilan; bekleyen yok', strpos($xml, '<loc>https://test.yangpazar.com/server/ruby-turkiye-charon</loc>') !== false
        && strpos($xml, '/server/ruby-turkiye-charon/yang</loc>') !== false && strpos($xml, '-l' . $l['id'] . '</loc>') !== false && strpos($xml, '-l' . $pend['id'] . '<') === false);
    ok('sitemap: EP açık PVP server için /ep', strpos($xml, '/server/ejder2/ep</loc>') !== false);
    $rb = Seo::robotsTxt($db);
    ok('robots: Sitemap satırı, özel yollar kapalı', strpos($rb, 'Sitemap: https://test.yangpazar.com/sitemap.xml') !== false && strpos($rb, 'Disallow: /yonetim') !== false && strpos($rb, 'Disallow: /api/') !== false);
    $w = Seo::writeFiles($db);
    ok('kök dosyalar yazıldı (0644)', $w['sitemap'] === true && $w['robots'] === true && is_file(YP_PUBLIC . '/sitemap.xml') && (fileperms(YP_PUBLIC . '/robots.txt') & 0777) === 0644);
    file_put_contents(YP_PUBLIC . '/robots.txt', "User-agent: *\nDisallow:\n");
    ok('sahibin elle yazdığı robots.txt korunur', Seo::writeFiles($db)['robots'] === 'elle' && file_get_contents(YP_PUBLIC . '/robots.txt') === "User-agent: *\nDisallow:\n");
});
