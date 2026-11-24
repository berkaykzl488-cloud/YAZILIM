#!/usr/bin/env bash
# P4 uçtan uca HTTP testleri: Yang Borsası (alım siparişi, satış emri, operatör konsolu, kapat/aç), EP mağazası, izinler, defter.
# Canlıdaki yükseltme senaryosu: P3 sürümü ($P3_REF) sihirbazla kurulur, üzerinde veri oluşur (bakiye, çekim talebi) →
# P4 kodu (çalışma ağacı) üzerine kopyalanır → ilk istek ex_* / ep_* tablolarını ve göç 0005'i ekler, veri korunur.
# Üç oturum: alıcı (B), satıcı (C, satış emri), operatör ([borsa]); ayrıca [borsa_ayar], [ep], [ilan] çalışanları ve yönetici.
# JS↔PHP paritesi: tests/http/p4-parity.php (asıl src/js/50-exchange.js işlevleri Node'da). Tüm istekler /api/v1/index.php?r=<yol>.
# Kullanım: bash tests/http/p4.sh      (gerekenler: php 8.1+ sqlite, curl, jq, git, node)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((26000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p4-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
P3_REF="${P3_REF:-1ef6794}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$P3_REF^{commit}" 2>/dev/null; then
  git -C "$REPO" archive "$P3_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: $P3_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
  cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$RUN/"
  cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"; cp "$REPO/uploads/.htaccess" "$REPO/uploads/index.php" "$RUN/uploads/"
fi
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"

YP_TEST=1 PHP_CLI_SERVER_WORKERS=6 php -d display_errors=0 -d log_errors=1 \
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
url() { local p="$1" q=""; case "$p" in *\?*) q="&${p#*\?}"; p="${p%%\?*}";; esac; echo "$B/api/v1/index.php?r=$p$q"; }
api() {
  local jar="$1" m="$2" p="$3" d="${4:-}"; shift 4 2>/dev/null || shift $#
  local out args=(-s -b "$jar" -c "$jar" -X "$m" -w '\n%{http_code}')
  [ -n "$d" ] && args+=(-H 'Content-Type: application/json' --data "$d")
  out=$(curl "${args[@]}" "$@" "$(url "$p")")
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
sq() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $p->exec("PRAGMA busy_timeout=8000"); $v=$p->query($argv[1])->fetchColumn(); echo $v===false?"":$v;' "$1"; }
PIDS=()
wjobs() { local p; for p in "${PIDS[@]}"; do wait "$p"; done; PIDS=(); }
ik() { echo "k$(date +%s%N)$RANDOM"; }
nowms() { echo $(( $(date +%s%N) / 1000000 )); }
cron_at() { YP_TEST=1 YP_TEST_NOW="$1" php "$RUN/app/cron.php" 2>&1; }
wal() { sq "SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=${1#u}"; }
acct() { sq "SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='$1'"; }
escrow_ok() { [ "$(acct ESCROW:EX)" = "$(sq "SELECT COALESCE(SUM(total-released),0) FROM yp_ex_orders")" ]; }
oidn() { echo $(( ${1#B} - 1000 )); }

J_K="$RUN/k.jar"; J_ADM="$RUN/adm.jar"; J_B="$RUN/b.jar"; J_C="$RUN/c.jar"; J_D="$RUN/d.jar"; J_E="$RUN/e.jar"; J_X="$RUN/x.jar"
J_OP="$RUN/op.jar"; J_AY="$RUN/ay.jar"; J_EP="$RUN/ep.jar"; J_IL="$RUN/il.jar"
PW='Hesap-Sifresi-Gizli-77'

echo "=== 1. Kurulum: P3 ($P3_REF), üzerinde veri ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang P4" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
reg() { local jar="$1" name="$2" mail="$3" tel="$4"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\"}" -H "X-CSRF-Token: $cs"; }
reg "$J_B" Alici_B b@ornek.com "0555 111 22 02"; UB="$(j .data.me.id)"
reg "$J_C" Satici_C c@ornek.com "0555 111 22 03"; UC="$(j .data.me.id)"
reg "$J_D" Satici_D d@ornek.com "0555 111 22 04"; UD="$(j .data.me.id)"
reg "$J_E" Uye_E e@ornek.com "0555 111 22 05"; UE="$(j .data.me.id)"
chk "B, C, D, E kayıtlı" '[ -n "$UB" ] && [ "$UB" != null ] && [ -n "$UE" ] && [ "$UE" != null ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
chk "yönetici girişi" '[ "$(j .data.me.admin)" = true ]'
api "$J_ADM" POST admin/balance "{\"user\":\"Alici_B\",\"amount\":1000,\"w\":true,\"note\":\"Havale (test)\"}" -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/balance "{\"user\":\"Alici_B\",\"amount\":300,\"w\":false,\"note\":\"Kart yüklemesi (test)\"}" -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/balance "{\"user\":\"Uye_E\",\"amount\":500,\"w\":true,\"note\":\"Havale (test)\"}" -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/balance "{\"user\":\"Satici_D\",\"amount\":200,\"w\":false,\"note\":\"Kart (test)\"}" -H "X-CSRF-Token: $CS_ADM"
chk "P3 verisi: B 1000 çekilebilir + 300 alışveriş, E 500, D 200 alışveriş" '[ "$(wal $UB)" = "100000/30000" ] && [ "$(wal $UE)" = "50000/0" ] && [ "$(wal $UD)" = "0/20000" ]'
N_J0=$(sq "SELECT COUNT(*) FROM yp_journal"); N_U0=$(sq "SELECT COUNT(*) FROM yp_users"); N_A0=$(sq "SELECT COUNT(*) FROM yp_audit_log")

echo "=== 2. P4 paketi üzerine kopyalanır (ilk istek: tablolar + göç 0005, veri korunur) ==="
if [ "$UPGRADE" = 1 ]; then
  chk "P3'te borsa tablosu yok" '[ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_ex_orders'\''")" ]'
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 2
fi
api "$J_X" GET boot ""
tb() { [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='yp_$1'")" ]; }
chk "ilk istek: ex_markets, ex_fields, ex_orders, ex_order_fields, ex_offers, ex_offer_fields, ex_fills, ex_events, ep_products, ep_codes, ep_orders" '[ "$CODE" = 200 ] && tb ex_markets && tb ex_fields && tb ex_orders && tb ex_order_fields && tb ex_offers && tb ex_offer_fields && tb ex_fills && tb ex_events && tb ep_products && tb ep_codes && tb ep_orders'
chk "veri korundu: üyeler, defter, cüzdanlar" '[ "$(sq "SELECT COUNT(*) FROM yp_users")" = "$N_U0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal")" = "$N_J0" ] && [ "$(wal $UB)" = "100000/30000" ] && [ "$(wal $UD)" = "0/20000" ]'
VER=$(sed -n "s/.*YP_APP_VERSION', '\([^']*\)'.*/\1/p" "$REPO/app/bootstrap.php")
chk "göç 0005 kayıtlı, sürüm $VER (çalışma ağacı), güncelleme audit'e yazıldı" '[ -n "$(sq "SELECT version FROM yp_schema_migrations WHERE version='\''m:0005_exchange_seed'\''")" ] && [ -n "$VER" ] && grep -q "'\''$VER'\''" "$RUN/app/bootstrap.php" && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''schema_update'\''")" -ge 1 ]'
chk "varsayılan bilgi alanları: alım 1, satış 6 (2 gizli)" '[ "$(sq "SELECT COUNT(*) FROM yp_ex_fields WHERE fset='\''buy'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_fields WHERE fset='\''sell'\''")" = 6 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_fields WHERE secret=1")" = 2 ]'
chk "boot: borsa ayarları (exOn, exPlace), alanlar, Happy Hour, boş pazar listesi" '[ "$(j .data.set.exOn)" = true ] && [ -n "$(j .data.set.exPlace)" ] && [ "$(j ".data.exFields | length")" = 6 ] && [ "$(j .data.exFieldsBuy[0].id)" = b1 ] && [ "$(j .data.set.hh.on)" = false ] && [ "$(j ".data.exchange | length")" = 0 ]'
api "$J_B" GET boot ""; CS_B="$(j .data.csrf)"
chk "yükseltmeden sonra üye oturumu sürüyor" '[ "$(j .data.me.id)" = "$UB" ]'
CS_C=$(csrf_of "$J_C"); CS_D=$(csrf_of "$J_D"); CS_E=$(csrf_of "$J_E"); CS_ADM=$(csrf_of "$J_ADM")

echo "=== 3. Çalışanlar: [borsa] operatör, [borsa_ayar], [ep], [ilan] ==="
mk_staff() { api "$J_ADM" POST admin/staff "{\"name\":\"$1\",\"email\":\"$2\",\"ad\":\"$3\",\"soyad\":\"Ci\",\"password\":\"Calisan-Sifre-9\",\"perms\":[\"$4\"]}" -H "X-CSRF-Token: $CS_ADM"; }
mk_staff Operator op@yangpazar.com Oper borsa; mk_staff BorsaAyar ay@yangpazar.com Ayar borsa_ayar; mk_staff EpCalisan ep@yangpazar.com Epci ep; mk_staff IlanCalisan il@yangpazar.com Ilan ilan
login() { local jar="$1" n="$2" cs; cs=$(csrf_of "$jar"); api "$jar" POST auth/login "{\"login\":\"$n\",\"password\":\"Calisan-Sifre-9\"}" -H "X-CSRF-Token: $cs"; j .data.csrf; }
CS_OP=$(login "$J_OP" Operator); UOP="u$(sq "SELECT id FROM yp_users WHERE name='Operator'")"; CS_AY=$(login "$J_AY" BorsaAyar); CS_EP=$(login "$J_EP" EpCalisan); CS_IL=$(login "$J_IL" IlanCalisan)
chk "4 çalışan girişi" '[ -n "$CS_OP" ] && [ "$CS_OP" != null ] && [ -n "$CS_IL" ] && [ "$CS_IL" != null ]'

echo "=== 4. İzinler: 403'ler ==="
P403=0; PN=0
t403() { local jar="$1" m="$2" p="$3" cs="$4"; api "$jar" "$m" "$p" '{}' -H "X-CSRF-Token: $cs"; PN=$((PN+1)); if [ "$CODE" = 403 ]; then P403=$((P403+1)); else echo "      ($m $p → $CODE)"; fi; }
for x in "GET admin/ex/orders" "GET admin/ex/orders/B1001" "GET admin/ex/offers" "POST admin/ex/orders/B1001/claim" "POST admin/ex/orders/B1001/deliver" "POST admin/ex/power" "PUT admin/ex/switch" "PUT admin/ex/offmsg" \
         "GET admin/ex/settings" "PUT admin/ex/markets" "POST admin/ex/markets" "DELETE admin/ex/markets/x1" "PUT admin/ex/fields/sell" "POST admin/ex/fields/buy" "DELETE admin/ex/fields/sell/f1" "POST admin/ex/fields/sell/f2/up" "PUT admin/ex/notify" \
         "GET admin/ep/products" "POST admin/ep/products" "PUT admin/ep/products/ep1" "POST admin/ep/products/ep1/toggle" "DELETE admin/ep/products/ep1" "DELETE admin/ep/codes/c1" "PUT admin/settings/hh" "GET admin/ep/log" "GET admin/ep/orders/EP1/code"; do
  set -- $x; t403 "$J_E" "$1" "$2" "$CS_E"; t403 "$J_IL" "$1" "$2" "$CS_IL"
done
chk "üye ve [ilan] çalışanı: borsa/EP yönetim uçlarının hepsi 403 ($P403/$PN)" '[ "$P403" = "$PN" ]'
P403=0; PN=0
for x in "PUT admin/ex/markets" "POST admin/ex/markets" "DELETE admin/ex/markets/x1" "PUT admin/ex/fields/sell" "POST admin/ex/fields/buy" "DELETE admin/ex/fields/sell/f1" "PUT admin/ex/notify" "POST admin/ep/products" "PUT admin/settings/hh" "GET admin/ep/log"; do
  set -- $x; t403 "$J_OP" "$1" "$2" "$CS_OP"; done
for x in "GET admin/ex/orders" "POST admin/ex/orders/B1001/claim" "POST admin/ex/power" "GET admin/ep/products" "POST admin/ep/products"; do set -- $x; t403 "$J_AY" "$1" "$2" "$CS_AY"; done
for x in "GET admin/ex/orders" "POST admin/ex/power" "PUT admin/ex/markets"; do set -- $x; t403 "$J_EP" "$1" "$2" "$CS_EP"; done
chk "[borsa] ayar/EP yapamaz, [borsa_ayar] operatörlük/EP yapamaz, [ep] borsa yapamaz ($P403/$PN)" '[ "$P403" = "$PN" ]'
api "$J_X" POST exchange/orders '{}' -H "X-CSRF-Token: x"
chk "girişsiz alım siparişi → 401/403" '[ "$CODE" = 401 ] || [ "$CODE" = 403 ]'

echo "=== 5. [borsa_ayar]: pazarlar, kurlar, alanlar, bildirimler ==="
SV1=$(sq "SELECT 'sv'||id FROM yp_servers WHERE sec='pvp' ORDER BY id LIMIT 1"); SV2=$(sq "SELECT 'sv'||id FROM yp_servers WHERE sec='pvp' ORDER BY id LIMIT 1 OFFSET 1"); SVT=$(sq "SELECT 'sv'||id FROM yp_servers WHERE sec='tr' ORDER BY id LIMIT 1")
api "$J_AY" POST admin/ex/markets "{\"server\":\"$SV1\"}" -H "X-CSRF-Token: $CS_AY"
X1="$(j ".data.markets[0].id")"
chk "server borsaya eklendi (kapalı, fiyatsız)" '[ "$CODE" = 200 ] && [ "$(j .data.markets[0].on)" = false ] && [ "$(j .data.markets[0].buy)" = null ] && [ "$(j .data.markets[0].server)" = "$SV1" ]'
api "$J_AY" POST admin/ex/markets "{\"server\":\"$SV1\"}" -H "X-CSRF-Token: $CS_AY"
chk "aynı server iki kez → 422" '[ "$CODE" = 422 ]'
api "$J_AY" POST admin/ex/markets "{\"server\":\"$SV2\"}" -H "X-CSRF-Token: $CS_AY"; X2="$(j ".data.markets[1].id")"
api "$J_AY" POST admin/ex/markets "{\"server\":\"$SVT\"}" -H "X-CSRF-Token: $CS_AY"; X3="$(j ".data.markets[2].id")"
api "$J_AY" PUT admin/ex/markets "{\"place\":\"CH1 · Kırmızı bayrak\",\"markets\":[{\"id\":\"$X1\",\"on\":true,\"unit\":\"100M\",\"buy\":12.5,\"max\":10},{\"id\":\"$X2\",\"on\":true,\"buy\":\"\",\"max\":8},{\"id\":\"$X3\",\"on\":true,\"buy\":3,\"max\":2.5,\"margin\":0}]}" -H "X-CSRF-Token: $CS_AY"
chk "kurlar kaydedildi: fiyatsız satır açılamaz, teslimat yeri" '[ "$CODE" = 200 ] && [ "$(j ".data.markets[0].on")" = true ] && [ "$(j ".data.markets[0].buy")" = 12.5 ] && [ "$(j ".data.markets[1].on")" = false ] && [ "$(j .data.place)" = "CH1 · Kırmızı bayrak" ] && [ "$(j ".data.markets[2].margin")" = 0 ]'
api "$J_AY" PUT admin/ex/markets "{\"markets\":[{\"id\":\"$X2\",\"server\":\"$SV1\"}]}" -H "X-CSRF-Token: $CS_AY"
chk "iki satırda aynı server → 422" '[ "$CODE" = 422 ]'
api "$J_AY" POST admin/ex/fields/buy '{}' -H "X-CSRF-Token: $CS_AY"
chk "alım alanı eklendi (b2)" '[ "$(j ".data.exFieldsBuy | length")" = 2 ] && [ "$(j .data.exFieldsBuy[1].id)" = b2 ]'
api "$J_AY" PUT admin/ex/fields/buy '{"fields":[{"id":"b1","label":"Karakter adı","type":"text","req":true,"secret":false},{"id":"b2","label":"Kanal","type":"select","opts":"CH1,CH2","req":false,"secret":false}]}' -H "X-CSRF-Token: $CS_AY"
chk "alanlar kaydedildi (seçenek türü)" '[ "$CODE" = 200 ] && [ "$(j .data.exFieldsBuy[1].type)" = select ] && [ "$(j .data.exFieldsBuy[0].label)" = "Karakter adı" ]'
api "$J_AY" POST admin/ex/fields/buy/b2/up '{}' -H "X-CSRF-Token: $CS_AY"
chk "sıra: b2 yukarı" '[ "$(j .data.exFieldsBuy[0].id)" = b2 ]'
api "$J_AY" DELETE admin/ex/fields/buy/b2 '' -H "X-CSRF-Token: $CS_AY"
chk "alan silindi" '[ "$(j ".data.exFieldsBuy | length")" = 1 ] && [ "$(j .data.exFieldsBuy[0].id)" = b1 ]'
api "$J_AY" PUT admin/ex/fields/sell '{"fields":[],"rules":"Kural bir\nKural iki"}' -H "X-CSRF-Token: $CS_AY"
chk "satış kuralları kaydedildi" '[ "$(j .data.exRules)" = "Kural bir
Kural iki" ]'
api "$J_AY" PUT admin/ex/notify '{"mail":{"borsa":false},"sms":{"call":true,"borsa":true}}' -H "X-CSRF-Token: $CS_AY"
chk "bildirim anahtarları: e-posta borsa kapalı, SMS çağrı + borsa açık, EP kodu e-postası açık (göç varsayılanı)" '[ "$CODE" = 200 ] && [ "$(j .data.notify.mail.borsa)" = false ] && [ "$(j .data.notify.sms.call)" = true ] && [ "$(j .data.notify.mail.ep_code)" = true ]'
api "$J_X" GET exchange ""
chk "herkese açık: yalnız açık pazarlar (2)" '[ "$(j ".data.markets | length")" = 2 ]'

echo "=== 6. Satıcı C (2. oturum): satış emirleri — gizli alanlar şifreli, satıcı kimliği maskeli ==="
OFF() { api "$1" POST exchange/offers "{\"market\":\"$2\",\"qty\":$3,\"price\":$4,\"ok\":true,\"f\":{\"f1\":\"hesap_$5\",\"f2\":\"$PW-$5\",\"f3\":\"Karakter$5\",\"f6\":\"Hemen\"}}" -H "X-CSRF-Token: $6"; }
OFF "$J_C" "$X1" 30 10 c1 "$CS_C"; E1="$(j .data.offer.id)"
chk "C emri yayında (#$E1, 1. sıra)" '[ "$CODE" = 200 ] && [ "$(j .data.rank)" = 1 ] && [ "$(j .data.offer.left)" = 30 ] && [ "$(j .data.offer.f.f2)" = "••••••" ] && [ "$(j .data.offer.f.f1)" = hesap_c1 ]'
OFF "$J_D" "$X1" 20 9.5 d1 "$CS_D"; E2="$(j .data.offer.id)"
OFF "$J_C" "$X1" 50 10 c2 "$CS_C"; E3="$(j .data.offer.id)"
chk "D daha ucuz → 1. sıra" '[ "$(j .data.rank)" = 3 ] && [ -n "$E2" ]'
api "$J_C" POST exchange/offers "{\"market\":\"$X1\",\"qty\":5,\"price\":10.01,\"ok\":true,\"f\":{\"f1\":\"a\",\"f2\":\"b\",\"f3\":\"c\",\"f6\":\"Hemen\"}}" -H "X-CSRF-Token: $CS_C"
chk "tavan fiyat (10 TL) aşımı → 422" '[ "$CODE" = 422 ] && j .fields.ex_price | grep -q "en fazla"'
api "$J_C" POST exchange/offers "{\"market\":\"$X1\",\"qty\":5,\"price\":9,\"ok\":true,\"f\":{\"f1\":\"a\",\"f3\":\"c\",\"f6\":\"Hemen\"}}" -H "X-CSRF-Token: $CS_C"
chk "zorunlu gizli alan (şifre) boş → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.exf_f2)" != null ]'
api "$J_C" POST exchange/offers "{\"market\":\"$X1\",\"qty\":5,\"price\":9,\"ok\":true,\"f\":{\"f1\":\"a\",\"f2\":\"b\",\"f3\":\"c\",\"f6\":\"Yarın akşam\"}}" -H "X-CSRF-Token: $CS_C"
chk "seçenek dışı değer → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.exf_f6)" != null ]'
chk "veritabanı: şifre düz metin değil (value boş, value_enc dolu, düz metin yok)" '[ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE fkey='\''f2'\'' AND value='\'''\'' AND value_enc IS NOT NULL")" = 3 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE value LIKE '\''%$PW%'\'' OR value_enc LIKE '\''%$PW%'\''")" = 0 ]'
api "$J_X" GET exchange ""
chk "ziyaretçi: defter maskeli (u=xs…, alan yok, ad 2 harf), şifre/hesap adı yanıtta yok" '[ "$(j ".data.book | length")" = 3 ] && [ "$(j ".data.book | map(.u|startswith(\"xs\")) | all")" = true ] && [ "$(j ".data.book[0].f | length")" = 0 ] && [ "$(j ".data.users[0].name | length")" = 2 ] && ! echo "$BODY" | grep -q "$PW" && ! echo "$BODY" | grep -q "hesap_c" && ! echo "$BODY" | grep -q "$UC"'
api "$J_C" GET exchange ""
chk "C kendi emirlerini görür (gizli maskeli), diğer satıcı maskeli" '[ "$(j ".data.mine.offers | length")" = 2 ] && [ "$(j ".data.book | map(select(.u==\"$UC\")) | length")" = 2 ] && [ "$(j ".data.book | map(select(.u|startswith(\"xs\"))) | length")" = 1 ] && ! echo "$BODY" | grep -q "$PW"'

echo "=== 7. Alıcı B (1. oturum): alım siparişi — Idempotency, önce kredi, ESCROW:EX ==="
api "$J_X" GET "exchange/quote?m=$X1&qty=60" ""
chk "sunucu exQuote: 60 × 12,5 = 750, stok 100, eksik 0" '[ "$(j .data.total)" = 750 ] && [ "$(j .data.stock)" = 100 ] && [ "$(j .data.miss)" = 0 ] && [ "$(j .data.ok)" = true ]'
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":40,\"f\":{\"b1\":\"KarakterB\"}}" -H "X-CSRF-Token: $CS_B"
chk "Idempotency-Key olmadan → 400" '[ "$CODE" = 400 ] && [ "$(j .code)" = idem_key ]'
KEY=$(ik)
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":40,\"f\":{\"b1\":\"KarakterB\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
O1="$(j .data.order.id)"
chk "sipariş #$O1: 40 × 12,5 = 500; önce kredi 300 + nakit 200 (çekilebilir bakiye korunur)" '[ "$CODE" = 200 ] && [ "$(j .data.order.total)" = 500 ] && [ "$(j .data.order.paid.nw)" = 300 ] && [ "$(j .data.order.paid.w)" = 200 ] && [ "$(wal $UB)" = "80000/0" ] && [ "$(j .data.order.status)" = bekliyor ]'
chk "ESCROW:EX = 500, kayıt satin_alma, patch me" '[ "$(acct ESCROW:EX)" = 50000 ] && [ "$(sq "SELECT kind FROM yp_journal WHERE ref_type='\''exorder'\'' ORDER BY id DESC LIMIT 1")" = satin_alma ] && [ "$(j .patch.me.bal)" = 800 ] && escrow_ok'
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":40,\"f\":{\"b1\":\"KarakterB\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
chk "aynı anahtar → aynı sipariş, ikinci ödeme yok" '[ "$(j .data.order.id)" = "$O1" ] && [ "$(j .replayed)" = true ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_orders")" = 1 ] && [ "$(wal $UB)" = "80000/0" ]'
api "$J_X" GET exchange ""
chk "borsa kartı: stok 100, net stok (satışta − eşlenmemiş açık sipariş) 60; sıra başı 9,5 kitapta" '[ "$(j ".data.stock[\"$X1\"]")" = 100 ] && [ "$(j ".data.net[\"$X1\"]")" = 60 ] && [ "$(j ".data.book | map(select(.ex==\"$X1\")) | min_by(.price) | .price")" = 9.5 ]'
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":4000,\"f\":{\"b1\":\"KarakterB\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "bakiye yetersiz → 409 insufficient" '[ "$CODE" = 409 ] && [ "$(j .code)" = insufficient ]'
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":1,\"f\":{}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "karakter adı boş → 422 (exb_b1)" '[ "$CODE" = 422 ] && [ "$(j .fields.exb_b1)" != null ]'
api "$J_B" POST exchange/orders "{\"market\":\"$X2\",\"qty\":1,\"f\":{\"b1\":\"x\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "kapalı pazar → 409" '[ "$CODE" = 409 ]'
api "$J_E" GET "admin/ex/orders/$O1" ""
chk "başka üye siparişi göremez (403)" '[ "$CODE" = 403 ]'
api "$J_E" PUT "exchange/orders/$O1/fields" '{"f":{"b1":"Hack"}}' -H "X-CSRF-Token: $CS_E"
chk "başka üye bilgileri değiştiremez (403)" '[ "$CODE" = 403 ]'

echo "=== 8. Operatör (3. oturum): üstlen, eşle, gizli bilgi (audit), kısmi teslim, çağır, hazırım ==="
api "$J_OP" GET "admin/ex/orders?f=bekliyor" ""
chk "operatör listesi: 1 açık sipariş, alıcı ad soyad + telefon" '[ "$(j ".data.orders | length")" = 1 ] && [ "$(j .data.orders[0].id)" = "$O1" ] && [ "$(j ".data.users[] | select(.id==\"$UB\") | .tel")" = "0555 111 22 02" ] && [ "$(j .data.escrow)" = 500 ]'
api "$J_OP" POST "admin/ex/orders/$O1/claim" '{}' -H "X-CSRF-Token: $CS_OP"
chk "üstlenildi → islemde, staff=operatör" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = islemde ] && [ "$(j .data.order.staff)" = "$UOP" ]'
api "$J_ADM" POST "admin/ex/orders/$O1/claim" '{}' -H "X-CSRF-Token: $CS_ADM"
chk "başka çalışan üstlenemez → 409" '[ "$CODE" = 409 ]'
api "$J_OP" POST "admin/ex/orders/$O1/pair" "{\"offer\":\"$E1\",\"qty\":25}" -H "X-CSRF-Token: $CS_OP"
chk "C emri #$E1 ile 25 eşlendi (alıcı fiyatı 12,5, satıcı 10)" '[ "$CODE" = 200 ] && [ "$(j .data.order.fills[0].qty)" = 25 ] && [ "$(j .data.order.fills[0].sell)" = 12.5 ] && [ "$(j .data.order.fills[0].price)" = 10 ] && [ "$(sq "SELECT left_qty FROM yp_ex_offers WHERE id=${E1#E}")" = 5 ]'
api "$J_OP" POST "admin/ex/orders/$O1/pair" "{\"offer\":\"$E1\",\"qty\":30}" -H "X-CSRF-Token: $CS_OP"
chk "kalandan fazla eşleme → 422" '[ "$CODE" = 422 ]'
api "$J_OP" GET "admin/ex/orders/$O1" ""
chk "ayrıntı: şifre maskeli (açılmadan)" '[ "$(j ".data.offers[] | select(.id==\"$E1\") | .f.f2")" = "••••••" ] && ! echo "$BODY" | grep -q "$PW"'
NA=$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='ex_reveal'")
api "$J_OP" GET "admin/ex/orders/$O1?reveal=1" ""
chk "[borsa] şifreyi açar, her gösterim audit'e yazılır" '[ "$CODE" = 200 ] && [ "$(j ".data.offers[] | select(.id==\"$E1\") | .f.f2")" = "$PW-c1" ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''ex_reveal'\''")" = $((NA+1)) ] && [ "$(sq "SELECT actor_id FROM yp_audit_log WHERE action='\''ex_reveal'\'' ORDER BY id DESC LIMIT 1")" = "${UOP#u}" ]'
chk "audit kaydında şifre yok" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE data LIKE '\''%$PW%'\''")" = 0 ]'
api "$J_AY" GET "admin/ex/orders/$O1?reveal=1" ""
chk "[borsa_ayar] açamaz → 403" '[ "$CODE" = 403 ]'
api "$J_OP" POST "admin/ex/orders/$O1/deliver" '{"qty":30}' -H "X-CSRF-Token: $CS_OP"
chk "eşlenenden fazla teslim → 422" '[ "$CODE" = 422 ]'
CW0=$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UC#u}"); CW0=${CW0:-0}
api "$J_OP" POST "admin/ex/orders/$O1/deliver" '{"qty":10}' -H "X-CSRF-Token: $CS_OP"
chk "kısmi teslim 10/40: C'ye 10×10 = 100 nakit, REV:borsa 25, havuz 375" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = kismen ] && [ "$(j .data.order.delivered)" = 10 ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UC#u}")" = $((CW0+10000)) ] && [ "$(acct REV:borsa)" = 2500 ] && [ "$(acct ESCROW:EX)" = 37500 ] && escrow_ok'
api "$J_OP" POST "admin/ex/orders/$O1/deliver" '{"qty":5}' -H "X-CSRF-Token: $CS_OP"
chk "teslim azaltılamaz → 422" '[ "$CODE" = 422 ]'
api "$J_OP" POST "admin/ex/orders/$O1/call" '{"msg":""}' -H "X-CSRF-Token: $CS_OP"
chk "çağrı: varsayılan mesaj karakter adıyla, üyeye bildirim" '[ "$CODE" = 200 ] && [ "$(j .data.order.called)" -gt 0 ] && j .data.order.callMsg | grep -q KarakterB && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB#u} AND x LIKE '\''%KarakterB%'\''")" -ge 1 ]'
api "$J_B" POST "exchange/orders/$O1/ready" '{}' -H "X-CSRF-Token: $CS_B"
chk "alıcı: Geldim, hazırım → operatöre bildirim" '[ "$CODE" = 200 ] && [ "$(j .data.order.ready)" -gt 0 ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UOP#u} AND x LIKE '\''%alıcı hazır%'\''")" = 1 ]'
api "$J_B" GET poll ""
SIG1="$(j .data.exSig)"
chk "yoklama: üyeye borsa imzası" '[ -n "$SIG1" ] && [ "$SIG1" != null ]'
api "$J_OP" GET poll ""
chk "yoklama: [borsa] için açık sipariş sayısı" '[ "$(j .data.exStaff.open)" = 1 ]'
api "$J_OP" GET admin/today ""
chk "Bugün: borsa kuyruğu 1" '[ "$(j .data.queues.borsa)" = 1 ]'

echo "=== 9. Eşleme sil, otomatik eşleşme (pay %12), tamamla: fiyat farkı iadesi, gizli bilgiler silinir ==="
api "$J_OP" POST "admin/ex/orders/$O1/unpair" "{\"offer\":\"$E1\"}" -H "X-CSRF-Token: $CS_OP"
chk "eşleme sil: teslim edilmeyen 15 adet C emrine döner" '[ "$CODE" = 200 ] && [ "$(sq "SELECT left_qty FROM yp_ex_offers WHERE id=${E1#E}")" = 20 ] && [ "$(j .data.order.fills[0].qty)" = 10 ]'
api "$J_OP" POST "admin/ex/orders/$O1/match" '{}' -H "X-CSRF-Token: $CS_OP"
chk "otomatik eşleşme: eksik 30 adet en ucuzdan (D 20 × 9,5 → 10,64; C 10 × 10 aynı fiyatlı eşlemeyle birleşir, JS gibi)" '[ "$CODE" = 200 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_fills WHERE order_id=$(oidn $O1)")" = 2 ] && [ "$(sq "SELECT qty FROM yp_ex_fills WHERE order_id=$(oidn $O1) AND offer_id=${E1#E}")" = 20 ] && [ "$(sq "SELECT sell FROM yp_ex_fills WHERE order_id=$(oidn $O1) AND offer_id=${E2#E}")" = 1064 ] && [ "$(sq "SELECT status FROM yp_ex_offers WHERE id=${E2#E}")" = satildi ]'
DW0=$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UD#u}"); DW0=${DW0:-0}; BW0=$(wal $UB)
api "$J_OP" POST "admin/ex/orders/$O1/done" '{}' -H "X-CSRF-Token: $CS_OP"
# kalan teslim: D 20×9,5=190 (val 212,8), C 10×10 (merge: C emri aynı fiyatla mevcut eşleme 10 → 20, sell 12,5) → val 125
chk "tamamlandı: D'ye 190 nakit, fiyat farkı iadesi alıcının KREDİ kovasına (önce kredi)" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = tamam ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UD#u}")" = $((DW0+19000)) ] && [ "$(j .data.order.delivered)" = 40 ]'
TOT=$(sq "SELECT total FROM yp_ex_orders WHERE id=$(oidn $O1)"); BACK=$((50000 - TOT))
chk "fiyat farkı: $BACK kuruş iade, toplam = eşlemelerin alıcı değeri, havuz 0" '[ "$BACK" -gt 0 ] && [ "$(wal $UB)" = "80000/$BACK" ] && [ "$(acct ESCROW:EX)" = 0 ] && escrow_ok && [ "$(sq "SELECT released FROM yp_ex_orders WHERE id=$(oidn $O1)")" = "$TOT" ]'
chk "gizli bilgiler: biten D emri NULL; aktif C emirleri durur; sipariş alanları NULL" '[ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE offer_id=${E2#E} AND value_enc IS NOT NULL")" = 0 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE offer_id=${E1#E} AND value_enc IS NOT NULL")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_order_fields WHERE order_id=$(oidn $O1) AND value_enc IS NOT NULL")" = 0 ]'
api "$J_OP" GET "admin/ex/orders/$O1?reveal=1" ""
chk "bittikten sonra açma: D şifresi boş (silindi)" '[ "$(j ".data.offers[] | select(.id==\"$E2\") | .f.f2")" = "" ]'
chk "alıcı hacmi ve puanı teslim değeri kadar arttı" '[ "$(sq "SELECT vol FROM yp_users WHERE id=${UB#u}")" = "$TOT" ] && [ "$(sq "SELECT pts FROM yp_users WHERE id=${UB#u}")" -gt 0 ]'
api "$J_OP" POST "admin/ex/orders/$O1/cancel" '{}' -H "X-CSRF-Token: $CS_OP"
chk "kapanmış sipariş iptal edilemez → 409" '[ "$CODE" = 409 ]'
api "$J_B" GET me/exchange ""
chk "alıcı: Borsa işlemlerim — tamamlandı, işlem geçmişi, eşlemelerde satıcı/fiyat yok" '[ "$(j .data.orders[0].status)" = tamam ] && [ "$(j ".data.orders[0].log | length")" -ge 6 ] && [ "$(j .data.orders[0].fills[0].u)" = null ] && [ "$(j .data.orders[0].fills[0].price)" = null ]'
api "$J_B" GET poll ""
chk "yoklama imzası değişti" '[ "$(j .data.exSig)" != "$SIG1" ]'

echo "=== 10. Bilgi iste → üye bilgileri günceller; iptal ve iade (kısmi teslim sonrası) ==="
api "$J_E" POST exchange/orders "{\"market\":\"$X1\",\"qty\":10,\"f\":{\"b1\":\"KarE\"}}" -H "X-CSRF-Token: $CS_E" -H "Idempotency-Key: $(ik)"; O2="$(j .data.order.id)"
chk "E sipariş: 125 TL yalnız nakitten" '[ "$CODE" = 200 ] && [ "$(wal $UE)" = "37500/0" ] && [ "$(j .data.order.paid.w)" = 125 ]'
api "$J_OP" POST "admin/ex/orders/$O2/info" '{"msg":"Karakter bulunamadı"}' -H "X-CSRF-Token: $CS_OP"
chk "bilgi istendi → bilgi, not" '[ "$(j .data.order.status)" = bilgi ] && [ "$(j .data.order.note)" = "Karakter bulunamadı" ]'
api "$J_E" PUT "exchange/orders/$O2/fields" '{"f":{"b1":"KarE2"}}' -H "X-CSRF-Token: $CS_E"
chk "üye bilgileri güncelledi → bekliyor" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = bekliyor ] && [ "$(j .data.order.f.b1)" = KarE2 ] && [ "$(j .data.order.note)" = "" ]'
api "$J_OP" POST "admin/ex/orders/$O2/pair" "{\"offer\":\"$E3\",\"qty\":6}" -H "X-CSRF-Token: $CS_OP"
api "$J_OP" POST "admin/ex/orders/$O2/deliver" '{"qty":2}' -H "X-CSRF-Token: $CS_OP"
api "$J_OP" POST "admin/ex/orders/$O2/cancel" '{}' -H "X-CSRF-Token: $CS_OP"
chk "kalanı iptal: 2 × 12,5 teslim, 100 TL iade (nakit), 4 adet C emrine döner" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = iptal ] && [ "$(wal $UE)" = "47500/0" ] && [ "$(sq "SELECT left_qty FROM yp_ex_offers WHERE id=${E3#E}")" = 48 ] && [ "$(j .data.order.total)" = 25 ] && escrow_ok'
chk "iptal audit'e yazıldı, iade defterde (iade)" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''ex_cancel'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE kind='\''iade'\'' AND ref_type='\''exorder'\''")" -ge 2 ]'

echo "=== 11. Satış emri iptali: sahibi / başka üye 403 / operatör ==="
api "$J_E" POST "exchange/offers/$E3/cancel" '{}' -H "X-CSRF-Token: $CS_E"
chk "başka üye iptal edemez → 403" '[ "$CODE" = 403 ]'
api "$J_C" POST "exchange/offers/$E3/cancel" '{}' -H "X-CSRF-Token: $CS_C"
chk "sahibi iptal etti, gizli bilgiler silindi" '[ "$CODE" = 200 ] && [ "$(j .data.offer.status)" = iptal ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE offer_id=${E3#E} AND value_enc IS NOT NULL")" = 0 ]'
OFF "$J_D" "$X1" 5 8 d2 "$CS_D"; E4="$(j .data.offer.id)"
api "$J_OP" POST "exchange/offers/$E4/cancel" '{}' -H "X-CSRF-Token: $CS_OP"
chk "[borsa] operatör iptal edebilir (audit)" '[ "$CODE" = 200 ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''ex_offer_cancel'\''")" = 1 ]'

echo "=== 12. 7 günlük güvenlik ağı (cron): eski gizli bilgi silinir, aktif emir kapanır ==="
chk "C emri #$E1 hâlâ aktif ve şifresi kayıtlı" '[ "$(sq "SELECT status FROM yp_ex_offers WHERE id=${E1#E}")" = aktif ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE offer_id=${E1#E} AND value_enc IS NOT NULL")" = 1 ]'
cron_at $(( $(nowms) + 6*86400000 )) >/dev/null
chk "6. gün: dokunulmadı" '[ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE offer_id=${E1#E} AND value_enc IS NOT NULL")" = 1 ]'
OUT=$(cron_at $(( $(nowms) + 8*86400000 )))
chk "8. gün: şifre NULL, emir kapandı, satıcıya bildirim, audit" '[ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE offer_id=${E1#E} AND value_enc IS NOT NULL")" = 0 ] && [ "$(sq "SELECT status FROM yp_ex_offers WHERE id=${E1#E}")" = iptal ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UC#u} AND x LIKE '\''%7 gün%'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''ex_secret_wipe'\''")" -ge 1 ]'
chk "veritabanında hiçbir gizli değer yok" '[ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE value_enc IS NOT NULL")" = 0 ]'

echo "=== 13. Borsayı kapat (exShutdown): herkese iade, toplam denetimi; kapalıyken işlem yok; aç ==="
OFF "$J_C" "$X1" 40 9 c3 "$CS_C"; E5="$(j .data.offer.id)"
OFF "$J_D" "$X3" 40 2 d3 "$CS_D"; E6="$(j .data.offer.id)"
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":8,\"f\":{\"b1\":\"KarB\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"; O3="$(j .data.order.id)"
api "$J_E" POST exchange/orders "{\"market\":\"$X3\",\"qty\":20,\"f\":{\"b1\":\"KarE\"}}" -H "X-CSRF-Token: $CS_E" -H "Idempotency-Key: $(ik)"; O4="$(j .data.order.id)"
api "$J_D" POST exchange/orders "{\"market\":\"$X3\",\"qty\":10,\"f\":{\"b1\":\"KarD\"}}" -H "X-CSRF-Token: $CS_D" -H "Idempotency-Key: $(ik)"; O5="$(j .data.order.id)"
api "$J_OP" POST "admin/ex/orders/$O4/pair" "{\"offer\":\"$E6\",\"qty\":15}" -H "X-CSRF-Token: $CS_OP"
api "$J_OP" POST "admin/ex/orders/$O4/deliver" '{"qty":5}' -H "X-CSRF-Token: $CS_OP"
chk "3 açık sipariş (biri kısmi teslimli), 2 aktif emir" '[ "$(sq "SELECT COUNT(*) FROM yp_ex_orders WHERE status IN ('\''bekliyor'\'','\''islemde'\'','\''bilgi'\'','\''kismen'\'')")" = 3 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_offers WHERE status='\''aktif'\''")" = 2 ]'
EXP=$(sq "SELECT SUM(total-released) FROM yp_ex_orders WHERE status IN ('bekliyor','islemde','bilgi','kismen')")
WSUM0=$(sq "SELECT SUM(cash+credit) FROM yp_wallets"); ESC0=$(acct ESCROW:EX)
api "$J_OP" POST admin/ex/power '{"on":false}' -H "X-CSRF-Token: $CS_OP"
chk "kapatıldı: 3 sipariş + 2 emir iptal, iade = beklenen ($EXP kuruş)" '[ "$CODE" = 200 ] && [ "$(j .data.shutdown.orders)" = 3 ] && [ "$(j .data.shutdown.offers)" = 2 ] && [ "$(j .data.shutdown.refunded)" = "$EXP" ] && [ "$(j .data.shutdown.expected)" = "$EXP" ] && [ "$(j .data.set.exOn)" = false ]'
chk "toplam denetimi: cüzdanlar + havuz değişmedi, ESCROW:EX 0, açık sipariş yok" '[ "$(acct ESCROW:EX)" = 0 ] && [ "$(sq "SELECT SUM(cash+credit) FROM yp_wallets")" = $((WSUM0 + ESC0)) ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_orders WHERE status IN ('\''bekliyor'\'','\''islemde'\'','\''bilgi'\'','\''kismen'\'')")" = 0 ] && escrow_ok'
chk "B, E, D'ye bilgilendirme; gizli bilgiler silindi" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE x LIKE '\''Yang Borsası kısa bir süreliğine%'\''")" = 4 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ex_offer_fields WHERE value_enc IS NOT NULL")" = 0 ]'
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":1,\"f\":{\"b1\":\"KarB\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "kapalıyken alım → 409 ex_closed" '[ "$CODE" = 409 ] && [ "$(j .code)" = ex_closed ]'
OFF "$J_C" "$X1" 1 5 cz "$CS_C"
chk "kapalıyken satış emri → 409" '[ "$CODE" = 409 ]'
api "$J_X" GET boot ""
chk "boot: exOn false, kapalı mesajı" '[ "$(j .data.set.exOn)" = false ] && [ -n "$(j .data.set.exOffMsg)" ]'
api "$J_OP" PUT admin/ex/offmsg '{"msg":"Bakımdayız, akşam açılıyor."}' -H "X-CSRF-Token: $CS_OP"
api "$J_OP" POST admin/ex/power '{"on":true}' -H "X-CSRF-Token: $CS_OP"
chk "açıldı: etkilenen 4 üyeye haber" '[ "$CODE" = 200 ] && [ "$(j .data.notified)" = 4 ] && [ "$(j .data.set.exOn)" = true ] && [ "$(j .data.set.exOffMsg)" = "Bakımdayız, akşam açılıyor." ]'
api "$J_OP" PUT admin/ex/switch '{"k":"exBuyOn"}' -H "X-CSRF-Token: $CS_OP"
api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":1,\"f\":{\"b1\":\"KarB\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "alım anahtarı kapalı → 409; satış emri açık" '[ "$CODE" = 409 ] && OFF "$J_C" "$X1" 1 5 cy "$CS_C" && [ "$CODE" = 200 ]'
api "$J_OP" PUT admin/ex/switch '{"k":"exBuyOn","on":true}' -H "X-CSRF-Token: $CS_OP"
api "$J_AY" DELETE "admin/ex/markets/$X1" '' -H "X-CSRF-Token: $CS_AY"
chk "aktif emri olan pazar silinemez → 409" '[ "$CODE" = 409 ]'
api "$J_AY" DELETE "admin/ex/markets/$X2" '' -H "X-CSRF-Token: $CS_AY"
chk "boş pazar silindi" '[ "$CODE" = 200 ] && [ "$(j ".data.markets | length")" = 2 ]'

echo "=== 14. EP mağazası [ep]: paket + kodlar (şifreli, benzersiz), satın alma, kod yalnız alıcıya ==="
api "$J_EP" POST admin/ep/products '{"srv":"","ep":1000,"price":50,"codes":"EPKOD-AAAA-1111\nEPKOD-BBBB-2222\nEPKOD-AAAA-1111"}' -H "X-CSRF-Token: $CS_EP"
P1="$(j .data.epProducts[0].id)"
chk "paket eklendi: 2 kod (listedeki tekrar tek sayılır), yönetim görünümü maskeli" '[ "$CODE" = 200 ] && [ "$(j ".data.epProducts[0].codes | length")" = 2 ] && [ "$(j ".data.epProducts[0].codeIds | length")" = 2 ] && ! echo "$BODY" | grep -q "EPKOD-AAAA"'
chk "veritabanı: kod düz metin değil, HMAC benzersiz" '[ "$(sq "SELECT COUNT(*) FROM yp_ep_codes WHERE code_enc LIKE '\''%EPKOD%'\'' OR code_hash LIKE '\''%EPKOD%'\''")" = 0 ] && [ "$(sq "SELECT COUNT(DISTINCT code_hash) FROM yp_ep_codes")" = 2 ]'
api "$J_EP" PUT "admin/ep/products/$P1" '{"codes":"EPKOD-BBBB-2222\nEPKOD-CCCC-3333","price":45}' -H "X-CSRF-Token: $CS_EP"
chk "kod ekle: daha önce eklenmiş atlandı, 1 yeni; fiyat 45" '[ "$CODE" = 200 ] && [ "$(j ".data.epProducts[0].codes | length")" = 3 ] && [ "$(j .data.epProducts[0].price)" = 45 ]'
api "$J_X" GET ep/products ""
chk "herkese açık: stok 3, kod yok" '[ "$(j .data.epProducts[0].stock)" = 3 ] && [ "$(j .data.epProducts[0].codes)" = null ] && ! echo "$BODY" | grep -q EPKOD'
api "$J_B" POST ep/orders "{\"product\":\"$P1\"}" -H "X-CSRF-Token: $CS_B"
chk "Idempotency-Key olmadan → 400" '[ "$CODE" = 400 ]'
BW=$(wal $UB); BC=${BW%/*}; BK=${BW#*/}
KEY=$(ik)
api "$J_B" POST ep/orders "{\"product\":\"$P1\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
EO1="$(j .data.order.id)"; CODE1="$(j .data.order.code)"
chk "satın alındı: ilk kod teslim, 45 TL önce krediden, REV:ep" '[ "$CODE" = 200 ] && [ "$CODE1" = "EPKOD-AAAA-1111" ] && [ "$(j .data.order.paid.nw)" = "$(php -r "echo min($BK,4500)/100;")" ] && [ "$(acct REV:ep)" = 4500 ]'
chk "idempotency kaydında kod yok" '[ "$(sq "SELECT COUNT(*) FROM yp_idempotency_keys WHERE response LIKE '\''%EPKOD%'\''")" = 0 ]'
api "$J_B" POST ep/orders "{\"product\":\"$P1\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
chk "aynı anahtar → aynı kod, ikinci satış yok" '[ "$(j .data.order.id)" = "$EO1" ] && [ "$(j .data.order.code)" = "$CODE1" ] && [ "$(sq "SELECT COUNT(*) FROM yp_ep_orders")" = 1 ] && [ "$(acct REV:ep)" = 4500 ]'
api "$J_B" GET me/ep-orders ""
chk "EP kodlarım: kod açık (yalnız sahibine)" '[ "$(j .data.epOrders[0].code)" = "$CODE1" ]'
api "$J_E" GET me/ep-orders ""
chk "başka üye görmez" '[ "$(j ".data.epOrders | length")" = 0 ]'
api "$J_EP" GET admin/ep/log ""
chk "EP kayıtları: kod maskeli" '[ "$(j ".data.epOrders | length")" = 1 ] && [ "$(j .data.epOrders[0].code)" != "$CODE1" ] && j .data.epOrders[0].code | grep -q "1111$"'
api "$J_EP" GET "admin/ep/orders/$EO1/code" ""
chk "[ep] kodu açar, audit'e yazılır" '[ "$(j .data.code)" = "$CODE1" ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''ep_code_reveal'\''")" = 1 ]'
CID=$(sq "SELECT 'c'||id FROM yp_ep_codes WHERE status='stok' ORDER BY id DESC LIMIT 1")
api "$J_EP" DELETE "admin/ep/codes/$CID" '' -H "X-CSRF-Token: $CS_EP"
chk "stoktaki kod silindi (1 kaldı)" '[ "$CODE" = 200 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ep_codes WHERE product_id=${P1#ep} AND status='\''stok'\''")" = 1 ]'
api "$J_EP" PUT admin/settings/hh '{"on":true,"pct":50}' -H "X-CSRF-Token: $CS_EP"
chk "Happy Hour açıldı (%50)" '[ "$CODE" = 200 ] && [ "$(j .data.hh.on)" = true ]'

echo "=== 15. Eşzamanlılık: son koda 6 paralel alım → yalnız biri alır, diğerleri 'tükendi' ==="
api "$J_ADM" POST admin/balance "{\"user\":\"Uye_E\",\"amount\":400,\"w\":false,\"note\":\"Kart (test)\"}" -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/balance "{\"user\":\"Satici_C\",\"amount\":400,\"w\":false,\"note\":\"Kart (test)\"}" -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/balance "{\"user\":\"Satici_D\",\"amount\":400,\"w\":false,\"note\":\"Kart (test)\"}" -H "X-CSRF-Token: $CS_ADM"
WS0=$(sq "SELECT SUM(cash+credit) FROM yp_wallets")
i=0
for pair in "$J_E:$CS_E" "$J_C:$CS_C" "$J_D:$CS_D" "$J_E:$CS_E" "$J_C:$CS_C" "$J_D:$CS_D"; do i=$((i+1))
  curl -s -b "${pair%%:*}" -X POST -H "X-CSRF-Token: ${pair#*:}" -H "Idempotency-Key: par$i-$(ik)" -H 'Content-Type: application/json' \
    --data "{\"product\":\"$P1\"}" -o "$RUN/ep$i.json" "$(url ep/orders)" & PIDS+=($!)
done
wjobs
NOK=$(cat "$RUN"/ep*.json | jq -s '[.[] | select(.ok==true)] | length')
NSO=$(cat "$RUN"/ep*.json | jq -s '[.[] | select(.code=="sold_out" and .error=="Bu ürün tükendi.")] | length')
chk "6 paralel: 1 başarılı, 5 'Bu ürün tükendi.'" '[ "$NOK" = 1 ] && [ "$NSO" = 5 ]'
chk "veritabanı: 2 satış, stok 0, tek seferlik ödeme (45 TL), HH: 1500 EP gösterildi" '[ "$(sq "SELECT COUNT(*) FROM yp_ep_orders")" = 2 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ep_codes WHERE product_id=${P1#ep} AND status='\''stok'\''")" = 0 ] && [ "$(sq "SELECT SUM(cash+credit) FROM yp_wallets")" = $((WS0 - 4500)) ] && [ "$(sq "SELECT ep_shown FROM yp_ep_orders ORDER BY id DESC LIMIT 1")" = 1500 ]'
chk "kod iki kez satılmadı" '[ "$(sq "SELECT COUNT(DISTINCT code_id) FROM yp_ep_orders")" = 2 ]'
api "$J_E" POST ep/orders "{\"product\":\"$P1\"}" -H "X-CSRF-Token: $CS_E" -H "Idempotency-Key: $(ik)"
chk "stok bitti → 409 tükendi" '[ "$CODE" = 409 ] && [ "$(j .error)" = "Bu ürün tükendi." ]'
api "$J_EP" POST admin/ep/products '{"ep":5000,"price":2000,"codes":"BIG-1"}' -H "X-CSRF-Token: $CS_EP"; P2="$(j '.data.epProducts | map(select(.ep==5000))[0].id')"
api "$J_E" POST ep/orders "{\"product\":\"$P2\"}" -H "X-CSRF-Token: $CS_E" -H "Idempotency-Key: $(ik)"
chk "bakiye yetersiz → 409, kod stokta kalır" '[ "$CODE" = 409 ] && [ "$(j .code)" = insufficient ] && [ "$(sq "SELECT COUNT(*) FROM yp_ep_codes WHERE product_id=${P2#ep} AND status='\''stok'\''")" = 1 ]'
api "$J_EP" POST "admin/ep/products/$P2/toggle" '{}' -H "X-CSRF-Token: $CS_EP"
api "$J_X" GET ep/products ""
chk "kapatılan paket satışta görünmez" '[ "$(j ".data.epProducts | map(select(.id==\"$P2\")) | length")" = 0 ]'
api "$J_EP" DELETE "admin/ep/products/$P2" '' -H "X-CSRF-Token: $CS_EP"
chk "paket silindi, kodları silindi" '[ "$CODE" = 200 ] && [ "$(sq "SELECT COUNT(*) FROM yp_ep_codes WHERE product_id=${P2#ep} AND status='\''stok'\''")" = 0 ] && [ -n "$(sq "SELECT deleted_at FROM yp_ep_products WHERE id=${P2#ep}")" ]'
SVP=$(sq "SELECT 'sv'||id FROM yp_servers WHERE sec='pvp' ORDER BY id LIMIT 1 OFFSET 2")
api "$J_EP" POST admin/ep/products "{\"srv\":\"$SVP\",\"ep\":100,\"price\":5}" -H "X-CSRF-Token: $CS_EP"
chk "EP satışı kapalı PVP servera paket → 422" '[ "$CODE" = 422 ]'

echo "=== 16. JS ↔ PHP parite (asıl 50-exchange.js işlevleri) ==="
PAR=$(php "$REPO/tests/http/p4-parity.php" 600 2>&1); PRC=$?
echo "$PAR" | sed 's/^/      /'
for fn in exQuote exApplyFills exPair exUnpair exDeliver "exFinish/exCancelOrder"; do
  L=$(echo "$PAR" | grep "^PARITE $fn " | awk '{print $3}')
  chk "parite $fn: $L" '[ -n "$L" ] && [ "${L%/*}" = "${L#*/}" ]'
done
chk "parite betiği başarılı" '[ "$PRC" = 0 ]'

echo "=== 17. Defter tutarlılığı ==="
api "$J_ADM" POST admin/money/check '{}' -H "X-CSRF-Token: $CS_ADM"
chk "defter denetimi (ESCROW:EX dahil): tutarlı" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ]'
chk "tüm postings toplamı 0, eksi cüzdan yok" '[ "$(sq "SELECT COALESCE(SUM(amount),0) FROM yp_postings")" = 0 ] && [ "$(sq "SELECT COUNT(*) FROM yp_wallets WHERE cash<0 OR credit<0")" = 0 ]'
chk "borsa havuzu = siparişler (ödenen − teslimle çıkan)" 'escrow_ok'
VAL=$(sq "SELECT COALESCE(SUM(-p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id JOIN yp_journal j ON j.id=p.journal_id WHERE a.code='ESCROW:EX' AND j.kind='borsa'")
PAYS=$(sq "SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_journal j ON j.id=p.journal_id JOIN yp_accounts a ON a.id=p.account_id WHERE j.kind='borsa' AND a.type='user_cash'")
chk "REV:borsa = teslimlerin (alıcı − satıcı) farkı" '[ "$(acct REV:borsa)" = $((VAL - PAYS)) ] && [ "$VAL" -gt 0 ]'
chk "sunucu günlüğünde PHP hatası yok" '! grep -qiE "PHP (Fatal|Warning|Parse|Notice|Deprecated)" "$SLOG"'
grep -h 'hata' "$RUN"/storage/log/*.log 2>/dev/null | head -5

echo
echo "SONUÇ (P4 HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
