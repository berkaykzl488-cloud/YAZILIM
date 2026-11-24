// P3 ön yüz uçtan uca testi (para çekme, TC kimlik, e-Gider Pusulası, muhasebe, Entegrasyonlar): CANLI PAKET (--prod --zip --update-zip)
// geçici klasöre açılır, php -S + tests/http/router.php, YP_TEST=1 + SQLite; NVİ / muhasebe / PayTR testi storage/test_mock.json ile sahte.
//   Kurulum sihirbazı arayüzden; üye B: Hesabım › Para çek → "Kimliğimi doğrula" (NVİ sahte başarılı) → çekim talebi (yeni IBAN, net tutar),
//   çekilebilirden fazla tutar uyarısı; yönetici: Para çekme tablosu (demo tasarımı), "📋 Açıklamayı Kopyala" / IBAN / Net kopyalama
//   (pano içeriği ve window.ypLastCopy), "Gönderildi & Pusula Kes" → belge no, pusula görünümünde TAM T.C. kimlik no (yalnız yönetim),
//   red (gerekçe) → iade; üye ekranlarında gider / pusula / VUK / ETTN geçmez; üye pusula API'sine erişemez;
//   Entegrasyonlar: PayTR kaydet → maskeli görünüm, gizli alanlar boş (eski değer korunur), "Bağlantıyı test et"; Muhasebe sayfası.
//   Tüm API istekleri /api/v1/index.php?r= biçiminde. Konsol/sayfa hatası yok, 390 px taşma yok, gece + gündüz teması.
//
//   node tests/e2e/p3-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const MOB = require('./_mobile');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p3fe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || path.join(RUN, 'shots');
const PORT = +(process.env.PORT || 18900 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const zipList = z => sh('php', ['-r', '$z=new ZipArchive; $z->open($argv[1]); for($i=0;$i<$z->numFiles;$i++) echo $z->getNameIndex($i),"\\n";', z]).split('\n').filter(Boolean);
const unzip = (z, to) => sh('php', ['-r', '$z=new ZipArchive; if($z->open($argv[1])!==true) exit(1); $z->extractTo($argv[2]); $z->close();', z, to]);
const DBF = () => path.join(SITE, 'storage/test.sqlite');
const sq = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $s=$p->query($argv[2]); $v=$s?$s->fetchColumn():false; echo $v===false?"":$v;', DBF(), sql]).trim();
const BANNED = /gider|pusula|VUK|ETTN/i;
const TC = '10000000146', IBAN = 'TR330006100519786457841326';

/* ---------- 1. paket ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--update-zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
const UZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-guncelleme-.*\.zip$/.test(f));
const VER = (fs.readFileSync(path.join(REPO, 'app/bootstrap.php'), 'utf8').match(/YP_APP_VERSION', '([^']+)'/) || [])[1];
ok('derleme: kurulum zip\'i, kurulum kodu ve güncelleme zip\'i (' + VER + ')', !!CODE && !!ZIP && !!VER && (UZIP || '').includes('-' + VER + '.zip'), out);
const ulist = zipList(path.join(BUILD, UZIP));
ok('güncelleme zip\'i: P3 ön yüz ve rotaları var; storage/, test kancası, demo yok',
  ['assets/js/prod/97p3-wd.js', 'assets/js/prod/98p3-actions.js', 'app/routes/70_withdraw.php', 'app/routes/75_accounting.php', 'app/routes/80_integrations.php', 'app/schema/40_withdraw.php', 'api/paytr_bildirim.php'].every(f => ulist.includes(f))
  && !ulist.some(f => /^storage(\/|$)/.test(f) || f === 'app/routes/90_test.php' || /assets\/js\/demo\//.test(f) || /^api\/data\/(?!$|\.htaccess$|index\.php$)/.test(f)), ulist.filter(f => /p3|storage|90_test|api\/data/.test(f)).join(','));
unzip(path.join(BUILD, ZIP), SITE);
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));

/* ---------- 2. sunucu ---------- */
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const mock = o => fs.writeFileSync(path.join(SITE, 'storage/test_mock.json'), JSON.stringify(o));

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [], badApi = [], apiReq = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
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
  const go = async (p, h, w) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(w || 400); };
  const txt = (p, s) => p.locator(s || 'body').first().textContent();
  const vis = p => p.evaluate(() => { const a = document.querySelector('#app'); return (a ? a.innerText : '') + '\n' + document.querySelector('#hdr').innerText + '\n' + [...document.querySelectorAll('#modal, #toasts')].map(x => x.innerText).join('\n') + '\n' + (a ? [...a.querySelectorAll('[data-v],[title],[placeholder],[aria-label]')].map(x => [x.dataset.v, x.title, x.placeholder, x.getAttribute('aria-label')].join(' ')).join(' ') : ''); });
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 10000 }); return true; } catch (e) { return false; } };
  const overW = p => p.evaluate(() => document.documentElement.scrollWidth);
  const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const register = async (p, U) => { await p.click('#hdr [data-act=register]'); await p.fill('#rg_ad', U.ad); await p.fill('#rg_sy', U.soyad); await p.fill('#rg_u', U.name); await p.fill('#rg_t', U.tel); await p.fill('#rg_e', U.email); await p.fill('#rg_p', U.pw); await p.check('#rg_k'); await p.click('form[data-form=registerf] button.btn-primary'); return modalGone(p); };
  const pcall = (p, m, path_, body) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code, http: e.http })), [m, path_, body]);
  const cfm = async (p) => { await p.waitForSelector('#cfm:not([hidden])', { timeout: 5000 }); await p.click('#cfm_ok'); };
  const cekTab = async p => { await go(p, 'hesabim', 300); await MOB.hsTab(p, 'cek', 700); };
  const banScan = async (p, where) => { const t = await vis(p); const m = t.match(BANNED); return m ? where + ': "' + t.slice(Math.max(0, m.index - 40), m.index + 40) + '"' : null; };

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
    await K.fill('#sn', 'Yang P3 Test'); await K.fill('#su', B); await K.click('button:has-text("Kaydet ve devam et")');
    const APW = 'Yonetici-Sifre-2026';
    await K.fill('#an', 'Yonetici'); await K.fill('#ae', 'admin@yangpazar.com'); await K.fill('#ap', APW); await K.fill('#ap2', APW);
    await K.click('button:has-text("Yöneticiyi oluştur")');
    await K.click('button:has-text("Kurulumu bitir")');
    ok('kurulum tamamlandı (arayüzden)', /Kurulum tamamlandı/.test(await txt(K)));
    await K.context().close();
    mock({ nvi: 'ok', acct: 'ok', paytr: 'ok' });

    /* ---------- 4. üye + yönetici ---------- */
    const Bp = await mk('uye-B'); await Bp.goto(B + '/'); await Bp.waitForSelector('#hdr [data-act=register]');
    const UB = { name: 'Cekici_Bora', email: 'bora@ornek.com', tel: '0544 222 33 44', ad: 'Bora', soyad: 'Alıcı', pw: 'Bora-Sifre-2026' };
    ok('B üye oldu', await register(Bp, UB) && (await txt(Bp, '#hdr')).includes(UB.name));
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap'); ok('yönetici girişi', /#yonetim/.test(M.url()));
    const f1 = await pcall(M, 'POST', 'admin/balance', { user: UB.name, amount: 500, w: true, note: 'Satış geliri (test)' });
    const f2 = await pcall(M, 'POST', 'admin/balance', { user: UB.name, amount: 200, w: false, note: 'Kart yüklemesi (test)' });
    ok('B: 500 çekilebilir + 200 yalnız alışveriş', !f1.err && !f2.err && sq(`SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=(SELECT id FROM yp_users WHERE name='${UB.name}')`) === '50000/20000');
    await Bp.reload(); await Bp.waitForSelector('#hdr');

    /* ---------- 5. B: kimlik doğrulama (NVİ sahte) ---------- */
    await cekTab(Bp);
    ok('Para çek sekmesi: "yakında" yok, kimlik kapısı görünür', !(await txt(Bp, '#app')).includes('çok yakında') && await Bp.locator('#app .tcgate [data-act=tc-open]').count() === 1);
    await shot(Bp, 'uye-para-cek-kimlik');
    await Bp.click('#app .tcgate [data-act=tc-open]'); await Bp.waitForSelector('#modal form[data-form=tcf]');
    await Bp.fill('#tc_no', TC); await Bp.fill('#tc_dt', '1990-05-05');
    await shot(Bp, 'uye-tc-pencere', false);
    await Bp.click('#modal #tcBtn');
    ok('TC doğrulandı (NVİ sahte): toast + çekim formu', await toast(Bp, 'Kimliğiniz doğrulandı') && await until(Bp, () => !!document.querySelector('#app form[data-form=withdraw]')));
    ok('üye kaydı: maske var, tam numara tarayıcıda yok', await Bp.evaluate(tc => { const u = me(); return u.tc.ok && u.tc.mask === '100******46' && !JSON.stringify(S).includes(tc); }, TC));

    /* ---------- 6. B: çekim talebi ---------- */
    await Bp.fill('#w_amt', '600'); await Bp.click('#app form[data-form=withdraw] button.btn-primary');
    ok('çekilebilirden fazla tutar → uyarı (kart bakiyesi çekilemez)', await toast(Bp, 'Kart, mobil ödeme'));
    await Bp.selectOption('#w_bank', { index: 1 });
    ok('hesap sahibi adı üyenin adıyla dolu', (await Bp.inputValue('#w_name')) === 'Bora Alıcı');
    await Bp.fill('#w_iban', 'TR33 0006 1005 1978 6457 8413 26'); await Bp.fill('#w_amt', '150'); await Bp.dispatchEvent('#w_amt', 'change'); await Bp.waitForTimeout(150);
    ok('özet: net tutar (ücretsiz)', (await txt(Bp, '#wd_n')).replace(/\s/g, '').includes('150,00'));
    await Bp.click('#app form[data-form=withdraw] button.btn-primary');
    ok('talep alındı: toast + "Çekim taleplerim" satırı', await toast(Bp, 'Çekim talebiniz alındı') && await until(Bp, () => { const t = document.querySelector('#userWdTbl'); return t && /Bekliyor/.test(t.textContent); }));
    ok('bakiye 150 düştü, IBAN kaydedildi (maskeli)', sq(`SELECT cash FROM yp_wallets WHERE user_id=(SELECT id FROM yp_users WHERE name='${UB.name}')`) === '35000' && sq('SELECT COUNT(*) FROM yp_user_ibans') === '1');
    await shot(Bp, 'uye-cekim-talebi');
    await Bp.reload(); await cekTab(Bp);
    await Bp.fill('#w_amt', '60'); await Bp.click('#app form[data-form=withdraw] button.btn-primary');
    ok('kayıtlı IBAN ile ikinci talep', await toast(Bp, 'Çekim talebiniz alındı') && await until(Bp, () => document.querySelectorAll('#userWdTbl tbody tr').length === 2));
    const noEgp = await pcall(Bp, 'GET', 'admin/withdrawals/w1/egp');
    ok('üye pusula API\'sine erişemez (403)', noEgp.http === 403);

    /* ---------- 7. yönetici: tablo, kopyalama, onay ---------- */
    await go(M, 'yonetim/cekim/talepler', 900); await M.waitForSelector('.wdtbl tbody tr');
    const head = await M.locator('.wdtbl thead').innerText();
    ok('tablo sütunları: Tarih, Üye, Banka & Hesap Sahibi, IBAN, Durum & e-Gider Pusulası, Gönderilecek Net, Mal / Hizmet Açıklaması, İşlem',
      ['Tarih', 'Üye', 'Banka & Hesap Sahibi', 'IBAN', 'Durum & e-Gider Pusulası', 'Gönderilecek Net', 'Mal / Hizmet Açıklaması', 'İşlem'].every(h => head.toLocaleLowerCase('tr-TR').includes(h.toLocaleLowerCase('tr-TR'))), head);
    ok('iki bekleyen talep, tam IBAN görünür', await M.locator('.wdtbl tbody tr.pend').count() === 2 && (await txt(M, '.wdtbl')).includes('TR33 0006'));
    const row = M.locator('.wdtbl tbody tr.pend').first();
    const descBtn = row.locator('button.cpy.big'); ok('görünür "📋 Açıklamayı Kopyala" düğmesi', await descBtn.isVisible() && (await descBtn.textContent()).includes('Açıklamayı Kopyala'));
    const wantDesc = await descBtn.getAttribute('data-v');
    await descBtn.click(); await M.waitForTimeout(300);
    const clip = await M.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    const last = await M.evaluate(() => window.ypLastCopy);
    ok('tek tıkla tüm açıklama kopyalandı (pano + kanca)', last === wantDesc && clip === wantDesc && /VUK Md\. 234/.test(wantDesc) && wantDesc.includes('TR33 0006'), clip + ' | ' + last);
    ok('düğme "Kopyalandı" oldu', (await row.locator('button.cpy.big').textContent()).includes('Kopyalandı'));
    await row.locator('button.cpy[data-ck$=":iban"]').click(); await M.waitForTimeout(200);
    ok('IBAN kopyalama: boşluksuz tam IBAN', (await M.evaluate(() => window.ypLastCopy)) === IBAN);
    await row.locator('button.cpy[data-ck$=":net"]').click(); await M.waitForTimeout(200);
    ok('Net kopyalama: virgüllü tutar', /^(150|60),00$/.test(await M.evaluate(() => window.ypLastCopy)));
    await shot(M, 'yonetim-cekim-talepler');
    const firstId = await row.locator('[data-act=wd-ok]').getAttribute('data-id');
    await row.locator('[data-act=wd-ok]').click(); await cfm(M);
    ok('"Gönderildi & Pusula Kes": belge kesildi', await toast(M, 'e-Gider Pusulası kesildi'));
    const no = sq(`SELECT egp_no FROM yp_withdrawals WHERE id=${firstId.slice(1)}`);
    ok('belge no YGP' + new Date().getFullYear() + '000000001', no === 'YGP' + new Date().getFullYear() + '000000001', no);
    await go(M, 'yonetim/cekim/talepler?f=tumu', 900);
    ok('tabloda belge rozeti', await until(M, n => document.querySelector('.wdtbl') && document.querySelector('.wdtbl').textContent.includes(n), no));
    await M.locator(`.wdtbl [data-act=egp-view][data-id=${firstId}]`).first().click();
    ok('pusula görünümü: TAM T.C. kimlik no (maske değil), ad soyad, telefon', await until(M, tc => { const d = document.querySelector('#egpDocArea'); return d && d.textContent.includes(tc); }, TC)
      && !(await txt(M, '#egpDocArea')).includes('100******46') && (await txt(M, '#egpDocArea')).includes('Bora Alıcı') && (await txt(M, '#egpDocArea')).includes('0544 222 33 44'));
    ok('pusula açılışı audit\'e yazıldı', +sq("SELECT COUNT(*) FROM yp_audit_log WHERE action='egp_view'") >= 1);
    await shot(M, 'yonetim-pusula-tam-tc', false);
    await M.click('#modal [data-act=close]');
    /* red → iade */
    await go(M, 'yonetim/cekim/talepler?f=bekliyor', 800);
    await M.locator('.wdtbl tbody tr.pend [data-act=wd-no]').first().click();
    await M.waitForSelector('#modal form[data-form=p3wdno]'); await M.click('#modal form[data-form=p3wdno] button.btn-bad');
    ok('red: toast, tutar iade', await toast(M, 'reddedildi') && await until(M, () => true) && sq(`SELECT cash FROM yp_wallets WHERE user_id=(SELECT id FROM yp_users WHERE name='${UB.name}')`) === '35000');
    /* ayarlar */
    await go(M, 'yonetim/cekim/ayarlar', 900);
    ok('Ayarlar: TC, ücret, e-Gider formları; sunucuda NVİ notu, kit yok', await M.locator('form[data-form=tcset]').count() === 1 && await M.locator('form[data-form=wdfee]').count() === 1 && await M.locator('form[data-form=egpset]').count() === 1
      && await M.locator('[data-act=tc-kit]').count() === 0 && (await txt(M, '.apage')).includes('NVİ'));
    await shot(M, 'yonetim-cekim-ayarlar');

    /* ---------- 8. üye ekranları: yasak ifade yok ---------- */
    await Bp.reload(); await Bp.waitForSelector('#hdr');
    const leaks = [];
    for (const t of ['ozet', 'cek', 'hareket', 'banka', 'profil']) { await go(Bp, 'hesabim', 200); await Bp.click(`#app [data-act=tab][data-t=${t}]`); await Bp.waitForTimeout(700); const l = await banScan(Bp, 'hesabim/' + t); if (l) leaks.push(l); }
    for (const r of ['bildirimler', 'home']) { await go(Bp, r, 700); const l = await banScan(Bp, r); if (l) leaks.push(l); }
    ok('üye DOM\'unda gider / pusula / VUK / ETTN yok', leaks.length === 0, leaks.join(' | '));
    await cekTab(Bp);
    ok('üye: durumlar Gönderildi + Reddedildi (gerekçe)', /Gönderildi/.test(await txt(Bp, '#userWdTbl')) && /Reddedildi/.test(await txt(Bp, '#userWdTbl')) && /IBAN hesap sahibi/.test(await txt(Bp, '#userWdTbl')));
    const apiLeak = await Bp.evaluate(async () => { const r = []; for (const p of ['boot', 'me/withdrawals', 'me/tx', 'poll?n=0']) { const j = await call('GET', p, null, { quiet: true }); r.push(JSON.stringify(j)); } return r.join('\n'); });
    ok('üye API JSON\'unda yasak ifade yok', !BANNED.test(apiLeak));

    /* ---------- 9. Entegrasyonlar ---------- */
    await go(M, 'yonetim/entegrasyon', 900); await M.waitForSelector('form[data-form=p3ent][data-svc=paytr]');
    ok('Entegrasyonlar: "yakında" yok; PayTR bildirim adresi ve kopyala', !(await txt(M, '.apage')).includes('çok yakında') && (await txt(M, '#p3_paytr_url')) === B + '/api/paytr_bildirim.php');
    await M.fill('#ent_paytr_merchant_id', '123456'); await M.fill('#ent_paytr_merchant_key', 'AbCdEf1234567890'); await M.fill('#ent_paytr_merchant_salt', 'SaLt0987654321zz');
    await M.click('form[data-form=p3ent][data-svc=paytr] button.btn-primary');
    ok('PayTR kaydedildi', await toast(M, 'PayTR bilgileri kaydedildi'));
    await M.reload(); await M.waitForSelector('form[data-form=p3ent][data-svc=paytr]');
    ok('maskeli görünüm: "Kayıtlı: ••••••90", gizli alanlar boş, sır sayfada yok', (await txt(M, 'form[data-svc=paytr]')).includes('••••••90') && (await M.inputValue('#ent_paytr_merchant_key')) === ''
      && !(await M.content()).includes('AbCdEf1234567890'));
    await M.click('form[data-form=p3ent][data-svc=paytr] button.btn-primary');
    ok('boş gizli alanla tekrar kaydet → eski değer korundu', await toast(M, 'PayTR bilgileri kaydedildi') && sq("SELECT COUNT(*) FROM yp_settings WHERE k='paytr'") === '1'
      && (await pcall(M, 'GET', 'admin/integrations')).services.find(s => s.id === 'paytr').values.merchant_key === '••••••90');
    await M.click('form[data-svc=paytr] [data-act=p3ent-test]');
    ok('"Bağlantıyı test et" → başarılı', await toast(M, 'PayTR bağlantısı başarılı') && await until(M, () => /Bağlantı başarılı/.test(document.querySelector('#ent_st_paytr').textContent)));
    await shot(M, 'yonetim-entegrasyonlar');
    /* muhasebe */
    await go(M, 'yonetim/muhasebe/rapor', 1200);
    ok('Muhasebe: günlük rapor, Excel düğmeleri, kuyruk', await M.locator('[data-act=p3-csv]').count() >= 4 && (await txt(M, '.apage')).includes('Muhasebe kuyruğu'));
    await shot(M, 'yonetim-muhasebe');
    await go(M, 'yonetim/muhasebe/egider', 900);
    await M.fill('#m_egp_find', no); await M.click('form[data-form=egplookup] button');
    ok('belge doğrulama: numarayla pusula açıldı', await until(M, n => { const d = document.querySelector('#egpDocArea'); return d && d.textContent.includes(n); }, no));
    await M.click('#modal [data-act=close]');

    /* ---------- 10. tema + 390 px ---------- */
    const thmM = () => M.evaluate(() => [...document.querySelectorAll('[data-act=theme]')].find(b => b.offsetParent).click()); await thmM(); await M.waitForTimeout(200); await go(M, 'yonetim/cekim/talepler?f=tumu', 800); await shot(M, 'yonetim-cekim-gunduz');
    ok('tema değişti', ['light', 'dark'].includes(await M.evaluate(() => document.documentElement.dataset.theme)));
    await thmM();
    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await P.waitForSelector('#hdr'); await login(P, UB.name, UB.pw); await modalGone(P);
    const over = []; const chk = async n => { const w = await overW(P); if (w > 390) over.push(n + ':' + w); };
    await cekTab(P); await chk('hesabim/cek'); await shot(P, 'mobil-para-cek-390');
    await P.evaluate(() => document.querySelector('#hdr [data-act=theme]').click()); await cekTab(P); await chk('hesabim/cek-light'); await shot(P, 'mobil-para-cek-gunduz-390'); await P.evaluate(() => document.querySelector('#hdr [data-act=theme]').click());
    await go(P, 'hesabim', 300); await MOB.hsLogout(P); await toast(P, 'Çıkış yapıldı');
    await login(P, 'Yonetici', APW); await modalGone(P);
    for (const r of ['yonetim/cekim/talepler?f=tumu', 'yonetim/cekim/ayarlar', 'yonetim/muhasebe/rapor', 'yonetim/muhasebe/egider', 'yonetim/entegrasyon']) { await go(P, r, 900); await chk(r); }
    await go(P, 'yonetim/cekim/talepler?f=tumu', 800); await shot(P, 'mobil-yonetim-cekim-390');
    await go(P, 'yonetim/entegrasyon', 800); await shot(P, 'mobil-entegrasyon-390');
    await P.evaluate(() => document.querySelector('[data-act=theme]').click()); await go(P, 'yonetim/cekim/talepler?f=tumu', 800); await chk('cekim-light'); await shot(P, 'mobil-yonetim-cekim-gunduz-390');
    ok('390 px: yatay taşma yok', over.length === 0, over.join(', '));

    /* ---------- 11. API adresleri, hatalar ---------- */
    ok('tüm API istekleri /api/v1/index.php?r= biçiminde', badApi.length === 0 && apiReq.length > 40, badApi.slice(0, 5).join(' | ') + ` (toplam ${apiReq.length})`);
    ok('defter tutarlı (postings toplamı 0)', sq('SELECT COALESCE(SUM(amount),0) FROM yp_postings') === '0');
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
