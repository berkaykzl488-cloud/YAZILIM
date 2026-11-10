/* ================== SEO 2: fiyat sayfası, widget, ortaklık, backlink takibi, statik sayfalar, Google ================== */
const CONV=[['uye','Üye olma','sign_up'],['satin','İlan satın alma','purchase'],['ep','EP satın alma','purchase'],['yukleme','Bakiye yükleme','add_payment_info'],['ilan','İlan verme','generate_lead']];
const gtagIds=new Set();
function ensureTags(){ const SE=S.set.seo; if(!SE||!isLive()) return false; let any=false;
  const ids=[SE.ga,SE.ads].filter(x=>x&&/^(G|AW)-[A-Z0-9-]+$/i.test(x)).map(x=>x.toUpperCase());
  if(ids.length){ if(!window.gtag){ const g=document.createElement('script'); g.async=true; g.src='https://www.googletagmanager.com/gtag/js?id='+ids[0]; document.head.appendChild(g); window.dataLayer=window.dataLayer||[]; window.gtag=function(){ dataLayer.push(arguments); }; gtag('js',new Date()); }
    ids.forEach(id=>{ if(!gtagIds.has(id)){ gtagIds.add(id); gtag('config',id,id.startsWith('G-')?{send_page_view:false}:{}); } }); any=true; }
  if(SE.gtm&&/^GTM-[A-Z0-9]+$/i.test(SE.gtm)&&!window.__gtm){ window.__gtm=1; window.dataLayer=window.dataLayer||[]; dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'}); const g=document.createElement('script'); g.async=true; g.src='https://www.googletagmanager.com/gtm.js?id='+SE.gtm.toUpperCase(); document.head.appendChild(g); any=true; }
  if(SE.adsense&&/^ca-pub-\d{6,}$/.test(SE.adsense)&&!window.__ads&&!isPanel()){ window.__ads=1; const g=document.createElement('script'); g.async=true; g.crossOrigin='anonymous'; g.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+SE.adsense; document.head.appendChild(g); }
  return any||!!window.gtag; }
function track(key,p){ p=p||{}; try{ const c=CONV.find(x=>x[0]===key); if(!c) return; ensurePixel(); if(!ensureTags()&&!window.fbq) return; const SE=S.set.seo, prm={currency:'TRY',...p};
  if(window.gtag) gtag('event',c[2],{...prm,item_category:key});
  const lab=(SE.adsConv||{})[key]; if(window.gtag&&SE.ads&&lab) gtag('event','conversion',{send_to:SE.ads.toUpperCase()+'/'+lab,value:prm.value,currency:'TRY',transaction_id:prm.transaction_id});
  if(SE.gtm&&window.dataLayer) dataLayer.push({event:'yangpazar_'+key,...prm});
  if(ensurePixel()&&FBEV[key]) fbq('track',FBEV[key],{value:prm.value,currency:'TRY'},prm.transaction_id?{eventID:prm.transaction_id}:undefined); }catch(e){} }
/* HTTPS zorunlu (yalnızca kendi alan adında) */
try{ if(isLive()&&location.protocol==='http:'&&S.set.seo&&S.set.seo.https!==false) location.replace('https://'+location.host+location.pathname+location.search+location.hash); }catch(e){}

/* --- server istatistikleri ve SSS --- */
function srvStats(s){ const L=active().filter(l=>l.server===s.id); const y=L.filter(l=>l.cat==='yang').sort((a,b)=>a.price-b.price); const x=S.exchange.find(e=>e.server===s.id&&e.on);
  return {L,n:L.length,yang:y.length,item:L.filter(l=>l.cat==='item').length,kar:L.filter(l=>l.cat==='karakter').length,yMin:y[0]?y[0].price:null,yUnit:y[0]?(unitOf(y[0])==='Won'?'1 Won':'ilan'):'',ex:x?exSellPrice(x):null,exUnit:x?x.unit:'',last:L.length?Math.max(...L.map(l=>l.bump||l.t)):null}; }
function srvFaq(s){ const st=srvStats(s), nm=S.set.siteName, F=[];
  F.push([`${s.name} yang nasıl satın alınır?`,`${s.name} sayfasında Yang sekmesinden ilan seçin, karakter adınızı, kanalı (CH1-CH6) ve teslimat yerini girip bakiyenizle ödeyin. Ödemeniz satıcıya değil güvenli havuza geçer; yangı teslim alıp onayladığınızda satıcıya aktarılır.`]);
  F.push([`${s.name} yang fiyatı ne kadar?`,st.yang?`Şu an ${s.name} için ${st.yang} yang ilanı var ve fiyatlar ${TL(st.yMin)}${st.yUnit==='1 Won'?' / 1 Won':''} seviyesinden başlıyor.${st.ex?` Yang Borsası'nda siteden satın alma fiyatı ${TL(st.ex)} / ${st.exUnit}.`:''} Fiyatlar ilan sahiplerine göre değişir.`:`Şu an ${s.name} için aktif yang ilanı yok. Yeni ilanlar eklendikçe bu sayfada listelenir; güncel durumu Metin2 Yang Fiyatları sayfasından da takip edebilirsiniz.`]);
  F.push([`${s.name} item ve karakter alım satımı güvenli mi?`,`${nm} alıcı ile satıcı arasında aracıdır. Ödeme teslim onaylanana kadar havuzda bekler, sorun olursa itiraz açabilirsiniz. Satıcı puanlarını ve tamamlanan satış sayısını ilan sayfasında görebilirsiniz.`]);
  if(srvEp(s)) F.push([`${s.name} EP nasıl alınır?`,`${s.name} EP kodları yalnızca ${nm} tarafından satılır. EP sekmesinden paket seçip ödediğinizde kod anında ekranda gösterilir ve Hesabım › EP kodlarım bölümünde saklanır.`]);
  F.push([`${s.name} için nasıl ilan verilir?`,`Üye olduktan sonra İlan Ver'e tıklayın, bölüm olarak ${secName(s.sec)}, server olarak ${s.name} seçin, kategori ve fiyatı girin. Satış tamamlandığında tutar komisyon düşülerek bakiyenize geçer.`]);
  return F; }
/* --- yang fiyatları sayfası --- */
function priceRows(){ return S.servers.map(s=>({s,st:srvStats(s)})).filter(r=>r.st.yang||r.st.ex).sort((a,b)=>(a.s.sec===b.s.sec?0:a.s.sec==='tr'?-1:1)||b.st.yang-a.st.yang||a.s.name.localeCompare(b.s.name,'tr')); }
function vPrices(){ const R=priceRows(), up=Math.max(...R.map(r=>r.st.last||0),0)||now();
  const tbl=sec=>{ const X=R.filter(r=>r.s.sec===sec); return X.length?`<div class="panel"><div class="panel-h"><h2>${sec==='tr'?'Metin2 TR serverları (Won)':'Metin2 PVP serverları'}</h2></div><div class="tbl-w"><table class="tbl pricetbl"><thead><tr><th>Server</th><th class="num">Yang ilanı</th><th class="num">Başlangıç fiyatı</th><th class="num">Borsa (siteden al)</th><th></th></tr></thead><tbody>${X.map(({s,st})=>`<tr><td><a href="#server-${s.id}-yang"><b>${esc(s.name)}</b></a>${s.partner?' <span class="chip ok">Partner</span>':''}</td><td class="num">${st.yang}</td><td class="num mono">${st.yMin!=null?TL(st.yMin)+(st.yUnit==='1 Won'?'<small class="muted"> /Won</small>':''):'—'}</td><td class="num mono">${st.ex!=null?TL(st.ex)+`<small class="muted"> /${esc(st.exUnit)}</small>`:'—'}</td><td><a class="btn btn-sm" href="#server-${s.id}-yang">İlanlar</a></td></tr>`).join('')}</tbody></table></div></div>`:''; };
  return `<div class="wrap"><nav class="crumbs" aria-label="Konum"><a href="#home">Ana sayfa</a> › <span>Yang fiyatları</span></nav><div class="page-h"><div><h1>Metin2 Yang ve Won Fiyatları</h1><p>Tüm serverlarda güncel yang ilanı sayısı, başlangıç fiyatları ve Yang Borsası fiyatları. Son güncelleme: <b>${dtstr(up)}</b>.</p></div><div class="hstack"><a class="btn btn-primary" href="#borsa">Yang Borsası</a><button type="button" class="btn" data-act="widget-code">Sitene ekle</button></div></div>
  ${tbl('tr')}${tbl('pvp')}
  <div class="panel panel-b seoabout"><h2>Yang fiyatları nasıl oluşur?</h2><p>Fiyatlar ilan sahipleri tarafından belirlenir ve serverdaki arz-talebe göre değişir. Bu tablo aktif ilanlardan ve Yang Borsası'ndaki sabit fiyatlardan otomatik oluşur. Satın alırken ödemeniz teslim onaylanana kadar güvenli havuzda bekler.</p>${shareBar('yang-fiyatlari','Metin2 yang ve won fiyatları')}</div></div>`; }
/* --- gömülebilir fiyat widget'ı --- */
function vWidget(sid){ const R=priceRows().filter(r=>!sid||r.s.id===sid).slice(0,sid?1:10); const u=shareUrl(sid?'server-'+sid+'-yang':'yang-fiyatlari');
  return `<div class="wbox"><div class="wbox-h"><b>${sid&&R[0]?esc(R[0].s.name)+' yang fiyatı':'Metin2 yang fiyatları'}</b><span>${dstr(now())}</span></div><table>${R.map(({s,st})=>`<tr><td>${esc(s.name)}</td><td>${st.yMin!=null?TL(st.yMin):st.ex!=null?TL(st.ex):'—'}</td><td>${st.yang} ilan</td></tr>`).join('')||'<tr><td>Veri yok</td></tr>'}</table><a href="${esc(u)}" target="_blank" rel="noopener">${esc(S.set.siteName)}'da gör →</a></div>`; }
function widgetCode(sid){ const s=sid?srv(sid):null; const src=siteBase()+(S.set.seo.clean?'/':'/#')+(sid?'widget-yang-'+sid:'widget-yang'); const page=shareUrl(sid?'server-'+sid+'-yang':'yang-fiyatlari'); const t=s?`${s.name} yang fiyatı`:'Metin2 yang fiyatları';
  return `<iframe src="${src}" width="320" height="${sid?170:360}" style="border:0;max-width:100%" loading="lazy" title="${t}"></iframe>\n<p style="font-size:12px"><a href="${page}">${t}</a> · ${esc(S.set.siteName)}</p>`; }
/* --- ortaklık --- */
function vPartner(){ const u=me();
  return `<div class="wrap" style="max-width:980px"><div class="page-h"><div><h1>Ortaklık ve Server Partnerliği</h1><p>Server sahipleri, yayıncılar ve site sahipleri için ücretsiz ortaklık programı.</p></div></div>
  <div class="ptgrid"><div class="panel panel-b"><span class="eyebrow">Server sahipleri</span><h2>Partner server olun</h2><p>Sitenize ${esc(S.set.siteName)} rozetini veya fiyat widget'ını ekleyin; serverınız <b>Partner</b> etiketi alsın, server sayfanızda ve fiyat tablosunda öne çıksın.</p><button type="button" class="btn btn-sm" data-act="seo-badge">Rozet kodunu al</button></div>
  <div class="panel panel-b"><span class="eyebrow">Yayıncılar ve YouTuberlar</span><h2>Davet linkinizle kazanın</h2><p>Video açıklamanıza ve yayın panelinize davet linkinizi koyun; linkinizden üye olanların ilk alışverişinde hediye bakiye kazanın.</p>${u?`<a class="btn btn-sm" href="#hesabim" data-act="tab" data-t="davet">Davet linkim</a>`:`<button type="button" class="btn btn-sm" data-act="register">Üye ol</button>`}</div>
  <div class="panel panel-b"><span class="eyebrow">Forum ve site sahipleri</span><h2>Canlı fiyat widget'ı</h2><p>Metin2 forumunuza veya sitenize güncel yang fiyatlarını gösteren widget'ı tek satır kodla ekleyin.</p><button type="button" class="btn btn-sm" data-act="widget-code">Widget kodunu al</button></div></div>
  <form class="panel" data-form="papply"><div class="panel-h"><h2>Ortaklık başvurusu</h2></div><div class="panel-b stack">
    <div class="row3"><div class="fld"><label for="pa_t">Başvuru türü</label><select class="inp" id="pa_t"><option value="server">Server sahibi</option><option value="yayinci">Yayıncı / YouTuber</option><option value="site">Forum / site sahibi</option></select></div><div class="fld"><label for="pa_n">Ad soyad veya ekip</label><input class="inp" id="pa_n" required maxlength="60"></div><div class="fld"><label for="pa_s">Server adı (varsa)</label><input class="inp" id="pa_s" maxlength="40"></div></div>
    <div class="row2"><div class="fld"><label for="pa_u">Site / kanal adresi</label><input class="inp mono" id="pa_u" type="url" required placeholder="https://"></div><div class="fld"><label for="pa_l">Bağlantıyı eklediğiniz sayfa</label><input class="inp mono" id="pa_l" type="url" placeholder="https://.../market"></div></div>
    <div class="row2"><div class="fld"><label for="pa_c">E-posta veya Discord</label><input class="inp" id="pa_c" required maxlength="80"></div><div class="fld"><label for="pa_x">Not</label><input class="inp" id="pa_x" maxlength="200"></div></div>
    <div><button class="btn btn-primary">Başvuruyu gönder</button></div></div></form></div>`; }
/* --- ilgili ilanlar --- */
function relatedBox(l){ const s=srv(l.server); if(!s) return ''; const R=active().filter(x=>x.server===l.server&&x.id!==l.id&&x.cat===l.cat).sort((a,b)=>(b.bump||b.t)-(a.bump||a.t)).slice(0,6); if(!R.length) return '';
  return `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2 style="font-size:16px">${esc(s.name)} ${esc(catLabel(l.cat,s.sec))} ilanları</h2><a class="btn btn-sm" href="#server-${s.id}-${l.cat}">Tümü →</a></div><div class="rellist">${R.map(x=>`<a href="#ilan-${x.id}"><span>${esc(x.title)}</span><b class="mono">${TL(x.price)}</b></a>`).join('')}</div></div>`; }
/* --- backlink takibi (yönetim) --- */
const BLT={rozet:'Rozet',widget:'Widget',yazi:'Yazı / tanıtım',forum:'Forum / Discord',yayinci:'Yayıncı',dizin:'Dizin / liste',diger:'Diğer'};
const BLS={aktif:['Aktif','ok'],kontrol:['Kontrol edilecek','warn'],kayip:['Kaldırılmış','bad']};
const domOf = u => { try{ return new URL(u).hostname.replace(/^www\./,''); }catch(e){ return u; } };
function backlinkAdmin(){ const B=S.backlinks||[], A=(S.partnerApps||[]).filter(a=>a.st==='bekliyor'); const doms=new Set(B.filter(b=>b.st==='aktif').map(b=>domOf(b.url)));
  return `<div class="kpis"><div class="kpi hl"><small>Aktif backlink</small><b>${B.filter(b=>b.st==='aktif').length}</b></div><div class="kpi"><small>Farklı alan adı</small><b>${doms.size}</b></div><div class="kpi"><small>Kontrol edilecek</small><b>${B.filter(b=>b.st==='kontrol').length}</b></div><div class="kpi"><small>Bekleyen başvuru</small><b>${A.length}</b></div><div class="kpi"><small>Partner server</small><b>${S.servers.filter(s=>s.partner).length}</b></div></div>
  ${A.length?`<div class="panel"><div class="panel-h"><h3>Ortaklık başvuruları</h3></div><div class="panel-b stack">${A.map(a=>`<div class="cprow" style="align-items:flex-start;flex-wrap:wrap"><span style="min-width:0;flex:1"><b>${esc(a.n)}</b> · ${esc({server:'Server sahibi',yayinci:'Yayıncı',site:'Site sahibi'}[a.tp]||a.tp)}${a.s?' · <b>'+esc(a.s)+'</b>':''} <span class="muted">${dtstr(a.t)}</span><br><span class="mono" style="font-size:12px;overflow-wrap:anywhere">${esc(a.u)}${a.l?' → '+esc(a.l):''}</span><br><span class="muted" style="font-size:12px">${esc(a.c)}${a.x?' · '+esc(a.x):''}</span></span><span class="hstack">${a.l?`<a class="btn btn-sm" href="${esc(a.l)}" target="_blank" rel="noopener nofollow">Bağlantıyı kontrol et</a>`:''}<button type="button" class="btn btn-sm btn-ok" data-act="pa-ok" data-id="${a.id}">Onayla</button><button type="button" class="btn btn-sm btn-bad" data-act="pa-no" data-id="${a.id}">Reddet</button></span></div>`).join('')}</div></div>`:''}
  <form class="panel" data-form="bladd"><div class="panel-h"><h3>Backlink ekle</h3></div><div class="panel-b stack"><div class="row3"><div class="fld"><label for="bl_u">Bağlantının bulunduğu sayfa</label><input class="inp mono" id="bl_u" type="url" required placeholder="https://forum.../konu"></div><div class="fld"><label for="bl_t">Hedef sayfamız</label><input class="inp mono" id="bl_t" placeholder="/server/ejderha2"></div><div class="fld"><label for="bl_a">Bağlantı metni</label><input class="inp" id="bl_a" placeholder="Ejderha2 yang"></div></div><div class="row3"><div class="fld"><label for="bl_k">Tür</label><select class="inp" id="bl_k">${Object.entries(BLT).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><label class="chk" for="bl_nf"><input type="checkbox" id="bl_nf"> nofollow bağlantı</label><div><button class="btn btn-sm btn-primary">Ekle</button></div></div></div></form>
  <div class="panel"><div class="panel-h"><h3>Backlink listesi (${B.length})</h3></div>${B.length?`<div class="tbl-w"><table class="tbl bltbl mcards"><thead><tr><th>Kaynak</th><th>Hedef / metin</th><th>Tür</th><th>Durum</th><th></th></tr></thead><tbody>${[...B].sort((a,b)=>b.t-a.t).map(b=>`<tr><td><a href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener nofollow"><b>${esc(domOf(b.url))}</b></a><div class="muted mono" style="font-size:11px;overflow-wrap:anywhere">${esc(b.url)}</div><div class="muted" style="font-size:11px">eklendi ${dstr(b.t)}${b.ck?' · kontrol '+dstr(b.ck):''}</div></td><td><span class="mono" style="font-size:12px">${esc(b.target||'/')}</span><div>${esc(b.anchor||'')}${b.nf?' <span class="chip">nofollow</span>':''}</div></td><td>${BLT[b.k]||b.k}</td><td><select class="inp" data-change="blst" data-id="${b.id}" style="width:auto">${Object.entries(BLS).map(([k,[v]])=>`<option value="${k}" ${b.st===k?'selected':''}>${v}</option>`).join('')}</select></td><td><button type="button" class="btn btn-sm btn-bad" data-act="bl-del" data-id="${b.id}">Sil</button></td></tr>`).join('')}</tbody></table></div>`:emptyBox('Henüz kayıt yok','Rozet, widget, forum ve tanıtım yazısı bağlantılarınızı buraya ekleyip takip edin.')}</div>
  <div class="panel panel-b stack" style="font-size:13px"><b>Rakiplerin önüne geçmek için öneriler</b>
    <div>1. Reklam veren ve partner serverlardan rozet veya fiyat widget'ı isteyin; server siteleri en güçlü ve konuya uygun bağlantılardır.</div>
    <div>2. Haftada en az 1-2 rehber yazısı yayınlayın; her yazıyı Metin2 forumlarında, Discord sunucularında ve sosyal medyada paylaşın.</div>
    <div>3. Yang Fiyatları sayfasını "güncel fiyat kaynağı" olarak forumlarda paylaşın; fiyat sayfaları doğal olarak bağlantı toplar.</div>
    <div>4. Yayıncılarla davet linki üzerinden çalışın; video açıklamalarındaki bağlantılar trafik ve marka aramaları getirir.</div>
    <div>5. Para karşılığı toplu link paketlerinden ve spam dizinlerden uzak durun; Google bunları cezalandırabilir.</div></div>`; }
/* --- statik SEO sayfaları (önceden oluşturulmuş HTML) --- */
const fileOfPath = p => p==='/'?'index.html':p.replace(/^\//,'')+'.html';
function staticRoutes(){ const R=['home','metin2-tr','metin2-pvp','metin2-ep','borsa','cekilis','reklam-ver','guvenli','rehber','yang-fiyatlari','ortaklik',...Object.keys(PAGES).map(k=>'sayfa-'+k)];
  S.servers.forEach(s=>{ const L=active().filter(l=>l.server===s.id); R.push('server-'+s.id,'server-'+s.id+'-hepsi'); M2CAT.filter(c=>c!=='ep'&&L.some(l=>l.cat===c)).forEach(c=>R.push('server-'+s.id+'-'+c)); if(srvEp(s)) R.push('server-'+s.id+'-ep'); });
  active().forEach(l=>R.push('ilan-'+l.id)); posts().forEach(p=>R.push('rehber-'+p.slug)); return [...new Set(R)]; }
function rewriteLinks(root){ root.querySelectorAll('a[href^="#"]').forEach(a=>{ const h=a.getAttribute('href').slice(1); if(!h) return; a.setAttribute('href',routeToPath(h)); }); }
async function zipDeflate(files){ if(!window.CompressionStream) return zipFiles(files); const enc=new TextEncoder();
  const T=(()=>{const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0;} return t;})(); const crc=b=>{let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=T[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0;};
  const d=new Date(), dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF, dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF; const parts=[], cen=[]; let off=0;
  for(const [name,txt] of files){ const nb=enc.encode(name), raw=typeof txt==='string'?enc.encode(txt):txt, c=crc(raw); const cmp=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const h=new DataView(new ArrayBuffer(30)); h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,8,true); h.setUint16(10,dt,true); h.setUint16(12,dd,true); h.setUint32(14,c,true); h.setUint32(18,cmp.length,true); h.setUint32(22,raw.length,true); h.setUint16(26,nb.length,true); parts.push(new Uint8Array(h.buffer),nb,cmp);
    const e=new DataView(new ArrayBuffer(46)); e.setUint32(0,0x02014b50,true); e.setUint16(4,20,true); e.setUint16(6,20,true); e.setUint16(8,0x0800,true); e.setUint16(10,8,true); e.setUint16(12,dt,true); e.setUint16(14,dd,true); e.setUint32(16,c,true); e.setUint32(20,cmp.length,true); e.setUint32(24,raw.length,true); e.setUint16(28,nb.length,true); e.setUint32(42,off,true); cen.push(new Uint8Array(e.buffer),nb); off+=30+nb.length+cmp.length; }
  const cs=cen.reduce((a,b)=>a+b.length,0); const z=new DataView(new ArrayBuffer(22)); z.setUint32(0,0x06054b50,true); z.setUint16(8,files.length,true); z.setUint16(10,files.length,true); z.setUint32(12,cs,true); z.setUint32(16,off,true);
  const all=[...parts,...cen,new Uint8Array(z.buffer)]; const out=new Uint8Array(all.reduce((a,b)=>a+b.length,0)); let p=0; all.forEach(b=>{out.set(b,p); p+=b.length;}); return out; }
function headHtml(x){ const SE=S.set.seo, m=(a,k,v)=>v?`<meta ${a}="${k}" content="${esc(v)}">`:'';
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${esc(x.title)}</title>${m('name','description',x.desc)}${m('name','robots',x.noidx?'noindex, follow':'index, follow, max-image-preview:large')}${x.noidx?'':`<link rel="canonical" href="${esc(safeUrl(x.url))}">`}
${m('property','og:site_name',S.set.siteName)}${m('property','og:locale','tr_TR')}${m('property','og:type',x.type==='product'?'product':x.type==='article'?'article':'website')}${m('property','og:title',x.title)}${m('property','og:description',x.desc)}${m('property','og:url',x.url)}${m('property','og:image',x.img)}${m('name','twitter:card',x.img?'summary_large_image':'summary')}${m('name','google-site-verification',SE.gsc)}${m('name','msvalidate.01',SE.bing)}${m('name','yandex-verification',SE.yandex)}
<link rel="alternate" type="application/rss+xml" title="${esc(S.set.siteName)} Rehber" href="${siteBase()}/feed.xml"><link rel="icon" href="/rozet.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${x.ld.length?`<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':x.ld}).replace(/</g,'\\u003c')}<${'/'}script>`:''}`; }
async function buildStatic(btn){ const SCR=[...document.scripts].filter(x=>!x.src&&x.textContent.includes('function render(){')).sort((a,b)=>b.textContent.length-a.textContent.length)[0], ST=[...document.querySelectorAll('style')].sort((a,b)=>b.textContent.length-a.textContent.length)[0];
  if(!SCR||!ST) return toast('Site kodu okunamadı.',true); const font=document.querySelector('link[rel=stylesheet][href*="fonts.googleapis"]');
  const keep={cur:S.cur,ui:JSON.parse(JSON.stringify(ui)),views:S.listings.map(l=>[l,l.views]),save:window.save}; const R=staticRoutes(); const files=[]; let i=0;
  window.__noSave=1; S.cur=null; ui.popupDone=true;
  try{ for(const r of R){ i++; if(btn&&i%15===0){ btn.textContent=`Sayfalar hazırlanıyor… ${i}/${R.length}`; await new Promise(z=>setTimeout(z,0)); }
      window.__r=r; ui.f={}; ui.lastView=null; render(); const x=seoData(r); const box={}; ['strip','hdr','cats','app','ftr'].forEach(id=>{ const el=document.getElementById(id).cloneNode(true); rewriteLinks(el); box[id]=el.innerHTML; });
      files.push([fileOfPath(routeToPath(r)),`<!doctype html>\n<html lang="tr"><head>${headHtml(x)}\n${font?`<link rel="stylesheet" href="${font.href}">`:''}<link rel="stylesheet" href="/assets/app.css"><script>window.__SEO_CLEAN=1<${'/'}script></head><body>\n<div id="strip">${box.strip}</div>\n<header class="hdr" id="hdr">${box.hdr}</header>\n<nav class="cats" id="cats">${box.cats}</nav>\n<main id="app">${box.app}</main>\n<footer id="ftr">${box.ftr}</footer>\n<div id="ls"></div><div id="modal"></div><div id="toasts"></div>\n<script src="/assets/app.js" defer><${'/'}script></body></html>\n`]); } }
  finally{ window.__r=null; window.__noSave=0; S.cur=keep.cur; Object.keys(ui).forEach(k=>delete ui[k]); Object.assign(ui,keep.ui); keep.views.forEach(([l,v])=>l.views=v); render(); }
  const reset=':root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}\n';
  files.push(['assets/app.css',reset+ST.textContent],['assets/app.js',SCR.textContent],['sitemap.xml',sitemapIndex()],['sitemap-sayfalar.xml',sitemapPart('sayfa')],['sitemap-serverler.xml',sitemapPart('server')],['sitemap-ilanlar.xml',sitemapPart('ilan')],['sitemap-rehber.xml',sitemapPart('rehber')],['feed.xml',rssXml()],['robots.txt',robotsTxt()],['.htaccess',HTACCESS],['rozet.svg',rozetSvg()],['OKUBENI.txt',STATIC_README(R.length)]);
  if(S.set.seo.adsense) files.push(['ads.txt',`google.com, ${S.set.seo.adsense.replace(/^ca-/,'')}, DIRECT, f08c47fec0942fa0\n`]);
  return {zip:await zipDeflate(files),n:R.length}; }
const STATIC_README = n => `${S.set.siteName.toUpperCase()} · STATİK SEO PAKETİ
================================

Bu paket ${n} sayfanın arama motorları için önceden oluşturulmuş HTML halini içerir.
Google ve diğer arama motorları sayfa içeriğini JavaScript beklemeden doğrudan okur;
ziyaretçide ise site her zamanki gibi açılır ve çalışır.

Kurulum (Apache / LiteSpeed):
1) Zip içeriğini sitenizin kök dizinine (public_html) olduğu gibi yükleyin.
   index.html, assets/, server/, ilan/, rehber/ ... aynı yerde olmalı.
2) .htaccess dosyası temiz adresleri, HTTPS yönlendirmesini ve güvenlik başlıklarını açar.
3) Yönetim > SEO'da "Temiz adresler" açık olsun.
4) Google Search Console > Site haritaları: sitemap.xml gönderin.
5) İlan, server veya yazı ekledikçe paketi yeniden oluşturup yükleyin (en az haftada bir).

SSL: Hosting panelinizden (cPanel > SSL/TLS veya Let's Encrypt / AutoSSL) ücretsiz sertifikayı
etkinleştirin. Sertifika aktif olunca .htaccess tüm trafiği https'e yönlendirir ve HSTS açılır.
Ayarlar'daki site adresi https:// ile başlamalıdır.
`;
/* --- sitemap parçaları, RSS --- */
function sitemapPart(kind){ const U=sitemapUrls().filter(u=>{ const p=u.loc.slice(siteBase().length); return kind==='server'?p.startsWith('/server/'):kind==='ilan'?p.startsWith('/ilan/'):kind==='rehber'?p.startsWith('/rehber/'):!/^\/(server|ilan|rehber)\//.test(p); });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${U.map(u=>`  <url><loc>${xmlEsc(u.loc)}</loc><lastmod>${u.lm}</lastmod><changefreq>${u.cf}</changefreq><priority>${u.pr}</priority></url>`).join('\n')}\n</urlset>\n`; }
const sitemapIndex = () => { const day=new Date().toISOString().slice(0,10); return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['sayfalar','serverler','ilanlar','rehber'].map(k=>`  <sitemap><loc>${siteBase()}/sitemap-${k}.xml</loc><lastmod>${day}</lastmod></sitemap>`).join('\n')}\n</sitemapindex>\n`; };
const rssXml = () => `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${xmlEsc(S.set.siteName)} Rehber</title><link>${siteBase()}/rehber</link><description>Metin2 yang, EP, item ve karakter alım satımı rehberleri</description><language>tr</language>\n${posts().slice(0,30).map(p=>`<item><title>${xmlEsc(p.title)}</title><link>${siteBase()+routeToPath('rehber-'+p.slug)}</link><guid>${siteBase()+routeToPath('rehber-'+p.slug)}</guid><pubDate>${new Date(p.t).toUTCString()}</pubDate><description>${xmlEsc(p.ozet)}</description></item>`).join('\n')}\n</channel></rss>\n`;
function adsGuides(){ const site=siteBase(), conv=CONV.map(([k,t,g])=>`<li><b>${t}</b>: Google'da "${({uye:'Kaydolma',satin:'Satın alma',ep:'Satın alma',yukleme:'Ödeme bilgisi ekleme',ilan:'Potansiyel müşteri'})[k]}" kategorisi · GTM olayı <span class="mono">yangpazar_${k}</span></li>`).join('');
  const G=(t,body,open)=>`<details class="guide"${open?' open':''}><summary>${t}</summary><div class="guide-b">${body}</div></details>`;
  return `<div class="panel" id="adm-rehber"><div class="panel-h"><h3>Kurulum rehberi</h3><span class="muted" style="font-size:12px">Reklam panellerinin menü adları zamanla değişebilir</span></div><div class="panel-b stack">
  <div class="note note-info" style="font-size:12.5px">Başlamadan önce: Ayarlar'da site adresinin (<b class="mono">${esc(site)}</b>) doğru olduğundan emin olun ve siteyi kendi alan adınıza yükleyin. Etiketler bu önizlemede değil, yalnızca kendi alan adınızda çalışır.</div>
  ${G('1 · Google Ads kurulumu',`<ol>
    <li><b>ads.google.com</b> adresinden hesap açın (fatura bilgileri ve TRY para birimiyle).</li>
    <li>Hedefler › Dönüşümler bölümünden <b>Yeni dönüşüm işlemi</b> oluşturun ve <b>Web sitesi</b>ni seçin. Alan adınızı girin, kurulum yöntemi olarak <b>kodu manuel ekleme</b> yolunu seçin.</li>
    <li>Ekranda gösterilen Google etiketindeki <b>AW-</b> ile başlayan kimliği kopyalayın (ör. <span class="mono">AW-123456789</span>) ve aşağıdaki "Google Ads etiket kimliği" alanına yapıştırın.</li>
    <li>Aşağıdaki her işlem için ayrı bir dönüşüm oluşturun. Her birinin olay kodunda <span class="mono">send_to: 'AW-123456789/<b>AbCdEfGh</b>'</span> satırı vardır; <b>"/" işaretinden sonraki kısım</b> dönüşüm etiketidir. Bunu ilgili kutuya yazın (tamamını yapıştırırsanız site "/" sonrasını kendisi alır).<ul>${conv}</ul></li>
    <li>Değer olarak "her dönüşüm için farklı değer kullan"ı seçin; site satış tutarını TRY olarak otomatik gönderir.</li>
    <li>Kaydedin. Siteden deneme bir üyelik yapın; Google Ads'te dönüşüm durumu birkaç saat içinde "Kayıtlı dönüşüm yok" yerine "Etkin"e döner.</li></ol>`,true)}
  ${G('2 · Google Analytics 4 (isteğe bağlı, önerilir)',`<ol>
    <li><b>analytics.google.com</b>'da bir mülk oluşturun, Veri akışları › <b>Web</b> akışı ekleyin.</li>
    <li><b>G-</b> ile başlayan Ölçüm kimliğini "Google Analytics 4" alanına yazın.</li>
    <li>Google Ads ile Analytics'i Yönetici › Ürün bağlantıları › Google Ads bağlantıları üzerinden bağlayın; kitleleri (ör. sepeti terk edenler) reklamda kullanabilirsiniz.</li></ol>`)}
  ${G('3 · TikTok Ads kurulumu (Google Tag Manager ile)',`<ol>
    <li><b>ads.tiktok.com</b>'da reklam hesabı açın. Araçlar › <b>Olaylar</b> › Web olayları bölümünden yeni bir <b>Pixel</b> oluşturun ve kurulum yöntemi olarak <b>Google Tag Manager</b>'ı seçin. Pixel ID'yi not alın.</li>
    <li><b>tagmanager.google.com</b>'da web için bir kapsayıcı oluşturun. <b>GTM-</b> ile başlayan kimliği "Google Tag Manager" alanına yazıp kaydedin.</li>
    <li>GTM'de Şablonlar › Etiket şablonları › <b>Galeride ara</b> ile TikTok'un resmi "TikTok Pixel" şablonunu ekleyin.</li>
    <li>Yeni bir etiket oluşturun: tür <b>TikTok Pixel</b>, Pixel ID'nizi girin, olay <b>PageView</b> (sayfa görüntüleme), tetikleyici <b>All Pages</b>.</li>
    <li>Dönüşümler için Tetikleyiciler › Yeni › <b>Özel etkinlik</b> oluşturun ve etkinlik adına aşağıdakileri yazın. Her biri için yine TikTok Pixel etiketi ekleyin:<ul>
      <li><span class="mono">yangpazar_uye</span> → CompleteRegistration</li>
      <li><span class="mono">yangpazar_satin</span> ve <span class="mono">yangpazar_ep</span> → CompletePayment (Purchase)</li>
      <li><span class="mono">yangpazar_yukleme</span> → AddPaymentInfo</li>
      <li><span class="mono">yangpazar_ilan</span> → SubmitForm</li></ul></li>
    <li>Tutarı göndermek için Değişkenler › Yeni › <b>Veri katmanı değişkeni</b> ile <span class="mono">value</span> ve <span class="mono">currency</span> değişkenlerini oluşturup etiketlerin değer ve para birimi alanlarına bağlayın.</li>
    <li>GTM'de <b>Önizle</b> ile kontrol edip <b>Yayınla</b>'ya basın. TikTok Olaylar ekranında olayların geldiğini görürsünüz.</li></ol>
    <p class="muted">TikTok reklamlarından gelen ziyaretçiler (ttclid) site tarafından otomatik tanınır ve Reklam & kampanyalar raporunda "tiktok" kaynağıyla görünür.</p>`)}
  ${G('4 · Meta (Facebook / Instagram) Pixel',`<ol>
    <li><b>business.facebook.com</b> › Events Manager'da <b>Veri kaynağı bağla › Web</b> ile bir Pixel (veri kümesi) oluşturun.</li>
    <li>15-16 haneli <b>Pixel ID</b>'yi "Meta Pixel kimliği" alanına yazın. Site sayfa görüntüleme, CompleteRegistration, Purchase, AddPaymentInfo ve Lead olaylarını kendisi gönderir.</li>
    <li>Events Manager › <b>Olayları test et</b> ile sitenizi açıp olayların geldiğini doğrulayın.</li></ol>`)}
  ${G('5 · Reklam bağlantıları ve takip',`<ol>
    <li>Her reklam için <b>Reklam & kampanyalar › Reklam bağlantısı oluştur</b> bölümünden bağlantı alın (kaynak, ortam ve kampanya adı eklenir).</li>
    <li>Google Ads'te otomatik etiketleme (gclid) açıksa ayrıca bir şey yapmanıza gerek yok; site gclid'i tanır.</li>
    <li>Üye olan ve alışveriş yapan ziyaretçiler, geldikleri kampanyaya göre <b>Kampanya raporu</b>nda listelenir.</li>
    <li>Reklam vermeden önce Google, TikTok ve Meta'nın oyun içi para ve dijital ürün reklam politikalarını okuyun; rakip firma adı kullanmayın.</li></ol>`)}
  </div></div>`; }

function adPlaceGuides(){ const c=S.set.commission, nm=S.set.siteName, wf=S.set.wdFee&&S.set.wdFee.on;
  const G=(t,body)=>`<details class="guide"><summary>${t}</summary><div class="guide-b">${body}</div></details>`;
  const utm=(k)=>`<p class="muted">Bağlantı: Reklam & kampanyalar › Reklam bağlantısı oluştur › <b>${k}</b>.</p>`;
  return `<div class="panel"><div class="panel-h"><h3>Reklam verilecek yerler · kampanya kurulum rehberi</h3><span class="muted" style="font-size:12px">Önce yukarıdaki etiket kurulumlarını tamamlayın</span></div><div class="panel-b stack">
  <div class="note note-info" style="font-size:12.5px">Hazır materyaller: 30 saniyelik reklam filmi, <b>Reklam & kampanyalar › Hazır reklam metinleri</b> ve Yang Fiyatları sayfası. Her yerde ayrı kampanya adıyla bağlantı kullanın ki raporda hangisinin işe yaradığını görün. Küçük bütçeyle başlayın, 1 hafta sonra en ucuz üye getiren kanala bütçe kaydırın.</div>
  ${G('Google Arama reklamları (en hızlı müşteri)',`<ol>
    <li>Google Ads › Yeni kampanya › hedef <b>Satışlar</b> veya <b>Potansiyel müşteriler</b> › tür <b>Arama</b>.</li>
    <li>Konum: Türkiye · Dil: Türkçe. Teklif: başlangıçta <b>Tıklamaları en üst düzeye çıkar</b>, 30+ dönüşüm olunca <b>Dönüşümleri en üst düzeye çıkar</b>.</li>
    <li>Reklam grupları konuya göre ayrılsın: "metin2 yang", "metin2 won", "metin2 ep", "[server adı] yang", "metin2 karakter satın al". Her grubun açılış sayfası ilgili sayfa olsun (ör. server yang sayfası, Metin2 EP, Yang Fiyatları).</li>
    <li>Başlık ve açıklamaları Hazır reklam metinlerinden kopyalayın (başlık 30, açıklama 90 karakter).</li>
    <li>Negatif anahtar kelime ekleyin: "hile", "bot", "bedava", "apk", "indir" gibi alakasız aramalar bütçe yakar.</li>
    <li>Uzantılar: site bağlantıları (Yang Borsası, Metin2 EP, Güvenli Alışveriş, Yang Fiyatları) ve açıklama metinleri (Komisyon %${c}${wf?'':', Para çekimi ücretsiz'}, Ödeme havuzda güvende).</li></ol>${utm('Google Ads')}`)}
  ${G('YouTube video reklamları',`<ol>
    <li>Reklam filmini kendi YouTube kanalınıza <b>Liste dışı</b> olarak yükleyin.</li>
    <li>Google Ads › Yeni kampanya › tür <b>Video</b> › alt tür "Görüntüleme sayısı" veya "Dönüşüm".</li>
    <li>Hedefleme: ilgi alanı "Video oyunları / MMORPG", anahtar kelime "metin2", ve <b>yerleşim</b> olarak Metin2 içerik üreten kanallar.</li>
    <li>Video bağlantısını ekleyin; son ekran ve harekete geçirici mesaj: "Ücretsiz üye ol".</li></ol>${utm('YouTube / yayıncı')}`)}
  ${G('Instagram ve Facebook reklamları (Meta)',`<ol>
    <li><b>business.facebook.com</b> › Reklam Yöneticisi › Oluştur › hedef <b>Satışlar</b> (Pixel bağlıysa) veya <b>Trafik</b>.</li>
    <li>Dönüşüm olayı: <b>CompleteRegistration</b> (üye kazanımı) veya <b>Purchase</b>.</li>
    <li>Kitle: Türkiye, 16+ yaş, ilgi alanları "Metin2", "MMORPG", "Online oyunlar". Yerleşim: Advantage+ (otomatik) ya da sadece Reels ve Hikâyeler.</li>
    <li>Reklam: reklam filmini dikey (9:16) sürümle kullanın; ilk 3 saniyede "Kocaman reklamlardan sıkılmadınız mı?" mesajı görünsün.</li>
    <li>Yeniden pazarlama: siteyi ziyaret edip üye olmayanlara ayrı bir kampanya açın (Özel hedef kitle › Web sitesi ziyaretçileri).</li></ol>${utm('Instagram reklam')}`)}
  ${G('TikTok reklamları',`<ol>
    <li><b>ads.tiktok.com</b> › Kampanya › hedef <b>Web sitesi dönüşümleri</b> (Pixel bağlıysa) veya <b>Trafik</b>.</li>
    <li>Optimizasyon olayı: CompleteRegistration. Konum Türkiye, ilgi alanı "Oyun".</li>
    <li>Reklam filmini dikey sürümüyle yükleyin, açıklamaya kısa ve net bir cümle yazın ("Stoklu ilan ver, stok bitene kadar satılsın").</li>
    <li>Spark Ads: oyun içeriği üreten TikTok'çularla anlaşıp onların videosunu reklam olarak öne çıkarabilirsiniz.</li></ol>${utm('TikTok reklam')}`)}
  ${G('X (Twitter) reklamları',`<ol>
    <li><b>ads.x.com</b> › Kampanya › hedef <b>Web sitesi trafiği</b>.</li>
    <li>Hedefleme: anahtar kelime ve ilgi alanı "metin2", "mmorpg"; Metin2 hesaplarını takip edenlere benzer kitleler.</li>
    <li>Görsel olarak Yang Fiyatları tablosunun ekran görüntüsü iyi çalışır; bağlantıyı Yang Fiyatları sayfasına verin.</li></ol>${utm('X (Twitter) reklam')}`)}
  ${G('Discord sunucuları',`<ol>
    <li>Büyük Metin2 ve PVP server Discord sunucularının yöneticileriyle konuşun; <b>sabit duyuru</b>, sponsorlu kanal veya "market" kanalı için ücret/ortaklık teklif edin.</li>
    <li>Kendi Discord sunucunuzu açın: fiyat bildirimleri, kampanyalar ve destek için. Site davet linkini profil ve duyurulara ekleyin.</li>
    <li>Server sahiplerine Partner programını (rozet + widget) önerin; karşılığında Discord'larında tanıtım isteyin.</li></ol>${utm('Discord')}`)}
  ${G('Metin2 forumları ve PVP server siteleri',`<ol>
    <li>Metin2 forumlarında (PVP server tanıtım bölümleri dahil) <b>sponsorlu konu</b> veya site banner'ı satın alın; banner olarak reklam filminden ekran görüntüleri kullanın.</li>
    <li>PVP server sitelerine Partner programını teklif edin: siteye rozet veya canlı fiyat widget'ı koysunlar, siz de serverlarını vitrinde/Partner etiketiyle öne çıkarın.</li>
    <li>Forumlarda spam yapmayın; rehber yazılarınızı ve Yang Fiyatları sayfasını faydalı içerik olarak paylaşın.</li>
    <li>Aldığınız her bağlantıyı Backlink & ortaklık bölümüne kaydedin.</li></ol>${utm('Forum')}`)}
  ${G('Yayıncılar ve YouTuberlar (Twitch, Kick, YouTube)',`<ol>
    <li>Metin2 yayını yapan kişilerle anlaşın: yayın panelinde/video açıklamasında <b>davet linki</b> ve sabit bir tanıtım cümlesi.</li>
    <li>Ödeme modeli: sabit ücret yerine davet sistemi (getirdiği üyenin ilk alışverişinde hediye bakiye) veya karma model.</li>
    <li>Yayın sırasında çekiliş: ${esc(nm)} bakiyesi veya EP kodu hediye edin; katılım için üyelik isteyin.</li>
    <li>Her yayıncıya ayrı kampanya adlı bağlantı verin; raporda kimin ne getirdiğini görün.</li></ol>${utm('Twitch / Kick yayıncı')}`)}
  ${G('Telegram ve WhatsApp kanalları',`<ol>
    <li>Kendi duyuru kanalınızı açın: günlük yang fiyatları, Happy Hour ve kampanya duyuruları.</li>
    <li>Büyük Metin2 alım satım gruplarında sabit mesaj veya sponsorlu paylaşım için yöneticilerle anlaşın.</li>
    <li>Paylaşımlarda sitedeki paylaş butonlarını veya kampanya bağlantısını kullanın.</li></ol>${utm('Telegram kanalı')}`)}
  </div></div>`; }

function adsPanel(){ const SE=S.set.seo, C=SE.adsConv||{};
  return `<form class="panel" data-form="adsset"><div class="panel-h" style="flex-wrap:wrap"><h3>İzleme etiketleri: Google Ads, Analytics, Meta Pixel ve AdSense</h3><span class="hstack"><span class="chip ${SE.ads?'ok':'warn'}">${SE.ads?'Google Ads bağlı':'Google Ads bağlı değil'}</span></span></div><div class="panel-b stack">
    <span class="muted" style="font-size:12.5px">Adım adım anlatım hemen aşağıdaki <b>Kurulum rehberi</b>nde. Etiketler yalnızca kendi alan adınızda yüklenir; bu önizlemede çalışmaz. Dönüşümler (üye olma, satın alma, bakiye yükleme…) otomatik gönderilir; Google Ads'te oluşturduğunuz her dönüşümün <b>etiketini</b> (send_to'daki "/" sonrası) ilgili alana yazın.</span>
    <div class="row3"><div class="fld"><label for="ad_aw">Google Ads etiket kimliği</label><input class="inp mono" id="ad_aw" value="${esc(SE.ads||'')}" placeholder="AW-123456789"></div><div class="fld"><label for="ad_ga">Google Analytics 4</label><input class="inp mono" id="ad_ga" value="${esc(SE.ga||'')}" placeholder="G-XXXXXXXXXX"></div><div class="fld"><label for="ad_gtm">Google Tag Manager (isteğe bağlı)</label><input class="inp mono" id="ad_gtm" value="${esc(SE.gtm||'')}" placeholder="GTM-XXXXXXX"></div></div>
    <div class="row2"><div class="fld"><label for="ad_fb">Meta (Facebook / Instagram) Pixel kimliği</label><input class="inp mono" id="ad_fb" value="${esc(SE.fb||'')}" placeholder="123456789012345"></div><div class="fld" style="justify-content:flex-end"><span class="muted" style="font-size:12px">TikTok ve diğer reklam ağlarının etiketlerini Google Tag Manager üzerinden ekleyebilirsiniz; dönüşümler GTM'e "yangpazar_satin" gibi olaylarla gönderilir.</span></div></div>
    <div class="convgrid">${CONV.map(([k,t,g])=>`<div class="fld"><label for="ad_c_${k}">${t} <span class="muted">(${g})</span></label><input class="inp mono" id="ad_c_${k}" value="${esc(C[k]||'')}" placeholder="dönüşüm etiketi"></div>`).join('')}</div>
    <div class="row2"><div class="fld"><label for="ad_as">AdSense yayıncı kimliği (sitede Google reklamı göstermek için)</label><input class="inp mono" id="ad_as" value="${esc(SE.adsense||'')}" placeholder="ca-pub-1234567890123456"></div><div class="fld" style="justify-content:flex-end"><span class="muted" style="font-size:12px">AdSense girilirse statik pakete ads.txt eklenir; reklamlar yönetim panelinde gösterilmez.</span></div></div>
  </div>${aSave('İzleme etiketlerini kaydet')}</form>`; }

/* ================== Pazarlama: UTM, Meta Pixel, kampanya raporu ================== */
(function(){ try{ const q=new URLSearchParams(location.search); const k=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','ttclid'].filter(x=>q.get(x)); if(!k.length) return; let cur=null; try{ cur=JSON.parse(localStorage.getItem('yangpazar_src')||'null'); }catch(e){}
  if(cur&&Date.now()-cur.t<30*86400000) return; const src={s:q.get('utm_source')||(q.get('gclid')?'google':q.get('fbclid')?'facebook':q.get('ttclid')?'tiktok':''),m:q.get('utm_medium')||(q.get('gclid')||q.get('fbclid')||q.get('ttclid')?'cpc':''),c:q.get('utm_campaign')||'',ct:q.get('utm_content')||'',t:Date.now(),lp:location.pathname+location.hash};
  try{ localStorage.setItem('yangpazar_src',JSON.stringify(src)); }catch(e){} }catch(e){} })();
const curSrc = () => { try{ return JSON.parse(localStorage.getItem('yangpazar_src')||'null'); }catch(e){ return null; } };
function ensurePixel(){ const SE=S.set.seo; if(!SE||!isLive()||!SE.fb||!/^\d{8,20}$/.test(SE.fb)||isPanel()) return false; if(!window.fbq){
    const n=window.fbq=function(){ n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments); }; if(!window._fbq) window._fbq=n; n.push=n; n.loaded=true; n.version='2.0'; n.queue=[];
    const t=document.createElement('script'); t.async=true; t.src='https://connect.facebook.net/en_US/fbevents.js'; document.head.appendChild(t); fbq('init',SE.fb); } return true; }
const FBEV={uye:'CompleteRegistration',satin:'Purchase',ep:'Purchase',yukleme:'AddPaymentInfo',ilan:'Lead'};
const UTM_PRE=[['google','cpc','Google Ads'],['facebook','paid_social','Facebook reklam'],['instagram','paid_social','Instagram reklam'],['tiktok','paid_social','TikTok reklam'],['x','paid_social','X (Twitter) reklam'],['youtube','video','YouTube / yayıncı'],['twitch','sponsor','Twitch / Kick yayıncı'],['discord','community','Discord'],['forum','referral','Forum'],['telegram','social','Telegram kanalı'],['whatsapp','social','WhatsApp grubu']];
function utmUrl(pg,src,med,camp,ct){ const u=new URL(siteBase()+(S.set.seo.clean?routeToPath(pg):'/')); if(src) u.searchParams.set('utm_source',src); if(med) u.searchParams.set('utm_medium',med); if(camp) u.searchParams.set('utm_campaign',slugify(camp)); if(ct) u.searchParams.set('utm_content',slugify(ct)); return u.toString()+(S.set.seo.clean||pg==='home'?'':'#'+pg); }
function campRows(){ const M={}; S.users.filter(u=>!u.admin&&!u.staff).forEach(u=>{ const s=u.src; const k=s&&s.s?`${s.s} / ${s.m||'-'}${s.c?' / '+s.c:''}`:'Doğrudan / organik'; const r=M[k]=M[k]||{k,u:0,buyers:0,rev:0,dep:0};
    r.u++; const O=S.orders.filter(o=>o.buyer===u.id&&o.status!=='iptal'); if(O.length) r.buyers++; r.rev+=O.reduce((a,o)=>a+o.total,0)+S.epOrders.filter(o=>o.u===u.id).reduce((a,o)=>a+o.price,0); r.dep+=(S.deposits||[]).filter(d=>d.u===u.id&&d.status==='onay').reduce((a,d)=>a+(+d.amount||0),0); });
  return Object.values(M).sort((a,b)=>b.rev-a.rev); }
function adCopies(){ const c=S.set.commission, nm=S.set.siteName, wf=S.set.wdFee&&S.set.wdFee.on; return [
  ['Google arama · başlıklar (en fazla 30 karakter)',[`${nm} · Metin2 Pazarı`,`Komisyon Sadece %${c}`,wf?'Hızlı Para Çekimi':'Para Çekimi Ücretsiz','Stoklu İlan, Tek Seferde Satış','Ödemen Teslime Kadar Güvende','Metin2 Yang ve Won Al Sat','Tüm PVP Serverlar Tek Yerde','EP Kodu Anında Teslim']],
  ['Google arama · açıklamalar (en fazla 90 karakter)',[`Item, yang, EP ve karakter alım satımı. Ödemen teslim onaylanana kadar güvenli havuzda.`,`Satıcıya düşük komisyon: %${c}. ${wf?'Kazancını hızlıca çek.':'Para çekimi ücretsiz.'} Stoklu ilanla tek ilanla çok satış.`,`TR ve PVP serverlarında binlerce ilan. Kanal ve teslimat yeri seç, güvenle al.`]],
  ['Sosyal medya (Instagram / TikTok / Facebook)',[`Her satışta yeni ilan açmaktan sıkılmadın mı? ${nm}'da stoklu ilan ver, stok bitene kadar satılsın. Komisyon sadece %${c}${wf?'':', para çekimi ücretsiz'}.`,`Metin2'de dolandırılmaktan korkma: ödemen sen onaylayana kadar havuzda bekler. ${nm} · güvenli item, yang ve EP pazarı.`]]].map(([t,L])=>[t,L.map(x=>[x,x.length])]); }
function mktAdmin(){ const R=campRows(), paid=R.filter(r=>r.k!=='Doğrudan / organik'), pg=[['home','Ana sayfa'],['yang-fiyatlari','Yang fiyatları'],['borsa','Yang Borsası'],['metin2-ep','Metin2 EP'],['ilan-ver','İlan ver'],['ortaklik','Ortaklık'],...S.servers.slice().sort((a,b)=>a.name.localeCompare(b.name,'tr')).map(s=>['server-'+s.id,s.name])];
  return `<div class="kpis"><div class="kpi hl"><small>Reklamdan gelen üye</small><b>${paid.reduce((a,r)=>a+r.u,0)}</b></div>${can('panel')?`<div class="kpi"><small>Reklamdan gelen ciro</small><b>${TL(paid.reduce((a,r)=>a+r.rev,0))}</b></div>`:''}<div class="kpi"><small>Kaynak / kampanya</small><b>${paid.length}</b></div><div class="kpi"><small>Bağlı reklam araçları</small><b>${[S.set.seo.ads,S.set.seo.ga,S.set.seo.fb,S.set.seo.gtm].filter(Boolean).length}/4</b></div></div>
  <div class="note note-info hstack" style="justify-content:space-between;font-size:13px"><span>Google Ads, TikTok, Meta etiket kurulumu ve Google, YouTube, Instagram, TikTok, X, Discord, forum ve yayıncı reklamlarının adım adım rehberi bu sayfanın altındaki <b>Kurulum rehberi</b>nde.</span><button type="button" class="btn btn-sm" data-act="adm-scroll" data-to="adm-rehber">Kurulum rehberine git</button></div>
  <div class="panel"><div class="panel-h"><h3>Reklam bağlantısı oluştur (UTM)</h3></div><div class="panel-b stack"><span class="muted" style="font-size:12.5px">Google, Instagram, TikTok, YouTube, Discord ya da forumda verdiğiniz her reklamın bağlantısını buradan oluşturun. Bu bağlantıdan gelip üye olanlar ve yaptıkları alışveriş aşağıdaki raporda kampanyaya göre ayrılır.</span>
    <div class="row3"><div class="fld"><label for="ut_p">Açılacak sayfa</label><select class="inp" id="ut_p" data-change="utm">${pg.map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></div><div class="fld"><label for="ut_s">Reklam yeri</label><select class="inp" id="ut_s" data-change="utm">${UTM_PRE.map(([s,m,t],i)=>`<option value="${i}">${t}</option>`).join('')}</select></div><div class="fld"><label for="ut_c">Kampanya adı</label><input class="inp" id="ut_c" data-change="utm" placeholder="kasim-dusuk-komisyon"></div></div>
    <div class="cprow"><span class="mono" id="ut_out" style="font-size:12.5px;overflow-wrap:anywhere;min-width:0">${esc(utmUrl('home','google','cpc',''))}</span><button type="button" class="btn btn-sm" data-act="copy" id="ut_cp" data-v="${esc(utmUrl('home','google','cpc',''))}">Kopyala</button></div></div></div>
  <div class="panel"><div class="panel-h"><h3>Kampanya raporu</h3><span class="muted" style="font-size:12px">İlk geldiği kaynağa göre (30 gün)</span></div>${R.length?`<div class="tbl-w"><table class="tbl"><thead><tr><th>Kaynak / ortam / kampanya</th><th class="num">Üye</th><th class="num">Alışveriş yapan</th><th class="num">Dönüşüm</th>${can('panel')?'<th class="num">Ciro</th>':''}</tr></thead><tbody>${R.map(r=>`<tr><td><b>${esc(r.k)}</b></td><td class="num">${r.u}</td><td class="num">${r.buyers}</td><td class="num">%${r.u?Math.round(r.buyers/r.u*100):0}</td>${can('panel')?`<td class="num mono">${TL(r.rev)}</td>`:''}</tr>`).join('')}</tbody></table></div>`:emptyBox('Henüz veri yok','')}</div>
  <div class="panel"><div class="panel-h"><h3>Hazır reklam metinleri</h3><span class="muted" style="font-size:12px">Komisyon ve çekim ücreti ayarlarınızdan otomatik</span></div><div class="panel-b stack">${adCopies().map(([t,L])=>`<div class="stack" style="gap:6px"><b style="font-size:13px">${t}</b>${L.map(([x,n])=>`<div class="cprow" style="font-size:13px"><span style="min-width:0">${esc(x)} <small class="muted">(${n})</small></span><button type="button" class="btn btn-sm" data-act="copy" data-v="${esc(x)}">Kopyala</button></div>`).join('')}</div>`).join('')}
    <span class="muted" style="font-size:12px">Reklam vermeden önce Google ve Meta'nın oyun içi para / dijital ürün reklam politikalarını kontrol edin; rakip firma adı kullanmayın, karşılaştırmayı genel ifadelerle yapın.</span></div></div>`; }

