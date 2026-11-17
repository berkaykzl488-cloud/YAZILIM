// Paylaşılabilir haftalık özet görseli (1080×1350, koyu zemin + turuncu vurgu)
export const W = 1080, H = 1350;
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const C = { bg: '#111113', tile: '#1b1b1f', line: 'rgba(255,255,255,0.07)', text: '#f5f5f7', muted: '#a0a0ab', dim: '#66666f',
  accent: '#ff7a1a', good: '#3fd17f', bad: '#ff4d57' };

const f = (size, weight = 400) => `${weight} ${size}px ${FONT}`;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Metni genişliğe sığacak şekilde satırlara böler */
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/[ \t\n]+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last.length && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    keep[maxLines - 1] = last.replace(/[\s,]+$/, '') + '…';
    return keep;
  }
  return lines;
}

/** Değer + birim; sığmazsa yazı boyutunu küçültür */
function valueText(ctx, x, y, maxW, value, unit, size = 66) {
  let s = size;
  for (;;) {
    ctx.font = f(s, 800);
    const vw = ctx.measureText(value).width;
    ctx.font = f(Math.round(s * 0.45), 600);
    const uw = unit ? ctx.measureText(' ' + unit).width : 0;
    if (vw + uw <= maxW || s <= 30) {
      ctx.font = f(s, 800); ctx.fillStyle = C.text; ctx.fillText(value, x, y);
      if (unit) { ctx.font = f(Math.round(s * 0.45), 600); ctx.fillStyle = C.muted; ctx.fillText(' ' + unit, x + vw, y); }
      return;
    }
    s -= 4;
  }
}

/**
 * data: { range, label, score, sentence, tiles:[{label, value, unit, sub, tone:'good'|'bad'|'muted'}], bars:[{label, v, hit}] }
 */
export function drawCard(canvas, data) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // Zemin
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W - 60, -40, 0, W - 60, -40, 760);
  g.addColorStop(0, 'rgba(255,122,26,0.42)'); g.addColorStop(0.55, 'rgba(255,122,26,0.08)'); g.addColorStop(1, 'rgba(255,122,26,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(-80, H + 60, 0, -80, H + 60, 620);
  g.addColorStop(0, 'rgba(140,123,255,0.16)'); g.addColorStop(1, 'rgba(140,123,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const X = 80;
  // Başlık: uygulama adı + etiket
  ctx.font = f(54, 800); ctx.fillStyle = C.text; ctx.fillText('NOVA', X, 140);
  const nw = ctx.measureText('NOVA ').width;
  ctx.fillStyle = C.accent; ctx.fillText('Fit', X + nw, 140);
  ctx.font = f(28, 700);
  const tag = 'HAFTALIK RAPOR', tw = ctx.measureText(tag).width + 56;
  rr(ctx, W - X - tw, 96, tw, 60, 30); ctx.fillStyle = 'rgba(255,122,26,0.16)'; ctx.fill();
  ctx.fillStyle = C.accent; ctx.fillText(tag, W - X - tw + 28, 136);

  // Tarih aralığı
  ctx.font = f(70, 800); ctx.fillStyle = C.text; ctx.fillText(data.range, X, 262);
  ctx.font = f(34, 500); ctx.fillStyle = C.muted; ctx.fillText(data.label, X, 314);

  // Puan halkası
  const cx = X + 150, cy = 512, r = 128;
  ctx.lineWidth = 30; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const pct = Math.max(0, Math.min(1, data.score / 100));
  if (pct > 0) {
    ctx.strokeStyle = C.accent; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = f(92, 800); ctx.fillStyle = C.text; ctx.fillText(String(data.score), cx, cy + 22);
  ctx.font = f(28, 600); ctx.fillStyle = C.muted; ctx.fillText('/ 100', cx, cy + 66);
  ctx.textAlign = 'left';

  // Puan yanında cümle
  const tx = cx + r + 64, tmax = W - X - tx;
  ctx.font = f(30, 700); ctx.fillStyle = C.accent; ctx.fillText('Haftalık puan', tx, 420);
  ctx.font = f(36, 600); ctx.fillStyle = C.text;
  wrap(ctx, data.sentence, tmax, 5).forEach((ln, i) => ctx.fillText(ln, tx, 474 + i * 48));

  // Kutucuklar (2 × 3)
  const gx = 30, gy = 20, tileW = (W - 2 * X - gx) / 2, tileH = 160, top = 680;
  data.tiles.slice(0, 6).forEach((t, i) => {
    const x = X + (i % 2) * (tileW + gx), y = top + Math.floor(i / 2) * (tileH + gy);
    rr(ctx, x, y, tileW, tileH, 34); ctx.fillStyle = C.tile; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C.line; ctx.stroke();
    ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(x + 40, y + 42, 8, 0, Math.PI * 2); ctx.fill();
    ctx.font = f(28, 600); ctx.fillStyle = C.muted; ctx.fillText(t.label, x + 60, y + 52);
    valueText(ctx, x + 32, y + 114, tileW - 64, t.value, t.unit, 60);
    if (t.sub) {
      ctx.font = f(25, 600); ctx.fillStyle = t.tone === 'good' ? C.good : t.tone === 'bad' ? C.bad : C.muted;
      ctx.fillText(wrap(ctx, t.sub, tileW - 64, 1)[0], x + 32, y + 146);
    }
  });

  // Alt bilgi: 7 günlük adım çubukları + imza
  const by = 1290, bh = 48, bw = 26, bgap = 14;
  const max = Math.max(1, ...data.bars.map(b => b.v));
  data.bars.forEach((b, i) => {
    const hh = Math.max(6, (b.v / max) * bh), x = X + i * (bw + bgap);
    rr(ctx, x, by - hh, bw, hh, 8); ctx.fillStyle = b.hit ? C.accent : 'rgba(255,122,26,0.32)'; ctx.fill();
  });
  ctx.font = f(24, 600); ctx.fillStyle = C.dim;
  ctx.fillText('Günlük adım', X + 7 * (bw + bgap) + 10, by - 6);
  ctx.textAlign = 'right';
  ctx.font = f(26, 600); ctx.fillStyle = C.muted; ctx.fillText('NOVA Fit ile hazırlandı', W - X, by - 6);
  ctx.textAlign = 'left';
  return canvas;
}

export const toBlob = canvas => new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Görsel oluşturulamadı'))), 'image/png'));

export const FILE_NAME = 'nova-fit-hafta.png';
