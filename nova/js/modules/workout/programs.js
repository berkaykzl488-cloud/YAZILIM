// Hazır antrenman programları. Her gün: [{ id, sets, reps | sec, rest }]
const r = (id, sets, reps, rest = 60) => ({ id, sets, reps, rest });
const s = (id, sets, sec, rest = 30) => ({ id, sets, sec, rest });

export const PROGRAMS = [
  // ---------------- EV ----------------
  { id: 'home-full-beginner', loc: 'home', lvl: 1, name: 'Ev · Tam Vücut Başlangıç', short: 'Tam Vücut Başlangıç', icon: 'home', tone: 'orange',
    desc: 'Ekipman gerektirmeyen, haftada 3 gün yapılan tüm vücut programı. Yeni başlayanlar için.', perWeek: 3, mins: 30,
    days: [
      { name: 'A günü', ex: [r('squat', 3, 12), r('knee-pushup', 3, 10), r('glute-bridge', 3, 15, 45), r('inverted-row', 3, 8), s('plank', 3, 30), s('jumping-jack', 2, 40, 20)] },
      { name: 'B günü', ex: [r('reverse-lunge', 3, 10), r('incline-pushup', 3, 12), r('superman', 3, 12, 45), r('dead-bug', 3, 10, 30), r('donkey-kick', 2, 15, 30), s('wall-sit', 2, 30, 45)] },
      { name: 'C günü', ex: [r('sumo-squat', 3, 12), r('pushup', 3, 8, 75), r('bench-dip', 3, 10, 60), r('bird-dog', 3, 10, 30), s('side-plank', 2, 20), s('high-knees', 2, 30)] },
    ] },
  { id: 'home-hiit-20', loc: 'home', lvl: 2, name: 'Ev · 20 dk HIIT Yakıcı', short: '20 dk HIIT Yakıcı', icon: 'flame', tone: 'red',
    desc: '40 saniye çalış, 20 saniye dinlen. Kısa sürede çok kalori yakan yüksek tempolu antrenman.', perWeek: 3, mins: 20,
    days: [
      { name: 'Tur 1', ex: [s('jumping-jack', 2, 40, 20), s('mountain-climber', 2, 40, 20), r('jump-squat', 2, 12, 20), r('burpee', 2, 8, 20), s('high-knees', 2, 40, 20), r('skater-jump', 2, 16, 20)] },
      { name: 'Tur 2', ex: [s('butt-kicks', 2, 40, 20), r('pushup', 2, 10, 20), r('reverse-lunge', 2, 12, 20), s('shadow-boxing', 2, 40, 20), r('bicycle-crunch', 2, 20, 20), s('plank', 2, 40, 20)] },
    ] },
  { id: 'home-db-strength', loc: 'home', lvl: 2, name: 'Ev · Dambıl Güç', short: 'Dambıl Güç', icon: 'dumbbell', tone: 'violet',
    desc: 'Bir çift dambıl ve sehpa/sandalye ile evde kas kazanmak için 4 günlük üst-alt program.', perWeek: 4, mins: 45,
    days: [
      { name: 'Üst vücut', ex: [r('db-bench', 4, 10, 90), r('db-row', 4, 10, 75), r('db-shoulder-press', 3, 10, 75), r('db-curl', 3, 12, 45), r('overhead-tricep', 3, 12, 45), r('lateral-raise', 3, 12, 45)] },
      { name: 'Alt vücut', ex: [r('goblet-squat', 4, 12, 90), r('rdl', 4, 10, 90), r('bulgarian-split-squat', 3, 10, 75), r('glute-bridge', 3, 15, 45), r('calf-raise', 3, 20, 45), s('plank', 3, 40)] },
    ] },
  { id: 'home-core', loc: 'home', lvl: 1, name: 'Ev · Core & Karın', short: 'Core & Karın', icon: 'target', tone: 'teal',
    desc: 'Karın, yan karın ve bel kaslarını güçlendiren kısa program. Her gün yapılabilir.', perWeek: 4, mins: 15,
    days: [
      { name: 'Karın', ex: [r('crunch', 3, 15, 30), r('leg-raise', 3, 12, 30), r('russian-twist', 3, 20, 30), s('plank', 3, 40), s('side-plank', 2, 30), r('dead-bug', 2, 10, 30)] },
      { name: 'Denge ve bel', ex: [r('bird-dog', 3, 10, 30), r('superman', 3, 12, 30), r('bicycle-crunch', 3, 20, 30), s('mountain-climber', 3, 30), r('glute-bridge', 3, 15, 30), s('childs-pose', 1, 40, 10)] },
    ] },
  { id: 'home-mobility', loc: 'home', lvl: 1, name: 'Ev · Esneme ve Rahatlama', short: 'Esneme ve Rahatlama', icon: 'wind', tone: 'green',
    desc: 'Uzun oturmanın gerginliğini alan 12 dakikalık esneme akışı.', perWeek: 5, mins: 12,
    days: [
      { name: 'Esneme akışı', ex: [s('arm-circles', 1, 30, 10), r('cat-cow', 2, 10, 15), s('down-dog', 2, 30, 10), s('cobra', 2, 20, 10), s('hip-flexor-stretch', 2, 30, 10), s('hamstring-stretch', 2, 30, 10), s('quad-stretch', 2, 30, 10), s('childs-pose', 1, 40, 10)] },
    ] },

  // ---------------- SALON ----------------
  { id: 'gym-ppl', loc: 'gym', lvl: 2, name: 'Salon · Push/Pull/Legs', short: 'Push / Pull / Legs', icon: 'gym', tone: 'orange',
    desc: 'İtme, çekme ve bacak günlerinden oluşan klasik kas kazanım programı. Haftada 3 veya 6 gün.', perWeek: 6, mins: 60,
    days: [
      { name: 'Push (itme)', ex: [r('bb-bench', 4, 8, 120), r('incline-db-press', 3, 10, 90), r('ohp', 3, 8, 120), r('lateral-raise', 3, 12, 45), r('cable-crossover', 3, 12, 60), r('tricep-pushdown', 3, 12, 45)] },
      { name: 'Pull (çekme)', ex: [r('deadlift', 3, 5, 150), r('pullup', 3, 8, 120), r('bb-row', 3, 8, 90), r('face-pull', 3, 15, 45), r('bb-curl', 3, 10, 60), r('hammer-curl', 3, 12, 45)] },
      { name: 'Legs (bacak)', ex: [r('bb-back-squat', 4, 8, 150), r('rdl', 3, 10, 90), r('leg-press', 3, 12, 90), r('leg-curl', 3, 12, 60), r('calf-raise', 4, 15, 45), r('hanging-knee-raise', 3, 12, 60)] },
    ] },
  { id: 'gym-upper-lower', loc: 'gym', lvl: 2, name: 'Salon · Üst/Alt Vücut', short: 'Üst / Alt Vücut', icon: 'layers', tone: 'blue',
    desc: 'Haftada 4 gün: iki üst vücut, iki alt vücut günü. Dengeli güç ve kas gelişimi.', perWeek: 4, mins: 55,
    days: [
      { name: 'Üst A', ex: [r('bb-bench', 4, 6, 120), r('bb-row', 4, 8, 90), r('db-shoulder-press', 3, 10, 75), r('lat-pulldown', 3, 10, 75), r('skull-crusher', 3, 10, 60), r('db-curl', 3, 12, 45)] },
      { name: 'Alt A', ex: [r('bb-back-squat', 4, 6, 150), r('rdl', 3, 8, 120), r('bulgarian-split-squat', 3, 10, 75), r('leg-extension', 3, 12, 60), r('calf-raise', 4, 15, 45), s('plank', 3, 45)] },
      { name: 'Üst B', ex: [r('incline-db-press', 4, 10, 90), r('seated-cable-row', 4, 10, 75), r('chest-dip', 3, 10, 90), r('face-pull', 3, 15, 45), r('lateral-raise', 3, 15, 45), r('tricep-pushdown', 3, 12, 45)] },
      { name: 'Alt B', ex: [r('deadlift', 3, 5, 150), r('leg-press', 4, 12, 90), r('hip-thrust', 3, 10, 90), r('leg-curl', 3, 12, 60), r('cable-kickback', 3, 12, 45), r('hanging-knee-raise', 3, 12, 60)] },
    ] },
  { id: 'gym-5x5', loc: 'gym', lvl: 3, name: 'Salon · 5×5 Güç', short: '5×5 Güç', icon: 'trophy', tone: 'red',
    desc: 'Temel halter hareketleriyle 5 set × 5 tekrar. Her antrenmanda ağırlığı biraz artır.', perWeek: 3, mins: 50,
    days: [
      { name: 'A günü', ex: [r('bb-back-squat', 5, 5, 180), r('bb-bench', 5, 5, 180), r('bb-row', 5, 5, 150)] },
      { name: 'B günü', ex: [r('bb-back-squat', 5, 5, 180), r('ohp', 5, 5, 180), r('deadlift', 1, 5, 180)] },
    ] },
  { id: 'gym-full-beginner', loc: 'gym', lvl: 1, name: 'Salon · Başlangıç Tam Vücut', short: 'Başlangıç Tam Vücut', icon: 'star', tone: 'green',
    desc: 'Salona yeni başlayanlar için makine ağırlıklı, güvenli tam vücut programı. Haftada 3 gün.', perWeek: 3, mins: 45,
    days: [
      { name: 'A günü', ex: [r('leg-press', 3, 12, 90), r('machine-chest-press', 3, 12, 75), r('lat-pulldown', 3, 12, 75), r('db-shoulder-press', 2, 12, 60), r('leg-curl', 2, 12, 60), s('plank', 3, 30)] },
      { name: 'B günü', ex: [r('goblet-squat', 3, 12, 75), r('db-bench', 3, 10, 75), r('seated-cable-row', 3, 12, 75), r('lateral-raise', 2, 15, 45), r('back-extension', 2, 12, 60), r('tricep-pushdown', 2, 12, 45)] },
    ] },
];

export const PROG = Object.fromEntries(PROGRAMS.map(p => [p.id, p]));
