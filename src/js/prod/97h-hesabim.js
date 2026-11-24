/* ================== Hesabım: Özetim, hesap menüsü, mobil kabuk (yalnız --prod derlemesinde) ==================
   Tek "Özetim" sayfası (Alıcı/Satıcı geçişi yok): en üstte Yapılacaklar, sonra Bakiyem, KPI kartları, "Para çekmeye hazır mısın?"
   profil kartı, kural tabanlı sıralanan Satış / Alış özetleri, davet kodu. Mobilde (≤760 px) sekme şeridi çizilmez: üstte selamlama
   ve görünür "☰ Menü" (data-act=hs-menu, sağdan açılan pencere), Özetim'in altında aynı menünün satır içi hâli ve Çıkış.
   Menü tek kaynaktan: P_ACC_NAV (gruplar). p2AccTabs zincirinin döndürdüğü HER sekme menüde olur; gruplarda olmayan "Diğer"e düşer.
   Veri: açılışta yalnız summary.todo (rozet); tam özet Özetim açılınca GET me/summary (need('me:sum'), 60 sn). Yoklamaya alan yok:
   yeni bildirim, borsa imzası değişimi, üyenin kendi işlemleri ve sekmenin yeniden görünmesi özeti düşürür.                         */
const HS = { todo: null, exSig: null, rt: 0 };
/** temel sekmeler (97-p0b-views.js P_TABS ile aynı; o sabit blok kapsamında) + p2AccTabs zinciri (P2–P5 eklemeleri) */
const HS_BASE = [['ozet', 'Özet'], ['ilan', 'İlanlarım'], ['profil', 'Profil ve güvenlik'], ['banka', 'Banka hesaplarım']];
const hsTabs = u => p2AccTabs(u, HS_BASE);
const hsMob = () => typeof mtabMob === 'function' && mtabMob();
const hsTodo = () => { const c = API.cache['me:sum'], v = c && c.v; return v && v.todo && !v.err ? v.todo : HS.todo || {}; };
const hsSum = () => need('me:sum', () => call('GET', 'me/summary', null, { quiet: true }).then(j => { HS.todo = j.data.todo || HS.todo; return j.data; }), 60000);
/** rozet tazeleme: me/summary arka planda (yalnız tetikleyici olaylarda; yoklamaya eklenmez) */
function hsRefresh() { needDrop('me:sum'); clearTimeout(HS.rt); if (!S.cur) return;
  HS.rt = setTimeout(() => { if (!S.cur) return; if (route() === 'hesabim') return render(); call('GET', 'me/summary', null, { quiet: true }).then(j => { HS.todo = j.data.todo || HS.todo; API.cache['me:sum'] = { v: j.data, t: Date.now() }; mtabSync(); }, () => { }); }, 700); }
{ const f = apiApplyBoot; apiApplyBoot = function (b) { HS.todo = b && b.summary && b.summary.todo ? b.summary.todo : null; needDrop('me:sum'); return f.apply(this, arguments); }; }
{ const c0 = call; call = async function (m, p) { const j = await c0.apply(this, arguments);
    try { if (m === 'GET' && /^poll\?/.test(String(p))) { const d = j.data || {}; const sig = d.exSig != null ? d.exSig : null;
        if ((d.notifs || []).length || (sig !== null && HS.exSig !== null && sig !== HS.exSig)) hsRefresh(); if (sig !== null) HS.exSig = sig; }
      else if (m !== 'GET' && S.cur && !/^(auth\/|me\/summary)/.test(String(p))) hsRefresh(); } catch (e) { }
    return j; }; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S && S.cur) needDrop('me:sum'); });
/* alt çubuk rozetleri: Hesabım = yapılacak iş toplamı; Borsa noktası = operatör bekliyor (yüklü siparişlerden ya da özetten) */
MTAB.todo = () => { const u = me(); if (!u || u.admin) return 0; return +(hsTodo().total || 0); };
{ const e0 = MTAB.exCall; MTAB.exCall = () => { const u = me(); if (!u) return false; if (API.cache['me:ex'] || API.cache['ex:pub']) return e0(); return +(hsTodo().exCall || 0) > 0; }; }

/* ---------- hesap menüsü: gruplar ---------- */
const P_ACC_NAV = [
  { g: 'Yönetim', only: () => isPanel(), items: [{ href: 'yonetim', l: 'Yönetim paneli', ic: 'yonetim', cls: 'hs-adm' }] },
  { g: 'Genel', items: [{ t: 'ozet', l: 'Özetim', ic: 'home' }, { href: 'bildirimler', l: 'Bildirimlerim', ic: 'bildirimler', b: u => S.notifs.filter(n => n.u === u.id && !n.read).length, bl: 'okunmamış bildirim' }] },
  { g: 'Alışlarım', items: [{ t: 'alis', l: 'Siparişlerim', ic: 'siparis', b: () => hsTodo().buy, bl: 'onay bekleyen sipariş' }, { t: 'borsa', s: 'al', l: 'Borsa alımlarım', ic: 'borsa', b: () => (+hsTodo().exCall || 0) + (+hsTodo().exInfo || 0), bl: 'borsa işi bekliyor' }, { t: 'ep', l: 'EP kodlarım', ic: 'metin2-ep' }] },
  { g: 'Satışlarım', items: [{ t: 'ilan', l: 'İlanlarım', ic: 'metin2-tr' }, { t: 'satis', l: 'Satışlarım', ic: 'pazar', b: () => hsTodo().sell, bl: 'teslimat bekleyen satış' }, { t: 'borsa', s: 'sat', l: 'Borsa satış emirlerim', ic: 'borsa' }, { href: 'ilan-ver', l: '+ İlan ver', ic: 'ilan-ver' }, { t: 'reklam', l: 'Reklamlarım', ic: 'reklam-ver' }] },
  { g: 'Cüzdan', items: [{ act: 'deposit', l: 'Bakiye yükle', ic: 'ilan-ver' }, { t: 'cek', l: 'Para çek', ic: 'cikis' }, { t: 'hareket', l: 'Bakiye hareketleri', ic: 'rehber' }, { t: 'banka', l: 'Banka hesaplarım', ic: 'guvenli' }] },
  { g: 'Kazan', items: [{ t: 'puan', l: 'VIP & Puan', ic: 'cekilis' }, { t: 'davet', l: 'Davet et kazan', ic: 'cekilis' }, { href: 'cekilis', l: 'Çekiliş & Çark', ic: 'cekilis' }] },
  { g: 'Hesap', items: [{ t: 'profil', l: 'Profil ve güvenlik', ic: 'hesabim' }] }
];
/** Görünür gruplar: yalnız sekme zincirinde olan sekmeler; zincirde olup gruplarda olmayanlar "Diğer"e. Yönetici: Yönetim + Hesap. */
function hsNav(u) { const T = hsTabs(u), keys = T.map(([k]) => k), lab = Object.fromEntries(T.map(([k, l]) => [k, l]));
  const G = P_ACC_NAV.filter(g => !g.only || g.only()).map(g => ({ g: g.g, items: g.items.filter(it => !it.t || keys.includes(it.t)) })).filter(g => g.items.length);
  if (u.admin) return G.filter(g => g.g === 'Yönetim' || g.g === 'Hesap');
  const used = new Set(G.flatMap(g => g.items.map(it => it.t)).filter(Boolean)); const rest = keys.filter(k => !used.has(k));
  if (rest.length) G.push({ g: 'Diğer', items: rest.map(k => ({ t: k, l: lab[k] || k, ic: 'rehber' })) });
  return G; }
function hsNavHtml(u, mode) { const cur = ui.tab, bx = ui.hsBx || 'al';
  return hsNav(u).map(g => `<div class="hs-g"><div class="mn-sec">${esc(g.g)}</div>${g.items.map(it => {
    const n = it.b ? +it.b(u) || 0 : 0, bd = n ? `<i class="mn-b" aria-hidden="true">${n > 99 ? '99+' : n}</i><span class="vh">${n} ${esc(it.bl || '')}</span>` : '';
    const on = route() === 'hesabim' && it.t && it.t === cur && (!it.s || it.s === bx);
    const inner = `<span class="mn-ic">${mni(it.ic || 'home')}</span><span class="sh-t"><b>${esc(it.l)}</b></span>${bd}`;
    const c = `mn-i sh-i${on ? ' on' : ''}${it.cls ? ' ' + it.cls : ''}`;
    if (it.href) return `<a href="#${it.href}" class="${c}">${inner}</a>`;
    if (it.act) return `<button type="button" class="${c}" data-act="${it.act}">${inner}</button>`;
    return `<button type="button" class="${c}" data-act="tab" data-t="${it.t}"${it.s ? ` data-s="${it.s}"` : ''}${on ? ' aria-current="page"' : ''}>${inner}</button>`; }).join('')}</div>`).join(''); }
const hsLogoutBtn = () => `<button type="button" class="btn btn-block hs-out" data-act="logout">${mni('cikis')} Çıkış yap</button>`;
function hsWho(u) { return `<div class="hs-who">${av(u)}<span><b>${esc(u.name)}</b> ${u.admin ? '' : vipBadge(u)}<small>${esc(fullName(u))} · Üye no #${esc(String(u.id).replace(/\D/g, ''))}</small></span></div>
  ${u.admin ? '' : `<div class="hs-mw"><span>Bakiyem</span><b class="mono">${TL(avail(u))}</b><small>Çekilebilir ${TL(u.bal || 0)} · Alışveriş ${TL(u.bonus || 0)}</small></div>`}`; }
function hsMenuSheet(u) { return sheetWrap('Hesabım', `${hsWho(u)}<nav class="hs-nav" aria-label="Hesap menüsü">${hsNavHtml(u)}</nav>`,
  { cls: 'side hs-menu', id: 'hsmenu', foot: hsLogoutBtn(), attrs: 'data-hsmenu', label: 'Hesap menüsü' }); }

/* ---------- Özetim ---------- */
const hsTi = (ic, html, attrs, cls) => `<${attrs ? 'button type="button"' : 'div'} class="hs-ti${cls ? ' ' + cls : ''}"${attrs || ''}><span class="hs-tic" aria-hidden="true">${ic}</span><span class="hs-tt">${html}</span>${attrs ? '<span class="sh-go" aria-hidden="true">›</span>' : ''}</${attrs ? 'button' : 'div'}>`;
function hsTodoHtml(u, d) { const t = hsTodo(), L = [];
  const X = (S.exOrders || []).filter(o => o.u === u.id && exOpenSt(o.status)), loaded = !!API.cache['me:ex'];
  if ((+t.exCall || 0) + (+t.exInfo || 0) > 0 || X.length) p4MeEx();
  const call_ = X.filter(o => o.called && !(o.ready > o.called)), info = X.filter(o => o.status === 'bilgi');
  call_.forEach(o => L.push(`<div class="hs-ti hs-warn"><span class="hs-tic" aria-hidden="true">!</span><span class="hs-tt"><b>Operatör seni bekliyor · #${esc(o.id)}</b><small>${esc(o.callMsg || (typeof callMsg === 'function' ? callMsg(o) : ''))}</small><button type="button" class="btn btn-primary btn-sm" data-act="ex-ready" data-id="${esc(o.id)}">Geldim, hazırım</button></span></div>`));
  info.forEach(o => L.push(`<div class="hs-ti hs-warn"><span class="hs-tic" aria-hidden="true">?</span><span class="hs-tt"><b>Borsa #${esc(o.id)}: bilgi istendi</b>${o.note ? `<small>${esc(o.note)}</small>` : ''}<button type="button" class="btn btn-primary btn-sm" data-act="ex-fix" data-id="${esc(o.id)}">Bilgileri güncelle</button></span></div>`));
  if (!loaded) { const n = (+t.exCall || 0) + (+t.exInfo || 0); if (n) L.push(hsTi('!', `<b>${n} borsa siparişinde senden işlem bekleniyor</b>`, ' data-act="tab" data-t="borsa" data-s="al"', 'hs-warn')); }
  if (+t.sell) L.push(hsTi('📦', `<b>${t.sell} satışta teslimat seni bekliyor</b>`, ' data-act="tab" data-t="satis"'));
  if (+t.buy) L.push(hsTi('✔', `<b>${t.buy} siparişte onayın bekleniyor</b>`, ' data-act="tab" data-t="alis"'));
  if (+t.disp) L.push(hsTi('⚖', `<b>${t.disp} siparişte itiraz sürüyor</b>`, ' data-act="tab" data-t="alis"'));
  if (u.tcAsk) L.push(hsTi('🪪', '<b>Ödemen için T.C. numaranı onayla</b>', ' data-act="tab" data-t="cek"'));
  if (d && d.sell && +d.sell.pendingListings) L.push(hsTi('⏳', `<b>${d.sell.pendingListings} ilanın onay bekliyor</b><small>Onaylanınca yayına girer.</small>`, '', 'hs-info'));
  const n = L.length; if (!n) return '';
  return `<section class="hs-todo" aria-labelledby="hsTodoH"><div class="hs-sh"><h2 id="hsTodoH">Yapılacaklar</h2><span class="mtab-cnt">${n}</span></div><div class="hs-tl">${L.join('')}</div></section>`; }
function hsKpis(d) { const v = (f, sub) => d && !d.err ? `<b class="mono">${TL(f(d))}</b><small>${sub(d)}</small>` : d && d.err ? '<b class="mono">—</b><small>Yüklenemedi</small>' : '<b class="mono hs-sk">…</b><small>&nbsp;</small>';
  const k = (l, f, sub, cls) => `<div class="hs-kpi${cls ? ' ' + cls : ''}"><span>${l}</span>${v(f, sub)}</div>`;
  return `<div class="hs-kpis">${k('Havuzdaki alışlarım', x => x.buy.escrow, x => `${x.buy.open} açık sipariş · teslim alınca satıcıya geçer`)}${k('Borsa havuzu', x => x.ex.escrowLeft, x => `${x.ex.openOrders} açık borsa alımı`)}
    ${k('Havuzdaki satışlarım', x => x.sell.escrowNet, () => 'Alıcı onaylayınca bakiyene geçer')}${k('Çekim bekleyen', x => x.wd.pending, x => `${x.wd.n} talep`)}
    ${k('Bu ay harcama', x => x.buy.monthSpend, x => `${x.buy.monthN} işlem`)}${k('Satış · 30 gün', x => x.sell.d30.net, x => `${x.sell.d30.n} satış · net`)}</div>
    ${d && d.err ? `<div class="hs-err"><span class="muted">Özet şu an yüklenemedi.</span><button type="button" class="btn btn-sm" data-act="hs-sum-retry">Yenile</button></div>` : ''}`; }
/** "Para çekmeye hazır mısın?": ad soyad, T.C. doğrulama, telefon, 2 adımlı doğrulama, IBAN — her madde ilgili sekmeye */
function hsProf(u) { if (u.admin || u.staff) return '';
  const tcFull = tcOk(u) && (typeof p3TcFull !== 'function' || p3TcFull(u)), insp = !tcOk(u) && u.tc && u.tc.state === 'inceleme';
  const I = [['ad', 'Ad soyad', !!(u.ad && u.soyad), 'profil', 'Düzenle', 1], ['tc', 'T.C. kimlik doğrulama', tcFull, 'cek', tcOk(u) ? 'Numaranı onayla' : 'Doğrula', 1],
    ['tel', 'Cep telefonu', !!u.tel, 'profil', 'Ekle', 0], ['tfa', '2 adımlı doğrulama', !!u.tfa, 'profil', 'Aç', 0], ['iban', 'IBAN', (u.ibans || []).length > 0, 'banka', 'Ekle', 1]];
  const done = I.filter(x => x[2]).length;
  if (done === I.length) return `<div class="hs-prof hs-ok" data-prof="${done}/${I.length}"><span>✔</span> <b>Profilin tamam</b> · para çekmeye hazırsın</div>`;
  const miss = I.filter(x => !x[2]), ok_ = I.filter(x => x[2]);
  return `<section class="hs-prof" data-prof="${done}/${I.length}" aria-labelledby="hsProfH"><div class="hs-sh"><h2 id="hsProfH">Para çekmeye hazır mısın?</h2><span class="mono">${done} / ${I.length}</span></div>
    <div class="prog" role="progressbar" aria-label="Profil tamamlama" aria-valuemin="0" aria-valuemax="${I.length}" aria-valuenow="${done}"><i style="width:${Math.round(done / I.length * 100)}%"></i></div>
    <div class="hs-pl">${miss.map(([k, l, , t, b, req]) => `<div class="hs-pi" data-k="${k}"><span class="neg" aria-hidden="true">✖</span><span class="hs-pt">${esc(l)}${req ? '<small>Para çekmek için gerekli</small>' : k === 'tfa' ? '<small>Önerilir</small>' : ''}</span>${k === 'tc' && insp ? '<span class="chip">İnceleniyor</span>' : `<button type="button" class="btn btn-sm" data-act="tab" data-t="${t}">${b} ›</button>`}</div>`).join('')}</div>
    ${ok_.length ? `<div class="hs-pok">${ok_.map(x => `<span class="chip ok">✔ ${esc(x[1])}</span>`).join('')}</div>` : ''}</section>`; }
function hsSecs(u, d) { if (!d || d.err) return '';
  const s = d.sell, b = d.buy, x = d.ex, act = (+s.activeListings) + (+s.pendingListings) + (+s.d30.n) + (+s.escrowNet) > 0 || +x.activeOffers > 0;
  const row = (l, v, attrs) => `<button type="button" class="hs-r"${attrs}><span>${l}</span><b>${v}</b><span class="sh-go" aria-hidden="true">›</span></button>`;
  const sell = act ? `<section class="hs-sec" aria-labelledby="hsSellH"><div class="hs-sh"><h2 id="hsSellH">Satış özeti</h2><a class="btn btn-sm" href="#ilan-ver">+ İlan ver</a></div>
      <div class="hs-strip">${[['Bugün', s.d1], ['7 gün', s.d7], ['30 gün', s.d30]].map(([l, z]) => `<div><span>${l}</span><b class="mono">${TL(z.net)}</b><small>${z.n} satış</small></div>`).join('')}</div>
      ${row('Aktif ilan', `${s.activeListings}${+s.pendingListings ? ` <small>(${s.pendingListings} onay bekliyor)</small>` : ''}`, ' data-act="tab" data-t="ilan"')}
      ${row('Borsa satış emri', `${x.activeOffers} aktif · ${NUM(x.offersLeft)} adet`, ' data-act="tab" data-t="borsa" data-s="sat"')}</section>`
    : `<section class="hs-sec hs-empty"><div class="hs-sh"><h2>Satmaya başla</h2></div><p class="muted">İlk ilanını ver ya da borsada yangını kendi fiyatınla sat.</p><div class="hstack"><a class="btn btn-primary btn-sm" href="#ilan-ver">İlan ver</a><a class="btn btn-sm" href="#borsa">Borsada sat</a></div></section>`;
  const any = +b.open || +x.openOrders || +b.monthN;
  const buy = `<section class="hs-sec" aria-labelledby="hsBuyH"><div class="hs-sh"><h2 id="hsBuyH">Alış özeti</h2></div>${any ? `${row('Açık sipariş', b.open, ' data-act="tab" data-t="alis"')}${row('Borsa alımı', `${x.openOrders} açık`, ' data-act="tab" data-t="borsa" data-s="al"')}${row('EP kodlarım', '', ' data-act="tab" data-t="ep"')}`
    : `<p class="muted">Henüz alışverişin yok.</p><div class="hstack"><button type="button" class="btn btn-sm btn-primary" data-mtab="pazar" data-sheet-opener="pazar">Pazara göz at</button><a class="btn btn-sm" href="#borsa">Yang Borsası</a></div>`}</section>`;
  return (+s.d30.n > +b.monthN ? sell + buy : buy + sell); }
function hsOzet(u) { const d = u.admin ? null : hsSum(), code = u.refCode || refCode(u), mob = hsMob();
  if (u.admin) return `${mob ? '' : '<div class="note note-info">Yönetici hesabı: bakiye ve alışveriş özetleri gösterilmez.</div>'}`;
  return `<div class="hs-oz">${hsTodoHtml(u, d)}
    <section class="hs-wallet" aria-labelledby="hsWalH"><div class="hs-sh"><h2 id="hsWalH">Bakiyem</h2></div><b class="mono hs-big">${TL(avail(u))}</b><span class="muted">Kullanılabilir bakiye</span>
      <div class="hs-wr"><div><span>Çekilebilir</span><b class="mono">${TL(u.bal || 0)}</b></div><div><span>Yalnız alışveriş</span><b class="mono">${TL(u.bonus || 0)}</b></div></div>
      <div class="hs-wb"><button type="button" class="btn btn-primary" data-act="deposit">+ Bakiye yükle</button><button type="button" class="btn" data-act="p2-wd">↑ Para çek</button></div></section>
    ${hsKpis(d)}${hsProf(u)}${hsSecs(u, d)}
    <div class="panel panel-b stack hs-ref"><div class="eyebrow">Davet kodun</div><div class="cprow"><span><b class="mono" style="font-size:16px">${esc(code)}</b><br><span class="muted" style="font-size:12px">Arkadaşların üye olurken bu kodu yazabilir.</span></span><button class="btn btn-sm" data-act="copy" data-v="${esc(code)}">Kodu kopyala</button></div></div></div>`; }

/* ---------- sekme zinciri ve gövdeler ---------- */
{ const t0 = p2AccTabs; p2AccTabs = (u, base) => t0(u, base).map(x => x[0] === 'ozet' ? ['ozet', 'Özetim'].concat(x.slice(2)) : x); }
{ const b0 = p2AccBody; p2AccBody = (u, tab) => { if (tab === 'ozet') return hsOzet(u);
    if (tab === 'borsa' && hsMob()) { const d = p4MeEx(); return !d || d.err ? b0(u, tab) : hsBorsa(u); }
    return b0(u, tab); }; }
/** mobil Hesabım › Borsa: Alımlarım / Satış emirlerim bölmesi (kartlar 97x) */
function hsBorsa(u) { const O = exSortUser(S.exOrders.filter(o => o.u === u.id)), F = S.exOffers.filter(o => o.u === u.id).sort((a, b) => (a.status === 'aktif' ? 0 : 1) - (b.status === 'aktif' ? 0 : 1) || b.t - a.t), bx = ui.hsBx === 'sat' ? 'sat' : 'al';
  return `${S.set.exOn ? '' : `<div class="note note-info"><b>Yang Borsası kısa bir moladır.</b> ${esc(S.set.exOffMsg || '')}</div>`}
    <div class="segtabs hs-seg" role="tablist" aria-label="Borsa işlemlerim"><button role="tab" aria-selected="${bx === 'al'}" class="${bx === 'al' ? 'on' : ''}" data-act="hs-bx" data-s="al"><b>Alımlarım</b><span>${O.length}</span></button><button role="tab" aria-selected="${bx === 'sat'}" class="${bx === 'sat' ? 'on' : ''}" data-act="hs-bx" data-s="sat"><b>Satış emirlerim</b><span>${F.length}</span></button></div>
    ${bx === 'al' ? (O.length ? bxOrders(O) : emptyBox('Borsa alımın yok', 'Sabit fiyattan yang al, operatör karakterine teslim etsin.', '<a class="btn btn-primary" href="#borsa">Borsaya git</a>'))
      : (F.length ? bxOffers(F) : emptyBox('Satış emrin yok', 'Yangını kendi fiyatınla siteye sat; satılınca tutar çekilebilir bakiyene geçer.', '<a class="btn btn-primary" href="#borsa">Borsada sat</a>'))}`; }

/* ---------- kabuk: mobilde sekme şeridi yok; masaüstünde şeride grup başlıkları ---------- */
{ const v0 = vAccount; vAccount = function () { const h = v0.apply(this, arguments); const u = me(); if (!u || !/class="acc"/.test(h)) return h;
    const T = hsTabs(u); const tl = (T.find(([k]) => k === ui.tab) || [])[1] || 'Hesabım';
    if (!hsMob()) { // masaüstü: aynı düğmeler, aralarına grup başlıkları; Bildirimlerim bağlantısı
      const grp = {}; hsNav(u).forEach(g => g.items.forEach(it => { if (it.t && !grp[it.t]) grp[it.t] = g.g; }));
      let last = null; return h.replace(/<nav class="panel tabs">([\s\S]*?)<\/nav>/, (m, inner) => '<nav class="panel tabs hs-dnav">' + inner.replace(/<button data-act="tab" data-t="([^"]+)"/g, (b, k) => { const g = grp[k] || 'Diğer'; const add = g !== last ? `<div class="hs-navg eyebrow">${esc(g)}</div>` : ''; last = g; return add + b; }) + '</nav>'); }
    const t = document.createElement('template'); t.innerHTML = h; const st = t.content.querySelector('.acc > .stack:last-child'); const body = st ? st.innerHTML : '';
    const menuB = `<button type="button" class="btn btn-sm hs-mbtn" data-act="hs-menu" aria-haspopup="dialog" data-sheet-opener="hs-menu">${mni('burger')} Menü</button>`;
    const top = ui.tab === 'ozet'
      ? `<div class="hs-top">${av(u)}<div class="hs-hi"><b>Merhaba ${esc(u.ad || u.name)}</b> ${u.admin ? '' : vipBadge(u)}<small>Üye no #${esc(String(u.id).replace(/\D/g, ''))}</small></div>${menuB}</div>`
      : `<div class="hs-bar"><button type="button" class="btn btn-sm hs-back" data-act="tab" data-t="ozet">‹ Özetim</button><h1>${esc(tl)}</h1>${menuB}</div>`;
    const inl = ui.tab === 'ozet' ? `<nav class="hs-inl" aria-label="Hesap menüsü" data-hsinline>${hsNavHtml(u)}</nav>${hsLogoutBtn()}` : '';
    return `<div class="wrap hsm"><h1 class="vh">Hesabım</h1>${top}<div class="stack hs-body">${body}</div>${inl}</div>`; }; }

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="hscss">
.hsm{padding-top:12px}.hs-body{gap:14px}
.hs-top{display:flex;align-items:center;gap:12px;margin:4px 0 14px}.hs-top .av{flex:0 0 auto}.hs-hi{flex:1 1 auto;min-width:0}.hs-hi b{font-size:17px}.hs-hi small{display:block;color:var(--muted);font-size:12.5px}
.hs-mbtn{display:inline-flex;align-items:center;gap:6px;min-height:40px;flex:0 0 auto}.hs-mbtn svg{width:16px;height:16px}
.hs-bar{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin:2px 0 14px}.hs-bar h1{font-size:18px;margin:0;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase}.hs-back{min-height:40px}
.hs-oz{display:flex;flex-direction:column;gap:14px}
.hs-sh{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.hs-sh h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0;font-family:var(--f-body);font-weight:800}
.mtab-cnt{min-width:22px;height:22px;border-radius:11px;background:var(--bad);color:var(--on-solid);font-size:12px;font-weight:700;display:grid;place-items:center;padding:0 6px}
.hs-tl{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)}
.hs-ti{display:flex;align-items:center;gap:10px;width:100%;padding:12px;border:0;border-top:1px solid var(--line);background:none;color:var(--fg);text-align:left;font:inherit;cursor:pointer}.hs-tl>.hs-ti:first-child{border-top:0}
div.hs-ti{cursor:default}.hs-ti:hover{background:var(--surface-2)}div.hs-ti:hover{background:none}
.hs-tic{flex:0 0 auto;width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--surface-2);font-weight:800}
.hs-tt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}.hs-tt small{color:var(--muted)}.hs-tt .btn{align-self:flex-start;margin-top:4px}
.hs-warn{box-shadow:inset 3px 0 0 var(--warn)}.hs-warn .hs-tic{background:var(--warn-soft);color:var(--warn)}.hs-info .hs-tic{background:var(--info-soft)}
.hs-wallet{background:var(--gold-soft);border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:2px}
.hs-big{font-size:28px;font-weight:800;line-height:1.1}.hs-wr{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.hs-wr span{display:block;font-size:12px;color:var(--muted)}
.hs-wb{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.hs-wb .btn{min-height:44px}
.hs-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}@media (min-width:761px){.hs-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
.hs-kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:2px;min-width:0}.hs-kpi span{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.hs-kpi b{font-size:18px}.hs-kpi small{color:var(--muted);font-size:12px}
.hs-sk{opacity:.5}.hs-err{display:flex;align-items:center;justify-content:space-between;gap:8px}
.hs-prof,.hs-sec{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px}.hs-prof .prog{margin-bottom:8px}
.hs-prof.hs-ok{display:flex;align-items:center;gap:6px;color:var(--ok)}.hs-prof.hs-ok b{color:var(--fg)}
.hs-pi{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px dashed var(--line)}.hs-pi:first-child{border-top:0}.hs-pt{flex:1 1 auto;min-width:0;font-weight:600}.hs-pt small{display:block;font-weight:500;color:var(--muted);font-size:11.5px}
.hs-pok{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.hs-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:6px}.hs-strip>div{background:var(--surface-2);border-radius:10px;padding:8px;min-width:0}.hs-strip span{display:block;font-size:11px;color:var(--muted)}.hs-strip b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis}.hs-strip small{color:var(--muted);font-size:11px}
.hs-r{display:flex;align-items:center;gap:8px;width:100%;padding:12px 0;border:0;border-top:1px solid var(--line);background:none;color:var(--fg);font:inherit;text-align:left;cursor:pointer;min-height:48px}.hs-r>span:first-child{flex:1 1 auto}.hs-r b small{color:var(--muted);font-weight:500}
.hs-empty p{margin:0 0 10px}
.hs-inl{margin-top:18px;border-top:1px solid var(--line);padding-top:6px}.hs-inl .mn-sec,.hs-nav .mn-sec{font-size:11.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);padding:14px 10px 6px}
.hs-inl .sh-i,.hs-nav .sh-i{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:8px 10px;border:0;border-radius:12px;background:none;color:var(--fg);font-weight:600;font-size:15px;text-align:left;cursor:pointer}
.hs-inl .sh-i:hover,.hs-inl .sh-i.on{background:var(--surface-2)}.hs-inl .sh-i.on,.hs-nav .sh-i.on{color:var(--accent)}
.hs-inl .mn-ic,.hs-nav .mn-ic{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--surface-2);flex:0 0 auto}.hs-inl .mn-ic svg,.hs-nav .mn-ic svg{width:19px;height:19px}
.hs-inl .mn-b,.hs-nav .mn-b{margin-left:auto;min-width:22px;height:22px;padding:0 6px;border-radius:11px;background:var(--bad);color:var(--on-solid);font-style:normal;font-size:12px;font-weight:700;display:grid;place-items:center}
.hs-adm{border:1px solid color-mix(in srgb,var(--accent) 45%,var(--line))!important;color:var(--accent)!important}
.hs-out{margin-top:14px;min-height:48px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--bad);border-color:color-mix(in srgb,var(--bad) 55%,var(--line))}.hs-out svg{width:18px;height:18px}
.hs-who{display:flex;align-items:center;gap:12px;padding:4px 2px 10px}.hs-who b{font-size:15px}.hs-who small{display:block;color:var(--muted);font-size:12.5px}
.hs-mw{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:4px;display:flex;flex-direction:column}.hs-mw span{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.hs-mw b{font-size:20px}.hs-mw small{color:var(--muted)}
.hs-seg{margin-bottom:12px}.hs-seg span{font-weight:700}
.hs-navg{padding:10px 12px 2px}
</style>`);
