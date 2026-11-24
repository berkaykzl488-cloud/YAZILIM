/* ================== Yang Borsası: mobil kart ızgarası, AL / SAT pencereleri, bekleyen işlem kartları (yalnız --prod derlemesinde) ==================
   ≤760 px'te borsa sayfası kart ızgarasıdır (2 sütun): her kartta SAT (en fazla ex_markets.max + "Sıra başı" en ucuz emir) ve
   AL (ex_markets.buy, "Satışta N" net stok) fiyatları. Masaüstü düzeni (vExchange) aynen kalır.
   AL penceresi tek adım (FORM.exorder, Idempotency-Key), SAT penceresi iki adım (FORM.exoffer). Formlar yalnız pencerede bulunur:
   mobil sayfada #ex_qty / #ex_price yoktur. Bekleyen alım siparişleri ve satış emirleri mobilde kart olur (yalnız mevcut eylemler:
   ex-ready, ex-fix, of-cancel). Net stok ve sıra başı sunucudan: GET exchange → net (satışta − eşlenmemiş açık sipariş), book.       */
P4.stock = P4.stock || {}; P4.net = P4.net || {};
{ const f = p4ApplyEx; p4ApplyEx = function (d) { f.apply(this, arguments); if (d && d.stock) P4.stock = d.stock; if (d && d.net) P4.net = d.net; }; }
const bxMob = () => typeof mtabMob === 'function' && mtabMob();
/** Net stok: sunucunun net haritası (önce sıradaki siparişler alır); yoksa satış sırasından */
const bxNet = x => P4.net && P4.net[x.id] != null ? Math.max(0, +P4.net[x.id] || 0) : exStock(x);
const bxTop = x => exBook(x)[0] || null;
const bxSrv = x => srv(x.server) || { name: '?', c: ['#3a4252', '#59627a'], sec: 'tr' };
const bxWon = x => /won/i.test(x.unit || '');
const bxP = v => { const t = TL(v); return `<span class="bx-p mono${t.length >= 9 ? ' long' : ''}">${t}</span>`; };
const BX_SORT = [['oner', 'Önerilen'], ['ad', 'Ada göre A–Z'], ['al', 'Alış: ucuzdan'], ['sat', 'Satış: yüksekten'], ['stok', 'Satışta: çoktan']];
const BX_IC = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M6 13l6 6 6-6"/></svg>'
};
try { const o = JSON.parse(localStorage.getItem('yp_bx') || '{}'); if (o.sort) ui.bxSort = o.sort; if (o.sec) ui.bxSec = o.sec; } catch (e) { }
const bxSave = () => { try { localStorage.setItem('yp_bx', JSON.stringify({ sort: ui.bxSort || 'oner', sec: ui.bxSec || 'hepsi' })); } catch (e) { } };

function bxList() { const sec = ui.bxSec || 'hepsi', k = ui.bxSort || 'oner';
  const L = S.exchange.filter(x => x.on).map((x, i) => ({ x, i, s: bxSrv(x) })).filter(o => sec === 'hepsi' || o.s.sec === sec);
  const by = { ad: (a, b) => a.s.name.localeCompare(b.s.name, 'tr'), al: (a, b) => (a.x.buy == null) - (b.x.buy == null) || (+a.x.buy || 0) - (+b.x.buy || 0),
    sat: (a, b) => (+b.x.max || 0) - (+a.x.max || 0), stok: (a, b) => bxNet(b.x) - bxNet(a.x) }[k];
  return by ? L.sort((a, b) => by(a, b) || a.i - b.i) : L; }
function bxCard({ x, s }) { const u = me(), unit = x.unit || 'adet', top = bxTop(x), net = bxNet(x), sp = exSellPrice(x);
  const salOff = S.set.exSellOn === false, alOff = S.set.exBuyOn === false, q = sqNorm(ui.bxQ || '');
  const satL = `${s.name} siteye sat: birim başına en fazla ${TL(x.max)} bakiyene${top ? '; sıra başı ' + TL(top.price) : ''}`;
  const alL = sp ? `${s.name} al: birim fiyat ${TL(sp)}, ${net > 0 ? 'satışta ' + NUM(net) + ' adet' : 'şu an satıcı yok, sipariş sıraya alınır'}` : `${s.name} al: fiyat yakında`;
  return `<article class="bx-card" data-id="${esc(x.id)}" data-sn="${esc(sqNorm(s.name))}"${q && !sqNorm(s.name).includes(q) ? ' hidden' : ''}>
    <div class="bx-art" style="--c1:${esc(s.c[0])};--c2:${esc(s.c[1])}"><span class="bx-wm" aria-hidden="true">${bxWon(x) ? 'WON' : 'YANG'}</span><span class="bx-sec">${s.sec === 'tr' ? 'TR' : 'PVP'}</span>${logo(s, 34)}
      <span class="bx-nm"><b>${esc(s.name)}</b><small>${bxWon(x) ? 'Metin2 Won' : 'Metin2 Yang'} · ${esc(unit)}</small></span></div>
    <button type="button" class="bx-row sat" data-act="bx-sat" data-id="${esc(x.id)}" aria-label="${esc(salOff ? s.name + ' siteye satış şu an kapalı' : satL)}"${salOff ? ' disabled' : ''}>
      <span class="bx-rt"><span class="bx-k">SAT · ${esc(unit)}</span><span class="bx-pl">${bxP(x.max)}<span class="bx-en">en fazla</span></span>${salOff ? '<span class="bx-s">Satış şu an kapalı</span>' : top ? `<span class="bx-s">Sıra başı <b class="mono">${TL(top.price)}</b></span>` : '<span class="bx-s">Henüz emir yok</span>'}</span>
      <span class="bx-b" aria-hidden="true">${BX_IC.up}</span></button>
    <button type="button" class="bx-row al" data-act="bx-al" data-id="${esc(x.id)}" aria-label="${esc(alOff ? s.name + ' alım şu an kapalı' : alL)}"${alOff || !sp ? ' disabled' : ''}>
      <span class="bx-rt"><span class="bx-k">AL · ${esc(unit)}</span><span class="bx-pl">${sp ? bxP(sp) : '<span class="bx-p">—</span>'}</span>${alOff ? '<span class="bx-s">Alım şu an kapalı</span>' : !sp ? '<span class="bx-s">Fiyat yakında</span>' : net > 0 ? `<span class="bx-s bx-ok"><i aria-hidden="true"></i>Satışta ${NUM(net)}</span>` : '<span class="bx-s bx-no"><i aria-hidden="true"></i>Şu an satıcı yok</span>'}</span>
      <span class="bx-b" aria-hidden="true">${BX_IC.down}</span></button></article>`; }
const bxGridHtml = () => { const L = bxList(); return L.length ? L.map(bxCard).join('') : ''; };
function bxView() { if (!S.set.exOn) return vExClosed();
  const u = me(), xs = S.exchange.filter(x => x.on);
  if (!xs.length) return `<div class="wrap">${emptyBox('Borsada şu an açık server yok', 'Kısa süre içinde tekrar bakın.', '<a class="btn btn-primary" href="#metin2-tr">Metin2 TR ilanları</a>')}</div>`;
  const sec = ui.bxSec || 'hepsi', n = sc => xs.filter(x => bxSrv(x).sec === sc).length, k = ui.bxSort || 'oner';
  const chip = (v, l, c) => `<button type="button" class="bx-chip${sec === v ? ' on' : ''}" data-act="bx-sec" data-s="${v}" aria-pressed="${sec === v}">${l} <b>${c}</b></button>`;
  const grid = bxGridHtml(), q = sqNorm(ui.bxQ || ''), vis = bxList().filter(o => !q || sqNorm(o.s.name).includes(q)).length;
  return `<div class="wrap bxv"><div class="bx-h"><div><h1>Yang Borsası</h1><p>Sabit fiyattan al, kendi fiyatınla sat.</p></div><span class="chip ok">● Siparişler sırayla işlenir</span></div>
    ${myCallNotes()}
    <div class="bx-bar" role="search"><label class="vh" for="bx_q">Server ara</label><input class="inp" id="bx_q" type="search" autocomplete="off" placeholder="Server ara…" value="${esc(ui.bxQ || '')}">
      <label class="vh" for="bx_sort">Sırala</label><select class="inp bx-sort" id="bx_sort" data-change="bx-sort" aria-label="Sırala">${BX_SORT.map(([v, l]) => `<option value="${v}"${k === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="bx-chips" role="group" aria-label="Bölüm">${chip('hepsi', 'Tümü', xs.length)}${chip('tr', 'Metin2 TR', n('tr'))}${chip('pvp', 'Metin2 PVP', n('pvp'))}</div>
    <div class="bx-grid" id="bxGrid">${grid}</div><div id="bx_empty"${vis ? ' hidden' : ''}>${emptyBox('Bu aramada server yok', 'Aramayı ya da süzgeci değiştir.')}</div>
    ${S.set.exPlace ? `<div class="bx-place"><span>Teslimat</span><b>${esc(S.set.exPlace)}</b><small>Operatör bu noktada karakterine ticaret açar. Hesap bilgin istenmez.</small></div>` : ''}
    ${u ? bxMine(u) : ''}</div>`; }
/** Bekleyen işlemlerim (borsa sayfası): açık siparişler ve aktif emirler, en fazla 5; Tümü → Hesabım › Borsa */
function bxMine(u) { const O = exSortUser(S.exOrders.filter(o => o.u === u.id && exOpenSt(o.status))), F = S.exOffers.filter(o => o.u === u.id && o.status === 'aktif').sort((a, b) => b.t - a.t);
  if (!O.length && !F.length) return '';
  return `<section class="bx-mine" id="bxMine" aria-labelledby="bxMineH"><div class="bx-mh"><h2 id="bxMineH">Bekleyen işlemlerim</h2><a href="#hesabim" data-act="tab" data-t="borsa">Tümü ›</a></div>
    ${O.length ? `<div class="bx-ml"><div class="eyebrow">Alımlarım · ${O.length}</div>${bxOrders(O.slice(0, 5))}</div>` : ''}${F.length ? `<div class="bx-ml"><div class="eyebrow">Satış emirlerim · ${F.length}</div>${bxOffers(F.slice(0, 5))}</div>` : ''}</section>`; }

/* ---------- bekleyen işlem kartları ---------- */
/** Üyeye görünen sipariş durumu: [çip, sınıf, adım 1-4 (0: iptal)] — öncelik sırasıyla */
function hsExChip(o) { const m = exMatched(o);
  if (o.status === 'tamam') return ['Tamamlandı', 'p-tamam', 4];
  if (o.status === 'iptal') return ['İptal edildi · iade bakiyende', 'p-iade', 0];
  if (o.status === 'bilgi') return ['Bilgi istendi', 'p-itiraz', 2];
  if (o.called && !(o.ready > o.called)) return ['Operatör seni bekliyor', 'chip warn bx-pulse', 3];
  if (o.called && o.ready > o.called) return ['Hazır olduğun bildirildi', 'chip ok', 3];
  if (o.status === 'kismen') return [`Kısmen teslim · ${NUM(o.delivered || 0)}/${NUM(o.qty)}`, 'p-teslim', 3];
  if (o.status === 'islemde' || m > 0) return ['Hazırlanıyor', 'p-odendi', 2];
  return ['Sırada', 'p-bekliyor', 1]; }
const bxPill = c => /^chip /.test(c) ? c : 'pill ' + c;
const BX_STEPS = ['Sırada', 'Hazırlanıyor', 'Teslimat', 'Tamam'];
function bxOrders(arr) { return `<div class="bx-ol">${arr.map(o => { const s = srv(o.server) || bxSrv({}), x = S.exchange.find(e => e.id === o.ex) || { unit: '' }; const [cl, cc, st] = hsExChip(o);
    const m = exMatched(o), d = o.delivered || 0, pct = o.qty ? Math.round(d / o.qty * 100) : 0;
    return `<article class="bx-o" data-id="${esc(o.id)}"><div class="bx-oh">${logo(s, 28)}<b>${esc(s.name)} · AL</b><span class="mono muted">#${esc(o.id)}</span></div>
      <div class="bx-or"><span>${NUM(o.qty)} × ${esc(x.unit || 'adet')}</span><b class="mono">${TL(o.total)}</b></div>
      <ol class="bx-steps${st ? '' : ' off'}" aria-label="Sipariş adımları">${BX_STEPS.map((l, i) => `<li class="${st > i + 1 ? 'done' : st === i + 1 ? 'cur' : ''}"${st === i + 1 ? ' aria-current="step"' : ''}>${l}</li>`).join('')}</ol>
      <div class="bx-or"><span class="${bxPill(cc)}">${cl}</span><span class="muted">${ago(o.t)}</span></div>
      <div class="bx-pg"><div class="prog" role="progressbar" aria-label="Teslim edilen" aria-valuemin="0" aria-valuemax="${o.qty}" aria-valuenow="${d}"><i style="width:${pct}%"></i></div><span class="muted">Teslim ${NUM(d)}/${NUM(o.qty)}${exOpenSt(o.status) ? ` · Hazırlanan ${NUM(m)}/${NUM(o.qty)}` : ''}</span></div>
      ${exOpenSt(o.status) && o.called && !(o.ready > o.called) ? `<div class="bx-msg">${esc(o.callMsg || (typeof callMsg === 'function' ? callMsg(o) : ''))}</div><button type="button" class="btn btn-primary btn-block" data-act="ex-ready" data-id="${esc(o.id)}">Geldim, hazırım</button>` : ''}
      ${o.status === 'bilgi' ? `${o.note ? `<div class="bx-msg">${esc(o.note)}</div>` : ''}<button type="button" class="btn btn-primary btn-block" data-act="ex-fix" data-id="${esc(o.id)}">Bilgileri güncelle</button>` : ''}
      ${(o.log || []).length ? `<details class="bx-log"><summary>İşlem geçmişi</summary><div class="feed">${o.log.slice().reverse().map(e => `<div><span>${esc(e.x)}</span><time>${dtstr(e.t)}</time></div>`).join('')}</div></details>` : ''}</article>`; }).join('')}</div>`; }
function hsOfChip(of) { if (of.status === 'iptal') return ['İptal edildi', 'p-iade']; if (of.status === 'satildi') return ['Tamamı eşleşti · ödeme teslimde', 'p-odendi'];
  return of.left < of.qty ? ['Kısmen eşleşti', 'p-teslim'] : ['Satışta · sırada', 'p-tamam']; }
function bxOffers(arr) { return `<div class="bx-ol">${arr.map(of => { const x = S.exchange.find(e => e.id === of.ex) || { unit: '' }, s = srv(x.server) || bxSrv({}); const [cl, cc] = hsOfChip(of);
    const done = of.qty - of.left, pct = of.qty ? Math.round(done / of.qty * 100) : 0; const rk = route() === 'borsa' && of.status === 'aktif' ? exBook(x).findIndex(z => z.id === of.id) + 1 : 0;
    return `<article class="bx-f" data-id="${esc(of.id)}"><div class="bx-oh">${logo(s, 28)}<b>${esc(s.name)} · SAT</b><span class="mono muted">#${esc(of.id)}</span></div>
      <div class="bx-or"><span><b class="mono">${TL(of.price)}</b> / ${esc(x.unit || 'adet')}</span><span>Kalan <b class="mono">${NUM(of.left)}</b> / ${NUM(of.qty)}</span></div>
      <div class="bx-pg"><div class="prog" role="progressbar" aria-label="Eşleşen" aria-valuemin="0" aria-valuemax="${of.qty}" aria-valuenow="${done}"><i style="width:${pct}%"></i></div><span class="muted">${NUM(done)} eşleşti${rk > 0 ? ` · Sıran: ${rk}.` : ''}</span></div>
      <div class="bx-or"><span class="pill ${cc}">${cl}</span><span class="muted">${ago(of.t)}</span></div>
      ${of.status === 'aktif' ? `<div class="muted bx-note">Ödeme: yang alıcıya teslim edildikçe, teslim edilen adet kadar bakiyene geçer.</div><button type="button" class="btn btn-bad btn-block" data-act="of-cancel" data-id="${esc(of.id)}" data-bxc="1">Emri iptal et</button>` : ''}</article>`; }).join('')}</div>`; }
/* mobil Hesabım › Borsa ve eski kart çağrıları yeni kartları kullanır (masaüstü tabloları aynen) */
exCardsB = arr => bxOrders(arr);
exCardsO = arr => bxOffers(arr);

/* ---------- AL / SAT pencereleri ---------- */
const bxQtyRow = (unit, chips) => `<div class="fld"><label for="ex_qty">Kaç adet? (${esc(unit)})</label><div class="bx-qty"><button type="button" class="btn" data-act="bx-q" data-d="-1" aria-label="Bir azalt">−</button><input class="inp mono" id="ex_qty" type="number" inputmode="numeric" min="1" max="1000000" value="1" required data-change="ex-calc" data-x="__X__" data-dir="__D__"><button type="button" class="btn" data-act="bx-q" data-d="1" aria-label="Bir artır">+</button></div>
  ${chips ? `<div class="bx-qc" role="group" aria-label="Hızlı adet">${[1, 5, 10, 20].map(v => `<button type="button" class="bx-chip" data-act="bx-qs" data-v="${v}">${v}</button>`).join('')}</div>` : ''}</div>`;
function bxAlSheet(x) { const s = bxSrv(x), u = me(), unit = x.unit || 'adet', sp = exSellPrice(x) || 0, net = bxNet(x);
  const body = `<div class="bx-sh-h">${logo(s, 36)}<div><b class="mono bx-sh-p">${TL(sp)}</b> <span class="muted">/ ${esc(unit)} · sabit fiyat</span><div class="bx-s ${net > 0 ? 'bx-ok' : 'bx-no'}"><i aria-hidden="true"></i>${net > 0 ? 'Satışta ' + NUM(net) : 'Şu an satıcı yok'}</div></div></div>
    ${exClosed('al') ? `<div class="note note-bad"><b>Siteden yang alımı şu an kapalı.</b> ${esc(S.set.exOffMsg || '')}</div>` : ''}
    ${bxQtyRow(unit, true).replace('__X__', esc(x.id)).replace('__D__', 'al')}
    ${exFieldsHtml(null, 'exb_', S.exFieldsBuy)}
    <div class="explace"><span>Teslimat yeri</span><b>${esc(S.set.exPlace || '')}</b><small>Operatör bu noktada karakterine ticaret açar. Hesap bilgin istenmez.</small></div>
    <div id="ex_waitbox" class="note note-info" ${net >= 1 ? 'hidden' : ''}><span id="ex_waitmsg">${net >= 1 ? '' : 'Şu an satıcı yok. Siparişin alınır ve sıraya girer; satış emirleri geldikçe tamamlanır. Fiyat değişmez.'}</span></div>
    <div class="muted bx-note">Siparişler sırayla eşlenir ve operatör teslim eder. Önce “yalnız alışveriş” bakiyen kullanılır.</div>`;
  const foot = `<div class="extotal bx-tot" id="ex_sum"><div><span>Ödenecek</span><small id="bx_bal">Bakiyen ${TL(avail(u))}</small></div><b class="mono" id="ex_tot">${TL(sp)}</b></div>
    <button class="btn btn-primary btn-block exgo"${exClosed('al') ? ' disabled' : ''}>Bakiyemle satın al</button>
    <button type="button" class="btn btn-block bx-dep" data-act="deposit" hidden>Bakiye yükle</button>`;
  return sheetWrap(`${esc(s.name)} · AL`, body, { cls: 'bx-sheet bx-al', id: 'bx-al', foot, form: 'data-form="exorder" novalidate', label: s.name + ' al' }); }
function bxSatSheet(x) { const s = bxSrv(x), unit = x.unit || 'adet', top = bxTop(x), p0 = top ? Math.min(+x.max, r2(top.price)) : +x.max;
  const body = `<section data-step="1" class="stack">
      <div class="bx-sh-h">${logo(s, 36)}<div>En fazla <b class="mono bx-sh-p">${TL(x.max)}</b> <span class="muted">/ ${esc(unit)}</span><div class="bx-s">${top ? 'Sıra başı <b class="mono">' + TL(top.price) + '</b>' : 'Henüz emir yok'}</div></div></div>
      ${exClosed('sat') ? `<div class="note note-bad"><b>Siteye satış emri verme şu an kapalı.</b> ${esc(S.set.exOffMsg || '')}</div>` : ''}
      ${bxQtyRow(unit, false).replace('__X__', esc(x.id)).replace('__D__', 'sat').replace('Kaç adet?', 'Kaç adet satıyorsun?')}
      <div class="fld"><label for="ex_price">Birim fiyatın (TL)</label><input class="inp mono" id="ex_price" type="number" inputmode="decimal" min="0.01" max="${esc(x.max)}" step="0.01" value="${p0}" required data-change="ex-calc" data-x="${esc(x.id)}" data-dir="sat"><span class="muted" style="font-size:12px">En fazla ${TL(x.max)}. Satılırsa birim başına bu tutar bakiyene geçer.</span></div>
      <div class="expos" id="ex_pos">${top ? `Şu an sıra başı ${TL(top.price)}. Ondan düşük fiyat verirsen ilk sıraya geçersin.` : 'Bu serverda henüz emir yok. En düşük fiyatlı emir önce eşlenir.'}</div>
      <details class="exq"><summary>Kuyruk sistemi</summary>Satışlar kuyruk sistemine göre işlenir; en düşük birim fiyatı veren satıcılar önceliklidir. Yang alıcıya teslim edildikçe, teslim edilen adet kadar tutar bakiyene geçer.</details></section>
    <section data-step="2" class="stack" hidden>
      <div class="note note-info bx-trust">Bilgilerin şifreli saklanır, yalnız yetkili operatör görür ve işlem bitince silinir.</div>
      <div class="exfields stack">${exFieldsHtml(null, 'exf_', S.exFields)}</div>
      <details class="exrules"><summary>Satış kuralları</summary><div class="rules">${String(S.exRules || '').split('\n').filter(Boolean).map(r => `<div>• ${esc(r)}</div>`).join('')}</div></details>
      <label class="chk" for="ex_ok"><input type="checkbox" id="ex_ok" required> Kuralları okudum, emrim eşlendiğinde hesabıma giriş yapılmasını onaylıyorum.</label></section>`;
  const foot = `<div class="extotal bx-tot" id="ex_sum"><div><span>Satılırsa bakiyene</span><small id="bx_sum">1 × ${TL(p0)} · emrini dilediğin an iptal edebilirsin</small></div><b class="mono" id="ex_tot">${TL(p0)}</b></div>
    <div data-foot="1"><button type="button" class="btn btn-ok btn-block" data-act="bx-step" data-s="2"${exClosed('sat') ? ' disabled' : ''}>Devam</button></div>
    <div data-foot="2" class="bx-f2" hidden><button type="button" class="btn" data-act="bx-step" data-s="1">‹ Geri</button><button class="btn btn-ok exgo"${exClosed('sat') ? ' disabled' : ''}>Satış emri ver</button></div>`;
  return sheetWrap(`${esc(s.name)} · SAT <small class="bx-stp" id="bx_stp">1/2</small>`, body, { cls: 'bx-sheet bx-sat', id: 'bx-sat', foot, form: 'data-form="exoffer" data-step="1" novalidate', label: s.name + ' siteye sat' }); }

/* ---------- yönlendirme: mobilde ızgara; masaüstü aynen ---------- */
{ const f = p4Exchange; p4Exchange = function () { if (!bxMob()) return f.apply(this, arguments);
    if (S.cur) p4MeEx(); const d = p4ExPub();
    if (!d && !S.exchange.length) return `<div class="wrap">${pLoading('Yang Borsası yükleniyor…')}</div>`;
    if (d && d.err) return `<div class="wrap">${p1Err(d)}</div>`;
    return bxView(); }; }

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="bxcss">
.bx-h{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:14px 0 10px}
.bx-h h1{font-size:26px;margin:0}.bx-h p{margin:2px 0 0;color:var(--muted);font-size:13px}.bx-h .chip{flex:0 0 auto;font-size:11.5px}
.bx-bar{display:flex;gap:8px;margin:10px 0 8px}.bx-bar .inp{height:42px}#bx_q{flex:1 1 auto;min-width:0}.bx-sort{flex:0 0 auto;width:auto;max-width:46%}
.bx-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:12px}.bx-chips::-webkit-scrollbar{display:none}
.bx-chip{flex:0 0 auto;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:7px 12px;font-weight:600;font-size:13px;min-height:36px;cursor:pointer}
.bx-chip b{color:var(--muted);font-weight:700;margin-left:2px}.bx-chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}.bx-chip.on b{color:inherit}
.bx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media (max-width:359px){.bx-grid{grid-template-columns:minmax(0,1fr)}}
.bx-card{display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden;min-width:0}
.bx-art{position:relative;height:112px;padding:10px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;overflow:hidden;background:linear-gradient(135deg,var(--c1),var(--c2))}
.bx-art::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.55));pointer-events:none}
.bx-art>*{position:relative;z-index:1}
.bx-wm{position:absolute!important;z-index:0!important;left:50%;top:44%;transform:translate(-50%,-50%) rotate(-8deg);font:900 38px/1 var(--f-display);letter-spacing:.04em;opacity:.13;white-space:nowrap}
.bx-sec{position:absolute!important;top:8px;left:8px;font:800 10.5px/1 var(--f-body);letter-spacing:.06em;background:rgba(0,0,0,.42);padding:4px 7px;border-radius:6px}
.bx-art .slogo{position:absolute!important;top:8px;right:8px;box-shadow:0 0 0 2px rgba(255,255,255,.35)}
.bx-nm{display:flex;flex-direction:column;min-width:0}.bx-nm b{font:800 17px/1.1 var(--f-display);text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bx-nm small{font-size:11px;opacity:.88;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bx-row{display:flex;align-items:center;gap:6px;width:100%;padding:9px 8px 9px 10px;border:0;border-top:1px solid var(--line);background:none;color:var(--fg);text-align:left;cursor:pointer;min-height:64px}
.bx-row:hover{background:var(--surface-2)}.bx-row:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}
.bx-row.sat{border-top-color:color-mix(in srgb,var(--accent) 45%,var(--line))}
.bx-row:disabled{cursor:not-allowed;opacity:.62}
.bx-rt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.bx-k{font:700 10.5px/1.2 var(--f-body);letter-spacing:.05em;color:var(--muted);text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bx-pl{display:flex;align-items:baseline;gap:4px;flex-wrap:wrap;min-width:0}
.bx-p{font:800 21px/1.15 var(--f-mono);font-variant-numeric:tabular-nums;letter-spacing:-.02em;white-space:nowrap}.bx-p.long{font-size:17px}
.bx-row.sat .bx-p{color:var(--accent)}.bx-row.al .bx-p{color:var(--ok)}
.bx-en{font-size:11px;color:var(--muted);font-weight:600}
.bx-s{font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bx-s b{color:var(--fg)}
.bx-s i{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--muted)}.bx-ok{color:var(--ok)}.bx-ok i{background:var(--ok)}.bx-no i{background:transparent;box-shadow:inset 0 0 0 1.5px var(--muted)}
.bx-b{flex:0 0 auto;display:grid;place-items:center;width:44px;height:44px;border-radius:12px}.bx-b svg{width:20px;height:20px}
.bx-row.sat .bx-b{background:var(--accent);color:var(--accent-ink)}.bx-row.al .bx-b{background:var(--ok);color:var(--on-solid)}
.bx-place{margin-top:14px;padding:12px;border:1px dashed var(--line);border-radius:12px;display:flex;flex-direction:column;gap:2px;font-size:13px}.bx-place span{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.bx-place small{color:var(--muted)}
.bx-mine{margin-top:18px}.bx-mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.bx-mh h2{font-size:18px;margin:0;text-transform:uppercase}.bx-mh a{font-weight:600;color:var(--accent-2)}
.bx-ml{margin-bottom:12px}.bx-ml .eyebrow{margin-bottom:6px}
.bx-ol{display:flex;flex-direction:column;gap:10px}
.bx-o,.bx-f{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.bx-oh{display:flex;align-items:center;gap:8px;min-width:0}.bx-oh b{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bx-or{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px}
.bx-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;list-style:none;margin:0;padding:0;font-size:10.5px;color:var(--muted)}
.bx-steps li{position:relative;padding-top:8px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bx-steps li::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;border-radius:2px;background:var(--line)}
.bx-steps li.done::before{background:var(--ok)}.bx-steps li.cur::before{background:var(--accent)}.bx-steps li.cur{color:var(--fg);font-weight:700}.bx-steps.off li::before{background:var(--line)}
.bx-pg{display:flex;flex-direction:column;gap:4px;font-size:12px}
.bx-msg{font-size:12.5px;background:var(--warn-soft);border-radius:10px;padding:8px 10px}
.bx-note{font-size:12px}.bx-log summary{cursor:pointer;font-size:12.5px;color:var(--muted)}.bx-log .feed{margin-top:6px}
.bx-pulse{position:relative}.bx-pulse::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;margin-right:5px;vertical-align:1px;animation:bxp 1.4s ease-out infinite}
@keyframes bxp{0%{opacity:1}50%{opacity:.25}100%{opacity:1}}
@media (prefers-reduced-motion:reduce){.bx-pulse::before{animation:none}}
.bx-sheet .bx-sh-h{display:flex;align-items:center;gap:12px}.bx-sh-p{font-size:20px}
.bx-qty{display:grid;grid-template-columns:48px minmax(0,1fr) 48px;gap:8px}.bx-qty .btn{height:44px;font-size:20px;padding:0}.bx-qty .inp{height:44px;text-align:center;font-size:18px}
.bx-qc{display:flex;gap:6px;margin-top:6px}.bx-qc .bx-chip{min-width:48px}
.bx-tot{margin:0}.bx-f2{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px}
.bx-stp{font:600 12px var(--f-body);color:var(--muted);margin-left:6px;text-transform:none}
</style>`);
