// GEÇİCİ İSKELET — tarif ajanı tarafından değiştirilecek
import { h, pageHeader, emptyState } from '../../core/ui.js';
export default { id: 'recipes', title: 'Fit Tarifler', navLabel: 'Tarifler', icon: 'food', css: false,
  render(el) { el.append(pageHeader('Fit Tarifler', 'Hazırlanıyor…'), h('div', { class: 'panel' }, emptyState('food', 'Yakında', ''))); } };
