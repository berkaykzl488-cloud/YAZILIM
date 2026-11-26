#!/usr/bin/env bash
# P6 uçtan uca HTTP testleri: canlı destek (üye ↔ temsilci, asistan yanıtları, sıraya alma, üstlenme, iç not, hazır yanıt, aktarma,
# kapatma, değerlendirme, görsel ve sipariş eki), üyeden üyeye mesajlar (sansür + engellenen mesaj kaydı, okunmamış sayısı, hız sınırı),
# engellenen mesajlar yönetimi, mesaj şablonları (kaydedilen şablon giden e-postada; WhatsApp kuralları), "Şifremi unuttum"
# (genel yanıt, hesap var/yok ayırt edilemez — gövde ve süre, tek kullanım, süre aşımı, deneme sınırı, session_ver, güvenilir cihaz
# çerezi, yalnız Google hesabı, hız sınırları), outbox saatlik sınırı ve dolu kuyrukta doğrulama kodu, yetki 403'leri.
# Canlıdaki yükseltme senaryosu: 0.6.4 ($P5_REF) sihirbazla kurulur, üzerinde veri oluşur → P6 kodu (çalışma ağacı) üzerine kopyalanır →
# ilk istek yeni tabloları ekler, veri ve oturumlar korunur. Tüm istekler rewrite'sız /api/v1/index.php?r=<yol>.
# Kullanım: bash tests/http/p6.sh      (gerekenler: php 8.1+ gd sqlite, curl, jq, git)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((28000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p6-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
P5_REF="${P5_REF:-b72f3a0}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$P5_REF^{commit}" 2>/dev/null; then
  git -C "$REPO" archive "$P5_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: $P5_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
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

YP_TEST=1 PHP_CLI_SERVER_WORKERS=6 php -d display_errors=0 -d log_errors=1 -d upload_max_filesize=32M -d post_max_size=40M \
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
cron_run() { YP_TEST=1 php -d sendmail_path="$RUN/sendmail.sh" "$RUN/app/cron.php" >/dev/null 2>&1; }
ms() { echo $(( $(date +%s%N) / 1000000 )); }
outbox_last() { api "$J_X" GET "_test/outbox?to=$1" ""; }

J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_B="$RUN/b.jar"; J_C="$RUN/c.jar"; J_D="$RUN/d.jar"; J_E="$RUN/e.jar"; J_F="$RUN/f.jar"; J_ADM="$RUN/adm.jar"; J_X="$RUN/x.jar"
J_DS="$RUN/ds.jar"; J_MS="$RUN/ms.jar"; J_SM="$RUN/sm.jar"; J_IL="$RUN/il.jar"; J_A2="$RUN/a2.jar"

echo "=== 1. Kurulum: 0.6.4 ($P5_REF), üzerinde veri ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang P6" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
reg() { local jar="$1" name="$2" mail="$3" tel="$4"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\"}" -H "X-CSRF-Token: $cs"; }
reg "$J_A" Uye_A a@ornek.com "0555 111 33 01"; CS_A="$(j .data.csrf)"; UA="$(j .data.me.id)"
reg "$J_B" Uye_B b@ornek.com "0555 111 33 02"; CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
reg "$J_C" Uye_C c@ornek.com "0555 111 33 03"; CS_C="$(j .data.csrf)"; UC="$(j .data.me.id)"
reg "$J_E" Uye_E e@ornek.com "0555 111 33 05"; CS_E="$(j .data.csrf)"; UE="$(j .data.me.id)"
reg "$J_F" Uye_F f@ornek.com "0555 111 33 06"; CS_F="$(j .data.csrf)"; UF="$(j .data.me.id)"
chk "A, B, C, E, F kayıtlı" '[ -n "$UF" ] && [ "$UF" != null ] && [ "$UA" != null ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
chk "yönetici girişi" '[ "$(j .data.me.admin)" = true ]'
N_U0=$(sq "SELECT COUNT(*) FROM yp_users"); N_N0=$(sq "SELECT COUNT(*) FROM yp_notifications")

echo "=== 2. P6 paketi üzerine kopyalanır (ilk istek: tablolar eklenir, veri korunur) ==="
if [ "$UPGRADE" = 1 ]; then
  chk "0.6.4'te destek / mesaj tabloları yok" '[ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_tickets'\''")" ] && [ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_dm_threads'\''")" ]'
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 2
fi
api "$J_X" GET boot ""
TBL_OK=1; for t in tickets ticket_messages dm_threads dm_messages password_resets; do [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='yp_$t'")" ] || { TBL_OK=0; echo "      eksik tablo: $t"; }; done
chk "ilk istek: 5 P6 tablosu eklendi" '[ "$CODE" = 200 ] && [ "$TBL_OK" = 1 ]'
chk "veri korundu: üyeler, bildirimler" '[ "$(sq "SELECT COUNT(*) FROM yp_users")" = "$N_U0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications")" = "$N_N0" ]'
chk "boot.support: varsayılan saatler, kapalı değil, ziyaretçiye hazır yanıt yok" '[ "$(j .data.support.mode)" = auto ] && [ "$(j .data.support.on)" = true ] && [ "$(j ".data.support.hours[1][0]")" = "09:00" ] && [ "$(j ".data.support.canned | length")" = 0 ] && [ "$(j .data.support.ai)" = false ]'
api "$J_A" GET boot ""; CS_A="$(j .data.csrf)"
chk "yükseltmeden sonra üye oturumu sürüyor; okunmamış destek / mesaj 0" '[ "$(j .data.me.id)" = "$UA" ] && [ "$(j .data.unread.tk)" = 0 ] && [ "$(j .data.unread.dm)" = 0 ]'
CS_B=$(csrf_of "$J_B"); CS_C=$(csrf_of "$J_C"); CS_E=$(csrf_of "$J_E"); CS_F=$(csrf_of "$J_F"); CS_ADM=$(csrf_of "$J_ADM")
chk "sürüm 0.7.0" 'grep -q "YP_APP_VERSION., .0\.7\.0" "$RUN/app/bootstrap.php"'

echo "=== 3. Çalışanlar: [destek], [mesaj], [sms], [ilan] ==="
mk_staff() { api "$J_ADM" POST admin/staff "{\"name\":\"$1\",\"email\":\"$2\",\"ad\":\"$3\",\"soyad\":\"Ci\",\"password\":\"Calisan-Sifre-9\",\"perms\":[\"$4\"]}" -H "X-CSRF-Token: $CS_ADM"; }
mk_staff DestekCalisan ds@yangpazar.com Destek destek; mk_staff MesajCalisan ms@yangpazar.com Mesaj mesaj
mk_staff SmsCalisan sm@yangpazar.com Sms sms; mk_staff IlanCalisan il@yangpazar.com Ilan ilan
login() { local jar="$1" n="$2" cs; cs=$(csrf_of "$jar"); api "$jar" POST auth/login "{\"login\":\"$n\",\"password\":\"Calisan-Sifre-9\"}" -H "X-CSRF-Token: $cs"; j .data.csrf; }
CS_DS=$(login "$J_DS" DestekCalisan); CS_MS=$(login "$J_MS" MesajCalisan); CS_SM=$(login "$J_SM" SmsCalisan); CS_IL=$(login "$J_IL" IlanCalisan)
chk "4 çalışan girişi" '[ -n "$CS_DS" ] && [ "$CS_DS" != null ] && [ "$CS_MS" != null ] && [ "$CS_SM" != null ] && [ "$CS_IL" != null ]'
UDS=$(sq "SELECT 'u'||id FROM yp_users WHERE name='DestekCalisan'"); UIL=$(sq "SELECT 'u'||id FROM yp_users WHERE name='IlanCalisan'")
api "$J_DS" GET boot ""
chk "[destek] çalışanına açılışta hazır yanıtlar" '[ "$(j ".data.support.canned | length")" = 6 ]'

echo "=== 4. Canlı destek: üye ↔ asistan ==="
api "$J_X" GET support/ticket ""
chk "ziyaretçi → 401 (canlı destek için giriş gerekir)" '[ "$CODE" = 401 ]'
api "$J_ADM" PUT admin/settings/support '{"mode":"open"}' -H "X-CSRF-Token: $CS_ADM"
chk "yönetici: destek 'şimdi açık'" '[ "$CODE" = 200 ] && [ "$(j .data.support.open)" = true ]'
api "$J_A" GET support/ticket ""
chk "henüz talep yok (null), destek açık" '[ "$CODE" = 200 ] && [ "$(j .data.ticket)" = null ] && [ "$(j .data.support.open)" = true ]'
api "$J_A" POST support/messages '{"x":"Merhaba"}' -H "X-CSRF-Token: $CS_A"
TK="$(j .data.ticket.id)"
chk "ilk mesaj: talep açıldı (asistan selamı + üye + asistan yanıtı), durum açık" '[ "$CODE" = 200 ] && [[ "$TK" == tk* ]] && [ "$(j .data.ticket.status)" = acik ] && [ "$(j ".data.ticket.msgs | length")" = 3 ] && [ "$(j ".data.ticket.msgs[0].f")" = b ] && [ "$(j ".data.ticket.msgs[1].f")" = u ] && [ "$(j ".data.ticket.msgs[2].f")" = b ]'
api "$J_A" POST support/messages '{"x":"Bakiye nasıl yüklerim?"}' -H "X-CSRF-Token: $CS_A"
chk "asistan: bakiye sorusuna hazır yanıt" '[ "$(j ".data.ticket.msgs[-1].f")" = b ] && j ".data.ticket.msgs[-1].x" | grep -qi "akiye"'
api "$J_A" POST support/messages '{"x":"Şifremi unuttum, şifremi söyler misiniz?"}' -H "X-CSRF-Token: $CS_A"
chk "asistan şifre vermez/istemez: güvenlik uyarısı + Şifremi unuttum" 'j ".data.ticket.msgs[-1].x" | grep -q "asla şifre" && j ".data.ticket.msgs[-1].x" | grep -q "Şifremi unuttum" && [ "$(j .data.ticket.status)" = acik ]'
api "$J_A" POST support/messages '{"x":"Beni 0555 123 45 67 numarasından arayın"}' -H "X-CSRF-Token: $CS_A"
chk "telefon numarası destek mesajında gizlendi, engellenen mesaj kaydı" '[ "$(j .data.flagged)" = true ] && j ".data.ticket.msgs[] | select(.f==\"u\") | .x" | grep -q "\[gizlendi\]" && ! echo "$BODY" | grep -q "123 45 67" && [ "$(sq "SELECT COUNT(*) FROM yp_flagged WHERE ctx LIKE '\''Canlı destek%'\'' AND orig LIKE '\''%0555 123 45 67%'\''")" = 1 ]'
api "$J_A" POST support/messages '{"x":"Sipariş","order":"S999999"}' -H "X-CSRF-Token: $CS_A"
chk "başkasının / olmayan sipariş eki → 422" '[ "$CODE" = 422 ]'
php -r '$i=imagecreatetruecolor(200,120); imagefill($i,0,0,imagecolorallocate($i,30,90,160)); imagepng($i,$argv[1]);' "$RUN/ss.png"
up "$J_A" "$CS_A" "$RUN/ss.png" support; MID="$(j .data.media.id)"
api "$J_A" POST support/messages "{\"x\":\"\",\"media\":\"$MID\"}" -H "X-CSRF-Token: $CS_A"
IMG="$(j ".data.ticket.msgs[] | select(.img) | .img" | head -1)"
chk "ekran görüntüsü eklendi (özel dosya, talebe bağlandı)" '[ "$CODE" = 200 ] && [ -n "$IMG" ] && [ "$(sq "SELECT ref_type FROM yp_media WHERE id=${MID#m}")" = ticket ]'
api "$J_A" GET "media/$MID" ""; C1=$CODE; api "$J_B" GET "media/$MID" ""; C2=$CODE; api "$J_DS" GET "media/$MID" ""; C3=$CODE
chk "görseli sahibi ve [destek] görür, başka üye göremez (403)" '[ "$C1" = 200 ] && [ "$C2" = 403 ] && [ "$C3" = 200 ]'
api "$J_A" POST support/messages "{\"x\":\"tekrar\",\"media\":\"$MID\"}" -H "X-CSRF-Token: $CS_A"
chk "aynı görsel ikinci kez eklenemez → 422" '[ "$CODE" = 422 ]'

echo "=== 5. Temsilci sırası, yetkiler, üstlenme, yanıt, not, aktarma ==="
api "$J_A" POST support/escalate '{}' -H "X-CSRF-Token: $CS_A"
chk "temsilciye bağlan (asistan bilmediği konuda zaten aktarmıştı): sırada (1.), sıra mesajı" '[ "$(j .data.ticket.status)" = bekliyor ] && [ "$(j .data.ticket.pos)" = 1 ] && j ".data.ticket.msgs[] | select(.f==\"s\") | .x" | grep -q "sıra"'
api "$J_A" POST support/escalate '{}' -H "X-CSRF-Token: $CS_A"
chk "ikinci kez: sırada kalır, yeni sistem mesajı yok" '[ "$(j .data.ticket.status)" = bekliyor ] && [ "$(sq "SELECT COUNT(*) FROM yp_ticket_messages WHERE ticket_id=${TK#tk} AND f='\''s'\''")" = 1 ]'
api "$J_DS" GET admin/today ""; Q1="$(j .data.queues.tickets)"; api "$J_IL" GET admin/today ""; Q2="$(j .data.queues.tickets)"
chk "iş kuyruğu: [destek] tickets=1, [ilan] çalışanına 0" '[ "$Q1" = 1 ] && [ "$Q2" = 0 ]'
api "$J_IL" GET admin/tickets ""; C1=$CODE; api "$J_A" GET admin/tickets ""; C2=$CODE; api "$J_IL" POST "admin/tickets/$TK/claim" '{}' -H "X-CSRF-Token: $CS_IL"; C3=$CODE
api "$J_IL" PUT admin/settings/support '{"mode":"closed"}' -H "X-CSRF-Token: $CS_IL"; C4=$CODE
chk "yetki: [ilan] çalışanı ve üye talepleri göremez / üstlenemez / ayarlayamaz (403)" '[ "$C1" = 403 ] && [ "$C2" = 403 ] && [ "$C3" = 403 ] && [ "$C4" = 403 ]'
api "$J_DS" GET admin/tickets ""
chk "[destek] liste: talep sırada, bekleyen 1, temsilci listesi (destek + yönetici)" '[ "$CODE" = 200 ] && [ "$(j .data.waiting)" = 1 ] && [ "$(j ".data.tickets[0].id")" = "$TK" ] && [ "$(j ".data.tickets[0].status")" = bekliyor ] && [ "$(j ".data.agents | length")" = 2 ]'
api "$J_DS" POST "admin/tickets/$TK/claim" '{}' -H "X-CSRF-Token: $CS_DS"
chk "üstlen: açık, temsilci atandı" '[ "$CODE" = 200 ] && [ "$(j .data.ticket.status)" = acik ] && [ "$(j .data.ticket.agent)" = "$UDS" ]'
api "$J_A" GET "support/ticket?seen=1" ""
chk "üye: 'görüşmeye katıldı' sistem mesajı" 'j ".data.ticket.msgs[-1].x" | grep -q "DestekCalisan görüşmeye katıldı"'
api "$J_DS" POST "admin/tickets/$TK/reply" '{"x":"Üye telefonunu doğruladım","note":true}' -H "X-CSRF-Token: $CS_DS"
chk "iç not temsilci görünümünde" '[ "$(j ".data.ticket.msgs[-1].f")" = n ]'
api "$J_A" GET "support/ticket" ""
chk "iç not üyeye gösterilmez" '! echo "$BODY" | grep -q "telefonunu doğruladım"'
api "$J_DS" POST "admin/tickets/$TK/reply" '{"x":"Merhaba, ben {temsilci}. Size nasıl yardımcı olabilirim?"}' -H "X-CSRF-Token: $CS_DS"
chk "hazır yanıt: {temsilci} adla değişti" '[ "$(j ".data.ticket.msgs[-1].f")" = a ] && [ "$(j ".data.ticket.msgs[-1].x")" = "Merhaba, ben DestekCalisan. Size nasıl yardımcı olabilirim?" ]'
LAST="$(sq "SELECT MAX(id) FROM yp_ticket_messages WHERE ticket_id=${TK#tk}")"
api "$J_A" POST support/messages '{"x":"Siparişim gelmedi"}' -H "X-CSRF-Token: $CS_A"
chk "temsilci varken asistan yanıt vermez; temsilci okunmamış sayısı arttı" '[ "$(j ".data.ticket.msgs[-1].f")" = u ] && [ "$(sq "SELECT unread_s FROM yp_tickets WHERE id=${TK#tk}")" -ge 1 ]'
api "$J_DS" GET "admin/tickets/$TK?after=tm$LAST" ""
chk "temsilci yoklaması: yalnız yeni ileti (after), okunmamış sıfırlandı" '[ "$(j ".data.ticket.msgs | length")" = 1 ] && [ "$(j ".data.ticket.msgs[0].x")" = "Siparişim gelmedi" ] && [ "$(sq "SELECT unread_s FROM yp_tickets WHERE id=${TK#tk}")" = 0 ]'
api "$J_A" GET "support/ticket?after=tm$LAST" ""
chk "üye yoklaması: after ile yalnız yeni iletiler" '[ "$(j ".data.ticket.msgs | length")" = 1 ]'
api "$J_DS" POST "admin/tickets/$TK/transfer" "{\"to\":\"$UIL\"}" -H "X-CSRF-Token: $CS_DS"
chk "destek yetkisi olmayana aktarma → 422" '[ "$CODE" = 422 ]'
api "$J_DS" POST "admin/tickets/$TK/transfer" '{"to":"u1"}' -H "X-CSRF-Token: $CS_DS"
chk "yöneticiye aktarıldı (iç not + yöneticiye bildirim)" '[ "$CODE" = 200 ] && [ "$(j .data.ticket.agent)" = u1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=1 AND x LIKE '\''%aktardı%'\''")" = 1 ]'

echo "=== 6. Kapatma, değerlendirme, yeni talep ==="
api "$J_A" POST support/rate '{"n":5}' -H "X-CSRF-Token: $CS_A"
chk "kapanmadan değerlendirme → 409" '[ "$CODE" = 409 ]'
api "$J_ADM" POST "admin/tickets/$TK/close" '{}' -H "X-CSRF-Token: $CS_ADM"
chk "kapatıldı" '[ "$CODE" = 200 ] && [ "$(j .data.ticket.status)" = "kapandı" ]'
api "$J_DS" POST "admin/tickets/$TK/reply" '{"x":"geç yanıt"}' -H "X-CSRF-Token: $CS_DS"
chk "kapanmış görüşmeye yanıt → 409" '[ "$CODE" = 409 ]'
api "$J_A" GET support/ticket ""
chk "üye: kapanan görüşme (değerlendirme bekliyor)" '[ "$(j .data.ticket.status)" = "kapandı" ] && [ "$(j .data.ticket.rated)" = false ]'
api "$J_A" POST support/rate '{"n":9}' -H "X-CSRF-Token: $CS_A"; C1=$CODE
api "$J_A" POST support/rate '{"n":4}' -H "X-CSRF-Token: $CS_A"
chk "geçersiz puan 422; 4 yıldız kaydedildi" '[ "$C1" = 422 ] && [ "$CODE" = 200 ] && [ "$(j .data.ticket.rating)" = 4 ] && [ "$(j .data.ticket.rated)" = true ]'
api "$J_A" POST support/rate '{"n":5}' -H "X-CSRF-Token: $CS_A"
chk "ikinci değerlendirme → 409" '[ "$CODE" = 409 ]'
api "$J_DS" GET "admin/tickets?f=kapali" ""
chk "memnuniyet: 1 değerlendirme, ort. 4, temsilci bazında" '[ "$(j .data.rating.n)" = 1 ] && [ "$(j .data.rating.avg)" = 4 ] && [ "$(j ".data.rating.dist[\"4\"]")" = 1 ] && [ "$(j ".data.rating.byAgent[0].name")" = Yonetici ] && [ "$(j ".data.tickets | length")" = 1 ]'
api "$J_A" POST support/messages '{"x":"Komisyon ne kadar?"}' -H "X-CSRF-Token: $CS_A"
chk "değerlendirmeden sonra yeni talep açıldı, asistan komisyonu yanıtladı" '[ "$(j .data.ticket.id)" != "$TK" ] && j ".data.ticket.msgs[-1].x" | grep -q "omisyon"'
TK2="$(j .data.ticket.id)"
api "$J_DS" POST "admin/tickets/$TK2/reply" '{"x":"Komisyon VIP seviyenize göre düşer."}' -H "X-CSRF-Token: $CS_DS"
api "$J_A" GET poll ""
chk "yoklama: üyeye okunmamış destek iletisi (unread.tk)" '[ "$(j .data.unread.tk)" -ge 1 ]'
api "$J_A" GET "support/ticket?seen=1" ""; api "$J_A" GET poll ""
chk "panel açılınca okundu (unread.tk=0)" '[ "$(j .data.unread.tk)" = 0 ]'
api "$J_DS" GET poll ""
chk "[destek] yoklamasında kuyruk sayısı" '[ "$(j .data.queues.tickets)" = 0 ]'

echo "=== 7. Destek ayarları ==="
api "$J_DS" PUT admin/settings/support '{"hours":{"0":["25:00","22:00",true]}}' -H "X-CSRF-Token: $CS_DS"
chk "hatalı saat → 422" '[ "$CODE" = 422 ]'
H='{"0":["00:00","00:01",false],"1":["00:00","00:01",false],"2":["00:00","00:01",false],"3":["00:00","00:01",false],"4":["00:00","00:01",false],"5":["00:00","00:01",false],"6":["00:00","00:01",false]}'
api "$J_DS" PUT admin/settings/support "{\"mode\":\"auto\",\"hours\":$H,\"canned\":[[\"Selam\",\"Merhaba {temsilci}\"],[\"\",\"boş\"]],\"wait\":\"5 dk\"}" -H "X-CSRF-Token: $CS_DS"
chk "[destek] kaydetti: saat dışı → kapalı (open=false, on=true), boş hazır yanıt atıldı" '[ "$CODE" = 200 ] && [ "$(j .data.support.open)" = false ] && [ "$(j .data.support.on)" = true ] && [ "$(j ".data.support.canned | length")" = 1 ]'
api "$J_C" POST support/messages '{"x":"temsilci istiyorum"}' -H "X-CSRF-Token: $CS_C"
chk "saat dışında temsilci isteği: sıraya alındı + çevrimdışı mesajı ve dönüş günü" '[ "$(j .data.ticket.status)" = bekliyor ] && j ".data.ticket.msgs[-1].x" | grep -q "döndüğünde"'
api "$J_DS" PUT admin/settings/support '{"mode":"closed"}' -H "X-CSRF-Token: $CS_DS"
api "$J_X" GET boot ""
chk "destek kapalı: boot.support.on=false" '[ "$(j .data.support.on)" = false ] && [ "$(j .data.support.open)" = false ]'
api "$J_DS" PUT admin/settings/support '{"mode":"open"}' -H "X-CSRF-Token: $CS_DS"
rl_reset
N429=0; for i in $(seq 1 21); do api "$J_C" POST support/messages "{\"x\":\"mesaj $i\"}" -H "X-CSRF-Token: $CS_C"; [ "$CODE" = 429 ] && N429=$((N429+1)); done
chk "destek hız sınırı: dakikada 20 mesaj, 21. → 429" '[ "$N429" = 1 ]'

echo "=== 8. Üyeden üyeye mesajlar ==="
rl_reset
api "$J_X" GET dm ""; C1=$CODE; api "$J_A" POST "dm/$UA" '{"x":"kendime"}' -H "X-CSRF-Token: $CS_A"; C2=$CODE; api "$J_A" POST "dm/u99999" '{"x":"yok"}' -H "X-CSRF-Token: $CS_A"; C3=$CODE
chk "ziyaretçi 401, kendine 422, olmayan üye 404" '[ "$C1" = 401 ] && [ "$C2" = 422 ] && [ "$C3" = 404 ]'
api "$J_A" POST "dm/$UB" '{"x":"Selam, ilanın hâlâ satılık mı?"}' -H "X-CSRF-Token: $CS_A"
chk "A → B mesaj (sansürsüz)" '[ "$CODE" = 200 ] && [ "$(j .data.flagged)" = false ] && [ "$(j .data.msg.f)" = "$UA" ]'
chk "B'ye ilk mesaj bildirimi" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB#u} AND x='\''Uye_A size mesaj gönderdi.'\''")" = 1 ]'
api "$J_A" POST "dm/$UB" '{"x":"Cevap bekliyorum"}' -H "X-CSRF-Token: $CS_A"
chk "ikinci mesajda yeni bildirim yok" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB#u} AND x LIKE '\''%size mesaj gönderdi%'\''")" = 1 ]'
api "$J_B" GET poll ""
chk "B yoklama: okunmamış konuşma 1" '[ "$(j .data.unread.dm)" = 1 ]'
api "$J_B" GET dm ""
chk "B gelen kutusu: 1 konuşma, okunmamış, son ileti, karşı taraf herkese açık alanlarla" '[ "$(j ".data.dms | length")" = 1 ] && [ "$(j ".data.dms[0].un")" = true ] && [ "$(j ".data.dms[0].msgs[0].x")" = "Cevap bekliyorum" ] && [ "$(j ".data.users[0].name")" = Uye_A ] && [ "$(j ".data.users[0].email")" = null ]'
api "$J_B" GET "dm/$UA" ""
chk "B konuşmayı açtı: 2 ileti, okundu" '[ "$(j ".data.dm.msgs | length")" = 2 ] && [ "$(j .data.unread)" = 0 ]'
LDM="$(j ".data.dm.msgs[-1].id")"
api "$J_B" POST "dm/$UA" '{"x":"Whatsapp 0532 111 22 33 yaz, iban ile öde komisyonsuz olsun"}' -H "X-CSRF-Token: $CS_B"
chk "B → A: telefon ve site dışı ödeme gizlendi" '[ "$CODE" = 200 ] && [ "$(j .data.flagged)" = true ] && j .data.msg.x | grep -q "\[gizlendi\]" && ! j .data.msg.x | grep -q "0532" && ! j .data.msg.x | grep -qi "komisyonsuz"'
chk "engellenen mesaj kaydı: orijinal metin flagged tablosunda (Mesaj → Uye_A)" '[ "$(sq "SELECT COUNT(*) FROM yp_flagged WHERE ctx='\''Mesaj → Uye_A'\'' AND orig LIKE '\''%0532 111 22 33%'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_dm_messages WHERE x LIKE '\''%0532%'\''")" = 0 ]'
api "$J_A" GET "dm/$UB?after=$LDM" ""
chk "A yoklama (after): yalnız yeni ileti, işaretli" '[ "$(j ".data.dm.msgs | length")" = 1 ] && [ "$(j ".data.dm.msgs[0].flag")" = true ]'
N429=0; N200=0; for i in $(seq 1 21); do api "$J_C" POST "dm/$UB" "{\"x\":\"mesaj $i\"}" -H "X-CSRF-Token: $CS_C"; [ "$CODE" = 429 ] && N429=$((N429+1)); [ "$CODE" = 200 ] && N200=$((N200+1)); done
chk "DM hız sınırı: dakikada 20, 21. → 429" '[ "$N200" = 20 ] && [ "$N429" = 1 ]'
api "$J_A" POST "dm/$UB" "{\"x\":\"$(printf 'a%.0s' $(seq 1 1001))\"}" -H "X-CSRF-Token: $CS_A"
chk "1000 karakterden uzun → 422" '[ "$CODE" = 422 ]'

echo "=== 9. Engellenen mesajlar [mesaj] ==="
api "$J_A" GET admin/flagged ""; C1=$CODE; api "$J_IL" GET admin/flagged ""; C2=$CODE; api "$J_DS" POST admin/flagged/seen-all '{}' -H "X-CSRF-Token: $CS_DS"; C3=$CODE
chk "üye, [ilan] ve [destek] çalışanı göremez / işaretleyemez (403)" '[ "$C1" = 403 ] && [ "$C2" = 403 ] && [ "$C3" = 403 ]'
api "$J_MS" GET "admin/flagged?f=yeni" ""
NF="$(j .data.pending)"; F1="$(j ".data.flagged[0].id")"
chk "[mesaj]: destek ve DM kayıtları, üye bilgisi" '[ "$CODE" = 200 ] && [ "$NF" -ge 2 ] && [ "$(j ".data.users | length")" -ge 2 ]'
api "$J_MS" POST "admin/flagged/$F1/seen" '{}' -H "X-CSRF-Token: $CS_MS"
chk "tek kayıt incelendi" '[ "$CODE" = 200 ] && [ "$(j .data.pending)" = $((NF - 1)) ]'
api "$J_MS" GET admin/today ""
chk "Bugün: [mesaj] çalışanına flagged kuyruğu" '[ "$(j .data.queues.flagged)" = $((NF - 1)) ]'
api "$J_MS" POST admin/flagged/seen-all '{"q":"Uye_B"}' -H "X-CSRF-Token: $CS_MS"
chk "arama ile toplu: yalnız Uye_B'nin kayıtları" '[ "$CODE" = 200 ] && [ "$(sq "SELECT COUNT(*) FROM yp_flagged f JOIN yp_users u ON u.id=f.user_id WHERE u.name='\''Uye_B'\'' AND f.seen=0")" = 0 ] && [ "$(j .data.pending)" -ge 0 ]'
api "$J_MS" POST admin/flagged/seen-all '{}' -H "X-CSRF-Token: $CS_MS"
chk "tümü incelendi → bekleyen 0" '[ "$(j .data.pending)" = 0 ]'

echo "=== 10. Mesaj şablonları [sms] ==="
api "$J_IL" PUT admin/templates/welcome '{"mail":{"s":"x"}}' -H "X-CSRF-Token: $CS_IL"; C1=$CODE; api "$J_DS" GET admin/templates ""; C2=$CODE
chk "[ilan] / [destek] şablonları göremez / değiştiremez (403)" '[ "$C1" = 403 ] && [ "$C2" = 403 ]'
api "$J_SM" GET admin/templates ""
chk "katalog: hoş geldin, doğrulama (WhatsApp metni sabit), şifre sıfırlama, değişkenler" '[ "$CODE" = 200 ] && [ "$(j "[.data.templates[] | select(.k==\"welcome\")][0].mail.on")" = true ] && [ "$(j "[.data.templates[] | select(.k==\"tfa\")][0].wa.fixed")" = true ] && [ "$(j "[.data.templates[] | select(.k==\"reset\")][0].mail.needCode")" = true ] && [ "$(j ".data.vars[\"{kod}\"]")" = Kod ] && [ "$(j ".data.templates | length")" -ge 30 ]'
api "$J_SM" PUT admin/templates/tfa '{"mail":{"b":"Kodsuz metin"}}' -H "X-CSRF-Token: $CS_SM"; C1=$CODE
api "$J_SM" PUT admin/templates/tfa '{"wa":{"x":"Benim metnim {kod}"}}' -H "X-CSRF-Token: $CS_SM"; C2=$CODE
api "$J_SM" PUT admin/templates/yok '{"mail":{"s":"x"}}' -H "X-CSRF-Token: $CS_SM"; C3=$CODE
chk "doğrulama e-postasında {kod} zorunlu (422); WhatsApp kod metni Meta şablonu, değiştirilemez (422); bilinmeyen 404" '[ "$C1" = 422 ] && [ "$C2" = 422 ] && [ "$C3" = 404 ]'
api "$J_SM" PUT admin/templates/welcome '{"mail":{"s":"P6 özel hoş geldin {ad}","b":"Merhaba {ad}, bu P6 şablon testidir. {site}"}}' -H "X-CSRF-Token: $CS_SM"
chk "hoş geldin e-postası kaydedildi" '[ "$CODE" = 200 ] && [ "$(j .data.template.mail.custom)" = true ] && [ "$(j .data.template.mail.s)" = "P6 özel hoş geldin {ad}" ]'
api "$J_SM" PUT admin/templates/order_new '{"wa":{"x":"{site}: P6 siparişiniz #{no} alındı","on":true}}' -H "X-CSRF-Token: $CS_SM"
chk "WhatsApp bildirim metni (bizim taraf) kaydedildi ve açıldı" '[ "$CODE" = 200 ] && [ "$(j .data.template.wa.x)" = "{site}: P6 siparişiniz #{no} alındı" ] && [ "$(j .data.template.wa.on)" = true ]'
api "$J_ADM" PUT admin/settings/mail '{"on":true,"provider":"","fallback":true,"from":"noreply@yangpazar.test","hourly":500}' -H "X-CSRF-Token: $CS_ADM"
chk "e-posta açık (sahte gönderim: mail() → sendmail betiği)" '[ "$CODE" = 200 ]'
reg "$J_D" Uye_D d@ornek.com "0555 111 33 04"; UD="$(j .data.me.id)"
sleep 1
chk "yeni üyeye giden e-posta kayıtlı şablonla: konu ve metin" '[ "$(sq "SELECT subject FROM yp_outbox WHERE to_addr='\''d@ornek.com'\'' AND ev='\''welcome'\''")" = "P6 özel hoş geldin Test" ] && [ "$(sq "SELECT body FROM yp_outbox WHERE to_addr='\''d@ornek.com'\'' AND ev='\''welcome'\''")" = "Merhaba Test, bu P6 şablon testidir. Yang P6" ]'
cron_run
chk "sahte taşıyıcıyla gönderildi (sendmail kaydında alıcı)" '[ "$(sq "SELECT status FROM yp_outbox WHERE to_addr='\''d@ornek.com'\'' AND ev='\''welcome'\''")" = sent ] && grep -q "d@ornek.com" "$RUN/sendmail.log"'
api "$J_SM" DELETE admin/templates/welcome "" -H "X-CSRF-Token: $CS_SM"
chk "varsayılana döndü" '[ "$CODE" = 200 ] && [ "$(j .data.template.mail.custom)" = false ] && [ "$(j .data.template.mail.s)" = "{site} ailesine hoş geldin {ad}!" ]'
api "$J_SM" PUT admin/templates/message '{"mail":{"on":false}}' -H "X-CSRF-Token: $CS_SM"
chk "olay e-postası kapatılabilir (mail.ev)" '[ "$(j .data.template.mail.on)" = false ]'
api "$J_SM" PUT admin/templates/tfa '{"mail":{"on":false}}' -H "X-CSRF-Token: $CS_SM"
chk "doğrulama kodu kapatılamaz (her zaman gider)" '[ "$(j .data.template.mail.on)" = true ]'

echo "=== 11. Şifremi unuttum ==="
rl_reset
api "$J_X" POST auth/forgot '{"login":""}' -H "X-CSRF-Token: $(csrf_of "$J_X")"
chk "boş giriş → 422" '[ "$CODE" = 422 ]'
CSX=$(csrf_of "$J_X")
T0=$(ms); api "$J_X" POST auth/forgot '{"login":"Uye_A"}' -H "X-CSRF-Token: $CSX"; T1=$(( $(ms) - T0 )); B1="$BODY"; C1=$CODE
T0=$(ms); api "$J_X" POST auth/forgot '{"login":"Boyle_Biri_Yok"}' -H "X-CSRF-Token: $CSX"; T2=$(( $(ms) - T0 )); B2="$BODY"; C2=$CODE
T0=$(ms); api "$J_X" POST auth/forgot '{"login":"yok@ornek.com"}' -H "X-CSRF-Token: $CSX"; T3=$(( $(ms) - T0 )); B3="$BODY"
DT=$(( T1 > T2 ? T1 - T2 : T2 - T1 ))
chk "genel yanıt: var olan / olmayan hesapta aynı kod ve gövde" '[ "$C1" = 200 ] && [ "$C2" = 200 ] && [ "$B1" = "$B2" ] && [ "$B2" = "$B3" ] && echo "$B1" | jq -r .msg | grep -q "kayıtlı bir hesap varsa"'
chk "süre benzer (en az 650 ms, fark < 300 ms): $T1 / $T2 / $T3 ms" '[ "$T1" -ge 650 ] && [ "$T2" -ge 650 ] && [ "$DT" -lt 300 ]'
chk "yalnız var olan hesaba kod gitti (öncelik 0, gönderildi), olmayana satır yok" '[ "$(sq "SELECT priority||status FROM yp_outbox WHERE to_addr='\''a@ornek.com'\'' AND ev='\''reset'\'' ORDER BY id DESC LIMIT 1")" = 0sent ] && [ "$(sq "SELECT COUNT(*) FROM yp_password_resets")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE to_addr='\''yok@ornek.com'\''")" = 0 ]'
outbox_last a@ornek.com
RB="$(j '[.data.rows[] | select(.ev=="reset")][0].body')"; CODE6="$(echo "$RB" | grep -o '[0-9]\{6\}' | head -1)"; TOK="$(echo "$RB" | grep -o 'sifre-[a-f0-9]\{64\}' | head -1 | sed 's/sifre-//')"
chk "e-postada 6 haneli kod ve tek kullanımlık bağlantı; veritabanında yalnız özet" '[ ${#CODE6} = 6 ] && [ ${#TOK} = 64 ] && [ "$(sq "SELECT COUNT(*) FROM yp_password_resets WHERE token_hash='\''$TOK'\'' OR code_hash='\''$CODE6'\''")" = 0 ]'
api "$J_SM" GET "admin/outbox?ch=mail" ""
chk "gönderim kayıtlarında kod ve bağlantı gizli" '! echo "$BODY" | grep -q "$CODE6" && ! echo "$BODY" | grep -q "$TOK"'
SV0=$(sq "SELECT session_ver FROM yp_users WHERE id=${UA#u}")
api "$J_A2" POST auth/login '{"login":"Uye_A","password":"Uye-Sifre-123"}' -H "X-CSRF-Token: $(csrf_of "$J_A2")"
chk "A ikinci cihazda da oturum açtı" '[ "$(j .data.me.id)" = "$UA" ]'
WRONG=$([ "$CODE6" = 000000 ] && echo 111111 || echo 000000)
api "$J_X" POST auth/reset "{\"login\":\"Uye_A\",\"code\":\"$WRONG\",\"password\":\"Yeni-Sifre-456\"}" -H "X-CSRF-Token: $CSX"
chk "yanlış kod → 400 reset_invalid" '[ "$CODE" = 400 ] && [ "$(j .code)" = reset_invalid ]'
api "$J_X" POST auth/reset "{\"login\":\"Uye_A\",\"code\":\"$CODE6\",\"password\":\"kisa\"}" -H "X-CSRF-Token: $CSX"
chk "kısa şifre → 422 (kod harcanmaz)" '[ "$CODE" = 422 ] && [ -z "$(sq "SELECT used_at FROM yp_password_resets ORDER BY id DESC LIMIT 1")" ]'
api "$J_X" POST auth/reset "{\"login\":\"Uye_A\",\"code\":\"$CODE6\",\"password\":\"Yeni-Sifre-456\"}" -H "X-CSRF-Token: $CSX"
chk "doğru kodla şifre değişti" '[ "$CODE" = 200 ] && [ "$(j .data.login)" = Uye_A ]'
api "$J_X" POST auth/reset "{\"login\":\"Uye_A\",\"code\":\"$CODE6\",\"password\":\"Baska-Sifre-789\"}" -H "X-CSRF-Token: $CSX"; C1=$CODE
api "$J_X" POST auth/reset "{\"token\":\"$TOK\",\"password\":\"Baska-Sifre-789\"}" -H "X-CSRF-Token: $CSX"; C2=$CODE
chk "tek kullanımlık: aynı kod ve aynı isteğin bağlantısı tekrar çalışmaz (400)" '[ "$C1" = 400 ] && [ "$C2" = 400 ]'
chk "session_ver arttı" '[ "$(sq "SELECT session_ver FROM yp_users WHERE id=${UA#u}")" -gt "$SV0" ]'
api "$J_A" GET poll ""; C1=$CODE; api "$J_A2" GET poll ""; C2=$CODE
chk "iki cihazdaki oturum da düştü (401)" '[ "$C1" = 401 ] && [ "$C2" = 401 ]'
CS_A=$(csrf_of "$J_A"); api "$J_A" POST auth/login '{"login":"Uye_A","password":"Uye-Sifre-123"}' -H "X-CSRF-Token: $CS_A"; C1=$CODE
api "$J_A" POST auth/login '{"login":"Uye_A","password":"Yeni-Sifre-456"}' -H "X-CSRF-Token: $CS_A"; C2=$CODE; CS_A="$(j .data.csrf)"
chk "eski şifre 401, yeni şifre ile giriş" '[ "$C1" = 401 ] && [ "$C2" = 200 ]'
chk "üyeye 'şifreniz sıfırlandı' bildirimi ve e-postası" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UA#u} AND x LIKE '\''%sıfırlandı%'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE to_addr='\''a@ornek.com'\'' AND ev='\''pass'\''")" = 1 ]'
api "$J_X" POST auth/forgot '{"login":"b@ornek.com"}' -H "X-CSRF-Token: $CSX"
outbox_last b@ornek.com; TOKB="$(j '[.data.rows[] | select(.ev=="reset")][0].body' | grep -o 'sifre-[a-f0-9]\{64\}' | head -1 | sed 's/sifre-//')"
api "$J_X" POST auth/reset "{\"token\":\"$TOKB\",\"password\":\"B-Yeni-Sifre-1\"}" -H "X-CSRF-Token: $CSX"; C1=$CODE
api "$J_X" POST auth/reset "{\"token\":\"$TOKB\",\"password\":\"B-Yeni-Sifre-2\"}" -H "X-CSRF-Token: $CSX"; C2=$CODE
chk "e-posta ile giriş adı + bağlantı (token) ile sıfırlama; ikinci kullanım 400" '[ ${#TOKB} = 64 ] && [ "$C1" = 200 ] && [ "$C2" = 400 ]'
api "$J_X" POST auth/forgot '{"login":"Uye_C"}' -H "X-CSRF-Token: $CSX"
outbox_last c@ornek.com; CODEC="$(j '[.data.rows[] | select(.ev=="reset")][0].body' | grep -o '[0-9]\{6\}' | head -1)"
sqx "UPDATE yp_password_resets SET expires_at=1 WHERE user_id=${UC#u}"
api "$J_X" POST auth/reset "{\"login\":\"Uye_C\",\"code\":\"$CODEC\",\"password\":\"C-Yeni-Sifre-1\"}" -H "X-CSRF-Token: $CSX"
chk "30 dakika geçen kod → 400" '[ "$CODE" = 400 ]'
rl_reset
api "$J_X" POST auth/forgot '{"login":"Uye_C"}' -H "X-CSRF-Token: $CSX"
outbox_last c@ornek.com; CODEC="$(j '[.data.rows[] | select(.ev=="reset")][0].body' | grep -o '[0-9]\{6\}' | head -1)"
WRONG=$([ "$CODEC" = 000000 ] && echo 111111 || echo 000000)
for i in 1 2 3 4 5; do api "$J_X" POST auth/reset "{\"login\":\"Uye_C\",\"code\":\"$WRONG\",\"password\":\"C-Yeni-Sifre-1\"}" -H "X-CSRF-Token: $CSX"; done
api "$J_X" POST auth/reset "{\"login\":\"Uye_C\",\"code\":\"$CODEC\",\"password\":\"C-Yeni-Sifre-1\"}" -H "X-CSRF-Token: $CSX"
chk "5 yanlış denemeden sonra doğru kod da geçmez (400)" '[ "$CODE" = 400 ] && [ "$(sq "SELECT tries FROM yp_password_resets WHERE user_id=${UC#u} ORDER BY id DESC LIMIT 1")" = 5 ]'
# güvenilir cihaz (180 dk): kod bir kez girilince sorulmaz; şifre sıfırlanınca çerez geçersiz olur
sqx "UPDATE yp_users SET tfa='mail' WHERE id=${UE#u}"
api "$J_E" POST auth/logout '{}' -H "X-CSRF-Token: $CS_E"; CS_E="$(j .data.csrf)"
api "$J_E" POST auth/login '{"login":"Uye_E","password":"Uye-Sifre-123"}' -H "X-CSRF-Token: $CS_E"; TID="$(j .tfa.id)"
outbox_last e@ornek.com; ECODE="$(j '[.data.rows[] | select(.ev=="tfa")][0].body' | grep -o '[0-9]\{6\}' | head -1)"
api "$J_E" POST auth/tfa/verify "{\"id\":$TID,\"code\":\"$ECODE\"}" -H "X-CSRF-Token: $CS_E"; CS_E="$(j .data.csrf)"
chk "E: 2 adımlı giriş, güvenilir cihaz çerezi (YPT)" '[ "$CODE" = 200 ] && grep -q YPT "$J_E"'
api "$J_E" POST auth/logout '{}' -H "X-CSRF-Token: $CS_E"; CS_E="$(j .data.csrf)"
api "$J_E" POST auth/login '{"login":"Uye_E","password":"Uye-Sifre-123"}' -H "X-CSRF-Token: $CS_E"
chk "aynı cihazda tekrar giriş: kod sorulmadı" '[ "$CODE" = 200 ] && [ "$(j .tfa)" = null ] && [ "$(j .data.me.id)" = "$UE" ]'
CS_E="$(j .data.csrf)"; api "$J_E" POST auth/logout '{}' -H "X-CSRF-Token: $CS_E"; CS_E="$(j .data.csrf)"
api "$J_X" POST auth/forgot '{"login":"Uye_E"}' -H "X-CSRF-Token: $CSX"
outbox_last e@ornek.com; ER="$(j '[.data.rows[] | select(.ev=="reset")][0].body' | grep -o '[0-9]\{6\}' | head -1)"
api "$J_X" POST auth/reset "{\"login\":\"Uye_E\",\"code\":\"$ER\",\"password\":\"E-Yeni-Sifre-1\"}" -H "X-CSRF-Token: $CSX"
rl_reset # doğrulama kodu gönderimi dakikada 1: yeni kod istenebilsin
api "$J_E" POST auth/login '{"login":"Uye_E","password":"E-Yeni-Sifre-1"}' -H "X-CSRF-Token: $CS_E"
chk "sıfırlamadan sonra güvenilir cihaz çerezi geçersiz: kod yine soruluyor (2FA değişmedi)" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ] && [ "$(sq "SELECT tfa FROM yp_users WHERE id=${UE#u}")" = mail ]'
# yalnız Google ile açılmış (şifresiz) hesap ilk şifresini belirler
sqx "UPDATE yp_users SET pass_hash='!google-only', google_sub='g-123', google_email='f@ornek.com' WHERE id=${UF#u}"
api "$J_X" POST auth/forgot '{"login":"f@ornek.com"}' -H "X-CSRF-Token: $CSX"
outbox_last f@ornek.com; FR="$(j '[.data.rows[] | select(.ev=="reset")][0].body' | grep -o '[0-9]\{6\}' | head -1)"
api "$J_X" POST auth/reset "{\"login\":\"f@ornek.com\",\"code\":\"$FR\",\"password\":\"F-Ilk-Sifre-1\"}" -H "X-CSRF-Token: $CSX"; C1=$CODE
CS_F=$(csrf_of "$J_F"); api "$J_F" POST auth/login '{"login":"Uye_F","password":"F-Ilk-Sifre-1"}' -H "X-CSRF-Token: $CS_F"
chk "yalnız Google hesabı: ilk şifre belirlendi, şifreyle giriş, 'şifre eklendi' bildirimi" '[ "$C1" = 200 ] && [ "$CODE" = 200 ] && [ "$(j .data.me.hasPass)" = true ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UF#u} AND x LIKE '\''%şifre eklendi%'\''")" = 1 ]'
sqx "UPDATE yp_users SET status='banned' WHERE id=${UC#u}"
N0=$(sq "SELECT COUNT(*) FROM yp_password_resets"); rl_reset
api "$J_X" POST auth/forgot '{"login":"Uye_C"}' -H "X-CSRF-Token: $CSX"
chk "askıdaki hesap: aynı genel yanıt, kod gönderilmez" '[ "$CODE" = 200 ] && [ "$BODY" = "$B1" ] && [ "$(sq "SELECT COUNT(*) FROM yp_password_resets")" = "$N0" ]'
sqx "UPDATE yp_users SET status='active' WHERE id=${UC#u}"
rl_reset
R1=""; for i in 1 2 3 4; do api "$J_X" POST auth/forgot '{"login":"Uye_B"}' -H "X-CSRF-Token: $CSX"; R1="$R1$CODE "; done
rl_reset
R2=""; for i in 1 2 3 4; do api "$J_X" POST auth/forgot '{"login":"Hayalet_Uye"}' -H "X-CSRF-Token: $CSX"; R2="$R2$CODE "; done
chk "hız sınırı: aynı ad için saatte 3 istek, 4. → 429 (hesap olsun olmasın aynı): $R1 / $R2" '[ "$R1" = "200 200 200 429 " ] && [ "$R2" = "$R1" ]'
rl_reset
R3=""; for i in 1 2 3 4 5 6; do api "$J_X" POST auth/forgot "{\"login\":\"kisi$i\"}" -H "X-CSRF-Token: $CSX"; R3="$R3$CODE "; done
chk "hız sınırı: IP başına 15 dk'da 5, 6. → 429" '[ "$R3" = "200 200 200 200 200 429 " ]'
rl_reset

echo "=== 12. Outbox saatlik sınırı ve dolu kuyrukta doğrulama kodu ==="
cron_run
sqx "UPDATE yp_outbox SET sent_at=sent_at-7200000 WHERE status='sent'"
api "$J_ADM" PUT admin/settings/mail '{"hourly":12}' -H "X-CSRF-Token: $CS_ADM"
NOW=$(ms)
for i in $(seq 1 10); do sqx "INSERT INTO yp_outbox (channel,user_id,to_addr,ev,subject,body,priority,status,tries,next_at,created_at) VALUES ('mail',NULL,'kuyruk$i@ornek.com','winback','Kampanya $i','Merhaba',5,'queued',0,0,$NOW)"; done
cron_run
chk "saatlik 12 → tik başına 1: ilk tikte 1 kampanya e-postası" '[ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE to_addr LIKE '\''kuyruk%'\'' AND status='\''sent'\''")" = 1 ]'
api "$J_ADM" PUT admin/settings/mail '{"hourly":1}' -H "X-CSRF-Token: $CS_ADM"
cron_run; cron_run
chk "saatlik sınır 1: son saatte 1 gönderildi, kuyrukta 9 bekliyor" '[ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE to_addr LIKE '\''kuyruk%'\'' AND status='\''sent'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE to_addr LIKE '\''kuyruk%'\'' AND status='\''queued'\''")" = 9 ]'
api "$J_E" POST auth/login '{"login":"Uye_E","password":"E-Yeni-Sifre-1"}' -H "X-CSRF-Token: $CS_E"
chk "kuyruk dolu ve sınır aşılmışken 2FA e-postası hemen gitti" '[ "$CODE" = 200 ] && [ "$(j .tfa.ch)" = mail ] && [ "$(sq "SELECT status FROM yp_outbox WHERE to_addr='\''e@ornek.com'\'' AND ev='\''tfa'\'' ORDER BY id DESC LIMIT 1")" = sent ]'
api "$J_X" POST auth/forgot '{"login":"Uye_D"}' -H "X-CSRF-Token: $CSX"
chk "şifre sıfırlama kodu da saatlik sınıra takılmadan gitti" '[ "$(sq "SELECT status FROM yp_outbox WHERE to_addr='\''d@ornek.com'\'' AND ev='\''reset'\'' ORDER BY id DESC LIMIT 1")" = sent ]'
chk "kampanya e-postaları hâlâ kuyrukta (sınır korunuyor)" '[ "$(sq "SELECT COUNT(*) FROM yp_outbox WHERE to_addr LIKE '\''kuyruk%'\'' AND status='\''queued'\''")" = 9 ]'

echo "=== 13. Sunucu günlüğü ==="
chk "PHP hatası / uyarısı yok" '! grep -E "PHP (Fatal|Warning|Parse|Notice|Deprecated)" "$SLOG" >/dev/null'
[ -f "$RUN/storage/log/hata.log" ] && { grep -E "API hatası" "$RUN/storage/log/hata.log" | head -5; }
chk "uygulama hata günlüğünde API hatası yok" '! grep -qs "API hatası" "$RUN"/storage/log/*.log'

echo
echo "SONUÇ: $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
