// P5 ön yüz uçtan uca testi (reklam satışı, çekiliş & şans çarkı, VIP, davet): CANLI PAKET (--prod) geçici klasöre, php -S +
// tests/http/router.php, YP_TEST=1 + SQLite.
//   Davet linki (#davet-KOD) yakalanır → üyelik formunda kod otomatik → kayıtta ref_by; üye A: Reklam Ver (paket, süre, takvimden gün,
//   server, metin, görsel yükleme) → bakiyeden ödeme, "onay bekliyor"; Hesabım › Reklamlarım; yönetici: Reklam satışları › Onay
//   bekleyenler (rozet) → "Onayla ve yayına al" → ana sayfada banner (görselli) ve gösterim sayacı; A: şans çarkı (ödül sunucuda,
//   ikinci çevirme yok); yönetici çekiliş açar, A ücretsiz bilet alır, yönetici kazananı çeker ve doğrular; VIP & Puan sayfası,
//   Davet et kazan; yönetim VIP / davet / geri kazan / çark sayfaları. Konsol/sayfa hatası yok, 390 px taşma yok, gece + gündüz teması.
//   Rotalar route() ile denetlenir (temiz adres/hash bağımsız). Tüm API istekleri /api/v1/index.php?r= biçiminde.
//
//   node tests/e2e/p5-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p5fe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-YAZILIM/c5402d75-b547-55b7-842f-b0b270529f25/scratchpad/p5-fe';
const PORT = +(process.env.PORT || 19800 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const DBF = () => path.join(SITE, 'storage/test.sqlite');
const sq = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $s=$p->query($argv[2]); $v=$s?$s->fetchColumn():false; echo $v===false?"":$v;', DBF(), sql]).trim();

/* ---------- 1. paket + sunucu ---------- */
sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--out=' + SITE]);
const js = fs.readdirSync(path.join(SITE, 'assets/js/prod'));
ok('canlı pakette P5 ön yüz dosyaları var', js.includes('97p5-growth.js') && js.includes('98p5-actions.js'), js.join(','));
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const APW = 'Yonetici-Sifre-2026';
const kur = () => sh('bash', ['-c', `J="${RUN}/k.jar"; k(){ c=$(curl -s -b $J -c $J "${B}/kurulum/" | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//'); a=(-s -L -b $J -c $J -o /dev/null --data-urlencode "csrf=$c"); for kv in "$@"; do a+=(--data-urlencode "$kv"); done; curl "\${a[@]}" "${B}/kurulum/"; }
k action=env; k action=dbsave driver=sqlite "sqlite_path=${DBF()}"; k action=schema; k action=site site_name="Yang P5" site_url="${B}"
k action=admin name=Yonetici email=admin@yangpazar.com password=${APW} password2=${APW}; k action=finish`]);
const img = path.join(RUN, 'ad.png');
sh('php', ['-r', '$i=imagecreatetruecolor(300,250); imagefill($i,0,0,imagecolorallocate($i,190,40,60)); imagestring($i,5,40,110,"YENI SERVER",imagecolorallocate($i,255,255,255)); imagepng($i,$argv[1]);', img]);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [], badApi = [], apiReq = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', reducedMotion: 'reduce' });
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
  const nav = async (p, r, w) => { await p.evaluate(x => go(x), r); await p.waitForTimeout(w || 500); };
  const at = (p, r) => p.evaluate(x => route() === x, r);
  const txt = (p, s) => p.locator(s || 'body').first().innerText();
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 10000 }); return true; } catch (e) { return false; } };
  const overW = p => p.evaluate(() => document.documentElement.scrollWidth);
  const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const pcall = (p, m, a, b) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code, http: e.http })), [m, a, b]);
  const cfm = async (p) => { await p.waitForSelector('#cfm:not([hidden])', { timeout: 5000 }); await p.click('#cfm_ok'); };
  const tab = async (p, t) => { await nav(p, 'hesabim', 300); await p.click(`#app nav.tabs [data-act=tab][data-t=${t}]`); await p.waitForTimeout(700); };
  const uid = n => sq(`SELECT id FROM yp_users WHERE name='${n}'`);

  try {
    kur();
    ok('kurulum tamamlandı', fs.existsSync(path.join(SITE, 'storage/kurulum_tamam.php')));
    const PV = sq("SELECT id FROM yp_servers WHERE sec='pvp' AND active=1 AND deleted_at IS NULL ORDER BY sort, id LIMIT 1");

    /* ---------- 2. davet eden + davet linki yakalama ---------- */
    const R = await mk('davetci'); await R.goto(B + '/'); await R.waitForSelector('#hdr');
    const rr = await pcall(R, 'POST', 'auth/register', { name: 'Davetci_R', email: 'r@ornek.com', tel: '0555 111 22 08', ad: 'Rıza', soyad: 'Davet', password: 'Uye-Sifre-123' });
    ok('davet eden üye (R) kayıtlı', rr && rr.me && rr.me.id, JSON.stringify(rr));
    await R.evaluate(() => apiReboot(true));
    const A = await mk('reklamci');
    await A.goto(B + '/#davet-DAVETCIR26'); await A.waitForSelector('#hdr');
    ok('davet linki: kod saklandı, ana sayfaya dönüldü, üyelik penceresi açıldı', await until(A, () => !!document.querySelector('#modal form[data-form=registerf]')) && await A.evaluate(() => localStorage.getItem('yangpazar_ref') === 'DAVETCIR26' && route() === 'home'));
    ok('üyelik formunda davet kodu otomatik', (await A.inputValue('#rg_ref')) === 'DAVETCIR26');
    await shot(A, 'davet-linki-uyelik', false);
    await A.fill('#rg_ad', 'Rana'); await A.fill('#rg_sy', 'Reklam'); await A.fill('#rg_u', 'Reklamci_A'); await A.fill('#rg_t', '0555 111 22 01'); await A.fill('#rg_e', 'a@ornek.com'); await A.fill('#rg_p', 'Reklam-Sifre-2026'); await A.check('#rg_k');
    await A.click('form[data-form=registerf] button.btn-primary');
    ok('A davet koduyla üye oldu (ref_by = R)', await modalGone(A) && sq("SELECT ref_by FROM yp_users WHERE name='Reklamci_A'") === uid('Davetci_R'));

    /* ---------- 3. yönetici ---------- */
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap'); ok('yönetici girişi', await M.evaluate(() => isAdmRoute(route())));
    const f1 = await pcall(M, 'POST', 'admin/balance', { user: 'Reklamci_A', amount: 400, w: true, note: 'Havale (test)' });
    const f2 = await pcall(M, 'POST', 'admin/balance', { user: 'Reklamci_A', amount: 100, w: false, note: 'Kart yüklemesi (test)' });
    ok('A: 400 çekilebilir + 100 yalnız alışveriş', !f1.err && !f2.err && sq(`SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=${uid('Reklamci_A')}`) === '40000/10000');

    /* ---------- 4. A: Reklam Ver ---------- */
    await A.reload(); await A.waitForSelector('#hdr');
    await nav(A, 'reklam-ver', 700);
    ok('Reklam Ver sayfası canlı ("yakında" yok), paketler ve takvim', await at(A, 'reklam-ver') && !(await txt(A, '#app')).includes('çok yakında') && await A.locator('#app .packs .pack').count() === 7 && await A.locator('#adCal .cal-d').count() === 42);
    await A.click('#app .packs [data-act=pick-ad][data-type=banner]'); await A.waitForTimeout(600);
    ok('banner seçildi: ölçü notu ve görsel alanı', (await txt(A, '#app')).includes('300 × 250') && await A.locator('#ad_media').count() === 1);
    await A.click('label[for=dur0]'); await A.waitForTimeout(300);
    await A.locator('#adCal .cal-d:not([disabled])').first().click(); await A.waitForTimeout(250);
    ok('takvimden gün seçildi: "Bu tarihler boş"', (await txt(A, '#adCal')).includes('Bu tarihler boş'));
    await A.fill('#ad_title', 'Büyük açılış'); await A.fill('#ad_text', '1-120 Orta Emek · açılışa özel paket');
    await A.setInputFiles('#ad_media', img); await A.waitForTimeout(300);
    await shot(A, 'reklam-ver-form');
    await A.click('#app form[data-form=buyad] button.btn-primary');
    ok('rezervasyon alındı (toast), onaya gönderildi', await toast(A, 'Rezervasyon alındı', 12000));
    const AD = sq("SELECT id FROM yp_ads WHERE type='banner' ORDER BY id DESC LIMIT 1");
    ok('sunucuda: banner, onay bekliyor, 120 TL (önce 100 TL yalnız alışveriş), görsel bağlı', !!AD && sq(`SELECT status||'/'||price||'/'||paid_credit||'/'||paid_cash FROM yp_ads WHERE id=${AD}`) === 'onay/12000/10000/2000'
      && sq(`SELECT COUNT(*) FROM yp_ad_media WHERE ad_id=${AD}`) === '1' && sq(`SELECT cash||'/'||credit FROM yp_wallets WHERE user_id=${uid('Reklamci_A')}`) === '38000/0');
    ok('Rezervasyonlarım tablosu: onay bekliyor', await until(A, () => /Onay bekliyor/.test((document.querySelector('#app') || {}).innerText || '')));
    await shot(A, 'reklam-ver-sonra');
    await tab(A, 'reklam');
    ok('Hesabım › Reklamlarım: kart "Onay bekliyor"', await until(A, () => !!document.querySelector('#app .adc.onay')) && (await txt(A, '#app .adc')).includes('Kenar Banner'));
    await shot(A, 'hesabim-reklamlarim');

    /* ---------- 5. yönetici onaylar → ana sayfada ---------- */
    await M.evaluate(() => { needDrop('adm:today'); }); await nav(M, 'yonetim/reklam/onay', 1200);
    ok('Onay bekleyenler: başvuru kartı ve rozet', await until(M, () => !!document.querySelector('.adq [data-act=ad-ok]')) && await M.evaluate(() => admQn('reklam') === 1));
    await shot(M, 'yonetim-reklam-onay');
    await M.click('.adq [data-act=ad-ok]');
    ok('yönetici onayladı: gelir yazıldı', await toast(M, 'Reklam onaylandı') && sq(`SELECT status FROM yp_ads WHERE id=${AD}`) === 'onayli'
      && sq("SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='REV:ads'") === '12000');
    await nav(M, 'yonetim/reklam/tum', 1000);
    ok('Tüm reklamlar: satır, Durdur / +7 gün / Sil', await M.locator(`tr[data-aid=a${AD}] [data-act=ad-toggle]`).count() === 1 && (await txt(M, `tr[data-aid=a${AD}]`)).includes('Yayında'));
    await shot(M, 'yonetim-reklam-tum');
    const V = await mk('ziyaretci'); await V.goto(B + '/'); await V.waitForSelector('#app .home');
    ok('ana sayfa: onaylı banner sağ sütunda, görseliyle', await until(V, id => { const a = document.querySelector(`#app .rcol .ban[data-adc="a${id}"]`); return a && a.querySelector('.admedia[data-ok] img'); }, AD) && (await V.locator('#app .rcol').first().textContent()).includes('Büyük açılış'));
    ok('gösterim sayacı (beacon) sunucuya ulaştı', await (async () => { for (let i = 0; i < 20; i++) { if (+sq(`SELECT views FROM yp_ads WHERE id=${AD}`) >= 1) return true; await sleep(300); } return false; })());
    await shot(V, 'ana-sayfa-banner', false);

    /* ---------- 6. şans çarkı ---------- */
    await nav(A, 'cekilis', 800);
    ok('Çekiliş & Şans Çarkı sayfası canlı, çark çizildi', await at(A, 'cekilis') && await A.locator('#wheel path').count() === 8 && await A.locator('#spinBtn').count() === 1);
    const P0 = sq(`SELECT pts FROM yp_users WHERE id=${uid('Reklamci_A')}`);
    await A.click('#spinBtn');
    ok('çevirme: ödül toast\'ı, sunucuda tek kayıt', await toast(A, 'Tebrikler', 9000) && sq(`SELECT COUNT(*) FROM yp_spins WHERE user_id=${uid('Reklamci_A')}`) === '1');
    ok('ikinci çevirme yok: "Bugünkü hakkını kullandın"', await until(A, () => !document.querySelector('#spinBtn') && /Bugünkü hakkını kullandın/.test(document.querySelector('#app').innerText)));
    const sp = sq(`SELECT k||':'||v FROM yp_spins WHERE user_id=${uid('Reklamci_A')}`);
    ok('ödül doğru yere: bakiye → kredi, puan → puan', sp.startsWith('bal:') ? sq(`SELECT credit FROM yp_wallets WHERE user_id=${uid('Reklamci_A')}`) === sp.slice(4) : sp.startsWith('pt:') ? +sq(`SELECT pts FROM yp_users WHERE id=${uid('Reklamci_A')}`) === +P0 + +sp.slice(3) : sp.startsWith('tk:'), sp);
    const again = await pcall(A, 'POST', 'spin', {});
    ok('API ile ikinci çevirme → 409', again.http === 409);
    await shot(A, 'cekilis-cark');

    /* ---------- 7. çekiliş: yönetici açar, üye ücretsiz bilet, yönetici çeker ---------- */
    await nav(M, 'yonetim/kampanya/cekilis', 1000);
    await M.fill('#rf_t', '50 TL bakiye çekilişi'); await M.fill('#rf_v', '50'); await M.click('form[data-form=raffle] button.btn-primary');
    ok('çekiliş başladı (yönetim)', await toast(M, 'Çekiliş başladı') && sq('SELECT COUNT(*) FROM yp_raffles') === '1');
    const RF = 'r' + sq('SELECT id FROM yp_raffles LIMIT 1');
    await A.evaluate(() => needDrop('camp')); await nav(A, 'home', 200); await nav(A, 'cekilis', 1200);
    ok('üye çekiliş kartı ve ücretsiz bilet düğmesi', await until(A, () => !!document.querySelector('#app .raffle [data-act=free-tk]:not([disabled])')));
    await A.click('#app .raffle [data-act=free-tk]');
    ok('ücretsiz bilet alındı, düğme kilitlendi, biletim 1', await toast(A, 'Ücretsiz biletin eklendi') && await until(A, () => { const b = document.querySelector('#app .raffle [data-act=free-tk]'); return b && b.disabled && /Bugünkü ücretsiz biletini aldın/.test(b.textContent); })
      && sq(`SELECT n FROM yp_raffle_tickets WHERE user_id=${uid('Reklamci_A')}`) === '1');
    await shot(A, 'cekilis-bilet');
    await M.evaluate(() => needDrop('adm:raffles')); await nav(M, 'yonetim/kampanya/cark', 300); await nav(M, 'yonetim/kampanya/cekilis', 1000);
    await M.click(`tr[data-rid=${RF}] [data-act=draw]`); await cfm(M);
    ok('yönetici kazananı çekti: A (tek bilet), bakiye ödülü kredide', await toast(M, 'Kazanan: Reklamci_A') && sq(`SELECT winner_id FROM yp_raffles WHERE id=${RF.slice(1)}`) === uid('Reklamci_A')
      && sq(`SELECT credit FROM yp_wallets WHERE user_id=${uid('Reklamci_A')}`) !== '0');
    await until(M, id => !!document.querySelector(`tr[data-rid=${id}] [data-act=p5-rverify]`), RF);
    await M.click(`tr[data-rid=${RF}] [data-act=p5-rverify]`);
    ok('doğrulama penceresi: sonuç doğrulandı, tohum görünür', await until(M, () => /Sonuç doğrulandı/.test((document.querySelector('#modal') || {}).innerText || '')) && /[0-9a-f]{64}/.test(await txt(M, '#modal')));
    await shot(M, 'yonetim-cekilis-dogrula', false);
    await M.click('#modal [data-act=close]');
    ok('denetim kaydı: raffle_draw', sq("SELECT COUNT(*) FROM yp_audit_log WHERE action='raffle_draw'") === '1');
    await shot(M, 'yonetim-cekilisler');
    await nav(M, 'yonetim/kampanya/cark', 900);
    ok('Şans çarkı yönetimi: anahtar, dilimler, bugünkü çevirme', await M.locator('#wh_on').isChecked() && await M.locator('form[data-form=p5prizes] .p5prz').count() === 8 && (await txt(M, '.apage')).includes('Bugün çevirme'));
    await shot(M, 'yonetim-cark');

    /* ---------- 8. VIP & Puan, Davet et kazan ---------- */
    await tab(A, 'puan');
    ok('Hesabım › VIP & Puan: seviye, ilerleme, 4 seviyelik tablo', (await txt(A, '#app')).includes('Seviyeniz') && await A.locator('#app .viptbl > div').count() === 4 && await A.locator('#app .viptbl > div.on').count() === 1);
    await shot(A, 'hesabim-vip');
    await R.reload(); await R.waitForSelector('#hdr'); await tab(R, 'davet');
    ok('Davet et kazan: link, kod ve davet edilen (ilk alışveriş bekleniyor)', await until(R, () => !!document.querySelector('#p5Refs')) && (await txt(R, '#p5Refs')).includes('Reklamci_A') && (await txt(R, '#p5RefLink')).includes('DAVETCIR26'));
    await shot(R, 'hesabim-davet');
    await tab(A, 'profil');
    await A.uncheck('#mk_mail'); await A.click('form[data-form=p5mkt] button');
    ok('Profil › kampanya e-postası kapatıldı', await toast(A, 'İleti tercihlerin kaydedildi') && sq(`SELECT mail FROM yp_mkt_optout WHERE user_id=${uid('Reklamci_A')}`) === '1');
    await nav(M, 'yonetim/vip/seviyeler', 900);
    await M.fill('#vp_d_1', '1'); await M.click('form[data-form=vipset] .asave button.btn-primary').catch(() => M.click('form[data-form=vipset] button.btn-primary'));
    ok('yönetim VIP seviyeleri kaydedildi (sunucu)', await toast(M, 'VIP seviyeleri kaydedildi') && JSON.parse(sq("SELECT v FROM yp_settings WHERE k='vip'") || '[]')[1].disc === 1);
    await shot(M, 'yonetim-vip');
    await nav(M, 'yonetim/vip/davet', 900);
    ok('yönetim davet sayfası: ayarlar ve davet listesi', await until(M, () => !!document.querySelector('#p5RefTbl')) && (await txt(M, '#p5RefTbl')).includes('Reklamci_A'));
    await shot(M, 'yonetim-davet');
    sq(`UPDATE yp_users SET last_seen=1, created_at=1 WHERE name='Davetci_R'`); // hareketsiz
    await nav(M, 'yonetim/uye/geri-kazan', 1000);
    ok('Geri kazan: hareketsiz üye listesi', await until(M, () => !!document.querySelector('#p5WbTbl')) && (await txt(M, '#p5WbTbl')).includes('Davetci_R'));
    await M.click('form[data-form=winback] button.btn-primary');
    ok('geri kazanım gönderildi (site bildirimi)', await toast(M, /1 üyeye gönderildi/) && sq("SELECT COUNT(*) FROM yp_winback") === '1');
    await shot(M, 'yonetim-geri-kazan');

    /* ---------- 9. tema + 390 px ---------- */
    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await P.waitForSelector('#hdr');
    const over = []; const chk = async n => { const w = await overW(P); if (w > 390) over.push(n + ':' + w); };
    for (const r of ['home', 'reklam-ver', 'cekilis']) { await nav(P, r, 700); await chk(r); }
    await shot(P, 'mobil-cekilis-390');
    await login(P, 'Reklamci_A', 'Reklam-Sifre-2026'); await modalGone(P);
    for (const t of ['reklam', 'puan', 'davet']) { await tab(P, t); await chk('hesabim/' + t); }
    await shot(P, 'mobil-vip-390');
    await P.evaluate(() => document.querySelector('#hdr [data-act=theme]').click()); await P.waitForTimeout(200);
    for (const r of ['reklam-ver', 'cekilis']) { await nav(P, r, 700); await chk(r + '-tema2'); }
    await shot(P, 'mobil-reklam-ver-tema2-390'); await tab(P, 'puan'); await chk('puan-tema2'); await shot(P, 'mobil-vip-tema2-390');
    await P.evaluate(() => document.querySelector('#hdr [data-act=theme]').click());
    await nav(P, 'hesabim', 300); await P.click('#app .page-h [data-act=logout]'); await toast(P, 'Çıkış yapıldı');
    await login(P, 'Yonetici', APW); await modalGone(P);
    const ADM = ['yonetim/reklam/onay', 'yonetim/reklam/tum', 'yonetim/reklam/gorseller', 'yonetim/reklam/fiyatlar', 'yonetim/kampanya/cekilis', 'yonetim/kampanya/cark', 'yonetim/vip/seviyeler', 'yonetim/vip/davet', 'yonetim/uye/geri-kazan'];
    for (const r of ADM) { await nav(P, r, 900); await chk(r); }
    await nav(P, 'yonetim/reklam/tum', 800); await shot(P, 'mobil-yonetim-reklam-390');
    await P.evaluate(() => [...document.querySelectorAll('[data-act=theme]')].find(b => b.offsetParent).click()); await P.waitForTimeout(200);
    for (const r of ['yonetim/kampanya/cekilis', 'yonetim/kampanya/cark', 'yonetim/reklam/fiyatlar']) { await nav(P, r, 900); await chk(r + '-tema2'); }
    await shot(P, 'mobil-yonetim-cark-tema2-390');
    ok('390 px: yatay taşma yok (üye + yönetim, iki tema)', over.length === 0, over.join(', '));
    const thm = await P.evaluate(() => document.documentElement.dataset.theme);
    ok('tema değişti', ['light', 'dark'].includes(thm));
    await M.evaluate(() => [...document.querySelectorAll('[data-act=theme]')].find(b => b.offsetParent).click()); await nav(M, 'yonetim/reklam/fiyatlar', 900); await shot(M, 'yonetim-reklam-fiyatlar-tema2');
    await nav(V, 'cekilis', 800); await V.evaluate(() => document.querySelector('#hdr [data-act=theme]').click()); await V.waitForTimeout(300); await shot(V, 'cekilis-ziyaretci-tema2');
    await nav(V, 'reklam-ver', 800); await shot(V, 'reklam-ver-ziyaretci-tema2');

    /* ---------- 10. API adresleri, hatalar ---------- */
    ok('tüm API istekleri /api/v1/index.php?r= biçiminde', badApi.length === 0 && apiReq.length > 30, badApi.slice(0, 5).join(' | ') + ` (toplam ${apiReq.length})`);
    ok('defter tutarlı (postings toplamı 0; ESCROW:ADS = onay bekleyen)', sq('SELECT COALESCE(SUM(amount),0) FROM yp_postings') === '0'
      && sq("SELECT COALESCE(SUM(p.amount),0) FROM yp_postings p JOIN yp_accounts a ON a.id=p.account_id WHERE a.code='ESCROW:ADS'") === sq("SELECT COALESCE(SUM(price),0) FROM yp_ads WHERE status='onay'"));
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
