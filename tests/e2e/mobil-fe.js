// Mobil yeniden tasarım ön yüz testi (390 px): alt sekme çubuğu, Pazar / Destek pencereleri, Yang Borsası kart ızgarası, AL / SAT pencereleri,
// bekleyen işlem kartları, Hesabım › Özetim (Yapılacaklar, kartlar, profil kartı), hesap menüsü (kaybolan sekme yok).
// CANLI PAKET (--prod --zip) geçici klasöre açılır, php -S + tests/http/router.php, YP_TEST=1 + SQLite. Kurulum sihirbazı arayüzden.
// Denetimler: 5 öğe (girişli / girişsiz), etkin durum, rozetler, modal / Yönetim / klavye açıkken çubuk gizli, 1280 px'te çubuk DOM'da yok,
// 390 px yatay taşma yok, iki tema, konsol / sayfa hatası yok.
//
//   node tests/e2e/mobil-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const MOB = require('./_mobile');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-mobilfe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || path.join(RUN, 'shots');
const PORT = +(process.env.PORT || 19900 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const unzip = (z, to) => sh('php', ['-r', '$z=new ZipArchive; if($z->open($argv[1])!==true) exit(1); $z->extractTo($argv[2]); $z->close();', z, to]);
const DBF = () => path.join(SITE, 'storage/test.sqlite');
const sq = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $s=$p->query($argv[2]); $v=$s?$s->fetchColumn():false; echo $v===false?"":$v;', DBF(), sql]).trim();
const PW = 'Gizli-Hesap-Sifresi-42';
const TLs = n => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2 }).format(n);

/* ---------- 1. paket ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
ok('derleme: kurulum zip\'i ve kurulum kodu', !!CODE && !!ZIP, out);
unzip(path.join(BUILD, ZIP), SITE);
ok('pakette mobil dosyalar var', ['assets/js/44-mtab.js', 'assets/js/prod/97x-borsa-kart.js', 'assets/js/prod/98x-borsa-kart.js'].every(f => fs.existsSync(path.join(SITE, f))));
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));

/* ---------- 2. sunucu ---------- */
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    return page;
  };
  const shot = (p, n, full) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: !!full });
  const nav = async (p, r, w) => { await p.evaluate(x => go(x), r); await p.waitForTimeout(w || 600); };
  const adm = async (p, h, w) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(w || 700); };
  const rt = p => p.evaluate(() => route());
  const txt = (p, s) => p.locator(s || 'body').first().textContent();
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 10000 }); return true; } catch (e) { return false; } };
  const login = async (p, u, pw) => { await MOB.click(p, '#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const pcall = (p, m, path_, body) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code, http: e.http, fields: e.fields })), [m, path_, body]);
  const uid = n => sq(`SELECT id FROM yp_users WHERE name='${n}'`);
  /* alt çubuk */
  const bar = p => p.evaluate(() => { const n = document.querySelector('#mtab'); if (!n) return null; const cs = getComputedStyle(n);
    return { vis: cs.visibility === 'visible' && n.getBoundingClientRect().top < innerHeight, items: [...n.querySelectorAll('.mtab-i')].map(i => ({ k: i.dataset.mtab, l: (i.querySelector('.mtab-l') || {}).textContent, on: i.classList.contains('on'), cur: i.getAttribute('aria-current'), tag: i.tagName, b: (i.querySelector('.mtab-b') || {}).textContent || '', dot: !!i.querySelector('.mtab-dot'), sr: (i.querySelector('.vh') || {}).textContent || '' })) }; });
  const onK = async p => ((await bar(p)) || { items: [] }).items.filter(i => i.on).map(i => i.k).join(',');
  const barHidden = p => until(p, () => { const n = document.querySelector('#mtab'); return !n || getComputedStyle(n).visibility === 'hidden'; }, null, 2000);
  const over = []; const chk = async (p, n) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) over.push(n + ':' + w); };
  const theme = p => p.evaluate(() => [...document.querySelectorAll('[data-act=theme]')].find(b => b.offsetParent || b.closest('#mnav')).click());

  try {
    /* ---------- 3. kurulum ---------- */
    const K = await mk('kurulum', { width: 900, height: 900 });
    await K.goto(B + '/');
    await K.fill('#ic', CODE); await K.click('button:has-text("Devam")');
    await K.click('button:has-text("Devam")');
    const dbFill = async () => { await K.fill('input[name=driver]', 'sqlite'); await K.fill('input[name=sqlite_path]', DBF()); };
    await dbFill(); await K.click('button:has-text("Bağlantıyı test et")');
    await dbFill(); await K.click('button:has-text("Kaydet ve devam et")');
    await K.click('button:has-text("Tabloları oluştur")');
    await K.fill('#sn', 'Yang Mobil Test'); await K.fill('#su', B); await K.click('button:has-text("Kaydet ve devam et")');
    const APW = 'Yonetici-Sifre-2026';
    await K.fill('#an', 'Yonetici'); await K.fill('#ae', 'admin@yangpazar.com'); await K.fill('#ap', APW); await K.fill('#ap2', APW);
    await K.click('button:has-text("Yöneticiyi oluştur")');
    await K.click('button:has-text("Kurulumu bitir")');
    ok('kurulum tamamlandı (arayüzden)', /Kurulum tamamlandı/.test(await txt(K)));
    await K.context().close();
    /* destek ayarları (herkese açık S.set.whatsapp / S.set.supportHours) */
    sq(`UPDATE yp_settings SET v=json_set(v,'$.whatsapp','0555 123 45 67','$.supportHours','Her gün 09:00 – 24:00') WHERE k='site'`);
    ok('site ayarı: WhatsApp ve destek saatleri', sq(`SELECT json_extract(v,'$.supportHours') FROM yp_settings WHERE k='site'`) === 'Her gün 09:00 – 24:00');

    /* ---------- 4. yönetici: iki borsa pazarı (PVP 100M, TR 1 Won), operatör ---------- */
    const M = await mk('yonetici', { width: 1280, height: 900 }); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap');
    const SV = sq("SELECT 'sv'||id FROM yp_servers WHERE sec='pvp' ORDER BY id LIMIT 1"), SVN = sq(`SELECT name FROM yp_servers WHERE id=${SV.slice(2)}`);
    const ST = sq("SELECT 'sv'||id FROM yp_servers WHERE sec='tr' ORDER BY id LIMIT 1"), STN = sq(`SELECT name FROM yp_servers WHERE id=${ST.slice(2)}`);
    const a1 = await pcall(M, 'POST', 'admin/ex/markets', { server: SV }), a2 = await pcall(M, 'POST', 'admin/ex/markets', { server: ST });
    const XS = await M.evaluate(() => S.exchange.map(x => x.id)); const [X1, X2] = [sq(`SELECT 'x'||id FROM yp_ex_markets WHERE server_id=${SV.slice(2)}`), sq(`SELECT 'x'||id FROM yp_ex_markets WHERE server_id=${ST.slice(2)}`)];
    const up = await pcall(M, 'PUT', 'admin/ex/markets', { place: 'CH2 · Mavi bayrak · Gardiyan yanı', markets: [{ id: X1, on: true, server: SV, unit: '100M', buy: 12.5, max: 10 }, { id: X2, on: true, server: ST, unit: '1 Won', buy: 1299.9, max: 1180 }] });
    ok('iki pazar açık: PVP 12,50 / en fazla 10; TR 1.299,90 / en fazla 1.180', !a1.err && !a2.err && !up.err && sq(`SELECT COUNT(*) FROM yp_ex_markets WHERE is_on=1`) === '2', JSON.stringify([a1.err, a2.err, up.err, up.fields, XS]));
    const st = await pcall(M, 'POST', 'admin/staff', { name: 'Operator', email: 'op@yangpazar.com', ad: 'Oper', soyad: 'Atör', password: 'Calisan-Sifre-9', perms: ['borsa'] });
    ok('[borsa] operatör oluşturuldu', !st.err, JSON.stringify(st));

    /* ---------- 5. ziyaretçi 390 px: alt çubuk, Pazar / Destek pencereleri ---------- */
    const V = await mk('ziyaretci-390'); await V.goto(B + '/'); await V.waitForSelector('#mtab');
    let b = await bar(V);
    ok('girişsiz: 5 öğe Destek · Pazar · Ana sayfa · Borsa · Giriş', b && b.items.map(i => i.l).join('|') === 'Destek|Pazar|Ana sayfa|Borsa|Giriş' && b.vis, JSON.stringify(b));
    ok('Pazar ve Destek düğme (aria-haspopup), Ana sayfa bağlantısı etkin ve aria-current', b.items[0].tag === 'BUTTON' && b.items[1].tag === 'BUTTON' && b.items[2].on && b.items[2].cur === 'page' && b.items.filter(i => i.on).length === 1
      && await V.evaluate(() => [...document.querySelectorAll('#mtab [data-mtab=destek], #mtab [data-mtab=pazar]')].every(x => x.getAttribute('aria-haspopup') === 'dialog' && x.getAttribute('aria-expanded') === 'false')));
    ok('girişsiz: rozet yok; nav aria-label="Alt menü"; z-index 75', b.items.every(i => !i.b && !i.dot) && await V.evaluate(() => document.querySelector('#mtab').getAttribute('aria-label') === 'Alt menü' && getComputedStyle(document.querySelector('#mtab')).zIndex === '75'));
    ok('Canlı Destek balonu 390 px\'te yok', await V.evaluate(() => { const f = document.querySelector('.ls-fab'); return !f || !f.offsetParent; }));
    await chk(V, 'home'); await shot(V, '01-alt-cubuk-ziyaretci');
    await MOB.click(V, '#mtab [data-mtab=pazar]'); await V.waitForSelector('#modal .md.sheet[data-sheet=pazar]');
    ok('Pazar penceresi: TR, PVP, EP, Ara, + İlan ver; aria-modal; çubuk gizli', /Metin2 TR[\s\S]*Metin2 PVP[\s\S]*Metin2 EP[\s\S]*İlanlarda ara[\s\S]*\+ İlan ver/.test(await txt(V, '#modal')) && await V.evaluate(() => document.querySelector('#modal .md.sheet').getAttribute('aria-modal') === 'true') && await barHidden(V));
    ok('Pazar düğmesi aria-expanded=true (pencere açıkken)', await V.evaluate(() => document.querySelector('#mtab [data-mtab=pazar]').getAttribute('aria-expanded') === 'true'));
    await shot(V, '02-pazar-penceresi');
    { let inside = true; for (let i = 0; i < 9; i++) { await V.keyboard.press('Tab'); if (!await V.evaluate(() => document.querySelector('#modal').contains(document.activeElement))) inside = false; }
      for (let i = 0; i < 3; i++) { await V.keyboard.press('Shift+Tab'); if (!await V.evaluate(() => document.querySelector('#modal').contains(document.activeElement))) inside = false; }
      ok('odak tuzağı: Tab / Shift+Tab pencerede kalır', inside); }
    await V.keyboard.press('Escape'); await modalGone(V); await V.waitForTimeout(150);
    ok('Esc: pencere kapanır, odak Pazar düğmesine döner, çubuk görünür', await V.evaluate(() => document.activeElement && document.activeElement.dataset.mtab === 'pazar') && (await bar(V)).vis);
    await MOB.click(V, '#mtab [data-mtab=pazar]'); await V.waitForSelector('#modal [data-sheet=pazar]'); await V.click('#modal a.sh-i:has-text("Metin2 PVP")'); await modalGone(V); await V.waitForTimeout(500);
    ok('Pazar › Metin2 PVP: rota metin2-pvp, Pazar etkin (aria-current yok)', await rt(V) === 'metin2-pvp' && await onK(V) === 'pazar' && (await bar(V)).items[1].cur === null);
    await MOB.click(V, '#mtab [data-mtab=pazar]'); await V.waitForSelector('#modal [data-sheet=pazar]'); await V.click('#modal [data-mtab=ara]'); await modalGone(V); await V.waitForTimeout(200);
    ok('Pazar › İlanlarda ara: arama kutusu odakta, klavye açıkken çubuk gizli (html.kbd)', await V.evaluate(() => document.activeElement && document.activeElement.id === 'q' && document.documentElement.classList.contains('kbd')) && await barHidden(V));
    await V.evaluate(() => document.activeElement.blur()); await V.waitForTimeout(400);
    ok('odak çıkınca çubuk geri gelir', (await bar(V)).vis && !await V.evaluate(() => document.documentElement.classList.contains('kbd')));
    await MOB.click(V, '#mtab [data-mtab=destek]'); await V.waitForSelector('#modal [data-sheet=yardim]');
    { const h = await V.evaluate(() => { const a = document.querySelector('#modal a[href^="https://wa.me/"]'); return a ? [a.getAttribute('href'), a.getAttribute('rel'), a.getAttribute('target')] : null; }); const t = await txt(V, '#modal');
      ok('Destek (P6 öncesi): Yardım penceresi — WhatsApp wa.me/905551234567 (noopener), Güvenli Alışveriş & SSS, destek saatleri, şifre uyarısı', h && h[0] === 'https://wa.me/905551234567' && /noopener/.test(h[1]) && t.includes('Güvenli Alışveriş & SSS') && t.includes('Her gün 09:00 – 24:00') && /asla şifre veya doğrulama kodu istemez/.test(t), JSON.stringify(h) + ' ' + t);
      ok('Yardım penceresinde e-Gider / pusula ifadesi yok', !/e-Gider|pusula/i.test(t)); }
    await shot(V, '03-destek-yardim');
    await V.click('#modal a.sh-i:has-text("Güvenli Alışveriş")'); await modalGone(V); await V.waitForTimeout(500);
    ok('Yardım › Güvenli Alışveriş: rota guvenli, temiz adres (# yok)', await rt(V) === 'guvenli' && !V.url().includes('#'), V.url());
    await MOB.click(V, '#mtab [data-mtab=giris]'); await V.waitForSelector('#modal form[data-form=loginf]');
    ok('Giriş öğesi mevcut giriş penceresini açar; pencere açıkken çubuk gizli', await barHidden(V));
    await V.click('#modal [data-act=close]'); await modalGone(V);
    await MOB.click(V, '#mtab [data-mtab=borsa]'); await V.waitForTimeout(900);
    ok('Borsa: rota borsa, temiz adres (# yok), Borsa etkin + aria-current', await rt(V) === 'borsa' && !V.url().includes('#') && await onK(V) === 'borsa' && (await bar(V)).items[3].cur === 'page', V.url());

    /* ---------- 6. borsa ızgarası (ziyaretçi): fiyatlar her zaman görünür ---------- */
    await V.waitForSelector('#bxGrid .bx-card');
    const grid = await V.evaluate(() => ({ cols: getComputedStyle(document.querySelector('#bxGrid')).gridTemplateColumns.split(' ').length, n: document.querySelectorAll('#bxGrid .bx-card').length, form: !!document.querySelector('#app #ex_qty, #app [data-act=ex-dir]') }));
    ok('ızgara: 2 sütun, 2 kart; mobil sayfada form / yön düğmesi yok', grid.cols === 2 && grid.n === 2 && !grid.form, JSON.stringify(grid));
    const card = (p, x) => p.evaluate(x => { const c = document.querySelector(`#bxGrid .bx-card[data-id="${x}"]`); if (!c) return null; const r = s => (c.querySelector(s) || {}).textContent || '';
      return { sat: r('.bx-row.sat .bx-p'), satS: r('.bx-row.sat .bx-s'), al: r('.bx-row.al .bx-p'), alS: r('.bx-row.al .bx-s'), satL: c.querySelector('.bx-row.sat').getAttribute('aria-label'), alL: c.querySelector('.bx-row.al').getAttribute('aria-label'), alDis: c.querySelector('.bx-row.al').disabled }; }, x);
    let c1 = await card(V, X1), c2 = await card(V, X2);
    ok('PVP kart: SAT en fazla ₺10,00, AL ₺12,50; satıcı yokken fiyat görünür + "Şu an satıcı yok", AL açık', c1 && c1.sat === TLs(10) && c1.al === TLs(12.5) && /Şu an satıcı yok/.test(c1.alS) && !c1.alDis && /Henüz emir yok/.test(c1.satS), JSON.stringify(c1));
    ok('TR kart: SAT ₺1.180,00 / AL ₺1.299,90 (uzun fiyat küçük yazı)', c2 && c2.sat === TLs(1180) && c2.al === TLs(1299.9) && await V.evaluate(x => !!document.querySelector(`#bxGrid .bx-card[data-id="${x}"] .bx-p.long`), X2), JSON.stringify(c2));
    ok('erişilebilir etiket: "siteye sat: birim başına en fazla … bakiyene", "al: birim fiyat …"', /siteye sat: birim başına en fazla/.test(c1.satL) && /al: birim fiyat ₺12,50/.test(c1.alL), c1.satL + ' | ' + c1.alL);
    ok('"stokta" / "hemen" ifadesi yok', !/stokta|hemen/i.test(await txt(V, '#app .bxv')));
    await chk(V, 'borsa-ziyaretci'); await shot(V, '04-borsa-izgara-ziyaretci', true);
    await V.click('#app .bx-chip[data-s=tr]'); await V.waitForTimeout(300);
    ok('TR süzgeci: yalnız TR kartı', await V.evaluate(() => document.querySelectorAll('#bxGrid .bx-card').length) === 1 && !!await card(V, X2));
    await V.click('#app .bx-chip[data-s=hepsi]'); await V.waitForTimeout(300);
    await V.fill('#bx_q', SVN.slice(0, 3)); await V.waitForTimeout(150);
    ok('arama: yalnız eşleşen kart görünür, odak aramada', await V.evaluate(() => [...document.querySelectorAll('#bxGrid .bx-card')].filter(c => !c.hidden).length) === 1 && await V.evaluate(() => document.activeElement.id === 'bx_q'));
    await V.fill('#bx_q', ''); await V.evaluate(() => document.activeElement.blur());
    await V.selectOption('#bx_sort', 'sat'); await V.waitForTimeout(200);
    ok('sıralama "Satış fiyatı: yüksekten": TR (1.180) önce', await V.evaluate(() => document.querySelector('#bxGrid .bx-card').dataset.id) === X2);
    await V.selectOption('#bx_sort', 'al'); await V.waitForTimeout(200);
    ok('sıralama "Alış fiyatı: düşükten": PVP (12,50) önce', await V.evaluate(() => document.querySelector('#bxGrid .bx-card').dataset.id) === X1);

    /* ---------- 7. girişsiz AL → giriş → AL penceresi kendiliğinden açılır (alıcı B) ---------- */
    const rb = await pcall(V, 'POST', 'auth/register', { name: 'Alici_Bora', email: 'bora@ornek.com', tel: '0555 111 22 14', ad: 'Bora', soyad: 'Alıcı', password: 'Bora-Sifre-2026' });
    ok('B üye oldu', rb && rb.me && rb.me.id, JSON.stringify(rb));
    await pcall(V, 'POST', 'auth/logout', {}); await V.evaluate(() => apiReboot(true)); await nav(V, 'borsa', 900);
    const f1 = await pcall(M, 'POST', 'admin/balance', { user: 'Alici_Bora', amount: 200, w: true, note: 'Havale (test)' });
    const f2 = await pcall(M, 'POST', 'admin/balance', { user: 'Alici_Bora', amount: 50, w: false, note: 'Kart yüklemesi (test)' });
    ok('B: 200 çekilebilir + 50 alışveriş', !f1.err && !f2.err);
    await MOB.click(V, `#bxGrid .bx-card[data-id="${X1}"] [data-act=bx-al]`); await V.waitForSelector('#modal form[data-form=loginf]');
    await V.fill('#lg_u', 'Alici_Bora'); await V.fill('#lg_p', 'Bora-Sifre-2026'); await V.click('form[data-form=loginf] button.btn-primary');
    ok('girişten sonra aynı AL penceresi kendiliğinden açıldı', await until(V, () => !!document.querySelector('#modal .bx-sheet form[data-form=exorder]'), null, 8000));
    b = await bar(V);
    ok('girişli: 5. öğe Hesabım (bağlantı)', b.items[4].k === 'hesabim' && b.items[4].l === 'Hesabım' && b.items[4].tag === 'A', JSON.stringify(b.items[4]));
    const P = V; // B oturumu
    await P.fill('#ex_qty', '5'); await P.dispatchEvent('#ex_qty', 'input'); await P.fill('#exb_b1', 'BoraKarakter');
    ok('AL tek adım: 5 × 12,50 = 62,50; bakiye 250 → kalan 187,50; sıra notu (satıcı yok)', (await txt(P, '#ex_tot')).replace(/\s/g, '') === TLs(62.5).replace(/\s/g, '') && /kalan ₺187,50/.test(await txt(P, '#bx_bal')) && await P.isVisible('#ex_waitbox') && /Şu an satıcı yok/.test(await txt(P, '#ex_waitmsg')), await txt(P, '#modal'));
    await shot(P, '05-al-penceresi');
    await P.fill('#ex_qty', '100'); await P.dispatchEvent('#ex_qty', 'input'); await P.waitForTimeout(100);
    ok('yetersiz bakiye: düğme "Bakiye yükle · ₺1.000,00 eksik" (deposit), satın al gizli', await P.isVisible('#modal .bx-dep') && !await P.isVisible('#modal button.exgo') && /Bakiye yükle · ₺1\.000,00 eksik/.test(await txt(P, '#modal .bx-dep')) && await P.evaluate(() => document.querySelector('#modal .bx-dep').dataset.act === 'deposit'));
    await shot(P, '06-al-yetersiz-bakiye');
    await P.click('#modal [data-act=bx-qs][data-v="5"]'); await P.waitForTimeout(100);
    ok('hızlı adet 5: satın al düğmesi geri geldi', await P.isVisible('#modal button.exgo') && (await P.inputValue('#ex_qty')) === '5', (await P.inputValue('#ex_qty')) + ' ' + await txt(P, '#bx_bal') + ' ' + JSON.stringify(errs));
    await P.click('#modal button.exgo');
    ok('AL: sipariş sıraya alındı → pencere kapandı → Hesabım', await toast(P, 'sıraya alındı') && await modalGone(P) && await until(P, () => route() === 'hesabim'));
    ok('DB: sipariş 5 × 12,50 = 62,50; önce 50 kredi (Idempotency anahtarlı tek kayıt)', sq("SELECT qty||'/'||total||'/'||paid_credit FROM yp_ex_orders") === '5/6250/5000' && sq('SELECT COUNT(*) FROM yp_ex_orders') === '1');
    const O1 = 'B' + (1000 + +sq('SELECT id FROM yp_ex_orders'));

    /* ---------- 8. satıcı C: SAT iki adım ---------- */
    const C = await mk('satici-C-390'); await C.goto(B + '/'); await C.waitForSelector('#hdr');
    const rc = await pcall(C, 'POST', 'auth/register', { name: 'Satici_Cem', email: 'cem@ornek.com', tel: '0555 111 22 13', ad: 'Cem', soyad: 'Satıcı', password: 'Cem-Sifre-2026' });
    ok('C üye oldu', rc && rc.me && rc.me.id); await C.evaluate(() => apiReboot(true)); await nav(C, 'borsa', 900);
    await MOB.click(C, `#bxGrid .bx-card[data-id="${X1}"] [data-act=bx-sat]`); await C.waitForSelector('#modal .bx-sheet form[data-form=exoffer]');
    ok('SAT adım 1/2: adet + fiyat; hesap alanları gizli', await C.isVisible('#ex_price') && !await C.isVisible('#exf_f1') && (await txt(C, '#bx_stp')) === '1/2');
    await C.fill('#ex_qty', '20'); await C.fill('#ex_price', '11'); await C.dispatchEvent('#ex_price', 'input');
    await C.click('#modal [data-foot="1"] [data-act=bx-step]'); await C.waitForTimeout(200);
    ok('tavan üstü fiyat (11 > 10): adım 1\'de kalır', (await txt(C, '#bx_stp')) === '1/2' && !await C.isVisible('#exf_f1'));
    await C.fill('#ex_price', '9'); await C.dispatchEvent('#ex_price', 'input');
    ok('satılırsa bakiyene: 20 × 9 = 180', (await txt(C, '#ex_tot')).replace(/\s/g, '') === TLs(180).replace(/\s/g, '') && /20 × ₺9,00/.test(await txt(C, '#bx_sum')));
    await shot(C, '07-sat-adim1');
    await C.click('#modal [data-foot="1"] [data-act=bx-step]'); await C.waitForSelector('#exf_f1', { state: 'visible' });
    ok('SAT adım 2/2: hesap bilgileri + kurallar + onay', (await txt(C, '#bx_stp')) === '2/2' && await C.isVisible('#ex_ok') && /şifreli saklanır/.test(await txt(C, '#modal')));
    await C.fill('#exf_f1', 'cem_hesap'); await C.fill('#exf_f2', PW); await C.fill('#exf_f3', 'CemKarakter'); await C.selectOption('#exf_f6', 'Hemen'); await C.check('#ex_ok');
    await shot(C, '08-sat-adim2');
    await C.click('#modal button.exgo');
    ok('SAT: emir yayında → pencere kapandı; DB aktif emir 20 × 9', await toast(C, 'Emriniz yayında') && await modalGone(C) && sq("SELECT qty||'/'||price||'/'||status FROM yp_ex_offers") === '20/900/aktif');
    ok('şifre tarayıcı belleğinde yok', await C.evaluate(pw => !JSON.stringify(S).includes(pw), PW));
    await until(C, () => !!document.querySelector('#bxMine .bx-f'));
    ok('Bekleyen işlemlerim: satış emri kartı "Satışta · sırada", iptal düğmesi', /Satışta · sırada/.test(await txt(C, '#bxMine')) && await C.locator('#bxMine [data-act=of-cancel]').count() === 1);
    c1 = await card(C, X1);
    ok('kart: SAT altında "Sıra başı ₺9,00"; AL altında net stok "Satışta 15" (20 − B\'nin 5 eşlenmemiş adedi)', /Sıra başı ₺9,00/.test(c1.satS) && /Satışta 15/.test(c1.alS), JSON.stringify(c1));
    await chk(C, 'borsa-satici'); await shot(C, '09-borsa-bekleyen-emir', true);
    /* ikinci emir: iptal onayı */
    await MOB.click(C, `#bxGrid .bx-card[data-id="${X1}"] [data-act=bx-sat]`); await C.waitForSelector('#modal form[data-form=exoffer]');
    await C.fill('#ex_qty', '3'); await C.fill('#ex_price', '9.8'); await C.click('#modal [data-foot="1"] [data-act=bx-step]');
    await C.fill('#exf_f1', 'cem_hesap'); await C.fill('#exf_f2', PW); await C.fill('#exf_f3', 'CemKarakter'); await C.selectOption('#exf_f6', 'Hemen'); await C.check('#ex_ok'); await C.click('#modal button.exgo');
    ok('ikinci emir yayında', await toast(C, 'Emriniz yayında') && await modalGone(C) && await until(C, () => document.querySelectorAll('#bxMine .bx-f').length === 2), await C.evaluate(() => document.querySelector('#toasts').textContent + ' | ' + (document.querySelector('#modal').textContent || '').slice(0, 300) + ' | ' + S.exOffers.map(o => o.id + ':' + o.qty + o.status).join(',') + ' V:' + [...document.querySelectorAll('#modal form input, #modal form select')].map(x => x.id + '=' + (x.type === 'checkbox' ? x.checked : x.value) + (x.checkValidity() ? '' : '!')).join(',') + ' A:' + (document.activeElement || {}).className + ' B:' + ((document.querySelector('#modal button.exgo') || {}).outerHTML || '')));
    const OF2 = await C.evaluate(() => [...document.querySelectorAll('#bxMine .bx-f')].map(x => x.dataset.id).find(id => S.exOffers.find(o => o.id === id && o.qty === 3)));
    await MOB.click(C, `#bxMine .bx-f[data-id="${OF2}"] [data-act=of-cancel]`);
    ok('mobil iptal onay soruyor', await C.waitForSelector('#cfm:not([hidden])', { timeout: 5000 }).then(() => true, () => false));
    await C.click('#cfm_ok');
    ok('onaydan sonra emir iptal', await toast(C, /iptal/i) && await until(C, () => document.querySelectorAll('#bxMine .bx-f').length === 1) && sq(`SELECT status FROM yp_ex_offers WHERE qty=3`) === 'iptal');

    /* ---------- 9. operatör çağrısı: Borsa noktası, bekleyen sipariş kartı ---------- */
    await nav(P, 'borsa', 900);
    ok('B: Bekleyen işlemlerim — alım kartı "Sırada", 4 adım çizgisi, teslim 0/5', await until(P, () => !!document.querySelector('#bxMine .bx-o')) && /Sırada/.test(await txt(P, '#bxMine .bx-o')) && await P.locator('#bxMine .bx-o .bx-steps li').count() === 4 && /Teslim 0\/5/.test(await txt(P, '#bxMine .bx-o')));
    const O = await mk('operator', { width: 1280, height: 900 }); await O.goto(B + '/'); await O.waitForSelector('#hdr [data-act=login]'); await login(O, 'Operator', 'Calisan-Sifre-9'); await modalGone(O);
    const cl = await pcall(O, 'POST', `admin/ex/orders/${O1}/claim`, {}); const ca = await pcall(O, 'POST', `admin/ex/orders/${O1}/call`, { msg: 'Mavi bayrağa gelin.' });
    ok('operatör üstlendi ve çağırdı', !cl.err && !ca.err, JSON.stringify([cl.err, ca.err]));
    await P.evaluate(() => { needDrop('ex:pub', 'me:ex'); render(); });
    ok('B: Borsa öğesinde nabız noktası + ekran okuyucu metni', await until(P, () => { const i = document.querySelector('#mtab [data-mtab=borsa]'); return !!i && !!i.querySelector('.mtab-dot') && /Operatör seni bekliyor/.test(i.textContent); }));
    ok('alım kartı: "Operatör seni bekliyor", çağrı mesajı ve "Geldim, hazırım"', /Operatör seni bekliyor/.test(await txt(P, '#bxMine .bx-o')) && /Mavi bayrağa gelin/.test(await txt(P, '#bxMine .bx-o')) && await P.locator('#bxMine .bx-o [data-act=ex-ready]').count() === 1);
    await shot(P, '10-borsa-operator-cagrisi', true);
    await MOB.click(P, '#bxMine .bx-o [data-act=ex-ready]');
    ok('Geldim, hazırım → "Hazır olduğun bildirildi", nokta kalktı', await toast(P, /hazır/i) && await until(P, () => /Hazır olduğun bildirildi/.test(document.querySelector('#bxMine .bx-o').textContent) && !document.querySelector('#mtab .mtab-dot')));

    /* ---------- 9b. Hesabım › Özetim (390 px): Yapılacaklar, kartlar, profil kartı, menü ---------- */
    const LS = async (t, pr) => { const r = await pcall(C, 'POST', 'listings', { game: 'metin2', server: SV, cat: 'item', title: t, price: pr, stock: 1, del: '15 dk' }); return r && r.listing ? r.listing.id : JSON.stringify(r); };
    const La = await LS('Mobil kalkan bir', 20), Lb = await LS('Mobil kalkan iki', 15);
    const Oa = await pcall(P, 'POST', 'orders', { listing: La, qty: 1, info: 'BoraKarakter' }), Ob = await pcall(P, 'POST', 'orders', { listing: Lb, qty: 1, info: 'BoraKarakter' });
    ok('B iki ilan satın aldı (C satıcı)', Oa && Oa.order && Ob && Ob.order, JSON.stringify([La, Lb, Oa, Ob]));
    sq(`UPDATE yp_orders SET status='teslim', delivered_at=${Date.now()} WHERE listing_id=${String(La).replace(/\D/g, '')}`);
    await P.evaluate(() => apiReboot(true)); await nav(P, 'home', 700);
    const sumB = await pcall(P, 'GET', 'me/summary');
    b = await bar(P);
    ok('Hesabım rozeti = summary.todo.total (açılıştan), ekran okuyucu metni', +sumB.todo.total >= 1 && b.items[4].b === String(sumB.todo.total) && b.items[4].sr === `${sumB.todo.total} bekleyen iş`, JSON.stringify([sumB.todo, b.items[4]]));
    await MOB.click(P, '#mtab [data-mtab=hesabim]'); await P.waitForTimeout(400); await P.evaluate(() => { ui.tab = 'ozet'; render(); }); await until(P, () => !!document.querySelector('#app .hs-kpis b') && !/…/.test(document.querySelector('#app .hs-kpis').textContent));
    ok('Hesabım etkin + aria-current; sekme şeridi ve .page-h yok; "☰ Menü" görünür', await onK(P) === 'hesabim' && (await bar(P)).items[4].cur === 'page' && await P.evaluate(() => !document.querySelector('#app nav.tabs') && !document.querySelector('#app .page-h')) && await P.isVisible('#app [data-act=hs-menu]'));
    const oz = await txt(P, '#app .hs-oz');
    ok('Yapılacaklar en üstte: "1 siparişte onayın bekleniyor" (Siparişlerim\'e gider)', await P.evaluate(() => document.querySelector('#app .hs-oz').firstElementChild.classList.contains('hs-todo')) && /1 siparişte onayın bekleniyor/.test(oz) && await P.locator('#app .hs-todo [data-act=tab][data-t=alis]').count() >= 1, oz.slice(0, 300));
    ok('Bakiyem: kullanılabilir, çekilebilir, yükle / çek düğmeleri', /Kullanılabilir bakiye/.test(oz) && /Çekilebilir/.test(oz) && await P.locator('#app .hs-wallet [data-act=deposit]').count() === 1 && await P.locator('#app .hs-wallet [data-act=p2-wd]').count() === 1);
    const kpi = await P.evaluate(() => Object.fromEntries([...document.querySelectorAll('#app .hs-kpi')].map(k => [k.querySelector('span').textContent, k.querySelector('b').textContent])));
    ok('KPI: havuzdaki alışlarım / borsa havuzu / bu ay harcama = me/summary', kpi['Havuzdaki alışlarım'] === TLs(sumB.buy.escrow) && kpi['Borsa havuzu'] === TLs(sumB.ex.escrowLeft) && kpi['Bu ay harcama'] === TLs(sumB.buy.monthSpend) && sumB.buy.escrow === 35 && sumB.ex.escrowLeft === 62.5, JSON.stringify([kpi, sumB.buy, sumB.ex]));
    const prof = await P.evaluate(() => { const c = document.querySelector('#app .hs-prof'); return c ? { n: c.dataset.prof, m: [...c.querySelectorAll('.hs-pi')].map(x => x.dataset.k + ':' + ((x.querySelector('[data-t]') || {}).dataset || {}).t) } : null; });
    ok('profil kartı: 5 madde, eksikler ilgili sekmeye (T.C. → cek, IBAN → banka, 2FA → profil)', prof && /\/5$/.test(prof.n) && prof.m.includes('tc:cek') && prof.m.includes('iban:banka') && prof.m.includes('tfa:profil'), JSON.stringify(prof));
    ok('Özetim\'de e-Gider / pusula yok', !/e-?Gider|pusula|ETTN|VUK/i.test(oz));
    const keys = await P.evaluate(() => hsTabs(me()).map(([k]) => k));
    const inl = await P.evaluate(() => [...document.querySelectorAll('#app [data-hsinline] [data-act=tab]')].map(x => x.dataset.t));
    const grpI = await P.evaluate(() => [...document.querySelectorAll('#app [data-hsinline] .mn-sec')].map(x => x.textContent).join('|'));
    ok('satır içi menü: gruplar Genel · Alışlarım · Satışlarım · Cüzdan · Kazan · Hesap; kaybolan sekme yok', grpI === 'Genel|Alışlarım|Satışlarım|Cüzdan|Kazan|Hesap' && keys.every(k => inl.includes(k)) && keys.length >= 12, JSON.stringify({ grpI, keys, inl }));
    await chk(P, 'hesabim-ozetim'); await shot(P, '14-ozetim', true);
    await MOB.click(P, '#app [data-act=hs-menu]'); await P.waitForSelector('#modal [data-hsmenu]');
    const mk_ = await P.evaluate(() => ({ t: [...document.querySelectorAll('#modal [data-hsmenu] [data-act=tab]')].map(x => x.dataset.t + (x.dataset.s ? ':' + x.dataset.s : '')), g: [...document.querySelectorAll('#modal [data-hsmenu] .mn-sec')].map(x => x.textContent), out: !!document.querySelector('#modal [data-hsmenu] .sheet-f [data-act=logout]'), side: !!document.querySelector('#modal .mb.mb-side .md.side[aria-modal=true]') }));
    ok('☰ Menü: sağdan pencere (aria-modal), tüm sekmeler, Borsa alımlarım + satış emirlerim, altta Çıkış', mk_.side && mk_.out && keys.every(k => mk_.t.some(x => x.split(':')[0] === k)) && mk_.t.includes('borsa:al') && mk_.t.includes('borsa:sat') && mk_.g.includes('Cüzdan'), JSON.stringify(mk_));
    ok('menü açıkken çubuk gizli', await barHidden(P)); await chk(P, 'hesap-menusu'); await shot(P, '15-hesap-menusu');
    await P.click('#modal [data-hsmenu] [data-act=tab][data-t=alis]');
    ok('menü › Siparişlerim: menü kapandı, başlık çubuğu "‹ Özetim · Siparişlerim"', await modalGone(P) && await until(P, () => ui.tab === 'alis' && /Siparişlerim/.test(document.querySelector('#app .hs-bar h1').textContent)) && await P.isVisible('#app .hs-bar [data-act=tab][data-t=ozet]'));
    await P.evaluate(() => window.scrollTo(0, 400));
    await MOB.click(P, '#mtab [data-mtab=hesabim]'); await P.waitForTimeout(300);
    ok('Hesabım\'a ikinci dokunuş: Özetim ve sayfa başı', await P.evaluate(() => ui.tab === 'ozet' && window.scrollY === 0 && !!document.querySelector('#app .hs-top')));
    await MOB.hsTab(P, 'borsa', 700, 'sat');
    ok('menü › Borsa satış emirlerim: bölme "Satış emirlerim" seçili', await P.evaluate(() => { const b = document.querySelector('#app .hs-seg [data-s=sat]'); return !!b && b.getAttribute('aria-selected') === 'true'; }));
    await P.click('#app .hs-seg [data-s=al]'); await P.waitForTimeout(300);
    ok('Alımlarım: kart #' + O1 + ' "Hazır olduğun bildirildi"', /Hazır olduğun bildirildi/.test(await txt(P, `#app .bx-o[data-id="${O1}"]`)));
    await chk(P, 'hesabim-borsa'); await shot(P, '16-hesabim-borsa', true);
    await nav(P, 'hesabim', 300); await P.evaluate(() => { ui.tab = 'ozet'; render(); }); await P.waitForTimeout(300);
    await MOB.click(P, '#app .hs-prof .hs-pi[data-k=iban] [data-act=tab]');
    ok('profil kartı › IBAN Ekle → Banka hesaplarım', await until(P, () => ui.tab === 'banka'));
    { const leak = []; for (const k of keys) { await MOB.hsTab(P, k, 500); const t = await txt(P, '#app'); if (/e-?Gider|pusula|ETTN|VUK/i.test(t)) leak.push(k); await chk(P, 'hesabim/' + k); }
      ok('tüm Hesabım sekmeleri menüden açılır, e-Gider / pusula metni yok', leak.length === 0, leak.join(',')); }
    /* satıcı C: Satış özeti, teslimat bekleyen satış */
    await C.evaluate(() => apiReboot(true)); await nav(C, 'hesabim', 400); await C.evaluate(() => { ui.tab = 'ozet'; render(); });
    await until(C, () => !!document.querySelector('#app .hs-sec') && !/…/.test(document.querySelector('#app .hs-kpis').textContent));
    const sumC = await pcall(C, 'GET', 'me/summary'); const ozC = await txt(C, '#app .hs-oz');
    const kC = await C.evaluate(() => Object.fromEntries([...document.querySelectorAll('#app .hs-kpi')].map(k => [k.querySelector('span').textContent, k.querySelector('b').textContent])));
    ok('C Özetim: "1 satışta teslimat seni bekliyor", Satış özeti, havuzdaki satışlarım = total − komisyon', /1 satışta teslimat seni bekliyor/.test(ozC) && /Satış özeti/.test(ozC) && sumC.sell.escrowNet > 0 && sumC.sell.escrowNet < 35 && kC['Havuzdaki satışlarım'] === TLs(sumC.sell.escrowNet), JSON.stringify([sumC.sell, kC]));
    ok('C rozeti = todo (teslimat)', (await bar(C)).items[4].b === String(sumC.todo.total));
    await shot(C, '17-ozetim-satici', true);

    /* ---------- 10. Yönetim ve 1280 px ---------- */
    const A = await mk('yonetici-390'); await A.goto(B + '/'); await A.waitForSelector('#hdr [data-act=login]'); await login(A, 'Yonetici', APW); await A.waitForSelector('.admwrap');
    ok('Yönetim (390 px): alt çubuk DOM\'da yok', await A.evaluate(() => !document.querySelector('#mtab')));
    await nav(A, 'home', 700);
    ok('yönetici sitede: çubuk var', !!(await bar(A)));
    await adm(A, 'yonetim/borsa/siparisler', 900);
    ok('Yönetim\'e dönünce çubuk kalkar', await A.evaluate(() => !document.querySelector('#mtab')));
    await nav(A, 'hesabim', 500);
    { const t = await txt(A, '#app'); const g = await A.evaluate(() => [...document.querySelectorAll('#app [data-hsinline] .mn-sec')].map(x => x.textContent).join('|'));
      ok('yönetici Hesabım (390 px): yalnız Yönetim + Hesap, cüzdan / KPI yok, Çıkış var', g === 'Yönetim|Hesap' && !/Bakiyem|Havuzdaki/.test(t) && await A.locator('#app [data-act=logout]').count() >= 1, g + ' ' + t.slice(0, 200)); }
    await shot(A, '18-yonetici-hesabim');
    await M.evaluate(() => go('borsa')); await M.waitForTimeout(900);
    ok('1280 px: çubuk DOM\'da yok, masaüstü borsa düzeni (yön düğmeleri, form) aynen', await M.evaluate(() => !document.querySelector('#mtab') && !!document.querySelector('#app [data-act=ex-dir]') && !!document.querySelector('#app form[data-form=exorder]') && !document.querySelector('#bxGrid')));
    await M.setViewportSize({ width: 390, height: 844 }); await M.waitForTimeout(500);
    ok('760 sınırının altına inince çubuk ve ızgara gelir', await M.evaluate(() => !!document.querySelector('#mtab') && !!document.querySelector('#bxGrid')));
    await M.setViewportSize({ width: 1280, height: 900 }); await M.waitForTimeout(500);
    ok('yeniden genişleyince çubuk kalkar, masaüstü düzen döner', await M.evaluate(() => !document.querySelector('#mtab') && !!document.querySelector('#app [data-act=ex-dir]')));

    await P.setViewportSize({ width: 1280, height: 900 }); await P.waitForTimeout(500); await nav(P, 'hesabim', 500); await P.evaluate(() => { ui.tab = 'ozet'; render(); }); await P.waitForTimeout(500);
    ok('1280 px Hesabım: sekme şeridi grup başlıklarıyla, "Özetim", Özetim kartları; çubuk yok', await P.evaluate(() => !!document.querySelector('#app nav.tabs .hs-navg') && /Özetim/.test(document.querySelector('#app nav.tabs').textContent) && !!document.querySelector('#app .hs-kpis') && !document.querySelector('#mtab') && !!document.querySelector('#app .page-h [data-act=logout]')));
    await shot(P, '19-hesabim-1280', true);
    await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(500);
    /* ---------- 11. iki tema, 390 px taşma ---------- */
    for (const sfx of ['', '-gunduz']) {
      if (sfx) { await theme(P); await P.waitForTimeout(200); }
      for (const r of ['home', 'metin2-tr', 'metin2-pvp', 'borsa', 'guvenli', 'hesabim']) { await nav(P, r, 700); await chk(P, r + sfx); }
      await P.evaluate(() => { ui.tab = 'ozet'; render(); }); await P.waitForTimeout(400); await chk(P, 'ozetim' + sfx); await shot(P, '20-ozetim' + sfx, true);
      await nav(P, 'borsa', 800); await shot(P, '11-borsa' + sfx, true);
      await MOB.click(P, `#bxGrid .bx-card[data-id="${X2}"] [data-act=bx-al]`); await P.waitForSelector('#modal .bx-sheet'); await chk(P, 'al-penceresi' + sfx); await shot(P, '12-al-penceresi' + sfx); await P.click('#modal [data-act=close]'); await modalGone(P);
      await MOB.click(P, '#mtab [data-mtab=pazar]'); await P.waitForSelector('#modal [data-sheet=pazar]'); await chk(P, 'pazar' + sfx); await shot(P, '13-pazar' + sfx); await P.keyboard.press('Escape'); await modalGone(P);
    }
    ok('tema değişti', ['light', 'dark'].includes(await P.evaluate(() => document.documentElement.dataset.theme)));
    await theme(P);
    ok('390 px: yatay taşma yok (iki tema)', over.length === 0, over.join(', '));

    ok('konsol / sayfa hatası yok', errs.length === 0, errs.slice(0, 8).join('\n      '));
  } catch (e) {
    ok('beklenmeyen hata: ' + (e && e.message || e), false, e && e.stack);
  } finally {
    await browser.close();
    srv.kill();
    const log = fs.existsSync(path.join(RUN, 'server.log')) ? fs.readFileSync(path.join(RUN, 'server.log'), 'utf8') : '';
    const phpErr = log.split('\n').filter(l => /PHP (Fatal|Warning|Parse|Notice|Deprecated)/.test(l));
    ok('sunucu günlüğünde PHP hatası yok', phpErr.length === 0, phpErr.slice(0, 5).join('\n'));
    console.log(`\nSONUÇ: ${PASS} geçti, ${FAIL} kaldı${FAIL ? ' → ' + fails.join(' | ') : ''}\nekran görüntüleri: ${SHOTS}`);
    if (process.env.KEEP === '1') console.log('çalışma klasörü: ' + RUN); else fs.rmSync(RUN, { recursive: true, force: true });
    process.exit(FAIL ? 1 : 0);
  }
})();
