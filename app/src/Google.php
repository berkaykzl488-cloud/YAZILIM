<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;
use YP\Http\Raw;
use YP\Money\Api;

/**
 * "Google ile devam et": sunucu tarafı OAuth 2.0 yetki kodu akışı (PKCE S256 + state + nonce). Google JS SDK kullanılmaz (CSP sade kalır).
 *
 * Ayar (settings.google, bütünüyle yp_encrypt ile şifreli): {on, client_id, client_secret}. Sahip yalnız panelden girer:
 * Yönetim › Entegrasyonlar › "Google ile giriş". Client Secret maskeli gösterilir; boş/maskeli gönderilen değer eskisini korur.
 *
 * Akış:
 *   1. GET auth/google/start?mode=login|register|link&ret=<rota> → oturuma {state, nonce, code_verifier} yazılır, 302 Google'a.
 *   2. GET auth/google/callback?code&state (Google'dan dönüş; başka siteden üst düzey gezinme olduğu için köken denetimi yok,
 *      state tek kullanımlıktır) → kod token uç noktasında client_secret + code_verifier ile id_token'a çevrilir.
 *   3. id_token doğrulaması: iss (accounts.google.com | https://accounts.google.com), aud = client_id, exp, nonce, email_verified.
 *      İMZA (JWKS) DENETLENMEZ: id_token tarayıcıdan değil, Google'ın token uç noktasından doğrudan TLS (sertifika doğrulamalı
 *      cURL) ve istemci kimlik doğrulamasıyla alınır; OpenID Connect Core 3.1.3.7 bu durumda TLS sunucu doğrulamasının imza
 *      denetimi yerine geçebileceğini söyler. Böylece anahtar indirme/önbellek ve RSA kodu gerekmez.
 *   4. SPA'ya dönüş: <site>/?gauth=<sonuç>#<rota>. Sonuçlar: ok, tfa, register, link, linked; hata: state, cancel, off, token,
 *      claims, unverified, banned, taken, already, conflict, rate, auth, err. Ayrıntı gerekiyorsa SPA GET auth/google/pending ister.
 *
 * Hesap eşleme (güvenli yol): users tablosunda e-posta doğrulama bayrağı yok (users.verified "onaylı satıcı" rozetidir), bu yüzden
 *   - google_sub kayıtlıysa → giriş (yasaklı ise engellenir; 2FA açıksa ve tarayıcı güvenilir değilse aynı kod adımı);
 *   - Google e-postası mevcut bir hesabınkiyle aynıysa SESSİZCE BAĞLANMAZ: üye bir kez o hesabın şifresiyle giriş yapar
 *     (POST auth/google/link, giriş ile aynı hız sınırları; 2FA varsa kod doğrulandıktan sonra) ve ancak o zaman bağlanır;
 *   - eşleşme yoksa → "Google ile kaydı tamamla" formu (kullanıcı adı, telefon, ad/soyad, KVKK onayı; normal üyelikle aynı
 *     doğrulamalar ve hız sınırı), şifresiz hesap (pass_hash '!' ile başlayan kullanılamaz değer; profilde şifre eklenebilir).
 * Testlerde (YP_TEST=1 + SQLite) Google uç noktaları TestMock 'google' ile sahtedir (bkz. mockHttp).
 */
final class Google
{
    const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
    const TOKEN_URL = 'https://oauth2.googleapis.com/token';
    const DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
    const ISS = ['accounts.google.com', 'https://accounts.google.com'];
    /** 1234567890-abc123….apps.googleusercontent.com */
    const RX_CLIENT_ID = '/^[0-9]{6,30}-[a-z0-9]{16,64}\.apps\.googleusercontent\.com$/';
    /** GOCSPX-… (yeni) ya da 24 karakter (eski) */
    const RX_SECRET = '/^[A-Za-z0-9_\-]{16,128}$/';
    const STATE_TTL = 600;
    const PENDING_TTL = 1800;
    const RX_RET = '#^[A-Za-z0-9][A-Za-z0-9_\-/]{0,120}$#';
    const MSG_FIELDS = 'Client ID ve Client Secret';

    /* ------------------------------------------------------------ ayar ------------------------------------------------------------ */

    public static function cfg(?Db $db = null)
    {
        $c = Settings::get('google', $db);
        $c = is_array($c) ? $c : [];
        return ['on' => !empty($c['on']), 'client_id' => isset($c['client_id']) ? (string)$c['client_id'] : '',
            'client_secret' => isset($c['client_secret']) ? (string)$c['client_secret'] : ''];
    }

    public static function configured(array $c)
    {
        return $c['client_id'] !== '' && $c['client_secret'] !== '';
    }

    /** Düğme gösterilsin mi (açık + bilgiler girilmiş) */
    public static function enabled(?Db $db = null)
    {
        try {
            $c = self::cfg($db);
        } catch (\Throwable $e) {
            return false;
        }
        return $c['on'] && self::configured($c);
    }

    /** Sitenin kökü (sonda / yok): site ayarındaki adres, yoksa isteğin kökeni (Api::siteBase ile aynı kural) */
    public static function siteRoot(Db $db)
    {
        return rtrim(Api::siteBase($db), '/');
    }

    /** Google Cloud'a yapıştırılacak "Yetkili yönlendirme URI'si" (LiteSpeed alt klasör rewrite'ı olmadan da çalışır) */
    public static function redirectUri(Db $db)
    {
        return self::siteRoot($db) . '/api/v1/index.php?r=auth/google/callback';
    }

    public static function canEdit($u)
    {
        return Perm::has($u, 'ayar');
    }

    public static function status(?Db $db = null)
    {
        $s = Settings::get('integ_status', $db);
        return is_array($s) && isset($s['google']) ? $s['google'] : null;
    }

    private static function setStatus(Db $db, $ok, $msg)
    {
        $s = Settings::get('integ_status', $db);
        $s = is_array($s) ? $s : [];
        $s['google'] = $ok === null ? null : ['ok' => (bool)$ok, 'msg' => yp_str($msg, 400), 't' => yp_now_ms()];
        Settings::set('integ_status', $s, null, $db);
    }

    /** Yönetim kartı: Client ID açık (gizli değildir, giriş adresinde görünür), Secret maskeli */
    public static function view(Db $db, $u)
    {
        $c = self::cfg($db);
        $root = self::siteRoot($db);
        return ['on' => $c['on'], 'configured' => self::configured($c), 'enabled' => $c['on'] && self::configured($c),
            'client_id' => $c['client_id'], 'client_secret' => yp_mask_secret($c['client_secret']),
            'redirect' => self::redirectUri($db), 'origin' => yp_origin_of($root) ?: $root, 'https' => stripos($root, 'https://') === 0,
            'lastTest' => self::status($db), 'canEdit' => self::canEdit($u)];
    }

    public static function save(Db $db, array $staff, array $in)
    {
        $c = self::cfg($db);
        $errors = [];
        $changed = [];
        if (array_key_exists('client_id', $in)) {
            $v = is_scalar($in['client_id']) ? trim((string)$in['client_id']) : '';
            if ($v !== '' && !preg_match(self::RX_CLIENT_ID, $v)) {
                $errors['g_cid'] = 'Client ID biçimi hatalı. Google Cloud\'daki "İstemci kimliği" …apps.googleusercontent.com ile biter; tamamını kopyalayın.';
            } elseif ($v !== $c['client_id']) {
                $c['client_id'] = $v;
                $changed[] = 'client_id';
            }
        }
        $clear = isset($in['clear']) && is_array($in['clear']) && in_array('client_secret', $in['clear'], true);
        if ($clear) {
            $c['client_secret'] = '';
            $changed[] = 'client_secret';
        } elseif (array_key_exists('client_secret', $in)) {
            $v = is_scalar($in['client_secret']) ? trim((string)$in['client_secret']) : '';
            if ($v !== '' && !yp_is_masked_input($v)) { // boş ya da maskeli → eski değer korunur
                if (!preg_match(self::RX_SECRET, $v)) {
                    $errors['g_sec'] = 'Client Secret biçimi hatalı (genelde GOCSPX- ile başlar). Boşluk bırakmadan yapıştırın.';
                } else {
                    $c['client_secret'] = $v;
                    $changed[] = 'client_secret';
                }
            }
        }
        if (array_key_exists('on', $in)) {
            $on = yp_bool($in['on']);
            if ($on !== $c['on']) {
                $changed[] = 'on';
            }
            $c['on'] = $on;
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }
        if ($c['on'] && !self::configured($c)) {
            throw HttpError::validation(['g_on' => 'Google ile girişi açmak için önce ' . self::MSG_FIELDS . ' girin.']);
        }
        Settings::set('google', $c, $staff['id'], $db);
        if (array_intersect($changed, ['client_id', 'client_secret'])) {
            self::setStatus($db, null, '');
        }
        Audit::log($db, $staff['id'], 'integration_save', 'settings', 'google', ['fields' => $changed, 'on' => $c['on']]);
        return self::view($db, $staff);
    }

    /**
     * "Bağlantıyı test et". Denetlenen: Client ID biçimi; Google'ın OpenID keşif belgesine ulaşılıyor mu (sunucudan dışarı HTTPS);
     * Client ID + Secret çifti Google tarafından tanınıyor mu (geçersiz bir kodla token isteği: invalid_client = bilgiler hatalı,
     * invalid_grant = bilgiler doğru). Denetlenemeyen: yönlendirme URI'sinin ve JavaScript kaynağının Google Cloud'a eklenmiş
     * olması, izin ekranının yayında (In production) olması — bunlar için ilk girişi kendiniz deneyin.
     */
    public static function test(Db $db, array $staff)
    {
        $c = self::cfg($db);
        if (!self::configured($c)) {
            throw new HttpError(422, 'Önce ' . self::MSG_FIELDS . ' girip Kaydet\'e basın.', 'not_configured');
        }
        $res = self::runTest($db, $c);
        self::setStatus($db, $res['ok'], $res['msg']);
        Audit::log($db, $staff['id'], 'integration_test', 'settings', 'google', ['ok' => $res['ok']]);
        return $res;
    }

    private static function runTest(Db $db, array $c)
    {
        if (!preg_match(self::RX_CLIENT_ID, $c['client_id'])) {
            return ['ok' => false, 'msg' => 'Client ID biçimi hatalı (…apps.googleusercontent.com ile bitmeli).'];
        }
        $d = self::http('GET', self::DISCOVERY_URL, []);
        if ($d['error'] !== '' || !$d['ok'] || !is_array($d['json'])) {
            return ['ok' => false, 'msg' => 'Google\'a ulaşılamadı: ' . ($d['error'] !== '' ? $d['error'] : 'HTTP ' . (int)$d['code']) . ' Hosting dış bağlantıları engelliyor olabilir.'];
        }
        $j = $d['json'];
        if (!isset($j['issuer']) || !in_array($j['issuer'], self::ISS, true) || empty($j['token_endpoint']) || empty($j['authorization_endpoint'])) {
            return ['ok' => false, 'msg' => 'Google keşif belgesi beklenen biçimde değil.'];
        }
        $t = self::http('POST', self::TOKEN_URL, ['form' => [
            'code' => 'yangpazar-baglanti-testi', 'client_id' => $c['client_id'], 'client_secret' => $c['client_secret'],
            'redirect_uri' => self::redirectUri($db), 'grant_type' => 'authorization_code', 'code_verifier' => str_repeat('t', 43),
        ]]);
        if ($t['error'] !== '') {
            return ['ok' => false, 'msg' => 'Google token sunucusuna ulaşılamadı: ' . $t['error']];
        }
        $err = is_array($t['json']) && isset($t['json']['error']) ? (string)$t['json']['error'] : '';
        if ($err === 'invalid_client' || $err === 'unauthorized_client') {
            return ['ok' => false, 'msg' => 'Google bu Client ID / Client Secret çiftini tanımadı. İkisini de Google Cloud › Kimlik bilgileri sayfasından yeniden kopyalayın.'];
        }
        if ($err === 'invalid_grant') {
            return ['ok' => true, 'msg' => 'Google bağlantısı başarılı: Client ID ve Client Secret Google tarafından tanındı. '
                . 'Yönlendirme adresinin Google Cloud\'a eklendiği ve uygulamanın yayında olduğu bu testle denetlenemez; ilk girişi kendiniz deneyin.'];
        }
        return ['ok' => false, 'msg' => 'Google beklenmeyen bir yanıt verdi (HTTP ' . (int)$t['code'] . ($err !== '' ? ', ' . yp_str($err, 60) : '') . ').'];
    }

    /* ------------------------------------------------------------ hesap ----------------------------------------------------------- */

    /** Şifresi var mı? Yalnız Google ile açılan hesapta pass_hash '!' ile başlayan, hiçbir şifreyle eşleşmeyen bir değerdir. */
    public static function hasPassword(array $u)
    {
        $h = isset($u['pass_hash']) ? (string)$u['pass_hash'] : '';
        return $h !== '' && $h[0] !== '!';
    }

    public static function unusableHash()
    {
        return '!google:' . bin2hex(random_bytes(24));
    }

    /** Google hesabını üyeye bağlar (sub benzersiz). Dönüş: true; başka hesaba bağlıysa HttpError 409 */
    public static function link(Db $db, $uid, $sub, $email, $via)
    {
        $other = $db->val('SELECT id FROM {users} WHERE google_sub=?', [(string)$sub]);
        if ($other && (int)$other !== (int)$uid) {
            throw new HttpError(409, 'Bu Google hesabı başka bir üyeliğe bağlı.', 'google_taken');
        }
        try {
            $db->exec("UPDATE {users} SET google_sub=?, google_email=? WHERE id=?", [(string)$sub, yp_str((string)$email, 190), (int)$uid]);
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw new HttpError(409, 'Bu Google hesabı başka bir üyeliğe bağlı.', 'google_taken');
            }
            throw $e;
        }
        Notify::send($db, $uid, 'Google hesabınız (' . Text::maskMail($email) . ') üyeliğinize bağlandı. Artık "Google ile devam et" ile giriş yapabilirsiniz.', '#hesabim');
        Audit::log($db, $uid, 'google_link', 'user', $uid, ['via' => $via, 'email' => (string)$email]);
        return true;
    }

    public static function unlink(Db $db, array $u)
    {
        if (empty($u['google_sub'])) {
            throw new HttpError(400, 'Hesabınıza bağlı bir Google hesabı yok.', 'google_none');
        }
        if (!self::hasPassword($u)) {
            throw new HttpError(422, 'Google bağlantısını kaldırmadan önce Profil ve güvenlik bölümünden bir şifre belirleyin; yoksa hesabınıza giriş yapamazsınız.', 'google_nopass');
        }
        $db->exec('UPDATE {users} SET google_sub=NULL, google_email=NULL WHERE id=?', [(int)$u['id']]);
        Notify::send($db, $u['id'], 'Google hesabınızın bağlantısı kaldırıldı. Giriş için kullanıcı adınız/e-postanız ve şifrenizi kullanın.', '#hesabim');
        Audit::log($db, $u['id'], 'google_unlink', 'user', $u['id']);
    }

    /** 2FA kodu doğrulandıktan sonra (auth/tfa/verify): bekleyen bağlama varsa yapılır. Dönüş: audit ek alanları */
    public static function afterTfa(Db $db, $uid, array $g)
    {
        $meta = ['google' => true];
        if (isset($g['k']) && $g['k'] === 'link' && !empty($g['sub'])) {
            try {
                self::link($db, $uid, $g['sub'], isset($g['email']) ? $g['email'] : '', 'email');
                $meta['linked'] = true;
            } catch (\Throwable $e) {
                $meta['link_fail'] = true;
            }
        }
        return $meta;
    }

    /** Google adından kullanılabilir bir kullanıcı adı önerisi (RX_NAME, boşta) */
    public static function suggestName(Db $db, array $p)
    {
        $clean = function ($s) {
            return mb_substr(preg_replace('/[^A-Za-z0-9_ÇĞİÖŞÜçğıöşü]/u', '', str_replace([' ', '.', '-'], '_', (string)$s)), 0, 16, 'UTF-8');
        };
        $base = trim($clean($p['given'] !== '' ? $p['given'] . ($p['family'] !== '' ? '_' . $p['family'] : '') : $p['name']), '_');
        if (mb_strlen($base, 'UTF-8') < 3) {
            $base = trim($clean(strstr($p['email'], '@', true) ?: ''), '_');
        }
        if (mb_strlen($base, 'UTF-8') < 3) {
            $base = 'Oyuncu';
        }
        $cand = $base;
        for ($i = 0; $i < 30; $i++) {
            if (!$db->val('SELECT id FROM {users} WHERE name_norm=?', [Text::fold($cand)])) {
                return $cand;
            }
            $cand = mb_substr($base, 0, 16, 'UTF-8') . random_int(10, 9999);
        }
        return '';
    }

    private static function person($s)
    {
        $s = trim(preg_replace('/\s+/u', ' ', (string)$s));
        return preg_match(V::RX_PERSON, $s) ? $s : '';
    }

    /* ------------------------------------------------------------ OAuth ----------------------------------------------------------- */

    public static function b64url($bin)
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }

    public static function challenge($verifier)
    {
        return self::b64url(hash('sha256', $verifier, true));
    }

    public static function cleanRet($r)
    {
        $r = is_string($r) ? trim($r, " /#") : '';
        return $r !== '' && preg_match(self::RX_RET, $r) && strpos($r, '..') === false ? $r : 'home';
    }

    /** SPA'ya dönüş: <site>/?gauth=<kod>#<rota> */
    public static function back(Db $db, $code, $ret = 'home')
    {
        $url = self::siteRoot($db) . '/?gauth=' . rawurlencode($code) . '#' . self::cleanRet($ret);
        return self::redirect($url);
    }

    public static function redirect($url)
    {
        $e = htmlspecialchars($url, ENT_QUOTES, 'UTF-8');
        return new Raw('text/html; charset=utf-8', '<!doctype html><meta charset="utf-8"><title>Yönlendiriliyor…</title><p><a href="' . $e . '">Devam et</a></p>',
            null, ['Location' => $url, 'Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer'], 302);
    }

    private static function sess($k)
    {
        return isset(Auth::$sess[$k]) && is_array(Auth::$sess[$k]) ? Auth::$sess[$k] : null;
    }

    /** Bekleyen Google sonucu (kayıt formu / şifreyle bağlama / kod adımı) */
    public static function pending()
    {
        $p = self::sess('gp');
        return $p && (int)$p['exp'] > time() ? $p : null;
    }

    public static function pendingView(Db $db)
    {
        $p = self::pending();
        if (!$p) {
            return null;
        }
        if ($p['k'] === 'register') {
            return ['k' => 'register', 'email' => $p['email'], 'name' => self::suggestName($db, $p), 'ad' => self::person($p['given']), 'soyad' => self::person($p['family']),
                'gname' => yp_str($p['name'], 80)];
        }
        if ($p['k'] === 'link') {
            return ['k' => 'link', 'email' => $p['email']];
        }
        if ($p['k'] === 'tfa') {
            $t = isset(Auth::$sess['tfa']) && is_array(Auth::$sess['tfa']) ? Auth::$sess['tfa'] : null;
            if (!$t || (int)$t['exp'] <= time() || (int)$t['cid'] !== (int)$p['tfa']['id']) {
                return null;
            }
            return ['k' => 'tfa', 'tfa' => $p['tfa']];
        }
        return null;
    }

    /** GET auth/google/start */
    public static function start(\YP\Http\Req $q, Db $db)
    {
        $mode = in_array($q->q('mode'), ['login', 'register', 'link'], true) ? $q->q('mode') : 'login';
        $ret = self::cleanRet($q->q('ret', 'home'));
        if (!self::enabled($db)) {
            return self::back($db, 'off', $ret);
        }
        // Google'a kayıtlı yönlendirme adresi site ayarındaki köke göredir: oturum çerezi aynı kökende olsun (www / www'suz)
        $want = yp_origin_of(self::redirectUri($db));
        if ($want !== '' && $want !== yp_request_origin() && !$q->q('hop')) {
            return self::redirect(self::siteRoot($db) . '/api/v1/index.php?r=auth/google/start&mode=' . $mode . '&ret=' . rawurlencode($ret) . '&hop=1');
        }
        if (!RateLimit::hit('g_start:' . $q->ip, 30, 900)['allowed']) {
            return self::back($db, 'rate', $ret);
        }
        $uid = 0;
        if ($mode === 'link') {
            if (!Auth::$user) {
                return self::back($db, 'auth', $ret);
            }
            $uid = (int)Auth::$user['id'];
        } elseif (Auth::$user) {
            return self::back($db, 'already_in', $ret);
        }
        $c = self::cfg($db);
        $state = self::b64url(random_bytes(24));
        $nonce = self::b64url(random_bytes(24));
        $verifier = self::b64url(random_bytes(48)); // 64 karakter (RFC 7636: 43–128)
        Auth::write(function (&$s) use ($state, $nonce, $verifier, $mode, $ret, $uid) {
            $s['g'] = ['st' => $state, 'n' => $nonce, 'cv' => $verifier, 'm' => $mode, 'r' => $ret, 'u' => $uid, 'exp' => time() + self::STATE_TTL];
            unset($s['gp']);
        });
        $url = self::AUTH_URL . '?' . http_build_query([
            'client_id' => $c['client_id'], 'redirect_uri' => self::redirectUri($db), 'response_type' => 'code',
            'scope' => 'openid email profile', 'state' => $state, 'nonce' => $nonce,
            'code_challenge' => self::challenge($verifier), 'code_challenge_method' => 'S256',
            'prompt' => 'select_account', 'access_type' => 'online', 'include_granted_scopes' => 'true',
        ], '', '&', PHP_QUERY_RFC3986);
        return self::redirect($url);
    }

    /** GET auth/google/callback */
    public static function callback(\YP\Http\Req $q, Db $db)
    {
        $g = self::sess('g');
        $ret = $g && isset($g['r']) ? self::cleanRet($g['r']) : 'home';
        $state = $q->q('state');
        if (!$g || (int)$g['exp'] < time() || $state === '' || !hash_equals((string)$g['st'], $state)) {
            // yanlış state bekleyen isteği silmez (başka sitenin gönderdiği sahte dönüş, sürmekte olan girişi bozamasın)
            Audit::log($db, Auth::$user ? Auth::$user['id'] : null, 'google_fail', 'login', '', ['why' => 'state']);
            return self::back($db, 'state', $ret);
        }
        Auth::write(function (&$s) {
            unset($s['g']); // tek kullanımlık
        });
        if ($q->q('error') !== '') {
            return self::back($db, $q->q('error') === 'access_denied' ? 'cancel' : 'err', $ret);
        }
        $code = $q->q('code');
        if ($code === '' || strlen($code) > 2048) {
            return self::back($db, 'err', $ret);
        }
        if (!self::enabled($db)) {
            return self::back($db, 'off', $ret);
        }
        if (!RateLimit::hit('g_cb:' . $q->ip, 30, 900)['allowed']) {
            return self::back($db, 'rate', $ret);
        }
        try {
            $p = self::exchange($db, self::cfg($db), $code, (string)$g['cv'], (string)$g['n']);
        } catch (GoogleFail $e) {
            Log::write('bilgi', 'Google ile giriş reddedildi: ' . $e->why . ' ' . $e->getMessage());
            Audit::log($db, Auth::$user ? Auth::$user['id'] : null, 'google_fail', 'login', '', ['why' => $e->why]);
            return self::back($db, $e->why, $ret);
        }

        if ($g['m'] === 'link') {
            $uid = (int)$g['u'];
            if (!Auth::$user || (int)Auth::$user['id'] !== $uid) {
                return self::back($db, 'auth', $ret);
            }
            $other = $db->val('SELECT id FROM {users} WHERE google_sub=?', [$p['sub']]);
            if ($other) {
                return self::back($db, (int)$other === $uid ? 'linked' : 'taken', $ret);
            }
            if (!empty(Auth::$user['google_sub'])) {
                return self::back($db, 'already', $ret);
            }
            try {
                self::link($db, $uid, $p['sub'], $p['email'], 'profile');
            } catch (HttpError $e) {
                return self::back($db, 'taken', $ret);
            }
            return self::back($db, 'linked', $ret);
        }
        if (Auth::$user) {
            return self::back($db, 'already_in', $ret);
        }
        $u = $db->one('SELECT * FROM {users} WHERE google_sub=?', [$p['sub']]);
        if ($u) {
            return self::loginFlow($db, $u, $ret, ['k' => 'login']);
        }
        $e = $db->one('SELECT * FROM {users} WHERE email=?', [$p['email']]);
        if ($e) {
            if ($e['status'] !== 'active') {
                Audit::log($db, $e['id'], 'login_banned', 'user', $e['id'], ['google' => true]);
                return self::back($db, 'banned', $ret);
            }
            if (!empty($e['google_sub']) || !self::hasPassword($e)) {
                return self::back($db, 'conflict', $ret);
            }
            // güvenli yol: sessizce bağlanmaz; üye bu hesabın şifresiyle bir kez giriş yapınca bağlanır
            Auth::write(function (&$s) use ($e, $p) {
                $s['gp'] = ['k' => 'link', 'uid' => (int)$e['id'], 'sub' => $p['sub'], 'email' => $p['email'], 'exp' => time() + 900];
            });
            return self::back($db, 'link', $ret);
        }
        Auth::write(function (&$s) use ($p) {
            $s['gp'] = ['k' => 'register', 'sub' => $p['sub'], 'email' => $p['email'], 'name' => $p['name'], 'given' => $p['given'], 'family' => $p['family'],
                'exp' => time() + self::PENDING_TTL];
        });
        return self::back($db, 'register', $ret);
    }

    /** google_sub ile bulunan üye: yasak → engel; 2FA (güvenilir tarayıcı değilse) → kod adımı; değilse giriş */
    private static function loginFlow(Db $db, array $u, $ret, array $g)
    {
        if ($u['status'] !== 'active') {
            Audit::log($db, $u['id'], 'login_banned', 'user', $u['id'], ['google' => true]);
            return self::back($db, 'banned', $ret);
        }
        try {
            $r = self::finish($db, $u, $g);
        } catch (HttpError $e) { // kod gönderim sınırı vb.
            return self::back($db, $e->errCode === 'rate_limit' ? 'rate' : 'err', $ret);
        }
        return self::back($db, isset($r['tfa']) ? 'tfa' : 'ok', $ret);
    }

    /**
     * Ortak son adım (callback ve şifreyle bağlama): 2FA açıksa ve tarayıcı güvenilir değilse aynı bekleyen-kod oturumu
     * (auth/tfa/verify, resend, switch aynen çalışır); değilse oturum açılır. Dönüş: ['tfa'=>…] | ['csrf'=>…, 'u'=>satır]
     */
    public static function finish(Db $db, array $u, array $g)
    {
        $trusted = $u['tfa'] !== '' && Tfa::trusted($db, $u);
        if ($u['tfa'] !== '' && !$trusted) {
            $t = Tfa::start($db, $u, 'login', $u['tfa']);
            Auth::write(function (&$s) use ($t, $u, $g) {
                $s['tfa'] = ['cid' => $t['id'], 'uid' => (int)$u['id'], 'rem' => 1, 'exp' => time() + 900, 'g' => $g];
                $s['gp'] = ['k' => 'tfa', 'tfa' => $t, 'exp' => time() + 900];
            });
            return ['tfa' => $t];
        }
        $meta = ['google' => true, 'staff' => $u['role'] !== 'member'] + ($trusted ? ['tfa' => 'trusted'] : []);
        if (isset($g['k']) && $g['k'] === 'link') {
            self::link($db, $u['id'], $g['sub'], $g['email'], 'email');
            $meta['linked'] = true;
            $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
        }
        $csrf = Auth::login($db, $u, true);
        Audit::log($db, $u['id'], 'login', 'user', $u['id'], $meta);
        return ['csrf' => $csrf, 'u' => $u];
    }

    /**
     * Kodu token'a çevirir ve id_token'ı doğrular. Dönüş: ['sub','email','name','given','family'].
     * @throws GoogleFail why: token | claims | unverified
     */
    public static function exchange(Db $db, array $c, $code, $verifier, $nonce)
    {
        $form = ['code' => $code, 'client_id' => $c['client_id'], 'client_secret' => $c['client_secret'], 'redirect_uri' => self::redirectUri($db),
            'grant_type' => 'authorization_code', 'code_verifier' => $verifier];
        $r = self::http('POST', self::TOKEN_URL, ['form' => $form, 'nonce' => $nonce]);
        if ($r['error'] !== '') {
            throw new GoogleFail('token', 'ağ: ' . $r['error']);
        }
        if (!$r['ok'] || !is_array($r['json']) || empty($r['json']['id_token']) || !is_string($r['json']['id_token'])) {
            $err = is_array($r['json']) && isset($r['json']['error']) ? (string)$r['json']['error'] : '';
            throw new GoogleFail('token', 'HTTP ' . (int)$r['code'] . ' ' . yp_str($err, 60));
        }
        $claims = self::decodeJwt($r['json']['id_token']);
        if (!$claims) {
            throw new GoogleFail('claims', 'id_token çözülemedi');
        }
        $bad = self::checkClaims($claims, $c['client_id'], $nonce, (int)floor(yp_now_ms() / 1000));
        if ($bad !== null) {
            throw new GoogleFail($bad === 'email_verified' ? 'unverified' : 'claims', $bad);
        }
        return ['sub' => (string)$claims['sub'], 'email' => strtolower(trim((string)$claims['email'])),
            'name' => isset($claims['name']) && is_string($claims['name']) ? yp_str($claims['name'], 120) : '',
            'given' => isset($claims['given_name']) && is_string($claims['given_name']) ? yp_str($claims['given_name'], 60) : '',
            'family' => isset($claims['family_name']) && is_string($claims['family_name']) ? yp_str($claims['family_name'], 60) : ''];
    }

    /** JWT yükünü çözer (imza denetlenmez; bkz. sınıf açıklaması). */
    public static function decodeJwt($jwt)
    {
        $p = explode('.', (string)$jwt);
        if (count($p) !== 3 || strlen($jwt) > 16384) {
            return null;
        }
        $raw = base64_decode(strtr($p[1], '-_', '+/') . str_repeat('=', (4 - strlen($p[1]) % 4) % 4), true);
        $j = $raw === false ? null : json_decode($raw, true);
        return is_array($j) ? $j : null;
    }

    /** Saf doğrulama. Dönüş: null (geçerli) ya da hatalı alanın adı */
    public static function checkClaims(array $c, $clientId, $nonce, $now)
    {
        if (!isset($c['iss']) || !in_array($c['iss'], self::ISS, true)) {
            return 'iss';
        }
        $aud = isset($c['aud']) ? $c['aud'] : null;
        if (is_array($aud)) {
            if (!in_array($clientId, $aud, true) || (count($aud) > 1 && (!isset($c['azp']) || $c['azp'] !== $clientId))) {
                return 'aud';
            }
        } elseif (!is_string($aud) || $clientId === '' || !hash_equals($clientId, $aud)) {
            return 'aud';
        }
        if (!isset($c['exp']) || !is_numeric($c['exp']) || (int)$c['exp'] < $now - 60) {
            return 'exp';
        }
        if (isset($c['iat']) && is_numeric($c['iat']) && (int)$c['iat'] > $now + 300) {
            return 'iat';
        }
        if (!isset($c['nonce']) || !is_string($c['nonce']) || $nonce === '' || !hash_equals((string)$nonce, $c['nonce'])) {
            return 'nonce';
        }
        if (!isset($c['sub']) || !is_string($c['sub']) || !preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $c['sub'])) {
            return 'sub';
        }
        if (!isset($c['email']) || !is_string($c['email']) || !filter_var($c['email'], FILTER_VALIDATE_EMAIL) || strlen($c['email']) > 190) {
            return 'email';
        }
        $v = isset($c['email_verified']) ? $c['email_verified'] : false;
        if (!($v === true || $v === 'true')) {
            return 'email_verified';
        }
        return null;
    }

    /* ------------------------------------------------------------ HTTP ------------------------------------------------------------ */

    /** yp_http; testlerde (YP_TEST=1 + SQLite) TestMock 'google' ile sahte */
    private static function http($method, $url, array $o)
    {
        $m = TestMock::get('google');
        if ($m !== null) {
            return self::mockHttp($m, $method, $url, $o);
        }
        unset($o['nonce']);
        $o += ['timeout' => 15, 'connect_timeout' => 8];
        return yp_http($method, $url, $o);
    }

    /**
     * Test sahtesi. storage/test_mock.json {"google": ok | down | invalid_client | invalid_grant | badiss | badaud | badnonce |
     * expired | unverified}; kimlik storage/test_google.json {sub, email, email_verified?, name, given_name, family_name}.
     * Token isteği (gizli değer yerine sha256'sı) storage/test_google.jsonl'e yazılır (PKCE denetimi için).
     */
    private static function mockHttp($m, $method, $url, array $o)
    {
        $res = function ($code, $json) {
            return ['ok' => $code >= 200 && $code < 300, 'code' => $code, 'body' => json_encode($json), 'json' => $json, 'error' => ''];
        };
        if ($m === 'down') {
            return ['ok' => false, 'code' => 0, 'body' => '', 'json' => null, 'error' => yp_curl_error_tr(7)];
        }
        if ($url === self::DISCOVERY_URL) {
            return $res(200, ['issuer' => 'https://accounts.google.com', 'authorization_endpoint' => self::AUTH_URL, 'token_endpoint' => self::TOKEN_URL,
                'userinfo_endpoint' => 'https://openidconnect.googleapis.com/v1/userinfo', 'jwks_uri' => 'https://www.googleapis.com/oauth2/v3/certs']);
        }
        if ($url !== self::TOKEN_URL || $method !== 'POST') {
            return $res(404, ['error' => 'not_found']);
        }
        $f = isset($o['form']) ? $o['form'] : [];
        $log = $f;
        $log['client_secret'] = hash('sha256', isset($f['client_secret']) ? (string)$f['client_secret'] : '');
        @file_put_contents(YP_STORAGE . '/test_google.jsonl', json_encode($log, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND);
        if ($m === 'invalid_client') {
            return $res(401, ['error' => 'invalid_client', 'error_description' => 'Unauthorized']);
        }
        if ($m === 'invalid_grant' || (isset($f['code']) && $f['code'] === 'yangpazar-baglanti-testi')) {
            return $res(400, ['error' => 'invalid_grant', 'error_description' => 'Malformed auth code.']);
        }
        $idf = YP_STORAGE . '/test_google.json';
        $id = is_file($idf) ? json_decode((string)file_get_contents($idf), true) : null;
        $id = is_array($id) ? $id : [];
        $now = (int)floor(yp_now_ms() / 1000);
        $claims = array_merge(['iss' => 'https://accounts.google.com', 'azp' => (string)$f['client_id'], 'aud' => (string)$f['client_id'],
            'sub' => '100000000000000000001', 'email' => 'oyuncu@gmail.com', 'email_verified' => true, 'name' => 'Oyuncu Test',
            'given_name' => 'Oyuncu', 'family_name' => 'Test', 'iat' => $now, 'exp' => $now + 3600,
            'nonce' => isset($o['nonce']) ? (string)$o['nonce'] : ''], $id);
        if ($m === 'badiss') {
            $claims['iss'] = 'https://accounts.example.com';
        } elseif ($m === 'badaud') {
            $claims['aud'] = '999999-baskasi0000000000000000.apps.googleusercontent.com';
        } elseif ($m === 'badnonce') {
            $claims['nonce'] = 'baska-nonce';
        } elseif ($m === 'expired') {
            $claims['exp'] = $now - 3600;
        } elseif ($m === 'unverified') {
            $claims['email_verified'] = false;
        }
        $jwt = self::b64url('{"alg":"RS256","kid":"test","typ":"JWT"}') . '.' . self::b64url(json_encode($claims, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) . '.' . self::b64url('imza');
        return $res(200, ['access_token' => 'ya29.test', 'expires_in' => 3599, 'scope' => 'openid email profile', 'token_type' => 'Bearer', 'id_token' => $jwt]);
    }
}

/** Google akışında SPA'ya dönüş kodu taşıyan hata */
final class GoogleFail extends \RuntimeException
{
    public $why;

    public function __construct($why, $msg = '')
    {
        parent::__construct((string)$msg);
        $this->why = (string)$why;
    }
}
