<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Medya yükleme (PLAN §1.2 Media).
 * - Tür, dosya adına/uzantıya/istemcinin bildirdiği MIME'a göre DEĞİL, içeriğe göre (finfo) belirlenir.
 * - Görseller GD ile yeniden kodlanır: EXIF ve gömülü her şey atılır, en uzun kenar 1600 px, webp (yoksa jpeg).
 *   SVG, PHP/HTML gizlenmiş dosyalar, bozuk görseller ve çok büyük piksel sayıları reddedilir.
 * - Video (yalnız teslim kanıtı/itiraz türleri): yalnız boyut + MIME denetimi (sunucuda ffmpeg yok), olduğu gibi saklanır.
 * - Rastgele dosya adı. Herkese açık türler uploads/Y/m/ (doğrudan sunulur; klasör 0755, dosya 0644 — LiteSpeed/Apache
 *   statik dosyayı okuyabilsin), özel türler storage/media/Y/m/ (yalnız api/v1 media/{id} ile, yetki denetimli).
 */
final class Media
{
    const MAX_SIDE = 1600;
    const MAX_PIXELS = 30000000;   // 30 MP (bellek: GD ~5 bayt/piksel)
    const MAX_DIM = 12000;
    const IMAGE_MIMES = ['image/jpeg' => IMAGETYPE_JPEG, 'image/png' => IMAGETYPE_PNG, 'image/gif' => IMAGETYPE_GIF, 'image/webp' => IMAGETYPE_WEBP];
    const VIDEO_MIMES = ['video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov'];

    /** tür => [görünürlük, izin verilen (image|video), azami MB, en uzun kenar, gereken yetki (null: her üye)] */
    public static function kinds()
    {
        return [
            'listing' => ['public', ['image'], 10, self::MAX_SIDE, null],
            'cover'   => ['public', ['image'], 10, 1000, 'ilan'],
            'logo'    => ['public', ['image'], 5, 400, 'server'],
            'slide'   => ['public', ['image'], 15, self::MAX_SIDE, 'reklam'],
            'ad'      => ['public', ['image'], 15, self::MAX_SIDE, null],
            'proof'   => ['private', ['image', 'video'], 60, self::MAX_SIDE, null],
            'dispute' => ['private', ['image', 'video'], 60, self::MAX_SIDE, null],
            'support' => ['private', ['image'], 10, self::MAX_SIDE, null],
            'receipt' => ['private', ['image'], 10, self::MAX_SIDE, null],
        ];
    }

    public static function kind($k)
    {
        $all = self::kinds();
        if (!is_string($k) || !isset($all[$k])) {
            throw HttpError::validation(['kind' => 'Geçersiz dosya türü.']);
        }
        return $all[$k];
    }

    /* ---------------------------------------------------------------- */

    /** PHP yükleme hata kodu → Türkçe */
    public static function uploadError($code)
    {
        $max = ini_get('upload_max_filesize');
        switch ((int)$code) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'Dosya sunucunun yükleme sınırını (' . $max . ') aşıyor. Daha küçük bir dosya seçin.';
            case UPLOAD_ERR_PARTIAL:
                return 'Dosya yarım yüklendi. Lütfen tekrar deneyin.';
            case UPLOAD_ERR_NO_FILE:
                return 'Dosya seçilmedi.';
            case UPLOAD_ERR_NO_TMP_DIR:
            case UPLOAD_ERR_CANT_WRITE:
            case UPLOAD_ERR_EXTENSION:
                return 'Sunucu dosyayı kaydedemedi. Lütfen daha sonra tekrar deneyin.';
        }
        return 'Dosya yüklenemedi.';
    }

    /**
     * İçerik denetimi (saf işlev; birim testleri doğrudan çağırır).
     * Dönüş: ['type' => image|video, 'mime', 'w', 'h', 'bytes'] — geçersizse HttpError 422 (Türkçe).
     */
    public static function inspect($path, $kind)
    {
        list(, $types, $maxMb) = self::kind($kind);
        $bad = function ($msg) {
            return HttpError::validation(['file' => $msg]);
        };
        $size = @filesize($path);
        if (!$size) {
            throw $bad('Dosya boş ya da okunamadı.');
        }
        if ($size > $maxMb * 1048576) {
            throw $bad('Dosya çok büyük (en fazla ' . $maxMb . ' MB).');
        }
        $fi = new \finfo(FILEINFO_MIME_TYPE);
        $mime = (string)$fi->file($path);
        $allowed = in_array('video', $types, true) ? 'JPG, PNG, GIF, WEBP görsel ya da MP4/WEBM video' : 'JPG, PNG, GIF veya WEBP görsel';
        if (in_array('video', $types, true) && isset(self::VIDEO_MIMES[$mime])) {
            return ['type' => 'video', 'mime' => $mime, 'w' => 0, 'h' => 0, 'bytes' => (int)$size];
        }
        if (!isset(self::IMAGE_MIMES[$mime])) {
            throw $bad('Bu dosya türü yüklenemez. Yalnız ' . $allowed . ' yükleyebilirsiniz.');
        }
        if (self::hasCode($path)) {
            throw $bad('Görsel dosyası geçersiz içerik barındırıyor.');
        }
        $info = @getimagesize($path);
        if (!$info || empty($info[0]) || empty($info[1]) || (int)$info[2] !== self::IMAGE_MIMES[$mime]) {
            throw $bad('Görsel bozuk ya da okunamıyor.');
        }
        $w = (int)$info[0];
        $h = (int)$info[1];
        if ($w > self::MAX_DIM || $h > self::MAX_DIM || $w * $h > self::MAX_PIXELS) {
            throw $bad('Görselin çözünürlüğü çok yüksek (en fazla ' . (int)(self::MAX_PIXELS / 1000000) . ' megapiksel).');
        }
        return ['type' => 'image', 'mime' => $mime, 'w' => $w, 'h' => $h, 'bytes' => (int)$size];
    }

    /** Görsele gizlenmiş PHP/HTML (polyglot) — yeniden kodlama bunu zaten siler; burada açıkça reddedilir. */
    private static function hasCode($path)
    {
        $fh = @fopen($path, 'rb');
        if (!$fh) {
            return true;
        }
        $prev = '';
        $found = false;
        while (!feof($fh)) {
            $chunk = $prev . fread($fh, 262144);
            if (stripos($chunk, '<?php') !== false || stripos($chunk, '<script') !== false || stripos($chunk, '<svg') !== false || stripos($chunk, '<html') !== false) {
                $found = true;
                break;
            }
            $prev = substr($chunk, -8);
        }
        fclose($fh);
        return $found;
    }

    /**
     * Görseli GD ile yeniden kodlar (EXIF yönü uygulanır, sonra tüm üst veri atılır). Dönüş: [bytes, mime, ext, w, h]
     */
    public static function reencode($path, array $meta, $maxSide = self::MAX_SIDE)
    {
        $need = (int)($meta['w'] * $meta['h'] * 5 + 64 * 1048576);
        $lim = self::bytesOf(ini_get('memory_limit'));
        if ($lim > 0 && $lim < $need) {
            @ini_set('memory_limit', (string)max($need, 256 * 1048576));
        }
        $data = file_get_contents($path);
        $src = @imagecreatefromstring($data);
        unset($data);
        if (!$src) {
            throw HttpError::validation(['file' => 'Görsel bozuk ya da okunamıyor.']);
        }
        if ($meta['mime'] === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($path);
            $o = is_array($exif) && isset($exif['Orientation']) ? (int)$exif['Orientation'] : 1;
            $rot = [3 => 180, 6 => -90, 8 => 90];
            if (isset($rot[$o])) {
                $r = imagerotate($src, $rot[$o], 0);
                if ($r) {
                    imagedestroy($src);
                    $src = $r;
                }
            }
        }
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, $maxSide / max($w, $h));
        $nw = max(1, (int)round($w * $scale));
        $nh = max(1, (int)round($h * $scale));
        $webp = function_exists('imagewebp');
        $dst = imagecreatetruecolor($nw, $nh);
        if ($webp) {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        } else {
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        }
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($src);
        ob_start();
        $ok = $webp ? imagewebp($dst, null, 82) : imagejpeg($dst, null, 85);
        $bytes = ob_get_clean();
        imagedestroy($dst);
        if (!$ok || $bytes === '' || $bytes === false) {
            throw new \RuntimeException('Görsel kodlanamadı.');
        }
        return [$bytes, $webp ? 'image/webp' : 'image/jpeg', $webp ? 'webp' : 'jpg', $nw, $nh];
    }

    private static function bytesOf($v)
    {
        $v = trim((string)$v);
        if ($v === '' || $v === '-1') {
            return -1;
        }
        $n = (int)$v;
        $u = strtolower(substr($v, -1));
        return $u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n));
    }

    /* ---------------------------------------------------------------- */

    /** Site kökü (web yolu), ör. '/' ya da '/test/' — public URL'ler için */
    public static function webBase()
    {
        $sn = isset($_SERVER['SCRIPT_NAME']) ? str_replace('\\', '/', (string)$_SERVER['SCRIPT_NAME']) : '';
        if ($sn !== '' && PHP_SAPI !== 'cli') {
            foreach (['/api/v1/index.php', '/kurulum/index.php', '/index.php'] as $suf) {
                if (substr($sn, -strlen($suf)) === $suf) {
                    return rtrim(substr($sn, 0, -strlen($suf)), '/') . '/';
                }
            }
            return rtrim(dirname($sn), '/') . '/';
        }
        try {
            $site = Settings::get('site');
            $p = !empty($site['siteUrl']) ? (string)parse_url($site['siteUrl'], PHP_URL_PATH) : '';
            return rtrim($p, '/') . '/';
        } catch (\Throwable $e) {
            return '/';
        }
    }

    /** Herkese açık dosyaların kökü (site kökü; birim testleri YP_PUBLIC ile geçici klasöre yönlendirir) */
    public static function publicRoot()
    {
        return defined('YP_PUBLIC') ? YP_PUBLIC : YP_ROOT;
    }

    public static function absPath(array $m)
    {
        return ($m['vis'] === 'public' ? self::publicRoot() : YP_STORAGE) . '/' . $m['path'];
    }

    /** Ön yüzün kullanacağı adres (public: /uploads/…; private: api üzerinden, yetki denetimli) */
    public static function url(array $m)
    {
        $b = self::webBase();
        if ($m['vis'] === 'public') {
            return $b . $m['path'];
        }
        return $b . 'api/v1/index.php?r=media/' . Ids::m($m['id']);
    }

    public static function present(array $m)
    {
        return ['id' => Ids::m($m['id']), 'url' => self::url($m), 'kind' => $m['kind'], 'vis' => $m['vis'], 'mime' => $m['mime'],
            'w' => (int)$m['w'], 'h' => (int)$m['h'], 'bytes' => (int)$m['bytes'], 't' => (int)$m['created_at']];
    }

    private static function mkdirPublic($dir)
    {
        if (is_dir($dir)) {
            return;
        }
        if (!@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Yükleme klasörü oluşturulamadı: ' . basename($dir));
        }
        @chmod($dir, 0755);
        @file_put_contents($dir . '/index.php', "<?php\n// boş\n");
    }

    /**
     * Doğrulanmış dosyayı kaydeder ve media satırı oluşturur.
     * $tmp: sunucudaki geçici dosya (is_uploaded_file denetimini çağıran yapar), $user: yükleyen (null: sistem)
     */
    public static function store(Db $db, $user, $tmp, $kind, $origName = '')
    {
        list($vis, , , $side) = self::kind($kind);
        $meta = self::inspect($tmp, $kind);
        if ($meta['type'] === 'image') {
            list($bytes, $mime, $ext, $w, $h) = self::reencode($tmp, $meta, $side);
        } else {
            $bytes = null;
            $mime = $meta['mime'];
            $ext = self::VIDEO_MIMES[$mime];
            $w = $h = 0;
        }
        $now = yp_now_ms();
        $ym = gmdate('Y/m', (int)floor($now / 1000) + 3 * 3600);
        $rel = ($vis === 'public' ? 'uploads/' : 'media/') . $ym . '/' . bin2hex(random_bytes(16)) . '.' . $ext;
        $abs = ($vis === 'public' ? self::publicRoot() : YP_STORAGE) . '/' . $rel;
        $dir = dirname($abs);
        if ($vis === 'public') {
            self::mkdirPublic($dir);
        } else {
            yp_ensure_dir($dir);
        }
        $part = $abs . '.part';
        $ok = $bytes !== null ? @file_put_contents($part, $bytes) !== false : @copy($tmp, $part);
        if (!$ok || !@rename($part, $abs)) {
            @unlink($part);
            throw new \RuntimeException('Dosya diske yazılamadı.');
        }
        @chmod($abs, $vis === 'public' ? 0644 : 0600);
        $size = (int)filesize($abs);
        $id = $db->insert('media', [
            'owner_id' => $user ? (int)$user['id'] : null, 'kind' => $kind, 'vis' => $vis, 'path' => $rel,
            'mime' => $mime, 'bytes' => $size, 'w' => $w, 'h' => $h, 'sha256' => hash_file('sha256', $abs),
            'orig_name' => yp_str(basename((string)$origName), 120), 'ref_type' => '', 'ref_id' => null, 'created_at' => $now,
        ]);
        return $db->one('SELECT * FROM {media} WHERE id=?', [$id]);
    }

    /** Özel dosyayı görebilir mi? (sahibi, yönetici ya da ilgili yetkili çalışan; P2'de sipariş tarafları eklenir) */
    public static function canView($user, array $m)
    {
        if ($m['vis'] === 'public') {
            return true;
        }
        if (!$user) {
            return false;
        }
        if ($m['owner_id'] !== null && (int)$m['owner_id'] === (int)$user['id']) {
            return true;
        }
        // P2: itiraz kanıtını siparişin iki tarafı da görür (teslim kanıtlarını alıcı GÖRMEZ: yalnız satıcı ve [siparis])
        if ($m['kind'] === 'dispute' && $m['ref_type'] === 'order' && $m['ref_id'] !== null) {
            $o = Db::main()->one('SELECT buyer_id, seller_id FROM {orders} WHERE id=?', [(int)$m['ref_id']]);
            if ($o && in_array((int)$user['id'], [(int)$o['buyer_id'], (int)$o['seller_id']], true)) {
                return true;
            }
        }
        $need = ['proof' => ['siparis'], 'dispute' => ['siparis'], 'support' => ['destek'], 'receipt' => ['odeme']];
        return Perm::has($user, isset($need[$m['kind']]) ? $need[$m['kind']] : ['siparis', 'destek', 'odeme']);
    }

    /** Dosyayı ve satırı siler (sahipsiz/eski kayıtlar) */
    public static function delete(Db $db, array $m)
    {
        @unlink(self::absPath($m));
        $db->exec('DELETE FROM {media} WHERE id=?', [(int)$m['id']]);
    }

    /** Cron: 24 saattir hiçbir yere bağlanmamış yüklemeleri siler (yükle-önce akışında vazgeçilenler) */
    public static function cleanupOrphans(Db $db, $olderMs = 86400000, $limit = 200)
    {
        $rows = $db->all("SELECT m.* FROM {media} m WHERE m.ref_type='' AND m.created_at<? AND NOT EXISTS (SELECT 1 FROM {listing_media} lm WHERE lm.media_id=m.id)
            AND NOT EXISTS (SELECT 1 FROM {covers} c WHERE c.media_id=m.id) AND NOT EXISTS (SELECT 1 FROM {servers} s WHERE s.logo_media_id=m.id) ORDER BY m.id LIMIT " . (int)$limit,
            [yp_now_ms() - $olderMs]);
        foreach ($rows as $m) {
            self::delete($db, $m);
        }
        return count($rows);
    }
}
