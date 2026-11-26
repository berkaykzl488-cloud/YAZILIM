<?php
/**
 * "Şifremi unuttum" (P6). Ayrıntı ve kurallar: app/src/PassReset.php
 *   POST auth/forgot {login}                         her zaman aynı yanıt; hız sınırı IP başına 5 / 15 dk, yazılan ad başına 3 / saat
 *   POST auth/reset  {token, password}               e-postadaki bağlantıyla
 *                    {login, code, password}         6 haneli kodla (e-posta ya da WhatsApp)
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Http\Req;
use YP\Http\Router;
use YP\PassReset;
use YP\RateLimit;
use YP\Text;

return function (Router $r) {
    $r->post('auth/forgot', function (Req $q, Db $db) {
        $t0 = microtime(true);
        $in = $q->body();
        $login = yp_str(isset($in['login']) && is_string($in['login']) ? $in['login'] : '', 190);
        if (trim($login) === '') {
            throw \YP\Http\HttpError::validation(['login' => 'Kullanıcı adınızı veya e-posta adresinizi yazın.']);
        }
        // anahtar yazılan metinden üretilir (hesap olsun olmasın aynı): sınır da hesabın varlığını ele vermez
        RateLimit::enforce('forgot_ip:' . $q->ip, 5, 900, true, 'Çok fazla şifre sıfırlama isteği. Lütfen 15 dakika sonra tekrar deneyin.');
        RateLimit::enforce('forgot_acc:' . Text::fold(strtolower(trim($login))), 3, 3600, true, 'Bu hesap için çok fazla şifre sıfırlama isteği yapıldı. Lütfen bir saat sonra tekrar deneyin.');
        PassReset::request($db, $login, $q->ip);
        PassReset::pad($t0);
        return ['msg' => PassReset::generic(), 'data' => ['sent' => true]];
    }, ['auth' => 'none']);

    $r->post('auth/reset', function (Req $q, Db $db) {
        RateLimit::enforce('reset_ip:' . $q->ip, 10, 900, true, 'Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar deneyin.');
        $u = PassReset::reset($db, $q->body(), $q->ip);
        return ['msg' => 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.', 'data' => ['login' => $u['name']]];
    }, ['auth' => 'none']);
};
