/* ================== P3: para çekme / TC / e-Gider / muhasebe / Entegrasyonlar işleyicileri (yalnız --prod derlemesinde) ==================
   Asıl kontroller sunucuda (yetki, Idempotency-Key, satır kilidi, çekilebilir bakiye, IBAN adı, tek belge numarası). Burada yalnız
   form okuma, kullanıcıya hızlı geri bildirim ve API çağrısı (call → apiUrl → /api/v1/index.php?r=…).                          */
const p3Num = s => { const x = String(s == null ? '' : s).trim().replace(/\s/g, ''); return x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x; };
const p3Drop = () => needDrop('adm:wd', 'adm:today', 'adm:acct', 'adm:rep', 'adm:repm', 'adm:ledger');
const p3Err = (id, j) => { const e = $('#' + id); if (e) e.textContent = apiErr(j); };

/* ---- üye: kimlik doğrulama (NVİ sunucuda) ---- */
FORM.tcf = (f) => apiBusy(f, (async () => { const u = me(); if (!u) return;
  const tc = v_('tc_no').replace(/\D/g, ''), dt = v_('tc_dt');
  if (!fullName(u).includes(' ') && !(u.ad && u.soyad)) return toast('Önce profilinizde adınızı ve soyadınızı kimliğinizdeki gibi girin.', true);
  if (!tcValid(tc)) return toast('TC kimlik numarası geçersiz. 11 haneyi kontrol edin.', true);
  if (!dt) return toast('Doğum tarihinizi seçin.', true);
  const b = $('#tcBtn'); if (b) b.innerHTML = '<span class="spin"></span> Nüfus kayıtlarıyla eşleştiriliyor…';
  try { const j = await call('POST', 'me/tc/verify', { tc, dt }, { key: formKey(f) }); closeModal(); needDrop('me:wd');
    if (j.data && j.data.state === 'inceleme') modal(mWrap('Kimlik doğrulama', `<div class="note note-info">${esc(j.msg || '')}</div><button class="btn btn-primary" data-act="close">Tamam</button>`));
    render(); }
  catch (e) { delete f.dataset.ikey; if (b && b.isConnected) b.textContent = 'Tekrar dene'; if (e && e.code === 'tc_locked') { closeModal(); render(); } } })());
FORM.tcconf = (f) => apiBusy(f, (async () => { const tc = v_('tcc_no').replace(/\D/g, '');
  try { await call('POST', 'me/tc/confirm', { tc }, { key: formKey(f) }); needDrop('me:wd'); render(); }
  catch (e) { delete f.dataset.ikey; p3Err('tcc_err', e); } })());

/* ---- üye: çekim talebi ---- */
FORM.withdraw = (f) => apiBusy(f, (async () => { const u = me(); if (!u) return mLogin();
  const a = r2(+p3Num(v_('w_amt')));
  if (!(a > 0)) return toast('Çekmek istediğiniz tutarı yazın.', true);
  if (a < +S.set.minWithdraw) return toast('En az ' + TL(S.set.minWithdraw) + ' çekebilirsiniz.', true);
  if (a > +u.bal) return toast(`Çekilebilir bakiyeniz ${TL(u.bal)}. Kart, mobil ödeme ve cüzdanla yüklenen bakiye ile bonuslar çekilemez, sadece alışverişte kullanılır.`, true);
  const sel = (document.querySelector('input[name=wiban]:checked') || {}).value; const body = { amount: a };
  if (sel && sel !== '_new') body.iban = sel;
  else { const ib = v_('w_iban').replace(/\s/g, '').toUpperCase(); if (!/^TR\d{24}$/.test(ib)) return toast('IBAN TR ile başlamalı ve 26 karakter olmalı.', true);
    const nm = v_('w_name').trim(); if (!nm) return toast('Hesap sahibinin adını yazın.', true);
    if (fullName(u) && nm.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ') !== fullName(u).toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')) return toast(`IBAN hesap sahibi üyelik bilgilerinizdeki ad soyadla (${fullName(u)}) aynı olmalı.`, true);
    Object.assign(body, { iban: ib, bank: v_('w_bank'), name: nm, save: !!($('#w_save') && $('#w_save').checked) }); }
  if (wdBreakdown(a, true).net <= 0) return toast('Tutar işlem ücreti ve kesintilerden büyük olmalı.', true);
  try { await call('POST', 'withdrawals', body, { key: formKey(f) }); delete f.dataset.ikey; needDrop('me:wd', 'me:tx'); render(); }
  catch (e) { if (e && e.http && e.http < 500 && e.code !== 'idem_busy') delete f.dataset.ikey; if (e && /^tc_/.test(e.code || '')) { needDrop('me:wd'); apiReboot(true).then(render, () => { }); } } })());
ACT['p2-wd'] = () => { ui.tab = 'cek'; if (route() !== 'hesabim') go('hesabim'); else render(); };

/* ---- yönetim: onay / red ---- */
p2A('wd-ok', async (d) => { await call('POST', 'admin/withdrawals/' + p3enc(d.id) + '/approve', {}); p3Drop(); closeConfirm(false); render(); });
p2A('wd-no', async (d) => { const w = cfmW(d.id);
  modal(mWrap('Çekim talebi reddedilsin mi?', `<form class="stack" data-form="p3wdno" data-id="${esc(d.id)}"><div class="muted" style="font-size:13px"><b>${TL(w.amount || 0)}</b> · ${esc((user(w.u) || {}).name || '')} — tutar üyenin çekilebilir bakiyesine iade edilir, ücret alınmaz. Gerekçe üyeye bildirilir.</div>
    <div class="fld"><label for="wn_r">Red gerekçesi</label><select class="inp" id="wn_r">${['IBAN hesap sahibi üyeyle eşleşmiyor', 'IBAN geçersiz ya da hesap kapalı', 'Kimlik bilgileri eksik', 'Şüpheli işlem incelemesi', 'Diğer'].map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
    <div class="fld"><label for="wn_x">Ek açıklama (isteğe bağlı)</label><input class="inp" id="wn_x" maxlength="180" autocomplete="off"></div><button class="btn btn-bad">Reddet ve iade et</button></form>`)); });
p2F('p3wdno', async (f) => { const why = [v_('wn_r'), v_('wn_x').trim()].filter(Boolean).join(': ');
  await call('POST', 'admin/withdrawals/' + p3enc(f.dataset.id) + '/reject', { why }, { key: formKey(f) }); closeModal(); p3Drop(); render(); }, 'cekim');

/* ---- yönetim: e-Gider Pusulası ---- */
ACT['egp-view'] = (d) => p3EgpView(d.id);
ACT['egp-modal'] = (d) => p3EgpModal(d.id);
p2F('egpissue', async (f) => { const id = f.dataset.id; const w = S.wd.find(x => x.id === id) || {}; const body = { desc: v_('egi_desc').trim() };
  if (w.status === 'bekliyor') body.stopaj = Math.max(0, Math.min(40, +p3Num(v_('egi_st')) || 0));
  await call('POST', 'admin/withdrawals/' + p3enc(id) + '/egp', body, { key: formKey(f) }); closeModal(); p3Drop(); render(); p3EgpView(id); });
FORM.egptc = (f) => { if (!admOk(['cekim', 'muhasebe'])) return toast('Bu işlem için yetkiniz yok.', true);
  return apiBusy(f, (async () => { const tc = v_('egi_tcfull').replace(/\D/g, ''); const i = $('#egi_tcfull');
    if (!tcValid(tc)) { p3Err('egi_tcerr', { error: 'T.C. kimlik numarası geçersiz. 11 haneyi kontrol edin.' }); if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); } return; }
    try { const j = await call('POST', 'admin/users/' + p3enc(f.dataset.u) + '/tc-full', { tc }, { key: formKey(f) }); if (j.data && j.data.user) apiUpsertUser(j.data.user); p3Drop(); p3EgpModal(f.dataset.id); }
    catch (e) { delete f.dataset.ikey; p3Err('egi_tcerr', e); if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); } } })()); };
p2A('tc-ask', async (d) => { const j = await call('POST', 'admin/users/' + p3enc(d.id) + '/tc-ask', {}); if (j.data && j.data.user) apiUpsertUser(j.data.user); if (d.w && $('.mb')) p3EgpModal(d.w); });
p2A('tc-reset', async (d) => { const j = await call('POST', 'admin/users/' + p3enc(d.id) + '/tc-reset', {}); if (j.data && j.data.user) apiUpsertUser(j.data.user); closeConfirm(false); if ($('.mb')) mUser(d.id); else render(); });
p2A('tc-approve', async (d) => { const j = await call('POST', 'admin/users/' + p3enc(d.id) + '/tc-approve', {}); if (j.data && j.data.user) apiUpsertUser(j.data.user); if ($('.mb')) mUser(d.id); else render(); }, ['cekim', 'uye']);
p2A('tc-show', async (d) => { const j = await call('GET', 'admin/users/' + p3enc(d.id) + '/tc-full?why=uye-detay', null, { quiet: true }).catch(e => { toast(apiErr(e), true); return null; });
  const el = document.getElementById('p3tc_' + d.id); if (j && el) { el.textContent = j.data.tc; el.classList.add('mono'); } }, ['cekim', 'muhasebe']);
/* belge no / ETTN / çekim no ile bul (sunucuda) */
async function p3Find(q) { q = String(q || '').trim(); if (!q) return toast('Belge numarasını (YGP...) yazın.', true);
  const j = await call('GET', 'admin/egp?q=' + p3enc(q), null, { quiet: true }).catch(e => { toast(apiErr(e), true); return null; }); if (j) p3EgpView(j.data.id); }
p2A('egp-find', async () => { await p3Find(($('#egp_q') && $('#egp_q').value) || ui.egpQ || ''); }, ['cekim', 'muhasebe']);
p2F('egplookup', async () => { await p3Find(v_('m_egp_find')); }, ['cekim', 'muhasebe']);
{ const dl0 = ACT['egp-dl']; ACT['egp-dl'] = async (d) => { const w = S.wd.find(x => x.id === d.id); if (w && !(w.egp && w.egp.tckn != null && w.egp.company != null)) { try { await p3Doc(d.id); } catch (e) { return toast(apiErr(e), true); } } return dl0(d); }; }

/* ---- yönetim: para çekme ayarları ---- */
p2F('tcset', async (f) => { await call('PUT', 'admin/settings/tc', { req: $('#tcs_req').checked }, { key: formKey(f) }); needDrop('adm:wdset'); admDirtyClear(); render(); });
p2F('wdfee', async (f) => { const on = (document.querySelector('input[name=wfon]:checked') || {}).value === '1';
  await call('PUT', 'admin/settings/wdfee', { on, type: v_('wf_t'), val: p3Num(v_('wf_v')) || 0, min: p3Num(v_('wf_min')) || 0, max: p3Num(v_('wf_max')) || 0 }, { key: formKey(f) });
  needDrop('adm:wdset'); admDirtyClear(); render(); });
p2F('egpset', async (f) => { await call('PUT', 'admin/settings/egp', { company: v_('egp_comp').trim(), vd: v_('egp_vd').trim(), vkn: v_('egp_vkn').trim(), seri: v_('egp_seri').trim(),
  stopaj: +p3Num(v_('egp_stopaj')) || 0, provider: v_('egp_prov'), descTpl: v_('egp_desc').trim(), autoOnApprove: $('#egp_auto').checked }, { key: formKey(f) });
  needDrop('adm:wdset', 'adm:wd'); admDirtyClear(); render(); });

/* ---- muhasebe ---- */
p2F('p3range', async () => { const a = v_('p3_from'), b = v_('p3_to'); if (!a || !b || a > b) return toast('Tarih aralığını kontrol edin.', true); ui.p3r = { from: a, to: b }; render(); }, 'muhasebe');
p2A('p3-csv', async (d) => { const q = d.q ? '&' + d.q : ''; let r;
  try { r = await fetch(apiUrl('admin/reports/export?type=' + p3enc(d.t) + q), { credentials: 'same-origin', cache: 'no-store' }); } catch (e) { return toast(API_MSG.net, true); }
  if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) { } return toast(apiErr(j), true); }
  const cd = r.headers.get('Content-Disposition') || ''; const m = cd.match(/filename="([^"]+)"/); const name = m ? m[1] : 'yangpazar-rapor.csv';
  await saveFile(name, await r.blob()); toast(name + ' indirildi. Excel ile açabilirsiniz.'); }, 'muhasebe');
p2A('p3-acct-retry', async (d) => { await call('POST', 'admin/accounting/jobs/' + p3enc(d.id) + '/retry', {}); needDrop('adm:acct'); render(); }, 'muhasebe');
p2A('p3-acct-run', async () => { await call('POST', 'admin/accounting/run', {}); needDrop('adm:acct', 'adm:wd'); render(); }, 'muhasebe');

/* ---- Entegrasyonlar ---- */
const p3EntSet = data => { if (data && data.services) { API.cache['adm:ent'] = { v: data, t: Date.now() }; } };
FORM.p3ent = (f) => { const svc = f.dataset.svc; if (!admOk(['muhasebe', 'odeme'])) return toast('Bu işlem için yetkiniz yok.', true);
  return apiBusy(f, (async () => { const values = {};
    f.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k; if (el.type === 'checkbox') values[k] = el.checked; else if (el.dataset.sec) { if (el.value.trim() !== '') values[k] = el.value.trim(); } else values[k] = el.value.trim(); });
    const j = await call('PUT', 'admin/integrations/' + p3enc(svc), { values }, { key: formKey(f) }); delete f.dataset.ikey; p3EntSet(j.data); admDirtyClear(); render(); })()); };
p2A('p3ent-test', async (d) => { const j = await call('POST', 'admin/integrations/' + p3enc(d.svc) + '/test', {}); const x = j.data || {};
  if (!x.ok) toast(x.msg || 'Bağlantı kurulamadı.', true); needDrop('adm:ent'); render(); }, ['muhasebe', 'odeme']);
p2F('p3etbis', async (f) => { const j = await call('PUT', 'admin/integrations/etbis', { on: $('#etb_on').checked, url: v_('etb_url').trim(), code: v_('etb_code').trim(), date: v_('etb_date'), img: v_('etb_img').trim() }, { key: formKey(f) });
  p3EntSet(j.data); admDirtyClear(); render(); }, ['muhasebe', 'odeme']);
