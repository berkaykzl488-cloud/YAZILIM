#!/usr/bin/env bash
# SEO uçtan uca HTTP testleri: canlı paket (tools/build.php --prod) + php -S + tests/http/router.php (kök .htaccess karşılığı), SQLite.
#   - rewrite doğrulanmadan: ?p= yedek adresleri (sayfa, canonical, site haritası), eski ?p= biçimleri → 301
#   - rewrite denetimi (/metin2-pvp?yp_probe=…) → temiz adresler: her adres türü 200 + başlık + canonical + konum çubuğu JSON-LD
#     + önceden oluşturulmuş içerik; eski biçimler (/server/…, /ilan/…, ?p=, sonda /, /server-sv3-yang) → 301; bilinmeyen → 404
#   - site haritası yeni adreslerle (özel/yakında yok), robots.txt; Yönetim › SEO API'si (denetim başarısız → ?p=, kendiliğinden düzelme,
#     temiz adres anahtarı)
# Kullanım: bash tests/http/seo.sh      (gerekenler: php 8.1+, curl, jq)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((22000 + RANDOM % 2000))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-seo-XXXXXX")"
SITE="$RUN/site"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"

php "$REPO/tools/build.php" --prod --out="$SITE" >"$RUN/build.out" 2>&1 || { cat "$RUN/build.out"; exit 1; }
YP_TEST=1 PHP_CLI_SERVER_WORKERS=4 php -d display_errors=0 -d log_errors=1 -S 127.0.0.1:$PORT -t "$SITE" "$REPO/tests/http/router.php" >"$SLOG" 2>&1 &
SRV=$!
cleanup() { kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; [ "${KEEP:-0}" = 1 ] && echo "çalışma klasörü: $RUN" || rm -rf "$RUN"; }
trap cleanup EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "$B/api/durum.php" && break; sleep 0.1; done

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      → ${2:0:700}"; }
chk() { if eval "$2"; then ok "$1"; else bad "$1" "${INFO:-${BODY:-}}"; fi; INFO=""; }
j()   { echo "$BODY" | jq -r "$1" 2>/dev/null; }
url() { local p="$1" q=""; case "$p" in *\?*) q="&${p#*\?}"; p="${p%%\?*}";; esac; echo "$B/api/v1/index.php?r=$p$q"; }
api() {
  local jar="$1" m="$2" p="$3" d="${4:-}"; shift 4 2>/dev/null || shift $#
  local out args=(-s -b "$jar" -c "$jar" -X "$m" -w '\n%{http_code}')
  [ -n "$d" ] && args+=(-H 'Content-Type: application/json' --data "$d")
  out=$(curl "${args[@]}" "$@" "$(url "$p")")
  CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
}
# page PATH → CODE, BODY (HTML), HDRS, LOC (301 hedefi, yönlendirme izlenmez)
page() { local out; out=$(curl -s -D "$RUN/h.txt" -w '\n%{http_code}' "$B$1"); CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"; HDRS="$(tr -d '\r' <"$RUN/h.txt")"
  LOC="$(echo "$HDRS" | sed -n 's/^[Ll]ocation: //p' | head -1)"; INFO="$1 → $CODE ${LOC:+Location: $LOC }$(echo "$BODY" | grep -o '<title>[^<]*</title>' | head -1) $(echo "$BODY" | grep -o '<link rel="canonical"[^>]*>' | head -1)"; }
title() { echo "$BODY" | sed -n 's:.*<title>\([^<]*\)</title>.*:\1:p' | head -1; }
canon() { echo "$BODY" | sed -n 's:.*<link rel="canonical" href="\([^"]*\)">.*:\1:p' | head -1; }
robots() { echo "$BODY" | sed -n 's:.*<meta name="robots" content="\([^"]*\)">.*:\1:p' | head -1; }
crumbs() { echo "$BODY" | sed -n 's:.*<script type="application/ld+json" id="ldjson">\(.*\)</script>.*:\1:p' | head -1 | jq -r '[.["@graph"][] | select(.["@type"]=="BreadcrumbList") | .itemListElement[].name] | join(" › ")' 2>/dev/null; }
crumbUrls() { echo "$BODY" | sed -n 's:.*<script type="application/ld+json" id="ldjson">\(.*\)</script>.*:\1:p' | head -1 | jq -r '[.["@graph"][] | select(.["@type"]=="BreadcrumbList") | .itemListElement[].item] | join(" ")' 2>/dev/null; }
ldtype() { echo "$BODY" | sed -n 's:.*<script type="application/ld+json" id="ldjson">\(.*\)</script>.*:\1:p' | head -1 | jq -r "[.[\"@graph\"][] | select(.[\"@type\"]==\"$1\")] | .[0] $2" 2>/dev/null; }
hdr() { echo "$HDRS" | sed -n "s/^$1: //Ip" | head -1; }
sq() { php -r '$p=new PDO("sqlite:'"$SITE"'/storage/test.sqlite"); $v=$p->query($argv[1])->fetchColumn(); echo $v===false?"":$v;' "$1"; }
kur() {
  local jar="$1"; shift
  local csrf; csrf=$(curl -s -b "$jar" -c "$jar" "$B/kurulum/" | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//')
  local args=(-s -L -b "$jar" -c "$jar" -o /dev/null --data-urlencode "csrf=$csrf")
  for kv in "$@"; do args+=(--data-urlencode "$kv"); done
  curl "${args[@]}" "$B/kurulum/"
}
J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_ADM="$RUN/adm.jar"

echo "=== 1. kurulum + veri ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$SITE/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang SEO" site_url="$B"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$SITE/storage/kurulum_tamam.php" ]'
api "$J_A" GET boot ""; CS=$(j .data.csrf)
api "$J_A" POST auth/register '{"name":"Satici_Seo","email":"seo@ornek.com","tel":"0555 111 22 09","ad":"Seo","soyad":"Satıcı","password":"Uye-Sifre-123"}' -H "X-CSRF-Token: $CS"; CS="$(j .data.csrf)"
PV="$(sq "SELECT id FROM yp_servers WHERE sec='pvp' AND active=1 AND deleted_at IS NULL ORDER BY id LIMIT 1")"
PVS="$(sq "SELECT slug FROM yp_servers WHERE id=$PV")"; PVN="$(sq "SELECT name FROM yp_servers WHERE id=$PV")"
TRS="$(sq "SELECT slug FROM yp_servers WHERE id=1")"; TRN="$(sq "SELECT name FROM yp_servers WHERE id=1")"
api "$J_A" POST listings "{\"game\":\"metin2\",\"server\":\"sv$PV\",\"cat\":\"karakter\",\"title\":\"Ejder Kılıcı +9 Efsunlu Şaman\",\"price\":\"150\",\"stock\":1,\"del\":\"5 dk\",\"desc\":\"Çok güçlü karakter.\"}" -H "X-CSRF-Token: $CS"
LK="$(j .data.listing.id)"
api "$J_A" POST listings "{\"game\":\"metin2\",\"server\":\"sv1\",\"cat\":\"yang\",\"title\":\"1 Won hızlı teslim\",\"price\":\"26,50\",\"stock\":50,\"del\":\"5 dk\"}" -H "X-CSRF-Token: $CS"
LW="$(j .data.listing.id)"
chk "iki ilan (PVP karakter, TR won)" '[ -n "$LK" ] && [ "$LK" != null ] && [ -n "$LW" ] && [ "$LW" != null ] && [ -n "$PVS" ]'
KP="/metin2-pvp/$PVS/karakter/ejder-kilici-9-efsunlu-saman-$LK"
WP="/metin2-tr/$TRS/won/1-won-hizli-teslim-$LW"

echo "=== 2. rewrite doğrulanmadı: ?p= yedeği ==="
chk "rewrite denetimi kaydı yok" '[ -z "$(sq "SELECT v FROM yp_settings WHERE k='\''seo'\''")" ]'
page "/?p=${KP#/}"
chk "?p= ile ilan: 200, başlık, canonical ?p= adresi" '[ "$CODE" = 200 ] && [ "$(title)" = "Ejder Kılıcı +9 Efsunlu Şaman · $PVN | Yang SEO" ] && [ "$(canon)" = "$B/?p=${KP#/}" ]'
chk "?p= ile ilan: konum çubuğu Ana Sayfa › Metin2 PVP › server › Karakter › ilan" '[ "$(crumbs)" = "Ana Sayfa › Metin2 PVP › $PVN › Karakter › Ejder Kılıcı +9 Efsunlu Şaman" ] && crumbUrls | grep -q "$B/?p=metin2-pvp/$PVS/karakter "'
chk "boot: adres kipi p" 'echo "$BODY" | grep -q "\"mode\":\"p\""'
page "/index.php?p=server/$PVS"
chk "p kipinde eski ?p=server/<slug> → 301 /?p=metin2-pvp/<slug>" '[ "$CODE" = 301 ] && [ "$LOC" = "/?p=metin2-pvp/$PVS" ]'
page "/?p=ilan/eski-$LK&utm_source=x"
chk "p kipinde ?p=ilan/… → 301 hiyerarşik ?p= (utm korunur)" '[ "$CODE" = 301 ] && [ "$LOC" = "/?p=${KP#/}&utm_source=x" ]'
OUT=$(curl -s "$B/sitemap.xml")
chk "site haritası (p kipi): ?p= adresleri" 'echo "$OUT" | grep -q "<loc>$B/?p=metin2-pvp/$PVS</loc>" && echo "$OUT" | grep -q "<loc>$B/?p=${KP#/}</loc>"'

echo "=== 3. rewrite denetimi ==="
page "/metin2-pvp?yp_probe=1"
chk "denetim yanıtı: 200 + X-YP-Page: probe" '[ "$CODE" = 200 ] && [ "$(hdr X-YP-Page)" = probe ] && [ "$BODY" = ok ]'
chk "temiz adresle gelen istek kaydedildi (rw.ok)" '[ "$(sq "SELECT v FROM yp_settings WHERE k='\''seo'\''" | jq -r .rw.ok)" = true ]'
chk "kip değişince sitemap.xml site köküne temiz adreslerle yazıldı" '[ -f "$SITE/sitemap.xml" ] && grep -q "<loc>$B/metin2-pvp/$PVS</loc>" "$SITE/sitemap.xml"'

echo "=== 4. temiz adresler: her adres türü ==="
page "/"
chk "ana sayfa: 200, başlık, canonical, WebSite+SearchAction, Organization" '[ "$CODE" = 200 ] && [ "$(title)" = "Yang SEO · Metin2 Item, Yang, Won, EP ve Karakter Pazarı" ] && [ "$(canon)" = "$B/" ] && [ "$(ldtype WebSite .potentialAction.target.urlTemplate)" = "$B/ara?q={search_term_string}" ] && [ "$(ldtype Organization .name)" = "Yang SEO" ]'
chk "ana sayfa: önceden oluşturulmuş içerik (H1, bölüm + server + ilan bağlantıları)" 'echo "$BODY" | grep -q "<main id=\"app\"><div class=\"wrap ssr\" data-ssr><h1>" && echo "$BODY" | grep -q "href=\"/metin2-pvp\"" && echo "$BODY" | grep -q "href=\"/metin2-pvp/$PVS\"" && echo "$BODY" | grep -q "href=\"$KP\"" && [ "$(hdr X-YP-Page)" = home ]'
chk "ana sayfa: boot kipi clean" 'echo "$BODY" | grep -q "\"mode\":\"clean\""'
page "/metin2-pvp"
chk "/metin2-pvp: başlık, canonical, konum çubuğu, server listesi" '[ "$CODE" = 200 ] && [ "$(title)" = "Metin2 PVP Serverlar · Item, Yang ve EP İlanları | Yang SEO" ] && [ "$(canon)" = "$B/metin2-pvp" ] && [ "$(crumbs)" = "Ana Sayfa › Metin2 PVP Serverlar · Item, Yang ve EP İlanları" ] && echo "$BODY" | grep -q "href=\"/metin2-pvp/$PVS\">$PVN</a> (1 ilan)"'
page "/metin2-tr"
chk "/metin2-tr: 200, kendi başlığı ve canonical" '[ "$CODE" = 200 ] && [ "$(title)" = "Metin2 TR Won, Yang ve Item İlanları | Yang SEO" ] && [ "$(canon)" = "$B/metin2-tr" ]'
page "/metin2-pvp/$PVS"
chk "server sayfası: başlık, canonical, Ana Sayfa › Metin2 PVP › server" '[ "$CODE" = 200 ] && title | grep -q "^$PVN Yang, Item" && [ "$(canon)" = "$B/metin2-pvp/$PVS" ] && [ "$(crumbs)" = "Ana Sayfa › Metin2 PVP › $PVN" ]'
chk "server sayfası: kategori bağlantıları ve son ilanlar" 'echo "$BODY" | grep -q "href=\"/metin2-pvp/$PVS/karakter\"" && echo "$BODY" | grep -q "href=\"/metin2-pvp/$PVS/yang\"" && echo "$BODY" | grep -q "href=\"$KP\""'
page "/metin2-pvp/$PVS/karakter"
chk "server + kategori: başlık, canonical, Ana Sayfa › Metin2 PVP › server › Karakter" '[ "$CODE" = 200 ] && [ "$(title)" = "$PVN Karakter İlanları | Yang SEO" ] && [ "$(canon)" = "$B/metin2-pvp/$PVS/karakter" ] && [ "$(crumbs)" = "Ana Sayfa › Metin2 PVP › $PVN › Karakter" ] && [ "$(robots)" = "index, follow, max-image-preview:large" ]'
page "/metin2-pvp/$PVS/item"
chk "ilanı olmayan kategori: 200 + noindex, canonical yok" '[ "$CODE" = 200 ] && [ "$(robots)" = "noindex, follow" ] && [ -z "$(canon)" ]'
page "$KP"
chk "ilan: başlık, canonical, konum çubuğu" '[ "$CODE" = 200 ] && [ "$(canon)" = "$B$KP" ] && [ "$(crumbs)" = "Ana Sayfa › Metin2 PVP › $PVN › Karakter › Ejder Kılıcı +9 Efsunlu Şaman" ]'
chk "ilan: Product + Offer (TRY, InStock, fiyat), og:type product" '[ "$(ldtype Product .offers.priceCurrency)" = TRY ] && [ "$(ldtype Product .offers.availability)" = "https://schema.org/InStock" ] && [ "$(ldtype Product .offers.price)" = 150 ] && [ "$(ldtype Product .offers.url)" = "$B$KP" ] && echo "$BODY" | grep -q "property=\"og:type\" content=\"product\""'
chk "ilan: önceden oluşturulmuş içerik (H1, fiyat, açıklama)" 'echo "$BODY" | grep -q "<h1>Ejder Kılıcı +9 Efsunlu Şaman</h1>" && echo "$BODY" | grep -q "150 ₺" && echo "$BODY" | grep -q "Çok güçlü karakter."'
page "$WP"
chk "TR ilanı: /metin2-tr/<server>/won/…, konum çubuğu Won" '[ "$CODE" = 200 ] && [ "$(canon)" = "$B$WP" ] && [ "$(crumbs)" = "Ana Sayfa › Metin2 TR › $TRN › Won › 1 Won hızlı teslim" ]'
page "/metin2-tr/$TRS/won"
chk "TR won kategorisi: başlık Won İlanları" '[ "$CODE" = 200 ] && [ "$(title)" = "$TRN Won İlanları | Yang SEO" ]'
page "/sayfa/kvkk"
chk "/sayfa/kvkk: başlık ve canonical" '[ "$CODE" = 200 ] && [ "$(title)" = "KVKK Aydınlatma Metni | Yang SEO" ] && [ "$(canon)" = "$B/sayfa/kvkk" ]'
page "/guvenli"
chk "/guvenli: başlık ve canonical" '[ "$CODE" = 200 ] && title | grep -q "^Güvenli Alışveriş" && [ "$(canon)" = "$B/guvenli" ]'
page "/borsa"
chk "/borsa (P4: açık): 200, dizine eklenir, başlık ve canonical" '[ "$CODE" = 200 ] && [ "$(robots)" != "noindex, follow" ] && [ "$(canon)" = "$B/borsa" ] && title | grep -q "^Yang Borsası"'
page "/metin2-ep"
chk "/metin2-ep (P4: açık): 200, dizine eklenir, başlık ve canonical" '[ "$CODE" = 200 ] && [ "$(robots)" != "noindex, follow" ] && [ "$(canon)" = "$B/metin2-ep" ] && title | grep -q "^Metin2 EP Satın Al"'
page "/cekilis"
chk "/cekilis (yakında): 200 + noindex" '[ "$CODE" = 200 ] && [ "$(robots)" = "noindex, follow" ] && [ -z "$(canon)" ]'
for p in hesabim ilan-ver mesajlar bildirimler siparis-S100001 ara; do page "/$p"; chk "/$p: özel → 200 + noindex, içerik yok" '[ "$CODE" = 200 ] && [ "$(robots)" = "noindex, follow" ] && echo "$BODY" | grep -q "<main id=\"app\"></main>"'; done
page "/ara?q=ejder"
chk "/ara?q= (SearchAction hedefi): 200" '[ "$CODE" = 200 ]'

echo "=== 5. eski biçimler → 301 ==="
for pair in "/server/$PVS|/metin2-pvp/$PVS" "/server/$PVS/karakter|/metin2-pvp/$PVS/karakter" "/server/$TRS/yang|/metin2-tr/$TRS/won" \
  "/ilan/eski-baslik-$LK|$KP" "/metin2-tr/$PVS/item/yanlis-$LK|$KP" "/?p=metin2-pvp|/metin2-pvp" "/index.php?p=ilan/x-$LK|$KP" \
  "/metin2-pvp/|/metin2-pvp" "/Metin2-PVP/$PVS|/metin2-pvp/$PVS" "/metin2-tr/$TRS/yang|/metin2-tr/$TRS/won" "/server-sv$PV-karakter|/metin2-pvp/$PVS/karakter" \
  "/ilan-$LK|$KP" "/serverler|/metin2-pvp" "/?p=borsa&utm_source=g|/borsa?utm_source=g"; do
  page "${pair%%|*}"; WANT="${pair#*|}"; chk "301 ${pair%%|*} → $WANT" '[ "$CODE" = 301 ] && [ "$LOC" = "$WANT" ]'
done
page "$KP"; chk "kanonik adres yönlendirilmez (döngü yok)" '[ "$CODE" = 200 ] && [ -z "$LOC" ]'

echo "=== 6. bilinmeyen adresler → 404 ==="
for p in /yok-boyle-sayfa /metin2-pvp/yok-server-x /metin2-pvp/$PVS/silah /a/b/c/d/e "/ilan/x-l999999" "/metin2-pvp/$PVS/karakter/x-l999999" /sayfa/yok /rehber/yok-yazi /uye/u99999; do
  page "$p"; chk "404 $p (noindex, uygulama sayfası)" '[ "$CODE" = 404 ] && [ "$(robots)" = "noindex, follow" ] && echo "$BODY" | grep -q "window.YP_BOOT=" && echo "$BODY" | grep -q "Sayfa bulunamadı\|İlan bulunamadı"'
done

echo "=== 7. site haritası ve robots.txt ==="
OUT=$(curl -s "$B/sitemap.xml")
chk "sitemap: bölüm, server, kategori, ilan (temiz adres)" 'echo "$OUT" | grep -q "<loc>$B/</loc>" && echo "$OUT" | grep -q "<loc>$B/metin2-pvp</loc>" && echo "$OUT" | grep -q "<loc>$B/metin2-tr</loc>" && echo "$OUT" | grep -q "<loc>$B/metin2-pvp/$PVS</loc>" && echo "$OUT" | grep -q "<loc>$B/metin2-pvp/$PVS/karakter</loc>" && echo "$OUT" | grep -q "<loc>$B$KP</loc>" && echo "$OUT" | grep -q "<loc>$B$WP</loc>" && echo "$OUT" | grep -q "<loc>$B/sayfa/kvkk</loc>"'
chk "sitemap: P4 sayfaları (borsa, metin2-ep) var" 'echo "$OUT" | grep -q "<loc>$B/borsa</loc>" && echo "$OUT" | grep -q "<loc>$B/metin2-ep</loc>"'
chk "sitemap: lastmod her adreste" '[ "$(echo "$OUT" | grep -c "<url>")" = "$(echo "$OUT" | grep -c "<lastmod>20[0-9][0-9]-[01][0-9]-[0-3][0-9]</lastmod>")" ]'
chk "sitemap: özel, yakında, eski biçim, ?p= ve boş kategori yok" '! echo "$OUT" | grep -Eq "/(hesabim|yonetim|mesajlar|bildirimler|siparis-|ilan-ver|ara|cekilis|reklam-ver|server|ilan)(/|<|-)" && ! echo "$OUT" | grep -q "?p=" && ! echo "$OUT" | grep -q "/$PVS/item</loc>"'
OUT=$(curl -s "$B/robots.txt")
chk "robots.txt: özel yollar (temiz + ?p=) kapalı, sitemap satırı" 'echo "$OUT" | grep -q "^Disallow: /hesabim$" && echo "$OUT" | grep -q "^Disallow: /\*?p=hesabim$" && echo "$OUT" | grep -q "^Disallow: /yonetim$" && echo "$OUT" | grep -q "^Sitemap: $B/sitemap.xml$"'

echo "=== 8. Yönetim › SEO API ==="
api "$J_ADM" GET boot ""; CSA=$(j .data.csrf)
api "$J_ADM" POST auth/login "{\"login\":\"Yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CSA"; CSA="$(j .data.csrf)"
api "$J_A" GET admin/settings/seo ""; chk "üye SEO ayarlarını göremez → 403" '[ "$CODE" = 403 ]'
api "$J_ADM" GET admin/settings/seo ""
chk "GET admin/settings/seo: kip clean, denetim kaydı, denetim adresi" '[ "$CODE" = 200 ] && [ "$(j .data.seo.mode)" = clean ] && [ "$(j .data.seo.rw.ok)" = true ] && [ "$(j .data.probe)" = "/metin2-pvp?yp_probe=1" ]'
api "$J_ADM" POST admin/seo/probe '{"ok":false,"code":404}' -H "X-CSRF-Token: $CSA"
chk "denetim başarısız → kip p (patch.set.seo)" '[ "$CODE" = 200 ] && [ "$(j .data.seo.mode)" = p ] && [ "$(j .patch.set.seo.mode)" = p ] && [ "$(j .data.seo.rw.code)" = 404 ]'
page "/?p=metin2-pvp/$PVS"; chk "p kipinde ?p= sayfası: canonical ?p=" '[ "$CODE" = 200 ] && [ "$(canon)" = "$B/?p=metin2-pvp/$PVS" ]'
page "/metin2-pvp/$PVS"; chk "temiz adresle yeni istek → rewrite yeniden doğrulandı (kendiliğinden düzelme), 200" '[ "$CODE" = 200 ] && [ "$(canon)" = "$B/metin2-pvp/$PVS" ]'
api "$J_ADM" PUT admin/settings/seo '{"clean":false,"homeTitle":"Metin2 Pazarı Test","desc":"Metin2 item, yang ve karakter ilanları; güvenli havuz ile alışveriş.","sep":" · "}' -H "X-CSRF-Token: $CSA"
chk "PUT clean:false → kip p" '[ "$CODE" = 200 ] && [ "$(j .data.seo.mode)" = p ] && [ "$(j .data.seo.clean)" = false ]'
page "/metin2-pvp/$PVS"; chk "temiz adres kapalıyken temiz adres → 301 ?p=" '[ "$CODE" = 301 ] && [ "$LOC" = "/?p=metin2-pvp/$PVS" ]'
page "/"; chk "ana sayfa başlığı ayardan, ayraç ·" '[ "$(title)" = "Metin2 Pazarı Test" ]'
page "/?p=metin2-pvp"; chk "ayraç · sayfa başlığında" '[ "$(title)" = "Metin2 PVP Serverlar · Item, Yang ve EP İlanları · Yang SEO" ]'
api "$J_ADM" PUT admin/settings/seo '{"gsc":"<script>"}' -H "X-CSRF-Token: $CSA"; chk "geçersiz doğrulama kodu → 422" '[ "$CODE" = 422 ]'
api "$J_ADM" PUT admin/settings/seo '{"clean":true}' -H "X-CSRF-Token: $CSA"; chk "PUT clean:true → kip clean" '[ "$(j .data.seo.mode)" = clean ]'
api "$J_A" GET boot ""; chk "boot.set.seo: herkese açık alanlar, kip" '[ "$(j .data.set.seo.mode)" = clean ] && [ "$(j .data.set.seo.homeTitle)" = "Metin2 Pazarı Test" ]'

chk "sunucu günlüğünde PHP uyarısı/hatası yok" '! grep -Eiq "PHP (Warning|Notice|Fatal|Deprecated)" "$SLOG"'
echo
echo "SONUÇ (http seo): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
