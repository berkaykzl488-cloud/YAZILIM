function migrate(o){
  if(!o.exFieldsBuy) o.exFieldsBuy=[{id:'b1',label:'Oyun içi kullanıcı (karakter) adı',type:'text',req:true,secret:false,note:'Yang bu karaktere teslim edilir'},{id:'b2',label:'Teslimat yeri',type:'select',req:true,secret:false,opts:'Köy 1 · Kırmızı bayrak,Köy 1 · Sarı bayrak,Köy 1 · Mavi bayrak,Köy 2 · Kırmızı bayrak,Köy 2 · Sarı bayrak,Köy 2 · Mavi bayrak',note:''},{id:'b3',label:'CH (kanal)',type:'select',req:true,secret:false,opts:'CH1,CH2,CH3,CH4,CH5,CH6',note:''}];
  if(!o.gws.some(g=>g.id==='paytr_eft')) o.gws.splice(1,0,{id:'paytr_eft',n:'PayTR Havale/EFT',t:'Otomatik eşleşme · 7/24',fee:0,on:true,keys:{}});
  o.gws=(o.gws||[]).filter(g=>g.id!=='qnbpay'&&g.id!=='mobil'&&g.cat!=='mobil'); delete o.qnb;
  const CATS={paytr:'kart',iyzico:'kart',shopier:'kart',paytr_eft:'eft',havale:'eft',gpay:'cuzdan',papara:'cuzdan',paycell:'cuzdan',ininal:'cuzdan',kripto:'cuzdan'}; o.gws.forEach(g=>{ g.cat=g.cat||CATS[g.id]||'cuzdan'; });
  const hv=o.gws.find(g=>g.id==='havale'); if(hv) hv.n='Manuel havale', hv.t='Kendi hesaplarımıza · ekip onaylı';
  if(!o.set.seo) o.set.seo={homeTitle:'',desc:'Metin2 item, yang, won, EP ve karakter alım satımı. Ödemeniz teslim onaylanana kadar güvenli havuzda bekler; TR ve tüm PVP serverları tek yerde.',sep:' | ',ogImg:'',ga:'',gsc:'',bing:'',yandex:'',clean:false,noindex:false};
  if(!o.set.src26){ o.set.src26=1; const P=[{s:'google',m:'cpc',c:'yang-arama'},{s:'instagram',m:'paid_social',c:'dusuk-komisyon'},{s:'youtube',m:'video',c:'yayinci-davet'},{s:'discord',m:'community',c:''}]; (o.users||[]).filter(u=>!u.admin&&!u.staff).forEach((u,i)=>{ if(i%3!==2&&!u.src) u.src={...P[i%P.length],t:Date.now()-i*86400000}; }); }
  if(!o.backlinks){ const T=Date.now(); o.backlinks=[{id:'bl1',url:'https://forum.ornek-metin2.com/konu/guvenli-yang-alimi',target:'/rehber/metin2-yang-nasil-guvenli-satin-alinir',anchor:'güvenli yang alımı',k:'forum',st:'aktif',t:T-9*86400000,ck:T-2*86400000},{id:'bl2',url:'https://www.ejderha2-ornek.com/market',target:'/server/ejderha2',anchor:'Ejderha2 item ve yang pazarı',k:'rozet',st:'aktif',t:T-6*86400000,ck:T-86400000},{id:'bl3',url:'https://www.youtube.com/@ornekyayinci',target:'/',anchor:'yangpazar.com',k:'yayinci',nf:true,st:'kontrol',t:T-3*86400000}]; o.partnerApps=[{id:'pa1',tp:'server',n:'Asuman2 Ekibi',s:'Asuman2',u:'https://www.asuman2-ornek.com',l:'https://www.asuman2-ornek.com/bağlantılar',c:'discord: asuman2yonetim',x:'Rozeti alt menüye ekledik.',t:T-5*3600000,st:'bekliyor'}]; const e2=(o.servers||[]).find(x=>x.name==='Ejderha2'); if(e2) e2.partner={url:'https://www.ejderha2-ornek.com/market',t:T-6*86400000}; }
  if(!o.posts){ o.posts=POSTS_DEMO(Date.now()).map(p=>({...p,on:true})); }
  if(!o.set.tc) o.set.tc={req:true,url:'/kimlik/dogrula.php'};
  if(!o.set.tc23){ o.set.tc23=1; (o.users||[]).forEach(u=>{ if(!u.admin&&!u.staff&&u.id!=='u2'&&u.verified&&!u.tc) u.tc={ok:true,t:Date.now()-20*86400000,mask:'1'+String(10+(u.id.length*7)%89)+'******'+String(10+(u.id.charCodeAt(1)*3)%89),yil:1990+(u.id.length%9),by:'nvi'}; }); }

  if(!o.paytr) o.paytr={test:true,maxInst:0,okUrl:'',failUrl:''};
  if(!o.support) o.support={mode:'auto',hours:{0:['10:00','22:00',true],1:['09:00','24:00',true],2:['09:00','24:00',true],3:['09:00','24:00',true],4:['09:00','24:00',true],5:['09:00','24:00',true],6:['10:00','24:00',true]},ai:true,aiName:'Han Asistan',wait:'2 dk',offline:'Şu an temsilcilerimiz çevrimdışı. Yapay zeka asistanımız sorularınızı yanıtlamaya devam ediyor.',canned:[['Selamlama','Merhaba, ben {temsilci}. Size nasıl yardımcı olabilirim?'],['Sipariş kontrol','Siparişinizi kontrol ediyorum, bir dakika lütfen.'],['Teslim garantisi','Satıcı süresinde teslim etmezse sipariş sayfasındaki “Anında iade al” butonuyla tutarınız hemen bakiyenize döner.'],['Çekim süresi','Para çekme talepleri mesai saatlerinde 2-6 saat içinde IBAN’ınıza gönderilir.'],['Güvenlik','Ekibimiz sizden asla şifre, SMS kodu veya kart bilgisi istemez. Böyle bir mesaj alırsanız bize bildirin.'],['Kapanış','Başka bir konuda yardımcı olabilir miyim? İyi oyunlar dileriz.']]};
  if(!o.tkSeq) o.tkSeq=1100; o.tickets.forEach((t,i)=>{ if(!t.no) t.no=1040+i; if(t.status==='bekliyor'&&!t.queuedAt) t.queuedAt=t.t; });
  o.exOrders.forEach(x=>{ if(x.dir==='al'&&!x.f.b1) x.f={b1:x.f.f3||'DenizSura'}; });
  if(o.set.cs2On===undefined) o.set.cs2On=false;
  if(!o.set.exPlace) o.set.exPlace='CH2 · Mavi bayrak · Gardiyan yanı';
  if(o.set.exMargin==null) o.set.exMargin=12;
  (o.exchange||[]).forEach(x=>{ if(x.buy==null){ const mg=(x.margin!=null&&x.margin!=='')?+x.margin:+o.set.exMargin; x.buy=Math.round(x.max*(1+mg/100)*100)/100; } });
  o.exFieldsBuy=o.exFieldsBuy.filter(f=>f.id!=='b2'&&f.id!=='b3');
  o.exchange.forEach(x=>{ if(x.max==null) x.max=x.buy!=null?x.buy:10; if(x.margin===undefined) x.margin=null; });
  if(!o.exOffers){ const us=['u1','u4','u5','u3']; o.exOffers=[]; let k=0; const T=Date.now(); o.exchange.forEach(x=>{ for(let i=0;i<3;i++){ const u=us[(k+i)%us.length]; const q=[40,120,75][i]; k++; o.exOffers.push({id:'E'+k,u,ex:x.id,qty:q,left:q,price:Math.round(x.max*(0.84+0.06*i)*100)/100,t:T-(k*41)*60000,status:'aktif',f:{f1:'hesap_'+u,f2:'gizli123',f3:'Karakter'+k,f4:'',f5:'',f6:'Hemen'}}); } }); o.ofSeq=k; }
  if(!o.ofSeq) o.ofSeq=o.exOffers.length;
  o.exOrders=o.exOrders.filter(x=>x.dir!=='sat'); o.exOrders.forEach(x=>{ if(x.f){ delete x.f.b2; delete x.f.b3; } if(!x.place) x.place=o.set.exPlace; if(x.cost==null) x.cost=0; });
  o.listings.forEach(l=>{ if(l.game==='metin2'&&l.cat==='ep'){ const sv=o.servers.find(s=>s.id===l.server); if(sv&&sv.sec==='tr'){ l.sec='tr'; l.server=null; } } if(!l.cover&&!l.img&&l.game!=='cs2'){ const c=l.game==='diger'?({hesap:'karakter',epin:'ep',yang:'yang',item:'item'}[l.cat]||'item'):(['yang','item','karakter','ep'].includes(l.cat)?l.cat:'item'); l.cover=c+'-'+(((l.no||1)%5)+1); } });
  if(!o.covers) o.covers={};
  const KK=t=>String(t==null?'':t).replace(/(\d)\s?KK\b/g,'$1M').replace(/\bKK\b/g,'M');
  o.listings.forEach(l=>{ l.title=KK(l.title); l.desc=KK(l.desc); }); o.orders.forEach(x=>{ x.title=KK(x.title); }); o.exchange.forEach(x=>{ x.unit=KK(x.unit); }); o.ads.forEach(a=>{ a.text=KK(a.text); a.title=KK(a.title); });
  o.users.forEach(u=>{ if(u.bonus==null) u.bonus=0; if(!u.ibans) u.ibans=[]; });
  const u4=o.users.find(u=>u.id==='u4'); if(u4&&!u4.ibans.length) u4.ibans.push({id:'ib1',bank:'Ziraat Bankası',name:'Mert Yıldız',iban:'TR000001000000000000000009'});
  const u2=o.users.find(u=>u.id==='u2'); if(u2&&!u2.ibans.length) u2.ibans.push({id:'ib2',bank:'Garanti BBVA',name:'Deniz Yılmaz',iban:'TR000006200000000000000012'});
  o.wd.forEach(w=>{ if(!w.bank) w.bank='Ziraat Bankası'; if(w.taxpayer==null) w.taxpayer=false; });
  if(!o.set.egp) o.set.egp={on:true,autoOnApprove:true,seri:'YGP',seq:103,stopaj:0,company:'YangPazar Bilişim ve Dijital Oyun Hizmetleri Ltd. Şti.',vd:'Muğla Vergi Dairesi',vkn:'9340812450',mersis:'0934081245000001',addr:'Menteşe / Muğla, Türkiye',provider:'GİB e-Belge / QNB eFinans',descTpl:'213 Sayılı VUK Md. 234 kapsamında vergi mükellefi olmayan gerçek kişiden dijital oyun içi varlık / yang / item tedariki ve bakiye ödemesi ({banka} - {iban})'};
  if(!o.set.egpSeed1){
    o.set.egpSeed1=1; const T=Date.now();
    if(!o.wd.some(w=>w.id==='w0')){
      o.wd.push({id:'w0',u:'u2',amount:850,fee:0,brut:850,stopajPct:0,stopaj:0,net:850,bank:'Garanti BBVA',iban:'TR42 0006 2000 1230 0006 2987 11',name:'Deniz Kaya',tckn:'24*******96',taxpayer:false,status:'onaylandı',t:T-3*D,pt:T-3*D+2*H,egp:{no:'YGP2026000000101',ettn:'8a41b2c0-7d12-49e1-a831-99120481cf21',t:T-3*D+2*H,sellerName:'Deniz Kaya',userName:'Deniz_TR',tckn:'',tel:'0532 410 22 88',email:'deniz@ornek.com',addr:'Türkiye (Bireysel / Vergi Mükellefi Değil)',bank:'Garanti BBVA',iban:'TR42 0006 2000 1230 0006 2987 11',amount:850,fee:0,brut:850,stopajPct:0,stopaj:0,net:850,desc:'213 Sayılı VUK Md. 234 kapsamında vergi mükellefi olmayan gerçek kişiden dijital oyun içi varlık / yang / item tedariki ve bakiye ödemesi (Garanti BBVA - TR42 0006 2000 1230 0006 2987 11)',company:'YangPazar Bilişim ve Dijital Oyun Hizmetleri Ltd. Şti.',vd:'Muğla Vergi Dairesi',vkn:'9340812450',mersis:'0934081245000001',compAddr:'Menteşe / Muğla, Türkiye',provider:'GİB e-Belge / QNB eFinans'}});
    }
    if(!o.wd.some(w=>w.id==='w2')){
      o.wd.push({id:'w2',u:'u1',amount:2400,fee:0,brut:2400,stopajPct:0,stopaj:0,net:2400,bank:'Ziraat Bankası',iban:'TR19 0001 0012 3456 7890 1234 01',name:'Burak Demir',tckn:'41*******18',taxpayer:false,status:'onaylandı',t:T-5*D,pt:T-5*D+3*H,egp:{no:'YGP2026000000102',ettn:'c9104e82-15b9-41d0-a710-3351908ab104',t:T-5*D+3*H,sellerName:'Burak Demir',userName:'KurtPazar',tckn:'',tel:'0532 000 00 01',email:'kurt@ornek.com',addr:'Türkiye (Bireysel / Vergi Mükellefi Değil)',bank:'Ziraat Bankası',iban:'TR19 0001 0012 3456 7890 1234 01',amount:2400,fee:0,brut:2400,stopajPct:0,stopaj:0,net:2400,desc:'213 Sayılı VUK Md. 234 kapsamında vergi mükellefi olmayan gerçek kişiden dijital oyun içi varlık / yang / item tedariki ve bakiye ödemesi (Ziraat Bankası - TR19 0001 0012 3456 7890 1234 01)',company:'YangPazar Bilişim ve Dijital Oyun Hizmetleri Ltd. Şti.',vd:'Muğla Vergi Dairesi',vkn:'9340812450',mersis:'0934081245000001',compAddr:'Menteşe / Muğla, Türkiye',provider:'GİB e-Belge / QNB eFinans'}});
    }
  }
  if(!o.exOrders.some(x=>x.id==='B5010')){
    const T=Date.now();
    o.exOrders.unshift({
      id:'B5010',u:'u2',dir:'al',ex:'x2',server:'t2',qty:20,price:22.5,total:450.0,reserve:0,
      paid:{nw:0,w:450.0},cost:0,fills:[],delivered:0,place:o.set.exPlace||'CH2 Mavi Bayrak Gardiyan Yanı',
      status:'bekliyor',t:T-20*60000,f:{b1:'DenizMarmara',f1:'DenizMarmara'},staff:null,
      log:[{t:T-20*60000,x:'Sipariş alındı: 20 Won × 22.50 TL = 450.00 TL bakiyeden çekildi.'}]
    });
  }
  if(!o.set.hh) o.set.hh={on:false,pct:30,until:null};
  if(o.set.refOn==null){ o.set.refOn=true; o.set.refMin=100; o.set.refMax=50; }
  if(!o.vip) o.vip=JSON.parse(JSON.stringify(VIP0)); if(o.set.pvpEpOn==null) o.set.pvpEpOn=true;
  if(o.rev.ep==null) o.rev.ep=0;
  if(!o.epProducts){ const mk=(ep,price,v,n)=>({id:'ep'+ep,grp:'Metin2 EP',ep,price,v,hh:true,on:true,soldN:0,codes:Array.from({length:n},(_,i)=>'M2EP-'+String(ep).padStart(5,'0')+'-'+Math.random().toString(36).slice(2,6).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase())}); o.epProducts=[mk(500,149,1,8),mk(1000,289,2,12),mk(2500,705,3,6),mk(5000,1390,4,4),mk(10000,2750,5,2)]; o.epOrders=[]; o.epSeq=1000; }
  if(!o.slides) o.slides=[{id:'sl1',on:true,title:'Metin2 EP anında teslim',text:'Kodunuz ödeme anında ekranınızda. Happy Hour’da aynı fiyata daha fazla EP.',link:'#metin2-ep',btn:'EP al',c:['#4f1a86','#d07a12'],media:[]}];
  o.listings.forEach(l=>{ if(l.game==='metin2'&&l.cat==='ep'&&l.sec==='tr'&&l.status!=='kaldirildi') l.status='kaldirildi'; });
  o.listings.forEach(l=>{ if(l.game!=='metin2'&&l.status!=='kaldirildi') l.status='kaldirildi'; });
  const slt=o.listings.find(l=>l.title==='AK-47 | Slate'); if(slt){ Object.assign(slt,{game:'metin2',server:'s1',cat:'item',title:'+9 Kırmızı Ejderha Kalkanı',status:'aktif',stock:2,price:520,cover:'item-3',desc:'Taşları tam, 3 efsun. Köy 1 de ticaretle teslim.',del:'15 dk'}); delete slt.skin; delete slt.img; }
  o.orders.forEach(x=>{ if(x.title==='AK-47 | Slate'){ x.title='+9 Kırmızı Ejderha Kalkanı'; x.info='DenizSura'; (x.chat||[]).forEach(m=>{ if(/Steam|Takas teklifini/.test(m.x)) m.x='Köy 1 de ticaretle verdim, envanterinizi kontrol eder misiniz?'; }); } });
  const u3_=o.users.find(u=>u.id==='u3'); if(u3_&&u3_.name==='SkinHane') u3_.name='EfsunHane';
  o.notifs.forEach(n=>{ n.x=n.x.replace('AK-47 | Slate','+9 Kırmızı Ejderha Kalkanı').replace('SkinHane','EfsunHane'); });
  o.raffles.forEach(r=>{ if(/Karambit/.test(r.title)){ r.title='+9 Ejderha Kılıcı · 5 efsun'; r.value=3450; } });
  o.ads.forEach(a=>{ if(a.text) a.text=a.text.replace(/,?\s*\d+\s*oyuncu online/i,''); });
  o.exOrders.forEach(x=>{ if(!x.fills) x.fills=[]; x.fills.forEach(f=>{ if(f.sell==null) f.sell=x.price; if(f.paidQty==null) f.paidQty=x.status==='tamam'?f.qty:0; }); if(x.delivered==null) x.delivered=x.status==='tamam'?x.qty:0; if(x.reserve==null) x.reserve=0; });
  if(!o.set.maint) o.set.maint={on:false,msg:'Sitemizde kısa bir bakım çalışması yapıyoruz. Bakiyeniz, ilanlarınız ve siparişleriniz güvende; kısa süre içinde geri döneceğiz.',until:null};
  if(o.set.autoBk==null) o.set.autoBk=15;
  if(!o.winback) o.winback=[];
  if(!o.users.some(u=>u.id==='u6')){ const T=Date.now(); o.users.push({id:'u6',name:'EskiOyuncu',ad:'Kaan',soyad:'Aydın',tel:'0538 000 00 07',email:'kaan@ornek.com',pass:'1234',bal:42,bonus:0,ibans:[],rating:5,sales:0,joined:'Mart 2024',verified:false,vol:2600,pts:180,lastSeen:T-41*D},{id:'u7',name:'SessizKurt',ad:'Ece',soyad:'Şahin',tel:'0539 000 00 08',email:'ece@ornek.com',pass:'1234',bal:0,bonus:15,ibans:[],rating:5,sales:0,joined:'Ocak 2025',verified:false,vol:640,pts:60,lastSeen:T-19*D}); }
  if(!o.ledger){ const T=Date.now(); const L=[]; const add=(t,k,u,a,x)=>L.push(Object.assign({id:'g'+L.length,t,k,u,a:r2(a)},x||{}));
    const GW={kart:['PayTR','kart',false],eft:['PayTR Havale/EFT','eft',true],hv:['Manuel havale','eft',true],pp:['Papara','cuzdan',false]};
    const plan=[['u2','kart',250],['u4','eft',500],['u1','hv',1000],['u5','pp',150],['u3','kart',100],['u2','eft',300]]; const com=[410,520,380,690,540,760,120];
    for(let i=0;i<7;i++){ const d0=new Date(T-(6-i)*D); d0.setHours(0,0,0,0); const base=d0.getTime();
      plan.forEach(([u,g,a],j)=>{ if((i+j)%3===2) return; const G=GW[g]; add(base+(9+j*2)*H+i*7*60000,'yukleme',u,a*(1+((i*j)%4)*0.25),{m:G[0],cat:G[1],w:G[2]}); });
      add(base+20*H,'satis','u1',com[i]/0.08,{fee:com[i],net:r2(com[i]/0.08-com[i]),ref:'demo'});
      if(i%2===0) add(base+16*H,'cekim_odendi','u5',300+i*50,{m:'Ziraat Bankası'});
      if(i%3===0){ add(base+12*H,'ep','u2',289,{m:'1.000 EP'}); if(base+12*H<=T) o.revLog.push({t:base+12*H,k:'ep',a:289}); }
      add(base+21*H,'bonus','u2',[1,2,5][i%3],{m:'Şans çarkı'}); }
    add(T-2*D,'cekim_talep','u4',600,{m:'Ziraat Bankası',ref:'w1'}); add(T-45*D,'yukleme','u6',500,{m:'PayTR Havale/EFT',cat:'eft',w:true}); add(T-20*D,'yukleme','u7',100,{m:'PayTR',cat:'kart',w:false});
    o.ledger=L.filter(g=>g.t<=T).sort((a,b)=>b.t-a.t); }
  if(o.packs&&!o.packs.yan) o.packs.yan={name:'Yan Reklam (Sağ + Sol)',desc:'Geniş ekranlarda sayfanın sağ ve sol boşluğunda, iki taraf birlikte satılır. Sayfa kaydırılsa da görünür kalır.',p:[250,1400,4900],cap:1};
  if(o.packs&&!o.set.altban30){ o.set.altban30=1; if(!o.packs.altbanner){ const N={}; Object.entries(o.packs).forEach(([k,v])=>{ N[k]=v; if(k==='banner') N.altbanner={name:'Sağ Sütun Alt Banner 300×600',desc:'Ana sayfa sağ sütunun en altında, büyük görselli dikey alan.',p:[150,850,2900],cap:1}; }); if(!N.altbanner) N.altbanner={name:'Sağ Sütun Alt Banner 300×600',desc:'Ana sayfa sağ sütunun en altında, büyük görselli dikey alan.',p:[150,850,2900],cap:1}; o.packs=N; } }
  Object.entries({slider:5,popup:2,premium:6,banner:3,text:6}).forEach(([k,c])=>{ if(o.packs[k]&&o.packs[k].cap==null) o.packs[k].cap=c; });
  o.ads.forEach(a=>{ if(!a.status) a.status='onayli'; if(!a.start) a.start=Math.min(Date.now()-D,a.until-7*D); });
  if(o.set.exBuyOn==null){ o.set.exBuyOn=true; o.set.exSellOn=true; o.set.exOffMsg='Teslimatlar kısa süreliğine durduruldu, yakında yeniden açılacak.'; }
  if(o.set.tfaOn==null) o.set.tfaOn=true; if(!o.mailLog) o.mailLog=[];
  if(o.sms.ev.call==null){ o.sms.ev.call=true; o.sms.tpl.call='{site} borsa #{no}: {mesaj}'; } if(o.sms.ev.tfa==null){ o.sms.ev.tfa=true; o.sms.tpl.tfa='{site} dogrulama kodunuz: {kod}. Kodu kimseyle paylasmayin.'; }
  if(!o.set.bk5){ o.set.bk5=1; if(+o.set.autoBk===15) o.set.autoBk=5; }
  if(!o.set.adDemo){ o.set.adDemo=1; const st=dayStart(Date.now()+2*D); o.ads.push({id:'a99',type:'banner',server:'s7',title:'Bozok2',text:'Boss avı haftası: her boss 2 kat drop.',start:st,until:st+7*D,days:7,active:true,price:700,paid:{nw:0,w:700},owner:'u4',media:[],status:'onay',bookedAt:Date.now()-40*60000}); }
  if(o.set.exOn==null){ o.set.exOn=true; }
  if(!o.set.exMsg9){ o.set.exMsg9=1; o.set.exOffMsg='Yang Borsası kısa bir süreliğine hizmet vermiyor. Açık siparişleriniz iptal edildi ve ödemeleriniz bakiyenize iade edildi. Hizmet yeniden açıldığında siparişlerinizi kolayca yeniden oluşturabilirsiniz. Anlayışınız için teşekkür ederiz.'; }
  if(!o.set.adStat9){ o.set.adStat9=1; const OW={a1:'u1',a2:'u4',a3:'u5',a4:'u4',a5:'u1',a6:'u4',a7:'u3',a8:'u5',a9:'u3',a10:'u3',a11:'u1',a12:'u4',a13:'u5'}; const PER={slider:420,popup:610,premium:260,banner:300,text:520};
    o.ads.forEach((a,i)=>{ if(!a.owner&&OW[a.id]) a.owner=OW[a.id]; if(a.views==null&&(a.status||'onayli')==='onayli'){ a.st={}; let v=0,c=0; for(let d=6; d>=0; d--){ const t=Date.now()-d*D; if(t<(a.start||0)) continue; const vv=Math.round((PER[a.type]||200)*(0.7+((i*7+d*3)%10)/16)); const cc=Math.round(vv*(0.02+((i+d)%5)/100)); a.st[dkey(t)]=[vv,cc]; v+=vv; c+=cc; } a.views=v; a.clicks=c; } }); }
  o.deps.forEach(d=>{ if(d.id==='d1'&&!d.txAt){ d.txAt=d.t-6*60000; d.toBank='Ziraat Bankası'; } });
  if(!o.cryptoNets){ const kg=o.gws.find(g=>g.id==='kripto'); const ad=kg&&kg.keys&&kg.keys['Cüzdan adresi']||'TDemoCuzdanAdresiBurayaYazilir000'; o.cryptoNets=[{id:'cn1',coin:'USDT',net:'TRC20 (Tron)',addr:ad,note:'Komisyonsuz · önerilen',on:true},{id:'cn2',coin:'USDT',net:'BEP20 (BSC)',addr:'0xDemoBep20CuzdanAdresi0000000000000000000',note:'Düşük ağ ücreti',on:true}]; if(kg){ kg.keys={}; kg.n='Kripto'; kg.t='USDT · birden fazla ağ · onaylı'; } }
  if(!o.set.data14){ o.set.data14=1; let sd=14071; const R=()=>(sd=(sd*1103515245+12345)%2147483648)/2147483648; const P=a=>a[Math.floor(R()*a.length)]; const T=Date.now();
    [['u8','DrakeShop','Ali','Çelik','0541 000 00 08',4.9,640],['u9','Kalkan_TR','Zeynep','Aydın','0542 000 00 09',4.8,215],['u10','MaviEjder','Can','Öztürk','0543 000 00 10',4.6,88],['u11','SuraPazar','Elif','Şahin','0544 000 00 11',5,1020]].forEach(([id,name,ad,soyad,tel,rating,sales])=>{ if(!o.users.some(u=>u.id===id)) o.users.push({id,name,ad,soyad,tel,email:name.toLowerCase()+'@ornek.com',pass:'1234',bal:0,bonus:0,ibans:[],rating,sales,joined:'2024',verified:R()>.3,vol:sales*40,pts:sales,lastSeen:T-Math.floor(R()*48)*H}); });
    const SEL=['u1','u3','u4','u5','u8','u9','u10','u11']; const TR=o.servers.filter(s=>s.sec==='tr'), PV=o.servers.filter(s=>s.sec==='pvp'); const DEL=['Anında','5 dk','15 dk','30 dk','1 saat'];
    const ITEMS=['+9 Zehir Kılıcı','+9 Ejderha Kılıcı','+9 Kara Çelik Zırh','+9 Kırmızı Ejderha Kalkanı','+7 Hilal Bıçak','+9 Siyah Kaplan Yayı','+9 Anka Kanadı Yelpaze','Elmas Simya seti (6 taş)','+9 Mavi Ejder Kemeri','+9 Şeytan Kılıcı','+9 Kırmızı Demir Kask','+9 Bilge Kolye','Kış Savaşçısı kostümü','Kar Leoparı binek mührü','+9 Ateş Kanadı Küpe','+9 Ay Işığı Bileziği','Efsunlu kuşak %20 DSS','Efsun nesnesi x50','Ruh taşı x10','Beceri kitabı paketi'];
    const IFX=['%45 ortalama zarar','5/5 efsun','taşları tam','PVP efsunlu','yarı insan %10','temiz efsun','kritik %10','delici %10'];
    const CHR=[['Savaşçı','Bedensel'],['Savaşçı','Zihinsel'],['Sura','Büyülü Silah'],['Sura','Kara Büyü'],['Ninja','Yakın Dövüş'],['Ninja','Uzak Dövüş'],['Şaman','Ejderha Gücü'],['Şaman','İyileştirme'],['Lycan','İçgüdü']];
    const add=(sec,cat,i)=>{ const sv=P(sec==='tr'?TR:PV); let title,price,stock;
      if(cat==='yang'){ title=sec==='tr'?`${sv.name} Won · ${P(['anında teslim','toptan satış','7/24 hazır stok','uygun kur','hızlı teslimat'])}`:`${sv.name} 100M Yang · ${P(['bol stok','anında','toptan','parça satış'])}`; price=+(sec==='tr'?(17+R()*10):(3+R()*12)).toFixed(2); stock=Math.floor(20+R()*900); }
      else if(cat==='item'){ title=`${P(ITEMS)} · ${P(IFX)}`; price=Math.round(sec==='tr'?(80+R()*3400):(30+R()*900)); stock=1+Math.floor(R()*3); }
      else if(cat==='karakter'){ const [k,b]=P(CHR); title=`${sec==='tr'?90+Math.floor(R()*31):110+Math.floor(R()*11)} Lv ${k} (${b}) · ${P(['full set','itemli','mail değişimli','temiz hesap','beceriler M1','farm hesabı'])}`; price=Math.round(sec==='tr'?(900+R()*14000):(200+R()*3800)); stock=1; }
      else { const n=P([500,1000,2500,5000,10000]); title=`${sv.name} ${NUM(n)} EP · ${P(['anında','kodla teslim','toplu satış'])}`; price=Math.round(n*(0.025+R()*.02)); stock=Math.floor(5+R()*50); }
      const dop={}; if(i%6===0) dop.vitrin=T+4*D; if(i%7===3) dop.acil=T+2*D; if(i%5===2) dop.renk=T+3*D;
      o.listings.push({id:'tl'+sec+cat+i,no:++o.lno,seller:P(SEL),game:'metin2',server:sv.id,cat,title,price,stock,del:P(DEL),status:'aktif',t:T-Math.floor(R()*96*60)*60000,views:Math.floor(20+R()*900),dop,desc:`${title}. Satın aldıktan sonra karakter adınızı yazın, ${P(['Köy 1','CH1 market','Mavi bayrak'])} noktasında ticaretle teslim ediyorum.`,cover:`${cat}-${1+Math.floor(R()*10)}`}); };
    ['yang','item','karakter'].forEach(c=>{ for(let i=0;i<20;i++) add('tr',c,i); }); ['yang','item','karakter','ep'].forEach(c=>{ for(let i=0;i<20;i++) add('pvp',c,i); });
    const BT=['+9 Zehir Kılıcı %40+ ortalama','100 Won toptan alınır','105 Lv Sura (Büyülü Silah)','Kar Leoparı binek','Elmas simya seti','+9 Anka Kanadı Yelpaze','50 Won acil','Lycan karakter 100+','Efsunlu kuşak','+9 Bilge Kolye','10.000 EP alınır','Kış kostümü','PVP Savaşçı full +15','Ruh taşı x20','Hazır lonca karakteri','+9 Siyah Kaplan Yayı','Beceri kitabı M1','Şaman (Ejderha) 95 Lv','Ay Işığı Bileziği','Kara Çelik Zırh +9'];
    BT.forEach((t_,i)=>{ const sv=P(R()>.45?TR:PV); o.bounties.push({id:'tb'+i,u:P(['u2','u4','u5','u8','u10','u11']),server:sv.id,title:t_,budget:Math.round(100+R()*4000),t:T-Math.floor(R()*72)*H,desc:P(['Taşları tam olsun.','Mail devri ile.','Hızlı dönüş yapan satıcı.','Pazarlık payı var.','Ticaretle teslim.'])}); });
    o.bounties.forEach(b=>{ if(!b.server) b.server='t1'; });
  }
  if(!o.set.data14b){ o.set.data14b=1; let sd=88123; const R=()=>(sd=(sd*1103515245+12345)%2147483648)/2147483648; const P=a=>a[Math.floor(R()*a.length)]; const T=Date.now(); const rr=v=>Math.round(v*100)/100;
    const SU=['u1','u3','u4','u5','u8','u9','u10','u11','u2'], BU=['u2','u10','u11','u8','u9','u4']; const CH=['DenizSura','KaraKurt','AyYildiz','Ejderci','SessizNinja','BuzSaman','KizilLycan','GeceSavascisi','TanriTurk','AltinOk'];
    let bn=0; const oid=()=>'B5'+String(++bn).padStart(3,'0');
    const mkOf=(x,u,q,left,price,mins,st)=>{ const of={id:'E'+(++o.ofSeq),u,ex:x.id,qty:q,left,price,t:T-mins*60000,status:st,f:{f1:'hesap_'+u+'_'+o.ofSeq,f2:'sifre'+(100+o.ofSeq),f3:P(CH)+o.ofSeq,f4:R()>.5?String(1000+Math.floor(R()*9000)):'',f5:R()>.6?u+'@ornek.com':'',f6:P(['Hemen','Bugün 18:00 sonrası','Yarın sabah'])}}; o.exOffers.push(of); return of; };
    o.exchange.forEach((x,xi)=>{ const mx=x.max||10;
      // farklı fiyatlarda satış emirleri (siteye sat)
      const n=6+Math.floor(R()*4); for(let i=0;i<n;i++){ const p=rr(mx*(0.68+R()*0.32)); const q=P([10,15,25,40,60,80,120,150,200,300]); mkOf(x,P(SU),q,q,Math.min(mx,p),Math.floor(10+R()*2800),'aktif'); }
      if(xi%2===0){ const q=50; mkOf(x,P(SU),q,Math.floor(q*0.4),rr(mx*0.8),900,'aktif'); }
      mkOf(x,P(SU),30,30,rr(mx*0.9),5000,'iptal');
      const bp=x.buy||rr(mx*1.12); const sv=x.server;
      const ord=(u,q,st,mins,fills,dlv,extra)=>{ const tot=rr(q*bp); const o2=Object.assign({id:oid(),u,dir:'al',ex:x.id,server:sv,qty:q,price:bp,total:tot,reserve:0,paid:{nw:0,w:tot},cost:rr(fills.reduce((t,f)=>t+f.qty*f.price,0)),fills,delivered:dlv,place:o.set.exPlace,status:st,t:T-mins*60000,f:{b1:P(CH)},staff:st==='bekliyor'?null:'st1',log:[{t:T-mins*60000,x:`Sipariş alındı: ${q} adet × ${bp.toFixed(2)} TL = ${tot.toFixed(2)} TL bakiyeden çekildi.`}]},extra||{}); o.exOrders.push(o2); return o2; };
      // eşlenmemiş bekleyen alım siparişleri (Eşle testi için)
      const k=2+Math.floor(R()*2); for(let i=0;i<k;i++) ord(P(BU),P([5,8,10,12,20,25,30,50]),'bekliyor',Math.floor(5+R()*600),[],0);
      // kısmen eşlenmiş, teslim bekleyen
      { const of=mkOf(x,P(SU),20,0,rr(mx*0.78),700,'satildi'); const o2=ord(P(BU),35,'bekliyor',650,[{of:of.id,u:of.u,qty:20,price:of.price,sell:bp,paidQty:0}],0); o2.log.push({t:T-640*60000,x:`Yönetici satış emri #${of.id} ile 20 adet eşledi. Eşlenecek kalan: 15 adet.`}); }
      // kısmen teslim edildi
      if(xi%2===1){ const of=mkOf(x,P(SU),25,0,rr(mx*0.82),1500,'satildi'); const o2=ord(P(BU),40,'kismen',1450,[{of:of.id,u:of.u,qty:25,price:of.price,sell:bp,paidQty:15}],15); o2.log.push({t:T-1400*60000,x:`Kısmi teslim yapıldı: 15 / 40 adet.`}); }
      // tamamlanan
      { const q=P([10,20,30]); const of=mkOf(x,P(SU),q,0,rr(mx*0.8),3000,'satildi'); delete of.f.f2; delete of.f.f4; ord(P(BU),q,'tamam',2900,[{of:of.id,u:of.u,qty:q,price:of.price,sell:bp,paidQty:q}],q).log.push({t:T-2800*60000,x:`Siparişin tamamı teslim edildi (${q} adet), satıcıya ödeme yapıldı.`}); }
      // iptal
      if(xi%3===0){ const o2=ord(P(BU),15,'iptal',4000,[],0); o2.log.push({t:T-3900*60000,x:'Alıcının isteğiyle iptal edildi, tutar iade edildi.'}); o2.total=0; }
    });
    o.exOrders.sort((a,b)=>b.t-a.t); o.exOffers.sort((a,b)=>b.t-a.t);
  }
  if(!o.set.exf14){ o.set.exf14=1; o.exFields=[
    {id:'f5',label:'Giriş Mail',type:'text',req:true,secret:false,note:''},
    {id:'f2',label:'Giriş Şifre',type:'password',req:true,secret:true,note:''},
    {id:'f1',label:'Giriş ID',type:'text',req:true,secret:false,note:''},
    {id:'f3',label:'Karakter Adı',type:'text',req:true,secret:false,note:''}];
    (o.exOffers||[]).forEach(of=>{ if(of.f&&!of.f.f5&&of.f.f1) of.f.f5=String(of.f.f1).replace(/[^a-z0-9_]/gi,'').toLowerCase()+'@ornek.com'; }); }
  if(!o.set.adDemo15){ o.set.adDemo15=1; const T=Date.now(); const ds=dayStart(T);
    [{id:'au1',type:'banner',server:'s5',title:'Asuman2',text:'Farm haftası: tüm metinlerde 2 kat yang.',start:ds-2*D,until:ds+5*D,days:7,active:true,price:700,status:'onayli'},
     {id:'au2',type:'premium',server:'s5',title:'Asuman2',text:'1-120 Farm · her gün etkinlik',start:ds-6*D,until:T+9*H,days:7,active:true,price:520,status:'onayli'},
     {id:'au3',type:'slider',server:'s5',title:'Asuman2 büyük güncelleme',text:'Yeni harita ve 120 level sınırı geliyor.',start:ds+3*D,until:ds+10*D,days:7,active:true,price:1500,status:'onay',bookedAt:T-55*60000},
     {id:'au4',type:'popup',server:'s5',title:'Asuman2',text:'Açılışa özel başlangıç paketi.',start:ds+1*D,until:ds+8*D,days:7,active:true,price:900,status:'onayli'},
     {id:'au5',type:'text',server:'s5',title:'Asuman2',text:'Yeni sezon başladı!',start:ds-20*D,until:ds-13*D,days:7,active:true,price:150,status:'onayli'},
     {id:'au6',type:'banner',server:'s5',title:'Asuman2',text:'Görseldeki yazılar okunmuyor.',start:ds+2*D,until:ds+9*D,days:7,active:false,price:700,status:'red',reason:'Görseldeki yazılar okunmuyor, lütfen daha net bir görsel yükleyin.'}
    ].forEach(a=>{ if(!o.ads.some(x=>x.id===a.id)) o.ads.push(Object.assign({owner:'u2',media:[],paid:{nw:0,w:a.price},bookedAt:a.start-D},a)); }); }
  if(o.dopings&&o.dopings.ust) delete o.dopings.ust;
  if(o.dopings){ const DS={vitrin:'Kendi serverının vitrininde ve ana sayfada',acil:'Kırmızı ACİL etiketi',renk:'Listede dikkat çeken zemin'}; const PD={vitrin:7,acil:4.5,renk:3}; Object.keys(DS).forEach(k=>{ const d=o.dopings[k]; if(!d) return; if(d.pd==null) d.pd=PD[k]; if(d.max==null) d.max=30; if(/7 gün|^Ana sayfa vitrininde/.test(d.desc||'')) d.desc=DS[k]; }); }
  if(!o.mail){ o.mail={on:true,host:'smtp.gmail.com',port:587,sec:'tls',user:'',pass:'',fromName:o.set.siteName||'yangpazar.com',from:'bildirim@yangpazar.com',ev:{welcome:true,tfa:true,sold:true,delivered:true,confirmed:true,dispute:true,borsa:true,call:true,withdraw:true,ad:true,raffle:true,ticket:false},tpl:{}}; }
  o.set.tfaForce=false;
  if(!o.set.wdFee) o.set.wdFee={on:false,type:'sabit',val:5,min:0,max:0}; if(o.rev&&o.rev.cekim==null) o.rev.cekim=0;
  if(!o.set.newsrv17){ o.set.newsrv17=1; const y=o.servers.find(x=>x.name==='Yeşim2')||o.servers.filter(x=>x.sec==='pvp').sort((a,b)=>(b.open||0)-(a.open||0))[0]; if(y&&!y.added) y.added=Date.now()-2*D; }
  (o.raffles||[]).forEach(r=>{ if(r.per==null){ r.per=100; r.cats=[]; r.minVip=''; r.maxTk=0; r.free=true; r.acc={}; } });
  if(!o.set.rf16){ o.set.rf16=1; const T=Date.now(); if(!o.raffles.some(r=>r.id==='r16')) o.raffles.unshift({id:'r16',title:'5.000 TL Bakiye · Altın+ üyelere özel',kind:'bal',value:5000,end:T+5*D,tk:{u3:6,u5:4},acc:{},per:500,cats:['yang','borsa'],minVip:'altin',maxTk:50,free:false,c:['#1d375a','#3b9fdc']}); }
  if(!(o.set.autoConfirm<=12)) o.set.autoConfirm=12;
  if(!o.set.ord17){ o.set.ord17=1; let sd=31337; const R=()=>(sd=(sd*1103515245+12345)%2147483648)/2147483648; const P=a=>a[Math.floor(R()*a.length)]; const T=Date.now();
    const L=o.listings.filter(l=>/^tl/.test(l.id)); const BU=['u2','u8','u9','u10','u11','u4','u5']; const plan=[['odendi',7],['teslim',7],['itiraz',4],['tamam',9],['iade',3]];
    const INFO=['DenizSura','KaraKurt','AyYildiz','SessizNinja','BuzSaman','GeceSavascisi','AltinOk'];
    const REAS=['Teslim edilen item +7 çıktı, ilanda +9 yazıyordu.','Eksik yang teslim edildi, 20 Won yerine 15 Won geldi.','Karakterin maili değiştirilmedi, hesaba giremiyorum.','Efsunlar ilandakinden farklı, ortalama zarar düşük.'];
    const CH=['Merhaba, karakterim köy 1 de bekliyor.','Ne zaman teslim edebilirsiniz?','CH2 mavi bayraktayım.','Teşekkürler, sorunsuz geldi.','Biraz acil, akşama oyunda olmam lazım.'];
    let k=0; plan.forEach(([st,n])=>{ for(let i=0;i<n;i++){ const l=L[(k*7+3)%L.length]; k++; let b=P(BU); if(b===l.seller) b=BU.find(x=>x!==l.seller); const q=l.cat==='yang'?P([2,5,10,20]):1; const tot=Math.round(l.price*q*100)/100; const t0=T-Math.floor((st==='odendi'?1+R()*5:st==='teslim'?2+R()*20:6+R()*90))*H;
      const od={id:'S'+(100000+(++o.seq)),lid:l.id,title:l.title,buyer:b,seller:l.seller,qty:q,total:tot,rate:7,status:st,t:t0,info:P(INFO),paid:{nw:0,w:tot},log:[{t:t0,x:'Ödeme alındı, tutar güvenli havuza aktarıldı. Satıcıya bildirim ve SMS gönderildi.'}],chat:R()>.4?[{f:b,x:P(CH),t:t0+3*60000}]:[]};
      if(st!=='odendi'){ od.dt=t0+Math.floor(5+R()*50)*60000; const np=1+Math.floor(R()*3); od.dproof=Array.from({length:np},(_,j)=>tradeShot(od,i+j,id=>(o.users.find(x=>x.id===id)||{name:id}).name)); od.log.push({t:od.dt,x:`Satıcı teslim ettiğini bildirdi ve ${np} teslim görseli yükledi (yalnızca yönetim görür).`}); if(R()>.5) od.chat.push({f:l.seller,x:'Teslim ettim, kontrol edip onaylar mısınız?',t:od.dt}); }
      if(st==='itiraz'){ od.reason=P(['Eksik teslim','Yanlış ürün','Hesap sorunu'])+': '+REAS[i%REAS.length]; if(i%2===0) od.proof=shotNote(REAS[i%REAS.length],i); od.log.push({t:od.dt+40*60000,x:'Alıcı itiraz açtı: '+od.reason}); }
      if(st==='tamam'){ od.ct=od.dt+Math.floor(5+R()*120)*60000; od.fee=Math.round(tot*7)/100; od.net=Math.round((tot-od.fee)*100)/100; od.stars=P([5,5,5,4,4,3]); od.log.push({t:od.ct,x:'Alıcı onayladı. Satıcıya ödeme aktarıldı.'}); }
      if(st==='iade'){ od.log.push({t:od.dt+2*H,x:'Yönetici itirazı alıcı lehine sonuçlandırdı. '+tot.toFixed(2)+' TL iade edildi.'}); od.reason='Yanlış ürün: '+REAS[0]; }
      o.orders.push(od); } });
    o.orders.sort((a,b)=>b.t-a.t); }
  if(!o.set.dp18){ o.set.dp18=1; const nm=id=>(o.users.find(x=>x.id===id)||{name:id}).name; o.orders.forEach(od=>{ if(od.dproof&&od.dproof.length&&!od.dpre){ od.dpre=[od.dproof[0]]; od.dpost=[tradeShot(od,1,nm)]; od.dproof=od.dpre.concat(od.dpost); } }); }
  if(!o.set.dl19){ o.set.dl19=1; const PL=['Mavi bayrak gardiyanı','Pazar alanı depocu']; (o.orders||[]).forEach((x,i)=>{ const l=(o.listings||[]).find(z=>z.id===x.lid); const c=l?l.cat:''; if(x.ch||/ep|epin|hesap/.test(c)||/@/.test(x.info||'')) return; x.ch=String(1+(i*7)%6); x.place=PL[i%2]; }); }
  if(!o.set.dl19c){ o.set.dl19c=1; (o.orders||[]).forEach(x=>{ const l=(o.listings||[]).find(z=>z.id===x.lid); if(l&&(l.cat==='karakter'||l.cat==='hesap')){ delete x.ch; delete x.place; if(!/@/.test(x.info||'')) x.info=(String(x.info||'oyuncu').toLowerCase().replace(/[^a-z0-9]/g,'')||'oyuncu')+'@gmail.com'; } }); }
  if(!o.set.ep20){ o.set.ep20=1; o.set.pvpEpOn=false;
    (o.listings||[]).forEach(l=>{ if(l.game==='metin2'&&l.cat==='ep'&&l.status!=='kaldirildi'&&l.status!=='satildi') l.status='kaldirildi'; });
    const PV=(o.servers||[]).filter(x=>x.sec==='pvp'); const pick=['Ejderha2','Asuman2','Altınorda'].map(n=>PV.find(x=>x.name===n)).filter(Boolean); (pick.length?pick:PV.slice(0,3)).forEach((x,k)=>{ x.ep=true;
      [[5000,79],[10000,150],[25000,349]].forEach(([a,pr],j)=>{ o.epProducts.push({id:'ep'+x.id+'_'+a,srv:x.id,grp:x.name+' EP',ep:a,price:pr,v:2+((k+j)%3),hh:false,on:true,soldN:0,codes:Array.from({length:12},(_,i)=>x.name.slice(0,3).toUpperCase()+'-'+a+'-'+(1000+k*100+j*20+i)+'-'+Math.random().toString(36).slice(2,6).toUpperCase())}); }); }); }
  if(!o.set.ep21){ o.set.ep21=1; const T=Date.now(); let k=0; const US=['u2','u10','u11','u3'].filter(id=>(o.users||[]).some(x=>x.id===id));
    if(US.length){ const G=[null,...(o.servers||[]).filter(x=>x.sec==='pvp'&&x.ep).map(x=>x.id)]; G.forEach((g,gi)=>{ (o.epProducts||[]).filter(p=>(p.srv||null)===g&&p.codes.length>2).slice(0,3).forEach((p,pi)=>{ for(let i=0;i<2;i++){ const c=p.codes.shift(); if(!c) break; k++; p.soldN=(p.soldN||0)+1;
      o.epOrders.push({id:'EP'+(++o.epSeq),u:US[(gi+pi+i)%US.length],pid:p.id,ep:p.ep,epShown:p.ep,hh:false,code:c,price:p.price,paid:{nw:0,w:p.price},t:T-(k*7+gi*3)*3600000,srv:g||undefined}); } }); }); o.epOrders.sort((a,b)=>b.t-a.t); } }
  if(!o.set.tpl27){ o.set.tpl27=1; const OLD=['{site}: "{ilan}" ilaniniz satildi. Siparis #{no}. Lutfen teslimata hazirlanin.','{site}: Siparis #{no} teslim edildi. Kontrol edip onaylayin.','{site}: Siparis #{no} onaylandi, {tutar} bakiyenize gecti.','{site}: Siparis #{no} icin itiraz acildi.','{site}: Borsa siparisiniz #{no}: {durum}.','{site}: {tutar} cekim talebiniz gonderildi.','{site} uyesi {gonderen}: {mesaj}','{site} borsa #{no}: {mesaj}','{site} dogrulama kodunuz: {kod}. Kodu kimseyle paylasmayin.'];
    if(o.sms&&o.sms.tpl) Object.keys(o.sms.tpl).forEach(k=>{ if(OLD.includes(o.sms.tpl[k])) delete o.sms.tpl[k]; });
    const MD={order_new:1,sold:1,ready:1,delivered:1,autosoon:1,completed:1,confirmed:1,refund:1,cancel_s:1,dispute:1,dispute_done:1,stock_out:1,listing_ok:1,listing_no:1,deposit_ok:1,deposit_no:1,withdraw_req:1,withdraw:1,withdraw_no:1,ep_code:1,tc_ok:1,pass:1,message:0};
    const SD={order_new:1,ready:1,delivered:1,autosoon:1,refund:1,cancel_s:1,dispute_done:1,withdraw_no:1,pass:1,stock_out:0,completed:0,deposit_ok:0,withdraw_req:0,ep_code:0,tc_ok:0};
    if(o.mail&&o.mail.ev) Object.entries(MD).forEach(([k,v])=>{ if(o.mail.ev[k]==null) o.mail.ev[k]=!!v; });
    if(o.sms&&o.sms.ev) Object.entries(SD).forEach(([k,v])=>{ if(o.sms.ev[k]==null) o.sms.ev[k]=!!v; }); }
  if(!o.set.tr28){ o.set.tr28=1; const NEWTR=[["t1", "Diamond Nite", "#16325c", "#4fa3e8"], ["t3", "Diamond Gram", "#1f3f6b", "#7cc4f5"], ["t4", "Sapphire (Safir)", "#132a7a", "#3f6fe0"], ["t6", "Sapphire (Star)", "#1d2a6e", "#8a7bf0"], ["t7", "Germania", "#3a2a12", "#d4a53a"], ["t8", "Ruby Lucifer", "#5c0f1a", "#e0334f"], ["t10", "Teutonia", "#2b3a1f", "#8fbf4a"], ["t11", "Ruby Türkiye Charon", "#4a0d16", "#c42a3c"], ["t12", "Ruby Chimera", "#5a1420", "#f0566b"], ["t2", "Marmara", "#123f7a", "#3c8fe0"], ["t13", "Arkadaşlar", "#0e5a4f", "#3cc7a8"], ["t14", "Bagjanamu", "#4a2a6b", "#b07ae0"], ["t5", "Barbaros", "#5a1b2b", "#c0394f"], ["t15", "Dandanakan", "#6b3a0e", "#f09a3a"], ["t16", "Ezel", "#2a2a4a", "#7a7ae0"], ["t17", "Ruby Kirin", "#5c1414", "#e65c4a"]];
    const ren={t1:'Emerald',t3:'Anadolu',t4:'Ege'};
    NEWTR.forEach(([id,nm,c1,c2],i)=>{ let sv=o.servers.find(x=>x.id===id); if(!sv){ sv={id,sec:'tr',name:nm,type:'Resmi',lv:'1-120',c:[c1,c2],online:0,open:Date.now()-(3200-i*120)*86400000,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'}; o.servers.push(sv); }
      else if(ren[id]&&sv.name===ren[id]){ const old=sv.name; sv.name=nm; sv.c=[c1,c2]; const fx=t=>typeof t==='string'?t.split(old).join(nm):t; (o.listings||[]).filter(l=>l.server===id).forEach(l=>{ l.title=fx(l.title); l.desc=fx(l.desc); }); (o.orders||[]).forEach(x=>{ const l=(o.listings||[]).find(z=>z.id===x.lid); if(l&&l.server===id) x.title=fx(x.title); }); (o.bounties||[]).filter(b=>b.server===id).forEach(b=>{ b.title=fx(b.title); }); (o.dms||[]).forEach(d=>(d.msgs||[]).forEach(m=>{ m.x=fx(m.x); })); } });
    const ord=NEWTR.map(x=>x[0]); o.servers.sort((a,b)=>(a.sec===b.sec?0:a.sec==='tr'?-1:1)||(a.sec==='tr'?(ord.indexOf(a.id)<0?99:ord.indexOf(a.id))-(ord.indexOf(b.id)<0?99:ord.indexOf(b.id)):0)); }
  if(!o.set.pvp29){ o.set.pvp29=1; const REN={"s1": ["Ejderha2", "Ejder2"], "s2": ["Yeşim2", "Yakamoz2"], "s3": ["Kızılkurt", "Börü2"], "s4": ["Tufan2", "Tuva2"], "s5": ["Asuman2", "Aisha2"], "s6": ["Kaşgar Online", "Kale2"], "s7": ["Bozok2", "Barbaros2"], "s8": ["Altınorda", "Anka2"]}; const ALL=["Aiden2", "Alestamt2 Altay", "Alestamt2 Aspendos", "Aris2", "Börü2", "Justicemt2", "Leader2", "Lusifer2", "Lyra2", "Stage2", "Tigin2", "Verzum2", "1-99.net", "Abluka2", "Adler2", "Aegon2", "Aeldra2", "Aena2", "Aisha2", "Akcan2", "Akira2", "Alamt2", "Albamt2", "Alcazar2", "Alerion2", "Alfa2", "Algan2", "Alpar2", "Alturi2", "Alvis2", "AnadoluMt2", "Anka2", "Arator2", "Arcadia2", "Arcane2", "Aren2", "Ares2", "Arkantos2", "Arslan2", "Arthion2", "Arva2", "Arvion2 Generation", "Arvion2 Return", "Aslanmt2", "Astra2 Estiva", "Avrasya2", "Awakening2", "Ayazmt2", "Ayyildiz2", "Azamet2", "Azyrah2", "Baerim - Eu", "Barbaros2", "Beka2", "Cakirmt2", "Coreoflife", "Darkmt2 Summer", "Demirci2", "Drago2", "Duhan2", "DuskMt2", "DuskMt2 Orta", "Ebedi2", "Efsane2kraliyet", "Ejder2", "Ekinoks2", "Elborn2", "Elion Global", "Elora2", "Elsmetin2", "Elvar2", "Elyron2", "Endoria2", "Erasyon2", "Ervah2", "Eshe2", "Eteria2", "Ezel2", "Faraza2", "Farm2", "Favorimt2", "Fetih2", "Furya2", "FuryMt2", "Gama2", "Giza2", "GlockMt2", "Gokborumt2", "Gökturkmt2", "Grand2", "Han2", "Harbi2 Anadolu", "Harbi2 Mobile", "Hardera", "HardMt2", "HardMt2 Efes", "HardSchool2", "Harp2", "Hazarmetin2", "Hellmt2", "Herakles2", "Heraklesmt2", "Hidra2", "Hilal2", "Hunkarm2", "Hvzm2", "Hyuan2", "ida2", "Josep2", "Jotun2", "Kafalar Metin2", "Kafkas2 - 1-99", "Kale2", "Katze2", "Kayzer2", "Kehanetmt2", "Kraliyet2", "Kriptomt2", "Kuzey2", "Kuzey2 Fetih", "Landof2", "Land Of Heroes", "Legend2", "Lejyon2 Prime", "Lejyon2 Sparta", "Lirin2", "Lodosmt2", "LondonMt2", "Lorgan2", "lostmt2", "LotusMt2", "Lova2 Mobile", "Lucas2 Alesta", "Lucas2 Zeus", "M2-Board", "M2-Hero", "M2Hype Mazi", "Magnusmt2", "Mahşer2", "Mandes2", "Manwe2 - Eski", "Manwe2 - Yeni", "Maraz2", "MarkMt2", "Markmt2 1-99", "Mekanmt2", "Mergen2 Global", "MerlinMt2", "Mestan2", "Meta2online", "Metin55", "MetinŞah", "Midas2", "Miras2", "Misali2 Feda", "Mobile2 Alesta", "Mobile2 Tuva", "Mobile2 Yakamoz", "MSP2 Global - Eski", "MSP2 Global - Yeni", "MT2009-EU", "Mt2browsergame", "Naira2", "Naira2 Son Sancak", "NarniaMt2", "Navy2", "Neomt2", "Nethan2", "Neuri", "Neva2", "NewMt2", "Nexum2", "Nirvanamt2", "Nova2", "Nutuk2", "Ocas2", "Olibya2", "Onxer Online", "Origins2", "Oryum2", "Pamera2", "Payidar2", "Perver2", "Phebia Global 1-120", "Phebia Summer", "Prisma Levia", "Projekt Hard2", "Projemetin2", "Razer2online", "Rebel2allstar", "Regulus2", "Reinamt2", "Remastered2", "Ribut", "Risalemt2", "Rise Guardian Sky2", "Riseon2", "Rivalmt2", "Rivalya2", "Rodniamt2", "Rohan2 Mobile", "Rohan2 World", "Rohan Erebor(S1-S2-S3)", "RoMDestan", "Romia2", "Ronin2 Nefertiti", "Rosso2", "Rove2mt2", "Royale2 Akademi Teos", "Royale2 Ephesus", "Royale2 Pergamon", "Royale2 Teos", "Rubinum", "Rubinum Classic", "Ruby2 Prestige", "Rumeli2", "Rutan2", "Sagroth2", "Saka2", "SaltanatM2", "Sancakmt2", "Saray2", "Sayles2", "Seca2", "Sekaii", "Servet2", "Sevdrax2", "Sezar2", "Shadow2", "Sheva2", "Sofi2 Destan", "Sparky2", "Sportmt2", "Star2 Alesta", "Sultanmt2", "Szarkmt2", "Tarantin2 Miras", "Tarumar2", "testmt2", "Triarchonline", "Truva2", "Tundramt2", "Turna2", "Tuva2", "Uluhan2", "Vayrox2", "Velar2", "Venüsmt2", "Vigorm2", "Vikingmt2", "Waryong2", "WoM2", "Yakamoz2", "Yenermt2", "Yt2g", "Zenaris2", "Zeromt2", "Zevaron2", "Zeyra2", "M2end", "Tarantin2", "Onlinemetin2", "Yunara2", "LonexMt2", "Osi2", "M2blood", "Lamira2"];
    const PAL=[['#7a1f1f','#e0573a'],['#1f4f7a','#3c9fe0'],['#2f6b1f','#7ccf4c'],['#5a2a7a','#b57ae0'],['#7a5a0f','#eec244'],['#0f5a5a','#3cc7c7'],['#6b1f4f','#e04f9f'],['#3a3a5a','#8f8fe0'],['#7a3a0f','#f08a3a'],['#1f2f4f','#5a8fd0']];
    const slg=v=>String(v).toLocaleLowerCase('tr-TR').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); let js=JSON.stringify(o); Object.values(REN).forEach(([a,b])=>{ js=js.split(a).join(b); js=js.split(slg(a)).join(slg(b)); }); Object.assign(o,JSON.parse(js));
    o.servers.filter(x=>x.sec==='pvp').forEach(x=>{ if(REN[x.id]){ x.type='PVP'; x.lv=''; x.online=0; x.desc=''; x.url=''; delete x.added; delete x.open; } });
    (o.ads||[]).forEach(a=>{ if(a.server&&REN[a.server]) a.text='Sunucumuza davetlisiniz, hemen katılın!'; });
    (o.adReqs||o.myAds||[]).forEach&&(o.adReqs||[]).forEach(a=>{ if(a.server&&REN[a.server]) a.text='Sunucumuza davetlisiniz, hemen katılın!'; });
    const have=new Set(o.servers.map(x=>x.name.toLocaleLowerCase('tr-TR'))); let n=0;
    ALL.forEach((nm,i)=>{ if(have.has(nm.toLocaleLowerCase('tr-TR'))) return; n++; o.servers.push({id:'p'+n,sec:'pvp',name:nm,type:'PVP',lv:'',c:PAL[i%PAL.length],online:0,desc:'',url:''}); });
    const keep=new Set(ALL.map(x=>x.toLocaleLowerCase('tr-TR'))); o.servers=o.servers.filter(x=>x.sec!=='pvp'||keep.has(x.name.toLocaleLowerCase('tr-TR'))); }
  if(!o.set.rm_t9){ o.set.rm_t9=1; const X=x=>x&&x.server==='t9'; o.servers=(o.servers||[]).filter(x=>x.id!=='t9'); ['listings','bounties','ads','adReqs'].forEach(k=>{ if(Array.isArray(o[k])) o[k]=o[k].filter(x=>!X(x)); }); const xr=(o.exchange||[]).filter(X).map(x=>x.id); if(xr.length){ o.exchange=o.exchange.filter(x=>!X(x)); if(Array.isArray(o.exOffers)) o.exOffers=o.exOffers.filter(x=>!xr.includes(x.ex)); } }
  if(!o.set.rm_takas){ o.set.rm_takas=1; (o.users||[]).forEach(u=>{ if(Array.isArray(u.perms)) u.perms=u.perms.filter(p=>p!=='oda'); }); if(Array.isArray(o.notifs)) o.notifs=o.notifs.filter(n=>!/^#ozel-takas/.test(n.link||'')); (o.posts||[]).forEach(p=>{ if(typeof p.body==='string') p.body=p.body.replace(/^- Anlaştığınız kişiyle bile \[.*$/m,'- Ödemeyi her zaman site üzerinden yapın; para teslim onaylanana kadar havuzda bekler.'); }); }
  (o.users||[]).forEach(u=>{ if(Array.isArray(u.perms)) u.perms=[...new Set(u.perms.map(p=>PERM_ALIAS[p]||p))].filter(p=>PERMS[p]); });
  o.support.canned=o.support.canned.map(c=>c[0]==='Teslim garantisi'?['İptal talebi','Siparişinizi kontrol ediyorum. Satıcı teslim etmediyse siparişi iptal edip tutarı bakiyenize iade edeceğim.']:c);
  /* R6: e-Gider Pusulası için tam T.C. no. Yalnızca demo veriler: tc23'te maskeli (hash'siz) TC verilen üyeler ve u2.
     Numara TC algoritmasına uygun üretilir, mümkünse mevcut maskenin ilk 3 / son 2 hanesi korunur; hash yüklemeden sonra (tcHashFill) yazılır.
     Gerçek doğrulamalar (hash'li, tam numarasız) dokunulmaz: onlar admin girişi / üyenin yeniden onayıyla tamamlanır. */
  if(!o.set.tcfull32){ o.set.tcfull32=1; const used=new Set((o.users||[]).map(u=>u.tc&&u.tc.no).filter(Boolean));
    const ok11=t=>{ if(!/^[1-9]\d{10}$/.test(t)) return false; const d=[...t].map(Number); const a=d[0]+d[2]+d[4]+d[6]+d[8], e=d[1]+d[3]+d[5]+d[7]; return (((a*7-e)%10)+10)%10===d[9]&&d.slice(0,10).reduce((x,y)=>x+y,0)%10===d[10]; };
    const gen=(pre,suf,seed)=>{ pre=String(pre||'').replace(/\D/g,'').slice(0,3); suf=String(suf||'').replace(/\D/g,'').slice(-2); if(!/^[1-9]/.test(pre)) pre='';
      let sd=(seed>>>0)||7; const R=()=>((sd=(Math.imul(sd,1103515245)+12345)>>>0)>>>8);
      for(let k=0;k<40000;k++){ let b=pre||String(1+R()%9); while(b.length<9) b+=String(R()%10); const d=[...b].map(Number); const a=d[0]+d[2]+d[4]+d[6]+d[8], e=d[1]+d[3]+d[5]+d[7]; const d10=(((a*7-e)%10)+10)%10; const t=b+d10+((d.reduce((x,y)=>x+y,0)+d10)%10);
        if((k<20000&&suf&&!t.endsWith(suf))||used.has(t)||!ok11(t)) continue; used.add(t); return t; } return null; };
    const msk=t=>t.slice(0,3)+'******'+t.slice(-2), sid=id=>[...String(id)].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,17);
    (o.users||[]).forEach(u=>{ if(u.admin||u.staff||!u.tc||!u.tc.ok||u.tc.no||u.tc.h) return; const m=String(u.tc.mask||u.tc.masked||''); const t=gen((m.match(/^\d+/)||[''])[0],(m.match(/\d+$/)||[''])[0],sid(u.id)); if(t){ u.tc.no=t; u.tc.mask=msk(t); } });
    const u2=(o.users||[]).find(u=>u.id==='u2'); if(u2&&!u2.tc){ const w0=(o.wd||[]).find(w=>w.id==='w0'&&w.u==='u2'), m=String((w0&&w0.tckn)||''); const t=gen((m.match(/^\d+/)||[''])[0],(m.match(/\d+$/)||[''])[0],sid('u2')); if(t) u2.tc={ok:true,t:Date.now()-30*D,no:t,mask:msk(t),yil:1996,by:'nvi'}; }
    // Demo pusulalar: belge no / ETTN aynı kalır, yalnızca maskeli/boş tckn tam numarayla değişir.
    (o.wd||[]).forEach(w=>{ if(!w.egp) return; const U=(o.users||[]).find(u=>u.id===w.u); const no=U&&U.tc&&U.tc.no; if(no&&!/^\d{11}$/.test(String(w.egp.tckn||''))){ w.egp.tckn=no; w.tckn=msk(no); } }); }
  /* R9 (egpHide37): pusula yalnız iç muhasebe. Üyeye görünen kayıtlı metinlerden (bakiye hareketleri, bildirimler,
     gönderilmiş SMS / e-posta kayıtları, destek yanıtları) pusula / belge no ifadeleri bir kez temizlenir; bu ifadeleri
     içeren kayıtlı e-posta / SMS şablonları varsayılana döner. Admin tarafı (pusula belgeleri, muhasebe defteri, ayarlar) dokunulmaz. */
  if(!o.set.egpHide37){ o.set.egpHide37=1; window.__r9Save=1;
    const staff=new Set((o.users||[]).filter(u=>u.admin||u.staff).map(u=>u.id)), mem=x=>!staff.has(x);
    (o.tx||[]).forEach(t=>{ if(mem(t.u)&&typeof t.l==='string') t.l=r9Clean(t.l); });
    (o.notifs||[]).forEach(n=>{ if(mem(n.u)&&typeof n.x==='string') n.x=r9Clean(n.x); });
    (o.smsLog||[]).forEach(m=>{ if(mem(m.u)&&typeof m.x==='string') m.x=r9Clean(m.x); });
    (o.mailLog||[]).forEach(m=>{ if(!mem(m.u)) return; if(typeof m.sub==='string') m.sub=r9Clean(m.sub); if(typeof m.x==='string') m.x=r9Clean(m.x); });
    (o.tickets||[]).forEach(t=>(t.msgs||[]).forEach(m=>{ if((m.f==='a'||m.f==='s')&&typeof m.x==='string') m.x=r9Clean(m.x); }));
    if(o.mail&&o.mail.tpl) Object.keys(o.mail.tpl).forEach(k=>{ const T=o.mail.tpl[k]; if(!T) return; ['s','b'].forEach(f=>{ if(typeof T[f]==='string'&&EGP_RX.test(T[f])) delete T[f]; }); });
    if(o.sms&&o.sms.tpl) Object.keys(o.sms.tpl).forEach(k=>{ if(typeof o.sms.tpl[k]==='string'&&EGP_RX.test(o.sms.tpl[k])){ if(SMSDEF[k]) o.sms.tpl[k]=SMSDEF[k]; else delete o.sms.tpl[k]; } });
    if(o.support&&Array.isArray(o.support.canned)) o.support.canned=o.support.canned.map(c=>Array.isArray(c)?[c[0],r9Clean(String(c[1]||''))]:c);
  }
  /* R8 (ent33): PayTR sırları artık yalnız sunucuda (Yönetim › Entegrasyonlar). Tarayıcıdaki eski anahtarlar silinir, yalnız bayraklar kalır.
     Temizlik her yüklemede uygulanır (eski bir yedek geri yüklense bile sır geri gelmez); sayfa adresi düzeltmesi bir kez yapılır. */
  (o.gws||[]).forEach(g=>{ if(g.id==='paytr'||g.id==='paytr_eft') g.keys={}; });
  { const P=o.paytr||{}; o.paytr={test:P.test!==false,maxInst:+P.maxInst||0,okUrl:String(P.okUrl||''),failUrl:String(P.failUrl||'')}; }
  if(!o.set.ent33){ o.set.ent33=1; const sb=String(o.set.siteUrl||'https://www.yangpazar.com').replace(/\/+$/,''); if(!o.paytr.okUrl||/siteniz\.com/i.test(o.paytr.okUrl)) o.paytr.okUrl=sb+'/?odeme=basarili'; if(!o.paytr.failUrl||/siteniz\.com/i.test(o.paytr.failUrl)) o.paytr.failUrl=sb+'/?odeme=hata'; }
  if(!o.set.apiBase) o.set.apiBase='/api/';
  return o;
}
/* ================== v3: tohum verisi ek ================== */
function seed3(O,t){
  const P={u1:['Emre','Kurt','0532 000 00 01','emre@ornek.com',t-2*60000],u2:['Deniz','Yılmaz','0533 000 00 02','deniz@ornek.com',t],u3:['Selin','Arslan','0534 000 00 03','selin@ornek.com',t-3*H],u4:['Mert','Yıldız','0535 000 00 04','mert@ornek.com',t-D],u5:['Burak','Demir','0536 000 00 05','burak@ornek.com',t-20*60000],admin:['Site','Yöneticisi','0530 000 00 00','admin@ornek.com',t]};
  O.users.forEach(u=>{const p=P[u.id]; if(p){u.ad=p[0];u.soyad=p[1];u.tel=p[2];u.email=p[3];u.lastSeen=p[4];} u.pass='1234';});
  O.users.push({id:'st1',name:'Operatör_Ayşe',ad:'Ayşe',soyad:'Kaya',tel:'0537 000 00 06',email:'ayse@ornek.com',pass:'1234',staff:true,perms:['ara','siparis','borsa','destek','ilan','mesaj'],bal:0,rating:5,sales:0,joined:'Ekim 2026',vol:0,pts:0,lastSeen:t-6*60000});
  const cs={'★ Karambit | Doppler (Faz 2)':'★ Karambit | Doppler','★ M9 Süngü | Tiger Tooth':'★ M9 Bayonet | Tiger Tooth'};
  const L=[...O.listings].sort((a,b)=>a.t-b.t); L.forEach((l,i)=>{l.no=675001+i;}); O.lno=675000+L.length;
  O.listings.forEach(l=>{ if(l.game==='cs2'){ const c=catFind(cs[l.title]||l.title); if(c) l.img=STEAM_IMG+c[1]; } });
  O.exchange=[
    {id:'x1',server:'t1',unit:'1 Won',buy:21.5,sell:25.9,stock:900,change:2.4,on:true},
    {id:'x2',server:'t2',unit:'1 Won',buy:18.4,sell:22.5,stock:640,change:-1.1,on:true},
    {id:'x3',server:'t3',unit:'1 Won',buy:16.2,sell:19.5,stock:520,change:0.8,on:true},
    {id:'x4',server:'t4',unit:'1 Won',buy:17.6,sell:21.0,stock:300,change:1.6,on:true},
    {id:'x5',server:'t5',unit:'1 Won',buy:19.9,sell:23.8,stock:240,change:-0.4,on:true},
    {id:'x6',server:'s1',unit:'100M',buy:14.8,sell:18.2,stock:850,change:3.2,on:true},
    {id:'x7',server:'s5',unit:'1 Won',buy:9.6,sell:11.9,stock:600,change:1.2,on:true},
    {id:'x8',server:'s8',unit:'100M',buy:6.2,sell:7.9,stock:420,change:-2.0,on:true}
  ];
  O.exFields=[
    {id:'f1',label:'Oyun hesap adı (ID)',type:'text',req:true,secret:false,note:'Oyuna giriş yaptığınız kullanıcı adı'},
    {id:'f2',label:'Hesap şifresi',type:'password',req:true,secret:true,note:'Teslimattan sonra şifrenizi değiştirmenizi öneririz'},
    {id:'f3',label:'Karakter adı',type:'text',req:true,secret:false,note:'Yangın yükleneceği / alınacağı karakter'},
    {id:'f4',label:'Depo şifresi',type:'password',req:false,secret:true,note:'Yang depodaysa'},
    {id:'f5',label:'Hesaba bağlı e-posta',type:'text',req:false,secret:false,note:'Girişte doğrulama kodu istenirse size ulaşmak için'},
    {id:'f6',label:'Giriş için uygun zaman',type:'select',req:true,secret:false,opts:'Hemen,Bugün 18:00 sonrası,Yarın sabah',note:''}
  ];
  O.exRules='Teslimat sırasında oyuna girmeyin, aksi halde operatör hesaptan atılır.\nHesabınızda iki adımlı doğrulama açıksa geçici olarak kapatın veya kodu canlı destekten iletin.\nHesap bilgileriniz yalnızca teslimat için kullanılır ve işlem bitince sistemden silinir.';
  O.exOrders=[
    {id:'B1001',u:'u2',dir:'al',ex:'x1',server:'t1',qty:5,price:25.9,total:129.5,status:'bekliyor',t:t-25*60000,f:{f1:'deniz_emerald',f2:'••••••',f3:'DenizSura',f4:'',f5:'deniz@ornek.com',f6:'Hemen'},staff:null,log:[{t:t-25*60000,x:'Sipariş alındı, ödeme bakiyeden çekildi.'}]},
    {id:'B1002',u:'u4',dir:'sat',ex:'x6',server:'s1',qty:3,price:14.8,total:44.4,status:'islemde',t:t-90*60000,f:{f1:'mert_ej2',f2:'••••••',f3:'YangUstasi',f4:'••••',f5:'',f6:'Hemen'},staff:'st1',log:[{t:t-90*60000,x:'Satış talebi alındı.'},{t:t-70*60000,x:'Operatör_Ayşe işlemi üstlendi.'}]}
  ];
  O.bounties=[
    {id:'b1',u:'u2',server:'s1',title:'105 Lv Savaşçı (Bedensel veya Zihinsel)',budget:3800,t:t-4*H,desc:'Mail devri ile alınacak. İtemli veya itemsiz temiz karakter.'},
    {id:'b2',u:'u4',server:'s1',title:'+9 Zehir Kılıcı (%45+ ortalama zarar)',budget:1250,t:t-12*H,desc:'Taşları tam olsun.'},
    {id:'b3',u:'u2',server:'t1',title:'Diamond Nite 10 Won alınır',budget:245,t:t-D,desc:'Toptan veya parça parça.'}
  ];
  O.dms=[{id:'dm1',a:'u2',b:'u1',msgs:[{f:'u2',x:'Merhaba, Diamond Nite won stokunuz ne kadar?',t:t-50*60000},{f:'u1',x:'120 Won hazır, ilanda yazdığım gibi 5 dakikada teslim ederim.',t:t-48*60000},{f:'u2',x:'Bana [gizlendi] üzerinden yazar mısın?',t:t-47*60000,flag:true},{f:'u1',x:'Site dışı konuşamam, ilan üzerinden alırsan havuz güvencesi olur.',t:t-46*60000}]}];
  O.flagged=[{id:'f0',u:'u2',ctx:'Mesaj → KurtPazar',orig:'Bana whatsapp üzerinden yazar mısın?',t:t-47*60000}];
  O.notifs=[{id:'n1',u:'u1',x:'“Full efsun Ejderha Zırhı +9” ilanınız satıldı. Teslimata hazırlanın.',link:'#siparis-S100004',t:t-75*60000,read:false},{id:'n2',u:'u2',x:'SkinHane “AK-47 | Slate” siparişini teslim ettiğini bildirdi. Lütfen onaylayın.',link:'#siparis-S100002',t:t-H,read:false}];
  O.sms={on:true,provider:'NetGSM',user:'',pass:'',header:'YANGPAZAR',userPrice:5,ev:{sold:true,delivered:true,confirmed:true,dispute:true,borsa:true,withdraw:true,direct:true},tpl:{sold:'{site}: "{ilan}" ilaniniz satildi. Siparis #{no}. Lutfen teslimata hazirlanin.',delivered:'{site}: Siparis #{no} teslim edildi. Kontrol edip onaylayin.',confirmed:'{site}: Siparis #{no} onaylandi, {tutar} bakiyenize gecti.',dispute:'{site}: Siparis #{no} icin itiraz acildi.',borsa:'{site}: Borsa siparisiniz #{no}: {durum}.',withdraw:'{site}: {tutar} cekim talebiniz gonderildi.',direct:'{site} uyesi {gonderen}: {mesaj}'}};
  O.smsLog=[{id:'m0',u:'u1',to:'0532 000 00 01',x:'yangpazar.com: "Full efsun Ejderha Zirhi +9" ilaniniz satildi. Siparis #S100004. Lutfen teslimata hazirlanin.',t:t-75*60000,ev:'sold',status:'Gönderildi'}];
  O.rev.borsa=2140; O.rev.sms=85;
  O.revLog.push({t:t-D,k:'borsa',a:640},{t:t-3*H,k:'borsa',a:210},{t:t-2*D,k:'sms',a:40});
  return O;
}

