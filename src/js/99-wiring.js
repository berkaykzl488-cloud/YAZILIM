/* ================== güvenlik sertleştirme ================== */
const safeUrl = u => { u=String(u||'').trim(); return /^(https?:\/\/|#|\/(?!\/))/i.test(u) ? u : '#'; };
/* ================== Yönetim paneli: aksiyon, form ve olay bağlantıları ================== */
{ const inAdm=()=>isAdmRoute(route());
  const fset=k=>(d)=>{ if(inAdm()) admSet({f:d.f}); else render(); };
  const cp0=ACT.copy;
  Object.assign(ACT,{
    copy:(d,e)=>{ const b=e&&e.target&&e.target.closest('button'); if(!b) return cp0(d,e); const t0=b.dataset.t0||(b.dataset.t0=b.innerHTML);
      const done=()=>{ b.textContent='✓ Kopyalandı'; if(b.dataset.ck){ (ui.cpd=ui.cpd||{})[b.dataset.ck]=1; } if(b.classList.contains('cpy')) b.classList.add('done'); setTimeout(()=>{ if(b.isConnected) b.innerHTML=t0; },1500); };
      try{ navigator.clipboard.writeText(d.v).then(done,()=>toast(d.v)); }catch(x){ toast(d.v); } },
    atab:(d)=>admGo(d.t,d.s||null),
    'aq-clear':()=>{ if(inAdm()) admSet({q:null}); else { ui.aq=''; render(); } },
    'sv-ep':(d)=>{ ui.epSrv=d.id; admGo('ep','paketler'); },
    'sv-sec':(d)=>{ ui.svSec=d.s; ui.svF=[]; ui.svPage=1; ui.svEdit=null; admGo('server',d.s); },
    'ex-open':(d)=>{ ui.reveal=false; if(d.id){ const o=S.exOrders.find(x=>x.id===d.id); if(o){ ui.exSrv=o.server; ui.bkSrv=o.ex; } admGo('borsa','siparisler',{id:d.id}); } else { ui.exSrv='hepsi'; if(inAdm()) admSet({id:null}); else admGo('borsa','siparisler'); } },
    'admin-tk':()=>admGo('destek','talepler'),
    'adm-tk':(d)=>{ ui.tk=d.id; ui.tkf='hepsi'; admGo('destek','talepler',{f:'hepsi'}); },
    'adm-wdq':(d)=>{ const w=S.wd.find(x=>x.id===d.id); ui.egpQ=w?(w.name||''):''; admGo('cekim','talepler',{f:'tumu',q:ui.egpQ||null}); },
    ntab:(d)=>admGo('sms',{tpl:'sablonlar',mail:'eposta',sms:'sms',log:'kayitlar'}[d.t]||d.t),
    tkf:(d)=>{ ui.tkf=d.f; ui.tk=null; if(inAdm()) admSet({f:d.f}); else render(); },
    exf:(d)=>{ ui.exf=d.f; if(inAdm()) admSet({f:d.f}); else render(); },
    adf:(d)=>{ ui.adf=d.t; if(inAdm()) admSet({f:d.t}); else render(); },
    eplog:(d)=>{ ui.epLog=d.g; if(inAdm()) admSet({f:d.g===''?'_tr':d.g==='all'?null:d.g}); else render(); },
    sof:fset('sof'), dpf:fset('dpf'), wdf:fset('wdf'), lf:fset('lf'), uf:fset('uf'), flf:fset('flf'),
    'fl-seen':(d)=>{ const f=S.flagged[+d.i]; if(f){ f.seen=true; save(); } render(); },
    'fl-seen-all':()=>{ const P=admParse(route()); const q=(P.q||'').toLocaleLowerCase('tr-TR'); let n=0; S.flagged.forEach(f=>{ if(f.seen) return; const U=user(f.u)||{}; if(q&&![U.name,fullName(U),U.tel,f.orig].some(v=>String(v||'').toLocaleLowerCase('tr-TR').includes(q))) return; f.seen=true; n++; }); save(); toast(n+' mesaj incelendi olarak işaretlendi.'); render(); },
    'adm-more':(d)=>{ ui.lim=ui.lim||{}; ui.lim[d.k]=admLim(d.k)+100; render(); },
    'adm-grp':(d)=>{ const G=admGrpState(); const els=[...document.querySelectorAll('.asb-g')].filter(x=>x.dataset.g===d.g); const open=els.length?els[0].classList.contains('shut'):true; G[d.g]=open; try{ localStorage.setItem('yp_admgrp',JSON.stringify(G)); }catch(e){} els.forEach(x=>{ x.classList.toggle('shut',!open); const h=x.querySelector('.asb-gh'); if(h) h.setAttribute('aria-expanded',open); }); },
    'adm-menu':(d)=>{ document.body.classList.add('adm-menu'); document.querySelectorAll('[data-act="adm-menu"]').forEach(x=>x.setAttribute('aria-expanded','true')); setTimeout(()=>{ const t=d.q?$('#acmdM'):$('.adrawer-x'); if(t) t.focus(); },30); },
    'adm-menu-close':()=>{ document.body.classList.remove('adm-menu'); document.querySelectorAll('[data-act="adm-menu"]').forEach(x=>x.setAttribute('aria-expanded','false')); },
    'adm-scroll':(d)=>{ const el=document.getElementById(d.to); if(el){ el.scrollIntoView({behavior:'smooth',block:'start'}); const g=el.querySelector('details'); if(g) g.open=true; } },
    'perm-role':(d)=>{ const R=PERM_ROLES[d.r]; if(!R) return; Object.keys(PERMS).forEach(k=>{ const c=$('#'+d.p+k); if(c&&!c.disabled){ c.checked=R[1].includes(k); c.dispatchEvent(new Event('input',{bubbles:true})); } }); toast(R[0]+' rolü işaretlendi. Kaydetmeyi unutmayın.'); },
    'sv-edit':(d)=>{ ui.svAnim=!ui.svEdit; admSet({id:d.id}); },
    'sv-add':()=>{ ui.svAnim=true; admSet({id:'new'}); },
    'sv-close':()=>{ ui.svEdit=null; admSet({id:null}); },
    'sv-web':()=>{},
    'sv-more':()=>{ ui.svPage=(ui.svPage||1)+1; svApply(); },
    svf:(d)=>{ const F=ui.svF=ui.svF||[]; const i=F.indexOf(d.k); if(i<0) F.push(d.k); else F.splice(i,1); ui.svPage=1; svApply(); },
    'sv-clear':()=>{ ui.svF=[]; ui.svQ=''; ui.svPage=1; const i=$('#sv_q'); if(i) i.value=''; svApply(); }
  });
  { const f=ACT['srv-del']; ACT['srv-del']=(d,e)=>{ f(d,e); if(inAdm()){ ui.svEdit=null; admSet({id:null}); } }; }
  { const f=FORM.srvadd; FORM.srvadd=(x)=>{ const n=S.servers.length; f(x); if(S.servers.length>n&&inAdm()){ ui.svHi=S.servers[S.servers.length-1].id; ui.svQ=''; ui.svF=[]; ui.svSort='yeni'; ui.svPage=1; admSet({id:null,q:null,f:null,sort:'yeni',page:null}); } }; }
  FORM.asearch=()=>{ const v=(($('#aq')||{}).value||'').trim(); if(inAdm()) admSet({q:v||null}); else { ui.aq=v; render(); } setTimeout(()=>{ const i=$('#aq'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } },0); };
  CHG.atabsel=(el)=>admGo(el.value);
  CHG.svsort=(el)=>{ ui.svSort=el.value; ui.svPage=1; svApply(); };
  CHG.eplog=(el)=>ACT.eplog({g:el.value});
  { const f=CHG.exst; CHG.exst=(el)=>{ if(el.value==='kismen'){ const o=S.exOrders.find(x=>x.id===el.dataset.id); ui.reveal=false; admGo('borsa','siparisler',{id:o.id}); setTimeout(()=>{const s_=$('#exds'); if(s_) s_.value='kismen'; const i=$('#exdq'); if(i){ i.focus(); i.select(); }},120); toast('Teslim edilen adedi yazıp “Durumu kaydet” deyin.'); return; } return f(el); }; }
  { const f=CHG.switch; CHG.switch=(el)=>{ const wasAdm=inAdm(); f(el); if(wasAdm&&!isPanel()&&inAdm()) go('home'); }; }
  // eski kayıtlar: of-cancel üye tarafında da kullanılıyor; sahibi ya da yetkili.
  // R9: pusula aksiyonlarında (egp-view / egp-dl …) kayıt sahibi istisnası YOK — yalnız cekim / muhasebe yetkisi (ADM_ACT + handler içi kontrol).
  { const f=ACT['of-cancel']; ACT['of-cancel']=(d,e)=>{ const o=S.exOffers.find(x=>x.id===d.id); if(!(o&&o.u===S.cur)&&!can('borsa')) return toast('Bu işlem için yetkiniz yok.',true); return f(d,e); }; }
  { const f=ACT['edit-l']; ACT['edit-l']=(d,e)=>{ const l=lst(d.id); if(!(l&&l.seller===S.cur)&&!can('ilan')) return toast('Bu işlem için yetkiniz yok.',true); return f(d,e); }; }
}
/* tıklama: onay penceresi, kaydedilmemiş değişiklik uyarısı, komut sonuçları (yakalama aşaması) */
document.addEventListener('click',e=>{
  const cb=e.target.closest('[data-cfm]'); if(cb){ e.preventDefault(); e.stopPropagation(); closeConfirm(cb.dataset.cfm==='ok'); return; }
  const r=e.target.closest('[data-cmdr]'); if(r){ cmdClose(); document.body.classList.remove('adm-menu'); const i=r.closest('[data-cmd]').querySelector('.acmd-in'); if(i) i.value=''; if(r.getAttribute('href')==='#') e.preventDefault(); return; }
  if(!e.target.closest('[data-cmd]')) cmdClose();
  if(ui.admDirty&&isAdmRoute(route())){ const a=e.target.closest('a[href^="#"]'), n=e.target.closest('[data-act="atab"],[data-act="sv-close"],[data-act="sv-sec"],[data-act="ntab"],[data-act="sv-edit"],[data-act="sv-add"]');
    if((a||n)&&!e.target.closest('.asave')){ const href=a&&a.getAttribute('href'); if(a&&(href==='#'||href===location.hash)) return;
      e.preventDefault(); e.stopPropagation(); const el=n||a;
      openConfirm({t:'Kaydedilmemiş değişiklikler var',d:'Kaydedilmemiş değişiklikler kaybolacak.',ok:'Kaydetmeden çık',danger:1,onOk:()=>{ ui.admDirty=false; document.querySelectorAll('form[data-dirty]').forEach(f=>delete f.dataset.dirty); if(n){ const fn=ACT[n.dataset.act]; if(fn) fn(n.dataset,{target:n,preventDefault(){}}); if(!a) return; } if(a) location.hash=href; }}); } }
},true);
document.addEventListener('input',e=>{ const el=e.target;
  if(el.id==='sv_q'){ ui.svQ=el.value; ui.svPage=1; return svApply(); }
  if(el.classList&&el.classList.contains('acmd-in')){ clearTimeout(el._t); el._t=setTimeout(()=>cmdRender(el),120); return; }
  if(el.dataset&&el.dataset.lg){ el.closest('form').querySelectorAll('.lgprev .slogo,.lgprev-h .slogo').forEach(x=>x.style.setProperty('--c'+el.dataset.lg,el.value)); }
  if(el.dataset&&el.dataset.cnt){ const c=document.getElementById(el.dataset.cnt); if(c) c.textContent=el.value.length+' / 600'; }
  const f=el.closest&&el.closest('.admwrap form[data-form], .sdrawer form[data-form]'); if(f&&!['asearch','egplookup','xlsrange','entlogin','entsetup'].includes(f.dataset.form)){ f.dataset.dirty='1'; ui.admDirty=true; const m=f.querySelector('.asave-m'); if(m){ m.textContent='Kaydedilmemiş değişiklik var'; m.classList.add('dirty'); } } },true);
document.addEventListener('change',e=>{ const el=e.target; if(el.matches&&el.matches('.admwrap form[data-form] input[type=checkbox], .admwrap form[data-form] input[type=radio], .admwrap form[data-form] select, .sdrawer form select, .sdrawer form input[type=color]')&&!el.dataset.change){ const f=el.closest('form'); if(f&&!['asearch','egplookup','xlsrange','entlogin','entsetup'].includes(f.dataset.form)){ f.dataset.dirty='1'; ui.admDirty=true; const m=f.querySelector('.asave-m'); if(m){ m.textContent='Kaydedilmemiş değişiklik var'; m.classList.add('dirty'); } } } },true);
document.addEventListener('submit',e=>{ const f=e.target.closest&&e.target.closest('form[data-form]'); if(f&&f.dataset.dirty){ delete f.dataset.dirty; ui.admDirty=!!document.querySelector('form[data-dirty]'); } },true);
document.addEventListener('keydown',e=>{
  const c=$('#cfm'); if(c&&!c.hidden){ if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); closeConfirm(false); } else if(e.key==='Tab'){ const B=[...c.querySelectorAll('button.btn')]; const i=B.indexOf(document.activeElement); e.preventDefault(); B[(i+(e.shiftKey?-1:1)+B.length)%B.length].focus(); } return; }
  const t=e.target, typing=t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable);
  if(t&&t.classList&&t.classList.contains('acmd-in')){ const box=t.closest('[data-cmd]'); const R=[...box.querySelectorAll('.acmd-r')]; let i=R.findIndex(x=>x.classList.contains('sel'));
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); if(!R.length) return; i=(i+(e.key==='ArrowDown'?1:-1)+R.length)%R.length; R.forEach((x,j)=>x.classList.toggle('sel',j===i)); t.setAttribute('aria-activedescendant',R[i].id); R[i].scrollIntoView({block:'nearest'}); return; }
    if(e.key==='Enter'){ e.preventDefault(); if(R[i<0?0:i]) R[i<0?0:i].click(); return; }
    if(e.key==='Escape'){ e.preventDefault(); e.stopImmediatePropagation(); t.value=''; cmdClose(); t.blur(); return; } }
  if(!isAdmRoute(route())||!isPanel()) return;
  if((e.key==='k'||e.key==='K')&&(e.ctrlKey||e.metaKey)||(e.key==='/'&&!typing&&!e.ctrlKey&&!e.metaKey)){ e.preventDefault(); const mob=window.matchMedia('(max-width:900px)').matches; if(mob){ ACT['adm-menu']({q:1}); } else { const i=$('#acmdA'); if(i){ i.focus(); i.select(); } } return; }
  if(e.key==='Escape'){ if($('.mb')) return; if(document.body.classList.contains('adm-menu')){ ACT['adm-menu-close'](); const b=$('.mtop [data-act="adm-menu"]'); if(b) b.focus(); return; } if($('.sdrawer')){ const x=$('.sdrawer [data-act="sv-close"]'); if(x) x.click(); } }
  if((e.key==='Enter'||e.key===' ')&&t&&t.matches&&t.matches('.svtbl tr[data-act]')){ e.preventDefault(); t.click(); } });
/* R8: Entegrasyonlar — eylem ve form bağlantıları (yetkiler aşağıdaki ADM_ACT / ADM_FORM ile de korunur) */
Object.assign(ACT,{
  'ent-retry':()=>entReload(),
  'ent-test':(d)=>entTest(d.svc),
  'ent-logout':()=>entLogout(),
  'ent-eye':(d)=>{ const i=document.getElementById(d.id); if(!i) return; const show=i.type==='password'; i.type=show?'text':'password'; const b=document.querySelector(`[data-act="ent-eye"][data-id="${d.id}"]`); if(b){ b.textContent=show?'Gizle':'Göster'; b.setAttribute('aria-pressed',String(show)); } i.focus(); },
  'ent-go':(d)=>{ closeModal(); admGo('entegrasyon',null,d.id?{id:d.id}:null); }
});
Object.assign(FORM,{ entsetup:()=>entSetup(), entlogin:()=>entLogin(), entsave:(f)=>entSaveSvc(f.dataset.svc), entbase:()=>entBaseSave() });
/* hesap değiştirilince API oturum bilgisi (bellekteki CSRF) bırakılır */
{ const f=CHG.switch; CHG.switch=(el)=>{ ui.apiCsrf=null; ui.ent=null; return f(el); }; }
{ const f=ACT.as; ACT.as=(d,e)=>{ ui.apiCsrf=null; ui.ent=null; return f(d,e); }; }
/* yeniden çizimde Entegrasyonlar alanlarını koru, ?id= ile istenen karta kaydır */
{ const R0=render; render=function(){ const keep=entKeep(); R0.apply(this,arguments); entRestore(keep);
    const P=isAdmRoute(route())?admParse(route()):null; if(P&&P.k==='entegrasyon'&&P.id&&ui.entScrolled!==location.hash){ const el=document.getElementById('ent_'+P.id); if(el){ ui.entScrolled=location.hash; setTimeout(()=>{ try{ el.scrollIntoView({block:'start'}); }catch(e){} },0); } }
    else if(!P||P.k!=='entegrasyon') ui.entScrolled=null; }; }
const ADM_ACT={'dep-ok':'odeme','dep-no':'odeme','wd-ok':'cekim','wd-no':'cekim','l-ok':'ilan',resolve:'siparis','ad-ok':'reklam','tc-reset':'uye','tc-ask':['cekim','muhasebe'],'u-ban':'uye','u-ver':'uye','pa-ok':'seo','pa-no':'seo','bl-del':'seo','post-del':'seo','static-kit':'seo','seo-kit':'seo','tc-kit':['cekim','uye'],'muhasebe-kit':['muhasebe','odeme','ayar'],'muhasebe-zip-dl':['muhasebe','odeme','ayar'],'ent-test':['muhasebe','odeme'],'ent-logout':['muhasebe','odeme'],'ent-retry':['muhasebe','odeme'],'ep-del':'ep','ep-toggle':'ep','ep-cdel':'ep','sv-ep':'server','srv-del':'server','ex-pair':'borsa','ex-unpair':'borsa','ex-unpair-all':'borsa','ex-cancel':'borsa',
  'ad-del':'reklam','ad-toggle':'reklam','ad-ext':'reklam','ad-media-clear':'reklam','slide-toggle':'reklam','slide-clear':'reklam','slide-del':'reklam','preview-pop':'reklam',draw:'kampanya','r-del':'kampanya','cp-toggle':'kampanya','cp-del':'kampanya','spin-reset':'kampanya',
  'bank-del':'odeme','gw-toggle':'odeme','cnet-toggle':'odeme','cnet-del':'odeme','xr-add':'borsa_ayar','xr-del':'borsa_ayar','ef-add':'borsa_ayar','ef-del':'borsa_ayar','ef-up':'borsa_ayar','ex-power':'borsa','ex-claim':'borsa','exdq-fill':'borsa',
  'staff-del':'calisan','vip-add':'vip','vip-del':'vip','l-del':'ilan','cover-reset':'ilan',reset:'ayar','bk-now':'bakim','bk-del':'bakim','bk-dl':'bakim','bk-restore':'bakim','safe-update':'bakim','xls-day':'muhasebe',mday:'muhasebe','xls-user':'uye',
  'tk-claim':'destek','tk-close':'destek','tk-ai':'destek','egp-modal':['cekim','muhasebe'],'egp-view':['cekim','muhasebe'],'egp-dl':['cekim','muhasebe'],'egp-find':['cekim','muhasebe'],'admin-sms':'uye','adm-tk':'destek','adm-wdq':['cekim','muhasebe'],'fl-seen':'mesaj','fl-seen-all':'mesaj',
  'sv-edit':'server','sv-close':'server','sv-add':'server','sv-more':'server',svf:'server','sv-clear':'server'};
const ADM_FORM={entsetup:['muhasebe','odeme'],entlogin:['muhasebe','odeme'],entsave:['muhasebe','odeme'],entbase:['muhasebe','odeme'],srvadd:'server',srvsave:'server',epadd:'ep',epprod:'ep',hhset:'ep',tcset:'cekim',seoset:'seo',adsset:'seo',postadd:'seo',postsave:'seo',bladd:'seo',wdfee:'cekim',egpset:'cekim',egpissue:'cekim',egptc:['cekim','muhasebe'],egplookup:'muhasebe',dopset:'ilan',mailset:'sms',tplsave:'sms',golive:'ayar',
  packs:'reklam',adrej:'reklam',slideadd:'reklam',raffle:'kampanya',coupon:'kampanya',bank:'odeme',gws:'odeme',cnetadd:'odeme',cnetsave:'odeme',exrates:'borsa_ayar',xradd:'borsa_ayar',exfields:'borsa_ayar',excall:'borsa',exinfo:'borsa',exst:'borsa',exdq:'borsa',exoffmsg:'borsa',
  staffadd:'calisan',staffperm:'calisan',vipset:'vip',refset:'vip',settings:'ayar',maintset:'bakim',smsset:'sms',smstest:'sms',mailtest:'sms',supportset:'destek',tkreply:'destek',baladd:'bakiye',winback:'uye',xlsrange:'muhasebe'};
{ const f=FORM.editl; FORM.editl=(x)=>{ const l=lst(x.dataset.id); if(!(l&&l.seller===S.cur)&&!can('ilan')) return toast('Bu işlem için yetkiniz yok.',true); return f(x); }; }
const ADM_CHG={mod:'ilan',coverup:'ilan',wheelon:'kampanya',blst:'seo',bkauto:'bakim',bkfile:'bakim',admediaadd:'reklam',slidemedia:'reklam',tkxfer:'destek',svsort:'server'};
const admOk = p => Array.isArray(p)?p.some(x=>can(x)):can(p);
Object.entries(ADM_ACT).forEach(([k,p])=>{ const f=ACT[k]; if(f) ACT[k]=(d,e)=>{ if(!admOk(p)) return toast('Bu işlem için yetkiniz yok.',true); return f(d,e); }; });
Object.entries(ADM_FORM).forEach(([k,p])=>{ const f=FORM[k]; if(f) FORM[k]=(x)=>{ if(!admOk(p)) return toast('Bu işlem için yetkiniz yok.',true); return f(x); }; });
Object.entries(ADM_CHG).forEach(([k,p])=>{ const f=CHG[k]; if(f) CHG[k]=(el)=>{ if(!admOk(p)){ if(el.type==='checkbox') el.checked=!el.checked; return toast('Bu işlem için yetkiniz yok.',true); } return f(el); }; });
{ const f=ACT.as; ACT.as=(d,e)=>{ if(S.set.demoMode===false&&!d.ok&&!(me()&&me().admin)) return toast('Demo hesap girişi kapalı.',true); return f(d,e); }; }
{ const f=CHG.switch; if(f) CHG.switch=(el)=>{ if(S.set.demoMode===false&&!(me()&&me().admin)){ el.value=S.cur||''; return toast('Demo hesap değiştirme kapalı.',true); } return f(el); }; }
{ const f=FORM.loginf; FORM.loginf=(x)=>{ let L={n:0,t:0}; try{ L=JSON.parse(sessionStorage.getItem('yangpazar_lf')||'{"n":0,"t":0}'); }catch(e){}
    if(L.n>=5&&now()-L.t<10*60000) return mLogin('Çok fazla hatalı deneme. 10 dakika sonra tekrar deneyin.');
    const before=S.cur; const r=f(x); const ok=S.cur&&S.cur!==before; try{ sessionStorage.setItem('yangpazar_lf',JSON.stringify(ok?{n:0,t:0}:{n:(now()-L.t<10*60000?L.n:0)+1,t:now()})); }catch(e){} return r; }; }
{ const f=FORM.registerf; FORM.registerf=(x)=>{ const nm=v_('rg_u').trim(), em=v_('rg_e').trim(), pw=v_('rg_p'), ad=v_('rg_ad').trim(), sy=v_('rg_sy').trim();
    if(!/^[A-Za-z0-9_ÇĞİÖŞÜçğıöşü]{3,20}$/.test(nm)) return mRegister('Kullanıcı adı 3-20 karakter olmalı; yalnızca harf, rakam ve alt çizgi kullanın.');
    if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(em)) return mRegister('Geçerli bir e-posta adresi yazın.');
    if(pw.length<6) return mRegister('Şifre en az 6 karakter olmalı.');
    if(!/^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû' .-]{2,40}$/.test(ad)||!/^[A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû' .-]{2,40}$/.test(sy)) return mRegister('Ad ve soyadı kimliğinizdeki gibi, yalnızca harflerle yazın.');
    return f(x); }; }
function goLiveChecks(){ const st=S.set, demoUsers=S.users.filter(u=>u.pass==='1234').length; const ED=entEnsure().durum||{}, EP=(ED.services||{}).paytr||{};
  return [[st.demoMode===false,'Demo modu kapalı','Açıkken herkes üstteki "Demo hesap" kutusundan yönetici dahil her hesaba geçebilir.'],
    [demoUsers===0,'Demo hesaplar temizlendi',demoUsers?`${demoUsers} hesap şifresi hâlâ "1234"`:'Yok'],
    [/^https:\/\//.test(st.siteUrl||''),'Site adresi https',esc(st.siteUrl||'girilmedi')],
    [!!(S.mail&&S.mail.host&&S.mail.user),'SMTP e-posta ayarları','<a href="#yonetim/sms/eposta">E-posta & SMS › E-posta ayarları</a>'],
    [!!(S.sms&&S.sms.user),'SMS sağlayıcı bilgileri','<a href="#yonetim/sms/sms">E-posta & SMS › SMS ayarları</a>'],
    [!!EP.configured,'Ödeme altyapısı (PayTR)',EP.last_test&&EP.last_test.ok?'Bağlantı testi başarılı':'<a href="#yonetim/entegrasyon?id=paytr">Yönetim › Entegrasyonlar › PayTR</a>'],
    [!!(st.tc&&st.tc.req),'Para çekmede TC doğrulaması zorunlu','<a href="#yonetim/cekim/ayarlar">Para çekme › Ayarlar</a>'],
    [!!ED.installed,'API paketi kuruldu (PayTR, Paraşüt, Bizim Hesap)',ED.installed?'Sunucu bağlı · Yönetim › Entegrasyonlar':'<a href="#yonetim/entegrasyon">Yönetim › Entegrasyonlar</a>: paketi yükleyip kurulumu tamamlayın'],
    [!!(S.admins||S.users.filter(u=>u.admin).every(u=>u.pass!=='1234')),'Yönetici şifresi değiştirildi','Profil bilgilerim > şifre']]; }
function goLivePanel(){ const C=goLiveChecks(), ok=C.filter(c=>c[0]).length;
  return `<form class="panel" data-form="golive" data-entw><div class="panel-h" style="flex-wrap:wrap"><h3>Yayına alma kontrolü</h3><span class="pill ${ok===C.length?'p-tamam':'p-bekliyor'}">${ok}/${C.length} hazır</span></div><div class="panel-b stack">
    <div class="note note-bad" style="font-size:13px;line-height:1.55"><b>Önemli:</b> Bu site şu an tarayıcıda çalışan, tam işlevli bir <b>prototip</b>. Bütün veriler (üyeler, bakiyeler, siparişler, şifreler) ziyaretçinin kendi tarayıcısında saklanıyor. Bu dosyayı hostinge tek başına yüklerseniz her ziyaretçi kendi ayrı kopyasını görür ve teknik bilgisi olan biri tarayıcıdan bakiyesini ya da yetkisini değiştirebilir. Gerçek para ile çalışmadan önce üyelik, bakiye, sipariş, ödeme bildirimi ve yönetim işlemlerinin <b>sunucu tarafında (veritabanı + API)</b> yapılması gerekir. Hazırladığımız ödeme (QNBpay), TC doğrulama ve SEO sunucu dosyaları bu altyapının parçalarıdır.</div>
    <div class="seochk">${C.map(([g,t,x])=>`<div class="${g?'ok':'no'}"><i>${g?'✓':'!'}</i><span><b>${t}</b><small>${x}</small></span></div>`).join('')}</div>
    <label class="chk" for="gl_demo"><input type="checkbox" id="gl_demo" ${st_demo()?'checked':''}> Demo modu (üstte "Demo hesap" seçici ve girişte demo hesap listesi)</label>
    </div>${aSave('Kaydet')}</form>`; }
const st_demo = () => S.set.demoMode!==false;
FORM.golive=(()=>{ const f=()=>{ if(!can('ayar')) return toast('Bu işlem için yetkiniz yok.',true); S.set.demoMode=$('#gl_demo').checked; save(); toast(S.set.demoMode?'Demo modu açık.':'Demo modu kapatıldı. Demo hesap seçici gizlendi.'); render(); }; return f; })();

/* R7: kaydedilmemiş değişiklik koruması tarayıcı Geri/İleri, elle adres değişikliği ve sayfa kapatma/yenileme için de çalışır. */
const admDirtyNow = () => !!(ui.admDirty&&document.querySelector('.admwrap form[data-dirty], .sdrawer form[data-dirty]'));
function admDirtyClear(){ ui.admDirty=false; document.querySelectorAll('form[data-dirty]').forEach(f=>delete f.dataset.dirty); }
window.addEventListener('beforeunload',e=>{ if(admDirtyNow()){ e.preventDefault(); e.returnValue=''; return ''; } });
window.addEventListener('hashchange',e=>{ if(admDirtyNow()){ let oldH=''; try{ oldH=new URL(e.oldURL).hash; }catch(x){}
    if(isAdmRoute(oldH.slice(1))){ e.stopImmediatePropagation(); const to=e.newURL; try{ history.pushState(null,'',e.oldURL); }catch(x){ return; }
      openConfirm({t:'Kaydedilmemiş değişiklikler var',d:'Kaydedilmemiş değişiklikler kaybolacak.',ok:'Kaydetmeden çık',danger:1,onOk:()=>{ admDirtyClear(); const from=location.href; try{ history.pushState(null,'',to); }catch(x){ location.href=to; return; } window.dispatchEvent(new HashChangeEvent('hashchange',{oldURL:from,newURL:to})); }}); } } });
window.addEventListener('hashchange',()=>{ document.body.classList.remove('adm-menu'); cmdClose(); if(seoClean()&&location.hash.length>1&&!isAdmRoute(location.hash.slice(1))){ history.replaceState(null,'',routeToPath(location.hash.slice(1))+location.search); } PV.seen.clear(); render(); window.scrollTo(0,0); });

/* ================== ETBİS (Elektronik Ticaret Bilgi Sistemi) ================== */
const ETBIS_HOSTS=['etbis.ticaret.gov.tr','etbis.eticaret.gov.tr'];
function etbisCfg(){ if(!S.set.etbis) S.set.etbis={on:false,url:'',code:'',date:'',img:''}; return S.set.etbis; }
function etbisUrlOk(u){ try{ const x=new URL(u); return x.protocol==='https:'&&ETBIS_HOSTS.some(h=>x.hostname===h||x.hostname.endsWith('.'+h)); }catch(e){ return false; } }
function etbisImgOk(src){ return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/.test(src||'')||etbisUrlOk(src||''); }
// ETBİS'in verdiği HTML kodunu güvenli biçimde çözer: yalnız bağlantı ve karekod görseli alınır, kod sayfaya eklenmez.
function etbisParse(html){ const out={url:'',img:''}; try{ const d=new DOMParser().parseFromString(String(html||''),'text/html'); const a=[...d.querySelectorAll('a[href]')].find(x=>etbisUrlOk(x.getAttribute('href'))); if(a) out.url=a.getAttribute('href'); const im=[...d.querySelectorAll('img[src]')].map(x=>x.getAttribute('src')).find(etbisImgOk); if(im) out.img=im.replace(/\s+/g,''); }catch(e){} if(!out.url){ const m=String(html||'').match(/https:\/\/[^\s"'<>]*etbis\.e?ticaret\.gov\.tr[^\s"'<>]*/i); if(m&&etbisUrlOk(m[0])) out.url=m[0]; } return out; }
function etbisBadge(prev){ const E=etbisCfg(); if(!prev&&!(E.on&&etbisUrlOk(E.url))) return ''; const qr=E.img&&etbisImgOk(E.img)?`<img src="${esc(E.img)}" alt="ETBİS karekodu">`:'<i class="etbis-qr0">ETBİS</i>';
  return `<a class="etbis-b" href="${esc(etbisUrlOk(E.url)?E.url:'#')}" target="_blank" rel="noopener" title="T.C. Ticaret Bakanlığı ETBİS kaydını doğrula">${qr}<span><b>ETBİS'e kayıtlıdır</b>T.C. Ticaret Bakanlığı Elektronik Ticaret Bilgi Sistemi${E.code?`<small>Kayıt no: ${esc(E.code)}</small>`:''}<small>Doğrulamak için tıklayın</small></span></a>`; }
function etbisPanel(){ const E=etbisCfg(); const ready=etbisUrlOk(E.url);
  return `<form class="stack" data-form="etbisset">
    <div class="panel panel-b stack"><h3 class="ph3">ETBİS kaydı</h3>
      <p class="muted" style="margin:0;font-size:13px">E-ticaret yapan siteler T.C. Ticaret Bakanlığı'nın Elektronik Ticaret Bilgi Sistemi'ne (ETBİS) kayıt olmak ve kayıt bilgisini sitede göstermek zorundadır. Kaydınız onaylanınca ETBİS size bir doğrulama bağlantısı ve karekod verir; onları buraya girin, sitenin alt kısmında "ETBİS'e kayıtlıdır" rozeti çıksın.</p>
      <ol class="etbis-steps muted"><li>etbis.ticaret.gov.tr adresine e-Devlet ile girip sitenizi kaydedin.</li><li>Onaydan sonra ETBİS'in verdiği <b>kodu</b> kopyalayıp aşağıdaki kutuya yapıştırın — bağlantı ve karekod kendiliğinden doldurulur. (İsterseniz alanları tek tek de girebilirsiniz.)</li><li>"Sitede göster"i işaretleyip kaydedin.</li></ol>
      <div class="fld"><label for="eb_paste">ETBİS'in verdiği kodu yapıştırın (isteğe bağlı)</label><textarea class="inp mono" id="eb_paste" rows="3" placeholder='&lt;div id="ETBIS"&gt;&lt;a href="https://etbis.ticaret.gov.tr/…"&gt;&lt;img src="data:image/…"&gt;&lt;/a&gt;&lt;/div&gt;' data-change="etbispaste"></textarea><small class="muted">Kod güvenlik için sayfaya olduğu gibi eklenmez; yalnızca doğrulama bağlantısı ve karekod görseli alınır.</small></div>
      <div class="fld"><label for="eb_url">Doğrulama bağlantısı</label><input class="inp mono" id="eb_url" value="${esc(E.url)}" placeholder="https://etbis.ticaret.gov.tr/…" inputmode="url"><small class="muted">Yalnızca etbis.ticaret.gov.tr (veya etbis.eticaret.gov.tr) adresleri kabul edilir.</small></div>
      <div class="row2"><div class="fld"><label for="eb_code">ETBİS kayıt numarası / site kodu (isteğe bağlı)</label><input class="inp mono" id="eb_code" value="${esc(E.code)}" maxlength="80"></div><div class="fld"><label for="eb_date">Kayıt tarihi (isteğe bağlı)</label><input class="inp mono" id="eb_date" type="date" value="${esc(E.date)}"></div></div>
      <div class="fld"><span class="lbl">Karekod (QR) görseli</span><div class="hstack"><label class="btn btn-sm" for="eb_img">Görsel yükle</label><input type="file" id="eb_img" accept="image/png,image/jpeg,image/gif,image/webp" hidden data-change="etbisimg">${E.img?'<button type="button" class="btn btn-sm btn-bad" data-act="etbis-img-del">Karekodu kaldır</button>':'<span class="muted" style="font-size:12.5px">Yüklenmedi — rozet karekodsuz görünür.</span>'}</div></div>
      <label class="chk" for="eb_on"><input type="checkbox" id="eb_on" ${E.on?'checked':''}> ETBİS rozetini sitenin alt kısmında göster</label>
      ${!ready&&E.on?'<div class="note note-warn" style="font-size:12.5px">Rozetin görünmesi için geçerli bir ETBİS doğrulama bağlantısı girin.</div>':''}
      <div class="stack" style="gap:6px"><span class="lbl">Önizleme</span><div class="etbis-prev" id="eb_prev">${etbisBadge(true)}</div></div>
    </div>${aSave('ETBİS bilgilerini kaydet')}</form>`; }
FORM.etbisset=()=>{ if(!can('ayar')) return toast('Bu işlem için yetkiniz yok.',true); const E=etbisCfg(); const url=v_('eb_url').trim();
  if(url&&!etbisUrlOk(url)) return toast('Doğrulama bağlantısı etbis.ticaret.gov.tr adresiyle başlamalı (https).',true);
  const on=$('#eb_on').checked; if(on&&!url) return toast('Rozeti göstermek için doğrulama bağlantısını girin.',true);
  E.url=url; E.code=v_('eb_code').trim().slice(0,80); E.date=v_('eb_date'); E.on=on; save(); toast(on?'ETBİS bilgileri kaydedildi; rozet sitenin alt kısmında görünüyor.':'ETBİS bilgileri kaydedildi.'); render(); };
CHG.etbispaste=(el)=>{ const r=etbisParse(el.value); if(!r.url&&!r.img) return toast('Yapıştırılan kodda ETBİS bağlantısı veya karekodu bulunamadı.',true);
  const E=etbisCfg(); if(r.url){ const u=$('#eb_url'); if(u) u.value=r.url; } if(r.img) E.img=r.img; if(r.url) E.url=r.url; save(); el.value=''; toast('ETBİS kodu okundu: '+[r.url&&'bağlantı',r.img&&'karekod'].filter(Boolean).join(' ve ')+' alındı. Kaydetmeyi unutmayın.'); render(); };
CHG.etbisimg=async(el)=>{ const f=el.files&&el.files[0]; if(!f) return; if(f.size>600*1024) return toast('Görsel en fazla 600 KB olabilir.',true);
  const src=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); }).catch(()=>'');
  if(!etbisImgOk(src)) return toast('Görsel okunamadı. PNG, JPG, GIF veya WEBP yükleyin.',true); etbisCfg().img=src; save(); toast('Karekod yüklendi.'); render(); };
ACT['etbis-img-del']=()=>{ if(!can('ayar')) return; etbisCfg().img=''; save(); toast('Karekod kaldırıldı.'); render(); };
ADM_FORM.etbisset='ayar'; ADM_CHG.etbispaste='ayar'; ADM_CHG.etbisimg='ayar'; ADM_ACT['etbis-img-del']='ayar';

