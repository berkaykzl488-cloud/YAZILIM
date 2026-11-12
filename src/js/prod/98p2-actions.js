/* ================== P2: para işleyicileri (yalnız --prod derlemesinde) ==================
   97p2-money.js ekranlarının işleyicileri. Yetki kontrolü burada yeniden uygulanır (asıl kontrol sunucuda). Tüm istekler
   call() → apiUrl() ile /api/v1/index.php?r=<yol> adresine gider; para işlemlerinde Idempotency-Key gönderilir (form başına
   tek anahtar: ağ hatasında aynı anahtarla tekrar). Dosyalar (dekont, teslim kanıtı, itiraz görseli) önce POST media ile
   yüklenir, istekte yalnız medya kimlikleri gider. Eski api/paytr_token.php çağrılmaz: kart ödemesi POST deposits/paytr. */
/* Bu dosya yalnız --prod derlemesinde yüklenir; tanımlar üst düzeyde. */
const p2A = (k, fn, perm) => { ACT[k] = (d, e) => { const p = perm || ADM_ACT[k]; if (p && !admOk(p)) return toast('Bu işlem için yetkiniz yok.', true); const el = e && e.target && e.target.closest ? e.target.closest('[data-act]') : null; return apiBusy(el, fn(d, e, el)); }; };
const p2F = (k, fn, perm) => { FORM[k] = (f) => { const p = perm || ADM_FORM[k]; if (p && !admOk(p)) return toast('Bu işlem için yetkiniz yok.', true); return apiBusy(f, fn(f)); }; };
const p2enc = encodeURIComponent;
const p2Num = s => { const x = String(s == null ? '' : s).trim().replace(/\s/g, ''); return x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x; };
const p2Btn = e => e && e.target && e.target.closest ? e.target.closest('button,[data-act]') : null;
/** sipariş değişince: listeler ve rozetler yenilensin; sipariş kendisi yanıttaki patch ile güncellendi */
const p2After = id => { needDrop('me:ord', 'me:tx', 'adm:ord', 'adm:today', 'L'); if (id && API.cache['ord:' + id]) API.cache['ord:' + id].t = Date.now(); closeConfirm(false); render(); };
const p2SafeImg = u => /^(\/(?!\/)|https?:\/\/|[a-z0-9_]+\/)/i.test(String(u || '')) ? String(u) : '';

/* ---- bakiye yükleme ---- */
ACT.deposit = () => mDeposit();
ACT['p2-topup'] = (d) => { ui.depAmt = Math.max(p2DepMin(), +d.v || 0); closeModal(); pDeposit('eft'); };
ACT['p2-wd'] = () => toast('Para çekme çok yakında açılıyor. Çekilebilir bakiyeniz güvende; açıldığında bildirim alacaksınız.');
FORM.dep = (f) => apiBusy(f, (async () => {
  const u = me(); if (!u) return mLogin(); const g = p2DepGw();
  if (!g || !g.on) return toast(g && g.cat === 'kart' ? 'Kart ile ödeme yakında.' : 'Bu yöntem şu an kullanılamıyor.', true);
  const amount = +p2Num(v_('dep_amt')); if (!(amount >= p2DepMin())) return toast(`En az ${TL(p2DepMin())} yükleyebilirsiniz.`, true);
  const coupon = v_('dep_cp').trim().toUpperCase();
  if (g.manual) {
    const rc = p2Ids('rc'); if (rc === null) return;
    const b = { gw: g.id, amount, txAt: v_('dep_dt') }; if (coupon) b.coupon = coupon;
    if (!b.txAt) return toast('Dekonttaki işlem tarihini ve saatini girin.', true);
    if (g.id === 'kripto') { b.net = (document.querySelector('input[name=cnet]:checked') || {}).value || ''; b.txid = v_('dep_note').trim(); if (b.txid.length < 8) return toast('İşlem kodunu (TxID) eksiksiz girin.', true); }
    else { b.toBank = v_('dep_to'); b.note = v_('dep_note').trim(); }
    if (rc.length) b.receipt = rc[0];
    const j = await call('POST', 'deposits/manual', b, { key: formKey(f), silent: true }); const d = j.data.deposit;
    p1Up(S.deps, [d]); p2UpReset('rc'); needDrop('me:dep', 'me:tx'); ui.depAmt = null;
    modal(mWrap('Bildiriminiz alındı', `<div class="stack"><div class="note note-ok p2ok"><b>${esc(j.msg || 'Bildiriminiz alındı. Onaylanınca bakiyenize eklenecek.')}</b></div>
      <div class="sum"><div><span>Tutar</span><b class="mono">${TL(d.amount)}</b></div>${d.bonus ? `<div><span class="muted">Kupon bonusu (${esc(d.coupon || '')})</span><span class="mono pos">+${TL(d.bonus)}</span></div>` : ''}<div><span class="muted">Yöntem</span><span>${esc(p2Gw(d.gw).n)}${d.toBank ? ' · ' + esc(d.toBank) : ''}</span></div><div><span class="muted">Bakiye türü</span><span>${d.w ? 'Çekilebilir' : 'Yalnız alışveriş'}</span></div><div><span class="muted">Durum</span>${p2DPill(d.status)}</div></div>
      <div class="muted" style="font-size:12.5px">Ekibimiz ödemenizi kontrol edip onayladığında bakiyeniz otomatik güncellenir ve bildirim alırsınız. Durumu Hesabım › Bakiye hareketleri bölümünden izleyebilirsiniz.</div>
      <div class="hstack"><button type="button" class="btn btn-primary" data-act="close">Tamam</button><a class="btn" href="#hesabim" data-act="tab" data-t="hareket">Bakiye hareketleri</a></div></div>`));
    if (route() === 'hesabim') render();
    return;
  }
  const b = { gw: g.id, amount }; if (coupon) b.coupon = coupon; if (g.id === 'paytr_eft') b.bank = v_('dep_bank');
  const j = await call('POST', 'deposits/paytr', b, { key: formKey(f), silent: true }); const x = j.data || {}; const src = /^https:\/\//.test(x.iframe || '') ? x.iframe : '';
  if (!src) return toast('Ödeme ekranı açılamadı. Lütfen tekrar deneyin.', true);
  modal(`<div class="md dep" role="dialog" aria-label="Ödeme"><div class="md-h"><h3>${x.tip === 'eft' ? 'PayTR Havale/EFT' : 'Kart ile öde'}</h3><button class="md-x" data-act="close" aria-label="Kapat">×</button></div><div class="md-b">${x.testMode ? '<div class="note note-warn">Test modu: gerçek para çekilmez.</div>' : ''}<iframe src="${esc(src)}" id="paytriframe" title="PayTR ödeme" style="width:100%;min-height:560px;border:0"></iframe><span class="muted" style="font-size:12px">Ödeme tamamlanınca bakiyeniz otomatik yüklenir.</span></div></div>`);
  const oid = x.oid; let n = 0;
  const tick = () => { if (!$('#paytriframe') || ++n > 120) return; call('GET', 'deposits/' + p2enc(oid), null, { quiet: true }).then(r => { if (r.data && r.data.done) { closeModal(); const d = r.data.deposit; toast(d.status === 'onaylandı' ? TL(d.amount + (d.bonus || 0)) + ' bakiyenize yüklendi.' : 'Ödeme tamamlanmadı.', d.status !== 'onaylandı'); renderHeader(); needDrop('me:dep', 'me:tx'); if (route() === 'hesabim') render(); } else setTimeout(tick, 5000); }, () => setTimeout(tick, 8000)); };
  setTimeout(tick, 5000);
})());

/* ---- dosya yükleme alanı ---- */
CHG.p2up = (el) => { const p = el.dataset.p, kind = el.dataset.kind || 'proof', max = +el.dataset.max || 1; const L = P2.up[p] = P2.up[p] || []; const fs = [...(el.files || [])]; el.value = '';
  const room = max - L.length; if (fs.length > room) toast(`En fazla ${max} dosya ekleyebilirsiniz.`, true);
  fs.slice(0, Math.max(0, room)).forEach(f => { const vid = /^video\//.test(f.type);
    if (vid && f.size > 60 * 1048576) return toast('Video en fazla 60 MB olabilir.', true);
    if (!vid && !/^image\//.test(f.type)) return toast('Yalnız görsel dosyası (JPG, PNG, WEBP) yükleyebilirsiniz.', true);
    const it = { k: ++P2.uk, url: vid ? '' : URL.createObjectURL(f), st: 'up', pct: 0, name: f.name, file: f, vid }; L.push(it);
    P2.q = (P2.q || Promise.resolve()).then(() => p2UpOne(p, it, kind)); });
  p2UpRefresh(p); };
ACT['p2u-del'] = (d) => { const L = P2.up[d.p] || []; const i = L.findIndex(x => String(x.k) === String(d.k)); if (i < 0) return; const [x] = L.splice(i, 1);
  if (x.xhr) try { x.xhr.abort(); } catch (e) { } if (x.url && /^blob:/.test(x.url)) try { URL.revokeObjectURL(x.url); } catch (e) { } p2UpRefresh(d.p); };
ACT['p2-img'] = (d) => { const u = p2SafeImg(d.u); if (!u) return; modal(mWrap(d.t || 'Görsel', `<img class="p2big" src="${esc(u)}" alt="${esc(d.t || 'Görsel')}"><div class="hstack"><a class="btn btn-sm" href="${esc(u)}" target="_blank" rel="noopener">Yeni sekmede aç ↗</a></div>`)); };

/* ---- satın alma ---- */
ACT.buy = (d) => pBuy(d.id);
// pencere yeniden çizilirken odaktaki alan kaldırılınca tarayıcı yeniden "change" gönderebilir: çizim olay dışında, tek sefer
CHG.p2bq = (el) => { const id = el.dataset.id, v = el.value; clearTimeout(P2.bqT); P2.bqT = setTimeout(() => { const cur = $('#b_qty'); if (!cur || String(+cur.value) === String(+v) && +$('form[data-form=p2buy]')?.dataset.q === +v) return;
    const keep = {}; ['b_info', 'b_ch', 'b_place'].forEach(k => { const i = $('#' + k); if (i) keep[k] = i.value; }); pBuy(id, v, keep); const q = $('#b_qty'); if (q) q.focus(); }, 0); };
FORM.p2buy = (f) => apiBusy(f, (async () => {
  const id = f.dataset.id, q = +f.dataset.q || 1; const b = { listing: id, qty: q, info: v_('b_info').trim() };
  if ($('#b_ch')) b.ch = v_('b_ch'); if ($('#b_place')) b.place = v_('b_place');
  let j; try { j = await call('POST', 'orders', b, { key: formKey(f) }); }
  catch (e) { if (e && (e.code === 'insufficient' || e.code === 'sold_out')) { needDrop('lst:' + id); setTimeout(() => { if (e.code === 'insufficient') pBuy(id, q); else { closeModal(); render(); } }, 50); } return; }
  const o = j.data.order; p2UpO([o]); (j.data.users || []).forEach(apiUpsertUser); P2.fresh[o.id] = 1;
  API.cache['ord:' + o.id] = { v: { id: o.id, up: o.up, st: o.status, n: 0 }, t: Date.now() };
  needDrop('me:ord', 'me:tx', 'L', 'lst'); closeModal(); go('siparis-' + o.id);
})());

/* ---- sipariş işlemleri ---- */
p2A('o-ready', async (d) => { await call('POST', 'orders/' + p2enc(d.id) + '/ready'); p2After(d.id); });
FORM.p2deliver = (f) => apiBusy(f, (async () => {
  const id = f.dataset.id; const pre = p2Ids('dpre'), post = p2Ids('dpost'), vid = p2Ids('dvid'); if (!pre || !post || !vid) return;
  if (!pre.length || !post.length) return toast('Teslimat öncesi ve sonrası görsellerini yüklemeden “Teslim ettim” diyemezsiniz.', true);
  const b = { dpre: pre, dpost: post, note: v_('dnote').trim() }; if (vid.length) b.dvid = vid[0];
  await call('POST', 'orders/' + p2enc(id) + '/deliver', b, { key: formKey(f) }); p2UpReset('dpre', 'dpost', 'dvid'); P2.upFor = null; p2After(id);
})());
const p2Ask = (el, o, run) => openConfirm(Object.assign({}, o, { onOk: () => apiBusy(el, run()) }));
ACT.confirm = (d, e) => { const o = ord(d.id); if (!o) return; const el = p2Btn(e);
  p2Ask(el, { t: 'Ürünü teslim aldınız mı?', d: `Onaylarsanız <b>${TL(o.total)}</b> havuzdan satıcıya aktarılır ve sipariş kapanır. Bu işlem geri alınamaz; ürünü almadıysanız onaylamayın, itiraz edin.`, ok: 'Evet, ürünü aldım' },
    async () => { await call('POST', 'orders/' + p2enc(d.id) + '/confirm', { stars: pickedStar }); p2After(d.id); }); };
ACT.guarantee = (d, e) => { const o = ord(d.id); if (!o) return; const el = p2Btn(e);
  p2Ask(el, { t: 'Sipariş iptal edilsin mi?', d: `Satıcı teslim süresi içinde teslim etmedi. <b>${TL(o.total)}</b> hemen bakiyenize iade edilir ve sipariş kapanır.`, ok: 'İptal et ve iade al', danger: 1 },
    async () => { await call('POST', 'orders/' + p2enc(d.id) + '/guarantee'); p2After(d.id); }); };
ACT.dispute = (d) => { if (!me()) return mLogin(); pDispute(d.id); };
FORM.p2disp = (f) => apiBusy(f, (async () => {
  const id = f.dataset.id; const media = p2Ids('dsp'); if (media === null) return; const x = v_('dp_d').trim(); if ([...x].length < 3) return toast('Ne olduğunu kısaca anlatın.', true);
  await call('POST', 'orders/' + p2enc(id) + '/dispute', { r: v_('dp_r'), d: x, media }, { key: formKey(f) }); p2UpReset('dsp'); closeModal(); p2After(id);
})());
ACT.resolve = (d, e) => { if (!can('siparis')) return toast('Bu işlem için yetkiniz yok.', true); const o = ord(d.id); if (!o) return; const el = p2Btn(e); const B_ = user(o.buyer), Sl = user(o.seller);
  const fee = o.fee != null ? o.fee : r2(o.total * o.rate / 100), net = o.net != null ? o.net : r2(o.total - fee);
  p2Ask(el, d.to === 'buyer' ? { t: 'Alıcıya iade edilsin mi?', d: `<b>${TL(o.total)}</b> havuzdan ${esc(B_.name)} bakiyesine iade edilir, sipariş kapanır. İki tarafa bildirim gider.`, ok: 'İade et', danger: 1 }
    : { t: 'Ödeme satıcıya aktarılsın mı?', d: `${esc(Sl.name)} hesabına <b>${TL(net)}</b> (komisyon ${TL(fee)} düşülerek) aktarılır, sipariş tamamlanır. İki tarafa bildirim gider.`, ok: 'Ödemeyi aktar' },
    async () => { await call('POST', 'admin/orders/' + p2enc(d.id) + '/resolve', { to: d.to === 'buyer' ? 'buyer' : 'seller' }); p2After(d.id); }); };
FORM.p2chat = (f) => apiBusy(f, (async () => { const x = v_('omsg').trim(); if (!x) return; const id = f.dataset.id;
  await call('POST', 'orders/' + p2enc(id) + '/messages', { x }); p2After(id); setTimeout(() => { const i = $('#omsg'); if (i) i.focus(); }, 0); })());

/* ---- Hesabım ---- */
ACT['p2-omore'] = (d, e) => { const c = API.cache['me:ord:' + d.r]; const v = c && c.v; if (!v || !v.next) return;
  return apiBusy(p2Btn(e), call('GET', 'me/orders?role=' + p2enc(d.r) + '&after=' + p2enc(v.next) + '&limit=50', null).then(j => { const x = j.data || {}; p2UpO(x.orders); p1UpU(x.users); (x.orders || []).forEach(o => { if (!v.ids.includes(o.id)) v.ids.push(o.id); }); v.next = x.next || null; render(); })); };
ACT['p2-txmore'] = (d, e) => { const c = API.cache['me:tx']; const v = c && c.v; if (!v || !v.next) return;
  return apiBusy(p2Btn(e), call('GET', 'me/tx?after=' + p2enc(v.next) + '&limit=50', null).then(j => { const x = j.data || {}; v.tx = v.tx.concat(x.tx || []); v.next = x.next || null; render(); })); };
FORM.pts = (f) => apiBusy(f, (async () => { const p = Math.floor((+v_('pt_amt') || 0) / 100) * 100; const u = me();
  if (p < 500) return toast('En az 500 puan çevrilebilir.', true); if (u && p > (u.pts || 0)) return toast('Yeterli puanınız yok.', true);
  await call('POST', 'me/points/convert', { pts: p }, { key: formKey(f) }); needDrop('me:tx'); render(); })());

/* ---- dopingler ---- */
ACT['p2-dopm'] = (d) => { if (!me()) return mLogin(); pDopeModal(d.id); };
ACT.dope = (d, e) => { const u = me(); if (!u) return mLogin(); const l = lst(d.id), dp = (S.dopings || {})[d.k]; if (!l || !dp) return;
  if (l.seller !== u.id) return toast('Doping yalnız ilan sahibine açıktır.', true);
  const days = Math.max(1, +(($('#dg_' + l.id + '_' + d.k) || {}).value || 1)); const cost = dopCost(d.k, days);
  if (avail(u) < cost) { toast(`Bakiyeniz yetersiz: ${TL(cost)} gerekiyor, bakiyeniz ${TL(avail(u))}.`, true); ui.depAmt = Math.max(p2DepMin(), Math.ceil(cost - avail(u))); return pDeposit('eft'); }
  const el = p2Btn(e); const inModal = !!(el && el.closest('#modal'));
  p2Ask(el, { t: dp.name + ' dopingi alınsın mı?', d: `“${esc(l.title)}” ilanına <b>${days} gün ${esc(dp.name)}</b>${on(l, d.k) ? ' (mevcut süreye eklenir)' : ''}. <b>${TL(cost)}</b> bakiyenizden düşülecek.`, ok: 'Doping al' },
    async () => { await call('POST', 'listings/' + p2enc(l.id) + '/dope', { k: d.k, days }); needDrop('L', 'me:tx', 'me:lst'); if (inModal && $('.mb')) pDopeModal(l.id); render(); }); };

/* ---- Yönetim › Ödemeler ---- */
CFM['dep-no'] = () => null; // gerekçe penceresi aşağıda
p2A('dep-ok', async (d) => { await call('POST', 'admin/deposits/' + p2enc(d.id) + '/approve'); needDrop('adm:dep', 'adm:today'); render(); });
p2A('dep-no', async (d) => { const x = S.deps.find(y => y.id === d.id) || {};
  modal(mWrap('Yükleme reddedilsin mi?', `<form class="stack" data-form="p2depno" data-id="${esc(d.id)}"><div class="muted" style="font-size:13px"><b>${TL(x.amount || 0)}</b> · ${esc(user(x.u).name)} bildirimi reddedilir. Üyeye bildirim gider; kupon kullandıysa serbest kalır.</div>
    <div class="fld"><label for="dn_r">Red gerekçesi (üye görür)</label><select class="inp" id="dn_r">${['Ödeme hesabımıza ulaşmadı', 'Tutar eşleşmedi', 'Gönderen adı üyeyle eşleşmedi', 'Dekont okunamadı', 'Yanlış ağdan gönderildi', 'Diğer'].map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
    <div class="fld"><label for="dn_x">Ek açıklama (isteğe bağlı)</label><input class="inp" id="dn_x" maxlength="180" autocomplete="off"></div><button class="btn btn-bad">Reddet</button></form>`)); });
p2F('p2depno', async (f) => { const r = [v_('dn_r'), v_('dn_x').trim()].filter(Boolean).join(': ');
  await call('POST', 'admin/deposits/' + p2enc(f.dataset.id) + '/reject', { reason: r }, { key: formKey(f) }); closeModal(); needDrop('adm:dep', 'adm:today'); render(); }, 'odeme');
p2F('gws', async (f) => { const L = (S.admGws || S.gws || []).filter(g => $('#gw_fee_' + g.id)).map(g => ({ id: g.id, fee: +p2Num(v_('gw_fee_' + g.id)) || 0 }));
  await call('PUT', 'admin/gateways', { gws: L }, { key: formKey(f) }); needDrop('adm:gws'); admDirtyClear(); render(); });
p2A('gw-toggle', async (d) => { await call('POST', 'admin/gateways/' + p2enc(d.id) + '/toggle'); needDrop('adm:gws'); render(); });
p2F('bank', async (f) => { await call('POST', 'admin/banks', { b: v_('bk_b').trim(), n: v_('bk_n').trim(), i: v_('bk_i').trim() }, { key: formKey(f) }); admDirtyClear(); render(); });
p2A('bank-del', async (d) => { await call('DELETE', 'admin/banks/' + p2enc(d.id)); render(); });
p2F('cnetadd', async (f) => { await call('POST', 'admin/crypto-nets', { coin: v_('cna_c').trim(), net: v_('cna_n').trim(), addr: v_('cna_a').trim(), note: v_('cna_t').trim() }, { key: formKey(f) }); admDirtyClear(); render(); });
p2F('cnetsave', async (f) => { const id = f.dataset.id; await call('PUT', 'admin/crypto-nets/' + p2enc(id), { coin: v_('cn_c_' + id).trim(), net: v_('cn_n_' + id).trim(), addr: v_('cn_a_' + id).trim(), note: v_('cn_t_' + id).trim() }, { key: formKey(f) }); admDirtyClear(); render(); });
p2A('cnet-toggle', async (d) => { await call('POST', 'admin/crypto-nets/' + p2enc(d.id) + '/toggle'); render(); });
p2A('cnet-del', async (d) => { await call('DELETE', 'admin/crypto-nets/' + p2enc(d.id)); render(); });

/* ---- Yönetim › Kuponlar, bakiye düzeltme, doping fiyatları ---- */
p2F('coupon', async (f) => { await call('POST', 'admin/coupons', { code: v_('cp_c').trim().toUpperCase(), pct: +p2Num(v_('cp_p')) || 0, max: p2Num(v_('cp_m')) }, { key: formKey(f) }); admDirtyClear(); render(); });
p2A('cp-toggle', async (d) => { await call('POST', 'admin/coupons/' + p2enc(d.id) + '/toggle'); render(); });
p2A('cp-del', async (d) => { await call('DELETE', 'admin/coupons/' + p2enc(d.id)); render(); });
p2F('baladd', async (f) => { const note = v_('ba_n').trim(); if ([...note].length < 3) return toast('Gerekçe yazın (en az 3 karakter).', true);
  const j = await call('POST', 'admin/balance', { user: v_('ba_q').trim(), amount: p2Num(v_('ba_a')), w: v_('ba_t') === 'w', neg: v_('ba_d') === '-', note }, { key: formKey(f) });
  if (j.data && j.data.user) apiUpsertUser(j.data.user); needDrop('adm:ledger', 'adm:users'); admDirtyClear(); render(); });
p2F('dopset', async (f) => { const D = {}; Object.keys(S.dopings || {}).forEach(k => { if (!$('#dps_p_' + k)) return; D[k] = { desc: v_('dps_d_' + k).trim(), p: +p2Num(v_('dps_p_' + k)) || 0, max: +v_('dps_m_' + k) || 30 }; });
  await call('PUT', 'admin/dopings', { dopings: D }, { key: formKey(f) }); admDirtyClear(); render(); });
