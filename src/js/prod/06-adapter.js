/* ================== P0b: veri bağdaştırıcısı (yalnız --prod derlemesinde) ==================
   Canlı sitede S tarayıcıda saklanmaz: load() açılış verisinden (window.YP_BOOT, index.php sayfaya yazar) boş bir S kurar,
   save() hiçbir şey yapmaz (yaklaşık 120 save() çağrısı etkisiz). Henüz sunucudan gelmeyen bölümler (ilanlar, siparişler,
   borsa, EP, reklam…) boş listelerle açılır; ekranlar "Yakında" ya da boş durum gösterir. Demo verisi yoktur.            */
/** Sunucunun herkese açık ayarlarını (boot.set) ön yüzün S.set alanlarına çevirir. */
function ypSetFrom(b){ const o=Object.assign({},b||{}); delete o.mailOn; delete o.smsOn; o.demoMode=false; o.popupOn=false; o.autoBk=0; return o; }
function ypEmptyS(){ return {v:3,seq:1,cur:null,
  set:{siteName:'yangpazar.com',slogan:'Oyuncu pazaryeri',siteUrl:'',commission:8,popupOn:false,popupDelay:1.5,autoConfirm:24,minWithdraw:50,moderation:false,whatsapp:'',supportHours:'7/24',
    wheelOn:false,ptRate:100,refOn:true,refBonus:25,refFriend:10,refMin:100,refMax:50,tfaOn:true,demoMode:false,autoBk:0,cs2On:false,pvpEpOn:false,
    exOn:false,exBuyOn:false,exSellOn:false,exPlace:'',exMargin:12,exOffMsg:'Yang Borsası çok yakında açılıyor.',exAffected:[],
    seo:{homeTitle:'',desc:'Metin2 item, yang, won, EP ve karakter alım satımı. Ödemeniz teslim onaylanana kadar güvenli havuzda bekler.',sep:' | ',ogImg:'',ga:'',gsc:'',bing:'',yandex:'',clean:false,noindex:false},
    tc:{req:true,url:''},wdFee:{on:false,type:'sabit',val:0,min:0,max:0},hh:{on:false,pct:30,until:null},
    egp:{on:false,autoOnApprove:false,seri:'',seq:0,stopaj:0,company:'',vd:'',vkn:'',mersis:'',addr:'',provider:'',descTpl:''},
    maint:{on:false,msg:'',until:null},etbis:{on:false,url:'',code:'',date:'',img:''}},
  packs:{slider:{name:'Ana Sayfa Slider',desc:'Ana sayfanın en üstünde geniş vitrin, dönüşümlü gösterim.',p:[350,1500,4900],cap:5},
    popup:{name:'Açılış Popup Reklamı',desc:'Siteye giren her ziyaretçiye oturum başına bir kez tam ekran.',p:[400,2200,7500],cap:2},
    premium:{name:'Premium Server Listesi',desc:'Server listesinde ve sol sütunda altın çerçeveli en üst sıralar.',p:[150,900,2900],cap:6},
    banner:{name:'Kenar Banner 300×250',desc:'Ana sayfa ve ilan sayfalarında sağ sütun.',p:[120,700,2400],cap:3},
    altbanner:{name:'Sağ Sütun Alt Banner 300×600',desc:'Ana sayfa sağ sütunun en altında, büyük görselli dikey alan.',p:[150,850,2900],cap:1},
    text:{name:'Metin Reklam (Üst Şerit)',desc:'Sitenin en üstündeki kayan şeritte tek satır.',p:[60,350,1100],cap:6},
    yan:{name:'Yan Reklam (Sağ + Sol)',desc:'Geniş ekranlarda sayfanın sağ ve sol boşluğunda, iki taraf birlikte satılır.',p:[250,1400,4900],cap:1}},
  dopings:{vitrin:{name:'Vitrin',desc:'Kendi serverının vitrininde ve ana sayfada',p:49,pd:7,max:30},acil:{name:'Acil Satılık',desc:'Kırmızı ACİL etiketi',p:29,pd:4.5,max:30},renk:{name:'Renkli Arka Plan',desc:'Listede dikkat çeken zemin',p:19,pd:3,max:30}},
  gws:[],banks:[],deps:[],coupons:[],raffles:[],rfree:{},spins:{},rev:{commission:0,ads:0,doping:0,ep:0,borsa:0,sms:0},revLog:[],
  servers:[],users:[],listings:[],orders:[],ads:[],wd:[],tx:[],tickets:[],lno:1,exchange:[],exFields:[],exRules:'',exOrders:[],bounties:[],dms:[],flagged:[],notifs:[],
  sms:{on:false,provider:'netgsm',header:'',user:'',pass:'',userPrice:0,ev:{},tpl:{}},smsLog:[],exFieldsBuy:[],backlinks:[],partnerApps:[],posts:[],paytr:{},
  support:{mode:'closed',hours:{},ai:false,canned:[]},tkSeq:1,exOffers:[],ofSeq:0,covers:{},vip:JSON.parse(JSON.stringify(VIP0)),epProducts:[],epOrders:[],epSeq:0,
  slides:[],winback:[],ledger:[],mailLog:[],cryptoNets:[],mail:{on:false,ev:{},tpl:{}}}; }
/* Çok dosyalı derlemede 42-views-member.js'in setTimeout(tcHashFill) çağrısı, tanımı içeren 71-modals.js yüklenmeden çalışabilir.
   Geçici saplama; 71-modals.js yüklenince gerçek tanım bunun yerine geçer (canlı sitede TC özetleri sunucuda). */
function tcHashFill(){ return Promise.resolve(); }
if(YP_PROD){
  load = function(){ const s=ypEmptyS(); S=s; // apiApplyBoot S'ye yazar
    const b=window.YP_BOOT;
    if(b) apiApplyBoot(b);
    else { API.booting=true; setTimeout(()=>apiReboot(true).then(()=>{ API.booting=false; render(); },e=>{ API.booting=false; API.bootErr=apiErr(e); render(); }),0); }
    return s; };
  save = function(){};
}
