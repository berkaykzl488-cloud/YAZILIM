/* ================== P5: reklam / kampanya / VIP / davet / geri kazanım işleyicileri (yalnız --prod derlemesinde) ==================
   97p5-growth.js ekranlarının işleyicileri. Yetki denetimi burada da yapılır (asıl denetim sunucuda). Tüm istekler call() → apiUrl()
   ile /api/v1/index.php?r=<yol> adresine gider; reklam satın almada Idempotency-Key form başına tektir (ağ hatasında aynı anahtarla
   tekrar). Görsel/video önce POST media (kind=ad | slide) ile yüklenir, istekte yalnız medya kimlikleri gider.                     */
/** Dosyaları sırayla yükler: görseller küçültülür (en uzun kenar 2400), video olduğu gibi (≤ 15 MB). Dönüş: medya kimlikleri */
async function p5Upload(files, kind) { const ids = [];
  for (const f of files) {
    if (f.size > 15 * 1048576) { toast(f.name + ' 15 MB sınırını aşıyor.', true); continue; }
    const vid = /^video\//.test(f.type); if (!vid && !/^image\//.test(f.type)) { toast(f.name + ': yalnız görsel ya da MP4/WEBM video.', true); continue; }
    let blob = f, name = String(f.name || 'dosya').replace(/[^\w.\-]+/g, '_').slice(-60);
    if (!vid) { try { const r = await p1Shrink(f, 2400); blob = r.blob; name = r.name; } catch (e) { } }
    try { const m = await p1Upload(blob, name, kind); ids.push(m.id); P5.mm[m.id] = { url: m.url, video: vid }; }
    catch (e) { toast((e && e.error) || ('Yüklenemedi: ' + f.name), true); throw e; } }
  return ids; }
const p5AdAfter = (j) => { if (j && j.data && j.data.ad) p5UpAds([j.data.ad]); if (j && j.data && j.data.users) p1UpU(j.data.users); needDrop('adm:ads', 'adm:today', 'ad:av', 'me:ads'); render(); };

/* ---------------- Reklam Ver ---------------- */
FORM.buyad = (f) => apiBusy(f, (async () => {
  const u = me(); if (!u) return mLogin(); const t = ui.adType; const P = S.packs[t]; if (!P) return toast('Reklam alanı seçin.', true);
  const di = +((document.querySelector('input[name=dur]:checked') || {}).value ?? 1), days = [1, 7, 30][di] || 7, free = can('reklam'), price = free ? 0 : +P.p[di] || 0;
  if (!ui.adStart || ui.adStart < dayStart(now())) { toast('Takvimden bir başlangıç tarihi seçin.', true); const c = $('#adCal'); if (c) c.scrollIntoView({ block: 'center' }); return; }
  const clash = adRangeFree(t, ui.adStart, days); if (clash) return toast(`${dstr(clash)} tarihi dolu. Başka bir başlangıç günü seçin.`, true);
  if (avail(u) < price) { toast(`Bakiye yetersiz. ${TL(price - avail(u))} daha yükleyin.`, true); return; }
  const text = (($('#ad_text') || {}).value || '').trim(), title = (($('#ad_title') || {}).value || '').trim();
  if (t !== 'premium' && !text) return toast('Reklam metnini yazın.', true);
  const sid = ($('#ad_server') || {}).value || ''; const b = { type: t, dur: di, start: ui.adStart, server: sid, title, text };
  if (sid === '_new') { const nm = (($('#ns_name') || {}).value || '').trim(); if (!nm) return toast('Server adını yazın.', true); const op = (($('#ns_open') || {}).value || '');
    b.srv = { name: nm, lv: (($('#ns_lv') || {}).value || '').trim(), type: ($('#ns_type') || {}).value || '', url: (($('#ns_url') || {}).value || '').trim(), c1: ($('#ns_c1') || {}).value, c2: ($('#ns_c2') || {}).value };
    if (op) b.srv.open = new Date(op).getTime(); }
  const files = [...((($('#ad_media') || {}).files) || [])];
  if (files.length) { try { b.media = await p5Upload(files, 'ad'); } catch (e) { return; } }
  let j; try { j = await call('POST', 'ads', b, { key: formKey(f) }); }
  catch (e) { if (e && (e.code === 'ad_full' || e.code === 'insufficient')) { needDrop('ad:av'); setTimeout(render, 0); } return; }
  p5UpAds([j.data.ad]); needDrop('ad:av', 'me:ads', 'me:tx', 'adm:ads', 'adm:today'); ui.adStart = null; delete f.dataset.ikey;
  render(); window.scrollTo(0, 0);
})());

/* ---------------- Çekiliş & Şans Çarkı (üye) ---------------- */
ACT['free-tk'] = (d, e) => { const u = me(); if (!u) return mLogin(); const el = e && e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  return apiBusy(el, call('POST', 'raffles/' + p5enc(d.id) + '/free-ticket', {}).then(j => { if (j.data && j.data.camp) p5CampSet(j.data.camp); render(); }, x => { if (x && x.code === 'already') { S.rfree[u.id + '_' + d.id] = today(); render(); } })); };
FORM.p5mkt = (f) => apiBusy(f, call('PUT', 'me/marketing', { mail: !!($('#mk_mail') || {}).checked, sms: !!($('#mk_sms') || {}).checked }).then(j => { P5.mkt = j.data.mkt; render(); }));

/* ---------------- Yönetim: reklam [reklam] ---------------- */
p2A('ad-ok', async (d) => { const j = await call('POST', 'admin/ads/' + p5enc(d.id) + '/approve', {}); p5AdAfter(j); });
FORM.adrej = (f) => { if (!admOk('reklam')) return toast('Bu işlem için yetkiniz yok.', true); const id = f.dataset.id;
  return apiBusy(f, call('POST', 'admin/ads/' + p5enc(id) + '/reject', { reason: v_('adr_' + id).trim() }).then(p5AdAfter)); };
p2A('ad-toggle', async (d) => { p5AdAfter(await call('POST', 'admin/ads/' + p5enc(d.id) + '/toggle', {})); });
p2A('ad-ext', async (d) => { p5AdAfter(await call('POST', 'admin/ads/' + p5enc(d.id) + '/extend', {})); });
p2A('ad-del', async (d) => { const j = await call('DELETE', 'admin/ads/' + p5enc(d.id)); closeConfirm(false); S.ads = S.ads.filter(a => a.id !== d.id); p5AdAfter(j); });
p2A('ad-media-clear', async (d) => { p5AdAfter(await call('DELETE', 'admin/ads/' + p5enc(d.id) + '/media')); });
p2A('ad-detail', async (d) => { const j = await call('GET', 'admin/ads/' + p5enc(d.id), null, { quiet: true }); const x = j.data || {}; p5UpAds([x.ad]); p1UpU(x.users);
  const a = S.ads.find(z => z.id === d.id); if (a) a.st = x.stats || {}; mAdDetail(d.id); }, 'reklam');
CHG.admediaadd = async (el) => { if (!admOk('reklam')) return toast('Bu işlem için yetkiniz yok.', true); const files = [...(el.files || [])]; const id = el.dataset.id; el.value = ''; if (!files.length) return;
  let ids; try { ids = await p5Upload(files, 'ad'); } catch (e) { return; } if (!ids.length) return;
  call('POST', 'admin/ads/' + p5enc(id) + '/media', { media: ids }).then(p5AdAfter, () => { }); };
FORM.packs = (f) => { if (!admOk('reklam')) return toast('Bu işlem için yetkiniz yok.', true);
  const packs = {}; Object.keys(S.packs).forEach(k => { packs[k] = { p: [0, 1, 2].map(i => +p2Num(($('#pk_' + k + '_' + i) || {}).value) || 0), cap: parseInt(v_('pk_' + k + '_cap')) || 1 }; });
  return apiBusy(f, call('PUT', 'admin/packs', { packs }).then(j => { S.packs = j.data.packs; needDrop('ad:av'); render(); })); };
ACT['preview-pop'] = () => showPopup(true);

/* ---------------- Yönetim: site görselleri [reklam] ---------------- */
const p5SlAfter = () => { needDrop('adm:slides'); render(); };
FORM.slideadd = (f) => { if (!admOk('reklam')) return toast('Bu işlem için yetkiniz yok.', true); return apiBusy(f, (async () => {
  const files = [...((($('#sl_f') || {}).files) || [])]; if (!files.length && !v_('sl_t').trim()) return toast('Bir görsel yükleyin veya başlık yazın.', true);
  let media = []; if (files.length) { try { media = await p5Upload(files, 'slide'); } catch (e) { return; } }
  await call('POST', 'admin/slides', { title: v_('sl_t').trim(), text: v_('sl_x').trim(), link: v_('sl_l').trim(), btn: v_('sl_b').trim(), c: [v_('sl_c1'), v_('sl_c2')], media });
  p5SlAfter(); })()); };
p2A('slide-toggle', async (d) => { await call('POST', 'admin/slides/' + p5enc(d.id) + '/toggle', {}); p5SlAfter(); });
p2A('slide-clear', async (d) => { await call('DELETE', 'admin/slides/' + p5enc(d.id) + '/media'); p5SlAfter(); });
p2A('slide-del', async (d) => { await call('DELETE', 'admin/slides/' + p5enc(d.id)); closeConfirm(false); p5SlAfter(); });
CHG.slidemedia = async (el) => { if (!admOk('reklam')) return toast('Bu işlem için yetkiniz yok.', true); const files = [...(el.files || [])]; const id = el.dataset.id; el.value = ''; if (!files.length) return;
  let ids; try { ids = await p5Upload(files, 'slide'); } catch (e) { return; } if (!ids.length) return;
  call('POST', 'admin/slides/' + p5enc(id) + '/media', { media: ids }).then(p5SlAfter, () => { }); };

/* ---------------- Yönetim: çekiliş & çark [kampanya] ---------------- */
const p5RfAfter = () => { needDrop('adm:raffles', 'adm:wheel', 'camp'); render(); };
FORM.raffle = (f) => { if (!admOk('kampanya')) return toast('Bu işlem için yetkiniz yok.', true);
  const b = { title: v_('rf_t').trim(), kind: v_('rf_k'), value: +p2Num(v_('rf_v')) || 0, per: +p2Num(v_('rf_per')) || 100, minVip: v_('rf_vip'), maxTk: parseInt(v_('rf_max')) || 0,
    cats: [...document.querySelectorAll('[data-rc]:checked')].map(c => c.dataset.rc), days: parseInt(v_('rf_d')) || 7, free: !!($('#rf_free') || {}).checked };
  return apiBusy(f, call('POST', 'admin/raffles', b).then(p5RfAfter)); };
p2A('draw', async (d) => { const j = await call('POST', 'admin/raffles/' + p5enc(d.id) + '/draw', {}); p1UpU((j.data || {}).users); p5RfAfter(); });
p2A('r-del', async (d) => { await call('DELETE', 'admin/raffles/' + p5enc(d.id)); closeConfirm(false); p5RfAfter(); });
p2A('p5-rverify', async (d) => { const j = await call('GET', 'admin/raffles/' + p5enc(d.id) + '/verify', null, { quiet: true }); const x = j.data || {};
  modal(mWrap('Çekiliş doğrulaması', `<div class="stack"><div class="note ${x.ok ? 'note-ok' : 'note-bad'}"><b>${x.ok ? 'Sonuç doğrulandı.' : 'Sonuç doğrulanamadı!'}</b> Saklanan bilet listesi ve tohumla kazanan yeniden hesaplandı.</div>
    <div class="sum"><div><span class="muted">Yeniden hesaplanan kazanan</span><b>${esc(x.winner ? user(x.winner).name : '-')}</b></div><div><span class="muted">Kayıtlı kazanan</span><b>${esc(x.stored ? user(x.stored).name : '-')}</b></div><div><span class="muted">Kazanan bilet</span><b class="mono">${NUM((+x.index || 0) + 1)} / ${NUM(x.total || 0)}</b></div><div><span class="muted">Katılımcı</span><b>${NUM(x.entrants || 0)}</b></div></div>
    <div class="fld"><span class="lbl">Tohum (seed)</span><span class="mono p5seed">${esc(x.seed || '')}</span></div><div class="fld"><span class="lbl">Bilet listesi özeti (SHA-256)</span><span class="mono p5seed">${esc(x.snapshotSha256 || '')}</span></div><span class="muted" style="font-size:12px">Yöntem: ${esc(x.algo || '')}</span></div>`)); }, 'kampanya');
CHG.wheelon = (el) => { if (!admOk('kampanya')) { el.checked = !el.checked; return toast('Bu işlem için yetkiniz yok.', true); }
  call('PUT', 'admin/settings/wheel', { wheelOn: el.checked }).then(j => { S.set.wheelOn = !!j.data.on; needDrop('adm:wheel', 'camp'); render(); }, () => { el.checked = !el.checked; }); };
CHG.p5raffleon = (el) => { if (!admOk('kampanya')) { el.checked = !el.checked; return toast('Bu işlem için yetkiniz yok.', true); }
  call('PUT', 'admin/settings/wheel', { raffleOn: el.checked }).then(j => { S.set.raffleOn = !!j.data.raffleOn; p5RfAfter(); }, () => { el.checked = !el.checked; }); };
p2A('spin-reset', async () => { await call('POST', 'admin/spins/reset', {}); closeConfirm(false); needDrop('adm:wheel', 'camp'); render(); });
const p5PrzRead = () => WHEEL.map((w, i) => ({ l: v_('wp_l_' + i).trim(), k: v_('wp_k_' + i), v: +p2Num(v_('wp_v_' + i)) || 0, w: +p2Num(v_('wp_w_' + i)) || 0, c: v_('wp_c_' + i) }));
ACT['p5-prz-add'] = () => { if (WHEEL.length >= 16) return; const L = p5PrzRead(); L.push({ l: '1 TL', k: 'bal', v: 1, w: 1, c: '#5b3fa8' }); WHEEL.splice(0, WHEEL.length, ...L); ui.admDirty = true; render(); };
ACT['p5-prz-del'] = () => { if (WHEEL.length <= 2) return; const L = p5PrzRead(); L.pop(); WHEEL.splice(0, WHEEL.length, ...L); ui.admDirty = true; render(); };
FORM.p5prizes = (f) => { if (!admOk('kampanya')) return toast('Bu işlem için yetkiniz yok.', true);
  return apiBusy(f, call('PUT', 'admin/settings/wheel', { prizes: p5PrzRead() }).then(j => { if (Array.isArray(j.data.prizes)) WHEEL.splice(0, WHEEL.length, ...j.data.prizes); needDrop('adm:wheel', 'camp'); ui.admDirty = false; render(); })); };

/* ---------------- Yönetim: VIP & davet [vip] ---------------- */
FORM.vipset = (f) => { if (!admOk('vip')) return toast('Bu işlem için yetkiniz yok.', true);
  const levels = VIP.map((v, i) => ({ id: v.id, n: v_('vp_n_' + i).trim() || v.n, min: Math.max(0, +p2Num(v_('vp_m_' + i)) || 0), disc: Math.max(0, +p2Num(v_('vp_d_' + i)) || 0), cb: Math.max(0, +p2Num(v_('vp_c_' + i)) || 0), c: v_('vp_k_' + i) || v.c }));
  return apiBusy(f, call('PUT', 'admin/vip', { levels }).then(j => { S.vip = j.data.vip; VIP = S.vip; ui.admDirty = false; render(); })); };
FORM.refset = (f) => { if (!admOk('vip')) return toast('Bu işlem için yetkiniz yok.', true);
  const b = { refOn: !!($('#rf_on') || {}).checked, refBonus: +p2Num(v_('rf_b')) || 0, refFriend: +p2Num(v_('rf_f')) || 0, refMin: +p2Num(v_('rf_m')) || 0, refMax: parseInt(v_('rf_x')) || 1 };
  return apiBusy(f, call('PUT', 'admin/settings/referral', b).then(j => { Object.assign(S.set, j.data.ref || {}); needDrop('adm:refs'); ui.admDirty = false; render(); })); };
p2A('p5-flag-seen', async (d) => { await call('POST', 'admin/referrals/flags/f' + p5enc(d.id) + '/seen', {}); needDrop('adm:refs'); render(); }, 'vip');

/* ---------------- Yönetim: geri kazan [uye] ---------------- */
FORM.winback = (f) => { if (!admOk('uye')) return toast('Bu işlem için yetkiniz yok.', true);
  const ids = [...document.querySelectorAll('.wbc:checked')].map(x => x.value); if (!ids.length) return toast('En az bir üye seçin.', true);
  const tpl = v_('wb_msg').trim(); if (!tpl) return toast('Mesaj yazın.', true);
  const b = { ids, tpl, coupon: v_('wb_cp').trim().toUpperCase(), pct: +p2Num(v_('wb_pct')) || 10, gift: +p2Num(v_('wb_gift')) || 0, days: +(ui.wbDays || 30),
    ntf: !!($('#wb_ntf') || {}).checked, mail: !!($('#wb_mail') || {}).checked, sms: !!($('#wb_sms') || {}).checked };
  return apiBusy(f, call('POST', 'admin/winback', b, { key: formKey(f) }).then(() => { delete f.dataset.ikey; needDrop('adm:wb'); render(); })); };
