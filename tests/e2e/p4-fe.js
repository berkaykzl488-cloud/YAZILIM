// P4 ön yüz uçtan uca testi (Yang Borsası + EP mağazası): CANLI PAKET (--prod --zip) geçici klasöre açılır, php -S + tests/http/router.php,
// YP_TEST=1 + SQLite. Kurulum sihirbazı arayüzden; üç oturum:
//   yönetici: Yönetim › Borsa › Kurlar (server ekle, fiyat, aç), EP mağazası (paket + kodlar);
//   satıcı C: Yang Borsası › kart › SAT penceresi (şifre gizli alan); alıcı B: kart › AL penceresi → Hesabım › Borsa işlemlerim (kartlar);
//   operatör ([borsa]): Siparişler › Aç → İşlemi üstlen → Eşle → Şifreleri göster (kayda geçer) → teslimatı kaydet → Tamamlandı;
//   B: Metin2 EP › Hemen al → kod ekranda ve EP kodlarım'da. Konsol/sayfa hatası yok, 390 px taşma yok, gece + gündüz teması.
//   Üye rotalarına uygulamanın go()/route() işlevleriyle gidilir (temiz adres kipi); yönetim rotaları #yonetim/… ile.
//   Tüm API istekleri /api/v1/index.php?r= biçiminde.
//
//   node tests/e2e/p4-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const MOB = require('./_mobile');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p4fe-'));
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
const CODES = ['EPTEST-AAAA-1111', 'EPTEST-BBBB-2222'];

/* ---------- 1. paket ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
ok('derleme: kurulum zip\'i ve kurulum kodu', !!CODE && !!ZIP, out);
unzip(path.join(BUILD, ZIP), SITE);
ok('pakette P4 dosyaları var', ['assets/js/prod/97p4-ex.js', 'assets/js/prod/98p4-actions.js', 'app/routes/82_exchange.php', 'app/routes/83_ep.php', 'app/schema/50_exchange.php', 'app/src/Exchange/Engine.php', 'app/migrations/0005_exchange_seed.php'].every(f => fs.existsSync(path.join(SITE, f))));
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));

/* ---------- 2. sunucu ---------- */
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [], badApi = [], apiReq = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    page.on('request', r => { const u = r.url(); if (!u.startsWith(B)) return; const p = u.slice(B.length);
      if (/^\/api\/v1(\/|\?|$)/.test(p)) { apiReq.push(r.method() + ' ' + p); if (!/^\/api\/v1\/index\.php\?r=/.test(p)) badApi.push(`[${name}] ${r.method()} ${p}`); } });
    return page;
  };
  const shot = (p, n, full) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: full !== false });
  /* üye rotaları: uygulamanın go() işlevi (temiz adres kipinde de doğru); yönetim: #yonetim/… */
  const nav = async (p, r, w) => { await p.evaluate(x => go(x), r); await p.waitForTimeout(w || 500); };
  const adm = async (p, h, w) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(w || 600); };
  const rt = p => p.evaluate(() => route());
  const txt = (p, s) => p.locator(s || 'body').first().textContent();
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 10000 }); return true; } catch (e) { return false; } };
  const overW = p => p.evaluate(() => document.documentElement.scrollWidth);
  const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const pcall = (p, m, path_, body) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code, http: e.http })), [m, path_, body]);
  const cfm = async (p) => { await p.waitForSelector('#cfm:not([hidden])', { timeout: 5000 }); await p.click('#cfm_ok'); };
  const uid = n => sq(`SELECT id FROM yp_users WHERE name='${n}'`);
  const wal = n => sq(`SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=(SELECT id FROM yp_users WHERE name='${n}')`);

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
    await K.fill('#sn', 'Yang P4 Test'); await K.fill('#su', B); await K.click('button:has-text("Kaydet ve devam et")');
    const APW = 'Yonetici-Sifre-2026';
    await K.fill('#an', 'Yonetici'); await K.fill('#ae', 'admin@yangpazar.com'); await K.fill('#ap', APW); await K.fill('#ap2', APW);
    await K.click('button:has-text("Yöneticiyi oluştur")');
    await K.click('button:has-text("Kurulumu bitir")');
    ok('kurulum tamamlandı (arayüzden)', /Kurulum tamamlandı/.test(await txt(K)));
    await K.context().close();
    ok('göç 0005: borsa alanları ve ayarları', sq("SELECT COUNT(*) FROM yp_ex_fields") === '7' && sq("SELECT version FROM yp_schema_migrations WHERE version='m:0005_exchange_seed'") !== '');

    /* ---------- 4. yönetici: borsa kurları ---------- */
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap'); ok('yönetici girişi', /#yonetim/.test(M.url()));
    const SV = sq("SELECT 'sv'||id FROM yp_servers WHERE sec='pvp' ORDER BY id LIMIT 1"), SVN = sq(`SELECT name FROM yp_servers WHERE id=${SV.slice(2)}`);
    await adm(M, 'yonetim/borsa/kurlar', 1000);
    ok('Kurlar: "Yakında" yok, kur formu ve bildirim ayarları', !(await txt(M, '.apage')).includes('çok yakında') && await M.locator('form[data-form=exrates]').count() === 1 && await M.locator('form[data-form=p4notify]').count() === 1);
    await M.evaluate(() => document.querySelector('details.adet').open = true);
    await M.selectOption('#xa_sec', 'pvp'); await M.waitForTimeout(150); await M.selectOption('#xa_srv', SV);
    await M.click('form[data-form=xradd] button.btn-primary');
    ok('server borsaya eklendi', await toast(M, 'borsaya eklendi') && await until(M, () => document.querySelectorAll('form[data-form=exrates] tbody tr').length === 1));
    const X1 = await M.evaluate(() => S.exchange[0].id);
    await M.check('#xr_on_' + X1); await M.fill('#xr_bp_' + X1, '12.5'); await M.fill('#xr_mx_' + X1, '10'); await M.fill('#xr_u_' + X1, '100M');
    await M.click('form[data-form=exrates] .asave button, form[data-form=exrates] button.btn-primary');
    ok('kurlar kaydedildi: açık, 12,50 TL', await toast(M, 'Borsa fiyatları kaydedildi') && sq(`SELECT buy||'/'||is_on FROM yp_ex_markets WHERE id=${X1.slice(1)}`) === '1250/1');
    await shot(M, '01-yonetim-borsa-kurlar');
    await adm(M, 'yonetim/borsa/alanlar', 900);
    ok('Bilgi alanları: alım 1, satış 6 (sunucudan)', await M.locator('form[data-form=exfields][data-set=exFieldsBuy] .fieldrow').count() === 1 && await M.locator('form[data-form=exfields][data-set=exFields] .fieldrow').count() === 6);
    await shot(M, '02-yonetim-borsa-alanlar');
    /* çalışanlar ve bakiyeler (API) */
    const st = await pcall(M, 'POST', 'admin/staff', { name: 'Operator', email: 'op@yangpazar.com', ad: 'Oper', soyad: 'Atör', password: 'Calisan-Sifre-9', perms: ['borsa'] });
    ok('[borsa] operatör oluşturuldu', !st.err, JSON.stringify(st));

    /* ---------- 5. satıcı C: siteye sat ---------- */
    const C = await mk('satici-C'); await C.goto(B + '/'); await C.waitForSelector('#hdr');
    const rc = await pcall(C, 'POST', 'auth/register', { name: 'Satici_Cem', email: 'cem@ornek.com', tel: '0555 111 22 13', ad: 'Cem', soyad: 'Satıcı', password: 'Cem-Sifre-2026' });
    ok('C üye oldu', rc && rc.me && rc.me.id, JSON.stringify(rc)); await C.evaluate(() => apiReboot(true));
    await nav(C, 'borsa', 900);
    ok('Yang Borsası: "Yakında" değil, pazar listede, rota borsa', await rt(C) === 'borsa' && !(await txt(C, '#app')).includes('Yakında') && (await txt(C, '#bxGrid')).includes(SVN) && !(await C.locator('#app [data-act=ex-dir], #app form[data-form]').count()));
    await C.click(`#bxGrid .bx-card[data-id="${X1}"] [data-act=bx-sat]`); await C.waitForSelector('#modal form[data-form=exoffer]');
    await C.fill('#ex_qty', '20'); await C.fill('#ex_price', '9'); await C.click('#modal [data-foot="1"] [data-act=bx-step]'); await C.waitForSelector('#exf_f1', { state: 'visible' });
    await C.fill('#exf_f1', 'cem_hesap'); await C.fill('#exf_f2', PW); await C.fill('#exf_f3', 'CemKarakter');
    await C.selectOption('#exf_f6', 'Hemen'); await C.check('#ex_ok');
    await shot(C, '03-satici-siteye-sat');
    await C.click('#modal form[data-form=exoffer] button.exgo');
    ok('satış emri yayında (1. sıra)', await toast(C, 'Emriniz yayında') && sq("SELECT COUNT(*) FROM yp_ex_offers WHERE status='aktif'") === '1');
    ok('şifre tarayıcı belleğinde yok (maskeli), veritabanında şifreli', await C.evaluate(pw => !JSON.stringify(S).includes(pw), PW) && sq(`SELECT COUNT(*) FROM yp_ex_offer_fields WHERE value LIKE '%${PW}%' OR value_enc LIKE '%${PW}%'`) === '0');
    await until(C, () => /Satış emirlerim/.test(document.querySelector('#app').textContent) && document.querySelectorAll('#bxMine [data-act=of-cancel]').length > 0);
    await shot(C, '04-satici-emirlerim');

    /* ---------- 6. alıcı B: siteden satın al ---------- */
    const Bp = await mk('alici-B'); await Bp.goto(B + '/'); await Bp.waitForSelector('#hdr');
    const rb = await pcall(Bp, 'POST', 'auth/register', { name: 'Alici_Bora', email: 'bora@ornek.com', tel: '0555 111 22 14', ad: 'Bora', soyad: 'Alıcı', password: 'Bora-Sifre-2026' });
    ok('B üye oldu', rb && rb.me && rb.me.id);
    const f1 = await pcall(M, 'POST', 'admin/balance', { user: 'Alici_Bora', amount: 300, w: true, note: 'Havale (test)' });
    const f2 = await pcall(M, 'POST', 'admin/balance', { user: 'Alici_Bora', amount: 100, w: false, note: 'Kart yüklemesi (test)' });
    ok('B: 300 çekilebilir + 100 alışveriş', !f1.err && !f2.err && wal('Alici_Bora') === '30000/10000');
    await Bp.evaluate(() => apiReboot(true)); await nav(Bp, 'borsa', 900);
    ok('satış sırası: satıcı maskeli (Sa***), stok 20', (await txt(Bp, `#bxGrid .bx-card[data-id="${X1}"]`)).includes('Satışta 20') && await Bp.evaluate(() => S.exOffers.every(o => String(o.u).startsWith('xs'))));
    await Bp.click(`#bxGrid .bx-card[data-id="${X1}"] [data-act=bx-al]`); await Bp.waitForSelector('#modal form[data-form=exorder]');
    await Bp.fill('#ex_qty', '20'); await Bp.dispatchEvent('#ex_qty', 'input'); await Bp.fill('#exb_b1', 'BoraKarakter');
    ok('tutar özeti: 20 × 12,50 = 250', (await txt(Bp, '#ex_tot')).replace(/\s/g, '').includes('250,00'));
    await shot(Bp, '05-alici-siteden-al');
    await Bp.click('#modal form[data-form=exorder] button.exgo');
    ok('sipariş sıraya alındı → Hesabım › Borsa işlemlerim', await toast(Bp, 'sıraya alındı') && await until(Bp, () => route() === 'hesabim' && /Alımlarım/.test(document.querySelector('#app').textContent) && /B1001/.test(document.querySelector('#app').textContent)));
    ok('ödeme: önce 100 kredi, sonra 150 nakit (çekilebilir korunur)', wal('Alici_Bora') === '15000/0' && sq("SELECT paid_credit||'/'||paid_cash FROM yp_ex_orders WHERE id=1") === '10000/15000');
    await shot(Bp, '06-alici-borsa-islemlerim');

    /* ---------- 7. operatör: üstlen, eşle, şifre (audit), teslim, tamam ---------- */
    const O = await mk('operator'); await O.goto(B + '/'); await O.waitForSelector('#hdr [data-act=login]'); await login(O, 'Operator', 'Calisan-Sifre-9');
    await modalGone(O); await O.waitForSelector('#hdr [data-act=logout], #hdr .ubtn, #hdr a[href="#yonetim"]', { timeout: 8000 }).catch(() => {});
    await adm(O, 'yonetim/borsa/siparisler', 1200); await O.waitForSelector('.admwrap');
    ok('operatör: Borsa siparişleri listesinde #B1001, alıcı adı soyadı', (await txt(O, '.apage')).includes('B1001') && (await txt(O, '.apage')).includes('Bora Alıcı'));
    ok('nav rozeti: 1 açık borsa siparişi', await until(O, () => { const a = document.querySelector('.asb a[data-t=borsa] .nb'); return !!a && a.textContent.trim() === '1'; }, null, 6000));
    await shot(O, '07-operator-siparisler');
    await O.click('.apage [data-act=ex-open][data-id=B1001]');
    await O.waitForSelector('.exd'); await O.waitForTimeout(500);
    ok('sipariş ayrıntısı: eşleme havuzunda C emri, şifre gizli', (await txt(O, '.exd')).includes('9,00') && !(await O.content()).includes(PW));
    await O.click('.exd [data-act=ex-claim]');
    ok('işlem üstlenildi', await toast(O, 'üstlendiniz') && sq('SELECT status FROM yp_ex_orders WHERE id=1') === 'islemde');
    await O.waitForSelector('.exd .pairbox [data-act=ex-pair]'); await O.fill('.exd .pairbox input[id^=pq_]', '20');
    await O.click('.exd .pairbox [data-act=ex-pair]');
    ok('20 adet eşlendi', await toast(O, 'eşlendi') && sq('SELECT SUM(qty) FROM yp_ex_fills WHERE order_id=1') === '20');
    const na = sq("SELECT COUNT(*) FROM yp_audit_log WHERE action='ex_reveal'");
    await O.waitForSelector('.exd [data-act=reveal]'); await O.click('.exd [data-act=reveal]');
    ok('Şifreleri göster: şifre görünür, gösterim kayda geçti', await until(O, pw => document.querySelector('.exd').textContent.includes(pw), PW) && +sq("SELECT COUNT(*) FROM yp_audit_log WHERE action='ex_reveal'") === +na + 1);
    await shot(O, '08-operator-siparis-ayrinti');
    await O.click('.exd [data-act=reveal]');
    ok('gizle: şifre bellekten silindi', await until(O, pw => !document.querySelector('.exd').textContent.includes(pw) && !JSON.stringify(S).includes(pw), PW));
    await O.fill('.exd #excall_msg', 'Teslimat için hazırız, Mavi bayrağa gelin.'); await O.click('form[data-form=excall] button');
    ok('alıcı çağrıldı', await toast(O, /Alıcıya bildirim/));
    /* teslim formu: yoklama/yeniden yükleme formu yeniden çizebilir → doldur + gönder, yanıt gelmezse bir kez daha */
    const dlv = async (q, re) => { for (let i = 0; i < 3; i++) { await O.waitForSelector('#exdq'); await O.fill('#exdq', q); await O.click('form[data-form=exst] button.btn-ok'); if (await toast(O, re, 4000)) return true; } return false; };
    const tk = await dlv('8', 'Kısmi teslim');
    ok('kısmi teslim 8/20 → Kısmen teslim edildi, C\'ye 72 TL', tk && await until(O, () => /Kısmen teslim/.test(document.querySelector('.apage').textContent)) && sq('SELECT status FROM yp_ex_orders WHERE id=1') === 'kismen' && sq(`SELECT cash FROM yp_wallets WHERE user_id=${uid('Satici_Cem')}`) === '7200',
      tk + ' ' + sq('SELECT status||delivered FROM yp_ex_orders WHERE id=1') + ' ' + sq(`SELECT cash FROM yp_wallets WHERE user_id=${uid('Satici_Cem')}`) + ' ' + await O.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent).join('|')));
    ok('tam teslim → Tamamlandı; satıcıya 180 TL, borsa kârı 70 TL, havuz 0', await dlv('20', 'Sipariş tamamlandı') && sq('SELECT status FROM yp_ex_orders WHERE id=1') === 'tamam' && sq(`SELECT cash FROM yp_wallets WHERE user_id=${uid('Satici_Cem')}`) === '18000'
      && sq("SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='REV:borsa'") === '7000' && sq("SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='ESCROW:EX'") === '0');
    ok('bittikten sonra gizli bilgiler silindi (tamamı satılan emir + sipariş)', sq('SELECT COUNT(*) FROM yp_ex_offer_fields WHERE value_enc IS NOT NULL') === '0');
    await until(O, () => /Tamamlandı/.test(document.querySelector('.apage').textContent));
    await shot(O, '09-operator-tamamlandi');

    /* ---------- 8. B: çağrı notu, durum yansıması ---------- */
    await nav(Bp, 'home', 300); await nav(Bp, 'hesabim', 300); await Bp.click('#app [data-act=tab][data-t=borsa]');
    ok('B: Borsa işlemlerim → Tamamlandı, işlem geçmişi', await until(Bp, () => /Tamamlandı/.test(document.querySelector('#app').textContent) && /Gizli hesap bilgileri sistemden silindi|teslim etti/.test(document.querySelector('#app').textContent)));
    ok('B: bildirimlerde teslim mesajı', await Bp.evaluate(() => S.notifs.some(n => /Yang karakterinize teslim edildi/.test(n.x))) || sq(`SELECT COUNT(*) FROM yp_notifications WHERE user_id=${uid('Alici_Bora')} AND x LIKE '%teslim edildi%'`) !== '0');
    await shot(Bp, '10-alici-tamamlandi');

    /* ---------- 9. yönetici: EP paketi + kodlar ---------- */
    await adm(M, 'yonetim/ep/paketler', 1000);
    ok('EP mağazası yönetimi: "Yakında" yok, paket formu', !(await txt(M, '.apage')).includes('çok yakında') && await M.locator('form[data-form=epadd]').count() === 1);
    await M.evaluate(() => { const d = document.querySelector('form[data-form=epadd]').closest('details'); if (d) d.open = true; });
    await M.selectOption('#en_g', ''); await M.fill('#en_e', '1000'); await M.fill('#en_p', '45'); await M.fill('#en_c', CODES.join('\n') + '\n' + CODES[0]);
    await M.click('form[data-form=epadd] button.btn-primary');
    ok('paket eklendi: 2 kod stokta (tekrar sayılmadı)', await toast(M, 'paketi eklendi') && await until(M, () => /2 kod stokta/.test(document.querySelector('.apage').textContent)));
    ok('yönetim görünümünde kodlar maskeli', !(await M.content()).includes(CODES[0]) && !(await M.evaluate(c => JSON.stringify(S).includes(c), CODES[0])));
    await M.evaluate(() => document.querySelectorAll('details.epgrp').forEach(d => d.open = true));
    await shot(M, '11-yonetim-ep-paket');

    /* ---------- 10. B: EP satın alma → kod ---------- */
    await nav(Bp, 'metin2-ep', 1000);
    ok('Metin2 EP: "Yakında" yok, paket kartı (2 kod stokta)', await rt(Bp) === 'metin2-ep' && !(await txt(Bp, '#app')).includes('Yakında') && await until(Bp, () => /2 kod stokta/.test(document.querySelector('#app .epgrid').textContent)));
    await shot(Bp, '12-metin2-ep');
    await Bp.click('#app .epgrid [data-act=ep-buy]'); await Bp.waitForSelector('#modal form[data-form=epbuy]');
    await Bp.click('#modal form[data-form=epbuy] button.btn-primary');
    ok('kod ekranda: ilk stok kodu', await until(Bp, c => { const m = document.querySelector('#modal'); return m && m.textContent.includes(c); }, CODES[0]));
    ok('ödeme: 45 TL nakitten (kredi yok), REV:ep 45', wal('Alici_Bora') === '10500/0' && sq("SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='REV:ep'") === '4500');
    await shot(Bp, '13-ep-kod-hazir', false);
    await Bp.click('#modal [data-act=close]'); await modalGone(Bp);
    await nav(Bp, 'hesabim', 300); await Bp.click('#app [data-act=tab][data-t=ep]');
    ok('Hesabım › EP kodlarım: kod ve kopyala', await until(Bp, c => document.querySelector('#app').textContent.includes(c), CODES[0]) && await Bp.locator('#app [data-act=copy]').count() === 1);
    await shot(Bp, '14-ep-kodlarim');
    await adm(M, 'yonetim/ep/kayitlar', 1000);
    ok('EP kod kayıtları: kod maskeli, "Göster" ile açılır (kayda geçer)', !(await txt(M, '.apage')).includes(CODES[0]) && await M.locator('[data-act=p4-epcode]').count() === 1);
    await M.click('[data-act=p4-epcode]');
    ok('kod açıldı, audit', await until(M, c => document.querySelector('.apage').textContent.includes(c), CODES[0]) && sq("SELECT COUNT(*) FROM yp_audit_log WHERE action='ep_code_reveal'") === '1');
    await shot(M, '15-yonetim-ep-kayitlar');

    /* ---------- 11. borsayı kapat / aç (yönetici) ---------- */
    await adm(M, 'yonetim/borsa/siparisler', 1000);
    await M.click('.apage [data-act=ex-power]'); await cfm(M);
    ok('borsa kapatıldı', await toast(M, 'Borsa kapatıldı') && await M.evaluate(() => S.set.exOn === false));
    await nav(Bp, 'borsa', 900);
    ok('üye: "Kısa bir moladayız" sayfası', (await txt(Bp, '#app')).includes('Kısa bir moladayız'));
    await shot(Bp, '16-borsa-kapali');
    await M.click('.apage [data-act=ex-power]');
    ok('borsa açıldı', await toast(M, 'Borsa açıldı') && sq("SELECT v FROM yp_settings WHERE k='ex'").includes('"exOn":true'));

    /* ---------- 12. tema + 390 px ---------- */
    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await P.waitForSelector('#hdr'); await login(P, 'Alici_Bora', 'Bora-Sifre-2026'); await modalGone(P);
    const over = []; const chk = async n => { const w = await overW(P); if (w > 390) over.push(n + ':' + w); };
    const mobileMember = async (sfx) => { await nav(P, 'borsa', 900); await chk('borsa' + sfx); await shot(P, 'm-borsa' + sfx);
      { const closeSat = await MOB.exSat(P); await P.waitForTimeout(300); await chk('borsa-sat' + sfx); await closeSat(); }
      await nav(P, 'metin2-ep', 700); await chk('metin2-ep' + sfx); await shot(P, 'm-metin2-ep' + sfx);
      await nav(P, 'hesabim', 400); await MOB.hsTab(P, 'borsa', 700); await chk('hesabim-borsa' + sfx); await shot(P, 'm-hesabim-borsa' + sfx);
      await MOB.hsTab(P, 'ep', 600); await chk('hesabim-ep' + sfx); };
    await mobileMember('');
    await P.evaluate(() => document.querySelector('#hdr [data-act=theme]').click()); await P.waitForTimeout(200);
    ok('tema değişti (gündüz/gece)', ['light', 'dark'].includes(await P.evaluate(() => document.documentElement.dataset.theme)));
    await mobileMember('-tema2');
    await P.evaluate(() => document.querySelector('#hdr [data-act=theme]').click());
    await nav(P, 'hesabim', 300); await MOB.hsLogout(P); await toast(P, 'Çıkış yapıldı');
    await login(P, 'Yonetici', APW); await modalGone(P);
    for (const r of ['yonetim/borsa/siparisler', 'yonetim/borsa/siparisler?id=B1001', 'yonetim/borsa/emirler', 'yonetim/borsa/kurlar', 'yonetim/borsa/alanlar', 'yonetim/ep/paketler', 'yonetim/ep/kayitlar', 'yonetim/ep/happy-hour']) { await adm(P, r, 900); await chk(r); }
    await adm(P, 'yonetim/borsa/siparisler?id=B1001', 900); await shot(P, 'm-yonetim-borsa-ayrinti');
    await P.evaluate(() => [...document.querySelectorAll('[data-act=theme]')].find(b => b.offsetParent).click()); await P.waitForTimeout(200);
    for (const r of ['yonetim/borsa/kurlar', 'yonetim/ep/paketler']) { await adm(P, r, 900); await chk(r + '-tema2'); }
    await shot(P, 'm-yonetim-ep-tema2');
    ok('390 px: yatay taşma yok (üye + yönetim, iki tema)', over.length === 0, over.join(', '));
    await adm(M, 'yonetim/borsa/emirler', 900); await M.evaluate(() => [...document.querySelectorAll('[data-act=theme]')].find(b => b.offsetParent).click()); await M.waitForTimeout(300);
    await shot(M, '17-yonetim-satis-emirleri-tema2');

    /* ---------- 13. API adresleri, hatalar ---------- */
    ok('tüm API istekleri /api/v1/index.php?r= biçiminde', badApi.length === 0 && apiReq.length > 40, badApi.slice(0, 5).join(' | ') + ` (toplam ${apiReq.length})`);
    ok('defter tutarlı (postings toplamı 0, borsa havuzu = siparişler)', sq('SELECT COALESCE(SUM(amount),0) FROM yp_postings') === '0' && sq("SELECT COALESCE(SUM(total-released),0) FROM yp_ex_orders") === sq("SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='ESCROW:EX'"));
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
