/* ================== mobil menü: ☰ butonu + soldan açılan çekmece ==================
   ≤760 px'te üstteki kategori şeridi gizlenir; başlıktaki ☰ butonu çekmeceyi açar.
   Çekmece #cats içinde çizilir (temiz adres dönüştürmesi #cats bağlantılarını da kapsar).
   data-act yerine kendi dinleyicisini kullanır: bakım modunda da menü açılabilsin. */
const MNI = {
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  'metin2-tr':'<path d="M4 21V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
  'metin2-ep':'<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/><path d="M12 21L8 9l4-6 4 6z"/>',
  'metin2-pvp':'<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/>',
  borsa:'<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
  cekilis:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M12 8c-2-3-6-3-6 0s4 0 6 0c2 0 6 3 6 0s-4-3-6 0z"/>',
  'reklam-ver':'<path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  guvenli:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  rehber:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>',
  hesabim:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  mesajlar:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  bildirimler:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  'ilan-ver':'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  yonetim:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  cikis:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  giris:'<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M14 17l5-5-5-5"/><path d="M19 12H8"/>',
  burger:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>'
};
const mni = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${MNI[k]||MNI.home}</svg>`;
const MNAV_L = [['home','Ana Sayfa'],['metin2-tr','Metin2 TR'],['metin2-ep','Metin2 EP'],['metin2-pvp','Metin2 PVP'],['borsa','Yang Borsası','hot'],['cekilis','Çekiliş & Çark','hot'],['reklam-ver','Reklam Ver'],['guvenli','Güvenli Alışveriş'],['rehber','Rehber']];

function mnavHtml(r){
  const cur = r.startsWith('rehber') ? 'rehber' : r.startsWith('server-') ? (secOf({server:r.slice(7).split('-')[0]})==='tr'?'metin2-tr':'metin2-pvp') : r;
  const u = me();
  const it = ([h,t,c]) => `<a href="#${h}" class="mn-i${cur===h?' on':''}${c?' '+c:''}"${cur===h?' aria-current="page"':''}><span class="mn-ic">${mni(h)}</span><span>${esc(t)}</span></a>`;
  const nm = u ? unreadDM(u.id) : 0;
  const nn = u ? S.notifs.filter(n=>n.u===u.id&&!n.read).length : 0;
  const badge = n => n ? `<i class="mn-b">${n}</i>` : '';
  const acc = u ? `<div class="mn-sec">Hesabım</div>
      ${isPanel()?`<a href="#yonetim" class="mn-i"><span class="mn-ic">${mni('yonetim')}</span><span>Yönetim Paneli</span></a>`:''}
      <a href="#hesabim" class="mn-i${cur==='hesabim'?' on':''}"><span class="mn-ic">${mni('hesabim')}</span><span>Hesabım</span></a>
      <a href="#ilan-ver" class="mn-i${cur==='ilan-ver'?' on':''}"><span class="mn-ic">${mni('ilan-ver')}</span><span>İlan Ver</span></a>
      <a href="#mesajlar" class="mn-i${cur==='mesajlar'?' on':''}"><span class="mn-ic">${mni('mesajlar')}</span><span>Mesajlar</span>${badge(nm)}</a>
      <a href="#bildirimler" class="mn-i${cur==='bildirimler'?' on':''}"><span class="mn-ic">${mni('bildirimler')}</span><span>Bildirimler</span>${badge(nn)}</a>` : '';
  const who = u ? `<a href="#hesabim" class="mn-who">${av(u)}<span><b>${esc(u.name)}</b>${u.admin?'':`<small>Bakiye <span class="mono">${TL(avail(u))}</span></small>`}</span></a>` : '';
  const foot = u
    ? `<button type="button" class="btn btn-ghost btn-block mn-out" data-act="logout">${mni('cikis')} Çıkış Yap</button>`
    : (maintOn() ? '' : `<button type="button" class="btn btn-primary btn-block" data-act="login">${mni('giris')} Giriş Yap</button><button type="button" class="btn btn-block" data-act="register">Üye Ol</button>`);
  return `<div class="mn-ov" data-mnav="close"></div>
  <aside class="mn-d" id="mnavd" role="dialog" aria-modal="true" aria-label="Site menüsü">
    <div class="mn-h"><a href="#home" class="brand mn-brand">${ICO.han}<span>${esc(S.set.siteName)}</span></a>
      <button type="button" class="icob" data-act="theme" aria-label="${curTheme()==='dark'?'Gündüz moduna geç':'Gece moduna geç'}">${curTheme()==='dark'?THEME_ICO.sun:THEME_ICO.moon}</button>
      <button type="button" class="icob mn-x" data-mnav="close" aria-label="Menüyü kapat">${mni('x')}</button></div>
    <div class="mn-s">${who}<div class="mn-sec">Kategoriler</div>${MNAV_L.map(it).join('')}${acc}</div>
    ${foot?`<div class="mn-f">${foot}</div>`:''}
  </aside>`;
}
function mnavSet(open){
  ui.mnav = !!open;
  const n = $('#mnav'); if (n) n.classList.toggle('open', ui.mnav);
  document.body.classList.toggle('mnav-open', ui.mnav);
  document.querySelectorAll('[data-mnav="open"]').forEach(b=>b.setAttribute('aria-expanded', ui.mnav?'true':'false'));
  if (ui.mnav) setTimeout(()=>{ const x=$('#mnav .mn-x'); if(x) x.focus(); }, 30);
}
{ const rc0 = renderCats; renderCats = function(r){ rc0(r);
    const c = $('#cats'); if (!c) return;
    let n = $('#mnav'); if (!n) { n = document.createElement('div'); n.id = 'mnav'; n.className = 'mnav'; c.appendChild(n); }
    else if (n.parentNode !== c) c.appendChild(n);
    n.innerHTML = mnavHtml(r || route()); n.classList.toggle('open', !!ui.mnav); }; }
{ const rh0 = renderHeader; renderHeader = function(){ rh0();
    const h = $('#hdr .hdr-in'); if (!h || h.querySelector('.mburger')) return;
    h.insertAdjacentHTML('afterbegin', `<button type="button" class="icob mburger" data-mnav="open" aria-label="Menüyü aç" aria-controls="mnavd" aria-expanded="${ui.mnav?'true':'false'}">${mni('burger')}</button>`); }; }
document.addEventListener('click', e => {
  const t = e.target.closest('[data-mnav]');
  if (t) { e.preventDefault(); const was = ui.mnav; mnavSet(t.dataset.mnav === 'open'); if (was && !ui.mnav) { const b=$('.mburger'); if (b) b.focus(); } return; }
  // çekmecedeki bağlantı ya da giriş/çıkış: önce kapat, sonra gezinme/eylem kendi yoluyla sürer
  if (ui.mnav && e.target.closest('#mnav a, #mnav [data-act="login"], #mnav [data-act="register"], #mnav [data-act="logout"]')) mnavSet(false);
}, true);
document.addEventListener('keydown', e => {
  if (!ui.mnav) return;
  if (e.key === 'Escape') { e.preventDefault(); mnavSet(false); const b=$('.mburger'); if (b) b.focus(); return; }
  if (e.key === 'Tab') { const F = [...document.querySelectorAll('#mnavd a, #mnavd button')].filter(x=>x.offsetParent!==null); if (!F.length) return;
    const a = F[0], z = F[F.length-1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
});
window.addEventListener('resize', () => { if (ui.mnav && window.innerWidth > 760) mnavSet(false); });
