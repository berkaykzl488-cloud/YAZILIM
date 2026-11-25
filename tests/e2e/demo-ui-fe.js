// DEMO derlemesi (kökteki index.html, file://) ön yüz testi — 0.6.4 arayüz düzeltmeleri:
//   1. Yönetim › Bugün: yalnız açık işler (sayı > 0), her birinde sayı + kısa etiket + ilgili sayfaya düğme; e-posta / üyeler / gelir bölümü yok;
//      hiç açık iş yoksa tek boş durum; çalışan yalnız yetkili olduğu işleri görür
//   2. Yönetim sol menüsü: her öğe ve grupta simge, açılır-kapanır grup başlığı (ok), açık iş rozetleri, kullanıcı kartı; mobil çekmece aynı
//   3. Server kartları: büyük ad, kategori sayıları kutucukta, "aktif ilan" vurgulu; uzun ad taşmaz
//   4. Mobil üst satır: 360 / 390 / 430 px'te "yangpazar.com" tam görünür (girişli ve girişsiz), Mesajlar simgesi ☰ çekmecede
//   5. iOS: ≤760 px'te görünen her input / select / textarea ≥ 16 px (AL / SAT pencereleri, başlık araması, yönetim); pencere alanı odaktayken yatay taşma yok
//
//   node tests/e2e/demo-ui-fe.js        (SHOTS=<klasör> ekran görüntüleri; varsayılan geçici klasör)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');

const REPO = path.resolve(__dirname, '../..');
const HTML = 'file://' + path.join(REPO, 'index.html');
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-demoui-'));
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 900) : '')); } };

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (W, H, tag) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith('file:'), r => r.abort());
    const P = await ctx.newPage();
    P.on('pageerror', e => errs.push(`[${tag}] pageerror: ${e.message}`));
    P.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push(`[${tag}] console: ${m.text()}`); });
    P.on('dialog', d => d.dismiss().catch(() => {}));
    await P.goto(HTML + '#metin2-tr'); await P.waitForTimeout(500); // ana sayfa değil: açılış reklam penceresi çıkmaz
    await P.evaluate(() => { ui.popupDone = true; });
    return { ctx, P };
  };
  const nav = async (P, h, w) => { await P.evaluate(x => go(x), h); await P.waitForTimeout(w || 400); };
  const shot = (P, n) => P.screenshot({ path: path.join(SHOTS, n + '.png') });
  const noOverflow = P => P.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  /** görünen ve 16 px'ten küçük alanlar */
  const small16 = (P, sc) => P.evaluate(sc => [...document.querySelectorAll(sc.map(s => `${s} input, ${s} select, ${s} textarea`).join(','))]
    .filter(e => e.offsetParent && !/^(checkbox|radio|range|hidden|button|submit|color|file)$/.test(e.type))
    .map(e => [e.id || e.name || e.className || e.tagName, parseFloat(getComputedStyle(e).fontSize)]).filter(x => !(x[1] >= 16)).map(x => x.join(':')), sc);
  const brand = P => P.evaluate(() => { const s = document.querySelector('#hdr .brand>span'), a = document.querySelector('#hdr .brand');
    return { txt: s ? s.firstChild.textContent : '', sw: s ? s.scrollWidth : -1, cw: s ? s.clientWidth : -1, aw: a ? a.scrollWidth <= a.clientWidth : false, top: a ? a.getBoundingClientRect().top : -1,
      msg: (() => { const m = document.querySelector('#hdr a.hmsg'); return !!(m && m.offsetParent); })(),
      bell: (() => { const b = document.querySelector('#hdr a[href="#bildirimler"]'); return b && b.offsetParent ? Math.abs(b.getBoundingClientRect().top - a.getBoundingClientRect().top) < 20 : null; })(),
      login: (() => { const g = document.querySelector('#hdr [data-act=login]'); if (!g || !g.offsetParent) return null; const r = g.getBoundingClientRect(); return r.right <= innerWidth && Math.abs(r.top - a.getBoundingClientRect().top) < 24; })() }; });

  /* ---------- 4. mobil üst satır: 360 / 390 / 430 px ---------- */
  for (const W of [360, 390, 430]) {
    const { ctx, P } = await open(W, 844, 'h' + W);
    await P.evaluate(() => { S.cur = null; save(); render(); }); await P.waitForTimeout(250);
    let b = await brand(P);
    ok(`${W} px girişsiz: "yangpazar.com" tam görünür (scrollWidth ≤ clientWidth), Giriş Yap ilk satırda sığar`, b.txt === 'yangpazar.com' && b.sw <= b.cw && b.aw && b.login === true, JSON.stringify(b));
    await P.evaluate(() => ACT.as({ id: 'u2', ok: 1 })); await P.waitForTimeout(300); await nav(P, 'home');
    b = await brand(P);
    ok(`${W} px girişli: marka tam görünür; zil ve avatar aynı satırda; Mesajlar simgesi gizli`, b.sw <= b.cw && b.aw && b.bell === true && !b.msg, JSON.stringify(b));
    ok(`${W} px: yatay taşma yok`, await noOverflow(P));
    if (W === 390) await shot(P, 'header-390');
    await ctx.close();
  }

  /* ---------- 5. iOS: ≤760 px alanlar ≥ 16 px, pencere alanı odaktayken taşma yok ---------- */
  {
    const { ctx, P } = await open(390, 844, 'ios');
    await P.evaluate(() => ACT.as({ id: 'u2', ok: 1 })); await P.waitForTimeout(300);
    let bad = [];
    for (const r of ['home', 'metin2-tr', 'borsa', 'hesabim', 'ilan-ver', 'reklam-ver']) { await nav(P, r, 450); bad = bad.concat((await small16(P, ['#hdr', '#app'])).map(x => r + ' ' + x)); }
    ok('390 px: başlık araması ve sayfalardaki görünen tüm alanlar ≥ 16 px', bad.length === 0, bad.join(', '));
    await nav(P, 'borsa', 500);
    const xid = await P.evaluate(() => S.exchange.filter(e => e.on)[0].id);
    await P.click(`#bxGrid .bx-card[data-id="${xid}"] [data-act=bx-sat]`); await P.waitForSelector('#modal .bx-sheet.bx-sat'); await P.waitForTimeout(350);
    let sm = await small16(P, ['#modal']);
    ok('390 px SAT penceresi: görünen tüm alanlar ≥ 16 px', sm.length === 0 && await P.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#ex_price')).fontSize) >= 16), sm.join(', '));
    await P.focus('#ex_price'); await P.waitForTimeout(450);
    ok('390 px SAT: "Birim fiyatın" odakta, yatay taşma yok; alan pencerede görünür', await noOverflow(P) && await P.evaluate(() => { const e = document.querySelector('#ex_price'), r = e.getBoundingClientRect(), b = document.querySelector('#modal .md.sheet').getBoundingClientRect();
      const v = document.querySelector('#modal .md.sheet .md-b').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= b.top && r.bottom <= b.bottom && r.top >= v.top && r.bottom <= v.bottom && document.activeElement === e; }));
    ok('alt pencere görünen alan değişkenleri (--vvh / --vvt) ayarlı', await P.evaluate(() => /px$/.test(document.documentElement.style.getPropertyValue('--vvh')) && /px$/.test(document.documentElement.style.getPropertyValue('--vvt'))));
    // iOS benzetimi: sabit katman yerinde, görünen alan 420 px (klavye) ve 60 px aşağı kaymış → pencere bu alana oturur
    await P.evaluate(() => { document.documentElement.style.setProperty('--vvh', '420px'); document.documentElement.style.setProperty('--vvt', '60px'); }); await P.waitForTimeout(100);
    ok('390 px SAT (iOS benzetimi): pencere görünen alana (60–480 px) sığar, gövde kaydırılabilir', await P.evaluate(() => { const s = document.querySelector('#modal .md.sheet').getBoundingClientRect(), b = document.querySelector('#modal .md.sheet .md-b'); return s.top >= 60 && s.bottom <= 481 && s.height > 200 && getComputedStyle(b).overflowY === 'auto' && b.scrollHeight > b.clientHeight; }), await P.evaluate(() => JSON.stringify(document.querySelector('#modal .md.sheet').getBoundingClientRect())));
    // görünen alan gerçekten küçülünce (klavye açıldı): değişken güncellenir, odaktaki alan pencerede görünür kılınır
    await P.evaluate(() => { const b = document.querySelector('#modal .md.sheet .md-b'); if (b) b.scrollTop = 0; });
    await P.setViewportSize({ width: 390, height: 420 }); await P.waitForTimeout(300); await P.focus('#ex_qty'); await P.focus('#ex_price'); await P.waitForTimeout(500);
    ok('390 px SAT: klavye açıkken (420 px) --vvh güncel, pencere sığar, "Birim fiyatın" görünür, taşma yok', await P.evaluate(() => { const s = document.querySelector('#modal .md.sheet').getBoundingClientRect(), r = document.querySelector('#ex_price').getBoundingClientRect();
      const v = document.querySelector('#modal .md.sheet .md-b').getBoundingClientRect(); // kaydırılan gövde: alan gövdenin görünen kısmında (alt bölümün arkasında değil)
      return document.documentElement.style.getPropertyValue('--vvh') === '420px' && s.bottom <= 421 && s.top >= 0 && r.top >= v.top && r.bottom <= v.bottom && v.bottom <= s.bottom && document.documentElement.scrollWidth <= innerWidth; }), await P.evaluate(() => JSON.stringify([document.querySelector('#modal .md.sheet').getBoundingClientRect(), document.querySelector('#modal .md.sheet .md-b').getBoundingClientRect(), document.querySelector('#ex_price').getBoundingClientRect()])));
    await shot(P, 'sat-keyboard-390');
    await P.setViewportSize({ width: 390, height: 844 }); await P.waitForTimeout(300);
    await P.evaluate(() => closeModal()); await P.waitForTimeout(250);
    const aid = await P.evaluate(() => { const x = S.exchange.filter(e => e.on).find(e => exSellPrice(e)); return x && x.id; });
    await P.click(`#bxGrid .bx-card[data-id="${aid}"] [data-act=bx-al]`); await P.waitForSelector('#modal .bx-sheet.bx-al'); await P.waitForTimeout(350);
    sm = await small16(P, ['#modal']);
    ok('390 px AL penceresi: görünen tüm alanlar ≥ 16 px', sm.length === 0, sm.join(', '));
    await P.focus('#ex_qty'); await P.waitForTimeout(300);
    ok('390 px AL: adet alanı odaktayken yatay taşma yok', await noOverflow(P));
    await P.evaluate(() => closeModal()); await P.waitForTimeout(200);
    // yönetim alanları
    await P.evaluate(() => ACT.as({ id: 'admin', ok: 1 })); await P.waitForTimeout(300);
    bad = [];
    for (const r of ['yonetim/siparis', 'yonetim/odeme/yontemler', 'yonetim/borsa/kurlar', 'yonetim/ayar/genel']) { await nav(P, r, 450); bad = bad.concat((await small16(P, ['#app'])).map(x => r + ' ' + x)); }
    ok('390 px yönetim: görünen tüm alanlar ≥ 16 px', bad.length === 0, bad.slice(0, 12).join(', '));
    ok('viewport yakınlaştırmayı kapatmaz (maximum-scale / user-scalable yok)', await P.evaluate(() => !/maximum-scale|user-scalable/i.test((document.querySelector('meta[name=viewport]') || {}).content || '')));
    await ctx.close();
  }

  /* ---------- 1–3. Bugün, sol menü, kartlar (1280 px) ---------- */
  {
    const { ctx, P } = await open(1280, 900, 'd');
    await nav(P, 'metin2-pvp', 500);
    const cards = await P.evaluate(() => [...document.querySelectorAll('#app .sgrid .scard')].slice(0, 40).map(c => { const h = c.querySelector('h3'), n = c.querySelector('.scard-nm');
      return { fs: parseFloat(getComputedStyle(h).fontSize), fit: n.scrollWidth <= n.clientWidth + 1 && c.scrollWidth <= c.clientWidth + 1 && n.getBoundingClientRect().right <= c.getBoundingClientRect().right, lines: Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)), title: h.title === n.textContent, pills: c.querySelectorAll('.sstats .sst').length, act: !!c.querySelector('.scard-f .sact b') }; }));
    ok('server kartları: ad ≥ 24 px, taşmaz (uzun ad en çok 2 satır, tam ad title\'da); kategori kutucukları ve vurgulu "aktif ilan"', cards.length > 3 && cards.every(c => c.fs >= 24 && c.fit && c.lines <= 2 && c.title && c.pills >= 3 && c.act), JSON.stringify(cards.filter(c => !(c.fs >= 24 && c.fit && c.lines <= 2 && c.title && c.pills >= 3 && c.act)).slice(0, 3)));
    await P.evaluate(() => ACT.as({ id: 'admin', ok: 1 })); await P.waitForTimeout(300);
    await nav(P, 'yonetim', 500);
    const t = await P.evaluate(() => { const A = [...document.querySelectorAll('#app .aop')];
      const exp = ADM_QUEUES.filter(x => can(x.p)).map(x => [x.id, x.L().length]).filter(x => x[1] > 0);
      return { n: A.map(a => [a.dataset.q, +a.querySelector('.aop-n').textContent.replace(/\D/g, ''), a.getAttribute('href'), (a.querySelector('.aop-go') || {}).textContent || '', (a.querySelector('.aop-t b') || {}).textContent || '']), exp,
        txt: document.querySelector('#app .apage').innerText, kpis: document.querySelectorAll('#app .apage .kpis, #app .apage .qclean, #app .apage .bars').length, empty: document.querySelectorAll('#app .aop-empty').length }; });
    ok('Bugün: yalnız sayısı > 0 olan açık işler, her birinde sayı + etiket + ilgili yönetim sayfasına düğme', t.n.length > 0 && t.n.every(x => x[1] > 0 && /^#yonetim\//.test(x[2]) && x[3].trim() && x[4].trim()) && t.empty === 0, JSON.stringify(t.n));
    ok('Bugün: listedeki işler ve sayıları kuyruklarla aynı', JSON.stringify(t.n.map(x => x[0] + ':' + x[1]).sort()) === JSON.stringify(t.exp.map(x => x[0] + ':' + x[1]).sort()), JSON.stringify([t.n.map(x => x[0] + ':' + x[1]), t.exp]));
    ok('Bugün: e-posta / WhatsApp kuyruğu, Üyeler, Gelir ve "Bekleyen yok" bölümleri yok', !/E-posta & WhatsApp kuyruğu|Toplam üye|Bugün katılan|Gelir\b|Komisyon geliri|Bekleyen yok|İş kuyruğu/i.test(t.txt) && t.kpis === 0, t.txt.slice(0, 400));
    ok('Bugün: teslim bekleyen sipariş ve itirazlar dahil', t.n.some(x => x[0] === 'teslim') && t.n.some(x => x[0] === 'siparis'), JSON.stringify(t.n.map(x => x[0])));
    await shot(P, 'bugun-1280');
    /* sol menü */
    const sb = await P.evaluate(() => { const I = [...document.querySelectorAll('.asb .asb-i, .asb .asb-top')], G = [...document.querySelectorAll('.asb .asb-g')];
      const odm = I.find(a => a.dataset.t === 'odeme'); const on = document.querySelector('.asb .asb-top.on');
      return { items: I.length, ico: I.every(a => a.querySelector('.asb-ic svg')), grp: G.length, gico: G.every(g => g.querySelector('.asb-gh .asb-gic svg') && g.querySelector('.asb-gh .asb-chev svg')),
        badges: document.querySelectorAll('.asb .asb-i .nb, .asb .asb-top .nb').length, odm: odm && (odm.querySelector('.nb') || {}).textContent, odmExp: String(S.deps.filter(d => d.status === 'bekliyor').length),
        wq: (document.querySelector('.asb .asb-who .asb-wq b') || {}).textContent, tot: String(admTotal()), who: !!document.querySelector('.asb .asb-who .av') && /Yönetici/.test(document.querySelector('.asb .asb-who').textContent),
        on: !!on && getComputedStyle(on).backgroundImage !== 'none' && getComputedStyle(on.querySelector('.asb-ic')).backgroundColor !== 'rgba(0, 0, 0, 0)' }; });
    ok('sol menü: her öğede ve grupta simge; grup başlığında açılır-kapanır ok', sb.items > 15 && sb.ico && sb.grp >= 5 && sb.gico, JSON.stringify(sb));
    ok('sol menü: açık iş rozetleri (Ödemeler = bekleyen yükleme), kullanıcı kartında toplam açık iş', sb.badges >= 5 && sb.odm === sb.odmExp && sb.wq === sb.tot && sb.who, JSON.stringify(sb));
    ok('sol menü: etkin öğe belirgin (vurgu zemini + dolu simge)', sb.on, JSON.stringify(sb));
    const g0 = await P.evaluate(() => { const g = [...document.querySelectorAll('.asb .asb-g')].find(x => !x.classList.contains('cur') && !x.classList.contains('shut')); return g && g.dataset.g; });
    if (g0) { await P.click(`.asb .asb-g[data-g="${g0}"] .asb-gh`); await P.waitForTimeout(150);
      ok('sol menü: grup kapanır, kapalı grupta toplam rozet görünür (varsa)', await P.evaluate(g => { const e = document.querySelector(`.asb .asb-g[data-g="${g}"]`); return e.classList.contains('shut') && e.querySelector('.asb-gh').getAttribute('aria-expanded') === 'false'; }, g0));
      await P.click(`.asb .asb-g[data-g="${g0}"] .asb-gh`); await P.waitForTimeout(100); }
    for (const th of ['light', 'dark']) { await P.evaluate(th => { if (curTheme() !== th) ACT.theme(); }, th); await P.waitForTimeout(150); await shot(P, 'menu-1280-' + th); }
    /* çalışan: yalnız yetkili işler */
    const sid = await P.evaluate(() => { const s = S.users.find(u => u.staff && (u.perms || []).length && !(u.perms || []).includes('odeme')); return s && s.id; });
    if (sid) { await P.evaluate(id => ACT.as({ id, ok: 1 }), sid); await P.waitForTimeout(300); await nav(P, 'yonetim', 400);
      const st = await P.evaluate(() => [...document.querySelectorAll('#app .aop')].map(a => a.dataset.q));
      const allow = await P.evaluate(() => ADM_QUEUES.filter(x => can(x.p) && x.L().length).map(x => x.id));
      ok('çalışan: Bugün yalnız yetkili olduğu açık işler (Ödemeler yok)', !st.includes('odeme') && JSON.stringify(st.sort()) === JSON.stringify(allow.sort()), JSON.stringify([st, allow])); }
    /* boş durum */
    await P.evaluate(() => ACT.as({ id: 'admin', ok: 1 })); await P.waitForTimeout(250);
    await P.evaluate(() => { S.wd.forEach(w => { if (w.status === 'bekliyor') w.status = 'gönderildi'; }); S.orders.forEach(o => { if (['itiraz', 'odendi'].includes(o.status)) o.status = 'tamam'; }); S.deps.forEach(d => { if (d.status === 'bekliyor') d.status = 'onaylandı'; });
      S.exOrders.forEach(o => { if (exOpenSt(o.status)) o.status = 'tamam'; }); S.tickets.forEach(x => { if (x.status === 'bekliyor') x.status = 'kapali'; }); S.listings.forEach(l => { if (l.status === 'beklemede') l.status = 'aktif'; });
      S.ads.forEach(a => { if (adSt(a) === 'onay') a.status = 'red'; }); S.flagged.forEach(f => { f.seen = true; }); (S.partnerApps || []).forEach(a => { a.st = 'onay'; }); S.epProducts.forEach(p => { while (p.codes.length < 4) p.codes.push('T' + p.codes.length + Math.random()); }); });
    await nav(P, 'yonetim/siparis', 200); await nav(P, 'yonetim', 400);
    const e = await P.evaluate(() => ({ aop: document.querySelectorAll('#app .aop').length, empty: document.querySelectorAll('#app .aop-empty').length, txt: (document.querySelector('#app .aop-empty') || {}).innerText || '', badge: document.querySelectorAll('.asb .asb-top .nb').length }));
    ok('Bugün: açık iş yoksa tek, dostça boş durum; Bugün rozeti yok', e.aop === 0 && e.empty === 1 && /açık iş yok/.test(e.txt) && e.badge === 0, JSON.stringify(e));
    await shot(P, 'bugun-bos-1280');
    await ctx.close();
  }

  /* ---------- 2. mobil çekmece (390 px) ---------- */
  {
    const { ctx, P } = await open(390, 844, 'm');
    await P.evaluate(() => ACT.as({ id: 'admin', ok: 1 })); await P.waitForTimeout(300); await nav(P, 'yonetim', 500);
    const n = await P.evaluate(() => ({ aop: [...document.querySelectorAll('#app .aop')].every(a => +a.querySelector('.aop-n').textContent.replace(/\D/g, '') > 0 && a.querySelector('.aop-go')), cnt: document.querySelectorAll('#app .aop').length }));
    ok('390 px Bugün: açık iş kartları (sayı > 0, düğmeli)', n.cnt > 0 && n.aop, JSON.stringify(n));
    ok('390 px Bugün: yatay taşma yok', await noOverflow(P));
    await P.click('.mtop [data-act=adm-menu]'); await P.waitForTimeout(400);
    const d = await P.evaluate(() => { const D = document.querySelector('#admDrawer'); return { vis: getComputedStyle(D).visibility === 'visible', who: !!D.querySelector('.adrawer-who .asb-who .av'), ico: [...D.querySelectorAll('.asb-i, .asb-top')].every(a => a.querySelector('.asb-ic svg')),
      gico: [...D.querySelectorAll('.asb-gh')].every(h => h.querySelector('.asb-gic svg') && h.querySelector('.asb-chev')), nb: D.querySelectorAll('.asb-i .nb, .asb-top .nb').length, w: D.scrollWidth <= D.clientWidth + 1 }; });
    ok('390 px çekmece: kullanıcı kartı, simgeler, grup okları, rozetler, taşma yok', d.vis && d.who && d.ico && d.gico && d.nb >= 3 && d.w, JSON.stringify(d));
    await shot(P, 'drawer-390');
    await ctx.close();
  }

  ok('konsol / sayfa hatası yok', !errs.length, errs.join('\n'));
  await browser.close();
  console.log(`\n${PASS} geçti, ${FAIL} kaldı · ekran görüntüleri: ${SHOTS}`);
  if (FAIL) { console.log('Kalanlar:\n  ' + fails.join('\n  ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
