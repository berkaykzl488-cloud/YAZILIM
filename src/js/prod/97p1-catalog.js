/* ================== P1: katalog ve SEO ekranları (yalnız --prod derlemesinde) ==================
   Sunucuya bağlı: ana sayfa (son ilanlar), Metin2 TR/PVP server listeleri, server sayfası (kategori, arama, sıralama,
   "Daha fazla" anahtar kümesi sayfalama), arama sonuçları ve üst arama önerileri, ilan ayrıntısı (görüntülenme),
   satıcı profili (#uye-<id>), ilan ver (önce yükle: fotoğraflar tarayıcıda ≤1600 px küçültülüp POST media ile yüklenir),
   ilan düzenle / kaldır / ücretsiz üste taşı, Hesabım › İlanlarım, Yönetim › İlanlar, Serverlar, Bakım › Güncellemeler.
   Henüz sunucuda olmayanlar (satın alma, doping, mesaj, EP, borsa, reklam) "Yakında" uyarısı verir.
   Tüm adresler hash rotasıdır (#ilan-l7); yönlendirmesiz (rewrite'sız) sunucularda da çalışır. Temiz adresler
   (/ilan/<başlık>-l7, /server/<slug>, /index.php?p=…) yalnız sunucu tarafı meta/canonical içindir; açılışta hash'e çevrilir. */
const P1 = { last: null, uk: 0, sugT: 0, sugDone: {}, fresh: {} };
const p1N = (s, c) => +((((s || {}).n) || {})[c || 'all']) || 0;
const p1Len = s => [...String(s || '')].length;
/** Sorgu nesnesi → kararlı sorgu dizesi (boş değerler atlanır) */
const p1Q = o => Object.keys(o).filter(k => o[k] !== '' && o[k] != null && o[k] !== false).sort().map(k => k + '=' + encodeURIComponent(o[k])).join('&');
function p1Up(arr, L) { (L || []).forEach(x => { if (!x || !x.id) return; const i = arr.findIndex(y => y.id === x.id); if (i < 0) arr.push(x); else arr[i] = Object.assign(arr[i], x); }); }
const p1UpL = L => p1Up(S.listings, L);
const p1UpS = L => p1Up(S.servers, L);
const p1UpU = L => (L || []).forEach(apiUpsertUser);
const p1Act = l => l && l.status === 'aktif' && l.stock > 0;
const p1Err = d => d && d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : '';
const p1It = x => typeof x === 'string' ? { url: x, st: 'ok' } : x;
const p1AdmLoad = (k, path, fn, ttl) => need(k, () => call('GET', path, null, { quiet: true }).then(j => fn ? fn(j.data) : j.data), ttl);
const p1AdmSrv = () => { const c = API.cache['adm:servers']; return c && c.v && Array.isArray(c.v.servers) ? c.v.servers : []; };
const P1_SORT = [['yeni', 'En yeni'], ['ucuz', 'En ucuz'], ['pahali', 'En pahalı'], ['eski', 'En eski']];
const P1_SOON = {
  buy: 'Güvenli satın alma (ödeme havuzu) çok yakında açılıyor. Şimdilik ilanları inceleyebilir, kendi ilanınızı verebilirsiniz.',
  dop: 'İlan dopingleri (vitrin, acil, renkli) çok yakında açılıyor. Ücretsiz üste taşıma 2 saatte bir kullanılabilir.',
  sms: 'Üyeye SMS ile ulaşma çok yakında açılıyor.'
};

/* ---- ilan listesi dilimi: need('L:<yol>?<sorgu>') → {ids, next, path, qs, lim}; "Daha fazla" aynı nesneye ekler ---- */
function p1List(o, path, lim) {
  path = path || 'listings'; lim = lim || 24; const qs = p1Q(o); const key = 'L:' + path + '?' + qs;
  return need(key, () => call('GET', path + '?' + (qs ? qs + '&' : '') + 'limit=' + lim, null, { quiet: true }).then(j => {
    const d = j.data || {}; p1UpL(d.listings); p1UpU(d.users); if (d.user) apiUpsertUser(d.user);
    return { key, path, qs, lim, ids: (d.listings || []).map(l => l.id), next: d.next || null, total: d.active != null ? +d.active : null };
  }));
}
const p1MoreBtn = (v, label) => v && v.next ? `<div class="p1more"><button type="button" class="btn" data-act="p1-more" data-k="${esc(v.key)}">${label || 'Daha fazla ilan göster'}</button></div>` : '';
const p1Sel = (cur) => `<select class="inp p1sort" id="p1_sort" data-f="sort" aria-label="Sıralama">${P1_SORT.map(([k, t]) => `<option value="${k}" ${(cur || 'yeni') === k ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
function p1Filt(ph) {
  return `<form class="p1filt" data-form="p1f" role="search"><input class="inp" id="p1_q" type="search" value="${esc(ui.f.q || '')}" placeholder="${esc(ph || 'Başlık veya ilan no ile ara')}" autocomplete="off" aria-label="İlanlarda ara">${p1Sel(ui.f.sort)}<button class="btn btn-sm btn-primary">Ara</button>${ui.f.q ? '<button type="button" class="btn btn-sm" data-act="p1-qclear">Aramayı temizle</button>' : ''}</form>`;
}

/* ---- açılış: temiz adres (/ilan/…, /server/…, ?p=…) → hash rotası ---- */
function p1PathRoute(p) {
  try { p = decodeURIComponent(p || ''); } catch (e) { }
  p = String(p).replace(/^\/+|\/+$/g, '').replace(/(^|\/)index\.(php|html)$/, ''); if (!p) return null;
  const a = p.split('/');
  if (a[0] === 'server' && a[1]) { const s = S.servers.find(x => x.slug === a[1]) || S.servers.find(x => slugify(x.name) === a[1]); return 'server-' + (s ? s.id : a[1]) + (a[2] ? '-' + a[2] : ''); }
  if (a[0] === 'ilan' && a[1]) return 'ilan-' + a[1].slice(a[1].lastIndexOf('-') + 1);
  if ((a[0] === 'rehber' || a[0] === 'sayfa') && a[1]) return a[0] + '-' + a[1];
  if (a[0] === 'yonetim') return a.join('/');
  if (/^(api|kurulum|uploads|assets)$/.test(a[0])) return null;
  return a.join('-');
}
if (YP_PROD) {
  try {
    const base = window.YP_BASE || '/'; const sp = new URLSearchParams(location.search); let p = sp.get('p');
    if (!p && location.pathname.indexOf(base) === 0) { const rest = location.pathname.slice(base.length); if (rest && !/^index\.(php|html)$/.test(rest)) p = rest; }
    if (p && location.hash.length <= 1) { const r = p1PathRoute(p); if (r) history.replaceState(null, '', base + '#' + r); }
  } catch (e) { }
}

/* ---- prod-only biçimler ---- */
if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="p1css">
.p1filt{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}.p1filt .inp{flex:1 1 200px;min-width:0;width:auto}.p1filt .p1sort{flex:0 1 170px}
.p1more{display:flex;justify-content:center;padding:14px}
.pup-t.p1-up img{opacity:.45}.pup-t.p1-err{border-color:var(--bad)}.pup-t.p1-err img{opacity:.35}
.p1-prog{position:absolute;left:8px;right:8px;bottom:26px;height:6px;border-radius:4px;background:rgba(0,0,0,.45);overflow:hidden}.p1-prog i{display:block;height:100%;background:var(--accent);transition:width .15s}
.p1-st{position:absolute;left:4px;right:4px;bottom:6px;font-size:10.5px;font-weight:700;text-align:center;color:#fff;text-shadow:0 1px 2px #000;line-height:1.2;overflow-wrap:anywhere}.p1-st.bad{color:#ffb4b4;bottom:auto;top:34px}
.p1prof{display:flex;gap:14px;align-items:center;flex-wrap:wrap}.p1prof .av{width:64px;height:64px;font-size:26px}.p1prof h1{margin:0;font-size:24px;overflow-wrap:anywhere}
.p1sys .feed>div{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
</style>`);

if (YP_PROD) {

/* ================= görünüm sarmalayıcıları ================= */
/* rota değişince liste/ilan/profil dilimleri yenilenir (her ziyaret sunucudan; görüntülenme sayılır) */
{ const r0 = render; render = function () { const r = route(); if (r !== P1.last) { const prev = P1.last; P1.last = r; if (prev !== null) { needDrop('L', 'lst', 'usr', 'me:lst'); Object.keys(API.cache).forEach(k => { if (k.indexOf('adm:lst') === 0) API.cache[k].t = 0; }); } } return r0.apply(this, arguments); }; }
/* yeni rota: satıcı profili */
{ const v0 = view; view = function (r) { if (/^uye-u[0-9]+$/.test(r) && !API.booting && !(maintOn() && !isPanel())) { if (ui.lastView !== 'uye') { ui.f = {}; ui.lastView = 'uye'; } return pProfile(r.slice(4)); } return v0(r); }; }

/* SEO: server adresleri sunucudaki adres parçasıyla (slug) */
{ const f = routeToPath; routeToPath = function (r) { const m = String(r || '').match(/^server-([^-]+)(?:-(.+))?$/); if (m) { const s = srv(m[1]); if (s && s.slug) return '/server/' + s.slug + (m[2] ? '/' + m[2] : ''); } return f(r); }; }
{ const f = pathToRoute; pathToRoute = function (p) { const r = p1PathRoute(p); return r || f(p); }; }
srvAuto = function (s) { const n = p1N(s);
  return `${s.name}, ${secName(s.sec)} bölümündeki serverlardan biridir. ${S.set.siteName} üzerinde ${s.name} item, yang${srvEp(s) ? ', EP' : ''} ve karakter ilanlarını inceleyebilir, kendi ilanınızı verebilirsiniz${n ? `; şu an ${n} aktif ilan var` : ''}. Ödemeniz, ürünü teslim aldığınızı onaylayana kadar güvenli havuzda bekler.`; };

/* server satırları ve kartları: ilan sayıları sunucudan (s.n) */
sItem = function (s, prem) {
  const open = s.open > now(); const cnt = p1N(s);
  const right = s.sec === 'tr' ? `<span class="o" style="color:var(--muted)">${cnt} ilan</span>` : `<span class="o">${open ? '<span style="color:var(--warn)">' + left(s.open) + '</span>' : '<span style="color:var(--muted)">' + cnt + ' ilan</span>'}</span>`;
  return `<a href="#server-${s.id}"${prem ? premAttr(s.id) : ''} class="sitem ${prem ? 'prem' : ''}">${logo(s, 34)}<div style="min-width:0"><div class="n">${esc(s.name)}</div><div class="m">${s.sec === 'tr' ? 'Resmi · Won, item, karakter' : esc(s.lv) + ' · ' + esc(s.type)}</div></div>${right}</a>`;
};
srvCard = function (s, prem) {
  const open = s.open > now();
  return `<a href="#server-${s.id}"${prem ? premAttr(s.id) : ''} class="scard" style="--c1:${s.c[0]};--c2:${s.c[1]}"><div class="scard-top">${logo(s, 56)}${prem ? '<span class="sponsor">Premium</span>' : s.sec === 'tr' ? '<span class="sponsor">Resmi</span>' : s.partner ? '<span class="sponsor">Partner</span>' : ''}</div>
    <div class="scard-b"><h3>${esc(s.name)} ${newTag(s)}</h3>
    <div class="chips">${s.sec === 'tr' ? '<span class="chip">Metin2 TR</span>' : `${s.lv ? `<span class="chip">${esc(s.lv)}</span>` : ''}${s.type && s.type !== 'PVP' ? `<span class="chip">${esc(s.type)}</span>` : ''}${open ? `<span class="chip warn">${left(s.open)} sonra açılıyor</span>` : ''}`}</div>
    <div class="m">${(s.sec === 'tr' || !S.set.pvpEpOn ? ['yang', 'item', 'karakter'] : M2CAT).map(c => `${catLabel(c, s.sec)} ${p1N(s, c)}`).join(' · ')}</div>
    <div class="m" style="margin-top:auto"><b style="color:var(--fg)">${p1N(s)}</b> aktif ilan</div></div></a>`;
};

/* ana sayfa: son ilanlar açılış verisinden (ilk 24, en yeni); vitrin dopingi yakında */
{ const f = vHome; vHome = function () { let h = f.apply(this, arguments);
    h = h.replace('İlanınızı vitrine çıkarmak için ilan verirken Vitrin dopingini seçin.', 'Vitrin dopingi çok yakında açılıyor. Şimdilik son eklenen ilanlar aşağıda.');
    if (!active().length) h = h.replace(/(<h2>Son Eklenen İlanlar<\/h2>[\s\S]*?<div class="lrows">)(<\/div>)/, '$1' + emptyBox('Henüz ilan yok', 'İlk ilanı siz verin; ilan vermek ücretsiz.', '<a class="btn btn-primary" href="#ilan-ver">İlan Ver</a>') + '$2');
    return h; }; }

/* server sayfası: kategori sekmeleri, arama, sıralama, "Daha fazla" (anahtar kümesi) */
vServer = function (id, cat) {
  let s = srv(id);
  if (!s) {
    const d = need('srv:' + id, () => call('GET', 'servers/' + encodeURIComponent(id), null, { quiet: true }).then(j => { p1UpS([j.data.server]); return { id: j.data.server.id }; }));
    if (!d) return `<div class="wrap">${pLoading('Server yükleniyor…')}</div>`;
    if (d.err || !srv(d.id)) return vNotFound();
    if (d.id !== id) { try { history.replaceState(null, '', '#server-' + d.id + (cat ? '-' + cat : '')); } catch (e) { } }
    s = srv(d.id); id = s.id;
  }
  const CATS = s.sec === 'tr' || !S.set.pvpEpOn ? ['yang', 'item', 'karakter'] : M2CAT;
  if (cat && cat !== 'hepsi' && !CATS.includes(cat) && !(cat === 'ep' && srvEp(s))) cat = null;
  const cl = c => c === 'hepsi' ? 'Tüm ilanlar' : c === 'ep' ? 'EP' : catLabel(c, s.sec);
  const open = s.open > now(); const nAll = p1N(s);
  const CD = { yang: s.sec === 'tr' ? '1 Won = 100M yang · anında teslim' : '100M bazında yang satışı', ep: 'Server nesne market parası', item: 'Silah, zırh, takı, simya, kostüm', karakter: 'Hazır karakter ve hesaplar' };
  const hero = `<div class="shero ${cat ? 'sm' : ''}" style="--c1:${s.c[0]};--c2:${s.c[1]}">${logo(s, cat ? 58 : 90)}<div style="flex:1;min-width:200px"><h1>${esc(s.name)}${cat ? ' · ' + cl(cat) : ''}</h1>${cat ? '' : `<p>${esc(s.desc || '')}</p>`}
    <div class="chips" style="margin-top:8px"><span class="chip">${secName(s.sec)}</span>${s.sec === 'pvp' ? `${s.lv ? `<span class="chip">${esc(s.lv)}</span>` : ''}${s.type && s.type !== 'PVP' ? `<span class="chip">${esc(s.type)}</span>` : ''}${s.open ? `<span class="chip">${open ? 'Açılış: ' + dtstr(s.open) : 'Açıldı: ' + dstr(s.open)}</span>` : ''}` : ''}<span class="chip">${nAll} aktif ilan</span></div></div>
    ${cat ? '' : `<div class="hstack shero-btns">${s.sec === 'pvp' && srvWeb(s.url) ? `<a class="btn" style="background:#fff;color:#111;border-color:#fff" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Web sitesi ↗</a>` : ''}<a class="btn" style="background:rgba(0,0,0,.3);color:#fff;border-color:rgba(255,255,255,.5)" href="#ilan-ver" data-act="sell-here" data-s="${s.id}">Bu servera ilan ver</a></div>`}</div>`;
  const crumbs = `<div class="crumbs"><a href="#home">Ana Sayfa</a> › <a href="#metin2-${s.sec}">${secName(s.sec)}</a> › ${cat ? `<a href="#server-${s.id}">${esc(s.name)}</a> › ${cl(cat)}` : esc(s.name)}</div>`;
  const tabs = `<div class="ctabs"><a href="#server-${s.id}-hepsi" class="${cat === 'hepsi' ? 'on' : ''}">Tümü<span>${nAll}</span></a>${CATS.map(c => `<a href="#server-${s.id}-${c}" class="${c === cat ? 'on' : ''}">${catLabel(c, s.sec)}<span>${p1N(s, c)}</span></a>`).join('')}${s.sec === 'tr' ? `<a href="#metin2-ep">Metin2 EP</a>` : ''}${srvEp(s) ? `<a href="#server-${s.id}-ep" class="${cat === 'ep' ? 'on' : ''}">EP<span>·</span></a>` : ''}</div>`;
  if (!cat) {
    const d = p1List({ server: s.id, sort: 'yeni' });
    const top = d && !d.err ? d.ids.map(lst).filter(p1Act).slice(0, 8) : [];
    return `<div class="wrap">${crumbs}${hero}
    <div class="eyebrow" style="margin-bottom:10px">Ne arıyorsunuz?</div>
    <div class="catcards"><a href="#server-${s.id}-hepsi" class="catcard callcard"><span class="ccov allcov"><b>${nAll}</b><span>ilan</span></span><h3>Tüm ilanlar</h3><span class="m">${esc(s.name)} serverındaki bütün ilanlar tek sayfada</span><span class="low"><span>${CATS.map(c => cl(c)).join(' · ')}</span></span></a>${CATS.map(c => `<a href="#server-${s.id}-${c}" class="catcard"><span class="ccov">${coverHtml(c + '-1')}</span><h3>${esc(s.name)} ${catLabel(c, s.sec)}</h3><span class="m">${CD[c]}</span><span class="low"><span>${p1N(s, c)} ilan</span></span></a>`).join('')}
    ${srvEp(s) ? `<a href="#server-${s.id}-ep" class="catcard"><span class="ccov">${coverHtml('ep-2')}</span><h3>${esc(s.name)} EP</h3><span class="m">Site satıcı · anında kod teslimi</span><span class="low"><span>Çok yakında</span></span></a>` : ''}${s.sec === 'tr' ? `<a href="#metin2-ep" class="catcard"><span class="ccov">${coverHtml('ep-1')}</span><h3>Metin2 EP</h3><span class="m">Site satıcı · anında otomatik kod · tüm TR serverlarında geçerli</span><span class="low"><span>Çok yakında</span></span></a>` : ''}</div>
    <div class="panel" style="margin-top:18px"><div class="panel-h" style="flex-wrap:wrap"><h2>Son eklenen ilanlar</h2><a class="btn btn-sm" href="#server-${s.id}-hepsi">Tüm ilanları gör →</a></div><div class="lrows">${!d ? pLoading('İlanlar yükleniyor…') : d.err ? p1Err(d) : top.map(row).join('') || emptyBox('Bu serverda henüz ilan yok', 'İlk ilanı vererek alıcılara ulaşın.', `<a class="btn btn-primary" href="#ilan-ver" data-act="sell-here" data-s="${s.id}">İlan Ver</a>`)}</div></div></div>`;
  }
  if (cat === 'ep' && srvEp(s)) return `<div class="wrap">${crumbs}${hero}${tabs}${pSoon(s.name + ' EP satışı çok yakında', 'EP kodları site tarafından satılacak; ödeme sonrası kod anında ekranda gösterilecek.')}</div>`;
  const q = (ui.f.q || '').trim(), sort = ui.f.sort || 'yeni';
  const d = p1List({ server: s.id, cat: cat === 'hepsi' ? '' : cat, q, sort });
  const L = d && !d.err ? d.ids.map(lst).filter(p1Act) : [];
  const n = cat === 'hepsi' ? nAll : p1N(s, cat);
  const sellBtn = lab => `<a class="btn btn-sm btn-primary" href="#ilan-ver" data-act="sell-here" data-s="${s.id}" ${cat === 'hepsi' ? '' : `data-c="${cat}"`}>${lab}</a>`;
  return `<div class="wrap">${crumbs}${hero}${tabs}
  <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h2>${q ? `“${esc(q)}” için ${L.length}${d && d.next ? '+' : ''} ilan` : `${n} ilan`}</h2><div class="hstack">${sellBtn('+ İlan Ver')}</div></div>
    <div class="panel-b" style="padding-bottom:0">${p1Filt(s.name + ' ' + (cat === 'hepsi' ? 'ilanlarında' : cl(cat) + ' ilanlarında') + ' ara')}</div>
    <div class="lrows">${!d ? pLoading('İlanlar yükleniyor…') : d.err ? p1Err(d) : L.map(row).join('') || emptyBox(q ? 'Bu aramaya uyan ilan yok' : `${esc(s.name)} için ${cat === 'hepsi' ? '' : cl(cat) + ' '}ilanı yok`, q ? 'Aramanızı değiştirin ya da temizleyin.' : 'Bu kategoride ilk ilanı siz verin.', q ? '<button type="button" class="btn" data-act="p1-qclear">Aramayı temizle</button>' : sellBtn('İlan Ver'))}</div>
    ${p1MoreBtn(d)}</div></div>`;
};

/* arama sonuçları (#ara): sunucuda arama + eşleşen serverlar */
{ const f = vCategory; vCategory = function (game) { if (game !== 'ara') return f.apply(this, arguments);
    const q = (ui.q || '').trim(); const sort = ui.f.sort || 'yeni';
    if (!q) return `<div class="wrap"><div class="page-h"><div><h1>Arama</h1><p>Üstteki arama kutusuna server, item, won, EP veya ilan no yazın.</p></div></div></div>`;
    const qn = sqNorm(q); const hits = S.servers.filter(s => sqNorm(s.name).includes(qn)).slice(0, 12);
    const d = p1List({ q, sort }); const L = d && !d.err ? d.ids.map(lst).filter(p1Act) : [];
    return `<div class="wrap"><div class="page-h"><div><h1>Arama sonuçları</h1><p>“${esc(q)}” için ${d && !d.err ? L.length + (d.next ? '+' : '') : '…'} ilan</p></div><a href="#ilan-ver" class="btn btn-primary">+ İlan Ver</a></div>
    ${hits.length ? `<div class="sgrid" style="margin-bottom:16px">${hits.map(s => srvCard(s)).join('')}</div>` : ''}
    <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h2>İlanlar</h2>${p1Sel(sort)}</div><div class="lrows">${!d ? pLoading('Aranıyor…') : d.err ? p1Err(d) : L.map(row).join('') || emptyBox('Bu aramaya uyan ilan yok', 'Farklı bir kelime deneyin ya da aradığınız ürün için ilk ilanı siz verin.', '<a class="btn btn-primary" href="#ilan-ver">İlan Ver</a>')}</div>${p1MoreBtn(d)}</div></div>`; }; }

/* üst arama önerileri: yerel sonuçlar hemen, sunucu sonuçları (search/suggest) gelince güncellenir */
{ const q0 = qSug; qSug = function (v) { q0(v); const q = String(v || '').trim(); clearTimeout(P1.sugT); if (p1Len(q) < 2) return; const k = q.toLocaleLowerCase('tr-TR'); if (P1.sugDone[k]) return;
    P1.sugT = setTimeout(() => { call('GET', 'search/suggest?q=' + encodeURIComponent(q), null, { quiet: true }).then(j => { P1.sugDone[k] = 1; const d = j.data || {}; p1UpS(d.servers); p1UpL(d.listings); p1UpU(d.users);
      const i = $('#q'); if (i && i.value === v && document.activeElement === i) q0(v); }).catch(() => { }); }, 220); }; }

/* ilan ayrıntısı: her ziyarette sunucudan (görüntülenme sayılır, sahibi hariç) */
{ const v0 = vListing; vListing = function (id) {
    const d = need('lst:' + id, () => call('GET', 'listings/' + encodeURIComponent(id), null, { quiet: true }).then(j => { const x = j.data || {}; p1UpU(x.users); if (x.server) p1UpS([x.server]); p1UpL([x.listing]); return { views: x.listing.views, up: x.listing.up, st: x.listing.status }; },
      e => { if (e && e.http === 404) S.listings = S.listings.filter(l => l.id !== id); throw e; }));
    let l = lst(id);
    if (!d && !l) return `<div class="wrap">${pLoading('İlan yükleniyor…')}</div>`;
    if (d && d.err) return `<div class="wrap">${emptyBox('İlan bulunamadı', esc(d.err), '<a class="btn btn-primary" href="#home">Ana sayfaya dön</a>')}</div>`;
    if (!l) return vNotFound();
    const views = l.views, dp = S.dopings; let h;
    S.dopings = {}; try { h = v0(id); } finally { S.dopings = dp; l.views = views; }
    const u = user(l.seller), mine = S.cur === l.seller;
    h = h.replace('<div class="ltiles">', `<div class="ltiles"><div>${LI.eye}<span><small>Görüntülenme</small><b id="lViews">${NUM(views || 0)}</b></span></div>`);
    h = h.replace('<div class="eyebrow">Doping al · süreyi siz seçin</div><div class="stack" style="gap:8px"></div>', `<div class="note note-info" style="font-size:12.5px"><b>Dopingler yakında.</b> ${esc(P1_SOON.dop)}</div>`);
    const stNote = { beklemede: '<b>Bu ilan onay bekliyor.</b> Yönetici onayladığında yayına girer; şu an yalnız siz ve yöneticiler görebilir.', kaldirildi: '<b>Bu ilan yayından kaldırıldı.</b> Ziyaretçiler bu ilanı göremez.', satildi: '<b>Bu ilanın stoğu bitti.</b> Stok eklemek için ilanı düzenleyin.' }[l.status];
    if (stNote && (mine || isPanel())) h = h.replace('<div class="lprice">', `<div class="note ${l.status === 'beklemede' ? 'note-warn' : 'note-bad'}">${stNote}</div><div class="lprice">`);
    if (!mine && l.status !== 'aktif' && l.status !== 'satildi') h = h.replace('<div class="note note-bad"><b>Bu ilan satıldı.</b> Benzer ilanlar için kategoriye göz atın.</div>', '');
    if (mine && l.status === 'kaldirildi') h = h.replace(/<button class="btn btn-bad btn-sm" data-act="unlist"[^>]*>[^<]*<\/button>/, '');
    h = h.replace(`<div class="seller">${av(u)}<div><b>${esc(u.name)}</b>`, `<div class="seller">${av(u)}<div><a href="#uye-${esc(u.id)}" class="p1seller"><b>${esc(u.name)}</b></a>`);
    h = h.replace(`<a href="#mesajlar-${u.id}">${esc(u.name)}</a>`, `<a href="#uye-${esc(u.id)}">${esc(u.name)}</a>`);
    return h; }; }

/* satıcı profili: herkese açık bilgiler + aktif ilanları ("Daha fazla") */
function pProfile(id) {
  const d = p1List({ sort: 'yeni' }, 'users/' + id);
  const u = S.users.find(x => x.id === id);
  if (!d && !u) return `<div class="wrap">${pLoading('Profil yükleniyor…')}</div>`;
  if (d && d.err) return `<div class="wrap">${emptyBox('Üye bulunamadı', esc(d.err), '<a class="btn btn-primary" href="#home">Ana sayfaya dön</a>')}</div>`;
  const U = user(id); const L = d ? d.ids.map(lst).filter(p1Act) : []; const n = d && d.total != null ? d.total : L.length;
  return `<div class="wrap"><div class="crumbs"><a href="#home">Ana Sayfa</a> › Satıcı › ${esc(U.name)}</div>
  <div class="panel panel-b p1prof">${av(U)}<div style="flex:1;min-width:200px"><h1>${esc(U.name)} ${U.verified ? '<span class="vchk">✔ Doğrulanmış</span>' : ''}</h1><div class="muted" style="font-size:13px"><span class="stars">${stars(U.rating)}</span> ${(+U.rating || 0).toFixed(1)} ${vipBadge(U)} · ${seenTxt(U)}</div></div>
    <div class="kpis" style="flex:1 1 320px"><div class="kpi"><small>Aktif ilan</small><b>${NUM(n)}</b></div><div class="kpi"><small>Başarılı satış</small><b>${NUM(U.sales || 0)}</b></div><div class="kpi"><small>Üyelik</small><b>${esc(U.joined || '-')}</b></div></div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>${esc(U.name)} ilanları</h2>${S.cur === id ? '<a class="btn btn-sm" href="#hesabim" data-act="tab" data-t="ilan">İlanlarımı yönet</a>' : ''}</div><div class="lrows">${!d ? pLoading() : L.map(row).join('') || emptyBox('Aktif ilanı yok', '')}</div>${p1MoreBtn(d)}</div></div>`;
}

/* Hesabım › İlanlarım (tüm durumlar) */
function pMyListings(u) {
  const d = p1List({}, 'me/listings', 50);
  if (!d) return `<div class="panel">${pLoading('İlanlarınız yükleniyor…')}</div>`;
  if (d.err) return `<div class="panel panel-b">${p1Err(d)}</div>`;
  const my = d.ids.map(lst).filter(l => l && l.seller === u.id);
  const ST_ = { aktif: ['p-tamam', 'Yayında'], beklemede: ['p-bekliyor', 'Onay bekliyor'], satildi: ['p-iade', 'Stok bitti'], kaldirildi: ['p-iade', 'Kaldırıldı'] };
  return `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>İlanlarım</h3><a class="btn btn-sm btn-primary" href="#ilan-ver">+ İlan ver</a></div><div class="panel-b" style="padding-top:0"><span class="muted" style="font-size:12px">Her ilanı 2 saatte bir ücretsiz olarak listenin en üstüne taşıyabilirsiniz.${S.set.moderation ? ' Yeni ilanlar yönetici onayından sonra yayına girer.' : ''}</span></div>
  ${my.length ? `<div class="tbl-w"><table class="tbl mcards"><thead><tr><th>İlan no</th><th>İlan</th><th>Durum</th><th class="num">Stok</th><th class="num">Fiyat</th><th></th></tr></thead><tbody>${my.map(l => { const st = ST_[l.status] || ['p-iade', l.status]; return `<tr data-lid="${esc(l.id)}"><td class="mono">#${l.no}</td><td><a href="#ilan-${l.id}" style="font-weight:600">${esc(l.title)}</a><div class="muted" style="font-size:12px">${esc(lsub(l))} · ${catName(l)} · ${NUM(l.views || 0)} görüntülenme${l.bump ? ' · son taşıma ' + ago(l.bump) : ''}</div></td><td><span class="pill ${st[0]}">${st[1]}</span></td><td class="num">${NUM(l.stock)}</td><td class="num">${TL(l.price)}</td><td><div class="hstack" style="flex-wrap:nowrap">${l.status === 'aktif' ? freeBumpBtn(l) : ''}${l.status !== 'kaldirildi' ? `<button class="btn btn-sm" data-act="edit-l" data-id="${l.id}">Düzenle</button><button class="btn btn-sm btn-bad" data-act="unlist" data-id="${l.id}">Kaldır</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>${p1MoreBtn(d, 'Daha fazla göster')}` : emptyBox('Henüz ilanınız yok', 'İlk ilanınızı verin, alıcılar sizi bulsun.', '<a class="btn btn-primary" href="#ilan-ver">İlan Ver</a>')}</div>`;
}

/* ilan ver: doping paneli yakında, ilan no sunucuda verilir */
{ const f = vSell; vSell = function () { const dp = S.dopings; let h; S.dopings = {}; try { h = f.apply(this, arguments); } finally { S.dopings = dp; }
    h = h.replace(/<div class="panel panel-b stack"><div class="eyebrow">4 · Doping \(isteğe bağlı\)<\/div>[\s\S]*?id="dopTot">[^<]*<\/span><\/div><\/div>\s*<\/div>/, `<div class="panel panel-b stack"><div class="eyebrow">4 · Doping</div><div class="note note-info"><b>Dopingler yakında.</b> ${esc(P1_SOON.dop)}</div></div>`);
    h = h.replace(` · Sıradaki ilan no: <b class="mono">#${S.lno + 1}</b>`, '');
    if (S.set.moderation) h = h.replace('<div class="hstack"><button class="btn btn-primary" style="padding:13px 24px">İlanı Yayınla</button>', '<div class="note note-info">İlanınız yönetici onayından sonra yayına girer.</div><div class="hstack"><button class="btn btn-primary" style="padding:13px 24px">İlanı Yayınla</button>');
    return h; }; }

/* fotoğraf yükleme alanı (önce yükle): her dosyanın ilerlemesi / hatası ayrı gösterilir */
pupThumbs = function (p) { const L = UPL[p] || [];
  return L.map((x, i) => { const it = p1It(x); const st = it.st || 'ok';
    return `<div class="pup-t ${i === 0 ? 'cov' : ''} ${st !== 'ok' ? 'p1-' + st : ''}" data-pk="${esc(p + ':' + (it.k || 'i' + i))}" title="${esc(it.info || it.name || '')}"><img src="${esc(it.url)}" alt="Fotoğraf ${i + 1}">${st === 'up' ? `<span class="p1-prog"><i style="width:${+it.pct || 0}%"></i></span><span class="p1-st">${it.pct ? 'Yükleniyor %' + it.pct : 'Hazırlanıyor…'}</span>` : st === 'err' ? `<span class="p1-st bad" role="alert">${esc(it.err || 'Yüklenemedi')}</span>` : ''}${i === 0 ? '<span class="pup-b">Kapak</span>' : `<button type="button" class="pup-c" data-act="pupcov" data-p="${p}" data-i="${i}" title="Kapak yap">★</button>`}<button type="button" class="pup-x" data-act="pupdel" data-p="${p}" data-i="${i}" aria-label="Fotoğrafı kaldır">✕</button></div>`; }).join(''); };
pupHtml = function (p, label) { const n = (UPL[p] || []).length;
  return `<div class="pup" id="pup_${p}"><div class="pup-grid">${pupThumbs(p)}${n < PUP_MAX ? `<label class="pup-add" for="${p}_files"><b>＋</b><span>Fotoğraf ekle</span><small>${n}/${PUP_MAX}</small></label>` : ''}</div><input id="${p}_files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-change="pupadd" data-p="${p}"><span class="muted" style="font-size:12px">${label || 'En fazla 10 fotoğraf (JPG, PNG, WEBP). Büyük fotoğraflar yüklenmeden önce otomatik küçültülür. İlk fotoğraf kapak olur; ★ ile kapağı değiştirebilirsiniz.'}</span></div>`; };

/* ================= Yönetim ================= */
listTbl = function (L) { return `<div class="tbl-w"><table class="tbl mcards"><thead><tr><th>İlan no</th><th>İlan</th><th>Satıcı</th><th>Durum</th><th class="num">Fiyat</th><th></th></tr></thead><tbody>${L.map(l => `<tr data-lid="${esc(l.id)}"><td class="mono">#${l.no}</td><td><a href="#ilan-${l.id}" style="font-weight:600">${esc(l.title)}</a><div class="muted" style="font-size:12px">${esc(lsub(l))} · ${catName(l)} · ${ago(l.t)}</div></td><td><b>${esc(user(l.seller).name)}</b></td><td><span class="pill ${l.status === 'aktif' ? 'p-tamam' : l.status === 'beklemede' ? 'p-bekliyor' : 'p-iade'}">${{ aktif: 'Yayında', beklemede: 'Onay bekliyor', satildi: 'Stok bitti', kaldirildi: 'Kaldırıldı' }[l.status] || esc(l.status)}</span></td><td class="num">${TL(l.price)}</td><td><div class="hstack" style="flex-wrap:nowrap">${l.status === 'beklemede' || (l.status === 'kaldirildi' && can('ilan')) ? `<button class="btn btn-sm btn-ok" data-act="l-ok" data-id="${l.id}">${l.status === 'beklemede' ? 'Onayla' : 'Yayına al'}</button>` : ''}${l.seller === S.cur ? `<button class="btn btn-sm" data-act="edit-l" data-id="${l.id}">Düzenle</button>` : ''}${l.status !== 'kaldirildi' ? `<button class="btn btn-sm btn-bad" data-act="l-del" data-id="${l.id}">Kaldır</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`; };
CFM['srv-del'] = d => { const s = srv(d.id) || (p1AdmSrv().find(x => x.id === d.id)) || {}; const n = p1N(s); return ['Server silinsin mi?', `<b>${esc(s.name || '')}</b> silinecek.${n ? ` Bu serverda <b>${n} aktif ilan</b> var; önce ilanların kaldırılması gerekir.` : ' Server listelerden kalkar (kayıt silinmez, geçmiş korunur).'}`, 'Serverı sil', 1]; };
/** Yönetim server listesi (gizliler dahil; GET admin/servers) */
function p1AdmSrvUp(s, del) { const L = p1AdmSrv(); if (del) { const i = L.findIndex(x => x.id === del); if (i >= 0) L.splice(i, 1); return; } p1Up(L, [s]); }

svPageHtml = function (sec) { const L = S.servers.filter(s => s.sec === sec);
  const D_ = s => ({ ilan: p1N(s), ep: sec === 'pvp' && s.ep ? 1 : 0, ad: 0, web: srvWeb(s.url) ? 1 : 0, seo: (s.seo || '').trim() ? 1 : 0 });
  const cnt = { ilan: L.filter(s => p1N(s) > 0).length, ep: L.filter(s => s.ep).length, ad: 0, noweb: L.filter(s => !D_(s).web).length, noseo: L.filter(s => !D_(s).seo).length };
  const F = ui.svF || []; const chip = (k, l) => `<button type="button" class="afchip ${F.includes(k) ? 'on' : ''}" data-act="svf" data-k="${k}" aria-pressed="${F.includes(k)}">${l} <b>${cnt[k]}</b></button>`;
  const rows = L.map(s => { const d = D_(s); const ep = sec === 'pvp' ? (s.ep ? '<span class="chip ok">Açık</span>' : '<span class="muted">Kapalı</span>') : '';
    const web = d.web ? `<a class="svweb" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" data-act="sv-web" aria-label="${esc(s.name)} web sitesi" title="${esc(s.url)}">${ADM_ICO.ext}</a>` : '<span class="chip warn">Eksik</span>';
    return `<tr data-id="${s.id}" data-act="sv-edit" data-hay="${esc(s.name.toLocaleLowerCase('tr-TR'))}" data-name="${esc(s.name)}" data-ilan="${d.ilan}" data-ep="${d.ep}" data-ad="${d.ad}" data-web="${d.web}" data-seo="${d.seo}" data-added="${s.added || 0}" tabindex="0">
      <td class="c-n"><span class="svn">${logo(s, 28)}<span><b>${esc(s.name)}</b>${s.hidden ? ' <span class="chip warn">Gizli</span>' : ''}${s.desc ? `<small title="${esc(s.desc)}">${esc(s.desc)}</small>` : ''}</span></span></td>
      <td>${esc(s.type || '')}</td><td class="mono">${esc(s.lv || '')}</td><td class="num">${d.ilan}</td>${sec === 'pvp' ? `<td>${ep}</td>` : ''}<td><span class="muted">Yok</span></td><td>${web}</td>
      <td class="c-m"><span class="chip">${esc(s.type || '-')} · ${esc(s.lv || '-')}</span><span class="chip">${d.ilan} ilan</span>${sec === 'pvp' && s.ep ? '<span class="chip ok">EP açık</span>' : ''}${s.hidden ? '<span class="chip warn">Gizli</span>' : ''}${d.web ? '' : '<span class="chip warn">Web eksik</span>'}</td>
      <td class="c-b"><button type="button" class="btn btn-sm" data-act="sv-edit" data-id="${s.id}">Düzenle</button></td></tr>`; }).join('');
  return `<div class="panel svpanel"><div class="svtools"><div class="svtools-r1"><div class="afq">${ADM_ICO.q}<input class="inp" id="sv_q" type="search" placeholder="Server adı ara" value="${esc(ui.svQ || '')}" autocomplete="off" aria-label="Server adı ara"></div>
      <select class="inp" id="sv_sort" data-change="svsort" aria-label="Sıralama">${[['ad', 'Ada göre (A-Z)'], ['ilan', 'İlan sayısı'], ['yeni', 'Eklenme tarihi']].map(([k, v]) => `<option value="${k}" ${(ui.svSort || 'ad') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button type="button" class="btn btn-primary btn-sm" data-act="sv-add">+ Server ekle</button></div>
    <div class="svtools-r2"><div class="afchips">${chip('ilan', 'İlanı olan')}${sec === 'pvp' ? chip('ep', 'EP satışı açık') : ''}${chip('noweb', 'Web sitesi eksik')}${chip('noseo', 'SEO metni eksik')}</div><span class="svcnt" id="sv_cnt" aria-live="polite">${L.length} server</span></div></div>
    <div class="tbl-w" id="svTblW"><table class="tbl svtbl"><thead><tr><th>Server</th><th>Tür</th><th>Level</th><th class="num">İlan</th>${sec === 'pvp' ? '<th>EP satışı</th>' : ''}<th>Reklam</th><th>Web</th><th class="c-m"></th><th></th></tr></thead><tbody id="svRows">${rows}</tbody></table></div>
    <div id="sv_empty" class="empty" hidden><b>Bu aramayla eşleşen server yok.</b>Filtreleri temizleyin veya yeni server ekleyin.<div style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="sv-clear">Filtreleri temizle</button></div></div>
    <div class="svmore" id="sv_more" hidden><button type="button" class="btn btn-sm" data-act="sv-more">Daha fazla göster</button><span class="muted" id="sv_more_t" style="font-size:12.5px"></span></div></div>`; };
svDrawer = function (id) { const isNew = id === 'new'; const s = isNew ? null : srv(id); if (!isNew && !s) return '';
  const sec = isNew ? (ui.svSec || 'tr') : s.sec; const nL = s ? p1N(s) : 0;
  const head = `<div class="sdrawer-h">${isNew ? '' : `<span class="lgprev-h">${logo(s, 40)}</span>`}<div><h2 id="sdT">${isNew ? esc(secName(sec)) + ' serverı ekle' : esc(s.name)}</h2><small>${isNew ? 'Yeni server yalnız bu bölümde listelenir' : `${esc(secName(s.sec))} · ${nL} aktif ilan${s.added ? ' · eklendi ' + dstr(s.added) : ''}`}</small></div><button type="button" class="ibtn" data-act="sv-close" aria-label="Kapat">${ADM_ICO.x}</button></div>`;
  let form;
  if (isNew) form = `<form class="sdform" data-form="srvadd"><div class="sdrawer-b">
    <div class="sdsec"><h3>Genel</h3><div class="fld"><label for="sv_n">Ad</label><input class="inp" id="sv_n" required minlength="2" maxlength="60"></div><div class="row2"><div class="fld"><label for="sv_l">Level aralığı</label><input class="inp" id="sv_l" placeholder="1-120" maxlength="20"></div><div class="fld"><label for="sv_t">Tür</label><input class="inp" id="sv_t" placeholder="${sec === 'tr' ? 'Resmi' : 'Emek, Farm…'}" maxlength="30"></div></div><div class="fld"><label for="sv_u">Web sitesi</label><input class="inp" id="sv_u" placeholder="https://" maxlength="255"></div></div>
    <div class="sdsec"><h3>Görünüm <small>Logo renklerden oluşur</small></h3><div class="row2"><div class="fld"><label for="sv_c1">Renk 1</label><input class="inp" id="sv_c1" type="color" value="#1d6fa5" data-lg="1"></div><div class="fld"><label for="sv_c2">Renk 2</label><input class="inp" id="sv_c2" type="color" value="#e0a020" data-lg="2"></div></div><div class="lgprev"><span class="slogo" style="--c1:#1d6fa5;--c2:#e0a020;--sz:48px">YS</span><span class="slogo" style="--c1:#1d6fa5;--c2:#e0a020;--sz:28px">YS</span><span>Server listesinde ve ilan kartlarında böyle görünür</span></div></div>
    ${sec === 'pvp' ? `<div class="sdsec"><h3>EP satışı</h3><div class="fld" style="max-width:260px"><label for="sv_ep">EP satışı</label><select class="inp" id="sv_ep"><option value="0">Olmayacak</option><option value="1">Olacak (site satar)</option></select></div><span class="muted" style="font-size:12px">EP paketleri ve kod stoku EP mağazasıyla birlikte çok yakında bu bölümden eklenecek.</span></div>` : ''}
    </div>${aSave('Server ekle')}</form>`;
  else { const i = s.id; form = `<form class="sdform" data-form="srvsave" data-id="${i}"><div class="sdrawer-b">
    <div class="sdsec"><h3>Genel</h3><div class="fld"><label for="sv_name_${i}">Server adı</label><input class="inp" id="sv_name_${i}" value="${esc(s.name)}" minlength="2" maxlength="60"></div>
      <div class="row3"><div class="fld"><label for="sv_lv_${i}">Level aralığı</label><input class="inp" id="sv_lv_${i}" value="${esc(s.lv)}" maxlength="20"></div><div class="fld"><label for="sv_type_${i}">Tür</label><input class="inp" id="sv_type_${i}" value="${esc(s.type)}" maxlength="30"></div><div class="fld"><label for="sv_sec_${i}">Bölüm (taşı)</label><select class="inp" id="sv_sec_${i}"><option value="tr" ${s.sec === 'tr' ? 'selected' : ''}>Metin2 TR</option><option value="pvp" ${s.sec === 'pvp' ? 'selected' : ''}>Metin2 PVP</option></select></div></div>
      <div class="row2"><div class="fld"><label for="sv_url_${i}">Web sitesi</label><input class="inp" id="sv_url_${i}" value="${esc(srvWeb(s.url) ? s.url : '')}" placeholder="https://" maxlength="255"></div><div class="fld"><label for="sv_act_${i}">Görünürlük</label><select class="inp" id="sv_act_${i}"><option value="1" ${s.hidden ? '' : 'selected'}>Sitede listelensin</option><option value="0" ${s.hidden ? 'selected' : ''}>Gizli (yalnız panelde)</option></select></div></div>
      <div class="fld"><label for="sv_desc_${i}">Açıklama</label><input class="inp" id="sv_desc_${i}" value="${esc(s.desc || '')}" maxlength="2000"></div></div>
    <div class="sdsec"><h3>Görünüm <small>Logo renklerden oluşur</small></h3><div class="row2"><div class="fld"><label for="sv_c1_${i}">Renk 1</label><input class="inp" type="color" id="sv_c1_${i}" value="${esc(s.c[0])}" data-lg="1"></div><div class="fld"><label for="sv_c2_${i}">Renk 2</label><input class="inp" type="color" id="sv_c2_${i}" value="${esc(s.c[1])}" data-lg="2"></div></div><div class="lgprev">${logo(s, 48)}${logo(s, 28)}<span>Server listesinde ve ilan kartlarında böyle görünür</span></div></div>
    <div class="sdsec"><h3>SEO <small>Server sayfasının altındaki "hakkında" metni</small></h3><div class="fld"><label for="sv_seo_${i}">SEO açıklaması</label><textarea class="inp" id="sv_seo_${i}" maxlength="600" data-cnt="sv_seo_n" placeholder="${esc(srvAuto(s))}">${esc(s.seo || '')}</textarea><span class="cnt-r" id="sv_seo_n">${String(s.seo || '').length} / 600</span></div></div>
    ${s.sec === 'pvp' ? `<div class="sdsec"><h3>EP satışı</h3><div class="hstack svep"><div class="fld" style="width:auto"><label for="sv_ep_${i}">EP satışı</label><select class="inp" id="sv_ep_${i}" style="width:auto"><option value="0" ${s.ep ? '' : 'selected'}>Olmayacak</option><option value="1" ${s.ep ? 'selected' : ''}>Olacak (site satar)</option></select></div><span class="muted" style="font-size:12px">EP paketleri ve kodlar çok yakında.</span></div></div>` : ''}
    </div>${aSave('Kaydet', `<button type="button" class="btn btn-bad" data-act="srv-del" data-id="${i}">Sil</button>`)}</form>`; }
  return `<div class="sdrawer-bg" data-act="sv-close"></div><aside class="sdrawer ${ui.svAnim ? 'anim' : ''}" role="dialog" aria-modal="true" aria-labelledby="sdT">${head}${form}</aside>`; };

/* Bakım › Sistem güncellemesi (GET/POST admin/system/update) */
function p1Bakim(sub) {
  if (sub !== 'bakim') return { body: pSoon('Yedekler çok yakında', 'Veritabanı yedekleri (günlük otomatik yedek, indirme, geri yükleme) sonraki güncellemelerde burada olacak.') };
  const d = p1AdmLoad('adm:sysupd', 'admin/system/update', null, 30000);
  if (!d) return { body: pLoading() }; if (d.err) return { body: p1Err(d) };
  const db = d.db || {}; const M = (d.migrations || []).slice(0, 8);
  return { desc: 'Site sürümü, veritabanı güncellemeleri ve bakım.', body: `<div class="panel p1sys"><div class="panel-h" style="flex-wrap:wrap"><h3>Sistem güncellemesi</h3><span class="pill ${d.upToDate ? 'p-tamam' : 'p-bekliyor'}">${d.upToDate ? 'Veritabanı güncel' : 'Bekleyen güncelleme var'}</span></div>
    <div class="panel-b stack"><div class="note note-info">Yeni sürüm dosyalarını yükledikten sonra veritabanı tabloları ilk istekte otomatik güncellenir. Emin olmak ya da sonucu görmek için “Güncellemeleri uygula” düğmesini kullanın. İşlem verilerinize dokunmaz; yalnız eksik tablo, sütun ve dizinleri ekler.</div>
      <div class="sum"><div><span class="muted">Site sürümü</span><b class="mono">${esc(d.app || '-')}</b></div><div><span class="muted">Veritabanı</span><b class="mono">${esc((db.driver || '') + ' ' + (db.version || ''))}</b></div><div><span class="muted">Şema işareti</span><b class="mono" style="font-size:11.5px;overflow-wrap:anywhere">${esc(d.marker || '-')}</b></div></div>
      ${d.done ? `<div class="note ${d.done.length ? 'note-ok' : 'note-info'}">${d.done.length ? '<b>Uygulanan işlemler:</b><br>' + d.done.map(x => esc(typeof x === 'string' ? x : JSON.stringify(x))).join('<br>') : 'Veritabanı zaten günceldi; yapılacak işlem yoktu.'}${d.seo ? `<br><span class="muted" style="font-size:12px">sitemap.xml: ${d.seo.sitemap ? 'yazıldı (' + NUM(d.seo.urls || 0) + ' adres)' : 'site köküne yazılamadı (API adresinden sunuluyor)'} · robots.txt: ${d.seo.robots === 'elle' ? 'elle düzenlenmiş, dokunulmadı' : d.seo.robots ? 'güncel' : 'yazılamadı'}</span>` : ''}</div>` : ''}
      <div class="hstack"><button type="button" class="btn btn-primary" data-act="p1-update">Güncellemeleri uygula</button><button type="button" class="btn btn-sm" data-act="p1-sysre">Durumu yenile</button></div>
      ${M.length ? `<div class="eyebrow">Son uygulanan güncellemeler</div><div class="feed">${M.map(m => `<div><span class="mono">${esc(m.v)}</span><span class="muted">${m.t ? dtstr(m.t) : ''}</span></div>`).join('')}</div>` : ''}</div></div>
    ${pSoon('Bakım modu ve yedekler çok yakında', 'Bakım modu, günlük veritabanı yedeği ve tek tıkla geri yükleme sonraki güncellemelerde bu bölüme gelecek.')}` };
}

{ const v1 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (!isPanel()) return v1(P);
    const it = admItem(P.k); if (!it || !admVis(it)) return v1(P);
    if (it.k === 'bakim') return pAdmPage(P, it, p1Bakim);
    if (it.k === 'ilan') {
      const q = P.q || ''; const fn = x => { p1UpL(x.listings); p1UpU(x.users); return { n: (x.listings || []).length, pending: x.pending }; };
      const a = p1AdmLoad('adm:lst:' + q, 'admin/listings?status=hepsi&limit=100' + (q ? '&q=' + encodeURIComponent(q) : ''), fn, 20000);
      const b = p1AdmLoad('adm:lst:~pend', 'admin/listings?status=beklemede&limit=100', fn, 20000);
      if (!a || !b) return pAdmPage(P, it, () => ({ body: pLoading('İlanlar yükleniyor…') }));
      if (a.err || b.err) return pAdmPage(P, it, () => ({ body: p1Err(a.err ? a : b) }));
      const dp = S.dopings; let out; S.dopings = {}; try { out = v1(P); } finally { S.dopings = dp; }
      return out.replace(/<form class="panel" data-form="dopset">[\s\S]*?<\/form>/, `<div class="panel panel-b stack"><h3 class="ph3">Doping fiyatları</h3><div class="note note-info">${esc(P1_SOON.dop)}</div></div>`);
    }
    if (it.k === 'server') {
      const d = p1AdmLoad('adm:servers', 'admin/servers', null);
      if (!d) return pAdmPage(P, it, () => ({ body: pLoading('Serverlar yükleniyor…') }));
      if (d.err) return pAdmPage(P, it, () => ({ body: p1Err(d) }));
      const keep = S.servers; S.servers = p1AdmSrv(); try { return v1(P); } finally { S.servers = keep; }
    }
    return v1(P); }; }
}
