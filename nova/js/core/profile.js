// Kullanıcı profili ve metabolizma hesapları (Mifflin-St Jeor).
import { load, save } from './store.js';

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Hareketsiz (masa başı)', factor: 1.2 },
  { id: 'light', label: 'Hafif aktif (haftada 1-3)', factor: 1.375 },
  { id: 'moderate', label: 'Orta aktif (haftada 3-5)', factor: 1.55 },
  { id: 'active', label: 'Çok aktif (haftada 6-7)', factor: 1.725 },
  { id: 'athlete', label: 'Sporcu (günde 2 antrenman)', factor: 1.9 },
];

export const GOALS = [
  { id: 'lose', label: 'Yağ yak / kilo ver', delta: -500 },
  { id: 'recomp', label: 'Sıkılaş (hafif açık)', delta: -250 },
  { id: 'maintain', label: 'Formu koru', delta: 0 },
  { id: 'gain', label: 'Kas kazan', delta: 300 },
];

const DEFAULTS = {
  name: '',
  sex: 'male',          // 'male' | 'female'
  age: 28,
  heightCm: 178,
  weightKg: 78,
  targetWeightKg: 74,
  activity: 'moderate',
  goal: 'recomp',
  stepGoal: 10000,
  kcalOverride: null,   // elle girilen kalori hedefi
  waterGoalMl: null,    // null -> otomatik
  onboarded: false,
};

export function getProfile() {
  return { ...DEFAULTS, ...load('profile', {}) };
}
export function saveProfile(patch) {
  return save('profile', { ...getProfile(), ...patch });
}

export function bmr(p = getProfile()) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return Math.round(p.sex === 'female' ? base - 161 : base + 5);
}
export function tdee(p = getProfile()) {
  const f = ACTIVITY_LEVELS.find(a => a.id === p.activity)?.factor ?? 1.55;
  return Math.round(bmr(p) * f);
}
/** Günlük kalori hedefi */
export function calorieTarget(p = getProfile()) {
  if (p.kcalOverride) return Math.round(p.kcalOverride);
  const d = GOALS.find(g => g.id === p.goal)?.delta ?? 0;
  return Math.max(1200, tdee(p) + d);
}
/** Gram cinsinden makro hedefleri */
export function macroTargets(p = getProfile()) {
  const kcal = calorieTarget(p);
  const proteinPerKg = p.goal === 'gain' ? 2.0 : p.goal === 'maintain' ? 1.6 : 1.9;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, fiber: Math.round(kcal / 1000 * 14) };
}
export function waterTarget(p = getProfile()) {
  return p.waterGoalMl || Math.round((p.weightKg * 35) / 50) * 50;
}
export function bmi(p = getProfile()) {
  const m = p.heightCm / 100;
  return +(p.weightKg / (m * m)).toFixed(1);
}
export function bmiLabel(v) {
  if (v < 18.5) return 'Zayıf';
  if (v < 25) return 'Normal';
  if (v < 30) return 'Fazla kilolu';
  return 'Obez';
}
/** Adım uzunluğu (metre) */
export function strideM(p = getProfile(), running = false) {
  return +((p.heightCm / 100) * (running ? 0.65 : (p.sex === 'female' ? 0.413 : 0.415))).toFixed(3);
}
/** MET değerinden yakılan kalori */
export function kcalFromMET(met, minutes, weightKg = getProfile().weightKg) {
  return Math.round((met * 3.5 * weightKg / 200) * minutes);
}
/** Adım sayısından yaklaşık kalori (yürüyüş) */
export function kcalFromSteps(steps, p = getProfile()) {
  return Math.round(steps * p.weightKg * 0.00057);
}
