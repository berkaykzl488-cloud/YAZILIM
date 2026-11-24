/* ================== mobil alt sekme çubuğu (≤760 px) + ortak alt pencere (sheet) ==================
   Destek · Pazar · Ana sayfa · Borsa · Hesabım. Çubuk #cats içinde çizilir (temiz adres dönüştürmesi #cats bağlantılarını da kapsar)
   ve YALNIZ matchMedia('(max-width:760px)') doğruyken DOM'a girer: masaüstü (1280 px anlık görüntü) DOM'u değişmez.
   Gizlenir: klavye açık (html.kbd), modal/alt pencere açık, ☰ çekmece açık, canlı destek paneli açık (CSS); Yönetim, gömülü pencere
   ve ziyaretçi bakım modunda hiç eklenmez. Dinleyiciler data-mtab üzerinden (data-act değil): bakım modunda da çalışır (43-mnav gibi).
   MTAB.destek / MTAB.pazar / MTAB.todo / MTAB.exCall prod dosyalarınca değiştirilebilir.                                              */
Object.assign(MNI, {
  destek:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/><path d="M19 20a3 3 0 0 1-3 2h-3"/>',
  pazar:'<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 11z"/><path d="M5 13v7h14v-7"/><path d="M10 20v-4h4v4"/>',
  ara:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  wa:'<path d="M20.5 11.6A8.5 8.5 0 0 1 8 19l-4.5 1.3L4.8 16A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M9 8.5c0 3.5 2.6 6.4 6.3 6.8l1.1-1.6-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/>',
  saat:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  siparis:'<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>'
});
const MTAB_MQ = window.matchMedia ? window.matchMedia('(max-width:760px)') : null;
const mtabMob = () => !!(MTAB_MQ && MTAB_MQ.matches);
const MTAB_PAZAR = r => /^(metin2-(tr|pvp|ep)|serverler|kategori-|server-|ara$|uye-)/.test(r) || (r.startsWith('ilan-') && r !== 'ilan-ver');
const MTAB_HES = r => r === 'hesabim' || r === 'bildirimler' || r.startsWith('mesajlar') || r.startsWith('siparis-') || r === 'ilan-ver';
const MTAB = {
  /** Destek: canlı destek balonu varsa (demo; P6'da prod) onu açar, yoksa Yardım penceresi */
  destek(btn) { const fab = $('#ls .ls-fab'); if (fab) { fab.click(); return; } mtabHelp(btn); },
  pazar(btn) { sheetOpen(sheetWrap('Pazar', mtabPazarBody(), { id: 'pazar' }), btn); },
  /** Hesabım rozeti: yapılacak iş sayısı (demo: yerel durum; prod: boot/me/summary todo) */
  todo() { const u = me(); if (!u || u.admin) return 0;
    const O = S.orders || [], X = S.exOrders || [];
    return O.filter(o => (o.seller === u.id && o.status === 'odendi') || (o.buyer === u.id && o.status === 'teslim') || ((o.buyer === u.id || o.seller === u.id) && o.status === 'itiraz')).length
      + X.filter(o => o.u === u.id && exOpenSt(o.status) && (o.status === 'bilgi' || (o.called && !(o.ready > o.called)))).length; },
  /** Borsa noktası: operatör üyeyi bekliyor */
  exCall() { const u = me(); return !!u && (S.exOrders || []).some(o => o.u === u.id && exOpenSt(o.status) && o.called && !(o.ready > o.called)); }
};
function mtabOn(r) { r = r || route(); return mtabMob() && !(maintOn() && !isPanel()) && !r.startsWith('widget-') && !(isAdmRoute(r) && isPanel()); }
function mtabHtml(r) {
  const u = me(), cur = MTAB_PAZAR(r) ? 'pazar' : MTAB_HES(r) ? 'hesabim' : r;
  const open = k => ui.mtabOpen === k;
  const ic = k => `<span class="mtab-ic">${mni(k)}</span>`, lb = t => `<span class="mtab-l">${esc(t)}</span>`;
  const n = u ? +MTAB.todo() || 0 : 0, call = u ? !!MTAB.exCall() : false;
  const btn = (k, t, x) => `<button type="button" class="mtab-i${cur === k ? ' on' : ''}" data-mtab="${k}" aria-haspopup="dialog" aria-expanded="${open(k) ? 'true' : 'false'}">${ic(k)}${lb(t)}${x || ''}</button>`;
  const lnk = (k, t, x, sr) => `<a href="#${k}" class="mtab-i${cur === k ? ' on' : ''}" data-mtab="${k}"${r === k ? ' aria-current="page"' : ''}>${ic(k)}${lb(t)}${x || ''}${sr ? `<span class="vh">${esc(sr)}</span>` : ''}</a>`;
  const acc = u ? lnk('hesabim', 'Hesabım', n ? `<b class="mtab-b" aria-hidden="true">${n > 99 ? '99+' : n}</b>` : '', n ? `${n} bekleyen iş` : '')
    : `<button type="button" class="mtab-i" data-mtab="giris" aria-haspopup="dialog">${ic('giris')}${lb('Giriş')}</button>`;
  return btn('destek', 'Destek') + btn('pazar', 'Pazar') + lnk('home', 'Ana sayfa')
    + lnk('borsa', 'Borsa', call ? '<i class="mtab-dot" aria-hidden="true"></i>' : '', call ? 'Operatör seni bekliyor' : '') + acc;
}
/** Çubuğu ekler / günceller / kaldırır. HTML aynıysa dokunmaz (odak kaybolmasın). */
function mtabSync(r) { r = r || route();
  const c = $('#cats'); let n = $('#mtab');
  if (!c || !mtabOn(r)) { if (n) n.remove(); document.body.classList.remove('has-mtab'); return; }
  if (!n) { n = document.createElement('nav'); n.id = 'mtab'; n.className = 'mtab'; n.setAttribute('aria-label', 'Alt menü'); c.appendChild(n); }
  else if (n.parentNode !== c) c.appendChild(n);
  const h = mtabHtml(r); if (n.dataset.h !== h) { n.dataset.h = h; n.innerHTML = h; mtabLinks(n); }
  document.body.classList.add('has-mtab'); }
/** Temiz adres kipi: #rota → /rota (90-seo.js ile aynı kural; data-h tıklamada kullanılır) */
function mtabLinks(root) { if (!root || typeof seoClean !== 'function' || !seoClean() || document.body.classList.contains('adm-mode')) return;
  root.querySelectorAll('a[href^="#"]').forEach(a => { const h = a.getAttribute('href').slice(1); if (!h || isAdmRoute(h)) return; a.dataset.h = h; a.setAttribute('href', routeHref(h)); }); }
{ const rc0 = renderCats; renderCats = function (r) { rc0(r); mtabSync(r); }; }
{ const rh0 = renderHeader; renderHeader = function () { rh0(); if ($('#cats')) mtabSync(); }; }
/* genişlik 760 sınırını geçince: borsa ve Hesabım genişliğe göre çizildiği için yeniden çizilir, açık alt pencere kapanır.
   Geçici değişimler (ör. tam sayfa ekran görüntüsü) yeniden çizim yapmaz: 300 ms bekler, son çizimdeki durumla karşılaştırır. */
MTAB.lastMob = null;
{ const rc1 = renderCats; renderCats = function (r) { MTAB.lastMob = mtabMob(); return rc1.apply(this, arguments); }; }
if (MTAB_MQ) { let mt = 0; const ch = () => { clearTimeout(mt); mt = setTimeout(() => { if (!document.body || mtabMob() === MTAB.lastMob) return;
    if ($('#modal .md.sheet')) closeModal(); if (/^(borsa|hesabim)$/.test(route())) render(); else { MTAB.lastMob = mtabMob(); mtabSync(); } }, 300); };
  if (MTAB_MQ.addEventListener) MTAB_MQ.addEventListener('change', ch); else if (MTAB_MQ.addListener) MTAB_MQ.addListener(ch); }

/* ---------- ortak alt pencere: mobilde alttan, masaüstünde ortalanmış modal ----------
   sheetWrap(başlık, gövde, {cls, id, label, foot, form, attrs}) — form: gövde + alt bölümü saran <form> öznitelikleri (ör. 'data-form="exorder"') */
function sheetWrap(title, body, o) { o = o || {};
  return `<div class="md sheet${o.cls ? ' ' + o.cls : ''}" role="dialog" aria-modal="true" aria-label="${esc(o.label || String(title).replace(/<[^>]+>/g, ''))}"${o.id ? ` data-sheet="${esc(o.id)}"` : ''}${o.attrs ? ' ' + o.attrs : ''}><div class="sheet-grip" aria-hidden="true"></div><div class="md-h"><h3>${title}</h3><button type="button" class="md-x" data-act="close" aria-label="Kapat">×</button></div>${o.form ? `<form class="sh-form" ${o.form}>` : ''}<div class="md-b">${body}</div>${o.foot ? `<div class="sheet-f">${o.foot}</div>` : ''}${o.form ? '</form>' : ''}</div>`; }
const SHEET = { opener: null, key: null };
const sheetFoc = () => { const d = $('#modal .md[aria-modal="true"]'); return d ? [...d.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null || x === document.activeElement) : []; };
/** Pencereyi açar; kapanınca odak açan öğeye döner (yeniden çizildiyse aynı data-mtab / data-sheet-opener öğesine). */
function sheetOpen(html, opener) {
  const a = opener || document.activeElement;
  SHEET.opener = a && a !== document.body ? a : null; SHEET.key = a && a.dataset ? (a.dataset.mtab || a.dataset.sheetOpener || null) : null;
  ui.mtabOpen = a && a.dataset && a.dataset.mtab ? a.dataset.mtab : null;
  modal(html); const mb = $('#modal .mb'); if (mb) { mb.classList.add('mb-sheet'); if (mb.querySelector('.md.side')) mb.classList.add('mb-side'); }
  mtabLinks($('#modal')); if (ui.mtabOpen) document.querySelectorAll(`#mtab [data-mtab="${ui.mtabOpen}"]`).forEach(b => b.setAttribute('aria-expanded', 'true'));
  setTimeout(() => { const f = sheetFoc()[0]; if (f && !$('#modal').contains(document.activeElement)) f.focus({ preventScroll: true }); }, 30); }
function sheetRestore() { if (!SHEET.opener && !SHEET.key) return; const o = SHEET.opener, k = SHEET.key; SHEET.opener = SHEET.key = null;
  const was = ui.mtabOpen; ui.mtabOpen = null; if (was) document.querySelectorAll(`#mtab [data-mtab="${was}"]`).forEach(b => b.setAttribute('aria-expanded', 'false'));
  const a = document.activeElement; if (a && a !== document.body && a.isConnected && !$('#modal').contains(a)) return;
  const t = o && o.isConnected ? o : (k ? document.querySelector(`#mtab [data-mtab="${k}"], [data-sheet-opener="${k}"]`) : null);
  // çubuk görünürlük geçişindeyken (visibility) odak alamaz: kısa gecikmeyle
  if (t) setTimeout(() => { const b = t.isConnected ? t : (k ? document.querySelector(`#mtab [data-mtab="${k}"], [data-sheet-opener="${k}"]`) : null); const c = document.activeElement; if (b && (!c || c === document.body)) try { b.focus({ preventScroll: true }); } catch (e) { } }, 60); }
{ const m = $('#modal'); if (m && window.MutationObserver) new MutationObserver(() => { if (!m.querySelector('.mb')) sheetRestore(); else if (!m.querySelector('.md.sheet')) { SHEET.opener = SHEET.key = null; ui.mtabOpen = null; } }).observe(m, { childList: true }); }
document.addEventListener('keydown', e => { if (e.key !== 'Tab' || !$('#modal .md[aria-modal="true"]')) return; const F = sheetFoc(); if (!F.length) return;
  const a = F[0], z = F[F.length - 1], cur = document.activeElement;
  if (!$('#modal').contains(cur)) { e.preventDefault(); a.focus(); return; }
  if (e.shiftKey && cur === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); } });

/* ---------- Pazar ve Yardım pencereleri ---------- */
const mtabRow = (href, k, t, s, x) => `<a href="#${href}" class="mn-i sh-i"${x || ''}><span class="mn-ic">${mni(k)}</span><span class="sh-t"><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span><span class="sh-go" aria-hidden="true">›</span></a>`;
function mtabPazarBody() { const pvp = (S.servers || []).filter(s => s.sec === 'pvp').length;
  return `<div class="sh-list">${mtabRow('metin2-tr', 'metin2-tr', 'Metin2 TR', 'Won, item, karakter')}${mtabRow('metin2-pvp', 'metin2-pvp', 'Metin2 PVP serverlar', pvp ? pvp + ' server' : 'PVP serverlar')}${mtabRow('metin2-ep', 'metin2-ep', 'Metin2 EP', 'Anında kod')}
    <button type="button" class="mn-i sh-i" data-mtab="ara"><span class="mn-ic">${mni('ara')}</span><span class="sh-t"><b>İlanlarda ara</b><small>Server, item, won, ilan no</small></span></button></div>
    <a href="#ilan-ver" class="btn btn-primary btn-block sh-cta">+ İlan ver</a>`; }
/** Yardım (P6 canlı destek gelene kadar): WhatsApp (S.set.whatsapp doluysa), Güvenli Alışveriş & SSS, çalışma saatleri */
function mtabHelpBody() { const u = me(); let wa = String(S.set.whatsapp || '').replace(/\D/g, ''); if (/^0\d{10}$/.test(wa)) wa = '90' + wa.slice(1); else if (/^5\d{9}$/.test(wa)) wa = '90' + wa; const hrs = String(S.set.supportHours || '').trim();
  return `<div class="sh-list">
    ${wa ? `<a class="mn-i sh-i sh-wa" href="https://wa.me/${wa}" target="_blank" rel="noopener"><span class="mn-ic">${mni('wa')}</span><span class="sh-t"><b>WhatsApp destek hattı</b><small>Mesajla yazın, ekibimiz yanıtlasın</small></span><span class="sh-go" aria-hidden="true">›</span></a>` : ''}
    ${mtabRow('guvenli', 'guvenli', 'Güvenli Alışveriş & SSS', 'Havuz sistemi, teslimat, iade')}
    ${u ? `<a href="#hesabim" class="mn-i sh-i" data-act="tab" data-t="alis"><span class="mn-ic">${mni('siparis')}</span><span class="sh-t"><b>Siparişimle ilgili sorun</b><small>Hesabım › Siparişlerim</small></span><span class="sh-go" aria-hidden="true">›</span></a>
      <a href="#hesabim" class="mn-i sh-i" data-act="tab" data-t="borsa"><span class="mn-ic">${mni('borsa')}</span><span class="sh-t"><b>Borsa işlemim</b><small>Hesabım › Borsa işlemlerim</small></span><span class="sh-go" aria-hidden="true">›</span></a>` : ''}
    ${mtabRow('rehber', 'rehber', 'Rehber', 'Nasıl alınır, nasıl satılır')}</div>
    ${hrs ? `<div class="sh-hrs"><span class="mn-ic">${mni('saat')}</span><span><b>Destek saatleri</b><small>${esc(hrs)}</small></span></div>` : ''}
    <div class="note note-info sh-note">Ekibimiz sizden asla şifre veya doğrulama kodu istemez.</div>`; }
function mtabHelp(btn) { sheetOpen(sheetWrap('Yardım', mtabHelpBody(), { id: 'yardim' }), btn); }

document.addEventListener('click', e => {
  const t = e.target.closest('[data-mtab]'); if (!t) { if (e.target.closest('#modal .md.sheet a[href]') && !e.target.closest('a[target=_blank]')) setTimeout(() => { if ($('#modal .md.sheet')) closeModal(); }, 0); return; }
  const k = t.dataset.mtab;
  if (k === 'destek') { e.preventDefault(); return MTAB.destek(t); }
  if (k === 'pazar') { e.preventDefault(); return MTAB.pazar(t); }
  if (k === 'giris') { e.preventDefault(); return mLogin(); }
  if (k === 'ara') { e.preventDefault(); closeModal(); window.scrollTo(0, 0); setTimeout(() => { const i = $('#q'); if (i) i.focus(); }, 30); return; }
  if (k === 'hesabim' && route() === 'hesabim') { e.preventDefault(); ui.tab = 'ozet'; render(); window.scrollTo(0, 0); return; }
});
/* klavye: metin alanı odaktayken çubuk gizlenir (yedek: visualViewport yüksekliği) */
{ const INP = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=range]),textarea,select,[contenteditable],[contenteditable=""]'; let kt = 0;
  const isInp = el => !!(el && el.matches && el.matches(INP));
  document.addEventListener('focusin', e => { if (isInp(e.target)) { clearTimeout(kt); document.documentElement.classList.add('kbd'); } });
  document.addEventListener('focusout', () => { clearTimeout(kt); kt = setTimeout(() => { if (!isInp(document.activeElement)) document.documentElement.classList.remove('kbd'); }, 100); });
  const vv = window.visualViewport; if (vv) vv.addEventListener('resize', () => document.documentElement.classList.toggle('kbd-vv', vv.height < window.innerHeight * 0.75)); }
