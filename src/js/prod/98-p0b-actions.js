/* ================== P0b: sunucuya bağlı işleyiciler (yalnız --prod derlemesinde) ==================
   99-wiring'deki ADM_* yetki sarmalayıcılarından SONRA yüklenir; aynı yetki kontrolü burada yeniden uygulanır
   (asıl kontrol sunucuda). Diğer (henüz sunucuya taşınmamış) işleyiciler yakında ekranlarının arkasında kalır.        */
if(YP_PROD){
const pPerm = (map,k) => { const p=map[k]; return !p||admOk(p); };
const pA = (k,fn) => { ACT[k]=(d,e)=>{ if(!pPerm(ADM_ACT,k)) return toast('Bu işlem için yetkiniz yok.',true); const el=e&&e.target&&e.target.closest?e.target.closest('[data-act]'):null; return apiBusy(el,fn(d,e,el)); }; };
const pF = (k,fn) => { FORM[k]=(f)=>{ if(!pPerm(ADM_FORM,k)) return toast('Bu işlem için yetkiniz yok.',true); return apiBusy(f,fn(f)); }; };
const pAfterAuth = async (j) => { if(j&&j.data&&j.data.csrf) API.csrf=j.data.csrf; P_TFA=null; clearInterval(P_TFAT); try{ localStorage.removeItem('yangpazar_ref'); }catch(e){}
  await apiReboot(true).catch(()=>{ if(j&&j.data&&j.data.me) apiSetMe(j.data.me); });
  closeModal(); ui.tab='ozet'; const u=me(); if(u&&u.admin&&!isAdmRoute(route())) go('yonetim'); else render(); };

/* ---- giriş, üyelik, 2FA, çıkış ---- */
pF('loginf',async()=>{ const login=v_('lg_u').trim(), password=v_('lg_p');
  try{ const j=await call('POST','auth/login',{login,password,remember:true},{quiet:true,silent:true});
    if(j.tfa){ j.tfa.purpose='login'; return pTfa(j.tfa); }
    toast(j.msg||'Hoş geldiniz!'); await pAfterAuth(j); }
  catch(e){ mLogin(apiErr(e)); const i=$('#lg_u'); if(i) i.value=login; } });
pF('registerf',async()=>{ const b={name:v_('rg_u').trim(),email:v_('rg_e').trim(),tel:v_('rg_t').trim(),ad:v_('rg_ad').trim(),soyad:v_('rg_sy').trim(),password:v_('rg_p'),ref:(v_('rg_ref').trim()||P_REF()).toUpperCase(),remember:true};
  const keep=()=>{ [['rg_u',b.name],['rg_e',b.email],['rg_t',b.tel],['rg_ad',b.ad],['rg_sy',b.soyad]].forEach(([id,v])=>{ const i=$('#'+id); if(i) i.value=v; }); const r=$('#rg_ref'); if(r) r.value=b.ref||''; const k=$('#rg_k'); if(k) k.checked=true; };
  if(!b.ref) delete b.ref;
  try{ const j=await call('POST','auth/register',b,{quiet:true,silent:true}); toast(j.msg||'Hoş geldiniz!'); try{ track('uye',{method:'site'}); }catch(x){} await pAfterAuth(j); }
  catch(e){ mRegister(apiErr(e)); keep(); } });
pF('tfaf',async()=>{ const T=P_TFA; if(!T) return closeModal(); const code=v_('tf_code').replace(/\D/g,'');
  try{ const j=await call('POST','auth/tfa/verify',{id:T.id,code},{quiet:true,silent:true}); toast(j.msg||'Doğrulandı.');
    if(T.purpose==='login') return pAfterAuth(j);
    P_TFA=null; clearInterval(P_TFAT); closeModal(); render(); }
  catch(e){ if(e&&e.code==='tfa_gone'){ P_TFA=null; closeModal(); return toast(apiErr(e),true); } pTfa(null,apiErr(e)); } });
const pResend = (path) => async()=>{ const T=P_TFA; if(!T) return; try{ const j=await call('POST',path,{id:T.id},{silent:true}); const t=Object.assign({purpose:T.purpose},j.tfa); pTfa(t); toast(j.msg||'Yeni kod gönderildi.'); }catch(e){ if(e&&e.code==='tfa_gone'){ P_TFA=null; closeModal(); } } };
pA('tfa-resend',pResend('auth/tfa/resend'));
pA('tfa-switch',pResend('auth/tfa/switch'));
pA('logout',async()=>{ try{ const j=await call('POST','auth/logout',null,{silent:true}); if(j.data&&j.data.csrf) API.csrf=j.data.csrf; }catch(e){ return; }
  apiPollStop(); S.users=S.users.filter(u=>u.id!==S.cur); S.cur=null; S.notifs=[]; API.cache={}; ui.tab='ozet'; closeModal(); toast('Çıkış yapıldı.'); go('home'); });

/* ---- Hesabım ---- */
pF('profile',async(f)=>{ const u=me(); if(!u) return; const b={tel:v_('pf_tel').trim(),email:v_('pf_mail').trim()};
  if(!tcOk(u)){ b.ad=v_('pf_ad').trim(); b.soyad=v_('pf_soyad').trim(); }
  const np=v_('pf_pass'); if(np) b.password=np; const cur=v_('pf_cur'); if(cur) b.current_password=cur;
  await call('PUT','me/profile',b,{key:formKey(f)}); render(); });
pA('tfa-save',async()=>{ const u=me(); const v=(document.querySelector('input[name=tfa]:checked')||{}).value||''; if(v===(u.tfa||'')) return toast('Değişiklik yok.');
  if(v==='sms'&&!u.tel) return toast('Önce profilinize telefon ekleyin.',true); if(v==='mail'&&!u.email) return toast('Önce profilinize e-posta ekleyin.',true);
  const j=await call('POST','me/tfa',{tfa:v},{silent:true}); pTfa(Object.assign({purpose:v?'enable':'disable'},j.tfa)); });
pF('ibanadd',async(f)=>{ await call('POST','me/ibans',{bank:v_('ia_b'),name:v_('ia_n').trim(),iban:v_('ia_i').replace(/\s/g,'').toUpperCase()},{key:formKey(f)}); render(); });
pA('iban-del',async(d)=>{ await call('DELETE','me/ibans/'+encodeURIComponent(d.id)); render(); });
ACT.deposit=()=>toast('Bakiye yükleme çok yakında açılıyor.');

/* ---- bildirimler ---- */
ACT['n-open']=(d)=>{ const n=S.notifs.find(x=>x.id===d.id); if(n&&!n.read){ n.read=true; call('POST','me/notifications/'+encodeURIComponent(d.id)+'/read',null,{quiet:true,silent:true}).catch(()=>{}); renderHeader(); }
  if(route()==='bildirimler') setTimeout(()=>{ if(route()==='bildirimler') render(); },0); };
pA('n-readall',async()=>{ await call('POST','me/notifications/read-all'); const u=me(); S.notifs.forEach(n=>{ if(n.u===u.id) n.read=true; }); render(); });
pA('n-delread',async(d,e,b)=>{ if(b&&!b.dataset.ok){ b.dataset.ok=1; b.textContent='Emin misiniz? Tekrar basın'; setTimeout(()=>{ if(b.isConnected) render(); },4000); return; }
  await call('DELETE','me/notifications/read'); const u=me(); S.notifs=S.notifs.filter(n=>!(n.u===u.id&&n.read)); render(); });

/* ---- Yönetim: çalışanlar ---- */
const pPerms = pre => Object.keys(PERMS).filter(k=>{ const c=$('#'+pre+k); return c&&c.checked; });
pF('staffadd',async(f)=>{ const perms=pPerms('sa_pm_'); const ex=v_('sa_ex');
  const b=ex?{existing:ex,perms}:{name:v_('sa_u').trim(),ad:v_('sa_ad').trim(),soyad:v_('sa_sy').trim(),tel:v_('sa_t').trim(),email:v_('sa_e').trim(),password:v_('sa_p'),perms};
  const j=await call('POST','admin/staff',b,{key:formKey(f)}); apiUpsertUser(j.data.user); needDrop('adm:staff','adm:users','adm:today'); admDirtyClear(); admGo('calisan','liste'); });
pF('staffperm',async(f)=>{ const id=f.dataset.id; const j=await call('PUT','admin/staff/'+encodeURIComponent(id),{perms:pPerms('pm_'+id+'_')}); apiUpsertUser(j.data.user); needDrop('adm:staff'); admDirtyClear(); render(); });
pA('staff-del',async(d)=>{ await call('DELETE','admin/staff/'+encodeURIComponent(d.id)); const u=S.users.find(x=>x.id===d.id); if(u){ u.staff=false; u.perms=[]; } needDrop('adm:staff','adm:users','adm:today'); render(); });
/* ---- Yönetim: üyeler ---- */
ACT['user-open']=(d)=>{ if(!can('uye')) return toast('Bu işlem için yetkiniz yok.',true); mUser(d.id); };
pA('u-ver',async(d)=>{ const j=await call('POST','admin/users/'+encodeURIComponent(d.id)+'/verify'); apiUpsertUser(j.data.user); closeModal(); render(); });
pA('u-ban',async(d)=>{ const j=await call('POST','admin/users/'+encodeURIComponent(d.id)+'/ban'); apiUpsertUser(j.data.user); needDrop('adm:today'); closeModal(); render(); });
/* ---- Yönetim: e-posta & SMS ---- */
CHG.pmprov=(el)=>{ const f=el.closest('form'); if(!f) return; f.querySelectorAll('[data-prov]').forEach(g=>{ g.hidden=g.dataset.prov!==el.value; }); };
const pIfSet = (b,k,id) => { const v=v_(id); if(v!=='') b[k]=v; };
pF('mailset',async(f)=>{ const b={on:$('#ml_on').checked,provider:v_('ml_pv'),fromName:v_('ml_fn').trim(),from:v_('ml_fr').trim(),hourly:+v_('ml_hr')||80,fallback:$('#ml_fb').checked,
    smtp_host:v_('ml_h').trim(),smtp_port:+v_('ml_p')||587,smtp_sec:v_('ml_sc'),smtp_user:v_('ml_u').trim()};
  pIfSet(b,'brevo_key','ml_bk'); pIfSet(b,'mailjet_key','ml_mk'); pIfSet(b,'mailjet_secret','ml_ms'); pIfSet(b,'smtp_pass','ml_pw');
  await call('PUT','admin/settings/mail',b,{key:formKey(f)}); needDrop('adm:mail'); admDirtyClear(); render(); });
pF('smsset',async(f)=>{ const b={on:$('#sm_on').checked,provider:v_('sm_p')||'netgsm',header:v_('sm_h').trim(),user:v_('sm_u').trim(),hourly:+v_('sm_hr')||60}; pIfSet(b,'pass','sm_pw');
  await call('PUT','admin/settings/sms',b,{key:formKey(f)}); needDrop('adm:mail'); admDirtyClear(); render(); });
pF('tfatrust',async(f)=>{ const n=Math.round(+v_('tt_min')); if(!(n>=0&&n<=43200)){ toast('0 ile 43200 dakika arasında bir sayı yazın.',true); return; }
  await call('PUT','admin/settings/tfa',{trustMin:n},{key:formKey(f)}); needDrop('adm:mail'); render(); });
pF('mailtest',async()=>{ const j=await call('POST','admin/mail/test',{to:v_('mt_to').trim()},{silent:true}); toast(j.msg,!(j.data&&j.data.sent)); needDrop('adm:outbox','adm:mail'); });
pF('smstest',async()=>{ const j=await call('POST','admin/sms/test',{to:v_('st_to').trim()},{silent:true}); toast(j.msg,!(j.data&&j.data.sent)); needDrop('adm:outbox','adm:mail'); });
ACT['p-outbox']=()=>{ needDrop('adm:outbox'); render(); };
ACT['p-reload']=()=>location.reload();
/* demo hesap değiştirme ve demo sıfırlama canlı sitede yok */
ACT.as=()=>toast('Demo hesap girişi canlı sitede kapalı.',true); CHG.switch=()=>{}; ACT.reset=()=>toast('Canlı sitede demo sıfırlama yok.',true);
}
