<?php
namespace YP\Http;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Cron;
use YP\Db;
use YP\Log;
use YP\Settings;
use YP\Store;
use YP\Updater;

/**
 * /api/v1/* ön denetleyicisi: güvenlik başlıkları → kurulum/veritabanı → rota → köken (origin) → oturum →
 * CSRF → yetki → işleyici. Yanıt her zaman JSON: {ok:true, msg?, data?, patch?} | {ok:false, error, code, fields?}
 */
final class Kernel
{
    public static function run()
    {
        set_error_handler(function ($no, $str, $file, $line) {
            if (!(error_reporting() & $no)) {
                return false;
            }
            throw new \ErrorException($str, 0, $no, $file, $line);
        });
        if (!headers_sent()) {
            header('X-Content-Type-Options: nosniff');
            header('X-Frame-Options: DENY');
            header('Referrer-Policy: no-referrer');
            header('Cache-Control: no-store, max-age=0');
            header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
            header_remove('X-Powered-By');
        }
        $http = 200;
        $headers = [];
        $db = null;
        try {
            $req = Req::fromGlobals();
            list($http, $body, $db) = self::dispatch($req);
        } catch (HttpError $e) {
            $http = $e->http;
            $body = $e->body();
            $headers = $e->headers;
        } catch (\Throwable $e) {
            Log::write('hata', 'API hatası: ' . get_class($e) . ': ' . $e->getMessage(), ['dosya' => basename($e->getFile()) . ':' . $e->getLine()]);
            $http = 500;
            $body = ['ok' => false, 'error' => 'Sunucuda beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.', 'code' => 'server_error'];
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        if ($body instanceof Raw) {
            $body->emit();
            if ($db) {
                self::lazyCron($db);
            }
            return;
        }
        if (!headers_sent()) {
            http_response_code($http);
            header('Content-Type: application/json; charset=utf-8');
            foreach ($headers as $k => $v) {
                header($k . ': ' . str_replace(["\r", "\n"], '', $v));
            }
        }
        $out = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
        echo $out === false ? '{"ok":false,"error":"Yanıt oluşturulamadı.","code":"encode"}' : $out;
        if ($db) {
            self::lazyCron($db);
        }
    }

    /** @return array [http, body, db] */
    public static function dispatch(Req $req, ?Router $router = null)
    {
        if ($req->method === 'OPTIONS') {
            return [204, [], null];
        }
        if (!Store::installed()) {
            throw new HttpError(503, 'Site henüz kurulmadı. Kurulumu /kurulum/ adresinden tamamlayın.', 'not_installed');
        }
        Store::requireKey();
        $db = Db::connect(Store::dbConfig());
        Db::setMain($db);
        Settings::clearCache();
        // Yeni sürüm yüklendiyse (zip/FTP) eksik tablolar ve göçler kilitli, tek seferlik olarak burada uygulanır.
        Updater::ensure($db);

        $router = $router ?: Router::loadDir();
        list($route, $params, $allowed) = $router->match($req->method, $req->path);
        if (!$route) {
            if ($allowed) {
                throw new HttpError(405, 'Bu adres bu yöntemle (' . $req->method . ') kullanılamaz.', 'method', [], ['Allow' => implode(', ', $allowed)]);
            }
            throw new HttpError(404, 'İstenen API adresi bulunamadı.', 'not_found');
        }
        $req->params = $params;
        $req->route = $route;
        $opt = $route['opt'];

        self::checkOrigin($req, $db);
        Auth::boot($db, $req);
        if ($opt['csrf']) {
            Auth::checkCsrf($req);
        }
        if ($opt['auth'] === 'user') {
            Auth::requireUser();
        } elseif ($opt['auth'] === 'staff') {
            Auth::requireStaff($opt['perm']);
        }
        $out = call_user_func($route['fn'], $req, $db);
        if ($out instanceof Raw) {
            return [$out->http, $out, $db];
        }
        if (!is_array($out)) {
            $out = [];
        }
        return [200, array_merge(['ok' => true], $out), $db];
    }

    /** Başka sitelerden gelen tarayıcı isteklerini reddeder. */
    public static function checkOrigin(Req $req, ?Db $db = null)
    {
        if (strtolower($req->header('sec-fetch-site')) === 'cross-site') {
            throw new HttpError(403, 'Başka bir siteden gelen istekler kabul edilmez.', 'origin');
        }
        $o = $req->header('origin');
        if ($o === '') {
            return;
        }
        $o = strtolower(rtrim($o, '/'));
        $allowed = [yp_request_origin()];
        try {
            $site = Settings::get('site', $db);
            if (!empty($site['siteUrl'])) {
                $allowed[] = yp_origin_of($site['siteUrl']);
            }
        } catch (\Throwable $e) {
        }
        if (!in_array($o, $allowed, true)) {
            throw new HttpError(403, 'Başka bir siteden gelen istekler kabul edilmez.', 'origin');
        }
    }

    /** Cron 10 dakikadan uzun süredir çalışmadıysa yanıt gönderildikten sonra kısa bir tik çalıştır. */
    private static function lazyCron(Db $db)
    {
        $finish = function_exists('litespeed_finish_request') ? 'litespeed_finish_request' : (function_exists('fastcgi_finish_request') ? 'fastcgi_finish_request' : null);
        $fresh = !empty(\YP\Outbox::$fresh);
        try {
            $late = Cron::late($db);
            if (!$late && !$fresh) {
                return;
            }
            if ($finish) {
                $finish(); // yanıt kullanıcıya gitti; aşağısı arka planda çalışır
            } elseif (!$fresh) {
                return; // yanıtı kesemiyorsak gecikmeli cron'u çalıştırma (kullanıcı beklemesin)
            }
            if ($fresh) {
                \YP\Outbox::flushFresh($db); // hoş geldin vb. iletiler cron'u beklemeden gitsin
            }
            if ($late && $finish) {
                Cron::run($db, 20, 'lazy');
            }
        } catch (\Throwable $e) {
            Log::write('hata', 'Gecikmeli cron: ' . $e->getMessage());
        }
    }
}
