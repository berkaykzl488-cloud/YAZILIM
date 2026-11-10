/* ================== yönlendirme ================== */
/* ================== SEO, rehber ve paylaşım ================== */
const slugify = s => String(s||'').toLocaleLowerCase('tr-TR').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/İ/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/â/g,'a').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'sayfa';
const siteBase = () => (S.set.siteUrl||'https://www.yangpazar.com').replace(/\/+$/,'');
const isLive = () => /^https?:$/.test(location.protocol) && !/claude|anthropic|localhost|127\.0\.0\.1/.test(location.hostname);
const seoClean = () => (!!window.__SEO_CLEAN||!!(S.set.seo&&S.set.seo.clean)) && isLive();
const PRIV_R = r => /^(hesabim|yonetim|mesajlar|bildirimler|siparis-|ilan-ver$|ara$|davet-|widget-)/.test(r);
function routeToPath(r){ r=r||'home'; if(r==='home') return '/'; let m;
  if((m=r.match(/^server-([^-]+)(?:-(.+))?$/))){ const s=srv(m[1]); if(s) return '/server/'+slugify(s.name)+(m[2]?'/'+m[2]:''); }
  if(r.startsWith('ilan-')&&r!=='ilan-ver'){ const l=lst(r.slice(5)); if(l) return '/ilan/'+slugify(l.title)+'-'+l.id; }
  if(r.startsWith('rehber-')) return '/rehber/'+r.slice(7);
  if(r.startsWith('sayfa-')) return '/sayfa/'+r.slice(6);
  return '/'+r; }
function pathToRoute(p){ try{ p=decodeURIComponent(p||''); }catch(e){} p=p.replace(/^\/+|\/+$/g,'').replace(/\/index\.html$/,''); if(!p||p==='index.html') return 'home'; const a=p.split('/');
  if(a[0]==='server'&&a[1]){ const s=S.servers.find(x=>slugify(x.name)===a[1]); return s?'server-'+s.id+(a[2]?'-'+a[2]:''):'yok'; }
  if(a[0]==='ilan'&&a[1]) return 'ilan-'+a[1].slice(a[1].lastIndexOf('-')+1);
  if(a[0]==='rehber'&&a[1]) return 'rehber-'+a[1];
  if(a[0]==='sayfa'&&a[1]) return 'sayfa-'+a[1];
  if(a[0]==='yonetim') return a.join('/')+(location.search||'');
  return a.join('-'); }
const shareUrl = r => siteBase()+(S.set.seo&&S.set.seo.clean?routeToPath(r):'/#'+r);
function shareBar(r,title){ const u=shareUrl(r), t=title||S.set.siteName, eu=encodeURIComponent(u), et=encodeURIComponent(t);
  return `<div class="shbar" aria-label="Paylaş"><span class="muted">Paylaş:</span><button type="button" class="btn btn-sm" data-act="copy" data-v="${esc(u)}">Bağlantıyı kopyala</button><a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${et}%20${eu}">WhatsApp</a><a class="btn btn-sm" target="_blank" rel="noopener" href="https://t.me/share/url?url=${eu}&text=${et}">Telegram</a><a class="btn btn-sm" target="_blank" rel="noopener" href="https://x.com/intent/post?url=${eu}&text=${et}">X</a><a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${eu}">Facebook</a></div>`; }
function srvAuto(s){ const n=active().filter(l=>l.server===s.id).length;
  return `${s.name}, ${secName(s.sec)} bölümündeki serverlardan biridir. ${S.set.siteName} üzerinde ${s.name} item, yang${srvEp(s)?', EP':''} ve karakter ilanlarını inceleyebilir, kendi ilanınızı verebilirsiniz${n?`; şu an ${n} aktif ilan var`:''}. Ödemeniz, ürünü teslim aldığınızı onaylayana kadar güvenli havuzda bekler.`; }
function srvSeoBlock(sid){ const s=srv(sid); if(!s) return ''; const others=S.servers.filter(x=>x.sec===s.sec&&x.id!==s.id).map(x=>[x,active().filter(l=>l.server===x.id).length]).sort((a,b)=>(!!b[0].partner-!!a[0].partner)||b[1]-a[1]).slice(0,12);
  const F=srvFaq(s);
  return `<div class="wrap"><section class="panel panel-b seoabout"><h2>${esc(s.name)} hakkında</h2><p>${esc(s.seo||srvAuto(s))}</p>${shareBar('server-'+s.id,`${s.name} item, yang ve EP ilanları`)}
    <div class="srvfaq"><h2>${esc(s.name)} sıkça sorulan sorular</h2>${F.map(([q,a])=>`<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
    ${others.length?`<div class="seolinks"><b>Diğer ${s.sec==='tr'?'Metin2 TR':'PVP'} serverları</b><div>${others.map(([x])=>`<a href="#server-${x.id}">${esc(x.name)}${x.partner?' ✓':''}</a>`).join('')}</div></div>`:''}
    <div class="seobadge"><span class="muted">Bu serverın sahibi misiniz? Sitenize rozet ekleyin, oyuncularınız güvenle alışveriş yapsın.</span><span class="hstack"><button type="button" class="btn btn-sm" data-act="seo-badge" data-id="${s.id}">Rozet kodunu al</button><button type="button" class="btn btn-sm" data-act="widget-code" data-id="${s.id}">Fiyat widget'ı</button><a class="btn btn-sm" href="#ortaklik">Partner ol</a></span></div></section></div>`; }
function badgeCode(s){ const r=s?'server-'+s.id:'home', u=shareUrl(r), base=siteBase(), nm=S.set.siteName; const t=s?`${s.name} item, yang ve EP alım satım | ${nm}`:`${nm} · Metin2 item ve yang pazarı`;
  return {img:`<a href="${u}" title="${t}" target="_blank"><img src="${base}/rozet.svg" alt="${t}" width="200" height="60" loading="lazy"></a>`, txt:`<a href="${u}" title="${t}">${s?esc(s.name)+' item ve yang pazarı':esc(nm)+' · Metin2 item pazarı'}</a>`}; }
function rozetSvg(){ const nm=esc(S.set.siteName); return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60" role="img" aria-label="${nm} güvenli item ve yang pazarı"><rect width="200" height="60" rx="10" fill="#17120c"/><rect x="1" y="1" width="198" height="58" rx="9" fill="none" stroke="#d99a2b" stroke-opacity=".6"/><g transform="translate(14 14)" fill="none" stroke="#f2b544" stroke-width="2.4" stroke-linejoin="round"><path d="M16 1 30 7v9c0 9-6 15-14 18C8 31 2 25 2 16V7z"/><path d="m10 17 4 4 8-9"/></g><text x="56" y="28" font-family="Segoe UI,Arial,sans-serif" font-size="17" font-weight="700" fill="#fff">${nm}</text><text x="56" y="45" font-family="Segoe UI,Arial,sans-serif" font-size="11" fill="#e8c27a">Güvenli item &amp; yang pazarı</text></svg>`; }
/* --- rehber (blog) --- */
function mdLite(src){ let html='', list=false, para=[];
  const inl=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\[([^\]]+)\]\((#[A-Za-z0-9-]+|https?:\/\/[^\s)]+)\)/g,(m,a,h)=>h[0]==='#'?`<a href="${h}">${a}</a>`:`<a href="${h}" target="_blank" rel="noopener nofollow">${a}</a>`);
  const fp=()=>{ if(para.length){ html+='<p>'+inl(para.join(' '))+'</p>'; para=[]; } }; const fl=()=>{ if(list){ html+='</ul>'; list=false; } };
  String(src||'').split(/\n/).forEach(l=>{ const t=l.trim(); if(!t){ fp(); fl(); return; } if(t.startsWith('## ')){ fp(); fl(); html+='<h2>'+inl(t.slice(3))+'</h2>'; return; } if(t.startsWith('- ')){ fp(); if(!list){ html+='<ul>'; list=true; } html+='<li>'+inl(t.slice(2))+'</li>'; return; } fl(); para.push(t); }); fp(); fl(); return html; }
const posts = () => (S.posts||[]).filter(p=>p.on).sort((a,b)=>b.t-a.t);
const readMin = p => Math.max(1,Math.round(String(p.body||'').split(/\s+/).length/180));
function vRehber(){ const P=posts();
  return `<div class="wrap"><div class="page-h"><div><h1>Metin2 Rehberi</h1><p>Güvenli alışveriş, yang, EP ve karakter alım satımı üzerine ipuçları.</p></div></div>
  ${P.length?`<div class="rgrid">${P.map(p=>`<a class="rpost panel" href="#rehber-${p.slug}"><span class="eyebrow">${dstr(p.t)} · ${readMin(p)} dk okuma</span><h2>${esc(p.title)}</h2><p>${esc(p.ozet)}</p><span class="rmore">Devamını oku →</span></a>`).join('')}</div>`:emptyBox('Henüz rehber yazısı yok','')}</div>`; }
function vPost(slug){ const p=(S.posts||[]).find(x=>x.slug===slug&&(x.on||isPanel())); if(!p) return vNotFound(); const O=posts().filter(x=>x.id!==p.id).slice(0,3);
  return `<div class="wrap" style="max-width:780px"><nav class="crumbs" aria-label="Konum"><a href="#home">Ana sayfa</a> › <a href="#rehber">Rehber</a> › <span>${esc(p.title)}</span></nav>
  <article class="post"><h1>${esc(p.title)}</h1><div class="muted" style="font-size:13px">${dstr(p.t)}${p.up&&p.up-p.t>D?' · güncellendi '+dstr(p.up):''} · ${readMin(p)} dk okuma${!p.on?' · <b>Taslak (sadece yönetim görür)</b>':''}</div>
  <p class="lead">${esc(p.ozet)}</p><div class="prose">${mdLite(p.body)}</div></article>
  <div class="panel panel-b" style="margin-top:18px">${shareBar('rehber-'+p.slug,p.title)}</div>
  ${O.length?`<h2 style="margin:26px 0 10px;font-size:18px">Diğer rehberler</h2><div class="rgrid">${O.map(x=>`<a class="rpost panel" href="#rehber-${x.slug}"><h3>${esc(x.title)}</h3><p>${esc(x.ozet)}</p></a>`).join('')}</div>`:''}</div>`; }
/* --- meta etiketleri, JSON-LD --- */
function setMeta(attr,key,val){ let m=document.head.querySelector(`meta[${attr}="${key}"]`); if(!val){ if(m) m.remove(); return; } if(!m){ m=document.createElement('meta'); m.setAttribute(attr,key); document.head.appendChild(m); } if(m.getAttribute('content')!==val) m.setAttribute('content',val); }
function setLinkRel(rel,href){ let l=document.head.querySelector(`link[rel="${rel}"]`); if(!href){ if(l) l.remove(); return; } if(!l){ l=document.createElement('link'); l.rel=rel; document.head.appendChild(l); } l.href=href; }
const cut = (t,n) => { t=String(t||'').replace(/\s+/g,' ').trim(); return t.length>n?t.slice(0,n-1).replace(/\s+\S*$/,'')+'…':t; };
function seoData(r){ const SE=S.set.seo, nm=S.set.siteName, base=siteBase(); let t='', d='', type='website', canon=r, noidx=PRIV_R(r)||!!SE.noindex, img=SE.ogImg||''; const ld=[], cr=[];
  const P={'metin2-tr':['Metin2 TR Won, Yang ve Item İlanları','Metin2 TR resmi serverlarında won, yang, item ve karakter ilanları. Ödemeniz teslim onaylanana kadar güvenli havuzda bekler.'],
    'metin2-pvp':['Metin2 PVP Serverlar · Item, Yang ve EP İlanları','Tüm Metin2 PVP serverları için item, yang, EP ve karakter ilanları tek yerde. Serverınızı seçin, güvenle alın veya satın.'],
    'metin2-ep':['Metin2 EP Satın Al · Anında Kod Teslimi','Metin2 EP (Ejderha Parası) kodları; ödeme sonrası kod anında ekranda ve hesabınızda.'],
    borsa:['Yang Borsası · Güncel Yang Alış ve Satış','Metin2 yang ve won için güncel alış satış fiyatları. Siteye yang satın veya siteden yang satın alın.'],
    cekilis:['Çekiliş ve Şans Çarkı','Haftalık çekiliş ve günlük şans çarkıyla bakiye ve EP kazanın.'],
    'reklam-ver':['Reklam Ver · Serverınızı Tanıtın','Metin2 PVP serverınızı vitrinde, slaytta ve açılış penceresinde tanıtın.'],
    guvenli:['Güvenli Alışveriş ve Sıkça Sorulan Sorular',`${nm} aracılı alışveriş nasıl çalışır: ödeme havuzu, teslim onayı, itiraz ve iade.`],
    'yang-fiyatlari':['Metin2 Yang ve Won Fiyatları (Güncel)','Tüm Metin2 TR ve PVP serverlarında güncel yang ilanı sayısı, başlangıç fiyatları ve Yang Borsası fiyatları tek tabloda.'],
    ortaklik:['Ortaklık ve Server Partnerliği','Server sahipleri, yayıncılar ve site sahipleri için ücretsiz ortaklık: rozet, fiyat widget\'ı ve davet linki.'],
    rehber:['Metin2 Rehberi','Metin2 yang, EP, item ve karakter alım satımında güvenli alışveriş ipuçları ve rehberler.']};
  if(r==='serverler'||r==='kategori-metin2') canon='metin2-pvp';
  if(r==='home'){ t=SE.homeTitle||`${nm} · Metin2 Item, Yang, Won, EP ve Karakter Pazarı`; d=SE.desc;
    ld.push({'@type':'WebSite','@id':base+'/#website',url:base+'/',name:nm,inLanguage:'tr-TR'},{'@type':'Organization','@id':base+'/#org',name:nm,url:base+'/',logo:base+'/rozet.svg'}); }
  else if(P[canon]){ [t,d]=P[canon]; cr.push([t,canon]); }
  let m;
  if((m=r.match(/^server-([^-]+)(?:-(.+))?$/))){ const s=srv(m[1]); if(s){ const c=m[2]&&m[2]!=='hepsi'?m[2]:''; const cl=c==='ep'?'EP':c?catLabel(c,s.sec):'';
      t=c==='ep'?`${s.name} EP Satın Al · Anında Kod`:c?`${s.name} ${cl} İlanları`:`${s.name} Item, Yang${srvEp(s)?', EP':''} ve Karakter İlanları`; d=cut(c==='ep'?`${s.name} EP kodları ${S.set.siteName} tarafından satılır; ödeme sonrası kod anında teslim edilir. `+(s.seo||srvAuto(s)):c?`${s.name} ${cl.toLowerCase()} ilanları. `+(s.seo||srvAuto(s)):(s.seo||srvAuto(s)),158);
      cr.push([s.sec==='tr'?'Metin2 TR':'Metin2 PVP',s.sec==='tr'?'metin2-tr':'metin2-pvp'],[s.name,'server-'+s.id]); if(c) cr.push([cl,r]); } else noidx=true; }
  if(r.startsWith('ilan-')&&r!=='ilan-ver'){ const l=lst(r.slice(5)); if(l){ const s=srv(l.server); t=`${l.title}${s&&!l.title.toLocaleLowerCase('tr-TR').includes(s.name.toLocaleLowerCase('tr-TR'))?' · '+s.name:''}`; d=cut(`${TL(l.price)} · ${s?s.name+' ':''}${catLabel(l.cat,s?s.sec:'pvp')}. ${l.desc||''}`,158); type='product';
      if(l.status!=='aktif'&&l.status!=='satildi') noidx=true; if(s) cr.push([s.sec==='tr'?'Metin2 TR':'Metin2 PVP',s.sec==='tr'?'metin2-tr':'metin2-pvp'],[s.name,'server-'+s.id]); cr.push([cut(l.title,40),r]);
      const im=(l.img&&/^https?:/.test(l.img))?l.img:img; if(im) img=im;
      ld.push({'@type':'Product',name:l.title,description:cut(l.desc||l.title,300),category:'Metin2 '+(s?s.name+' ':'')+l.cat,...(im?{image:im}:{}),offers:{'@type':'Offer',price:String(l.price),priceCurrency:'TRY',availability:'https://schema.org/'+(l.status==='aktif'&&l.stock>0?'InStock':'SoldOut'),url:base+routeToPath(r),seller:{'@type':'Person',name:(user(l.seller)||{}).name||'Satıcı'}}}); } else noidx=true; }
  if(r.startsWith('rehber-')){ const p=(S.posts||[]).find(x=>x.slug===r.slice(7)); if(p){ t=p.title; d=cut(p.ozet,158); type='article'; cr.push(['Rehber','rehber'],[cut(p.title,40),r]); if(!p.on) noidx=true;
      ld.push({'@type':'Article',headline:p.title,description:cut(p.ozet,300),datePublished:new Date(p.t).toISOString(),dateModified:new Date(p.up||p.t).toISOString(),inLanguage:'tr-TR',author:{'@type':'Organization',name:nm},publisher:{'@id':base+'/#org'},mainEntityOfPage:base+routeToPath(r)}); } else noidx=true; }
  if(r.startsWith('sayfa-')){ const pg=PAGES[r.slice(6)]; if(pg){ t=pg[0]; d=cut(pg[1],158); cr.push([pg[0],r]); } else noidx=true; }
  if(r==='yang-fiyatlari'){ const R=priceRows(); ld.push({'@type':'Dataset',name:'Metin2 yang ve won fiyatları',description:'Metin2 serverlarında aktif yang ilanı sayısı ve başlangıç fiyatları',url:base+routeToPath(r),dateModified:new Date().toISOString(),creator:{'@id':base+'/#org'},inLanguage:'tr-TR',variableMeasured:['Yang ilanı sayısı','Başlangıç fiyatı (TRY)']},{'@type':'ItemList',itemListElement:R.slice(0,30).map((x,i)=>({'@type':'ListItem',position:i+1,name:x.s.name+' yang',url:base+routeToPath('server-'+x.s.id+'-yang')}))}); }
  if(r==='guvenli'||/^server-[^-]+(-yang)?$/.test(r)){ const q=[...document.querySelectorAll('#app details.faq')].map(x=>({'@type':'Question',name:(x.querySelector('summary')||{}).textContent||'',acceptedAnswer:{'@type':'Answer',text:(x.querySelector('p')||{}).textContent||''}})).filter(x=>x.name); if(q.length) ld.push({'@type':'FAQPage',mainEntity:q}); }
  if(!t){ const h=document.querySelector('#app h1'); t=isAdmRoute(r)?'Yönetim paneli':h?h.textContent.trim():'Sayfa bulunamadı'; } if(!d) d=SE.desc;
  if(cr.length) ld.push({'@type':'BreadcrumbList',itemListElement:[['Ana sayfa','home'],...cr].map(([n,rr],i)=>({'@type':'ListItem',position:i+1,name:n,item:base+routeToPath(rr)}))});
  if(document.querySelector('#app .notfound, #app [data-404]')) noidx=true;
  return {title:r==='home'?t:cut(t,60)+(SE.sep||' | ')+nm, desc:cut(d,160), url:base+routeToPath(canon), type, img, noidx, ld}; }
let seoLastPath='';
function seoApply(r){ if(!S.set.seo) return; const x=seoData(r), SE=S.set.seo; document.documentElement.lang='tr';
  if(document.title!==x.title) document.title=x.title; setMeta('name','description',x.desc); setMeta('name','robots',x.noidx?'noindex, follow':'index, follow, max-image-preview:large');
  setLinkRel('canonical',x.noidx?'':x.url);
  setMeta('property','og:site_name',S.set.siteName); setMeta('property','og:locale','tr_TR'); setMeta('property','og:type',x.type==='product'?'product':x.type==='article'?'article':'website'); setMeta('property','og:title',x.title); setMeta('property','og:description',x.desc); setMeta('property','og:url',x.url); setMeta('property','og:image',x.img);
  setMeta('name','twitter:card',x.img?'summary_large_image':'summary'); setMeta('name','twitter:title',x.title); setMeta('name','twitter:description',x.desc);
  setMeta('name','google-site-verification',SE.gsc); setMeta('name','msvalidate.01',SE.bing); setMeta('name','yandex-verification',SE.yandex);
  let s=document.getElementById('ldjson'); if(x.ld.length){ if(!s){ s=document.createElement('script'); s.type='application/ld+json'; s.id='ldjson'; document.head.appendChild(s); } const j=JSON.stringify({'@context':'https://schema.org','@graph':x.ld}).replace(/</g,'\\u003c'); if(s.textContent!==j) s.textContent=j; } else if(s) s.remove();
  if(ensurePixel()&&!PRIV_R(r)&&window.__fbPath!==r){ window.__fbPath=r; fbq('track','PageView'); }
  if(ensureTags()&&window.gtag){ const pth=routeToPath(r); if(pth!==seoLastPath&&!PRIV_R(r)&&!r.startsWith('widget-')){ seoLastPath=pth; gtag('event','page_view',{page_title:x.title,page_location:siteBase()+pth}); } }
  if(seoClean()) ['#app','#hdr','#cats','#ftr'].forEach(sel=>{ const el=$(sel); if(el) el.querySelectorAll('a[href^="#"]').forEach(a=>{ const h=a.getAttribute('href').slice(1); if(!h) return; a.dataset.h=h; a.setAttribute('href',routeToPath(h)); }); }); }
document.addEventListener('click',e=>{ if(!seoClean()||e.defaultPrevented||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey) return; const a=e.target.closest('a[data-h]'); if(!a||a.target==='_blank') return; e.preventDefault(); const h=a.dataset.h; if(route()===h){ render(); window.scrollTo(0,0); } else location.hash=h; });
window.addEventListener('popstate',()=>{ if(typeof admDirtyNow==='function'&&admDirtyNow()) return; if(seoClean()&&location.hash.length<=1){ PV.seen.clear(); render(); window.scrollTo(0,0); } });
/* --- sitemap / robots / htaccess --- */
function sitemapUrls(){ const day=new Date().toISOString().slice(0,10), iso=t=>new Date(t).toISOString().slice(0,10); const U=[];
  const add=(r,lm,pr,cf)=>U.push({loc:siteBase()+routeToPath(r),lm:lm||day,pr,cf});
  add('home',day,'1.0','hourly'); ['metin2-tr','metin2-pvp','metin2-ep','borsa','cekilis','reklam-ver','guvenli','rehber'].forEach(r=>add(r,day,'0.8','daily'));
  Object.keys(PAGES).forEach(k=>add('sayfa-'+k,day,'0.3','yearly'));
  S.servers.forEach(s=>{ const L=active().filter(l=>l.server===s.id); const lm=L.length?iso(Math.max(...L.map(l=>l.bump||l.t))):day; add('server-'+s.id,lm,'0.9','hourly'); M2CAT.filter(c=>c!=='ep'&&L.some(l=>l.cat===c)).forEach(c=>add('server-'+s.id+'-'+c,lm,'0.7','hourly')); if(srvEp(s)) add('server-'+s.id+'-ep',day,'0.7','daily'); });
  active().forEach(l=>add('ilan-'+l.id,iso(l.bump||l.t),'0.6','daily'));
  posts().forEach(p=>add('rehber-'+p.slug,iso(p.up||p.t),'0.7','monthly'));
  return U; }
const xmlEsc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sitemapXml = () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls().map(u=>`  <url><loc>${xmlEsc(u.loc)}</loc><lastmod>${u.lm}</lastmod><changefreq>${u.cf}</changefreq><priority>${u.pr}</priority></url>`).join('\n')}\n</urlset>\n`;
const robotsTxt = () => `User-agent: *\n${S.set.seo.noindex?'Disallow: /\n':`Allow: /\nDisallow: /hesabim\nDisallow: /yonetim\nDisallow: /mesajlar\nDisallow: /bildirimler\nDisallow: /siparis-\nDisallow: /ilan-ver\nDisallow: /ara$\nDisallow: /qnbpay/\nDisallow: /kimlik/\nDisallow: /widget-\n`}\nSitemap: ${siteBase()}/sitemap.xml\n`;
const HTACCESS = `# ${'yangpazar.com'} · temiz adresler, HTTPS ve performans
Options -Indexes
RewriteEngine On

# HTTPS'e yönlendir (sunucunuz bir proxy arkasındaysa bu iki satırı kapatın)
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Statik SEO sayfaları: /server/ejderha2 -> server/ejderha2.html
RewriteCond %{REQUEST_URI} !\.html$
RewriteCond %{REQUEST_FILENAME}.html -f
RewriteRule ^(.+?)/?$ $1.html [L]

# Var olan dosya ve klasörler olduğu gibi açılır (sitemap.xml, robots.txt, qnbpay/, kimlik/ ...)
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Diğer tüm adresler (/server/..., /ilan/..., /rehber/...) siteyi açar
RewriteRule ^ index.html [L]

# SSL / güvenlik başlıkları (sertifika aktif olduktan sonra)
<IfModule mod_headers.c>
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains" env=HTTPS
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header always set Content-Security-Policy "upgrade-insecure-requests"
  <If "%{REQUEST_URI} !~ m#^/widget-#">
    Header always set X-Frame-Options "SAMEORIGIN"
  </If>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml application/xml text/xml text/plain
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType image/svg+xml "access plus 30 days"
  ExpiresByType text/css "access plus 7 days"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType image/jpeg "access plus 30 days"
</IfModule>
`;
const SEO_README = () => `${S.set.siteName.toUpperCase()} · SEO DOSYALARI
==========================

Bu klasördeki dosyaları sitenin kök dizinine (index.html ile aynı yere) yükleyin:
- sitemap.xml  : Arama motorlarına tüm sayfaları bildirir (${sitemapUrls().length} adres). Google Search Console > Site haritaları bölümüne "sitemap.xml" yazıp gönderin.
- robots.txt   : Üye paneli, yönetim, mesajlar ve ödeme dosyalarını aramaya kapatır.
- .htaccess    : /server/..., /ilan/..., /rehber/... gibi temiz adreslerin açılmasını sağlar, HTTPS'e yönlendirir, sıkıştırma ve önbellek açar (Apache / LiteSpeed). Nginx kullanıyorsanız "try_files $uri $uri/ /index.html;" ekleyin.
- rozet.svg    : Server sahiplerinin sitelerine koyacağı rozet görseli (geri bağlantı / backlink için).

Sıra:
1) Dosyaları yükleyin.
2) Yönetim > SEO'da "Temiz adresler" seçeneğini açın.
3) Search Console'da siteyi doğrulayın (doğrulama kodunu Yönetim > SEO'ya girin), sitemap.xml'i gönderin.
4) İlan, server ve rehber eklendikçe sitemap.xml'i Yönetim > SEO'dan yeniden indirip güncelleyin.
`;
const seoKit = () => zipFiles([['sitemap.xml',sitemapXml()],['robots.txt',robotsTxt()],['.htaccess',HTACCESS],['rozet.svg',rozetSvg()],['SEO-KURULUM.txt',SEO_README()]]);
function seoChecks(){ const SE=S.set.seo, P=posts(), noSeo=S.servers.filter(s=>!s.seo).length, shortL=active().filter(l=>String(l.desc||'').length<60).length, dl=String(SE.desc||'').length;
  return [[!!S.set.siteUrl,'Site adresi girildi',S.set.siteUrl?esc(S.set.siteUrl):'<a href="#yonetim/ayar/genel">Site ayarları › Site adresi</a> boş; canonical ve sitemap adresleri buna göre oluşur.'],
    [dl>=70&&dl<=160,'Ana sayfa açıklaması 70-160 karakter',dl+' karakter'],
    [!!SE.ogImg,'Paylaşım görseli (Open Graph)',SE.ogImg?'Var':'WhatsApp, X ve Facebook paylaşımlarında görünecek 1200×630 görsel adresi girin'],
    [!!SE.gsc,'Google Search Console doğrulaması',SE.gsc?'Kod girildi':'Search Console\'dan HTML etiketi kodunu alın'],
    [!!SE.clean,'Temiz adresler (/server/ejderha2)',SE.clean?'Açık':'Kapalıyken arama motorları sayfaları ayrı ayrı göremez'],
    [!!SE.ga,'Google Analytics',SE.ga?esc(SE.ga):'İsteğe bağlı: G-XXXXXXX ölçüm kimliği'],
    [noSeo===0,'Server SEO açıklamaları',noSeo?`${noSeo} serverda özel açıklama yok (otomatik metin kullanılıyor)`:'Hepsi dolu'],
    [P.length>=5,'Rehber yazıları',`${P.length} yayında yazı · düzenli içerik sıralamayı ve geri bağlantıyı artırır`],
    [shortL<active().length*0.3,'İlan açıklamaları',`${shortL} ilanın açıklaması 60 karakterden kısa`],
    [/^https:\/\//.test(S.set.siteUrl||''),'SSL (https) adresi',/^https:\/\//.test(S.set.siteUrl||'')?'Site adresi https ile başlıyor':'<a href="#yonetim/ayar/genel">Site ayarları › Site adresi</a> https:// ile başlamalı; hostingde SSL sertifikasını açın'],
    [!!(SE.ads||SE.ga),'Google Ads / Analytics bağlantısı',SE.ads||SE.ga?'Bağlı':'Dönüşüm ölçümü için Google Ads etiket kimliğini <a href="#yonetim/seo/reklam">Reklam & kampanyalar</a> sekmesinde girin'],
    [(S.backlinks||[]).filter(b=>b.st==='aktif').length>=10,'Backlink takibi',`${(S.backlinks||[]).filter(b=>b.st==='aktif').length} aktif bağlantı kayıtlı`],
    [!SE.noindex,'Arama motorlarına açık',SE.noindex?'Site şu an aramaya KAPALI':'Açık']]; }
function seoAdmin(part){ const SE=S.set.seo, C=seoChecks(), ok=C.filter(c=>c[0]).length, hd=seoData('home');
  if(part==='reklam') return mktAdmin()+adsPanel()+adsGuides()+adPlaceGuides();
  const BL=`<div class="panel"><div class="panel-h"><h3>Geri bağlantı (backlink) araçları</h3></div><div class="panel-b stack" style="font-size:13px">
    <div><b>Server rozetleri:</b> Her server sayfasının altında "Rozet kodunu al" butonu var. Server sahipleri rozeti sitelerine eklediğinde, server sayfanıza kalıcı bağlantı verirler. Reklam veren serverlardan rozet eklemelerini isteyebilirsiniz.</div>
    <div><b>Paylaşım:</b> İlan, server ve rehber sayfalarında WhatsApp, Telegram, X ve Facebook paylaşım butonları var.</div>
    <div><b>Rehber:</b> Forumlarda ve Discord sunucularında paylaşılabilecek yazılar en kalıcı bağlantıları getirir. <a href="#yonetim/seo/rehber">Rehber yazıları</a> sekmesinden yazı ekleyin.</div></div></div>`;
  if(part==='bl') return BL;
  return `<div class="kpis"><div class="kpi hl"><small>SEO kontrol puanı</small><b>${ok}/${C.length}</b></div><div class="kpi"><small>Site haritasında adres</small><b>${sitemapUrls().length}</b></div><div class="kpi"><small>Rehber yazısı</small><b>${posts().length}</b></div><div class="kpi"><small>Aktif ilan sayfası</small><b>${active().length}</b></div></div>
  <div class="panel"><div class="panel-h"><h3>SEO kontrol listesi</h3></div><div class="panel-b seochk">${C.map(([g,t,x])=>`<div class="${g?'ok':'no'}"><i>${g?'✓':'!'}</i><span><b>${t}</b><small>${x}</small></span></div>`).join('')}</div></div>
  <form class="panel" data-form="seoset"><div class="panel-h"><h3>Genel SEO ayarları</h3></div><div class="panel-b stack">
    <div class="fld"><label for="se_ht">Ana sayfa başlığı (title)</label><input class="inp" id="se_ht" maxlength="70" value="${esc(SE.homeTitle||'')}" placeholder="${esc(S.set.siteName)} · Metin2 Item, Yang, Won, EP ve Karakter Pazarı" data-change="seoprev"></div>
    <div class="fld"><label for="se_d">Ana sayfa açıklaması (meta description)</label><textarea class="inp" id="se_d" maxlength="170" style="min-height:64px" data-change="seoprev">${esc(SE.desc||'')}</textarea><span class="muted" style="font-size:12px" id="se_dc">${String(SE.desc||'').length} karakter · ideal 120-160</span></div>
    <div class="serp" id="serp"><span class="serp-u">${esc(siteBase().replace(/^https?:\/\//,''))}</span><b class="serp-t">${esc(hd.title)}</b><span class="serp-d">${esc(hd.desc)}</span></div>
    <div class="row3"><div class="fld"><label for="se_sep">Başlık ayıracı</label><select class="inp" id="se_sep">${[' | ',' · ',' - ',' – '].map(x=>`<option value="${x}" ${SE.sep===x?'selected':''}>Sayfa${x}${esc(S.set.siteName)}</option>`).join('')}</select></div><div class="fld"><label for="se_og">Paylaşım görseli adresi (1200×630)</label><input class="inp mono" id="se_og" value="${esc(SE.ogImg||'')}" placeholder="https://.../paylasim.jpg"></div><div class="fld"><label for="se_ga">Google Analytics ölçüm kimliği</label><input class="inp mono" id="se_ga" value="${esc(SE.ga||'')}" placeholder="G-XXXXXXXXXX" readonly aria-describedby="se_ga_n"><span class="muted" id="se_ga_n" style="font-size:11.5px"><a href="#yonetim/seo/reklam">Reklam & kampanyalar</a> sekmesinden düzenlenir</span></div></div>
    <div class="row3"><div class="fld"><label for="se_g">Google Search Console kodu</label><input class="inp mono" id="se_g" value="${esc(SE.gsc||'')}" placeholder="content=&quot;...&quot; içindeki kod"></div><div class="fld"><label for="se_b">Bing Webmaster kodu</label><input class="inp mono" id="se_b" value="${esc(SE.bing||'')}"></div><div class="fld"><label for="se_y">Yandex Webmaster kodu</label><input class="inp mono" id="se_y" value="${esc(SE.yandex||'')}"></div></div>
    <label class="chk" for="se_cl"><input type="checkbox" id="se_cl" ${SE.clean?'checked':''}> Temiz adresler kullan (<span class="mono">/server/ejderha2/item</span>, <span class="mono">/ilan/...</span>, <span class="mono">/rehber/...</span>)</label>
    <span class="muted" style="font-size:12px;margin-top:-6px">Açmadan önce aşağıdaki .htaccess dosyasını sunucunuza yükleyin. Bu önizlemede adresler # ile çalışmaya devam eder; ayar yalnızca kendi alan adınızda devreye girer.</span>
    <label class="chk" for="se_ni"><input type="checkbox" id="se_ni" ${SE.noindex?'checked':''}> Siteyi arama motorlarına kapat (yapım aşaması / test sitesi)</label>
  </div>${aSave('SEO ayarlarını kaydet')}</form>
  <div class="panel"><div class="panel-h"><h3>SEO dosyaları</h3></div><div class="panel-b stack">
    <span class="muted" style="font-size:12.5px">sitemap.xml (${sitemapUrls().length} adres: sayfalar, serverlar, kategoriler, aktif ilanlar, rehber yazıları), robots.txt, .htaccess ve rozet.svg tek pakette. İlan ve yazı eklendikçe yeniden indirip sunucudaki sitemap.xml'i güncelleyin.</span>
    <div class="note note-info" style="font-size:12.5px"><b>Statik SEO paketi (önerilen):</b> ${staticRoutes().length} sayfanın arama motorları için önceden oluşturulmuş HTML'i, site kodu, bölünmüş site haritaları, RSS, robots.txt, .htaccess (HTTPS + güvenlik başlıkları) tek pakette. Google içeriği JavaScript beklemeden okur; rakiplerin sunucu taraflı sayfalarıyla aynı seviyeye gelirsiniz.</div>
    <div class="hstack"><button type="button" class="btn btn-sm btn-primary" data-act="static-kit">Statik SEO paketini oluştur (.zip)</button><button type="button" class="btn btn-sm" data-act="seo-kit">Sadece SEO dosyaları (.zip)</button><button type="button" class="btn btn-sm" data-act="seo-badge">Ana sayfa rozet kodu</button></div></div></div>`; }
function rehberAdmin(){ const A=[...(S.posts||[])].sort((a,b)=>b.t-a.t);
  const fm=(p,k)=>`<div class="row2"><div class="fld"><label for="pt_t_${k}">Başlık</label><input class="inp" id="pt_t_${k}" required maxlength="90" value="${esc(p.title||'')}"></div><div class="fld"><label for="pt_s_${k}">Adres (slug)</label><input class="inp mono" id="pt_s_${k}" value="${esc(p.slug||'')}" placeholder="başlıktan otomatik"></div></div>
    <div class="fld"><label for="pt_o_${k}">Özet / meta açıklama (120-160 karakter)</label><textarea class="inp" id="pt_o_${k}" maxlength="200" style="min-height:56px" required>${esc(p.ozet||'')}</textarea></div>
    <div class="fld"><label for="pt_b_${k}">İçerik</label><textarea class="inp" id="pt_b_${k}" style="min-height:220px" required>${esc(p.body||'')}</textarea><span class="muted" style="font-size:12px">Boş satır = yeni paragraf · <span class="mono">## Başlık</span> · <span class="mono">- madde</span> · <span class="mono">**kalın**</span> · bağlantı: <span class="mono">[Yang Borsası](#borsa)</span></span></div>
    <label class="chk" for="pt_on_${k}"><input type="checkbox" id="pt_on_${k}" ${p.on!==false?'checked':''}> Yayında</label>`;
  return `<form class="panel" data-form="postadd"><div class="panel-h"><h3>Yeni rehber yazısı</h3></div><div class="panel-b stack">${fm({on:true},'new')}<div><button class="btn btn-sm btn-primary">Yazıyı ekle</button></div></div></form>
  <div class="panel"><div class="panel-h"><h3>Yazılar (${A.length})</h3></div><div class="panel-b stack">${A.map(p=>`<details class="epgrp"><summary><span class="epgrp-n"><b>${esc(p.title)}</b><small class="muted mono">${esc(routeToPath('rehber-'+p.slug))}</small></span><span class="hstack"><span class="chip ${p.on?'ok':'warn'}">${p.on?'Yayında':'Taslak'}</span><span class="chip">${dstr(p.t)}</span></span></summary>
    <form class="stack" data-form="postsave" data-id="${p.id}" style="padding-top:10px">${fm(p,p.id)}<div class="hstack"><button class="btn btn-sm btn-primary">Kaydet</button><a class="btn btn-sm" href="#rehber-${p.slug}">Görüntüle</a><button type="button" class="btn btn-sm btn-bad" data-act="post-del" data-id="${p.id}">Sil</button></div></form></details>`).join('')||'<span class="muted">Yazı yok.</span>'}</div></div>`; }
function postFrom(k,p){ const title=v_('pt_t_'+k).trim(); let sl=slugify(v_('pt_s_'+k).trim()||title); const used=new Set((S.posts||[]).filter(x=>x!==p).map(x=>x.slug)); let b=sl,i=2; while(used.has(sl)) sl=b+'-'+(i++);
  return {title,slug:sl,ozet:v_('pt_o_'+k).trim(),body:v_('pt_b_'+k),on:$('#pt_on_'+k).checked}; }
