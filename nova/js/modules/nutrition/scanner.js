// Barkod okuyucu: kamera + BarcodeDetector; desteklenmiyorsa (ör. iPhone Safari) numarayı elle yazma.
import { h, icon, mount, haptic } from '../../core/ui.js';
import { lookupBarcode } from './db.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** openScanner({ onFood(food), onMissing(code) }) */
export function openScanner({ onFood, onMissing } = {}) {
  let stream = null, detector = null, timer = null, closed = false, busy = false, torchOn = false;
  const hasDetector = 'BarcodeDetector' in window;
  const hasCamera = !!navigator.mediaDevices?.getUserMedia;

  const video = h('video', { class: 'nut-scan-video', playsinline: true, muted: true, autoplay: true, 'aria-hidden': 'true' });
  const torchBtn = h('button', { class: 'nut-scan-iconbtn hide', type: 'button', 'aria-label': 'Feneri aç', 'aria-pressed': 'false', onClick: toggleTorch }, icon('bolt'));
  const status = h('div', { class: 'nut-scan-status', 'aria-live': 'polite' });
  const stage = h('div', { class: 'nut-scan-stage' });
  const codeInp = h('input', { class: 'input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', placeholder: 'ör. 8690504012345', maxlength: 14, 'aria-label': 'Barkod numarası', autocomplete: 'off', enterkeyhint: 'search' });
  const findBtn = h('button', { class: 'btn primary', type: 'button', onClick: () => submit(codeInp.value) }, 'Ara');
  codeInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(codeInp.value); } });
  const result = h('div', { class: 'nut-scan-result' });

  const root = h('div', { class: 'nut-scan', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Barkod okut' },
    h('div', { class: 'nut-scan-top' },
      h('button', { class: 'back-btn nut-scan-back', type: 'button', onClick: close }, icon('left'), 'Geri'),
      h('div', { class: 'nut-scan-title' }, 'Barkod okut'),
      torchBtn),
    stage,
    h('div', { class: 'nut-scan-bottom' },
      result,
      h('div', { class: 'nut-label', style: 'margin-top:0' }, 'Barkod numarasını yaz'),
      h('div', { class: 'row', style: 'gap:8px' }, h('div', { class: 'grow' }, codeInp), findBtn),
      h('p', { class: 'small muted', style: 'margin:8px 2px 0' }, 'Numara barkod çizgilerinin hemen altında yazar (8 ya da 13 hane).')));
  document.body.appendChild(root);
  document.body.classList.add('nut-noscroll');
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  function intro() {
    if (!hasDetector || !hasCamera) {
      mount(stage, h('div', { class: 'nut-scan-info' },
        h('div', { class: 'nut-scan-emoji', 'aria-hidden': 'true' }, '🔢'),
        h('h3', null, 'Otomatik okuma bu telefonda yok'),
        h('p', null, 'Tarayıcın kamerayla barkod okumayı desteklemiyor (örneğin iPhone Safari). Aşağıya barkodun altındaki numarayı yazman yeterli.')));
      setTimeout(() => codeInp.focus(), 120);
      return;
    }
    mount(stage, h('div', { class: 'nut-scan-info' },
      h('div', { class: 'nut-scan-emoji', 'aria-hidden': 'true' }, '📷'),
      h('h3', null, 'Kamera izni gerekiyor'),
      h('p', null, 'Barkodu okumak için kameranı kullanacağız. Görüntü sadece telefonunda işlenir, hiçbir yere gönderilmez ya da kaydedilmez.'),
      h('button', { class: 'btn primary lg', type: 'button', onClick: startCamera }, icon('camera'), 'Kamerayı aç')));
  }

  async function startCamera() {
    mount(stage, h('div', { class: 'nut-scan-info' }, h('span', { class: 'nut-spin' }), h('p', null, 'Kamera açılıyor…')));
    try {
      let formats = FORMATS;
      try { const sup = await window.BarcodeDetector.getSupportedFormats?.(); if (sup?.length) formats = FORMATS.filter(f => sup.includes(f)); } catch { /* yok */ }
      detector = new window.BarcodeDetector({ formats: formats.length ? formats : FORMATS });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (closed) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      mount(stage, video, h('div', { class: 'nut-scan-frame', 'aria-hidden': 'true' }, h('i', { class: 'nut-scan-line' })), status);
      status.textContent = 'Barkodu çerçevenin içine getir';
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() || {};
      if (caps.torch) torchBtn.classList.remove('hide');
      loop();
    } catch (e) {
      stop();
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      mount(stage, h('div', { class: 'nut-scan-info' },
        h('div', { class: 'nut-scan-emoji', 'aria-hidden': 'true' }, '🚫'),
        h('h3', null, denied ? 'Kamera izni verilmedi' : 'Kamera açılamadı'),
        h('p', null, denied ? 'Tarayıcı ayarlarından bu siteye kamera izni verebilirsin. Ya da aşağıya barkod numarasını yaz.' : 'Kamera başka bir uygulamada açık olabilir. Tekrar dene ya da numarayı aşağıya yaz.'),
        h('button', { class: 'btn ghost', type: 'button', onClick: startCamera }, icon('refresh'), 'Tekrar dene')));
    }
  }

  function loop() {
    clearTimeout(timer);
    if (closed || !detector || busy) return;
    timer = setTimeout(async () => {
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          const hit = codes.find(c => /^\d{8,14}$/.test(c.rawValue));
          if (hit) { haptic([20, 40, 20]); submit(hit.rawValue); return; }
        }
      } catch { /* kare atlandı */ }
      loop();
    }, 220);
  }

  async function toggleTorch() {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      torchBtn.setAttribute('aria-pressed', String(torchOn));
      torchBtn.setAttribute('aria-label', torchOn ? 'Feneri kapat' : 'Feneri aç');
      torchBtn.classList.toggle('on', torchOn);
    } catch { torchOn = false; }
  }

  async function submit(raw) {
    const code = String(raw || '').replace(/\D/g, '');
    if (code.length < 8) { mount(result, h('div', { class: 'nut-hint warn' }, icon('alert'), 'Barkod en az 8 haneli olmalı.')); codeInp.focus(); return; }
    busy = true; clearTimeout(timer);
    codeInp.value = code;
    mount(result, h('div', { class: 'nut-status' }, h('span', { class: 'nut-spin' }), `${code} aranıyor…`));
    try {
      const food = await lookupBarcode(code);
      if (closed) return;
      if (food) { close(); onFood?.(food); return; }
      mount(result, h('div', { class: 'nut-scan-card' },
        h('b', null, 'Bu barkodla ürün bulunamadı'),
        h('p', { class: 'small muted', style: 'margin:4px 0 10px' }, `${code} · Paketteki besin tablosundan ürünü kendin ekleyebilirsin, bir dahakine barkodla bulunur.`),
        h('div', { class: 'row', style: 'gap:8px' },
          h('button', { class: 'btn primary sm grow', type: 'button', onClick: () => { close(); onMissing?.(code); } }, icon('plus'), 'Ürünü ekle'),
          h('button', { class: 'btn ghost sm', type: 'button', onClick: retry }, 'Yeniden okut'))));
    } catch (e) {
      if (closed) return;
      mount(result, h('div', { class: 'nut-scan-card' },
        h('b', null, e.kind === 'offline' ? 'İnternet bağlantısı yok' : 'Ürün aranamadı'),
        h('p', { class: 'small muted', style: 'margin:4px 0 10px' }, (e.kind === 'offline' ? 'Barkodla arama için internet gerekiyor.' : e.message + '.') + ' Ürünü kendin de ekleyebilirsin.'),
        h('div', { class: 'row', style: 'gap:8px' },
          h('button', { class: 'btn primary sm grow', type: 'button', onClick: () => { close(); onMissing?.(code); } }, icon('plus'), 'Ürünü ekle'),
          h('button', { class: 'btn ghost sm', type: 'button', onClick: () => submit(code) }, 'Tekrar dene'))));
    }
    busy = false;
  }
  function retry() { mount(result); codeInp.value = ''; busy = false; if (stream) loop(); }

  function stop() {
    clearTimeout(timer);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }
  function close() {
    if (closed) return; closed = true;
    stop();
    root.remove();
    document.body.classList.remove('nut-noscroll');
    document.removeEventListener('keydown', onKey);
  }

  intro();
  return close;
}
