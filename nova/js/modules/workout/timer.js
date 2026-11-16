// Aralık sayacı: Tabata (20/10), EMOM, özel çalış/dinlen/tur. Ev antrenmanları için.
import { h, icon, fmt, mount, backButton, toast, svg, confirmDialog, haptic, uid } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { update, load, save, dateKey } from '../../core/store.js';
import { kcalFromMET } from '../../core/profile.js';
import { awardXP } from '../../core/xp.js';
import { figure } from './figure.js';
import { EXERCISES, EX } from './exercises.js';
import { beep, alertEnd, unlockAudio } from './kit.js';
import { K } from './data.js';

const PRESETS = [
  { id: 'tabata', label: 'Tabata', work: 20, rest: 10, rounds: 8, desc: '20 sn çalış, 10 sn dinlen, 8 tur (4 dk)' },
  { id: 'emom', label: 'EMOM', work: 60, rest: 0, rounds: 10, desc: 'Her dakikanın başında hareketi yap, kalan sürede dinlen' },
  { id: 'hiit', label: '40/20', work: 40, rest: 20, rounds: 10, desc: '40 sn çalış, 20 sn dinlen, 10 tur' },
  { id: 'custom', label: 'Özel', work: 30, rest: 15, rounds: 6, desc: 'Süreleri kendin belirle' },
];
const CARDIO = ['jumping-jack', 'mountain-climber', 'burpee', 'high-knees', 'jump-squat', 'butt-kicks', 'skater-jump', 'squat', 'pushup', 'plank', 'shadow-boxing', 'jump-rope', 'reverse-lunge', 'bicycle-crunch'];

function ringEl(size, stroke) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const val = svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': c, class: 'wk-tring-v' });
  const el = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'wk-ring' }, svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(255,255,255,.1)', 'stroke-width': stroke }), val);
  return { el, set: p => val.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, p))))) };
}

export function renderTimer(el) {
  const cfg = { preset: 'tabata', work: 20, rest: 10, rounds: 8, ex: 'mix', ...load('workout.timer', {}) };
  let run = null, iv = 0;

  function setup() {
    const p = PRESETS.find(x => x.id === cfg.preset) || PRESETS[0];
    const field = (label, key, min, max, step, unit) => h('label', { class: 'wk-num big' }, h('span', null, label),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': `${label} azalt`, onClick: () => { cfg[key] = Math.max(min, cfg[key] - step); cfg.preset = 'custom'; setup(); } }, '−'),
        h('input', { type: 'number', inputmode: 'numeric', value: cfg[key], min, max, step, 'aria-label': label, onChange: e => { cfg[key] = Math.max(min, Math.min(max, Math.round(+e.target.value || min))); cfg.preset = 'custom'; setup(); } }),
        h('button', { type: 'button', 'aria-label': `${label} artır`, onClick: () => { cfg[key] = Math.min(max, cfg[key] + step); cfg.preset = 'custom'; setup(); } }, '+')),
      h('small', { class: 'muted' }, unit));
    const total = cfg.rounds * (cfg.work + cfg.rest) - cfg.rest;
    const sel = h('select', { class: 'select', 'aria-label': 'Hareket', onChange: e => { cfg.ex = e.target.value; } },
      h('option', { value: 'mix', selected: cfg.ex === 'mix' }, 'Karışık (her tur farklı hareket)'),
      CARDIO.map(id => h('option', { value: id, selected: cfg.ex === id }, EX[id].name)));
    mount(el,
      backButton('workout'),
      h('h1', { class: 'hud-title' }, 'Aralık sayacı'),
      h('p', { class: 'hud-sub' }, 'Çalışma ve dinlenme sürelerini sesli uyarılarla takip et.'),
      h('div', { class: 'chips' }, PRESETS.map(x => h('button', { type: 'button', class: 'chip' + (cfg.preset === x.id ? ' active' : ''), 'aria-pressed': String(cfg.preset === x.id),
        onClick: () => { cfg.preset = x.id; if (x.id !== 'custom') Object.assign(cfg, { work: x.work, rest: x.rest, rounds: x.rounds }); setup(); } }, x.label))),
      h('p', { class: 'small muted' }, p.desc),
      h('div', { class: 'panel' },
        h('div', { class: 'wk-tfields' },
          field('Çalışma', 'work', 5, 600, 5, 'saniye'),
          field('Dinlenme', 'rest', 0, 300, 5, 'saniye'),
          field('Tur', 'rounds', 1, 50, 1, 'tur')),
        h('label', { class: 'field', style: 'margin:14px 0 0' }, h('span', null, 'Hareket'), sel)),
      h('div', { class: 'info-strip wk-strip' },
        h('div', null, h('div', { class: 'is-label' }, icon('clock'), 'Toplam süre'), h('div', { class: 'is-value' }, fmt.duration(total + 5))),
        h('div', null, h('div', { class: 'is-label' }, icon('flame'), 'Tahmini'), h('div', { class: 'is-value' }, `${kcalFromMET(8, (cfg.rounds * cfg.work) / 60)} kcal`))),
      h('button', { class: 'btn primary block lg', type: 'button', onClick: start }, icon('play'), 'Başlat'));
  }

  function exFor(round) {
    if (cfg.ex !== 'mix') return cfg.ex;
    return CARDIO[(round - 1) % CARDIO.length];
  }

  function start() {
    unlockAudio();
    save('workout.timer', { preset: cfg.preset, work: cfg.work, rest: cfg.rest, rounds: cfg.rounds, ex: cfg.ex });
    document.body.classList.add('wk-live');
    const ring = ringEl(240, 12);
    const big = h('div', { class: 'wk-ov-time' }), lab = h('div', { class: 'wk-ov-lab' });
    const roundEl = h('div', { class: 'wk-t-round' });
    const figBox = h('div', { class: 'wk-t-fig' });
    const exName = h('div', { class: 'wk-t-ex' });
    const pauseBtn = h('button', { class: 'btn lg grow', type: 'button', onClick: () => (run.paused ? resume() : pause()) }, icon('pause'), 'Duraklat');
    run = { startTs: Date.now(), t0: Date.now(), paused: false, pausedAt: 0, phaseKey: '', fig: null, figId: null, workDone: 0, lastBeep: -1 };
    const wrap = h('div', { class: 'wk-tview' },
      h('div', { class: 'row between' }, roundEl, h('button', { class: 'btn sm ghost', type: 'button', onClick: stopAsk }, icon('x'), 'Bitir')),
      h('div', { class: 'wk-ov-ring' }, ring.el, h('div', { class: 'wk-ov-center' }, big, lab)),
      exName, figBox,
      h('div', { class: 'row' }, pauseBtn));
    mount(el, wrap);
    const prep = 5;
    const cycle = cfg.work + cfg.rest;
    function pause() { run.paused = true; run.pausedAt = Date.now(); pauseBtn.replaceChildren(icon('play'), 'Devam'); }
    function resume() { run.t0 += Date.now() - run.pausedAt; run.paused = false; pauseBtn.replaceChildren(icon('pause'), 'Duraklat'); }
    function showEx(id) {
      if (run.figId === id) return;
      run.fig?.destroy(); run.figId = id;
      run.fig = figure(EX[id].anim, { mode: 'md', muscles: EX[id].muscles });
      mount(figBox, run.fig.el); exName.textContent = EX[id].name;
    }
    run.tick = () => {
      if (run.paused) return;
      const t = (Date.now() - run.t0) / 1000;
      let phase, left, len, round;
      if (t < prep) { phase = 'prep'; left = prep - t; len = prep; round = 1; }
      else {
        const tt = t - prep;
        round = Math.floor(tt / cycle) + 1;
        const inC = tt - (round - 1) * cycle;
        if (round > cfg.rounds || (round === cfg.rounds && inC >= cfg.work)) return done(true);
        if (inC < cfg.work) { phase = 'work'; left = cfg.work - inC; len = cfg.work; } else { phase = 'rest'; left = cycle - inC; len = cfg.rest; }
      }
      const key = phase + round;
      if (key !== run.phaseKey) {
        run.phaseKey = key; run.lastBeep = -1;
        wrap.dataset.phase = phase;
        if (phase === 'work') { beep({ freq: 1046, ms: 260 }); haptic(120); }
        else if (phase === 'rest') { beep({ freq: 523, ms: 260 }); haptic([60, 60, 60]); run.workDone = round; }
        showEx(exFor(phase === 'rest' ? Math.min(cfg.rounds, round + 1) : round));
      }
      const n = Math.ceil(left);
      if (n <= 3 && n !== run.lastBeep && n > 0) { run.lastBeep = n; beep({ freq: 760, ms: 80 }); }
      big.textContent = fmt.duration(n);
      lab.textContent = phase === 'prep' ? 'Hazırlan' : phase === 'work' ? 'Çalış' : 'Dinlen';
      roundEl.textContent = `Tur ${Math.min(round, cfg.rounds)} / ${cfg.rounds}`;
      ring.set(left / len);
    };
    run.tick();
    iv = setInterval(() => run?.tick(), 200);
  }

  async function stopAsk() {
    if (!run) return;
    const wasPaused = run.paused;
    if (!wasPaused) { run.paused = true; run.pausedAt = Date.now(); }
    const ok = await confirmDialog('Sayacı şimdi bitirmek istiyor musun? Tamamlanan turlar kaydedilebilir.', { title: 'Sayacı bitir', okLabel: 'Bitir', cancelLabel: 'Devam et' });
    if (!run) return;
    if (ok) done(false);
    else if (!wasPaused) { run.t0 += Date.now() - run.pausedAt; run.paused = false; }
  }

  function done(complete) {
    clearInterval(iv);
    const rounds = complete ? cfg.rounds : run.workDone;
    run.fig?.destroy();
    const startTs = run.startTs;
    run = null;
    document.body.classList.remove('wk-live');
    if (complete) alertEnd();
    const secs = rounds * cfg.work;
    mount(el,
      backButton('workout'),
      h('section', { class: 'panel hero wk-done-hero' }, h('div', { class: 'wk-done-ic' }, icon(complete ? 'trophy' : 'timer')),
        h('h1', { class: 'hud-title' }, complete ? 'Harika iş!' : 'Sayaç durduruldu'),
        h('p', { class: 'muted', style: 'margin:0' }, `${rounds} tur · ${fmt.duration(secs)} çalışma`)),
      rounds ? h('button', { class: 'btn primary block lg', type: 'button', onClick: () => {
        const endTs = Date.now();
        const byEx = {};
        for (let r = 1; r <= rounds; r++) { const id = exFor(r); (byEx[id] ||= []).push({ kg: 0, reps: 0, sec: cfg.work, done: true }); }
        const mins = Math.max(1, Math.round((endTs - startTs) / 60000));
        const s = { id: uid(), date: dateKey(new Date(startTs)), startTs, endTs, location: 'home', programId: null, name: `Aralık sayacı · ${cfg.work}/${cfg.rest}`,
          exercises: Object.entries(byEx).map(([exId, sets]) => ({ exId, sets })), volumeKg: 0, kcal: kcalFromMET(8, mins) };
        update(K.sessions, l => [...(l || []), s].sort((a, b) => a.startTs - b.startTs), []);
        awardXP(15 + Math.min(30, rounds * 2), 'Aralık antrenmanı', { once: 'workout-' + s.id });
        toast('Antrenman geçmişe kaydedildi', { type: 'success' });
        go('workout/log/' + s.id);
      } }, icon('check'), 'Geçmişe kaydet') : null,
      h('button', { class: 'btn block', type: 'button', onClick: setup }, icon('repeat'), 'Yeniden ayarla'));
  }

  setup();
  return () => { clearInterval(iv); run?.fig?.destroy(); run = null; document.body.classList.remove('wk-live'); };
}
