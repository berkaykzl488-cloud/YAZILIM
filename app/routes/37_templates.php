<?php
/**
 * Mesaj şablonları (PLAN §4 P6) [sms]. Katalog ve varsayılanlar: app/src/TplDefaults.php; kullanım: app/src/Templates.php.
 *   GET    admin/templates        tüm olaylar: ad, ne zaman, kime, e-posta konu/metin (kayıtlı ya da varsayılan), WhatsApp metni,
 *                                 açık/kapalı, değişkenler
 *   PUT    admin/templates/{k}    {mail:{s,b,on}, wa:{x,on}}: kayıt (settings.tpl + mail.ev / sms.ev)
 *   DELETE admin/templates/{k}    varsayılana döndür
 * WhatsApp kuralları: doğrulama kodu ve şifre sıfırlama Meta'daki kimlik doğrulama şablonuyla gider; metni ve açık/kapalı ayarı
 * değiştirilemez. Diğer olayların WhatsApp metni bizim tarafımızdadır: bildirim (Utility) şablonunun {{1}} değişkenine yazılır
 * (şablonun kendisi Meta'da onaylıdır ve buradan değişmez). E-posta konusu ve metni her olay için düzenlenebilir; doğrulama kodu
 * ve şifre sıfırlama e-postasında {kod} zorunludur.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Notify;
use YP\Settings;
use YP\Sms\Sms;
use YP\Templates;
use YP\TplDefaults;

return function (Router $r) {
    $S = ['auth' => 'staff', 'perm' => 'sms'];
    $evOn = function (array $cfg, $k) {
        if (in_array($k, TplDefaults::ALWAYS, true)) {
            return true;
        }
        if (isset($cfg['ev'][$k])) {
            return !empty($cfg['ev'][$k]);
        }
        return in_array($k, Notify::DEFAULT_ON, true);
    };
    $one = function (Db $db, $k) use ($evOn) {
        $tpl = Settings::get('tpl', $db) ?: [];
        $mail = Settings::get('mail', $db);
        $sms = Settings::get('sms', $db);
        $m = in_array($k, TplDefaults::MAIL, true);
        $w = in_array($k, TplDefaults::WA, true);
        $fixed = in_array($k, TplDefaults::WA_FIXED, true);
        $info = TplDefaults::EV[$k];
        return [
            'k' => $k, 'name' => $info[0], 'when' => $info[1], 'to' => $info[2], 'always' => in_array($k, TplDefaults::ALWAYS, true),
            'mail' => $m ? ['s' => isset($tpl['mail'][$k]['s']) ? $tpl['mail'][$k]['s'] : Templates::defSub($k),
                'b' => isset($tpl['mail'][$k]['b']) ? $tpl['mail'][$k]['b'] : Templates::defBody($k),
                'def' => ['s' => Templates::defSub($k), 'b' => Templates::defBody($k)], 'custom' => isset($tpl['mail'][$k]), 'on' => $evOn($mail, $k),
                'needCode' => in_array($k, TplDefaults::NEED_CODE, true)] : null,
            'wa' => $w ? ['x' => !$fixed && isset($tpl['sms'][$k]) ? $tpl['sms'][$k] : Templates::defSms($k), 'def' => Templates::defSms($k),
                'custom' => !$fixed && isset($tpl['sms'][$k]), 'on' => $evOn($sms, $k), 'fixed' => $fixed,
                'kind' => Sms::kind($k), 'tpl' => $fixed ? (string)$sms['wa_otp_tpl'] : (string)$sms['wa_note_tpl']] : null,
        ];
    };
    $key = function (Req $q) {
        $k = $q->param('k');
        if (!isset(TplDefaults::EV[$k])) {
            throw HttpError::notFound('Şablon bulunamadı.');
        }
        return $k;
    };

    $r->get('admin/templates', function (Req $q, Db $db) use ($one) {
        $sms = Settings::get('sms', $db);
        $mail = Settings::get('mail', $db);
        return ['data' => [
            'templates' => array_map(function ($k) use ($db, $one) {
                return $one($db, $k);
            }, array_keys(TplDefaults::EV)),
            'vars' => TplDefaults::VARS,
            'channels' => ['mail' => !empty($mail['on']), 'wa' => !empty($sms['on']), 'waNote' => !empty($sms['wa_note_on']) && (string)$sms['wa_note_tpl'] !== '',
                'waOtpTpl' => (string)$sms['wa_otp_tpl'], 'waNoteTpl' => (string)$sms['wa_note_tpl'], 'from' => (string)$mail['from'], 'fromName' => (string)$mail['fromName']],
        ]];
    }, $S);

    $r->put('admin/templates/{k}', function (Req $q, Db $db) use ($one, $key) {
        $k = $key($q);
        $in = $q->body();
        $tpl = Settings::get('tpl', $db) ?: [];
        $mailCfg = Settings::get('mail', $db);
        $smsCfg = Settings::get('sms', $db);
        $f = [];
        $always = in_array($k, TplDefaults::ALWAYS, true);
        if (isset($in['mail']) && is_array($in['mail']) && in_array($k, TplDefaults::MAIL, true)) {
            $m = $in['mail'];
            $s = isset($m['s']) && is_string($m['s']) ? trim($m['s']) : null;
            $b = isset($m['b']) && is_string($m['b']) ? str_replace("\r\n", "\n", trim($m['b'])) : null;
            if ($s !== null && ($s === '' || yp_strlen($s) > 200)) {
                $f['mail_s'] = 'Konu 1-200 karakter olmalı.';
            }
            if ($b !== null && ($b === '' || yp_strlen($b) > 5000)) {
                $f['mail_b'] = 'Metin 1-5000 karakter olmalı.';
            }
            if ($b !== null && in_array($k, TplDefaults::NEED_CODE, true) && strpos($b, '{kod}') === false) {
                $f['mail_b'] = 'Bu e-postada {kod} değişkeni olmalı; yoksa üyeye kod gitmez.';
            }
            if (!$f) {
                if ($s !== null || $b !== null) {
                    $cur = isset($tpl['mail'][$k]) ? $tpl['mail'][$k] : [];
                    $nm = ['s' => $s !== null ? $s : (isset($cur['s']) ? $cur['s'] : Templates::defSub($k)), 'b' => $b !== null ? $b : (isset($cur['b']) ? $cur['b'] : Templates::defBody($k))];
                    if ($nm['s'] === Templates::defSub($k) && $nm['b'] === Templates::defBody($k)) {
                        unset($tpl['mail'][$k]);
                    } else {
                        $tpl['mail'][$k] = $nm;
                    }
                }
                if (array_key_exists('on', $m) && !$always) {
                    $mailCfg['ev'][$k] = yp_bool($m['on']);
                }
            }
        }
        if (isset($in['wa']) && is_array($in['wa']) && in_array($k, TplDefaults::WA, true)) {
            $w = $in['wa'];
            if (in_array($k, TplDefaults::WA_FIXED, true)) {
                if (isset($w['x']) && is_string($w['x']) && trim($w['x']) !== Templates::defSms($k)) {
                    $f['wa_x'] = 'Bu ileti Meta\'da onaylı kimlik doğrulama şablonuyla gider; metni buradan değiştirilemez.';
                }
            } else {
                $x = isset($w['x']) && is_string($w['x']) ? trim(preg_replace('/\s+/u', ' ', $w['x'])) : null;
                if ($x !== null && ($x === '' || yp_strlen($x) > 900)) {
                    $f['wa_x'] = 'WhatsApp metni 1-900 karakter olmalı (tek satır; Meta bildirim şablonu değişkeni).';
                }
                if (!$f && $x !== null) {
                    if ($x === Templates::defSms($k)) {
                        unset($tpl['sms'][$k]);
                    } else {
                        $tpl['sms'][$k] = $x;
                    }
                }
                if (!$f && array_key_exists('on', $w) && !$always) {
                    $smsCfg['ev'][$k] = yp_bool($w['on']);
                }
            }
        }
        if ($f) {
            throw HttpError::validation($f);
        }
        Settings::set('tpl', $tpl, Auth::$user['id'], $db);
        Settings::set('mail', $mailCfg, Auth::$user['id'], $db);
        Settings::set('sms', $smsCfg, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'template_save', 'template', $k);
        return ['msg' => 'Şablon kaydedildi.', 'data' => ['template' => $one($db, $k)]];
    }, ['auth' => 'staff', 'perm' => 'ui:form:tplsave']);

    $r->delete('admin/templates/{k}', function (Req $q, Db $db) use ($one, $key) {
        $k = $key($q);
        $tpl = Settings::get('tpl', $db) ?: [];
        unset($tpl['mail'][$k], $tpl['sms'][$k]);
        Settings::set('tpl', $tpl, Auth::$user['id'], $db);
        Audit::log($db, Auth::$user['id'], 'template_default', 'template', $k);
        return ['msg' => 'Şablon varsayılana döndü.', 'data' => ['template' => $one($db, $k)]];
    }, $S);
};
