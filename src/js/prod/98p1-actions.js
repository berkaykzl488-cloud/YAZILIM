/* ================== P1: katalog işleyicileri (yalnız --prod derlemesinde) ==================
   99-wiring'deki ADM_* yetki sarmalayıcılarından ve P0b işleyicilerinden SONRA yüklenir; yetki kontrolü burada yeniden
   uygulanır (asıl kontrol sunucuda). Yükle-önce: fotoğraflar seçilir seçilmez tarayıcıda en uzun kenar 1600 px'e
   küçültülür (canvas → webp, olmazsa jpeg, kalite ~0.85), tek tek POST media ile yüklenir; form yalnız medya kimliklerini
   gönderir. Her dosyanın ilerlemesi ve hatası ayrı gösterilir.                                                        */
/** Görseli tarayıcıda küçültür. Dönüş: {blob, name, w, h, from?, info} — çözülemeyen dosya olduğu gibi döner (sunucu karar verir). */
function p1Img(file) { return new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => res({ im, u }); im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); }; im.src = u; }); }
async function p1Shrink(file, max) {
  max = max || 1600; const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
  const base = String(file.name || 'foto').replace(/\.[^.]+$/, '').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'foto';
  const asIs = (info, w, h) => ({ blob: file, name: base + '.' + (EXT[file.type] || 'jpg'), w, h, info: info || '' });
  let o; try { o = await p1Img(file); } catch (e) { return asIs(''); }
  const w = o.im.naturalWidth, h = o.im.naturalHeight; const sc = Math.min(1, max / Math.max(w, h, 1));
  if (sc >= 1 && file.size <= 1.5 * 1048576 && EXT[file.type]) { URL.revokeObjectURL(o.u); return asIs(`${w}×${h}`, w, h); }
  const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(o.im, 0, 0, cw, ch); URL.revokeObjectURL(o.u);
  const tb = (t, q) => new Promise(r => { try { c.toBlob(b => r(b), t, q); } catch (e) { r(null); } });
  let b = await tb('image/webp', 0.85); if (!b || b.type !== 'image/webp') b = await tb('image/jpeg', 0.85);
  if (!b || (sc >= 1 && b.size >= file.size)) return asIs(`${w}×${h}`, w, h);
  return { blob: b, name: base + '.' + (EXT[b.type] || 'jpg'), w: cw, h: ch, from: [w, h], info: `${w}×${h} → ${cw}×${ch} · ${kb(file.size)} → ${kb(b.size)}` };
}
/** POST media (multipart: file + kind) ilerleme bildirimli; adres her zaman api/v1/index.php?r=media */
function p1Upload(blob, name, kind, onProg, onXhr, retried) {
  return new Promise((res, rej) => {
    const fd = new FormData(); fd.append('kind', kind); fd.append('file', blob, name);
    const x = new XMLHttpRequest(); x.open('POST', apiUrl('media')); x.withCredentials = true;
    x.setRequestHeader('Accept', 'application/json'); x.setRequestHeader('X-CSRF-Token', API.csrf || '');
    if (onXhr) onXhr(x);
    x.upload.onprogress = e => { if (e.lengthComputable && onProg) onProg(Math.min(99, Math.round(e.loaded / e.total * 100))); };
    x.onload = () => { let j = null; try { j = JSON.parse(x.responseText); } catch (e) { }
      if (j && j.ok && j.data && j.data.media) return res(j.data.media);
      if (j && j.code === 'csrf' && !retried) return apiReboot(true).then(() => p1Upload(blob, name, kind, onProg, onXhr, 1)).then(res, rej);
      if (j && j.http == null) j.http = x.status;
      rej({ ok: false, http: x.status, code: j && j.code, error: x.status === 413 && !(j && j.error) ? 'Dosya sunucunun yükleme sınırını aşıyor.' : j ? apiErr(j) : API_MSG.bad }); };
    x.onerror = () => rej({ ok: false, http: 0, error: API_MSG.net });
    x.onabort = () => rej({ ok: false, http: 0, error: 'İptal edildi', aborted: true });
    x.send(fd);
  });
}
function p1ProgDom(p, it) { const el = document.querySelector(`[data-pk="${CSS.escape(p + ':' + it.k)}"]`); if (!el) return;
  const i = el.querySelector('.p1-prog i'); if (i) i.style.width = (it.pct || 0) + '%'; const t = el.querySelector('.p1-st'); if (t) t.textContent = 'Yükleniyor %' + (it.pct || 0); }
async function p1UpOne(p, it, kind) {
  const alive = () => (UPL[p] || []).includes(it); if (!alive()) return;
  try {
    const r = await p1Shrink(it.file, 1600); it.info = r.info; it.orig = it.file.size; it.sent = r.blob.size; it.w = r.w; it.h = r.h; it.from = r.from || null;
    if (r.blob.size > 10 * 1048576) throw { error: 'Fotoğraf çok büyük (en fazla 10 MB).' };
    if (!alive()) return;
    const m = await p1Upload(r.blob, r.name, kind || 'listing', pct => { it.pct = pct; p1ProgDom(p, it); }, x => { it.xhr = x; });
    if (!alive()) return;
    try { URL.revokeObjectURL(it.url); } catch (e) { }
    Object.assign(it, { id: m.id, url: m.url, st: 'ok', pct: 100, mw: m.w, mh: m.h }); delete it.file; delete it.xhr;
  } catch (e) { if (!alive() || (e && e.aborted)) return; it.st = 'err'; it.err = (e && e.error) || 'Yüklenemedi'; delete it.xhr; }
  pupRefresh(p);
}
if (YP_PROD) {
const p1Perm = (map, k) => { const p = map[k]; return !p || admOk(p); };
const p1A = (k, fn) => { ACT[k] = (d, e) => { if (!p1Perm(ADM_ACT, k)) return toast('Bu işlem için yetkiniz yok.', true); const el = e && e.target && e.target.closest ? e.target.closest('[data-act]') : null; return apiBusy(el, fn(d, e, el)); }; };
const p1F = (k, fn) => { FORM[k] = (f) => { if (!p1Perm(ADM_FORM, k)) return toast('Bu işlem için yetkiniz yok.', true); return apiBusy(f, fn(f)); }; };
const p1Cnum = s => { const x = String(s == null ? '' : s).trim().replace(/\s/g, ''); return x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x; };

/* ---- listeler: daha fazla, arama/sıralama ---- */
ACT['p1-more'] = (d, e) => { const c = API.cache[d.k]; const v = c && c.v; if (!v || !v.next) return;
  const el = e && e.target && e.target.closest ? e.target.closest('button') : null;
  return apiBusy(el, call('GET', v.path + '?' + (v.qs ? v.qs + '&' : '') + 'after=' + encodeURIComponent(v.next) + '&limit=' + (v.lim || 24), null).then(j => { const x = j.data || {};
    p1UpL(x.listings); p1UpU(x.users); (x.listings || []).forEach(l => { if (!v.ids.includes(l.id)) v.ids.push(l.id); }); v.next = x.next || null; render(); })); };
FORM.p1f = () => { ui.f.q = v_('p1_q').trim(); render(); };
ACT['p1-qclear'] = () => { ui.f.q = ''; render(); };

/* ---- henüz sunucuda olmayanlar (satın alma ve doping: 98p2-actions.js) ---- */
ACT['sms-user'] = () => toast(P1_SOON.sms);

/* ---- fotoğraflar (önce yükle) ---- */
P1.q = {};
CHG.pupadd = (el) => { const p = el.dataset.p; const L = UPL[p] = UPL[p] || []; const fs = [...(el.files || [])]; el.value = '';
  const room = PUP_MAX - L.length; if (fs.length > room) toast(`En fazla ${PUP_MAX} fotoğraf ekleyebilirsiniz; ilk ${Math.max(0, room)} tanesi eklendi.`, true);
  const items = fs.slice(0, Math.max(0, room)).map(f => ({ k: ++P1.uk, url: URL.createObjectURL(f), st: 'up', pct: 0, name: f.name, file: f }));
  if (!items.length) return; items.forEach(it => L.push(it)); pupRefresh(p);
  items.forEach(it => { P1.q[p] = (P1.q[p] || Promise.resolve()).then(() => p1UpOne(p, it)); }); };
ACT.pupdel = (d) => { const L = UPL[d.p] || []; const [x] = L.splice(+d.i, 1); if (x && x.xhr) try { x.xhr.abort(); } catch (e) { } if (x && x.st !== 'ok') try { URL.revokeObjectURL(x.url); } catch (e) { } pupRefresh(d.p); };
const p1Media = p => { const L = UPL[p] || []; if (L.some(x => x && x.st === 'up')) { toast('Fotoğraflar yükleniyor, lütfen bitmesini bekleyin.', true); return null; }
  const bad = L.filter(x => x && x.st === 'err').length; if (bad) { toast(`${bad} fotoğraf yüklenemedi. Kaldırıp yeniden deneyin.`, true); return null; }
  return L.map(p1It).filter(x => x.id).map(x => x.id); };

/* ---- ilan ver ---- */
p1F('sell', async (f) => { const u = me(); if (!u) return mLogin();
  const g = (document.querySelector('input[name=game]:checked') || {}).value || 'mtr'; const cat = v_('s_cat');
  if (g === 'mtr' && cat === 'ep') return toast('EP ilanı verilemez. EP yalnızca site tarafından satılır.', true);
  const server = v_(g === 'mtr' ? 's_server_tr' : 's_server_pvp'); if (!server) return toast('Server seçin.', true);
  const media = p1Media('s'); if (!media) return;
  const b = { game: 'metin2', server, cat, title: v_('s_title').trim(), price: p1Cnum(v_('s_price')), stock: parseInt(v_('s_stock'), 10) || 1, del: v_('s_del'), desc: v_('s_desc'),
    cover: (document.querySelector('input[name=cover]:checked') || {}).value || '', media };
  // P2: seçilen dopingler {vitrin: gün}; ücret ilanla aynı işlemde bakiyeden düşülür (yetersizse ilan açılmaz)
  const dop = {}; document.querySelectorAll('form[data-form=sell] [data-dop]:checked').forEach(c => { const k = c.dataset.dop; if (S.dopings[k]) dop[k] = Math.max(1, parseInt(v_('dd_' + k), 10) || 1); });
  if (Object.keys(dop).length) { const cost = r2(Object.entries(dop).reduce((s, [k, n]) => s + dopCost(k, n), 0));
    if (avail(u) < cost) { toast(`Doping için ${TL(cost)} gerekiyor, bakiyeniz ${TL(avail(u))}. Önce bakiye yükleyin ya da dopingi kaldırın.`, true); ui.depAmt = Math.max(10, Math.ceil(cost - avail(u))); return; }
    b.dop = dop; }
  const j = await call('POST', 'listings', b, { key: formKey(f) }); const l = j.data.listing;
  UPL.s = []; ui.preset = null; needDrop('L'); try { track('ilan', { value: l.price }); } catch (e) { }
  go('ilan-' + l.id); });

/* ---- ilan düzenle / kaldır / üste taşı ---- */
ACT['edit-l'] = (d) => { const l = lst(d.id); if (!l) return; if (l.seller !== S.cur) return toast('İlanı yalnız sahibi düzenleyebilir.', true);
  mEditListing(d.id); UPL.e = (l.media || []).map(m => ({ k: ++P1.uk, id: m.id, url: m.url, st: 'ok' })); pupRefresh('e'); };
p1F('editl', async (f) => { const id = f.dataset.id; const media = p1Media('e'); if (!media) return;
  const b = { title: v_('ed_title').trim(), price: p1Cnum(v_('ed_price')), stock: Math.max(0, parseInt(v_('ed_stock'), 10) || 0), del: v_('ed_del'), desc: v_('ed_desc'), media };
  await call('PUT', 'listings/' + encodeURIComponent(id), b, { key: formKey(f) }); UPL.e = []; closeModal(); needDrop('L', 'adm:lst'); render(); });
p1A('unlist', async (d, e, b) => { if (b && !b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Emin misiniz? Tekrar basın'; setTimeout(() => { if (b.isConnected && b.dataset.ok) { delete b.dataset.ok; render(); } }, 4000); return; }
  await call('POST', 'listings/' + encodeURIComponent(d.id) + '/unlist'); needDrop('L', 'adm:lst'); render(); });
p1A('free-bump', async (d) => { await call('POST', 'listings/' + encodeURIComponent(d.id) + '/free-bump'); needDrop('L'); render(); });

/* ---- Yönetim › İlanlar ---- */
p1A('l-ok', async (d) => { await call('POST', 'admin/listings/' + encodeURIComponent(d.id) + '/approve'); needDrop('adm:lst', 'adm:today', 'L'); render(); });
p1A('l-del', async (d) => { await call('POST', 'admin/listings/' + encodeURIComponent(d.id) + '/remove', { reason: '' }); needDrop('adm:lst', 'adm:today', 'L'); render(); });
CHG.mod = (el) => { if (!can('ilan')) { el.checked = !el.checked; return toast('Bu işlem için yetkiniz yok.', true); } const on = el.checked; el.disabled = true;
  call('PUT', 'admin/settings/moderation', { on }).then(() => render(), () => { el.checked = !on; }).finally(() => { if (el.isConnected) el.disabled = false; }); };
CHG.coverup = async (el) => { if (!can('ilan')) return toast('Bu işlem için yetkiniz yok.', true); const f = el.files && el.files[0]; el.value = ''; if (!f) return; const k = el.dataset.k;
  toast('Görsel yükleniyor…');
  let m; try { const r = await p1Shrink(f, 1000); m = await p1Upload(r.blob, r.name, 'cover'); } catch (e) { return toast((e && e.error) || 'Görsel yüklenemedi.', true); }
  try { await call('PUT', 'admin/covers/' + encodeURIComponent(k), { media: m.id }); render(); } catch (e) { } };
p1A('cover-reset', async (d) => { await call('DELETE', 'admin/covers/' + encodeURIComponent(d.k)); render(); });

/* ---- Yönetim › Serverlar (çekmece) ---- */
p1F('srvadd', async (f) => { const sec = ui.svSec || 'tr';
  const b = { name: v_('sv_n').trim(), sec, lv: v_('sv_l').trim(), type: v_('sv_t').trim(), url: v_('sv_u').trim(), c: [v_('sv_c1'), v_('sv_c2')] };
  if (sec === 'pvp') b.ep = v_('sv_ep') === '1';
  const j = await call('POST', 'admin/servers', b, { key: formKey(f) }); const s = j.data.server; p1AdmSrvUp(s);
  admDirtyClear(); ui.svEdit = null; ui.svHi = s.id; ui.svQ = ''; ui.svF = []; ui.svSort = 'yeni'; ui.svPage = 1; admSet({ id: null, q: null, f: null, sort: 'yeni', page: null }); });
p1F('srvsave', async (f) => { const id = f.dataset.id;
  const b = { name: v_('sv_name_' + id).trim(), lv: v_('sv_lv_' + id).trim(), type: v_('sv_type_' + id).trim(), sec: v_('sv_sec_' + id), url: v_('sv_url_' + id).trim(), desc: v_('sv_desc_' + id).trim(),
    c: [v_('sv_c1_' + id), v_('sv_c2_' + id)], active: v_('sv_act_' + id) !== '0' };
  if ($('#sv_seo_' + id)) b.seo = v_('sv_seo_' + id).trim(); if ($('#sv_ep_' + id)) b.ep = b.sec === 'pvp' && v_('sv_ep_' + id) === '1';
  const j = await call('PUT', 'admin/servers/' + encodeURIComponent(id), b, { key: formKey(f) }); const s = j.data.server; p1AdmSrvUp(s);
  if (s.hidden) S.servers = S.servers.filter(x => x.id !== s.id);
  admDirtyClear(); render(); });
p1A('srv-del', async (d) => { await call('DELETE', 'admin/servers/' + encodeURIComponent(d.id)); p1AdmSrvUp(null, d.id); S.servers = S.servers.filter(x => x.id !== d.id);
  admDirtyClear(); ui.svEdit = null; if (isAdmRoute(route())) admSet({ id: null }); else render(); });

/* ---- Yönetim › Bakım › Güncellemeleri uygula ---- */
p1A('p1-update', async () => { const j = await call('POST', 'admin/system/update'); API.cache['adm:sysupd'] = { v: j.data, t: Date.now() }; render(); });
ACT['p1-sysre'] = () => { needDrop('adm:sysupd'); render(); };
ADM_ACT['p1-update'] = 'bakim'; ADM_ACT['p1-sysre'] = 'bakim';
}
