const CHG={
  srvq:(el)=>{ const p=el.dataset.p, g=$('#'+p+'_sug'); if(!g||el.dataset.lq===el.value) return; el.dataset.lq=el.value; const R=srvQ(p,el.value); el.setAttribute('aria-expanded',R.length?'true':'false');
    g.innerHTML=el.value.trim()?(R.length?R.map(s=>`<button type="button" role="option" data-act="srvpickq" data-p="${p}" data-id="${s.id}">${logo(s,22)}<b>${esc(s.name)}</b><span class="chip">${s.sec==='tr'?'Metin2 TR':'PVP'}</span></button>`).join(''):`<span class="muted" style="font-size:12.5px">${p==='xa'&&srvQ('__all',el.value).length?'Bu server zaten borsada.':'Bu isimde server bulunamadı.'}</span>`):''; },
  atabsel:(el)=>{ ui.atab=el.value; render(); window.scrollTo(0,0); },
  utm:()=>{ const pr=UTM_PRE[+v_('ut_s')||0]; const u=utmUrl(v_('ut_p'),pr[0],pr[1],v_('ut_c').trim()); const o=$('#ut_out'), b=$('#ut_cp'); if(o) o.textContent=u; if(b) b.dataset.v=u; },
  blst:(el)=>{ const b=(S.backlinks||[]).find(x=>x.id===el.dataset.id); if(b){ b.st=el.value; b.ck=now(); save(); render(); } },
  seoprev:()=>{ const t=v_('se_ht').trim()||(S.set.siteName+' · Metin2 Item, Yang, Won, EP ve Karakter Pazarı'), d=v_('se_d'); const sp=$('#serp'); if(sp){ sp.querySelector('.serp-t').textContent=t; sp.querySelector('.serp-d').textContent=d; } const c=$('#se_dc'); if(c) c.textContent=d.length+' karakter · ideal 120-160'; },
  ccfmt:(el)=>{ const d=el.value.replace(/\D/g,'').slice(0,19); const f=d.replace(/(.{4})/g,'$1 ').trim(); if(f!==el.value) el.value=f; },
  svep:(el)=>{ const b=$('#svEpBox'); if(b) b.hidden=el.value!=='1'; },
  epsrv:(el)=>{ ui.epSrv=el.value||null; render(); },
  eplog:(el)=>{ ui.epLog=el.value; render(); },
  switch:(el)=>{S.cur=el.value||null; if(me()) me().lastSeen=now(); save(); ui.tab='ozet'; closeModal(); if(isPanel()&&me().admin) go('yonetim'); else if(route()==='yonetim'&&!isPanel()) go('home'); else render(); toast(el.value?user(el.value).name+' olarak devam ediyorsunuz':'Çıkış yapıldı');},
  qty:(el)=>{const v=Math.max(1,parseInt(el.value)||1); $('#qtyTot').textContent=TL(v*+el.dataset.price); const p=$('#qtyPt'); if(p) p.textContent='+'+NUM(v*+el.dataset.price*vip(me()||{vol:0}).cb);},
  game:()=>sellGame(), calc:(el)=>sellCalc(el), depcalc:()=>depCalc(),
  adsrv:(el)=>{$('#newSrv').hidden=el.value!=='_new'},
  wheelon:(el)=>{S.set.wheelOn=el.checked; save();},
  mod:(el)=>{S.set.moderation=el.checked; save(); toast(el.checked?'Yeni ilanlar onaydan geçecek.':'İlanlar anında yayına girecek.');},
  'ex-sel':(el)=>{ui.exId=el.value; render();},
  smsprev:(el)=>{ if(el.id==='sm_h'){ Object.keys(SMSEV).forEach(k=>{const b=$('#spv_'+k); if(b) b.innerHTML=smsPreview(v_('sm_tp_'+k),null,el.value);}); return; } const b=$('#spv_'+el.dataset.k); if(b) b.innerHTML=smsPreview(el.value,null,v_('sm_h'));},
  supv:(el)=>{const b=$('#suPrev'); if(b) b.innerHTML=smsPreviewUser(el.value,el.dataset.id,!!el.dataset.free);},
  canned:(el)=>{const c=S.support.canned[+el.value]; if(c){ const i=$('#tkmsg'); i.value=c[1].split('{temsilci}').join(me().name); i.focus(); } el.value='';},
  tkxfer:(el)=>{ if(!el.value) return; const t=S.tickets.find(x=>x.id===el.dataset.id); t.agent=el.value; t.msgs.push({f:'n',by:S.cur,x:`Görüşme ${user(el.value).name} kullanıcısına aktarıldı.`,t:now()}); save(); toast('Görüşme aktarıldı.'); render();},
  lsord:(el)=>{ if(!el.value) return; const id=el.value; lsSend(`#${id} numaralı siparişim hakkında yardım istiyorum.`,{order:id});},
  lsimg:async(el)=>{const f=el.files[0]; if(!f) return; try{ const img=await fileToDataURL(f,700); lsSend('Ekran görüntüsü gönderdim.',{img}); }catch(e){ toast('Görsel eklenemedi.',true); }},
  'ex-calc':(el)=>{const x=S.exchange.find(e=>e.id===el.dataset.x); if(!x) return; const q=Math.max(1,parseInt(v_('ex_qty'))||1);
    if(el.dataset.dir==='al'){ const bp=exSellPrice(x)||0, stk=exStock(x); $('#ex_tot').textContent=TL(r2(q*bp)); const w=$('#ex_waitbox'); if(w) w.hidden=q<=stk; const wm=$('#ex_waitmsg'); if(wm&&q>stk) wm.textContent=`Stokta şu an ${NUM(stk)} adet var. Siparişiniz alınır; kalan ${NUM(q-stk)} adet yeni satış emirleri geldikçe tamamlanır. Fiyat değişmez: ${TL(bp)} / adet.`; }
    else { const p=+v_('ex_price')||0; $('#ex_tot').textContent=TL(q*Math.min(p,x.max)); const pos=$('#ex_pos'); if(pos){ const r=exBook(x).filter(o=>o.price<=p).length+1; pos.textContent=p>x.max?`En fazla ${TL(x.max)} girebilirsiniz.`:`Bu fiyatla ${r}. sırada olursunuz.`; pos.style.color=p>x.max?'var(--bad)':''; } } },
  coverup:async(el)=>{const f=el.files[0]; if(!f) return; try{ S.covers[el.dataset.k]=await fileToDataURL(f,800); save(); toast('Görsel güncellendi.'); render(); }catch(e){ toast('Görsel yüklenemedi.',true); }},
  skinpick:(el)=>{const c=catFind(el.value); const p=$('#skinPrev'); if(!c){ if(p) p.innerHTML='<span class="muted">Katalogda bulunamadı. Kendi görselinizi yükleyebilirsiniz.</span>'; return; }
    $('#s_rar').value=RARK[c[2]]; if(WT[c[3]]) $('#s_wt').value=c[3]; const ti=$('#s_title'); if(ti&&!ti.value) ti.value=c[0];
    p.innerHTML=`<img class="skimg" src="${STEAM_IMG+c[1]}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'muted',textContent:'Önizleme bu ortamda engellendi; kendi sitenizde Steam görseli gösterilir.'}))"><span><b>${esc(c[0])}</b><br><span style="color:${RAR[RARK[c[2]]]}">● ${RARK[c[2]]}</span> · ${WT[c[3]]||''}</span>`;},
  pupadd:async(el)=>{ const p=el.dataset.p; UPL[p]=UPL[p]||[]; const fs=[...el.files]; const room=PUP_MAX-UPL[p].length; if(fs.length>room) toast(`En fazla ${PUP_MAX} fotoğraf ekleyebilirsiniz; ilk ${Math.max(0,room)} tanesi eklendi.`,true); for(const f of fs.slice(0,Math.max(0,room))){ try{ UPL[p].push(await fileToDataURL(f,1000)); }catch(e){ toast(f.name+' okunamadı.',true); } } el.value=''; pupRefresh(p); },
  imgpick:async(el)=>{const f=el.files[0]; if(!f) return; try{const u=await fileToDataURL(f,320); $('#imgPrev').innerHTML=`<img src="${u}" alt="Önizleme" style="max-height:120px;border-radius:8px;margin-top:6px">`;}catch(e){}},
  admediaprev:(el)=>{const box=$('#adMediaPrev'); const z=AD_SIZE[ui.adType]; box.innerHTML=''; [...el.files].forEach(f=>{ const url=URL.createObjectURL(f); const w=document.createElement('div'); w.className='adpf';
    if(/^video/.test(f.type)) w.innerHTML=`<video src="${url}" muted autoplay loop playsinline></video><span class="chip">Video · ${(f.size/1048576).toFixed(1)} MB</span>`;
    else { w.innerHTML=`<img src="${url}" alt=""><span class="chip">Ölçü okunuyor…</span>`; const im=w.querySelector('img'); im.onload=()=>{ const ch=w.querySelector('.chip'); const W_=im.naturalWidth, H_=im.naturalHeight; const ok=z&&W_===z.w&&H_===z.h, ratio=z&&Math.abs(W_/H_-z.w/z.h)<0.03; ch.className='chip '+(ok||ratio?'ok':'warn'); ch.textContent=`${W_}×${H_}`+(ok?' · uygun':ratio?' · oran uygun':z?` · gerekli ${z.w}×${z.h}, kırpılabilir`:''); }; }
    if(f.size>15*1024*1024) w.insertAdjacentHTML('beforeend','<span class="chip warn">15 MB üstü, yüklenmez</span>'); box.appendChild(w); }); },
  addur:(el)=>{ ui.adDur=+el.value; adRefresh(); },
  dprev:(el)=>{ const box=$('#'+(el.dataset.box||'dprev_pre')); const fs=[...el.files].slice(0,el.id==='dvid'?1:3); if(box) box.innerHTML=fs.map(f=>/^video/.test(f.type)?`<span class="chip ok">🎬 ${esc(f.name)} · ${(f.size/1048576).toFixed(1)} MB</span>`:`<img src="${URL.createObjectURL(f)}" alt="" style="height:70px;border-radius:6px">`).join(''); const b=$('#dbtn'); const n=id=>((($('#'+id)||{}).files)||[]).length; if(b) b.disabled=!(n('dpre')&&n('dpost')); },
  cnet:(el)=>{ ui.cnet=el.value; const n=S.cryptoNets.find(x=>x.id===el.value); const b=$('#cAddr'); if(b) b.innerHTML=cAddrHtml(n); },
  bksrv:(el)=>{ ui.bkSrv=el.value; render(); },
  tplprev:(el)=>{ const m=$('#tpv_m'); if(m&&$('#tp_ms')) m.innerHTML=mailPreview(v_('tp_ms'),$('#tp_mb').value); const sv=$('#tpv_s'); if(sv&&$('#tp_sb')) sv.innerHTML=smsPreview($('#tp_sb').value); },
  wdcalc:()=>{ const inp=$('#w_amt'); const a=Math.max(0,+(inp&&inp.value)||0); const brk=wdBreakdown(a,true); const set=(id,v)=>{ const e=$('#'+id); if(e) e.textContent=v; }; set('wd_a',TL(a)); set('wd_f',S.set.wdFee&&S.set.wdFee.on?TL(brk.fee):'Ücretsiz'); if(brk.stopajPct) set('wd_st','− '+TL(brk.stopaj)); set('wd_n',TL(brk.net)); },
  egicalc:(el)=>{ const brut=+el.dataset.brut||0, pct=Math.max(0,Math.min(40,+el.value||0)), net=r2(brut-r2(brut*pct/100)); const n=$('#egi_net'); if(n) n.value=TL(net); },
  mailprev:(el)=>{ const ks=el.dataset.k?[el.dataset.k]:Object.keys(MAILEV); if(!el.dataset.k){ S.mail.fromName=v_('ml_fn'); S.mail.from=v_('ml_fr'); } ks.forEach(k=>{ const b=$('#mpv_'+k); if(b) b.innerHTML=mailPreview(v_('ml_s_'+k),$('#ml_b_'+k).value); }); },
  srvsec:(el)=>{ const p=el.dataset.p; const t=$('#'+p+'_srv'); if(t){ t.innerHTML=srvOpts(el.value,null,SRVOPT[p]||{}); t.dispatchEvent(new Event('change',{bubbles:true})); } },
  bfsec:(el)=>{ ui.bf={sec:el.value,srv:''}; render(); },
  bfsrv:(el)=>{ ui.bf=Object.assign({},ui.bf,{srv:el.value}); render(); },
  'ex-sec':(el)=>{ const x=S.exchange.find(e=>e.on&&(srv(e.server)||{}).sec===el.value); if(!x) return toast('Bu bölümde borsası açık server yok.',true); ui.exId=x.id; render(); },
  mday:(el)=>{ if(el.value){ ui.mDay=el.value; render(); } },
  wbdays:(el)=>{ ui.wbDays=+el.value; render(); },
  wball:(el)=>{ document.querySelectorAll('.wbc').forEach(c=>c.checked=el.checked); },
  bkauto:(el)=>{ S.set.autoBk=+el.value; save(); toast(+el.value===0?'Otomatik yedek kapatıldı.':+el.value===-1?'Her değişiklikten sonra yedek alınacak.':`Her ${el.value} dakikada yedek alınacak.`); },
  bkfile:(el)=>{ const f=el.files[0]; if(!f||!can('bakim')) return; const r=new FileReader(); r.onload=async()=>{ try{ const o=JSON.parse(r.result); if(!o||o.v!==3||!Array.isArray(o.users)) throw 0; await bkPut('Yüklenen dosya: '+f.name, r.result); toast('Yedek listeye eklendi. Geri yüklemek için “Geri yükle” deyin.'); fillBk(); }catch(x){ toast('Bu dosya geçerli bir yangpazar.com yedeği değil.',true); } }; r.readAsText(f); },
  exst:(el)=>{const o=S.exOrders.find(x=>x.id===el.dataset.id); if(el.value==='kismen'){ ui.exOpen=o.id; ui.atab='borsa'; render(); window.scrollTo(0,0); setTimeout(()=>{const s_=$('#exds'); if(s_) s_.value='kismen'; const i=$('#exdq'); if(i){ i.focus(); i.select(); }},60); toast('Teslim edilen adedi yazıp “Durumu kaydet” deyin.'); return; } exSetStatus(o,el.value);},
  wiban:(el)=>{const b=$('#wNew'); if(b) b.hidden=el.value!=='_new';},
  slidemedia:async(el)=>{const x=S.slides.find(z=>z.id===el.dataset.id); x.media=x.media||[]; for(const f of el.files){ if(f.size>15*1024*1024) continue; try{x.media.push(await mediaPut(f));}catch(e){} } save(); toast('Görsel eklendi.'); render();},
  admediaadd:async(el)=>{const a=S.ads.find(x=>x.id===el.dataset.id); a.media=a.media||[]; for(const f of el.files){ if(f.size>15*1024*1024) continue; try{a.media.push(await mediaPut(f));}catch(e){} } save(); toast('Medya eklendi.'); render();}
};
document.addEventListener('change',e=>{const el=e.target; if(el.dataset.change&&CHG[el.dataset.change]) CHG[el.dataset.change](el); if(el.dataset.f!==undefined){ ui.f[el.dataset.f]=el.type==='checkbox'?el.checked:el.value; render(); const n=document.getElementById(el.id); if(n&&el.type!=='checkbox'&&el.tagName==='INPUT') n.focus(); }});
document.addEventListener('toggle',e=>{ const d=e.target; if(!d||!d.classList||!d.classList.contains('balwrap')||!d.open) return; const dd=d.querySelector('.baldd'); if(dd&&getComputedStyle(dd).position==='fixed'){ dd.style.top=(d.querySelector('summary').getBoundingClientRect().bottom+8)+'px'; } },true);
document.addEventListener('focusin',e=>{ if(e.target&&e.target.id==='lsmsg') setTimeout(vvSync,300); });
document.addEventListener('focusin',e=>{ if(e.target&&e.target.id==='q'&&e.target.value.trim()) qSug(e.target.value); });
document.addEventListener('keydown',e=>{ if(!e.target||e.target.id!=='q') return; const box=$('#qsug'); if(!box||box.hidden) return; const it=[...box.querySelectorAll('[data-qi]')]; let i=it.findIndex(x=>x.classList.contains('on'));
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){ e.preventDefault(); if(i>=0) it[i].classList.remove('on'); i=e.key==='ArrowDown'?(i+1)%it.length:(i<=0?it.length-1:i-1); it[i].classList.add('on'); it[i].scrollIntoView({block:'nearest'}); }
  else if(e.key==='Enter'&&i>=0&&it[i].tagName==='A'){ e.preventDefault(); location.hash=it[i].getAttribute('href').slice(1); qClose(); e.target.blur(); }
  else if(e.key==='Escape'){ qClose(); } });
document.addEventListener('focusin',e=>{ const id=e.target&&e.target.id; if(['tp_ms','tp_mb','tp_sb'].includes(id)) ui.tplf=id; });
document.addEventListener('input',e=>{const el=e.target; if(el.id==='q') return qSug(el.value); if(el.id==='f_sq') return sqApply(el.value); if(el.id==='egp_q') return egpApply(el.value); if(['wdcalc','tplprev','mailprev','calc','qty','depcalc','ex-calc','smsprev','supv','ccfmt','seoprev','utm','srvq'].includes(el.dataset.change)) CHG[el.dataset.change](el);});

