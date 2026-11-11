/* ================== başlangıç: durum yükleme + ilk çizim ================== */
/* Son dosya olmalı. migrate() (demo/migrate.js) ve tcHashFill sonra yüklenen dosyalardaki işlevleri çağırır
   (POSTS_DEMO → demo/posts.js, tradeShot → 75-actions-core.js …). Tek dosyalı derlemede işlev bildirimleri
   yukarı taşındığı için her yerde çalışırdı; çok dosyalı derlemede (--prod [--demo]) her <script> ayrı
   çalıştığından durum ancak tüm dosyalar tanımlandıktan sonra kurulabilir. */
S = migrate(load()); VIP = S.vip; setTimeout(()=>tcHashFill().catch(()=>{}),0);
if(window.__r9Save){ delete window.__r9Save; save(); } // R9: temizlenmiş üye metinleri hemen kalıcı olsun

render();
