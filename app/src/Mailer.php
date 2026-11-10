<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Mail\Brevo;
use YP\Mail\Mailjet;
use YP\Mail\Mime;
use YP\Mail\PhpMail;
use YP\Mail\Smtp;
use YP\Mail\Transport;

/**
 * E-posta gönderici. Sağlayıcı ayarı (settings.mail.provider): brevo | mailjet | smtp.
 * Sağlayıcı ayarlı değilse ya da gönderemezse ve fallback açıksa hostingin mail() işlevi son çare olarak kullanılır.
 */
final class Mailer
{
    /** @var Transport|null */
    public $primary;
    /** @var Transport|null */
    public $fallback;
    public $from;
    public $fromName;

    /** Testler için: fn(array $settings): Mailer */
    public static $factory = null;

    public function __construct(?Transport $primary, ?Transport $fallback, $from, $fromName = '')
    {
        $this->primary = $primary;
        $this->fallback = $fallback;
        $this->from = (string)$from;
        $this->fromName = (string)$fromName;
    }

    public static function providers()
    {
        return ['brevo' => 'Brevo (API)', 'mailjet' => 'Mailjet (API)', 'smtp' => 'SMTP sunucusu', '' => 'Seçilmedi'];
    }

    public static function transportFor(array $s, ?callable $http = null)
    {
        $http = $http ?: 'yp_http';
        $p = isset($s['provider']) ? $s['provider'] : '';
        if ($p === 'brevo' && !empty($s['brevo_key'])) {
            return new Brevo($s['brevo_key'], $http);
        }
        if ($p === 'mailjet' && !empty($s['mailjet_key']) && !empty($s['mailjet_secret'])) {
            return new Mailjet($s['mailjet_key'], $s['mailjet_secret'], $http);
        }
        if ($p === 'smtp' && !empty($s['smtp_host'])) {
            return new Smtp($s['smtp_host'], isset($s['smtp_port']) ? $s['smtp_port'] : 587, isset($s['smtp_sec']) ? $s['smtp_sec'] : 'tls',
                isset($s['smtp_user']) ? $s['smtp_user'] : '', isset($s['smtp_pass']) ? $s['smtp_pass'] : '');
        }
        return null;
    }

    public static function fromSettings(array $s, ?callable $http = null)
    {
        if (self::$factory) {
            return call_user_func(self::$factory, $s);
        }
        $fallback = !empty($s['fallback']) ? new PhpMail() : null;
        return new Mailer(self::transportFor($s, $http), $fallback, isset($s['from']) ? $s['from'] : '', isset($s['fromName']) ? $s['fromName'] : '');
    }

    public function configured()
    {
        return ($this->primary !== null || $this->fallback !== null) && Mime::validAddr($this->from);
    }

    /** Dönüş: ['ok', 'id', 'error', 'retry', 'provider'] */
    public function send($to, $subject, $text, $toName = '', $html = null)
    {
        if (!Mime::validAddr($to)) {
            return ['ok' => false, 'id' => null, 'error' => 'Alıcı e-posta adresi geçersiz.', 'retry' => false, 'provider' => null];
        }
        if (!Mime::validAddr($this->from)) {
            return ['ok' => false, 'id' => null, 'error' => 'Gönderen e-posta adresi ayarlanmamış (Yönetim › E-posta & SMS).', 'retry' => true, 'provider' => null];
        }
        $m = ['to' => $to, 'toName' => $toName, 'from' => $this->from, 'fromName' => $this->fromName,
              'subject' => (string)$subject, 'text' => (string)$text, 'html' => $html];
        $err = 'E-posta sağlayıcısı ayarlanmamış (Yönetim › E-posta & SMS).';
        $retry = true;
        if ($this->primary) {
            $r = $this->primary->send($m);
            $r['provider'] = $this->primary->name();
            if ($r['ok']) {
                return $r;
            }
            $err = $r['error'];
            $retry = $r['retry'];
        }
        if ($this->fallback) {
            $r = $this->fallback->send($m);
            $r['provider'] = $this->fallback->name();
            if ($r['ok']) {
                return $r;
            }
            $err .= ' · Yedek (mail): ' . $r['error'];
        }
        return ['ok' => false, 'id' => null, 'error' => $err, 'retry' => $retry, 'provider' => $this->primary ? $this->primary->name() : null];
    }
}
