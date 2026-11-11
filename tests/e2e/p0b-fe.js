// P0b ön yüz uçtan uca testi: CANLI PAKET (--prod --zip) bir geçici klasöre açılır, php -S + tests/http/router.php (.htaccess karşılığı),
// YP_TEST=1 + SQLite ile çalıştırılır; Playwright ile kurulum sihirbazı, üyelik, giriş/çıkış, 2FA, profil, IBAN, yönetim (çalışan
// yetkileri, e-posta ayarları, yasaklama), bildirim yoklaması, sayfa hataları ve 390 px taşma denetlenir.
//
//   node tests/e2e/p0b-fe.js                 (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p0bfe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || path.join(RUN, 'shots');
const PORT = +(process.env.PORT || 19000 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 600) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));

/* ---------- 1. paket: --prod --zip → zip'i aç (yüklenecek dosyanın aynısı) ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
ok('derleme: zip ve kurulum kodu üretildi', !!CODE && !!ZIP, out);
sh('php', ['-r', '$z=new ZipArchive; if($z->open($argv[1])!==true) exit(1); $z->extractTo($argv[2]); $z->close();', path.join(BUILD, ZIP), SITE]);
const list = sh('php', ['-r', '$z=new ZipArchive; $z->open($argv[1]); for($i=0;$i<$z->numFiles;$i++) echo $z->getNameIndex($i),"\\n";', path.join(BUILD, ZIP)]).split('\n');
ok('zip: index.php, .htaccess, app/, api/v1, kurulum/, storage/kurulum_kodu.php var', ['index.php', '.htaccess', 'api/v1/index.php', 'kurulum/index.php', 'app/bootstrap.php', 'storage/kurulum_kodu.php', 'storage/.htaccess', 'uploads/.htaccess'].every(f => list.includes(f)));
ok('zip: src/ tests/ tools/ docs/ coming-soon/ demo dosyaları ve test kancası yok', !list.some(f => /^(src|tests|tools|docs|coming-soon|node_modules)\//.test(f) || /assets\/js\/demo\//.test(f) || f === 'app/routes/90_test.php' || f === 'index.html'), list.filter(f => /^(src|tests|tools|docs)\//.test(f)).join(','));
ok('zip: kurulum kodu dosyası kurulumun beklediği biçimde', new RegExp(`return '${CODE}';`).test(fs.readFileSync(path.join(SITE, 'storage/kurulum_kodu.php'), 'utf8')));
ok('zip: kod dosyası zip dışında (KURULUM-KODU.txt)', fs.readdirSync(BUILD).some(f => /KURULUM-KODU\.txt$/.test(f)) && !list.some(f => /KURULUM-KODU/.test(f)));
// test kancası (YP_TEST=1 + SQLite'ta e-posta kuyruğunu okur) yalnız bu test kopyasına eklenir
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));

/* ---------- 2. sunucu ---------- */
fs.writeFileSync(path.join(RUN, 'sendmail.sh'), `#!/bin/sh\ncat >> "${RUN}/sendmail.log"\necho "----" >> "${RUN}/sendmail.log"\n`, { mode: 0o755 });
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', `sendmail_path=${RUN}/sendmail.sh`, '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const rlReset = () => { const d = path.join(SITE, 'storage/rl'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { force: true }); };
async function otp(to) { for (let i = 0; i < 20; i++) { const j = await (await fetch(`${B}/api/v1/_test/outbox?to=${encodeURIComponent(to)}`)).json(); const r = (j.data.rows || []).find(x => x.ev === 'tfa'); const m = r && /\b(\d{6})\b/.exec(r.body); if (m) return { code: m[1], id: r.id }; await sleep(250); } return null; }

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort()); // dış ağ (Google Fonts) yok
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(250); };
  const txt = (p, s) => p.locator(s || 'body').innerText();
  const tc = (p, s) => p.locator(s || 'body').first().textContent(); // CSS büyük harf dönüşümünden bağımsız
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);

  try {
    /* ---------- 3. kurulum sihirbazı (arayüzden) ---------- */
    const K = await mk('kurulum', { width: 900, height: 900 });
    await K.goto(B + '/');
    ok('kurulmamış site → /kurulum/ yönlendirmesi', /\/kurulum\/$/.test(K.url()), K.url());
    ok('kurulum: önce kurulum kodu istenir', (await txt(K)).includes('Kurulum kodu')); await shot(K, 'kurulum-1-kod');
    await K.fill('#ic', CODE); await K.click('button:has-text("Devam")');
    ok('kod doğru → ortam denetimi', (await txt(K)).includes('Ortam denetimi')); await shot(K, 'kurulum-2-ortam');
    await K.click('button:has-text("Devam")');
    const dbFill = async () => { await K.fill('input[name=driver]', 'sqlite'); await K.fill('input[name=sqlite_path]', path.join(SITE, 'storage/test.sqlite')); };
    await dbFill(); await K.click('button:has-text("Bağlantıyı test et")');
    ok('veritabanı: bağlantı testi başarılı', (await txt(K)).includes('Bağlantı başarılı')); await shot(K, 'kurulum-3-veritabani');
    await dbFill(); await K.click('button:has-text("Kaydet ve devam et")');
    ok('tablolar adımı', (await txt(K)).includes('Tabloları oluştur')); await shot(K, 'kurulum-4-tablolar');
    await K.click('button:has-text("Tabloları oluştur")');
    await K.fill('#sn', 'Yang Test'); await K.fill('#su', B); await shot(K, 'kurulum-5-site');
    await K.click('button:has-text("Kaydet ve devam et")');
    ok('site kaydedildi → yönetici adımı', (await txt(K)).includes('Yönetici hesabı'));
    const APW = 'Yonetici-Sifre-2026';
    await K.fill('#an', 'Yonetici'); await K.fill('#ae', 'admin@yangpazar.com'); await K.fill('#ap', APW); await K.fill('#ap2', APW); await shot(K, 'kurulum-6-yonetici');
    await K.click('button:has-text("Yöneticiyi oluştur")');
    ok('son adım (demo seçeneği)', (await txt(K)).includes('Demo verileriyle kur')); await shot(K, 'kurulum-7-son');
    await K.click('button:has-text("Kurulumu bitir")');
    ok('kurulum tamamlandı (cron + PayTR URL)', /Kurulum tamamlandı/.test(await txt(K)) && (await txt(K)).includes('paytr_bildirim.php')); await shot(K, 'kurulum-8-tamam');
    ok('kurulum kodu dosyası silindi', !fs.existsSync(path.join(SITE, 'storage/kurulum_kodu.php')));
    await K.context().close();

    /* ---------- 4. ziyaretçi: açılış verisi, demo yok, yakında sayfaları ---------- */
    const G = await mk('ziyaretci');
    const resp = await G.goto(B + '/');
    const html = await resp.text();
    ok('index.php: YP_MODE=prod ve YP_BOOT (csrf) sayfaya yazıldı', /window\.YP_MODE="prod"/.test(html) && /window\.YP_BOOT=\{"csrf":"[0-9a-f]{64}"/.test(html));
    ok('index.php: demo dosyaları ve gömülü kitler yüklenmiyor', !/assets\/js\/demo\//.test(html) && !/API_KIT_FILES/.test(html));
    await G.waitForSelector('#hdr [data-act=register]');
    ok('ziyaretçi: demo hesap seçici yok', await G.locator('.demo-sw, #demoUser, .asb-sw select').count() === 0);
    ok('ziyaretçi: site adı sunucudan (Yang Test)', (await txt(G, '#hdr')).includes('Yang Test'));
    const routes = ['home', 'metin2-tr', 'metin2-pvp', 'serverler', 'rehber', 'guvenli', 'borsa', 'metin2-ep', 'cekilis', 'reklam-ver', 'ilan-ver', 'mesajlar', 'hesabim', 'bildirimler', 'yonetim', 'ortaklik', 'yang-fiyatlari', 'ara', 'siparis-S100001', 'ilan-l1', 'yok-boyle-sayfa'];
    for (const r of routes) await go(G, r);
    await go(G, 'borsa'); ok('yakında sayfası (borsa)', (await txt(G, '#app')).includes('Yakında'));

    /* ---------- 5. üyelik: Deniz (davet eden) ---------- */
    const A = await mk('deniz');
    await A.goto(B + '/'); await A.waitForSelector('#hdr [data-act=register]');
    await A.click('#hdr [data-act=register]');
    const U1 = { name: 'Deniz_TR', email: 'deniz@ornek.com', tel: '0555 111 22 33', ad: 'Deniz', soyad: 'Yılmaz', pw: 'Deniz-Sifre-1' };
    await A.fill('#rg_ad', U1.ad); await A.fill('#rg_sy', U1.soyad); await A.fill('#rg_u', U1.name); await A.fill('#rg_t', U1.tel); await A.fill('#rg_e', U1.email); await A.fill('#rg_p', 'kisa1'); await A.check('#rg_k');
    await A.evaluate(() => { const p = document.querySelector('#rg_p'); p.minLength = 0; });
    await A.click('form[data-form=registerf] button.btn-primary');
    await A.waitForSelector('#modal .note-bad');
    ok('üyelik: kısa şifre → sunucu hatası pencerede (Türkçe)', /en az 8/i.test(await txt(A, '#modal')), await txt(A, '#modal'));
    ok('üyelik: hata sonrası alanlar korunur', (await A.inputValue('#rg_u')) === U1.name);
    await A.fill('#rg_p', U1.pw); await A.evaluate(() => { const n = document.querySelector('#modal .note-bad'); if (n) n.remove(); }); await shot(A, 'uye-ol-pencere');
    await A.click('form[data-form=registerf] button.btn-primary');
    ok('üyelik: Deniz_TR hesabı açıldı ve giriş yapıldı', await modalGone(A) && (await txt(A, '#hdr')).includes(U1.name));
    ok('üyelik: hoş geldin bildirimi', await A.locator('#hdr a[href="#bildirimler"] i').count() === 1);

    /* ---------- 6. çıkış / giriş ---------- */
    await go(A, 'hesabim'); await A.click('#app button[data-act=logout]');
    ok('çıkış: header Giriş Yap gösterir', await toast(A, 'Çıkış yapıldı') && (await A.locator('#hdr [data-act=login]').count()) === 1);
    const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
    await login(A, U1.name, 'yanlis-sifre');
    await A.waitForSelector('#modal .note-bad'); ok('giriş: yanlış şifre → pencerede hata', (await txt(A, '#modal')).includes('Kullanıcı adı veya şifre hatalı'));
    await A.fill('#lg_p', U1.pw); await A.click('form[data-form=loginf] button.btn-primary');
    ok('giriş: başarılı (e-posta veya kullanıcı adı)', await modalGone(A) && (await txt(A, '#hdr')).includes(U1.name));

    /* ---------- 7. profil ---------- */
    await go(A, 'hesabim'); await A.click('#app [data-act=tab][data-t=profil]');
    await A.fill('#pf_tel', '0555 999 88 77'); await A.click('form[data-form=profile] button.btn-primary');
    ok('profil: telefon kaydedildi', await toast(A, 'Bilgileriniz kaydedildi'));
    const NPW = 'Deniz-Yeni-Sifre-2';
    await A.fill('#pf_pass', NPW); await A.click('form[data-form=profile] button.btn-primary');
    ok('profil: mevcut şifre olmadan şifre değişmez', await toast(A, /Mevcut şifre/));
    await A.fill('#pf_pass', NPW); await A.fill('#pf_cur', U1.pw); await A.click('form[data-form=profile] button.btn-primary');
    ok('profil: şifre değişti (mevcut şifreyle)', await toast(A, 'Bilgileriniz kaydedildi'));
    U1.pw = NPW;
    ok('profil: yeni telefon ekranda', (await A.inputValue('#pf_tel')) === '0555 999 88 77');

    /* ---------- 8. 2 adımlı doğrulama (e-posta) ---------- */
    await A.click('label[for=tf_mail]'); await A.click('[data-act=tfa-save]');
    await A.waitForSelector('#tf_code');
    let o = await otp(U1.email); ok('2FA: doğrulama kodu e-posta kuyruğunda', !!o);
    await A.fill('#tf_code', '000000'); await A.click('form[data-form=tfaf] button.btn-primary');
    await A.waitForSelector('#modal .note-bad'); ok('2FA: yanlış kod → hata', /hatalı|yanlış/i.test(await txt(A, '#modal')), await txt(A, '#modal'));
    await A.fill('#tf_code', o.code); await A.click('form[data-form=tfaf] button.btn-primary');
    ok('2FA: e-posta ile açıldı', await toast(A, '2 adımlı doğrulama açıldı') && (await txt(A, '#app')).includes('Açık · e-posta'));
    await A.click('#app button[data-act=logout]'); await toast(A, 'Çıkış yapıldı'); rlReset();
    await login(A, U1.email, U1.pw);
    await A.waitForSelector('#tf_code'); ok('2FA: girişte kod istenir', (await txt(A, '#modal')).includes('6 haneli'));
    o = await otp(U1.email); await A.fill('#tf_code', o.code); await A.click('form[data-form=tfaf] button.btn-primary');
    ok('2FA: kodla giriş yapıldı', await modalGone(A) && (await txt(A, '#hdr')).includes(U1.name));

    /* ---------- 9. IBAN ekle / sil ---------- */
    await go(A, 'hesabim'); await A.click('#app [data-act=tab][data-t=banka]');
    await A.fill('#ia_i', 'TR12 3456'); await A.click('form[data-form=ibanadd] button');
    ok('IBAN: geçersiz IBAN reddedilir', await toast(A, /IBAN/));
    await A.fill('#ia_i', 'TR33 0006 1005 1978 6457 8413 26'); await A.click('form[data-form=ibanadd] button');
    ok('IBAN: kaydedildi ve maskeli gösterilir', await toast(A, 'IBAN kaydedildi') && /TR33••••••1326/.test(await txt(A, '#app')) && !(await txt(A, '#app')).includes('0006100519786457841326'));
    await A.click('#app [data-act=iban-del]');
    ok('IBAN: silindi', await toast(A, 'IBAN silindi') && (await txt(A, '#app')).includes('Kayıtlı IBAN yok'));

    /* ---------- 10. davetle üyelik (Mert) + yoklamayla bildirim ---------- */
    await go(A, 'bildirimler'); const n0 = await A.locator('.feed.notif a').count();
    const C = await mk('mert');
    await C.goto(B + '/#davet-DENIZTR26');
    await C.waitForSelector('#rg_ref', { timeout: 8000 });
    ok('davet linki: üye ol penceresi açılır ve davet kodu dolu', (await C.inputValue('#rg_ref')) === 'DENIZTR26');
    const U2 = { name: 'Mert_TR', email: 'mert@ornek.com', pw: 'Mert-Sifre-12' };
    await C.fill('#rg_ad', 'Mert'); await C.fill('#rg_sy', 'Kaya'); await C.fill('#rg_u', U2.name); await C.fill('#rg_t', '0544 222 33 44'); await C.fill('#rg_e', U2.email); await C.fill('#rg_p', U2.pw); await C.check('#rg_k');
    await C.click('form[data-form=registerf] button.btn-primary');
    ok('davetle üyelik: Mert_TR açıldı', await modalGone(C) && (await txt(C, '#hdr')).includes(U2.name));
    let polled = false; for (let i = 0; i < 40 && !polled; i++) { await A.waitForTimeout(1000); polled = (await A.locator('.feed.notif a').count()) > n0 && (await txt(A, '#app')).includes('Mert_TR davet'); }
    ok('yoklama: davet bildirimi Deniz\'e sayfa yenilenmeden geldi', polled);
    await A.click('#app [data-act=n-readall]'); ok('bildirimler: tümü okundu', await toast(A, 'okundu'));
    await A.click('#app [data-act=n-delread]'); await A.click('#app [data-act=n-delread]');
    ok('bildirimler: okunanlar silindi', await toast(A, 'bildirim silindi') && (await txt(A, '#app')).includes('Bildiriminiz yok'));

    /* ---------- 11. R9: üye ekranlarında e-Gider/pusula metni yok ---------- */
    let r9 = []; for (const r of ['home', 'hesabim', 'bildirimler', 'metin2-tr', 'guvenli', 'rehber']) { await go(A, r); for (const t of ['ozet', 'profil', 'banka']) { if (r !== 'hesabim') break; await A.click(`#app [data-act=tab][data-t=${t}]`); await A.waitForTimeout(100); const x = await txt(A); if (/e-?gider|pusula|VUK|ETTN/i.test(x)) r9.push(r + '/' + t); } const x = await txt(A); if (/e-?gider|pusula|VUK|ETTN/i.test(x)) r9.push(r); }
    ok('R9: üyeye e-Gider/pusula metni gösterilmez', r9.length === 0, r9.join(','));

    /* ---------- 12. yönetici: Bugün, çalışan ekle, e-posta ayarları ---------- */
    const M = await mk('yonetici');
    await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap'); ok('yönetici girişi → Yönetim paneli', /#yonetim/.test(M.url()));
    await M.waitForSelector('.apage .kpis'); ok('Bugün: üye sayıları sunucudan (3 üye)', /Toplam üye\s*3/.test(await tc(M, '.apage')), await tc(M, '.apage'));
    ok('Bugün: 2FA kapalı uyarısı', (await txt(M, '.apage')).includes('2 adımlı doğrulama kapalı'));
    ok('panel: hesap değiştirici yok, Çıkış yap var', await M.locator('#admUser, #admUserM').count() === 0 && await M.locator('.asb [data-act=logout]').count() === 1);
    await go(M, 'yonetim/calisan/ekle'); await M.waitForSelector('form[data-form=staffadd]');
    const STF = { name: 'Destekci', pw: 'Destek-Sifre-2026' };
    await M.fill('#sa_u', STF.name); await M.fill('#sa_ad', 'Ayşe'); await M.fill('#sa_sy', 'Demir'); await M.fill('#sa_e', 'destek@ornek.com'); await M.fill('#sa_p', STF.pw);
    await M.evaluate(() => { Object.keys(PERMS).forEach(k => { const c = document.querySelector('#sa_pm_' + k); if (c) c.checked = ['uye', 'ara'].includes(k); }); });
    await M.click('form[data-form=staffadd] .asave button');
    ok('çalışan eklendi (uye + ara yetkisi)', await toast(M, 'Çalışan eklendi'));
    await M.waitForSelector('form[data-form=staffperm]'); await M.waitForTimeout(300);
    ok('çalışan listesinde Destekci', (await txt(M, '.apage')).includes(STF.name));
    await shot(M, 'yonetim-calisanlar');
    // e-posta ayarları: Brevo anahtarı kaydedilir, geri maskeli döner
    await go(M, 'yonetim/sms/eposta'); await M.waitForSelector('form[data-form=mailset]');
    await M.selectOption('#ml_pv', 'brevo'); await M.waitForTimeout(100);
    ok('e-posta: sağlayıcı seçenekleri Brevo API / Mailjet API / SMTP', (await M.locator('#ml_pv option').allInnerTexts()).join('|').match(/Brevo API.*Mailjet API.*SMTP/) != null);
    const KEY = 'xkeysib-0123456789abcdef0123456789abcdef-ABCDEFGH';
    await M.check('#ml_on'); await M.fill('#ml_fr', 'noreply@yangpazar.test'); await M.fill('#ml_fn', 'Yang Test'); await M.fill('#ml_bk', KEY);
    await M.click('form[data-form=mailset] .asave button');
    ok('e-posta: ayarlar kaydedildi', await toast(M, 'E-posta ayarları kaydedildi'));
    await M.reload(); await M.waitForSelector('form[data-form=mailset]'); await M.waitForTimeout(300);
    const mhtml = await M.content();
    ok('e-posta: anahtar geri gönderilmez (maskeli, alan boş)', !mhtml.includes(KEY) && !mhtml.includes('0123456789abcdef0123') && (await M.inputValue('#ml_bk')) === '' && /Kayıtlı:/.test(await txt(M, 'form[data-form=mailset]')));
    ok('e-posta: Brevo seçili kaldı', (await M.inputValue('#ml_pv')) === 'brevo');
    await shot(M, 'yonetim-eposta-ayarlari');
    // deneme e-postası: hosting yedeği (sendmail) ile
    await M.selectOption('#ml_pv', ''); await M.check('#ml_fb'); await M.click('form[data-form=mailset] .asave button'); await toast(M, 'E-posta ayarları kaydedildi');
    await M.waitForSelector('#mt_to'); await M.fill('#mt_to', 'sahip@ornek.com'); await M.click('form[data-form=mailtest] button');
    ok('e-posta: deneme gönderildi', await toast(M, 'Deneme e-postası gönderildi', 15000));
    await go(M, 'yonetim/sms/kayitlar'); await M.waitForSelector('.apage table'); await M.waitForTimeout(300);
    const logT = await tc(M, '.apage');
    ok('gönderim kayıtları: deneme e-postası listede, doğrulama kodları gizli', logT.includes('sahip@ornek.com') && !/\b\d{6}\b/.test(logT.split('E-posta kayıtları')[1].replace(/\d{2}\.\d{2}|\d{2}:\d{2}/g, '')) && logT.includes('••••••'));
    // SMS ayarları
    await go(M, 'yonetim/sms/sms'); await M.waitForSelector('form[data-form=smsset]');
    await M.fill('#sm_h', 'YANGPAZAR'); await M.fill('#sm_u', '8501234567'); await M.fill('#sm_pw', 'sms-gizli-sifre');
    await M.click('form[data-form=smsset] .asave button'); ok('SMS: ayarlar kaydedildi', await toast(M, 'SMS ayarları kaydedildi'));
    await M.waitForTimeout(300); ok('SMS: şifre geri gönderilmez', !(await M.content()).includes('sms-gizli-sifre'));

    /* ---------- 13. çalışan girişi: yalnız yetkili bölümler ---------- */
    const T = await mk('calisan');
    await T.goto(B + '/'); await T.waitForSelector('#hdr [data-act=login]'); await login(T, STF.name, STF.pw); await modalGone(T);
    await go(T, 'yonetim'); await T.waitForSelector('.asb-nav');
    const nav = await txt(T, '.asb-nav');
    ok('çalışan: menüde Bugün ve Üyeler var', nav.includes('Bugün') && nav.includes('Üyeler'));
    ok('çalışan: yetkisiz bölümler menüde yok', !/Çalışanlar|E-posta & SMS|Ödemeler|Para çekme|Site ayarları/.test(nav), nav);
    await go(T, 'yonetim/calisan'); await T.waitForTimeout(400);
    ok('çalışan: yetkisiz bölüm adresi açılmaz', !(await txt(T, '.apage')).includes('Çalışan ekle') && !/calisan/.test(await T.evaluate(() => location.hash)));
    const st403 = await T.evaluate(async () => (await fetch('api/v1/admin/staff', { credentials: 'same-origin' })).status);
    ok('çalışan: API yetki denetimi (admin/staff → 403)', st403 === 403);
    ok('çalışan: Bugün KPI yok (panel yetkisi yok)', !(await (async () => { await go(T, 'yonetim'); await T.waitForTimeout(500); return txt(T, '.apage'); })()).includes('Toplam üye'));

    /* ---------- 14. üye arama, doğrulama, yasaklama → oturum düşer ---------- */
    await go(A, 'hesabim'); await A.click('#app [data-act=tab][data-t=ozet]');
    await go(M, 'yonetim/uye/uyeler?q=Deniz'); await M.waitForSelector('.apage [data-act=user-open]');
    await M.click('.apage [data-act=user-open]'); await M.waitForSelector('#modal [data-act=u-ban]');
    ok('üye detayı: sunucudan (maskeli IBAN alanı, 2FA açık)', (await txt(M, '#modal')).includes('2 adımlı doğrulama') && (await txt(M, '#modal')).includes('Açık'));
    await M.click('#modal [data-act=u-ver]'); ok('üye doğrulandı', await toast(M, 'doğrulandı'));
    await go(M, 'yonetim/uye/uyeler?q=Deniz'); await M.waitForSelector('.apage [data-act=user-open]');
    await M.click('.apage [data-act=user-open]'); await M.waitForSelector('#modal [data-act=u-ban]'); await M.click('#modal [data-act=u-ban]');
    await M.click('#cfm_ok'); ok('üye yasaklandı', await toast(M, 'askıya alındı'));
    let dropped = false; for (let i = 0; i < 40 && !dropped; i++) { await A.waitForTimeout(1000); dropped = (await A.locator('#hdr [data-act=login]').count()) === 1; }
    ok('yasaklanan üyenin açık oturumu yoklamada sona erdi', dropped && /#home|^[^#]*$/.test(A.url()));
    await login(A, U1.name, U1.pw); await A.waitForSelector('#modal .note-bad');
    ok('yasaklı üye giriş yapamaz', (await txt(A, '#modal')).includes('askıya alınmış'));
    // komut araması (sunucudan üye arama)
    await go(M, 'yonetim'); await M.fill('#acmdA', 'Mert'); await M.waitForTimeout(900);
    ok('komut araması: üye sunucudan bulunur', (await txt(M, '#acmdA_pop')).includes('Mert_TR'));

    /* ---------- 15. hatasız gezinme (yönetici: tüm bölümler, üye) + 390 px taşma ---------- */
    const items = await M.evaluate(() => admItems().filter(admVis).flatMap(it => [it.k, ...admSubs(it).map(s => it.k + '/' + s.s)]));
    for (const k of items) { await go(M, 'yonetim/' + k); await M.waitForTimeout(150); }
    for (const r of routes) await go(M, r);
    for (const r of routes) await go(C, r);
    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await P.waitForSelector('#hdr'); await login(P, U2.name, U2.pw); await modalGone(P);
    const over = [];
    for (const r of ['home', 'metin2-tr', 'hesabim', 'bildirimler', 'borsa', 'guvenli', 'rehber']) { await go(P, r); await P.waitForTimeout(150); const w = await P.evaluate(() => document.documentElement.scrollWidth); if (w > 390) over.push(r + ':' + w); }
    await go(P, 'hesabim'); for (const t of ['profil', 'banka']) { await P.click(`#app [data-act=tab][data-t=${t}]`); await P.waitForTimeout(100); const w = await P.evaluate(() => document.documentElement.scrollWidth); if (w > 390) over.push('hesabim/' + t + ':' + w); }
    await P.click('#app button[data-act=logout]'); await toast(P, 'Çıkış yapıldı');
    await P.click('#hdr [data-act=register]'); { const w = await P.evaluate(() => document.documentElement.scrollWidth); if (w > 390) over.push('uye-ol:' + w); } await shot(P, 'uye-ol-390');
    await P.click('#modal [data-act=close]');
    await login(P, 'Yonetici', APW); await modalGone(P);
    for (const r of ['yonetim', 'yonetim/calisan/liste', 'yonetim/calisan/ekle', 'yonetim/uye/uyeler', 'yonetim/sms/eposta', 'yonetim/sms/kayitlar']) { await go(P, r); await P.waitForTimeout(300); const w = await P.evaluate(() => document.documentElement.scrollWidth); if (w > 390) over.push(r + ':' + w); }
    ok('390 px: yatay taşma yok', over.length === 0, over.join(', '));
    ok('konsol / sayfa hatası yok (tüm gezinmeler)', errs.length === 0, errs.slice(0, 8).join('\n      '));
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
