#!/usr/bin/env bash
# 0.6.1 WhatsApp uçtan uca HTTP testleri (SMS/NetGSM kaldırıldı, telefon kanalı = WhatsApp Business Cloud API).
# Canlıdaki yükseltme senaryosu: NetGSM'li sürüm ($OLD_REF) sihirbazla kurulur, NetGSM ayarı ve "SMS ile 2FA" açmış bir üye
# oluşturulur → çalışma ağacı üzerine kopyalanır → ilk istek göç 0006'yı çalıştırır (provider=whatsapp, kapalı, NetGSM bilgisi silinir).
# Sonra: WhatsApp kapalıyken girişte e-postaya düşme, ayarların kaydı (erişim anahtarı maskeli/şifreli, maskeli değer korunur),
# bağlantı testi, deneme mesajı (kod şablonu 123456), 2FA girişi WhatsApp'tan (outbox provider=whatsapp, wamid), Graph hataları
# (teslim edilemez → kalıcı, anahtar geçersiz → Türkçe, sınır → yeniden dene), bildirim şablonu kapalı/açık, kampanya kuralı.
# Graph API sahte: storage/test_mock.json {"wa":"ok"|"notwa"|"token"|"rate"|"down"} (YALNIZ YP_TEST=1 + SQLite); gönderilen
# istekler storage/test_wa.jsonl'e yazılır. Kullanım: bash tests/http/wa.sh   (gerekenler: php 8.1+ sqlite, curl, jq, git)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((28000 + RANDOM % 1500))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-wa-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
OLD_REF="${OLD_REF:-0899893}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$OLD_REF^{commit}" 2>/dev/null && git -C "$REPO" cat-file -e "$OLD_REF:app/src/Sms/NetGsm.php" 2>/dev/null; then
  git -C "$REPO" archive "$OLD_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: $OLD_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
  cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$RUN/"
  cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"; cp "$REPO/uploads/.htaccess" "$REPO/uploads/index.php" "$RUN/uploads/"
fi
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
cat > "$RUN/sendmail.sh" <<EOF
#!/bin/sh
cat >> "$RUN/sendmail.log"
echo "----" >> "$RUN/sendmail.log"
EOF
chmod +x "$RUN/sendmail.sh"

YP_TEST=1 PHP_CLI_SERVER_WORKERS=4 php -d display_errors=0 -d log_errors=1 -d sendmail_path="$RUN/sendmail.sh" \
  -S 127.0.0.1:$PORT -t "$RUN" "$REPO/tests/http/router.php" >"$SLOG" 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; [ "${KEEP:-0}" = 1 ] && echo "çalışma klasörü: $RUN" || rm -rf "$RUN"; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "$B/api/durum.php" && break; sleep 0.1; done

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      → ${2:0:700}"; }
chk() { if eval "$2"; then ok "$1"; else bad "$1" "${BODY:-}"; fi; }
j()   { echo "$BODY" | jq -r "$1" 2>/dev/null; }
api() {
  local jar="$1" m="$2" p="$3" d="${4:-}"; shift 4 2>/dev/null || shift $#
  local out args=(-s -b "$jar" -c "$jar" -X "$m" -w '\n%{http_code}')
  [ -n "$d" ] && args+=(-H 'Content-Type: application/json' --data "$d")
  out=$(curl "${args[@]}" "$@" "$B/api/v1/$p")
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
kur() {
  local jar="$1"; shift
  local csrf; csrf=$(curl -s -b "$jar" -c "$jar" "$B/kurulum/" | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
  local args=(-s -L -b "$jar" -c "$jar" -w '\n%{http_code}' --data-urlencode "csrf=$csrf")
  for kv in "$@"; do args+=(--data-urlencode "$kv"); done
  local out; out=$(curl "${args[@]}" "$B/kurulum/")
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
csrf_of() { api "$1" GET boot ""; j .data.csrf; }
rl_reset() { rm -f "$RUN"/storage/rl/*.json; }
sq() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $p->exec("PRAGMA busy_timeout=8000"); $v=$p->query($argv[1])->fetchColumn(); echo $v===false?"":$v;' "$1"; }
sqx() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $p->exec("PRAGMA busy_timeout=8000"); $p->exec($argv[1]);' "$1"; }
mock() { echo "{\"wa\":\"$1\"}" > "$RUN/storage/test_mock.json"; }
walast() { tail -1 "$RUN/storage/test_wa.jsonl" 2>/dev/null; }
wacount() { [ -f "$RUN/storage/test_wa.jsonl" ] && wc -l < "$RUN/storage/test_wa.jsonl" | tr -d ' ' || echo 0; }
# sms ayarını sunucu kodunun kendisiyle (şifreli) okur
smsget() { php -r 'define("YP_STORAGE",$argv[1]); require $argv[2]; YP\Store::requireKey(); $db=YP\Db::connect(YP\Store::dbConfig()); YP\Db::setMain($db); $r=$db->one("SELECT v FROM {settings} WHERE k=?",["sms"]); echo $r?yp_decrypt($r["v"]):"";' "$RUN/storage" "$RUN/app/bootstrap.php"; }
otp_of() { curl -s "$B/api/v1/_test/outbox?to=$(printf %s "$1" | jq -sRr @uri)" | jq -r "[.data.rows[] | select(.ev==\"tfa\" and .channel==\"$2\")][0].body" | grep -oE '[0-9]{6}' | head -1; }

J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_A2="$RUN/a2.jar"; J_A3="$RUN/a3.jar"; J_ADM="$RUN/adm.jar"; J_X="$RUN/x.jar"

echo "=== 1. Kurulum: NetGSM'li eski sürüm ($OLD_REF), NetGSM ayarı ve SMS 2FA'lı üye ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang WA" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
php -r 'define("YP_STORAGE",$argv[1]); require $argv[2]; YP\Store::requireKey(); $db=YP\Db::connect(YP\Store::dbConfig()); YP\Db::setMain($db);
  $m=YP\Settings::get("mail",$db); $m["on"]=true; $m["provider"]=""; $m["fallback"]=true; $m["from"]="noreply@yangpazar.test"; YP\Settings::set("mail",$m,null,$db);
  YP\Settings::set("sms",["on"=>true,"provider"=>"netgsm","header"=>"YANGPAZAR","user"=>"8503000000","pass"=>"NETGSM-ESKI-SIFRE","hourly"=>45,"userPrice"=>0,"ev"=>["call"=>true,"borsa_off"=>true]],null,$db);' "$RUN/storage" "$RUN/app/bootstrap.php"
CS_A=$(csrf_of "$J_A")
api "$J_A" POST auth/register '{"name":"Wa_Uye","email":"wa@ornek.com","tel":"0532 999 88 77","ad":"Vahap","soyad":"Ak","password":"Wa-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
UA="$(j .data.me.id)"
sqx "UPDATE yp_users SET tfa='sms' WHERE id=${UA#u}"
chk "eski sürüm: NetGSM açık, üye SMS 2FA'lı" '[ -n "$UA" ] && [ "$UA" != null ] && smsget | grep -q NETGSM-ESKI-SIFRE && [ "$(sq "SELECT tfa FROM yp_users WHERE id=${UA#u}")" = sms ]'

echo "=== 2. Çalışma ağacı üzerine kopyalanır: göç 0006 ==="
if [ "$UPGRADE" = 1 ]; then
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 3 # opcache.revalidate_freq (2 sn) dolsun: eski derlenmiş dosyalar yeniden okunur
fi
api "$J_X" GET boot ""
VER=$(sed -n "s/.*YP_APP_VERSION', '\([^']*\)'.*/\1/p" "$REPO/app/bootstrap.php")
chk "ilk istek: göç 0006 kayıtlı, sürüm $VER" '[ "$CODE" = 200 ] && [ -n "$(sq "SELECT version FROM yp_schema_migrations WHERE version='\''m:0006_whatsapp'\''")" ] && grep -q "'\''$VER'\''" "$RUN/app/bootstrap.php"'
SMS=$(smsget)
chk "göç: provider=whatsapp, gönderim KAPALI, NetGSM kullanıcı/şifre/başlık silindi" '[ "$(echo "$SMS" | jq -r .provider)" = whatsapp ] && [ "$(echo "$SMS" | jq -r .on)" = false ] && [ "$(echo "$SMS" | jq -r ".user // \"yok\"")" = yok ] && ! echo "$SMS" | grep -q -e NETGSM-ESKI-SIFRE -e YANGPAZAR'
chk "göç: saatlik sınır ve olay anahtarları korundu, ayar şifreli" '[ "$(echo "$SMS" | jq -r .hourly)" = 45 ] && [ "$(echo "$SMS" | jq -r .ev.call)" = true ] && [ "$(sq "SELECT secret FROM yp_settings WHERE k='\''sms'\''")" = 1 ]'
chk "boot.set: WhatsApp ile doğrulama kullanılamıyor (smsOn=false)" '[ "$(j .data.set.smsOn)" = false ]'

echo "=== 3. WhatsApp kapalı: SMS (WhatsApp) 2FA'lı üye girişte kodu e-postayla alır ==="
CS_A=$(csrf_of "$J_A2")
api "$J_A2" POST auth/login '{"login":"Wa_Uye","password":"Wa-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
chk "kapalıyken giriş kodu e-postaya düşer, kanal değiştirme düğmesi yok" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ] && [ "$(j .tfa.alt)" = false ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE channel='\''sms'\''")" = 0 ]'
TID="$(j .tfa.id)"; C6=$(otp_of wa@ornek.com mail)
api "$J_A2" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$C6\"}" -H "X-CSRF-Token: $CS_A"
chk "e-postadaki kodla giriş" '[ "$CODE" = 200 ] && [ "$(j .data.me.tfa)" = sms ]'
CS_A2="$(j .data.csrf)"
api "$J_A2" POST me/tfa '{"tfa":"sms"}' -H "X-CSRF-Token: $CS_A2"
chk "kapalıyken WhatsApp 2FA seçimi değişiklik sayılmaz (zaten sms = WhatsApp)" '[ "$CODE" = 400 ] && [ "$(j .code)" = no_change ]'
rl_reset
api "$J_A2" POST me/tfa '{"tfa":"mail"}' -H "X-CSRF-Token: $CS_A2"
chk "kapalıyken e-posta yöntemine geçiş başlatılabilir (kod e-postayla)" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ] && [ "$(j .tfa.purpose)" = enable ]'

echo "=== 4. Yönetici: WhatsApp ayarları (erişim anahtarı maskeli, şifreli) ==="
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
api "$J_ADM" GET admin/settings/mail ""
chk "ayar sayfası: WhatsApp, kod şablonu varsayılanı yangpazar_kod/tr, NetGSM yok" '[ "$CODE" = 200 ] && [ "$(j .data.sms.provider)" = whatsapp ] && [ "$(j .data.sms.wa_otp_tpl)" = yangpazar_kod ] && [ "$(j .data.sms.wa_otp_lang)" = tr ] && [ "$(j .data.sms.wa_note_tpl)" = yangpazar_bildirim ] && [ "$(j .data.sms.wa_token)" = "" ] && [ "$(j ".data.sms | has(\"pass\") or has(\"user\") or has(\"header\")")" = false ] && ! echo "$BODY" | grep -qi netgsm'
api "$J_X" POST admin/sms/check "" -H "X-CSRF-Token: x"
chk "bağlantı testi: anonim → 403" '[ "$CODE" = 403 ]'
api "$J_ADM" POST admin/sms/check "" -H "X-CSRF-Token: $CS_ADM"
chk "bağlantı testi: bilgiler yokken → 422 Türkçe" '[ "$CODE" = 422 ] && echo "$BODY" | grep -q "Telefon numarası kimliğini"'
TOKEN='EAAGm0PX4ZCpsBAKZCgizliSISTEMKULLANICI7788'
api "$J_ADM" PUT admin/settings/sms "{\"on\":true,\"wa_phone_id\":\"106540352242922\",\"wa_waba_id\":\"102290129340398\",\"wa_token\":\"$TOKEN\",\"wa_otp_tpl\":\"yangpazar_kod\",\"wa_otp_lang\":\"tr\",\"hourly\":60}" -H "X-CSRF-Token: $CS_ADM"
chk "kaydedildi: anahtar maskeli döner (••••••88)" '[ "$CODE" = 200 ] && [ "$(j .data.sms.wa_token)" = "••••••88" ] && [ "$(j .msg)" = "WhatsApp ayarları kaydedildi." ] && ! echo "$BODY" | grep -q SISTEMKULLANICI'
api "$J_ADM" PUT admin/settings/sms '{"wa_token":"••••••88","hourly":50}' -H "X-CSRF-Token: $CS_ADM"
chk "maskeli anahtar gönderilince eski anahtar korunur" '[ "$CODE" = 200 ] && [ "$(smsget | jq -r .wa_token)" = "$TOKEN" ] && [ "$(smsget | jq -r .hourly)" = 50 ]'
api "$J_ADM" GET admin/settings/mail ""
chk "GET: anahtar maskeli, veritabanında düz metin yok" '[ "$(j .data.sms.wa_token)" = "••••••88" ] && ! echo "$BODY" | grep -q SISTEMKULLANICI && ! grep -a -q SISTEMKULLANICI "$RUN/storage/test.sqlite" "$RUN"/storage/*.sqlite-wal 2>/dev/null'
api "$J_X" GET boot ""
chk "boot.set: artık WhatsApp ile doğrulama kullanılabilir; sır yok" '[ "$(j .data.set.smsOn)" = true ] && ! echo "$BODY" | grep -q -e SISTEMKULLANICI -e wa_token'

echo "=== 5. Bağlantı testi ve deneme mesajı (sahte Graph API) ==="
mock ok
api "$J_ADM" POST admin/sms/check "" -H "X-CSRF-Token: $CS_ADM"
chk "bağlantı testi: doğrulanmış ad ve numara" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ] && [ "$(j .data.name)" = "Yang Test" ] && [ "$(j .data.number)" = "+90 555 000 00 00" ] && echo "$BODY" | grep -q "Bağlantı başarılı"'
chk "bağlantı testi isteği: GET /v…/{phone_number_id}?fields=display_phone_number,verified_name + Bearer" 'walast | jq -e ".method==\"GET\" and (.url|test(\"^https://graph.facebook.com/v[0-9.]+/106540352242922\\\\?fields=display_phone_number,verified_name\")) and .auth==\"Authorization: Bearer \"" >/dev/null'
mock token
api "$J_ADM" POST admin/sms/check "" -H "X-CSRF-Token: $CS_ADM"
chk "bağlantı testi: anahtar geçersiz → Türkçe" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = false ] && echo "$BODY" | grep -q "Erişim anahtarı geçersiz veya süresi dolmuş"'
mock ok
api "$J_ADM" POST admin/sms/test '{"to":"0555 444 33 22"}' -H "X-CSRF-Token: $CS_ADM"
chk "deneme mesajı gönderildi" '[ "$CODE" = 200 ] && [ "$(j .data.sent)" = true ] && echo "$(j .data.id)" | grep -q "^wamid\.TEST"'
chk "deneme: kimlik doğrulama şablonu yangpazar_kod/tr, kod 123456 gövdede + kopyala butonunda, numara 905554443322" 'walast | jq -e ".method==\"POST\" and (.url|endswith(\"/106540352242922/messages\")) and .json.to==\"905554443322\" and .json.type==\"template\" and .json.template.name==\"yangpazar_kod\" and .json.template.language.code==\"tr\" and .json.template.components[0].parameters[0].text==\"123456\" and .json.template.components[1].type==\"button\" and .json.template.components[1].sub_type==\"url\" and .json.template.components[1].index==\"0\" and .json.template.components[1].parameters[0].text==\"123456\"" >/dev/null'

echo "=== 6. 2FA girişi WhatsApp'tan ==="
J_B="$RUN/b.jar"; CS_B=$(csrf_of "$J_B")
api "$J_B" POST auth/register '{"name":"Wa_Iki","email":"iki@ornek.com","tel":"0544 123 45 67","ad":"Ece","soyad":"Su","password":"Wa-Iki-Sifre-1"}' -H "X-CSRF-Token: $CS_B"
CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
api "$J_B" POST me/tfa '{"tfa":"sms"}' -H "X-CSRF-Token: $CS_B"
chk "üye WhatsApp 2FA'yı açıyor: kod WhatsApp'a (maskeli numara)" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = sms ] && [ "$(j .tfa.dest)" = "0••• ••• 45 67" ] && [ "$(j .tfa.purpose)" = enable ]'
TID="$(j .tfa.id)"; C6=$(otp_of "0544 123 45 67" sms)
api "$J_B" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$C6\"}" -H "X-CSRF-Token: $CS_B"
chk "WhatsApp kodu ile 2FA açıldı, bildirim WhatsApp der" '[ "$CODE" = 200 ] && [ "$(j .patch.me.tfa)" = sms ] && [ "$(sq "SELECT x FROM yp_notifications WHERE user_id=${UB#u} ORDER BY id DESC LIMIT 1")" = "2 adımlı doğrulama açıldı (WhatsApp)." ]'
api "$J_B" PUT me/profile '{"tel":""}' -H "X-CSRF-Token: $CS_B"
chk "WhatsApp 2FA açıkken telefon silinemez (Türkçe)" '[ "$CODE" = 422 ] && echo "$BODY" | grep -q "WhatsApp ile 2 adımlı doğrulama açıkken telefon silinemez"'
rl_reset
CS_A=$(csrf_of "$J_A3")
N0=$(wacount)
api "$J_A3" POST auth/login '{"login":"wa@ornek.com","password":"Wa-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
chk "giriş: kod WhatsApp'a gönderildi (e-postaya geçiş düğmesi var)" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = sms ] && [ "$(j .tfa.purpose)" = login ] && [ "$(j .tfa.alt)" = true ] && [ "$(j .data.me)" = null ]'
TID="$(j .tfa.id)"
OB=$(sq "SELECT provider||'|'||status||'|'||substr(provider_id,1,10)||'|'||priority FROM yp_outbox WHERE channel='sms' AND ev='tfa' ORDER BY id DESC LIMIT 1")
chk "outbox: provider whatsapp, gönderildi, wamid, öncelik 0" '[ "$OB" = "whatsapp|sent|wamid.TEST|0" ]'
C6=$(otp_of "0532 999 88 77" sms)
chk "Graph isteği: 905329998877, gövde ve kopyala butonu = girişteki kod" '[ "$(wacount)" -gt "$N0" ] && walast | jq -e --arg c "$C6" ".json.to==\"905329998877\" and .json.template.name==\"yangpazar_kod\" and .json.template.components[0].parameters[0].text==\$c and .json.template.components[1].parameters[0].text==\$c" >/dev/null'
api "$J_A3" POST auth/tfa/switch "{\"id\":$TID}" -H "X-CSRF-Token: $CS_A"
chk "kanal değiştir → e-posta (çalışıyor)" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ]'
C6=$(otp_of wa@ornek.com mail)
api "$J_A3" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$C6\"}" -H "X-CSRF-Token: $CS_A"
chk "e-postaya geçilen kodla giriş" '[ "$CODE" = 200 ] && [ "$(j .data.me.name)" = Wa_Uye ]'
api "$J_ADM" GET "admin/outbox?ch=sms" ""
chk "gönderim kayıtları (WhatsApp): kodlar maskeli, sağlayıcı whatsapp" '[ "$CODE" = 200 ] && [ "$(j "[.data.log[] | select(.ev==\"tfa\")] | length")" -ge 2 ] && [ "$(j "[.data.log[] | select(.ev==\"tfa\") | .provider] | unique | join(\",\")")" = whatsapp ] && ! echo "$BODY" | jq -r ".data.log[] | select(.ev==\"tfa\") | .x" | grep -qE "[0-9]{6}"'

echo "=== 7. Graph hataları ==="
rl_reset; mock notwa
J_A4="$RUN/a4.jar"; CS_A=$(csrf_of "$J_A4")
api "$J_A4" POST auth/login '{"login":"Wa_Uye","password":"Wa-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
OB=$(sq "SELECT status||'|'||provider||'|'||last_error FROM yp_outbox WHERE channel='sms' AND ev='tfa' ORDER BY id DESC LIMIT 1")
chk "numara WhatsApp'ta değil (131026) → hemen gönderilemedi (yeniden denenmez), Türkçe" '[ "$CODE" = 200 ] && echo "$OB" | grep -q "^failed|whatsapp|İleti teslim edilemedi: numara WhatsApp kullanmıyor"'
rl_reset; mock rate
J_A5="$RUN/a5.jar"; CS_A=$(csrf_of "$J_A5")
api "$J_A5" POST auth/login '{"login":"Wa_Uye","password":"Wa-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
OB=$(sq "SELECT status||'|'||tries FROM yp_outbox WHERE channel='sms' AND ev='tfa' ORDER BY id DESC LIMIT 1")
chk "saniyelik sınır (130429) → kuyrukta kalır, yeniden denenecek" '[ "$OB" = "queued|1" ]'
mock token
api "$J_ADM" POST admin/sms/test '{"to":"0555 444 33 22"}' -H "X-CSRF-Token: $CS_ADM"
chk "anahtar geçersiz (190) → deneme gönderilemedi, Türkçe mesaj" '[ "$CODE" = 200 ] && [ "$(j .data.sent)" = false ] && echo "$(j .msg)" | grep -q "Erişim anahtarı geçersiz veya süresi dolmuş"'
api "$J_ADM" GET "admin/outbox?ch=sms" ""
chk "gönderim kayıtlarında hata görünür" '[ "$(j "[.data.log[] | select(.ev==\"test\")][0].status")" = "Gönderilemedi · Erişim anahtarı geçersiz veya süresi dolmuş. Yönetim › E-posta & WhatsApp › WhatsApp bölümünden yeni (kalıcı) anahtarı girin. (kod 190)" ]'
mock ok

echo "=== 8. Bildirimler: bildirim şablonu kapalıyken yalnız e-posta, açıkken WhatsApp ==="
api "$J_ADM" PUT admin/settings/sms '{"ev":{"pass":true}}' -H "X-CSRF-Token: $CS_ADM"
api "$J_A3" GET boot ""; CS_A3="$(j .data.csrf)"
api "$J_A3" PUT me/profile '{"password":"Wa-Uye-Sifre-2","current_password":"Wa-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS_A3"
chk "şifre değişti → e-posta kuyrukta, WhatsApp yok (bildirim şablonu kapalı)" '[ "$CODE" = 200 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE ev='\''pass'\'' AND channel='\''mail'\''")" -ge 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE ev='\''pass'\'' AND channel='\''sms'\''")" = 0 ]'
api "$J_ADM" PUT admin/settings/sms '{"wa_note_on":true,"wa_note_tpl":""}' -H "X-CSRF-Token: $CS_ADM"
chk "bildirim açık ama şablon adı boş → 422" '[ "$CODE" = 422 ]'
api "$J_ADM" PUT admin/settings/sms '{"wa_note_on":true,"wa_note_tpl":"yangpazar_bildirim","wa_note_lang":"tr"}' -H "X-CSRF-Token: $CS_ADM"
api "$J_A3" GET boot ""; CS_A3="$(j .data.csrf)"
api "$J_A3" PUT me/profile '{"password":"Wa-Uye-Sifre-3","current_password":"Wa-Uye-Sifre-2"}' -H "X-CSRF-Token: $CS_A3"
sleep 1
chk "bildirim şablonu açık → WhatsApp (Utility: yangpazar_bildirim, tek parametre, site adı tekrarlanmaz)" '[ "$(sq "SELECT status||'\''|'\''||provider FROM yp_outbox WHERE ev='\''pass'\'' AND channel='\''sms'\'' ORDER BY id DESC LIMIT 1")" = "sent|whatsapp" ] && walast | jq -e ".json.template.name==\"yangpazar_bildirim\" and (.json.template.components|length)==1 and .json.template.components[0].parameters[0].text==\"Hesap şifreniz değiştirildi.\"" >/dev/null'
api "$J_ADM" POST admin/winback '{"ids":["u2"],"tpl":"Seni özledik {ad}","sms":true}' -H "X-CSRF-Token: $CS_ADM"
chk "geri kazanım WhatsApp'tan: pazarlama şablonu yok → 422 (bildirim şablonu kampanyada kullanılmaz)" '[ "$CODE" = 422 ] && echo "$BODY" | grep -q "pazarlama şablonu"'
api "$J_ADM" GET "admin/winback?days=30" ""
chk "geri kazanım ekranı: WhatsApp kanalı kapalı görünür" '[ "$CODE" = 200 ] && [ "$(j .data.smsOn)" = false ]'

echo "=== 9. Kapatınca: giriş kodu yine e-postaya düşer ==="
api "$J_ADM" PUT admin/settings/sms '{"on":false}' -H "X-CSRF-Token: $CS_ADM"
rl_reset
J_A6="$RUN/a6.jar"; CS_A=$(csrf_of "$J_A6")
api "$J_A6" POST auth/login '{"login":"Wa_Uye","password":"Wa-Uye-Sifre-3"}' -H "X-CSRF-Token: $CS_A"
chk "WhatsApp kapalı → giriş kodu e-postaya" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ]'
api "$J_A2" GET boot ""
chk "boot.set: smsOn=false" '[ "$(j .data.set.smsOn)" = false ]'

echo "=== 10. Günlükler ==="
ERRS=$(grep -E "PHP (Warning|Notice|Deprecated|Fatal|Parse)" "$SLOG")
chk "sunucu günlüğünde PHP uyarısı/hatası yok" '[ -z "$ERRS" ]'
[ -n "$ERRS" ] && echo "$ERRS" | head -5
ERRL=$(cat "$RUN"/storage/log/*.log 2>/dev/null | grep -E "\[hata\]")
chk "uygulama günlüğünde [hata] yok" '[ -z "$ERRL" ]'
[ -n "$ERRL" ] && echo "$ERRL" | head -5
chk "Graph isteklerinde erişim anahtarı yazılmadı" '! grep -q SISTEMKULLANICI "$RUN/storage/test_wa.jsonl"'

echo
echo "SONUÇ (WhatsApp HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
