<?php
namespace YP\Money;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;
use YP\Log;
use YP\Notify;
use YP\Text;

/**
 * Bakiye yükleme (PLAN §1.4 Deposits): PayTR (kart, Havale/EFT) ve elle onaylanan havale/kripto.
 *   - wdOK: yöntemin cat'i 'eft' ise tutar çekilebilir (cash), değilse yalnız alışveriş (credit). Kupon bonusu her zaman credit.
 *   - Kupon üye başına bir kez: bekleyen yüklemede ayrılır (coupon_uses reserved), yalnız yükleme başarılı olunca kullanılmış sayılır;
 *     başarısız/süresi dolan/reddedilen yüklemede serbest kalır.
 *   - PayTR bildirimi: tek geçiş bekliyor → onaylandı (satır kilidiyle), tutar beklenenle aynı olmalı; tekrar bildirimler hiçbir şeyi değiştirmez.
 */
final class Deposits
{
    const PAYTR_GWS = ['paytr', 'paytr_eft'];
    const EXPIRE_MS = 259200000; // 3 gün
    const MAX_PENDING_MANUAL = 5;

    public static function gw(Db $db, $id)
    {
        $g = is_string($id) ? $db->one('SELECT * FROM {gateways} WHERE id=?', [$id]) : null;
        if (!$g) {
            throw HttpError::validation(['gw' => 'Ödeme yöntemi bulunamadı.']);
        }
        return $g;
    }

    public static function lock(Db $db, $id)
    {
        $d = $db->one('SELECT * FROM {deposits} WHERE id=?' . $db->forUpdate(), [(int)$id]);
        if (!$d) {
            throw HttpError::notFound('Yükleme kaydı bulunamadı.');
        }
        return $d;
    }

    /** Tutar (TL girdisi) → kuruş, site sınırlarıyla */
    public static function amount(Db $db, $raw)
    {
        $s = Rules::site($db);
        $k = Text::kurus($raw);
        $min = Rules::k($s['minDeposit']);
        $max = Rules::k($s['maxDeposit']);
        if ($k === null || $k < $min) {
            throw HttpError::validation(['amount' => 'En az ' . Rules::tl($min) . ' yükleyebilirsiniz.']);
        }
        if ($k > $max) {
            throw HttpError::validation(['amount' => 'Tek seferde en fazla ' . Rules::tl($max) . ' yükleyebilirsiniz.']);
        }
        return $k;
    }

    /* ---------------- kuponlar ---------------- */

    /** Kupon + bonus (kuruş). Geçersiz/kullanılmışsa 422. $code boşsa [null, 0] */
    public static function coupon(Db $db, $code, $userId, $amount)
    {
        $code = strtoupper(trim(is_scalar($code) ? (string)$code : ''));
        if ($code === '') {
            return [null, 0];
        }
        $c = $db->one('SELECT * FROM {coupons} WHERE code=? AND is_on=1 AND deleted_at IS NULL', [yp_str($code, 40)]);
        if (!$c) {
            throw HttpError::validation(['coupon' => 'Kupon kodu geçersiz.']);
        }
        $use = $db->one('SELECT status FROM {coupon_uses} WHERE coupon_id=? AND user_id=?', [(int)$c['id'], (int)$userId]);
        if ($use) {
            throw HttpError::validation(['coupon' => $use['status'] === 'used' ? 'Bu kuponu daha önce kullandınız.' : 'Bu kupon bekleyen bir yüklemenizde kullanılıyor.']);
        }
        return [$c, Rules::couponBonus($amount, (int)$c['pct_bp'], (int)$c['max'])];
    }

    private static function reserve(Db $db, $c, $userId, $depId)
    {
        if (!$c) {
            return;
        }
        try {
            $db->insert('coupon_uses', ['coupon_id' => (int)$c['id'], 'user_id' => (int)$userId, 'deposit_id' => (int)$depId, 'status' => 'reserved', 't' => yp_now_ms()]);
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw HttpError::validation(['coupon' => 'Bu kuponu daha önce kullandınız.']);
            }
            throw $e;
        }
    }

    public static function release(Db $db, array $d)
    {
        if ($d['coupon_id']) {
            $db->exec("DELETE FROM {coupon_uses} WHERE coupon_id=? AND user_id=? AND deposit_id=? AND status='reserved'", [(int)$d['coupon_id'], (int)$d['user_id'], (int)$d['id']]);
        }
    }

    /* ---------------- bakiyeye geçirme ---------------- */

    /** Kilitli bekleyen yüklemeyi bakiyeye geçirir (yukleme + kupon bonusu). */
    private static function credit(Db $db, array $d, $actorId, array $extra = [])
    {
        $g = $db->one('SELECT * FROM {gateways} WHERE id=?', [$d['gw']]) ?: ['n' => $d['gw'], 'cat' => $d['cat']];
        $w = (bool)(int)$d['withdrawable'];
        $uid = (int)$d['user_id'];
        $amount = (int)$d['amount'];
        $fee = (int)$d['fee'];
        $bonus = (int)$d['bonus'];
        $ref = View::depositId($d['id']);
        $m = $g['n'];
        if ($d['bank'] !== '') {
            $m .= ($d['gw'] === 'havale' ? ' → ' : ' · ') . $d['bank'];
        }
        if ($d['net_label'] !== '') {
            $m .= ' · ' . $d['net_label'];
        }
        if ($d['tx_at'] !== null) {
            $m .= ' · işlem ' . gmdate('d.m.Y H:i', (int)floor($d['tx_at'] / 1000) + 3 * 3600);
        }
        if ($d['note'] !== '') {
            $m .= ' · ' . $d['note'];
        }
        Ledger::lockWallets($db, [$uid]);
        $jid = Ledger::post($db, 'yukleme', ['ref_type' => 'deposit', 'ref_id' => $ref, 'user' => $uid, 'amount' => $amount, 'actor' => $actorId,
            'meta' => ['m' => $m, 'cat' => $d['cat'], 'w' => $w, 'ref' => $ref, 'fee' => $fee] + $extra], [
            ['GW:' . $d['gw'], -($amount + $fee)],
            [$w ? Ledger::cash($uid) : Ledger::credit($uid), $amount, 'Bakiye yükleme (' . $g['n'] . ')' . ($w ? ' · çekilebilir' : ' · sadece alışveriş')],
            ['REV:hizmet', $fee],
        ]);
        $code = '';
        if ($bonus > 0) {
            $code = $d['coupon_id'] ? (string)$db->val('SELECT code FROM {coupons} WHERE id=?', [(int)$d['coupon_id']]) : '';
            Ledger::post($db, 'bonus', ['ref_type' => 'deposit', 'ref_id' => $ref, 'user' => $uid, 'amount' => $bonus, 'actor' => $actorId,
                'meta' => ['m' => 'Kupon ' . $code, 'src' => 'kupon']], [
                ['EXP:bonus', -$bonus],
                [Ledger::credit($uid), $bonus, 'Kupon bonusu (' . $code . ') · sadece alışveriş'],
            ]);
        }
        if ($d['coupon_id']) {
            $n = $db->exec("UPDATE {coupon_uses} SET status='used', t=? WHERE coupon_id=? AND user_id=? AND deposit_id=?", [yp_now_ms(), (int)$d['coupon_id'], $uid, (int)$d['id']]);
            if ($n === 1) {
                $db->exec('UPDATE {coupons} SET uses=uses+1 WHERE id=?', [(int)$d['coupon_id']]);
            }
        }
        $db->update('deposits', ['status' => 'onaylandı', 'decided_at' => yp_now_ms(), 'decided_by' => $actorId ? (int)$actorId : null, 'journal_id' => $jid], 'id=?', [(int)$d['id']]);
        Notify::send($db, $uid, 'Bakiyenize ' . Rules::tl($amount + $bonus) . ' yüklendi.' . ($w ? '' : ' Bu tutar alışverişte kullanılır, çekilemez.'), '#hesabim', 'deposit_ok',
            ['tutar' => Rules::tl($amount + $bonus)]);
        return $jid;
    }

    /* ---------------- PayTR ---------------- */

    public static function paytrReady(Db $db, $gwId)
    {
        if (!in_array($gwId, self::PAYTR_GWS, true)) {
            return false;
        }
        $g = $db->one('SELECT * FROM {gateways} WHERE id=?', [$gwId]);
        return $g && (int)$g['is_on'] && Paytr::configured();
    }

    /**
     * Bekleyen PayTR yüklemesi açar (işlem içinde). Token ayrı adımda alınır (HTTP isteği işlem dışında).
     * $in: gw, amount, coupon, bank
     */
    public static function paytrCreate(Db $db, array $u, array $in)
    {
        $gwId = isset($in['gw']) && is_string($in['gw']) ? $in['gw'] : 'paytr';
        if (!in_array($gwId, self::PAYTR_GWS, true)) {
            throw HttpError::validation(['gw' => 'Ödeme yöntemi bulunamadı.']);
        }
        if (!self::paytrReady($db, $gwId)) {
            throw new HttpError(400, $gwId === 'paytr_eft' ? 'PayTR Havale/EFT ile yükleme yakında. Şimdilik havale ile yükleme yapabilirsiniz.'
                : 'Kart ile ödeme yakında. Şimdilik havale/EFT ile yükleme yapabilirsiniz.', 'paytr_off');
        }
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız yasaklı, işlem yapamazsınız.');
        }
        if ((string)$u['email'] === '') {
            throw HttpError::validation(['email' => 'Kartla ödeme için profilinize e-posta adresinizi ekleyin.']);
        }
        if ($gwId === 'paytr' && !preg_match('/^\+?[0-9]{10,15}$/', preg_replace('/[^0-9+]/', '', (string)$u['tel']))) {
            throw HttpError::validation(['tel' => 'Kartla ödeme için profilinize cep telefonunuzu ekleyin.']);
        }
        $g = self::gw($db, $gwId);
        $amount = self::amount($db, isset($in['amount']) ? $in['amount'] : null);
        $fee = Rules::gwFee($amount, (int)$g['fee_bp']);
        list($c, $bonus) = self::coupon($db, isset($in['coupon']) ? $in['coupon'] : '', $u['id'], $amount);
        $bank = isset($in['bank']) && is_scalar($in['bank']) ? yp_str((string)$in['bank'], 40) : '';
        $oid = yp_paytr_new_oid('YP');
        $id = $db->insert('deposits', [
            'user_id' => (int)$u['id'], 'gw' => $gwId, 'cat' => $g['cat'], 'amount' => $amount, 'fee' => $fee, 'bonus' => $bonus,
            'coupon_id' => $c ? (int)$c['id'] : null, 'withdrawable' => Rules::withdrawable($g['cat']) ? 1 : 0, 'status' => 'bekliyor',
            'merchant_oid' => $oid, 'expected' => $amount + $fee, 'test_mode' => Paytr::testMode(), 'bank' => $bank, 'created_at' => yp_now_ms(),
        ]);
        self::reserve($db, $c, $u['id'], $id);
        return $db->one('SELECT * FROM {deposits} WHERE id=?', [$id]);
    }

    /** PayTR ödeme ekranı anahtarını alır (işlem dışında). Başarısızsa yükleme 'basarisiz' olur ve kupon serbest kalır. */
    public static function paytrToken(Db $db, array $d, array $u, $ip, $baseUrl)
    {
        $tip = $d['gw'] === 'paytr_eft' ? 'eft' : 'kart';
        $ad = trim($u['ad'] . ' ' . $u['soyad']);
        $res = Paytr::token([
            'tip' => $tip, 'oid' => $d['merchant_oid'], 'ip' => $ip, 'email' => (string)$u['email'], 'kurus' => (int)$d['expected'],
            'ad' => $ad !== '' ? $ad : $u['name'], 'adres' => 'Türkiye', 'tel' => preg_replace('/[^0-9+]/', '', (string)$u['tel']),
            'sepet' => [['YangPazar bakiye yükleme', number_format((int)$d['expected'] / 100, 2, '.', ''), 1]],
            'ok_url' => $baseUrl . '?odeme=basarili&oid=' . rawurlencode($d['merchant_oid']), 'fail_url' => $baseUrl . '?odeme=hatali&oid=' . rawurlencode($d['merchant_oid']),
        ]);
        if (empty($res['ok'])) {
            $db->tx(function (Db $db) use ($d, $res) {
                $x = self::lock($db, $d['id']);
                if ($x['status'] === 'bekliyor') {
                    $db->update('deposits', ['status' => 'basarisiz', 'reason' => yp_str('Ödeme başlatılamadı: ' . $res['msg'], 255), 'decided_at' => yp_now_ms()], 'id=?', [(int)$x['id']]);
                    self::release($db, $x);
                }
            });
            Log::write('paytr', 'Token alınamadı', ['merchant_oid' => $d['merchant_oid'], 'mesaj' => $res['msg']]);
            throw new HttpError(502, 'Ödeme başlatılamadı. ' . $res['msg'], 'paytr_error');
        }
        return ['token' => $res['token'], 'iframe' => Paytr::iframeUrl($tip, $res['token']), 'tip' => $tip];
    }

    /**
     * PayTR bildirimi (hash api/paytr_bildirim.php'de doğrulandı). $f: merchant_oid, status, total_amount, payment_amount?, test_mode,
     * failed_reason_msg… Dönüş: 'OK' ya da null (bu siparişi tanımıyoruz → eski dosya kaydına bırak)
     */
    public static function paytrCallback(Db $db, array $f)
    {
        $oid = (string)$f['merchant_oid'];
        return $db->tx(function (Db $db) use ($f, $oid) {
            $d = $db->one('SELECT * FROM {deposits} WHERE merchant_oid=?' . $db->forUpdate(), [$oid]);
            if (!$d) {
                return null;
            }
            $db->exec('UPDATE {deposits} SET callbacks=callbacks+1 WHERE id=?', [(int)$d['id']]);
            $late = $d['status'] === 'suresi_doldu';
            if ($d['status'] !== 'bekliyor' && !($late && $f['status'] === 'success')) {
                Log::write('paytr', 'Tekrarlanan bildirim (işlenmedi)', ['merchant_oid' => $oid, 'status' => $f['status'], 'durum' => $d['status']]);
                return 'OK';
            }
            $total = (int)$f['total_amount'];
            $pay = isset($f['payment_amount']) && $f['payment_amount'] !== null && $f['payment_amount'] !== '' ? (int)$f['payment_amount'] : $total;
            $tm = (int)(isset($f['test_mode']) ? $f['test_mode'] : 0);
            $set = ['paytr_total' => $total, 'paytr_payment' => $pay];
            $fail = function ($why, $alert) use ($db, $d, $set, $oid) {
                $db->update('deposits', $set + ['status' => 'basarisiz', 'reason' => yp_str($why, 255), 'decided_at' => yp_now_ms()], 'id=?', [(int)$d['id']]);
                self::release($db, $d);
                if ($alert) {
                    Log::write('paytr', 'Bildirim bakiyeye geçirilmedi: ' . $why, ['merchant_oid' => $oid]);
                    Audit::log($db, null, 'paytr_reject', 'deposit', View::depositId($d['id']), ['why' => $why, 'oid' => $oid]);
                    Jobs::alertAdmins($db, 'PayTR bildirimi bakiyeye geçirilmedi (#' . View::depositId($d['id']) . '): ' . $why);
                }
                return 'OK';
            };
            if ($f['status'] !== 'success') {
                $why = 'PayTR: ' . trim(yp_str(isset($f['failed_reason_msg']) ? $f['failed_reason_msg'] : '', 200));
                return $fail($why === 'PayTR:' ? 'Ödeme başarısız' : $why, false);
            }
            if ($pay !== (int)$d['expected']) {
                return $fail('Tutar uyuşmazlığı: beklenen ' . (int)$d['expected'] . ', gelen ' . $pay . ' kuruş', true);
            }
            if ($tm === 1 && !(int)$d['test_mode']) {
                return $fail('Test ödemesi canlı modda bakiyeye geçirilmez', true);
            }
            $db->update('deposits', $set, 'id=?', [(int)$d['id']]);
            if ($late) {
                // süresi dolmuş kayda geç gelen başarılı ödeme: tutar yine yüklenir; serbest kalan kupon bonusu verilmez
                $db->update('deposits', ['bonus' => 0, 'coupon_id' => null], 'id=?', [(int)$d['id']]);
                $d['bonus'] = 0;
                $d['coupon_id'] = null;
            }
            self::credit($db, $d, null, ['paytr' => ['total' => $total, 'test' => $tm, 'type' => yp_str(isset($f['payment_type']) ? $f['payment_type'] : '', 10)]]);
            Log::write('paytr', 'Bildirim işlendi, bakiye yüklendi', ['merchant_oid' => $oid, 'deposit' => View::depositId($d['id'])]);
            return 'OK';
        });
    }

    /* ---------------- elle onaylanan havale / kripto ---------------- */

    /** Dekont/işlem zamanı: ms sayı ya da "YYYY-MM-DDTHH:MM" (Türkiye saati) */
    public static function parseTxAt($v)
    {
        if (is_int($v) || (is_string($v) && ctype_digit($v))) {
            return (int)$v;
        }
        if (is_string($v) && preg_match('/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/', $v, $m)) {
            $ts = gmmktime((int)$m[4], (int)$m[5], 0, (int)$m[2], (int)$m[3], (int)$m[1]);
            return $ts === false ? null : ($ts - 3 * 3600) * 1000;
        }
        return null;
    }

    /** $in: gw (havale|kripto), amount, coupon, txAt, toBank, note, net (cn5), txid, receipt (m12) */
    public static function manualCreate(Db $db, array $u, array $in)
    {
        if ($u['status'] !== 'active') {
            throw HttpError::forbidden('Hesabınız yasaklı, işlem yapamazsınız.');
        }
        $g = self::gw($db, isset($in['gw']) && is_string($in['gw']) ? $in['gw'] : '');
        if (!(int)$g['manual'] || !(int)$g['is_on']) {
            throw HttpError::validation(['gw' => 'Bu yöntemle bildirim yapılamaz.']);
        }
        $amount = self::amount($db, isset($in['amount']) ? $in['amount'] : null);
        $now = yp_now_ms();
        $txAt = self::parseTxAt(isset($in['txAt']) ? $in['txAt'] : null);
        if (!$txAt) {
            throw HttpError::validation(['txAt' => 'Dekonttaki işlem tarihini ve saatini girin.']);
        }
        if ($txAt > $now + 300000) {
            throw HttpError::validation(['txAt' => 'İşlem tarihi ileri bir tarih olamaz.']);
        }
        if ($txAt < $now - 30 * Rules::D) {
            throw HttpError::validation(['txAt' => '30 günden eski ödemeler için canlı destekle görüşün.']);
        }
        $note = isset($in['note']) && is_scalar($in['note']) ? yp_str(trim((string)$in['note']), 255) : '';
        $row = ['bank' => '', 'crypto_net_id' => null, 'net_label' => '', 'addr' => '', 'txid' => ''];
        if ($g['id'] === 'kripto' || $g['cat'] === 'cuzdan' && !empty($in['net'])) {
            $nid = View::parse(isset($in['net']) ? $in['net'] : '', 'cn', 'Kripto ağı');
            $n = $db->one('SELECT * FROM {crypto_nets} WHERE id=? AND is_on=1', [$nid]);
            if (!$n) {
                throw HttpError::validation(['net' => 'Bir kripto ağı seçin.']);
            }
            $txid = isset($in['txid']) && is_scalar($in['txid']) && trim((string)$in['txid']) !== '' ? trim((string)$in['txid']) : $note;
            if (strlen($txid) < 8) {
                throw HttpError::validation(['txid' => 'İşlem kodunu (TxID) eksiksiz girin.']);
            }
            $row = ['bank' => '', 'crypto_net_id' => (int)$n['id'], 'net_label' => yp_str($n['coin'] . ' · ' . $n['net'], 90), 'addr' => $n['addr'], 'txid' => yp_str($txid, 160)];
        } else {
            $to = isset($in['toBank']) && is_scalar($in['toBank']) ? trim((string)$in['toBank']) : '';
            $banks = array_column($db->all('SELECT b FROM {banks}'), 'b');
            if ($banks && !in_array($to, $banks, true)) {
                throw HttpError::validation(['toBank' => 'Gönderdiğiniz hesabımızı seçin.']);
            }
            $row['bank'] = yp_str($to, 60);
        }
        $receipt = null;
        if (!empty($in['receipt'])) {
            $mid = View::parse(is_array($in['receipt']) && isset($in['receipt']['id']) ? $in['receipt']['id'] : $in['receipt'], 'm', 'Dekont');
            $m = $db->one('SELECT * FROM {media} WHERE id=?', [$mid]);
            if (!$m || (int)$m['owner_id'] !== (int)$u['id'] || $m['kind'] !== 'receipt' || $m['ref_type'] !== '') {
                throw HttpError::validation(['receipt' => 'Dekont dosyası bulunamadı.']);
            }
            $receipt = $m;
        }
        if ((int)$db->val("SELECT COUNT(*) FROM {deposits} WHERE user_id=? AND status='bekliyor' AND gw IN (SELECT id FROM {gateways} WHERE manual=1)", [(int)$u['id']]) >= self::MAX_PENDING_MANUAL) {
            throw new HttpError(409, 'Onay bekleyen ' . self::MAX_PENDING_MANUAL . ' bildiriminiz var. Onaylandıktan sonra yeni bildirim yapabilirsiniz.', 'too_many');
        }
        list($c, $bonus) = self::coupon($db, isset($in['coupon']) ? $in['coupon'] : '', $u['id'], $amount);
        $id = $db->insert('deposits', $row + [
            'user_id' => (int)$u['id'], 'gw' => $g['id'], 'cat' => $g['cat'], 'amount' => $amount, 'fee' => 0, 'bonus' => $bonus,
            'coupon_id' => $c ? (int)$c['id'] : null, 'withdrawable' => Rules::withdrawable($g['cat']) ? 1 : 0, 'status' => 'bekliyor',
            'expected' => $amount, 'tx_at' => $txAt, 'note' => $note, 'receipt_media_id' => $receipt ? (int)$receipt['id'] : null, 'created_at' => $now,
        ]);
        if ($receipt) {
            $db->update('media', ['ref_type' => 'deposit', 'ref_id' => $id], 'id=?', [(int)$receipt['id']]);
        }
        self::reserve($db, $c, $u['id'], $id);
        return $db->one('SELECT * FROM {deposits} WHERE id=?', [$id]);
    }

    public static function approve(Db $db, array $staff, $id)
    {
        $d = self::lock($db, $id);
        if ($d['status'] !== 'bekliyor') {
            throw HttpError::conflict('Bu bildirim zaten sonuçlandırılmış.');
        }
        if (in_array($d['gw'], self::PAYTR_GWS, true)) {
            throw HttpError::conflict('PayTR ödemeleri yalnız PayTR bildirimiyle onaylanır.');
        }
        self::credit($db, $d, $staff['id'], ['by' => $staff['name']]);
        Audit::log($db, $staff['id'], 'deposit_approve', 'deposit', View::depositId($d['id']), ['u' => (int)$d['user_id'], 'amount' => (int)$d['amount'], 'bonus' => (int)$d['bonus'], 'gw' => $d['gw']]);
        return self::row($db, $d['id']);
    }

    public static function reject(Db $db, array $staff, $id, $reason)
    {
        $d = self::lock($db, $id);
        if ($d['status'] !== 'bekliyor') {
            throw HttpError::conflict('Bu bildirim zaten sonuçlandırılmış.');
        }
        if (in_array($d['gw'], self::PAYTR_GWS, true)) {
            throw HttpError::conflict('PayTR ödemeleri yalnız PayTR bildirimiyle sonuçlanır.');
        }
        $db->update('deposits', ['status' => 'reddedildi', 'reason' => yp_str((string)$reason, 255), 'decided_at' => yp_now_ms(), 'decided_by' => (int)$staff['id']], 'id=?', [(int)$d['id']]);
        self::release($db, $d);
        Notify::send($db, $d['user_id'], 'Bakiye yükleme bildiriminiz onaylanmadı. Canlı destekle görüşün.', '#hesabim', 'deposit_no', ['tutar' => Rules::tl($d['amount'])]);
        Audit::log($db, $staff['id'], 'deposit_reject', 'deposit', View::depositId($d['id']), ['u' => (int)$d['user_id'], 'amount' => (int)$d['amount'], 'reason' => (string)$reason]);
        return self::row($db, $d['id']);
    }

    public static function row(Db $db, $id)
    {
        return $db->one('SELECT * FROM {deposits} WHERE id=?', [(int)$id]);
    }

    /** Cron: 3 günden eski bekleyen PayTR yüklemeleri → suresi_doldu, kupon serbest */
    public static function expire(Db $db, $limit = 200)
    {
        $ids = $db->all("SELECT id FROM {deposits} WHERE status='bekliyor' AND gw IN ('paytr','paytr_eft') AND created_at<? ORDER BY id LIMIT " . (int)$limit,
            [yp_now_ms() - self::EXPIRE_MS]);
        $n = 0;
        foreach ($ids as $r) {
            $db->tx(function (Db $db) use ($r, &$n) {
                $d = self::lock($db, $r['id']);
                if ($d['status'] !== 'bekliyor') {
                    return;
                }
                $db->update('deposits', ['status' => 'suresi_doldu', 'decided_at' => yp_now_ms(), 'reason' => 'PayTR bildirimi 3 gün içinde gelmedi'], 'id=?', [(int)$d['id']]);
                self::release($db, $d);
                $n++;
            });
        }
        return $n;
    }

    /** Parametre: 'd5' ya da PayTR merchant_oid */
    public static function find(Db $db, $ref)
    {
        $s = is_scalar($ref) ? (string)$ref : '';
        if (preg_match('/^d([1-9][0-9]{0,17})$/', $s, $m)) {
            return self::row($db, (int)$m[1]);
        }
        if (preg_match('/^[A-Za-z0-9]{1,64}$/', $s)) {
            return $db->one('SELECT * FROM {deposits} WHERE merchant_oid=?', [$s]);
        }
        return null;
    }

    public static function ids($v)
    {
        return View::parse($v, 'd', 'Yükleme kaydı');
    }

    public static function uid($v)
    {
        return Ids::u($v);
    }
}
