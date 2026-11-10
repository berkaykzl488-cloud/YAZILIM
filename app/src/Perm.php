<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Yetkiler. Anahtarlar PermMap::PERMS (ön yüzdeki PERMS ile aynı). Yönetici (admin) her yetkiye sahiptir.
 * Rota yetkisi: 'uye' | ['uye','ara'] (herhangi biri) | 'ui:act:u-ban' | 'ui:form:staffadd' | 'ui:chg:mod' (PermMap'ten)
 */
final class Perm
{
    public static function keys()
    {
        return array_keys(PermMap::PERMS);
    }

    public static function isStaff($u)
    {
        return is_array($u) && in_array($u['role'], ['staff', 'admin'], true);
    }

    public static function isAdmin($u)
    {
        return is_array($u) && $u['role'] === 'admin';
    }

    /** Kullanıcının yetki listesi (admin: hepsi) */
    public static function of($u)
    {
        if (!is_array($u)) {
            return [];
        }
        if ($u['role'] === 'admin') {
            return self::keys();
        }
        if ($u['role'] !== 'staff') {
            return [];
        }
        $p = isset($u['perms']) ? $u['perms'] : null;
        $list = is_array($p) ? $p : (json_decode((string)$p, true) ?: []);
        return self::normalize($list);
    }

    public static function normalize($list)
    {
        if (!is_array($list)) {
            return [];
        }
        $keys = self::keys();
        $set = array_flip(array_filter($list, 'is_string'));
        return array_values(array_filter($keys, function ($k) use ($set) {
            return isset($set[$k]);
        }));
    }

    /** UI eylem anahtarını yetkiye çevirir */
    public static function resolve($spec)
    {
        if (is_string($spec) && strncmp($spec, 'ui:', 3) === 0) {
            $parts = explode(':', $spec, 3);
            $tbl = ['act' => PermMap::ACT, 'form' => PermMap::FORM, 'chg' => PermMap::CHG];
            if (count($parts) !== 3 || !isset($tbl[$parts[1]][$parts[2]])) {
                throw new \RuntimeException('Yetki tablosunda yok: ' . $spec);
            }
            return $tbl[$parts[1]][$parts[2]];
        }
        return $spec;
    }

    public static function has($u, $spec)
    {
        if (!self::isStaff($u)) {
            return false;
        }
        if ($u['role'] === 'admin') {
            return true;
        }
        if ($spec === null || $spec === 'staff') {
            return true;
        }
        $need = (array)self::resolve($spec);
        $mine = self::of($u);
        foreach ($need as $p) {
            if (in_array($p, $mine, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Yetki verme kuralı: yönetici her şeyi verir. Çalışan YALNIZ kendi sahip olduğu yetkileri verebilir/kaldırabilir;
     * sahip olmadığı yetkiler hedefte nasılsa öyle kalır. Sahip olmadığı bir yetkiyi eklemeye çalışırsa 403.
     */
    public static function grant($actor, array $current, $requested)
    {
        if (!is_array($requested)) {
            throw HttpError::validation(['perms' => 'Yetki listesi geçersiz.']);
        }
        foreach ($requested as $k) {
            if (!is_string($k) || !isset(PermMap::PERMS[$k])) {
                throw HttpError::validation(['perms' => 'Bilinmeyen yetki: ' . (is_scalar($k) ? (string)$k : '?')]);
            }
        }
        $req = self::normalize($requested);
        $cur = self::normalize($current);
        if (self::isAdmin($actor)) {
            return $req;
        }
        $mine = self::of($actor);
        $bad = array_values(array_diff($req, $mine, $cur));
        if ($bad) {
            throw new HttpError(403, 'Sahip olmadığınız yetkiyi veremezsiniz: ' . implode(', ', array_map(function ($k) {
                return PermMap::PERMS[$k];
            }, $bad)) . '.', 'perm_grant', ['perms' => $bad]);
        }
        $out = [];
        foreach (self::keys() as $k) {
            $has = in_array($k, $mine, true) ? in_array($k, $req, true) : in_array($k, $cur, true);
            if ($has) {
                $out[] = $k;
            }
        }
        return $out;
    }
}
