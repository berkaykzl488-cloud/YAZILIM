<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Doğrulama: alan hatalarını toplar, done() ile 422 {fields:{…}} fırlatır.
 *   $v = new V($body); $name = $v->str('name', 3, 20, '/…/u', 'Kullanıcı adı …'); $v->done();
 */
final class V
{
    private $in;
    public $errors = [];

    const RX_NAME = '/^[A-Za-z0-9_ÇĞİÖŞÜçğıöşü]{3,20}$/u';
    const RX_PERSON = '/^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû\' .\-]{2,40}$/u';
    const RX_EMAIL = '/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/';

    public function __construct($in)
    {
        $this->in = is_array($in) ? $in : [];
    }

    public function has($k)
    {
        return array_key_exists($k, $this->in) && $this->in[$k] !== null;
    }

    public function raw($k)
    {
        return isset($this->in[$k]) ? $this->in[$k] : null;
    }

    public function err($k, $msg)
    {
        if (!isset($this->errors[$k])) {
            $this->errors[$k] = $msg;
        }
        return null;
    }

    public function str($k, $min = 0, $max = 255, $rx = null, $msg = null)
    {
        $v = $this->raw($k);
        if ($v !== null && !is_scalar($v)) {
            return $this->err($k, $msg ?: 'Geçersiz değer.');
        }
        $s = yp_str($v === null ? '' : $v, $max + 1);
        if ($min > 0 && $s === '') {
            return $this->err($k, $msg ?: 'Bu alan zorunlu.');
        }
        if ($s !== '' && (yp_strlen($s) < $min || yp_strlen($s) > $max)) {
            return $this->err($k, $msg ?: ($min . '–' . $max . ' karakter olmalı.'));
        }
        if ($s !== '' && $rx && !preg_match($rx, $s)) {
            return $this->err($k, $msg ?: 'Geçersiz değer.');
        }
        return $s;
    }

    /** Şifre: kırpılmaz, kontrol karakteri içeremez */
    public function password($k, $min, $msg = null)
    {
        $v = $this->raw($k);
        if (!is_string($v) || $v === '') {
            return $this->err($k, 'Şifre zorunlu.');
        }
        if (strlen($v) > 200) {
            return $this->err($k, 'Şifre en fazla 200 karakter olabilir.');
        }
        if (preg_match('/[\x00-\x1F\x7F]/', $v)) {
            return $this->err($k, 'Şifre geçersiz karakter içeriyor.');
        }
        if (yp_strlen($v) < $min) {
            return $this->err($k, $msg ?: ('Şifre en az ' . $min . ' karakter olmalı.'));
        }
        return $v;
    }

    public function email($k, $required = true)
    {
        $s = $this->str($k, $required ? 1 : 0, 190, null, $required ? 'E-posta adresi zorunlu.' : null);
        if ($s === null || $s === '') {
            return $s;
        }
        if (!preg_match(self::RX_EMAIL, $s) || filter_var($s, FILTER_VALIDATE_EMAIL) === false) {
            return $this->err($k, 'Geçerli bir e-posta adresi yazın.');
        }
        return strtolower($s);
    }

    /** Türk cep telefonu → "05xx xxx xx xx" */
    public function tel($k, $required = true)
    {
        $v = $this->raw($k);
        $d = preg_replace('/\D/', '', is_scalar($v) ? (string)$v : '');
        if ($d === '') {
            return $required ? $this->err($k, 'Cep telefonu zorunlu.') : '';
        }
        if (strlen($d) === 12 && strncmp($d, '90', 2) === 0) {
            $d = substr($d, 2);
        }
        if (!preg_match('/^0?5\d{9}$/', $d)) {
            return $this->err($k, 'Cep telefonunu 05xx xxx xx xx şeklinde girin.');
        }
        return Text::formatTel($d);
    }

    public function bool($k, $default = false)
    {
        return $this->has($k) ? yp_bool($this->raw($k)) : $default;
    }

    public function int($k, $min, $max, $default = null)
    {
        if (!$this->has($k) || $this->raw($k) === '') {
            return $default;
        }
        $v = $this->raw($k);
        if (!is_numeric($v) || (int)$v != $v) {
            return $this->err($k, 'Tam sayı olmalı.');
        }
        $v = (int)$v;
        if ($v < $min || $v > $max) {
            return $this->err($k, $min . ' ile ' . $max . ' arasında olmalı.');
        }
        return $v;
    }

    public function oneOf($k, array $allowed, $default = null)
    {
        if (!$this->has($k)) {
            return $default;
        }
        $v = $this->raw($k);
        if (!is_scalar($v) || !in_array((string)$v, $allowed, true)) {
            return $this->err($k, 'Geçersiz seçim.');
        }
        return (string)$v;
    }

    public function done($msg = null)
    {
        if ($this->errors) {
            throw HttpError::validation($this->errors, $msg);
        }
    }
}
