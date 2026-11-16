// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState } from '../../core/ui.js';
export default {
  id: 'run', title: 'Koşu', navLabel: 'Koşu', icon: 'run', css: false,
  render(el) { el.append(pageHeader('Koşu', 'Modül yükleniyor…'), h('div', { class: 'panel' }, emptyState('run', 'Yapım aşamasında', ''))); },
  summary() { return null; },
};
