const wdOK = g => !!g && g.cat==='eft';
function refCheck(b,total){ const s=S.set; if(!s.refOn||!b.refBy||b.refPaid||total<s.refMin) return; const R=S.users.find(x=>x.id===b.refBy); if(!R||(R.refs||0)>=s.refMax) return; b.refPaid=true; R.refs=(R.refs||0)+1;
  if(s.refBonus){ addBonus(R,s.refBonus); addTx(R.id,`Davet ödülü (${b.name}) · sadece alışveriş`,s.refBonus); ledger('bonus',R.id,s.refBonus,{m:'Davet ödülü'}); notify(R.id,`${b.name} ilk alışverişini yaptı, ${TL(s.refBonus)} davet ödülü kazandın.`,'#hesabim'); }
  if(s.refFriend){ addBonus(b,s.refFriend); addTx(b.id,'Davet hoş geldin ödülü · sadece alışveriş',s.refFriend); ledger('bonus',b.id,s.refFriend,{m:'Davet hoş geldin'}); notify(b.id,`Davet koduyla ilk alışverişin için ${TL(s.refFriend)} hediye bakiye yüklendi.`,'#hesabim'); } }
function addTx(u,l,a){S.tx.unshift({id:uid('t'),u,l,a:r2(a),t:now()})}
function wdFee(a){ const f=S.set.wdFee||{}; if(!f.on||!(a>0)) return 0; let x=f.type==='yuzde'?a*(+f.val||0)/100:(+f.val||0); if(f.type==='yuzde'){ if(+f.min>0) x=Math.max(x,+f.min); if(+f.max>0) x=Math.min(x,+f.max); } return r2(Math.min(x,a)); }
function wdFeeTxt(){ const f=S.set.wdFee||{}; if(!f.on) return 'Ücretsiz'; return f.type==='yuzde'?`%${f.val}${+f.min>0?' (en az '+TL(f.min)+')':''}${+f.max>0?' (en fazla '+TL(f.max)+')':''}`:TL(f.val)+' / işlem'; }
function egpCfg(){
  if(!S.set.egp) S.set.egp={on:true,autoOnApprove:true,seri:'YGP',seq:103,stopaj:0,company:'YangPazar Bilişim ve Dijital Oyun Hizmetleri Ltd. Şti.',vd:'Muğla Vergi Dairesi',vkn:'9340812450',mersis:'0934081245000001',addr:'Menteşe / Muğla, Türkiye',provider:'GİB e-Belge / QNB eFinans',descTpl:'213 Sayılı VUK Md. 234 kapsamında vergi mükellefi olmayan gerçek kişiden dijital oyun içi varlık / yang / item tedariki ve bakiye ödemesi ({banka} - {iban})'};
  return S.set.egp;
}
// R9: üye formunda yalnız "Vergi kesintisi (%X)" gösterilir; oran 0 (veya kesinti kapalı) ise satır hiç yok.
const wdTaxPct = () => wdBreakdown(0,true).stopajPct;
function wdBreakdown(a, taxFree){
  const fee=wdFee(a), brut=r2(Math.max(0,a-fee)), E=egpCfg();
  const stopajPct=(taxFree!==false && E.on)?Math.max(0,+E.stopaj||0):0;
  const stopaj=r2(brut*stopajPct/100), net=r2(brut-stopaj);
  return {amount:r2(a),fee,brut,stopajPct,stopaj,net};
}
function makeEttn(seedStr){
  let h1=0x811c9dc5, h2=0x01000193; const str=String(seedStr||Date.now())+'-'+Math.random();
  for(let i=0;i<str.length;i++){ h1^=str.charCodeAt(i); h1=Math.imul(h1,16777619)>>>0; h2^=str.charCodeAt(i)*31; h2=Math.imul(h2,16777619)>>>0; }
  const hex=n=>n.toString(16).padStart(8,'0');
  const a=hex(h1), b=hex(h2), c=hex((h1^h2)>>>0), d=hex(Math.imul(h1,h2)>>>0);
  return `${a}-${b.slice(0,4)}-4${b.slice(5,8)}-a${c.slice(1,4)}-${c.slice(4,8)}${d}`;
}
function egpQrSvg(str){
  let h=2166136261; for(let i=0;i<str.length;i++) h=Math.imul(h^str.charCodeAt(i),16777619)>>>0;
  let cells='';
  const finder=(ox,oy)=>{ for(let y=0;y<7;y++) for(let x=0;x<7;x++) if(x===0||x===6||y===0||y===6||(x>=2&&x<=4&&y>=2&&y<=4)) cells+=`<rect x="${ox+x}" y="${oy+y}" width="1" height="1"/>`; };
  finder(1,1); finder(13,1); finder(1,13);
  for(let y=1;y<20;y++) for(let x=1;x<20;x++){
    if((x<9&&y<9)||(x>11&&y<9)||(x<9&&y>11)) continue;
    h=Math.imul(h^(x*37+y*101),16777619)>>>0;
    if((h&3)===0||(h&7)===1) cells+=`<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg viewBox="0 0 21 21" width="68" height="68" fill="#0f172a" style="background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:3px;flex:none" aria-label="e-Belge Karekod">${cells}</svg>`;
}
// Mal / Hizmet açıklaması: kesilmiş belgede belgedeki metin, yoksa ayarlardaki şablon ({banka}/{iban}/{uye}).
function egpDescFor(w, tpl){
  if(!tpl && w.egp && w.egp.desc) return w.egp.desc;
  const E=egpCfg(), U=user(w.u)||{};
  return String(tpl||E.descTpl||'Vergi mükellefi olmayan gerçek kişiden dijital oyun içi varlık tedariki ve bakiye ödemesi')
    .replace(/\{banka\}/g,w.bank||'Banka').replace(/\{iban\}/g,fmtIban(w.iban||'')).replace(/\{uye\}/g,U.name||'');
}
// Pusula her zaman üyenin sistemde kayıtlı kimliğiyle kesilir (IBAN hesap sahibi adıyla değil).
// Gider pusulasında TAM T.C. kimlik no zorunlu: yalnızca u.tc.no (11 hane) kullanılır; maskeli/yedek değer basılmaz.
function egpIdent(w){ const U=user(w.u)||{};
  return {name:fullName(U)||U.name||'Üye', tckn:tcFull(U)?U.tc.no:'', tel:U.tel||'-', u:U}; }
const EGP_NOTC='Üyenin tam T.C. kimlik numarası kayıtlı değil';
function issueEgp(w, opts){
  const E=egpCfg(), U=user(w.u)||{}; opts=opts||{};
  const prev=w.egp||null, preview=!!opts.preview;
  // Tam TC yoksa belge kesilmez/güncellenmez (yalnızca taslak önizleme çizilebilir).
  if(!preview&&!tcFull(U)) return null;
  // Ödenmiş çekimde tutarlar kilitli: defterdeki ödenen net/stopaj ile belge aynı kalır.
  const lock=opts.lockAmounts!=null?!!opts.lockAmounts:!!prev;
  const yr=new Date(w.pt||now()).getFullYear();
  const seri=(E.seri||'YGP').toUpperCase().slice(0,3).padEnd(3,'X');
  // Mevcut belge düzenlenirse no / ETTN / tarih korunur; önizleme sıra numarası tüketmez.
  const no=prev?prev.no:(opts.no||(preview?'TASLAK (onayda numaralanır)':`${seri}${yr}${String(++E.seq).padStart(9,'0')}`));
  const fee=w.fee||0, brut=r2(w.amount-fee);
  let stopajPct, stopaj, net;
  if(lock){ stopajPct=+w.stopajPct||0; stopaj=r2(+w.stopaj||0); net=w.net!=null?r2(w.net):r2(brut-stopaj); }
  else {
    stopajPct=opts.stopajPct!=null?+opts.stopajPct:(w.stopajPct!=null?+w.stopajPct:0); // eski talepte oran yoksa 0
    stopaj=r2(brut*stopajPct/100); net=r2(brut-stopaj);
    if(!preview){ w.stopajPct=stopajPct; w.stopaj=stopaj; w.net=net; }
  }
  const I=egpIdent(w);
  const desc=egpDescFor(w, opts.desc);
  const g={
    no,
    ettn:prev?prev.ettn:(opts.ettn||(preview?'—':makeEttn(no+'-'+w.id))),
    t:prev?prev.t:(w.pt||now()),
    sellerName:I.name,
    userName:U.name||'',
    tckn:I.tckn,
    tel:I.tel,
    email:U.email||'',
    addr:opts.addr||U.addr||'Türkiye (Bireysel / Vergi Mükellefi Değil)',
    bank:w.bank||'-',
    iban:fmtIban(w.iban||''),
    amount:w.amount,
    fee,
    brut,
    stopajPct,
    stopaj,
    net,
    desc,
    company:E.company||'YangPazar Bilişim Ltd. Şti.',
    vd:E.vd||'Muğla Vergi Dairesi',
    vkn:E.vkn||'9340812450',
    mersis:E.mersis||'0934081245000001',
    compAddr:E.addr||'Muğla, Türkiye',
    provider:E.provider||'GİB e-Belge'
  };
  if(!preview) w.egp=g;
  return g;
}
// R9: üyenin banka dekontunda göreceği EFT açıklaması — pusula / belge no içermez.
const wdBankNote = (w,g) => `YangPazar Çekim Ödemesi Ref: ${w.id} - ${(g&&g.sellerName)||fullName(user(w.u)||{})||w.name||''}`;
function egpDocHtml(w, gIn){
  const g=gIn||w.egp||issueEgp(w,{preview:true});
  const bankNote = wdBankNote(w,g);
  return `<div class="egp-doc" id="egpDocArea">
    <div class="egp-hdr">
      <div class="egp-comp">
        <b>${esc(g.company)}</b>
        <div><b>Vergi Dairesi / VKN:</b> ${esc(g.vd)} · <span class="mono">${esc(g.vkn)}</span></div>
        <div><b>MERSİS No:</b> <span class="mono">${esc(g.mersis)}</span></div>
        <div><b>Adres:</b> ${esc(g.compAddr)}</div>
        <div><b>Web / E-Posta:</b> www.yangpazar.com · bildirim@yangpazar.com</div>
      </div>
      <div class="egp-seal">
        <div class="egp-seal-ring">T.C.<br>GİB<br>e-BELGE</div>
        <h4>e-GİDER PUSULASI</h4>
        <small>${esc(g.provider)}</small>
      </div>
      <div class="egp-meta">
        <table class="egp-meta-tbl">
          <tr><td>Belge No</td><td class="mono"><b>${esc(g.no)}</b></td></tr>
          <tr><td>Düzenleme Tarihi</td><td class="mono">${dtstr(g.t)}</td></tr>
          <tr><td>Belge Türü</td><td>GİDER PUSULASI</td></tr>
          <tr><td>Ödeme Yöntemi</td><td>Banka EFT / Havale</td></tr>
          <tr><td>Ref / Çekim ID</td><td class="mono">#${esc(w.id)}</td></tr>
        </table>
        ${egpQrSvg(g.ettn)}
      </div>
    </div>
    <div style="font-size:11px;color:#475569;margin-bottom:10px;font-family:var(--f-mono)"><b>ETTN:</b> ${esc(g.ettn)}</div>
    <div class="egp-party">
      <div><b>Satıcı (Ödeme Yapılan Kişi):</b> ${esc(g.sellerName)} ${g.userName?`(@${esc(g.userName)})`:''}</div>
      <div><b>T.C. Kimlik No:</b> ${g.tckn?`<span class="mono">${esc(g.tckn)}</span>`:`<span style="color:#b91c1c;font-weight:700">${EGP_NOTC}</span>`}</div>
      <div><b>Vergi Mükellefiyeti:</b> Yok (VUK Md. 234 Gerçek Kişi)</div>
      <div><b>Telefon / İletişim:</b> <span class="mono">${esc(g.tel)}</span></div>
      <div><b>Ödeme Yapılan Banka:</b> ${esc(g.bank)}</div>
      <div><b>Ödeme Yapılan IBAN:</b> <span class="mono">${esc(g.iban)}</span></div>
    </div>
    <div class="egp-tbl-w"><table class="egp-tbl">
      <thead>
        <tr>
          <th style="width:42px">#</th>
          <th>Mal / Hizmet Cinsi ve Açıklaması</th>
          <th class="num" style="width:110px">Brüt Tutar</th>
          <th class="num" style="width:95px">GV Stopaj %</th>
          <th class="num" style="width:110px">Stopaj Tutarı</th>
          <th class="num" style="width:120px">Net Ödenen</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="mono">1</td>
          <td>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
              <span>${esc(g.desc)}</span>
              <button type="button" class="btn btn-sm" style="flex:none;padding:3px 8px;font-size:11px;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1" data-act="copy" data-v="${esc(g.desc)}" title="Mal / Hizmet Açıklamasını panoya kopyala">📋 Açıklamayı Kopyala</button>
            </div>
          </td>
          <td class="num">${TL(g.brut)}</td>
          <td class="num">%${g.stopajPct}</td>
          <td class="num">${TL(g.stopaj)}</td>
          <td class="num"><b>${TL(g.net)}</b></td>
        </tr>
      </tbody>
    </table></div>
    <table class="egp-sum">
      <tr><td>Çekim Talebi Toplamı</td><td class="num mono">${TL(g.amount)}</td></tr>
      ${g.fee?`<tr><td>Platform İşlem Ücreti (−)</td><td class="num mono">${TL(g.fee)}</td></tr>`:''}
      <tr><td>Gider Pusulası Brüt Tutar</td><td class="num mono"><b>${TL(g.brut)}</b></td></tr>
      <tr><td>Gelir Vergisi Stopajı (%${g.stopajPct})</td><td class="num mono">${TL(g.stopaj)}</td></tr>
      <tr class="tot"><td>IBAN'a Gönderilen Net Tutar</td><td class="num mono">${TL(g.net)}</td></tr>
    </table>
    <div style="background:#f8fafc;border:1px dashed #cbd5e1;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <span><b>Banka EFT Açıklama Metni:</b> <code class="mono">${esc(bankNote)}</code></span>
      <button type="button" class="btn btn-sm" style="padding:2px 8px;font-size:11px" data-act="copy" data-v="${esc(bankNote)}">Banka Açıklamasını Kopyala</button>
    </div>
    <div class="egp-note">
      <b>Yasal Bilgi:</b> İşbu <b>e-Gider Pusulası</b>, 213 sayılı Vergi Usul Kanunu'nun 234. maddesi ve 509 Sıra No.lu VUK Genel Tebliği uyarınca vergi mükellefi olmayan gerçek kişiden yapılan dijital oyun içi varlık / bakiye tasfiyesi ödemesi karşılığında elektronik ortamda düzenlenmiştir. Ödeme, şirket banka hesabımızdan yukarıda belirtilen <b>${esc(g.iban)}</b> numaralı IBAN hesabına EFT/Havale yoluyla gerçekleştirilmiş olup banka dekontu ile tevsik edilmiştir.
    </div>
    <div class="egp-sign">
      <div><b>Düzenleyen (Alıcı Şirket)</b><br>${esc(g.company)}<br><span style="color:#059669;font-weight:700">✔ Mali Mühür / e-İmza ile İmzalanmıştır</span></div>
      <div><b>Ödeme Yapılan (Teslim Eden)</b><br>${esc(g.sellerName)}<br><span style="color:#475569">Elektronik Onay & Banka EFT Dekontu (#${esc(w.id)})</span></div>
    </div>
  </div>`;
}
// İndirilen .html pusula için: sayfadaki .egp-* kurallarını (medya sorguları dahil) toplar; kopyala butonları dosyada gizlenir.
function egpCss(){ let out=':root{--f-body:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;--f-mono:ui-monospace,Menlo,Consolas,monospace}.egp-doc button{display:none!important}';
  for(const sh of document.styleSheets){ let rules; try{ rules=sh.cssRules; }catch(e){ continue; } for(const r of rules||[]){ if(r.cssText.includes('.egp-')) out+=r.cssText+'\n'; } }
  return out; }
const egpStaff = () => can('cekim')||can('muhasebe'); // R9: pusula belgeleri yalnız iç muhasebe (cekim/muhasebe yetkisi)
function mEgpView(id){
  if(!egpStaff()) return toast('Bu işlem için yetkiniz yok.',true);
  const w=S.wd.find(x=>x.id===id); if(!w) return;
  // Henüz kesilmemişse yalnızca taslak önizleme gösterilir: sıra numarası tüketilmez, kayıt değişmez.
  const pv=!w.egp; const g=w.egp||issueEgp(w,{preview:true});
  const bankNote = wdBankNote(w,g);
  modal(`<div class="md" style="width:min(880px,100%)" role="dialog" aria-label="e-Gider Pusulası">
    <div class="md-h"><h3>e-Gider Pusulası · ${pv?'Taslak önizleme':esc(g.no)}</h3><button class="md-x" data-act="close" aria-label="Kapat">×</button></div>
    <div class="md-b stack">
      ${pv?'<div class="note note-info">Bu çekim için henüz e-Gider Pusulası kesilmedi. Aşağıdaki görünüm taslaktır; belge numarası ve ETTN pusula kesildiğinde verilir.</div>':''}
      ${egpDocHtml(w,g)}
      <div class="hstack" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div class="hstack" style="flex-wrap:wrap;gap:6px">
          ${pv?'':`<button type="button" class="btn btn-primary" data-act="egp-dl" data-id="${w.id}">📥 e-Gider Pusulası İndir (.html / Yazdır)</button>`}
          <button type="button" class="btn btn-ok" data-act="copy" data-v="${esc(g.desc)}">📋 Mal / Hizmet Açıklamasını Kopyala</button>
          ${pv?'':`<button type="button" class="btn" data-act="copy" data-v="${esc(bankNote)}">📋 Banka EFT Açıklamasını Kopyala</button>
          <button type="button" class="btn" data-act="copy" data-v="${esc(JSON.stringify(g,null,2))}">📋 GİB JSON</button>`}
        </div>
        <button type="button" class="btn btn-ghost" data-act="close">Kapat</button>
      </div>
    </div>
  </div>`);
}
function mEgpModal(id){
  const w=S.wd.find(x=>x.id===id); if(!w) return;
  const I=egpIdent(w), paid=w.status!=='bekliyor';
  const fee=w.fee||0, brut=r2(w.amount-fee);
  const stPct=w.stopajPct!=null?+w.stopajPct:0; // eski talepte oran yoksa 0 (talep anındaki oran)
  const stAmt=paid?r2(+w.stopaj||0):r2(brut*stPct/100), net=paid&&w.net!=null?r2(w.net):r2(brut-stAmt);
  const desc=egpDescFor(w);
  const mism=I.name&&w.name&&w.name.toLocaleLowerCase('tr-TR')!==I.name.toLocaleLowerCase('tr-TR');
  const U=I.u, noTc=!I.tckn, msk=U.tc&&(U.tc.mask||U.tc.masked)||'';
  const tcBox=noTc?`<form class="stack egptc" data-form="egptc" data-id="${w.id}" novalidate>
    <div class="note note-bad" role="alert"><b>${EGP_NOTC}.</b> Gider pusulasında tam numara zorunlu olduğundan pusula kesilemez. Üyenin tam numarasını girin ya da üyeden yeniden doğrulama isteyin.${tcOk(U)?` <span class="muted">Kayıtlı maske: <span class="mono">${esc(msk)}</span></span>`:' <span class="muted">Üyenin kimlik doğrulaması yok.</span>'}${U.tcAsk?`<br><span class="muted" style="font-size:12px">Üyeden doğrulama istendi: ${dtstr(U.tcAsk)}</span>`:''}</div>
    <div class="hstack egptc-r" style="align-items:flex-end;flex-wrap:wrap;gap:8px"><div class="fld" style="flex:1 1 200px;min-width:0"><label for="egi_tcfull">Üyenin tam T.C. kimlik no (11 hane)</label><input class="inp mono" id="egi_tcfull" inputmode="numeric" maxlength="11" autocomplete="off" placeholder="${esc(msk||'11 haneli')}" aria-describedby="egi_tcerr"></div><button class="btn btn-primary">Doğrula ve kaydet</button><button type="button" class="btn" data-act="tc-ask" data-id="${U.id||''}" data-w="${w.id}">Üyeden yeniden doğrulama iste</button></div>
    <div class="neg" id="egi_tcerr" style="font-size:12.5px" aria-live="polite"></div>
  </form>`:'';
  modal(mWrap(`e-Gider Pusulası Kes & Ödemeyi Onayla · #${w.id}`,`${tcBox}<form class="stack" data-form="egpissue" data-id="${w.id}"${noTc?' style="margin-top:14px"':''}>
    <div class="note note-info">Şirket hesabınızdan <b>${esc(fmtIban(w.iban))}</b> IBAN'ına yapılan EFT/Havale çıkışı için üyenin sistemde kayıtlı bilgileriyle (<b>${esc(I.name)}</b>) resmi <b>e-Gider Pusulası</b> oluşturulur.${mism?`<br><span class="pill p-itiraz">İsim uyuşmuyor</span> IBAN hesap sahibi: <b>${esc(w.name)}</b>`:''}</div>
    <div class="row3">
      <div class="fld"><label for="egi_name">Ad Soyad (sistem kaydı)</label><input class="inp" id="egi_name" value="${esc(I.name)}" readonly></div>
      <div class="fld"><label for="egi_tckn">T.C. Kimlik No (sistem kaydı)</label><input class="inp mono" id="egi_tckn" value="${esc(I.tckn)}" placeholder="Kayıtlı değil" readonly${noTc?' aria-invalid="true" style="border-color:var(--bad,#dc2626)"':''}></div>
      <div class="fld"><label for="egi_tel">Telefon (sistem kaydı)</label><input class="inp mono" id="egi_tel" value="${esc(I.tel)}" readonly></div>
    </div>
    <div class="row3">
      <div class="fld"><label>Brüt Tutar</label><input class="inp mono" value="${TL(brut)}" disabled></div>
      <div class="fld"><label for="egi_st">GV Stopaj Oranı (%)</label><input class="inp mono" id="egi_st" type="number" min="0" max="40" step="0.5" value="${paid?(+w.stopajPct||0):stPct}" ${paid?'readonly':'data-change="egicalc"'} data-brut="${brut}"></div>
      <div class="fld"><label>IBAN'a Gönderilecek Net</label><input class="inp mono" id="egi_net" value="${TL(net)}" disabled></div>
    </div>
    ${paid?'<div class="note note-warn" style="font-size:12px">Ödeme yapıldığı için net tutar ve stopaj değiştirilemez; yalnızca Mal / Hizmet açıklaması güncellenebilir. Belge numarası ve ETTN korunur.</div>':''}
    <div class="fld">
      <div class="hstack" style="justify-content:space-between">
        <label for="egi_desc">Mal / Hizmet Açıklaması</label>
        <button type="button" class="btn btn-sm" data-act="copy" data-v="${esc(desc)}">📋 Açıklamayı Kopyala</button>
      </div>
      <textarea class="inp" id="egi_desc" rows="2" required>${esc(desc)}</textarea>
    </div>
    <div class="hstack"><button class="btn btn-ok"${noTc?' disabled title="'+EGP_NOTC+'"':''}>${w.status==='bekliyor'?'Ödemeyi Onayla & e-Gider Pusulası Kes':w.egp?'e-Gider Pusulasını Güncelle':'e-Gider Pusulası Kes'}</button><button type="button" class="btn btn-ghost" data-act="close">İptal</button></div>
  </form>`));
}

function addRev(k,a){S.rev[k]=r2((S.rev[k]||0)+a); S.revLog.push({t:now(),k,a:r2(a)})}
// Onaylanan çekimin defter kayıtları: talep tutarı = ödenen net + işlem ücreti (gelir) + GV stopajı (vergi dairesine ödenecek borç).
function wdPaidBook(w){ const net=w.net!=null?w.net:w.amount;
  ledger('cekim_odendi',w.u,net,{m:(w.bank||'')+' · '+w.iban+(w.egp?' · e-Gider Pusulası: '+w.egp.no:'')+(w.fee?' · ücret '+TL(w.fee):''),ref:w.id});
  if(w.stopaj>0) ledger('stopaj_tahakkuk',w.u,w.stopaj,{m:'GV stopajı %'+(w.stopajPct||0)+' · vergi dairesine ödenecek'+(w.egp?' · '+w.egp.no:''),ref:w.id});
  if(w.fee) addRev('cekim',w.fee);
  return net; }
const RCATS={yang:'Yang / Won ilanları',item:'Item ilanları',karakter:'Karakter ilanları',ep:'EP ilanları (PVP)',epstore:'Metin2 EP mağazası',borsa:'Yang Borsası alımları'};
const vipIdx = id => Math.max(0,VIP.findIndex(v=>v.id===id));
const rOk = (r,u) => !!u && (!r.minVip || vipIdx(vip(u).id) >= vipIdx(r.minVip));
const rPer = r => Math.max(1,+r.per||100);
const rCap = (r,uid_,n) => r.maxTk>0 ? Math.max(0,Math.min(n,r.maxTk-((r.tk||{})[uid_]||0))) : n;
function raffleSpend(uid_,amt,cat){ const u=user(uid_); const got=[]; activeRaffles().forEach(r=>{ if(!rOk(r,u)) return; if(r.cats&&r.cats.length&&!r.cats.includes(cat)) return; r.acc=r.acc||{}; r.acc[uid_]=r2((r.acc[uid_]||0)+amt); let n=Math.floor(r.acc[uid_]/rPer(r)); if(n<=0) return; r.acc[uid_]=r2(r.acc[uid_]-n*rPer(r)); n=rCap(r,uid_,n); if(n<=0) return; r.tk[uid_]=(r.tk[uid_]||0)+n; got.push({r,n}); });
  if(got.length) notify(uid_,`Çekiliş bileti kazandın: ${got.map(g=>g.n+' bilet · '+g.r.title).join(', ')}`,'#cekilis','ticket'); return got; }
function rCond(r){ const L=[]; L.push(`Her <b>${TL(rPer(r))}</b> alışverişte 1 bilet`); L.push(r.cats&&r.cats.length?`Geçerli: ${r.cats.map(c=>RCATS[c]||c).join(', ')}`:'Geçerli: tüm alışverişler'); if(r.minVip){ const v=VIP.find(x=>x.id===r.minVip); if(v) L.push(`Katılım: <span class="vip" style="background:${v.c}">${v.n}</span> ve üzeri üyeler`); } if(r.maxTk>0) L.push(`Kişi başı en fazla ${r.maxTk} bilet`); if(r.free!==false) L.push('Günde 1 ücretsiz bilet'); return L; }
function addTickets(u,n){ if(n<=0) return; const U=user(u); activeRaffles().forEach(r=>{ if(!rOk(r,U)) return; const m=rCap(r,u,n); if(m>0) r.tk[u]=(r.tk[u]||0)+m; }); }
