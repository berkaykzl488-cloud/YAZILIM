// Acil destek (SOS): nefes egzersizi, 5 dakikalık geri sayım, dikkat dağıtma görevleri ve kişisel nedenler
import { h, svg, icon, mount, haptic, toast, backButton } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { awardXP } from '../../core/xp.js';
import { get, DISTRACTIONS, pad2 } from './data.js';
import { cravingDialog } from './dialogs.js';

const PATTERNS = {
  box: { label: 'Kutu nefesi', sub: '4-4-4-4', phases: [['in', 4], ['hold', 4], ['out', 4], ['hold', 4]] },
  relax: { label: 'Rahatlatıcı nefes', sub: '4-7-8', phases: [['in', 4], ['hold', 7], ['out', 8]] },
};
const PHASE_TXT = { in: 'Nefes al', hold: 'Tut', out: 'Ver' };
const PHASE_HINT = { in: 'Burnundan yavaşça', hold: 'Nefesini tut', out: 'Ağzından yavaşça' };
const WAVE_SEC = 300;
let lastPattern = 'box';

export function renderSos(el, id) {
  const hb = get(id);
  if (!hb) { go('habits'); return () => {}; }

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.classList.add('hb-sos-open');

  const startedAt = Date.now();
  let pattern = lastPattern, phaseIdx = 0, phaseStart = performance.now(), cycles = 0, waveDone = false, finished = false;
  let taskIdx = Math.floor(Math.random() * DISTRACTIONS.length), reasonIdx = 0;
  const reasons = hb.reasons.length ? [...hb.reasons] : [];
  if (hb.motivation) reasons.push(hb.motivation);
  if (!reasons.length) reasons.push('Bu istek geçici. Birkaç dakika içinde azalacak.', 'Şimdiye kadar başardıklarını hatırla.');

  // ---------- Küre
  const orb = h('div', { class: 'hb-orb' });
  const phaseEl = h('div', { class: 'hb-orb-phase' });
  const secEl = h('div', { class: 'hb-orb-sec' });
  const hintEl = h('div', { class: 'hb-orb-hint' });
  const cycleEl = h('div', { class: 'hb-orb-cycle' });
  const orbWrap = h('div', { class: 'hb-orb-wrap' },
    h('div', { class: 'hb-orb-ring r1' }), h('div', { class: 'hb-orb-ring r2' }), h('div', { class: 'hb-orb-ring r3' }),
    orb,
    h('div', { class: 'hb-orb-text', 'aria-live': 'polite' }, phaseEl, secEl, hintEl));

  const modeBox = h('div', { class: 'hb-seg sos', role: 'radiogroup', 'aria-label': 'Nefes türü' });
  const drawModes = () => mount(modeBox, Object.entries(PATTERNS).map(([k, p]) => h('button', {
    type: 'button', class: 'hb-seg-btn' + (k === pattern ? ' on' : ''), role: 'radio', 'aria-checked': String(k === pattern),
    onClick: () => { if (k === pattern) return; pattern = lastPattern = k; drawModes(); phaseIdx = 0; cycles = 0; enterPhase(); },
  }, h('b', null, p.label), h('span', null, p.sub))));
  drawModes();

  function enterPhase() {
    const [ph, dur] = PATTERNS[pattern].phases[phaseIdx];
    phaseStart = performance.now();
    const prev = PATTERNS[pattern].phases[(phaseIdx - 1 + PATTERNS[pattern].phases.length) % PATTERNS[pattern].phases.length][0];
    const scale = ph === 'in' ? 1 : ph === 'out' ? .58 : (prev === 'in' ? 1 : .58);
    orb.style.transitionDuration = (ph === 'hold' ? .3 : dur) + 's';
    orb.style.transform = `scale(${scale})`;
    orbWrap.dataset.phase = ph;
    phaseEl.textContent = PHASE_TXT[ph];
    hintEl.textContent = PHASE_HINT[ph];
    secEl.textContent = dur;
    cycleEl.textContent = `Tur ${cycles + 1}`;
    haptic(ph === 'hold' ? 15 : 35);
  }

  // ---------- Dalga geri sayımı
  const R = 26, C = 2 * Math.PI * R;
  const waveArc = svg('circle', { cx: 32, cy: 32, r: R, fill: 'none', stroke: 'var(--violet)', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': 0, class: 'hb-wave-arc' });
  const waveTime = h('div', { class: 'hb-wave-time mono' });
  const waveTitle = h('div', { class: 'hb-wave-title' }, 'Dalga geçecek');
  const waveText = h('div', { class: 'hb-wave-text' }, 'İstekler genelde birkaç dakika içinde zirve yapıp azalır. Sadece bu 5 dakikayı geç.');
  const wavePanel = h('div', { class: 'hb-sos-card hb-wave' },
    h('div', { class: 'hb-wave-ring' }, svg('svg', { viewBox: '0 0 64 64', width: 64, height: 64 },
      svg('circle', { cx: 32, cy: 32, r: R, fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 5 }), waveArc), waveTime),
    h('div', { class: 'grow' }, waveTitle, waveText));

  // ---------- Görev
  const taskText = h('div', { class: 'hb-task-text' });
  const drawTask = () => { taskText.textContent = DISTRACTIONS[taskIdx]; };
  drawTask();
  const taskPanel = h('div', { class: 'hb-sos-card' },
    h('div', { class: 'hb-sos-card-h' }, icon('bolt'), 'Kendini oyala'),
    taskText,
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn ghost sm grow', onClick: () => { taskIdx = (taskIdx + 1 + Math.floor(Math.random() * (DISTRACTIONS.length - 1))) % DISTRACTIONS.length; drawTask(); haptic(10); } }, icon('refresh'), 'Başka öneri'),
      h('button', { class: 'btn ghost sm grow', onClick: () => { toast('Süper! Bir tane daha?', { type: 'success', ms: 1600 }); taskIdx = (taskIdx + 1) % DISTRACTIONS.length; drawTask(); } }, icon('check'), 'Yaptım')));

  // ---------- Nedenler
  const reasonText = h('div', { class: 'hb-sos-reason' });
  const drawReason = () => { reasonText.classList.remove('in'); void reasonText.offsetWidth; reasonText.textContent = reasons[reasonIdx % reasons.length]; reasonText.classList.add('in'); };
  drawReason();
  const reasonPanel = h('button', { class: 'hb-sos-card hb-sos-reasons', type: 'button', onClick: () => { reasonIdx++; drawReason(); }, 'aria-label': 'Sonraki neden' },
    h('div', { class: 'hb-sos-card-h' }, icon('heart'), hb.reasons.length ? 'Neden bırakıyorsun?' : 'Hatırla',
      reasons.length > 1 && h('span', { class: 'hb-sos-count' }, `${reasons.length} neden`)),
    reasonText);

  // ---------- Bitiş
  const finishBtn = h('button', { class: 'btn lime lg grow', onClick: finish }, icon('check'), 'İsteği atlattım');
  function finish() {
    if (finished) return;
    cravingDialog(hb, {
      resisted: true, sos: true, title: 'Harika, atlattın! Kaydedelim',
      onSaved: c => {
        finished = true;
        awardXP(15, `Acil destekle istek atlatıldı (${hb.name})`, { once: `habits:${id}:sos:${c.id}` });
        go(`habits/${id}`);
      },
    });
  }

  const overlay = h('div', { class: 'hb-sosv', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Acil destek' },
    h('div', { class: 'hb-sosv-bg' }),
    h('div', { class: 'hb-sosv-inner' },
      h('div', { class: 'hb-topbar' },
        backButton(`habits/${id}`),
        h('div', { class: 'hb-topbar-title' }, h('span', { class: 'hb-sos-dot' }), 'Acil destek'),
        cycleEl),
      h('p', { class: 'hb-sos-lead' }, `${hb.name} isteği geldi. Birlikte atlatalım: dairenin ritmine göre nefes al.`),
      modeBox,
      orbWrap,
      wavePanel,
      taskPanel,
      reasonPanel,
      h('div', { class: 'hb-sosv-foot' }, finishBtn)));
  document.body.appendChild(overlay);
  el.classList.add('hb-sos-host');

  function tick() {
    const p = PATTERNS[pattern];
    const [, dur] = p.phases[phaseIdx];
    const el2 = (performance.now() - phaseStart) / 1000;
    if (el2 >= dur) {
      phaseIdx = (phaseIdx + 1) % p.phases.length;
      if (phaseIdx === 0) cycles++;
      enterPhase();
    } else secEl.textContent = Math.max(1, Math.ceil(dur - el2));

    const left = Math.max(0, WAVE_SEC - (Date.now() - startedAt) / 1000);
    waveTime.textContent = `${Math.floor(left / 60)}:${pad2(Math.floor(left % 60))}`;
    waveArc.setAttribute('stroke-dashoffset', (C * (1 - left / WAVE_SEC)).toFixed(2));
    if (!left && !waveDone) {
      waveDone = true;
      wavePanel.classList.add('done');
      waveTitle.textContent = 'Dalga geçti!';
      waveText.textContent = '5 dakikayı başardın. İstek muhtemelen azaldı — bunu kaydet.';
      finishBtn.lastChild.textContent = 'Atlattım, kaydet';
      haptic([60, 80, 60]);
    }
  }
  enterPhase();
  tick();
  const t1 = setInterval(tick, 200);
  const t2 = setInterval(() => { reasonIdx++; drawReason(); }, 8000);

  return () => {
    clearInterval(t1); clearInterval(t2);
    document.body.style.overflow = prevOverflow;
    overlay.remove();
    document.body.classList.remove('hb-sos-open');
  };
}
