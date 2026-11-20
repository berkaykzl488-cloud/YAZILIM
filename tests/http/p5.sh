#!/usr/bin/env bash
# P5 uçtan uca HTTP testleri: reklam satışı (takvim kilidi, onayda gelir, redde iade), site görselleri, şans çarkı (günde bir,
# ödül doğru cüzdana), çekilişler (ücretsiz bilet, alışveriş bileti, denetimli ve yeniden üretilebilir çekiliş), VIP komisyon
# indirimi, davet ödülü (bir kez + aynı IP işareti), geri kazanım (outbox saatlik sınırı, iletişim tercihi), yetki 403'leri,
# defter tutarlılığı.
# Canlıdaki yükseltme senaryosu: P3 sürümü ($P3_REF) sihirbazla kurulur, üzerinde veri oluşur → P5 kodu (çalışma ağacı) üzerine
# kopyalanır → ilk istek yeni tabloları ekler, veri ve oturumlar korunur. Tüm istekler rewrite'sız /api/v1/index.php?r=<yol>.
# Kullanım: bash tests/http/p5.sh      (gerekenler: php 8.1+ gd sqlite, curl, jq, git)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((26000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p5-XXXXXX")"
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
cat > "$RUN/sendmail.sh" <<EOF
#!/bin/sh
cat >> "$RUN/sendmail.log"
echo "----" >> "$RUN/sendmail.log"
EOF
chmod +x "$RUN/sendmail.sh"

YP_TEST=1 YP_TEST_PAYTR=fake PHP_CLI_SERVER_WORKERS=6 php -d display_errors=0 -d log_errors=1 -d upload_max_filesize=32M -d post_max_size=40M \
  -d sendmail_path="$RUN/sendmail.sh" -S 127.0.0.1:$PORT -t "$RUN" "$REPO/tests/http/router.php" >"$SLOG" 2>&1 &
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
sqx() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $p->exec("PRAGMA busy_timeout=8000"); $p->exec($argv[1]);' "$1"; }
ik() { echo "k$(date +%s%N)$RANDOM"; }
nowms() { echo $(( $(date +%s%N) / 1000000 )); }
cron_run() { YP_TEST=1 php -d sendmail_path="$RUN/sendmail.sh" "$RUN/app/cron.php" >/dev/null 2>&1; }
wal() { sq "SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=${1#u}"; }
walsum() { sq "SELECT COALESCE(SUM(cash+credit),0) FROM yp_wallets"; }
bal_of() { sq "SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='$1'"; }
TODAY=$(php -r 'echo intdiv((int)(microtime(true)*1000)+10800000,86400000)*86400000-10800000;')
DAY=86400000
TOM=$((TODAY + DAY)); D3=$((TODAY + 3*DAY)); D5=$((TODAY + 5*DAY))

J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_B="$RUN/b.jar"; J_C="$RUN/c.jar"; J_D="$RUN/d.jar"; J_ADM="$RUN/adm.jar"; J_X="$RUN/x.jar"
J_RK="$RUN/rk.jar"; J_KM="$RUN/km.jar"; J_VP="$RUN/vp.jar"; J_UY="$RUN/uy.jar"; J_IL="$RUN/il.jar"

echo "=== 1. Kurulum: P3 ($P3_REF), üzerinde veri ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang P5" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
reg() { local jar="$1" name="$2" mail="$3" tel="$4" ref="${5:-}"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\",\"ref\":\"$ref\"}" -H "X-CSRF-Token: $cs"; }
reg "$J_A" Reklamci_A a@ornek.com "0555 111 22 01"; CS_A="$(j .data.csrf)"; UA="$(j .data.me.id)"
reg "$J_B" Alici_B b@ornek.com "0555 111 22 02" REKLAMCIA26; CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
reg "$J_C" Satici_C c@ornek.com "0555 111 22 03"; CS_C="$(j .data.csrf)"; UC="$(j .data.me.id)"
reg "$J_D" Uye_D d@ornek.com "0555 111 22 04"; CS_D="$(j .data.csrf)"; UD="$(j .data.me.id)"
chk "A, B (A'nın davet koduyla), C, D kayıtlı" '[ -n "$UD" ] && [ "$UD" != null ] && [ "$(sq "SELECT ref_by FROM yp_users WHERE id=${UB#u}")" = "${UA#u}" ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
chk "yönetici girişi" '[ "$(j .data.me.admin)" = true ]'
api "$J_ADM" POST admin/banks '{"b":"Ziraat Bankası","n":"YangPazar Ltd","i":"TR330006100519786457841326"}' -H "X-CSRF-Token: $CS_ADM"
dep() { api "$1" POST deposits/manual "{\"gw\":\"havale\",\"amount\":$3,\"txAt\":$(nowms),\"toBank\":\"Ziraat Bankası\",\"note\":\"Test Uye\"}" -H "X-CSRF-Token: $2" -H "Idempotency-Key: $(ik)"
  local d; d="$(j .data.deposit.id)"; api "$J_ADM" POST "admin/deposits/$d/approve" '{}' -H "X-CSRF-Token: $CS_ADM"; }
dep "$J_A" "$CS_A" 1000; dep "$J_B" "$CS_B" 1000; dep "$J_D" "$CS_D" 1000
api "$J_ADM" POST admin/balance "{\"user\":\"Reklamci_A\",\"amount\":300,\"w\":false,\"note\":\"Kart yüklemesi (test)\"}" -H "X-CSRF-Token: $CS_ADM"
chk "P3 verisi: A 1000 çekilebilir + 300 yalnız alışveriş, B ve D 1000" '[ "$(wal $UA)" = "100000/30000" ] && [ "$(wal $UB)" = "100000/0" ] && [ "$(wal $UD)" = "100000/0" ]'
N_J0=$(sq "SELECT COUNT(*) FROM yp_journal"); N_U0=$(sq "SELECT COUNT(*) FROM yp_users"); N_D0=$(sq "SELECT COUNT(*) FROM yp_deposits")

echo "=== 2. P5 paketi üzerine kopyalanır (ilk istek: tablolar eklenir, veri korunur) ==="
if [ "$UPGRADE" = 1 ]; then
  chk "P3'te reklam / çekiliş tabloları yok" '[ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_ads'\''")" ] && [ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_spins'\''")" ]'
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 2
fi
api "$J_X" GET boot ""
TBL_OK=1; for t in ads ad_slots ad_media ad_stats slides slide_media raffles raffle_tickets raffle_free spins winback mkt_optout ref_flags; do [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='yp_$t'")" ] || { TBL_OK=0; echo "      eksik tablo: $t"; }; done
chk "ilk istek: 13 P5 tablosu eklendi" '[ "$CODE" = 200 ] && [ "$TBL_OK" = 1 ]'
chk "veri korundu: üyeler, yüklemeler, defter, cüzdanlar" '[ "$(sq "SELECT COUNT(*) FROM yp_users")" = "$N_U0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_deposits")" = "$N_D0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal")" = "$N_J0" ] && [ "$(wal $UA)" = "100000/30000" ]'
chk "boot: paketler, reklam/görsel listeleri, çark (açık, 8 dilim), çekilişler" '[ "$(j .data.packs.altbanner.cap)" = 1 ] && [ "$(j .data.packs.banner.p[0])" = 120 ] && [ "$(j ".data.ads | length")" = 0 ] && [ "$(j ".data.slides | length")" = 0 ] && [ "$(j .data.camp.wheel.on)" = true ] && [ "$(j ".data.camp.wheel.prizes | length")" = 8 ] && [ "$(j .data.camp.raffleOn)" = true ]'
api "$J_A" GET boot ""; CS_A="$(j .data.csrf)"
chk "yükseltmeden sonra üye oturumu sürüyor; mkt tercihi varsayılan açık" '[ "$(j .data.me.id)" = "$UA" ] && [ "$(j .data.mkt.mail)" = true ]'
CS_B=$(csrf_of "$J_B"); CS_C=$(csrf_of "$J_C"); CS_D=$(csrf_of "$J_D"); CS_ADM=$(csrf_of "$J_ADM")

echo "=== 3. Çalışanlar: [reklam], [kampanya], [vip], [uye], [ilan] ==="
mk_staff() { api "$J_ADM" POST admin/staff "{\"name\":\"$1\",\"email\":\"$2\",\"ad\":\"$3\",\"soyad\":\"Ci\",\"password\":\"Calisan-Sifre-9\",\"perms\":[\"$4\"]}" -H "X-CSRF-Token: $CS_ADM"; }
mk_staff ReklamCalisan rk@yangpazar.com Reklam reklam; mk_staff KampanyaCalisan km@yangpazar.com Kampanya kampanya
mk_staff VipCalisan vp@yangpazar.com Vip vip; mk_staff UyeCalisan uy@yangpazar.com Uye uye; mk_staff IlanCalisan il@yangpazar.com Ilan ilan
login() { local jar="$1" n="$2" cs; cs=$(csrf_of "$jar"); api "$jar" POST auth/login "{\"login\":\"$n\",\"password\":\"Calisan-Sifre-9\"}" -H "X-CSRF-Token: $cs"; j .data.csrf; }
CS_RK=$(login "$J_RK" ReklamCalisan); CS_KM=$(login "$J_KM" KampanyaCalisan); CS_VP=$(login "$J_VP" VipCalisan); CS_UY=$(login "$J_UY" UyeCalisan); CS_IL=$(login "$J_IL" IlanCalisan)
chk "5 çalışan girişi" '[ -n "$CS_RK" ] && [ "$CS_RK" != null ] && [ -n "$CS_IL" ] && [ "$CS_IL" != null ] && [ "$CS_UY" != null ]'

echo "=== 4. Reklam: takvim, satın alma, eşzamanlı rezervasyon ==="
api "$J_X" GET "ads/availability?type=altbanner" ""
chk "takvim: 42 gün, kapasite 1, bugün boş" '[ "$CODE" = 200 ] && [ "$(j .data.cap)" = 1 ] && [ "$(j ".data.days | length")" = 42 ] && [ "$(j ".data.days[\"$TODAY\"]")" = 0 ]'
api "$J_X" GET "ads/availability?type=yok" ""
chk "geçersiz alan → 422" '[ "$CODE" = 422 ]'
api "$J_A" POST ads "{\"type\":\"altbanner\",\"dur\":0,\"start\":$TOM,\"server\":\"sv1\",\"text\":\"Açılış!\"}" -H "X-CSRF-Token: $CS_A"
chk "Idempotency-Key olmadan → 400" '[ "$CODE" = 400 ]'
api "$J_C" POST ads "{\"type\":\"altbanner\",\"dur\":0,\"start\":$TOM,\"server\":\"sv1\",\"text\":\"Açılış!\"}" -H "X-CSRF-Token: $CS_C" -H "Idempotency-Key: $(ik)"
chk "bakiyesiz üye → 409 insufficient" '[ "$CODE" = 409 ] && [ "$(j .code)" = insufficient ]'
api "$J_A" POST ads "{\"type\":\"altbanner\",\"dur\":0,\"start\":$((TODAY - DAY)),\"server\":\"sv1\",\"text\":\"Dün\"}" -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
chk "geçmiş gün → 422" '[ "$CODE" = 422 ]'
api "$J_A" POST ads "{\"type\":\"banner\",\"dur\":0,\"start\":$TOM,\"server\":\"sv1\",\"text\":\"\"}" -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
chk "metinsiz banner → 422" '[ "$CODE" = 422 ]'
SUM0=$(walsum)
# aynı gün, kapasitesi 1 olan alt banner: üç üye ikişer kez, eşzamanlı
P=(); for jc in "$J_A:$CS_A" "$J_B:$CS_B" "$J_D:$CS_D" "$J_A:$CS_A" "$J_B:$CS_B" "$J_D:$CS_D"; do
  jar="${jc%%:*}"; cs="${jc#*:}"; n=${#P[@]}
  curl -s -b "$jar" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $cs" -H "Idempotency-Key: $(ik)$n" \
    --data "{\"type\":\"altbanner\",\"dur\":0,\"start\":$TOM,\"server\":\"sv1\",\"text\":\"Paralel $n\"}" -w '\n%{http_code}' "$(url ads)" > "$RUN/par$n.out" &
  P+=($!)
done
for p in "${P[@]}"; do wait "$p"; done
W200=0; W409=0; for n in 0 1 2 3 4 5; do c=$(tail -1 "$RUN/par$n.out"); [ "$c" = 200 ] && W200=$((W200+1)); [ "$c" = 409 ] && grep -q ad_full "$RUN/par$n.out" && W409=$((W409+1)); done
chk "6 eşzamanlı rezervasyon: tam 1 kazanan, 5 'dolu' (409 ad_full)" '[ "$W200" = 1 ] && [ "$W409" = 5 ]'
chk "veritabanında aynı gün için tek alt banner; toplam bakiye yalnız 150 TL azaldı" '[ "$(sq "SELECT COUNT(*) FROM yp_ads WHERE type='\''altbanner'\''")" = 1 ] && [ $((SUM0 - $(walsum))) = 15000 ]'
chk "ücret havuzda (ESCROW:ADS 150), gelir henüz yok" '[ "$(bal_of ESCROW:ADS)" = 15000 ] && [ "$(bal_of REV:ads)" = 0 ]'
ALT_OWNER=$(sq "SELECT owner_id FROM yp_ads WHERE type='altbanner'"); ALT_ID="a$(sq "SELECT id FROM yp_ads WHERE type='altbanner'")"
ALT_PRE=$(sq "SELECT (cash+paid_cash)||'/'||(credit+paid_credit) FROM yp_wallets w JOIN yp_ads a ON a.owner_id=w.user_id WHERE a.type='altbanner'")
api "$J_X" GET "ads/availability?type=altbanner" ""
chk "takvim: yarın dolu (onay bekleyen de yer tutar)" '[ "$(j ".data.days[\"$TOM\"]")" = 1 ]'
# A: bugün başlayan banner — önce yalnız alışveriş (kredi) bakiyesi kullanılır
A0=$(wal $UA); A0C=${A0#*/}
api "$J_A" POST ads "{\"type\":\"banner\",\"dur\":0,\"start\":$TODAY,\"server\":\"sv1\",\"title\":\"Büyük açılış\",\"text\":\"1-120 Orta Emek\"}" -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
BAN="$(j .data.ad.id)"
chk "banner: onay bekliyor, 120 TL, önce kredi kullanıldı (P2 harcama önceliği)" '[ "$CODE" = 200 ] && [ "$(j .data.ad.status)" = onay ] && [ "$(j .data.ad.price)" = 120 ] && [ "$(sq "SELECT paid_credit||'\''/'\''||paid_cash FROM yp_ads WHERE id=${BAN#a}")" = "12000/0" ] && [ "$(wal $UA)" = "${A0%/*}/$((A0C - 12000))" ]'
chk "yanıt patch.me bakiyesi güncel; [reklam] çalışanına bildirim" '[ "$(j .patch.me.bonus)" = "$(echo "scale=0; ($A0C - 12000)/100" | bc)" ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications n JOIN yp_users u ON u.id=n.user_id WHERE u.name='\''ReklamCalisan'\'' AND n.x LIKE '\''Yeni reklam onay bekliyor%'\''")" -ge 1 ]'
api "$J_A" GET me/ads ""
chk "Reklamlarım: 2 kayıt (banner + varsa alt banner), sahibine fiyat ve durum" '[ "$CODE" = 200 ] && [ "$(j "[.data.ads[] | select(.id==\"$BAN\")][0].status")" = onay ]'

echo "=== 5. Reklam yönetimi: onay (gelir), red (iade), durdur, uzat, sil, medya, paketler, yetkiler ==="
api "$J_IL" POST "admin/ads/$BAN/approve" '{}' -H "X-CSRF-Token: $CS_IL"
chk "[ilan] çalışanı reklam onaylayamaz → 403" '[ "$CODE" = 403 ]'
api "$J_B" GET "admin/ads" ""
chk "üye yönetim listesini göremez → 403" '[ "$CODE" = 403 ]'
api "$J_KM" PUT admin/packs '{"packs":{"text":{"p":[1,2,3]}}}' -H "X-CSRF-Token: $CS_KM"
chk "[kampanya] çalışanı paket fiyatı değiştiremez → 403" '[ "$CODE" = 403 ]'
api "$J_RK" GET "admin/ads?status=onay" ""
chk "yönetim: 2 onay bekleyen, sahip iletişimi ve ödeme kırılımı" '[ "$CODE" = 200 ] && [ "$(j .data.pending)" = 2 ] && [ "$(j ".data.ads | length")" = 2 ] && [ "$(j "[.data.ads[] | select(.id==\"$BAN\")][0].paid.nw")" = 120 ] && [ "$(j "[.data.users[] | select(.id==\"$UA\")][0].tel")" != null ]'
api "$J_RK" GET admin/today ""
chk "iş kuyruğu: ads = 2" '[ "$(j .data.queues.ads)" = 2 ]'
api "$J_RK" POST "admin/ads/$BAN/approve" '{}' -H "X-CSRF-Token: $CS_RK"
chk "onay: gelir tanındı (REV:ads 120), havuzdan çıktı" '[ "$CODE" = 200 ] && [ "$(j .data.ad.status)" = onayli ] && [ "$(bal_of REV:ads)" = 12000 ] && [ "$(bal_of ESCROW:ADS)" = 15000 ]'
api "$J_RK" POST "admin/ads/$BAN/approve" '{}' -H "X-CSRF-Token: $CS_RK"
chk "ikinci onay → 409, gelir iki kez yazılmaz" '[ "$CODE" = 409 ] && [ "$(bal_of REV:ads)" = 12000 ]'
api "$J_X" GET boot ""
chk "onaylanan banner ana sayfa açılışında (boot.ads)" '[ "$(j "[.data.ads[] | select(.id==\"$BAN\")] | length")" = 1 ] && [ "$(j "[.data.ads[] | select(.id==\"$BAN\")][0].price")" = null ]'
chk "sahibine onay bildirimi" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UA#u} AND x LIKE '\''Reklamınız onaylandı%'\''")" = 1 ]'
api "$J_RK" POST "admin/ads/$ALT_ID/reject" '{"reason":"Görsel ölçüsü uygun değil"}' -H "X-CSRF-Token: $CS_RK"
chk "red: üyenin ödediği kovalara iade, havuz 0, gelir değişmedi" '[ "$CODE" = 200 ] && [ "$(j .data.ad.status)" = red ] && [ "$(bal_of ESCROW:ADS)" = 0 ] && [ "$(bal_of REV:ads)" = 12000 ] && [ "$(sq "SELECT cash||'\''/'\''||credit FROM yp_wallets WHERE user_id=$ALT_OWNER")" = "$ALT_PRE" ]'
chk "red bildirimi gerekçe ve iade tutarıyla" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=$ALT_OWNER AND x LIKE '\''%Görsel ölçüsü uygun değil%150,00 bakiyenize iade%'\''")" = 1 ]'
api "$J_X" GET "ads/availability?type=altbanner" ""
chk "reddedilen reklam takvimde yer tutmaz" '[ "$(j ".data.days[\"$TOM\"]")" = 0 ]'
api "$J_RK" POST "admin/ads/$BAN/toggle" '{}' -H "X-CSRF-Token: $CS_RK"
api "$J_X" GET boot ""
chk "durdurulan reklam yayından kalkar" '[ "$(j "[.data.ads[] | select(.id==\"$BAN\")] | length")" = 0 ]'
api "$J_RK" POST "admin/ads/$BAN/toggle" '{}' -H "X-CSRF-Token: $CS_RK"
U0=$(sq "SELECT until_at FROM yp_ads WHERE id=${BAN#a}")
api "$J_RK" POST "admin/ads/$BAN/extend" '{}' -H "X-CSRF-Token: $CS_RK"
chk "+7 gün uzatma, yeniden başlatma" '[ "$CODE" = 200 ] && [ "$(j .data.ad.active)" = true ] && [ "$(sq "SELECT until_at FROM yp_ads WHERE id=${BAN#a}")" = $((U0 + 7*DAY)) ]'
# gösterim / tıklama
api "$J_X" POST ads/events "{\"imp\":[\"$BAN\",\"$BAN\",\"a999\",\"x\"],\"clk\":[\"$BAN\"]}" -H "X-CSRF-Token: $(csrf_of "$J_X")"
chk "beacon: yalnız yayındaki reklam sayılır (1 gösterim + 1 tıklama), günlük istatistik" '[ "$CODE" = 200 ] && [ "$(j .data.n)" = 2 ] && [ "$(sq "SELECT views||'\''/'\''||clicks FROM yp_ads WHERE id=${BAN#a}")" = "1/1" ] && [ "$(sq "SELECT imp||'\''/'\''||clk FROM yp_ad_stats WHERE ad_id=${BAN#a}")" = "1/1" ]'
api "$J_X" POST ads/events "{\"imp\":[\"$ALT_ID\"]}" -H "X-CSRF-Token: $(csrf_of "$J_X")"
chk "beacon: reddedilen reklam sayılmaz" '[ "$(j .data.n)" = 0 ]'
api "$J_X" POST ads/events "{\"imp\":[\"$BAN\"]}"
chk "beacon CSRF olmadan → 403" '[ "$CODE" = 403 ]'
api "$J_RK" GET "admin/ads/$BAN" ""
chk "reklam ayrıntısı: günlük istatistik" '[ "$CODE" = 200 ] && [ "$(j ".data.stats | length")" = 1 ]'
# onay bekleyen reklam silinirse iade
B0=$(wal $UB)
api "$J_B" POST ads "{\"type\":\"text\",\"dur\":0,\"start\":$TODAY,\"server\":\"sv1\",\"text\":\"Şerit reklamı\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
TXT="$(j .data.ad.id)"
chk "metin reklam: 60 TL" '[ "$CODE" = 200 ] && [ "$(j .data.ad.price)" = 60 ] && [ "$(wal $UB)" != "$B0" ]'
api "$J_RK" DELETE "admin/ads/$TXT" "" -H "X-CSRF-Token: $CS_RK"
chk "onay bekleyen reklam silindi → iade, havuz 0" '[ "$CODE" = 200 ] && [ "$(wal $UB)" = "$B0" ] && [ "$(bal_of ESCROW:ADS)" = 0 ] && [ -z "$(sq "SELECT id FROM yp_ads WHERE id=${TXT#a}")" ]'
# paket fiyatları
api "$J_RK" PUT admin/packs '{"packs":{"text":{"p":[70,350,1100],"cap":4}}}' -H "X-CSRF-Token: $CS_RK"
chk "paket fiyatı kaydedildi" '[ "$CODE" = 200 ] && [ "$(j .data.packs.text.p[0])" = 70 ] && [ "$(j .data.packs.text.cap)" = 4 ]'
api "$J_RK" PUT admin/packs '{"packs":{"text":{"p":[-1,1,1]}}}' -H "X-CSRF-Token: $CS_RK"
chk "eksi fiyat → 422" '[ "$CODE" = 422 ]'
api "$J_B" POST ads "{\"type\":\"text\",\"days\":7,\"start\":$TOM,\"server\":\"sv1\",\"text\":\"Haftalık şerit\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
TXT2="$(j .data.ad.id)"
chk "yeni fiyat sunucuda uygulandı (7 gün = 350 TL)" '[ "$CODE" = 200 ] && [ "$(j .data.ad.price)" = 350 ] && [ "$(j .data.ad.days)" = 7 ]'
# görsel / video
php -r '$i=imagecreatetruecolor(300,250); imagefill($i,0,0,imagecolorallocate($i,200,30,30)); imagepng($i,$argv[1]."/ad1.png"); imagepng($i,$argv[1]."/ad2.png");' "$RUN"
printf '\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom' > "$RUN/v.mp4"; head -c 4000 /dev/urandom >> "$RUN/v.mp4"
up "$J_A" "$CS_A" "$RUN/ad1.png" ad; MA1="$(j .data.media.id)"
up "$J_A" "$CS_A" "$RUN/v.mp4" ad; MAV="$(j .data.media.id)"
chk "reklam görseli ve videosu yüklendi (kind=ad)" '[ -n "$MA1" ] && [ "$MA1" != null ] && [ -n "$MAV" ] && [ "$MAV" != null ]'
api "$J_A" POST ads "{\"type\":\"slider\",\"dur\":0,\"start\":$D3,\"server\":\"sv1\",\"title\":\"Slider\",\"text\":\"Yeni sezon\",\"media\":[\"$MA1\",\"$MAV\"]}" -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
SLD="$(j .data.ad.id)"
chk "slider: medya bağlandı (2), video işaretli" '[ "$CODE" = 200 ] && [ "$(j ".data.ad.media | length")" = 2 ] && [ "$(j .data.ad.media[1].video)" = true ] && [ "$(sq "SELECT ref_type FROM yp_media WHERE id=${MA1#m}")" = ad ]'
api "$J_B" POST ads "{\"type\":\"slider\",\"dur\":0,\"start\":$D3,\"server\":\"sv1\",\"text\":\"Başkasının görseli\",\"media\":[\"$MA1\"]}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
chk "başkasının medyası kullanılamaz → 422" '[ "$CODE" = 422 ]'
api "$J_RK" DELETE "admin/ads/$SLD/media" "" -H "X-CSRF-Token: $CS_RK"
chk "medya temizlendi (yönetim)" '[ "$CODE" = 200 ] && [ "$(j ".data.ad.media | length")" = 0 ] && [ "$(sq "SELECT ref_type FROM yp_media WHERE id=${MA1#m}")" = "" ]'
up "$J_RK" "$CS_RK" "$RUN/ad2.png" ad; MR="$(j .data.media.id)"
api "$J_RK" POST "admin/ads/$SLD/media" "{\"media\":[\"$MR\"]}" -H "X-CSRF-Token: $CS_RK"
chk "yönetim medya ekledi" '[ "$CODE" = 200 ] && [ "$(j ".data.ad.media | length")" = 1 ]'
api "$J_RK" POST "admin/ads/$TXT2/media" "{\"media\":[\"$MR\"]}" -H "X-CSRF-Token: $CS_RK"
chk "metin reklama medya eklenemez → 422" '[ "$CODE" = 422 ]'
# listede olmayan server: onayda servers satırı açılır
api "$J_D" POST ads "{\"type\":\"premium\",\"dur\":0,\"start\":$TOM,\"server\":\"_new\",\"srv\":{\"name\":\"Göktürk Yeni\",\"lv\":\"1-99\",\"type\":\"Orta Emek\",\"url\":\"https://gokturk.example\",\"c1\":\"#112233\",\"c2\":\"#445566\"}}" -H "X-CSRF-Token: $CS_D" -H "Idempotency-Key: $(ik)"
PRM="$(j .data.ad.id)"
chk "yeni server reklamı: server henüz yok, bilgisi kayıtta" '[ "$CODE" = 200 ] && [ "$(j .data.ad.server)" = null ] && [ "$(j .data.ad.newSrv.name)" = "Göktürk Yeni" ] && [ -z "$(sq "SELECT id FROM yp_servers WHERE name='\''Göktürk Yeni'\''")" ]'
api "$J_RK" POST "admin/ads/$PRM/approve" '{}' -H "X-CSRF-Token: $CS_RK"
SNEW=$(sq "SELECT id FROM yp_servers WHERE name='Göktürk Yeni'")
chk "onayda server oluşturuldu ve reklama bağlandı" '[ "$CODE" = 200 ] && [ -n "$SNEW" ] && [ "$(j .data.ad.server)" = "sv$SNEW" ] && [ "$(sq "SELECT c1 FROM yp_servers WHERE id=$SNEW")" = "#112233" ]'
# [reklam] yetkilisi ücretsiz ekler, onaylı başlar
api "$J_RK" POST ads "{\"type\":\"slider\",\"dur\":1,\"start\":$TODAY,\"server\":\"sv1\",\"text\":\"Site kampanyası\"}" -H "X-CSRF-Token: $CS_RK" -H "Idempotency-Key: $(ik)"
chk "[reklam] çalışanı: ücretsiz, onaylı, defter kaydı yok" '[ "$CODE" = 200 ] && [ "$(j .data.ad.status)" = onayli ] && [ "$(j .data.ad.price)" = 0 ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE ref_id='\''$(j .data.ad.id)'\''")" = 0 ]'

echo "=== 6. Site görselleri [reklam] ==="
up "$J_RK" "$CS_RK" "$RUN/ad1.png" slide; MS="$(j .data.media.id)"
api "$J_RK" POST admin/slides "{\"title\":\"Hoş geldin\",\"text\":\"İlk alışverişe puan\",\"link\":\"#cekilis\",\"btn\":\"Katıl\",\"c\":[\"#111111\",\"#222222\"],\"media\":[\"$MS\"]}" -H "X-CSRF-Token: $CS_RK"
SL="$(j .data.slide.id)"
chk "görsel eklendi (medya bağlı)" '[ "$CODE" = 200 ] && [ "$(j .data.slide.on)" = true ] && [ "$(j ".data.slide.media | length")" = 1 ]'
api "$J_RK" POST admin/slides '{"link":"javascript:alert(1)"}' -H "X-CSRF-Token: $CS_RK"
chk "başlıksız ve görselsiz / zararlı bağlantı → 422" '[ "$CODE" = 422 ]'
api "$J_X" GET boot ""
chk "boot.slides: açık görsel" '[ "$(j ".data.slides | length")" = 1 ] && [ "$(j .data.slides[0].media[0].url)" != null ]'
api "$J_RK" POST "admin/slides/$SL/toggle" '{}' -H "X-CSRF-Token: $CS_RK"
api "$J_X" GET boot ""
chk "kapatılan görsel açılışta yok" '[ "$(j ".data.slides | length")" = 0 ]'
api "$J_RK" DELETE "admin/slides/$SL/media" "" -H "X-CSRF-Token: $CS_RK"
chk "görsel medyası temizlendi" '[ "$CODE" = 200 ] && [ "$(j ".data.slide.media | length")" = 0 ]'
api "$J_RK" POST "admin/slides/$SL/media" "{\"media\":[\"$MS\"]}" -H "X-CSRF-Token: $CS_RK"
chk "görsele medya yeniden eklendi" '[ "$CODE" = 200 ] && [ "$(j ".data.slide.media | length")" = 1 ]'
api "$J_KM" POST admin/slides '{"title":"x"}' -H "X-CSRF-Token: $CS_KM"
chk "[kampanya] çalışanı site görseli ekleyemez → 403" '[ "$CODE" = 403 ]'
api "$J_RK" DELETE "admin/slides/$SL" "" -H "X-CSRF-Token: $CS_RK"
chk "görsel silindi" '[ "$CODE" = 200 ] && [ "$(sq "SELECT COUNT(*) FROM yp_slides")" = 0 ]'

echo "=== 7. Çekiliş: oluştur, ücretsiz bilet ==="
api "$J_VP" POST admin/raffles '{"title":"x","kind":"bal","value":50}' -H "X-CSRF-Token: $CS_VP"
chk "[vip] çalışanı çekiliş açamaz → 403" '[ "$CODE" = 403 ]'
api "$J_KM" POST admin/raffles '{"title":"50 TL bakiye çekilişi","kind":"bal","value":50,"per":100,"days":7,"free":true}' -H "X-CSRF-Token: $CS_KM"
R1="$(j .data.raffle.id)"
chk "çekiliş başladı" '[ "$CODE" = 200 ] && [ "$(j .data.raffle.value)" = 50 ] && [ "$(j .data.raffle.per)" = 100 ] && [ "$(j .data.raffle.free)" = true ]'
api "$J_KM" POST admin/raffles '{"title":"Yalnız Elmas","kind":"item","value":500,"per":100,"days":7,"minVip":"elmas","free":true}' -H "X-CSRF-Token: $CS_KM"
R2="$(j .data.raffle.id)"
api "$J_B" POST "raffles/$R1/free-ticket" '{}' -H "X-CSRF-Token: $CS_B"
chk "B ücretsiz bilet → 1" '[ "$CODE" = 200 ] && [ "$(j .data.tickets)" = 1 ]'
api "$J_B" POST "raffles/$R1/free-ticket" '{}' -H "X-CSRF-Token: $CS_B"
chk "aynı gün ikinci ücretsiz bilet → 409" '[ "$CODE" = 409 ] && [ "$(sq "SELECT n FROM yp_raffle_tickets WHERE raffle_id=${R1#r} AND user_id=${UB#u}")" = 1 ]'
api "$J_D" POST "raffles/$R1/free-ticket" '{}' -H "X-CSRF-Token: $CS_D"
chk "D ücretsiz bilet → 1" '[ "$CODE" = 200 ]'
api "$J_B" POST "raffles/$R2/free-ticket" '{}' -H "X-CSRF-Token: $CS_B"
chk "VIP koşulu: Bronz üye Elmas çekilişine katılamaz → 403" '[ "$CODE" = 403 ]'
api "$J_KM" POST "raffles/$R1/free-ticket" '{}' -H "X-CSRF-Token: $CS_KM"
chk "çalışan çekilişe katılamaz → 403" '[ "$CODE" = 403 ]'
api "$J_B" GET boot ""
chk "boot.camp: B'nin bileti ve bugünkü ücretsiz bileti" '[ "$(j "[.data.camp.raffles[] | select(.id==\"$R1\")][0].tk[\"$UB\"]")" = 1 ] && [ -n "$(j "[.data.camp.raffles[] | select(.id==\"$R1\")][0].freeDay")" ] && [ "$(j "[.data.camp.raffles[] | select(.id==\"$R1\")][0].total")" = 2 ]'

echo "=== 8. Şans çarkı: günde bir, ödüller doğru cüzdana ==="
api "$J_KM" PUT admin/settings/wheel '{"prizes":[{"l":"5 TL","k":"bal","v":5,"w":1},{"l":"5 TL","k":"bal","v":5,"w":1}]}' -H "X-CSRF-Token: $CS_KM"
chk "çark ödülleri ayardan (yalnız 5 TL)" '[ "$CODE" = 200 ] && [ "$(j ".data.prizes | length")" = 2 ]'
api "$J_KM" PUT admin/settings/wheel '{"prizes":[{"k":"bal","v":0,"w":1}]}' -H "X-CSRF-Token: $CS_KM"
chk "geçersiz ödül listesi → 422" '[ "$CODE" = 422 ]'
B0=$(wal $UB); P0=$(sq "SELECT pts FROM yp_users WHERE id=${UB#u}")
api "$J_B" POST spin '{}' -H "X-CSRF-Token: $CS_B"
chk "çevirme: 5 TL → kredi (yalnız alışveriş), nakit değişmedi" '[ "$CODE" = 200 ] && [ "$(j .data.prize.k)" = bal ] && [ "$(wal $UB)" = "${B0%/*}/$(( ${B0#*/} + 500 ))" ] && [ "$(sq "SELECT kind FROM yp_journal WHERE ref_type='\''spin'\'' ORDER BY id DESC LIMIT 1")" = cark ]'
api "$J_B" POST spin '{}' -H "X-CSRF-Token: $CS_B"
chk "aynı gün ikinci çevirme → 409 (sunucuda)" '[ "$CODE" = 409 ] && [ "$(j .code)" = already ] && [ "$(sq "SELECT COUNT(*) FROM yp_spins WHERE user_id=${UB#u}")" = 1 ]'
# eşzamanlı çift çevirme: yalnız biri
P=(); for n in 1 2 3; do curl -s -b "$J_D" -X POST -H "X-CSRF-Token: $CS_D" -H 'Content-Type: application/json' --data '{}' -w '\n%{http_code}' "$(url spin)" > "$RUN/sp$n.out" & P+=($!); done
for p in "${P[@]}"; do wait "$p"; done
S200=0; for n in 1 2 3; do [ "$(tail -1 "$RUN/sp$n.out")" = 200 ] && S200=$((S200+1)); done
chk "eşzamanlı 3 çevirme → tek ödül" '[ "$S200" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_spins WHERE user_id=${UD#u}")" = 1 ]'
api "$J_ADM" POST spin '{}' -H "X-CSRF-Token: $CS_ADM"
chk "yönetici çark çeviremez → 403" '[ "$CODE" = 403 ]'
api "$J_VP" POST admin/spins/reset '{}' -H "X-CSRF-Token: $CS_VP"
chk "[vip] çalışanı hakları yenileyemez → 403" '[ "$CODE" = 403 ]'
api "$J_KM" PUT admin/settings/wheel '{"prizes":[{"k":"pt","v":50,"w":1},{"k":"pt","v":50,"w":1}]}' -H "X-CSRF-Token: $CS_KM"
api "$J_KM" POST admin/spins/reset '{}' -H "X-CSRF-Token: $CS_KM"
chk "hak yenileme (kuşak 1)" '[ "$CODE" = 200 ] && [ "$(j .data.gen)" = 1 ]'
B1=$(wal $UB)
api "$J_B" POST spin '{}' -H "X-CSRF-Token: $CS_B"
chk "yenilenen hak: 50 puan → puana, bakiye değişmedi" '[ "$CODE" = 200 ] && [ "$(sq "SELECT pts FROM yp_users WHERE id=${UB#u}")" = $((P0 + 50)) ] && [ "$(wal $UB)" = "$B1" ] && [ "$(sq "SELECT reason FROM yp_points_log WHERE user_id=${UB#u} ORDER BY id DESC LIMIT 1")" = cark ]'
api "$J_KM" PUT admin/settings/wheel '{"prizes":[{"k":"tk","v":1,"w":1},{"k":"tk","v":1,"w":1}]}' -H "X-CSRF-Token: $CS_KM"
api "$J_KM" POST admin/spins/reset '{}' -H "X-CSRF-Token: $CS_KM"
api "$J_B" POST spin '{}' -H "X-CSRF-Token: $CS_B"
chk "bilet ödülü → uygun aktif çekilişe +1 (Elmas'a değil)" '[ "$CODE" = 200 ] && [ "$(j .data.tickets)" = 1 ] && [ "$(sq "SELECT n FROM yp_raffle_tickets WHERE raffle_id=${R1#r} AND user_id=${UB#u}")" = 2 ] && [ -z "$(sq "SELECT n FROM yp_raffle_tickets WHERE raffle_id=${R2#r} AND user_id=${UB#u} AND n>0")" ]'
api "$J_B" POST "raffles/$R1/free-ticket" '{}' -H "X-CSRF-Token: $CS_B"
chk "hak yenileme ücretsiz bileti de yeniler" '[ "$CODE" = 200 ] && [ "$(j .data.tickets)" = 3 ]'
api "$J_KM" PUT admin/settings/wheel '{"wheelOn":false}' -H "X-CSRF-Token: $CS_KM"
api "$J_KM" POST admin/spins/reset '{}' -H "X-CSRF-Token: $CS_KM"
api "$J_B" POST spin '{}' -H "X-CSRF-Token: $CS_B"
chk "çark kapalı → 409; boot.set.wheelOn=false" '[ "$CODE" = 409 ] && [ "$(curl -s "$(url boot)" | jq -r .data.set.wheelOn)" = false ]'
api "$J_KM" PUT admin/settings/wheel '{"wheelOn":true}' -H "X-CSRF-Token: $CS_KM"
api "$J_KM" GET admin/wheel ""
chk "yönetim çark özeti: bugün çevirme ve dağıtılan bakiye" '[ "$CODE" = 200 ] && [ "$(j .data.on)" = true ] && [ "$(j .data.stats.today)" -ge 3 ] && [ "$(j .data.stats.bal)" = 10 ]'

echo "=== 9. Alışveriş: VIP komisyon indirimi, çekiliş bileti, davet ödülü (bir kez) ==="
php -r '$d=$argv[1]; $mk=function($c){ $i=imagecreatetruecolor(320,240); imagefill($i,0,0,imagecolorallocate($i,$c[0],$c[1],$c[2])); return $i; };
imagepng($mk([200,30,30]),"$d/pre.png"); imagepng($mk([30,200,30]),"$d/post.png");' "$RUN"
sqx "UPDATE yp_users SET vol=300000 WHERE id=${UC#u}"   # C: 3.000 TL hacim → Gümüş (disc 0.5)
sell_buy() { # $1 fiyat (TL) → sipariş tamamlanır; ORD
  api "$J_C" POST listings "{\"game\":\"metin2\",\"server\":\"sv1\",\"cat\":\"item\",\"title\":\"Test kılıcı $1\",\"price\":$1,\"stock\":1,\"del\":\"15 dk\"}" -H "X-CSRF-Token: $CS_C"
  local L; L="$(j .data.listing.id)"
  api "$J_B" POST orders "{\"listing\":\"$L\",\"qty\":1,\"info\":\"KarakterB\",\"ch\":\"2\",\"place\":\"Pazar alanı depocu\"}" -H "X-CSRF-Token: $CS_B" -H "Idempotency-Key: $(ik)"
  ORD="$(j .data.order.id)"; RATE="$(j .data.order.rate)"
  up "$J_C" "$CS_C" "$RUN/pre.png" proof; local m1; m1="$(j .data.media.id)"; up "$J_C" "$CS_C" "$RUN/post.png" proof; local m2; m2="$(j .data.media.id)"
  api "$J_C" POST "orders/$ORD/deliver" "{\"dpre\":[\"$m1\"],\"dpost\":[\"$m2\"]}" -H "X-CSRF-Token: $CS_C"
  api "$J_B" POST "orders/$ORD/confirm" '{"stars":5}' -H "X-CSRF-Token: $CS_B"; }
A1=$(wal $UA); B1=$(wal $UB); C1=$(wal $UC)
sell_buy 250
chk "VIP: Gümüş satıcının siparişinde komisyon %7,5 (8 − 0,5) dondu" '[ "$RATE" = 7.5 ] && [ "$(sq "SELECT rate_bp FROM yp_orders WHERE status='\''tamam'\'' ORDER BY id DESC LIMIT 1")" = 750 ]'
chk "VIP: tamamlanınca komisyon 18,75 TL, satıcıya 231,25 TL" '[ "$CODE" = 200 ] && [ "$(sq "SELECT fee FROM yp_orders ORDER BY id DESC LIMIT 1")" = 1875 ] && [ "$(wal $UC)" = "$(( ${C1%/*} + 23125 ))/${C1#*/}" ]'
chk "çekiliş: 250 TL harcama → +2 bilet (her 100 TL), 50 TL birikti" '[ "$(sq "SELECT n||'\''/'\''||acc FROM yp_raffle_tickets WHERE raffle_id=${R1#r} AND user_id=${UB#u}")" = "5/5000" ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB#u} AND x LIKE '\''Çekiliş bileti kazandın%'\''")" = 1 ]'
chk "davet: A'ya 25 TL, B'ye 10 TL kredi (ilk alışveriş ≥ 100 TL)" '[ "$(wal $UA)" = "${A1%/*}/$(( ${A1#*/} + 2500 ))" ] && [ "$(sq "SELECT ref_paid FROM yp_users WHERE id=${UB#u}")" = 1 ] && [ "$(sq "SELECT refs FROM yp_users WHERE id=${UA#u}")" = 1 ]'
chk "davet kötüye kullanım: aynı IP işaretlendi, ödeme engellenmedi, [vip] çalışanına bildirim" '[ "$(sq "SELECT COUNT(*) FROM yp_ref_flags WHERE referred_id=${UB#u} AND reason='\''same_ip'\'' AND paid=1")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications n JOIN yp_users u ON u.id=n.user_id WHERE u.name='\''VipCalisan'\'' AND n.x LIKE '\''Davet ödülünde şüpheli%'\''")" = 1 ]'
A2=$(wal $UA)
sell_buy 150
chk "ikinci alışveriş: davet ödülü tekrar ödenmez" '[ "$CODE" = 200 ] && [ "$(wal $UA)" = "$A2" ] && [ "$(sq "SELECT refs FROM yp_users WHERE id=${UA#u}")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='\''EXP:referral'\''")" = 2 ]'
chk "çekiliş: 150 + birikmiş 50 → +2 bilet" '[ "$(sq "SELECT n||'\''/'\''||acc FROM yp_raffle_tickets WHERE raffle_id=${R1#r} AND user_id=${UB#u}")" = "7/0" ]'
api "$J_B" GET me/referrals ""
api "$J_A" GET me/referrals ""
chk "Hesabım › Davet: A'nın davet ettikleri (B, ödül alındı)" '[ "$CODE" = 200 ] && [ "$(j .data.refs[0].name)" = Alici_B ] && [ "$(j .data.refs[0].paid)" = true ]'
api "$J_VP" GET admin/referrals ""
chk "yönetim davet listesi: işaret görünür" '[ "$CODE" = 200 ] && [ "$(j .data.unseen)" = 1 ] && [ "$(j "[.data.refs[] | select(.u==\"$UB\")][0].flags[0].reason")" = same_ip ]'
FID=$(j "[.data.refs[] | select(.u==\"$UB\")][0].flags[0].id")
api "$J_VP" POST "admin/referrals/flags/f$FID/seen" '{}' -H "X-CSRF-Token: $CS_VP"
chk "işaret incelendi" '[ "$CODE" = 200 ] && [ "$(j .data.unseen)" = 0 ]'

echo "=== 10. Çekiliş: denetimli, yeniden üretilebilir kazanan ==="
api "$J_VP" POST "admin/raffles/$R1/draw" '{}' -H "X-CSRF-Token: $CS_VP"
chk "[vip] çalışanı kazanan çekemez → 403" '[ "$CODE" = 403 ]'
api "$J_KM" POST "admin/raffles/$R2/draw" '{}' -H "X-CSRF-Token: $CS_KM"
chk "biletsiz çekiliş → 409" '[ "$CODE" = 409 ] && [ "$(j .code)" = no_tickets ]'
EXP0=$(bal_of EXP:raffle)
api "$J_KM" POST "admin/raffles/$R1/draw" '{}' -H "X-CSRF-Token: $CS_KM"
WIN="$(j .data.winner)"; SEED="$(j .data.draw.seed)"
chk "kazanan çekildi (B ya da D), 64 haneli tohum" '[ "$CODE" = 200 ] && { [ "$WIN" = "$UB" ] || [ "$WIN" = "$UD" ]; } && [ ${#SEED} = 64 ] && [ "$(j .data.draw.total)" = 8 ]'
chk "bakiye ödülü kazananın kredisine (EXP:raffle → 50 TL)" '[ $(( EXP0 - $(bal_of EXP:raffle) )) = 5000 ] && [ "$(sq "SELECT kind FROM yp_journal WHERE ref_id='\''$R1'\''")" = cekilis ] && [ "$(sq "SELECT COUNT(*) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='\''U${WIN#u}:credit'\'' AND p.label LIKE '\''Çekiliş ödülü%'\''")" = 1 ]'
chk "denetim kaydı: tohum, anlık görüntü özeti, katılımcı sayısı" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''raffle_draw'\'' AND entity_id='\''$R1'\'' AND data LIKE '\''%$SEED%'\'' AND data LIKE '\''%snapshotSha256%'\''")" = 1 ]'
chk "kazanana bildirim" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${WIN#u} AND x LIKE '\''Tebrikler!%50 TL bakiye çekilişi%'\''")" = 1 ]'
api "$J_KM" GET "admin/raffles/$R1/verify" ""
chk "doğrulama: saklanan görüntü + tohumdan aynı kazanan" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ] && [ "$(j .data.winner)" = "$WIN" ] && [ "$(j .data.entrants)" = 2 ]'
META=$(sq "SELECT draw_meta FROM yp_raffles WHERE id=${R1#r}")
REP=$(php -r '$m=json_decode($argv[1],true); $key=hex2bin($m["seed"]); $t=array_sum(array_column($m["snapshot"],1)); $lim=intdiv(1<<52,$t)*$t;
  for($c=0;;$c++){ $r=hexdec(substr(hash_hmac("sha256","yp-raffle-v1:".$argv[2].":".$c,$key),0,13)); if($r<$lim){ $i=$r%$t; break; } }
  $a=0; foreach($m["snapshot"] as $e){ $a+=$e[1]; if($i<$a){ echo "u".$e[0]; break; } }' "$META" "${R1#r}")
chk "bağımsız yeniden hesaplama (yalnız draw_meta ile) aynı kazananı verir" '[ "$REP" = "$WIN" ]'
api "$J_KM" POST "admin/raffles/$R1/draw" '{}' -H "X-CSRF-Token: $CS_KM"
chk "ikinci çekiliş → 409, ödül tekrar yazılmaz" '[ "$CODE" = 409 ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal WHERE ref_id='\''$R1'\''")" = 1 ]'
api "$J_D" POST "raffles/$R1/free-ticket" '{}' -H "X-CSRF-Token: $CS_D"
chk "biten çekilişe bilet → 409" '[ "$CODE" = 409 ]'
api "$J_X" GET boot ""
chk "boot: son kazananlar listesinde, kazanan herkese açık kaydı" '[ "$(j "[.data.camp.raffles[] | select(.id==\"$R1\")][0].winner")" = "$WIN" ] && [ "$(j "[.data.users[] | select(.id==\"$WIN\")] | length")" -ge 1 ]'
api "$J_KM" DELETE "admin/raffles/$R2" "" -H "X-CSRF-Token: $CS_KM"
chk "çekiliş silindi" '[ "$CODE" = 200 ] && [ -n "$(sq "SELECT deleted_at FROM yp_raffles WHERE id=${R2#r}")" ]'
api "$J_KM" PUT admin/settings/wheel '{"raffleOn":false}' -H "X-CSRF-Token: $CS_KM"
api "$J_X" GET boot ""
chk "çekiliş anahtarı kapalı → açılışta aktif çekiliş yok, set.raffleOn=false" '[ "$(j .data.camp.raffleOn)" = false ] && [ "$(j .data.set.raffleOn)" = false ]'
api "$J_KM" PUT admin/settings/wheel '{"raffleOn":true}' -H "X-CSRF-Token: $CS_KM"

echo "=== 11. VIP seviyeleri ve davet ayarları [vip] ==="
api "$J_KM" PUT admin/vip '{"levels":[]}' -H "X-CSRF-Token: $CS_KM"
chk "[kampanya] çalışanı VIP değiştiremez → 403" '[ "$CODE" = 403 ]'
api "$J_VP" PUT admin/vip '{"levels":[{"id":"bronz","n":"Bronz","min":0,"disc":0,"cb":0.5,"c":"#9a5f36"},{"id":"gumus","n":"Gümüş","min":2000,"disc":10,"cb":1,"c":"#7d8796"}]}' -H "X-CSRF-Token: $CS_VP"
chk "indirim komisyonu aşamaz → 422" '[ "$CODE" = 422 ]'
api "$J_VP" PUT admin/vip '{"levels":[{"id":"gumus","n":"Gümüş","min":2000,"disc":1,"cb":1,"c":"#7d8796"},{"id":"bronz","n":"Bronz","min":5,"disc":0,"cb":0.5,"c":"#9a5f36"},{"id":"elmas","n":"Elmas","min":40000,"disc":2,"cb":2,"c":"#1f8fb3"}]}' -H "X-CSRF-Token: $CS_VP"
chk "VIP kaydedildi: sıralı, ilk seviye 0'dan" '[ "$CODE" = 200 ] && [ "$(j .data.vip[0].id)" = bronz ] && [ "$(j .data.vip[0].min)" = 0 ] && [ "$(j .data.vip[1].min)" = 2000 ] && [ "$(curl -s "$(url boot)" | jq -r ".data.vip | length")" = 3 ]'
api "$J_C" POST listings '{"game":"metin2","server":"sv1","cat":"item","title":"Yeni oranlı ilan","price":100,"stock":1}' -H "X-CSRF-Token: $CS_C"; L9="$(j .data.listing.id)"
api "$J_D" POST orders "{\"listing\":\"$L9\",\"qty\":1,\"info\":\"KarakterD\"}" -H "X-CSRF-Token: $CS_D" -H "Idempotency-Key: $(ik)"
chk "yeni VIP tablosu sunucuda uygulanır (Gümüş indirim 1 → %7)" '[ "$CODE" = 200 ] && [ "$(j .data.order.rate)" = 7 ]'
api "$J_VP" PUT admin/settings/referral '{"refOn":true,"refBonus":30,"refFriend":15,"refMin":150,"refMax":20}' -H "X-CSRF-Token: $CS_VP"
chk "davet ayarları kaydedildi, boot.set'te" '[ "$CODE" = 200 ] && [ "$(j .data.ref.refBonus)" = 30 ] && [ "$(curl -s "$(url boot)" | jq -r .data.set.refMin)" = 150 ]'
api "$J_VP" PUT admin/settings/referral '{"refMax":0}' -H "X-CSRF-Token: $CS_VP"
chk "geçersiz davet sınırı → 422" '[ "$CODE" = 422 ]'
api "$J_KM" PUT admin/settings/referral '{"refBonus":99}' -H "X-CSRF-Token: $CS_KM"
chk "[kampanya] çalışanı davet ayarı değiştiremez → 403" '[ "$CODE" = 403 ]'

echo "=== 12. Geri kazanım: outbox saatlik sınırı, iletişim tercihi [uye] ==="
rl_reset
WJ=(); WU=()
for n in 1 2 3 4 5; do jar="$RUN/w$n.jar"; reg "$jar" "Geri_$n" "geri$n@ornek.com" "0555 222 33 0$n"; WJ+=("$jar"); WU+=("$(j .data.me.id)"); done
chk "5 yeni üye" '[ "${#WU[@]}" = 5 ] && [ "${WU[4]}" != null ]'
CS_W5=$(csrf_of "${WJ[4]}")
api "${WJ[4]}" PUT me/marketing '{"mail":false}' -H "X-CSRF-Token: $CS_W5"
chk "üye kampanya e-postasını kapattı" '[ "$CODE" = 200 ] && [ "$(j .data.mkt.mail)" = false ] && [ "$(j .data.mkt.sms)" = true ]'
OLD=$(( $(nowms) - 40*DAY ))
sqx "UPDATE yp_users SET last_seen=$OLD, created_at=$OLD WHERE name LIKE 'Geri_%'"
api "$J_ADM" PUT admin/settings/mail '{"on":true,"provider":"","fallback":true,"from":"noreply@yangpazar.com","hourly":3}' -H "X-CSRF-Token: $CS_ADM"
chk "e-posta açık, saatlik sınır 3" '[ "$CODE" = 200 ]'
api "$J_KM" GET "admin/winback?days=30" ""
chk "[kampanya] çalışanı geri kazanım listesini göremez → 403" '[ "$CODE" = 403 ]'
api "$J_UY" GET "admin/winback?days=30" ""
chk "hareketsiz üyeler: 5 Geri_ (aktif üyeler yok), tercih görünür" '[ "$CODE" = 200 ] && [ "$(j "[.data.users[] | select(.name|startswith(\"Geri_\"))] | length")" = 5 ] && [ "$(j "[.data.users[] | select(.name==\"Alici_B\")] | length")" = 0 ] && [ "$(j "[.data.users[] | select(.name==\"Geri_5\")][0].optMail")" = true ]'
IDS=$(printf '"%s",' "${WU[@]}"); IDS="[${IDS%,}]"
api "$J_UY" POST admin/winback "{\"ids\":$IDS,\"tpl\":\"Merhaba {ad}, seni özledik! Kupon: {kupon}\",\"coupon\":\"GERI10\",\"pct\":10,\"mail\":true,\"ntf\":true,\"gift\":5}" -H "X-CSRF-Token: $CS_UY"
chk "hediye için [bakiye] yetkisi gerekir → 403" '[ "$CODE" = 403 ]'
api "$J_UY" POST admin/winback "{\"ids\":[\"$UB\"],\"tpl\":\"Merhaba\",\"mail\":true}" -H "X-CSRF-Token: $CS_UY"
chk "aktif üye seçilemez → 422" '[ "$CODE" = 422 ]'
api "$J_UY" POST admin/winback "{\"ids\":$IDS,\"tpl\":\"Merhaba {ad}, seni özledik! Kupon: {kupon}\",\"coupon\":\"GERI10\",\"pct\":10,\"mail\":true,\"ntf\":true}" -H "X-CSRF-Token: $CS_UY"
chk "kampanya: 5 üye, 4 e-posta sıraya, 1 tercih nedeniyle atlandı" '[ "$CODE" = 200 ] && [ "$(j .data.n)" = 5 ] && [ "$(j .data.mail)" = 4 ] && [ "$(j .data.skipped)" = 1 ] && [ "$(j .data.hourly.mail)" = 3 ]'
chk "kupon oluşturuldu, site bildirimleri yazıldı (kişiselleştirilmiş)" '[ "$(sq "SELECT pct_bp FROM yp_coupons WHERE code='\''GERI10'\''")" = 1000 ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE x LIKE '\''Merhaba Test, seni özledik! Kupon: GERI10'\''")" = 5 ]'
sleep 1
chk "kampanya iletileri hemen gönderilmez (cron bütçesi bekler)" '[ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE ev='\''winback'\'' AND status='\''queued'\''")" = 4 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE ev='\''winback'\'' AND to_addr='\''geri5@ornek.com'\''")" = 0 ]'
for n in 1 2 3 4 5 6; do cron_run; done
SENT=$(sq "SELECT COUNT(*) FROM yp_outbox WHERE ev='winback' AND status='sent'")
HOUR=$(sq "SELECT COUNT(*) FROM yp_outbox WHERE channel='mail' AND status='sent' AND sent_at>$(( $(nowms) - 3600000 ))")
chk "6 cron tikinden sonra saatlik sınır (3) aşılmadı; kalanlar kuyrukta" '[ "$HOUR" -le 3 ] && [ "$SENT" -ge 1 ] && [ "$SENT" -le 3 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE ev='\''winback'\'' AND status='\''queued'\''")" = $((4 - SENT)) ]'
chk "gönderilen e-posta sendmail'e ulaştı" 'grep -qE "geri[1-4]@ornek.com" "$RUN/sendmail.log"'
api "$J_UY" GET "admin/winback?days=30" ""
chk "geçmiş kampanyalar" '[ "$(j ".data.history | length")" = 1 ] && [ "$(j .data.history[0].mail)" = 4 ] && [ "$(j .data.history[0].code)" = GERI10 ]'
api "$J_ADM" POST admin/winback "{\"ids\":[\"${WU[0]}\"],\"tpl\":\"Hediye\",\"ntf\":true,\"gift\":5}" -H "X-CSRF-Token: $CS_ADM"
chk "yönetici hediyesi: 5 TL kredi (yalnız alışveriş)" '[ "$CODE" = 200 ] && [ "$(wal "${WU[0]}")" = "0/500" ]'

echo "=== 13. Yetki matrisi (403) ==="
DENY=0
for spec in "IL|POST|admin/ads/$BAN/toggle" "IL|DELETE|admin/ads/$BAN" "IL|POST|admin/ads/$BAN/extend" "KM|POST|admin/ads/$BAN/reject" "UY|POST|admin/slides" \
  "RK|POST|admin/raffles" "RK|POST|admin/spins/reset" "RK|PUT|admin/settings/wheel" "RK|PUT|admin/vip" "RK|PUT|admin/settings/referral" "RK|POST|admin/winback" \
  "VP|GET|admin/raffles" "UY|GET|admin/ads" "KM|GET|admin/referrals" "B|PUT|admin/vip" "B|POST|admin/raffles/$R1/draw"; do
  who="${spec%%|*}"; rest="${spec#*|}"; m="${rest%%|*}"; p="${rest#*|}"
  eval "jar=\$J_$who; cs=\$CS_$who"
  api "$jar" "$m" "$p" '{}' -H "X-CSRF-Token: $cs"
  [ "$CODE" = 403 ] || { DENY=1; echo "      403 değil: $who $m $p → $CODE"; }
done
chk "16 rota: yetkisiz çalışan / üye → 403" '[ "$DENY" = 0 ]'
api "$J_X" POST spin '{}' -H "X-CSRF-Token: $(csrf_of "$J_X")"
chk "ziyaretçi çark çeviremez → 401" '[ "$CODE" = 401 ]'

echo "=== 14. Defter tutarlılığı ==="
api "$J_ADM" POST admin/money/check '{}' -H "X-CSRF-Token: $CS_ADM"
chk "defter denetimi (ESCROW:ADS dahil): tutarlı" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ]'
chk "tüm postings toplamı 0" '[ "$(sq "SELECT COALESCE(SUM(amount),0) FROM yp_postings")" = 0 ]'
chk "ESCROW:ADS = onay bekleyen reklamlar" '[ "$(bal_of ESCROW:ADS)" = "$(sq "SELECT COALESCE(SUM(price),0) FROM yp_ads WHERE status='\''onay'\''")" ]'
chk "REV:ads = onaylanan ücretli reklamlar" '[ "$(bal_of REV:ads)" = "$(sq "SELECT COALESCE(SUM(price),0) FROM yp_ads WHERE status='\''onayli'\''")" ]'
chk "sunucu günlüğünde PHP hatası yok" '! grep -qiE "PHP (Fatal|Warning|Parse|Notice|Deprecated)" "$SLOG"'
ERRL=$(grep -h '\[hata\]' "$RUN"/storage/log/*.log 2>/dev/null | head -5)
chk "uygulama günlüğünde [hata] yok" '[ -z "$ERRL" ]' ; [ -n "$ERRL" ] && echo "$ERRL"

echo
echo "SONUÇ (P5 HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
