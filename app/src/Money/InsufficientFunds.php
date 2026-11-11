<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** Bakiye yetersiz (defter güvenlik ağı; çağıranlar önceden Türkçe hata verir) */
final class InsufficientFunds extends \RuntimeException
{
}
