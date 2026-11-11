#!/usr/bin/env bash
# P0b uçtan uca HTTP testleri: deponun bir KOPYASI üzerinde php -S (4 işçi) + tests/http/router.php, SQLite dosya veritabanı.
# Kurulum sihirbazı baştan sona çalıştırılır; sonra üyelik, giriş, 2FA, CSRF/köken, hız sınırları, yetki matrisi, yasaklama.
# Kullanım: bash tests/http/p0b.sh      (gerekenler: php 8.1+, curl, jq)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((18000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p0b-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"

mkdir -p "$RUN/storage"
cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$RUN/"
cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"
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
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      → ${2:0:600}"; }
chk() { if eval "$2"; then ok "$1"; else bad "$1" "${BODY:-}"; fi; }
j()   { echo "$BODY" | jq -r "$1" 2>/dev/null; }

# api JAR METHOD PATH [json] [ek curl argümanları…] → CODE, BODY, HDRS
api() {
  local jar="$1" m="$2" p="$3" d="${4:-}"; shift 4 2>/dev/null || shift $#
  local out args=(-s -b "$jar" -c "$jar" -X "$m" -D "$RUN/h.txt" -w '\n%{http_code}')
  [ -n "$d" ] && args+=(-H 'Content-Type: application/json' --data "$d")
  out=$(curl "${args[@]}" "$@" "$B/api/v1/$p")
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"; HDRS="$(cat "$RUN/h.txt")"
}
# Kurulum formu: kur JAR [alan=değer …]  → CODE, BODY (yönlendirmeler izlenir)
kur() {
  local jar="$1"; shift
  local csrf; csrf=$(curl -s -b "$jar" -c "$jar" "$B/kurulum/" | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
  local args=(-s -L -b "$jar" -c "$jar" -w '\n%{http_code}' --data-urlencode "csrf=$csrf")
  for kv in "$@"; do args+=(--data-urlencode "$kv"); done
  local out; out=$(curl "${args[@]}" "$B/kurulum/")
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
csrf_of() { local jar="$1"; api "$jar" GET boot ""; j .data.csrf; }
rl_reset() { rm -f "$RUN"/storage/rl/*.json; }
otp_for() { curl -s "$B/api/v1/_test/outbox?to=$1" | jq -r '[.data.rows[] | select(.ev=="tfa")][0].body' | grep -oE '[0-9]{6}' | head -1; }
sq() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); echo $p->query($argv[1])->fetchColumn();' "$1"; }

J_K="$RUN/k.jar"; J_K2="$RUN/k2.jar"; J_A="$RUN/a.jar"; J_A2="$RUN/a2.jar"; J_B="$RUN/b.jar"; J_ADM="$RUN/adm.jar"
J_S1="$RUN/s1.jar"; J_S2="$RUN/s2.jar"; J_X="$RUN/x.jar"; J_R="$RUN/r.jar"

echo "=== 1. Kurulum sihirbazı ==="
api "$J_X" GET boot ""
chk "kurulmadan API → 503 not_installed (Türkçe)" '[ "$CODE" = 503 ] && [ "$(j .code)" = not_installed ] && echo "$BODY" | grep -q "kurulum"'
printf "<?php\nreturn 'KOD123abc';\n" > "$RUN/storage/kurulum_kodu.php"
OUT=$(curl -s -c "$J_K" -b "$J_K" "$B/kurulum/")
chk "kurulum kodu dosyası varsa kod istenir" 'echo "$OUT" | grep -q "Kurulum kodu"'
kur "$J_K" action=code install_code=yanlis
chk "yanlış kurulum kodu reddedilir" 'echo "$BODY" | grep -q "Kurulum kodu eşleşmedi"'
kur "$J_K" action=code install_code=KOD123abc
chk "doğru kod → ortam denetimi" 'echo "$BODY" | grep -q "Ortam denetimi" && echo "$BODY" | grep -q "PHP sürümü"'
chk "ortam: bellek/yükleme sınırı ve MultiPHP ipucu gösterilir" 'echo "$BODY" | grep -q "MultiPHP INI"'
OUT=$(curl -s -o /dev/null -w '%{http_code}' -X POST --data 'action=env&csrf=sahte' -b "$J_K" "$B/kurulum/")
chk "kurulum: CSRF yanlış → 403" '[ "$OUT" = 403 ]'
kur "$J_K" action=env
chk "ortam → veritabanı formu (Bağlantıyı test et)" 'echo "$BODY" | grep -q "Bağlantıyı test et" && echo "$BODY" | grep -q "MySQL Database Wizard"'
kur "$J_K" action=dbtest driver=mysql host=127.0.0.1 port=1 name=yok user=yok pass=x
chk "MySQL bağlantı hatası → Türkçe mesaj" 'echo "$BODY" | grep -q "note bad"'
kur "$J_K" action=dbtest driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
chk "bağlantı testi (YP_TEST SQLite) → başarılı + sürüm" 'echo "$BODY" | grep -q "Bağlantı başarılı" && echo "$BODY" | grep -q "Sunucu: 3\."'
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
chk "kaydet → tablolar adımı" 'echo "$BODY" | grep -q "Tabloları oluştur" && echo "$BODY" | grep -q "yp_users"'
chk "storage/db.php şifreli (düz yol yok)" '[ -f "$RUN/storage/db.php" ] && ! grep -q "test.sqlite" "$RUN/storage/db.php" && grep -Eq "^return '\''[A-Za-z0-9+/=]+'\'';$" "$RUN/storage/db.php"'
OUT=$(curl -s -c "$J_K2" -b "$J_K2" "$B/kurulum/")
chk "başka tarayıcı kurulumu sürdüremez" 'echo "$OUT" | grep -q "başka bir tarayıcıda"'
kur "$J_K" action=schema
chk "tablolar oluşturuldu → site adımı" 'echo "$BODY" | grep -q "Site adı ve adresi" && [ "$(sq "SELECT COUNT(*) FROM sqlite_master WHERE type='\''table'\'' AND name LIKE '\''yp_%'\''")" -ge 12 ]'
kur "$J_K" action=site site_name="Yang Test" site_url="javascript:alert(1)"
chk "geçersiz site adresi reddedilir" 'echo "$BODY" | grep -q "Site adresi geçersiz"'
kur "$J_K" action=site site_name="Yang Test" site_url="http://127.0.0.1:$PORT"
chk "site kaydedildi → yönetici adımı" 'echo "$BODY" | grep -q "Yönetici hesabı"'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com password=kisa password2=kisa
chk "yönetici şifresi < 10 → reddedilir" 'echo "$BODY" | grep -q "en az 10 karakter"'
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
chk "yönetici oluşturuldu → son adım (demo seçeneği)" 'echo "$BODY" | grep -q "Demo verileriyle kur"'
kur "$J_K" action=finish
chk "bitiş: cron komutu + PayTR bildirim URL" 'echo "$BODY" | grep -q "app/cron.php &gt;/dev/null 2&gt;&amp;1" && echo "$BODY" | grep -q "http://127.0.0.1:$PORT/api/paytr_bildirim.php"'
CRONKEY=$(echo "$BODY" | grep -oE 'cron\?key=[0-9a-f]{48}' | head -1 | cut -d= -f2)
chk "bitiş: cron-job.org adresi (anahtarlı)" '[ ${#CRONKEY} = 48 ]'
chk "kurulum kodu dosyası silindi, kilit yazıldı" '[ ! -f "$RUN/storage/kurulum_kodu.php" ] && [ -f "$RUN/storage/kurulum_tamam.php" ] && [ ! -f "$RUN/storage/kurulum_durum.php" ]'
OUT=$(curl -s -w '\n%{http_code}' "$B/kurulum/")
chk "kurulum kilitli: GET → 403" '[ "${OUT##*$'\''\n'\''}" = 403 ] && echo "$OUT" | grep -q "Kurulum tamamlanmış"'
OUT=$(curl -s -o /dev/null -w '%{http_code}' -b "$J_K" -X POST --data "action=admin&name=Hacker&email=h@x.com&password=$APW&password2=$APW" "$B/kurulum/")
chk "kurulum kilitli: POST → 409, yeni yönetici yok" '[ "$OUT" = 409 ] && [ "$(sq "SELECT COUNT(*) FROM yp_users WHERE role='\''admin'\''")" = 1 ]'
for f in storage/db.php storage/anahtar.php storage/test.sqlite app/bootstrap.php app/src/Db.php app/cron.php; do
  OUT=$(curl -s -o /dev/null -w '%{http_code}' "$B/$f"); chk "erişim kapalı: /$f → 403" '[ "$OUT" = 403 ]'
done

echo "=== 2. Açılış, CSRF, köken ==="
api "$J_A" GET boot ""
chk "boot: ok, csrf, me=null, site adı" '[ "$CODE" = 200 ] && [ "$(j .data.me)" = null ] && [ "$(j .data.set.siteName)" = "Yang Test" ] && [ ${#BODY} -gt 50 ] && [ "$(j .data.csrf | wc -c)" -gt 60 ]'
chk "boot: sır yok (mail ayarı/anahtar)" '! echo "$BODY" | grep -qi -e brevo_key -e smtp_pass -e pepper'
chk "YPS çerezi HttpOnly + SameSite=Lax" 'echo "$HDRS" | grep -i "^set-cookie: YPS=" | grep -qi "httponly" && echo "$HDRS" | grep -i "^set-cookie: YPS=" | grep -qi "samesite=lax"'
chk "API güvenlik başlıkları" 'echo "$HDRS" | grep -qi "^x-content-type-options: nosniff" && echo "$HDRS" | grep -qi "^x-frame-options: DENY" && echo "$HDRS" | grep -qi "^cache-control: no-store"'
CS_A="$(j .data.csrf)"
SID0=$(grep -E "\sYPS\s" "$J_A" | awk '{print $7}')
REG_A='{"name":"Deniz_TR","email":"deniz@ornek.com","tel":"0555 111 22 33","ad":"Deniz","soyad":"Yılmaz","password":"Deniz-Sifre-1"}'
api "$J_A" POST auth/register "$REG_A"
chk "CSRF başlığı yok → 403 csrf" '[ "$CODE" = 403 ] && [ "$(j .code)" = csrf ] && echo "$(j .error)" | grep -q "CSRF"'
api "$J_A" POST auth/register "$REG_A" -H "X-CSRF-Token: yanlis"
chk "CSRF yanlış → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = csrf ]'
api "$J_A" POST auth/register "$REG_A" -H "X-CSRF-Token: $CS_A" -H "Origin: https://kotu-site.example"
chk "başka köken (Origin) → 403 origin" '[ "$CODE" = 403 ] && [ "$(j .code)" = origin ]'
api "$J_A" POST auth/register "$REG_A" -H "X-CSRF-Token: $CS_A" -H "Sec-Fetch-Site: cross-site"
chk "Sec-Fetch-Site: cross-site → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = origin ]'
api "$J_A" GET boot "" -H "Origin: https://kotu-site.example"
chk "başka kökenli GET de reddedilir" '[ "$CODE" = 403 ]'
api "$J_A" POST auth/register '{"name":"a","email":"x","tel":"123","ad":"1","soyad":"","password":"k"}' -H "X-CSRF-Token: $CS_A"
chk "kayıt doğrulama → 422 + alanlar (Türkçe)" '[ "$CODE" = 422 ] && [ "$(j .fields.name)" != null ] && [ "$(j .fields.email)" != null ] && [ "$(j .fields.tel)" != null ] && [ "$(j .fields.password)" != null ] && echo "$(j .fields.tel)" | grep -q "05xx"'
api "$J_A" POST auth/register "$REG_A" -H "X-CSRF-Token: $CS_A" -H "Origin: $B"
chk "kayıt A → 200, me + yeni csrf" '[ "$CODE" = 200 ] && [ "$(j .data.me.name)" = Deniz_TR ] && [ "$(j .data.me.bal)" = 0 ] && [ "$(j .data.me.tel)" = "0555 111 22 33" ] && [ "$(j .data.me.refCode)" = DENIZTR26 ] && [ "$(j .data.csrf)" != "$CS_A" ]'
chk "kayıt yanıtında şifre/hash yok" '! echo "$BODY" | grep -qi -e pass_hash -e "Deniz-Sifre-1" -e "\$2y\$"'
SID1=$(grep -E "\sYPS\s" "$J_A" | awk '{print $7}')
chk "girişte oturum kimliği yenilendi" '[ -n "$SID1" ] && [ "$SID0" != "$SID1" ]'
CS_A="$(j .data.csrf)"; UA="$(j .data.me.id)"
api "$J_A" POST auth/register "$REG_A" -H "X-CSRF-Token: $CS_A"
chk "girişliyken yeniden kayıt → 409" '[ "$CODE" = 409 ]'
CS_B=$(csrf_of "$J_B")
api "$J_B" POST auth/register '{"name":"DENİZ_tr","email":"baska@ornek.com","tel":"05551112244","ad":"Ali","soyad":"Veli","password":"Baska-Sifre-1"}' -H "X-CSRF-Token: $CS_B"
chk "kullanıcı adı TR katlamalı benzersiz (DENİZ_tr) → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.name)" = "Bu kullanıcı adı alınmış." ]'
api "$J_B" POST auth/register '{"name":"Kurt","email":"DENIZ@ornek.com","tel":"05551112244","ad":"Ali","soyad":"Veli","password":"Baska-Sifre-1"}' -H "X-CSRF-Token: $CS_B"
chk "e-posta benzersiz (büyük harf) → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.email)" != null ]'
api "$J_B" POST auth/register '{"name":"Kurt","email":"kurt@ornek.com","tel":"05551112244","ad":"Ali","soyad":"Veli","password":"Kurt-Sifre-12","ref":"YOKBOYLE26"}' -H "X-CSRF-Token: $CS_B"
chk "geçersiz davet kodu → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.ref)" = "Davet kodu bulunamadı." ]'
api "$J_B" POST auth/register '{"name":"Kurt","email":"kurt@ornek.com","tel":"05551112244","ad":"Ali","soyad":"Veli","password":"Kurt-Sifre-12","ref":"deniztr26"}' -H "X-CSRF-Token: $CS_B"
chk "kayıt B (davet koduyla) → refBy = A" '[ "$CODE" = 200 ] && [ "$(j .data.me.refBy)" = "$UA" ]'
CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
api "$J_A" GET poll ""
chk "poll A: davet bildirimi + okunmamış sayısı" '[ "$CODE" = 200 ] && [ "$(j .data.unread.n)" -ge 2 ] && echo "$BODY" | grep -q "Kurt davet linkin"'
NLAST=$(j '.data.notifs[0].id'); NFIRST=$(j '.data.notifs[-1].id')
api "$J_A" GET "poll?n=$NLAST" ""
chk "poll ?n=son → yeni bildirim yok (delta)" '[ "$(j ".data.notifs | length")" = 0 ]'
api "$J_A" GET boot ""
chk "boot (girişli): me + bildirimler + cur" '[ "$(j .data.me.name)" = Deniz_TR ] && [ "$(j .data.cur)" = "$UA" ] && [ "$(j ".data.notifs | length")" -ge 2 ]'

echo "=== 3. Hesabım ==="
api "$J_A" POST "me/notifications/$NFIRST/read" "" -H "X-CSRF-Token: $CS_A"
chk "bildirim okundu" '[ "$CODE" = 200 ] && [ "$(j .data.unread.n)" -ge 1 ]'
api "$J_B" POST "me/notifications/$NLAST/read" "" -H "X-CSRF-Token: $CS_B"
api "$J_A" GET poll ""
chk "başkasının bildirimi okunamaz (A hâlâ okunmamış)" '[ "$(j "[.data.notifs[] | select(.id==\"$NLAST\")][0].read")" = false ]'
api "$J_A" POST me/notifications/read-all "" -H "X-CSRF-Token: $CS_A"
chk "tümünü okundu yap" '[ "$CODE" = 200 ] && [ "$(j .data.unread.n)" = 0 ] && [ "$(j .msg)" = "Tüm bildirimler okundu olarak işaretlendi." ]'
api "$J_A" DELETE me/notifications/read "" -H "X-CSRF-Token: $CS_A"
chk "okunanları sil" '[ "$CODE" = 200 ] && [ "$(j .data.deleted)" -ge 2 ] && echo "$(j .msg)" | grep -q "bildirim silindi"'
api "$J_A" POST me/ibans '{"bank":"Ziraat","name":"Deniz Yılmaz","iban":"TR33 0006 1005 1978 6457 8413 27"}' -H "X-CSRF-Token: $CS_A"
chk "geçersiz IBAN (sağlama) → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.iban)" != null ]'
api "$J_A" POST me/ibans '{"bank":"Ziraat","name":"Deniz Yılmaz","iban":"TR33 0006 1005 1978 6457 8413 26"}' -H "X-CSRF-Token: $CS_A"
chk "IBAN eklendi, yanıtta maskeli" '[ "$CODE" = 200 ] && [ "$(j ".patch.me.ibans[0].iban")" = "TR33••••••1326" ] && ! echo "$BODY" | grep -q "TR330006100519786457841326"'
IB="$(j '.patch.me.ibans[0].id')"
chk "veritabanında IBAN şifreli" '[ -z "$(grep -a -l "TR330006100519786457841326" "$RUN/storage/test.sqlite" "$RUN"/storage/*.sqlite-wal 2>/dev/null)" ]'
api "$J_A" POST me/ibans '{"bank":"Ziraat","name":"Deniz Yılmaz","iban":"TR330006100519786457841326"}' -H "X-CSRF-Token: $CS_A"
chk "aynı IBAN ikinci kez → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.iban)" = "Bu IBAN zaten kayıtlı." ]'
api "$J_B" DELETE "me/ibans/$IB" "" -H "X-CSRF-Token: $CS_B"
chk "başkasının IBAN'ı silinemez → 404" '[ "$CODE" = 404 ]'
api "$J_A" DELETE "me/ibans/$IB" "" -H "X-CSRF-Token: $CS_A"
chk "kendi IBAN'ını sil" '[ "$CODE" = 200 ] && [ "$(j ".patch.me.ibans | length")" = 0 ]'
api "$J_A" PUT me/profile '{"tel":"0532 999 88 77","ad":"Deniz","soyad":"Kaya"}' -H "X-CSRF-Token: $CS_A"
chk "profil güncelle" '[ "$CODE" = 200 ] && [ "$(j .patch.me.tel)" = "0532 999 88 77" ] && [ "$(j .patch.me.soyad)" = Kaya ]'
# ikinci cihaz (A2) aynı hesapla
CS_A2=$(csrf_of "$J_A2")
api "$J_A2" POST auth/login '{"login":"deniz_tr","password":"Deniz-Sifre-1"}' -H "X-CSRF-Token: $CS_A2"
chk "giriş (küçük harf kullanıcı adı) ikinci cihaz" '[ "$CODE" = 200 ] && [ "$(j .data.me.id)" = "$UA" ]'
api "$J_A" PUT me/profile '{"password":"Yeni-Sifre-123"}' -H "X-CSRF-Token: $CS_A"
chk "şifre değişikliği mevcut şifresiz → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.current_password)" != null ]'
api "$J_A" PUT me/profile '{"password":"Yeni-Sifre-123","current_password":"Deniz-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
chk "şifre değişti" '[ "$CODE" = 200 ]'
api "$J_A" GET poll ""
chk "bu cihaz açık kalır" '[ "$CODE" = 200 ]'
api "$J_A2" GET poll ""
chk "diğer cihazın oturumu düştü (session_ver) → 401" '[ "$CODE" = 401 ] && [ "$(j .code)" = auth ]'
api "$J_A" POST auth/logout "" -H "X-CSRF-Token: $CS_A"
chk "çıkış → yeni csrf" '[ "$CODE" = 200 ] && [ "$(j .data.me)" = null ]'
CS_A="$(j .data.csrf)"
api "$J_A" GET poll ""
chk "çıkıştan sonra poll → 401" '[ "$CODE" = 401 ]'
api "$J_A" POST auth/login '{"login":"Deniz_TR","password":"Deniz-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
chk "eski şifre → 401 genel hata" '[ "$CODE" = 401 ] && [ "$(j .error)" = "Kullanıcı adı veya şifre hatalı." ]'
api "$J_A" POST auth/login '{"login":"yokboyle","password":"Deniz-Sifre-1"}' -H "X-CSRF-Token: $CS_A"
chk "olmayan kullanıcı → aynı genel hata" '[ "$CODE" = 401 ] && [ "$(j .error)" = "Kullanıcı adı veya şifre hatalı." ]'
api "$J_A" POST auth/login '{"login":"deniz@ornek.com","password":"Yeni-Sifre-123"}' -H "X-CSRF-Token: $CS_A"
chk "e-posta ile giriş" '[ "$CODE" = 200 ]'
CS_A="$(j .data.csrf)"

echo "=== 4. 2 adımlı doğrulama (e-posta) ==="
api "$J_A" POST me/tfa '{"tfa":"mail"}' -H "X-CSRF-Token: $CS_A"
chk "2FA aç: kod gönderildi (maskeli adres)" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ] && [ "$(j .tfa.dest)" = "de•••@ornek.com" ]'
TID="$(j .tfa.id)"
CODE6=$(otp_for deniz@ornek.com)
chk "kod outbox'ta (test ucu), mail() yedeğiyle gönderildi" '[ ${#CODE6} = 6 ] && grep -q "deniz@ornek.com" "$RUN/sendmail.log"'
WRONG=$([ "$CODE6" = 000000 ] && echo 111111 || echo 000000)
api "$J_A" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$WRONG\"}" -H "X-CSRF-Token: $CS_A"
chk "yanlış kod → 400, kalan 4" '[ "$CODE" = 400 ] && [ "$(j .code)" = tfa_bad ] && [ "$(j .remaining)" = 4 ]'
api "$J_A" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$CODE6\"}" -H "X-CSRF-Token: $CS_A"
chk "doğru kod → 2FA açık" '[ "$CODE" = 200 ] && [ "$(j .patch.me.tfa)" = mail ] && [ "$(j .msg)" = "2 adımlı doğrulama açıldı." ]'
api "$J_A" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$CODE6\"}" -H "X-CSRF-Token: $CS_A"
chk "aynı kod tekrar → reddedilir" '[ "$CODE" = 400 ] && [ "$(j .code)" = tfa_gone ]'
api "$J_A" POST auth/logout "" -H "X-CSRF-Token: $CS_A"; CS_A="$(j .data.csrf)"
rl_reset
api "$J_A" POST auth/login '{"login":"Deniz_TR","password":"Yeni-Sifre-123"}' -H "X-CSRF-Token: $CS_A"
chk "giriş → 2FA sorusu (oturum açılmadı)" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ] && [ "$(j .tfa.purpose)" = login ] && [ "$(j .data.me)" = null ]'
TID="$(j .tfa.id)"
api "$J_A" GET poll ""
chk "kod girilmeden oturum yok → 401" '[ "$CODE" = 401 ]'
api "$J_A" POST auth/tfa/resend "{\"id\":$TID}" -H "X-CSRF-Token: $CS_A"
chk "60 sn dolmadan yeniden gönder → 429" '[ "$CODE" = 429 ] && [ "$(j .code)" = rate_limit ] && echo "$HDRS" | grep -qi "^retry-after:"'
api "$J_A" POST auth/tfa/switch "{\"id\":$TID}" -H "X-CSRF-Token: $CS_A"
chk "SMS kapalıyken kanal değiştir → 422 Türkçe" '[ "$CODE" = 422 ] && [ "$(j .code)" = tfa_channel ]'
api "$J_B" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"123456\"}" -H "X-CSRF-Token: $CS_B"
chk "başka oturum A'nın girişini doğrulayamaz" '[ "$CODE" = 400 ] && [ "$(j .code)" = tfa_gone ]'
CODE6=$(otp_for deniz@ornek.com)
api "$J_A" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$CODE6\"}" -H "X-CSRF-Token: $CS_A"
chk "kod doğru → giriş tamam" '[ "$CODE" = 200 ] && [ "$(j .data.me.name)" = Deniz_TR ] && [ "$(j .data.me.tfa)" = mail ]'
CS_A="$(j .data.csrf)"
api "$J_A" GET poll ""
chk "2FA sonrası poll → 200" '[ "$CODE" = 200 ]'
rl_reset
api "$J_A" POST me/tfa '{"tfa":""}' -H "X-CSRF-Token: $CS_A"
TID="$(j .tfa.id)"; CODE6=$(otp_for deniz@ornek.com)
api "$J_A" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$CODE6\"}" -H "X-CSRF-Token: $CS_A"
chk "2FA kapatma (kodla)" '[ "$CODE" = 200 ] && [ "$(j .patch.me.tfa)" = "" ]'
api "$J_A" POST me/tfa '{"tfa":""}' -H "X-CSRF-Token: $CS_A"
chk "değişiklik yok → 400" '[ "$CODE" = 400 ] && [ "$(j .error)" = "Değişiklik yok." ]'
api "$J_A" POST me/tfa '{"tfa":"sms"}' -H "X-CSRF-Token: $CS_A"
chk "SMS kapalıyken SMS 2FA → 422" '[ "$CODE" = 422 ]'

echo "=== 5. Hız sınırları ==="
rl_reset
CS_R=$(csrf_of "$J_R")
for i in 1 2 3 4 5; do api "$J_R" POST auth/login '{"login":"Kurt","password":"yanlis-sifre"}' -H "X-CSRF-Token: $CS_R"; done
chk "5. hatalı giriş → 401" '[ "$CODE" = 401 ]'
api "$J_R" POST auth/login '{"login":"Kurt","password":"Kurt-Sifre-12"}' -H "X-CSRF-Token: $CS_R"
chk "6. deneme (doğru şifre bile) → 429 (5/15 dk/IP)" '[ "$CODE" = 429 ] && [ "$(j .code)" = rate_limit ]'
IPF="$RUN/storage/rl/$(printf 'login_ip:127.0.0.1' | sha256sum | cut -d' ' -f1).json"
rl_reset
for i in $(seq 1 10); do rm -f "$IPF"; api "$J_R" POST auth/login '{"login":"kurt","password":"yanlis"}' -H "X-CSRF-Token: $CS_R"; done
rm -f "$IPF"
api "$J_R" POST auth/login '{"login":"Kurt","password":"Kurt-Sifre-12"}' -H "X-CSRF-Token: $CS_R"
chk "hesap başına 10/saat → 429 (IP değişse bile)" '[ "$CODE" = 429 ] && echo "$(j .error)" | grep -q "Bu hesap için"'
rl_reset
for i in 1 2 3 4 5; do
  CS_R=$(csrf_of "$RUN/r$i.jar")
  api "$RUN/r$i.jar" POST auth/register "{\"name\":\"Uye$i\",\"email\":\"uye$i@ornek.com\",\"tel\":\"0555 000 00 0$i\",\"ad\":\"Uye\",\"soyad\":\"Test\",\"password\":\"Uye-Sifre-$i$i\"}" -H "X-CSRF-Token: $CS_R"
done
chk "5 kayıt aynı IP → 200" '[ "$CODE" = 200 ]'
CS_R=$(csrf_of "$RUN/r6.jar")
api "$RUN/r6.jar" POST auth/register '{"name":"Uye6","email":"uye6@ornek.com","tel":"0555 000 00 06","ad":"Uye","soyad":"Test","password":"Uye-Sifre-66"}' -H "X-CSRF-Token: $CS_R"
chk "6. kayıt → 429 (5/saat/IP)" '[ "$CODE" = 429 ] && [ "$(j .code)" = rate_limit ]'
rl_reset

echo "=== 6. Yönetici, çalışanlar, yetki matrisi ==="
CS_ADM=$(csrf_of "$J_ADM")
api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"
chk "yönetici girişi" '[ "$CODE" = 200 ] && [ "$(j .data.me.admin)" = true ] && [ "$(j ".data.me.perms | length")" = 23 ]'
CS_ADM="$(j .data.csrf)"
api "$J_ADM" GET boot ""
chk "yönetici boot: yetki etiketleri" '[ "$(j .data.permLabels.calisan)" = "Çalışanlar ve yetkiler" ]'
api "$J_ADM" POST admin/staff '{"name":"Calisan1","email":"c1@yangpazar.com","ad":"Cem","soyad":"Ak","password":"kisa","perms":["uye"]}' -H "X-CSRF-Token: $CS_ADM"
chk "çalışan şifresi < 10 → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.password)" != null ]'
api "$J_ADM" POST admin/staff '{"name":"Calisan1","email":"c1@yangpazar.com","ad":"Cem","soyad":"Ak","password":"Calisan-1-Sifre","perms":["uye","calisan"]}' -H "X-CSRF-Token: $CS_ADM"
chk "çalışan S1 (uye, calisan) eklendi" '[ "$CODE" = 200 ] && [ "$(j ".data.user.perms | join(",")")" = "uye,calisan" ] && [ "$(j .data.user.staff)" = true ]'
S1="$(j .data.user.id)"
api "$J_ADM" POST admin/staff '{"name":"Calisan2","email":"c2@yangpazar.com","ad":"Ece","soyad":"Su","password":"Calisan-2-Sifre","perms":["ara"]}' -H "X-CSRF-Token: $CS_ADM"
S2="$(j .data.user.id)"
chk "çalışan S2 (ara) eklendi" '[ "$CODE" = 200 ] && [ "$(j ".data.user.perms | join(",")")" = "ara" ]'
CS_S1=$(csrf_of "$J_S1"); api "$J_S1" POST auth/login '{"login":"Calisan1","password":"Calisan-1-Sifre"}' -H "X-CSRF-Token: $CS_S1"; CS_S1="$(j .data.csrf)"
CS_S2=$(csrf_of "$J_S2"); api "$J_S2" POST auth/login '{"login":"calisan2","password":"Calisan-2-Sifre"}' -H "X-CSRF-Token: $CS_S2"; CS_S2="$(j .data.csrf)"
chk "çalışanlar giriş yaptı" '[ "$CODE" = 200 ] && [ -n "$CS_S1" ] && [ -n "$CS_S2" ]'

# matris: "yöntem yol gövde" ; beklenen kodlar her kimlik için
MATRIX=(
  "GET admin/staff -"
  "POST admin/staff {\"existing\":\"$UB\",\"perms\":[]}"
  "PUT admin/staff/$S2 {\"perms\":[\"ara\"]}"
  "DELETE admin/staff/$S2 -"
  "GET admin/users -"
  "GET admin/users/$UA -"
  "POST admin/users/$UA/verify {\"verified\":true}"
  "POST admin/users/$UB/ban {\"banned\":false}"
  "GET admin/today -"
  "GET admin/search?q=den -"
  "GET admin/settings/mail -"
  "PUT admin/settings/mail {\"fromName\":\"x\"}"
  "PUT admin/settings/sms {\"header\":\"X\"}"
  "POST admin/mail/test {\"to\":\"t@ornek.com\"}"
  "POST admin/sms/test {\"to\":\"05551112233\"}"
  "GET admin/outbox -"
)
# beklenen: anonim, üye(A), S2 (yalnız ara), S1 (uye+calisan)
EXP_S2=(403 403 403 403 200 403 403 403 200 200 403 403 403 403 403 403)
EXP_S1=(200 SKIP SKIP 403 200 200 200 200 200 403 403 403 403 403 403 403)
for i in "${!MATRIX[@]}"; do
  read -r M P D <<< "${MATRIX[$i]}"; [ "$D" = "-" ] && D=""
  api "$J_X" "$M" "$P" "$D" -H "X-CSRF-Token: x"
  if [ "$M" = GET ]; then E=401; else E=403; fi
  chk "anonim  $M $P → $E" '[ "$CODE" = "$E" ]'
  api "$J_A" "$M" "$P" "$D" -H "X-CSRF-Token: $CS_A"
  chk "üye     $M $P → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = forbidden ]'
  api "$J_S2" "$M" "$P" "$D" -H "X-CSRF-Token: $CS_S2"
  chk "S2[ara] $M $P → ${EXP_S2[$i]}" '[ "$CODE" = "${EXP_S2[$i]}" ]'
  if [ "${EXP_S1[$i]}" != SKIP ]; then
    api "$J_S1" "$M" "$P" "$D" -H "X-CSRF-Token: $CS_S1"
    chk "S1[uye,calisan] $M $P → ${EXP_S1[$i]}" '[ "$CODE" = "${EXP_S1[$i]}" ]'
  fi
done
api "$J_S2" GET admin/today ""
chk "S2 (panel yok): Bugün kuyrukları var, KPI yok" '[ "$(j .data.queues)" != null ] && [ "$(j .data.kpi)" = null ]'
api "$J_ADM" GET admin/today ""
chk "yönetici: Bugün KPI" '[ "$(j .data.kpi.users)" -ge 9 ] && [ "$(j .data.kpi.staff)" = 3 ]'
api "$J_S2" GET "admin/users?q=den" ""
chk "S2 (ara) üye araması" '[ "$CODE" = 200 ] && [ "$(j ".data.users[0].name")" = Deniz_TR ]'

api "$J_S1" POST admin/staff '{"name":"Calisan3","email":"c3@yangpazar.com","ad":"Can","soyad":"Er","password":"Calisan-3-Sifre","perms":["uye","cekim"]}' -H "X-CSRF-Token: $CS_S1"
chk "S1 sahip olmadığı yetkiyi (cekim) veremez → 403 perm_grant" '[ "$CODE" = 403 ] && [ "$(j .code)" = perm_grant ] && echo "$(j .error)" | grep -q "Para çekme onayı"'
api "$J_S1" POST admin/staff '{"name":"Calisan3","email":"c3@yangpazar.com","ad":"Can","soyad":"Er","password":"Calisan-3-Sifre","perms":["uye"]}' -H "X-CSRF-Token: $CS_S1"
chk "S1 kendi yetkisini (uye) verebilir" '[ "$CODE" = 200 ] && [ "$(j ".data.user.perms | join(",")")" = uye ]'
S3="$(j .data.user.id)"
api "$J_S1" PUT "admin/staff/$S2" '{"perms":["ara","bakim"]}' -H "X-CSRF-Token: $CS_S1"
chk "S1, S2'ye bakim ekleyemez → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = perm_grant ]'
api "$J_S1" PUT "admin/staff/$S2" '{"perms":["uye"]}' -H "X-CSRF-Token: $CS_S1"
chk "S1, S2'ye uye ekler; S2'nin ara yetkisi (S1'de yok) korunur" '[ "$CODE" = 200 ] && [ "$(j ".data.user.perms | join(",")")" = "ara,uye" ]'
api "$J_S2" GET "admin/users/$UA" ""
chk "S2 yeni yetkisi hemen geçerli (uye)" '[ "$CODE" = 200 ] && [ "$(j .data.user.email)" = deniz@ornek.com ]'
api "$J_S1" DELETE "admin/staff/$S2" "" -H "X-CSRF-Token: $CS_S1"
chk "S1, kendisinden fazla yetkili S2'yi kaldıramaz → 403" '[ "$CODE" = 403 ]'
UADM=$(sq "SELECT 'u'||id FROM yp_users WHERE role='admin'")
api "$J_S1" PUT "admin/staff/$UADM" '{"perms":[]}' -H "X-CSRF-Token: $CS_S1"
chk "S1 yöneticinin yetkisini değiştiremez → 403" '[ "$CODE" = 403 ]'
api "$J_S1" POST "admin/users/$S2/ban" '{"banned":true}' -H "X-CSRF-Token: $CS_S1"
chk "çalışanı yalnız yönetici askıya alabilir → 403" '[ "$CODE" = 403 ]'
api "$J_S1" DELETE "admin/staff/$S3" "" -H "X-CSRF-Token: $CS_S1"
chk "S1, S3'ü (uye) çalışanlıktan çıkarır" '[ "$CODE" = 200 ]'
api "$J_ADM" GET admin/staff ""
chk "çalışan listesi: yönetici + S1 + S2" '[ "$(j ".data.staff | length")" = 3 ] && [ "$(j ".data.staff[0].admin")" = true ]'

echo "=== 7. Yasaklama oturumu düşürür ==="
CS_B=$(csrf_of "$J_B"); api "$J_B" POST auth/login '{"login":"Kurt","password":"Kurt-Sifre-12"}' -H "X-CSRF-Token: $CS_B"; CS_B="$(j .data.csrf)"
api "$J_B" GET poll ""
chk "B oturumu açık" '[ "$CODE" = 200 ]'
api "$J_S1" POST "admin/users/$UB/ban" '{"reason":"dolandırıcılık"}' -H "X-CSRF-Token: $CS_S1"
chk "S1 (uye) B'yi askıya aldı" '[ "$CODE" = 200 ] && [ "$(j .data.user.banned)" = true ]'
api "$J_B" GET poll ""
chk "B'nin açık oturumu geçersiz → 401" '[ "$CODE" = 401 ] && echo "$(j .error)" | grep -q "Oturumunuz sona erdi"'
api "$J_B" PUT me/profile '{"tel":"05550000000"}' -H "X-CSRF-Token: $CS_B"
chk "B işlem yapamaz → 401" '[ "$CODE" = 401 ]'
CS_B=$(csrf_of "$J_B")
api "$J_B" POST auth/login '{"login":"Kurt","password":"Kurt-Sifre-12"}' -H "X-CSRF-Token: $CS_B"
chk "askıdaki hesap giriş yapamaz → 403 Türkçe" '[ "$CODE" = 403 ] && [ "$(j .code)" = banned ] && echo "$(j .error)" | grep -q "askıya alınmış"'
api "$J_S1" POST "admin/users/$UB/ban" "" -H "X-CSRF-Token: $CS_S1"
chk "askı kaldırıldı (geçiş)" '[ "$CODE" = 200 ] && [ "$(j .data.user.banned)" = false ]'
api "$J_B" POST auth/login '{"login":"Kurt","password":"Kurt-Sifre-12"}' -H "X-CSRF-Token: $CS_B"
chk "B tekrar giriş yapabilir" '[ "$CODE" = 200 ]'
api "$J_S1" POST "admin/users/$UA/verify" "" -H "X-CSRF-Token: $CS_S1"
chk "üye doğrulama (geçiş)" '[ "$CODE" = 200 ] && [ "$(j .data.user.verified)" = true ]'
api "$J_ADM" POST "admin/staff" "{\"existing\":\"$UB\",\"perms\":[\"destek\"]}" -H "X-CSRF-Token: $CS_ADM"
chk "mevcut üyeyi çalışan yap" '[ "$CODE" = 200 ] && [ "$(j .data.user.staff)" = true ]'
api "$J_B" GET poll ""
chk "çalışan yapılan üye yeniden giriş yapmalı (session_ver)" '[ "$CODE" = 401 ]'

echo "=== 8. E-posta/SMS ayarları, cron, eski API ==="
api "$J_ADM" PUT admin/settings/mail '{"on":true,"provider":"brevo","from":"noreply@yangpazar.com","fromName":"Yang Test","brevo_key":"xkeysib-GIZLIANAHTAR-123456","hourly":120}' -H "X-CSRF-Token: $CS_ADM"
chk "mail ayarı kaydedildi, anahtar maskeli" '[ "$CODE" = 200 ] && [ "$(j .data.mail.brevo_key)" = "••••••56" ] && ! echo "$BODY" | grep -q GIZLIANAHTAR'
api "$J_ADM" PUT admin/settings/mail '{"brevo_key":"••••••56","fromName":"Yang"}' -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" GET admin/settings/mail ""
chk "maskeli değer gönderilince anahtar korunur" '[ "$(j .data.mail.brevo_key)" = "••••••56" ] && [ "$(j .data.mail.fromName)" = Yang ] && [ "$(j .data.mail.provider)" = brevo ]'
chk "veritabanında Brevo anahtarı düz metin değil" '! grep -a -q GIZLIANAHTAR "$RUN/storage/test.sqlite" "$RUN"/storage/*.sqlite-wal 2>/dev/null'
api "$J_ADM" PUT admin/settings/mail '{"on":true,"from":"gecersiz"}' -H "X-CSRF-Token: $CS_ADM"
chk "geçersiz gönderen → 422" '[ "$CODE" = 422 ]'
api "$J_ADM" PUT admin/settings/sms '{"on":true,"user":"8503000000"}' -H "X-CSRF-Token: $CS_ADM"
chk "SMS açmak için şifre/başlık gerekli → 422" '[ "$CODE" = 422 ]'
api "$J_ADM" PUT admin/settings/mail '{"provider":""}' -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/mail/test '{"to":"test@ornek.com"}' -H "X-CSRF-Token: $CS_ADM"
chk "deneme e-postası (sağlayıcı yok → mail() yedeği)" '[ "$CODE" = 200 ] && [ "$(j .data.sent)" = true ] && [ "$(j .data.provider)" = phpmail ] && grep -q "test@ornek.com" "$RUN/sendmail.log"'
api "$J_ADM" GET "admin/outbox?ch=mail" ""
chk "gönderim kayıtları: doğrulama kodları maskeli" '[ "$CODE" = 200 ] && [ "$(j ".data.log | length")" -ge 4 ] && ! echo "$BODY" | jq -r ".data.log[] | select(.ev==\"tfa\") | .x" | grep -qE "[0-9]{6}"'
api "$J_X" GET "cron?key=yanlis" ""
chk "cron URL: yanlış anahtar → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = bad_key ]'
api "$J_X" GET "cron?key=$CRONKEY" ""
chk "cron URL: doğru anahtar → görevler çalıştı" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ] && [ "$(j .data.tasks.outbox)" != null ]'
OUT=$(php "$RUN/app/cron.php"); RC=$?
chk "CLI cron (php app/cron.php) → JSON ok" '[ $RC = 0 ] && echo "$OUT" | jq -e ".ok == true" >/dev/null'
OUT=$(curl -s -w '\n%{http_code}' -X POST "$B/api/v1/cron" -H 'Content-Type: application/json' --data '{}')
chk "yanlış yöntem → 405" '[ "${OUT##*$'\''\n'\''}" = 405 ]'
api "$J_X" GET "yok/boyle" ""
chk "olmayan uç → 404 Türkçe" '[ "$CODE" = 404 ] && [ "$(j .code)" = not_found ]'
OUT=$(curl -s "$B/api/durum.php")
chk "eski api/durum.php erişilebilir" 'echo "$OUT" | jq -e ".ok == true" >/dev/null'
OUT=$(curl -s "$B/api/paytr_bildirim.php")
chk "PayTR bildirim adresi değişmedi (/api/paytr_bildirim.php)" 'echo "$OUT" | grep -q "PAYTR notification failed"'
OUT=$(curl -s "$B/api/v1/index.php?r=boot")
chk "mod_rewrite yoksa ?r= ile çalışır" 'echo "$OUT" | jq -e ".ok == true" >/dev/null'

echo "=== 9. Denetim kaydı ve günlükler ==="
chk "audit: giriş, başarısız giriş, 2FA, çalışan, yasak kayıtları" '[ "$(sq "SELECT COUNT(DISTINCT action) FROM yp_audit_log WHERE action IN ('\''login'\'','\''login_fail'\'','\''tfa_enable'\'','\''tfa_disable'\'','\''staff_add'\'','\''staff_perm'\'','\''staff_del'\'','\''user_ban'\'','\''user_unban'\'','\''user_verify'\'','\''settings_mail'\'','\''install_done'\'')")" = 12 ]'
chk "audit: e-posta maskeli" '! sq "SELECT GROUP_CONCAT(data) FROM yp_audit_log" | grep -q "c1@yangpazar.com"'
chk "kullanıcı şifreleri bcrypt" '[ "$(sq "SELECT COUNT(*) FROM yp_users WHERE pass_hash NOT LIKE '\''\$2y\$%'\''")" = 0 ]'
ERRS=$(grep -E "PHP (Warning|Notice|Deprecated|Fatal|Parse)" "$SLOG")
chk "sunucu günlüğünde PHP uyarısı/hatası yok" '[ -z "$ERRS" ]'
[ -n "$ERRS" ] && echo "$ERRS" | head -5
ERRL=$(cat "$RUN"/storage/log/*.log 2>/dev/null | grep -E "\[hata\]")
chk "uygulama günlüğünde [hata] yok" '[ -z "$ERRL" ]'
[ -n "$ERRL" ] && echo "$ERRL" | head -5

echo
echo "SONUÇ (HTTP P0b): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
