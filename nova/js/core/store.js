// Yerel kalıcı depo (localStorage) + abonelik sistemi + tarih yardımcıları.
// Tüm veriler "nova:<anahtar>" altında JSON olarak tutulur.

const PREFIX = 'nova:';
const subs = new Map();
const memory = new Map(); // localStorage erişilemezse yedek

function rawGet(key) {
  try { return localStorage.getItem(PREFIX + key); } catch { return memory.get(key) ?? null; }
}
function rawSet(key, str) {
  try { localStorage.setItem(PREFIX + key, str); } catch { memory.set(key, str); }
}

export function load(key, fallback = null) {
  const raw = rawGet(key);
  if (raw == null) return typeof fallback === 'function' ? fallback() : structuredClone(fallback);
  try { return JSON.parse(raw); } catch { return typeof fallback === 'function' ? fallback() : structuredClone(fallback); }
}

export function save(key, value) {
  rawSet(key, JSON.stringify(value));
  emit(key, value);
  return value;
}

/** update('runs', list => [...list, run], []) */
export function update(key, fn, fallback = null) {
  const next = fn(load(key, fallback));
  return save(key, next);
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { memory.delete(key); }
  emit(key, null);
}

/** Anahtar değiştiğinde çağrılır. '*' tüm değişiklikleri dinler. Abonelikten çıkma fonksiyonu döner. */
export function subscribe(key, cb) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(cb);
  return () => subs.get(key)?.delete(cb);
}

export function emit(key, value) {
  subs.get(key)?.forEach(cb => { try { cb(value, key); } catch (e) { console.error(e); } });
  subs.get('*')?.forEach(cb => { try { cb(value, key); } catch (e) { console.error(e); } });
}

// Başka sekmede yapılan değişiklikleri yay
window.addEventListener('storage', e => {
  if (e.key && e.key.startsWith(PREFIX)) {
    const k = e.key.slice(PREFIX.length);
    emit(k, load(k));
  }
});

// ---------- Tarih ----------
const pad = n => String(n).padStart(2, '0');

/** Yerel saate göre 'YYYY-MM-DD' */
export function dateKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}
export const todayKey = () => dateKey(new Date());
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
/** Bugün dahil son n gün, eskiden yeniye */
export function lastNDays(n, endKey = todayKey()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}
export function daysBetween(aKey, bKey) {
  return Math.round((parseKey(bKey) - parseKey(aKey)) / 86400000);
}

// ---------- Yedekleme ----------
export function exportAll() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIX)) data[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
  } catch { memory.forEach((v, k) => { data[k] = JSON.parse(v); }); }
  return { app: 'NOVA-2300', version: 1, exportedAt: new Date().toISOString(), data };
}
export function importAll(obj) {
  if (!obj || obj.app !== 'NOVA-2300' || typeof obj.data !== 'object') throw new Error('Geçersiz yedek dosyası');
  Object.entries(obj.data).forEach(([k, v]) => save(k, v));
}
export function clearAll() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch { memory.clear(); }
  emit('*', null);
}
