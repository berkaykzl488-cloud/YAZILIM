/* ================== Hesabım: prod verisi (yalnız --prod derlemesinde) ==================
   Ekranlar ortak (45-hesabim.js: Özetim, gruplu hesap menüsü, mobil kabuk). Burada yalnız prod'a özgü veri: sekmeler p2AccTabs
   zincirinden (P2–P5 eklemeleri), Yapılacaklar sayısı açılışta boot.summary.todo (rozet), tam özet Özetim açılınca GET me/summary
   (need('me:sum'), 60 sn). Yoklamaya alan yok: yeni bildirim, borsa imzası değişimi, üyenin kendi işlemleri ve sekmenin yeniden
   görünmesi özeti düşürür. Borsa sipariş ayrıntıları (Yapılacaklar kartı) me/exchange'ten.                                          */
const HS = { todo: null, exSig: null, rt: 0 };
/** temel sekmeler (97-p0b-views.js P_TABS ile aynı; o sabit blok kapsamında) + p2AccTabs zinciri (P2–P5 eklemeleri) */
const HS_BASE = [['ozet', 'Özet'], ['ilan', 'İlanlarım'], ['profil', 'Profil ve güvenlik'], ['banka', 'Banka hesaplarım']];
const hsSum = () => need('me:sum', () => call('GET', 'me/summary', null, { quiet: true }).then(j => { HS.todo = j.data.todo || HS.todo; return j.data; }), 60000);
Object.assign(HSD, {
  tabs: u => p2AccTabs(u, HS_BASE),
  todo: () => { const c = API.cache['me:sum'], v = c && c.v; return v && v.todo && !v.err ? v.todo : HS.todo || {}; },
  sum: () => hsSum(),
  loadEx: () => p4MeEx(),
  exLoaded: () => !!API.cache['me:ex']
});
/** rozet tazeleme: me/summary arka planda (yalnız tetikleyici olaylarda; yoklamaya eklenmez) */
function hsRefresh() { needDrop('me:sum'); clearTimeout(HS.rt); if (!S.cur) return;
  HS.rt = setTimeout(() => { if (!S.cur) return; if (route() === 'hesabim') return render(); call('GET', 'me/summary', null, { quiet: true }).then(j => { HS.todo = j.data.todo || HS.todo; API.cache['me:sum'] = { v: j.data, t: Date.now() }; mtabSync(); }, () => { }); }, 700); }
{ const f = apiApplyBoot; apiApplyBoot = function (b) { HS.todo = b && b.summary && b.summary.todo ? b.summary.todo : null; needDrop('me:sum'); return f.apply(this, arguments); }; }
{ const c0 = call; call = async function (m, p) { const j = await c0.apply(this, arguments);
    try { if (m === 'GET' && /^poll\?/.test(String(p))) { const d = j.data || {}; const sig = d.exSig != null ? d.exSig : null;
        if ((d.notifs || []).length || (sig !== null && HS.exSig !== null && sig !== HS.exSig)) hsRefresh(); if (sig !== null) HS.exSig = sig; }
      else if (m !== 'GET' && S.cur && !/^(auth\/|me\/summary)/.test(String(p))) hsRefresh(); } catch (e) { }
    return j; }; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && S && S.cur) needDrop('me:sum'); });
/* alt çubuk rozetleri: Hesabım = yapılacak iş toplamı; Borsa noktası = operatör bekliyor (yüklü siparişlerden ya da özetten) */
MTAB.todo = () => { const u = me(); if (!u || u.admin) return 0; return +(hsTodo().total || 0); };
{ const e0 = MTAB.exCall; MTAB.exCall = () => { const u = me(); if (!u) return false; if (API.cache['me:ex'] || API.cache['ex:pub']) return e0(); return +(hsTodo().exCall || 0) > 0; }; }

/* ---------- sekme zinciri ve gövdeler ---------- */
{ const t0 = p2AccTabs; p2AccTabs = (u, base) => t0(u, base).map(x => x[0] === 'ozet' ? ['ozet', 'Özetim'].concat(x.slice(2)) : x); }
{ const b0 = p2AccBody; p2AccBody = (u, tab) => { if (tab === 'ozet') return hsOzet(u);
    // Hesabım › Borsa: her genişlikte bekleyen işlem kartları (yüklenirken / hatada eski gövde: yükleniyor / hata kutusu)
    if (tab === 'borsa') { const d = p4MeEx(); return !d || d.err ? b0(u, tab) : hsBorsa(u); }
    return b0(u, tab); }; }

/* ---------- kabuk (45-hesabim.js hsShell): prod vAccount'u (97-p0b-views.js) sarar ---------- */
{ const v0 = vAccount; vAccount = function () { return hsShell(v0.apply(this, arguments)); }; }
