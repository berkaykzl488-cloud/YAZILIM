<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Basit kanca kaydı: rota dosyaları (app/routes/NN_*.php, yüklenirken) çekirdek yanıtlara ek veri katabilir.
 *   Hooks::on('boot', function (array $data, Db $db, $user) { …; return $data; });
 *   Hooks::run('boot', $data, $db, $user)  (00_core.php boot/poll)
 * Böylece her alan kendi dosyasında kalır; 00_core.php'yi değiştirmek gerekmez.
 */
final class Hooks
{
    private static $h = [];

    /** $key: aynı anahtarla yeniden kayıt öncekinin yerine geçer (rota dosyaları bir süreçte birden çok yüklenebilir) */
    public static function on($name, callable $fn, $key = null)
    {
        if ($key === null) {
            self::$h[$name][] = $fn;
        } else {
            self::$h[$name][$key] = $fn;
        }
    }

    public static function run($name, $value, ...$args)
    {
        foreach (isset(self::$h[$name]) ? self::$h[$name] : [] as $fn) {
            $r = $fn($value, ...$args);
            if ($r !== null) {
                $value = $r;
            }
        }
        return $value;
    }

    public static function reset()
    {
        self::$h = [];
    }
}
