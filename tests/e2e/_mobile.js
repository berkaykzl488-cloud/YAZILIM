// Ortak e2e yardımcıları (390 px ve masaüstü): Hesabım sekmeleri, çıkış, borsa "Siteye sat" ve sabit alt çubuk çevresinde tıklama.
// Mobilde (≤760 px) Hesabım sekme şeridi çizilmez; sekmeler "☰ Menü" (data-act=hs-menu) penceresinden açılır.
// Masaüstünde ya da sekme şeridi görünürken doğrudan şeritteki düğme tıklanır. Böylece aynı çağrı iki genişlikte de çalışır.
//
//   const M = require('./_mobile');
//   await M.hsTab(P, 'borsa');   await M.hsLogout(P);   await M.click(P, '#app [data-act=deposit]');
//   const closeSat = await M.exSat(P);  …  await closeSat();
'use strict';

const vis = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);

/** Öğeyi ekranın ortasına kaydırır (sabit alt çubuğun ve başlığın altında kalmasın), sonra tıklar. */
async function click(p, sel, opt) {
  const loc = p.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: (opt && opt.timeout) || 8000 });
  await loc.evaluate(el => { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { } });
  await loc.click(Object.assign({ timeout: 8000 }, opt || {}));
}

const route = p => p.evaluate(() => route());
const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);

/** Hesabım sayfasına gider (uygulamanın go() işlevi: temiz adres kipinde de doğru). */
async function hsOpen(p, w) {
  if (await route(p) !== 'hesabim') { await p.evaluate(() => go('hesabim')); await p.waitForTimeout(w || 300); }
}

/** Hesabım menüsünü açar (mobil): sayfadaki görünür "☰ Menü" düğmesi. */
async function hsMenu(p) {
  await hsOpen(p);
  await click(p, '#app [data-act=hs-menu]');
  await p.waitForSelector('#modal [data-hsmenu]', { timeout: 8000 });
}

/** Hesabım sekmesini açar: görünür sekme şeridi (masaüstü) ya da ☰ Menü penceresi (mobil). sub: borsa alt bölmesi (al|sat). */
async function hsTab(p, k, w, sub) {
  await hsOpen(p);
  const strip = `#app nav.tabs [data-act=tab][data-t=${k}]`;
  if (await vis(p, strip)) await click(p, strip);
  else {
    await hsMenu(p);
    await click(p, `#modal [data-hsmenu] [data-act=tab][data-t=${k}]${sub ? `[data-s=${sub}]` : ''}`);
    await modalGone(p);
  }
  await p.waitForTimeout(w || 400);
}

/** Çıkış: masaüstünde başlıktaki .page-h düğmesi, mobilde menünün alt bölümündeki düğme. */
async function hsLogout(p) {
  await hsOpen(p);
  if (await vis(p, '#app .page-h [data-act=logout]')) return click(p, '#app .page-h [data-act=logout]');
  await hsMenu(p);
  await click(p, '#modal [data-hsmenu] [data-act=logout]');
}

/** Borsa "Siteye sat": masaüstünde yön düğmesi, mobilde ilk karttaki SAT penceresi. Pencereyi kapatan işlev döner. */
async function exSat(p) {
  if (await vis(p, '#app [data-act=ex-dir][data-d=sat]')) { await click(p, '#app [data-act=ex-dir][data-d=sat]'); await p.waitForSelector('form[data-form=exoffer]'); return async () => { }; }
  await click(p, '#app [data-act=bx-sat]');
  await p.waitForSelector('#modal form[data-form=exoffer]');
  return async () => { if (await vis(p, '#modal [data-act=close]')) await p.click('#modal [data-act=close]'); await modalGone(p); };
}

module.exports = { click, hsOpen, hsMenu, hsTab, hsLogout, exSat, vis, modalGone };
