/* ================== Hesabım: Özetim, gruplu hesap menüsü, mobil kabuk (demo ve prod ortak) ==================
   Tek "Özetim" sayfası (Alıcı/Satıcı geçişi yok): en üstte Yapılacaklar, sonra Bakiyem, KPI kartları, "Para çekmeye hazır mısın?"
   profil kartı, kural tabanlı sıralanan Satış / Alış özetleri, davet kodu. Mobilde (≤760 px) sekme şeridi çizilmez: üstte selamlama
   ve görünür "☰ Menü" (data-act=hs-menu, sağdan açılan pencere), Özetim'in altında aynı menünün satır içi hâli ve Çıkış. Masaüstünde
   soldaki sekme şeridi grup başlıklarıyla çizilir. Menü tek kaynaktan: P_ACC_NAV (gruplar); sekme listesinde olup gruplarda olmayan
   sekmeler "Diğer"e düşer. Veri HSD bağdaştırıcısından: varsayılan demo (tarayıcıdaki durumdan aynı özet sayıları); prod/97h-hesabim.js
   sekmeleri (p2AccTabs zinciri), yapılacak işleri (boot / me/summary todo) ve özeti (GET me/summary) değiştirir.                    */
const HSD = {
  /** sekme listesi [[anahtar, etiket, sayı?], …] */
  tabs: u => accTabs(u),
  /** yapılacak işler: {total, buy, sell, disp, exCall, exInfo} */
  todo(u) { if (!u || u.admin) return {}; const O = S.orders || [], X = (S.exOrders || []).filter(o => o.u === u.id && exOpenSt(o.status));
    const buy = O.filter(o => o.buyer === u.id && o.status === 'teslim').length, sell = O.filter(o => o.seller === u.id && o.status === 'odendi').length,
      disp = O.filter(o => (o.buyer === u.id || o.seller === u.id) && o.status === 'itiraz').length,
      exCall = X.filter(o => o.called && !(o.ready > o.called)).length, exInfo = X.filter(o => o.status === 'bilgi').length;
    return { total: buy + sell + disp + exCall + exInfo, buy, sell, disp, exCall, exInfo }; },
  /** özet (GET me/summary ile aynı biçim); undefined: yükleniyor, {err}: yüklenemedi */
  sum(u) { const O = S.orders || [], B = O.filter(o => o.buyer === u.id), SL = O.filter(o => o.seller === u.id), OPEN = ['odendi', 'teslim', 'itiraz'];
    const net = o => o.net != null ? +o.net : r2(o.total * (1 - (o.rate || 0) / 100)), sum = (L, f) => r2(L.reduce((s, x) => s + (+f(x) || 0), 0));
    const t = now(), day = new Date(t); day.setHours(0, 0, 0, 0); const d0 = day.getTime(), m0 = new Date(day.getFullYear(), day.getMonth(), 1).getTime();
    const per = ms => { const L = SL.filter(o => o.status === 'tamam' && (o.ct || o.t) >= ms); return { n: L.length, net: sum(L, net) }; };
    const TX = (S.tx || []).filter(x => x.u === u.id && x.t >= m0), sp = TX.filter(x => x.a < 0 && !/para çek/i.test(x.l)), back = sum(TX.filter(x => x.a > 0 && /iade/i.test(x.l)), x => x.a);
    const X = (S.exOrders || []).filter(o => o.u === u.id && exOpenSt(o.status)), F = (S.exOffers || []).filter(o => o.u === u.id && o.status === 'aktif');
    const W = (S.wd || []).filter(w => w.u === u.id && w.status === 'bekliyor'), LS = (S.listings || []).filter(l => l.seller === u.id), BO = B.filter(o => OPEN.includes(o.status));
    return { todo: HSD.todo(u),
      buy: { open: BO.length, escrow: sum(BO, o => o.total), monthSpend: Math.max(0, r2(-sum(sp, x => x.a) - back)), monthN: sp.length },
      sell: { deliver: SL.filter(o => o.status === 'odendi').length, escrowNet: sum(SL.filter(o => OPEN.includes(o.status)), net), d1: per(d0), d7: per(t - 7 * 864e5), d30: per(t - 30 * 864e5),
        activeListings: LS.filter(l => l.status === 'aktif' && l.stock > 0).length, pendingListings: LS.filter(l => l.status === 'beklemede').length },
      ex: { openOrders: X.length, escrowLeft: sum(X, o => (o.qty - (o.delivered || 0)) * o.price), activeOffers: F.length, offersLeft: F.reduce((s, o) => s + (+o.left || 0), 0) },
      wd: { pending: sum(W, w => w.amount), n: W.length } }; },
  /** borsa sipariş ayrıntıları (Yapılacaklar kartı için; prod: me/exchange) */
  loadEx() { }, exLoaded: () => true,
  /** T.C. doğrulaması para çekmeye yeterli mi (prod: tam numara sunucuda) */
  tcFull: u => tcOk(u) && (typeof p3TcFull === 'function' ? p3TcFull(u) : !(typeof tcNeedFull === 'function' && tcNeedFull(u)))
};
const hsTabs = u => HSD.tabs(u);
const hsMob = () => typeof mtabMob === 'function' && mtabMob();
const hsTodo = () => HSD.todo(me()) || {};

/* ---------- hesap menüsü: gruplar ---------- */
const P_ACC_NAV = [
  { g: 'Yönetim', only: () => isPanel(), items: [{ href: 'yonetim', l: 'Yönetim paneli', ic: 'yonetim', cls: 'hs-adm' }] },
  { g: 'Genel', items: [{ t: 'ozet', l: 'Özetim', ic: 'home' }, { href: 'bildirimler', l: 'Bildirimlerim', ic: 'bildirimler', b: u => S.notifs.filter(n => n.u === u.id && !n.read).length, bl: 'okunmamış bildirim' }, { href: 'mesajlar', l: 'Mesajlarım', ic: 'mesajlar', b: u => unreadDM(u.id), bl: 'okunmamış konuşma' }] },
  { g: 'Alışlarım', items: [{ t: 'alis', l: 'Siparişlerim', ic: 'siparis', b: () => hsTodo().buy, bl: 'onay bekleyen sipariş' }, { t: 'borsa', s: 'al', l: 'Borsa alımlarım', ic: 'borsa', b: () => (+hsTodo().exCall || 0) + (+hsTodo().exInfo || 0), bl: 'borsa işi bekliyor' }, { t: 'ep', l: 'EP kodlarım', ic: 'metin2-ep' }] },
  { g: 'Satışlarım', items: [{ t: 'ilan', l: 'İlanlarım', ic: 'metin2-tr' }, { t: 'satis', l: 'Satışlarım', ic: 'pazar', b: () => hsTodo().sell, bl: 'teslimat bekleyen satış' }, { t: 'borsa', s: 'sat', l: 'Borsa satış emirlerim', ic: 'borsa' }, { href: 'ilan-ver', l: '+ İlan ver', ic: 'ilan-ver' }, { t: 'reklam', l: 'Reklamlarım', ic: 'reklam-ver' }] },
  { g: 'Cüzdan', items: [{ act: 'deposit', l: 'Bakiye yükle', ic: 'ilan-ver' }, { t: 'cek', l: 'Para çek', ic: 'cikis' }, { t: 'hareket', l: 'Bakiye hareketleri', ic: 'rehber' }, { t: 'banka', l: 'Banka hesaplarım', ic: 'guvenli' }] },
  { g: 'Kazan', items: [{ t: 'puan', l: 'VIP & Puan', ic: 'cekilis' }, { t: 'davet', l: 'Davet et kazan', ic: 'cekilis' }, { href: 'cekilis', l: 'Çekiliş & Çark', ic: 'cekilis' }] },
  { g: 'Hesap', items: [{ t: 'profil', l: 'Profil ve güvenlik', ic: 'hesabim' }] }
];
/** Görünür gruplar: yalnız sekme listesinde olan sekmeler; listede olup gruplarda olmayanlar "Diğer"e. Yönetici: Yönetim + Hesap. */
function hsNav(u) { const T = hsTabs(u), keys = T.map(([k]) => k), lab = Object.fromEntries(T.map(([k, l]) => [k, l]));
  const G = P_ACC_NAV.filter(g => !g.only || g.only()).map(g => ({ g: g.g, items: g.items.filter(it => !it.t || keys.includes(it.t)) })).filter(g => g.items.length);
  if (u.admin) return G.filter(g => g.g === 'Yönetim' || g.g === 'Hesap');
  const used = new Set(G.flatMap(g => g.items.map(it => it.t)).filter(Boolean)); const rest = keys.filter(k => !used.has(k));
  if (rest.length) G.push({ g: 'Diğer', items: rest.map(k => ({ t: k, l: lab[k] || k, ic: 'rehber' })) });
  return G; }
function hsNavHtml(u) { const cur = ui.tab, bx = ui.hsBx || 'al';
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
  const X = (S.exOrders || []).filter(o => o.u === u.id && exOpenSt(o.status)), loaded = HSD.exLoaded();
  if ((+t.exCall || 0) + (+t.exInfo || 0) > 0 || X.length) HSD.loadEx();
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
  const tcF = HSD.tcFull(u), insp = !tcOk(u) && u.tc && u.tc.state === 'inceleme', ibT = hsTabs(u).some(([k]) => k === 'banka') ? 'banka' : 'cek';
  const I = [['ad', 'Ad soyad', !!(u.ad && u.soyad), 'profil', 'Düzenle', 1], ['tc', 'T.C. kimlik doğrulama', tcF, 'cek', tcOk(u) ? 'Numaranı onayla' : 'Doğrula', 1],
    ['tel', 'Cep telefonu', !!u.tel, 'profil', 'Ekle', 0], ['tfa', '2 adımlı doğrulama', !!u.tfa, 'profil', 'Aç', 0], ['iban', 'IBAN', (u.ibans || []).length > 0, ibT, 'Ekle', 1]];
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
function hsOzet(u) { const d = u.admin ? null : HSD.sum(u), code = u.refCode || refCode(u), mob = hsMob();
  if (u.admin) return `${mob ? '' : '<div class="note note-info">Yönetici hesabı: bakiye ve alışveriş özetleri gösterilmez.</div>'}`;
  return `<div class="hs-oz">${hsTodoHtml(u, d)}
    <section class="hs-wallet" aria-labelledby="hsWalH"><div class="hs-sh"><h2 id="hsWalH">Bakiyem</h2></div><b class="mono hs-big">${TL(avail(u))}</b><span class="muted">Kullanılabilir bakiye</span>
      <div class="hs-wr"><div><span>Çekilebilir</span><b class="mono">${TL(u.bal || 0)}</b></div><div><span>Yalnız alışveriş</span><b class="mono">${TL(u.bonus || 0)}</b></div></div>
      <div class="hs-wb"><button type="button" class="btn btn-primary" data-act="deposit">+ Bakiye yükle</button><button type="button" class="btn" data-act="p2-wd">↑ Para çek</button></div></section>
    ${hsKpis(d)}${hsProf(u)}${hsSecs(u, d)}
    <div class="panel panel-b stack hs-ref"><div class="eyebrow">Davet kodun</div><div class="cprow"><span><b class="mono" style="font-size:16px">${esc(code)}</b><br><span class="muted" style="font-size:12px">Arkadaşların üye olurken bu kodu yazabilir.</span></span><button class="btn btn-sm" data-act="copy" data-v="${esc(code)}">Kodu kopyala</button></div></div></div>`; }
/** Hesabım › Borsa: Alımlarım / Satış emirlerim bölmesi (kartlar 51-borsa-kart.js), her genişlikte */
function hsBorsa(u) { const O = exSortUser(S.exOrders.filter(o => o.u === u.id)), F = S.exOffers.filter(o => o.u === u.id).sort((a, b) => (a.status === 'aktif' ? 0 : 1) - (b.status === 'aktif' ? 0 : 1) || b.t - a.t), bx = ui.hsBx === 'sat' ? 'sat' : 'al';
  return `${S.set.exOn ? '' : `<div class="note note-info"><b>Yang Borsası kısa bir moladır.</b> ${esc(S.set.exOffMsg || '')}</div>`}
    <div class="segtabs hs-seg" role="tablist" aria-label="Borsa işlemlerim"><button role="tab" aria-selected="${bx === 'al'}" class="${bx === 'al' ? 'on' : ''}" data-act="hs-bx" data-s="al"><b>Alımlarım</b><span>${O.length}</span></button><button role="tab" aria-selected="${bx === 'sat'}" class="${bx === 'sat' ? 'on' : ''}" data-act="hs-bx" data-s="sat"><b>Satış emirlerim</b><span>${F.length}</span></button></div>
    ${bx === 'al' ? (O.length ? bxOrders(O) : emptyBox('Borsa alımın yok', 'Sabit fiyattan yang al, operatör karakterine teslim etsin.', '<a class="btn btn-primary" href="#borsa">Borsaya git</a>'))
      : (F.length ? bxOffers(F) : emptyBox('Satış emrin yok', 'Yangını kendi fiyatınla siteye sat; satılınca tutar çekilebilir bakiyene geçer.', '<a class="btn btn-primary" href="#borsa">Borsada sat</a>'))}`; }

/* ---------- kabuk: masaüstünde gruplu sekme şeridi; mobilde şerit yok (selamlama + ☰ Menü + satır içi menü) ---------- */
/** masaüstü: şeritteki düğmeler P_ACC_NAV grup sırasıyla, grup başlıklarıyla (aynı düğmeler, aynı sayaçlar) */
function hsDeskNav(h, u) { return h.replace(/<nav class="panel tabs">([\s\S]*?)<\/nav>/, (m, inner) => { const B = {}, order = [];
    inner.replace(/<button data-act="tab" data-t="([^"]+)"[\s\S]*?<\/button>/g, (b, k) => { if (!B[k]) { B[k] = b; order.push(k); } return b; });
    const used = new Set(); let out = '';
    hsNav(u).forEach(g => { const ks = g.items.map(it => it.t).filter(k => k && B[k] && !used.has(k)); if (!ks.length) return; ks.forEach(k => used.add(k)); out += `<div class="hs-navg eyebrow">${esc(g.g)}</div>` + ks.map(k => B[k]).join(''); });
    const rest = order.filter(k => !used.has(k)); if (rest.length) out += '<div class="hs-navg eyebrow">Diğer</div>' + rest.map(k => B[k]).join('');
    return '<nav class="panel tabs hs-dnav">' + out + '</nav>'; }); }
function hsShell(h) { const u = me(); if (!u || !/class="acc"/.test(h)) return h;
  if (!hsMob()) return hsDeskNav(h, u);
  const T = hsTabs(u); const tl = (T.find(([k]) => k === ui.tab) || [])[1] || 'Hesabım';
  const t = document.createElement('template'); t.innerHTML = h; const st = t.content.querySelector('.acc > .stack:last-child'); const body = st ? st.innerHTML : '';
  const menuB = `<button type="button" class="btn btn-sm hs-mbtn" data-act="hs-menu" aria-haspopup="dialog" data-sheet-opener="hs-menu">${mni('burger')} Menü</button>`;
  const top = ui.tab === 'ozet'
    ? `<div class="hs-top">${av(u)}<div class="hs-hi"><b>Merhaba ${esc(u.ad || u.name)}</b> ${u.admin ? '' : vipBadge(u)}<small>Üye no #${esc(String(u.id).replace(/\D/g, ''))}</small></div>${menuB}</div>`
    : `<div class="hs-bar"><button type="button" class="btn btn-sm hs-back" data-act="tab" data-t="ozet">‹ Özetim</button><h1>${esc(tl)}</h1>${menuB}</div>`;
  const inl = ui.tab === 'ozet' ? `<nav class="hs-inl" aria-label="Hesap menüsü" data-hsinline>${hsNavHtml(u)}</nav>${hsLogoutBtn()}` : '';
  return `<div class="wrap hsm"><h1 class="vh">Hesabım</h1>${top}<div class="stack hs-body">${body}</div>${inl}</div>`; }
{ const v0 = vAccount; vAccount = function () { return hsShell(v0.apply(this, arguments)); }; }
