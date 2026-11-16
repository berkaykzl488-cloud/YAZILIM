// Antrenman modülü: ev ve salon antrenmanları, animasyonlu egzersiz kütüphanesi, canlı antrenman, geçmiş.
import { h, mount, fmt, toast } from '../../core/ui.js';
import { currentRoute } from '../../core/router.js';
import { figureStatic, compile } from './figure.js';
import { A } from './poses.js';
import { renderPlan, renderProgram, renderBuilder } from './plan.js';
import { renderLibrary, renderDetail } from './library.js';
import { renderSession } from './session.js';
import { renderTimer } from './timer.js';
import { renderHistory, renderLog } from './history.js';
import { getActive, setActive, daySummary } from './data.js';
import { todayKey } from '../../core/store.js';
import { alertEnd } from './kit.js';

/** Geliştirici sayfası: tüm animasyonların anahtar kareleri (#/workout/lab) */
function renderLab(el, only) {
  const ids = Object.keys(A).filter(k => !only || only.split(',').includes(k));
  el.classList.toggle('lab-big', !!only);
  mount(el, ids.map(id => {
    const c = compile(A[id]);
    return h('div', { class: 'panel tight', dataset: { id } }, h('b', null, id),
      h('div', { class: 'lab-grid' }, c.frames.map((f, i) => h('div', null, figureStatic(A[id], i, { muscles: { p: ['quads', 'glutes', 'chest'], s: ['abs'] } })))));
  }));
}

export default {
  id: 'workout',
  title: 'Antrenman',
  navLabel: 'Spor',
  icon: 'dumbbell',
  css: true,

  init() {
    // Kullanıcı başka sayfadayken dinlenme biterse haber ver
    setInterval(() => {
      const a = getActive();
      if (!a?.rest || a.rest.endTs > Date.now()) return;
      const onSession = currentRoute().id === 'workout' && currentRoute().params[0] === 'session';
      if (onSession) return; // canlı ekran kendisi yönetir
      a.rest = null; setActive(a);
      alertEnd();
      toast('Dinlenme bitti. Antrenmana dönmek için Spor sekmesine dokun.', { type: 'info', ms: 4000 });
    }, 1000);
  },

  render(el, params = []) {
    const [p0, p1] = params;
    switch (p0) {
      case 'lib': return renderLibrary(el);
      case 'ex': return renderDetail(el, p1);
      case 'prog': return renderProgram(el, p1);
      case 'build': return renderBuilder(el, p1);
      case 'session': return renderSession(el);
      case 'timer': return renderTimer(el);
      case 'history': return renderHistory(el);
      case 'log': return renderLog(el, p1);
      case 'lab': return renderLab(el, p1);
      default: return renderPlan(el);
    }
  },

  summary(dateKey) {
    const d = daySummary(dateKey);
    const active = getActive();
    const isToday = dateKey === todayKey();
    let sub = d.count ? `${d.count} antrenman · ${fmt.n(d.vol)} kg` : (isToday ? 'Bugün antrenman yok' : 'Antrenman yok');
    if (isToday && active) sub = 'Devam eden antrenman var';
    return { label: 'Antrenman', value: fmt.n(d.mins), unit: 'dk', sub, progress: Math.min(1, d.mins / 30), color: 'var(--lime)', icon: 'dumbbell' };
  },

  burned(dateKey) {
    return Math.round(daySummary(dateKey).kcal);
  },
};
