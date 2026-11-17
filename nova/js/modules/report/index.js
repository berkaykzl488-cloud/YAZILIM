// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState, backButton } from '../../core/ui.js';
export default { id: 'report', title: 'Haftalık Rapor', navLabel: 'Rapor', icon: 'chart', css: false,
  render(el) { el.append(backButton(), pageHeader('Haftalık Rapor', 'Hazırlanıyor…'), h('div', { class: 'panel' }, emptyState('chart', 'Yakında', ''))); } };
