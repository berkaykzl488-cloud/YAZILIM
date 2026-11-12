#!/usr/bin/env bash
# P2 uçtan uca HTTP testleri (para çekirdeği). php -S (4 işçi) + tests/http/router.php, SQLite dosya veritabanı.
# Canlıdaki yükseltme senaryosu: P0b sürümü ($P0B_REF) sihirbazla kurulur → P1 kodu ($P1_REF) üzerine kopyalanır (ilk istek
# katalog tablolarını ekler) → P2 kodu (çalışma ağacı) üzerine kopyalanır (ilk istek para tablolarını ekler).
# Tüm istekler rewrite'sız /api/v1/index.php?r=<yol> biçiminde. PayTR önce AYARSIZ (yalnız havale + yönetici onayı ile tam
# havuz akışı), sonra api/ paketi kurulup Entegrasyonlar ayarları girilir; token sahte (YP_TEST_PAYTR=fake), bildirim gerçek hash'le.
# Kullanım: bash tests/http/p2.sh      (gerekenler: php 8.1+ gd sqlite, curl, jq, git, openssl)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((22000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p2-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
P0B_REF="${P0B_REF:-56f5c9c}"
P1_REF="${P1_REF:-d49e772}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$P0B_REF^{commit}" 2>/dev/null && git -C "$REPO" cat-file -e "$P1_REF^{commit}" 2>/dev/null; then
  git -C "$REPO" archive "$P0B_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: $P0B_REF/$P1_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
  cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$RUN/"
  cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"; cp "$REPO/uploads/.htaccess" "$REPO/uploads/index.php" "$RUN/uploads/"
fi
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"

YP_TEST=1 YP_TEST_PAYTR=fake PHP_CLI_SERVER_WORKERS=4 php -d display_errors=0 -d log_errors=1 -d upload_max_filesize=32M -d post_max_size=40M \
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
up() {
  local out; out=$(curl -s -b "$1" -c "$1" -X POST -H "X-CSRF-Token: $2" -F "file=@$3" -F "kind=${4:-listing}" -w '\n%{http_code}' "$(url media)")
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
wjobs() { local p; for p in "${PIDS[@]}"; do wait "$p"; done; PIDS=(); }   # yalnız istek süreçlerini bekle (php -S'yi değil)
ik() { echo "k$(date +%s%N)$RANDOM"; }
nowms() { echo $(( $(date +%s%N) / 1000000 )); }
cron_at() { YP_TEST=1 YP_TEST_NOW="$1" php "$RUN/app/cron.php" 2>&1; }
wal() { sq "SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=${1#u}"; }

J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_B="$RUN/b.jar"; J_C="$RUN/c.jar"; J_ADM="$RUN/adm.jar"; J_IL="$RUN/il.jar"; J_OD="$RUN/od.jar"; J_X="$RUN/x.jar"; J_API="$RUN/api.jar"

echo "=== 1. Kurulum (P0b $P0B_REF) → P1 ($P1_REF) → P2 yükseltmesi ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang P2" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
if [ "$UPGRADE" = 1 ]; then
  rm -rf "$RUN/app"; git -C "$REPO" archive "$P1_REF" app api | tar -x -C "$RUN"
  sleep 3
  api "$J_X" GET boot ""
  chk "P1 sürümü: katalog tabloları geldi, para tabloları yok" '[ "$CODE" = 200 ] && [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_listings'\''")" ] && [ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_orders'\''")" ]'
  echo "--- P2 paketi üzerine kopyalanır ---"
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 3
fi
api "$J_X" GET boot ""
chk "ilk istek: para tabloları + varsayılan yöntemler" '[ "$CODE" = 200 ] && [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_journal'\''")" ] && [ "$(sq "SELECT COUNT(*) FROM yp_gateways")" = 4 ]'
chk "P1 verisi korundu (283 server), göç kaydı" '[ "$(j ".data.servers | length")" = 283 ] && [ -n "$(sq "SELECT version FROM yp_schema_migrations WHERE version='\''m:0003_money_seed'\''")" ]'
chk "boot: PayTR ayarsız → paytr/paytr_eft on:false soon:true, havale açık" '[ "$(j ".data.gws[] | select(.id==\"paytr\") | .on")" = false ] && [ "$(j ".data.gws[] | select(.id==\"paytr\") | .soon")" = true ] && [ "$(j ".data.gws[] | select(.id==\"paytr_eft\") | .on")" = false ] && [ "$(j ".data.gws[] | select(.id==\"havale\") | .on")" = true ]'
chk "boot: dopings + vip + banks + cryptoNets" '[ "$(j .data.dopings.vitrin.pd)" = 7 ] && [ "$(j ".data.vip | length")" = 4 ] && [ "$(j ".data.banks | type")" = array ] && [ "$(j ".data.cryptoNets | type")" = array ]'

echo "=== 2. Üyeler, yönetici, çalışanlar ==="
reg() { local jar="$1" name="$2" mail="$3" tel="$4"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\"}" -H "X-CSRF-Token: $cs"; }
reg "$J_A" Satici_A a@ornek.com "0555 111 22 01"; CS_A="$(j .data.csrf)"; UA="$(j .data.me.id)"
reg "$J_B" Alici_B b@ornek.com "0555 111 22 02"; CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
reg "$J_C" Alici_C c@ornek.com "0555 111 22 03"; CS_C="$(j .data.csrf)"; UC="$(j .data.me.id)"
chk "A, B, C kayıtlı" '[ "$UA" != null ] && [ "$UB" != null ] && [ "$UC" != null ] && [ -n "$UC" ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
chk "yönetici girişi" '[ "$(j .data.me.admin)" = true ]'
api "$J_ADM" POST admin/staff '{"name":"IlanCalisan","email":"il@yangpazar.com","ad":"Ilan","soyad":"Ci","password":"Calisan-Sifre-1","perms":["ilan"]}' -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/staff '{"name":"OdemeCalisan","email":"od@yangpazar.com","ad":"Odeme","soyad":"Ci","password":"Calisan-Sifre-2","perms":["odeme"]}' -H "X-CSRF-Token: $CS_ADM"
CS_IL=$(csrf_of "$J_IL"); api "$J_IL" POST auth/login '{"login":"IlanCalisan","password":"Calisan-Sifre-1"}' -H "X-CSRF-Token: $CS_IL"; CS_IL="$(j .data.csrf)"
CS_OD=$(csrf_of "$J_OD"); api "$J_OD" POST auth/login '{"login":"OdemeCalisan","password":"Calisan-Sifre-2"}' -H "X-CSRF-Token: $CS_OD"; CS_OD="$(j .data.csrf)"
chk "çalışanlar: [ilan] ve [odeme]" '[ "$(j .data.me.perms[0])" = odeme ]'

echo "=== 3. Yetki matrisi: [ilan] çalışanı para uçlarına giremez ==="
for spec in "GET admin/deposits" "POST admin/deposits/d1/approve" "POST admin/deposits/d1/reject" "POST admin/balance" "GET admin/coupons" "POST admin/coupons" \
            "PUT admin/gateways" "POST admin/gateways/paytr/toggle" "POST admin/banks" "DELETE admin/banks/bk1" "POST admin/crypto-nets" "GET admin/orders" \
            "POST admin/orders/S100001/resolve" "GET admin/ledger" "GET admin/money/summary"; do
  m="${spec%% *}"; p="${spec#* }"
  if [ "$m" = GET ]; then api "$J_IL" GET "$p" ""; else api "$J_IL" "$m" "$p" '{}' -H "X-CSRF-Token: $CS_IL"; fi
  chk "[ilan] → 403: $spec" '[ "$CODE" = 403 ]'
done
api "$J_OD" POST admin/balance '{"user":"Alici_B","amount":10,"note":"deneme"}' -H "X-CSRF-Token: $CS_OD"
chk "[odeme] çalışanı bakiye düzeltemez → 403" '[ "$CODE" = 403 ]'
api "$J_B" GET admin/deposits ""
chk "üye → 403 (yönetim)" '[ "$CODE" = 403 ]'
api "$J_X" POST orders '{}' -H "Idempotency-Key: $(ik)"
chk "ziyaretçi satın alamaz → 401/403" '[ "$CODE" = 401 ] || [ "$CODE" = 403 ]'

echo "=== 4. PayTR AYARSIZ: kart 'yakında'; yönetim havale hesabı, kripto ağı, kupon ==="
api "$J_B" POST deposits/paytr '{"gw":"paytr","amount":100}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "deposits/paytr → 400 paytr_off 'Kart ile ödeme yakında'" '[ "$CODE" = 400 ] && [ "$(j .code)" = paytr_off ] && j .error | grep -q "^Kart ile ödeme yakında"'
api "$J_OD" POST admin/banks '{"b":"Ziraat Bankası","n":"YangPazar Bilişim Ltd. Şti.","i":"TR00 0001 0000 0000 0000 0000 01"}' -H "X-CSRF-Token: $CS_OD"
chk "[odeme] havale hesabı ekler" '[ "$CODE" = 200 ] && [ "$(j .patch.replace.banks[0].id)" = bk1 ] && [ "$(j .patch.replace.banks[0].b)" = "Ziraat Bankası" ]'
api "$J_OD" POST admin/crypto-nets '{"coin":"usdt","net":"TRC20 (Tron)","addr":"TDemoCuzdanAdresi00001","note":"Komisyonsuz"}' -H "X-CSRF-Token: $CS_OD"
chk "[odeme] kripto ağı ekler" '[ "$(j .patch.replace.cryptoNets[0].coin)" = USDT ] && [ "$(j .patch.replace.cryptoNets[0].on)" = true ]'
api "$J_OD" POST admin/gateways/paytr/toggle '{}' -H "X-CSRF-Token: $CS_OD"
chk "PayTR kapat/aç: ayarsızken uyarı" '[ "$CODE" = 200 ]'
api "$J_OD" POST admin/gateways/paytr/toggle '{}' -H "X-CSRF-Token: $CS_OD"
chk "PayTR yeniden açık ama ayar yok → üyeye kapalı" '[ "$(j ".data.gws[] | select(.id==\"paytr\") | .setOn")" = true ] && [ "$(j ".data.gws[] | select(.id==\"paytr\") | .on")" = false ] && j .msg | grep -q Entegrasyonlar'
api "$J_OD" PUT admin/gateways '{"gws":[{"id":"paytr","fee":2.5}]}' -H "X-CSRF-Token: $CS_OD"
chk "hizmet bedeli %2,5 kaydedildi" '[ "$(j ".data.gws[] | select(.id==\"paytr\") | .fee")" = 2.5 ] && [ "$(sq "SELECT fee_bp FROM yp_gateways WHERE id='\''paytr'\''")" = 250 ]'
api "$J_ADM" POST admin/coupons '{"code":"hosgeldin","pct":5,"max":50}' -H "X-CSRF-Token: $CS_ADM"
chk "kupon eklendi (HOSGELDIN %5, en çok 50)" '[ "$(j .patch.replace.coupons[0].code)" = HOSGELDIN ] && [ "$(j .patch.replace.coupons[0].id)" = cp1 ]'
api "$J_ADM" POST admin/coupons '{"code":"HOSGELDIN","pct":5,"max":50}' -H "X-CSRF-Token: $CS_ADM"
chk "aynı kod → 422" '[ "$CODE" = 422 ]'
api "$J_B" GET "coupons/check?code=HOSGELDIN&amount=1000" ""
chk "kupon önizleme: 1000 TL → 50 TL bonus" '[ "$(j .data.ok)" = true ] && [ "$(j .data.bonus)" = 50 ]'

echo "=== 5. Elle havale bildirimi → [odeme] onayı (çekilebilir) / ret; kupon tek kullanım ==="
TXAT=$(nowms)
api "$J_B" POST deposits/manual "{\"gw\":\"havale\",\"amount\":1000,\"txAt\":$TXAT,\"toBank\":\"Ziraat Bankası\",\"note\":\"Test Uye · Ziraat\",\"coupon\":\"HOSGELDIN\"}" -H "X-CSRF-Token: $CS_B"
chk "Idempotency-Key olmadan → 400" '[ "$CODE" = 400 ] && [ "$(j .code)" = idem_key ]'
KEY=$(ik)
api "$J_B" POST deposits/manual "{\"gw\":\"havale\",\"amount\":1000,\"txAt\":$TXAT,\"toBank\":\"Ziraat Bankası\",\"note\":\"Test Uye · Ziraat\",\"coupon\":\"HOSGELDIN\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
D1="$(j .data.deposit.id)"
chk "bildirim alındı: bekliyor, 1000 + 50 bonus, çekilebilir" '[ "$CODE" = 200 ] && [ "$(j .data.deposit.status)" = bekliyor ] && [ "$(j .data.deposit.amount)" = 1000 ] && [ "$(j .data.deposit.bonus)" = 50 ] && [ "$(j .data.deposit.w)" = true ] && [ "$(wal $UB)" = "0/0" ]'
api "$J_B" POST deposits/manual "{\"gw\":\"havale\",\"amount\":1000,\"txAt\":$TXAT,\"toBank\":\"Ziraat Bankası\",\"coupon\":\"HOSGELDIN\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
chk "aynı anahtar → aynı bildirim (ikinci kayıt yok)" '[ "$(j .data.deposit.id)" = "$D1" ] && [ "$(sq "SELECT COUNT(*) FROM yp_deposits")" = 1 ]'
api "$J_B" POST deposits/manual "{\"gw\":\"havale\",\"amount\":100,\"txAt\":$TXAT,\"toBank\":\"Ziraat Bankası\",\"coupon\":\"HOSGELDIN\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "kupon bekleyen bildirimde kullanılıyor → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.coupon)" != null ]'
api "$J_C" GET "deposits/$D1" ""
chk "başkasının yüklemesi görünmez → 404" '[ "$CODE" = 404 ]'
api "$J_OD" GET "admin/deposits?status=bekliyor" ""
chk "[odeme] kuyruk: 1 bekleyen, S.deps şekli" '[ "$(j .data.pending)" = 1 ] && [ "$(j .data.deps[0].id)" = "$D1" ] && [ "$(j .data.deps[0].toBank)" = "Ziraat Bankası" ] && [ "$(j .data.deps[0].u)" = "$UB" ]'
api "$J_OD" POST "admin/deposits/$D1/approve" '{}' -H "X-CSRF-Token: $CS_OD"
chk "onay: B 1000 çekilebilir + 50 alışveriş" '[ "$CODE" = 200 ] && [ "$(j .data.deposit.status)" = onaylandı ] && [ "$(wal $UB)" = "100000/5000" ]'
api "$J_OD" POST "admin/deposits/$D1/approve" '{}' -H "X-CSRF-Token: $CS_OD"
chk "ikinci onay → 409, çift yükleme yok" '[ "$CODE" = 409 ] && [ "$(wal $UB)" = "100000/5000" ]'
api "$J_B" POST deposits/manual "{\"gw\":\"havale\",\"amount\":100,\"txAt\":$TXAT,\"toBank\":\"Ziraat Bankası\",\"coupon\":\"HOSGELDIN\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "kupon tek kullanım: tekrar → 422 'daha önce kullandınız'" '[ "$CODE" = 422 ] && j .fields.coupon | grep -q "daha önce"'
api "$J_C" POST deposits/manual "{\"gw\":\"havale\",\"amount\":300,\"txAt\":$TXAT,\"toBank\":\"Ziraat Bankası\",\"coupon\":\"HOSGELDIN\"}" -H "X-CSRF-Token: $CS_C" -H "Idempotency-Key: $(ik)"
D2="$(j .data.deposit.id)"
api "$J_OD" POST "admin/deposits/$D2/reject" '{"reason":"Dekont bulunamadı"}' -H "X-CSRF-Token: $CS_OD"
chk "ret: C bakiyesi yok, kupon serbest" '[ "$(j .data.deposit.status)" = reddedildi ] && [ "$(wal $UC)" = "0/0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_coupon_uses WHERE user_id=${UC#u}")" = 0 ]'
api "$J_C" POST deposits/manual "{\"gw\":\"kripto\",\"amount\":200,\"txAt\":$TXAT,\"net\":\"cn1\",\"txid\":\"0xabc123def456\",\"coupon\":\"HOSGELDIN\"}" -H "X-CSRF-Token: $CS_C" -H "Idempotency-Key: $(ik)"
D3="$(j .data.deposit.id)"
api "$J_OD" POST "admin/deposits/$D3/approve" '{}' -H "X-CSRF-Token: $CS_OD"
chk "kripto onayı: yalnız alışveriş (200 + 10 bonus), çekilemez" '[ "$(wal $UC)" = "0/21000" ] && [ "$(j .data.deposit.w)" = false ]'

echo "=== 6. Tam havuz akışı (yalnız havale ile yüklenmiş bakiye): satın al → hazır → kanıtla teslim → onay ==="
php -r '$d=$argv[1]; $mk=function($w,$h,$c){ $i=imagecreatetruecolor($w,$h); imagefill($i,0,0,imagecolorallocate($i,$c[0],$c[1],$c[2])); return $i; };
imagepng($mk(320,240,[200,30,30]),"$d/pre.png"); imagepng($mk(320,240,[30,200,30]),"$d/post.png"); imagepng($mk(200,200,[30,30,200]),"$d/disp.png");' "$RUN"
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"item","title":"+9 Kırmızı Ejderha Kalkanı","price":120,"stock":1,"del":"15 dk"}' -H "X-CSRF-Token: $CS_A"
L1="$(j .data.listing.id)"
chk "A ilan açtı" '[ "$CODE" = 200 ] && [ -n "$L1" ] && [ "$L1" != null ]'
api "$J_B" POST orders "{\"listing\":\"$L1\",\"qty\":1,\"info\":\"KarakterB\",\"ch\":\"2\",\"place\":\"Pazar alanı depocu\"}" -H "X-CSRF-Token: $CS_B"
chk "Idempotency-Key olmadan satın alma → 400" '[ "$CODE" = 400 ]'
KEY=$(ik)
api "$J_B" POST orders "{\"listing\":\"$L1\",\"qty\":1,\"info\":\"KarakterB\",\"ch\":\"2\",\"place\":\"Pazar alanı depocu\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
O1="$(j .data.order.id)"
chk "sipariş: odendi, havuz 120, önce kredi 50 + nakit 70" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = odendi ] && [ "$(j .data.order.total)" = 120 ] && [ "$(j .data.order.paid.nw)" = 50 ] && [ "$(j .data.order.paid.w)" = 70 ] && [ "$(wal $UB)" = "93000/0" ]'
chk "yanıt patch: orders + listings (satildi) + me (bal 930)" '[ "$(j .patch.upsert.orders[0].id)" = "$O1" ] && [ "$(j .patch.upsert.listings[0].status)" = satildi ] && [ "$(j .patch.me.bal)" = 930 ] && [ "$(j .data.order.rate)" = 8 ]'
chk "S.orders: log, chat, buyer/seller, lateAt" '[ "$(j ".data.order.log | length")" = 2 ] && [ "$(j .data.order.buyer)" = "$UB" ] && [ "$(j .data.order.seller)" = "$UA" ] && [ "$(j .data.order.lateAt)" -gt 0 ]'
api "$J_B" POST orders "{\"listing\":\"$L1\",\"qty\":1,\"info\":\"KarakterB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $KEY"
chk "aynı anahtar → aynı sipariş, ikinci ödeme yok" '[ "$(j .data.order.id)" = "$O1" ] && [ "$(j .replayed)" = true ] && [ "$(sq "SELECT COUNT(*) FROM yp_orders")" = 1 ] && [ "$(wal $UB)" = "93000/0" ]'
api "$J_C" GET "orders/$O1" ""
chk "üçüncü kişi siparişi göremez → 403" '[ "$CODE" = 403 ]'
api "$J_C" POST "orders/$O1/confirm" '{}' -H "X-CSRF-Token: $CS_C"
chk "üçüncü kişi onaylayamaz → 403" '[ "$CODE" = 403 ]'
api "$J_B" POST "orders/$O1/confirm" '{}' -H "X-CSRF-Token: $CS_B"
chk "teslimden önce onay → 409" '[ "$CODE" = 409 ]'
api "$J_A" POST "orders/$O1/ready" '{}' -H "X-CSRF-Token: $CS_A"
chk "satıcı: teslime hazır" '[ "$CODE" = 200 ] && [ "$(j .data.order.ready)" -gt 0 ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB#u} AND ev='\''ready'\''")" = 1 ]'
api "$J_A" POST "orders/$O1/deliver" '{"dpre":[],"dpost":[]}' -H "X-CSRF-Token: $CS_A"
chk "kanıtsız teslim → 422" '[ "$CODE" = 422 ]'
up "$J_A" "$CS_A" "$RUN/pre.png" proof; MP="$(j .data.media.id)"
up "$J_A" "$CS_A" "$RUN/post.png" proof; MQ="$(j .data.media.id)"
chk "kanıtlar yüklendi (özel medya)" '[ "$(j .data.media.vis)" = private ] && [ -n "$MP" ] && [ "$MP" != null ]'
api "$J_A" POST "orders/$O1/deliver" "{\"dpre\":[\"$MP\"],\"dpost\":[\"$MQ\"],\"note\":\"Köy 1 de ticaretle verildi\"}" -H "X-CSRF-Token: $CS_A"
chk "teslim: durum teslim, kanıtlar satıcıya görünür" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = teslim ] && [ "$(j ".data.order.dpre | length")" = 1 ] && [ "$(j .data.order.chat[0].x)" = "Köy 1 de ticaretle verildi" ] && [ "$(j .data.order.acAt)" -gt 0 ]'
PURL="$(j .data.order.dpre[0])"
api "$J_B" GET "orders/$O1" ""
chk "alıcı teslim kanıtlarını göremez" '[ "$CODE" = 200 ] && [ "$(j .data.order.dpre)" = null ] && [ "$(j .data.order.status)" = teslim ]'
OUT=$(curl -s -o /dev/null -w '%{http_code}' -b "$J_B" "$(url "media/$MP")")
chk "alıcı kanıt dosyasını açamaz → 403" '[ "$OUT" = 403 ]'
OUT=$(curl -s -o /dev/null -w '%{http_code}' -b "$J_A" "$(url "media/$MP")")
chk "satıcı kendi kanıtını açar → 200" '[ "$OUT" = 200 ]'
api "$J_ADM" GET "orders/$O1" ""
chk "yönetici kanıtları görür + taraf adları" '[ "$(j ".data.order.dproof | length")" = 2 ] && [ "$(j ".data.users[0].ad")" = Test ]'
api "$J_B" POST "orders/$O1/messages" '{"x":"Aldım, teşekkürler. wp: 0555 999 88 77"}' -H "X-CSRF-Token: $CS_B"
chk "sipariş mesajı sansürlü + flagged" '[ "$(j .data.flagged)" = true ] && j ".data.order.chat[-1].x" | grep -q "gizlendi" && [ "$(sq "SELECT COUNT(*) FROM yp_flagged")" -ge 1 ]'
api "$J_B" POST "orders/$O1/confirm" '{"stars":5}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "onay: tamam, satıcıya net 110,40 nakit (komisyon 9,60)" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = tamam ] && [ "$(j .data.order.fee)" = 9.6 ] && [ "$(j .data.order.net)" = 110.4 ] && [ "$(wal $UA)" = "11040/0" ]'
chk "alıcı 60 puan, satıcı 1 satış" '[ "$(sq "SELECT pts FROM yp_users WHERE id=${UB#u}")" = 60 ] && [ "$(sq "SELECT sales FROM yp_users WHERE id=${UA#u}")" = 1 ]'
api "$J_B" POST "orders/$O1/confirm" '{"stars":5}' -H "X-CSRF-Token: $CS_B"
chk "ikinci onay → 409, çift ödeme yok" '[ "$CODE" = 409 ] && [ "$(wal $UA)" = "11040/0" ]'
api "$J_A" GET me/tx ""
chk "satıcının hareketi (S.tx)" '[ "$(j .data.tx[0].a)" = 110.4 ] && j .data.tx[0].l | grep -q "komisyon %8"'
api "$J_ADM" GET admin/money/summary ""
chk "muhasebe: komisyon geliri 9,6, havuz 0" '[ "$(j .data.rev.commission)" = 9.6 ] && [ "$(j .data.escrow)" = 0 ]'
api "$J_ADM" GET "admin/ledger?k=satis" ""
chk "S.ledger satis satırı" '[ "$(j .data.ledger[0].k)" = satis ] && [ "$(j .data.ledger[0].a)" = 120 ] && [ "$(j .data.ledger[0].fee)" = 9.6 ] && [ "$(j .data.ledger[0].ref)" = "$O1" ]'

echo "=== 7. Eşzamanlılık: stok=1 ilana 20 paralel satın alma → tam 1 sipariş ==="
rl_reset
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"yang","title":"Tek stok yang 100M","price":10,"stock":1}' -H "X-CSRF-Token: $CS_A"
L2="$(j .data.listing.id)"
for i in $(seq 1 20); do
  curl -s -b "$J_B" -X POST -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: par$i-$(ik)" -H 'Content-Type: application/json' \
    --data "{\"listing\":\"$L2\",\"info\":\"KarB\"}" -o "$RUN/par$i.json" "$(url orders)" & PIDS+=($!)
done
wjobs
NOK=$(cat "$RUN"/par*.json | jq -s '[.[] | select(.ok==true)] | length')
NSOLD=$(cat "$RUN"/par*.json | jq -s '[.[] | select(.code=="sold_out")] | length')
chk "20 paralel: 1 başarılı, 19 'satışta değil'" '[ "$NOK" = 1 ] && [ "$NSOLD" = 19 ]'
chk "veritabanı: ilan başına 1 sipariş, stok 0, B'den yalnız 10 TL" '[ "$(sq "SELECT COUNT(*) FROM yp_orders WHERE listing_id=${L2#l}")" = 1 ] && [ "$(sq "SELECT stock FROM yp_listings WHERE id=${L2#l}")" = 0 ] && [ "$(wal $UB)" = "92000/0" ]'

echo "=== 8. Eşzamanlılık: bakiyeyi aşan 20 paralel satın alma → bakiye asla eksiye düşmez ==="
rl_reset
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"item","title":"Çok stoklu iksir","price":10,"stock":50}' -H "X-CSRF-Token: $CS_A"
L3="$(j .data.listing.id)"
for i in $(seq 1 20); do
  curl -s -b "$J_C" -X POST -H "X-CSRF-Token: $CS_C" -H "Idempotency-Key: ovr$i-$(ik)" -H 'Content-Type: application/json' \
    --data "{\"listing\":\"$L3\",\"info\":\"KarC\"}" -o "$RUN/ovr$i.json" "$(url orders)" & PIDS+=($!)
done
wjobs
NOK=$(cat "$RUN"/ovr*.json | jq -s '[.[] | select(.ok==true)] | length')
NINS=$(cat "$RUN"/ovr*.json | jq -s '[.[] | select(.code=="insufficient")] | length')
chk "C 210 TL alışveriş bakiyesi: 20 paralel × 10 TL → 20 başarılı, kayıp/çift kesinti yok" '[ "$NOK" = 20 ] && [ "$NINS" = 0 ]'
chk "C cüzdanı: 210 − 200 = 10 TL, eksi yok" '[ "$(wal $UC)" = "0/1000" ] && [ "$(sq "SELECT COUNT(*) FROM yp_orders WHERE buyer_id=${UC#u}")" = "$NOK" ]'
for i in $(seq 1 6); do
  curl -s -b "$J_C" -X POST -H "X-CSRF-Token: $CS_C" -H "Idempotency-Key: ov2$i-$(ik)" -H 'Content-Type: application/json' \
    --data "{\"listing\":\"$L3\",\"info\":\"KarC\",\"qty\":1}" -o "$RUN/ov2$i.json" "$(url orders)" & PIDS+=($!)
done
wjobs
NOK2=$(cat "$RUN"/ov2*.json | jq -s '[.[] | select(.ok==true)] | length')
NINS2=$(cat "$RUN"/ov2*.json | jq -s '[.[] | select(.code=="insufficient")] | length')
chk "kalan 10 TL ile 6 paralel → tam 1 başarılı, 5 'bakiye yetersiz'" '[ "$NOK2" = 1 ] && [ "$NINS2" = 5 ] && [ "$(wal $UC)" = "0/0" ]'
chk "hiçbir cüzdan eksi değil" '[ "$(sq "SELECT COUNT(*) FROM yp_wallets WHERE cash<0 OR credit<0")" = 0 ]'

echo "=== 9. İtiraz → yönetim iki yönde karar; teslim garantisi ==="
rl_reset
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"item","title":"İtirazlık kılıç","price":50,"stock":5,"del":"Anında"}' -H "X-CSRF-Token: $CS_A"
L4="$(j .data.listing.id)"
buy() { api "$J_B" POST orders "{\"listing\":\"$L4\",\"info\":\"KarB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"; j .data.order.id; }
O2=$(buy); O3=$(buy); O4=$(buy)
W0=$(wal $UB)
up "$J_B" "$CS_B" "$RUN/disp.png" dispute; MD="$(j .data.media.id)"
api "$J_B" POST "orders/$O2/dispute" "{\"r\":\"Ürün teslim edilmedi\",\"d\":\"Satıcı oyuna gelmedi\",\"media\":[\"$MD\"]}" -H "X-CSRF-Token: $CS_B"
chk "itiraz açıldı (odendi → itiraz), kanıt iki tarafa görünür" '[ "$(j .data.order.status)" = itiraz ] && [ "$(j .data.order.reason)" = "Ürün teslim edilmedi: Satıcı oyuna gelmedi" ] && [ -n "$(j .data.order.proof)" ]'
OUT=$(curl -s -o /dev/null -w '%{http_code}' -b "$J_A" "$(url "media/$MD")")
chk "satıcı itiraz kanıtını açar → 200" '[ "$OUT" = 200 ]'
api "$J_ADM" GET "admin/orders?status=itiraz" ""
chk "[siparis] itiraz listesi" '[ "$(j ".data.orders | length")" = 1 ] && [ "$(j .data.orders[0].id)" = "$O2" ] && [ "$(j .data.counts.itiraz)" = 1 ]'
api "$J_ADM" POST "admin/orders/$O2/resolve" '{"to":"buyer"}' -H "X-CSRF-Token: $CS_ADM"
chk "alıcı lehine: iade, B bakiyesi geri" '[ "$(j .data.order.status)" = iade ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''order_resolve'\''")" = 1 ]'
up "$J_A" "$CS_A" "$RUN/pre.png" proof; M1="$(j .data.media.id)"; up "$J_A" "$CS_A" "$RUN/post.png" proof; M2="$(j .data.media.id)"
api "$J_A" POST "orders/$O3/deliver" "{\"dpre\":[\"$M1\"],\"dpost\":[\"$M2\"]}" -H "X-CSRF-Token: $CS_A"
api "$J_B" POST "orders/$O3/dispute" '{"r":"Ürün ilandaki gibi değil","d":"Efsunlar farklı"}' -H "X-CSRF-Token: $CS_B"
A0=$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UA#u}")
api "$J_ADM" POST "admin/orders/$O3/resolve" '{"to":"seller"}' -H "X-CSRF-Token: $CS_ADM"
chk "satıcı lehine: tamam, satıcıya net 46 TL" '[ "$(j .data.order.status)" = tamam ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UA#u}")" = $((A0 + 4600)) ]'
api "$J_ADM" POST "admin/orders/$O3/resolve" '{"to":"buyer"}' -H "X-CSRF-Token: $CS_ADM"
chk "kapanmış siparişe karar → 409" '[ "$CODE" = 409 ]'
api "$J_B" POST "orders/$O4/guarantee" '{}' -H "X-CSRF-Token: $CS_B"
chk "garanti: süre dolmadan → 409 not_late" '[ "$CODE" = 409 ] && [ "$(j .code)" = not_late ]'
sq "UPDATE yp_orders SET created_at=created_at-1500000 WHERE id=$(( ${O4#S} - 100000 ))" >/dev/null
api "$J_B" POST "orders/$O4/guarantee" '{}' -H "X-CSRF-Token: $CS_B"
chk "garanti: süre (Anında: 20 dk) dolunca anında iade" '[ "$CODE" = 200 ] && [ "$(j .data.order.status)" = iade ] && j .msg | grep -q "iade edildi"'
chk "B: iki iade sonrası yalnız 1 sipariş (50) eksik" '[ "$(sq "SELECT cash+credit FROM yp_wallets WHERE user_id=${UB#u}")" = $(( ${W0%/*} + ${W0#*/} + 10000 )) ]'

echo "=== 10. Otomatik onay yalnız cron'la (YP_TEST_NOW ile saat ileri) ==="
O5=$(buy)
up "$J_A" "$CS_A" "$RUN/pre.png" proof; M1="$(j .data.media.id)"; up "$J_A" "$CS_A" "$RUN/post.png" proof; M2="$(j .data.media.id)"
api "$J_A" POST "orders/$O5/deliver" "{\"dpre\":[\"$M1\"],\"dpost\":[\"$M2\"]}" -H "X-CSRF-Token: $CS_A"
DT=$(j .data.order.dt)
api "$J_B" GET "orders/$O5" ""
chk "sayfa açmak onaylamaz (render autoConfirm yok)" '[ "$(j .data.order.status)" = teslim ]'
cron_at $((DT + 23*3600000 + 1800000)) >/dev/null
chk "23,5 saat: 'otomatik onay yaklaşıyor' uyarısı, henüz teslim" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE ev='\''autosoon'\''")" = 1 ] && [ "$(sq "SELECT status FROM yp_orders WHERE id=$(( ${O5#S} - 100000 ))")" = teslim ]'
A0=$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UA#u}")
OUT=$(cron_at $((DT + 24*3600000 + 120000)))
chk "24 saat + 2 dk: cron onayladı, satıcıya net" '[ "$(sq "SELECT status FROM yp_orders WHERE id=$(( ${O5#S} - 100000 ))")" = tamam ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UA#u}")" = $((A0 + 4600)) ] && echo "$OUT" | grep -q "\"confirmed\":1"'
cron_at $((DT + 26*3600000)) >/dev/null
chk "tekrar cron: çift ödeme yok" '[ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UA#u}")" = $((A0 + 4600)) ]'

echo "=== 11. Yönetici bakiye düzeltmesi [bakiye] (gerekçe zorunlu, audit) + puan dönüşümü + doping ==="
api "$J_ADM" POST admin/balance '{"user":"Alici_C","amount":25,"w":false}' -H "X-CSRF-Token: $CS_ADM"
chk "gerekçesiz → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.note)" != null ]'
api "$J_ADM" POST admin/balance '{"user":"0555 111 22 03","amount":25,"w":false,"note":"Test bakiyesi"}' -H "X-CSRF-Token: $CS_ADM" -H "Idempotency-Key: bal-$(ik)"
chk "telefonla bulundu, +25 alışveriş bakiyesi" '[ "$CODE" = 200 ] && [ "$(wal $UC)" = "0/2500" ] && [ "$(j .data.user.bonus)" = 25 ]'
chk "audit: balance_adjust (tutar, kova, gerekçe)" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''balance_adjust'\'' AND data LIKE '\''%Test bakiyesi%'\''")" = 1 ]'
api "$J_ADM" POST admin/balance '{"user":"Alici_C","amount":100,"w":false,"neg":true,"note":"Fazla düş"}' -H "X-CSRF-Token: $CS_ADM"
chk "bakiyeden fazla düşüm → 422" '[ "$CODE" = 422 ] && [ "$(wal $UC)" = "0/2500" ]'
api "$J_ADM" POST admin/balance '{"user":"Yonetici","amount":100,"w":true,"note":"x yönetici"}' -H "X-CSRF-Token: $CS_ADM"
chk "yöneticiye düzeltme yapılamaz (üye bulunamadı)" '[ "$CODE" = 422 ]'
api "$J_B" POST me/points/convert '{"pts":100}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "500 puan altı → 422" '[ "$CODE" = 422 ]'
sq "UPDATE yp_users SET pts=740 WHERE id=${UB#u}" >/dev/null
CR0=$(sq "SELECT credit FROM yp_wallets WHERE user_id=${UB#u}")
api "$J_B" POST me/points/convert '{"pts":740}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "700 puan → 7 TL alışveriş bakiyesi, 40 puan kalır" '[ "$CODE" = 200 ] && [ "$(sq "SELECT credit FROM yp_wallets WHERE user_id=${UB#u}")" = $((CR0 + 700)) ] && [ "$(j .patch.me.pts)" = 40 ]'
api "$J_A" POST "listings/$L4/dope" '{"k":"vitrin","days":3}' -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
chk "doping: vitrin 3 gün 21 TL, ilan dop.vitrin" '[ "$CODE" = 200 ] && [ "$(j .data.cost)" = 21 ] && [ "$(j .data.listing.dop.vitrin)" -gt "$(nowms)" ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE kind='\''doping'\''")" = 1 ]'
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"item","title":"Dopingli yeni ilan","price":10,"dop":{"acil":2}}' -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
chk "ilan verirken doping (acil 2 gün 9 TL) bakiyeden" '[ "$CODE" = 200 ] && [ "$(j .data.listing.dop.acil)" -gt 0 ] && j .msg | grep -q "Doping ücreti" && [ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE kind='\''doping'\''")" = 2 ]'
api "$J_IL" PUT admin/dopings '{"dopings":{"vitrin":{"p":8,"max":14}}}' -H "X-CSRF-Token: $CS_IL"
chk "[ilan] doping fiyatı (dopset) + audit" '[ "$CODE" = 200 ] && [ "$(j .data.dopings.vitrin.pd)" = 8 ] && [ "$(j .data.dopings.vitrin.p)" = 56 ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''dopings_set'\''")" = 1 ]'

echo "=== 12. PayTR ayarlanır (api/ Entegrasyonlar) → token → bildirim (gerçek hash) ==="
MID=123456; KEY=AbCdEf1234567890; SALT=SaLt0987654321zz; PW='Cok-Gizli-Sifre-2026'
OUT=$(curl -s -b "$J_API" -c "$J_API" -X POST -H 'Content-Type: application/json' --data "{\"password\":\"$PW\",\"site_url\":\"http://127.0.0.1:$PORT\"}" "$B/api/kurulum.php")
API_CSRF=$(echo "$OUT" | jq -r .csrf)
OUT=$(curl -s -b "$J_API" -c "$J_API" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $API_CSRF" \
  --data "{\"service\":\"paytr\",\"values\":{\"merchant_id\":\"$MID\",\"merchant_key\":\"$KEY\",\"merchant_salt\":\"$SALT\",\"test_mode\":true,\"max_installment\":0}}" "$B/api/ayarlar.php")
chk "Entegrasyonlar: PayTR kaydedildi (api/data şifreli depo)" 'echo "$OUT" | jq -e ".configured==true" >/dev/null'
api "$J_X" GET boot ""
chk "boot: PayTR artık açık (otomatik)" '[ "$(j ".data.gws[] | select(.id==\"paytr\") | .on")" = true ] && [ "$(j ".data.gws[] | select(.id==\"paytr\") | .soon")" = null ]'
rl_reset
api "$J_B" POST deposits/paytr '{"gw":"paytr","amount":200}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: pt1-$(ik)"
OID="$(j .data.oid)"
chk "token: iframe adresi, bekliyor, beklenen 205 TL (%2,5)" '[ "$CODE" = 200 ] && echo "$(j .data.iframe)" | grep -q "^https://www.paytr.com/odeme/guvenli/TEST" && [ "$(j .data.deposit.status)" = bekliyor ] && [ "$(j .data.deposit.pay)" = 205 ] && [ "$(j .data.testMode)" = true ]'
api "$J_B" GET "deposits/$OID" ""
chk "durum yoklama: bekliyor" '[ "$(j .data.deposit.status)" = bekliyor ] && [ "$(j .data.done)" = false ]'
hsh() { printf '%s' "$1$SALT$2$3" | openssl dgst -sha256 -hmac "$KEY" -binary | base64; }
cb() { curl -s -X POST "$B/api/paytr_bildirim.php" --data-urlencode "merchant_oid=$1" --data-urlencode "status=$2" --data-urlencode "total_amount=$3" \
  --data-urlencode "hash=$4" --data-urlencode "payment_amount=${5:-$3}" --data-urlencode "test_mode=1" --data-urlencode "currency=TL" --data-urlencode "payment_type=card"; }
CR0=$(sq "SELECT credit FROM yp_wallets WHERE user_id=${UB#u}")
OUT=$(cb "$OID" success 20500 "badhash==")
chk "yanlış hash → reddedildi, bakiye yok" '[ "$OUT" = "PAYTR notification failed: bad hash" ] && [ "$(sq "SELECT status FROM yp_deposits WHERE merchant_oid='\''$OID'\''")" = bekliyor ]'
H=$(hsh "$OID" success 20500)
for i in 1 2 3 4 5; do cb "$OID" success 20500 "$H" > "$RUN/cb$i.txt" & PIDS+=($!); done
wjobs
chk "5 paralel bildirim: hepsi OK" '[ "$(for f in "$RUN"/cb*.txt; do cat "$f"; echo; done | grep -c "^OK$")" = 5 ]'
chk "bir kez yüklendi: kart → yalnız alışveriş +200, 5 bildirim sayıldı" '[ "$(sq "SELECT credit FROM yp_wallets WHERE user_id=${UB#u}")" = $((CR0 + 20000)) ] && [ "$(sq "SELECT callbacks FROM yp_deposits WHERE merchant_oid='\''$OID'\''")" = 5 ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE ref_type='\''deposit'\'' AND kind='\''yukleme'\'' AND ref_id=(SELECT '\''d'\''||id FROM yp_deposits WHERE merchant_oid='\''$OID'\'')")" = 1 ]'
api "$J_B" GET "deposits/$OID" ""
chk "durum yoklama: onaylandı + güncel bakiye" '[ "$(j .data.deposit.status)" = onaylandı ] && [ "$(j .data.done)" = true ] && [ "$(j .patch.me.bonus)" != null ]'
api "$J_B" POST deposits/paytr '{"gw":"paytr_eft","amount":100}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: pt2-$(ik)"
OID2="$(j .data.oid)"
chk "PayTR EFT: iframe api adresi" 'echo "$(j .data.iframe)" | grep -q "^https://www.paytr.com/odeme/api/"'
C0=$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UB#u}")
H2=$(hsh "$OID2" success 5000)
OUT=$(cb "$OID2" success 5000 "$H2" 5000)
chk "hatalı tutar (doğru hash): OK ama yükleme yok, basarisiz" '[ "$OUT" = OK ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UB#u}")" = "$C0" ] && [ "$(sq "SELECT status FROM yp_deposits WHERE merchant_oid='\''$OID2'\''")" = basarisiz ]'
api "$J_B" POST deposits/paytr '{"gw":"paytr_eft","amount":100}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: pt3-$(ik)"
OID3="$(j .data.oid)"
OUT=$(cb "$OID3" success 10000 "$(hsh "$OID3" success 10000)")
chk "PayTR Havale/EFT → çekilebilir (+100 nakit)" '[ "$OUT" = OK ] && [ "$(sq "SELECT cash FROM yp_wallets WHERE user_id=${UB#u}")" = $((C0 + 10000)) ]'
OUT=$(cb "YPBILINMEYEN1" success 1000 "$(hsh YPBILINMEYEN1 success 1000)")
chk "tanınmayan sipariş no: eski dosya kaydına düşer (OK)" '[ "$OUT" = OK ] && [ -f "$RUN/api/data/odemeler.json" ]'
api "$J_B" POST deposits/paytr '{"gw":"paytr","amount":50}' -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: pt4-$(ik)"
OID4="$(j .data.oid)"
cron_at $(( $(nowms) + 4*86400000 )) >/dev/null
chk "3 günü geçen bekleyen PayTR → suresi_doldu (cron)" '[ "$(sq "SELECT status FROM yp_deposits WHERE merchant_oid='\''$OID4'\''")" = suresi_doldu ]'

echo "=== 13. Defter tutarlılığı ==="
api "$J_ADM" POST admin/money/check '{}' -H "X-CSRF-Token: $CS_ADM"
chk "defter denetimi: tutarlı" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ]'
chk "tüm postings toplamı 0" '[ "$(sq "SELECT COALESCE(SUM(amount),0) FROM yp_postings")" = 0 ]'
chk "havuz = açık siparişler" '[ "$(sq "SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='\''ESCROW:ORD'\''")" = "$(sq "SELECT COALESCE(SUM(total),0) FROM yp_orders WHERE status IN ('\''odendi'\'','\''teslim'\'','\''itiraz'\'')")" ]'
chk "sunucu günlüğünde PHP hatası yok" '! grep -qiE "PHP (Fatal|Warning|Parse)" "$SLOG"'
grep -h '"hata"\|\[hata\]' "$RUN"/storage/log/*.log 2>/dev/null | head -5

echo
echo "SONUÇ (P2 HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
