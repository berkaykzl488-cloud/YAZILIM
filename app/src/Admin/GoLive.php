<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Db;
use YP\Seo;
use YP\Settings;

/**
 * Yayına alma kontrol listesi (Yönetim › Site ayarları › Yayına alma). Her madde sunucuda hesaplanır:
 *   {k, ok, opt (isteğe bağlı), t (başlık), x (durum açıklaması), h (düzeltme bağlantısı)}
 * "opt" maddeler (WhatsApp, PayTR) eksik olsa da "hazır" sayısını düşürmez; yalnız bilgi verir.
 */
final class GoLive
{
    const CRON_FRESH_MS = 900000; // 15 dk

    /** Gerçek cron (CLI ya da cron-job.org adresi) en son ne zaman çalıştı? (gecikmeli "lazy" tik sayılmaz) */
    public static function cronLast()
    {
        $raw = @file_get_contents(YP_STORAGE . '/cache/cron_last.txt');
        return $raw === false ? 0 : (int)trim($raw);
    }

    public static function checks(Db $db)
    {
        $site = Settings::get('site', $db);
        $url = isset($site['siteUrl']) ? (string)$site['siteUrl'] : '';
        $now = yp_now_ms();
        $C = [];
        $add = function ($k, $ok, $t, $x, $h, $opt = false) use (&$C) {
            $C[] = ['k' => $k, 'ok' => (bool)$ok, 'opt' => (bool)$opt, 't' => $t, 'x' => $x, 'h' => $h];
        };
        $httpsReq = yp_is_https();
        $add('https', $httpsReq && preg_match('#^https://#i', $url), 'HTTPS (SSL) açık',
            !preg_match('#^https://#i', $url) ? 'Site adresi https:// ile başlamıyor. Hostingde SSL sertifikasını açın (cPanel › SSL/TLS Status · AutoSSL).'
                : ($httpsReq ? 'Site güvenli bağlantıyla açılıyor.' : 'Bu sayfa http ile açıldı; sertifika ve https yönlendirmesini kontrol edin.'), '#yonetim/ayar/genel');
        $add('siteurl', $url !== '', 'Site adresi girildi', $url !== '' ? $url : 'Site ayarları › Genel › Site adresi boş (davet linkleri, site haritası ve e-postalar için gerekir).', '#yonetim/ayar/genel');
        $cl = self::cronLast();
        $tick = (int)$db->val("SELECT last_ok FROM {cron_runs} WHERE task='tick'");
        $add('cron', $cl && $now - $cl < self::CRON_FRESH_MS, 'Zamanlanmış görev (cron) çalışıyor',
            $cl ? 'Son çalışma: ' . self::ago($now - $cl) . ($now - $cl >= self::CRON_FRESH_MS ? ' — 5 dakikada bir çalışmalı.' : '') : ('cPanel › Cron Jobs ile app/cron.php her 5 dakikada bir çalıştırılmalı.' . ($tick ? ' (Şu an yalnız ziyaretlerle tetiklenen yedek tik çalışıyor.)' : '')),
            '#yonetim/entegrasyon');
        $mail = Settings::get('mail', $db);
        $mailOk = !empty($mail['on']) && !empty($mail['provider']) && !empty($mail['from']);
        $sent = $db->tableExists('outbox') ? (int)$db->val("SELECT COUNT(*) FROM {outbox} WHERE channel='mail' AND status='sent' AND ev='test'") : 0;
        $add('mail', $mailOk && $sent > 0, 'E-posta ayarlandı ve denendi', !$mailOk ? 'E-posta servisi (Brevo / Mailjet / SMTP) açık değil ya da gönderen adresi eksik.'
            : ($sent ? 'Deneme e-postası başarıyla gönderildi.' : 'Ayarlar kayıtlı; bir deneme e-postası gönderin.'), '#yonetim/sms/eposta');
        $sms = Settings::get('sms', $db);
        $add('whatsapp', \YP\Sms\Sms::canSend(is_array($sms) ? $sms : [], 'tfa'), 'WhatsApp Business ayarlandı', 'İsteğe bağlı: doğrulama kodları ve bildirimler WhatsApp\'tan da gidebilir.', '#yonetim/sms/whatsapp', true);
        $L = Content::legalStatus($db);
        $miss = array_map(function ($k) {
            return Content::COMPANY[$k][0];
        }, $L['missingCompany']);
        $bad = array_keys(array_filter($L['pages'], function ($p) {
            return !$p['ok'];
        }));
        $add('legal', $L['ok'], 'Yasal sayfalar ve şirket bilgisi tam', $L['ok'] ? 'Hakkımızda, İletişim/Künye, KVKK, Mesafeli satış, İade/iptal, Gizlilik & çerez sayfaları dolu.'
            : ($miss ? 'Eksik şirket bilgisi: ' . implode(', ', $miss) . '.' : '') . ($bad ? ' Tamamlanmamış sayfa: ' . implode(', ', array_map(function ($k) {
                return Content::PAGES[$k][0];
            }, $bad)) . '.' : ''), '#yonetim/ayar/yasal');
        $E = Site::etbis($db);
        $add('etbis', !empty($E['on']) && Site::etbisUrlOk($E['url']), 'ETBİS kaydı ve rozeti', !empty($E['on']) && Site::etbisUrlOk($E['url']) ? 'Rozet sitenin alt kısmında görünüyor.' : 'ETBİS doğrulama bağlantısını girip rozeti açın.', '#yonetim/ayar/etbis');
        $banks = $db->tableExists('banks') ? (int)$db->val('SELECT COUNT(*) FROM {banks}') : 0;
        $add('bank', $banks > 0, 'En az bir banka hesabı', $banks ? $banks . ' banka hesabı kayıtlı (havale/EFT ile bakiye yükleme).' : 'Üyelerin havale/EFT yapacağı banka hesabını ekleyin.', '#yonetim/odeme/hesaplar');
        $bs = Backup::settings($db);
        $last = Backup::lastAt($db);
        $add('backup', $bs['auto'] !== 'off' && $last && $now - $last < 2 * 86400000, 'Yedekleme ayarlandı', $bs['auto'] === 'off' ? 'Otomatik yedek kapalı.'
            : ($last ? 'Son yedek: ' . self::ago($now - $last) . ($now - $last >= 2 * 86400000 ? ' — 2 günden eski; cron çalışıyor mu?' : '') : 'Henüz yedek yok; "Şimdi yedek al" ile ilk yedeği oluşturun.'), '#yonetim/bakim/yedekler');
        $demo = (int)Settings::get('demo_mode', $db);
        $add('demo', !$demo, 'Demo modu kapalı', $demo ? 'Demo modu açık: hesap değiştirici herkese açık. Kapatın.' : 'Kapalı.', '#yonetim/ayar/yayin');
        $tfa = (int)$db->val("SELECT COUNT(*) FROM {users} WHERE role='admin' AND status='active' AND tfa<>''");
        $add('tfa', $tfa > 0, 'Yöneticide 2 adımlı doğrulama', $tfa ? $tfa . ' yönetici hesabında açık.' : 'Hesabım › Profil ve güvenlik bölümünden 2 adımlı doğrulamayı açın.', '#hesabim');
        list(, $SE, ) = Seo::settings($db);
        $add('clean', Seo::mode($SE) === 'clean', 'Temiz adresler çalışıyor', Seo::mode($SE) === 'clean' ? 'Örnek: /metin2-pvp/…' : 'Site ?p= yedek adresleriyle çalışıyor (.htaccess / mod_rewrite). Yönetim › SEO › "Şimdi dene".', '#yonetim/seo/genel');
        $add('paytr', \YP\Money\Paytr::configured(), 'PayTR (kart ile ödeme)', 'Son adım, isteğe bağlı: PayTR mağaza başvurusu bu liste tamamlanınca yapılır.', '#yonetim/entegrasyon', true);
        $req = array_filter($C, function ($c) {
            return !$c['opt'];
        });
        return ['checks' => $C, 'ok' => count(array_filter($req, function ($c) {
            return $c['ok'];
        })), 'total' => count($req)];
    }

    public static function ago($ms)
    {
        $m = (int)floor($ms / 60000);
        if ($m < 1) {
            return 'az önce';
        }
        if ($m < 60) {
            return $m . ' dk önce';
        }
        $h = (int)floor($m / 60);
        return $h < 48 ? $h . ' saat önce' : (int)floor($h / 24) . ' gün önce';
    }
}
