<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Sms\Sms;

/**
 * notify(): üyeye site içi bildirim yazar; olay (ev) için e-posta / WhatsApp açıksa outbox'a ekler (ön yüzdeki notify()).
 * WhatsApp'ın iç kanal adı 'sms'; bildirimler yalnız WhatsApp bildirim (Utility) şablonu ayarlıysa telefona gider.
 */
final class Notify
{
    /** Ayarda açıkça kapatılmadıkça e-posta / WhatsApp ile de gönderilen olaylar (para çekme ve kimlik — P3) */
    const DEFAULT_ON = ['withdraw_req', 'withdraw', 'withdraw_no', 'tc_ok', 'tc_ask'];

    private static function evOn(array $cfg, $ev)
    {
        if (isset($cfg['ev'][$ev])) {
            return !empty($cfg['ev'][$ev]);
        }
        return in_array($ev, self::DEFAULT_ON, true);
    }

    public static function send(Db $db, $userId, $text, $link = '', $ev = '', array $vars = [])
    {
        $id = $db->insert('notifications', [
            'user_id' => (int)$userId, 'x' => yp_str($text, 1000), 'link' => yp_str($link, 255), 'ev' => yp_str($ev, 40),
            'is_read' => 0, 't' => yp_now_ms(),
        ]);
        if ($ev !== '') {
            $u = $db->one('SELECT id, name, ad, email, tel FROM {users} WHERE id=?', [(int)$userId]);
            if ($u) {
                $v = Templates::vars($u, array_merge(['mesaj' => $text], $vars));
                $mail = Settings::get('mail', $db);
                if (!empty($mail['on']) && self::evOn($mail, $ev) && $u['email']) {
                    list($s, $b) = Templates::mail($ev, $v);
                    Outbox::queue($db, 'mail', $u['id'], $u['email'], $ev, $s, $b);
                }
                $sms = Settings::get('sms', $db);
                if (Sms::canSend($sms, $ev) && self::evOn($sms, $ev) && $u['tel']) {
                    Outbox::queue($db, 'sms', $u['id'], $u['tel'], $ev, '', Templates::sms($ev, $v));
                }
            }
        }
        return $id;
    }

    /** Doğrulama kodu: priority 0, hemen gönderilmeye çalışılır (başarısızsa cron yeniden dener). */
    public static function otp(Db $db, array $user, $channel, $code)
    {
        $v = Templates::vars($user, ['kod' => $code]);
        if ($channel === 'sms') {
            // WhatsApp kimlik doğrulama şablonu kodu iletiden okur; özel şablonda {kod} unutulduysa kodu ekle
            $body = Templates::sms('tfa', $v);
            if (strpos($body, (string)$code) === false) {
                $body .= ' ' . $code;
            }
            $id = Outbox::queue($db, 'sms', $user['id'], $user['tel'], 'tfa', '', $body, Outbox::PRIO_OTP);
        } else {
            list($s, $b) = Templates::mail('tfa', $v);
            $id = Outbox::queue($db, 'mail', $user['id'], $user['email'], 'tfa', $s, $b, Outbox::PRIO_OTP);
        }
        return Outbox::sendNow($db, $id);
    }
}
