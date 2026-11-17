// GEÇİCİ İSKELET — ilgili ajan tarafından değiştirilecek
import { h, pageHeader, emptyState, backButton } from '../../core/ui.js';
export default { id: 'reminders', title: 'Hatırlatıcılar', navLabel: 'Hatırlat', icon: 'clock', css: false,
  render(el) { el.append(backButton(), pageHeader('Hatırlatıcılar', 'Hazırlanıyor…'), h('div', { class: 'panel' }, emptyState('clock', 'Yakında', ''))); } };
