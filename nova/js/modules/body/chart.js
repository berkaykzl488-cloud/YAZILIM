// Vücut ölçüleri — zaman eksenli çizgi grafik (SVG, bağımlılıksız).
import { svg, h, fmt } from '../../core/ui.js';
import { parseKey } from '../../core/store.js';

/**
 * points: [{date:'YYYY-MM-DD', v}] (tarih sıralı)
 * Tarih ekseni gerçek zamana göre ölçeklenir (eşit aralık değil).
 */
export function lineChart(points, { unit = 'cm', dec = 1, color = 'var(--accent)', W = 340, H = 200, fmtV = v => fmt.n(v, dec) + ' ' + unit } = {}) {
  const padL = 40, padR = 14, padT = 16, padB = 28;
  const iw = W - padL - padR, ih = H - padT - padB;
  const ts = points.map(p => parseKey(p.date).getTime());
  const t0 = Math.min(...ts), t1 = Math.max(...ts), tr = t1 - t0 || 1;
  let mn = Math.min(...points.map(p => p.v)), mx = Math.max(...points.map(p => p.v));
  const span = mx - mn;
  const padV = span ? span * 0.18 : Math.max(1, Math.abs(mx) * 0.03);
  mn -= padV; mx += padV;
  const X = t => (points.length === 1 ? padL + iw / 2 : padL + ((t - t0) / tr) * iw);
  const Y = v => padT + ih - ((v - mn) / (mx - mn)) * ih;

  const grid = [];
  for (let i = 0; i <= 3; i++) {
    const v = mn + (mx - mn) * (i / 3), y = Y(v);
    grid.push(svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'bd-grid' }));
    grid.push(svg('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', class: 'bd-axis' }, fmt.n(v, span < 4 ? 1 : 0)));
  }
  // Tarih etiketleri: ilk, son (+ ortada biri, sığarsa)
  const labelIdx = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  const xLabels = [...new Set(labelIdx)].map((i, k, arr) => svg('text', {
    x: X(ts[i]), y: H - 8, class: 'bd-axis',
    'text-anchor': points.length === 1 ? 'middle' : k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle',
  }, fmt.date(points[i].date, 'short')));

  const pts = points.map((p, i) => [X(ts[i]), Y(p.v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = pts.length > 1 ? `${d} L${pts.at(-1)[0].toFixed(1)} ${padT + ih} L${pts[0][0].toFixed(1)} ${padT + ih} Z` : '';

  const tip = svg('g', { class: 'bd-tip', opacity: 0 });
  const tipBg = svg('rect', { rx: 8, height: 34, class: 'bd-tip-bg' });
  const tipT1 = svg('text', { class: 'bd-tip-v', 'text-anchor': 'middle' });
  const tipT2 = svg('text', { class: 'bd-tip-d', 'text-anchor': 'middle' });
  tip.append(tipBg, tipT1, tipT2);
  const showTip = i => {
    const [x, y] = pts[i];
    tipT1.textContent = fmtV(points[i].v);
    tipT2.textContent = fmt.date(points[i].date, 'short');
    const w = 78, tx = Math.min(W - padR - w / 2, Math.max(padL + w / 2, x)), ty = y - 44 < 0 ? y + 12 : y - 44;
    tipBg.setAttribute('x', tx - w / 2); tipBg.setAttribute('y', ty); tipBg.setAttribute('width', w);
    tipT1.setAttribute('x', tx); tipT1.setAttribute('y', ty + 15);
    tipT2.setAttribute('x', tx); tipT2.setAttribute('y', ty + 28);
    tip.setAttribute('opacity', 1);
  };

  const dots = pts.map((p, i) => svg('circle', { cx: p[0], cy: p[1], r: i === pts.length - 1 ? 5 : 3.5, class: 'bd-dot' + (i === pts.length - 1 ? ' last' : ''), style: `stroke:${color}` }));
  const svgEl = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bd-chart', role: 'img', 'aria-label': `Grafik: ${points.length} ölçüm` },
    grid,
    area ? svg('path', { d: area, style: `fill:${color}`, opacity: 0.12 }) : null,
    svg('path', { d, fill: 'none', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', style: `stroke:${color}` }),
    dots, xLabels, tip);

  // Dokunarak en yakın noktayı göster
  const onPoint = e => {
    const r = svgEl.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(pts[best][0] - x)) best = i; });
    showTip(best);
  };
  svgEl.addEventListener('pointerdown', onPoint);
  svgEl.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'mouse') onPoint(e); });
  svgEl.addEventListener('pointerleave', () => tip.setAttribute('opacity', 0));
  if (pts.length) requestAnimationFrame(() => showTip(pts.length - 1));
  return h('div', { class: 'bd-chart-wrap' }, svgEl);
}
