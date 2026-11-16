// Adım modülüne özel, yerinde güncellenebilen görseller: büyük halka, çubuk grafik, canlı dalga.
import { h, svg, uid, clamp, fmt } from '../../core/ui.js';

/** Hedef halkası: degrade yay, ilerledikçe yanan çentikler, uçta parlayan nokta, hedef aşılınca ikinci tur. */
export function heroRing({ size = 236, center = null } = {}) {
  const C = size / 2, R = size * 0.385, SW = 13, TICKS = 60;
  const circ = 2 * Math.PI * R;
  const gid = 'stpg-' + uid();
  const arc = svg('circle', { class: 'stp-ring-arc', cx: C, cy: C, r: R, fill: 'none', stroke: `url(#${gid})`, 'stroke-width': SW,
    'stroke-linecap': 'round', 'stroke-dasharray': circ, 'stroke-dashoffset': circ });
  const lap = svg('circle', { class: 'stp-ring-lap', cx: C, cy: C, r: R, fill: 'none', stroke: 'var(--lime)', 'stroke-width': SW - 6,
    'stroke-linecap': 'round', 'stroke-dasharray': circ, 'stroke-dashoffset': circ });
  const ticks = [];
  const tickG = svg('g', { class: 'stp-ring-ticks' });
  for (let i = 0; i < TICKS; i++) {
    const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2, long = i % 5 === 0;
    const r1 = R + SW / 2 + 6, r2 = r1 + (long ? 9 : 5);
    const l = svg('line', { x1: C + Math.cos(a) * r1, y1: C + Math.sin(a) * r1, x2: C + Math.cos(a) * r2, y2: C + Math.sin(a) * r2, class: long ? 'long' : '' });
    ticks.push(l); tickG.appendChild(l);
  }
  const head = svg('g', { class: 'stp-ring-head', style: `transform-origin:${C}px ${C}px` },
    svg('circle', { cx: C, cy: C - R, r: SW / 2 + 4, class: 'halo' }),
    svg('circle', { cx: C, cy: C - R, r: SW / 2 - 2, class: 'dot' }));
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'stp-ring-svg', 'aria-hidden': 'true' },
    svg('defs', {}, svg('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' },
      svg('stop', { offset: '0%', 'stop-color': '#00f0ff' }),
      svg('stop', { offset: '55%', 'stop-color': '#3b8bff' }),
      svg('stop', { offset: '100%', 'stop-color': '#ff2bd6' }))),
    svg('circle', { class: 'stp-ring-orbit', cx: C, cy: C, r: C - 3, fill: 'none' }),
    tickG,
    svg('circle', { cx: C, cy: C, r: R, fill: 'none', stroke: 'rgba(255,255,255,.06)', 'stroke-width': SW }),
    svg('circle', { cx: C, cy: C, r: R - SW / 2 - 7, fill: 'none', class: 'stp-ring-inner' }),
    svg('g', { transform: `rotate(-90 ${C} ${C})` }, arc, lap),
    head);
  const el = h('div', { class: 'stp-ring', style: { width: size + 'px', height: size + 'px' } }, s, h('div', { class: 'stp-ring-center' }, center));

  let first = true;
  function update(value, max) {
    const p = max > 0 ? value / max : 0;
    const p1 = clamp(p, 0, 1), p2 = clamp(p - 1, 0, 1);
    const apply = () => {
      arc.setAttribute('stroke-dashoffset', circ * (1 - p1));
      lap.setAttribute('stroke-dashoffset', circ * (1 - p2));
      head.style.transform = `rotate(${(p >= 1 ? p2 : p1) * 360}deg)`;
      head.classList.toggle('done', p >= 1);
      ticks.forEach((t, i) => t.classList.toggle('lit', i / TICKS < p1 - 1e-9 || p >= 1));
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
  const goalLine = h('div', { class: 'stp-bars-line goal hide' }, h('span', null, ''));
  const avgLine = h('div', { class: 'stp-bars-line avg hide' }, h('span', null, ''));
  plot.append(goalLine, avgLine);
  const lab = h('div', { class: 'stp-bars-labels' });
  for (let i = 0; i < count; i++) {
    const fill = h('i');
    const col = h('button', { type: 'button', class: 'stp-bar', 'aria-label': labels(i, true) || String(i), onClick: () => onSelect?.(i) }, fill);
    cols.push(col); fills.push(fill); plot.appendChild(col);
    lab.appendChild(h('span', null, labels(i)));
  }
  const el = h('div', { class: 'stp-bars' + (count > 12 ? ' dense' : ''), role: 'img', 'aria-label': ariaLabel }, plot, lab);
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
    const line = (node, v, text) => {
      node.classList.toggle('hide', !(v > 0));
      node.style.bottom = clamp(v / top, 0, 1) * 100 + '%';
      node.firstChild.textContent = text;
    };
    line(goalLine, goal, goal ? 'Hedef ' + fmt.n(goal) : '');
    line(avgLine, avg, avg ? 'Ort. ' + fmt.n(avg) : '');
    if (first) { first = false; requestAnimationFrame(() => requestAnimationFrame(apply)); } else apply();
  }
  return { el, update };
}

/** Canlı ivme dalgası (osiloskop). push(signal, thr, t), mark(t) */
export function waveform({ height = 64, span = 4000 } = {}) {
  const canvas = h('canvas', { class: 'stp-wave', height, 'aria-hidden': 'true' });
  const pts = [], marks = [];
  let raf = 0, alive = true, dirty = true;
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
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    // ızgara
    g.strokeStyle = 'rgba(0,240,255,.08)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, hh); g.stroke(); }
    g.beginPath(); g.moveTo(0, hh / 2 + .5); g.lineTo(w, hh / 2 + .5); g.strokeStyle = 'rgba(0,240,255,.18)'; g.stroke();
    if (!pts.length) return;
    const tEnd = performance.now(), tStart = tEnd - span;
    const peak = Math.max(3, ...pts.map(p => Math.abs(p[1])));
    const ys = v => hh / 2 - (v / peak) * (hh / 2 - 4);
    const xs = t => ((t - tStart) / span) * w;
    // adım işaretleri
    g.strokeStyle = 'rgba(255,43,214,.55)';
    for (const m of marks) if (m > tStart) { const x = xs(m); g.beginPath(); g.moveTo(x, 4); g.lineTo(x, hh - 4); g.stroke(); }
    // eşik
    const thr = pts[pts.length - 1][2] / 2;
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(182,255,59,.35)';
    g.beginPath(); g.moveTo(0, ys(thr)); g.lineTo(w, ys(thr)); g.stroke(); g.setLineDash([]);
    // sinyal
    g.beginPath();
    pts.forEach((p, i) => { const x = xs(p[0]), y = ys(p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = '#00f0ff'; g.lineWidth = 2; g.shadowColor = '#00f0ff'; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0;
    dirty = tEnd - pts[pts.length - 1][0] < span; // veri tazeyse akmaya devam et
  };
  raf = requestAnimationFrame(draw);
  const destroy = () => { alive = false; cancelAnimationFrame(raf); };
  return { el: canvas, push, mark, destroy };
}
