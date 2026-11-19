<?php
namespace YP\Growth;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Money\Rules;
use YP\Notify;
use YP\Settings;
use YP\Text;

/**
 * Davet et kazan (refset) ve kötüye kullanım işaretleri. Ödeme kuralı P2'deki Orders::refCheck (demo refCheck):
 *   ilk tamamlanan alışveriş ≥ refMin → davet edene refBonus, davetliye refFriend (kredi, yalnız alışveriş);
 *   davet edenin ödüllü daveti refMax ile sınırlı; davetli başına BİR KEZ (users.ref_paid koşullu güncelleme).
 * Kötüye kullanım: ödeme anında davet eden ile davetli aynı IP'den giriş/kayıt yaptıysa ya da aynı IBAN / telefonu
 * kullanıyorsa ref_flags'e işaret düşülür ve [vip] yetkilisine bildirim gider. ENGELLEMEZ (sessiz engel yok).
 */
final class Referral
{
    /** PUT admin/settings/referral: {refOn, refBonus, refFriend, refMin, refMax} (TL) */
    public static function set(Db $db, array $staff, array $in)
    {
        $s = Settings::get('site', $db);
        $s = is_array($s) ? $s : [];
        $out = [];
        if (array_key_exists('refOn', $in)) {
            $out['refOn'] = \YP\Money\Api::bool($in['refOn']);
        }
        foreach (['refBonus' => [0, 10000], 'refFriend' => [0, 10000], 'refMin' => [0, 1000000]] as $k => $lim) {
            if (array_key_exists($k, $in)) {
                $v = Text::kurus($in[$k]);
                if ($v === null || $v < $lim[0] * 100 || $v > $lim[1] * 100) {
                    throw HttpError::validation([$k => 'Tutar 0–' . Rules::num($lim[1]) . ' TL olmalı.']);
                }
                $out[$k] = $v / 100;
            }
        }
        if (array_key_exists('refMax', $in)) {
            if (!is_numeric($in['refMax']) || (int)$in['refMax'] < 1 || (int)$in['refMax'] > 100000) {
                throw HttpError::validation(['refMax' => 'Üye başına en az 1 davet olmalı.']);
            }
            $out['refMax'] = (int)$in['refMax'];
        }
        if (!$out) {
            throw HttpError::validation(['refOn' => 'Değişiklik yok.']);
        }
        Settings::set('site', array_replace($s, $out), $staff['id'], $db);
        Audit::log($db, $staff['id'], 'referral_set', 'settings', 'site', $out);
        return array_intersect_key(Rules::site($db), array_flip(['refOn', 'refBonus', 'refFriend', 'refMin', 'refMax']));
    }

    /** Üyenin girişlerinde / kaydında görülen IP'ler (audit_log) */
    private static function ips(Db $db, $uid)
    {
        $L = [];
        foreach ($db->all("SELECT DISTINCT ip FROM {audit_log} WHERE actor_id=? AND action IN ('register','login','login_tfa','tfa_ok') AND ip<>'' ORDER BY ip LIMIT 50", [(int)$uid]) as $r) {
            $L[] = $r['ip'];
        }
        return $L;
    }

    /** Ortak işaretler: [[neden, ayrıntı], …] */
    public static function signals(Db $db, array $referred, array $referrer)
    {
        $out = [];
        $common = array_values(array_intersect(self::ips($db, $referred['id']), self::ips($db, $referrer['id'])));
        if ($common) {
            $out[] = ['same_ip', $common[0]];
        }
        $iban = $db->val('SELECT a.iban_hash FROM {user_ibans} a JOIN {user_ibans} b ON a.iban_hash=b.iban_hash WHERE a.user_id=? AND b.user_id=? LIMIT 1', [(int)$referred['id'], (int)$referrer['id']]);
        if ($iban) {
            $out[] = ['same_iban', ''];
        }
        $t1 = substr(preg_replace('/\D/', '', (string)$referred['tel']), -10);
        $t2 = substr(preg_replace('/\D/', '', (string)$referrer['tel']), -10);
        if (strlen($t1) === 10 && $t1 === $t2) {
            $out[] = ['same_tel', ''];
        }
        return $out;
    }

    /** Ödül ödendikten hemen sonra (aynı işlem): işaretleri kaydet */
    public static function afterPaid(Db $db, array $referred)
    {
        if (!$referred['ref_by']) {
            return [];
        }
        $R = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$referred['ref_by']]);
        if (!$R) {
            return [];
        }
        $sig = self::signals($db, $referred, $R);
        foreach ($sig as $s) {
            $db->insertIgnore('ref_flags', ['referrer_id' => (int)$R['id'], 'referred_id' => (int)$referred['id'], 'reason' => $s[0], 'ip' => yp_str($s[1], 45),
                'paid' => 1, 'seen' => 0, 't' => yp_now_ms()]);
        }
        if ($sig) {
            Audit::log($db, null, 'ref_flag', 'user', Ids::u($referred['id']), ['referrer' => Ids::u($R['id']), 'reasons' => array_column($sig, 0)]);
            foreach (Ads::staffWith($db, 'vip') as $st) {
                Notify::send($db, $st['id'], 'Davet ödülünde şüpheli eşleşme: ' . $R['name'] . ' → ' . $referred['name'] . ' (' . implode(', ', array_map([__CLASS__, 'reasonTxt'], array_column($sig, 0))) . '). Ödül ödendi; inceleyin.',
                    '#yonetim/vip/davet');
            }
        }
        return $sig;
    }

    public static function reasonTxt($r)
    {
        return ['same_ip' => 'aynı IP', 'same_iban' => 'aynı IBAN', 'same_tel' => 'aynı telefon'][$r] ?? $r;
    }

    /** Yönetim › VIP & davet › Davet: son davetler ve işaretler */
    public static function adminList(Db $db, $limit = 100)
    {
        $rows = $db->all('SELECT u.id, u.name, u.ref_by, u.ref_paid, u.created_at, r.name AS rname FROM {users} u JOIN {users} r ON r.id=u.ref_by WHERE u.ref_by IS NOT NULL ORDER BY u.id DESC LIMIT ' . (int)$limit);
        $flags = [];
        foreach ($db->all('SELECT * FROM {ref_flags} ORDER BY id DESC LIMIT 300') as $f) {
            $flags[(int)$f['referred_id']][] = ['id' => (int)$f['id'], 'reason' => $f['reason'], 'txt' => self::reasonTxt($f['reason']), 'ip' => $f['ip'], 'seen' => (bool)(int)$f['seen'], 't' => (int)$f['t']];
        }
        $L = array_map(function ($r) use ($flags) {
            return ['u' => Ids::u($r['id']), 'name' => $r['name'], 'by' => Ids::u($r['ref_by']), 'byName' => $r['rname'], 'paid' => (bool)(int)$r['ref_paid'],
                't' => (int)$r['created_at'], 'flags' => isset($flags[(int)$r['id']]) ? $flags[(int)$r['id']] : []];
        }, $rows);
        return ['refs' => $L, 'unseen' => (int)$db->val('SELECT COUNT(*) FROM {ref_flags} WHERE seen=0'), 'paid' => (int)$db->val('SELECT COUNT(*) FROM {users} WHERE ref_paid=1'),
            'expTotal' => Text::tl(-\YP\Money\Ledger::balance($db, 'EXP:referral'))];
    }

    /** Hesabım › Davet: davet ettiklerim (yalnız ad, katılım, ödül durumu) */
    public static function mine(Db $db, $uid)
    {
        return array_map(function ($r) {
            return ['id' => Ids::u($r['id']), 'name' => $r['name'], 'joined' => Text::monthYear($r['joined_at']), 'paid' => (bool)(int)$r['ref_paid']];
        }, $db->all('SELECT id, name, joined_at, ref_paid FROM {users} WHERE ref_by=? ORDER BY id DESC LIMIT 200', [(int)$uid]));
    }
}
