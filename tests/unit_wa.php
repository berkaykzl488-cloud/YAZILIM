<?php
/**
 * WhatsApp (0.6.1) birim testleri (tests/run.php içinden yüklenir): Meta Cloud API şablon gövdeleri (kimlik doğrulama +
 * "Kodu kopyala" butonu, bildirim/Utility), numara biçimi (E.164, + olmadan), Graph hata kodu eşlemesi (yeniden dene / deneme),
 * bağlantı testi, Outbox → sağlayıcı, bildirim şablonu yoksa telefon iletisi kuyruğa girmez, kampanya Utility şablonuyla
 * gitmez, ayar kaydında maskeli erişim anahtarı korunur, NetGSM ayarlarının göçü (0006).
 */
if (PHP_SAPI !== 'cli' || !function_exists('section')) {
    exit;
}

use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Notify;
use YP\Outbox;
use YP\Settings;
use YP\Sms\Sms;
use YP\Sms\WhatsApp;

function waCfg(array $x = [])
{
    return array_merge(Settings::defaults()['sms'], ['on' => true, 'wa_phone_id' => '106540352242922', 'wa_token' => 'EAAGtestTOKEN1234567890'], $x);
}

section('wa-payload', function () {
    $p = WhatsApp::otpPayload('905551112233', '482913', 'yangpazar_kod', 'tr');
    $want = '{"messaging_product":"whatsapp","recipient_type":"individual","to":"905551112233","type":"template","template":{"name":"yangpazar_kod","language":{"code":"tr"},'
        . '"components":[{"type":"body","parameters":[{"type":"text","text":"482913"}]},{"type":"button","sub_type":"url","index":"0","parameters":[{"type":"text","text":"482913"}]}]}}';
    ok('OTP: Meta kimlik doğrulama şablonu gövdesi (gövde parametresi = kod, kopyala butonu url/index "0")', json_encode($p, JSON_UNESCAPED_SLASHES) === $want, json_encode($p));
    ok('OTP: buton index metin "0" (sayı değil)', $p['template']['components'][1]['index'] === '0');
    $n = WhatsApp::textPayload('905551112233', "yangpazar.com: Çekim talebiniz alındı.\nIBAN'ınıza   net 95,00 TL\tgönderilecek.", 'yangpazar_bildirim', 'tr', 'yangpazar.com');
    $want = '{"messaging_product":"whatsapp","recipient_type":"individual","to":"905551112233","type":"template","template":{"name":"yangpazar_bildirim","language":{"code":"tr"},'
        . '"components":[{"type":"body","parameters":[{"type":"text","text":"Çekim talebiniz alındı. IBAN\'ınıza net 95,00 TL gönderilecek."}]}]}}';
    ok('Utility: tek gövde parametresi, satır sonu/sekme/çoklu boşluk tek boşluk, baştaki site adı atılır', json_encode($n, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) === $want, json_encode($n, JSON_UNESCAPED_UNICODE));
    $long = WhatsApp::param(str_repeat('ğ', 2000));
    ok('Utility: uzun metin ' . WhatsApp::NOTE_MAX . ' karaktere kısalır (…)', mb_strlen($long, 'UTF-8') === WhatsApp::NOTE_MAX && mb_substr($long, -1, 1, 'UTF-8') === '…');
    ok('boş metin → "-" (Meta boş parametre kabul etmez)', WhatsApp::param("  \n ") === '-');
    ok('kod iletiden okunur', WhatsApp::codeOf('yangpazar.com doğrulama kodunuz: 004512. Kodu kimseyle paylaşmayın.') === '004512' && WhatsApp::codeOf('kod yok') === '');
    ok('Graph API sürümü sabit, URL', WhatsApp::url('123') === 'https://graph.facebook.com/' . WhatsApp::API_VERSION . '/123/messages' && preg_match('/^v\d+\.\d+$/', WhatsApp::API_VERSION));
});

section('wa-phone', function () {
    $cases = ['0555 111 22 33' => '905551112233', '05551112233' => '905551112233', '+90 555 111 22 33' => '905551112233', '+905551112233' => '905551112233',
              '90 555 111 2233' => '905551112233', '905551112233' => '905551112233', '5551112233' => '905551112233', '(0555) 111-22-33' => '905551112233',
              '0212 111 22 33' => '', '12345' => '', '' => ''];
    $bad = [];
    foreach ($cases as $in => $want) {
        if (Sms::e164($in) !== $want) {
            $bad[] = $in . ' → ' . Sms::e164($in);
        }
    }
    ok('E.164 (+ olmadan): 05xx…, +90…, 90…, boşluklu, parantezli; sabit hat geçersiz', !$bad, $bad);
});

section('wa-errors', function () {
    $e = function ($code, $http = 400) {
        return WhatsApp::mapError($http, ['error' => ['message' => 'x', 'code' => $code]]);
    };
    $r = $e(131026);
    ok('131026 (numara WhatsApp değil / teslim edilemez) → kalıcı', !$r['retry'] && strpos($r['error'], 'WhatsApp kullanmıyor') !== false);
    $r = $e(190, 401);
    ok('190 (anahtar geçersiz) → kalıcı, Türkçe mesaj', !$r['retry'] && strpos($r['error'], 'Erişim anahtarı geçersiz veya süresi dolmuş') === 0);
    ok('401 kodsuz → anahtar mesajı', strpos(WhatsApp::mapError(401, [])['error'], 'Erişim anahtarı geçersiz veya süresi dolmuş') === 0);
    ok('130429 (saniyelik sınır) → yeniden dene', $e(130429)['retry']);
    ok('80007 (hesap sınırı) → yeniden dene', $e(80007)['retry']);
    ok('131056 (aynı numaraya çok sık) → yeniden dene', $e(131056)['retry']);
    ok('132001 (şablon yok) → kalıcı', !$e(132001)['retry'] && strpos($e(132001)['error'], 'Şablon bulunamadı') === 0);
    ok('HTTP 500 / 503 (kodsuz) → yeniden dene', WhatsApp::mapError(500, [])['retry'] && WhatsApp::mapError(503, ['error' => ['message' => 'Service Unavailable']])['retry']);
    ok('HTTP 429 → yeniden dene', WhatsApp::mapError(429, [])['retry']);
    ok('ağ hatası → yeniden dene', WhatsApp::mapError(0, [], 'zaman aşımı')['retry']);
    ok('bilinmeyen 4xx → kalıcı, ayrıntı mesajda', !$e(999999)['retry'] && strpos($e(999999)['error'], 'HTTP 400, kod 999999') !== false);
});

section('wa-send', function () {
    $calls = [];
    $w = new WhatsApp(waCfg(), fakeHttp($calls, [
        [200, '{"messaging_product":"whatsapp","contacts":[{"input":"905551112233","wa_id":"905551112233"}],"messages":[{"id":"wamid.HBgMOTA1NTUxMTEyMjMzFQIAERgSQ0RFM0Y4"}]}'],
        [401, '{"error":{"message":"Error validating access token","type":"OAuthException","code":190,"error_subcode":463,"fbtrace_id":"A"}}'],
        [400, '{"error":{"message":"(#131026) Message Undeliverable.","type":"OAuthException","code":131026,"fbtrace_id":"B"}}'],
        [400, '{"error":{"message":"(#130429) Rate limit hit","type":"OAuthException","code":130429,"fbtrace_id":"C"}}'],
        [502, 'Bad Gateway'],
    ]));
    $r = $w->send('905551112233', 'yangpazar.com doğrulama kodunuz: 482913. Kodu kimseyle paylaşmayın.', ['ev' => 'tfa']);
    ok('başarılı: WhatsApp ileti kimliği (wamid) döner', $r['ok'] && $r['id'] === 'wamid.HBgMOTA1NTUxMTEyMjMzFQIAERgSQ0RFM0Y4');
    $c = $calls[0];
    ok('POST graph.facebook.com/{sürüm}/{phone_number_id}/messages + Bearer', $c['method'] === 'POST' && $c['url'] === 'https://graph.facebook.com/' . WhatsApp::API_VERSION . '/106540352242922/messages'
        && $c['o']['headers'] === ['Authorization: Bearer EAAGtestTOKEN1234567890'] && $c['o']['timeout'] > 0);
    ok('OTP gövdesi: kod hem gövdede hem kopyala butonunda', $c['o']['json'] == WhatsApp::otpPayload('905551112233', '482913', 'yangpazar_kod', 'tr'));
    $r = $w->send('905551112233', 'kod 111111', ['ev' => 'tfa']);
    ok('190 → kalıcı, Türkçe', !$r['ok'] && !$r['retry'] && strpos($r['error'], 'Erişim anahtarı geçersiz veya süresi dolmuş') === 0);
    $r = $w->send('905551112233', 'kod 111111', ['ev' => 'tfa']);
    ok('131026 → kalıcı', !$r['ok'] && !$r['retry']);
    $r = $w->send('905551112233', 'kod 111111', ['ev' => 'test']);
    ok('130429 → yeniden dene (deneme iletisi de kod şablonuyla)', !$r['ok'] && $r['retry'] && $calls[3]['o']['json']['template']['name'] === 'yangpazar_kod');
    $r = $w->send('905551112233', 'kod 111111', ['ev' => 'tfa']);
    ok('502 → yeniden dene', !$r['ok'] && $r['retry']);
    $n = count($calls);
    $r = $w->send('905551112233', 'yangpazar.com: Çekim talebiniz alındı.', ['ev' => 'withdraw_req', 'site' => 'yangpazar.com']);
    ok('bildirim şablonu kapalıyken istek atılmaz, kalıcı hata', !$r['ok'] && !$r['retry'] && count($calls) === $n);
    $r = $w->send('905551112233', 'yangpazar.com: seni özledik', ['ev' => 'winback']);
    ok('kampanya: pazarlama şablonu yoksa gönderilmez (Utility kullanılmaz)', !$r['ok'] && !$r['retry'] && count($calls) === $n);
    $calls = [];
    $w = new WhatsApp(waCfg(['wa_note_on' => true, 'wa_mkt_tpl' => 'yangpazar_kampanya']), fakeHttp($calls, [[200, '{"messages":[{"id":"wamid.A"}]}'], [200, '{"messages":[{"id":"wamid.B"}]}']]));
    $w->send('905551112233', "yangpazar.com: Çekim talebiniz\nalındı.", ['ev' => 'withdraw_req', 'site' => 'yangpazar.com']);
    ok('bildirim: Utility şablonu yangpazar_bildirim, tek parametre', $calls[0]['o']['json']['template']['name'] === 'yangpazar_bildirim'
        && $calls[0]['o']['json']['template']['components'] === [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => 'Çekim talebiniz alındı.']]]]);
    $w->send('905551112233', 'yangpazar.com: seni özledik', ['ev' => 'winback', 'site' => 'yangpazar.com']);
    ok('kampanya: yalnız ayrı pazarlama şablonuyla', $calls[1]['o']['json']['template']['name'] === 'yangpazar_kampanya');
    // bağlantı testi
    $calls = [];
    $w = new WhatsApp(waCfg(), fakeHttp($calls, [[200, '{"display_phone_number":"+90 555 000 00 00","verified_name":"Yang Pazar","quality_rating":"GREEN","id":"106540352242922"}'],
        [400, '{"error":{"message":"Invalid OAuth access token","code":190}}']]));
    $r = $w->check();
    ok('bağlantı testi: GET /{phone_number_id}?fields=display_phone_number,verified_name → ad ve numara', $r['ok'] && $r['name'] === 'Yang Pazar' && $r['number'] === '+90 555 000 00 00'
        && $calls[0]['method'] === 'GET' && strpos($calls[0]['url'], '/106540352242922?fields=display_phone_number,verified_name') !== false);
    $r = $w->check();
    ok('bağlantı testi: geçersiz anahtar → Türkçe', !$r['ok'] && strpos($r['error'], 'Erişim anahtarı geçersiz') === 0);
});

section('wa-outbox', function () {
    $db = freshDb();
    $u = mkUser($db, 'Wauye', ['tel' => '0532 999 88 77']);
    $calls = [];
    Settings::set('sms', waCfg());
    $http = fakeHttp($calls, [[200, '{"messages":[{"id":"wamid.OTP1"}]}'], [400, '{"error":{"message":"x","code":131026}}']]);
    Sms::$factory = function ($s) use ($http) {
        return new WhatsApp($s, $http);
    };
    ok('Notify::otp → WhatsApp kod şablonu, outbox provider=whatsapp, provider_id=wamid', Notify::otp($db, $u, 'sms', '654321')
        && $calls[0]['o']['json']['to'] === '905329998877' && $calls[0]['o']['json']['template']['components'][0]['parameters'][0]['text'] === '654321'
        && $db->val("SELECT provider||'|'||provider_id||'|'||status FROM {outbox} WHERE ev='tfa'") === 'whatsapp|wamid.OTP1|sent');
    Notify::otp($db, $u, 'sms', '111222');
    ok('teslim edilemez (131026) → hemen failed, Türkçe hata kayıtta', $db->val("SELECT status FROM {outbox} WHERE ev='tfa' ORDER BY id DESC LIMIT 1") === 'failed'
        && strpos($db->val("SELECT last_error FROM {outbox} WHERE ev='tfa' ORDER BY id DESC LIMIT 1"), 'WhatsApp kullanmıyor') !== false);
    // bildirim şablonu kapalı: telefon iletisi kuyruğa hiç girmez, e-posta gider
    Settings::set('mail', array_merge(Settings::get('mail'), ['on' => true]));
    Notify::send($db, $u['id'], 'Çekim talebiniz alındı.', '#hesabim', 'withdraw_req', ['tutar' => '95,00 TL']);
    ok('bildirim şablonu yok → WhatsApp kuyruğa girmez, e-posta girer', (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE ev='withdraw_req' AND channel='sms'") === 0
        && (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE ev='withdraw_req' AND channel='mail'") === 1);
    Settings::set('sms', waCfg(['wa_note_on' => true]));
    Notify::send($db, $u['id'], 'Çekim talebiniz alındı.', '#hesabim', 'withdraw_req', ['tutar' => '95,00 TL']);
    ok('bildirim şablonu açık → WhatsApp kuyrukta', (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE ev='withdraw_req' AND channel='sms'") === 1);
    ok('canSend: otp kanal açıkken; not yalnız wa_note_on; kampanya yalnız pazarlama şablonuyla', Sms::canSend(waCfg(), 'tfa') && !Sms::canSend(waCfg(), 'withdraw')
        && Sms::canSend(waCfg(['wa_note_on' => true]), 'withdraw') && !Sms::canSend(waCfg(['wa_note_on' => true]), 'winback') && Sms::canSend(waCfg(['wa_mkt_tpl' => 'k']), 'winback')
        && !Sms::canSend(waCfg(['on' => false]), 'tfa'));
    Sms::$factory = null;
    Settings::set('mail', Settings::defaults()['mail']);
});

section('wa-settings', function () {
    $db = freshDb();
    $admin = mkUser($db, 'Yonetici', ['role' => 'admin']);
    Auth::$user = $admin;
    $r = Router::loadDir();
    $put = function (array $body) use ($r, $db) {
        list($route) = $r->match('PUT', 'admin/settings/sms');
        return call_user_func($route['fn'], new Req('PUT', 'admin/settings/sms', [], json_encode($body)), $db);
    };
    $get = function () use ($r, $db) {
        list($route) = $r->match('GET', 'admin/settings/mail');
        return call_user_func($route['fn'], new Req('GET', 'admin/settings/mail'), $db);
    };
    $TOKEN = 'EAAGm0PX4ZCpsBAKZCtestSYSTEMUSERtoken9876';
    $res = $put(['on' => true, 'wa_phone_id' => '106540352242922', 'wa_waba_id' => '102290129340398', 'wa_token' => $TOKEN, 'wa_otp_tpl' => ' Yangpazar_Kod ', 'wa_otp_lang' => 'tr', 'hourly' => 30]);
    ok('kaydet: anahtar maskeli döner, şablon adı küçük harf', $res['data']['sms']['wa_token'] === '••••••76' && $res['data']['sms']['wa_otp_tpl'] === 'yangpazar_kod' && $res['msg'] === 'WhatsApp ayarları kaydedildi.');
    $put(['wa_token' => '••••••76', 'hourly' => 40]);
    Settings::clearCache();
    ok('maskeli değer gönderilince anahtar korunur', Settings::get('sms', $db)['wa_token'] === $TOKEN && (int)Settings::get('sms', $db)['hourly'] === 40);
    $put(['wa_token' => '', 'wa_note_on' => true]);
    Settings::clearCache();
    ok('boş gönderilince anahtar korunur', Settings::get('sms', $db)['wa_token'] === $TOKEN && Settings::get('sms', $db)['wa_note_on'] === true);
    ok('veritabanında anahtar düz metin değil (şifreli)', strpos((string)$db->val("SELECT v FROM {settings} WHERE k='sms'"), 'SYSTEMUSER') === false);
    $g = $get();
    ok('GET: anahtar maskeli, sağlayıcı listesi yalnız WhatsApp', $g['data']['sms']['wa_token'] === '••••••76' && $g['data']['providers']['sms'] === ['whatsapp' => 'WhatsApp Business (Meta Cloud API)']
        && strpos(json_encode($g), 'SYSTEMUSER') === false && strpos(json_encode($g), 'netgsm') === false);
    $e = throws(function () use ($put) {
        $put(['wa_otp_tpl' => 'Yangpazar Kod!']);
    });
    ok('geçersiz şablon adı → 422', $e instanceof HttpError && $e->http === 422);
    $e = throws(function () use ($put) {
        $put(['wa_phone_id' => '12ab']);
    });
    ok('geçersiz telefon numarası kimliği → 422', $e instanceof HttpError && $e->http === 422);
    $db2 = freshDb();
    Auth::$user = mkUser($db2, 'Yonetici2', ['role' => 'admin']);
    $e = throws(function () use ($r, $db2) {
        list($route) = $r->match('PUT', 'admin/settings/sms');
        call_user_func($route['fn'], new Req('PUT', 'admin/settings/sms', [], json_encode(['on' => true, 'wa_phone_id' => '106540352242922'])), $db2);
    });
    ok('anahtarsız açma → 422', $e instanceof HttpError && $e->http === 422);
    Auth::$user = null;
});

section('wa-migrate', function () {
    $db = freshDb();
    Settings::set('sms', ['on' => true, 'provider' => 'netgsm', 'header' => 'YANGPAZAR', 'user' => '8503000000', 'pass' => 'eski-sifre', 'hourly' => 25, 'userPrice' => 0, 'ev' => ['call' => true]]);
    $db->exec('PRAGMA foreign_keys=OFF'); // yalnız metin dönüşümü sınanıyor (sipariş satırı gerekmez)
    $db->insert('order_events', ['order_id' => 1, 'actor_id' => null, 'x' => 'Ödeme alındı, tutar güvenli havuza aktarıldı. Satıcıya bildirim ve SMS gönderildi.', 't' => 1]);
    $db->exec('PRAGMA foreign_keys=ON');
    $fn = require YP_APP . '/migrations/0006_whatsapp.php';
    $fn($db);
    Settings::clearCache();
    $s = Settings::get('sms', $db);
    $raw = $db->one("SELECT v, secret FROM {settings} WHERE k='sms'");
    $dec = json_decode(yp_decrypt($raw['v']), true);
    ok('göç 0006: NetGSM → whatsapp, kapalı, eski kullanıcı/şifre/başlık silindi', $s['provider'] === 'whatsapp' && $s['on'] === false && !isset($dec['user']) && !isset($dec['pass']) && !isset($dec['header']));
    ok('göç 0006: saatlik sınır ve olay anahtarları korundu, şifreli kaldı', (int)$s['hourly'] === 25 && $s['ev']['call'] === true && (int)$raw['secret'] === 1 && $s['wa_otp_tpl'] === 'yangpazar_kod');
    ok('göç 0006: sipariş geçmişindeki "ve SMS" ifadesi', $db->val('SELECT x FROM {order_events} WHERE order_id=1') === 'Ödeme alındı, tutar güvenli havuza aktarıldı. Satıcıya bildirim gönderildi.');
    ok('göç 0006 kayıtlı (yeni kurulumda)', (bool)$db->val("SELECT version FROM {schema_migrations} WHERE version='m:0006_whatsapp'"));
});
