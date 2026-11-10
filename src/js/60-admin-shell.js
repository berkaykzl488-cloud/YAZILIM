/* ================== yönetim ================== */
/* ================== Yönetim paneli kabuğu: kayıt defteri, yönlendirme, kuyruklar ================== */
const ADM_NAV=[
  {g:null,items:[{k:'panel',l:'Bugün',desc:'Bekleyen işler; en acil olanlar üstte.',kw:'bugün özet genel bakış gelir kpi iş kuyruğu'}]},
  {g:'Siparişler & teslimat',items:[
    {k:'siparis',l:'Siparişler & itirazlar',p:'siparis',q:['siparis'],desc:'Escrow siparişleri. İtiraz kararı sipariş sayfasında verilir.',kw:'sipariş itiraz escrow havuz iade teslim'},
    {k:'borsa',l:'Borsa',p:['borsa','borsa_ayar'],q:['borsa'],desc:'Yang Borsası alım siparişleri, satış emirleri, kurlar ve bilgi alanları.',kw:'borsa yang won teslimat eşle',subs:[
      {s:'siparisler',l:'Siparişler',p:'borsa',q:['borsa']},{s:'emirler',l:'Satış emirleri',p:'borsa',kw:'satış emri'},{s:'kurlar',l:'Kurlar',p:'borsa_ayar',kw:'kur fiyat teslimat yeri borsaya server ekle'},{s:'alanlar',l:'Bilgi alanları',p:'borsa_ayar',kw:'alan form satış kuralları'}]}]},
  {g:'Finans',items:[
    {k:'odeme',l:'Ödemeler',p:'odeme',q:['odeme'],desc:'Havale ve kripto yüklemelerini onaylayın; ödeme yöntemlerini ve hesapları yönetin.',kw:'ödeme yükleme havale eft kripto paytr dekont txid',subs:[
      {s:'yuklemeler',l:'Yükleme onayları',q:['odeme']},{s:'yontemler',l:'Ödeme yöntemleri',kw:'paytr pos yöntem komisyon bedel'},{s:'hesaplar',l:'Banka & kripto hesapları',kw:'banka iban cüzdan kripto ağ'}]},
    {k:'cekim',l:'Para çekme',p:'cekim',q:['cekim'],desc:'Adı, IBAN\'ı, tutarı ve açıklamayı sırayla kopyalayıp banka uygulamasına yapıştırın. Gönderdikten sonra "Gönderildi & Pusula Kes" ile kapatın.',kw:'çekim iban eft pusula e-gider ygp para çek',subs:[
      {s:'talepler',l:'Talepler',q:['cekim']},{s:'ayarlar',l:'Ayarlar',kw:'tc kimlik doğrulama işlem ücreti e-gider ayarları stopaj'}]},
    {k:'muhasebe',l:'Muhasebe & raporlar',p:'muhasebe',desc:'Günlük raporlar, Excel çıktıları ve e-Gider Pusulası doğrulama. Paraşüt / Bizim Hesap bağlantısı <a href="#yonetim/entegrasyon">Entegrasyonlar</a> sayfasında.',kw:'muhasebe excel rapor vergi matrah',subs:[
      {s:'rapor',l:'Günlük rapor',kw:'excel günlük rapor aralık'},{s:'egider',l:'e-Gider & vergi',kw:'e-gider pusula belge doğrula vergi matrah'}]}]},
  {g:'Üyeler & destek',items:[
    {k:'destek',l:'Canlı destek',p:'destek',q:['destek'],desc:'Temsilci bekleyen sohbetleri üstlenin ve yanıtlayın.',kw:'destek sohbet canlı talep dst',subs:[
      {s:'talepler',l:'Talepler',q:['destek']},{s:'ayarlar',l:'Ayarlar',kw:'çalışma saatleri asistan hazır yanıt'}]},
    {k:'uye',l:'Üyeler & bakiye',p:['uye','bakiye'],desc:'Üyeleri bulun, detaylarını açın; bakiye düzeltin ve hareketsiz üyeleri geri kazanın.',kw:'üye kullanıcı bakiye telefon',subs:[
      {s:'uyeler',l:'Üyeler',p:'uye'},{s:'bakiye',l:'Bakiye düzeltme',p:'bakiye',kw:'bakiye ekle düş düzeltme'},{s:'geri-kazan',l:'Geri kazan',p:'uye',kw:'hareketsiz winback geri kazan kupon'}]},
    {k:'mesaj',l:'Engellenen mesajlar',p:'mesaj',q:['mesaj'],desc:'Telefon, link, e-posta ve site dışı ticaret teklifi içerdiği için gizlenen mesajlar.',kw:'engellenen mesaj gizlenen iletişim'},
    {k:'vip',l:'VIP & davet',p:'vip',desc:'VIP seviyeleri ve davet et kazan kuralları.',kw:'vip seviye davet referans',subs:[
      {s:'seviyeler',l:'VIP seviyeleri'},{s:'davet',l:'Davet et kazan',kw:'davet referans ödül'}]}]},
  {g:'Katalog',items:[
    {k:'ilan',l:'İlanlar',p:'ilan',q:['ilan'],desc:'İlanları onaylayın, düzenleyin veya kaldırın.',kw:'ilan onay moderasyon',subs:[
      {s:'moderasyon',l:'Moderasyon',q:['ilan']},{s:'ayarlar',l:'Ayarlar',kw:'doping fiyat kapak görsel onay'}]},
    {k:'server',l:'Serverlar',p:'server',desc:'Serverı adıyla bulun, filtreyle daraltın, satırı açıp düzenleyin.',kw:'server sunucu pvp tr logo',subs:[
      {s:'tr',l:'Metin2 TR'},{s:'pvp',l:'Metin2 PVP'}]},
    {k:'ep',l:'EP mağazası',p:'ep',q:['ep'],desc:'EP paketleri, kod stoku, satış kayıtları ve Happy Hour.',kw:'ep kod paket happy hour',subs:[
      {s:'paketler',l:'Paketler & kodlar',q:['ep']},{s:'kayitlar',l:'Kod kayıtları'},{s:'happy-hour',l:'Happy Hour'}]}]},
  {g:'Reklam & büyüme',items:[
    {k:'reklam',l:'Reklam satışları',p:'reklam',q:['reklam'],desc:'Server sahiplerine satılan reklam alanları: onay, yayındaki reklamlar, site görselleri ve paket fiyatları.',kw:'reklam banner slider popup altbanner paket',subs:[
      {s:'onay',l:'Onay bekleyenler',q:['reklam']},{s:'tum',l:'Tüm reklamlar'},{s:'gorseller',l:'Site görselleri',kw:'slider görsel'},{s:'fiyatlar',l:'Paket fiyatları',kw:'reklam fiyat paket'}]},
    {k:'kampanya',l:'Çekiliş & kupon',p:'kampanya',desc:'Üyelere yönelik çekiliş, kupon ve şans çarkı.',kw:'çekiliş kupon çark kampanya',subs:[
      {s:'cekilis',l:'Çekilişler'},{s:'kupon',l:'Kuponlar'},{s:'cark',l:'Şans çarkı'}]},
    {k:'seo',l:'SEO & Pazarlama',p:'seo',q:['seo'],desc:'Arama motoru ayarları, reklam takibi, geri bağlantılar ve rehber yazıları tek yerde.',kw:'seo google pazarlama',subs:[
      {s:'genel',l:'Genel SEO & Google',kw:'seo google search console sitemap başlık'},{s:'reklam',l:'Reklam & kampanyalar',kw:'utm google ads analytics pixel gtm adsense kampanya'},{s:'backlink',l:'Backlink & ortaklık',q:['seo'],kw:'backlink ortaklık partner'},{s:'rehber',l:'Rehber yazıları',kw:'rehber yazı blog'}]}]},
  {g:'Sistem',shut:true,items:[
    {k:'entegrasyon',l:'Entegrasyonlar',p:['muhasebe','odeme'],desc:'PayTR, Paraşüt ve Bizim Hesap bağlantılarını buradan kurun ve test edin. Hiçbir dosya düzenlemeniz gerekmez.',kw:'entegrasyon api paytr paraşüt parasut bizim hesap bizimhesap bildirim url cron hakediş kurulum bağlantı merchant anahtar paket zip sunucu'},
    {k:'calisan',l:'Çalışanlar & yetkiler',p:'calisan',desc:'Çalışan normal üye gibi giriş yapar, panelde yalnız yetki verdiğiniz bölümleri görür.',kw:'çalışan yetki personel',subs:[
      {s:'liste',l:'Çalışanlar'},{s:'ekle',l:'Çalışan ekle'}]},
    {k:'sms',l:'E-posta & SMS',p:'sms',desc:'Mesaj şablonları, e-posta (SMTP) ve SMS sağlayıcı ayarları, gönderim kayıtları.',kw:'sms e-posta mail şablon',subs:[
      {s:'sablonlar',l:'Mesaj şablonları'},{s:'eposta',l:'E-posta ayarları',kw:'smtp mail'},{s:'sms',l:'SMS ayarları',kw:'netgsm sağlayıcı'},{s:'kayitlar',l:'Gönderim kayıtları'}]},
    {k:'bakim',l:'Yedek & bakım',p:'bakim',desc:'Bakım modu ve yedekler.',kw:'yedek bakım geri yükle',subs:[
      {s:'bakim',l:'Bakım modu'},{s:'yedekler',l:'Yedekler'}]},
    {k:'ayar',l:'Site ayarları',p:'ayar',desc:'Site adı, komisyon, para çekme alt sınırı, popup ve yayına alma kontrolü.',kw:'ayar komisyon site adı popup demo yayın',subs:[
      {s:'genel',l:'Genel'},{s:'yayin',l:'Yayına alma',kw:'demo modu yayına alma'},{s:'etbis',l:'ETBİS',kw:'etbis ticaret bakanlığı elektronik ticaret bilgi sistemi kayıt qr karekod doğrulama'}]}]}
];
const ADM_HIDDEN=[{k:'ara',l:'Arama sonuçları',p:'ara',desc:'Sipariş, borsa, ilan ve üye araması. Siparişte kimin aldığı ve sattığı ad soyad ve telefonla görünür.'}];
const admCan = p => !p || (Array.isArray(p) ? p.some(x=>can(x)) : can(p));
const admItems = () => ADM_NAV.flatMap(g=>g.items.map(it=>(it.grp=g.g,it)));
const admItem = k => admItems().find(i=>i.k===k) || ADM_HIDDEN.find(i=>i.k===k);
const admSubs = it => (it&&it.subs||[]).filter(s=>admCan(s.p||it.p));
const admVis = it => it.k==='panel' ? isPanel() : admCan(it.p) && (!it.subs || admSubs(it).length>0);
const isAdmRoute = r => r==='yonetim' || String(r||'').startsWith('yonetim/') || String(r||'').startsWith('yonetim?');
function admParse(r){ r=String(r||'yonetim'); const i=r.indexOf('?'); const path=i<0?r:r.slice(0,i), sp=new URLSearchParams(i<0?'':r.slice(i+1)); const a=path.split('/'); return {k:a[1]||'panel', sub:a[2]||null, f:sp.get('f'), q:sp.get('q'), id:sp.get('id'), sort:sp.get('sort'), page:sp.get('page')}; }
function admHash(k,sub,o){ o=o||{}; let h='yonetim'+(k&&k!=='panel'?'/'+k+(sub?'/'+sub:''):''); const sp=new URLSearchParams(); ADM_QK.forEach(x=>{ if(o[x]!=null&&o[x]!=='') sp.set(x,o[x]); }); const s=sp.toString(); return h+(s?'?'+s:''); }
function admGo(k,sub,params){ ui.aq=''; ui.exOpen=null; document.body.classList.remove('adm-menu'); const h=admHash(k,sub,params); if(route()===h){ render(); window.scrollTo(0,0); } else location.hash=h; }
const ADM_QK=['f','q','id','sort','page'];
function admSet(o){ const P=admParse(route()); const n=Object.assign({f:P.f,q:P.q,id:P.id,sort:P.sort,page:P.page},o); try{ history.replaceState(null,'','#'+admHash(P.k,P.sub,n)); }catch(e){ location.hash=admHash(P.k,P.sub,n); return; } render(); }
// R7: filtre/arama durumunu yeniden çizmeden adrese yazar (yazarken odak kaybolmaz; yenileme / geri tuşu aynı görünümü açar).
function admRepl(o){ const r=route(); if(!isAdmRoute(r)) return; const P=admParse(r); const sub=P.sub||(ui.asub||{})[P.k]||null; const n=Object.assign({f:P.f,q:P.q,id:P.id,sort:P.sort,page:P.page},o); const h='#'+admHash(P.k,sub,n); if(h!==location.hash) try{ history.replaceState(null,'',h); }catch(e){} }
const ADM_SLA_TXT = ms => ms>=7*D?Math.round(ms/(7*D))+' hafta':ms>=D?Math.round(ms/D)+' gün':ms>=H?Math.round(ms/H)+' sa':Math.round(ms/60000)+' dk';
function ageTxt(ms){ ms=Math.max(0,ms); const m=Math.floor(ms/60000); if(m<60) return m+' dk'; const h=Math.floor(m/60); if(h<24) return h+' sa'+(m%60?' '+(m%60)+' dk':''); const d=Math.floor(h/24); return d+' gün'+(h%24?' '+(h%24)+' sa':''); }
const dispT = o => { const L=(o.log||[]).filter(x=>/itiraz/i.test(x.x||'')); return (L.length?L[L.length-1].t:0)||o.t; };
const ADM_QUEUES=[
  {id:'cekim',l:'Para çekme',g:'Finans',p:'cekim',sla:6*H,h:'#yonetim/cekim/talepler?f=bekliyor',L:()=>S.wd.filter(w=>w.status==='bekliyor'),t:w=>w.t,meta:L=>`Gönderilecek <b>${TL(r2(L.reduce((s,w)=>s+(w.net!=null?w.net:w.amount),0)))}</b>`},
  {id:'siparis',l:'İtirazlı sipariş',g:'Siparişler',p:'siparis',sla:24*H,h:'#yonetim/siparis?f=itiraz',L:()=>S.orders.filter(o=>o.status==='itiraz'),t:dispT,meta:L=>`Havuzda <b>${TL(r2(L.reduce((s,o)=>s+(o.total||0),0)))}</b>`},
  {id:'odeme',l:'Yükleme onayı',g:'Finans',p:'odeme',sla:2*H,h:'#yonetim/odeme/yuklemeler?f=bekliyor',L:()=>S.deps.filter(d=>d.status==='bekliyor'),t:d=>d.t,meta:L=>{ const m={}; L.forEach(d=>{ const n=(S.gws.find(g=>g.id===d.gw)||{}).n||d.gw; m[n]=(m[n]||0)+1; }); return Object.entries(m).map(([k,v])=>esc(k)+' '+v).join(', ')+`, toplam <b>${TL(r2(L.reduce((s,d)=>s+(+d.amount||0),0)))}</b>`; }},
  {id:'borsa',l:'Borsa siparişi',g:'Teslimat',p:'borsa',sla:2*H,h:'#yonetim/borsa/siparisler?f=bekliyor',L:()=>S.exOrders.filter(o=>exOpenSt(o.status)),t:o=>o.t,meta:L=>{ const m={}; L.forEach(o=>{ const n=EXS[o.status]||o.status; m[n]=(m[n]||0)+1; }); return Object.entries(m).map(([k,v])=>v+' '+esc(String(k).toLocaleLowerCase('tr-TR'))).join(', '); }},
  {id:'destek',l:'Canlı destek',g:'Destek',p:'destek',sla:15*60000,h:'#yonetim/destek/talepler?f=aktif',L:()=>S.tickets.filter(x=>x.status==='bekliyor'),t:x=>x.queuedAt||x.t,meta:()=>'Temsilci bekliyor'},
  {id:'ilan',l:'İlan onayı',g:'Katalog',p:'ilan',sla:8*H,h:'#yonetim/ilan/moderasyon?f=beklemede',L:()=>S.listings.filter(l=>l.status==='beklemede'),t:l=>l.t,meta:L=>{ const m={}; L.forEach(l=>{ const n=catName(l); m[n]=(m[n]||0)+1; }); return Object.entries(m).map(([k,v])=>esc(k)+' '+v).join(', '); }},
  {id:'reklam',l:'Reklam onayı',g:'Reklam',p:'reklam',sla:24*H,h:'#yonetim/reklam/onay',L:()=>S.ads.filter(a=>adSt(a)==='onay'),t:a=>a.bookedAt||a.start||now(),meta:L=>L.length===1?`${esc((S.packs[L[0].type]||{}).name||L[0].type)} · <b>${TL(L[0].price||0)}</b>`:`<b>${TL(r2(L.reduce((s,a)=>s+(a.price||0),0)))}</b> toplam`},
  {id:'mesaj',l:'Engellenen mesaj',g:'Üyeler',p:'mesaj',sla:24*H,h:'#yonetim/mesaj?f=yeni',L:()=>S.flagged.filter(f=>!f.seen),t:f=>f.t,meta:L=>`${new Set(L.map(f=>f.u)).size} üyeden, incelenmedi`},
  {id:'seo',l:'Ortaklık başvurusu',g:'SEO',p:'seo',sla:7*D,h:'#yonetim/seo/backlink',L:()=>(S.partnerApps||[]).filter(a=>a.st==='bekliyor'),t:a=>a.t,meta:L=>[...new Set(L.map(a=>({server:'Partner server',yayinci:'Yayıncı',site:'Site / backlink'})[a.tp]||a.tp))].map(esc).join(', ')},
  {id:'ep',warn:true,l:'EP stoğu azaldı',g:'Katalog',p:'ep',h:'#yonetim/ep/paketler',L:()=>S.epProducts.filter(p=>p.on&&p.codes.length<3),meta:L=>{ const p=L.slice().sort((a,b)=>a.codes.length-b.codes.length)[0]; return p?`${esc(epName(p))} ${NUM(p.ep)} EP: <b>${p.codes.length}</b> kod kaldı`:''; }}
];
const admQ = id => ADM_QUEUES.find(x=>x.id===id);
const admQn = id => { const x=admQ(id); return x&&can(x.p)?x.L().length:0; };
function admBadge(it,sub){ const qs=(sub?sub.q:it.q)||[]; let w=0, wr=0; qs.forEach(id=>{ const x=admQ(id); if(!x||!can(x.p)) return; if(x.warn) wr+=x.L().length; else w+=x.L().length; });
  if(!sub&&it.k==='panel') w=admTotal();
  if(w) return `<span class="nb" aria-label="${w} bekleyen iş">${w}</span>`; if(wr) return `<span class="nb warn" aria-label="${wr} uyarı">${wr}</span>`;
  if(!sub&&it.k==='bakim'&&maintOn()) return '<span class="nb dot" title="Bakım modu açık" aria-label="Bakım modu açık"></span>'; return ''; }
const admWork = it => (it.q||[]).reduce((s,id)=>{ const x=admQ(id); return s+(x&&!x.warn&&can(x.p)?x.L().length:0); },0);
const admTotal = () => ADM_QUEUES.filter(x=>!x.warn&&can(x.p)).reduce((s,x)=>s+x.L().length,0);
const ADM_ICO={chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  q:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  ext:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  sep:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'};
function admGrpState(){ try{ return JSON.parse(localStorage.getItem('yp_admgrp')||'{}')||{}; }catch(e){ return {}; } }
function admNavHtml(P){ const G=admGrpState();
  return ADM_NAV.map(g=>{ const its=g.items.filter(admVis); if(!its.length) return '';
    const li=it=>`<a class="${it.k==='panel'?'asb-top':'asb-i'} ${P.k===it.k?'on':''}" href="#${admHash(it.k)}" data-act="atab" data-t="${it.k}" ${P.k===it.k?'aria-current="page"':''}><span>${esc(it.l)}</span>${admBadge(it)}</a>`;
    if(!g.g) return its.map(li).join('');
    const open=its.some(i=>i.k===P.k)||(G[g.g]!=null?!!G[g.g]:!g.shut); const sum=its.reduce((s,i)=>s+admWork(i),0);
    return `<div class="asb-g ${open?'':'shut'}" data-g="${esc(g.g)}"><button type="button" class="asb-gh" data-act="adm-grp" data-g="${esc(g.g)}" aria-expanded="${open}">${ADM_ICO.chev}<span>${esc(g.g)}</span>${sum?`<span class="nb">${sum}</span>`:''}</button><div class="asb-l">${its.map(li).join('')}</div></div>`; }).join(''); }
const admCmdBox = (id,mob) => `<div class="acmd" data-cmd><span class="acmd-ic">${ADM_ICO.q}</span><input class="acmd-in" id="${id}" type="search" placeholder="Bölüm, üye, sipariş no, borsa no, e-Gider no…" aria-label="Komut araması: bölüm, üye, sipariş, borsa veya e-Gider no" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="${id}_pop" aria-autocomplete="list">${mob?'':'<kbd>Ctrl K</kbd>'}<div class="acmd-pop" id="${id}_pop" role="listbox"></div></div>`;
function aSubs(it,cur){ const L=admSubs(it); if(L.length<2) return '';
  return `<nav class="asub" aria-label="${esc(it.l)} alt bölümleri">${L.map(s=>{ const on=s.s===cur; const extra=it.k==='server'?` data-act="sv-sec" data-s="${s.s}"`:it.k==='sms'?` data-act="ntab" data-t="${({sablonlar:'tpl',eposta:'mail',sms:'sms',kayitlar:'log'})[s.s]}"`:''; const cnt=it.k==='server'?`<span class="chip">${S.servers.filter(x=>x.sec===s.s).length}</span>`:admBadge(it,s); return `<a href="#${admHash(it.k,s.s)}" class="${on?'on':''}" ${on?'aria-current="page"':''}${extra}>${esc(s.l)}${cnt}</a>`; }).join('')}</nav>`; }
function aPage(o){ return `<section class="apage"><div class="aph"><div><h1>${esc(o.title)}</h1>${o.desc?`<p>${o.desc}</p>`:''}</div>${o.actions?`<div class="aph-r">${o.actions}</div>`:''}</div>${o.subs||''}${o.body}</section>`; }
function aChips(act,cur,L){ return `<div class="afchips" role="group">${L.map(([k,l,n])=>`<button type="button" class="afchip ${cur===k?'on':''}" data-act="${act}" data-f="${esc(k)}" aria-pressed="${cur===k}">${esc(l)}${n!=null?` <b>${n}</b>`:''}</button>`).join('')}</div>`; }
function aFilter(o){ return `<div class="afbar">${o.q!==undefined?`<form class="afq" data-form="asearch" role="search">${ADM_ICO.q}<input class="inp" id="aq" type="search" value="${esc(o.q||'')}" placeholder="${esc(o.ph||'Ara')}" autocomplete="off" aria-label="${esc(o.ph||'Ara')}">${o.q?'<button type="button" class="afq-x" data-act="aq-clear" aria-label="Aramayı temizle">'+ADM_ICO.x+'</button>':''}</form>`:''}${o.chips||''}${o.extra||''}${o.right?`<div class="afbar-r">${o.right}</div>`:''}</div>`; }
function aSum(L){ return `<div class="asum">${L.map(([l,v,a])=>`<div><small>${l}</small><b class="${a?'acc':''}">${v}</b></div>`).join('')}</div>`; }
const aSave = (label,extra) => `<div class="asave"><span class="muted asave-m">Değişiklik yok</span>${extra||''}<button class="btn btn-primary">${label||'Kaydet'}</button></div>`;
const aMore = (k,n,lim) => n>lim?`<div class="svmore"><button type="button" class="btn btn-sm" data-act="adm-more" data-k="${k}">Daha fazla göster</button><span class="muted" style="font-size:12.5px">${lim} gösteriliyor, ${n-lim} kayıt daha</span></div>`:'';
const admLim = k => (ui.lim&&ui.lim[k])||100;
const aSw = '<span class="asw-n">Anında uygulanır</span>';
function admShell(o){ const u=me(), P=o.P, it=o.it, sub=o.sub; const tot=admTotal(); const subL=sub?(admSubs(it).find(s=>s.s===sub)||{}).l:'';
  const crumb=`<nav class="acrumb" aria-label="Konum"><span>Yönetim</span>${it.grp?ADM_ICO.sep+'<span>'+esc(it.grp)+'</span>':''}${ADM_ICO.sep}<b>${esc(it.l)}${subL&&admSubs(it).length>1?' › '+esc(subL):''}</b></nav>`;
  const sw=S.set.demoMode===false&&!(u&&u.admin)?'':`<label class="asb-sw" for="admUser"><span>Hesap değiştir</span><select class="inp" id="admUser" data-change="switch"><option value="">Çıkış yapmış</option>${S.users.map(x=>`<option value="${x.id}" ${S.cur===x.id?'selected':''}>${x.admin?'Yönetici':x.staff?esc(x.name)+' (çalışan)':esc(x.name)}</option>`).join('')}</select></label>`;
  const who=`<div class="asb-who">${av(u)}<div><b>${esc(u.name)}</b><span>${u.admin?'Yönetici · tüm yetkiler':'Çalışan · '+(u.perms||[]).length+' yetki'}</span></div></div>`;
  const nav=admNavHtml(P);
  const mt=maintOn()?`<div class="maintbar"><b>Bakım modu açık.</b> Ziyaretçiler bakım sayfasını görüyor, siz siteyi normal kullanıyorsunuz. <a href="#yonetim/bakim">Bakım ayarları</a></div>`:'';
  return `<div class="ash admwrap"><aside class="asb" aria-label="Yönetim menüsü">${who}<nav class="asb-nav">${nav}</nav>${sw}</aside>
  <div class="amain"><div class="atop">${crumb}<div class="atop-r">${admCmdBox('acmdA')}<button type="button" class="ibtn" data-act="theme" aria-label="${curTheme()==='dark'?'Gündüz moduna geç':'Gece moduna geç'}">${curTheme()==='dark'?THEME_ICO.sun:THEME_ICO.moon}</button></div></div>
    <div class="mtop"><button type="button" class="ibtn" data-act="adm-menu" aria-label="Menüyü aç" aria-expanded="false" aria-controls="admDrawer">${ADM_ICO.menu}${tot?`<span class="nb">${tot}</span>`:''}</button><div class="mtop-t"><small>${esc(it.grp||'Yönetim')}</small><b>${esc(it.l)}</b></div><button type="button" class="ibtn" data-act="adm-menu" data-q="1" aria-label="Ara">${ADM_ICO.q}</button></div>
    ${mt}${o.page}</div></div>
  <div class="adrawer-bg" data-act="adm-menu-close"></div>
  <aside class="adrawer" id="admDrawer" role="dialog" aria-modal="true" aria-label="Yönetim menüsü"><div class="adrawer-h"><b class="adrawer-brand">${esc(S.set.siteName)}</b><button type="button" class="ibtn adrawer-x" data-act="adm-menu-close" aria-label="Menüyü kapat">${ADM_ICO.x}</button></div>
    <div class="adrawer-q">${admCmdBox('acmdM',1)}</div><nav class="adrawer-n">${nav}</nav>${sw?`<div class="adrawer-sw">${sw.replace(/admUser/g,'admUserM')}</div>`:''}<div class="adrawer-f"><button type="button" class="btn" data-act="theme">${curTheme()==='dark'?'Açık tema':'Koyu tema'}</button><a class="btn" href="#home">Siteye dön</a></div></aside>${o.over||''}`; }
/* --- Bugün --- */
function admToday(){ const Q=ADM_QUEUES.filter(x=>can(x.p)).map(x=>{ const L=x.L(); let old=null, r=0, cls='';
    if(!x.warn&&L.length&&x.t){ old=Math.min(...L.map(x.t)); r=Math.min(1,(now()-old)/x.sla); cls=r>=1?'bad':r>=.6?'warn':''; }
    if(x.warn&&L.length){ const mn=Math.min(...L.map(p=>p.codes.length)); r=1-mn/3; cls='warn'; }
    return {x,L,n:L.length,old,r,cls}; });
  const pri={bad:0,warn:1,'':2}; const act=Q.filter(q=>q.n).sort((a,b)=>(!!a.x.warn-!!b.x.warn)||pri[a.cls]-pri[b.cls]||ADM_QUEUES.indexOf(a.x)-ADM_QUEUES.indexOf(b.x)); const zero=Q.filter(q=>!q.n);
  const tot=admTotal(); const dd=new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'});
  const card=q=>`<a class="qcard ${q.cls==='bad'?'hot':''} ${q.x.warn?'alert':''}" href="${q.x.h}"><span class="lbl">${esc(q.x.l)} <small>${esc(q.x.g)}</small></span><span class="n">${q.n}</span><span class="meta">${q.x.meta(q.L)}</span><span class="qsla ${q.cls}"><span class="qsla-t"><i style="width:${Math.max(4,Math.round(q.r*100))}%"></i></span><span class="qsla-x">${q.x.warn?'<span>Stok uyarısı</span><span>3 kodun altında</span>':`<span>En eski <b>${ageTxt(now()-q.old)}</b></span><span>hedef ${ADM_SLA_TXT(q.x.sla)}</span>`}</span></span></a>`;
  const st=(on,l,h,p)=>{ const c=`<i></i>${l}`; return h&&can(p)?`<a class="state ${on?'':'off'}" href="${h}">${c}</a>`:`<span class="state ${on?'':'off'}">${c}</span>`; };
  const chips=st(S.set.exOn,S.set.exOn?'Borsa açık':'Borsa kapalı','#yonetim/borsa','borsa')+st(supportOpen(),supportOpen()?'Destek açık · '+esc(hoursTxt()):'Destek kapalı','#yonetim/destek/ayarlar','destek')+st(!maintOn(),maintOn()?'Bakım açık':'Bakım kapalı','#yonetim/bakim','bakim');
  let h=`<div class="sec-h"><h2>İş kuyruğu</h2><span>Kartlar yalnızca yetkiniz olan bölümleri gösterir</span></div>
    ${act.length?`<div class="qgrid">${act.map(card).join('')}</div>`:`<div class="panel empty"><b>Bekleyen iş yok.</b>Yeni talepler geldiğinde burada görünür.</div>`}
    ${zero.length?`<div class="qclean"><span class="chip ok">Bekleyen yok</span>${zero.map(q=>`<span>${esc(q.x.l)}</span>`).join('<span aria-hidden="true">·</span>')}</div>`:''}`;
  h+=entTodayCard();
  if(can('panel')){ const wdp=S.wd.filter(w=>w.status==='bekliyor'), exq=S.exOrders.filter(o=>exOpenSt(o.status));
    const days=[...Array(7)].map((_,i)=>{const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(6-i)); return d.getTime();});
    const vals=days.map(d=>r2(S.revLog.filter(e=>e.t>=d&&e.t<d+D).reduce((s,e)=>s+e.a,0))); const mx=Math.max(...vals,1);
    h+=`<div class="sec-h"><h2>Gelir</h2><span>Toplam, açılıştan bu yana</span></div>
    <div class="kpis"><div class="kpi hl"><small>Komisyon geliri</small><b>${TL(S.rev.commission)}</b></div><div class="kpi hl"><small>Reklam geliri</small><b>${TL(S.rev.ads)}</b></div><div class="kpi hl"><small>Borsa kârı</small><b>${TL(S.rev.borsa)}</b></div><div class="kpi hl"><small>EP satışı</small><b>${TL(S.rev.ep||0)}</b></div><div class="kpi hl"><small>Doping + SMS</small><b>${TL(S.rev.doping+S.rev.sms)}</b></div></div>
    <div class="dash2"><div class="panel"><div class="panel-h"><h3>Son 7 gün toplam gelir</h3><span class="muted" style="font-size:12px">Komisyon, reklam, borsa, EP, doping, SMS</span></div>
        <div class="bars">${vals.map(v=>`<div class="bar"><em>${v>=1000?(v/1000).toFixed(1)+'B':Math.round(v)}</em><i style="height:${Math.max(2,v/mx*120)}px"></i></div>`).join('')}</div>
        <div class="bars-x">${days.map(d=>`<span>${new Date(d).toLocaleDateString('tr-TR',{weekday:'short'})}</span>`).join('')}</div></div>
      <div class="panel"><div class="panel-h"><h3>Şu an</h3></div><div class="dkpis"><div class="kpi"><small>Havuzdaki para</small><b>${TL(escrowSum())}</b></div><div class="kpi"><small>Bekleyen çekim</small><b>${TL(wdp.reduce((s,w)=>s+w.amount,0))}</b></div><div class="kpi"><small>Borsa kuyruğu</small><b>${exq.length}</b></div><div class="kpi"><small>Çevrimiçi üye</small><b>${S.users.filter(isOnline).length}</b></div></div></div></div>`; }
  return {desc:`${dd[0].toLocaleUpperCase('tr-TR')+dd.slice(1)}. ${tot?tot+' iş bekliyor; en acil olanlar üstte.':'Şu an bekleyen iş yok.'}`, actions:chips, body:h}; }
/* --- Komut araması --- */
function cmdResults(raw){ const q=sqNorm(raw), ql=String(raw||'').toLocaleLowerCase('tr-TR').trim(); if(!q) return [];
  const G=[]; const add=(t,rows)=>{ if(rows.length) G.push([t,rows.slice(0,5)]); };
  const sec=[]; admItems().filter(admVis).forEach(it=>{ const hit=x=>sqNorm(x).includes(q); const subs=admSubs(it);
    if(hit(it.l)||(it.kw||'').split(' ').some(w=>w&&sqNorm(w).startsWith(q))||q.length>2&&hit(it.kw||'')) sec.push({l:it.l,k:it.grp||'Bölüm',h:'#'+admHash(it.k)});
    subs.forEach(s=>{ if(hit(s.l)||q.length>2&&hit(s.kw||'')) sec.push({l:it.l+' › '+s.l,k:it.grp||'Bölüm',h:'#'+admHash(it.k,s.s)}); }); });
  add('Bölümler',sec);
  const um=u=>[u.name,fullName(u),u.tel,u.email].some(v=>sqNorm(v).includes(q));
  if(can('uye')||can('ara')) add('Üyeler',S.users.filter(u=>!u.admin&&um(u)).map(u=>({l:esc(u.name)+' <span class="muted">· '+esc(fullName(u))+'</span>',k:u.tel||'',act:'user-open',id:u.id})));
  if(can('siparis')||can('ara')) add('Siparişler',S.orders.filter(o=>sqNorm(o.id).includes(q)||String((lst(o.lid)||{}).no||'')===ql||[user(o.buyer),user(o.seller)].some(u=>u&&sqNorm(u.name).includes(q))).map(o=>({k:'#'+o.id,l:esc(o.title),e:ST[o.status],h:'#siparis-'+o.id})));
  if(can('borsa')) add('Borsa',S.exOrders.filter(o=>sqNorm(o.id).includes(q)||sqNorm((user(o.u)||{}).name).includes(q)).map(o=>({k:'#'+o.id,l:esc((user(o.u)||{}).name||'')+' · '+esc((srv(o.server)||{}).name||''),e:EXS[o.status],act:'ex-open',id:o.id})));
  if(can('cekim')||can('muhasebe')) add('Para çekme & e-Gider',S.wd.filter(w=>{ const g=w.egp||{}; return [g.no,g.ettn,w.id,w.iban,w.name].some(v=>sqNorm(v).includes(q)); }).map(w=>({k:w.egp?w.egp.no:w.id,l:esc(w.name)+' · '+TL(w.net!=null?w.net:w.amount),e:w.status,act:w.egp?'egp-view':'adm-wdq',id:w.id})));
  if(can('ilan')||can('ara')) add('İlanlar',S.listings.filter(l=>String(l.no)===ql||String(l.no).includes(q)&&q.length>2||sqNorm(l.title).includes(q)).map(l=>({k:'#'+l.no,l:esc(l.title),e:l.status,h:'#ilan-'+l.id})));
  if(can('destek')) add('Destek',S.tickets.filter(t=>sqNorm('dst-'+(t.no||'')).includes(q)||String(t.no||'')===ql||sqNorm((user(t.u)||{}).name).includes(q)).map(t=>({k:'#DST-'+(t.no||''),l:esc((user(t.u)||{}).name||'Misafir'),e:t.status,act:'adm-tk',id:t.id})));
  if(can('ara')) G.push(['',[{l:'Tüm sonuçları göster: “'+esc(raw.trim())+'”',k:'',h:'#'+admHash('ara',null,{q:raw.trim()})}]]);
  return G; }
function cmdRender(inp){ const box=inp.closest('[data-cmd]'), pop=box&&box.querySelector('.acmd-pop'); if(!pop) return; const G=cmdResults(inp.value);
  if(!inp.value.trim()){ box.classList.remove('open'); inp.setAttribute('aria-expanded','false'); pop.innerHTML=''; return; }
  let i=0; pop.innerHTML=G.length?G.map(([t,R])=>`${t?`<div class="acmd-h">${t}</div>`:''}${R.map(r=>`<a class="acmd-r ${i===0?'sel':''}" role="option" id="${inp.id}_o${i++}" ${r.h?`href="${r.h}"`:'href="#" '}${r.act?`data-act="${r.act}" data-id="${esc(r.id)}"`:''} data-cmdr>${r.k?`<span class="k">${esc(r.k)}</span>`:''}<span class="acmd-l">${r.l}</span>${r.e?`<em>${esc(r.e)}</em>`:''}</a>`).join('')}`).join(''):'<div class="acmd-h">Sonuç yok</div>';
  box.classList.add('open'); inp.setAttribute('aria-expanded','true'); }
function cmdClose(){ document.querySelectorAll('[data-cmd].open').forEach(b=>{ b.classList.remove('open'); const i=b.querySelector('.acmd-in'); if(i){ i.setAttribute('aria-expanded','false'); } }); }
/* --- Ortak onay penceresi --- */
let CFM_CB=null, CFM_PREV=null;
function openConfirm(o){ let c=$('#cfm'); if(!c){ document.body.insertAdjacentHTML('beforeend','<div class="cfm" id="cfm" hidden><div class="cfm-bg" data-cfm="no"></div><div class="cfm-b" role="alertdialog" aria-modal="true" aria-labelledby="cfm_t" aria-describedby="cfm_d"><h3 id="cfm_t"></h3><p id="cfm_d"></p><div class="cfm-f"><button type="button" class="btn" data-cfm="no">Vazgeç</button><button type="button" class="btn" data-cfm="ok" id="cfm_ok"></button></div></div></div>'); c=$('#cfm'); }
  $('#cfm_t').textContent=o.t; $('#cfm_d').innerHTML=o.d||''; const ok=$('#cfm_ok'); ok.textContent=o.ok||'Onayla'; ok.className='btn '+(o.danger?'btn-bad-solid':'btn-primary');
  CFM_CB=o.onOk; CFM_PREV=document.activeElement; c.hidden=false; (o.danger?c.querySelector('[data-cfm=no].btn'):ok).focus(); }
function closeConfirm(run){ const c=$('#cfm'); if(!c||c.hidden) return; c.hidden=true; const cb=CFM_CB; CFM_CB=null; if(CFM_PREV&&CFM_PREV.isConnected) try{ CFM_PREV.focus(); }catch(e){} if(run&&cb) cb(); }
const cfmW = id => S.wd.find(x=>x.id===id)||{};
const CFM={
  'srv-del':d=>{ const s=srv(d.id)||{}; const n=S.listings.filter(l=>l.server===d.id).length; return ['Server silinsin mi?',`<b>${esc(s.name||'')}</b> silinecek. Bu serverda <b>${n} ilan</b> var; silinince server listelerden kalkar.`,'Serverı sil',1]; },
  'ad-del':()=>['Reklam silinsin mi?','Reklam kaydı kalıcı olarak silinir.','Reklamı sil',1],
  'r-del':()=>['Çekiliş silinsin mi?','Çekiliş ve biletleri silinir.','Çekilişi sil',1],
  'cp-del':()=>['Kupon silinsin mi?','Kupon kodu kalıcı olarak silinir.','Kuponu sil',1],
  'bank-del':()=>['Banka hesabı silinsin mi?','Üyeler bu hesabı havale seçeneklerinde artık görmez.','Hesabı sil',1],
  'xr-del':()=>['Borsa satırı silinsin mi?','Bu server borsadan kaldırılır.','Satırı sil',1],
  'staff-del':d=>['Çalışanlıktan çıkarılsın mı?',`${esc((user(d.id)||{}).name||'')} panel erişimini ve tüm yetkilerini kaybeder.`,'Çalışanlıktan çıkar',1],
  'vip-del':()=>['VIP seviyesi silinsin mi?','Seviye listeden kaldırılır.','Seviyeyi sil',1],
  'ef-del':()=>['Bilgi alanı silinsin mi?','Alan formdan kaldırılır.','Alanı sil',1],
  'slide-del':()=>['Site görseli silinsin mi?','Görsel slider\'dan kaldırılır.','Görseli sil',1],
  'bk-del':()=>['Yedek silinsin mi?','Bu yedek kalıcı olarak silinir.','Yedeği sil',1],
  'l-del':d=>['İlan kaldırılsın mı?',`“${esc((lst(d.id)||{}).title||'')}” yayından kaldırılır ve satıcıya bildirim gider.`,'İlanı kaldır',1],
  'u-ban':d=>{ const u=user(d.id)||{}; return u.banned?['Yasak kaldırılsın mı?',`${esc(u.name||'')} yeniden işlem yapabilir.`,'Yasağı kaldır',0]:['Üye yasaklansın mı?',`${esc(u.name||'')} siteye giriş yapamaz ve işlem yapamaz.`,'Yasakla',1]; },
  'dep-no':d=>{ const x=S.deps.find(y=>y.id===d.id)||{}; return ['Yükleme reddedilsin mi?',`${TL(x.amount||0)} · ${esc((user(x.u)||{}).name||'')} bildirimi reddedilir.`,'Reddet',1]; },
  'dep-ok':d=>{ const x=S.deps.find(y=>y.id===d.id)||{}; return ['Yükleme onaylansın mı?',`<b>${TL(x.amount||0)}</b> ${esc((user(x.u)||{}).name||'')} bakiyesine eklenecek.`,'Onayla',0]; },
  'wd-no':d=>{ const w=cfmW(d.id); return ['Çekim talebi reddedilsin mi?',`${TL(w.amount||0)} ${esc((user(w.u)||{}).name||'')} bakiyesine iade edilir.`,'Reddet',1]; },
  'wd-ok':d=>{ const w=cfmW(d.id); const ib=String(w.iban||'').replace(/\s/g,''); return ['Para gönderildi mi?',`<b>${esc(w.name||'')}</b> hesabına (IBAN …${esc(ib.slice(-4))}) <b>${TL(w.net!=null?w.net:(w.amount||0))}</b> gönderdiniz mi? ${!w.taxpayer&&!w.egp&&egpCfg().autoOnApprove!==false&&!tcFull(user(w.u))?`Onaylayınca talep kapanır; <b class="neg">${EGP_NOTC}</b>, bu yüzden e-Gider Pusulası kesilmez.`:'Onaylayınca talep kapanır ve e-Gider Pusulası kesilir.'}`,'Evet, gönderildi',0]; },
  'of-cancel':()=>['Satış emri iptal edilsin mi?','Emir iptal edilir ve satıcıya bildirim gönderilir.','Emri iptal et',1],
  'ex-cancel':()=>['Borsa siparişi iptal edilsin mi?','Sipariş iptal edilir, ödeme alıcının bakiyesine iade edilir.','Siparişi iptal et',1],
  'draw':()=>['Kazanan çekilsin mi?','Kazanan rastgele seçilir; bu işlem geri alınamaz.','Kazananı çek',0],
  'spin-reset':()=>['Çark hakları yenilensin mi?','Tüm üyelerin günlük çark hakkı yenilenir.','Hakları yenile',0],
  'ex-power':()=>S.set.exOn?['Borsa kapatılsın mı?',`Borsa sayfası tamamen kapanır; <b>${S.exOrders.filter(o=>exOpenSt(o.status)).length} açık alım siparişi</b> ve <b>${S.exOffers.filter(o=>o.status==='aktif').length} satış emri</b> iptal edilir, ödemeler bakiyelere iade edilir ve üyelere bilgilendirme gider.`,'Borsayı kapat',1]:null,
  'ep-del':()=>['EP paketi silinsin mi?','Paket ve stoktaki kodları silinir.','Paketi sil',1],
  'ep-cdel':()=>['Kod silinsin mi?','Stoktaki kod silinir.','Kodu sil',1],
  'cnet-del':()=>['Kripto ağı silinsin mi?','Ağ ve cüzdan adresi kaldırılır.','Ağı sil',1],
  'bl-del':()=>['Backlink silinsin mi?','Kayıt listeden kaldırılır.','Sil',1],
  'post-del':()=>['Rehber yazısı silinsin mi?','Yazı kalıcı olarak silinir.','Yazıyı sil',1],
  'bk-restore':()=>['Yedek geri yüklensin mi?','Mevcut durum önce otomatik yedeklenir, sonra seçilen yedek yüklenir.','Geri yükle',1],
  'reset':()=>['Demo verileri sıfırlansın mı?','Tüm veriler başlangıç durumuna döner. Bu işlem geri alınamaz.','Verileri sıfırla',1],
  'tc-reset':d=>['TC doğrulaması sıfırlansın mı?',`${esc((user(d.id)||{}).name||'')} kimliğini yeniden doğrulamak zorunda kalır.`,'Sıfırla',1],
  'ex-unpair-all':()=>['Tüm eşleşmeler kaldırılsın mı?','Siparişe eşlenen tüm satış emirleri serbest bırakılır.','Eşleşmeleri kaldır',1]
};
/* --- Serverlar: istemci tarafı süzme --- */
// R7: boş adres ve varsayılan yer tutucu (https://example.com) "web sitesi eksik" sayılır (çip sayısı ve satır aynı kuralı kullanır).
const srvWeb = u => { u=String(u||'').trim(); return !!u && !/^https?:\/\/(www\.)?example\.com\/?$/i.test(u); };
const SVFX={ilan:d=>+d.ilan>0, ep:d=>d.ep==='1', ad:d=>d.ad==='1', noweb:d=>d.web==='0', noseo:d=>d.seo==='0'};
const SVSORT={ad:(a,b)=>a.dataset.name.localeCompare(b.dataset.name,'tr'), ilan:(a,b)=>(+b.dataset.ilan)-(+a.dataset.ilan)||a.dataset.name.localeCompare(b.dataset.name,'tr'), yeni:(a,b)=>(+b.dataset.added)-(+a.dataset.added)||a.dataset.name.localeCompare(b.dataset.name,'tr')};
function svApply(){ const tb=$('#svRows'); if(!tb) return; admRepl({q:ui.svQ||null,f:(ui.svF||[]).join(',')||null,sort:ui.svSort&&ui.svSort!=='ad'?ui.svSort:null,page:(ui.svPage||1)>1?ui.svPage:null}); const q=String(ui.svQ||'').toLocaleLowerCase('tr-TR').trim(), F=ui.svF||[], rows=[...tb.querySelectorAll('tr[data-id]')];
  const ok=r=>(!q||r.dataset.hay.includes(q))&&F.every(k=>SVFX[k]&&SVFX[k](r.dataset)); const M=rows.filter(ok).sort(SVSORT[ui.svSort||'ad']||SVSORT.ad);
  const lim=(ui.svPage||1)*50; rows.forEach(r=>{ r.hidden=true; }); M.forEach(r=>tb.appendChild(r)); M.slice(0,lim).forEach(r=>{ r.hidden=false; });
  rows.forEach(r=>r.classList.toggle('sel',r.dataset.id===ui.svEdit||r.dataset.id===ui.svHi));
  const c=$('#sv_cnt'); if(c) c.textContent=(q||F.length)?`${rows.length} serverdan ${M.length} eşleşti`:`${rows.length} server`;
  const e=$('#sv_empty'); if(e) e.hidden=M.length>0; const tw=$('#svTblW'); if(tw) tw.hidden=!M.length;
  const mo=$('#sv_more'); if(mo){ mo.hidden=M.length<=lim; const t=$('#sv_more_t'); if(t) t.textContent=`${Math.min(lim,M.length)} gösteriliyor, ${Math.max(0,M.length-lim)} server daha`; }
  document.querySelectorAll('[data-act="svf"]').forEach(b=>{ const on=F.includes(b.dataset.k); b.classList.toggle('on',on); b.setAttribute('aria-pressed',on); });
  if(ui.svHi){ const r=tb.querySelector(`tr[data-id="${ui.svHi}"]`); ui.svHi=null; if(r){ r.hidden=false; r.scrollIntoView({block:'center'}); } } }
function svDrawer(id){ const isNew=id==='new'; const s=isNew?null:srv(id); if(!isNew&&!s) return '';
  const sec=isNew?(ui.svSec||'tr'):s.sec; const nL=s?S.listings.filter(l=>l.server===s.id).length:0;
  const head=`<div class="sdrawer-h">${isNew?'':`<span class="lgprev-h">${logo(s,40)}</span>`}<div><h2 id="sdT">${isNew?esc(secName(sec))+' serverı ekle':esc(s.name)}</h2><small>${isNew?'Yeni server yalnız bu bölümde listelenir':`${esc(secName(s.sec))} · ${nL} ilan${s.added?' · eklendi '+dstr(s.added):''}`}</small></div><button type="button" class="ibtn" data-act="sv-close" aria-label="Kapat">${ADM_ICO.x}</button></div>`;
  let form;
  if(isNew) form=`<form class="sdform" data-form="srvadd"><div class="sdrawer-b">
    <div class="sdsec"><h3>Genel</h3><div class="fld"><label for="sv_n">Ad</label><input class="inp" id="sv_n" required></div><div class="row2"><div class="fld"><label for="sv_l">Level aralığı</label><input class="inp" id="sv_l" placeholder="1-120"></div><div class="fld"><label for="sv_t">Tür</label><input class="inp" id="sv_t" placeholder="${sec==='tr'?'Resmi':'Emek, Farm…'}"></div></div><div class="fld"><label for="sv_u">Web sitesi</label><input class="inp" id="sv_u" placeholder="https://"></div></div>
    <div class="sdsec"><h3>Görünüm <small>Logo renklerden oluşur</small></h3><div class="row2"><div class="fld"><label for="sv_c1">Renk 1</label><input class="inp" id="sv_c1" type="color" value="#1d6fa5" data-lg="1"></div><div class="fld"><label for="sv_c2">Renk 2</label><input class="inp" id="sv_c2" type="color" value="#e0a020" data-lg="2"></div></div><div class="lgprev"><span class="slogo" style="--c1:#1d6fa5;--c2:#e0a020;--sz:48px">YS</span><span class="slogo" style="--c1:#1d6fa5;--c2:#e0a020;--sz:28px">YS</span><span>Server listesinde ve ilan kartlarında böyle görünür</span></div></div>
    ${sec==='pvp'?`<div class="sdsec"><h3>EP satışı</h3><div class="fld" style="max-width:260px"><label for="sv_ep">EP satışı</label><select class="inp" id="sv_ep" data-change="svep"><option value="0">Olmayacak</option><option value="1">Olacak (site satar)</option></select></div>
      <div id="svEpBox" class="stack svepbox" hidden><span class="muted" style="font-size:12px">İlk EP paketini ve kodlarını girin. Paket ve kodlar yalnızca bu serverın sayfasında satılır, Metin2 TR EP sayfasında görünmez. Sonradan <a href="#yonetim/ep/paketler">EP mağazası</a> bölümünden yeni paket ve kod ekleyebilirsiniz.</span><div class="row2"><div class="fld"><label for="sv_epa">EP miktarı</label><input class="inp mono" type="number" min="1" id="sv_epa" placeholder="10000"></div><div class="fld"><label for="sv_epp">Fiyat (TL)</label><input class="inp mono" type="number" min="0" step="0.01" id="sv_epp" placeholder="150"></div></div><div class="fld"><label for="sv_epc">EP kodları (her satıra bir kod)</label><textarea class="inp mono" id="sv_epc" style="min-height:70px" placeholder="KOD-XXXX-XXXX"></textarea></div></div></div>`:''}
    </div>${aSave('Server ekle')}</form>`;
  else { const i=s.id; form=`<form class="sdform" data-form="srvsave" data-id="${i}"><div class="sdrawer-b">
    <div class="sdsec"><h3>Genel</h3><div class="fld"><label for="sv_name_${i}">Server adı</label><input class="inp" id="sv_name_${i}" value="${esc(s.name)}"></div>
      <div class="row3"><div class="fld"><label for="sv_lv_${i}">Level aralığı</label><input class="inp" id="sv_lv_${i}" value="${esc(s.lv)}"></div><div class="fld"><label for="sv_type_${i}">Tür</label><input class="inp" id="sv_type_${i}" value="${esc(s.type)}"></div><div class="fld"><label for="sv_sec_${i}">Bölüm (taşı)</label><select class="inp" id="sv_sec_${i}"><option value="tr" ${s.sec==='tr'?'selected':''}>Metin2 TR</option><option value="pvp" ${s.sec==='pvp'?'selected':''}>Metin2 PVP</option></select></div></div>
      <div class="fld"><label for="sv_url_${i}">Web sitesi</label><input class="inp" id="sv_url_${i}" value="${esc(srvWeb(s.url)?s.url:'')}" placeholder="https://"></div>
      <div class="fld"><label for="sv_desc_${i}">Açıklama</label><input class="inp" id="sv_desc_${i}" value="${esc(s.desc||'')}"></div></div>
    <div class="sdsec"><h3>Görünüm <small>Logo renklerden oluşur</small></h3><div class="row2"><div class="fld"><label for="sv_c1_${i}">Renk 1</label><input class="inp" type="color" id="sv_c1_${i}" value="${s.c[0]}" data-lg="1"></div><div class="fld"><label for="sv_c2_${i}">Renk 2</label><input class="inp" type="color" id="sv_c2_${i}" value="${s.c[1]}" data-lg="2"></div></div><div class="lgprev">${logo(s,48)}${logo(s,28)}<span>Server listesinde ve ilan kartlarında böyle görünür</span></div></div>
    <div class="sdsec"><h3>SEO <small>Server sayfasının altındaki "hakkında" metni</small></h3><div class="fld"><label for="sv_seo_${i}">SEO açıklaması</label><textarea class="inp" id="sv_seo_${i}" maxlength="600" data-cnt="sv_seo_n" placeholder="${esc(srvAuto(s))}">${esc(s.seo||'')}</textarea><span class="cnt-r" id="sv_seo_n">${String(s.seo||'').length} / 600</span></div></div>
    ${s.sec==='pvp'?`<div class="sdsec"><h3>EP satışı</h3><div class="hstack svep"><div class="fld" style="width:auto"><label for="sv_ep_${i}">EP satışı</label><select class="inp" id="sv_ep_${i}" style="width:auto"><option value="0" ${s.ep?'':'selected'}>Olmayacak</option><option value="1" ${s.ep?'selected':''}>Olacak (site satar)</option></select></div>${s.ep?`<span class="chip ${epFor(s.id).some(p=>p.codes.length)?'ok':'warn'}">${epFor(s.id).length} paket · ${epFor(s.id).reduce((a,p)=>a+p.codes.length,0)} kod stokta</span><button type="button" class="btn btn-sm" data-act="sv-ep" data-id="${i}">EP paketleri ve kodlar →</button>`:''}</div></div>`:''}
    </div>${aSave('Kaydet',`<button type="button" class="btn btn-bad" data-act="srv-del" data-id="${i}">Sil</button>`)}</form>`; }
  return `<div class="sdrawer-bg" data-act="sv-close"></div><aside class="sdrawer ${ui.svAnim?'anim':''}" role="dialog" aria-modal="true" aria-labelledby="sdT">${head}${form}</aside>`; }
function svPageHtml(sec){ const L=S.servers.filter(s=>s.sec===sec);
  const act=new Set(S.listings.filter(l=>l.status==='aktif').map(l=>l.server)); const nAct=id=>S.listings.filter(l=>l.server===id&&l.status==='aktif').length;
  const adOn=new Set(S.ads.filter(a=>adLive(a)).map(a=>a.server));
  const D_=s=>({ilan:nAct(s.id),ep:sec==='pvp'&&s.ep?1:0,ad:adOn.has(s.id)?1:0,web:srvWeb(s.url)?1:0,seo:(s.seo||'').trim()?1:0});
  const cnt={ilan:L.filter(s=>act.has(s.id)).length,ep:L.filter(s=>s.ep).length,ad:L.filter(s=>adOn.has(s.id)).length,noweb:L.filter(s=>!D_(s).web).length,noseo:L.filter(s=>!D_(s).seo).length};
  const F=ui.svF||[]; const chip=(k,l)=>`<button type="button" class="afchip ${F.includes(k)?'on':''}" data-act="svf" data-k="${k}" aria-pressed="${F.includes(k)}">${l} <b>${cnt[k]}</b></button>`;
  const rows=L.map(s=>{ const d=D_(s); const ep=sec==='pvp'?(s.ep?(()=>{ const n=epFor(s.id).reduce((a,p)=>a+p.codes.length,0); return `<span class="chip ${n<3?'warn':'ok'}">Açık · ${n} kod</span>`; })():'<span class="muted">Kapalı</span>'):'';
    const web=d.web?`<a class="svweb" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener" data-act="sv-web" aria-label="${esc(s.name)} web sitesi" title="${esc(s.url)}">${ADM_ICO.ext}</a>`:'<span class="chip warn">Eksik</span>';
    return `<tr data-id="${s.id}" data-act="sv-edit" data-hay="${esc(s.name.toLocaleLowerCase('tr-TR'))}" data-name="${esc(s.name)}" data-ilan="${d.ilan}" data-ep="${d.ep}" data-ad="${d.ad}" data-web="${d.web}" data-seo="${d.seo}" data-added="${s.added||0}" tabindex="0">
      <td class="c-n"><span class="svn">${logo(s,28)}<span><b>${esc(s.name)}</b>${s.desc?`<small title="${esc(s.desc)}">${esc(s.desc)}</small>`:''}</span></span></td>
      <td>${esc(s.type||'')}</td><td class="mono">${esc(s.lv||'')}</td><td class="num">${d.ilan}</td>${sec==='pvp'?`<td>${ep}</td>`:''}<td>${d.ad?'<span class="chip info">Aktif</span>':'<span class="muted">Yok</span>'}</td><td>${web}</td>
      <td class="c-m"><span class="chip">${esc(s.type||'-')} · ${esc(s.lv||'-')}</span><span class="chip">${d.ilan} ilan</span>${sec==='pvp'&&s.ep?'<span class="chip ok">EP açık</span>':''}${d.ad?'<span class="chip info">Reklam</span>':''}${d.web?'':'<span class="chip warn">Web eksik</span>'}</td>
      <td class="c-b"><button type="button" class="btn btn-sm" data-act="sv-edit" data-id="${s.id}">Düzenle</button></td></tr>`; }).join('');
  return `<div class="panel svpanel"><div class="svtools"><div class="svtools-r1"><div class="afq">${ADM_ICO.q}<input class="inp" id="sv_q" type="search" placeholder="Server adı ara" value="${esc(ui.svQ||'')}" autocomplete="off" aria-label="Server adı ara"></div>
      <select class="inp" id="sv_sort" data-change="svsort" aria-label="Sıralama">${[['ad','Ada göre (A-Z)'],['ilan','İlan sayısı'],['yeni','Eklenme tarihi']].map(([k,v])=>`<option value="${k}" ${(ui.svSort||'ad')===k?'selected':''}>${v}</option>`).join('')}</select>
      <button type="button" class="btn btn-primary btn-sm" data-act="sv-add">+ Server ekle</button></div>
    <div class="svtools-r2"><div class="afchips">${chip('ilan','İlanı olan')}${sec==='pvp'?chip('ep','EP satışı açık'):''}${chip('ad','Reklamı aktif')}${chip('noweb','Web sitesi eksik')}${chip('noseo','SEO metni eksik')}</div><span class="svcnt" id="sv_cnt" aria-live="polite">${L.length} server</span></div></div>
    <div class="tbl-w" id="svTblW"><table class="tbl svtbl"><thead><tr><th>Server</th><th>Tür</th><th>Level</th><th class="num">İlan</th>${sec==='pvp'?'<th>EP satışı</th>':''}<th>Reklam</th><th>Web</th><th class="c-m"></th><th></th></tr></thead><tbody id="svRows">${rows}</tbody></table></div>
    <div id="sv_empty" class="empty" hidden><b>Bu aramayla eşleşen server yok.</b>Filtreleri temizleyin veya yeni server ekleyin.<div style="margin-top:12px"><button type="button" class="btn btn-sm" data-act="sv-clear">Filtreleri temizle</button></div></div>
    <div class="svmore" id="sv_more" hidden><button type="button" class="btn btn-sm" data-act="sv-more">Daha fazla göster</button><span class="muted" id="sv_more_t" style="font-size:12.5px"></span></div></div>`; }
