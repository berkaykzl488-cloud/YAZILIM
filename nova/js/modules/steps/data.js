// Adım verisi: store anahtarı 'steps'
// { 'YYYY-MM-DD': { sensor, manual, total, hourly:[24], activeMin, goal, edited, updatedAt } }
// total = max(0, sensor + manual). "manual" bir düzeltmedir: elle eklenen adımlar (+) ya da
// "günün toplamını gir" ile hesaplanan fark (total - sensor, negatif olabilir). Böylece toplam
// girildikten sonra sensörün saydığı yeni adımlar da üstüne eklenmeye devam eder.
import { load, update, subscribe, todayKey, dateKey, addDays, lastNDays, daysBetween } from '../../core/store.js';
import { getProfile, strideM, kcalFromSteps } from '../../core/profile.js';
import { awardXP } from '../../core/xp.js';
import { fmt } from '../../core/ui.js';

export const KEY = 'steps';
const SETTINGS_KEY = 'steps.settings';
const FLUSH_MS = 4000;
const ACTIVE_MIN_STEPS = 50; // bir dakikada en az bu kadar adım → aktif dakika

let cache = null;
subscribe(KEY, () => { cache = null; });

const pending = new Map();      // date -> { n, hourly[24], active }
const minuteBuckets = new Map(); // 'date|dakika' -> adım
const liveSubs = new Set();
let flushTimer = null;

const blankHours = () => Array(24).fill(0);

function norm(e) {
  const out = { sensor: 0, manual: 0, hourly: blankHours(), activeMin: 0, goal: null, edited: false, updatedAt: 0 };
  if (!e || typeof e !== 'object') return out;
  out.sensor = Math.max(0, Math.round(+e.sensor || 0));
  out.manual = Math.round(+e.manual || 0);
  if (Array.isArray(e.hourly)) for (let i = 0; i < 24; i++) out.hourly[i] = Math.max(0, Math.round(+e.hourly[i] || 0));
  out.activeMin = Math.max(0, Math.round(+e.activeMin || 0));
  out.goal = e.goal || null;
  out.edited = !!e.edited;
  out.updatedAt = e.updatedAt || 0;
  // Eski/elle girilmiş biçim: yalnız total varsa manuel say
  if (!e.sensor && !e.manual && +e.total > 0) out.manual = Math.round(+e.total);
  return out;
}

export function rawAll() {
  if (!cache) cache = load(KEY, {}) || {};
  return cache;
}

/** Bekleyen (henüz kaydedilmemiş) sensör adımları dahil, normalize edilmiş gün kaydı */
export function getEntry(date, all = rawAll()) {
  const e = norm(all[date]);
  const p = pending.get(date);
  if (p) {
    e.sensor += p.n;
    e.activeMin += p.active;
    for (let i = 0; i < 24; i++) e.hourly[i] += p.hourly[i];
  }
  e.total = Math.max(0, e.sensor + e.manual);
  return e;
}

export const stepsFor = date => getEntry(date).total;

export function goalFor(date, all = rawAll()) {
  const g = getProfile().stepGoal || 10000;
  if (date === todayKey()) return g;
  return all[date]?.goal || g;
}

// ---------- Türetilmiş ölçüler ----------
export const distanceM = steps => steps * strideM(getProfile());
export const kcalOf = steps => kcalFromSteps(steps);
export function activeMinutes(e) {
  // Sensörün ölçtüğü aktif dakikalar + elle eklenen adımlar için ~100 adım/dk tahmini
  return Math.round(e.activeMin + Math.max(0, e.total - e.sensor) / 100);
}

/** Veri olan tüm günler (bugün dahil), yeniden eskiye */
export function allDays(all = rawAll()) {
  const keys = new Set([...Object.keys(all), ...pending.keys()]);
  return [...keys].filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k) && getEntry(k, all).total > 0).sort().reverse();
}

export function history(n, all = rawAll()) {
  return lastNDays(n).map(date => ({ date, steps: getEntry(date, all).total }));
}

export function stats(all = rawAll()) {
  const today = todayKey();
  const days = allDays(all);
  const hit = d => { const e = getEntry(d, all); return e.total > 0 && e.total >= goalFor(d, all); };
  // Güncel seri: bugün henüz tamamlanmadıysa dünden geriye say (seri bozulmuş sayılmaz)
  let cur = 0, d = hit(today) ? today : addDays(today, -1);
  while (hit(d)) { cur++; d = addDays(d, -1); }
  // En iyi seri
  let best = 0, run = 0, prev = null;
  for (const k of [...days].reverse()) {
    if (!hit(k)) { run = 0; prev = k; continue; }
    run = prev && daysBetween(prev, k) === 1 && hit(prev) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  let record = null, lifetime = 0, hits = 0;
  for (const k of days) {
    const t = getEntry(k, all).total;
    lifetime += t;
    if (hit(k)) hits++;
    if (!record || t > record.steps) record = { date: k, steps: t };
  }
  return { current: cur, best: Math.max(best, cur), record, lifetime, hits, dayCount: days.length };
}

// ---------- Canlı sensör adımları ----------
/** wallTimes: her adımın Date.now() zamanı */
export function addSensorSteps(wallTimes) {
  const touched = new Set();
  for (const t of wallTimes) {
    const dt = new Date(t), d = dateKey(dt);
    let p = pending.get(d);
    if (!p) { p = { n: 0, hourly: blankHours(), active: 0 }; pending.set(d, p); }
    p.n++;
    p.hourly[dt.getHours()]++;
    const mk = d + '|' + (dt.getHours() * 60 + dt.getMinutes());
    const c = (minuteBuckets.get(mk) || 0) + 1;
    minuteBuckets.set(mk, c);
    if (c === ACTIVE_MIN_STEPS) p.active++;
    touched.add(d);
  }
  if (minuteBuckets.size > 400) { // eski dakikaları at
    const keys = [...minuteBuckets.keys()];
    keys.slice(0, keys.length - 200).forEach(k => minuteBuckets.delete(k));
  }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  liveSubs.forEach(cb => { try { cb([...touched]); } catch (e) { console.error(e); } });
}

/** Bekleyen adımlar bellekte değiştiğinde (kayıttan önce) çağrılır */
export function onLive(cb) { liveSubs.add(cb); return () => liveSubs.delete(cb); }

export function flush() {
  clearTimeout(flushTimer); flushTimer = null;
  if (!pending.size) return;
  const snap = new Map(pending);
  pending.clear();
  const today = todayKey(), goal = getProfile().stepGoal;
  update(KEY, all => {
    all = all && typeof all === 'object' ? all : {};
    for (const [d, p] of snap) {
      const e = norm(all[d]);
      e.sensor += p.n;
      e.activeMin += p.active;
      for (let i = 0; i < 24; i++) e.hourly[i] += p.hourly[i];
      all[d] = finalize(e, d === today ? goal : e.goal || goal);
    }
    return all;
  }, {});
  snap.forEach((_, d) => checkAwards(d));
}

function finalize(e, goal) {
  return { ...e, goal, total: Math.max(0, e.sensor + e.manual), updatedAt: Date.now() };
}

function writeDay(date, fn) {
  flush();
  const goal = goalFor(date);
  update(KEY, all => {
    all = all && typeof all === 'object' ? all : {};
    const e = norm(all[date]);
    fn(e);
    e.edited = true;
    all[date] = finalize(e, goal);
    return all;
  }, {});
  checkAwards(date);
}

/** Güne adım ekle (n > 0). Bugünse şu anki saate işlenir. */
export function addManual(date, n) {
  n = Math.round(n);
  if (!n) return;
  writeDay(date, e => {
    e.manual += n;
    if (date === todayKey() && n > 0) e.hourly[new Date().getHours()] += n;
  });
}

/** Günün toplamını belirle (ör. Samsung Health / Google Fit'teki sayı) */
export function setTotal(date, total) {
  total = Math.max(0, Math.round(total));
  writeDay(date, e => { e.manual = total - e.sensor; });
}

export function clearDay(date) {
  flush();
  update(KEY, all => { const o = { ...(all || {}) }; delete o[date]; return o; }, {});
}

// ---------- XP ----------
const MILESTONES = [
  { at: 5000, xp: 10, key: '5k' },
  { at: 15000, xp: 25, key: '15k' },
  { at: 20000, xp: 40, key: '20k' },
];
const awarded = new Set();
function award(amount, reason, once) {
  if (awarded.has(once)) return;
  awarded.add(once);
  awardXP(amount, reason, { once });
}
export function checkAwards(date) {
  const ago = daysBetween(date, todayKey());
  if (ago < 0 || ago > 7) return;
  const total = stepsFor(date), goal = goalFor(date);
  if (total >= goal) award(50, 'Adım hedefi', 'steps-goal-' + date);
  for (const m of MILESTONES) if (total >= m.at) award(m.xp, `${fmt.n(m.at)} adım`, `steps-${m.key}-${date}`);
}

// ---------- Ayarlar ----------
export function getSettings() { return { enabled: false, wakeLock: false, ...load(SETTINGS_KEY, {}) }; }
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  update(SETTINGS_KEY, () => s, {});
  return s;
}

// ---------- Yaşam döngüsü: hiçbir sayım kaybolmasın ----------
let installed = false;
export function installLifecycle() {
  if (installed) return;
  installed = true;
  const f = () => { try { flush(); } catch (e) { console.error(e); } };
  window.addEventListener('pagehide', f);
  window.addEventListener('beforeunload', f);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') f(); });
}
