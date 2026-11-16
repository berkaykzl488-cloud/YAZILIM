// Ortak arayüz yardımcıları: DOM üretici, biçimlendirme, toast, modal, halka/çubuk grafikler.
import { icon } from './icons.js';

/**
 * h('div', { class: 'panel', onClick: fn, style: {color:'red'}, dataset: {id: 1} }, 'metin', childNode, [dizi])
 * Özel prop'lar: class, style (nesne/dize), html (innerHTML), dataset, on<Olay>, ref (fn(el)).
 * Diğer prop'lar: boolean true -> boş öznitelik, false/null -> atlanır, input için value/checked özelliğe atanır.
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style') typeof v === 'string' ? (el.style.cssText = v) : Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'ref') v(el);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** SVG elemanı üretir: svg('circle', {cx:5, cy:5, r:3}) */
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c != null) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export { icon };

/** İçeriği temizleyip yenileriyle değiştirir */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Biçimlendirme (tr-TR) ----------
const nf = new Map();
function numFmt(dec) {
  if (!nf.has(dec)) nf.set(dec, new Intl.NumberFormat('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  return nf.get(dec);
}
export const fmt = {
  n: (x, dec = 0) => numFmt(dec).format(Number.isFinite(+x) ? +x : 0),
  kcal: x => numFmt(0).format(Math.round(x || 0)) + ' kcal',
  /** metre -> '3,42 km' veya '850 m' */
  dist: m => (m >= 1000 ? numFmt(2).format(m / 1000) + ' km' : numFmt(0).format(m || 0) + ' m'),
  km: m => numFmt(2).format((m || 0) / 1000),
  /** saniye -> 'h:mm:ss' veya 'mm:ss' */
  duration(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  },
  /** saniye/km -> "5'32\"" */
  pace(secPerKm) {
    if (!Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return "–'––\"";
    const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
    return `${m}'${String(s === 60 ? 59 : s).padStart(2, '0')}"`;
  },
  /** 'YYYY-MM-DD' -> '16 Kasım Pazartesi' (long) / '16 Kas' (short) / 'Pzt' (weekday) */
  date(key, style = 'long') {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (style === 'short') return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    if (style === 'weekday') return dt.toLocaleDateString('tr-TR', { weekday: 'short' });
    if (style === 'full') return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
    return dt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  },
  time: ts => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  dateTime: ts => new Date(ts).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  money: x => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(x || 0),
};

// ---------- Geri bildirim ----------
let toastWrap;
const TOAST_ICON = { info: 'info', success: 'check', error: 'alert', xp: 'sparkle' };
export function toast(msg, { type = 'info', ms = 2600 } = {}) {
  if (!toastWrap) { toastWrap = h('div', { class: 'toast-wrap' }); document.body.appendChild(toastWrap); }
  const t = h('div', { class: `toast ${type}`, role: 'status' }, icon(TOAST_ICON[type] || 'info'), h('span', null, msg));
  toastWrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}

export function haptic(pattern = 12) {
  try { navigator.vibrate?.(pattern); } catch { /* yok */ }
}

/**
 * modal({ title, body: Node|string, actions: [{label, class, onClick(close) -> false ile açık kalır}], onClose })
 * Kapatma fonksiyonu döner.
 */
export function modal({ title = '', body = null, actions = [], onClose, dismissable = true } = {}) {
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    back.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = e => { if (e.key === 'Escape' && dismissable) close(); };
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onClick: e => e.stopPropagation() },
    h('div', { class: 'modal-head' },
      h('h3', null, title),
      dismissable && h('button', { class: 'btn ghost icon sm', 'aria-label': 'Kapat', onClick: close }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-actions' }, actions.map(a =>
      h('button', { class: 'btn ' + (a.class || ''), onClick: () => { if (a.onClick?.(close) !== false) close(); } }, a.icon && icon(a.icon), a.label))) : null);
  const back = h('div', { class: 'modal-backdrop', onClick: () => dismissable && close() }, box);
  document.body.appendChild(back);
  document.addEventListener('keydown', onKey);
  return close;
}

export function confirmDialog(message, { title = 'Onay', okLabel = 'Evet', cancelLabel = 'Vazgeç', danger = false } = {}) {
  return new Promise(resolve => {
    let answered = false;
    modal({
      title,
      body: h('p', { class: 'muted', style: 'margin:0' }, message),
      actions: [
        { label: cancelLabel, class: 'ghost', onClick: () => { answered = true; resolve(false); } },
        { label: okLabel, class: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

/** Sayısal değer isteyen küçük diyalog. Promise<number|null> */
export function promptNumber({ title, label = '', value = '', unit = '', min = 0, max = 1e9, step = 'any' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const inp = h('input', { class: 'input mono', type: 'number', inputmode: 'decimal', value, min, max, step });
    modal({
      title,
      body: h('label', { class: 'field' }, h('span', null, label + (unit ? ` (${unit})` : '')), inp),
      actions: [
        { label: 'Vazgeç', class: 'ghost', onClick: () => { done = true; resolve(null); } },
        { label: 'Kaydet', class: 'primary', onClick: () => {
          const v = parseFloat(String(inp.value).replace(',', '.'));
          if (!Number.isFinite(v) || v < min || v > max) { toast('Geçerli bir değer gir', { type: 'error' }); return false; }
          done = true; resolve(v);
        } },
      ],
      onClose: () => { if (!done) resolve(null); },
    });
    setTimeout(() => inp.focus(), 50);
  });
}

// ---------- Görsel bileşenler ----------
/** Dairesel ilerleme halkası. center: ortaya konacak Node/metin */
export function ring({ value = 0, max = 100, size = 120, stroke = 10, color = 'var(--cyan)', track = 'rgba(255,255,255,.08)', center = null, glow = false } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  const val = svg('circle', { class: 'ring-val', cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke,
    'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': c,
    style: glow ? `filter: drop-shadow(0 0 6px ${color})` : null });
  const s = svg('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
    svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: track, 'stroke-width': stroke }),
    val);
  requestAnimationFrame(() => requestAnimationFrame(() => val.setAttribute('stroke-dashoffset', c * (1 - pct))));
  return h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } }, s, h('div', { class: 'ring-center' }, center));
}

export function progressBar(value, max, { color, thin = false } = {}) {
  const pct = max > 0 ? clamp(value / max, 0, 1) * 100 : 0;
  const i = h('i', { style: { width: '0%', ...(color ? { background: color } : {}) } });
  requestAnimationFrame(() => requestAnimationFrame(() => { i.style.width = pct + '%'; }));
  return h('div', { class: 'progress' + (thin ? ' thin' : '') }, i);
}

/** data: [{label, value, highlight?}] */
export function barChart(data, { height = 120, max, color, format = v => fmt.n(v) } = {}) {
  const m = max ?? Math.max(1, ...data.map(d => d.value || 0));
  return h('div', { class: 'bars', style: { height: height + 'px' } }, data.map(d => {
    const i = h('i', { style: { height: '0%', ...(color && !d.highlight ? { background: color } : {}) }, title: `${d.label}: ${format(d.value || 0)}` });
    requestAnimationFrame(() => requestAnimationFrame(() => { i.style.height = clamp((d.value || 0) / m, 0, 1) * 100 + '%'; }));
    return h('div', { class: 'bar' + (d.highlight ? ' hl' : '') }, i, h('span', null, d.label));
  }));
}

export function sparkline(values, { width = 120, height = 36, color = 'var(--cyan)', fill = true } = {}) {
  const v = values.length ? values : [0];
  const mx = Math.max(...v), mn = Math.min(...v), rng = mx - mn || 1;
  const pts = v.map((y, i) => [v.length === 1 ? width / 2 : (i / (v.length - 1)) * width, height - 3 - ((y - mn) / rng) * (height - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'sparkline' },
    fill ? svg('path', { d: `${d} L${width} ${height} L0 ${height} Z`, fill: color, opacity: .12 }) : null,
    svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
}

export function emptyState(iconName, title, text, action = null) {
  return h('div', { class: 'empty' }, icon(iconName), h('h4', null, title), text && h('p', { class: 'small', style: 'margin:4px 0 12px' }, text), action);
}

/** Alt sayfalar için standart "Geri" düğmesi. path verilmezse tarayıcı geçmişinde geri gider. */
export function backButton(path = null, label = 'Geri') {
  return h('button', { class: 'back-btn', type: 'button', 'aria-label': label, onClick: () => {
    if (path) location.hash = '#/' + path.replace(/^#?\/?/, '');
    else if (history.length > 1) history.back();
    else location.hash = '#/home';
  } }, icon('left'), label);
}

export function sectionTitle(text, right = null) {
  return h('div', { class: 'section-title' }, h('span', { class: 'st-text' }, text), right);
}

export function pageHeader(title, sub = '', right = null) {
  return h('div', { class: 'row between', style: 'align-items:flex-start' },
    h('div', { class: 'grow' }, h('h1', { class: 'hud-title' }, title), sub && h('p', { class: 'hud-sub' }, sub)),
    right);
}

export function stat(label, value, unit = '', { cls = '' } = {}) {
  return h('div', { class: 'stat ' + cls },
    h('div', { class: 'stat-value' }, value, unit && h('span', { class: 'stat-unit' }, unit)),
    h('div', { class: 'stat-label' }, label));
}

/** Sekme çubuğu. tabs: [{id,label}], onChange(id) */
export function tabs(items, active, onChange) {
  const wrap = h('div', { class: 'tabs', role: 'tablist' });
  const render = cur => mount(wrap, items.map(t => h('button', {
    class: 'tab' + (t.id === cur ? ' active' : ''), role: 'tab', 'aria-selected': String(t.id === cur),
    onClick: () => { render(t.id); onChange(t.id); },
  }, t.label)));
  render(active);
  return wrap;
}

/** Açma/kapama anahtarı */
export function toggle(checked, onChange) {
  const inp = h('input', { type: 'checkbox', checked, onChange: e => onChange(e.target.checked) });
  return h('label', { class: 'toggle' }, inp, h('i'));
}

/** Sayı ayarlayıcı */
export function stepper(value, { min = 0, max = 9999, step = 1, onChange } = {}) {
  const inp = h('input', { type: 'number', inputmode: 'decimal', value, min, max, step });
  const set = v => { v = clamp(Math.round(v / step) * step, min, max); inp.value = +v.toFixed(2); onChange?.(+inp.value); };
  inp.addEventListener('change', () => set(parseFloat(inp.value) || 0));
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', onClick: () => set((parseFloat(inp.value) || 0) - step) }, '−'), inp,
    h('button', { type: 'button', onClick: () => set((parseFloat(inp.value) || 0) + step) }, '+'));
}

/** Basit metin/şablon sayısı animasyonu */
export function countUp(el, to, { ms = 900, dec = 0 } = {}) {
  const start = performance.now();
  const step = t => {
    const p = clamp((t - start) / ms, 0, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt.n(to * e, dec);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return el;
}
