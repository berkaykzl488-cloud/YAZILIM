<?php
namespace YP\Mail;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** Hostingin kendi mail() işlevi — yalnız son çare (spam kutusuna düşme olasılığı yüksek). */
final class PhpMail implements Transport
{
    private $fn;

    public function __construct(?callable $fn = null)
    {
        $this->fn = $fn ?: 'mail';
    }

    public function name()
    {
        return 'phpmail';
    }

    public function send(array $m)
    {
        if ($this->fn === 'mail' && !function_exists('mail')) {
            return ['ok' => false, 'id' => null, 'error' => 'Sunucuda mail() işlevi kapalı.', 'retry' => false];
        }
        list($h, $body) = Mime::build($m);
        $subject = '';
        $to = '';
        $rest = [];
        foreach ($h as $line) {
            if (strncmp($line, 'Subject: ', 9) === 0) {
                $subject = substr($line, 9);
            } elseif (strncmp($line, 'To: ', 4) === 0) {
                $to = substr($line, 4);
            } else {
                $rest[] = $line;
            }
        }
        $extra = Mime::validAddr($m['from']) ? '-f' . $m['from'] : '';
        $ok = @call_user_func($this->fn, $to, $subject, $body, implode("\r\n", $rest), $extra);
        return $ok
            ? ['ok' => true, 'id' => null, 'error' => '', 'retry' => false]
            : ['ok' => false, 'id' => null, 'error' => 'Hosting e-posta gönderimini (mail) reddetti.', 'retry' => true];
    }
}
