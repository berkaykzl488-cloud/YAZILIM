<?php
/**
 * Birim testleri: PayTR hash fonksiyonları (bağımsız olarak Python hmac ile hesaplanmış değerlere karşı),
 * şifreleme (sodium + openssl GCM), maskeleme, TCKN/IBAN doğrulama.
 * Çalıştırma: php tests/api/unit.php   (geçici bir data klasörü kullanmaz; yalnızca saf fonksiyonlar)
 */
require __DIR__ . '/../../api/_lib.php';

$pass = 0; $fail = 0;
function check($name, $cond) {
    global $pass, $fail;
    if ($cond) { $pass++; echo "PASS  $name\n"; } else { $fail++; echo "FAIL  $name\n"; }
}

// --- El ile hesaplanmış örnek (Python: hmac.new(key, (hash_str+salt).encode(), sha256) → base64) ---
$mid = '123456'; $ip = '85.34.78.112'; $oid = 'YP2611100000001A'; $email = 'musteri@ornek.com';
$amount = '1000'; $key = 'AbCdEf1234567890'; $salt = 'SaLt0987654321zz';
$basket = yp_paytr_basket([['YangPazar bakiye yükleme', '10.00', 1]]);
check('sepet base64(json) PHP/Python aynı', $basket === 'W1siWWFuZ1BhemFyIGJha2l5ZSB5XHUwMGZja2xlbWUiLCIxMC4wMCIsMV1d');
check('iframe get-token hash', yp_paytr_iframe_hash($mid, $ip, $oid, $email, $amount, $basket, 0, 0, 'TL', 1, $salt, $key)
    === '9kaZ6GcnF1eL0EGiR1TkqTd7lWJ3tTvr3sFq509LLRI=');
check('eft get-token hash', yp_paytr_eft_hash($mid, $ip, $oid, $email, $amount, 'eft', 1, $salt, $key)
    === 'UoyWauL84nx3xxfLSvDdZe0Q6wJPVWx4enl5J6OuRR8=');
check('callback hash', yp_paytr_callback_hash($oid, $salt, 'success', '1000', $key)
    === 'k7SDe0vzC3bEEdOEDHVegoY/8RJZL4y9SqdoJeobEjI=');
check('callback hash: status değişince farklı', yp_paytr_callback_hash($oid, $salt, 'failed', '1000', $key)
    !== 'k7SDe0vzC3bEEdOEDHVegoY/8RJZL4y9SqdoJeobEjI=');
check('merchant_oid alfanümerik ≤64', (bool)preg_match('/^[A-Za-z0-9]{1,64}$/', yp_paytr_new_oid('YPTEST')));

// --- Şifreleme ---
$GLOBALS['yp_key'] = random_bytes(32);
$secret = json_encode(['merchant_key' => 'GERCEKANAHTAR123']);
$enc = yp_encrypt($secret);
check('şifreleme: çıktı düz metin içermiyor', strpos($enc, 'GERCEKANAHTAR') === false && strpos(base64_decode($enc), 'GERCEKANAHTAR') === false);
check('şifreleme: geri çözme', yp_decrypt($enc) === $secret);
check('şifreleme modu sodium (bu sunucuda)', yp_crypto_mode() === 'sodium');
// OpenSSL AES-256-GCM dalı (libsodium olmayan hostingler için): elle üretilmiş blob çözülebilmeli
$iv = random_bytes(12); $tag = '';
$c = openssl_encrypt($secret, 'aes-256-gcm', $GLOBALS['yp_key'], OPENSSL_RAW_DATA, $iv, $tag, 'yangpazar', 16);
$blob = base64_encode("\x02" . $iv . $tag . $c);
check('openssl GCM blob çözülüyor', yp_decrypt($blob) === $secret);
$bad = base64_decode($blob); $bad[strlen($bad) - 1] = chr(ord($bad[strlen($bad) - 1]) ^ 1);
$ok = false; try { yp_decrypt(base64_encode($bad)); } catch (RuntimeException $e) { $ok = true; }
check('bozulmuş şifreli veri reddediliyor', $ok);

// --- Maskeleme ---
check('mask secret', yp_mask_secret('abcdefghab') === '••••••ab');
check('mask id', yp_mask_id('123456') === '12****');
check('mask pw', yp_mask_value('gizli', 'pw') === '••••');
check('boş değer maskesi boş', yp_mask_secret('') === '');
check('maskeli girdi algılama', yp_is_masked_input('••••••ab') && yp_is_masked_input('12****') && !yp_is_masked_input('abc'));
$r = yp_redact(['merchant_key' => 'ABCDEFGH12', 'tutar' => 5, 'ic' => ['password' => 'xx123456yy']]);
check('log maskeleme', $r['merchant_key'] === '••••••12' && $r['ic']['password'] === '••••••yy' && $r['tutar'] === 5);

// --- Doğrulayıcılar ---
check('TCKN geçerli (10000000146)', yp_valid_tckn('10000000146'));
check('TCKN geçersiz', !yp_valid_tckn('12345678901'));
check('IBAN geçerli', yp_valid_iban_tr('TR330006100519786457841326'));
check('IBAN geçersiz', !yp_valid_iban_tr('TR330006100519786457841327'));
check('tutar ayrıştırma', yp_money('1.234,56') === 1234.56 && yp_money('10') === 10.0 && yp_money('abc') === null);

echo "\nSONUÇ: $pass geçti, $fail kaldı\n";
exit($fail ? 1 : 0);
