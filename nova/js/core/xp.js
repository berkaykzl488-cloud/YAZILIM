// Oyunlaştırma: XP, seviye ve rütbe sistemi. Modüller awardXP(miktar, sebep) çağırır.
import { load, save } from './store.js';
import { toast } from './ui.js';

export const RANKS = [
  { level: 1, name: 'Yeni Başlayan', color: 'var(--muted)' },
  { level: 3, name: 'Acemi', color: 'var(--cyan)' },
  { level: 6, name: 'Düzenli', color: 'var(--blue)' },
  { level: 10, name: 'Kararlı', color: 'var(--violet)' },
  { level: 15, name: 'Güçlü', color: 'var(--magenta)' },
  { level: 22, name: 'Usta', color: 'var(--amber)' },
  { level: 30, name: 'Efsane', color: 'var(--lime)' },
];

const xpForLevel = lvl => Math.round(100 * Math.pow(lvl - 1, 1.6)); // seviyeye ulaşmak için toplam XP

export function getXP() {
  return load('xp', { total: 0, log: [] });
}

export function levelInfo(total = getXP().total) {
  let level = 1;
  while (total >= xpForLevel(level + 1)) level++;
  const cur = xpForLevel(level), next = xpForLevel(level + 1);
  const rank = [...RANKS].reverse().find(r => level >= r.level) || RANKS[0];
  return { level, total, cur, next, progress: (total - cur) / (next - cur), rank };
}

/** XP ver. once: aynı anahtarla bir kez verilmesini sağlar (ör. 'steps-goal-2026-11-16') */
export function awardXP(amount, reason = '', { once = null, silent = false } = {}) {
  const st = getXP();
  st.claimed ||= {};
  if (once) {
    if (st.claimed[once]) return false;
    st.claimed[once] = Date.now();
  }
  const before = levelInfo(st.total).level;
  st.total += Math.round(amount);
  st.log = [{ ts: Date.now(), amount: Math.round(amount), reason }, ...(st.log || [])].slice(0, 200);
  save('xp', st);
  const after = levelInfo(st.total);
  if (!silent) toast(`+${Math.round(amount)} puan · ${reason}`, { type: 'xp' });
  if (after.level > before) setTimeout(() => toast(`Tebrikler! Seviye ${after.level} oldun: ${after.rank.name}`, { type: 'xp', ms: 4000 }), 600);
  return true;
}
