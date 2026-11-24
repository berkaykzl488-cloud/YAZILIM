/* ================== Yang Borsası kartları: işleyiciler (demo ve prod ortak) ==================
   51-borsa-kart.js ekranlarının eylemleri. AL / SAT pencerelerindeki formlar FORM.exorder / FORM.exoffer'dır; gönderim BXD.al / BXD.sat
   (demo: tarayıcıdaki durum; prod: 98x-borsa-kart.js aynı uç, aynı alanlar, form başına tek Idempotency-Key). Başarıda pencere kapanır,
   doğrulama hatasında hatalı alanın adımına dönülür. Girişsiz AL/SAT: giriş penceresi açılır (prod girişten sonra aynı pencereyi açar).   */
const bxX = id => S.exchange.find(e => e.id === id && e.on);
const BX_AFTER = 'yp_after';
function bxOpen(dir, id, el) { const x = bxX(id); if (!x) return toast('Bu server şu an borsada değil.', true);
  if (!me()) { try { sessionStorage.setItem(BX_AFTER, JSON.stringify({ k: 'bx', id, dir, t: Date.now() })); } catch (e) { } mLogin(); return; }
  ui.exId = x.id; sheetOpen(dir === 'al' ? bxAlSheet(x) : bxSatSheet(x), el);
  const q = $('#ex_qty'); if (q) q.dispatchEvent(new Event('input', { bubbles: true })); }
Object.assign(ACT, {
  'bx-al': (d, e) => bxOpen('al', d.id, e && e.target && e.target.closest('[data-act]')),
  'bx-sat': (d, e) => bxOpen('sat', d.id, e && e.target && e.target.closest('[data-act]')),
  'bx-sec': (d) => { ui.bxSec = d.s || 'hepsi'; bxSave(); render(); },
  'bx-q': (d) => { const i = $('#ex_qty'); if (!i) return; i.value = Math.max(1, (parseInt(i.value, 10) || 1) + (+d.d || 0)); i.dispatchEvent(new Event('input', { bubbles: true })); },
  'bx-qs': (d) => { const i = $('#ex_qty'); if (!i) return; i.value = +d.v || 1; i.dispatchEvent(new Event('input', { bubbles: true })); },
  'bx-step': (d) => bxStep(+d.s || 1, true)
});
/* ana sayfadaki borsa satırı: kartı vurgulayıp görünür yapar */
{ const f0 = ACT['ex-pick']; ACT['ex-pick'] = (d, e) => { ui.exPick = d.id; if (ui.bxSec && ui.bxSec !== 'hepsi') { const x = S.exchange.find(z => z.id === d.id); if (x && bxSrv(x).sec !== ui.bxSec) ui.bxSec = 'hepsi'; }
    const r = f0(d, e); setTimeout(() => { const c = document.querySelector(`#bxGrid .bx-card[data-id="${CSS.escape(String(d.id))}"]`); if (c) try { c.scrollIntoView({ block: 'center' }); } catch (x) { } }, 60); return r; }; }
CHG['bx-sort'] = (el) => { ui.bxSort = el.value; bxSave(); const g = $('#bxGrid'); if (g) g.innerHTML = bxGridHtml(); else render(); };
/* arama: yalnız kartların görünürlüğü değişir (odak kaybolmaz) */
document.addEventListener('input', e => { const el = e.target; if (!el || el.id !== 'bx_q') return; ui.bxQ = el.value; const q = sqNorm(el.value); let n = 0;
  document.querySelectorAll('#bxGrid .bx-card').forEach(c => { const ok = !q || c.dataset.sn.includes(q); c.hidden = !ok; if (ok) n++; });
  const em = $('#bx_empty'); if (em) em.hidden = n > 0; });
/* pencere içi canlı hesap (82-chg ex-calc'tan sonra): AL bakiye / eksik tutar, net stoğa göre sıra notu; SAT özet satırı */
function bxCalc() { const f = $('#modal .bx-sheet form'); if (!f) return; const x = bxX(ui.exId); if (!x) return; const q = Math.max(1, parseInt(v_('ex_qty'), 10) || 1);
  if (f.dataset.form === 'exorder') { const u = me(), tot = r2(q * (exSellPrice(x) || 0)), av = avail(u), miss = r2(tot - av), net = bxNet(x);
    const b = $('#bx_bal'); if (b) b.textContent = miss > 0 ? `Bakiyen ${TL(av)} · ${TL(miss)} eksik` : `Bakiyen ${TL(av)} → kalan ${TL(r2(av - tot))}`;
    const go = f.querySelector('button.exgo'), dep = f.querySelector('.bx-dep'); if (go && dep) { go.hidden = miss > 0; dep.hidden = !(miss > 0); dep.textContent = `Bakiye yükle · ${TL(miss)} eksik`; }
    const w = $('#ex_waitbox'), wm = $('#ex_waitmsg'); if (w) { w.hidden = q <= net; if (wm && q > net) wm.textContent = net > 0 ? `Satışta şu an ${NUM(net)} adet var. Siparişin alınır; kalan ${NUM(q - net)} adet yeni satış emirleri geldikçe tamamlanır. Fiyat değişmez.` : 'Şu an satıcı yok. Siparişin alınır ve sıraya girer; satış emirleri geldikçe tamamlanır. Fiyat değişmez.'; } }
  else { const p = Math.min(+v_('ex_price') || 0, +x.max), s = $('#bx_sum'); if (s) s.textContent = `${NUM(q)} × ${TL(p)} · emrini dilediğin an iptal edebilirsin`; } }
['input', 'change'].forEach(t => document.addEventListener(t, e => { if (e.target && e.target.closest && e.target.closest('#modal .bx-sheet')) bxCalc(); }));
/** SAT adımları: ileri giderken o adımın alanları denetlenir; hata alanı hangi adımdaysa oraya dönülür */
function bxStep(n, check) { const f = $('#modal .bx-sheet form[data-form=exoffer]'); if (!f) return false; const cur = +f.dataset.step || 1;
  if (check && n > cur) { const bad = [...f.querySelectorAll(`section[data-step="${cur}"] input, section[data-step="${cur}"] select`)].find(el => !el.checkValidity()); if (bad) { bad.reportValidity(); return false; } }
  f.dataset.step = String(n); f.querySelectorAll('section[data-step]').forEach(s => { s.hidden = s.dataset.step !== String(n); });
  f.querySelectorAll('[data-foot]').forEach(s => { s.hidden = s.dataset.foot !== String(n); }); const t = $('#bx_stp'); if (t) t.textContent = n + '/2';
  const b = f.querySelector('.md-b'); if (b) b.scrollTop = 0;
  // gizlenen Devam/Geri düğmesindeki odak adımın kendisine taşınır (eşzamanlı; klavyeyi kendiliğinden açmaz)
  const a = document.activeElement; if (!a || a === document.body || a.closest('[hidden]') || a.closest('[data-foot]')) { const sec = f.querySelector(`section[data-step="${n}"]`); if (sec) { sec.tabIndex = -1; sec.focus({ preventScroll: true }); } }
  return true; }
const bxStepOf = k => /^(ex_qty|ex_price|qty|price)$/.test(k) ? 1 : 2;
/** AL penceresi: tek adım */
function bxFormAl(f) { const bad = [...f.querySelectorAll('input,select')].find(el => !el.checkValidity()); if (bad) { bad.reportValidity(); return; }
  return BXD.busy(f, (async () => { const u = me(); if (!u) return mLogin(); if (!S.set.exOn) return toast('Siteden yang alımı şu an kapalı. ' + (S.set.exOffMsg || ''), true);
    const x = bxX(ui.exId); if (!x) return toast('Server seçin.', true);
    const q = parseInt(v_('ex_qty'), 10); if (!(q >= 1)) return toast('Geçerli bir adet girin.', true);
    try { const j = await BXD.al(f, x, q); closeModal(); toast(j.msg || 'Siparişiniz sıraya alındı.'); ui.tab = 'borsa'; ui.hsBx = 'al'; go('hesabim'); }
    catch (j) { toast(BXD.err(j), true); if (j && j.code === 'insufficient') bxCalc(); throw j; } })()); }
/** SAT penceresi: iki adım (1: adet + fiyat, 2: hesap bilgileri + onay) */
function bxFormSat(f) { if ((+f.dataset.step || 1) < 2) return bxStep(2, true);
  const bad = [...f.querySelectorAll('section[data-step="2"] input, section[data-step="2"] select')].find(el => !el.checkValidity()); if (bad) { bad.reportValidity(); return; }
  return BXD.busy(f, (async () => { const u = me(); if (!u) return mLogin(); if (!S.set.exOn) return toast('Satış emri verme şu an kapalı. ' + (S.set.exOffMsg || ''), true);
    const x = bxX(ui.exId); if (!x) return toast('Server seçin.', true);
    const q = parseInt(v_('ex_qty'), 10); if (!(q >= 1)) { bxStep(1); return toast('Geçerli bir adet girin.', true); }
    try { const j = await BXD.sat(f, x, q); closeModal(); toast(j.msg || 'Emriniz yayında.'); render(); setTimeout(() => { const m = $('#bxMine'); if (m) try { m.scrollIntoView({ block: 'start' }); } catch (e) { } }, 120); }
    catch (j) { toast(BXD.err(j), true); const k = j && j.fields ? Object.keys(j.fields).find(z => j.fields[z]) : null;
      if (k) { bxStep(bxStepOf(k)); setTimeout(() => { const el = document.getElementById(k); if (el) el.focus(); }, 60); } throw j; } })()); }
FORM.exorder = bxFormAl;
FORM.exoffer = bxFormSat;
/* karttaki emir iptali: yanlış dokunmaya karşı onay (prod 98x, 98p4'ün API işleyicisini yeniden sarar) */
function bxWrapCancel() { const f0 = ACT['of-cancel']; ACT['of-cancel'] = (d, e) => { const el = e && e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el || !el.dataset.bxc || d.ok) return f0(d, e);
    openConfirm({ t: 'Emri iptal et?', d: 'Satıştaki adetler sıradan çıkar. Eşlenmiş ama teslim edilmemiş adetler operatörde kalır.', ok: 'Emri iptal et', danger: 1,
      onOk: () => f0(Object.assign({}, d, { ok: 1 }), { target: el, preventDefault() { } }) }); }; }
bxWrapCancel();
