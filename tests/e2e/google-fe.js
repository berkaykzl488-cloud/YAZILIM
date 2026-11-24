// "Google ile devam et" ön yüz uçtan uca testi: CANLI PAKET (--prod --zip) geçici klasöre açılır, php -S + tests/http/router.php,
// YP_TEST=1 + SQLite. Google: token/id_token/keşif storage/test_mock.json {"google":"ok"} ile sahte (sunucu); tarayıcıdaki
// accounts.google.com izin sayfası Playwright route ile sahte (redirect_uri + state ile "hesap seç" bağlantısı). Denetlenen:
//   - düğme yalnız açıkken (giriş + üyelik penceresi, "veya" ayırıcı, beyaz düğme, Google "G" logosu, iki tema)
//   - yeni üye: "Google ile kaydı tamamla" formu (e-posta Google'dan, KVKK) → giriş; ?p= kipinde dönüş adresi
//   - temiz adres kipinde kayıtlı Google hesabıyla giriş (dönüş adresi /metin2-pvp, gauth adresten silinir)
//   - e-posta eşleşmesi: şifreyle bir kez giriş → bağlandı; 2FA: kod penceresi → giriş
//   - Hesabım › Profil: Google hesabı paneli (şifre yokken kaldırılamaz → şifre ekle → kaldır → bağla)
//   - Yönetim › Entegrasyonlar › Google ile giriş kartı (maskeli Secret, yönlendirme adresi, adımlar, test, kapat/aç)
//   - Türkçe hata (doğrulanmamış e-posta), 390 px'te taşma yok, konsol hatası yok; ekran görüntüleri (SHOTS=<klasör>)
//
//   node tests/e2e/google-fe.js            (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium, request } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-gfe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || path.join(RUN, 'shots');
const PORT = +(process.env.PORT || 20100 + Math.floor(Math.random() * 90));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const DBF = () => path.join(SITE, 'storage/test.sqlite');
const sq = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $s=$p->query($argv[2]); $v=$s?$s->fetchColumn():false; echo $v===false?"":$v;', DBF(), sql]).trim();
const sqx = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $p->exec($argv[2]);', DBF(), sql]);
const mock = o => fs.writeFileSync(path.join(SITE, 'storage/test_mock.json'), JSON.stringify(o));
const ident = (sub, email, given, family) => fs.writeFileSync(path.join(SITE, 'storage/test_google.json'), JSON.stringify({ sub, email, email_verified: true, name: given + ' ' + family, given_name: given, family_name: family }));
const phpApp = code => sh('php', ['-r', 'define("YP_STORAGE",$argv[1]); require $argv[2]; YP\\Store::requireKey(); $db=YP\\Db::connect(YP\\Store::dbConfig()); YP\\Db::setMain($db); ' + code, path.join(SITE, 'storage'), path.join(SITE, 'app/bootstrap.php')]);
const CID = '123456789012-abcdefghij0123456789klmnopqrstuv.apps.googleusercontent.com', SEC = 'GOCSPX-TestSecret_1234567890abcdXY';

/* ---------- 1. paket ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
ok('derleme: zip ve kurulum kodu', !!CODE && !!ZIP, out);
sh('php', ['-r', '$z=new ZipArchive; if($z->open($argv[1])!==true) exit(1); $z->extractTo($argv[2]); $z->close();', path.join(BUILD, ZIP), SITE]);
const list = sh('php', ['-r', '$z=new ZipArchive; $z->open($argv[1]); for($i=0;$i<$z->numFiles;$i++) echo $z->getNameIndex($i),"\\n";', path.join(BUILD, ZIP)]).split('\n');
ok('zip: Google sunucu dosyaları ve ön yüz dosyası var', ['app/src/Google.php', 'app/routes/12_google.php', 'assets/js/prod/98g-google.js'].every(f => list.includes(f)), list.filter(f => /google/i.test(f)).join(', '));
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));

/* ---------- 2. sunucu ---------- */
fs.writeFileSync(path.join(RUN, 'sendmail.sh'), `#!/bin/sh\ncat >> "${RUN}/sendmail.log"\necho "----" >> "${RUN}/sendmail.log"\n`, { mode: 0o755 });
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', `sendmail_path=${RUN}/sendmail.sh`, '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const rlReset = () => { const d = path.join(SITE, 'storage/rl'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { force: true }); };
async function otp(to) {
  for (let i = 0; i < 20; i++) { const j = await (await fetch(`${B}/api/v1/_test/outbox?to=${encodeURIComponent(to)}`)).json(); const r = (j.data.rows || []).find(x => x.ev === 'tfa'); const m = r && /\b(\d{6})\b/.exec(r.body); if (m) return m[1]; await sleep(250); }
  return null;
}

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [];
  const consent = []; // sahte Google izin sayfasına gelen istekler
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    // sahte Google hesap seçme sayfası. Playwright yönlendirme zincirindeki istekleri (302 → accounts.google.com) yakalamaz;
    // bu yüzden start isteği yakalanır, sunucunun gerçek 302 yanıtı alınır ve Location Google ise izin sayfası yerinde gösterilir.
    await ctx.route(u => u.href.startsWith(B + '/api/v1/index.php?r=auth%2Fgoogle%2Fstart'), async r => {
      const resp = await r.fetch({ maxRedirects: 0 }); const loc = resp.headers()['location'] || '';
      if (!/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/.test(loc)) return r.fulfill({ response: resp });
      const u = new URL(loc); consent.push(u); const cb = u.searchParams.get('redirect_uri') + '&state=' + encodeURIComponent(u.searchParams.get('state') || '');
      const okH = cb + '&code=4%2F0AfJohXk-e2e&scope=email+profile+openid&authuser=0&prompt=consent', noH = cb + '&error=access_denied';
      const hd = {}; const sc = resp.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie').map(h => h.value); if (sc.length) hd['set-cookie'] = sc.join('\n');
      return r.fulfill({ status: 200, headers: hd, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><title>Google ile oturum açın</title><h1>Hesap seçin</h1><a id="g-ok" href="${okH.replace(/"/g, '&quot;')}">Oyuncu</a> <a id="g-no" href="${noH.replace(/"/g, '&quot;')}">İptal</a>` }); });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  const shotV = async (p, n) => { await p.waitForTimeout(400); return p.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const go = async (p, h, t) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(t || 300); };
  const txt = (p, s) => p.locator(s || 'body').first().innerText();
  const tc = (p, s) => p.locator(s || 'body').first().textContent(); // CSS büyük harfe çevirmez, kapalı <details> dahil
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const ready = p => p.waitForFunction(() => typeof S !== 'undefined' && S && typeof API !== 'undefined' && API.live && document.querySelector('#hdr'), null, { timeout: 15000 });
  const openLogin = async p => { await p.evaluate(() => ACT.login()); await p.waitForSelector('#lg_u'); };
  const openReg = async p => { await p.evaluate(() => ACT.register()); await p.waitForSelector('#rg_u'); };
  const login = async (p, u, pw) => { await openLogin(p); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  /** Google düğmesi → sahte izin sayfası → "hesap seç" → siteye dönüş */
  const google = async (p, sel, pick) => {
    await p.click(sel); await p.waitForSelector(pick || '#g-ok', { timeout: 10000 }); await p.click(pick || '#g-ok');
    await p.waitForURL(u => u.href.startsWith(B) && !/auth\/google|auth%2Fgoogle/.test(u.href), { timeout: 10000 }); await ready(p); await p.waitForTimeout(600); };
  const mode = p => p.evaluate(() => (S.set.seo || {}).mode || '');
  const wide = async (p, tag, into) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) into.push(tag + ':' + w); };
  const theme = async (p, t) => { await p.evaluate(t => { if (document.documentElement.dataset.theme !== t) { const b = document.querySelector('[data-act=theme]'); if (b) b.click(); else document.documentElement.dataset.theme = t; } }, t); await p.waitForTimeout(200); return p.evaluate(() => document.documentElement.dataset.theme); };
  const btnStyle = p => p.evaluate(() => { const b = document.querySelector('#modal .gbtn'); if (!b) return null; const c = getComputedStyle(b); return { bg: c.backgroundColor, fg: c.color, logo: !!b.querySelector('svg.glogo path[fill="#4285F4"]'), text: b.innerText.trim(), w: b.getBoundingClientRect().width }; });

  try {
    /* ---------- 3. kurulum ---------- */
    const K = await request.newContext({ baseURL: B });
    const kur = async (form) => { const h = await (await K.get('/kurulum/')).text(); const csrf = (h.match(/name="csrf" value="([^"]*)"/) || [])[1] || ''; return (await K.post('/kurulum/', { form: Object.assign({ csrf }, form) })).text(); };
    const APW = 'Yonetici-Sifre-2026';
    await kur({ action: 'code', install_code: CODE }); await kur({ action: 'env' });
    await kur({ action: 'dbsave', driver: 'sqlite', sqlite_path: DBF() }); await kur({ action: 'schema' });
    await kur({ action: 'site', site_name: 'Yang Google', site_url: B });
    phpApp('$m=YP\\Settings::get("mail",$db); $m["from"]="noreply@yangpazar.test"; $m["on"]=true; $m["fallback"]=true; YP\\Settings::set("mail",$m,null,$db);');
    await kur({ action: 'admin', name: 'Yonetici', email: 'admin@yangpazar.com', password: APW, password2: APW });
    const fin = await kur({ action: 'finish' });
    ok('kurulum tamamlandı', /Kurulum tamamlandı/.test(fin) && fs.existsSync(path.join(SITE, 'storage/kurulum_tamam.php')));
    await K.dispose();
    mock({ google: 'ok' });

    /* ---------- 4. kapalıyken düğme yok ---------- */
    const A = await mk('ziyaretci');
    await A.goto(B + '/'); await ready(A);
    await openLogin(A);
    ok('kapalıyken giriş penceresinde Google düğmesi yok', await A.locator('#modal .gbtn').count() === 0 && !(await txt(A, '#modal')).includes('Google'));
    await openReg(A);
    ok('kapalıyken üyelik penceresinde Google düğmesi yok', await A.locator('#modal .gbtn').count() === 0);
    await A.evaluate(() => closeModal());

    /* ---------- 5. açılınca: düğme, iki tema; yeni üye ?p= kipinde ---------- */
    phpApp(`YP\\Settings::set("google",["on"=>true,"client_id"=>"${CID}","client_secret"=>"${SEC}"],null,$db);`);
    ident('700000000000000000007', 'deniz.google@gmail.com', 'Deniz', 'Kaya');
    await A.goto(B + '/'); await ready(A);
    ok('açılış: S.set.googleOn=true, adres kipi ?p= (rewrite henüz denenmedi)', await A.evaluate(() => S.set.googleOn === true) && await mode(A) !== 'clean', await mode(A));
    await go(A, 'metin2-pvp', 500);
    ok('?p= kipi: /?p=metin2-pvp', /\?p=metin2-pvp$/.test(A.url()), A.url());
    await openLogin(A);
    let st = await btnStyle(A);
    ok('giriş penceresi: beyaz "Google ile devam et" düğmesi + G logosu + "veya"', st && st.text === 'Google ile devam et' && st.bg === 'rgb(255, 255, 255)' && st.logo && (await txt(A, '#modal')).includes('veya'), JSON.stringify(st));
    ok('düğme formun en üstünde (şifre alanlarından önce)', await A.evaluate(() => { const f = document.querySelector('#modal form[data-form=loginf]'); return f.firstElementChild.classList.contains('gbtn'); }));
    ok('koyu tema', (await theme(A, 'dark')) === 'dark'); await shotV(A, 'giris-google-koyu');
    ok('gündüz teması: düğme yine beyaz, kenarlıklı', (await theme(A, 'light')) === 'light' && (st = await btnStyle(A)) && st.bg === 'rgb(255, 255, 255)' && st.fg === 'rgb(31, 31, 31)', JSON.stringify(st));
    await shotV(A, 'giris-google-gunduz');
    await openReg(A);
    ok('üyelik penceresinde de düğme var', await A.locator('#modal form[data-form=registerf] .gbtn[data-m=register]').count() === 1);
    await shotV(A, 'uyelik-google-gunduz'); await theme(A, 'dark'); await shotV(A, 'uyelik-google-koyu');
    await google(A, '#modal .gbtn');
    const c0 = consent[consent.length - 1];
    ok('Google\'a giden istek: client_id, redirect_uri, scope, prompt, PKCE', c0 && c0.searchParams.get('client_id') === CID && c0.searchParams.get('redirect_uri') === B + '/api/v1/index.php?r=auth/google/callback'
      && c0.searchParams.get('scope') === 'openid email profile' && c0.searchParams.get('prompt') === 'select_account' && c0.searchParams.get('code_challenge_method') === 'S256', c0 && c0.href);
    await A.waitForSelector('form[data-form=gregf]', { timeout: 8000 });
    const rt = await tc(A, '#modal');
    ok('dönüş: "Google ile kaydı tamamla" formu (e-posta Google\'dan, salt okunur; ad/soyad/kullanıcı adı dolu)', rt.includes('Google ile kaydı tamamla') && rt.includes('deniz.google@gmail.com') && await A.inputValue('#gr_ad') === 'Deniz' && await A.inputValue('#gr_sy') === 'Kaya' && await A.inputValue('#gr_u') === 'Deniz_Kaya' && await A.locator('#gr_e[readonly]').count() === 1, rt);
    ok('dönüş adresi: gauth silindi, ?p=metin2-pvp korundu', !/gauth/.test(A.url()) && /\?p=metin2-pvp/.test(A.url()), A.url());
    await shotV(A, 'google-kaydi-tamamla');
    await A.fill('#gr_t', '0533 777 88 99'); await A.click('form[data-form=gregf] button.btn-primary');
    ok('KVKK işaretlenmeden gönderilmez (tarayıcı doğrulaması)', await A.locator('form[data-form=gregf]').count() === 1 && !(await txt(A, '#hdr')).includes('Deniz_Kaya'));
    await A.check('#gr_k'); await A.click('form[data-form=gregf] button.btn-primary');
    ok('kayıt tamam: oturum açık, hoş geldin', await modalGone(A) && (await txt(A, '#hdr')).includes('Deniz_Kaya') && await toast(A, 'Hoş geldin'));
    ok('DB: google_sub, şifresiz', sq("SELECT google_sub FROM yp_users WHERE name='Deniz_Kaya'") === '700000000000000000007' && sq("SELECT substr(pass_hash,1,1) FROM yp_users WHERE name='Deniz_Kaya'") === '!');

    /* ---------- 6. Hesabım › Profil: Google hesabı paneli ---------- */
    await go(A, 'hesabim', 500); await A.click('#app [data-act=tab][data-t=profil]'); await A.waitForSelector('#gacc');
    let gp = await tc(A, '#gacc');
    ok('profil: "Google hesabı · Bağlı · e-posta", şifre yokken kaldır düğmesi kapalı + uyarı', gp.includes('Google hesabı') && gp.includes('Bağlı') && gp.includes('deniz.google@gmail.com') && await A.locator('#gacc [data-act=g-unlink]').isDisabled() && gp.includes('şifre yok'), gp);
    ok('profil: mevcut şifre ipucu "henüz şifre yok"', (await txt(A, 'form[data-form=profile]')).includes('henüz şifre yok'));
    await shot(A, 'hesabim-google-bagli-sifresiz');
    await A.fill('#pf_pass', 'Deniz-Google-Sifre-1'); await A.click('form[data-form=profile] button.btn-primary');
    ok('ilk şifre mevcut şifre sorulmadan kaydedildi', await toast(A, 'Bilgileriniz kaydedildi'));
    await A.waitForTimeout(400); await A.waitForSelector('#gacc [data-act=g-unlink]:not([disabled])', { timeout: 5000 }).catch(() => {});
    ok('şifre eklenince kaldır düğmesi açık', !(await A.locator('#gacc [data-act=g-unlink]').isDisabled()));
    await A.click('#gacc [data-act=g-unlink]'); await A.click('#cfm_ok');
    ok('bağlantı kaldırıldı', await toast(A, 'Google bağlantısı kaldırıldı'));
    await A.waitForTimeout(400); gp = await txt(A, '#gacc');
    ok('profil: "Bağlı değil" + "Google hesabını bağla"', gp.includes('Bağlı değil') && await A.locator('#gacc .gbtn[data-m=link]').count() === 1, gp);
    await google(A, '#gacc .gbtn[data-m=link]');
    ok('profilden bağla → "Google hesabınız bağlandı", profil sekmesi', await toast(A, 'Google hesabınız bağlandı') && (await txt(A, '#gacc')).includes('Bağlı ·'), await txt(A, '#app'));
    await shot(A, 'hesabim-google-bagli');

    /* ---------- 7. Yönetim › Entegrasyonlar › Google ile giriş ---------- */
    const M = await mk('yonetici');
    await M.goto(B + '/'); await ready(M); await login(M, 'Yonetici', APW); await M.waitForSelector('.admwrap');
    await go(M, 'yonetim/entegrasyon', 500); await M.waitForSelector('form#gadm', { timeout: 10000 });
    let card = await tc(M, '#gadm');
    ok('kart: Açık, Client ID, maskeli Secret, yönlendirme adresi, JS kaynağı', card.includes('Google ile giriş') && card.includes('Açık') && await M.inputValue('#g_cid') === CID && card.includes('••••••XY') && !card.includes('TestSecret') && !(await M.inputValue('#g_sec'))
      && (await txt(M, '#g_ruri')) === B + '/api/v1/index.php?r=auth/google/callback' && (await txt(M, '#g_org')) === B, card);
    ok('kart: adım adım kurulum (Harici, Web uygulaması, yönlendirme, In production)', /console\.cloud\.google\.com/.test(card) && card.includes('Harici') && card.includes('Web uygulaması') && card.includes('In production'), card);
    ok('kart Entegrasyonlar sayfasında PayTR/Paraşüt kartlarıyla birlikte', (await txt(M, '.p3ent')).includes('Paraşüt'));
    await M.click('#gadm [data-act=g-test]');
    ok('Bağlantıyı test et → başarılı (Client tanındı)', await toast(M, /tanındı/) && (await txt(M, '#gadm')).includes('Bağlantı başarılı'));
    await shot(M, 'yonetim-entegrasyon-google');
    await M.uncheck('#g_on'); await M.click('#gadm .panel-f button.btn-primary');
    ok('kapatıldı (Secret boş bırakıldı → korunur)', await toast(M, 'Google ile giriş ayarları kaydedildi') && sq("SELECT secret FROM yp_settings WHERE k='google'") === '1');
    await M.waitForTimeout(300);
    ok('kart: Kapalı', (await txt(M, '#gadm')).includes('Kapalı'));
    const Z = await mk('ziyaretci-kapali'); await Z.goto(B + '/'); await ready(Z); await openLogin(Z);
    ok('kapatınca giriş penceresinde düğme yok', await Z.locator('#modal .gbtn').count() === 0);
    await M.check('#g_on'); await M.click('#gadm .panel-f button.btn-primary'); await toast(M, 'Google ile giriş ayarları kaydedildi');
    ok('yeniden açıldı; Secret korundu', phpApp('echo YP\\Google::cfg($db)["client_secret"];').trim() === SEC);
    await Z.goto(B + '/'); await ready(Z); await openLogin(Z);
    ok('açınca düğme geri geldi', await Z.locator('#modal .gbtn').count() === 1);

    /* ---------- 8. temiz adres kipi: kayıtlı Google hesabıyla giriş ---------- */
    await M.waitForTimeout(3000); // yönetici açılışındaki rewrite denetimi (seoProbe)
    for (let i = 0; i < 10 && sq("SELECT v FROM yp_settings WHERE k='seo'").indexOf('"ok":true') < 0; i++) { await Z.goto(B + '/metin2-pvp'); await sleep(300); }
    const Cn = await mk('temiz');
    await Cn.goto(B + '/metin2-pvp'); await ready(Cn);
    ok('temiz adres kipi etkin', await mode(Cn) === 'clean', await mode(Cn));
    await openLogin(Cn); await google(Cn, '#modal .gbtn');
    ok('temiz kip: Google ile giriş → oturum açık, toast', (await txt(Cn, '#hdr')).includes('Deniz_Kaya') && await toast(Cn, 'Google ile giriş yapıldı'));
    ok('temiz kip: dönüş adresi /metin2-pvp, gauth silindi', new URL(Cn.url()).pathname === '/metin2-pvp' && !/gauth/.test(Cn.url()), Cn.url());

    /* ---------- 9. e-posta eşleşmesi: şifreyle bir kez giriş ---------- */
    const E = await mk('eslesme');
    await E.goto(B + '/'); await ready(E); await openReg(E);
    const UE = { name: 'Esle_Oyuncu', email: 'esle.oyuncu@gmail.com', pw: 'Esle-Oyuncu-Sifre-1' };
    await E.fill('#rg_ad', 'Esle'); await E.fill('#rg_sy', 'Oyuncu'); await E.fill('#rg_u', UE.name); await E.fill('#rg_t', '0532 666 55 44'); await E.fill('#rg_e', UE.email); await E.fill('#rg_p', UE.pw); await E.check('#rg_k');
    await E.click('form[data-form=registerf] button.btn-primary'); await modalGone(E);
    await E.evaluate(() => ACT.logout()); await E.waitForTimeout(800);
    ident('800000000000000000008', UE.email, 'Esle', 'Oyuncu');
    await openLogin(E); await google(E, '#modal .gbtn');
    await E.waitForSelector('form[data-form=glinkf]', { timeout: 8000 });
    const lt = await tc(E, '#modal');
    ok('e-posta eşleşti → "Google hesabını bağla" (şifreyle bir kez giriş), oturum yok, bağlanmadı', lt.includes('Google hesabını bağla') && lt.includes(UE.email) && !(await txt(E, '#hdr')).includes(UE.name) && sq(`SELECT IFNULL(google_sub,'') FROM yp_users WHERE name='${UE.name}'`) === '', lt);
    await shotV(E, 'google-sifreyle-bagla');
    await E.fill('#gl_p', 'yanlis-sifre'); await E.click('form[data-form=glinkf] button.btn-primary');
    await E.waitForSelector('form[data-form=glinkf] .note-bad', { timeout: 8000 });
    ok('yanlış şifre → Türkçe hata, pencere açık', (await txt(E, '#modal')).includes('Şifre hatalı'));
    await E.fill('#gl_p', UE.pw); await E.click('form[data-form=glinkf] button.btn-primary');
    ok('doğru şifre → giriş + bağlandı', await modalGone(E) && (await txt(E, '#hdr')).includes(UE.name) && sq(`SELECT google_sub FROM yp_users WHERE name='${UE.name}'`) === '800000000000000000008');

    /* ---------- 10. 2FA: Google girişinde de kod adımı ---------- */
    rlReset();
    sqx(`UPDATE yp_users SET tfa='mail' WHERE name='${UE.name}'`);
    const T = await mk('tfa');
    await T.goto(B + '/'); await ready(T); await openLogin(T); await google(T, '#modal .gbtn');
    await T.waitForSelector('#tf_code', { timeout: 8000 });
    ok('2FA açık → kod penceresi (e-posta), oturum henüz yok', (await txt(T, '#modal')).includes('E-posta adresinize') && !(await txt(T, '#hdr')).includes(UE.name));
    await shotV(T, 'google-2fa-kod');
    const code6 = await otp(UE.email); await T.fill('#tf_code', code6 || ''); await T.click('form[data-form=tfaf] button.btn-primary');
    ok('kod doğru → giriş', await modalGone(T) && (await txt(T, '#hdr')).includes(UE.name));

    /* ---------- 11. hata iletileri ---------- */
    mock({ google: 'unverified' }); ident('900000000000000000009', 'dogrulanmamis@gmail.com', 'Yok', 'Dogrulama');
    const H = await mk('hata'); await H.goto(B + '/'); await ready(H); await openLogin(H); await google(H, '#modal .gbtn');
    ok('doğrulanmamış Google e-postası → Türkçe hata', await toast(H, 'e-posta adresi doğrulanmamış') && !/gauth/.test(H.url()));
    mock({ google: 'ok' });
    await openLogin(H); await google(H, '#modal .gbtn', '#g-no');
    ok('Google\'da vazgeçti → "iptal edildi"', await toast(H, 'iptal edildi'));

    /* ---------- 12. 390 px ---------- */
    const over = [];
    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await ready(P);
    for (const t of ['dark', 'light']) {
      await theme(P, t); await openLogin(P); await wide(P, 'giris-' + t, over); st = await btnStyle(P);
      ok(`390 px ${t}: düğme beyaz ve pencereye sığıyor`, st && st.bg === 'rgb(255, 255, 255)' && st.w > 200 && st.w <= 390, JSON.stringify(st));
      await shotV(P, 'giris-google-390-' + t);
      await openReg(P); await wide(P, 'uyelik-' + t, over); await shotV(P, 'uyelik-google-390-' + t);
    }
    await P.evaluate(() => closeModal()); await theme(P, 'dark');
    ident('110000000000000000011', 'mobil.oyuncu@gmail.com', 'Mobil', 'Oyuncu');
    await openReg(P); await google(P, '#modal .gbtn');
    await P.waitForSelector('form[data-form=gregf]'); await wide(P, 'google-kayit-formu', over); await shotV(P, 'google-kaydi-tamamla-390');
    await P.fill('#gr_t', '0533 111 00 99'); await P.check('#gr_k'); await P.click('form[data-form=gregf] button.btn-primary');
    ok('390 px: Google ile üyelik tamam', await modalGone(P) && await P.evaluate(() => !!(me() && me().gLinked)));
    await go(P, 'hesabim', 500); await P.click('#app [data-act=tab][data-t=profil]'); await P.waitForSelector('#gacc'); await wide(P, 'hesabim/profil', over); await shot(P, 'hesabim-google-390');
    const PM = await mk('yonetim-390', { width: 390, height: 844 });
    await PM.goto(B + '/'); await ready(PM); await login(PM, 'Yonetici', APW); await PM.waitForSelector('.admwrap');
    await go(PM, 'yonetim/entegrasyon', 600); await PM.waitForSelector('form#gadm'); await wide(PM, 'yonetim/entegrasyon', over); await shot(PM, 'yonetim-entegrasyon-google-390');
    await theme(PM, 'light'); await PM.waitForTimeout(200); await shot(PM, 'yonetim-entegrasyon-google-390-gunduz');
    ok('390 px: yatay taşma yok', over.length === 0, over.join(', '));
    ok('konsol / sayfa hatası yok', errs.length === 0, errs.slice(0, 8).join('\n      '));
  } catch (e) {
    ok('beklenmeyen hata: ' + (e && e.message || e), false, e && e.stack);
  } finally {
    await browser.close();
    srv.kill();
    const log = fs.existsSync(path.join(RUN, 'server.log')) ? fs.readFileSync(path.join(RUN, 'server.log'), 'utf8') : '';
    const phpErr = log.split('\n').filter(l => /PHP (Fatal|Warning|Parse|Notice|Deprecated)/.test(l));
    ok('sunucu günlüğünde PHP hatası yok', phpErr.length === 0, phpErr.slice(0, 5).join('\n'));
    const appErr = (fs.existsSync(path.join(SITE, 'storage/log')) ? fs.readdirSync(path.join(SITE, 'storage/log')) : []).map(f => fs.readFileSync(path.join(SITE, 'storage/log', f), 'utf8')).join('\n').split('\n').filter(l => /\[hata\]/.test(l));
    ok('uygulama günlüğünde [hata] yok', appErr.length === 0, appErr.slice(0, 5).join('\n'));
    console.log(`\nSONUÇ (Google ön yüz): ${PASS} geçti, ${FAIL} kaldı${FAIL ? ' → ' + fails.join(' | ') : ''}\nekran görüntüleri: ${SHOTS}`);
    if (process.env.KEEP === '1') console.log('çalışma klasörü: ' + RUN); else fs.rmSync(RUN, { recursive: true, force: true });
    process.exit(FAIL ? 1 : 0);
  }
})();
