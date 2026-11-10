/* ================== R8: Entegrasyonlar — PayTR · Paraşüt · Bizim Hesap (sunucudaki /api/ paketi) ==================
   Sırlar (anahtar, şifre) yalnız input alanlarında durur ve doğrudan sunucuya gönderilir; S'ye / localStorage'a asla yazılmaz.
   CSRF belirteci yalnız bellekte tutulur (ui.apiCsrf). Sunucuya ulaşılamazsa "Önizleme modu" gösterilir. */
const ENT_SVC={
  paytr:{n:'PayTR',p:'odeme',d:'Üyeler kartla ve Havale/EFT ile bakiye yükler.',
    w:'Mağaza bilgileri PayTR Mağaza Paneli › <b>Bilgi</b> sayfasındaki “API Entegrasyon Bilgileri” bölümünde yazar; oradan kopyalayıp yapıştırın.',
    f:[{k:'merchant_id',l:'Mağaza no (Merchant ID)',sec:1,mask:1,ph:'Örn: 123456'},{k:'merchant_key',l:'Mağaza parolası (Merchant Key)',sec:1},{k:'merchant_salt',l:'Mağaza gizli anahtarı (Merchant Salt)',sec:1},
      {k:'max_installment',l:'En fazla taksit',t:'inst'},{k:'test_mode',l:'Test modu: gerçek para çekilmez (canlıya geçerken kapatın)',t:'chk'},
      {k:'ok_url',l:'Ödeme başarılı olunca açılacak sayfa',t:'url'},{k:'fail_url',l:'Ödeme başarısız olunca açılacak sayfa',t:'url'}]},
  parasut:{n:'Paraşüt',p:'muhasebe',d:'Para çekimlerinde e-Gider Pusulası ve muhasebe kaydı kendiliğinden açılır.',
    w:'Firma numarası, Paraşüt’e girdiğinizde adres çubuğundaki sayıdır. Uygulama kimliği ve şifresini Paraşüt destek ekibinden “API erişimi istiyorum” diyerek alırsınız.',
    f:[{k:'company_id',l:'Firma numarası',ph:'Örn: 123456'},{k:'client_id',l:'Uygulama kimliği (Client ID)',sec:1,mask:1},{k:'client_secret',l:'Uygulama şifresi (Client Secret)',sec:1},
      {k:'username',l:'Paraşüt giriş e-postası',t:'email'},{k:'password',l:'Paraşüt giriş şifresi',sec:1}]},
  bizimhesap:{n:'Bizim Hesap',p:'muhasebe',d:'Paraşüt yerine Bizim Hesap kullanıyorsanız bunu doldurun.',
    w:'Firma kodunu ve API anahtarını Bizim Hesap destek ekibinden “API anahtarı istiyorum” diyerek alabilirsiniz.',
    f:[{k:'firm_id',l:'Firma kodu'},{k:'api_key',l:'API anahtarı',sec:1}]}
};
const ENT_ORDER=['paytr','parasut','bizimhesap'];
const entS = () => ui.ent || (ui.ent={st:'idle',durum:null,ayar:null,needLogin:false,msg:{},why:'',err:'',seq:0});
const entBase = () => { let b=String((S.set&&S.set.apiBase)||'/api/').trim()||'/api/'; if(!/\/$/.test(b)) b+='/'; return b; };
const entAbs = f => { const b=entBase(); return /^https?:\/\//i.test(b)?b+f:siteBase()+(b.startsWith('/')?b:'/'+b)+f; };
/* Tek seferlik kurulum kodu: indirilen pakete (api/data/kurulum_kodu.php) indirme anında eklenir, kurulum isteğiyle gönderilir.
   Kurulum başarılı olana kadar aynı kod kullanılır (indirilen her kopya çalışır); başarılı kurulumdan sonra silinir. */
function entInstallCode(){ let c=S.set.apiInstallCode; if(!/^[0-9a-f]{32}$/.test(c||'')){ const a=new Uint8Array(16); crypto.getRandomValues(a); c=[...a].map(x=>x.toString(16).padStart(2,'0')).join(''); S.set.apiInstallCode=c; save(); } return c; }
const ENT_CODE_FILE='api/data/kurulum_kodu.php';
const apiKitDownload = () => muhasebeFiles().concat([[ENT_CODE_FILE, "<?php return '"+entInstallCode()+"';"]]);
const entCanSvc = svc => { const u=me(); return !!(u&&(u.admin||can(ENT_SVC[svc].p))); };
/* Küçük API yardımcısı: aynı site çerezi, JSON, CSRF başlığı (yalnız bellekten), 8 sn zaman aşımı, çevrimdışı algılama. */
async function api(path,o){ o=o||{}; const base=entBase(); const url=base+String(path).replace(/^\/+/,''); const m=String(o.method||(o.body!==undefined?'POST':'GET')).toUpperCase();
  if(!/^https?:$/.test(location.protocol)&&!/^https?:\/\//i.test(base)) return {ok:false,offline:true,code:'preview',_http:0,error:'Önizleme modu — sunucu bağlı değil'};
  const ctl=typeof AbortController==='function'?new AbortController():null; const tm=setTimeout(()=>{ try{ if(ctl) ctl.abort(); }catch(e){} },8000);
  const h={'Accept':'application/json'}; if(o.body!==undefined) h['Content-Type']='application/json'; if(m!=='GET'&&ui.apiCsrf) h['X-CSRF-Token']=ui.apiCsrf;
  let r=null, j=null;
  try{ r=await fetch(url,{method:m,credentials:'same-origin',headers:h,body:o.body!==undefined?JSON.stringify(o.body):undefined,signal:ctl?ctl.signal:undefined,cache:'no-store'}); try{ j=await r.json(); }catch(e){ if(e&&e.name==='AbortError') throw e; j=null; } }
  catch(e){ clearTimeout(tm); const to=e&&e.name==='AbortError'; return {ok:false,offline:true,code:to?'timeout':'network',_http:0,error:to?'Sunucu 8 saniye içinde yanıt vermedi.':'Sunucuya ulaşılamadı.'}; }
  clearTimeout(tm);
  if(!j||typeof j!=='object'||Array.isArray(j)){ const miss=r.status===404||r.ok; return {ok:false,offline:miss,code:miss?'missing':'http',_http:r.status,error:r.status===404?'Bu adreste API paketi bulunamadı.':'Sunucu beklenmeyen bir yanıt verdi (HTTP '+r.status+').'}; }
  return Object.assign({},j,{ok:!!j.ok&&r.ok,_http:r.status}); }
function entTime(t){ if(t==null||t==='') return null; let n=typeof t==='number'?t:(/^\d+$/.test(String(t))?+t:Date.parse(t)); if(!isFinite(n)) return null; if(n<1e12) n*=1000; return n; }
function entSt(svc){ const E=entS(); if(E.st==='idle'||E.st==='loading') return ['off','Kontrol ediliyor…']; if(E.st==='offline'||E.st==='error') return ['off','Sunucu bekleniyor']; if(E.st==='setup') return ['off','Kurulum bekliyor'];
  const s=((E.durum||{}).services||{})[svc]||{}; if(!s.configured) return ['off','Bilgi girilmedi']; const lt=s.last_test; if(!lt) return ['warn','Test edilmedi']; return lt.ok?['ok','Bağlı ✓']:['bad','Hata']; }
const entBadge = svc => { const [c,l]=entSt(svc); return `<span class="ebadge ${c}">${esc(l)}</span>`; };
function entEnsure(){ const E=entS(); if(E.st==='idle'){ E.st='loading'; setTimeout(entLoad,0); } return E; }
async function entLoad(){ const E=entS(); const my=E.seq=(E.seq||0)+1; E.st='loading';
  const d=await api('durum.php'); if(my!==E.seq) return;
  if(!d.ok){ E.durum=null; E.ayar=null; if(d.offline){ E.st='offline'; E.why=d.code; E.err=d.error||''; } else { E.st='error'; E.err=d.error||'Sunucu bir hata bildirdi.'; } return entDone(); }
  E.durum=d; if(!d.installed){ E.st='setup'; E.ayar=null; return entDone(); }
  await entAyar(my); if(my!==E.seq) return; entDone(); }
async function entAyar(my){ const E=entS(); const a=await api('ayarlar.php'); if(my&&my!==E.seq) return;
  if(a.ok){ E.ayar=a; if(a.csrf) ui.apiCsrf=a.csrf; E.st='ready'; E.needLogin=!ui.apiCsrf; return; }
  E.ayar=null; if(a.offline){ E.st='offline'; E.why=a.code; E.err=a.error||''; return; }
  if(a._http===401||a._http===403||a.code==='auth'){ E.st='login'; ui.apiCsrf=null; return; }
  E.st='error'; E.err=a.error||'Ayarlar okunamadı.'; }
function entReload(){ const E=entS(); E.st='loading'; render(); entLoad(); }
/* yükleme bitince yalnız ilgili ekranı yeniler; başka bir sayfada kaydedilmemiş form varsa dokunmaz */
function entDone(){ const r=route(); if(!isAdmRoute(r)||!isPanel()) return; const k=admParse(r).k; if(k!=='entegrasyon'&&(admDirtyNow()||!document.querySelector('[data-entw]'))) return; render(); }
/* yeniden çizimde yazılanlar kaybolmasın: değerler yalnız o an DOM'dan DOM'a taşınır, hiçbir yere kaydedilmez */
function entKeep(){ const root=document.getElementById('entRoot'); if(!root) return null; const v=[]; root.querySelectorAll('input[id],textarea[id],select[id]').forEach(el=>{ if(el.type==='file') return; const f=el.closest('form'); v.push([el.id,(el.type==='checkbox'||el.type==='radio')?el.checked:el.value,el.type,f&&f.id||'']); });
  const a=document.activeElement; return {v,dirty:[...root.querySelectorAll('form[data-dirty]')].map(f=>f.id).filter(Boolean),focus:a&&root.contains(a)&&a.id?a.id:null}; }
function entRestore(k){ const fresh=ui.entFresh||new Set(); ui.entFresh=null; const root=document.getElementById('entRoot'); if(!root||!k) return;
  k.v.forEach(([id,val,type,fid])=>{ if(fid&&fresh.has(fid)) return; const el=document.getElementById(id); if(!el||!root.contains(el)||el.type!==type) return; if(type==='checkbox'||type==='radio') el.checked=val; else el.value=val; });
  k.dirty.forEach(id=>{ if(fresh.has(id)) return; const f=document.getElementById(id); if(!f||!root.contains(f)) return; f.dataset.dirty='1'; ui.admDirty=true; const m=f.querySelector('.asave-m'); if(m){ m.textContent='Kaydedilmemiş değişiklik var'; m.classList.add('dirty'); } });
  if(k.focus){ const el=document.getElementById(k.focus); if(el&&!el.disabled&&document.activeElement!==el) try{ el.focus({preventScroll:true}); }catch(e){} } }
function entVals(svc){ const V={}; ENT_SVC[svc].f.forEach(x=>{ const el=document.getElementById('ent_'+svc+'_'+x.k); if(!el) return; V[x.k]=x.t==='chk'?!!el.checked:x.t==='inst'?(+el.value||0):String(el.value||'').trim(); }); return V; }
function entCheck(svc,V){ const u=x=>!x||/^https?:\/\/[^\s"'<>]+$/i.test(x);
  if(svc==='paytr'){ if(V.merchant_id&&!/^\d{3,12}$/.test(V.merchant_id)) return 'Mağaza no yalnız rakamlardan oluşur (PayTR panelindeki Merchant ID).'; if(!u(V.ok_url)||!u(V.fail_url)) return 'Sayfa adresleri https:// ile başlamalı.'; }
  if(svc==='parasut'&&V.username&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(V.username)) return 'Paraşüt giriş e-postasını kontrol edin.';
  return ''; }
function entBusy(svc,which,label){ const f=document.getElementById('ent_'+svc); if(!f) return; f.querySelectorAll('.asave button').forEach(b=>{ b.disabled=true; }); const b=which==='test'?f.querySelector('[data-act="ent-test"]'):f.querySelector('.asave .btn-primary'); if(b) b.innerHTML='<span class="spin"></span>'+esc(label); }
function entFail(svc,r,def){ const E=entS();
  if(r.offline){ E.st='offline'; E.why=r.code; E.err=r.error||''; E.msg[svc]={c:'warn',t:'Sunucuya ulaşılamadı; bilgiler kaydedilmedi. Yazdıklarınız bu alanlarda duruyor, bağlantı gelince tekrar deneyin.'}; }
  else if(r._http===401||r._http===403||r.code==='auth'||r.code==='csrf'){ E.needLogin=true; ui.apiCsrf=null; E.msg[svc]={c:'warn',t:'Oturumunuz kapandı. Yukarıdan API şifrenizle tekrar giriş yapın; yazdıklarınız silinmedi.'}; }
  else E.msg[svc]={c:'bad',t:r.error||r.msg||def};
  render(); }
async function entSaveSvc(svc){ const E=entS(); if(!entCanSvc(svc)){ toast('Bu işlem için yetkiniz yok.',true); return false; }
  const V=entVals(svc); const bad=entCheck(svc,V); if(bad){ E.msg[svc]={c:'bad',t:bad}; render(); return false; }
  if(svc==='paytr'){ const P=S.paytr||(S.paytr={}); P.test=!!V.test_mode; P.maxInst=+V.max_installment||0; P.okUrl=V.ok_url; P.failUrl=V.fail_url; save(); }
  if(E.st!=='ready'){ const f=document.getElementById('ent_'+svc); if(f) delete f.dataset.dirty;
    E.msg[svc]={c:'warn',t:(E.st==='offline'||E.st==='error')?'Önizleme modu: sunucu bağlı olmadığı için kaydedilmedi. Gizli bilgiler (anahtar, şifre) bu tarayıcıya yazılmadı; paketi yükleyip kurulumu tamamladıktan sonra burada tekrar girin.'+(svc==='paytr'?' Taksit, test modu ve sayfa adresleri bu tarayıcıda hatırlandı.':''):'Önce 2. adımı (kurulum ve giriş) tamamlayın.'}; render(); return false; }
  if(E.needLogin||!ui.apiCsrf){ E.needLogin=true; E.msg[svc]={c:'warn',t:'Kaydetmek için yukarıdan API şifrenizle giriş yapın; yazdıklarınız silinmedi.'}; render(); setTimeout(()=>{ const i=$('#ent_lpw'); if(i) i.focus(); },0); return false; }
  entBusy(svc,'save','Kaydediliyor…');
  const r=await api('ayarlar.php',{method:'POST',body:{service:svc,values:V}});
  if(!r.ok){ entFail(svc,r,'Kaydedilemedi.'); return false; }
  const A=E.ayar||(E.ayar={services:{},urls:{}}); A.services=A.services||{}; A.services[svc]=Object.assign({},A.services[svc]||{},r.masked||{});
  const d=await api('durum.php'); if(d.ok) E.durum=d; else { const D=E.durum||(E.durum={}); D.services=D.services||{}; D.services[svc]=Object.assign({},D.services[svc]||{},{configured:true,last_test:null}); }
  E.msg[svc]={c:'ok',t:'Kaydedildi. Şimdi “Bağlantıyı test et” ile deneyin.'}; (ui.entFresh=ui.entFresh||new Set()).add('ent_'+svc); const f=document.getElementById('ent_'+svc); if(f) delete f.dataset.dirty;
  render(); return true; }
async function entTest(svc){ const E=entS(); if(!entCanSvc(svc)) return toast('Bu işlem için yetkiniz yok.',true);
  if(E.st!=='ready'){ E.msg[svc]={c:'warn',t:(E.st==='offline'||E.st==='error')?'Önizleme modu: bağlantı testi için sunucu gerekli. Önce 1. adımla paketi yükleyin.':'Önce 2. adımı (kurulum ve giriş) tamamlayın.'}; return render(); }
  if(E.needLogin||!ui.apiCsrf){ E.needLogin=true; E.msg[svc]={c:'warn',t:'Test için yukarıdan API şifrenizle giriş yapın.'}; return render(); }
  const f=document.getElementById('ent_'+svc); if(f&&f.dataset.dirty){ const ok=await entSaveSvc(svc); if(!ok) return; }
  entBusy(svc,'test','Test ediliyor…');
  const r=await api('test.php',{method:'POST',body:{service:svc}});
  if(r.offline||r._http===401||r._http===403||r.code==='auth'||r.code==='csrf') return entFail(svc,r,'');
  const ok=!!r.ok, m=String(r.msg||r.error||(ok?'Bağlantı çalışıyor.':'Servis yanıt vermedi.'));
  const D=E.durum||(E.durum={}); D.services=D.services||{}; const s=D.services[svc]=Object.assign({},D.services[svc]||{}); s.last_test={ok,t:now(),msg:m}; if(ok) s.configured=true;
  E.msg[svc]={c:ok?'ok':'bad',t:(ok?'Bağlantı başarılı: ':'Bağlantı kurulamadı: ')+m}; render(); }
async function entSetup(){ const E=entS(); if(!(me()&&me().admin)) return toast('Kurulumu yalnız yönetici yapabilir.',true);
  const pw=v_('ent_pw'), pw2=v_('ent_pw2'), site=v_('ent_site').trim().replace(/\/+$/,'');
  const err=pw.length<10?'Şifre en az 10 karakter olmalı.':pw!==pw2?'İki şifre birbirini tutmuyor.':!/^https?:\/\/[^\s"'<>\/]+/i.test(site)?'Site adresi https:// ile başlamalı (örn: https://www.yangpazar.com).':'';
  if(err){ E.msg.setup={c:'bad',t:err}; return render(); }
  const b=$('#ent_setup .ent-submit'); if(b){ b.disabled=true; b.innerHTML='<span class="spin"></span>Kuruluyor…'; }
  const r=await api('kurulum.php',{method:'POST',body:{password:pw,site_url:site,install_code:S.set.apiInstallCode||''}});
  if(!r.ok){ if(r.offline){ E.st='offline'; E.why=r.code; E.err=r.error||''; }
    E.msg.setup=r.code==='bad_install_code'?{c:'bad',dl:1,t:'Bu sunucudaki paket, bu panelden indirilen paketle eşleşmiyor. Paketi buradan tekrar indirip yükleyin.'}:{c:'bad',t:r.error||'Kurulum tamamlanamadı.'}; return render(); }
  delete S.set.apiInstallCode; save(); ui.apiCsrf=r.csrf||null; E.msg.setup=null; E.needLogin=false; (ui.entFresh=ui.entFresh||new Set()).add('ent_setup'); toast('Kurulum tamamlandı. Şimdi bağlantı bilgilerini girin.'); entReload(); }
async function entLogin(){ const E=entS(); const pw=v_('ent_lpw'); if(!pw){ E.msg.login={c:'bad',t:'API şifrenizi yazın.'}; return render(); }
  const b=$('#ent_login .ent-submit'); if(b){ b.disabled=true; b.innerHTML='<span class="spin"></span>Giriş yapılıyor…'; }
  const r=await api('giris.php',{method:'POST',body:{password:pw}}); (ui.entFresh=ui.entFresh||new Set()).add('ent_login');
  if(!r.ok){ if(r.offline){ E.st='offline'; E.why=r.code; E.err=r.error||''; } E.msg.login={c:'bad',t:r.error||'Şifre hatalı.'}; return render(); }
  ui.apiCsrf=r.csrf||null; E.msg.login=null; E.needLogin=!ui.apiCsrf; toast('Giriş yapıldı.');
  if(E.st==='ready'&&E.ayar){ render(); return; } E.st='loading'; render(); await entAyar(); render(); }
async function entLogout(){ const E=entS(); await api('cikis.php',{method:'POST',body:{}}); ui.apiCsrf=null; E.ayar=null; E.msg={}; if(E.st==='ready') E.st='login'; toast('API oturumu kapatıldı.'); render(); }
function entBaseSave(){ if(!(me()&&me().admin)) return toast('API adresini yalnız yönetici değiştirebilir.',true); let v=v_('ent_base').trim()||'/api/';
  if(!/^(\/[^\s"'<>]*|https?:\/\/[^\s"'<>]+)$/i.test(v)) return toast('Adres / ile ya da https:// ile başlamalı.',true); if(!v.endsWith('/')) v+='/';
  S.set.apiBase=v; save(); ui.apiCsrf=null; ui.ent=null; toast('API adresi kaydedildi; bağlantı yeniden kontrol ediliyor.'); entReload(); }
/* --- sayfa --- */
function entField(svc,x,SVv,def){ const id=`ent_${svc}_${x.k}`; const val=k=>SVv[k]!=null&&SVv[k]!==''?SVv[k]:(def[k]!=null?def[k]:'');
  if(x.t==='chk'){ const v=val(x.k); return `<label class="chk full" for="${id}"><input type="checkbox" id="${id}" ${v===true||v===1||v==='1'?'checked':''}> ${esc(x.l)}</label>`; }
  if(x.t==='inst') return `<div class="fld"><label for="${id}">${esc(x.l)}</label><select class="inp" id="${id}">${[0,1,2,3,6,9,12].map(n=>`<option value="${n}" ${+val(x.k)===n?'selected':''}>${n===0?'PayTR varsayılanı':n===1?'Taksit yok (tek çekim)':n+' taksit'}</option>`).join('')}</select></div>`;
  if(x.sec){ const m=SVv[x.k], has=m!=null&&m!==''; return `<div class="fld"><label for="${id}">${esc(x.l)}</label><div class="ent-sec"><input class="inp mono" type="${x.mask?'text':'password'}" id="${id}" autocomplete="${x.mask?'off':'new-password'}" spellcheck="false" autocapitalize="off" data-secret="1" placeholder="${esc(has?'Kayıtlı: '+m:(x.ph||'Buraya yapıştırın'))}">${x.mask?'':`<button type="button" class="btn btn-sm" data-act="ent-eye" data-id="${id}" aria-pressed="false" aria-label="${esc(x.l)}: göster">Göster</button>`}</div>${has?'<span class="ent-hint">Kayıtlı değer korunur; değiştirmeyecekseniz boş bırakın.</span>':''}</div>`; }
  return `<div class="fld ${x.t==='url'?'full':''}"><label for="${id}">${esc(x.l)}</label><input class="inp ${x.t==='url'?'mono':''}" type="text" ${x.t==='url'?'inputmode="url"':x.t==='email'?'inputmode="email"':''} id="${id}" value="${esc(val(x.k))}" ${x.ph?`placeholder="${esc(x.ph)}"`:''} autocomplete="off" spellcheck="false"></div>`; }
function entCard(svc){ const E=entS(), C=ENT_SVC[svc]; const SVv=((E.ayar||{}).services||{})[svc]||{}; const ed=entCanSvc(svc); const P=S.paytr||{};
  const def=svc==='paytr'?{test_mode:P.test!==false,max_installment:+P.maxInst||0,ok_url:P.okUrl||siteBase()+'/?odeme=basarili',fail_url:P.failUrl||siteBase()+'/?odeme=hata'}:{};
  const lt=(((E.durum||{}).services||{})[svc]||{}).last_test; const ltT=lt&&entTime(lt.t); const m=E.msg[svc];
  return `<form class="panel entc" id="ent_${svc}" data-form="entsave" data-svc="${svc}" autocomplete="off" novalidate>
    <div class="panel-h"><div><h3>${esc(C.n)}</h3><span class="muted">${esc(C.d)}</span></div>${entBadge(svc)}</div>
    <fieldset class="panel-b stack" ${ed?'':'disabled'}><legend class="vh">${esc(C.n)} bağlantı bilgileri</legend>
      ${ed?'':`<div class="note note-info">Bu kartı görebilirsiniz; değiştirmek için ${C.p==='odeme'?'“Ödemeler”':'“Muhasebe”'} yetkisi gerekir.</div>`}
      <div class="ent-where">${C.w}</div>
      <div class="ent-g">${C.f.map(x=>entField(svc,x,SVv,def)).join('')}</div>
      ${lt?`<div class="ent-last ${lt.ok?'ok':'bad'}">Son test${ltT?' · '+dtstr(ltT):''}: <b>${lt.ok?'başarılı':'başarısız'}</b>${lt.msg?' — '+esc(lt.msg):''}</div>`:''}
      ${m?`<div class="note note-${m.c==='ok'?'ok':m.c==='bad'?'bad':'warn'} ent-msg" role="status" aria-live="polite">${esc(m.t)}</div>`:''}
    </fieldset>
    ${ed?aSave('Kaydet',`<button type="button" class="btn" data-act="ent-test" data-svc="${svc}">Bağlantıyı test et</button>`):''}
  </form>`; }
function entUrlBox(url,o){ o=o||{}; return `<div class="ent-url"><code${o.id?` id="${o.id}"`:''}>${esc(url)}</code>${o.copy===false?'':`<button type="button" class="cpy big" data-act="copy" data-v="${esc(url)}" aria-label="${esc(o.lbl||'Adresi kopyala')}">Kopyala</button>`}</div>${o.note?`<span class="ent-hint">${o.note}</span>`:''}`; }
function vEnt(){ const E=entEnsure(), st=E.st, D=E.durum||{}, A=E.ayar||{}, adm=!!(me()&&me().admin);
  const load=st==='idle'||st==='loading', off=st==='offline'||st==='error', live=st==='setup'||st==='login'||st==='ready', ready=st==='ready', authed=ready&&!E.needLogin;
  const urls=Object.assign({},D.urls||{},A.urls||{}); const SVd=D.services||{};
  const tested=!!D.installed&&ENT_ORDER.some(k=>SVd[k]&&SVd[k].last_test&&SVd[k].last_test.ok);
  const done=[live,!!D.installed&&authed,tested], cur=done.indexOf(false);
  const PR=[['Paketi yükle','ent_s1'],['Kurulum ve giriş','ent_s2'],['Bilgileri gir, test et','ent_s3'],['PayTR bildirim adresi','ent_s4'],['Otomatik hakediş','ent_s5']];
  const prog=`<ol class="ent-prog" aria-label="Kurulum adımları">${PR.map(([l,to],i)=>{ const ok=i<3&&done[i], c=ok?'ok':i===cur?'cur':''; return `<li class="${c}"><button type="button" data-act="adm-scroll" data-to="${to}"${i===cur?' aria-current="step"':''}><i>${ok?'✓':i+1}</i>${esc(l)}</button></li>`; }).join('')}</ol>`;
  const WHY={preview:'Bu sayfa şu an önizlemede açık; sunucu dosyaları burada çalışmaz.',network:'Sunucuya ulaşılamadı.',timeout:'Sunucu 8 saniye içinde yanıt vermedi.',missing:'Sitenizde /api/ klasörü bulunamadı; paket henüz yüklenmemiş görünüyor.'};
  const ban=off?(st==='error'?`<div class="note note-bad ent-ban" role="status"><b>Sunucu yanıt verdi ama bir sorun bildirdi</b><span>${esc(E.err)}</span><span><button type="button" class="btn btn-sm" data-act="ent-retry">Yeniden dene</button></span></div>`
    :`<div class="note note-warn ent-ban" role="status"><b>Önizleme modu — sunucu bağlı değil</b><span>${esc(WHY[E.why]||E.err||WHY.network)} Alanları doldurup deneyebilirsiniz, ama gizli bilgiler (anahtar, şifre) bu tarayıcıya kaydedilmez.</span><span>Önce aşağıdaki <b>1. adımla</b> paketi indirip hostinginize yükleyin. <button type="button" class="btn btn-sm" data-act="ent-retry">Yeniden dene</button></span></div>`):'';
  const step=(n,cls,title,badge,desc,body)=>`<section class="ent-step ${cls}" id="ent_s${n}" aria-labelledby="ent_s${n}_h"><div class="ent-num" aria-hidden="true">${/\bok\b/.test(cls)?'✓':n}</div><div class="panel panel-b stack"><div class="ent-h"><div><h2 id="ent_s${n}_h">${n}. ${title}</h2>${desc?`<p>${desc}</p>`:''}</div>${badge||''}</div>${body}</div></section>`;
  const bdg=(c,l)=>`<span class="ebadge ${c}">${esc(l)}</span>`;
  /* 1 · paket */
  const s1=step(1,live?'ok':off?'hi':'','Paketi indirin ve hostinginize yükleyin',live?bdg('ok','Sunucu bağlı ✓'):load?bdg('off','Kontrol ediliyor…'):bdg('warn','Sunucu bulunamadı'),'Hiçbir dosyayı düzenlemenize gerek yok; paketi olduğu gibi yüklemeniz yeterli.',
    `<ol class="ent-ol"><li>Aşağıdaki düğmeyle <b>yangpazar-api.zip</b> dosyasını indirin.</li><li>Hosting panelinize girin: <b>cPanel › Dosya Yöneticisi › public_html</b> klasörünü açıp <b>Yükle</b> deyin.</li><li>Yüklenen zip’e sağ tıklayıp <b>Ayıkla</b> deyin; <b>api</b> adında bir klasör oluşur. Bu kadar.</li></ol>
    <div class="hstack"><button type="button" class="btn ${live?'':'btn-primary'}" data-act="muhasebe-zip-dl">Paketi indir (yangpazar-api.zip)</button><button type="button" class="btn" data-act="ent-retry">Yükledim, kontrol et</button><button type="button" class="btn btn-sm" data-act="muhasebe-kit">Pakette neler var?</button></div>
    ${live?`<div class="ent-facts">PHP ${esc(D.php||'?')} · ${D.curl===false?'<b class="neg">cURL kapalı</b>':'cURL açık'} · Şifreleme: ${esc(D.crypto||'?')}${D.version?' · Paket sürümü '+esc(D.version):''}</div>${D.curl===false?'<div class="note note-bad">Hostinginizde cURL kapalı; PayTR ve muhasebe bağlantısı çalışmaz. Hosting firmanızdan “PHP cURL eklentisini açar mısınız?” diye isteyin.</div>':''}`:''}`);
  /* 2 · kurulum / giriş */
  const msgN=k=>{ const m=E.msg[k]; return m?`<div class="note note-${m.c==='ok'?'ok':m.c==='bad'?'bad':'warn'}" role="status" aria-live="polite">${esc(m.t)}${m.dl?' <button type="button" class="btn btn-sm btn-primary" data-act="muhasebe-zip-dl">Paketi tekrar indir</button>':''}</div>`:''; };
  const loginF=(t)=>`<form class="stack" data-form="entlogin" id="ent_login" autocomplete="off" novalidate>${t?`<p class="ent-hint">${t}</p>`:''}<div class="ent-g"><div class="fld"><label for="ent_lpw">Panel API şifresi</label><input class="inp" type="password" id="ent_lpw" autocomplete="current-password"></div><div class="fld ent-end"><button class="btn btn-primary ent-submit">Giriş yap</button></div></div>${msgN('login')}<span class="ent-hint">Kurulumda belirlediğiniz şifre (sitenin yönetici şifresinden ayrıdır). Unuttuysanız: hosting dosya yöneticisinde <b>api/data</b> klasörünü silip bu adımı yeniden yapabilirsiniz; kayıtlı bağlantı bilgileri de silinir.</span></form>`;
  const siteDef=/^https?:$/.test(location.protocol)?location.origin:siteBase();
  let b2;
  if(load) b2='<div class="ent-skel"><span class="spin"></span>Sunucu kontrol ediliyor…</div>';
  else if(off) b2='<p class="muted" style="margin:0">Paket yüklenince burada tek seferlik kurulum açılır: yalnızca bu sayfa için bir şifre belirlersiniz, o kadar.</p>';
  else if(st==='setup') b2=adm?`<form class="stack" data-form="entsetup" id="ent_setup" autocomplete="off" novalidate><p class="ent-hint">Bu şifre yalnız Entegrasyonlar sayfası içindir. En az 10 karakter olsun ve bir yere not edin.</p>
      <div class="ent-g"><div class="fld"><label for="ent_pw">Panel API şifresi</label><input class="inp" type="password" id="ent_pw" autocomplete="new-password" minlength="10"></div><div class="fld"><label for="ent_pw2">Şifre (tekrar)</label><input class="inp" type="password" id="ent_pw2" autocomplete="new-password"></div>
      <div class="fld full"><label for="ent_site">Site adresi</label><input class="inp mono" type="text" inputmode="url" id="ent_site" value="${esc(siteDef)}" spellcheck="false"></div></div>${msgN('setup')}
      <div class="hstack"><button class="btn btn-primary ent-big ent-submit">Kurulumu tamamla</button></div></form>`
    :'<div class="note note-info">Kurulumu yalnız site sahibi (yönetici hesabı) yapabilir. Yöneticiden bu adımı tamamlamasını isteyin; sonra buradan giriş yapabilirsiniz.</div>';
  else if(st==='login') b2=loginF('Kurulum tamam. Devam etmek için panel API şifrenizi girin.');
  else b2=E.needLogin?loginF('Kayıtlı bilgiler aşağıda. Değişiklik yapmak ve test etmek için panel API şifrenizi girin.'):`<div class="hstack" style="justify-content:space-between"><span>Kurulum tamam, oturum açık. Bilgiler sunucunuzda şifreli saklanıyor.</span><button type="button" class="btn btn-sm" data-act="ent-logout">Çıkış yap</button></div>`;
  const s2=step(2,done[1]?'ok':(cur===1&&live)?'hi':off||load?'lock':'','Kurulumu tamamlayın ve giriş yapın',done[1]?bdg('ok','Giriş yapıldı ✓'):st==='setup'?bdg('warn','Kurulum bekliyor'):(st==='login'||ready)?bdg('warn','Şifre gerekli'):bdg('off','Paket bekleniyor'),'',b2);
  /* 3 · servis kartları */
  const b3=load?'<div class="ent-skel"><span class="spin"></span>Yükleniyor…</div>':(off||ready)?`<div class="ent-cards">${ENT_ORDER.map(entCard).join('')}</div>`:'<p class="muted" style="margin:0">2. adım tamamlanınca PayTR, Paraşüt ve Bizim Hesap kartları burada açılır.</p>';
  const s3=step(3,done[2]?'ok':(cur===2&&ready)?'hi':(st==='setup'||st==='login')?'lock':'','Bağlantı bilgilerini girin ve test edin',tested?bdg('ok','En az bir servis bağlı ✓'):'',
    'Bilgileri yapıştırıp <b>Kaydet</b>’e, sonra <b>Bağlantıyı test et</b>’e basın. Gizli bilgiler yalnız sunucunuzda şifreli saklanır; bu sayfa kayıtlı değerin yalnızca son birkaç hanesini gösterir.',b3);
  /* 4 · PayTR bildirim adresi */
  const nUrl=urls.paytr_bildirim||entAbs('paytr_bildirim.php');
  const s4=step(4,'','PayTR panelinde yapman gereken tek şey','',
    '<b>Bildirim URL</b>, PayTR’ın her ödemenin sonucunu sitenize haber verdiği adrestir; bu sayede üyenin bakiyesi kendiliğinden yüklenir.',
    `${entUrlBox(nUrl,{id:'ent_nurl',lbl:'Bildirim URL’sini kopyala',note:urls.paytr_bildirim?'':'Örnek adres; sunucu bağlanınca kesin adres burada görünür.'})}
    <ol class="ent-ol"><li><b>PayTR Mağaza Paneli</b>’ne giriş yapın.</li><li><b>Destek &amp; Kurulum › Ayarlar › Bildirim URL</b> bölümünü açın.</li><li>Kopyaladığınız adresi yapıştırıp <b>Kaydet</b>’e basın.</li></ol>`);
  /* 5 · cron */
  const cFull=urls.cron_hakedis, cMask=urls.cron_hakedis_masked;
  const cBox=cFull?entUrlBox(cFull,{id:'ent_curl',lbl:'Cron adresini kopyala',note:'Bu adres gizli bir anahtar içerir; kimseyle paylaşmayın.'})
    :cMask?entUrlBox(cMask,{id:'ent_curl',copy:false,note:'Tam adres (gizli anahtarıyla) 2. adımda giriş yapınca görünür ve kopyalanabilir.'})
    :entUrlBox(entAbs('paytr_hakedis.php?key=…'),{id:'ent_curl',copy:false,note:'Örnek adres; kurulumdan sonra gizli anahtarıyla birlikte burada görünür.'});
  const s5=step(5,'','Otomatik hakediş (cron)','',
    '<b>Cron</b>, bir internet adresini belirlediğiniz aralıkla sizin yerinize otomatik açan zamanlayıcıdır; bu adres her saat açıldığında PayTR’dan gelen paralar muhasebeye kendiliğinden işlenir.',
    `${cBox}<ol class="ent-ol"><li><b>cron-job.org</b>’da ücretsiz hesap açın (ya da hostinginizde <b>cPanel › Cron Jobs</b>).</li><li><b>Create cronjob</b> deyin ve adresi URL alanına yapıştırın.</li><li>Bu adresi cron-job.org'da her saat başı çalışacak şekilde ekleyin (<b>Every hour</b>) ve kaydedin.</li></ol>`);
  /* gelişmiş */
  const adv=`<details class="panel ent-adv"><summary>Gelişmiş: API adresi</summary><form class="panel-b stack" data-form="entbase" id="ent_basef" novalidate><span class="ent-hint">Varsayılan <b class="mono">/api/</b> (aynı site). Yalnız paketi başka bir klasöre yüklediyseniz değiştirin.${adm?'':' Bu ayarı yalnız yönetici değiştirebilir.'}</span>
    <div class="ent-g"><div class="fld"><label for="ent_base">API adresi</label><input class="inp mono" id="ent_base" value="${esc(S.set.apiBase||'/api/')}" spellcheck="false" ${adm?'':'disabled'}></div>${adm?'<div class="fld ent-end"><button class="btn">Adresi kaydet</button></div>':''}</div></form></details>`;
  return `<div id="entRoot" class="stack ent">${ban}${prog}${s1}${s2}${s3}${s4}${s5}${adv}</div>`; }
function entActions(){ const E=entS(), st=E.st; const [c,l]=st==='ready'?['','Sunucu bağlı']:st==='setup'?['off','Kurulum bekliyor']:st==='login'?['','Sunucu bağlı · giriş bekliyor']:(st==='idle'||st==='loading')?['off','Kontrol ediliyor…']:['off','Önizleme modu'];
  return `<span class="state ${c}"><i></i>${esc(l)}</span><button type="button" class="btn btn-sm" data-act="ent-retry">Yenile</button>`; }
/* Bugün kartı (yalnız yönetici): sunucu yoksa ya da kurulum yapılmadıysa */
function entTodayCard(){ const u=me(); if(!(u&&u.admin)) return ''; const E=entEnsure();
  if(E.st!=='offline'&&E.st!=='setup'&&E.st!=='error') return '<span data-entw hidden></span>';
  return `<a class="panel panel-b entnote" href="#yonetim/entegrasyon" data-entw><span class="ebadge warn">Entegrasyon kurulmadı</span><span class="entnote-t">PayTR, Paraşüt ve Bizim Hesap henüz bağlı değil. Kurulum birkaç adım sürer; hiçbir dosya düzenlemeniz gerekmez.</span><b>Kuruluma başla →</b></a>`; }

