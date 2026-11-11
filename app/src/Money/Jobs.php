<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Log;
use YP\Notify;

/**
 * Para cron görevleri (PLAN §1.6). YP\Cron::tasks() bunları ekler.
 *   autoconfirm     her tik: 1 saat kala uyarı + süresi dolan teslimleri onaylar (render() artık onaylamaz)
 *   deposit_expiry  her tik: 3 günden eski bekleyen PayTR yüklemeleri → suresi_doldu, kupon serbest
 *   ledger_check    günlük: defter tutarlılık denetimi; bozuksa yöneticilere bildirim + audit + log
 *   proof_retention günlük: kapanmış siparişlerin site.proofDays (varsayılan 90) günden eski teslim kanıtlarını siler
 */
final class Jobs
{
    public static function tasks()
    {
        return [
            'autoconfirm' => [0, function (Db $db, $deadline) {
                return Orders::autoConfirm($db, 100, $deadline);
            }],
            'deposit_expiry' => [0, function (Db $db, $deadline) {
                return ['expired' => Deposits::expire($db)];
            }],
            'ledger_check' => [86400000, function (Db $db, $deadline) {
                return self::ledgerCheck($db);
            }],
            'proof_retention' => [86400000, function (Db $db, $deadline) {
                return ['deleted' => Orders::purgeProofs($db, Rules::site($db)['proofDays'])];
            }],
        ];
    }

    public static function ledgerCheck(Db $db)
    {
        $r = Ledger::check($db);
        if (!$r['ok']) {
            Log::write('hata', 'Defter tutarlılık denetimi başarısız', ['errors' => $r['errors']]);
            Audit::log($db, null, 'ledger_check_fail', 'system', 'ledger', ['errors' => $r['errors']]);
            self::alertAdmins($db, 'Defter tutarlılık denetimi başarısız: ' . implode('; ', array_slice($r['errors'], 0, 3)) . (count($r['errors']) > 3 ? ' …' : ''));
        }
        return $r;
    }

    /** Tüm yöneticilere (admin) site içi bildirim + e-posta (system olayı) */
    public static function alertAdmins(Db $db, $text)
    {
        foreach ($db->all("SELECT id FROM {users} WHERE role='admin' AND status='active'") as $a) {
            Notify::send($db, $a['id'], $text, '#yonetim/muhasebe', 'system');
        }
    }
}
