#!/usr/bin/env bash
# P7 uçtan uca HTTP testleri: rehber yazıları (HTML temizleme, taslak/yayın, site haritası ve SEO meta), kurumsal/yasal sayfalar
# (şirket bilgisi yer tutucuları), ortaklık başvurusu (hız sınırı + bal küpü) ve onay/red, backlink CRUD, site ayarları doğrulaması,
# ETBİS (karekod yükleme/silme), bakım modu (üye POST'ları 503, çalışan geçer), yedek al / indir / yükle / geri yükleme tatbikatı
# (döküm → silme → geri yükleme → defter denetimi), bakım dışında geri yükleme reddi, otomatik yedek (cron, saklama), güvenli
# güncelleme, yayına alma kontrol listesi, fiyat widget'ı, yetki 403'leri.
# Yükseltme senaryosu: P7 öncesi sürüm ($PRE_REF) sihirbazla kurulur, üzerinde veri oluşur → P7 kodu (çalışma ağacı) üzerine
# kopyalanır → ilk istek yeni tabloları ve yasal sayfa taslaklarını ekler, veri ve oturumlar korunur. İstekler /api/v1/index.php?r=<yol>.
# Kullanım: bash tests/http/p7.sh      (gerekenler: php 8.1+ gd sqlite zlib, curl, jq, git, gzip)
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-$((28000 + RANDOM % 1500))}"
RUN="$(mktemp -d "${TMPDIR:-/tmp}/yp-p7-XXXXXX")"
B="http://127.0.0.1:$PORT"
SLOG="$RUN/server.log"
PRE_REF="${PRE_REF:-b72f3a0}"

mkdir -p "$RUN/storage" "$RUN/uploads"
UPGRADE=0
if git -C "$REPO" cat-file -e "$PRE_REF^{commit}" 2>/dev/null; then
  git -C "$REPO" archive "$PRE_REF" app api kurulum storage/.htaccess storage/index.php uploads/.htaccess uploads/index.php | tar -x -C "$RUN"
  UPGRADE=1
else
  echo "(uyarı: $PRE_REF bulunamadı; yükseltme yerine doğrudan güncel kod kurulur)"
  cp -a "$REPO/app" "$REPO/api" "$REPO/kurulum" "$REPO/widget" "$RUN/"
  cp "$REPO/storage/.htaccess" "$REPO/storage/index.php" "$RUN/storage/"; cp "$REPO/uploads/.htaccess" "$REPO/uploads/index.php" "$RUN/uploads/"
fi
rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"

YP_TEST=1 PHP_CLI_SERVER_WORKERS=6 php -d display_errors=0 -d log_errors=1 -d upload_max_filesize=32M -d post_max_size=40M \
  -d sendmail_path=/bin/true -S 127.0.0.1:$PORT -t "$RUN" "$REPO/tests/http/router.php" >"$SLOG" 2>&1 &
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
upf() { # upf jar csrf dosya yol [ek -F]
  local out; out=$(curl -s -b "$1" -c "$1" -X POST -H "X-CSRF-Token: $2" -F "file=@$3" "${@:5}" -w '\n%{http_code}' "$(url "$4")")
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
cron_run() { env YP_TEST=1 ${1:+YP_TEST_NOW=$1} php -d sendmail_path=/bin/true "$RUN/app/cron.php" >"$RUN/cron.out" 2>&1; }
wal() { sq "SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=${1#u}"; }

J_K="$RUN/k.jar"; J_A="$RUN/a.jar"; J_B="$RUN/b.jar"; J_ADM="$RUN/adm.jar"; J_X="$RUN/x.jar"; J_Y="$RUN/y.jar"
J_SE="$RUN/se.jar"; J_AY="$RUN/ay.jar"; J_BK="$RUN/bk.jar"; J_UY="$RUN/uy.jar"

echo "=== 1. Kurulum: P7 öncesi ($PRE_REF), üzerinde veri ==="
kur "$J_K" action=env
kur "$J_K" action=dbsave driver=sqlite "sqlite_path=$RUN/storage/test.sqlite"
kur "$J_K" action=schema
kur "$J_K" action=site site_name="Yang P7" site_url="http://127.0.0.1:$PORT"
APW='Yonetici-Sifre-2026'
kur "$J_K" action=admin name=Yonetici email=admin@yangpazar.com "password=$APW" "password2=$APW"
kur "$J_K" action=finish
chk "kurulum tamam" '[ -f "$RUN/storage/kurulum_tamam.php" ]'
reg() { local jar="$1" name="$2" mail="$3" tel="$4"; local cs; cs=$(csrf_of "$jar")
  api "$jar" POST auth/register "{\"name\":\"$name\",\"email\":\"$mail\",\"tel\":\"$tel\",\"ad\":\"Test\",\"soyad\":\"Uye\",\"password\":\"Uye-Sifre-123\"}" -H "X-CSRF-Token: $cs"; }
reg "$J_A" Uye_A a@ornek.com "0555 111 33 01"; CS_A="$(j .data.csrf)"; UA="$(j .data.me.id)"
reg "$J_B" Uye_B b@ornek.com "0555 111 33 02"; CS_B="$(j .data.csrf)"; UB="$(j .data.me.id)"
chk "A ve B kayıtlı" '[ -n "$UB" ] && [ "$UB" != null ]'
CS_ADM=$(csrf_of "$J_ADM"); api "$J_ADM" POST auth/login "{\"login\":\"yonetici\",\"password\":\"$APW\"}" -H "X-CSRF-Token: $CS_ADM"; CS_ADM="$(j .data.csrf)"
chk "yönetici girişi" '[ "$(j .data.me.admin)" = true ]'
api "$J_ADM" POST admin/banks '{"b":"Ziraat Bankası","n":"YangPazar Ltd","i":"TR330006100519786457841326"}' -H "X-CSRF-Token: $CS_ADM"
dep() { api "$1" POST deposits/manual "{\"gw\":\"havale\",\"amount\":$3,\"txAt\":$(nowms),\"toBank\":\"Ziraat Bankası\",\"note\":\"Test Uye\"}" -H "X-CSRF-Token: $2" -H "Idempotency-Key: $(ik)"
  local d; d="$(j .data.deposit.id)"; api "$J_ADM" POST "admin/deposits/$d/approve" '{}' -H "X-CSRF-Token: $CS_ADM"; }
dep "$J_A" "$CS_A" 500; dep "$J_B" "$CS_B" 300
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"yang","title":"1 Won hızlı teslim","price":"26,50","stock":50,"del":"5 dk","desc":"Anında teslim."}' -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
L1="$(j .data.listing.id)"
chk "P7 öncesi veri: yüklemeler onaylı, yang ilanı yayında" '[ "$(wal $UA)" = "50000/0" ] && [ "$(wal $UB)" = "30000/0" ] && [ -n "$L1" ] && [ "$L1" != null ]'
N_U0=$(sq "SELECT COUNT(*) FROM yp_users"); N_J0=$(sq "SELECT COUNT(*) FROM yp_journal"); N_L0=$(sq "SELECT COUNT(*) FROM yp_listings")

echo "=== 2. P7 paketi üzerine kopyalanır (ilk istek: tablolar + yasal sayfa taslakları, veri korunur) ==="
if [ "$UPGRADE" = 1 ]; then
  chk "P7 öncesinde içerik tabloları yok" '[ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_posts'\''")" ] && [ -z "$(sq "SELECT name FROM sqlite_master WHERE name='\''yp_pages'\''")" ]'
  cp -a "$REPO/app" "$REPO/api" "$REPO/widget" "$RUN/"
  rm -rf "$RUN/api/data/rl" "$RUN/api/data/log"
  sleep 2
fi
api "$J_X" GET boot ""
TBL_OK=1; for t in posts pages backlinks partner_apps; do [ -n "$(sq "SELECT name FROM sqlite_master WHERE name='yp_$t'")" ] || { TBL_OK=0; echo "      eksik tablo: $t"; }; done
chk "ilk istek: 4 P7 tablosu eklendi, göç 0009 uygulandı" '[ "$CODE" = 200 ] && [ "$TBL_OK" = 1 ] && [ "$(sq "SELECT COUNT(*) FROM yp_schema_migrations WHERE version='\''m:0009_p7_content'\''")" = 1 ]'
chk "veri korundu: üyeler, defter, ilanlar, cüzdanlar" '[ "$(sq "SELECT COUNT(*) FROM yp_users")" = "$N_U0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal")" = "$N_J0" ] && [ "$(sq "SELECT COUNT(*) FROM yp_listings")" = "$N_L0" ] && [ "$(wal $UA)" = "50000/0" ]'
chk "6 yasal / kurumsal sayfa taslaktan oluştu; şirket ayarı açıldı" '[ "$(sq "SELECT COUNT(*) FROM yp_pages")" = 6 ] && [ -n "$(sq "SELECT k FROM yp_settings WHERE k='\''company'\''")" ]'
chk "boot: bakım kapalı, yazı yok, 6 sayfa" '[ "$(j .data.set.maint.on)" = false ] && [ "$(j ".data.posts | length")" = 0 ] && [ "$(j ".data.pages | length")" = 6 ]'
api "$J_A" GET boot ""; CS_A="$(j .data.csrf)"
chk "yükseltmeden sonra üye oturumu sürüyor" '[ "$(j .data.me.id)" = "$UA" ]'
CS_B=$(csrf_of "$J_B"); CS_ADM=$(csrf_of "$J_ADM")

echo "=== 3. Çalışanlar: [seo], [ayar], [bakim], [uye] ==="
mk_staff() { api "$J_ADM" POST admin/staff "{\"name\":\"$1\",\"email\":\"$2\",\"ad\":\"$3\",\"soyad\":\"Ci\",\"password\":\"Calisan-Sifre-9\",\"perms\":[\"$4\"]}" -H "X-CSRF-Token: $CS_ADM"; }
mk_staff SeoCalisan se@yangpazar.com Seo seo; mk_staff AyarCalisan ay@yangpazar.com Ayar ayar; mk_staff BakimCalisan bk@yangpazar.com Bakim bakim; mk_staff UyeCalisan uy@yangpazar.com Uye uye
login() { local jar="$1" n="$2" cs; cs=$(csrf_of "$jar"); api "$jar" POST auth/login "{\"login\":\"$n\",\"password\":\"Calisan-Sifre-9\"}" -H "X-CSRF-Token: $cs"; j .data.csrf; }
CS_SE=$(login "$J_SE" SeoCalisan); CS_AY=$(login "$J_AY" AyarCalisan); CS_BK=$(login "$J_BK" BakimCalisan); CS_UY=$(login "$J_UY" UyeCalisan)
chk "4 çalışan girişi" '[ -n "$CS_SE" ] && [ "$CS_SE" != null ] && [ "$CS_BK" != null ] && [ "$CS_UY" != null ] && [ "$CS_AY" != null ]'

echo "=== 4. Rehber yazıları: CRUD, HTML temizleme, taslak / yayın ==="
api "$J_X" GET "seo/meta?path=/rehber" ""
chk "yazı yokken /rehber noindex" '[ "$(j .data.robots)" = "noindex, follow" ]'
api "$J_AY" POST admin/posts '{"title":"Deneme yazısı","body":"İçerik metni burada."}' -H "X-CSRF-Token: $CS_AY"
chk "[ayar] çalışanı yazı ekleyemez → 403" '[ "$CODE" = 403 ]'
api "$J_A" GET admin/posts ""
chk "üye yazı listesini göremez → 403" '[ "$CODE" = 403 ]'
api "$J_SE" POST admin/posts '{"title":"ab","body":"x"}' -H "X-CSRF-Token: $CS_SE"
chk "kısa başlık / boş içerik → 422 (alan hataları)" '[ "$CODE" = 422 ] && [ "$(j .fields.title)" != null ] && [ "$(j .fields.body)" != null ]'
BODY_IN='## Güvenli alışveriş\n\nÖdemeniz **havuzda** bekler.<script>alert(\"xss\")</script> Devamı <b onclick=\"x()\">kalın</b> metin.\n\n- madde bir\n- [Yang Borsası](#borsa)\n- [kötü](javascript:alert(1))\n\n<img src=x onerror=alert(2)><iframe src=\"https://evil.example\"></iframe>Son satır.'
api "$J_SE" POST admin/posts "{\"title\":\"Metin2 Güvenli Yang Alım Rehberi\",\"ozet\":\"Yang alırken dolandırılmamak için 5 kural.\",\"body\":\"$BODY_IN\",\"seoTitle\":\"Güvenli Yang Alımı: 5 Kural\",\"seoDesc\":\"Metin2 yang alırken havuz güvencesi, teslim onayı ve itiraz.\"}" -H "X-CSRF-Token: $CS_SE"
P1="$(j .data.post.id)"; SLUG="$(j .data.post.slug)"
chk "yazı taslak olarak eklendi; Türkçe başlıktan adres (slug)" '[ "$CODE" = 200 ] && [ "$(j .data.post.on)" = false ] && [ "$SLUG" = metin2-guvenli-yang-alim-rehberi ]'
SB=$(sq "SELECT body FROM yp_posts WHERE id=${P1#p}")
chk "kayıtta HTML temizlendi: <script> içeriğiyle, <iframe>, <img onerror>, etiketler atıldı; metin kaldı" '! echo "$SB" | grep -qiE "<script|alert\(.xss|<iframe|onerror|<b |<img|evil\.example" && echo "$SB" | grep -q "kalın metin" && echo "$SB" | grep -q "Son satır"'
api "$J_X" GET "posts/$SLUG" ""
chk "taslak herkese açık değil → 404" '[ "$CODE" = 404 ]'
api "$J_SE" GET "posts/$SLUG" ""
chk "[seo] çalışanı taslağı görür" '[ "$CODE" = 200 ] && [ "$(j .data.post.on)" = false ]'
api "$J_SE" POST admin/posts "{\"title\":\"Metin2 Güvenli Yang Alım Rehberi\",\"body\":\"İkinci yazı aynı başlıkla.\",\"on\":true}" -H "X-CSRF-Token: $CS_SE"
P2="$(j .data.post.id)"; SLUG2="$(j .data.post.slug)"
chk "aynı başlık: adres benzersiz (-2), hemen yayında" '[ "$CODE" = 200 ] && [ "$SLUG2" = "${SLUG}-2" ] && [ "$(j .data.post.on)" = true ]'
php -r '$i=imagecreatetruecolor(1200,630); imagefill($i,0,0,imagecolorallocate($i,40,90,160)); imagepng($i,$argv[1]."/kapak.png"); $q=imagecreatetruecolor(120,120); imagefill($q,0,0,imagecolorallocate($q,0,0,0)); imagepng($q,$argv[1]."/qr.png");' "$RUN"
upf "$J_A" "$CS_A" "$RUN/kapak.png" media -F kind=post
chk "üye rehber kapağı (kind=post) yükleyemez → 403" '[ "$CODE" = 403 ]'
upf "$J_SE" "$CS_SE" "$RUN/kapak.png" media -F kind=post; MC="$(j .data.media.id)"
chk "[seo] kapak yükledi (herkese açık)" '[ "$CODE" = 200 ] && [ "$(j .data.media.vis)" = public ]'
api "$J_SE" PUT "admin/posts/$P1" "{\"title\":\"Metin2 Güvenli Yang Alım Rehberi\",\"slug\":\"$SLUG\",\"ozet\":\"Yang alırken dolandırılmamak için 5 kural.\",\"body\":\"$BODY_IN\",\"seoTitle\":\"Güvenli Yang Alımı: 5 Kural\",\"seoDesc\":\"Metin2 yang alırken havuz güvencesi, teslim onayı ve itiraz.\",\"cover\":\"$MC\",\"on\":true}" -H "X-CSRF-Token: $CS_SE"
chk "yayına alındı, kapak bağlandı (medya ref=post)" '[ "$CODE" = 200 ] && [ "$(j .data.post.on)" = true ] && [ "$(j .data.post.cover.id)" = "$MC" ] && [ "$(sq "SELECT ref_type FROM yp_media WHERE id=${MC#m}")" = post ]'
api "$J_X" GET "posts/$SLUG" ""
H="$(j .data.post.html)"
chk "herkese açık yazı: güvenli HTML (başlık, kalın, liste, iç bağlantı; script / javascript: yok)" '[ "$CODE" = 200 ] && echo "$H" | grep -q "<h2>Güvenli alışveriş</h2>" && echo "$H" | grep -q "<b>havuzda</b>" && echo "$H" | grep -q "<li>" && echo "$H" | grep -q "borsa" && ! echo "$H" | grep -qiE "<script|javascript:|onerror|<iframe"'
api "$J_X" GET posts ""
chk "yazı listesi: 2 yayında, gövde yok" '[ "$CODE" = 200 ] && [ "$(j ".data.posts | length")" = 2 ] && [ "$(j .data.posts[0].body)" = null ]'
api "$J_X" GET boot ""
chk "boot.posts: alt bilgi için son yazılar" '[ "$(j ".data.posts | length")" = 2 ]'

echo "=== 5. Rehber: site haritası ve SEO meta ==="
SM=$(curl -s "$(url seo/sitemap.xml)")
chk "sitemap: /rehber ve iki yazı, /ortaklik var; geçerli XML" 'echo "$SM" | grep -q "[/=]rehber</loc>" && echo "$SM" | grep -q "rehber/$SLUG</loc>" && echo "$SM" | grep -q "rehber/$SLUG2</loc>" && echo "$SM" | grep -q "[/=]ortaklik</loc>" && echo "$SM" | php -r "exit(simplexml_load_string(stream_get_contents(STDIN))?0:1);"'
api "$J_X" GET "seo/meta?path=/rehber/$SLUG" ""
chk "yazı meta: SEO başlığı, açıklama, index, article, kanonik, Article JSON-LD, kapak görseli" '[ "$(j .data.status)" = 200 ] && j .data.title | grep -q "^Güvenli Yang Alımı: 5 Kural" && [ "$(j .data.desc)" = "Metin2 yang alırken havuz güvencesi, teslim onayı ve itiraz." ] && [ "$(j .data.robots)" = "index, follow, max-image-preview:large" ] && [ "$(j .data.type)" = article ] && j .data.canonical | grep -q "rehber/$SLUG$" && [ "$(j "[.data.ld[] | select(.[\"@type\"]==\"Article\")] | length")" = 1 ] && j .data.img | grep -q "/uploads/"'
api "$J_X" GET "seo/meta?path=/rehber" ""
chk "yazı varken /rehber dizine açık" '[ "$(j .data.robots)" != "noindex, follow" ]'
api "$J_X" GET "seo/meta?path=/ortaklik" ""
chk "/ortaklik artık 'yakında' değil (index)" '[ "$(j .data.status)" = 200 ] && [ "$(j .data.robots)" != "noindex, follow" ]'
api "$J_X" GET "seo/meta?path=/rehber/boyle-yazi-yok" ""
chk "olmayan yazı → 404 noindex" '[ "$(j .data.status)" = 404 ] && [ "$(j .data.robots)" = "noindex, follow" ]'
api "$J_SE" DELETE "admin/posts/$P2" "" -H "X-CSRF-Token: $CS_SE"
chk "yazı silindi; herkese açık 404, site haritasından çıktı" '[ "$CODE" = 200 ] && [ "$(curl -s -o /dev/null -w "%{http_code}" "$(url "posts/$SLUG2")")" = 404 ] && ! curl -s "$(url seo/sitemap.xml)" | grep -q "rehber/$SLUG2<"'

echo "=== 6. Yasal / kurumsal sayfalar ve şirket bilgisi ==="
api "$J_X" GET pages/kvkk ""
H="$(j .data.page.html)"
chk "şirket bilgisi boşken: [ŞİRKET UNVANI] vb. görünmez, nötr metin + site adı; avukat notu yok" '[ "$CODE" = 200 ] && ! echo "$H" | grep -qE "\[(ŞİRKET UNVANI|ADRES|E-POSTA|KEP ADRESİ|AVUKAT)" && echo "$H" | grep -q "bilgi güncelleniyor" && echo "$H" | grep -q "Yang P7" && [ "$(j .data.page.missing)" = null ]'
api "$J_X" GET pages/yok ""
chk "olmayan sayfa → 404" '[ "$CODE" = 404 ]'
api "$J_SE" GET admin/pages ""
chk "[seo] çalışanı yasal sayfaları düzenleyemez → 403" '[ "$CODE" = 403 ]'
api "$J_AY" GET admin/pages ""
chk "[ayar]: 6 sayfa, eksik alanlar (unvan…) ve uyarı işaretli önizleme" '[ "$CODE" = 200 ] && [ "$(j ".data.pages | length")" = 6 ] && [ "$(j .data.legal.ok)" = false ] && j ".data.legal.missingCompany[]" | grep -qx unvan && j "[.data.pages[] | select(.k==\"kvkk\")][0].html" | grep -q "class=\"ph\""'
api "$J_AY" PUT admin/settings/company '{"vkn":"12ab","mersis":"123","email":"posta-degil","kep":"x"}' -H "X-CSRF-Token: $CS_AY"
chk "şirket bilgisi doğrulaması → 422 (VKN, MERSİS, e-posta, KEP)" '[ "$CODE" = 422 ] && [ "$(j .fields.vkn)" != null ] && [ "$(j .fields.mersis)" != null ] && [ "$(j .fields.email)" != null ] && [ "$(j .fields.kep)" != null ]'
api "$J_AY" PUT admin/settings/company '{"unvan":"<b>x</b>"}' -H "X-CSRF-Token: $CS_AY"
chk "HTML karakterli unvan → 422" '[ "$CODE" = 422 ]'
api "$J_AY" PUT admin/settings/company '{"type":"sirket","unvan":"YangPazar Bilişim Ltd. Şti.","adres":"Atatürk Cad. No:1 Kadıköy / İstanbul","vd":"Kadıköy","vkn":"1234567890","mersis":"0123456789012345","sicil":"İstanbul 123456","tel":"0850 123 45 67","email":"destek@yangpazar.com","kep":"yangpazar@hs01.kep.tr","hosting":"Örnek Hosting A.Ş.","msg":"Meta Platforms (WhatsApp Business)"}' -H "X-CSRF-Token: $CS_AY"
chk "şirket bilgisi kaydedildi; yasal sayfalar tam" '[ "$CODE" = 200 ] && [ "$(j .data.legal.ok)" = true ] && [ "$(j ".data.legal.missingCompany | length")" = 0 ]'
api "$J_X" GET pages/iletisim ""
H="$(j .data.page.html)"
chk "İletişim/Künye: unvan, VKN, MERSİS, KEP dolu; köşeli parantez yok" 'echo "$H" | grep -q "YangPazar Bilişim Ltd. Şti." && echo "$H" | grep -q "1234567890" && echo "$H" | grep -q "0123456789012345" && echo "$H" | grep -q "yangpazar@hs01.kep.tr" && ! echo "$H" | grep -q "\[" && echo "$H" | grep -q "<table>"'
api "$J_AY" PUT admin/pages/hakkimizda '{"title":"Hakkımızda","body":"Biz **güvenli** pazarız.<script>alert(1)</script>\n\n[ŞİRKET UNVANI] tarafından işletilir. <iframe src=x></iframe>"}' -H "X-CSRF-Token: $CS_AY"
chk "sayfa düzenlendi; script içeriğiyle atıldı" '[ "$CODE" = 200 ] && ! sq "SELECT body FROM yp_pages WHERE k='\''hakkimizda'\''" | grep -qiE "script|alert|iframe"'
api "$J_X" GET pages/hakkimizda ""
chk "düzenlenen sayfa yer tutucuyla dolu gösteriliyor" 'j .data.page.html | grep -q "<b>güvenli</b>" && j .data.page.html | grep -q "YangPazar Bilişim Ltd. Şti. tarafından"'
api "$J_X" GET "seo/meta?path=/sayfa/iade" ""
chk "/sayfa/iade meta: 200, başlık, index; açıklama yer tutucusuz" '[ "$(j .data.status)" = 200 ] && j .data.title | grep -q "^İade, İptal ve Cayma" && ! j .data.desc | grep -q "\["'
chk "sitemap: 6 yasal sayfa" '[ "$(curl -s "$(url seo/sitemap.xml)" | grep -c "sayfa/")" = 6 ]'
api "$J_AY" POST admin/pages/hakkimizda/reset '{}' -H "X-CSRF-Token: $CS_AY"
chk "sayfa taslak metne döndü" '[ "$CODE" = 200 ] && sq "SELECT body FROM yp_pages WHERE k='\''hakkimizda'\''" | grep -q "oyuncu pazaryeridir"'

echo "=== 7. Ortaklık başvurusu: hız sınırı, bal küpü, onay / red ==="
rl_reset
CS_Y=$(csrf_of "$J_Y")
api "$J_Y" POST partner-apps '{"tp":"server","n":"Ali Server","s":"x","u":"https://ornek.com","c":"ali@ornek.com"}'
chk "CSRF olmadan → 403" '[ "$CODE" = 403 ]'
SV1N=$(sq "SELECT name FROM yp_servers WHERE id=1")
api "$J_Y" POST partner-apps '{"tp":"server","n":"Ali","u":"ftp://x","c":"a"}' -H "X-CSRF-Token: $CS_Y"
chk "geçersiz başvuru → 422 (adres, iletişim)" '[ "$CODE" = 422 ] && [ "$(j .fields.u)" != null ] && [ "$(j .fields.c)" != null ]'
api "$J_Y" POST partner-apps "{\"tp\":\"server\",\"n\":\"Server Ekibi\",\"s\":\"$SV1N\",\"u\":\"https://server.example\",\"l\":\"https://server.example/market\",\"c\":\"discord: ekip#1\",\"x\":\"Rozet ekledik\",\"web\":\"\"}" -H "X-CSRF-Token: $CS_Y"
PA1="$(j .data.id)"
chk "ziyaretçi başvurusu alındı (bekliyor); [seo] çalışanına bildirim" '[ "$CODE" = 200 ] && [ "$(sq "SELECT st FROM yp_partner_apps WHERE id=${PA1#pa}")" = bekliyor ] && [ "$(sq "SELECT COUNT(*) FROM yp_notifications n JOIN yp_users u ON u.id=n.user_id WHERE u.name='\''SeoCalisan'\'' AND n.x LIKE '\''Yeni ortaklık başvurusu%'\''")" = 1 ]'
api "$J_Y" POST partner-apps '{"tp":"site","n":"Bot","u":"https://spam.example","c":"spam@spam.example","web":"http://spam"}' -H "X-CSRF-Token: $CS_Y"
chk "bal küpü dolu: başarı yanıtı ama kaydedilmedi" '[ "$CODE" = 200 ] && [ "$(j .data.sent)" = true ] && [ "$(sq "SELECT COUNT(*) FROM yp_partner_apps WHERE n='\''Bot'\''")" = 0 ]'
api "$J_Y" POST partner-apps '{"tp":"yayinci","n":"Yayıncı Veli","u":"https://youtube.example/veli","c":"veli@ornek.com"}' -H "X-CSRF-Token: $CS_Y"
chk "IP başına günde 3 başvuru: 4. → 429" '[ "$CODE" = 429 ] && [ "$(sq "SELECT COUNT(*) FROM yp_partner_apps")" = 1 ]'
rl_reset
api "$J_A" POST partner-apps '{"tp":"yayinci","n":"Yayıncı Veli","u":"https://youtube.example/veli","c":"veli@ornek.com"}' -H "X-CSRF-Token: $CS_A"
PA2="$(j .data.id)"
chk "üye de başvurabilir (sınır sıfırlanınca)" '[ "$CODE" = 200 ] && [ "$(sq "SELECT user_id FROM yp_partner_apps WHERE id=${PA2#pa}")" = "${UA#u}" ]'
api "$J_SE" GET admin/today ""
chk "iş kuyruğu: partners = 2" '[ "$(j .data.queues.partners)" = 2 ]'
api "$J_A" POST "admin/partner-apps/$PA1/approve" '{}' -H "X-CSRF-Token: $CS_A"
chk "üye onaylayamaz → 403" '[ "$CODE" = 403 ]'
api "$J_AY" POST "admin/partner-apps/$PA1/approve" '{}' -H "X-CSRF-Token: $CS_AY"
chk "[ayar] çalışanı onaylayamaz → 403" '[ "$CODE" = 403 ]'
api "$J_SE" POST "admin/partner-apps/$PA1/approve" '{}' -H "X-CSRF-Token: $CS_SE"
chk "onay: server Partner oldu, bağlantı backlink listesine 'kontrol' olarak eklendi" '[ "$CODE" = 200 ] && [ -n "$(sq "SELECT partner_at FROM yp_servers WHERE id=1")" ] && [ "$(sq "SELECT partner_url FROM yp_servers WHERE id=1")" = "https://server.example/market" ] && [ "$(j "[.data.backlinks[] | select(.url==\"https://server.example/market\")][0].st")" = kontrol ]'
api "$J_SE" POST "admin/partner-apps/$PA1/approve" '{}' -H "X-CSRF-Token: $CS_SE"
chk "ikinci karar → 409" '[ "$CODE" = 409 ]'
api "$J_SE" POST "admin/partner-apps/$PA2/reject" '{}' -H "X-CSRF-Token: $CS_SE"
chk "red: başvuru red" '[ "$CODE" = 200 ] && [ "$(sq "SELECT st FROM yp_partner_apps WHERE id=${PA2#pa}")" = red ]'

echo "=== 8. Backlink CRUD [seo] ==="
api "$J_SE" POST admin/backlinks '{"url":"javascript:alert(1)","k":"forum"}' -H "X-CSRF-Token: $CS_SE"
chk "geçersiz adres → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.url)" != null ]'
api "$J_SE" POST admin/backlinks '{"url":"https://forum.example/konu/1","target":"/metin2-pvp","anchor":"Metin2 yang","k":"forum","nf":true}' -H "X-CSRF-Token: $CS_SE"
BL="$(j "[.data.backlinks[] | select(.url==\"https://forum.example/konu/1\")][0].id")"
chk "backlink eklendi (kontrol edilecek, nofollow)" '[ "$CODE" = 200 ] && [ -n "$BL" ] && [ "$BL" != null ] && [ "$(j "[.data.backlinks[] | select(.id==\"$BL\")][0].nf")" = true ]'
api "$J_SE" PUT "admin/backlinks/$BL" '{"st":"aktif"}' -H "X-CSRF-Token: $CS_SE"
chk "durum: aktif, kontrol zamanı yazıldı" '[ "$CODE" = 200 ] && [ "$(sq "SELECT st FROM yp_backlinks WHERE id=${BL#bl}")" = aktif ] && [ -n "$(sq "SELECT ck FROM yp_backlinks WHERE id=${BL#bl}")" ]'
api "$J_SE" PUT "admin/backlinks/$BL" '{"st":"bilinmiyor"}' -H "X-CSRF-Token: $CS_SE"
chk "geçersiz durum → 422" '[ "$CODE" = 422 ]'
api "$J_UY" DELETE "admin/backlinks/$BL" "" -H "X-CSRF-Token: $CS_UY"
chk "[uye] çalışanı silemez → 403" '[ "$CODE" = 403 ]'
api "$J_SE" DELETE "admin/backlinks/$BL" "" -H "X-CSRF-Token: $CS_SE"
chk "backlink silindi" '[ "$CODE" = 200 ] && [ -z "$(sq "SELECT id FROM yp_backlinks WHERE id=${BL#bl}")" ]'

echo "=== 9. Site ayarları: sunucu tarafı doğrulama [ayar] ==="
api "$J_SE" PUT admin/settings/site '{"siteName":"x"}' -H "X-CSRF-Token: $CS_SE"
chk "[seo] çalışanı site ayarlarını değiştiremez → 403" '[ "$CODE" = 403 ]'
api "$J_AY" PUT admin/settings/site '{"siteName":"A","commission":80,"autoConfirm":0,"minWithdraw":-5,"siteUrl":"javascript:alert(1)","whatsapp":"abc","popupDelay":"x","ptRate":1.5}' -H "X-CSRF-Token: $CS_AY"
chk "geçersiz değerler → 422, her alan ayrı hata" '[ "$CODE" = 422 ] && for k in siteName commission autoConfirm minWithdraw siteUrl whatsapp popupDelay ptRate; do [ "$(j .fields.$k)" != null ] || exit 1; done'
api "$J_AY" PUT admin/settings/site '{"egp":{"on":false}}' -H "X-CSRF-Token: $CS_AY"
chk "bu formda olmayan ayar (egp) → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.egp)" != null ]'
api "$J_AY" PUT admin/settings/site '{}' -H "X-CSRF-Token: $CS_AY"
chk "boş gövde → 422" '[ "$CODE" = 422 ]'
api "$J_AY" PUT admin/settings/site "{\"siteName\":\"YangPazar Test\",\"slogan\":\"Güvenli oyuncu pazarı\",\"siteUrl\":\"http://127.0.0.1:$PORT/\",\"commission\":\"7,5\",\"autoConfirm\":24,\"minWithdraw\":75,\"whatsapp\":\"+90 555 111 22 33\",\"supportHours\":\"10:00-02:00\",\"popupOn\":false,\"popupDelay\":2,\"tfaOn\":true,\"ptRate\":100}" -H "X-CSRF-Token: $CS_AY"
chk "geçerli ayarlar kaydedildi (komisyon 7,5 → 7.5; adres sondaki / atıldı)" '[ "$CODE" = 200 ] && [ "$(j .data.site.commission)" = 7.5 ] && [ "$(j .data.site.siteUrl)" = "http://127.0.0.1:$PORT" ] && [ "$(j .patch.set.siteName)" = "YangPazar Test" ]'
api "$J_X" GET boot ""
chk "boot.set: yeni site adı, komisyon, en az çekim, destek saatleri" '[ "$(j .data.set.siteName)" = "YangPazar Test" ] && [ "$(j .data.set.commission)" = 7.5 ] && [ "$(j .data.set.minWithdraw)" = 75 ] && [ "$(j .data.set.supportHours)" = "10:00-02:00" ]'
chk "diğer site ayarları korundu (wheelOn, refOn)" '[ "$(j .data.set.wheelOn)" = true ] && [ "$(j .data.set.refOn)" = true ]'

echo "=== 10. ETBİS [ayar] ==="
api "$J_AY" PUT admin/settings/etbis '{"on":true,"url":"https://evil.example/etbis"}' -H "X-CSRF-Token: $CS_AY"
chk "ETBİS dışı adres → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.url)" != null ]'
api "$J_AY" PUT admin/settings/etbis '{"on":true,"url":""}' -H "X-CSRF-Token: $CS_AY"
chk "bağlantısız rozet → 422" '[ "$CODE" = 422 ]'
api "$J_AY" PUT admin/settings/etbis '{"on":true,"url":"https://etbis.ticaret.gov.tr/tr/Home/SearchSiteResult?siteId=abc","code":"ETBIS-1234","date":"2026-13-40"}' -H "X-CSRF-Token: $CS_AY"
chk "geçersiz tarih → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.date)" != null ]'
QR64=$(base64 -w0 "$RUN/qr.png")
api "$J_AY" PUT admin/settings/etbis "{\"on\":true,\"url\":\"https://etbis.ticaret.gov.tr/tr/Home/SearchSiteResult?siteId=abc\",\"code\":\"ETBIS-1234\",\"date\":\"2026-11-01\",\"imgData\":\"data:image/png;base64,$QR64\"}" -H "X-CSRF-Token: $CS_AY"
IMG1="$(j .data.etbis.imgId)"
chk "ETBİS kaydedildi; yapıştırılan koddaki karekod sunucuda görsele çevrildi" '[ "$CODE" = 200 ] && [ "$(j .data.etbis.on)" = true ] && j .data.etbis.img | grep -q "^/uploads/" && [ "$(sq "SELECT kind||'\''/'\''||ref_type FROM yp_media WHERE id=${IMG1#m}")" = "etbis/etbis" ]'
api "$J_X" GET boot ""
chk "boot.set.etbis: alt bilgi rozeti sunucudan" '[ "$(j .data.set.etbis.on)" = true ] && [ "$(j .data.set.etbis.code)" = ETBIS-1234 ] && j .data.set.etbis.img | grep -q "^/uploads/"'
upf "$J_AY" "$CS_AY" "$RUN/qr.png" admin/settings/etbis/img
IMG2="$(j .data.etbis.imgId)"
chk "karekod görseli yüklendi; eskisi silindi" '[ "$CODE" = 200 ] && [ "$IMG2" != "$IMG1" ] && [ -z "$(sq "SELECT id FROM yp_media WHERE id=${IMG1#m}")" ]'
upf "$J_SE" "$CS_SE" "$RUN/qr.png" admin/settings/etbis/img
chk "[seo] çalışanı karekod yükleyemez → 403" '[ "$CODE" = 403 ]'
api "$J_AY" DELETE admin/settings/etbis/img "" -H "X-CSRF-Token: $CS_AY"
chk "karekod kaldırıldı" '[ "$CODE" = 200 ] && [ "$(j .data.etbis.img)" = "" ] && [ -z "$(sq "SELECT id FROM yp_media WHERE id=${IMG2#m}")" ]'
api "$J_ADM" GET admin/integrations ""
chk "Entegrasyonlar sayfası aynı ETBİS kaydını görüyor (tek kaynak)" '[ "$(j .data.etbis.code)" = ETBIS-1234 ] && [ "$(j .data.etbis.on)" = true ]'

echo "=== 11. Bakım modu: üye POST'ları 503, çalışan geçer ==="
api "$J_SE" PUT admin/settings/maint '{"on":true}' -H "X-CSRF-Token: $CS_SE"
chk "[seo] çalışanı bakımı açamaz → 403" '[ "$CODE" = 403 ]'
api "$J_BK" PUT admin/settings/maint '{"on":true,"msg":"Kısa bir bakım yapıyoruz, 10 dakikaya döneceğiz.","until":1}' -H "X-CSRF-Token: $CS_BK"
chk "geçmiş tahmini bitiş → 422" '[ "$CODE" = 422 ] && [ "$(j .fields.until)" != null ]'
api "$J_BK" PUT admin/settings/maint "{\"on\":true,\"msg\":\"Kısa bir bakım yapıyoruz, 10 dakikaya döneceğiz.\",\"until\":$(( $(nowms) + 3600000 ))}" -H "X-CSRF-Token: $CS_BK"
chk "[bakim] bakımı açtı" '[ "$CODE" = 200 ] && [ "$(j .data.active)" = true ] && [ "$(j .patch.set.maint.on)" = true ]'
api "$J_X" GET boot ""
chk "ziyaretçi açılış verisi: bakım açık, mesaj ve tahmini bitiş" '[ "$CODE" = 200 ] && [ "$(j .data.set.maint.on)" = true ] && [ "$(j .data.set.maint.msg)" = "Kısa bir bakım yapıyoruz, 10 dakikaya döneceğiz." ] && [ "$(j .data.set.maint.until)" != null ]'
OUT=$(curl -s -D - -o "$RUN/m.json" -b "$J_A" -X POST -H 'Content-Type: application/json' -H "X-CSRF-Token: $CS_A" --data '{}' "$(url me/notifications/read-all)")
chk "üye POST → 503 code=maint, Türkçe mesaj, Retry-After" 'echo "$OUT" | head -1 | grep -q " 503" && echo "$OUT" | grep -qi "^Retry-After:" && [ "$(jq -r .code "$RUN/m.json")" = maint ] && [ "$(jq -r .error "$RUN/m.json")" = "Kısa bir bakım yapıyoruz, 10 dakikaya döneceğiz." ]'
api "$J_A" POST listings '{"game":"metin2","server":"sv1","cat":"yang","title":"Bakımda ilan","price":5}' -H "X-CSRF-Token: $CS_A" -H "Idempotency-Key: $(ik)"
chk "üye ilan veremez → 503" '[ "$CODE" = 503 ] && [ "$(sq "SELECT COUNT(*) FROM yp_listings")" = "$N_L0" ]'
api "$J_Y" POST partner-apps '{"tp":"site","n":"Bakımda","u":"https://x.example","c":"x@x.example"}' -H "X-CSRF-Token: $CS_Y"
chk "ziyaretçi başvurusu → 503" '[ "$CODE" = 503 ]'
api "$J_A" GET boot ""
chk "üye GET istekleri çalışır" '[ "$CODE" = 200 ] && [ "$(j .data.me.id)" = "$UA" ]'
api "$J_SE" POST admin/backlinks '{"url":"https://bakimda.example/x","k":"diger"}' -H "X-CSRF-Token: $CS_SE"
chk "çalışan bakımda işlem yapar (bypass)" '[ "$CODE" = 200 ]'
J_SE2="$RUN/se2.jar"; CS_SE2=$(login "$J_SE2" SeoCalisan)
chk "bakımda çalışan girişi açık" '[ -n "$CS_SE2" ] && [ "$CS_SE2" != null ]'
api "$J_Y" POST auth/forgot '{"login":"a@ornek.com"}' -H "X-CSRF-Token: $CS_Y"; C1="$CODE"
api "$J_Y" POST auth/reset '{"token":"x","password":"Yeni-Sifre-123"}' -H "X-CSRF-Token: $CS_Y"
chk "bakımda hesap kurtarma (auth/forgot, auth/reset) bakım kapısına takılmaz (P6)" '[ "$C1" != 503 ] && [ "$CODE" != 503 ]'
api "$J_UY" POST "admin/users/$UB/verify" '{}' -H "X-CSRF-Token: $CS_UY"
chk "çalışan yönetim POST'u bakımda 503 değil" '[ "$CODE" != 503 ]'

echo "=== 12. Yedekler: al, indir (yalnız yönetici, kayıtlı), dosya korumalı ==="
api "$J_BK" POST admin/backups '{}' -H "X-CSRF-Token: $CS_BK"
BK1="$(j .data.created.id)"; BF1="$(j .data.created.file)"
chk "[bakim] yedek aldı (storage/backups, .sql.gz)" '[ "$CODE" = 200 ] && [ -f "$RUN/storage/backups/$BF1" ] && [ "$(j .data.created.kind)" = manual ] && [ "$(j ".data.backups | length")" = 1 ]'
chk "storage/backups: Require all denied .htaccess; HTTP ile açılamaz" 'grep -q "Require all denied" "$RUN/storage/backups/.htaccess" && [ "$(curl -s -o /dev/null -w "%{http_code}" "$B/storage/backups/$BF1")" = 403 ]'
api "$J_BK" GET "admin/backups/$BK1/download" ""
chk "[bakim] çalışanı indiremez (yalnız yönetici) → 403" '[ "$CODE" = 403 ]'
api "$J_A" GET "admin/backups" ""
chk "üye yedek listesini göremez → 403" '[ "$CODE" = 403 ]'
HDR=$(curl -s -D - -o "$RUN/dl.sql.gz" -b "$J_ADM" "$(url "admin/backups/$BK1/download")")
chk "yönetici indirdi: gzip, ek dosya, denetim kaydı" 'echo "$HDR" | head -1 | grep -q " 200" && echo "$HDR" | grep -qi "content-disposition: attachment" && gzip -t "$RUN/dl.sql.gz" && [ "$(sq "SELECT COUNT(*) FROM yp_audit_log WHERE action='\''backup_download'\''")" = 1 ]'
chk "döküm: başlık/son işareti, MySQL SQL (INSERT INTO yp_users), tablolar" 'gzip -dc "$RUN/dl.sql.gz" | head -3 | grep -q "^-- @yp-backup " && gzip -dc "$RUN/dl.sql.gz" | tail -1 | grep -q "^-- @yp-end " && gzip -dc "$RUN/dl.sql.gz" | grep -q "^INSERT INTO \`yp_users\`" && gzip -dc "$RUN/dl.sql.gz" | grep -q "^-- @table journal "'

echo "=== 13. Geri yükleme tatbikatı: bakım dışında red → döküm → silme → geri yükleme → defter denetimi ==="
api "$J_BK" PUT admin/settings/maint '{"on":false}' -H "X-CSRF-Token: $CS_BK"
api "$J_ADM" POST "admin/backups/$BK1/restore" '{}' -H "X-CSRF-Token: $CS_ADM"
chk "bakım kapalıyken geri yükleme reddedildi → 409 maint_required" '[ "$CODE" = 409 ] && [ "$(j .code)" = maint_required ]'
api "$J_BK" PUT admin/settings/maint '{"on":true}' -H "X-CSRF-Token: $CS_BK"
api "$J_BK" POST "admin/backups/$BK1/restore" '{}' -H "X-CSRF-Token: $CS_BK"
chk "[bakim] çalışanı geri yükleyemez (yalnız yönetici) → 403" '[ "$CODE" = 403 ]'
api "$J_A" POST "admin/backups/$BK1/restore" '{}' -H "X-CSRF-Token: $CS_A"
chk "üye → 503 (bakımda) / yetkisiz" '[ "$CODE" = 503 ] || [ "$CODE" = 403 ]'
# döküm alınmış durum
S_U=$(sq "SELECT COUNT(*) FROM yp_users"); S_J=$(sq "SELECT COUNT(*) FROM yp_journal"); S_P=$(sq "SELECT COUNT(*) FROM yp_postings")
S_W=$(sq "SELECT group_concat(user_id||':'||cash||':'||credit) FROM (SELECT * FROM yp_wallets ORDER BY user_id)"); S_L=$(sq "SELECT COUNT(*) FROM yp_listings")
S_PO=$(sq "SELECT COUNT(*) FROM yp_posts"); S_PG=$(sq "SELECT COUNT(*) FROM yp_pages"); S_CO=$(sq "SELECT v FROM yp_settings WHERE k='company'")
# yedekten sonra değişiklik + felaket: veriler silinir
api "$J_SE" POST admin/posts '{"title":"Yedekten sonra yazılan","body":"Bu yazı geri yüklemeden sonra olmamalı.","on":true}' -H "X-CSRF-Token: $CS_SE"
sqx "DELETE FROM yp_postings; DELETE FROM yp_journal; UPDATE yp_wallets SET cash=0, credit=0; DELETE FROM yp_listing_media; DELETE FROM yp_listings; DELETE FROM yp_pages; DELETE FROM yp_deposits;"
chk "felaket: defter, ilanlar, sayfalar silindi" '[ "$(sq "SELECT COUNT(*) FROM yp_journal")" = 0 ] && [ "$(sq "SELECT COUNT(*) FROM yp_listings")" = 0 ] && [ "$(sq "SELECT COUNT(*) FROM yp_pages")" = 0 ]'
api "$J_ADM" POST "admin/backups/$BK1/restore" '{}' -H "X-CSRF-Token: $CS_ADM"
chk "yönetici geri yükledi; günlük + defter denetimi geçti" '[ "$CODE" = 200 ] && [ "$(j .data.restore.check.ok)" = true ] && [ "$(j ".data.restore.log | length")" -ge 4 ] && [ "$(j .data.restore.rows)" -gt 0 ]'
chk "veri yedekteki haline döndü: üyeler, defter, postings, cüzdanlar, ilanlar, yazılar, sayfalar, şirket" '[ "$(sq "SELECT COUNT(*) FROM yp_users")" = "$S_U" ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal")" = "$S_J" ] && [ "$(sq "SELECT COUNT(*) FROM yp_postings")" = "$S_P" ] && [ "$(sq "SELECT group_concat(user_id||'\'':'\''||cash||'\'':'\''||credit) FROM (SELECT * FROM yp_wallets ORDER BY user_id)")" = "$S_W" ] && [ "$(sq "SELECT COUNT(*) FROM yp_listings")" = "$S_L" ] && [ "$(sq "SELECT COUNT(*) FROM yp_posts")" = "$S_PO" ] && [ "$(sq "SELECT COUNT(*) FROM yp_pages")" = "$S_PG" ] && [ "$(sq "SELECT v FROM yp_settings WHERE k='\''company'\''")" = "$S_CO" ]'
chk "yedekten sonra yazılan yazı yok; geri yükleme öncesi yedek alındı" '[ -z "$(sq "SELECT id FROM yp_posts WHERE title='\''Yedekten sonra yazılan'\''")" ] && [ "$(sq "SELECT COUNT(*) FROM yp_backups WHERE kind='\''pre_restore'\''")" = 1 ]'
chk "bakım modu geri yüklemeyle kapanmadı (ayar korunur)" '[ "$(curl -s "$(url boot)" | jq -r .data.set.maint.on)" = true ]'
api "$J_ADM" GET admin/backups ""
chk "yöneticinin oturumu geri yüklemeden sonra açık; yedek listesi korundu" '[ "$CODE" = 200 ] && [ "$(j ".data.backups | length")" = 2 ]'
api "$J_ADM" POST admin/money/check '{}' -H "X-CSRF-Token: $CS_ADM"
chk "defter tutarlılık denetimi (ayrı uç): tutarlı; postings toplamı 0" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ] && [ "$(sq "SELECT COALESCE(SUM(amount),0) FROM yp_postings")" = 0 ]'
api "$J_X" GET "posts/$SLUG" ""
chk "geri yüklenen yazı herkese açık" '[ "$CODE" = 200 ]'

echo "=== 14. Yedek dosyası yükleme (yalnız yönetici, doğrulanır) ==="
upf "$J_BK" "$CS_BK" "$RUN/dl.sql.gz" admin/backups/upload
chk "[bakim] çalışanı yükleyemez → 403" '[ "$CODE" = 403 ]'
echo "DROP TABLE yp_users;" | gzip > "$RUN/kotu.sql.gz"
upf "$J_ADM" "$CS_ADM" "$RUN/kotu.sql.gz" admin/backups/upload
chk "yedek olmayan SQL → 422" '[ "$CODE" = 422 ]'
gzip -dc "$RUN/dl.sql.gz" | sed '/^-- @yp-end/d' | gzip > "$RUN/yarim.sql.gz"
upf "$J_ADM" "$CS_ADM" "$RUN/yarim.sql.gz" admin/backups/upload
chk "yarım dosya (sonu yok) → 422" '[ "$CODE" = 422 ] && j .fields.file | grep -q "eksik"'
gzip -dc "$RUN/dl.sql.gz" | sed '0,/^INSERT INTO `yp_users`/s//INSERT INTO `yp_users`/; s/^\(INSERT INTO `yp_settings`.*\);$/\1; DROP TABLE yp_users;/' | gzip > "$RUN/enj.sql.gz"
upf "$J_ADM" "$CS_ADM" "$RUN/enj.sql.gz" admin/backups/upload
chk "değer kısmına eklenmiş SQL (; DROP …) → 422" '[ "$CODE" = 422 ]'
upf "$J_ADM" "$CS_ADM" "$RUN/dl.sql.gz" admin/backups/upload
chk "geçerli yedek yüklendi (tür: yüklenen dosya)" '[ "$CODE" = 200 ] && [ "$(j .data.created.kind)" = upload ] && [ "$(sq "SELECT COUNT(*) FROM yp_backups WHERE kind='\''upload'\''")" = 1 ]'
UP1="$(j .data.created.id)"
api "$J_ADM" POST "admin/backups/$UP1/restore" '{}' -H "X-CSRF-Token: $CS_ADM"
chk "yüklenen yedekten geri yükleme çalışır; denetim geçti" '[ "$CODE" = 200 ] && [ "$(j .data.restore.check.ok)" = true ] && [ "$(sq "SELECT COUNT(*) FROM yp_journal")" = "$S_J" ]'
api "$J_BK" PUT admin/settings/maint '{"on":false}' -H "X-CSRF-Token: $CS_BK"

echo "=== 15. Otomatik yedek (cron) ve saklama ==="
api "$J_BK" PUT admin/settings/backup '{"auto":"her-dakika"}' -H "X-CSRF-Token: $CS_BK"
chk "geçersiz sıklık → 422" '[ "$CODE" = 422 ]'
api "$J_BK" PUT admin/settings/backup '{"auto":"6h","keep":2}' -H "X-CSRF-Token: $CS_BK"
chk "otomatik yedek: 6 saatte bir, son 2 saklanır" '[ "$CODE" = 200 ] && [ "$(j .data.backup.auto)" = 6h ] && [ "$(j .data.backup.keep)" = 2 ]'
T0=$(nowms)
cron_run; cron_run
chk "cron: otomatik yedek alındı (aynı aralıkta ikinci kez değil)" '[ "$(sq "SELECT COUNT(*) FROM yp_backups WHERE kind='\''auto'\''")" = 1 ]'
cron_run $((T0 + 7*3600000)); cron_run $((T0 + 14*3600000))
chk "saklama: 3 otomatik yedekten en yeni 2'si kaldı, eskisinin dosyası silindi" '[ "$(sq "SELECT COUNT(*) FROM yp_backups WHERE kind='\''auto'\''")" = 2 ] && [ "$(ls "$RUN/storage/backups/" | grep -c -- "-auto-")" = 2 ]'
DEL_ID="bk$(sq "SELECT id FROM yp_backups WHERE kind='manual' LIMIT 1")"; DEL_F=$(sq "SELECT file FROM yp_backups WHERE kind='manual' LIMIT 1")
api "$J_BK" DELETE "admin/backups/$DEL_ID" "" -H "X-CSRF-Token: $CS_BK"
chk "yedek silindi (kayıt + dosya)" '[ "$CODE" = 200 ] && [ ! -f "$RUN/storage/backups/$DEL_F" ]'

echo "=== 16. Güvenli güncelleme ve sürüm durumu ==="
api "$J_BK" GET admin/maint ""
chk "durum: sürüm, bekleyen göç yok, son yedek" '[ "$CODE" = 200 ] && [ "$(j .data.app)" != null ] && [ "$(j ".data.pending | length")" = 0 ] && [ "$(j .data.last.id)" != null ]'
api "$J_A" POST admin/update '{}' -H "X-CSRF-Token: $CS_A"
chk "üye güncelleme çalıştıramaz → 403" '[ "$CODE" = 403 ]'
N_PU=$(sq "SELECT COUNT(*) FROM yp_backups WHERE kind='pre_update'")
api "$J_BK" POST admin/update '{}' -H "X-CSRF-Token: $CS_BK"
chk "güvenli güncelleme: yedek → bakım → göçler → bakım kapandı; günlük" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ] && [ "$(j .data.active)" = false ] && j ".data.log[]" | grep -q "Güncelleme öncesi yedek" && j ".data.log[]" | grep -q "Bakım modu açıldı" && j ".data.log[]" | grep -q "Bakım modu kapatıldı" && [ "$(sq "SELECT COUNT(*) FROM yp_backups WHERE kind='\''pre_update'\''")" = $((N_PU + 1)) ]'

echo "=== 17. Yayına alma kontrol listesi ==="
api "$J_SE" GET admin/golive ""
chk "[seo] çalışanı göremez → 403" '[ "$CODE" = 403 ]'
cron_run
api "$J_AY" GET admin/golive ""
ck() { j "[.data.checks[] | select(.k==\"$1\")][0].ok"; }
chk "liste: 13 madde, 11 zorunlu; PayTR ve WhatsApp isteğe bağlı" '[ "$CODE" = 200 ] && [ "$(j ".data.checks | length")" = 13 ] && [ "$(j .data.total)" = 11 ] && [ "$(j "[.data.checks[] | select(.opt)] | length")" = 2 ]'
chk "değerler: siteUrl, cron, yasal, ETBİS, banka, yedek, demo kapalı → tamam" '[ "$(ck siteurl)" = true ] && [ "$(ck cron)" = true ] && [ "$(ck legal)" = true ] && [ "$(ck etbis)" = true ] && [ "$(ck bank)" = true ] && [ "$(ck backup)" = true ] && [ "$(ck demo)" = true ]'
chk "değerler: https (http test sunucusu), e-posta, yöneticide 2FA, temiz adres, PayTR → eksik" '[ "$(ck https)" = false ] && [ "$(ck mail)" = false ] && [ "$(ck tfa)" = false ] && [ "$(ck clean)" = false ] && [ "$(ck paytr)" = false ]'
chk "her maddenin düzeltme bağlantısı var" '[ "$(j "[.data.checks[] | select(.h|startswith(\"#\"))] | length")" = 13 ]'
api "$J_AY" PUT admin/settings/golive '{"demoMode":true}' -H "X-CSRF-Token: $CS_AY"
chk "demo modu yalnız yönetici → 403" '[ "$CODE" = 403 ]'
api "$J_ADM" PUT admin/settings/golive '{"demoMode":true}' -H "X-CSRF-Token: $CS_ADM"
chk "yönetici demo modunu açtı → kontrol listesinde eksik" '[ "$CODE" = 200 ] && [ "$(ck demo)" = false ]'
api "$J_ADM" PUT admin/settings/golive '{"demoMode":false}' -H "X-CSRF-Token: $CS_ADM"

echo "=== 18. Fiyat widget'ı (/widget/yang/) ==="
SLUG1=$(sq "SELECT slug FROM yp_servers WHERE id=1")
WH=$(curl -s -D "$RUN/wh.txt" "$B/widget/yang/?server=$SLUG1")
chk "widget: 200, server adı ve başlangıç fiyatı, siteye bağlantı" 'head -1 "$RUN/wh.txt" | grep -q " 200" && echo "$WH" | grep -q "$SV1N" && echo "$WH" | grep -q "26,50 ₺" && echo "$WH" | grep -q "1 ilan"'
chk "widget: çerçeveye açık (frame-ancestors *, X-Frame-Options yok), betik yok" 'grep -qi "frame-ancestors \*" "$RUN/wh.txt" && ! grep -qi "^X-Frame-Options" "$RUN/wh.txt" && ! echo "$WH" | grep -qi "<script"'
WA=$(curl -s "$B/widget/yang/")
chk "widget: tüm serverlar (en çok 10)" 'echo "$WA" | grep -q "Metin2 yang fiyatları" && echo "$WA" | grep -q "$SV1N"'
chk "API yanıtları hâlâ çerçeveye kapalı" 'curl -s -D - -o /dev/null "$(url boot)" | grep -qi "frame-ancestors '\''none'\''"'

echo "=== 19. Yetki matrisi (403) ==="
DENY=0
for spec in "SE|PUT|admin/settings/site" "SE|PUT|admin/settings/company" "SE|PUT|admin/settings/etbis" "SE|PUT|admin/pages/kvkk" "SE|GET|admin/backups" "SE|POST|admin/backups" "SE|PUT|admin/settings/backup" "SE|POST|admin/update" \
  "AY|POST|admin/backlinks" "AY|GET|admin/posts" "AY|PUT|admin/settings/maint" "AY|GET|admin/maint" "BK|GET|admin/posts" "BK|PUT|admin/settings/site" "BK|GET|admin/pages" \
  "UY|GET|admin/golive" "UY|GET|admin/backlinks" "A|GET|admin/settings/site" "A|POST|admin/backups" "A|PUT|admin/settings/maint" "B|GET|admin/golive" "B|DELETE|admin/posts/$P1"; do
  who="${spec%%|*}"; rest="${spec#*|}"; m="${rest%%|*}"; p="${rest#*|}"
  eval "jar=\$J_$who; cs=\$CS_$who"
  api "$jar" "$m" "$p" '{}' -H "X-CSRF-Token: $cs"
  [ "$CODE" = 403 ] || { DENY=1; echo "      403 değil: $who $m $p → $CODE"; }
done
chk "22 rota: yetkisiz çalışan / üye → 403" '[ "$DENY" = 0 ]'
api "$J_X" GET admin/backups ""
chk "ziyaretçi → 401" '[ "$CODE" = 401 ]'

echo "=== 20. Son denetim ==="
api "$J_ADM" POST admin/money/check '{}' -H "X-CSRF-Token: $CS_ADM"
chk "defter tutarlı" '[ "$CODE" = 200 ] && [ "$(j .data.ok)" = true ]'
chk "sunucu günlüğünde PHP hatası yok" '! grep -qiE "PHP (Fatal|Warning|Parse|Notice|Deprecated)" "$SLOG"'
ERRL=$(grep -h '\[hata\]' "$RUN"/storage/log/*.log 2>/dev/null | head -5)
chk "uygulama günlüğünde [hata] yok" '[ -z "$ERRL" ]' ; [ -n "$ERRL" ] && echo "$ERRL"

echo
echo "SONUÇ (P7 HTTP): $PASS geçti, $FAIL kaldı"
[ "$FAIL" = 0 ]
