<?php
namespace YP\Http;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * JSON olmayan yanıt (sitemap.xml, robots.txt, özel medya dosyası). İşleyici bunu döndürürse Kernel gövdeyi olduğu gibi yazar.
 * $file verilirse dosya parça parça okunur (büyük videolar belleğe alınmaz).
 */
final class Raw
{
    public $type;
    public $body;
    public $file;
    public $headers;
    public $http;

    public function __construct($type, $body = '', $file = null, array $headers = [], $http = 200)
    {
        $this->type = (string)$type;
        $this->body = (string)$body;
        $this->file = $file;
        $this->headers = $headers;
        $this->http = (int)$http;
    }

    public static function text($type, $body, array $headers = [])
    {
        return new self($type, $body, null, $headers);
    }

    public static function file($type, $path, array $headers = [])
    {
        return new self($type, '', $path, $headers);
    }

    public function emit()
    {
        if (!headers_sent()) {
            http_response_code($this->http);
            header_remove('Content-Security-Policy');
            header('Content-Type: ' . $this->type);
            foreach ($this->headers as $k => $v) {
                header($k . ': ' . str_replace(["\r", "\n"], '', (string)$v));
            }
            if ($this->file !== null) {
                header('Content-Length: ' . (int)@filesize($this->file));
            }
        }
        if ($this->file === null) {
            echo $this->body;
            return;
        }
        $fh = @fopen($this->file, 'rb');
        if (!$fh) {
            return;
        }
        while (!feof($fh)) {
            echo fread($fh, 65536);
            if (connection_aborted()) {
                break;
            }
        }
        fclose($fh);
    }
}
