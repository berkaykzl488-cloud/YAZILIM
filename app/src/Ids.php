<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/** Ön yüz kimlikleri: kullanıcı 'u12', bildirim 'n5', IBAN 'ib3'. Sayısal kimlik de kabul edilir. */
final class Ids
{
    public static function parse($v, $prefix)
    {
        $s = is_scalar($v) ? (string)$v : '';
        if (strncmp($s, $prefix, strlen($prefix)) === 0) {
            $s = substr($s, strlen($prefix));
        }
        if (!preg_match('/^[1-9][0-9]{0,17}$/', $s)) {
            throw HttpError::notFound();
        }
        return (int)$s;
    }

    public static function user($v)
    {
        return self::parse($v, 'u');
    }

    public static function u($id)
    {
        return $id === null ? null : 'u' . (int)$id;
    }
}
