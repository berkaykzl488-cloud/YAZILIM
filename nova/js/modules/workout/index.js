// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState } from '../../core/ui.js';
export default {
  id: 'workout', title: 'Antrenman', navLabel: 'Antrenman', icon: 'dumbbell', css: false,
  render(el) { el.append(pageHeader('Antrenman', 'Modül yükleniyor…'), h('div', { class: 'panel' }, emptyState('dumbbell', 'Yapım aşamasında', ''))); },
  summary() { return null; },
};
