/* ================== v3: kabuk ================== */
/* üst arama: yazdıkça öneri */
const QPAGES=[['borsa','Yang Borsası','yang borsa won al sat'],['metin2-ep','Metin2 EP','ep ejderha parası kupon'],['metin2-tr','Metin2 TR serverları','tr resmi server won'],['metin2-pvp','Metin2 PVP serverları','pvp private server yang'],['cekilis','Çekiliş & Çark','çekiliş çark şans bilet'],['reklam-ver','Reklam Ver','reklam ver server tanıt'],['ilan-ver','İlan Ver','ilan ver sat'],['rehber','Metin2 Rehberi','rehber blog nasıl yardım ipucu'],['yang-fiyatlari','Yang Fiyatları','yang fiyat won fiyatı güncel tablo'],['ortaklik','Ortaklık & Partner','ortaklık partner rozet widget yayıncı'],['guvenli','Güvenli Alışveriş & SSS','güvenli sss soru yardım']];
function qSug(v){ const box=$('#qsug'), inp=$('#q'); if(!box) return; const q=sqNorm(v); if(!q){ box.hidden=true; inp&&inp.setAttribute('aria-expanded','false'); return; }
  const SV=S.servers.filter(s=>sqNorm(s.name).includes(q)).sort((a,b)=>sqNorm(a.name).indexOf(q)-sqNorm(b.name).indexOf(q)||a.name.localeCompare(b.name,'tr')).slice(0,5);
  const dig=v.replace(/\D/g,''); const AL=active();
  const LS=AL.filter(l=>sqNorm(l.title).includes(q)||(dig.length>=3&&String(l.no).startsWith(dig))||sqNorm(lsub(l)+catName(l)).includes(q)).sort((a,b)=>(sqNorm(b.title).includes(q)-sqNorm(a.title).includes(q))||(on(b,'vitrin')-on(a,'vitrin'))||a.price-b.price).slice(0,6);
  const PG=QPAGES.filter(([,n,k])=>sqNorm(n+' '+k).includes(q)).slice(0,3);
  const cnt=s_=>AL.filter(l=>l.server===s_.id).length;
  let h='';
  if(SV.length) h+=`<div class="qs-h">Serverlar</div>`+SV.map(s_=>`<div class="qs-srv"><a href="#server-${s_.id}" class="qs-i" data-qi>${logo(s_,30)}<span class="qs-t"><b>${esc(s_.name)}</b> ${newTag(s_)}<small>${secName(s_.sec)} · ${cnt(s_)} ilan</small></span></a><div class="qs-cats">${['yang','item','karakter'].concat(s_.sec==='pvp'?['ep']:[]).map(c=>`<a href="#server-${s_.id}-${c}" data-qi>${catLabel(c,s_.sec)}</a>`).join('')}</div></div>`).join('');
  if(LS.length) h+=`<div class="qs-h">İlanlar</div>`+LS.map(l=>`<a href="#ilan-${l.id}" class="qs-i qs-l" data-qi>${lthumb(l,36)}<span class="qs-t"><b>${esc(l.title)}</b><small>${esc(lsub(l))} · ${catName(l)} · #${l.no}</small></span><em class="mono">${TL(l.price)}</em></a>`).join('');
  if(PG.length) h+=`<div class="qs-h">Sayfalar</div>`+PG.map(([r,n])=>`<a href="#${r}" class="qs-i" data-qi><span class="qs-t"><b>${n}</b></span></a>`).join('');
  h+=`<button type="submit" class="qs-all" data-qi>“${esc(v.trim())}” için tüm sonuçları gör →</button>`;
  if(!SV.length&&!LS.length&&!PG.length) h=`<div class="qs-empty">Eşleşen server veya ilan yok.</div>`+h;
  box.innerHTML=h; box.hidden=false; inp&&inp.setAttribute('aria-expanded','true'); }
function qClose(){ const b=$('#qsug'); if(b) b.hidden=true; const i=$('#q'); if(i) i.setAttribute('aria-expanded','false'); }
function renderHeader(){
  const u=me(); const nn=u?S.notifs.filter(n=>n.u===u.id&&!n.read).length:0; const nm=u?unreadDM(u.id):0;
  $('#hdr').innerHTML=`<div class="wrap hdr-in">
    <a href="#home" class="brand">${ICO.han}<span>${esc(S.set.siteName)}<small>${esc(S.set.slogan)}</small></span></a>
    <form class="search" data-form="search" role="search"><input id="q" placeholder="Server, item, won, EP, karakter veya ilan no ara…" value="${esc(ui.q)}" aria-label="Ara" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="qsug"><button>Ara</button><div id="qsug" class="qsug" role="listbox" hidden></div></form>
    <div class="hdr-act">
      <button class="icob thm" data-act="theme" aria-label="${curTheme()==='dark'?'Gündüz moduna geç':'Gece moduna geç'}" title="${curTheme()==='dark'?'Gündüz modu':'Gece modu'}">${curTheme()==='dark'?THEME_ICO.sun:THEME_ICO.moon}</button>
      ${u? `${isPanel()?(isAdmRoute(route())?'<a href="#home" class="btn btn-ghost hpanel">Siteye dön</a>':'<a href="#yonetim" class="btn btn-ghost hpanel">Yönetim<span class="hm-hide"> Paneli</span></a>'):''}${u.admin?'':`<details class="balwrap"><summary class="bal" aria-label="Bakiye detayı"><small>Bakiye ▾</small><b>${TL(avail(u))}</b><span>Çekilebilir ${TL(u.bal||0)}</span></summary><div class="baldd balcard"><span class="eyebrow">Toplam bakiye</span><b class="mono">${TL(avail(u))}</b><div class="balsplit"><div><small>Çekilebilir</small><span class="mono">${TL(u.bal||0)}</span></div><div><small>Sadece alışveriş</small><span class="mono">${TL(u.bonus||0)}</span></div></div><div class="balbtns"><button class="btn btn-sm" data-act="deposit">+ Yükle</button><button class="btn btn-sm" data-act="tab" data-t="cek">Para çek</button></div><a href="#hesabim" data-act="tab" data-t="hareket" class="balmore">Bakiye hareketleri →</a></div></details>`}
        <a href="#mesajlar" class="icob" aria-label="Mesajlar">${ICO.mail}${nm?`<i>${nm}</i>`:''}</a>
        <a href="#bildirimler" class="icob" aria-label="Bildirimler">${ICO.bell}${nn?`<i>${nn}</i>`:''}</a>
        <a href="#ilan-ver" class="btn btn-primary hilan">+ İlan<span class="hm-hide"> Ver</span></a>
        <a href="#hesabim" class="me">${av(u)}<span>${esc(u.name)}</span></a>`
      : (maintOn()?'':`<button class="btn btn-ghost" data-act="login">Giriş Yap</button><button class="btn btn-primary" data-act="register">Üye Ol</button>`)}
    </div></div>`;
}
function renderCats(r){
  const cur = r.startsWith('rehber') ? 'rehber' : r.startsWith('server-') ? (secOf({server:r.slice(7).split('-')[0]})==='tr'?'metin2-tr':'metin2-pvp') : r;
  const L=[['home','Ana Sayfa'],['metin2-tr','Metin2 TR'],['metin2-ep','Metin2 EP'],['metin2-pvp','Metin2 PVP'],['borsa','Yang Borsası','hot'],['cekilis','Çekiliş & Çark','hot'],['reklam-ver','Reklam Ver'],['guvenli','Güvenli Alışveriş'],['rehber','Rehber']];
  $('#cats').innerHTML=`<div class="wrap">${L.map(([h,t,c])=>`<a href="#${h}" class="${cur===h?'on':''} ${c||''}">${t}</a>`).join('')}</div>`;
}

/* ================== ilan detayı ================== */
const LI={clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/></svg>',eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>'};
function vListing(id){
  const l=lst(id); if(!l) return vNotFound();
  l.views=(l.views||0)+1;
  const u=user(l.seller), mine=S.cur===l.seller, s=srv(l.server), k=l.skin, rate=rateFor(l.seller), viewer=me();
  const others=active().filter(x=>x.seller===l.seller&&x.id!==l.id).slice(0,4);
  const net=r2(l.price*(1-rate/100)), unit=unitOf(l);
  const head = k ? `<div class="det-art" style="--r-c:${RAR[k.r]}">${skinArt(l)}</div>
      <div class="det-hero" style="padding-bottom:6px"><div><div class="eyebrow">${WT[k.w]||'Skin'} · ${esc(k.r)}</div><h1>${k.st?'<span style="color:#cf6a32">StatTrak™</span> ':''}${esc(l.title)}</h1></div></div>`
    : `<div class="det-cover">${lcover(l)}</div><div class="det-hero">${lthumb(l,72)}<div><div class="eyebrow">${l.game==='metin2'?secName(secOf(l))+' · ':''}${esc(lsub(l))} · ${catName(l)}</div><h1>${esc(l.title)}</h1></div></div>`;
  const rows=[['İlan no',`<span class="mono">#${l.no||'-'}</span>`],['Oyun / Server',(l.game==='metin2'?secName(secOf(l))+' · ':'')+esc(lsub(l))],['Kategori',catName(l)],['Teslimat süresi',esc(l.del)],['Stok',NUM(l.stock)+' '+unit],['Eklenme',ago(l.t)]];
  if(k) rows.splice(2,0,['Aşınma',`${k.wear} · ${WEAR[k.wear]}`],['Float',`<span class="mono">${(+k.fl).toFixed(6)}</span> <div class="fbar" style="--f:${Math.min(k.fl*100,99)}%;max-width:220px;margin-top:6px"><i></i></div>`],['Nadirlik',`<span style="color:${RAR[k.r]};font-weight:700">●</span> ${esc(k.r)}`]);
  const sold=l.status!=='aktif'||l.stock<=0;
  const skinLeft=k?`    <div class="panel">${head}
      <div class="hstack" style="padding:0 18px 14px">${on(l,'acil')?'<span class="badge b-acil">Acil satılık</span>':''}${on(l,'vitrin')?'<span class="badge b-vitrin">Vitrin</span>':''}<span class="chip mono">İlan #${l.no||'-'}</span><span class="chip">Teslim: ${esc(l.del)}</span><span class="chip ok">Havuz güvenceli</span></div>
      <div class="kv">${rows.map(([a,b])=>`<div>${a}</div><div>${b}</div>`).join('')}</div>
      <div class="panel-h" style="border-top:0"><h3>Açıklama</h3></div><div class="desc">${esc(censor(l.desc||'Satıcı açıklama eklememiş.').text)}</div></div>`:'';
  const lisLeft=k?'':`<div class="panel lhero"><div class="lhero-img">${lcover(l)}${on(l,'vitrin')?'<span class="lh-rib">★ Vitrin</span>':''}${l.imgs&&l.imgs.length>1?`<span class="lgal-n">1 / ${l.imgs.length}</span><div class="lgal">${l.imgs.map((src,i)=>`<button type="button" class="${i===0?'on':''}" data-act="lgal" data-id="${l.id}" data-i="${i}" aria-label="Fotoğraf ${i+1}"><img src="${src}" alt=""></button>`).join('')}</div>`:''}</div><div class="lhero-b">
        <div class="lh-srv">${s?logo(s,34):''}<div style="min-width:0"><small>${l.game==='metin2'?secName(secOf(l)):''}</small><b>${esc(lsub(l))}</b><span> · ${catName(l)}</span></div></div>
        <h1>${esc(l.title)}</h1>
        <div class="lbadges">${on(l,'acil')?'<span class="badge b-acil">Acil satılık</span>':''}<span class="chip mono">İlan #${l.no||'-'}</span><span class="chip ok">✓ Havuz güvenceli</span>${sold?'<span class="chip warn">Satıldı</span>':''}</div>
        <div class="ltiles">${[[LI.clock,'Teslimat',esc(l.del)],[LI.box,'Stok',NUM(l.stock)+' '+unit],[LI.cal,'Eklenme',ago(l.t)]].map(([ic,a,b_])=>`<div>${ic}<span><small>${a}</small><b>${b_}</b></span></div>`).join('')}</div>
      </div></div>
      <div class="panel"><div class="panel-h"><h3>Açıklama</h3></div><div class="ldesc">${esc(censor(l.desc||'Satıcı açıklama eklememiş.').text)}</div></div>
      <div class="panel"><div class="panel-h"><h3>İlan bilgileri</h3></div><div class="linfo">${[['İlan no',`<span class="mono">#${l.no||'-'}</span>`],['Oyun / Server',(l.game==='metin2'?secName(secOf(l))+' · ':'')+esc(lsub(l))],['Kategori',catName(l)],['Satıcı',`<a href="#mesajlar-${u.id}">${esc(u.name)}</a>`]].map(([a,b_])=>`<div><span>${a}</span><b>${b_}</b></div>`).join('')}</div></div>
      <div class="panel panel-b stack"><div class="eyebrow">Nasıl teslim alırım?</div><div class="lsteps"><div><i>1</i><b>Satın al</b><span>Ödemen, sen onaylayana kadar güvenli havuzda bekler.</span></div><div><i>2</i><b>Satıcı teslim eder</b><span>${esc(l.del)} içinde oyunda ticaretle karakterine verir.</span></div><div><i>3</i><b>Kontrol et, onayla</b><span>Onaylayınca ödeme satıcıya geçer. ${S.set.autoConfirm} saat içinde onaylamazsan otomatik onaylanır.</span></div></div></div>`;
  const crumb = l.game==='metin2'&&!s ? `<a href="#metin2-tr">Metin2 TR</a> › <a href="#metin2-ep">Metin2 EP</a>` : l.game==='metin2'&&s ? `<a href="#metin2-${s.sec}">${secName(s.sec)}</a> › <a href="#server-${s.id}">${esc(s.name)}</a> › <a href="#server-${s.id}-${l.cat}">${catName(l)}</a>` : `<a href="#kategori-${l.game}">${{cs2:'CS2 Skin',diger:'Diğer Oyunlar'}[l.game]}</a>`;
  return `<div class="wrap"><div class="crumbs"><a href="#home">Ana Sayfa</a> › ${crumb} › İlan #${l.no||''}</div>
  <div class="det lstdet"><div class="col">
    ${k?skinLeft:lisLeft}
    ${others.length?`<div class="panel"><div class="panel-h"><h3>Satıcının diğer ilanları</h3></div><div class="lrows">${others.map(row).join('')}</div></div>`:''}
  </div>
  <aside class="col buy">
    <div class="panel panel-b stack">
      <div class="lprice"><div class="eyebrow">Fiyat${unit==='Won'?' · 1 Won':l.cat==='yang'?' · adet başı':''}</div><div class="price-big">${TL(l.price)}</div>${!mine&&!sold?`<div class="lp-meta"><span>${LI.clock} ${esc(l.del)} teslim</span><span>${LI.box} ${NUM(l.stock)} ${unit} stok</span></div>`:''}</div>
      ${mine?`<div class="note note-info">Bu sizin ilanınız. Satıldığında hesabınıza <b>${TL(net)}</b> geçer (${vip(u).n} seviye komisyonu %${rate}).</div>
        <div class="hstack"><button class="btn btn-sm btn-primary" data-act="edit-l" data-id="${l.id}">İlanı düzenle</button>${l.status==='aktif'?freeBumpBtn(l):''}</div><span class="muted" style="font-size:12px">Her 2 saatte bir ilanınızı ücretsiz olarak listenin en üstüne taşıyabilirsiniz.</span>
        <div class="eyebrow">Doping al · süreyi siz seçin</div><div class="stack" style="gap:8px">${Object.entries(S.dopings).map(([key,d])=>`<div class="dopbuy"><div style="min-width:0;flex:1"><b>${d.name}</b><span class="muted">${key!=='ust'&&on(l,key)?'Aktif · '+left(l.dop[key])+' kaldı':key==='ust'?'Tek seferlik':'günlük '+TL(d.pd||r2(d.p/7))}</span></div>${key==='ust'?'':dopSel('dg_'+l.id+'_'+key,key,1)}<button class="btn btn-sm btn-primary" data-act="dope" data-id="${l.id}" data-k="${key}">${key!=='ust'&&on(l,key)?'Uzat':'Al'}</button></div>`).join('')}</div>
        <button class="btn btn-bad btn-sm" data-act="unlist" data-id="${l.id}">İlanı yayından kaldır</button>`
      : sold?`<div class="note note-bad"><b>Bu ilan satıldı.</b> Benzer ilanlar için kategoriye göz atın.</div>`
      :`<div class="fld"><label for="qty">${unit==='Won'?'Kaç Won?':'Adet'}</label><input class="inp" id="qty" type="number" min="1" max="${l.stock}" value="1" data-change="qty" data-price="${l.price}"></div>
        <div class="sum"><div><span>Toplam</span><b class="mono" id="qtyTot">${TL(l.price)}</b></div><div><span class="muted">Kazanacağın puan</span><span class="mono" id="qtyPt">+${NUM(l.price*vip(viewer||{vol:0}).cb)}</span></div></div>
        <button class="btn btn-primary btn-block" style="padding:13px" data-act="buy" data-id="${l.id}">Satın Al</button>`}
      <div class="guard">${ICO.shield}<span><b>Paranız güvende.</b> Ödemeniz, ürünü teslim aldığınızı onaylayana kadar havuzda bekler. Teslim edilmezse canlı destekten iptal isteyin; ekibimiz kontrol edip iade eder.</span></div>
    </div>
    <div class="panel panel-b stack">
      <div class="seller">${av(u)}<div><b>${esc(u.name)}</b> ${u.verified?'<span class="vchk">✔ Doğrulanmış</span>':''}<div class="muted" style="font-size:12.5px"><span class="stars">${stars(u.rating)}</span> ${(+u.rating).toFixed(1)} ${vipBadge(u)}</div>${seenTxt(u)}</div></div>
      <div class="sum"><div><span class="muted">Başarılı satış</span><b>${NUM(u.sales)}</b></div><div><span class="muted">Üyelik</span><b>${esc(u.joined)}</b></div><div><span class="muted">Ort. teslim</span><b>${esc(l.del)}</b></div></div>
      ${mine?'':`<div class="hstack"><a class="btn btn-sm" href="#mesajlar-${u.id}" data-act="dm-ctx" data-l="${l.id}">Satıcıya mesaj</a><button class="btn btn-sm" data-act="sms-user" data-id="${u.id}">SMS ile ulaş · ${TL(S.sms.userPrice)}</button></div>`}
    </div>
    ${liveAds('banner').slice(0,1).map(bannerHtml).join('')}
  </aside></div></div>`;
}

/* ================== sipariş ================== */
function vOrder(id){
  const o=ord(id); if(!o) return vNotFound();
  const u=me(); if(!u||(u.id!==o.buyer&&u.id!==o.seller&&!can('siparis'))) return `<div class="wrap">${emptyBox('Bu siparişi görüntüleme yetkiniz yok','Sipariş yalnızca alıcı, satıcı ve yetkili ekibe açıktır.','<button class="btn btn-primary" data-act="login">Giriş Yap</button>')}</div>`;
  const isB=u.id===o.buyer, isS=u.id===o.seller, l=lst(o.lid)||{}, staff=can('siparis');
  const fee=o.fee??r2(o.total*o.rate/100), net=o.net??r2(o.total-fee);
  const idx={odendi:2,teslim:3,itiraz:3,tamam:5,iade:5}[o.status];
  const step=(n,t)=>{let c=''; if(o.status==='iade'&&n>=3) c='bad'; else if(n<idx||o.status==='tamam') c='done'; else if(n===idx) c='cur'; if(o.status==='itiraz'&&n===3) c='bad'; return `<div class="step ${c}"><i>${c==='done'?'✓':c==='bad'?'!':n}</i>${t}</div>`};
  const late=now()-o.t > delMin(l.del)*2*60000;
  let act='';
  if(o.status==='odendi'){
    if(isS) act=`<div class="note note-warn"><b>Ürününüz satıldı, teslimat sizden bekleniyor.</b> Teslimat bilgisi: <span class="mono">${esc(delivTxt(o))}</span>. ${late?'<b>Teslim süresi aşıldı, alıcı siparişi iptal edebilir.</b>':''}</div>
      <div class="fld"><label for="dnote">Teslimat notu (alıcı görür${l.cat==='ep'||l.cat==='epin'?' · kodu buraya yazın':''})</label><input class="inp" id="dnote" placeholder="${l.cat==='ep'||l.cat==='epin'?'EP kodu':'Örn: Köy 1, saat 21:14\'te ticaretle verildi'}"></div>
      <div class="dproofs"><div class="note note-info" style="font-size:12.5px">Teslim kanıtlarını yalnızca site yönetimi görür, alıcıya gösterilmez; olası bir anlaşmazlıkta sizi korur.</div>
        <div class="fld"><label for="dpre">1 · Teslimat öncesi görsel (zorunlu)</label><input class="inp" id="dpre" type="file" accept="image/*" multiple data-change="dprev" data-box="dprev_pre"><span class="muted" style="font-size:12px">Ticaret penceresi açıkken: verdiğiniz ürün / yang miktarı ve alıcının karakter adı görünsün. En fazla 3 görsel.</span><div id="dprev_pre" class="hstack"></div></div>
        <div class="fld"><label for="dpost">2 · Teslimat sonrası görsel (zorunlu)</label><input class="inp" id="dpost" type="file" accept="image/*" multiple data-change="dprev" data-box="dprev_post"><span class="muted" style="font-size:12px">Ticaret onaylandıktan sonra: envanterinizden ürünün / yangın düştüğü görünsün. En fazla 3 görsel.</span><div id="dprev_post" class="hstack"></div></div>
        <div class="fld"><label for="dvid">3 · Teslimat videosu (isteğe bağlı)</label><input class="inp" id="dvid" type="file" accept="video/mp4,video/webm,video/quicktime" data-change="dprev" data-box="dprev_vid"><span class="muted" style="font-size:12px">Ticaretin baştan sona kaydı varsa ekleyin; en fazla 60 MB. Anlaşmazlıkta en güçlü kanıttır.</span><div id="dprev_vid" class="hstack"></div></div></div>
      <button class="btn btn-primary" id="dbtn" data-act="deliver" data-id="${o.id}" disabled>Teslim Ettim</button>`;
    if(isS&&!late) act=(o.ready?`<div class="note note-ok"><b>Alıcıya “teslime hazır” bildirimi gönderildi</b> (${ago(o.ready)}). Teslimat: ${esc(teslimatTxt(o))}</div>`:`<div class="note note-info stack" style="gap:8px"><span><b>Teslime hazır mısınız?</b> Alıcıya SMS ve e-posta ile haber verelim: “${esc(teslimatTxt(o))}” noktasında beklesin.</span><div><button class="btn btn-ok btn-sm" data-act="o-ready" data-id="${o.id}">Teslime hazırım · alıcıya haber ver</button></div></div>`)+act;
    else if(isB) act= late ? `<div class="note note-warn"><b>Teslim süresi aşıldı.</b> Paranız havuzda güvende. İptal ve iade için canlı destekten talep oluşturun; ekibimiz satıcıyla görüşüp siparişi iptal eder.</div><div class="hstack"><button class="btn btn-primary" data-act="order-support" data-id="${o.id}">Canlı destekten iptal iste</button><button class="btn btn-sm" data-act="dispute" data-id="${o.id}">Sorun bildir</button></div>`
      : `${o.ready?`<div class="note note-ok"><b>Satıcı teslime hazır!</b> ${esc(teslimatTxt(o))}. Lütfen oyunda bekleyin.</div>`:''}<div class="note note-info"><b>Ödemeniz havuzda güvende.</b> Satıcıya “ürününüz satıldı” bildirimi ve SMS gitti. Teslim gecikirse canlı destekten iptal isteyebilirsiniz.</div><button class="btn btn-bad btn-sm" data-act="dispute" data-id="${o.id}">Sorun bildir</button>`;
    if(staff&&!isB&&!isS) act+=`<div class="note note-info">Yetkili işlemi: teslim edilmeyen siparişi iptal edebilirsiniz.</div><div class="hstack"><button class="btn btn-bad" data-act="resolve" data-id="${o.id}" data-to="buyer">Siparişi iptal et ve iade yap</button></div>`;
  } else if(o.status==='teslim'){
    const ac=(o.dt||o.t)+S.set.autoConfirm*H;
    if(isB) act=`<div class="note note-warn"><b>Satıcı teslim ettiğini bildirdi.</b> Ürünü kontrol edin. ${left(ac)} içinde işlem yapmazsanız sipariş otomatik onaylanır.</div>
      <div class="fld"><span class="lbl">Satıcıyı puanlayın</span><div class="hstack" id="starPick">${[1,2,3,4,5].map(n=>`<button class="btn btn-sm" data-act="star" data-n="${n}" style="${n===5?'border-color:var(--accent)':''}">${n} ★</button>`).join('')}</div></div>
      <div class="hstack"><button class="btn btn-ok" data-act="confirm" data-id="${o.id}">Ürünü aldım, onaylıyorum</button><button class="btn btn-bad" data-act="dispute" data-id="${o.id}">Sorun var, itiraz et</button></div>`;
    else act=`<div class="note note-info">Alıcının onayı bekleniyor. Onay gelmezse ${left(ac)} sonra otomatik onaylanır ve ${TL(net)} hesabınıza geçer.</div>`;
  } else if(o.status==='itiraz'){
    act=`<div class="note note-bad"><b>İtiraz incelemede.</b> Gerekçe: ${esc(o.reason)}<br>Tutar havuzda bekletiliyor. Ekran görüntüsü ve kayıtlarınızı mesaj alanından iletin.</div>${o.proof?`<img src="${o.proof}" alt="İtiraz kanıtı" style="max-height:220px;border-radius:8px;border:1px solid var(--line)">`:''}`;
    if(staff) act+=`<div class="hstack"><button class="btn btn-ok" data-act="resolve" data-id="${o.id}" data-to="seller">Satıcı haklı · Ödemeyi aktar</button><button class="btn btn-bad" data-act="resolve" data-id="${o.id}" data-to="buyer">Alıcı haklı · İade et</button></div>`;
  } else if(o.status==='tamam'){
    act=`<div class="note note-ok"><b>Sipariş tamamlandı.</b> ${isS?`Hesabınıza ${TL(net)} aktarıldı.`:`İyi oyunlar! ${o.pts?NUM(o.pts)+' puan kazandınız.':''}`} ${o.stars?'Puan: <span class="stars">'+stars(o.stars)+'</span>':''}</div>`;
  } else if(o.status==='iade'){
    act=`<div class="note note-bad"><b>Sipariş iade edildi.</b> ${TL(o.total)} alıcının bakiyesine geri yüklendi.</div>`;
  }
  const who=f=>f===o.buyer?'Alıcı':f===o.seller?'Satıcı':'Destek';
  const B=user(o.buyer), Sl=user(o.seller);
  return `<div class="wrap">${staff&&!isB&&!isS?`<div class="admback"><a class="btn btn-sm" href="#yonetim/siparis?f=${o.status==='itiraz'?'itiraz':'tumu'}">← Siparişler & itirazlar</a></div>`:''}<div class="crumbs"><a href="#hesabim">Hesabım</a> › Sipariş #${o.id}</div>
  <div class="page-h"><div><h1>Sipariş #${o.id}</h1><p>${esc(o.title)} · ${o.qty} ${l.id?unitOf(l):'adet'} · ${dtstr(o.t)}${l.no?' · İlan #'+l.no:''}</p></div><span class="pill p-${o.status}">${ST[o.status]}</span></div>
  <div class="det"><div class="col">
    <div class="panel"><div class="steps">${step(1,'Ödeme havuzda')}${step(2,'Satıcı teslim etti')}${step(3,'Alıcı onayı')}${step(4,o.status==='iade'?'İade edildi':'Satıcıya ödendi')}</div><div class="panel-b stack" style="padding-top:4px">${act||'<div class="note note-info">Bu sipariş için yapılacak işlem yok.</div>'}</div></div>
    ${staff&&o.dproof&&o.dproof.length?`<div class="panel"><div class="panel-h"><h3>Teslim kanıtları</h3><span class="chip warn">Sadece yönetim görür</span></div><div class="panel-b stack">${o.dpre||o.dpost?[['dpre','Teslimat öncesi'],['dpost','Teslimat sonrası']].map(([g,lbl])=>`<div class="pgrp"><b>${lbl}</b>${(o[g]||[]).length?`<div class="proofs">${o[g].map((src,i)=>`<button class="proof" data-act="proof-open" data-id="${o.id}" data-g="${g}" data-i="${i}"><img src="${src}" alt="${lbl} ${i+1}"></button>`).join('')}</div>`:'<span class="muted" style="font-size:12.5px">Yüklenmedi</span>'}</div>`).join(''):`<div class="pgrp"><b>Teslim görselleri</b><div class="proofs">${o.dproof.map((src,i)=>`<button class="proof" data-act="proof-open" data-id="${o.id}" data-i="${i}"><img src="${src}" alt="Teslim görseli ${i+1}"></button>`).join('')}</div></div>`}
      <div class="pgrp"><b>Teslimat videosu</b>${o.dvid?`<video controls preload="metadata" data-dvid="${o.dvid}" style="width:100%;max-height:360px;border-radius:8px;background:#000"></video>`:'<span class="muted" style="font-size:12.5px">Satıcı video eklemedi (isteğe bağlı).</span>'}</div>
      <span class="muted" style="font-size:12px">${esc(user(o.seller).name)} · ${o.dt?dtstr(o.dt):''}</span></div></div>`:staff&&['teslim','itiraz','tamam'].includes(o.status)?`<div class="note note-info">Bu sipariş teslim görseli zorunluluğundan önce teslim edildi; görsel yok.</div>`:isS&&o.dproof?`<div class="note note-ok">Teslim kanıtlarınız (${o.dpre?o.dpre.length+' öncesi, '+(o.dpost||[]).length+' sonrası görsel':o.dproof.length+' görsel'}${o.dvid?', video':''}) yönetime iletildi. Alıcı bunları görmez.</div>`:''}<div class="panel"><div class="panel-h"><h3>Sipariş mesajları</h3><span class="muted" style="font-size:12px">Telefon, link ve site dışı iletişim otomatik gizlenir</span></div>
      <div class="chat" id="ochat">${o.log.map(e=>`<div class="msg sys">${dtstr(e.t)} · ${esc(e.x)}</div>`).concat(o.chat.map(m=>`<div class="msg ${m.f===u.id?'mine':m.f==='admin'||user(m.f).staff?'agent':''}"><b>${who(m.f)}</b> ${esc(m.x)}${m.flag?'<em class="flagnote">İletişim bilgisi gizlendi</em>':''}<small>${ago(m.t)}</small></div>`)).join('')}</div>
      ${['tamam','iade'].includes(o.status)?'':`<form class="chat-in" data-form="ochat" data-id="${o.id}"><input class="inp" id="omsg" placeholder="Mesaj yazın…" autocomplete="off"><button class="btn btn-primary">Gönder</button></form>`}</div>
  </div>
  <aside class="col"><div class="panel panel-b stack">
    <div class="eyebrow">Ödeme özeti</div>
    <div class="sum"><div><span>Ürün</span><span style="text-align:right">${esc(o.title)}</span></div><div><span>Miktar</span><span>${o.qty}</span></div><div class="tot"><span>Alıcının ödediği</span><span class="mono">${TL(o.total)}</span></div>
    ${isS||staff?`<div><span class="muted">Komisyon (%${o.rate})</span><span class="mono neg">−${TL(fee)}</span></div><div class="tot"><span>Satıcıya geçecek</span><span class="mono">${TL(net)}</span></div>`:''}</div>
    <div class="sum"><div><span class="muted">Alıcı</span><b>${esc(B.name)}${staff?' · '+esc(fullName(B)):''}</b></div><div><span class="muted">Satıcı</span><b>${esc(Sl.name)}${staff?' · '+esc(fullName(Sl)):''}</b></div><div><span class="muted">${o.ch||o.place?'Karakter adı':/@/.test(o.info||'')?'Devir e-postası':'Teslim bilgisi'}</span><span class="mono" style="font-size:11.5px;overflow-wrap:anywhere;text-align:right;max-width:60%">${esc(o.info||'-')}</span></div>${o.ch?`<div><span class="muted">Kanal</span><b>CH${esc(o.ch)}</b></div>`:''}${o.place?`<div><span class="muted">Teslimat yeri</span><b>${esc(o.place)}</b></div>`:''}</div>
    ${l.id?`<a href="#ilan-${l.id}" class="btn btn-sm">İlana git</a>`:''}
  </div></aside></div></div>`;
}

/* ================== ilan ver ================== */
function vSell(){
  const u=me(); if(!u) return `<div class="wrap">${emptyBox('İlan vermek için giriş yapın','Üye olmak ve ilan vermek ücretsizdir. Sadece satış olduğunda komisyon alınır.','<button class="btn btn-primary" data-act="login">Giriş Yap / Üye Ol</button>')}</div>`;
  const p=ui.preset||{}; const ps=srv(p.s); const g0=ps?(ps.sec==='tr'?'mtr':'mpvp'):p.tr?'mtr':'mtr';
  const rate=rateFor(u.id); ui.coverCat=null;
  const opt=(sec)=>S.servers.filter(s=>s.sec===sec).map(s=>`<option value="${s.id}" ${p.s===s.id?'selected':''}>${esc(s.name)}${sec==='pvp'?' ('+esc(s.lv)+')':''}</option>`).join('');
  return `<div class="wrap" style="max-width:880px"><div class="page-h"><div><h1>İlan Ver</h1><p>İlan vermek ücretsiz. İlanınıza otomatik ilan numarası atanır. Satış gerçekleşince ${vip(u).n} seviye komisyonu %${rate} kesilir.</p></div></div>
  <form class="stack" data-form="sell" id="sellForm">
    <div class="panel panel-b stack"><div class="eyebrow">1 · Önce bölüm seçin</div>
      <div class="gpick" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        <label><input type="radio" name="game" value="mtr" ${g0==='mtr'?'checked':''} data-change="game"><b>Metin2 TR</b><span>Won, item, karakter</span></label>
        <label><input type="radio" name="game" value="mpvp" ${g0==='mpvp'?'checked':''} data-change="game"><b>Metin2 PVP</b><span>Yang, EP, item, karakter</span></label>
      </div>
      <div class="fld srvq" data-sec="mtr mpvp"><label for="s_q">Server adı ile ara</label><input class="inp" id="s_q" data-change="srvq" data-p="s" placeholder="Server adını yazın, ör. Ejder2 veya Marmara" autocomplete="off" role="combobox" aria-controls="s_sug" aria-expanded="false"><div class="srvsug" id="s_sug" role="listbox"></div><span class="muted" style="font-size:12px">Yazdıkça eşleşen serverlar çıkar; seçince bölüm ve server otomatik doldurulur.</span></div>
      <div class="row2" data-sec="mtr mpvp">
        <div class="fld" data-sec="mtr" id="srvTrBox"><label for="s_server_tr">2 · Metin2 TR serverı</label><select class="inp" id="s_server_tr">${opt('tr')}</select></div>
        <div class="fld" data-sec="mpvp" hidden><label for="s_server_pvp">2 · Metin2 PVP serverı</label><select class="inp" id="s_server_pvp">${opt('pvp')}</select></div>
        <div class="fld"><label for="s_cat">3 · Kategori</label><select class="inp" id="s_cat" data-change="calc">${M2CAT.filter(c=>c!=='ep'||(g0==='mpvp'&&S.set.pvpEpOn)).map(c=>`<option value="${c}" ${p.c===c?'selected':''}>${catLabel(c,g0==='mtr'?'tr':'pvp')}</option>`).join('')}</select></div>
        <div class="note note-info" id="epNote" hidden style="grid-column:1/-1">Metin2 EP yalnızca site tarafından satılır, üyeler EP ilanı veremez.</div>
      </div>
      <div class="row2" data-sec="diger" hidden>
        <div class="fld"><label for="s_sub">Oyun adı</label><input class="inp" id="s_sub" placeholder="Valorant, PUBG Mobile…"></div>
        <div class="fld"><label for="s_dcat">Tür</label><select class="inp" id="s_dcat" data-change="calc"><option value="hesap">Hesap</option><option value="epin">E-pin</option><option value="yang">Oyun parası</option><option value="item">Item</option></select></div>
      </div>
    </div>
    <div class="panel panel-b stack"><div class="eyebrow">2 · İlan bilgileri</div>
      <div class="fld"><label for="s_title">İlan başlığı</label><input class="inp" id="s_title" required maxlength="90" placeholder="Örn: 1 Won — anında teslim"></div>
      <div class="row3">
        <div class="fld"><label for="s_price" id="s_price_l">Fiyat (TL)</label><input class="inp" id="s_price" type="number" min="0.01" step="0.01" required placeholder="0,00" data-change="calc"></div>
        <div class="fld"><label for="s_stock" id="s_stock_l">Stok</label><input class="inp" id="s_stock" type="number" min="1" value="1" required></div>
        <div class="fld"><label for="s_del">Teslim süresi</label><select class="inp" id="s_del">${['Anında','5 dk','15 dk','30 dk','1 saat','3 saat','24 saat'].map(x=>`<option ${x==='15 dk'?'selected':''}>${x}</option>`).join('')}</select></div>
      </div>
      <div class="fld"><label for="s_desc">Açıklama</label><textarea class="inp" id="s_desc" placeholder="Efsunlar, teslim şekli, dikkat edilmesi gerekenler. Telefon, link ve site dışı iletişim bilgisi otomatik gizlenir."></textarea></div>
      <div class="note note-info" id="netInfo">Fiyat girdiğinizde, satış olduğunda bakiyenize geçecek tutarı burada göreceksiniz.</div>
    </div>
    <div class="panel panel-b stack"><div class="eyebrow">3 · İlan görseli</div><span class="muted" style="font-size:12.5px">Hazır görsellerimizden birini seçin ya da kendi görselinizi yükleyin.</span>
      <div class="coverpick" id="coverPick"></div>
      <div class="fld"><span class="lbl">Kendi fotoğraflarınız (isteğe bağlı · en fazla 10) · yüklerseniz hazır görselin yerine geçer</span>${(UPL.s=UPL.s||[]),pupHtml('s')}</div>
    </div>
    <div class="panel panel-b stack"><div class="eyebrow">4 · Doping (isteğe bağlı)</div>
      <div class="dop dop2">${Object.entries(S.dopings).map(([k,d])=>`<div class="dopi"><label for="d_${k}"><input type="checkbox" id="d_${k}" data-dop="${k}" data-change="calc"><span><b>${d.name}</b>${d.desc}${k==='ust'?'':` · günlük ${TL(d.pd||r2(d.p/7))}`}</span><span class="pr" id="dpr_${k}">${TL(dopCost(k,1))}</span></label>${k==='ust'?'<span class="muted" style="font-size:11.5px;padding:0 10px 8px">Tek seferlik</span>':`<div style="padding:0 10px 10px">${dopSel('dd_'+k,k,1,'data-change="calc" data-dk="'+k+'"')}</div>`}</div>`).join('')}</div>
      <div class="sum"><div class="tot"><span>Doping toplamı (bakiyeden düşülür)</span><span class="mono" id="dopTot">${TL(0)}</span></div></div>
    </div>
    <div class="hstack"><button class="btn btn-primary" style="padding:13px 24px">İlanı Yayınla</button><span class="muted" style="font-size:12.5px">Bakiyeniz: <b class="mono">${TL(avail(u))}</b> · Sıradaki ilan no: <b class="mono">#${S.lno+1}</b></span></div>
  </form></div>`;
}
function sellCat(){ const g=(document.querySelector('input[name=game]:checked')||{}).value; if(g==='diger') return ({hesap:'karakter',epin:'ep',yang:'yang',item:'item'}[($('#s_dcat')||{}).value]||'item'); return ($('#s_cat')||{}).value||'yang'; }
function renderCoverPick(){ const c=sellCat(); if(ui.coverCat===c) return; ui.coverCat=c; const box=$('#coverPick'); if(!box) return;
  box.innerHTML=COVER_V.map(i=>`<label for="cv_${i}"><input type="radio" name="cover" id="cv_${i}" value="${c}-${i}" ${i===1?'checked':''}>${coverHtml(c+'-'+i)}</label>`).join(''); }
function sellGame(){
  const g=(document.querySelector('input[name=game]:checked')||{}).value; if(!g) return;
  document.querySelectorAll('[data-sec]').forEach(s=>s.hidden=!s.dataset.sec.split(' ').includes(g));
  const sec=g==='mtr'?'tr':'pvp';
  const sc=$('#s_cat'); if(sc){ const cur=sc.value; const cats=M2CAT.filter(c=>c!=='ep'||(sec==='pvp'&&S.set.pvpEpOn)); sc.innerHTML=cats.map(c=>`<option value="${c}" ${c===cur?'selected':''}>${catLabel(c,sec)}</option>`).join(''); }
  sellCalc();
}
function sellCalc(el){
  const g=(document.querySelector('input[name=game]:checked')||{}).value, c=($('#s_cat')||{}).value, won=g==='mtr'&&c==='yang';
  const trEp=g==='mtr'&&c==='ep'; const tb=$('#srvTrBox'); if(tb&&g==='mtr') tb.hidden=trEp; const en=$('#epNote'); if(en) en.hidden=!trEp;
  const pl=$('#s_price_l'), sl=$('#s_stock_l'); if(pl) pl.textContent=won?'Fiyat (1 Won için, TL)':'Fiyat (TL)'; if(sl) sl.textContent=won?'Stok (Won)':'Stok';
  const p=+($('#s_price')||{}).value||0; const ni=$('#netInfo'); const rate=me()?rateFor(me().id):S.set.commission;
  if(ni) ni.innerHTML=p>0?`Satış olduğunda bakiyenize <b class="mono">${TL(p*(1-rate/100))}</b>${won?' (1 Won başına)':''} geçer (fiyat ${TL(p)} − %${rate} komisyon ${TL(p*rate/100)}).`:'Fiyat girdiğinizde, satış olduğunda bakiyenize geçecek tutarı burada göreceksiniz.';
  if(el&&el.dataset&&el.dataset.dk){ const cb=$('#d_'+el.dataset.dk); if(cb) cb.checked=true; } Object.keys(S.dopings).forEach(k=>{ const p_=$('#dpr_'+k); if(p_) p_.textContent=TL(dopCost(k,($('#dd_'+k)||{}).value||1)); }); const cost=r2([...document.querySelectorAll('[data-dop]:checked')].reduce((s,x)=>s+dopCost(x.dataset.dop,($('#dd_'+x.dataset.dop)||{}).value||1),0)); const dt=$('#dopTot'); if(dt) dt.textContent=TL(cost);
  renderCoverPick();
}
function fileToDataURL(file,max){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>{ const img=new Image(); img.onload=()=>{ const sc=Math.min(1,(max||640)/Math.max(img.width,img.height)); const c=document.createElement('canvas'); c.width=Math.round(img.width*sc); c.height=Math.round(img.height*sc); c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/webp',.82)); }; img.onerror=rej; img.src=r.result; }; r.onerror=rej; r.readAsDataURL(file); }); }

/* ================== hesabım ================== */
function vAccount(){
  const u=me(); if(!u) return `<div class="wrap">${emptyBox('Hesabınızı görmek için giriş yapın','','<button class="btn btn-primary" data-act="login">Giriş Yap</button>')}</div>`;
  const buys=S.orders.filter(o=>o.buyer===u.id), sells=S.orders.filter(o=>o.seller===u.id);
  const needS=sells.filter(o=>o.status==='odendi').length, needB=buys.filter(o=>o.status==='teslim').length;
  const pending=r2(sells.filter(o=>['odendi','teslim','itiraz'].includes(o.status)).reduce((s,o)=>s+o.total*(1-o.rate/100),0));
  const wd=S.wd.filter(w=>w.u===u.id), wdp=r2(wd.filter(w=>w.status==='bekliyor').reduce((s,w)=>s+w.amount,0));
  const my=S.listings.filter(l=>l.seller===u.id), bx=S.exOrders.filter(o=>o.u===u.id);
  const v=vip(u), nx=vipNext(u);
  const T=[['ozet','Özet'],['cek','Para çek'],['alis','Aldıklarım',needB],['satis','Sattıklarım',needS],['borsa','Borsa işlemlerim'],['ep','EP kodlarım'],['ilan','İlanlarım'],['reklam','Reklamlarım'],['profil','Profil bilgilerim'],['puan','VIP & Puan'],['davet','Davet et kazan'],['hareket','Bakiye hareketleri']];
  const otbl=(arr,role)=>arr.length?`<div class="tbl-w"><table class="tbl"><thead><tr><th>Sipariş</th><th>Ürün</th><th>${role==='b'?'Satıcı':'Alıcı'}</th><th>Durum</th><th class="num">Tutar</th><th></th></tr></thead><tbody>${arr.map(o=>`<tr><td class="mono">#${o.id}</td><td>${esc(o.title)}</td><td>${esc(user(role==='b'?o.seller:o.buyer).name)}</td><td><span class="pill p-${o.status}">${ST[o.status]}</span></td><td class="num">${TL(role==='b'?o.total:(o.net??o.total*(1-o.rate/100)))}</td><td><a class="btn btn-sm ${(role==='s'&&o.status==='odendi')||(role==='b'&&o.status==='teslim')?'btn-primary':''}" href="#siparis-${o.id}">${(role==='s'&&o.status==='odendi')?'Teslim et':(role==='b'&&o.status==='teslim')?'Onayla':'Detay'}</a></td></tr>`).join('')}</tbody></table></div>`:emptyBox('Henüz sipariş yok',role==='b'?'Aldığınız ürünler burada listelenir.':'Satışlarınız burada listelenir.');
  const vipCard=`<div class="panel panel-b stack"><div class="hstack" style="justify-content:space-between"><div><div class="eyebrow">Seviyeniz</div><div style="font-family:var(--f-display);font-size:28px;font-weight:800;text-transform:uppercase;color:${v.c}">${v.n}</div></div><div style="text-align:right"><div class="eyebrow">Puanınız</div><div class="mono" style="font-size:22px;font-weight:700">${NUM(u.pts)}</div><span class="muted" style="font-size:12px">= ${TL(u.pts/S.set.ptRate)}</span></div></div>
    <div class="prog"><i style="width:${nx?Math.min(100,(u.vol-v.min)/(nx.min-v.min)*100):100}%"></i></div>
    <div class="muted" style="font-size:12.5px">${nx?`${nx.n} seviyeye ${TL(nx.min-u.vol)} işlem hacmi kaldı.`:'En üst seviyedesiniz.'} İşlem hacminiz: <b class="mono">${TL(u.vol)}</b></div></div>`;
  let body='';
  if(ui.tab==='ozet') body=`<div class="kpis"><div class="kpi hl"><small>Toplam bakiye</small><b>${TL(avail(u))}</b><span class="muted" style="font-size:12px">Çekilebilir ${TL(u.bal)} · Sadece alışveriş ${TL(u.bonus||0)}</span></div><div class="kpi"><small>Havuzdaki satışlarım</small><b>${TL(pending)}</b></div><div class="kpi"><small>Çekim bekleyen</small><b>${TL(wdp)}</b></div><div class="kpi"><small>Komisyon oranınız</small><b>%${rateFor(u.id)}</b></div></div>
    <div class="hstack"><button class="btn btn-primary" data-act="deposit">Bakiye Yükle</button><button class="btn" data-act="tab" data-t="cek">Para Çek</button><a class="btn" href="#ilan-ver">İlan Ver</a><a class="btn" href="#borsa">Yang Borsası</a><a class="btn" href="#cekilis">Çarkı çevir</a></div>
    ${needS?`<div class="note note-warn"><b>${needS} siparişte teslimat sizi bekliyor.</b> <a href="#hesabim" data-act="tab" data-t="satis" style="text-decoration:underline">Sattıklarım</a></div>`:''}
    ${needB?`<div class="note note-warn"><b>${needB} siparişte onayınız bekleniyor.</b> <a href="#hesabim" data-act="tab" data-t="alis" style="text-decoration:underline">Aldıklarım</a></div>`:''}
    ${vipCard}`;
  if(ui.tab==='alis') body=`<div class="panel">${otbl(buys,'b')}</div>`;
  if(ui.tab==='satis') body=`<div class="panel">${otbl(sells,'s')}</div>`;
  if(ui.tab==='borsa'){ const myO=S.exOffers.filter(o=>o.u===u.id); body=`${S.set.exOn?'':`<div class="note note-info"><b>Yang Borsası kısa bir moladır.</b> ${esc(S.set.exOffMsg||'')}</div>`}${myCallNotes()}<div class="panel"><div class="panel-h"><h3>Alım siparişlerim</h3><a class="btn btn-sm btn-primary" href="#borsa">Borsaya git</a></div>${bx.length?exTable(exSortUser(bx),false):emptyBox('Alım siparişiniz yok','')}</div><div class="panel"><div class="panel-h"><h3>Satış emirlerim</h3></div>${myO.length?offerTable(myO,false,true):emptyBox('Satış emriniz yok','Borsada “Siteye sat” sekmesinden emir verebilirsiniz.')}</div>`; }
  if(ui.tab==='ilan') body=`<div class="panel"><div class="panel-h"><h3>İlanlarım</h3><span class="muted" style="font-size:12px">Her ilanı 2 saatte bir ücretsiz olarak listenin en üstüne taşıyabilirsiniz</span></div>${my.length?`<div class="tbl-w"><table class="tbl"><thead><tr><th>İlan no</th><th>İlan</th><th>Durum</th><th class="num">Stok</th><th class="num">Fiyat</th><th></th></tr></thead><tbody>${my.map(l=>`<tr><td class="mono">#${l.no}</td><td><a href="#ilan-${l.id}" style="font-weight:600">${esc(l.title)}</a><div class="muted" style="font-size:12px">${esc(lsub(l))} · ${catName(l)} · ${l.views} görüntülenme${l.bump?' · son taşıma '+ago(l.bump):''}</div></td><td><span class="pill ${l.status==='aktif'?'p-tamam':l.status==='beklemede'?'p-bekliyor':'p-iade'}">${{aktif:'Yayında',beklemede:'Onay bekliyor',satildi:'Satıldı',kaldirildi:'Kaldırıldı'}[l.status]}</span></td><td class="num">${NUM(l.stock)}</td><td class="num">${TL(l.price)}</td><td><div class="hstack" style="flex-wrap:nowrap">${l.status==='aktif'?freeBumpBtn(l):''}<button class="btn btn-sm" data-act="edit-l" data-id="${l.id}">Düzenle</button></div></td></tr>`).join('')}</tbody></table></div>`:emptyBox('Henüz ilanınız yok','İlk ilanınızı verin, alıcılar sizi bulsun.','<a class="btn btn-primary" href="#ilan-ver">İlan Ver</a>')}</div>`;
  if(ui.tab==='ep'){ const E=S.epOrders.filter(o=>o.u===u.id); body=`<div class="panel">${E.length?`<div class="tbl-w"><table class="tbl"><thead><tr><th>Tarih</th><th>Ürün</th><th>Kod</th><th class="num">Tutar</th></tr></thead><tbody>${E.map(o=>`<tr><td style="white-space:nowrap">${dtstr(o.t)}</td><td><b>${NUM(o.epShown)} EP</b> <span class="muted" style="font-size:12px">${esc(epName({srv:o.srv}))}</span>${o.hh?' <span class="chip ok">Happy Hour</span>':''}</td><td><div class="hstack" style="flex-wrap:nowrap"><span class="mono">${esc(o.code)}</span><button class="btn btn-sm" data-act="copy" data-v="${esc(o.code)}">Kopyala</button></div></td><td class="num">${TL(o.price)}</td></tr>`).join('')}</tbody></table></div>`:emptyBox('EP kodunuz yok','Metin2 EP bölümünden anında kod alabilirsiniz.','<a class="btn btn-primary" href="#metin2-ep">EP al</a>')}</div>`; }
  if(ui.tab==='reklam'){ const L=S.ads.filter(a=>a.owner===u.id); const ph=a=>adPhase(a).k; const ord={onay:0,yayin:1,plan:2,dur:3,bitti:4,red:5}; L.sort((x,y)=>ord[ph(x)]-ord[ph(y)]||(y.start||0)-(x.start||0)); const cnt=k=>L.filter(a=>ph(a)===k).length;
    body=`<div class="panel"><div class="panel-h"><h3>Reklamlarım</h3><a class="btn btn-sm btn-primary" href="#reklam-ver">Yeni reklam</a></div>${L.length?`<div class="adkpi"><div><b>${cnt('yayin')}</b><span>Yayında</span></div><div><b>${cnt('onay')}</b><span>Onay bekliyor</span></div><div><b>${cnt('plan')}</b><span>Planlandı</span></div><div><b>${cnt('bitti')+cnt('red')}</b><span>Biten / reddedilen</span></div></div>`:''}<div class="panel-b">${myAdsCards(L)}</div></div>`; }
  if(ui.tab==='profil') body=`<div class="panel panel-b"><form class="stack" data-form="profile" style="max-width:520px"><div class="note note-info">Ad, soyad ve telefonunuz diğer üyelere gösterilmez. Sipariş bildirimleri SMS olarak bu numaraya gelir.</div>
    <div class="row2"><div class="fld"><label for="pf_ad">Ad</label><input class="inp" id="pf_ad" value="${esc(u.ad||'')}" required ${tcOk(u)?'readonly title="TC ile doğrulandı"':''}></div><div class="fld"><label for="pf_soyad">Soyad</label><input class="inp" id="pf_soyad" value="${esc(u.soyad||'')}" required ${tcOk(u)?'readonly title="TC ile doğrulandı"':''}></div></div>
    <div class="row2"><div class="fld"><label for="pf_tel">Cep telefonu</label><input class="inp mono" id="pf_tel" value="${esc(u.tel||'')}" placeholder="05xx xxx xx xx" required></div><div class="fld"><label for="pf_mail">E-posta</label><input class="inp" id="pf_mail" type="email" value="${esc(u.email||'')}"></div></div>
    <div class="fld"><label for="pf_pass">Yeni şifre (değiştirmek için)</label><input class="inp" id="pf_pass" type="password" autocomplete="new-password"></div>
    <button class="btn btn-primary">Bilgilerimi kaydet</button></form></div>${tfaPanel(u)}`;
  if(ui.tab==='puan') body=`${vipCard}
    <div class="panel panel-b stack"><div class="eyebrow">Puanı bakiyeye çevir</div><div class="muted" style="font-size:13px">${S.set.ptRate} puan = 1 TL. En az 500 puan çevrilebilir.</div>
      <form class="hstack" data-form="pts"><input class="inp" id="pt_amt" type="number" min="500" step="100" value="${Math.max(500,Math.floor(u.pts/100)*100)}" style="max-width:160px"><button class="btn btn-primary" ${u.pts<500?'disabled':''}>Bakiyeye çevir</button></form></div>
    <div class="panel panel-b stack"><div class="eyebrow">VIP seviyeleri</div><div class="viptbl">${VIP.map(x=>`<div class="${x.id===v.id?'on':''}"><span class="vip" style="background:${x.c};align-self:flex-start">${x.n}</span><b>${x.min?TL(x.min)+' hacim':'Başlangıç'}</b><span>Alışverişte %${x.cb} puan</span><span>Satışta komisyon %${r2(S.set.commission-x.disc)}</span></div>`).join('')}</div></div>`;
  if(ui.tab==='davet'){ const code=refCode(u); body=`${S.set.refOn?'':'<div class="note note-info">Davet programı şu an kapalı.</div>'}<div class="panel panel-b stack"><div class="eyebrow">Davet et kazan</div><div style="font-family:var(--f-display);font-size:26px;font-weight:800;text-transform:uppercase">Her arkadaşın için ${TL(S.set.refBonus)}</div><p class="muted" style="margin:0">Davet kodunla üye olan arkadaşın en az ${TL(S.set.refMin)} tutarındaki ilk alışverişini tamamladığında sana ${TL(S.set.refBonus)}, ona ${TL(S.set.refFriend)} hediye bakiye yüklenir. Hediye bakiye alışverişte kullanılır, çekilemez. En fazla ${S.set.refMax} arkadaş davet edebilirsin.</p>
    <div class="reflink"><span class="eyebrow">Davet linkin · en kolayı</span><div class="cprow"><span class="mono" style="font-size:13.5px;overflow-wrap:anywhere;min-width:0">${esc(refLink(u))}</span><button class="btn btn-sm btn-primary" data-act="copy" data-v="${esc(refLink(u))}">Linki kopyala</button></div><span class="muted" style="font-size:12px">Bu linkle gelen arkadaşın kayıt olurken kod yazmasına gerek yok, otomatik olarak sana bağlanır. WhatsApp, Discord veya oyun içinden paylaşabilirsin.</span></div>
    <div class="cprow"><span><span class="muted">Davet kodun (link kullanamayanlar için)</span><br><b class="mono" style="font-size:16px">${code}</b></span><button class="btn btn-sm" data-act="copy" data-v="${code}">Kodu kopyala</button></div>
    ${(()=>{ const L=S.users.filter(x=>x.refBy===u.id); return L.length?`<div class="tbl-w"><table class="tbl"><thead><tr><th>Davet ettiğin</th><th>Nasıl geldi</th><th>Durum</th></tr></thead><tbody>${L.map(x=>`<tr><td><b>${esc(x.name)}</b><div class="muted" style="font-size:11.5px">Üyelik: ${esc(x.joined||'')}</div></td><td>${x.refVia==='kod'?'Kod ile':'Link ile'}</td><td>${x.refPaid?'<span class="pill p-tamam">Kazandın</span>':`<span class="pill p-bekliyor">İlk alışveriş bekleniyor</span>`}</td></tr>`).join('')}</tbody></table></div>`:''; })()}
    <div class="kpis"><div class="kpi"><small>Davet ettiğin</small><b>${u.refs||0}</b></div><div class="kpi"><small>Kazancın</small><b>${TL((u.refs||0)*S.set.refBonus)}</b></div></div></div>`; }
  if(ui.tab==='hareket'){const tx=S.tx.filter(t=>t.u===u.id); body=`<div class="panel">${tx.length?`<div class="tbl-w"><table class="tbl"><thead><tr><th>Tarih</th><th>İşlem</th><th class="num">Tutar</th></tr></thead><tbody>${tx.map(t=>`<tr><td class="mono" style="white-space:nowrap">${dtstr(t.t)}</td><td>${esc(t.l)}</td><td class="num ${t.a<0?'neg':'pos'}">${t.a>0?'+':''}${TL(t.a)}</td></tr>`).join('')}</tbody></table></div>`:emptyBox('Hareket yok','')}</div>`;}
  if(ui.tab==='cek'){ const IB=u.ibans||[];
    body=`<div class="kpis"><div class="kpi hl"><small>Çekilebilir bakiye</small><b>${TL(u.bal)}</b><span class="muted" style="font-size:12px">Satışlar ve Havale/EFT yüklemeleri</span></div><div class="kpi"><small>Sadece alışveriş</small><b>${TL(u.bonus||0)}</b><span class="muted" style="font-size:12px">Kart, mobil, cüzdan yüklemeleri ve bonuslar</span></div></div>
    ${tcNeed(u)?tcGate(u):tcNeedFull(u)?tcConfirm(u):`<div class="panel panel-b"><form class="stack" data-form="withdraw" style="max-width:560px">
      <div class="note note-info">En az ${TL(S.set.minWithdraw)} çekebilirsiniz. İşlem ücreti: <b>${wdFeeTxt()}</b>. Talepler mesai saatlerinde 2-6 saatte IBAN'ınıza gönderilir. IBAN ${esc(fullName(u)||'sizin')} adına kayıtlı olmalıdır.</div>
      <div class="fld"><span class="lbl">Hangi hesaba?</span><div class="ibl">${IB.map((b,i)=>`<label for="wi_${b.id}"><input type="radio" name="wiban" id="wi_${b.id}" value="${b.id}" ${i===0?'checked':''} data-change="wiban"><b>${esc(b.bank)}</b><span class="mono">${esc(maskIban(b.iban))}</span><span class="muted">${esc(b.name)}</span></label>`).join('')}<label for="wi_new"><input type="radio" name="wiban" id="wi_new" value="_new" ${IB.length?'':'checked'} data-change="wiban"><b>+ Yeni IBAN</b><span class="muted">Banka hesabı ekle</span></label></div></div>
      <div class="stack" id="wNew" ${IB.length?'hidden':''}><div class="row2"><div class="fld"><label for="w_bank">Banka</label><select class="inp" id="w_bank">${TRBANKS.map(b=>`<option>${b}</option>`).join('')}</select></div><div class="fld"><label for="w_name">Hesap sahibi adı soyadı</label><input class="inp" id="w_name" value="${esc(fullName(u))}"></div></div>
        <div class="fld"><label for="w_iban">IBAN</label><input class="inp mono" id="w_iban" placeholder="TR00 0000 0000 0000 0000 0000 00"></div><label class="chk" for="w_save"><input type="checkbox" id="w_save" checked> Bu IBAN'ı sonraki çekimler için kaydet</label></div>
      <div class="fld"><label for="w_amt">Tutar (TL) · çekilebilir ${TL(u.bal)}</label><input class="inp" id="w_amt" type="number" min="${S.set.minWithdraw}" max="${u.bal}" step="0.01" required data-change="wdcalc"></div>
      <div class="sum wdsum" id="wdsum"><div><span class="muted">Çekilecek brüt tutar</span><b class="mono" id="wd_a">${TL(0)}</b></div><div><span class="muted">İşlem ücreti</span><b class="mono" id="wd_f">${S.set.wdFee&&S.set.wdFee.on?TL(0):'Ücretsiz'}</b></div>${wdTaxPct()?`<div><span class="muted">Vergi kesintisi (%${wdTaxPct()})</span><b class="mono" id="wd_st">${TL(0)}</b></div>`:''}<div class="tot"><span>IBAN'ınıza gönderilecek net tutar</span><b class="mono" id="wd_n">${TL(0)}</b></div></div>
      <button class="btn btn-primary">Çekim talebi oluştur</button></form></div>`}
    <div class="panel"><div class="panel-h"><h3>Kayıtlı IBAN'larım</h3></div><div class="panel-b stack">${IB.map(b=>`<div class="cprow"><span><b>${esc(b.bank)}</b> · ${esc(b.name)}<br><span class="mono">${esc(fmtIban(b.iban))}</span></span><button class="btn btn-sm btn-bad" data-act="iban-del" data-id="${b.id}">Sil</button></div>`).join('')||'<span class="muted">Kayıtlı IBAN yok.</span>'}
      <form class="row3" data-form="ibanadd" style="align-items:end"><div class="fld"><label for="ia_b">Banka</label><select class="inp" id="ia_b">${TRBANKS.map(b=>`<option>${b}</option>`).join('')}</select></div><div class="fld"><label for="ia_n">Ad soyad</label><input class="inp" id="ia_n" value="${esc(fullName(u))}" required></div><div class="fld"><label for="ia_i">IBAN</label><input class="inp mono" id="ia_i" required placeholder="TR.."></div><button class="btn btn-sm">IBAN kaydet</button></form></div></div>
    ${wd.length?(()=>{
      // R9: üyeye yalnız talep bilgisi gösterilir (tarih, banka / maskeli IBAN, tutar, kesinti varsa net, durum); belge bilgisi yok.
      const net=w=>w.net!=null?w.net:w.amount, cut=wd.some(w=>r2(net(w))!==r2(w.amount));
      return `<div class="panel">
        <div class="panel-h"><h3>Çekim taleplerim</h3></div>
        <div class="tbl-w"><table class="tbl" id="userWdTbl"><thead><tr><th>Tarih</th><th>Banka / IBAN</th><th class="num">Tutar</th>${cut?'<th class="num">Net gönderilen</th>':''}<th>Durum</th></tr></thead><tbody>${wd.map(w=>`<tr><td style="white-space:nowrap">${dtstr(w.t)}</td><td>${esc(w.bank||'')}<div class="mono" style="font-size:12px">${esc(maskIban(w.iban))}</div></td><td class="num"><b class="mono">${TL(w.amount)}</b></td>${cut?`<td class="num"><b class="mono">${TL(net(w))}</b>${r2(net(w))!==r2(w.amount)?`<div class="muted" style="font-size:11px">${[w.fee?'İşlem ücreti '+TL(w.fee):'',w.stopaj?'Vergi kesintisi '+TL(w.stopaj):''].filter(Boolean).join(' · ')}</div>`:''}</td>`:''}<td><span class="pill p-${w.status==='bekliyor'?'bekliyor':w.status==='onaylandı'?'onay':'iade'}">${w.status}</span></td></tr>`).join('')}</tbody></table></div></div>`;
    })():''}`; }
  return `<div class="wrap"><div class="page-h"><div><h1>Hesabım</h1><p>${esc(u.name)} ${vipBadge(u)} · ${esc(fullName(u))} ${tcOk(u)?'<span class="chip ok" title="TC kimlik doğrulandı">✔ Kimlik doğrulandı</span>':''} · Üyelik: ${esc(u.joined)}</p></div>${isPanel()?'<a class="btn btn-primary" href="#yonetim">Yönetim paneline git</a>':''}</div>
  ${tcNeed(u)&&ui.tab!=='cek'?`<div class="note note-warn tcnote" style="margin-bottom:14px"><span><b>Kimliğinizi doğrulamadınız.</b> Para çekebilmek için TC kimlik numaranızı ve doğum tarihinizi girin.</span><button class="btn btn-sm btn-primary" data-act="tc-open">Doğrula</button></div>`:''}<div class="acc"><div class="stack" style="gap:12px"><nav class="panel tabs">${T.map(([k,t,c])=>`<button data-act="tab" data-t="${k}" class="${ui.tab===k?'on':''}">${t}${c?`<span class="cnt">${c}</span>`:''}</button>`).join('')}</nav></div><div class="stack">${body}</div></div></div>`;
}


/* ================== çekiliş & çark ================== */
function wheelSvg(){
  const n=WHEEL.length, seg=360/n;
  const pt=(a,r)=>{const rad=(a-90)*Math.PI/180; return [Math.cos(rad)*r, Math.sin(rad)*r]};
  const slices=WHEEL.map((w,i)=>{const a0=i*seg,a1=(i+1)*seg; const [x0,y0]=pt(a0,96),[x1,y1]=pt(a1,96); const mid=a0+seg/2; const [tx,ty]=pt(mid,62);
    return `<path d="M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A96 96 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${w.c}" stroke="#fff" stroke-width="1.5"/><text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" fill="#fff" font-size="11" font-weight="700" font-family="Figtree,system-ui,sans-serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${mid} ${tx.toFixed(2)} ${ty.toFixed(2)})">${w.l}</text>`}).join('');
  return `<svg class="wheel" id="wheel" viewBox="-100 -100 200 200" style="transform:rotate(${ui.rot}deg)" role="img" aria-label="Şans çarkı"><circle r="99" fill="#111827"/>${slices}<circle r="22" fill="#111827" stroke="#fff" stroke-width="2"/><text y="1" fill="#ffbb55" font-size="10" font-weight="800" text-anchor="middle" dominant-baseline="middle" font-family="Figtree,system-ui,sans-serif">ÇEVİR</text></svg>`;
}
function vCamp(){
  const u=me(); const spun=u&&S.spins[u.id]===today();
  const act=activeRaffles(), past=S.raffles.filter(r=>r.winner).slice(0,5);
  return `<div class="wrap"><div class="page-h"><div><h1>Çekiliş & Şans Çarkı</h1><p>Her gün ücretsiz çark, alışverişlerinden çekiliş bileti. Her çekilişin bilet koşulları kartında yazar.</p></div></div>
  <div class="camp">
    <div class="panel panel-b stack" style="align-items:center;text-align:center">
      <div class="eyebrow">Günlük şans çarkı</div>
      <div class="wheel-w"><span class="wheel-pin"></span>${wheelSvg()}</div>
      ${!S.set.wheelOn?'<div class="note note-info">Şans çarkı şu an kapalı.</div>':!u?'<button class="btn btn-primary" data-act="login">Çevirmek için giriş yap</button>':u.admin?'<div class="note note-info">Yönetici hesabı çark çeviremez.</div>':spun?`<div class="note note-info">Bugünkü hakkını kullandın. Yarın tekrar gel!</div>`:`<button class="btn btn-primary" style="padding:13px 28px;font-size:15px" data-act="spin" id="spinBtn">Ücretsiz Çevir</button>`}
      <div class="muted" style="font-size:12px">Ödüller: 1-50 TL bakiye, puan ve çekiliş bileti. Günde 1 hak.</div>
    </div>
    <div class="stack">
      <div class="raffles">${act.map(r=>{const tot=rTotal(r), mine=u?r.tk[u.id]||0:0, free=u&&S.rfree[u.id+'_'+r.id]===today();
        return `<div class="raffle"><div class="raffle-top" style="--c1:${r.c[0]};--c2:${r.c[1]}">${r.kind==='item'?`<span style="color:#fff">${wsvg(r.w||'rifle')}</span>`:`<span class="pi" style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center">${ICO.gift.replace('<svg','<svg style="width:32px"')}</span>`}<div><small>Ödül · ${TL(r.value)} değerinde</small><h3>${esc(r.title)}</h3></div></div>
          <div class="raffle-b">${cdBox(r.end)}
            <div class="sum"><div><span class="muted">Toplam bilet</span><b class="mono">${NUM(tot)}</b></div><div><span class="muted">Senin biletin</span><b class="mono">${mine}</b></div><div><span class="muted">Kazanma şansın</span><b class="mono">%${tot?(mine/tot*100).toFixed(1):'0'}</b></div></div>
            <ul class="rcond">${rCond(r).map(c=>`<li>${c}</li>`).join('')}</ul>
            ${u&&!u.admin&&rOk(r,u)?`<div class="muted" style="font-size:12px">Sonraki bilete <b>${TL(r2(rPer(r)-((r.acc||{})[u.id]||0)))}</b> alışveriş kaldı.</div>`:''}
            ${!u?'<button class="btn btn-primary" data-act="login">Katılmak için giriş yap</button>':u.admin?`<button class="btn btn-primary" data-act="draw" data-id="${r.id}">Kazananı şimdi çek</button>`:!rOk(r,u)?`<button class="btn" disabled>🔒 ${esc((VIP.find(v=>v.id===r.minVip)||{}).n||'')} ve üzeri üyelere özel</button><div class="muted" style="font-size:12px">Senin seviyen: ${vip(u).n}. Alışveriş yaptıkça seviyen yükselir.</div>`:r.free===false?'':`<button class="btn btn-primary" data-act="free-tk" data-id="${r.id}" ${free?'disabled':''}>${free?'Bugünkü ücretsiz biletini aldın':'Ücretsiz bilet al (günde 1)'}</button>`}</div></div>`}).join('')||emptyBox('Aktif çekiliş yok','Yeni çekiliş yakında.')}</div>
      <div class="panel"><div class="panel-h"><h3>Son kazananlar</h3></div><div class="feed">${past.map(r=>`<div><span><b>${esc(user(r.winner).name.slice(0,3))}***</b> · ${esc(r.title)}</span><time>${dstr(r.end)}</time></div>`).join('')||'<div><span class="muted">Henüz kazanan yok</span></div>'}</div></div>
      <div class="panel panel-b stack"><div class="eyebrow">VIP seviyeleri · Alışveriş yaptıkça kazan</div><div class="viptbl">${VIP.map(x=>`<div class="${u&&vip(u).id===x.id?'on':''}"><span class="vip" style="background:${x.c};align-self:flex-start">${x.n}</span><b>${x.min?TL(x.min)+' hacim':'Başlangıç'}</b><span>Alışverişte %${x.cb} puan</span><span>Satışta komisyon %${r2(S.set.commission-x.disc)}</span></div>`).join('')}</div></div>
    </div>
  </div></div>`;
}
function spin(){
  const u=me(); if(!u||ui.spinning||S.spins[u.id]===today()) return;
  const tot=WHEEL.reduce((s,w)=>s+w.w,0); let r=Math.random()*tot, i=0; for(;i<WHEEL.length;i++){ r-=WHEEL[i].w; if(r<=0) break; } i=Math.min(i,WHEEL.length-1);
  const seg=360/WHEEL.length, center=i*seg+seg/2, target=(360-center)%360;
  const cur=((ui.rot%360)+360)%360; ui.rot=ui.rot+360*6+((target-cur+360)%360);
  ui.spinning=true; S.spins[u.id]=today(); save();
  const w=$('#wheel'); const b=$('#spinBtn'); if(b){b.disabled=true;b.textContent='Çevriliyor…';}
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(w) w.style.transform=`rotate(${ui.rot}deg)`;
  setTimeout(()=>{
    const p=WHEEL[i];
    if(p.k==='bal'){addBonus(u,p.v); addTx(u.id,'Şans çarkı ödülü · sadece alışveriş',p.v); ledger('bonus',u.id,p.v,{m:'Şans çarkı'});} else if(p.k==='pt'){u.pts=(u.pts||0)+p.v;} else if(p.k==='tk'){addTickets(u.id,p.v);}
    ui.spinning=false; save(); render(); toast(`Tebrikler! ${p.l} kazandın.`);
  }, reduce?300:4800);
}

/* ================== bilgi sayfaları ================== */
function vSafe(){
  const c=S.set.commission;
  const faq=[['Komisyon kimden kesilir?',`Komisyon satıcıdan kesilir. Alıcı ilan fiyatını öder. Standart oran %${c}; VIP satıcılarda %${c-VIP[VIP.length-1].disc}'e kadar iner.`],['Satıcı teslim etmezse ne olur?','Paranız ürünü onaylayana kadar havuzda bekler. Satıcı teslim etmezse canlı destekten iptal talebi oluşturun; ekibimiz satıcıyla görüşüp siparişi iptal eder ve tutarı bakiyenize iade eder. Kötüye kullanımı önlemek için iptali yalnızca yetkili ekip yapar.'],['Metin2 TR\'de Won nedir?','Resmi sunucularda yang, Won birimiyle satılır. 1 Won = 100M (100 milyon) yang demektir. İlan fiyatları 1 Won içindir.'],['Teslim aldım ama onaylamayı unuttum.',`Satıcı teslim ettiğini bildirdikten ${S.set.autoConfirm} saat sonra sipariş otomatik onaylanır. Sorun varsa bu süre dolmadan itiraz edin.`],['Hangi ödeme yöntemleri var?',S.gws.filter(g=>g.on).map(g=>g.n).join(', ')+'. Havale ve kripto yüklemeleri ekibimiz onayladıktan sonra bakiyeye geçer.'],['Bakiyemi nasıl çekerim?',`Satış gelirleriniz ve Havale/EFT ile yüklediğiniz tutar çekilebilir; kart, mobil ödeme ve cüzdanla yüklenen bakiye ile bonuslar sadece alışverişte kullanılır. Hesabım › Para Çek bölümünden kayıtlı IBAN'ınızı seçerek talep oluşturun. En az ${TL(S.set.minWithdraw)} çekilebilir, talepler mesai saatlerinde 2-6 saatte gönderilir.`],['Çekilişe nasıl katılırım?','Her 100 TL alışverişte tüm aktif çekilişlere 1 bilet eklenir. Ayrıca her gün 1 ücretsiz bilet alabilir, şans çarkından bilet kazanabilirsiniz.'],['Hesap satın almak güvenli mi?','Hesap ilanlarında satıcı e-posta ve şifre değişimiyle teslim eder. Bilgileri değiştirmeden siparişi onaylamayın. Oyun şirketlerinin kuralları hesap devrini yasaklayabilir, bu riski alıcı üstlenir.']];
  return `<div class="wrap"><div class="page-h"><div><h1>Güvenli Alışveriş</h1><p>${esc(S.set.siteName)} alıcı ile satıcı arasında aracıdır. Ürün satıcıdadır; para ise teslim onaylanana kadar bizde durur.</p></div></div>
  <div class="flow"><div><i>1</i><b>Alıcı öder</b><p>Bakiyesiyle ödeme yapar. Para satıcıya değil, güvenli havuza geçer.</p></div><div><i>2</i><b>Satıcı teslim eder</b><p>Oyunda ticaretle ya da hesap devriyle ürünü verir, “Teslim ettim” der.</p></div><div><i>3</i><b>Alıcı onaylar</b><p>Ürünü kontrol eder, onaylar veya itiraz açar. ${S.set.autoConfirm} saat sonra otomatik onay.</p></div><div><i>4</i><b>Para satıcıya geçer</b><p>Komisyon kesilir, kalanı satıcının bakiyesine aktarılır.</p></div></div>
  <div class="panel" style="margin-top:20px"><div class="panel-h"><h2>Sıkça sorulan sorular</h2></div>${faq.map(([q,a])=>`<details class="faq"><summary>${q}</summary><p>${esc(a)}</p></details>`).join('')}</div></div>`;
}
const PAGES={hakkimizda:['Hakkımızda','yangpazar.com, Metin2 oyuncularının item, won, yang, EP ve karakterlerini güvenle alıp sattığı bir ilan pazarıdır. Ürünleri biz satmayız; alıcı ile satıcıyı buluşturur, ödemeyi teslim onaylanana kadar güvence altında tutarız.'],kvkk:['KVKK Aydınlatma Metni','Bu alana şirketinizin 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamındaki aydınlatma metnini ekleyin. Metni bir hukukçuya hazırlatmanız önerilir.'],mesafeli:['Mesafeli Satış Sözleşmesi','Bu alana mesafeli satış sözleşmenizi ekleyin. Dijital ürünlerde cayma hakkının istisnaları ve aracı hizmet koşulları açıkça yazılmalıdır.'],iletisim:['İletişim','Destek: 7/24 canlı destek (sağ alttaki buton). WhatsApp: +90 5xx xxx xx xx. Adres ve vergi bilgilerinizi bu alana ekleyin.']};
function vPage(k){const p=PAGES[k]; if(!p) return vNotFound(); return `<div class="wrap" style="max-width:760px"><div class="page-h"><h1>${p[0]}</h1></div><div class="panel panel-b" style="line-height:1.7">${esc(p[1]).replace('yangpazar.com',esc(S.set.siteName))}</div></div>`}
function vNotFound(){return `<div class="wrap">${emptyBox('Sayfa bulunamadı','Aradığınız ilan kaldırılmış veya bağlantı hatalı olabilir.','<a class="btn btn-primary" href="#home">Ana sayfaya dön</a>')}</div>`}
/* ================== reklam ver (görsel / video) ================== */
function vAds(){
  const u=me(); const t=ui.adType; const P=S.packs[t]; const SZ=AD_SIZE[t]; const free=can('reklam');
  const zones=['text','slider','premium','banner','altbanner','popup']; if(ui.adDur==null) ui.adDur=1;
  const mine=u?S.ads.filter(a=>a.owner===u.id).sort((a,b)=>(b.bookedAt||b.start||0)-(a.bookedAt||a.start||0)):[];
  return `<div class="wrap">
  <div class="adhero"><div><div class="eyebrow" style="color:var(--accent-hi)">Server sahipleri için</div><h1>Server'ını binlerce oyuncuya göster</h1>
    <p>Takvimden boş tarihi seç, görselini yükle, bakiyenden öde. Reklamın ekibimiz tarafından kontrol edilip onaylandıktan sonra seçtiğin tarihte yayına girer.</p>
    <div class="stats"><div><b>Rezervasyonlu</b><span>Boş tarihi seç</span></div><div><b>Onaylı yayın</b><span>Red olursa iade</span></div><div><b>Görsel + video</b><span>Dönüşümlü gösterim</span></div></div></div>
    <div class="mock" aria-label="Reklam alanlarının sayfadaki yeri">${zones.map(z=>`<div class="z-${z} ${z===t?'on':''}">${{text:'Üst şerit',slider:'Slider',premium:'Premium',banner:'Banner',altbanner:'Alt banner',popup:'Popup'}[z]}</div>`).join('')}<div class="z-yan l ${t==='yan'?'on':''}"></div><div class="z-yan r ${t==='yan'?'on':''}"></div><div class="z-list">İlanlar</div></div></div>
  <div class="packs">${Object.entries(S.packs).map(([k,p])=>`<button class="pack ${k===t?'on':''}" data-act="pick-ad" data-type="${k}"><span class="eyebrow">Bugün ${adBooked(k,dayStart(now()))}/${p.cap||1} alan dolu</span><h3>${p.name}</h3><p>${p.desc}</p><span class="szchip">${AD_SIZE[k]?`Görsel ${AD_SIZE[k].w} × ${AD_SIZE[k].h} px`:k==='premium'?'Görsel gerekmez':'Sadece metin'}</span><span class="from">${TL(p.p[0])}<span class="muted" style="font-size:12px;font-weight:500"> / gün'den</span></span></button>`).join('')}</div>
  <div class="panel" style="margin-top:20px"><div class="panel-h"><h3>Görsel ölçüleri</h3><span class="muted" style="font-size:12px">Yüklemeden önce görselinizi bu ölçülerde hazırlayın</span></div><div class="tbl-w"><table class="tbl"><thead><tr><th>Reklam alanı</th><th>Ölçü (piksel)</th><th>Oran</th><th>Dosya</th></tr></thead><tbody>${Object.entries(S.packs).map(([k,p])=>{const z=AD_SIZE[k]; return `<tr class="${k===t?'mine':''}"><td><b>${p.name}</b></td><td class="mono"><b>${z?z.w+' × '+z.h:'—'}</b></td><td>${z?z.r:'—'}</td><td>${z?'JPG, PNG, WebP veya MP4/WebM video · en fazla 15 MB':k==='premium'?'Görsel yok · server adı ve renkleri kullanılır':'Görsel yok · en fazla 110 karakter metin'}</td></tr>`}).join('')}</tbody></table></div><div class="panel-b"><span class="muted" style="font-size:12px">Farklı ölçüdeki görseller alana sığdırılır, kenarlarından kırpılabilir. Yazıları görselin ortasına yakın koyun. Daha net görünüm için iki katı ölçü de yükleyebilirsiniz (ör. ${SZ?SZ.w*2+' × '+SZ.h*2:'2400 × 800'}).</span></div></div>
  <div class="panel"><div class="panel-h"><h2>${P.name} rezervasyonu</h2><span class="muted" style="font-size:12px">Aynı anda en fazla ${P.cap||1} reklam</span></div>
    <form class="panel-b stack" data-form="buyad">
      <div class="fld"><span class="lbl">1 · Süre</span><div class="dur">${[1,7,30].map((d,i)=>`<label for="dur${i}"><input type="radio" name="dur" id="dur${i}" value="${i}" ${i===ui.adDur?'checked':''} data-change="addur">${d} gün<b>${TL(P.p[i])}</b></label>`).join('')}</div></div>
      <div class="fld"><span class="lbl">2 · Başlangıç tarihi</span><div id="adCal">${adCalHtml()}</div></div>
      <div class="fld"><label for="ad_server">3 · Server</label><select class="inp" id="ad_server" data-change="adsrv">${S.servers.filter(s=>s.sec==='pvp').map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}<option value="_new">+ Listede yok, yeni server ekle</option></select></div>
      <div class="stack" id="newSrv" hidden><div class="row3"><div class="fld"><label for="ns_name">Server adı</label><input class="inp" id="ns_name" placeholder="Örn: Göktürk2"></div><div class="fld"><label for="ns_lv">Level aralığı</label><input class="inp" id="ns_lv" placeholder="1-120"></div><div class="fld"><label for="ns_type">Tür</label><select class="inp" id="ns_type">${['Emek','Orta Emek','Farm','Hard','Oldschool','PVM','Full PVP'].map(x=>`<option>${x}</option>`).join('')}</select></div></div>
        <div class="row3"><div class="fld"><label for="ns_url">Web sitesi</label><input class="inp" id="ns_url" placeholder="https://"></div><div class="fld"><label for="ns_c1">Renk 1</label><input class="inp" id="ns_c1" type="color" value="#1d6fa5" style="height:40px;padding:3px"></div><div class="fld"><label for="ns_c2">Renk 2</label><input class="inp" id="ns_c2" type="color" value="#e0a020" style="height:40px;padding:3px"></div></div>
        <div class="fld"><label for="ns_open">Açılış tarihi</label><input class="inp" id="ns_open" type="datetime-local"></div></div>
      ${t==='premium'?'':`${t==='text'?'':`<div class="fld"><label for="ad_title">Başlık</label><input class="inp" id="ad_title" maxlength="60" placeholder="Örn: Büyük açılış bu cuma!"></div>`}
      <div class="fld"><label for="ad_text">${t==='text'?'Şeritte görünecek metin':'Reklam metni'}</label><input class="inp" id="ad_text" maxlength="110" required placeholder="1-120 Orta Emek · Açılışa özel başlangıç paketi"></div>`}
      ${SZ?`<div class="fld"><label for="ad_media">4 · Görseller ve videolar</label><div class="note note-info"><b>Gerekli ölçü: ${SZ.w} × ${SZ.h} piksel (${SZ.r} oran)</b> · JPG, PNG, WebP ya da MP4/WebM video, dosya başına en fazla 15 MB. Birden fazla dosya seçerseniz 5 saniyede bir dönüşümlü gösterilir.</div><input class="inp" id="ad_media" type="file" accept="image/*,video/mp4,video/webm" multiple data-change="admediaprev"><div id="adMediaPrev" class="adprevs"></div></div>`:''}
      <div class="note note-warn">Ödeme bakiyenizden alınır ve reklamınız <b>yönetici onayına</b> düşer. Onaylanınca seçtiğiniz tarihte yayına girer; onaylanmazsa ücret bakiyenize iade edilir.</div>
      <div class="hstack"><button class="btn btn-primary" style="padding:12px 22px">${!u?'Giriş yap ve rezervasyon yap':free?'Yönetici olarak ekle (ücretsiz, onaylı)':'Bakiyeden öde ve onaya gönder'}</button><span id="adSum" class="muted" style="font-size:12.5px">${adSumTxt()}</span></div>
    </form></div>
  ${mine.length?`<div class="panel"><div class="panel-h"><h3>Rezervasyonlarım</h3><span class="muted" style="font-size:12px">Başvurularınız ve yayın tarihleri</span></div>${myAdsTable(mine)}</div>`:''}</div>`;
}
function adSumTxt(){ const u=me(); const P=S.packs[ui.adType]; const di=ui.adDur??1; return `${ui.adStart?'<b>'+dstr(ui.adStart)+'</b> başlangıç · ':'Tarih seçilmedi · '}${[1,7,30][di]} gün · ${can('reklam')?'ücretsiz (yönetici)':TL(P.p[di])}${u?' · Bakiyeniz '+TL(avail(u)):''}`; }
function adCalHtml(){ const t=ui.adType, cap=S.packs[t].cap||1, days=[1,7,30][ui.adDur??1]; const today=dayStart(now()); const sel=ui.adStart&&ui.adStart>=today?ui.adStart:null;
  const cells=[]; const pad=(new Date(today).getDay()+6)%7; for(let i=0;i<pad;i++) cells.push('<span class="cal-e"></span>');
  for(let i=0;i<42;i++){ const ds=dayStart(today+i*D+3*H); const n=adBooked(t,ds); const full=n>=cap; const inSel=sel&&ds>=sel&&ds<sel+days*D; const dd=new Date(ds);
    cells.push(`<button type="button" class="cal-d ${full?'full':n?'part':'free'} ${inSel?'sel':''}" data-act="ad-day" data-k="${ds}" ${full?'disabled':''} aria-label="${dstr(ds)}: ${full?'dolu':(cap-n)+' boş yer'}">${dd.getDate()===1||i===0?`<em>${dd.toLocaleDateString('tr-TR',{month:'short'})}</em>`:''}<b>${dd.getDate()}</b><small>${full?'Dolu':(cap-n)+'/'+cap+' boş'}</small></button>`); }
  const clash=sel?adRangeFree(t,sel,days):0;
  return `<div class="cal-h">${['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(x=>`<span>${x}</span>`).join('')}</div><div class="cal">${cells.join('')}</div>
   <div class="cal-leg"><span><i class="free"></i>Boş</span><span><i class="part"></i>Yer var</span><span><i class="full"></i>Dolu</span><span><i class="sel"></i>Seçiminiz</span></div>
   ${sel?(clash?`<div class="note note-bad"><b>${dstr(clash)}</b> tarihi dolu. ${days} günlük reklam için başka bir başlangıç günü seçin.</div>`:`<div class="note note-ok">Seçiminiz: <b>${dstr(sel)} – ${dstr(sel+days*D-1)}</b> (${days} gün). Bu tarihler boş.</div>`):'<div class="muted" style="font-size:12.5px">Takvimden yeşil veya sarı bir gün seçin. Kırmızı günlerde bu alan tamamen dolu.</div>'}`; }
function adRefresh(){ const c=$('#adCal'); if(c) c.innerHTML=adCalHtml(); const s=$('#adSum'); if(s) s.innerHTML=adSumTxt(); }
function adPending(){ const L=S.ads.filter(a=>adSt(a)==='onay').sort((a,b)=>(a.bookedAt||0)-(b.bookedAt||0));
  return `<div class="panel"><div class="panel-h"><h3>Onay bekleyen reklamlar</h3><span class="pill ${L.length?'p-bekliyor':'p-tamam'}">${L.length} bekliyor</span></div>${L.length?L.map(a=>{const s=srv(a.server)||{name:a.title||'-',c:['#333','#777']}; const U=user(a.owner); const z=AD_SIZE[a.type]; const clash=adRangeFree(a.type,a.start,0);
    return `<div class="adq"><div class="adpv ${a.type}" style="--c1:${s.c[0]};--c2:${s.c[1]}">${adMedia(a)}<span>${esc(a.title||s.name)}</span></div><div class="stack" style="gap:4px;min-width:0;flex:1"><b>${S.packs[a.type].name} · ${esc(s.name)}</b><span class="muted" style="font-size:12.5px">${dstr(a.start)} – ${dstr(a.until-1)} · ${a.days||Math.round((a.until-a.start)/D)} gün · ${TL(a.price||0)} · ${esc(U.name)} (${esc(fullName(U))}) · ${ago(a.bookedAt||a.start)} başvurdu</span>${a.text?`<span style="font-size:13px">${esc(a.text)}</span>`:''}<span class="muted" style="font-size:12px">${(a.media||[]).length} görsel/video${z?' · gerekli ölçü '+z.w+'×'+z.h:''}${clash?'':''}</span>
      <form class="hstack" data-form="adrej" data-id="${a.id}"><button type="button" class="btn btn-sm btn-ok" data-act="ad-ok" data-id="${a.id}">Onayla ve yayına al</button><input class="inp" id="adr_${a.id}" placeholder="Red nedeni (üyeye iletilir)" style="flex:1;min-width:160px"><button class="btn btn-sm btn-bad">Reddet ve iade et</button></form></div></div>`}).join(''):'<div class="empty">Onay bekleyen reklam yok.</div>'}</div>`; }
/* ================== mesajlar ================== */
function convOf(a,b){ return S.dms.find(c=>(c.a===a&&c.b===b)||(c.a===b&&c.b===a)); }
function peerOf(c,me_){ return c.a===me_?c.b:c.a; }
function unreadDM(uid_){ return S.dms.filter(c=>(c.a===uid_||c.b===uid_)&&c.msgs.length&&c.msgs[c.msgs.length-1].f!==uid_&&c.msgs[c.msgs.length-1].t>((c.read||{})[uid_]||0)).length; }
function vMessages(peer){
  const u=me(); if(!u) return `<div class="wrap">${emptyBox('Mesajlarınızı görmek için giriş yapın','','<button class="btn btn-primary" data-act="login">Giriş Yap</button>')}</div>`;
  const convs=S.dms.filter(c=>c.a===u.id||c.b===u.id).sort((x,y)=>(y.msgs.slice(-1)[0]?.t||0)-(x.msgs.slice(-1)[0]?.t||0));
  let c=peer?convOf(u.id,peer):null; const p=peer?user(peer):null;
  if(c){ c.read=c.read||{}; c.read[u.id]=now(); save(); }
  const ctx=ui.dmCtx?lst(ui.dmCtx):null;
  return `<div class="wrap"><div class="page-h"><div><h1>Mesajlar</h1><p>Telefon numarası, link, e-posta ve site dışı ticaret teklifleri otomatik gizlenir. Güvenliğiniz için tüm ödemeleri site üzerinden yapın.</p></div></div>
  <div class="panel dm-l"><div class="dm-list">${convs.map(x=>{const pr=user(peerOf(x,u.id)); const last=x.msgs.slice(-1)[0]; const un=last&&last.f!==u.id&&last.t>((x.read||{})[u.id]||0); return `<a href="#mesajlar-${pr.id}" class="${peer===pr.id?'on':''}">${av(pr)}<span style="min-width:0;flex:1"><b>${esc(pr.name)}</b> ${un?'<i class="dot-un"></i>':''}<small>${last?esc(last.x).slice(0,44):''}</small>${seenTxt(pr)}</span></a>`}).join('')||'<div class="empty">Henüz mesajınız yok</div>'}</div>
    <div class="dm-main">${p?`<div class="panel-h">${av(p)}<div style="flex:1;min-width:0"><b>${esc(p.name)}</b> ${p.verified?'<span class="vchk">✔</span>':''}<div>${seenTxt(p)}</div></div><button class="btn btn-sm" data-act="sms-user" data-id="${p.id}">SMS ile ulaş · ${TL(S.sms.userPrice)}</button></div>
      ${ctx&&ctx.seller===p.id?`<a href="#ilan-${ctx.id}" class="dm-ctx">${lthumb(ctx,36)}<span><small class="muted">İlan #${ctx.no} hakkında</small><br><b>${esc(ctx.title)}</b> · ${TL(ctx.price)}</span></a>`:''}
      <div class="chat" id="dmChat">${(c?c.msgs:[]).map(m=>`<div class="msg ${m.f===u.id?'mine':''}">${esc(m.x)}${m.flag?'<em class="flagnote">İletişim bilgisi gizlendi</em>':''}<small>${ago(m.t)}</small></div>`).join('')||'<div class="msg sys">İlk mesajı siz yazın. Site dışı ödeme isteyenlere itibar etmeyin.</div>'}</div>
      <form class="chat-in" data-form="dm" data-id="${p.id}"><input class="inp" id="dmmsg" placeholder="Mesaj yazın…" autocomplete="off"><button class="btn btn-primary">Gönder</button></form>`
      :emptyBox('Bir konuşma seçin','İlan sayfasındaki “Satıcıya mesaj” ile yeni konuşma başlatabilirsiniz.')}</div></div></div>`;
}
function vNotifs(){
  const u=me(); if(!u) return `<div class="wrap">${emptyBox('Bildirimleri görmek için giriş yapın','','<button class="btn btn-primary" data-act="login">Giriş Yap</button>')}</div>`;
  const N=S.notifs.filter(n=>n.u===u.id); const un=N.filter(n=>!n.read).length, rd=N.length-un;
  return `<div class="wrap" style="max-width:760px"><div class="page-h"><div><h1>Bildirimler</h1><p>${un?`<b>${un}</b> okunmamış bildiriminiz var.`:'Tüm bildirimleriniz okundu.'}</p></div><div class="hstack"><button class="btn btn-sm" data-act="n-readall" ${un?'':'disabled'}>Tümünü okundu işaretle</button><button class="btn btn-sm btn-bad" data-act="n-delread" ${rd?'':'disabled'}>Okunanları sil${rd?' ('+rd+')':''}</button></div></div>
  <div class="panel"><div class="feed notif">${N.map(n=>`<a href="${esc(safeUrl(n.link||'#bildirimler'))}" class="${n.read?'':'un'}" data-act="n-open" data-id="${n.id}"><span>${n.read?'':'<i class="ndot" aria-label="Okunmadı"></i>'}${esc(n.x)}</span><time>${ago(n.t)}</time></a>`).join('')||'<div><span class="muted">Bildiriminiz yok</span></div>'}</div></div></div>`;
}

