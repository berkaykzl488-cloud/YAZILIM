// Koşu modülü — GPS ile koşu/yürüyüş/bisiklet/doğa yürüyüşü takibi, kendi haritası, geçmiş ve rekorlar.
// Rotalar: #/run (başla / canlı / bitiş özeti), #/run/history, #/run/stats, #/run/detail/<id>
import { h, mount, fmt, toast } from '../../core/ui.js';
import { go, currentRoute } from '../../core/router.js';
import { tracker } from './tracker.js';
import { getRuns, runsOn, totals, getSettings, typeOf, km } from './data.js';
import { renderIdle } from './idle.js';
import { renderLive } from './live.js';
import { renderDetail } from './detail.js';
import { renderSummary, renderHistory, renderStats } from './screens.js';
import { rIcon } from './common.js';

const mainScreen = () => (tracker.active ? 'live' : tracker.status === 'finished' ? 'summary' : 'idle');

/** Başka sayfadayken kaydın sürdüğünü gösteren dokunulabilir şerit */
function initPill() {
  const pill = h('button', { class: 'rn-pill hide', type: 'button', onClick: () => go('run') });
  document.body.appendChild(pill);
  const paint = () => {
    const onRun = currentRoute().id === 'run';
    const show = tracker.active && !onRun;
    pill.classList.toggle('hide', !show);
    if (!show) return;
    const s = tracker.s;
    pill.classList.toggle('paused', s.status !== 'running' || s.autoPaused);
    mount(pill, h('i', { class: 'rn-dot' }), rIcon(typeOf(s.type).icon, { size: 16 }),
      h('b', null, `${km(s.distM)} km · ${fmt.duration(tracker.movingSec())}`));
    const st = s.status === 'running' ? (s.autoPaused ? 'otomatik duraklatıldı' : 'sürüyor') : 'duraklatıldı';
    pill.setAttribute('aria-label', `Kayıt ${st}. Kayda dön`);
  };
  tracker.on(paint);
  window.addEventListener('hashchange', paint);
  paint();
}

export default {
  id: 'run',
  title: 'Koşu',
  navLabel: 'Koşu',
  icon: 'run',
  css: true,

  init() {
    if (tracker.restore()) {
      setTimeout(() => toast(tracker.status === 'finished' ? 'Kaydedilmemiş bir aktiviten var' : 'Yarım kalan kayıt geri yüklendi', { ms: 3500 }), 900);
    }
    initPill();
  },

  render(el, params = []) {
    const [sub, id] = params;
    if (sub === 'history') return renderHistory(el);
    if (sub === 'stats') return renderStats(el);
    if (sub === 'detail' && id) return renderDetail(el, id);

    // Ana ekran: kayıt durumuna göre başla / canlı / özet
    let screen = null, cleanup = null;
    const show = () => {
      const next = mainScreen();
      if (next === screen) return;
      try { cleanup?.(); } catch (e) { console.error(e); }
      screen = next;
      el.replaceChildren();
      window.scrollTo(0, 0);
      cleanup = next === 'live' ? renderLive(el) : next === 'summary' ? renderSummary(el) : renderIdle(el);
    };
    show();
    const off = tracker.on(type => { if (type === 'status') show(); });
    return () => { off(); try { cleanup?.(); } catch (e) { console.error(e); } };
  },

  /** Ana panel kartı */
  summary(dateKey) {
    const list = runsOn(dateKey);
    const t = totals(list);
    let distM = t.distM, sec = t.sec, count = t.count, live = false;
    const s = tracker.s;
    if (s && tracker.active) {
      const d = new Date(s.startTs);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (k === dateKey) { distM += s.distM; sec += tracker.movingSec(); count += 1; live = true; }
    }
    const kmVal = distM / 1000;
    const goal = getSettings().weeklyGoalKm;
    const daily = goal > 0 ? goal / 7 : 0;
    return {
      label: 'Koşu',
      value: fmt.n(kmVal, kmVal >= 10 ? 1 : 2),
      unit: 'km',
      sub: live ? 'Kayıt sürüyor' : count ? `${count} aktivite · ${fmt.duration(sec)}` : 'Bugün aktivite yok',
      progress: daily > 0 ? Math.min(1, kmVal / daily) : null,
      color: 'var(--magenta)',
      icon: 'run',
    };
  },

  /** O gün yakılan aktif kalori */
  burned(dateKey) {
    let kcal = runsOn(dateKey).reduce((a, r) => a + (r.kcal || 0), 0);
    if (tracker.active) {
      const d = new Date(tracker.s.startTs);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (k === dateKey) kcal += tracker.kcal();
    }
    return Math.round(kcal);
  },

  // Diğer modüller için ek uçlar
  runs: () => getRuns(),
  tracker,
};
