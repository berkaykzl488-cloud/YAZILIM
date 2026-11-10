function load(){try{const s=localStorage.getItem(KEY); if(s){const o=JSON.parse(s); if(o&&o.v===3) return o;}}catch(e){} return seed();}
function save(){ if(window.__noSave) return; try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){} if(!BKNOW&&S&&S.set&&+S.set.autoBk===-1&&typeof bkPut==='function'){ clearTimeout(BKT); BKT=setTimeout(()=>{ bkPut('Anlık').catch(()=>{}); },8000); }}
let S;
const ui = {tab:'ozet', atab:'panel', f:{}, ls:false, slide:0, popupDone:false, adType:'slider', tk:null, q:'', rot:0, spinning:false, preset:null};
try{ ui.popupDone = sessionStorage.getItem(KEY+'_pop')==='1'; }catch(e){}

