/* ================== 0.6.1: SMS (NetGSM) → WhatsApp Business Cloud API (yalnız --prod derlemesinde) ==================
   İç kanal / yetki adı "sms" olarak kaldı (users.tfa, outbox, settings.sms, yetki anahtarı); üyenin ve yöneticinin gördüğü
   her metin "WhatsApp" der. Demo (index.html) değişmez: paylaşılan dosyalardaki SMS metinleri burada, yalnız canlıda düzeltilir.
   PERMS_PROD: tools/gen-permmap.php bu tabloyu okuyup app/src/PermMap.php etiketlerine yazar (sunucu hata mesajları da WhatsApp der). */
const PERMS_PROD = {uye:'Üyeler & bakiye görüntüleme, WhatsApp',sms:'E-posta & WhatsApp'};
if(YP_PROD){
Object.assign(PERMS_,PERMS_PROD); Object.assign(PERMS,PERMS_PROD);

/* ---- Yönetim menüsü: E-posta & WhatsApp › Mesaj şablonları / E-posta ayarları / WhatsApp / Gönderim kayıtları ---- */
{ const it=ADM_NAV.flatMap(g=>g.items).find(i=>i.k==='sms');
  if(it){ it.l='E-posta & WhatsApp'; it.desc='Mesaj şablonları, e-posta ve WhatsApp ayarları, gönderim kayıtları.'; it.kw='whatsapp e-posta mail şablon meta doğrulama kodu';
    const s=(it.subs||[]).find(x=>x.s==='sms'); if(s){ s.s='whatsapp'; s.l='WhatsApp'; s.kw='whatsapp meta cloud api şablon kod'; } } }
ACT.ntab=(d)=>admGo('sms',({tpl:'sablonlar',mail:'eposta',sms:'whatsapp',log:'kayitlar'})[d.t]||(d.t&&d.t!=='undefined'?d.t:'whatsapp'));
/* eski bağlantı (#yonetim/sms/sms) → #yonetim/sms/whatsapp */
{ const v0=vAdmin; vAdmin=function(P){ if(P&&P.k==='sms'&&P.sub==='sms'){ P=Object.assign({},P,{sub:'whatsapp'}); try{ history.replaceState(null,'','#yonetim/sms/whatsapp'); }catch(e){} } return v0.call(this,P); }; }

/* ---- Hesabım › 2 adımlı doğrulama: "WhatsApp ile kod"; WhatsApp kapalıyken seçilemez ---- */
tfaPanel=function(u){ if(!S.set.tfaOn) return ''; const m=u.tfa||''; const wa=!!API.smsOn;
  const waSub=!wa?'WhatsApp ile doğrulama şu an kullanılamıyor':u.tel?maskTel(u.tel):'Önce profilinize cep telefonu ekleyin';
  const O=[['','Kapalı','Sadece şifreyle giriş',false],['sms','WhatsApp ile kod',waSub,!wa||!u.tel],['mail','E-posta ile kod',u.email?maskMail(u.email):'Önce e-posta ekleyin',false]];
  return `<div class="panel panel-b stack" style="max-width:560px"><div class="eyebrow">2 adımlı doğrulama</div><p class="muted" style="margin:0;font-size:13px">Açarsanız girişte şifrenizden sonra WhatsApp'ınıza ya da e-postanıza gelen 6 haneli kod istenir. Şifreniz başkasının eline geçse bile hesabınıza girilemez. İstemezseniz kapalı bırakın, sadece şifreyle girersiniz.</p>
    <div class="tfaopts">${O.map(([k,t,s,dis])=>`<label for="tf_${k||'off'}" ${dis?'style="opacity:.6;cursor:not-allowed" title="'+esc(s)+'"':''}><input type="radio" name="tfa" id="tf_${k||'off'}" value="${k}" ${m===k?'checked':''} ${dis&&m!==k?'disabled':''}><b>${t}</b><span>${esc(s)}</span></label>`).join('')}</div>
    <div class="hstack"><button type="button" class="btn btn-primary" data-act="tfa-save">Kaydet</button><span class="chip ${m?'ok':''}">${m?'Açık · '+(m==='sms'?'WhatsApp':'e-posta'):'Kapalı'}</span></div><span class="muted" style="font-size:12px">Açarken ve kapatırken güvenliğiniz için bir doğrulama kodu istenir.${m==='sms'&&!wa?' WhatsApp şu an kapalı olduğu için giriş kodunuz e-postanıza gönderilir.':''}</span></div>`; };

/* ---- paylaşılan (demo) ekranlardaki SMS ifadeleri: sipariş, borsa, site ayarları ---- */
const WA_FIX=[
  ['Alıcıya SMS ve e-posta ile haber verelim','Alıcıya bildirim ve e-posta ile haber verelim'],
  ['“ürününüz satıldı” bildirimi ve SMS gitti','“ürününüz satıldı” bildirimi gitti'],
  ['alıcıya bildirim ve SMS gönderin','alıcıya bildirim gönderin'],
  ['Hazır olunca bildirim ve SMS gelir.','Hazır olunca bildirim gelir.'],
  ['(SMS / e-posta kodu)','(WhatsApp / e-posta kodu)'],
  ['bildirim ve SMS gönderildi','bildirim gönderildi'],
];
const waFix = h => { if(typeof h!=='string'||h.indexOf('SMS')<0) return h; for(const [a,b] of WA_FIX) if(h.indexOf(a)>=0) h=h.split(a).join(b); return h; };
{ const v0=view; view=function(){ return waFix(v0.apply(this,arguments)); }; }
{ const m0=modal; modal=function(h){ return m0.apply(this,[waFix(h)].concat([].slice.call(arguments,1))); }; }
ACT['sms-user']=()=>toast('Üyeye WhatsApp ile ulaşma çok yakında açılıyor.');
}
