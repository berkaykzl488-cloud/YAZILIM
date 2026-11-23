/* ================== P3: para çekme, T.C. kimlik, e-Gider Pusulası, muhasebe, Entegrasyonlar (yalnız --prod derlemesinde) ==================
   Sunucuya bağlı: Hesabım › Para çek (TC doğrulama NVİ ile sunucuda, tam TC onayı, çekim talebi — Idempotency-Key, yalnız çekilebilir
   bakiye, IBAN kendi adınıza), çekim taleplerim; Yönetim › Para çekme (demo tablosu aynen: Tarih, Üye, Banka & Hesap Sahibi, IBAN,
   Durum & e-Gider Pusulası, Gönderilecek Net, Mal / Hizmet Açıklaması, İşlem; "📋 Açıklamayı Kopyala", IBAN ve net kopyalama),
   onay / red, pusula görünümü (TAM T.C. kimlik no yalnız [cekim|muhasebe], her açılış sunucuda audit), ayarlar (TC, ücret, e-Gider);
   Yönetim › Muhasebe (günlük / aylık rapor, Excel'de açılan CSV, defter, muhasebe kuyruğu, belge doğrulama);
   Yönetim › Entegrasyonlar (PayTR, Paraşüt, Bizim Hesap, ETBİS; sırlar maskeli, boş bırakılan gizli alan korunur; bağlantı testi).
   Üye ekranlarında e-Gider / pusula / VUK / ETTN ifadesi YOKTUR (yalnız "İşlem ücreti" ve "Vergi kesintisi").                          */
const P3 = { docs: {}, egpFull: false, tcCounts: null };
const p3enc = encodeURIComponent;
/* tam T.C. no kayıtlı mı (numaranın kendisi tarayıcıya gelmez; sunucu yalnız "full" bayrağı verir) */
const p3TcFull = u => !!(u && u.tc && u.tc.full);
const p3Q = s => String(s == null ? '' : s);

/* ================= açılış: kesinti oranı ve ücret ayarı ================= */
/* üye formu "Vergi kesintisi (%X)" satırı egpCfg().on/stopaj'dan çizilir; üyeye yalnız oran (boot.set.wdTax) gelir */
function p3Set() { if (!S || !S.set) return; const s = S.set; if (!P3.egpFull) s.egp = Object.assign({}, s.egp || {}, { on: +s.wdTax > 0, stopaj: +s.wdTax || 0 });
  if (!s.tc) s.tc = { req: true, url: '' }; if (!s.wdFee) s.wdFee = { on: false, type: 'sabit', val: 0, min: 0, max: 0 }; }
try { p3Set(); } catch (e) { }
{ const f = apiApplyBoot; apiApplyBoot = function (b) { f.apply(this, arguments); p3Set(); }; }
/* sunucunun açıklaması (iç muhasebe) varsa onu kullan; yoksa demo şablonu */
{ const f = egpDescFor; egpDescFor = function (w, tpl) { if (!tpl && w && w.desc) return w.desc; return f(w, tpl); }; }
/* kopyalanan son metin (testler için; panoya yazma tarayıcı izniyle) */
{ const c0 = ACT.copy; ACT.copy = function (d, e) { try { window.ypLastCopy = String(d && d.v != null ? d.v : ''); } catch (x) { } return c0(d, e); }; }

if (YP_PROD) document.head.insertAdjacentHTML('beforeend', `<style id="p3css">
.p3st{font-size:12.5px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.p3ent .panel-h h3{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.p3url{display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0}.p3url code{overflow-wrap:anywhere;min-width:0;font-size:12.5px}
.p3rep td,.p3rep th{white-space:nowrap}
.p3tbl td{overflow-wrap:anywhere}
.p3why{font-size:11.5px;margin-top:4px}
</style>`);

/* ================= Hesabım › Para çek ================= */
const p3MyWd = () => need('me:wd', () => call('GET', 'me/withdrawals?limit=50', null, { quiet: true }).then(j => j.data || {}), 20000);
const P3_WST = { bekliyor: ['p-bekliyor', 'Bekliyor'], 'onaylandı': ['p-onay', 'Gönderildi'], reddedildi: ['p-iade', 'Reddedildi'] };
const p3WPill = s => { const x = P3_WST[s] || ['p-bekliyor', s]; return `<span class="pill ${x[0]}">${esc(x[1])}</span>`; };
function p3WdForm(u) { const IB = u.ibans || [];
  return `<div class="panel panel-b"><form class="stack" data-form="withdraw" style="max-width:560px" novalidate>
      <div class="note note-info">En az ${TL(S.set.minWithdraw)} çekebilirsiniz. İşlem ücreti: <b>${wdFeeTxt()}</b>. Talepler mesai saatlerinde 2-6 saatte IBAN'ınıza gönderilir. IBAN ${esc(fullName(u) || 'sizin')} adına kayıtlı olmalıdır.</div>
      <div class="fld"><span class="lbl">Hangi hesaba?</span><div class="ibl">${IB.map((b, i) => `<label for="wi_${esc(b.id)}"><input type="radio" name="wiban" id="wi_${esc(b.id)}" value="${esc(b.id)}" ${i === 0 ? 'checked' : ''} data-change="wiban"><b>${esc(b.bank)}</b><span class="mono">${esc(maskIban(b.iban))}</span><span class="muted">${esc(b.name)}</span></label>`).join('')}<label for="wi_new"><input type="radio" name="wiban" id="wi_new" value="_new" ${IB.length ? '' : 'checked'} data-change="wiban"><b>+ Yeni IBAN</b><span class="muted">Banka hesabı ekle</span></label></div></div>
      <div class="stack" id="wNew" ${IB.length ? 'hidden' : ''}><div class="row2"><div class="fld"><label for="w_bank">Banka</label><select class="inp" id="w_bank">${TRBANKS.map(b => `<option>${esc(b)}</option>`).join('')}</select></div><div class="fld"><label for="w_name">Hesap sahibi adı soyadı</label><input class="inp" id="w_name" value="${esc(fullName(u))}" maxlength="80"></div></div>
        <div class="fld"><label for="w_iban">IBAN</label><input class="inp mono" id="w_iban" placeholder="TR00 0000 0000 0000 0000 0000 00" autocomplete="off"></div>${IB.length < 5 ? `<label class="chk" for="w_save"><input type="checkbox" id="w_save" checked> Bu IBAN'ı sonraki çekimler için kaydet</label>` : '<span class="muted" style="font-size:12px">En fazla 5 IBAN kaydedilebilir; bu IBAN yalnız bu talep için kullanılır.</span>'}</div>
      <div class="fld"><label for="w_amt">Tutar (TL) · çekilebilir ${TL(u.bal)}</label><input class="inp" id="w_amt" type="number" min="${+S.set.minWithdraw || 0}" max="${+u.bal || 0}" step="0.01" required inputmode="decimal" data-change="wdcalc"></div>
      <div class="sum wdsum" id="wdsum"><div><span class="muted">Çekilecek brüt tutar</span><b class="mono" id="wd_a">${TL(0)}</b></div><div><span class="muted">İşlem ücreti</span><b class="mono" id="wd_f">${S.set.wdFee && S.set.wdFee.on ? TL(0) : 'Ücretsiz'}</b></div>${wdTaxPct() ? `<div><span class="muted">Vergi kesintisi (%${wdTaxPct()})</span><b class="mono" id="wd_st">${TL(0)}</b></div>` : ''}<div class="tot"><span>IBAN'ınıza gönderilecek net tutar</span><b class="mono" id="wd_n">${TL(0)}</b></div></div>
      <button class="btn btn-primary">Çekim talebi oluştur</button></form></div>`; }
function p3Cek(u) {
  const d = p3MyWd(); const tc = u.tc || null;
  const kp = `<div class="kpis"><div class="kpi hl"><small>Çekilebilir bakiye</small><b>${TL(u.bal)}</b><span class="muted" style="font-size:12px">Satışlar ve Havale/EFT yüklemeleri</span></div><div class="kpi"><small>Sadece alışveriş</small><b>${TL(u.bonus || 0)}</b><span class="muted" style="font-size:12px">Kart, kripto, cüzdan yüklemeleri ve bonuslar</span></div></div>`;
  let form;
  if (u.banned) form = '<div class="note note-bad">Hesabınız askıda olduğu için para çekemezsiniz.</div>';
  else if (tc && tc.state === 'inceleme') form = `<div class="panel panel-b tcgate"><div class="tcgate-i">${ICO.shield}</div><div class="stack" style="gap:6px"><b style="font-size:16px">Kimliğiniz inceleniyor</b><span class="muted" style="font-size:13px">Nüfus (NVİ) servisine o sırada ulaşılamadığı için bilgileriniz ekibimizce elle kontrol ediliyor. Onaylanınca bildirim alacaksınız ve para çekebileceksiniz.</span></div></div>`;
  else if (tcNeed(u)) form = tcGate(u);
  else if (tcOk(u) && !p3TcFull(u)) form = tcConfirm(u);
  else form = p3WdForm(u);
  const L = d && !d.err ? (d.wd || []) : [];
  const net = w => w.net != null ? w.net : w.amount, cut = L.some(w => r2(net(w)) !== r2(w.amount));
  const tbl = !d ? pLoading() : d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : L.length ? `<div class="panel"><div class="panel-h"><h3>Çekim taleplerim</h3></div>
    <div class="tbl-w"><table class="tbl mcards" id="userWdTbl"><thead><tr><th>Tarih</th><th>Banka / IBAN</th><th class="num">Tutar</th>${cut ? '<th class="num">Net gönderilen</th>' : ''}<th>Durum</th></tr></thead><tbody>${L.map(w => `<tr><td style="white-space:nowrap">${dtstr(w.t)}</td><td>${esc(w.bank || '')}<div class="mono" style="font-size:12px">${esc(maskIban(w.iban))}</div></td><td class="num"><b class="mono">${TL(w.amount)}</b></td>${cut ? `<td class="num"><b class="mono">${TL(net(w))}</b>${r2(net(w)) !== r2(w.amount) ? `<div class="muted" style="font-size:11px">${[w.fee ? 'İşlem ücreti ' + TL(w.fee) : '', w.stopaj ? 'Vergi kesintisi ' + TL(w.stopaj) : ''].filter(Boolean).join(' · ')}</div>` : ''}</td>` : ''}<td>${p3WPill(w.status)}${w.why ? `<div class="muted p3why">${esc(w.why)}</div>` : ''}${w.status === 'onaylandı' && w.pt ? `<div class="muted p3why">${dtstr(w.pt)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : '';
  return kp + form + `<div class="panel panel-b note-row"><span class="muted">Kayıtlı IBAN'larınızı <a href="#hesabim" data-act="tab" data-t="banka">Banka hesaplarım</a> sekmesinden yönetin. Kart, kripto ve cüzdanla yüklenen bakiye ile bonuslar çekilemez.</span></div>` + tbl;
}
{ const t0 = p2AccTabs; p2AccTabs = (u, base) => { const T = t0(u, base); if (!T.some(([k]) => k === 'cek')) { const i = T.findIndex(([k]) => k === 'hareket'); T.splice(i < 0 ? T.length : i + 1, 0, ['cek', 'Para çek']); } return T; }; }
{ const b0 = p2AccBody; p2AccBody = (u, tab) => tab === 'cek' ? p3Cek(u) : b0(u, tab); }
/* "Para çekme çok yakında" yer tutucuları kalkar */
{ const v0 = vAccount; vAccount = function () { return v0.apply(this, arguments)
    .replace(' Para çekme çok yakında açılıyor.', ' Para çekerken bu hesaplardan birini seçersiniz.')
    .replace(/ Para çekme çok yakında açılıyor\./g, ''); }; }

/* ================= Yönetim › Para çekme ================= */
function p3WdUp(L) { (L || []).forEach(w => { if (!w || !w.id) return; const i = S.wd.findIndex(x => x.id === w.id); if (i < 0) S.wd.push(w); else { const o = S.wd[i]; const keep = o.egp && w.egp && o.egp.tckn && o.egp.no === w.egp.no ? o.egp : null; S.wd[i] = Object.assign(o, w); if (keep) S.wd[i].egp = keep; } }); }
const p3WdLoad = () => { const a = p1AdmLoad('adm:wd:p', 'admin/withdrawals?f=bekliyor&limit=200', x => { p1UpU(x.users); p3WdUp(x.wd); p2QSet('wd', (x.counts || {}).bekliyor || 0); return { n: (x.wd || []).length, c: x.counts }; }, 15000);
  const b = p1AdmLoad('adm:wd:all', 'admin/withdrawals?f=tumu&limit=200', x => { p1UpU(x.users); p3WdUp(x.wd); return { n: (x.wd || []).length, c: x.counts }; }, 15000);
  return a && b ? (a.err ? a : b.err ? b : { ok: 1 }) : null; };
const p3WdSet = () => p1AdmLoad('adm:wdset', 'admin/settings/withdraw', x => { S.set.tc = x.tc; S.set.wdFee = x.wdFee; S.set.egp = Object.assign({}, x.egp); P3.egpFull = true;
  S.set.minWithdraw = x.minWithdraw; S.set.wdDailyMax = x.wdDailyMax; P3.tcCounts = x.tcCounts; return x; }, 30000);
/* demo ekranının sunucuya göre düzeltmeleri: TC doğrulama adresi / kit yok (NVİ sunucuda), sayılar sunucudan */
function p3CekimFix(html) {
  html = html.replace(/<div class="row2"><div class="fld"><label for="tcs_url">[\s\S]*?data-act="tc-kit"[\s\S]*?<\/div><\/div>/, '<div class="note note-info" style="font-size:12.5px">NVİ (Nüfus ve Vatandaşlık İşleri, KPSPublic) doğrulaması sunucuda yapılır; ayrı dosya kurmanız gerekmez. NVİ o an yanıt vermezse üye "inceleme" durumuna düşer ve <a href="#yonetim/uye/uyeler">Üyeler</a> bölümünden elle onaylanır.</div>');
  const c = P3.tcCounts; if (c) html = html.replace(/<span class="chip">\d+ doğrulanmış · \d+ doğrulanmamış üye<\/span>/, `<span class="chip">${NUM(c.ok)} doğrulanmış · ${NUM(c.no)} doğrulanmamış üye${c.review ? ' · ' + NUM(c.review) + ' incelemede' : ''}</span>`);
  return html; }
{ const v0 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (!isPanel()) return v0(P);
    const it = admItem(P.k); if (!it || !admVis(it)) return v0(P);
    if (it.k === 'cekim') { const st = p3WdSet(), d = p3WdLoad();
      if (!st || !d) return pAdmPage(P, it, () => ({ body: pLoading() }));
      if (st.err || d.err) return pAdmPage(P, it, () => ({ body: `<div class="note note-bad">${esc(st.err || d.err)}</div>` }));
      return p3CekimFix(v0(P)); }
    if (it.k === 'muhasebe') return pAdmPage(P, it, sub => p3Muh(sub, P));
    if (it.k === 'entegrasyon') return pAdmPage(P, it, () => p3Ent());
    return v0(P); }; }
/* nav rozeti: bekleyen çekim sayısı (GET admin/today → queues.wd) */
{ const q = admQ('cekim'); if (q) q.L = () => { const c = API.cache['adm:today']; const n = c && c.v && c.v.queues ? +c.v.queues.wd || 0 : 0; return Array.from({ length: n }, () => ({ t: now(), status: 'bekliyor', amount: 0, net: 0 })); }; }

/* ---- pusula görünümü (tam TC: sunucu yalnız [cekim|muhasebe] verir ve audit'e yazar) ---- */
async function p3Doc(id) { const j = await call('GET', 'admin/withdrawals/' + p3enc(id) + '/egp', null, { quiet: true }); const d = j.data.doc; p3WdUp([j.data.withdrawal]);
  const w = S.wd.find(x => x.id === id); if (w && !d.draft) w.egp = d; P3.docs[id] = d; return { w, d }; }
async function p3EgpView(id) {
  if (!egpStaff()) return toast('Bu işlem için yetkiniz yok.', true);
  modal(mWrap('e-Gider Pusulası', pLoading('Belge yükleniyor…')));
  let r; try { r = await p3Doc(id); } catch (e) { if ($('.mb')) modal(mWrap('e-Gider Pusulası', `<div class="note note-bad">${esc(apiErr(e))}</div>`)); return; }
  const { w, d: g } = r; const pv = !!g.draft; const bankNote = g.bankNote || wdBankNote(w, g);
  modal(`<div class="md" style="width:min(880px,100%)" role="dialog" aria-label="e-Gider Pusulası">
    <div class="md-h"><h3>e-Gider Pusulası · ${pv ? 'Taslak önizleme' : esc(g.no)}</h3><button class="md-x" data-act="close" aria-label="Kapat">×</button></div>
    <div class="md-b stack">
      ${pv ? '<div class="note note-info">Bu çekim için henüz e-Gider Pusulası kesilmedi. Aşağıdaki görünüm taslaktır; belge numarası ve ETTN pusula kesildiğinde verilir.</div>' : ''}
      ${egpDocHtml(w, g)}
      <div class="hstack" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div class="hstack" style="flex-wrap:wrap;gap:6px">
          ${pv ? '' : `<button type="button" class="btn btn-primary" data-act="egp-dl" data-id="${esc(w.id)}">📥 e-Gider Pusulası İndir (.html / Yazdır)</button>`}
          <button type="button" class="btn btn-ok" data-act="copy" data-v="${esc(g.desc)}">📋 Mal / Hizmet Açıklamasını Kopyala</button>
          ${pv ? '' : `<button type="button" class="btn" data-act="copy" data-v="${esc(bankNote)}">📋 Banka EFT Açıklamasını Kopyala</button>`}
        </div>
        <button type="button" class="btn btn-ghost" data-act="close">Kapat</button>
      </div>
    </div></div>`); }
mEgpView = p3EgpView;
async function p3EgpModal(id) {
  if (!egpStaff()) return toast('Bu işlem için yetkiniz yok.', true);
  modal(mWrap('e-Gider Pusulası', pLoading()));
  let r; try { r = await p3Doc(id); } catch (e) { if ($('.mb')) modal(mWrap('e-Gider Pusulası', `<div class="note note-bad">${esc(apiErr(e))}</div>`)); return; }
  const { w, d } = r; const U = user(w.u) || {}; const paid = w.status !== 'bekliyor', noTc = !d.tckn, msk = (U.tc && U.tc.mask) || '';
  const brut = +w.brut || r2(w.amount - (w.fee || 0)); const stPct = +w.stopajPct || 0; const net = +w.net;
  const mism = w.nameOk === false;
  const tcBox = noTc ? `<form class="stack egptc" data-form="egptc" data-id="${esc(w.id)}" data-u="${esc(w.u)}" novalidate>
    <div class="note note-bad" role="alert"><b>${EGP_NOTC}.</b> Gider pusulasında tam numara zorunlu olduğundan pusula kesilemez. Üyenin tam numarasını girin ya da üyeden yeniden doğrulama isteyin.${tcOk(U) ? ` <span class="muted">Kayıtlı maske: <span class="mono">${esc(msk)}</span></span>` : ' <span class="muted">Üyenin kimlik doğrulaması yok.</span>'}${U.tcAsk ? `<br><span class="muted" style="font-size:12px">Üyeden doğrulama istendi: ${dtstr(U.tcAsk)}</span>` : ''}</div>
    <div class="hstack egptc-r" style="align-items:flex-end;flex-wrap:wrap;gap:8px"><div class="fld" style="flex:1 1 200px;min-width:0"><label for="egi_tcfull">Üyenin tam T.C. kimlik no (11 hane)</label><input class="inp mono" id="egi_tcfull" inputmode="numeric" maxlength="11" autocomplete="off" placeholder="${esc(msk || '11 haneli')}" aria-describedby="egi_tcerr"></div><button class="btn btn-primary">Doğrula ve kaydet</button><button type="button" class="btn" data-act="tc-ask" data-id="${esc(w.u)}" data-w="${esc(w.id)}">Üyeden yeniden doğrulama iste</button></div>
    <div class="neg" id="egi_tcerr" style="font-size:12.5px" aria-live="polite"></div></form>` : '';
  modal(mWrap(`e-Gider Pusulası Kes & Ödemeyi Onayla · #${esc(w.id)}`, `${tcBox}<form class="stack" data-form="egpissue" data-id="${esc(w.id)}"${noTc ? ' style="margin-top:14px"' : ''}>
    <div class="note note-info">Şirket hesabınızdan <b>${esc(fmtIban(w.iban))}</b> IBAN'ına yapılan EFT/Havale çıkışı için üyenin sistemde kayıtlı bilgileriyle (<b>${esc(d.sellerName)}</b>) resmi <b>e-Gider Pusulası</b> oluşturulur.${mism ? `<br><span class="pill p-itiraz">İsim uyuşmuyor</span> IBAN hesap sahibi: <b>${esc(w.name)}</b>` : ''}</div>
    <div class="row3">
      <div class="fld"><label for="egi_name">Ad Soyad (sistem kaydı)</label><input class="inp" id="egi_name" value="${esc(d.sellerName)}" readonly></div>
      <div class="fld"><label for="egi_tckn">T.C. Kimlik No (sistem kaydı)</label><input class="inp mono" id="egi_tckn" value="${esc(d.tckn)}" placeholder="Kayıtlı değil" readonly${noTc ? ' aria-invalid="true" style="border-color:var(--bad,#dc2626)"' : ''}></div>
      <div class="fld"><label for="egi_tel">Telefon (sistem kaydı)</label><input class="inp mono" id="egi_tel" value="${esc(d.tel)}" readonly></div>
    </div>
    <div class="row3">
      <div class="fld"><label>Brüt Tutar</label><input class="inp mono" value="${TL(brut)}" disabled></div>
      <div class="fld"><label for="egi_st">GV Stopaj Oranı (%)</label><input class="inp mono" id="egi_st" type="number" min="0" max="40" step="0.5" value="${stPct}" ${paid ? 'readonly' : 'data-change="egicalc"'} data-brut="${brut}"></div>
      <div class="fld"><label>IBAN'a Gönderilecek Net</label><input class="inp mono" id="egi_net" value="${TL(net)}" disabled></div>
    </div>
    ${paid ? '<div class="note note-warn" style="font-size:12px">Ödeme yapıldığı için net tutar ve stopaj değiştirilemez; yalnızca Mal / Hizmet açıklaması güncellenebilir. Belge numarası ve ETTN korunur.</div>' : ''}
    <div class="fld">
      <div class="hstack" style="justify-content:space-between"><label for="egi_desc">Mal / Hizmet Açıklaması</label><button type="button" class="btn btn-sm" data-act="copy" data-v="${esc(d.desc)}">📋 Açıklamayı Kopyala</button></div>
      <textarea class="inp" id="egi_desc" rows="2" required maxlength="500">${esc(d.desc)}</textarea>
    </div>
    <div class="hstack"><button class="btn btn-ok"${noTc ? ' disabled title="' + EGP_NOTC + '"' : ''}>${w.status === 'bekliyor' ? 'Ödemeyi Onayla & e-Gider Pusulası Kes' : w.egp ? 'e-Gider Pusulasını Güncelle' : 'e-Gider Pusulası Kes'}</button><button type="button" class="btn btn-ghost" data-act="close">İptal</button></div>
  </form>`)); }
mEgpModal = p3EgpModal;
/* onay penceresi metni sunucudaki "tam TC kayıtlı mı" bayrağına göre */
CFM['wd-ok'] = d => { const w = cfmW(d.id); const ib = String(w.iban || '').replace(/\s/g, ''); const E = egpCfg(); const auto = E.on !== false && E.autoOnApprove !== false;
  return ['Para gönderildi mi?', `<b>${esc(w.name || '')}</b> hesabına (IBAN …${esc(ib.slice(-4))}) <b>${TL(w.net != null ? w.net : (w.amount || 0))}</b> gönderdiniz mi? ${auto && !w.egp && !w.tcFull ? `Onaylayınca talep kapanır; <b class="neg">${EGP_NOTC}</b>, bu yüzden e-Gider Pusulası kesilmez.` : auto ? 'Onaylayınca talep kapanır ve e-Gider Pusulası kesilir.' : 'Onaylayınca talep kapanır.'}`, 'Evet, gönderildi', 0]; };
CFM['wd-no'] = () => null; // gerekçe penceresi (98p3-actions.js)

/* ================= Yönetim › Muhasebe & raporlar ================= */
const p3Day = (ms) => { const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); };
function p3MuhRange() { const r = ui.p3r || (ui.p3r = { from: p3Day(Date.now() - 29 * 86400000), to: p3Day(Date.now()) }); return r; }
function p3Muh(sub, P) {
  if (sub === 'egider') return p3MuhEgp();
  const R = p3MuhRange(), y = new Date().getFullYear();
  const d = p1AdmLoad('adm:rep:' + R.from + ':' + R.to, 'admin/reports/daily?from=' + R.from + '&to=' + R.to, null, 30000);
  const m = p1AdmLoad('adm:repm:' + y, 'admin/reports/monthly?year=' + y, null, 60000);
  const jb = p1AdmLoad('adm:acct', 'admin/accounting/jobs', null, 15000);
  const lg = p1AdmLoad('adm:ledger:p3', 'admin/ledger?limit=30', x => { p1UpU(x.users); return x; }, 20000);
  const cols = d && d.cols ? d.cols : (m && m.cols) || {};
  const ck = Object.keys(cols);
  const tbl = (rows, key) => rows.length ? `<div class="tbl-w"><table class="tbl p3rep"><thead><tr><th>${key === 'day' ? 'Gün' : 'Ay'}</th>${ck.map(k => `<th class="num">${esc(cols[k])}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td class="mono">${esc(r[key])}</td>${ck.map(k => `<td class="num mono">${r.v[k] ? TL(r.v[k]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">Bu aralıkta kayıt yok.</div>';
  const xb = (t, l, q) => `<button type="button" class="btn btn-sm" data-act="p3-csv" data-t="${t}" data-q="${esc(q || '')}">📊 ${esc(l)}</button>`;
  const rq = 'from=' + R.from + '&to=' + R.to;
  const J = jb && !jb.err ? jb : null;
  const jobs = J ? (J.jobs || []) : [];
  const JST = { bekliyor: ['p-bekliyor', 'Bekliyor'], tamam: ['p-tamam', 'Gönderildi'], hata: ['p-iade', 'Hata'] };
  const body = `<form class="panel panel-b hstack" data-form="p3range" style="align-items:flex-end;flex-wrap:wrap;gap:10px"><div class="fld"><label for="p3_from">Başlangıç</label><input class="inp mono" type="date" id="p3_from" value="${esc(R.from)}" required></div><div class="fld"><label for="p3_to">Bitiş</label><input class="inp mono" type="date" id="p3_to" value="${esc(R.to)}" required></div><button class="btn btn-primary btn-sm">Göster</button></form>
    <div class="panel"><div class="panel-h" style="flex-wrap:wrap;gap:8px"><h3>Günlük rapor</h3><div class="hstack" style="flex-wrap:wrap;gap:6px">${xb('daily', 'Günlük rapor (Excel)', rq)}${xb('journal', 'Defter (Excel)', rq)}${xb('withdrawals', 'Çekimler (Excel)', rq)}</div></div>
      ${!d ? pLoading() : d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : `${aSum([['Çekim (onaylanan)', NUM(d.withdrawals.n)], ['IBAN\'a gönderilen', TL(d.withdrawals.net), 1], ['Çekim işlem ücreti', TL(d.withdrawals.fee)], ['GV stopajı', TL(d.withdrawals.stopaj)], ['e-Gider Pusulası', NUM(d.egp)]])}${tbl(d.rows || [], 'day')}`}</div>
    <div class="panel"><div class="panel-h"><h3>Aylık özet · ${y}</h3>${xb('monthly', 'Aylık rapor (Excel)', 'year=' + y)}</div>${!m ? pLoading() : m.err ? `<div class="note note-bad">${esc(m.err)}</div>` : tbl(m.rows || [], 'month')}</div>
    <div class="panel"><div class="panel-h" style="flex-wrap:wrap;gap:8px"><h3>Muhasebe kuyruğu (Paraşüt / Bizim Hesap)</h3><div class="hstack" style="gap:6px">${J ? `<span class="chip">${NUM(J.counts.bekliyor)} bekliyor · ${NUM(J.counts.tamam)} gönderildi · ${NUM(J.counts.hata)} hata</span>` : ''}<button type="button" class="btn btn-sm" data-act="p3-acct-run">Kuyruğu şimdi çalıştır</button></div></div>
      ${!jb ? pLoading() : jb.err ? `<div class="note note-bad">${esc(jb.err)}</div>` : jobs.length ? `<div class="tbl-w"><table class="tbl mcards p3tbl"><thead><tr><th>Tarih</th><th>Servis</th><th>Kayıt</th><th>Durum</th><th>Son hata</th><th></th></tr></thead><tbody>${jobs.map(x => { const s = JST[x.status] || ['p-bekliyor', x.status]; return `<tr><td style="white-space:nowrap">${dtstr(x.t)}</td><td>${esc(x.n)}</td><td class="mono">${esc(x.ref)}</td><td><span class="pill ${s[0]}">${s[1]}</span><div class="muted" style="font-size:11.5px">${x.tries} deneme${x.status === 'bekliyor' && x.tries ? ' · sonraki ' + dtstr(x.next) : ''}</div></td><td style="font-size:12.5px">${esc(x.error || '—')}</td><td>${x.status !== 'tamam' ? `<button type="button" class="btn btn-sm" data-act="p3-acct-retry" data-id="${esc(x.id)}">Yeniden dene</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">Kuyrukta kayıt yok. Paraşüt / Bizim Hesap bağlıysa çekim onaylarında e-Gider kaydı otomatik gönderilir.</div>'}</div>
    <div class="panel"><div class="panel-h"><h3>Son defter kayıtları</h3><a class="btn btn-sm" href="#yonetim/uye/bakiye">Bakiye düzeltmeleri</a></div>${!lg ? pLoading() : lg.err ? `<div class="note note-bad">${esc(lg.err)}</div>` : (lg.ledger || []).length ? `<div class="tbl-w"><table class="tbl mcards p3tbl"><thead><tr><th>Tarih</th><th>Tür</th><th>Üye</th><th>Açıklama</th><th class="num">Tutar</th></tr></thead><tbody>${lg.ledger.map(x => `<tr><td style="white-space:nowrap">${dtstr(x.t)}</td><td><span class="chip">${esc(x.k)}</span></td><td>${x.u && user(x.u) ? esc(user(x.u).name) : '—'}</td><td style="font-size:12.5px">${esc(x.m || '')}${x.ref ? ` <span class="mono muted">${esc(x.ref)}</span>` : ''}</td><td class="num mono">${TL(x.a)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Kayıt yok.</div>'}</div>`;
  return { body, desc: 'Günlük ve aylık toplamlar, Excel\'de açılan raporlar (Türkçe karakterler korunur), muhasebe kuyruğu ve defter.' };
}
function p3MuhEgp() {
  const d = (can('cekim') || can('muhasebe')) ? p1AdmLoad('adm:wd:ok', 'admin/withdrawals?f=onaylandı&limit=50', x => { p1UpU(x.users); p3WdUp(x.wd); return { ids: (x.wd || []).map(w => w.id) }; }, 20000) : null;
  const L = d && !d.err ? d.ids.map(id => S.wd.find(w => w.id === id)).filter(w => w && w.egp) : [];
  return { desc: 'e-Gider Pusulası doğrulama: belge numarası, ETTN ya da çekim numarasıyla bulun. Tam T.C. kimlik no yalnız belgede görünür ve her açılış kayda geçer.', body: `<form class="hstack" data-form="egplookup" style="gap:10px;background:var(--surface-2);padding:10px 14px;border-radius:8px;border:1px solid var(--line);flex-wrap:wrap"><div class="fld" style="flex:1 1 220px;min-width:0"><label for="m_egp_find">Belge no (YGP…), ETTN ya da çekim no</label><input class="inp mono" id="m_egp_find" autocomplete="off" required></div><button class="btn btn-primary">Belgeyi aç</button></form>
    <div class="panel"><div class="panel-h"><h3>Son kesilen e-Gider Pusulaları</h3></div>${!d ? pLoading() : d.err ? `<div class="note note-bad">${esc(d.err)}</div>` : L.length ? `<div class="tbl-w"><table class="tbl mcards p3tbl"><thead><tr><th>Belge no</th><th>Üye</th><th>Tarih</th><th class="num">Net</th><th></th></tr></thead><tbody>${L.map(w => `<tr><td class="mono">${esc(w.egp.no)}</td><td>${esc((user(w.u) || {}).name || '')}</td><td style="white-space:nowrap">${dtstr(w.egp.t || w.pt)}</td><td class="num mono">${TL(w.net)}</td><td><button type="button" class="btn btn-sm" data-act="egp-view" data-id="${esc(w.id)}">Pusulayı aç</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Henüz kesilmiş belge yok.</div>'}</div>` }; }

/* ================= Yönetim › Entegrasyonlar ================= */
const P3_ENTD = { paytr: 'Üyeler kartla ve PayTR Havale/EFT ile bakiye yükler. Bilgiler girilmeden kart seçenekleri üyelere "yakında" görünür.',
  parasut: 'Çekim onayında kesilen e-Gider Pusulası için Paraşüt\'e alış kaydı otomatik gönderilir (kuyruk, hata olursa yeniden denenir).',
  bizimhesap: 'Paraşüt yerine Bizim Hesap kullanıyorsanız bunu doldurun.' };
function p3EntLabel(svc, f) { const s = (typeof ENT_SVC !== 'undefined' && ENT_SVC[svc]) || null; const x = s && s.f.find(y => y.k === f.k); return x ? x.l : f.label; }
function p3EntField(svc, f, val, dis) { const id = 'ent_' + svc + '_' + f.k, lb = esc(p3EntLabel(svc, f)), d = dis ? ' disabled' : '';
  if (f.type === 'bool') return `<label class="chk" for="${id}"><input type="checkbox" id="${id}" data-k="${esc(f.k)}" ${val ? 'checked' : ''}${d}> ${lb}</label>`;
  if (f.type === 'int') return `<div class="fld"><label for="${id}">${lb}</label><select class="inp" id="${id}" data-k="${esc(f.k)}"${d}>${Array.from({ length: (+f.max || 12) - (+f.min || 0) + 1 }, (_, i) => i + (+f.min || 0)).map(n => `<option value="${n}" ${+val === n ? 'selected' : ''}>${n === 0 ? 'Taksit yok' : n + ' taksit'}</option>`).join('')}</select></div>`;
  if (f.secret) return `<div class="fld"><label for="${id}">${lb}${f.required ? ' *' : ''}</label><input class="inp mono" id="${id}" data-k="${esc(f.k)}" data-sec="1" type="password" autocomplete="new-password" value="" placeholder="${val ? 'Kayıtlı · değiştirmek için yeni değeri yazın' : 'Girilmedi'}"${d}>${val ? `<span class="muted" style="font-size:12px">Kayıtlı: <span class="mono">${esc(val)}</span> · boş bırakırsanız eski değer korunur</span>` : f.hint ? `<span class="muted" style="font-size:12px">${esc(f.hint)}</span>` : ''}</div>`;
  return `<div class="fld"><label for="${id}">${lb}${f.required ? ' *' : ''}</label><input class="inp${f.type === 'url' || f.type === 'email' ? '' : ' mono'}" id="${id}" data-k="${esc(f.k)}" type="${f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : 'text'}" value="${esc(val == null ? '' : val)}" autocomplete="off"${d}>${f.hint && f.type === 'str' ? `<span class="muted" style="font-size:12px">${esc(f.hint)}</span>` : ''}</div>`; }
function p3EntStatus(s) { const t = s.lastTest;
  return `<div class="p3st" id="ent_st_${esc(s.id)}">${s.configured ? '<span class="pill p-tamam">Bilgiler girildi</span>' : '<span class="pill p-bekliyor">Ayarlanmadı</span>'}${t ? `<span class="pill ${t.ok ? 'p-tamam' : 'p-iade'}">${t.ok ? 'Bağlantı başarılı' : 'Bağlantı başarısız'}</span><span class="muted">${dtstr(t.t)} · ${esc(t.msg || '')}</span>` : s.configured ? '<span class="muted">Henüz test edilmedi.</span>' : ''}</div>`; }
function p3EntCard(s) { const W = (typeof ENT_SVC !== 'undefined' && ENT_SVC[s.id]) || {}; const dis = !s.canEdit;
  const F = s.fields.filter(f => f.type !== 'bool'), B = s.fields.filter(f => f.type === 'bool');
  return `<form class="panel" data-form="p3ent" data-svc="${esc(s.id)}" novalidate><div class="panel-h"><h3>${esc(s.n)}</h3>${p3EntStatus(s)}</div><div class="panel-b stack">
    <span class="muted" style="font-size:13px">${esc(P3_ENTD[s.id] || '')}</span>${W.w ? `<div class="note note-info" style="font-size:12.5px">${W.w}</div>` : ''}
    ${dis ? `<div class="note note-warn" style="font-size:12.5px">Bu bölümü düzenlemek için "${esc(s.perm === 'odeme' ? 'Ödemeler' : 'Muhasebe')}" yetkisi gerekir.</div>` : ''}
    <div class="row2">${F.map(f => p3EntField(s.id, f, s.values[f.k], dis)).join('')}</div>${B.map(f => p3EntField(s.id, f, s.values[f.k], dis)).join('')}
    </div><div class="panel-f hstack" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><span class="muted" style="font-size:12px">Anahtar ve şifreler sunucuda şifreli saklanır; burada yalnız maskeli görünür.</span><div class="hstack" style="gap:6px"><button type="button" class="btn btn-sm" data-act="p3ent-test" data-svc="${esc(s.id)}" ${dis || !s.configured ? 'disabled' : ''}>Bağlantıyı test et</button><button class="btn btn-primary btn-sm" ${dis ? 'disabled' : ''}>Kaydet</button></div></div></form>`; }
function p3Ent() {
  const d = p1AdmLoad('adm:ent', 'admin/integrations', null, 30000);
  if (!d) return { body: pLoading() }; if (d.err) return { body: `<div class="note note-bad">${esc(d.err)}</div>` };
  const E = d.etbis || {}, url = (d.urls || {}).paytrNotify || '';
  const body = `<div class="p3ent stack">
    <div class="panel panel-b stack"><div class="eyebrow">PayTR bildirim adresi (Bildirim URL)</div><div class="p3url"><code class="mono" id="p3_paytr_url">${esc(url)}</code><button type="button" class="btn btn-sm btn-primary" data-act="copy" data-v="${esc(url)}">📋 Kopyala</button></div><span class="muted" style="font-size:12.5px">PayTR Mağaza Paneli › Destek & Kurulum › Ayarlar › <b>Bildirim URL</b> alanına bu adresi yapıştırın. Adres değişmez.</span></div>
    ${(d.services || []).map(p3EntCard).join('')}
    <form class="panel" data-form="p3etbis"><div class="panel-h"><h3>ETBİS</h3>${E.on ? '<span class="pill p-tamam">Rozet açık</span>' : '<span class="pill p-bekliyor">Kapalı</span>'}</div><div class="panel-b stack">
      <span class="muted" style="font-size:13px">Elektronik Ticaret Bilgi Sistemi kaydınız. Açıksa site altbilgisinde ETBİS rozeti gösterilir.</span>
      <label class="chk" for="etb_on"><input type="checkbox" id="etb_on" ${E.on ? 'checked' : ''}> ETBİS rozetini göster</label>
      <div class="row2"><div class="fld"><label for="etb_url">ETBİS doğrulama adresi</label><input class="inp" id="etb_url" type="url" value="${esc(E.url || '')}" placeholder="https://etbis.eticaret.gov.tr/sitedogrulama/…"></div><div class="fld"><label for="etb_code">Kayıt numarası</label><input class="inp mono" id="etb_code" value="${esc(E.code || '')}"></div></div>
      <div class="row2"><div class="fld"><label for="etb_date">Kayıt tarihi</label><input class="inp mono" id="etb_date" type="date" value="${esc(E.date || '')}"></div><div class="fld"><label for="etb_img">Rozet görsel adresi (isteğe bağlı)</label><input class="inp" id="etb_img" type="url" value="${esc(E.img || '')}"></div></div>
    </div><div class="panel-f"><button class="btn btn-primary btn-sm">ETBİS bilgilerini kaydet</button></div></form>
    <div class="panel panel-b note-row"><span class="muted">E-posta (Brevo / Mailjet / SMTP) ve WhatsApp (Meta WhatsApp Business Cloud API): ${d.mail.on ? 'e-posta açık' : 'e-posta kapalı'} · ${d.sms.on ? 'WhatsApp açık' : d.sms.configured ? 'WhatsApp kapalı' : 'WhatsApp kurulmadı'}. Doğrulama kodları WhatsApp'tan gider.</span>${can('sms') ? '<span class="hstack" style="gap:6px;flex-wrap:wrap"><a class="btn btn-sm" href="#yonetim/sms/eposta">E-posta ayarları</a><a class="btn btn-sm btn-primary" href="#yonetim/sms/whatsapp">WhatsApp ayarları</a></span>' : ''}</div>
  </div>`;
  return { body, desc: 'PayTR, Paraşüt, Bizim Hesap ve ETBİS bağlantılarını buradan kurun ve test edin. Hiçbir dosya düzenlemeniz gerekmez.' };
}
