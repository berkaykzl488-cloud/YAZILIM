// Koşu modülü — SVG çizgi/alan grafikleri (tempo, yükseklik) ve rota analiz serileri.
import { h, svg, fmt } from '../../core/ui.js';
import { cumDist, movingTimes, rollingSpeeds, smoothAlt } from './geo.js';

/**
 * Alan grafiği. xs/ys aynı uzunlukta; invert: büyük değer aşağıda (tempo).
 * opts: { color, height, fmtY, fmtX, avg (yatay referans çizgisi), label }
 */
export function areaChart(xs, ys, { color = 'var(--cyan)', height = 140, fmtY = v => fmt.n(v), fmtX = v => fmt.n(v / 1000, 1) + ' km', invert = false, avg = null, avgLabel = '' } = {}) {
  const W = 320, H = 100;
  const valid = ys.map((y, i) => [xs[i], y]).filter(([, y]) => Number.isFinite(y));
  if (valid.length < 2) return null;
  let mn = Infinity, mx = -Infinity;
  for (const [, y] of valid) { if (y < mn) mn = y; if (y > mx) mx = y; }
  if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
  const padY = (mx - mn) * 0.12; mn -= padY; mx += padY;
  const x0 = valid[0][0], x1 = valid[valid.length - 1][0] || 1;
  const X = x => ((x - x0) / (x1 - x0 || 1)) * W;
  const Y = y => { const f = (y - mn) / (mx - mn); return invert ? f * H : H - f * H; };
  const line = valid.map(([x, y], i) => (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1)).join(' ');
  const base = invert ? 0 : H;
  const area = `${line} L${X(valid[valid.length - 1][0]).toFixed(1)} ${base} L${X(valid[0][0]).toFixed(1)} ${base} Z`;
  const gid = 'ag' + Math.random().toString(36).slice(2, 8);
  const grid = [0.25, 0.5, 0.75].map(f => svg('line', { x1: 0, x2: W, y1: H * f, y2: H * f, stroke: 'rgba(255,255,255,.06)', 'vector-effect': 'non-scaling-stroke' }));
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'rn-chart-svg', 'aria-hidden': 'true' },
    svg('defs', {}, svg('linearGradient', { id: gid, x1: 0, y1: invert ? 1 : 0, x2: 0, y2: invert ? 0 : 1 },
      svg('stop', { offset: 0, style: `stop-color:${color};stop-opacity:.35` }),
      svg('stop', { offset: 1, style: `stop-color:${color};stop-opacity:0` }))),
    grid,
    svg('path', { d: area, fill: `url(#${gid})` }),
    avg != null && Number.isFinite(avg) ? svg('line', { x1: 0, x2: W, y1: Y(avg), y2: Y(avg), stroke: 'rgba(255,255,255,.45)', 'stroke-dasharray': '4 4', 'vector-effect': 'non-scaling-stroke' }) : null,
    svg('path', { d: line, fill: 'none', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', style: `stroke:${color}` }));
  const top = invert ? mn + padY : mx - padY, bot = invert ? mx - padY : mn + padY;
  return h('div', { class: 'rn-chart', style: { height: height + 'px' } },
    h('div', { class: 'rn-chart-y' }, h('span', null, fmtY(top)), h('span', null, fmtY(bot))),
    h('div', { class: 'rn-chart-plot' }, s,
      avg != null && Number.isFinite(avg) ? h('span', { class: 'rn-chart-avg', style: { top: (Y(avg) / H * 100) + '%' } }, avgLabel) : null),
    h('div', { class: 'rn-chart-x' }, h('span', null, fmtX(x0)), h('span', null, fmtX((x0 + x1) / 2)), h('span', null, fmtX(x1))));
}

/** Kayıt için grafik serileri: mesafe ekseni, tempo (sn/km), hız (m/sn), yükseklik */
export function routeSeries(run, bins = 120) {
  const pts = run.points || [];
  if (pts.length < 2) return null;
  const cum = cumDist(pts, run.breaks || []);
  const total = cum[cum.length - 1] || 1;
  const k = run.distM > 0 ? run.distM / total : 1;
  for (let i = 0; i < cum.length; i++) cum[i] *= k;
  const mt = movingTimes(pts);
  const sp = rollingSpeeds(pts, cum, mt, run.breaks || [], 30);
  const alt = smoothAlt(pts, 0.3);
  const D = cum[cum.length - 1];
  const nb = Math.min(bins, Math.max(8, Math.floor(D / 25)));
  const xs = [], speed = [], elev = [];
  let j = 0;
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * D, e = ((b + 1) / nb) * D;
    let ss = 0, sc = 0, as = 0, ac = 0;
    while (j < pts.length && cum[j] <= e) {
      if (cum[j] >= a) { if (sp[j] > 0) { ss += sp[j]; sc++; } if (alt[j] != null) { as += alt[j]; ac++; } }
      j++;
    }
    xs.push((a + e) / 2);
    speed.push(sc ? ss / sc : NaN);
    elev.push(ac ? as / ac : NaN);
  }
  // Boş kovaları komşudan doldur
  for (let i = 0; i < nb; i++) if (!Number.isFinite(speed[i])) speed[i] = speed[i - 1] ?? NaN;
  const hasAlt = elev.filter(Number.isFinite).length >= 2;
  return { xs, speed, pace: speed.map(v => (v > 0.3 ? 1000 / v : NaN)), elev: hasAlt ? elev : null };
}
