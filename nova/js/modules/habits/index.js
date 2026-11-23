// Alışkanlıklar — zararlı alışkanlıkları bırakma modülü
import { h, icon, mount, fmt, emptyState } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { TEMPLATES, tpl, list, active, stats, compactClock, spanLabel, span, checkAll, fmtUnits } from './data.js';
import { renderDetail } from './detail.js';
import { renderWizard } from './wizard.js';
import { renderSos } from './sos.js';

let bgTimer = null;

function renderOverview(el) {
  const habits = list();
  const act = habits.filter(x => !x.archived);
  const arch = habits.filter(x => x.archived);
  const live = [];
  checkAll();

  const addBtn = h('button', { class: 'btn primary', onClick: () => go('habits/new') }, icon('plus'), 'Ekle');

  const head = h('div', { class: 'hb-head' },
    h('div', { class: 'grow' }, h('h1', { class: 'hud-title' }, 'Alışkanlıklar'), h('p', { class: 'hud-sub hb-sub' }, 'Zararlı alışkanlıkları bırak')),
    act.length ? addBtn : null);

  if (!act.length) {
    mount(el, head,
      h('div', { class: 'panel hb-intro' },
        h('div', { class: 'hb-intro-ic' }, icon('shield')),
        h('h2', null, 'Bırakmak istediğin bir şey var mı?'),
        h('p', { class: 'muted' }, 'Bir alışkanlık seç. Temiz geçen süreni, biriktirdiğin parayı ve sağlığındaki iyileşmeyi canlı olarak takip et. İstek geldiğinde acil destek ekranı yanında.'),
        h('button', { class: 'btn primary block lg', onClick: () => go('habits/new') }, icon('plus'), 'Alışkanlık ekle')),
      h('div', { class: 'hb-section-h' }, 'Hızlı başla'),
      h('div', { class: 'hb-tplgrid' }, TEMPLATES.map(t => h('button', { class: 'hb-tpl', type: 'button', onClick: () => go('habits/new/' + t.type) },
        h('span', { class: 'hb-tpl-ic' }, icon(t.icon)), h('span', { class: 'hb-tpl-name' }, t.custom ? 'Diğer (özel)' : t.name)))),
      arch.length ? archived(arch) : null);
    return () => {};
  }

  const now = Date.now();
  const sts = act.map(x => stats(x, now));
  const totalSaved = sts.reduce((s, x) => s + x.saved, 0);
  const bestDays = Math.max(...sts.map(x => x.cleanDays));
  const savedEl = h('b', { class: 'c-lime' }, fmt.money(totalSaved));
  live.push(() => { savedEl.textContent = fmt.money(act.reduce((s, x) => s + stats(x).saved, 0)); });

  const cards = act.map(hb => {
    const clk = h('div', { class: 'hb-card-clock mono' });
    const money = h('span');
    const nextTxt = h('span', { class: 'grow hb-card-next-t' });
    const nextPct = h('span', { class: 'mono' });
    const bar = h('div', { class: 'hb-next-bar' });
    const paint = () => {
      const s = stats(hb);
      clk.textContent = compactClock(s.ms);
      money.textContent = hb.costPerDay > 0 ? fmt.money(s.saved) + ' biriktirildi' : fmtUnits(hb, s.units) + ' kaçınıldı';
      if (s.next) { nextTxt.textContent = `Sıradaki: ${spanLabel(s.next.t)} · ${s.next.title}`; nextPct.textContent = `%${Math.floor(s.nextProgress * 100)}`; }
      else { nextTxt.textContent = 'Tüm sağlık adımları tamamlandı'; nextPct.textContent = '%100'; }
      bar.style.setProperty('--p', ((s.next ? s.nextProgress : 1) * 100).toFixed(2) + '%');
    };
    paint();
    live.push(paint);
    return h('a', { class: 'panel click hb-card', href: '#/habits/' + hb.id, 'aria-label': `${hb.name} ayrıntıları` },
      h('div', { class: 'hb-card-top' },
        h('span', { class: 'hb-card-ic' }, icon(hb.icon)),
        h('div', { class: 'grow', style: 'min-width:0' },
          h('div', { class: 'hb-card-name' }, hb.name),
          h('div', { class: 'hb-card-sub' }, money)),
        icon('right', { cls: 'hb-card-chev' })),
      h('div', { class: 'hb-label' }, 'Temiz geçen süre'),
      clk,
      h('div', { class: 'hb-card-next' }, nextTxt, nextPct),
      bar);
  });

  mount(el, head,
    h('div', { class: 'hb-summary' },
      h('div', null, savedEl, h('span', null, 'Toplam birikim')),
      h('div', null, h('b', null, String(bestDays)), h('span', null, 'En uzun temiz gün')),
      h('div', null, h('b', null, String(act.length)), h('span', null, 'Takip edilen'))),
    cards,
    h('button', { class: 'hb-addcard', onClick: () => go('habits/new') }, icon('plus'), 'Başka bir alışkanlık ekle'),
    arch.length ? archived(arch) : null);

  const timer = setInterval(() => live.forEach(f => f()), 1000);
  return () => clearInterval(timer);
}

function archived(arch) {
  return h('details', { class: 'hb-archive' },
    h('summary', null, icon('layers'), `Arşiv (${arch.length})`),
    h('div', { class: 'list' }, arch.map(hb => h('a', { class: 'list-item click', href: '#/habits/' + hb.id },
      h('span', { class: 'li-icon hb-li-dim' }, icon(hb.icon)),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, hb.name), h('div', { class: 'li-sub' }, `En iyi seri: ${span(stats(hb).best, 1)}`)),
      icon('right', { size: 18 })))));
}

export default {
  id: 'habits',
  title: 'Alışkanlıklar',
  navLabel: 'Bırak',
  icon: 'shield',
  css: true,

  init() {
    try { checkAll({ quiet: true }); } catch (e) { console.error(e); }
    clearInterval(bgTimer);
    bgTimer = setInterval(() => { try { checkAll(); } catch (e) { console.error(e); } }, 60000);
  },

  render(el, params = []) {
    const [a, b] = params;
    if (!a) return renderOverview(el);
    if (a === 'new') return renderWizard(el, { type: b && TEMPLATES.some(t => t.type === b) ? b : null });
    if (b === 'sos') return renderSos(el, a);
    if (b === 'edit') return renderWizard(el, { editId: a });
    return renderDetail(el, a);
  },

  summary() {
    const hb = active()[0];
    if (!hb) return null;
    const s = stats(hb);
    return {
      label: hb.name,
      value: String(s.cleanDays),
      unit: 'gün temiz',
      sub: hb.costPerDay > 0 ? fmt.money(s.saved) + ' biriktirildi' : fmtUnits(hb, s.units) + ' kaçınıldı',
      progress: s.next ? s.nextProgress : 1,
      color: 'var(--violet)',
      icon: hb.icon || tpl(hb.type).icon,
    };
  },
};
