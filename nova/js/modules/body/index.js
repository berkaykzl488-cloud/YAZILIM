// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState, backButton } from '../../core/ui.js';
export default { id: 'body', title: 'Vücut Ölçüleri', navLabel: 'Ölçüler', icon: 'scale', css: false,
  render(el) { el.append(backButton(), pageHeader('Vücut Ölçüleri', 'Hazırlanıyor…'), h('div', { class: 'panel' }, emptyState('scale', 'Yakında', ''))); } };
