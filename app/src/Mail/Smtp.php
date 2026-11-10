<?php
namespace YP\Mail;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Küçük, bağımlılıksız SMTP istemcisi: SSL (465) ya da STARTTLS (587), AUTH LOGIN / AUTH PLAIN.
 * Şifre, şifrelenmemiş bağlantıda YALNIZ yerel sunucuya (localhost/127.0.0.1) gönderilir.
 */
final class Smtp implements Transport
{
    private $host;
    private $port;
    private $sec;
    private $user;
    private $pass;
    private $timeout;
    private $verify;
    private $fp;
    /** @var array son konuşma (şifreler maskeli) — tanı için */
    public $log = [];

    public function __construct($host, $port, $sec, $user, $pass, array $opt = [])
    {
        $this->host = (string)$host;
        $this->port = (int)$port ?: ($sec === 'ssl' ? 465 : 587);
        $this->sec = in_array($sec, ['ssl', 'tls', ''], true) ? $sec : 'tls';
        $this->user = (string)$user;
        $this->pass = (string)$pass;
        $this->timeout = isset($opt['timeout']) ? (int)$opt['timeout'] : 15;
        $this->verify = array_key_exists('verify', $opt) ? (bool)$opt['verify'] : true;
    }

    public function name()
    {
        return 'smtp';
    }

    private function fail($msg, $retry = true)
    {
        if ($this->fp) {
            @fwrite($this->fp, "QUIT\r\n");
            @fclose($this->fp);
            $this->fp = null;
        }
        return ['ok' => false, 'id' => null, 'error' => $msg, 'retry' => $retry];
    }

    private function read()
    {
        $data = '';
        while (true) {
            $line = @fgets($this->fp, 1024);
            if ($line === false) {
                $meta = @stream_get_meta_data($this->fp);
                throw new \RuntimeException(!empty($meta['timed_out']) ? 'SMTP sunucusu zamanında yanıt vermedi.' : 'SMTP bağlantısı kesildi.');
            }
            $data .= $line;
            $this->log[] = 'S: ' . rtrim($line);
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return [(int)substr($data, 0, 3), $data];
    }

    private function cmd($line, array $expect, $logAs = null)
    {
        $this->log[] = 'C: ' . ($logAs !== null ? $logAs : $line);
        if (@fwrite($this->fp, $line . "\r\n") === false) {
            throw new \RuntimeException('SMTP sunucusuna yazılamadı.');
        }
        list($code, $text) = $this->read();
        if (!in_array($code, $expect, true)) {
            throw new SmtpReply($code, trim($text));
        }
        return $text;
    }

    private function ehlo()
    {
        $name = isset($_SERVER['SERVER_NAME']) && preg_match('/^[A-Za-z0-9.\-]{1,100}$/', $_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : 'localhost';
        $text = $this->cmd('EHLO ' . $name, [250]);
        $caps = [];
        foreach (preg_split('/\r?\n/', $text) as $l) {
            $l = strtoupper(trim(substr($l, 4)));
            if ($l !== '') {
                $caps[] = $l;
            }
        }
        return $caps;
    }

    private static function hasCap(array $caps, $name)
    {
        foreach ($caps as $c) {
            if ($c === $name || strpos($c, $name . ' ') === 0 || strpos($c, $name . '=') === 0) {
                return $c;
            }
        }
        return null;
    }

    public function send(array $m)
    {
        if ($this->host === '') {
            return $this->fail('SMTP sunucusu girilmemiş.', false);
        }
        $this->log = [];
        $ctx = stream_context_create(['ssl' => [
            'verify_peer' => $this->verify, 'verify_peer_name' => $this->verify, 'allow_self_signed' => !$this->verify,
            'peer_name' => $this->host, 'SNI_enabled' => true,
        ]]);
        $remote = ($this->sec === 'ssl' ? 'ssl://' : 'tcp://') . $this->host . ':' . $this->port;
        $errno = 0;
        $errstr = '';
        $this->fp = @stream_socket_client($remote, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT, $ctx);
        if (!$this->fp) {
            return $this->fail('SMTP sunucusuna bağlanılamadı (' . $this->host . ':' . $this->port . '). ' . ($errstr !== '' ? yp_str($errstr, 120) : 'Hosting dış bağlantıyı engelliyor olabilir.'));
        }
        stream_set_timeout($this->fp, $this->timeout);
        try {
            list($code) = $this->read();
            if ($code !== 220) {
                return $this->fail('SMTP sunucusu bağlantıyı kabul etmedi (' . $code . ').');
            }
            $caps = $this->ehlo();
            $secure = $this->sec === 'ssl';
            if ($this->sec === 'tls') {
                if (!self::hasCap($caps, 'STARTTLS')) {
                    return $this->fail('SMTP sunucusu STARTTLS desteklemiyor. Güvenlik ayarını SSL (port 465) yapmayı deneyin.', false);
                }
                $this->cmd('STARTTLS', [220]);
                $method = STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT : 0);
                if (!@stream_socket_enable_crypto($this->fp, true, $method)) {
                    return $this->fail('SMTP güvenli bağlantısı (TLS) kurulamadı; sunucu sertifikası doğrulanamadı olabilir.');
                }
                $secure = true;
                $caps = $this->ehlo();
            }
            if ($this->user !== '') {
                $local = in_array(strtolower($this->host), ['localhost', '127.0.0.1', '::1'], true);
                if (!$secure && !$local) {
                    return $this->fail('Şifre şifrelenmemiş bağlantıyla gönderilmez. Güvenlik ayarını TLS ya da SSL yapın.', false);
                }
                $auth = (string)self::hasCap($caps, 'AUTH');
                if (strpos($auth, 'LOGIN') !== false || $auth === '') {
                    $this->cmd('AUTH LOGIN', [334]);
                    $this->cmd(base64_encode($this->user), [334], '[kullanıcı]');
                    $this->cmd(base64_encode($this->pass), [235], '[şifre]');
                } elseif (strpos($auth, 'PLAIN') !== false) {
                    $this->cmd('AUTH PLAIN ' . base64_encode("\0" . $this->user . "\0" . $this->pass), [235], 'AUTH PLAIN [gizli]');
                } else {
                    return $this->fail('SMTP sunucusu desteklenen bir giriş yöntemi sunmuyor (LOGIN/PLAIN).', false);
                }
            }
            $this->cmd('MAIL FROM:<' . $m['from'] . '>', [250]);
            $this->cmd('RCPT TO:<' . $m['to'] . '>', [250, 251]);
            $this->cmd('DATA', [354]);
            list($h, $body) = Mime::build($m);
            $data = implode("\r\n", $h) . "\r\n\r\n" . $body;
            $data = preg_replace('/^\./m', '..', $data); // nokta doldurma
            $this->log[] = 'C: [ileti ' . strlen($data) . ' bayt]';
            if (@fwrite($this->fp, $data . "\r\n.\r\n") === false) {
                throw new \RuntimeException('SMTP sunucusuna yazılamadı.');
            }
            list($code, $text) = $this->read();
            if ($code !== 250) {
                throw new SmtpReply($code, trim($text));
            }
            $id = preg_match('/(?:queued as|id=|<)\s*([A-Za-z0-9.\-_@]{4,80})/i', $text, $mm) ? $mm[1] : null;
            try {
                $this->cmd('QUIT', [221]);
            } catch (\Throwable $e) {
            }
            @fclose($this->fp);
            $this->fp = null;
            return ['ok' => true, 'id' => $id, 'error' => '', 'retry' => false];
        } catch (SmtpReply $e) {
            if ($e->smtpCode === 535 || $e->smtpCode === 534) {
                return $this->fail('SMTP kullanıcı adı veya şifresi hatalı.', false);
            }
            return $this->fail('SMTP sunucusu reddetti (' . $e->smtpCode . '): ' . yp_str($e->getMessage(), 160), $e->smtpCode < 500);
        } catch (\Throwable $e) {
            return $this->fail($e->getMessage());
        }
    }
}

/** @internal */
final class SmtpReply extends \RuntimeException
{
    public $smtpCode;

    public function __construct($code, $text)
    {
        parent::__construct($text);
        $this->smtpCode = (int)$code;
    }
}
