/* ================== Giriş penceresi: şifre göz düğmesi, Şifremi unuttum (demo ve prod ortak; P6) ==================
   pw-eye: şifre alanını göster/gizle (aria-pressed). auth-forgot: pencerede "Şifremi unuttum" adımına geçer.
   Demo: kod e-postayla gitmez; ekranda demo kodu (123456) yazar ve yerel hesabın şifresini değiştirir.
   Canlı sitede forgotf / resetf prod/98p6-actions.js'te sunucuya (auth/forgot, auth/reset) bağlanır.                    */
Object.assign(ACT, {
  'pw-eye': (d, e) => { const i = $('#' + d.for); const b = e && e.target && e.target.closest ? e.target.closest('.pw-eye') : null; if (!i || !b) return;
    const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.setAttribute('aria-pressed', show ? 'true' : 'false');
    const l = show ? 'Şifreyi gizle' : 'Şifreyi göster'; b.setAttribute('aria-label', l); b.title = l; b.innerHTML = show ? AUTH_ICO.off : AUTH_ICO.eye;
    try { i.focus({ preventScroll: true }); const n = i.value.length; i.setSelectionRange(n, n); } catch (x) { } },
  'auth-forgot': (d) => { const v = (d && d.login) || (($('#lg_u') || {}).value || '').trim(); mForgot({ step: 1, login: v }); }
});
Object.assign(FORM, {
  forgotf: () => { const login = v_('fg_u').trim(); if (!login) return mForgot({ step: 1, err: 'Kullanıcı adınızı veya e-posta adresinizi yazın.' });
    mForgot({ step: 2, login, msg: 'Bu bilgilerle kayıtlı bir hesap varsa şifre sıfırlama kodu gönderildi. (Demo: kod 123456)' }); },
  resetf: (f) => { const login = v_('rs_u').trim().toLocaleLowerCase('tr-TR'), code = v_('rs_c').replace(/\D/g, ''), p = v_('rs_p');
    if (p.length < 8) return mForgot({ step: 2, login, err: 'Şifre en az 8 karakter olmalı.' });
    const u = S.users.find(x => x.name.toLocaleLowerCase('tr-TR') === login || (x.email || '').toLowerCase() === login);
    if (!u || code !== '123456') return mForgot({ step: 2, login, err: 'Kod geçersiz veya süresi dolmuş. Lütfen yeni kod isteyin.' });
    u.pass = p; save(); toast('Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.'); mLogin(); const i = $('#lg_u'); if (i) i.value = u.name; }
});
