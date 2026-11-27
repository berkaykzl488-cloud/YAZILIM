/* ================== P7: kalan yönetim ekranları, bakım modu, yedekler, güvenli güncelleme (yalnız --prod derlemesinde) ==================
   Sunucuya bağlı: Rehber (boot.posts; GET posts/{slug} sunucuda üretilmiş güvenli HTML), kurumsal / yasal sayfalar (GET pages/{k};
   şirket bilgisi yer tutucuları sunucuda dolar, eksikse herkese nötr metin, yalnız [ayar] yetkilisine uyarı), Ortaklık sayfası ve
   başvuru (bal küpü alanı "web"), alt bilgi (yasal sayfalar + ETBİS rozeti sunucudan), bakım sayfası (boot.set.maint; sunucu da
   üye POST'larını 503 ile durdurur).
   Yönetim: SEO › Backlink & ortaklık / Rehber yazıları [seo]; Site ayarları › Genel / Şirket & yasal sayfalar / Yayına alma / ETBİS [ayar];
   Yedek & bakım › Bakım modu (sürüm, bekleyen göçler, güvenli güncelleme) / Yedekler [bakim; indirme, yükleme, geri yükleme yalnız yönetici].
   Demo ekranları (backlinkAdmin, vPartner, vMaint, etbisBadge …) aynen kullanılır; veri S'ye sunucudan yazılır.               */
const P7 = { pages: null, etbImg: null, upd: null, rest: null, cover: {} };
const p7enc = encodeURIComponent;
const P7_PAGES = [['hakkimizda', 'Hakkımızda'], ['iletisim', 'İletişim ve Künye'], ['kvkk', 'KVKK Aydınlatma Metni'], ['mesafeli', 'Üyelik ve Mesafeli Satış Sözleşmesi'], ['iade', 'İade, İptal ve Cayma'], ['gizlilik', 'Gizlilik ve Çerez Politikası']];

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="p7css">
.p7hp{position:absolute!important;left:-10000px!important;width:1px;height:1px;overflow:hidden}
.prose h3{font-size:16.5px;margin:20px 0 6px}.prose ol{padding-left:22px}.prose blockquote{margin:12px 0;padding:6px 14px;border-left:3px solid var(--line);color:var(--muted)}
.prose code{font-family:var(--f-mono);font-size:.92em;background:var(--surface-2);padding:1px 5px;border-radius:5px}.prose hr{border:0;border-top:1px solid var(--line);margin:20px 0}
.md-tbl{overflow-x:auto;margin:12px 0}.md-tbl table{border-collapse:collapse;min-width:min(100%,420px);font-size:14px}.md-tbl td,.md-tbl th{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}
mark.ph{background:var(--warn-soft);color:var(--warn);border:1px dashed var(--warn);border-radius:5px;padding:0 4px;font-weight:600}
mark.ph-note{background:var(--info-soft);color:var(--muted);border-radius:5px;padding:0 4px;font-size:.88em}
.p7cover{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.p7cover img{width:120px;height:63px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
.rpost .p7rc{width:100%;aspect-ratio:1200/630;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
.post .p7pc{width:100%;aspect-ratio:1200/630;object-fit:cover;border-radius:12px;border:1px solid var(--line);margin:12px 0}
.p7prev{max-height:340px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:var(--surface-2)}
.p7log{margin:0;padding:10px 14px 10px 30px;border-radius:10px;background:var(--surface-2);font-size:12.5px;line-height:1.6;overflow-wrap:anywhere}
.p7chk .seochk>div{min-width:0}.p7chk .seochk small{display:block;overflow-wrap:anywhere}.p7chk .seochk a{color:var(--accent);font-weight:600;font-size:12.5px}
.p7chk .seochk .opt i{background:var(--line);color:var(--fg)}
.p7mig{font-size:12.5px;overflow-wrap:anywhere}.p7mig li{margin:2px 0}
.p7tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);color:var(--muted);margin-left:6px;vertical-align:middle}
.p7cmp{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));gap:10px}
.etbis-b img{background:#fff}
</style>`);

/* ================= açılış verisi ================= */
function p7Slices(b) { if (!b || !S) return;
  if (Array.isArray(b.posts)) S.posts = b.posts.map(p => Object.assign({}, p));
  if (Array.isArray(b.pages)) P7.pages = b.pages; }
try { p7Slices(window.YP_BOOT); } catch (e) { }
{ const f = apiApplyBoot; apiApplyBoot = function (b) { f.apply(this, arguments); p7Slices(b); }; }
/* bakım: sunucu 503 (code=maint) dönerse bakım sayfasına geç */
{ const c0 = call; call = async function () { try { return await c0.apply(this, arguments); } catch (e) {
    if (e && e.code === 'maint' && S && S.set && !isPanel()) { S.set.maint = { on: true, msg: e.error || '', until: e.until || null }; setTimeout(() => { closeModal(); render(); }, 0); }
    throw e; } }; }
/* bakımda çalışan girişi: 2 adımlı doğrulama formu da açık kalsın (81-form.js yalnız loginf'e izin verir) */
document.addEventListener('submit', e => { const f = e.target && e.target.closest && e.target.closest('[data-form=tfaf]');
  if (f && maintOn() && !isPanel() && FORM.tfaf) { e.preventDefault(); e.stopImmediatePropagation(); FORM.tfaf(f); } }, true);
/* ETBİS karekodu artık sunucuda (uploads/…) */
{ const f = etbisImgOk; etbisImgOk = function (src) { return /^(\/[\w\-./]*)?uploads\/[\w\-./]+\.(webp|jpe?g|png|gif)$/i.test(String(src || '')) || f(src); }; }
/* yedekler IndexedDB'de değil */
fillBk = function () { };

/* ================= herkese açık: rehber, yazı, yasal sayfalar, ortaklık ================= */
const p7Min = p => +p.min || 1;
vRehber = function () { const P = posts();
  return `<div class="wrap"><nav class="crumbs" aria-label="Konum"><a href="#home">Ana sayfa</a> › <span>Rehber</span></nav><div class="page-h"><div><h1>Metin2 Rehberi</h1><p>Güvenli alışveriş, yang, EP ve karakter alım satımı üzerine ipuçları.</p></div></div>
  ${P.length ? `<div class="rgrid">${P.map(p => `<a class="rpost panel" href="#rehber-${esc(p.slug)}">${p.cover && p.cover.url ? `<img class="p7rc" src="${esc(p.cover.url)}" alt="" loading="lazy">` : ''}<span class="eyebrow">${dstr(p.t)} · ${p7Min(p)} dk okuma</span><h2>${esc(p.title)}</h2><p>${esc(p.ozet || '')}</p><span class="rmore">Devamını oku →</span></a>`).join('')}</div>` : emptyBox('Henüz rehber yazısı yok', 'Yakında burada güvenli alışveriş rehberleri olacak.')}</div>`; };
vPost = function (slug) {
  const d = need('post:' + slug, () => call('GET', 'posts/' + p7enc(slug), null, { quiet: true }).then(j => j.data.post), 60000);
  if (!d) return `<div class="wrap" style="max-width:780px">${pLoading('Yazı yükleniyor…')}</div>`;
  if (d.err) return vNotFound();
  const O = posts().filter(x => x.slug !== d.slug).slice(0, 3);
  return `<div class="wrap" style="max-width:780px"><nav class="crumbs" aria-label="Konum"><a href="#home">Ana sayfa</a> › <a href="#rehber">Rehber</a> › <span>${esc(d.title)}</span></nav>
  <article class="post"><h1>${esc(d.title)}</h1><div class="muted" style="font-size:13px">${dstr(d.t)}${d.up && d.up - d.t > D ? ' · güncellendi ' + dstr(d.up) : ''} · ${p7Min(d)} dk okuma${!d.on ? ' · <b>Taslak (yalnız yönetim görür)</b>' : ''}</div>
  ${d.cover && d.cover.url ? `<img class="p7pc" src="${esc(d.cover.url)}" alt="">` : ''}${d.ozet ? `<p class="lead">${esc(d.ozet)}</p>` : ''}<div class="prose">${d.html || ''}</div></article>
  <div class="panel panel-b" style="margin-top:18px">${shareBar('rehber-' + d.slug, d.title)}</div>
  ${O.length ? `<h2 style="margin:26px 0 10px;font-size:18px">Diğer rehberler</h2><div class="rgrid">${O.map(x => `<a class="rpost panel" href="#rehber-${esc(x.slug)}"><h3>${esc(x.title)}</h3><p>${esc(x.ozet || '')}</p></a>`).join('')}</div>` : ''}</div>`; };
vPage = function (k) {
  const d = need('page:' + k, () => call('GET', 'pages/' + p7enc(k), null, { quiet: true }).then(j => j.data.page), 60000);
  if (!d) return `<div class="wrap" style="max-width:820px">${pLoading('Sayfa yükleniyor…')}</div>`;
  if (d.err) return vNotFound();
  const miss = (d.missing || []).length + (d.unknown || []).length;
  return `<div class="wrap" style="max-width:820px"><nav class="crumbs" aria-label="Konum"><a href="#home">Ana sayfa</a> › <span>${esc(d.title)}</span></nav><div class="page-h"><div><h1>${esc(d.title)}</h1>${d.up ? `<p>Son güncelleme: ${dstr(d.up)}</p>` : ''}</div></div>
  ${miss && can('ayar') ? `<div class="note note-warn" style="margin-bottom:12px">Yalnız yönetim görür: bu sayfada <b>${miss}</b> eksik şirket bilgisi var (işaretli alanlar). Ziyaretçiler bu alanlarda nötr metin görür. <a href="#yonetim/ayar/yasal" style="text-decoration:underline">Şirket bilgilerini doldurun</a>.</div>` : ''}
  <div class="panel panel-b prose" style="max-width:none">${d.html || ''}</div></div>`; };
/* ortaklık: canlı (yakında değil); başvuru formunda görünmez bal küpü alanı */
{ const f = vPartner; vPartner = function () { return f.apply(this, arguments).replace('<form class="panel" data-form="papply">', '<form class="panel" data-form="papply"><div class="p7hp" aria-hidden="true"><label for="pa_w">Web sitesi (boş bırakın)</label><input id="pa_w" name="web" tabindex="-1" autocomplete="off"></div>'); }; }
{ const v0 = view; view = function (r) { if (r === 'ortaklik' && !API.booting && !(maintOn() && !isPanel())) return vPartner(); return v0(r); }; }
/* fiyat widget'ı: sunucudaki /widget/yang/ (başka sitelerde iframe içinde açılabilen tek sayfa) */
widgetCode = function (sid) { const s = sid ? srv(sid) : null; const src = siteBase() + '/widget/yang/' + (s && s.slug ? '?server=' + p7enc(s.slug) : ''); const page = shareUrl(sid ? 'server-' + sid + '-yang' : 'metin2-pvp'); const t = s ? `${s.name} yang fiyatı` : 'Metin2 yang fiyatları';
  return `<iframe src="${src}" width="320" height="${sid ? 170 : 360}" style="border:0;max-width:100%" loading="lazy" title="${esc(t)}"></iframe>\n<p style="font-size:12px"><a href="${page}">${esc(t)}</a> · ${esc(S.set.siteName)}</p>`; };
/* alt bilgi: yasal / kurumsal sayfalar sunucudan */
{ const f = renderFooter; renderFooter = function () { f.apply(this, arguments);
    const col = [...document.querySelectorAll('#ftr .fgrid > div')].find(x => { const h = x.querySelector('h4'); return h && /Yardım/.test(h.textContent); }); if (!col) return;
    const L = (P7.pages && P7.pages.length ? P7.pages : P7_PAGES.map(([k, title]) => ({ k, title }))); const ord = P7_PAGES.map(x => x[0]);
    const pages = L.slice().sort((a, b) => ord.indexOf(a.k) - ord.indexOf(b.k));
    col.innerHTML = `<h4>Yardım & kurumsal</h4><a href="#guvenli">Güvenli Alışveriş & SSS</a><a href="#home" data-act="ls-open">Canlı Destek</a>${pages.map(p => `<a href="#sayfa-${esc(p.k)}">${esc(p.title)}</a>`).join('')}`; }; }

/* ================= Yönetim ================= */
P_TODAY_Q.push(['partners', 'seo', 'seo', '#yonetim/seo/backlink']);
{ const ay = admItem('ayar'); if (ay && ay.subs && !ay.subs.some(s => s.s === 'yasal')) ay.subs.splice(1, 0, { s: 'yasal', l: 'Şirket & yasal sayfalar', kw: 'şirket unvan adres vergi vkn mersis kep künye kvkk mesafeli iade gizlilik çerez hakkımızda iletişim yasal sayfa' });
  if (ay) ay.desc = 'Site adı, komisyon, para çekme alt sınırı, şirket bilgileri ve yasal sayfalar, ETBİS ve yayına alma kontrolü.';
  const bk = admItem('bakim'); if (bk) { bk.desc = 'Bakım modu, sürüm ve güvenli güncelleme, veritabanı yedekleri.'; bk.kw = 'yedek bakım geri yükle güncelleme sürüm göç migration'; } }
const p7Err = d => d && d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : '';
const p7Ld = (k, path, fn, ttl) => p1AdmLoad(k, path, fn, ttl);

/* ---- SEO › Backlink & ortaklık, Rehber yazıları [seo] ---- */
function p7SetBl(x) { if (!x) return; if (Array.isArray(x.backlinks)) S.backlinks = x.backlinks; if (Array.isArray(x.partnerApps)) S.partnerApps = x.partnerApps; }
function p7Seo(sub) {
  if (sub === 'backlink') { const d = p7Ld('adm:bl', 'admin/backlinks', x => { p7SetBl(x); return { n: (x.backlinks || []).length, a: (x.partnerApps || []).length }; }, 20000);
    if (!d) return { body: pLoading() }; if (d.err) return { body: p7Err(d) };
    const done = (S.partnerApps || []).filter(a => a.st !== 'bekliyor').slice(0, 10);
    return { desc: 'Geri bağlantıları takip edin, ortaklık başvurularını onaylayın.', body: backlinkAdmin() + (done.length ? `<div class="panel"><div class="panel-h"><h3>Son kararlar</h3></div><div class="tbl-w"><table class="tbl mcards"><thead><tr><th>Başvuran</th><th>Tür</th><th>Adres</th><th>Karar</th></tr></thead><tbody>${done.map(a => `<tr><td><b>${esc(a.n)}</b>${a.s ? ' · ' + esc(a.s) : ''}</td><td>${esc({ server: 'Server sahibi', yayinci: 'Yayıncı', site: 'Site sahibi' }[a.tp] || a.tp)}</td><td class="mono" style="font-size:12px;overflow-wrap:anywhere">${esc(a.u)}</td><td><span class="pill ${a.st === 'onay' ? 'p-tamam' : 'p-iade'}">${a.st === 'onay' ? 'Onaylandı' : 'Reddedildi'}</span><div class="muted" style="font-size:11px">${a.decided ? dtstr(a.decided) : ''}</div></td></tr>`).join('')}</tbody></table></div></div>` : '') + seoAdmin('bl') }; }
  const d = p7Ld('adm:posts', 'admin/posts', x => { if (Array.isArray(x.posts)) S.posts = x.posts; return { n: (x.posts || []).length }; }, 30000);
  if (!d) return { body: pLoading() }; if (d.err) return { body: p7Err(d) };
  return { desc: 'Rehber yazıları: arama motorları ve paylaşım için en kalıcı içerik. Yayındaki yazılar site haritasına girer.', body: p7RehberAdmin() }; }
function p7PostFm(p, k) { const cv = P7.cover[k] !== undefined ? P7.cover[k] : (p.cover || null);
  return `<div class="row2"><div class="fld"><label for="pt_t_${k}">Başlık</label><input class="inp" id="pt_t_${k}" required maxlength="120" value="${esc(p.title || '')}"></div><div class="fld"><label for="pt_s_${k}">Adres (slug)</label><input class="inp mono" id="pt_s_${k}" maxlength="120" value="${esc(p.slug || '')}" placeholder="başlıktan otomatik"></div></div>
    <div class="fld"><label for="pt_o_${k}">Özet (liste ve paylaşımda görünür)</label><textarea class="inp" id="pt_o_${k}" maxlength="300" style="min-height:56px">${esc(p.excerpt != null ? p.excerpt : (p.ozet || ''))}</textarea></div>
    <div class="row2"><div class="fld"><label for="pt_st_${k}">SEO başlığı (boşsa başlık)</label><input class="inp" id="pt_st_${k}" maxlength="80" value="${esc(p.seoTitle || '')}"></div><div class="fld"><label for="pt_sd_${k}">Meta açıklama (120-160 karakter; boşsa özet)</label><input class="inp" id="pt_sd_${k}" maxlength="200" value="${esc(p.seoDesc || '')}"></div></div>
    <div class="fld"><span class="lbl">Kapak görseli (1200×630 önerilir)</span><div class="p7cover">${cv && cv.url ? `<img src="${esc(cv.url)}" alt="Kapak">` : '<span class="muted" style="font-size:12.5px">Kapak yok</span>'}<input type="hidden" id="pt_c_${k}" value="${esc(cv && cv.id ? cv.id : '')}"><label class="btn btn-sm" for="pt_cf_${k}">${cv && cv.url ? 'Değiştir' : 'Görsel yükle'}</label><input type="file" id="pt_cf_${k}" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-change="p7cover" data-k="${k}">${cv && cv.url ? `<button type="button" class="btn btn-sm btn-bad" data-act="p7cover-del" data-k="${k}">Kaldır</button>` : ''}</div></div>
    <div class="fld"><label for="pt_b_${k}">İçerik</label><textarea class="inp" id="pt_b_${k}" style="min-height:220px" required>${esc(p.body || '')}</textarea><span class="muted" style="font-size:12px">Boş satır = yeni paragraf · <span class="mono">## Başlık</span> · <span class="mono">- madde</span> · <span class="mono">1. madde</span> · <span class="mono">**kalın**</span> · bağlantı: <span class="mono">[Yang Borsası](#borsa)</span>. HTML etiketleri güvenlik için kaydedilmez.</span></div>
    <label class="chk" for="pt_on_${k}"><input type="checkbox" id="pt_on_${k}" ${p.on ? 'checked' : ''}> Yayında</label>`; }
function p7RehberAdmin() { const A = [...(S.posts || [])].sort((a, b) => (b.t || 0) - (a.t || 0));
  return `<form class="panel" data-form="postadd"><div class="panel-h"><h3>Yeni rehber yazısı</h3></div><div class="panel-b stack">${p7PostFm({ on: true }, 'new')}<div><button class="btn btn-sm btn-primary">Yazıyı ekle</button></div></div></form>
  <div class="panel"><div class="panel-h"><h3>Yazılar (${A.length})</h3><span class="muted" style="font-size:12px">${A.filter(p => p.on).length} yayında</span></div><div class="panel-b stack">${A.map(p => `<details class="epgrp"><summary><span class="epgrp-n"><b>${esc(p.title)}</b><small class="muted mono">${esc(routeToPath('rehber-' + p.slug))}</small></span><span class="hstack"><span class="chip ${p.on ? 'ok' : 'warn'}">${p.on ? 'Yayında' : 'Taslak'}</span><span class="chip">${dstr(p.t)}</span></span></summary>
    <form class="stack" data-form="postsave" data-id="${esc(p.id)}" style="padding-top:10px">${p7PostFm(p, p.id)}<div class="hstack"><button class="btn btn-sm btn-primary">Kaydet</button><a class="btn btn-sm" href="#rehber-${esc(p.slug)}">Görüntüle</a><button type="button" class="btn btn-sm btn-bad" data-act="post-del" data-id="${esc(p.id)}">Sil</button></div></form></details>`).join('') || '<span class="muted">Yazı yok.</span>'}</div></div>`; }

/* ---- Site ayarları [ayar] ---- */
const p7Site = () => p7Ld('adm:site', 'admin/settings/site', x => { if (x && x.etbis) S.set.etbis = Object.assign({}, x.etbis); return x; }, 30000);
function p7Ayar(sub) {
  if (sub === 'yayin') return p7GoLive();
  if (sub === 'yasal') return p7Yasal();
  const d = p7Site(); if (!d) return { body: pLoading() }; if (d.err) return { body: p7Err(d) };
  if (sub === 'etbis') return { desc: 'ETBİS kaydınızı girin; rozet sitenin alt kısmında görünür.', body: p7Etbis() };
  const s = d.site || {};
  return { body: `<form class="stack" data-form="settings">
    <div class="panel panel-b stack"><h3 class="ph3">Genel</h3><div class="row2"><div class="fld"><label for="st_name">Site adı</label><input class="inp" id="st_name" maxlength="60" required value="${esc(s.siteName || '')}"></div><div class="fld"><label for="st_slogan">Slogan</label><input class="inp" id="st_slogan" maxlength="80" value="${esc(s.slogan || '')}"></div></div>
      <div class="fld"><label for="st_url">Site adresi (davet linkleri, site haritası ve e-postalarda kullanılır)</label><input class="inp mono" id="st_url" value="${esc(s.siteUrl || '')}" placeholder="https://www.yangpazar.com" inputmode="url"></div>
      <div class="row3"><div class="fld"><label for="st_com">Komisyon oranı (%)</label><input class="inp" type="number" step="0.1" min="0" max="50" id="st_com" value="${esc(s.commission)}"></div><div class="fld"><label for="st_ac">Otomatik onay (saat, 1–72)</label><input class="inp" type="number" min="1" max="72" id="st_ac" value="${esc(s.autoConfirm)}"></div><div class="fld"><label for="st_min">En az para çekme (TL)</label><input class="inp" type="number" min="0" step="0.01" id="st_min" value="${esc(s.minWithdraw)}"></div></div>
      <div class="row3"><label class="chk" for="st_tfa"><input type="checkbox" id="st_tfa" ${s.tfaOn ? 'checked' : ''}> Üyeler 2 adımlı doğrulamayı (WhatsApp / e-posta kodu) açabilsin</label></div>
      <div class="row3"><label class="chk" for="st_pop"><input type="checkbox" id="st_pop" ${s.popupOn ? 'checked' : ''}> Popup reklam açık</label><div class="fld"><label for="st_pd">Popup gecikmesi (sn)</label><input class="inp" type="number" min="0" max="60" step="0.5" id="st_pd" value="${esc(s.popupDelay)}"></div><div class="fld"><label for="st_sh">Destek saatleri (alt bilgide görünen kısa metin)</label><input class="inp" id="st_sh" maxlength="40" value="${esc(s.supportHours || '')}"></div></div>
      <div class="row3"><div class="fld"><label for="st_pr">Puan karşılığı (kaç puan = 1 TL)</label><input class="inp" type="number" min="1" id="st_pr" value="${esc(s.ptRate)}"></div><div class="fld"><label for="st_wa">WhatsApp destek hattı</label><input class="inp mono" id="st_wa" value="${esc(s.whatsapp || '')}" placeholder="05xx xxx xx xx"></div></div>
      <span class="muted" style="font-size:12px">Tüm değerler sunucuda denetlenir; geçersiz alan kaydedilmez ve hangi alanın hatalı olduğu gösterilir.</span></div>
    ${aSave('Ayarları kaydet')}</form>` }; }
function p7Yasal() {
  const d = p7Ld('adm:pages', 'admin/pages', null, 30000); if (!d) return { body: pLoading() }; if (d.err) return { body: p7Err(d) };
  const C = d.company || {}, F = d.fields || {}, L = d.legal || {}, miss = L.missingCompany || [];
  const req = k => ['unvan', 'adres', 'vd', 'vkn', 'tel', 'email'].includes(k) || (C.type !== 'sahis' && ['mersis', 'sicil', 'kep'].includes(k));
  const fld = (k, ph, type) => `<div class="fld"><label for="co_${k}">${esc(F[k] || k)}${req(k) ? '' : ' <span class="p7tag">isteğe bağlı</span>'}</label><input class="inp${['vkn', 'mersis', 'tel'].includes(k) ? ' mono' : ''}" id="co_${k}" ${type ? `type="${type}"` : ''} value="${esc(C[k] || '')}" placeholder="${esc(ph || '')}"></div>`;
  return { desc: 'Şirket bilgileri yasal sayfalardaki [ŞİRKET UNVANI] gibi alanları kendiliğinden doldurur. Boş alan ziyaretçiye nötr metinle gösterilir; köşeli parantez asla görünmez.', body: `
  <div class="note ${L.ok ? 'note-ok' : 'note-warn'}">${L.ok ? '<b>Yasal sayfalar tamam.</b> Tüm zorunlu şirket bilgileri girildi.' : `<b>Eksik şirket bilgisi:</b> ${miss.map(k => esc(F[k] || k)).join(', ') || '—'}. PayTR başvurusundan önce doldurun; sayfalardaki eksik yerler aşağıda <mark class="ph">[sarı]</mark> işaretlidir (yalnız yönetim görür).`}</div>
  <form class="panel" data-form="p7company"><div class="panel-h"><h3>Şirket bilgileri (künye)</h3></div><div class="panel-b stack">
    <div class="row3"><div class="fld"><label for="co_type">İşletme türü</label><select class="inp" id="co_type"><option value="sirket" ${C.type !== 'sahis' ? 'selected' : ''}>Şirket (Ltd. / A.Ş.)</option><option value="sahis" ${C.type === 'sahis' ? 'selected' : ''}>Şahıs işletmesi</option></select><span class="muted" style="font-size:12px">Şahıs işletmesinde MERSİS, ticaret sicil ve KEP zorunlu değildir.</span></div>${fld('unvan', 'YangPazar Bilişim Ltd. Şti.')}${fld('tel', '0850 xxx xx xx')}</div>
    <div class="fld"><label for="co_adres">${esc(F.adres || 'Adres')}</label><input class="inp" id="co_adres" value="${esc(C.adres || '')}" placeholder="Mahalle, cadde, no, ilçe / il"></div>
    <div class="p7cmp">${fld('vd', 'Kadıköy')}${fld('vkn', '10 haneli VKN / 11 haneli TCKN')}${fld('mersis', '16 haneli')}${fld('sicil', 'İstanbul 123456')}${fld('email', 'destek@alanadiniz.com', 'email')}${fld('kep', 'unvan@hs01.kep.tr', 'email')}${fld('oda', 'İstanbul Ticaret Odası')}${fld('verbis', 'VERBİS kayıt no (varsa)')}${fld('hosting', 'Hosting firmasının unvanı')}${fld('msg', 'Meta Platforms (WhatsApp Business)')}</div>
  </div>${aSave('Şirket bilgilerini kaydet')}</form>
  <div class="panel"><div class="panel-h"><h3>Sayfalar</h3><span class="muted" style="font-size:12px">Alt bilgide ve /sayfa/… adreslerinde</span></div><div class="panel-b stack">
  ${(d.pages || []).map(p => { const pm = (p.missing || []).length + (p.unknown || []).length;
    return `<details class="epgrp"><summary><span class="epgrp-n"><b>${esc(p.title)}</b><small class="muted mono">${esc(routeToPath('sayfa-' + p.k))}</small></span><span class="hstack">${pm ? `<span class="chip warn">${pm} eksik</span>` : '<span class="chip ok">Tamam</span>'}${p.notes ? `<span class="chip" title="Avukat kontrolü notları ziyaretçiye görünmez">${p.notes} not</span>` : ''}<span class="chip">${dstr(p.up)}</span></span></summary>
    <form class="stack" data-form="p7page" data-k="${esc(p.k)}" style="padding-top:10px"><div class="fld"><label for="pg_t_${esc(p.k)}">Başlık</label><input class="inp" id="pg_t_${esc(p.k)}" maxlength="120" value="${esc(p.title)}"></div>
      <div class="fld"><label for="pg_b_${esc(p.k)}">Metin (Markdown)</label><textarea class="inp mono" id="pg_b_${esc(p.k)}" style="min-height:260px;font-size:12.5px">${esc(p.body || '')}</textarea><span class="muted" style="font-size:12px">Yer tutucular: <span class="mono">[ŞİRKET UNVANI] [ADRES] [VERGİ DAİRESİ] [VKN/TCKN] [MERSİS NO] [TİCARET SİCİL NO] [TELEFON] [E-POSTA] [KEP ADRESİ] [TARİH]</span> · <span class="mono">[AVUKAT KONTROLÜ]</span> gibi notlar ziyaretçiye görünmez.</span></div>
      <div class="stack" style="gap:6px"><span class="lbl">Önizleme (kayıtlı metin)</span><div class="p7prev prose">${p.html || ''}</div></div>
      <div class="hstack"><button class="btn btn-sm btn-primary">Kaydet</button><a class="btn btn-sm" href="#sayfa-${esc(p.k)}">Sayfayı aç</a><button type="button" class="btn btn-sm" data-act="p7page-reset" data-k="${esc(p.k)}">Taslak metne dön</button></div></form></details>`; }).join('')}
  </div></div>
  <div class="note note-info" style="font-size:12.5px">Bu metinler hukuki danışmanlık değildir; yayına almadan önce avukatınıza ve mali müşavirinize kontrol ettirin.</div>` }; }
function p7GoLive() {
  const d = p7Ld('adm:golive', 'admin/golive', null, 15000); if (!d) return { body: pLoading('Kontroller yapılıyor…') }; if (d.err) return { body: p7Err(d) };
  const C = d.checks || [], u = me();
  return { desc: 'Siteyi gerçek ödemelerle açmadan (ve PayTR başvurusundan) önce bu listenin tamamı yeşil olmalı. Her madde sunucuda kontrol edilir.', actions: '<button type="button" class="btn btn-sm" data-act="p7golive-re">Yeniden kontrol et</button>', body: `<div class="panel p7chk"><div class="panel-h" style="flex-wrap:wrap"><h3>Yayına alma kontrolü</h3><span class="pill ${d.ok === d.total ? 'p-tamam' : 'p-bekliyor'}">${d.ok}/${d.total} hazır</span></div><div class="panel-b stack">
    <div class="seochk">${C.map(c => `<div class="${c.ok ? 'ok' : c.opt ? 'opt' : 'no'}" data-gl="${esc(c.k)}"><i>${c.ok ? '✓' : c.opt ? '–' : '!'}</i><span><b>${esc(c.t)}${c.opt ? ' <span class="p7tag">isteğe bağlı</span>' : ''}</b><small>${esc(c.x || '')}</small>${!c.ok && c.h ? `<a href="${esc(c.h)}">Düzelt →</a>` : ''}</span></div>`).join('')}</div></div></div>
  ${u && u.admin ? `<form class="panel" data-form="golive"><div class="panel-h"><h3>Demo modu</h3></div><div class="panel-b stack"><label class="chk" for="gl_demo"><input type="checkbox" id="gl_demo" ${C.some(c => c.k === 'demo' && !c.ok) ? 'checked' : ''}> Demo modu (hesap değiştirici herkese açık — yalnız deneme sitesinde)</label><span class="muted" style="font-size:12px">Gerçek sitede kapalı olmalı. Yalnız yönetici değiştirebilir.</span></div>${aSave('Kaydet')}</form>` : ''}` }; }
function p7Etbis() { const E = etbisCfg(); const ready = etbisUrlOk(E.url);
  return etbisPanel().replace(/<div class="fld"><span class="lbl">Karekod \(QR\) görseli<\/span>[\s\S]*?<\/div><\/div>/, `<div class="fld"><span class="lbl">Karekod (QR) görseli</span><div class="hstack"><label class="btn btn-sm" for="eb_img">Görsel yükle</label><input type="file" id="eb_img" accept="image/png,image/jpeg,image/gif,image/webp" hidden data-change="etbisimg">${E.img ? '<button type="button" class="btn btn-sm btn-bad" data-act="etbis-img-del">Karekodu kaldır</button>' : '<span class="muted" style="font-size:12.5px">Yüklenmedi — rozet karekodsuz görünür.</span>'}${P7.etbImg ? '<span class="chip warn">Yapıştırılan karekod kaydedilmedi</span>' : ''}</div></div>`)
    + (ready && E.on ? '' : ''); }
/* Entegrasyonlar: ETBİS tek kaynak (Site ayarları › ETBİS) */
{ const f = p3Ent; p3Ent = function () { const r = f.apply(this, arguments);
    if (r && r.body) { const E = (S.set.etbis || {}); r.body = r.body.replace(/<form class="panel" data-form="p3etbis">[\s\S]*?<\/form>/, `<div class="panel panel-b hstack" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><span><b>ETBİS</b> <span class="pill ${E.on ? 'p-tamam' : 'p-bekliyor'}">${E.on ? 'Rozet açık' : 'Kapalı'}</span><br><span class="muted" style="font-size:12.5px">ETBİS kaydı, karekod ve rozet artık Site ayarları › ETBİS sayfasında.</span></span>${can('ayar') ? '<a class="btn btn-sm" href="#yonetim/ayar/etbis">ETBİS ayarları</a>' : ''}</div>`); }
    return r; }; }

/* ---- Yedek & bakım [bakim] ---- */
const p7Maint = () => p7Ld('adm:maint', 'admin/maint', null, 15000);
const p7Kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.ceil(n / 1024)) + ' KB';
const p7LocalDT = t => t ? new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
function p7Log(L, ok) { return L && L.length ? `<ol class="p7log ${ok === false ? 'note-bad' : ''}">${L.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''; }
function p7Bakim(sub) {
  if (sub === 'yedekler') return p7Yedek();
  const d = p7Maint(); if (!d) return { body: pLoading() }; if (d.err) return { body: p7Err(d) };
  const m = d.maint || {}, on = !!d.active, U = P7.upd;
  return { body: `<div class="panel ${on ? 'maint-on' : ''}"><div class="panel-h" style="flex-wrap:wrap"><h3>Bakım modu</h3><span class="pill ${on ? 'p-itiraz' : 'p-tamam'}">${on ? 'Bakımda · ziyaretçiler bakım sayfasını görüyor' : 'Site açık'}</span></div>
    <form class="panel-b stack" data-form="maintset"><div class="note note-info">Bakım modunda ziyaretçiler ve üyeler yalnızca bakım sayfasını görür; sunucu üyelerin tüm işlemlerini (satın alma, ilan, para çekme…) durdurur. Yönetici ve çalışanlar siteyi normal kullanır. Bakiyeler, siparişler ve ilanlar olduğu gibi korunur.</div>
      <div class="fld"><label for="mt_msg">Ziyaretçiye gösterilecek mesaj</label><textarea class="inp" id="mt_msg" maxlength="300" style="min-height:60px">${esc(m.msg || '')}</textarea></div>
      <div class="row3"><label class="chk" for="mt_on"><input type="checkbox" id="mt_on" ${m.on ? 'checked' : ''}> Bakım modu açık</label><div class="fld"><label for="mt_until">Tahmini bitiş (isteğe bağlı; gelince site kendiliğinden açılır)</label><input class="inp" type="datetime-local" id="mt_until" value="${p7LocalDT(m.until)}"></div><div></div></div>
      <div class="hstack"><button class="btn btn-primary">Kaydet</button></div></form></div>
  <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Sürüm ve güncelleme</h3><span class="pill ${d.pending && d.pending.length ? 'p-bekliyor' : 'p-tamam'}">${d.pending && d.pending.length ? d.pending.length + ' bekleyen göç' : 'Veritabanı güncel'}</span></div><div class="panel-b stack">
    <div class="sum"><div><span class="muted">Site sürümü</span><b class="mono">${esc(d.app || '')}</b></div><div><span class="muted">Veritabanı</span><b>${esc(((d.db || {}).dialect === 'mysql' ? 'MariaDB / MySQL ' : 'SQLite ') + ((d.db || {}).version || ''))}</b></div><div><span class="muted">Son yedek</span><b>${d.last ? esc(dtstr(d.last.t)) + ' · ' + esc(d.last.label) : 'yok'}</b></div><div><span class="muted">Cron (son çalışma)</span><b>${d.cronLast ? esc(ago(d.cronLast)) : 'çalışmadı'}</b></div></div>
    ${d.pending && d.pending.length ? `<div class="note note-warn">Bekleyen göçler: <span class="mono">${d.pending.map(esc).join(', ')}</span> — "Güvenli güncelleme" ile uygulayın (ilk ziyarette de kendiliğinden uygulanır).</div>` : ''}
    <details><summary class="muted" style="font-size:12.5px;cursor:pointer">Uygulanan son göçler</summary><ul class="p7mig mono">${(d.migrations || []).map(x => `<li>${esc(x.v)} · ${esc(dtstr(x.t))}</li>`).join('')}</ul></details>
    <div class="flow" style="margin:0"><div><i>1</i><b>Dosyaları yükleyin</b><p>Güncelleme paketini (yangpazar-guncelleme-….zip) cPanel › Dosya Yöneticisi ile site köküne çıkarın.</p></div><div><i>2</i><b>Güvenli güncelleme</b><p>Önce yedek alınır, site bakıma geçer, veritabanı güncellenir, bakım kapanır.</p></div><div><i>3</i><b>Kontrol edin</b><p>Sonuç günlüğünü okuyun; sorun olursa "Güncelleme öncesi" yedeğini geri yükleyin.</p></div></div>
    <div class="hstack"><button type="button" class="btn btn-primary" data-act="safe-update">Güvenli güncelleme (yedek → bakım → göçler)</button><span class="muted" style="font-size:12px">PHP sınırları: yükleme ${esc((d.limits || {}).upload || '?')}, bellek ${esc((d.limits || {}).memory || '?')}, süre ${(d.limits || {}).time || 0} sn</span></div>
    ${U ? `<div class="stack" style="gap:6px"><span class="lbl">Son güncelleme sonucu ${U.ok ? '<span class="pill p-tamam">Tamamlandı</span>' : '<span class="pill p-iade">Tamamlanamadı</span>'}</span>${p7Log(U.log, U.ok)}</div>` : ''}
  </div></div>` }; }
function p7Yedek() {
  const d = p1AdmLoad('adm:bk', 'admin/backups', null, 15000); if (!d) return { body: pLoading() }; if (d.err) return { body: p7Err(d) };
  const L = d.backups || [], A = !!d.isAdmin, on = !!d.active, bs = d.backup || {}, R = P7.rest;
  const AUTO = [['off', 'Otomatik yedek kapalı'], ['daily', 'Her gün'], ['12h', '12 saatte bir'], ['6h', '6 saatte bir']];
  return { body: `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Yedekler</h3><div class="hstack" style="flex-wrap:wrap"><select class="inp" style="width:auto" id="bk_auto" data-change="bkauto" aria-label="Otomatik yedek">${AUTO.map(([v, l]) => `<option value="${v}" ${bs.auto === v ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="hstack" for="bk_keep" style="gap:6px;font-size:12.5px"><span class="muted">Sakla</span><input class="inp mono" id="bk_keep" type="number" min="1" max="60" value="${+bs.keep || 7}" style="width:72px" data-change="p7bkkeep"></label><button class="btn btn-sm btn-primary" data-act="bk-now">Şimdi yedek al</button>${A ? '<label class="btn btn-sm" for="bk_file">Yedek dosyası yükle</label><input type="file" id="bk_file" accept=".gz,.sql,application/gzip,application/sql" hidden data-change="bkfile">' : ''}</div></div>
    <div class="panel-b stack" style="padding-bottom:0"><span class="muted" style="font-size:12px">Son yedek: ${d.last ? esc(dtstr(d.last.t)) + ' (' + esc(ago(d.last.t)) + ')' : 'yok'} · Otomatik yedeklerden son ${+bs.keep || 7} tanesi, güncelleme ve geri yükleme öncesi yedeklerden son 3 tanesi saklanır; elle alınanlar silinene kadar kalır. Yedekler sunucuda <span class="mono">storage/backups</span> klasöründe, dışarıya kapalıdır.</span>
      ${A ? (on ? '<div class="note note-warn" style="font-size:12.5px">Bakım modu açık: geri yükleme yapılabilir. Geri yüklemeden önce mevcut durum otomatik yedeklenir; sonra defter tutarlılığı denetlenir.</div>' : '<div class="note note-info" style="font-size:12.5px">Geri yükleme yalnız bakım modunda yapılır. <a href="#yonetim/bakim/bakim" style="text-decoration:underline">Bakım modunu açın</a>.</div>')
        : '<div class="note note-info" style="font-size:12.5px">İndirme, yedek dosyası yükleme ve geri yükleme yalnız yönetici (site sahibi) içindir.</div>'}
      ${R ? `<div class="stack" style="gap:6px"><span class="lbl">Son geri yükleme ${R.check && R.check.ok ? '<span class="pill p-tamam">Defter denetimi geçti</span>' : '<span class="pill p-iade">Defter denetimi başarısız</span>'}</span>${p7Log(R.log, R.check && R.check.ok)}</div>` : ''}</div>
    <div class="panel-b">${L.length ? `<div class="tbl-w"><table class="tbl mcards"><thead><tr><th>Tarih</th><th>Tür</th><th>Alan</th><th class="num">Boyut</th><th></th></tr></thead><tbody>${L.map((b, i) => `<tr><td style="white-space:nowrap"><b>${dtstr(b.t)}</b>${i === 0 ? ' <span class="chip ok">en yeni</span>' : ''}<div class="muted" style="font-size:11.5px">${ago(b.t)}</div></td><td>${esc(b.label)}${b.ok ? '' : ' <span class="chip warn">dosya yok</span>'}</td><td>${esc(b.by)}</td><td class="num">${p7Kb(b.size)}</td><td><div class="hstack" style="flex-wrap:nowrap">${A ? `<button class="btn btn-sm btn-primary" data-act="bk-restore" data-id="${esc(b.id)}" ${on && b.ok ? '' : 'disabled title="Önce bakım modunu açın"'}>Geri yükle</button><a class="btn btn-sm" href="${esc(apiUrl('admin/backups/' + b.id + '/download'))}" download="${esc(b.file)}">İndir</a>` : ''}<button class="btn btn-sm btn-bad" data-act="bk-del" data-id="${esc(b.id)}">Sil</button></div></td></tr>`).join('')}</tbody></table></div>` : emptyBox('Henüz yedek yok', '“Şimdi yedek al” ile ilk yedeği oluşturun.')}</div></div>` }; }

{ const v1 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (isPanel()) { const it = admItem(P.k); if (it && admVis(it)) {
      if (it.k === 'bakim') return pAdmPage(P, it, p7Bakim);
      if (it.k === 'ayar') return pAdmPage(P, it, p7Ayar);
      if (it.k === 'seo' && (P.sub === 'backlink' || P.sub === 'rehber') && admSubs(it).some(s => s.s === P.sub)) return pAdmPage(P, it, p7Seo); } }
    return v1(P); }; }
