/* ================== P4: Yang Borsası ve EP işleyicileri (yalnız --prod derlemesinde) ==================
   97p4-ex.js ekranlarının işleyicileri. Tüm istekler call() → apiUrl() ile /api/v1/index.php?r=<yol> adresine gider.
   Para işlemlerinde (alım siparişi, EP satın alma) Idempotency-Key form başına tek anahtardır (ağ hatasında aynı anahtarla tekrar).
   Yetki kontrolü burada yalnız kullanıcı dostu uyarı içindir; asıl kontrol sunucuda ([borsa], [borsa_ayar], [ep]).                */
const p4Fx = id => (S.exFieldsBuy || []).reduce((o, f) => { o[f.id] = v_(id + f.id); return o; }, {});
const p4After = (...keys) => { needDrop('ex:pub', 'me:ex', 'me:tx', 'adm:today', ...keys); closeConfirm(false); };
/** Operatör işlemi: yanıt sipariş ayrıntısıdır (sipariş + satış emirleri + üyeler) */
async function p4Op(id, act, body) {
  const j = await call('POST', 'admin/ex/orders/' + p4enc(id) + '/' + act, body || {}, { silent: true });
  p4AdmUp(j.data); ui.reveal = false;
  API.cache['adm:ex:o:' + id] = { v: { v: j.data.order.v, b: (j.data.offers || []).map(o => o.id + ':' + o.left).join(',') }, t: Date.now() };
  needDrop('adm:ex:list', 'adm:ex:of', 'adm:today', 'ex:pub'); if (j.msg) toast(j.msg); render(); return j; }
const p4OpA = (k, act, body) => p2A(k, (d) => p4Op(d.id, act, body ? body(d) : {}), 'borsa');
const p4OpF = (k, act, body) => p2F(k, (f) => p4Op(f.dataset.id, act, body(f)), 'borsa');
/** üye işlemi (yetki tablosuna bakılmaz; sahiplik sunucuda denetlenir) */
const p4M = (k, fn) => { ACT[k] = (d, e) => { const el = e && e.target && e.target.closest ? e.target.closest('[data-act]') : null; return apiBusy(el, fn(d, e)); }; };
/** gizli değerleri bellekten siler (yeniden maskeler) */
function p4Mask(id) { const o = S.exOrders.find(x => x.id === id); const sec = (S.exFields || []).filter(f => f.secret).map(f => f.id);
  (o ? o.fills || [] : []).forEach(fl => { const of = S.exOffers.find(z => z.id === fl.of); if (of && of.f) sec.forEach(k => { if (of.f[k]) of.f[k] = '••••••'; }); }); }

/* ================= üye: Yang Borsası ================= */
/* alım siparişi ve satış emri (AL / SAT pencereleri): 98x-borsa-kart.js BXD.al / BXD.sat (aynı uçlar, form başına tek Idempotency-Key) */
p4M('of-cancel', async (d) => { const j = await call('POST', 'exchange/offers/' + p4enc(d.id) + '/cancel', {}, { silent: true }); p4Up('exOffers', [j.data.offer]); p4After('adm:ex'); toast(j.msg || 'Emir iptal edildi.'); render(); });
FORM.exfix = (f) => apiBusy(f, (async () => { const o = S.exOrders.find(x => x.id === f.dataset.id); if (!o) return;
  const v = (exSet(o.dir) || []).reduce((a, z) => { const x = v_('fx_' + z.id); if (x) a[z.id] = x; return a; }, {});
  const j = await call('PUT', 'exchange/orders/' + p4enc(o.id) + '/fields', { f: v }, { silent: true });
  p4Up('exOrders', [j.data.order]); p4After(); closeModal(); toast(j.msg || 'Bilgiler güncellendi.'); render(); })());
p4M('ex-ready', async (d) => { const j = await call('POST', 'exchange/orders/' + p4enc(d.id) + '/ready', {}, { silent: true }); p4Up('exOrders', [j.data.order]); p4After(); toast(j.msg || 'Operatöre hazır olduğunuz bildirildi.'); render(); });

/* ================= üye: EP ================= */
FORM.epbuy = (f) => apiBusy(f, (async () => { const u = me(); if (!u) return mLogin();
  const j = await call('POST', 'ep/orders', { product: f.dataset.id }, { key: formKey(f), silent: true }); const o = j.data.order;
  if (j.data.epProducts) p4EpSet(j.data.epProducts); p4Up('epOrders', [o]); needDrop('me:ep', 'me:tx', 'ep:pub');
  closeModal(); renderHeader(); render(); mEpCode(o); })());

/* ================= operatör [borsa] ================= */
p4OpA('ex-claim', 'claim');
p4OpA('ex-done', 'done');
p4OpA('ex-cancel', 'cancel');
p4OpA('ex-match', 'match');
p4OpA('ex-unpair', 'unpair', d => ({ offer: d.of }));
p4OpA('ex-unpair-all', 'unpair-all');
p4OpA('ex-pair', 'pair', d => ({ offer: d.of, qty: v_('pq_' + d.of) }));
p4OpF('exst', 'deliver', () => ({ qty: v_('exdq') }));
p4OpF('exdq', 'deliver', f => ({ qty: v_('dq_' + f.dataset.id) }));
p4OpF('excall', 'call', () => ({ msg: v_('excall_msg').trim() }));
p4OpF('exinfo', 'info', () => ({ msg: v_('exinfo_msg').trim() }));
/* gizli hesap bilgileri: ayrı istek (sunucu her gösterimi audit'e yazar); gizleyince bellekten silinir */
p2A('reveal', async () => { const id = ui.exOpen; if (!id) return;
  if (ui.reveal) { p4Mask(id); ui.reveal = false; return render(); }
  const j = await call('GET', 'admin/ex/orders/' + p4enc(id) + '?reveal=1', null, {}); p4AdmUp(j.data); ui.reveal = true;
  API.cache['adm:ex:o:' + id] = { v: { v: j.data.order.v, b: (j.data.offers || []).map(o => o.id + ':' + o.left).join(',') }, t: Date.now() }; render(); }, 'borsa');
{ const f0 = ACT['ex-open']; ACT['ex-open'] = (d, e) => { if (ui.exOpen) p4Mask(ui.exOpen); ui.reveal = false; return f0(d, e); }; }
p2A('ex-power', async () => { const j = await call('POST', 'admin/ex/power', { on: !S.set.exOn }, { silent: true }); if (j.data && j.data.set) Object.assign(S.set, j.data.set);
  needDrop('adm:ex', 'ex:pub', 'me:ex', 'adm:today'); closeConfirm(false); toast(j.msg); render(); }, 'borsa');
p2A('ex-sw', async (d) => { const j = await call('PUT', 'admin/ex/switch', { k: d.k }, { silent: true }); toast(j.msg); render(); }, 'borsa');
p2F('exoffmsg', async () => { const j = await call('PUT', 'admin/ex/offmsg', { msg: v_('exoff_msg').trim() }, { silent: true }); toast(j.msg); render(); }, 'borsa');

/* ================= ayarlar [borsa_ayar] ================= */
const p4SetResp = j => { p4SetApply(j.data); API.cache['adm:ex:set'] = { v: j.data, t: Date.now() }; needDrop('ex:pub'); ui.admDirty = false; document.querySelectorAll('form[data-dirty]').forEach(x => delete x.dataset.dirty); if (j.msg) toast(j.msg); render(); };
p2F('exrates', async () => { const L = S.exchange.filter(x => $('#xr_on_' + x.id)).map(x => ({ id: x.id, on: $('#xr_on_' + x.id).checked, server: v_('xr_s_' + x.id), unit: v_('xr_u_' + x.id).trim(), buy: p2Num(v_('xr_bp_' + x.id)), max: p2Num(v_('xr_mx_' + x.id)) }));
  p4SetResp(await call('PUT', 'admin/ex/markets', { place: v_('ex_pl').trim(), markets: L }, { silent: true })); }, 'borsa_ayar');
p2F('xradd', async () => { const id = v_('xa_srv'); if (!srv(id)) return toast('Önce server seçin.', true); p4SetResp(await call('POST', 'admin/ex/markets', { server: id }, { silent: true })); }, 'borsa_ayar');
p2A('xr-add', async () => p4SetResp(await call('POST', 'admin/ex/markets', {}, { silent: true })), 'borsa_ayar');
p2A('xr-del', async (d) => p4SetResp(await call('DELETE', 'admin/ex/markets/' + p4enc(d.id), null, { silent: true })), 'borsa_ayar');
p2F('exfields', async (f) => { const k = f.dataset.set; const L = (S[k] || []).map((x, i) => ({ id: x.id, label: v_(k + '_l_' + i).trim(), type: v_(k + '_t_' + i), opts: v_(k + '_o_' + i).trim(), note: v_(k + '_n_' + i).trim(), req: !!($('#' + k + '_r_' + i) || {}).checked, secret: !!($('#' + k + '_s_' + i) || {}).checked }));
  const b = { fields: L }; if (k === 'exFields' && $('#ex_rules')) b.rules = $('#ex_rules').value;
  p4SetResp(await call('PUT', 'admin/ex/fields/' + p4enc(k), b, { silent: true })); }, 'borsa_ayar');
p2A('ef-add', async (d) => p4SetResp(await call('POST', 'admin/ex/fields/' + p4enc(d.set), {}, { silent: true })), 'borsa_ayar');
p2A('ef-del', async (d) => { const x = (S[d.set] || [])[+d.i]; if (x) p4SetResp(await call('DELETE', 'admin/ex/fields/' + p4enc(d.set) + '/' + p4enc(x.id), null, { silent: true })); }, 'borsa_ayar');
p2A('ef-up', async (d) => { const x = (S[d.set] || [])[+d.i]; if (x && +d.i > 0) p4SetResp(await call('POST', 'admin/ex/fields/' + p4enc(d.set) + '/' + p4enc(x.id) + '/up', {}, { silent: true })); }, 'borsa_ayar');
p2F('p4notify', async () => { const K = ['borsa', 'call', 'ep_code', 'borsa_off']; const pick = p => K.reduce((o, k) => { const el = $('#p4n_' + p + '_' + k); if (el) o[k] = el.checked; return o; }, {});
  const j = await call('PUT', 'admin/ex/notify', { mail: pick('m'), sms: pick('s') }, { silent: true }); const c = API.cache['adm:ex:set']; if (c && c.v) c.v.notify = j.data.notify; ui.admDirty = false; toast(j.msg); render(); }, 'borsa_ayar');

/* ================= EP mağazası [ep] ================= */
const p4EpResp = j => { p4EpSet(j.data.epProducts); if (j.data.hh) S.set.hh = j.data.hh; API.cache['adm:ep:p'] = { v: { p: Date.now() }, t: Date.now() }; needDrop('ep:pub', 'adm:today'); ui.admDirty = false;
  document.querySelectorAll('form[data-dirty]').forEach(x => delete x.dataset.dirty); closeConfirm(false); if (j.msg) toast(j.msg); render(); };
p2F('epadd', async () => { const g = v_('en_g'); ui.epSrv = g && srv(g) ? g : null;
  p4EpResp(await call('POST', 'admin/ep/products', { srv: ui.epSrv, ep: v_('en_e'), price: p2Num(v_('en_p')), codes: ($('#en_c') || {}).value || '' }, { silent: true })); }, 'ep');
p2F('epprod', async (f) => { const id = f.dataset.id; const g = v_('ep_g_' + id); ui.epSrv = g && srv(g) ? g : null;
  p4EpResp(await call('PUT', 'admin/ep/products/' + p4enc(id), { srv: ui.epSrv, ep: v_('ep_e_' + id), price: p2Num(v_('ep_p_' + id)), hh: !!($('#ep_h_' + id) || {}).checked, v: v_('ep_v_' + id), codes: ($('#ep_c_' + id) || {}).value || '' }, { silent: true })); }, 'ep');
p2A('ep-toggle', async (d) => p4EpResp(await call('POST', 'admin/ep/products/' + p4enc(d.id) + '/toggle', {}, { silent: true })), 'ep');
p2A('ep-del', async (d) => p4EpResp(await call('DELETE', 'admin/ep/products/' + p4enc(d.id), null, { silent: true })), 'ep');
p2A('ep-cdel', async (d) => { const p = S.epProducts.find(x => x.id === d.id); const cid = p && p.codeIds ? p.codeIds[+d.i] : null; if (!cid) return; ui.epSrv = p.srv || null;
  p4EpResp(await call('DELETE', 'admin/ep/codes/' + p4enc(cid), null, { silent: true })); }, 'ep');
p2F('hhset', async () => { const u = v_('hh_u'); const b = { on: !!($('#hh_on') || {}).checked, pct: v_('hh_p'), until: u ? new Date(u).getTime() : null };
  const j = await call('PUT', 'admin/settings/hh', b, { silent: true }); S.set.hh = j.data.hh; needDrop('ep:pub', 'adm:ep'); ui.admDirty = false; document.querySelectorAll('form[data-dirty]').forEach(x => delete x.dataset.dirty); toast(j.msg); render(); }, 'ep');
p2A('p4-epcode', async (d) => { const j = await call('GET', 'admin/ep/orders/' + p4enc(d.id) + '/code', null, {}); const el = $('#p4c_' + d.id); if (el) el.textContent = j.data.code; }, 'ep');

/* ================= yoklama: borsa durum değişiklikleri ekrana ================= */
function p4OnPoll(d) { if (!d) return; let ch = false;
  if (d.exSig != null) { if (P4.sig !== null && P4.sig !== d.exSig) { needDrop('ex:pub', 'me:ex'); ch = true; } P4.sig = d.exSig; }
  if (d.exStaff) { if (P4.ssig !== null && P4.ssig !== d.exStaff.v) { needDrop('adm:ex'); ch = true; } P4.ssig = d.exStaff.v; p2QSet('borsa', d.exStaff.open); }
  if (!ch) return; const r = route();
  if ((r === 'borsa' || r === 'hesabim' || (isAdmRoute(r) && /borsa/.test(r))) && !p2Busy()) setTimeout(() => { if (!p2Busy()) render(); }, 0); }
{ const c0 = call; call = async function (m, p) { const j = await c0.apply(this, arguments); if (m === 'GET' && /^poll\?/.test(String(p))) { try { p4OnPoll(j.data); } catch (e) { } } return j; }; }
