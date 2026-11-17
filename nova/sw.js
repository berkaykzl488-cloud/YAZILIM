// NOVA Fit servis çalışanı: uygulama dosyalarını önbelleğe alır, çevrimdışı çalışır.
// Sürümü artırınca eski önbellek temizlenir.
const VERSION = 'nova-v2';
const SHELL = ['./', './index.html', './css/core.css', './js/app.js', './manifest.webmanifest', './icons/icon.svg'];

// Kurulumda tüm uygulama dosyalarını (precache.json listesi) önbelleğe al: ilk açılıştan sonra tamamen çevrimdışı çalışır
async function precacheAll(cache) {
  await cache.addAll(SHELL);
  try {
    const res = await fetch('./precache.json', { cache: 'no-store' });
    if (!res.ok) return;
    const files = await res.json();
    for (let i = 0; i < files.length; i += 20) {
      await Promise.all(files.slice(i, i + 20).map(f => cache.add(f).catch(() => null)));
    }
  } catch { /* liste yoksa yalnız kabuk önbellekte kalır */ }
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(precacheAll).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Uygulama dosyaları: önce ağ (güncel kalsın), olmazsa önbellek
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Harita karoları ve yazı tipleri: önce önbellek
  if (/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(
      caches.open(VERSION + '-ext').then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        } catch { return hit || Response.error(); }
      })
    );
  }
  // Diğerleri (ör. Open Food Facts API) doğrudan ağa gider.
});

// Bildirime dokununca ilgili sayfayı aç (açık bir pencere varsa ona odaklan)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || './#/home', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        if ('navigate' in w) { try { await w.navigate(target); } catch { /* aynı kaynak değilse yoksay */ } }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
