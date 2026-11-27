/* ================== P6: iletişim — canlı destek, üyeden üyeye mesajlar, engellenen mesajlar, mesaj şablonları (yalnız --prod) ==================
   Sunucu: app/routes/88_support.php (support/*, admin/tickets*, admin/settings/support), 89_dm.php (dm*, admin/flagged*),
   37_templates.php (admin/templates*), 11_forgot.php (auth/forgot, auth/reset).
   - Canlı destek balonu (masaüstü, sağ alt) destek açıksa (ayarlarda "kapalı" değilse) görünür; saat dışında asistan yanıtlar, temsilci
     isteği sıraya alınır. Mobilde alt çubuktaki Destek: destek açık VE çalışma saatindeyse sohbet, değilse Yardım penceresi
     (WhatsApp hattı, saatler). Ziyaretçi sohbet için giriş yapar.
   - Yoklama: sohbet / konuşma / temsilci ekranı açıkken 4 sn'de bir (sekme gizliyken 30 sn), 429'da geri çekilir; yazılan metin ve odak
     korunur (yalnız veri değişince yeniden çizilir). Okunmamış sayıları (unread.tk, unread.dm) ve yönetim kuyrukları genel yoklamadan.
   - Demo ekranları (msgHtml, vMessages, mesaj tablosu, tplAdmin biçimi) aynen kullanılır; veri S'ye sunucudan yazılır.
   İşleyiciler: 98p6-actions.js                                                                                                        */
const P6 = { tk: undefined, tkSig: '', tkPoll: null, tkBo: 0, tkLoading: false, lastTk: 0, lastDm: 0,
  dmL: null, dmLoad: false, dmConv: {}, dmPoll: null, dmBo: 0,
  adm: { list: {}, det: {}, loading: {} }, admPoll: null, admBo: 0, tpl: null, tplLoad: false, fl: null, flLoad: false, resetTok: null };
const p6Iv = () => document.hidden ? 30000 : 4000;
const p6On = () => !!(S && S.support && S.support.mode && S.support.mode !== 'closed');
const p6Q = k => { const c = API.cache['adm:today']; return c && c.v && c.v.queues ? +c.v.queues[k] || 0 : 0; };
const p6enc = encodeURIComponent;
const p6ErrBox = d => d && d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : '';

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="p6css">
.p6rate{display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;font-size:12.5px}
.p6rate i{display:block;height:8px;border-radius:4px;background:var(--accent);min-width:2px}
.p6tpl .tplsec .note{font-size:12.5px}
.phone.wa{background:#e7f8de;color:#111b21;border-radius:10px;padding:8px 10px}.phone.wa small{color:#56656d}
:root[data-theme="dark"] .phone.wa{background:#1f3b2c;color:#e9edef}:root[data-theme="dark"] .phone.wa small{color:#9fb0b6}
.ls-login .qr a{display:inline-flex;align-items:center}
.tk-list .tkb{display:inline-block;margin-left:4px;background:var(--bad);color:var(--on-solid);border-radius:9px;font-size:10.5px;padding:0 6px;font-weight:700}
</style>`);

/* ================= açılış verisi ================= */
function p6SupSet(s) { if (!s || !S) return; S.support = Object.assign({}, S.support || {}, s); if (!Array.isArray(S.support.canned)) S.support.canned = []; }
function p6Boot(b) { if (!b || !S) return; if (b.support) p6SupSet(b.support); P6.tk = undefined; P6.tkSig = ''; P6.dmL = null; P6.dmConv = {}; S.dms = [];
  P6.lastTk = (b.unread && +b.unread.tk) || 0; P6.lastDm = (b.unread && +b.unread.dm) || 0; }
if (YP_PROD) {
try { p6Boot(window.YP_BOOT); } catch (e) { }
{ const f = apiApplyBoot; apiApplyBoot = function (b) { f.apply(this, arguments); p6Boot(b); }; }

/** Çalışma saatleri Europe/Istanbul (UTC+3, yaz saati yok): sunucuyla aynı hesap */
supportOpen = function (d) { const s = S.support || {}; if (s.mode === 'open') return true; if (s.mode !== 'auto') return false;
  const t = new Date((d ? d.getTime() : now()) + 3 * H); const x = (s.hours || {})[t.getUTCDay()]; if (!x || !x[2]) return false;
  const m = t.getUTCHours() * 60 + t.getUTCMinutes(), O = hm(x[0]), C = x[1] === '24:00' ? 1440 : hm(x[1]); return C > O ? (m >= O && m < C) : (m >= O || m < C); };
/** Okunmamış konuşma sayısı sunucudan (başlık, ☰ çekmece, Hesabım menüsü) */
unreadDM = function (uid) { return uid && uid === S.cur && API.unread && API.unread.dm != null ? +API.unread.dm || 0 : 0; };

/** Yazılan metni, odağı ve iç not kutusunu koruyarak yeniden çizer */
function p6Keep(fn) { const a = document.activeElement, keep = {};
  ['lsmsg', 'dmmsg', 'tkmsg'].forEach(id => { const e = $('#' + id); if (e) keep[id] = { v: e.value, f: a === e, s: e.selectionStart, e: e.selectionEnd }; });
  const n = $('#tknote'), nt = n ? n.checked : null;
  const chats = {}; ['#lsChat', '#dmChat', '#tkChat'].forEach(s => { const c = $(s); if (c) chats[s] = c.scrollHeight - c.scrollTop - c.clientHeight < 40; });
  fn();
  Object.entries(keep).forEach(([id, k]) => { const e = $('#' + id); if (!e) return; if (!e.value && k.v) e.value = k.v; if (k.f) { try { e.focus({ preventScroll: true }); e.setSelectionRange(k.s, k.e); } catch (x) { } } });
  if (nt != null) { const n2 = $('#tknote'); if (n2) n2.checked = nt; }
  Object.entries(chats).forEach(([s, bottom]) => { const c = $(s); if (c && bottom) c.scrollTop = c.scrollHeight; }); }

/* ================= genel yoklama: okunmamış sayıları, destek durumu, yönetim kuyrukları ================= */
function p6OnPoll(d) { if (!d) return;
  if (d.support) { const was = p6On(); if (d.support.mode) S.support.mode = d.support.mode; if (was !== p6On() && !isPanel()) renderLS(); }
  const u = d.unread || {};
  if (u.tk != null && +u.tk !== P6.lastTk) { P6.lastTk = +u.tk; if (ui.ls) p6TkFetch(false).catch(() => { }); else renderLS(); }
  if (u.dm != null && +u.dm !== P6.lastDm) { P6.lastDm = +u.dm; renderHeader(); const r = route(); if (r === 'mesajlar') { P6.dmL = null; render(); } }
  if (d.queues) { if (d.queues.tickets != null) { p2QSet('tickets', d.queues.tickets); if (can('destek')) renderLS(); } if (d.queues.flagged != null) p2QSet('flagged', d.queues.flagged); } }
{ const c0 = call; call = function (m, p) { const pr = c0.apply(this, arguments); if (m === 'GET' && /^poll(\?|$)/.test(String(p))) pr.then(j => { try { p6OnPoll(j && j.data); } catch (e) { console.warn('p6 poll', e); } }, () => { }); return pr; }; }
document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (ui.ls) p6TkLoop(); if (P6.dmPeer) p6DmLoop(); if (isAdmRoute(route())) p6AdmLoop(); });

/* yönetim kuyrukları (Bugün ve kenar menü rozetleri): sunucu sayıları */
{ const q = admQ('destek'); if (q) q.L = () => Array.from({ length: p6Q('tickets') }, () => ({ t: now(), status: 'bekliyor' })); }
{ const q = admQ('mesaj'); if (q) { q.L = () => Array.from({ length: p6Q('flagged') }, () => ({ t: now(), u: '', seen: false })); q.meta = L => `${L.length} mesaj incelenmedi`; } }

/* ================= canlı destek (üye) ================= */
const p6TkSigOf = t => t ? JSON.stringify([t.id, t.status, t.pos, t.rated, t.agent, t.msgs.length, (t.msgs[t.msgs.length - 1] || {}).id]) : String(t);
function p6TkApply(d, delta) { if (!d) return; if (d.support) p6SupSet(d.support); (d.agents || []).forEach(apiUpsertUser);
  const t = d.ticket;
  if (!t) P6.tk = null;
  else if (delta && P6.tk && P6.tk.id === t.id) { const ids = new Set(P6.tk.msgs.map(m => m.id)); P6.tk = Object.assign({}, t, { msgs: P6.tk.msgs.concat(t.msgs.filter(m => !ids.has(m.id))) }); }
  else if (delta && P6.tk && P6.tk.id !== t.id) { return p6TkFetch(true); }
  else P6.tk = t;
  if (ui.ls && P6.tk) { API.unread = Object.assign({}, API.unread, { tk: 0 }); P6.lastTk = 0; }
  const sig = p6TkSigOf(P6.tk); if (sig !== P6.tkSig) { P6.tkSig = sig; p6Keep(renderLS); } }
function p6TkFetch(full) { if (!me()) return Promise.resolve();
  const t = P6.tk, last = !full && t && t.msgs.length ? t.msgs[t.msgs.length - 1].id : '';
  return call('GET', 'support/ticket?seen=' + (ui.ls ? 1 : 0) + (last ? '&after=' + p6enc(last) : ''), null, { quiet: true }).then(j => p6TkApply(j.data, !!last)); }
function p6TkLoop() { clearTimeout(P6.tkPoll); P6.tkPoll = null; if (!ui.ls || !me() || !p6On() || can('destek')) return;
  P6.tkPoll = setTimeout(async () => { P6.tkPoll = null; try { await p6TkFetch(false); P6.tkBo = 0; } catch (e) { if (e && e.http === 429) P6.tkBo = Math.min(60000, (P6.tkBo || 5000) * 2); if (e && e.http === 401) return; } p6TkLoop(); }, p6Iv() + (P6.tkBo || 0)); }
function p6TkStart() { if (!me()) return; P6.tkLoading = P6.tk === undefined; if (P6.tkLoading) renderLS();
  p6TkFetch(true).catch(() => { }).finally(() => { P6.tkLoading = false; p6Keep(renderLS); p6TkLoop(); }); }
const p6Wa = () => { let wa = String(S.set.whatsapp || '').replace(/\D/g, ''); if (/^0\d{10}$/.test(wa)) wa = '90' + wa.slice(1); else if (/^5\d{9}$/.test(wa)) wa = '90' + wa; return wa; };
function p6LsHead(t) { const open = supportOpen(), s = S.support;
  return `<div class="ls-h"><span class="av" style="background:var(--accent);color:var(--accent-ink)">${ICO.han.replace('<svg', '<svg style="width:20px"')}</span><div style="min-width:0"><b>Canlı Destek</b><small class="${open ? '' : 'off'}">${open ? `Temsilciler çevrimiçi · ort. yanıt ${esc(s.wait || '2 dk')}` : `Temsilciler ${nextOpen()} dönüyor · asistan yanıtlıyor`}</small><small class="hrs">${hoursTxt()}${t ? ' · Talep #DST-' + t.no : ''}</small></div><button class="md-x" data-act="ls-close" aria-label="Kapat">×</button></div>
    <div class="ls-trust">${ICO.shield}<span>Görüşmeniz kayıt altındadır. Ekibimiz sizden asla şifre, doğrulama kodu veya kart bilgisi istemez.</span></div>`; }
renderLS = function () { const el = $('#ls'); if (!el) return;
  const staff = isPanel() && can('destek');
  document.documentElement.classList.toggle('lsopen', !!ui.ls && !staff); try { vvLast = ''; vvSync(); } catch (e) { }
  if (staff) { const n = p6Q('tickets'); el.innerHTML = `<button class="ls-fab" data-act="admin-tk">${ICO.chat}Destek talepleri ${n ? `<span class="cnt">${n}</span>` : ''}</button>`; return; }
  if (!p6On()) { if (ui.ls) { ui.ls = false; document.documentElement.classList.remove('lsopen'); } el.innerHTML = ''; return; }
  if (!ui.ls) { const un = (API.unread && +API.unread.tk) || 0; el.innerHTML = `<button class="ls-fab" data-act="ls-open"><span class="dot ${supportOpen() ? '' : 'off'}"></span>${ICO.chat}Canlı Destek${un ? `<span class="cnt">${un}</span>` : ''}</button>`; return; }
  const wasOpen = !!el.querySelector('.ls-p'), u = me(), s = S.support;
  if (!u) { const wa = p6Wa();
    el.innerHTML = `<div class="ls-p ls-login${wasOpen ? '' : ' ls-in'}" role="dialog" aria-label="Canlı destek">${p6LsHead(null)}
      <div class="chat" id="lsChat"><div class="msg bot"><b class="who">${esc(s.aiName || 'Asistan')} · Asistan</b><span class="tx">Merhaba! Canlı destekle yazışmak için giriş yapın ya da ücretsiz üye olun. Şifrenizi unuttuysanız giriş penceresindeki “Şifremi unuttum” bağlantısını kullanın.</span></div></div>
      <div class="qr"><button data-act="login" class="hl">Giriş yap</button><button data-act="register">Kayıt ol</button>${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp destek hattı</a>` : ''}</div></div>`; return; }
  const t = P6.tk;
  if (t === undefined || P6.tkLoading) { el.innerHTML = `<div class="ls-p${wasOpen ? '' : ' ls-in'}" role="dialog" aria-label="Canlı destek">${p6LsHead(null)}<div class="chat" id="lsChat"><div class="msg sys">Yükleniyor…</div></div></div>`; return; }
  const closed = t && t.status === 'kapandı' && !t.rated;
  const myOrders = [...(S.orders || []).filter(o => o.buyer === u.id || o.seller === u.id).slice(0, 6).map(o => [o.id, o.title]), ...(S.exOrders || []).filter(o => o.u === u.id).slice(0, 3).map(o => [o.id, 'Borsa ' + (o.dir === 'al' ? 'alım' : 'satış')])];
  const msgs = t ? t.msgs.map(m => msgHtml(m, null, false)).join('') : `<div class="msg bot"><b class="who">${esc(s.aiName || 'Asistan')} · Asistan</b><span class="tx">Merhaba ${esc(u.name)}! Ben ${esc(s.aiName || 'asistan')}. Siparişler, borsa, ödeme ve hesap konularında yardımcı olabilirim; gerekirse sizi bir temsilciye bağlarım.</span></div>`;
  el.innerHTML = `<div class="ls-p${wasOpen ? '' : ' ls-in'}" role="dialog" aria-label="Canlı destek">${p6LsHead(t)}
    <div class="chat" id="lsChat">${msgs}${t && t.status === 'bekliyor' && t.pos ? `<div class="msg sys">Temsilci sırasındaki yeriniz: ${t.pos}</div>` : ''}
      ${closed ? `<div class="rate"><b>Görüşmeyi değerlendirin</b><div class="hstack">${[1, 2, 3, 4, 5].map(n => `<button class="btn btn-sm" data-act="tk-rate" data-n="${n}" aria-label="${n} yıldız">${'★'.repeat(n)}</button>`).join('')}</div></div>` : ''}</div>
    ${closed ? '' : `<div class="qr">${t && (t.status === 'bekliyor' || t.agent) ? '' : `<button data-act="ls-agent" class="hl">Temsilciye bağlan</button>`}${['Siparişim teslim edilmedi', 'Borsa siparişim', 'Bakiye yükleme', 'Para çekme'].map(q => `<button data-act="ls-q" data-q="${q}">${q}</button>`).join('')}</div>
    <div class="ls-att">${myOrders.length ? `<select class="inp" data-change="lsord" aria-label="Sipariş ekle"><option value="">+ Sipariş ekle</option>${myOrders.map(([id, ti]) => `<option value="${esc(id)}">#${esc(id)} · ${esc(String(ti).slice(0, 28))}</option>`).join('')}</select>` : '<span class="muted" style="font-size:12px;flex:1">Sipariş numaranızı mesaja yazabilirsiniz.</span>'}<label class="btn btn-sm" for="lsimg">Görsel ekle</label><input type="file" id="lsimg" accept="image/jpeg,image/png,image/webp" hidden data-change="lsimg"></div>
    <form class="chat-in" data-form="ls"><input class="inp" id="lsmsg" placeholder="Mesajınızı yazın…" autocomplete="off" enterkeyhint="send" maxlength="1000"><button class="btn btn-primary">Gönder</button></form>`}</div>`;
  const c = $('#lsChat'); if (c) c.scrollTop = c.scrollHeight; };

/* mobil alt çubuk: Destek → destek açık ve saat içindeyse sohbet, değilse Yardım penceresi */
if (typeof MTAB !== 'undefined') MTAB.destek = function (btn) {
  if (isPanel() && can('destek')) return admGo('destek', 'talepler');
  if (p6On() && supportOpen()) { ui.ls = true; renderLS(); p6TkStart(); return; }
  mtabHelp(btn); };
{ const f = mtabHelpBody; mtabHelpBody = function () { const h = f.apply(this, arguments); if (!p6On()) return h;
    const note = supportOpen() ? '' : `<div class="note note-info sh-note">Canlı destek şu an kapalı. Temsilcilerimiz ${esc(nextOpen())} dönecek; WhatsApp hattından ya da aşağıdaki sayfalardan yardım alabilirsiniz.</div>`;
    return note + h; }; }

/* ================= üyeden üyeye mesajlar ================= */
function p6DmUp(th) { if (!th) return null; const i = S.dms.findIndex(x => x.id === th.id); if (i < 0) { S.dms.push(th); return th; } S.dms[i] = Object.assign(S.dms[i], th); return S.dms[i]; }
function p6DmLoadList() { if (P6.dmLoad) return; P6.dmLoad = true;
  call('GET', 'dm', null, { quiet: true }).then(j => { const d = j.data || {}; (d.users || []).forEach(apiUpsertUser);
    (d.dms || []).forEach(th => { const old = S.dms.find(x => x.id === th.id); if (old && P6.dmConv[th.id]) { old.read = th.read; old.un = th.un; } else p6DmUp(th); });
    API.unread = Object.assign({}, API.unread, { dm: +d.unread || 0 }); P6.lastDm = +d.unread || 0; P6.dmL = { t: Date.now() }; },
    e => { P6.dmL = { err: apiErr(e), t: Date.now() }; }).finally(() => { P6.dmLoad = false; p6Keep(render); renderHeader(); }); }
function p6DmFetch(peer, full) { const u = me(); if (!u) return Promise.resolve(); const c = convOf(u.id, peer); const has = c && P6.dmConv[c.id];
  const last = !full && has && c.msgs.length ? c.msgs[c.msgs.length - 1].id : '';
  return call('GET', 'dm/' + p6enc(peer) + (last ? '?after=' + p6enc(last) : ''), null, { quiet: true }).then(j => { const d = j.data || {}; (d.users || []).forEach(apiUpsertUser);
    (d.listings || []).forEach(l => { if (typeof p1Up === 'function') p1Up(S.listings, [l]); });
    API.unread = Object.assign({}, API.unread, { dm: +d.unread || 0 }); if (P6.lastDm !== (+d.unread || 0)) { P6.lastDm = +d.unread || 0; renderHeader(); }
    if (!d.dm) { P6.dmConv['peer:' + peer] = true; return false; }
    const cur = S.dms.find(x => x.id === d.dm.id); let changed = false;
    if (last && cur) { const ids = new Set(cur.msgs.map(m => m.id)); const add = d.dm.msgs.filter(m => !ids.has(m.id)); if (add.length) { cur.msgs = cur.msgs.concat(add); changed = true; } cur.read = d.dm.read; cur.un = false; }
    else { p6DmUp(d.dm); changed = true; }
    P6.dmConv[d.dm.id] = true; P6.dmConv['peer:' + peer] = true; return changed; }); }
function p6DmLoop() { clearTimeout(P6.dmPoll); P6.dmPoll = null; const r = route(); const peer = r.startsWith('mesajlar-') ? r.slice(9) : null; P6.dmPeer = peer;
  if (!peer || !me()) return;
  P6.dmPoll = setTimeout(async () => { P6.dmPoll = null; if (route() !== 'mesajlar-' + peer) return;
    try { const ch = await p6DmFetch(peer, false); P6.dmBo = 0; if (ch) p6Keep(render); } catch (e) { if (e && e.http === 429) P6.dmBo = Math.min(60000, (P6.dmBo || 5000) * 2); if (e && e.http === 401) return; }
    p6DmLoop(); }, p6Iv() + (P6.dmBo || 0)); }
{ const v0 = vMessages; vMessages = function (peer) { const u = me(); if (!u) return v0(peer);
    if (!P6.dmL) { p6DmLoadList(); return `<div class="wrap">${pLoading('Mesajlar yükleniyor…')}</div>`; }
    if (P6.dmL.err) return `<div class="wrap">${emptyBox('Mesajlar yüklenemedi', esc(P6.dmL.err), '<button class="btn btn-primary" data-act="p6-dm-reload">Tekrar dene</button>')}</div>`;
    if (peer && !P6.dmConv['peer:' + peer]) { if (!P6.dmConv['load:' + peer]) { P6.dmConv['load:' + peer] = true; p6DmFetch(peer, true).catch(e => toast(apiErr(e), true)).finally(() => { delete P6.dmConv['load:' + peer]; P6.dmConv['peer:' + peer] = true; render(); }); }
      return `<div class="wrap">${pLoading('Konuşma yükleniyor…')}</div>`; }
    if (peer && !S.users.some(x => x.id === peer)) return `<div class="wrap">${emptyBox('Üye bulunamadı', '', '<a class="btn btn-primary" href="#mesajlar">Mesajlara dön</a>')}</div>`;
    let h = v0(peer);
    h = h.replace(/<button class="btn btn-sm" data-act="sms-user"[^>]*>[^<]*<\/button>/, ''); // ücretli SMS / WhatsApp ile ulaşma canlıda yok
    if (peer && !P6.dmPoll) setTimeout(p6DmLoop, 0);
    return h; }; }

/* mesajlar canlı: önceki sürümlerin "yakında" yönlendirmesinin (97-p0b-views.js P_SOON_R) önüne geçer */
{ const v0 = view; view = function (r) { if (!API.booting && API.live && /^mesajlar(-|$)/.test(r)) return vMessages(r === 'mesajlar' ? undefined : r.slice(9)); return v0(r); }; }

/* ================= yönlendirme: şifre sıfırlama bağlantısı (#sifre-<token>), bildirimden canlı destek (#destek) ================= */
{ const m = /^#\/?sifre-([a-f0-9]{64})$/.exec(location.hash || ''); if (m) { P6.resetTok = m[1]; try { history.replaceState(history.state, '', location.pathname + location.search + '#home'); } catch (e) { } } }
setTimeout(function w(n) { if (API.booting && n < 200) return setTimeout(() => w(n + 1), 50); if (P6.resetTok) { const t = P6.resetTok; P6.resetTok = null; mForgot({ step: 2, token: t }); } }, 0);
{ const r0 = render; render = function () { const h = route();
    if (/^sifre-[a-f0-9]{64}$/.test(h)) { try { history.replaceState(null, '', '#home'); } catch (e) { } setTimeout(() => mForgot({ step: 2, token: h.slice(6) }), 0); }
    else if (h === 'destek') { try { history.replaceState(null, '', '#home'); } catch (e) { } setTimeout(() => { if (p6On() && !(isPanel() && can('destek'))) { ui.ls = true; renderLS(); p6TkStart(); } else mtabHelp(); }, 0); }
    const o = r0.apply(this, arguments);
    if (!route().startsWith('mesajlar-')) { clearTimeout(P6.dmPoll); P6.dmPoll = null; P6.dmPeer = null; }
    if (!/^yonetim\/destek/.test(route())) { clearTimeout(P6.admPoll); P6.admPoll = null; }
    return o; }; }

/* ================= yönetim: canlı destek [destek] ================= */
const p6AdmF = P => ['aktif', 'kapali', 'hepsi'].includes(P.f) ? P.f : (ui.tkf && ['aktif', 'kapali', 'hepsi'].includes(ui.tkf) ? ui.tkf : 'aktif');
function p6AdmListLoad(F, quiet) { if (P6.adm.loading['l:' + F]) return P6.adm.loading['l:' + F];
  return (P6.adm.loading['l:' + F] = call('GET', 'admin/tickets?f=' + F, null, { quiet: true }).then(j => { const d = j.data || {}; (d.users || []).forEach(apiUpsertUser);
    if (d.support) p6SupSet(d.support); p2QSet('tickets', d.waiting || 0);
    const old = P6.adm.list[F]; P6.adm.list[F] = d; return !old || JSON.stringify(old.tickets) !== JSON.stringify(d.tickets) || JSON.stringify(old.rating) !== JSON.stringify(d.rating); },
    e => { P6.adm.list[F] = { err: apiErr(e) }; return true; }).finally(() => { delete P6.adm.loading['l:' + F]; })); }
function p6AdmDetLoad(id, full) { const k = 'd:' + id; if (P6.adm.loading[k]) return P6.adm.loading[k]; const cur = P6.adm.det[id];
  const last = !full && cur && cur.ticket && cur.ticket.msgs.length ? cur.ticket.msgs[cur.ticket.msgs.length - 1].id : '';
  return (P6.adm.loading[k] = call('GET', 'admin/tickets/' + p6enc(id) + (last ? '?after=' + p6enc(last) : ''), null, { quiet: true }).then(j => p6AdmDetSet(j.data, !!last),
    e => { P6.adm.det[id] = { err: apiErr(e) }; return true; }).finally(() => { delete P6.adm.loading[k]; })); }
function p6AdmDetSet(d, delta) { if (!d || !d.ticket) return false; (d.users || []).forEach(apiUpsertUser); const id = d.ticket.id, cur = P6.adm.det[id];
  if (delta && cur && cur.ticket) { const ids = new Set(cur.ticket.msgs.map(m => m.id)); const add = d.ticket.msgs.filter(m => !ids.has(m.id));
    const sig = JSON.stringify([cur.ticket.status, cur.ticket.agent, cur.ticket.rated, cur.ticket.pos]); cur.ticket = Object.assign({}, d.ticket, { msgs: cur.ticket.msgs.concat(add) }); cur.orders = d.orders || cur.orders;
    return add.length > 0 || sig !== JSON.stringify([d.ticket.status, d.ticket.agent, d.ticket.rated, d.ticket.pos]); }
  P6.adm.det[id] = d; return true; }
function p6AdmLoop() { clearTimeout(P6.admPoll); P6.admPoll = null; const r = route(); if (!/^yonetim\/destek(\/talepler)?([?]|$)/.test(r) || !can('destek')) return;
  P6.admPoll = setTimeout(async () => { P6.admPoll = null; const P = admParse(route()); if (P.k !== 'destek' || (P.sub && P.sub !== 'talepler')) return;
    const F = p6AdmF(P), sel = ui.tk || P.id;
    try { const a = await p6AdmListLoad(F); const b = sel ? await p6AdmDetLoad(sel, false) : false; P6.admBo = 0; if (a || b) p6Keep(render); }
    catch (e) { if (e && e.http === 429) P6.admBo = Math.min(60000, (P6.admBo || 5000) * 2); if (e && e.http === 401) return; }
    p6AdmLoop(); }, (document.hidden ? 30000 : 5000) + (P6.admBo || 0)); }
function p6TkStatePill(x) { return `<span class="pill ${x.status === 'bekliyor' ? 'p-bekliyor' : x.status === 'kapandı' ? 'p-iade' : 'p-tamam'}">${x.status === 'bekliyor' ? 'Temsilci bekliyor · ' + ago(x.queuedAt || x.t) : x.status === 'kapandı' ? 'Kapandı' + (x.rating ? ' · ★' + x.rating : '') : x.agent ? 'Görüşülüyor · ' + esc((user(x.agent) || {}).name || '') : 'Asistanla görüşüyor'}</span>`; }
function p6AdmTalepler(P) { const F = p6AdmF(P); ui.tkf = F; if (P.id && !ui.tk) ui.tk = P.id;
  const L = P6.adm.list[F]; if (!L) { p6AdmListLoad(F).then(() => render()); return { body: pLoading() }; } if (L.err) return { body: p6ErrBox(L) };
  if (!P6.admPoll) setTimeout(p6AdmLoop, 0);
  const TK = L.tickets || [], cnt = L.counts || {}, rt = L.rating || {};
  const selId = ui.tk || (TK[0] || {}).id || null; const D = selId ? P6.adm.det[selId] : null;
  if (selId && !D) p6AdmDetLoad(selId, true).then(() => p6Keep(render));
  const sel = D && D.ticket ? D.ticket : TK.find(x => x.id === selId) || null; const U = sel ? user(sel.u) : null;
  const staff = (L.agents || []).filter(s => !sel || s.id !== sel.agent);
  const actions = `<a class="state ${supportOpen() ? '' : 'off'}" href="#yonetim/destek/ayarlar"><i></i>${p6On() ? (supportOpen() ? 'Destek açık' : 'Saat dışı') : 'Destek kapalı'} · ${esc(hoursTxt())}</a><span class="state"><i></i>Memnuniyet ★ ${rt.avg != null ? (+rt.avg).toFixed(1) : '-'} <small class="muted">(${rt.n || 0})</small></span>`;
  const rateBox = F === 'kapali' && rt.n ? `<div class="panel"><div class="panel-h"><h3>Değerlendirmeler</h3><span class="muted" style="font-size:12px">${rt.n} değerlendirme · ortalama ★ ${(+rt.avg).toFixed(2)}</span></div><div class="panel-b stack">
      <div class="p6rate">${[5, 4, 3, 2, 1].map(n => { const k = (rt.dist || {})[n] || 0; return `<span>${'★'.repeat(n)}</span><i style="width:${Math.round(k / rt.n * 100)}%"></i><b>${k}</b>`; }).join('')}</div>
      ${(rt.byAgent || []).length ? `<div class="tbl-w"><table class="tbl"><thead><tr><th>Temsilci</th><th class="num">Değerlendirme</th><th class="num">Ortalama</th></tr></thead><tbody>${rt.byAgent.map(a => `<tr><td>${esc(a.name)}</td><td class="num">${a.n}</td><td class="num">★ ${(+a.avg).toFixed(2)}</td></tr>`).join('')}</tbody></table></div>` : ''}</div></div>` : '';
  const list = `<div class="tk-list"><div class="afchips tkf" style="padding:8px;border-bottom:1px solid var(--line)">${[['aktif', 'Açık', cnt.aktif], ['kapali', 'Kapalı', cnt.kapali], ['hepsi', 'Hepsi', cnt.hepsi]].map(([k, v, n]) => `<button type="button" class="afchip ${F === k ? 'on' : ''}" data-act="tkf" data-f="${k}">${v} <b>${n || 0}</b></button>`).join('')}</div>
    ${TK.length ? TK.map(x => { const XU = user(x.u) || { name: 'Üye' }; const last = x.msgs[x.msgs.length - 1] || {}; return `<button data-act="tk" data-id="${esc(x.id)}" class="${sel && sel.id === x.id ? 'on' : ''}"><b>${esc(XU.name)}</b> <span class="muted mono" style="font-size:11px">#DST-${x.no}</span>${x.unreadAgent ? `<span class="tkb">${x.unreadAgent}</span>` : ''}<br><span class="muted" style="font-size:11.5px">${esc(fullName(XU) || '')}</span><br>${esc((last.x || '').slice(0, 46))}<div style="margin-top:4px">${p6TkStatePill(x)}</div></button>`; }).join('') : '<div class="empty">Talep yok</div>'}</div>`;
  const main = `<div class="tk-main" style="display:flex;flex-direction:column;min-width:0">${sel ? `<div class="panel-h" style="flex-wrap:wrap"><button type="button" class="btn btn-sm tk-back" data-act="tk" data-id="">← Talepler</button>${av(U)}<div style="flex:1;min-width:0"><b>${esc(U.name)}</b> · ${esc(fullName(U) || '')} <span class="muted mono" style="font-size:11.5px">#DST-${sel.no}</span><div class="muted" style="font-size:12px">${seenTxt(U)}</div></div>
      ${sel.status === 'kapandı' ? p6TkStatePill(sel) : `<div class="hstack">${sel.agent === S.cur ? '' : `<button class="btn btn-sm" data-act="tk-claim" data-id="${esc(sel.id)}">Üstlen</button>`}<select class="inp" style="width:auto;padding:5px 8px;font-size:12.5px" data-change="tkxfer" data-id="${esc(sel.id)}" aria-label="Aktar"><option value="">Aktar…</option>${staff.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select><button class="btn btn-sm" data-act="tk-close" data-id="${esc(sel.id)}">Kapat</button></div>`}</div>
      <div class="chat" id="tkChat" style="flex:1">${D && D.ticket ? sel.msgs.map(m => msgHtml(m, U, true)).join('') : '<div class="msg sys">Yükleniyor…</div>'}</div>
      <form class="stack" data-form="tkreply" data-id="${esc(sel.id)}" style="padding:10px 14px;border-top:1px solid var(--line);gap:8px"><div class="hstack"><select class="inp" style="width:auto;flex:1;min-width:140px" data-change="canned" aria-label="Hazır yanıt"><option value="">Hazır yanıt seç…</option>${(S.support.canned || []).map((c, i) => `<option value="${i}">${esc(c[0])}</option>`).join('')}</select><label class="chk" for="tknote"><input type="checkbox" id="tknote"> İç not</label></div><div class="hstack" style="flex-wrap:nowrap"><input class="inp" id="tkmsg" placeholder="${sel.status === 'kapandı' ? 'Görüşme kapalı · yalnız iç not' : 'Yanıt yazın…'}" autocomplete="off" style="flex:1;min-width:0" maxlength="2000"><button class="btn btn-primary">Gönder</button></div></form>`
    : emptyBox('Destek talebi yok', 'Canlı destekten gelen mesajlar burada görünür.')}</div>`;
  const ctx = `<aside class="ctxp">${U ? `<div class="eyebrow">Üye bilgisi</div><div class="sum"><div><span class="muted">Ad soyad</span><b>${esc(fullName(U) || '-')}</b></div><div><span class="muted">Telefon</span><b class="mono">${esc(U.tel || '-')}</b></div><div><span class="muted">Bakiye</span><b class="mono">${U.bal != null ? TL(avail(U)) : '-'}</b></div><div><span class="muted">Seviye</span>${vipBadge(U)}</div></div>
      <div class="eyebrow">Son siparişleri</div>${(D && D.orders || []).map(o => `<a href="#siparis-${esc(o.id)}" class="ctxrow"><span>#${esc(o.id)} · ${esc(o.mine)}</span><span class="pill p-${esc(o.status)}">${esc(ST[o.status] || o.status)}</span></a>`).join('') || '<span class="muted" style="font-size:12px">Yok</span>'}
      <div class="hstack">${can('uye') ? `<button class="btn btn-sm" data-act="user-open" data-id="${esc(U.id)}">Üye kartı</button>` : ''}</div>` : ''}</aside>`;
  return { actions, body: `${rateBox}<div class="panel tk3 ${ui.tk && sel ? 'tk-open' : ''}">${list}${main}${ctx}</div>` }; }
function p6AdmAyarlar() { const s = S.support || {}; const H_ = s.hours || {};
  return { body: `<form class="panel" data-form="supportset"><div class="panel-h"><h3>Çalışma saatleri ve asistan</h3></div><div class="panel-b stack">
    <div class="note note-info" style="font-size:12.5px">Saatler Türkiye saatine (UTC+3) göredir. Saat dışında sitede "Canlı Destek" düğmesi görünür, kural tabanlı asistan sık sorulara yanıt verir ve temsilci isteği sıraya alınır. Mobilde alt çubuktaki Destek saat dışında Yardım penceresini (WhatsApp hattı) açar. "Kapalı" seçilirse canlı destek tamamen gizlenir.</div>
    <div class="fld"><span class="lbl">Destek durumu</span><div class="hstack" style="flex-wrap:wrap">${[['auto', 'Saatlere göre otomatik'], ['open', 'Şimdi açık (saatleri yok say)'], ['closed', 'Kapalı (canlı destek gizlenir)']].map(([k, v]) => `<label class="chk" for="sp_m_${k}"><input type="radio" name="sp_mode" id="sp_m_${k}" value="${k}" ${s.mode === k ? 'checked' : ''}> ${v}</label>`).join('')}</div></div>
    <div class="hours">${[1, 2, 3, 4, 5, 6, 0].map(d => { const [o, c, on] = H_[d] || ['09:00', '24:00', false]; return `<div><label class="chk" for="sh_on_${d}"><input type="checkbox" id="sh_on_${d}" ${on ? 'checked' : ''}> <b>${DAYS[d]}</b></label><input class="inp mono" type="time" id="sh_o_${d}" value="${esc(o)}" aria-label="${DAYS[d]} açılış"><span class="muted">–</span><input class="inp mono" type="time" id="sh_c_${d}" value="${c === '24:00' ? '23:59' : esc(c)}" aria-label="${DAYS[d]} kapanış"></div>`; }).join('')}</div>
    <div class="row2"><div class="fld"><label for="sp_an">Asistan adı</label><input class="inp" id="sp_an" value="${esc(s.aiName || '')}" maxlength="40"></div><div class="fld"><label for="sp_wait">Ortalama yanıt süresi (gösterilen)</label><input class="inp" id="sp_wait" value="${esc(s.wait || '2 dk')}" maxlength="20"></div></div>
    <div class="fld"><label for="sp_off">Saat dışında gösterilen mesaj</label><textarea class="inp" id="sp_off" style="min-height:60px" maxlength="400">${esc(s.offline || '')}</textarea></div>
    <div class="fld"><label for="sp_can">Hazır yanıtlar (her satır: Başlık | Metin · {temsilci} yerine temsilcinin adı gelir)</label><textarea class="inp" id="sp_can" style="min-height:140px">${esc((s.canned || []).map(c => c[0] + ' | ' + c[1]).join('\n'))}</textarea></div>
    <span class="muted" style="font-size:12.5px">Asistan kural tabanlıdır (yapay zekâ kapalı); sık sorulara hazır yanıt verir, şifre veya kod asla istemez. Sitenin alt bilgisinde görünen kısa "Destek saatleri" metni ayrıdır: <a href="#yonetim/ayar/genel">Site ayarları › Genel</a></span></div>${aSave('Destek ayarlarını kaydet')}</form>` }; }

/* ================= yönetim: engellenen mesajlar [mesaj] ================= */
function p6FlLoad() { if (P6.flLoad) return; P6.flLoad = true;
  call('GET', 'admin/flagged?f=tumu', null, { quiet: true }).then(j => { const d = j.data || {}; (d.users || []).forEach(apiUpsertUser); S.flagged = d.flagged || []; p2QSet('flagged', d.pending || 0); P6.fl = { t: Date.now() }; },
    e => { P6.fl = { err: apiErr(e), t: Date.now() }; }).finally(() => { P6.flLoad = false; render(); }); }

/* ================= yönetim: mesaj şablonları [sms] ================= */
function p6TplLoad() { if (P6.tplLoad) return; P6.tplLoad = true;
  call('GET', 'admin/templates', null, { quiet: true }).then(j => { P6.tpl = j.data || {}; }, e => { P6.tpl = { err: apiErr(e) }; }).finally(() => { P6.tplLoad = false; render(); }); }
function p6WaPrev(x, fixed) { const ch = (P6.tpl && P6.tpl.channels) || {};
  if (fixed) return `<div class="phone wa"><small>WhatsApp · ${esc(ch.waOtpTpl || 'yangpazar_kod')} (kimlik doğrulama)</small><p><b>482913</b> doğrulama kodunuzdur. Güvenliğiniz için bu kodu kimseyle paylaşmayın.</p><small>[ Kodu kopyala ]</small></div><div class="muted" style="font-size:11.5px;margin-top:4px">Metni Meta belirler; yalnız kod değişir.</div>`;
  const m = smsFill(x || ''); return `<div class="phone wa"><small>WhatsApp · ${esc(ch.waNoteTpl || 'yangpazar_bildirim')} (bildirim)</small><p>${esc(m) || '<span class="muted">Mesaj boş</span>'}</p></div><div class="muted" style="font-size:11.5px;margin-top:4px">${m.length} / 900 karakter · Meta şablonunun {{1}} değişkeni</div>`; }
const p6MailVars = { link: (S && S.set && S.set.siteUrl ? String(S.set.siteUrl).replace(/\/$/, '') : location.origin) + '/#sifre-…' };
function p6TplPage() { const d = P6.tpl; if (!d) { p6TplLoad(); return { body: pLoading() }; } if (d.err) return { body: p6ErrBox(d) };
  const L = d.templates || []; if (!L.length) return { body: emptyBox('Şablon yok', '') };
  const k = L.some(t => t.k === ui.tplk) ? ui.tplk : L[0].k; const T = L.find(t => t.k === k), ch = d.channels || {};
  S.mail.fromName = ch.fromName || S.set.siteName; S.mail.from = ch.from || '';
  const chip = (on, l) => `<i class="${on ? 'ok' : ''}">${l} ${on ? 'açık' : 'kapalı'}</i>`;
  const list = `<div class="panel tpl-list"><div class="panel-h"><h3>Şablonlar</h3></div>${L.map(x => `<button class="${x.k === k ? 'on' : ''}" data-act="tplk" data-k="${esc(x.k)}"><b>${esc(x.name)}</b><span>${x.mail ? chip(x.mail.on, 'E-posta') : ''}${x.wa ? (x.wa.fixed ? '<i class="ok">WhatsApp · Meta şablonu</i>' : chip(x.wa.on, 'WhatsApp')) : ''}</span></button>`).join('')}</div>`;
  const M = T.mail, W = T.wa;
  const form = `<form class="panel tpl-form" data-form="tplsave" data-k="${esc(k)}"><div class="panel-h" style="flex-wrap:wrap"><div><h3>${esc(T.name)}</h3><span class="muted" style="font-size:12px"><b>Ne zaman:</b> ${esc(T.when)} · <b>Kime:</b> ${esc(T.to)}</span></div><div class="hstack"><button type="button" class="btn btn-sm" data-act="tpldef" data-k="${esc(k)}" ${(M && M.custom) || (W && W.custom) ? '' : 'disabled'}>Varsayılana döndür</button></div></div>
    <div class="panel-b stack">
      <div class="tplvars"><span class="muted">Değişken ekle (imlecin olduğu yere):</span>${Object.entries(d.vars || {}).map(([v, l]) => `<button type="button" class="chip" data-act="tpvar" data-v="${esc(v)}" title="${esc(l)}">${esc(v)}</button>`).join('')}</div>
      ${M ? `<section class="tplsec"><div class="tplsec-h"><b>E-posta</b><label class="chk" for="tp_me"><input type="checkbox" id="tp_me" ${M.on ? 'checked' : ''} ${T.always ? 'disabled title="Her zaman gönderilir"' : ''}> ${T.always ? 'Her zaman gönderilir' : 'Gönderilsin'}</label></div>
        ${ch.mail ? '' : '<div class="note note-warn">E-posta gönderimi kapalı; şablon kaydedilir ama e-posta gitmez. <a href="#yonetim/sms/eposta">E-posta ayarları</a></div>'}
        ${M.needCode ? '<div class="note note-info">Bu e-postada <b class="mono">{kod}</b> değişkeni zorunludur; üyeye giden kod oraya yazılır.' + (k === 'reset' ? ' <b class="mono">{link}</b> tek kullanımlık sıfırlama bağlantısıdır.' : '') + '</div>' : ''}
        <div class="tplgrid"><div class="stack" style="gap:8px;min-width:0"><div class="fld"><label for="tp_ms">Konu</label><input class="inp" id="tp_ms" value="${esc(M.s)}" data-change="tplprev" maxlength="200"></div><div class="fld"><label for="tp_mb">Metin</label><textarea class="inp" id="tp_mb" rows="9" data-change="tplprev" maxlength="5000">${esc(M.b)}</textarea></div></div><div id="tpv_m">${mailPreview(M.s, M.b, p6MailVars)}</div></div></section>` : ''}
      ${W ? `<section class="tplsec"><div class="tplsec-h"><b>WhatsApp</b>${W.fixed ? '<span class="pill p-tamam">Meta şablonu · sabit</span>' : `<label class="chk" for="tp_se"><input type="checkbox" id="tp_se" ${W.on ? 'checked' : ''}> Gönderilsin</label>`}</div>
        ${W.fixed ? `<div class="note note-info">Bu ileti Meta'da onaylı <b>kimlik doğrulama</b> şablonuyla (<b class="mono">${esc(ch.waOtpTpl || 'yangpazar_kod')}</b>) gider. Metni Meta belirler ve buradan değiştirilemez; yalnız 6 haneli kod gönderilir.</div><div class="tplgrid"><div></div><div id="tpv_s">${p6WaPrev('', true)}</div></div>`
          : `${ch.waNote ? '' : '<div class="note note-warn">WhatsApp bildirimleri kapalı (bildirim şablonu ayarlanmamış); metin kaydedilir ama WhatsApp gitmez. <a href="#yonetim/sms/whatsapp">WhatsApp ayarları</a></div>'}
          <div class="tplgrid"><div class="fld" style="min-width:0"><label for="tp_sb">WhatsApp metni (bizim taraf)</label><textarea class="inp" id="tp_sb" rows="4" data-change="tplprev" maxlength="900">${esc(W.x)}</textarea><span class="muted" style="font-size:11.5px">Bu metin Meta'da onaylı bildirim şablonunuzun (<b class="mono">${esc(ch.waNoteTpl || 'yangpazar_bildirim')}</b>) {{1}} değişkenine yazılır; şablonun kendisi Meta'da sabittir. Tek satır, en çok 900 karakter.</span></div><div id="tpv_s">${p6WaPrev(W.x)}</div></div>`}</section>` : ''}
    </div>${aSave('Şablonu kaydet')}</form>`;
  return { desc: 'Bildirim e-postalarının konu ve metnini, WhatsApp bildirimlerinde bizim tarafımızdaki metni düzenleyin. Doğrulama kodu ve şifre sıfırlama WhatsApp iletileri Meta şablonudur ve değişmez.', body: `<div class="tpled p6tpl">${list}${form}</div>` }; }

/* ================= yönetim sayfaları ================= */
{ const v0 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (!isPanel()) return v0(P);
    const it = admItem(P.k); if (!it || !admVis(it)) return v0(P);
    if (it.k === 'destek') { p2AdmToday(); return pAdmPage(P, it, sub => sub === 'ayarlar' ? p6AdmAyarlar() : p6AdmTalepler(P)); }
    if (it.k === 'mesaj') { p2AdmToday(); if (!P6.fl || Date.now() - P6.fl.t > 30000) p6FlLoad(); if (!P6.fl) return pAdmPage(P, it, () => ({ body: pLoading() })); if (P6.fl.err) return pAdmPage(P, it, () => ({ body: p6ErrBox(P6.fl) })); return v0(P); }
    if (it.k === 'sms') { const sub = P.sub && admSubs(it).some(s => s.s === P.sub) ? P.sub : (admSubs(it)[0] || {}).s; if (sub === 'sablonlar') return pAdmPage(P, it, () => p6TplPage()); }
    return v0(P); }; }
}
