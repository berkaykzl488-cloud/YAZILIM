// Koşu modülü — Türkçe sesli koç (speechSynthesis) ve titreşim.
import { getSettings } from './data.js';

let trVoice = null;
function pickVoice() {
  try {
    const vs = window.speechSynthesis?.getVoices() || [];
    trVoice = vs.find(v => /^tr(-|_|$)/i.test(v.lang)) || null;
  } catch { trVoice = null; }
}
if ('speechSynthesis' in window) {
  pickVoice();
  try { window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice); } catch { /* eski tarayıcı */ }
}

export const voiceSupported = () => 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

/** Metni Türkçe okur (ayar kapalıysa sessiz). force: ayardan bağımsız (deneme düğmesi). */
export function speak(text, { force = false, interrupt = false } = {}) {
  if (!voiceSupported() || (!force && !getSettings().voice)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'tr-TR';
    if (trVoice) u.voice = trVoice;
    u.rate = 1.0;
    u.pitch = 1.0;
    if (interrupt) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch { /* desteklenmiyor */ }
}

export function vibrate(pattern) {
  if (!getSettings().vibrate) return;
  try { navigator.vibrate?.(pattern); } catch { /* yok */ }
}
