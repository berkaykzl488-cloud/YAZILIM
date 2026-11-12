function toast(m,bad){const d=document.createElement('div');d.className='toast'+(bad?' bad':'');d.textContent=m;$('#toasts').appendChild(d);setTimeout(()=>d.remove(),3400)}

/* ================== parçalar ================== */
function logo(s,sz){ if(!s) return '<span class="gbadge">?</span>'; const ini=s.name.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g,'').slice(0,2).toLocaleUpperCase('tr-TR'); return `<span class="slogo" style="--c1:${s.c[0]};--c2:${s.c[1]};--sz:${sz||40}px">${esc(ini)}</span>`;}
function av(u){return `<span class="av">${esc((u.name||'?')[0].toLocaleUpperCase('tr-TR'))}</span>`}
function stars(n){n=Math.round(n||0);return '★★★★★'.slice(0,n)+'☆☆☆☆☆'.slice(0,5-n)}
function lsub(l){ if(l.game==='metin2'){const s=srv(l.server); return s?s.name:(l.sec==='tr'?'Tüm TR serverları':'Metin2');} if(l.game==='cs2') return 'CS2'; return l.sub||'Diğer'; }
function lthumb(l,sz){
  if(l.game==='metin2') return srv(l.server)?logo(srv(l.server),sz||40):`<span class="slogo" style="--c1:#6d1f9a;--c2:#e8962a;--sz:${sz||40}px">EP</span>`;
  if(l.game==='cs2') return `<span class="gbadge" style="color:${RAR[l.skin.r]}">${skinArt(l,'width:34px;max-height:34px')}</span>`;
  return `<span class="gbadge">${esc((l.sub||'?').slice(0,2).toUpperCase())}</span>`;
}
function row(l){
  const u=user(l.seller);
  return `<a href="#ilan-${l.id}" class="lcard ${on(l,'vitrin')?'is-vitrin':''} ${on(l,'renk')?'is-renk':''}">
    <span class="lc-cov">${lcover(l)}${on(l,'acil')?'<span class="badge b-acil">Acil</span>':on(l,'vitrin')?'<span class="badge b-vitrin">Vitrin</span>':''}</span>
    <span class="lc-b"><span class="lc-m">${esc(lsub(l))} · ${catName(l)}</span><b class="lc-t">${esc(l.title)}</b>
      <span class="lc-s">${esc(u.name)} ${u.verified?'<span class="vchk">✔</span>':''} · <span class="stars">★</span> ${(+u.rating).toFixed(1)}</span>
      <span class="lc-p"><b>${TL(l.price)}</b><small>${unitOf(l)==='Won'?'1 Won · ':''}Stok ${NUM(l.stock)} · ${esc(l.del)}</small></span></span>
  </a>`;
}
function skinTile(l){
  const k=l.skin, c=RAR[k.r]||'#888';
  return `<a href="#ilan-${l.id}" class="skin" style="--r-c:${c}">
    ${on(l,'acil')?'<span class="badge b-acil">Acil</span>':on(l,'vitrin')?'<span class="badge b-vitrin">Vitrin</span>':''}
    <div class="skin-art">${skinArt(l)}</div>
    <div class="skin-b">
      <div class="skin-w"><span title="${WEAR[k.wear]}">${k.wear}</span><span class="mono">${k.fl.toFixed(4)}</span></div>
      <div class="fbar" style="--f:${Math.min(k.fl*100,99)}%"><i></i></div>
      <div class="skin-n">${k.st?'<em>StatTrak™</em> ':''}${esc(l.title)}</div>
      <div class="skin-p">${TL(l.price)}</div>
    </div></a>`;
}
/* ilanlar yayın tarihine göre (en yeni üstte); EP ilanları fiyata göre (ucuzdan pahalıya) */
function sortL(arr,mode){ const a=[...arr]; const dt=(x,y)=>(y.bump||y.t)-(x.bump||x.t); return mode==='ucuz'?a.sort((x,y)=>(x.price-y.price)||dt(x,y)):a.sort(dt); }
const active = () => S.listings.filter(l=>l.status==='aktif' && l.stock>0 && l.game==='metin2' && !(l.game==='metin2'&&l.cat==='ep'&&(secOf(l)==='tr'||!S.set.pvpEpOn)));
function emptyBox(t,s,btn){return `<div class="empty"><b>${t}</b>${s}${btn?`<div style="margin-top:12px">${btn}</div>`:''}</div>`}
function cdBox(t){const d=Math.max(0,t-now()); const g=Math.floor(d/D),h=Math.floor(d%D/H),m=Math.floor(d%H/60000),s=Math.floor(d%60000/1000); return `<div class="cd" data-cd="${t}"><span><b>${g}</b>gün</span><span><b>${String(h).padStart(2,'0')}</b>saat</span><span><b>${String(m).padStart(2,'0')}</b>dk</span><span><b>${String(s).padStart(2,'0')}</b>sn</span></div>`}

/* ================== kabuk ================== */
function renderStrip(){
  const ads=liveAds('text');
  ads.forEach(adImp); const items=ads.map(a=>`<a href="#server-${a.server}" data-adc="${a.id}"><b>★</b> ${esc(a.text)}</a>`).join('');
  const role=u=>u.admin?'Yönetici':u.staff?esc(u.name)+' (çalışan)':esc(u.name)+(u.id==='u2'?' (alıcı)':' (satıcı)');
  const opts=S.users.map(u=>`<option value="${u.id}" ${S.cur===u.id?'selected':''}>${role(u)}</option>`).join('');
  $('#strip').innerHTML=`<div class="strip"><div class="wrap">
    <span class="strip-tag">Reklam</span>
    <div class="marquee"><div class="marquee-in">${items||'<a href="#reklam-ver">Bu şeritte reklamınız yer alabilir. <b>Reklam Ver →</b></a>'}</div></div>
    ${S.set.demoMode===false&&!(me()&&me().admin)?'':`<label class="demo-sw" for="demoUser">Demo hesap <select id="demoUser" data-change="switch"><option value="">Çıkış yapmış</option>${opts}</select></label>`}
  </div></div>`;
}
function renderFooter(){
  $('#ftr').innerHTML=`<div class="wrap"><div class="fgrid">
    <div><a href="#home" class="brand" style="color:var(--hdr-fg)">${ICO.han}<span>${esc(S.set.siteName)}</span></a>
      <p style="max-width:34ch">Alıcı ile satıcı arasında aracı olan güvenli ilan pazarı. Ödemeniz, ürünü teslim aldığınızı onaylayana kadar havuzda bekler.</p>
      <div class="pays">${S.gws.filter(g=>g.on).map(g=>`<span>${esc(g.n)}</span>`).join('')}</div>${etbisBadge()}</div>
    <div><h4>Pazar</h4><a href="#metin2-tr">Metin2 TR Won & EP</a><a href="#metin2-pvp">Metin2 PVP Serverlar</a><a href="#metin2-ep">Metin2 EP</a><a href="#borsa">Yang Borsası</a><a href="#ortaklik">Ortaklık & Partner</a></div>
    <div><h4>Popüler serverlar</h4>${S.servers.map(x=>[x,active().filter(l=>l.server===x.id).length]).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([x])=>`<a href="#server-${x.id}">${esc(x.name)}</a>`).join('')}</div>
    <div><h4>Rehber</h4>${posts().slice(0,4).map(p=>`<a href="#rehber-${p.slug}">${esc(cut(p.title,38))}</a>`).join('')}<a href="#rehber">Tüm rehberler →</a></div>
    <div><h4>Kazan</h4><a href="#cekilis">Haftalık Çekiliş</a><a href="#cekilis">Günlük Şans Çarkı</a><a href="#hesabim" data-act="tab" data-t="puan">VIP & Puan</a><a href="#hesabim" data-act="tab" data-t="davet">Davet Et Kazan</a></div>
    <div><h4>Yardım</h4><a href="#guvenli">Güvenli Alışveriş & SSS</a><a href="#home" data-act="ls-open">Canlı Destek</a><a href="#sayfa-kvkk">KVKK Aydınlatma Metni</a><a href="#sayfa-mesafeli">Mesafeli Satış Sözleşmesi</a><a href="#sayfa-iletisim">İletişim</a></div>
  </div><div class="fbot"><span>© 2026 ${esc(S.set.siteName)} · Tüm hakları saklıdır.</span><span>Altyapı: Lisay Yazılım</span></div></div>`;
}

/* ================== ana sayfa ================== */
function vHome(){
  const sl=[...S.slides.filter(x=>x.on).map(x=>({...x,site:true})),...liveAds('slider')];
  const prem=liveAds('premium').map(a=>a.server);
  const tr=S.servers.filter(s=>s.sec==='tr');
  const vit=sortL(active().filter(l=>on(l,'vitrin')&&l.game!=='cs2'));
  const latest=sortL(active().filter(l=>l.game!=='cs2'),'yeni').slice(0,8);
  const skins=sortL(active().filter(l=>l.game==='cs2')).slice(0,8);
  const ban=liveAds('banner');
  const alt=S.packs.altbanner?liveAds('altbanner')[0]:null;
  const rf=activeRaffles().sort((a,b)=>b.value-a.value)[0];
  return `<div class="wrap home">
  <aside class="col lcol">
    <div class="panel"><div class="panel-h"><h3>Metin2 TR</h3><a href="#metin2-tr">Tümü</a></div><div class="slist"><a href="#metin2-ep" class="sitem"><span class="slogo" style="--c1:#6d1f9a;--c2:#e8962a;--sz:34px">EP</span><div style="min-width:0"><div class="n">Metin2 EP</div><div class="m">${hhOn()?'<b style="color:var(--ok)">Happy Hour +%'+S.set.hh.pct+'</b>':'Anında kod · site satıcı'}</div></div></a>${tr.map(s=>sItem(s)).join('')}</div></div>
    ${exMini()}
    <div class="panel"><div class="panel-h"><h3>Premium PVP</h3><span class="sponsor">Sponsorlu</span></div>
      <div class="slist">${prem.map(id=>srv(id)).filter(Boolean).map(s=>sItem(s,true)).join('')||'<div class="empty">Boş alan</div>'}</div>
      <div class="panel-b" style="padding-top:0"><a href="#reklam-ver" class="btn btn-sm btn-block" data-act="pick-ad" data-type="premium">Server'ını buraya taşı</a></div></div>
  </aside>
  <section class="col mcol">
    ${sl.length?`<div class="slider" id="slider"><div class="slides" style="transform:translateX(-${(ui.slide%sl.length)*100}%)">${sl.map(a=>{if(a.site) return siteSlide(a); const s=srv(a.server)||{name:a.title,c:['#333','#666']};adImp(a);return `<div class="slide" data-adc="${a.id}" style="--c1:${s.c[0]};--c2:${s.c[1]}">${adMedia(a)}${logo(s,92)}<div><span class="sponsor">Sponsorlu${s.type&&s.type!=='PVP'?' · '+esc(s.type):''}${s.lv?' · '+esc(s.lv):''}</span><h2>${esc(s.name)}</h2><p><b>${esc(a.title)}</b> — ${esc(a.text)}</p><div class="hstack"><a class="btn btn-primary" href="#server-${s.id}">Server'ı İncele</a><a class="btn" href="#server-${s.id}">İlanları Gör</a></div></div></div>`}).join('')}</div>
      <div class="dots">${sl.map((_,i)=>`<button data-act="slide" data-i="${i}" class="${i===ui.slide%sl.length?'on':''}" aria-label="Reklam ${i+1}"></button>`).join('')}</div></div>`
      :`<a href="#reklam-ver" class="ban-empty" style="aspect-ratio:auto;min-height:200px"><b>Ana sayfa slider boş</b>Server'ını binlerce oyuncuya göster.</a>`}
    ${hhOn()?hhBand():''}
    <div class="promo">
      <a href="#cekilis" class="p1"><span class="pi">${ICO.gift}</span><span style="min-width:0"><b>${rf?esc(rf.title):'Haftalık çekiliş'}</b><small>${rf?`Çekilişe ${left(rf.end)} kaldı · Her 100 TL alışveriş 1 bilet`:'Yakında yeni çekiliş'}</small></span><span class="go">Katıl</span></a>
      <a href="#cekilis" class="p2"><span class="pi">${ICO.wheel}</span><span style="min-width:0"><b>Günlük şans çarkı</b><small>Her gün ücretsiz çevir, 50 TL'ye kadar bakiye kazan</small></span><span class="go">Çevir</span></a>
    </div>
    <div class="trust">
      <div>${ICO.shield}<span><b>Paranız havuzda</b>Teslim edilmeyen siparişi destek ekibimiz inceleyip iptal ve iade eder.</span></div>
      <div>${ICO.bolt}<span><b>Hızlı teslimat</b>Won ve yang siparişlerinde ortalama teslim 9 dakika.</span></div>
      <div>${ICO.chat}<span><b>${esc(S.set.supportHours)} canlı destek</b>Her siparişte itiraz hakkı ve destek ekibi.</span></div>
    </div>
    <div class="panel"><div class="panel-h"><h2>Vitrin İlanları</h2><a href="#metin2-tr">Serverlara göz at →</a></div>
      <div class="lrows">${vit.map(row).join('')||emptyBox('Vitrinde ilan yok','İlanınızı vitrine çıkarmak için ilan verirken Vitrin dopingini seçin.')}</div></div>
    <div class="panel"><div class="panel-h"><h2>Son Eklenen İlanlar</h2><a href="#ilan-ver">+ Sen de ilan ver</a></div>
      <div class="lrows">${latest.map(row).join('')}</div></div>
  </section>
  <aside class="col rcol">
    ${ban.map(bannerHtml).join('')}
    <a href="#reklam-ver" class="ban-empty" data-act="pick-ad" data-type="banner"><span class="sponsor">300 × 250</span><b>Reklam alanı</b>Haftalık ${TL(S.packs.banner.p[1])}<span class="btn btn-sm btn-primary">Reklam Ver</span></a>
    <div class="panel"><div class="panel-h"><h3>Neden ${esc(S.set.siteName)}?</h3></div><div class="why">
      <div><i>1</i><span><b>Havuz güvencesi</b>Para, siz onaylayana kadar satıcıya geçmez.</span></div>
      <div><i>2</i><span><b>VIP komisyon indirimi</b>Satış hacmin arttıkça komisyon %${S.set.commission}'den %${S.set.commission-VIP[VIP.length-1].disc}'e iner.</span></div>
      <div><i>3</i><span><b>Her alışverişe puan</b>Harcamanın %2'sine kadar puan, bakiyeye çevrilir.</span></div>
      <div><i>4</i><span><b>Çekiliş ve şans çarkı</b>Item ve bakiye ödülleri, her gün ücretsiz çevirme.</span></div>
      <div><i>5</i><span><b>Davet et kazan</b>Getirdiğin her arkadaş için ${TL(S.set.refBonus)}.</span></div></div></div>
    ${alt?altBannerHtml(alt):S.packs.altbanner?`<a href="#reklam-ver" class="ban-empty altban-empty" data-act="pick-ad" data-type="altbanner"><span class="sponsor">300 × 600</span><b>Reklam alanı</b>Haftalık ${TL(S.packs.altbanner.p[1])}<span class="btn btn-sm btn-primary">Reklam Ver</span></a>`:''}
  </aside></div>`;
}
function sItem(s,prem){
  const open=s.open>now(); const cnt=active().filter(l=>l.server===s.id).length;
  const right = s.sec==='tr' ? `<span class="o" style="color:var(--muted)">${cnt} ilan</span>` : `<span class="o">${open?'<span style="color:var(--warn)">'+left(s.open)+'</span>':'<span style="color:var(--muted)">'+cnt+' ilan</span>'}</span>`;
  return `<a href="#server-${s.id}"${prem?premAttr(s.id):''} class="sitem ${prem?'prem':''}">${logo(s,34)}<div style="min-width:0"><div class="n">${esc(s.name)}</div><div class="m">${s.sec==='tr'?'Resmi · Won, item, karakter':esc(s.lv)+' · '+esc(s.type)}</div></div>${right}</a>`;
}
function renderSide(r){ let L=$('#sideL'), R=$('#sideR'); if(!L){ document.body.insertAdjacentHTML('beforeend','<aside id="sideL" class="sidead l" aria-label="Reklam"></aside><aside id="sideR" class="sidead r" aria-label="Reklam"></aside>'); L=$('#sideL'); R=$('#sideR'); }
  if(window.YANGPAZAR_API||(r||'').startsWith('widget-')||(maintOn()&&!isPanel())||!S.packs.yan){ L.innerHTML=R.innerHTML=''; return; }
  const P=S.packs.yan, a=liveAds('yan')[0];
  if(!a){ const e=`<a href="#reklam-ver" class="sidead-in sa-empty" data-act="pick-ad" data-type="yan"><span class="sponsor">160 × 600</span><b>Reklam alanı</b><small>Sağ ve sol birlikte</small><span class="sa-p">Haftalık<br><b>${TL(P.p[1])}</b></span><span class="btn btn-sm btn-primary">Reklam Ver</span></a>`; L.innerHTML=e; R.innerHTML=e; return; }
  const s=srv(a.server)||{name:a.title||'Reklam',c:['#333','#777'],id:''}; adImp(a);
  const h=`<a href="${s.id?'#server-'+s.id:'#home'}" data-adc="${a.id}" class="sidead-in" style="--c1:${s.c[0]};--c2:${s.c[1]}">${adMedia(a)}<span class="sponsor">Reklam</span>${logo(s,46)}<b>${esc(a.title||s.name)}</b><p>${esc(a.text||'')}</p><span class="sa-cta">İncele →</span></a>`;
  L.innerHTML=h; R.innerHTML=h; }
function altBannerHtml(a){const s=srv(a.server)||{name:a.title,c:['#333','#777'],id:''}; adImp(a); return `<a href="#server-${s.id}" data-adc="${a.id}" class="ban altban" style="--c1:${s.c[0]};--c2:${s.c[1]}">${adMedia(a)}${logo(s,76)}<span class="sponsor">Reklam</span>${s.type||s.lv?`<div class="altban-m">${s.type?`<span>${esc(s.type)}</span>`:''}${s.lv?`<span>${esc(s.lv)}</span>`:''}</div>`:''}<h3>${esc(a.title||s.name)}</h3><p>${esc(a.text)}</p><span class="altban-go">Server'a git →</span></a>`}
function bannerHtml(a){const s=srv(a.server)||{name:a.title,c:['#333','#777'],id:''}; adImp(a); return `<a href="#server-${s.id}" data-adc="${a.id}" class="ban" style="--c1:${s.c[0]};--c2:${s.c[1]}">${adMedia(a)}${logo(s,54)}<span class="sponsor">Reklam</span><h3>${esc(a.title||s.name)}</h3><p>${esc(a.text)}</p></a>`}

/* ================== Metin2 server listeleri ================== */
const sqNorm = v => String(v||'').toLocaleLowerCase('tr-TR').replace(/\s+/g,'');

function egpApply(v){
  ui.egpQ = v; if($('.wdtbl')) admRepl({q:v||null}); const q = sqNorm(v); let n = 0;
  document.querySelectorAll('.wdtbl tbody tr').forEach(tr => {
    const hay = tr.dataset.hay || '';
    const ok = !q || hay.includes(q);
    tr.hidden = !ok;
    if(ok) n++;
  });
  const emp = document.querySelector('#egp_empty'); if(emp) emp.hidden = n > 0 || !q;
  const cnt = document.querySelector('#egp_cnt'); if(cnt) cnt.textContent = q ? `"${v}" için ${n} sonuç` : n+' talep';
}

function sqApply(v){ ui.f.sq=v; const q=sqNorm(v); let n=0; document.querySelectorAll('.sgrid .scard').forEach(c=>{ const ok=!q||c.dataset.sn.includes(q); c.hidden=!ok; if(ok) n++; }); const e=document.querySelector('#sq_empty'); if(e) e.hidden=n>0; const c=document.querySelector('#sq_n'); if(c) c.textContent=q?n+' server bulundu':''; }
function vM2(sec){
  const prem=liveAds('premium').map(a=>a.server);
  const q=sqNorm(ui.f.sq);
  let list=S.servers.filter(s=>s.sec===sec);
  list=sec==='pvp'?list.sort((a,b)=>(prem.includes(b.id)-prem.includes(a.id))||a.name.localeCompare(b.name,'tr')):list;
  const n={tr:S.servers.filter(s=>s.sec==='tr').length,pvp:S.servers.filter(s=>s.sec==='pvp').length};
  const EP=epFor(null).filter(p=>p.on); const epLow=[...EP].sort((a,b)=>a.price-b.price)[0];
  return `<div class="wrap"><div class="page-h"><div><h1>${secName(sec)}</h1><p>${sec==='tr'?'Resmi Metin2 Türkiye sunucuları · Won, item ve karakter':'Private serverlar · Yang, EP, item ve karakter'} — server seçin, kategoriyi seçin, aradığınızı bulun.</p></div>${sec==='pvp'?'<a href="#reklam-ver" class="btn btn-primary" data-act="pick-ad" data-type="premium">Server\'ını Ekle</a>':''}</div>
  <div class="secsw"><a href="#metin2-tr" class="${sec==='tr'?'on':''}"><b>Metin2 TR</b><span>${n.tr} resmi sunucu · Won ile satış</span></a><a href="#metin2-pvp" class="${sec==='pvp'?'on':''}"><b>Metin2 PVP</b><span>${n.pvp} private server · Yang ile satış</span></a></div>
  <div class="fld" style="max-width:360px;margin-bottom:14px"><label for="f_sq">Server ara</label><input class="inp" id="f_sq" type="search" autocomplete="off" value="${esc(ui.f.sq||'')}" placeholder="Server adı yazın"><span class="muted" style="font-size:12px" id="sq_n" aria-live="polite">${q?list.filter(s=>sqNorm(s.name).includes(q)).length+' server bulundu':''}</span></div>
  <div class="sgrid">${list.map(s=>srvCard(s,prem.includes(s.id)).replace('class="scard"',`class="scard" data-sn="${esc(sqNorm(s.name))}"${q&&!sqNorm(s.name).includes(q)?' hidden':''}`)).join('')}</div><div id="sq_empty" ${list.some(s=>!q||sqNorm(s.name).includes(q))?'hidden':''}>${emptyBox('Server bulunamadı','Aramanızı değiştirin.')}</div></div>`;
}
function vEp(){
  const P=epFor(null).filter(p=>p.on).sort((a,b)=>a.price-b.price); const h=S.set.hh;
  return `<div class="wrap"><div class="crumbs"><a href="#home">Ana Sayfa</a> › <a href="#metin2-tr">Metin2 TR</a> › Metin2 EP</div>
  <div class="page-h"><div><h1>Metin2 EP</h1><p>Ejderha Parası kuponları yalnızca ${esc(S.set.siteName)} tarafından satılır ve tüm Metin2 TR serverlarında geçerlidir. Kod, ödeme anında otomatik teslim edilir.</p></div></div>
  ${hhOn()?`<div class="hhbig"><div><span class="eyebrow" style="color:#fff">Oyunda Happy Hour aktif</span><h2>Aynı fiyata %${h.pct} fazla EP</h2><p>Kodu Happy Hour sırasında oyunda kullandığınızda fazladan EP hesabınıza geçer.${h.until?' Bitişe '+left(h.until)+' kaldı.':''}</p></div>${h.until?cdBox(h.until):''}</div>`:''}
  <div class="epgrid">${P.map(epCard).join('')||emptyBox('Şu an EP satışı yok','Kısa süre içinde tekrar bakın.')}</div>
  <div class="trust" style="margin-top:16px"><div>${ICO.bolt}<span><b>Anında teslim</b>Ödemeden sonra kod ekrana gelir ve Hesabım › EP kodlarım'da saklanır.</span></div><div>${ICO.shield}<span><b>Resmi kupon</b>Kodlar yalnızca sitemiz tarafından satılır, üye ilanı yoktur.</span></div><div>${ICO.chat}<span><b>Kod çalışmazsa</b>Canlı destekten kod numarasıyla yazın, hemen yenisini verelim.</span></div></div></div>`;
}
function mEpBuy(id){ const u=me(); if(!u) return mLogin(); const p=S.epProducts.find(x=>x.id===id); const hh=hhOn()&&p.hh;
  modal(mWrap('EP satın al',`<div class="sum"><div><span>Ürün</span><b>${hh?`<s class="muted">${NUM(p.ep)} EP</s> `:''}${NUM(epAmt(p))} EP</b></div>${hh?`<div><span class="muted">Happy Hour bonusu</span><span class="pos">+%${S.set.hh.pct} EP</span></div>`:''}<div class="tot"><span>Ödenecek</span><span class="mono">${TL(p.price)}</span></div><div><span class="muted">Bakiyeniz</span><span class="mono">${TL(avail(u))}</span></div></div>
    ${avail(u)>=p.price?`<form data-form="epbuy" data-id="${p.id}" class="stack"><div class="note note-info">Kod ödemeden hemen sonra ekranda gösterilir. Kodu ${p.srv?esc(epName(p))+' için oyunda':'oyunda Nesne Market › Kupon bölümünden'} kullanın.</div><button class="btn btn-primary">Öde ve kodu al · ${TL(p.price)}</button></form>`:`<div class="note note-bad">Bakiyeniz yetersiz. <b>${TL(p.price-avail(u))}</b> daha yükleyin.</div><button class="btn btn-primary" data-act="deposit">Bakiye Yükle</button>`}`)); }
function mEpCode(o){ modal(mWrap('Kodunuz hazır',`<div class="note note-ok"><b>${NUM(o.epShown)} EP</b> kodunuz teslim edildi${o.hh?' (Happy Hour)':''}.</div><div class="cprow"><span class="mono" style="font-size:17px;font-weight:700">${esc(o.code)}</span><button class="btn btn-sm" data-act="copy" data-v="${esc(o.code)}">Kopyala</button></div><span class="muted" style="font-size:12.5px">Kodunuz Hesabım › EP kodlarım bölümünde de saklanır.${o.hh?' Happy Hour bitmeden kullanırsanız fazladan EP hesabınıza geçer.':''}</span><button class="btn btn-primary" data-act="close">Tamam</button>`)); }
function srvCard(s,prem){
  const open=s.open>now(); const L=active().filter(l=>l.server===s.id);
  const won=L.filter(l=>l.cat==='yang').sort((a,b)=>a.price-b.price)[0];
  return `<a href="#server-${s.id}"${prem?premAttr(s.id):''} class="scard" style="--c1:${s.c[0]};--c2:${s.c[1]}"><div class="scard-top">${logo(s,56)}${prem?'<span class="sponsor">Premium</span>':s.sec==='tr'?'<span class="sponsor">Resmi</span>':s.partner?'<span class="sponsor">Partner</span>':''}</div>
    <div class="scard-b"><h3>${esc(s.name)} ${newTag(s)}</h3>
    <div class="chips">${s.sec==='tr'?'<span class="chip">Metin2 TR</span>':`${s.lv?`<span class="chip">${esc(s.lv)}</span>`:''}${s.type&&s.type!=='PVP'?`<span class="chip">${esc(s.type)}</span>`:''}${open?`<span class="chip warn">${left(s.open)} sonra açılıyor</span>`:''}`}</div>
    <div class="m">${(s.sec==='tr'||!S.set.pvpEpOn?['yang','item','karakter']:M2CAT).map(c=>`${catLabel(c,s.sec)} ${L.filter(l=>l.cat===c).length}`).join(' · ')}</div>
    <div class="m" style="margin-top:auto"><b style="color:var(--fg)">${L.length}</b> aktif ilan</div></div></a>`;
}
function vServer(id,cat){
  const s=srv(id); if(!s) return vNotFound();
  const CATS=s.sec==='tr'||!S.set.pvpEpOn?['yang','item','karakter']:M2CAT; if(cat&&cat!=='hepsi'&&!CATS.includes(cat)&&!(cat==='ep'&&srvEp(s))) cat=null; const cl=c=>c==='hepsi'?'Tüm ilanlar':c==='ep'?'EP':catLabel(c,s.sec);
  const open=s.open>now(); const all=active().filter(l=>l.server===id);
  const CD={yang:s.sec==='tr'?'1 Won = 100M yang · anında teslim':'100M bazında yang satışı',ep:'Server nesne market parası',item:'Silah, zırh, takı, simya, kostüm',karakter:'Hazır karakter ve hesaplar'};
  const hero=`<div class="shero ${cat?'sm':''}" style="--c1:${s.c[0]};--c2:${s.c[1]}">${logo(s,cat?58:90)}<div style="flex:1;min-width:200px"><h1>${esc(s.name)}${cat?' · '+cl(cat):''}</h1>${cat?'':`<p>${esc(s.desc||'')}</p>`}
    <div class="chips" style="margin-top:8px"><span class="chip">${secName(s.sec)}</span>${s.sec==='pvp'?`${s.lv?`<span class="chip">${esc(s.lv)}</span>`:''}${s.type&&s.type!=='PVP'?`<span class="chip">${esc(s.type)}</span>`:''}${s.open?`<span class="chip">${open?'Açılış: '+dtstr(s.open):'Açıldı: '+dstr(s.open)}</span>`:''}`:''}<span class="chip">${all.length} aktif ilan</span></div></div>
    ${cat?'':`<div class="hstack shero-btns">${s.sec==='pvp'&&srvWeb(s.url)?`<a class="btn" style="background:#fff;color:#111;border-color:#fff" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Web sitesi ↗</a>`:''}<a class="btn" style="background:rgba(0,0,0,.3);color:#fff;border-color:rgba(255,255,255,.5)" href="#ilan-ver" data-act="sell-here" data-s="${s.id}">Bu servera ilan ver</a></div>`}</div>`;
  const crumbs=`<div class="crumbs"><a href="#home">Ana Sayfa</a> › <a href="#metin2-${s.sec}">${secName(s.sec)}</a> › ${cat?`<a href="#server-${s.id}">${esc(s.name)}</a> › ${cl(cat)}`:esc(s.name)}</div>`;
  if(!cat){
    const vit=sortL(all.filter(l=>on(l,'vitrin'))).slice(0,8); const top=sortL(all.filter(l=>!on(l,'vitrin'))).slice(0,8);
    return `<div class="wrap">${crumbs}${hero}
    <div class="eyebrow" style="margin-bottom:10px">Ne arıyorsunuz?</div>
    <div class="catcards"><a href="#server-${s.id}-hepsi" class="catcard callcard"><span class="ccov allcov"><b>${all.length}</b><span>ilan</span></span><h3>Tüm ilanlar</h3><span class="m">${esc(s.name)} serverındaki bütün ilanlar tek sayfada</span><span class="low"><span>${CATS.map(c=>cl(c)).join(' · ')}</span></span></a>${CATS.map(c=>{const L=all.filter(l=>l.cat===c); const low=[...L].sort((a,b)=>a.price-b.price)[0]; return `<a href="#server-${s.id}-${c}" class="catcard"><span class="ccov">${coverHtml(c+'-1')}</span><h3>${esc(s.name)} ${catLabel(c,s.sec)}</h3><span class="m">${CD[c]}</span><span class="low"><span>${L.length} ilan</span></span></a>`}).join('')}
    ${srvEp(s)?`<a href="#server-${s.id}-ep" class="catcard"><span class="ccov">${coverHtml('ep-2')}</span><h3>${esc(s.name)} EP</h3><span class="m">Site satıcı · ödeme anında otomatik kod teslimi</span><span class="low"><span>${epFor(s.id).filter(p=>p.on).length} paket</span></span></a>`:''}${s.sec==='tr'?`<a href="#metin2-ep" class="catcard"><span class="ccov">${coverHtml('ep-1')}</span><h3>Metin2 EP</h3><span class="m">Site satıcı · anında otomatik kod · tüm TR serverlarında geçerli</span><span class="low"><span>${epFor(null).filter(p=>p.on).length} paket</span>${hhOn()?'<span><b>Happy Hour +%'+S.set.hh.pct+'</b></span>':''}</span></a>`:''}</div>
    <div style="margin-top:18px">${vitPanel(vit,esc(s.name)+' vitrini')}</div>
    <div class="panel" style="margin-top:18px"><div class="panel-h" style="flex-wrap:wrap"><h2>Öne çıkan ilanlar</h2><a class="btn btn-sm" href="#server-${s.id}-hepsi">Tüm ilanları gör →</a></div><div class="lrows">${top.map(row).join('')||emptyBox('Bu serverda henüz ilan yok','İlk ilanı vererek alıcılara ulaşın.','<a class="btn btn-primary" href="#ilan-ver">İlan Ver</a>')}</div></div></div>`;
  }
  if(cat==='ep'){ const P=epFor(s.id).filter(p=>p.on).sort((a,b)=>a.price-b.price);
    return `<div class="wrap">${crumbs}${hero}
    <div class="ctabs"><a href="#server-${s.id}-hepsi">Tümü<span>${all.length}</span></a>${CATS.map(c=>`<a href="#server-${s.id}-${c}">${catLabel(c,s.sec)}<span>${all.filter(l=>l.cat===c).length}</span></a>`).join('')}<a href="#server-${s.id}-ep" class="on">EP<span>${P.length}</span></a></div>
    <div class="note note-info" style="margin-bottom:14px">${esc(s.name)} EP kodları yalnızca ${esc(S.set.siteName)} tarafından satılır. Ödeme yapınca kod anında ekranda gösterilir ve Hesabım › EP kodlarım bölümünde saklanır.</div>
    <div class="epgrid">${P.map(epCard).join('')||emptyBox('Şu an EP paketi yok','Kısa süre içinde tekrar bakın.')}</div></div>`; }
  let arr=cat==='hepsi'?all.slice():all.filter(l=>l.cat===cat);
  if(ui.f.max) arr=arr.filter(l=>l.price<=+ui.f.max);
  arr=sortL(arr,cat==='ep'?'ucuz':''); const vitC=arr.filter(l=>on(l,'vitrin')); arr=arr.filter(l=>!on(l,'vitrin'));
  return `<div class="wrap">${crumbs}${hero}
  <div class="ctabs"><a href="#server-${s.id}-hepsi" class="${cat==='hepsi'?'on':''}">Tümü<span>${all.length}</span></a>${CATS.map(c=>`<a href="#server-${s.id}-${c}" class="${c===cat?'on':''}">${catLabel(c,s.sec)}<span>${all.filter(l=>l.cat===c).length}</span></a>`).join('')}${s.sec==='tr'?`<a href="#metin2-ep">Metin2 EP</a>`:''}${srvEp(s)?`<a href="#server-${s.id}-ep">EP<span>${epFor(s.id).filter(p=>p.on).length}</span></a>`:''}</div>
  ${vitPanel(vitC,esc(s.name)+(cat==='hepsi'?'':' '+cl(cat))+' vitrini')}
  <div class="panel"><div class="panel-h" style="flex-wrap:wrap"><h2>${arr.length+vitC.length} ilan</h2><div class="hstack"><a class="btn btn-sm btn-primary" href="#ilan-ver" data-act="sell-here" data-s="${s.id}" ${cat==='hepsi'?'':`data-c="${cat}"`}>+ İlan Ver</a></div></div>
    <div class="lrows">${arr.map(row).join('')||emptyBox(`${esc(s.name)} için ${cat==='hepsi'?'':cl(cat)+' '}ilanı yok`,'Bu kategoride ilk ilanı siz verin.',`<a class="btn btn-primary" href="#ilan-ver" data-act="sell-here" data-s="${s.id}" ${cat==='hepsi'?'':`data-c="${cat}"`}>İlan Ver</a>`)}</div></div></div>`;
}

/* ================== CS2 / diğer / arama ================== */
function vCategory(game){
  const f=ui.f; const isCs=game==='cs2';
  let arr=active().filter(l=>game==='ara'?true:l.game===game);
  const q=(game==='ara'?ui.q:f.q||'').toLocaleLowerCase('tr-TR').trim();
  if(q) arr=arr.filter(l=>(l.title+' '+lsub(l)+' '+catName(l)+' '+(l.game==='metin2'?secName(secOf(l)):'')).toLocaleLowerCase('tr-TR').includes(q));
  if(isCs&&f.wear) arr=arr.filter(l=>l.skin.wear===f.wear);
  if(isCs&&f.wt) arr=arr.filter(l=>l.skin.w===f.wt);
  if(isCs&&f.st) arr=arr.filter(l=>l.skin.st);
  if(game==='diger'&&f.sub) arr=arr.filter(l=>l.sub===f.sub);
  if(f.max) arr=arr.filter(l=>l.price<=+f.max);
  arr=sortL(arr);
  const title={cs2:'CS2 Skin Pazarı',diger:'Diğer Oyunlar',ara:'Arama sonuçları'}[game];
  const subs=[...new Set(S.listings.filter(l=>l.game==='diger').map(l=>l.sub))];
  const srvHits=game==='ara'&&q?S.servers.filter(s=>s.name.toLocaleLowerCase('tr-TR').includes(q)):[];
  const filt=game==='ara'?'':`<aside class="panel filters panel-b">
      <div class="eyebrow">Filtrele</div>
      <div class="fld"><label for="f_q">İlan içinde ara</label><input class="inp" id="f_q" data-f="q" value="${esc(f.q||'')}" placeholder="${isCs?'AK-47, Karambit…':'Valorant, UC…'}"></div>
      ${isCs?`<div class="fld"><label for="f_wt">Silah türü</label><select class="inp" id="f_wt" data-f="wt"><option value="">Tümü</option>${Object.entries(WT).map(([k,v])=>`<option value="${k}" ${f.wt===k?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="fld"><label for="f_wear">Aşınma</label><select class="inp" id="f_wear" data-f="wear"><option value="">Tümü</option>${Object.entries(WEAR).map(([k,v])=>`<option value="${k}" ${f.wear===k?'selected':''}>${k} · ${v}</option>`).join('')}</select></div>
        <label class="chk" for="f_st"><input type="checkbox" id="f_st" data-f="st" ${f.st?'checked':''}> Sadece StatTrak™</label>`:''}
      ${game==='diger'?`<div class="fld"><label for="f_sub">Oyun</label><select class="inp" id="f_sub" data-f="sub"><option value="">Tümü</option>${subs.map(s=>`<option ${f.sub===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>`:''}
      <div class="fld"><label for="f_max">En yüksek fiyat (TL)</label><input class="inp" id="f_max" type="number" min="0" data-f="max" value="${esc(f.max||'')}" placeholder="Sınırsız"></div>
      
      <button class="btn btn-sm" data-act="clear-f">Filtreleri temizle</button>
    </aside>`;
  const body=arr.length?(isCs?`<div class="skins">${arr.map(skinTile).join('')}</div>`:`<div class="lrows">${arr.map(row).join('')}</div>`):emptyBox('Bu aramaya uyan ilan yok','Filtreleri gevşetin ya da aradığınız ürün için ilk ilanı siz verin.','<a class="btn btn-primary" href="#ilan-ver">İlan Ver</a>');
  return `<div class="wrap"><div class="page-h"><div><h1>${title}</h1><p>${game==='ara'?`“${esc(ui.q)}” için ${arr.length} ilan`:`${arr.length} aktif ilan · Tüm alışverişler güvenli havuz sistemiyle`}</p></div><a href="#ilan-ver" class="btn btn-primary">+ İlan Ver</a></div>
    ${srvHits.length?`<div class="sgrid" style="margin-bottom:16px">${srvHits.map(s=>srvCard(s)).join('')}</div>`:''}
    <div class="${filt?'cat-l':''}">${filt}<div class="panel">${body}</div></div></div>`;
}
/* ================== v3: yardımcılar ================== */
const STEAM_IMG='https://community.akamai.steamstatic.com/economy/image/';
const RARK=['Tüketici','Endüstriyel','Askeri','Kısıtlı','Gizli','Örtülü','Nadir Özel'];
const CS2CAT = (window.CS2CAT||[]);
const catFind = n => CS2CAT.find(x=>x[0]===n);
const PERMS_ = {panel:"Bugün: gelir ve KPI'lar (iş kuyruğu herkese açık)",ara:'Sipariş ve üye arama',siparis:'Siparişler ve itiraz kararı',borsa:'Yang Borsası siparişleri',borsa_ayar:'Borsa kurları ve bilgi alanları',odeme:'Ödemeler (yükleme onayı ve ödeme altyapısı)',cekim:'Para çekme onayı',reklam:'Reklam satışları',kampanya:'Çekiliş ve kuponlar',server:'Serverlar',ilan:'İlanlar',uye:'Üyeler & bakiye görüntüleme, SMS',mesaj:'Engellenen mesajlar',destek:'Canlı destek',sms:'E-posta & SMS',calisan:'Çalışanlar ve yetkiler',ayar:'Site ayarları',seo:'SEO & pazarlama (SEO, reklam takibi, backlink, rehber)'};
const PERMS = Object.assign({},PERMS_,{ep:'EP mağazası ve Happy Hour',vip:'Davet ve VIP koşulları',bakiye:'Üye bakiyesi ekleme / düşme',muhasebe:'Muhasebe ve Excel raporları',bakim:'Yedekleme ve bakım modu'});
const PERM_GROUPS=[['Bugün & arama',['panel','ara']],['Siparişler & teslimat',['siparis','borsa','borsa_ayar']],['Finans',['odeme','cekim','muhasebe']],['Üyeler & destek',['destek','uye','bakiye','mesaj','vip']],['Katalog',['ilan','server','ep']],['Reklam & büyüme',['reklam','kampanya','seo']],['Sistem',['calisan','sms','bakim','ayar']]];
const PERM_ROLES={op:['Operatör',['ara','siparis','borsa','ilan','mesaj','destek']],fin:['Finans',['panel','odeme','cekim','muhasebe']],dst:['Destek',['ara','siparis','uye','mesaj','destek']]};
const PERM_ALIAS={pazarlama:'seo',backlink:'seo',rehber:'seo'};
const can = p => { const u=me(); return !!(u && (u.admin || (u.staff && (u.perms||[]).includes(p)))); };
const isPanel = () => { const u=me(); return !!(u && (u.admin || u.staff)); };
const fullName = u => [u.ad,u.soyad].filter(Boolean).join(' ');
const isOnline = u => u && u.lastSeen && now()-u.lastSeen < 5*60000;
function seenTxt(u){ if(!u||!u.lastSeen) return '<span class="seen">Son görülme bilinmiyor</span>'; return isOnline(u)?'<span class="seen on">● Çevrimiçi</span>':`<span class="seen">Son görülme ${ago(u.lastSeen)}</span>`; }
function skinArt(l,style){
  const k=l.skin||{}; const svg=wsvg(WSVG[k.w]?k.w:(k.w==='smg'||k.w==='heavy'?'rifle':k.w==='gloves'?'knife':'rifle'));
  if(!l.img) return style?svg.replace('<svg',`<svg style="${style}"`):svg;
  return `<img class="skimg" src="${esc(l.img)}" alt="${esc(l.title)}" loading="lazy" ${style?`style="${style}"`:''} onerror="this.hidden=true;this.nextElementSibling.hidden=false">${svg.replace('<svg','<svg hidden'+(style?` style="${style}"`:''))}`;
}
/* sansür: telefon, e-posta, link, site dışı iletişim */
const CENSOR = [
  /(?:\+?90[\s\-]*)?\(?0?\s*5\d{2}\)?[\s\-\.]*\d{3}[\s\-\.]*\d{2}[\s\-\.]*\d{2}/g,
  /(?:\d[\s\-]?){10,}/g,
  /[\w.+-]+@[\w-]+\.[\w.]+/g,
  /(?:https?:\/\/|www\.)\S+/gi,
  /(?<![\p{L}\d])[\w-]+\.(?:com|net|org|gg|io|tr|xyz|me|link|ly)(?![\p{L}])\S*/giu,
  /(?<![\p{L}])(?:whatsapp|whatsap|watsap|vatsap|wpden|wp|discord|dc|telegram|telgram|tg|instagram|insta|ig|snapchat|snap|skype|facebook|fb|tiktok)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:iban|papara no|elden|site dışı|site disi|dışarıda|disarida|dışardan|disardan|komisyonsuz|numaram|numaranı|numaran|numarami|tel no|telefonum|telefonunu|gsm)(?![\p{L}])/giu
];
function censor(x){ let flagged=false, out=String(x||''); CENSOR.forEach(rx=>{ out=out.replace(rx,()=>{flagged=true; return '[gizlendi]';}); }); return {text:out, flagged}; }
function logFlag(u,ctx,orig){ S.flagged.unshift({id:uid('f'),u,ctx,orig,t:now()}); }
function notify(uid_,text,link,ev,vars){
  if(!uid_) return; S.notifs.unshift({id:uid('n'),u:uid_,x:text,link:link||'',t:now(),read:false});
  const u=user(uid_), sm=S.sms; if(sm.on && ev && sm.ev[ev] && u.tel){ const msg=tplFill(sm.tpl[ev]||SMSDEF[ev]||smsDef(ev)||text,Object.assign({site:S.set.siteName,ad:u.ad||u.name,saat:S.set.autoConfirm,mesaj:text},vars||{})); S.smsLog.unshift({id:uid('m'),u:uid_,to:u.tel,x:msg,t:now(),ev,status:'Gönderildi'}); }
  if(ev) mailSend(u,ev,Object.assign({mesaj:text},vars||{}));
}
function adMedia(a){ return (a.media&&a.media.length)?`<div class="admedia" data-media="${a.media.join(',')}"></div>`:''; }
/* IndexedDB medya deposu (reklam görselleri ve videoları) */
const MDB={db:null,cache:{}};
function mdbOpen(){ return new Promise((res,rej)=>{ if(MDB.db) return res(MDB.db); try{ const r=indexedDB.open('yangpazar_media',1); r.onupgradeneeded=()=>r.result.createObjectStore('m'); r.onsuccess=()=>{MDB.db=r.result;res(MDB.db)}; r.onerror=()=>rej(r.error);}catch(e){rej(e)} }); }
async function mediaPut(file){ const id=uid('md'); const db=await mdbOpen(); await new Promise((res,rej)=>{const tx=db.transaction('m','readwrite'); tx.objectStore('m').put({blob:file,type:file.type},id); tx.oncomplete=res; tx.onerror=()=>rej(tx.error);}); return id; }
async function mediaGet(id){ if(MDB.cache[id]) return MDB.cache[id]; const db=await mdbOpen(); const v=await new Promise(res=>{const r=db.transaction('m').objectStore('m').get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>res(null);}); if(!v) return null; const o={url:URL.createObjectURL(v.blob),video:/^video/.test(v.type)}; MDB.cache[id]=o; return o; }
async function hydrateMedia(){
  for(const el of document.querySelectorAll('.admedia:not([data-ok])')){
    el.dataset.ok='1'; const ids=el.dataset.media.split(',').filter(Boolean); const items=[];
    for(const id of ids){ try{ const m=await mediaGet(id); if(m) items.push(m);}catch(e){} }
    if(!items.length){ el.remove(); continue; }
    el.innerHTML=items.map((m,i)=>m.video?`<video src="${m.url}" muted loop playsinline autoplay ${i?'hidden':''}></video>`:`<img src="${m.url}" alt="" ${i?'hidden':''}>`).join('');
    el.closest('.slide,.ban,.pop')?.classList.add('has-media');
  }
}
setInterval(()=>{ document.querySelectorAll('.admedia[data-ok]').forEach(el=>{ const k=[...el.children]; if(k.length<2) return; const i=k.findIndex(c=>!c.hidden); k[i].hidden=true; const n=k[(i+1)%k.length]; n.hidden=false; if(n.tagName==='VIDEO'){try{n.currentTime=0;n.play()}catch(e){}} }); },5000);
function exMini(){ const xs=S.exchange.filter(x=>x.on).slice(0,5); if(!xs.length) return ''; if(!S.set.exOn) return `<div class="panel"><div class="panel-h"><h3>Yang Borsası</h3><span class="pill p-iade">Kısa mola</span></div><div class="panel-b muted" style="font-size:12.5px">Borsa kısa süreliğine hizmet vermiyor, yakında yeniden açılacak.</div></div>`; return `<div class="panel"><div class="panel-h"><h3>Yang Borsası</h3>${S.set.exOn?'<a href="#borsa">Al / Sat</a>':'<span class="pill p-iade">Alım kapalı</span>'}</div><div class="slist">${xs.map(x=>{const s=srv(x.server)||{name:'?',c:['#333','#666']}; const p=exSellPrice(x); return `<a href="#borsa" data-act="ex-pick" data-id="${x.id}" class="sitem">${logo(s,30)}<div style="min-width:0"><div class="n">${esc(s.name)}</div><div class="m">stok ${NUM(exStock(x))} adet</div></div><span class="o" style="color:var(--fg)">${p?TL(p):'Stok yok'}</span></a>`}).join('')}</div></div>`; }

// R9: üyeye görünen metinlerde pusula / e-Gider / VUK / ETTN / belge no (YGP…) geçmez. Eski kayıtları nötr metne çevirir.
const EGP_RX=/e-?\s?gider|gider\s*pusula|pusula|\bVUK\b|ETTN|YGP\d{4,}/i;
function r9Clean(t){ t=String(t==null?'':t)
    .replace(/(\S+) net çekim talebiniz alındı\. Ödeme aşamasında adınıza e-Gider Pusulası düzenlenecektir\./g,"Çekim talebiniz alındı. IBAN'ınıza net $1 gönderilecek.")
    .replace(/ ve e-Gider Pusulası işlenecektir\./g,'.')
    .replace(/ ve \S+ nolu e-Gider Pusulanız oluşturuldu\./g,'.')
    .replace(/ Adınıza \S+ nolu e-Gider Pusulası düzenlendi\./g,'')
    .replace(/e-Gider Pusulanızın düzenlenebilmesi için/g,'Çekim ödemelerinizin yapılabilmesi için')
    .replace(/\s*\(e-Gider Pusulalı\)/g,'').replace(/\s*·\s*e-Gider Pusulalı/g,'');
  if(!EGP_RX.test(t)) return t;
  return t.split('\n').map(l=>EGP_RX.test(l)?l.split(/(?<=[.!?])\s+/).filter(x=>!EGP_RX.test(x)).join(' '):l).filter((l,i,a)=>l.trim()||!EGP_RX.test(t.split('\n')[i]||'')).join('\n').trim()||'Çekim talebinizle ilgili bilgilendirme.'; }
