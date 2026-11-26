<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Üyeden üyeye mesajlar (P6): ön yüzdeki dmSend / vMessages / unreadDM'in sunucu karşılığı.
 * - Her mesaj Censor'dan geçer: telefon, e-posta, link ve site dışı iletişim/ödeme ifadeleri [gizlendi] olur; orijinal metin yalnız
 *   flagged tablosuna yazılır (Yönetim › Engellenen mesajlar [mesaj]).
 * - Hız sınırı: üye başına dakikada 20, günde 300 mesaj; bir saatte en çok 20 YENİ konuşma (toplu istenmeyen ileti).
 * - Bir konuşmada karşı tarafa yalnız ilk mesajda bildirim gider (ön yüzle aynı: ev 'message').
 * - Ön yüz şekli (S.dms): {id:'dm7', a:'u1', b:'u2', msgs:[{id,f,x,t,flag}], read:{u1:t}}; liste yalnız son iletiyi taşır.
 */
final class Dm
{
    const PER_MIN = 20;
    const PER_DAY = 300;
    const NEW_PER_HOUR = 20;

    public static function peer(Db $db, array $me, $peer)
    {
        $p = $db->one('SELECT * FROM {users} WHERE id=?', [Ids::user($peer)]);
        if (!$p) {
            throw HttpError::notFound('Üye bulunamadı.');
        }
        if ((int)$p['id'] === (int)$me['id']) {
            throw HttpError::validation(['peer' => 'Kendinize mesaj gönderemezsiniz.']);
        }
        return $p;
    }

    public static function thread(Db $db, $a, $b)
    {
        $x = min((int)$a, (int)$b);
        $y = max((int)$a, (int)$b);
        return $db->one('SELECT * FROM {dm_threads} WHERE a_id=? AND b_id=?', [$x, $y]);
    }

    private static function readCol(array $th, $uid)
    {
        return (int)$th['a_id'] === (int)$uid ? 'a_read' : 'b_read';
    }

    public static function unreadCount(Db $db, $uid)
    {
        return (int)$db->val('SELECT COUNT(*) FROM {dm_threads} WHERE (a_id=? AND last_id>a_read AND last_id>0 AND (SELECT from_id FROM {dm_messages} WHERE id=last_id)<>?)'
            . ' OR (b_id=? AND last_id>b_read AND last_id>0 AND (SELECT from_id FROM {dm_messages} WHERE id=last_id)<>?)', [(int)$uid, (int)$uid, (int)$uid, (int)$uid]);
    }

    public static function presentMsg(array $m)
    {
        $o = ['id' => 'dmm' . (int)$m['id'], 'f' => Ids::u($m['from_id']), 'x' => $m['x'], 't' => (int)$m['t']];
        if ((int)$m['flagged']) {
            $o['flag'] = true;
        }
        if (!empty($m['listing_id'])) {
            $o['l'] = Ids::l($m['listing_id']);
        }
        return $o;
    }

    /** Konuşma (msgs: verilen iletiler); read[ben] = okuduğum son iletinin zamanı (okunmamışsa 0) */
    public static function presentThread(array $th, $uid, array $msgs, $lastMsg = null)
    {
        $mine = self::readCol($th, $uid);
        $un = $lastMsg && (int)$th['last_id'] > (int)$th[$mine] && (int)$lastMsg['from_id'] !== (int)$uid;
        return ['id' => 'dm' . (int)$th['id'], 'a' => Ids::u($th['a_id']), 'b' => Ids::u($th['b_id']),
            'msgs' => array_map([__CLASS__, 'presentMsg'], $msgs),
            'read' => [Ids::u($uid) => $un ? 0 : (int)$th['last_at']], 'un' => (bool)$un, 'last' => (int)$th['last_at']];
    }

    /** GET dm: konuşmalar (son iletiyle), en yeni üstte */
    public static function inbox(Db $db, array $me, $limit = 100)
    {
        $uid = (int)$me['id'];
        $rows = $db->all('SELECT * FROM {dm_threads} WHERE (a_id=? OR b_id=?) AND last_id>0 ORDER BY last_at DESC, id DESC LIMIT ' . (int)$limit, [$uid, $uid]);
        $ids = array_map(function ($t) {
            return (int)$t['last_id'];
        }, $rows);
        $last = [];
        if ($ids) {
            foreach ($db->all('SELECT * FROM {dm_messages} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) as $m) {
                $last[(int)$m['id']] = $m;
            }
        }
        $peers = [];
        $out = [];
        foreach ($rows as $t) {
            $m = isset($last[(int)$t['last_id']]) ? $last[(int)$t['last_id']] : null;
            $out[] = self::presentThread($t, $uid, $m ? [$m] : [], $m);
            $peers[] = (int)$t['a_id'] === $uid ? (int)$t['b_id'] : (int)$t['a_id'];
        }
        return [$out, $peers];
    }

    /** GET dm/{peer}: iletiler (after: yalnız bu no'dan sonrakiler). Okundu işaretlenir. */
    public static function conversation(Db $db, array $me, array $peer, $after = 0)
    {
        $th = self::thread($db, $me['id'], $peer['id']);
        if (!$th) {
            return null;
        }
        $rows = array_reverse($db->all('SELECT * FROM {dm_messages} WHERE thread_id=? AND id>? ORDER BY id DESC LIMIT 200', [(int)$th['id'], (int)$after]));
        $col = self::readCol($th, $me['id']);
        if ((int)$th['last_id'] > (int)$th[$col]) {
            $db->exec('UPDATE {dm_threads} SET ' . $col . '=? WHERE id=? AND ' . $col . '<?', [(int)$th['last_id'], (int)$th['id'], (int)$th['last_id']]);
            $th[$col] = $th['last_id'];
        }
        return self::presentThread($th, $me['id'], $rows, null);
    }

    /** POST dm/{peer}: dönüş ['msg' => satır, 'thread' => satır, 'flagged' => bool] */
    public static function send(Db $db, array $me, array $peer, $x, $listing = null)
    {
        $x = trim((string)$x);
        if ($x === '') {
            throw HttpError::validation(['x' => 'Mesajınızı yazın.']);
        }
        if (yp_strlen($x) > 1000) {
            throw HttpError::validation(['x' => 'Mesaj en fazla 1000 karakter olabilir.']);
        }
        if ($peer['status'] !== 'active') {
            throw HttpError::conflict('Bu üye şu an mesaj alamıyor.');
        }
        $uid = (int)$me['id'];
        RateLimit::enforce('dm_min:' . $uid, self::PER_MIN, 60, true, 'Çok hızlı mesaj gönderiyorsunuz. Lütfen biraz bekleyin.');
        RateLimit::enforce('dm_day:' . $uid, self::PER_DAY, 86400, true, 'Bugünkü mesaj sınırına ulaştınız. Yarın tekrar deneyin.');
        $lid = null;
        if ($listing !== null && $listing !== '') {
            $l = $db->one('SELECT id, seller_id FROM {listings} WHERE id=?', [Ids::listing($listing)]);
            $lid = $l && ((int)$l['seller_id'] === (int)$peer['id'] || (int)$l['seller_id'] === $uid) ? (int)$l['id'] : null;
        }
        $c = Censor::apply($x);
        $existing = self::thread($db, $uid, $peer['id']);
        if (!$existing) {
            RateLimit::enforce('dm_new:' . $uid, self::NEW_PER_HOUR, 3600, true, 'Bir saat içinde çok fazla yeni konuşma başlattınız. Lütfen daha sonra tekrar deneyin.');
        }
        $res = $db->tx(function (Db $db) use ($uid, $peer, $c, $lid) {
            $a = min($uid, (int)$peer['id']);
            $b = max($uid, (int)$peer['id']);
            $now = yp_now_ms();
            $db->insertIgnore('dm_threads', ['a_id' => $a, 'b_id' => $b, 'last_id' => 0, 'last_at' => 0, 'a_read' => 0, 'b_read' => 0, 'created_at' => $now]);
            $th = $db->one('SELECT * FROM {dm_threads} WHERE a_id=? AND b_id=?' . $db->forUpdate(), [$a, $b]);
            $mid = $db->insert('dm_messages', ['thread_id' => (int)$th['id'], 'from_id' => $uid, 'x' => $c['text'], 'flagged' => $c['flagged'] ? 1 : 0,
                'listing_id' => $lid, 't' => $now]);
            $col = (int)$th['a_id'] === $uid ? 'a_read' : 'b_read';
            $db->exec('UPDATE {dm_threads} SET last_id=?, last_at=?, ' . $col . '=? WHERE id=?', [$mid, $now, $mid, (int)$th['id']]);
            $first = (int)$db->val('SELECT COUNT(*) FROM {dm_messages} WHERE thread_id=? AND from_id=?', [(int)$th['id'], $uid]) === 1;
            return ['mid' => $mid, 'tid' => (int)$th['id'], 'first' => $first];
        });
        if ($c['flagged']) {
            Censor::log($db, $uid, 'Mesaj → ' . $peer['name'], $x);
        }
        if ($res['first']) {
            Notify::send($db, $peer['id'], $me['name'] . ' size mesaj gönderdi.', '#mesajlar-' . Ids::u($uid), 'message', ['gonderen' => $me['name']]);
        }
        return [
            'msg' => $db->one('SELECT * FROM {dm_messages} WHERE id=?', [$res['mid']]),
            'thread' => $db->one('SELECT * FROM {dm_threads} WHERE id=?', [$res['tid']]),
            'flagged' => $c['flagged'],
        ];
    }
}
