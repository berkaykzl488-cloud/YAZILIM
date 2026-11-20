<?php
namespace YP\Exchange;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Notify;

/**
 * Borsa cron görevleri (YP\Cron::tasks içine eklenir):
 *   ex_wipe (saatlik) — gizli hesap bilgilerinin güvenlik ağı (sahip kararı §9.4):
 *     1. kapanmış siparişlerin (tamam/iptal) gizli alanları
 *     2. aktif olmayan ve teslim bekleyen eşlemesi kalmamış satış emirlerinin gizli alanları
 *     3. kaydedilişinden 7 günü geçen HER gizli değer; aktif satış emri bu yüzden bilgisiz kalırsa emir iptal edilir ve
 *        satıcıya haber verilir (eşlenmiş ama teslim edilmemiş adet siparişte kalır, operatör eşlemeyi silebilir)
 */
final class Jobs
{
    public static function tasks()
    {
        return [
            'ex_wipe' => [3600000, function (Db $db, $deadline) {
                return $db->tx(function (Db $db) {
                    return self::wipe($db);
                });
            }],
        ];
    }

    public static function wipe(Db $db, $now = null)
    {
        $now = $now ?: yp_now_ms();
        $old = $now - Exchange::WIPE_DAYS * 86400000;
        $r = ['orders' => 0, 'offers' => 0, 'old' => 0, 'cancelled' => 0];
        foreach ($db->all("SELECT DISTINCT f.order_id FROM {ex_order_fields} f JOIN {ex_orders} o ON o.id=f.order_id WHERE f.value_enc IS NOT NULL AND o.status IN ('tamam','iptal')") as $x) {
            $r['orders'] += Exchange::wipeOrder($db, $x['order_id']);
        }
        foreach ($db->all("SELECT DISTINCT f.offer_id FROM {ex_offer_fields} f JOIN {ex_offers} o ON o.id=f.offer_id WHERE f.value_enc IS NOT NULL AND o.status<>'aktif'") as $x) {
            $r['offers'] += Exchange::wipeOfferIfDone($db, $x['offer_id']);
        }
        foreach ($db->all('SELECT DISTINCT order_id FROM {ex_order_fields} WHERE value_enc IS NOT NULL AND set_at<?', [$old]) as $x) {
            $n = $db->exec('UPDATE {ex_order_fields} SET value_enc=NULL WHERE order_id=? AND value_enc IS NOT NULL AND set_at<?', [(int)$x['order_id'], $old]);
            if ($n) {
                $r['old'] += $n;
                Exchange::event($db, $x['order_id'], null, 'Gizli bilgiler 7 günlük güvenlik süresi dolduğu için sistemden silindi.');
            }
        }
        foreach ($db->all('SELECT DISTINCT offer_id FROM {ex_offer_fields} WHERE value_enc IS NOT NULL AND set_at<?', [$old]) as $x) {
            $n = $db->exec('UPDATE {ex_offer_fields} SET value_enc=NULL WHERE offer_id=? AND value_enc IS NOT NULL AND set_at<?', [(int)$x['offer_id'], $old]);
            $r['old'] += $n;
            $of = $db->one('SELECT * FROM {ex_offers} WHERE id=?' . $db->forUpdate(), [(int)$x['offer_id']]);
            if ($of && $of['status'] === 'aktif') {
                $db->update('ex_offers', ['status' => 'iptal', 'updated_at' => $now, 'closed_at' => $now, 'wiped_at' => $now], 'id=?', [(int)$of['id']]);
                $r['cancelled']++;
                Notify::send($db, $of['user_id'], 'Satış emriniz #' . Exchange::ofid($of['id']) . ' 7 gün içinde eşlenmediği için güvenlik gereği hesap bilgileriniz silindi ve emir kapatıldı. Dilerseniz borsada yeni emir verebilirsiniz.',
                    '#borsa', 'borsa', ['no' => Exchange::ofid($of['id']), 'durum' => 'Kapatıldı']);
            } else {
                $db->exec('UPDATE {ex_offers} SET wiped_at=? WHERE id=? AND wiped_at IS NULL', [$now, (int)$x['offer_id']]);
            }
        }
        if (array_sum($r)) {
            Audit::log($db, null, 'ex_secret_wipe', 'system', 'ex', $r);
        }
        return $r;
    }
}
