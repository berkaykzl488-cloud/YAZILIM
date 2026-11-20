<?php
namespace YP\Growth;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Money\Rules;
use YP\Settings;

/**
 * VIP seviyeleri (vipset; vip-add / vip-del ön yüzde düzenlenir, kaydet ile gönderilir). Seviye = işlem hacmi (TL) eşiği.
 * Komisyon indirimi siparişte sunucuda uygulanır: Orders::buy → Rules::rateBp(commission, satıcı hacmi, seviyeler) ve oran
 * siparişte dondurulur (P2). Puan oranı (cb) satış onayında alıcıya.
 */
final class Vip
{
    /** {levels:[{id,n,min,disc,cb,c}, …]} → sıralı, ilk seviye min=0 */
    public static function set(Db $db, array $staff, $in)
    {
        $L = is_array($in) && isset($in['levels']) ? $in['levels'] : $in;
        if (!is_array($L) || count($L) < 1 || count($L) > 12) {
            throw HttpError::validation(['levels' => '1–12 VIP seviyesi olmalı.']);
        }
        $com = (float)Rules::site($db)['commission'];
        $out = [];
        $ids = [];
        foreach (array_values($L) as $i => $v) {
            if (!is_array($v)) {
                throw HttpError::validation(['levels' => 'Seviye ' . ($i + 1) . ' geçersiz.']);
            }
            $n = isset($v['n']) && is_string($v['n']) ? trim($v['n']) : '';
            if ($n === '' || mb_strlen($n, 'UTF-8') > 24) {
                throw HttpError::validation(['levels' => 'Seviye ' . ($i + 1) . ': ad 1–24 karakter olmalı.']);
            }
            $id = isset($v['id']) && is_string($v['id']) && preg_match('/^[a-z0-9_]{1,20}$/', $v['id']) ? $v['id'] : substr(preg_replace('/[^a-z0-9]/', '', \YP\Text::fold($n)) ?: 'v', 0, 14) . ($i + 1);
            if (isset($ids[$id])) {
                $id .= '_' . ($i + 1);
            }
            $ids[$id] = 1;
            $num = function ($k, $max) use ($v, $i) {
                $x = isset($v[$k]) ? yp_money($v[$k]) : 0.0;
                if ($x === null || $x < 0 || $x > $max) {
                    throw HttpError::validation(['levels' => 'Seviye ' . ($i + 1) . ': değerleri kontrol edin.']);
                }
                return round((float)$x, 2);
            };
            $disc = $num('disc', 100);
            if ($disc > $com) {
                throw HttpError::validation(['levels' => 'Seviye ' . ($i + 1) . ': komisyon indirimi komisyon oranını (%' . $com . ') aşamaz.']);
            }
            $c = isset($v['c']) && is_string($v['c']) && preg_match('/^#[0-9a-fA-F]{6}$/', $v['c']) ? strtolower($v['c']) : '#5b3fa8';
            $out[] = ['id' => $id, 'n' => yp_str($n, 24), 'min' => $num('min', 1000000000), 'disc' => $disc, 'cb' => $num('cb', 20), 'c' => $c];
        }
        usort($out, function ($a, $b) {
            return $a['min'] <=> $b['min'];
        });
        $out[0]['min'] = 0;
        Settings::set('vip', $out, $staff['id'], $db);
        Audit::log($db, $staff['id'], 'vip_set', 'settings', 'vip', ['levels' => $out]);
        return $out;
    }
}
