<?php
namespace YP\Growth;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Money\Ledger;
use YP\Money\Rules;
use YP\Settings;
use YP\Text;

/**
 * Günlük şans çarkı (ön yüzdeki spin / spin-reset / wheelon). Ödüller ayarlardan (settings.wheel.prizes; varsayılan ön yüzdeki WHEEL).
 *   - Günde bir çevirme SUNUCUDA zorunlu: spins (üye, gün, kuşak) birincil anahtarı; ikinci istek 409.
 *   - Seçim random_int ile, ağırlıklar ×100 tamsayı.
 *   - Bakiye ödülü → kredi (yalnız alışveriş, çekilemez) EXP:wheel'den, "cark" kaydı. Puan → users.pts (+points_log).
 *     Bilet → tüm uygun aktif çekilişlere (addTickets).
 *   - "Hakları yenile" (spin-reset): kuşak (gen) artar → bugünkü çark ve ücretsiz bilet hakları yenilenir, geçmiş korunur.
 */
final class Wheel
{
    /** Ön yüzdeki WHEEL (v: bal için TL, pt için puan, tk için bilet; w: ağırlık) */
    const PRIZES0 = [
        ['l' => '1 TL', 'k' => 'bal', 'v' => 1, 'w' => 30, 'c' => '#c2410c'], ['l' => '50 Puan', 'k' => 'pt', 'v' => 50, 'w' => 22, 'c' => '#1d4f91'],
        ['l' => '2 TL', 'k' => 'bal', 'v' => 2, 'w' => 18, 'c' => '#b8890f'], ['l' => '+1 Bilet', 'k' => 'tk', 'v' => 1, 'w' => 14, 'c' => '#6d28a8'],
        ['l' => '5 TL', 'k' => 'bal', 'v' => 5, 'w' => 8, 'c' => '#0f7a5a'], ['l' => '200 Puan', 'k' => 'pt', 'v' => 200, 'w' => 5, 'c' => '#be185d'],
        ['l' => '10 TL', 'k' => 'bal', 'v' => 10, 'w' => 2.5, 'c' => '#0e7490'], ['l' => '50 TL', 'k' => 'bal', 'v' => 50, 'w' => 0.5, 'c' => '#111827'],
    ];

    public static function cfg(?Db $db = null)
    {
        $w = Settings::get('wheel', $db);
        $w = is_array($w) ? $w : [];
        $p = isset($w['prizes']) && is_array($w['prizes']) && $w['prizes'] ? array_values($w['prizes']) : self::PRIZES0;
        return ['prizes' => $p, 'gen' => isset($w['gen']) ? (int)$w['gen'] : 0];
    }

    public static function prizes(?Db $db = null)
    {
        return self::cfg($db)['prizes'];
    }

    public static function gen(?Db $db = null)
    {
        return self::cfg($db)['gen'];
    }

    public static function on(?Db $db = null)
    {
        $s = Settings::get('site', $db);
        return !is_array($s) || !array_key_exists('wheelOn', $s) || !empty($s['wheelOn']);
    }

    /** Ödül listesi doğrulama: 2–16 dilim, k ∈ bal|pt|tk, v > 0 (bal ≤ 1000 TL), w > 0 */
    public static function cleanPrizes($in)
    {
        if (!is_array($in) || count($in) < 2 || count($in) > 16) {
            throw HttpError::validation(['prizes' => 'Çarkta 2–16 dilim olmalı.']);
        }
        $out = [];
        foreach (array_values($in) as $i => $p) {
            if (!is_array($p)) {
                throw HttpError::validation(['prizes' => 'Dilim ' . ($i + 1) . ' geçersiz.']);
            }
            $k = isset($p['k']) ? (string)$p['k'] : '';
            $v = isset($p['v']) && is_numeric($p['v']) ? round((float)$p['v'], 2) : 0;
            $w = isset($p['w']) && is_numeric($p['w']) ? round((float)$p['w'], 2) : 0;
            if (!in_array($k, ['bal', 'pt', 'tk'], true) || $v <= 0 || $w <= 0 || $w > 1000
                || ($k === 'bal' && $v > 1000) || ($k !== 'bal' && ($v != (int)$v || $v > 100000))) {
                throw HttpError::validation(['prizes' => 'Dilim ' . ($i + 1) . ': tür, değer ve ağırlığı kontrol edin.']);
            }
            $l = isset($p['l']) && is_string($p['l']) && trim($p['l']) !== '' ? yp_str(trim($p['l']), 16)
                : ($k === 'bal' ? rtrim(rtrim(number_format($v, 2, ',', ''), '0'), ',') . ' TL' : ($k === 'pt' ? (int)$v . ' Puan' : '+' . (int)$v . ' Bilet'));
            $c = isset($p['c']) && is_string($p['c']) && preg_match('/^#[0-9a-fA-F]{6}$/', $p['c']) ? strtolower($p['c']) : self::PRIZES0[$i % 8]['c'];
            $out[] = ['l' => $l, 'k' => $k, 'v' => $k === 'bal' ? $v : (int)$v, 'w' => $w, 'c' => $c];
        }
        return $out;
    }

    /** PUT admin/settings/wheel: {wheelOn?, raffleOn?, prizes?} */
    public static function setCfg(Db $db, array $staff, array $in)
    {
        $site = Settings::get('site', $db);
        $chg = [];
        foreach (['wheelOn', 'raffleOn'] as $k) {
            if (array_key_exists($k, $in)) {
                $site[$k] = \YP\Money\Api::bool($in[$k]);
                $chg[$k] = $site[$k];
            }
        }
        if ($chg) {
            Settings::set('site', $site, $staff['id'], $db);
        }
        if (array_key_exists('prizes', $in)) {
            $c = self::cfg($db);
            $c['prizes'] = self::cleanPrizes($in['prizes']);
            Settings::set('wheel', $c, $staff['id'], $db);
            $chg['prizes'] = $c['prizes'];
        }
        if (!$chg) {
            throw HttpError::validation(['wheelOn' => 'Değişiklik yok.']);
        }
        Audit::log($db, $staff['id'], 'wheel_set', 'settings', 'wheel', $chg);
        return $chg;
    }

    /** spin-reset: bugünkü çark ve ücretsiz bilet hakları yenilenir */
    public static function reset(Db $db, array $staff)
    {
        $c = self::cfg($db);
        $c['gen'] = $c['gen'] + 1;
        Settings::set('wheel', $c, $staff['id'], $db);
        Audit::log($db, $staff['id'], 'spin_reset', 'settings', 'wheel', ['gen' => $c['gen']]);
        return $c['gen'];
    }

    /** Bugün çevirdi mi? (kuşak dahil) */
    public static function today(Db $db, $uid)
    {
        $r = $db->one('SELECT * FROM {spins} WHERE user_id=? AND day=? AND gen=?', [(int)$uid, Ads::dayKey(yp_now_ms()), self::gen($db)]);
        return $r ?: null;
    }

    /** Ağırlıklı seçim (random_int) */
    public static function choose(array $prizes)
    {
        $ws = array_map(function ($p) {
            return max(1, (int)round(((float)$p['w']) * 100));
        }, $prizes);
        $r = random_int(1, array_sum($ws));
        foreach ($ws as $i => $w) {
            $r -= $w;
            if ($r <= 0) {
                return $i;
            }
        }
        return count($prizes) - 1;
    }

    /** spin: Dönüş ['idx', 'prize', 'credit' (kuruş), 'pts', 'tickets'] */
    public static function spin(Db $db, array $u)
    {
        if (!self::on($db)) {
            throw HttpError::conflict('Şans çarkı şu an kapalı.');
        }
        if ($u['role'] !== 'member') {
            throw HttpError::forbidden('Yönetim hesapları çark çeviremez.');
        }
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız askıda.');
        }
        $cfg = self::cfg($db);
        $day = Ads::dayKey(yp_now_ms());
        $now = yp_now_ms();
        $idx = self::choose($cfg['prizes']);
        $p = $cfg['prizes'][$idx];
        $v = $p['k'] === 'bal' ? Rules::k($p['v']) : (int)$p['v'];
        try {
            $db->insert('spins', ['user_id' => (int)$u['id'], 'day' => $day, 'gen' => $cfg['gen'], 'prize' => yp_str($p['l'], 40), 'k' => $p['k'], 'v' => $v, 'idx' => $idx, 't' => $now]);
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw new HttpError(409, 'Bugünkü hakkını kullandın. Yarın tekrar gel!', 'already');
            }
            throw $e;
        }
        $out = ['idx' => $idx, 'prize' => $p, 'credit' => 0, 'pts' => 0, 'tickets' => 0];
        if ($p['k'] === 'bal') {
            $jid = Ledger::post($db, 'cark', ['ref_type' => 'spin', 'ref_id' => $day . ':' . (int)$u['id'], 'user' => $u['id'], 'amount' => $v, 'actor' => $u['id'],
                'meta' => ['m' => 'Şans çarkı', 'src' => 'cark']], [
                ['EXP:wheel', -$v],
                [Ledger::credit($u['id']), $v, 'Şans çarkı ödülü · sadece alışveriş'],
            ]);
            $db->update('spins', ['journal_id' => $jid], 'user_id=? AND day=? AND gen=?', [(int)$u['id'], $day, $cfg['gen']]);
            $out['credit'] = $v;
        } elseif ($p['k'] === 'pt') {
            $db->exec('UPDATE {users} SET pts=pts+? WHERE id=?', [$v, (int)$u['id']]);
            $db->insert('points_log', ['user_id' => (int)$u['id'], 'delta' => $v, 'reason' => 'cark', 'ref' => $day, 't' => $now]);
            $out['pts'] = $v;
        } else {
            $out['tickets'] = Raffles::addTickets($db, $u, $v);
        }
        return $out;
    }

    /** Yönetim: bugünkü çevirme sayısı ve dağıtılan ödüller */
    public static function stats(Db $db)
    {
        $day = Ads::dayKey(yp_now_ms());
        $r = $db->one("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN k='bal' THEN v ELSE 0 END),0) AS bal, COALESCE(SUM(CASE WHEN k='pt' THEN v ELSE 0 END),0) AS pt,
            COALESCE(SUM(CASE WHEN k='tk' THEN v ELSE 0 END),0) AS tk FROM {spins} WHERE day=?", [$day]);
        return ['today' => (int)$r['n'], 'bal' => Text::tl($r['bal']), 'pts' => (int)$r['pt'], 'tickets' => (int)$r['tk'], 'expTotal' => Text::tl(-Ledger::balance($db, 'EXP:wheel'))];
    }
}
