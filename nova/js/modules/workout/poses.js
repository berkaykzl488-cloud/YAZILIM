// Poz kütüphanesi: her egzersizin animasyonu yeniden kullanılabilir pozlardan kurulur.
// Açılar derece. Yan görünümde figür sağa bakar. t: gövde eğimi (+ öne; 90 yüzüstü, -90 sırtüstü),
// a: [omuz, dirsek], l: [kalça, diz, ayak bileği]. ik: { h1, h2 (el bileği), f1, f2 (ayak bileği) } hedefleri.
// anc: [nokta, x, y] figürü o noktaya sabitler. 1 = yakın taraf (ön görünümde ekranın sağı), 2 = uzak taraf.
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
  alt: ['Başlangıç pozisyonu', 'Bir taraf', 'Diğer taraf'],
};

export const F = (p, ph = 0, d = 1000, hold = 0, ease) => ({ p, ph, d, hold, ease });
/** A → B → A döngüsü (3 faz) */
export function rep(a, b, { down = 1300, up = 1000, top = 450, bottom = 200, ph = [0, 1, 2] } = {}) {
  return [F(a, ph[0], up, top), F(b, ph[1], down, bottom), F(a, ph[2], up, 0)];
}
/** Statik duruş: hafif nefes hareketiyle */
function hold(a, b, ph = [0, 1]) { return [F(a, ph[0], 900, 900), F(b, ph[1], 1500, 300), F(a, ph[1], 1500, 0)]; }

export const feet = (x = 121, x2 = x - 4) => ({ f1: [x, ANK], f2: [x2, ANK] });
export const stand = (o = {}) => ({ r: [118, Y], t: 0, a1: [6, 12], a2: [-4, 12], ...o, ik: { ...feet(121, 117), ...(o.ik || {}) } });
const FW = (o = {}) => ({ r: [120, Y], t: 0, a1: [8, 6], a2: [8, 6], l1: [3, 0, 0], l2: [3, 0, 0], ...o, ik: { f1: [131, ANK], f2: [109, ANK], ...(o.ik || {}) } });

// Sık kullanılan sahne ögeleri
const MAT = { type: 'mat', x: 30, w: 180 };
const DB = { type: 'dumbbell' };
const BB = { type: 'barbell' };

// Ortak pozlar
const PU_TOP = { t: 67, n: -8, anc: ['toe1', 52, FLOOR], ik: { h1: [157, 181], h2: [155, 181] }, l1: [0, 0, 0], l2: [0, 0, 0] };
const PU_BOT = { ...PU_TOP, t: 84, n: -10 };
const QUAD = { r: [88, 144], t: 90, n: -14, l1: [90, 90, 90], l2: [90, 90, 90], ik: { h1: [133, 181], h2: [131, 181] } };
const SUP = (o = {}) => ({ r: [122, 176], t: -90, n: 0, a1: [0, 0], a2: [0, 0], ...o, ik: { f1: [158, ANK], f2: [154, ANK], ...(o.ik || {}) } });
const BENCH_LIE = { r: [150, 139], t: -90, n: 0 };
const BFEET = { f1: [186, ANK], f2: [181, ANK] };
const HANG = (o = {}) => ({ r: [124, 111], t: -2, l1: [6, 18, 30], l2: [-6, 22, 30], ...o, ik: { h1: [126, 20], h2: [126, 20], ...(o.ik || {}) } });

export const A = {
  // ======================= GÖĞÜS =======================
  pushup: { props: [MAT], phases: PH.push, frames: rep(PU_TOP, PU_BOT) },

  'knee-pushup': { props: [MAT], phases: PH.push, frames: rep(
    { t: 56, n: -8, anc: ['knee1', 72, 181], l1: [0, 105, 60], l2: [0, 105, 60], ik: { h1: [140, 181], h2: [138, 181] } },
    { t: 79, n: -10, anc: ['knee1', 72, 181], l1: [0, 105, 60], l2: [0, 105, 60], ik: { h1: [140, 181], h2: [138, 181] } }) },

  'incline-pushup': { props: [{ type: 'bench', x: 130, w: 70, y: 148 }], phases: PH.push, frames: rep(
    { t: 50, n: -8, anc: ['toe1', 40, FLOOR], ik: { h1: [140, 146], h2: [138, 146] } },
    { t: 63, n: -8, anc: ['toe1', 40, FLOOR], ik: { h1: [140, 146], h2: [138, 146] } }) },

  'decline-pushup': { props: [{ type: 'bench', x: 14, w: 56, y: 150 }], phases: PH.push, frames: rep(
    { t: 94, n: -8, anc: ['toe1', 50, 149], l1: [0, 0, 0], l2: [0, 0, 0], ik: { h1: [163, 181], h2: [161, 181] } },
    { t: 101, n: -10, anc: ['toe1', 50, 149], l1: [0, 0, 0], l2: [0, 0, 0], ik: { h1: [163, 181], h2: [161, 181] } }) },

  'diamond-pushup': { props: [MAT], phases: PH.push, frames: rep(
    { ...PU_TOP, ik: { h1: [152, 181], h2: [152, 181] }, bend: { h1: -1, h2: -1 } },
    { ...PU_BOT, t: 82, ik: { h1: [152, 181], h2: [152, 181] } }) },

  'bb-bench': { props: [{ type: 'bench', x: 64, w: 100, y: 147 }, BB], phases: PH.push, frames: rep(
    { ...BENCH_LIE, ik: { h1: [109, 93], h2: [109, 93], ...BFEET } },
    { ...BENCH_LIE, ik: { h1: [116, 123], h2: [116, 123], ...BFEET } }, { down: 1400, up: 1000 }) },

  'db-bench': { props: [{ type: 'bench', x: 64, w: 100, y: 147 }, DB], phases: PH.push, frames: rep(
    { ...BENCH_LIE, ik: { h1: [108, 94], h2: [108, 94], ...BFEET } },
    { ...BENCH_LIE, ik: { h1: [114, 126], h2: [114, 126], ...BFEET } }, { down: 1400, up: 1000 }) },

  'incline-db-press': { props: [{ type: 'bench', x: 118, y: 150, ang: 38, w: 72, seat: 26 }, DB], phases: PH.press, frames: rep(
    { r: [146, 140], t: -52, n: 8, ik: { h1: [122, 101], h2: [122, 101], f1: [182, ANK], f2: [177, ANK] } },
    { r: [146, 140], t: -52, n: 8, ik: { h1: [118, 66], h2: [118, 66], f1: [182, ANK], f2: [177, ANK] } }, { down: 1000, up: 1400 }) },

  'machine-chest-press': { props: [{ type: 'seat', x: 92, y: 148, w: 36, back: 56, backX: 2, backAng: 8 }, { type: 'lever', px: 172, py: 30 }], phases: PH.press, frames: rep(
    { r: [108, 140], t: -6, ik: { h1: [121, 99], h2: [121, 99], f1: [148, ANK], f2: [144, ANK] } },
    { r: [108, 140], t: -6, ik: { h1: [151, 99], h2: [151, 99], f1: [148, ANK], f2: [144, ANK] } }, { down: 900, up: 1300 }) },

  'cable-crossover': { view: 'front', props: [{ type: 'crossover', y: 32 }], phases: ['Kollar açık, göğüs önde', 'Elleri önde birleştir — nefes ver', 'Kontrollü aç — nefes al'], frames: rep(
    FW({ a1: [112, 14], a2: [112, 14], ik: { f1: [134, ANK], f2: [106, ANK] } }),
    FW({ a1: [12, -42], a2: [12, -42], ik: { f1: [134, ANK], f2: [106, ANK] } }), { down: 1000, up: 1400 }) },

  'chest-dip': { props: [{ type: 'dipbar', x: 126, y: 118 }], phases: PH.push, frames: rep(
    { r: [115, 110], t: 12, n: -6, l1: [-10, 80, 10], l2: [-14, 84, 10], ik: { h1: [126, 113], h2: [126, 113] } },
    { r: [101, 132], t: 26, n: -10, l1: [-10, 80, 10], l2: [-14, 84, 10], ik: { h1: [126, 113], h2: [126, 113] } }) },

  'db-pullover': { props: [{ type: 'bench', x: 64, w: 100, y: 147 }, { type: 'dumbbell', only: 1, neutral: true }], phases: ['Kollar göğüs üstünde', 'Başın arkasına indir — nefes al', 'Göğüs üstüne getir — nefes ver'], frames: rep(
    { ...BENCH_LIE, a1: [92, 12], a2: [92, 12], ik: BFEET },
    { ...BENCH_LIE, a1: [168, 16], a2: [168, 16], ik: BFEET }, { down: 1500, up: 1200 }) },

  // ======================= SIRT =======================
  pullup: { view: 'front', props: [{ type: 'pullbar', front: true, x: 120, y: 14 }], phases: PH.pull, frames: rep(
    { r: [120, 104], sh: 3, ik: { h1: [151, 19], h2: [89, 19] }, l1: [2, 0, 0], l2: [-2, 0, 0], ls: [1, 0.62] },
    { r: [120, 70], sh: -2, ik: { h1: [151, 19], h2: [89, 19] }, l1: [2, 0, 0], l2: [-2, 0, 0], ls: [1, 0.62] }, { down: 1000, up: 1400 }) },

  chinup: { props: [{ type: 'pullbar', x: 126, y: 16 }], phases: PH.pull, frames: rep(
    HANG(),
    HANG({ r: [133, 80], t: -12, n: -4, l1: [20, 40, 30], l2: [10, 46, 30] }), { down: 1000, up: 1400 }) },

  'inverted-row': { props: [{ type: 'pullbar', x: 92, y: 118, dx: -40 }], phases: PH.pull, frames: rep(
    { t: -83, n: 4, anc: ['heel1', 214, FLOOR], l1: [0, 0, 10], l2: [0, 0, 10], ik: { h1: [94, 121], h2: [94, 121] }, bend: { h1: 1, h2: 1 } },
    { t: -65, n: 8, anc: ['heel1', 214, FLOOR], l1: [0, 0, 10], l2: [0, 0, 10], ik: { h1: [94, 121], h2: [94, 121] }, bend: { h1: 1, h2: 1 } }) },

  'bb-row': { props: [BB], phases: PH.pull, frames: rep(
    { r: [96, 120], t: 60, n: -20, ik: { h1: [133, 146], h2: [133, 146], ...feet(120, 116) } },
    { r: [96, 120], t: 60, n: -20, ik: { h1: [117, 125], h2: [117, 125], ...feet(120, 116) } }, { down: 900, up: 1300 }) },

  'db-row': { props: [{ type: 'bench', x: 50, w: 104, y: 160 }, { type: 'dumbbell', only: 1, neutral: true }], phases: PH.pull, frames: rep(
    { r: [92, 120], t: 84, n: -10, l2: [84, 90, 90], ik: { h1: [138, 160], h2: [142, 156], f1: [112, ANK] } },
    { r: [92, 120], t: 84, n: -10, l2: [84, 90, 90], ik: { h1: [114, 122], h2: [142, 156], f1: [112, ANK] } }, { down: 900, up: 1300 }) },

  'lat-pulldown': { view: 'front', props: [{ type: 'box', x: 98, w: 44, h: 44 }, { type: 'pulldown', x: 120 }], phases: PH.pull, frames: rep(
    { r: [120, 136], l1: [10, 0, 0], l2: [10, 0, 0], ls: [0.35, 0.9], ik: { h1: [154, 46], h2: [86, 46] } },
    { r: [120, 136], l1: [10, 0, 0], l2: [10, 0, 0], ls: [0.35, 0.9], ik: { h1: [152, 90], h2: [88, 90] }, bend: { h1: -1, h2: -1 } }, { down: 1000, up: 1400 }) },

  'seated-cable-row': { props: [{ type: 'box', x: 66, w: 44, h: 22 }, { type: 'box', x: 160, w: 7, h: 34 }, { type: 'cable', x: 182, y: 158, side: 1 }], phases: PH.pull, frames: rep(
    { r: [90, 157], t: 24, n: -8, ik: { h1: [150, 141], h2: [150, 141], f1: [152, 168], f2: [149, 168] }, fa: { f1: 165, f2: 165 } },
    { r: [90, 157], t: -6, n: 0, ik: { h1: [112, 133], h2: [112, 133], f1: [152, 168], f2: [149, 168] }, fa: { f1: 165, f2: 165 } }, { down: 1000, up: 1400 }) },

  deadlift: { props: [BB], phases: PH.lift, frames: [
    F({ r: [93, 143], t: 57, n: -24, ik: { h1: [127, 168], h2: [127, 168], ...feet(120, 116) } }, 0, 1300, 450),
    F({ r: [117, Y], t: -2, n: 0, ik: { h1: [125, 114], h2: [125, 114], ...feet(120, 116) } }, 1, 1300, 300),
    F({ r: [93, 143], t: 57, n: -24, ik: { h1: [127, 168], h2: [127, 168], ...feet(120, 116) } }, 2, 1400, 0),
  ] },

  superman: { props: [MAT], phases: ['Yüzüstü uzan', 'Kol ve bacakları kaldır — nefes ver', 'Yavaşça indir — nefes al'], frames: rep(
    { r: [104, 177], t: 90, n: 0, a1: [180, 0], a2: [180, 0], l1: [0, 0, 70], l2: [0, 0, 70] },
    { r: [104, 177], t: 84, n: -12, cv: -0.35, a1: [188, 0], a2: [188, 0], l1: [-12, 0, 70], l2: [-12, 0, 70] }, { down: 1000, up: 1000, top: 300, bottom: 700 }) },

  'band-row': { props: [{ type: 'band', from: [172, 176] }], phases: PH.pull, frames: rep(
    { r: [88, 180], t: 6, n: -6, l1: [96, 4, 10], l2: [96, 4, 10], ik: { h1: [150, 152], h2: [150, 152] } },
    { r: [88, 180], t: -8, n: 0, l1: [82, 4, 10], l2: [82, 4, 10], ik: { h1: [110, 145], h2: [110, 145] } }, { down: 1000, up: 1400 }) },

  'face-pull': { props: [{ type: 'cable', x: 204, y: 64, rope: true }], phases: PH.pull, frames: rep(
    stand({ t: -4, ik: { h1: [158, 72], h2: [158, 72] } }),
    stand({ t: -6, ik: { h1: [128, 58], h2: [128, 58] }, bend: { h1: 1, h2: 1 } }), { down: 900, up: 1300 }) },

  'back-extension': { props: [{ type: 'path', d: `M96 132L124 108M70 178L92 166M78 174L120 128L120 ${FLOOR}M104 ${FLOOR}L136 ${FLOOR}`, cls: 'eq-pad' }], phases: ['Kalçadan aşağı sarkın', 'Gövdeyi düz çizgiye kaldır — nefes ver', 'Kontrollü in — nefes al'], frames: rep(
    { r: [110, 122], t: 140, n: 10, a1: [24, 140], a2: [24, 140], ik: { f1: [82, 170], f2: [79, 170] }, fa: { f1: 50, f2: 50 } },
    { r: [110, 122], t: 34, n: 0, a1: [24, 140], a2: [24, 140], ik: { f1: [82, 170], f2: [79, 170] }, fa: { f1: 50, f2: 50 } }, { down: 1300, up: 1100 }) },

  'db-shrug': { view: 'front', props: [DB], phases: ['Kollar yanda, omuzlar rahat', 'Omuzları kulaklara kaldır — nefes ver', 'Yavaşça indir — nefes al'], frames: rep(
    FW({ a1: [9, 4], a2: [9, 4], sh: 0 }), FW({ a1: [9, 4], a2: [9, 4], sh: 7 }), { down: 900, up: 700, bottom: 500 }) },

  // ======================= BACAK =======================
  squat: { phases: PH.squat, frames: rep(
    stand({ a1: [80, 6], a2: [80, 6] }),
    { r: [95, 143], t: 40, n: -22, a1: [128, 6], a2: [128, 6], ik: feet() }) },

  'bb-back-squat': { props: [{ type: 'barbell', at: 'back' }], phases: PH.squat, frames: rep(
    stand({ a1: [-38, 128], a2: [-38, 128] }),
    { r: [96, 143], t: 46, n: -26, a1: [-30, 124], a2: [-30, 124], ik: feet() }, { down: 1500, up: 1100 }) },

  'goblet-squat': { props: [{ type: 'kettlebell', hang: true }], phases: PH.squat, frames: rep(
    stand({ a1: [18, 150], a2: [18, 150] }),
    { r: [97, 146], t: 28, n: -12, a1: [44, 140], a2: [44, 140], ik: feet() }) },

  'bulgarian-split-squat': { props: [{ type: 'bench', x: 24, w: 54, y: 150 }, DB], phases: PH.squat, frames: rep(
    { r: [112, 116], t: 6, a1: [4, 8], a2: [4, 8], ik: { f1: [146, ANK], f2: [64, 146] }, fa: { f2: -96 } },
    { r: [109, 143], t: 14, n: -8, a1: [8, 8], a2: [8, 8], ik: { f1: [146, ANK], f2: [64, 146] }, fa: { f2: -96 } }, { down: 1400, up: 1000 }) },

  lunge: { phases: ['Başlangıç pozisyonu', 'Öne adım at ve in — nefes al', 'Topuktan itip dön — nefes ver'], frames: rep(
    { r: [116, 118], t: 2, a1: [4, 12], a2: [-4, 12], ik: { f1: [150, ANK], f2: [86, 178] }, fa: { f2: 30 } },
    { r: [117, 145], t: 4, a1: [6, 14], a2: [-6, 14], ik: { f1: [150, ANK], f2: [86, 178] }, fa: { f2: 30 } }) },

  'reverse-lunge': { phases: ['Ayakta başla', 'Geriye adım at ve in — nefes al', 'Öndeki topuktan it, dön — nefes ver'], frames: rep(
    stand({ r: [124, Y], ik: feet(127, 123) }),
    { r: [104, 145], t: 6, a1: [10, 14], a2: [-8, 14], ik: { f1: [127, ANK], f2: [70, 178] }, fa: { f2: 30 } }, { down: 1200, up: 1100 }) },

  'side-lunge': { view: 'front', phases: ['Ayaklar geniş açık', 'Bir tarafa otur — nefes al', 'Topuktan itip ortala — nefes ver'], frames: [
    F(FW({ r: [120, 116], a1: [34, -86], a2: [34, -86], ik: { f1: [154, ANK], f2: [86, ANK] } }), 0, 1000, 400),
    F(FW({ r: [140, 136], t: 4, a1: [34, -86], a2: [34, -86], ik: { f1: [154, ANK], f2: [86, ANK] } }), 1, 1200, 250),
    F(FW({ r: [120, 116], a1: [34, -86], a2: [34, -86], ik: { f1: [154, ANK], f2: [86, ANK] } }), 2, 1000, 300),
    F(FW({ r: [100, 136], t: -4, a1: [34, -86], a2: [34, -86], ik: { f1: [154, ANK], f2: [86, ANK] } }), 1, 1200, 250),
    F(FW({ r: [120, 116], a1: [34, -86], a2: [34, -86], ik: { f1: [154, ANK], f2: [86, ANK] } }), 2, 1000, 0),
  ] },

  'leg-press': { props: [{ type: 'legpress', x0: 100, y0: 184, x1: 196, y1: 88, seat: 'M78 160L44 126M78 160L104 160M90 162L90 186' }], phases: PH.press, frames: rep(
    { r: [86, 150], t: -50, n: 14, a1: [40, 20], a2: [40, 20], ik: { f1: [114, 120], f2: [111, 120] }, fa: { f1: -135, f2: -135 } },
    { r: [86, 150], t: -50, n: 14, a1: [40, 20], a2: [40, 20], ik: { f1: [134, 100], f2: [131, 100] }, fa: { f1: -135, f2: -135 } }, { down: 900, up: 1400 }) },

  'leg-extension': { props: [{ type: 'seat', x: 78, y: 140, w: 50, back: 54, backX: 4, backAng: 8 }, { type: 'pad', px: 140, py: 132, side: 7 }], phases: ['Oturarak başla', 'Dizleri uzat — nefes ver', 'Yavaşça bük — nefes al'], frames: rep(
    { r: [100, 132], t: -8, n: 0, a1: [12, 30], a2: [12, 30], l1: [82, 88, 0], l2: [82, 88, 0] },
    { r: [100, 132], t: -8, n: 0, a1: [12, 30], a2: [12, 30], l1: [82, 4, 0], l2: [82, 4, 0] }, { down: 900, up: 1300 }) },

  'leg-curl': { props: [{ type: 'bench', x: 64, w: 104, y: 150 }, { type: 'pad', px: 74, py: 128, side: -7 }], phases: ['Yüzüstü uzan', 'Topukları kalçaya çek — nefes ver', 'Yavaşça uzat — nefes al'], frames: rep(
    { r: [112, 141], t: 90, n: -10, a1: [100, 40], a2: [100, 40], l1: [0, 0, 20], l2: [0, 0, 20] },
    { r: [112, 141], t: 90, n: -10, a1: [100, 40], a2: [100, 40], l1: [0, 112, 20], l2: [0, 112, 20] }, { down: 900, up: 1300 }) },

  rdl: { props: [BB], phases: PH.hinge, frames: rep(
    { r: [117, Y], t: 0, ik: { h1: [124, 113], h2: [124, 113], ...feet(121, 117) } },
    { r: [89, 117], t: 74, n: -22, ik: { h1: [128, 150], h2: [128, 150], ...feet(121, 117) } }, { down: 1500, up: 1100 }) },

  'calf-raise': { phases: ['Ayakta, ayaklar kalça genişliğinde', 'Parmak ucuna yüksel — nefes ver', 'Topukları yavaşça indir — nefes al'], frames: rep(
    stand(), stand({ r: [120, Y - 9], ik: { f1: [121, ANK - 10], f2: [117, ANK - 10] }, fa: { f1: 50, f2: 50 } }), { down: 700, up: 900, bottom: 500 }) },

  'step-up': { props: [{ type: 'box', x: 128, w: 50, h: 36 }], phases: ['Bir ayak basamakta', 'Öndeki topuktan it, çık — nefes ver', 'Kontrollü in — nefes al'], frames: rep(
    { r: [112, 112], t: 10, a1: [10, 14], a2: [-10, 14], ik: { f1: [146, 146], f2: [104, ANK] } },
    { r: [143, 75], t: 2, a1: [-6, 14], a2: [8, 14], l2: [8, 20, 10], ik: { f1: [146, 146] } }, { down: 1100, up: 1100 }) },

  'wall-sit': { props: [{ type: 'wall', x: 72 }], phases: PH.hold, frames: hold(
    { r: [85, 145], t: -1, n: 0, a1: [30, 40], a2: [30, 40], ik: feet(121, 118) },
    { r: [85, 145.6], t: -1, n: 2, a1: [30, 42], a2: [30, 42], ik: feet(121, 118) }) },

  'sumo-squat': { view: 'front', props: [{ type: 'kettlebell', hang: true }], phases: PH.squat, frames: rep(
    FW({ r: [120, 118], ik: { f1: [156, ANK], f2: [84, ANK], h1: [123, 140], h2: [117, 140] }, bend: { h1: 1, h2: 1 } }),
    FW({ r: [120, 146], ik: { f1: [156, ANK], f2: [84, ANK], h1: [123, 166], h2: [117, 166] }, bend: { h1: 1, h2: 1 } })) },

  // ======================= KALÇA =======================
  'glute-bridge': { props: [MAT], phases: PH.bridge, frames: rep(
    SUP({ anc: ['sh', 78, 176], a1: [0, 0], a2: [0, 0] }),
    SUP({ t: -128, n: 38, anc: ['sh', 78, 176], a1: [-38, 0], a2: [-38, 0] }), { down: 900, up: 1100, bottom: 600 }) },

  'single-leg-bridge': { props: [MAT], phases: PH.bridge, frames: rep(
    SUP({ anc: ['sh', 78, 176], l1: [70, 10, 10], ik: { f1: null, f2: [154, ANK] } }),
    SUP({ t: -126, n: 36, anc: ['sh', 78, 176], a1: [-36, 0], a2: [-36, 0], l1: [30, 10, 10], ik: { f1: null, f2: [154, ANK] } }), { down: 900, up: 1100, bottom: 500 }) },

  'hip-thrust': { props: [{ type: 'bench', x: 26, w: 72, y: 146 }, { type: 'barbell', at: 'hip' }], phases: PH.bridge, frames: rep(
    { t: -42, n: 20, anc: ['sh', 96, 140], a1: [70, 40], a2: [70, 40], ik: { f1: [166, ANK], f2: [162, ANK] } },
    { t: -90, n: 34, anc: ['sh', 96, 140], a1: [70, 40], a2: [70, 40], ik: { f1: [166, ANK], f2: [162, ANK] } }, { down: 1000, up: 1100, bottom: 500 }) },

  'donkey-kick': { props: [MAT], phases: ['Dört ayak pozisyonu', 'Topuğu tavana it — nefes ver', 'Kontrollü indir — nefes al'], frames: rep(
    QUAD, { ...QUAD, l1: [-22, 92, -10] }, { down: 800, up: 900, bottom: 400 }) },

  'side-leg-raise': { view: 'front', props: [MAT], phases: ['Yan yat, bacaklar düz', 'Üstteki bacağı kaldır — nefes ver', 'Yavaşça indir — nefes al'], frames: rep(
    { r: [128, 172], rot: -90, n: 20, a1: [0, 10], a2: [180, 40], l1: [0, 0, 0], l2: [0, 0, 0] },
    { r: [128, 172], rot: -90, n: 20, a1: [0, 10], a2: [180, 40], l1: [42, 0, 0], l2: [0, 0, 0] }, { down: 900, up: 900, bottom: 400 }) },

  'cable-kickback': { props: [{ type: 'cable', x: 186, y: 178, attach: 'ankle' }, { type: 'path', d: `M190 22L190 ${FLOOR}` }], phases: ['Öne eğil, tutamaktan tut', 'Bacağı geriye it — nefes ver', 'Kontrollü geri getir — nefes al'], frames: rep(
    { r: [114, Y + 2], t: 22, n: -10, l1: [16, 14, 10], ik: { h1: [168, 96], h2: [168, 96], f2: [124, ANK] } },
    { r: [114, Y + 2], t: 22, n: -10, l1: [-28, 8, 10], ik: { h1: [168, 96], h2: [168, 96], f2: [124, ANK] } }, { down: 900, up: 1000, bottom: 350 }) },

  'kb-swing': { props: [{ type: 'kettlebell' }], phases: ['Kalçadan eğil, kettlebell bacak arasında', 'Kalçayı patlayıcı it — nefes ver', 'Kontrollü salın — nefes al'], frames: [
    F({ r: [93, 128], t: 64, n: -22, a1: [42, 0], a2: [42, 0], ik: feet(120, 116) }, 0, 700, 120, 'out'),
    F({ r: [117, Y], t: -4, n: 0, a1: [88, 4], a2: [88, 4], ik: feet(120, 116) }, 1, 650, 150, 'out'),
    F({ r: [93, 128], t: 64, n: -22, a1: [42, 0], a2: [42, 0], ik: feet(120, 116) }, 2, 700, 0, 'in'),
  ] },

  'band-walk': { view: 'front', props: [{ type: 'band', legs: true }], phases: ['Yarım çömel, bant dizlerin üstünde', 'Yana adım at', 'Diğer ayağı getir'], frames: [
    F(FW({ r: [120, 118], a1: [30, -90], a2: [30, -90], ik: { f1: [134, ANK], f2: [106, ANK] } }), 0, 700, 200),
    F(FW({ r: [128, 118], a1: [30, -90], a2: [30, -90], ik: { f1: [152, ANK], f2: [106, ANK] } }), 1, 700, 150),
    F(FW({ r: [120, 118], a1: [30, -90], a2: [30, -90], ik: { f1: [134, ANK], f2: [106, ANK] } }), 2, 700, 150),
    F(FW({ r: [112, 118], a1: [30, -90], a2: [30, -90], ik: { f1: [134, ANK], f2: [88, ANK] } }), 1, 700, 150),
    F(FW({ r: [120, 118], a1: [30, -90], a2: [30, -90], ik: { f1: [134, ANK], f2: [106, ANK] } }), 2, 700, 0),
  ] },

  // ======================= OMUZ =======================
  'db-shoulder-press': { view: 'front', props: [DB], phases: PH.press, frames: rep(
    FW({ a1: [82, 95], a2: [82, 95] }), FW({ a1: [166, 10], a2: [166, 10] }), { down: 900, up: 1300 }) },

  ohp: { props: [{ type: 'barbell', r: 15 }], phases: PH.press, frames: rep(
    stand({ ik: { h1: [128, 63], h2: [128, 63] } }),
    stand({ n: 0, ik: { h1: [121, 19], h2: [121, 19] } }), { down: 1000, up: 1400 }) },

  'lateral-raise': { view: 'front', props: [DB], phases: ['Kollar yanda', 'Yana omuz hizasına kaldır — nefes ver', 'Yavaşça indir — nefes al'], frames: rep(
    FW({ a1: [12, 8], a2: [12, 8] }), FW({ a1: [88, 12], a2: [88, 12] }), { down: 900, up: 1300 }) },

  'front-raise': { props: [DB], phases: ['Kollar önde aşağıda', 'Öne omuz hizasına kaldır — nefes ver', 'Yavaşça indir — nefes al'], frames: rep(
    stand({ a1: [10, 6], a2: [10, 6] }), stand({ a1: [90, 6], a2: [90, 6] }), { down: 900, up: 1300 }) },

  'pike-pushup': { props: [MAT], phases: PH.push, frames: rep(
    { t: 120, n: 0, anc: ['toe1', 70, FLOOR], l1: [100, 0, 0], l2: [100, 0, 0], ik: { h1: [133, 181], h2: [131, 181] } },
    { t: 150, n: 0, anc: ['toe1', 70, FLOOR], l1: [130, 0, 0], l2: [130, 0, 0], ik: { h1: [133, 181], h2: [131, 181] } }) },

  'upright-row': { view: 'front', props: [{ type: 'barF', light: true, ext: 16 }], phases: PH.pull, frames: rep(
    FW({ ik: { h1: [127, 115], h2: [113, 115] }, bend: { h1: 1, h2: 1 } }),
    FW({ ik: { h1: [136, 76], h2: [104, 76] }, bend: { h1: 1, h2: 1 } }), { down: 900, up: 1300 }) },

  // ======================= KOL =======================
  'db-curl': { props: [DB], phases: PH.curl, frames: rep(
    stand({ a1: [4, 8], a2: [4, 8] }), stand({ a1: [10, 140], a2: [10, 140] }), { down: 900, up: 1400 }) },

  'hammer-curl': { props: [{ type: 'dumbbell', neutral: true }], phases: PH.curl, frames: rep(
    stand({ a1: [4, 8], a2: [4, 8] }), stand({ a1: [10, 135], a2: [10, 135] }), { down: 900, up: 1400 }) },

  'bb-curl': { props: [{ type: 'barbell', r: 12 }], phases: PH.curl, frames: rep(
    stand({ a1: [6, 10], a2: [6, 10] }), stand({ a1: [12, 138], a2: [12, 138] }), { down: 900, up: 1400 }) },

  'band-curl': { props: [{ type: 'band', from: 'feet' }], phases: PH.curl, frames: rep(
    stand({ a1: [4, 8], a2: [4, 8] }), stand({ a1: [10, 140], a2: [10, 140] }), { down: 900, up: 1400 }) },

  'tricep-pushdown': { props: [{ type: 'cable', x: 150, y: 24, rope: true }], phases: PH.ext, frames: rep(
    stand({ t: 10, n: -6, a1: [14, 100], a2: [14, 100] }), stand({ t: 10, n: -6, a1: [16, 6], a2: [16, 6] }), { down: 900, up: 1300 }) },

  'overhead-tricep': { props: [{ type: 'dumbbell', only: 1, neutral: true }], phases: PH.ext, frames: rep(
    stand({ n: 4, a1: [172, 148], a2: [172, 148] }), stand({ n: 0, a1: [174, 8], a2: [174, 8] }), { down: 900, up: 1300 }) },

  'skull-crusher': { props: [{ type: 'bench', x: 64, w: 100, y: 147 }, { type: 'barbell', r: 11 }], phases: PH.ext, frames: rep(
    { ...BENCH_LIE, a1: [80, 112], a2: [80, 112], ik: BFEET },
    { ...BENCH_LIE, a1: [82, 4], a2: [82, 4], ik: BFEET }, { down: 900, up: 1300 }) },

  'bench-dip': { props: [{ type: 'bench', x: 40, w: 70, y: 146 }], phases: PH.push, frames: rep(
    { r: [108, 141], t: 2, n: -4, ik: { h1: [104, 142], h2: [104, 142], f1: [171, ANK], f2: [167, ANK] } },
    { r: [110, 164], t: 4, n: -6, ik: { h1: [104, 142], h2: [104, 142], f1: [171, ANK], f2: [167, ANK] } }) },

  // ======================= KARIN / CORE =======================
  plank: { props: [MAT], phases: PH.hold, frames: hold(
    { t: 79, n: -8, anc: ['toe1', 52, FLOOR], a1: [79, 90], a2: [79, 90] },
    { t: 78.6, n: -8, cv: 0.06, anc: ['toe1', 52, FLOOR], a1: [78.6, 90], a2: [78.6, 90] }) },

  'side-plank': { view: 'front', props: [MAT], phases: PH.hold, frames: hold(
    { r: [120, 150], rot: 77, n: -8, anc: ['elb1', 162, 181], a1: [77, 90], a2: [100, 0], l1: [0, 0, 0], l2: [3, 0, 0] },
    { r: [120, 150], rot: 76, n: -8, anc: ['elb1', 162, 181], a1: [76, 90], a2: [104, 0], l1: [0, 0, 0], l2: [3, 0, 0] }) },

  crunch: { props: [MAT], phases: PH.crunch, frames: rep(
    SUP({ a1: [20, 0], a2: [20, 0] }),
    SUP({ t: -62, cv: 0.45, n: 22, a1: [22, 0], a2: [22, 0] }), { down: 800, up: 1100, bottom: 400 }) },

  'leg-raise': { props: [MAT], phases: ['Sırt üstü, bacaklar düz', 'Bacakları dik kaldır — nefes ver', 'Yere değmeden indir — nefes al'], frames: rep(
    { r: [124, 177], t: -90, n: 0, a1: [0, 0], a2: [0, 0], l1: [4, 0, 10], l2: [4, 0, 10] },
    { r: [124, 177], t: -90, n: 0, a1: [0, 0], a2: [0, 0], l1: [86, 0, 10], l2: [86, 0, 10] }, { down: 1000, up: 1400 }) },

  'russian-twist': { view: 'front', phases: ['Otur, gövde hafif geride', 'Sağa dön — nefes ver', 'Sola dön — nefes ver'], frames: [
    F({ r: [120, 166], t: 0, l1: [24, 0, 0], l2: [24, 0, 0], ls: [0.42, 0.42], ik: { h1: [124, 132], h2: [116, 132] }, bend: { h1: 1, h2: 1 } }, 0, 600, 200),
    F({ r: [120, 166], t: 18, l1: [24, 0, 0], l2: [24, 0, 0], ls: [0.42, 0.42], ik: { h1: [154, 152], h2: [148, 152] }, bend: { h1: 1, h2: 1 } }, 1, 650, 150),
    F({ r: [120, 166], t: -18, l1: [24, 0, 0], l2: [24, 0, 0], ls: [0.42, 0.42], ik: { h1: [92, 152], h2: [86, 152] }, bend: { h1: 1, h2: 1 } }, 2, 1000, 150),
    F({ r: [120, 166], t: 0, l1: [24, 0, 0], l2: [24, 0, 0], ls: [0.42, 0.42], ik: { h1: [124, 132], h2: [116, 132] }, bend: { h1: 1, h2: 1 } }, 0, 650, 0),
  ] },

  'bicycle-crunch': { props: [MAT], phases: ['Omuzlar hafif yukarıda', 'Sağ dizi çek, gövdeni çevir', 'Sol dizi çek, gövdeni çevir'], frames: [
    F({ r: [122, 177], t: -64, cv: 0.35, n: 20, a1: [148, 120], a2: [148, 120], l1: [100, 100, 10], l2: [26, 8, 10] }, 1, 700, 150),
    F({ r: [122, 177], t: -64, cv: 0.35, n: 20, a1: [148, 120], a2: [148, 120], l1: [26, 8, 10], l2: [100, 100, 10] }, 2, 700, 150),
  ] },

  'dead-bug': { props: [MAT], phases: ['Sırt üstü, kollar ve dizler yukarıda', 'Karşı kol ve bacağı uzat — nefes ver', 'Merkeze dön, diğer taraf'], frames: [
    F({ r: [124, 177], t: -90, a1: [90, 0], a2: [90, 0], l1: [90, 90, 10], l2: [90, 90, 10] }, 0, 900, 300),
    F({ r: [124, 177], t: -90, a1: [90, 0], a2: [172, 0], l1: [8, 0, 10], l2: [90, 90, 10] }, 1, 1100, 300),
    F({ r: [124, 177], t: -90, a1: [90, 0], a2: [90, 0], l1: [90, 90, 10], l2: [90, 90, 10] }, 2, 1000, 300),
    F({ r: [124, 177], t: -90, a1: [172, 0], a2: [90, 0], l1: [90, 90, 10], l2: [8, 0, 10] }, 1, 1100, 300),
    F({ r: [124, 177], t: -90, a1: [90, 0], a2: [90, 0], l1: [90, 90, 10], l2: [90, 90, 10] }, 2, 1000, 0),
  ] },

  'hanging-knee-raise': { props: [{ type: 'pullbar', x: 126, y: 16 }], phases: ['Bardan asıl, gövde sabit', 'Dizleri göğse çek — nefes ver', 'Kontrollü indir — nefes al'], frames: rep(
    HANG({ l1: [0, 4, 30], l2: [-2, 6, 30] }),
    HANG({ t: -8, cv: 0.25, l1: [104, 100, 20], l2: [100, 104, 20] }), { down: 900, up: 1300 }) },

  'bird-dog': { props: [MAT], phases: ['Dört ayak pozisyonu', 'Karşı kol ve bacağı uzat — nefes ver', 'Geri getir, diğer taraf'], frames: [
    F(QUAD, 0, 900, 300),
    F({ ...QUAD, a1: [178, 0], l2: [-2, 0, 60], ik: { h1: null, h2: [131, 181] } }, 1, 1000, 500),
    F(QUAD, 2, 900, 300),
    F({ ...QUAD, a2: [178, 0], l1: [-2, 0, 60], ik: { h1: [133, 181], h2: null } }, 1, 1000, 500),
    F(QUAD, 2, 900, 0),
  ] },

  'mountain-climber': { props: [MAT], phases: ['Yüksek plank', 'Sağ dizi göğse çek', 'Sol dizi göğse çek'], frames: [
    F({ ...PU_TOP, anc: ['toe2', 52, FLOOR], l1: [96, 116, 10], l2: [0, 0, 0] }, 1, 330, 60),
    F({ ...PU_TOP, anc: ['toe1', 52, FLOOR], l1: [0, 0, 0], l2: [96, 116, 10] }, 2, 330, 60),
  ] },

  // ======================= KARDİYO / HIIT =======================
  'jumping-jack': { view: 'front', phases: ['Ayaklar bitişik, kollar yanda', 'Zıpla: bacaklar açık, kollar yukarı', 'Zıpla: başlangıca dön'], frames: [
    F(FW({ a1: [6, 4], a2: [6, 4], ik: { f1: [129, ANK], f2: [111, ANK] } }), 0, 380, 120),
    F(FW({ r: [120, Y - 4], a1: [168, 6], a2: [168, 6], ik: { f1: [147, ANK], f2: [93, ANK] } }), 1, 380, 100),
    F(FW({ a1: [6, 4], a2: [6, 4], ik: { f1: [129, ANK], f2: [111, ANK] } }), 2, 380, 0),
  ] },

  burpee: { props: [MAT], phases: ['Ayakta başla', 'Çömel, elleri yere koy', 'Ayakları geri at — plank', 'Ayakları ellere çek', 'Yukarı sıçra, kollar yukarı'], frames: [
    F(stand(), 0, 500, 200),
    F({ r: [102, 150], t: 52, n: -18, ik: { ...feet(), h1: [152, 181], h2: [150, 181] } }, 1, 550, 80),
    F({ ...PU_TOP, ik: { h1: [152, 181], h2: [150, 181] } }, 2, 450, 200),
    F({ r: [102, 150], t: 52, n: -18, ik: { ...feet(), h1: [152, 181], h2: [150, 181] } }, 3, 450, 80),
    F({ r: [118, Y - 16], t: -2, a1: [172, 8], a2: [172, 8], l1: [0, 4, 40], l2: [0, 4, 40] }, 4, 420, 80, 'out'),
    F(stand(), 0, 380, 0, 'in'),
  ] },

  'high-knees': { phases: ['Yerinde koşuya hazırlan', 'Sağ diz kalça hizasına', 'Sol diz kalça hizasına'], frames: [
    F({ r: [118, Y - 2], t: -2, a1: [50, 90], a2: [-30, 90], l1: [92, 92, 20], l2: [0, 4, 10] }, 1, 300, 30),
    F({ r: [118, Y - 2], t: -2, a1: [-30, 90], a2: [50, 90], l1: [0, 4, 10], l2: [92, 92, 20] }, 2, 300, 30),
  ] },

  'butt-kicks': { phases: ['Yerinde koşuya hazırlan', 'Sağ topuk kalçaya', 'Sol topuk kalçaya'], frames: [
    F({ r: [118, Y - 1], t: 4, a1: [-30, 90], a2: [40, 90], l1: [-8, 128, 30], l2: [2, 4, 10] }, 1, 280, 30),
    F({ r: [118, Y - 1], t: 4, a1: [40, 90], a2: [-30, 90], l1: [2, 4, 10], l2: [-8, 128, 30] }, 2, 280, 30),
  ] },

  'jump-squat': { phases: ['Ayakta başla', 'Çömel — nefes al', 'Patlayıcı sıçra — nefes ver', 'Yumuşak iniş'], frames: [
    F(stand({ a1: [20, 20], a2: [20, 20] }), 0, 500, 200),
    F({ r: [96, 140], t: 40, n: -20, a1: [-30, 20], a2: [-30, 20], ik: feet() }, 1, 800, 80),
    F({ r: [119, Y - 18], t: -2, a1: [150, 10], a2: [150, 10], l1: [0, 2, 40], l2: [0, 2, 40] }, 2, 380, 100, 'out'),
    F({ r: [104, 128], t: 24, n: -10, a1: [40, 20], a2: [40, 20], ik: feet() }, 3, 380, 150, 'in'),
    F(stand({ a1: [20, 20], a2: [20, 20] }), 0, 600, 0),
  ] },

  'skater-jump': { view: 'front', phases: ['Tek bacak üstünde dengede', 'Yana sıçra', 'Diğer bacağa yumuşak in'], frames: [
    F({ r: [146, 130], t: -6, a1: [20, 10], a2: [70, 20], l1: [4, 0, 0], l2: [-26, 0, 0], ls: [1, 0.75], ik: { f1: [150, ANK] } }, 2, 500, 150),
    F({ r: [120, 104], t: 0, a1: [40, 10], a2: [40, 10], l1: [10, 0, 0], l2: [10, 0, 0] }, 1, 330, 0, 'out'),
    F({ r: [94, 130], t: 6, a1: [70, 20], a2: [20, 10], l1: [-26, 0, 0], l2: [4, 0, 0], ls: [1, 0.75], ik: { f2: [90, ANK] } }, 2, 330, 150, 'in'),
    F({ r: [120, 104], t: 0, a1: [40, 10], a2: [40, 10], l1: [10, 0, 0], l2: [10, 0, 0] }, 1, 330, 0, 'out'),
  ] },

  'jump-rope': { cut: true, props: [{ type: 'rope' }], phases: ['Hafif sıçra, ip ayak altından geçer', 'Bileklerle ipi çevir', 'Parmak ucuna yumuşak in'], frames: [
    F({ r: [118, Y - 7], t: 0, a1: [22, 64], a2: [22, 64], l1: [0, 4, 35], l2: [0, 4, 35], rp: 0 }, 0, 280, 0, 'lin'),
    F({ r: [118, Y], t: 0, a1: [22, 64], a2: [22, 64], ik: { f1: [121, ANK - 5], f2: [117, ANK - 5] }, fa: { f1: 60, f2: 60 }, rp: 180 }, 1, 280, 0, 'lin'),
    F({ r: [118, Y - 7], t: 0, a1: [22, 64], a2: [22, 64], l1: [0, 4, 35], l2: [0, 4, 35], rp: 360 }, 2, 280, 0, 'lin'),
  ] },

  'box-jump': { cut: true, props: [{ type: 'box', x: 140, w: 50, h: 40 }], phases: ['Kutunun önünde dur', 'Kolları geri sal, çömel', 'Sıçra, dizleri çek', 'Kutuya yumuşak in, dikleş'], frames: [
    F(stand({ r: [96, Y], ik: feet(99, 95) }), 0, 1, 400),
    F({ r: [76, 140], t: 44, n: -20, a1: [-50, 10], a2: [-50, 10], ik: feet(99, 95) }, 1, 700, 100),
    F({ r: [126, 82], t: 20, a1: [130, 10], a2: [130, 10], l1: [100, 110, 20], l2: [100, 110, 20] }, 2, 400, 0, 'out'),
    F({ r: [152, 112], t: 30, n: -14, a1: [60, 20], a2: [60, 20], ik: { f1: [166, 142], f2: [162, 142] } }, 3, 380, 200, 'in'),
    F({ r: [162, 73], t: 0, a1: [6, 12], a2: [-4, 12], ik: { f1: [166, 142], f2: [162, 142] } }, 3, 700, 600),
  ] },

  'shadow-boxing': { phases: ['Gard pozisyonu', 'Sol direkt (jab)', 'Sağ düz (kroşe)'], frames: [
    F({ r: [114, Y + 4], t: 6, n: -4, a1: [40, 135], a2: [44, 135], ik: { f1: [138, ANK], f2: [98, ANK] } }, 0, 220, 200),
    F({ r: [116, Y + 4], t: 10, n: -4, a1: [92, 4], a2: [44, 135], ik: { f1: [138, ANK], f2: [98, ANK] } }, 1, 200, 80, 'out'),
    F({ r: [114, Y + 4], t: 6, n: -4, a1: [40, 135], a2: [44, 135], ik: { f1: [138, ANK], f2: [98, ANK] } }, 0, 200, 120),
    F({ r: [118, Y + 4], t: 14, n: -4, a1: [40, 135], a2: [94, 4], ik: { f1: [138, ANK], f2: [98, ANK] } }, 2, 220, 80, 'out'),
    F({ r: [114, Y + 4], t: 6, n: -4, a1: [40, 135], a2: [44, 135], ik: { f1: [138, ANK], f2: [98, ANK] } }, 0, 220, 0),
  ] },

  rower: { props: [{ type: 'rower' }, { type: 'path', d: `M154 ${FLOOR - 14}L160 ${FLOOR - 38}`, cls: 'eq-pad' }], phases: ['Hazırlık — dizler bükük, kollar uzun', 'Bacaklarla it, sonra kolları çek — nefes ver', 'Kollar, gövde, bacaklar sırayla dön — nefes al'], frames: rep(
    { r: [100, 165], t: 26, n: -6, ik: { h1: [152, 146], h2: [152, 146], f1: [150, 160], f2: [147, 160] }, fa: { f1: 150, f2: 150 } },
    { r: [80, 165], t: -22, n: 4, ik: { h1: [96, 130], h2: [96, 130], f1: [150, 160], f2: [147, 160] }, fa: { f1: 150, f2: 150 } }, { down: 800, up: 1300, top: 150, bottom: 150 }) },

  // ======================= ESNEME / MOBİLİTE =======================
  'cat-cow': { props: [MAT], phases: ['Dört ayak pozisyonu', 'Deve: belini çukurlaştır, başı kaldır — nefes al', 'Kedi: sırtını yuvarla, çeneyi indir — nefes ver'], frames: [
    F(QUAD, 0, 900, 200),
    F({ ...QUAD, cv: -0.55, n: -36 }, 1, 1400, 500),
    F({ ...QUAD, cv: 0.75, n: 36 }, 2, 1600, 500),
    F(QUAD, 0, 1200, 0),
  ] },

  'hamstring-stretch': { phases: PH.stretch, frames: [
    F(stand({ a1: [0, 6], a2: [0, 6] }), 0, 1100, 400),
    F({ r: [108, Y + 1], t: 112, n: 24, cv: 0.2, a1: [112, 4], a2: [112, 4], ik: feet(121, 117) }, 1, 1800, 400),
    F({ r: [107, Y + 2], t: 118, n: 26, cv: 0.24, a1: [118, 4], a2: [118, 4], ik: feet(121, 117) }, 2, 1600, 900),
    F(stand({ a1: [0, 6], a2: [0, 6] }), 0, 1600, 0),
  ] },

  'hip-flexor-stretch': { props: [MAT], phases: PH.stretch, frames: [
    F({ r: [112, 140], t: 0, a1: [10, 20], a2: [-10, 20], ik: { f1: [150, ANK], f2: [72, 180] }, fa: { f2: -90 } }, 0, 1000, 400),
    F({ r: [122, 146], t: -6, n: -4, a1: [174, 6], a2: [172, 6], ik: { f1: [150, ANK], f2: [72, 180] }, fa: { f2: -90 } }, 1, 1800, 400),
    F({ r: [124, 147], t: -10, n: -6, a1: [178, 6], a2: [176, 6], ik: { f1: [150, ANK], f2: [72, 180] }, fa: { f2: -90 } }, 2, 1400, 900),
    F({ r: [112, 140], t: 0, a1: [10, 20], a2: [-10, 20], ik: { f1: [150, ANK], f2: [72, 180] }, fa: { f2: -90 } }, 0, 1600, 0),
  ] },

  'childs-pose': { props: [MAT], phases: ['Dört ayak pozisyonu', 'Kalçayı topuklara götür — nefes ver', 'Kolları uzat ve gevşe — derin nefes'], frames: [
    F(QUAD, 0, 1000, 300),
    F({ r: [98, 166], t: 96, n: 6, cv: 0.35, l1: [160, 160, 90], l2: [160, 160, 90], ik: { h1: [180, 180], h2: [178, 180] } }, 1, 1800, 400),
    F({ r: [97, 167], t: 98, n: 8, cv: 0.4, l1: [160, 160, 90], l2: [160, 160, 90], ik: { h1: [182, 180], h2: [180, 180] } }, 2, 1500, 1000),
    F(QUAD, 0, 1600, 0),
  ] },

  cobra: { props: [MAT], phases: ['Yüzüstü, eller omuz altında', 'Göğsü kaldır, kolları uzat — nefes al', 'Yavaşça in — nefes ver'], frames: rep(
    { r: [100, 177], t: 90, n: 0, l1: [0, 0, 70], l2: [0, 0, 70], ik: { h1: [140, 181], h2: [138, 181] } },
    { r: [100, 177], t: 58, n: -14, cv: -0.45, l1: [-32, 0, 70], l2: [-32, 0, 70], ik: { h1: [140, 181], h2: [138, 181] } }, { down: 1600, up: 1400, bottom: 900 }) },

  'down-dog': { props: [MAT], phases: ['Yüksek plank', 'Kalçayı yukarı ve geriye it — nefes ver', 'Topukları yere doğru bastır — derin nefes'], frames: [
    F({ ...PU_TOP, anc: ['toe1', 60, FLOOR], ik: { h1: [152, 181], h2: [150, 181] } }, 0, 1000, 400),
    F({ t: 118, n: 10, anc: ['toe1', 60, FLOOR], l1: [96, 0, -16], l2: [96, 0, -16], ik: { h1: [152, 181], h2: [150, 181] } }, 1, 1700, 400),
    F({ t: 120, n: 12, anc: ['toe1', 60, FLOOR], l1: [96, 0, -22], l2: [96, 0, -22], ik: { h1: [152, 181], h2: [150, 181] } }, 2, 1200, 900),
    F({ ...PU_TOP, anc: ['toe1', 60, FLOOR], ik: { h1: [152, 181], h2: [150, 181] } }, 0, 1600, 0),
  ] },

  'arm-circles': { cut: true, phases: ['Kollar yanda', 'Öne ve yukarı çevir', 'Geriye ve aşağı tamamla'], frames: [
    F(stand({ a1: [0, 0], a2: [180, 0] }), 0, 400, 0, 'lin'),
    F(stand({ a1: [90, 0], a2: [270, 0] }), 1, 450, 0, 'lin'),
    F(stand({ a1: [180, 0], a2: [360, 0] }), 1, 450, 0, 'lin'),
    F(stand({ a1: [270, 0], a2: [450, 0] }), 2, 450, 0, 'lin'),
    F(stand({ a1: [360, 0], a2: [540, 0] }), 2, 450, 0, 'lin'),
  ] },

  'quad-stretch': { phases: PH.stretch, frames: [
    F(stand(), 0, 900, 400),
    F({ r: [118, Y], t: 2, a1: [-22, 0], a2: [80, 10], l1: [-10, 150, 30], ik: { f2: [119, ANK] } }, 1, 1400, 400),
    F({ r: [118, Y], t: 2, a1: [-24, 0], a2: [82, 10], l1: [-16, 152, 30], ik: { f2: [119, ANK] } }, 2, 1200, 1000),
    F(stand(), 0, 1300, 0),
  ] },

  'shoulder-stretch': { view: 'front', phases: PH.stretch, frames: [
    F(FW(), 0, 900, 400),
    F(FW({ a1: [-80, 0], a2: [30, -150] }), 1, 1400, 400),
    F(FW({ a1: [-88, 0], a2: [34, -152] }), 2, 1200, 1000),
    F(FW(), 0, 1300, 0),
  ] },

};
