/* ================== P4: Yang Borsası ve EP mağazası — ekranlar ve veri (yalnız --prod derlemesinde) ==================
   Demo ekranları (vExchange, exDetail, exAdminList, adminBook, kurlar/alanlar formları, vEp, epCard, epAdmin…) AYNEN kullanılır;
   S.exchange / S.exOffers / S.exOrders / S.exFields / S.exFieldsBuy / S.exRules / S.epProducts / S.epOrders sunucudan dolar:
     - açılış (boot): açık pazarlar, bilgi alanları, satış kuralları, EP paketleri (stok adedi; kod yok), borsa ayarları, Happy Hour
     - GET exchange: satış sırası (başka satıcılar maskeli: 'xs<n>' + ilk 2 harf), kendi siparişlerim / emirlerim
     - Yönetim › Borsa [borsa]: GET admin/ex/orders, admin/ex/orders/{id} (gizli alanlar maskeli; "Şifreleri göster" ayrı istek, audit'li),
       admin/ex/offers; [borsa_ayar]: GET admin/ex/settings · Yönetim › EP mağazası [ep]: admin/ep/products (kodlar maskeli), admin/ep/log
   Durum değişiklikleri kısa yoklamayla (poll → exSig / exStaff) ekrana yansır. Para hesapları ve kurallar yalnız sunucuda.          */
const P4 = { sig: null, ssig: null };
const p4enc = encodeURIComponent;
const p4Up = (k, L) => { if (!Array.isArray(S[k])) S[k] = []; p1Up(S[k], L); };
/** üye kartları; maskeli satıcılar (mask:true) yalnız borsa sayfasında tutulur (yönetim listelerine karışmasın) */
const p4UpU = L => (L || []).forEach(u => { if (!u || !u.id) return; if (u.mask) { const i = S.users.findIndex(x => x.id === u.id); if (i < 0) S.users.push(Object.assign({}, u)); else Object.assign(S.users[i], u); } else apiUpsertUser(u); });
const p4DropMasked = () => { if (S.users.some(u => u.mask)) S.users = S.users.filter(u => !u.mask); };
/** EP paketi: herkese açık yanıtta kod yok, yalnız stok adedi → demo ekranlarının p.codes.length'i için yer tutucu dizi */
const p4Ep = p => Object.assign({}, p, { codes: Array.isArray(p.codes) ? p.codes : Array.from({ length: +p.stock || 0 }, () => '') });
const p4EpSet = L => { if (Array.isArray(L)) S.epProducts = L.map(p4Ep); };

/* ================= açılış ================= */
function p4Boot(b) { if (!b || !S) return;
  if (Array.isArray(b.exchange)) S.exchange = b.exchange;
  if (Array.isArray(b.exFields)) S.exFields = b.exFields; if (Array.isArray(b.exFieldsBuy)) S.exFieldsBuy = b.exFieldsBuy;
  if (typeof b.exRules === 'string') S.exRules = b.exRules;
  if (Array.isArray(b.epProducts)) p4EpSet(b.epProducts);
  if (!S.set.hh) S.set.hh = { on: false, pct: 30, until: null }; }
try { p4Boot(window.YP_BOOT); } catch (e) { }
{ const f = apiApplyBoot; apiApplyBoot = function (b) { f.apply(this, arguments); p4Boot(b); }; }

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="p4css">
.p4rev{font-size:12px}
.p4ntf .row3{align-items:center}
.p4ntf table td,.p4ntf table th{text-align:center}.p4ntf table td:first-child,.p4ntf table th:first-child{text-align:left}
.p4code{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
</style>`);

/* ================= veri ================= */
/** Herkese açık borsa: satış sırası (maskeli) + kendi kayıtlarım. Satış sırası her yüklemede yenilenir. */
function p4ApplyEx(d) { if (!d) return;
  if (Array.isArray(d.markets)) { const off = S.exchange.filter(x => !x.on && !d.markets.some(m => m.id === x.id)); S.exchange = d.markets.concat(isPanel() ? off : []); }
  if (d.set) Object.assign(S.set, d.set);
  const mine = d.mine ? d.mine.offers || [] : [];
  // başkalarının aktif emirleri: yalnız sunucunun gönderdiği satış sırası kalır
  S.exOffers = S.exOffers.filter(o => !String(o.u).startsWith('xs') && (o.u === S.cur || isPanel()));
  p4UpU(d.users); p4Up('exOffers', d.book || []); p4Up('exOffers', mine);
  if (d.mine) p4Up('exOrders', d.mine.orders || []); }
const p4ExPub = () => need('ex:pub', () => call('GET', 'exchange', null, { quiet: true }).then(j => { p4ApplyEx(j.data); return { m: (j.data.markets || []).length, b: (j.data.book || []).map(o => o.id + ':' + o.left).join(','), o: j.data.mine ? (j.data.mine.orders || []).map(o => o.id + ':' + o.v).join(',') + '|' + (j.data.mine.offers || []).map(o => o.id + ':' + o.left + o.status).join(',') : '' }; }), 15000);
const p4MeEx = () => need('me:ex', () => call('GET', 'me/exchange', null, { quiet: true }).then(j => { p4Up('exOrders', j.data.orders); p4Up('exOffers', j.data.offers); return { o: (j.data.orders || []).map(o => o.id + ':' + o.v).join(','), f: (j.data.offers || []).map(o => o.id + ':' + o.left + o.status).join(',') }; }), 20000);
const p4MeEp = () => need('me:ep', () => call('GET', 'me/ep-orders?limit=100', null, { quiet: true }).then(j => { p4Up('epOrders', j.data.epOrders); return { n: (j.data.epOrders || []).map(o => o.id).join(',') }; }), 30000);
const p4EpPub = () => need('ep:pub', () => call('GET', 'ep/products', null, { quiet: true }).then(j => { if (!isAdmRoute(route())) p4EpSet(j.data.epProducts); if (j.data.hh) S.set.hh = j.data.hh; return { p: (j.data.epProducts || []).map(p => p.id + ':' + p.stock + p.price).join(','), h: JSON.stringify(j.data.hh) }; }), 30000);

/* ================= Yang Borsası sayfası ================= */
function p4Exchange() { if (S.cur) p4MeEx(); const d = p4ExPub();
  if (!d && !S.exchange.length) return `<div class="wrap">${pLoading('Yang Borsası yükleniyor…')}</div>`;
  if (d && d.err) return `<div class="wrap">${p1Err(d)}</div>`;
  // destek saatleri (canlı destek P6) yerine sade bilgi
  return vExchange().replace(/<span class="chip (?:ok|warn)">● Operatörler[^<]*<\/span>/, '<span class="chip ok">● Siparişler sırayla işlenir</span>')
    .replace(/<div><span>Operatörler<\/span><b>[\s\S]*?<\/b><\/div>/, `<div><span>Teslimat</span><b>${esc(S.set.exPlace || '')}</b></div>`); }

/* ================= EP ================= */
function p4EpPage() { p4EpPub(); return vEp(); }
/* server sayfası: EP sekmesi ve kartları (P1'in "çok yakında" yer tutucularının yerine) */
function p4SrvEpFix(html, s, cat) { const P = epFor(s.id).filter(p => p.on);
  if (cat === 'ep') html = html.replace(/<div class="panel empty psoon">[\s\S]*?<\/div>/, () => `<div class="note note-info" style="margin-bottom:14px">${esc(s.name)} EP kodları yalnızca ${esc(S.set.siteName)} tarafından satılır. Ödeme yapınca kod anında ekranda gösterilir ve Hesabım › EP kodlarım bölümünde saklanır.</div>
    <div class="epgrid">${P.slice().sort((a, b) => a.price - b.price).map(epCard).join('') || emptyBox('Şu an EP paketi yok', 'Kısa süre içinde tekrar bakın.')}</div>`);
  return html.replace(/(<a href="#server-[^"]+-ep" class="catcard">[\s\S]*?<span class="low"><span>)Çok yakında(<\/span>)/, `$1${P.length ? P.length + ' paket · anında kod' : 'Şu an paket yok'}$2`)
    .replace(/(<a href="#metin2-ep" class="catcard">[\s\S]*?<span class="low"><span>)Çok yakında(<\/span>)/, `$1${epFor(null).filter(p => p.on).length} paket · anında kod$2`)
    .replace(/(<a href="#server-[^"]+-ep" class="(?:on)?">EP<span>)·(<\/span>)/, `$1${P.length}$2`); }

/* ================= yönlendirme ================= */
{ const v0 = view; view = function (r) {
    if (API.booting || (API.bootErr && !API.live) || (maintOn() && !isPanel())) return v0(r);
    if (r === 'borsa') { const x = S.exchange.find(e => e.id === ui.exId && e.on); if (!x) ui.exId = (S.exchange.find(e => e.on) || {}).id; return p4Exchange(); }
    if (r === 'metin2-ep') return p4EpPage();
    const m = r.match(/^server-([^-]+)(?:-([a-z]+))?$/);
    if (m) { const s = srv(m[1]); if (s && (srvEp(s) || s.sec === 'tr')) { p4EpPub(); return p4SrvEpFix(v0(r), s, m[2]); } }
    if (r === 'metin2-tr') { p4EpPub(); return v0(r).replace(/(<a href="#metin2-ep"[^>]*>[\s\S]*?)Çok yakında/, '$1' + epFor(null).filter(p => p.on).length + ' paket'); }
    return v0(r); }; }
/* maskeli satıcı kartları yönetim ekranlarına karışmasın; sayfa değişince borsa verisi tazelenir */
{ const r0 = render; render = function () { const r = route(); if (r !== P4.lastR) { P4.lastR = r;
      if (r === 'borsa') needDrop('ex:pub', 'me:ex'); else if (r === 'hesabim') needDrop('me:ex', 'me:ep'); else if (r === 'metin2-ep' || /^server-.+-ep$/.test(r)) needDrop('ep:pub'); }
    if (isAdmRoute(r)) p4DropMasked(); return r0.apply(this, arguments); }; }

/* ================= Hesabım › Borsa işlemlerim, EP kodlarım ================= */
function p4AccBorsa(u) { const d = p4MeEx(); if (!d) return pLoading(); if (d.err) return p1Err(d);
  const bx = S.exOrders.filter(o => o.u === u.id), myO = S.exOffers.filter(o => o.u === u.id);
  return `${S.set.exOn ? '' : `<div class="note note-info"><b>Yang Borsası kısa bir moladır.</b> ${esc(S.set.exOffMsg || '')}</div>`}${myCallNotes()}<div class="panel"><div class="panel-h"><h3>Alım siparişlerim</h3><a class="btn btn-sm btn-primary" href="#borsa">Borsaya git</a></div>${bx.length ? `<div class="hide-m">${exTable(exSortUser(bx), false)}</div><div class="show-m">${exCardsB(exSortUser(bx))}</div>` : emptyBox('Alım siparişiniz yok', '')}</div>
    ${bx.length ? `<div class="panel"><div class="panel-h"><h3>İşlem geçmişi</h3></div><div class="panel-b stack">${exSortUser(bx).slice(0, 10).map(o => `<details class="exlog"><summary><b class="mono">#${esc(o.id)}</b> · ${esc((srv(o.server) || {}).name || '')} · <span class="pill ${EXP[o.status]}">${EXS[o.status]}</span></summary><div class="feed" style="margin-top:8px">${(o.log || []).slice().reverse().map(e => `<div><span>${esc(e.x)}</span><time>${dtstr(e.t)}</time></div>`).join('')}</div></details>`).join('')}</div></div>` : ''}
    <div class="panel"><div class="panel-h"><h3>Satış emirlerim</h3></div>${myO.length ? `<div class="hide-m">${offerTable(myO, false, true)}</div><div class="show-m">${exCardsO(myO)}</div>` : emptyBox('Satış emriniz yok', 'Borsada “Siteye sat” sekmesinden emir verebilirsiniz.')}</div>`; }
function p4AccEp(u) { const d = p4MeEp(); if (!d) return pLoading(); if (d.err) return p1Err(d);
  const E = S.epOrders.filter(o => o.u === u.id).sort((a, b) => b.t - a.t);
  return `<div class="panel">${E.length ? `<div class="tbl-w"><table class="tbl mcards"><thead><tr><th>Tarih</th><th>Ürün</th><th>Kod</th><th class="num">Tutar</th></tr></thead><tbody>${E.map(o => `<tr><td style="white-space:nowrap">${dtstr(o.t)}</td><td><b>${NUM(o.epShown)} EP</b> <span class="muted" style="font-size:12px">${esc(epName({ srv: o.srv }))}</span>${o.hh ? ' <span class="chip ok">Happy Hour</span>' : ''}</td><td><div class="hstack" style="flex-wrap:nowrap"><span class="mono">${esc(o.code)}</span><button class="btn btn-sm" data-act="copy" data-v="${esc(o.code)}">Kopyala</button></div></td><td class="num">${TL(o.price)}</td></tr>`).join('')}</tbody></table></div>` : emptyBox('EP kodunuz yok', 'Metin2 EP bölümünden anında kod alabilirsiniz.', '<a class="btn btn-primary" href="#metin2-ep">EP al</a>')}</div>`; }
{ const t0 = p2AccTabs; p2AccTabs = (u, base) => { const T = t0(u, base); const i = T.findIndex(([k]) => k === 'ilan'); const at = i < 0 ? T.length : i;
    const add = [['borsa', 'Borsa işlemlerim'], ['ep', 'EP kodlarım']].filter(([k]) => !T.some(([x]) => x === k)); T.splice(at, 0, ...add); return T; }; }
{ const b0 = p2AccBody; p2AccBody = (u, tab) => tab === 'borsa' ? p4AccBorsa(u) : tab === 'ep' ? p4AccEp(u) : b0(u, tab); }

/* ================= Yönetim › Borsa ================= */
const p4AdmUp = d => { if (!d) return; p4UpU(d.users); if (d.orders) p4Up('exOrders', d.orders); if (d.order) p4Up('exOrders', [d.order]); if (d.offers) p4Up('exOffers', d.offers); };
const p4AdmList = () => p1AdmLoad('adm:ex:list', 'admin/ex/orders?limit=200', x => { p4AdmUp(x); p2QSet('borsa', ((x.orders || []).filter(o => exOpenSt(o.status))).length); return { n: (x.orders || []).map(o => o.id + ':' + o.v).join(','), escrow: x.escrow }; }, 15000);
const p4AdmOrder = id => p1AdmLoad('adm:ex:o:' + id, 'admin/ex/orders/' + p4enc(id), x => { p4AdmUp(x); if (ui.reveal) ui.reveal = false; return { v: x.order.v, b: (x.offers || []).map(o => o.id + ':' + o.left).join(',') }; }, 10000);
const p4AdmOffers = hist => p1AdmLoad('adm:ex:of:' + (hist ? 1 : 0), 'admin/ex/offers' + (hist ? '?hist=1' : ''), x => { p4AdmUp(x); return { n: (x.offers || []).map(o => o.id + ':' + o.left + o.status).join(',') }; }, 15000);
const p4AdmSet = () => p1AdmLoad('adm:ex:set', 'admin/ex/settings', x => { p4SetApply(x); return x; }, 30000);
function p4SetApply(x) { if (!x) return; if (Array.isArray(x.markets)) S.exchange = x.markets; if (x.place != null) S.set.exPlace = x.place;
  if (Array.isArray(x.exFields)) S.exFields = x.exFields; if (Array.isArray(x.exFieldsBuy)) S.exFieldsBuy = x.exFieldsBuy; if (typeof x.exRules === 'string') S.exRules = x.exRules;
  // [borsa] yetkisi olmayan ayar çalışanı satış emirlerini göremez: tablodaki "en ucuz emir / stok" sütunları özetten
  if (!can('borsa') && x.stock) { S.exOffers = S.exOffers.filter(o => !String(o.id).startsWith('_s')); Object.entries(x.stock).forEach(([ex, s]) => S.exOffers.push({ id: '_s' + ex, u: '', ex, qty: s.n, left: s.n, price: s.min, t: 0, status: 'aktif', f: {} })); } }
function p4Notify(n) { if (!n) return ''; const ev = [['borsa', 'Borsa sipariş durumu', 'sıraya alındı, eşleşti, teslim, iptal'], ['call', 'Operatör çağrısı', '“Teslimat için hazırız” mesajı'], ['ep_code', 'EP kodu teslim edildi', 'kod e-postada yazmaz; Hesabım › EP kodlarım'], ['borsa_off', 'Borsa kapatıldı', 'açık siparişler iade edildiğinde']];
  return `<form class="panel p4ntf" data-form="p4notify"><div class="panel-h"><h3>Borsa ve EP bildirimleri</h3><span class="muted" style="font-size:12px">Site içi bildirim her zaman gider</span></div><div class="panel-b stack">
    ${!n.mailOn || !n.smsOn ? `<div class="note note-info" style="font-size:12.5px">${!n.mailOn ? 'E-posta gönderimi kapalı. ' : ''}${!n.smsOn ? 'WhatsApp bildirimleri kapalı (WhatsApp bildirim şablonu ayarlanınca açılır). ' : ''}<a href="#yonetim/sms">E-posta & WhatsApp</a> bölümünden açın.</div>` : ''}
    <div class="tbl-w"><table class="tbl"><thead><tr><th>Olay</th><th>E-posta</th><th>WhatsApp</th></tr></thead><tbody>${ev.map(([k, l, s]) => `<tr><td><b>${l}</b><div class="muted" style="font-size:12px">${s}</div></td><td><input type="checkbox" id="p4n_m_${k}" aria-label="${l} e-posta" ${n.mail && n.mail[k] ? 'checked' : ''}></td><td><input type="checkbox" id="p4n_s_${k}" aria-label="${l} WhatsApp" ${n.sms && n.sms[k] ? 'checked' : ''}></td></tr>`).join('')}</tbody></table></div></div>${aSave('Bildirimleri kaydet')}</form>`; }
function p4AdmBorsa(P, it) { const SB = admSubs(it); let sub = P.sub && SB.some(s => s.s === P.sub) ? P.sub : null;
  if (!sub && SB.length) { const last = (ui.asub || {})[it.k]; sub = SB.some(s => s.s === last) ? last : SB[0].s; }
  const wait = L => L.some(x => !x) ? pAdmPage(P, it, () => ({ body: pLoading() })) : (L.find(x => x && x.err) ? pAdmPage(P, it, () => ({ body: p1Err(L.find(x => x && x.err)) })) : null);
  if (sub === 'siparisler') { const L = [p4AdmList()]; if (P.id) L.push(p4AdmOrder(P.id)); return wait(L); }
  if (sub === 'emirler') return wait([p4AdmOffers(false), ui.bkHist ? p4AdmOffers(true) : {}]);
  if (sub === 'kurlar' || sub === 'alanlar') return wait([p4AdmSet(), can('borsa') ? p4AdmOffers(false) : {}]);
  return null; }
/* demo ekranının sunucuya göre düzeltmeleri: gizli alan düğmesi açıklaması, bildirim ayarları (Kurlar), bakiye bilgisi */
function p4BorsaFix(html, sub) {
  if (sub === 'siparisler') html = html.replace(/(<button class="btn btn-sm" data-act="reveal">)(Şifreleri göster)(<\/button>)/, '$1$2 (kayda geçer)$3');
  if (sub === 'kurlar') { const d = API.cache['adm:ex:set']; const n = d && d.v && d.v.notify; const i = html.indexOf('data-form="exrates"'), j = i < 0 ? -1 : html.indexOf('</form>', i);
    if (n && j > 0) html = html.slice(0, j + 7) + p4Notify(n) + html.slice(j + 7); }
  return html; }
{ const v0 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (!isPanel()) return v0(P);
    const it = admItem(P.k); if (!it || !admVis(it)) return v0(P);
    if (it.k === 'borsa') { const w = p4AdmBorsa(P, it); if (w) return w; const out = v0(P); return p4BorsaFix(out, (ui.asub || {}).borsa); }
    if (it.k === 'ep') { const w = p4AdmEp(P, it); if (w) return w; return v0(P); }
    return v0(P); }; }
/* nav rozeti ve Bugün: açık borsa siparişi (GET admin/today → queues.borsa), EP stoğu azalan paket (queues.eplow) */
{ const q = admQ('borsa'); if (q) q.L = () => { const c = API.cache['adm:today']; const n = c && c.v && c.v.queues && c.v.queues.borsa != null ? +c.v.queues.borsa || 0 : S.exOrders.filter(o => exOpenSt(o.status)).length; return Array.from({ length: n }, () => ({ t: now(), status: 'bekliyor' })); }; }
P2_Q.push(['borsa', 'Borsa siparişi', 'borsa', '#yonetim/borsa/siparisler?f=bekliyor'], ['eplow', 'EP stoğu azalan paket', 'ep', '#yonetim/ep/paketler']);

/* ================= Yönetim › EP mağazası ================= */
const p4AdmEpProd = () => p1AdmLoad('adm:ep:p', 'admin/ep/products', x => { p4EpSet(x.epProducts); if (x.hh) S.set.hh = x.hh; return { p: (x.epProducts || []).map(p => p.id + ':' + p.codes.length + p.on + p.price + p.ep).join(','), h: JSON.stringify(x.hh) }; }, 20000);
const p4AdmEpLog = () => p1AdmLoad('adm:ep:log', 'admin/ep/log?limit=150', x => { p4UpU(x.users); S.epOrders = (x.epOrders || []); P4.epPer = x.per || {}; return { n: (x.epOrders || []).map(o => o.id).join(',') }; }, 20000);
function p4AdmEp(P, it) { const SB = admSubs(it); let sub = P.sub && SB.some(s => s.s === P.sub) ? P.sub : null;
  if (!sub && SB.length) { const last = (ui.asub || {})[it.k]; sub = SB.some(s => s.s === last) ? last : SB[0].s; }
  const L = [p4AdmEpProd()]; if (sub === 'kayitlar') L.push(p4AdmEpLog());
  if (L.some(x => !x)) return pAdmPage(P, it, () => ({ body: pLoading() }));
  const e = L.find(x => x && x.err); if (e) return pAdmPage(P, it, () => ({ body: p1Err(e) }));
  return null; }
/* EP kod kayıtları: kod maskeli; "Göster" (kayda geçer). Grup sayıları sunucudan (son 150 satır listelenir) */
epLogAdmin = function () { const f = ui.epLog == null ? 'all' : ui.epLog; const G = epGroups(); const per = P4.epPer || {};
  const L = S.epOrders.filter(o => f === 'all' || (o.srv || '') === f); const tot = r2(L.reduce((x, o) => x + o.price, 0));
  const all = Object.values(per).reduce((s, x) => s + (+x.n || 0), 0);
  return `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>EP kod kayıtları</h3><span class="muted" style="font-size:12px">Kodlar maskeli; “Göster” her açılışı kayda geçirir</span></div>
    <div class="afbar"><div class="afchips"><button type="button" class="afchip ${f === 'all' ? 'on' : ''}" data-act="eplog" data-g="all">Tüm gruplar <b>${all}</b></button>${G.map(g => { const x = per[g.id] || { n: 0, a: 0 }; return `<button type="button" class="afchip ${f === g.id ? 'on' : ''}" data-act="eplog" data-g="${g.id}" title="${x.n} kod · ${TL(x.a)}">${esc(g.name)} <b>${x.n}</b></button>`; }).join('')}</div></div>
    ${L.length ? `<div class="tbl-w"><table class="tbl mcards"><thead><tr><th>Tarih</th><th>Grup</th><th>Üye</th><th>Paket</th><th>Kod</th><th class="num">Tutar</th></tr></thead><tbody>${L.slice(0, 150).map(o => `<tr><td style="white-space:nowrap">${dtstr(o.t)}</td><td>${esc(epName({ srv: o.srv }))}</td><td>${uCellS(user(o.u))}</td><td>${NUM(o.epShown)} EP${o.hh ? ' · HH' : ''}</td><td><span class="p4code"><span class="mono" id="p4c_${esc(o.id)}">${esc(o.code)}</span><button type="button" class="btn btn-sm" data-act="p4-epcode" data-id="${esc(o.id)}">Göster</button></span></td><td class="num">${TL(o.price)}</td></tr>`).join('')}</tbody></table></div><div class="panel-b muted" style="font-size:12.5px">${L.length} kayıt · toplam ${TL(tot)}</div>` : emptyBox('Bu grupta kayıt yok', '')}</div>`; };
