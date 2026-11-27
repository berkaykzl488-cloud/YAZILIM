/* ================== P7: işleyiciler (yalnız --prod derlemesinde) ==================
   97p7-admin.js ekranlarının işleyicileri. Yetki burada da denetlenir (asıl denetim sunucuda). İstekler call() → apiUrl()
   ile /api/v1/index.php?r=<yol>. Görseller önce POST media (kind=post) ya da admin/settings/etbis/img ile yüklenir.      */
const p7After = (keys, fn) => { needDrop(...keys); if (fn) fn(); render(); };
const p7Body = k => ({ title: v_('pt_t_' + k).trim(), slug: v_('pt_s_' + k).trim(), ozet: v_('pt_o_' + k).trim(), seoTitle: v_('pt_st_' + k).trim(), seoDesc: v_('pt_sd_' + k).trim(),
  body: v_('pt_b_' + k), cover: v_('pt_c_' + k) || null, on: !!($('#pt_on_' + k) || {}).checked });
const p7Posts = j => { if (j && j.data && Array.isArray(j.data.posts)) S.posts = j.data.posts; API.cache['adm:posts'] = { v: { n: (S.posts || []).length }, t: Date.now() }; };

/* ---------------- herkese açık: ortaklık başvurusu ---------------- */
FORM.papply = (f) => { const u = v_('pa_u').trim(); if (!/^https?:\/\//.test(u)) return toast('Adres https:// ile başlamalı.', true);
  const b = { tp: v_('pa_t'), n: v_('pa_n').trim(), s: v_('pa_s').trim(), u, l: v_('pa_l').trim(), c: v_('pa_c').trim(), x: v_('pa_x').trim(), web: v_('pa_w') };
  return apiBusy(f, call('POST', 'partner-apps', b).then(() => { f.reset(); })); };

/* ---------------- SEO › Rehber [seo] ---------------- */
p2F('postadd', async (f) => { const b = p7Body('new'); if (b.title.length < 3 || !b.body.trim()) return toast('Başlık ve içerik gerekli.', true);
  const j = await call('POST', 'admin/posts', b); delete P7.cover.new; f.reset(); p7Posts(j); p7After(['post', 'L']); }, 'seo');
p2F('postsave', async (f) => { const id = f.dataset.id; const j = await call('PUT', 'admin/posts/' + p7enc(id), p7Body(id)); delete P7.cover[id]; p7Posts(j);
  needDrop('post'); render(); }, 'seo');
p2A('post-del', async (d) => { const j = await call('DELETE', 'admin/posts/' + p7enc(d.id)); closeConfirm(false); p7Posts(j); needDrop('post'); render(); }, 'seo');
CHG.p7cover = async (el) => { if (!admOk('seo')) return toast('Bu işlem için yetkiniz yok.', true); const f = el.files && el.files[0]; const k = el.dataset.k; el.value = ''; if (!f) return;
  try { const r = await p1Shrink(f, 1600); const m = await p1Upload(r.blob, r.name, 'post'); P7.cover[k] = { id: m.id, url: m.url }; toast('Kapak yüklendi; yazıyı kaydedin.'); }
  catch (e) { toast((e && e.error) || 'Kapak yüklenemedi.', true); } render(); };
ACT['p7cover-del'] = (d) => { P7.cover[d.k] = null; const i = $('#pt_c_' + d.k); if (i) i.value = ''; render(); };

/* ---------------- SEO › Backlink & ortaklık [seo] ---------------- */
const p7Bl = j => { p7SetBl(j && j.data); API.cache['adm:bl'] = { v: { n: (S.backlinks || []).length }, t: Date.now() }; needDrop('adm:today'); render(); };
p2F('bladd', async (f) => { const u = v_('bl_u').trim(); if (!/^https?:\/\//.test(u)) return toast('Adres https:// ile başlamalı.', true);
  const j = await call('POST', 'admin/backlinks', { url: u, target: v_('bl_t').trim() || '/', anchor: v_('bl_a').trim(), k: v_('bl_k'), nf: !!($('#bl_nf') || {}).checked }); f.reset(); p7Bl(j); }, 'seo');
CHG.blst = (el) => { if (!admOk('seo')) return toast('Bu işlem için yetkiniz yok.', true); call('PUT', 'admin/backlinks/' + p7enc(el.dataset.id), { st: el.value }).then(p7Bl, () => render()); };
p2A('bl-del', async (d) => { const j = await call('DELETE', 'admin/backlinks/' + p7enc(d.id)); closeConfirm(false); p7Bl(j); }, 'seo');
p2A('pa-ok', async (d) => { p7Bl(await call('POST', 'admin/partner-apps/' + p7enc(d.id) + '/approve', {})); needDrop('L'); }, 'seo');
p2A('pa-no', async (d) => { p7Bl(await call('POST', 'admin/partner-apps/' + p7enc(d.id) + '/reject', {})); }, 'seo');

/* ---------------- Site ayarları [ayar] ---------------- */
const p7Num = id => { const v = v_(id).trim().replace(',', '.'); return v === '' ? null : +v; };
p2F('settings', async (f) => {
  const b = { siteName: v_('st_name').trim(), slogan: v_('st_slogan').trim(), siteUrl: v_('st_url').trim(), commission: p7Num('st_com'), autoConfirm: p7Num('st_ac'), minWithdraw: p7Num('st_min'),
    tfaOn: !!($('#st_tfa') || {}).checked, popupOn: !!($('#st_pop') || {}).checked, popupDelay: p7Num('st_pd'), supportHours: v_('st_sh').trim(), ptRate: p7Num('st_pr'), whatsapp: v_('st_wa').trim() };
  Object.keys(b).forEach(k => { if (b[k] === null) delete b[k]; });
  const j = await call('PUT', 'admin/settings/site', b); API.cache['adm:site'] = { v: j.data, t: Date.now() }; admDirtyClear(); needDrop('adm:golive'); render(); }, 'ayar');
p2F('p7company', async (f) => { const b = { type: v_('co_type') || 'sirket' };
  ['unvan', 'adres', 'vd', 'vkn', 'mersis', 'sicil', 'tel', 'email', 'kep', 'oda', 'verbis', 'hosting', 'msg'].forEach(k => { b[k] = v_('co_' + k).trim(); });
  await call('PUT', 'admin/settings/company', b); admDirtyClear(); needDrop('adm:pages', 'adm:golive', 'adm:site', 'page'); render(); }, 'ayar');
p2F('p7page', async (f) => { const k = f.dataset.k; const j = await call('PUT', 'admin/pages/' + p7enc(k), { title: v_('pg_t_' + k).trim(), body: v_('pg_b_' + k) });
  API.cache['adm:pages'] = { v: j.data, t: Date.now() }; admDirtyClear(); needDrop('page:' + k, 'adm:golive'); render(); }, 'ayar');
p2A('p7page-reset', async (d) => { const j = await call('POST', 'admin/pages/' + p7enc(d.k) + '/reset', {}); API.cache['adm:pages'] = { v: j.data, t: Date.now() }; needDrop('page:' + d.k); render(); }, 'ayar');
ACT['p7golive-re'] = () => { needDrop('adm:golive'); render(); };
p2F('golive', async () => { const j = await call('PUT', 'admin/settings/golive', { demoMode: !!($('#gl_demo') || {}).checked }); admDirtyClear(); needDrop('adm:golive', 'adm:site'); render(); }, 'ayar');
/* ETBİS: kayıt, yapıştırılan kod (bağlantı + karekod), görsel yükleme / silme */
const p7Etb = j => { if (j && j.data) { API.cache['adm:site'] = { v: j.data, t: Date.now() }; if (j.data.etbis) S.set.etbis = Object.assign({}, j.data.etbis); } needDrop('adm:golive'); render(); };
p2F('etbisset', async () => { const url = v_('eb_url').trim(); if (url && !etbisUrlOk(url)) return toast('Doğrulama bağlantısı etbis.ticaret.gov.tr adresiyle başlamalı (https).', true);
  const on = !!($('#eb_on') || {}).checked; if (on && !url) return toast('Rozeti göstermek için doğrulama bağlantısını girin.', true);
  const b = { on, url, code: v_('eb_code').trim().slice(0, 80), date: v_('eb_date') }; if (P7.etbImg) b.imgData = P7.etbImg;
  const j = await call('PUT', 'admin/settings/etbis', b); P7.etbImg = null; admDirtyClear(); p7Etb(j); }, 'ayar');
CHG.etbispaste = (el) => { if (!admOk('ayar')) return toast('Bu işlem için yetkiniz yok.', true); const r = etbisParse(el.value);
  if (!r.url && !r.img) return toast('Yapıştırılan kodda ETBİS bağlantısı veya karekodu bulunamadı.', true);
  const E = etbisCfg(); if (r.url) { E.url = r.url; const u = $('#eb_url'); if (u) u.value = r.url; }
  if (r.img) { if (/^data:image\//.test(r.img)) P7.etbImg = r.img; E.img = r.img; }
  el.value = ''; toast('ETBİS kodu okundu: ' + [r.url && 'bağlantı', r.img && 'karekod'].filter(Boolean).join(' ve ') + ' alındı. Kaydetmeyi unutmayın.'); render(); };
CHG.etbisimg = async (el) => { if (!admOk('ayar')) return toast('Bu işlem için yetkiniz yok.', true); const f = el.files && el.files[0]; el.value = ''; if (!f) return;
  if (f.size > 600 * 1024) return toast('Görsel en fazla 600 KB olabilir.', true);
  const fd = new FormData(); fd.append('file', f, String(f.name || 'etbis.png').replace(/[^\w.\-]+/g, '_').slice(-60));
  try { const j = await call('POST', 'admin/settings/etbis/img', fd); P7.etbImg = null; p7Etb(j); } catch (e) { } };
p2A('etbis-img-del', async () => { P7.etbImg = null; p7Etb(await call('DELETE', 'admin/settings/etbis/img')); }, 'ayar');

/* ---------------- Yedek & bakım [bakim] ---------------- */
const p7Bk = j => { if (j && j.data) { API.cache['adm:bk'] = { v: j.data, t: Date.now() }; } needDrop('adm:maint', 'adm:golive'); render(); };
p2F('maintset', async () => { const u = v_('mt_until'); const until = u ? new Date(u).getTime() : null;
  if (until && until <= Date.now()) return toast('Tahmini bitiş ileri bir zaman olmalı.', true);
  const j = await call('PUT', 'admin/settings/maint', { on: !!($('#mt_on') || {}).checked, msg: v_('mt_msg').trim(), until });
  API.cache['adm:maint'] = { v: j.data, t: Date.now() }; admDirtyClear(); needDrop('adm:bk'); render(); }, 'bakim');
p2A('bk-now', async () => { p7Bk(await call('POST', 'admin/backups', {})); }, 'bakim');
p2A('bk-del', async (d) => { const j = await call('DELETE', 'admin/backups/' + p7enc(d.id)); closeConfirm(false); p7Bk(j); }, 'bakim');
p2A('bk-restore', async (d) => { closeConfirm(false); const j = await call('POST', 'admin/backups/' + p7enc(d.id) + '/restore', {}).catch(e => { P7.rest = { log: [apiErr(e)], check: { ok: false } }; render(); throw e; });
  P7.rest = j.data.restore; API.cache = {}; if (j.data.restore && j.data.restore.relogin) { apiReboot(true).then(() => render(), () => render()); }
  p7Bk(j); }, 'bakim');
p2A('bk-dl', async (d) => { if (!me() || !me().admin) return toast('Yedekleri yalnız yönetici indirebilir.', true); location.href = apiUrl('admin/backups/' + p7enc(d.id) + '/download'); }, 'bakim');
CHG.bkauto = (el) => { if (!admOk('bakim')) return toast('Bu işlem için yetkiniz yok.', true); call('PUT', 'admin/settings/backup', { auto: el.value }).then(p7Bk, () => render()); };
CHG.p7bkkeep = (el) => { if (!admOk('bakim')) return toast('Bu işlem için yetkiniz yok.', true); const n = parseInt(el.value, 10); if (!(n >= 1 && n <= 60)) return toast('1 ile 60 arasında bir sayı yazın.', true);
  call('PUT', 'admin/settings/backup', { keep: n }).then(p7Bk, () => render()); };
CHG.bkfile = async (el) => { if (!me() || !me().admin) return toast('Yedek dosyasını yalnız yönetici yükleyebilir.', true); const f = el.files && el.files[0]; el.value = ''; if (!f) return;
  const fd = new FormData(); fd.append('file', f, String(f.name || 'yedek.sql.gz').replace(/[^\w.\-]+/g, '_').slice(-80));
  toast('Yedek dosyası yükleniyor ve doğrulanıyor…'); try { p7Bk(await call('POST', 'admin/backups/upload', fd)); } catch (e) { } };
p2A('safe-update', async () => { const j = await call('POST', 'admin/update', {}).catch(e => { P7.upd = { ok: false, log: [apiErr(e)] }; render(); throw e; });
  P7.upd = { ok: j.data.ok, log: j.data.log || [] }; API.cache['adm:maint'] = { v: j.data, t: Date.now() }; needDrop('adm:bk', 'adm:golive'); render(); }, 'bakim');
ADM_FORM.p7company = 'ayar'; ADM_FORM.p7page = 'ayar'; ADM_ACT['p7page-reset'] = 'ayar'; ADM_CHG.p7cover = 'seo'; ADM_CHG.p7bkkeep = 'bakim';
