#!/usr/bin/env bash
# P1 uçtan uca HTTP testleri (katalog, medya, SEO). php -S (4 işçi) + tests/http/router.php, SQLite dosya veritabanı.
# Canlı sitedeki yükseltme senaryosu: önce P0b sürümü (git: $P0B_REF) kurulum sihirbazıyla kurulur, sonra yeni kod
# üzerine kopyalanır; ilk API isteği eksik tabloları ve server listesini otomatik ekler. Tüm istekler rewrite'sız
# /api/v1/index.php?r=<yol>&<sorgu> biçimiyle yapılır (ön yüzün apiUrl() ile aynı).
# Kullanım: bash tests/http/p1.sh      (gerekenler: php 8.1+ gd, curl, jq, git)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((20000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p1-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
P0B_REF="${P0B_REF:-56f5c9c}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$P0B_REF^{commit}" 2>/dev/null; then
  git -C "$REPO" archive "$P0B_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: $P0B_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
  cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$RUN/"
  cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"; cp "$REPO/uploads/.htaccess" "$REPO/uploads/index.php" "$RUN/uploads/"
fi
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"

YP_TEST=1 PHP_CLI_SERVER_WORKERS=4 php -d display_errors=0 -d log_errors=1 -d upload_max_filesize=32M -d post_max_size=40M \
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
# ?r= biçimi: "listings?sec=tr&q=x" → /api/v1/index.php?r=listings&sec=tr&q=x
url() { local p="$1" q=""; case "$p" in *\?*) q="&${p#*\?}"; p="${p%%\?*}";; esac; echo "$B/api/v1/index.php?r=$p$q"; }
# api JAR METHOD PATH [json] [ek curl argümanları…] → CODE, BODY, HDRS
api() {
  local jar="$1" m="$2" p="$3" d="${4:-}"; shift 4 2>/dev/null || shift $#
  local out args=(-s -b "$jar" -c "$jar" -X "$m" -D "$RUN/h.txt" -w '\n%{http_code}')
  [ -n "$d" ] && args+=(-H 'Content-Type: application/json' --data "$d")
  out=$(curl "${args[@]}" "$@" "$(url "$p")")
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"; HDRS="$(cat "$RUN/h.txt")"
}
# up JAR CSRF DOSYA [tür] → CODE, BODY
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
sq() { php -r '$p=new PDO("sqlite:'"$RUN"'/storage/test.sqlite"); $v=$p->query($argv[1])->fetchColumn(); echo $v===false?"":$v;' "$1"; }

J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_B="$RUN/b.jar"; J_ADM="$RUN/adm.jar"; J_S="$RUN/s.jar"; J_X="$RUN/x.jar"

echo "=== 1. P0b kurulumu (canlıdaki sürüm: $P0B_REF) ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang P1" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam (kilit dosyası)" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
api "$J_X" GET boot ""
if [ "$UPGRADE" = 1 ]; then
  chk "P0b sürümünde katalog tabloları yok, boot servers yok" '[ "$CODE" = 200 ] && [ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_listings'\''")" ] && [ "$(j .data.servers)" = null ]'
  echo "=== 2. Yeni paket yüklenir (zip/FTP gibi üzerine kopyalama) → ilk istekte otomatik güncelleme ==="
  cp -a "$REPO/app" "$REPO/api" "$RUN/"
  cp "$REPO/uploads/.htaccess" "$RUN/uploads/.htaccess"
  sleep 3   # php -S işçilerindeki opcache (revalidate_freq=2) eski Kernel.php'yi bıraksın; canlıda da yükleme sonrası ~2 sn
fi
api "$J_X" GET boot ""
chk "ilk istek: tablolar eklendi, 283 server boot'ta" '[ "$CODE" = 200 ] && [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_listings'\''")" ] && [ "$(j ".data.servers | length")" = 283 ]'
chk "server S şekli (id sv…, c dizisi, n sayıları)" '[ "$(j .data.servers[0].id)" = sv1 ] && [ "$(j .data.servers[0].name)" = "Diamond Nite" ] && [ "$(j .data.servers[0].c[1])" = "#4fa3e8" ] && [ "$(j .data.servers[0].n.all)" = 0 ]'
chk "boot: listings [] + covers {} + users []" '[ "$(j ".data.listings | length")" = 0 ] && [ "$(j ".data.covers | type")" = object ] && [ "$(j ".data.users | length")" = 0 ]'
chk "güncelleme kaydı: audit_log + storage/log + imza" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''schema_update'\''")" = "$UPGRADE" ] && [ -f "$RUN/storage/cache/schema_ver.txt" ] && { [ "$UPGRADE" = 0 ] || grep -q "Veritabanı güncellendi" "$RUN"/storage/log/*.log; }'
chk "yönetici hesabı korundu" '[ "$(sq "SELECT COUNT(*) FROM yp_users WHERE role='\''admin'\''")" = 1 ]'
api "$J_X" GET boot ""
chk "ikinci istek: yeniden güncelleme yok" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''schema_update'\''")" = "$UPGRADE" ]'

echo "=== 3. Üyeler, yönetici, çalışan ==="
reg() { local jar="$1" name="$2" mail="$3" tel="$4"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\"}" -H "X-CSRF-Token: $cs"; }
reg "$J_A" Satici_A a@ornek.com "0555 111 22 01"; CS_A="$(j .data.csrf)"; UA="$(j .data.me.id)"
reg "$J_B" Alici_B b@ornek.com "0555 111 22 02"; CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
chk "A ve B kayıtlı" '[ -n "$UA" ] && [ "$UA" != null ] && [ -n "$UB" ] && [ "$UB" != null ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
chk "yönetici girişi" '[ "$(j .data.me.admin)" = true ]'
api "$J_ADM" POST admin/staff '{"name":"SrvCalisan","email":"s@yangpazar.com","ad":"Sena","soyad":"Ay","password":"Calisan-Sifre-1","perms":["server"]}' -H "X-CSRF-Token: $CS_ADM"
CS_S=$(csrf_of "$J_S"); api "$J_S" POST auth/login '{"login":"SrvCalisan","password":"Calisan-Sifre-1"}' -H "X-CSRF-Token: $CS_S"; CS_S="$(j .data.csrf)"
chk "çalışan ([server] yetkisi, [ilan] yok) girişi" '[ "$(j .data.me.perms[0])" = server ] && [ "$(j ".data.me.perms | length")" = 1 ]'

echo "=== 4. Medya yükleme ==="
php -r '
$d=$argv[1]; $mk=function($w,$h,$c){ $i=imagecreatetruecolor($w,$h); imagefill($i,0,0,imagecolorallocate($i,$c[0],$c[1],$c[2])); imagefilledellipse($i,(int)($w/2),(int)($h/2),(int)($w/2),(int)($h/2),imagecolorallocate($i,255,220,0)); return $i; };
imagejpeg($mk(2000,1500,[200,30,30]),"$d/a1.jpg",90); imagepng($mk(800,600,[30,200,30]),"$d/a2.png"); imagewebp($mk(640,640,[30,30,200]),"$d/a3.webp",80);
imagegif($mk(40,40,[9,9,9]),"$d/tiny.gif"); imagepng($mk(300,300,[100,100,100]),"$d/destek.png"); imagepng($mk(500,500,[10,10,10]),"$d/kapak.png");
file_put_contents("$d/kabuk.jpg","<?php echo shell_exec(\$_GET[\"c\"]); ?>");
file_put_contents("$d/kotu.svg","<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>alert(document.cookie)</script></svg>");
file_put_contents("$d/gif.php.gif", file_get_contents("$d/tiny.gif")."<?php system(\"id\"); ?>");
$f=fopen("$d/buyuk.jpg","wb"); fwrite($f,"\xFF\xD8\xFF\xE0"); ftruncate($f, 11*1048576); fclose($f);
' "$RUN"
up "$J_X" x "$RUN/a1.jpg"
chk "ziyaretçi yükleyemez (403 CSRF ya da 401)" '[ "$CODE" = 403 ] || [ "$CODE" = 401 ]'
out=$(curl -s -b "$J_A" -c "$J_A" -X POST -F "file=@$RUN/a1.jpg" -w '\n%{http_code}' "$(url media)"); CODE="${out##*$'\n'}"
chk "CSRF başlığı olmadan → 403" '[ "$CODE" = 403 ]'
M=()
for f in a1.jpg a2.png a3.webp; do up "$J_A" "$CS_A" "$RUN/$f"; M+=("$(j .data.media.id)"); chk "yükleme $f → 200, webp, ≤1600 px" '[ "$CODE" = 200 ] && [ "$(j .data.media.mime)" = image/webp ] && [ "$(j .data.media.w)" -le 1600 ] && [ "$(j .data.media.vis)" = public ]'; done
U1="$(j .data.media.url)"
up "$J_A" "$CS_A" "$RUN/a1.jpg"; chk "büyük JPEG 1600×1200'e küçültüldü" '[ "$(j .data.media.w)" = 1600 ] && [ "$(j .data.media.h)" = 1200 ]'
OUT=$(curl -s -o "$RUN/dl.bin" -w '%{http_code} %{content_type}' "$B$U1")
chk "herkese açık dosya doğrudan sunulur (/uploads/Y/m/…webp)" 'echo "$U1" | grep -Eq "^/uploads/[0-9]{4}/[0-9]{2}/[0-9a-f]{32}\.webp$" && [ "${OUT%% *}" = 200 ] && [ "$(head -c4 "$RUN/dl.bin")" = RIFF ]'
up "$J_A" "$CS_A" "$RUN/kabuk.jpg"; chk ".jpg adlı PHP → 422 (Türkçe)" '[ "$CODE" = 422 ] && echo "$(j .fields.file)" | grep -q "Bu dosya türü yüklenemez"'
up "$J_A" "$CS_A" "$RUN/kotu.svg"; chk "betikli SVG → 422" '[ "$CODE" = 422 ]'
up "$J_A" "$CS_A" "$RUN/gif.php.gif"; chk "GIF + PHP (polyglot) → 422" '[ "$CODE" = 422 ] && echo "$(j .fields.file)" | grep -q "geçersiz içerik"'
up "$J_A" "$CS_A" "$RUN/buyuk.jpg"; chk "11 MB → 422 çok büyük" '[ "$CODE" = 422 ] && echo "$(j .fields.file)" | grep -q "çok büyük"'
chk "reddedilen dosyalar diske yazılmadı (yalnız webp)" '[ -z "$(find "$RUN/uploads" -type f ! -name "*.webp" ! -name index.php ! -name .htaccess)" ]'
up "$J_A" "$CS_A" "$RUN/kapak.png" cover; chk "üye hazır görsel (cover) yükleyemez → 403" '[ "$CODE" = 403 ]'
up "$J_A" "$CS_A" "$RUN/a2.png" exe; chk "geçersiz tür → 422" '[ "$CODE" = 422 ]'

echo "=== 5. İlan ver (A, 3 görsel) ==="
SELL="{\"game\":\"metin2\",\"server\":\"sv1\",\"cat\":\"yang\",\"title\":\"1 Won Diamond Nite hızlı teslim, ara 0555 123 45 67\",\"price\":\"26,50\",\"stock\":120,\"del\":\"5 dk\",\"desc\":\"Satır bir\\ndiscord: ali#1\",\"media\":[\"${M[0]}\",\"${M[1]}\",\"${M[2]}\"]}"
api "$J_A" POST listings "$SELL" -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: sell-0001-aaaa"
L1="$(j .data.listing.id)"; NO1="$(j .data.listing.no)"
chk "ilan yayında, 3 görsel, fiyat TL, satıcı A" '[ "$CODE" = 200 ] && [ "$(j .data.listing.status)" = aktif ] && [ "$(j ".data.listing.imgs | length")" = 3 ] && [ "$(j .data.listing.price)" = 26.5 ] && [ "$(j .data.listing.seller)" = "$UA" ] && [ "$(j .data.listing.server)" = sv1 ]'
chk "başlık/açıklamadaki iletişim bilgisi gizlendi + flagged" 'j .data.listing.title | grep -q "\[gizlendi\]" && ! j .data.listing.title | grep -q 0555 && [ "$(j .data.flagged)" = true ] && [ "$(sq "SELECT COUNT(*) FROM yp_flagged")" = 2 ]'
chk "yanıtta patch.upsert.listings" '[ "$(j .patch.upsert.listings[0].id)" = "$L1" ]'
api "$J_A" POST listings "$SELL" -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: sell-0001-aaaa"
chk "aynı Idempotency-Key → aynı ilan, ikinci kayıt yok" '[ "$(j .data.listing.id)" = "$L1" ] && [ "$(sq "SELECT COUNT(*) FROM yp_listings")" = 1 ]'
api "$J_A" POST listings "{\"game\":\"metin2\",\"server\":\"sv2\",\"cat\":\"item\",\"title\":\"Görsel çalma denemesi\",\"price\":5,\"media\":[\"${M[0]}\"]}" -H "X-CSRF-Token: $CS_A"
chk "başka ilana bağlı görsel tekrar kullanılamaz → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.media)" != null ]'
api "$J_B" POST listings "{\"game\":\"metin2\",\"server\":\"sv2\",\"cat\":\"item\",\"title\":\"Başkasının görseli\",\"price\":5,\"media\":[\"${M[0]}\"]}" -H "X-CSRF-Token: $CS_B"
chk "başkasının görseli → 422" '[ "$CODE" = 422 ]'
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"item","title":"Dopingli ilan","price":10,"dop":{"vitrin":7}}' -H "X-CSRF-Token: $CS_A"
chk "doping → 400 doping_soon (yakında)" '[ "$CODE" = 400 ] && [ "$(j .code)" = doping_soon ] && j .error | grep -q yakında'
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"ep","title":"EP satıyorum","price":10}' -H "X-CSRF-Token: $CS_A"
chk "TR serverda EP ilanı → 422" '[ "$CODE" = 422 ] && j .fields.cat | grep -q "EP"'
api "$J_A" POST listings '{"game":"metin2","cat":"yang","title":"x","price":"abc"}' -H "X-CSRF-Token: $CS_A"
chk "doğrulama → 422 alanlar (server, title, price)" '[ "$CODE" = 422 ] && [ "$(j .fields.server)" != null ] && [ "$(j .fields.title)" != null ] && [ "$(j .fields.price)" != null ]'
api "$J_X" POST listings "$SELL"
chk "ziyaretçi ilan veremez" '[ "$CODE" = 403 ] || [ "$CODE" = 401 ]'
# PVP serverda bir ilan + birkaç ilan daha (sayfalama için)
api "$J_A" POST listings '{"game":"metin2","server":"sv20","cat":"item","title":"+9 Zehir Kılıcı","price":650,"stock":1,"del":"15 dk"}' -H "X-CSRF-Token: $CS_A"; LP="$(j .data.listing.id)"
for i in 1 2 3 4 5; do api "$J_A" POST listings "{\"game\":\"metin2\",\"server\":\"sv1\",\"cat\":\"karakter\",\"title\":\"Şaman karakter $i\",\"price\":$((i*100)),\"stock\":1}" -H "X-CSRF-Token: $CS_A"; done
chk "7 ilan oluştu" '[ "$(sq "SELECT COUNT(*) FROM yp_listings")" = 7 ]'

echo "=== 6. B listeler, filtreler, arar, açar ==="
api "$J_B" GET "listings?server=sv1" ""
chk "server filtresi: 6 ilan, satıcılar (herkese açık alanlar)" '[ "$(j ".data.listings | length")" = 6 ] && [ "$(j ".data.users | length")" = 1 ] && [ "$(j .data.users[0].name)" = Satici_A ] && [ "$(j .data.users[0].email)" = null ]'
api "$J_B" GET "listings?sec=tr&cat=yang" ""
chk "bölüm + kategori: yalnız Won ilanı" '[ "$(j ".data.listings | length")" = 1 ] && [ "$(j .data.listings[0].id)" = "$L1" ] && [ "$(j .data.listings[0].imgs[0])" != null ]'
api "$J_B" GET "listings?sec=pvp" ""
chk "sec=pvp: yalnız PVP ilanı" '[ "$(j ".data.listings | length")" = 1 ] && [ "$(j .data.listings[0].id)" = "$LP" ]'
api "$J_B" GET "listings?q=ZEHIR%20KILICI" ""
chk "arama TR katlamalı (ZEHIR KILICI → Zehir Kılıcı)" '[ "$(j ".data.listings | length")" = 1 ] && [ "$(j .data.listings[0].id)" = "$LP" ]'
api "$J_B" GET "listings?q=$NO1" ""
chk "ilan numarasıyla arama" '[ "$(j .data.listings[0].id)" = "$L1" ]'
api "$J_B" GET "listings?sort=ucuz&cat=karakter" ""
chk "sıralama ucuz: 100,200,…" '[ "$(j "[.data.listings[].price] | join(\",\")")" = "100,200,300,400,500" ]'
IDS=""; NEXT=""; for p in 1 2 3 4 5; do api "$J_B" GET "listings?limit=2${NEXT:+&after=$NEXT}" ""; IDS="$IDS $(j "[.data.listings[].id] | join(\" \")")"; NEXT="$(j .data.next)"; [ "$NEXT" = null ] && break; done
chk "keyset sayfalama: 7 ilan, tekrar yok, 4 sayfa" '[ "$(echo $IDS | wc -w)" = 7 ] && [ "$(echo $IDS | tr " " "\n" | sort -u | wc -l)" = 7 ] && [ "$p" = 4 ]'
api "$J_B" GET "search/suggest?q=diamond" ""
chk "öneri: server + ilan" '[ "$(j .data.servers[0].name)" = "Diamond Nite" ] && [ "$(j ".data.listings | length")" -ge 1 ]'
api "$J_B" GET "listings/$L1" ""
chk "ayrıntı: görüntülenme 1, satıcı ve server" '[ "$CODE" = 200 ] && [ "$(j .data.listing.views)" = 1 ] && [ "$(j .data.users[0].id)" = "$UA" ] && [ "$(j .data.server.id)" = sv1 ] && [ "$(j ".data.listing.media | length")" = 3 ]'
api "$J_B" GET "listings/$L1" ""
chk "aynı IP 30 dk içinde tekrar sayılmaz" '[ "$(j .data.listing.views)" = 1 ]'
rl_reset; api "$J_A" GET "listings/$L1" ""
chk "sahibinin bakışı sayılmaz" '[ "$(j .data.listing.views)" = 1 ] && [ "$(j .data.own)" = true ]'
rl_reset; api "$J_X" GET "listings/$L1" ""
chk "başka ziyaretçi → 2" '[ "$(j .data.listing.views)" = 2 ]'
api "$J_X" GET "users/$UA" ""
chk "herkese açık profil: 7 aktif ilan, e-posta yok" '[ "$(j .data.user.name)" = Satici_A ] && [ "$(j .data.active)" = 7 ] && [ "$(j .data.user.email)" = null ] && [ "$(j .data.user.tel)" = null ]'
api "$J_X" GET boot ""
chk "boot: ilk sayfa ilanlar + satıcılar + server sayıları" '[ "$(j ".data.listings | length")" = 7 ] && [ "$(j .data.users[0].id)" = "$UA" ] && [ "$(j ".data.servers[] | select(.id==\"sv1\") | .n.all")" = 6 ] && [ "$(j ".data.servers[] | select(.id==\"sv1\") | .n.karakter")" = 5 ]'

echo "=== 7. Sahibin işlemleri ==="
api "$J_B" PUT "listings/$L1" '{"title":"Çalındı"}' -H "X-CSRF-Token: $CS_B"
chk "B, A'nın ilanını düzenleyemez → 403" '[ "$CODE" = 403 ]'
api "$J_B" POST "listings/$L1/unlist" "" -H "X-CSRF-Token: $CS_B"
chk "B kaldıramaz → 403" '[ "$CODE" = 403 ]'
api "$J_A" PUT "listings/$L1" "{\"title\":\"1 Won Diamond Nite — toptan\",\"price\":25.9,\"stock\":80,\"media\":[\"${M[1]}\"]}" -H "X-CSRF-Token: $CS_A"
chk "A düzenler: başlık, fiyat, stok, görsel 1" '[ "$CODE" = 200 ] && [ "$(j .data.listing.title)" = "1 Won Diamond Nite — toptan" ] && [ "$(j .data.listing.price)" = 25.9 ] && [ "$(j .data.listing.stock)" = 80 ] && [ "$(j ".data.listing.imgs | length")" = 1 ]'
chk "çıkarılan görseller sahipsiz kaldı (cron siler)" '[ "$(sq "SELECT COUNT(*) FROM yp_media WHERE ref_type='\''listing'\''")" = 1 ]'
api "$J_A" POST "listings/$L1/free-bump" "" -H "X-CSRF-Token: $CS_A"
chk "ücretsiz üste taşı → 200" '[ "$CODE" = 200 ] && [ "$(j .data.listing.freeBump)" -gt 0 ]'
api "$J_A" POST "listings/$L1/free-bump" "" -H "X-CSRF-Token: $CS_A"
chk "2 saat dolmadan tekrar → 429 (… dk sonra)" '[ "$CODE" = 429 ] && j .error | grep -q "dk sonra"'
api "$J_B" GET "listings?limit=1" ""
chk "üste taşınan ilan en üstte" '[ "$(j .data.listings[0].id)" = "$L1" ]'
api "$J_A" POST "listings/$LP/unlist" "" -H "X-CSRF-Token: $CS_A"
chk "A kendi ilanını kaldırır" '[ "$(j .data.listing.status)" = kaldirildi ]'
api "$J_B" GET "listings/$LP" ""
chk "kaldırılan ilan B'ye 404" '[ "$CODE" = 404 ]'
api "$J_A" GET me/listings ""
chk "me/listings: tüm durumlar (kaldırılan dahil)" '[ "$(j ".data.listings | length")" = 7 ] && [ "$(j "[.data.listings[] | select(.status==\"kaldirildi\")] | length")" = 1 ]'

echo "=== 8. Moderasyon ==="
api "$J_S" PUT admin/settings/moderation '{"on":true}' -H "X-CSRF-Token: $CS_S"
chk "[ilan] yetkisiz çalışan moderasyonu açamaz → 403" '[ "$CODE" = 403 ]'
api "$J_B" PUT admin/settings/moderation '{"on":true}' -H "X-CSRF-Token: $CS_B"
chk "üye → 403" '[ "$CODE" = 403 ]'
api "$J_ADM" PUT admin/settings/moderation '{"on":true}' -H "X-CSRF-Token: $CS_ADM"
chk "yönetici moderasyonu açar (patch.set.moderation)" '[ "$CODE" = 200 ] && [ "$(j .patch.set.moderation)" = true ]'
api "$J_A" POST listings '{"game":"metin2","server":"sv3","cat":"item","title":"Onay bekleyen kalkan","price":240}' -H "X-CSRF-Token: $CS_A"
LM="$(j .data.listing.id)"
chk "yeni ilan beklemede + mesaj" '[ "$(j .data.listing.status)" = beklemede ] && j .msg | grep -q "onaya gönderildi"'
api "$J_B" GET "listings/$LM" ""; chk "beklemedeki ilan B'ye 404" '[ "$CODE" = 404 ]'
api "$J_B" GET "listings?server=sv3" ""; chk "listede görünmez" '[ "$(j ".data.listings | length")" = 0 ]'
api "$J_A" GET "listings/$LM" ""; chk "sahibi görür" '[ "$CODE" = 200 ] && [ "$(j .data.listing.status)" = beklemede ]'
api "$J_ADM" GET admin/today ""; chk "Bugün: onay kuyruğu 1, engellenen 2" '[ "$(j .data.queues.listings)" = 1 ] && [ "$(j .data.queues.flagged)" = 2 ]'
api "$J_ADM" GET "admin/listings?status=beklemede" ""; chk "admin/listings kuyruğu" '[ "$(j .data.listings[0].id)" = "$LM" ] && [ "$(j .data.pending)" = 1 ]'
api "$J_S" GET "admin/listings" ""; chk "[ilan] yetkisiz çalışan kuyruğu göremez → 403" '[ "$CODE" = 403 ]'
api "$J_S" POST "admin/listings/$LM/approve" "" -H "X-CSRF-Token: $CS_S"; chk "[ilan] yetkisiz çalışan onaylayamaz → 403" '[ "$CODE" = 403 ]'
api "$J_A" POST "admin/listings/$LM/approve" "" -H "X-CSRF-Token: $CS_A"; chk "satıcı kendi ilanını onaylayamaz → 403" '[ "$CODE" = 403 ]'
api "$J_ADM" POST "admin/listings/$LM/approve" "" -H "X-CSRF-Token: $CS_ADM"; chk "yönetici onaylar" '[ "$CODE" = 200 ] && [ "$(j .data.listing.status)" = aktif ]'
api "$J_B" GET "listings/$LM" ""; chk "onaydan sonra B görür" '[ "$CODE" = 200 ]'
chk "satıcıya bildirim (onay) + audit" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE ev='\''listing_ok'\''")" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''listing_approve'\''")" = 1 ]'
api "$J_ADM" POST "admin/listings/$LM/remove" '{"reason":"Kural dışı"}' -H "X-CSRF-Token: $CS_ADM"; chk "yönetici kaldırır" '[ "$(j .data.listing.status)" = kaldirildi ]'
api "$J_B" GET "listings/$LM" ""; chk "kaldırılan B'ye 404" '[ "$CODE" = 404 ]'
api "$J_A" PUT "listings/$LM" '{"title":"Geri getirme denemesi"}' -H "X-CSRF-Token: $CS_A"; chk "yönetimin kaldırdığı ilan düzenlenemez → 409" '[ "$CODE" = 409 ]'
chk "satıcıya bildirim (kaldırma, gerekçeli)" '[ "$(sq "SELECT COUNT(*) FROM yp_notifications WHERE ev='\''listing_no'\'' AND x LIKE '\''%Kural dışı%'\''")" = 1 ]'
api "$J_ADM" PUT admin/settings/moderation '{"on":false}' -H "X-CSRF-Token: $CS_ADM"

echo "=== 9. Serverlar (yönetim) ==="
api "$J_B" POST admin/servers '{"name":"Hack2","sec":"pvp"}' -H "X-CSRF-Token: $CS_B"; chk "üye server ekleyemez → 403" '[ "$CODE" = 403 ]'
api "$J_S" POST admin/servers '{"name":"Yeni Server2","sec":"pvp","type":"Emek","lv":"1-99","c":["#112233","#445566"],"url":"https://ornek.com","ep":true}' -H "X-CSRF-Token: $CS_S"
SV="$(j .data.server.id)"
chk "[server] çalışanı ekler: slug, renk, EP" '[ "$CODE" = 200 ] && [ "$(j .data.server.slug)" = yeni-server2 ] && [ "$(j .data.server.c[0])" = "#112233" ] && [ "$(j .data.server.ep)" = true ]'
api "$J_S" POST admin/servers '{"name":"Kötü","url":"javascript:alert(1)","c":["red","#000000"]}' -H "X-CSRF-Token: $CS_S"
chk "doğrulama: url ve renk → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.url)" != null ] && [ "$(j .fields.c)" != null ]'
api "$J_X" GET servers ""; chk "herkese açık listede (284)" '[ "$(j ".data.servers | length")" = 284 ] && [ "$(j ".data.servers[] | select(.id==\"$SV\") | .name")" = "Yeni Server2" ]'
api "$J_S" PUT "admin/servers/$SV" '{"name":"Yenilenen Server2","desc":"Açıklama","active":false}' -H "X-CSRF-Token: $CS_S"
chk "düzenle: ad → yeni slug, gizle" '[ "$(j .data.server.slug)" = yenilenen-server2 ] && [ "$(j .data.server.hidden)" = true ]'
api "$J_X" GET servers ""; chk "gizlenen server herkese açık listede yok" '[ "$(j ".data.servers | length")" = 283 ]'
api "$J_S" GET admin/servers ""; chk "yönetim listesinde gizli olan da var" '[ "$(j ".data.servers | length")" = 284 ]'
api "$J_S" DELETE "admin/servers/sv1" "" -H "X-CSRF-Token: $CS_S"; chk "aktif ilanı olan server silinemez → 409" '[ "$CODE" = 409 ] && j .error | grep -q "aktif"'
api "$J_S" DELETE "admin/servers/$SV" "" -H "X-CSRF-Token: $CS_S"; chk "boş server silinir (yumuşak) + patch.remove" '[ "$CODE" = 200 ] && [ "$(j .patch.remove.servers[0])" = "$SV" ] && [ -n "$(sq "SELECT deleted_at FROM yp_servers WHERE id=${SV#sv}")" ]'
api "$J_S" GET "admin/servers" ""; chk "silinen server listelerde yok" '[ "$(j ".data.servers | length")" = 283 ]'
api "$J_S" PUT "admin/servers/$SV" '{"name":"X"}' -H "X-CSRF-Token: $CS_S"; chk "silinen server düzenlenemez → 404" '[ "$CODE" = 404 ]'
chk "server işlemleri audit_log'da" '[ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action IN ('\''server_add'\'','\''server_save'\'','\''server_del'\'')")" = 3 ]'

echo "=== 10. Hazır ilan görselleri ==="
up "$J_ADM" "$CS_ADM" "$RUN/kapak.png" cover; MC="$(j .data.media.id)"
chk "yönetici cover yükler (1000 px sınırı)" '[ "$CODE" = 200 ] && [ "$(j .data.media.kind)" = cover ]'
api "$J_S" PUT admin/covers/yang-3 "{\"media\":\"$MC\"}" -H "X-CSRF-Token: $CS_S"; chk "[ilan] yetkisiz → 403" '[ "$CODE" = 403 ]'
api "$J_ADM" PUT admin/covers/yang-3 "{\"media\":\"$MC\"}" -H "X-CSRF-Token: $CS_ADM"
chk "kapak atandı (patch.replace.covers)" '[ "$CODE" = 200 ] && j ".patch.replace.covers[\"yang-3\"]" | grep -q "^/uploads/"'
api "$J_ADM" PUT admin/covers/yang-99 "{\"media\":\"$MC\"}" -H "X-CSRF-Token: $CS_ADM"; chk "geçersiz anahtar → 404" '[ "$CODE" = 404 ]'
api "$J_X" GET boot ""; chk "boot.covers" 'j ".data.covers[\"yang-3\"]" | grep -q "^/uploads/"'
api "$J_ADM" DELETE admin/covers/yang-3 "" -H "X-CSRF-Token: $CS_ADM"; chk "varsayılana dön" '[ "$CODE" = 200 ] && [ "$(j ".data.covers | length")" = 0 ]'

echo "=== 11. Özel medya (yetki denetimli) ==="
up "$J_A" "$CS_A" "$RUN/destek.png" support; MP="$(j .data.media.id)"; UP="$(j .data.media.url)"
chk "özel dosya: storage/media'da (uploads'ta değil), adres API üzerinden" '[ "$(j .data.media.vis)" = private ] && [ "$UP" = "/api/v1/index.php?r=media/$MP" ] && [ "$(find "$RUN/storage/media" -type f -name "*.webp" | wc -l)" = 1 ]'
api "$J_X" GET "media/$MP" ""; chk "ziyaretçi → 401" '[ "$CODE" = 401 ]'
api "$J_B" GET "media/$MP" ""; chk "başka üye → 403" '[ "$CODE" = 403 ]'
api "$J_S" GET "media/$MP" ""; chk "ilgisiz yetkili çalışan ([server]) → 403" '[ "$CODE" = 403 ]'
OUT=$(curl -s -b "$J_A" -o "$RUN/p.bin" -D "$RUN/ph.txt" -w '%{http_code}' "$(url "media/$MP")")
chk "sahibi → 200 görsel + sandbox CSP + nosniff" '[ "$OUT" = 200 ] && [ "$(head -c4 "$RUN/p.bin")" = RIFF ] && grep -qi "^content-type: image/webp" "$RUN/ph.txt" && grep -qi "^content-security-policy:.*sandbox" "$RUN/ph.txt" && grep -qi "^x-content-type-options: nosniff" "$RUN/ph.txt"'
OUT=$(curl -s -b "$J_ADM" -o /dev/null -w '%{http_code}' "$(url "media/$MP")"); chk "yönetici → 200" '[ "$OUT" = 200 ]'
OUT=$(curl -s -o /dev/null -w '%{http_code}' "$B/storage/media/"); chk "storage/media doğrudan erişilemez → 403" '[ "$OUT" = 403 ]'
OUT=$(curl -s -o /dev/null -w '%{http_code}' "$(url "media/${M[1]}")"); chk "herkese açık dosya API ile de sunulur" '[ "$OUT" = 200 ]'
api "$J_X" GET "media/m999999" ""; chk "olmayan → 404" '[ "$CODE" = 404 ]'

echo "=== 12. SEO: sitemap, robots, meta ==="
OUT=$(curl -s -w '\n%{http_code}' "$B/sitemap.xml"); CODE="${OUT##*$'\n'}"; BODY="${OUT%$'\n'*}"
chk "/sitemap.xml (dosya yokken API) → XML, ilan + server adresleri" '[ "$CODE" = 200 ] && echo "$BODY" | grep -q "<urlset" && echo "$BODY" | grep -q "/server/diamond-nite</loc>" && echo "$BODY" | grep -q "\-$L1</loc>" && ! echo "$BODY" | grep -q "\-$LM</loc>"'
OUT=$(curl -s -w '\n%{http_code}' "$(url seo/robots.txt)"); CODE="${OUT##*$'\n'}"; BODY="${OUT%$'\n'*}"
chk "robots.txt (?r= ile) → Sitemap satırı" '[ "$CODE" = 200 ] && echo "$BODY" | grep -q "Sitemap: http://127.0.0.1:$PORT/sitemap.xml" && echo "$BODY" | grep -q "Disallow: /yonetim"'
( cd "$RUN" && YP_TEST=1 php app/cron.php >"$RUN/cron.out" 2>&1 )
chk "cron: sitemap.xml + robots.txt site köküne gerçek dosya" '[ -f "$RUN/sitemap.xml" ] && [ -f "$RUN/robots.txt" ] && grep -q "\-$L1</loc>" "$RUN/sitemap.xml" && grep -q "\"seo\"" "$RUN/cron.out"'
OUT=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$B/robots.txt"); chk "/robots.txt statik dosya" '[ "${OUT%% *}" = 200 ]'
api "$J_X" GET "seo/meta?path=/ilan/herhangi-$L1" ""
chk "seo/meta: ilan başlığı, canonical (başlıktan slug), Product JSON-LD" '[ "$CODE" = 200 ] && [ "$(j .data.title)" = "1 Won Diamond Nite — toptan | Yang P1" ] && [ "$(j .data.canonical)" = "$B/ilan/1-won-diamond-nite-toptan-$L1" ] && [ "$(j ".data.ld[0][\"@type\"]")" = Product ] && [ "$(j .data.ld[0].offers.price)" = 25.9 ]'
api "$J_X" GET "seo/meta?path=/ilan/x-$LM" ""; chk "seo/meta: kaldırılan ilan noindex" '[ "$(j .data.robots)" = "noindex, follow" ]'

echo "=== 13. Sınırlar ve diğer ==="
api "$J_S" GET admin/system/update ""; chk "güncelleme durumu [bakim] olmadan → 403" '[ "$CODE" = 403 ]'
api "$J_ADM" GET admin/system/update ""; chk "güncelleme durumu: güncel, göçler listede" '[ "$(j .data.upToDate)" = true ] && j "[.data.migrations[].v] | join(\" \")" | grep -q "m:0002_catalog_seed"'
api "$J_ADM" POST admin/system/update "" -H "X-CSRF-Token: $CS_ADM"; chk "Güncellemeleri uygula → zaten güncel" '[ "$CODE" = 200 ] && j .msg | grep -q "zaten güncel"'
api "$J_ADM" GET "admin/search?q=toptan" ""; chk "komut paleti araması ilanları bulur" '[ "$(j .data.listings[0].id)" = "$L1" ]'
rl_reset; N429=0; N200=0
for i in $(seq 1 31); do up "$J_B" "$CS_B" "$RUN/tiny.gif"; [ "$CODE" = 200 ] && N200=$((N200+1)); [ "$CODE" = 429 ] && N429=$((N429+1)); done
chk "yükleme hız sınırı: 30/10 dk, 31. → 429" '[ "$N200" = 30 ] && [ "$N429" = 1 ]'
rl_reset
chk "sunucu günlüğünde PHP uyarısı/hatası yok" '! grep -Eiq "PHP (Warning|Notice|Fatal|Deprecated)" "$SLOG"'

echo
echo "SONUÇ (http p1): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
