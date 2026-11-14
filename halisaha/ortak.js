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
  const hhmm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const money = (n) => { try { return new Intl.NumberFormat("tr-TR").format(n) + " ₺"; } catch (e) { return n + " ₺"; } };

  // Sunucu saatiyle fark: geri sayım telefonun saati yanlış olsa da doğru çalışsın.
  let skew = 0;
  const nowMs = () => Date.now() + skew;

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
    if (json.now) skew = json.now - Date.now();
    return json;
  }

  /** Oyuncu yeri sayısı (kaleciler ayrıysa onlar hariç). */
  const cap = (d) => (d ? Number(d.fieldCap) || 14 : 14);
  const reserve = (d) => {
    const r = d ? Number(d.settings.reserve) : 3;
    return Number.isFinite(r) && r >= 0 ? r : 3;
  };
  const keepers = (d) => !!(d && d.settings.keepers);
  const gkCount = (d) => keepers(d) ? [d.settings.gkA, d.settings.gkB].filter(Boolean).length : 0;

  // ---------- geri sayım ve otomatik kura ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function clock(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (days ? days + " gün " : "") + pad(h) + ":" + pad(m) + ":" + pad(s);
  }
  function short(ms) {
    const m = Math.max(1, Math.ceil(ms / 60000));
    if (m < 60) return m + " dk";
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 48) return h + " sa" + (r ? " " + r + " dk" : "");
    return Math.floor(h / 24) + " gün";
  }

  /** {main, sub, drawDue} — maç saati girilmemişse null. */
  function countdown(d) {
    if (!d || !d.kickoff) return null;
    const diff = d.kickoff - nowMs(), h = Number(d.settings.autoDraw) || 0;
    let main;
    if (diff <= -2 * 3600e3) main = "Maç oynandı";
    else if (diff <= 0) main = "Maç başladı";
    else main = clock(diff);
    let sub = "", drawDue = false;
    if (d.teams) sub = d.teams.auto ? "Takımlar otomatik kuruldu (" + hhmm(d.teams.at * 1000) + ")" : "Takımlar hazır";
    else if (h > 0 && diff > 0) {
      const until = diff - h * 3600e3;
      if (until > 0) sub = "Otomatik kuraya " + short(until);
      else { sub = "Kura zamanı geldi"; drawDue = true; }
    } else if (h > 0 && diff > -3 * 3600e3) { sub = "Kura zamanı geldi"; drawDue = true; }
    else if (diff > 0) sub = "Takımları yönetici kuracak";
    return { main, sub, drawDue, soon: diff > 0 && diff <= Math.max(h, 2) * 3600e3 };
  }

  /** Skor bandını (başlık, tarih, ücret, sayı, rozet, çubuk, geri sayım) çizer. */
  function renderHeader(d, failed) {
    const c = cap(d), n = d ? d.players.length : 0, inSquad = Math.min(n, c);
    const s = d ? d.settings : {};
    if ($("title")) $("title").textContent = s.title || "Halı Saha";
    if ($("when")) $("when").textContent = fmtWhen(s.when);
    if ($("place")) $("place").textContent = s.place || "";
    if ($("fee")) $("fee").textContent = s.fee > 0 ? money(s.fee) + " / kişi" : "";
    const num = $("count");
    if (num) { num.textContent = ""; num.append(d ? String(inSquad) : "–", el("small", null, "/" + (d ? c : "–"))); }
    const split = $("split");
    if (split) {
      split.textContent = !d ? "" : keepers(d)
        ? "Kaleci " + gkCount(d) + "/2 · Oyuncu " + inSquad + "/" + c
        : "Oyuncu " + inSquad + "/" + c;
    }
    const st = $("status"), bar = $("bar");
    if (st) {
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
    renderCountdown(d);
  }

  function renderCountdown(d) {
    const box = $("cd");
    if (!box) return null;
    const cd = countdown(d);
    box.hidden = !cd;
    if (!cd) return null;
    $("cdMain").textContent = cd.main;
    $("cdSub").textContent = cd.sub;
    box.classList.toggle("soon", cd.soon);
    return cd;
  }

  // ---------- takımlar ----------
  /** Kadrodaki oyuncuları takım takım, forma sırasına göre döndürür. */
  function teamRows(d) {
    const byId = {};
    d.players.slice(0, cap(d)).forEach((p, i) => { byId[p.id] = { p, no: i + 1 }; });
    const pick = (ids) => ids.filter((id) => byId[id]).sort((x, y) => byId[x].no - byId[y].no).map((id) => byId[id]);
    return { a: pick(d.teams.a), b: pick(d.teams.b) };
  }

  /** Takımları WhatsApp grubuna yapıştırılacak metne çevirir. */
  function teamsText(d) {
    const s = d.settings, t = teamRows(d), k = keepers(d);
    const lines = ["⚽ *" + (s.title || "Halı Saha") + "*"];
    const when = fmtWhen(s.when);
    if (when) lines.push("📅 " + when);
    if (s.place) lines.push("📍 " + s.place);
    if (s.fee > 0) lines.push("💰 Kişi başı: " + money(s.fee));
    const team = (label, gk, rows) => {
      lines.push("", label + " (" + (rows.length + (k ? 1 : 0)) + ")");
      let i = 1;
      if (k) lines.push((i++) + ". 🧤 " + (gk || "Kaleci belli değil") + " (Kaleci)");
      rows.forEach((r) => lines.push((i++) + ". " + r.p.name));
    };
    team("🟡 *Yelekliler*", s.gkA, t.a);
    team("🟢 *Yeleksizler*", s.gkB, t.b);
    const bench = d.players.slice(cap(d)).map((p) => p.name);
    if (bench.length) {
      lines.push("", "🔁 *Yedekler*");
      bench.forEach((n, i) => lines.push((i + 1) + ". " + n));
    }
    lines.push("", "Liste: " + listUrl());
    return lines.join("\n");
  }

  /** Herkese açık listenin adresi (yönetim panelinden çağrılsa da ana sayfayı verir). */
  function listUrl() {
    return location.origin + location.pathname.replace(/[^/]*$/, "");
  }

  /** Panoya kopyalar; olmazsa eski yöntemi dener. Başarıyı döndürür. */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) {}
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-1000px";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    return ok;
  }

  /** Takım paylaşım düğmelerini (Kopyala + WhatsApp) üretir. */
  function shareButtons(d) {
    const text = teamsText(d);
    const copy = el("button", "btn-ghost", "Takımları kopyala");
    copy.type = "button";
    copy.addEventListener("click", async () => {
      if (await copyText(text)) {
        toast("Takımlar kopyalandı. WhatsApp grubuna yapıştırabilirsin.");
        copy.textContent = "Kopyalandı ✓";
        setTimeout(() => { copy.textContent = "Takımları kopyala"; }, 2000);
      } else {
        toast("Otomatik kopyalanamadı. Aşağıdaki metni seçip kopyala.", true);
        showManual(text);
      }
    });
    const wa = el("a", "btn-ghost", "WhatsApp'ta paylaş");
    wa.href = "https://wa.me/?text=" + encodeURIComponent(text);
    wa.target = "_blank"; wa.rel = "noopener";
    return [copy, wa];
  }

  function showManual(text) {
    let box = $("manualCopy");
    if (!box) {
      box = el("textarea"); box.id = "manualCopy"; box.readOnly = true; box.rows = 14;
      box.className = "manual-copy";
      ($("teamsSec") || document.body).appendChild(box);
    }
    box.value = text; box.hidden = false; box.focus(); box.select();
  }

  /**
   * İki takım listesini çizer. opts.move(id, otherLabel) verilirse her oyuncuya ⇄ düğmesi eklenir.
   */
  function renderTeamLists(d, opts) {
    const t = teamRows(d), k = keepers(d), s = d.settings;
    [["a", "teamA", "countA", s.gkA, "Yeleksizlere"], ["b", "teamB", "countB", s.gkB, "Yeleklilere"]].forEach(([key, listId, countId, gk, other]) => {
      const ol = $(listId); ol.textContent = "";
      $(countId).textContent = (t[key].length + (k ? 1 : 0)) + " kişi";
      if (k) {
        const li = el("li", "gk" + (gk ? "" : " empty"));
        li.append(el("span", "no", "K"), el("span", "nm", gk || "Kaleci belli değil"), el("span", "tag", "Kaleci"));
        ol.append(li);
      }
      t[key].forEach(({ p, no }) => {
        const li = el("li", p.mine ? "me" : "");
        li.append(el("span", "no", String(no)), el("span", "nm", p.name));
        if (p.mine) li.append(el("span", "tag", "Sen"));
        if (opts && opts.move) li.append(opts.move(p, other));
        ol.append(li);
      });
    });
  }

  /** Sahayı çizer: üstte Yelekliler, altta Yeleksizler, kaleciler kalede. */
  function renderPitch(host, d) {
    host.textContent = "";
    const t = teamRows(d), k = keepers(d), s = d.settings;
    const pitch = el("div", "pitch");
    pitch.setAttribute("role", "img");
    pitch.setAttribute("aria-label", "Saha dizilişi: üstte Yelekliler, altta Yeleksizler");
    const half = (rows, gk, cls, gkFirst) => {
      const h = el("div", "half " + cls);
      const gkRow = el("div", "gk-row");
      if (k) {
        const chip = el("span", "chip keeper", gk || "Kaleci ?");
        chip.title = "Kaleci";
        gkRow.append(chip);
      }
      const grid = el("div", "chips");
      rows.forEach(({ p, no }) => {
        const c = el("span", "chip " + cls + (p.mine ? " me" : ""));
        c.append(el("b", null, String(no)), document.createTextNode(" " + p.name));
        grid.append(c);
      });
      if (gkFirst) h.append(gkRow, grid); else h.append(grid, gkRow);
      return h;
    };
    pitch.append(
      el("span", "box top"), el("span", "box bottom"), el("span", "circle"), el("span", "mid"),
      half(t.a, s.gkA, "a", true),
      el("div", "vs", "Yelekliler – Yeleksizler"),
      half(t.b, s.gkB, "b", false)
    );
    host.append(pitch);
  }

  /** Kadro hareketleri listesini çizer. */
  function renderLog(ul, d) {
    ul.textContent = "";
    const items = (d && d.log) || [];
    if (!items.length) { ul.append(el("li", "empty", "Henüz hareket yok. İlk katılan burada görünür.")); return; }
    items.forEach((it) => {
      const li = el("li");
      li.append(el("time", null, hhmm(it.t * 1000)), el("span", null, it.m));
      ul.append(li);
    });
  }

  window.HS = {
    $, el, toast, fmtWhen, money, call, nowMs, cap, reserve, keepers, gkCount,
    countdown, renderHeader, renderCountdown, teamsText, copyText, shareButtons,
    renderTeamLists, renderPitch, renderLog
  };
})();
