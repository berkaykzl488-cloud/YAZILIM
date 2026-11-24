/* ================== "Google ile devam et" (yalnız --prod derlemesinde) ==================
   Sunucu: app/routes/12_google.php, app/src/Google.php (OAuth 2.0 yetki kodu + PKCE; Google JS SDK yok).
   - Giriş ve Üye Ol pencerelerine beyaz "Google ile devam et" düğmesi + "veya" ayırıcı (yalnız S.set.googleOn iken).
     Düğme tam sayfa gezinmesiyle /api/v1/index.php?r=auth/google/start&mode=…&ret=<rota> adresine gider.
   - Dönüş: <site>/?gauth=<sonuç>#<rota>. gauth adresten silinir (temiz ve ?p= kiplerinde), sonuca göre: giriş tamam (toast),
     "Google ile kaydı tamamla" formu, şifreyle bağlama penceresi, 2 adımlı doğrulama kodu (pTfa, aynı uç noktalar) ya da
     Türkçe hata. Ayrıntı GET auth/google/pending'den gelir.
   - Hesabım › Profil ve güvenlik: "Google hesabı" paneli (bağlı / bağla / bağlantıyı kaldır; şifre yoksa kaldırılamaz).
   - Yönetim › Entegrasyonlar: "Google ile giriş" kartı (açık/kapalı, Client ID, maskeli Client Secret, yönlendirme adresi
     kopyalama, adım adım kurulum, "Bağlantıyı test et"). Kart ve paneller render() sonrasında DOM'a eklenir; diğer ekranların
     koduna dokunulmaz.                                                                                                         */
if(YP_PROD){
const G = { ret: null, p: null };
const G_LOGO = '<svg class="glogo" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
{ const st=document.createElement('style'); st.id='g-css';
  st.textContent=`.gbtn{width:100%;background:#fff!important;color:#1f1f1f!important;border:1px solid #747775!important;border-radius:8px;gap:10px;min-height:42px;font-weight:600;white-space:normal}
.gbtn:hover{background:#f6f8fc!important;border-color:#5f6368!important}.gbtn:focus-visible{outline:2px solid #4285f4;outline-offset:2px}.gbtn .glogo{flex:0 0 auto}
.gbtn.gbtn-sm{width:auto;min-height:34px;padding:7px 12px}
.gor{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;margin:2px 0}.gor:before,.gor:after{content:"";flex:1;border-top:1px solid var(--line)}
.gacc .cprow{gap:10px;flex-wrap:wrap}.gacc .glogo{vertical-align:-3px;margin-right:6px}
.gsteps summary{cursor:pointer;font-weight:600}.gsteps ol{margin:8px 0 0;padding-left:20px;display:grid;gap:6px;font-size:13px;line-height:1.5}.gsteps code{overflow-wrap:anywhere}
#gadm h3 .glogo{vertical-align:-3px;margin-right:6px}`;
  document.head.appendChild(st); }

const gOn = () => !!(S && S.set && S.set.googleOn);
const gBtn = (m, sm) => `<button type="button" class="btn gbtn${sm?' gbtn-sm':''}" data-act="g-start" data-m="${m}">${G_LOGO}<span>${m==='link'?'Google hesabını bağla':'Google ile devam et'}</span></button>`;
/** Dönülecek rota (sunucu ayrıca doğrular); yönetim ve bilinmeyen biçimler ana sayfaya */
const gRet = () => { const r=String(route()||'home'); return /^[A-Za-z0-9][A-Za-z0-9_\-/]{0,120}$/.test(r)?r:'home'; };
ACT['g-start']=(d)=>{ const m=['login','register','link'].includes(d.m)?d.m:'login';
  const b=document.querySelector(`[data-act="g-start"][data-m="${m}"]`); if(b){ b.disabled=true; b.setAttribute('aria-busy','true'); }
  location.href=apiUrl('auth/google/start?mode='+m+'&ret='+encodeURIComponent(gRet())); };

/* ---- giriş / üyelik pencereleri ---- */
function gInject(form, m){ if(!gOn()||me()) return; const f=$('#modal form[data-form='+form+']'); if(!f||f.querySelector('.gbtn')) return;
  f.insertAdjacentHTML('afterbegin', gBtn(m)+'<div class="gor" role="separator"><span>veya</span></div>'); }
{ const f=mLogin; mLogin=function(){ const o=f.apply(this,arguments); try{ gInject('loginf','login'); }catch(e){} return o; }; }
{ const f=mRegister; mRegister=function(){ const o=f.apply(this,arguments); try{ gInject('registerf','register'); }catch(e){} return o; }; }

/* ---- dönüş ---- */
const G_MSG = {
  linked:'Google hesabınız bağlandı. Artık "Google ile devam et" ile giriş yapabilirsiniz.',
  state:'Google ile giriş isteği doğrulanamadı ya da süresi doldu. Lütfen "Google ile devam et" düğmesine yeniden basın.',
  cancel:'Google ile giriş iptal edildi.', off:'Google ile giriş şu an kapalı.',
  token:'Google ile bağlantı kurulamadı. Lütfen biraz sonra tekrar deneyin.', claims:'Google hesabı doğrulanamadı. Lütfen tekrar deneyin.',
  unverified:'Google hesabınızın e-posta adresi doğrulanmamış. Önce Google hesabınızda e-postanızı doğrulayın.',
  banned:'Hesabınız askıya alınmış. Canlı destekle görüşün.', taken:'Bu Google hesabı başka bir üyeliğe bağlı.',
  already:'Hesabınıza zaten başka bir Google hesabı bağlı. Önce mevcut bağlantıyı kaldırın.',
  conflict:'Bu e-posta adresiyle kayıtlı hesap Google ile bağlanamıyor. Kullanıcı adınız ve şifrenizle giriş yapın.',
  rate:'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.', auth:'Google hesabını bağlamak için önce giriş yapın.',
  already_in:'Zaten giriş yapmış durumdasınız.', err:'Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.' };
{ try{ const sp=new URLSearchParams(location.search), g=sp.get('gauth');
    if(g!=null){ G.ret=String(g).replace(/[^a-z_]/g,'').slice(0,20)||'err'; sp.delete('gauth'); const q=sp.toString();
      history.replaceState(history.state,'',location.pathname+(q?'?'+q:'')+location.hash); } }catch(e){} }
async function gAfter(j){ if(j&&j.data&&j.data.csrf) API.csrf=j.data.csrf; G.p=null; try{ localStorage.removeItem('yangpazar_ref'); }catch(e){}
  await apiReboot(true).catch(()=>{ if(j&&j.data&&j.data.me) apiSetMe(j.data.me); });
  closeModal(); ui.tab='ozet'; const u=me(); if(u&&u.admin&&!isAdmRoute(route())) go('yonetim'); else render(); }
async function gReturn(){ const r=G.ret; if(!r) return; G.ret=null;
  if(r==='ok'){ const u=me(); if(!u) return toast(G_MSG.state,true); toast('Google ile giriş yapıldı. Hoş geldin '+u.name+'!'); if(u.admin&&!isAdmRoute(route())) go('yonetim'); return; }
  if(r==='linked'){ toast(G_MSG.linked); if(route()==='hesabim'){ ui.tab='profil'; render(); } return; }
  if(r==='tfa'||r==='register'||r==='link'){ let p=null;
    try{ const j=await call('GET','auth/google/pending',null,{quiet:true,silent:true}); p=j.data&&j.data.pending; }catch(e){ return toast(apiErr(e),true); }
    if(!p) return toast(G_MSG.state,true);
    if(p.k==='tfa'&&typeof pTfa==='function') return pTfa(Object.assign({purpose:'login'},p.tfa));
    if(p.k==='register') return gReg(p);
    if(p.k==='link') return gLink(p);
    return toast(G_MSG.state,true); }
  toast(G_MSG[r]||G_MSG.err,true); }
setTimeout(function w(n){ if(API.booting&&n<200) return setTimeout(()=>w(n+1),50); gReturn(); },0);

/* "Google ile kaydı tamamla": normal üyelik formuyla aynı alanlar (şifre hariç; e-posta Google'dan, değiştirilemez) */
function gReg(p,err){ G.p=p; const ref=(typeof P_REF==='function'?P_REF():'');
  modal(mWrap('Google ile kaydı tamamla',`<form class="stack" data-form="gregf"><div class="note note-info">${G_LOGO} <span><b>${esc(p.email)}</b> Google hesabınızla üye oluyorsunuz. Şifre gerekmez; isterseniz daha sonra Hesabım › Profil ve güvenlik bölümünden şifre ekleyebilirsiniz.</span></div>
  <div class="row2"><div class="fld"><label for="gr_ad">Ad</label><input class="inp" id="gr_ad" required value="${esc(p.ad||'')}"></div><div class="fld"><label for="gr_sy">Soyad</label><input class="inp" id="gr_sy" required value="${esc(p.soyad||'')}"></div></div>
  <div class="fld"><label for="gr_u">Kullanıcı adı (sitede görünür)</label><input class="inp" id="gr_u" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_ÇĞİÖŞÜçğıöşü]+" value="${esc(p.name||'')}"><span class="muted" style="font-size:12px">3-20 karakter; harf, rakam ve alt çizgi.</span></div>
  <div class="row2"><div class="fld"><label for="gr_t">Cep telefonu</label><input class="inp mono" id="gr_t" required placeholder="05xx xxx xx xx" inputmode="tel"></div><div class="fld"><label for="gr_e">E-posta (Google)</label><input class="inp" id="gr_e" type="email" value="${esc(p.email)}" readonly></div></div>
  ${S.set.refOn?`<div class="fld"><label for="gr_ref">Davet kodu (isteğe bağlı)</label><input class="inp mono" id="gr_ref" placeholder="ARKADAS26" style="text-transform:uppercase" value="${esc(ref)}"></div>`:''}
  <label class="chk" for="gr_k"><input type="checkbox" id="gr_k" required> KVKK aydınlatma metnini ve üyelik sözleşmesini okudum.</label>
  ${err?`<div class="note note-bad">${esc(err)}</div>`:''}<button class="btn btn-primary">Kaydı tamamla</button><span class="muted" style="font-size:12px">Ad, soyad ve telefonunuz diğer üyelere gösterilmez; para çekme bildirimleri ve WhatsApp doğrulama kodları için kullanılır.</span></form>`));
  setTimeout(()=>{ const i=$(p.name?'#gr_t':'#gr_u'); if(i) i.focus(); },50); }
FORM.gregf=(f)=>{ const p=G.p; if(!p) return closeModal();
  const b={name:v_('gr_u').trim(),tel:v_('gr_t').trim(),ad:v_('gr_ad').trim(),soyad:v_('gr_sy').trim(),kvkk:!!($('#gr_k')||{}).checked,remember:true};
  const ref=v_('gr_ref').trim().toUpperCase(); if(ref) b.ref=ref;
  return apiBusy(f,(async()=>{ try{ const j=await call('POST','auth/google/register',b,{quiet:true,silent:true,key:formKey(f)}); toast(j.msg||'Hoş geldiniz!'); try{ track('uye',{method:'google'}); }catch(x){} await gAfter(j); }
    catch(e){ if(e&&(e.code==='g_gone'||e.code==='logged_in')){ closeModal(); return toast(apiErr(e),true); }
      gReg(Object.assign({},p,{name:b.name,ad:b.ad,soyad:b.soyad}),apiErr(e)); const t=$('#gr_t'); if(t) t.value=b.tel; const k=$('#gr_k'); if(k) k.checked=b.kvkk; const r=$('#gr_ref'); if(r) r.value=ref; } })()); };

/* e-postası eşleşen hesap: güvenlik için bir kez o hesabın şifresiyle giriş, sonra bağlanır */
function gLink(p,err){ G.p=p;
  modal(mWrap('Google hesabını bağla',`<form class="stack" data-form="glinkf"><div class="note note-info">${G_LOGO} <span><b>${esc(p.email)}</b> adresiyle kayıtlı bir üyeliğiniz var. Güvenliğiniz için Google hesabınızı bağlamadan önce bu üyeliğin şifresiyle bir kez giriş yapın. Sonraki girişlerde "Google ile devam et" yeterli olur.</span></div>
  <div class="fld"><label for="gl_p">Şifre</label><input class="inp" id="gl_p" type="password" autocomplete="current-password" required></div>${err?`<div class="note note-bad">${esc(err)}</div>`:''}
  <button class="btn btn-primary">Giriş yap ve Google'ı bağla</button><button type="button" class="btn btn-sm" data-act="login">Vazgeç, normal giriş yap</button></form>`));
  setTimeout(()=>{ const i=$('#gl_p'); if(i) i.focus(); },50); }
FORM.glinkf=(f)=>{ const p=G.p; if(!p) return closeModal();
  return apiBusy(f,(async()=>{ try{ const j=await call('POST','auth/google/link',{password:v_('gl_p')},{quiet:true,silent:true});
      if(j.tfa&&typeof pTfa==='function') return pTfa(Object.assign({purpose:'login'},j.tfa));
      toast(j.msg||'Google hesabınız bağlandı.'); await gAfter(j); }
    catch(e){ if(e&&e.code==='g_gone'){ closeModal(); return toast(apiErr(e),true); } gLink(p,apiErr(e)); } })()); };

/* ---- Hesabım › Profil ve güvenlik: Google hesabı ---- */
function gAccPanel(u){ const L=!!u.gLinked; if(!L&&!gOn()) return '';
  return `<div class="panel panel-b stack gacc" id="gacc" style="max-width:560px"><div class="eyebrow">Google hesabı</div>
    <div class="cprow"><span>${G_LOGO}<b>${L?'Bağlı':'Bağlı değil'}</b>${L&&u.gEmail?' · <span class="mono">'+esc(u.gEmail)+'</span>':''}<br><span class="muted" style="font-size:12px">${L?'"Google ile devam et" ile şifresiz giriş yapabilirsiniz.':'Bağlarsanız giriş penceresinde "Google ile devam et" ile tek tıkla girersiniz.'}</span></span>
    ${L?`<button type="button" class="btn btn-sm" data-act="g-unlink" ${u.hasPass?'':'disabled aria-disabled="true"'}>Bağlantıyı kaldır</button>`:gBtn('link',true)}</div>
    ${L&&!u.hasPass?'<div class="note note-warn" style="font-size:12.5px">Hesabınızda şifre yok; Google ile giriş yapıyorsunuz. Bağlantıyı kaldırmadan önce yukarıdaki "Yeni şifre" alanından bir şifre belirleyin.</div>':''}</div>`; }
ACT['g-unlink']=(d,e)=>{ const u=me(); if(!u) return; if(!u.hasPass) return toast('Önce bir şifre belirleyin; yoksa hesabınıza giriş yapamazsınız.',true);
  openConfirm({t:'Google bağlantısı kaldırılsın mı?',d:'Bundan sonra kullanıcı adınız/e-postanız ve şifrenizle giriş yaparsınız.',ok:'Bağlantıyı kaldır',danger:1,
    onOk:()=>{ call('POST','me/google/unlink',{}).then(()=>render(),()=>{}); }}); };

/* ---- Yönetim › Entegrasyonlar › Google ile giriş ---- */
function gAdmCard(d){ const dis=!d.canEdit, t=d.lastTest;
  const pill=d.enabled?'<span class="pill p-tamam">Açık</span>':d.configured?'<span class="pill p-bekliyor">Kapalı</span>':'<span class="pill p-bekliyor">Ayarlanmadı</span>';
  const cp=(id,v)=>`<div class="p3url"><code class="mono" id="${id}">${esc(v)}</code><button type="button" class="btn btn-sm btn-primary" data-act="copy" data-v="${esc(v)}">📋 Kopyala</button></div>`;
  return `<form class="panel" data-form="gadm" id="gadm" novalidate><div class="panel-h" style="flex-wrap:wrap"><h3>${G_LOGO}Google ile giriş</h3><div class="p3st">${pill}${t?`<span class="pill ${t.ok?'p-tamam':'p-iade'}">${t.ok?'Bağlantı başarılı':'Bağlantı başarısız'}</span><span class="muted">${esc(dtstr(t.t))} · ${esc(t.msg||'')}</span>`:d.configured?'<span class="muted">Henüz test edilmedi.</span>':''}</div></div>
  <div class="panel-b stack"><span class="muted" style="font-size:13px">Üyeler giriş ve üyelik pencerelerindeki "Google ile devam et" düğmesiyle tek tıkla giriş yapar ya da üye olur. Bilgiler girilip açılmadan düğme görünmez.</span>
    ${dis?'<div class="note note-warn" style="font-size:12.5px">Bu bölümü düzenlemek için "Site ayarları" yetkisi gerekir.</div>':''}
    ${d.https?'':'<div class="note note-warn" style="font-size:12.5px">Site adresiniz https ile başlamıyor. Google, yönlendirme adresinin https olmasını ister. Yönetim › Site ayarları › Genel bölümünde site adresini https://… olarak kaydedin.</div>'}
    <label class="chk" for="g_on"><input type="checkbox" id="g_on" ${d.on?'checked':''} ${dis?'disabled':''}> Google ile giriş açık</label>
    <div class="row2"><div class="fld"><label for="g_cid">Client ID (İstemci kimliği)</label><input class="inp mono" id="g_cid" value="${esc(d.client_id||'')}" autocomplete="off" spellcheck="false" placeholder="1234…-abc….apps.googleusercontent.com" ${dis?'disabled':''}><span class="muted" style="font-size:12px">…apps.googleusercontent.com ile biter.</span></div>
      <div class="fld"><label for="g_sec">Client Secret (İstemci gizli anahtarı)</label><input class="inp mono" id="g_sec" type="password" autocomplete="new-password" value="" placeholder="${d.client_secret?'Kayıtlı · değiştirmek için yeni değeri yazın':'Girilmedi'}" ${dis?'disabled':''}>${d.client_secret?`<span class="muted" style="font-size:12px">Kayıtlı: <span class="mono">${esc(d.client_secret)}</span> · boş bırakırsanız eski değer korunur</span>`:'<span class="muted" style="font-size:12px">Genelde GOCSPX- ile başlar.</span>'}</div></div>
    <div class="fld"><span class="lbl"><b>Yetkili yönlendirme URI'si</b> (Authorized redirect URI) — Google Cloud'a aynen yapıştırın</span>${cp('g_ruri',d.redirect)}</div>
    <div class="fld"><span class="lbl"><b>Yetkili JavaScript kaynağı</b> (Authorized JavaScript origin)</span>${cp('g_org',d.origin)}</div>
    <details class="gsteps" ${d.configured?'':'open'}><summary>Google Cloud'da adım adım kurulum</summary><ol>
      <li><b>console.cloud.google.com</b> adresine Google hesabınızla girin; üstteki proje seçiciden <b>Yeni proje</b> oluşturun (ör. yangpazar).</li>
      <li><b>OAuth izin ekranı</b>nı açın (API'ler ve Hizmetler › OAuth izin ekranı; yeni arayüzde "Google Auth Platform"). Kullanıcı türü: <b>Harici</b> (External). Uygulama adı (ör. ${esc(S.set.siteName||'yangpazar.com')}), kullanıcı destek e-postası ve geliştirici iletişim e-postasını yazın. Logo isteğe bağlıdır (logo eklemek Google'ın marka doğrulamasını gerektirebilir). Ek kapsam eklemeyin; e-posta ve profil yeterlidir.</li>
      <li><b>Kimlik bilgileri</b> › Kimlik bilgisi oluştur › <b>OAuth istemci kimliği</b> (yeni arayüzde İstemciler › İstemci oluştur). Uygulama türü: <b>Web uygulaması</b>.</li>
      <li><b>Yetkili JavaScript kaynakları</b>na site adresini ekleyin: <code class="mono">${esc(d.origin)}</code></li>
      <li><b>Yetkili yönlendirme URI'leri</b>ne şu adresi aynen ekleyin: <code class="mono">${esc(d.redirect)}</code></li>
      <li>Oluştur'a basın. Çıkan <b>Client ID</b> ve <b>Client Secret</b> değerlerini yukarıdaki alanlara yapıştırıp Kaydet'e, sonra "Bağlantıyı test et"e basın. Gizli anahtar yalnız oluşturulurken gösterilebilir; kaybederseniz Google Cloud'da yenisini oluşturun.</li>
      <li>İzin ekranında (Kitle / Audience) yayın durumunu <b>Test</b> (Testing) yerine <b>Üretimde</b> (In production) yapın ("Uygulamayı yayınla"). Aksi halde yalnız eklediğiniz test kullanıcıları giriş yapabilir.</li>
      <li>"Google ile giriş açık" kutusunu işaretleyip Kaydet'e basın. Google'daki değişikliklerin etkinleşmesi birkaç dakika sürebilir.</li></ol></details>
    <span class="muted" style="font-size:12px">"Bağlantıyı test et" Client ID biçimini, sunucunun Google'a ulaşabildiğini ve Client ID ile Client Secret'ın doğru olduğunu denetler. Yönlendirme adresinin eklendiğini ve uygulamanın yayında olduğunu denetleyemez; kaydettikten sonra bir kez kendiniz "Google ile devam et" ile deneyin.</span>
  </div><div class="panel-f hstack" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><span class="muted" style="font-size:12px">Client Secret sunucuda şifreli saklanır; burada yalnız maskeli görünür.</span><div class="hstack" style="gap:6px"><button type="button" class="btn btn-sm" data-act="g-test" ${dis||!d.configured?'disabled':''}>Bağlantıyı test et</button><button class="btn btn-primary btn-sm" ${dis?'disabled':''}>Kaydet</button></div></div></form>`; }
const gAdmSet = v => { if(v) API.cache['adm:google']={v,t:Date.now()}; };
FORM.gadm=(f)=>{ if(!admOk('ayar')) return toast('Bu işlem için yetkiniz yok.',true);
  const b={on:!!($('#g_on')||{}).checked,client_id:v_('g_cid').trim()}; const s=v_('g_sec').trim(); if(s) b.client_secret=s;
  return apiBusy(f,call('PUT','admin/integrations/google',b,{key:formKey(f)}).then(j=>{ delete f.dataset.ikey; gAdmSet(j.data&&j.data.google); admDirtyClear(); render(); })); };
ACT['g-test']=(d,e)=>{ if(!admOk('ayar')) return toast('Bu işlem için yetkiniz yok.',true); const el=e&&e.target&&e.target.closest?e.target.closest('button'):null;
  return apiBusy(el,call('POST','admin/integrations/google/test',{}).then(j=>{ const x=j.data||{}; if(!x.ok) toast(x.msg||'Bağlantı kurulamadı.',true); gAdmSet(x.google); render(); })); };

/* ---- render sonrası: profil paneli, yönetim kartı ---- */
function gPost(){
  const pf=$('#app form[data-form=profile]'), u=me();
  if(pf&&u&&!$('#gacc')){ const h=gAccPanel(u); const host=pf.closest('.panel')||pf; if(h) host.insertAdjacentHTML('afterend',h);
    if(!u.hasPass){ const c=$('#pf_cur'), m=c&&c.closest('.fld')&&c.closest('.fld').querySelector('.muted'); if(m) m.textContent='Hesabınızda henüz şifre yok (Google ile giriş). Yeni şifreyi mevcut şifre olmadan belirleyebilirsiniz.'; } }
  const ent=$('#app .p3ent');
  if(ent&&!$('#gadm')&&isPanel()){ const d=need('adm:google',()=>call('GET','admin/integrations/google',null,{quiet:true}).then(j=>j.data.google),30000);
    const html=!d?`<div id="gadm">${pLoading('Google ile giriş yükleniyor…')}</div>`:d.err?`<div class="panel panel-b" id="gadm"><div class="note note-bad">${esc(d.err)}</div></div>`:gAdmCard(d);
    const first=ent.querySelector(':scope > form.panel'); if(first) first.insertAdjacentHTML('beforebegin',html); else ent.insertAdjacentHTML('beforeend',html); }
}
{ const r0=render; render=function(){ const o=r0.apply(this,arguments); try{ gPost(); }catch(e){ console.warn('google',e); } return o; }; }
}
