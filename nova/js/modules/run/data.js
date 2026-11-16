// Koşu modülü — aktivite türleri, ayarlar, kayıt deposu, istatistik/rekor hesapları, GPX.
import { load, save, dateKey, addDays, parseKey } from '../../core/store.js';
import { fmt } from '../../core/ui.js';
import { cumDist, movingTimes, bestEffort } from './geo.js';

// maxSpeed: m/sn üstü sıçrama sayılır; autoPause: bu hızın altı "duruyor" kabul edilir.
export const TYPES = {
  run: { id: 'run', label: 'Koşu', icon: 'run', maxSpeed: 10.5, autoPause: 0.9, speedMode: false, xpPerKm: 15, gpx: 'running',
    efforts: [[1000, '1 km'], [5000, '5 km'], [10000, '10 km'], [21097, 'Yarı maraton']] },
  walk: { id: 'walk', label: 'Yürüyüş', icon: 'steps', maxSpeed: 7, autoPause: 0.45, speedMode: false, xpPerKm: 8, gpx: 'walking',
    efforts: [[1000, '1 km'], [5000, '5 km'], [10000, '10 km']] },
  bike: { id: 'bike', label: 'Bisiklet', icon: 'bike', maxSpeed: 25, autoPause: 1.6, speedMode: true, xpPerKm: 4, gpx: 'cycling',
    efforts: [[5000, '5 km'], [10000, '10 km'], [20000, '20 km'], [40000, '40 km']] },
  hike: { id: 'hike', label: 'Doğa yürüyüşü', icon: 'hike', maxSpeed: 7, autoPause: 0.35, speedMode: false, xpPerKm: 10, gpx: 'hiking',
    efforts: [[1000, '1 km'], [5000, '5 km'], [10000, '10 km']] },
};
export const TYPE_LIST = Object.values(TYPES);
export const typeOf = id => TYPES[id] || TYPES.run;

// Compendium of Physical Activities'e dayalı hız (km/sa) -> MET tabloları
const MET_TABLE = {
  walk: [[0, 2.0], [3.2, 2.8], [4.0, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0], [8.0, 8.3]],
  run: [[0, 2.0], [4.8, 3.5], [6.4, 6.0], [8.0, 8.3], [9.7, 9.8], [10.8, 10.5], [11.3, 11.0], [12.1, 11.8], [12.9, 12.3],
    [13.8, 12.8], [14.5, 14.5], [16.1, 16.0], [17.7, 19.0], [19.3, 19.8], [20.9, 23.0]],
  bike: [[0, 2.5], [10, 3.5], [16, 5.8], [19, 6.8], [22, 8.0], [25, 10.0], [30, 12.0], [35, 15.8]],
};
function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}
/** Hız (m/sn) ve türe göre MET */
export function metFor(type, mps) {
  const k = Math.max(0, mps) * 3.6;
  if (type === 'bike') return interp(MET_TABLE.bike, k);
  if (type === 'walk') return interp(MET_TABLE.walk, k);
  if (type === 'hike') return Math.max(5.3, interp(MET_TABLE.walk, k) + 1.8);
  return interp(MET_TABLE.run, k);
}

// ---------- Ayarlar ----------
const DEF_SETTINGS = { type: 'run', voice: true, vibrate: true, autoPause: false, targetPace: null, weeklyGoalKm: 20, mapMode: 'stats' };
export const getSettings = () => ({ ...DEF_SETTINGS, ...(load('run.settings', {}) || {}) });
export const setSettings = patch => save('run.settings', { ...getSettings(), ...patch });

// ---------- Kayıtlar ----------
export function getRuns() {
  const list = load('runs', []);
  return (Array.isArray(list) ? list : []).filter(r => r && r.id && Number.isFinite(r.startTs)).sort((a, b) => b.startTs - a.startTs);
}
export const getRun = id => getRuns().find(r => r.id === id) || null;

/** Kaydı ekler/günceller. localStorage gerçekten yazıldı mı doğrular (çekirdek kota hatasını sessizce yutuyor). */
export function putRun(run) {
  const list = load('runs', []) || [];
  const i = list.findIndex(r => r.id === run.id);
  if (i >= 0) list[i] = run; else list.push(run);
  save('runs', list);
  return verifyPersist('runs', list);
}
export function deleteRun(id) {
  save('runs', (load('runs', []) || []).filter(r => r.id !== id));
}
function verifyPersist(key, value) {
  try { return localStorage.getItem('nova:' + key)?.length === JSON.stringify(value).length; } catch { return false; }
}

export const runDay = r => dateKey(new Date(r.startTs));
export const runsOn = (key, runs = getRuns()) => runs.filter(r => runDay(r) === key);

/** Pazartesi başlangıçlı hafta anahtarı */
export function weekStart(key) {
  const d = parseKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}

export function totals(runs) {
  return runs.reduce((a, r) => ({
    distM: a.distM + (r.distM || 0), sec: a.sec + (r.movingSec || 0), kcal: a.kcal + (r.kcal || 0),
    count: a.count + 1, elev: a.elev + (r.elevGainM || 0),
  }), { distM: 0, sec: 0, kcal: 0, count: 0, elev: 0 });
}

export function weekTotals(key, runs = getRuns()) {
  const ws = weekStart(key), we = addDays(ws, 6);
  return totals(runs.filter(r => { const k = runDay(r); return k >= ws && k <= we; }));
}

/** Son n hafta: [{ key, label, distM }] (eskiden yeniye) */
export function weeklySeries(n, runs = getRuns(), endKey = dateKey()) {
  const cur = weekStart(endKey), out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ws = addDays(cur, -7 * i), we = addDays(ws, 6);
    const distM = runs.reduce((s, r) => { const k = runDay(r); return k >= ws && k <= we ? s + r.distM : s; }, 0);
    out.push({ key: ws, label: fmt.date(ws, 'short').replace(/\s.*/, ''), distM });
  }
  return out;
}
/** Son n ay: [{ key:'YYYY-MM', label, distM }] */
export function monthlySeries(n, runs = getRuns(), end = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const distM = runs.reduce((s, r) => (runDay(r).startsWith(key) ? s + r.distM : s), 0);
    out.push({ key, label: d.toLocaleDateString('tr-TR', { month: 'short' }), distM });
  }
  return out;
}

/** Rekorlar (tür bazında) */
export function records(type, runs = getRuns()) {
  const list = runs.filter(r => r.type === type);
  const T = typeOf(type);
  const efforts = T.efforts.map(([D, label]) => ({ D, label, best: null }));
  let longest = null, longestTime = null, mostElev = null;
  const weeks = new Map();
  for (const r of list) {
    if (!longest || r.distM > longest.distM) longest = r;
    if (!longestTime || r.movingSec > longestTime.movingSec) longestTime = r;
    if ((r.elevGainM || 0) > 0 && (!mostElev || r.elevGainM > mostElev.elevGainM)) mostElev = r;
    const wk = weekStart(runDay(r));
    weeks.set(wk, (weeks.get(wk) || 0) + r.distM);
    if (r.points?.length > 1) {
      const cum = cumDist(r.points, r.breaks || []);
      // Saklanan noktalar sadeleştirildiği için mesafeyi kaydın asıl mesafesine ölçekle
      const k = r.distM > 0 && cum[cum.length - 1] > 0 ? r.distM / cum[cum.length - 1] : 1;
      if (k !== 1) for (let i = 0; i < cum.length; i++) cum[i] *= k;
      const mt = movingTimes(r.points);
      for (const e of efforts) {
        const b = bestEffort(r.points, cum, mt, e.D);
        if (b && (!e.best || b.sec < e.best.sec)) e.best = { sec: b.sec, run: r };
      }
    }
  }
  let bigWeek = null;
  for (const [key, distM] of weeks) if (!bigWeek || distM > bigWeek.distM) bigWeek = { key, distM };
  return { efforts, longest, longestTime, mostElev, bigWeek, count: list.length };
}

// ---------- Biçimlendirme ----------
export const km = m => fmt.n((m || 0) / 1000, 2);
export const paceOf = (distM, sec) => (distM > 0 ? sec / (distM / 1000) : NaN);
export const kmh = mps => fmt.n((mps || 0) * 3.6, 1);
/** Türe göre tempo ya da hız metni */
export function paceText(type, distM, sec) {
  if (typeOf(type).speedMode) return sec > 0 ? fmt.n(distM / sec * 3.6, 1) : '0,0';
  return fmt.pace(paceOf(distM, sec));
}
export const paceUnit = type => (typeOf(type).speedMode ? 'km/sa' : '/km');

export function defaultTitle(type, ts) {
  const hr = new Date(ts).getHours();
  const part = hr < 5 ? 'Gece' : hr < 11 ? 'Sabah' : hr < 14 ? 'Öğle' : hr < 18 ? 'Öğleden sonra' : hr < 22 ? 'Akşam' : 'Gece';
  const noun = { run: 'koşusu', walk: 'yürüyüşü', bike: 'bisiklet turu', hike: 'doğa yürüyüşü' }[type] || 'koşusu';
  return `${part} ${noun}`;
}

/** Sesli anlatım için süre: "5 dakika 32 saniye" */
export function durWords(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const out = [];
  if (h) out.push(`${h} saat`);
  if (m) out.push(`${m} dakika`);
  if (s || !out.length) out.push(`${s} saniye`);
  return out.join(' ');
}

// ---------- GPX ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function toGPX(run) {
  const br = new Set(run.breaks || []);
  const pts = run.points || [];
  let seg = '';
  pts.forEach((p, i) => {
    if (i > 0 && br.has(i)) seg += '    </trkseg>\n    <trkseg>\n';
    seg += `      <trkpt lat="${p[0].toFixed(7)}" lon="${p[1].toFixed(7)}">${p[3] != null ? `<ele>${(+p[3]).toFixed(1)}</ele>` : ''}<time>${new Date(p[2]).toISOString()}</time></trkpt>\n`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NOVA 2300" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(run.title)}</name><time>${new Date(run.startTs).toISOString()}</time></metadata>
  <trk>
    <name>${esc(run.title)}</name>
    ${run.note ? `<desc>${esc(run.note)}</desc>` : ''}
    <type>${typeOf(run.type).gpx}</type>
    <trkseg>
${seg}    </trkseg>
  </trk>
</gpx>
`;
}
export function downloadGPX(run) {
  const blob = new Blob([toGPX(run)], { type: 'application/gpx+xml' });
  const slug = (run.title || 'aktivite').toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'aktivite';
  const name = `nova-${runDay(run)}-${slug}.gpx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
