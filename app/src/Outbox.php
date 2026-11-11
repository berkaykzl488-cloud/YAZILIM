<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Sms\Sms;

/**
 * Giden e-posta/SMS kuyruğu (outbox tablosu).
 * - Doğrulama kodları (priority 0) istek anında hemen gönderilir ve saatlik bütçeye takılmaz.
 * - Diğerleri cron ile gönderilir: tik başına en fazla saatlik_sınır/12 ve son 60 dakikada saatlik sınırı aşmadan.
 * - Hata: 5 denemeye kadar artan bekleme (1, 2, 4, 8 dk), sonra 'failed'.
 */
final class Outbox
{
    const PRIO_OTP = 0;
    const PRIO_NORMAL = 5;
    const MAX_TRIES = 5;

    /** Bu istekte kuyruğa giren olağan iletiler; yanıt gönderildikten sonra hemen denenir (Kernel::afterResponse). */
    public static $fresh = [];

    public static function queue(Db $db, $channel, $userId, $to, $ev, $subject, $body, $priority = self::PRIO_NORMAL)
    {
        $now = yp_now_ms();
        $id = $db->insert('outbox', [
            'channel' => $channel, 'user_id' => $userId, 'to_addr' => yp_str($to, 190), 'ev' => yp_str($ev, 40),
            'subject' => yp_str($subject, 255), 'body' => (string)$body, 'priority' => (int)$priority,
            'status' => 'queued', 'tries' => 0, 'next_at' => $now, 'created_at' => $now,
        ]);
        if ((int)$priority !== self::PRIO_OTP && count(self::$fresh) < 20) {
            self::$fresh[] = (int)$id;
        }
        return $id;
    }

    /**
     * Bu istekte kuyruğa giren olağan iletileri saatlik bütçe izin verdiği ölçüde hemen gönderir
     * (hoş geldin, bildirim…). Gönderilemeyenler kuyrukta kalır, cron sonra dener.
     */
    public static function flushFresh(Db $db)
    {
        $ids = self::$fresh;
        self::$fresh = [];
        if (!$ids) {
            return 0;
        }
        $hourly = [
            'mail' => (int)(Settings::get('mail', $db)['hourly'] ?: 80),
            'sms'  => (int)(Settings::get('sms', $db)['hourly'] ?: 60),
        ];
        $sent = 0;
        foreach ($ids as $id) {
            $row = $db->one("SELECT * FROM {outbox} WHERE id=? AND status='queued'", [$id]);
            if (!$row || !isset($hourly[$row['channel']])) {
                continue;
            }
            if (self::sentLastHour($db, $row['channel']) >= max(1, $hourly[$row['channel']])) {
                continue;
            }
            if (self::sendRow($db, $row)) {
                $sent++;
            }
        }
        return $sent;
    }

    /** Tek satırı gönderir (önce 'sending' olarak sahiplenir). Dönüş: true = gönderildi */
    public static function sendRow(Db $db, array $row, $mailer = null, $sms = null)
    {
        $now = yp_now_ms();
        $claimed = $db->exec("UPDATE {outbox} SET status='sending', tries=tries+1 WHERE id=? AND status='queued'", [(int)$row['id']]);
        if (!$claimed) {
            return false;
        }
        try {
            if ($row['channel'] === 'mail') {
                $mailer = $mailer ?: Mailer::fromSettings(Settings::get('mail', $db));
                $r = $mailer->send($row['to_addr'], $row['subject'], $row['body']);
            } else {
                $p = $sms ?: Sms::fromSettings(Settings::get('sms', $db));
                $to = Sms::normalize($row['to_addr']);
                if (!$p) {
                    $r = ['ok' => false, 'error' => 'SMS sağlayıcısı ayarlanmamış.', 'retry' => true, 'id' => null, 'provider' => null];
                } elseif ($to === '') {
                    $r = ['ok' => false, 'error' => 'Telefon numarası geçersiz.', 'retry' => false, 'id' => null, 'provider' => $p->name()];
                } else {
                    $r = $p->send($to, $row['body']);
                    $r['provider'] = $p->name();
                }
            }
        } catch (\Throwable $e) {
            $r = ['ok' => false, 'error' => 'Gönderim hatası: ' . yp_str($e->getMessage(), 150), 'retry' => true, 'id' => null, 'provider' => null];
        }
        $tries = (int)$row['tries'] + 1;
        if ($r['ok']) {
            $db->update('outbox', ['status' => 'sent', 'sent_at' => yp_now_ms(), 'provider' => isset($r['provider']) ? $r['provider'] : null,
                'provider_id' => $r['id'] !== null ? yp_str($r['id'], 120) : null, 'last_error' => null], 'id=?', [(int)$row['id']]);
            return true;
        }
        $final = empty($r['retry']) || $tries >= self::MAX_TRIES || (int)$row['priority'] === self::PRIO_OTP && $tries >= 3;
        $db->update('outbox', [
            'status' => $final ? 'failed' : 'queued',
            'next_at' => $now + 60000 * (1 << min(4, $tries - 1)),
            'last_error' => yp_str($r['error'], 255),
            'provider' => isset($r['provider']) ? $r['provider'] : null,
        ], 'id=?', [(int)$row['id']]);
        return false;
    }

    public static function sendNow(Db $db, $id)
    {
        $row = $db->one('SELECT * FROM {outbox} WHERE id=?', [(int)$id]);
        return $row ? self::sendRow($db, $row) : false;
    }

    /** Son 60 dakikada gönderilen sayı */
    public static function sentLastHour(Db $db, $channel, $now = null)
    {
        $now = $now ?: yp_now_ms();
        return (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE channel=? AND status='sent' AND sent_at>?", [$channel, $now - 3600000]);
    }

    /** Bu tikte gönderilebilecek olağan ileti sayısı */
    public static function budget(Db $db, $channel, $hourly, $now = null)
    {
        $hourly = max(1, (int)$hourly);
        $perTick = max(1, intdiv($hourly, 12));
        return max(0, min($perTick, $hourly - self::sentLastHour($db, $channel, $now)));
    }

    /**
     * Cron tiki. $deadline: microtime(true) sınırı. Dönüş: ['mail'=>n, 'sms'=>n, 'otp'=>n, 'failed'=>n]
     */
    public static function tick(Db $db, $mailer = null, $sms = null, $deadline = null)
    {
        $deadline = $deadline ?: microtime(true) + 40;
        $now = yp_now_ms();
        $stats = ['mail' => 0, 'sms' => 0, 'otp' => 0, 'failed' => 0];
        // takılı kalan 'sending' satırlarını (çöken istek) 10 dk sonra kuyruğa geri al
        $db->exec("UPDATE {outbox} SET status='queued' WHERE status='sending' AND next_at<?", [$now - 600000]);
        // 1) doğrulama kodları: bütçeden bağımsız
        foreach ($db->all("SELECT * FROM {outbox} WHERE status='queued' AND priority=0 AND next_at<=? ORDER BY id LIMIT 50", [$now]) as $row) {
            if (microtime(true) > $deadline) {
                return $stats;
            }
            self::sendRow($db, $row, $row['channel'] === 'mail' ? $mailer : null, $row['channel'] === 'sms' ? $sms : null) ? $stats['otp']++ : $stats['failed']++;
        }
        // 2) olağan iletiler: kanal başına saatlik bütçe
        $limits = [
            'mail' => (int)(Settings::get('mail', $db)['hourly'] ?: 80),
            'sms'  => (int)(Settings::get('sms', $db)['hourly'] ?: 60),
        ];
        foreach ($limits as $ch => $hourly) {
            $n = self::budget($db, $ch, $hourly, $now);
            if ($n <= 0) {
                continue;
            }
            $rows = $db->all("SELECT * FROM {outbox} WHERE status='queued' AND channel=? AND priority>0 AND next_at<=? ORDER BY priority, id LIMIT " . (int)$n, [$ch, $now]);
            foreach ($rows as $row) {
                if (microtime(true) > $deadline) {
                    return $stats;
                }
                self::sendRow($db, $row, $ch === 'mail' ? $mailer : null, $ch === 'sms' ? $sms : null) ? $stats[$ch]++ : $stats['failed']++;
            }
        }
        return $stats;
    }
}
