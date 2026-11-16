import { h, mount } from '../../core/ui.js';
import { figure, figureStatic, compile } from './figure.js';
import { A } from './poses.js';
export default {
  id: 'workout', title: 'Antrenman', navLabel: 'Spor', icon: 'dumbbell', css: true,
  render(el, params) {
    if (params[0] === 'lab') {
      const only = params[1];
      const ids = Object.keys(A).filter(k => !only || only.split(',').includes(k));
      el.classList.toggle('lab-big', !!only); mount(el, ids.map(id => {
        const c = compile(A[id]);
        return h('div', { class: 'panel tight', dataset: { id } }, h('b', null, id),
          h('div', { class: 'lab-grid' }, c.frames.map((f, i) => h('div', null, figureStatic(A[id], i, { muscles: { p: ['quads', 'glutes', 'chest'], s: ['abs'] } })))));
      }));
      return;
    }
    el.append(h('p', null, 'yapım'));
  },
  summary() { return null; },
};
