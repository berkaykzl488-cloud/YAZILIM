<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use RuntimeException;
use YP\Db;

/**
 * Çift taraflı defter (PLAN §1.2 Ledger, §3.4).
 *   Ledger::post($db, kind, opts, [[hesap, ±kuruş, etiket], …])
 *     - satırların toplamı 0 olmalı (değilse istisna; işlem geri alınır)
 *     - üye hesapları (U<id>:cash|credit) için wallets satırları AYNI işlemde, artan üye kimliği sırasıyla
 *       SELECT … FOR UPDATE ile kilitlenip güncellenir; hiçbir cüzdan eksiye düşemez
 *   Her zaman bir işlemin (Db::tx) içinde çağrılmalıdır.
 */
final class Ledger
{
    const KIND_TL = ['yukleme', 'cekim_talep', 'cekim_odendi', 'cekim_red', 'satis', 'iade', 'ep', 'borsa', 'bonus', 'duzeltme', 'stopaj_tahakkuk',
                     'satin_alma', 'doping', 'reklam', 'sms', 'cekilis', 'cark', 'puan', 'davet'];

    /** @var array [code => id] istek içi önbellek (işlem geri alınırsa temizlenir) */
    private static $acc = [];

    public static function reset()
    {
        self::$acc = [];
    }

    public static function cash($userId)
    {
        return 'U' . (int)$userId . ':cash';
    }

    public static function credit($userId)
    {
        return 'U' . (int)$userId . ':credit';
    }

    /** Hesap kodundan tür + üye */
    public static function parse($code)
    {
        if (preg_match('/^U([1-9][0-9]*):(cash|credit)$/', $code, $m)) {
            return ['user_' . $m[2], (int)$m[1]];
        }
        $p = strtok($code, ':');
        $map = ['ESCROW' => 'escrow', 'REV' => 'revenue', 'GW' => 'gateway', 'PAYABLE' => 'payable', 'TAX' => 'tax', 'EXP' => 'expense', 'ADJ' => 'equity', 'BANK' => 'gateway'];
        if (!isset($map[$p]) || !preg_match('/^[A-Z]+(:[a-z0-9_]{1,40})?$/', $code)) {
            throw new RuntimeException('Geçersiz hesap kodu: ' . $code);
        }
        return [$map[$p], null];
    }

    public static function accountId(Db $db, $code)
    {
        if (isset(self::$acc[$code])) {
            return self::$acc[$code];
        }
        $id = $db->val('SELECT id FROM {accounts} WHERE code=?', [$code]);
        if (!$id) {
            list($type, $uid) = self::parse($code);
            $db->insertIgnore('accounts', ['code' => $code, 'type' => $type, 'user_id' => $uid, 'created_at' => yp_now_ms()]);
            $id = $db->val('SELECT id FROM {accounts} WHERE code=?', [$code]);
        }
        if (!$id) {
            throw new RuntimeException('Hesap açılamadı: ' . $code);
        }
        return self::$acc[$code] = (int)$id;
    }

    /** Cüzdan satırlarını artan kimlik sırasıyla kilitler (yoksa açar). Dönüş [user_id => ['cash'=>, 'credit'=>]] */
    public static function lockWallets(Db $db, array $userIds)
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($userIds))));
        sort($ids, SORT_NUMERIC);
        if (!$ids) {
            return [];
        }
        foreach ($ids as $id) {
            $db->insertIgnore('wallets', ['user_id' => $id, 'cash' => 0, 'credit' => 0, 'updated_at' => 0]);
        }
        $rows = $db->all('SELECT user_id, cash, credit FROM {wallets} WHERE user_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY user_id' . $db->forUpdate(), $ids);
        $out = [];
        foreach ($rows as $r) {
            $out[(int)$r['user_id']] = ['cash' => (int)$r['cash'], 'credit' => (int)$r['credit']];
        }
        return $out;
    }

    public static function wallet(Db $db, $userId, $lock = false)
    {
        if ($lock) {
            $w = self::lockWallets($db, [$userId]);
            return $w[(int)$userId];
        }
        $r = $db->one('SELECT cash, credit FROM {wallets} WHERE user_id=?', [(int)$userId]);
        return ['cash' => $r ? (int)$r['cash'] : 0, 'credit' => $r ? (int)$r['credit'] : 0];
    }

    /**
     * Yevmiye kaydı. $opt: ref_type, ref_id, user (S.ledger.u), amount (S.ledger.a), actor, memo, meta(dizi), idem
     * $lines: [[kod, kuruş, etiket?], …]. Dönüş: journal id
     */
    public static function post(Db $db, $kind, array $opt, array $lines)
    {
        if (!$db->inTx()) {
            throw new RuntimeException('Ledger::post bir işlem (tx) içinde çağrılmalı.');
        }
        if (!preg_match('/^[a-z_]{2,30}$/', (string)$kind)) {
            throw new RuntimeException('Geçersiz kayıt türü.');
        }
        $sum = 0;
        $clean = [];
        foreach ($lines as $l) {
            if (!is_int($l[1])) {
                throw new RuntimeException('Defter tutarı tamsayı (kuruş) olmalı.');
            }
            if ($l[1] === 0) {
                continue;
            }
            $sum += $l[1];
            $clean[] = [(string)$l[0], $l[1], isset($l[2]) ? (string)$l[2] : ''];
        }
        if ($sum !== 0) {
            throw new RuntimeException('Defter dengesiz: toplam ' . $sum . ' (' . $kind . ')');
        }
        if (!$clean) {
            throw new RuntimeException('Boş defter kaydı.');
        }
        // üye hesapları: cüzdanları kilitle, yeni bakiyeyi denetle
        $delta = [];
        foreach ($clean as $l) {
            list($type, $uid) = self::parse($l[0]);
            if ($uid) {
                $b = $type === 'user_cash' ? 'cash' : 'credit';
                $delta[$uid][$b] = (isset($delta[$uid][$b]) ? $delta[$uid][$b] : 0) + $l[1];
            }
        }
        $wallets = self::lockWallets($db, array_keys($delta));
        foreach ($delta as $uid => $d) {
            foreach ($d as $b => $v) {
                if ($wallets[$uid][$b] + $v < 0) {
                    throw new InsufficientFunds('Bakiye yetersiz.');
                }
            }
        }
        $now = yp_now_ms();
        $jid = $db->insert('journal', [
            'kind' => $kind, 'ref_type' => isset($opt['ref_type']) ? yp_str($opt['ref_type'], 20) : '',
            'ref_id' => isset($opt['ref_id']) ? yp_str((string)$opt['ref_id'], 40) : '',
            'user_id' => isset($opt['user']) ? (int)$opt['user'] : null, 'amount' => isset($opt['amount']) ? (int)$opt['amount'] : 0,
            'actor_id' => isset($opt['actor']) && $opt['actor'] ? (int)$opt['actor'] : null, 'memo' => isset($opt['memo']) ? yp_str($opt['memo'], 255) : '',
            'meta' => !empty($opt['meta']) ? json_encode($opt['meta'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'idem' => isset($opt['idem']) ? yp_str($opt['idem'], 120) : null, 't' => $now,
        ]);
        foreach ($clean as $l) {
            list(, $uid) = self::parse($l[0]);
            $db->insert('postings', ['journal_id' => $jid, 'account_id' => self::accountId($db, $l[0]), 'user_id' => $uid,
                'amount' => $l[1], 'label' => yp_str($l[2], 255), 't' => $now]);
        }
        foreach ($delta as $uid => $d) {
            $c = isset($d['cash']) ? (int)$d['cash'] : 0;
            $k = isset($d['credit']) ? (int)$d['credit'] : 0;
            $n = $db->exec('UPDATE {wallets} SET cash=cash+?, credit=credit+?, updated_at=? WHERE user_id=? AND cash+?>=0 AND credit+?>=0',
                [$c, $k, $now, $uid, $c, $k]);
            if ($n !== 1) {
                throw new InsufficientFunds('Bakiye yetersiz.');
            }
        }
        return $jid;
    }

    /** Bir hesabın bakiyesi (postings toplamı) */
    public static function balance(Db $db, $code)
    {
        return (int)$db->val('SELECT COALESCE(SUM(p.amount),0) FROM {postings} p JOIN {accounts} a ON a.id=p.account_id WHERE a.code=?', [$code]);
    }

    /** Önek ile toplam (ör. REV: → tüm gelirler, kod bazında) */
    public static function balancesLike(Db $db, $prefix)
    {
        $out = [];
        foreach ($db->all("SELECT a.code, COALESCE(SUM(p.amount),0) AS s FROM {accounts} a LEFT JOIN {postings} p ON p.account_id=a.id WHERE a.code LIKE ? GROUP BY a.code", [$prefix . '%']) as $r) {
            $out[$r['code']] = (int)$r['s'];
        }
        return $out;
    }

    /**
     * Tutarlılık denetimi (PLAN §1.6): her journal toplamı 0; cüzdanlar = üye hesaplarının posting toplamı; eksi cüzdan yok;
     * ESCROW:ORD = açık siparişlerin toplamı. Dönüş: ['ok'=>bool, 'errors'=>[…]]
     */
    public static function check(Db $db)
    {
        $err = [];
        foreach ($db->all('SELECT journal_id, SUM(amount) AS s FROM {postings} GROUP BY journal_id HAVING SUM(amount)<>0 LIMIT 20') as $r) {
            $err[] = 'Dengesiz kayıt #' . $r['journal_id'] . ': ' . $r['s'];
        }
        $n = (int)$db->val('SELECT COUNT(*) FROM {journal} j WHERE NOT EXISTS (SELECT 1 FROM {postings} p WHERE p.journal_id=j.id)');
        if ($n) {
            $err[] = $n . ' kayıt satırsız';
        }
        $sums = [];
        foreach ($db->all("SELECT a.user_id, a.type, COALESCE(SUM(p.amount),0) AS s FROM {accounts} a LEFT JOIN {postings} p ON p.account_id=a.id
            WHERE a.type IN ('user_cash','user_credit') GROUP BY a.id, a.user_id, a.type") as $r) {
            $sums[(int)$r['user_id']][$r['type'] === 'user_cash' ? 'cash' : 'credit'] = (int)$r['s'];
        }
        foreach ($db->all('SELECT user_id, cash, credit FROM {wallets}') as $w) {
            $u = (int)$w['user_id'];
            $c = isset($sums[$u]['cash']) ? $sums[$u]['cash'] : 0;
            $k = isset($sums[$u]['credit']) ? $sums[$u]['credit'] : 0;
            if ((int)$w['cash'] !== $c || (int)$w['credit'] !== $k) {
                $err[] = 'Cüzdan uyuşmuyor u' . $u . ': cüzdan ' . $w['cash'] . '/' . $w['credit'] . ', defter ' . $c . '/' . $k;
            }
            if ((int)$w['cash'] < 0 || (int)$w['credit'] < 0) {
                $err[] = 'Eksi cüzdan u' . $u;
            }
            unset($sums[$u]);
        }
        foreach ($sums as $u => $s) {
            if (array_sum($s) !== 0) {
                $err[] = 'Cüzdan satırı yok u' . $u;
            }
        }
        if ($db->tableExists('orders')) {
            $open = (int)$db->val("SELECT COALESCE(SUM(total),0) FROM {orders} WHERE status IN ('odendi','teslim','itiraz')");
            $esc = self::balance($db, 'ESCROW:ORD');
            if ($open !== $esc) {
                $err[] = 'Havuz uyuşmuyor: açık siparişler ' . $open . ', ESCROW:ORD ' . $esc;
            }
        }
        return ['ok' => !$err, 'errors' => array_slice($err, 0, 50)];
    }
}

/** Bakiye yetersiz (defter güvenlik ağı; çağıranlar önceden Türkçe hata verir) */
final class InsufficientFunds extends \RuntimeException
{
}
