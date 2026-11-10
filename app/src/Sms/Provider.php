<?php
namespace YP\Sms;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** SMS sağlayıcısı. send() dönüşü: ['ok'=>bool, 'id'=>?string, 'error'=>string, 'retry'=>bool] */
interface Provider
{
    public function name();

    /** $to: 10 haneli 5xxxxxxxxx */
    public function send($to, $text);
}
