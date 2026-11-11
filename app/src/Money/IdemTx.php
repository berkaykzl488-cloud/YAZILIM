<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;

/**
 * Para işlemleri için işlem içi Idempotency-Key (PLAN §1.2 Idem).
 * Anahtar satırı, para hareketiyle AYNI veritabanı işleminde yazılır: aynı anahtarla eşzamanlı iki istekten yalnız biri
 * işlenir (MySQL: benzersiz anahtar ikinciyi bekletir, birincisi bitince ikincisi geri alınıp ilk yanıtı döndürür;
 * SQLite: BEGIN IMMEDIATE zaten sıralar). Hata (HttpError) durumunda anahtar yazılmaz; düzeltilmiş istek aynı anahtarla
 * yeniden denenebilir.
 */
final class IdemTx
{
    /** Anahtar başlıktan; $required ise yoksa 400. Dönüş: anahtar ya da null */
    public static function key(Req $q, $required)
    {
        $k = $q->header('idempotency-key');
        if ($k === '') {
            if ($required) {
                throw new HttpError(400, 'İstek anahtarı (Idempotency-Key) eksik. Sayfayı yenileyip tekrar deneyin.', 'idem_key');
            }
            return null;
        }
        if (!preg_match('/^[A-Za-z0-9_\-]{8,80}$/', $k)) {
            throw new HttpError(400, 'İstek anahtarı (Idempotency-Key) geçersiz.', 'idem_key');
        }
        return $k;
    }

    /**
     * $fn(Db): array yanıt gövdesi; işlem içinde çalışır. $after(array gövde): işlem bittikten sonra (yeniden oynatmada da)
     * gövdeye taze veri eklemek için (ör. güncel bakiye). Dönüş: gövde (+ 'replayed' => true)
     */
    public static function run(Db $db, $userId, $key, $route, callable $fn)
    {
        if ($key === null) {
            return $db->tx($fn);
        }
        $route = yp_str($route, 120);
        $replay = function () use ($db, $userId, $key, $route) {
            $old = $db->one('SELECT route, http, response FROM {idempotency_keys} WHERE user_id=? AND ikey=?', [(int)$userId, $key]);
            if (!$old) {
                return null;
            }
            if ($old['route'] !== $route) {
                throw new HttpError(409, 'Bu istek anahtarı başka bir işlemde kullanılmış.', 'idem_conflict');
            }
            $b = json_decode((string)$old['response'], true);
            if (!is_array($b)) {
                throw new HttpError(409, 'Bu işlem hâlâ sürüyor. Lütfen birkaç saniye sonra tekrar deneyin.', 'idem_busy');
            }
            $b['replayed'] = true;
            return $b;
        };
        try {
            return $db->tx(function (Db $db) use ($fn, $replay, $userId, $key, $route) {
                $old = $replay();
                if ($old !== null) {
                    return $old;
                }
                $db->insert('idempotency_keys', ['user_id' => (int)$userId, 'ikey' => $key, 'route' => $route, 'http' => 0, 'response' => '', 't' => yp_now_ms()]);
                $body = $fn($db);
                $db->update('idempotency_keys', ['http' => 200, 'response' => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)],
                    'user_id=? AND ikey=?', [(int)$userId, $key]);
                return $body;
            });
        } catch (\PDOException $e) {
            if (!$db->isDuplicate($e)) {
                throw $e;
            }
            $old = $replay();
            if ($old === null) {
                throw new HttpError(409, 'Bu işlem hâlâ sürüyor. Lütfen birkaç saniye sonra tekrar deneyin.', 'idem_busy');
            }
            return $old;
        }
    }
}
