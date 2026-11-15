#!/usr/bin/env bash
# Uçtan uca test: eski api/ paketinin bir KOPYASI üzerinde php -S ile çalışır (asıl api/data temiz kalır).
# P3: eski kitin ayrı "API şifresi" ile açılan oturumu ve ayar/test/çekim/hakediş/token uçları KAPATILDI (Yönetim › Entegrasyonlar ve
# birleşik çalışan oturumu). Bu test artık kapatılmış uçların hiçbir şey yapmadan 404 (code: moved) döndüğünü, PayTR bildirim adresinin
# yerinde durduğunu (site uygulaması yoksa 503, GET 405), yardımcı dosyaların doğrudan açılınca boş çıktı verdiğini ve PHP uyarısı
# olmadığını doğrular. PayTR bildiriminin uygulamayla birlikte çalışması tests/http/p2.sh ve p3.sh'te.
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


# 1) durum: sır yok, oturum yok
req GET durum.php ""
chk "durum: ok, kurulu değil, crypto=${CRYPTO:-sodium}" '[ "$CODE" = 200 ] && [ "$(j .ok)" = true ] && [ "$(j .installed)" = false ] && [ "$(j .crypto)" = "${CRYPTO:-sodium}" ]'
chk "durum: eski servis/oturum alanları yok" '[ "$(j .services)" = null ] && [ "$(j .logged_in)" = null ] && [ "$(j .urls)" = null ]'

# 2) kapatılan uçlar: GET/POST → 404 moved, Türkçe yönlendirme, hiçbir kayıt yok
for f in ayarlar.php giris.php cikis.php kurulum.php test.php cekim_onayla.php paytr_hakedis.php paytr_token.php; do
  req POST "$f" '{"password":"Cok-Gizli-Sifre-2026","site_url":"https://ornek.com","service":"paytr","tutar":10,"email":"a@b.com"}'
  chk "POST $f → 404 moved, Türkçe" '[ "$CODE" = 404 ] && [ "$(j .code)" = moved ] && j .error | grep -q "Entegrasyonlar" && [ "$(j .moved_to)" != null ]'
  req GET "$f" ""
  chk "GET $f → 404 moved" '[ "$CODE" = 404 ] && [ "$(j .code)" = moved ]'
done
req POST giris.php '{"password":"x"}' -H "Origin: https://kotu.example"
chk "yabancı Origin ile de yalnız 404 (oturum açılmaz)" '[ "$CODE" = 404 ] && ! grep -q YPAPI "$JAR" 2>/dev/null'
chk "kapatılan uçlar data/ içine hiçbir şey yazmadı" '[ -z "$(ls "$RUN/api/data" | grep -v -e "^index.php$" -e "^\.htaccess$" -e "^log$" -e "^rl$")" ]'

# 3) PayTR bildirim adresi yerinde (site uygulaması bu kopyada yok → 503; GET → 405)
OUT=$(curl -s -w '\n%{http_code}' -X POST --data-urlencode "merchant_oid=YP1" --data-urlencode "status=success" --data-urlencode "total_amount=1000" --data-urlencode "hash=x" "$B/paytr_bildirim.php")
chk "bildirim: uygulama yokken 503 metin (PayTR yeniden dener)" '[ "${OUT##*$'"'"'\n'"'"'}" = 503 ] && echo "$OUT" | grep -q "not installed"'
OUT=$(curl -s "$B/paytr_bildirim.php"); chk "bildirim: GET → 405 metin" 'echo "$OUT" | grep -q "method not allowed"'

# 4) doğrudan erişim: data/ ve yardımcı dosyalar hiçbir şey basmaz
for f in data/index.php _lib.php parasut_client.php bizimhesap_client.php; do
  OUT=$(curl -s "$B/$f"); chk "doğrudan GET $f → boş çıktı" '[ -z "$OUT" ]'
done

# 5) PHP uyarısı / hata yok
ERRS=$(grep -E "PHP (Warning|Notice|Deprecated|Fatal|Parse)" "$SLOG")
chk "sunucu günlüğünde PHP uyarısı/hatası yok" '[ -z "$ERRS" ]'
[ -n "$ERRS" ] && echo "$ERRS" | head -5
ERRL=$(cat "$RUN"/api/data/log/*.log 2>/dev/null | grep -E "\[hata\]")
chk "uygulama günlüğünde [hata] kaydı yok" '[ -z "$ERRL" ]'
[ -n "$ERRL" ] && echo "$ERRL" | head -5

echo
echo "SONUÇ (${CRYPTO:-sodium}): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
