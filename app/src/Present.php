<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Sunucu satırlarını ön yüzün S şekline çevirir (alan adları aynı: name, ad, soyad, tel, email, bal, bonus, pts…).
 * Para: kuruş → TL sayı.
 */
final class Present
{
    private static function tl($kurus)
    {
        return round(((int)$kurus) / 100, 2);
    }

    /** Herkese açık alanlar */
    public static function publicUser(array $u)
    {
        return [
            'id' => Ids::u($u['id']), 'name' => $u['name'], 'rating' => (float)$u['rating'], 'sales' => (int)$u['sales'],
            'joined' => Text::monthYear($u['joined_at']), 'verified' => (bool)$u['verified'], 'vol' => (int)$u['vol'],
            'lastSeen' => (int)$u['last_seen'], 'admin' => $u['role'] === 'admin', 'staff' => $u['role'] === 'staff',
        ];
    }

    /** Kendi hesabı */
    public static function me(Db $db, array $u)
    {
        $w = $db->one('SELECT cash, credit FROM {wallets} WHERE user_id=?', [(int)$u['id']]) ?: ['cash' => 0, 'credit' => 0];
        $ib = $db->all('SELECT id, bank, holder, iban_last4, iban_enc FROM {user_ibans} WHERE user_id=? ORDER BY id', [(int)$u['id']]);
        return array_merge(self::publicUser($u), [
            'ad' => $u['ad'], 'soyad' => $u['soyad'], 'tel' => $u['tel'], 'email' => (string)$u['email'],
            'bal' => self::tl($w['cash']), 'bonus' => self::tl($w['credit']), 'pts' => (int)$u['pts'],
            'perms' => Perm::of($u), 'tfa' => (string)$u['tfa'], 'banned' => $u['status'] === 'banned',
            'refs' => (int)$u['refs'], 'refBy' => Ids::u($u['ref_by']), 'refCode' => Text::refCode($u['name']),
            'tc' => (int)$u['tc_ok'] ? ['ok' => true, 'mask' => (string)$u['tc_mask'], 'masked' => true] : null,
            'ibans' => array_map([__CLASS__, 'iban'], $ib),
            'created' => (int)$u['created_at'],
        ]);
    }

    public static function iban(array $r)
    {
        try {
            $full = yp_decrypt($r['iban_enc']);
            $first4 = substr($full, 0, 4);
        } catch (\Throwable $e) {
            $first4 = 'TR••';
        }
        return ['id' => 'ib' . (int)$r['id'], 'bank' => $r['bank'], 'name' => $r['holder'], 'iban' => $first4 . '••••••' . $r['iban_last4'], 'masked' => true];
    }

    /** Çalışan görünümü ([uye] yetkisi): özel alanlar dahil, TC/IBAN yok */
    public static function staffUser(Db $db, array $u)
    {
        $w = $db->one('SELECT cash, credit FROM {wallets} WHERE user_id=?', [(int)$u['id']]) ?: ['cash' => 0, 'credit' => 0];
        return array_merge(self::publicUser($u), [
            'ad' => $u['ad'], 'soyad' => $u['soyad'], 'tel' => $u['tel'], 'email' => (string)$u['email'],
            'bal' => self::tl($w['cash']), 'bonus' => self::tl($w['credit']), 'pts' => (int)$u['pts'],
            'perms' => Perm::of($u), 'banned' => $u['status'] === 'banned', 'tfa' => (string)$u['tfa'] !== '',
            'refs' => (int)$u['refs'], 'refBy' => Ids::u($u['ref_by']), 'created' => (int)$u['created_at'],
            'tcOk' => (bool)(int)$u['tc_ok'],
        ]);
    }

    public static function notif(array $n)
    {
        return ['id' => 'n' . (int)$n['id'], 'u' => Ids::u($n['user_id']), 'x' => $n['x'], 'link' => $n['link'], 't' => (int)$n['t'], 'read' => (bool)(int)$n['is_read']];
    }
}
