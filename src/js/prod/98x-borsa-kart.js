/* ================== Yang Borsası kartları: prod gönderimi (yalnız --prod derlemesinde) ==================
   Ekranlar ve işleyiciler ortak (51-borsa-kart.js, 83-borsa-kart-act.js). Burada AL / SAT pencerelerinin API gönderimi: aynı uçlar
   (POST exchange/orders, POST exchange/offers), aynı alanlar, form başına tek Idempotency-Key (formKey), apiBusy. Girişsiz AL/SAT:
   giriş penceresi açılır, girişten sonra aynı pencere yeniden açılır (sessionStorage yp_after, 10 dk; yönlendirmeli girişlerde de).      */
BXD.busy = (f, p) => apiBusy(f, p);
BXD.err = j => apiErr(j);
BXD.al = async (f, x, q) => { const j = await call('POST', 'exchange/orders', { market: x.id, qty: q, f: p4Fx('exb_') }, { key: formKey(f), silent: true, quiet: true }); p4After(); return j; };
BXD.sat = async (f, x, q) => { const p = p2Num(v_('ex_price')); const fl = (S.exFields || []).reduce((o, z) => { o[z.id] = v_('exf_' + z.id); return o; }, {});
  const j = await call('POST', 'exchange/offers', { market: x.id, qty: q, price: p, f: fl, ok: !!($('#ex_ok') || {}).checked }, { key: formKey(f), silent: true, quiet: true }); p4After(); return j; };
/* 98p4'ün API'li emir iptali onay penceresiyle yeniden sarılır */
bxWrapCancel();
/* girişten sonra kalınan yerden devam (giriş, 2 adımlı doğrulama, yönlendirmeli giriş: hepsi açılışı yeniden uygular) */
{ const f = apiApplyBoot; apiApplyBoot = function (b) { f.apply(this, arguments);
    if (!b || !b.me) return; let a = null; try { a = JSON.parse(sessionStorage.getItem(BX_AFTER) || 'null'); } catch (e) { }
    if (!a || a.k !== 'bx' || !(Date.now() - (+a.t || 0) < 10 * 60000)) return; try { sessionStorage.removeItem(BX_AFTER); } catch (e) { }
    setTimeout(() => { if (route() !== 'borsa' || $('#modal .mb')) return; bxOpen(a.dir === 'sat' ? 'sat' : 'al', a.id); }, 400); }; }
