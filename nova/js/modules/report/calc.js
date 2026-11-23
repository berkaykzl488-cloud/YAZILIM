// Haftalık rapor hesapları. Diğer modüllerin depolarını yalnız OKUR (asla yazmaz).
import { load, todayKey, dateKey, addDays, parseKey } from '../../core/store.js';
import { getModule } from '../../core/router.js';
import { getProfile, calorieTarget, macroTargets, waterTarget } from '../../core/profile.js';
import { getXP } from '../../core/xp.js';
import { durationMin, sessionTotals } from '../workout/data.js';
import { EX, GROUPS } from '../workout/exercises.js';

const DAY = 864e5;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pazartesi başlangıçlı haftanın ilk günü */
export function weekStartOf(key = todayKey()) {
  const d = parseKey(key);
  return addDays(key, -((d.getDay() + 6) % 7));
}
export const isWeekKey = k => typeof k === 'string' && KEY_RE.test(k) && !Number.isNaN(parseKey(k).getTime());
export const weekDays = ws => Array.from({ length: 7 }, (_, i) => addDays(ws, i));

const sum = (arr, f = x => x) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
const safe = (fn, fb) => { try { const v = fn(); return v ?? fb; } catch (e) { console.warn('rapor', e); return fb; } };

// ---------------------------------------------------------------- Bölümler
function stepsPart(days, today) {
  const mod = getModule('steps');
  const raw = load('steps', {}) || {};
  const def = getProfile().stepGoal || 10000;
  const perDay = days.map(date => {
    const future = date > today;
    const steps = future ? 0 : Math.round(safe(() => mod?.stepsFor ? mod.stepsFor(date) : (+raw[date]?.total || 0), 0));
    const goal = date === today ? def : (raw[date]?.goal || def);
    return { date, steps, goal, hit: !future && steps > 0 && steps >= goal, future };
  });
  const past = perDay.filter(d => !d.future);
  const total = sum(past, d => d.steps);
  const best = past.reduce((b, d) => (d.steps > (b?.steps || 0) ? d : b), null);
  return { perDay, total, avg: past.length ? total / past.length : 0, best, hits: past.filter(d => d.hit).length, goal: def, dataDays: past.filter(d => d.steps > 0).length };
}

function runPart(ws, we) {
  const list = (load('runs', []) || []).filter(r => r && Number.isFinite(r.startTs))
    .filter(r => { const k = dateKey(new Date(r.startTs)); return k >= ws && k <= we; });
  const distM = sum(list, r => r.distM), sec = sum(list, r => r.movingSec);
  // Tempo: bisiklet hariç (hız moduna geçen tür) ayaklı aktivitelerden
  const foot = list.filter(r => r.type !== 'bike');
  const fd = sum(foot, r => r.distM), fs = sum(foot, r => r.movingSec);
  const longest = list.reduce((b, r) => ((r.distM || 0) > (b?.distM || 0) ? r : b), null);
  return {
    count: list.length, distM, sec, pace: fd > 50 ? fs / (fd / 1000) : NaN,
    longest: longest ? { distM: longest.distM || 0, date: dateKey(new Date(longest.startTs)), title: longest.title || 'Aktivite', sec: longest.movingSec || 0 } : null,
    onlyRuns: list.length > 0 && list.every(r => (r.type || 'run') === 'run'),
    days: new Set(list.map(r => dateKey(new Date(r.startTs)))),
  };
}

function workoutPart(ws, we) {
  const list = (load('workouts', []) || []).filter(s => s && s.date >= ws && s.date <= we);
  let mins = 0, volume = 0, sets = 0;
  const groups = {};
  for (const s of list) {
    mins += Math.min(240, safe(() => durationMin(s), 0));
    const tot = safe(() => sessionTotals(s), { volume: 0, sets: 0 });
    volume += Number.isFinite(+s.volumeKg) ? +s.volumeKg : tot.volume;
    for (const x of s.exercises || []) {
      const n = (x.sets || []).filter(st => st.done !== false).length;
      sets += n;
      const g = EX[x.exId]?.group;
      if (g) groups[g] = (groups[g] || 0) + n;
    }
  }
  const top = Object.entries(groups).sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, label: GROUPS.find(g => g.id === id)?.label || id, sets: n }));
  return { count: list.length, mins, volume: Math.round(volume), sets, groups: top, days: new Set(list.map(s => s.date)) };
}

function foodPart(days, today) {
  const mod = getModule('nutrition');
  const all = load('nutrition', {}) || {};
  const target = calorieTarget(), macros = macroTargets(), wTarget = waterTarget();
  const perDay = days.filter(d => d <= today).map(date => {
    const t = safe(() => mod?.intake ? mod.intake(date) : null, null) || (() => {
      const e = all[date]?.entries || [];
      return { kcal: sum(e, x => x.kcal), protein: sum(e, x => x.p), carbs: sum(e, x => x.c), fat: sum(e, x => x.f), waterMl: +all[date]?.waterMl || 0 };
    })();
    const kcal = Math.round(+t.kcal || 0);
    return { date, kcal, protein: +t.protein || 0, carbs: +t.carbs || 0, fat: +t.fat || 0, waterMl: +t.waterMl || 0,
      inTarget: kcal > 0 && Math.abs(kcal - target) <= target * 0.1 };
  });
  const logged = perDay.filter(d => d.kcal > 0);
  const water = perDay.filter(d => d.waterMl > 0);
  const avg = f => (logged.length ? sum(logged, f) / logged.length : 0);
  return {
    target, macros, waterTarget: wTarget, perDay,
    logged: logged.length, avgKcal: avg(d => d.kcal), avgP: avg(d => d.protein), avgC: avg(d => d.carbs), avgF: avg(d => d.fat),
    inTarget: perDay.filter(d => d.inTarget).length,
    avgWater: water.length ? sum(water, d => d.waterMl) / water.length : 0,
    waterDays: water.length, waterHits: perDay.filter(d => d.waterMl >= wTarget).length,
  };
}

function weightPart(ws, we) {
  const list = (load('weight', []) || []).filter(w => w && KEY_RE.test(w.date) && +w.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  const inWeek = list.filter(w => w.date >= ws && w.date <= we);
  if (!inWeek.length) return null;
  // Haftaya girerkenki kilo: son 14 gün içindeki önceki tartı, yoksa haftanın ilk tartısı
  const before = [...list].reverse().find(w => w.date < ws && w.date >= addDays(ws, -14));
  const startEntry = before || inWeek[0];
  const endEntry = inWeek[inWeek.length - 1];
  const series = before ? [before, ...inWeek] : inWeek;
  return { start: +startEntry.kg, end: +endEntry.kg, startDate: startEntry.date, endDate: endEntry.date,
    change: series.length > 1 ? +endEntry.kg - +startEntry.kg : 0, values: series.map(w => +w.kg), count: inWeek.length };
}

function habitsPart(days, today, ws, we) {
  const data = load('habits', { list: [] }) || {};
  const list = (Array.isArray(data.list) ? data.list : []).filter(hb => hb && !hb.archived);
  const now = Date.now();
  const t0 = parseKey(ws).getTime(), t1 = Math.min(parseKey(addDays(we, 1)).getTime(), now);
  const out = list.map(hb => {
    const relapses = Array.isArray(hb.relapses) ? hb.relapses : [];
    const start = Math.min(...[hb.firstQuitAt, hb.createdAt, hb.quitAt, ...relapses.map(r => r.startedAt)].filter(Number.isFinite));
    let clean = 0, possible = 0;
    for (const d of days) {
      if (d > today) continue;
      const a = parseKey(d).getTime(), b = a + DAY;
      if (!(start < b)) continue;
      possible++;
      if (!relapses.some(r => r.ts >= a && r.ts < b)) clean++;
    }
    // Temiz geçen süreler × günlük maliyet
    const segs = relapses.map(r => [r.startedAt, r.ts]).concat([[hb.quitAt, now]]);
    let ms = 0;
    for (const [s, e] of segs) if (Number.isFinite(s) && Number.isFinite(e)) ms += Math.max(0, Math.min(e, t1) - Math.max(s, t0));
    return { id: hb.id, name: hb.name || 'Alışkanlık', icon: hb.icon || 'shield', clean, possible,
      slips: relapses.filter(r => r.ts >= t0 && r.ts < t1).length, saved: (ms / DAY) * (+hb.costPerDay || 0) };
  });
  return { list: out, saved: sum(out, x => x.saved), clean: sum(out, x => x.clean), possible: sum(out, x => x.possible) };
}

function xpPart(ws, we) {
  const t0 = parseKey(ws).getTime(), t1 = parseKey(addDays(we, 1)).getTime();
  const log = (getXP().log || []).filter(x => x && x.ts >= t0 && x.ts < t1);
  const by = new Map();
  for (const x of log) {
    const k = String(x.reason || 'Diğer').split(' · ')[0].trim() || 'Diğer';
    const g = by.get(k) || { reason: k, amount: 0, n: 0 };
    g.amount += +x.amount || 0; g.n++;
    by.set(k, g);
  }
  return { total: sum(log, x => x.amount), count: log.length, top: [...by.values()].sort((a, b) => b.amount - a.amount).slice(0, 5) };
}

// ---------------------------------------------------------------- Puan
function scoreOf(w) {
  const el = Math.max(1, w.elapsed);
  const activeDays = new Set([...w.run.days, ...w.workout.days]).size;
  const activeTarget = Math.max(1, Math.round(3 * el / 7));
  const parts = [
    { w: 30, v: w.steps.hits / el },
    { w: 25, v: activeDays / activeTarget },
    { w: 25, v: w.food.inTarget / el },
    { w: 10, v: w.food.waterHits / el },
  ];
  if (w.habits.possible > 0) parts.push({ w: 10, v: w.habits.clean / w.habits.possible });
  const tw = sum(parts, p => p.w);
  return Math.round(sum(parts, p => p.w * Math.min(1, Math.max(0, p.v))) / tw * 100);
}

function sentenceOf(w) {
  const lead = w.isCurrent ? 'Bu hafta' : w.isLast ? 'Geçen hafta' : 'O hafta';
  const n = v => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  const p = [];
  if (w.steps.hits) p.push(`${w.steps.hits} gün adım hedefini tuttun`);
  if (w.workout.count) p.push(`${w.workout.count} antrenman yaptın`);
  if (w.run.count) p.push(w.run.onlyRuns ? `${n(w.run.distM / 1000)}\u00a0km koştun` : `${n(w.run.distM / 1000)}\u00a0km yol aldın`);
  if (w.food.inTarget) p.push(`kalori hedefine ${w.food.inTarget} gün uydun`);
  if (!p.length) {
    if (w.steps.total > 0) return `${lead} ${w.steps.total.toLocaleString('tr-TR')} adım attın. Hedeflerine biraz daha yaklaşabilirsin.`;
    return w.isCurrent ? 'Bu hafta henüz bir hedefe ulaşmadın. Küçük bir adımla başla!' : `${lead} hedeflerine ulaşamadın. Yeni hafta yeni bir başlangıç.`;
  }
  const body = p.length > 1 ? p.slice(0, -1).join(', ') + ' ve ' + p[p.length - 1] : p[0];
  return `${lead} ${body}.`;
}

// ---------------------------------------------------------------- Ana hesap
/** until: karşılaştırma için haftayı bu güne kadar say (ör. geçen haftanın ilk 2 günü) */
export function computeWeek(wsIn, { until = null } = {}) {
  const ws = weekStartOf(wsIn), we = addDays(ws, 6), realToday = todayKey();
  const today = until && until < realToday ? until : realToday;
  const cut = today < we ? today : we;
  const days = weekDays(ws);
  const curWs = weekStartOf(realToday);
  const w = {
    ws, we, days, today,
    isCurrent: ws === curWs, partial: !!until, isLast: ws === addDays(curWs, -7), isFuture: ws > curWs,
    elapsed: days.filter(d => d <= today).length,
  };
  w.steps = stepsPart(days, today);
  w.run = runPart(ws, cut);
  w.workout = workoutPart(ws, cut);
  w.food = foodPart(days, today);
  w.weight = weightPart(ws, cut);
  w.habits = habitsPart(days, today, ws, cut);
  w.xp = xpPart(ws, cut);
  w.hasData = !!(w.steps.total || w.run.count || w.workout.count || w.food.logged || w.food.waterDays || w.weight || w.xp.count);
  w.score = w.hasData ? scoreOf(w) : 0;
  w.sentence = sentenceOf(w);
  return w;
}
