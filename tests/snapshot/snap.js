// Regresyon kapısı: bir HTML derlemesini sabit saat + sabit rastgelelik + temiz localStorage ile açar,
// genel sayfaları, üye hesap sekmelerini (ACT.as) ve tüm yönetim bölümlerini/alt sekmelerini (#yonetim/<k>/<sub>) gezer,
// her rota için DOM metni (.txt) ve body HTML'i (.html) kaydeder (+ birkaç ekran görüntüsü). Konsol/sayfa hatası = başarısız.
//
//   node tests/snapshot/snap.js run  <dosya.html> <çıktıKlasörü> [--ls=durum.json] [--dump-ls=durum.json]
//   node tests/snapshot/snap.js diff <klasörA> <klasörB>
//   node tests/snapshot/snap.js gate [eski.html] [yeni.html]   (varsayılan: git HEAD:index.html ↔ ./index.html)
//
// --ls: sayfa açılmadan önce localStorage'a yüklenecek durum (dump-ls ile alınmış). Çok dosyalı derlemeleri "sıcak" açmak için.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process');

const T0 = new Date('2026-11-02T10:30:00+03:00'); // Pazartesi, mesai içi (destek açık)
const ROOT = path.resolve(__dirname, '../..');

function initScript() {
  // Deterministik Math.random ve crypto.getRandomValues (mulberry32). Date/zamanlayıcılar Playwright clock ile sabit.
  let s = 0x2545F491;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  if (window.crypto) {
    crypto.getRandomValues = a => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(rnd() * 256 ** (a.BYTES_PER_ELEMENT || 1)); return a; };
    crypto.randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(rnd() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });
  }
}

async function run(htmlFile, outDir, opt = {}) {
  fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
  // Dış ağ yok (Google Fonts vb.): yalnız file:// izinli → yazı tipleri ve ağ zamanlaması sabit.
  await ctx.route(u => !u.href.startsWith('file:'), r => r.abort());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource: net::ERR_FAILED/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', d => d.dismiss().catch(() => {}));
  // Saat duraklatılmış: Date/setTimeout/setInterval yalnız clock.runFor ile ilerler (gerçek zamandan bağımsız).
  await page.clock.install({ time: T0.getTime() - 60000 });
  await page.clock.pauseAt(T0);
  await page.addInitScript(initScript);
  if (opt.ls) await page.addInitScript(st => { if (!sessionStorage.getItem('__snap_ls')) { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); sessionStorage.setItem('__snap_ls', '1'); } }, JSON.parse(fs.readFileSync(opt.ls, 'utf8')));
  await page.goto('file://' + path.resolve(htmlFile));
  const settle = async () => { await page.waitForTimeout(60); await page.clock.runFor(1200); await page.waitForTimeout(60); };
  await settle();
  if (opt.dumpLs) fs.writeFileSync(opt.dumpLs, JSON.stringify(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))));

  let n = 0;
  const snap = async (name, shot) => {
    await settle();
    const d = await page.evaluate(() => {
      const pick = s => { const e = document.querySelector(s); return e ? e.innerText : ''; };
      return {
        txt: ['title: ' + document.title, 'hash: ' + location.hash, ...['#strip', '#hdr', '#cats', '#app', '#ftr', '#modal', '#ls'].map(s => `===== ${s}\n` + pick(s))].join('\n'),
        html: (() => { const c = document.body.cloneNode(true); c.querySelectorAll('script').forEach(x => x.remove()); [...c.childNodes].forEach(x => { if (x.nodeType === 3 && !x.textContent.trim()) x.remove(); }); return c.innerHTML; })(), // <script> etiketleri ve body'nin boşluk düğümleri hariç: tek/çok dosyalı derleme karşılaştırılabilsin
      };
    });
    const f = String(++n).padStart(3, '0') + '-' + name.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);
    fs.writeFileSync(path.join(outDir, f + '.txt'), d.txt);
    fs.writeFileSync(path.join(outDir, f + '.html'), d.html);
    if (shot) await page.screenshot({ path: path.join(outDir, f + '.png'), animations: 'disabled', caret: 'hide' });
  };
  const go = async (h, shot) => { await page.evaluate(h => { location.hash = h; }, h); await snap('r_' + h, shot); };
  const act = async (code, name, shot, arg) => { await page.evaluate(code, arg); await snap(name, shot); };

  try { // gezinti; bir adım patlarsa hata olarak kaydedilir
  // ---- ziyaretçi ----
  const ids = await page.evaluate(() => ({
    srv: (S.servers.find(s => s.sec === 'tr') || S.servers[0]).id,
    pvp: (S.servers.find(s => s.sec !== 'tr') || S.servers[0]).id,
    lst: (S.listings.find(l => l.status === 'aktif') || S.listings[0]).id,
    post: (S.posts.find(p => p.on) || S.posts[0] || {}).slug,
  }));
  await go('home', true);
  for (const h of ['metin2-tr', 'metin2-ep', 'metin2-pvp', 'server-' + ids.srv, 'server-' + ids.pvp + '-hepsi', 'kategori-cs2', 'ara', 'borsa', 'cekilis', 'reklam-ver', 'guvenli', 'rehber', 'rehber-' + ids.post, 'yang-fiyatlari', 'ortaklik', 'widget-yang', 'ilan-' + ids.lst, 'sayfa-iletisim', 'sayfa-kvkk', 'sayfa-mesafeli', 'yok-boyle-sayfa', 'hesabim'])
    await go(h, h === 'borsa' || h.startsWith('ilan-'));
  await go('home');
  await act(() => ACT.login(), 'modal_login', true);
  await act(() => closeModal(), 'modal_closed');
  await act(() => ACT.register(), 'modal_register');
  await act(() => closeModal(), 'modal_closed2');

  // ---- üyeler (hesap sekmeleri) ----
  for (const uid of ['u2', 'u1']) {
    await page.evaluate(() => { location.hash = 'home'; }); await settle();
    await act(u => ACT.as({ id: u, ok: 1 }), 'as_' + uid, false, uid);
    await go('hesabim', uid === 'u2');
    const tabs = ['ozet', 'alis', 'satis', 'borsa', 'ilan', 'ep', 'reklam', 'hareket', 'cek', 'profil', 'puan', 'davet']; // vAccount ui.tab değerleri
    for (const t of tabs) await act(t => { ui.tab = t; render(); }, `${uid}_tab_${t}`, false, t);
    const oid = await page.evaluate(u => ((S.orders.find(o => o.buyer === u || o.seller === u)) || {}).id, uid);
    for (const h of ['mesajlar', 'bildirimler', 'ilan-ver', ...(oid ? ['siparis-' + oid] : [])]) await go(h);
  }

  // ---- yönetim (her bölüm + alt sekme) ----
  await page.evaluate(() => { location.hash = 'home'; }); await settle();
  await act(() => ACT.as({ id: 'admin', ok: 1 }), 'as_admin');
  const adm = await page.evaluate(() => ADM_NAV.flatMap(g => g.items).map(it => ({ k: it.k, subs: admSubs(it).map(s => s.s) })));
  for (const it of adm) {
    await go('yonetim/' + it.k, it.k === 'panel');
    for (const s of it.subs) await go('yonetim/' + it.k + '/' + s);
  }
  // çalışan (yetki kısıtlı) bakışı
  const staff = await page.evaluate(() => (S.users.find(u => u.staff && !u.admin) || {}).id);
  if (staff) { await act(u => ACT.as({ id: u, ok: 1 }), 'as_staff_' + staff, false, staff); await go('yonetim'); await go('yonetim/siparis'); }

  } catch (e) { errs.push('snap: ' + String(e.message).split('\n')[0]); }
  fs.writeFileSync(path.join(outDir, 'errors.txt'), errs.join('\n'));
  await browser.close();
  console.log(`${htmlFile}: ${n} anlık görüntü, ${errs.length} hata → ${outDir}`);
  if (errs.length) console.log('  ' + errs.slice(0, 5).join('\n  '));
  return errs.length;
}

function diff(a, b) {
  const fa = fs.readdirSync(a).filter(f => !f.endsWith('.png')).sort(), fb = fs.readdirSync(b).filter(f => !f.endsWith('.png')).sort();
  const bad = [];
  if (fa.join() !== fb.join()) bad.push('dosya listesi farklı: ' + fa.filter(x => !fb.includes(x)).concat(fb.filter(x => !fa.includes(x))).join(', '));
  for (const f of fa) if (fb.includes(f) && !fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))) bad.push('farklı: ' + f);
  const pa = fs.readdirSync(a).filter(f => f.endsWith('.png'));
  const pngSame = pa.filter(f => fs.existsSync(path.join(b, f)) && fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f)))).length;
  console.log(`diff ${a} ↔ ${b}: ${fa.length} metin/HTML dosyası, ${bad.length} fark; ekran görüntüleri ${pngSame}/${pa.length} bayt-bayt aynı`);
  bad.slice(0, 20).forEach(x => console.log('  ' + x));
  return bad.length;
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = k => (rest.find(x => x.startsWith(k + '=')) || '').slice(k.length + 1) || null;
  const pos = rest.filter(x => !x.startsWith('--'));
  let code = 0;
  if (cmd === 'run') code = await run(pos[0], pos[1], { ls: flag('--ls'), dumpLs: flag('--dump-ls') }) ? 1 : 0;
  else if (cmd === 'diff') code = diff(pos[0], pos[1]) ? 1 : 0;
  else if (cmd === 'gate') {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    let oldF = pos[0];
    if (!oldF) { oldF = path.join(out, 'HEAD-index.html'); fs.writeFileSync(oldF, cp.execFileSync('git', ['-C', ROOT, 'show', 'HEAD:index.html'], { maxBuffer: 64 << 20 })); }
    const newF = pos[1] || path.join(ROOT, 'index.html');
    const e1 = await run(oldF, path.join(out, 'a')), e2 = await run(newF, path.join(out, 'b'));
    const d = diff(path.join(out, 'a'), path.join(out, 'b'));
    code = e1 || e2 || d ? 1 : 0; console.log(code ? 'KAPI: BAŞARISIZ' : 'KAPI: GEÇTİ');
  } else { console.error('Kullanım: snap.js run <html> <çıktı> | diff <A> <B> | gate [eski.html] [yeni.html]'); code = 2; }
  process.exit(code);
})();
