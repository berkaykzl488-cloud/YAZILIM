// DEMO derlemesi (kökteki index.html, file://) ön yüz testi: Yang Borsası kart ızgarası ve Hesabım › Özetim, 390 px ve 1280 px.
// Sunucu gerekmez; demo verisi tarayıcıdadır (S.exchange / S.exOffers / S.exOrders). Denetimler:
//   - borsa her genişlikte kart ızgarası (390: 2, 1280: 4 sütun); her kartta SAT ("en fazla" ₺) ve AL (₺ + "Satışta N" / "Şu an satıcı yok")
//   - eski iki sekmeli form yok; teslimat noktası ve "Nasıl işler?" ızgaranın altında; TR / PVP süzgeci, arama, sıralama
//   - AL penceresiyle demo alım (tek adım): sipariş oluşur, bakiye düşer, Hesabım › Borsa kartı görünür
//   - SAT penceresiyle demo satış emri (iki adım): emir satış sırasına girer, "Bekleyen işlemlerim" kartı görünür, onaylı iptal
//   - Hesabım › Özetim kartları (Yapılacaklar / Bakiyem / KPI / profil kartı), gruplu menü (mobil: ☰ Menü; masaüstü: grup başlıkları)
//   - #metin2-tr / #metin2-pvp: TR / PVP geçiş kartları (.secsw) yok
//   - üye ekranlarında e-Gider / pusula ifadesi yok; konsol / sayfa hatası yok; yatay taşma yok
//
//   node tests/e2e/demo-borsa-fe.js        (SHOTS=<klasör> ekran görüntüleri; varsayılan geçici klasör)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

const REPO = path.resolve(__dirname, '../..');
const HTML = 'file://' + path.join(REPO, 'index.html');
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-demobx-'));
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 900) : '')); } };
const EGP = /e-?\s?gider|gider\s*pusula|pusula|\bVUK\b|ETTN/i;

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  for (const [W, H, tag] of [[390, 844, 'm'], [1280, 900, 'd']]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith('file:'), r => r.abort());
    const P = await ctx.newPage();
    P.on('pageerror', e => errs.push(`[${tag}] pageerror: ${e.message}`));
    P.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push(`[${tag}] console: ${m.text()}`); });
    P.on('dialog', d => d.dismiss().catch(() => {}));
    const shot = (n, full) => P.screenshot({ path: path.join(SHOTS, `${tag}-${n}.png`), fullPage: !!full });
    const nav = async (h, w) => { await P.evaluate(x => go(x), h); await P.waitForTimeout(w || 400); };
    const noOverflow = () => P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const txt = sel => P.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : ''; }, sel);
    const fill = async (scope) => P.evaluate(sc => { document.querySelectorAll(sc + ' input[required], ' + sc + ' select[required]').forEach(el => {
      if (el.id === 'ex_qty' || el.id === 'ex_price') return; if (el.type === 'checkbox') { el.checked = true; return; }
      if (el.tagName === 'SELECT') { if (!el.value && el.options.length) el.value = el.options[el.options.length - 1].value; return; }
      if (!el.value) el.value = el.type === 'number' ? '1' : 'DemoTest1'; }); }, scope);
    const click = async sel => { const l = P.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.click(); };
    const L = tag === 'm' ? '390 px' : '1280 px';

    await P.goto(HTML + '#metin2-tr'); await P.waitForTimeout(500); // ana sayfa değil: açılış reklam penceresi çıkmaz

    /* ---- bölüm sayfaları: TR / PVP geçiş kartı yok ---- */
    for (const r of ['metin2-tr', 'metin2-pvp']) { await nav(r);
      ok(`${L} #${r}: TR/PVP geçiş kartları yok, server listesi var`, await P.evaluate(() => !document.querySelector('.secsw') && document.querySelectorAll('#app .sgrid .scard').length > 0 && !!document.querySelector('#f_sq'))); }
    await shot('metin2-tr', false);

    /* ---- borsa: ziyaretçi ---- */
    await nav('borsa', 600);
    const g = await P.evaluate(() => { const C = [...document.querySelectorAll('#bxGrid .bx-card')];
      return { n: C.length, cols: getComputedStyle(document.querySelector('#bxGrid')).gridTemplateColumns.split(' ').length,
        priced: C.every(c => /₺/.test(c.querySelector('.bx-row.sat .bx-p').textContent) && /en fazla/.test(c.querySelector('.bx-row.sat').textContent)),
        alPriced: C.filter(c => !c.querySelector('.bx-row.al').disabled).every(c => /₺/.test(c.querySelector('.bx-row.al .bx-p').textContent) && /Satışta \d|Şu an satıcı yok/.test(c.querySelector('.bx-row.al').textContent)),
        alN: C.filter(c => !c.querySelector('.bx-row.al').disabled).length,
        old: !!document.querySelector('#app [data-act=ex-dir], #app form[data-form=exorder], #app form[data-form=exoffer], #app .exboard'),
        below: (() => { const gr = document.querySelector('#bxGrid'), pl = document.querySelector('.bx-place'), hw = document.querySelector('.bx-how');
          return !!(pl && hw) && !!(gr.compareDocumentPosition(pl) & 4) && !!(gr.compareDocumentPosition(hw) & 4); })(),
        bar: !!document.querySelector('#bx_q') && !!document.querySelector('#bx_sort') && document.querySelectorAll('.bx-chips [data-act=bx-sec]').length === 3 }; });
    ok(`${L} borsa: kart ızgarası (${tag === 'm' ? 2 : 4} sütun), eski iki sekmeli form yok`, g.n > 3 && g.cols === (tag === 'm' ? 2 : 4) && !g.old, JSON.stringify(g));
    ok(`${L} borsa: SAT fiyatı her kartta ("en fazla" ₺), AL fiyatı + Satışta N / Şu an satıcı yok`, g.priced && g.alPriced && g.alN > 0, JSON.stringify(g));
    ok(`${L} borsa: arama, TR/PVP süzgeci, sıralama üstte; teslimat ve "Nasıl işler?" ızgaranın altında`, g.bar && g.below, JSON.stringify(g));
    ok(`${L} borsa: yatay taşma yok`, await noOverflow());
    await shot('borsa', false); await shot('borsa-full', true);
    // süzgeç: PVP
    await click('.bx-chips [data-s=pvp]'); await P.waitForTimeout(250);
    const pv = await P.evaluate(() => [...document.querySelectorAll('#bxGrid .bx-card .bx-sec')].map(x => x.textContent));
    ok(`${L} borsa: PVP süzgeci yalnız PVP kartlarını gösterir`, pv.length > 0 && pv.every(x => x === 'PVP'), pv.join(','));
    await click('.bx-chips [data-s=hepsi]'); await P.waitForTimeout(250);
    // arama
    const nm = await P.evaluate(() => document.querySelector('#bxGrid .bx-card .bx-nm b').textContent);
    await P.fill('#bx_q', nm.slice(0, 4)); await P.waitForTimeout(150);
    const vis = await P.evaluate(() => [...document.querySelectorAll('#bxGrid .bx-card')].filter(c => !c.hidden).length);
    ok(`${L} borsa: arama kartları süzer`, vis >= 1 && vis < g.n, vis + '/' + g.n);
    await P.fill('#bx_q', ''); await P.waitForTimeout(150);

    /* ---- giriş: u2 ---- */
    await P.evaluate(() => ACT.as({ id: 'u2', ok: 1 })); await P.waitForTimeout(300);
    await nav('borsa', 500);
    // AL: bakiyesi yeten, fiyatı olan ilk kart
    const pick = await P.evaluate(() => { const u = me(); const x = S.exchange.filter(e => e.on).find(e => exSellPrice(e) && exSellPrice(e) * 2 <= avail(u) && S.set.exBuyOn !== false);
      return x ? { id: x.id, bp: exSellPrice(x), bal: avail(u), n0: S.exOrders.length } : null; });
    ok(`${L} demo üye u2: AL için uygun kart ve bakiye var`, !!pick, JSON.stringify(pick));
    if (pick) {
      await click(`#bxGrid .bx-card[data-id="${pick.id}"] [data-act=bx-al]`);
      await P.waitForSelector('#modal .bx-sheet.bx-al form[data-form=exorder]'); await P.waitForTimeout(400);
      const sh = await P.evaluate(() => ({ head: document.querySelector('#modal .bx-sh-h').innerText, tot: document.querySelector('#ex_tot').textContent, cnt: document.querySelectorAll('#modal form[data-form]').length }));
      ok(`${L} AL penceresi: fiyat ve "Satışta / Şu an satıcı yok" bilgisi, tek form`, /₺/.test(sh.head) && /Satışta|Şu an satıcı yok/.test(sh.head) && sh.cnt === 1, JSON.stringify(sh));
      await P.fill('#ex_qty', '2'); await P.dispatchEvent('#ex_qty', 'input'); await fill('#modal form');
      const tot = await txt('#ex_tot');
      ok(`${L} AL penceresi: toplam 2 × birim fiyat`, tot === (await P.evaluate(v => TL(v), +(pick.bp * 2).toFixed(2))), tot);
      ok(`${L} AL penceresi: yatay taşma yok`, await noOverflow());
      await shot('al-sheet', false);
      await click('#modal button.exgo'); await P.waitForTimeout(500);
      const r = await P.evaluate(p => { const o = S.exOrders[0]; return { route: route(), tab: ui.tab, n: S.exOrders.length, o: o && { u: o.u, ex: o.ex, qty: o.qty, total: o.total }, bal: avail(me()), modal: !!document.querySelector('#modal .mb'), card: !!document.querySelector(`#app .bx-o[data-id="${o.id}"]`) }; }, pick);
      ok(`${L} demo AL: sipariş oluştu, bakiye düştü, pencere kapandı, Hesabım › Borsa kartı görünür`,
        r.n === pick.n0 + 1 && r.o && r.o.u === 'u2' && r.o.ex === pick.id && r.o.qty === 2 && Math.abs(r.bal - (pick.bal - pick.bp * 2)) < 0.01 && !r.modal && r.route === 'hesabim' && r.tab === 'borsa' && r.card, JSON.stringify(r));
      await shot('hesabim-borsa', false);
    }
    // SAT: iki adım
    await nav('borsa', 500);
    const sx = await P.evaluate(() => { const x = S.exchange.filter(e => e.on)[0]; return { id: x.id, max: +x.max, f0: S.exOffers.length }; });
    await click(`#bxGrid .bx-card[data-id="${sx.id}"] [data-act=bx-sat]`);
    await P.waitForSelector('#modal .bx-sheet.bx-sat form[data-form=exoffer]'); await P.waitForTimeout(400);
    ok(`${L} SAT adım 1/2: adet + fiyat, "en fazla" fiyatı görünür; hesap alanları gizli`, await P.isVisible('#ex_price') && (await txt('#bx_stp')) === '1/2' && /En fazla/.test(await txt('#modal .bx-sh-h')) && !(await P.evaluate(() => { const e = document.querySelector('#modal section[data-step="2"]'); return e && !e.hidden; })));
    const price = Math.max(0.01, +(sx.max * 0.5).toFixed(2));
    await P.fill('#ex_qty', '3'); await P.fill('#ex_price', String(price)); await P.dispatchEvent('#ex_price', 'input');
    await shot('sat-sheet-1', false);
    await click('#modal [data-foot="1"] [data-act=bx-step]'); await P.waitForTimeout(150);
    ok(`${L} SAT adım 2/2: hesap bilgileri + onay`, (await txt('#bx_stp')) === '2/2' && await P.isVisible('#ex_ok'));
    await fill('#modal section[data-step="2"]');
    ok(`${L} SAT penceresi: yatay taşma yok`, await noOverflow());
    await shot('sat-sheet-2', false);
    await click('#modal [data-foot="2"] button.exgo'); await P.waitForTimeout(500);
    const s2 = await P.evaluate(() => { const of = S.exOffers[0]; return { n: S.exOffers.length, of: of && { u: of.u, ex: of.ex, qty: of.qty, price: of.price, status: of.status, id: of.id }, modal: !!document.querySelector('#modal .mb'), route: route(), mine: !!(of && document.querySelector(`#bxMine .bx-f[data-id="${of.id}"]`)), top: of && (exBook(S.exchange.find(e => e.id === of.ex))[0] || {}).id }; });
    ok(`${L} demo SAT: emir satışta, sıraya girdi, pencere kapandı, "Bekleyen işlemlerim" kartı görünür`,
      s2.n === sx.f0 + 1 && s2.of && s2.of.u === 'u2' && s2.of.ex === sx.id && s2.of.qty === 3 && s2.of.price === price && s2.of.status === 'aktif' && !s2.modal && s2.route === 'borsa' && s2.mine, JSON.stringify(s2));
    const ct = await P.evaluate(id => { const c = document.querySelector(`#bxGrid .bx-card[data-id="${id}"] .bx-row.sat`); return c ? c.textContent : ''; }, sx.id);
    ok(`${L} SAT kartı: "Sıra başı" en ucuz emri gösterir`, /Sıra başı/.test(ct), ct);
    await shot('borsa-mine', false);
    // iptal (onay penceresiyle)
    if (s2.of) {
      await click(`#bxMine .bx-f[data-id="${s2.of.id}"] [data-act=of-cancel]`); await P.waitForSelector('#cfm:not([hidden])');
      await click('#cfm_ok'); await P.waitForTimeout(400);
      ok(`${L} satış emri onayla iptal edildi`, await P.evaluate(id => (S.exOffers.find(o => o.id === id) || {}).status === 'iptal', s2.of.id));
    }

    /* ---- Hesabım › Özetim ---- */
    await P.evaluate(() => { ui.tab = 'ozet'; go('hesabim'); }); await P.waitForTimeout(400);
    const oz = await P.evaluate(() => ({ wal: !!document.querySelector('#app .hs-wallet'), kpi: document.querySelectorAll('#app .hs-kpis .hs-kpi').length, kpiVals: [...document.querySelectorAll('#app .hs-kpis .hs-kpi b')].every(b => /₺/.test(b.textContent)),
      prof: !!document.querySelector('#app .hs-prof'), todo: !!document.querySelector('#app .hs-todo'), secs: document.querySelectorAll('#app .hs-sec').length,
      top: !!document.querySelector('#app .hs-top [data-act=hs-menu]'), inl: !!document.querySelector('#app .hs-inl .mn-sec'), dnav: document.querySelectorAll('#app nav.hs-dnav .hs-navg').length, tabs: !!document.querySelector('#app nav.tabs') }));
    ok(`${L} Özetim: Bakiyem, 6 KPI kartı (₺), profil kartı, Satış / Alış özetleri`, oz.wal && oz.kpi === 6 && oz.kpiVals && oz.prof && oz.secs === 2, JSON.stringify(oz));
    ok(`${L} Özetim: Yapılacaklar (u2'nin onay bekleyen siparişi)`, oz.todo, JSON.stringify(oz));
    if (tag === 'm') ok('390 px Hesabım: şerit yok; selamlama + ☰ Menü, satır içi gruplu menü', oz.top && oz.inl && !oz.tabs, JSON.stringify(oz));
    else ok('1280 px Hesabım: soldaki sekme şeridi grup başlıklarıyla', oz.tabs && oz.dnav >= 5 && !oz.top, JSON.stringify(oz));
    ok(`${L} Özetim: yatay taşma yok`, await noOverflow());
    await shot('ozetim', false); await shot('ozetim-full', true);
    if (tag === 'm') { await click('#app [data-act=hs-menu]'); await P.waitForSelector('#modal [data-hsmenu]'); await P.waitForTimeout(300);
      ok('390 px ☰ Menü: gruplu hesap menüsü', await P.evaluate(() => document.querySelectorAll('#modal [data-hsmenu] .mn-sec').length >= 5));
      await shot('menu', false); await P.evaluate(() => closeModal()); await P.waitForTimeout(200); }
    // üye ekranlarında e-Gider / pusula yok
    let eg = [];
    for (const t of ['ozet', 'cek', 'hareket', 'borsa']) { await P.evaluate(t => { ui.tab = t; render(); }, t); await P.waitForTimeout(150); const x = await txt('#app'); if (EGP.test(x)) eg.push(t + ': ' + (x.match(EGP) || [])[0]); }
    ok(`${L} üye Hesabım ekranlarında e-Gider / pusula ifadesi yok`, !eg.length, eg.join(' | '));
    await ctx.close();
  }
  ok('konsol / sayfa hatası yok', !errs.length, errs.join('\n'));
  await browser.close();
  console.log(`\n${PASS} geçti, ${FAIL} kaldı · ekran görüntüleri: ${SHOTS}`);
  if (FAIL) { console.log('Kalanlar:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
