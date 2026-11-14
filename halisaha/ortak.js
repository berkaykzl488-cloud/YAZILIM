/* Halı Saha Kadrosu · iki sayfanın ortak yardımcıları (index.html + yonetim.html) */
(function () {
  "use strict";
  const API = "api.php";

  // Her tarayıcıya rastgele bir kimlik: "Gelemiyorum" ile sadece kendi kaydını silebilsin diye.
  let token = null;
  try { token = localStorage.getItem("halisaha_token"); } catch (e) {}
  if (!token || !/^[a-f0-9]{32,64}$/.test(token)) {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    token = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    try { localStorage.setItem("halisaha_token", token); } catch (e) {}
  }

  const $ = (id) => document.getElementById(id);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  let toastTimer;
  function toast(msg, err) {
    const t = $("toast");
    if (!msg || !t) return;
    t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
  }

  function fmtWhen(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d)) return "";
    try { return new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d); }
    catch (e) { return d.toLocaleString(); }
  }

  async function call(action, body) {
    const opts = { headers: { "X-Player-Token": token }, credentials: "same-origin", cache: "no-store" };
    if (body !== undefined) {
      opts.method = "POST";
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    let res, json;
    try {
      res = await fetch(API + "?action=" + encodeURIComponent(action), opts);
      json = await res.json();
    } catch (e) {
      throw new Error("Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.");
    }
    if (!res.ok || !json.ok) {
      const err = new Error((json && json.error) || "İşlem yapılamadı.");
      err.status = res.status;
      throw err;
    }
    return json;
  }

  const cap = (d) => (d ? Number(d.settings.capacity) || 14 : 14);
  const reserve = (d) => {
    const r = d ? Number(d.settings.reserve) : 3;
    return Number.isFinite(r) && r >= 0 ? r : 3;
  };

  /** Skor bandını (başlık, tarih, sayı, rozet, çubuk) çizer. */
  function renderHeader(d, failed) {
    const c = cap(d), n = d ? d.players.length : 0, inSquad = Math.min(n, c);
    const s = d ? d.settings : {};
    if ($("title")) $("title").textContent = s.title || "Halı Saha";
    if ($("when")) $("when").textContent = fmtWhen(s.when);
    if ($("place")) $("place").textContent = s.place || "";
    const num = $("count");
    if (num) { num.textContent = ""; num.append(d ? String(inSquad) : "–", el("small", null, "/" + (d ? c : "–"))); }
    const st = $("status"), bar = $("bar");
    if (!st) return;
    const left = c - inSquad;
    if (!d) { st.textContent = failed ? "Bağlantı yok" : "Yükleniyor"; st.className = "pill"; }
    else if (left <= 0) {
      const rl = Math.max(0, c + reserve(d) - n);
      st.textContent = rl > 0 ? "Kadro tamam · " + rl + " yedek yeri" : (reserve(d) > 0 ? "Kadro ve yedek dolu" : "Kadro tamam");
      st.className = "pill full";
    }
    else if (left <= 2) { st.textContent = "Son " + left + " yer"; st.className = "pill warn"; }
    else { st.textContent = left + " yer boş"; st.className = "pill"; }
    if (bar) {
      bar.className = "bar" + (d && left > 0 && left <= 2 ? " warn" : "");
      bar.firstElementChild.style.width = (d ? (inSquad / c) * 100 : 0) + "%";
    }
  }

  window.HS = { $, el, toast, fmtWhen, call, cap, reserve, renderHeader };
})();
