<?php
namespace YP\Mail;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** RFC 5322 ileti oluşturucu (UTF-8, base64 gövde, başlık enjeksiyonuna karşı CR/LF temizliği) */
final class Mime
{
    public static function clean($s)
    {
        return trim(str_replace(["\r", "\n", "\0"], ' ', (string)$s));
    }

    public static function validAddr($a)
    {
        return is_string($a) && strlen($a) <= 190 && filter_var($a, FILTER_VALIDATE_EMAIL) !== false && strpbrk($a, "\r\n<>\"") === false;
    }

    public static function encodeHeader($s)
    {
        $s = self::clean($s);
        if ($s === '' || preg_match('/^[\x20-\x7E]*$/', $s)) {
            return $s;
        }
        // satır uzunluğu için 45 baytlık parçalar (çok baytlı karakterler bölünmez)
        $out = [];
        $chunk = '';
        foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
            if (strlen($chunk . $ch) > 45) {
                $out[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
                $chunk = '';
            }
            $chunk .= $ch;
        }
        if ($chunk !== '') {
            $out[] = '=?UTF-8?B?' . base64_encode($chunk) . '?=';
        }
        return implode("\r\n ", $out);
    }

    public static function addr($email, $name = '')
    {
        $name = self::clean($name);
        if ($name === '') {
            return '<' . $email . '>';
        }
        $n = preg_match('/^[A-Za-z0-9 .\-]*$/', $name) ? '"' . $name . '"' : self::encodeHeader($name);
        return $n . ' <' . $email . '>';
    }

    /** Dönüş: [başlıklar dizisi (Subject/To dahil), gövde] — CRLF satır sonlu */
    public static function build(array $m)
    {
        $domain = substr(strrchr($m['from'], '@'), 1) ?: 'localhost';
        $h = [
            'Date: ' . date('r'),
            'From: ' . self::addr($m['from'], isset($m['fromName']) ? $m['fromName'] : ''),
            'To: ' . self::addr($m['to'], isset($m['toName']) ? $m['toName'] : ''),
            'Subject: ' . self::encodeHeader($m['subject']),
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . preg_replace('/[^A-Za-z0-9.\-]/', '', $domain) . '>',
            'MIME-Version: 1.0',
            'X-Mailer: yangpazar',
        ];
        $text = str_replace(["\r\n", "\r"], "\n", (string)$m['text']);
        $text = str_replace("\n", "\r\n", $text);
        if (!empty($m['html'])) {
            $b = 'yp' . bin2hex(random_bytes(8));
            $h[] = 'Content-Type: multipart/alternative; boundary="' . $b . '"';
            $body = '--' . $b . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . rtrim(chunk_split(base64_encode($text), 76, "\r\n")) . "\r\n"
                . '--' . $b . "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
                . rtrim(chunk_split(base64_encode((string)$m['html']), 76, "\r\n")) . "\r\n"
                . '--' . $b . "--\r\n";
        } else {
            $h[] = 'Content-Type: text/plain; charset=UTF-8';
            $h[] = 'Content-Transfer-Encoding: base64';
            $body = rtrim(chunk_split(base64_encode($text), 76, "\r\n")) . "\r\n";
        }
        return [$h, $body];
    }
}
