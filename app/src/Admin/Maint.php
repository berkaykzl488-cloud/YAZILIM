<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Perm;
use YP\Settings;

/**
 * Bakım modu (settings.maint = {on, msg, until}). Sunucuda zorunlu:
 *   - açıkken (ve "tahmini bitiş" geçmediyse) üyelerin ve ziyaretçilerin GET dışındaki tüm API istekleri 503 + Türkçe mesaj;
 *   - yönetici ve çalışanlar etkilenmez (panel bypass); giriş / 2 adımlı doğrulama / çıkış her zaman açık (çalışan girebilsin);
 *   - boot.set.maint ziyaretçiye bakım sayfasını gösterir; index.php sayfa isteklerine 503 + Retry-After döner (arama motorları
 *     sayfayı "geçici kapalı" bilir, dizinden düşürmez).
 * YP\Http\Kernel her istekte guard() çağırır.
 */
final class Maint
{
    const MSG = 'Sitemiz kısa bir bakımda. Lütfen biraz sonra tekrar deneyin.';
    /** Bakımda da açık uçlar: giriş ve hesap kurtarma (P6: şifremi unuttum / sıfırla) */
    const OPEN = ['auth/login', 'auth/logout', 'auth/tfa/verify', 'auth/tfa/resend', 'auth/tfa/switch', 'auth/forgot', 'auth/reset'];

    public static function get(Db $db)
    {
        $m = Settings::get('maint', $db);
        $m = is_array($m) ? $m : [];
        return ['on' => !empty($m['on']), 'msg' => isset($m['msg']) && is_string($m['msg']) && $m['msg'] !== '' ? $m['msg'] : self::MSG,
            'until' => isset($m['until']) && is_numeric($m['until']) && (int)$m['until'] > 0 ? (int)$m['until'] : null,
            't' => isset($m['t']) ? (int)$m['t'] : 0, 'by' => isset($m['by']) ? $m['by'] : null];
    }

    /** Şu an bakımda mı? (tahmini bitiş geçtiyse site kendiliğinden açılır) */
    public static function active(Db $db)
    {
        $m = self::get($db);
        return $m['on'] && (!$m['until'] || $m['until'] > yp_now_ms());
    }

    public static function set(Db $db, $on, $msg = null, $until = null, $byId = null)
    {
        $cur = self::get($db);
        $new = ['on' => (bool)$on, 'msg' => $msg !== null ? (string)$msg : $cur['msg'], 'until' => $until ? (int)$until : null,
            't' => yp_now_ms(), 'by' => $byId];
        Settings::set('maint', $new, $byId, $db);
        return self::get($db);
    }

    /** Ön yüze giden (herkese açık) bakım bilgisi: S.set.maint */
    public static function publicView(Db $db)
    {
        $m = self::get($db);
        return ['on' => self::active($db), 'msg' => $m['msg'], 'until' => $m['until']];
    }

    /** Kernel: oturum okunduktan sonra, işleyiciden önce */
    public static function guard(Req $req, Db $db)
    {
        if (in_array($req->method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        if (in_array($req->path, self::OPEN, true) || Perm::isStaff(Auth::$user)) {
            return;
        }
        try {
            if (!self::active($db)) {
                return;
            }
        } catch (\Throwable $e) {
            return; // ayar tablosu yoksa (eski şema) bakım yok sayılır
        }
        $m = self::get($db);
        throw new HttpError(503, $m['msg'], 'maint', ['until' => $m['until']], ['Retry-After' => '600']);
    }
}
