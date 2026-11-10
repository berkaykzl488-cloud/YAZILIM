<?php
namespace YP\Mail;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * E-posta taşıyıcısı. send() dönüşü: ['ok'=>bool, 'id'=>string|null, 'error'=>string (Türkçe), 'retry'=>bool]
 * $m: to, toName, from, fromName, subject, text, html?
 */
interface Transport
{
    public function name();

    public function send(array $m);
}
