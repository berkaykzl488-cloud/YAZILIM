#!/usr/bin/env bash
# Mobil yeniden tasarım HTTP testleri: GET me/summary (Hesabım › Özetim) ve boot.summary.todo (alt çubuk rozeti), borsa net stoğu.
# Formüller eleştiri B-5'e göre: havuzdaki satışlar = SUM(total − fee(total, rate_bp)) (orders.net değil), borsa havuzu = SUM(total − released),
# tutarlar sayı, "bu ay harcama" yalnız satin_alma/ep/doping/reklam (iade düşer; sms türü yok), yönetici için boş, başka üyenin verisi sızmaz.
# Veri gerçek API akışlarıyla (ilan, satın alma, borsa siparişi/emri, operatör) kurulur; durumlar gerektiğinde SQL ile ilerletilir.
# Kullanım: bash tests/http/ui.sh      (gerekenler: php 8.1+ sqlite, curl, jq)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((28000 + RANDOM % 1500))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-ui-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"

mkdir -p "$RUN/storage" "$RUN/uploads"
cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$RUN/"
cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"; cp "$REPO/uploads/.htaccess" "$REPO/uploads/index.php" "$RUN/uploads/"
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
YP_TEST=1 PHP_CLI_SERVER_WORKERS=4 php -d display_errors=0 -d log_errors=1 -d sendmail_path=/bin/true -S 127.0.0.1:$PORT -t "$RUN" "$REPO/tests/http/router.php" >"$SLOG" 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; [ "${KEEP:-0}" = 1 ] && echo "çalışma klasörü: $RUN" || rm -rf "$RUN"; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "$B/api/durum.php" && break; sleep 0.1; done

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      → ${2:0:900}"; }
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
sq()  { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $p->exec("PRAGMA busy_timeout=8000"); $v=$p->query($argv[1])->fetchColumn(); echo $v===false?"":$v;' "$1"; }
sqx() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $p->exec("PRAGMA busy_timeout=8000"); $p->exec($argv[1]);' "$1"; }
ik() { echo "k$(date +%s%N)$RANDOM"; }
nowms() { echo $(( $(date +%s%N) / 1000000 )); }
reg() { local jar="$1" name="$2" mail="$3" tel="$4"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\"}" -H "X-CSRF-Token: $cs"; }
# kuruş → jq'nun yazdığı TL sayısı (ör. 15640 → 156.4)
tl() { php -r 'echo json_encode(round(((int)$argv[1])/100, 2));' "$1"; }

J_K="$RUN/k.jar"; J_ADM="$RUN/adm.jar"; J_A="$RUN/a.jar"; J_B="$RUN/b.jar"; J_C="$RUN/c.jar"; J_Z="$RUN/z.jar"; J_X="$RUN/x.jar"

echo "=== 1. Kurulum, üyeler ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang UI" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
reg "$J_A" Satici_A a@ornek.com "0555 111 22 01"; CS_A="$(j .data.csrf)"; UA="$(j .data.me.id)"
reg "$J_B" Alici_B b@ornek.com "0555 111 22 02"; CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
reg "$J_C" Satici_C c@ornek.com "0555 111 22 03"; CS_C="$(j .data.csrf)"; UC="$(j .data.me.id)"
reg "$J_Z" Baska_Z z@ornek.com "0555 111 22 04"; CS_Z="$(j .data.csrf)"; UZ="$(j .data.me.id)"
chk "dört üye" '[ -n "$UA" ] && [ -n "$UZ" ] && [ "$UZ" != null ]'
api "$J_ADM" POST admin/balance '{"user":"Alici_B","amount":500,"w":true,"note":"Havale (test)"}' -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST admin/balance '{"user":"Alici_B","amount":100,"w":false,"note":"Kart (test)"}' -H "X-CSRF-Token: $CS_ADM"
chk "B bakiyesi 500 + 100" '[ "$(sq "SELECT cash||'\''/'\''||credit FROM yp_wallets WHERE user_id=${UB#u}")" = "50000/10000" ]'

echo "=== 2. Boş durum, erişim ==="
api "$J_X" GET me/summary ""
chk "girişsiz me/summary → 401" '[ "$CODE" = 401 ]'
api "$J_X" GET boot ""
chk "girişsiz açılışta summary yok" '[ "$(j .data.summary)" = null ]'
api "$J_Z" GET me/summary ""
chk "yeni üye: hepsi 0, tutarlar sayı" '[ "$CODE" = 200 ] && [ "$(j .data.todo.total)" = 0 ] && [ "$(j .data.buy.escrow)" = 0 ] && [ "$(j ".data.buy.escrow|type")" = number ] && [ "$(j ".data.sell.escrowNet|type")" = number ] && [ "$(j ".data.wd.pending|type")" = number ]'

echo "=== 3. İlanlar ve siparişler (gerçek API) ==="
LST() { api "$J_A" POST listings "{\"game\":\"metin2\",\"server\":\"sv1\",\"cat\":\"item\",\"title\":\"$1\",\"price\":$2,\"stock\":$3,\"del\":\"15 dk\"}" -H "X-CSRF-Token: $CS_A"; j .data.listing.id; }
L1=$(LST "Kalkan bir" 100 1); L2=$(LST "Kalkan iki" 50 1); L3=$(LST "Kalkan uc" 30 1); L4=$(LST "Kalkan dort" 20 1); L5=$(LST "Kalkan bes" 10 1); L6=$(LST "Kalkan alti" 40 3); L7=$(LST "Kalkan yedi" 15 1)
chk "A 7 ilan açtı" '[ -n "$L7" ] && [ "$L7" != null ]'
BUY() { api "$J_B" POST orders "{\"listing\":\"$1\",\"qty\":1,\"info\":\"KarakterB\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"; j .data.order.id; }
O1=$(BUY "$L1"); O2=$(BUY "$L2"); O3=$(BUY "$L3"); O4=$(BUY "$L4"); O5=$(BUY "$L5")
chk "B 5 sipariş verdi (100 + 50 + 30 + 20 + 10)" '[ -n "$O5" ] && [ "$O5" != null ] && [ "$(sq "SELECT COUNT(*) FROM yp_orders WHERE buyer_id=${UB#u}")" = 5 ]'
oid() { sq "SELECT id FROM yp_orders WHERE listing_id=${1#l}"; }
NOW=$(nowms)
# durumlar: O1 ödendi (teslimat bekliyor), O2 teslim (onay bekliyor), O4 itiraz; O3 bugün tamamlandı, O5 10 gün önce tamamlandı (net yazılı)
sqx "UPDATE yp_orders SET status='teslim', delivered_at=$NOW WHERE id=$(oid $L2)"
sqx "UPDATE yp_orders SET status='itiraz', disputed_at=$NOW WHERE id=$(oid $L4)"
sqx "UPDATE yp_orders SET status='tamam', confirmed_at=$NOW, fee=(total*rate_bp*2+10000)/20000, net=total-(total*rate_bp*2+10000)/20000 WHERE id=$(oid $L3)"
sqx "UPDATE yp_orders SET status='tamam', confirmed_at=$((NOW - 10*86400000)), fee=(total*rate_bp*2+10000)/20000, net=total-(total*rate_bp*2+10000)/20000 WHERE id=$(oid $L5)"
sqx "UPDATE yp_listings SET status='beklemede' WHERE id=${L7#l}"
chk "açık satışlarda orders.net boş (eski formül 0 verirdi)" '[ "$(sq "SELECT COUNT(*) FROM yp_orders WHERE seller_id=${UA#u} AND status IN ('\''odendi'\'','\''teslim'\'','\''itiraz'\'') AND net IS NULL")" = 3 ]'

echo "=== 4. Borsa (gerçek API): pazar, emir, siparişler, çağrı, bilgi, iptal ==="
api "$J_ADM" POST admin/ex/markets '{"server":"sv1"}' -H "X-CSRF-Token: $CS_ADM"; X1="$(j ".data.markets[0].id")"
api "$J_ADM" PUT admin/ex/markets "{\"place\":\"CH2\",\"markets\":[{\"id\":\"$X1\",\"on\":true,\"server\":\"sv1\",\"unit\":\"100M\",\"buy\":12.5,\"max\":10}]}" -H "X-CSRF-Token: $CS_ADM"
chk "pazar açık 12,50" '[ "$CODE" = 200 ] && [ "$(sq "SELECT buy FROM yp_ex_markets WHERE id=${X1#x}")" = 1250 ]'
api "$J_C" POST exchange/offers "{\"market\":\"$X1\",\"qty\":30,\"price\":9,\"ok\":true,\"f\":{\"f1\":\"hesap\",\"f2\":\"sifre-gizli\",\"f3\":\"Karakter\",\"f6\":\"Hemen\"}}" -H "X-CSRF-Token: $CS_C"
chk "C satış emri 30 adet" '[ "$CODE" = 200 ]'
EXO() { api "$J_B" POST exchange/orders "{\"market\":\"$X1\",\"qty\":$1,\"f\":{\"b1\":\"KarakterB\"}}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"; j .data.order.id; }
E1=$(EXO 4); E2=$(EXO 2); E3=$(EXO 1)
chk "B üç borsa siparişi (50 + 25 + 12,50)" '[ -n "$E3" ] && [ "$E3" != null ]'
api "$J_ADM" POST "admin/ex/orders/$E1/call" '{"msg":"Gelin"}' -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST "admin/ex/orders/$E2/info" '{"msg":"Karakter bulunamadı"}' -H "X-CSRF-Token: $CS_ADM"
api "$J_ADM" POST "admin/ex/orders/$E3/cancel" '{}' -H "X-CSRF-Token: $CS_ADM"
chk "çağrı, bilgi isteği, iptal (iade)" '[ "$(sq "SELECT status FROM yp_ex_orders WHERE id=$(( ${E3#B} - 1000 ))")" = iptal ] && [ "$(sq "SELECT status FROM yp_ex_orders WHERE id=$(( ${E2#B} - 1000 ))")" = bilgi ]'
# E1'in bir kısmı teslim edilmiş gibi: havuzdan çıkan (released) 20 TL → borsa havuzu = total − released
sqx "UPDATE yp_ex_orders SET released=2000 WHERE id=$(( ${E1#B} - 1000 ))"
# çekim talepleri (A): biri bekliyor, biri onaylandı
sqx "INSERT INTO yp_withdrawals (user_id, amount, fee, brut, net, iban_enc, status, created_at) VALUES (${UA#u}, 4000, 0, 4000, 4000, 'x', 'bekliyor', $NOW), (${UA#u}, 1000, 0, 1000, 1000, 'x', 'onaylandı', $NOW)"
sqx "INSERT INTO yp_withdrawals (user_id, amount, fee, brut, net, iban_enc, status, created_at) VALUES (${UZ#u}, 777, 0, 777, 777, 'x', 'bekliyor', $NOW)"

echo "=== 5. Alıcı B: me/summary ==="
api "$J_B" GET me/summary ""
chk "todo: onay 1, itiraz 1, çağrı 1, bilgi 1, toplam 4" '[ "$(j .data.todo.buy)" = 1 ] && [ "$(j .data.todo.sell)" = 0 ] && [ "$(j .data.todo.disp)" = 1 ] && [ "$(j .data.todo.exCall)" = 1 ] && [ "$(j .data.todo.exInfo)" = 1 ] && [ "$(j .data.todo.total)" = 4 ]'
chk "havuzdaki alışlarım: açık 3 sipariş, 100 + 50 + 20 = 170 (sayı)" '[ "$(j .data.buy.open)" = 3 ] && [ "$(j .data.buy.escrow)" = 170 ] && [ "$(j ".data.buy.escrow|type")" = number ]'
EXP_EX=$(sq "SELECT COALESCE(SUM(total-released),0) FROM yp_ex_orders WHERE user_id=${UB#u} AND status IN ('bekliyor','islemde','bilgi','kismen')")
chk "borsa havuzu: SUM(total − released) = 50 − 20 + 25 = 55 (iptal hariç), açık 2" '[ "$EXP_EX" = 5500 ] && [ "$(j .data.ex.escrowLeft)" = 55 ] && [ "$(j .data.ex.openOrders)" = 2 ]'
chk "bu ay harcama: siparişler 210 + borsa 87,50 − iptal iadesi 12,50 = 285; 8 işlem (iade sayılmaz)" '[ "$(j .data.buy.monthSpend)" = 285 ] && [ "$(j .data.buy.monthN)" = 8 ]'
chk "harcama türleri yalnız satin_alma (sms yok)" '[ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE kind='\''sms'\''")" = 0 ]'
chk "B satıcı değil: satış özeti 0" '[ "$(j .data.sell.escrowNet)" = 0 ] && [ "$(j .data.sell.d30.n)" = 0 ] && [ "$(j .data.sell.activeListings)" = 0 ]'
api "$J_B" GET boot ""
chk "açılış: yalnız summary.todo (toplam 4), tam özet yok" '[ "$(j .data.summary.todo.total)" = 4 ] && [ "$(j ".data.summary | keys | join(\",\")")" = todo ]'

echo "=== 6. Satıcı A: me/summary ==="
api "$J_A" GET me/summary ""
EXP_NET=$(sq "SELECT SUM(total-(total*rate_bp*2+10000)/20000) FROM yp_orders WHERE seller_id=${UA#u} AND status IN ('odendi','teslim','itiraz')")
RATE=$(sq "SELECT rate_bp FROM yp_orders WHERE id=$(oid $L1)")
chk "havuzdaki satışlarım = SUM(total − fee(total, rate_bp)) = $(tl $EXP_NET) (komisyon %$((RATE/100)))" '[ "$(j .data.sell.escrowNet)" = "$(tl $EXP_NET)" ] && [ "$EXP_NET" -gt 0 ] && [ "$(j ".data.sell.escrowNet|type")" = number ]'
chk "komisyon %8 ise: 92 + 46 + 18,40 = 156,40" '[ "$RATE" != 800 ] || [ "$(j .data.sell.escrowNet)" = 156.4 ]'
chk "todo: teslimat 1, itiraz 1, toplam 2; sell.deliver = todo.sell" '[ "$(j .data.todo.sell)" = 1 ] && [ "$(j .data.todo.disp)" = 1 ] && [ "$(j .data.todo.total)" = 2 ] && [ "$(j .data.sell.deliver)" = 1 ]'
N3=$(sq "SELECT net FROM yp_orders WHERE id=$(oid $L3)"); N5=$(sq "SELECT net FROM yp_orders WHERE id=$(oid $L5)")
chk "satış özeti: bugün 1 ($(tl $N3)), 7 gün 1, 30 gün 2 ($(tl $((N3+N5))))" '[ "$(j .data.sell.d1.n)" = 1 ] && [ "$(j .data.sell.d1.net)" = "$(tl $N3)" ] && [ "$(j .data.sell.d7.n)" = 1 ] && [ "$(j .data.sell.d30.n)" = 2 ] && [ "$(j .data.sell.d30.net)" = "$(tl $((N3+N5)))" ]'
EXP_ACT=$(sq "SELECT COUNT(*) FROM yp_listings WHERE seller_id=${UA#u} AND status='aktif' AND stock>0")
chk "aktif ilan $EXP_ACT (stoklu), onay bekleyen 1" '[ "$(j .data.sell.activeListings)" = "$EXP_ACT" ] && [ "$EXP_ACT" -ge 1 ] && [ "$(j .data.sell.pendingListings)" = 1 ]'
chk "çekim bekleyen: 40 TL, 1 talep (onaylanan hariç)" '[ "$(j .data.wd.pending)" = 40 ] && [ "$(j .data.wd.n)" = 1 ]'
chk "A alıcı değil: alış ve harcama 0" '[ "$(j .data.buy.open)" = 0 ] && [ "$(j .data.buy.monthSpend)" = 0 ]'

echo "=== 7. Satıcı C (borsa emri), sızıntı, yönetici ==="
api "$J_C" GET me/summary ""
chk "C: aktif borsa emri 1, kalan 30; başka veri yok" '[ "$(j .data.ex.activeOffers)" = 1 ] && [ "$(j .data.ex.offersLeft)" = 30 ] && [ "$(j .data.todo.total)" = 0 ] && [ "$(j .data.wd.n)" = 0 ]'
api "$J_Z" GET me/summary ""
chk "Z: yalnız kendi çekim talebi (7,77), başka üyenin verisi yok" '[ "$(j .data.wd.pending)" = 7.77 ] && [ "$(j .data.todo.total)" = 0 ] && [ "$(j .data.buy.open)" = 0 ] && [ "$(j .data.sell.escrowNet)" = 0 ] && [ "$(j .data.ex.openOrders)" = 0 ]'
api "$J_ADM" GET me/summary ""
chk "yönetici: {todo:{total:0}} (sorgu yok)" '[ "$CODE" = 200 ] && [ "$(j ".data | keys | join(\",\")")" = todo ] && [ "$(j .data.todo.total)" = 0 ]'
api "$J_ADM" GET boot ""
chk "yönetici açılışı: todo 0" '[ "$(j .data.summary.todo.total)" = 0 ]'
api "$J_B" GET "poll?n=0" ""
chk "yoklamaya summary alanı eklenmedi" '[ "$CODE" = 200 ] && [ "$(j .data.summary)" = null ] && [ "$(j .data.todo)" = null ]'

echo "=== 8. Borsa net stoğu (GET exchange) ==="
api "$J_X" GET exchange ""
DEM=$(sq "SELECT COALESCE(SUM(o.qty - (SELECT COALESCE(SUM(f.qty),0) FROM yp_ex_fills f WHERE f.order_id=o.id)),0) FROM yp_ex_orders o WHERE o.market_id=${X1#x} AND o.status IN ('bekliyor','islemde','bilgi','kismen')")
chk "net = satışta 30 − eşlenmemiş açık sipariş $DEM = $((30-DEM))" '[ "$(j ".data.stock[\"$X1\"]")" = 30 ] && [ "$(j ".data.net[\"$X1\"]")" = $((30-DEM)) ] && [ "$DEM" = 6 ]'

PHPERR=$(grep -E "PHP (Fatal|Warning|Parse|Notice|Deprecated)" "$SLOG" | head -3)
chk "sunucu günlüğünde PHP hatası yok" '[ -z "$PHPERR" ]'
echo
echo "SONUÇ (UI HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
