<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Catalog;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Media;
use YP\Present;

/** Para rotalarının ortak yanıt yardımcıları (patch sözleşmesi: upsert/replace/me — PLAN §2.2) */
final class Api
{
    public static function meRow(Db $db)
    {
        return $db->one('SELECT * FROM {users} WHERE id=?', [(int)Auth::$user['id']]);
    }

    public static function me(Db $db)
    {
        return Present::me($db, self::meRow($db));
    }

    public static function listing(Db $db, $id)
    {
        $l = $db->one('SELECT * FROM {listings} WHERE id=?', [(int)$id]);
        if (!$l) {
            return null;
        }
        $m = Catalog::mediaFor($db, [(int)$id]);
        return Catalog::presentListing($l, isset($m[(int)$id]) ? $m[(int)$id] : []);
    }

    /** Sipariş yanıtı: data.order + patch (orders, listings, me) */
    public static function orderBody(Db $db, $orderId, $msg = null, array $extra = [])
    {
        $o = Orders::row($db, $orderId);
        $viewer = self::meRow($db);
        $po = View::order($db, $o, $viewer);
        $patch = ['upsert' => ['orders' => [$po]], 'me' => Present::me($db, $viewer)];
        $l = self::listing($db, $o['listing_id']);
        if ($l) {
            $patch['upsert']['listings'] = [$l];
        }
        $out = ['data' => ['order' => $po, 'users' => View::orderUsers($db, [$o], $viewer)] + $extra, 'patch' => $patch];
        if ($msg !== null && $msg !== '') {
            $out['msg'] = $msg;
        }
        return $out;
    }

    public static function limit(Req $q, $def = 30, $max = 100)
    {
        return max(1, min($max, (int)$q->q('limit', (string)$def)));
    }

    public static function after(Req $q)
    {
        $a = $q->q('after');
        return preg_match('/^[0-9]{1,18}$/', $a) ? (int)$a : 0;
    }

    /** Sitenin kök adresi (PayTR dönüş adresleri) */
    public static function siteBase(Db $db)
    {
        $site = \YP\Settings::get('site', $db);
        if (!empty($site['siteUrl']) && preg_match('#^https?://#i', $site['siteUrl'])) {
            return rtrim($site['siteUrl'], '/') . '/';
        }
        return yp_request_origin() . Media::webBase();
    }

    public static function body(Req $q)
    {
        $b = $q->body();
        return is_array($b) ? $b : [];
    }

    public static function bool($v)
    {
        if (is_bool($v)) {
            return $v;
        }
        return in_array(strtolower(trim((string)$v)), ['1', 'true', 'evet', 'on', 'yes', 'w', '+'], true);
    }

    public static function notMine()
    {
        return HttpError::forbidden('Bu kayıt size ait değil.');
    }
}
