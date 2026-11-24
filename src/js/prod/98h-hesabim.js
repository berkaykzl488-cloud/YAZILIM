/* ================== Hesabım: işleyiciler (yalnız --prod derlemesinde) ==================
   hs-menu: sağdan açılan hesap menüsü (görünür "☰ Menü" düğmesi). Menüden sekme ya da çıkış seçilince menü önce kapanır.
   tab: data-s (al|sat) Hesabım › Borsa bölmesini seçer. hs-bx: bölme değişimi. hs-sum-retry: özeti yeniden yükle.          */
Object.assign(ACT, {
  'hs-menu': (d, e) => { const u = me(); if (!u) return mLogin(); sheetOpen(hsMenuSheet(u), e && e.target && e.target.closest ? e.target.closest('[data-act]') : null); },
  'hs-bx': (d) => { ui.hsBx = d.s === 'sat' ? 'sat' : 'al'; render(); },
  'hs-sum-retry': () => { needDrop('me:sum'); render(); }
});
{ const t0 = ACT.tab; ACT.tab = (d, e) => { if (d.s) ui.hsBx = d.s === 'sat' ? 'sat' : 'al'; const r = t0(d, e); if (route() === 'hesabim') window.scrollTo(0, 0); return r; }; }
/* menüdeki sekme / çıkış / yükleme: önce menü kapanır (yakalama aşaması; eylem kendi yolunda sürer) */
document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('#modal [data-hsmenu] [data-act]'); if (!el) return;
  if (['tab', 'logout'].includes(el.dataset.act)) closeModal(); }, true);
