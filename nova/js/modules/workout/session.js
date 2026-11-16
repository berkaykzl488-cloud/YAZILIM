// Canlı antrenman ekranı: güncel egzersiz animasyonu, set tablosu, dinlenme sayacı, süreli setler, bitiş.
import { h, icon, fmt, mount, toast, confirmDialog, modal, haptic, emptyState, svg } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { awardXP } from '../../core/xp.js';
import { figure } from './figure.js';
import { EX, groupLabel } from './exercises.js';
import { pickExercise, howTo, unlockAudio, beep, alertEnd, targetText, eqText } from './kit.js';
import { getActive, setActive, clearActive, makeEntry, overloadHint, finishSession, lastSetsFor } from './data.js';
import { markJustFinished } from './history.js';

const parseNum = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function miniRing(size, stroke) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const val = svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--accent)', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': 0 });
  const el = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'wk-ring' },
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(255,255,255,.1)', 'stroke-width': stroke }), val);
  return { el, set: p => val.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, p))))) };
}

export function renderSession(el) {
  let a = getActive();
  if (!a) {
    mount(el, h('a', { class: 'back-btn', href: '#/workout' }, icon('left'), 'Geri'),
      h('div', { class: 'panel' }, emptyState('dumbbell', 'Devam eden antrenman yok', 'Bir program seç ya da boş bir antrenman başlat.',
        h('a', { class: 'btn primary', href: '#/workout' }, 'Antrenmanlara git'))));
    return;
  }
  document.body.classList.add('wk-live');
  const save = () => setActive(a);
  let fig = null, figFor = null, timedRun = null;

  // ---------- Üst bölüm ----------
  const elapsed = h('span', { class: 'wk-elapsed', 'aria-label': 'Geçen süre' });
  const pills = h('div', { class: 'chips wk-expills' });
  const card = h('section', { class: 'panel wk-cur' });
  const table = h('div', { class: 'wk-sets' });
  const nextBox = h('div');
  const restSheet = h('div', { class: 'wk-rest hide', role: 'timer', 'aria-live': 'off' });
  const rr = miniRing(64, 6);
  const restTime = h('div', { class: 'wk-rest-time' });
  mount(restSheet, h('div', { class: 'wk-rest-ring' }, rr.el, h('span', null, icon('clock'))),
    h('div', { class: 'grow' }, h('div', { class: 'small muted' }, 'Dinlenme'), restTime),
    h('button', { class: 'btn sm', type: 'button', 'aria-label': '15 saniye azalt', onClick: () => adjustRest(-15) }, '−15'),
    h('button', { class: 'btn sm', type: 'button', 'aria-label': '15 saniye ekle', onClick: () => adjustRest(15) }, '+15'),
    h('button', { class: 'btn sm primary', type: 'button', onClick: () => endRest(false) }, 'Geç'));

  const finishBtn = h('button', { class: 'btn primary block lg', type: 'button', onClick: finish }, icon('check'), 'Antrenmanı bitir');
  const bar = h('div', { class: 'wk-bar' }, restSheet, finishBtn);

  function paintPills() {
    mount(pills, a.exercises.map((x, i) => {
      const e = EX[x.exId];
      const done = x.sets.length && x.sets.every(s => s.done);
      return h('button', { type: 'button', class: 'chip' + (i === a.cur ? ' active' : '') + (done ? ' wk-done' : ''), 'aria-current': i === a.cur ? 'step' : null,
        onClick: () => { a.cur = i; save(); paintAll(); } }, done ? icon('check') : h('span', { class: 'wk-pn' }, String(i + 1)), e?.name || x.exId);
    }), h('button', { type: 'button', class: 'chip', onClick: addExercise }, icon('plus'), 'Ekle'));
    pills.querySelector('.active')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }

  function paintCard() {
    const x = a.exercises[a.cur];
    if (!x) {
      mount(card, emptyState('plus', 'Egzersiz ekle', 'Bu antrenmanda henüz egzersiz yok. Eklemek için düğmeye dokun.',
        h('button', { class: 'btn primary', type: 'button', onClick: addExercise }, icon('plus'), 'Egzersiz ekle')));
      mount(table); mount(nextBox);
      return;
    }
    const e = EX[x.exId];
    if (figFor !== e.id) { fig?.destroy(); fig = figure(e.anim, { mode: 'md', muscles: e.muscles }); figFor = e.id; }
    const hint = overloadHint(e.id, x.target);
    mount(card,
      h('div', { class: 'wk-cur-fig' }, fig.el),
      h('div', { class: 'wk-cur-info' },
        h('div', { class: 'small muted' }, `Egzersiz ${a.cur + 1} / ${a.exercises.length} · ${groupLabel(e.group)}`),
        h('h2', { class: 'wk-cur-name' }, e.name),
        h('div', { class: 'wk-cur-target' }, `Hedef: ${targetText(x.target)} · ${x.target.rest} sn dinlenme`),
        h('div', { class: 'row wrap gap-s wk-cur-actions' },
          h('button', { class: 'btn sm', type: 'button', onClick: () => howTo(e) }, icon('info'), 'Nasıl yapılır?'),
          h('button', { class: 'btn sm ghost', type: 'button', onClick: swapExercise }, icon('repeat'), 'Değiştir'),
          h('button', { class: 'btn sm ghost icon', type: 'button', 'aria-label': 'Egzersizi çıkar', onClick: removeExercise }, icon('trash')))),
      hint ? h('div', { class: 'wk-hint' }, icon('bolt'), h('span', null, hint)) : null);
    paintTable();
    paintNext();
  }

  function paintTable() {
    const x = a.exercises[a.cur]; if (!x) return;
    const e = EX[x.exId];
    const timed = e.type === 'time' || (x.target.sec && !x.target.reps);
    const prev = lastSetsFor(e.id);
    const head = h('div', { class: 'wk-srow wk-shead' + (timed ? ' timed' : '') },
      h('span', null, 'Set'), h('span', null, 'Önceki'),
      timed ? h('span', null, 'Süre (sn)') : [h('span', null, 'Kilo (kg)'), h('span', null, 'Tekrar')],
      timed ? h('span', null, 'Başlat') : null, h('span', { class: 'sr' }, 'Tamam'));
    const rows = x.sets.map((s, i) => {
      const p = prev?.[i];
      const prevTxt = p ? (timed ? `${p.sec} sn` : p.kg ? `${fmt.n(p.kg, p.kg % 1 ? 1 : 0)}×${p.reps}` : `${p.reps}`) : '–';
      const kgIn = h('input', { class: 'input wk-in', type: 'number', inputmode: 'decimal', step: '0.5', min: 0, value: s.kg || '', placeholder: '0', 'aria-label': `Set ${i + 1} kilo`,
        onInput: ev => { s.kg = parseNum(ev.target.value); save(); } });
      const repIn = h('input', { class: 'input wk-in', type: 'number', inputmode: 'numeric', step: '1', min: 0, value: s.reps || '', placeholder: '0', 'aria-label': `Set ${i + 1} tekrar`,
        onInput: ev => { s.reps = Math.round(parseNum(ev.target.value)); save(); } });
      const secIn = h('input', { class: 'input wk-in', type: 'number', inputmode: 'numeric', step: '5', min: 0, value: s.sec || '', placeholder: '0', 'aria-label': `Set ${i + 1} süre (saniye)`,
        onInput: ev => { s.sec = Math.round(parseNum(ev.target.value)); save(); } });
      const chk = h('button', { type: 'button', class: 'wk-chk' + (s.done ? ' on' : ''), 'aria-pressed': String(!!s.done), 'aria-label': `Set ${i + 1} ${s.done ? 'tamamlandı' : 'tamamla'}`,
        onClick: () => toggleSet(i) }, icon('check'));
      return h('div', { class: 'wk-srow' + (timed ? ' timed' : '') + (s.done ? ' done' : '') },
        h('span', { class: 'wk-snum' }, String(i + 1)), h('span', { class: 'wk-prev' }, prevTxt),
        timed ? secIn : [kgIn, repIn],
        timed ? h('button', { type: 'button', class: 'btn icon sm', 'aria-label': `Set ${i + 1} sayacını başlat`, onClick: () => runTimed(i) }, icon('play')) : null,
        chk);
    });
    mount(table, head, rows,
      h('div', { class: 'row wk-setbtns' },
        h('button', { class: 'btn sm ghost grow', type: 'button', onClick: () => { const l = x.sets[x.sets.length - 1]; x.sets.push({ kg: l?.kg || 0, reps: l?.reps || x.target.reps || 10, sec: l?.sec || x.target.sec || 0, done: false }); save(); paintTable(); } }, icon('plus'), 'Set ekle'),
        x.sets.length > 1 ? h('button', { class: 'btn sm ghost grow', type: 'button', onClick: () => { x.sets.pop(); save(); paintTable(); paintPills(); } }, icon('minus'), 'Son seti sil') : null));
  }

  function paintNext() {
    const n = a.exercises[a.cur + 1];
    if (!n) {
      mount(nextBox, h('div', { class: 'panel tight wk-next' }, h('div', { class: 'grow' }, h('div', { class: 'small muted' }, 'Sıradaki'), h('b', null, 'Son egzersizdesin')),
        h('button', { class: 'btn sm', type: 'button', onClick: addExercise }, icon('plus'), 'Egzersiz ekle')));
      return;
    }
    const e = EX[n.exId];
    mount(nextBox, h('div', { class: 'panel tight wk-next' },
      h('div', { class: 'grow' }, h('div', { class: 'small muted' }, 'Sıradaki'), h('b', null, e.name), h('div', { class: 'small muted' }, targetText(n.target))),
      h('button', { class: 'btn sm', type: 'button', onClick: () => { a.cur++; save(); paintAll(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Sonraki', icon('right'))));
  }

  function paintAll() { paintPills(); paintCard(); }

  // ---------- Set işlemleri ----------
  function toggleSet(i) {
    unlockAudio();
    const x = a.exercises[a.cur]; const s = x.sets[i];
    s.done = !s.done;
    if (s.done) {
      const e = EX[x.exId];
      if (e.type !== 'time' && !s.reps) s.reps = x.target.reps || 0;
      haptic(15);
      const allDone = x.sets.every(q => q.done);
      if (x.target.rest > 0) startRest(x.target.rest);
      if (allDone && a.cur < a.exercises.length - 1) {
        a.cur++;
        toast(`${e.name} tamamlandı. Sıradaki: ${EX[a.exercises[a.cur].exId].name}`, { type: 'success' });
        save(); paintAll();
        return;
      }
      if (allDone) toast('Tüm setler tamam! Bitirmek için aşağıdaki düğmeye dokun.', { type: 'success' });
    }
    save(); paintTable(); paintPills();
  }

  function addExercise() {
    pickExercise({ loc: a.location, onPick: e => { a.exercises.push(makeEntry(e.id)); a.cur = a.exercises.length - 1; save(); paintAll(); toast(`${e.name} eklendi`, { type: 'success' }); } });
  }
  function swapExercise() {
    const x = a.exercises[a.cur]; const old = EX[x.exId];
    pickExercise({ title: 'Egzersizi değiştir', loc: a.location, group: old.group, onPick: e => {
      const t = { ...x.target };
      if (e.type === 'time') { t.reps = null; t.sec = t.sec || e.def.sec; } else { t.sec = null; t.reps = t.reps || e.def.reps; }
      a.exercises[a.cur] = makeEntry(e.id, t); save(); paintAll(); toast(`${old.name} yerine ${e.name}`, { type: 'success' });
    } });
  }
  async function removeExercise() {
    const x = a.exercises[a.cur];
    if (!(await confirmDialog(`${EX[x.exId].name} bu antrenmandan çıkarılsın mı?`, { title: 'Egzersizi çıkar', okLabel: 'Çıkar', danger: true }))) return;
    a.exercises.splice(a.cur, 1); a.cur = Math.max(0, Math.min(a.cur, a.exercises.length - 1)); save(); paintAll();
  }

  // ---------- Dinlenme ----------
  function startRest(sec) { a.rest = { endTs: Date.now() + sec * 1000, total: sec }; save(); tick(); }
  function adjustRest(d) {
    if (!a.rest) return;
    a.rest.endTs += d * 1000; a.rest.total = Math.max(5, a.rest.total + d);
    if (a.rest.endTs <= Date.now()) return endRest(false);
    save(); tick();
  }
  function endRest(natural) {
    a.rest = null; save();
    restSheet.classList.add('hide');
    if (natural) { alertEnd(); toast('Dinlenme bitti. Sıradaki sete geç!', { type: 'info' }); }
  }

  // ---------- Süreli set ----------
  function runTimed(i) {
    unlockAudio();
    const x = a.exercises[a.cur]; const e = EX[x.exId]; const s = x.sets[i];
    const total = Math.max(5, s.sec || x.target.sec || 30);
    if (a.rest) endRest(false);
    const big = h('div', { class: 'wk-ov-time' });
    const lab = h('div', { class: 'wk-ov-lab' }, 'Hazırlan');
    const ring = miniRing(220, 10);
    const pauseBtn = h('button', { class: 'btn lg', type: 'button', onClick: () => { timedRun.paused ? resume() : pause(); } }, icon('pause'), 'Duraklat');
    const fg = figure(e.anim, { mode: 'md', muscles: e.muscles });
    const ov = h('div', { class: 'wk-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${e.name} sayacı` },
      h('div', { class: 'wk-ov-head' }, h('b', null, e.name), h('span', { class: 'small muted' }, `Set ${i + 1}`)),
      h('div', { class: 'wk-ov-fig' }, fg.el),
      h('div', { class: 'wk-ov-ring' }, ring.el, h('div', { class: 'wk-ov-center' }, big, lab)),
      h('div', { class: 'row wk-ov-btns' }, pauseBtn,
        h('button', { class: 'btn primary lg', type: 'button', onClick: () => complete(true) }, icon('check'), 'Bitir')),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => close() }, 'Vazgeç'));
    document.body.append(ov);
    const prep = 3;
    timedRun = { start: Date.now(), paused: false, pausedAt: 0, total, prep, lastBeep: -1, ov };
    function pause() { timedRun.paused = true; timedRun.pausedAt = Date.now(); pauseBtn.replaceChildren(icon('play'), 'Devam'); }
    function resume() { timedRun.start += Date.now() - timedRun.pausedAt; timedRun.paused = false; pauseBtn.replaceChildren(icon('pause'), 'Duraklat'); }
    function close() { ov.remove(); fg.destroy(); timedRun = null; }
    function complete(manual) {
      const el2 = Math.max(0, (Date.now() - timedRun.start) / 1000 - prep);
      s.sec = manual ? Math.max(1, Math.round(Math.min(total, el2))) : total;
      if (!manual) alertEnd();
      close();
      if (!s.done) toggleSet(i); else { save(); paintTable(); }
    }
    timedRun.update = () => {
      if (timedRun.paused) return;
      const t = (Date.now() - timedRun.start) / 1000;
      if (t < prep) {
        const n = Math.ceil(prep - t); big.textContent = String(n); lab.textContent = 'Hazırlan'; ring.set(1 - t / prep);
        if (n !== timedRun.lastBeep) { timedRun.lastBeep = n; beep({ freq: 660, ms: 90 }); }
        return;
      }
      const left = total - (t - prep);
      if (left <= 0) return complete(false);
      const n = Math.ceil(left);
      big.textContent = fmt.duration(n); lab.textContent = 'Çalış'; ring.set(left / total);
      if (n <= 3 && n !== timedRun.lastBeep) { timedRun.lastBeep = n; beep({ freq: 880, ms: 90 }); }
      if (n > 3) timedRun.lastBeep = -1;
    };
    timedRun.update();
  }

  // ---------- Bitir / iptal ----------
  async function finish() {
    const doneSets = a.exercises.reduce((n, x) => n + x.sets.filter(s => s.done).length, 0);
    if (!doneSets) {
      if (await confirmDialog('Henüz hiç set tamamlamadın. Antrenmanı kaydetmeden kapatmak istiyor musun?', { title: 'Antrenmanı kapat', okLabel: 'Kaydetmeden kapat', cancelLabel: 'Devam et', danger: true })) {
        clearActive(); toast('Antrenman kapatıldı'); go('workout');
      }
      return;
    }
    const left = a.exercises.reduce((n, x) => n + x.sets.filter(s => !s.done).length, 0);
    const msg = left ? `${doneSets} set tamamlandı, ${left} set yapılmadı. Antrenmanı bitirip kaydedelim mi? Yapılmayan setler kaydedilmez.` : `${doneSets} set tamamlandı. Antrenmanı bitirip kaydedelim mi?`;
    if (!(await confirmDialog(msg, { title: 'Antrenmanı bitir', okLabel: 'Bitir ve kaydet', cancelLabel: 'Devam et' }))) return;
    const { session, prs } = finishSession(a);
    awardXP(25 + Math.min(40, doneSets * 2) + prs.length * 10, prs.length ? 'Antrenman + yeni rekor' : 'Antrenman tamamlandı', { once: 'workout-' + session.id });
    markJustFinished(session.id, prs);
    go('workout/log/' + session.id);
  }
  async function abandon() {
    if (await confirmDialog('Bu antrenman kaydedilmeden silinecek. Emin misin?', { title: 'Antrenmanı iptal et', okLabel: 'İptal et', cancelLabel: 'Vazgeç', danger: true })) {
      clearActive(); toast('Antrenman iptal edildi'); go('workout');
    }
  }

  // ---------- Saat ----------
  function tick() {
    if (!el.isConnected) return;
    elapsed.textContent = fmt.duration((Date.now() - a.startTs) / 1000);
    if (a.rest) {
      const left = (a.rest.endTs - Date.now()) / 1000;
      if (left <= 0) endRest(true);
      else {
        restSheet.classList.remove('hide');
        restTime.textContent = fmt.duration(Math.ceil(left));
        rr.set(left / a.rest.total);
      }
    } else restSheet.classList.add('hide');
    timedRun?.update?.();
  }
  const iv = setInterval(tick, 250);

  mount(el,
    h('div', { class: 'row between wk-sess-top' },
      h('a', { class: 'back-btn', href: '#/workout' }, icon('left'), 'Geri'),
      h('div', { class: 'wk-sess-clock' }, icon('clock'), elapsed)),
    h('h1', { class: 'hud-title wk-sess-title' }, a.name),
    pills, card, table, nextBox,
    h('button', { class: 'btn block ghost', type: 'button', onClick: addExercise }, icon('plus'), 'Egzersiz ekle'),
    h('button', { class: 'btn block danger wk-abandon', type: 'button', onClick: abandon }, icon('trash'), 'Antrenmanı iptal et'),
    bar);
  paintAll(); tick();

  return () => {
    clearInterval(iv);
    document.body.classList.remove('wk-live');
    fig?.destroy();
    if (timedRun) { timedRun.ov.remove(); timedRun = null; }
  };
}
