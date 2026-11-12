/* ================== P2: cüzdan, bakiye yükleme, havuzlu sipariş, itiraz, doping (yalnız --prod derlemesinde) ==================
   Sunucuya bağlı: bakiye yükleme penceresi (havale/EFT bildirimi + dekont, kripto, PayTR yalnız ayarlıysa; değilse "Kart ile ödeme
   yakında"), kupon önizlemesi (GET coupons/check), satın alma (Idempotency-Key, havuz), sipariş sayfası (durum adımları, sunucunun
   verdiği lateAt/acAt geri sayımları, teslim kanıtı yükleme, onay, itiraz, teslim garantisiyle iade, mesajlar), Hesabım › Siparişlerim /
   Satışlarım / Bakiye hareketleri (puan → bakiye), dopingler (ilan ver, ilan sayfası, İlanlarım), ana sayfa vitrini,
   Yönetim › Ödemeler (yükleme onayı, yöntemler, banka/kripto hesapları), Siparişler & itirazlar, Kuponlar, Bakiye düzeltme.
   Para çekme P3'te: "Yakında". Teslim kanıtları sunucuda 90 gün saklanır.                                                     */
const P2 = { up: {}, uk: 0, upFor: null, cpT: 0, cp: null, fresh: {}, pollN: 0 };
/* 97-p0b-views.js vAccount bu iki kancayı kullanır (yalnız prod) */
let p2AccTabs = null, p2AccBody = null;
const p2Now = () => Date.now() + (API.skew || 0);
function p2LeftTxt(ms) { ms = Math.max(0, ms); const m = Math.ceil(ms / 60000); if (m < 60) return m <= 1 ? '1 dk' : m + ' dk'; const h = Math.floor(m / 60); if (h < 24) return h + ' sa' + (m % 60 ? ' ' + (m % 60) + ' dk' : ''); const g = Math.floor(h / 24); return g + ' gün' + (h % 24 ? ' ' + (h % 24) + ' sa' : ''); }
/** Sunucunun verdiği zamana (ms) geri sayım; süre dolunca done metni */
const p2Cd = (t, done) => `<b class="mono p2cd" data-p2cd="${+t || 0}" data-done="${esc(done || 'süre doldu')}">${(+t || 0) - p2Now() > 0 ? p2LeftTxt(t - p2Now()) : esc(done || 'süre doldu')}</b>`;
const P2_DST = { bekliyor: ['p-bekliyor', 'Onay bekliyor'], 'onaylandı': ['p-tamam', 'Onaylandı'], reddedildi: ['p-iade', 'Reddedildi'], basarisiz: ['p-iade', 'Başarısız'], suresi_doldu: ['p-iade', 'Süresi doldu'] };
const p2DPill = s => { const x = P2_DST[s] || ['p-bekliyor', s]; return `<span class="pill ${x[0]}">${esc(x[1])}</span>`; };
const p2Gw = id => (S.gws || []).find(g => g.id === id) || { id, n: id, cat: '', fee: 0 };
const P2_REASONS = ['Ürün teslim edilmedi', 'Ürün ilandaki gibi değil', 'Eksik teslim edildi', 'Satıcı yanıt vermiyor', 'Diğer'];
function p2UpO(L) { (L || []).forEach(o => { if (!o || !o.id) return; const i = S.orders.findIndex(x => x.id === o.id); if (i < 0) S.orders.push(o); else S.orders[i] = Object.assign(S.orders[i], o); }); }
const p2Err = d => d && d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : '';
/** Formda yazılan bir şey ya da açık pencere varken arka plan yenilemesi ekranı yeniden çizmesin */
const p2Busy = () => !!document.querySelector('.mb') || [...document.querySelectorAll('#app input:not([type=file]):not([type=radio]):not([type=checkbox]):not([readonly]), #app textarea')].some(i => i === document.activeElement || (i.value && !i.defaultValue && i.id !== 'qty'));

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="p2css">
.p2tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;font-size:12.5px}
.p2tl li{display:flex;gap:10px;align-items:flex-start;min-width:0}.p2tl li span{min-width:0;overflow-wrap:anywhere}
.p2tl time{color:var(--muted);white-space:nowrap;font-family:var(--f-mono);font-size:11.5px;flex:none}
.gw-list label.p2off{opacity:.6;cursor:not-allowed}
.p2w{overflow-wrap:anywhere;min-width:0}
.p2cd{white-space:nowrap}
.p2pp{display:flex;flex-wrap:wrap;gap:8px}.p2pp button{padding:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:none;cursor:zoom-in}
.p2pp img{display:block;width:104px;height:78px;object-fit:cover}
.p2vid{font-size:12px;padding:6px 10px;border:1px solid var(--line);border-radius:8px}
.p2big{max-width:100%;max-height:70vh;display:block;margin:0 auto;border-radius:8px}
.pup-t .p2vt{display:grid;place-items:center;height:100%;font-size:12px;padding:6px;text-align:center;overflow-wrap:anywhere}
.p2tbl td{overflow-wrap:anywhere}
.p2ok{font-size:15px}
.p-itiraz{background:var(--bad-soft);color:var(--bad)}
</style>`);

/* Bu dosya yalnız --prod derlemesinde (YP_MODE='prod') yüklenir; tanımlar üst düzeyde (98p2-actions.js de kullanır). */

/* ================= açılış verisi, yoklama, üye kaydı ================= */
/** Açılış verisindeki para dilimleri: ödeme yöntemleri, havale hesapları, kripto ağları, dopingler, VIP seviyeleri */
function p2Slices(b) { if (!b) return;
  if (Array.isArray(b.gws)) S.gws = b.gws; if (Array.isArray(b.banks)) S.banks = b.banks; if (Array.isArray(b.cryptoNets)) S.cryptoNets = b.cryptoNets;
  if (b.dopings && typeof b.dopings === 'object' && !Array.isArray(b.dopings)) S.dopings = b.dopings;
  if (Array.isArray(b.vip) && b.vip.length) { S.vip = b.vip; VIP = S.vip; } }
p2Slices(window.YP_BOOT);
{ const f = apiApplyBoot; apiApplyBoot = function (b) { f.apply(this, arguments); p2Slices(b); }; }
/* kendi kaydımız herkese açık bir listeden (ilan satıcısı, sipariş tarafı) gelince bakiye/özel alanlar sıfırlanmasın */
{ const f = apiUpsertUser; apiUpsertUser = function (x) { if (x && x.id && x.id === S.cur) { const m = S.users.find(u => u.id === x.id); if (m) { const y = Object.assign({}, x);
      ['bal', 'bonus', 'pts', 'ad', 'soyad', 'tel', 'email', 'perms', 'refCode', 'refs', 'tc'].forEach(k => { if (x[k] == null && m[k] != null) y[k] = m[k]; }); return f(y); } } return f(x); }; }
/* yoklama: güncel bakiye (onaylanan yükleme, tamamlanan satış) ve sipariş bildirimleri ekrana yansısın */
function p2OnPoll(d) { const u = me(); if (!u || !d) return; let ch = false;
  const w = d.wallet; if (w && (u.bal !== w.bal || u.bonus !== w.bonus || u.pts !== w.pts)) { u.bal = w.bal; u.bonus = w.bonus; u.pts = w.pts; ch = true; }
  const nn = (d.notifs || []).length; if (nn) ch = true;
  if (!ch) return;
  needDrop('me:ord', 'me:tx', 'me:dep', 'adm:today', 'adm:dep', 'adm:ord'); const r = route(); if (r.startsWith('siparis-')) needDrop('ord:' + r.slice(8));
  renderHeader();
  if ((r === 'hesabim' || r.startsWith('siparis-') || isAdmRoute(r)) && !p2Busy()) setTimeout(() => { if (!p2Busy()) render(); }, 0); }
{ const c0 = call; call = async function (m, p, b, o) { const j = await c0.apply(this, arguments); if (m === 'GET' && /^poll\?/.test(String(p))) { try { p2OnPoll(j.data); } catch (e) { } } return j; }; }
/* demo: istemci tarafı otomatik onay yok (yalnız sunucu cron'u onaylar) */
autoConfirm = function () { };
/* geri sayımlar (saniyede bir); süre dolunca düğmeler için yeniden çizim */
setInterval(() => { let fire = false; document.querySelectorAll('[data-p2cd]').forEach(el => { const d = +el.dataset.p2cd - p2Now(); const t = d > 0 ? p2LeftTxt(d) : el.dataset.done; if (el.textContent !== t) el.textContent = t; if (d <= 0 && !el.dataset.fired) { el.dataset.fired = '1'; fire = true; } });
  if (fire && route().startsWith('siparis-') && !p2Busy()) { needDrop('ord:' + route().slice(8)); render(); } }, 1000);

/* ================= yükleme alanı (kanıt, dekont, itiraz görseli) ================= */
/** P2.up[p] = [{k, url, st:'up'|'ok'|'err', pct, id, err, vid}] */
function p2Thumbs(p, max) { const L = P2.up[p] || [];
  return `<div class="pup-grid">${L.map(it => `<div class="pup-t ${it.st === 'up' ? 'p1-up' : it.st === 'err' ? 'p1-err' : ''}" data-p2k="${esc(p + ':' + it.k)}">${it.vid ? `<span class="p2vt">🎬 ${esc(it.name || 'video')}</span>` : `<img src="${esc(it.url)}" alt="Yüklenen görsel">`}${it.st === 'up' ? `<span class="p1-prog"><i style="width:${+it.pct || 0}%"></i></span><span class="p1-st">${it.pct ? 'Yükleniyor %' + it.pct : 'Hazırlanıyor…'}</span>` : it.st === 'err' ? `<span class="p1-st bad" role="alert">${esc(it.err || 'Yüklenemedi')}</span>` : ''}<button type="button" class="pup-x" data-act="p2u-del" data-p="${esc(p)}" data-k="${it.k}" aria-label="Kaldır">✕</button></div>`).join('')}${L.length < max ? `<label class="pup-add" for="p2f_${esc(p)}"><b>＋</b><span>${max > 1 ? 'Dosya ekle' : 'Dosya seç'}</span><small>${L.length}/${max}</small></label>` : ''}</div>`; }
function p2Up(p, label, kind, max, accept, hint) { max = max || 1;
  return `<div class="fld"><span class="lbl">${label}</span><div class="pup" id="p2u_${esc(p)}" data-max="${max}">${p2Thumbs(p, max)}</div><input id="p2f_${esc(p)}" type="file" accept="${esc(accept || 'image/jpeg,image/png,image/webp')}" ${max > 1 ? 'multiple' : ''} hidden data-change="p2up" data-p="${esc(p)}" data-kind="${esc(kind)}" data-max="${max}">${hint ? `<span class="muted" style="font-size:12px">${hint}</span>` : ''}</div>`; }
function p2UpRefresh(p) { const el = document.getElementById('p2u_' + p); if (el) el.innerHTML = p2Thumbs(p, +el.dataset.max || 1); const b = $('#p2dbtn'); if (b) b.disabled = !(p2Ready('dpre') && p2Ready('dpost')); }
const p2Ready = p => { const L = P2.up[p] || []; return L.length > 0 && L.every(x => x.st === 'ok'); };
/** Yüklenen dosyaların medya kimlikleri; yükleme sürüyorsa ya da hata varsa null (uyarı verilir) */
function p2Ids(p) { const L = P2.up[p] || []; if (L.some(x => x.st === 'up')) { toast('Dosyalar yükleniyor, lütfen bitmesini bekleyin.', true); return null; }
  if (L.some(x => x.st === 'err')) { toast('Yüklenemeyen dosyayı kaldırıp yeniden deneyin.', true); return null; } return L.map(x => x.id); }
async function p2UpOne(p, it, kind) { const alive = () => (P2.up[p] || []).includes(it);
  try { let blob = it.file, name = String(it.file.name || 'dosya').replace(/[^\w.\-]+/g, '_').slice(-60);
    if (/^image\//.test(it.file.type)) { const r = await p1Shrink(it.file, 1600); blob = r.blob; name = r.name; }
    if (!alive()) return;
    const m = await p1Upload(blob, name, kind, pct => { it.pct = pct; const el = document.querySelector(`[data-p2k="${CSS.escape(p + ':' + it.k)}"]`); if (el) { const i = el.querySelector('.p1-prog i'); if (i) i.style.width = pct + '%'; const t = el.querySelector('.p1-st'); if (t) t.textContent = 'Yükleniyor %' + pct; } }, x => { it.xhr = x; });
    if (!alive()) return; Object.assign(it, { id: m.id, st: 'ok', pct: 100, mu: m.url }); delete it.file; delete it.xhr; }
  catch (e) { if (!alive() || (e && e.aborted)) return; it.st = 'err'; it.err = (e && e.error) || 'Yüklenemedi'; delete it.xhr; }
  p2UpRefresh(p); }
const p2UpReset = (...ps) => ps.forEach(p => { (P2.up[p] || []).forEach(x => { if (x.xhr) try { x.xhr.abort(); } catch (e) { } if (x.url && /^blob:/.test(x.url)) try { URL.revokeObjectURL(x.url); } catch (e) { } }); P2.up[p] = []; });

/* ================= bakiye yükleme ================= */
const P2_DEPCAT = [['eft', 'Havale / EFT'], ['cuzdan', 'Kripto'], ['kart', 'Kart ile öde']];
const P2_DEPINFO = {
  eft: '<b>Havale/EFT ile yüklenen bakiye çekilebilir.</b> Gönderdiğiniz hesap sizin adınıza olmalıdır; başkasının hesabından gelen ödemeler iade edilir.',
  cuzdan: '<b>Kriptoyla yüklenen bakiye çekilemez, yalnız alışverişte kullanılır.</b> Yükleme, ağ onayından sonra ekibimizce bakiyenize eklenir.',
  kart: '<b>Kartla yüklenen bakiye çekilemez, yalnız alışverişte kullanılır.</b> Kart bilgileriniz sitemize kaydedilmez; ödeme bankanızın 3D Secure doğrulamasıyla yapılır.'
};
const p2DepMin = () => +S.set.minDeposit || 10;
const p2Local = t => { const d = new Date((t || Date.now()) - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
function pDeposit(tab) {
  const u = me(); if (!u) return mLogin(); if (u.banned) return toast('Hesabınız askıda olduğu için bakiye yükleyemezsiniz.', true);
  const G = S.gws || []; const vis = g => g.on || g.soon; const usable = c => G.some(g => g.cat === c && g.on);
  const tabs = P2_DEPCAT.filter(([c]) => G.some(g => g.cat === c && vis(g)));
  if (typeof tab === 'string') ui.depTab = tab;
  let T = ui.depTab; if (!tabs.some(([c]) => c === T)) T = (tabs.find(([c]) => usable(c)) || tabs[0] || ['eft'])[0]; ui.depTab = T;
  const L = G.filter(g => g.cat === T && vis(g)); const on = L.filter(g => g.on);
  if (!on.some(g => g.id === ui.depGw)) ui.depGw = (on[0] || {}).id || null;
  const amt = ui.depAmt || 250; P2.depBox = null; P2.cp = null; p2UpReset('rc');
  let body;
  if (!tabs.length) body = `<div class="md-b"><div class="note note-warn">Şu an bakiye yükleme yöntemi açık değil. Lütfen daha sonra tekrar deneyin.</div></div>`;
  else if (!on.length) body = `<div class="md-b"><div class="note note-warn stack" style="gap:6px"><b>${T === 'kart' ? 'Kart ile ödeme yakında' : 'Bu yöntem yakında'}</b><span>${T === 'kart' ? 'Kredi / banka kartıyla yükleme çok yakında açılıyor.' : 'Bu yöntemle yükleme çok yakında açılıyor.'} Şimdilik havale/EFT ile bakiye yükleyebilirsiniz; ekibimiz onayladığında bakiyeniz eklenir.</span></div>
      ${usable('eft') && T !== 'eft' ? '<div><button type="button" class="btn btn-primary" data-act="dep-tab" data-t="eft">Havale/EFT ile yükle</button></div>' : ''}<div id="depMine"></div></div>`;
  else body = `<form class="md-b" data-form="dep"><div class="note note-info" style="font-size:12.5px">${P2_DEPINFO[T] || ''}</div>
      ${L.length > 1 ? `<div class="fld"><span class="lbl">Yöntem</span><div class="gw-list">${L.map(g => g.on ? `<label for="pm_${esc(g.id)}"><input type="radio" name="pm" id="pm_${esc(g.id)}" value="${esc(g.id)}" ${g.id === ui.depGw ? 'checked' : ''} data-change="depcalc"><b>${esc(g.n)}</b>${esc(g.t || '')}<em>${g.fee ? '%' + g.fee + ' hizmet bedeli' : 'Ücretsiz'}</em></label>` : `<label class="p2off" aria-disabled="true"><input type="radio" name="pm_off" disabled><b>${esc(g.n)}</b>${esc(g.t || '')}<em>Yakında</em></label>`).join('')}</div></div>` : on.map(g => `<input type="radio" name="pm" value="${esc(g.id)}" checked hidden>`).join('')}
      <div class="fld"><label for="dep_amt">Yüklenecek tutar (TL)</label><input class="inp" id="dep_amt" type="number" min="${p2DepMin()}" step="1" value="${amt}" required inputmode="decimal" data-change="depcalc"></div>
      <div class="hstack">${[100, 250, 500, 1000].map(v => `<button type="button" class="btn btn-sm" data-act="amt" data-v="${v}">${TL(v).replace(',00', '')}</button>`).join('')}</div>
      <div class="fld"><label for="dep_cp">Kupon kodu (isteğe bağlı)</label><input class="inp mono" id="dep_cp" placeholder="KUPONKODU" autocomplete="off" data-change="depcalc" style="text-transform:uppercase" maxlength="30"><span id="depCp" class="muted" style="font-size:12.5px" aria-live="polite"></span></div>
      <div id="depManual" class="stack" style="gap:10px"></div><div class="sum" id="depSum"></div>
      <button class="btn btn-primary" id="depBtn">Devam</button><div id="depMine"></div></form>`;
  modal(`<div class="md dep" role="dialog" aria-label="Bakiye yükle"><div class="md-h"><h3>Bakiye Yükle</h3><button class="md-x" data-act="close" aria-label="Kapat">×</button></div>
    ${tabs.length > 1 ? `<div class="segtabs dtabs">${tabs.map(([k, v]) => `<button type="button" class="${k === T ? 'on' : ''}" data-act="dep-tab" data-t="${k}">${v}${usable(k) ? '' : ' · Yakında'}</button>`).join('')}</div>` : ''}${body}</div>`);
  if (on.length) p2DepCalc();
  p2DepMine();
}
/** Penceredeki son bildirimler (onay bekleyen / sonuçlanan) */
function p2DepMine() { const el = $('#depMine'); if (!el) return;
  call('GET', 'me/deposits?limit=5', null, { quiet: true }).then(j => { const L = (j.data && j.data.deps) || []; p1Up(S.deps, L); const b = $('#depMine'); if (!b || !L.length) return;
    b.innerHTML = `<div class="eyebrow" style="margin-top:6px">Son yükleme bildirimleriniz</div><div class="feed">${L.map(d => `<div class="cprow"><span class="p2w">${dtstr(d.t)} · <b>${TL(d.amount)}</b> · ${esc(p2Gw(d.gw).n)}${d.bonus ? ` <span class="pos">+${TL(d.bonus)} bonus</span>` : ''}${d.reason ? `<br><span class="muted">${esc(d.reason)}</span>` : ''}</span>${p2DPill(d.status)}</div>`).join('')}</div>`; }).catch(() => { }); }
function p2DepGw() { const id = (document.querySelector('input[name=pm]:checked') || {}).value; return (S.gws || []).find(x => x.id === id) || null; }
function p2DepBox(g, u) {
  if (g.id === 'havale') { const B = S.banks || []; if (!B.length) return '<div class="note note-bad">Şu an tanımlı havale hesabımız yok. Lütfen canlı destekle görüşün ya da başka bir yöntem seçin.</div>';
    return `<div class="note note-info stack" style="gap:8px"><b>Aşağıdaki hesaplardan birine gönderin; açıklamaya kullanıcı adınızı (${esc(u.name)}) yazın. Ekibimiz onayladıktan sonra bakiyenize eklenir.</b>${B.map(k => `<div class="cprow" style="background:var(--surface)"><span class="p2w"><b>${esc(k.b)}</b> · ${esc(k.n)}<br><span class="mono">${esc(k.i)}</span></span><button type="button" class="btn btn-sm" data-act="copy" data-v="${esc(k.i)}">Kopyala</button></div>`).join('')}</div>
      <div class="row2"><div class="fld"><label for="dep_dt">Dekonttaki işlem tarihi ve saati *</label><input class="inp mono" type="datetime-local" id="dep_dt" required max="${p2Local()}" value="${p2Local()}"></div><div class="fld"><label for="dep_to">Gönderdiğiniz hesabımız *</label><select class="inp" id="dep_to">${B.map(k => `<option value="${esc(k.b)}">${esc(k.b)}</option>`).join('')}</select></div></div>
      <div class="fld"><label for="dep_note">Gönderen ad soyad / banka</label><input class="inp" id="dep_note" maxlength="120" placeholder="${esc(fullName(u) || 'Ad Soyad')} · Banka"></div>
      ${p2Up('rc', 'Dekont görseli (önerilir)', 'receipt', 1, 'image/jpeg,image/png,image/webp', 'Banka uygulamanızdaki dekontun ekran görüntüsü. Ödemeniz bununla daha hızlı onaylanır; yalnız ekibimiz görür.')}`; }
  if (g.id === 'kripto') return cryptoBox() + p2Up('rc', 'İşlem ekran görüntüsü (isteğe bağlı)', 'receipt', 1, 'image/jpeg,image/png,image/webp', 'Cüzdanınızdaki işlem ekranı; yalnız ekibimiz görür.');
  if (g.id === 'paytr_eft') return `<div class="fld"><label for="dep_bank">Göndereceğiniz banka</label><select class="inp" id="dep_bank">${EFTBANKS.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span class="muted" style="font-size:12px">Transferi ${esc(fullName(u) || 'kendi adınıza')} adına kayıtlı hesaptan yapın.</span></div>`;
  return '';
}
function p2DepCalc() {
  const g = p2DepGw(); if (!g || !$('#depSum')) return; ui.depGw = g.id; const u = me();
  const a = Math.max(0, +(($('#dep_amt') || {}).value) || 0); ui.depAmt = a; const fee = r2(a * (+g.fee || 0) / 100);
  if (P2.depBox !== g.id) { P2.depBox = g.id; p2UpReset('rc'); $('#depManual').innerHTML = p2DepBox(g, u); }
  const code = (($('#dep_cp') || {}).value || '').trim().toUpperCase(); const c = P2.cp;
  const cpOk = c && c.code === code && c.amount === a; const bonus = cpOk && c.ok ? +c.bonus || 0 : 0;
  const cl = $('#depCp'); if (cl) cl.innerHTML = !code ? '' : !cpOk ? 'Kupon kontrol ediliyor…' : c.ok ? `<span class="pos">✓ ${esc(c.code)}: %${c.pct} bonus (en fazla ${TL(c.max)}) · <b>+${TL(bonus)}</b></span>` : `<span class="neg">${esc(c.error || 'Kupon kodu geçersiz.')}</span>`;
  const w = g.w != null ? g.w : g.cat === 'eft';
  $('#depSum').innerHTML = `<div><span>Bakiyenize eklenecek</span><b class="mono">${TL(a + bonus)}</b></div>${bonus ? `<div><span class="muted">Kupon bonusu (yalnız alışveriş)</span><span class="mono pos">+${TL(bonus)}</span></div>` : ''}<div><span class="muted">Hizmet bedeli (${esc(g.n)})</span><span class="mono">${fee ? TL(fee) : 'Ücretsiz'}</span></div><div><span class="muted">Bakiye türü</span><span>${w ? 'Çekilebilir' : 'Yalnız alışveriş'}</span></div><div class="tot"><span>Ödenecek</span><span class="mono">${TL(a + fee)}</span></div>`;
  const b = $('#depBtn'); if (b) { b.textContent = g.manual ? 'Ödemeyi yaptım, bildir' : g.id === 'paytr' ? `Kart ile öde · ${TL(a + fee)}` : g.id === 'paytr_eft' ? `Havale/EFT talimatı al · ${TL(a + fee)}` : `${g.n} ile öde · ${TL(a + fee)}`;
    b.disabled = g.id === 'havale' && !(S.banks || []).length || g.id === 'kripto' && !(S.cryptoNets || []).some(n => n.on && n.addr); }
  if (code && !cpOk) p2CpCheck(code, a);
}
/** Kupon önizlemesi (sunucu): yazarken 400 ms bekleyip sorar */
function p2CpCheck(code, a) { clearTimeout(P2.cpT); P2.cpT = setTimeout(() => {
    call('GET', 'coupons/check?code=' + encodeURIComponent(code) + '&amount=' + encodeURIComponent(a), null, { quiet: true }).then(j => { P2.cp = Object.assign({ code, amount: a }, j.data || {}); }, e => { P2.cp = { code, amount: a, ok: false, error: apiErr(e) }; })
      .then(() => { if ($('#depSum')) p2DepCalc(); }); }, 400); }
depCalc = p2DepCalc;
mDeposit = pDeposit;
document.addEventListener('input', e => { const el = e.target; if (YP_PROD && el && (el.id === 'dep_cp' || el.id === 'dep_amt') && $('#depSum')) { if (el.id === 'dep_cp') P2.cp = null; p2DepCalc(); } });

/** PayTR dönüşü (?odeme=basarili|hatali&oid=…): sonuç gelene kadar GET deposits/{oid} yoklanır */
function p2PaytrReturn() { let sp; try { sp = new URLSearchParams(location.search); } catch (e) { return; } const st = sp.get('odeme'), oid = sp.get('oid'); if (!st) return;
  try { history.replaceState(null, '', location.pathname + (location.hash || '#hesabim')); } catch (e) { }
  if (!me() || !oid) return;
  modal(mWrap('Ödeme sonucu', `<div class="paytr-box" id="p2pr"><span class="spin"></span> Ödemeniz kontrol ediliyor…</div>`)); let n = 0;
  const tick = () => call('GET', 'deposits/' + encodeURIComponent(oid), null, { quiet: true }).then(j => { const d = j.data.deposit, box = $('#p2pr'); if (!box) return;
      if (j.data.done) { box.innerHTML = d.status === 'onaylandı' ? `<div class="note note-ok p2ok"><b>${TL(d.amount + (d.bonus || 0))} bakiyenize yüklendi.</b> ${d.w ? '' : 'Bu tutar alışverişte kullanılır, çekilemez.'}</div><button class="btn btn-primary" data-act="close">Tamam</button>` : `<div class="note note-bad"><b>Ödeme tamamlanmadı.</b> Kartınızdan para çekildiyse birkaç dakika içinde otomatik iade edilir. Sorun sürerse canlı destekle görüşün.</div><button class="btn" data-act="close">Kapat</button>`; renderHeader(); return; }
      if (++n > 40) { box.innerHTML = '<div class="note note-info">Ödemeniz henüz sonuçlanmadı. Sonuç gelince bakiyeniz otomatik güncellenir ve bildirim alırsınız.</div><button class="btn" data-act="close">Tamam</button>'; return; }
      setTimeout(tick, 3000); }, e => { const box = $('#p2pr'); if (box) box.innerHTML = `<div class="note note-bad">${esc(apiErr(e))}</div><button class="btn" data-act="close">Kapat</button>`; });
  tick(); }
setTimeout(p2PaytrReturn, 0);

/* ================= satın alma ================= */
function pBuy(id, qv, keep) {
  const u = me(); if (!u) return mLogin(); const l = lst(id); if (!l) return;
  if (u.banned) return toast('Hesabınız askıda olduğu için işlem yapamazsınız.', true);
  if (l.seller === u.id) return toast('Kendi ilanınızı satın alamazsınız.', true);
  if (!(l.status === 'aktif' && l.stock > 0)) return toast('Bu ilan artık satışta değil.', true);
  const q = Math.max(1, Math.min(+l.stock || 1, parseInt(qv != null ? qv : ($('#qty') || {}).value, 10) || 1));
  const tot = r2(l.price * q), bal = avail(u), ok = bal >= tot, unit = unitOf(l);
  const ep = l.cat === 'ep' || l.cat === 'epin' || l.cat === 'hesap', acc = l.cat === 'karakter' || l.cat === 'hesap';
  const fromBonus = Math.min(+u.bonus || 0, tot), fromCash = r2(tot - fromBonus);
  modal(mWrap('Siparişi onayla', `<div class="sum"><div><span class="p2w">${esc(l.title)}</span><span>×${q}${unit === 'Won' ? ' Won' : ''}</span></div><div><span>Satıcı</span><b>${esc(user(l.seller).name)}</b></div><div><span class="muted">Birim fiyat</span><span class="mono">${TL(l.price)}</span></div><div class="tot"><span>Ödenecek</span><span class="mono" id="p2bTot">${TL(tot)}</span></div><div><span class="muted">Bakiyeniz</span><span class="mono">${TL(bal)}</span></div><div><span class="muted">Ödeme sonrası</span><span class="mono ${ok ? '' : 'neg'}">${TL(r2(bal - tot))}</span></div></div>
    <div class="fld"><label for="b_qty">${unit === 'Won' ? 'Kaç Won?' : 'Adet'} <span class="muted" style="font-weight:400">(stokta ${NUM(l.stock)})</span></label><input class="inp" id="b_qty" type="number" min="1" max="${+l.stock}" step="1" value="${q}" data-change="p2bq" data-id="${esc(l.id)}"></div>
    ${ok ? `<form class="stack" data-form="p2buy" data-id="${esc(l.id)}" data-q="${q}"><div class="fld"><label for="b_info">${acc ? 'Hesabın devredileceği e-posta adresi' : ep ? 'E-posta (teslim bildirimi için)' : 'Oyun içi karakter adınız'}</label><input class="inp" id="b_info" ${acc || ep ? 'type="email" autocomplete="email"' : 'autocomplete="off"'} required maxlength="120" placeholder="${ep || acc ? 'ornek@mail.com' : 'Karakter adı'}"></div>${(!ep && !acc) ? `<div class="row2"><div class="fld"><label for="b_ch">Kanal</label><select class="inp" id="b_ch" required><option value="">Kanal seçin</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}">CH${n}</option>`).join('')}</select></div><div class="fld"><label for="b_place">Teslimat yeri</label><select class="inp" id="b_place" required><option value="">Yer seçin</option>${DPLACE.map(x => `<option>${esc(x)}</option>`).join('')}</select></div></div>` : ''}
      ${fromBonus > 0 && fromCash > 0 ? `<div class="muted" style="font-size:12px">Önce alışveriş bakiyeniz (${TL(fromBonus)}), sonra çekilebilir bakiyeniz (${TL(fromCash)}) kullanılır.</div>` : ''}
      <div class="guard">${ICO.shield}<span><b>Ödemeniz havuzda bekler.</b> Tutar satıcıya hemen geçmez; ürünü teslim aldığınızı onaylayınca satıcıya aktarılır. Teslim edilmezse paranız bakiyenize iade edilir.</span></div><button class="btn btn-primary">Ödemeyi yap · ${TL(tot)}</button></form>`
    : `<div class="note note-bad">Bakiyeniz yetersiz. <b>${TL(r2(tot - bal))}</b> daha yüklemeniz gerekiyor.</div><button type="button" class="btn btn-primary" data-act="p2-topup" data-v="${Math.max(p2DepMin(), Math.ceil(tot - bal))}">Bakiye yükle</button>`}`));
  if (keep) Object.entries(keep).forEach(([k, v]) => { const i = $('#' + k); if (i && v) i.value = v; });
}

/* ================= sipariş sayfası ================= */
function p2LoadOrder(id) {
  return need('ord:' + id, () => call('GET', 'orders/' + encodeURIComponent(id), null, { quiet: true }).then(j => { const x = j.data || {}; p2UpO([x.order]); p1UpU(x.users); if (x.listing) p1UpL([x.listing]);
    if (x.now) API.skew = x.now - Date.now(); return { id: x.order.id, up: x.order.up, st: x.order.status, n: (x.order.log || []).length + (x.order.chat || []).length }; }), 15000); }
const p2Who = (o, f) => f === o.buyer ? 'Alıcı' : f === o.seller ? 'Satıcı' : 'Destek';
function p2Proofs(L, title) { L = (L || []).filter(Boolean); if (!L.length) return '';
  return `<div class="pgrp"><b>${esc(title)}</b><div class="p2pp">${L.map((src, i) => `<button type="button" data-act="p2-img" data-u="${esc(src)}" data-t="${esc(title)}"><img src="${esc(src)}" alt="${esc(title)} ${i + 1}" loading="lazy"></button>`).join('')}</div></div>`; }
function pOrder(id) {
  const u = me(); if (!u) return `<div class="wrap">${emptyBox('Siparişi görmek için giriş yapın', 'Sipariş yalnızca alıcı, satıcı ve yetkili ekibe açıktır.', '<button class="btn btn-primary" data-act="login">Giriş Yap</button>')}</div>`;
  const d = p2LoadOrder(id); const o = ord(id);
  if (!d && !o) return `<div class="wrap">${pLoading('Sipariş yükleniyor…')}</div>`;
  if (d && d.err && !o) return `<div class="wrap">${emptyBox('Sipariş bulunamadı', esc(d.err), '<a class="btn btn-primary" href="#hesabim">Hesabıma dön</a>')}</div>`;
  if (P2.upFor !== o.id) { P2.upFor = o.id; p2UpReset('dpre', 'dpost', 'dvid'); }
  const isB = u.id === o.buyer, isS = u.id === o.seller, staff = can('siparis'), l = lst(o.lid) || {};
  const fee = o.fee != null ? o.fee : r2(o.total * o.rate / 100), net = o.net != null ? o.net : r2(o.total - fee);
  const idx = { odendi: 2, teslim: 3, itiraz: 3, tamam: 5, iade: 5 }[o.status] || 1;
  const step = (n, t) => { let c = ''; if (o.status === 'iade' && n >= 2) c = n === 4 ? 'bad' : ''; else if (n < idx || o.status === 'tamam') c = 'done'; else if (n === idx) c = 'cur'; if (o.status === 'itiraz' && n === 3) c = 'bad'; if (o.status === 'iade' && n === 1) c = 'done'; return `<div class="step ${c}"><i>${c === 'done' ? '✓' : c === 'bad' ? '!' : n}</i>${t}</div>`; };
  const late = o.lateAt && o.lateAt <= p2Now();
  let act = '';
  if (P2.fresh[o.id] && isB) act += `<div class="note note-ok"><b>Siparişiniz alındı.</b> ${TL(o.total)} havuza alındı; satıcıya bildirim gönderildi.</div>`;
  if (o.status === 'odendi') {
    if (isS) {
      act += `<div class="note note-warn"><b>Ürününüz satıldı, teslimat sizden bekleniyor.</b> Teslimat bilgisi: <span class="mono p2w">${esc(delivTxt(o))}</span>.<br>${late ? '<b>Teslim süresi doldu.</b> Alıcı artık siparişi iptal edip parasını geri alabilir; hemen teslim edin.' : `Teslim için kalan süre: ${p2Cd(o.lateAt, 'süre doldu')}. Süre dolarsa alıcı siparişi iptal edip parasını geri alabilir.`}</div>`;
      act += o.ready ? `<div class="note note-ok"><b>Alıcıya “teslime hazır” bildirimi gönderildi</b> (${ago(o.ready)}). Teslimat: ${esc(teslimatTxt(o))}</div>`
        : `<div class="note note-info stack" style="gap:8px"><span><b>Teslime hazır mısınız?</b> Alıcıya haber verelim: “${esc(teslimatTxt(o))}” noktasında beklesin.</span><div><button type="button" class="btn btn-ok btn-sm" data-act="o-ready" data-id="${esc(o.id)}">Teslime hazırım · alıcıya haber ver</button></div></div>`;
      act += `<form class="stack" data-form="p2deliver" data-id="${esc(o.id)}"><div class="fld"><label for="dnote">Teslimat notu (alıcı görür)</label><input class="inp" id="dnote" maxlength="500" placeholder="Örn: Köy 1, saat 21:14'te ticaretle verildi" autocomplete="off"></div>
        <div class="dproofs stack" style="gap:10px"><div class="note note-info" style="font-size:12.5px">Teslim kanıtlarını yalnızca site yönetimi görür, alıcıya gösterilmez; olası bir anlaşmazlıkta sizi korur. Kanıtlar 90 gün saklanır.</div>
          ${p2Up('dpre', '1 · Teslimat öncesi görsel (zorunlu)', 'proof', 3, 'image/jpeg,image/png,image/webp', 'Ticaret penceresi açıkken: verdiğiniz ürün / yang miktarı ve alıcının karakter adı görünsün. En fazla 3 görsel.')}
          ${p2Up('dpost', '2 · Teslimat sonrası görsel (zorunlu)', 'proof', 3, 'image/jpeg,image/png,image/webp', 'Ticaret onaylandıktan sonra: envanterinizden ürünün / yangın düştüğü görünsün. En fazla 3 görsel.')}
          ${p2Up('dvid', '3 · Teslimat videosu (isteğe bağlı)', 'proof', 1, 'video/mp4,video/webm,video/quicktime', 'Ticaretin kaydı varsa ekleyin; anlaşmazlıkta en güçlü kanıttır.')}</div>
        <button class="btn btn-primary" id="p2dbtn" ${p2Ready('dpre') && p2Ready('dpost') ? '' : 'disabled'}>Teslim ettim</button></form>`;
    } else if (isB) {
      if (o.ready) act += `<div class="note note-ok"><b>Satıcı teslime hazır!</b> ${esc(teslimatTxt(o))}. Lütfen oyunda bekleyin.</div>`;
      act += late ? `<div class="note note-warn"><b>Teslim süresi doldu.</b> Satıcı ürünü zamanında teslim etmedi. Paranız havuzda güvende; isterseniz siparişi hemen iptal edip tutarı bakiyenize geri alabilirsiniz.</div><div class="hstack"><button type="button" class="btn btn-primary" data-act="guarantee" data-id="${esc(o.id)}">Teslim edilmedi · paramı iade et</button><button type="button" class="btn btn-sm" data-act="dispute" data-id="${esc(o.id)}">Sorun bildir</button></div>`
        : `<div class="note note-info"><b>Ödemeniz havuzda güvende.</b> Tutar satıcıya, siz ürünü teslim aldığınızı onaylayınca geçer. Satıcının teslim süresi: ${p2Cd(o.lateAt, 'doldu')}; süre dolarsa paranızı tek tıkla geri alabilirsiniz.</div><div><button type="button" class="btn btn-bad btn-sm" data-act="dispute" data-id="${esc(o.id)}">Sorun bildir</button></div>`;
    }
    if (staff && !isB && !isS) act += `<div class="note note-info">Yetkili işlemi: teslim edilmeyen siparişi iptal edip alıcıya iade edebilirsiniz.</div><div class="hstack"><button type="button" class="btn btn-bad" data-act="resolve" data-id="${esc(o.id)}" data-to="buyer">Siparişi iptal et ve iade yap</button></div>`;
  } else if (o.status === 'teslim') {
    if (isB) act += `<div class="note note-warn"><b>Satıcı teslim ettiğini bildirdi.</b> Ürünü oyunda kontrol edin. ${o.acAt ? `${p2Cd(o.acAt, 'birazdan')} içinde işlem yapmazsanız sipariş otomatik onaylanır.` : ''}</div>
      <div class="fld"><span class="lbl">Satıcıyı puanlayın</span><div class="hstack" id="starPick">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="btn btn-sm" data-act="star" data-n="${n}" style="${n === pickedStar ? 'border-color:var(--accent)' : ''}">${n} ★</button>`).join('')}</div></div>
      <div class="hstack"><button type="button" class="btn btn-ok" data-act="confirm" data-id="${esc(o.id)}">Ürünü aldım, onaylıyorum</button><button type="button" class="btn btn-bad" data-act="dispute" data-id="${esc(o.id)}">Sorun var, itiraz et</button></div>`;
    else act += `<div class="note note-info">Alıcının onayı bekleniyor. ${o.acAt ? `Onay gelmezse ${p2Cd(o.acAt, 'birazdan')} sonra otomatik onaylanır` : 'Onay gelmezse süre dolunca otomatik onaylanır'}${isS ? ` ve ${TL(net)} hesabınıza geçer` : ''}.</div>`;
    if (staff && !isB && !isS) act += `<div class="hstack"><button type="button" class="btn btn-ok" data-act="resolve" data-id="${esc(o.id)}" data-to="seller">Ödemeyi satıcıya aktar</button><button type="button" class="btn btn-bad" data-act="resolve" data-id="${esc(o.id)}" data-to="buyer">Alıcıya iade et</button></div>`;
  } else if (o.status === 'itiraz') {
    act += `<div class="note note-bad"><b>İtiraz incelemede.</b> Gerekçe: ${esc(o.reason || '-')}<br>Tutar havuzda bekletiliyor; destek ekibi iki tarafı dinleyip karar verecek. Ekran görüntüsü ve açıklamalarınızı mesaj alanından iletin.</div>`;
    if (staff) act += `<div class="hstack"><button type="button" class="btn btn-ok" data-act="resolve" data-id="${esc(o.id)}" data-to="seller">Satıcı haklı · ödemeyi aktar</button><button type="button" class="btn btn-bad" data-act="resolve" data-id="${esc(o.id)}" data-to="buyer">Alıcı haklı · iade et</button></div>`;
  } else if (o.status === 'tamam') {
    act += `<div class="note note-ok"><b>Sipariş tamamlandı.</b> ${isS ? `Hesabınıza ${TL(net)} aktarıldı (çekilebilir bakiye).` : isB ? `İyi oyunlar!${o.pts ? ' ' + NUM(o.pts) + ' puan kazandınız.' : ''}` : `Satıcıya ${TL(net)} aktarıldı.`} ${o.stars ? 'Puan: <span class="stars">' + stars(o.stars) + '</span>' : ''}</div>`;
  } else if (o.status === 'iade') {
    act += `<div class="note note-bad"><b>Sipariş iade edildi.</b> ${TL(o.total)} alıcının bakiyesine geri yüklendi.</div>`;
  }
  const B_ = user(o.buyer), Sl = user(o.seller);
  const disp = (o.proofs || (o.proof ? [o.proof] : [])).filter(Boolean);
  const dp = (o.dpre || []).length || (o.dpost || []).length || o.dvid;
  const proofPanel = (staff || isS) && dp ? `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Teslim kanıtları</h3><span class="chip warn">${staff ? 'Yalnız yönetim ve satıcı görür' : 'Alıcı görmez'}</span></div><div class="panel-b stack">${p2Proofs(o.dpre, 'Teslimat öncesi')}${p2Proofs(o.dpost, 'Teslimat sonrası')}${o.dvid ? `<div class="pgrp"><b>Teslimat videosu</b><a class="p2vid" href="${esc(safeUrl(o.dvid))}" target="_blank" rel="noopener">Videoyu aç ↗</a></div>` : ''}<span class="muted" style="font-size:12px">${esc(Sl.name)}${o.dt ? ' · ' + dtstr(o.dt) : ''} · Kanıtlar 90 gün saklanır.</span></div></div>` : '';
  const dispPanel = disp.length ? `<div class="panel"><div class="panel-h"><h3>İtiraz kanıtları</h3></div><div class="panel-b">${p2Proofs(disp, 'İtiraz görseli')}</div></div>` : '';
  const log = (o.log || []).slice().reverse();
  return `<div class="wrap">${staff && !isB && !isS ? `<div class="admback"><a class="btn btn-sm" href="#yonetim/siparis?f=${o.status === 'itiraz' ? 'itiraz' : 'tumu'}">← Siparişler & itirazlar</a></div>` : ''}<div class="crumbs"><a href="#hesabim" data-act="tab" data-t="${isS ? 'satis' : 'alis'}">Hesabım</a> › Sipariş #${esc(o.id)}</div>
  <div class="page-h"><div><h1>Sipariş #${esc(o.id)}</h1><p class="p2w">${esc(o.title)} · ${NUM(o.qty)} ${l.id ? unitOf(l) : 'adet'} · ${dtstr(o.t)}${l.no ? ' · İlan #' + l.no : ''}</p></div><span class="pill p-${esc(o.status)}">${esc(ST[o.status] || o.status)}</span></div>
  <div class="det"><div class="col">
    <div class="panel"><div class="steps">${step(1, 'Ödeme havuzda')}${step(2, 'Satıcı teslim etti')}${step(3, 'Alıcı onayı')}${step(4, o.status === 'iade' ? 'İade edildi' : 'Satıcıya ödendi')}</div><div class="panel-b stack" style="padding-top:4px">${act || '<div class="note note-info">Bu sipariş için yapılacak işlem yok.</div>'}</div></div>
    ${proofPanel}${dispPanel}
    <div class="panel"><div class="panel-h"><h3>Sipariş geçmişi</h3></div><div class="panel-b"><ol class="p2tl">${log.map(e => `<li><time>${dtstr(e.t)}</time><span>${esc(e.x)}</span></li>`).join('') || '<li class="muted">Kayıt yok.</li>'}</ol></div></div>
    <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Sipariş mesajları</h3><span class="muted" style="font-size:12px">Telefon, link ve site dışı iletişim otomatik gizlenir</span></div>
      <div class="chat" id="ochat">${(o.chat || []).map(m => `<div class="msg ${m.f === u.id ? 'mine' : m.f === 'admin' || (user(m.f) || {}).staff ? 'agent' : ''}"><b>${p2Who(o, m.f)}</b> ${esc(m.x)}${m.flag ? '<em class="flagnote">İletişim bilgisi gizlendi</em>' : ''}<small>${ago(m.t)}</small></div>`).join('') || '<div class="msg sys">Henüz mesaj yok.</div>'}</div>
      ${['tamam', 'iade'].includes(o.status) ? '' : `<form class="chat-in" data-form="p2chat" data-id="${esc(o.id)}"><input class="inp" id="omsg" placeholder="Mesaj yazın…" autocomplete="off" maxlength="1000" aria-label="Mesaj"><button class="btn btn-primary">Gönder</button></form>`}</div>
  </div>
  <aside class="col"><div class="panel panel-b stack">
    <div class="eyebrow">Ödeme özeti</div>
    <div class="sum"><div><span>Ürün</span><span class="p2w" style="text-align:right">${esc(o.title)}</span></div><div><span>Miktar</span><span>${NUM(o.qty)}</span></div><div class="tot"><span>Alıcının ödediği</span><span class="mono">${TL(o.total)}</span></div>
    ${(isB || staff) && o.paid && (o.paid.nw || o.paid.w) ? `<div><span class="muted">Alışveriş bakiyesinden</span><span class="mono">${TL(o.paid.nw || 0)}</span></div><div><span class="muted">Çekilebilir bakiyeden</span><span class="mono">${TL(o.paid.w || 0)}</span></div>` : ''}
    ${isS || staff ? `<div><span class="muted">Komisyon (%${o.rate})</span><span class="mono neg">−${TL(fee)}</span></div><div class="tot"><span>Satıcıya geçecek</span><span class="mono">${TL(net)}</span></div>` : ''}</div>
    <div class="sum"><div><span class="muted">Alıcı</span><b class="p2w">${esc(B_.name)}${staff && fullName(B_) ? ' · ' + esc(fullName(B_)) : ''}</b></div><div><span class="muted">Satıcı</span><b class="p2w">${esc(Sl.name)}${staff && fullName(Sl) ? ' · ' + esc(fullName(Sl)) : ''}</b></div><div><span class="muted">${o.ch || o.place ? 'Karakter adı' : /@/.test(o.info || '') ? 'Devir e-postası' : 'Teslim bilgisi'}</span><span class="mono p2w" style="font-size:11.5px;text-align:right;max-width:60%">${esc(o.info || '-')}</span></div>${o.ch ? `<div><span class="muted">Kanal</span><b>CH${esc(o.ch)}</b></div>` : ''}${o.place ? `<div><span class="muted">Teslimat yeri</span><b>${esc(o.place)}</b></div>` : ''}${o.del ? `<div><span class="muted">Teslim süresi</span><span>${esc(o.del)}</span></div>` : ''}</div>
    ${l.id ? `<a href="#ilan-${esc(l.id)}" class="btn btn-sm">İlana git</a>` : ''}
    <div class="guard">${ICO.shield}<span><b>Güvenli havuz.</b> Ödeme, alıcı ürünü teslim aldığını onaylayana kadar sitede bekler. Sorun olursa destek ekibi iki tarafı dinleyip karar verir.</span></div>
  </div></aside></div></div>`;
}
function pDispute(id) { const o = ord(id); if (!o) return; p2UpReset('dsp');
  modal(mWrap('Sorun bildir · #' + o.id, `<form class="stack" data-form="p2disp" data-id="${esc(o.id)}"><div class="fld"><label for="dp_r">Sorun nedir?</label><select class="inp" id="dp_r">${P2_REASONS.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
    <div class="fld"><label for="dp_d">Açıklama</label><textarea class="inp" id="dp_d" placeholder="Ne olduğunu kısaca anlatın" required minlength="3" maxlength="1000"></textarea></div>
    ${p2Up('dsp', 'Kanıt ekran görüntüleri (isteğe bağlı, en fazla 3)', 'dispute', 3, 'image/jpeg,image/png,image/webp', 'Görselleri satıcı ve destek ekibi görür.')}
    <div class="note note-info">İtiraz açıldığında tutar havuzda dondurulur; destek ekibi iki tarafı dinleyip karar verir.</div><button class="btn btn-bad">İtiraz aç</button></form>`)); }

/* ================= Hesabım: siparişler, satışlar, bakiye hareketleri ================= */
function p2MyOrders(role) {
  return need('me:ord:' + role, () => call('GET', 'me/orders?role=' + role + '&limit=50', null, { quiet: true }).then(j => { const x = j.data || {}; p2UpO(x.orders); p1UpU(x.users); return { role, ids: (x.orders || []).map(o => o.id), next: x.next || null }; }), 20000); }
function p2OTbl(L, role) {
  if (!L.length) return emptyBox('Henüz sipariş yok', role === 'b' ? 'Satın aldığınız ürünler burada listelenir.' : 'Satışlarınız burada listelenir.', role === 'b' ? '<a class="btn btn-primary" href="#metin2-tr">İlanlara göz at</a>' : '<a class="btn btn-primary" href="#ilan-ver">İlan ver</a>');
  return `<div class="tbl-w"><table class="tbl mcards p2tbl"><thead><tr><th>Sipariş</th><th>Ürün</th><th>${role === 'b' ? 'Satıcı' : 'Alıcı'}</th><th>Durum</th><th class="num">${role === 'b' ? 'Tutar' : 'Size geçecek'}</th><th></th></tr></thead><tbody>${L.map(o => { const hot = (role === 's' && o.status === 'odendi') || (role === 'b' && o.status === 'teslim');
    const cd = o.status === 'odendi' && o.lateAt ? `<div class="muted" style="font-size:11.5px">Teslim süresi: ${p2Cd(o.lateAt, 'doldu')}</div>` : o.status === 'teslim' && o.acAt ? `<div class="muted" style="font-size:11.5px">Otomatik onay: ${p2Cd(o.acAt, 'birazdan')}</div>` : '';
    return `<tr data-oid="${esc(o.id)}"><td class="mono">#${esc(o.id)}<div class="muted" style="font-size:11.5px">${dtstr(o.t)}</div></td><td>${esc(o.title)}${o.qty > 1 ? ` <span class="muted">×${NUM(o.qty)}</span>` : ''}</td><td>${esc(user(role === 'b' ? o.seller : o.buyer).name)}</td><td><span class="pill p-${esc(o.status)}">${esc(ST[o.status] || o.status)}</span>${cd}</td><td class="num">${TL(role === 'b' ? o.total : (o.net != null ? o.net : o.total * (1 - o.rate / 100)))}</td><td><a class="btn btn-sm ${hot ? 'btn-primary' : ''}" href="#siparis-${esc(o.id)}">${role === 's' && o.status === 'odendi' ? 'Teslim et' : role === 'b' && o.status === 'teslim' ? 'Onayla' : 'Detay'}</a></td></tr>`; }).join('')}</tbody></table></div>`; }
function p2OrdersTab(u, role) { const r = role === 'b' ? 'buyer' : 'seller'; const d = p2MyOrders(r);
  if (!d) return `<div class="panel">${pLoading('Siparişler yükleniyor…')}</div>`; if (d.err) return `<div class="panel panel-b">${p2Err(d)}</div>`;
  const L = d.ids.map(ord).filter(o => o && (role === 'b' ? o.buyer : o.seller) === u.id);
  const open = L.filter(o => ['odendi', 'teslim', 'itiraz'].includes(o.status));
  return `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>${role === 'b' ? 'Siparişlerim' : 'Satışlarım'}</h3><span class="muted" style="font-size:12px">${open.length ? open.length + ' açık sipariş · ' : ''}Ödemeler teslim onaylanana kadar havuzda bekler</span></div>${p2OTbl(L, role)}${d.next ? `<div class="p1more"><button type="button" class="btn" data-act="p2-omore" data-r="${r}">Daha fazla göster</button></div>` : ''}</div>`; }
const P2_TXK = { yukleme: 'Yükleme', satis: 'Satış', satin_alma: 'Satın alma', iade: 'İade', bonus: 'Bonus', duzeltme: 'Düzeltme', doping: 'Doping', puan: 'Puan' };
function p2Hareket(u) {
  const tx = need('me:tx', () => call('GET', 'me/tx?limit=50', null, { quiet: true }).then(j => ({ tx: (j.data || {}).tx || [], next: (j.data || {}).next || null })), 20000);
  const dp = need('me:dep', () => call('GET', 'me/deposits?limit=20', null, { quiet: true }).then(j => { const L = (j.data || {}).deps || []; p1Up(S.deps, L); return { ids: L.map(x => x.id) }; }), 20000);
  const v = vip(u), nx = vipNext(u), rate = +S.set.ptRate || 100;
  const vipCard = `<div class="panel panel-b stack"><div class="hstack" style="justify-content:space-between"><div><div class="eyebrow">VIP seviyeniz</div><div style="font-family:var(--f-display);font-size:24px;font-weight:800;text-transform:uppercase;color:${esc(v.c)}">${esc(v.n)}</div></div><div style="text-align:right"><div class="eyebrow">Puanınız</div><div class="mono" style="font-size:22px;font-weight:700">${NUM(u.pts)}</div><span class="muted" style="font-size:12px">= ${TL(r2((u.pts || 0) / rate))}</span></div></div>
    <div class="prog"><i style="width:${nx ? Math.min(100, Math.max(0, ((u.vol || 0) - v.min) / (nx.min - v.min) * 100)) : 100}%"></i></div>
    <div class="muted" style="font-size:12.5px">${nx ? `${esc(nx.n)} seviyeye ${TL(r2(nx.min - (u.vol || 0)))} işlem hacmi kaldı.` : 'En üst seviyedesiniz.'} İşlem hacminiz: <b class="mono">${TL(u.vol || 0)}</b> · Alışverişte %${String(v.cb).replace('.', ',')} puan kazanırsınız.</div>
    <form class="stack" data-form="pts" style="gap:8px;border-top:1px dashed var(--line);padding-top:10px"><div class="eyebrow">Puanı bakiyeye çevir</div><span class="muted" style="font-size:12.5px">${NUM(rate)} puan = 1 TL. En az 500 puan, 100'ün katları çevrilir. Puandan gelen bakiye alışverişte kullanılır, çekilemez.</span>
      <div class="hstack"><input class="inp" id="pt_amt" type="number" min="500" step="100" value="${Math.max(500, Math.floor((u.pts || 0) / 100) * 100)}" style="max-width:160px" aria-label="Çevrilecek puan"><button class="btn btn-primary" ${(u.pts || 0) < 500 ? 'disabled' : ''}>Bakiyeye çevir</button></div></form></div>`;
  const txB = !tx ? pLoading('Hareketler yükleniyor…') : tx.err ? p2Err(tx) : tx.tx.length ? `<div class="tbl-w"><table class="tbl mcards p2tbl"><thead><tr><th>Tarih</th><th>İşlem</th><th class="num">Tutar</th></tr></thead><tbody>${tx.tx.map(t => `<tr><td class="mono" style="white-space:nowrap">${dtstr(t.t)}</td><td>${esc(t.l)}${P2_TXK[t.k] ? ` <span class="chip">${P2_TXK[t.k]}</span>` : ''}</td><td class="num ${t.a < 0 ? 'neg' : 'pos'}">${t.a > 0 ? '+' : ''}${TL(t.a)}</td></tr>`).join('')}</tbody></table></div>${tx.next ? `<div class="p1more"><button type="button" class="btn" data-act="p2-txmore">Daha fazla göster</button></div>` : ''}` : emptyBox('Henüz hareket yok', 'Bakiye yüklediğinizde, alışveriş ya da satış yaptığınızda burada görünür.');
  const DL = dp && !dp.err ? dp.ids.map(id => S.deps.find(x => x.id === id)).filter(Boolean) : [];
  const depB = DL.length ? `<div class="panel"><div class="panel-h"><h3>Yükleme bildirimlerim</h3><button type="button" class="btn btn-sm btn-primary" data-act="deposit">Bakiye yükle</button></div><div class="tbl-w"><table class="tbl mcards p2tbl"><thead><tr><th>Tarih</th><th>Yöntem</th><th>Durum</th><th class="num">Tutar</th></tr></thead><tbody>${DL.map(d => `<tr><td style="white-space:nowrap">${dtstr(d.t)}</td><td>${esc(p2Gw(d.gw).n)}${d.toBank ? `<div class="muted" style="font-size:12px">${esc(d.toBank)}</div>` : ''}${d.net ? `<div class="muted" style="font-size:12px">${esc(d.net)}</div>` : ''}</td><td>${p2DPill(d.status)}${d.reason ? `<div class="muted" style="font-size:11.5px">${esc(d.reason)}</div>` : ''}</td><td class="num">${TL(d.amount)}${d.bonus ? `<div class="pos" style="font-size:11.5px">+${TL(d.bonus)} bonus</div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  return `<div class="kpis"><div class="kpi hl"><small>Toplam bakiye</small><b>${TL(avail(u))}</b></div><div class="kpi"><small>Çekilebilir</small><b>${TL(u.bal || 0)}</b><span class="muted" style="font-size:12px">Satışlar ve havale/EFT yüklemeleri</span></div><div class="kpi"><small>Yalnız alışveriş</small><b>${TL(u.bonus || 0)}</b><span class="muted" style="font-size:12px">Kart, kripto, bonus ve puan</span></div></div>
    ${vipCard}${depB}<div class="panel"><div class="panel-h"><h3>Bakiye hareketleri</h3></div>${txB}</div>`;
}
function p2Ozet(u) {
  const b = p2MyOrders('buyer'), s = p2MyOrders('seller');
  const buys = b && !b.err ? b.ids.map(ord).filter(Boolean) : [], sells = s && !s.err ? s.ids.map(ord).filter(Boolean) : [];
  const needS = sells.filter(o => o.status === 'odendi').length, needB = buys.filter(o => o.status === 'teslim').length;
  const pool = r2(sells.filter(o => ['odendi', 'teslim', 'itiraz'].includes(o.status)).reduce((x, o) => x + (o.net != null ? o.net : o.total * (1 - o.rate / 100)), 0));
  const nn = S.notifs.filter(n => n.u === u.id && !n.read).length; const code = u.refCode || refCode(u);
  return `<div class="kpis"><div class="kpi hl"><small>Toplam bakiye</small><b>${TL(avail(u))}</b><span class="muted" style="font-size:12px">Çekilebilir ${TL(u.bal || 0)} · Yalnız alışveriş ${TL(u.bonus || 0)}</span></div><div class="kpi"><small>Havuzdaki satışlarım</small><b>${TL(pool)}</b><span class="muted" style="font-size:12px">Alıcı onaylayınca hesabınıza geçer</span></div><div class="kpi"><small>Puanınız</small><b>${NUM(u.pts)}</b></div><div class="kpi"><small>Okunmamış bildirim</small><b>${nn}</b></div></div>
    <div class="hstack"><button class="btn btn-primary" data-act="deposit">Bakiye yükle</button><button class="btn" data-act="p2-wd">Para çek</button><a class="btn" href="#ilan-ver">İlan ver</a><button class="btn" data-act="tab" data-t="hareket">Bakiye hareketleri</button></div>
    ${needS ? `<div class="note note-warn"><b>${needS} siparişte teslimat sizi bekliyor.</b> <a href="#hesabim" data-act="tab" data-t="satis" style="text-decoration:underline">Satışlarım</a></div>` : ''}
    ${needB ? `<div class="note note-warn"><b>${needB} siparişte onayınız bekleniyor.</b> <a href="#hesabim" data-act="tab" data-t="alis" style="text-decoration:underline">Siparişlerim</a></div>` : ''}
    <div class="note note-info">Satın aldığınızda ödemeniz güvenli havuzda bekler; ürünü teslim aldığınızı onaylayınca satıcıya geçer. Para çekme çok yakında açılıyor.</div>
    <div class="panel panel-b stack"><div class="eyebrow">Davet kodunuz</div><div class="cprow"><span><b class="mono" style="font-size:16px">${esc(code)}</b><br><span class="muted" style="font-size:12px">Arkadaşlarınız üye olurken bu kodu yazabilir.</span></span><button class="btn btn-sm" data-act="copy" data-v="${esc(code)}">Kodu kopyala</button></div></div>`;
}
p2AccTabs = (u, base) => { const c = role => { const d = API.cache['me:ord:' + role]; const v = d && d.v; if (!v || v.err) return 0; return v.ids.map(ord).filter(o => o && (role === 'buyer' ? o.buyer === u.id && o.status === 'teslim' : o.seller === u.id && o.status === 'odendi')).length; };
  return [['ozet', 'Özet'], ['alis', 'Siparişlerim', c('buyer')], ['satis', 'Satışlarım', c('seller')], ['hareket', 'Bakiye hareketleri']].concat(base.filter(([k]) => k !== 'ozet')); };
p2AccBody = (u, tab) => tab === 'ozet' ? p2Ozet(u) : tab === 'alis' ? p2OrdersTab(u, 'b') : tab === 'satis' ? p2OrdersTab(u, 's') : tab === 'hareket' ? p2Hareket(u) : null;

/* ================= dopingler ================= */
function pDopeModal(id) { const l = lst(id); if (!l) return; const u = me();
  modal(mWrap('Doping al · #' + (l.no || ''), `<div class="muted p2w" style="font-size:13px">${esc(l.title)}</div><div class="note note-info" style="font-size:12.5px">Doping ücreti bakiyenizden düşülür. Bakiyeniz: <b>${TL(avail(u))}</b>. Süreyi siz seçin; aktif dopingi uzatabilirsiniz.</div>
    <div class="stack" style="gap:8px">${Object.entries(S.dopings || {}).map(([key, d]) => `<div class="dopbuy"><div style="min-width:0;flex:1"><b>${esc(d.name)}</b><span class="muted" style="display:block;font-size:12px">${esc(d.desc || '')} · ${on(l, key) ? 'Aktif · ' + left(l.dop[key]) + ' kaldı' : 'günlük ' + TL(d.pd || r2(d.p / 7))}</span></div>${dopSel('dg_' + l.id + '_' + key, key, 1)}<button type="button" class="btn btn-sm btn-primary" data-act="dope" data-id="${esc(l.id)}" data-k="${esc(key)}">${on(l, key) ? 'Uzat' : 'Al'}</button></div>`).join('')}</div>`)); }

/* ana sayfa vitrini: dopingi süren ilanlar (GET listings?dop=vitrin) */
{ const f = vHome; vHome = function () {
    const d = need('L:vitrin', () => call('GET', 'listings?dop=vitrin&sort=yeni&limit=12', null, { quiet: true }).then(j => { const x = j.data || {}; p1UpL(x.listings); p1UpU(x.users); return { ids: (x.listings || []).map(l => l.id) }; }));
    let h = f.apply(this, arguments);
    if (!d) h = h.replace(/(<h2>Vitrin İlanları<\/h2>[\s\S]*?<div class="lrows">)<div class="empty">[\s\S]*?<\/div>(<\/div><\/div>)/, '$1' + pLoading('Vitrin yükleniyor…').replace(/^<div class="panel panel-b">|<\/div>$/g, '') + '$2');
    return h; }; }
/* İlanlarım: aktif ilanlara doping düğmesi ve süren dopingler */
{ const f = pMyListings; pMyListings = function (u) { let h = f(u);
    return h.replace(/<tr data-lid="(l\d+)">([\s\S]*?)<\/tr>/g, (m, id, inner) => { const l = lst(id); if (!l) return m; const act = Object.keys(S.dopings || {}).filter(k => on(l, k)).map(k => `<span class="chip ok">${esc(S.dopings[k].name)} · ${left(l.dop[k])}</span>`).join(' ');
      let x = inner; if (act) x = x.replace(/(<\/a><div class="muted" style="font-size:12px">[\s\S]*?)(<\/div>)/, `$1<div style="margin-top:4px">${act}</div>$2`);
      if (l.status === 'aktif') x = x.replace('<div class="hstack" style="flex-wrap:nowrap">', `<div class="hstack" style="flex-wrap:nowrap"><button class="btn btn-sm" data-act="p2-dopm" data-id="${esc(l.id)}">Doping</button>`);
      return `<tr data-lid="${id}">${x}</tr>`; }); }; }

/* ================= yönlendirme ================= */
/* sayfaya her girişte sipariş / hesap verisi sunucudan tazelenir (başka sekmede ya da karşı tarafta olan değişiklikler) */
{ const r0 = render; render = function () { const r = route(); if (r !== P2.lastR) { P2.lastR = r;
      if (r.startsWith('siparis-')) needDrop('ord:' + r.slice(8)); else if (r === 'hesabim') needDrop('me:ord', 'me:tx', 'me:dep'); else if (isAdmRoute(r)) needDrop('adm:dep', 'adm:ord'); }
    return r0.apply(this, arguments); }; }
{ const t0 = ACT.tab; ACT.tab = (d, e) => { if (d && d.t !== ui.tab) needDrop('me:ord', 'me:tx', 'me:dep'); return t0(d, e); }; }
{ const v0 = view; view = function (r) { if (r.startsWith('siparis-') && !API.booting && API.live && !(maintOn() && !isPanel())) return pOrder(r.slice(8)); return v0(r); }; }

/* ================= Yönetim ================= */
/* nav rozetleri: bekleyen yükleme ve itiraz sayısı sunucudan (GET admin/today) */
const p2AdmToday = () => isPanel() ? p1AdmLoad('adm:today', 'admin/today', null, 15000) : null;
/** liste yanıtındaki güncel sayıyı rozetlere de yansıt (Bugün verisi önbellekte eskiyse) */
const p2QSet = (k, n) => { const c = API.cache['adm:today']; if (c && c.v && c.v.queues && +c.v.queues[k] !== +n) { c.v.queues[k] = +n || 0; setTimeout(() => { if (isAdmRoute(route())) render(); }, 0); } };
{ const qn = k => { const c = API.cache['adm:today']; const n = c && c.v && c.v.queues ? +c.v.queues[k] || 0 : 0; return Array.from({ length: n }, () => ({ t: now(), status: 'bekliyor', gw: 'havale', amount: 0, total: 0 })); };
  const a = admQ('odeme'); if (a) a.L = () => qn('deps'); const b = admQ('siparis'); if (b) b.L = () => qn('disputes'); }
const P2_Q = [['deps', 'Yükleme onayı', 'odeme', '#yonetim/odeme/yuklemeler?f=bekliyor'], ['disputes', 'İtirazlı sipariş', 'siparis', '#yonetim/siparis?f=itiraz'], ['orders', 'Teslim bekleyen sipariş', 'siparis', '#yonetim/siparis?f=odendi'], ['listings', 'İlan onayı', 'ilan', '#yonetim/ilan/moderasyon?f=beklemede'], ['flagged', 'Engellenen mesaj', 'mesaj', '#yonetim/mesaj']];
admToday = function () { const dd = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }); const d = p2AdmToday(); const u = me();
  const desc = dd[0].toLocaleUpperCase('tr-TR') + dd.slice(1) + '.';
  if (!d) return { desc, actions: '', body: pLoading() }; if (d.err) return { desc, actions: '', body: p1Err(d) };
  const Q = d.queues || {}, K = d.kpi, O = d.outbox || {}; const qs = P2_Q.filter(([k, , p]) => can(p) && +Q[k] > 0); const tot = qs.reduce((s, [k]) => s + (+Q[k] || 0), 0);
  let h = `${u && !u.tfa ? `<div class="note note-warn">Hesabınızda <b>2 adımlı doğrulama kapalı</b>. Güvenliğiniz için <a href="#hesabim" data-act="tab" data-t="profil" style="text-decoration:underline">Hesabım › Profil ve güvenlik</a> bölümünden e-posta ile açmanızı öneririz.</div>` : ''}
    <div class="sec-h"><h2>İş kuyruğu</h2><span>Yetkili olduğunuz bekleyen işler</span></div>
    ${qs.length ? `<div class="kpis">${qs.map(([k, l, , href]) => `<a class="kpi" href="${href}"><small>${esc(l)}</small><b>${NUM(Q[k])}</b><span class="muted" style="font-size:12px">İncele →</span></a>`).join('')}</div>` : '<div class="panel empty"><b>Bekleyen iş yok.</b>Yeni talepler geldiğinde burada görünür.</div>'}
    ${can('sms') ? `<div class="sec-h"><h2>E-posta & SMS kuyruğu</h2></div><div class="kpis"><div class="kpi"><small>Gönderim bekleyen</small><b>${NUM(O.queued)}</b></div><div class="kpi ${O.failed ? 'hl' : ''}"><small>Gönderilemeyen</small><b>${NUM(O.failed)}</b><a class="muted" style="font-size:12px;text-decoration:underline" href="#yonetim/sms/kayitlar">Gönderim kayıtları</a></div></div>` : ''}`;
  if (K) h += `<div class="sec-h"><h2>Üyeler</h2></div>
    <div class="kpis"><div class="kpi hl"><small>Toplam üye</small><b>${NUM(K.users)}</b></div><div class="kpi"><small>Bugün katılan</small><b>${NUM(K.newToday)}</b></div><div class="kpi"><small>Çevrimiçi (5 dk)</small><b>${NUM(K.online)}</b></div><div class="kpi"><small>Çalışan</small><b>${NUM(K.staff)}</b></div><div class="kpi"><small>Askıda</small><b>${NUM(K.banned)}</b></div></div>`;
  return { desc: desc + ' ' + (tot ? tot + ' iş bekliyor.' : 'Şu an bekleyen iş yok.'), actions: '', body: h }; };

/* Ödemeler › Yükleme onayları / Ödeme yöntemleri / Banka & kripto hesapları */
function p2AdmDeps(P) { const F = P.f || 'bekliyor'; const st = F === 'tumu' ? 'tumu' : F;
  const d = p1AdmLoad('adm:dep:' + F, 'admin/deposits?status=' + encodeURIComponent(st) + '&limit=100', x => { (x.users || []).forEach(apiUpsertUser); p1Up(S.deps, x.deps); p2QSet('deps', x.pending); return { ids: (x.deps || []).map(y => y.id), pending: +x.pending || 0, next: x.next }; }, 15000);
  if (!d) return { body: pLoading('Yüklemeler yükleniyor…') }; if (d.err) return { body: p1Err(d) };
  const DL = d.ids.map(id => S.deps.find(x => x.id === id)).filter(Boolean); const pend = DL.filter(x => x.status === 'bekliyor');
  const head = `${aSum([['Bekleyen bildirim', NUM(d.pending)], ['Bu listede bekleyen tutar', TL(r2(pend.reduce((s, x) => s + (+x.amount || 0), 0))), 1], ['En eski talep', pend.length ? ageTxt(now() - Math.min(...pend.map(x => x.t))) : '—']])}
    ${aFilter({ chips: aChips('dpf', F, [['bekliyor', 'Bekleyen', d.pending], ['onaylandı', 'Onaylanan'], ['reddedildi', 'Reddedilen'], ['tumu', 'Tümü']]), right: `<span class="muted" style="font-size:12.5px">${DL.length} kayıt · havale, kripto ve PayTR</span>` })}`;
  const rows = DL.map(x => { const g = p2Gw(x.gw); const U = user(x.u);
    return `<tr class="${x.status === 'bekliyor' ? 'pend' : ''}" data-did="${esc(x.id)}"><td style="white-space:nowrap">${dtstr(x.t)}<div class="muted mono" style="font-size:11px">${esc(x.id)}</div></td><td style="white-space:nowrap">${x.txAt ? `<b class="mono">${new Date(x.txAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b>` : '<span class="muted">—</span>'}</td>
      <td><b>${esc(U.name)}</b></td><td class="p2w">${esc(g.n)}${x.toBank ? `<div style="font-size:12px">Hesabımız: <b>${esc(x.toBank)}</b></div>` : ''}${x.net ? `<div style="font-size:12px">Ağ: <b>${esc(x.net)}</b></div>` : ''}${x.txid ? `<div class="mono" style="font-size:11.5px">TxID: ${esc(x.txid)}</div><button class="btn btn-sm" data-act="copy" data-v="${esc(x.txid)}" style="margin-top:4px">TxID kopyala</button>` : ''}${x.note ? `<div class="muted" style="font-size:12px">${esc(x.note)}</div>` : ''}${x.receipt ? `<div style="margin-top:4px"><button class="btn btn-sm" data-act="p2-img" data-u="${esc(x.receipt)}" data-t="Dekont · ${esc(U.name)}">Dekontu gör</button></div>` : ''}</td>
      <td>${p2DPill(x.status)}${x.reason ? `<div class="muted" style="font-size:11.5px">${esc(x.reason)}</div>` : ''}${x.coupon ? `<div style="font-size:11.5px">Kupon <b class="mono">${esc(x.coupon)}</b></div>` : ''}</td>
      <td class="num"><b>${TL(x.amount)}</b>${x.bonus ? `<div class="pos" style="font-size:11.5px">+${TL(x.bonus)} bonus</div>` : ''}<div class="muted" style="font-size:11px">${x.w ? 'çekilebilir' : 'yalnız alışveriş'}</div></td>
      <td>${x.status === 'bekliyor' && g.manual !== false && !/^paytr/.test(x.gw) && can('odeme') ? `<div class="hstack" style="flex-wrap:nowrap"><button class="btn btn-sm btn-ok" data-act="dep-ok" data-id="${esc(x.id)}">Onayla</button><button class="btn btn-sm btn-bad" data-act="dep-no" data-id="${esc(x.id)}">Reddet</button></div>` : ''}</td></tr>`; }).join('');
  return { body: `<div class="panel">${head}${DL.length ? `<div class="tbl-w"><table class="tbl mcards p2tbl"><thead><tr><th>Bildirim</th><th>Dekont / işlem tarihi</th><th>Üye</th><th>Yöntem / not</th><th>Durum</th><th class="num">Tutar</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyBox(F === 'bekliyor' ? 'Bekleyen yükleme yok' : 'Bu filtrede kayıt yok', '')}</div>
    <div class="note note-info" style="font-size:12.5px">Onaylamadan önce banka hesabınızda tutarı, tarihi ve gönderen adını kontrol edin. Havale/EFT yüklemeleri çekilebilir bakiyeye, kripto yüklemeleri alışveriş bakiyesine eklenir; kupon bonusu her zaman alışveriş bakiyesidir.</div>` }; }
function p2AdmGws() { const d = p1AdmLoad('adm:gws', 'admin/gateways', x => { if (Array.isArray(x.gws)) S.admGws = x.gws; return x; }, 30000);
  if (!d) return { body: pLoading() }; if (d.err) return { body: p1Err(d) };
  const G = S.admGws || d.gws || []; const pt = d.paytr || {};
  return { body: `<div class="panel panel-b stack"><div class="eyebrow">PayTR (kart ve PayTR Havale/EFT)</div>${pt.configured ? `<div class="note note-ok"><b>PayTR bağlı.</b> ${pt.testMode ? 'Test modu açık: gerçek para çekilmez.' : 'Canlı mod.'} Kart ve PayTR Havale/EFT yöntemleri açıksa üyelere gösterilir.</div>` : `<div class="note note-warn"><b>PayTR mağaza bilgileri henüz girilmedi.</b> Bu yüzden kart ve PayTR Havale/EFT seçenekleri üyelere “Kart ile ödeme yakında” olarak, kapalı gösterilir. Bakiye şimdilik havale/EFT bildirimi ve sizin onayınızla yüklenir.</div>`}</div>
    <form class="panel" data-form="gws"><div class="panel-h" style="flex-wrap:wrap"><h3>Ödeme yöntemleri ve bedelleri</h3><span class="muted" style="font-size:12px">Aç / kapat anında uygulanır; bedeli değiştirip kaydedin</span></div>
    ${DEPTABS.map(([c, cn]) => { const L = G.filter(g => g.cat === c); return L.length ? `<div class="gwcat">${cn}</div>` + L.map(g => { const isOn = g.setOn != null ? g.setOn : g.on; return `<div class="gwrow"><button type="button" class="tgl ${isOn ? 'on' : ''}" data-act="gw-toggle" data-id="${esc(g.id)}" aria-pressed="${isOn}">${isOn ? 'Aktif' : 'Pasif'}</button><label><b>${esc(g.n)}</b><div class="muted" style="font-size:12px">${esc(g.t || '')}${g.soon ? ' · <span class="chip warn">PayTR ayarlanmadı · üyelere “yakında”</span>' : ''}</div><div class="muted" style="font-size:11.5px">${g.w ? 'Çekilebilir bakiye' : 'Yalnız alışveriş bakiyesi'}${g.manual ? ' · ekip onaylı' : ''}</div></label><div class="fld"><label for="gw_fee_${esc(g.id)}">Bedel %</label><input class="inp" type="number" step="0.01" min="0" max="50" id="gw_fee_${esc(g.id)}" value="${+g.fee || 0}"></div><div class="keys"><span class="muted" style="font-size:12px">${g.id === 'havale' || g.id === 'kripto' ? 'Hesaplar <a href="#yonetim/odeme/hesaplar" style="text-decoration:underline">Banka & kripto hesapları</a> sekmesinde' : 'Mağaza bilgileri sunucuda şifreli saklanır'}</span></div></div>`; }).join('') : ''; }).join('')}${aSave('Ödeme ayarlarını kaydet')}</form>` }; }
function p2AdmAcc() { const d = p1AdmLoad('adm:cnets', 'admin/crypto-nets', x => { if (Array.isArray(x.cryptoNets)) S.cryptoNets = x.cryptoNets; return { n: (x.cryptoNets || []).length }; }, 30000);
  if (!d) return { body: pLoading() }; if (d.err) return { body: p1Err(d) };
  return { body: `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Havale / EFT hesaplarımız</h3><span class="muted" style="font-size:12px">Üyeler havale bildirirken bu hesaplardan birini seçer</span></div><div class="panel-b stack">${(S.banks || []).map(k => `<div class="cprow"><span class="p2w"><b>${esc(k.b)}</b> · ${esc(k.n)}<br><span class="mono">${esc(k.i)}</span></span><button type="button" class="btn btn-sm btn-bad" data-act="bank-del" data-id="${esc(k.id)}">Sil</button></div>`).join('') || '<span class="muted">Tanımlı hesap yok. Üyeler havale ile yükleme yapamaz.</span>'}
    <form class="row3" data-form="bank" style="align-items:end"><div class="fld"><label for="bk_b">Banka</label><input class="inp" id="bk_b" required minlength="2" maxlength="60" placeholder="Ziraat Bankası"></div><div class="fld"><label for="bk_n">Hesap sahibi</label><input class="inp" id="bk_n" required minlength="2" maxlength="120"></div><div class="fld"><label for="bk_i">IBAN</label><input class="inp mono" id="bk_i" required minlength="6" maxlength="60" placeholder="TR.."></div><button class="btn btn-sm btn-primary">Hesap ekle</button></form></div></div>${cryptoAdmin()}` }; }
function p2AdmOdeme(sub, P) { if (sub === 'yontemler') return Object.assign({ desc: 'Ödeme yöntemlerini açıp kapatın ve üyeden alınacak hizmet bedelini belirleyin.' }, p2AdmGws());
  if (sub === 'hesaplar') return Object.assign({ desc: 'Havale hesapları ve kripto cüzdan adresleri.' }, p2AdmAcc());
  return Object.assign({ desc: 'Havale ve kripto bildirimlerini kontrol edip onaylayın ya da reddedin. Onaylanan tutar üyenin bakiyesine anında eklenir.' }, p2AdmDeps(P)); }

/* Siparişler & itirazlar */
function p2AdmOrders(P) { const F = P.f || 'tumu', q = (P.q || '').trim();
  const d = p1AdmLoad('adm:ord:' + F + ':' + q, 'admin/orders?status=' + encodeURIComponent(F) + '&limit=100' + (q ? '&q=' + encodeURIComponent(q) : ''), x => { p2UpO(x.orders); p1UpU(x.users); const c = x.counts || {}; p2QSet('disputes', c.itiraz || 0); p2QSet('orders', c.odendi || 0); return { ids: (x.orders || []).map(o => o.id), counts: c, escrow: +x.escrow || 0, next: x.next }; }, 15000);
  if (!d) return { body: pLoading('Siparişler yükleniyor…') }; if (d.err) return { body: p1Err(d) };
  const C = d.counts || {}; const all = Object.values(C).reduce((s, n) => s + (+n || 0), 0);
  const L = d.ids.map(ord).filter(Boolean).sort((a, b) => (b.status === 'itiraz') - (a.status === 'itiraz') || b.t - a.t);
  const SF = [['itiraz', 'İtirazlı', C.itiraz || 0], ['odendi', 'Teslim bekliyor', C.odendi || 0], ['teslim', 'Teslim edildi', C.teslim || 0], ['tamam', 'Tamamlandı', C.tamam || 0], ['iade', 'İade', C.iade || 0], ['tumu', 'Tümü', all]];
  return { desc: 'Havuzlu siparişler. İtiraz kararı sipariş sayfasında verilir: satıcı haklıysa ödeme aktarılır, alıcı haklıysa iade edilir.', body: `<div class="panel">${aSum([['Havuzda bekleyen', TL(d.escrow), 1], ['İtirazlı', NUM(C.itiraz || 0)], ['Teslim bekleyen', NUM(C.odendi || 0)]])}
    ${aFilter({ q: P.q || '', ph: 'Sipariş no (S100001), ürün veya üye adı', chips: aChips('sof', F, SF), right: `<span class="muted" style="font-size:12.5px">${L.length} sipariş</span>` })}
    ${L.length ? `<div class="tbl-w"><table class="tbl mcards p2tbl"><thead><tr><th>Sipariş</th><th>Ürün</th><th>Alıcı → Satıcı</th><th>Durum</th><th class="num">Tutar</th><th class="num">Komisyon</th><th></th></tr></thead><tbody>${L.map(o => `<tr class="${o.status === 'itiraz' ? 'pend' : ''}" data-oid="${esc(o.id)}"><td class="mono">#${esc(o.id)}<div class="muted" style="font-size:11px">${dtstr(o.t)}</div></td><td>${esc(o.title)}${o.dproof && o.dproof.length ? ' <span class="chip">teslim görseli</span>' : ''}${o.status === 'itiraz' && o.reason ? `<div class="muted" style="font-size:11.5px">${esc(o.reason)}</div>` : ''}</td><td>${esc(user(o.buyer).name)} → ${esc(user(o.seller).name)}</td><td><span class="pill p-${esc(o.status)}">${esc(ST[o.status] || o.status)}</span>${o.status === 'itiraz' ? `<div class="muted" style="font-size:11px">${ageTxt(now() - (o.up || o.t))} önce</div>` : ''}</td><td class="num">${TL(o.total)}</td><td class="num">${TL(o.fee != null ? o.fee : o.total * o.rate / 100)}</td><td><a class="btn btn-sm ${o.status === 'itiraz' ? 'btn-primary' : ''}" href="#siparis-${esc(o.id)}">${o.status === 'itiraz' ? 'İncele' : 'Detay'}</a></td></tr>`).join('')}</tbody></table></div>` : emptyBox(q ? 'Bu aramaya uyan sipariş yok' : 'Bu filtrede sipariş yok', '')}</div>` }; }

/* Çekiliş & kupon › Kuponlar */
function p2AdmKupon() { const d = p1AdmLoad('adm:cp', 'admin/coupons', x => { if (Array.isArray(x.coupons)) S.coupons = x.coupons; return { n: (x.coupons || []).length }; }, 30000);
  if (!d) return { body: pLoading() }; if (d.err) return { body: p1Err(d) };
  const L = S.coupons || [];
  return { desc: 'Bakiye yüklemede kullanılan kupon kodları. Her üye bir kuponu bir kez kullanabilir; bonus alışveriş bakiyesine eklenir.', body: `<div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h3>Kupon kodları</h3><span class="muted" style="font-size:12px">${L.length} kupon</span></div>
    ${L.length ? `<div class="tbl-w"><table class="tbl mcards p2tbl"><thead><tr><th>Kod</th><th class="num">Bonus</th><th class="num">En fazla</th><th class="num">Kullanım</th><th>Durum</th><th></th></tr></thead><tbody>${L.map(c => `<tr data-cid="${esc(c.id)}"><td class="mono"><b>${esc(c.code)}</b></td><td class="num">%${c.pct}</td><td class="num">${TL(c.max)}</td><td class="num">${NUM(c.n != null ? c.n : (c.used || []).length)}${c.reserved ? `<div class="muted" style="font-size:11px">${NUM(c.reserved)} onay bekliyor</div>` : ''}</td><td>${c.on ? '<span class="pill p-tamam">Açık</span>' : '<span class="pill p-iade">Durduruldu</span>'}</td><td><div class="hstack" style="flex-wrap:nowrap"><button type="button" class="btn btn-sm" data-act="cp-toggle" data-id="${esc(c.id)}">${c.on ? 'Durdur' : 'Aç'}</button><button type="button" class="btn btn-sm btn-bad" data-act="cp-del" data-id="${esc(c.id)}">Sil</button></div></td></tr>`).join('')}</tbody></table></div>` : emptyBox('Kupon yok', 'Aşağıdan ilk kuponu ekleyin.')}
    <form class="panel-b row3" data-form="coupon" style="border-top:1px solid var(--line);align-items:end"><div class="fld"><label for="cp_c">Kod</label><input class="inp mono" id="cp_c" required minlength="3" maxlength="30" pattern="[A-Za-z0-9_\\-]{3,30}" placeholder="BAYRAM10" style="text-transform:uppercase"></div><div class="fld"><label for="cp_p">Bonus %</label><input class="inp" id="cp_p" type="number" min="0.1" max="100" step="0.1" value="5"></div><div class="fld"><label for="cp_m">En fazla bonus (TL)</label><input class="inp" id="cp_m" type="number" min="1" step="1" value="50"></div><button class="btn btn-sm btn-primary">Kupon ekle</button></form></div>` }; }

/* Üyeler & bakiye › Bakiye düzeltme */
function p2AdmBakiye() { if (can('uye')) p1AdmLoad('adm:users:', 'admin/users?limit=100', x => { (x.users || []).forEach(apiUpsertUser); return x; }, 30000);
  const lg = can('muhasebe') ? p1AdmLoad('adm:ledger:duz', 'admin/ledger?k=duzeltme&limit=15', x => { (x.users || []).forEach(apiUpsertUser); return { L: x.ledger || [] }; }, 20000) : null;
  let f = balForm().replace('<input class="inp" id="ba_n" placeholder="Örn: Kampanya hediyesi">', '<input class="inp" id="ba_n" required minlength="3" maxlength="200" placeholder="Örn: Havale onayı · dekont 12.11 14:05">')
    .replace('Açıklama (üye bakiye hareketlerinde görür)', 'Gerekçe (zorunlu · üye bakiye hareketlerinde ve bildiriminde görür)');
  f = f.replace('<div><button class="btn btn-primary btn-sm">Uygula</button></div>', '<div class="note note-info" style="font-size:12.5px">Çekilebilir: üyenin para çekebileceği bakiye (satış, havale). Çekilemez: yalnız alışverişte kullanılır (kampanya, telafi). Her düzeltme gerekçesiyle kayda geçer.</div><div><button class="btn btn-primary btn-sm">Uygula</button></div>');
  const log = lg && !lg.err && lg.L.length ? `<div class="panel"><div class="panel-h"><h3>Son bakiye düzeltmeleri</h3></div><div class="tbl-w"><table class="tbl mcards p2tbl"><thead><tr><th>Tarih</th><th>Üye</th><th>Gerekçe</th><th>Yapan</th><th class="num">Tutar</th></tr></thead><tbody>${lg.L.map(t => `<tr><td style="white-space:nowrap">${dtstr(t.t)}</td><td>${esc(user(t.u).name)}</td><td>${esc(String(t.m || '').replace(/ · [^·]*$/, ''))}${t.w != null ? ` <span class="chip">${t.w ? 'çekilebilir' : 'alışveriş'}</span>` : ''}</td><td>${esc(t.by ? user(t.by).name : '-')}</td><td class="num ${t.a < 0 ? 'neg' : 'pos'}">${t.a > 0 ? '+' : ''}${TL(t.a)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  return { desc: 'Üye bakiyesine ekleme veya düşme. Gerekçe zorunludur ve denetim kaydına yazılır.', body: f + log }; }

{ const v0 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (!isPanel()) return v0(P);
    const it = admItem(P.k); if (!it || !admVis(it)) return v0(P);
    p2AdmToday();
    if (it.k === 'odeme') return pAdmPage(P, it, sub => p2AdmOdeme(sub, P));
    if (it.k === 'siparis') return pAdmPage(P, it, () => p2AdmOrders(P));
    if (it.k === 'kampanya') return pAdmPage(P, it, sub => sub === 'kupon' ? p2AdmKupon() : { body: pSoon(sub === 'cark' ? 'Şans çarkı çok yakında' : 'Çekilişler çok yakında', 'Bu kampanya sonraki güncellemelerde burada çalışacak. Kuponlar şimdiden kullanılabilir.', '<a class="btn btn-primary" href="#yonetim/kampanya/kupon">Kuponlara git</a>') });
    if (it.k === 'uye' && can('bakiye') && (P.sub === 'bakiye' || (!P.sub && (ui.asub || {}).uye === 'bakiye'))) return pAdmPage(Object.assign({}, P, { sub: 'bakiye' }), it, p2AdmBakiye);
    return v0(P); }; }
