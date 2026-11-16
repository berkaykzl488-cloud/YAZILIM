// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState } from '../../core/ui.js';
export default {
  id: 'nutrition', title: 'Beslenme', navLabel: 'Beslenme', icon: 'food', css: false,
  render(el) { el.append(pageHeader('Beslenme', 'Modül yükleniyor…'), h('div', { class: 'panel' }, emptyState('food', 'Yapım aşamasında', ''))); },
  summary() { return null; },
};
