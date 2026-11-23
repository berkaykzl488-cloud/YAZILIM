// 0.6.1 WhatsApp ön yüz uçtan uca testi: CANLI PAKET (--prod --zip) geçici klasöre açılır, php -S + tests/http/router.php,
// YP_TEST=1 + SQLite; Meta Graph API storage/test_mock.json {"wa":"ok"} ile sahte. Denetlenen:
//   - Yönetim › E-posta & WhatsApp › WhatsApp: form, adım adım kurulum kutusu, bağlantı testi, deneme mesajı, maskeli anahtar,
//     gönderim kayıtları; hiçbir yönetim sayfasında NetGSM ya da görünür "SMS" yok (iç yetki anahtarı "sms" kalabilir)
//   - üye: üyelik penceresi, Hesabım (tüm sekmeler), 2FA paneli, giriş kodu penceresi ve ana sayfalarda /\bSMS\b/ yok;
//     WhatsApp ile 2FA açma ve giriş (outbox: provider whatsapp); WhatsApp kapalıyken seçenek devre dışı ve kod e-postaya düşer
//   - konsol / sayfa hatası yok, 390 px'te yatay taşma yok, ekran görüntüleri (SHOTS=<klasör>)
//
//   node tests/e2e/wa-fe.js                  (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium, request } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-wafe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || path.join(RUN, 'shots');
const PORT = +(process.env.PORT || 19900 + Math.floor(Math.random() * 90));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const DBF = () => path.join(SITE, 'storage/test.sqlite');
const sq = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $s=$p->query($argv[2]); $v=$s?$s->fetchColumn():false; echo $v===false?"":$v;', DBF(), sql]).trim();
const mock = o => fs.writeFileSync(path.join(SITE, 'storage/test_mock.json'), JSON.stringify(o));
const SMS_RX = /\bSMS\b/;

/* ---------- 1. paket ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
ok('derleme: zip ve kurulum kodu', !!CODE && !!ZIP, out);
sh('php', ['-r', '$z=new ZipArchive; if($z->open($argv[1])!==true) exit(1); $z->extractTo($argv[2]); $z->close();', path.join(BUILD, ZIP), SITE]);
const list = sh('php', ['-r', '$z=new ZipArchive; $z->open($argv[1]); for($i=0;$i<$z->numFiles;$i++) echo $z->getNameIndex($i),"\\n";', path.join(BUILD, ZIP)]).split('\n');
ok('zip: WhatsApp sağlayıcısı, göç 0006 ve ön yüz dosyası var; NetGSM yok', ['app/src/Sms/WhatsApp.php', 'app/migrations/0006_whatsapp.php', 'assets/js/prod/98w-whatsapp.js'].every(f => list.includes(f)) && !list.some(f => /NetGsm/i.test(f)));
const bundle = list.filter(f => /^assets\/js\/.*\.js$/.test(f)).map(f => fs.readFileSync(path.join(SITE, f), 'utf8')).join('\n');
ok('canlı paket JS: NetGSM seçeneği yok', !/<option[^>]*>\s*NetGSM|value="netgsm"/i.test(bundle));
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));

/* ---------- 2. sunucu ---------- */
fs.writeFileSync(path.join(RUN, 'sendmail.sh'), `#!/bin/sh\ncat >> "${RUN}/sendmail.log"\necho "----" >> "${RUN}/sendmail.log"\n`, { mode: 0o755 });
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', `sendmail_path=${RUN}/sendmail.sh`, '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const rlReset = () => { const d = path.join(SITE, 'storage/rl'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { force: true }); };
async function otp(to, ch) {
  for (let i = 0; i < 20; i++) { const j = await (await fetch(`${B}/api/v1/_test/outbox?to=${encodeURIComponent(to)}`)).json(); const r = (j.data.rows || []).find(x => x.ev === 'tfa' && (!ch || x.channel === ch)); const m = r && /\b(\d{6})\b/.exec(r.body); if (m) return { code: m[1], id: r.id }; await sleep(250); }
  return null;
}

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    return page;
  };
  const shot = (p, n) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  const shotV = async (p, n) => { await p.waitForTimeout(400); return p.screenshot({ path: path.join(SHOTS, n + '.png') }); }; // pencere (modal) görüntüsü
  const go = async (p, h) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(250); };
  const txt = (p, s) => p.locator(s || 'body').first().innerText();
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const smsHits = async (p, sel, tag, into) => { const t = await txt(p, sel); const ls = t.split('\n').filter(l => SMS_RX.test(l) || /NetGSM/i.test(l)); if (ls.length) into.push(tag + ': ' + ls.slice(0, 3).join(' | ')); };
  const wide = async (p, tag, into) => { const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 390) into.push(tag + ':' + w); };

  try {
    /* ---------- 3. kurulum (form gönderimleriyle) ---------- */
    const K = await request.newContext({ baseURL: B });
    const kur = async (form) => { const h = await (await K.get('/kurulum/')).text(); const csrf = (h.match(/name="csrf" value="([^"]*)"/) || [])[1] || ''; return (await K.post('/kurulum/', { form: Object.assign({ csrf }, form) })).text(); };
    const APW = 'Yonetici-Sifre-2026';
    await kur({ action: 'code', install_code: CODE }); await kur({ action: 'env' });
    await kur({ action: 'dbsave', driver: 'sqlite', sqlite_path: DBF() }); await kur({ action: 'schema' });
    await kur({ action: 'site', site_name: 'Yang WA', site_url: B });
    sh('php', ['-r', 'define("YP_STORAGE",$argv[1]); require $argv[2]; YP\\Store::requireKey(); $db=YP\\Db::connect(YP\\Store::dbConfig()); YP\\Db::setMain($db); $m=YP\\Settings::get("mail",$db); $m["from"]="noreply@yangpazar.test"; $m["on"]=true; $m["fallback"]=true; YP\\Settings::set("mail",$m,null,$db);', path.join(SITE, 'storage'), path.join(SITE, 'app/bootstrap.php')]);
    await kur({ action: 'admin', name: 'Yonetici', email: 'admin@yangpazar.com', password: APW, password2: APW });
    const fin = await kur({ action: 'finish' });
    ok('kurulum tamamlandı', /Kurulum tamamlandı/.test(fin) && fs.existsSync(path.join(SITE, 'storage/kurulum_tamam.php')));
    await K.dispose();
    mock({ wa: 'ok' });

    /* ---------- 4. üye: üyelik penceresi, Hesabım, 2FA paneli (WhatsApp henüz kapalı) ---------- */
    const hitsM = [];
    const A = await mk('uye');
    await A.goto(B + '/'); await A.waitForSelector('#hdr [data-act=register]');
    await A.click('#hdr [data-act=register]'); await A.waitForSelector('#rg_u');
    await smsHits(A, '#modal', 'üye-ol penceresi', hitsM);
    ok('üyelik penceresi: telefon notu WhatsApp der', /WhatsApp doğrulama kodları/.test(await txt(A, '#modal')), await txt(A, '#modal'));
    const U = { name: 'Wa_Deniz', email: 'wadeniz@ornek.com', tel: '0532 999 88 77', pw: 'Wa-Deniz-Sifre-1' };
    await A.fill('#rg_ad', 'Deniz'); await A.fill('#rg_sy', 'Ak'); await A.fill('#rg_u', U.name); await A.fill('#rg_t', U.tel); await A.fill('#rg_e', U.email); await A.fill('#rg_p', U.pw); await A.check('#rg_k');
    await A.click('form[data-form=registerf] button.btn-primary');
    ok('üyelik tamam', await modalGone(A) && (await txt(A, '#hdr')).includes(U.name));
    await go(A, 'hesabim'); await A.click('#app [data-act=tab][data-t=profil]'); await A.waitForSelector('.tfaopts');
    const offT = await txt(A, '.tfaopts');
    ok('2FA paneli (WhatsApp kapalı): "WhatsApp ile kod" devre dışı, Türkçe açıklama', offT.includes('WhatsApp ile kod') && offT.includes('WhatsApp ile doğrulama şu an kullanılamıyor') && await A.locator('#tf_sms').isDisabled(), offT);
    await smsHits(A, '#app', 'hesabim/profil (kapalı)', hitsM); await shot(A, 'uye-2fa-whatsapp-kapali');

    /* ---------- 5. yönetici: E-posta & WhatsApp › WhatsApp ---------- */
    const hitsA = [];
    const M = await mk('yonetici');
    await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap');
    const nav = await M.locator('.asb-nav').first().textContent(); // "Sistem" grubu kapalı olabilir: textContent
    ok('menü: "E-posta & WhatsApp", SMS yok', nav.includes('E-posta & WhatsApp') && !SMS_RX.test(nav), nav);
    await go(M, 'yonetim/sms/sms'); await M.waitForSelector('form[data-form=smsset]');
    ok('eski adres #yonetim/sms/sms → #yonetim/sms/whatsapp', /#yonetim\/sms\/whatsapp$/.test(M.url()), M.url());
    const subs = await txt(M, '.asub');
    ok('alt sekmeler: Mesaj şablonları · E-posta ayarları · WhatsApp · Gönderim kayıtları', /Mesaj şablonları[\s\S]*E-posta ayarları[\s\S]*WhatsApp[\s\S]*Gönderim kayıtları/.test(subs) && !SMS_RX.test(subs), subs);
    const wp = await txt(M, '.apage');
    ok('WhatsApp sayfası: Meta Cloud API formu ve alanlar', wp.includes('WhatsApp Business (Meta Cloud API)') && wp.includes('Telefon numarası kimliği (Phone number ID)') && wp.includes('Kalıcı erişim anahtarı')
      && await M.locator('#sm_pid').count() === 1 && await M.locator('#sm_tok').count() === 1 && (await M.inputValue('#sm_ot')) === 'yangpazar_kod' && (await M.inputValue('#sm_ol')) === 'tr');
    ok('sağlayıcı: tek seçenek WhatsApp, NetGSM yok', (await M.locator('#sm_p option').allInnerTexts()).join('|') === 'WhatsApp Business (Meta Cloud API)' && !/NetGSM/i.test(await M.content()));
    ok('kurulum kutusu: 9 adım (business.facebook.com, developers.facebook.com, Sistem kullanıcısı, yangpazar_kod, yangpazar_bildirim, sınır, ücret)',
      await M.locator('.apage ol li').count() === 9 && ['business.facebook.com', 'developers.facebook.com', 'Sistem kullanıcıları', 'whatsapp_business_messaging', 'Kimlik doğrulama', 'Kodu kopyala', 'yangpazar_kod', 'Yardımcı program', 'yangpazar_bildirim', 'yangpazar.com: {{1}}', 'İşletme doğrulaması', 'mesaj başınadır'].every(x => wp.includes(x)), wp.slice(-2500));
    ok('bağlantı testi düğmesi bilgiler yokken kapalı', await M.locator('[data-act=wa-check]').isDisabled());
    await shot(M, 'yonetim-whatsapp-bos');
    const TOKEN = 'EAAGm0PX4ZCpsBAKZCgizliSISTEMKULLANICI7788';
    await M.fill('#sm_pid', '106540352242922'); await M.fill('#sm_waba', '102290129340398'); await M.fill('#sm_tok', TOKEN); await M.check('#sm_on');
    await M.click('form[data-form=smsset] .asave button');
    ok('WhatsApp ayarları kaydedildi', await toast(M, 'WhatsApp ayarları kaydedildi'));
    await M.reload(); await M.waitForSelector('form[data-form=smsset]'); await M.waitForTimeout(300);
    const html = await M.content();
    ok('erişim anahtarı geri gönderilmez (alan boş, maskeli "Kayıtlı")', !html.includes('SISTEMKULLANICI') && (await M.inputValue('#sm_tok')) === '' && /Kayıtlı:\s*••••••88/.test(await txt(M, 'form[data-form=smsset]')));
    ok('durum: Açık', (await txt(M, 'form[data-form=smsset]')).includes('Açık') && await M.locator('#sm_on').isChecked());
    await M.click('[data-act=wa-check]');
    ok('Bağlantıyı test et → doğrulanmış ad ve numara', await toast(M, 'Bağlantı başarılı') && /Yang Test/.test(await txt(M, '#wa_check')) && /\+90 555 000 00 00/.test(await txt(M, '#wa_check')), await txt(M, '#wa_check'));
    await shot(M, 'yonetim-whatsapp-baglanti');
    await M.fill('#st_to', '0555 444 33 22'); await M.click('form[data-form=smstest] button');
    ok('deneme mesajı gönderildi (kod 123456)', await toast(M, 'Deneme WhatsApp mesajı gönderildi', 12000));
    const waLog = fs.readFileSync(path.join(SITE, 'storage/test_wa.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const last = waLog[waLog.length - 1];
    ok('deneme: kimlik doğrulama şablonu + kopyala butonu', last.json && last.json.template.name === 'yangpazar_kod' && last.json.to === '905554443322' && last.json.template.components[1].sub_type === 'url' && last.json.template.components[1].parameters[0].text === '123456');
    await smsHits(M, '.apage', 'yonetim/sms/whatsapp', hitsA);
    // WhatsApp kapalıyken bağlantı testi Türkçe hata
    mock({ wa: 'token' }); await M.click('[data-act=wa-check]');
    ok('anahtar geçersiz → Türkçe hata kutusu', await toast(M, /Erişim anahtarı geçersiz veya süresi dolmuş/) && /Erişim anahtarı geçersiz veya süresi dolmuş/.test(await txt(M, '#wa_check')));
    mock({ wa: 'ok' });

    /* ---------- 6. üye: WhatsApp ile 2FA aç, girişte kod WhatsApp'tan ---------- */
    await A.reload(); await A.waitForSelector('#hdr'); await go(A, 'hesabim'); await A.click('#app [data-act=tab][data-t=profil]'); await A.waitForSelector('.tfaopts');
    ok('2FA paneli (açık): WhatsApp seçilebilir, maskeli numara', !(await A.locator('#tf_sms').isDisabled()) && (await txt(A, '.tfaopts')).includes('0••• ••• 88 77'));
    await smsHits(A, '#app', 'hesabim/profil', hitsM); await shot(A, 'uye-2fa-panel');
    await A.click('label[for=tf_sms]'); await A.click('[data-act=tfa-save]'); await A.waitForSelector('#tf_code');
    const mt = await txt(A, '#modal');
    ok('kod penceresi: "Kod WhatsApp\'a gönderildi" + maskeli numara', mt.includes("Kod WhatsApp'a gönderildi") && mt.includes('0••• ••• 88 77'), mt);
    await smsHits(A, '#modal', '2FA açma penceresi', hitsM);
    let o = await otp(U.tel, 'sms'); ok('kod WhatsApp kuyruğunda (gönderildi, whatsapp)', !!o && sq(`SELECT provider||'|'||status FROM yp_outbox WHERE id=${o.id}`) === 'whatsapp|sent');
    await A.fill('#tf_code', o.code); await A.click('form[data-form=tfaf] button.btn-primary');
    ok('WhatsApp ile 2FA açıldı (Açık · WhatsApp)', await toast(A, '2 adımlı doğrulama açıldı') && (await txt(A, '#app')).includes('Açık · WhatsApp'));
    await A.click('#app button[data-act=logout]'); await toast(A, 'Çıkış yapıldı'); rlReset();
    await login(A, U.email, U.pw); await A.waitForSelector('#tf_code');
    const lt = await txt(A, '#modal');
    ok('giriş kodu penceresi: WhatsApp, "E-postaya gönder" seçeneği', lt.includes("Kod WhatsApp'a gönderildi") && lt.includes('E-postaya gönder') && !SMS_RX.test(lt), lt);
    await smsHits(A, '#modal', 'giriş kodu penceresi', hitsM); await shotV(A, 'uye-giris-kodu-whatsapp');
    o = await otp(U.tel, 'sms');
    ok('giriş kodu outbox: provider whatsapp, wamid', !!o && /^whatsapp\|wamid\.TEST/.test(sq(`SELECT provider||'|'||provider_id FROM yp_outbox WHERE id=${o.id}`)));
    await A.fill('#tf_code', o.code); await A.click('form[data-form=tfaf] button.btn-primary');
    ok('WhatsApp koduyla giriş', await modalGone(A) && (await txt(A, '#hdr')).includes(U.name));

    /* ---------- 7. üye ekranları taraması ---------- */
    for (const r of ['home', 'metin2-tr', 'metin2-pvp', 'serverler', 'guvenli', 'rehber', 'borsa', 'metin2-ep', 'cekilis', 'reklam-ver', 'ilan-ver', 'bildirimler', 'yang-fiyatlari']) { await go(A, r); await A.waitForTimeout(150); await smsHits(A, '#app', r, hitsM); }
    await go(A, 'hesabim');
    const tabs = await A.evaluate(() => [...document.querySelectorAll('#app .tabs [data-act=tab]')].map(b => b.dataset.t));
    for (const t of tabs) { await A.click(`#app .tabs [data-act=tab][data-t=${t}]`); await A.waitForTimeout(200); await smsHits(A, '#app', 'hesabim/' + t, hitsM); }
    ok('üye ekranlarında görünür "SMS" yok (üyelik, Hesabım ' + tabs.length + ' sekme, 2FA, kod penceresi, ana sayfalar)', hitsM.length === 0, hitsM.join('\n      '));

    /* ---------- 8. yönetim taraması: tüm bölümler ---------- */
    await go(M, 'yonetim/sms/kayitlar'); await M.waitForSelector('.apage table'); await M.waitForTimeout(300);
    const lg = await M.locator('.apage').first().textContent(); // başlıklar CSS ile büyük harf: textContent
    const waPart = lg.split('WhatsApp kayıtları')[1] || '';
    ok('gönderim kayıtları: "WhatsApp kayıtları", sağlayıcı WhatsApp, kod gizli', lg.includes('WhatsApp kayıtları') && /WhatsApp/.test(waPart) && waPart.includes('••••••') && waPart.includes('0555 444 33 22'), waPart.slice(0, 800));
    await shot(M, 'yonetim-gonderim-kayitlari');
    await go(M, 'yonetim/entegrasyon'); await M.waitForTimeout(600);
    const ent = await txt(M, '.apage');
    ok('Entegrasyonlar: WhatsApp durumu ve WhatsApp ayarları bağlantısı, NetGSM yok', ent.includes('WhatsApp açık') && await M.locator('.apage a[href="#yonetim/sms/whatsapp"]').count() === 1 && !/NetGSM/i.test(ent), ent.slice(-600));
    await go(M, 'yonetim/calisan/ekle'); await M.waitForSelector('form[data-form=staffadd]');
    const pt = await txt(M, 'form[data-form=staffadd]');
    ok('yetki etiketi: "E-posta & WhatsApp" (anahtar sms kalır)', pt.includes('E-posta & WhatsApp') && await M.locator('#sa_pm_sms').count() === 1 && !SMS_RX.test(pt));
    const items = await M.evaluate(() => admItems().filter(admVis).flatMap(it => [it.k, ...admSubs(it).map(s => it.k + '/' + s.s)]));
    for (const k of items) { await go(M, 'yonetim/' + k); await M.waitForTimeout(250); await smsHits(M, '.admwrap', 'yonetim/' + k, hitsA); }
    ok('yönetim (' + items.length + ' bölüm/sekme): görünür "SMS" ya da NetGSM yok', hitsA.length === 0, hitsA.join('\n      '));

    /* ---------- 9. WhatsApp kapalı → seçenek devre dışı, kod e-postaya ---------- */
    await go(M, 'yonetim/sms/whatsapp'); await M.waitForSelector('form[data-form=smsset]'); await M.uncheck('#sm_on'); await M.click('form[data-form=smsset] .asave button');
    ok('WhatsApp kapatıldı', await toast(M, 'WhatsApp ayarları kaydedildi'));
    await A.reload(); await A.waitForSelector('#hdr'); await go(A, 'hesabim'); await A.click('#app [data-act=tab][data-t=profil]'); await A.waitForSelector('.tfaopts');
    const offT2 = await txt(A, '#app');
    ok('kapalıyken: WhatsApp seçili ama "şu an kullanılamıyor", kod e-postaya gider notu', offT2.includes('WhatsApp ile doğrulama şu an kullanılamıyor') && offT2.includes('giriş kodunuz e-postanıza gönderilir'));
    // aynı tarayıcı 180 dk "güvenilir" (kod sorulmaz) → yeni tarayıcıyla giriş
    const A2 = await mk('uye-2'); await A2.goto(B + '/'); await A2.waitForSelector('#hdr [data-act=login]'); rlReset();
    await login(A2, U.name, U.pw); await A2.waitForSelector('#tf_code');
    const ft = await txt(A2, '#modal');
    ok('kapalıyken giriş kodu e-postaya, WhatsApp\'a geçiş düğmesi yok', ft.includes('E-posta adresinize') && !ft.includes("WhatsApp'a gönder"), ft);
    await shotV(A2, 'uye-giris-kodu-eposta-yedek');
    o = await otp(U.email, 'mail'); await A2.fill('#tf_code', o.code); await A2.click('form[data-form=tfaf] button.btn-primary');
    ok('e-postadaki kodla giriş', await modalGone(A2));

    /* ---------- 10. 390 px ---------- */
    const over = [];
    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await P.waitForSelector('#hdr [data-act=login]');
    await login(P, 'Yonetici', APW); await P.waitForSelector('.admwrap');
    for (const r of ['yonetim/sms/whatsapp', 'yonetim/sms/kayitlar', 'yonetim/sms/eposta', 'yonetim/entegrasyon']) { await go(P, r); await P.waitForTimeout(400); await wide(P, r, over); }
    await go(P, 'yonetim/sms/whatsapp'); await P.waitForTimeout(300); await shot(P, 'yonetim-whatsapp-390');
    await go(P, 'hesabim'); await P.click('#app [data-act=tab][data-t=profil]'); await P.waitForSelector('.tfaopts'); await wide(P, 'hesabim/profil', over);
    // WhatsApp yeniden açık: 390 px'te kod penceresi
    await go(M, 'yonetim/sms/whatsapp'); await M.waitForSelector('form[data-form=smsset]'); await M.check('#sm_on'); await M.click('form[data-form=smsset] .asave button'); await toast(M, 'WhatsApp ayarları kaydedildi');
    const Q = await mk('uye-390', { width: 390, height: 844 });
    await Q.goto(B + '/'); await Q.waitForSelector('#hdr [data-act=login]'); rlReset();
    await login(Q, U.name, U.pw); await Q.waitForSelector('#tf_code'); await wide(Q, 'giris-kodu-penceresi', over);
    ok('390 px: kod penceresi WhatsApp', (await txt(Q, '#modal')).includes("Kod WhatsApp'a gönderildi"));
    await shotV(Q, 'uye-giris-kodu-390');
    o = await otp(U.tel, 'sms'); await Q.fill('#tf_code', o.code); await Q.click('form[data-form=tfaf] button.btn-primary'); await modalGone(Q);
    await go(Q, 'hesabim'); await Q.click('#app [data-act=tab][data-t=profil]'); await Q.waitForSelector('.tfaopts'); await wide(Q, 'hesabim/profil (üye)', over); await shot(Q, 'uye-2fa-390');
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
    console.log(`\nSONUÇ (WhatsApp ön yüz): ${PASS} geçti, ${FAIL} kaldı${FAIL ? ' → ' + fails.join(' | ') : ''}\nekran görüntüleri: ${SHOTS}`);
    if (process.env.KEEP === '1') console.log('çalışma klasörü: ' + RUN); else fs.rmSync(RUN, { recursive: true, force: true });
    process.exit(FAIL ? 1 : 0);
  }
})();
