<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Accounting\Queue;
use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Integrations;
use YP\Kimlik;
use YP\Notify;
use YP\Settings;
use YP\Store;
use YP\Text;

/**
 * Para çekme (PLAN §1.4 Withdrawals, P3) — ön yüzdeki wdFee / wdBreakdown / issueEgp / wdPaidBook işlevlerinin sunucu karşılığı.
 *
 *   Talep    yalnız çekilebilir bakiyeden (cash: satış gelirleri + Havale/EFT yüklemeleri). Kart/cüzdan/kripto ile yüklenen ve
 *            bonus bakiye (credit) çekilemez. Tutar talep anında ayrılır: U<id>:cash → PAYABLE:WD (cekim_talep).
 *            IBAN hesap sahibi üyenin kendi adı soyadı olmalı; TC doğrulaması (ayar açıksa) ve tam TC numarası gerekir.
 *   Onay     PAYABLE:WD → BANK:OUT (net) + REV:cekim (işlem ücreti) + TAX:stopaj (cekim_odendi). Ayar açıksa ve üyenin tam TC'si
 *            kayıtlıysa e-Gider Pusulası AYNI işlemde numaralanır (doc_sequences satır kilidi: boşluksuz, tek numara).
 *            Paraşüt / Bizim Hesap kaydı işlem bittikten sonra accounting_jobs kuyruğundan cron ile yapılır.
 *   Red      PAYABLE:WD → U<id>:cash (cekim_red), gerekçe zorunlu; ücret alınmaz.
 * e-Gider Pusulası yalnız iç muhasebedir: üye yanıtlarında belge no / ETTN / pusula ifadesi YOKTUR (memberView).
 * Belge her zaman üyenin sistemdeki ad soyadı, TAM T.C. kimlik numarası ve telefonuyla kesilir (vergi mükellefiyeti seçeneği yok).
 */
final class Withdraw
{
    const PREFIX = 'w';

    public static function id($v)
    {
        return Ids::parse($v, self::PREFIX);
    }

    public static function ref($id)
    {
        return self::PREFIX . (int)$id;
    }

    /* ---------------- ücret ve kesinti (ön yüz wdFee / wdBreakdown) ---------------- */

    public static function feeCfg(?Db $db = null)
    {
        $f = Settings::get('wdFee', $db);
        return is_array($f) ? $f : [];
    }

    public static function egpCfg(?Db $db = null)
    {
        $e = Settings::get('egp', $db);
        return is_array($e) ? $e : [];
    }

    /** JS r2: Math.round(n*100)/100 (aynı kayan nokta işlem sırası — parite) */
    private static function r2($n)
    {
        return floor($n * 100 + 0.5) / 100;
    }

    private static function kr($tl)
    {
        return (int)round($tl * 100);
    }

    /** wdFee(a) — kuruş girer/çıkar; hesap ön yüzdeki gibi TL üzerinde (yüzde: a*val/100, en az/en fazla; sabit: val; en fazla a; r2) */
    public static function fee($a, array $f)
    {
        return self::kr(self::feeTl(((int)$a) / 100, $f));
    }

    private static function feeTl($a, array $f)
    {
        if (empty($f['on']) || !($a > 0)) {
            return 0.0;
        }
        $val = (float)(isset($f['val']) ? $f['val'] : 0);
        $y = (isset($f['type']) ? $f['type'] : '') === 'yuzde';
        $x = $y ? $a * $val / 100 : $val;
        if ($y) {
            $min = isset($f['min']) ? (float)$f['min'] : 0;
            $max = isset($f['max']) ? (float)$f['max'] : 0;
            if ($min > 0) {
                $x = max($x, $min);
            }
            if ($max > 0) {
                $x = min($x, $max);
            }
        }
        return self::r2(min($x, $a));
    }

    /**
     * wdBreakdown(a, taxFree) — ön yüzle birebir (parite testi: tests/unit_p3.php). Girdi/çıktı kuruş, stopajPct yüzde (ör. 2.5).
     * Sonuç kuruşa çevrildikten sonra defter yalnız tamsayıyla çalışır; net = brüt − stopaj her zaman tutar.
     */
    public static function breakdown($a, array $fee, array $egp, $taxFree = true)
    {
        $a = max(0, (int)$a);
        $aT = $a / 100;
        $f = self::feeTl($aT, $fee);
        $brut = self::r2(max(0, $aT - $f));
        $pct = ($taxFree !== false && !empty($egp['on'])) ? max(0, (float)(isset($egp['stopaj']) ? $egp['stopaj'] : 0)) : 0;
        $st = self::r2($brut * $pct / 100);
        $bk = self::kr($brut);
        $sk = self::kr($st);
        return ['amount' => $a, 'fee' => self::kr($f), 'brut' => $bk, 'stopajPct' => $pct, 'stopaj' => $sk, 'net' => $bk - $sk];
    }

    /** Onayda stopaj oranı değişirse (pusula penceresi): ön yüzdeki issueEgp ile aynı r2(brut*pct/100) */
    public static function stopajOf($brutKurus, $pct)
    {
        return self::kr(self::r2(($brutKurus / 100) * $pct / 100));
    }

    /* ---------------- yardımcılar ---------------- */

    public static function fmtIban($iban)
    {
        return trim(chunk_split(strtoupper(preg_replace('/\s+/', '', (string)$iban)), 4, ' '));
    }

    public static function ibanOf(array $w)
    {
        try {
            return yp_decrypt($w['iban_enc']);
        } catch (\Throwable $e) {
            return '';
        }
    }

    public static function fullName(array $u)
    {
        return trim(preg_replace('/\s+/u', ' ', $u['ad'] . ' ' . $u['soyad']));
    }

    public static function nameKey($s)
    {
        return Text::fold(trim(preg_replace('/\s+/u', ' ', (string)$s)));
    }

    /** İstanbul saatine göre yıl / gün anahtarı */
    public static function tz($ms, $fmt)
    {
        return (new \DateTime('@' . intdiv((int)$ms, 1000)))->setTimezone(new \DateTimeZone('Europe/Istanbul'))->format($fmt);
    }

    public static function dayStart($ms)
    {
        $d = (new \DateTime('@' . intdiv((int)$ms, 1000)))->setTimezone(new \DateTimeZone('Europe/Istanbul'));
        $d->setTime(0, 0, 0);
        return $d->getTimestamp() * 1000;
    }

    private static function row(Db $db, $id, $lock = false)
    {
        $w = $db->one('SELECT * FROM {withdrawals} WHERE id=?' . ($lock ? $db->forUpdate() : ''), [(int)$id]);
        if (!$w) {
            throw HttpError::notFound('Çekim talebi bulunamadı.');
        }
        return $w;
    }

    public static function find(Db $db, $ref)
    {
        return self::row($db, self::id($ref));
    }

    /* ---------------- talep ---------------- */

    /** Üye çekim yapabilir mi? Değilse [kod, mesaj] */
    public static function gate(Db $db, array $u)
    {
        if ($u['status'] === 'banned') {
            return ['banned', 'Hesabınız askıda olduğu için para çekemezsiniz.'];
        }
        if ($u['tc_state'] === 'inceleme' && !(int)$u['tc_ok']) {
            return ['tc_review', 'Kimlik bilgileriniz ekibimizin incelemesinde. Onaylanınca para çekebilirsiniz.'];
        }
        if (Kimlik::needed($u, $db)) {
            return ['tc_required', 'Para çekmek için önce kimliğinizi doğrulayın.'];
        }
        if ((int)$u['tc_ok'] && !Kimlik::hasFull($u)) {
            return ['tc_full', 'Para çekmek için önce T.C. kimlik numaranızı onaylayın.'];
        }
        return null;
    }

    /**
     * POST withdrawals {amount, iban:'ib3'} | {amount, bank, name, iban:'TR…', save:true}. İşlem (tx) içinde çağrılır.
     * Dönüş: withdrawals satırı
     */
    public static function request(Db $db, array $u, array $in)
    {
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
        if ($g = self::gate($db, $u)) {
            throw new HttpError($g[0] === 'banned' ? 403 : 409, $g[1], $g[0]);
        }
        $a = Text::kurus(isset($in['amount']) ? $in['amount'] : null);
        if ($a === null || $a <= 0) {
            throw HttpError::validation(['w_amt' => 'Geçerli bir tutar girin.']);
        }
        $site = Rules::site($db);
        $min = Rules::k(isset($site['minWithdraw']) ? $site['minWithdraw'] : 0);
        if ($a < $min) {
            throw HttpError::validation(['w_amt' => 'En az ' . Rules::tl($min) . ' çekebilirsiniz.']);
        }
        if ($a > 1000000000) {
            throw HttpError::validation(['w_amt' => 'Tutar çok yüksek.']);
        }
        // IBAN: kayıtlı ya da yeni
        $ibRef = isset($in['iban']) && is_scalar($in['iban']) ? trim((string)$in['iban']) : '';
        if (preg_match('/^ib[1-9][0-9]*$/', $ibRef)) {
            $ib = $db->one('SELECT * FROM {user_ibans} WHERE id=? AND user_id=?', [(int)substr($ibRef, 2), (int)$u['id']]);
            if (!$ib) {
                throw HttpError::validation(['wiban' => 'Seçtiğiniz IBAN bulunamadı. Sayfayı yenileyip tekrar seçin.']);
            }
            $iban = yp_decrypt($ib['iban_enc']);
            $bank = $ib['bank'];
            $holder = $ib['holder'];
        } else {
            $iban = strtoupper(preg_replace('/\s+/', '', $ibRef));
            $bank = yp_str(trim(isset($in['bank']) && is_scalar($in['bank']) ? (string)$in['bank'] : ''), 60);
            $holder = yp_str(trim(preg_replace('/\s+/u', ' ', isset($in['name']) && is_scalar($in['name']) ? (string)$in['name'] : '')), 80);
            $f = [];
            if (!preg_match('/^TR\d{24}$/', $iban)) {
                $f['w_iban'] = 'IBAN TR ile başlamalı ve 26 karakter olmalı.';
            } elseif (!yp_valid_iban_tr($iban)) {
                $f['w_iban'] = 'IBAN doğrulanamadı; rakamları kontrol edin.';
            }
            if (mb_strlen($bank, 'UTF-8') < 2) {
                $f['w_bank'] = 'Banka adını seçin.';
            }
            if (!preg_match('/^[\p{L}\' .\-]{3,80}$/u', $holder)) {
                $f['w_name'] = 'Hesap sahibinin adını yazın.';
            }
            if ($f) {
                throw HttpError::validation($f);
            }
        }
        // IBAN üyenin kendi adına olmalı (ön yüzdeki "İsim uyuşmuyor" kuralı sunucuda zorunlu)
        $own = self::fullName($u);
        if ($own === '' || strpos($own, ' ') === false) {
            throw HttpError::validation(['w_name' => 'Önce profilinizde adınızı ve soyadınızı kimliğinizdeki gibi girin.']);
        }
        if (self::nameKey($holder) !== self::nameKey($own)) {
            throw HttpError::validation(['w_name' => 'IBAN hesap sahibi (' . $holder . ') üyelik bilgilerinizdeki ad soyadla (' . $own . ') aynı olmalı. Para yalnız kendi adınıza kayıtlı hesaba gönderilir.']);
        }
        $brk = self::breakdown($a, self::feeCfg($db), self::egpCfg($db), true);
        if ($brk['net'] <= 0) {
            throw HttpError::validation(['w_amt' => 'Tutar işlem ücreti ve kesintilerden büyük olmalı.']);
        }
        $now = yp_now_ms();
        $daily = Rules::k(isset($site['wdDailyMax']) ? $site['wdDailyMax'] : 0);
        if ($daily > 0) {
            $today = (int)$db->val("SELECT COALESCE(SUM(amount),0) FROM {withdrawals} WHERE user_id=? AND status IN ('bekliyor','onaylandı') AND created_at>=?",
                [(int)$u['id'], self::dayStart($now)]);
            if ($today + $a > $daily) {
                throw HttpError::validation(['w_amt' => 'Günlük en fazla ' . Rules::tl($daily) . ' çekebilirsiniz. Bugün kalan: ' . Rules::tl(max(0, $daily - $today)) . '.']);
            }
        }
        // bakiye: yalnız çekilebilir (cash). Cüzdan satırı kilitlenir; eşzamanlı talepler sırayla değerlendirilir.
        $wl = Ledger::lockWallets($db, [(int)$u['id']])[(int)$u['id']];
        if ($a > $wl['cash']) {
            throw new HttpError(409, 'Çekilebilir bakiyeniz ' . Rules::tl($wl['cash']) . '. Kart, mobil ödeme ve cüzdanla yüklenen bakiye ile bonuslar çekilemez, sadece alışverişte kullanılır.',
                'insufficient', ['fields' => ['w_amt' => 'Çekilebilir bakiyeniz ' . Rules::tl($wl['cash']) . '.']]);
        }
        // yeni IBAN'ı kaydet (isteğe bağlı, en fazla 5)
        if (!preg_match('/^ib[1-9]/', $ibRef) && Api::bool(isset($in['save']) ? $in['save'] : false)) {
            $h = hash_hmac('sha256', 'iban|' . $iban, Store::pepper());
            if (!$db->val('SELECT id FROM {user_ibans} WHERE user_id=? AND iban_hash=?', [(int)$u['id'], $h])
                && (int)$db->val('SELECT COUNT(*) FROM {user_ibans} WHERE user_id=?', [(int)$u['id']]) < 5) {
                $db->insert('user_ibans', ['user_id' => (int)$u['id'], 'bank' => $bank, 'holder' => $holder, 'iban_enc' => yp_encrypt($iban),
                    'iban_last4' => substr($iban, -4), 'iban_hash' => $h, 'created_at' => $now]);
            }
        }
        $mask = Text::maskIban($iban);
        $id = $db->insert('withdrawals', [
            'user_id' => (int)$u['id'], 'amount' => $a, 'fee' => $brk['fee'], 'brut' => $brk['brut'], 'stopaj_bp' => Rules::bp($brk['stopajPct']),
            'stopaj' => $brk['stopaj'], 'net' => $brk['net'], 'bank' => $bank, 'holder' => $holder, 'iban_enc' => yp_encrypt($iban),
            'iban_mask' => $mask, 'iban_last4' => substr($iban, -4), 'status' => 'bekliyor', 'created_at' => $now,
        ]);
        $ref = self::ref($id);
        $lbl = 'Para çekme talebi · ' . $bank;
        $jid = Ledger::post($db, 'cekim_talep', ['ref_type' => 'withdrawal', 'ref_id' => $ref, 'user' => $u['id'], 'amount' => $a, 'actor' => $u['id'],
            'meta' => ['m' => $bank . ' · ' . $mask, 'ref' => $ref, 'fee' => Text::tl($brk['fee']), 'net' => Text::tl($brk['net'])]], [
            [Ledger::cash($u['id']), -$a, $lbl],
            ['PAYABLE:WD', $a],
        ]);
        $db->update('withdrawals', ['journal_id' => $jid], 'id=?', [$id]);
        Notify::send($db, $u['id'], 'Çekim talebiniz alındı. IBAN\'ınıza net ' . Rules::tl($brk['net']) . ' gönderilecek.', '#hesabim', 'withdraw_req',
            ['tutar' => Rules::tl($brk['net'])]);
        return self::row($db, $id);
    }

    /* ---------------- onay / red ---------------- */

    /**
     * POST admin/withdrawals/{id}/approve [cekim] {stopaj?, desc?, egp?}. İşlem içinde. Aynı talep ikinci kez onaylanırsa hiçbir şey
     * değişmez (aynı belge numarası döner). Dönüş: [satır, durum: 'ok'|'already', notc: bool]
     */
    public static function approve(Db $db, array $staff, $id, array $in = [])
    {
        $w = self::row($db, $id, true);
        if ($w['status'] === 'onaylandı') {
            return [$w, 'already', false];
        }
        if ($w['status'] !== 'bekliyor') {
            throw HttpError::conflict('Bu talep reddedilmiş; onaylanamaz.');
        }
        $set = [];
        if (isset($in['stopaj']) && is_numeric($in['stopaj'])) {
            $pct = max(0, min(40, round((float)$in['stopaj'] * 2) / 2));
            $st = self::stopajOf((int)$w['brut'], $pct);
            $set = ['stopaj_bp' => Rules::bp($pct), 'stopaj' => $st, 'net' => (int)$w['brut'] - $st];
            if ($set['net'] <= 0) {
                throw HttpError::validation(['egi_st' => 'Stopaj oranı net tutarı sıfırlıyor.']);
            }
            $w = array_merge($w, $set);
        }
        $now = yp_now_ms();
        $ref = self::ref($w['id']);
        $fee = (int)$w['fee'];
        $jid = Ledger::post($db, 'cekim_odendi', ['ref_type' => 'withdrawal', 'ref_id' => $ref, 'user' => $w['user_id'], 'amount' => (int)$w['net'],
            'actor' => $staff['id'], 'meta' => ['m' => $w['bank'] . ' · ' . $w['iban_mask'] . ($fee ? ' · ücret ' . Rules::tl($fee) : '')
                . ((int)$w['stopaj'] ? ' · stopaj ' . Rules::tl($w['stopaj']) : ''), 'ref' => $ref, 'fee' => Text::tl($fee), 'net' => Text::tl($w['net']),
                'stopaj' => Text::tl($w['stopaj'])]], [
            ['PAYABLE:WD', -(int)$w['amount']],
            ['BANK:OUT', (int)$w['net']],
            ['REV:cekim', $fee],
            ['TAX:stopaj', (int)$w['stopaj']],
        ]);
        $db->update('withdrawals', $set + ['status' => 'onaylandı', 'decided_at' => $now, 'decided_by' => (int)$staff['id'], 'paid_at' => $now,
            'paid_journal_id' => $jid], 'id=?', [(int)$w['id']]);
        $w = self::row($db, $w['id'], false);
        $E = self::egpCfg($db);
        $want = isset($in['egp']) ? Api::bool($in['egp']) : (!empty($E['on']) && (!isset($E['autoOnApprove']) || $E['autoOnApprove'] !== false));
        $notc = false;
        if ($want) {
            $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$w['user_id']]);
            if (Kimlik::hasFull($u)) {
                $w = self::issue($db, $staff, $w, $u, isset($in['desc']) ? $in['desc'] : null);
            } else {
                $notc = true;
            }
        }
        Audit::log($db, $staff['id'], 'withdraw_approve', 'withdrawal', $ref, ['net' => (int)$w['net'], 'fee' => $fee, 'stopaj' => (int)$w['stopaj'],
            'egp' => $w['egp_no'], 'journal' => $jid]);
        Notify::send($db, $w['user_id'], Rules::tl($w['net']) . ' çekim talebiniz IBAN\'ınıza gönderildi.', '#hesabim', 'withdraw', ['tutar' => Rules::tl($w['net'])]);
        return [$w, 'ok', $notc];
    }

    /** POST admin/withdrawals/{id}/reject [cekim] {why}. Tutar çekilebilir bakiyeye iade edilir. */
    public static function reject(Db $db, array $staff, $id, $why)
    {
        $why = trim(preg_replace('/\s+/u', ' ', is_scalar($why) ? (string)$why : ''));
        if (mb_strlen($why, 'UTF-8') < 3) {
            throw HttpError::validation(['why' => 'Red gerekçesini yazın (üyeye bildirilir).']);
        }
        $w = self::row($db, $id, true);
        if ($w['status'] === 'reddedildi') {
            return [$w, 'already'];
        }
        if ($w['status'] !== 'bekliyor') {
            throw HttpError::conflict('Bu talep onaylanmış (ödeme gönderildi); reddedilemez.');
        }
        $ref = self::ref($w['id']);
        $jid = Ledger::post($db, 'cekim_red', ['ref_type' => 'withdrawal', 'ref_id' => $ref, 'user' => $w['user_id'], 'amount' => (int)$w['amount'],
            'actor' => $staff['id'], 'memo' => yp_str($why, 255), 'meta' => ['m' => yp_str($why, 200), 'ref' => $ref]], [
            ['PAYABLE:WD', -(int)$w['amount']],
            [Ledger::cash($w['user_id']), (int)$w['amount'], 'Çekim talebi reddedildi, iade'],
        ]);
        $db->update('withdrawals', ['status' => 'reddedildi', 'why' => yp_str($why, 255), 'decided_at' => yp_now_ms(), 'decided_by' => (int)$staff['id'],
            'paid_journal_id' => $jid], 'id=?', [(int)$w['id']]);
        Audit::log($db, $staff['id'], 'withdraw_reject', 'withdrawal', $ref, ['why' => $why, 'amount' => (int)$w['amount']]);
        Notify::send($db, $w['user_id'], 'Çekim talebiniz reddedildi, ' . Rules::tl($w['amount']) . ' bakiyenize iade edildi. Gerekçe: ' . $why, '#hesabim', 'withdraw_no',
            ['tutar' => Rules::tl($w['amount']), 'durum' => $why]);
        return [self::row($db, $w['id']), 'ok'];
    }

    /* ---------------- e-Gider Pusulası (yalnız iç muhasebe) ---------------- */

    /** Boşluksuz sıra: (seri, yıl) satırı kilitlenir, numara alınır, bir artırılır. İşlem içinde çağrılmalı. */
    public static function nextNo(Db $db, $series, $year)
    {
        if (!$db->inTx()) {
            throw new \RuntimeException('nextNo bir işlem içinde çağrılmalı.');
        }
        $db->insertIgnore('doc_sequences', ['series' => $series, 'year' => (int)$year, 'next_no' => 1, 'updated_at' => 0]);
        $n = (int)$db->val('SELECT next_no FROM {doc_sequences} WHERE series=? AND year=?' . $db->forUpdate(), [$series, (int)$year]);
        if ($db->exec('UPDATE {doc_sequences} SET next_no=next_no+1, updated_at=? WHERE series=? AND year=? AND next_no=?', [yp_now_ms(), $series, (int)$year, $n]) !== 1) {
            throw new \RuntimeException('Belge sıra numarası alınamadı.');
        }
        return $n;
    }

    public static function uuid4()
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        $h = bin2hex($b);
        return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
    }

    public static function seri(array $E)
    {
        $s = strtoupper(preg_replace('/[^A-Za-z]/', '', isset($E['seri']) ? (string)$E['seri'] : ''));
        return str_pad(substr($s !== '' ? $s : 'YGP', 0, 3), 3, 'X');
    }

    /** Mal / Hizmet açıklaması: şablon ({banka}, {iban}, {uye}) ya da verilen metin */
    public static function descFor(Db $db, array $w, array $u, $tpl = null)
    {
        $E = self::egpCfg($db);
        $t = is_string($tpl) && trim($tpl) !== '' ? trim($tpl) : (isset($E['descTpl']) && trim($E['descTpl']) !== '' ? $E['descTpl'] : Settings::EGP_DESC);
        return yp_str(strtr($t, ['{banka}' => $w['bank'] !== '' ? $w['bank'] : 'Banka', '{iban}' => self::fmtIban(self::ibanOf($w)), '{uye}' => $u['name']]), 500);
    }

    /** Belge içeriği (kuruş). $tckn: tam numara (yoksa '') */
    public static function docData(Db $db, array $w, array $u, $no, $ettn, $t, $desc, $tckn)
    {
        $E = self::egpCfg($db);
        return [
            'v' => 1, 'no' => $no, 'ettn' => $ettn, 't' => (int)$t, 'wid' => self::ref($w['id']),
            'sellerName' => self::fullName($u) !== '' ? self::fullName($u) : $u['name'], 'userName' => $u['name'], 'tckn' => (string)$tckn,
            'tel' => $u['tel'] !== '' ? $u['tel'] : '-', 'email' => (string)$u['email'], 'addr' => 'Türkiye (Bireysel / Vergi Mükellefi Değil)',
            'bank' => $w['bank'] !== '' ? $w['bank'] : '-', 'iban' => self::fmtIban(self::ibanOf($w)),
            'amount' => (int)$w['amount'], 'fee' => (int)$w['fee'], 'brut' => (int)$w['brut'], 'stopajPct' => round((int)$w['stopaj_bp'] / 100, 2),
            'stopaj' => (int)$w['stopaj'], 'net' => (int)$w['net'], 'desc' => (string)$desc,
            'company' => (string)(isset($E['company']) ? $E['company'] : ''), 'vd' => (string)(isset($E['vd']) ? $E['vd'] : ''),
            'vkn' => (string)(isset($E['vkn']) ? $E['vkn'] : ''), 'mersis' => (string)(isset($E['mersis']) ? $E['mersis'] : ''),
            'compAddr' => (string)(isset($E['addr']) ? $E['addr'] : ''), 'provider' => (string)(isset($E['provider']) ? $E['provider'] : ''),
        ];
    }

    public static function doc(array $w)
    {
        if (empty($w['egp_doc_enc'])) {
            return null;
        }
        try {
            $d = json_decode(yp_decrypt($w['egp_doc_enc']), true);
        } catch (\Throwable $e) {
            return null;
        }
        return is_array($d) ? $d : null;
    }

    /**
     * Pusulayı keser (ödenmiş çekim, satır kilitli, işlem içinde). Önceden kesilmişse numara / ETTN / tarih / tutarlar korunur,
     * yalnız Mal / Hizmet açıklaması güncellenebilir. Tam TC yoksa 409.
     */
    public static function issue(Db $db, array $staff, array $w, array $u, $desc = null)
    {
        if ($w['status'] !== 'onaylandı') {
            throw HttpError::conflict('e-Gider Pusulası yalnız ödemesi gönderilmiş talep için kesilir.');
        }
        $tc = Kimlik::full($u);
        if ($tc === null) {
            throw new HttpError(409, Kimlik::NOTC . '. Önce tam numarayı girin veya üyeden yeniden doğrulama isteyin.', 'tc_full');
        }
        $ref = self::ref($w['id']);
        if ($w['egp_no']) {
            $d = self::doc($w);
            if ($d && is_string($desc) && trim($desc) !== '') {
                $d['desc'] = yp_str(trim($desc), 500);
                $db->update('withdrawals', ['egp_doc_enc' => yp_encrypt(json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))], 'id=?', [(int)$w['id']]);
                Audit::log($db, $staff['id'], 'egp_update', 'withdrawal', $ref, ['no' => $w['egp_no']]);
            }
            return self::row($db, $w['id']);
        }
        $E = self::egpCfg($db);
        $seri = self::seri($E);
        $t = $w['paid_at'] ? (int)$w['paid_at'] : yp_now_ms();
        $year = (int)self::tz($t, 'Y');
        $n = self::nextNo($db, 'EGP:' . $seri, $year);
        $no = $seri . $year . str_pad((string)$n, 9, '0', STR_PAD_LEFT);
        $ettn = self::uuid4();
        $d = self::docData($db, $w, $u, $no, $ettn, $t, self::descFor($db, $w, $u, $desc), $tc);
        $db->update('withdrawals', ['egp_no' => $no, 'egp_ettn' => $ettn, 'egp_at' => yp_now_ms(), 'egp_by' => (int)$staff['id'],
            'egp_doc_enc' => yp_encrypt(json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES))], 'id=?', [(int)$w['id']]);
        Audit::log($db, $staff['id'], 'egp_issue', 'withdrawal', $ref, ['no' => $no]);
        foreach (['parasut', 'bizimhesap'] as $svc) {
            if (Integrations::configured($svc, $db)) {
                Queue::enqueue($db, 'cekim', $ref, $svc);
            }
        }
        return self::row($db, $w['id']);
    }

    /** POST admin/withdrawals/{id}/egp [cekim]: bekleyen talepte "Ödemeyi Onayla & Pusula Kes", ödenmişte kes/güncelle */
    public static function issueFor(Db $db, array $staff, $id, array $in)
    {
        $w = self::row($db, $id, true);
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$w['user_id']]);
        if (!Kimlik::hasFull($u)) {
            throw new HttpError(409, Kimlik::NOTC . '. Önce tam numarayı girin veya üyeden yeniden doğrulama isteyin.', 'tc_full');
        }
        $was = $w['egp_no'];
        if ($w['status'] === 'bekliyor') {
            list($w) = self::approve($db, $staff, $w['id'], ['egp' => true] + $in);
            return [$w, false];
        }
        if ($w['status'] !== 'onaylandı') {
            throw HttpError::conflict('Reddedilen talep için belge kesilmez.');
        }
        $w = self::issue($db, $staff, $w, $u, isset($in['desc']) ? $in['desc'] : null);
        return [$w, (bool)$was];
    }

    /* ---------------- görünümler ---------------- */

    /** Üye görünümü: belge bilgisi YOK (tarih, banka, maskeli IBAN, tutar, kesinti, net, durum, red gerekçesi) */
    public static function memberView(array $w)
    {
        return ['id' => self::ref($w['id']), 'amount' => Text::tl($w['amount']), 'fee' => Text::tl($w['fee']), 'stopaj' => Text::tl($w['stopaj']),
            'net' => Text::tl($w['net']), 'bank' => $w['bank'], 'iban' => $w['iban_mask'], 'name' => $w['holder'], 'status' => $w['status'],
            'why' => $w['status'] === 'reddedildi' ? $w['why'] : '', 't' => (int)$w['created_at'], 'pt' => $w['paid_at'] ? (int)$w['paid_at'] : null];
    }

    /** Yönetim görünümü (S.wd şekli): tam IBAN, açıklama, belge no/ETTN. $u: üye satırı */
    public static function staffView(Db $db, array $w, ?array $u = null)
    {
        $u = $u ?: $db->one('SELECT * FROM {users} WHERE id=?', [(int)$w['user_id']]);
        $d = self::doc($w);
        $own = $u ? self::fullName($u) : '';
        return [
            'id' => self::ref($w['id']), 'u' => Ids::u($w['user_id']), 'amount' => Text::tl($w['amount']), 'fee' => Text::tl($w['fee']),
            'brut' => Text::tl($w['brut']), 'stopajPct' => round((int)$w['stopaj_bp'] / 100, 2), 'stopaj' => Text::tl($w['stopaj']), 'net' => Text::tl($w['net']),
            'iban' => self::fmtIban(self::ibanOf($w)), 'bank' => $w['bank'], 'name' => $w['holder'], 'status' => $w['status'], 'why' => $w['why'],
            't' => (int)$w['created_at'], 'pt' => $w['paid_at'] ? (int)$w['paid_at'] : null,
            'desc' => $d ? (string)$d['desc'] : ($u ? self::descFor($db, $w, $u) : ''),
            'egp' => $w['egp_no'] ? ['no' => $w['egp_no'], 'ettn' => $w['egp_ettn'], 't' => $d ? (int)$d['t'] : (int)$w['egp_at']] : null,
            'tcFull' => $u ? Kimlik::hasFull($u) : false, 'nameOk' => $u ? self::nameKey($w['holder']) === self::nameKey($own) : false,
            'acct' => $w['acct'] ? json_decode($w['acct'], true) : null,
        ];
    }

    /** Belge görünümü (TL). Kesilmemişse taslak (numara / ETTN yok, sıra tüketilmez). Tam TC içerir: yalnız [cekim|muhasebe] + audit */
    public static function docView(Db $db, array $w)
    {
        $d = self::doc($w);
        $draft = false;
        if (!$d) {
            $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$w['user_id']]);
            $tc = Kimlik::full($u);
            $d = self::docData($db, $w, $u, 'TASLAK (onayda numaralanır)', '—', $w['paid_at'] ?: yp_now_ms(), self::descFor($db, $w, $u), $tc ?: '');
            $draft = true;
        }
        foreach (['amount', 'fee', 'brut', 'stopaj', 'net'] as $k) {
            $d[$k] = Text::tl($d[$k]);
        }
        $d['draft'] = $draft;
        $d['bankNote'] = 'YangPazar Çekim Ödemesi Ref: ' . self::ref($w['id']) . ' - ' . $d['sellerName'];
        return $d;
    }
}
