<?php
/**
 * Test için sahte SMTP sunucusu (tek bağlantı). Konuşmayı JSON dosyasına yazar.
 * Kullanım: php tests/lib/smtp_sink.php <bağlanma-adresi> <port> <plain|starttls|authfail> <döküm.json> [sertifika.pem]
 * Dinlemeye başlayınca stdout'a "READY" yazar.
 */
if (PHP_SAPI !== 'cli') {
    exit;
}
list(, $addr, $port, $mode, $out) = $argv + [null, '127.0.0.1', '2525', 'plain', 'php://stdout'];
$cert = isset($argv[5]) ? $argv[5] : null;
$ctx = stream_context_create($cert ? ['ssl' => ['local_cert' => $cert, 'verify_peer' => false, 'allow_self_signed' => true]] : []);
$srv = @stream_socket_server("tcp://$addr:$port", $errno, $errstr, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $ctx);
if (!$srv) {
    fwrite(STDOUT, "FAIL $errstr\n");
    exit(1);
}
fwrite(STDOUT, "READY\n");
fflush(STDOUT);
$log = ['lines' => [], 'tls' => false, 'auth' => null, 'data' => null, 'mail_from' => null, 'rcpt' => null];
$conn = @stream_socket_accept($srv, 20);
if (!$conn) {
    file_put_contents($out, json_encode($log));
    exit(1);
}
stream_set_timeout($conn, 10);
$say = function ($s) use ($conn) {
    fwrite($conn, $s . "\r\n");
};
$say('220 sink.test ESMTP hazır');
$tls = false;
while (($line = fgets($conn)) !== false) {
    $l = rtrim($line, "\r\n");
    $log['lines'][] = $l;
    $u = strtoupper($l);
    if (strpos($u, 'EHLO') === 0) {
        if ($mode === 'starttls' && !$tls) {
            $say("250-sink.test\r\n250-STARTTLS\r\n250 SIZE 1000000");
        } else {
            $say("250-sink.test\r\n250-8BITMIME\r\n250 AUTH LOGIN PLAIN");
        }
    } elseif ($u === 'STARTTLS') {
        $say('220 2.0.0 TLS başlat');
        stream_context_set_option($conn, 'ssl', 'local_cert', $cert);
        stream_context_set_option($conn, 'ssl', 'verify_peer', false);
        $ok = @stream_socket_enable_crypto($conn, true, STREAM_CRYPTO_METHOD_TLS_SERVER);
        $tls = (bool)$ok;
        $log['tls'] = $tls;
        if (!$ok) {
            break;
        }
    } elseif ($u === 'AUTH LOGIN') {
        $say('334 VXNlcm5hbWU6');
        $user = base64_decode(rtrim(fgets($conn), "\r\n"));
        $say('334 UGFzc3dvcmQ6');
        $pass = base64_decode(rtrim(fgets($conn), "\r\n"));
        $log['auth'] = ['user' => $user, 'pass' => $pass, 'tls' => $tls];
        $say($mode === 'authfail' ? '535 5.7.8 Authentication failed' : '235 2.7.0 OK');
    } elseif (strpos($u, 'MAIL FROM:') === 0) {
        $log['mail_from'] = substr($l, 10);
        $say('250 2.1.0 OK');
    } elseif (strpos($u, 'RCPT TO:') === 0) {
        $log['rcpt'] = substr($l, 8);
        $say('250 2.1.5 OK');
    } elseif ($u === 'DATA') {
        $say('354 Veriyi gönderin');
        $data = '';
        while (($d = fgets($conn)) !== false) {
            if ($d === ".\r\n") {
                break;
            }
            $data .= $d;
        }
        $log['data'] = $data;
        $say('250 2.0.0 OK queued as SINK123');
    } elseif ($u === 'QUIT') {
        $say('221 2.0.0 Güle güle');
        break;
    } else {
        $say('502 5.5.2 Bilinmeyen komut');
    }
}
@fclose($conn);
file_put_contents($out, json_encode($log, JSON_UNESCAPED_UNICODE));
