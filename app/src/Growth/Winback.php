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
use YP\Outbox;
use YP\Perm;
use YP\Settings;
use YP\Text;

/**
 * Geri kazanım kampanyası (winback, [uye]): hareketsiz üyelere site bildirimi, e-posta ve/veya WhatsApp (iç kanal adı 'sms';
 * yalnız Meta'da ayrı bir PAZARLAMA şablonu ayarlıysa — bildirim/Utility şablonu kampanya için kullanılamaz); isteğe bağlı kupon ve
 * hediye bakiye (hediye için ayrıca [bakiye] gerekir, kredi = yalnız alışveriş).
 *   - E-posta/WhatsApp outbox'a düşük öncelikle (8) yazılır ve HEMEN gönderilmez: cron tik başına saatlik_sınır/12, son 60 dakikada
 *     saatlik sınırı aşmadan gönderir (Outbox::tick). Böylece toplu kampanya OTP ve sipariş iletilerinin önüne geçmez.
 *   - Üyenin kampanya iletisi tercihi (mkt_optout) uygulanır: kapattığı kanaldan gönderilmez (site bildirimi yine düşer).
 */
final class Winback
{
    const PRIO = 8;
    const MAX_IDS = 500;

    /** Hareketsiz üyeler: son giriş / kayıt / defter hareketi kesimden eski */
    public static function inactive(Db $db, $days, $limit = 300)
    {
        $cut = yp_now_ms() - max(1, (int)$days) * Ads::D;
        $rows = $db->all("SELECT u.id, u.name, u.ad, u.soyad, u.email, u.tel, u.last_seen, u.created_at,
                (SELECT MAX(j.t) FROM {journal} j WHERE j.user_id=u.id) AS jt,
                (SELECT COALESCE(SUM(d.amount),0) FROM {deposits} d WHERE d.user_id=u.id AND d.status='onaylandı') AS dep,
                w.cash, w.credit, o.mail AS om, o.sms AS os
            FROM {users} u LEFT JOIN {wallets} w ON w.user_id=u.id LEFT JOIN {mkt_optout} o ON o.user_id=u.id
            WHERE u.role='member' AND u.status='active' AND u.last_seen<? AND u.created_at<? ORDER BY u.last_seen, u.id LIMIT " . (int)($limit * 2), [$cut, $cut]);
        $out = [];
        foreach ($rows as $r) {
            $la = max((int)$r['last_seen'], (int)$r['jt'], (int)$r['created_at']);
            if ($la >= $cut) {
                continue;
            }
            $out[] = ['id' => Ids::u($r['id']), 'name' => $r['name'], 'ad' => $r['ad'], 'soyad' => $r['soyad'], 'tel' => Text::maskTel($r['tel']), 'hasMail' => (bool)$r['email'],
                'hasTel' => (string)$r['tel'] !== '', 'last' => $la, 'dep' => Text::tl($r['dep']), 'bal' => Text::tl((int)$r['cash'] + (int)$r['credit']),
                'optMail' => (bool)(int)$r['om'], 'optSms' => (bool)(int)$r['os']];
            if (count($out) >= $limit) {
                break;
            }
        }
        usort($out, function ($a, $b) {
            return $a['last'] <=> $b['last'];
        });
        return $out;
    }

    public static function history(Db $db, $limit = 10)
    {
        return array_map(function ($w) use ($db) {
            $ids = json_decode((string)$w['user_ids'], true) ?: [];
            $back = $ids ? (int)$db->val('SELECT COUNT(*) FROM {users} WHERE id IN (' . implode(',', array_map('intval', $ids)) . ') AND last_seen>?', [(int)$w['t'] + 60000]) : 0;
            return ['id' => 'wb' . (int)$w['id'], 't' => (int)$w['t'], 'n' => (int)$w['n'], 'code' => $w['coupon_code'], 'gift' => Text::tl($w['gift']), 'mail' => (int)$w['mail_q'],
                'sms' => (int)$w['sms_q'], 'skipped' => (int)$w['skipped'], 'back' => $back, 'days' => (int)$w['days']];
        }, $db->all('SELECT * FROM {winback} ORDER BY id DESC LIMIT ' . (int)$limit));
    }

    /** POST admin/winback: {ids:['u3',…], tpl, coupon, pct, gift, mail, sms, ntf, days} */
    public static function send(Db $db, array $staff, array $in)
    {
        $days = isset($in['days']) && is_numeric($in['days']) ? max(1, min(3650, (int)$in['days'])) : 30;
        $ids = isset($in['ids']) && is_array($in['ids']) ? array_values(array_unique(array_map('strval', $in['ids']))) : [];
        if (!$ids) {
            throw HttpError::validation(['ids' => 'En az bir üye seçin.']);
        }
        if (count($ids) > self::MAX_IDS) {
            throw HttpError::validation(['ids' => 'Bir kampanyada en fazla ' . self::MAX_IDS . ' üye seçilebilir.']);
        }
        $tpl = isset($in['tpl']) && is_string($in['tpl']) ? trim($in['tpl']) : '';
        if (mb_strlen($tpl, 'UTF-8') < 3 || mb_strlen($tpl, 'UTF-8') > 500) {
            throw HttpError::validation(['tpl' => 'Mesaj yazın (3–500 karakter).']);
        }
        $mail = !empty($in['mail']) && $in['mail'] !== 'false';
        $sms = !empty($in['sms']) && $in['sms'] !== 'false';
        $ntf = !isset($in['ntf']) || (!empty($in['ntf']) && $in['ntf'] !== 'false');
        if (!$mail && !$sms && !$ntf) {
            throw HttpError::validation(['ch' => 'En az bir kanal seçin (bildirim, e-posta ya da WhatsApp).']);
        }
        $gift = isset($in['gift']) && $in['gift'] !== '' && $in['gift'] !== null ? Text::kurus($in['gift']) : 0;
        if ($gift === null || $gift < 0 || $gift > 100000) {
            throw HttpError::validation(['gift' => 'Hediye 0–1.000 TL olmalı.']);
        }
        if ($gift > 0 && !Perm::has($staff, 'bakiye')) {
            throw HttpError::forbidden('Hediye bakiye vermek için “Üye bakiyesi ekleme / düşme” yetkisi gerekir.');
        }
        $code = isset($in['coupon']) && is_string($in['coupon']) ? strtoupper(trim($in['coupon'])) : '';
        if ($code !== '' && !preg_match('/^[A-Z0-9_\-]{3,30}$/', $code)) {
            throw HttpError::validation(['coupon' => 'Kupon kodu 3–30 harf/rakam olmalı.']);
        }
        $mailCfg = Settings::get('mail', $db);
        $smsCfg = Settings::get('sms', $db);
        if ($mail && empty($mailCfg['on'])) {
            throw HttpError::validation(['mail' => 'E-posta gönderimi kapalı (Yönetim › E-posta & WhatsApp).']);
        }
        if ($sms && empty($smsCfg['on'])) {
            throw HttpError::validation(['sms' => 'WhatsApp gönderimi kapalı (Yönetim › E-posta & WhatsApp).']);
        }
        if ($sms && !\YP\Sms\Sms::canSend($smsCfg, 'winback')) {
            throw HttpError::validation(['sms' => 'Kampanya iletisi WhatsApp\'tan yalnız Meta\'da onaylı bir pazarlama şablonuyla gönderilebilir (Yönetim › E-posta & WhatsApp › WhatsApp › Kampanya şablonu). Şimdilik e-posta seçin.']);
        }
        // seçilenler hâlâ hareketsiz üye mi?
        $ok = [];
        foreach (self::inactive($db, $days, 5000) as $x) {
            $ok[$x['id']] = 1;
        }
        $uids = [];
        foreach ($ids as $id) {
            if (!isset($ok[$id])) {
                throw HttpError::validation(['ids' => $id . ' hareketsiz üye listesinde değil.']);
            }
            $uids[] = Ids::user($id);
        }
        $now = yp_now_ms();
        if ($code !== '' && !$db->val('SELECT id FROM {coupons} WHERE code=?', [$code])) {
            $pct = isset($in['pct']) && is_numeric($in['pct']) ? max(1, min(100, (float)$in['pct'])) : 10;
            $db->insert('coupons', ['code' => $code, 'pct_bp' => (int)round($pct * 100), 'max' => 10000, 'is_on' => 1, 'uses' => 0, 'created_by' => (int)$staff['id'], 'created_at' => $now]);
        }
        $site = Settings::get('site', $db);
        $sn = isset($site['siteName']) ? $site['siteName'] : 'yangpazar.com';
        $fresh = Outbox::$fresh;
        $mq = $sq = $skip = 0;
        foreach ($uids as $uid) {
            $u = $db->one('SELECT u.id, u.name, u.ad, u.email, u.tel, o.mail AS om, o.sms AS os FROM {users} u LEFT JOIN {mkt_optout} o ON o.user_id=u.id WHERE u.id=?', [$uid]);
            $msg = str_replace(['{ad}', '{kupon}'], [$u['ad'] !== '' ? $u['ad'] : $u['name'], $code], $tpl);
            if ($ntf) {
                Notify::send($db, $uid, $msg, '#hesabim');
            }
            if ($mail) {
                if ((int)$u['om']) {
                    $skip++;
                } elseif ($u['email']) {
                    Outbox::queue($db, 'mail', $uid, $u['email'], 'winback', $sn . ' · Seni özledik', $msg . "\n\n" . $sn . " ekibi\n\nKampanya e-postalarını Hesabım › Profil ve güvenlik bölümünden kapatabilirsiniz.", self::PRIO);
                    $mq++;
                }
            }
            if ($sms) {
                if ((int)$u['os']) {
                    $skip++;
                } elseif ($u['tel'] !== '') {
                    Outbox::queue($db, 'sms', $uid, $u['tel'], 'winback', '', $sn . ': ' . $msg, self::PRIO);
                    $sq++;
                }
            }
            if ($gift > 0) {
                Ledger::post($db, 'bonus', ['ref_type' => 'winback', 'ref_id' => (string)$now, 'user' => $uid, 'amount' => $gift, 'actor' => $staff['id'],
                    'meta' => ['m' => 'Geri kazanım kampanyası', 'src' => 'winback']], [
                    ['EXP:bonus', -$gift],
                    [Ledger::credit($uid), $gift, 'Geri dönüş hediyesi · sadece alışveriş'],
                ]);
            }
        }
        Outbox::$fresh = $fresh; // kampanya iletileri yanıt sonrası hemen değil, cron'un saatlik bütçesiyle gider
        $id = $db->insert('winback', ['t' => $now, 'by_id' => (int)$staff['id'], 'tpl' => $tpl, 'user_ids' => json_encode($uids), 'n' => count($uids), 'coupon_code' => $code,
            'gift' => $gift, 'ch_mail' => $mail ? 1 : 0, 'ch_sms' => $sms ? 1 : 0, 'ch_ntf' => $ntf ? 1 : 0, 'mail_q' => $mq, 'sms_q' => $sq, 'skipped' => $skip, 'days' => $days]);
        Settings::set('winback', ['msg' => $tpl], $staff['id'], $db);
        Audit::log($db, $staff['id'], 'winback_send', 'winback', 'wb' . $id, ['n' => count($uids), 'mail' => $mq, 'sms' => $sq, 'skipped' => $skip, 'gift' => $gift, 'coupon' => $code]);
        return ['id' => 'wb' . $id, 'n' => count($uids), 'mail' => $mq, 'sms' => $sq, 'skipped' => $skip, 'gift' => Text::tl($gift), 'coupon' => $code,
            'hourly' => ['mail' => (int)($mailCfg['hourly'] ?: 80), 'sms' => (int)($smsCfg['hourly'] ?: 60)]];
    }

    /** PUT me/marketing: {mail:bool, sms:bool} — true: kampanya iletisi almak istiyor */
    public static function setPrefs(Db $db, $uid, array $in)
    {
        $cur = $db->one('SELECT mail, sms FROM {mkt_optout} WHERE user_id=?', [(int)$uid]) ?: ['mail' => 0, 'sms' => 0];
        $row = ['user_id' => (int)$uid, 'mail' => (int)$cur['mail'], 'sms' => (int)$cur['sms'], 't' => yp_now_ms()];
        foreach (['mail', 'sms'] as $k) {
            if (array_key_exists($k, $in)) {
                $row[$k] = \YP\Money\Api::bool($in[$k]) ? 0 : 1;
            }
        }
        $db->upsert('mkt_optout', $row, ['user_id']);
        Audit::log($db, $uid, 'marketing_prefs', 'user', Ids::u($uid), ['mail' => !$row['mail'], 'sms' => !$row['sms']]);
        return self::prefs($db, $uid);
    }

    public static function prefs(Db $db, $uid)
    {
        $r = $db->one('SELECT mail, sms FROM {mkt_optout} WHERE user_id=?', [(int)$uid]);
        return ['mail' => !$r || !(int)$r['mail'], 'sms' => !$r || !(int)$r['sms']];
    }
}
