/* ================== P5: reklam satışı, site görselleri, çekiliş & şans çarkı, VIP, davet, geri kazanım (yalnız --prod derlemesinde) ==================
   Sunucuya bağlı: Reklam Ver (takvim GET ads/availability — sunucunun saydığı doluluk, Europe/Istanbul günleri; bakiyeden ödeme,
   Idempotency-Key; görsel/video önce POST media kind=ad), ana sayfa reklam alanları (boot.ads: yalnız onaylı ve yayındaki reklamlar;
   gösterim/tıklama POST ads/events), site görselleri (boot.slides), Çekiliş & Şans Çarkı (POST spin — ödül sunucuda seçilir, çark
   sunucunun dilimine döner; ücretsiz bilet), Hesabım › Reklamlarım / VIP & Puan / Davet et kazan, Profil › kampanya ileti tercihi;
   Yönetim › Reklam satışları (onay = gelir, red = iade, durdur, +7 gün, sil, medya, site görselleri, paket fiyatları), Çekiliş & kupon
   (çekiliş aç / kazananı çek / doğrula / sil, çark ödülleri, aç-kapa anahtarları, hak yenileme), VIP & davet, Üyeler › Geri kazan.
   Demo ekranları (vAds, vCamp, adPending, slidesAdmin, vipAdmin, myAdsCards …) aynen kullanılır; veri S'ye sunucudan yazılır.  */
const P5 = { mm: {}, ev: { imp: new Set(), clk: new Set(), t: 0 }, mkt: null };
const p5enc = encodeURIComponent;
/** Europe/Istanbul gün başlangıcı (sunucunun takvim günleri; yaz saati yok) */
const p5Day = t => Math.floor((+t + 3 * H) / D) * D - 3 * H;
const p5Err = d => d && d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : '';

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="p5css">
.p5prz{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,.8fr) minmax(0,.8fr) 52px;gap:8px;align-items:end}
.p5prz .fld{min-width:0}
.p5seed{font-size:11px;overflow-wrap:anywhere;word-break:break-all}
.p5flag{font-size:11.5px}
.p5mkt{max-width:560px}
@media (max-width:640px){.p5pk{grid-template-columns:repeat(2,minmax(0,1fr))!important}.p5pk>b{grid-column:1/-1}.p5prz{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.p5prz input[type=color]{width:100%}}
</style>`);

/* ================= açılış verisi ================= */
/** Medya nesneleri ({id,url,video}) → kimlik listesi; adres eşlemesi mediaGet içindir (hydrateMedia) */
function p5Media(L) { return (L || []).map(m => { if (m && typeof m === 'object') { P5.mm[m.id] = { url: m.url, video: !!m.video }; return m.id; } return m; }); }
const p5AdIn = a => { if (a) a.media = p5Media(a.media); return a; };
function p5UpAds(L) { (L || []).forEach(a => { p5AdIn(a); const i = S.ads.findIndex(x => x.id === a.id); if (i < 0) S.ads.push(a); else S.ads[i] = Object.assign(S.ads[i], a); }); }
/** Kampanya dilimi: çark ödülleri (WHEEL yerinde güncellenir), çekilişler, bugünkü çevirme / ücretsiz bilet */
function p5Camp(c) { if (!c || !S) return; const uid = S.cur;
  if (c.wheel) { S.set.wheelOn = !!c.wheel.on; if (Array.isArray(c.wheel.prizes) && c.wheel.prizes.length) WHEEL.splice(0, WHEEL.length, ...c.wheel.prizes); }
  if (c.raffleOn != null) S.set.raffleOn = !!c.raffleOn;
  if (Array.isArray(c.winners)) c.winners.forEach(apiUpsertUser);
  if (Array.isArray(c.raffles)) S.raffles = c.raffles.map(r => { const tk = Object.assign({}, r.tk || {}); const mine = Object.values(tk).reduce((s, v) => s + (+v || 0), 0);
    if ((+r.total || 0) > mine) tk._o = (+r.total || 0) - mine; // rTotal() bilet dağılımını toplar: diğer üyelerin toplamı tek kalem
    if (uid) { if (r.freeDay) S.rfree[uid + '_' + r.id] = today(); else delete S.rfree[uid + '_' + r.id]; }
    return Object.assign({}, r, { tk, acc: r.acc || {} }); });
  if (uid && 'spin' in c) { if (c.spin) S.spins[uid] = today(); else delete S.spins[uid]; } }
/** Sunucudan gelen güncel kampanya dilimi (çevirme / ücretsiz bilet yanıtı): uygula ve önbelleğe yaz */
function p5CampSet(c) { if (!c) return; p5Camp(c); API.cache.camp = { v: c, t: Date.now() }; }
function p5Slices(b) { if (!b || !S) return;
  if (Array.isArray(b.ads)) S.ads = b.ads.map(p5AdIn);
  if (Array.isArray(b.slides)) S.slides = b.slides.map(p5AdIn);
  if (b.packs && typeof b.packs === 'object' && !Array.isArray(b.packs)) S.packs = b.packs;
  if (b.camp) { p5Camp(b.camp); if (API.cache) delete API.cache.camp; }
  if (b.mkt) P5.mkt = b.mkt;
  if (b.set) S.set.popupOn = !!b.set.popupOn; // açılış popup reklamı (yalnız yayında popup reklam varsa görünür)
  if (b.set && b.set.wheelOn != null) S.set.wheelOn = !!b.set.wheelOn; }
try { p5Slices(window.YP_BOOT); } catch (e) { }
{ const f = apiApplyBoot; apiApplyBoot = function (b) { f.apply(this, arguments); p5Slices(b); }; }
/* reklam medyası: IndexedDB yerine sunucu adresleri */
mediaGet = async id => P5.mm[id] || null;

/* ================= gösterim / tıklama (beacon) ================= */
function p5Flush() { P5.ev.t = 0; const imp = [...P5.ev.imp], clk = [...P5.ev.clk]; P5.ev.imp.clear(); P5.ev.clk.clear();
  if (!imp.length && !clk.length) return; call('POST', 'ads/events', { imp: imp.slice(0, 30), clk: clk.slice(0, 30) }, { quiet: true, silent: true }).catch(() => { }); }
const p5Queue = () => { if (!P5.ev.t) P5.ev.t = setTimeout(p5Flush, 2000); };
{ const f = adImp; adImp = function (a) { const seen = a && PV.seen.has(a.id); f.apply(this, arguments); if (a && !seen && !isPanel() && /^a\d+$/.test(a.id)) { P5.ev.imp.add(a.id); p5Queue(); } }; }
{ const f = adClick; adClick = function (id) { f.apply(this, arguments); if (!isPanel() && /^a\d+$/.test(id)) { P5.ev.clk.add(id); clearTimeout(P5.ev.t); P5.ev.t = setTimeout(p5Flush, 300); } }; }

/* ================= Reklam Ver: takvim sunucudan ================= */
const p5Av = t => S.packs[t] ? need('ad:av:' + t, () => call('GET', 'ads/availability?type=' + p5enc(t), null, { quiet: true }).then(j => j.data || {}), 20000) : null;
{ const f = adBooked; adBooked = function (type, ds) { const a = API.cache['ad:av:' + type]; const v = a && a.v; if (v && v.days) { const k = String(p5Day(ds)); if (k in v.days) return +v.days[k] || 0; } return f.apply(this, arguments); }; }
const p5MyAds = () => S.cur ? need('me:ads', () => call('GET', 'me/ads', null, { quiet: true }).then(j => { const L = (j.data || {}).ads || []; p5UpAds(L); return { ids: L.map(a => a.id) }; }), 30000) : null;
{ const f = vAds; vAds = function () { if (!S.packs[ui.adType]) ui.adType = Object.keys(S.packs)[0] || 'slider';
    p5Av(ui.adType); const m = p5MyAds(); const u = me();
    let h = f.apply(this, arguments);
    if (u && m && m.err) h = h.replace('<div class="panel"><div class="panel-h"><h2>', p5Err(m) + '$&');
    return h; }; }
{ const f = adCalHtml; adCalHtml = function () { p5Av(ui.adType); return f.apply(this, arguments); }; }

/* ================= Çekiliş & Şans Çarkı ================= */
const p5CampLoad = () => need('camp', () => call('GET', 'campaigns', null, { quiet: true }).then(j => j.data || {}), 30000);
{ const f = vCamp; vCamp = function () { const c = p5CampLoad(); if (c && !c.err && !ui.spinning) p5Camp(c); let h = f.apply(this, arguments);
    if (S.set.raffleOn === false) h = h.replace(/<div class="raffles">[\s\S]*?<\/div>\s*<div class="panel"><div class="panel-h"><h3>Son kazananlar/, '<div class="raffles">' + emptyBox('Çekilişler şu an kapalı', 'Yeni çekilişler duyurulduğunda burada görünecek.') + '</div><div class="panel"><div class="panel-h"><h3>Son kazananlar');
    return h; }; }
/* çark: ödül sunucuda seçilir; çark sunucunun verdiği dilime döner */
spin = function () { const u = me(); if (!u) return mLogin(); if (ui.spinning || S.spins[u.id] === today()) return;
  ui.spinning = true; const b = $('#spinBtn'); if (b) { b.disabled = true; b.textContent = 'Çevriliyor…'; }
  call('POST', 'spin', {}, { silent: true }).then(j => { const d = j.data || {}; const n = WHEEL.length || 1, seg = 360 / n, center = (+d.idx || 0) * seg + seg / 2, target = (360 - center) % 360;
      const cur = ((ui.rot % 360) + 360) % 360; ui.rot = ui.rot + 360 * 6 + ((target - cur + 360) % 360); S.spins[u.id] = today();
      const w = $('#wheel'); if (w) w.style.transform = `rotate(${ui.rot}deg)`;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => { ui.spinning = false; if (d.camp) p5CampSet(d.camp); needDrop('me:tx'); renderHeader(); render(); toast(j.msg || 'Tebrikler!'); }, reduce ? 300 : 4800); },
    e => { ui.spinning = false; if (e && e.code === 'already') S.spins[u.id] = today(); render(); }); };

/* ================= Hesabım: Reklamlarım, VIP & Puan, Davet et kazan, ileti tercihi ================= */
function p5Reklam(u) { const m = p5MyAds(); if (!m) return pLoading(); if (m.err) return p5Err(m);
  const L = m.ids.map(id => S.ads.find(a => a.id === id)).filter(Boolean); const ph = a => adPhase(a).k; const ord = { onay: 0, yayin: 1, plan: 2, dur: 3, bitti: 4, red: 5 };
  L.sort((x, y) => ord[ph(x)] - ord[ph(y)] || (y.start || 0) - (x.start || 0)); const cnt = k => L.filter(a => ph(a) === k).length;
  return `<div class="panel"><div class="panel-h"><h3>Reklamlarım</h3><a class="btn btn-sm btn-primary" href="#reklam-ver">Yeni reklam</a></div>${L.length ? `<div class="adkpi"><div><b>${cnt('yayin')}</b><span>Yayında</span></div><div><b>${cnt('onay')}</b><span>Onay bekliyor</span></div><div><b>${cnt('plan')}</b><span>Planlandı</span></div><div><b>${cnt('bitti') + cnt('red')}</b><span>Biten / reddedilen</span></div></div>` : ''}<div class="panel-b">${myAdsCards(L)}</div></div>`; }
function p5Puan(u) { const v = vip(u), nx = vipNext(u);
  return `<div class="panel panel-b stack"><div class="hstack" style="justify-content:space-between"><div><div class="eyebrow">Seviyeniz</div><div style="font-family:var(--f-display);font-size:28px;font-weight:800;text-transform:uppercase;color:${v.c}">${esc(v.n)}</div></div><div style="text-align:right"><div class="eyebrow">Puanınız</div><div class="mono" style="font-size:22px;font-weight:700">${NUM(u.pts)}</div><span class="muted" style="font-size:12px">= ${TL(u.pts / (+S.set.ptRate || 100))}</span></div></div>
    <div class="prog"><i style="width:${nx ? Math.max(0, Math.min(100, ((u.vol || 0) - v.min) / (nx.min - v.min) * 100)) : 100}%"></i></div>
    <div class="muted" style="font-size:12.5px">${nx ? `${esc(nx.n)} seviyeye ${TL(nx.min - (u.vol || 0))} işlem hacmi kaldı.` : 'En üst seviyedesiniz.'} İşlem hacminiz: <b class="mono">${TL(u.vol || 0)}</b> · Satış komisyonunuz: <b>%${rateFor(u.id)}</b></div></div>
    <div class="panel panel-b stack"><div class="eyebrow">Puanı bakiyeye çevir</div><div class="muted" style="font-size:13px">${S.set.ptRate} puan = 1 TL. En az 500 puan çevrilebilir; çevrilen tutar alışveriş bakiyesine eklenir.</div>
      <form class="hstack" data-form="pts"><input class="inp" id="pt_amt" type="number" min="500" step="100" value="${Math.max(500, Math.floor((u.pts || 0) / 100) * 100)}" style="max-width:160px" aria-label="Çevrilecek puan"><button class="btn btn-primary" ${(u.pts || 0) < 500 ? 'disabled' : ''}>Bakiyeye çevir</button></form></div>
    <div class="panel panel-b stack"><div class="eyebrow">VIP seviyeleri</div><div class="viptbl">${VIP.map(x => `<div class="${x.id === v.id ? 'on' : ''}"><span class="vip" style="background:${x.c};align-self:flex-start">${esc(x.n)}</span><b>${x.min ? TL(x.min) + ' hacim' : 'Başlangıç'}</b><span>Alışverişte %${x.cb} puan</span><span>Satışta komisyon %${r2(Math.max(0, S.set.commission - x.disc))}</span></div>`).join('')}</div>
      <span class="muted" style="font-size:12px">Seviyeniz tamamlanan alış ve satışlarınızın toplam hacmine göre belirlenir; komisyon indirimi satış anında sunucuda uygulanır.</span></div>`; }
function p5Davet(u) { const code = u.refCode || refCode(u); const link = refLink(u);
  const d = need('me:refs', () => call('GET', 'me/referrals', null, { quiet: true }).then(j => j.data || {}), 30000); const L = d && !d.err ? (d.refs || []) : [];
  return `${S.set.refOn ? '' : '<div class="note note-info">Davet programı şu an kapalı.</div>'}<div class="panel panel-b stack"><div class="eyebrow">Davet et kazan</div><div style="font-family:var(--f-display);font-size:26px;font-weight:800;text-transform:uppercase">Her arkadaşın için ${TL(S.set.refBonus)}</div><p class="muted" style="margin:0">Davet kodunla üye olan arkadaşın en az ${TL(S.set.refMin)} tutarındaki ilk alışverişini tamamladığında sana ${TL(S.set.refBonus)}, ona ${TL(S.set.refFriend)} hediye bakiye yüklenir. Hediye bakiye alışverişte kullanılır, çekilemez. En fazla ${S.set.refMax} arkadaş davet edebilirsin.</p>
    <div class="reflink"><span class="eyebrow">Davet linkin · en kolayı</span><div class="cprow"><span class="mono" style="font-size:13.5px;overflow-wrap:anywhere;min-width:0" id="p5RefLink">${esc(link)}</span><button class="btn btn-sm btn-primary" data-act="copy" data-v="${esc(link)}">Linki kopyala</button></div><span class="muted" style="font-size:12px">Bu linkle gelen arkadaşın kayıt olurken kod yazmasına gerek yok, otomatik olarak sana bağlanır.</span></div>
    <div class="cprow"><span><span class="muted">Davet kodun (link kullanamayanlar için)</span><br><b class="mono" style="font-size:16px">${esc(code)}</b></span><button class="btn btn-sm" data-act="copy" data-v="${esc(code)}">Kodu kopyala</button></div>
    ${!d ? pLoading() : d.err ? p5Err(d) : L.length ? `<div class="tbl-w"><table class="tbl mcards" id="p5Refs"><thead><tr><th>Davet ettiğin</th><th>Üyelik</th><th>Durum</th></tr></thead><tbody>${L.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.joined || '')}</td><td>${x.paid ? '<span class="pill p-tamam">Kazandın</span>' : '<span class="pill p-bekliyor">İlk alışveriş bekleniyor</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<span class="muted" style="font-size:12.5px">Henüz davetle gelen arkadaşın yok.</span>'}
    <div class="kpis"><div class="kpi"><small>Ödüllü davet</small><b>${u.refs || 0}</b></div><div class="kpi"><small>Kazancın</small><b>${TL((u.refs || 0) * S.set.refBonus)}</b></div></div></div>`; }
function p5MktPanel() { const m = P5.mkt || { mail: true, sms: true };
  return `<form class="panel panel-b stack p5mkt" data-form="p5mkt"><div class="eyebrow">Kampanya iletileri</div><span class="muted" style="font-size:12.5px">Sipariş, ödeme ve güvenlik iletileri her zaman gönderilir. Aşağıdakiler yalnız kampanya ve “seni özledik” iletileri içindir.</span>
    <label class="chk" for="mk_mail"><input type="checkbox" id="mk_mail" ${m.mail ? 'checked' : ''}> Kampanya e-postaları almak istiyorum</label><label class="chk" for="mk_sms"><input type="checkbox" id="mk_sms" ${m.sms ? 'checked' : ''}> Kampanya mesajlarını WhatsApp'tan almak istiyorum</label>
    <div><button class="btn btn-sm">Tercihleri kaydet</button></div></form>`; }
{ const t0 = p2AccTabs; p2AccTabs = (u, base) => { const T = t0(u, base); const add = (k, l, after) => { if (T.some(([x]) => x === k)) return; const i = T.findIndex(([x]) => x === after); T.splice(i < 0 ? T.length : i + 1, 0, [k, l]); };
    add('reklam', 'Reklamlarım', 'ilan'); add('puan', 'VIP & Puan', 'reklam'); add('davet', 'Davet et kazan', 'puan'); return T; }; }
{ const b0 = p2AccBody; p2AccBody = (u, tab) => tab === 'reklam' ? p5Reklam(u) : tab === 'puan' ? p5Puan(u) : tab === 'davet' ? p5Davet(u) : b0(u, tab); }
{ const f = vAccount; vAccount = function () { let h = f.apply(this, arguments); if (me() && ui.tab === 'profil') h = h.replace('<div class="panel panel-b hstack" style="justify-content:space-between;max-width:560px">', p5MktPanel() + '$&'); return h; }; }

/* ================= yönlendirme: Reklam Ver ve Çekiliş artık canlı ================= */
{ const v0 = view; view = function (r) { if ((r === 'cekilis' || r === 'reklam-ver') && !API.booting && API.live && !(maintOn() && !isPanel())) return r === 'cekilis' ? vCamp() : vAds(); return v0(r); }; }

/* ================= Yönetim ================= */
/* reklam onay rozeti: sayı sunucudan (GET admin/today → queues.ads) */
{ const q = admQ('reklam'); if (q) q.L = () => { const c = API.cache['adm:today']; const n = c && c.v && c.v.queues ? +c.v.queues.ads || 0 : 0; const real = S.ads.filter(a => adSt(a) === 'onay');
    return real.length >= n ? real.slice(0, Math.max(n, real.length)) : Array.from({ length: n }, (_, i) => real[i] || { id: '_q' + i, type: Object.keys(S.packs)[0], price: 0, status: 'onay', bookedAt: now() }); }; }
if (typeof P2_Q !== 'undefined' && !P2_Q.some(x => x[0] === 'ads')) P2_Q.push(['ads', 'reklam', 'reklam', '#yonetim/reklam/onay']);
const p5AdmAds = () => p1AdmLoad('adm:ads', 'admin/ads', x => { p1UpU(x.users); const ids = (x.ads || []).map(a => a.id); S.ads = S.ads.filter(a => ids.includes(a.id) || a.status === 'onayli');
  p5UpAds(x.ads); p2QSet('ads', x.pending); return { ids, pending: +x.pending || 0, counts: x.counts || {}, escrow: +x.escrow || 0, revenue: +x.revenue || 0 }; }, 15000);
const p5AdmSlides = () => p1AdmLoad('adm:slides', 'admin/slides', x => { S.slides = (x.slides || []).map(p5AdIn); return { n: S.slides.length }; }, 30000);
function p5AdmReklam(sub, P) { const d = p5AdmAds(); if (!d) return { body: pLoading('Reklamlar yükleniyor…') }; if (d.err) return { body: p5Err(d) };
  const actions = `<button class="btn" data-act="preview-pop">Popup'ı önizle</button><a class="btn btn-primary" href="#reklam-ver">+ Reklam ekle</a>`;
  const head = aSum([['Onay bekleyen', NUM(d.pending)], ['Onay bekleyen ödemeler (havuz)', TL(d.escrow)], ['Toplam reklam geliri', TL(d.revenue), 1]]);
  if (sub === 'gorseller') { const s = p5AdmSlides(); return { actions, body: !s ? pLoading() : s.err ? p5Err(s) : slidesAdmin() }; }
  if (sub === 'fiyatlar') return { actions, body: `<div class="panel"><div class="panel-h"><h3>Paket fiyatları</h3><span class="muted" style="font-size:12px">1 gün / 7 gün / 30 gün · fiyat sunucuda uygulanır</span></div><form class="panel-b stack" data-form="packs">${Object.entries(S.packs).map(([k, p]) => `<div class="row3 p5pk" style="grid-template-columns:1.4fr repeat(4,1fr);align-items:end"><b>${esc(p.name)}</b><div class="fld"><label for="pk_${k}_cap">Aynı anda en fazla</label><input class="inp" type="number" id="pk_${k}_cap" value="${p.cap || 1}" min="1" max="50"></div>${p.p.map((v, i) => `<div class="fld"><label for="pk_${k}_${i}">${[1, 7, 30][i]} gün</label><input class="inp" type="number" id="pk_${k}_${i}" value="${v}" min="0" step="0.01"></div>`).join('')}</div>`).join('')}<div class="panel-f"><button class="btn btn-primary btn-sm">Fiyatları kaydet</button></div></form></div>` };
  if (sub === 'tum') { ui.adf = P.f || ui.adf || 'hepsi'; const q = (P.q || '').toLocaleLowerCase('tr-TR').trim(); ui.aq = P.q || '';
    const AL = adList().filter(a => d.ids.includes(a.id) && (!q || [(srv(a.server) || {}).name, a.title, a.text, a.owner ? (user(a.owner) || {}).name : ''].some(v => String(v || '').toLocaleLowerCase('tr-TR').includes(q))));
    const all = S.ads.filter(a => d.ids.includes(a.id));
    return { actions, body: `<div class="panel">${head}${aFilter({ q: ui.aq, ph: 'Server, başlık veya yayınlayan' })}<div class="afbar"><div class="afchips">${[['hepsi', 'Tümü', all.length], ...Object.entries(S.packs).map(([k, p]) => [k, p.name.replace(/ \(.*\)| \d+×\d+| Reklamı/g, ''), all.filter(a => a.type === k).length])].map(([k, v, n]) => `<button type="button" class="afchip ${(ui.adf || 'hepsi') === k ? 'on' : ''}" data-act="adf" data-t="${k}">${esc(v)} <b>${n}</b></button>`).join('')}</div><div class="afbar-r"><span class="muted" style="font-size:12.5px">${AL.length} reklam</span></div></div>${AL.length ? '' : emptyBox('Bu türde reklam yok', '')}<div class="tbl-w" ${AL.length ? '' : 'hidden'}><table class="tbl adtbl mcards"><thead><tr><th>Reklam</th><th>Yayınlayan</th><th>Yayın</th><th class="num" style="white-space:normal">Gösterim / tıklama</th><th></th></tr></thead><tbody>${AL.map(a => `<tr data-aid="${esc(a.id)}"><td><b>${esc((S.packs[a.type] || {}).name || a.type)}</b> · ${esc((srv(a.server) || {}).name || (a.newSrv && a.newSrv.name) || a.title || '-')}${a.newSrv ? ' <span class="chip">yeni server</span>' : ''}<div class="muted" style="font-size:12px">${esc(a.text || a.title || '')}</div>${['slider', 'banner', 'altbanner', 'popup', 'yan'].includes(a.type) ? `<div class="admed"><span class="muted">${(a.media || []).length} medya</span><label class="lnk" for="am_${a.id}">Ekle</label><input type="file" id="am_${a.id}" accept="image/*,video/mp4,video/webm" multiple hidden data-change="admediaadd" data-id="${a.id}">${(a.media || []).length ? `<button class="lnk" data-act="ad-media-clear" data-id="${a.id}">Temizle</button>` : ''}</div>` : ''}</td><td>${a.owner ? uCellS(user(a.owner)) + `<div class="muted mono" style="font-size:11px">${esc(user(a.owner).tel || '')}</div>` : '<span class="muted">Site / yönetici</span>'}</td><td>${adPill(a)}<div class="muted" style="font-size:11.5px;margin-top:3px">${dstr(a.start || a.until - 7 * D)} – ${dstr(a.until - 1)} · ${a.until > now() ? left(a.until) + ' kaldı' : 'bitti'}</div><div class="mono" style="font-size:12px">${a.free ? 'ücretsiz' : TL(a.price || 0)}</div></td><td class="num">${NUM(a.views || 0)} / ${NUM(a.clicks || 0)}<div class="muted" style="font-size:11px">${adCtr(a)}</div></td><td><div class="adact"><button class="btn btn-sm" data-act="ad-detail" data-id="${a.id}">Detay</button>${adSt(a) === 'red' ? '' : `<button class="btn btn-sm" data-act="ad-toggle" data-id="${a.id}">${a.active ? 'Durdur' : 'Başlat'}</button><button class="btn btn-sm" data-act="ad-ext" data-id="${a.id}">+7 gün</button>`}<button class="btn btn-sm btn-bad" data-act="ad-del" data-id="${a.id}">Sil</button></div></td></tr>`).join('')}</tbody></table></div></div>` }; }
  return { actions, desc: 'Onaylanan reklamın ücreti gelire yazılır; reddedilen reklamın ücreti üyenin ödediği bakiyeye (çekilebilir / alışveriş) iade edilir.', body: head.replace('<div class="asum">', '<div class="asum" style="margin-bottom:0">') + adPending() }; }

/* Çekiliş & kupon › Çekilişler / Şans çarkı */
const p5AdmRaffles = () => p1AdmLoad('adm:raffles', 'admin/raffles', x => { p1UpU(x.users); S.set.raffleOn = x.raffleOn !== false; return { L: x.raffles || [] }; }, 15000);
const p5AdmWheel = () => p1AdmLoad('adm:wheel', 'admin/wheel', x => { S.set.wheelOn = !!x.on; S.set.raffleOn = x.raffleOn !== false; if (Array.isArray(x.prizes)) WHEEL.splice(0, WHEEL.length, ...x.prizes); return x; }, 20000);
function p5AdmCekilis() { const d = p5AdmRaffles(); if (!d) return { body: pLoading('Çekilişler yükleniyor…') }; if (d.err) return { body: p5Err(d) };
  S.raffles = d.L.map(r => Object.assign({}, r, { tk: r.tk || {}, acc: {} }));
  const on = S.set.raffleOn !== false;
  return { desc: 'Bilet koşulları sunucuda uygulanır. Kazanan, çekiliş anındaki bilet listesinin anlık görüntüsü ve rastgele tohumla seçilir; sonuç sonradan doğrulanabilir.', body: `<div class="panel panel-b stack"><div class="hstack"><label class="chk asw" for="rf_onoff"><input type="checkbox" id="rf_onoff" data-change="p5raffleon" ${on ? 'checked' : ''}> Çekilişler açık</label>${aSw}</div><span class="muted" style="font-size:12.5px">Kapatırsanız üyeler çekiliş sayfasında aktif çekiliş görmez, bilet kazanamaz ve ücretsiz bilet alamaz. Mevcut biletler korunur.</span></div>
    <form class="panel panel-b stack" data-form="raffle"><h3 class="ph3">Yeni çekiliş başlat</h3>
      <div class="row3"><div class="fld"><label for="rf_t">Ödül adı</label><input class="inp" id="rf_t" required minlength="2" maxlength="120" placeholder="Örn: +9 Zehir Kılıcı"></div><div class="fld"><label for="rf_k">Tür</label><select class="inp" id="rf_k"><option value="bal">Bakiye (kazanana otomatik yüklenir)</option><option value="item">Item (oyunda teslim)</option></select></div><div class="fld"><label for="rf_v">Değer (TL)</label><input class="inp" id="rf_v" type="number" min="1" step="0.01" required></div></div>
      <div class="eyebrow" style="margin-top:4px">Bilet koşulları</div>
      <div class="row3"><div class="fld"><label for="rf_per">Kaç TL alışverişe 1 bilet?</label><input class="inp mono" id="rf_per" type="number" min="1" value="100" required></div><div class="fld"><label for="rf_vip">Kimler katılabilir?</label><select class="inp" id="rf_vip"><option value="">Tüm üyeler</option>${VIP.slice(1).map(v => `<option value="${esc(v.id)}">${esc(v.n)} ve üzeri</option>`).join('')}</select></div><div class="fld"><label for="rf_max">Kişi başı en fazla bilet</label><input class="inp mono" id="rf_max" type="number" min="0" value="0"><span class="muted" style="font-size:11.5px">0 = sınırsız</span></div></div>
      <div class="fld"><span class="lbl">Hangi harcamalar bilet kazandırsın? (hiçbiri seçilmezse hepsi)</span><div class="rcats">${Object.entries(RCATS).map(([k, v]) => `<label class="chk" for="rfc_${k}"><input type="checkbox" id="rfc_${k}" data-rc="${k}"> ${esc(v)}</label>`).join('')}</div></div>
      <div class="row3"><div class="fld"><label for="rf_d">Süre (gün)</label><input class="inp" id="rf_d" type="number" min="1" max="365" value="7"></div><label class="chk" for="rf_free" style="align-self:end"><input type="checkbox" id="rf_free" checked> Günde 1 ücretsiz bilet verilsin</label></div>
      <div><button class="btn btn-primary">Çekilişi başlat</button></div></form>
    <div class="panel"><div class="panel-h"><h3>Çekilişler</h3></div>${S.raffles.length ? `<div class="tbl-w"><table class="tbl mcards"><thead><tr><th>Ödül</th><th>Bilet koşulu</th><th>Bitiş</th><th class="num">Bilet</th><th>Kazanan</th><th></th></tr></thead><tbody>${S.raffles.map(r => `<tr data-rid="${esc(r.id)}"><td><b>${esc(r.title)}</b><div class="muted" style="font-size:12px">${r.kind === 'bal' ? 'Bakiye' : 'Item'} · ${TL(r.value)}</div></td><td style="font-size:12px">${rCond(r).join('<br>')}</td><td>${r.winner ? dstr(r.end) : r.end > now() ? left(r.end) : dstr(r.end) + ' · süre doldu'}</td><td class="num">${NUM(rTotal(r))}<div class="muted" style="font-size:11px">${NUM(r.entrants || 0)} katılımcı</div></td><td>${r.winner ? esc(user(r.winner).name) + ' · ' + esc(fullName(user(r.winner))) + (r.draw ? `<div class="muted mono p5seed" title="Tohum (seed)">#${NUM(r.draw.index + 1)}/${NUM(r.draw.total)} · ${esc(String(r.draw.seed).slice(0, 16))}…</div>` : '') : '<span class="muted">—</span>'}</td><td><div class="hstack" style="flex-wrap:nowrap">${r.winner ? `<button class="btn btn-sm" data-act="p5-rverify" data-id="${esc(r.id)}">Doğrula</button>` : `<button class="btn btn-sm btn-primary" data-act="draw" data-id="${esc(r.id)}">Kazananı çek</button>`}<button class="btn btn-sm btn-bad" data-act="r-del" data-id="${esc(r.id)}">Sil</button></div></td></tr>`).join('')}</tbody></table></div>` : emptyBox('Çekiliş yok', 'Yukarıdan ilk çekilişi başlatın.')}</div>` }; }
function p5AdmCark() { const d = p5AdmWheel(); if (!d) return { body: pLoading() }; if (d.err) return { body: p5Err(d) }; const st = d.stats || {};
  const K = [['bal', 'Bakiye (TL, yalnız alışveriş)'], ['pt', 'Puan'], ['tk', 'Çekiliş bileti']];
  return { desc: 'Üyeler günde bir kez çevirir (sunucuda denetlenir). Bakiye ödülü çekilemeyen alışveriş bakiyesine, puan ödülü puana, bilet ödülü aktif çekilişlere eklenir.', body: `<div class="panel panel-b stack"><h3 class="ph3">Şans çarkı</h3><div class="hstack"><label class="chk asw" for="wh_on"><input type="checkbox" id="wh_on" data-change="wheelon" ${S.set.wheelOn ? 'checked' : ''}> Çark açık</label>${aSw}<button class="btn btn-sm" data-act="spin-reset">Tüm üyelerin günlük hakkını yenile</button></div><span class="muted" style="font-size:12.5px">Çark ödülleri ve oranları çekiliş sayfasında görünür; üyeler günde bir kez çevirebilir. Hak yenileme bugünkü ücretsiz bilet hakkını da yeniler.</span>
      ${aSum([['Bugün çevirme', NUM(st.today || 0)], ['Bugün dağıtılan bakiye', TL(st.bal || 0)], ['Bugün dağıtılan puan', NUM(st.pts || 0)], ['Toplam çark gideri', TL(st.expTotal || 0), 1]])}</div>
    <form class="panel" data-form="p5prizes"><div class="panel-h"><h3>Çark dilimleri</h3><span class="muted" style="font-size:12px">2–16 dilim · ağırlık büyüdükçe çıkma olasılığı artar</span></div><div class="panel-b stack">${WHEEL.map((w, i) => { const tot = WHEEL.reduce((s, x) => s + (+x.w || 0), 0); return `<div class="p5prz"><div class="fld"><label for="wp_l_${i}">Etiket</label><input class="inp" id="wp_l_${i}" maxlength="16" value="${esc(w.l)}"></div><div class="fld"><label for="wp_k_${i}">Tür</label><select class="inp" id="wp_k_${i}">${K.map(([k, v]) => `<option value="${k}" ${w.k === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div class="fld"><label for="wp_v_${i}">Değer</label><input class="inp mono" id="wp_v_${i}" type="number" min="0.01" step="0.01" value="${w.v}"></div><div class="fld"><label for="wp_w_${i}">Ağırlık · %${tot ? (w.w / tot * 100).toFixed(1) : 0}</label><input class="inp mono" id="wp_w_${i}" type="number" min="0.01" step="0.01" value="${w.w}"></div><input class="inp" type="color" id="wp_c_${i}" value="${esc(w.c || '#333333')}" style="height:40px;padding:3px" aria-label="Dilim rengi"></div>`; }).join('')}
      <div class="hstack"><button type="button" class="btn btn-sm" data-act="p5-prz-add" ${WHEEL.length >= 16 ? 'disabled' : ''}>+ Dilim ekle</button><button type="button" class="btn btn-sm btn-bad" data-act="p5-prz-del" ${WHEEL.length <= 2 ? 'disabled' : ''}>Son dilimi sil</button></div></div>${aSave('Çark dilimlerini kaydet')}</form>` }; }

/* VIP & davet */
const p5AdmRefs = () => p1AdmLoad('adm:refs', 'admin/referrals', null, 20000);
function p5AdmVip(sub) { if (sub !== 'davet') return { body: vipAdmin('seviyeler') };
  const s = S.set; const d = p5AdmRefs();
  const tbl = !d ? pLoading() : d.err ? p5Err(d) : d.refs && d.refs.length ? `<div class="tbl-w"><table class="tbl mcards" id="p5RefTbl"><thead><tr><th>Davet edilen</th><th>Davet eden</th><th>Durum</th><th>Uyarı</th></tr></thead><tbody>${d.refs.map(x => `<tr><td><b>${esc(x.name)}</b><div class="muted" style="font-size:11.5px">${dstr(x.t)}</div></td><td>${esc(x.byName)}</td><td>${x.paid ? '<span class="pill p-tamam">Ödül ödendi</span>' : '<span class="pill p-bekliyor">İlk alışveriş bekleniyor</span>'}</td><td>${x.flags.length ? x.flags.map(f => `<div class="p5flag"><span class="pill ${f.seen ? 'p-odendi' : 'p-itiraz'}">${esc(f.txt)}</span>${f.ip ? ` <span class="mono muted">${esc(f.ip)}</span>` : ''}${f.seen ? '' : ` <button type="button" class="btn btn-sm" data-act="p5-flag-seen" data-id="${f.id}">İncelendi</button>`}</div>`).join('') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<span class="muted">Henüz davet yok.</span>';
  return { body: `<form class="panel" data-form="refset"><div class="panel-h"><h3>Davet et kazan</h3></div><div class="panel-b stack">
    <div class="row3"><label class="chk" for="rf_on"><input type="checkbox" id="rf_on" ${s.refOn ? 'checked' : ''}> Davet sistemi açık</label><div class="fld"><label for="rf_b">Davet edene ödül (TL)</label><input class="inp mono" type="number" min="0" step="0.5" id="rf_b" value="${s.refBonus}"></div><div class="fld"><label for="rf_f">Davet edilene ödül (TL)</label><input class="inp mono" type="number" min="0" step="0.5" id="rf_f" value="${s.refFriend}"></div></div>
    <div class="row3"><div class="fld"><label for="rf_m">Ödül için ilk alışveriş en az (TL)</label><input class="inp mono" type="number" min="0" id="rf_m" value="${s.refMin}"></div><div class="fld"><label for="rf_x">Bir üye en fazla kaç kişi davet edebilir</label><input class="inp mono" type="number" min="1" id="rf_x" value="${s.refMax}"></div><div></div></div>
    <div class="note note-info">Ödüller, davet edilen üyenin ilk alışverişi tamamlandığında “sadece alışveriş” bakiyesine yüklenir; çekilemez. Her davetli için yalnız bir kez ödenir.</div></div>${aSave('Davet ayarlarını kaydet')}</form>
    <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Davetler</h3><span class="muted" style="font-size:12px">${d && !d.err ? `${NUM(d.paid)} ödüllü davet · toplam ${TL(d.expTotal)} · ${NUM(d.unseen)} incelenmemiş uyarı` : ''}</span></div><div class="panel-b stack"><div class="note note-warn" style="font-size:12.5px">Davet eden ile davetli aynı IP adresinden giriş yaptıysa, aynı IBAN'ı ya da telefonu kullanıyorsa ödül yine ödenir ama burada uyarı olarak işaretlenir. Kötüye kullanım varsa Üyeler › Bakiye düzeltme ile geri alabilirsiniz.</div>${tbl}</div></div>` }; }

/* Üyeler › Geri kazan */
function p5AdmWinback() { const days = +(ui.wbDays || 30); const d = p1AdmLoad('adm:wb:' + days, 'admin/winback?days=' + days, null, 20000);
  if (!d) return { body: pLoading('Hareketsiz üyeler yükleniyor…') }; if (d.err) return { body: p5Err(d) }; const L = d.users || [];
  const msg = d.msg || '{ad}, seni özledik! {kupon} koduyla bakiye yüklemene %10 bonus seni bekliyor. İyi oyunlar, ' + S.set.siteName;
  return { desc: 'Belirli süredir işlem yapmayan üyelere site bildirimi, e-posta veya WhatsApp mesajı gönderin. E-posta ve WhatsApp saatlik gönderim sınırına uyularak sırayla gider; iletiyi kapatan üyelere gönderilmez. WhatsApp kampanyası yalnız Meta\'da onaylı bir pazarlama şablonuyla gönderilebilir.', body: `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Hareketsiz üyeler · geri kazan</h3><div class="hstack"><label for="wb_days" class="muted" style="font-size:12.5px">İşlem yapmadığı süre</label><select class="inp" id="wb_days" data-change="wbdays" style="width:auto">${[14, 30, 60, 90, 180].map(x => `<option value="${x}" ${x === days ? 'selected' : ''}>${x} gün ve üzeri</option>`).join('')}</select></div></div>
  ${L.length ? `<form data-form="winback"><div class="tbl-w"><table class="tbl mcards" id="p5WbTbl"><thead><tr><th><input type="checkbox" id="wb_all" data-change="wball" checked aria-label="Tümünü seç"></th><th>Üye</th><th>Son hareket</th><th class="num">Toplam yatırım</th><th class="num">Bakiye</th></tr></thead><tbody>${L.map(u => `<tr><td><input type="checkbox" class="wbc" value="${esc(u.id)}" checked aria-label="${esc(u.name)}"></td><td><b>${esc(u.name)}</b><div class="muted" style="font-size:12px">${esc([u.ad, u.soyad].filter(Boolean).join(' '))}</div><div class="muted mono" style="font-size:11.5px">${esc(u.tel || '')}${u.optMail ? ' · e-posta kapalı' : ''}${u.optSms ? ' · WhatsApp kapalı' : ''}</div></td><td>${u.last ? dstr(u.last) + ' · ' + ago(u.last) : 'Hiç'}</td><td class="num">${TL(u.dep)}</td><td class="num">${TL(u.bal)}</td></tr>`).join('')}</tbody></table></div>
  <div class="panel-b stack" style="border-top:1px solid var(--line)"><div class="fld"><label for="wb_msg">Mesaj · {ad} ve {kupon} yazdığınız yere üyenin adı ve kupon kodu gelir</label><textarea class="inp" id="wb_msg" maxlength="500" style="min-height:64px">${esc(msg)}</textarea></div>
  <div class="row3"><div class="fld"><label for="wb_cp">Kupon kodu (boş bırakılırsa kupon yok)</label><input class="inp mono" id="wb_cp" value="GERIDON10" maxlength="30" style="text-transform:uppercase"></div><div class="fld"><label for="wb_pct">Kupon bonusu (%)</label><input class="inp" type="number" id="wb_pct" min="1" max="100" value="10"></div><div class="fld"><label for="wb_gift">Hediye bakiye (çekilemez, TL)</label><input class="inp" type="number" id="wb_gift" min="0" max="1000" step="1" value="0" ${d.canGift ? '' : 'disabled title="Bakiye ekleme yetkisi gerekir"'}></div></div>
  <div class="hstack" style="flex-wrap:wrap"><label class="chk" for="wb_ntf"><input type="checkbox" id="wb_ntf" checked> Site bildirimi</label><label class="chk" for="wb_mail"><input type="checkbox" id="wb_mail" ${d.mailOn ? '' : 'disabled'}> E-posta${d.mailOn ? '' : ' (kapalı)'}</label><label class="chk" for="wb_sms"><input type="checkbox" id="wb_sms" ${d.smsOn ? '' : 'disabled'}> WhatsApp${d.smsOn ? '' : ' (pazarlama şablonu yok)'}</label><button class="btn btn-primary">Seçilenlere gönder</button></div></div></form>` : emptyBox('Hareketsiz üye yok', `Son ${days} günde tüm üyeler işlem yapmış.`)}
  ${(d.history || []).length ? `<div class="panel-b"><div class="eyebrow">Geçmiş kampanyalar</div><div class="feed">${d.history.map(w => `<div><span>${w.n} üyeye · ${esc(w.code || 'kuponsuz')}${w.gift ? ' · ' + TL(w.gift) + ' hediye' : ''}${w.mail ? ' · ' + w.mail + ' e-posta' : ''}${w.sms ? ' · ' + w.sms + ' WhatsApp' : ''}${w.skipped ? ' · ' + w.skipped + ' tercih nedeniyle atlandı' : ''} · geri dönen: <b>${w.back}</b></span><time>${dtstr(w.t)}</time></div>`).join('')}</div></div>` : ''}</div>` }; }

{ const v0 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (!isPanel()) return v0(P);
    const it = admItem(P.k); if (!it || !admVis(it)) return v0(P);
    if (it.k === 'reklam') { p2AdmToday(); return pAdmPage(P, it, sub => p5AdmReklam(sub, P)); }
    if (it.k === 'kampanya') { p2AdmToday(); return pAdmPage(P, it, sub => sub === 'kupon' ? p2AdmKupon() : sub === 'cark' ? p5AdmCark() : p5AdmCekilis()); }
    if (it.k === 'vip') { p2AdmToday(); return pAdmPage(P, it, sub => p5AdmVip(sub)); }
    if (it.k === 'uye' && can('uye') && (P.sub === 'geri-kazan')) { p2AdmToday(); return pAdmPage(P, it, () => p5AdmWinback()); }
    return v0(P); }; }
