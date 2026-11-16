// Koşu modülü — ortak arayüz parçaları: ikonlar, alt sekmeler, geri başlığı, bekle-bas düğmesi.
import { h, svg, icon, fmt } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { typeOf } from './data.js';

const EXTRA = {
  bike: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5 9 9h6l3.5 7.5M9 9l3 7.5h-6.5M12.5 5.5H15l1 3.5"/>',
  hike: '<path d="m2 20 7-12 4 6 2.5-3.5L22 20Z"/><path d="m7.5 10.5 1.5 1.5 1.5-1"/>',
  gps: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  vibrate: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8M2 10v4M22 10v4"/>',
  mountain: '<path d="m3 19 6-10 4 6 2-3 6 7Z"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  min: '<path d="m6 9 6 6 6-6"/>',
};

/** Çekirdek ikon seti + modüle özel ikonlar */
export function rIcon(name, { size = null, stroke = 1.8 } = {}) {
  if (!EXTRA[name]) return icon(name, size ? { size } : undefined);
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', String(stroke));
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
  s.innerHTML = EXTRA[name];
  return s;
}
export const typeIcon = (type, size) => rIcon(typeOf(type).icon, { size });

/** Ana sekmeler: Başla / Geçmiş / Rekorlar */
export function subNav(active) {
  const items = [['', 'Başla', 'play'], ['history', 'Geçmiş', 'list'], ['stats', 'Rekorlar', 'trophy']];
  return h('nav', { class: 'rn-subnav', 'aria-label': 'Koşu bölümleri' }, items.map(([id, label, ic]) =>
    h('button', { class: 'rn-subnav-btn' + (id === active ? ' active' : ''), type: 'button', 'aria-current': id === active ? 'page' : null,
      onClick: () => go('run' + (id ? '/' + id : '')) }, icon(ic, { size: 18 }), h('span', null, label))));
}

/** Alt sayfa başlığı: görünür "Geri" düğmesi + başlık */
export function backHeader(title, sub = '', { to = 'run/history', right = null } = {}) {
  return h('div', { class: 'rn-backhead' },
    h('button', { class: 'btn ghost rn-back', type: 'button', onClick: () => (history.length > 1 && document.referrer !== '' ? history.back() : go(to)) },
      icon('left', { size: 18 }), 'Geri'),
    h('div', { class: 'grow rn-backhead-main' }, h('h1', { class: 'rn-h1' }, title), sub && h('p', { class: 'rn-sub' }, sub)),
    right);
}

/**
 * Basılı tutunca tetiklenen düğme (yanlışlıkla bitirmeyi önler).
 * { label, sub, cls, ms, onDone, iconName, aria }
 */
export function holdButton({ label, sub = 'Basılı tut', cls = '', ms = 1200, onDone, iconName = 'stop', aria }) {
  const R = 46, C = 2 * Math.PI * R;
  const prog = svg('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: 'currentColor', 'stroke-width': 5, 'stroke-linecap': 'round',
    'stroke-dasharray': C, 'stroke-dashoffset': C, class: 'rn-hold-prog' });
  const ring = svg('svg', { viewBox: '0 0 100 100', class: 'rn-hold-ring', 'aria-hidden': 'true' },
    svg('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: 'rgba(255,255,255,.1)', 'stroke-width': 5 }), prog);
  const hint = h('span', { class: 'rn-hold-sub' }, sub);
  const btn = h('button', { class: 'rn-round rn-hold ' + cls, type: 'button', 'aria-label': aria || `${label} (${sub})` },
    ring, h('span', { class: 'rn-round-in' }, rIcon(iconName, { size: 28 }), h('span', { class: 'rn-round-label' }, label)));
  let raf = null, t0 = 0, done = false;
  const reset = () => {
    cancelAnimationFrame(raf); raf = null;
    prog.setAttribute('stroke-dashoffset', C);
    btn.classList.remove('holding');
    if (!done) hint.textContent = sub;
  };
  const step = () => {
    const f = Math.min(1, (performance.now() - t0) / ms);
    prog.setAttribute('stroke-dashoffset', C * (1 - f));
    if (f >= 1) { done = true; reset(); try { navigator.vibrate?.(60); } catch { /* yok */ } onDone?.(); return; }
    raf = requestAnimationFrame(step);
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    done = false; t0 = performance.now();
    btn.classList.add('holding');
    hint.textContent = 'Bırakma…';
    try { navigator.vibrate?.(15); } catch { /* yok */ }
    raf = requestAnimationFrame(step);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, () => { if (raf) reset(); }));
  btn.addEventListener('contextmenu', e => e.preventDefault());
  // Klavye: Enter/Boşluk basılı tutma
  btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !raf && !e.repeat) { e.preventDefault(); done = false; t0 = performance.now(); btn.classList.add('holding'); raf = requestAnimationFrame(step); } });
  btn.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') reset(); });
  const wrap = h('div', { class: 'rn-ctrl' }, btn, hint);
  return wrap;
}

/** Yuvarlak kontrol düğmesi + altında etiket */
export function roundButton({ label, iconName, cls = '', onClick, size = 'md', aria }) {
  return h('div', { class: 'rn-ctrl' },
    h('button', { class: `rn-round ${size} ${cls}`, type: 'button', 'aria-label': aria || label, onClick },
      h('span', { class: 'rn-round-in' }, rIcon(iconName, { size: size === 'lg' ? 34 : 24 }))),
    h('span', { class: 'rn-ctrl-label' }, label));
}

/** Büyük metrik kutusu */
export function metric(label, value, unit = '', cls = '') {
  const v = h('span', { class: 'rn-m-val' }, value);
  const u = h('span', { class: 'rn-m-unit' }, unit);
  const el = h('div', { class: 'rn-m ' + cls }, h('div', { class: 'rn-m-row' }, v, u), h('div', { class: 'rn-m-label' }, label));
  el.set = (val, unitTxt) => { if (v.textContent !== String(val)) v.textContent = val; if (unitTxt != null && u.textContent !== unitTxt) u.textContent = unitTxt; };
  el.setLabel = t => { el.querySelector('.rn-m-label').textContent = t; };
  return el;
}

export const fmtDuration = sec => fmt.duration(sec);
