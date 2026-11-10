function route(){ if(window.__r) return window.__r; if(seoClean()&&location.hash.length<=1) return pathToRoute(location.pathname); return (location.hash||'#home').slice(1)||'home'}
function go(h){ if(route()===h){ render(); window.scrollTo(0,0);} else location.hash=h; }
function view(r){
  if(maintOn()&&!isPanel()) return vMaint();
  const fk=r.startsWith('server-')?'server':r; if(ui.lastView!==fk){ui.f={};ui.lastView=fk;}
  if(r==='home') return `<h1 class="vh">${esc(S.set.seo&&S.set.seo.homeTitle||S.set.siteName+' · Metin2 Item, Yang, Won, EP ve Karakter Pazarı')}</h1>`+vHome();
  if(r==='metin2-tr') return vM2('tr');
  if(r==='metin2-ep') return vEp();
  if(r==='kategori-cs2'&&!S.set.cs2On) return `<div class="wrap">${emptyBox('CS2 bölümü yakında','Şu an Metin2 ilanlarına odaklanıyoruz.','<a class="btn btn-primary" href="#metin2-tr">Metin2 ilanları</a>')}</div>`;
  if(r==='metin2-pvp'||r==='serverler'||r==='kategori-metin2') return vM2('pvp');
  if(r.startsWith('server-')){const [sid,cat]=r.slice(7).split('-'); return vServer(sid,cat==='hepsi'?'hepsi':M2CAT.includes(cat)?cat:null)+srvSeoBlock(sid);}
  if(r==='rehber') return vRehber();
  if(r==='yang-fiyatlari') return vPrices();
  if(r==='ortaklik') return vPartner();
  if(r==='widget-yang') return vWidget();
  if(r.startsWith('widget-yang-')) return vWidget(r.slice(12));
  if(r.startsWith('rehber-')) return vPost(r.slice(7));
  if(r.startsWith('kategori-')) return vM2('tr');
  if(r==='ara') return vCategory('ara');
  if(r==='borsa') return vExchange();
  if(r==='mesajlar') return vMessages();
  if(r.startsWith('mesajlar-')) return vMessages(r.slice(9));
  if(r==='bildirimler') return vNotifs();
  if(r.startsWith('ilan-')&&r!=='ilan-ver'){ const l=lst(r.slice(5)); return vListing(r.slice(5))+(l?`<div class="wrap">${relatedBox(l)}<div class="panel panel-b" style="margin-top:16px">${shareBar(r,l.title)}</div></div>`:''); }
  if(r==='ilan-ver') return vSell();
  if(r.startsWith('siparis-')) return vOrder(r.slice(8));
  if(r==='hesabim') return vAccount();
  if(r==='cekilis') return vCamp();
  if(r==='reklam-ver') return vAds();
  if(r==='guvenli') return vSafe();
  if(isAdmRoute(r)) return vAdmin(admParse(r));
  if(r.startsWith('sayfa-')) return vPage(r.slice(6));
  return vNotFound();
}
function render(){
  { const h=route(); if(/^davet-[A-Za-z0-9]+$/.test(h)){ const c=h.slice(6).toUpperCase(); const R=refUser(c); if(R&&S.set.refOn){ try{ localStorage.setItem('yangpazar_ref',c); }catch(e){} } history.replaceState(null,'','#home'); if(R&&S.set.refOn&&!me()) setTimeout(()=>{ toast(`${R.name} seni davet etti! Üye olunca davet kodun otomatik eklenecek.`); mRegister(); },300); } }
  autoConfirm();
  const u=me(); if(u){ if(!u.lastSeen||now()-u.lastSeen>60000){u.lastSeen=now(); save();} }
  const r=route();
  document.body.classList.toggle('wmode',r.startsWith('widget-'));
  renderStrip(); renderHeader(); renderCats(r);
  const adm=isAdmRoute(r)&&isPanel()&&!(maintOn()&&!isPanel()); document.body.classList.toggle('adm-mode',adm); if(!adm) document.body.classList.remove('adm-menu','svopen');
  if(adm){ const h=$('#hdr'); if(h&&h.offsetHeight) document.documentElement.style.setProperty('--hdrh',h.offsetHeight+'px'); }
  $('#app').innerHTML=(maintOn()&&isPanel()&&!adm?`<div class="wrap"><div class="maintbar"><b>Bakım modu açık.</b> Ziyaretçiler bakım sayfasını görüyor, siz siteyi normal kullanıyorsunuz. <a href="#yonetim/bakim">Bakım ayarları</a></div></div>`:'')+view(r);
  if(adm){ document.body.classList.toggle('svopen',!!$('.sdrawer')); ui.svAnim=false; if($('#svRows')) svApply(); if($('#egp_q')&&ui.egpQ) egpApply(ui.egpQ); }
  if($('#bkList')) fillBk();
  if(maintOn()&&!me()&&isAdmRoute(r)&&!$('.mb')) mLogin();
  document.querySelectorAll('#app table.mcards').forEach(t=>{ const Hd=[...t.querySelectorAll('thead th')].map(x=>x.textContent.trim()); t.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{ td.dataset.l=Hd[i]||''; })); });
  renderFooter(); renderLS(); renderSide(r); try{ seoApply(r); }catch(e){ console.warn('seo',e); }
  if(r==='ilan-ver') sellGame();
  ['#ochat','.tk-l .chat','#dmChat'].forEach(s=>{const c=$(s); if(c) c.scrollTop=c.scrollHeight;});
  hydrateMedia(); document.querySelectorAll('video[data-dvid]:not([src])').forEach(async v=>{ try{ const m=await mediaGet(v.dataset.dvid); if(m) v.src=m.url; else v.outerHTML='<span class="muted" style="font-size:12.5px">Video bu tarayıcıda bulunamadı.</span>'; }catch(e){} });
  if(PV.dirty){ PV.dirty=false; save(); }
  if(r==='home' && S.set.popupOn && !ui.popupDone && !isPanel() && !maintOn()){ ui.popupDone=true; try{sessionStorage.setItem(KEY+'_pop','1')}catch(e){} setTimeout(()=>{ if(!$('.mb')) showPopup(); }, S.set.popupDelay*1000); }
}
function updSlider(){ const el=$('#slider'); if(!el) return; const n=el.querySelectorAll('.slide').length; if(!n) return; const i=ui.slide%n; el.querySelector('.slides').style.transform=`translateX(-${i*100}%)`; el.querySelectorAll('.dots button').forEach((b,j)=>b.classList.toggle('on',j===i)); }
setInterval(()=>{ if($('#slider') && !(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){ ui.slide++; updSlider(); } },5500);
setInterval(()=>{ document.querySelectorAll('[data-cd]').forEach(el=>{ el.outerHTML=cdBox(+el.dataset.cd); }); },1000);
setInterval(()=>{ const m=+S.set.autoBk; if(m>0&&now()-(S.set.lastBk||0)>=m*60000) bkPut('Otomatik').catch(()=>{}); },60000);
