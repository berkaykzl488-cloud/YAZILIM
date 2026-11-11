/* ================== P0b: sunucu API istemcisi (yalnız --prod derlemesinde) ==================
   window.YP_MODE==='prod' iken (tools/build.php --prod index.php'ye yazar) etkin. Demo / tek dosya derlemesinde bu dosya YOKTUR.
   call(method, path, body, opt):
     - mutasyonlarda X-CSRF-Token ve Idempotency-Key başlıkları
     - yanıt {ok:true,msg?,data?,patch?,tfa?} | {ok:false,error,code,fields?}
     - hata → toast (opt.quiet ile kapatılır) ve Promise reddedilir (j: {ok:false,error,code,fields,http})
     - patch → applyPatch (me, notifs, unread)                                                         */
const YP_PROD = window.YP_MODE === 'prod';
const API = { csrf: '', base: (window.YP_BASE || '/') + 'api/v1/', skew: 0, live: false, poll: null, lastN: 0, idleT: Date.now(), backoff: 0, cache: {}, wait: {} };
function apiKey(){ try{ if(window.crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(e){}
  const b=new Uint8Array(16); try{ crypto.getRandomValues(b); }catch(e){ for(let i=0;i<16;i++) b[i]=Math.floor(Math.random()*256); }
  b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128; const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join(''); return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20); }
const API_MSG = { net:'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', bad:'Sunucudan beklenmeyen bir yanıt geldi. Lütfen tekrar deneyin.' };
/** İlk hata alanını (fields) kullanıcıya gösterilecek metne çevirir. */
const apiErr = j => (j && j.fields && Object.values(j.fields).filter(Boolean)[0]) || (j && j.error) || API_MSG.bad;
async function call(method, path, body, opt){ opt=opt||{};
  const h={Accept:'application/json'};
  if(method!=='GET'){ h['X-CSRF-Token']=API.csrf||''; h['Idempotency-Key']=opt.key||apiKey(); }
  if(body&&!(body instanceof FormData)) h['Content-Type']='application/json';
  let r=null, j=null;
  try{ r=await fetch(API.base+path,{method,headers:h,credentials:'same-origin',cache:'no-store',body:body instanceof FormData?body:(body?JSON.stringify(body):undefined)}); }
  catch(e){ j={ok:false,error:API_MSG.net,code:'network',http:0}; }
  if(r){ try{ j=await r.json(); }catch(e){ j={ok:false,error:API_MSG.bad,code:'bad_json'}; } j.http=r.status; }
  if(j.patch) applyPatch(j.patch);
  if(!j.ok){
    // oturum düştü (yasaklandı, şifre değişti, süresi doldu): yerel oturumu kapat
    if(j.http===401&&j.code==='auth'&&S&&S.cur) apiSignedOut(j.error);
    if(j.code==='csrf'&&!opt.retried&&method!=='GET'){ try{ await apiReboot(true); return await call(method,path,body,Object.assign({},opt,{retried:1})); }catch(e){} }
    if(!opt.quiet) toast(apiErr(j),true);
    throw j;
  }
  if(j.msg&&!opt.silent) toast(j.msg);
  return j;
}
/** Sunucu yanıtındaki güncellenmiş dilimleri S'ye uygular. */
function applyPatch(p){ if(!p||!S) return;
  if(p.me) apiSetMe(p.me);
  if(Array.isArray(p.notifs)) apiMergeNotifs(p.notifs);
  if(p.unread) API.unread=p.unread;
  if(p.upsert) Object.entries(p.upsert).forEach(([k,L])=>{ if(!Array.isArray(S[k])) S[k]=[]; (L||[]).forEach(x=>{ const i=S[k].findIndex(y=>y.id===x.id); if(i<0) S[k].push(x); else S[k][i]=Object.assign(S[k][i],x); }); });
  if(p.remove) Object.entries(p.remove).forEach(([k,ids])=>{ if(Array.isArray(S[k])) S[k]=S[k].filter(x=>!(ids||[]).includes(x.id)); });
  if(p.set) Object.assign(S.set,p.set);
  if(p.replace) Object.assign(S,p.replace);
}
/** Üye kaydını ön yüz şekline getirir (staffUser: tcOk → tc, tfa:boolean korunur). */
function apiUser(x){ const u=Object.assign({},x); if(u.tcOk&&!u.tc) u.tc={ok:true,mask:'',masked:true}; if(u.ibans==null) u.ibans=[]; if(u.bonus==null) u.bonus=0; if(u.bal==null) u.bal=0; if(u.pts==null) u.pts=0; if(u.vol==null) u.vol=0; return u; }
function apiUpsertUser(x){ if(!x||!x.id) return null; const u=apiUser(x); const i=S.users.findIndex(y=>y.id===u.id); if(i<0){ S.users.push(u); return u; }
  // kendi kaydımızın özel alanlarını (ibans, tfa metni) yönetim listesi ezmesin
  if(u.id===S.cur){ delete u.tfa; delete u.ibans; } return Object.assign(S.users[i],u); }
function apiSetMe(m){ if(!m){ S.cur=null; return; } const u=apiUser(m); const i=S.users.findIndex(y=>y.id===u.id); if(i<0) S.users.push(u); else S.users[i]=Object.assign(S.users[i],u); S.cur=u.id; }
function apiMergeNotifs(L){ (L||[]).forEach(n=>{ const i=S.notifs.findIndex(x=>x.id===n.id); if(i<0) S.notifs.push(n); else S.notifs[i]=Object.assign(S.notifs[i],n); const k=+String(n.id).replace(/\D/g,'')||0; if(k>API.lastN) API.lastN=k; });
  S.notifs.sort((a,b)=>(+String(b.id).replace(/\D/g,''))-(+String(a.id).replace(/\D/g,''))); }
/** Açılış verisini (YP_BOOT ya da GET boot) uygular. */
function apiApplyBoot(b){ if(!b) return; API.csrf=b.csrf||API.csrf; if(b.now) API.skew=b.now-Date.now(); API.live=true;
  if(b.set){ API.mailOn=!!b.set.mailOn; API.smsOn=!!b.set.smsOn; Object.assign(S.set,ypSetFrom(b.set)); }
  if(b.permLabels) API.permLabels=b.permLabels;
  S.notifs=[]; API.lastN=0; apiMergeNotifs(b.notifs||[]); API.unread=b.unread||{n:0};
  const keep=S.users.filter(u=>u.id!==S.cur); S.users=keep; S.cur=null; if(b.me) apiSetMe(b.me);
  apiPollStart(); }
async function apiReboot(quiet){ const j=await call('GET','boot',null,{quiet:!!quiet}); API.cache={}; apiApplyBoot(j.data); return j.data; }
/** Sunucu oturumu kapattı (401): yerel oturumu kapat, ziyaretçi olarak devam et. */
function apiSignedOut(msg){ if(!S.cur) return; S.users=S.users.filter(u=>u.id!==S.cur); S.cur=null; S.notifs=[]; API.cache={}; apiPollStop(); closeModal();
  toast(msg||'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.',true); apiReboot(true).catch(()=>{}).then(()=>{ if(isAdmRoute(route())||PRIV_R(route())) go('home'); else render(); }); }

/* ---- tembel dilimler: need(key, loader) → önbellekteki veri ya da null (yüklenince render) ---- */
// ttl (ms): süresi geçen veri gösterilmeye devam eder, arkada yenilenir; değiştiyse yeniden çizilir.
function need(key, loader, ttl){ const c=API.cache[key]; const stale=!c||(ttl!=null&&Date.now()-c.t>ttl);
  if(stale&&!API.wait[key]){ API.wait[key]=Promise.resolve().then(loader).then(v=>({v}),e=>({v:{err:apiErr(e)}})).then(({v})=>{ const old=API.cache[key]; API.cache[key]={v,t:Date.now()};
      delete API.wait[key]; if(!old||JSON.stringify(old.v)!==JSON.stringify(v)) setTimeout(()=>{ if(document.body) render(); },0); }); }
  return c?c.v:null; }
const needDrop = (...keys) => { Object.keys(API.cache).forEach(k=>{ if(keys.some(p=>k===p||k.startsWith(p+':'))) delete API.cache[k]; }); };
const pLoading = (t) => `<div class="panel panel-b"><div class="muted" style="font-size:13px">${esc(t||'Yükleniyor…')}</div></div>`;

/* ---- kısa yoklama: görünürken 8 sn, gizliyken 30 sn; 10 dk hareketsizlikte durur; 429'da geri çekilir ---- */
function apiPollStop(){ clearTimeout(API.poll); API.poll=null; }
function apiPollStart(){ apiPollStop(); if(!S||!S.cur) return; const iv=()=>(document.hidden?30000:8000)+API.backoff;
  const tick=async()=>{ API.poll=null; if(!S.cur) return;
    if(Date.now()-API.idleT<10*60000){
      try{ const j=await call('GET','poll?n='+API.lastN,null,{quiet:true}); API.backoff=0; const before=S.notifs.length; apiMergeNotifs(j.data.notifs||[]); API.unread=j.data.unread||API.unread; if(j.data.now) API.skew=j.data.now-Date.now();
        if(S.notifs.length!==before){ if(route()==='bildirimler'&&!$('.mb')) render(); else renderHeader(); } }
      catch(e){ if(e&&e.http===429) API.backoff=Math.min(120000,(API.backoff||15000)*2); if(e&&e.http===401) return; } }
    if(S.cur&&!API.poll) API.poll=setTimeout(tick,iv()); };
  API.poll=setTimeout(tick,iv()); }
['click','keydown','touchstart','scroll','mousemove'].forEach(ev=>window.addEventListener(ev,()=>{ const was=Date.now()-API.idleT>=10*60000; API.idleT=Date.now(); if(was&&YP_PROD&&S&&S.cur) apiPollStart(); },{passive:true,capture:true}));
document.addEventListener('visibilitychange',()=>{ if(YP_PROD&&S&&S.cur&&!document.hidden) apiPollStart(); });

/** Çift tıklama koruması: işlem sürerken düğme/form kilitli. */
function apiBusy(el, p){ const f=el&&(el.tagName==='FORM'?el:el.closest&&el.closest('form')); const b=el&&el.tagName==='BUTTON'?el:(f?f.querySelector('button:not([type=button])'):null);
  if(b){ if(b.dataset.busy) return Promise.resolve(); b.dataset.busy='1'; b.disabled=true; b.setAttribute('aria-busy','true'); }
  return Promise.resolve(p).catch(()=>{}).finally(()=>{ if(b&&b.isConnected){ delete b.dataset.busy; b.disabled=false; b.removeAttribute('aria-busy'); } }); }
/** Form başına tek istek anahtarı: ağ hatasında tekrar gönderim aynı anahtarla gider. */
const formKey = f => f ? (f.dataset.ikey||(f.dataset.ikey=apiKey())) : apiKey();
