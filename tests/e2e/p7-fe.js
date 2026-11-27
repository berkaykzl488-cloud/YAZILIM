// P7 ön yüz uçtan uca testi: CANLI PAKET (--prod) geçici klasöre, php -S + tests/http/router.php, YP_TEST=1 + SQLite.
//   Yönetici rehber yazısı ekler (kapak görseli, Markdown, <script> denemesi) ve yayınlar → ziyaretçi rehberde ve yazı sayfasında görür
//   (sunucu içeriği: ?p=rehber/… açılışında H1); ziyaretçi Ortaklık sayfasından başvurur (bal küpü alanı gizli) → yönetici onaylar;
//   yasal sayfa: şirket bilgisi boşken nötr metin, yönetim Şirket & yasal sayfalar'dan doldurur → İletişim/Künye dolu; site ayarları;
//   ETBİS rozeti alt bilgide; Yayına alma kontrol listesi; Yedekler sayfası (yedek al, bakım dışında geri yükleme kapalı);
//   bakım modu: ziyaretçiye bakım sayfası, yöneticiye bakım şeridi; bakımda geri yükleme ve güvenli güncelleme günlüğü.
//   390 px ve 1280 px, gece + gündüz teması: yatay taşma yok; konsol/sayfa hatası yok; tüm API istekleri /api/v1/index.php?r=.
//
//   node tests/e2e/p7-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p7fe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-YAZILIM/c5402d75-b547-55b7-842f-b0b270529f25/scratchpad/p7-fe';
const PORT = +(process.env.PORT || 18700 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const DBF = () => path.join(SITE, 'storage/test.sqlite');
const sq = (sql) => sh('php', ['-r', '$p=new PDO("sqlite:".$argv[1]); $p->exec("PRAGMA busy_timeout=8000"); $s=$p->query($argv[2]); $v=$s?$s->fetchColumn():false; echo $v===false?"":$v;', DBF(), sql]).trim();

sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--out=' + SITE]);
const js = fs.readdirSync(path.join(SITE, 'assets/js/prod'));
ok('canlı pakette P7 ön yüz dosyaları ve widget/ var', js.includes('97p7-admin.js') && js.includes('98p7-actions.js') && fs.existsSync(path.join(SITE, 'widget/yang/index.php')), js.join(','));
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const APW = 'Yonetici-Sifre-2026';
const kur = () => sh('bash', ['-c', `J="${RUN}/k.jar"; k(){ c=$(curl -s -b $J -c $J "${B}/kurulum/" | grep -o 'name="csrf" value="[^"]*"' | head -1 | sed 's/.*value="//;s/"$//'); a=(-s -L -b $J -c $J -o /dev/null --data-urlencode "csrf=$c"); for kv in "$@"; do a+=(--data-urlencode "$kv"); done; curl "\${a[@]}" "${B}/kurulum/"; }
k action=env; k action=dbsave driver=sqlite "sqlite_path=${DBF()}"; k action=schema; k action=site site_name="Yang P7" site_url="${B}"
k action=admin name=Yonetici email=admin@yangpazar.com password=${APW} password2=${APW}; k action=finish`]);
const img = path.join(RUN, 'kapak.png');
sh('php', ['-r', '$i=imagecreatetruecolor(1200,630); imagefill($i,0,0,imagecolorallocate($i,40,90,160)); imagestring($i,5,500,300,"REHBER",imagecolorallocate($i,255,255,255)); imagepng($i,$argv[1]);', img]);

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [], badApi = [], apiReq = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', reducedMotion: 'reduce' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of [45]\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    page.on('request', r => { const u = r.url(); if (!u.startsWith(B)) return; const p = u.slice(B.length);
      if (/^\/api\/v1(\/|\?|$)/.test(p)) { apiReq.push(r.method() + ' ' + p); if (!/^\/api\/v1\/index\.php\?r=/.test(p)) badApi.push(`[${name}] ${r.method()} ${p}`); } });
    return page;
  };
  const shot = (p, n, full) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: full !== false });
  const nav = async (p, r, w) => { await p.evaluate(x => go(x), r); await p.waitForTimeout(w || 600); };
  const txt = (p, s) => p.locator(s || 'body').first().innerText();
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 10000 }); return true; } catch (e) { return false; } };
  const overW = p => p.evaluate(() => document.documentElement.scrollWidth);
  const pcall = (p, m, a, b) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code, http: e.http })), [m, a, b]);
  const cfm = async (p) => { await p.waitForSelector('#cfm:not([hidden])', { timeout: 5000 }); await p.click('#cfm_ok'); };
  const theme = p => p.evaluate(() => { const b = [...document.querySelectorAll('[data-act=theme]')].find(x => x.offsetParent); if (b) b.click(); });
  const apiLogin = async (p, u, pw) => { const r = await pcall(p, 'POST', 'auth/login', { login: u, password: pw }); await p.evaluate(() => apiReboot(true)); await p.waitForTimeout(300); return r; };

  try {
    kur();
    ok('kurulum tamamlandı', fs.existsSync(path.join(SITE, 'storage/kurulum_tamam.php')));
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr');
    const lg = await apiLogin(M, 'Yonetici', APW);
    ok('yönetici girişi', lg && lg.me && lg.me.admin, JSON.stringify(lg));
    await pcall(M, 'POST', 'admin/banks', { b: 'Ziraat Bankası', n: 'YangPazar Ltd', i: 'TR330006100519786457841326' });

    /* ---------- 1. rehber yazısı ---------- */
    await nav(M, 'yonetim/seo/rehber', 1200);
    ok('SEO › Rehber yazıları sunucudan ("yakında" yok), yeni yazı formu', await until(M, () => !!document.querySelector('form[data-form=postadd]')) && !(await txt(M, '.admwrap')).includes('çok yakında'));
    await M.setInputFiles('#pt_cf_new', img);
    ok('kapak görseli yüklendi (önizleme)', await until(M, () => !!document.querySelector('form[data-form=postadd] .p7cover img'), null, 15000));
    await M.fill('#pt_t_new', 'Metin2 Güvenli Yang Alım Rehberi');
    await M.fill('#pt_o_new', 'Yang alırken dolandırılmamak için 5 kural.');
    await M.fill('#pt_sd_new', 'Metin2 yang alırken havuz güvencesi, teslim onayı ve itiraz adımları.');
    await M.fill('#pt_b_new', '## Havuz güvencesi\n\nÖdemeniz **havuzda** bekler.<script>window.__xss=1</script>\n\n- Satıcı puanına bakın\n- [Yang Borsası](#borsa) fiyatlarını karşılaştırın');
    await shot(M, 'yonetim-rehber-yeni');
    await M.click('form[data-form=postadd] button.btn-primary');
    ok('yazı yayınlandı (toast)', await toast(M, 'Yazı yayınlandı'));
    const SLUG = sq("SELECT slug FROM yp_posts ORDER BY id DESC LIMIT 1");
    ok('sunucuda: yayında, kapak bağlı, <script> kaydedilmedi', SLUG === 'metin2-guvenli-yang-alim-rehberi' && sq("SELECT status FROM yp_posts WHERE slug='" + SLUG + "'") === 'yayinda'
      && sq("SELECT cover_id IS NOT NULL FROM yp_posts WHERE slug='" + SLUG + "'") === '1' && !/script|__xss/.test(sq("SELECT body FROM yp_posts WHERE slug='" + SLUG + "'")));
    ok('yönetim listesinde yazı (Yayında)', await until(M, () => /Yayında/.test((document.querySelector('.admwrap') || {}).innerText || '')));
    await shot(M, 'yonetim-rehber-liste');

    const V = await mk('ziyaretci'); await V.goto(B + '/'); await V.waitForSelector('#hdr');
    await nav(V, 'rehber', 800);
    ok('ziyaretçi: rehber listesinde yazı ve kapak', (await txt(V, '#app')).includes('Metin2 Güvenli Yang Alım Rehberi') && await V.locator('#app .rpost img.p7rc').count() === 1);
    await shot(V, 'rehber-liste');
    await nav(V, 'rehber-' + SLUG, 1000);
    ok('yazı sayfası: başlık, sunucu HTML (H2, kalın, liste), betik çalışmadı', await until(V, () => !!document.querySelector('#app .post .prose h2')) && await V.locator('#app .prose b').count() >= 1
      && await V.locator('#app .prose li').count() === 2 && await V.evaluate(() => !window.__xss && !document.querySelector('#app .prose script')));
    await shot(V, 'rehber-yazi');
    const ssr = await (await fetch(B + '/?p=rehber/' + SLUG)).text();
    ok('sunucu tarafı: <title>, description, Article JSON-LD, içerik H1', /<title>Metin2 Güvenli Yang Alım Rehberi \| Yang P7<\/title>/.test(ssr) && ssr.includes('"@type":"Article"') && ssr.includes('<h1>Metin2 Güvenli Yang Alım Rehberi</h1>') && ssr.includes('Metin2 yang alırken havuz güvencesi'));
    ok('site haritasında rehber yazısı', (await (await fetch(B + '/sitemap.xml')).text()).includes('rehber/' + SLUG + '</loc>'));

    /* ---------- 2. ortaklık başvurusu ---------- */
    await nav(V, 'ortaklik', 800);
    ok('Ortaklık sayfası canlı ("yakında" yok), bal küpü alanı görünmez', !(await txt(V, '#app')).includes('çok yakında') && await V.locator('form[data-form=papply]').count() === 1 && await V.evaluate(() => { const r = document.querySelector('#pa_w').getBoundingClientRect(); return r.right < 0 || r.width <= 1; }));
    await V.selectOption('#pa_t', 'server'); await V.fill('#pa_n', 'Ejder Ekibi'); await V.fill('#pa_s', 'Ejder2'); await V.fill('#pa_u', 'https://ejder2.example');
    await V.fill('#pa_l', 'https://ejder2.example/market'); await V.fill('#pa_c', 'discord: ejder#1');
    await shot(V, 'ortaklik-basvuru');
    await V.click('form[data-form=papply] button.btn-primary');
    ok('başvuru gönderildi (toast), sunucuda bekliyor', await toast(V, 'Başvurunuz alındı') && sq("SELECT st FROM yp_partner_apps WHERE n='Ejder Ekibi'") === 'bekliyor');
    await M.evaluate(() => needDrop('adm:bl', 'adm:today')); await nav(M, 'yonetim/seo/backlink', 1200);
    ok('Backlink & ortaklık: başvuru kartı', await until(M, () => !!document.querySelector('[data-act=pa-ok]')));
    await shot(M, 'yonetim-backlink');
    await M.click('[data-act=pa-ok]');
    ok('yönetici onayladı; bağlantı backlink listesine eklendi', await toast(M, 'Başvuru onaylandı') && sq("SELECT st FROM yp_partner_apps WHERE n='Ejder Ekibi'") === 'onay'
      && await until(M, () => /ejder2\.example/.test((document.querySelector('.bltbl') || {}).innerText || '')));

    /* ---------- 3. yasal sayfalar ve şirket bilgisi ---------- */
    await nav(V, 'sayfa-kvkk', 900);
    ok('KVKK (şirket bilgisi boş): yer tutucu yok, nötr metin', await until(V, () => !!document.querySelector('#app .prose h2')) && !(await txt(V, '#app')).includes('[ŞİRKET') && (await txt(V, '#app')).includes('bilgi güncelleniyor'));
    await nav(M, 'yonetim/ayar/yasal', 1200);
    ok('Şirket & yasal sayfalar: eksik uyarısı ve işaretli önizleme', await until(M, () => !!document.querySelector('form[data-form=p7company]')) && (await txt(M, '.admwrap')).includes('Eksik şirket bilgisi') && await M.locator('.p7prev mark.ph').count() > 0);
    await shot(M, 'yonetim-yasal-eksik');
    const co = { unvan: 'YangPazar Bilişim Ltd. Şti.', adres: 'Atatürk Cad. No:1 Kadıköy / İstanbul', vd: 'Kadıköy', vkn: '1234567890', mersis: '0123456789012345', sicil: 'İstanbul 123456', tel: '0850 123 45 67', email: 'destek@yangpazar.com', kep: 'yangpazar@hs01.kep.tr', hosting: 'Örnek Hosting A.Ş.', msg: 'Meta Platforms (WhatsApp Business)' };
    for (const [k, v] of Object.entries(co)) await M.fill('#co_' + k, v);
    await M.click('form[data-form=p7company] .asave button.btn-primary');
    ok('şirket bilgileri kaydedildi; "Yasal sayfalar tamam"', await toast(M, 'Şirket bilgileri kaydedildi') && await until(M, () => /Yasal sayfalar tamam/.test((document.querySelector('.admwrap') || {}).innerText || '')));
    await shot(M, 'yonetim-yasal-tamam');
    await V.evaluate(() => needDrop('page')); await nav(V, 'sayfa-iletisim', 1000);
    const it = await txt(V, '#app');
    ok('İletişim/Künye: şirket bilgileri dolu, köşeli parantez yok', await until(V, () => !!document.querySelector('#app .prose table')) && it.includes('YangPazar Bilişim Ltd. Şti.') && it.includes('0123456789012345') && !/\[[A-ZÇĞİÖŞÜ]/.test(it), it.slice(0, 400));
    await shot(V, 'sayfa-iletisim');
    const fl = await V.evaluate(() => [...new Set([...document.querySelectorAll('#ftr a[href*="sayfa"]')].map(a => a.getAttribute('href')))]);
    ok('alt bilgide 6 yasal / kurumsal sayfa bağlantısı', fl.length === 6, fl.join(','));

    /* ---------- 4. site ayarları, ETBİS ---------- */
    await nav(M, 'yonetim/ayar/genel', 1000);
    ok('Site ayarları › Genel sunucudan', await until(M, () => !!document.querySelector('form[data-form=settings] #st_name')));
    await M.fill('#st_slogan', 'Güvenli oyuncu pazarı'); await M.fill('#st_sh', '10:00-02:00');
    await M.click('form[data-form=settings] .asave button.btn-primary');
    ok('ayarlar kaydedildi (sunucu)', await toast(M, 'Ayarlar kaydedildi') && sq("SELECT v FROM yp_settings WHERE k='site'").includes('Güvenli oyuncu pazarı'));
    await shot(M, 'yonetim-ayar-genel');
    await nav(M, 'yonetim/ayar/etbis', 1000);
    await M.fill('#eb_url', 'https://etbis.ticaret.gov.tr/tr/Home/SearchSiteResult?siteId=abc'); await M.fill('#eb_code', 'ETBIS-1234'); await M.check('#eb_on');
    await M.click('form[data-form=etbisset] .asave button.btn-primary');
    ok('ETBİS kaydedildi', await toast(M, 'ETBİS bilgileri kaydedildi'));
    await shot(M, 'yonetim-etbis');
    await V.reload(); await V.waitForSelector('#ftr');
    ok('ziyaretçi alt bilgisinde ETBİS rozeti (sunucu ayarı)', await V.locator('#ftr .etbis-b').count() === 1 && (await txt(V, '#ftr')).includes('ETBIS-1234'));

    /* ---------- 5. yayına alma kontrol listesi ---------- */
    await nav(M, 'yonetim/ayar/yayin', 1200);
    ok('Yayına alma: 13 madde, sayaç, düzelt bağlantıları', await until(M, () => document.querySelectorAll('.p7chk .seochk > div').length === 13) && /\d+\/11 hazır/.test(await txt(M, '.p7chk')) && await M.locator('.p7chk .seochk a').count() > 0);
    ok('kontrol değerleri: yasal ve ETBİS ve banka tamam, https eksik', await M.locator('[data-gl=legal].ok').count() === 1 && await M.locator('[data-gl=etbis].ok').count() === 1 && await M.locator('[data-gl=bank].ok').count() === 1 && await M.locator('[data-gl=https].no').count() === 1);
    await shot(M, 'yonetim-yayina-alma');

    /* ---------- 6. yedekler ---------- */
    await nav(M, 'yonetim/bakim/yedekler', 1000);
    ok('Yedekler sayfası sunucudan (boş)', await until(M, () => !!document.querySelector('[data-act=bk-now]')) && (await txt(M, '.admwrap')).includes('Henüz yedek yok'));
    await M.click('[data-act=bk-now]');
    ok('yedek alındı; listede, geri yükleme bakım dışında kapalı', await toast(M, 'Yedek alındı') && await until(M, () => !!document.querySelector('[data-act=bk-restore]')) && await M.locator('[data-act=bk-restore]').first().isDisabled());
    await shot(M, 'yonetim-yedekler');

    /* ---------- 7. bakım modu ---------- */
    await nav(M, 'yonetim/bakim/bakim', 1000);
    ok('Bakım modu: sürüm ve güncelleme paneli', await until(M, () => !!document.querySelector('form[data-form=maintset]')) && /sürüm ve güncelleme/i.test(await M.evaluate(() => document.querySelector('.admwrap').textContent)));
    await M.fill('#mt_msg', 'Kısa bir bakım yapıyoruz, 10 dakikaya döneceğiz.'); await M.check('#mt_on');
    await M.click('form[data-form=maintset] button.btn-primary');
    ok('bakım açıldı (toast)', await toast(M, 'Bakım modu açıldı'));
    await shot(M, 'yonetim-bakim-acik');
    await V.reload(); await V.waitForSelector('#app');
    ok('ziyaretçi: bakım sayfası ve mesaj', await until(V, () => !!document.querySelector('#app .maintpg')) && (await txt(V, '#app')).includes('Kısa bir bakım yapıyoruz'));
    await shot(V, 'bakim-sayfasi', false);
    const pa = await pcall(V, 'POST', 'partner-apps', { tp: 'site', n: 'Bakımda', u: 'https://x.example', c: 'x@x.example' });
    ok('ziyaretçi POST → 503 (sunucu)', pa && pa.http === 503, JSON.stringify(pa));
    await nav(M, 'home', 800);
    ok('yönetici sitede bakım şeridini görür', await M.locator('#app .maintbar').count() === 1);
    await nav(M, 'yonetim/bakim/yedekler', 1000);
    ok('bakımda geri yükleme açık', await until(M, () => { const b = document.querySelector('[data-act=bk-restore]'); return b && !b.disabled; }));
    await M.locator('[data-act=bk-restore]').first().click(); await cfm(M);
    ok('geri yüklendi; günlük ve defter denetimi gösterildi', await toast(M, 'Yedek geri yüklendi', 15000) && await until(M, () => /Defter denetimi geçti/.test((document.querySelector('.admwrap') || {}).innerText || '')));
    await shot(M, 'yonetim-geri-yukleme');
    await nav(M, 'yonetim/bakim/bakim', 1000);
    await M.uncheck('#mt_on'); await M.click('form[data-form=maintset] button.btn-primary');
    ok('bakım kapatıldı', await toast(M, 'Bakım modu kapatıldı'));
    await M.click('[data-act=safe-update]');
    ok('güvenli güncelleme: sonuç günlüğü', await toast(M, 'Güncelleme tamamlandı', 15000) && await until(M, () => !!document.querySelector('.p7log li')));
    await shot(M, 'yonetim-guvenli-guncelleme');
    await V.reload(); await V.waitForSelector('#app');
    ok('bakım kapandı: ziyaretçi siteyi görür', !(await V.locator('#app .maintpg').count()));

    /* ---------- 8. 1280 px iki tema, 390 px iki tema ---------- */
    const over = [];
    const chk = async (p, n, w) => { const x = await overW(p); if (x > w) over.push(n + ':' + x); };
    for (const r of ['yonetim/ayar/yasal', 'yonetim/ayar/yayin', 'yonetim/bakim/yedekler', 'yonetim/seo/rehber']) { await nav(M, r, 900); await chk(M, '1280:' + r, 1280); }
    await theme(M); await M.waitForTimeout(200);
    for (const [r, n] of [['yonetim/bakim/yedekler', 'yedekler'], ['yonetim/ayar/yayin', 'yayina-alma'], ['yonetim/ayar/yasal', 'yasal'], ['yonetim/bakim/bakim', 'bakim']]) { await nav(M, r, 900); await chk(M, '1280-t2:' + r, 1280); await shot(M, 'tema2-yonetim-' + n); }
    for (const r of ['rehber', 'rehber-' + SLUG, 'sayfa-kvkk', 'ortaklik']) { await nav(V, r, 900); await chk(V, '1280:' + r, 1280); }
    await theme(V); await V.waitForTimeout(200); await nav(V, 'rehber-' + SLUG, 900); await shot(V, 'tema2-rehber-yazi'); await nav(V, 'sayfa-iletisim', 900); await shot(V, 'tema2-sayfa-iletisim');
    const P = await mk('mobil-390', { width: 390, height: 844 }); await P.goto(B + '/'); await P.waitForSelector('#hdr');
    for (const [r, n] of [['rehber', 'rehber'], ['rehber-' + SLUG, 'rehber-yazi'], ['sayfa-iletisim', 'sayfa-iletisim'], ['ortaklik', 'ortaklik']]) { await nav(P, r, 900); await chk(P, '390:' + r, 390); await shot(P, 'mobil-' + n + '-390'); }
    await theme(P); await P.waitForTimeout(200); await nav(P, 'sayfa-kvkk', 900); await chk(P, '390-t2:kvkk', 390); await shot(P, 'mobil-kvkk-tema2-390');
    await apiLogin(P, 'Yonetici', APW);
    for (const [r, n] of [['yonetim/bakim/yedekler', 'yedekler'], ['yonetim/bakim/bakim', 'bakim'], ['yonetim/ayar/yayin', 'yayina-alma'], ['yonetim/ayar/yasal', 'yasal'], ['yonetim/seo/rehber', 'rehber'], ['yonetim/seo/backlink', 'backlink'], ['yonetim/ayar/etbis', 'etbis']]) {
      await nav(P, r, 1000); await chk(P, '390-t2:' + r, 390); await shot(P, 'mobil-yonetim-' + n + '-tema2-390'); }
    await theme(P); await P.waitForTimeout(200);
    for (const [r, n] of [['yonetim/bakim/yedekler', 'yedekler'], ['yonetim/ayar/yayin', 'yayina-alma']]) { await nav(P, r, 1000); await chk(P, '390:' + r, 390); await shot(P, 'mobil-yonetim-' + n + '-390'); }
    ok('390 px ve 1280 px, iki tema: yatay taşma yok (ziyaretçi + yönetim)', over.length === 0, over.join(', '));

    /* ---------- 9. API adresleri, hatalar ---------- */
    ok('tüm API istekleri /api/v1/index.php?r= biçiminde', badApi.length === 0 && apiReq.length > 30, badApi.slice(0, 5).join(' | ') + ` (toplam ${apiReq.length})`);
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
