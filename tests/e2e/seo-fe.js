// SEO ön yüz uçtan uca testi: canlı paket (--prod) geçici klasöre, php -S + tests/http/router.php (kök .htaccess karşılığı), YP_TEST=1 + SQLite.
//   - rewrite doğrulanmadan bağlantılar ?p= yedeğiyle; temiz adres açılınca rewrite doğrulanır ve bağlantılar temiz adres olur
//   - Ana Sayfa → Metin2 PVP → server → Karakter → ilan tıklanarak gezilir: adres çubuğunda hiyerarşik temiz adresler,
//     konum çubuğu bağlantıları temiz, başlık/canonical her sayfada
//   - Geri / İleri, her adresin yeniden yüklenmesi, #server-…-yang ve #ilan-… ile açılış → temiz adres, eski /server/… → 301
//   - #yonetim hash rotasında kalır; konsol/sayfa hatası yok. Ekran görüntüleri: SHOTS (varsayılan aşağıdaki klasör)
//
//   node tests/e2e/seo-fe.js          (SHOTS=<klasör>; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-seofe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-YAZILIM/c5402d75-b547-55b7-842f-b0b270529f25/scratchpad/seo-fe';
const PORT = +(process.env.PORT || 18000 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));

sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--out=' + SITE]);
const srvP = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const sq = q => sh('php', ['-r', '$p=new PDO("sqlite:' + SITE + '/storage/test.sqlite"); $v=$p->query($argv[1])->fetchColumn(); echo $v===false?"":$v;', q]);
// kurulum sihirbazı (curl ile; arayüz p1-fe.js'de sınanır)
const kur = () => sh('bash', ['-c', `J="${RUN}/k.jar"; k(){ c=$(curl -s -b $J -c $J "${B}/kurulum/" | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//'); a=(-s -L -b $J -c $J -o /dev/null --data-urlencode "csrf=$c"); for kv in "$@"; do a+=(--data-urlencode "$kv"); done; curl "\${a[@]}" "${B}/kurulum/"; }
k action=env; k action=dbsave driver=sqlite "sqlite_path=${SITE}/storage/test.sqlite"; k action=schema; k action=site site_name="Yang SEO" site_url="${B}"
k action=admin name=Yonetici email=admin@yangpazar.com password=Yonetici-Sifre-2026 password2=Yonetici-Sifre-2026; k action=finish`]);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: false });
  const txt = (p, s) => p.locator(s || 'body').first().innerText();
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const atUrl = (p, u) => until(p, x => location.href === x, u);
  const crumbs = p => p.evaluate(() => { const c = document.querySelector('#app .crumbs'); return c ? { t: c.innerText.replace(/\s+/g, ' ').trim(), h: [...c.querySelectorAll('a')].map(a => a.getAttribute('href')) } : null; });
  const canon = p => p.evaluate(() => { const l = document.querySelector('link[rel=canonical]'); return l ? l.href : ''; });
  const pcall = (p, m, a, b) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code })), [m, a, b]);

  try {
    kur();
    ok('kurulum tamamlandı', fs.existsSync(path.join(SITE, 'storage/kurulum_tamam.php')));
    const PV = sq("SELECT id FROM yp_servers WHERE sec='pvp' AND active=1 AND deleted_at IS NULL ORDER BY name LIMIT 1 OFFSET 3");
    const PVS = sq(`SELECT slug FROM yp_servers WHERE id=${PV}`), PVN = sq(`SELECT name FROM yp_servers WHERE id=${PV}`);
    const SV = 'sv' + PV;

    /* ---------- 1. ilanlar (satıcı) ---------- */
    const S0 = await mk('satici'); await S0.goto(B + '/'); await S0.waitForSelector('#hdr');
    const reg = await pcall(S0, 'POST', 'auth/register', { name: 'Satici_Seo', email: 'seo@ornek.com', tel: '0555 111 22 09', ad: 'Seo', soyad: 'Satıcı', password: 'Uye-Sifre-123' });
    ok('satıcı üye oldu', reg && reg.me && reg.me.id, JSON.stringify(reg));
    await S0.evaluate(() => apiReboot(true));
    const L = await pcall(S0, 'POST', 'listings', { game: 'metin2', server: SV, cat: 'karakter', title: 'Ejder Kılıcı +9 Efsunlu Şaman', price: '150', stock: 1, del: '5 dk', desc: 'Çok güçlü karakter, tüm efsunlar tamam.' });
    const LK = L && L.listing && L.listing.id;
    const LY = (await pcall(S0, 'POST', 'listings', { game: 'metin2', server: SV, cat: 'yang', title: '100M Yang hızlı teslim', price: '12', stock: 40, del: '5 dk' })).listing.id;
    ok('iki ilan verildi (karakter, yang)', /^l\d+$/.test(LK || '') && /^l\d+$/.test(LY || ''), JSON.stringify(L));
    const KP = `/metin2-pvp/${PVS}/karakter/ejder-kilici-9-efsunlu-saman-${LK}`;
    await S0.context().close();

    /* ---------- 2. rewrite doğrulanmadan: ?p= yedek bağlantıları ---------- */
    const P = await mk('ziyaretci');
    await P.goto(B + '/'); await P.waitForSelector('#app .lrows, #app .sgrid, #app h1');
    ok('doğrulama öncesi kip p (yedek)', await P.evaluate(() => S.set.seo.mode) === 'p');
    const hrefP = await P.evaluate(() => { const a = document.querySelector('a[data-h="metin2-pvp"]'); return a && a.getAttribute('href'); });
    ok('doğrulama öncesi bağlantılar ?p= ile (/?p=metin2-pvp)', hrefP === '/?p=metin2-pvp', hrefP);
    await shot(P, '01-ana-sayfa-p-kipi');

    /* ---------- 3. temiz adresle açılış → rewrite doğrulanır ---------- */
    let resp = await P.goto(B + '/metin2-pvp'); await P.waitForSelector('#app .sgrid');
    ok('/metin2-pvp: 200, X-YP-Page başlığı, temiz kip', resp.status() === 200 && resp.headers()['x-yp-page'] === 'metin2-pvp' && await P.evaluate(() => S.set.seo.mode) === 'clean', resp.status() + ' ' + resp.headers()['x-yp-page']);

    /* ---------- 4. tıklayarak gezinme: Ana Sayfa → Metin2 PVP → server → Karakter → ilan ---------- */
    await P.goto(B + '/'); await P.waitForSelector('#app h1');
    const T = {};
    T.home = await P.title();
    ok('ana sayfa: adres /, canonical /', P.url() === B + '/' && await canon(P) === B + '/');
    await P.locator('#cats a[data-h="metin2-pvp"], #hdr a[data-h="metin2-pvp"], #app a[data-h="metin2-pvp"]').first().click();
    ok('→ Metin2 PVP: adres /metin2-pvp', await atUrl(P, B + '/metin2-pvp') && await until(P, () => !!document.querySelector('#app .sgrid') && /Metin2 PVP/.test(document.querySelector('#app .page-h h1').textContent)), P.url());
    T.pvp = await P.title(); await shot(P, '02-metin2-pvp');
    const card = P.locator(`#app a.scard[data-h="${SV}"], #app a[data-h="server-${SV}"]`).first();
    ok('server kartı temiz adresle', await card.getAttribute('href') === `/metin2-pvp/${PVS}`, await card.getAttribute('href'));
    await card.click();
    ok(`→ ${PVN}: adres /metin2-pvp/${PVS}`, await atUrl(P, `${B}/metin2-pvp/${PVS}`) && await P.waitForSelector('.shero').then(() => true), P.url());
    let c = await crumbs(P);
    ok('server: konum çubuğu Ana Sayfa › Metin2 PVP › server, bağlantılar temiz', c && c.t === `Ana Sayfa › Metin2 PVP › ${PVN}` && c.h.join(' ') === '/ /metin2-pvp', JSON.stringify(c));
    ok('server: canonical temiz adres', await canon(P) === `${B}/metin2-pvp/${PVS}`);
    T.srv = await P.title(); await shot(P, '03-server');
    await P.locator(`#app a[data-h="server-${SV}-karakter"]`).first().click();
    ok('→ Karakter: adres /metin2-pvp/<server>/karakter', await atUrl(P, `${B}/metin2-pvp/${PVS}/karakter`), P.url());
    await P.waitForSelector(`#app a[data-h="ilan-${LK}"]`);
    c = await crumbs(P);
    ok('kategori: konum çubuğu Ana Sayfa › Metin2 PVP › server › Karakter', c && c.t === `Ana Sayfa › Metin2 PVP › ${PVN} › Karakter` && c.h.join(' ') === `/ /metin2-pvp /metin2-pvp/${PVS}`, JSON.stringify(c));
    ok('kategori: başlık ve canonical', (T.cat = await P.title()) === `${PVN} Karakter İlanları | Yang SEO` && await canon(P) === `${B}/metin2-pvp/${PVS}/karakter`, T.cat);
    await shot(P, '04-server-karakter');
    const la = P.locator(`#app a[data-h="ilan-${LK}"]`).first();
    ok('ilan kartı hiyerarşik adresle', await la.getAttribute('href') === KP, await la.getAttribute('href'));
    await la.click();
    ok('→ ilan: adres /metin2-pvp/<server>/karakter/<başlık>-<id>', await atUrl(P, B + KP) && await P.waitForSelector('.lhero').then(() => true), P.url());
    c = await crumbs(P);
    ok('ilan: konum çubuğu bağlantıları temiz (kategori dahil)', c && c.h.join(' ') === `/ /metin2-pvp /metin2-pvp/${PVS} /metin2-pvp/${PVS}/karakter` && c.t.startsWith(`Ana Sayfa › Metin2 PVP › ${PVN} › Karakter › İlan #`), JSON.stringify(c));
    const ld = await P.evaluate(() => JSON.parse((document.getElementById('ldjson') || {}).textContent || '{}'));
    const bl = (ld['@graph'] || []).find(x => x['@type'] === 'BreadcrumbList'), pr = (ld['@graph'] || []).find(x => x['@type'] === 'Product');
    ok('ilan: JSON-LD BreadcrumbList (Ana Sayfa › Metin2 PVP › server › Karakter › ilan) + Product/Offer TRY', bl && bl.itemListElement.map(x => x.name).join(' › ') === `Ana Sayfa › Metin2 PVP › ${PVN} › Karakter › Ejder Kılıcı +9 Efsunlu Şaman`
      && bl.itemListElement[3].item === `${B}/metin2-pvp/${PVS}/karakter` && pr && pr.offers.priceCurrency === 'TRY' && pr.offers.availability === 'https://schema.org/InStock', JSON.stringify(bl));
    ok('ilan: canonical', await canon(P) === B + KP);
    T.lst = await P.title(); await shot(P, '05-ilan');

    /* ---------- 5. Geri / İleri ---------- */
    const back = [[`${B}/metin2-pvp/${PVS}/karakter`, T.cat], [`${B}/metin2-pvp/${PVS}`, T.srv], [`${B}/metin2-pvp`, T.pvp], [`${B}/`, T.home]];
    for (const [u, t] of back) { await P.goBack(); const okU = await atUrl(P, u); await P.waitForTimeout(250); ok('Geri → ' + u.slice(B.length), okU && await P.title() === t, P.url() + ' ' + await P.title()); }
    await P.goForward(); ok('İleri → /metin2-pvp', await atUrl(P, B + '/metin2-pvp') && await until(P, () => !!document.querySelector('#app .sgrid')));
    await P.goForward(); await P.goForward(); await P.goForward();
    ok('İleri ×3 → ilan', await atUrl(P, B + KP) && await until(P, () => !!document.querySelector('.lhero')), P.url());

    /* ---------- 6. her adresin yeniden yüklenmesi ---------- */
    for (const [u, t, sel] of [[B + '/', T.home, '#app h1'], [B + '/metin2-pvp', T.pvp, '#app .sgrid'], [`${B}/metin2-pvp/${PVS}`, T.srv, '.shero'], [`${B}/metin2-pvp/${PVS}/karakter`, T.cat, `#app a[data-h="ilan-${LK}"]`], [B + KP, T.lst, '.lhero']]) {
      await P.goto(u); resp = null; await P.reload(); const okS = await P.waitForSelector(sel, { timeout: 8000 }).then(() => true, () => false);
      ok('yeniden yükleme: ' + u.slice(B.length), okS && P.url() === u && await P.title() === t, P.url() + ' ' + await P.title());
    }
    const raw = await (await fetch(B + KP)).text();
    ok('ham HTML (JS yok): aynı başlık, canonical, H1 ve konum çubuğu bağlantıları', raw.includes(`<title>${T.lst}</title>`) && raw.includes(`<link rel="canonical" href="${B}${KP}">`)
      && raw.includes('<h1>Ejder Kılıcı +9 Efsunlu Şaman</h1>') && raw.includes(`<a href="/metin2-pvp/${PVS}/karakter">Karakter</a>`));
    ok('uygulama açılınca önceden oluşturulmuş içerik kalmaz (çift içerik yok)', await P.evaluate(() => !document.querySelector('[data-ssr]') && document.querySelectorAll('#app h1').length <= 1));

    /* ---------- 7. eski adresler ---------- */
    await P.goto(`${B}/#server-${SV}-yang`); await P.waitForSelector('.shero');
    ok('#server-…-yang ile açılış → /metin2-pvp/<server>/yang', await atUrl(P, `${B}/metin2-pvp/${PVS}/yang`) && (await txt(P, '#app')).includes('100M Yang'), P.url());
    await shot(P, '06-hash-adresinden-temiz');
    await P.goto(`${B}/#ilan-${LK}`); await P.waitForSelector('.lhero');
    ok('#ilan-… ile açılış → hiyerarşik ilan adresi', await atUrl(P, B + KP), P.url());
    await P.goto(`${B}/server/${PVS}/karakter`); await P.waitForSelector(`#app a[data-h="ilan-${LK}"]`);
    ok('eski /server/<slug>/karakter → 301 → /metin2-pvp/<slug>/karakter', P.url() === `${B}/metin2-pvp/${PVS}/karakter`, P.url());
    await P.goto(`${B}/?p=metin2-pvp/${PVS}&utm_source=test`); await P.waitForSelector('.shero');
    ok('?p= adresi (temiz kipte) → 301 temiz adres, utm korunur', P.url() === `${B}/metin2-pvp/${PVS}?utm_source=test`, P.url());

    /* ---------- 8. 404, yönetim hash rotası ---------- */
    resp = await P.goto(`${B}/boyle-bir-sayfa-yok`); await P.waitForTimeout(400);
    ok('bilinmeyen adres: 404 durum kodu + uygulamanın 404 sayfası', resp.status() === 404 && (await txt(P, '#app')).includes('Sayfa bulunamadı') && P.url() === `${B}/boyle-bir-sayfa-yok`);
    await P.goto(`${B}/metin2-pvp`); await P.waitForSelector('#app .sgrid');
    await P.evaluate(() => { location.hash = 'yonetim'; }); await P.waitForTimeout(400);
    ok('#yonetim hash rotasında kalır (site köküne alınır)', P.url() === `${B}/#yonetim`, P.url());
    await P.evaluate(() => { location.hash = 'metin2-tr'; }); await P.waitForTimeout(400);
    ok('hash ile gezinme (go) temiz adrese çevrilir', await atUrl(P, `${B}/metin2-tr`), P.url());
    await shot(P, '07-metin2-tr');

    /* ---------- 9. Yönetim › SEO ---------- */
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]');
    await M.click('#hdr [data-act=login]'); await M.fill('#lg_u', 'Yonetici'); await M.fill('#lg_p', 'Yonetici-Sifre-2026'); await M.click('form[data-form=loginf] button.btn-primary');
    await M.waitForSelector('.admwrap');
    await M.evaluate(() => { location.hash = 'yonetim/seo'; }); await M.waitForSelector('#seo_rw');
    ok('Yönetim › SEO: denetim durumu "Çalışıyor", temiz adres örneği', await until(M, () => /Çalışıyor/.test((document.querySelector('#seo_rw_st') || {}).textContent || '')) && (await txt(M, '#seo_mode')).includes('/metin2-pvp/albamt2/karakter'), await txt(M, '#seo_rw'));
    await M.click('[data-act=seo-probe]'); await M.waitForTimeout(800);
    ok('Şimdi dene: hâlâ çalışıyor', /Çalışıyor/.test(await txt(M, '#seo_rw_st')));
    await shot(M, '08-yonetim-seo');
    await M.uncheck('#se_cl'); await M.click('form[data-form=seoset] .asave button.btn-primary'); await M.waitForTimeout(800);
    ok('temiz adresler kapatıldı → yedek adresler', /Yedek adresler/.test(await txt(M, '#seo_mode')) && await M.evaluate(() => S.set.seo.mode) === 'p');
    resp = await fetch(`${B}/metin2-pvp/${PVS}`, { redirect: 'manual' });
    ok('kapalıyken temiz adres → 301 ?p=', resp.status === 301 && resp.headers.get('location') === `/?p=metin2-pvp/${PVS}`);
    await M.check('#se_cl'); await M.click('form[data-form=seoset] .asave button.btn-primary'); await M.waitForTimeout(800);
    ok('temiz adresler yeniden açıldı', await M.evaluate(() => S.set.seo.mode) === 'clean');
    ok('yönetim sayfası hash rotasında', /#yonetim\/seo/.test(M.url()), M.url());

    ok('konsol / sayfa hatası yok', errs.length === 0, errs.slice(0, 8).join('\n      '));
  } catch (e) {
    ok('beklenmeyen hata: ' + (e && e.message || e), false, e && e.stack);
  } finally {
    await browser.close();
    srvP.kill();
    const log = fs.existsSync(path.join(RUN, 'server.log')) ? fs.readFileSync(path.join(RUN, 'server.log'), 'utf8') : '';
    const phpErr = log.split('\n').filter(l => /PHP (Fatal|Warning|Parse|Notice|Deprecated)/.test(l));
    ok('sunucu günlüğünde PHP hatası yok', phpErr.length === 0, phpErr.slice(0, 5).join('\n'));
    console.log(`\nSONUÇ: ${PASS} geçti, ${FAIL} kaldı${FAIL ? ' → ' + fails.join(' | ') : ''}\nekran görüntüleri: ${SHOTS}`);
    if (process.env.KEEP === '1') console.log('çalışma klasörü: ' + RUN); else fs.rmSync(RUN, { recursive: true, force: true });
    process.exit(FAIL ? 1 : 0);
  }
})();
