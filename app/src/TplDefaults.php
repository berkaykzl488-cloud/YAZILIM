<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Bildirim şablonlarının varsayılanları ve kataloğu (ön yüzdeki MAILEV / SMSEV / MAILSUB / MAILBODY / SMSDEF ile aynı metinler;
 * tools ile src/js/02-domain.js ve 70-support.js'ten aktarıldı) + P6: 'reset' (şifre sıfırlama kodu).
 * Templates önce yönetimde kaydedilen metni (settings.tpl), sonra kendi sabitlerini, sonra buradakileri kullanır.
 * WhatsApp kuralı: doğrulama kodu ve şifre sıfırlama (OTP) Meta'daki onaylı kimlik doğrulama şablonuyla gider, metni değiştirilemez;
 * diğer olayların metni WhatsApp bildirim (Utility) şablonunun {{1}} değişkenine yazılır ve düzenlenebilir.
 */
final class TplDefaults
{
    /** k => [ad, ne zaman, kime] */
    const EV = array (
  'welcome' => 
  array (
    0 => 'Hoş geldin',
    1 => 'yeni üye kaydolduğunda',
    2 => 'üyeye',
  ),
  'tfa' => 
  array (
    0 => 'Doğrulama kodu',
    1 => 'girişte ve 2 adımlı doğrulamada kod istendiğinde',
    2 => 'üyeye',
  ),
  'order_new' => 
  array (
    0 => 'Sipariş alındı',
    1 => 'ilan satın alındığında',
    2 => 'alıcıya',
  ),
  'sold' => 
  array (
    0 => 'Ürününüz satıldı',
    1 => 'ilanınız satın alındığında',
    2 => 'satıcıya',
  ),
  'ready' => 
  array (
    0 => 'Ürün teslime hazır',
    1 => 'satıcı “Teslime hazırım” dediğinde',
    2 => 'alıcıya',
  ),
  'delivered' => 
  array (
    0 => 'Teslim edildi, onay bekleniyor',
    1 => 'satıcı “Teslim ettim” dediğinde',
    2 => 'alıcıya',
  ),
  'autosoon' => 
  array (
    0 => 'Otomatik onay yaklaşıyor',
    1 => 'otomatik onaya 1 saat kala',
    2 => 'alıcıya',
  ),
  'completed' => 
  array (
    0 => 'Sipariş tamamlandı',
    1 => 'sipariş onaylandığında',
    2 => 'alıcıya',
  ),
  'confirmed' => 
  array (
    0 => 'Ödeme bakiyenize geçti',
    1 => 'alıcı onayladığında veya otomatik onayda',
    2 => 'satıcıya',
  ),
  'refund' => 
  array (
    0 => 'Sipariş iptal ve iade',
    1 => 'sipariş iptal edilip iade yapıldığında',
    2 => 'alıcıya',
  ),
  'cancel_s' => 
  array (
    0 => 'Sipariş iptal edildi',
    1 => 'sipariş iptal edildiğinde',
    2 => 'satıcıya',
  ),
  'dispute' => 
  array (
    0 => 'İtiraz açıldı',
    1 => 'bir taraf itiraz açtığında',
    2 => 'karşı tarafa',
  ),
  'dispute_done' => 
  array (
    0 => 'İtiraz sonuçlandı',
    1 => 'yönetim itiraz kararı verdiğinde',
    2 => 'iki tarafa',
  ),
  'stock_out' => 
  array (
    0 => 'İlan stoğu bitti',
    1 => 'stoklu ilanın stoğu tükendiğinde',
    2 => 'satıcıya',
  ),
  'listing_ok' => 
  array (
    0 => 'İlan onaylandı',
    1 => 'yönetim ilanı onayladığında',
    2 => 'satıcıya',
  ),
  'listing_no' => 
  array (
    0 => 'İlan kaldırıldı',
    1 => 'yönetim ilanı kaldırdığında',
    2 => 'satıcıya',
  ),
  'deposit_ok' => 
  array (
    0 => 'Bakiye yüklendi',
    1 => 'bakiye yükleme tamamlandığında',
    2 => 'üyeye',
  ),
  'deposit_no' => 
  array (
    0 => 'Bakiye yükleme onaylanmadı',
    1 => 'havale bildirimi reddedildiğinde',
    2 => 'üyeye',
  ),
  'withdraw_req' => 
  array (
    0 => 'Çekim talebi alındı',
    1 => 'üye para çekme talebi oluşturduğunda',
    2 => 'üyeye',
  ),
  'withdraw' => 
  array (
    0 => 'Para gönderildi',
    1 => 'çekim talebi onaylandığında',
    2 => 'üyeye',
  ),
  'withdraw_no' => 
  array (
    0 => 'Çekim talebi reddedildi',
    1 => 'çekim talebi reddedildiğinde',
    2 => 'üyeye',
  ),
  'ep_code' => 
  array (
    0 => 'EP kodu teslim edildi',
    1 => 'EP paketi satın alındığında',
    2 => 'alıcıya',
  ),
  'tc_ok' => 
  array (
    0 => 'Kimlik doğrulandı',
    1 => 'TC kimlik doğrulaması başarılı olduğunda',
    2 => 'üyeye',
  ),
  'pass' => 
  array (
    0 => 'Şifre değişti',
    1 => 'üye şifresini değiştirdiğinde',
    2 => 'üyeye',
  ),
  'message' => 
  array (
    0 => 'Yeni mesaj',
    1 => 'üyeye yeni bir konuşma başlatıldığında',
    2 => 'üyeye',
  ),
  'borsa' => 
  array (
    0 => 'Borsa sipariş durumu',
    1 => 'borsa siparişi ve satış emri değiştiğinde',
    2 => 'üyeye',
  ),
  'call' => 
  array (
    0 => 'Borsa: alıcıyı çağır',
    1 => 'operatör “Alıcıyı çağır” dediğinde',
    2 => 'alıcıya',
  ),
  'ad' => 
  array (
    0 => 'Reklam onayı / reddi',
    1 => 'reklam başvurusu onaylandığında veya reddedildiğinde',
    2 => 'reklam verene',
  ),
  'raffle' => 
  array (
    0 => 'Çekiliş kazancı',
    1 => 'çekilişi kazandığında',
    2 => 'kazanana',
  ),
  'ticket' => 
  array (
    0 => 'Çekiliş bileti kazanıldı',
    1 => 'alışverişten bilet kazandığında',
    2 => 'üyeye',
  ),
  'direct' => 
  array (
    0 => 'Üyeden üyeye ücretli SMS',
    1 => 'bir üye “SMS ile ulaş” kullandığında',
    2 => 'mesaj gönderilen üyeye',
  ),
  'reset' => 
  array (
    0 => 'Şifre sıfırlama kodu',
    1 => 'üye “Şifremi unuttum” ile kod istediğinde (her zaman gönderilir)',
    2 => 'üyeye',
  ),
);

    /** E-posta gönderilebilen olaylar */
    const MAIL = array (
  0 => 'welcome',
  1 => 'tfa',
  2 => 'order_new',
  3 => 'sold',
  4 => 'ready',
  5 => 'delivered',
  6 => 'autosoon',
  7 => 'completed',
  8 => 'confirmed',
  9 => 'refund',
  10 => 'cancel_s',
  11 => 'dispute',
  12 => 'dispute_done',
  13 => 'stock_out',
  14 => 'listing_ok',
  15 => 'listing_no',
  16 => 'deposit_ok',
  17 => 'deposit_no',
  18 => 'withdraw_req',
  19 => 'withdraw',
  20 => 'withdraw_no',
  21 => 'ep_code',
  22 => 'tc_ok',
  23 => 'pass',
  24 => 'message',
  25 => 'borsa',
  26 => 'call',
  27 => 'ad',
  28 => 'raffle',
  29 => 'ticket',
  30 => 'reset',
);

    /** WhatsApp gönderilebilen olaylar */
    const WA = array (
  0 => 'tfa',
  1 => 'order_new',
  2 => 'sold',
  3 => 'ready',
  4 => 'delivered',
  5 => 'autosoon',
  6 => 'completed',
  7 => 'confirmed',
  8 => 'refund',
  9 => 'cancel_s',
  10 => 'dispute',
  11 => 'dispute_done',
  12 => 'stock_out',
  13 => 'deposit_ok',
  14 => 'withdraw_req',
  15 => 'withdraw',
  16 => 'withdraw_no',
  17 => 'ep_code',
  18 => 'tc_ok',
  19 => 'pass',
  20 => 'borsa',
  21 => 'call',
  22 => 'direct',
  23 => 'ad',
  24 => 'raffle',
  25 => 'ticket',
  26 => 'reset',
);

    /** Metni Meta'da sabit (kimlik doğrulama şablonu): WhatsApp metni düzenlenemez */
    const WA_FIXED = ['tfa', 'reset'];

    /** E-posta gövdesinde {kod} zorunlu olanlar */
    const NEED_CODE = ['tfa', 'reset'];

    /** Kapatılamayan olaylar (her zaman gönderilir) */
    const ALWAYS = ['tfa', 'reset'];

    const MAIL_SUB = array (
  'welcome' => '{site} ailesine hoş geldin {ad}!',
  'tfa' => '{site} doğrulama kodunuz: {kod}',
  'order_new' => 'Siparişiniz alındı · #{no}',
  'sold' => 'İlanınız satıldı · #{no}',
  'ready' => 'Ürününüz teslime hazır · #{no}',
  'delivered' => 'Siparişiniz teslim edildi, onayınız bekleniyor · #{no}',
  'autosoon' => 'Siparişiniz 1 saat içinde otomatik onaylanacak · #{no}',
  'completed' => 'Siparişiniz tamamlandı · #{no}',
  'confirmed' => 'Ödemeniz bakiyenize geçti · #{no}',
  'refund' => 'Siparişiniz iptal edildi, iade yapıldı · #{no}',
  'cancel_s' => 'Sipariş iptal edildi · #{no}',
  'dispute' => 'Siparişte itiraz açıldı · #{no}',
  'dispute_done' => 'İtiraz sonuçlandı · #{no}',
  'stock_out' => 'İlanınızın stoğu bitti',
  'listing_ok' => 'İlanınız yayında',
  'listing_no' => 'İlanınız yayından kaldırıldı',
  'deposit_ok' => 'Bakiyenize {tutar} yüklendi',
  'deposit_no' => 'Bakiye yükleme bildiriminiz onaylanmadı',
  'withdraw_req' => 'Para çekme talebiniz alındı',
  'withdraw' => 'Paranız gönderildi',
  'withdraw_no' => 'Para çekme talebiniz reddedildi',
  'ep_code' => '{ep} EP kodunuz',
  'tc_ok' => 'Kimliğiniz doğrulandı',
  'pass' => 'Hesap şifreniz değiştirildi',
  'message' => '{gonderen} size mesaj gönderdi',
  'borsa' => 'Yang Borsası · #{no} {durum}',
  'call' => 'Teslimat için hazırız · Borsa #{no}',
  'ad' => 'Reklam başvurunuz hakkında',
  'raffle' => 'Tebrikler, çekilişi kazandınız!',
  'ticket' => 'Çekiliş biletiniz eklendi',
  'reset' => '{site} şifre sıfırlama kodunuz: {kod}',
);

    const MAIL_BODY = array (
  'welcome' => 'Merhaba {ad},

{site} hesabın oluşturuldu. Artık item, yang, EP ve karakter alım satımı yapabilir, Yang Borsası’nı kullanabilir ve çekilişlere katılabilirsin.

Ödemen her zaman, ürünü teslim aldığını onaylayana kadar güvenli havuzda bekler.

İyi oyunlar,
{site} ekibi',
  'tfa' => 'Merhaba {ad},

Doğrulama kodunuz: {kod}
Kod 3 dakika geçerlidir. Bu işlemi siz yapmadıysanız şifrenizi değiştirin ve bizimle iletişime geçin.

{site}',
  'order_new' => 'Merhaba {ad},

#{no} numaralı siparişiniz alındı.
Ürün: {ilan}
Tutar: {tutar}
Teslimat: {teslimat}

Ödemeniz satıcıya değil güvenli havuza geçti. Satıcı teslime hazır olduğunda size ayrıca haber vereceğiz.

{site} ekibi',
  'sold' => 'Merhaba {ad},

“{ilan}” ilanınız satıldı. Sipariş no: #{no}
Teslimat bilgisi: {teslimat}

Lütfen siparişi açın, hazır olduğunuzda “Teslime hazırım” butonuna basın ve teslimattan sonra kanıt görselleriyle “Teslim ettim” deyin.

{site} ekibi',
  'ready' => 'Merhaba {ad},

#{no} numaralı siparişiniz teslime hazır!
{teslimat}

Lütfen oyunda belirtilen yerde bekleyin. Ürünü teslim aldıktan sonra sitede kontrol edip onaylayın; sorun olursa onaylamadan itiraz açın.

{site} ekibi',
  'delivered' => 'Merhaba {ad},

Satıcı #{no} numaralı siparişinizi teslim ettiğini bildirdi.
Lütfen ürünü kontrol edip sitede onaylayın. {saat} saat içinde işlem yapmazsanız sipariş otomatik onaylanır.
Sorun varsa onaylamadan itiraz açın.

{site} ekibi',
  'autosoon' => 'Merhaba {ad},

#{no} numaralı siparişiniz yaklaşık 1 saat sonra otomatik onaylanacak ve ödeme satıcıya geçecek.
Ürünü teslim almadıysanız hemen siparişe girip itiraz açın.

{site} ekibi',
  'completed' => 'Merhaba {ad},

#{no} numaralı siparişiniz tamamlandı. Bizi tercih ettiğiniz için teşekkürler!
Satıcıyı puanlamak ve yeni ilanlara göz atmak için sitemizi ziyaret edebilirsiniz.

{site} ekibi',
  'confirmed' => 'Merhaba {ad},

#{no} numaralı sipariş onaylandı. Komisyon düşüldükten sonra {tutar} bakiyenize geçti.
Bakiyenizi Hesabım › Para çek bölümünden IBAN’ınıza çekebilirsiniz.

{site} ekibi',
  'refund' => 'Merhaba {ad},

#{no} numaralı siparişiniz iptal edildi ve {tutar} bakiyenize iade edildi.

{site} ekibi',
  'cancel_s' => 'Merhaba {ad},

#{no} numaralı sipariş iptal edildi. Bu sipariş için teslimat yapmayın; ilan stoğunuz geri eklendi.

{site} ekibi',
  'dispute' => 'Merhaba {ad},

#{no} numaralı siparişte itiraz açıldı. Tutar karar verilene kadar havuzda bekletiliyor.
Lütfen siparişin mesaj alanından açıklamanızı ve ekran görüntülerinizi iletin.

{site} ekibi',
  'dispute_done' => 'Merhaba {ad},

#{no} numaralı siparişteki itiraz sonuçlandı: {durum}

{site} ekibi',
  'stock_out' => 'Merhaba {ad},

“{ilan}” ilanınızın stoğu bitti ve ilan yayından kalktı. Satmaya devam etmek için ilanınıza stok ekleyebilirsiniz.

{site} ekibi',
  'listing_ok' => 'Merhaba {ad},

“{ilan}” ilanınız onaylandı ve yayında.

{site} ekibi',
  'listing_no' => 'Merhaba {ad},

“{ilan}” ilanınız yayından kaldırıldı. Ayrıntı için canlı destekle görüşebilirsiniz.

{site} ekibi',
  'deposit_ok' => 'Merhaba {ad},

Bakiyenize {tutar} yüklendi. İyi alışverişler!

{site} ekibi',
  'deposit_no' => 'Merhaba {ad},

Bakiye yükleme bildiriminiz onaylanmadı. Ödemeyi yaptıysanız dekontunuzla canlı destekten bize ulaşın.

{site} ekibi',
  'withdraw_req' => 'Merhaba {ad},

{tutar} tutarındaki para çekme talebiniz alındı. Talepler mesai saatlerinde 2-6 saat içinde IBAN’ınıza gönderilir.

{site} ekibi',
  'withdraw' => 'Merhaba {ad},

{tutar} IBAN’ınıza gönderildi. Banka saatlerine göre hesabınıza geçmesi biraz sürebilir.

{site} ekibi',
  'withdraw_no' => 'Merhaba {ad},

Para çekme talebiniz reddedildi ve {tutar} bakiyenize iade edildi.
Neden: {durum}

{site} ekibi',
  'ep_code' => 'Merhaba {ad},

{ep} EP kodunuz: {kod}
Kodu oyunda kullanabilirsiniz; kod Hesabım › EP kodlarım bölümünde de saklanır. Kodunuzu kimseyle paylaşmayın.

{site} ekibi',
  'tc_ok' => 'Merhaba {ad},

Kimliğiniz doğrulandı. Artık kazancınızı IBAN’ınıza çekebilirsiniz.

{site} ekibi',
  'pass' => 'Merhaba {ad},

Hesabınızın şifresi değiştirildi. Bu işlemi siz yapmadıysanız hemen canlı destekten bize ulaşın.

{site} ekibi',
  'message' => 'Merhaba {ad},

{gonderen} size {site} üzerinden mesaj gönderdi. Cevaplamak için Mesajlar bölümüne gidin.
Güvenliğiniz için site dışında iletişim kurmayın ve ödeme yapmayın.

{site} ekibi',
  'reset' => 'Merhaba {ad},

Şifrenizi sıfırlamak için kodunuz: {kod}
Kod 30 dakika geçerlidir ve bir kez kullanılabilir.

Kodu giriş penceresindeki “Şifremi unuttum” ekranına yazın ya da şu bağlantıyı açın:
{link}

Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın; şifreniz değişmez. Ekibimiz sizden asla şifre veya kod istemez.

{site} ekibi',
);

    const SMS = array (
  'tfa' => '{site} doğrulama kodunuz: {kod}. Kodu kimseyle paylaşmayın.',
  'order_new' => '{site}: #{no} siparişiniz alındı ({tutar}). Ödemeniz havuzda güvende; satıcı hazır olunca haber vereceğiz.',
  'sold' => '{site}: "{ilan}" satıldı (#{no}). Teslimat: {teslimat}. Siparişi açıp teslim edin.',
  'ready' => '{site}: #{no} siparişiniz teslime hazır! {teslimat}. Lütfen oyunda bekleyin.',
  'delivered' => '{site}: #{no} teslim edildi. Ürünü kontrol edip onaylayın; {saat} saat içinde otomatik onaylanır.',
  'autosoon' => '{site}: #{no} siparişiniz 1 saat sonra otomatik onaylanacak. Ürünü almadıysanız hemen itiraz edin.',
  'completed' => '{site}: #{no} siparişiniz tamamlandı. Teşekkür ederiz!',
  'confirmed' => '{site}: #{no} onaylandı, {tutar} bakiyenize geçti.',
  'refund' => '{site}: #{no} siparişiniz iptal edildi, {tutar} bakiyenize iade edildi.',
  'cancel_s' => '{site}: #{no} siparişi iptal edildi. Bu sipariş için teslimat yapmayın.',
  'dispute' => '{site}: #{no} siparişinde itiraz açıldı. Tutar havuzda bekletiliyor.',
  'dispute_done' => '{site}: #{no} itirazı sonuçlandı: {durum}.',
  'stock_out' => '{site}: "{ilan}" ilanınızın stoğu bitti, ilan yayından kalktı.',
  'deposit_ok' => '{site}: Bakiyenize {tutar} yüklendi.',
  'withdraw_req' => '{site}: {tutar} çekim talebiniz alındı. 2-6 saat içinde gönderilir.',
  'withdraw' => '{site}: {tutar} IBAN\'ınıza gönderildi.',
  'withdraw_no' => '{site}: Çekim talebiniz reddedildi, {tutar} bakiyenize iade edildi.',
  'ep_code' => '{site}: {ep} EP kodunuz hazır. Kodu Hesabım > EP kodlarım bölümünde görebilirsiniz.',
  'tc_ok' => '{site}: Kimliğiniz doğrulandı, artık para çekebilirsiniz.',
  'pass' => '{site}: Hesap şifreniz değiştirildi. Siz yapmadıysanız hemen bize ulaşın.',
  'borsa' => '{site}: Borsa siparişiniz #{no}: {durum}.',
  'call' => '{site} borsa #{no}: {mesaj}',
  'direct' => '{site} üyesi {gonderen}: {mesaj}',
  'ad' => '{site}: Reklam başvurunuz hakkında: {mesaj}',
  'raffle' => '{site}: Tebrikler! Çekilişi kazandınız. Ayrıntılar hesabınızda.',
  'ticket' => '{site}: Çekiliş biletiniz hesabınıza eklendi.',
  'reset' => '{site} şifre sıfırlama kodunuz: {kod}. Kodu kimseyle paylaşmayın.',
  'message' => '{site}: {gonderen} size mesaj gönderdi.',
);

    const VARS = ['{site}' => 'Site adı', '{ad}' => 'Üye adı', '{no}' => 'Sipariş no', '{ilan}' => 'İlan adı', '{tutar}' => 'Tutar', '{teslimat}' => 'Teslimat bilgisi (karakter · kanal · yer)', '{saat}' => 'Otomatik onay süresi', '{ep}' => 'EP miktarı', '{kod}' => 'Kod', '{link}' => 'Şifre sıfırlama bağlantısı', '{durum}' => 'Durum / neden', '{gonderen}' => 'Gönderen üye', '{mesaj}' => 'Bildirim metni'];
}
