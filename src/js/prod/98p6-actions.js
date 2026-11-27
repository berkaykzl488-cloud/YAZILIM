/* ================== P6: iletişim işleyicileri (yalnız --prod derlemesinde) ==================
   Canlı destek (ls, ls-q, ls-agent, lsord, lsimg, tk-rate, ls-open/close), temsilci (tk, tkf, tk-claim, tkreply, tk-close, tkxfer,
   canned, supportset), mesajlar (dm), engellenen mesajlar (fl-seen, fl-seen-all), şablonlar (tplk, tplsave, tpldef, tplprev),
   Şifremi unuttum (forgotf, resetf). Yetki denetimi burada da yapılır (asıl denetim sunucuda).                              */
if (YP_PROD) {
const p6No = () => toast('Bu işlem için yetkiniz yok.', true);
const p6A = (k, fn, perm) => { ACT[k] = (d, e) => { if (perm && !admOk(perm)) return p6No(); const el = e && e.target && e.target.closest ? e.target.closest('[data-act]') : null; return apiBusy(el, fn(d, e, el)); }; };
const p6F = (k, fn, perm) => { FORM[k] = (f) => { if (perm && !admOk(perm)) return p6No(); return apiBusy(f, fn(f)); }; };

/* ---------------- canlı destek (üye) ---------------- */
ACT['ls-open'] = (d, e) => { if (e && e.preventDefault) e.preventDefault();
  if (isPanel() && can('destek')) return admGo('destek', 'talepler');
  if (!p6On()) return mtabHelp();
  ui.ls = true; renderLS(); p6TkStart(); if (!isTouchUI()) setTimeout(() => { const i = $('#lsmsg'); if (i) i.focus({ preventScroll: true }); }, 60); };
ACT['ls-close'] = () => { ui.ls = false; clearTimeout(P6.tkPoll); P6.tkPoll = null; renderLS(); };
const p6TkSend = async (body) => { if (!me()) return mLogin();
  const j = await call('POST', 'support/messages', body);
  P6.tk = j.data.ticket; P6.tkSig = ''; API.unread = Object.assign({}, API.unread, { tk: 0 }); P6.lastTk = 0;
  const i = $('#lsmsg'); if (i) i.value = '';
  renderLS(); P6.tkSig = p6TkSigOf(P6.tk); p6TkLoop();
  if (!isTouchUI()) setTimeout(() => { const n = $('#lsmsg'); if (n) n.focus({ preventScroll: true }); }, 0); };
p6F('ls', async () => { const x = v_('lsmsg').trim(); if (!x) return; await p6TkSend({ x }); });
p6A('ls-q', async (d) => { await p6TkSend({ x: d.q }); });
p6A('ls-agent', async () => { if (!me()) return mLogin(); const j = await call('POST', 'support/escalate', {}, { silent: true }); P6.tk = j.data.ticket; P6.tkSig = p6TkSigOf(P6.tk); renderLS(); p6TkLoop(); });
p6A('tk-rate', async (d) => { const j = await call('POST', 'support/rate', { n: +d.n }); P6.tk = j.data.ticket; P6.tkSig = p6TkSigOf(P6.tk); renderLS(); });
CHG.lsord = (el) => { const id = el.value; if (!id) return; el.value = ''; apiBusy(el, p6TkSend({ x: '', order: id })); };
CHG.lsimg = (el) => { const f = el.files && el.files[0]; if (!f) return; el.value = '';
  if (!/^image\//.test(f.type)) return toast('Yalnız görsel (JPG, PNG, WebP) ekleyebilirsiniz.', true);
  const lb = $('label[for=lsimg]'); if (lb) { lb.textContent = 'Yükleniyor…'; lb.setAttribute('aria-busy', 'true'); }
  p1Upload(f, f.name || 'ekran.jpg', 'support').then(m => p6TkSend({ x: '', media: m.id }), e => { toast(apiErr(e), true); renderLS(); }); };

/* ---------------- temsilci [destek] ---------------- */
const p6AdmAfter = (d) => { if (d && d.ticket) { P6.adm.det[d.ticket.id] = d; (d.users || []).forEach(apiUpsertUser); } Object.keys(P6.adm.list).forEach(k => delete P6.adm.list[k]); needDrop('adm:today'); };
ACT.tk = (d) => { ui.tk = d.id || null; if (isAdmRoute(route())) admSet({ id: d.id || null }); else render(); setTimeout(() => { const c = $('#tkChat'); if (c) c.scrollTop = c.scrollHeight; }, 0); };
p6A('tk-claim', async (d) => { const j = await call('POST', 'admin/tickets/' + p6enc(d.id) + '/claim', {}); ui.tk = d.id; p6AdmAfter(j.data); render(); }, 'destek');
p6A('tk-close', async (d) => { const j = await call('POST', 'admin/tickets/' + p6enc(d.id) + '/close', {}); p6AdmAfter(j.data); render(); }, 'destek');
ACT['tk-ai'] = () => toast('Yapay zekâ taslağı bu sürümde kapalı; hazır yanıtları kullanın.', true);
p6F('tkreply', async (f) => { const x = v_('tkmsg').trim(); if (!x) return; const note = !!($('#tknote') || {}).checked;
  const j = await call('POST', 'admin/tickets/' + p6enc(f.dataset.id) + '/reply', { x, note }, { key: formKey(f) }); delete f.dataset.ikey;
  p6AdmAfter(j.data); render(); setTimeout(() => { const i = $('#tkmsg'); if (i) i.focus({ preventScroll: true }); const c = $('#tkChat'); if (c) c.scrollTop = c.scrollHeight; }, 0); }, 'destek');
CHG.tkxfer = (el) => { if (!el.value) return; if (!admOk('destek')) return p6No(); const to = el.value;
  apiBusy(el, call('POST', 'admin/tickets/' + p6enc(el.dataset.id) + '/transfer', { to }).then(j => { p6AdmAfter(j.data); render(); }, () => { el.value = ''; })); };
CHG.canned = (el) => { const c = (S.support.canned || [])[+el.value]; el.value = ''; if (!c) return; const i = $('#tkmsg'); if (!i) return; i.value = String(c[1]).split('{temsilci}').join((me() || {}).name || ''); i.focus(); };
p6F('supportset', async (f) => { const hours = {}; [0, 1, 2, 3, 4, 5, 6].forEach(d => { const c = v_('sh_c_' + d); hours[d] = [v_('sh_o_' + d) || '09:00', c === '23:59' ? '24:00' : (c || '24:00'), !!($('#sh_on_' + d) || {}).checked]; });
  const canned = v_('sp_can').split('\n').map(l => l.split('|')).filter(p => p.length > 1 && p[0].trim()).map(p => [p[0].trim(), p.slice(1).join('|').trim()]);
  const b = { mode: (document.querySelector('input[name=sp_mode]:checked') || {}).value || 'auto', hours, aiName: v_('sp_an').trim(), wait: v_('sp_wait').trim(), offline: v_('sp_off').trim(), canned };
  const j = await call('PUT', 'admin/settings/support', b, { key: formKey(f) }); delete f.dataset.ikey; p6SupSet(Object.assign({}, j.data.support, { canned })); admDirtyClear(); render(); }, 'destek');

/* ---------------- üyeden üyeye mesajlar ---------------- */
FORM.dm = (f) => { const x = v_('dmmsg').trim(); if (!x) return; const peer = f.dataset.id, u = me(); if (!u) return mLogin();
  const ctx = ui.dmCtx ? lst(ui.dmCtx) : null; const body = { x }; if (ctx && ctx.seller === peer) body.listing = ctx.id;
  return apiBusy(f, call('POST', 'dm/' + p6enc(peer), body, { key: formKey(f) }).then(j => { delete f.dataset.ikey; const d = j.data || {};
    let c = S.dms.find(t => t.id === d.dm.id); if (!c) { c = Object.assign({}, d.dm, { msgs: [] }); S.dms.push(c); }
    if (!c.msgs.some(m => m.id === d.msg.id)) c.msgs.push(d.msg); c.read = d.dm.read; P6.dmConv[c.id] = true; P6.dmConv['peer:' + peer] = true;
    const i = $('#dmmsg'); if (i) i.value = ''; render();
    setTimeout(() => { const ch = $('#dmChat'); if (ch) ch.scrollTop = ch.scrollHeight; const n = $('#dmmsg'); if (n && !isTouchUI()) n.focus(); }, 0); })); };
ACT['p6-dm-reload'] = () => { P6.dmL = null; render(); };

/* ---------------- engellenen mesajlar [mesaj] ---------------- */
p6A('fl-seen', async (d) => { const f = S.flagged[+d.i]; if (!f) return; const j = await call('POST', 'admin/flagged/' + p6enc(f.id) + '/seen', {}, { silent: true }); f.seen = true; p2QSet('flagged', j.data.pending); render(); }, 'mesaj');
p6A('fl-seen-all', async () => { const P = admParse(route()); const j = await call('POST', 'admin/flagged/seen-all', { q: P.q || ui.aq || '' }); p2QSet('flagged', j.data.pending); P6.fl = null; render(); }, 'mesaj');

/* ---------------- mesaj şablonları [sms] ---------------- */
ACT.tplk = (d) => { ui.tplk = d.k; render(); };
CHG.tplprev = (el) => { const m = $('#tpv_m'); if (m && $('#tp_ms')) m.innerHTML = mailPreview(v_('tp_ms'), $('#tp_mb').value, p6MailVars); const sv = $('#tpv_s'); if (sv && $('#tp_sb')) sv.innerHTML = p6WaPrev($('#tp_sb').value); };
const p6TplSet = t => { if (!t || !P6.tpl || !P6.tpl.templates) return; const i = P6.tpl.templates.findIndex(x => x.k === t.k); if (i >= 0) P6.tpl.templates[i] = t; };
p6F('tplsave', async (f) => { const k = f.dataset.k, b = {};
  if ($('#tp_ms')) b.mail = { s: v_('tp_ms'), b: $('#tp_mb').value, on: !!($('#tp_me') || {}).checked };
  if ($('#tp_sb')) b.wa = { x: $('#tp_sb').value, on: !!($('#tp_se') || {}).checked };
  const j = await call('PUT', 'admin/templates/' + p6enc(k), b, { key: formKey(f) }); delete f.dataset.ikey; p6TplSet(j.data.template); admDirtyClear(); render(); }, 'sms');
p6A('tpldef', async (d) => { const j = await call('DELETE', 'admin/templates/' + p6enc(d.k)); p6TplSet(j.data.template); admDirtyClear(); render(); }, 'sms');

/* ---------------- Şifremi unuttum ---------------- */
FORM.forgotf = (f) => { const login = v_('fg_u').trim(); if (!login) return mForgot({ step: 1, err: 'Kullanıcı adınızı veya e-posta adresinizi yazın.' });
  return apiBusy(f, call('POST', 'auth/forgot', { login }, { quiet: true, silent: true }).then(j => mForgot({ step: 2, login, msg: j.msg }), e => mForgot({ step: 1, login, err: apiErr(e) }))); };
FORM.resetf = (f) => { const token = f.dataset.token || '', login = v_('rs_u').trim(), password = v_('rs_p');
  const body = token ? { token, password } : { login, code: v_('rs_c').replace(/\D/g, ''), password };
  return apiBusy(f, call('POST', 'auth/reset', body, { quiet: true, silent: true }).then(async j => { toast(j.msg || 'Şifreniz değiştirildi.');
    const was = !!S.cur; if (was) await apiReboot(true).catch(() => { });
    mLogin(); const i = $('#lg_u'); if (i) i.value = (j.data && j.data.login) || login; const p = $('#lg_p'); if (p && !isTouchUI()) p.focus(); if (was) render(); },
    e => { const code = !token ? v_('rs_c') : ''; mForgot({ step: 2, login, token, err: apiErr(e) }); const c = $('#rs_c'); if (c && e && e.code !== 'reset_invalid') c.value = code; })); };
}
