// Modül içi gezinme yardımcısı: önceki adresi izler, "Geri" doğru yere gitsin.
import { backButton } from '../../core/ui.js';

let prevHash = '';
let entryHash = '';
let started = false;

export const nav = {
  init() {
    if (started) return;
    started = true;
    window.addEventListener('hashchange', e => {
      try { prevHash = new URL(e.oldURL).hash; } catch { prevHash = ''; }
      if (location.hash.startsWith('#/recipes') && !prevHash.startsWith('#/recipes')) entryHash = prevHash;
    });
  },
  get prev() { return prevHash; },
  /** Modüle girmeden önceki sayfa (ana sayfa, beslenme…) için Geri düğmesi */
  exitButton(label = 'Geri') {
    const target = (entryHash || '#/home').replace(/^#\/?/, '') || 'home';
    return backButton(target, label);
  },
  /** Önceki sayfa tarifler modülündeyse ve verilen önekle başlıyorsa true */
  cameFrom(prefix = '#/recipes') { return !!prevHash && prevHash.startsWith(prefix); },
  /** Geçmişte geri gidilebiliyorsa geri, yoksa yedek adrese */
  back(fallback, prefix = '#/recipes') {
    if (this.cameFrom(prefix) && history.length > 1) history.back();
    else location.hash = '#/' + fallback;
  },
  /** core backButton: modül içinden gelindiyse tarayıcı geri, değilse yedek adres */
  button(fallback, label = 'Geri', prefix = '#/recipes') {
    return backButton(this.cameFrom(prefix) ? null : fallback, label);
  },
};
