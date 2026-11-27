/* ================== modallar ================== */
let popTimer=null;
function modal(html,locked){ $('#modal').innerHTML=`<div class="mb" data-lock="${locked?1:0}">${html}</div>`; hydrateMedia(); }
function closeModal(){ $('#modal').innerHTML=''; if(popTimer){clearInterval(popTimer);popTimer=null;} }
function mWrap(title,body){return `<div class="md" role="dialog" aria-label="${esc(title)}"><div class="md-h"><h3>${title}</h3><button class="md-x" data-act="close" aria-label="Kapat">×</button></div><div class="md-b">${body}</div></div>`}
/* ---- Giriş Yap / Kayıt Ol: tek pencere, iki sekme (P6). Alan kimlikleri ve kurallar aynı (lg_*, rg_*); "Google ile devam et"
   düğmesi formdaki [data-galt] yerine eklenir (prod/98g-google.js). Şifre göz düğmesi: data-act="pw-eye" (85-auth-act.js). ---- */
const AUTH_ICO={eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  off:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  at:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>'};
const pwFld = (id,label,ac,extra) => `<div class="fld"><label for="${id}">${label}</label><div class="pw"><input class="inp" id="${id}" type="password" autocomplete="${ac}" required ${extra||''}><button type="button" class="pw-eye" data-act="pw-eye" data-for="${id}" aria-label="Şifreyi göster" aria-pressed="false" title="Şifreyi göster">${AUTH_ICO.eye}</button></div></div>`;
const authLegal = () => `<p class="auth-legal">Devam ederek <a href="#sayfa-mesafeli" data-act="close">Mesafeli Satış Sözleşmesi</a>'ni ve kişisel verilerinin <a href="#sayfa-kvkk" data-act="close">KVKK Aydınlatma Metni</a>'ne göre işlenmesini kabul etmiş olursun.</p>`;
function authShell(tab,body){ return `<div class="md auth" role="dialog" aria-label="${tab==='register'?'Kayıt Ol':'Giriş Yap'}"><div class="auth-h"><div class="auth-tabs" role="tablist">
  <button type="button" role="tab" class="${tab==='login'?'on':''}" aria-selected="${tab==='login'}" data-act="login">Giriş Yap</button><button type="button" role="tab" class="${tab==='register'?'on':''}" aria-selected="${tab==='register'}" data-act="register">Kayıt Ol</button></div>
  <button class="md-x" data-act="close" aria-label="Kapat">×</button></div><div class="md-b">${body}</div></div>`; }
function mLogin(err){ const desc={u1:'Satıcı · teslim etmesi gereken siparişi var',u2:'Alıcı · teslim onayı bekleyen siparişi var',u3:'Satıcı · Elmas VIP',u4:'Satıcı · itiraz açmış alıcı',u5:'EP ve Won satıcısı',st1:'Çalışan · sipariş, borsa, destek, ilan yetkisi',admin:'Yönetici · tüm yetkiler'};
  modal(authShell('login',`<form class="stack auth-f" data-form="loginf"><div class="fld"><label for="lg_u">Kullanıcı adı veya e-posta</label><div class="inp-ic"><input class="inp" id="lg_u" autocomplete="username" required placeholder="ornek@eposta.com" autocapitalize="none" spellcheck="false"><span class="ic">${AUTH_ICO.at}</span></div></div>
  ${pwFld('lg_p','Şifre','current-password')}
  <div class="auth-row"><button type="button" class="lnk" data-act="auth-forgot">Şifremi unuttum</button></div>
  <label class="chk auth-rem" for="lg_rem"><input type="checkbox" id="lg_rem" checked> Beni hatırla <span class="muted">· 30 gün açık kalsın</span></label>
  ${err?`<div class="note note-bad">${esc(err)}</div>`:''}<button class="btn btn-primary btn-block auth-go">Giriş Yap</button><div class="authalt" data-galt></div>
  <span class="muted auth-sw">Hesabın yok mu? <button type="button" class="lnk" data-act="register">Hemen kayıt ol</button></span>${authLegal()}</form>
  ${S.set.demoMode===false?'':`<div class="eyebrow">Demo hesaplar (şifre: 1234)</div>`}<div class="acclist" ${S.set.demoMode===false?'hidden':''}>${S.users.map(u=>`<button data-act="as" data-id="${u.id}">${av(u)}<span><b>${esc(u.name)}</b><small>${desc[u.id]||esc(fullName(u))}</small></span></button>`).join('')}</div>`)); }
function mRegister(err){ modal(authShell('register',`<form class="stack auth-f" data-form="registerf"><div class="row2"><div class="fld"><label for="rg_ad">Ad</label><input class="inp" id="rg_ad" required autocomplete="given-name"></div><div class="fld"><label for="rg_sy">Soyad</label><input class="inp" id="rg_sy" required autocomplete="family-name"></div></div>
  <div class="fld"><label for="rg_u">Kullanıcı adı (sitede görünür)</label><input class="inp" id="rg_u" required minlength="3" maxlength="20" pattern="[A-Za-z0-9_ÇĞİÖŞÜçğıöşü]+" autocomplete="username" autocapitalize="none" spellcheck="false"></div>
  <div class="row2"><div class="fld"><label for="rg_t">Cep telefonu</label><input class="inp mono" id="rg_t" required placeholder="05xx xxx xx xx" inputmode="tel" autocomplete="tel"></div><div class="fld"><label for="rg_e">E-posta</label><input class="inp" id="rg_e" type="email" required autocomplete="email" placeholder="ornek@eposta.com"></div></div>
  ${pwFld('rg_p','Şifre','new-password','minlength="4"')}
  ${S.set.refOn?(refPending()?`<div class="note note-ok refnote">🎁 <span><b>${esc(refUser(refPending()).name)}</b> seni davet etti. Davet kodun otomatik eklendi; ilk alışverişinde ${TL(S.set.refFriend)} hediye bakiye kazanırsın.</span><input type="hidden" id="rg_ref" value="${refPending()}"></div>`:`<div class="fld"><label for="rg_ref">Davet kodu (isteğe bağlı)</label><input class="inp mono" id="rg_ref" placeholder="ARKADAS26" style="text-transform:uppercase"></div>`):''}
  <label class="chk" for="rg_k"><input type="checkbox" id="rg_k" required> KVKK aydınlatma metnini ve üyelik sözleşmesini okudum.</label>
  ${err?`<div class="note note-bad">${esc(err)}</div>`:''}<button class="btn btn-primary btn-block auth-go">Kayıt Ol</button><div class="authalt" data-galt></div><span class="muted" style="font-size:12px">Ad, soyad ve telefonunuz diğer üyelere gösterilmez; para çekme ve SMS bildirimleri için kullanılır.</span>
  <span class="muted auth-sw">Zaten üye misin? <button type="button" class="lnk" data-act="login">Giriş yap</button></span></form>`)); }
/* Şifremi unuttum: 1) kullanıcı adı / e-posta → kod gönder (yanıt her zaman aynı) 2) kod + yeni şifre. Bağlantıyla gelinirse (token) yalnız yeni şifre. */
function mForgot(o){ o=o||{}; const st=o.step||1;
  const body = st===1 ? `<form class="stack auth-f" data-form="forgotf"><div class="auth-back"><button type="button" class="lnk" data-act="login">← Girişe dön</button></div><h3 class="auth-t">Şifremi unuttum</h3>
    <p class="muted auth-p">Kullanıcı adınızı veya e-posta adresinizi yazın. Hesabınız varsa e-postanıza (e-posta yoksa WhatsApp'ınıza) 6 haneli bir kod ve sıfırlama bağlantısı göndereceğiz.</p>
    <div class="fld"><label for="fg_u">Kullanıcı adı veya e-posta</label><div class="inp-ic"><input class="inp" id="fg_u" autocomplete="username" required value="${esc(o.login||'')}" autocapitalize="none" spellcheck="false" placeholder="ornek@eposta.com"><span class="ic">${AUTH_ICO.at}</span></div></div>
    ${o.err?`<div class="note note-bad">${esc(o.err)}</div>`:''}<button class="btn btn-primary btn-block auth-go">Kod gönder</button>
    <p class="auth-legal">Ekibimiz sizden asla şifre veya doğrulama kodu istemez. Kodu kimseyle paylaşmayın.</p></form>`
    : `<form class="stack auth-f" data-form="resetf"${o.token?` data-token="${esc(o.token)}"`:''}><div class="auth-back"><button type="button" class="lnk" data-act="${o.token?'login':'auth-forgot'}">← ${o.token?'Girişe dön':'Geri'}</button></div><h3 class="auth-t">Yeni şifre belirleyin</h3>
    ${o.msg?`<div class="note note-ok">${esc(o.msg)}</div>`:''}
    ${o.token?'<p class="muted auth-p">Bağlantı doğrulandı. Yeni şifrenizi yazın; tüm cihazlardaki oturumlarınız kapanır.</p>':`<input type="hidden" id="rs_u" value="${esc(o.login||'')}"><div class="fld"><label for="rs_c">6 haneli kod</label><input class="inp mono tfacode" id="rs_c" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>`}
    ${pwFld('rs_p','Yeni şifre','new-password','minlength="8"')}<span class="muted" style="font-size:12px;margin-top:-6px">En az 8 karakter. Şifre değişince tüm cihazlardaki oturumlarınız kapanır.</span>
    ${o.err?`<div class="note note-bad">${esc(o.err)}</div>`:''}<button class="btn btn-primary btn-block auth-go">Şifremi değiştir</button>
    ${o.token?'':`<span class="muted auth-sw">Kod gelmedi mi? <button type="button" class="lnk" data-act="auth-forgot" data-login="${esc(o.login||'')}">Yeniden iste</button></span>`}</form>`;
  modal(authShell('login',body)); setTimeout(()=>{ const i=$(st===1?'#fg_u':(o.token?'#rs_p':'#rs_c')); if(i&&!isTouchUI()) i.focus(); },50); }
const DEPTABS=[['kart','Kredi / Banka Kartı'],['eft','Havale / EFT'],['cuzdan','Cüzdan & Kripto']];
const EFTBANKS=[['ziraat','Ziraat Bankası'],['isbank','İş Bankası'],['akbank','Akbank'],['yapikredi','Yapı Kredi'],['vakifbank','VakıfBank'],['halkbank','Halkbank'],['denizbank','DenizBank'],['teb','TEB'],['ptt','PTT']];
function mDeposit(tab){ const u=me(); if(!u) return mLogin(); if(typeof tab==='string') ui.depTab=tab;
  const tabs=DEPTABS.filter(([k])=>S.gws.some(g=>g.on&&g.cat===k)); let T=ui.depTab||'kart'; if(!tabs.some(([k])=>k===T)) T=(tabs[0]||['kart'])[0];
  const G=S.gws.filter(g=>g.on&&g.cat===T); const amt=ui.depAmt||250;
  const info={kart:'<b>Kartla yüklenen bakiye çekilemez, sadece alışverişte kullanılır.</b> Kart bilgileriniz sitemize kaydedilmez. Ödeme, bankanızın 3D Secure doğrulamasıyla güvenli ödeme altyapısında yapılır.',eft:'<b>Havale/EFT ile yüklenen bakiye çekilebilir.</b> PayTR Havale/EFT ile size özel açıklama kodu verilir, transferiniz 7/24 otomatik eşleşir ve bakiye dakikalar içinde yüklenir.',cuzdan:'<b>Cüzdan ve kriptoyla yüklenen bakiye çekilemez, sadece alışverişte kullanılır.</b> Papara, Paycell, ininal ve GPay anında yüklenir. Kripto yüklemeleri ağ onayından sonra ekibimizce eklenir.'}[T];
  modal(`<div class="md dep" role="dialog" aria-label="Bakiye yükle"><div class="md-h"><h3>Bakiye Yükle</h3><button class="md-x" data-act="close" aria-label="Kapat">×</button></div>
    <div class="segtabs dtabs">${tabs.map(([k,v])=>`<button class="${k===T?'on':''}" data-act="dep-tab" data-t="${k}">${v}</button>`).join('')}</div>
    <form class="md-b" data-form="dep"><div class="note note-info" style="font-size:12.5px">${info}</div>
      ${G.length>1?`<div class="fld"><span class="lbl">${T==='kart'?'Ödeme altyapısı':'Yöntem'}</span><div class="gw-list">${G.map((g,i)=>`<label for="pm_${g.id}"><input type="radio" name="pm" id="pm_${g.id}" value="${g.id}" ${i===0?'checked':''} data-change="depcalc"><b>${esc(g.n)}</b>${esc(g.t)}<em>${g.fee?'%'+g.fee+' hizmet bedeli':'Ücretsiz'}</em></label>`).join('')}</div></div>`:G.map(g=>`<input type="radio" name="pm" value="${g.id}" checked hidden>`).join('')}
      <div class="fld"><label for="dep_amt">Yüklenecek tutar (TL)</label><input class="inp" id="dep_amt" type="number" min="10" step="1" value="${amt}" required data-change="depcalc"></div>
      <div class="hstack">${[100,250,500,1000].map(v=>`<button type="button" class="btn btn-sm" data-act="amt" data-v="${v}">${TL(v).replace(',00','')}</button>`).join('')}</div>
      <div class="fld"><label for="dep_cp">Kupon kodu (isteğe bağlı)</label><input class="inp mono" id="dep_cp" placeholder="HOSGELDIN" data-change="depcalc" style="text-transform:uppercase"></div>
      <div id="depManual"></div><div class="sum" id="depSum"></div>
      <button class="btn btn-primary" id="depBtn">Ödemeye geç</button></form></div>`);
  depCalc();
}
function depCalc(){
  const id=(document.querySelector('input[name=pm]:checked')||{}).value; const g=S.gws.find(x=>x.id===id); if(!g) return;
  const a=+($('#dep_amt')||{}).value||0; ui.depAmt=a; const fee=r2(a*g.fee/100);
  const code=(($('#dep_cp')||{}).value||'').trim().toUpperCase(); const c=S.coupons.find(x=>x.code===code&&x.on);
  const used=c&&c.used.includes(S.cur); const bonus=c&&!used?r2(Math.min(c.max,a*c.pct/100)):0;
  $('#depSum').innerHTML=`<div><span>Bakiyenize eklenecek</span><b class="mono">${TL(a+bonus)}</b></div>${bonus?`<div><span class="muted">Kupon bonusu (${esc(c.code)})</span><span class="mono pos">+${TL(bonus)}</span></div>`:code?`<div><span class="muted">Kupon</span><span class="neg">${used?'Bu kuponu daha önce kullandınız':'Geçersiz kod'}</span></div>`:''}<div><span class="muted">Hizmet bedeli (${esc(g.n)})</span><span class="mono">${TL(fee)}</span></div><div class="tot"><span>Ödenecek</span><span class="mono">${TL(a+fee)}</span></div>`;
  const u=me();
  $('#depManual').innerHTML = g.id==='paytr_eft' ? `<div class="fld"><label for="dep_bank">Göndereceğiniz banka</label><select class="inp" id="dep_bank">${EFTBANKS.map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><span class="muted" style="font-size:12px">Transferi ${esc(fullName(u)||'kendi adınıza')} adına kayıtlı hesaptan yapın. Başkasının hesabından gelen ödemeler iade edilir.</span></div>`
    : g.id==='havale' ? `<div class="note note-info stack" style="gap:8px"><b>Aşağıdaki hesaplardan birine gönderin, açıklamaya kullanıcı adınızı (${esc(u.name)}) yazın. Ekibimiz onayladıktan sonra bakiyenize eklenir.</b>${S.banks.map(k=>`<div class="cprow" style="background:var(--surface)"><span><b>${esc(k.b)}</b> · ${esc(k.n)}<br><span class="mono">${esc(k.i)}</span></span><button type="button" class="btn btn-sm" data-act="copy" data-v="${esc(k.i)}">Kopyala</button></div>`).join('')}<div class="row2"><div class="fld"><label for="dep_dt">Dekonttaki işlem tarihi ve saati *</label><input class="inp mono" type="datetime-local" id="dep_dt" required max="${new Date(now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}" value="${new Date(now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}"></div><div class="fld"><label for="dep_to">Gönderdiğiniz hesabımız *</label><select class="inp" id="dep_to">${S.banks.map(k=>`<option>${esc(k.b)}</option>`).join('')}</select></div></div><div class="fld"><label for="dep_note">Gönderen adı soyadı / bankası</label><input class="inp" id="dep_note" placeholder="Ad Soyad · Banka"></div><span class="muted" style="font-size:12px">Tarih ve saati dekonttaki gibi yazın; ödemeniz bu bilgiyle hızlıca bulunup onaylanır.</span></div>`
    : g.id==='kripto' ? cryptoBox() : '';
  $('#depBtn').textContent = g.manual ? 'Ödemeyi yaptım, bildir' : g.id==='paytr' ? `Kart ile öde · ${TL(a+fee)}` : g.id==='paytr_eft' ? `Havale/EFT talimatı al · ${TL(a+fee)}` : `${g.n} ile öde · ${TL(a+fee)}`;
}
/* ================== TC kimlik doğrulama ================== */
const tcValid = t => { if(!/^[1-9]\d{10}$/.test(t)) return false; const d=[...t].map(Number); const o=d[0]+d[2]+d[4]+d[6]+d[8], e=d[1]+d[3]+d[5]+d[7]; if((((o*7-e)%10)+10)%10!==d[9]) return false; return d.slice(0,10).reduce((a,b)=>a+b,0)%10===d[10]; };
const tcOk = u => !!(u&&u.tc&&u.tc.ok);
const tcNeed = u => !!(S.set.tc&&S.set.tc.req&&u&&!u.admin&&!u.staff&&!tcOk(u));
async function sha256(s){ try{ const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(e){ let h=0; for(const c of s) h=(h*31+c.charCodeAt(0))|0; return 'x'+(h>>>0).toString(16); } }
/* Tam T.C. no (u.tc.no) yalnızca e-Gider Pusulası için saklanır; sitede her yerde maske (u.tc.mask) gösterilir. */
const tcMaskOf = t => t.slice(0,3)+'******'+t.slice(-2);
const tcFull = u => !!(u&&u.tc&&/^[1-9]\d{10}$/.test(String(u.tc.no||'')));
const tcNeedFull = u => !!(u&&!u.admin&&!u.staff&&tcOk(u)&&!tcFull(u));
// Tam numara onayı (admin girişi veya üyenin yeniden onayı): tcValid + maskenin ilk 3 / son 2 hanesi + varsa kayıtlı hash.
async function tcCheckFull(u,tc){ if(!tcValid(tc)) return 'T.C. kimlik numarası geçersiz. 11 haneyi kontrol edin.';
  const m=String((u.tc&&(u.tc.mask||u.tc.masked))||''); const hd=(m.match(/^\d+/)||[''])[0].slice(0,3), tl=(m.match(/\d+$/)||[''])[0].slice(-2);
  if(m&&(!tc.startsWith(hd)||!tc.endsWith(tl))) return 'Numara üyenin doğrulanmış kimliğiyle eşleşmiyor.';
  const h=await sha256(tc+'|yangpazar'); if(u.tc&&u.tc.h&&u.tc.h!==h) return 'Numara üyenin doğrulanmış kimliğiyle eşleşmiyor.';
  if(S.users.some(x=>x.id!==u.id&&x.tc&&(x.tc.h===h||x.tc.no===tc))) return 'Bu T.C. kimlik numarası başka bir hesapta kayıtlı.';
  return {h}; }
function tcSaveFull(u,tc,h,by){ if(!u.tc) u.tc={ok:false,t:now(),by:by||'admin'}; u.tc.no=tc; u.tc.mask=tcMaskOf(tc); if(!u.tc.h) u.tc.h=h; u.tc.nt=now(); delete u.tcAsk; }
// Migrasyonla üretilen demo numaraların hash'i (sha256 eşzamansız olduğu için yüklemeden sonra doldurulur).
async function tcHashFill(){ let ch=false; for(const u of S.users||[]){ if(u.tc&&tcFull(u)&&!u.tc.h){ u.tc.h=await sha256(u.tc.no+'|yangpazar'); ch=true; } } if(ch) save(); }
function tcConfirm(u){ const m=(u.tc&&u.tc.mask)||''; return `<div class="panel panel-b tcgate tcconf"><div class="tcgate-i">${ICO.shield}</div><form class="stack" data-form="tcconf" style="gap:8px;min-width:0;flex:1" novalidate><b style="font-size:16px">T.C. kimlik numaranızı onaylayın</b><span class="muted" style="font-size:13px">Kimliğiniz doğrulanmış (<span class="mono">${esc(m)}</span>). Yasal kayıt ve ödeme işlemleri için T.C. kimlik numaranızın tamamını bir kez onaylamanız gerekiyor. Numaranız sitede başkalarına maskeli gösterilir (KVKK).</span>
  <div class="hstack" style="align-items:flex-end;flex-wrap:wrap;gap:8px"><div class="fld" style="flex:1 1 200px;min-width:0;max-width:280px"><label for="tcc_no">T.C. kimlik numarası</label><input class="inp mono" id="tcc_no" required inputmode="numeric" maxlength="11" autocomplete="off" placeholder="${esc(m||'11 haneli')}" aria-describedby="tcc_err"></div><button class="btn btn-primary" id="tccBtn">Onayla</button></div>
  <div class="neg" id="tcc_err" style="font-size:12.5px" aria-live="polite"></div></form></div>`; }
function tcGate(u){ return `<div class="panel panel-b tcgate"><div class="tcgate-i">${ICO.shield}</div><div class="stack" style="gap:6px"><b style="font-size:16px">Para çekmek için kimliğinizi doğrulayın</b><span class="muted" style="font-size:13px">Sadece TC kimlik numaranızı ve doğum tarihinizi girmeniz yeterli. Bilgiler Nüfus ve Vatandaşlık İşleri (NVİ) kayıtlarıyla eşleştirilir, bir kez yapılır.</span><div><button class="btn btn-primary" data-act="tc-open">Kimliğimi doğrula</button></div></div></div>`; }
function mTc(afterReg){ const u=me(); if(!u) return mLogin(); if(tcOk(u)) return toast('Kimliğiniz zaten doğrulandı.');
  const lock=u.tcLock&&u.tcLock>now(); const maxD=new Date(); maxD.setFullYear(maxD.getFullYear()-18);
  modal(mWrap('Kimlik doğrulama',`<form class="stack" data-form="tcf">
    ${afterReg?'<div class="note note-ok" style="font-size:12.5px"><b>Üyeliğiniz oluşturuldu.</b> Kazancınızı çekebilmek için kimliğinizi şimdi doğrulayabilirsiniz.</div>':''}
    <div class="fld"><label for="tc_no">TC kimlik numarası</label><input class="inp mono" id="tc_no" required inputmode="numeric" maxlength="11" autocomplete="off" placeholder="11 haneli"></div>
    <div class="fld"><label for="tc_dt">Doğum tarihi</label><input class="inp mono" id="tc_dt" type="date" required max="${maxD.toISOString().slice(0,10)}" min="1920-01-01"></div>
    <div class="cprow" style="font-size:12.5px"><span><span class="muted">Eşleştirilecek ad soyad (üyelik bilgileriniz)</span><br><b>${esc(fullName(u)||'—')}</b></span><a class="btn btn-sm" href="#hesabim" data-act="tc-fixname">Düzelt</a></div>
    <div class="guard">${ICO.shield}<span>TC numaranız yalnızca yasal kayıt ve ödeme işlemleri için saklanır; sitede başkalarına maskeli gösterilir (KVKK). Para çekmek için 18 yaşını doldurmuş olmanız gerekir.</span></div>
    ${lock?`<div class="note note-bad">Çok fazla hatalı deneme yapıldı. ${dtstr(u.tcLock)} sonrasında tekrar deneyin.</div>`:''}
    <div class="hstack"><button class="btn btn-primary" id="tcBtn" ${lock?'disabled':''}>Doğrula</button>${afterReg?'<button type="button" class="btn" data-act="close">Sonra yapacağım</button>':''}</div></form>`)); }
