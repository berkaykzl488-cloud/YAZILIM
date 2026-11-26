<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;
use YP\Money\Rules;
use YP\Money\View;

/**
 * Canlı destek (P6): ön yüzdeki 70-support.js (myTicket, botReply, escalate, lsSend) ve 80/81/82 işleyicilerinin (tk-claim,
 * tkreply, tk-close, tkxfer, tk-rate, ls-agent) sunucu karşılığı.
 * - Asistan kural tabanlıdır (yapay zekâ yok): sık sorulara hazır yanıt verir; bilmediği konuda ya da üye "temsilci" derse sıraya alır.
 *   Asistan asla şifre, doğrulama kodu veya kart bilgisi vermez/istemez; "şifre" geçen her soruya güvenlik uyarısı + "Şifremi unuttum".
 * - Çalışma saatleri Europe/Istanbul (UTC+3, yaz saati yok). mode: auto (saatlere göre) | open (şimdi açık) | closed (destek kapalı).
 * - Üye mesajı Censor'dan geçer (telefon, link, site dışı iletişim gizlenir; orijinal metin flagged tablosuna).
 * - Talep durumları: acik | bekliyor (temsilci sırası) | kapandi. Ön yüze 'kapandı' olarak verilir (demo ile aynı).
 */
final class Support
{
    const TZ = 10800; // saniye, UTC+3
    const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

    public static function defaults()
    {
        return [
            'mode' => 'auto',
            'hours' => ['0' => ['10:00', '22:00', true], '1' => ['09:00', '24:00', true], '2' => ['09:00', '24:00', true], '3' => ['09:00', '24:00', true],
                        '4' => ['09:00', '24:00', true], '5' => ['09:00', '24:00', true], '6' => ['10:00', '24:00', true]],
            'ai' => false, 'aiName' => 'Han Asistan', 'wait' => '2 dk',
            'offline' => 'Şu an temsilcilerimiz çevrimdışı. Asistanımız sorularınızı yanıtlamaya devam ediyor.',
            'canned' => [
                ['Selamlama', 'Merhaba, ben {temsilci}. Size nasıl yardımcı olabilirim?'],
                ['Sipariş kontrol', 'Siparişinizi kontrol ediyorum, bir dakika lütfen.'],
                ['İptal talebi', 'Siparişinizi kontrol ediyorum. Satıcı teslim etmediyse siparişi iptal edip tutarı bakiyenize iade edeceğim.'],
                ['Çekim süresi', 'Para çekme talepleri mesai saatlerinde 2-6 saat içinde IBAN’ınıza gönderilir.'],
                ['Güvenlik', 'Ekibimiz sizden asla şifre, doğrulama kodu veya kart bilgisi istemez. Böyle bir mesaj alırsanız bize bildirin.'],
                ['Kapanış', 'Başka bir konuda yardımcı olabilir miyim? İyi oyunlar dileriz.'],
            ],
        ];
    }

    public static function cfg(?Db $db = null)
    {
        $s = Settings::get('support', $db);
        $d = self::defaults();
        $s = is_array($s) ? array_replace($d, $s) : $d;
        $h = [];
        foreach (range(0, 6) as $i) {
            $x = isset($s['hours'][$i]) ? $s['hours'][$i] : (isset($s['hours'][(string)$i]) ? $s['hours'][(string)$i] : $d['hours'][(string)$i]);
            $h[(string)$i] = [(string)$x[0], (string)$x[1], !empty($x[2])];
        }
        $s['hours'] = $h;
        $s['ai'] = false; // yapay zekâ asistanı bu sürümde yok (sahip kararı bekliyor)
        return $s;
    }

    /** Herkese açık kısım (boot.support): hazır yanıtlar yalnız [destek] çalışanına */
    public static function publicCfg(Db $db, $u = null)
    {
        $c = self::cfg($db);
        $out = ['mode' => $c['mode'], 'hours' => $c['hours'], 'ai' => false, 'aiName' => $c['aiName'], 'wait' => $c['wait'], 'offline' => $c['offline'],
                'on' => $c['mode'] !== 'closed', 'open' => self::isOpen($c), 'canned' => []];
        if ($u && Perm::has($u, 'destek')) {
            $out['canned'] = $c['canned'];
        }
        return $out;
    }

    private static function hm($s)
    {
        $p = explode(':', (string)$s);
        return (int)$p[0] * 60 + (isset($p[1]) ? (int)$p[1] : 0);
    }

    /** supportOpen(d): saatler içinde mi (Europe/Istanbul) */
    public static function isOpen(array $c, $nowMs = null)
    {
        if ($c['mode'] === 'open') {
            return true;
        }
        if ($c['mode'] === 'closed') {
            return false;
        }
        $t = intdiv($nowMs ?: yp_now_ms(), 1000) + self::TZ;
        $d = (int)gmdate('w', $t);
        $x = $c['hours'][(string)$d];
        if (empty($x[2])) {
            return false;
        }
        $m = (int)gmdate('G', $t) * 60 + (int)gmdate('i', $t);
        $o = self::hm($x[0]);
        $cl = $x[1] === '24:00' ? 1440 : self::hm($x[1]);
        return $cl > $o ? ($m >= $o && $m < $cl) : ($m >= $o || $m < $cl);
    }

    /** nextOpen(): "yarın 09:00'da" */
    public static function nextOpen(array $c, $nowMs = null)
    {
        if ($c['mode'] === 'closed') {
            return 'yakında';
        }
        $t = intdiv($nowMs ?: yp_now_ms(), 1000) + self::TZ;
        $m = (int)gmdate('G', $t) * 60 + (int)gmdate('i', $t);
        for ($i = 0; $i < 8; $i++) {
            $d = (int)gmdate('w', $t + $i * 86400);
            $x = $c['hours'][(string)$d];
            if (empty($x[2])) {
                continue;
            }
            if ($i === 0 && $m >= self::hm($x[0])) {
                continue;
            }
            return ($i === 0 ? 'bugün' : ($i === 1 ? 'yarın' : self::DAYS[$d])) . ' ' . $x[0] . "'da";
        }
        return 'yakında';
    }

    private static function pick(array $a)
    {
        return $a[random_int(0, count($a) - 1)];
    }

    private static function lower($s)
    {
        return mb_strtolower(str_replace(['I', 'İ'], ['ı', 'i'], (string)$s), 'UTF-8');
    }

    private static function tl($tl)
    {
        return Rules::tl((int)round((float)$tl * 100));
    }

    /**
     * botReply(x): kural tabanlı yanıt; null → temsilciye aktarılmalı. Kurallar ön yüzdekiyle aynı sırada.
     * Şifre kuralı eklendi: asistan şifre/kod istemez, vermez; "Şifremi unuttum"a yönlendirir.
     */
    public static function botReply(Db $db, $x)
    {
        $s = self::lower($x);
        $site = Settings::get('site', $db);
        $siteName = isset($site['siteName']) ? (string)$site['siteName'] : 'yangpazar.com';
        if (preg_match('/temsilci|insan|yetkili|canlı kişi|iptal|iade/u', $s)) {
            return null;
        }
        if (preg_match('/şifre|sifre|parola|password|doğrulama kodu|sms kodu/u', $s)) {
            return 'Güvenliğiniz için: ekibimiz ve asistanımız sizden asla şifre, doğrulama kodu veya kart bilgisi istemez; lütfen bunları bu sohbete de yazmayın. '
                . 'Şifrenizi unuttuysanız giriş penceresindeki “Şifremi unuttum” bağlantısıyla e-posta ya da WhatsApp’a gelen kodla yeni şifre belirleyebilirsiniz.';
        }
        $ex = class_exists(Exchange\Exchange::class) ? Exchange\Exchange::publicCfg($db) : ['exPlace' => ''];
        $place = $ex['exPlace'] !== '' ? $ex['exPlace'] : 'belirtilen teslimat';
        if (preg_match('/borsa|kanal|köy|teslimat yeri|ch2|bayrak/u', $s)) {
            return self::pick([
                "Yang Borsası’nda siteden aldığınız yang {$place} noktasında karakterinize ticaretle teslim edilir. Karakter adınızı doğru yazmanız yeterli.",
                "Borsada teslimat her serverda aynı yerde: {$place}. Operatörümüz size ticaret açar, miktarı kontrol edip onaylarsınız.",
                "Siteden alımda en ucuz satış emrinden başlanır. Yang {$place} noktasında teslim edilir; satmak isterseniz kendi fiyatınızla emir verebilirsiniz.",
            ]);
        }
        if (preg_match('/teslim|sipariş|gelmedi|almadım/u', $s)) {
            return self::pick([
                'Ödemeniz havuzda güvende. Hesabım › Siparişlerim’den siparişi açıp satıcıya yazabilirsiniz. Teslim gecikirse “Temsilciye bağlan” ile bize ulaşın, ekibimiz ilgilenir.',
                'Siparişiniz onaylanmadan para satıcıya geçmez. Satıcı yanıt vermiyorsa sipariş numaranızı yazın, sizi bir temsilciye aktarayım.',
                'Endişelenmeyin, tutar havuzda bekliyor. Sipariş sayfasından satıcıya mesaj atabilir, gecikme varsa iptal için temsilcimize bağlanabilirsiniz.',
            ]);
        }
        if (preg_match('/yükle|bakiye|kart|papara|havale|eft|ödeme/u', $s)) {
            return self::pick([
                'Üstteki bakiye kutusuna dokunun. Ödeme yöntemleri Bakiye Yükle penceresinde ayrı sekmelerde. Havale/EFT bildirimleri ekibimizce onaylanınca bakiyenize eklenir.',
                'Bakiye yüklemenin en hızlı yolu Bakiye Yükle penceresi. Manuel havalede açıklamaya kullanıcı adınızı yazmayı unutmayın.',
                'Bakiye Yükle penceresinde yöntemi seçip tutarı girmeniz yeterli. Kupon kodunuz varsa aynı ekranda bonus kazanırsınız.',
            ]);
        }
        if (preg_match('/çekilemez|çekemiyorum|kart bakiye/u', $s)) {
            return 'Kart, mobil ödeme ve cüzdanla yüklenen bakiye ile hediye ve bonuslar sadece alışverişte kullanılır, çekilemez. Satış gelirleriniz ve Havale/EFT ile yüklediğiniz tutar çekilebilir.';
        }
        if (preg_match('/çek|iban/u', $s)) {
            $min = self::tl(isset($site['minWithdraw']) ? $site['minWithdraw'] : 50);
            return self::pick([
                "Para çekme talepleri mesai saatlerinde 2-6 saat içinde IBAN’ınıza gönderilir. En az {$min} çekebilirsiniz.",
                'Hesabım › Para çek bölümünden talep oluşturun. IBAN sizin adınıza kayıtlı olmalı; ortalama 2-6 saatte hesabınızda olur.',
            ]);
        }
        if (preg_match('/reklam|popup|banner/u', $s)) {
            $pk = class_exists(Growth\Ads::class) ? Growth\Ads::packs($db) : [];
            $w = function ($k) use ($pk) {
                return isset($pk[$k]['p'][1]) ? self::tl($pk[$k]['p'][1]) : '-';
            };
            return self::pick([
                'Reklam paketlerimiz: slider (haftalık ' . $w('slider') . '), popup (haftalık ' . $w('popup') . '), premium liste (haftalık ' . $w('premium') . ').',
                '“Reklam Ver” sayfasından paketi seçip görsel veya videonuzu yükleyebilirsiniz; ödeme bakiyeden alınır, reklam onaydan sonra yayına girer.',
            ]);
        }
        if (preg_match('/komisyon|kesinti/u', $s)) {
            $c = isset($site['commission']) ? $site['commission'] : 8;
            return self::pick([
                "Komisyon %{$c} ve satıcıdan kesilir. VIP seviyeniz yükseldikçe oran düşer.",
                "Alıcı yalnızca ilan fiyatını öder; satıcıdan %{$c} komisyon alınır, VIP üyelerde daha az.",
            ]);
        }
        if (preg_match('/won/u', $s)) {
            return 'Metin2 TR sunucularında 1 Won = 100M yang. İlan fiyatları 1 Won içindir.';
        }
        if (preg_match('/(?<![a-z0-9_])ep(?![a-z0-9_])|ejderha/u', $s)) {
            $hh = '';
            if (class_exists(Exchange\Ep::class) && Exchange\Ep::hhOn($db)) {
                $h = Settings::get('hh', $db);
                $hh = ' Şu an Happy Hour aktif: aynı fiyata %' . (isset($h['pct']) ? $h['pct'] : 30) . ' fazla EP!';
            }
            return self::pick([
                "Metin2 EP'yi yalnızca {$siteName} satar; ödeme anında kodunuz ekrana gelir ve Hesabım › EP kodlarım'da saklanır." . $hh,
                'EP kodları tüm TR serverlarında geçerli ve otomatik teslim edilir. Menüdeki “Metin2 EP” bölümünden hemen alabilirsiniz.',
            ]);
        }
        if (preg_match('/çekiliş|çark|bilet/u', $s)) {
            return self::pick(['Her 100 TL alışveriş 1 çekiliş bileti. Her gün 1 ücretsiz bilet ve 1 ücretsiz çark hakkınız var.',
                'Çekiliş & Çark sayfasında günlük ücretsiz çevirme hakkınız var; alışveriş yaptıkça bilet de kazanırsınız.']);
        }
        if (preg_match('/güven|dolandır/u', $s)) {
            return self::pick(['Paranız ürünü onaylayana kadar havuzda bekler. Ekibimiz sizden asla şifre veya doğrulama kodu istemez.',
                'Site dışında ödeme yapmayın; telefon ve link paylaşımları otomatik gizlenir. Tüm ödemeler havuz güvencesindedir.']);
        }
        if (preg_match('/merhaba|selam|iyi akşam|günaydın/u', $s)) {
            return self::pick(['Merhaba! Size nasıl yardımcı olabilirim?', 'Selam, hoş geldiniz. Hangi konuda yardım istersiniz?',
                'Merhaba, buradayım. Siparişiniz, bakiye ya da borsa hakkında sorabilirsiniz.']);
        }
        return null;
    }

    /* ================= talepler ================= */

    public static function row(Db $db, $id, $lock = false)
    {
        $t = $db->one('SELECT * FROM {tickets} WHERE id=?' . ($lock ? $db->forUpdate() : ''), [(int)$id]);
        if (!$t) {
            throw HttpError::notFound('Destek talebi bulunamadı.');
        }
        return $t;
    }

    public static function tid($v)
    {
        return Ids::parse($v, 'tk');
    }

    /** myTicket(false): kapanmamış ya da değerlendirilmemiş son talep */
    public static function current(Db $db, $uid)
    {
        return $db->one("SELECT * FROM {tickets} WHERE user_id=? AND (status<>'kapandi' OR rated=0) ORDER BY id DESC LIMIT 1", [(int)$uid]);
    }

    public static function msg(Db $db, $tid, $f, $x, array $o = [])
    {
        $now = yp_now_ms();
        $id = $db->insert('ticket_messages', [
            'ticket_id' => (int)$tid, 'f' => $f, 'by_id' => isset($o['by']) ? (int)$o['by'] : null, 'x' => yp_str($x, 2000),
            'order_ref' => isset($o['order']) ? (string)$o['order'] : '', 'media_id' => isset($o['media']) ? (int)$o['media'] : null,
            'flagged' => !empty($o['flag']) ? 1 : 0, 't' => $now,
        ]);
        $db->exec('UPDATE {tickets} SET last_at=? WHERE id=?', [$now, (int)$tid]);
        return $id;
    }

    /** myTicket(true): yoksa açar ve asistan selamlamasını yazar */
    public static function open(Db $db, array $u)
    {
        $t = self::current($db, $u['id']);
        if ($t && $t['status'] === 'kapandi') { // değerlendirmeden yeni mesaj yazdı: eskisi "atlandı" sayılır
            $db->exec('UPDATE {tickets} SET rated=1 WHERE id=?', [(int)$t['id']]);
            $t = null;
        }
        if ($t) {
            return $t;
        }
        $c = self::cfg($db);
        $now = yp_now_ms();
        $id = $db->insert('tickets', ['user_id' => (int)$u['id'], 'status' => 'acik', 'created_at' => $now, 'last_at' => $now]);
        $n = ' ' . $u['name'];
        self::msg($db, $id, 'b', self::pick([
            "Merhaba{$n}! Ben {$c['aiName']}. Siparişler, borsa, ödeme ve hesap konularında hemen yardımcı olabilirim.",
            "Hoş geldiniz{$n}! {$c['aiName']} burada. Sorunuzu yazın, gerekirse sizi bir temsilciye bağlarım.",
            "Selam{$n}, ben {$c['aiName']}. Siparişinizi ekleyerek yazarsanız daha hızlı yardımcı olurum.",
        ]));
        return self::row($db, $id);
    }

    public static function queuePos(Db $db, array $t)
    {
        if ($t['status'] !== 'bekliyor') {
            return 0;
        }
        return (int)$db->val("SELECT COUNT(*) FROM {tickets} WHERE status='bekliyor' AND (queued_at<? OR (queued_at=? AND id<=?))",
            [(int)$t['queued_at'], (int)$t['queued_at'], (int)$t['id']]);
    }

    /** escalate(t): temsilci sırasına alır (zaten sıradaysa bir şey yapmaz) */
    public static function escalate(Db $db, array $t)
    {
        if ($t['status'] === 'bekliyor' || $t['status'] === 'kapandi') {
            return false;
        }
        $now = yp_now_ms();
        $db->update('tickets', ['status' => 'bekliyor', 'queued_at' => $now, 'unread_s' => (int)$t['unread_s'] + 1], 'id=?', [(int)$t['id']]);
        $t = self::row($db, $t['id']);
        $c = self::cfg($db);
        $q = self::queuePos($db, $t);
        $x = self::isOpen($c)
            ? self::pick(["Sizi bir temsilciye aktardım. Sıradaki yeriniz: {$q}. Ortalama bekleme " . ($c['wait'] ?: '2 dk') . '.',
                "Bir temsilcimiz birazdan sizinle olacak. Sıranız: {$q}.",
                "Talebinizi ekibimize ilettim, {$q}. sıradasınız. Bu pencereyi kapatsanız da yanıt size bildirim olarak gelir."])
            : $c['offline'] . ' Talebiniz #DST-' . (int)$t['id'] . ' ile sıraya alındı; temsilcilerimiz ' . self::nextOpen($c) . ' döndüğünde size bildirimle yanıt verecek.';
        self::msg($db, $t['id'], 's', $x);
        $db->exec('UPDATE {tickets} SET unread_u=unread_u+1 WHERE id=?', [(int)$t['id']]);
        return true;
    }

    /** Sipariş referansı üyeye ait mi? 'S100004' (sipariş) / 'B1001' (borsa). Dönüş: normalize edilmiş referans ya da '' */
    public static function orderRef(Db $db, $uid, $ref)
    {
        $ref = strtoupper(trim((string)$ref));
        if ($ref === '') {
            return '';
        }
        if (preg_match('/^S([0-9]{6,18})$/', $ref, $m) && (int)$m[1] > 100000) {
            $id = (int)$m[1] - 100000;
            if ($db->val('SELECT id FROM {orders} WHERE id=? AND (buyer_id=? OR seller_id=?)', [$id, (int)$uid, (int)$uid])) {
                return View::orderId($id);
            }
        } elseif (preg_match('/^B([0-9]{4,18})$/', $ref, $m) && (int)$m[1] > 1000 && $db->tableExists('ex_orders')) {
            $id = (int)$m[1] - 1000;
            if ($db->val('SELECT id FROM {ex_orders} WHERE id=? AND user_id=?', [$id, (int)$uid])) {
                return 'B' . (1000 + $id);
            }
        }
        throw HttpError::validation(['order' => 'Bu sipariş hesabınızda bulunamadı.']);
    }

    /**
     * lsSend: üye mesajı. $media: doğrulanmış media satırı (kind=support, sahibi bu üye) ya da null.
     * Dönüş: ['ticket' => satır, 'flagged' => bool]
     */
    public static function send(Db $db, array $u, $x, $orderRef = '', $media = null)
    {
        $x = trim((string)$x);
        if ($x === '' && $orderRef !== '') {
            $x = '#' . $orderRef . ' numaralı siparişim hakkında yardım istiyorum.';
        }
        if ($x === '' && $media) {
            $x = 'Ekran görüntüsü gönderdim.';
        }
        if ($x === '') {
            throw HttpError::validation(['x' => 'Mesajınızı yazın.']);
        }
        $raw = yp_str($x, 1000);
        $c = Censor::apply($raw);
        return $db->tx(function (Db $db) use ($u, $raw, $c, $orderRef, $media) {
            $t = self::open($db, $u);
            if ($c['flagged']) {
                Censor::log($db, $u['id'], 'Canlı destek #DST-' . (int)$t['id'], $raw);
            }
            self::msg($db, $t['id'], 'u', $c['text'], ['by' => $u['id'], 'order' => $orderRef, 'media' => $media ? $media['id'] : null, 'flag' => $c['flagged']]);
            if ($media) {
                $db->exec("UPDATE {media} SET ref_type='ticket', ref_id=? WHERE id=?", [(int)$t['id'], (int)$media['id']]);
            }
            if ($t['status'] === 'bekliyor' || $t['agent_id']) {
                $db->exec('UPDATE {tickets} SET unread_s=unread_s+1 WHERE id=?', [(int)$t['id']]);
            } elseif (preg_match('/temsilci|insan|yetkili/iu', $raw)) {
                self::escalate($db, $t);
            } else {
                $r = self::botReply($db, $raw);
                if ($r !== null) {
                    self::msg($db, $t['id'], 'b', $r);
                    $db->exec('UPDATE {tickets} SET unread_u=unread_u+1 WHERE id=?', [(int)$t['id']]);
                } else {
                    self::msg($db, $t['id'], 'b', self::pick(['Bu konuda sizi bir temsilciye aktarıyorum.',
                        'Bunu bir arkadaşımızın kontrol etmesi daha doğru olur, sizi temsilciye bağlıyorum.',
                        'Bu talebi ekibimize iletiyorum, kısa süre içinde dönüş yapılacak.']));
                    self::escalate($db, self::row($db, $t['id']));
                }
            }
            return ['ticket' => self::row($db, $t['id']), 'flagged' => $c['flagged']];
        });
    }

    public static function rate(Db $db, array $u, $n)
    {
        $n = (int)$n;
        if ($n < 1 || $n > 5) {
            throw HttpError::validation(['n' => '1 ile 5 arasında bir puan seçin.']);
        }
        return $db->tx(function (Db $db) use ($u, $n) {
            $t = $db->one("SELECT * FROM {tickets} WHERE user_id=? AND status='kapandi' AND rated=0 ORDER BY id DESC LIMIT 1" . $db->forUpdate(), [(int)$u['id']]);
            if (!$t) {
                throw HttpError::conflict('Değerlendirilecek kapanmış bir görüşme yok.');
            }
            $db->update('tickets', ['rating' => $n, 'rated' => 1], 'id=?', [(int)$t['id']]);
            self::msg($db, $t['id'], 's', 'Değerlendirmeniz için teşekkürler (' . str_repeat('★', $n) . ').');
            return self::row($db, $t['id']);
        });
    }

    /* ---------------- temsilci ---------------- */

    public static function claim(Db $db, array $staff, $id)
    {
        return $db->tx(function (Db $db) use ($staff, $id) {
            $t = self::row($db, $id, true);
            if ($t['status'] === 'kapandi') {
                throw HttpError::conflict('Bu görüşme kapanmış.');
            }
            if ((int)$t['agent_id'] === (int)$staff['id']) {
                return $t;
            }
            $db->update('tickets', ['agent_id' => (int)$staff['id'], 'status' => 'acik', 'unread_u' => (int)$t['unread_u'] + 1], 'id=?', [(int)$t['id']]);
            self::msg($db, $t['id'], 's', $staff['name'] . ' görüşmeye katıldı.');
            return self::row($db, $t['id']);
        });
    }

    public static function reply(Db $db, array $staff, $id, $x, $note)
    {
        $x = trim(str_replace('{temsilci}', $staff['name'], (string)$x));
        if ($x === '') {
            throw HttpError::validation(['x' => 'Yanıtı yazın.']);
        }
        $x = yp_str($x, 2000);
        return $db->tx(function (Db $db) use ($staff, $id, $x, $note) {
            $t = self::row($db, $id, true);
            if ($note) {
                self::msg($db, $t['id'], 'n', $x, ['by' => $staff['id']]);
                return self::row($db, $t['id']);
            }
            if ($t['status'] === 'kapandi') {
                throw HttpError::conflict('Bu görüşme kapanmış; üye yeni mesaj yazınca yeni talep açılır.');
            }
            self::msg($db, $t['id'], 'a', $x, ['by' => $staff['id']]);
            $set = ['unread_u' => (int)$t['unread_u'] + 1, 'unread_s' => 0];
            if (!$t['agent_id']) {
                $set['agent_id'] = (int)$staff['id'];
            }
            if ($t['status'] === 'bekliyor') {
                $set['status'] = 'acik';
            }
            $db->update('tickets', $set, 'id=?', [(int)$t['id']]);
            $mu = $db->one('SELECT id, last_seen FROM {users} WHERE id=?', [(int)$t['user_id']]);
            if ($mu && (int)$mu['last_seen'] < yp_now_ms() - 120000) { // üye şu an sitede değilse site bildirimi
                Notify::send($db, $mu['id'], 'Canlı destekten yanıtınız var: ' . yp_str($x, 80), '#destek');
            }
            return self::row($db, $t['id']);
        });
    }

    public static function close(Db $db, array $staff, $id)
    {
        return $db->tx(function (Db $db) use ($staff, $id) {
            $t = self::row($db, $id, true);
            if ($t['status'] === 'kapandi') {
                throw HttpError::conflict('Bu görüşme zaten kapalı.');
            }
            $db->update('tickets', ['status' => 'kapandi', 'closed_at' => yp_now_ms(), 'closed_by' => (int)$staff['id'], 'unread_s' => 0,
                'unread_u' => (int)$t['unread_u'] + 1, 'agent_id' => $t['agent_id'] ?: (int)$staff['id']], 'id=?', [(int)$t['id']]);
            self::msg($db, $t['id'], 's', 'Görüşme ' . $staff['name'] . ' tarafından kapatıldı. Lütfen değerlendirin.');
            return self::row($db, $t['id']);
        });
    }

    public static function transfer(Db $db, array $staff, $id, $to)
    {
        $agent = $db->one('SELECT * FROM {users} WHERE id=?', [Ids::user($to)]);
        if (!$agent || $agent['status'] !== 'active' || !Perm::has($agent, 'destek')) {
            throw HttpError::validation(['to' => 'Seçilen kişi canlı destek yetkisine sahip bir çalışan değil.']);
        }
        return $db->tx(function (Db $db) use ($staff, $id, $agent) {
            $t = self::row($db, $id, true);
            if ($t['status'] === 'kapandi') {
                throw HttpError::conflict('Bu görüşme kapanmış.');
            }
            $db->update('tickets', ['agent_id' => (int)$agent['id']], 'id=?', [(int)$t['id']]);
            self::msg($db, $t['id'], 'n', 'Görüşme ' . $agent['name'] . ' kullanıcısına aktarıldı.', ['by' => $staff['id']]);
            if ((int)$agent['id'] !== (int)$staff['id']) {
                Notify::send($db, $agent['id'], $staff['name'] . ' bir canlı destek görüşmesini size aktardı (#DST-' . (int)$t['id'] . ').', '#yonetim/destek/talepler?id=tk' . (int)$t['id']);
            }
            return self::row($db, $t['id']);
        });
    }

    /* ---------------- sunum (ön yüzdeki S.tickets şekli) ---------------- */

    public static function st($s)
    {
        return $s === 'kapandi' ? 'kapandı' : $s;
    }

    /**
     * $view: 'member' (iç notlar yok) | 'staff'. $after: yalnız bu no'dan sonraki iletiler (yoklama).
     */
    public static function present(Db $db, array $t, $view = 'member', $after = 0, $limit = 300)
    {
        $rows = $db->all('SELECT m.*, md.id AS mid, md.vis, md.path FROM {ticket_messages} m LEFT JOIN {media} md ON md.id=m.media_id WHERE m.ticket_id=? AND m.id>?'
            . ($view === 'member' ? " AND m.f<>'n'" : '') . ' ORDER BY m.id DESC LIMIT ' . (int)$limit, [(int)$t['id'], (int)$after]);
        $rows = array_reverse($rows);
        $msgs = array_map(function ($m) {
            $o = ['id' => 'tm' . (int)$m['id'], 'f' => $m['f'], 'x' => $m['x'], 't' => (int)$m['t']];
            if ($m['by_id'] !== null) {
                $o['by'] = Ids::u($m['by_id']);
            }
            if ($m['order_ref'] !== '') {
                $o['order'] = $m['order_ref'];
            }
            if ($m['mid']) {
                $o['img'] = Media::url(['id' => $m['mid'], 'vis' => $m['vis'], 'path' => $m['path']]);
            }
            if ((int)$m['flagged']) {
                $o['flag'] = true;
            }
            return $o;
        }, $rows);
        $out = [
            'id' => 'tk' . (int)$t['id'], 'no' => (int)$t['id'], 'u' => Ids::u($t['user_id']), 'status' => self::st($t['status']),
            't' => (int)$t['created_at'], 'agent' => Ids::u($t['agent_id']), 'rating' => (int)$t['rating'], 'rated' => (bool)(int)$t['rated'],
            'queuedAt' => $t['queued_at'] !== null ? (int)$t['queued_at'] : null, 'closedAt' => $t['closed_at'] !== null ? (int)$t['closed_at'] : null,
            'last' => (int)$t['last_at'], 'pos' => self::queuePos($db, $t), 'msgs' => $msgs,
        ];
        if ($view === 'member') {
            $out['unread'] = (int)$t['unread_u'];
        } else {
            $out['unreadAgent'] = (int)$t['unread_s'];
        }
        return $out;
    }

    /** Konuşulan üyeler (yönetim listesi için çalışan görünümü) */
    public static function users(Db $db, array $ids, $staffView)
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        if (!$ids) {
            return [];
        }
        $rows = $db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
        return array_map(function ($u) use ($db, $staffView) {
            return $staffView ? Present::staffUser($db, $u) : Present::publicUser($u);
        }, $rows);
    }
}
