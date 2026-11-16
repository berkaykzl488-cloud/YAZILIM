// Poz kütüphanesi: her egzersizin animasyonu yeniden kullanılabilir pozlardan kurulur.
// Açılar derece. Yan görünümde figür sağa bakar. t: gövde eğimi (+ öne), a: [omuz, dirsek], l: [kalça, diz, ayak bileği].
// ik: { h1, h2 (el bileği), f1, f2 (ayak bileği) } hedef noktaları; anc: [nokta, x, y] figürü bir noktaya sabitler.
import { HIP_Y, ANK, FLOOR } from './figure.js';

const Y = HIP_Y + 0.6;
export const PH = {
  squat: ['Başlangıç pozisyonu', 'Çömel — nefes al', 'Kalk — nefes ver'],
  push: ['Başlangıç pozisyonu', 'İn — nefes al', 'İt — nefes ver'],
  press: ['Başlangıç pozisyonu', 'İt — nefes ver', 'Kontrollü indir — nefes al'],
  pull: ['Başlangıç — kollar uzun', 'Çek — nefes ver', 'Kontrollü bırak — nefes al'],
  lift: ['Başlangıç pozisyonu', 'Kaldır — nefes ver', 'Kontrollü indir — nefes al'],
  curl: ['Başlangıç — kollar aşağıda', 'Bük — nefes ver', 'Yavaşça indir — nefes al'],
  ext: ['Başlangıç pozisyonu', 'Kolu uzat — nefes ver', 'Kontrollü bük — nefes al'],
  hinge: ['Dik başla', 'Kalçadan eğil — nefes al', 'Kalçayı ileri it — nefes ver'],
  hold: ['Pozisyonu al', 'Koru — düzenli nefes al'],
  crunch: ['Başlangıç pozisyonu', 'Karnını sık — nefes ver', 'Yavaşça geri in — nefes al'],
  bridge: ['Sırt üstü başla', 'Kalçayı kaldır — nefes ver', 'Kontrollü indir — nefes al'],
  stretch: ['Hazırlan', 'Esnemeye gir — nefes ver', 'Koru ve gevşe — derin nefes'],
  alt: ['Başlangıç pozisyonu', 'Sağ taraf', 'Sol taraf'],
};

export const F = (p, ph = 0, d = 1000, hold = 0, ease) => ({ p, ph, d, hold, ease });
/** A → B → A döngüsü (3 faz) */
export function rep(a, b, { down = 1300, up = 1000, top = 450, bottom = 200, ph = [0, 1, 2] } = {}) {
  return [F(a, ph[0], up, top), F(b, ph[1], down, bottom), F(a, ph[2], up, 0)];
}
export const feet = (x = 121, x2 = x - 4, fa) => ({ f1: [x, ANK], f2: [x2, ANK] });
export const stand = (o = {}) => ({ r: [118, Y], t: 0, a1: [6, 12], a2: [-4, 12], ...o, ik: { ...feet(121, 117), ...(o.ik || {}) } });
const FW = (o = {}) => ({ r: [120, Y], t: 0, a1: [8, 6], a2: [8, 6], l1: [3, 0, 0], l2: [3, 0, 0], ...o, ik: { f1: [131, ANK], f2: [109, ANK], ...(o.ik || {}) } });

// Sık kullanılan sahne ögeleri
const MAT = { type: 'mat', x: 30, w: 180 };

export const A = {
  // ---------------- Bacak ----------------
  squat: { phases: PH.squat, frames: rep(
    stand({ a1: [80, 6], a2: [80, 6] }),
    { r: [95, 143], t: 40, n: -22, a1: [128, 6], a2: [128, 6], ik: feet() }) },

  'bb-back-squat': { props: [{ type: 'barbell', at: 'back' }], phases: PH.squat, frames: rep(
    stand({ a1: [-38, 128], a2: [-38, 128] }),
    { r: [96, 143], t: 46, n: -26, a1: [-30, 124], a2: [-30, 124], ik: feet() }, { down: 1500, up: 1100 }) },

  'goblet-squat': { props: [{ type: 'kettlebell', hang: true }], phases: PH.squat, frames: rep(
    stand({ a1: [18, 150], a2: [18, 150] }),
    { r: [97, 146], t: 28, n: -12, a1: [44, 140], a2: [44, 140], ik: feet() }) },

  lunge: { phases: ['Başlangıç pozisyonu', 'Öne adım at ve in — nefes al', 'Topuktan itip dön — nefes ver'], frames: rep(
    { r: [116, 118], t: 2, a1: [4, 12], a2: [-4, 12], ik: { f1: [150, ANK], f2: [86, 178] }, fa: { f2: 30 } },
    { r: [117, 145], t: 4, a1: [6, 14], a2: [-6, 14], ik: { f1: [150, ANK], f2: [86, 178] }, fa: { f2: 30 } }) },

  // ---------------- Göğüs ----------------
  pushup: { props: [MAT], phases: PH.push, frames: rep(
    { t: 67, n: -8, anc: ['toe1', 52, FLOOR], ik: { h1: [157, 181], h2: [155, 181] }, l1: [0, 0, 0], l2: [0, 0, 0] },
    { t: 84, n: -10, anc: ['toe1', 52, FLOOR], ik: { h1: [157, 181], h2: [155, 181] }, l1: [0, 0, 0], l2: [0, 0, 0] }) },

  'bb-bench': { props: [{ type: 'bench', x: 64, w: 100, y: 147 }, { type: 'barbell' }], phases: PH.push, frames: rep(
    { r: [150, 139], t: -90, n: 0, ik: { h1: [109, 93], h2: [109, 93], f1: [186, ANK], f2: [181, ANK] } },
    { r: [150, 139], t: -90, n: 0, ik: { h1: [116, 123], h2: [116, 123], f1: [186, ANK], f2: [181, ANK] } }, { down: 1400, up: 1000 }) },

  // ---------------- Sırt ----------------
  pullup: { view: 'front', props: [{ type: 'pullbar', front: true, x: 120, y: 14 }], phases: PH.pull, frames: rep(
    { r: [120, 104], sh: 3, ik: { h1: [151, 19], h2: [89, 19] }, l1: [2, 0, 0], l2: [-2, 0, 0], ls: [1, 0.62], ik2: 0 },
    { r: [120, 70], sh: -2, ik: { h1: [151, 19], h2: [89, 19] }, l1: [2, 0, 0], l2: [-2, 0, 0], ls: [1, 0.62] }, { down: 1000, up: 1400, ph: [0, 1, 2] }) },

  deadlift: { props: [{ type: 'barbell' }], phases: PH.lift, frames: [
    F({ r: [93, 143], t: 57, n: -24, ik: { h1: [127, 168], h2: [127, 168], ...feet(120, 116) } }, 0, 1300, 450),
    F({ r: [117, Y], t: -2, n: 0, ik: { h1: [125, 114], h2: [125, 114], ...feet(120, 116) } }, 1, 1300, 300),
    F({ r: [93, 143], t: 57, n: -24, ik: { h1: [127, 168], h2: [127, 168], ...feet(120, 116) } }, 2, 1400, 0),
  ] },

  // ---------------- Kol ----------------
  'db-curl': { props: [{ type: 'dumbbell' }], phases: PH.curl, frames: rep(
    stand({ a1: [4, 8], a2: [4, 8] }),
    stand({ a1: [10, 140], a2: [10, 140] }), { down: 900, up: 1400 }) },

  // ---------------- Karın ----------------
  plank: { props: [MAT], phases: PH.hold, frames: [
    F({ t: 79, n: -8, anc: ['toe1', 52, FLOOR], a1: [79, 90], a2: [79, 90] }, 0, 800, 900),
    F({ t: 78.6, n: -8, cv: 0.06, anc: ['toe1', 52, FLOOR], a1: [78.6, 90], a2: [78.6, 90] }, 1, 1600, 400),
    F({ t: 79, n: -8, anc: ['toe1', 52, FLOOR], a1: [79, 90], a2: [79, 90] }, 1, 1600, 0),
  ] },

  // ---------------- Kardiyo ----------------
  'jumping-jack': { view: 'front', phases: ['Ayaklar bitişik, kollar yanda', 'Zıpla: bacaklar açık, kollar yukarı', 'Zıpla: başlangıca dön'], frames: [
    F(FW({ a1: [6, 4], a2: [6, 4], ik: { f1: [129, ANK], f2: [111, ANK] } }), 0, 380, 120),
    F(FW({ r: [120, Y - 6], a1: [168, 6], a2: [168, 6], ik: { f1: [150, ANK], f2: [90, ANK] } }), 1, 380, 100),
    F(FW({ a1: [6, 4], a2: [6, 4], ik: { f1: [129, ANK], f2: [111, ANK] } }), 2, 380, 0),
  ] },
};
