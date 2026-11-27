<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Http\HttpError;
use YP\Media;
use YP\Settings;

/**
 * Site ayarları (settings.site), şirket bilgisi (settings.company) ve ETBİS (settings.etbis) — sunucu tarafı doğrulama.
 * ETBİS tek kaynaktır: Yönetim › Site ayarları › ETBİS ve Entegrasyonlar sayfası aynı settings.etbis kaydını kullanır.
 */
final class Site
{
    const ETBIS_HOSTS = ['etbis.ticaret.gov.tr', 'etbis.eticaret.gov.tr'];

    /** PUT admin/settings/site gövdesi → doğrulanmış yama (yalnız gönderilen alanlar). Bilinmeyen alan 422. */
    public static function sitePatch(array $in)
    {
        $f = [];
        $out = [];
        $num = function ($k, $min, $max, $dec) use ($in, &$f) {
            $v = $in[$k];
            if (is_string($v)) {
                $v = str_replace(',', '.', trim($v));
            }
            if (!is_numeric($v)) {
                $f[$k] = 'Sayı olmalı.';
                return null;
            }
            $v = $dec ? round((float)$v, $dec) : (float)$v;
            if (!$dec && (float)(int)$v !== (float)$v) {
                $f[$k] = 'Tam sayı olmalı.';
                return null;
            }
            if ($v < $min || $v > $max) {
                $f[$k] = $min . ' ile ' . $max . ' arasında olmalı.';
                return null;
            }
            return $dec ? $v : (int)$v;
        };
        $str = function ($k, $min, $max, $msg) use ($in, &$f) {
            $v = $in[$k];
            if (!is_scalar($v)) {
                $f[$k] = 'Geçersiz değer.';
                return null;
            }
            $s = yp_str((string)$v, $max + 1);
            if (yp_strlen($s) < $min || yp_strlen($s) > $max) {
                $f[$k] = $msg;
                return null;
            }
            if (preg_match('/[<>]/', $s)) {
                $f[$k] = '< ve > karakterleri kullanılamaz.';
                return null;
            }
            return $s;
        };
        foreach ($in as $k => $v) {
            switch ($k) {
                case 'siteName':
                    $out[$k] = $str($k, 2, 60, 'Site adı 2–60 karakter olmalı.');
                    break;
                case 'slogan':
                    $out[$k] = $str($k, 0, 80, 'Slogan en fazla 80 karakter olabilir.');
                    break;
                case 'supportHours':
                    $out[$k] = $str($k, 0, 40, 'Destek saatleri en fazla 40 karakter olabilir.');
                    break;
                case 'siteUrl':
                    $s = is_string($v) ? rtrim(trim($v), '/') : null;
                    if ($s === null || ($s !== '' && (!yp_valid_url($s) || strlen($s) > 200 || parse_url($s, PHP_URL_QUERY) !== null || parse_url($s, PHP_URL_FRAGMENT) !== null))) {
                        $f[$k] = 'Site adresini https://www.alanadiniz.com biçiminde yazın.';
                    } else {
                        $out[$k] = $s;
                    }
                    break;
                case 'whatsapp':
                    $s = is_scalar($v) ? trim((string)$v) : null;
                    $d = $s === null ? '' : preg_replace('/\D/', '', $s);
                    if ($s === null || ($s !== '' && (!preg_match('/^\+?[0-9 ()\-]{10,22}$/', $s) || strlen($d) < 10 || strlen($d) > 15))) {
                        $f[$k] = 'WhatsApp numarasını 05xx xxx xx xx ya da +90 5xx xxx xx xx biçiminde yazın.';
                    } else {
                        $out[$k] = $s;
                    }
                    break;
                case 'commission':
                    $out[$k] = $num($k, 0, 50, 1);
                    break;
                case 'autoConfirm':
                    $out[$k] = $num($k, 1, 72, 0);
                    break;
                case 'minWithdraw':
                    $out[$k] = $num($k, 0, 100000, 2);
                    break;
                case 'popupDelay':
                    $out[$k] = $num($k, 0, 60, 1);
                    break;
                case 'ptRate':
                    $out[$k] = $num($k, 1, 100000, 0);
                    break;
                case 'popupOn':
                case 'tfaOn':
                case 'moderation':
                    if (!is_bool($v) && !in_array($v, [0, 1, '0', '1'], true)) {
                        $f[$k] = 'Açık / kapalı olmalı.';
                    } else {
                        $out[$k] = (bool)$v;
                    }
                    break;
                default:
                    $f[is_string($k) ? $k : '_'] = 'Bu ayar bu formdan değiştirilemez.';
            }
        }
        if (!$out && !$f) {
            $f['_'] = 'Değiştirilecek ayar gönderilmedi.';
        }
        if ($f) {
            throw HttpError::validation($f);
        }
        return $out;
    }

    /** PUT admin/settings/company */
    public static function companyPatch(array $in)
    {
        $f = [];
        $out = [];
        foreach ($in as $k => $v) {
            if ($k === 'type') {
                if (!in_array($v, ['sirket', 'sahis'], true)) {
                    $f[$k] = 'Şirket türü: sirket ya da sahis.';
                } else {
                    $out[$k] = $v;
                }
                continue;
            }
            if (!isset(Content::COMPANY[$k])) {
                $f[is_string($k) ? $k : '_'] = 'Bilinmeyen alan.';
                continue;
            }
            if (!is_scalar($v) && $v !== null) {
                $f[$k] = 'Geçersiz değer.';
                continue;
            }
            $max = Content::COMPANY[$k][1];
            $s = yp_str((string)$v, $max + 1);
            if (yp_strlen($s) > $max) {
                $f[$k] = Content::COMPANY[$k][0] . ' en fazla ' . $max . ' karakter olabilir.';
                continue;
            }
            if (preg_match('/[<>\[\]]/', $s)) {
                $f[$k] = '< > [ ] karakterleri kullanılamaz.';
                continue;
            }
            if ($s !== '') {
                if ($k === 'vkn' && !preg_match('/^[0-9]{10,11}$/', $s)) {
                    $f[$k] = 'VKN 10, TCKN 11 haneli olmalı.';
                    continue;
                }
                if ($k === 'mersis' && !preg_match('/^[0-9]{16}$/', $s)) {
                    $f[$k] = 'MERSİS numarası 16 haneli olmalı.';
                    continue;
                }
                if (in_array($k, ['email', 'kep'], true) && !filter_var($s, FILTER_VALIDATE_EMAIL)) {
                    $f[$k] = 'Geçerli bir e-posta adresi yazın.';
                    continue;
                }
                if ($k === 'tel' && !preg_match('/^\+?[0-9 ()\-]{7,22}$/', $s)) {
                    $f[$k] = 'Telefonu rakamlarla yazın (ör. 0850 xxx xx xx).';
                    continue;
                }
            }
            $out[$k] = $s;
        }
        if ($f) {
            throw HttpError::validation($f);
        }
        return $out;
    }

    /* ================= ETBİS ================= */

    public static function etbisUrlOk($u)
    {
        if (!is_string($u) || !yp_valid_url($u)) {
            return false;
        }
        $p = parse_url($u);
        if (strtolower((string)$p['scheme']) !== 'https') {
            return false;
        }
        $h = strtolower((string)$p['host']);
        foreach (self::ETBIS_HOSTS as $x) {
            if ($h === $x || substr($h, -strlen('.' . $x)) === '.' . $x) {
                return true;
            }
        }
        return false;
    }

    public static function etbis(Db $db)
    {
        $E = Settings::get('etbis', $db);
        $E = is_array($E) ? $E : [];
        return array_replace(['on' => false, 'url' => '', 'code' => '', 'date' => '', 'img' => '', 'imgId' => null], $E);
    }

    /** PUT admin/settings/etbis → yeni kayıt (img hariç; görsel ayrı uçla ya da imgData ile) */
    public static function etbisPatch(Db $db, array $in)
    {
        $E = self::etbis($db);
        $f = [];
        if (array_key_exists('url', $in)) {
            $u = is_string($in['url']) ? trim($in['url']) : '';
            if ($u !== '' && !self::etbisUrlOk($u)) {
                $f['url'] = 'Doğrulama bağlantısı https://etbis.ticaret.gov.tr (veya etbis.eticaret.gov.tr) ile başlamalı.';
            } else {
                $E['url'] = $u;
            }
        }
        if (array_key_exists('code', $in)) {
            $c = is_scalar($in['code']) ? yp_str((string)$in['code'], 81) : '';
            if (yp_strlen($c) > 80 || !preg_match('/^[A-Za-z0-9 ._\/\-]*$/', $c)) {
                $f['code'] = 'Kayıt numarası en fazla 80 karakter; harf, rakam, nokta, tire ve / içerebilir.';
            } else {
                $E['code'] = $c;
            }
        }
        if (array_key_exists('date', $in)) {
            $d = is_string($in['date']) ? trim($in['date']) : '';
            if ($d !== '' && (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1]))) {
                $f['date'] = 'Tarih YYYY-AA-GG biçiminde olmalı.';
            } else {
                $E['date'] = $d;
            }
        }
        if (array_key_exists('on', $in)) {
            $E['on'] = yp_bool($in['on']);
        }
        foreach (array_keys($in) as $k) {
            if (!in_array($k, ['url', 'code', 'date', 'on', 'imgData'], true)) {
                $f[is_string($k) ? $k : '_'] = 'Bilinmeyen alan.';
            }
        }
        if (!$f && $E['on'] && $E['url'] === '') {
            $f['url'] = 'Rozeti göstermek için ETBİS doğrulama bağlantısını girin.';
        }
        if ($f) {
            throw HttpError::validation($f);
        }
        return $E;
    }

    /** data:image/…;base64 (ETBİS'in verdiği kodu yapıştırınca) → geçici dosya yolu */
    public static function dataUrlFile($data)
    {
        if (!is_string($data) || strlen($data) > 900000 || !preg_match('#^data:image/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+)$#', $data, $m)) {
            throw HttpError::validation(['imgData' => 'Karekod görseli PNG, JPG, GIF ya da WEBP olmalı (en fazla 600 KB).']);
        }
        $bin = base64_decode(preg_replace('/\s+/', '', $m[2]), true);
        if ($bin === false || strlen($bin) > 600 * 1024 || strlen($bin) < 20) {
            throw HttpError::validation(['imgData' => 'Karekod görseli okunamadı (en fazla 600 KB).']);
        }
        $tmp = tempnam(sys_get_temp_dir(), 'ypetb');
        file_put_contents($tmp, $bin);
        return $tmp;
    }

    /** Karekod görselini kaydeder (eskisini siler). Dönüş: güncel ETBİS kaydı */
    public static function etbisSetImage(Db $db, array $user, $tmp, $name = 'etbis.png')
    {
        $m = Media::store($db, $user, $tmp, 'etbis', $name);
        $db->update('media', ['ref_type' => 'etbis', 'ref_id' => 0], 'id=?', [(int)$m['id']]);
        $E = self::etbis($db);
        self::etbisDropImage($db, $E);
        $E['img'] = Media::url($m);
        $E['imgId'] = 'm' . (int)$m['id'];
        return $E;
    }

    public static function etbisDropImage(Db $db, array $E)
    {
        if (!empty($E['imgId']) && preg_match('/^m?([0-9]+)$/', (string)$E['imgId'], $x)) {
            $old = $db->one("SELECT * FROM {media} WHERE id=? AND kind='etbis'", [(int)$x[1]]);
            if ($old) {
                Media::delete($db, $old);
            }
        }
    }
}
