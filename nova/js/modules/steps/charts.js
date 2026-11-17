// Adım modülüne özel, yerinde güncellenebilen görseller: büyük halka, çubuk grafik, canlı dalga.
import { h, svg, clamp, fmt } from '../../core/ui.js';

const cssVar = (name, fb) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb);

/** Hedef halkası: hedef aşılınca ikinci tur farklı tonda çizilir. */
export function heroRing({ size = 232, center = null } = {}) {
  const C = size / 2, SW = 18, R = C - SW / 2 - 2;
  const circ = 2 * Math.PI * R;
  const mk = cls => svg('circle', { class: cls, cx: C, cy: C, r: R, fill: 'none', 'stroke-width': SW,
    'stroke-linecap': 'round', 'stroke-dasharray': circ, 'stroke-dashoffset': circ });
  const arc = mk('stp-ring-arc'), lap = mk('stp-ring-lap');
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'stp-ring-svg', 'aria-hidden': 'true' },
    svg('circle', { class: 'stp-ring-track', cx: C, cy: C, r: R, fill: 'none', 'stroke-width': SW }),
    svg('g', { transform: `rotate(-90 ${C} ${C})` }, arc, lap));
  const el = h('div', { class: 'stp-ring', style: { width: size + 'px', height: size + 'px' } }, s, h('div', { class: 'stp-ring-center' }, center));

  let first = true;
  function update(value, max) {
    const p = max > 0 ? value / max : 0;
    const p1 = clamp(p, 0, 1), p2 = clamp(p - 1, 0, 1);
    const apply = () => {
      arc.setAttribute('stroke-dashoffset', circ * (1 - p1));
      lap.setAttribute('stroke-dashoffset', circ * (1 - p2));
      lap.style.opacity = p2 > 0 ? 1 : 0;
      el.classList.toggle('done', p >= 1);
    };
    if (first) { first = false; requestAnimationFrame(() => requestAnimationFrame(apply)); } else apply();
  }
  return { el, update };
}

/**
 * Yerinde güncellenen çubuk grafik: hedef çizgisi, ortalama çizgisi, dokununca değer.
 * labels: (i) => metin | ''   onSelect: (i) => void
 */
export function liveBars({ count, height = 120, labels = () => '', onSelect = null, ariaLabel = '' } = {}) {
  const cols = [], fills = [];
  const plot = h('div', { class: 'stp-bars-plot', style: { height: height + 'px' } });
  const goalLine = h('div', { class: 'stp-bars-line goal hide' });
  const avgLine = h('div', { class: 'stp-bars-line avg hide' });
  const legGoal = h('span', { class: 'stp-leg goal hide' }), legAvg = h('span', { class: 'stp-leg avg hide' });
  const legend = h('div', { class: 'stp-bars-legend' }, legGoal, legAvg);
  plot.append(goalLine, avgLine);
  const lab = h('div', { class: 'stp-bars-labels' });
  for (let i = 0; i < count; i++) {
    const fill = h('i');
    const col = h('button', { type: 'button', class: 'stp-bar', 'aria-label': labels(i, true) || String(i), onClick: () => onSelect?.(i) }, fill);
    cols.push(col); fills.push(fill); plot.appendChild(col);
    lab.appendChild(h('span', null, labels(i)));
  }
  const el = h('div', { class: 'stp-bars' + (count > 12 ? ' dense' : ''), role: 'group', 'aria-label': ariaLabel }, legend, plot, lab);
  let first = true;

  function update(values, { goal = 0, avg = 0, highlight = -1, hits = [], selected = -1 } = {}) {
    const max = Math.max(1, ...values) * 1.08, top = Math.max(max, goal * 1.12);
    const apply = () => {
      values.forEach((v, i) => {
        fills[i].style.height = clamp(v / top, 0, 1) * 100 + '%';
        cols[i].classList.toggle('hl', i === highlight);
        cols[i].classList.toggle('hit', !!hits[i]);
        cols[i].classList.toggle('sel', i === selected);
        cols[i].classList.toggle('zero', !v);
      });
    };
    const line = (node, leg, v, text) => {
      node.classList.toggle('hide', !(v > 0));
      leg.classList.toggle('hide', !(v > 0));
      node.style.bottom = clamp(v / top, 0, 1) * 100 + '%';
      leg.textContent = text;
    };
    line(goalLine, legGoal, goal, 'Hedef ' + fmt.n(goal));
    line(avgLine, legAvg, avg, 'Ortalama ' + fmt.n(avg));
    if (first) { first = false; requestAnimationFrame(() => requestAnimationFrame(apply)); } else apply();
  }
  return { el, update };
}

/** Canlı ivme dalgası (osiloskop). push(signal, thr, t), mark(t) */
export function waveform({ height = 64, span = 4000 } = {}) {
  const canvas = h('canvas', { class: 'stp-wave', height, 'aria-hidden': 'true' });
  const pts = [], marks = [];
  let raf = 0, alive = true, dirty = true, colors = null;
  const push = (s, thr, t) => { pts.push([t, s, thr]); while (pts.length && t - pts[0][0] > span) pts.shift(); dirty = true; };
  const mark = t => { marks.push(t); while (marks.length > 20) marks.shift(); dirty = true; };
  const draw = () => {
    if (!alive) return;
    raf = requestAnimationFrame(draw);
    if (!dirty && pts.length) return;
    dirty = false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 300, hh = height;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
    const g = canvas.getContext('2d');
    if (!colors) colors = { line: cssVar('--line', 'rgba(255,255,255,.07)'), accent: cssVar('--accent', cssVar('--cyan', '#ff7a1a')), mark: cssVar('--text', '#f5f5f7'), thr: cssVar('--lime', '#5fd68a') };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    // ızgara
    g.lineWidth = 1; g.strokeStyle = colors.line;
    g.beginPath(); g.moveTo(0, hh / 2 + .5); g.lineTo(w, hh / 2 + .5); g.stroke();
    if (!pts.length) return;
    const tEnd = performance.now(), tStart = tEnd - span;
    const peak = Math.max(3, ...pts.map(p => Math.abs(p[1])));
    const ys = v => hh / 2 - (v / peak) * (hh / 2 - 4);
    const xs = t => ((t - tStart) / span) * w;
    // adım işaretleri
    g.strokeStyle = colors.mark; g.globalAlpha = .6;
    for (const m of marks) if (m > tStart) { const x = xs(m); g.beginPath(); g.moveTo(x, 4); g.lineTo(x, hh - 4); g.stroke(); }
    g.globalAlpha = 1;
    // eşik
    const thr = pts[pts.length - 1][2] / 2;
    g.setLineDash([3, 4]); g.strokeStyle = colors.thr; g.globalAlpha = .5;
    g.beginPath(); g.moveTo(0, ys(thr)); g.lineTo(w, ys(thr)); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    // sinyal
    g.beginPath();
    pts.forEach((p, i) => { const x = xs(p[0]), y = ys(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = colors.accent; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    dirty = tEnd - pts[pts.length - 1][0] < span; // veri tazeyse akmaya devam et
  };
  raf = requestAnimationFrame(draw);
  const destroy = () => { alive = false; cancelAnimationFrame(raf); };
  return { el: canvas, push, mark, destroy };
}
