<?php
namespace YP\Http;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** Türkçe hata yanıtı: {ok:false, error, code, fields?, …} */
final class HttpError extends \RuntimeException
{
    public $http;
    public $errCode;
    public $extra;
    public $headers;

    public function __construct($http, $msg, $code = 'error', array $extra = [], array $headers = [])
    {
        parent::__construct($msg);
        $this->http = (int)$http;
        $this->errCode = $code;
        $this->extra = $extra;
        $this->headers = $headers;
    }

    public static function forbidden($msg = 'Bu işlem için yetkiniz yok.')
    {
        return new self(403, $msg, 'forbidden');
    }

    public static function auth($msg = 'Bu işlem için giriş yapmanız gerekiyor.')
    {
        return new self(401, $msg, 'auth');
    }

    public static function notFound($msg = 'Kayıt bulunamadı.')
    {
        return new self(404, $msg, 'not_found');
    }

    public static function conflict($msg)
    {
        return new self(409, $msg, 'conflict');
    }

    public static function validation(array $fields, $msg = null)
    {
        return new self(422, $msg ?: (string)reset($fields), 'validation', ['fields' => $fields]);
    }

    public function body()
    {
        return array_merge(['ok' => false, 'error' => $this->getMessage(), 'code' => $this->errCode], $this->extra);
    }
}
