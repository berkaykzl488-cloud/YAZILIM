// P1 ön yüz uçtan uca testi (katalog & SEO): CANLI PAKET (--prod --zip --update-zip) geçici klasöre açılır, php -S + tests/http/router.php,
// YP_TEST=1 + SQLite. Kurulum sihirbazı arayüzden; iki üye (satıcı A, alıcı B) + yönetici:
//   A 3 fotoğraflı ilan verir (biri büyük: tarayıcıda ≤1600 px'e küçültülür), B Metin2 TR → server → kategori/arama/sıralama → ilan (görüntülenme +1),
//   üst arama önerileri, satıcı profili, ilan onayı açıkken ilan yönetici onaylayana kadar gizli (Yönetim › İlanlar), A düzenler / kaldırır / üste taşır,
//   yönetici Serverlar çekmecesinde ekler / düzenler / siler, >24 ilanla "Daha fazla" (anahtar kümesi), Bakım › Güncellemeleri uygula,
//   SEO: /index.php?p=ilan/<slug>-l<id> ham HTML'inde <title> ve canonical, temiz adres açılışı. Tüm API istekleri /api/v1/index.php?r= biçiminde.
//   Konsol/sayfa hatası yok, 390 px taşma yok, gece + gündüz teması. Son olarak güncelleme paketi kurulu sitenin üzerine açılır (storage/ korunur).
//
//   node tests/e2e/p1-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p1fe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || path.join(RUN, 'shots');
const PORT = +(process.env.PORT || 19000 + Math.floor(Math.random() * 900));
const B = `http://127.0.0.1:${PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let PASS = 0, FAIL = 0; const fails = [];
const ok = (name, cond, info) => { if (cond) { PASS++; console.log('PASS  ' + name); } else { FAIL++; fails.push(name); console.log('FAIL  ' + name + (info ? '\n      → ' + String(info).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args, o) => cp.execFileSync(cmd, args, Object.assign({ encoding: 'utf8' }, o || {}));
const zipList = z => sh('php', ['-r', '$z=new ZipArchive; $z->open($argv[1]); for($i=0;$i<$z->numFiles;$i++) echo $z->getNameIndex($i),"\\n";', z]).split('\n').filter(Boolean);
const unzip = (z, to) => sh('php', ['-r', '$z=new ZipArchive; if($z->open($argv[1])!==true) exit(1); $z->extractTo($argv[2]); $z->close();', z, to]);

/* ---------- 1. paket: --prod --zip --update-zip ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--update-zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
const UZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-guncelleme-.*\.zip$/.test(f));
ok('derleme: kurulum zip\'i, kurulum kodu ve güncelleme zip\'i üretildi', !!CODE && !!ZIP && !!UZIP, out);
const list = zipList(path.join(BUILD, ZIP));
ok('kurulum zip\'i: P1 ön yüz dosyaları var, güncelleme zip\'i içine girmemiş', ['assets/js/prod/97p1-catalog.js', 'assets/js/prod/98p1-actions.js', 'index.php', 'storage/kurulum_kodu.php'].every(f => list.includes(f)) && !list.some(f => /yangpazar-(site|guncelleme)/.test(f)));
const ulist = zipList(path.join(BUILD, UZIP));
ok('güncelleme zip\'i: index.php, assets/, app/, api/v1, kurulum/, .htaccess, uploads korumaları var',
  ['index.php', '.htaccess', 'assets/app.css', 'assets/js/prod/97p1-catalog.js', 'app/bootstrap.php', 'app/routes/40_catalog.php', 'api/v1/index.php', 'kurulum/index.php', 'uploads/.htaccess', 'uploads/index.php'].every(f => ulist.includes(f)), ulist.slice(0, 40).join(','));
ok('güncelleme zip\'i: storage/ (kurulum kodu dahil), test kancası, demo dosyaları yok', !ulist.some(f => /^storage(\/|$)/.test(f) || f === 'app/routes/90_test.php' || /assets\/js\/demo\//.test(f) || /^uploads\/.+\/.+/.test(f) || /^(src|tests|tools|docs)\//.test(f)), ulist.filter(f => /^storage|90_test/.test(f)).join(','));
unzip(path.join(BUILD, ZIP), SITE);
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));
const idx = fs.readFileSync(path.join(SITE, 'index.php'), 'utf8');
ok('index.php: Seo::forRequest() ve <base> başlığa yazılıyor, statik <title> yok', /YP\\Seo::forRequest\(\)/.test(idx) && /<\?php echo \$ypHead; \?>/.test(idx) && !/<title>yangpazar\.com · Metin2/.test(idx.split('?>').slice(1).join('?>')));

/* ---------- 2. test görselleri (PHP GD): büyük JPEG (3200×2400) + iki küçük ---------- */
const IMG = path.join(RUN, 'img'); fs.mkdirSync(IMG);
const gen = (f, w, h, kind, q) => sh('php', ['-r', `$w=${w};$h=${h};$im=imagecreatetruecolor($w,$h);mt_srand(${w});for($i=0;$i<($w*$h/2500);$i++){imagefilledellipse($im,mt_rand(0,$w),mt_rand(0,$h),mt_rand(8,160),mt_rand(8,160),imagecolorallocate($im,mt_rand(0,255),mt_rand(0,255),mt_rand(0,255)));}for($i=0;$i<$w*$h/40;$i++){imagesetpixel($im,mt_rand(0,$w-1),mt_rand(0,$h-1),imagecolorallocate($im,mt_rand(0,255),mt_rand(0,255),mt_rand(0,255)));}` + (kind === 'png' ? 'imagepng($im,$argv[1],6);' : `imagejpeg($im,$argv[1],${q || 92});`), f]);
const F1 = path.join(IMG, 'buyuk-kapak.jpg'), F2 = path.join(IMG, 'item-2.png'), F3 = path.join(IMG, 'item-3.jpg');
gen(F1, 3200, 2400, 'jpg', 95); gen(F2, 900, 700, 'png'); gen(F3, 640, 480, 'jpg', 85);
const BIG = fs.statSync(F1).size;
ok('test görselleri üretildi (büyük JPEG > 1,5 MB)', BIG > 1.5 * 1048576 && fs.statSync(F2).size > 0, BIG);

/* ---------- 3. sunucu ---------- */
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'upload_max_filesize=32M', '-d', 'post_max_size=40M', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const rlReset = () => { const d = path.join(SITE, 'storage/rl'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { force: true }); };

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [], badApi = [], apiReq = [], mediaPosts = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort()); // dış ağ (Google Fonts) yok
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    page.on('request', r => { const u = r.url(); if (!u.startsWith(B)) return; const p = u.slice(B.length);
      if (/^\/api\/v1(\/|\?|$)/.test(p)) { apiReq.push(r.method() + ' ' + p); if (!/^\/api\/v1\/index\.php\?r=/.test(p)) badApi.push(`[${name}] ${r.method()} ${p}`); }
      if (r.method() === 'POST' && /r=media(&|$)/.test(p)) { const b = r.postDataBuffer(); mediaPosts.push(b ? b.length : -1); } });
    return page;
  };
  const shot = (p, n, full) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: full !== false });
  const go = async (p, h, w) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(w || 300); };
  const txt = (p, s) => p.locator(s || 'body').first().innerText();
  const tc = (p, s) => p.locator(s || 'body').first().textContent();
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const overW = p => p.evaluate(() => document.documentElement.scrollWidth);
  const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const register = async (p, U) => { await p.click('#hdr [data-act=register]'); await p.fill('#rg_ad', U.ad); await p.fill('#rg_sy', U.soyad); await p.fill('#rg_u', U.name); await p.fill('#rg_t', U.tel); await p.fill('#rg_e', U.email); await p.fill('#rg_p', U.pw); await p.check('#rg_k'); await p.click('form[data-form=registerf] button.btn-primary'); return modalGone(p); };
  const pcall = (p, m, path_, body) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code })), [m, path_, body]);

  try {
    /* ---------- 4. kurulum sihirbazı (arayüzden) ---------- */
    const K = await mk('kurulum', { width: 900, height: 900 });
    await K.goto(B + '/');
    await K.fill('#ic', CODE); await K.click('button:has-text("Devam")');
    await K.click('button:has-text("Devam")');
    const dbFill = async () => { await K.fill('input[name=driver]', 'sqlite'); await K.fill('input[name=sqlite_path]', path.join(SITE, 'storage/test.sqlite')); };
    await dbFill(); await K.click('button:has-text("Bağlantıyı test et")');
    await dbFill(); await K.click('button:has-text("Kaydet ve devam et")');
    await K.click('button:has-text("Tabloları oluştur")');
    await K.fill('#sn', 'Yang Test'); await K.fill('#su', B); await K.click('button:has-text("Kaydet ve devam et")');
    const APW = 'Yonetici-Sifre-2026';
    await K.fill('#an', 'Yonetici'); await K.fill('#ae', 'admin@yangpazar.com'); await K.fill('#ap', APW); await K.fill('#ap2', APW);
    await K.click('button:has-text("Yöneticiyi oluştur")');
    await K.click('button:has-text("Kurulumu bitir")');
    ok('kurulum tamamlandı (arayüzden)', /Kurulum tamamlandı/.test(await txt(K)));
    await K.context().close();

    /* ---------- 5. üyeler: A (satıcı), B (alıcı), yönetici ---------- */
    const A = await mk('satici-A'); await A.goto(B + '/'); await A.waitForSelector('#hdr [data-act=register]');
    const UA = { name: 'Satici_Ali', email: 'ali@ornek.com', tel: '0555 111 22 33', ad: 'Ali', soyad: 'Satıcı', pw: 'Ali-Sifre-2026' };
    ok('A üye oldu', await register(A, UA) && (await txt(A, '#hdr')).includes(UA.name));
    const Bp = await mk('alici-B'); await Bp.goto(B + '/'); await Bp.waitForSelector('#hdr [data-act=register]');
    const UB = { name: 'Alici_Bora', email: 'bora@ornek.com', tel: '0544 222 33 44', ad: 'Bora', soyad: 'Alıcı', pw: 'Bora-Sifre-2026' };
    ok('B üye oldu', await register(Bp, UB) && (await txt(Bp, '#hdr')).includes(UB.name));
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap'); ok('yönetici girişi', /#yonetim/.test(M.url()));

    /* ---------- 6. A: ilan ver (3 fotoğraf, biri büyük) ---------- */
    await go(A, 'ilan-ver'); await A.waitForSelector('form[data-form=sell]');
    ok('ilan ver: formda doping yerine "Dopingler yakında"', (await txt(A, '#app')).includes('Dopingler yakında') && await A.locator('[data-dop]').count() === 0);
    const srvOpt = await A.evaluate(() => { const o = document.querySelector('#s_server_tr option'); return o ? { id: o.value, name: o.textContent } : null; });
    ok('ilan ver: TR server listesi sunucudan (sv… kimlikleri)', srvOpt && /^sv\d+$/.test(srvOpt.id), JSON.stringify(srvOpt));
    const SV = srvOpt.id, SVN = srvOpt.name.trim();
    const T1 = 'Ejder Kılıcı +9 Efsunlu Anında Teslim';
    await A.selectOption('#s_server_tr', SV); await A.selectOption('#s_cat', 'item');
    await A.fill('#s_title', T1); await A.fill('#s_price', '125.50'); await A.fill('#s_stock', '3'); await A.fill('#s_desc', 'Ortalama zarar 45, beceri efsunlu. Oyunda ticaretle teslim.');
    await A.setInputFiles('#s_files', [F1, F2, F3]);
    ok('fotoğraflar: yükleniyor durumu ve ilerleme gösterildi', await until(A, () => document.querySelectorAll('#pup_s .pup-t').length === 3));
    const upOk = await until(A, () => (UPL.s || []).length === 3 && UPL.s.every(x => x.st === 'ok' && /^m\d+$/.test(x.id)), null, 30000);
    const U3 = await A.evaluate(() => UPL.s.map(x => ({ id: x.id, url: x.url, from: x.from, w: x.w, h: x.h, sent: x.sent, orig: x.orig, mw: x.mw })));
    ok('fotoğraflar: 3 dosya önce yüklendi (medya kimlikleri döndü)', upOk, JSON.stringify(U3));
    const big = U3.find(x => x.from && x.from[0] === 3200);
    ok('büyük fotoğraf tarayıcıda küçültüldü (3200×2400 → 1600×1200, daha küçük dosya)', big && big.w === 1600 && big.h === 1200 && big.sent < big.orig && big.mw <= 1600, JSON.stringify(big));
    ok('medya isteği gövdesi büyük dosyadan küçük (sunucuya küçültülmüş dosya gitti)', mediaPosts.length >= 3 && Math.max(...mediaPosts) < BIG, mediaPosts.join(','));
    ok('fotoğraflar: kapak işareti ve kaldır düğmeleri', await A.locator('#pup_s .pup-b').count() === 1 && await A.locator('#pup_s [data-act=pupdel]').count() === 3);
    await shot(A, 'ilan-ver-fotograflar');
    await A.click('form[data-form=sell] button.btn-primary');
    ok('ilan yayında (toast) ve ilan sayfasına gidildi', await toast(A, /yayında/) && await until(A, () => /#ilan-l\d+$/.test(location.hash)));
    const L1 = (A.url().match(/#ilan-(l\d+)$/) || [])[1];
    await A.waitForSelector('.lhero'); await A.waitForTimeout(400);
    ok('ilan sayfası: başlık, fiyat, 3 fotoğraf galerisi', (await txt(A, '#app')).includes(T1) && /125,50/.test(await txt(A, '.lprice')) && await A.locator('.lgal button').count() === 3);
    ok('ilan sayfası (sahibi): düzenle / üste taşı / kaldır, doping yakında', await A.locator('[data-act=edit-l]').count() === 1 && await A.locator('[data-act=unlist]').count() === 1 && (await txt(A, '#app')).includes('Dopingler yakında'));
    ok('ilan sayfası: kendi görüntülemesi sayılmaz (0)', (await txt(A, '#lViews')).trim() === '0');

    /* ---------- 7. B: gezinme (ana sayfa → Metin2 TR → server → kategori/arama/sıralama → ilan) ---------- */
    await go(Bp, 'home'); await Bp.reload(); await Bp.waitForSelector('.lrows');
    ok('ana sayfa: yeni ilan "Son Eklenen İlanlar"da (açılış verisinden)', (await txt(Bp, '#app')).includes(T1));
    await shot(Bp, 'ana-sayfa-ilanlar');
    await go(Bp, 'metin2-tr'); await Bp.waitForSelector('.sgrid .scard');
    const card = Bp.locator(`.sgrid a.scard[href="#server-${SV}"]`);
    ok('Metin2 TR: server kartında ilan sayısı sunucudan (1 aktif ilan)', /1\s*aktif ilan/.test(await card.innerText()), await card.innerText());
    await card.click(); await Bp.waitForSelector('.shero'); await Bp.waitForTimeout(500);
    ok('server sayfası: son eklenen ilanlarda ilan var', (await txt(Bp, '#app')).includes(T1));
    await go(Bp, `server-${SV}-item`, 600);
    ok('kategori (item): ilan listede, sekmede sayı 1', (await txt(Bp, '#app')).includes(T1) && /Item\s*1/.test(await txt(Bp, '.ctabs')));
    await Bp.fill('#p1_q', 'efsunlu'); await Bp.click('form[data-form=p1f] button.btn-primary'); await Bp.waitForTimeout(600);
    ok('kategori araması: "efsunlu" bulunur', (await txt(Bp, '#app')).includes(T1) && /“efsunlu” için 1 ilan/.test(await tc(Bp, '#app')));
    await Bp.fill('#p1_q', 'yokboyleilan'); await Bp.click('form[data-form=p1f] button.btn-primary'); await Bp.waitForTimeout(600);
    ok('kategori araması: eşleşmeyen arama boş durum', (await txt(Bp, '#app')).includes('Bu aramaya uyan ilan yok') && !(await txt(Bp, '#app')).includes(T1));
    await Bp.click('[data-act=p1-qclear]'); await Bp.waitForTimeout(500);
    await Bp.selectOption('#p1_sort', 'ucuz'); await Bp.waitForTimeout(600);
    ok('sıralama: "En ucuz" seçili kalır, ilan listede', (await Bp.inputValue('#p1_sort')) === 'ucuz' && (await txt(Bp, '#app')).includes(T1));
    await Bp.click(`.lrows a[href="#ilan-${L1}"]`); await Bp.waitForSelector('.lhero'); await Bp.waitForTimeout(500);
    ok('B ilanı açtı: görüntülenme 1', (await txt(Bp, '#lViews')).trim() === '1', await txt(Bp, '#lViews'));
    ok('B: satın al yerine "yakında" (çökme yok)', await (async () => { await Bp.click('[data-act=buy]'); return toast(Bp, /çok yakında/); })());
    await shot(Bp, 'ilan-detay');
    // üst arama önerileri (sunucudan)
    await go(Bp, 'home'); await Bp.fill('#q', ''); await Bp.type('#q', 'Ejder Kılıcı', { delay: 30 });
    ok('üst arama önerisi: ilan sunucudan gelir', await until(Bp, t => { const b = document.querySelector('#qsug'); return b && !b.hidden && b.innerText.includes(t); }, T1));
    ok('arama önerisi isteği search/suggest ile', await (async () => { for (let i = 0; i < 20; i++) { if (apiReq.some(r => /r=search%2Fsuggest&q=/.test(r))) return true; await sleep(150); } return false; })(), apiReq.filter(r => /suggest/.test(r)).join(','));
    await Bp.press('#q', 'Enter'); await Bp.waitForTimeout(700);
    ok('arama sonuçları sayfası: ilan bulundu', /#ara$/.test(Bp.url()) && (await txt(Bp, '#app')).includes(T1));
    // satıcı profili
    await go(Bp, 'ilan-' + L1, 600); await Bp.click('.seller a.p1seller'); await Bp.waitForTimeout(600);
    ok('satıcı profili: ad ve aktif ilanı', /#uye-u\d+$/.test(Bp.url()) && (await txt(Bp, '#app')).includes(UA.name) && (await txt(Bp, '#app')).includes(T1));
    await go(A, 'home', 200); await go(A, 'ilan-' + L1, 700);
    ok('A: görüntülenme sahibi tarafında da 1', (await txt(A, '#lViews')).trim() === '1');

    /* ---------- 8. ilan onayı: açıkken yeni ilan gizli, yönetici onaylayınca yayında ---------- */
    await go(M, 'yonetim/ilan/ayarlar', 700); await M.waitForSelector('#modT');
    await M.check('#modT'); ok('yönetim: ilan onayı açıldı', await toast(M, 'onaydan geçecek'));
    ok('yönetim › İlanlar › Ayarlar: doping fiyatları yakında, hazır görseller', (await tc(M, '.apage')).includes('Doping fiyatları') && await M.locator('form[data-form=dopset]').count() === 0 && await M.locator('[data-change=coverup]').count() > 0);
    await A.reload(); await A.waitForSelector('#hdr'); await go(A, 'ilan-ver'); await A.waitForSelector('form[data-form=sell]');
    ok('ilan ver: onay notu gösterilir', (await txt(A, '#app')).includes('yönetici onayından sonra'));
    const T2 = 'Moderasyon Testi 100 Won Paketi';
    await A.selectOption('#s_server_tr', SV); await A.selectOption('#s_cat', 'yang'); await A.fill('#s_title', T2); await A.fill('#s_price', '9.90'); await A.fill('#s_stock', '100');
    await A.click('form[data-form=sell] button.btn-primary');
    ok('ilan onaya gönderildi', await toast(A, /onaya gönderildi/) && await until(A, () => /#ilan-l\d+$/.test(location.hash)));
    const L2 = (A.url().match(/#ilan-(l\d+)$/) || [])[1]; await A.waitForTimeout(500);
    ok('sahibi: "onay bekliyor" notu', (await txt(A, '#app')).includes('onay bekliyor'));
    await go(Bp, 'ilan-' + L2, 800);
    ok('B: onay bekleyen ilan görünmez (ayrıntı)', (await txt(Bp, '#app')).includes('İlan bulunamadı') && !(await txt(Bp, '#app')).includes(T2));
    await go(Bp, `server-${SV}-yang`, 700);
    ok('B: onay bekleyen ilan listede yok', !(await txt(Bp, '#app')).includes(T2));
    await go(M, 'yonetim/ilan/moderasyon?f=beklemede', 800); await M.waitForSelector(`[data-act=l-ok][data-id=${L2}]`);
    ok('Yönetim › İlanlar: onay kuyruğunda', (await txt(M, '.apage')).includes(T2));
    await shot(M, 'yonetim-ilanlar');
    await M.click(`[data-act=l-ok][data-id=${L2}]`); ok('yönetici onayladı', await toast(M, 'İlan onaylandı'));
    await go(Bp, 'home', 200); await go(Bp, `server-${SV}-yang`, 800);
    ok('B: onaylanan ilan artık listede', (await txt(Bp, '#app')).includes(T2));
    await go(M, 'yonetim/ilan/ayarlar', 700); await M.uncheck('#modT'); ok('ilan onayı kapatıldı', await toast(M, 'anında yayına'));

    /* ---------- 9. A: düzenle (fiyat + bir fotoğraf çıkar), üste taşı, kaldır ---------- */
    await go(A, 'ilan-' + L1, 700); await A.click('[data-act=edit-l]'); await A.waitForSelector('form[data-form=editl]');
    ok('düzenle: mevcut 3 fotoğraf yüklenmiş olarak gelir', await A.locator('#pup_e .pup-t').count() === 3);
    await A.fill('#ed_price', '110'); await A.click('#pup_e [data-act=pupdel][data-i="2"]');
    await A.click('form[data-form=editl] button.btn-primary');
    ok('ilan güncellendi', await toast(A, 'İlan güncellendi') && await modalGone(A));
    await A.waitForTimeout(500);
    ok('düzenleme: yeni fiyat ve 2 fotoğraf', /110,00/.test(await txt(A, '.lprice')) && await A.locator('.lgal button').count() === 2);
    await A.click('[data-act=free-bump]'); ok('ücretsiz üste taşıma', await toast(A, 'en üstüne taşındı'));
    await A.waitForTimeout(300); ok('üste taşı düğmesi beklemeye geçti', await A.locator('[data-act=free-bump][disabled]').count() === 1);
    await go(A, 'hesabim', 300); await A.click('#app [data-act=tab][data-t=ilan]'); await A.waitForSelector(`tr[data-lid=${L2}]`);
    ok('Hesabım › İlanlarım: iki ilan, görüntülenme', (await txt(A, '#app')).includes(T1) && (await txt(A, '#app')).includes(T2) && /1 görüntülenme/.test(await txt(A, `tr[data-lid=${L1}]`)));
    await A.click(`tr[data-lid=${L2}] [data-act=unlist]`); await A.click(`tr[data-lid=${L2}] [data-act=unlist]`);
    ok('ilan kaldırıldı (iki adımlı onay)', await toast(A, 'yayından kaldırıldı'));
    await A.waitForTimeout(600); ok('İlanlarım: durum Kaldırıldı', (await txt(A, `tr[data-lid=${L2}]`)).includes('Kaldırıldı'));
    await go(Bp, 'home', 200); await go(Bp, `server-${SV}-yang`, 700);
    ok('B: kaldırılan ilan listede yok', !(await txt(Bp, '#app')).includes(T2));

    /* ---------- 10. yönetici: Serverlar çekmecesi (ekle / düzenle / sil) ---------- */
    await go(M, 'yonetim/server/pvp', 900); await M.waitForSelector('#svRows tr');
    const n0 = await M.locator('#svRows tr').count();
    ok('Serverlar: PVP listesi sunucudan', n0 > 0, n0);
    await M.click('[data-act=sv-add]'); await M.waitForSelector('.sdrawer form[data-form=srvadd]');
    const SN = 'Testara PVP Zirve';
    await M.fill('#sv_n', SN); await M.fill('#sv_l', '1-105'); await M.fill('#sv_t', 'Orta Emek'); await M.fill('#sv_u', 'https://testara.example.org');
    await shot(M, 'yonetim-serverlar-cekmece', false);
    await M.click('.sdrawer form[data-form=srvadd] .asave button.btn-primary');
    ok('server eklendi', await toast(M, `${SN} eklendi`));
    await M.waitForTimeout(500);
    const SID = await M.evaluate(n => { const r = [...document.querySelectorAll('#svRows tr')].find(x => x.dataset.name === n); return r ? r.dataset.id : null; }, SN);
    ok('yeni server listede ve vurgulu', !!SID && await M.locator(`#svRows tr[data-id=${SID}]`).isVisible());
    await M.fill('#sv_q', 'testara'); await M.waitForTimeout(300);
    ok('server arama: tek sonuç', (await txt(M, '#sv_cnt')).includes('1 eşleşti'), await txt(M, '#sv_cnt'));
    await M.click(`#svRows tr[data-id=${SID}] .c-b [data-act=sv-edit]`); await M.waitForSelector(`.sdrawer form[data-form=srvsave][data-id=${SID}]`);
    await M.fill(`#sv_name_${SID}`, SN + ' 2'); await M.fill(`#sv_seo_${SID}`, 'Testara PVP Zirve için item ve yang ilanları.');
    await M.click('.sdrawer form[data-form=srvsave] .asave button.btn-primary');
    ok('server düzenlendi (çekmece)', await toast(M, 'Server kaydedildi'));
    await M.waitForTimeout(400); ok('çekmece başlığı yeni ad', (await tc(M, '.sdrawer #sdT')).includes(SN + ' 2'));
    const pub = await (await fetch(`${B}/api/v1/index.php?r=servers`)).json();
    ok('herkese açık server listesinde güncel ad', pub.data.servers.some(s => s.id === SID && s.name === SN + ' 2'));
    await M.click(`.sdrawer [data-act=srv-del][data-id=${SID}]`); await M.waitForSelector('#cfm:not([hidden])'); await M.click('#cfm_ok');
    ok('server silindi', await toast(M, 'silindi'));
    await M.waitForTimeout(400); ok('silinen server listede yok, çekmece kapandı', await M.locator(`#svRows tr[data-id=${SID}]`).count() === 0 && await M.locator('.sdrawer').count() === 0);
    // aktif ilanı olan server silinemez
    await go(M, `yonetim/server/tr?id=${SV}`, 900); await M.waitForSelector(`.sdrawer [data-act=srv-del][data-id=${SV}]`);
    await M.click(`.sdrawer [data-act=srv-del][data-id=${SV}]`); await M.waitForSelector('#cfm:not([hidden])'); await M.click('#cfm_ok');
    ok('aktif ilanı olan server silinmez (Türkçe hata)', await toast(M, /aktif\/bekleyen ilan var/));
    await go(M, 'yonetim/server/tr', 400);

    /* ---------- 11. "Daha fazla": >24 ilan (API ile) ---------- */
    rlReset();
    const SV2 = await Bp.evaluate(() => S.servers.filter(s => s.sec === 'pvp')[0].id);
    for (let i = 1; i <= 27; i++) { if (i === 15) rlReset();
      const r = await pcall(Bp, 'POST', 'listings', { game: 'metin2', server: SV2, cat: 'item', title: `Sayfalama ilanı ${String(i).padStart(2, '0')} kılıç`, price: 10 + i, stock: 1, del: '15 dk' });
      if (r && r.err) { ok('API ile ilan eklendi #' + i, false, r.err); break; } }
    await go(Bp, 'home', 200); await go(Bp, `server-${SV2}-item`, 900);
    const c24 = await Bp.locator('.lrows a.lcard').count();
    ok('kategori: ilk sayfa 24 ilan + "Daha fazla" düğmesi', c24 === 24 && await Bp.locator('[data-act=p1-more]').count() === 1, c24);
    await Bp.click('[data-act=p1-more]'); await until(Bp, () => document.querySelectorAll('.lrows a.lcard').length > 24);
    const titles = await Bp.$$eval('.lrows a.lcard .lc-t', L => L.map(x => x.textContent));
    ok('Daha fazla: 27 ilan, tekrar yok, en yeni üstte, düğme kalktı', titles.length === 27 && new Set(titles).size === 27 && /27/.test(titles[0]) && /01/.test(titles[26]) && await Bp.locator('[data-act=p1-more]').count() === 0, titles.slice(0, 3).join(' | ') + ' … ' + titles.slice(-2).join(' | '));
    ok('Daha fazla isteği anahtar kümesi (after=) ile', apiReq.some(r => /r=listings&.*after=\d+_\d+/.test(r)));
    await Bp.selectOption('#p1_sort', 'ucuz'); await Bp.waitForTimeout(800); await Bp.click('[data-act=p1-more]'); await Bp.waitForTimeout(800);
    const pr = await Bp.$$eval('.lrows a.lcard .lc-p b', L => L.map(x => +x.textContent.replace(/[^\d,]/g, '').replace(',', '.')));
    ok('ucuz sıralamada sayfalama: artan fiyat, 27 ilan', pr.length === 27 && pr.every((x, i) => i === 0 || x >= pr[i - 1]), pr.join(','));

    /* ---------- 12. SEO: ham HTML (index.php?p=…), temiz adres, açılışta hash rotası ---------- */
    const l1 = (await (await fetch(`${B}/api/v1/index.php?r=listings/${L1}`)).json()).data.listing;
    const slug = await A.evaluate(t => slugify(t), l1.title);
    const raw = await (await fetch(`${B}/index.php?p=ilan/${slug}-${L1}`)).text();
    const tt = (raw.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    ok('SEO ham HTML: <title> ilan başlığını içerir', tt.includes(T1) && tt.includes('Yang Test'), tt);
    ok('SEO ham HTML: canonical temiz adres', new RegExp(`<link rel="canonical" href="${B.replace(/[.:/]/g, '\\$&')}/ilan/${slug}-${L1}">`).test(raw), (raw.match(/<link rel="canonical"[^>]*>/) || [''])[0]);
    ok('SEO ham HTML: Product JSON-LD, og:title, tek <title>', /"@type":"Product"/.test(raw) && /property="og:title"/.test(raw) && (raw.match(/<title>/g) || []).length === 1);
    const raw404 = await fetch(`${B}/index.php?p=ilan/yok-l999999`);
    ok('SEO: olmayan ilan 404 + noindex', raw404.status === 404 && /noindex/.test(await raw404.text()));
    const rawS = await (await fetch(`${B}/index.php?p=server/${(await pcall(Bp, 'GET', 'servers/' + SV)).server.slug}`)).text();
    ok('SEO: server sayfası başlığı ve canonical /server/<slug>', rawS.includes(`<title>${SVN}`) && /<link rel="canonical" href="[^"]*\/server\/[a-z0-9-]+">/.test(rawS));
    const G = await mk('google'); await G.goto(`${B}/ilan/${slug}-${L1}`); await G.waitForSelector('.lhero', { timeout: 10000 }).catch(() => {});
    ok('temiz adresle açılış: ilan gösterilir, adres hash rotasına döner, varlıklar yüklenir', (await txt(G, '#app')).includes(T1) && G.url().endsWith('/#ilan-' + L1) && await G.evaluate(() => !!document.querySelector('link[rel=stylesheet][href*="assets/app.css"]') && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'));
    await G.goto(`${B}/index.php?p=server/${(await pcall(Bp, 'GET', 'servers/' + SV)).server.slug}`); await G.waitForSelector('.shero', { timeout: 10000 }).catch(() => {});
    ok('?p= ile açılış (yönlendirmesiz sunucu): server sayfası', (await txt(G, '#app')).includes(SVN) && /#server-sv\d+$/.test(G.url()));
    await G.context().close();

    /* ---------- 13. Bakım › Güncellemeleri uygula ---------- */
    await go(M, 'yonetim/bakim', 900); await M.waitForSelector('[data-act=p1-update]');
    ok('Bakım: sürüm 0.3.0-p1 ve durum', (await txt(M, '.apage')).includes('0.3.0-p1'));
    await M.click('[data-act=p1-update]'); ok('Güncellemeleri uygula → sonuç', await toast(M, /Veritabanı (zaten güncel|güncellendi)/));
    await M.waitForTimeout(400); ok('Bakım: sitemap sonucu gösterildi', /sitemap\.xml/.test(await txt(M, '.apage')));

    /* ---------- 14. yakında bölümleri, hatasız gezinme, R9 ---------- */
    const routes = ['home', 'metin2-tr', 'metin2-pvp', `server-${SV}`, `server-${SV}-hepsi`, `server-${SV2}-ep`, 'ilan-' + L1, 'ilan-' + L2, 'ilan-l99999', 'uye-u2', 'uye-u999', 'ara', 'ilan-ver', 'borsa', 'metin2-ep', 'cekilis', 'reklam-ver', 'mesajlar', 'siparis-S100001', 'guvenli', 'rehber', 'hesabim', 'bildirimler'];
    for (const r of routes) await go(Bp, r, 350);
    await go(Bp, 'borsa'); ok('yakında: borsa', (await txt(Bp, '#app')).includes('Yakında'));
    const items = await M.evaluate(() => admItems().filter(admVis).flatMap(it => [it.k, ...admSubs(it).map(s => it.k + '/' + s.s)]));
    for (const k of items) await go(M, 'yonetim/' + k, 250);
    let r9 = []; for (const r of ['home', `server-${SV}-item`, 'ilan-' + L1, 'ilan-ver', 'hesabim', 'uye-u2']) { await go(A, r, 400); if (/e-?gider|pusula|VUK|ETTN/i.test(await txt(A))) r9.push(r); }
    ok('R9: üye ekranlarında e-Gider/pusula metni yok', r9.length === 0, r9.join(','));

    /* ---------- 15. gündüz teması + 390 px ---------- */
    await go(Bp, 'ilan-' + L1, 600); await Bp.click('#hdr [data-act=theme]'); await Bp.waitForTimeout(300);
    ok('gündüz teması açıldı', (await Bp.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    await shot(Bp, 'ilan-detay-gunduz');
    await go(Bp, 'home', 400); await shot(Bp, 'ana-sayfa-gunduz', false);
    await Bp.click('#hdr [data-act=theme]'); await Bp.waitForTimeout(200);
    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await P.waitForSelector('#hdr'); await login(P, UA.name, UA.pw); await modalGone(P);
    const over = [];
    for (const r of ['home', 'metin2-tr', `server-${SV}`, `server-${SV}-item`, `server-${SV2}-item`, 'ilan-' + L1, 'ilan-ver', 'ara', 'uye-u2', 'hesabim']) { await go(P, r, 500); const w = await overW(P); if (w > 390) over.push(r + ':' + w); }
    await go(P, 'hesabim', 300); await P.click('#app [data-act=tab][data-t=ilan]'); await P.waitForTimeout(700); { const w = await overW(P); if (w > 390) over.push('hesabim/ilan:' + w); }
    await go(P, 'ilan-ver', 500); await P.setInputFiles('#s_files', [F2, F3]); await until(P, () => (UPL.s || []).length === 2 && UPL.s.every(x => x.st === 'ok'), null, 20000); { const w = await overW(P); if (w > 390) over.push('ilan-ver+foto:' + w); } await shot(P, 'ilan-ver-390');
    await go(P, 'ilan-' + L1, 600); await P.click('[data-act=edit-l]'); await P.waitForSelector('form[data-form=editl]'); { const w = await overW(P); if (w > 390) over.push('duzenle:' + w); } await P.click('#modal [data-act=close]');
    await P.click('#hdr [data-act=theme]'); await go(P, 'home', 400); { const w = await overW(P); if (w > 390) over.push('home-light:' + w); } await P.click('#hdr [data-act=theme]');
    await go(P, 'hesabim', 300); await P.click('#app .page-h [data-act=logout]'); await toast(P, 'Çıkış yapıldı');
    await login(P, 'Yonetici', APW); await modalGone(P);
    for (const r of ['yonetim/ilan/moderasyon', 'yonetim/ilan/ayarlar', 'yonetim/server/tr', 'yonetim/server/pvp?id=new', `yonetim/server/tr?id=${SV}`, 'yonetim/bakim']) { await go(P, r, 700); const w = await overW(P); if (w > 390) over.push(r + ':' + w); }
    await shot(P, 'yonetim-bakim-390');
    ok('390 px: yatay taşma yok', over.length === 0, over.join(', '));

    /* ---------- 16. API adresleri ---------- */
    ok('tüm API istekleri /api/v1/index.php?r= biçiminde (yönlendirmesiz)', badApi.length === 0 && apiReq.length > 50, badApi.slice(0, 5).join(' | ') + ` (toplam ${apiReq.length})`);

    /* ---------- 17. güncelleme paketi kurulu sitenin üzerine ---------- */
    const stList = () => fs.readdirSync(path.join(SITE, 'storage')).sort().join(','); const st0 = stList();
    const keep = ['storage/db.php'].filter(f => fs.existsSync(path.join(SITE, f))).map(f => [f, fs.statSync(path.join(SITE, f)).mtimeMs, fs.statSync(path.join(SITE, f)).size]);
    const up1 = fs.readdirSync(path.join(SITE, 'uploads')).filter(f => /^\d{4}$/.test(f));
    unzip(path.join(BUILD, UZIP), SITE);
    const same = keep.every(([f, m]) => fs.statSync(path.join(SITE, f)).mtimeMs === m) && st0.split(',').every(f => stList().split(',').includes(f)) && fs.existsSync(path.join(SITE, 'storage/test.sqlite'));
    const home2 = await (await fetch(B + '/')).text();
    ok('güncelleme paketi açıldı: storage/ dokunulmadı, yüklenen görseller duruyor, site açılıyor', keep.length >= 1 && same && up1.length > 0 && up1.every(d => fs.existsSync(path.join(SITE, 'uploads', d))) && /window\.YP_BOOT=\{"csrf"/.test(home2) && /"listings":\[\{"id":"l\d+"/.test(home2), JSON.stringify(keep) + ' ' + st0 + ' → ' + stList() + ' up:' + up1.join(','));

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
