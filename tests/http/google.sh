#!/usr/bin/env bash
# "Google ile devam et" uçtan uca HTTP testleri (app/src/Google.php, app/routes/12_google.php).
# Yükseltme senaryosu: Google'sız sürüm ($OLD_REF) sihirbazla kurulur, çalışma ağacı üzerine kopyalanır → ilk istek
# users.google_sub / google_email sütunlarını ve benzersiz dizini ekler (Updater). Sonra:
#   yönetim (maskeli/şifreli Client Secret, maskeli değer korunur, biçim denetimi, bağlantı testi), start (302, parametreler,
#   state, nonce, PKCE S256), callback (yanlış/eksik/tekrar state, köken denetimi yalnız bu rotada atlanır), id_token denetimi
#   (iss, aud, exp, nonce, email_verified), yeni üye kaydı (KVKK, kullanıcı adı, hız sınırı, hoş geldin), google_sub ile giriş,
#   e-posta eşleşmesinde güvenli bağlama (şifreyle bir kez giriş), yasaklı hesap, 2FA (güvenilir tarayıcı hariç), profil bağlama /
#   bağlantı kaldırma (şifre yoksa engel), şifresiz hesaba ilk şifre.
# Google sahte: storage/test_mock.json {"google": ok|down|invalid_client|invalid_grant|badiss|badaud|badnonce|expired|unverified}
# (YALNIZ YP_TEST=1 + SQLite), kimlik storage/test_google.json; token istekleri storage/test_google.jsonl'e yazılır.
# Kullanım: bash tests/http/google.sh   (gerekenler: php 8.1+ sqlite, curl, jq, git)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((29600 + RANDOM % 1500))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-google-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
OLD_REF="${OLD_REF:-5e04d12}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$OLD_REF^{commit}" 2>/dev/null && ! git -C "$REPO" cat-file -e "$OLD_REF:app/src/Google.php" 2>/dev/null; then
  git -C "$REPO" archive "$OLD_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: Google'sız $OLD_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
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
chk() { if eval "$2"; then ok "$1"; else bad "$1" "${BODY:-} ${LOC:-}"; fi; }
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
mock() { echo "{\"google\":\"$1\"}" > "$RUN/storage/test_mock.json"; }
# Google kimliği (sahte id_token içeriği): sub e-posta ad soyad [email_verified]
ident() { jq -n --arg s "$1" --arg e "$2" --arg g "$3" --arg f "$4" --argjson v "${5:-true}" '{sub:$s,email:$e,email_verified:$v,name:($g+" "+$f),given_name:$g,family_name:$f}' > "$RUN/storage/test_google.json"; }
qp() { php -r '$u=$argv[1]; $q=parse_url($u, PHP_URL_QUERY); parse_str($q ?: "", $a); echo isset($a[$argv[2]]) ? $a[$argv[2]] : "";' "$1" "$2"; }
frag() { php -r 'echo (string)parse_url($argv[1], PHP_URL_FRAGMENT);' "$1"; }
# yönlendirmeyi izlemeden GET: CODE, LOC
nav() { local jar="$1" url="$2"; shift 2; local out; out=$(curl -s -o /dev/null -b "$jar" -c "$jar" -w '%{http_code} %{redirect_url}' "$@" "$url"); CODE="${out%% *}"; LOC="${out#* }"; }
gstart() { nav "$1" "$B/api/v1/index.php?r=auth/google/start&mode=${2:-login}&ret=${3:-home}" -H 'Sec-Fetch-Site: same-origin'; STATE=$(qp "$LOC" state); }
# Google'dan dönüş (başka siteden üst düzey gezinme)
gcb() { nav "$1" "$B/api/v1/index.php?r=auth/google/callback&state=$2&code=${3:-4/0AfJohXk-test}&scope=email%20profile%20openid&authuser=0&prompt=consent" -H 'Sec-Fetch-Site: cross-site' -H 'Sec-Fetch-Mode: navigate'; GA=$(qp "$LOC" gauth); }
gflow() { gstart "$1" "${2:-login}" "${3:-home}"; gcb "$1" "$STATE"; }
otp_of() { curl -s "$B/api/v1/_test/outbox?to=$(printf %s "$1" | jq -sRr @uri)" | jq -r "[.data.rows[] | select(.ev==\"tfa\")][0].body" | grep -oE '[0-9]{6}' | head -1; }
gget() { php -r 'define("YP_STORAGE",$argv[1]); require $argv[2]; YP\Store::requireKey(); $db=YP\Db::connect(YP\Store::dbConfig()); YP\Db::setMain($db); $r=$db->one("SELECT v FROM {settings} WHERE k=?",["google"]); echo $r?yp_decrypt($r["v"]):"";' "$RUN/storage" "$RUN/app/bootstrap.php"; }
b64chal() { php -r 'echo rtrim(strtr(base64_encode(hash("sha256",$argv[1],true)),"+/","-_"),"=");' "$1"; }
reg() { # normal üyelik: jar ad e-posta tel şifre → UID
  local cs; cs=$(csrf_of "$1")
  api "$1" POST auth/register "{\"name\":\"$2\",\"email\":\"$3\",\"tel\":\"$4\",\"ad\":\"Deneme\",\"soyad\":\"Uye\",\"password\":\"$5\"}" -H "X-CSRF-Token: $cs"
  UID_="$(j .data.me.id)"; UID_="${UID_#u}"
}

J_K="$RUN/k.jar"; J_ADM="$RUN/adm.jar"; J_M="$RUN/m.jar"
CID='123456789012-abcdefghij0123456789klmnopqrstuv.apps.googleusercontent.com'
SEC='GOCSPX-TestSecret_1234567890abcdXY'
RURI="$B/api/v1/index.php?r=auth/google/callback"

echo "=== 1. Kurulum: Google'sız sürüm ($OLD_REF) ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang Google" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
php -r 'define("YP_STORAGE",$argv[1]); require $argv[2]; YP\Store::requireKey(); $db=YP\Db::connect(YP\Store::dbConfig()); YP\Db::setMain($db);
  $m=YP\Settings::get("mail",$db); $m["on"]=true; $m["provider"]=""; $m["fallback"]=true; $m["from"]="noreply@yangpazar.test"; YP\Settings::set("mail",$m,null,$db);' "$RUN/storage" "$RUN/app/bootstrap.php"
reg "$RUN/old.jar" Eski_Uye eski@ornek.com "0532 111 22 33" 'Eski-Uye-Sifre-1'
OLDU="$UID_"
if [ "$UPGRADE" = 1 ]; then
  chk "eski sürümde google_sub sütunu yok" '[ -z "$(sq "SELECT name FROM pragma_table_info('\''yp_users'\'') WHERE name='\''google_sub'\''")" ]'
fi

echo "=== 2. Çalışma ağacı üzerine kopyalanır: Updater sütunları ekler ==="
if [ "$UPGRADE" = 1 ]; then
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 3 # opcache.revalidate_freq dolsun
fi
api "$J_M" GET boot ""
chk "ilk istek 200, googleOn=false (ayarlanmadı)" '[ "$CODE" = 200 ] && [ "$(j .data.set.googleOn)" = false ]'
chk "yükseltme: users.google_sub ve google_email sütunları eklendi" '[ -n "$(sq "SELECT name FROM pragma_table_info('\''yp_users'\'') WHERE name='\''google_sub'\''")" ] && [ -n "$(sq "SELECT name FROM pragma_table_info('\''yp_users'\'') WHERE name='\''google_email'\''")" ]'
chk "yükseltme: google_sub benzersiz dizini var" '[ "$(sq "SELECT \"unique\" FROM pragma_index_list('\''yp_users'\'') WHERE name LIKE '\''%uq_google_sub'\''")" = 1 ]'
chk "yükseltme: eski üye korunur (google_sub NULL, şifreyle giriş)" '[ "$(sq "SELECT COUNT(*) FROM yp_users WHERE id=$OLDU AND google_sub IS NULL")" = 1 ]'
CS=$(csrf_of "$RUN/old.jar"); api "$RUN/old.jar" POST auth/login '{"login":"Eski_Uye","password":"Eski-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS"
chk "eski üye şifreyle giriş; me.hasPass=true, gLinked=false" '[ "$CODE" = 200 ] && [ "$(j .data.me.hasPass)" = true ] && [ "$(j .data.me.gLinked)" = false ]'

echo "=== 3. Yönetim › Entegrasyonlar › Google ile giriş ==="
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
api "$J_ADM" GET admin/integrations/google ""
chk "kart: ayarlanmadı, yönlendirme adresi /api/v1/index.php?r=auth/google/callback, kaynak site kökü" '[ "$CODE" = 200 ] && [ "$(j .data.google.configured)" = false ] && [ "$(j .data.google.redirect)" = "$RURI" ] && [ "$(j .data.google.origin)" = "$B" ] && [ "$(j .data.google.canEdit)" = true ]'
api "$J_ADM" PUT admin/integrations/google '{"on":true}' -H "X-CSRF-Token: $CS_ADM"
chk "bilgiler girilmeden açılamaz (422)" '[ "$CODE" = 422 ] && [ -n "$(j .fields.g_on)" ]'
api "$J_ADM" PUT admin/integrations/google '{"client_id":"abc.apps.example.com","client_secret":"x"}' -H "X-CSRF-Token: $CS_ADM"
chk "biçim denetimi: Client ID ve Secret (422, Türkçe)" '[ "$CODE" = 422 ] && j .fields.g_cid | grep -q googleusercontent && [ -n "$(j .fields.g_sec)" ]'
api "$J_ADM" POST admin/integrations/google/test "" -H "X-CSRF-Token: $CS_ADM"
chk "test: bilgiler yokken 422" '[ "$CODE" = 422 ] && [ "$(j .code)" = not_configured ]'
api "$J_ADM" PUT admin/integrations/google "{\"on\":true,\"client_id\":\"$CID\",\"client_secret\":\"$SEC\"}" -H "X-CSRF-Token: $CS_ADM"
chk "kaydedildi: Client Secret maskeli (••••••XY), Client ID açık, patch.set.googleOn" '[ "$CODE" = 200 ] && [ "$(j .data.google.client_secret)" = "••••••XY" ] && [ "$(j .data.google.client_id)" = "$CID" ] && [ "$(j .patch.set.googleOn)" = true ] && ! echo "$BODY" | grep -q TestSecret'
chk "settings.google şifreli (secret=1, düz metin yok)" '[ "$(sq "SELECT secret FROM yp_settings WHERE k='\''google'\''")" = 1 ] && ! sq "SELECT v FROM yp_settings WHERE k='\''google'\''" | grep -q -e TestSecret -e googleusercontent && gget | grep -q TestSecret'
api "$J_ADM" PUT admin/integrations/google '{"on":true,"client_secret":"••••••XY","client_id":"'"$CID"'"}' -H "X-CSRF-Token: $CS_ADM"
chk "maskeli değer gönderilince eski Secret korunur" '[ "$CODE" = 200 ] && [ "$(gget | jq -r .client_secret)" = "$SEC" ]'
api "$J_ADM" PUT admin/integrations/google '{"client_secret":""}' -H "X-CSRF-Token: $CS_ADM"
chk "boş değer gönderilince eski Secret korunur" '[ "$CODE" = 200 ] && [ "$(gget | jq -r .client_secret)" = "$SEC" ]'
api "$J_ADM" GET admin/integrations/google ""
chk "GET kartı: maskeli, açık, düz Secret yok" '[ "$(j .data.google.client_secret)" = "••••••XY" ] && [ "$(j .data.google.enabled)" = true ] && ! echo "$BODY" | grep -q TestSecret'
chk "audit: integration_save (Secret yok)" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''integration_save'\'' AND entity_id='\''google'\''")" -ge 2 ] && ! sq "SELECT GROUP_CONCAT(data) FROM yp_audit_log" | grep -q TestSecret'
mock ok
api "$J_ADM" POST admin/integrations/google/test "" -H "X-CSRF-Token: $CS_ADM"
chk "bağlantı testi: keşif belgesi + Client tanındı (invalid_grant) → başarılı, sınır notu" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ] && j .data.msg | grep -q "tanındı" && j .data.msg | grep -q "denetlenemez" && [ "$(j .data.google.lastTest.ok)" = true ]'
chk "test isteği yönlendirme adresi ve Client ID ile gitti" '[ "$(tail -1 "$RUN/storage/test_google.jsonl" | jq -r .redirect_uri)" = "$RURI" ] && [ "$(tail -1 "$RUN/storage/test_google.jsonl" | jq -r .client_id)" = "$CID" ]'
mock invalid_client
api "$J_ADM" POST admin/integrations/google/test "" -H "X-CSRF-Token: $CS_ADM"
chk "bağlantı testi: invalid_client → başarısız, Türkçe" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = false ] && j .data.msg | grep -q "tanımadı"'
mock down
api "$J_ADM" POST admin/integrations/google/test "" -H "X-CSRF-Token: $CS_ADM"
chk "bağlantı testi: Google'a ulaşılamıyor → başarısız" '[ "$(j .data.ok)" = false ] && j .data.msg | grep -q "ulaşılamadı"'
CS_O=$(csrf_of "$RUN/old.jar")
api "$RUN/old.jar" GET admin/integrations/google ""
chk "üye yönetim kartını göremez" '[ "$CODE" = 403 ] || [ "$CODE" = 401 ]'
api "$RUN/old.jar" PUT admin/integrations/google '{"on":false}' -H "X-CSRF-Token: $CS_O"
chk "üye ayarı değiştiremez" '[ "$CODE" = 403 ] || [ "$CODE" = 401 ]'
api "$J_M" GET boot ""
chk "boot.set.googleOn=true" '[ "$(j .data.set.googleOn)" = true ]'
mock ok

echo "=== 4. start: 302 Google'a, parametreler, state, nonce, PKCE ==="
J1="$RUN/g1.jar"
gstart "$J1" register hesabim
chk "302 → accounts.google.com/o/oauth2/v2/auth" '[ "$CODE" = 302 ] && [[ "$LOC" == https://accounts.google.com/o/oauth2/v2/auth\?* ]]'
chk "client_id, redirect_uri (tam), response_type=code, scope=openid email profile, prompt=select_account" '[ "$(qp "$LOC" client_id)" = "$CID" ] && [ "$(qp "$LOC" redirect_uri)" = "$RURI" ] && [ "$(qp "$LOC" response_type)" = code ] && [ "$(qp "$LOC" scope)" = "openid email profile" ] && [ "$(qp "$LOC" prompt)" = select_account ]'
CHAL=$(qp "$LOC" code_challenge); NONCE=$(qp "$LOC" nonce)
chk "state (32) ve nonce rastgele; PKCE S256 (43 karakter)" '[ ${#STATE} -ge 32 ] && [ ${#NONCE} -ge 32 ] && [ "$STATE" != "$NONCE" ] && [ "$(qp "$LOC" code_challenge_method)" = S256 ] && [ ${#CHAL} = 43 ]'
ST1="$STATE"
gstart "$RUN/g1b.jar" login
chk "her başlangıçta farklı state" '[ -n "$STATE" ] && [ "$STATE" != "$ST1" ]'
STATE="$ST1"
api "$J1" GET "auth/google/callback" "" -H 'Sec-Fetch-Site: cross-site'
chk "callback (state yok) → 302 ?gauth=state" '[ "$CODE" = 302 ] && [[ "$(curl -s -o /dev/null -w "%{redirect_url}" -b "$J1" -H "Sec-Fetch-Site: cross-site" "$B/api/v1/index.php?r=auth/google/callback")" == *gauth=state* ]]'

echo "=== 5. callback: yanlış state reddedilir ==="
ident 200000000000000000001 yeni.oyuncu@gmail.com "Yeni" "Oyuncu"
N0=$(wc -l < "$RUN/storage/test_google.jsonl")
gcb "$J1" "yanlis-state-0000000000000000000000"
chk "yanlış state → 302 <site>/?gauth=state#home, token isteği yapılmaz" '[ "$CODE" = 302 ] && [ "$GA" = state ] && [[ "$LOC" == "$B/?gauth=state#"* ]] && [ "$(wc -l < "$RUN/storage/test_google.jsonl")" = "$N0" ]'
gcb "$RUN/bos.jar" "$ST1"
chk "başka tarayıcıda (oturum yok) doğru state bile → state" '[ "$GA" = state ]'
chk "audit google_fail (state)" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''google_fail'\'' AND data LIKE '\''%state%'\''")" -ge 2 ]'

echo "=== 6. Yeni üye: kayıt formu (Google ile kaydı tamamla) ==="
gcb "$J1" "$ST1"
chk "doğru state (yanlış denemeden sonra da) → ?gauth=register#hesabim" '[ "$CODE" = 302 ] && [ "$GA" = register ] && [ "$(frag "$LOC")" = hesabim ]'
TL=$(tail -1 "$RUN/storage/test_google.jsonl")
chk "token isteği: code, redirect_uri, client_secret, grant_type, PKCE code_verifier (sha256 = challenge)" '[ "$(echo "$TL" | jq -r .grant_type)" = authorization_code ] && [ "$(echo "$TL" | jq -r .redirect_uri)" = "$RURI" ] && [ "$(echo "$TL" | jq -r .client_secret)" = "$(printf %s "$SEC" | sha256sum | cut -d" " -f1)" ] && [ "$(b64chal "$(echo "$TL" | jq -r .code_verifier)")" = "$CHAL" ] && [ "$(echo "$TL" | jq -r .code)" = "4/0AfJohXk-test" ]'
gcb "$J1" "$ST1"
chk "aynı state ikinci kez kullanılamaz" '[ "$GA" = state ]'
api "$J1" GET boot ""
chk "henüz oturum yok, hesap yok" '[ "$(j .data.me)" = null ] && [ "$(sq "SELECT COUNT(*) FROM yp_users WHERE email='\''yeni.oyuncu@gmail.com'\''")" = 0 ]'
CS1="$(j .data.csrf)"
api "$J1" GET auth/google/pending ""
chk "pending: register, Google e-postası, kullanıcı adı önerisi, ad/soyad" '[ "$(j .data.pending.k)" = register ] && [ "$(j .data.pending.email)" = yeni.oyuncu@gmail.com ] && [ "$(j .data.pending.name)" = Yeni_Oyuncu ] && [ "$(j .data.pending.ad)" = Yeni ] && [ "$(j .data.pending.soyad)" = Oyuncu ]'
api "$J1" POST auth/google/register '{"name":"Yeni_Oyuncu","tel":"0533 444 55 66","ad":"Yeni","soyad":"Oyuncu"}' -H "X-CSRF-Token: $CS1"
chk "KVKK onayı olmadan reddedilir (422 kvkk)" '[ "$CODE" = 422 ] && [ -n "$(j .fields.kvkk)" ]'
api "$J1" POST auth/google/register '{"name":"Eski_Uye","tel":"0533 444 55 66","ad":"Yeni","soyad":"Oyuncu","kvkk":true}' -H "X-CSRF-Token: $CS1"
chk "alınmış kullanıcı adı (422)" '[ "$CODE" = 422 ] && j .fields.name | grep -q "alınmış"'
api "$J1" POST auth/google/register '{"name":"ab","tel":"123","ad":"Y","soyad":"O","kvkk":true}' -H "X-CSRF-Token: $CS1"
chk "normal üyelik doğrulamaları (ad, telefon, ad/soyad)" '[ "$CODE" = 422 ] && [ -n "$(j .fields.name)" ] && [ -n "$(j .fields.tel)" ] && [ -n "$(j .fields.ad)" ]'
api "$J1" POST auth/google/register '{"name":"Yeni_Oyuncu","tel":"0533 444 55 66","ad":"Yeni","soyad":"Oyuncu","kvkk":true}'
chk "CSRF olmadan reddedilir" '[ "$CODE" = 403 ] && [ "$(j .code)" = csrf ]'
api "$J1" POST auth/google/register '{"name":"Yeni_Oyuncu","tel":"0533 444 55 66","ad":"Yeni","soyad":"Oyuncu","kvkk":true}' -H "X-CSRF-Token: $CS1"
GU="$(j .data.me.id)"; GU="${GU#u}"
chk "hesap açıldı ve giriş yapıldı: gLinked, hasPass=false, e-posta Google'dan" '[ "$CODE" = 200 ] && [ "$(j .data.me.name)" = Yeni_Oyuncu ] && [ "$(j .data.me.gLinked)" = true ] && [ "$(j .data.me.hasPass)" = false ] && [ "$(j .data.me.email)" = yeni.oyuncu@gmail.com ] && [ "$(j .data.me.gEmail)" = yeni.oyuncu@gmail.com ]'
CS1="$(j .data.csrf)"
chk "DB: google_sub, şifre kullanılamaz (!), cüzdan" '[ "$(sq "SELECT google_sub FROM yp_users WHERE id=$GU")" = 200000000000000000001 ] && [ "$(sq "SELECT substr(pass_hash,1,1) FROM yp_users WHERE id=$GU")" = "!" ] && [ "$(sq "SELECT COUNT(*) FROM yp_wallets WHERE user_id=$GU")" = 1 ]'
chk "hoş geldin bildirimi + e-postası (welcome), audit register google" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=$GU AND ev='\''welcome'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE to_addr='\''yeni.oyuncu@gmail.com'\'' AND ev='\''welcome'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''register'\'' AND actor_id=$GU AND data LIKE '\''%\"google\":true%'\''")" = 1 ]'
api "$J1" POST auth/google/register '{"name":"Yeni_Oyuncu2","tel":"0533 444 55 67","ad":"Yeni","soyad":"Oyuncu","kvkk":true}' -H "X-CSRF-Token: $CS1"
chk "bekleyen kayıt tek kullanımlık (oturum açıkken 409)" '[ "$CODE" = 409 ]'
api "$RUN/sifre.jar" POST auth/login '{"login":"Yeni_Oyuncu","password":"!google"}' -H "X-CSRF-Token: $(csrf_of "$RUN/sifre.jar")"
chk "şifresiz hesaba şifreyle giriş yapılamaz" '[ "$CODE" = 401 ]'

echo "=== 7. Bağlantı kaldırma şifre yokken engellenir; ilk şifre ==="
api "$J1" POST me/google/unlink "" -H "X-CSRF-Token: $CS1"
chk "şifre yokken bağlantı kaldırılamaz (422 google_nopass)" '[ "$CODE" = 422 ] && [ "$(j .code)" = google_nopass ] && [ -n "$(sq "SELECT google_sub FROM yp_users WHERE id=$GU")" ]'
api "$J1" PUT me/profile '{"email":"baska@ornek.com"}' -H "X-CSRF-Token: $CS1"
chk "şifresiz hesapta e-posta değişikliği önce şifre ister" '[ "$CODE" = 422 ] && j .fields.email | grep -q "şifre belirleyin"'
api "$J1" PUT me/profile '{"password":"Google-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS1"
chk "şifresiz hesap ilk şifreyi mevcut şifre sormadan belirler" '[ "$CODE" = 200 ] && [ "$(j .patch.me.hasPass)" = true ] && [ "$(sq "SELECT substr(pass_hash,1,4) FROM yp_users WHERE id=$GU")" = "\$2y\$" ]'
api "$J1" PUT me/profile '{"password":"Google-Uye-Sifre-2"}' -H "X-CSRF-Token: $CS1"
chk "şifre belirlendikten sonra değişiklik yine mevcut şifre ister" '[ "$CODE" = 422 ] && [ -n "$(j .fields.current_password)" ]'

echo "=== 8. Kayıtlı google_sub ile giriş ==="
api "$J1" POST auth/logout "" -H "X-CSRF-Token: $CS1"
gflow "$J1" login borsa
chk "callback → ?gauth=ok#borsa" '[ "$CODE" = 302 ] && [ "$GA" = ok ] && [ "$(frag "$LOC")" = borsa ]'
api "$J1" GET boot ""
chk "oturum açık (boot.me), audit login {google:true}" '[ "$(j .data.me.name)" = Yeni_Oyuncu ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''login'\'' AND actor_id=$GU AND data LIKE '\''%\"google\":true%'\''")" -ge 1 ]'
CS1="$(j .data.csrf)"
gstart "$J1" login
chk "oturum açıkken giriş akışı → already_in (Google'a gidilmez)" '[ "$(qp "$LOC" gauth)" = already_in ]'
api "$J1" POST me/google/unlink "" -H "X-CSRF-Token: $CS1"
chk "şifre varken bağlantı kaldırılır; audit google_unlink" '[ "$CODE" = 200 ] && [ "$(j .patch.me.gLinked)" = false ] && [ -z "$(sq "SELECT google_sub FROM yp_users WHERE id=$GU")" ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''google_unlink'\'' AND actor_id=$GU")" = 1 ]'

echo "=== 9. Profilden bağlama (mode=link) ==="
gflow "$J1" link hesabim
chk "bağla → ?gauth=linked#hesabim, google_sub geri geldi" '[ "$GA" = linked ] && [ "$(frag "$LOC")" = hesabim ] && [ "$(sq "SELECT google_sub FROM yp_users WHERE id=$GU")" = 200000000000000000001 ]'
gflow "$RUN/old.jar" link hesabim
chk "aynı Google hesabını başka üye bağlayamaz (taken)" '[ "$GA" = taken ] && [ -z "$(sq "SELECT google_sub FROM yp_users WHERE id=$OLDU")" ]'
gstart "$RUN/anon.jar" link hesabim
chk "oturumsuz bağlama → auth (Google'a gidilmez)" '[ "$(qp "$LOC" gauth)" = auth ]'
chk "audit google_link (register + profile)" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''google_link'\'' AND actor_id=$GU")" -ge 2 ]'

echo "=== 10. E-posta eşleşmesi: sessizce bağlanmaz, şifreyle bir kez giriş ==="
reg "$RUN/e.jar" Esle_Uye esle@ornek.com "0532 222 33 44" 'Esle-Uye-Sifre-1'; EU="$UID_"
ident 300000000000000000003 Esle@Ornek.com "Esle" "Uye"
J3="$RUN/g3.jar"
gflow "$J3" login
chk "e-posta eşleşti → ?gauth=link; hesap BAĞLANMADI, oturum yok" '[ "$GA" = link ] && [ -z "$(sq "SELECT google_sub FROM yp_users WHERE id=$EU")" ]'
api "$J3" GET boot ""; CS3="$(j .data.csrf)"
chk "boot.me null" '[ "$(j .data.me)" = null ]'
api "$J3" GET auth/google/pending ""
chk "pending: link, e-posta" '[ "$(j .data.pending.k)" = link ] && [ "$(j .data.pending.email)" = esle@ornek.com ]'
api "$J3" POST auth/google/register '{"name":"Esle_Iki","tel":"0533 444 55 68","ad":"Esle","soyad":"Uye","kvkk":true}' -H "X-CSRF-Token: $CS3"
chk "eşleşen e-postayla ikinci hesap açılamaz (g_gone)" '[ "$CODE" = 400 ] && [ "$(j .code)" = g_gone ]'
api "$J3" POST auth/google/link '{"password":"yanlis-sifre"}' -H "X-CSRF-Token: $CS3"
chk "yanlış şifre → 401, bağlanmaz" '[ "$CODE" = 401 ] && [ -z "$(sq "SELECT google_sub FROM yp_users WHERE id=$EU")" ]'
api "$J3" POST auth/google/link '{"password":"Esle-Uye-Sifre-1"}' -H "X-CSRF-Token: $CS3"
chk "doğru şifre → giriş + bağlandı; audit google_link via email" '[ "$CODE" = 200 ] && [ "$(j .data.me.name)" = Esle_Uye ] && [ "$(j .data.me.gLinked)" = true ] && [ "$(sq "SELECT google_sub FROM yp_users WHERE id=$EU")" = 300000000000000000003 ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''google_link'\'' AND actor_id=$EU AND data LIKE '\''%email%'\''")" = 1 ]'
CS3="$(j .data.csrf)"; api "$J3" POST auth/logout "" -H "X-CSRF-Token: $CS3"
gflow "$J3" login
chk "artık Google ile doğrudan giriş" '[ "$GA" = ok ]'

echo "=== 11. Yasaklı hesap ==="
sqx "UPDATE yp_users SET status='banned' WHERE id=$EU"
J4="$RUN/g4.jar"
gflow "$J4" login
api "$J4" GET boot ""
chk "yasaklı → ?gauth=banned, oturum açılmaz, audit login_banned google" '[ "$GA" = banned ] && [ "$(j .data.me)" = null ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''login_banned'\'' AND actor_id=$EU AND data LIKE '\''%google%'\''")" -ge 1 ]'
api "$J3" GET boot ""
chk "yasaklanınca açık Google oturumu da düşer" '[ "$(j .data.me)" = null ]'
reg "$RUN/b.jar" Yasak_Esle yasak@ornek.com "0532 222 33 45" 'Yasak-Esle-Sifre-1'; BU="$UID_"
sqx "UPDATE yp_users SET status='banned' WHERE id=$BU"
ident 300000000000000000033 yasak@ornek.com "Yasak" "Esle"
gflow "$RUN/g4b.jar" login
chk "yasaklı hesapla e-posta eşleşmesi → banned (bağlama/kayıt yok)" '[ "$GA" = banned ] && [ -z "$(sq "SELECT google_sub FROM yp_users WHERE id=$BU")" ]'

echo "=== 12. 2FA: güvenilir tarayıcı değilse aynı kod adımı ==="
rl_reset
reg "$RUN/t.jar" Tfa_Uye tfa@ornek.com "0532 333 44 55" 'Tfa-Uye-Sifre-1'; TU="$UID_"
sqx "UPDATE yp_users SET tfa='mail', google_sub='400000000000000000004', google_email='tfa.uye@gmail.com' WHERE id=$TU"
ident 400000000000000000004 tfa.uye@gmail.com "Tfa" "Uye"
J5="$RUN/g5.jar"
gflow "$J5" login hesabim
api "$J5" GET boot ""; CS5="$(j .data.csrf)"
chk "2FA açık → ?gauth=tfa, oturum henüz açılmadı" '[ "$GA" = tfa ] && [ "$(j .data.me)" = null ]'
api "$J5" GET auth/google/pending ""
TID="$(j .data.pending.tfa.id)"
chk "pending: tfa (kanal e-posta, maskeli adres)" '[ "$(j .data.pending.k)" = tfa ] && [ "$(j .data.pending.tfa.ch)" = mail ] && [ "$(j .data.pending.tfa.purpose)" = login ] && j .data.pending.tfa.dest | grep -q "•••@ornek.com"'
api "$J5" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"000000\"}" -H "X-CSRF-Token: $CS5"
chk "yanlış kod → 400" '[ "$CODE" = 400 ] && [ "$(j .code)" = tfa_bad ]'
C6=$(otp_of tfa@ornek.com)
api "$J5" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$C6\"}" -H "X-CSRF-Token: $CS5"
chk "kod doğru → giriş; audit login {tfa:mail, google:true}" '[ "$CODE" = 200 ] && [ "$(j .data.me.name)" = Tfa_Uye ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''login'\'' AND actor_id=$TU AND data LIKE '\''%\"tfa\":\"mail\"%'\'' AND data LIKE '\''%\"google\":true%'\''")" = 1 ]'
CS5="$(j .data.csrf)"
chk "güvenilir cihaz çerezi (YPT) yazıldı" 'grep -q YPT "$J5"'
api "$J5" POST auth/logout "" -H "X-CSRF-Token: $CS5"
gflow "$J5" login
chk "aynı tarayıcı (güvenilir) → kod sorulmadan ?gauth=ok" '[ "$GA" = ok ]'
rl_reset
gflow "$RUN/g5b.jar" login
chk "başka tarayıcı → yine kod adımı" '[ "$GA" = tfa ]'

echo "=== 13. E-posta eşleşmesi + 2FA: bağlama kod doğrulandıktan SONRA ==="
rl_reset
reg "$RUN/t2.jar" Tfa_Esle t2@ornek.com "0532 333 44 56" 'Tfa-Esle-Sifre-1'; T2="$UID_"
sqx "UPDATE yp_users SET tfa='mail' WHERE id=$T2"
ident 500000000000000000005 t2@ornek.com "Tfa" "Esle"
J6="$RUN/g6.jar"
gflow "$J6" login
api "$J6" GET boot ""; CS6="$(j .data.csrf)"
api "$J6" POST auth/google/link '{"password":"Tfa-Esle-Sifre-1"}' -H "X-CSRF-Token: $CS6"
TID="$(j .tfa.id)"
chk "şifre doğru, 2FA açık → kod adımı; henüz BAĞLANMADI" '[ "$GA" = link ] && [ "$CODE" = 200 ] && [ -n "$TID" ] && [ "$TID" != null ] && [ -z "$(sq "SELECT google_sub FROM yp_users WHERE id=$T2")" ]'
C6=$(otp_of t2@ornek.com)
api "$J6" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$C6\"}" -H "X-CSRF-Token: $CS6"
chk "kod doğru → giriş + bağlandı (audit linked)" '[ "$CODE" = 200 ] && [ "$(j .data.me.gLinked)" = true ] && [ "$(sq "SELECT google_sub FROM yp_users WHERE id=$T2")" = 500000000000000000005 ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''login'\'' AND actor_id=$T2 AND data LIKE '\''%\"linked\":true%'\''")" = 1 ]'

echo "=== 14. id_token denetimi ve Google hataları ==="
ident 600000000000000000006 hata@gmail.com "Hata" "Deneme"
for sc in badiss:claims badaud:claims badnonce:claims expired:claims unverified:unverified invalid_grant:token down:token; do
  mock "${sc%%:*}"; gflow "$RUN/h-${sc%%:*}.jar" register
  chk "Google ${sc%%:*} → ?gauth=${sc#*:}, hesap/oturum yok" '[ "$GA" = "${sc#*:}" ] && [ "$(sq "SELECT COUNT(*) FROM yp_users WHERE email='\''hata@gmail.com'\''")" = 0 ]'
done
mock ok
gstart "$RUN/h-c.jar" login
nav "$RUN/h-c.jar" "$B/api/v1/index.php?r=auth/google/callback&state=$STATE&error=access_denied" -H 'Sec-Fetch-Site: cross-site'
chk "kullanıcı vazgeçti (error=access_denied) → cancel" '[ "$(qp "$LOC" gauth)" = cancel ]'
ERRL=$(cat "$RUN"/storage/log/*.log 2>/dev/null | grep -E "\[hata\]")
chk "uygulama günlüğünde [hata] yok" '[ -z "$ERRL" ]'
[ -n "$ERRL" ] && echo "$ERRL" | head -5

echo "=== 15. Köken denetimi yalnız callback'te atlanır; kapatma ==="
api "$J_M" GET boot "" -H 'Sec-Fetch-Site: cross-site'
chk "başka siteden boot hâlâ 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = origin ]'
api "$J_M" GET "auth/google/start" "" -H 'Sec-Fetch-Site: cross-site'
chk "başka siteden start da 403 (yalnız callback serbest)" '[ "$CODE" = 403 ]'
api "$J_ADM" PUT admin/integrations/google '{"on":false}' -H "X-CSRF-Token: $CS_ADM"
chk "kapatıldı; Secret korunur" '[ "$CODE" = 200 ] && [ "$(j .data.google.on)" = false ] && [ "$(gget | jq -r .client_secret)" = "$SEC" ]'
gstart "$RUN/off.jar" login
api "$J_M" GET boot ""
chk "kapalıyken start → ?gauth=off; boot.googleOn=false" '[ "$(qp "$LOC" gauth)" = off ] && [ "$(j .data.set.googleOn)" = false ]'
api "$J_ADM" PUT admin/integrations/google '{"clear":["client_secret"]}' -H "X-CSRF-Token: $CS_ADM"
chk "Secret silinebilir (clear)" '[ "$CODE" = 200 ] && [ "$(j .data.google.client_secret)" = "" ] && [ "$(gget | jq -r .client_secret)" = "" ]'

echo
echo "SONUÇ (Google HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
