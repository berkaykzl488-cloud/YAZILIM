<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * Idempotency-Key: aynı (kullanıcı, anahtar) ile gelen tekrar istek, ilk yanıtı aynen döndürür.
 * Para işlemlerinin (P2+) hepsinde zorunlu. Anahtar 8–80 karakter [A-Za-z0-9_-].
 */
final class Idem
{
    /** $fn(): array (yanıt gövdesi). Dönüş: [http, body, replayed] */
    public static function run(Db $db, $userId, $key, $route, callable $fn)
    {
        if (!is_string($key) || !preg_match('/^[A-Za-z0-9_\-]{8,80}$/', $key)) {
            throw new HttpError(400, 'İstek anahtarı (Idempotency-Key) eksik ya da geçersiz.', 'idem_key');
        }
        $old = $db->one('SELECT route, http, response FROM {idempotency_keys} WHERE user_id=? AND ikey=?', [(int)$userId, $key]);
        if ($old) {
            if ($old['route'] !== $route) {
                throw new HttpError(409, 'Bu istek anahtarı başka bir işlemde kullanılmış.', 'idem_conflict');
            }
            return [(int)$old['http'], json_decode($old['response'], true), true];
        }
        $body = $fn();
        try {
            $db->insert('idempotency_keys', [
                'user_id' => (int)$userId, 'ikey' => $key, 'route' => yp_str($route, 120), 'http' => 200,
                'response' => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 't' => yp_now_ms(),
            ]);
        } catch (\PDOException $e) {
            if (!$db->isDuplicate($e)) {
                throw $e;
            }
            // yarış: diğer istek önce yazdı — onun yanıtını döndür
            $old = $db->one('SELECT http, response FROM {idempotency_keys} WHERE user_id=? AND ikey=?', [(int)$userId, $key]);
            return [(int)$old['http'], json_decode($old['response'], true), true];
        }
        return [200, $body, false];
    }

    public static function cleanup(Db $db, $olderThanMs = 86400000)
    {
        return $db->exec('DELETE FROM {idempotency_keys} WHERE t<?', [yp_now_ms() - $olderThanMs]);
    }
}
