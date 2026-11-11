/* ================== P0b: canlı site ekranları (yalnız --prod derlemesinde) ==================
   Sunucudan henüz gelmeyen bölümler "Yakında" gösterir; demo hesap seçici, demo sıfırlama ve canlı destek balonu gizlidir.
   Sunucuya bağlı bölümler: üyelik/giriş/2FA, Hesabım (profil, 2FA, IBAN), bildirimler, Yönetim › Bugün, Arama, Üyeler,
   Çalışanlar & yetkiler, E-posta & SMS.                                                                              */
/* 98-p0b-actions.js ile paylaşılanlar (blok dışında: klasik betikler arası görünür) */
let P_TFA=null, P_TFAT=null;
const P_REF = () => { try{ return (localStorage.getItem('yangpazar_ref')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,40); }catch(e){ return ''; } };
if(YP_PROD){
const P_SOON_R = r => /^(siparis-|borsa$|metin2-ep$|cekilis$|reklam-ver$|mesajlar|ortaklik$|yang-fiyatlari$|widget-)/.test(r);
const P_SOON_T = {
  'siparis-':['Siparişler çok yakında','Güvenli havuzlu alışveriş bir sonraki güncellemeyle açılıyor.'],
  'borsa':['Yang Borsası çok yakında','Borsa alım ve satış emirleri sonraki güncellemelerde açılıyor.'],
  'metin2-ep':['EP mağazası çok yakında','Anında EP kodu satışı sonraki güncellemelerde açılıyor.'],
  'cekilis':['Çekiliş & şans çarkı çok yakında','Kampanyalar sonraki güncellemelerde açılıyor.'],
  'reklam-ver':['Reklam satışı çok yakında','Server reklam alanları sonraki güncellemelerde açılıyor.'],
  'mesajlar':['Mesajlar çok yakında','Üyeler arası mesajlaşma sonraki güncellemelerde açılıyor.'],
};
function pSoon(t,s,btn){ return `<div class="panel empty psoon"><span class="chip">Yakında</span><b style="margin-top:8px">${esc(t)}</b>${esc(s||'')}${btn?`<div style="margin-top:12px">${btn}</div>`:''}</div>`; }
function pSoonPage(r){ const k=Object.keys(P_SOON_T).find(x=>r===x||r.startsWith(x)); const [t,s]=P_SOON_T[k]||['Bu bölüm çok yakında','Bu bölüm bir sonraki güncellemeyle açılıyor.'];
  return `<div class="wrap" style="max-width:760px">${pSoon(t,s,'<a class="btn btn-primary" href="#home">Ana sayfaya dön</a>')}</div>`; }

/* ---- yönlendirme: yakında sayfaları, açılış verisi beklenirken ---- */
{ const v0=view; view=function(r){
    if(API.booting) return `<div class="wrap">${pLoading('Site yükleniyor…')}</div>`;
    if(API.bootErr&&!API.live) return `<div class="wrap">${emptyBox('Sunucuya bağlanılamadı',esc(API.bootErr),'<button class="btn btn-primary" data-act="p-reload">Tekrar dene</button>')}</div>`;
    if(P_SOON_R(r)) return pSoonPage(r);
    return v0(r); }; }
/* davet bağlantısı: kod sunucuda doğrulanır; burada yalnız saklanır */
{ const r0=render; render=function(){ const h=route(); if(/^davet-[A-Za-z0-9]+$/.test(h)){ const c=h.slice(6).toUpperCase(); try{ localStorage.setItem('yangpazar_ref',c); }catch(e){}
      history.replaceState(null,'','#home'); if(!me()) setTimeout(()=>{ toast('Davet kodun kaydedildi; üye olurken otomatik eklenecek.'); mRegister(); },300); }
    return r0.apply(this,arguments); }; }

/* ---- kabuk: demo seçici yok, canlı destek balonu P6'da ---- */
{ const f=renderStrip; renderStrip=function(){ f.apply(this,arguments); document.querySelectorAll('#strip .demo-sw').forEach(x=>x.remove()); }; }
renderLS=function(){ const el=$('#ls'); if(el) el.innerHTML=''; };
{ const f=admShell; admShell=function(o){ const out=f(o);
    const lo='<div class="asb-sw"><button type="button" class="btn btn-sm" data-act="logout" style="width:100%">Çıkış yap</button></div>';
    return out.replace(/<label class="asb-sw"[\s\S]*?<\/label>/,lo).replace(/<div class="adrawer-sw">[\s\S]*?<\/label><\/div>/,'').replace('<a class="btn" href="#home">Siteye dön</a>','<a class="btn" href="#home">Siteye dön</a><button type="button" class="btn" data-act="logout">Çıkış yap</button>'); }; }

/* ---- giriş / üyelik ---- */
{ const f=mRegister; mRegister=function(err){ f(err); const p=$('#rg_p'); if(p){ p.minLength=8; const fl=p.closest('.fld'); if(fl&&!fl.querySelector('.muted')) fl.insertAdjacentHTML('beforeend','<span class="muted" style="font-size:12px">En az 8 karakter.</span>'); }
    const c=P_REF(), r=$('#rg_ref'); if(c&&r&&!r.value) r.value=c; }; }
/* 2 adımlı doğrulama penceresi (kod sunucuda üretilir, e-posta/SMS ile gider) */
function pTfa(t,err){ if(t){ P_TFA=Object.assign({},t,{until:Date.now()+(+t.wait||0)*1000}); } const T=P_TFA; if(!T) return;
  const wait=()=>Math.max(0,Math.ceil((T.until-Date.now())/1000)); const w=wait();
  modal(mWrap('Doğrulama kodu',`<form class="stack" data-form="tfaf"><div class="note note-info">${T.ch==='sms'?'Telefonunuza':'E-posta adresinize'} (<b>${esc(T.dest||'')}</b>) 6 haneli bir kod gönderdik. Kod birkaç dakika geçerlidir.</div>
    <div class="fld"><label for="tf_code">Doğrulama kodu</label><input class="inp mono tfacode" id="tf_code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>${err?`<div class="note note-bad">${esc(err)}</div>`:''}
    <button class="btn btn-primary">${T.purpose==='login'?'Doğrula ve giriş yap':'Doğrula'}</button>
    <div class="hstack" style="justify-content:space-between"><button type="button" class="btn btn-sm" data-act="tfa-resend" id="tfaRe" ${w?'disabled':''}>${w?`Tekrar gönder (${w} sn)`:'Kodu tekrar gönder'}</button>${T.alt?`<button type="button" class="btn btn-sm" data-act="tfa-switch">${T.ch==='sms'?'E-postaya gönder':'SMS olarak gönder'}</button>`:''}</div></form>`));
  setTimeout(()=>{ const i=$('#tf_code'); if(i) i.focus(); },50);
  clearInterval(P_TFAT); P_TFAT=setInterval(()=>{ const b=$('#tfaRe'); if(!b||!P_TFA){ clearInterval(P_TFAT); return; } const x=wait(); if(x>0){ b.disabled=true; b.textContent=`Tekrar gönder (${x} sn)`; } else { b.disabled=false; b.textContent='Kodu tekrar gönder'; clearInterval(P_TFAT); } },1000); }

/* ---- Hesabım ---- */
const P_TABS=[['ozet','Özet'],['ilan','İlanlarım'],['profil','Profil ve güvenlik'],['banka','Banka hesaplarım']];
vAccount=function(){ const u=me(); if(!u) return `<div class="wrap">${emptyBox('Hesabınızı görmek için giriş yapın','','<button class="btn btn-primary" data-act="login">Giriş Yap</button>')}</div>`;
  if(!P_TABS.some(([k])=>k===ui.tab)) ui.tab=ui.tab==='cek'?'banka':'ozet';
  const IB=u.ibans||[]; const nn=S.notifs.filter(n=>n.u===u.id&&!n.read).length; let body='';
  if(ui.tab==='ozet') body=`<div class="kpis"><div class="kpi hl"><small>Toplam bakiye</small><b>${TL(avail(u))}</b><span class="muted" style="font-size:12px">Çekilebilir ${TL(u.bal)} · Sadece alışveriş ${TL(u.bonus||0)}</span></div><div class="kpi"><small>Puanınız</small><b>${NUM(u.pts)}</b></div><div class="kpi"><small>Okunmamış bildirim</small><b>${nn}</b></div></div>
    <div class="note note-info">Hesabınız hazır. İlan verebilir ve ilanlarınızı yönetebilirsiniz. Güvenli satın alma, bakiye yükleme ve para çekme çok yakında açılıyor; açıldığında bildirim alacaksınız.</div>
    <div class="hstack"><a class="btn btn-primary" href="#ilan-ver">İlan ver</a><button class="btn" data-act="tab" data-t="ilan">İlanlarım</button><a class="btn" href="#bildirimler">Bildirimler</a><button class="btn" data-act="tab" data-t="profil">Profil ve güvenlik</button><button class="btn" data-act="tab" data-t="banka">Banka hesaplarım</button></div>
    <div class="panel panel-b stack"><div class="eyebrow">Davet kodunuz</div><div class="cprow"><span><b class="mono" style="font-size:16px">${esc(u.refCode||refCode(u))}</b><br><span class="muted" style="font-size:12px">Arkadaşlarınız üye olurken bu kodu yazabilir.</span></span><button class="btn btn-sm" data-act="copy" data-v="${esc(u.refCode||refCode(u))}">Kodu kopyala</button></div></div>`;
  if(ui.tab==='profil'){ const tp=tfaPanel(u).replace(/id="tf_sms"/,API.smsOn?'id="tf_sms"':'id="tf_sms" disabled').replace(/(<b>SMS ile kod<\/b><span>)[^<]*/,API.smsOn?'$1'+esc(u.tel?maskTel(u.tel):'Önce telefon ekleyin'):'$1SMS gönderimi henüz açık değil');
    body=`<div class="panel panel-b"><form class="stack" data-form="profile" style="max-width:520px"><div class="note note-info">Ad, soyad ve telefonunuz diğer üyelere gösterilmez.</div>
    <div class="row2"><div class="fld"><label for="pf_ad">Ad</label><input class="inp" id="pf_ad" value="${esc(u.ad||'')}" required ${tcOk(u)?'readonly title="TC ile doğrulandı"':''}></div><div class="fld"><label for="pf_soyad">Soyad</label><input class="inp" id="pf_soyad" value="${esc(u.soyad||'')}" required ${tcOk(u)?'readonly title="TC ile doğrulandı"':''}></div></div>
    <div class="row2"><div class="fld"><label for="pf_tel">Cep telefonu</label><input class="inp mono" id="pf_tel" value="${esc(u.tel||'')}" placeholder="05xx xxx xx xx"></div><div class="fld"><label for="pf_mail">E-posta</label><input class="inp" id="pf_mail" type="email" value="${esc(u.email||'')}"></div></div>
    <div class="row2"><div class="fld"><label for="pf_pass">Yeni şifre (değiştirmek için)</label><input class="inp" id="pf_pass" type="password" autocomplete="new-password" minlength="${u.admin||u.staff?10:8}"></div><div class="fld"><label for="pf_cur">Mevcut şifre</label><input class="inp" id="pf_cur" type="password" autocomplete="current-password"><span class="muted" style="font-size:12px">Şifre veya e-posta değiştirirken gerekir.</span></div></div>
    <button class="btn btn-primary">Bilgilerimi kaydet</button></form></div>${tp}
    <div class="panel panel-b hstack" style="justify-content:space-between;max-width:560px"><span class="muted" style="font-size:13px">Bu cihazdaki oturumu kapatın.</span><button class="btn" data-act="logout">Çıkış yap</button></div>`; }
  if(ui.tab==='ilan') body=pMyListings(u);
  if(ui.tab==='banka') body=`<div class="panel"><div class="panel-h"><h3>Kayıtlı IBAN'larım</h3><span class="muted" style="font-size:12px">En fazla 5 hesap</span></div><div class="panel-b stack">
    <div class="note note-info">IBAN'lar şifreli saklanır ve size maskeli gösterilir. Hesap sizin adınıza olmalıdır. Para çekme çok yakında açılıyor.</div>
    ${IB.map(b=>`<div class="cprow"><span><b>${esc(b.bank)}</b> · ${esc(b.name)}<br><span class="mono">${esc(b.iban)}</span></span><button class="btn btn-sm btn-bad" data-act="iban-del" data-id="${esc(b.id)}">Sil</button></div>`).join('')||'<span class="muted">Kayıtlı IBAN yok.</span>'}
    <form class="row3" data-form="ibanadd" style="align-items:end"><div class="fld"><label for="ia_b">Banka</label><select class="inp" id="ia_b">${TRBANKS.map(b=>`<option>${esc(b)}</option>`).join('')}</select></div><div class="fld"><label for="ia_n">Ad soyad</label><input class="inp" id="ia_n" value="${esc(fullName(u))}" required></div><div class="fld"><label for="ia_i">IBAN</label><input class="inp mono" id="ia_i" required placeholder="TR.."></div><button class="btn btn-sm">IBAN kaydet</button></form></div></div>`;
  return `<div class="wrap"><div class="page-h"><div><h1>Hesabım</h1><p>${esc(u.name)} · ${esc(fullName(u))} · Üyelik: ${esc(u.joined||'')}</p></div><div class="hstack">${isPanel()?'<a class="btn btn-primary" href="#yonetim">Yönetim paneline git</a>':''}<button class="btn" data-act="logout">Çıkış yap</button></div></div>
  <div class="acc"><div class="stack" style="gap:12px"><nav class="panel tabs">${P_TABS.map(([k,t])=>`<button data-act="tab" data-t="${k}" class="${ui.tab===k?'on':''}">${t}</button>`).join('')}</nav></div><div class="stack">${body}</div></div></div>`; };

/* ---- Yönetim ---- */
const P_ADM = {panel:1, ara:1, uye:['uyeler'], calisan:1, sms:1, ilan:1, server:1, bakim:1};
function pAdmPage(P,it,fn){ const SB=admSubs(it); const sub=P.sub&&SB.some(s=>s.s===P.sub)?P.sub:(SB[0]||{}).s||null; if(sub) (ui.asub=ui.asub||{})[it.k]=sub; ui.atab=it.k; ui.admDirty=false;
  const r=fn(sub)||{}; return admShell({P:Object.assign({},P,{k:it.k}),it,sub,page:aPage({title:it.l,desc:r.desc!=null?r.desc:it.desc,actions:r.actions||'',subs:aSubs(it,sub),body:`<div class="stack">${r.body||''}</div>`}),over:''}); }
const pAdmLoad = (k,path,fn,ttl) => need(k, ()=>call('GET',path,null,{quiet:true}).then(j=>fn?fn(j.data):j.data), ttl);
const pErrBox = d => d&&d.err?`<div class="note note-bad">${esc(d.err)}</div>`:'';
{ const v0=vAdmin; vAdmin=function(P){ P=P||admParse('yonetim'); if(!isPanel()) return v0(P);
    const it=admItem(P.k); if(!it||!admVis(it)) return v0(P);
    const sv=P_ADM[it.k];
    if(!sv) return pAdmPage(P,it,()=>({body:it.k==='entegrasyon'?pSoon('Entegrasyonlar çok yakında','PayTR, Paraşüt ve Bizim Hesap bağlantıları ödeme altyapısıyla birlikte (P2–P3) bu sayfaya taşınacak.',can('sms')?'<a class="btn btn-primary" href="#yonetim/sms/eposta">E-posta (Brevo / Mailjet) ayarları</a>':''):pSoon(it.l+' çok yakında','Bu bölüm sunucuya taşınıyor; sonraki güncellemelerde burada çalışacak.')}));
    if(Array.isArray(sv)&&P.sub&&!sv.includes(P.sub)) return pAdmPage(P,it,()=>({body:pSoon('Bu bölüm çok yakında','Sonraki güncellemelerde burada çalışacak.')}));
    if(it.k==='sms') return pAdmPage(P,it,sub=>Object.assign({desc:'E-posta servisi (Brevo API, Mailjet API ya da SMTP), SMS sağlayıcısı (NetGSM) ve gönderim kayıtları.'},pSmsPage(sub)));
    if(it.k==='uye'){ const q=P.q||''; const d=pAdmLoad('adm:users:'+q,'admin/users?limit=100'+(q?'&q='+encodeURIComponent(q):''),x=>{ (x.users||[]).forEach(apiUpsertUser); return x; },15000);
      if(!d) return pAdmPage(P,it,()=>({body:pLoading()})); if(d.err) return pAdmPage(P,it,()=>({body:pErrBox(d)})); }
    if(it.k==='calisan'){ const d=pAdmLoad('adm:staff','admin/staff',x=>{ (x.staff||[]).forEach(apiUpsertUser); return x; },30000);
      if(can('uye')||can('ara')) pAdmLoad('adm:users:','admin/users?limit=100',x=>{ (x.users||[]).forEach(apiUpsertUser); return x; },30000);
      if(!d) return pAdmPage(P,it,()=>({body:pLoading()})); if(d.err) return pAdmPage(P,it,()=>({body:pErrBox(d)})); }
    if(it.k==='ara'&&P.q){ const d=pAdmLoad('adm:search:'+P.q,'admin/search?q='+encodeURIComponent(P.q),x=>{ (x.users||[]).forEach(apiUpsertUser); return x; },15000);
      if(!d) return pAdmPage(P,it,()=>({body:pLoading('Aranıyor…')})); }
    let out=v0(P);
    if(it.k==='uye') out=out.replace(/<a class="btn btn-primary" href="#yonetim\/uye\/bakiye">Bakiye düzelt<\/a>/,'');
    if(it.k==='calisan'&&!(can('uye')||can('ara'))) out=out.replace(/<div class="fld" style="max-width:340px"><label for="sa_ex">[\s\S]*?<\/select>[\s\S]*?<\/span><\/div>/,'');
    return out; }; }
/* Bugün: iş kuyruğu sayıları ve KPI'lar sunucudan (GET admin/today) */
admToday=function(){ const dd=new Date().toLocaleDateString('tr-TR',{weekday:'long',day:'numeric',month:'long'}); const d=pAdmLoad('adm:today','admin/today',null,20000); const u=me();
  const desc=dd[0].toLocaleUpperCase('tr-TR')+dd.slice(1)+'.';
  if(!d) return {desc,actions:'',body:pLoading()}; if(d.err) return {desc,actions:'',body:pErrBox(d)};
  const Q=d.queues||{}, tot=Object.values(Q).reduce((s,n)=>s+(+n||0),0), K=d.kpi, O=d.outbox||{};
  let h=`${u&&!u.tfa?`<div class="note note-warn">Hesabınızda <b>2 adımlı doğrulama kapalı</b>. Güvenliğiniz için <a href="#hesabim" data-act="tab" data-t="profil" style="text-decoration:underline">Hesabım › Profil ve güvenlik</a> bölümünden e-posta ile açmanızı öneririz.</div>`:''}
    <div class="sec-h"><h2>İş kuyruğu</h2><span>Siparişler, ödemeler ve destek talepleri sonraki güncellemelerle burada görünecek</span></div>
    ${tot?`<div class="kpis">${Object.entries(Q).filter(([,n])=>n).map(([k,n])=>`<div class="kpi"><small>${esc(k)}</small><b>${n}</b></div>`).join('')}</div>`:'<div class="panel empty"><b>Bekleyen iş yok.</b>Yeni talepler geldiğinde burada görünür.</div>'}
    ${can('sms')?`<div class="sec-h"><h2>E-posta & SMS kuyruğu</h2></div><div class="kpis"><div class="kpi"><small>Gönderim bekleyen</small><b>${NUM(O.queued)}</b></div><div class="kpi ${O.failed?'hl':''}"><small>Gönderilemeyen</small><b>${NUM(O.failed)}</b><a class="muted" style="font-size:12px;text-decoration:underline" href="#yonetim/sms/kayitlar">Gönderim kayıtları</a></div></div>`:''}`;
  if(K) h+=`<div class="sec-h"><h2>Üyeler</h2><span>Gelir ve sipariş göstergeleri para işlemleriyle (P2) gelecek</span></div>
    <div class="kpis"><div class="kpi hl"><small>Toplam üye</small><b>${NUM(K.users)}</b></div><div class="kpi"><small>Bugün katılan</small><b>${NUM(K.newToday)}</b></div><div class="kpi"><small>Çevrimiçi (5 dk)</small><b>${NUM(K.online)}</b></div><div class="kpi"><small>Çalışan</small><b>${NUM(K.staff)}</b></div><div class="kpi"><small>Askıda</small><b>${NUM(K.banned)}</b></div></div>`;
  return {desc:desc+' '+(tot?tot+' iş bekliyor.':'Şu an bekleyen iş yok.'),actions:'',body:h}; };
/* Komut araması: üyeler sunucudan da aranır */
{ const f=cmdRender; cmdRender=function(inp){ f(inp); if(!can('ara')) return; const q=inp.value.trim(); if(yp_len(q)<2) return; clearTimeout(inp._st);
    inp._st=setTimeout(()=>{ call('GET','admin/search?q='+encodeURIComponent(q),null,{quiet:true}).then(j=>{ (j.data.users||[]).forEach(apiUpsertUser); if(inp.isConnected&&inp.value.trim()===q) f(inp); }).catch(()=>{}); },250); }; }
const yp_len = s => [...String(s||'')].length;
/* Üye detayı (GET admin/users/{id}) */
mUser=function(id){ if(!can('uye')) return; modal(mWrap('Üye',pLoading()));
  call('GET','admin/users/'+encodeURIComponent(id),null,{quiet:true}).then(j=>{ const U=apiUpsertUser(j.data.user); const R=j.data.user; if(!$('.mb')) return;
    modal(`<div class="md" style="width:min(720px,100%)" role="dialog" aria-label="Üye"><div class="md-h"><h3>${esc(U.name)}</h3><button class="md-x" data-act="close" aria-label="Kapat">×</button></div><div class="md-b">
      <div class="sum"><div><span class="muted">Ad soyad</span><b>${esc(fullName(U))||'-'}</b></div><div><span class="muted">Telefon</span><b class="mono">${esc(U.tel||'-')}</b></div><div><span class="muted">E-posta</span><b>${esc(U.email||'-')}</b></div><div><span class="muted">Durum</span>${seenTxt(U)}</div>
        <div><span class="muted">Hesap</span><b>${U.admin?'Yönetici':U.staff?'Çalışan':'Üye'}${U.banned?' · <span class="neg">Askıda</span>':''}</b></div><div><span class="muted">Doğrulanmış satıcı</span><b>${U.verified?'Evet':'Hayır'}</b></div><div><span class="muted">2 adımlı doğrulama</span><b>${R.tfa?'Açık':'Kapalı'}</b></div><div><span class="muted">Üyelik</span><b>${esc(U.joined||'-')}</b></div>
        <div><span class="muted">Bakiye</span><b>${TL(avail(U))}</b></div><div><span class="muted">TC kimlik</span><b>${R.tcOk?'Doğrulandı':'Doğrulanmadı'}</b></div></div>
      ${!U.admin?`<div class="hstack"><button class="btn btn-sm" data-act="u-ver" data-id="${esc(U.id)}">${U.verified?'Doğrulamayı kaldır':'Doğrula'}</button><button class="btn btn-sm ${U.banned?'':'btn-bad'}" data-act="u-ban" data-id="${esc(U.id)}">${U.banned?'Yasağı kaldır':'Yasakla'}</button></div>`:''}
      <div class="eyebrow">Kayıtlı IBAN'lar (maskeli)</div>${(R.ibans||[]).length?`<div class="feed">${R.ibans.map(b=>`<div><span><b>${esc(b.bank)}</b> · ${esc(b.name)}</span><span class="mono">${esc(b.iban)}</span></div>`).join('')}</div>`:'<span class="muted" style="font-size:12.5px">Kayıt yok.</span>'}
    </div></div>`); }).catch(e=>{ if($('.mb')) modal(mWrap('Üye',`<div class="note note-bad">${esc(apiErr(e))}</div>`)); }); };

/* E-posta & SMS (Brevo API / Mailjet API / SMTP; gizli alanlar maskeli, boş bırakılırsa korunur) */
const P_PROV = [['brevo','Brevo API (önerilir)'],['mailjet','Mailjet API'],['smtp','SMTP sunucusu'],['','Seçilmedi (yalnız hosting yedeği)']];
const pSec = (id,label,val,hint) => `<div class="fld"><label for="${id}">${label}</label><input class="inp mono" id="${id}" type="password" autocomplete="new-password" value="" placeholder="${val?'Kayıtlı · değiştirmek için yeni değeri yazın':'Girilmedi'}">${val?`<span class="muted" style="font-size:12px">Kayıtlı: <span class="mono">${esc(val)}</span></span>`:hint?`<span class="muted" style="font-size:12px">${hint}</span>`:''}</div>`;
function pMailForm(M,st){ const pv=M.provider||''; const g=(p,html)=>`<div class="stack" data-prov="${p}" ${pv===p?'':'hidden'}>${html}</div>`;
  return `<form class="stack" data-form="mailset"><div class="panel panel-b stack"><div class="eyebrow">E-posta gönderimi</div>
    <div class="note note-info">Doğrulama kodları ve bildirim e-postaları seçtiğiniz servis üzerinden sunucudan gönderilir. Anahtar ve şifreler sunucuda şifreli saklanır, burada yalnız maskeli görünür.</div>
    <div class="row3"><label class="chk" for="ml_on"><input type="checkbox" id="ml_on" ${M.on?'checked':''}> E-posta gönderimi açık</label><div class="fld"><label for="ml_pv">Sağlayıcı</label><select class="inp" id="ml_pv" data-change="pmprov">${P_PROV.map(([k,v])=>`<option value="${k}" ${pv===k?'selected':''}>${v}</option>`).join('')}</select></div><div class="fld"><label for="ml_hr">Saatlik sınır (olağan e-postalar)</label><input class="inp" id="ml_hr" type="number" min="1" value="${+M.hourly||80}"></div></div>
    <div class="row2"><div class="fld"><label for="ml_fn">Gönderen adı</label><input class="inp" id="ml_fn" value="${esc(M.fromName||'')}" placeholder="${esc(S.set.siteName)}"></div><div class="fld"><label for="ml_fr">Gönderen adresi</label><input class="inp mono" id="ml_fr" type="email" value="${esc(M.from||'')}" placeholder="noreply@alanadiniz.com"><span class="muted" style="font-size:12px">Sağlayıcıda doğrulanmış olmalı.</span></div></div>
    ${g('brevo',`<div class="row2">${pSec('ml_bk','Brevo API anahtarı',M.brevo_key,'Brevo › SMTP & API › API Keys (xkeysib-…)')}</div>`)}
    ${g('mailjet',`<div class="row2">${pSec('ml_mk','Mailjet API Key',M.mailjet_key,'Mailjet › Account › API Keys')}${pSec('ml_ms','Mailjet Secret Key',M.mailjet_secret)}</div>`)}
    ${g('smtp',`<div class="row3"><div class="fld"><label for="ml_h">SMTP sunucusu</label><input class="inp mono" id="ml_h" value="${esc(M.smtp_host||'')}" placeholder="smtp-relay.brevo.com"></div><div class="row2"><div class="fld"><label for="ml_p">Port</label><input class="inp mono" id="ml_p" type="number" value="${+M.smtp_port||587}"></div><div class="fld"><label for="ml_sc">Güvenlik</label><select class="inp" id="ml_sc">${[['tls','TLS'],['ssl','SSL'],['','Yok']].map(([k,v])=>`<option value="${k}" ${(M.smtp_sec||'')===k?'selected':''}>${v}</option>`).join('')}</select></div></div><div class="fld"><label for="ml_u">Kullanıcı</label><input class="inp mono" id="ml_u" value="${esc(M.smtp_user||'')}" autocomplete="off"></div></div><div class="row2">${pSec('ml_pw','SMTP şifresi',M.smtp_pass)}</div>`)}
    <label class="chk" for="ml_fb"><input type="checkbox" id="ml_fb" ${M.fallback?'checked':''}> Servis çalışmazsa hostingin kendi e-posta gönderimini yedek olarak kullan</label>
    ${st?`<div class="muted" style="font-size:12.5px">Son bir saatte gönderilen: <b>${NUM(st.mailLastHour)}</b> e-posta · kuyrukta <b>${NUM(st.queued)}</b>${st.last?` · son gönderim: ${esc(({sent:'gönderildi',failed:'gönderilemedi',queued:'kuyrukta',sending:'gönderiliyor'})[st.last.status]||st.last.status)}${st.last.provider?' ('+esc(st.last.provider)+')':''}${st.last.last_error&&st.last.status!=='sent'?' · '+esc(st.last.last_error):''}`:''}</div>`:''}
    </div>${aSave('E-posta ayarlarını kaydet')}</form>
  <form class="panel panel-b stack" data-form="mailtest"><div class="eyebrow">Deneme e-postası gönder</div><div class="row3" style="align-items:end"><div class="fld"><label for="mt_to">E-posta adresi</label><input class="inp mono" id="mt_to" type="email" required placeholder="ornek@mail.com" value="${esc((me()||{}).email||'')}"></div><button class="btn btn-sm">Gönder</button></div><span class="muted" style="font-size:12px">Önce ayarları kaydedin; deneme kayıtlı ayarlarla gönderilir.</span></form>`; }
function pSmsForm(s,st){ return `<form class="stack" data-form="smsset"><div class="panel panel-b stack"><div class="eyebrow">SMS sağlayıcı</div>
    <div class="note note-info">SMS'ler NetGSM üzerinden sunucudan gönderilir. SMS başlığınızın (gönderen adı) NetGSM'de onaylı olması gerekir. Şifre sunucuda şifreli saklanır.</div>
    <div class="row3"><label class="chk" for="sm_on"><input type="checkbox" id="sm_on" ${s.on?'checked':''}> SMS gönderimi açık</label><div class="fld"><label for="sm_p">Sağlayıcı</label><select class="inp" id="sm_p"><option value="netgsm" selected>NetGSM</option></select></div><div class="fld"><label for="sm_h">Başlık (gönderen adı)</label><input class="inp mono" id="sm_h" value="${esc(s.header||'')}" maxlength="11"></div></div>
    <div class="row3"><div class="fld"><label for="sm_u">API kullanıcı adı</label><input class="inp mono" id="sm_u" value="${esc(s.user||'')}" autocomplete="off"></div>${pSec('sm_pw','API şifresi',s.pass)}<div class="fld"><label for="sm_hr">Saatlik sınır</label><input class="inp" id="sm_hr" type="number" min="1" value="${+s.hourly||60}"></div></div>
    ${st?`<div class="muted" style="font-size:12.5px">Son bir saatte gönderilen: <b>${NUM(st.smsLastHour)}</b> SMS</div>`:''}
    </div>${aSave('SMS ayarlarını kaydet')}</form>
  <form class="panel panel-b stack" data-form="smstest"><div class="eyebrow">Deneme SMS'i gönder</div><div class="row3" style="align-items:end"><div class="fld"><label for="st_to">Telefon</label><input class="inp mono" id="st_to" placeholder="05xx xxx xx xx" required></div><button class="btn btn-sm">Gönder</button></div></form>`; }
function pLogTbl(L,ch){ return L.length?`<div class="tbl-w"><table class="tbl mcards"><thead><tr><th>Tarih</th><th>Alıcı</th><th>${ch==='mail'?'Konu / mesaj':'Mesaj'}</th><th>Durum</th></tr></thead><tbody>${L.map(m=>`<tr><td style="white-space:nowrap">${dtstr(m.t)}</td><td><b>${esc(m.uname||'—')}</b><div class="muted mono" style="font-size:11.5px">${esc(m.to)}</div></td><td>${ch==='mail'?`<b>${esc(m.sub)}</b><div style="font-size:12.5px;white-space:pre-line;max-height:7.5em;overflow:hidden">${esc(m.x)}</div>`:esc(m.x)}</td><td><span class="pill ${/Gönderildi/.test(m.status)?'p-tamam':/Gönderilemedi/.test(m.status)?'p-iade':'p-bekliyor'}">${esc(m.status)}</span>${m.provider?`<div class="muted" style="font-size:11px">${esc(m.provider)}</div>`:''}</td></tr>`).join('')}</tbody></table></div>`:emptyBox('Kayıt yok',''); }
function pSmsPage(sub){
  if(sub==='sablonlar') return {body:pSoon('Şablon düzenleme çok yakında','Şimdilik hazır şablonlar kullanılıyor: hoş geldin, doğrulama kodu, şifre değişikliği ve deneme mesajı.')};
  if(sub==='kayitlar'){ const m=pAdmLoad('adm:outbox:mail','admin/outbox?ch=mail',null,10000), s=pAdmLoad('adm:outbox:sms','admin/outbox?ch=sms',null,10000);
    return {actions:'<button type="button" class="btn btn-sm" data-act="p-outbox">Yenile</button>',body:`<div class="panel"><div class="panel-h"><h3>E-posta kayıtları</h3><span class="muted" style="font-size:12px">Son 100 · doğrulama kodları gizli</span></div>${m?(m.err?pErrBox(m):pLogTbl(m.log||[],'mail')):pLoading()}</div>
      <div class="panel"><div class="panel-h"><h3>SMS kayıtları</h3></div>${s?(s.err?pErrBox(s):pLogTbl(s.log||[],'sms')):pLoading()}</div>`}; }
  const d=pAdmLoad('adm:mail','admin/settings/mail',null,60000); if(!d) return {body:pLoading()}; if(d.err) return {body:pErrBox(d)};
  return {body:sub==='sms'?pSmsForm(d.sms||{},d.stats):pMailForm(d.mail||{},d.stats)}; }
}
