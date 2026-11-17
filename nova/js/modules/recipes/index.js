// Fit Tarifler — sağlıklı, sporcu dostu tarif koleksiyonu.
// Rotalar: #/recipes, #/recipes/<id>, #/recipes/<id>/cook, #/recipes/shopping, #/recipes/plan
import { h, emptyState, backButton } from '../../core/ui.js';
import { loadAll, getRecipe } from './data.js';
import { nav } from './nav.js';

export default {
  id: 'recipes',
  title: 'Fit Tarifler',
  navLabel: 'Tarifler',
  icon: 'food',
  css: true,

  init() { nav.init(); },

  async render(el, params = []) {
    const [a, b] = params;
    const loading = h('div', { class: 'rcp-loading' }, h('div', { class: 'rcp-spinner' }), 'Tarifler yükleniyor…');
    el.appendChild(loading);
    await loadAll();
    loading.remove();

    if (a === 'shopping') return (await import('./shopping.js')).renderShopping(el);
    if (a === 'plan') return (await import('./plan.js')).renderPlan(el);
    if (a) {
      const r = getRecipe(a);
      if (!r) {
        el.append(backButton('recipes', 'Tarifler'),
          h('div', { class: 'panel' }, emptyState('search', 'Tarif bulunamadı', 'Bu tarif kaldırılmış ya da bağlantı hatalı olabilir.',
            h('a', { class: 'btn primary', href: '#/recipes' }, 'Tariflere dön'))));
        return;
      }
      if (b === 'cook') return (await import('./cook.js')).renderCook(el, r);
      return (await import('./detail.js')).renderDetail(el, r);
    }
    return (await import('./browse.js')).renderBrowse(el);
  },
};
