<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Catalog;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Notify;
use YP\Perm;
use YP\Text;

/**
 * Cüzdan işlemleri: puan → kredi (pts), yönetici bakiye düzeltmesi (baladd, [bakiye]), ilan dopingleri (dope / sell).
 * Her yöntem bir Db::tx içinde çağrılmalıdır.
 */
final class Wallet
{
    /** Puan dönüşümü: 100'ün katı, en az 500 puan. Kredi (yalnız alışveriş) olarak yüklenir. Dönüş: [puan, kuruş] */
    public static function convertPoints(Db $db, array $u, $raw)
    {
        $p = is_numeric($raw) ? (int)floor(((float)$raw) / 100) * 100 : 0;
        if ($p < 500) {
            throw HttpError::validation(['pts' => 'En az 500 puan çevrilebilir.']);
        }
        $k = Rules::pointsToKurus($p, Rules::site($db)['ptRate']);
        if ($k <= 0) {
            throw HttpError::validation(['pts' => 'Puan dönüşüm oranı geçersiz.']);
        }
        if ($db->exec('UPDATE {users} SET pts=pts-? WHERE id=? AND pts>=?', [$p, (int)$u['id'], $p]) !== 1) {
            throw HttpError::validation(['pts' => 'Yeterli puanınız yok.']);
        }
        $now = yp_now_ms();
        $db->insert('points_log', ['user_id' => (int)$u['id'], 'delta' => -$p, 'reason' => 'donusum', 'ref' => '', 't' => $now]);
        Ledger::post($db, 'bonus', ['ref_type' => 'points', 'ref_id' => (string)$p, 'user' => $u['id'], 'amount' => $k, 'actor' => $u['id'],
            'meta' => ['m' => 'Puan dönüşümü', 'src' => 'puan', 'pts' => $p]], [
            ['EXP:points', -$k],
            [Ledger::credit($u['id']), $k, Rules::num($p) . ' puan bakiyeye çevrildi · sadece alışveriş'],
        ]);
        return [$p, $k];
    }

    /** baladd: üye adı / telefon / u12 */
    public static function findMember(Db $db, $q)
    {
        $q = trim(is_scalar($q) ? (string)$q : '');
        if ($q === '') {
            return null;
        }
        if (preg_match('/^u[1-9][0-9]*$/', $q)) {
            $u = $db->one('SELECT * FROM {users} WHERE id=?', [Ids::user($q)]);
        } else {
            $u = $db->one('SELECT * FROM {users} WHERE name_norm=?', [Text::fold($q)]);
            $d = preg_replace('/\D/', '', $q);
            if (!$u && strlen($d) >= 10) {
                $tail = substr($d, -10);
                foreach ($db->all("SELECT * FROM {users} WHERE tel LIKE ? ORDER BY id LIMIT 50", ['%' . substr($tail, -2)]) as $c) {
                    if (substr(preg_replace('/\D/', '', $c['tel']), -10) === $tail) {
                        $u = $c;
                        break;
                    }
                }
            }
        }
        return $u && $u['role'] !== 'admin' ? $u : null;
    }

    /** Yönetici düzeltmesi: ADJ ↔ üye nakit/kredi. $w: çekilebilir (cash) mı; $neg: düş */
    public static function adjust(Db $db, array $staff, array $target, $amount, $w, $neg, $note)
    {
        $note = trim((string)$note);
        if (mb_strlen($note, 'UTF-8') < 3) {
            throw HttpError::validation(['note' => 'Gerekçe yazın (en az 3 karakter).']);
        }
        if ($amount <= 0 || $amount > 1000000000) {
            throw HttpError::validation(['amount' => 'Geçerli bir tutar girin.']);
        }
        $uid = (int)$target['id'];
        $wl = Ledger::lockWallets($db, [$uid])[$uid];
        if ($neg && $wl[$w ? 'cash' : 'credit'] < $amount) {
            throw HttpError::validation(['amount' => ($w ? 'Çekilebilir bakiyesi ' : 'Çekilemez bakiyesi ') . Rules::tl($wl[$w ? 'cash' : 'credit']) . '.']);
        }
        $v = $neg ? -$amount : $amount;
        $acc = $w ? Ledger::cash($uid) : Ledger::credit($uid);
        $jid = Ledger::post($db, 'duzeltme', ['ref_type' => 'user', 'ref_id' => Ids::u($uid), 'user' => $uid, 'amount' => $v, 'actor' => $staff['id'],
            'memo' => yp_str($note, 255), 'meta' => ['w' => (bool)$w, 'm' => yp_str($note, 200) . ' · ' . $staff['name']]], [
            ['ADJ', -$v],
            [$acc, $v, yp_str($note, 200) . ' · ' . ($w ? 'çekilebilir' : 'sadece alışveriş')],
        ]);
        Audit::log($db, $staff['id'], 'balance_adjust', 'user', Ids::u($uid), ['amount' => $v, 'bucket' => $w ? 'cash' : 'credit', 'note' => $note, 'journal' => $jid]);
        Notify::send($db, $uid, 'Hesabınıza ' . ($neg ? '−' : '+') . Rules::tl($amount) . ' ' . ($w ? 'çekilebilir' : 'alışveriş') . ' bakiye ' . ($neg ? 'düşüldü' : 'eklendi') . ': ' . $note, '#hesabim');
        return $jid;
    }

    /* ---------------- dopingler ---------------- */

    /** Girdi {vitrin:3, acil:1} ya da ['vitrin',…] (+days) → [k => gün] (geçerli anahtarlar, izinli gün sayıları) */
    public static function dopSpec(Db $db, $raw, $daysRaw = null)
    {
        if ($raw === null || $raw === '' || $raw === [] || $raw === false) {
            return [];
        }
        $D = Rules::dopings($db);
        $spec = [];
        if (is_array($raw) && array_keys($raw) === range(0, count($raw) - 1)) {
            foreach ($raw as $k) {
                $spec[(string)$k] = is_array($daysRaw) && isset($daysRaw[$k]) ? $daysRaw[$k] : 1;
            }
        } elseif (is_array($raw)) {
            $spec = $raw;
        } elseif (is_string($raw)) {
            $spec = [$raw => $daysRaw === null ? 1 : $daysRaw];
        }
        $out = [];
        foreach ($spec as $k => $days) {
            $k = (string)$k;
            if (!isset($D[$k])) {
                throw HttpError::validation(['dop' => 'Geçersiz doping.']);
            }
            if ($k === 'ust') {
                $out[$k] = 0;
                continue;
            }
            $n = is_numeric($days) ? (int)$days : 0;
            if (!in_array($n, Rules::dopDays($D[$k]), true)) {
                throw HttpError::validation(['dop' => $D[$k]['name'] . ' için gün sayısını listeden seçin.']);
            }
            $out[$k] = $n;
        }
        return $out;
    }

    public static function dopTotal(Db $db, array $spec)
    {
        $D = Rules::dopings($db);
        $t = 0;
        foreach ($spec as $k => $days) {
            $t += Rules::dopCost($k, $D[$k], $days);
        }
        return $t;
    }

    /**
     * Dopingleri uygular (ilan satırı kilitli olmalı) ve ücretini bakiyeden alır (REV:doping). [reklam] yetkilisi ücretsiz.
     * $context: 'sell' (ilan verirken) | 'dope'. Dönüş: [ücret kuruş, metin]
     */
    public static function applyDopings(Db $db, array $u, array $l, array $spec, $context)
    {
        if (!$spec) {
            return [0, ''];
        }
        if ((int)$l['seller_id'] !== (int)$u['id']) {
            throw HttpError::forbidden('Bu ilan size ait değil.');
        }
        if (!in_array($l['status'], ['aktif', 'beklemede'], true)) {
            throw HttpError::conflict('Doping yalnız yayındaki ya da onay bekleyen ilanlara uygulanabilir.');
        }
        $D = Rules::dopings($db);
        $now = yp_now_ms();
        $cost = self::dopTotal($db, $spec);
        $free = Perm::has($u, 'reklam');
        $names = [];
        $set = ['updated_at' => $now];
        foreach ($spec as $k => $days) {
            $names[] = $D[$k]['name'] . ($k === 'ust' ? '' : ' ' . $days . ' gün');
            if ($k === 'ust') {
                $set['bump_at'] = $now;
            } elseif (in_array($k, ['vitrin', 'acil', 'renk'], true)) {
                $col = 'dop_' . $k;
                $set[$col] = max((int)$l[$col], $now) + $days * Rules::D;
            }
        }
        $txt = implode(', ', $names);
        if ($cost > 0 && !$free) {
            $w = Ledger::lockWallets($db, [$u['id']])[(int)$u['id']];
            $split = Rules::split($w['cash'], $w['credit'], $cost);
            if ($split === null) {
                throw new HttpError(409, $context === 'sell' ? 'Doping için bakiyeniz yetersiz. Dopingleri kaldırın veya bakiye yükleyin.' : 'Bakiye yetersiz. Önce bakiye yükleyin.', 'insufficient',
                    ['need' => Text::tl($cost - $w['cash'] - $w['credit'])]);
            }
            $lbl = ($context === 'sell' ? 'İlan dopingi: ' : 'Doping: ') . $txt . ' (#' . (int)$l['no'] . ')';
            Ledger::post($db, 'doping', ['ref_type' => 'listing', 'ref_id' => Ids::l($l['id']), 'user' => $u['id'], 'amount' => $cost, 'actor' => $u['id'],
                'meta' => ['m' => $txt, 'ref' => '#' . (int)$l['no'], 'dop' => $spec]], [
                [Ledger::cash($u['id']), -$split[0], $lbl],
                [Ledger::credit($u['id']), -$split[1], $lbl],
                ['REV:doping', $cost],
            ]);
        } elseif ($free && $cost > 0) {
            Audit::log($db, $u['id'], 'doping_free', 'listing', Ids::l($l['id']), ['dop' => $spec, 'cost' => $cost]);
            $cost = 0;
        }
        $db->update('listings', $set, 'id=?', [(int)$l['id']]);
        return [$cost, $txt];
    }

    /** PUT admin/dopings (dopset): {k:{desc, p, max}} — vitrin/acil/renk için p günlük fiyattır (pd), 7 günlük p = pd×7 */
    public static function setDopings(Db $db, array $staff, $in)
    {
        if (!is_array($in)) {
            throw HttpError::validation(['dopings' => 'Doping listesi geçersiz.']);
        }
        $D = Rules::dopings($db);
        foreach ($D as $k => &$d) {
            if (!isset($in[$k]) || !is_array($in[$k])) {
                continue;
            }
            $x = $in[$k];
            if (isset($x['desc']) && is_string($x['desc']) && trim($x['desc']) !== '') {
                $d['desc'] = yp_str(trim($x['desc']), 200);
            }
            if (isset($x['name']) && is_string($x['name']) && trim($x['name']) !== '') {
                $d['name'] = yp_str(trim($x['name']), 40);
            }
            $p = isset($x['p']) ? Text::kurus($x['p']) : null;
            if ($p !== null) {
                $p = max(0, min(10000000, $p));
                if ($k === 'ust') {
                    $d['p'] = $p / 100;
                } else {
                    $d['pd'] = $p / 100;
                    $d['p'] = round($p * 7 / 100, 2);
                }
            }
            if ($k !== 'ust' && isset($x['max']) && is_numeric($x['max'])) {
                $d['max'] = max(1, min(30, (int)$x['max']));
            }
        }
        unset($d);
        \YP\Settings::set('dopings', $D, $staff['id'], $db);
        Audit::log($db, $staff['id'], 'dopings_set', 'settings', 'dopings', ['dopings' => $D]);
        return $D;
    }

    /** İlan satırı (kilitli) */
    public static function listingForDope(Db $db, $ref)
    {
        return Catalog::listingRow($db, $ref, true);
    }
}
