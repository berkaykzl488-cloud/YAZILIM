// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState } from '../../core/ui.js';
export default {
  id: 'steps', title: 'Adım Sayar', navLabel: 'Adım', icon: 'steps', css: false,
  render(el) { el.append(pageHeader('Adım Sayar', 'Modül yükleniyor…'), h('div', { class: 'panel' }, emptyState('steps', 'Yapım aşamasında', ''))); },
  summary() { return null; },
};
