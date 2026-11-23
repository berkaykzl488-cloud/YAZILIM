// Antrenman verisi: oturum kaydı, aktif antrenman, kişisel rekorlar, istatistikler.
import { load, save, update, todayKey, dateKey, addDays, parseKey } from '../../core/store.js';
import { uid } from '../../core/ui.js';
import { getProfile, kcalFromMET } from '../../core/profile.js';
import { EX } from './exercises.js';

export const K = { sessions: 'workouts', active: 'workout.active', custom: 'workout.custom', loc: 'workout.loc', prefs: 'workout.prefs', last: 'workout.lastDay' };

export const sessions = () => load(K.sessions, []);
export const getActive = () => load(K.active, null);
export const setActive = a => save(K.active, a);
export const clearActive = () => save(K.active, null);
export const getLoc = () => load(K.loc, 'home');
export const setLoc = l => save(K.loc, l);
export const customs = () => load(K.custom, []);

/** Epley ile tahmini tek tekrar maksimum */
export function epley(kg, reps) {
  if (!(kg > 0) || !(reps > 0)) return 0;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

const bodyKg = () => getProfile().weightKg || 75;

/** Bir setin hacmi (kg × tekrar). Vücut ağırlığı hareketlerinde vücut ağırlığının bir kısmı eklenir. */
export function setVolume(exId, set, bw = bodyKg()) {
  const e = EX[exId];
  if (!set.done || !set.reps) return 0;
  const load = (+set.kg || 0) + (e?.bwf || 0) * bw;
  return load * set.reps;
}

export function sessionTotals(s) {
  let volume = 0, sets = 0, reps = 0;
  const bw = bodyKg();
  for (const x of s.exercises || []) for (const st of x.sets || []) {
    if (!st.done) continue;
    sets++; reps += +st.reps || 0;
    volume += setVolume(x.exId, st, bw);
  }
  return { volume: Math.round(volume), sets, reps };
}

export const durationMin = s => Math.max(1, Math.round(((s.endTs || Date.now()) - s.startTs) / 60000));

/** Egzersiz geçmişi: oturum başına en iyi değerler (eskiden yeniye) */
export function historyFor(exId, list = sessions()) {
  const out = [];
  for (const s of list) {
    const x = (s.exercises || []).find(e => e.exId === exId);
    if (!x) continue;
    const done = (x.sets || []).filter(st => st.done);
    if (!done.length) continue;
    let e1 = 0, bestKg = 0, bestReps = 0, bestSec = 0, best = null, vol = 0;
    for (const st of done) {
      const v = epley(+st.kg, +st.reps);
      if (v > e1) { e1 = v; best = st; }
      bestKg = Math.max(bestKg, +st.kg || 0); bestReps = Math.max(bestReps, +st.reps || 0); bestSec = Math.max(bestSec, +st.sec || 0);
      vol += setVolume(exId, st);
    }
    out.push({ id: s.id, date: s.date, ts: s.startTs, sets: done, e1rm: e1, bestKg, bestReps, bestSec, best, vol });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

export function bestFor(exId) {
  const h = historyFor(exId);
  const r = { e1rm: 0, kg: 0, reps: 0, sec: 0, bestSet: null, count: h.length };
  for (const x of h) {
    if (x.e1rm > r.e1rm) { r.e1rm = x.e1rm; r.bestSet = x.best; }
    r.kg = Math.max(r.kg, x.bestKg); r.reps = Math.max(r.reps, x.bestReps); r.sec = Math.max(r.sec, x.bestSec);
  }
  return r;
}

/** En son yapılan oturumdaki setler (ön doldurma için) */
export function lastSetsFor(exId) {
  const h = historyFor(exId);
  return h.length ? h[h.length - 1].sets : null;
}

/** Bir egzersiz şablonundan aktif antrenman satırı üretir (geçen seferki değerlerle ön doldurur) */
export function makeEntry(exId, target = {}) {
  const e = EX[exId];
  const t = { sets: target.sets ?? e.def.sets, reps: target.reps ?? (e.type === 'reps' ? e.def.reps : null), sec: target.sec ?? (e.type === 'time' ? e.def.sec : null), rest: target.rest ?? e.def.rest };
  const last = lastSetsFor(exId);
  const sets = [];
  for (let i = 0; i < t.sets; i++) {
    const p = last?.[Math.min(i, last.length - 1)];
    if (t.sec != null && !t.reps) sets.push({ kg: p?.kg || 0, reps: 0, sec: p?.sec || t.sec, done: false });
    else sets.push({ kg: p?.kg ?? 0, reps: t.reps || p?.reps || 10, sec: 0, done: false });
  }
  return { exId, target: t, sets };
}

/** Kademeli yüklenme önerisi */
export function overloadHint(exId, target) {
  const last = lastSetsFor(exId);
  const e = EX[exId];
  if (!last || !e) return null;
  if (e.type === 'time') {
    const best = Math.max(...last.map(s => +s.sec || 0));
    return best >= (target.sec || 0) ? `Geçen sefer ${best} sn dayandın. Bugün 5 sn fazlasını dene.` : null;
  }
  const allHit = last.length >= (target.sets || 1) && last.every(s => (+s.reps || 0) >= (target.reps || 0));
  const kg = Math.max(...last.map(s => +s.kg || 0));
  if (!allHit) return 'Geçen seferki değerleri yazdık. Hedef tekrarları tamamlamaya çalış.';
  if (kg > 0) return `Geçen sefer tüm setleri tamamladın. Bugün ${e.eq.includes('bb') ? '2,5' : '1–2'} kg artırmayı dene.`;
  return 'Geçen sefer tüm setleri tamamladın. Bugün her sete 1–2 tekrar ekle.';
}

export function startSession({ name = 'Serbest antrenman', location = getLoc(), programId = null, dayIdx = null, items = [] } = {}) {
  const a = { id: uid(), startTs: Date.now(), name, location, programId, dayIdx, exercises: items.map(it => makeEntry(it.id, it)), cur: 0, rest: null };
  setActive(a);
  if (programId) update(K.last, m => ({ ...m, [programId]: dayIdx }), {});
  return a;
}

/** Aktif antrenmanı bitirir ve geçmişe kaydeder. { session, prs } döner */
export function finishSession(a) {
  const endTs = Date.now();
  const exercises = a.exercises
    .map(x => ({ exId: x.exId, sets: x.sets.filter(s => s.done).map(s => ({ kg: +s.kg || 0, reps: +s.reps || 0, sec: +s.sec || 0, done: true })) }))
    .filter(x => x.sets.length);
  const s = { id: a.id, date: dateKey(new Date(a.startTs)), startTs: a.startTs, endTs, location: a.location, programId: a.programId || null, name: a.name, exercises };
  const tot = sessionTotals(s);
  s.volumeKg = tot.volume;
  const mins = Math.min(240, durationMin(s));
  let metSum = 0, n = 0;
  for (const x of exercises) { metSum += (EX[x.exId]?.met || 5) * x.sets.length; n += x.sets.length; }
  s.kcal = n ? kcalFromMET(metSum / n, mins) : 0;
  const prs = findPRs(s, sessions());
  s.prs = prs.map(p => p.exId);
  update(K.sessions, list => [...list.filter(x => x.id !== s.id), s].sort((a2, b) => a2.startTs - b.startTs), []);
  clearActive();
  return { session: s, prs };
}

export function findPRs(s, prev) {
  const out = [];
  for (const x of s.exercises) {
    const e = EX[x.exId]; if (!e) continue;
    const before = historyFor(x.exId, prev.filter(p => p.id !== s.id && p.startTs < s.startTs));
    if (!before.length) continue;
    const cur = historyFor(x.exId, [s])[0];
    const bE = Math.max(...before.map(b => b.e1rm)), bR = Math.max(...before.map(b => b.bestReps)), bS = Math.max(...before.map(b => b.bestSec));
    if (cur.e1rm > 0 && cur.e1rm > bE + 0.01) out.push({ exId: x.exId, label: `Tahmini 1TM ${Math.round(cur.e1rm)} kg` });
    else if (e.type === 'time' && cur.bestSec > bS) out.push({ exId: x.exId, label: `${cur.bestSec} sn` });
    else if (cur.bestKg === 0 && cur.bestReps > bR && e.type !== 'time') out.push({ exId: x.exId, label: `${cur.bestReps} tekrar` });
  }
  return out;
}

export function deleteSession(id) { update(K.sessions, list => list.filter(s => s.id !== id), []); }

// ---------- Tarih / istatistik ----------
export function weekStart(key) {
  const d = parseKey(key);
  const wd = (d.getDay() + 6) % 7; // Pazartesi = 0
  return addDays(key, -wd);
}

/** Haftalık seri: üst üste en az 1 antrenman yapılan hafta sayısı (bu hafta boşsa geçen haftadan sayar) */
export function weekStreak(list = sessions()) {
  const weeks = new Set(list.map(s => weekStart(s.date)));
  let w = weekStart(todayKey());
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) { n++; w = addDays(w, -7); }
  return n;
}

export function daySummary(key, list = sessions()) {
  const ss = list.filter(s => s.date === key);
  let mins = 0, vol = 0, kcal = 0;
  for (const s of ss) { mins += durationMin(s); vol += s.volumeKg || 0; kcal += s.kcal || 0; }
  return { count: ss.length, mins, vol, kcal };
}

/** Son n gündeki kas grubu dağılımı (set sayısı) */
export function groupDistribution(days = 30, list = sessions()) {
  const from = addDays(todayKey(), -(days - 1));
  const m = {};
  const mus = {};
  for (const s of list) {
    if (s.date < from) continue;
    for (const x of s.exercises) {
      const e = EX[x.exId]; if (!e) continue;
      const n = x.sets.filter(st => st.done).length;
      m[e.group] = (m[e.group] || 0) + n;
      for (const p of e.muscles.p) mus[p] = (mus[p] || 0) + n;
      for (const p of e.muscles.s) mus[p] = (mus[p] || 0) + n * 0.5;
    }
  }
  return { groups: m, muscles: mus };
}

/** Kaldığın programın sıradaki günü */
export function nextDayIdx(prog) {
  const last = load(K.last, {})[prog.id];
  return last == null ? 0 : (last + 1) % prog.days.length;
}
