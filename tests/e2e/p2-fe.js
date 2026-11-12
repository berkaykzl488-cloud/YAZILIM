// P2 ön yüz uçtan uca testi (cüzdan, bakiye yükleme, havuzlu sipariş, itiraz, doping): CANLI PAKET (--prod --zip --update-zip)
// geçici klasöre açılır, php -S + tests/http/router.php, YP_TEST=1 + SQLite. Kurulum sihirbazı arayüzden; satıcı A, alıcı B, yönetici:
//   yönetici havale hesabı + kripto ağı + kupon ekler (kupon durdur/sil), PayTR ayarsız → üyede "Kart ile ödeme yakında",
//   B havale bildirimi (kupon önizlemesi, dekont yükleme) → yönetici dekontu görüp onaylar → B bakiyesi (yoklama ile) güncellenir,
//   yönetici A'ya bakiye düzeltir (gerekçe zorunlu), A ilan verirken vitrin dopingi + ilan sayfasından acil dopingi alır → ana sayfa vitrini,
//   B satın alır (adet, Idempotency-Key, havuz mesajı), yetersiz bakiyede "Bakiye yükle" kısayolu, A teslime hazır + kanıt görselleriyle teslim,
//   B onaylar → A'nın çekilebilir bakiyesi, itiraz (gerekçe + görsel) → yönetici alıcı lehine karar → iade, teslim garantisiyle iade,
//   puan → bakiye, doping fiyatı ve ödeme yöntemi aç/kapat, [odeme] çalışanı yalnız yetkili bölümleri görür.
//   Tüm API istekleri /api/v1/index.php?r= biçiminde; eski api/paytr_token.php çağrılmaz. Konsol/sayfa hatası yok, 390 px taşma yok,
//   gece + gündüz teması. Ekran görüntüleri SHOTS klasörüne.
//
//   node tests/e2e/p2-fe.js          (SHOTS=<klasör> ekran görüntüleri; KEEP=1 çalışma klasörü silinmez)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const REPO = path.resolve(__dirname, '../..');
const RUN = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'yp-p2fe-'));
const SITE = path.join(RUN, 'site');
const SHOTS = process.env.SHOTS || path.join(RUN, 'shots');
const PORT = +(process.env.PORT || 19900 + Math.floor(Math.random() * 900));
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
const tlNum = s => +String(s || '').replace(/[^\d,-]/g, '').replace(',', '.');

/* ---------- 1. paket ---------- */
const BUILD = path.join(RUN, 'build');
const out = sh('php', [path.join(REPO, 'tools/build.php'), '--prod', '--zip', '--update-zip', '--out=' + BUILD]);
const CODE = (out.match(/KURULUM KODU: ([A-Z0-9]+)/) || [])[1];
const ZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-site-.*\.zip$/.test(f));
const UZIP = fs.readdirSync(BUILD).find(f => /^yangpazar-guncelleme-.*\.zip$/.test(f));
ok('derleme: kurulum zip\'i, kurulum kodu ve güncelleme zip\'i', !!CODE && !!ZIP && !!UZIP, out);
const ulist = zipList(path.join(BUILD, UZIP));
ok('güncelleme zip\'i: P2 ön yüz ve para rotaları var, storage/ ve test kancası yok',
  ['assets/js/prod/97p2-money.js', 'assets/js/prod/98p2-actions.js', 'app/routes/55_orders.php', 'app/routes/60_deposits.php', 'app/routes/65_admin_money.php', 'index.php'].every(f => ulist.includes(f))
  && !ulist.some(f => /^storage(\/|$)/.test(f) || f === 'app/routes/90_test.php' || /assets\/js\/demo\//.test(f)), ulist.filter(f => /p2|storage|90_test/.test(f)).join(','));
unzip(path.join(BUILD, ZIP), SITE);
fs.copyFileSync(path.join(BUILD, 'app/routes/90_test.php'), path.join(SITE, 'app/routes/90_test.php'));
const js2 = fs.readFileSync(path.join(SITE, 'assets/js/prod/97p2-money.js'), 'utf8') + fs.readFileSync(path.join(SITE, 'assets/js/prod/98p2-actions.js'), 'utf8');
ok('P2 dosyaları eski api/paytr_token.php\'yi çağırmaz', !/paytr_token\.php/.test(js2.replace(/Eski api\/paytr_token\.php çağrılmaz/g, '')));

/* ---------- 2. test görselleri ---------- */
const IMG = path.join(RUN, 'img'); fs.mkdirSync(IMG);
const gen = (f, w, h, r, g, b) => sh('php', ['-r', `$im=imagecreatetruecolor(${w},${h});imagefill($im,0,0,imagecolorallocate($im,${r},${g},${b}));for($i=0;$i<40;$i++){imagefilledellipse($im,mt_rand(0,${w}),mt_rand(0,${h}),mt_rand(8,60),mt_rand(8,60),imagecolorallocate($im,mt_rand(0,255),mt_rand(0,255),mt_rand(0,255)));}imagepng($im,$argv[1]);`, f]);
const IR = path.join(IMG, 'dekont.png'), IP = path.join(IMG, 'teslim-oncesi.png'), IQ = path.join(IMG, 'teslim-sonrasi.png'), ID = path.join(IMG, 'itiraz.png');
gen(IR, 600, 900, 240, 240, 240); gen(IP, 640, 480, 200, 40, 40); gen(IQ, 640, 480, 40, 160, 60); gen(ID, 500, 400, 40, 60, 200);

/* ---------- 3. sunucu ---------- */
const srv = cp.spawn('php', ['-d', 'display_errors=0', '-d', 'log_errors=1', '-d', 'upload_max_filesize=32M', '-d', 'post_max_size=40M', '-d', 'sendmail_path=/bin/true', '-S', `127.0.0.1:${PORT}`, '-t', SITE, path.join(REPO, 'tests/http/router.php')],
  { env: Object.assign({}, process.env, { YP_TEST: '1', PHP_CLI_SERVER_WORKERS: '4' }), stdio: ['ignore', fs.openSync(path.join(RUN, 'server.log'), 'a'), fs.openSync(path.join(RUN, 'server.log'), 'a')] });
const rlReset = () => { const d = path.join(SITE, 'storage/rl'); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) fs.rmSync(path.join(d, f), { force: true }); };

(async () => {
  for (let i = 0; i < 60; i++) { try { await fetch(B + '/api/durum.php'); break; } catch (e) { await sleep(100); } }
  const browser = await chromium.launch();
  const errs = [], badApi = [], apiReq = [], idemOrders = [], oldPaytr = [];
  const mk = async (name, vw) => {
    const ctx = await browser.newContext({ viewport: vw || { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
    await ctx.route(u => !u.href.startsWith(B), r => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    page.on('request', r => { const u = r.url(); if (!u.startsWith(B)) return; const p = u.slice(B.length);
      if (/paytr_token/.test(p)) oldPaytr.push(p);
      if (/^\/api\/v1(\/|\?|$)/.test(p)) { apiReq.push(r.method() + ' ' + p); if (!/^\/api\/v1\/index\.php\?r=/.test(p)) badApi.push(`[${name}] ${r.method()} ${p}`); }
      if (r.method() === 'POST' && /r=orders(&|$)/.test(p)) idemOrders.push(r.headers()['idempotency-key'] || ''); });
    return page;
  };
  const shot = (p, n, full) => p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: full !== false });
  const go = async (p, h, w) => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForTimeout(w || 350); };
  const txt = (p, s) => p.locator(s || 'body').first().textContent(); // textContent: CSS büyük harf dönüşümünden etkilenmez
  const toast = async (p, re, t) => { try { await p.locator('#toasts .toast', { hasText: re }).first().waitFor({ timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const modalGone = p => p.waitForFunction(() => !document.querySelector('#modal .mb'), null, { timeout: 8000 }).then(() => true, () => false);
  const until = async (p, fn, arg, t) => { try { await p.waitForFunction(fn, arg, { timeout: t || 8000 }); return true; } catch (e) { return false; } };
  const overW = p => p.evaluate(() => document.documentElement.scrollWidth);
  const login = async (p, u, pw) => { await p.click('#hdr [data-act=login]'); await p.fill('#lg_u', u); await p.fill('#lg_p', pw); await p.click('form[data-form=loginf] button.btn-primary'); };
  const register = async (p, U) => { await p.click('#hdr [data-act=register]'); await p.fill('#rg_ad', U.ad); await p.fill('#rg_sy', U.soyad); await p.fill('#rg_u', U.name); await p.fill('#rg_t', U.tel); await p.fill('#rg_e', U.email); await p.fill('#rg_p', U.pw); await p.check('#rg_k'); await p.click('form[data-form=registerf] button.btn-primary'); return modalGone(p); };
  const pcall = (p, m, path_, body) => p.evaluate(([m, a, b]) => call(m, a, b, { quiet: true, silent: true }).then(j => j.data, e => ({ err: e.error || e.code })), [m, path_, body]);
  const cfm = async (p) => { await p.waitForSelector('#cfm:not([hidden])', { timeout: 5000 }); await p.click('#cfm_ok'); };
  const hdrBal = p => p.evaluate(() => { const b = document.querySelector('#hdr .bal b'), s = document.querySelector('#hdr .bal span'); return { tot: b ? b.textContent : '', w: s ? s.textContent : '' }; });
  const waitBal = (p, tot, t) => until(p, x => { const b = document.querySelector('#hdr .bal b'); return b && b.textContent.replace(/\s/g, '').includes(x); }, tot, t || 25000);
  const modalTxt = p => txt(p, '#modal');
  const openDep = async p => { await go(p, 'hesabim', 300); await p.click('#app [data-act=tab][data-t=ozet]'); await p.waitForSelector('#app [data-act=deposit]'); await p.click('#app [data-act=deposit]'); await p.waitForSelector('#modal .md.dep'); };
  const vtxt = (p, s) => p.locator(s || 'body').first().innerText();

  try {
    /* ---------- 4. kurulum ---------- */
    const K = await mk('kurulum', { width: 900, height: 900 });
    await K.goto(B + '/');
    await K.fill('#ic', CODE); await K.click('button:has-text("Devam")');
    await K.click('button:has-text("Devam")');
    const dbFill = async () => { await K.fill('input[name=driver]', 'sqlite'); await K.fill('input[name=sqlite_path]', DBF()); };
    await dbFill(); await K.click('button:has-text("Bağlantıyı test et")');
    await dbFill(); await K.click('button:has-text("Kaydet ve devam et")');
    await K.click('button:has-text("Tabloları oluştur")');
    await K.fill('#sn', 'Yang P2 Test'); await K.fill('#su', B); await K.click('button:has-text("Kaydet ve devam et")');
    const APW = 'Yonetici-Sifre-2026';
    await K.fill('#an', 'Yonetici'); await K.fill('#ae', 'admin@yangpazar.com'); await K.fill('#ap', APW); await K.fill('#ap2', APW);
    await K.click('button:has-text("Yöneticiyi oluştur")');
    await K.click('button:has-text("Kurulumu bitir")');
    ok('kurulum tamamlandı (arayüzden)', /Kurulum tamamlandı/.test(await txt(K)));
    await K.context().close();

    /* ---------- 5. üyeler ---------- */
    const A = await mk('satici-A'); await A.goto(B + '/'); await A.waitForSelector('#hdr [data-act=register]');
    const UA = { name: 'Satici_Ali', email: 'ali@ornek.com', tel: '0555 111 22 33', ad: 'Ali', soyad: 'Satıcı', pw: 'Ali-Sifre-2026' };
    ok('A üye oldu', await register(A, UA) && (await txt(A, '#hdr')).includes(UA.name));
    const Bp = await mk('alici-B'); await Bp.goto(B + '/'); await Bp.waitForSelector('#hdr [data-act=register]');
    const UB = { name: 'Alici_Bora', email: 'bora@ornek.com', tel: '0544 222 33 44', ad: 'Bora', soyad: 'Alıcı', pw: 'Bora-Sifre-2026' };
    ok('B üye oldu', await register(Bp, UB) && (await txt(Bp, '#hdr')).includes(UB.name));
    const M = await mk('yonetici'); await M.goto(B + '/'); await M.waitForSelector('#hdr [data-act=login]'); await login(M, 'Yonetici', APW);
    await M.waitForSelector('.admwrap'); ok('yönetici girişi', /#yonetim/.test(M.url()));

    /* ---------- 6. yönetici: havale hesabı, kripto ağı, kuponlar, PayTR durumu ---------- */
    await go(M, 'yonetim/odeme/hesaplar', 900); await M.waitForSelector('form[data-form=bank]');
    await M.fill('#bk_b', 'Ziraat Bankası'); await M.fill('#bk_n', 'YangPazar Bilişim Ltd. Şti.'); await M.fill('#bk_i', 'TR00 0001 0000 0000 0000 0000 01');
    await M.click('form[data-form=bank] button'); ok('Ödemeler › hesaplar: havale hesabı eklendi', await toast(M, 'Banka hesabı eklendi'));
    await M.waitForTimeout(300); ok('hesap listede (bk1)', await M.locator('[data-act=bank-del][data-id=bk1]').count() === 1);
    await M.fill('#cna_n', 'TRC20 (Tron)'); await M.fill('#cna_a', 'TDemoCuzdanAdresi00001'); await M.fill('#cna_t', 'Komisyonsuz');
    await M.click('form[data-form=cnetadd] button'); ok('kripto ağı eklendi', await toast(M, 'Ağ eklendi'));
    await shot(M, 'yonetim-odeme-hesaplar');
    await go(M, 'yonetim/odeme/yontemler', 900); await M.waitForSelector('form[data-form=gws]');
    ok('Ödeme yöntemleri: PayTR ayarsız uyarısı ve "yakında" etiketi', (await txt(M, '.apage')).includes('PayTR mağaza bilgileri henüz girilmedi') && (await txt(M, '.apage')).includes('üyelere “yakında”'));
    await M.click('[data-act=gw-toggle][data-id=kripto]'); ok('ödeme yöntemi kapatıldı (kripto)', await toast(M, 'Kripto pasif edildi'));
    await M.waitForTimeout(400); await M.click('[data-act=gw-toggle][data-id=kripto]'); ok('ödeme yöntemi yeniden açıldı', await toast(M, 'Kripto aktif edildi'));
    await M.fill('#gw_fee_havale', '0'); await M.click('form[data-form=gws] .asave button.btn-primary'); ok('ödeme ayarları kaydedildi', await toast(M, 'Ödeme ayarları kaydedildi'));
    await shot(M, 'yonetim-odeme-yontemler');
    await go(M, 'yonetim/kampanya/kupon', 900); await M.waitForSelector('form[data-form=coupon]');
    await M.fill('#cp_c', 'hosgeldin'); await M.fill('#cp_p', '5'); await M.fill('#cp_m', '50'); await M.click('form[data-form=coupon] button');
    ok('kupon eklendi (HOSGELDIN)', await toast(M, 'Kupon eklendi'));
    await M.waitForTimeout(300); await M.fill('#cp_c', 'SILINECEK'); await M.click('form[data-form=coupon] button'); await toast(M, 'Kupon eklendi');
    await M.waitForTimeout(400); ok('kupon tablosunda iki kod', (await txt(M, '.apage')).includes('HOSGELDIN') && (await txt(M, '.apage')).includes('SILINECEK'));
    await M.click('tr[data-cid=cp2] [data-act=cp-toggle]'); ok('kupon durduruldu', await toast(M, 'SILINECEK pasif edildi'));
    await M.waitForTimeout(300); await M.click('tr[data-cid=cp2] [data-act=cp-del]'); await cfm(M); ok('kupon silindi (onay penceresiyle)', await toast(M, 'Kupon silindi'));
    await M.waitForTimeout(300); ok('silinen kupon listede yok', !(await txt(M, '.apage')).includes('SILINECEK'));
    await shot(M, 'yonetim-kuponlar');

    /* ---------- 7. B: bakiye yükleme penceresi (PayTR yakında, kupon önizleme, havale + dekont) ---------- */
    await Bp.reload(); await Bp.waitForSelector('#hdr .bal');
    await go(Bp, 'hesabim', 500); await Bp.click('#app [data-act=deposit]'); await Bp.waitForSelector('#modal .md.dep');
    ok('yükleme penceresi: havale/EFT, kripto ve kart sekmeleri', await Bp.locator('#modal [data-act=dep-tab]').count() === 3);
    await Bp.click('#modal [data-act=dep-tab][data-t=kart]'); await Bp.waitForTimeout(250);
    ok('PayTR ayarsız: kart sekmesinde "Kart ile ödeme yakında", ödeme düğmesi yok', (await modalTxt(Bp)).includes('Kart ile ödeme yakında') && await Bp.locator('#modal #depBtn').count() === 0);
    await shot(Bp, 'yukleme-kart-yakinda', false);
    await Bp.click('#modal [data-act=dep-tab][data-t=eft]'); await Bp.waitForSelector('#modal #dep_amt');
    ok('havale sekmesi: PayTR Havale/EFT kapalı (Yakında), manuel havale seçili, hesabımız listede', (await modalTxt(Bp)).includes('Yakında') && await Bp.locator('#modal label.p2off').count() === 1 && (await modalTxt(Bp)).includes('Ziraat Bankası') && await Bp.locator('#modal input[name=pm][value=havale]:checked').count() === 1);
    await Bp.fill('#dep_amt', '1000'); await Bp.fill('#dep_cp', 'YANLISKOD');
    ok('kupon önizlemesi: geçersiz kod uyarısı (sunucudan)', await until(Bp, () => /geçersiz/i.test((document.querySelector('#depCp') || {}).textContent || ''), null, 8000), await txt(Bp, '#depCp'));
    await Bp.fill('#dep_cp', 'hosgeldin');
    ok('kupon önizlemesi: 1000 TL → +50 TL bonus', await until(Bp, () => /\+₺?50,00/.test((document.querySelector('#depCp') || {}).textContent || '') && /1\.050,00/.test(document.querySelector('#depSum').textContent), null, 8000), await txt(Bp, '#depSum'));
    ok('kupon önizleme isteği GET coupons/check', apiReq.some(r => /^GET \/api\/v1\/index\.php\?r=coupons%2Fcheck&code=HOSGELDIN&amount=1000/.test(r)), apiReq.filter(r => /coupons/.test(r)).join(','));
    await Bp.fill('#dep_note', 'Bora Alıcı · Ziraat');
    await Bp.setInputFiles('#p2f_rc', IR);
    ok('dekont görseli önce yüklendi (medya kimliği)', await until(Bp, () => (P2.up.rc || []).length === 1 && P2.up.rc[0].st === 'ok' && /^m\d+$/.test(P2.up.rc[0].id), null, 15000), JSON.stringify(await Bp.evaluate(() => (P2.up.rc || []).map(x => ({ st: x.st, err: x.err, id: x.id }))) ) + ' ' + errs.join(' | '));
    await shot(Bp, 'yukleme-havale-kupon', false);
    await Bp.click('#modal #depBtn');
    ok('havale bildirimi alındı (bekliyor, çekilebilir, bonus)', await until(Bp, () => /Bildiriminiz alındı/.test((document.querySelector('#modal') || {}).innerText || '')) && (await modalTxt(Bp)).includes('Onay bekliyor') && (await modalTxt(Bp)).includes('Çekilebilir') && /\+₺?50,00/.test(await modalTxt(Bp)));
    await shot(Bp, 'yukleme-bildirim-alindi', false);
    await Bp.click('#modal [data-act=close]'); await modalGone(Bp);
    await go(Bp, 'hesabim', 300); await Bp.click('#app [data-act=tab][data-t=hareket]'); await Bp.waitForTimeout(800);
    ok('Hesabım › Bakiye hareketleri: yükleme bildirimi "Onay bekliyor"', (await txt(Bp, '#app')).includes('Yükleme bildirimlerim') && (await txt(Bp, '#app')).includes('Onay bekliyor'));

    /* ---------- 8. yönetici: bekleyen yükleme, dekont, onay → B bakiyesi ---------- */
    await go(M, 'yonetim', 300); await go(M, 'yonetim/odeme/yuklemeler', 1200); await M.waitForSelector('[data-act=dep-ok]');
    ok('Bugün/menü rozeti: 1 bekleyen yükleme', await until(M, () => { const a = [...document.querySelectorAll('.asb-i')].find(x => /Ödemeler/.test(x.textContent)); return a && /1/.test((a.querySelector('.nb') || {}).textContent || ''); }));
    ok('Yükleme onayları: üye, hesabımız, kupon, tutar', /Alici_Bora/.test(await txt(M, '.apage')) && (await txt(M, '.apage')).includes('Ziraat Bankası') && (await txt(M, '.apage')).includes('HOSGELDIN') && /1\.000,00/.test(await txt(M, '.apage')));
    await M.click('[data-act=p2-img]'); await M.waitForSelector('#modal img.p2big');
    ok('dekont görseli açılıyor (özel medya, index.php?r=media)', await until(M, () => { const i = document.querySelector('#modal img.p2big'); return i && i.complete && i.naturalWidth === 600 && /index\.php\?r=media/.test(i.src); }));
    await shot(M, 'yonetim-dekont', false);
    await M.click('#modal [data-act=close]'); await shot(M, 'yonetim-yukleme-onaylari');
    await M.click('[data-act=dep-ok]'); await cfm(M); ok('yükleme onaylandı', await toast(M, 'Yükleme onaylandı'));
    ok('B: üst bilgide bakiye yoklamayla güncellendi (1.050 TL; çekilebilir 1.000 TL)', await waitBal(Bp, '1.050,00') && /1\.000,00/.test((await hdrBal(Bp)).w), JSON.stringify(await hdrBal(Bp)));
    await go(Bp, 'hesabim', 300); await Bp.click('#app [data-act=tab][data-t=hareket]'); await Bp.waitForTimeout(900);
    ok('B: bakiye hareketlerinde yükleme ve kupon bonusu, bildirim "Onaylandı"', (await txt(Bp, '#app')).includes('Onaylandı') && /\+₺?1\.000,00/.test(await txt(Bp, '#app')) && /\+₺?50,00/.test(await txt(Bp, '#app')));
    await shot(Bp, 'hesabim-bakiye-hareketleri');

    /* ---------- 9. yönetici: bakiye düzeltme (gerekçe zorunlu) ---------- */
    await go(M, 'yonetim/uye/uyeler', 900);
    ok('Üyeler sayfasında "Bakiye düzelt" düğmesi', await M.locator('a[href="#yonetim/uye/bakiye"]').count() >= 1);
    await go(M, 'yonetim/uye/bakiye', 900); await M.waitForSelector('form[data-form=baladd]');
    ok('Bakiye düzeltme: gerekçe alanı zorunlu', await M.evaluate(() => document.querySelector('#ba_n').required));
    await M.fill('#ba_q', UA.name); await M.fill('#ba_a', '100'); await M.selectOption('#ba_t', 'nw'); await M.fill('#ba_n', 'Doping testi için kampanya bakiyesi');
    await M.click('form[data-form=baladd] button.btn-primary'); ok('A\'ya +100 TL çekilemez bakiye', await toast(M, /Satici_Ali.*\+₺?100,00.*çekilemez/));
    await M.waitForTimeout(600); ok('son bakiye düzeltmeleri listesinde', (await txt(M, '.apage')).includes('Doping testi için kampanya bakiyesi'));
    await shot(M, 'yonetim-bakiye-duzelt');

    /* ---------- 10. A: dopingli ilan, ilan sayfasından doping ---------- */
    await A.reload(); await A.waitForSelector('#hdr .bal'); await waitBal(A, '100,00', 5000);
    await go(A, 'ilan-ver'); await A.waitForSelector('form[data-form=sell]');
    ok('ilan ver: doping seçenekleri sunucu fiyatlarıyla (3 doping)', await A.locator('form[data-form=sell] [data-dop]').count() === 3 && /günlük\s*₺?7,00/.test(await txt(A, '#app')));
    const SV = await A.evaluate(() => (document.querySelector('#s_server_tr option') || {}).value);
    const T1 = 'P2 Test Kılıcı +9 Efsunlu';
    await A.selectOption('#s_server_tr', SV); await A.selectOption('#s_cat', 'item'); await A.fill('#s_title', T1); await A.fill('#s_price', '120'); await A.fill('#s_stock', '3');
    await A.selectOption('#s_del', '15 dk').catch(() => {});
    await A.check('#d_vitrin'); await A.selectOption('#dd_vitrin', '3'); await A.waitForTimeout(200);
    ok('doping toplamı 21 TL', /21,00/.test(await txt(A, '#dopTot')), await txt(A, '#dopTot'));
    await A.click('form[data-form=sell] button.btn-primary');
    ok('ilan dopingle yayında (Doping ücreti 21 TL)', await toast(A, /Doping ücreti: ₺?21,00/) && await until(A, () => /#ilan-l\d+$/.test(location.hash)));
    const L1 = (A.url().match(/#ilan-(l\d+)$/) || [])[1]; await A.waitForSelector('.lhero'); await A.waitForTimeout(500);
    ok('ilan sayfası (sahibi): vitrin aktif, doping al bölümü', (await txt(A, '#app')).includes('Doping al') && /Aktif · 2 gün|Aktif · 3 gün/.test(await txt(A, '#app')));
    await A.selectOption(`#dg_${L1}_acil`, '1'); await A.click(`[data-act=dope][data-id=${L1}][data-k=acil]`); await cfm(A);
    ok('ilan sayfasından acil dopingi alındı (4,50 TL)', await toast(A, /Acil Satılık.*uygulandı.*4,50/));
    ok('A bakiyesi: 100 − 21 − 4,50 = 74,50', await waitBal(A, '74,50', 6000), JSON.stringify(await hdrBal(A)));
    await shot(A, 'ilan-doping');
    await go(A, 'hesabim', 300); await A.click('#app [data-act=tab][data-t=ilan]'); await A.waitForSelector(`tr[data-lid=${L1}]`);
    ok('İlanlarım: süren dopingler ve "Doping" düğmesi', /Vitrin ·/.test(await txt(A, `tr[data-lid=${L1}]`)) && await A.locator(`tr[data-lid=${L1}] [data-act=p2-dopm]`).count() === 1);
    await A.click(`tr[data-lid=${L1}] [data-act=p2-dopm]`); await A.waitForSelector('#modal .dopbuy');
    ok('İlanlarım › Doping penceresi: 3 doping, aktif olanlarda "Uzat"', await A.locator('#modal .dopbuy').count() === 3 && await A.locator('#modal [data-act=dope]', { hasText: 'Uzat' }).count() === 2);
    await A.click('#modal [data-act=close]');

    /* ---------- 11. B: ana sayfa vitrini ---------- */
    await go(Bp, 'home', 900);
    ok('ana sayfa vitrini: dopingli ilan (GET listings?dop=vitrin)', (await txt(Bp, '#app')).includes(T1) && apiReq.some(r => /r=listings&dop=vitrin/.test(r)) && await Bp.locator('a.lcard.is-vitrin, .lrows .is-vitrin').count() >= 1);
    await shot(Bp, 'ana-sayfa-vitrin', false);

    /* ---------- 12. B: satın al (2 adet), havuz ---------- */
    await go(Bp, 'ilan-' + L1, 900); await Bp.waitForSelector('#qty');
    await Bp.fill('#qty', '2'); await Bp.dispatchEvent('#qty', 'change'); await Bp.click('[data-act=buy]'); await Bp.waitForSelector('#modal form[data-form=p2buy]');
    ok('satın alma penceresi: 2 adet, 240 TL, havuz açıklaması', /240,00/.test(await txt(Bp, '#p2bTot')) && (await modalTxt(Bp)).includes('Ödemeniz havuzda bekler') && (await Bp.inputValue('#b_qty')) === '2');
    await Bp.fill('#b_qty', '5'); await Bp.dispatchEvent('#b_qty', 'change'); await Bp.waitForTimeout(200);
    ok('adet stokla sınırlı (5 → 3)', (await Bp.inputValue('#b_qty')) === '3' && /360,00/.test(await txt(Bp, '#p2bTot')));
    await Bp.fill('#b_qty', '2'); await Bp.dispatchEvent('#b_qty', 'change'); await Bp.waitForTimeout(200);
    await Bp.fill('#b_info', 'KarakterBora'); await Bp.selectOption('#b_ch', '2'); await Bp.selectOption('#b_place', 'Pazar alanı depocu');
    await shot(Bp, 'satin-al-onay', false);
    await Bp.click('#modal form[data-form=p2buy] button.btn-primary');
    ok('ödeme alındı, sipariş sayfasına gidildi', await toast(Bp, 'Ödeme alındı') && await until(Bp, () => /#siparis-S\d+$/.test(location.hash)));
    const O1 = (Bp.url().match(/#siparis-(S\d+)$/) || [])[1]; await Bp.waitForSelector('.steps'); await Bp.waitForTimeout(400);
    ok('sipariş sayfası: havuz mesajı, durum, geri sayım (lateAt)', (await txt(Bp, '#app')).includes('havuza alındı') && (await txt(Bp, '#app')).includes('Ödemeniz havuzda güvende') && (await txt(Bp, '#app')).includes('Teslimat bekleniyor') && await Bp.locator('[data-p2cd]').count() >= 1);
    ok('sipariş isteğinde Idempotency-Key', idemOrders.length >= 1 && idemOrders.every(k => /^[A-Za-z0-9_-]{8,80}$/.test(k)), idemOrders.join(','));
    ok('B bakiyesi 1.050 − 240 = 810', await waitBal(Bp, '810,00', 5000), JSON.stringify(await hdrBal(Bp)));
    await shot(Bp, 'siparis-alici-havuzda');
    // yetersiz bakiye → "Bakiye yükle" kısayolu
    const big = await pcall(A, 'POST', 'listings', { game: 'metin2', server: SV, cat: 'item', title: 'Pahalı Efsunlu Zırh', price: 5000, stock: 1, del: '15 dk' });
    await go(Bp, 'ilan-' + big.listing.id, 900); await Bp.waitForSelector('[data-act=buy]'); await Bp.click('[data-act=buy]'); await Bp.waitForSelector('#modal .md');
    ok('yetersiz bakiye: eksik tutar ve "Bakiye yükle" kısayolu', (await modalTxt(Bp)).includes('Bakiyeniz yetersiz') && /4\.190,00/.test(await modalTxt(Bp)) && await Bp.locator('#modal [data-act=p2-topup]').count() === 1);
    await Bp.click('#modal [data-act=p2-topup]'); await Bp.waitForSelector('#modal #dep_amt');
    ok('kısayol: yükleme penceresi eksik tutarla açıldı', (await Bp.inputValue('#dep_amt')) === '4190');
    await Bp.click('#modal [data-act=close]'); await modalGone(Bp);

    /* ---------- 13. A: satışlarım → teslime hazır → kanıtla teslim ---------- */
    await go(A, 'hesabim', 300); await A.click('#app [data-act=tab][data-t=satis]'); await A.waitForSelector(`tr[data-oid=${O1}]`);
    ok('Satışlarım: sipariş "Teslim et", geri sayım, sekme rozeti', (await txt(A, `tr[data-oid=${O1}]`)).includes('Teslim et') && /Teslim süresi/.test(await txt(A, `tr[data-oid=${O1}]`)));
    await shot(A, 'hesabim-satislarim');
    await A.click(`tr[data-oid=${O1}] a.btn`); await A.waitForSelector('form[data-form=p2deliver]');
    ok('satıcı: teslim formu, 90 gün saklama notu, düğme kapalı', (await txt(A, '#app')).includes('90 gün') && await A.locator('#p2dbtn[disabled]').count() === 1);
    await A.click('[data-act=o-ready]'); ok('teslime hazır bildirimi', await toast(A, 'Alıcıya haber verildi'));
    await A.waitForSelector('form[data-form=p2deliver]');
    await A.setInputFiles('#p2f_dpre', IP); await A.setInputFiles('#p2f_dpost', IQ);
    ok('kanıt görselleri yüklendi, "Teslim ettim" açıldı', await until(A, () => (P2.up.dpre || []).every(x => x.st === 'ok') && (P2.up.dpost || []).length === 1 && P2.up.dpost[0].st === 'ok' && !document.querySelector('#p2dbtn').disabled, null, 15000));
    await A.fill('#dnote', 'Köy 1 de ticaretle verildi');
    await shot(A, 'siparis-satici-teslim-formu');
    await A.click('#p2dbtn'); ok('teslim bildirildi', await toast(A, 'Teslim bildirildi'));
    await A.waitForTimeout(500);
    ok('satıcı: durum "Alıcı onayı bekleniyor", kanıtlar görünür, otomatik onay geri sayımı', (await txt(A, '#app')).includes('Alıcı onayı bekleniyor') && await A.locator('.p2pp img').count() === 2 && (await txt(A, '#app')).includes('otomatik onaylanır'));
    ok('kanıt görselleri yüklendi (img)', await until(A, () => [...document.querySelectorAll('.p2pp img')].every(i => i.complete && i.naturalWidth > 0)));
    await shot(A, 'siparis-satici-teslim-edildi');

    /* ---------- 14. B: onay ---------- */
    await go(Bp, 'home', 200); await go(Bp, 'siparis-' + O1, 900);
    ok('alıcı: teslim bildirildi, kanıtları görmez, onay ve itiraz düğmeleri', (await txt(Bp, '#app')).includes('Satıcı teslim ettiğini bildirdi') && await Bp.locator('.p2pp img').count() === 0 && await Bp.locator('[data-act=confirm]').count() === 1 && await Bp.locator('[data-act=dispute]').count() === 1);
    ok('alıcı: zaman çizelgesinde teslim kaydı ve satıcı notu', (await txt(Bp, '.p2tl')).includes('Satıcı teslim ettiğini bildirdi') && (await txt(Bp, '#ochat')).includes('Köy 1 de ticaretle verildi'));
    await shot(Bp, 'siparis-alici-onay');
    await Bp.click('[data-act=star][data-n="5"]'); await Bp.click('[data-act=confirm]'); await cfm(Bp);
    ok('alıcı onayladı', await toast(Bp, 'Teşekkürler'));
    await Bp.waitForTimeout(500); ok('sipariş tamamlandı', (await txt(Bp, '#app')).includes('Sipariş tamamlandı'));
    ok('A: çekilebilir bakiye 240 − %8 = 220,80 (yoklama)', await until(A, () => /220,80/.test((document.querySelector('#hdr .bal span') || {}).textContent || ''), null, 25000), JSON.stringify(await hdrBal(A)));
    await go(A, 'hesabim', 300); await A.click('#app [data-act=tab][data-t=hareket]'); await A.waitForTimeout(900);
    ok('A: bakiye hareketlerinde satış (+220,80, komisyon) ve doping', /\+₺?220,80/.test(await txt(A, '#app')) && /komisyon/i.test(await txt(A, '#app')) && /[−-]₺?21,00/.test(await txt(A, '#app')));
    await go(A, 'siparis-' + O1, 700); ok('A: sipariş tamamlandı, hesaba aktarıldı', /Hesabınıza ₺?220,80/.test(await txt(A, '#app')));

    /* ---------- 15. itiraz → yönetici alıcı lehine ---------- */
    await go(Bp, 'ilan-' + L1, 900); await Bp.waitForSelector('[data-act=buy]'); await Bp.click('[data-act=buy]'); await Bp.waitForSelector('#modal form[data-form=p2buy]');
    await Bp.fill('#b_info', 'KarakterBora'); await Bp.selectOption('#b_ch', '1'); await Bp.selectOption('#b_place', 'Mavi bayrak gardiyanı');
    await Bp.click('#modal form[data-form=p2buy] button.btn-primary'); await toast(Bp, 'Ödeme alındı'); await until(Bp, () => /#siparis-S\d+$/.test(location.hash));
    const O2 = (Bp.url().match(/#siparis-(S\d+)$/) || [])[1]; await Bp.waitForSelector('[data-act=dispute]');
    ok('ikinci sipariş (stok 1)', !!O2 && O2 !== O1);
    await Bp.click('[data-act=dispute]'); await Bp.waitForSelector('#modal form[data-form=p2disp]');
    await Bp.selectOption('#dp_r', 'Ürün teslim edilmedi'); await Bp.fill('#dp_d', 'Satıcı oyuna gelmedi, mesajlara cevap yok.');
    await Bp.setInputFiles('#p2f_dsp', ID); await until(Bp, () => (P2.up.dsp || []).length === 1 && P2.up.dsp[0].st === 'ok', null, 15000);
    await shot(Bp, 'itiraz-formu', false);
    await Bp.click('#modal form[data-form=p2disp] button.btn-bad'); ok('itiraz açıldı', await toast(Bp, 'İtiraz açıldı'));
    await Bp.waitForTimeout(500); ok('alıcı: itiraz incelemede, gerekçe ve kanıt', (await txt(Bp, '#app')).includes('İtiraz incelemede') && (await txt(Bp, '#app')).includes('Ürün teslim edilmedi: Satıcı oyuna gelmedi') && await Bp.locator('.p2pp img').count() === 1);
    const balBeforeRefund = tlNum((await hdrBal(Bp)).tot);
    await go(M, 'yonetim', 400); await go(M, 'yonetim/siparis?f=itiraz', 1200); await M.waitForSelector(`tr[data-oid=${O2}]`);
    ok('Siparişler & itirazlar: itirazlı sipariş, havuz toplamı', (await txt(M, '.apage')).includes('Ürün teslim edilmedi') && /Havuzda bekleyen/.test(await txt(M, '.apage')));
    await M.fill('#aq', O2); await M.press('#aq', 'Enter'); await M.waitForTimeout(900);
    ok('sipariş araması (sipariş no)', await M.locator(`tr[data-oid=${O2}]`).count() === 1 && await M.locator('tbody tr').count() === 1);
    await shot(M, 'yonetim-itirazlar');
    await M.click(`tr[data-oid=${O2}] a.btn`); await M.waitForSelector('[data-act=resolve][data-to=buyer]'); await M.waitForTimeout(300);
    ok('yönetici sipariş sayfası: kanıt, karar düğmeleri', await M.locator('.p2pp img').count() >= 1 && await M.locator('[data-act=resolve][data-to=seller]').count() === 1);
    await M.click('[data-act=resolve][data-to=buyer]'); await cfm(M); ok('karar uygulandı (alıcı lehine)', await toast(M, 'Karar uygulandı'));
    await M.waitForTimeout(500); ok('sipariş iade edildi', (await txt(M, '#app')).includes('Sipariş iade edildi'));
    ok('B: 120 TL iade bakiyede', await until(Bp, x => { const b = document.querySelector('#hdr .bal b'); return b && Math.abs(+b.textContent.replace(/[^\d,]/g, '').replace(',', '.') - x) < 0.01; }, balBeforeRefund + 120, 25000), balBeforeRefund + ' → ' + JSON.stringify(await hdrBal(Bp)));

    /* ---------- 16. teslim garantisi: süre dolunca alıcı iadeyi kendisi alır ---------- */
    rlReset();
    const fast = await pcall(A, 'POST', 'listings', { game: 'metin2', server: SV, cat: 'yang', title: 'Hızlı Yang Paketi', price: 10, stock: 5, del: 'Anında' });
    await go(Bp, 'ilan-' + fast.listing.id, 900); await Bp.click('[data-act=buy]'); await Bp.waitForSelector('#modal form[data-form=p2buy]');
    await Bp.fill('#b_info', 'KarakterBora'); await Bp.selectOption('#b_ch', '3'); await Bp.selectOption('#b_place', 'Pazar alanı depocu');
    await Bp.click('#modal form[data-form=p2buy] button.btn-primary'); await until(Bp, () => /#siparis-S\d+$/.test(location.hash)); await Bp.waitForSelector('.steps');
    const O3 = (Bp.url().match(/#siparis-(S\d+)$/) || [])[1];
    ok('teslim süresi dolmadan iade düğmesi yok', await Bp.locator('[data-act=guarantee]').count() === 0);
    sq(`UPDATE yp_orders SET created_at=created_at-1500000 WHERE id=${+O3.slice(1) - 100000}`);
    await go(Bp, 'home', 200); await go(Bp, 'siparis-' + O3, 1000); await Bp.waitForSelector('[data-act=guarantee]', { timeout: 8000 }).catch(() => {});
    ok('süre doldu: "Teslim edilmedi · paramı iade et"', (await txt(Bp, '#app')).includes('Teslim süresi doldu') && await Bp.locator('[data-act=guarantee]').count() === 1);
    await Bp.click('[data-act=guarantee]'); await cfm(Bp); ok('teslim garantisi: anında iade', await toast(Bp, /bakiyenize iade edildi/));

    /* ---------- 17. puan → bakiye ---------- */
    sq(`UPDATE yp_users SET pts=740 WHERE name='${UB.name}'`);
    await Bp.reload(); await Bp.waitForSelector('#hdr .bal'); await go(Bp, 'hesabim', 300); await Bp.click('#app [data-act=tab][data-t=hareket]'); await Bp.waitForSelector('form[data-form=pts]');
    const b0 = tlNum((await hdrBal(Bp)).tot);
    await Bp.fill('#pt_amt', '700'); await Bp.click('form[data-form=pts] button'); ok('700 puan → 7 TL', await toast(Bp, /7,00.*bakiyenize eklendi/));
    await Bp.waitForTimeout(500); ok('puan 40\'a düştü, bakiye +7', /\b40\b/.test(await txt(Bp, '.kpis + .panel')) && Math.abs(tlNum((await hdrBal(Bp)).tot) - (b0 + 7)) < 0.01, JSON.stringify(await hdrBal(Bp)));
    await shot(Bp, 'hesabim-puan');
    await go(Bp, 'hesabim', 300); await Bp.click('#app [data-act=tab][data-t=alis]'); await Bp.waitForSelector(`tr[data-oid=${O1}]`);
    ok('Siparişlerim: üç sipariş, durumlar', (await txt(Bp, '#app')).includes('Tamamlandı') && (await txt(Bp, '#app')).includes('İade edildi') && await Bp.locator('tbody tr').count() === 3);
    await shot(Bp, 'hesabim-siparislerim');

    /* ---------- 18. yönetici: doping fiyatları, [odeme] çalışanı ---------- */
    await go(M, 'yonetim/ilan/ayarlar', 900); await M.waitForSelector('form[data-form=dopset]');
    await M.fill('#dps_p_vitrin', '8'); await M.click('form[data-form=dopset] button.btn-primary'); ok('doping fiyatı kaydedildi', await toast(M, 'Doping fiyatları kaydedildi'));
    await M.waitForTimeout(400); ok('vitrin günlük 8 TL (7 gün 56 TL)', /56,00/.test(await txt(M, 'form[data-form=dopset]')));
    rlReset();
    const st = await pcall(M, 'POST', 'admin/staff', { name: 'OdemeCalisan', email: 'od@yangpazar.com', ad: 'Ödeme', soyad: 'Çalışan', password: 'Calisan-Sifre-2', perms: ['odeme'] });
    ok('[odeme] çalışanı eklendi', st && !st.err, JSON.stringify(st));
    const O = await mk('odeme-calisan'); await O.goto(B + '/'); await O.waitForSelector('#hdr [data-act=login]'); await login(O, 'OdemeCalisan', 'Calisan-Sifre-2'); await modalGone(O);
    await go(O, 'yonetim', 800); await O.waitForSelector('.admwrap');
    const vis = await O.evaluate(() => admItems().filter(admVis).map(i => i.k));
    ok('[odeme] çalışanı: Ödemeler görünür; Siparişler, Kuponlar, Bakiye yok', vis.includes('odeme') && !vis.includes('siparis') && !vis.includes('kampanya') && !vis.includes('uye'), vis.join(','));
    await go(O, 'yonetim/odeme/yuklemeler?f=tumu', 900);
    ok('[odeme] çalışanı: yükleme listesini görür (onaylanan)', (await txt(O, '.apage')).includes('Onaylandı'));
    const forb = await pcall(O, 'GET', 'admin/orders', null);
    ok('[odeme] çalışanı: sipariş listesi sunucuda da kapalı', forb && forb.err, JSON.stringify(forb));
    await O.context().close();

    /* ---------- 19. gezinme, R9, gündüz teması, 390 px ---------- */
    const routes = ['home', 'ilan-' + L1, 'siparis-' + O1, 'siparis-' + O2, 'siparis-' + O3, 'siparis-S999999', 'hesabim', 'bildirimler', 'ilan-ver'];
    for (const r of routes) await go(Bp, r, 400);
    for (const k of ['ozet', 'alis', 'satis', 'hareket', 'ilan', 'profil', 'banka']) { await go(Bp, 'hesabim', 150); await Bp.click(`#app [data-act=tab][data-t=${k}]`); await Bp.waitForTimeout(400); }
    let r9 = []; for (const r of ['hesabim', 'siparis-' + O1, 'ilan-' + L1]) { await go(Bp, r, 500); if (/e-?gider|pusula/i.test(await vtxt(Bp))) r9.push(r); }
    await openDep(Bp); await Bp.waitForSelector('#modal .md'); if (/e-?gider|pusula/i.test(await modalTxt(Bp))) r9.push('yukleme'); await Bp.click('#modal [data-act=close]');
    ok('R9: üye ekranlarında e-Gider/pusula metni yok', r9.length === 0, r9.join(','));
    const items = await M.evaluate(() => admItems().filter(admVis).flatMap(it => [it.k, ...admSubs(it).map(s => it.k + '/' + s.s)]));
    for (const k of items) await go(M, 'yonetim/' + k, 250);
    await go(Bp, 'siparis-' + O1, 600); await Bp.click('#hdr [data-act=theme]'); await Bp.waitForTimeout(300);
    ok('gündüz teması', (await Bp.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    await shot(Bp, 'siparis-gunduz');
    await openDep(Bp); await Bp.waitForSelector('#modal #dep_amt'); await Bp.waitForTimeout(500); await shot(Bp, 'yukleme-gunduz', false); await Bp.click('#modal [data-act=close]');
    await Bp.click('#hdr [data-act=theme]'); await Bp.waitForTimeout(200);

    const P = await mk('mobil-390', { width: 390, height: 844 });
    await P.goto(B + '/'); await P.waitForSelector('#hdr'); await login(P, UB.name, UB.pw); await modalGone(P);
    const over = []; const chk = async n => { const w = await overW(P); if (w > 390) over.push(n + ':' + w); };
    for (const r of ['home', 'ilan-' + L1, 'siparis-' + O1, 'siparis-' + O2, 'siparis-' + O3]) { await go(P, r, 600); await chk(r); }
    await shot(P, 'mobil-siparis-390');
    for (const k of ['ozet', 'alis', 'hareket']) { await go(P, 'hesabim', 200); await P.click(`#app [data-act=tab][data-t=${k}]`); await P.waitForTimeout(600); await chk('hesabim/' + k); }
    await shot(P, 'mobil-hesabim-hareket-390');
    await openDep(P); await P.waitForSelector('#modal #dep_amt');
    for (const t of ['eft', 'cuzdan', 'kart']) { await P.click(`#modal [data-act=dep-tab][data-t=${t}]`); await P.waitForTimeout(300); await chk('yukleme/' + t); if (t === 'eft') await shot(P, 'mobil-yukleme-390', false); }
    await P.click('#modal [data-act=close]');
    await go(P, 'ilan-' + fast.listing.id, 700); await P.click('[data-act=buy]'); await P.waitForSelector('#modal form[data-form=p2buy]'); await chk('satin-al'); await shot(P, 'mobil-satin-al-390', false); await P.click('#modal [data-act=close]');
    await P.click('#hdr [data-act=theme]'); for (const r of ['siparis-' + O1, 'hesabim']) { await go(P, r, 500); await chk(r + '-light'); } await P.click('#hdr [data-act=theme]');
    await go(P, 'hesabim', 300); await P.click('#app .page-h [data-act=logout]'); await toast(P, 'Çıkış yapıldı');
    await login(P, UA.name, UA.pw); await modalGone(P);
    await go(P, 'siparis-' + O1, 700); await chk('satici-siparis'); await go(P, 'hesabim', 200); await P.click('#app [data-act=tab][data-t=satis]'); await P.waitForTimeout(600); await chk('hesabim/satis');
    await P.click('#app [data-act=tab][data-t=ilan]'); await P.waitForTimeout(700); await chk('hesabim/ilan'); await P.click(`tr[data-lid=${L1}] [data-act=p2-dopm]`); await P.waitForSelector('#modal .dopbuy'); await chk('doping-penceresi'); await P.click('#modal [data-act=close]');
    await go(P, 'ilan-ver', 600); await chk('ilan-ver');
    await go(P, 'hesabim', 300); await P.click('#app .page-h [data-act=logout]'); await toast(P, 'Çıkış yapıldı');
    await login(P, 'Yonetici', APW); await modalGone(P);
    for (const r of ['yonetim', 'yonetim/odeme/yuklemeler?f=tumu', 'yonetim/odeme/yontemler', 'yonetim/odeme/hesaplar', 'yonetim/siparis', 'yonetim/kampanya/kupon', 'yonetim/uye/bakiye', 'yonetim/ilan/ayarlar', 'siparis-' + O2]) { await go(P, r, 800); await chk(r); }
    await go(P, 'yonetim/odeme/yuklemeler?f=tumu', 600); await shot(P, 'mobil-yonetim-yuklemeler-390');
    const thm = () => P.evaluate(() => document.querySelector('[data-act=theme]').click()); await thm(); await go(P, 'yonetim/siparis', 700); await chk('yonetim/siparis-light'); await shot(P, 'mobil-yonetim-siparis-gunduz-390'); await thm();
    ok('390 px: yatay taşma yok', over.length === 0, over.join(', '));

    /* ---------- 20. API adresleri ---------- */
    ok('tüm API istekleri /api/v1/index.php?r= biçiminde', badApi.length === 0 && apiReq.length > 80, badApi.slice(0, 5).join(' | ') + ` (toplam ${apiReq.length})`);
    ok('eski api/paytr_token.php hiç çağrılmadı', oldPaytr.length === 0, oldPaytr.join(','));
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
