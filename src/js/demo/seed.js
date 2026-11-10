function seed(){
  const t = now();
  const servers = [
    {id:'t1',sec:'tr',name:"Diamond Nite",type:'Resmi',lv:'1-120',c:['#16325c','#4fa3e8'],online:0,open:t-3200*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t3',sec:'tr',name:"Diamond Gram",type:'Resmi',lv:'1-120',c:['#1f3f6b','#7cc4f5'],online:0,open:t-3080*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t4',sec:'tr',name:"Sapphire (Safir)",type:'Resmi',lv:'1-120',c:['#132a7a','#3f6fe0'],online:0,open:t-2960*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t6',sec:'tr',name:"Sapphire (Star)",type:'Resmi',lv:'1-120',c:['#1d2a6e','#8a7bf0'],online:0,open:t-2840*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t7',sec:'tr',name:"Germania",type:'Resmi',lv:'1-120',c:['#3a2a12','#d4a53a'],online:0,open:t-2720*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t8',sec:'tr',name:"Ruby Lucifer",type:'Resmi',lv:'1-120',c:['#5c0f1a','#e0334f'],online:0,open:t-2600*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t10',sec:'tr',name:"Teutonia",type:'Resmi',lv:'1-120',c:['#2b3a1f','#8fbf4a'],online:0,open:t-2360*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t11',sec:'tr',name:"Ruby Türkiye Charon",type:'Resmi',lv:'1-120',c:['#4a0d16','#c42a3c'],online:0,open:t-2240*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t12',sec:'tr',name:"Ruby Chimera",type:'Resmi',lv:'1-120',c:['#5a1420','#f0566b'],online:0,open:t-2120*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t2',sec:'tr',name:"Marmara",type:'Resmi',lv:'1-120',c:['#123f7a','#3c8fe0'],online:0,open:t-2000*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t13',sec:'tr',name:"Arkadaşlar",type:'Resmi',lv:'1-120',c:['#0e5a4f','#3cc7a8'],online:0,open:t-1880*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t14',sec:'tr',name:"Bagjanamu",type:'Resmi',lv:'1-120',c:['#4a2a6b','#b07ae0'],online:0,open:t-1760*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t5',sec:'tr',name:"Barbaros",type:'Resmi',lv:'1-120',c:['#5a1b2b','#c0394f'],online:0,open:t-1640*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t15',sec:'tr',name:"Dandanakan",type:'Resmi',lv:'1-120',c:['#6b3a0e','#f09a3a'],online:0,open:t-1520*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t16',sec:'tr',name:"Ezel",type:'Resmi',lv:'1-120',c:['#2a2a4a','#7a7ae0'],online:0,open:t-1400*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'t17',sec:'tr',name:"Ruby Kirin",type:'Resmi',lv:'1-120',c:['#5c1414','#e65c4a'],online:0,open:t-1280*D,desc:'Metin2 Türkiye resmi sunucusu. Won, item ve karakter ilanları.',url:'https://tr.metin2.gameforge.com'},
    {id:'s1',sec:'pvp',name:'Ejderha2',type:'Orta Emek',lv:'1-120',c:['#a8251c','#f0952a'],online:1840,open:t-12*D,desc:'Simya, kuşak, 6-7 efsun ve ejderha taşı sistemleri. Her hafta 5.000 TL ödüllü lonca savaşı.',url:'https://example.com'},
    {id:'s2',sec:'pvp',name:'Yeşim2',type:'Emek',lv:'1-99',c:['#0d7d60','#6fcf4c'],online:960,open:t+4*D,desc:'Oldschool denge, nesne market yok. Her şey oyun içi drop ile.',url:'https://example.com'},
    {id:'s3',sec:'pvp',name:'Kızılkurt',type:'Hard',lv:'1-105',c:['#4f2479','#d93a4a'],online:1310,open:t-40*D,desc:'Düşük drop, yüksek ödül. Zor içerik sevenler için.',url:'https://example.com'},
    {id:'s4',sec:'pvp',name:'Tufan2',type:'Oldschool',lv:'1-75',c:['#1d375a','#3b9fdc'],online:720,open:t-90*D,desc:'Klasik 1-75 deneyimi, 3. sezon.',url:'https://example.com'},
    {id:'s5',sec:'pvp',name:'Asuman2',type:'Farm',lv:'1-120',c:['#a8510f','#eec244'],online:2210,open:t-20*D,desc:'Hızlı farm, bol etkinlik, yeni harita: Çöl Tapınağı.',url:'https://example.com'},
    {id:'s6',sec:'pvp',name:'Kaşgar Online',type:'Emek',lv:'1-99',c:['#0f6e70','#45bde4'],online:540,open:t-5*D,desc:'Yeni açılan emek server, sabit oran.',url:'https://example.com'},
    {id:'s7',sec:'pvp',name:'Bozok2',type:'PVM',lv:'1-90',c:['#353c4b','#828ca1'],online:380,open:t-150*D,desc:'PVM odaklı, boss avları ve zindanlar.',url:'https://example.com'},
    {id:'s8',sec:'pvp',name:'Altınorda',type:'Full PVP',lv:'1-250',c:['#86650f','#741010'],online:1570,open:t-30*D,desc:'Her gün PvP turnuvası, 1-250 hızlı gelişim.',url:'https://example.com'}
  ];
  const users = [
    {id:'u1',name:'KurtPazar',bal:3420.5,rating:4.9,sales:412,joined:'Nisan 2021',verified:true,vol:18400,pts:1240},
    {id:'u2',name:'Deniz_TR',bal:1500,rating:5,sales:3,joined:'Eylül 2025',verified:true,vol:1707,pts:860},
    {id:'u3',name:'SkinHane',bal:18250,rating:4.8,sales:1288,joined:'Kasım 2019',verified:true,vol:64200,pts:5100},
    {id:'u4',name:'YangUstası',bal:860,rating:4.7,sales:96,joined:'Şubat 2023',verified:false,vol:3200,pts:310},
    {id:'u5',name:'EpinMerkezi',bal:6120,rating:4.9,sales:2240,joined:'Ocak 2020',verified:true,vol:41000,pts:2200},
    {id:'admin',name:'Yönetici',bal:0,admin:true,rating:5,sales:0,joined:'2026',vol:0,pts:0}
  ];
  let n = 0;
  const L = (seller,game,server,cat,title,price,stock,del,x={}) => Object.assign({id:'l'+(++n),seller,game,server,cat,title,price,stock,del,status:'aktif',t:t-(n*29+5)*60000,views:40+n*17,dop:{},desc:''},x);
  const listings = [
    // Metin2 TR
    L('u1','metin2','t1','yang','1 Won · Diamond Nite — 7/24 anında teslim',26.5,120,'5 dk',{dop:{vitrin:t+5*D},desc:'1 Won = 100M yang. Satın aldıktan sonra karakter adınızı yazın, en geç 5 dakikada ticaretle teslim ediyorum. 10 Won üzeri alımlarda bonus yang.'}),
    L('u4','metin2','t1','yang','1 Won · Diamond Nite toptan',25.9,400,'15 dk',{desc:'Toptan alımlarda en uygun fiyat.'}),
    L('u5','metin2','t1','ep','1.000 EP (Ejderha Parası) kodu',289,25,'Anında',{dop:{vitrin:t+6*D},desc:'Resmi EP kodu. Satın aldığınız anda kod sipariş mesajlarınıza düşer.'}),
    L('u1','metin2','t1','item','+9 Ejderha Kılıcı · 5 efsun',3450,1,'20 dk',{desc:'%20 yarı insan, %10 kritik, %10 delici, +15 güç, %15 ortalama zarar.'}),
    L('u4','metin2','t1','karakter','120 Lv Şaman — Diamond Nite, full set',9800,1,'1 saat',{desc:'E-posta ve şifre değişimiyle teslim. Depoda 30 Won.'}),
    L('u4','metin2','t2','yang','1 Won · Marmara',22.9,300,'10 dk',{dop:{renk:t+5*D}}),
    L('u5','metin2','t2','ep','5.000 EP (Ejderha Parası) kodu',1390,10,'Anında'),
    L('u1','metin2','t3','yang','1 Won · Diamond Gram — hızlı teslim',19.75,250,'5 dk',{dop:{acil:t+4*D}}),
    L('u1','metin2','t3','item','Mavi Ejderha Takı Seti (+9)',760,1,'15 dk'),
    L('u4','metin2','t4','yang','1 Won · Ege',21.4,180,'15 dk'),
    L('u5','metin2','t5','yang','1 Won · Barbaros',24,90,'10 dk'),
    L('u5','metin2','t5','ep','2.500 EP (Ejderha Parası) kodu',705,15,'Anında'),
    // Metin2 PVP
    L('u1','metin2','s1','yang','100M Yang — 7/24 anında teslim',18.5,50,'5 dk',{dop:{vitrin:t+5*D},desc:'Stok her zaman hazır. Karakter adınızı yazmanız yeterli, en geç 5 dakikada teslim.'}),
    L('u4','metin2','s1','item','+9 Zehir Kılıcı (5 efsun, %18 yarı insan)',650,1,'15 dk',{desc:'Efsunlar: %18 yarı insan, %10 kritik, %8 delici, +12 HP, %15 ortalama zarar.'}),
    L('u4','metin2','s1','ep','10.000 EP (Ejderha2 nesne market)',150,30,'15 dk'),
    L('u1','metin2','s3','karakter','105 Lv Bedensel Savaşçı — Full +9 set',4200,1,'30 dk',{dop:{vitrin:t+3*D,acil:t+3*D},desc:'Hesap bilgileri ve e-posta değişimi ile teslim edilir.'}),
    L('u4','metin2','s5','yang','1 Won (100M) toptan',12,200,'10 dk',{dop:{renk:t+6*D}}),
    L('u1','metin2','s5','ep','5.000 EP (Asuman2)',99,40,'15 dk'),
    L('u1','metin2','s8','item','Full efsun Ejderha Zırhı +9',1150,1,'20 dk'),
    L('u1','metin2','s8','ep','20.000 Coin (Altınorda)',175,20,'15 dk'),
    L('u4','metin2','s2','yang','Açılışa özel 50M Yang (ön sipariş)',9.9,100,'1 saat',{dop:{acil:t+4*D}}),
    L('u1','metin2','s4','item','Mavi Çelik Kalkan +9',240,2,'15 dk'),
    L('u4','metin2','s6','karakter','90 Lv Ninja Okçu — temiz hesap',1800,1,'1 saat'),
    L('u1','metin2','s5','item','Simya seti — 6 parça Efsanevi Elmas',890,1,'20 dk',{dop:{vitrin:t+6*D}}),
    // CS2
    L('u3','cs2',null,'skin','AK-47 | Redline',1450,1,'Anında',{skin:{w:'rifle',wear:'FT',fl:.2471,st:false,r:'Gizli'},dop:{vitrin:t+5*D},desc:'Steam takas ile teslim. Takas koruması süresi dolmuş.'}),
    L('u3','cs2',null,'skin','AWP | Asiimov',4950,1,'Anında',{skin:{w:'sniper',wear:'FT',fl:.3012,st:false,r:'Örtülü'}}),
    L('u3','cs2',null,'skin','M4A1-S | Printstream',7800,1,'15 dk',{skin:{w:'rifle',wear:'MW',fl:.0912,st:false,r:'Örtülü'}}),
    L('u3','cs2',null,'skin','★ Karambit | Doppler (Faz 2)',28500,1,'15 dk',{skin:{w:'knife',wear:'FN',fl:.0118,st:false,r:'Nadir Özel'},dop:{vitrin:t+6*D,acil:t+6*D}}),
    L('u1','cs2',null,'skin','Desert Eagle | Blaze',13900,1,'30 dk',{skin:{w:'pistol',wear:'FN',fl:.0089,st:false,r:'Kısıtlı'}}),
    L('u3','cs2',null,'skin','USP-S | Kill Confirmed',3250,1,'Anında',{skin:{w:'pistol',wear:'MW',fl:.1144,st:true,r:'Örtülü'}}),
    L('u3','cs2',null,'skin','AK-47 | Slate',520,3,'Anında',{skin:{w:'rifle',wear:'FT',fl:.2105,st:true,r:'Askeri'},dop:{renk:t+4*D}}),
    L('u3','cs2',null,'skin','★ M9 Süngü | Tiger Tooth',31200,1,'30 dk',{skin:{w:'knife',wear:'FN',fl:.0078,st:false,r:'Nadir Özel'}}),
    L('u1','cs2',null,'skin','AWP | Atheris',185,4,'Anında',{skin:{w:'sniper',wear:'MW',fl:.1290,st:false,r:'Kısıtlı'}}),
    // Diğer
    L('u4','diger',null,'hesap','Valorant TR hesap — 32 skin, Elmas 2',2400,1,'1 saat',{sub:'Valorant'}),
    L('u3','diger',null,'epin','PUBG Mobile 660 UC',349,40,'Anında',{sub:'PUBG Mobile'}),
    L('u1','diger',null,'yang','Knight Online 10 GB (Zero)',95,30,'15 dk',{sub:'Knight Online'})
  ];
  const id = k => listings.find(l=>l.id===k);
  const slate=listings.find(l=>l.title==='AK-47 | Slate'), zirh=listings.find(l=>l.title.startsWith('Full efsun Ejderha')), kalkan=listings.find(l=>l.title.startsWith('Mavi Çelik')), won=id('l1');
  const orders = [
    {id:'S100001',lid:won.id,title:won.title,buyer:'u2',seller:'u1',qty:2,total:53,rate:7,status:'tamam',t:t-3*D,dt:t-3*D+4*60000,ct:t-3*D+9*60000,fee:3.71,net:49.29,stars:5,info:'DenizSura',log:[{t:t-3*D,x:'Ödeme alındı, tutar güvenli havuza aktarıldı.'},{t:t-3*D+4*60000,x:'Satıcı teslim ettiğini bildirdi.'},{t:t-3*D+9*60000,x:'Alıcı onayladı. Satıcıya ödeme aktarıldı.'}],chat:[]},
    {id:'S100002',lid:slate.id,title:slate.title,buyer:'u2',seller:'u3',qty:1,total:520,rate:6,status:'teslim',t:t-2*H,dt:t-H,info:'https://steamcommunity.com/tradeoffer/new/?partner=000000&token=demo',log:[{t:t-2*H,x:'Ödeme alındı, tutar güvenli havuza aktarıldı.'},{t:t-H,x:'Satıcı teslim ettiğini bildirdi.'}],chat:[{f:'u3',x:'Takas teklifini gönderdim, Steam mobil onayından sonra envanterinize düşer.',t:t-H}]},
    {id:'S100003',lid:kalkan.id,title:kalkan.title,buyer:'u4',seller:'u1',qty:1,total:240,rate:7,status:'itiraz',t:t-20*H,dt:t-19*H,reason:'Teslim edilen kalkan +7 çıktı, ilanda +9 yazıyordu.',info:'YangUstasi',log:[{t:t-20*H,x:'Ödeme alındı, tutar güvenli havuza aktarıldı.'},{t:t-19*H,x:'Satıcı teslim ettiğini bildirdi.'},{t:t-18*H,x:'Alıcı itiraz açtı: Teslim edilen kalkan +7 çıktı, ilanda +9 yazıyordu.'}],chat:[{f:'u1',x:'Ekran görüntüsünde +9 görünüyor, tekrar kontrol eder misiniz?',t:t-17*H}]},
    {id:'S100004',lid:zirh.id,title:zirh.title,buyer:'u2',seller:'u1',qty:1,total:1150,rate:7,status:'odendi',t:t-75*60000,info:'DenizSura',log:[{t:t-75*60000,x:'Ödeme alındı, tutar güvenli havuza aktarıldı.'}],chat:[{f:'u2',x:'Merhaba, karakterim köy 1 de bekliyor.',t:t-74*60000}]}
  ];
  zirh.stock = 0; zirh.status = 'satildi';
  const ads = [
    {id:'a1',type:'slider',server:'s1',title:'Lonca savaşları başladı',text:'1-120 Orta Emek · 6-7 efsun · Her hafta 5.000 TL ödüllü turnuva',until:t+6*D,active:true,price:1500},
    {id:'a2',type:'slider',server:'s2',title:'8 Kasım 20:00\'de açılıyor',text:'Nesne market yok, saf emek. İlk 500 kayda başlangıç paketi.',until:t+5*D,active:true,price:1500},
    {id:'a3',type:'slider',server:'s8',title:'Her gün PvP turnuvası',text:'1-250 Full PVP · Haftalık ödül havuzu',until:t+2*D,active:true,price:1500},
    {id:'a4',type:'popup',server:'s2',title:'Büyük açılış',text:'İlk 500 kayda başlangıç paketi hediye. Açılış: 8 Kasım Cumartesi 20:00',until:t+3*D,active:true,price:2200},
    {id:'a5',type:'premium',server:'s1',until:t+6*D,active:true,price:900},
    {id:'a6',type:'premium',server:'s2',until:t+5*D,active:true,price:900},
    {id:'a7',type:'premium',server:'s3',until:t+3*D,active:true,price:900},
    {id:'a8',type:'premium',server:'s8',until:t+2*D,active:true,price:900},
    {id:'a9',type:'banner',server:'s3',title:'Kızılkurt',text:'Zor içerik sevenlere: 1-105, düşük drop, yüksek ödül.',until:t+6*D,active:true,price:700},
    {id:'a10',type:'banner',server:'s5',title:'Asuman2',text:'Yeni harita: Çöl Tapınağı açıldı.',until:t+4*D,active:true,price:700},
    {id:'a11',type:'text',server:'s6',text:'Kaşgar Online · 1-99 Emek · Açıldı, 540 oyuncu online',until:t+6*D,active:true,price:350},
    {id:'a12',type:'text',server:'s4',text:'Tufan2 · 1-75 Oldschool · 3. sezon başladı',until:t+5*D,active:true,price:350},
    {id:'a13',type:'text',server:'s8',text:'Altınorda · Cumartesi 21:00 lonca turnuvası',until:t+3*D,active:true,price:350},
    {id:'a14',type:'altbanner',server:'s7',text:'Yeni sezon açıldı · Her akşam lonca savaşı',until:t+6*D,active:true,price:850}
  ];
  const revLog = [];
  const day = i => t - i*D - 3*H;
  [[6,410,1500,58],[5,520,2400,86],[4,380,700,39],[3,690,3300,124],[2,540,1250,67],[1,760,2900,96],[0,120,0,19]].forEach(([i,c,a,d])=>{revLog.push({t:day(i),k:'commission',a:c},{t:day(i),k:'ads',a:a},{t:day(i),k:'doping',a:d})});
  const O = {
    v:3, seq:5, cur:'u2',
    set:{siteName:'yangpazar.com',slogan:'Oyuncu pazaryeri',commission:8,popupOn:true,popupDelay:1.5,autoConfirm:24,minWithdraw:50,moderation:false,whatsapp:'+90 5xx xxx xx xx',supportHours:'7/24',wheelOn:true,ptRate:100,refBonus:25,refFriend:10},
    packs:{
      slider:{name:'Ana Sayfa Slider',desc:'Ana sayfanın en üstünde geniş vitrin, dönüşümlü gösterim.',p:[350,1500,4900]},
      popup:{name:'Açılış Popup Reklamı',desc:'Siteye giren her ziyaretçiye oturum başına bir kez tam ekran.',p:[400,2200,7500]},
      premium:{name:'Premium Server Listesi',desc:'Server listesinde ve sol sütunda altın çerçeveli en üst sıralar.',p:[150,900,2900]},
      banner:{name:'Kenar Banner 300×250',desc:'Ana sayfa ve ilan sayfalarında sağ sütun.',p:[120,700,2400]},
      altbanner:{name:'Sağ Sütun Alt Banner 300×600',desc:'Ana sayfa sağ sütunun en altında, büyük görselli dikey alan.',p:[150,850,2900],cap:1},
      text:{name:'Metin Reklam (Üst Şerit)',desc:'Sitenin en üstündeki kayan şeritte tek satır.',p:[60,350,1100]},
      yan:{name:'Yan Reklam (Sağ + Sol)',desc:'Geniş ekranlarda sayfanın sağ ve sol boşluğunda, iki taraf birlikte satılır. Sayfa kaydırılsa da görünür kalır.',p:[250,1400,4900],cap:1}
    },
    dopings:{vitrin:{name:'Vitrin',desc:'Kendi serverının vitrininde ve ana sayfada',p:49,pd:7,max:30},acil:{name:'Acil Satılık',desc:'Kırmızı ACİL etiketi',p:29,pd:4.5,max:30},renk:{name:'Renkli Arka Plan',desc:'Listede dikkat çeken zemin',p:19,pd:3,max:30}},
    gws:[
      {id:'paytr',n:'PayTR',t:'Kredi / Banka Kartı',fee:2.99,on:true,keys:{}},
      {id:'gpay',n:'GPay',t:'Kart · Papara · ininal · Paycell',fee:2.5,on:true,keys:{'Bayi Kodu':'','API Anahtarı':''}},
      {id:'iyzico',n:'iyzico',t:'Kredi / Banka Kartı',fee:3.49,on:false,keys:{'API Key':'','Secret Key':''}},
      {id:'shopier',n:'Shopier',t:'Kredi / Banka Kartı',fee:3.9,on:false,keys:{'API Kullanıcı':'','API Şifre':''}},
      {id:'papara',n:'Papara',t:'Papara cüzdan · anında',fee:0,on:true,keys:{'API Key':''}},
      {id:'paycell',n:'Paycell',t:'Turkcell cüzdan',fee:1.9,on:true,keys:{'Merchant Code':''}},
      {id:'ininal',n:'ininal',t:'ininal kart',fee:1.5,on:false,keys:{'API Key':''}},
      {id:'havale',n:'Havale / EFT',t:'Banka transferi · onaylı',fee:0,on:true,manual:true,keys:{}},
      {id:'kripto',n:'Kripto (USDT)',t:'TRC20 ağı · onaylı',fee:0,on:true,manual:true,keys:{'Cüzdan adresi':'TDemoCuzdanAdresiBurayaYazilir000'}}
    ],
    banks:[{b:'Ziraat Bankası',n:'YangPazar Bilişim Ltd. Şti.',i:'TR00 0001 0000 0000 0000 0000 01'},{b:'Garanti BBVA',n:'YangPazar Bilişim Ltd. Şti.',i:'TR00 0006 2000 0000 0000 0000 02'},{b:'Papara',n:'YangPazar',i:'Papara No: 0000000000'}],
    deps:[{id:'d1',u:'u4',gw:'havale',amount:500,t:t-30*60000,status:'bekliyor',note:'Ziraat Bankası · Mert Y.'}],
    coupons:[{code:'HOSGELDIN',pct:5,max:50,on:true,used:[]},{code:'HAFTASONU',pct:3,max:100,on:true,used:[]}],
    raffles:[
      {id:'r1',title:'★ Karambit | Doppler',kind:'item',value:28500,end:t+3*D+5*H,tk:{u1:12,u2:4,u3:30,u4:9,u5:18},c:['#4f2479','#c2185b'],w:'knife'},
      {id:'r2',title:'1.000 TL Bakiye',kind:'bal',value:1000,end:t+20*H,tk:{u1:5,u2:2,u4:3,u5:7},c:['#0d6b52','#2f9a3e']},
      {id:'r3',title:'500 TL Bakiye',kind:'bal',value:500,end:t-2*D,tk:{u1:8,u4:6,u5:9},winner:'u4',c:['#1d375a','#3b9fdc']}
    ],
    rfree:{}, spins:{},
    rev:{commission:18420,ads:52650,doping:3140}, revLog,
    servers, users, listings, orders, ads,
    wd:[{id:'w1',u:'u4',amount:600,iban:'TR00 0001 0000 0000 0000 0000 09',name:'Mert Y.',status:'bekliyor',t:t-2*D}],
    tx:[{id:'t1',u:'u2',l:'Bakiye yükleme (PayTR)',a:2723,t:t-4*D},{id:'t2',u:'u2',l:'Satın alma #S100001',a:-53,t:t-3*D},{id:'t3',u:'u2',l:'Satın alma #S100002',a:-520,t:t-2*H},{id:'t4',u:'u2',l:'Satın alma #S100004',a:-1150,t:t-75*60000},{id:'t5',u:'u1',l:'Satış #S100001 (komisyon düşüldü)',a:49.29,t:t-3*D},{id:'t6',u:'u4',l:'Para çekme talebi',a:-600,t:t-2*D}],
    tickets:[{id:'tk1',u:'u4',status:'bekliyor',t:t-50*60000,msgs:[{f:'u',x:'Merhaba, para çekme talebim 2 gündür onay bekliyor.',t:t-50*60000},{f:'b',x:'Para çekme talepleri mesai saatlerinde ortalama 2-6 saatte onaylanır. Sizi bir temsilciye aktarıyorum.',t:t-50*60000}]}]
  };
  return migrate(seed3(O,t));
}
