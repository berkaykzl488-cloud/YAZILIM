// Hash tabanlı yönlendirici. '#/workout/ex/squat' -> modül 'workout', params ['ex','squat']
const routes = new Map();
let current = { id: null, cleanup: null };
let viewEl, onChangeCb;

export function register(mod) { routes.set(mod.id, mod); }
export function modules() { return [...routes.values()]; }
export function getModule(id) { return routes.get(id); }

export function go(path) {
  const target = '#/' + path.replace(/^#?\/?/, '');
  if (location.hash === target) render(); else location.hash = target;
}

export function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { id: parts[0] || 'home', params: parts.slice(1) };
}

async function render() {
  const { id, params } = currentRoute();
  const mod = routes.get(id) || routes.get('home');
  try { current.cleanup?.(); } catch (e) { console.error(e); }
  current = { id: mod.id, cleanup: null };
  const el = document.createElement('div');
  el.className = 'view-enter mod-' + mod.id;
  viewEl.replaceChildren(el);
  window.scrollTo(0, 0);
  try {
    const c = await mod.render(el, params);
    if (current.id === mod.id) current.cleanup = typeof c === 'function' ? c : null;
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="panel"><div class="panel-title">Sistem hatası</div><p class="muted">${String(e?.message || e)}</p></div>`;
  }
  onChangeCb?.(mod.id);
}

/** Aynı rotayı yeniden çizer (veri değişince) */
export const refresh = () => render();

export function start(el, onChange) {
  viewEl = el;
  onChangeCb = onChange;
  window.addEventListener('hashchange', render);
  render();
}
