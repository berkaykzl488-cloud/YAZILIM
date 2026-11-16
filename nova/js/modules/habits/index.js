// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState } from '../../core/ui.js';
export default {
  id: 'habits', title: 'Arınma', navLabel: 'Arınma', icon: 'shield', css: false,
  render(el) { el.append(pageHeader('Arınma', 'Modül yükleniyor…'), h('div', { class: 'panel' }, emptyState('shield', 'Yapım aşamasında', ''))); },
  summary() { return null; },
};
