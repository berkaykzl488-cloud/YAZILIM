<?php
namespace YP\Growth;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;

/**
 * Para çekirdeğinden (P2/P4) çağrılan büyüme kancaları. Rota dosyaları yüklenmeden de (cron: otomatik onay) çalışır.
 *   orderCompleted: tamamlanan pazar siparişi → çekiliş bileti (raffleSpend) ve davet ödülü kötüye kullanım işareti.
 *   spent: EP mağazası / borsa gibi diğer harcamalar (P4 çağırır): Events::spent($db, $uid, $kurus, 'epstore'|'borsa').
 */
final class Events
{
    private static $ready = [];

    private static function ready(Db $db)
    {
        $k = spl_object_id($db);
        if (!isset(self::$ready[$k])) {
            self::$ready[$k] = $db->tableExists('raffles') && $db->tableExists('ref_flags');
        }
        return self::$ready[$k];
    }

    /** $buyerBefore: Orders::complete başında okunan alıcı satırı (refCheck öncesi ref_paid) */
    public static function orderCompleted(Db $db, array $o, array $buyerBefore)
    {
        if (!self::ready($db)) {
            return;
        }
        Raffles::spend($db, (int)$o['buyer_id'], (int)$o['total'], isset($o['cat']) ? $o['cat'] : '');
        if ($buyerBefore['ref_by'] && !(int)$buyerBefore['ref_paid'] && (int)$db->val('SELECT ref_paid FROM {users} WHERE id=?', [(int)$buyerBefore['id']])) {
            Referral::afterPaid($db, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$buyerBefore['id']]));
        }
    }

    public static function spent(Db $db, $userId, $amount, $cat)
    {
        if (self::ready($db)) {
            Raffles::spend($db, $userId, $amount, $cat);
        }
    }
}
