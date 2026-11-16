// İyileşme görseli: sade organ çizimi, iyileştikçe alttan yeşil renkle dolar.
import { svg, h, uid, clamp } from '../../core/ui.js';

const LUNG_L = 'M90 64 C78 58 60 68 50 90 C38 116 33 144 36 166 C38 180 50 186 62 181 C76 175 88 168 91 156 Z';
const LUNG_R = 'M110 64 C122 58 140 68 150 90 C162 116 167 144 164 166 C162 180 150 186 138 181 C124 175 112 168 109 156 Z';

const SHAPES = {
  lungs: {
    label: 'Akciğer', y0: 60, y1: 186,
    parts: [['path', { d: LUNG_L }], ['path', { d: LUNG_R }], ['rect', { x: 94, y: 16, width: 12, height: 60, rx: 6 }]],
    detail: ['M100 70 L100 86 M100 86 L86 98 L72 118 M86 98 L80 134 M72 118 L58 140 M72 118 L70 156',
      'M100 86 L114 98 L128 118 M114 98 L120 134 M128 118 L142 140 M128 118 L130 156',
      'M80 134 L70 146 M120 134 L130 146'],
  },
  heart: {
    label: 'Kalp', y0: 30, y1: 176,
    parts: [['path', { d: 'M100 176 C58 144 26 118 26 80 C26 52 46 34 70 34 C84 34 94 42 100 54 C106 42 116 34 130 34 C154 34 174 52 174 80 C174 118 142 144 100 176 Z' }],
      ['rect', { x: 82, y: 22, width: 14, height: 30, rx: 6 }], ['rect', { x: 104, y: 18, width: 14, height: 34, rx: 6 }]],
    detail: ['M100 58 C96 86 104 116 100 150', 'M58 82 C70 100 86 104 100 104 C114 104 130 100 142 82', 'M70 124 C82 120 92 124 100 132'],
  },
  liver: {
    label: 'Karaciğer', y0: 46, y1: 156,
    parts: [['path', { d: 'M24 92 C22 62 64 46 110 48 C152 50 180 58 176 80 C173 98 154 106 132 120 C110 134 84 156 60 152 C36 148 26 120 24 92 Z' }]],
    detail: ['M112 50 C108 80 104 110 96 146', 'M40 96 C62 92 84 96 106 90', 'M118 82 C134 84 150 80 168 74'],
  },
  brain: {
    label: 'Beyin', y0: 30, y1: 180,
    parts: [
      ['circle', { cx: 68, cy: 74, r: 30 }], ['circle', { cx: 100, cy: 58, r: 30 }], ['circle', { cx: 132, cy: 74, r: 30 }],
      ['circle', { cx: 56, cy: 108, r: 26 }], ['circle', { cx: 144, cy: 108, r: 26 }],
      ['circle', { cx: 84, cy: 120, r: 28 }], ['circle', { cx: 116, cy: 120, r: 28 }],
      ['rect', { x: 92, y: 130, width: 16, height: 50, rx: 8 }],
    ],
    detail: ['M100 34 C94 52 106 70 100 88 C94 106 106 122 100 140', 'M52 82 C62 76 72 84 80 78', 'M120 78 C128 84 138 76 148 82',
      'M48 112 C58 106 66 116 76 110', 'M124 110 C134 116 142 106 152 112', 'M74 130 C82 124 88 132 94 128', 'M106 128 C112 132 118 124 126 130'],
  },
};

/**
 * Organ görseli. kind: lungs|heart|liver|brain, progress 0..1
 * Döner: { el, set(p) }
 */
export function organViz(kind = 'brain', progress = 0, { size = 150 } = {}) {
  const sh = SHAPES[kind] || SHAPES.brain;
  const id = 'hbv' + uid();
  const mk = attrs => sh.parts.map(([t, a]) => svg(t, { ...a, ...attrs }));
  // Dalga: 0'da tepe çizgisi, periyot 50 birim
  let wave = 'M-200 0';
  for (let x = -200; x < 400; x += 50) wave += ` Q${x + 12.5} -6 ${x + 25} 0 T${x + 50} 0`;
  wave += ' L400 260 L-200 260 Z';
  const level = svg('g', { class: 'hbv-level' },
    svg('path', { class: 'hbv-wave2', d: wave }),
    svg('path', { class: 'hbv-wave', d: wave }));

  const s = svg('svg', { class: 'hbv-svg', viewBox: '0 0 200 200', width: size, height: size, role: 'img', 'aria-label': `${sh.label} iyileşme görseli` },
    svg('defs', {}, svg('clipPath', { id: id + '-c' }, mk({}))),
    svg('g', { class: 'hbv-base' }, mk({})),
    svg('g', { 'clip-path': `url(#${id}-c)` }, level),
    svg('g', { class: 'hbv-detail' }, sh.detail.map(d => svg('path', { d }))));

  const set = p => {
    const v = clamp(p, 0, 1);
    const y = sh.y1 - v * (sh.y1 - sh.y0) - (v >= .999 ? 8 : 0);
    level.style.transform = `translateY(${y.toFixed(1)}px)`;
  };
  level.style.transform = `translateY(${sh.y1 + 8}px)`;
  requestAnimationFrame(() => requestAnimationFrame(() => set(progress)));
  const el = h('div', { class: 'hbv', style: { width: size + 'px', height: size + 'px' } }, s);
  return { el, set, label: sh.label };
}

export const organLabel = kind => (SHAPES[kind] || SHAPES.brain).label;
