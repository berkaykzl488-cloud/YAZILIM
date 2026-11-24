/* ================== Hesabım: prod işleyicileri (yalnız --prod derlemesinde) ==================
   Menü, sekme ve bölme işleyicileri ortak (84-hesabim-act.js). Burada: hs-sum-retry (GET me/summary önbelleğini düşürüp yeniden yükler). */
ACT['hs-sum-retry'] = () => { needDrop('me:sum'); render(); };
