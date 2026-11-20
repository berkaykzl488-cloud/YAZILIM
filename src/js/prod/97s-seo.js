/* ================== SEO: adres kipi, rewrite denetimi, Yönetim › SEO (yalnız --prod derlemesinde) ==================
   Adres kipi sunucudan gelir (boot.set.seo.mode): 'clean' → /metin2-pvp/albamt2/karakter, 'p' → /?p=metin2-pvp/albamt2/karakter.
   Temiz adresler, sahibi kapatmadıysa (seo.clean) ve rewrite doğrulandıysa (seo.rw.ok) açılır. Doğrulama:
     - sunucu: index.php'ye temiz adresle ulaşan her istek "çalışıyor" kaydıdır (Seo::forRequest);
     - tarayıcı: Yönetim › SEO açılınca ve [seo] yetkili çalışan siteyi açtığında (günde bir) GET /metin2-pvp?yp_probe=…
       yanıtında X-YP-Page: probe başlığı aranır; yoksa POST admin/seo/probe {ok:false} → site ?p= adresleriyle devam eder.
   Yönetim › SEO & Pazarlama › Genel: denetim durumu, "Şimdi dene", temiz adres anahtarı ve temel SEO ayarları (PUT admin/settings/seo). */
if (YP_PROD) {
const PS = { probing: false, auto: false, q: null };

/* noindex (sunucudaki Seo::head ile aynı): "Yakında" bölümleri, rehber (yazılar henüz sunucuda değil), satıcı profili,
   kategori takma adları, server EP (yakında) / tüm ilanlar / ilanı olmayan kategori */
seoNoidxX = function (r) {
  if (/^(cekilis|reklam-ver|ortaklik|yang-fiyatlari|rehber)$/.test(r) || /^uye-/.test(r) || (/^kategori-/.test(r) && r !== 'kategori-metin2')) return true;
  const m = r.match(/^server-([^-]+)-(.+)$/); if (m) { const s = srv(m[1]); return m[2] === 'ep' || m[2] === 'hepsi' || !s || !p1N(s, m[2]); }
  return false; };

/** Rewrite denetimi: tarayıcı temiz adresi ister; sonuç sunucuya kaydedilir (başarı zaten index.php'de kaydedilmiştir). */
async function seoProbe(quiet) {
  if (PS.probing) return; PS.probing = true; let ok = false, code = 0;
  try { const r = await fetch((window.YP_BASE || '/') + 'metin2-pvp?yp_probe=' + Date.now(), { cache: 'no-store', redirect: 'manual', credentials: 'same-origin' });
    code = r.status; ok = r.status === 200 && r.headers.get('X-YP-Page') === 'probe'; } catch (e) { code = 0; }
  try { const j = await call('POST', 'admin/seo/probe', { ok, code }, { quiet: !!quiet, silent: !!quiet }); API.cache['adm:seo'] = { v: j.data, t: Date.now() }; }
  catch (e) { } finally { PS.probing = false; }
  if (isAdmRoute(route())) render();
  return ok;
}
/* [seo] yetkili çalışan siteyi açtığında: hiç denenmediyse ya da son denetim eskiyse arka planda dene */
setTimeout(() => { try { const rw = (S.set.seo || {}).rw, t = Date.now();
  if (isPanel() && admOk('seo') && (!rw || t - rw.t > 86400000 || (!rw.ok && t - rw.t > 600000))) seoProbe(true); } catch (e) { } }, 2500);

/* arama (#ara / /ara?q=…): WebSite SearchAction hedefi; sorgu adresten okunur */
{ const r0 = render; render = function () { try { if (seoClean() && route() === 'ara') { const q = new URLSearchParams(location.search).get('q');
      if (q && q !== PS.q) { PS.q = q; ui.q = q; const i = $('#q'); if (i) i.value = q; } } } catch (e) { } return r0.apply(this, arguments); }; }

/* ---- Yönetim › SEO & Pazarlama › Genel ---- */
function pSeoAdm(sub) {
  if (sub && sub !== 'genel') return { body: pSoon('Bu bölüm çok yakında', 'Reklam takibi, backlink ve rehber yazıları sonraki güncellemelerde burada olacak.') };
  const d = p1AdmLoad('adm:seo', 'admin/settings/seo', null, 60000);
  if (!d) return { body: pLoading('SEO ayarları yükleniyor…') }; if (d.err) return { body: p1Err(d) };
  const SE = d.seo || {}, rw = SE.rw, ex = d.example || {};
  if (!PS.auto) { PS.auto = true; if (!rw || Date.now() - rw.t > 86400000) setTimeout(() => seoProbe(true), 0); }
  const st = PS.probing ? ['p-bekliyor', 'Deneniyor…'] : rw && rw.ok ? ['p-tamam', 'Çalışıyor'] : rw ? ['p-iade', 'Çalışmıyor'] : ['p-bekliyor', 'Henüz denenmedi'];
  const via = { istek: 'temiz adresle gelen bir ziyaret', yonetim: 'yönetim panelindeki deneme' }[rw && rw.via] || '';
  const live = SE.mode === 'clean';
  return { desc: 'Arama motoru ayarları, adres yapısı ve site haritası.', body: `<div class="panel" id="seo_rw"><div class="panel-h" style="flex-wrap:wrap"><h3>Temiz adres denetimi</h3><span class="pill ${st[0]}" id="seo_rw_st">${st[1]}</span></div>
    <div class="panel-b stack"><div class="note ${live ? 'note-ok' : 'note-info'}" id="seo_mode">${live ? `<b>Temiz adresler kullanılıyor.</b> Örnek: <span class="mono">${esc(ex.clean || '')}</span>` : `<b>Yedek adresler kullanılıyor.</b> Örnek: <span class="mono">${esc(ex.p || '')}</span> — ${!SE.clean ? 'temiz adresleri aşağıdan siz kapattınız.' : rw && !rw.ok ? 'sunucu temiz adresi index.php\'ye yönlendirmedi (.htaccess / mod_rewrite). Sayfalar ?p= ile sorunsuz çalışır ve arama motorlarınca okunur.' : 'denetim bitince temiz adreslere geçilir.'}`}</div>
      <div class="sum"><div><span class="muted">Son denetim</span><b>${rw && rw.t ? esc(dtstr(rw.t)) : '-'}</b></div><div><span class="muted">Kaynak</span><b>${esc(via || '-')}${rw && !rw.ok && rw.code ? ' · HTTP ' + (+rw.code) : ''}</b></div><div><span class="muted">Denetim adresi</span><b class="mono" style="font-size:11.5px;overflow-wrap:anywhere">${esc(d.probe || '')}</b></div></div>
      <div class="hstack"><button type="button" class="btn btn-sm btn-primary" data-act="seo-probe">Şimdi dene</button><a class="btn btn-sm" href="${esc(d.sitemap || 'sitemap.xml')}" target="_blank" rel="noopener">sitemap.xml</a><a class="btn btn-sm" href="${esc(d.robots || 'robots.txt')}" target="_blank" rel="noopener">robots.txt</a></div>
      <span class="muted" style="font-size:12px">Denetim, tarayıcınızdan <span class="mono">/metin2-pvp</span> adresini ister ve yanıtta sitenin işaret başlığını (X-YP-Page) arar. Çalışmazsa site kendiliğinden <span class="mono">/?p=…</span> adreslerine döner; eski #adresler ve /server/… adresleri yeni adreslere yönlendirilir.</span></div></div>
  <form class="panel" data-form="seoset"><div class="panel-h"><h3>Genel SEO ayarları</h3></div><div class="panel-b stack">
    <label class="chk" for="se_cl"><input type="checkbox" id="se_cl" ${SE.clean ? 'checked' : ''}> Temiz adresler kullan (<span class="mono">/metin2-pvp/albamt2/karakter</span>; denetim geçerse)</label>
    <div class="fld"><label for="se_ht">Ana sayfa başlığı (title)</label><input class="inp" id="se_ht" maxlength="70" value="${esc(SE.homeTitle || '')}" placeholder="${esc(S.set.siteName)} · Metin2 Item, Yang, Won, EP ve Karakter Pazarı"></div>
    <div class="fld"><label for="se_d">Ana sayfa açıklaması (meta description)</label><textarea class="inp" id="se_d" maxlength="170" style="min-height:64px">${esc(SE.desc || '')}</textarea><span class="muted" style="font-size:12px">${String(SE.desc || '').length} karakter · ideal 120-160</span></div>
    <div class="row3"><div class="fld"><label for="se_sep">Başlık ayıracı</label><select class="inp" id="se_sep">${[' | ', ' · ', ' - ', ' – '].map(x => `<option value="${x}" ${SE.sep === x ? 'selected' : ''}>Sayfa${x}${esc(S.set.siteName)}</option>`).join('')}</select></div><div class="fld"><label for="se_og">Paylaşım görseli adresi (1200×630)</label><input class="inp mono" id="se_og" value="${esc(SE.ogImg || '')}" placeholder="https://.../paylasim.jpg"></div><div class="fld"><label for="se_g">Google Search Console kodu</label><input class="inp mono" id="se_g" value="${esc(SE.gsc || '')}"></div></div>
    <div class="row2"><div class="fld"><label for="se_b">Bing Webmaster kodu</label><input class="inp mono" id="se_b" value="${esc(SE.bing || '')}"></div><div class="fld"><label for="se_y">Yandex Webmaster kodu</label><input class="inp mono" id="se_y" value="${esc(SE.yandex || '')}"></div></div>
    <label class="chk" for="se_ni"><input type="checkbox" id="se_ni" ${SE.noindex ? 'checked' : ''}> Siteyi arama motorlarına kapat (yapım aşaması / test sitesi)</label>
  </div>${aSave('SEO ayarlarını kaydet')}</form>` };
}
{ const v1 = vAdmin; vAdmin = function (P) { P = P || admParse('yonetim'); if (isPanel()) { const it = admItem(P.k); if (it && it.k === 'seo' && admVis(it)) return pAdmPage(P, it, pSeoAdm); } return v1(P); }; }

FORM.seoset = (f) => { if (!admOk('seo')) return toast('Bu işlem için yetkiniz yok.', true);
  const b = { clean: !!($('#se_cl') || {}).checked, noindex: !!($('#se_ni') || {}).checked, homeTitle: v_('se_ht').trim(), desc: v_('se_d').trim(), sep: v_('se_sep') || ' | ',
    ogImg: v_('se_og').trim(), gsc: v_('se_g').trim(), bing: v_('se_b').trim(), yandex: v_('se_y').trim() };
  return apiBusy(f, call('PUT', 'admin/settings/seo', b).then(j => { API.cache['adm:seo'] = { v: j.data, t: Date.now() }; admDirtyClear(); render(); })); };
ACT['seo-probe'] = (d, e) => { if (!admOk('seo')) return toast('Bu işlem için yetkiniz yok.', true); const el = e && e.target && e.target.closest ? e.target.closest('button') : null;
  return apiBusy(el, seoProbe(false).then(() => render())); };
ADM_ACT['seo-probe'] = 'seo'; ADM_FORM.seoset = 'seo';
}
