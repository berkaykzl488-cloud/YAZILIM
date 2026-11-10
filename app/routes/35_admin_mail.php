<?php
/**
 * E-posta & SMS ayarları (P6'dan öne çekildi: 2FA için gerekli). Yetki: [sms]. Gizli alanlar maskeli döner;
 * boş ya da maskeli gönderilen gizli alan mevcut değeri KORUR (api/ayarlar.php ile aynı kural).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Mail\Mime;
use YP\Mailer;
use YP\Outbox;
use YP\RateLimit;
use YP\Settings;
use YP\Sms\Sms;
use YP\Templates;
use YP\V;

return function (Router $r) {
    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $secretMail = ['brevo_key', 'mailjet_key', 'mailjet_secret', 'smtp_pass'];
    $secretSms = ['pass'];
    $mask = function (array $s, array $secret) {
        foreach ($secret as $k) {
            $s[$k] = isset($s[$k]) && $s[$k] !== '' ? ($k === 'smtp_pass' || $k === 'pass' ? '••••' : yp_mask_secret($s[$k])) : '';
        }
        return $s;
    };
    $keep = function (array $old, array $in, array $secret) {
        foreach ($secret as $k) {
            if (!isset($in[$k]) || !is_string($in[$k]) || $in[$k] === '' || yp_is_masked_input($in[$k])) {
                $in[$k] = isset($old[$k]) ? $old[$k] : '';
            }
        }
        return $in;
    };
    $evs = function ($v) {
        $out = [];
        if (is_array($v)) {
            foreach ($v as $k => $on) {
                if (is_string($k) && preg_match('/^[a-z_]{2,30}$/', $k)) {
                    $out[$k] = yp_bool($on);
                }
            }
        }
        return $out;
    };

    $r->get('admin/settings/mail', function (Req $q, Db $db) use ($mask, $secretMail, $secretSms) {
        $last = $db->one("SELECT status, last_error, provider, sent_at, created_at FROM {outbox} WHERE channel='mail' ORDER BY id DESC LIMIT 1");
        return ['data' => [
            'mail' => $mask(Settings::get('mail', $db), $secretMail),
            'sms' => $mask(Settings::get('sms', $db), $secretSms),
            'providers' => ['mail' => Mailer::providers(), 'sms' => Sms::providers()],
            'stats' => [
                'mailLastHour' => Outbox::sentLastHour($db, 'mail'), 'smsLastHour' => Outbox::sentLastHour($db, 'sms'),
                'queued' => (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE status='queued'"), 'last' => $last,
            ],
        ]];
    }, $S('sms'));

    $r->put('admin/settings/mail', function (Req $q, Db $db) use ($mask, $keep, $secretMail, $evs) {
        $in = $q->body();
        $v = new V($in);
        $old = Settings::get('mail', $db);
        $new = $old;
        $new['on'] = $v->bool('on', !empty($old['on']));
        $new['provider'] = $v->oneOf('provider', array_keys(Mailer::providers()), $old['provider']);
        $new['from'] = $v->has('from') ? (string)$v->email('from', false) : $old['from'];
        $new['fromName'] = $v->has('fromName') ? $v->str('fromName', 0, 80) : $old['fromName'];
        $new['hourly'] = $v->int('hourly', 1, 100000, (int)$old['hourly']);
        $new['fallback'] = $v->bool('fallback', !empty($old['fallback']));
        $new['smtp_host'] = $v->has('smtp_host') ? $v->str('smtp_host', 0, 120, '/^[A-Za-z0-9.\-]*$/', 'Sunucu adı geçersiz.') : $old['smtp_host'];
        $new['smtp_port'] = $v->int('smtp_port', 1, 65535, (int)$old['smtp_port']);
        $new['smtp_sec'] = $v->oneOf('smtp_sec', ['tls', 'ssl', ''], $old['smtp_sec']);
        $new['smtp_user'] = $v->has('smtp_user') ? $v->str('smtp_user', 0, 190) : $old['smtp_user'];
        foreach ($secretMail as $k) {
            if (isset($in[$k]) && !is_string($in[$k])) {
                $v->err($k, 'Geçersiz değer.');
            } elseif (isset($in[$k]) && strlen($in[$k]) > 300) {
                $v->err($k, 'Çok uzun.');
            }
        }
        if ($v->has('ev')) {
            $new['ev'] = $evs($in['ev']);
        }
        $v->done();
        $new = $keep($old, array_merge($new, array_intersect_key($in, array_flip($secretMail))), $secretMail);
        if ($new['on'] && !Mime::validAddr($new['from'])) {
            throw HttpError::validation(['from' => 'E-posta gönderimini açmak için gönderen adresini yazın (sağlayıcıda doğrulanmış olmalı).']);
        }
        if ($new['on'] && $new['provider'] === '' && empty($new['fallback'])) {
            throw HttpError::validation(['provider' => 'Bir e-posta sağlayıcısı seçin (Brevo önerilir).']);
        }
        Settings::set('mail', $new, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_mail', 'settings', 'mail', ['provider' => $new['provider'], 'on' => $new['on']]);
        return ['msg' => 'E-posta ayarları kaydedildi.', 'data' => ['mail' => $mask($new, $secretMail)]];
    }, $S('ui:form:mailset'));

    $r->put('admin/settings/sms', function (Req $q, Db $db) use ($mask, $keep, $secretSms, $evs) {
        $in = $q->body();
        $v = new V($in);
        $old = Settings::get('sms', $db);
        $new = $old;
        $new['on'] = $v->bool('on', !empty($old['on']));
        $new['provider'] = $v->oneOf('provider', array_keys(Sms::providers()), $old['provider']);
        $new['header'] = $v->has('header') ? $v->str('header', 0, 11, '/^[A-Za-z0-9 .\-]*$/', 'SMS başlığı en fazla 11 karakter (harf/rakam).') : $old['header'];
        $new['user'] = $v->has('user') ? $v->str('user', 0, 60) : $old['user'];
        $new['hourly'] = $v->int('hourly', 1, 100000, (int)$old['hourly']);
        $up = $v->has('userPrice') ? yp_money($in['userPrice']) : (float)$old['userPrice'];
        if ($up === null || $up < 0) {
            $v->err('userPrice', 'Tutar geçersiz.');
        }
        $new['userPrice'] = $up;
        if ($v->has('ev')) {
            $new['ev'] = $evs($in['ev']);
        }
        if (isset($in['pass']) && (!is_string($in['pass']) || strlen($in['pass']) > 200)) {
            $v->err('pass', 'Geçersiz değer.');
        }
        $v->done();
        $new = $keep($old, array_merge($new, array_intersect_key($in, ['pass' => 1])), $secretSms);
        if ($new['on'] && (!$new['user'] || !$new['pass'] || !$new['header'])) {
            throw HttpError::validation(['user' => 'SMS gönderimini açmak için kullanıcı adı, şifre ve başlık gerekli.']);
        }
        Settings::set('sms', $new, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_sms', 'settings', 'sms', ['provider' => $new['provider'], 'on' => $new['on']]);
        return ['msg' => 'SMS ayarları kaydedildi.', 'data' => ['sms' => $mask($new, $secretSms)]];
    }, $S('ui:form:smsset'));

    $r->post('admin/mail/test', function (Req $q, Db $db) {
        RateLimit::enforce('mailtest:' . Auth::$user['id'], 10, 600);
        $v = new V($q->body());
        $to = $v->email('to');
        $v->done();
        list($s, $b) = Templates::mail('test', Templates::vars(null));
        $id = Outbox::queue($db, 'mail', null, $to, 'test', $s, $b, Outbox::PRIO_OTP);
        $ok = Outbox::sendNow($db, $id);
        $row = $db->one('SELECT status, last_error, provider FROM {outbox} WHERE id=?', [$id]);
        Audit::log($db, Auth::$user['id'], 'mail_test', 'outbox', $id, ['ok' => $ok, 'provider' => $row['provider']]);
        return $ok ? ['msg' => 'Deneme e-postası gönderildi (' . $row['provider'] . ').', 'data' => ['sent' => true, 'provider' => $row['provider']]]
                   : ['msg' => 'Deneme e-postası gönderilemedi: ' . $row['last_error'], 'data' => ['sent' => false, 'error' => $row['last_error']]];
    }, $S('ui:form:mailtest'));

    $r->post('admin/sms/test', function (Req $q, Db $db) {
        RateLimit::enforce('smstest:' . Auth::$user['id'], 5, 600);
        $v = new V($q->body());
        $to = $v->tel('to');
        $v->done();
        $id = Outbox::queue($db, 'sms', null, $to, 'test', '', Templates::sms('test', Templates::vars(null)), Outbox::PRIO_OTP);
        $ok = Outbox::sendNow($db, $id);
        $row = $db->one('SELECT status, last_error, provider FROM {outbox} WHERE id=?', [$id]);
        Audit::log($db, Auth::$user['id'], 'sms_test', 'outbox', $id, ['ok' => $ok]);
        return $ok ? ['msg' => 'Deneme SMS\'i gönderildi.', 'data' => ['sent' => true]]
                   : ['msg' => 'Deneme SMS\'i gönderilemedi: ' . $row['last_error'], 'data' => ['sent' => false, 'error' => $row['last_error']]];
    }, $S('ui:form:smstest'));

    // Gönderim kayıtları (S.mailLog / S.smsLog). Doğrulama kodları maskelenir.
    $r->get('admin/outbox', function (Req $q, Db $db) {
        $ch = $q->q('ch') === 'sms' ? 'sms' : 'mail';
        $rows = $db->all('SELECT o.*, u.name AS uname FROM {outbox} o LEFT JOIN {users} u ON u.id=o.user_id WHERE o.channel=? ORDER BY o.id DESC LIMIT 100', [$ch]);
        $st = ['queued' => 'Kuyrukta', 'sending' => 'Gönderiliyor', 'sent' => 'Gönderildi', 'failed' => 'Gönderilemedi'];
        return ['data' => ['log' => array_map(function ($o) use ($st) {
            $x = $o['ev'] === 'tfa' ? preg_replace('/\b\d{6}\b/', '••••••', $o['body']) : $o['body'];
            $sub = $o['ev'] === 'tfa' ? preg_replace('/\b\d{6}\b/', '••••••', $o['subject']) : $o['subject'];
            return ['id' => 'm' . (int)$o['id'], 'u' => $o['user_id'] ? 'u' . (int)$o['user_id'] : null, 'uname' => $o['uname'], 'to' => $o['to_addr'],
                    'sub' => $sub, 'x' => $x, 't' => (int)$o['created_at'], 'ev' => $o['ev'],
                    'status' => $st[$o['status']] . ($o['last_error'] && $o['status'] !== 'sent' ? ' · ' . $o['last_error'] : ''),
                    'provider' => $o['provider']];
        }, $rows)]];
    }, $S('sms'));
};
