<?php
namespace YP\Growth;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Money\Ledger;
use YP\Money\Rules;
use YP\Notify;
use YP\Settings;
use YP\Text;

/**
 * Çekilişler (PLAN §1.4 "Raffles and wheel"): ön yüzdeki raffleSpend / rOk / rCap / addTickets / free-tk / raffle / draw / r-del.
 *   - Bilet kaynakları: tamamlanan alışveriş (raffleSpend; satış onayında), günlük ücretsiz bilet (raffle_free benzersiz),
 *     şans çarkı "+1 bilet" ödülü (addTickets). Demo'da yönetici bilet verme yok.
 *   - Çekiliş: yalnız [kampanya]; o anki bilet listesinin anlık görüntüsü (üye kimliğine göre sıralı) ve 32 baytlık rastgele tohum
 *     saklanır. Kazanan = HMAC-SHA256(tohum, "yp-raffle-v1:<id>:<sayaç>") ile reddetmeli örnekleme (eğilimsiz) → aynı
 *     görüntü + tohumla her zaman aynı kazanan (verify). Bakiye ödülü kazananın kredi (yalnız alışveriş) bakiyesine EXP:raffle'dan.
 *   - Çekiliş/çark kapatma anahtarı: site.raffleOn / site.wheelOn (sahip kararı: gerçek sürümde AÇIK başlar).
 */
final class Raffles
{
    const RCATS = ['yang', 'item', 'karakter', 'ep', 'epstore', 'borsa'];
    const PAL = [['#4f2479', '#c2185b'], ['#0d6b52', '#2f9a3e'], ['#1d375a', '#3b9fdc'], ['#8a3b12', '#e0892f']];
    const ALGO = 'hmac-sha256-rejection-v1';

    public static function on(?Db $db = null)
    {
        $s = Settings::get('site', $db);
        return !is_array($s) || !array_key_exists('raffleOn', $s) || !empty($s['raffleOn']);
    }

    public static function parseId($v)
    {
        return Ids::parse($v, 'r');
    }

    public static function lock(Db $db, $ref)
    {
        $r = $db->one('SELECT * FROM {raffles} WHERE id=? AND deleted_at IS NULL' . $db->forUpdate(), [self::parseId($ref)]);
        if (!$r) {
            throw HttpError::notFound('Çekiliş bulunamadı.');
        }
        return $r;
    }

    public static function activeRows(Db $db)
    {
        return $db->all('SELECT * FROM {raffles} WHERE deleted_at IS NULL AND winner_id IS NULL AND end_at>? ORDER BY end_at, id', [yp_now_ms()]);
    }

    /* ---------------- kurallar ---------------- */

    public static function vipIdx(array $levels, $id)
    {
        foreach (array_values($levels) as $i => $v) {
            if ((string)$v['id'] === (string)$id) {
                return $i;
            }
        }
        return 0;
    }

    /** rOk(r,u) */
    public static function ok(array $r, array $u, array $levels)
    {
        if ((string)$r['min_vip'] === '') {
            return true;
        }
        return self::vipIdx($levels, Rules::vip((int)$u['vol'], $levels)['id']) >= self::vipIdx($levels, $r['min_vip']);
    }

    /** rCap(r,uid,n) */
    public static function cap(array $r, $have, $n)
    {
        return (int)$r['max_tk'] > 0 ? max(0, min((int)$n, (int)$r['max_tk'] - (int)$have)) : (int)$n;
    }

    private static function ticketRow(Db $db, $rid, $uid)
    {
        $db->insertIgnore('raffle_tickets', ['raffle_id' => (int)$rid, 'user_id' => (int)$uid, 'n' => 0, 'acc' => 0, 'updated_at' => 0]);
        return $db->one('SELECT * FROM {raffle_tickets} WHERE raffle_id=? AND user_id=?' . $db->forUpdate(), [(int)$rid, (int)$uid]);
    }

    private static function cats(array $r)
    {
        $c = $r['cats'] ? json_decode((string)$r['cats'], true) : [];
        return is_array($c) ? $c : [];
    }

    /** Sipariş kategorisi → RCATS anahtarı */
    public static function catOf($cat)
    {
        $cat = (string)$cat;
        if ($cat === 'epin') {
            return 'ep';
        }
        return $cat;
    }

    /**
     * raffleSpend(uid, amt, cat): tamamlanan harcama (kuruş) aktif çekilişlerde birikir; her `per` kuruşa 1 bilet.
     * Dönüş: [[raffle, n], …]
     */
    public static function spend(Db $db, $userId, $amount, $cat)
    {
        if (!self::on($db) || (int)$amount <= 0) {
            return [];
        }
        $u = $db->one('SELECT id, vol, role, status FROM {users} WHERE id=?', [(int)$userId]);
        if (!$u || $u['role'] !== 'member') {
            return [];
        }
        $levels = Rules::vipLevels($db);
        $cat = self::catOf($cat);
        $got = [];
        foreach (self::activeRows($db) as $r) {
            if (!self::ok($r, $u, $levels)) {
                continue;
            }
            $cs = self::cats($r);
            if ($cs && !in_array($cat, $cs, true)) {
                continue;
            }
            $per = max(1, (int)$r['per']);
            $t = self::ticketRow($db, $r['id'], $userId);
            $acc = (int)$t['acc'] + (int)$amount;
            $n = intdiv($acc, $per);
            $acc -= $n * $per;
            $n = self::cap($r, (int)$t['n'], $n);
            $db->update('raffle_tickets', ['acc' => $acc, 'n' => (int)$t['n'] + $n, 'updated_at' => yp_now_ms()], 'raffle_id=? AND user_id=?', [(int)$r['id'], (int)$userId]);
            if ($n > 0) {
                $got[] = [$r, $n];
            }
        }
        if ($got) {
            Notify::send($db, $userId, 'Çekiliş bileti kazandın: ' . implode(', ', array_map(function ($g) {
                return $g[1] . ' bilet · ' . $g[0]['title'];
            }, $got)), '#cekilis', 'ticket');
        }
        return $got;
    }

    /** addTickets(u, n): şans çarkı bilet ödülü — tüm uygun aktif çekilişlere */
    public static function addTickets(Db $db, array $u, $n)
    {
        if ((int)$n <= 0 || !self::on($db)) {
            return 0;
        }
        $levels = Rules::vipLevels($db);
        $tot = 0;
        foreach (self::activeRows($db) as $r) {
            if (!self::ok($r, $u, $levels)) {
                continue;
            }
            $t = self::ticketRow($db, $r['id'], $u['id']);
            $m = self::cap($r, (int)$t['n'], $n);
            if ($m > 0) {
                $db->update('raffle_tickets', ['n' => (int)$t['n'] + $m, 'updated_at' => yp_now_ms()], 'raffle_id=? AND user_id=?', [(int)$r['id'], (int)$u['id']]);
                $tot += $m;
            }
        }
        return $tot;
    }

    /** free-tk: günde 1 ücretsiz bilet (raffle_free benzersiz) */
    public static function freeTicket(Db $db, array $u, array $r)
    {
        if (!self::on($db)) {
            throw HttpError::conflict('Çekilişler şu an kapalı.');
        }
        if ($u['role'] !== 'member') {
            throw HttpError::forbidden('Yönetim hesapları çekilişe katılamaz.');
        }
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız askıda.');
        }
        if ($r['winner_id'] !== null || (int)$r['end_at'] <= yp_now_ms()) {
            throw HttpError::conflict('Bu çekiliş sona erdi.');
        }
        if (!(int)$r['free']) {
            throw HttpError::conflict('Bu çekilişte ücretsiz bilet yok.');
        }
        if (!self::ok($r, $u, Rules::vipLevels($db))) {
            throw HttpError::forbidden('Bu çekiliş üst VIP seviyelerine özel.');
        }
        $t = self::ticketRow($db, $r['id'], $u['id']);
        if (self::cap($r, (int)$t['n'], 1) < 1) {
            throw HttpError::conflict('Bu çekilişte bilet sınırına ulaştın.');
        }
        $day = Ads::dayKey(yp_now_ms());
        $gen = Wheel::gen($db);
        if ($db->val('SELECT 1 FROM {raffle_free} WHERE raffle_id=? AND user_id=? AND day=? AND gen=?', [(int)$r['id'], (int)$u['id'], $day, $gen])) {
            throw new HttpError(409, 'Bugünkü ücretsiz biletini aldın. Yarın tekrar gel!', 'already');
        }
        try {
            $db->insert('raffle_free', ['raffle_id' => (int)$r['id'], 'user_id' => (int)$u['id'], 'day' => $day, 'gen' => $gen, 't' => yp_now_ms()]);
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw new HttpError(409, 'Bugünkü ücretsiz biletini aldın. Yarın tekrar gel!', 'already');
            }
            throw $e;
        }
        $db->update('raffle_tickets', ['n' => (int)$t['n'] + 1, 'updated_at' => yp_now_ms()], 'raffle_id=? AND user_id=?', [(int)$r['id'], (int)$u['id']]);
        return (int)$t['n'] + 1;
    }

    /* ---------------- yönetim ---------------- */

    /** raffle: {title, kind bal|item, value TL, per TL, minVip, maxTk, cats[], days, free} */
    public static function create(Db $db, array $staff, array $in)
    {
        $title = isset($in['title']) && is_scalar($in['title']) ? trim((string)$in['title']) : '';
        if (mb_strlen($title, 'UTF-8') < 2 || mb_strlen($title, 'UTF-8') > 120) {
            throw HttpError::validation(['title' => 'Ödül adını yazın (2–120 karakter).']);
        }
        $kind = isset($in['kind']) && $in['kind'] === 'item' ? 'item' : 'bal';
        $value = Text::kurus(isset($in['value']) ? $in['value'] : null);
        if ($value === null || $value < 100 || $value > 100000000) {
            throw HttpError::validation(['value' => 'Ödül değerini girin (en az 1 TL).']);
        }
        $per = Text::kurus(isset($in['per']) ? $in['per'] : 100);
        if ($per === null || $per < 100 || $per > 100000000) {
            throw HttpError::validation(['per' => 'Bilet başına alışveriş tutarı en az 1 TL olmalı.']);
        }
        $days = isset($in['days']) && is_numeric($in['days']) ? (int)$in['days'] : 7;
        if ($days < 1 || $days > 365) {
            throw HttpError::validation(['days' => 'Süre 1–365 gün olmalı.']);
        }
        $levels = Rules::vipLevels($db);
        $minVip = isset($in['minVip']) && is_string($in['minVip']) ? $in['minVip'] : '';
        if ($minVip !== '' && !in_array($minVip, array_column($levels, 'id'), true)) {
            throw HttpError::validation(['minVip' => 'VIP seviyesi bulunamadı.']);
        }
        $maxTk = isset($in['maxTk']) && is_numeric($in['maxTk']) ? max(0, min(1000000, (int)$in['maxTk'])) : 0;
        $cats = [];
        foreach (isset($in['cats']) && is_array($in['cats']) ? $in['cats'] : [] as $c) {
            if (is_string($c) && in_array($c, self::RCATS, true)) {
                $cats[$c] = 1;
            }
        }
        $free = !isset($in['free']) || !empty($in['free']) && $in['free'] !== 'false';
        $n = (int)$db->val('SELECT COUNT(*) FROM {raffles}');
        $pal = self::PAL[$n % count(self::PAL)];
        $now = yp_now_ms();
        $id = $db->insert('raffles', [
            'title' => yp_str($title, 120), 'kind' => $kind, 'value' => $value, 'end_at' => $now + $days * Ads::D, 'c1' => $pal[0], 'c2' => $pal[1], 'w' => 'rifle',
            'per' => $per, 'cats' => $cats ? json_encode(array_keys($cats)) : null, 'min_vip' => $minVip, 'max_tk' => $maxTk, 'free' => $free ? 1 : 0,
            'created_by' => (int)$staff['id'], 'created_at' => $now,
        ]);
        Audit::log($db, $staff['id'], 'raffle_add', 'raffle', 'r' . $id, ['title' => $title, 'kind' => $kind, 'value' => $value, 'days' => $days, 'per' => $per]);
        return $db->one('SELECT * FROM {raffles} WHERE id=?', [$id]);
    }

    /** Eğilimsiz seçim: 0 ≤ sonuç < $total */
    public static function pick($seedHex, $raffleId, $total)
    {
        $key = hex2bin($seedHex);
        $total = (int)$total;
        if ($total <= 0 || $key === false) {
            throw new \InvalidArgumentException('pick: geçersiz girdi');
        }
        $space = 1 << 52;
        $lim = intdiv($space, $total) * $total;
        for ($c = 0; $c < 1000; $c++) {
            $r = hexdec(substr(hash_hmac('sha256', 'yp-raffle-v1:' . (int)$raffleId . ':' . $c, $key), 0, 13));
            if ($r < $lim) {
                return [$r % $total, $c];
            }
        }
        throw new \RuntimeException('pick: sınır aşıldı');
    }

    /** Anlık görüntüden kazanan: [[uid, n], …] (uid artan) */
    public static function winnerFrom(array $snap, $index)
    {
        $acc = 0;
        foreach ($snap as $e) {
            $acc += (int)$e[1];
            if ($index < $acc) {
                return (int)$e[0];
            }
        }
        return null;
    }

    /** draw: kazananı çek (denetim kaydı + tohum + anlık görüntü) */
    public static function draw(Db $db, array $staff, array $r)
    {
        if ($r['winner_id'] !== null) {
            throw HttpError::conflict('Bu çekilişin kazananı zaten belli.');
        }
        $rows = $db->all('SELECT t.user_id, t.n FROM {raffle_tickets} t JOIN {users} u ON u.id=t.user_id WHERE t.raffle_id=? AND t.n>0 AND u.status=\'active\' ORDER BY t.user_id', [(int)$r['id']]);
        $snap = array_map(function ($x) {
            return [(int)$x['user_id'], (int)$x['n']];
        }, $rows);
        $total = array_sum(array_column($snap, 1));
        if ($total <= 0) {
            throw new HttpError(409, 'Bu çekilişte bilet yok.', 'no_tickets');
        }
        $seed = bin2hex(random_bytes(32));
        list($idx, $ctr) = self::pick($seed, $r['id'], $total);
        $win = self::winnerFrom($snap, $idx);
        $now = yp_now_ms();
        $snapJson = json_encode($snap);
        $meta = ['algo' => self::ALGO, 'seed' => $seed, 'total' => $total, 'index' => $idx, 'counter' => $ctr, 'winner' => $win, 'snapshot' => $snap,
            'snapshotSha256' => hash('sha256', $snapJson), 't' => $now, 'by' => (int)$staff['id']];
        $set = ['winner_id' => $win, 'drawn_at' => $now, 'drawn_by' => (int)$staff['id'], 'end_at' => min((int)$r['end_at'], $now),
            'draw_meta' => json_encode($meta, JSON_UNESCAPED_SLASHES)];
        $wu = $db->one('SELECT * FROM {users} WHERE id=?', [$win]);
        if ($r['kind'] === 'bal' && (int)$r['value'] > 0) {
            $set['journal_id'] = Ledger::post($db, 'cekilis', ['ref_type' => 'raffle', 'ref_id' => 'r' . $r['id'], 'user' => $win, 'amount' => (int)$r['value'], 'actor' => $staff['id'],
                'meta' => ['m' => 'Çekiliş: ' . $r['title'], 'src' => 'cekilis']], [
                ['EXP:raffle', -(int)$r['value']],
                [Ledger::credit($win), (int)$r['value'], 'Çekiliş ödülü: ' . $r['title'] . ' · sadece alışveriş'],
            ]);
        }
        $db->update('raffles', $set, 'id=?', [(int)$r['id']]);
        Audit::log($db, $staff['id'], 'raffle_draw', 'raffle', 'r' . $r['id'], ['winner' => Ids::u($win), 'total' => $total, 'index' => $idx, 'seed' => $seed,
            'snapshotSha256' => $meta['snapshotSha256'], 'entrants' => count($snap), 'kind' => $r['kind'], 'value' => (int)$r['value']]);
        Notify::send($db, $win, 'Tebrikler! “' . $r['title'] . '” çekilişini kazandınız.' . ($r['kind'] === 'bal' ? ' ' . Rules::tl($r['value']) . ' alışveriş bakiyenize eklendi.' : ' Ekibimiz ödül teslimi için sizinle iletişime geçecek.'),
            '#cekilis', 'raffle', ['cekilis' => $r['title']]);
        return [$db->one('SELECT * FROM {raffles} WHERE id=?', [(int)$r['id']]), $wu, $meta];
    }

    /** Saklanan görüntü + tohumdan sonucu yeniden üretir */
    public static function verify(array $r)
    {
        $m = $r['draw_meta'] ? json_decode((string)$r['draw_meta'], true) : null;
        if (!is_array($m) || empty($m['seed']) || !isset($m['snapshot'])) {
            return ['ok' => false, 'error' => 'Çekiliş henüz yapılmadı.'];
        }
        $snap = $m['snapshot'];
        $total = array_sum(array_column($snap, 1));
        list($idx) = self::pick($m['seed'], $r['id'], $total);
        $win = self::winnerFrom($snap, $idx);
        $ok = $win === (int)$r['winner_id'] && $idx === (int)$m['index'] && $total === (int)$m['total'] && hash('sha256', json_encode($snap)) === $m['snapshotSha256'];
        return ['ok' => $ok, 'winner' => Ids::u($win), 'stored' => Ids::u($r['winner_id']), 'index' => $idx, 'total' => $total, 'algo' => $m['algo'],
            'seed' => $m['seed'], 'snapshotSha256' => $m['snapshotSha256'], 'entrants' => count($snap)];
    }

    public static function delete(Db $db, array $staff, array $r)
    {
        $db->update('raffles', ['deleted_at' => yp_now_ms()], 'id=?', [(int)$r['id']]);
        Audit::log($db, $staff['id'], 'raffle_delete', 'raffle', 'r' . $r['id'], ['title' => $r['title'], 'drawn' => $r['winner_id'] !== null]);
    }

    /* ---------------- sunum ---------------- */

    /** S.raffles şekli. $uid: görenin bilet/birikim/ücretsiz bilet bilgisi; $admin: tüm bilet dağılımı */
    public static function present(Db $db, array $rows, $uid = null, $admin = false)
    {
        if (!$rows) {
            return [];
        }
        $ids = array_map('intval', array_column($rows, 'id'));
        $in = implode(',', array_fill(0, count($ids), '?'));
        $tot = [];
        foreach ($db->all('SELECT raffle_id, SUM(n) AS s, COUNT(*) AS c FROM {raffle_tickets} WHERE raffle_id IN (' . $in . ') AND n>0 GROUP BY raffle_id', $ids) as $x) {
            $tot[(int)$x['raffle_id']] = [(int)$x['s'], (int)$x['c']];
        }
        $mine = [];
        $free = [];
        if ($uid) {
            foreach ($db->all('SELECT raffle_id, n, acc FROM {raffle_tickets} WHERE user_id=? AND raffle_id IN (' . $in . ')', array_merge([(int)$uid], $ids)) as $x) {
                $mine[(int)$x['raffle_id']] = $x;
            }
            $day = Ads::dayKey(yp_now_ms());
            foreach ($db->all('SELECT raffle_id FROM {raffle_free} WHERE user_id=? AND day=? AND gen=?', [(int)$uid, $day, Wheel::gen($db)]) as $x) {
                $free[(int)$x['raffle_id']] = $day;
            }
        }
        $out = [];
        foreach ($rows as $r) {
            $id = (int)$r['id'];
            $x = [
                'id' => 'r' . $id, 'title' => $r['title'], 'kind' => $r['kind'], 'value' => Text::tl($r['value']), 'end' => (int)$r['end_at'],
                'c' => [$r['c1'] ?: '#4f2479', $r['c2'] ?: '#c2185b'], 'w' => $r['w'] ?: 'rifle', 'per' => Text::tl($r['per']), 'cats' => self::cats($r),
                'minVip' => $r['min_vip'], 'maxTk' => (int)$r['max_tk'], 'free' => (bool)(int)$r['free'], 'winner' => Ids::u($r['winner_id']),
                'total' => isset($tot[$id]) ? $tot[$id][0] : 0, 'entrants' => isset($tot[$id]) ? $tot[$id][1] : 0, 'drawnAt' => $r['drawn_at'] !== null ? (int)$r['drawn_at'] : null,
                'tk' => [], 'acc' => [],
            ];
            if ($uid) {
                $u = Ids::u($uid);
                $x['tk'][$u] = isset($mine[$id]) ? (int)$mine[$id]['n'] : 0;
                $x['acc'][$u] = isset($mine[$id]) ? Text::tl($mine[$id]['acc']) : 0;
                $x['freeDay'] = isset($free[$id]) ? $free[$id] : null;
            }
            if ($admin) {
                $x['tk'] = [];
                foreach ($db->all('SELECT user_id, n FROM {raffle_tickets} WHERE raffle_id=? AND n>0 ORDER BY n DESC LIMIT 200', [$id]) as $t) {
                    $x['tk'][Ids::u($t['user_id'])] = (int)$t['n'];
                }
                $m = $r['draw_meta'] ? json_decode((string)$r['draw_meta'], true) : null;
                $x['draw'] = is_array($m) ? ['seed' => $m['seed'], 'index' => $m['index'], 'total' => $m['total'], 'sha' => $m['snapshotSha256'], 'algo' => $m['algo']] : null;
            }
            $out[] = $x;
        }
        return $out;
    }

    /** Herkese açık liste: aktif çekilişler + son 5 kazanan */
    public static function publicRows(Db $db)
    {
        $act = self::on($db) ? self::activeRows($db) : [];
        $past = $db->all('SELECT * FROM {raffles} WHERE deleted_at IS NULL AND winner_id IS NOT NULL ORDER BY drawn_at DESC LIMIT 5');
        return array_merge($act, $past);
    }
}
