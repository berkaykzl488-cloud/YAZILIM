// P6 ön yüz uçtan uca testi (iletişim): CANLI PAKET (--prod) geçici klasöre, php -S + tests/http/router.php, YP_TEST=1 + SQLite.
//   Giriş / Kayıt penceresi: iki sekme, şifre göz düğmesi, Beni hatırla, Şifremi unuttum (kod ile ve bağlantı ile); canlı destek: üye ve
//   temsilci iki ayrı tarayıcıda (yoklama < 10 sn), asistan yanıtı, temsilciye bağlan, üstlen, yanıt, kapat, değerlendir; sekme gizliyken
//   yoklama seyrekleşir; üyeden üyeye mesajda telefon numarası gizlenir, alıcının başlığında okunmamış rozeti; bildirimler (okundu, tümü
//   okundu); mobil (390 px) alt çubuktaki Destek çalışma saatinde sohbeti, saat dışında Yardım penceresini (WhatsApp) açar; yönetim:
//   Bugün ve kenar menüde destek rozeti, engellenen mesajlar, mesaj şablonları. 390 ve 1280 px, gece + gündüz teması, konsol hatası yok,
//   390 px'te yatay taşma yok. Rotalar route() ile denetlenir. Tüm API istekleri /api/v1/index.php?r= biçiminde.
//
//   node tests/e2e/p6-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p6fe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-YAZILIM/c5402d75-b547-55b7-842f-b0b270529f25/scratchpad/p6-fe';
const PORT = +(process.env.PORT || 20800 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const DBF = () => path.join(SITE, 'storage/test.sqlite');
const sq = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $s=$p->query($argv[2]); $v=$s?$s->fetchColumn():false; echo $v===false?"":$v;', DBF(), sql]).trim();
const siteSet = (k, v) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $r=$p->query("SELECT v FROM yp_settings WHERE k=\'site\'")->fetchColumn(); $j=$r?json_decode($r,true):[]; $j[$argv[2]]=$argv[3]; $s=$p->prepare("INSERT INTO yp_settings (k,v,secret,updated_at) VALUES (\'site\',?,0,0) ON CONFLICT(k) DO UPDATE SET v=excluded.v"); $s->execute([json_encode($j,JSON_UNESCAPED_UNICODE)]);', DBF(), k, v]);
const rmRl = () => { try { for (const f of fs.readdirSync(path.join(SITE, 'storage/rl'))) fs.unlinkSync(path.join(SITE, 'storage/rl', f)); } catch (e) { } };

/* ---------- 1. paket + sunucu ---------- */
sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--out=' + SITE]);
const js = fs.readdirSync(path.join(SITE, 'assets/js/prod'));
ok('canlı pakette P6 ön yüz dosyaları var', js.includes('97p6-comm.js') && js.includes('98p6-actions.js'), js.join(','));
fs.writeFileSync(path.join(RUN, 'sendmail.sh'), `#!/bin/sh\ncat >> "${RUN}/sendmail.log"\n`); fs.chmodSync(path.join(RUN, 'sendmail.sh'), 0o755);
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'sendmail_path=' + path.join(RUN, 'sendmail.sh'), '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '6' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const APW = 'Yonetici-Sifre-2026';
const kur = () => sh('bash', ['-c', `J="${RUN}/k.jar"; k(){ c=$(curl -s -b $J -c $J "${B}/kurulum/" | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//'); a=(-s -L -b $J -c $J -o /dev/null --data-urlencode "csrf=$c"); for kv in "$@"; do a+=(--data-urlencode "$kv"); done; curl "\${a[@]}" "${B}/kurulum/"; }
k action=env; k action=dbsave driver=sqlite "sqlite_path=${DBF()}"; k action=schema; k action=site site_name="Yang P6" site_url="${B}"
k action=admin name=Yonetici email=admin@yangpazar.com password=${APW} password2=${APW}; k action=finish`]);
const img = path.join(RUN, 'ss.png');
sh('php', ['-r', '$i=imagecreatetruecolor(320,200); imagefill($i,0,0,imagecolorallocate($i,30,90,160)); imagestring($i,5,40,90,"EKRAN",imagecolorallocate($i,255,255,255)); imagepng($i,$argv[1]);', img]);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [], badApi = [], apiLog = [];
  const mk = async (name, vw, theme) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', reducedMotion: 'reduce', hasTouch: !!(vw && vw.width < 500), isMobile: !!(vw && vw.width < 500) });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    if (theme) await ctx.addInitScript(t => { try { localStorage.setItem('yangpazar_theme', t); } catch (e) { } }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    page.on('request', r => { const u = r.url(); if (!u.startsWith(B)) return; const p = u.slice(B.length);
      if (/^\/api\/v1(\/|\?|$)/.test(p)) { apiLog.push({ who: name, t: Date.now(), m: r.method(), p }); if (!/^\/api\/v1\/index\.php\?r=/.test(p)) badApi.push(`[${name}] ${r.method()} ${p}`); } });
    return page;
  };
  const shot = (p, n, full) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: full === true });
  const nav = async (p, r, w) => { await p.evaluate(x => go(x), r); await p.waitForTimeout(w || 500); };
  const txt = (p, s) => p.locator(s || 'body').first().innerText().catch(() => '');
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 10000 }); return true; } catch (e) { return false; } };
  const overW = p => p.evaluate(() => document.documentElement.scrollWidth);
  const pcall = (p, m, a, b) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code, http: e.http })), [m, a, b]);
  const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const setTheme = (p, t) => p.evaluate(t => { document.documentElement.dataset.theme = t; try { localStorage.setItem('yangpazar_theme', t); } catch (e) { } render(); }, t);
  const uid = n => 'u' + sq(`SELECT id FROM yp_users WHERE name='${n}'`);
  const reqs = (who, re, since) => apiLog.filter(x => x.who === who && re.test(x.p) && x.t >= since).length;

  try {
    kur();
    ok('kurulum tamamlandı', fs.existsSync(path.join(SITE, 'storage/kurulum_tamam.php')));

    /* ---------- 2. yönetici: destek açık, e-posta (sahte), destek çalışanı ---------- */
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap'); ok('yönetici girişi', await M.evaluate(() => isAdmRoute(route())));
    const r1 = await pcall(M, 'PUT', 'admin/settings/support', { mode: 'open' });
    const r2 = await pcall(M, 'PUT', 'admin/settings/mail', { on: true, provider: '', fallback: true, from: 'noreply@yangpazar.test', hourly: 500 });
    const r3 = await pcall(M, 'POST', 'admin/staff', { name: 'DestekCalisan', email: 'ds@yangpazar.com', ad: 'Destek', soyad: 'Ci', password: 'Calisan-Sifre-9', perms: ['destek', 'mesaj', 'sms'] });
    ok('destek açık, e-posta açık (mail() yedeği), [destek] çalışanı', r1 && r1.support && r1.support.open === true && !r2.err && !r3.err, JSON.stringify([r1, r2, r3]).slice(0, 400));

    /* ---------- 3. Giriş / Kayıt penceresi ---------- */
    const A = await mk('uye-A'); await A.goto(B + '/'); await A.waitForSelector('#hdr [data-act=register]');
    await A.click('#hdr [data-act=register]'); await A.waitForSelector('#rg_u');
    const tabs = await A.evaluate(() => [...document.querySelectorAll('#modal .auth-tabs [role=tab]')].map(b => ({ t: b.textContent.trim(), on: b.classList.contains('on'), sel: b.getAttribute('aria-selected') })));
    ok('tek pencere, iki sekme: "Giriş Yap" / "Kayıt Ol" (Kayıt Ol seçili)', tabs.length === 2 && tabs[0].t === 'Giriş Yap' && tabs[1].t === 'Kayıt Ol' && tabs[1].on && tabs[1].sel === 'true' && !tabs[0].on, JSON.stringify(tabs));
    ok('kayıt sekmesi: tüm alanlar (ad, soyad, kullanıcı adı, telefon, e-posta, şifre, davet, KVKK)', await A.evaluate(() => ['rg_ad', 'rg_sy', 'rg_u', 'rg_t', 'rg_e', 'rg_p', 'rg_ref', 'rg_k'].every(id => document.getElementById(id))));
    await shot(A, 'kayit-1280-gece');
    await A.click('#modal .auth-tabs [data-act=login]'); await A.waitForSelector('#lg_u');
    ok('sekme değişti: Giriş Yap seçili, kullanıcı adı / şifre / Beni hatırla / Şifremi unuttum', await A.evaluate(() => document.querySelector('#modal .auth-tabs [data-act=login]').classList.contains('on') && !!document.getElementById('lg_rem') && document.getElementById('lg_rem').checked && !!document.querySelector('#modal [data-act=auth-forgot]')));
    await A.fill('#lg_p', 'gizli-sifre-1');
    await A.click('#modal .pw-eye[data-for=lg_p]');
    const eye1 = await A.evaluate(() => ({ t: document.getElementById('lg_p').type, p: document.querySelector('.pw-eye[data-for=lg_p]').getAttribute('aria-pressed'), v: document.getElementById('lg_p').value }));
    await A.click('#modal .pw-eye[data-for=lg_p]');
    const eye2 = await A.evaluate(() => ({ t: document.getElementById('lg_p').type, p: document.querySelector('.pw-eye[data-for=lg_p]').getAttribute('aria-pressed') }));
    ok('göz düğmesi: şifre görünür ↔ gizli (aria-pressed), değer korunur', eye1.t === 'text' && eye1.p === 'true' && eye1.v === 'gizli-sifre-1' && eye2.t === 'password' && eye2.p === 'false', JSON.stringify([eye1, eye2]));
    await shot(A, 'giris-1280-gece');
    await setTheme(A, 'light'); await A.evaluate(() => ACT.login()); await A.waitForSelector('#lg_u'); await shot(A, 'giris-1280-gunduz');
    await A.click('#modal .auth-tabs [data-act=register]'); await A.waitForSelector('#rg_u');
    await A.fill('#rg_ad', 'Ada'); await A.fill('#rg_sy', 'Uye'); await A.fill('#rg_u', 'Uye_A'); await A.fill('#rg_t', '0555 222 33 01'); await A.fill('#rg_e', 'a@ornek.com'); await A.fill('#rg_p', 'Uye-Sifre-123'); await A.check('#rg_k');
    await A.click('#modal .pw-eye[data-for=rg_p]'); ok('kayıt sekmesinde de göz düğmesi', (await A.getAttribute('#rg_p', 'type')) === 'text');
    await A.click('form[data-form=registerf] button.btn-primary');
    ok('A kayıt oldu', await modalGone(A) && (await txt(A, '#hdr')).includes('Uye_A'));
    await setTheme(A, 'dark');

    /* ---------- 4. canlı destek: üye ↔ temsilci ---------- */
    ok('masaüstü: "Canlı Destek" düğmesi (açık nokta)', await until(A, () => { const b = document.querySelector('#ls .ls-fab'); return b && /Canlı Destek/.test(b.textContent) && !b.querySelector('.dot.off'); }));
    await A.click('#ls .ls-fab'); await A.waitForSelector('#ls .ls-p #lsmsg');
    await A.fill('#lsmsg', 'Merhaba, bakiye nasıl yüklerim?'); await A.click('#ls form[data-form=ls] button');
    ok('asistan yanıtı geldi (bakiye)', await until(A, () => [...document.querySelectorAll('#lsChat .msg.bot .tx')].some(e => /akiye/i.test(e.textContent))));
    const tkId = sq("SELECT id FROM yp_tickets ORDER BY id DESC LIMIT 1");
    ok('sunucuda talep açıldı', !!tkId && sq(`SELECT status FROM yp_tickets WHERE id=${tkId}`) === 'acik');
    await shot(A, 'destek-uye-1280-gece');
    await A.click('#ls [data-act=ls-agent]');
    ok('temsilciye bağlan: sıra mesajı, durum bekliyor', await until(A, () => /sıra/i.test((document.querySelector('#lsChat') || {}).innerText || '')) && sq(`SELECT status FROM yp_tickets WHERE id=${tkId}`) === 'bekliyor');

    const D = await mk('destek'); await D.goto(B + '/'); await D.waitForSelector('#hdr [data-act=login]'); await login(D, 'DestekCalisan', 'Calisan-Sifre-9');
    await D.waitForSelector('#hdr .hpanel'); await nav(D, 'yonetim', 1200);
    ok('Bugün: canlı destek iş kuyruğu', await until(D, () => /Canlı destek/.test((document.querySelector('#app') || {}).innerText || '')));
    ok('kenar menü: Canlı destek rozeti 1', await until(D, () => { const a = [...document.querySelectorAll('.asb a, .asb-i')].find(x => /Canlı destek/.test(x.textContent)); return a && a.querySelector('.nb') && a.querySelector('.nb').textContent.trim() === '1'; }));
    await shot(D, 'yonetim-bugun-destek-1280');
    await nav(D, 'yonetim/destek/talepler', 1200);
    ok('temsilci: talep listesinde, "Temsilci bekliyor"', await until(D, () => /Temsilci bekliyor/.test((document.querySelector('.tk-list') || {}).innerText || '')));
    await D.click('.tk-list button[data-act=tk]'); await D.waitForTimeout(800);
    await D.click('[data-act=tk-claim]');
    ok('üstlenildi', await toast(D, 'üstlendiniz') && sq(`SELECT agent_id FROM yp_tickets WHERE id=${tkId}`) === uid('DestekCalisan').slice(1));
    ok('üye: "görüşmeye katıldı" yoklamayla geldi', await until(A, () => /görüşmeye katıldı/.test((document.querySelector('#lsChat') || {}).innerText || ''), null, 10000));
    await D.selectOption('select[data-change=canned]', '0');
    ok('hazır yanıt: {temsilci} adla dolduruldu', (await D.inputValue('#tkmsg')).includes('DestekCalisan'));
    await D.fill('#tkmsg', 'Merhaba, ben DestekCalisan. Bakiye yükleme adımlarını anlatayım.');
    const tSend = Date.now(); await D.click('form[data-form=tkreply] button.btn-primary');
    const gotA = await until(A, () => /Bakiye yükleme adımlarını anlatayım/.test((document.querySelector('#lsChat') || {}).innerText || ''), null, 11000); const dtA = Date.now() - tSend;
    ok(`temsilci yanıtı üyeye yoklamayla < 10 sn (${dtA} ms)`, gotA && dtA < 10000);
    await A.fill('#lsmsg', 'Çok teşekkürler, anladım.'); const tSend2 = Date.now(); await A.click('#ls form[data-form=ls] button');
    const gotD = await until(D, () => /Çok teşekkürler, anladım/.test((document.querySelector('#tkChat') || {}).innerText || ''), null, 11000); const dtD = Date.now() - tSend2;
    ok(`üye mesajı temsilciye yoklamayla < 10 sn (${dtD} ms)`, gotD && dtD < 10000);
    await D.fill('#tkmsg', 'yazarken kaybolmamalı');
    await D.waitForTimeout(6000);
    ok('temsilci yazarken yoklama metni silmez', (await D.inputValue('#tkmsg')) === 'yazarken kaybolmamalı');
    await D.fill('#tkmsg', '');
    await shot(D, 'yonetim-destek-1280-gece');
    await setTheme(D, 'light'); await D.waitForTimeout(300); await shot(D, 'yonetim-destek-1280-gunduz'); await setTheme(D, 'dark');
    await D.click('[data-act=tk-close]');
    ok('temsilci kapattı → üyeye değerlendirme', await until(A, () => !!document.querySelector('#lsChat .rate [data-act=tk-rate]'), null, 10000));
    await A.click('#lsChat [data-act=tk-rate][data-n="5"]');
    ok('5 yıldız kaydedildi', await until(A, () => /Değerlendirmeniz için teşekkürler/.test((document.querySelector('#lsChat') || {}).innerText || '')) && sq(`SELECT rating FROM yp_tickets WHERE id=${tkId}`) === '5');

    /* ---------- 5. gizli sekmede yoklama seyrekleşir ---------- */
    await A.fill('#lsmsg', 'Yeni bir sorum var: komisyon ne kadar?'); await A.click('#ls form[data-form=ls] button');
    await until(A, () => /omisyon/.test([...document.querySelectorAll('#lsChat .msg.bot .tx')].map(e => e.textContent).join(' ')));
    let t0 = Date.now(); await A.waitForTimeout(9000);
    const vis = reqs('uye-A', /r=support%2Fticket/, t0);
    await A.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await A.waitForTimeout(4500); t0 = Date.now(); await A.waitForTimeout(16000);
    const hid = reqs('uye-A', /r=support%2Fticket/, t0);
    await A.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    t0 = Date.now(); await A.waitForTimeout(5500);
    const back = reqs('uye-A', /r=support%2Fticket/, t0);
    ok(`yoklama: görünürken 9 sn'de ${vis} istek (≥2), gizliyken 16 sn'de ${hid} (≤1), görünür olunca 5,5 sn'de ${back} (≥1)`, vis >= 2 && hid <= 1 && back >= 1);
    await A.click('#ls [data-act=ls-close]');

    /* ---------- 6. üyeden üyeye mesaj: telefon numarası gizlenir ---------- */
    const Bp = await mk('uye-B'); await Bp.goto(B + '/'); await Bp.waitForSelector('#hdr [data-act=register]');
    const rb = await pcall(Bp, 'POST', 'auth/register', { name: 'Uye_B', email: 'b@ornek.com', tel: '0555 222 33 02', ad: 'Bora', soyad: 'Uye', password: 'Uye-Sifre-123' });
    await Bp.evaluate(() => apiReboot(true).then(() => render()));
    ok('B kayıtlı', rb && rb.me && rb.me.id);
    const UB = rb.me.id;
    await nav(A, 'mesajlar-' + UB, 1200);
    ok('A: konuşma ekranı (canlı; "yakında" yok)', await until(A, () => !!document.querySelector('#app form[data-form=dm] #dmmsg')) && !(await txt(A, '#app')).includes('çok yakında'));
    await A.fill('#dmmsg', 'Merhaba, numaram 0532 111 22 33 whatsapptan yaz');
    await A.click('#app form[data-form=dm] button');
    ok('gönderilen mesajda numara gizlendi + uyarı', await until(A, () => { const c = document.querySelector('#dmChat'); return c && /\[gizlendi\]/.test(c.innerText) && !/0532/.test(c.innerText) && /İletişim bilgisi gizlendi/.test(c.innerText); }) && await toast(A, 'İletişim bilgisi gizlendi'));
    ok('sunucuda sansürlü, orijinal metin engellenen mesajlarda', sq("SELECT COUNT(*) FROM yp_dm_messages WHERE x LIKE '%0532%'") === '0' && sq("SELECT COUNT(*) FROM yp_flagged WHERE orig LIKE '%0532 111 22 33%'") === '1');
    await shot(A, 'mesaj-1280-gece');
    ok('B başlığında okunmamış mesaj rozeti (yoklamayla)', await until(Bp, () => { const i = document.querySelector('#hdr .hmsg i'); return i && i.textContent.trim() === '1'; }, null, 12000));
    await nav(Bp, 'mesajlar', 1200);
    ok('B gelen kutusu: Uye_A konuşması, okunmamış', await until(Bp, () => /Uye_A/.test((document.querySelector('.dm-list') || {}).innerText || '') && !!document.querySelector('.dm-list .dot-un')));
    await Bp.click('.dm-list a'); await Bp.waitForTimeout(1200);
    ok('B konuşmayı açtı: mesaj görünür, rozet kalktı', await until(Bp, () => /\[gizlendi\]/.test((document.querySelector('#dmChat') || {}).innerText || '') && !document.querySelector('#hdr .hmsg i')));
    await Bp.fill('#dmmsg', 'Selam, site üzerinden alalım.'); await Bp.click('#app form[data-form=dm] button');
    ok('A tarafına yoklamayla geldi', await until(A, () => /site üzerinden alalım/.test((document.querySelector('#dmChat') || {}).innerText || ''), null, 10000));

    /* ---------- 7. bildirimler: okundu, tümü okundu ---------- */
    await nav(Bp, 'bildirimler', 800);
    const nUn0 = +sq(`SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB.slice(1)} AND is_read=0`);
    ok('bildirimler sayfası: okunmamışlar listede', nUn0 >= 2 && await Bp.locator('#app .feed.notif a.un').count() >= 2, nUn0);
    await Bp.click('#app .feed.notif a.un[data-act=n-open] >> nth=0'); await Bp.waitForTimeout(800);
    ok('tek bildirim okundu (sunucuda)', +sq(`SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB.slice(1)} AND is_read=0`) === nUn0 - 1);
    await nav(Bp, 'bildirimler', 600); await Bp.click('#app [data-act=n-readall]');
    ok('tümü okundu: sunucuda 0, zil rozeti yok', await toast(Bp, 'okundu') && sq(`SELECT COUNT(*) FROM yp_notifications WHERE user_id=${UB.slice(1)} AND is_read=0`) === '0' && await until(Bp, () => !document.querySelector('#hdr a[href="#bildirimler"] i')));

    /* ---------- 8. Şifremi unuttum: kod ile ---------- */
    rmRl();
    const G = await mk('misafir', { width: 390, height: 844 }); await G.goto(B + '/'); await G.waitForSelector('#hdr');
    await G.evaluate(() => ACT.login()); await G.waitForSelector('#lg_u');
    ok('390 px: giriş penceresi taşmıyor', (await overW(G)) <= 390 && await G.evaluate(() => { const m = document.querySelector('#modal .md'); const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= 390; }));
    await shot(G, 'giris-390-gece');
    await setTheme(G, 'light'); await G.evaluate(() => ACT.login()); await G.waitForSelector('#lg_u'); await shot(G, 'giris-390-gunduz');
    await G.evaluate(() => ACT.register()); await G.waitForSelector('#rg_u'); await shot(G, 'kayit-390-gunduz'); await setTheme(G, 'dark');
    await G.evaluate(() => ACT.login()); await G.waitForSelector('#lg_u');
    await G.fill('#lg_u', 'Uye_A'); await G.click('#modal [data-act=auth-forgot]'); await G.waitForSelector('#fg_u');
    ok('Şifremi unuttum adımı: kullanıcı adı aktarıldı', (await G.inputValue('#fg_u')) === 'Uye_A');
    await shot(G, 'sifremi-unuttum-390');
    await G.click('form[data-form=forgotf] button.btn-primary');
    ok('genel yanıt + kod adımı', await until(G, () => !!document.querySelector('#rs_c')) && (await txt(G, '#modal')).includes('kayıtlı bir hesap varsa'));
    const body = sq("SELECT body FROM yp_outbox WHERE to_addr='a@ornek.com' AND ev='reset' ORDER BY id DESC LIMIT 1");
    const code = (body.match(/\b(\d{6})\b/) || [])[1];
    ok('kod e-postayla gitti', !!code && sq("SELECT status FROM yp_outbox WHERE to_addr='a@ornek.com' AND ev='reset' ORDER BY id DESC LIMIT 1") === 'sent');
    await G.fill('#rs_c', code); await G.fill('#rs_p', 'A-Yeni-Sifre-2026');
    await G.click('#modal .pw-eye[data-for=rs_p]'); ok('yeni şifre alanında göz düğmesi', (await G.getAttribute('#rs_p', 'type')) === 'text');
    await shot(G, 'sifre-yeni-390');
    await G.click('form[data-form=resetf] button.btn-primary');
    ok('şifre değişti → giriş sekmesi, kullanıcı adı dolu', await toast(G, 'Şifreniz değiştirildi') && await until(G, () => document.getElementById('lg_u') && document.getElementById('lg_u').value === 'Uye_A'));
    ok('A\'nın açık oturumu düştü (session_ver)', await until(A, () => !S.cur, null, 15000) || await A.evaluate(() => call('GET', 'poll', null, { quiet: true }).then(() => false, e => e.http === 401)));
    await G.fill('#lg_p', 'A-Yeni-Sifre-2026'); await G.click('form[data-form=loginf] button.btn-primary');
    ok('yeni şifreyle giriş', await modalGone(G) && await G.evaluate(() => !!S.cur && me().name === 'Uye_A'));

    /* ---------- 9. Şifremi unuttum: e-postadaki bağlantı ile ---------- */
    rmRl();
    const r9 = await pcall(Bp, 'POST', 'auth/forgot', { login: 'b@ornek.com' });
    const tok = (sq("SELECT body FROM yp_outbox WHERE to_addr='b@ornek.com' AND ev='reset' ORDER BY id DESC LIMIT 1").match(/sifre-([a-f0-9]{64})/) || [])[1];
    ok('bağlantı e-postada', r9 && r9.sent && !!tok);
    const L = await mk('baglanti'); await L.goto(B + '/#sifre-' + tok); await L.waitForSelector('#hdr');
    ok('bağlantı: yeni şifre penceresi açıldı, adres temizlendi (token adreste kalmadı)', await until(L, () => !!document.querySelector('form[data-form=resetf][data-token] #rs_p')) && !(await L.evaluate(() => location.href)).includes(tok));
    await L.fill('#rs_p', 'B-Yeni-Sifre-2026'); await L.click('form[data-form=resetf] button.btn-primary');
    ok('bağlantıyla şifre değişti → giriş sekmesi (Uye_B)', await toast(L, 'Şifreniz değiştirildi') && await until(L, () => document.getElementById('lg_u') && document.getElementById('lg_u').value === 'Uye_B'));
    await L.goto(B + '/#sifre-' + tok); await L.waitForSelector('form[data-form=resetf] #rs_p'); await L.fill('#rs_p', 'B-Baska-Sifre-1'); await L.click('form[data-form=resetf] button.btn-primary');
    ok('aynı bağlantı ikinci kez: Türkçe hata, pencere açık', await until(L, () => /geçersiz veya süresi dolmuş/.test((document.querySelector('#modal') || {}).innerText || '')));

    /* ---------- 10. mobil Destek: saat içinde sohbet, saat dışında Yardım ---------- */
    siteSet('whatsapp', '0555 000 11 22');
    const P = await mk('mobil', { width: 390, height: 844 }); await P.goto(B + '/'); await P.waitForSelector('#hdr');
    await pcall(P, 'POST', 'auth/login', { login: 'Uye_A', password: 'A-Yeni-Sifre-2026', remember: true }); await P.evaluate(() => apiReboot(true).then(() => render()));
    await P.waitForSelector('#mtab [data-mtab=destek]');
    ok('390 px: masaüstü balonu gizli (alt çubuk var)', await P.evaluate(() => { const b = document.querySelector('#ls .ls-fab'); return !b || getComputedStyle(b).display === 'none'; }));
    await P.click('#mtab [data-mtab=destek]');
    ok('çalışma saatinde Destek → canlı sohbet açıldı', await until(P, () => !!document.querySelector('#ls .ls-p #lsChat')));
    ok('sohbette önceki görüşme (asistanın komisyon yanıtı)', await until(P, () => /omisyon/.test((document.querySelector('#lsChat') || {}).innerText || '')));
    ok('390 px sohbet taşmıyor', (await overW(P)) <= 390);
    await shot(P, 'destek-sohbet-390-gece');
    await setTheme(P, 'light'); await P.evaluate(() => renderLS()); await P.waitForTimeout(200); await shot(P, 'destek-sohbet-390-gunduz'); await setTheme(P, 'dark');
    await P.click('#ls [data-act=ls-close]');
    const offH = {}; for (let d = 0; d < 7; d++) offH[d] = ['00:00', '00:01', false];
    const r10 = await pcall(M, 'PUT', 'admin/settings/support', { mode: 'auto', hours: offH });
    ok('yönetici: tüm günler kapalı (saat dışı)', r10 && r10.support && r10.support.open === false);
    await P.reload(); await P.waitForSelector('#mtab [data-mtab=destek]');
    await P.click('#mtab [data-mtab=destek]');
    ok('saat dışında Destek → Yardım penceresi: WhatsApp hattı ve "şu an kapalı" notu', await until(P, () => !!document.querySelector('#modal #yardim, #modal [id=yardim]') || /Yardım/.test((document.querySelector('#modal') || {}).innerText || ''))
      && await P.locator('#modal a.sh-wa[href^="https://wa.me/90555"]').count() === 1 && (await txt(P, '#modal')).includes('Canlı destek şu an kapalı') && !(await P.locator('#ls .ls-p').count()));
    await shot(P, 'destek-yardim-390-gece');
    await P.click('#modal [data-act=close]').catch(() => {}); await modalGone(P);
    await pcall(M, 'PUT', 'admin/settings/support', { mode: 'closed' });
    await A.reload(); await A.waitForSelector('#hdr');
    ok('destek kapalı: masaüstünde balon yok', await A.locator('#ls .ls-fab').count() === 0);
    await pcall(M, 'PUT', 'admin/settings/support', { mode: 'open' });

    /* ---------- 11. 390 px yönetim + mesajlar ---------- */
    const DM = await mk('destek-mobil', { width: 390, height: 844 }); await DM.goto(B + '/'); await DM.waitForSelector('#hdr');
    await pcall(DM, 'POST', 'auth/login', { login: 'DestekCalisan', password: 'Calisan-Sifre-9' }); await DM.evaluate(() => apiReboot(true));
    await nav(DM, 'yonetim/destek/talepler', 1500);
    ok('390 px temsilci ekranı taşmıyor', await until(DM, () => !!document.querySelector('.tk3')) && (await overW(DM)) <= 390);
    await shot(DM, 'yonetim-destek-390-gece');
    await DM.click('.tk-list button[data-act=tk]'); await DM.waitForTimeout(1000);
    ok('390 px: talep açılınca sohbet bölmesi', await DM.evaluate(() => !!document.querySelector('.tk3.tk-open')) && (await overW(DM)) <= 390);
    await shot(DM, 'yonetim-destek-sohbet-390-gece');
    await nav(DM, 'yonetim/destek/ayarlar', 900); ok('destek ayarları: saatler ve hazır yanıtlar, yapay zekâ seçeneği yok', await DM.locator('#sh_o_1').count() === 1 && await DM.locator('#sp_can').count() === 1 && await DM.locator('#sp_ai').count() === 0);
    await shot(DM, 'yonetim-destek-ayarlar-390');
    await nav(DM, 'yonetim/mesaj', 1200);
    ok('engellenen mesajlar: sansürlenen orijinal metin listede', await until(DM, () => /0532 111 22 33/.test((document.querySelector('#app') || {}).innerText || '')) && (await overW(DM)) <= 390);
    await shot(DM, 'yonetim-mesaj-390');
    await DM.click('#app [data-act=fl-seen] >> nth=0'); await DM.waitForTimeout(700);
    ok('"İncelendi" sunucuya yazıldı', +sq('SELECT COUNT(*) FROM yp_flagged WHERE seen=1') >= 1);
    await nav(DM, 'yonetim/sms/sablonlar', 1200);
    ok('mesaj şablonları: liste, e-posta önizleme, doğrulama kodunda WhatsApp Meta şablonu (sabit)', await until(DM, () => !!document.querySelector('form[data-form=tplsave]')) && await DM.locator('#tpv_m .mailprev').count() === 1);
    await DM.click('.tpl-list [data-act=tplk][data-k=tfa]'); await DM.waitForTimeout(500);
    ok('doğrulama kodu: WhatsApp metni düzenlenemez', await DM.locator('#tp_sb').count() === 0 && (await txt(DM, '.tpl-form')).includes('değiştirilemez'));
    await DM.click('.tpl-list [data-act=tplk][data-k=welcome]'); await DM.waitForTimeout(500);
    await DM.fill('#tp_ms', 'Aramıza hoş geldin {ad}!'); await DM.waitForTimeout(200);
    ok('önizleme canlı güncellenir', (await txt(DM, '#tpv_m')).includes('Aramıza hoş geldin'));
    await DM.click('form[data-form=tplsave] button.btn-primary');
    ok('şablon kaydedildi (sunucu)', await toast(DM, 'Şablon kaydedildi') && sq("SELECT v FROM yp_settings WHERE k='tpl'").includes('Aramıza hoş geldin'));
    ok('390 px şablon ekranı taşmıyor', (await overW(DM)) <= 390);
    await shot(DM, 'yonetim-sablon-390');
    const PB = await mk('mesaj-mobil', { width: 390, height: 844 }, 'light'); await PB.goto(B + '/'); await PB.waitForSelector('#hdr');
    await pcall(PB, 'POST', 'auth/login', { login: 'Uye_B', password: 'B-Yeni-Sifre-2026', remember: true }); await PB.evaluate(() => apiReboot(true).then(() => render()));
    await nav(PB, 'mesajlar-' + uid('Uye_A'), 1500);
    ok('390 px mesajlar taşmıyor', await until(PB, () => !!document.querySelector('#dmChat')) && (await overW(PB)) <= 390);
    await shot(PB, 'mesaj-390-gunduz');
    await PB.evaluate(() => ACT['hs-menu'] ? ACT['hs-menu']() : null); await PB.waitForTimeout(400);
    ok('Hesabım menüsünde "Mesajlarım"', (await txt(PB, '#modal')).includes('Mesajlarım'));
    await shot(PB, 'hesabim-menu-390-gunduz');

    ok('tüm API istekleri index.php?r= biçiminde', badApi.length === 0, badApi.join('\n'));
    ok('konsol / sayfa hatası yok', errs.length === 0, errs.join('\n'));
    const slog = fs.readFileSync(path.join(RUN, 'server.log'), 'utf8');
    ok('sunucu günlüğünde PHP hatası yok', !/PHP (Fatal|Warning|Parse|Notice|Deprecated)/.test(slog), (slog.match(/PHP (Fatal|Warning|Parse|Notice|Deprecated).*/g) || []).slice(0, 5).join('\n'));
  } catch (e) {
    FAIL++; fails.push('istisna'); console.log('FAIL  istisna: ' + (e && e.stack || e));
  } finally {
    await browser.close().catch(() => {});
    srv.kill();
    if (process.env.KEEP !== '1') fs.rmSync(RUN, { recursive: true, force: true }); else console.log('çalışma klasörü: ' + RUN);
    console.log(`\nSONUÇ: ${PASS} geçti, ${FAIL} kaldı${fails.length ? '\n  - ' + fails.join('\n  - ') : ''}\nEkran görüntüleri: ${SHOTS}`);
    process.exit(FAIL ? 1 : 0);
  }
})();
