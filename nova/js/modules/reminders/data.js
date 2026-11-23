// Hatırlatıcılar — ayarlar, zaman dilimleri, "hedef tamamsa atla" kontrolleri ve zamanlayıcı.
// Depo: 'reminders.settings' (ayarlar), 'reminders.lastFired' ({ gün: { dilimAnahtarı: durum } }), 'reminders.log' (son gönderilenler).
import { load, save, update, dateKey, addDays, parseKey } from '../../core/store.js';
import { fmt } from '../../core/ui.js';
import { getProfile, waterTarget } from '../../core/profile.js';
import { getModule } from '../../core/router.js';

export const KS = 'reminders.settings';
export const KF = 'reminders.lastFired';
export const KL = 'reminders.log';
export const CATCHUP_MIN = 30;   // kaçırılan dilim en fazla bu kadar dakika sonra bir kez gösterilir
export const TICK_MS = 30000;    // uygulama açıkken kontrol sıklığı
const DAY_MS = 864e5;

export const TYPES = [
  { id: 'water', title: 'Su', icon: 'water', route: 'nutrition' },
  { id: 'workout', title: 'Antrenman', icon: 'dumbbell', route: 'workout' },
  { id: 'meals', title: 'Öğünler', icon: 'food', route: 'nutrition' },
  { id: 'steps', title: 'Adım hedefi', icon: 'steps', route: 'steps' },
  { id: 'weight', title: 'Tartılma', icon: 'scale', route: 'body' },
  { id: 'habits', title: 'Alışkanlık desteği', icon: 'heart', route: 'habits' },
];
export const typeById = id => TYPES.find(t => t.id === id);

export const MEAL_SLOTS = [
  { id: 'breakfast', l: 'Kahvaltı', s: 'Kahvaltı' },
  { id: 'lunch', l: 'Öğle yemeği', s: 'Öğle' },
  { id: 'dinner', l: 'Akşam yemeği', s: 'Akşam' },
];

// JS getDay(): 0 = Pazar. Gösterim sırası Pazartesi'den başlar.
export const WEEKDAYS = [
  { d: 1, s: 'Pzt', l: 'pazartesi' }, { d: 2, s: 'Sal', l: 'salı' }, { d: 3, s: 'Çar', l: 'çarşamba' },
  { d: 4, s: 'Per', l: 'perşembe' }, { d: 5, s: 'Cum', l: 'cuma' }, { d: 6, s: 'Cmt', l: 'cumartesi' }, { d: 0, s: 'Paz', l: 'pazar' },
];
export const dayName = d => WEEKDAYS.find(w => w.d === d)?.l || '';

export const DEFAULTS = {
  quiet: { on: true, start: '23:00', end: '08:00' },
  water: { on: false, start: '09:00', end: '22:00', every: 2 },
  workout: { on: false, days: [1, 3, 5], time: '18:00' },
  meals: { on: false, breakfast: { on: true, time: '08:30' }, lunch: { on: true, time: '12:30' }, dinner: { on: true, time: '19:30' } },
  steps: { on: false, time: '20:00' },
  weight: { on: false, day: 1, time: '08:30' },
  habits: { on: false, time: '21:00' },
};

// ---------------------------------------------------------------- Saat yardımcıları
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const validTime = t => typeof t === 'string' && TIME_RE.test(t);
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nowMinOf = d => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

export function inQuiet(min, q) {
  if (!q?.on) return false;
  const a = toMin(q.start), b = toMin(q.end);
  if (a === b) return false;
  return a < b ? (min >= a && min < b) : (min >= a || min < b);
}

// ---------------------------------------------------------------- Ayarlar
const fixTime = (v, def) => (validTime(v) ? v : def);

export function getSettings() {
  const raw = load(KS, {}) || {};
  const out = structuredClone(DEFAULTS);
  for (const k of Object.keys(DEFAULTS)) {
    const r = raw[k];
    if (!r || typeof r !== 'object') continue;
    Object.assign(out[k], r);
  }
  out.quiet.start = fixTime(out.quiet.start, DEFAULTS.quiet.start);
  out.quiet.end = fixTime(out.quiet.end, DEFAULTS.quiet.end);
  out.water.start = fixTime(out.water.start, DEFAULTS.water.start);
  out.water.end = fixTime(out.water.end, DEFAULTS.water.end);
  out.water.every = Math.min(6, Math.max(1, Math.round(+out.water.every || 2)));
  out.workout.days = Array.isArray(out.workout.days) ? out.workout.days.filter(d => d >= 0 && d <= 6) : [];
  for (const k of ['workout', 'steps', 'weight', 'habits']) out[k].time = fixTime(out[k].time, DEFAULTS[k].time);
  out.weight.day = Number.isInteger(+out.weight.day) && +out.weight.day >= 0 && +out.weight.day <= 6 ? +out.weight.day : 1;
  for (const m of MEAL_SLOTS) {
    out.meals[m.id] = { ...DEFAULTS.meals[m.id], ...(raw.meals?.[m.id] || {}) };
    out.meals[m.id].time = fixTime(out.meals[m.id].time, DEFAULTS.meals[m.id].time);
  }
  return out;
}

/** Bir türün ayarlarını değiştirir. Bugün zamanı geçmiş dilimler "geçti" sayılır: ayar değişince hemen bildirim patlamaz. */
export function setSettings(type, patch, now = new Date()) {
  const s = getSettings();
  s[type] = { ...s[type], ...patch };
  markPast(s, now);
  save(KS, s);
  return s;
}

function markPast(s, now) {
  const dk = dateKey(now), nm = nowMinOf(now);
  update(KF, all => {
    all = all && typeof all === 'object' ? all : {};
    const day = all[dk] || {};
    for (const x of slotsForDay(dk, s)) if (x.min <= nm && !day[x.key]) day[x.key] = 'past';
    all[dk] = day;
    return all;
  }, {});
}

export const enabledCount = (s = getSettings()) => TYPES.filter(t => s[t.id].on).length;

// ---------------------------------------------------------------- Zaman dilimleri
/** O gün için açık hatırlatıcıların dilimleri: [{ type, group, key, min, meal? }] (saate göre sıralı) */
export function slotsForDay(dk, s = getSettings()) {
  const wd = parseKey(dk).getDay();
  const out = [];
  const add = (type, time, extra = {}) => out.push({ type, group: extra.meal ? `meals.${extra.meal}` : type, key: `${extra.meal ? 'meals.' + extra.meal : type}@${time}`, min: toMin(time), ...extra });
  if (s.water.on) {
    const a = toMin(s.water.start), b = toMin(s.water.end), step = s.water.every * 60;
    if (a <= b) for (let m = a; m <= b; m += step) add('water', fromMin(m));
  }
  if (s.workout.on && s.workout.days.includes(wd)) add('workout', s.workout.time);
  if (s.meals.on) for (const m of MEAL_SLOTS) if (s.meals[m.id].on) add('meals', s.meals[m.id].time, { meal: m.id });
  if (s.steps.on) add('steps', s.steps.time);
  if (s.weight.on && s.weight.day === wd) add('weight', s.weight.time);
  if (s.habits.on) add('habits', s.habits.time);
  return out.sort((x, y) => x.min - y.min);
}

// ---------------------------------------------------------------- Bugünkü durum (diğer modüllerin verisi)
export function waterToday(dk) { return +(load('nutrition', {})?.[dk]?.waterMl) || 0; }
export function mealLogged(dk, meal) {
  const e = load('nutrition', {})?.[dk]?.entries;
  return Array.isArray(e) && e.some(x => x && x.meal === meal);
}
export function workoutLogged(dk) {
  const list = load('workouts', []);
  if (Array.isArray(list) && list.some(x => x && x.date === dk)) return true;
  const a = load('workout.active', null);
  return !!(a && a.startTs && dateKey(new Date(a.startTs)) === dk);
}
export function stepsToday(dk) {
  try { const m = getModule('steps'); if (typeof m?.stepsFor === 'function') return +m.stepsFor(dk) || 0; } catch { /* yoksay */ }
  return +(load('steps', {})?.[dk]?.total) || 0;
}
export const stepGoal = () => +getProfile().stepGoal || 10000;
export function activeHabits() {
  const d = load('habits', { list: [] });
  return (Array.isArray(d?.list) ? d.list : []).filter(x => x && !x.archived);
}
function weighedToday(dk) {
  // Vücut modülü böyle bir uç sunarsa kullanılır (opsiyonel)
  try { const m = getModule('body'); if (typeof m?.hasEntry === 'function') return !!m.hasEntry(dk); } catch { /* yoksay */ }
  return false;
}

/** Dilim için bildirim içeriği. null → gönderme (hedef tamam / kayıt var). */
export function buildMessage(slot, dk, now = new Date()) {
  const t = typeById(slot.type);
  const url = './#/' + t.route;
  const base = { type: slot.type, icon: t.icon, url, route: t.route, tag: 'nova-' + slot.group };
  switch (slot.type) {
    case 'water': {
      const ml = waterToday(dk), goal = waterTarget();
      if (ml >= goal) return null;
      return { ...base, title: 'Su içme zamanı',
        body: ml > 0 ? `Bugün ${fmt.n(ml)} ml içtin, hedefe ${fmt.n(goal - ml)} ml kaldı. Bir bardak su iç.` : `Bugün henüz su kaydetmedin. Hedefin ${fmt.n(goal)} ml, bir bardakla başla.` };
    }
    case 'workout':
      if (workoutLogged(dk)) return null;
      return { ...base, title: 'Antrenman zamanı', body: 'Bugün antrenman günün. Kısa bir antrenman bile fark yaratır.' };
    case 'meals': {
      if (mealLogged(dk, slot.meal)) return null;
      const m = MEAL_SLOTS.find(x => x.id === slot.meal);
      return { ...base, title: `${m.l} zamanı`, body: `${m.l} kaydını henüz eklemedin. Ne yediğini yazmayı unutma.` };
    }
    case 'steps': {
      const st = stepsToday(dk), goal = stepGoal();
      if (st >= goal) return null;
      return { ...base, title: 'Adım hedefin', body: `Bugün ${fmt.n(st)} adım attın, hedefe ${fmt.n(goal - st)} kaldı. Kısa bir yürüyüşe ne dersin?` };
    }
    case 'weight':
      if (weighedToday(dk)) return null;
      return { ...base, title: 'Tartılma günü', body: 'Haftalık tartılma zamanı. Mümkünse sabah, kahvaltıdan önce tartılıp kilonu kaydet.' };
    case 'habits': {
      const list = activeHabits();
      if (!list.length) return null;
      const parts = list.slice(0, 3).map(hb => `${hb.name || 'Alışkanlık'}: ${Math.max(0, Math.floor((now.getTime() - (+hb.quitAt || now.getTime())) / DAY_MS))} gün`);
      return { ...base, title: 'Bugün nasıl gidiyor?', body: `${parts.join(' · ')}. Bugün de başarabilirsin!` };
    }
  }
  return null;
}

// ---------------------------------------------------------------- Özet metinleri
export function daysLabel(days) {
  const set = new Set(days);
  if (!set.size) return 'Gün seçilmedi';
  if (set.size === 7) return 'Her gün';
  if (set.size === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Hafta içi';
  if (set.size === 2 && set.has(6) && set.has(0)) return 'Hafta sonu';
  return WEEKDAYS.filter(w => set.has(w.d)).map(w => w.s).join(', ');
}

export function summaryLine(type, s = getSettings()) {
  const c = s[type];
  switch (type) {
    case 'water': return `${c.every === 1 ? 'Her saat' : `Her ${c.every} saatte bir`} · ${c.start}–${c.end}`;
    case 'workout': return `${daysLabel(c.days)} · ${c.time}`;
    case 'meals': {
      const on = MEAL_SLOTS.filter(m => c[m.id].on);
      return on.length ? on.map(m => `${m.s} ${c[m.id].time}`).join(' · ') : 'Öğün seçilmedi';
    }
    case 'steps': return `Her akşam ${c.time} · hedef ${fmt.n(stepGoal())} adım`;
    case 'weight': return `Her ${dayName(c.day)} · ${c.time}`;
    case 'habits': {
      const n = activeHabits().length;
      return `Her gün ${c.time} · ${n ? `${n} aktif alışkanlık` : 'aktif alışkanlık yok'}`;
    }
  }
  return '';
}

export function slotTitle(slot) {
  if (slot.type === 'meals') return MEAL_SLOTS.find(m => m.id === slot.meal)?.l || 'Öğün';
  return typeById(slot.type).title;
}

/** Sıradaki hatırlatma (sessiz saatler ve bugün hedefi tamam olanlar atlanır). { slot, dk, when } | null */
export function nextUpcoming(now = new Date(), s = getSettings()) {
  const today = dateKey(now), nm = nowMinOf(now);
  const fired = load(KF, {})?.[today] || {};
  for (let i = 0; i < 8; i++) {
    const dk = addDays(today, i);
    for (const x of slotsForDay(dk, s)) {
      if (inQuiet(x.min, s.quiet)) continue;
      if (i === 0 && (x.min <= nm || fired[x.key] || !buildMessage(x, dk, now))) continue;
      const time = fromMin(x.min);
      const wn = dayName(parseKey(dk).getDay());
      const when = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : wn.charAt(0).toLocaleUpperCase('tr-TR') + wn.slice(1);
      return { slot: x, dk, time, when, title: slotTitle(x) };
    }
  }
  return null;
}

// ---------------------------------------------------------------- Bildirim gösterme
export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;
/** 'granted' | 'denied' | 'default' | 'unsupported' */
export const permissionState = () => (notifySupported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!notifySupported()) return 'unsupported';
  try {
    const r = Notification.requestPermission();
    return r && typeof r.then === 'function' ? await r : await new Promise(res => Notification.requestPermission(res));
  } catch { return Notification.permission; }
}

function swRegistration(ms = 1500) {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return Promise.resolve(null);
  return Promise.race([navigator.serviceWorker.ready.catch(() => null), new Promise(r => setTimeout(() => r(null), ms))]);
}

/** Sistem bildirimi. Başarılıysa true. Servis çalışanı varsa onun üzerinden (Android'de arka planda da görünür). */
export async function systemNotify(msg) {
  if (permissionState() !== 'granted') return false;
  const opts = { body: msg.body, tag: msg.tag || 'nova', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', lang: 'tr', data: { url: msg.url || './#/home' } };
  try {
    const reg = await swRegistration();
    if (reg?.showNotification) { await reg.showNotification(msg.title, opts); return true; }
  } catch { /* aşağıdaki yedeğe geç */ }
  try {
    const n = new Notification(msg.title, opts);
    n.onclick = () => { try { window.focus(); } catch { /* yoksay */ } location.hash = '#/' + (msg.route || 'home'); n.close(); };
    return true;
  } catch { return false; } // Android Chrome'da yapıcı desteklenmez
}

export const appInForeground = () => document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());

function pushLog(msg, how, now) {
  update(KL, list => [{ ts: now.getTime(), type: msg.type, title: msg.title, body: msg.body, how }, ...(Array.isArray(list) ? list : [])].slice(0, 20), []);
}

let bannerHandler = null;
/** Uygulama ön plandayken ekranda gösterilecek bildirim kartı (index.js ayarlar) */
export function onForeground(fn) { bannerHandler = fn; }

/** Ön plandaysa uygulama içi kart, değilse sistem bildirimi. */
export async function deliver(msg, now = new Date()) {
  if (appInForeground() && bannerHandler) {
    pushLog(msg, 'app', now);
    bannerHandler(msg);
    return 'app';
  }
  const ok = await systemNotify(msg);
  if (!ok && bannerHandler) bannerHandler(msg); // izin yoksa geri gelince görsün
  pushLog(msg, ok ? 'system' : 'app', now);
  return ok ? 'system' : 'app';
}

// ---------------------------------------------------------------- Zamanlayıcı
/** Vadesi gelen dilimleri işler. Her dilim günde en fazla bir kez ele alınır. İşlenenlerin listesini döner (test için). */
export function check(now = new Date()) {
  const s = getSettings();
  const dk = dateKey(now), nm = nowMinOf(now);
  const all = load(KF, {}) || {};
  const day = all[dk] || {};
  const due = slotsForDay(dk, s).filter(x => x.min <= nm && nm - x.min <= CATCHUP_MIN && !day[x.key]);
  if (!due.length) return [];
  // Aynı gruptan birden çok dilim birikmişse yalnız en yenisi gösterilir (ör. su)
  const latest = new Map();
  for (const x of due) latest.set(x.group, x);
  const out = [];
  for (const x of due) {
    if (latest.get(x.group) !== x) { day[x.key] = 'missed'; continue; }
    let status;
    if (inQuiet(nm, s.quiet)) status = 'quiet';
    else {
      const msg = buildMessage(x, dk, now);
      if (!msg) status = 'skip';
      else { status = 'sent'; out.push(msg); }
    }
    day[x.key] = status;
  }
  all[dk] = day;
  // 7 günden eski kayıtları temizle
  const cutoff = addDays(dk, -7);
  for (const k of Object.keys(all)) if (k < cutoff) delete all[k];
  save(KF, all);
  out.forEach(m => deliver(m, now));
  return out;
}

let timer = null;
export function startScheduler() {
  if (timer) return;
  const tick = () => { try { check(new Date()); } catch (e) { console.error('hatırlatıcı', e); } };
  timer = setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  window.addEventListener('focus', tick);
  setTimeout(tick, 1500); // açılışta: kaçırılan (son 30 dk) dilimi bir kez yakala
}

/** Test bildirimi */
export async function sendTest() {
  const msg = { type: 'test', icon: 'clock', title: 'NOVA Fit test bildirimi', body: 'Bildirimler çalışıyor. Hatırlatmaların böyle görünecek.', url: './#/reminders', route: 'reminders', tag: 'nova-test' };
  const ok = await systemNotify(msg);
  pushLog(msg, ok ? 'system' : 'app', new Date());
  if (!ok && bannerHandler) bannerHandler(msg);
  return ok;
}
