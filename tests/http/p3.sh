#!/usr/bin/env bash
# P3 uçtan uca HTTP testleri: para çekme, T.C. kimlik (NVİ sahte), e-Gider Pusulası, muhasebe kuyruğu, Entegrasyonlar, eski api/ kiti.
# Canlıdaki yükseltme senaryosu: P2 sürümü ($P2_REF) sihirbazla kurulur, üzerinde gerçek veri oluşur (havale yüklemesi, bakiye
# düzeltmesi, eski api/ paketiyle PayTR ayarı) → P3 kodu (çalışma ağacı) üzerine kopyalanır → ilk istek tabloları ekler, veri korunur,
# eski PayTR ayarı Entegrasyonlar'a aktarılır. NVİ / muhasebe / PayTR bağlantı testi storage/test_mock.json ile (yalnız YP_TEST=1 + SQLite).
# Tüm istekler rewrite'sız /api/v1/index.php?r=<yol> biçiminde.
# Kullanım: bash tests/http/p3.sh      (gerekenler: php 8.1+ sqlite, curl, jq, git, openssl)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((24000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p3-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
P2_REF="${P2_REF:-a905dd8}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$P2_REF^{commit}" 2>/dev/null; then
  git -C "$REPO" archive "$P2_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: $P2_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
  cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$RUN/"
  cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"; cp "$REPO/uploads/.htaccess" "$REPO/uploads/index.php" "$RUN/uploads/"
fi
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"

YP_TEST=1 YP_TEST_PAYTR=fake PHP_CLI_SERVER_WORKERS=6 php -d display_errors=0 -d log_errors=1 \
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
rl_reset() { rm -f "$RUN"/storage/rl/*.json; }
sq() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $p->exec("PRAGMA busy_timeout=8000"); $v=$p->query($argv[1])->fetchColumn(); echo $v===false?"":$v;' "$1"; }
PIDS=()
wjobs() { local p; for p in "${PIDS[@]}"; do wait "$p"; done; PIDS=(); }
ik() { echo "k$(date +%s%N)$RANDOM"; }
nowms() { echo $(( $(date +%s%N) / 1000000 )); }
cron_run() { YP_TEST=1 php "$RUN/app/cron.php" 2>&1; }
wal() { sq "SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=${1#u}"; }
mock() { echo "$1" > "$RUN/storage/test_mock.json"; }
BANNED='gider|pusula|VUK|ETTN'

J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_B="$RUN/b.jar"; J_C="$RUN/c.jar"; J_D="$RUN/d.jar"; J_ADM="$RUN/adm.jar"; J_CK="$RUN/ck.jar"; J_MU="$RUN/mu.jar"
J_OD="$RUN/od.jar"; J_IL="$RUN/il.jar"; J_X="$RUN/x.jar"; J_API="$RUN/api.jar"
TC_B=10000000146; TC_C=12345678950; TC_D=11111111110; IBAN=TR330006100519786457841326
MID=123456; KEY=AbCdEf1234567890; SALT=SaLt0987654321zz

echo "=== 1. Kurulum: P2 ($P2_REF), üzerinde veri ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang P3" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
reg() { local jar="$1" name="$2" mail="$3" tel="$4"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\"}" -H "X-CSRF-Token: $cs"; }
reg "$J_B" Cekici_B b@ornek.com "0555 111 22 02"; CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
reg "$J_C" Kartci_C c@ornek.com "0555 111 22 03"; CS_C="$(j .data.csrf)"; UC="$(j .data.me.id)"
reg "$J_D" Uye_D d@ornek.com "0555 111 22 04"; CS_D="$(j .data.csrf)"; UD="$(j .data.me.id)"
chk "B, C, D kayıtlı" '[ -n "$UB" ] && [ "$UB" != null ] && [ -n "$UD" ] && [ "$UD" != null ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
chk "yönetici girişi" '[ "$(j .data.me.admin)" = true ]'
api "$J_ADM" POST admin/banks '{"b":"Ziraat Bankası","n":"YangPazar Ltd","i":"TR330006100519786457841326"}' -H "X-CSRF-Token: $CS_ADM"
api "$J_B" POST deposits/manual "{\"gw\":\"havale\",\"amount\":1000,\"txAt\":$(nowms),\"toBank\":\"Ziraat Bankası\",\"note\":\"Test Uye\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
D1="$(j .data.deposit.id)"
api "$J_ADM" POST "admin/deposits/$D1/approve" '{}' -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/balance "{\"user\":\"Kartci_C\",\"amount\":500,\"w\":false,\"note\":\"Kart yüklemesi (test)\"}" -H "X-CSRF-Token: $CS_ADM"
chk "P2 verisi: B 1000 çekilebilir (havale), C 500 yalnız alışveriş" '[ "$(wal $UB)" = "100000/0" ] && [ "$(wal $UC)" = "0/50000" ]'
if [ "$UPGRADE" = 1 ]; then
  # eski api/ paketi (P2'de hâlâ ayrı API şifresiyle): PayTR ayarı girilir — P3'te Entegrasyonlar'a aktarılmalı
  OUT=$(curl -s -b "$J_API" -c "$J_API" -X POST -H 'Content-Type: application/json' --data "{\"password\":\"Cok-Gizli-Sifre-2026\",\"site_url\":\"http://127.0.0.1:$PORT\"}" "$B/api/kurulum.php")
  API_CSRF=$(echo "$OUT" | jq -r .csrf)
  OUT=$(curl -s -b "$J_API" -c "$J_API" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $API_CSRF" \
    --data "{\"service\":\"paytr\",\"values\":{\"merchant_id\":\"$MID\",\"merchant_key\":\"$KEY\",\"merchant_salt\":\"$SALT\",\"test_mode\":true}}" "$B/api/ayarlar.php")
  chk "P2: eski api/ paketinde PayTR ayarlı" 'echo "$OUT" | jq -e ".configured==true" >/dev/null'
fi
N_J0=$(sq "SELECT COUNT(*) FROM yp_journal"); N_D0=$(sq "SELECT COUNT(*) FROM yp_deposits"); N_U0=$(sq "SELECT COUNT(*) FROM yp_users")

echo "=== 2. P3 paketi üzerine kopyalanır (ilk istek: tablolar + göç, veri korunur) ==="
if [ "$UPGRADE" = 1 ]; then
  chk "P2'de çekim tablosu yok" '[ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_withdrawals'\''")" ]'
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 2
fi
api "$J_X" GET boot ""
chk "ilk istek: withdrawals, doc_sequences, accounting_jobs + TC sütunları" '[ "$CODE" = 200 ] && [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_withdrawals'\''")" ] && [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_doc_sequences'\''")" ] && [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_accounting_jobs'\''")" ] && sq "PRAGMA table_info(yp_users)" >/dev/null && [ "$(sq "SELECT COUNT(*) FROM pragma_table_info('\''yp_users'\'') WHERE name='\''tc_state'\''")" = 1 ]'
chk "veri korundu: üyeler, yüklemeler, defter, cüzdanlar" '[ "$(sq "SELECT COUNT(*) FROM yp_users")" = "$N_U0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_deposits")" = "$N_D0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal")" = "$N_J0" ] && [ "$(wal $UB)" = "100000/0" ] && [ "$(wal $UC)" = "0/50000" ]'
chk "göç 0004 kayıtlı, sürüm 0.5.0-p3" '[ -n "$(sq "SELECT version FROM yp_schema_migrations WHERE version='\''m:0004_integrations_import'\''")" ] && grep -q "0.5.0-p3" "$RUN/app/bootstrap.php"'
if [ "$UPGRADE" = 1 ]; then
  chk "eski PayTR ayarı Entegrasyonlar'a aktarıldı (şifreli), boot'ta kart açık" '[ "$(sq "SELECT secret FROM yp_settings WHERE k='\''paytr'\''")" = 1 ] && [ "$(j ".data.gws[] | select(.id==\"paytr\") | .on")" = true ]'
fi
chk "boot.set: wdFee, wdTax, tc (e-Gider ayarı yok)" '[ "$(j .data.set.wdFee.on)" = false ] && [ "$(j .data.set.wdTax)" = 0 ] && [ "$(j .data.set.tc.req)" = true ] && [ "$(j .data.set.egp)" = null ]'
# P3 sürümünde oturumlar sürüyor mu?
api "$J_B" GET boot ""; CS_B="$(j .data.csrf)"
chk "yükseltmeden sonra üye oturumu sürüyor" '[ "$(j .data.me.id)" = "$UB" ]'
CS_C=$(csrf_of "$J_C"); CS_D=$(csrf_of "$J_D"); CS_ADM=$(csrf_of "$J_ADM")

echo "=== 3. Çalışanlar: [cekim], [muhasebe], [odeme], [ilan] ==="
mk_staff() { api "$J_ADM" POST admin/staff "{\"name\":\"$1\",\"email\":\"$2\",\"ad\":\"$3\",\"soyad\":\"Ci\",\"password\":\"Calisan-Sifre-9\",\"perms\":[\"$4\"]}" -H "X-CSRF-Token: $CS_ADM"; }
mk_staff CekimCalisan ck@yangpazar.com Cekim cekim; mk_staff MuhCalisan mu@yangpazar.com Muh muhasebe; mk_staff OdemeCalisan od@yangpazar.com Odeme odeme; mk_staff IlanCalisan il@yangpazar.com Ilan ilan
login() { local jar="$1" n="$2" cs; cs=$(csrf_of "$jar"); api "$jar" POST auth/login "{\"login\":\"$n\",\"password\":\"Calisan-Sifre-9\"}" -H "X-CSRF-Token: $cs"; j .data.csrf; }
CS_CK=$(login "$J_CK" CekimCalisan); CS_MU=$(login "$J_MU" MuhCalisan); CS_OD=$(login "$J_OD" OdemeCalisan); CS_IL=$(login "$J_IL" IlanCalisan)
chk "4 çalışan girişi" '[ -n "$CS_CK" ] && [ "$CS_CK" != null ] && [ -n "$CS_IL" ] && [ "$CS_IL" != null ]'

echo "=== 4. TC kimlik: NVİ sahte başarılı / eşleşmedi / ulaşılamıyor; benzersizlik ve maskeleme ==="
mock '{"nvi":"ok"}'
api "$J_B" POST withdrawals "{\"amount\":100,\"iban\":\"$IBAN\",\"bank\":\"Ziraat Bankası\",\"name\":\"Test Uye\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "TC doğrulanmadan çekim → 409 tc_required" '[ "$CODE" = 409 ] && [ "$(j .code)" = tc_required ]'
api "$J_B" POST me/tc/verify "{\"tc\":\"$TC_B\",\"dt\":\"1990-05-05\"}" -H "X-CSRF-Token: $CS_B"
chk "NVİ başarılı → doğrulandı, maskeli" '[ "$CODE" = 200 ] && [ "$(j .data.state)" = ok ] && [ "$(j .patch.me.tc.ok)" = true ] && [ "$(j .patch.me.tc.mask)" = "100******46" ] && [ "$(j .patch.me.tc.full)" = true ]'
chk "yanıtta tam TC yok" '! echo "$BODY" | grep -q "$TC_B"'
chk "veritabanında tam TC düz metin değil, özet HMAC" '[ "$(sq "SELECT COUNT(*) FROM yp_users WHERE tc_enc LIKE '\''%$TC_B%'\''")" = 0 ] && [ "$(sq "SELECT tc_hash FROM yp_users WHERE id=${UB#u}")" != "$(printf "%s" "$TC_B|yangpazar" | sha256sum | cut -c1-64)" ]'
api "$J_C" POST me/tc/verify "{\"tc\":\"$TC_B\",\"dt\":\"1991-01-01\"}" -H "X-CSRF-Token: $CS_C"
chk "aynı TC başka hesapta → 422" '[ "$CODE" = 422 ] && j .error | grep -q "başka bir hesapta"'
mock '{"nvi":"fail"}'
api "$J_C" POST me/tc/verify "{\"tc\":\"$TC_C\",\"dt\":\"1991-01-01\"}" -H "X-CSRF-Token: $CS_C"
chk "NVİ eşleşmedi → 422 Türkçe, doğrulanmadı" '[ "$CODE" = 422 ] && j .error | grep -q "eşleşmedi" && [ "$(sq "SELECT tc_ok FROM yp_users WHERE id=${UC#u}")" = 0 ] && [ "$(sq "SELECT tc_tries FROM yp_users WHERE id=${UC#u}")" = 1 ]'
mock '{"nvi":"ok"}'
api "$J_C" POST me/tc/verify "{\"tc\":\"$TC_C\",\"dt\":\"1991-01-01\"}" -H "X-CSRF-Token: $CS_C"
chk "C ikinci denemede doğrulandı" '[ "$(j .data.state)" = ok ]'
mock '{"nvi":"down"}'
api "$J_D" POST me/tc/verify "{\"tc\":\"$TC_D\",\"dt\":\"1992-02-02\"}" -H "X-CSRF-Token: $CS_D"
chk "NVİ ulaşılamıyor → 200 inceleme, açık Türkçe mesaj" '[ "$CODE" = 200 ] && [ "$(j .data.state)" = inceleme ] && j .msg | grep -q "ulaşılamıyor" && [ "$(j .patch.me.tc.state)" = inceleme ] && [ "$(j .patch.me.tc.ok)" = false ]'
api "$J_D" GET me/withdrawals ""
chk "incelemedeyken çekim kapısı: tc_review" '[ "$(j .data.gate.code)" = tc_review ]'
api "$J_IL" POST "admin/users/$UD/tc-approve" '{}' -H "X-CSRF-Token: $CS_IL"
chk "[ilan] elle onay → 403" '[ "$CODE" = 403 ]'
api "$J_CK" POST "admin/users/$UD/tc-approve" '{}' -H "X-CSRF-Token: $CS_CK"
chk "[cekim] elle onayladı" '[ "$CODE" = 200 ] && [ "$(sq "SELECT tc_ok FROM yp_users WHERE id=${UD#u}")" = 1 ]'
mock '{"nvi":"ok"}'
api "$J_ADM" GET "admin/users/$UB" ""
chk "üye detayı (yönetim): maske var, tam TC yok" '[ "$(j .data.user.tc.mask)" = "100******46" ] && ! echo "$BODY" | grep -q "$TC_B"'
api "$J_IL" GET "admin/users/$UB/tc-full" ""
chk "[ilan] tam TC → 403" '[ "$CODE" = 403 ]'
A0=$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='tc_reveal'")
api "$J_MU" GET "admin/users/$UB/tc-full?why=test" ""
chk "[muhasebe] tam TC gösterimi + audit" '[ "$CODE" = 200 ] && [ "$(j .data.tc)" = "$TC_B" ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''tc_reveal'\''")" = $((A0 + 1)) ]'

echo "=== 5. Çekim talebi: çekilebilir bakiye, kart bakiyesi, IBAN adı, paralel talepler ==="
api "$J_B" POST withdrawals "{\"amount\":100,\"iban\":\"$IBAN\",\"bank\":\"Ziraat Bankası\",\"name\":\"Test Uye\"}" -H "X-CSRF-Token: $CS_B"
chk "Idempotency-Key olmadan → 400" '[ "$CODE" = 400 ] && [ "$(j .code)" = idem_key ]'
api "$J_B" POST withdrawals "{\"amount\":1200,\"iban\":\"$IBAN\",\"bank\":\"Ziraat Bankası\",\"name\":\"Test Uye\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "çekilebilir bakiyeden fazla → 409, bakiye aynı" '[ "$CODE" = 409 ] && [ "$(j .code)" = insufficient ] && [ "$(wal $UB)" = "100000/0" ]'
api "$J_C" POST withdrawals "{\"amount\":100,\"iban\":\"$IBAN\",\"bank\":\"Ziraat Bankası\",\"name\":\"Test Uye\"}" -H "X-CSRF-Token: $CS_C" -H "Idempotency-Key: $(ik)"
chk "kart/bonus bakiyesi (500 alışveriş) çekilemez → 409" '[ "$CODE" = 409 ] && j .error | grep -q "Kart, mobil ödeme" && [ "$(wal $UC)" = "0/50000" ]'
api "$J_B" POST withdrawals "{\"amount\":100,\"iban\":\"$IBAN\",\"bank\":\"Ziraat Bankası\",\"name\":\"Başka Kişi\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "IBAN sahibi üyenin adı değil → 422" '[ "$CODE" = 422 ] && j .error | grep -q "aynı olmalı"'
api "$J_B" POST withdrawals "{\"amount\":20,\"iban\":\"$IBAN\",\"bank\":\"Ziraat Bankası\",\"name\":\"Test Uye\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "en az çekim tutarı (50 TL) → 422" '[ "$CODE" = 422 ] && j .error | grep -q "En az"'
rl_reset
for i in 1 2 3 4 5; do
  curl -s -b "$J_B" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: par$i-$(ik)" \
    --data "{\"amount\":300,\"iban\":\"$IBAN\",\"bank\":\"Ziraat Bankası\",\"name\":\"Test Uye\",\"save\":true}" -o "$RUN/wd$i.json" -w '%{http_code}\n' "$(url withdrawals)" > "$RUN/wd$i.code" & PIDS+=($!)
done
wjobs
OKN=$(cat "$RUN"/wd*.code | grep -c 200); NON=$(cat "$RUN"/wd*.code | grep -c 409)
chk "5 paralel 300 TL talep (1000 TL bakiye): yalnız 3'ü geçti, 2'si 409" '[ "$OKN" = 3 ] && [ "$NON" = 2 ]'
chk "bakiye eksiye düşmedi: 100 TL kaldı, PAYABLE:WD = 900" '[ "$(wal $UB)" = "10000/0" ] && [ "$(sq "SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='\''PAYABLE:WD'\''")" = 90000 ]'
chk "IBAN bir kez kaydedildi (şifreli)" '[ "$(sq "SELECT COUNT(*) FROM yp_user_ibans WHERE user_id=${UB#u}")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_user_ibans WHERE iban_enc LIKE '\''%$IBAN%'\''")" = 0 ]'
K1=$(ik)
api "$J_ADM" POST admin/balance "{\"user\":\"Cekici_B\",\"amount\":2000,\"w\":true,\"note\":\"Satış geliri (test)\"}" -H "X-CSRF-Token: $CS_ADM"
IB="$(sq "SELECT 'ib'||id FROM yp_user_ibans WHERE user_id=${UB#u}")"
api "$J_B" POST withdrawals "{\"amount\":150,\"iban\":\"$IB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $K1"
W1="$(j .data.withdrawal.id)"
chk "kayıtlı IBAN ile talep: bekliyor, maskeli IBAN" '[ "$CODE" = 200 ] && [ "$(j .data.withdrawal.status)" = bekliyor ] && [ "$(j .data.withdrawal.iban)" = "TR33••••••1326" ]'
api "$J_B" POST withdrawals "{\"amount\":150,\"iban\":\"$IB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $K1"
chk "aynı anahtar → aynı talep, ikinci kesinti yok" '[ "$(j .data.withdrawal.id)" = "$W1" ] && [ "$(j .replayed)" = true ] && [ "$(sq "SELECT COUNT(*) FROM yp_withdrawals WHERE user_id=${UB#u}")" = 4 ]'
api "$J_B" GET me/withdrawals ""
chk "çekim taleplerim: 4 kayıt, durum" '[ "$(j ".data.wd | length")" = 4 ] && [ "$(j .data.wd[0].status)" = bekliyor ]'
chk "üye çekim listesi: gider/pusula/VUK/ETTN yok, tam IBAN yok" '! echo "$BODY" | grep -qiE "$BANNED" && ! echo "$BODY" | grep -q "$IBAN"'
chk "bildirim e-posta kuyruğunda (withdraw_req)" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB#u} AND ev='\''withdraw_req'\''")" = 4 ]'

echo "=== 6. Yetki: [ilan] / [odeme] / üye → 403; [muhasebe] görür ama onaylayamaz ==="
for spec in "GET admin/withdrawals" "POST admin/withdrawals/$W1/approve" "POST admin/withdrawals/$W1/reject" "POST admin/withdrawals/$W1/egp" "GET admin/withdrawals/$W1/egp" \
            "GET admin/egp?q=YGP" "GET admin/settings/withdraw" "PUT admin/settings/tc" "PUT admin/settings/wdfee" "PUT admin/settings/egp" "POST admin/users/$UB/tc-reset" \
            "POST admin/users/$UB/tc-ask" "POST admin/users/$UB/tc-full" "GET admin/reports/daily" "GET admin/reports/export?type=journal" "GET admin/accounting/jobs" \
            "POST admin/accounting/run" "GET admin/integrations" "PUT admin/integrations/paytr" "POST admin/integrations/parasut/test"; do
  m="${spec%% *}"; p="${spec#* }"
  if [ "$m" = GET ]; then api "$J_IL" GET "$p" ""; else api "$J_IL" "$m" "$p" '{}' -H "X-CSRF-Token: $CS_IL"; fi
  chk "[ilan] → 403: $spec" '[ "$CODE" = 403 ]'
done
for spec in "POST admin/withdrawals/$W1/approve" "GET admin/withdrawals" "PUT admin/settings/egp" "GET admin/users/$UB/tc-full" "PUT admin/integrations/parasut"; do
  m="${spec%% *}"; p="${spec#* }"
  if [ "$m" = GET ]; then api "$J_OD" GET "$p" ""; else api "$J_OD" "$m" "$p" '{}' -H "X-CSRF-Token: $CS_OD"; fi
  chk "[odeme] → 403: $spec" '[ "$CODE" = 403 ]'
done
api "$J_MU" POST "admin/withdrawals/$W1/approve" '{}' -H "X-CSRF-Token: $CS_MU"
chk "[muhasebe] onaylayamaz → 403" '[ "$CODE" = 403 ]'
api "$J_MU" GET "admin/withdrawals?f=tumu" ""
chk "[muhasebe] tabloyu görür (tam IBAN, açıklama)" '[ "$CODE" = 200 ] && [ "$(j ".data.wd | length")" = 4 ] && [ "$(j .data.wd[0].iban)" = "TR33 0006 1005 1978 6457 8413 26" ] && j .data.wd[0].desc | grep -q "VUK"'
api "$J_CK" PUT admin/integrations/paytr '{"values":{}}' -H "X-CSRF-Token: $CS_CK"
chk "[cekim] Entegrasyonlar → 403" '[ "$CODE" = 403 ]'
api "$J_B" GET admin/withdrawals ""
chk "üye → 403" '[ "$CODE" = 403 ]'
api "$J_C" GET "admin/withdrawals/$W1/egp" ""
chk "üye pusula → 403" '[ "$CODE" = 403 ]'

echo "=== 7. Onay: iki kez onay tek numara; paralel onaylarda boşluksuz seri ==="
api "$J_CK" GET "admin/withdrawals?f=bekliyor" ""
chk "[cekim] bekleyen 4 talep, rozet" '[ "$(j .data.counts.bekliyor)" = 4 ] && [ "$(j .data.pendingNet)" = 1050 ]'
api "$J_CK" GET admin/today ""
chk "Bugün kuyruğu: wd = 4" '[ "$(j .data.queues.wd)" = 4 ]'
for i in 1 2 3; do curl -s -b "$J_CK" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CS_CK" --data '{}' -o "$RUN/ap$i.json" "$(url "admin/withdrawals/$W1/approve")" & PIDS+=($!); done
wjobs
YR=$(date +%Y)
NO1=$(sq "SELECT egp_no FROM yp_withdrawals WHERE id=${W1#w}")
chk "3 paralel onay (aynı talep): hepsi 200, tek numara, tek ödeme kaydı" '[ "$(cat "$RUN"/ap*.json | jq -r .ok | grep -c true)" = 3 ] && [ "$NO1" = "YGP${YR}000000001" ] && [ "$(cat "$RUN"/ap*.json | jq -r .data.withdrawal.egp.no | sort -u)" = "$NO1" ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE kind='\''cekim_odendi'\'' AND ref_id='\''$W1'\''")" = 1 ]'
api "$J_CK" POST "admin/withdrawals/$W1/approve" '{}' -H "X-CSRF-Token: $CS_CK"
chk "dördüncü onay: zaten onaylanmış, aynı numara" '[ "$CODE" = 200 ] && [ "$(j .data.already)" = true ] && [ "$(j .data.withdrawal.egp.no)" = "$NO1" ]'
api "$J_B" GET boot ""
chk "üye: gönderildi bildirimi (pusula ifadesi yok)" 'echo "$BODY" | jq -r ".data.notifs[].x" | grep -q "IBAN.ınıza gönderildi" && ! echo "$BODY" | grep -qiE "$BANNED"'
# daha fazla talep: B (bakiye 2000+100-150) → 6 talep daha
rl_reset
for i in 1 2 3 4 5 6; do api "$J_B" POST withdrawals "{\"amount\":$((50 + i)),\"iban\":\"$IB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: more$i-$(ik)"; done
PEND=$(sq "SELECT GROUP_CONCAT('w'||id,' ') FROM yp_withdrawals WHERE status='bekliyor'")
NP=$(echo $PEND | wc -w)
for w in $PEND; do curl -s -b "$J_CK" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CS_CK" --data '{}' -o "$RUN/pa-$w.json" "$(url "admin/withdrawals/$w/approve")" & PIDS+=($!); done
wjobs
chk "$NP paralel onay: hepsi 200" '[ "$(cat "$RUN"/pa-*.json | jq -r .ok | grep -c true)" = "$NP" ]'
SEQ=$(sq "SELECT GROUP_CONCAT(CAST(substr(egp_no,8) AS INTEGER),',') FROM (SELECT egp_no FROM yp_withdrawals WHERE egp_no IS NOT NULL ORDER BY egp_no)")
EXP=$(seq -s, 1 $((NP + 1)))
chk "numaralar boşluksuz ve tekrarsız: $SEQ" '[ "$SEQ" = "$EXP" ] && [ "$(sq "SELECT next_no FROM yp_doc_sequences WHERE series='\''EGP:YGP'\''")" = $((NP + 2)) ]'
chk "defter: BANK:OUT = ödenen net, PAYABLE:WD = 0" '[ "$(sq "SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='\''BANK:OUT'\''")" = "$(sq "SELECT SUM(net) FROM yp_withdrawals WHERE status='\''onaylandı'\''")" ] && [ "$(sq "SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='\''PAYABLE:WD'\''")" = 0 ]'

echo "=== 8. Pusula (yalnız yönetim, tam TC) ve red (iade) ==="
A1=$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='egp_view'")
api "$J_MU" GET "admin/withdrawals/$W1/egp" ""
chk "pusula: tam TC (maske değil), ad soyad, telefon, belge no, ETTN; audit" '[ "$CODE" = 200 ] && [ "$(j .data.doc.tckn)" = "$TC_B" ] && [ "$(j .data.doc.sellerName)" = "Test Uye" ] && [ "$(j .data.doc.tel)" = "0555 111 22 02" ] && [ "$(j .data.doc.no)" = "$NO1" ] && [ "$(j .data.doc.ettn | wc -c)" = 37 ] && ! echo "$BODY" | grep -q "\*\*\*\*\*\*" && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''egp_view'\''")" = $((A1 + 1)) ]'
api "$J_CK" GET "admin/egp?q=$NO1" ""
chk "belge no ile bul" '[ "$(j .data.id)" = "$W1" ]'
api "$J_CK" POST "admin/withdrawals/$W1/egp" '{"desc":"Dijital oyun içi varlık tedariki (güncel)"}' -H "X-CSRF-Token: $CS_CK"
chk "açıklama güncelle: numara aynı" '[ "$CODE" = 200 ] && [ "$(j .data.withdrawal.egp.no)" = "$NO1" ] && [ "$(j .data.withdrawal.desc)" = "Dijital oyun içi varlık tedariki (güncel)" ]'
C0=$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UB#u}")
api "$J_B" POST withdrawals "{\"amount\":80,\"iban\":\"$IB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
WR="$(j .data.withdrawal.id)"
chk "talep: bakiye 80 düştü" '[ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UB#u}")" = $((C0 - 8000)) ]'
api "$J_CK" POST "admin/withdrawals/$WR/reject" '{"why":""}' -H "X-CSRF-Token: $CS_CK"
chk "gerekçesiz red → 422" '[ "$CODE" = 422 ]'
api "$J_CK" POST "admin/withdrawals/$WR/reject" '{"why":"IBAN hesap sahibi üyeyle eşleşmiyor"}' -H "X-CSRF-Token: $CS_CK"
chk "red: tutar iade (çekilebilir), ücret yok" '[ "$CODE" = 200 ] && [ "$(j .data.withdrawal.status)" = reddedildi ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UB#u}")" = "$C0" ]'
api "$J_CK" POST "admin/withdrawals/$WR/approve" '{}' -H "X-CSRF-Token: $CS_CK"
chk "reddedilen onaylanamaz → 409" '[ "$CODE" = 409 ]'
api "$J_B" GET me/withdrawals ""
chk "üye: red gerekçesi görünür" '[ "$(j ".data.wd[] | select(.id==\"$WR\") | .why")" = "IBAN hesap sahibi üyeyle eşleşmiyor" ] && ! echo "$BODY" | grep -qiE "$BANNED"'

echo "=== 9. Ayarlar: işlem ücreti, kesinti oranı ==="
api "$J_CK" PUT admin/settings/wdfee '{"on":true,"type":"sabit","val":5}' -H "X-CSRF-Token: $CS_CK"
chk "ücret: 5 TL sabit" '[ "$CODE" = 200 ] && [ "$(j .data.wdFee.val)" = 5 ]'
api "$J_CK" PUT admin/settings/egp '{"stopaj":2.5,"company":"YangPazar Test Ltd","seri":"tst"}' -H "X-CSRF-Token: $CS_CK"
chk "e-Gider: stopaj %2,5, seri TST" '[ "$(j .data.egp.stopaj)" = 2.5 ] && [ "$(j .data.egp.seri)" = TST ]'
api "$J_X" GET boot ""
chk "boot (ziyaretçi): wdFee açık, wdTax 2.5, e-Gider bilgisi yok" '[ "$(j .data.set.wdFee.on)" = true ] && [ "$(j .data.set.wdTax)" = 2.5 ] && ! echo "$BODY" | grep -qiE "$BANNED"'
api "$J_B" POST withdrawals "{\"amount\":100,\"iban\":\"$IB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
WF="$(j .data.withdrawal.id)"
chk "100 TL: ücret 5, kesinti 2,38, net 92,62 (wdBreakdown)" '[ "$(j .data.withdrawal.fee)" = 5 ] && [ "$(j .data.withdrawal.stopaj)" = 2.38 ] && [ "$(j .data.withdrawal.net)" = 92.62 ]'

echo "=== 10. Muhasebe kuyruğu: Paraşüt kapalıyken yeniden deneme ==="
api "$J_MU" PUT admin/integrations/parasut '{"values":{"company_id":"12345","client_id":"client_abcdef12","client_secret":"csec_abcdef7890XYZ","username":"muh@ornek.com","password":"ParasutSifre1"}}' -H "X-CSRF-Token: $CS_MU"
chk "Paraşüt kaydedildi, maskeli" '[ "$CODE" = 200 ] && [ "$(j .data.service.configured)" = true ] && [ "$(j .data.service.values.password)" = "••••" ] && ! echo "$BODY" | grep -q -e ParasutSifre1 -e csec_abcdef7890XYZ'
mock '{"nvi":"ok","acct":"down"}'
api "$J_CK" POST "admin/withdrawals/$WF/approve" '{}' -H "X-CSRF-Token: $CS_CK"
NOF="$(j .data.withdrawal.egp.no)"
chk "onay: TST serisi yeni yıl sırası 1, kuyrukta Paraşüt işi" '[ "$NOF" = "TST${YR}000000001" ] && [ "$(sq "SELECT COUNT(*) FROM yp_accounting_jobs WHERE ref_id='\''$WF'\'' AND service='\''parasut'\'' AND status='\''bekliyor'\''")" = 1 ]'
OUT=$(cron_run)
chk "cron (servis kapalı): iş başarısız, 1 deneme, yeniden denenecek" '[ "$(sq "SELECT status||'\''/'\''||tries FROM yp_accounting_jobs WHERE ref_id='\''$WF'\''")" = "bekliyor/1" ] && [ "$(sq "SELECT next_at>"$(nowms)" FROM yp_accounting_jobs WHERE ref_id='\''$WF'\''")" = 1 ] && sq "SELECT last_error FROM yp_accounting_jobs WHERE ref_id='\''$WF'\''" | grep -q "ulaşılamadı"'
api "$J_MU" GET admin/accounting/jobs ""
chk "kuyruk ekranı: bekliyor 1, son hata" '[ "$(j .data.counts.bekliyor)" = 1 ] && [ "$(j .data.jobs[0].tries)" = 1 ]'
mock '{"nvi":"ok","acct":"ok"}'
sq "UPDATE yp_accounting_jobs SET next_at=0" >/dev/null
OUT=$(cron_run)
chk "servis açıldı: cron gönderdi (tamam, 2. deneme), çekime sonuç yazıldı" '[ "$(sq "SELECT status||'\''/'\''||tries FROM yp_accounting_jobs WHERE ref_id='\''$WF'\''")" = "tamam/2" ] && [ "$(sq "SELECT json_extract(acct,'\''$.parasut.ok'\'') FROM yp_withdrawals WHERE id=${WF#w}")" = 1 ]'
api "$J_MU" POST admin/integrations/parasut/test '{}' -H "X-CSRF-Token: $CS_MU"
chk "Paraşüt bağlantı testi (sahte servis açık) → başarılı" '[ "$(j .data.ok)" = true ] && j .data.msg | grep -q "Paraşüt bağlantısı başarılı"'
mock '{"nvi":"ok","acct":"down"}'
api "$J_MU" POST admin/integrations/parasut/test '{}' -H "X-CSRF-Token: $CS_MU"
chk "Paraşüt bağlantı testi (kapalı) → Türkçe hata, saklandı" '[ "$(j .data.ok)" = false ] && j .data.msg | grep -q "ulaşılamadı" && [ "$(j .data.service.lastTest.ok)" = false ]'

echo "=== 11. Raporlar ve Excel (CSV) ==="
api "$J_MU" GET "admin/reports/daily" ""
chk "günlük rapor: IBAN'a gönderilen ve ücret sütunları" '[ "$CODE" = 200 ] && [ "$(j ".data.rows | length")" -ge 1 ] && [ "$(j ".data.total[\"BANK:OUT\"]")" = "$(sq "SELECT SUM(net)/100.0 FROM yp_withdrawals WHERE status='\''onaylandı'\''" | sed "s/\.0$//")" ]'
api "$J_MU" GET "admin/reports/monthly?year=$YR" ""
chk "aylık rapor" '[ "$CODE" = 200 ] && [ "$(j ".data.rows | length")" -ge 1 ]'
curl -s -b "$J_MU" -D "$RUN/csv.h" -o "$RUN/cekim.csv" "$(url "admin/reports/export?type=withdrawals")"
chk "CSV: BOM + sep=; + Türkçe başlık, ek dosya, TC yalnız pusulalı satırda" 'head -c 3 "$RUN/cekim.csv" | od -An -tx1 | grep -q "ef bb bf" && grep -q "T.C. Kimlik No" "$RUN/cekim.csv" && grep -qi "content-disposition: attachment" "$RUN/csv.h" && grep -q "$TC_B" "$RUN/cekim.csv" && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''export_withdrawals'\''")" = 1 ]'
curl -s -b "$J_MU" -o "$RUN/defter.csv" "$(url "admin/reports/export?type=journal")"
chk "defter CSV: cekim_odendi satırları, Türkçe karakter (UTF-8)" 'grep -q "cekim_odendi" "$RUN/defter.csv" && grep -q "Para çekme talebi\|Ziraat Bankası" "$RUN/defter.csv"'

echo "=== 12. Entegrasyonlar: PayTR maskeli, boş/maskeli gizli alan korunur, bağlantı testi ==="
api "$J_OD" GET admin/integrations ""
chk "[odeme] Entegrasyonlar: PayTR maskeli, bildirim adresi" '[ "$CODE" = 200 ] && [ "$(j ".data.services[] | select(.id==\"paytr\") | .values.merchant_key")" = "••••••90" ] && [ "$(j .data.urls.paytrNotify)" = "http://127.0.0.1:$PORT/api/paytr_bildirim.php" ] && ! echo "$BODY" | grep -q -e "$KEY" -e "$SALT" -e ParasutSifre1'
api "$J_OD" PUT admin/integrations/paytr "{\"values\":{\"merchant_id\":\"$MID\",\"merchant_key\":\"$KEY\",\"merchant_salt\":\"$SALT\",\"test_mode\":true,\"max_installment\":0}}" -H "X-CSRF-Token: $CS_OD"
chk "PayTR kaydedildi" '[ "$CODE" = 200 ] && [ "$(j .data.service.configured)" = true ]'
api "$J_OD" PUT admin/integrations/paytr '{"values":{"merchant_id":"12****","merchant_key":"","merchant_salt":"••••••zz","max_installment":6}}' -H "X-CSRF-Token: $CS_OD"
chk "boş/maskeli gizli alanlar eski değeri korudu" '[ "$CODE" = 200 ] && [ "$(j ".data.service.values.merchant_key")" = "••••••90" ] && [ "$(j ".data.service.values.max_installment")" = 6 ]'
chk "veritabanında düz metin sır yok" '[ "$(sq "SELECT COUNT(*) FROM yp_settings WHERE v LIKE '\''%$KEY%'\'' OR v LIKE '\''%$SALT%'\'' OR v LIKE '\''%ParasutSifre1%'\''")" = 0 ]'
api "$J_OD" PUT admin/integrations/paytr '{"values":{"merchant_id":"abc"}}' -H "X-CSRF-Token: $CS_OD"
chk "geçersiz Mağaza No → 422 alan hatası" '[ "$CODE" = 422 ] && [ "$(j .fields.merchant_id)" != null ]'
mock '{"paytr":"ok"}'
api "$J_OD" POST admin/integrations/paytr/test '{}' -H "X-CSRF-Token: $CS_OD"
chk "PayTR bağlantı testi → başarılı (test modu uyarısı)" '[ "$(j .data.ok)" = true ] && j .data.msg | grep -q "TEST modundasınız"'
api "$J_OD" PUT admin/integrations/etbis '{"on":true,"url":"https://etbis.eticaret.gov.tr/sitedogrulama/123","code":"ETB-1","date":"2026-11-01"}' -H "X-CSRF-Token: $CS_OD"
chk "ETBİS kaydedildi, boot'ta görünür" '[ "$CODE" = 200 ] && [ "$(j .data.etbis.on)" = true ] && api "$J_X" GET boot "" && [ "$(j .data.set.etbis.code)" = ETB-1 ]'

echo "=== 13. PayTR bildirimi (aynı adres, ince kabuk) ve eski api/ kiti kapalı ==="
rl_reset
api "$J_C" POST deposits/paytr '{"gw":"paytr_eft","amount":100}' -H "X-CSRF-Token: $CS_C" -H "Idempotency-Key: $(ik)"
OID="$(j .data.oid)"
hsh() { printf '%s' "$1$SALT$2$3" | openssl dgst -sha256 -hmac "$KEY" -binary | base64; }
cb() { curl -s -X POST "$B/api/paytr_bildirim.php" --data-urlencode "merchant_oid=$1" --data-urlencode "status=$2" --data-urlencode "total_amount=$3" \
  --data-urlencode "hash=$4" --data-urlencode "payment_amount=${5:-$3}" --data-urlencode "test_mode=1"; }
C0=$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UC#u}")
OUT=$(cb "$OID" success 10000 "yanlis==")
chk "bildirim: yanlış hash → reddedildi" '[ "$OUT" = "PAYTR notification failed: bad hash" ]'
OUT=$(cb "$OID" success 10000 "$(hsh "$OID" success 10000)")
chk "bildirim: doğru hash → OK, PayTR EFT çekilebilir +100 (korunan anahtarla)" '[ "$OUT" = OK ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UC#u}")" = $((C0 + 10000)) ]'
OUT=$(cb "$OID" success 10000 "$(hsh "$OID" success 10000)")
chk "bildirim tekrarı → OK, ikinci yükleme yok" '[ "$OUT" = OK ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UC#u}")" = $((C0 + 10000)) ]'
OUT=$(curl -s "$B/api/paytr_bildirim.php")
chk "bildirim: GET → 405 metin" 'echo "$OUT" | grep -q "method not allowed"'
for f in ayarlar.php giris.php cikis.php kurulum.php test.php cekim_onayla.php paytr_hakedis.php paytr_token.php; do
  OUT=$(curl -s -w '\n%{http_code}' -X POST -H 'Content-Type: application/json' --data '{"password":"x","tutar":10}' "$B/api/$f"); CODE="${OUT##*$'\n'}"; BODY="${OUT%$'\n'*}"
  chk "eski api/$f → 404 moved (Entegrasyonlar)" '[ "$CODE" = 404 ] && [ "$(j .code)" = moved ] && j .error | grep -q "Yönetim"'
done
OUT=$(curl -s "$B/api/durum.php")
chk "api/durum.php: sağlık bilgisi, sır/oturum yok" 'echo "$OUT" | jq -e ".ok==true and .installed==true and (.services==null) and (.logged_in==null)" >/dev/null'
chk "eski kit hiçbir kayıt açmadı (paytr_token)" '[ ! -f "$RUN/api/data/odemeler.json" ] || ! grep -q YPTEST "$RUN/api/data/odemeler.json"'

echo "=== 14. Üye tarafı tarama: gider / pusula / VUK / ETTN yok ==="
LEAK=0
for p in boot me/withdrawals me/tx "me/deposits" "poll?n=0"; do api "$J_B" GET "$p" ""; if echo "$BODY" | grep -qiE "$BANNED"; then LEAK=1; echo "      sızıntı: $p"; fi; done
chk "üye API yanıtlarında (boot, çekimler, hareketler, bildirimler) yasak ifade yok" '[ "$LEAK" = 0 ]'
chk "üye bildirim e-postaları/SMS'lerinde yasak ifade yok" '[ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE user_id=${UB#u} AND (subject LIKE '\''%gider%'\'' OR body LIKE '\''%gider%'\'' OR body LIKE '\''%pusula%'\'' OR body LIKE '\''%ETTN%'\'' OR body LIKE '\''%VUK%'\'')")" = 0 ]'
api "$J_ADM" POST admin/money/check '{}' -H "X-CSRF-Token: $CS_ADM"
chk "defter tutarlılık denetimi (PAYABLE:WD dahil): tutarlı" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ]'
chk "tüm postings toplamı 0" '[ "$(sq "SELECT COALESCE(SUM(amount),0) FROM yp_postings")" = 0 ]'
chk "sunucu günlüğünde PHP hatası yok" '! grep -qiE "PHP (Fatal|Warning|Parse|Notice|Deprecated)" "$SLOG"'
ERRL=$(grep -h '\[hata\]' "$RUN"/storage/log/*.log 2>/dev/null | head -5)
chk "uygulama günlüğünde [hata] yok" '[ -z "$ERRL" ]' ; [ -n "$ERRL" ] && echo "$ERRL"

echo
echo "SONUÇ (P3 HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
