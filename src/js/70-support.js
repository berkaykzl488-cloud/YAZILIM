const DAYS=['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const SMSEV={tfa:['Giriş doğrulama kodu','2 adımlı doğrulamada kod istendiğinde (her zaman gönderilir)','üyeye'],order_new:MAILEV.order_new,sold:MAILEV.sold,ready:MAILEV.ready,delivered:MAILEV.delivered,autosoon:MAILEV.autosoon,completed:MAILEV.completed,confirmed:MAILEV.confirmed,refund:MAILEV.refund,cancel_s:MAILEV.cancel_s,dispute:MAILEV.dispute,dispute_done:MAILEV.dispute_done,stock_out:MAILEV.stock_out,deposit_ok:MAILEV.deposit_ok,withdraw_req:MAILEV.withdraw_req,withdraw:MAILEV.withdraw,withdraw_no:MAILEV.withdraw_no,ep_code:MAILEV.ep_code,tc_ok:MAILEV.tc_ok,pass:MAILEV.pass,borsa:['Borsa sipariş durumu','borsa siparişi sıraya alındığında, üstlenildiğinde, bilgi istendiğinde ve bittiğinde','üyeye'],call:['Borsa: alıcıyı çağır','operatör borsa siparişinde “Alıcıyı çağır” dediğinde','alıcıya'],direct:['Üyeden üyeye ücretli SMS','bir üye “SMS ile ulaş” kullandığında','mesaj gönderilen üyeye']};
const SMS_SAMPLE={kod:'482913',ad:'Deniz',ilan:'Bozok2 100M Yang',no:'S100004',tutar:'245,00 TL',durum:'Tamamlandı',gonderen:'KurtPazar',mesaj:'İlanınız için mesaj attım',teslimat:'KaraSavaşçı karakteriyle CH3 · Mavi bayrak gardiyanı',saat:'12',ep:'10.000'};
function smsFill(tpl,vars){ let m=tpl||''; Object.entries(Object.assign({site:S.set.siteName},SMS_SAMPLE,vars||{})).forEach(([k,v])=>{m=m.split('{'+k+'}').join(v)}); return m; }
function smsPreview(tpl,vars,header){ const m=smsFill(tpl,vars); const uni=/[çğıöşüÇĞİÖŞÜ₺€]/.test(m); const per=uni?70:160, multi=uni?67:153; const n=m.length; const parts=n<=per?1:Math.ceil(n/multi);
  return `<div class="phone"><small>${esc(header||S.sms.header)}</small><p>${esc(m)||'<span class="muted">Mesaj boş</span>'}</p></div><div class="muted" style="font-size:11.5px;margin-top:4px">${n} karakter · ${parts} SMS${uni?' · Türkçe karakter var':''}</div>`; }
function hm(s){const [h,m]=String(s||'0:0').split(':').map(Number); return h*60+(m||0);}
function supportOpen(d){ const s=S.support; if(s.mode==='open') return true; if(s.mode==='closed') return false; d=d||new Date(); const [o,c,on]=s.hours[d.getDay()]||[]; if(!on) return false; const m=d.getHours()*60+d.getMinutes(), O=hm(o), C=c==='24:00'?1440:hm(c); return C>O?(m>=O&&m<C):(m>=O||m<C); }
function nextOpen(){ if(S.support.mode==='closed') return 'yakında'; const n=new Date(); for(let i=0;i<8;i++){ const d=new Date(); d.setDate(n.getDate()+i); const [o,,on]=S.support.hours[d.getDay()]||[]; if(!on) continue; if(i===0&&n.getHours()*60+n.getMinutes()>=hm(o)) continue; return (i===0?'bugün':i===1?'yarın':DAYS[d.getDay()])+' '+o+"'da"; } return 'yakında'; }
function hoursTxt(){ const s=S.support; if(s.mode==='open') return 'Şu an açık'; if(s.mode==='closed') return 'Geçici olarak kapalı'; const [o,c,on]=s.hours[new Date().getDay()]||[]; return on?`Bugün ${o} – ${c}`:'Bugün kapalı'; }
let SAMPLE=null, AI_OFF=false;
(async()=>{ try{ if(window.claude&&window.claude.use) SAMPLE=await window.claude.use('sample'); }catch(e){ SAMPLE=null; } })();
const aiReady=()=>!!(S.support.ai && SAMPLE && !AI_OFF);
function myTicket(create){
  const id=S.cur||'guest';
  let t=S.tickets.find(x=>x.u===id&&(x.status!=='kapandı'||!x.rated));
  if(!t&&create){ t={id:uid('tk'),no:++S.tkSeq,u:id,status:'acik',t:now(),msgs:[{f:'b',ai:aiReady(),x:pick([`Merhaba${me()?' '+me().name:''}! Ben ${S.support.aiName}. Siparişler, borsa, ödeme ve hesap konularında hemen yardımcı olabilirim.`,`Hoş geldiniz${me()?' '+me().name:''}! ${S.support.aiName} burada. Sorunuzu yazın, gerekirse sizi bir temsilciye bağlarım.`,`Selam${me()?' '+me().name:''}, ben ${S.support.aiName}. Siparişinizi ekleyerek yazarsanız daha hızlı yardımcı olurum.`]),t:now()}]}; S.tickets.unshift(t); save(); }
  return t;
}
const pick=a=>a[Math.floor(Math.random()*a.length)];
function botReply(x){
  const s=x.toLocaleLowerCase('tr-TR');
  if(/temsilci|insan|yetkili|canlı kişi|iptal|iade/.test(s)) return null;
  if(/borsa|kanal|köy|teslimat yeri|ch2|bayrak/.test(s)) return pick([`Yang Borsası’nda siteden aldığınız yang ${S.set.exPlace} noktasında karakterinize ticaretle teslim edilir. Karakter adınızı doğru yazmanız yeterli.`,`Borsada teslimat her serverda aynı yerde: ${S.set.exPlace}. Operatörümüz size ticaret açar, miktarı kontrol edip onaylarsınız.`,`Siteden alımda en ucuz satış emrinden başlanır. Yang ${S.set.exPlace} noktasında teslim edilir; satmak isterseniz kendi fiyatınızla emir verebilirsiniz.`]);
  if(/teslim|sipariş|gelmedi|almadım/.test(s)) return pick([`Ödemeniz havuzda güvende. Hesabım › Aldıklarım’dan siparişi açıp satıcıya yazabilirsiniz. Teslim gecikirse “Canlı destekten iptal iste” ile bize ulaşın, ekibimiz ilgilenir.`,`Siparişiniz onaylanmadan para satıcıya geçmez. Satıcı yanıt vermiyorsa sipariş numaranızı yazın, sizi bir temsilciye aktarayım.`,`Endişelenmeyin, tutar havuzda bekliyor. Sipariş sayfasından satıcıya mesaj atabilir, gecikme varsa iptal için temsilcimize bağlanabilirsiniz.`]);
  if(/yükle|bakiye|kart|papara|havale|eft|ödeme/.test(s)) return pick([`Üstteki bakiye kutusuna dokunun. Kart, Havale/EFT, mobil ödeme ve cüzdan seçenekleri ayrı sekmelerde. PayTR Havale/EFT 7/24 kendiliğinden eşleşir.`,`Bakiye yüklemenin en hızlı yolu kart veya PayTR Havale/EFT. Manuel havalede açıklamaya kullanıcı adınızı yazmayı unutmayın.`,`Bakiye Yükle penceresinde yöntemi seçip tutarı girmeniz yeterli. Kupon kodunuz varsa aynı ekranda bonus kazanırsınız.`]);
  if(/çekilemez|çekemiyorum|kart bakiye/.test(s)) return 'Kart, mobil ödeme ve cüzdanla yüklenen bakiye ile hediye ve bonuslar sadece alışverişte kullanılır, çekilemez. Satış gelirleriniz ve Havale/EFT ile yüklediğiniz tutar çekilebilir.';
  if(/çek|iban/.test(s)) return pick([`Para çekme talepleri mesai saatlerinde 2-6 saat içinde IBAN’ınıza gönderilir. En az ${TL(S.set.minWithdraw)} çekebilirsiniz.`,`Hesabım › Para çek bölümünden talep oluşturun. IBAN sizin adınıza kayıtlı olmalı; ortalama 2-6 saatte hesabınızda olur.`]);
  if(/reklam|popup|banner/.test(s)) return pick([`Reklam paketlerimiz: slider (haftalık ${TL(S.packs.slider.p[1])}), popup (haftalık ${TL(S.packs.popup.p[1])}), premium liste (haftalık ${TL(S.packs.premium.p[1])}).`,`“Reklam Ver” sayfasından paketi seçip görsel veya videonuzu yükleyebilirsiniz; ödeme bakiyeden alınır, reklam hemen yayına girer.`]);
  if(/komisyon|kesinti/.test(s)) return pick([`Komisyon %${S.set.commission} ve satıcıdan kesilir. VIP seviyeniz yükseldikçe oran düşer.`,`Alıcı yalnızca ilan fiyatını öder; satıcıdan %${S.set.commission} komisyon alınır, VIP üyelerde daha az.`]);
  if(/won/.test(s)) return 'Metin2 TR sunucularında 1 Won = 100M yang. İlan fiyatları 1 Won içindir.';
  if(/\bep\b|ejderha/.test(s)) return pick([`Metin2 EP'yi yalnızca ${S.set.siteName} satar; ödeme anında kodunuz ekrana gelir ve Hesabım › EP kodlarım'da saklanır.${hhOn()?' Şu an Happy Hour aktif: aynı fiyata %'+S.set.hh.pct+' fazla EP!':''}`,`EP kodları tüm TR serverlarında geçerli ve otomatik teslim edilir. Menüdeki “Metin2 EP” bölümünden hemen alabilirsiniz.`]);
  if(/çekiliş|çark|bilet/.test(s)) return pick(['Her 100 TL alışveriş 1 çekiliş bileti. Her gün 1 ücretsiz bilet ve 1 ücretsiz çark hakkınız var.','Çekiliş & Çark sayfasında günlük ücretsiz çevirme hakkınız var; alışveriş yaptıkça bilet de kazanırsınız.']);
  if(/güven|dolandır/.test(s)) return pick(['Paranız ürünü onaylayana kadar havuzda bekler. Ekibimiz sizden asla şifre veya SMS kodu istemez.','Site dışında ödeme yapmayın; telefon ve link paylaşımları otomatik gizlenir. Tüm ödemeler havuz güvencesindedir.']);
  if(/merhaba|selam|iyi akşam|günaydın/.test(s)) return pick(['Merhaba! Size nasıl yardımcı olabilirim?','Selam, hoş geldiniz. Hangi konuda yardım istersiniz?','Merhaba, buradayım. Siparişiniz, bakiye ya da borsa hakkında sorabilirsiniz.']);
  return null;
}
function aiContext(t){
  const u=user(t.u); const O=S.orders.filter(o=>o.buyer===t.u||o.seller===t.u).slice(0,5); const X=S.exOrders.filter(o=>o.u===t.u).slice(0,3);
  return `Sen "${S.set.siteName}" adlı oyun item pazaryerinin canlı destek asistanı "${S.support.aiName}"sın. Türkçe, kısa (en fazla 4 cümle), sıcak, net ve güven veren bir dille yanıt ver. Markdown kullanma.
Kurallar: Bilmediğin bir şeyi uydurma. Asla şifre, kart bilgisi, SMS kodu veya IBAN isteme. Site dışı ticareti önerme, telefon/WhatsApp/Discord gibi iletişim bilgisi verme. İade, itiraz kararı, eksik bakiye, hesap güvenliği gibi bir insanın bakması gereken konularda ya da kullanıcı temsilci isterse yanıtının sonuna tam olarak [TEMSILCI] yaz.
Site bilgileri: Komisyon %${S.set.commission}, satıcıdan kesilir. Ödeme ürün onaylanana kadar havuzda bekler. Satıcı teslim etmezse alıcı siparişi kendisi iptal edemez; canlı destekten talep eder, yetkili ekip kontrol edip iptal ve iade yapar (bu durumda [TEMSILCI] ekle). Satıcı teslim edince ${S.set.autoConfirm} saat içinde onaylanmazsa otomatik onaylanır. Para çekme en az ${TL(S.set.minWithdraw)}, işlem ücreti ${wdFeeTxt()}, mesai saatlerinde 2-6 saatte. Ödeme yöntemleri: ${S.gws.filter(g=>g.on).map(g=>g.n).join(', ')}. Yang Borsası ${S.set.exOn?'açık':'şu an KAPALI (açık siparişler iptal edilip bakiyeye iade edildi; hizmet açılınca yeniden oluşturulabilir, kullanıcıyı nazikçe bilgilendir)'}. Borsa işleyişi: oyuncular yanglarını kendi fiyatlarıyla (server başına maksimum fiyatı geçmeden) satış emri olarak koyar; sitenin her server için belirlediği sabit bir 'siteden satın al' fiyatı vardır; satış emirleri fiyata göre sıralanır ve ekip siparişleri bu emirlerle elle eşler. Siteden alınan yang her serverda ${S.set.exPlace} noktasında karaktere ticaretle teslim edilir; satış emri verenlerin hesabına ekip girer, satılan tutar bakiyeye geçer. Güncel fiyatlar: ${S.exchange.filter(x=>x.on).slice(0,6).map(x=>(srv(x.server)||{}).name+' '+x.unit+': siteden al '+(exSellPrice(x)?TL(exSellPrice(x)):'stok yok')+', stok '+exStock(x)+', satış emri maks '+TL(x.max)).join('; ')}. Metin2 TR'de 1 Won = 100M yang. Metin2 EP'yi yalnızca site satar, ödeme anında kod otomatik teslim edilir ve Hesabım › EP kodlarım'da saklanır; üyeler EP ilanı veremez. Happy Hour ${hhOn()?'şu an aktif, EP kodlarında aynı fiyata %'+S.set.hh.pct+' fazla EP':'şu an kapalı'}. Kartla, mobil ödemeyle, cüzdanla yüklenen bakiye ve bonuslar çekilemez, sadece alışverişte kullanılır; satış gelirleri ve Havale/EFT yüklemeleri çekilebilir. Destek saatleri: ${hoursTxt()}, şu an ${supportOpen()?'temsilciler çevrimiçi':'temsilciler çevrimdışı, '+nextOpen()+' dönecekler'}.
Kullanıcı: ${u.name||'Misafir'}${u.bal!=null?', bakiye '+TL(avail(u))+' (çekilebilir '+TL(u.bal)+', sadece alışveriş '+TL(u.bonus||0)+')':''}. Siparişleri: ${O.map(o=>`#${o.id} "${o.title}" ${o.buyer===t.u?'aldı':'sattı'}, durum: ${ST[o.status]}`).join('; ')||'yok'}. Borsa: ${X.map(o=>`#${o.id} ${o.dir==='al'?'alım':'satış'} ${EXS[o.status]}`).join('; ')||'yok'}.
Aşağıda konuşma var; son kullanıcı mesajına yanıt ver.`;
}
function escalate(t){
  if(t.status==='bekliyor') return; t.status='bekliyor'; t.queuedAt=now();
  const q=S.tickets.filter(x=>x.status==='bekliyor').length;
  t.msgs.push({f:'s',x: supportOpen() ? pick([`Sizi bir temsilciye aktardım. Sıradaki yeriniz: ${q}. Ortalama bekleme ${S.support.wait||'2 dk'}.`,`Bir temsilcimiz birazdan sizinle olacak. Sıranız: ${q}.`,`Talebinizi ekibimize ilettim, ${q}. sıradasınız. Bu pencereyi kapatsanız da yanıt size bildirim olarak gelir.`]) : `${S.support.offline} Talebiniz #DST-${t.no} ile sıraya alındı; temsilcilerimiz ${nextOpen()} döndüğünde size bildirim ve SMS ile yanıt verecek.`,t:now()});
}
async function aiAnswer(t,lastText){
  const turns=[{role:'user',content:aiContext(t)}];
  t.msgs.filter(m=>['u','b','a'].includes(m.f)&&m.x&&!m.pending).slice(-14).forEach(m=>turns.push({role:m.f==='u'?'user':'assistant',content:(m.order?`[Sipariş ekledi: ${m.order}] `:'')+(m.img?'[Görsel ekledi] ':'')+m.x}));
  if(turns[turns.length-1].role!=='user') return;
  const bub={f:'b',x:'',t:now(),ai:true,pending:true}; t.msgs.push(bub); renderLS();
  try{
    const {text}=await SAMPLE(turns,{cache:false,modelTier:'quick',onText:({text})=>{ bub.x=text.replace('[TEMSILCI]','').trim(); const el=document.querySelector('#lsChat .msg.pending .tx'); if(el) el.textContent=bub.x; }});
    bub.pending=false; bub.x=text.replace('[TEMSILCI]','').trim(); if(text.includes('[TEMSILCI]')) escalate(t);
  }catch(e){
    bub.pending=false; bub.ai=false;
    if(['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed'].includes(e.code)) AI_OFF=true;
    const fb=botReply(lastText); bub.x=e.text||fb||'Bu konuda sizi bir temsilciye aktarıyorum.'; if(!e.text&&!fb) escalate(t);
  }
  save(); renderLS();
}
function msgHtml(m,U,agentView){
  if(m.f==='s') return `<div class="msg sys">${esc(m.x)}</div>`;
  if(m.f==='n') return agentView?`<div class="msg note"><b>İç not · ${esc(user(m.by).name)}</b> ${esc(m.x)}<small>${ago(m.t)}</small></div>`:'';
  const mine = agentView ? m.f==='a' : m.f==='u';
  const who = m.f==='u' ? (agentView?esc(U?U.name:'Üye'):'') : m.f==='a' ? `${esc(m.by?user(m.by).name:'Temsilci')} · Temsilci` : `${esc(S.support.aiName)}${m.ai?' · Yapay zeka':' · Asistan'}`;
  return `<div class="msg ${mine?'mine':m.f==='a'?'agent':m.f==='b'?'bot':''} ${m.pending?'pending':''}">${who?`<b class="who">${who}</b>`:''}${m.order?`<a class="ordcard" href="#${m.order.startsWith('B')?'hesabim':'siparis-'+m.order}">Sipariş #${esc(m.order)}</a>`:''}${m.img?`<img src="${m.img}" alt="Gönderilen görsel" class="chatimg">`:''}<span class="tx">${m.pending&&!m.x?'':esc(m.x)}</span>${m.pending&&!m.x?'<span class="typing"><i></i><i></i><i></i></span>':''}<small>${ago(m.t)}</small></div>`;
}
let vvRaf=0, vvLast='';
function vvSync(){ const R=$('#ls'); if(!R||!document.documentElement.classList.contains('lsopen')) return; const v=window.visualViewport;
  if(v){ const k=Math.round(v.height)+'|'+Math.round(v.offsetTop); if(k!==vvLast){ vvLast=k; R.style.setProperty('--vvh',Math.round(v.height)+'px'); R.style.setProperty('--vvt',Math.round(v.offsetTop)+'px'); } }
  const c=$('#lsChat'); if(c&&document.activeElement&&document.activeElement.id==='lsmsg') c.scrollTop=c.scrollHeight; }
function vvQueue(){ if(vvRaf) return; vvRaf=requestAnimationFrame(()=>{ vvRaf=0; vvSync(); }); }
const isTouchUI=()=>window.matchMedia&&(matchMedia('(max-width:900px)').matches||matchMedia('(pointer:coarse)').matches);
if(window.visualViewport){ visualViewport.addEventListener('resize',vvQueue,{passive:true}); visualViewport.addEventListener('scroll',vvQueue,{passive:true}); }
function renderLS(){
  const el=$('#ls'); const wasOpen=!!el.querySelector('.ls-p'); document.documentElement.classList.toggle('lsopen',!!ui.ls&&!can('destek')); vvLast=''; vvSync();
  if(can('destek')){ const n=S.tickets.filter(t=>t.status==='bekliyor').length; el.innerHTML=`<button class="ls-fab" data-act="admin-tk">${ICO.chat}Destek talepleri ${n?`<span class="cnt">${n}</span>`:''}</button>`; return; }
  const open=supportOpen();
  if(!ui.ls){ const t=myTicket(false); const unread=t&&t.unread?t.unread:0; el.innerHTML=`<button class="ls-fab" data-act="ls-open"><span class="dot ${open?'':'off'}"></span>${ICO.chat}Canlı Destek${unread?`<span class="cnt">${unread}</span>`:''}</button>`; return; }
  const t=myTicket(true); t.unread=0; const u=me();
  const myOrders=u?[...S.orders.filter(o=>o.buyer===u.id||o.seller===u.id).slice(0,6).map(o=>[o.id,o.title]),...S.exOrders.filter(o=>o.u===u.id).slice(0,3).map(o=>[o.id,'Borsa '+(o.dir==='al'?'alım':'satış')])]:[];
  const q=S.tickets.filter(x=>x.status==='bekliyor'); const pos=q.indexOf(t)+1;
  el.innerHTML=`<div class="ls-p${wasOpen?'':' ls-in'}" role="dialog" aria-label="Canlı destek">
    <div class="ls-h"><span class="av" style="background:var(--accent);color:var(--accent-ink)">${ICO.han.replace('<svg','<svg style="width:20px"')}</span><div style="min-width:0"><b>Canlı Destek</b><small class="${open?'':'off'}">${open?`Temsilciler çevrimiçi · ort. yanıt ${esc(S.support.wait||'2 dk')}`:`Temsilciler ${nextOpen()} dönüyor · asistan yanıtlıyor`}</small><small class="hrs">${hoursTxt()} · Talep #DST-${t.no}</small></div><button class="md-x" data-act="ls-close" aria-label="Kapat">×</button></div>
    <div class="ls-trust">${ICO.shield}<span>Görüşmeniz kayıt altındadır. Ekibimiz sizden asla şifre, SMS kodu veya kart bilgisi istemez.</span></div>
    <div class="chat" id="lsChat">${t.msgs.map(m=>msgHtml(m,null,false)).join('')}${t.status==='bekliyor'&&pos?`<div class="msg sys">Temsilci sırasındaki yeriniz: ${pos}</div>`:''}
      ${t.status==='kapandı'&&!t.rated?`<div class="rate"><b>Görüşmeyi değerlendirin</b><div class="hstack">${[1,2,3,4,5].map(n=>`<button class="btn btn-sm" data-act="tk-rate" data-n="${n}" aria-label="${n} yıldız">${'★'.repeat(n)}</button>`).join('')}</div></div>`:''}</div>
    ${t.status==='kapandı'&&!t.rated?'':`<div class="qr">${t.status==='bekliyor'?'':`<button data-act="ls-agent" class="hl">Temsilciye bağlan</button>`}${['Siparişim teslim edilmedi','Borsa siparişim','Bakiye yükleme','Para çekme'].map(q=>`<button data-act="ls-q" data-q="${q}">${q}</button>`).join('')}</div>
    <div class="ls-att"><select class="inp" data-change="lsord" aria-label="Sipariş ekle"><option value="">+ Sipariş ekle</option>${myOrders.map(([id,ti])=>`<option value="${id}">#${id} · ${esc(String(ti).slice(0,28))}</option>`).join('')}</select><label class="btn btn-sm" for="lsimg">Görsel ekle</label><input type="file" id="lsimg" accept="image/*" hidden data-change="lsimg"></div>
    <form class="chat-in" data-form="ls"><input class="inp" id="lsmsg" placeholder="Mesajınızı yazın…" autocomplete="off" enterkeyhint="send"><button class="btn btn-primary">Gönder</button></form>`}</div>`;
  const c=$('#lsChat'); if(c) c.scrollTop=c.scrollHeight;
}
function lsSend(x,extra){
  let t=myTicket(true); if(t.status==='kapandı'){ t.rated=true; t=myTicket(true); }
  const c=censor(x); if(c.flagged) logFlag(S.cur||'guest','Canlı destek',x);
  t.msgs.push(Object.assign({f:'u',x:c.text,t:now()},extra||{})); save();
  if(t.status==='bekliyor'||t.agent){ if(t.agent) t.unreadAgent=true; renderLS(); return; }
  if(/temsilci|insan|yetkili/i.test(x)){ escalate(t); save(); renderLS(); return; }
  if(aiReady()) return aiAnswer(t,x);
  const bub={f:'b',x:'',t:now(),pending:true}; t.msgs.push(bub); renderLS();
  setTimeout(()=>{ const r=botReply(x); bub.pending=false; if(r) bub.x=r; else { bub.x=pick(['Bu konuda sizi bir temsilciye aktarıyorum.','Bunu bir arkadaşımızın kontrol etmesi daha doğru olur, sizi temsilciye bağlıyorum.','Bu talebi ekibimize iletiyorum, kısa süre içinde dönüş yapılacak.']); escalate(t); } save(); renderLS(); },700);
}
async function aiDraft(t){
  if(!aiReady()){ const last=[...t.msgs].reverse().find(m=>m.f==='u'); const r=last&&botReply(last.x); if(r) $('#tkmsg').value=r; else toast('Yapay zeka bu görünümde kullanılamıyor; hazır yanıtları deneyin.',true); return; }
  const inp=$('#tkmsg'); inp.value='Yazılıyor…';
  const turns=[{role:'user',content:aiContext(t)+'\nŞimdi sen bir insan temsilci için yanıt TASLAĞI yaz. Sadece müşteriye gönderilecek metni yaz, [TEMSILCI] ekleme.'}];
  t.msgs.filter(m=>['u','b','a'].includes(m.f)&&m.x).slice(-12).forEach(m=>turns.push({role:m.f==='u'?'user':'assistant',content:m.x}));
  if(turns[turns.length-1].role!=='user') turns.push({role:'user',content:'(Müşterinin son mesajına yanıt taslağı yaz.)'});
  try{ const {text}=await SAMPLE(turns,{cache:false,modelTier:'quick',onText:({text})=>{const i=$('#tkmsg'); if(i) i.value=text;}}); const i=$('#tkmsg'); if(i){ i.value=text.replace('[TEMSILCI]','').trim(); i.focus(); } }
  catch(e){ const i=$('#tkmsg'); if(i) i.value=e.text||''; if(e.code!=='cancelled') toast('Taslak oluşturulamadı.',true); }
}

