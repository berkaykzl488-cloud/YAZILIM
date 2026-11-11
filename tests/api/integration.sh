#!/usr/bin/env bash
# Uçtan uca test: paketin bir KOPYASI üzerinde php -S ile çalışır (asıl api/data temiz kalır).
# Kullanım: bash tests/integration.sh            (libsodium)
#           CRYPTO=openssl bash tests/integration.sh   (libsodium kapalı → OpenSSL AES-256-GCM)
set -u
# Deponun api/ klasörünü geçici bir kopyada test eder (asıl api/data temiz kalır).
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$REPO"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-api-${CRYPTO:-sodium}-XXXXXX")"
PORT="${PORT:-$((20000 + RANDOM % 2000))}"
B="http://127.0.0.1:$PORT/api"
JAR="$RUN/cookies.txt"
SLOG="$RUN/server.log"

cp -a "$BUILD/api" "$RUN/api"
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"

PHPOPT=()
if [ "${CRYPTO:-sodium}" = "openssl" ]; then
  PHPOPT=(-d disable_functions=sodium_crypto_secretbox,sodium_crypto_secretbox_open)
fi
php "${PHPOPT[@]}" -d display_errors=0 -d log_errors=1 -S 127.0.0.1:$PORT -t "$RUN" >"$SLOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; rm -rf "$RUN"' EXIT
for i in $(seq 1 50); do curl -s -o /dev/null "$B/durum.php" && break; sleep 0.1; done

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      → $2"; }
chk()  { if eval "$2"; then ok "$1"; else bad "$1" "${BODY:-}"; fi; }

# req METHOD PATH [json] [extra curl args...]  → BODY, CODE
req() {
  local m="$1" p="$2" d="${3:-}"; shift 3 2>/dev/null || shift $#
  local out
  if [ -n "$d" ]; then
    out=$(curl -s -b "$JAR" -c "$JAR" -X "$m" -H 'Content-Type: application/json' --data "$d" -w '\n%{http_code}' "$@" "$B/$p")
  else
    out=$(curl -s -b "$JAR" -c "$JAR" -X "$m" -w '\n%{http_code}' "$@" "$B/$p")
  fi
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
j() { echo "$BODY" | jq -r "$1" 2>/dev/null; }

MID=123456; KEY=AbCdEf1234567890; SALT=SaLt0987654321zz; PW='Cok-Gizli-Sifre-2026'

echo "=== crypto: ${CRYPTO:-sodium} ==="
# 1) durum (kurulu değil)
req GET durum.php ""
chk "durum: kurulu değil" '[ "$CODE" = 200 ] && [ "$(j .installed)" = false ] && [ "$(j .ok)" = true ]'
chk "durum: crypto=${CRYPTO:-sodium}" '[ "$(j .crypto)" = "${CRYPTO:-sodium}" ]'

# 1b) kurulmadan giriş/ayar
req POST giris.php '{"password":"x"}'
chk "kurulmadan giris → 409 Türkçe" '[ "$CODE" = 409 ] && [ "$(j .code)" = not_installed ]'

# 2) kurulum: kısa şifre
req POST kurulum.php '{"password":"kisa","site_url":"https://yangpazar.com"}'
chk "kurulum: kısa şifre → 422" '[ "$CODE" = 422 ]'
# kurulum: başka origin
req POST kurulum.php "{\"password\":\"$PW\",\"site_url\":\"http://127.0.0.1:$PORT\"}" -H 'Origin: https://kotu-site.example'
chk "kurulum: yabancı Origin → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = origin ]'
req POST kurulum.php "{\"password\":\"$PW\",\"site_url\":\"http://127.0.0.1:$PORT\"}"
chk "kurulum: başarılı + csrf" '[ "$CODE" = 200 ] && [ "$(j .ok)" = true ] && [ ${#BODY} -gt 20 ] && [ "$(j .csrf | wc -c)" -gt 60 ]'
CSRF="$(j .csrf)"
chk "kurulum: YPAPI çerezi HttpOnly" 'grep -q "#HttpOnly_127.0.0.1.*YPAPI" "$JAR"'

# 3) durum (kurulu)
req GET durum.php ""
chk "durum: kurulu, oturum açık" '[ "$(j .installed)" = true ] && [ "$(j .logged_in)" = true ]'
chk "durum: bildirim URL" '[ "$(j .urls.paytr_bildirim)" = "http://127.0.0.1:$PORT/api/paytr_bildirim.php" ]'
chk "durum: cron URL maskeli" 'echo "$(j .urls.cron_hakedis_masked)" | grep -q "key=....••••"'
chk "durum: paytr configured=false" '[ "$(j .services.paytr.configured)" = false ]'

# 4) giriş: hatalı şifre + hız sınırı (yeni çerez kavanozu)
rm -f "$JAR"
req POST giris.php '{"password":"yanlis-sifre"}'
chk "giris: yanlış şifre → 401 Türkçe" '[ "$CODE" = 401 ] && [ "$(j .code)" = bad_password ] && echo "$BODY" | grep -q "Şifre hatalı"'
for i in 2 3 4 5; do req POST giris.php '{"password":"yanlis-sifre"}'; done
chk "giris: 5. hatalı deneme → 401" '[ "$CODE" = 401 ]'
req POST giris.php "{\"password\":\"$PW\"}"
chk "giris: 6. deneme (doğru şifre bile) → 429" '[ "$CODE" = 429 ] && [ "$(j .code)" = rate_limit ]'
rm -f "$RUN"/api/data/rl/*.json   # 15 dakika geçmiş gibi
req POST giris.php "{\"password\":\"$PW\"}" -H "Origin: http://127.0.0.1:$PORT"
chk "giris: doğru şifre → 200 + csrf" '[ "$CODE" = 200 ] && [ "$(j .ok)" = true ]'
CSRF="$(j .csrf)"
req POST giris.php "{\"password\":\"$PW\"}" -H 'Origin: https://kotu-site.example'
chk "giris: yabancı Origin → 403" '[ "$CODE" = 403 ]'

# 5) ayarlar
OUT=$(curl -s -w '\n%{http_code}' "$B/ayarlar.php"); CODE="${OUT##*$'\n'}"; BODY="${OUT%$'\n'*}"
chk "ayarlar GET oturumsuz → 401" '[ "$CODE" = 401 ] && [ "$(j .code)" = auth ]'
OUT=$(curl -s -w '\n%{http_code}' -b "YPAPI=sahte$(date +%s)" "$B/ayarlar.php"); CODE="${OUT##*$'\n'}"; BODY="${OUT%$'\n'*}"
chk "ayarlar GET sahte oturum çerezi → 401" '[ "$CODE" = 401 ]'
P1="{\"service\":\"paytr\",\"values\":{\"merchant_id\":\"$MID\",\"merchant_key\":\"$KEY\",\"merchant_salt\":\"$SALT\",\"test_mode\":true,\"max_installment\":0,\"ok_url\":\"https://yangpazar.com/ok\",\"fail_url\":\"https://yangpazar.com/hata\"}}"
req POST ayarlar.php "$P1"
chk "ayarlar POST CSRF yok → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = csrf ]'
req POST ayarlar.php "$P1" -H "X-CSRF-Token: yanlis"
chk "ayarlar POST CSRF yanlış → 403" '[ "$CODE" = 403 ]'
req POST ayarlar.php '{"service":"paytr","values":{"merchant_id":"12a","ok_url":"javascript:alert(1)"}}' -H "X-CSRF-Token: $CSRF"
chk "ayarlar POST geçersiz değer → 422 + alanlar" '[ "$CODE" = 422 ] && [ "$(j .fields.merchant_id)" != null ] && [ "$(j .fields.ok_url)" != null ]'
req POST ayarlar.php "$P1" -H "X-CSRF-Token: $CSRF"
chk "ayarlar POST paytr → 200 configured" '[ "$CODE" = 200 ] && [ "$(j .configured)" = true ]'
chk "ayarlar POST yanıtı maskeli" '! echo "$BODY" | grep -q -e "$KEY" -e "$SALT" && [ "$(j .masked.merchant_key)" = "••••••90" ]'
req GET ayarlar.php ""
chk "ayarlar GET maskeli" '[ "$(j .services.paytr.merchant_id)" = "12****" ] && [ "$(j .services.paytr.merchant_key)" = "••••••90" ] && [ "$(j .services.paytr.merchant_salt)" = "••••••zz" ]'
chk "ayarlar GET: tam sır yok" '! echo "$BODY" | grep -q -e "$KEY" -e "$SALT" -e "\"$MID\""'
chk "ayarlar GET: cron URL tam anahtarlı" 'echo "$(j .urls.cron_hakedis)" | grep -Eq "key=[0-9a-f]{48}$"'
CRON="$(j .urls.cron_hakedis)"; CRONKEY="${CRON##*key=}"
# Boş + maskeli gizli alanlar → eski değer korunur
req POST ayarlar.php '{"service":"paytr","values":{"merchant_id":"","merchant_key":"","merchant_salt":"••••••zz","test_mode":false,"max_installment":6}}' -H "X-CSRF-Token: $CSRF"
chk "ayarlar POST boş sırlar → 200" '[ "$CODE" = 200 ]'
req GET ayarlar.php ""
chk "boş sırlar eski değeri korudu (maske aynı)" '[ "$(j .services.paytr.merchant_key)" = "••••••90" ] && [ "$(j .services.paytr.merchant_id)" = "12****" ] && [ "$(j .services.paytr.test_mode)" = false ] && [ "$(j .services.paytr.max_installment)" = 6 ]'
# test modunu geri aç
req POST ayarlar.php '{"service":"paytr","values":{"test_mode":true}}' -H "X-CSRF-Token: $CSRF"

# 6) test.php
req POST test.php '{"service":"paytr"}'
chk "test.php CSRF yok → 403" '[ "$CODE" = 403 ]'
req POST test.php '{"service":"parasut"}' -H "X-CSRF-Token: $CSRF"
chk "test.php ayarsız servis → 422 Türkçe" '[ "$CODE" = 422 ] && [ "$(j .code)" = not_configured ]'
req POST test.php '{"service":"paytr"}' -H "X-CSRF-Token: $CSRF"
echo "      test.php paytr yanıtı: $BODY"
chk "test.php paytr → temiz JSON (ok:false, Türkçe msg, PHP uyarısı yok)" '[ "$CODE" = 200 ] && [ "$(j .ok)" = false ] && echo "$(j .msg)" | grep -q "PayTR" && ! echo "$BODY" | grep -qi -e "warning" -e "notice" -e "<b>"'
req GET durum.php ""
chk "durum: last_test kaydedildi" '[ "$(j .services.paytr.last_test.ok)" = false ] && [ "$(j .services.paytr.configured)" = true ] && [ "$(j .services.paytr.test_mode)" = true ]'

# 7) paytr_token.php (hash birim testte doğrulandı; burada uç nokta davranışı)
req POST paytr_token.php '{"tip":"kart","tutar":"abc","email":"yok"}'
chk "paytr_token: geçersiz girdi → 422 Türkçe" '[ "$CODE" = 422 ] && [ "$(j .fields.tutar)" != null ] && [ "$(j .fields.email)" != null ]'
req POST paytr_token.php '{"tip":"kart","tutar":"10,00","email":"musteri@ornek.com","ad":"Ali Veli","tel":"05551112233"}'
echo "      paytr_token yanıtı: $BODY"
chk "paytr_token: dış bağlantı yoksa temiz 502 Türkçe" '[ "$CODE" = 502 ] && [ "$(j .code)" = paytr_error ] && ! echo "$BODY" | grep -qi -e warning -e "$KEY"'
req POST paytr_token.php '{"tip":"kart","tutar":"10","email":"a@b.co","ad":"Ali","tel":"05551112233"}' -H 'Origin: https://kotu-site.example'
chk "paytr_token: yabancı Origin → 403" '[ "$CODE" = 403 ]'

# 8) paytr_bildirim.php
OID="YPCB$(date +%s)A1"; TOTAL=1000
H=$(printf '%s' "$OID$SALT""success""$TOTAL" | openssl dgst -sha256 -hmac "$KEY" -binary | base64)
cb() { local out; out=$(curl -s -w '\n%{http_code}' -X POST "$B/paytr_bildirim.php" \
        --data-urlencode "merchant_oid=$1" --data-urlencode "status=$2" --data-urlencode "total_amount=$3" \
        --data-urlencode "hash=$4" --data-urlencode "payment_amount=$3" --data-urlencode "test_mode=0" \
        --data-urlencode "currency=TL" --data-urlencode "payment_type=card"); CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"; }
cb "$OID" success "$TOTAL" "$H"
chk "bildirim: doğru hash → OK" '[ "$BODY" = OK ] && [ "$CODE" = 200 ]'
T1=$(jq -r ".odemeler[\"$OID\"].islem" "$RUN/api/data/odemeler.json")
sleep 1
cb "$OID" success "$TOTAL" "$H"
T2=$(jq -r ".odemeler[\"$OID\"].islem" "$RUN/api/data/odemeler.json")
R2=$(jq -r ".odemeler[\"$OID\"].tekrar_bildirim" "$RUN/api/data/odemeler.json")
chk "bildirim: tekrar → OK, yeniden işlenmedi" '[ "$BODY" = OK ] && [ "$T1" = "$T2" ] && [ "$R2" = 1 ] && [ "$(jq -r ".odemeler[\"$OID\"].durum" "$RUN/api/data/odemeler.json")" = basarili ]'
cb "${OID}X" success "$TOTAL" "$H"
chk "bildirim: yanlış hash → reddedildi" '[ "$BODY" = "PAYTR notification failed: bad hash" ] && [ "$(jq -r ".odemeler[\"${OID}X\"] // \"yok\"" "$RUN/api/data/odemeler.json")" = yok ]'
cb "$OID" success 999999 "$H"
chk "bildirim: tutar değiştirilmiş → reddedildi" '[ "$BODY" = "PAYTR notification failed: bad hash" ]'
OUT=$(curl -s "$B/paytr_bildirim.php"); chk "bildirim: GET → 405 metin" 'echo "$OUT" | grep -q "method not allowed"'
OID2="YPCB$(date +%s)F2"; H2=$(printf '%s' "$OID2$SALT""failed""$TOTAL" | openssl dgst -sha256 -hmac "$KEY" -binary | base64)
cb "$OID2" failed "$TOTAL" "$H2"
chk "bildirim: failed durumu → OK ve basarisiz kaydı" '[ "$BODY" = OK ] && [ "$(jq -r ".odemeler[\"$OID2\"].durum" "$RUN/api/data/odemeler.json")" = basarisiz ]'

# 9) paytr_hakedis.php
req GET paytr_hakedis.php ""
chk "hakedis: anahtarsız → 403" '[ "$CODE" = 403 ] && [ "$(j .code)" = bad_key ]'
req GET "paytr_hakedis.php?key=yanlisanahtar" ""
chk "hakedis: yanlış anahtar → 403" '[ "$CODE" = 403 ]'
req GET "paytr_hakedis.php?key=$CRONKEY" ""
echo "      hakedis yanıtı: $BODY"
chk "hakedis: doğru anahtar → 200 ok, 1 başarılı ödeme özetlendi" '[ "$CODE" = 200 ] && [ "$(j .ok)" = true ] && [ "$(j .basarili)" = 1 ] && [ "$(j .toplam_tl)" = 10 ]'

# 10) cekim_onayla.php
CK='{"id":"w_1001","ad":"Ayşe Yılmaz","tckn":"10000000146","iban":"TR33 0006 1005 1978 6457 8413 26","brut":"100.00","stopaj":"0","net":"100.00","aciklama":"Hesap satışı","belge_no":"","ettn":""}'
req POST cekim_onayla.php "$CK"
chk "cekim: CSRF yok → 403" '[ "$CODE" = 403 ]'
req POST cekim_onayla.php '{"id":"w_1","ad":"A","tckn":"123","iban":"TR00","brut":"10","stopaj":"0","net":"9"}' -H "X-CSRF-Token: $CSRF"
chk "cekim: geçersiz girdi → 422 (tckn, iban, net)" '[ "$CODE" = 422 ] && [ "$(j .fields.tckn)" != null ] && [ "$(j .fields.iban)" != null ]'
req POST cekim_onayla.php "$CK" -H "X-CSRF-Token: $CSRF"
chk "cekim: muhasebe yokken → ok + uyarı" '[ "$CODE" = 200 ] && [ "$(j .ok)" = true ] && [ "$(j .parasut)" = null ] && echo "$(j .belge_no)" | grep -Eq "^YGP[0-9]{13}$"'
req POST ayarlar.php '{"service":"bizimhesap","values":{"firm_id":"ABCD-1234-EFGH","api_key":"KEY-0000-1111-2222"}}' -H "X-CSRF-Token: $CSRF"
chk "ayarlar: bizimhesap kaydı" '[ "$CODE" = 200 ] && [ "$(j .masked.firm_id)" = "AB****" ] && [ "$(j .masked.api_key)" = "••••••22" ]'
req POST cekim_onayla.php "${CK/w_1001/w_1002}" -H "X-CSRF-Token: $CSRF"
echo "      cekim (bizimhesap) yanıtı: $BODY"
chk "cekim: bizimhesap dış hata → temiz Türkçe hata nesnesi" '[ "$CODE" = 200 ] && [ "$(j .bizimhesap.ok)" = false ] && echo "$(j .bizimhesap.msg)" | grep -q "Bizim Hesap"'
req POST ayarlar.php '{"service":"parasut","values":{"company_id":"112233","client_id":"cid_abcdef123456","client_secret":"csec_abcdef7890XYZ","username":"muhasebe@yangpazar.com","password":"ParasutSifre!9"}}' -H "X-CSRF-Token: $CSRF"
chk "ayarlar: parasut kaydı maskeli" '[ "$CODE" = 200 ] && [ "$(j .masked.password)" = "••••" ] && ! echo "$BODY" | grep -q -e "ParasutSifre" -e "csec_abcdef7890XYZ"'
req POST test.php '{"service":"parasut"}' -H "X-CSRF-Token: $CSRF"
echo "      test.php parasut yanıtı: $BODY"
chk "test.php parasut → temiz Türkçe hata" '[ "$CODE" = 200 ] && [ "$(j .ok)" = false ] && echo "$(j .msg)" | grep -q "Paraşüt"'
req POST test.php '{"service":"bizimhesap"}' -H "X-CSRF-Token: $CSRF"
chk "test.php bizimhesap → temiz Türkçe hata" '[ "$CODE" = 200 ] && [ "$(j .ok)" = false ] && echo "$(j .msg)" | grep -q "Bizim Hesap"'

# 11) kurulum tekrar → reddedilir
req POST kurulum.php "{\"password\":\"$PW-yeni\",\"site_url\":\"https://kotu.example\"}"
chk "kurulum tekrar → 409 reddedildi" '[ "$CODE" = 409 ] && [ "$(j .code)" = already_installed ]'

# 12) doğrudan erişim: data/ ve yardımcı dosyalar hiçbir şey basmaz
for f in data/ayarlar.php data/anahtar.php data/admin.php data/cekimler.php data/onbellek.php data/index.php _lib.php parasut_client.php bizimhesap_client.php; do
  OUT=$(curl -s "$B/$f"); chk "doğrudan GET $f → boş çıktı" '[ -z "$OUT" ]'
done

# 13) çıkış
req POST cikis.php "" -H "X-CSRF-Token: $CSRF"
chk "cikis → ok" '[ "$CODE" = 200 ] && [ "$(j .ok)" = true ]'
req GET ayarlar.php ""
chk "çıkıştan sonra ayarlar → 401" '[ "$CODE" = 401 ]'

# 14) data/ klasöründe düz metin sır yok
LEAK=$(grep -rl -e "$KEY" -e "$SALT" -e "$PW" -e "ParasutSifre" -e "csec_abcdef7890XYZ" -e "KEY-0000-1111-2222" -e "ABCD-1234-EFGH" -e "10000000146" -e "TR330006100519786457841326" "$RUN/api/data" 2>/dev/null)
chk "data/ içinde düz metin sır/kişisel veri yok" '[ -z "$LEAK" ]'
[ -n "$LEAK" ] && echo "      sızıntı: $LEAK"
chk "ayarlar.php biçimi <?php return '<base64>';" 'grep -Eq "^return '\''[A-Za-z0-9+/=]+'\'';$" "$RUN/api/data/ayarlar.php"'

# 15) PHP uyarısı / hata yok
ERRS=$(grep -E "PHP (Warning|Notice|Deprecated|Fatal|Parse)" "$SLOG")
chk "sunucu günlüğünde PHP uyarısı/hatası yok" '[ -z "$ERRS" ]'
[ -n "$ERRS" ] && echo "$ERRS" | head -5
ERRL=$(cat "$RUN"/api/data/log/*.log 2>/dev/null | grep -E "\[hata\]")
chk "uygulama günlüğünde [hata] kaydı yok" '[ -z "$ERRL" ]'
[ -n "$ERRL" ] && echo "$ERRL" | head -5

echo
echo "SONUÇ (${CRYPTO:-sodium}): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
