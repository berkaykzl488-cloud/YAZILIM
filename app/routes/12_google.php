<?php
/**
 * Google ile giriş / üyelik (ayrıntı: app/src/Google.php)
 *   GET  auth/google/start?mode=login|register|link&ret=<rota>   302 → accounts.google.com (state, nonce, PKCE oturumda)
 *   GET  auth/google/callback?code&state                        Google dönüşü → 302 <site>/?gauth=<sonuç>#<rota>
 *   GET  auth/google/pending                                    bekleyen sonuç: kayıt formu / şifreyle bağlama / kod adımı
 *   POST auth/google/register {name, tel, ad, soyad, ref?, src?, kvkk}   "Google ile kaydı tamamla" (şifresiz hesap)
 *   POST auth/google/link {password}                            e-postası eşleşen hesaba bir kez şifreyle girip bağlama
 *   POST me/google/unlink                                       bağlantıyı kaldır (yalnız şifre varsa)
 *   GET  admin/integrations/google        [muhasebe|odeme|ayar] Yönetim › Entegrasyonlar kartı (Secret maskeli)
 *   PUT  admin/integrations/google        [ayar]  {on, client_id, client_secret, clear?:['client_secret']}
 *   POST admin/integrations/google/test   [ayar]  "Bağlantıyı test et"
 * Bu dosya 80_integrations.php'den önce yüklenir: admin/integrations/google, admin/integrations/{svc} kalıbından önce eşleşir.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Google;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Notify;
use YP\Present;
use YP\RateLimit;
use YP\Settings;
use YP\Text;
use YP\V;

return function (Router $r) {
    $r->get('auth/google/start', function (Req $q, Db $db) {
        return Google::start($q, $db);
    }, ['auth' => 'none']);

    // Google'dan dönüş başka siteden üst düzey bir GET gezinmesidir (Sec-Fetch-Site: cross-site): köken denetimi atlanır,
    // koruma oturumdaki tek kullanımlık state + PKCE'dir.
    $r->get('auth/google/callback', function (Req $q, Db $db) {
        return Google::callback($q, $db);
    }, ['auth' => 'none', 'xsite' => true]);

    $r->get('auth/google/pending', function (Req $q, Db $db) {
        return ['data' => ['pending' => Google::pendingView($db)]];
    }, ['auth' => 'none']);

    $gone = function () {
        return new HttpError(400, 'Google ile giriş isteğinin süresi doldu. Lütfen "Google ile devam et" düğmesine yeniden basın.', 'g_gone');
    };

    $r->post('auth/google/register', function (Req $q, Db $db) use ($gone) {
        RateLimit::enforce('reg_ip:' . $q->ip, 5, 3600, false, 'Bu bağlantıdan bir saat içinde çok fazla üyelik açıldı. Lütfen daha sonra tekrar deneyin.');
        if (Auth::$user) {
            throw new HttpError(409, 'Zaten giriş yapmış durumdasınız.', 'logged_in');
        }
        $p = Google::pending();
        if (!$p || $p['k'] !== 'register') {
            throw $gone();
        }
        $in = $q->body();
        $v = new V($in);
        // normal üyelikle aynı kurallar (auth/register); e-posta Google'dan (doğrulanmış) gelir, şifre yok
        $name = $v->str('name', 3, 20, V::RX_NAME, 'Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi kullanın.');
        $tel = $v->tel('tel');
        $ad = $v->str('ad', 2, 40, V::RX_PERSON, 'Ad ve soyadı kimliğinizdeki gibi, yalnızca harflerle yazın.');
        $soyad = $v->str('soyad', 2, 40, V::RX_PERSON, 'Ad ve soyadı kimliğinizdeki gibi, yalnızca harflerle yazın.');
        $ref = strtoupper((string)$v->str('ref', 0, 40));
        $src = $v->str('src', 0, 60);
        if (!isset($in['kvkk']) || !yp_bool($in['kvkk'])) {
            $v->err('kvkk', 'KVKK aydınlatma metnini ve üyelik sözleşmesini onaylayın.');
        }
        $v->done();
        $email = (string)$p['email'];
        $norm = Text::fold($name);
        if ($db->val('SELECT id FROM {users} WHERE name_norm=?', [$norm])) {
            throw HttpError::validation(['name' => 'Bu kullanıcı adı alınmış.']);
        }
        if ($db->val('SELECT id FROM {users} WHERE email=?', [$email])) {
            throw HttpError::validation(['email' => 'Bu e-posta ile kayıtlı bir hesap var. "Google ile devam et" ile yeniden deneyin.']);
        }
        if ($db->val('SELECT id FROM {users} WHERE google_sub=?', [$p['sub']])) {
            throw new HttpError(409, 'Bu Google hesabı zaten bir üyeliğe bağlı. "Google ile devam et" ile giriş yapın.', 'google_taken');
        }
        $site = Settings::get('site', $db);
        $refUser = null;
        if ($ref !== '' && !empty($site['refOn'])) {
            $refUser = $db->one("SELECT id, name FROM {users} WHERE ref_code=? AND role<>'admin' AND status='active' ORDER BY id LIMIT 1", [$ref]);
            if (!$refUser) {
                throw HttpError::validation(['ref' => 'Davet kodu bulunamadı.']);
            }
        }
        $now = yp_now_ms();
        try {
            $id = $db->tx(function (Db $db) use ($name, $norm, $email, $tel, $ad, $soyad, $refUser, $src, $now, $p) {
                $id = $db->insert('users', [
                    'name' => $name, 'name_norm' => $norm, 'email' => $email, 'tel' => $tel, 'ad' => $ad, 'soyad' => $soyad,
                    'pass_hash' => Google::unusableHash(), 'role' => 'member', 'status' => 'active', 'joined_at' => $now, 'last_seen' => $now,
                    'ref_by' => $refUser ? (int)$refUser['id'] : null, 'ref_code' => Text::refCode($name), 'src' => $src ?: null,
                    'session_ver' => 1, 'created_at' => $now, 'google_sub' => (string)$p['sub'], 'google_email' => $email,
                ]);
                $db->insert('wallets', ['user_id' => $id, 'cash' => 0, 'credit' => 0, 'updated_at' => $now]);
                return $id;
            });
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw HttpError::validation(['name' => 'Bu kullanıcı adı veya e-posta zaten kayıtlı.']);
            }
            throw $e;
        }
        RateLimit::add('reg_ip:' . $q->ip, 3600);
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [$id]);
        Notify::send($db, $id, 'Hoş geldin ' . $name . '! Hesabın oluşturuldu.', '#hesabim', 'welcome');
        if ($refUser) {
            Notify::send($db, $refUser['id'], $name . ' davet linkin/kodunla üye oldu. İlk alışverişini tamamlayınca ' . $site['refBonus'] . ' TL hediye bakiye kazanacaksın.', '#hesabim');
        }
        Audit::log($db, $id, 'register', 'user', $id, ['ref' => $refUser ? $refUser['id'] : null, 'google' => true]);
        Audit::log($db, $id, 'google_link', 'user', $id, ['via' => 'register', 'email' => $email]);
        $csrf = Auth::login($db, $u, true); // oturum yenilenir: bekleyen Google verisi silinir
        return ['msg' => 'Hoş geldin ' . $name . '!', 'data' => ['me' => Present::me($db, $u), 'csrf' => $csrf]];
    }, ['auth' => 'none']);

    $r->post('auth/google/link', function (Req $q, Db $db) use ($gone) {
        if (Auth::$user) {
            throw new HttpError(409, 'Zaten giriş yapmış durumdasınız.', 'logged_in');
        }
        $p = Google::pending();
        if (!$p || $p['k'] !== 'link') {
            throw $gone();
        }
        $in = $q->body();
        $pass = isset($in['password']) && is_string($in['password']) ? $in['password'] : '';
        if ($pass === '') {
            throw HttpError::validation(['password' => 'Şifrenizi yazın.']);
        }
        // auth/login ile aynı hız sınırları (aynı anahtarlar)
        $acc = 'login_acc:' . Text::fold(strtolower((string)$p['email']));
        RateLimit::enforce('login_ip:' . $q->ip, 5, 900, false);
        RateLimit::enforce($acc, 10, 3600, false, 'Bu hesap için çok fazla hatalı deneme yapıldı. Lütfen bir saat sonra tekrar deneyin.');
        $u = Auth::verifyCredentials($db, (string)$p['email'], $pass);
        if (!$u || (int)$u['id'] !== (int)$p['uid']) {
            RateLimit::add('login_ip:' . $q->ip, 900);
            RateLimit::add($acc, 3600);
            usleep(250000);
            Audit::log($db, null, 'login_fail', 'login', '', ['login' => yp_str((string)$p['email'], 60), 'google' => true]);
            throw new HttpError(401, 'Şifre hatalı.', 'bad_login');
        }
        if ($u['status'] !== 'active') {
            Audit::log($db, $u['id'], 'login_banned', 'user', $u['id'], ['google' => true]);
            throw new HttpError(403, 'Hesabınız askıya alınmış. Canlı destekle görüşün.', 'banned');
        }
        RateLimit::reset($acc);
        $other = $db->val('SELECT id FROM {users} WHERE google_sub=?', [$p['sub']]);
        if ($other && (int)$other !== (int)$u['id']) {
            throw new HttpError(409, 'Bu Google hesabı başka bir üyeliğe bağlı.', 'google_taken');
        }
        $res = Google::finish($db, $u, ['k' => 'link', 'sub' => $p['sub'], 'email' => $p['email']]);
        if (isset($res['tfa'])) {
            return ['tfa' => $res['tfa'], 'msg' => 'Doğrulama kodu gönderildi.'];
        }
        return ['msg' => 'Google hesabınız bağlandı. Hoş geldin ' . $res['u']['name'] . '!', 'data' => ['me' => Present::me($db, $res['u']), 'csrf' => $res['csrf']]];
    }, ['auth' => 'none']);

    $r->post('me/google/unlink', function (Req $q, Db $db) {
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)Auth::$user['id']]);
        Google::unlink($db, $u);
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
        return ['msg' => 'Google bağlantısı kaldırıldı.', 'patch' => ['me' => Present::me($db, $u)]];
    });

    /* ---- Yönetim › Entegrasyonlar › Google ile giriş ---- */
    $r->get('admin/integrations/google', function (Req $q, Db $db) {
        return ['data' => ['google' => Google::view($db, Auth::$user)]];
    }, ['auth' => 'staff', 'perm' => ['muhasebe', 'odeme', 'ayar'], 'csrf' => false]);

    $r->put('admin/integrations/google', function (Req $q, Db $db) {
        $in = $q->body();
        $v = Google::save($db, Auth::$user, is_array($in) ? $in : []);
        return ['msg' => 'Google ile giriş ayarları kaydedildi.' . ($v['configured'] ? ($v['on'] ? ' Düğme üyelik ve giriş pencerelerinde görünüyor.' : ' Açmak için "Google ile giriş açık" kutusunu işaretleyin.') : ''),
            'data' => ['google' => $v], 'patch' => ['set' => ['googleOn' => $v['enabled']]]];
    }, ['auth' => 'staff', 'perm' => 'ayar']);

    $r->post('admin/integrations/google/test', function (Req $q, Db $db) {
        RateLimit::enforce('integ_test:' . (int)Auth::$user['id'], 20, 300, true, 'Çok fazla deneme yaptınız. 5 dakika sonra tekrar deneyin.');
        $res = Google::test($db, Auth::$user);
        return ['data' => ['ok' => $res['ok'], 'msg' => $res['msg'], 'google' => Google::view($db, Auth::$user)], 'msg' => $res['ok'] ? $res['msg'] : null];
    }, ['auth' => 'staff', 'perm' => 'ayar']);
};
