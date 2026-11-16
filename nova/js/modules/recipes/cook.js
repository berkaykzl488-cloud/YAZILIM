// Pişirme modu: tam ekran, her ekranda tek adım, otomatik zamanlayıcılar, ekran açık kalır.
import { h, icon, mount, fmt, toast, modal, confirmDialog, haptic } from '../../core/ui.js';
import { todayKey } from '../../core/store.js';
import { awardXP } from '../../core/xp.js';
import { qtyText, portionsOf, portionText, tint } from './util.js';
import { openAddToMeal } from './sheets.js';
import { nav } from './nav.js';

/** Adım metnindeki süreleri bulur: "10 dakika", "20 dk", "30 saniye", "8-10 dakika" */
export function parseTimers(text) {
  const out = [];
  const re = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(dakika|dk|saniye|sn|saat)(?![a-zçğıöşü])/gi;
  let m;
  while ((m = re.exec(text))) {
    const a = parseFloat(m[1].replace(',', '.'));
    const unit = m[3].toLocaleLowerCase('tr');
    const mult = unit === 'saat' ? 3600 : unit === 'saniye' || unit === 'sn' ? 1 : 60;
    const sec = Math.round(a * mult);
    if (sec < 5 || sec > 3 * 3600) continue; // "6 saat bekletin" gibi uzun beklemeler için zamanlayıcı yok
    const label = m[2] ? `${m[1]}-${m[2]} ${unit === 'dakika' ? 'dk' : unit}` : `${m[1]} ${unit === 'dakika' ? 'dk' : unit}`;
    out.push({ sec, label });
  }
  return out;
}

let audioCtx = null;
function primeAudio() {
  try { audioCtx ||= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume?.(); } catch { /* yok */ }
}
function beep() {
  try {
    primeAudio();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.32);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + i * 0.32 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.32 + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + i * 0.32); o.stop(t0 + i * 0.32 + 0.25);
    }
  } catch { /* ses yok */ }
}

export function renderCook(el, r) {
  const portions = portionsOf(r);
  const factor = portions / r.servings;
  const n = r.steps.length;
  let idx = 0;
  let finished = false;

  // ---------- Zamanlayıcılar ----------
  const timers = new Map(); // anahtar -> { step, label, total, remaining, endAt, done }
  r.steps.forEach((s, i) => parseTimers(s).forEach((t, j) => timers.set(`${i}-${j}`, { step: i, label: t.label, total: t.sec, remaining: t.sec, endAt: null, done: false })));
  const left = t => (t.endAt ? Math.max(0, (t.endAt - Date.now()) / 1000) : t.remaining);
  const running = () => [...timers.values()].filter(t => t.endAt && !t.done);
  const tick = setInterval(() => {
    for (const [, t] of timers) {
      if (t.endAt && !t.done && Date.now() >= t.endAt) {
        t.done = true; t.endAt = null; t.remaining = 0;
        haptic([400, 150, 400, 150, 400]);
        beep();
        toast(`Süre doldu · ${t.step + 1}. adım (${t.label})`, { type: 'success', ms: 5000 });
        paint();
      }
    }
    overlay.querySelectorAll('[data-tleft]').forEach(n => {
      const t = timers.get(n.dataset.tleft);
      if (t) n.textContent = fmt.duration(Math.ceil(left(t)));
    });
    overlay.querySelectorAll('[data-tprog]').forEach(n => {
      const t = timers.get(n.dataset.tprog);
      if (t) n.style.width = (100 - (left(t) / t.total) * 100) + '%';
    });
  }, 250);

  function toggleTimer(key) {
    const t = timers.get(key);
    primeAudio();
    haptic(10);
    if (t.done) { t.done = false; t.remaining = t.total; t.endAt = Date.now() + t.total * 1000; }
    else if (t.endAt) { t.remaining = left(t); t.endAt = null; }
    else t.endAt = Date.now() + t.remaining * 1000;
    paint();
  }
  function resetTimer(key) {
    const t = timers.get(key);
    t.endAt = null; t.done = false; t.remaining = t.total;
    paint();
  }

  function timerCard(key) {
    const t = timers.get(key);
    const state = t.done ? 'done' : t.endAt ? 'run' : t.remaining < t.total ? 'paused' : 'idle';
    const title = { idle: 'Zamanlayıcı', run: 'Çalışıyor', paused: 'Duraklatıldı', done: 'Süre doldu' }[state];
    return h('div', { class: 'rcp-timer ' + state },
      h('div', { class: 'rcp-timer-main' },
        h('div', { class: 'rcp-timer-ic' }, icon(t.done ? 'check' : 'timer')),
        h('div', { class: 'grow' },
          h('div', { class: 'rcp-timer-title' }, title, h('span', { class: 'muted' }, ' · ' + t.label)),
          h('div', { class: 'rcp-timer-left', dataset: { tleft: key } }, fmt.duration(Math.ceil(left(t))))),
        h('button', { type: 'button', class: 'btn ' + (state === 'run' ? '' : 'primary') + ' rcp-timer-btn', onClick: () => toggleTimer(key) },
          icon(state === 'run' ? 'pause' : 'play'), state === 'run' ? 'Duraklat' : state === 'paused' ? 'Devam' : state === 'done' ? 'Yeniden' : 'Başlat')),
      h('div', { class: 'rcp-timer-foot' },
        h('div', { class: 'progress thin grow' }, h('i', { dataset: { tprog: key }, style: { width: (100 - (left(t) / t.total) * 100) + '%' } })),
        (state === 'run' || state === 'paused') && h('button', { type: 'button', class: 'rcp-linkbtn rcp-timer-reset', onClick: () => resetTimer(key) }, icon('refresh', { size: 15 }), 'Sıfırla')));
  }

  // ---------- Ekran açık kalsın ----------
  let lock = null, alive = true;
  const requestLock = async () => {
    try {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      const l = await navigator.wakeLock.request('screen');
      if (alive) lock = l; else l.release();
    } catch { lock = null; }
  };
  // Sekme arka plana gidince kilit düşer; geri gelince yeniden iste
  const onVis = () => { if (document.visibilityState === 'visible') requestLock(); };
  requestLock();
  document.addEventListener('visibilitychange', onVis);

  // ---------- Düzen ----------
  const stepCount = h('div', { class: 'rcp-cook-count' });
  const segs = h('div', { class: 'rcp-cook-segs' }, r.steps.map(() => h('i')));
  const strip = h('div', { class: 'rcp-cook-strip' });
  const main = h('div', { class: 'rcp-cook-main' });
  const prevBtn = h('button', { type: 'button', class: 'btn lg rcp-cook-prev', onClick: () => go(idx - 1) }, icon('left'), 'Önceki');
  const nextBtn = h('button', { type: 'button', class: 'btn primary lg grow', onClick: () => (idx < n - 1 ? go(idx + 1) : finish()) });
  const bottom = h('div', { class: 'rcp-cook-bottom' }, prevBtn, nextBtn);

  const exit = async () => {
    if (!finished && running().length && !(await confirmDialog('Çalışan bir zamanlayıcı var. Pişirme modundan çıkmak istiyor musun?', { title: 'Çıkılsın mı?', okLabel: 'Çık' }))) return;
    nav.back(`recipes/${r.id}`, `#/recipes/${r.id}`);
  };

  const overlay = h('div', { class: 'rcp-cook', role: 'dialog', 'aria-label': 'Pişirme modu: ' + r.name },
    h('div', { class: 'rcp-cook-top' },
      h('button', { type: 'button', class: 'rcp-round-btn', 'aria-label': 'Pişirme modundan çık', onClick: exit }, icon('x')),
      h('div', { class: 'rcp-cook-head' }, h('div', { class: 'rcp-cook-name' }, r.name), stepCount),
      h('button', { type: 'button', class: 'rcp-round-btn', 'aria-label': 'Malzemeler', onClick: showIngredients }, icon('list'))),
    segs,
    strip,
    main,
    bottom);

  function showIngredients() {
    modal({
      title: 'Malzemeler',
      body: h('div', null,
        h('p', { class: 'muted small', style: 'margin:-6px 0 10px' }, portionText(portions) + ' için'),
        h('div', { class: 'rcp-cook-ings' }, r.ingredients.map(i => h('div', { class: 'rcp-cook-ing' },
          h('b', null, qtyText(i.qty * factor, i.unit)), h('span', null, i.name, i.note && h('small', null, ' · ' + i.note)))))),
      actions: [{ label: 'Kapat', class: 'primary' }],
    });
  }

  function go(i) {
    if (i < 0 || i >= n) return;
    idx = i; haptic(8); paint();
    main.scrollTop = 0;
  }

  function paint() {
    if (finished) return paintFinish();
    stepCount.textContent = `Adım ${idx + 1} / ${n}`;
    [...segs.children].forEach((s, i) => { s.className = i < idx ? 'done' : i === idx ? 'cur' : ''; });
    const others = [...timers.entries()].filter(([, t]) => t.step !== idx && (t.endAt || t.done));
    mount(strip, others.map(([k, t]) => h('button', { type: 'button', class: 'rcp-mini-timer' + (t.done ? ' done' : ''), onClick: () => go(t.step) },
      icon(t.done ? 'check' : 'timer', { size: 15 }), `${t.step + 1}. adım`, h('b', { dataset: { tleft: k } }, fmt.duration(Math.ceil(left(t)))))));
    const keys = [...timers.keys()].filter(k => timers.get(k).step === idx);
    mount(main,
      h('div', { class: 'rcp-cook-stepn' }, String(idx + 1)),
      h('p', { class: 'rcp-cook-text' }, r.steps[idx]),
      keys.map(timerCard),
      idx === 0 && h('button', { type: 'button', class: 'rcp-linkbtn rcp-cook-ingbtn', onClick: showIngredients }, icon('list', { size: 16 }), 'Malzemeleri gör'));
    prevBtn.disabled = idx === 0;
    mount(nextBtn, idx < n - 1 ? ['Sonraki', icon('right')] : [icon('check'), 'Bitir']);
    bottom.classList.remove('hide');
  }

  function finish() {
    finished = true;
    haptic([20, 60, 20]);
    awardXP(15, 'Tarif pişirildi', { once: 'recipe-cook-' + r.id + '-' + todayKey() });
    paint();
  }

  function paintFinish() {
    stepCount.textContent = 'Tamamlandı';
    [...segs.children].forEach(s => { s.className = 'done'; });
    strip.replaceChildren();
    mount(main, h('div', { class: 'rcp-finish' },
      h('div', { class: 'rcp-finish-emoji', style: { background: tint(r.cat, 0.5) } }, r.emoji),
      h('h2', null, 'Afiyet olsun!'),
      h('p', { class: 'muted' }, `${r.name} hazır. Yediğin porsiyonu günlüğüne eklemeyi unutma.`),
      h('button', { type: 'button', class: 'btn primary lg block', onClick: () => openAddToMeal(r, { portions: 1 }) }, icon('plus'), 'Öğüne ekle'),
      h('button', { type: 'button', class: 'btn ghost lg block', onClick: () => nav.back(`recipes/${r.id}`, `#/recipes/${r.id}`) }, 'Tarife dön')));
    bottom.classList.add('hide');
  }

  // Kaydırma ve klavye ile gezinme
  let tx = null, ty = null;
  main.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  main.addEventListener('touchend', e => {
    if (tx == null || finished) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(idx + (dx < 0 ? 1 : -1));
    tx = null;
  });
  const onKey = e => {
    if (document.querySelector('.modal-backdrop')) return;
    if (e.key === 'ArrowRight') { if (!finished) (idx < n - 1 ? go(idx + 1) : finish()); }
    else if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'Escape') exit();
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  document.body.classList.add('rcp-cooking');
  el.appendChild(h('div', { class: 'rcp-cook-placeholder' }));
  paint();

  return () => {
    alive = false;
    clearInterval(tick);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    try { lock?.release?.(); } catch { /* yok */ }
    lock = null;
    overlay.remove();
    document.body.classList.remove('rcp-cooking');
  };
}
