document.documentElement.lang='tr';
/* ================== yardımcılar ================== */
const H = 3600e3, D = 24 * H, now = () => Date.now();
const TLf = new Intl.NumberFormat('tr-TR', {style:'currency', currency:'TRY', minimumFractionDigits:2});
const TL = n => TLf.format(+n || 0);
const NUM = n => new Intl.NumberFormat('tr-TR').format(Math.round(+n||0));
const r2 = n => Math.round(n * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const $ = s => document.querySelector(s);
const today = () => new Date().toDateString();
function ago(t){const d=(now()-t)/1000; if(d<0) return 'şimdi'; if(d<60)return 'az önce'; if(d<3600)return Math.floor(d/60)+' dk önce'; if(d<86400)return Math.floor(d/3600)+' sa önce'; return Math.floor(d/86400)+' gün önce';}
function left(t){const d=t-now(); if(d<=0) return 'süresi doldu'; const g=Math.floor(d/D), h=Math.floor(d%D/H), m=Math.floor(d%H/60000); return g? g+' gün '+h+' sa' : (h? h+' sa '+m+' dk' : m+' dk');}
function dstr(t){return new Date(t).toLocaleDateString('tr-TR',{day:'2-digit',month:'short',year:'numeric'})}
function dtstr(t){return new Date(t).toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
function delMin(s){ if(!s||/anında/i.test(s)) return 10; const n=parseInt(s)||15; return /saat/.test(s)? n*60 : n; }

const CAT = {yang:'Yang', ep:'EP', item:'Item', karakter:'Karakter', skin:'CS2 Skin', hesap:'Hesap', epin:'E-pin'};
const M2CAT = ['yang','ep','item','karakter'];
const WEAR = {FN:'Fabrikadan Yeni Çıkmış', MW:'Az Aşınmış', FT:'Görevde Kullanılmış', WW:'Eskimiş', BS:'Savaş Görmüş'};
const RAR = {'Tüketici':'#b0c3d9','Endüstriyel':'#5e98d9','Askeri':'#4b69ff','Kısıtlı':'#8847ff','Gizli':'#d32ce6','Örtülü':'#eb4b4b','Nadir Özel':'#e4ae39'};
const WT = {rifle:'Tüfek', sniper:'Keskin Nişancı', pistol:'Tabanca', knife:'Bıçak', smg:'Hafif Makineli', heavy:'Ağır Silah', gloves:'Eldiven'};
const ST = {odendi:'Teslimat bekleniyor', teslim:'Alıcı onayı bekleniyor', tamam:'Tamamlandı', itiraz:'İtiraz incelemede', iade:'İade edildi'};
const VIP0 = [{id:'bronz',n:'Bronz',min:0,disc:0,cb:.5,c:'#9a5f36'},{id:'gumus',n:'Gümüş',min:2500,disc:.5,cb:1,c:'#7d8796'},{id:'altin',n:'Altın',min:10000,disc:1,cb:1.5,c:'#b8890f'},{id:'elmas',n:'Elmas',min:50000,disc:2,cb:2,c:'#1f8fb3'}];
let VIP = VIP0;
const WHEEL = [{l:'1 TL',k:'bal',v:1,w:30,c:'#c2410c'},{l:'50 Puan',k:'pt',v:50,w:22,c:'#1d4f91'},{l:'2 TL',k:'bal',v:2,w:18,c:'#b8890f'},{l:'+1 Bilet',k:'tk',v:1,w:14,c:'#6d28a8'},{l:'5 TL',k:'bal',v:5,w:8,c:'#0f7a5a'},{l:'200 Puan',k:'pt',v:200,w:5,c:'#be185d'},{l:'10 TL',k:'bal',v:10,w:2.5,c:'#0e7490'},{l:'50 TL',k:'bal',v:50,w:.5,c:'#111827'}];
const WSVG = {
  rifle:'<path d="M2 17h58l5-5h22l3 5h22v6H94l-7 4H76l-5 11H59l3-11H33l-7 9H13l5-9H2z"/>',
  sniper:'<path d="M2 18h70l4-4h20l2 4h20v5H98l-6 4h-9l-4 10H67l3-10H36l-8 9H16l5-9H2z"/><rect x="44" y="8" width="32" height="6" rx="3"/>',
  pistol:'<path d="M18 9h80v11H66l-5 4v15H44l5-15H38l-5 5H22l-4-5z"/>',
  knife:'<path d="M4 23C28 21 58 9 98 7l18 4-62 15H38l-7 8H16l5-8z"/>'
};
const ICO = {
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  gift:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8S10 3 7.5 4 8 8 12 8zm0 0s2-5 4.5-4S16 8 12 8z"/></svg>',
  wheel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3 12h7M14 12h7M5.6 5.6l5 5M13.4 13.4l5 5M18.4 5.6l-5 5M10.6 13.4l-5 5"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  han:'<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 2L29 8.5v9c0 7.2-5.4 11.4-13 13.5C8.4 28.9 3 24.7 3 17.5v-9L16 2zm-5.2 8.2l5.2 6.8 5.2-6.8h-3.1L16 13.4l-2.1-3.2h-3.1zm3.7 6.5V24h3v-7.3h-3z"/><circle cx="16" cy="7" r="1.4" fill="#d3a95a"/></svg>'
};
const wsvg = t => `<svg viewBox="0 0 120 40" aria-hidden="true" fill="currentColor">${WSVG[t]||WSVG.rifle}</svg>`;

/* ================== veri ================== */
const KEY = 'yangpazar_v4';
