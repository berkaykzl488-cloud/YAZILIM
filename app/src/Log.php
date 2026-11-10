<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** storage/log/YYYY-MM.log — bağlam yp_redact ile maskelenir. */
final class Log
{
    public static function write($channel, $msg, array $ctx = [])
    {
        try {
            $dir = YP_STORAGE . '/log';
            if (!is_dir(YP_STORAGE)) {
                return;
            }
            yp_ensure_dir($dir);
            $line = date('c') . ' [' . preg_replace('/[^a-z_]/', '', $channel) . '] ' . str_replace(["\r", "\n"], ' ', (string)$msg);
            if ($ctx) {
                $line .= ' ' . json_encode(yp_redact($ctx), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            @file_put_contents($dir . '/' . date('Y-m') . '.log', $line . "\n", FILE_APPEND | LOCK_EX);
        } catch (\Throwable $e) {
        }
    }
}
