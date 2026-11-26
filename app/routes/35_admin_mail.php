<?php
/**
 * E-posta & WhatsApp ayarları (P6'dan öne çekildi: 2FA için gerekli). Yetki: [sms] (iç anahtar; ekranda "E-posta & WhatsApp").
 * Gizli alanlar maskeli döner; boş ya da maskeli gönderilen gizli alan mevcut değeri KORUR (api/ayarlar.php ile aynı kural).
 * WhatsApp = WhatsApp Business Cloud API (Meta); iç kanal / ayar adı "sms" olarak kaldı (users.tfa, outbox.channel).
 *   PUT  admin/settings/sms   WhatsApp ayarları (wa_phone_id, wa_token, şablon adları …)
 *   POST admin/sms/check      bağlantı testi (Meta'dan numara ve doğrulanmış işletme adı)
 *   POST admin/sms/test       deneme: doğrulama kodu şablonu sahte kod 123456 ile
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
use YP\Sms\WhatsApp;
use YP\Templates;
use YP\V;

return function (Router $r) {
    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $secretMail = ['brevo_key', 'mailjet_key', 'mailjet_secret', 'smtp_pass'];
    $secretSms = ['wa_token'];
    $mask = function (array $s, array $secret) {
        foreach ($secret as $k) {
            $s[$k] = isset($s[$k]) && $s[$k] !== '' ? ($k === 'smtp_pass' ? '••••' : yp_mask_secret($s[$k])) : '';
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
            'sms' => $mask(array_diff_key(Settings::get('sms', $db), ['header' => 1, 'user' => 1, 'pass' => 1]), $secretSms),
            'providers' => ['mail' => Mailer::providers(), 'sms' => Sms::providers()],
            'tfaTrustMin' => \YP\Tfa::trustMinutes($db),
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
        foreach (['wa_otp_tpl', 'wa_note_tpl', 'wa_mkt_tpl'] as $k) {
            if (isset($in[$k]) && is_string($in[$k])) {
                $in[$k] = strtolower(trim($in[$k]));
            }
        }
        $v = new V($in);
        $old = Settings::get('sms', $db);
        $new = $old;
        $tplRx = '/^[a-z0-9_]{1,512}$/';
        $tplMsg = 'Şablon adı yalnız küçük harf, rakam ve alt çizgi (_) içerebilir (ör. yangpazar_kod).';
        $langRx = '/^[a-z]{2,3}(_[A-Z]{2,4})?$/';
        $langMsg = 'Dil kodu tr, en veya en_US gibi olmalı.';
        $new['on'] = $v->bool('on', !empty($old['on']));
        $new['provider'] = 'whatsapp';
        $new['wa_phone_id'] = $v->has('wa_phone_id') ? $v->str('wa_phone_id', 0, 30, '/^\d{5,30}$/', 'Telefon numarası kimliği yalnız rakamlardan oluşur (Meta › WhatsApp › API Kurulumu).') : $old['wa_phone_id'];
        $new['wa_waba_id'] = $v->has('wa_waba_id') ? $v->str('wa_waba_id', 0, 30, '/^\d{5,30}$/', 'WhatsApp işletme hesabı kimliği yalnız rakamlardan oluşur.') : $old['wa_waba_id'];
        $new['wa_otp_tpl'] = $v->has('wa_otp_tpl') ? $v->str('wa_otp_tpl', 1, 512, $tplRx, $tplMsg) : $old['wa_otp_tpl'];
        $new['wa_otp_lang'] = $v->has('wa_otp_lang') ? $v->str('wa_otp_lang', 2, 10, $langRx, $langMsg) : $old['wa_otp_lang'];
        $new['wa_note_on'] = $v->bool('wa_note_on', !empty($old['wa_note_on']));
        $new['wa_note_tpl'] = $v->has('wa_note_tpl') ? $v->str('wa_note_tpl', 0, 512, $tplRx, $tplMsg) : $old['wa_note_tpl'];
        $new['wa_note_lang'] = $v->has('wa_note_lang') ? $v->str('wa_note_lang', 2, 10, $langRx, $langMsg) : $old['wa_note_lang'];
        $new['wa_mkt_tpl'] = $v->has('wa_mkt_tpl') ? $v->str('wa_mkt_tpl', 0, 512, $tplRx, $tplMsg) : $old['wa_mkt_tpl'];
        $new['wa_mkt_lang'] = $v->has('wa_mkt_lang') ? $v->str('wa_mkt_lang', 2, 10, $langRx, $langMsg) : $old['wa_mkt_lang'];
        $new['hourly'] = $v->int('hourly', 1, 100000, (int)$old['hourly']);
        $up = $v->has('userPrice') ? yp_money($in['userPrice']) : (float)$old['userPrice'];
        if ($up === null || $up < 0) {
            $v->err('userPrice', 'Tutar geçersiz.');
        }
        $new['userPrice'] = $up;
        if ($v->has('ev')) {
            $new['ev'] = $evs($in['ev']);
        }
        if (isset($in['wa_token']) && (!is_string($in['wa_token']) || strlen($in['wa_token']) > 1000 || preg_match('/\s/', trim($in['wa_token'])))) {
            $v->err('wa_token', 'Erişim anahtarı geçersiz (boşluk içermemeli).');
        }
        $v->done();
        if (isset($in['wa_token']) && is_string($in['wa_token'])) {
            $in['wa_token'] = trim($in['wa_token']);
        }
        $new = $keep($old, array_merge($new, array_intersect_key($in, ['wa_token' => 1])), $secretSms);
        unset($new['header'], $new['user'], $new['pass']); // eski NetGSM alanları
        if ($new['on'] && ($new['wa_phone_id'] === '' || $new['wa_token'] === '' || $new['wa_otp_tpl'] === '')) {
            throw HttpError::validation(['wa_phone_id' => 'WhatsApp\'ı açmak için Telefon numarası kimliği, erişim anahtarı ve doğrulama kodu şablonunun adı gerekli.']);
        }
        if ($new['wa_note_on'] && $new['wa_note_tpl'] === '') {
            throw HttpError::validation(['wa_note_tpl' => 'Bildirimleri WhatsApp\'tan göndermek için Meta\'da onaylı bildirim şablonunun adını yazın.']);
        }
        Settings::set('sms', $new, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'settings_sms', 'settings', 'sms', ['provider' => 'whatsapp', 'on' => $new['on'], 'note' => $new['wa_note_on']]);
        return ['msg' => 'WhatsApp ayarları kaydedildi.', 'data' => ['sms' => $mask($new, $secretSms)]];
    }, $S('ui:form:smsset'));

    // WhatsApp bağlantı testi: Meta'dan numaranın görünen adı ve doğrulanmış işletme adı
    $r->post('admin/sms/check', function (Req $q, Db $db) {
        RateLimit::enforce('wacheck:' . Auth::$user['id'], 10, 600);
        $s = Settings::get('sms', $db);
        if (!WhatsApp::configured($s)) {
            throw new HttpError(422, 'Önce Telefon numarası kimliğini ve erişim anahtarını yazıp kaydedin.', 'not_configured');
        }
        $p = Sms::fromSettings($s);
        $res = $p instanceof WhatsApp ? $p->check() : ['ok' => false, 'name' => '', 'number' => '', 'quality' => '', 'error' => 'WhatsApp ayarlanmamış.'];
        Audit::log($db, Auth::$user['id'], 'sms_check', 'settings', 'sms', ['ok' => $res['ok']]);
        return $res['ok']
            ? ['msg' => 'Bağlantı başarılı: ' . ($res['name'] !== '' ? $res['name'] . ' · ' : '') . $res['number'], 'data' => $res]
            : ['msg' => 'Bağlantı kurulamadı: ' . $res['error'], 'data' => $res];
    }, $S('sms'));

    // Giriş doğrulaması: kod girildikten sonra aynı tarayıcıda kaç dakika tekrar sorulmasın (0 = her girişte)
    $r->put('admin/settings/tfa', function (Req $q, Db $db) {
        $actor = Auth::$user;
        $in = $q->body();
        if (!isset($in['trustMin']) || !is_numeric($in['trustMin']) || (int)$in['trustMin'] < 0 || (int)$in['trustMin'] > \YP\Tfa::TRUST_MAX) {
            throw HttpError::validation(['trustMin' => '0 ile ' . \YP\Tfa::TRUST_MAX . ' dakika arasında bir sayı yazın.']);
        }
        $min = (int)$in['trustMin'];
        $site = Settings::get('site', $db);
        $site['tfaTrustMin'] = $min;
        Settings::set('site', $site, $actor['id'], $db);
        Audit::log($db, $actor['id'], 'setting_tfa_trust', 'settings', 'site', ['min' => $min]);
        return ['msg' => $min ? 'Kod girildikten sonra ' . $min . ' dakika tekrar sorulmayacak.' : 'Her girişte doğrulama kodu istenecek.',
            'data' => ['tfaTrustMin' => $min], 'patch' => ['set' => ['tfaTrustMin' => $min]]];
    }, $S('sms'));

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

    // Deneme: doğrulama kodu şablonu, sahte kod 123456 (Meta'da şablonun onaylı olduğunu da doğrular)
    $r->post('admin/sms/test', function (Req $q, Db $db) {
        RateLimit::enforce('smstest:' . Auth::$user['id'], 5, 600);
        $v = new V($q->body());
        $to = $v->tel('to');
        $v->done();
        $body = Templates::sms('test', Templates::vars(null, ['kod' => '123456']));
        if (strpos($body, '123456') === false) {
            $body .= ' 123456';
        }
        $id = Outbox::queue($db, 'sms', null, $to, 'test', '', $body, Outbox::PRIO_OTP);
        $ok = Outbox::sendNow($db, $id);
        $row = $db->one('SELECT status, last_error, provider, provider_id FROM {outbox} WHERE id=?', [$id]);
        Audit::log($db, Auth::$user['id'], 'sms_test', 'outbox', $id, ['ok' => $ok]);
        return $ok ? ['msg' => 'Deneme WhatsApp mesajı gönderildi (kod 123456). Telefonunuzu kontrol edin.', 'data' => ['sent' => true, 'id' => $row['provider_id']]]
                   : ['msg' => 'Deneme WhatsApp mesajı gönderilemedi: ' . $row['last_error'], 'data' => ['sent' => false, 'error' => $row['last_error']]];
    }, $S('ui:form:smstest'));

    // Gönderim kayıtları (S.mailLog / S.smsLog = WhatsApp). Doğrulama kodları maskelenir.
    $r->get('admin/outbox', function (Req $q, Db $db) {
        $ch = $q->q('ch') === 'sms' ? 'sms' : 'mail';
        $rows = $db->all('SELECT o.*, u.name AS uname FROM {outbox} o LEFT JOIN {users} u ON u.id=o.user_id WHERE o.channel=? ORDER BY o.id DESC LIMIT 100', [$ch]);
        $st = ['queued' => 'Kuyrukta', 'sending' => 'Gönderiliyor', 'sent' => 'Gönderildi', 'failed' => 'Gönderilemedi'];
        return ['data' => ['log' => array_map(function ($o) use ($st) {
            $otp = in_array($o['ev'], ['tfa', 'reset'], true); // P6: şifre sıfırlama kodu ve bağlantısı da gizlenir
            $x = $otp ? preg_replace(['/\b\d{6}\b/', '/[a-f0-9]{64}/'], ['••••••', '••••'], $o['body']) : $o['body'];
            $sub = $otp ? preg_replace('/\b\d{6}\b/', '••••••', $o['subject']) : $o['subject'];
            return ['id' => 'm' . (int)$o['id'], 'u' => $o['user_id'] ? 'u' . (int)$o['user_id'] : null, 'uname' => $o['uname'], 'to' => $o['to_addr'],
                    'sub' => $sub, 'x' => $x, 't' => (int)$o['created_at'], 'ev' => $o['ev'],
                    'status' => $st[$o['status']] . ($o['last_error'] && $o['status'] !== 'sent' ? ' · ' . $o['last_error'] : ''),
                    'provider' => $o['provider']];
        }, $rows)]];
    }, $S('sms'));
};
