<?php
namespace YP;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Http\HttpError;

/**
 * T.C. kimlik numarası (PLAN §1.7, P3).
 *   tc_enc   yp_encrypt(tam numara) — yalnız e-Gider Pusulası için; üyeye ve diğer ekranlara ASLA gitmez
 *   tc_hash  HMAC-SHA256(pepper, 'tc|' + no), UNIQUE: aynı numara ikinci hesapta kullanılamaz (sha256(tc+'|yangpazar') yerine)
 *   tc_mask  ilk 3 + ****** + son 2
 *   tc_state '' | 'inceleme' (NVİ'ye ulaşılamadı; numara kaydedildi, ekip elle onaylar)
 * Tam numara yalnız [cekim|muhasebe] yetkisiyle ve her gösterim audit_log'a yazılarak açılır (reveal, e-Gider belgesi).
 */
final class Kimlik
{
    const MAX_TRIES = 5;
    const LOCK_MS = 86400000;
    const NOTC = 'Üyenin tam T.C. kimlik numarası kayıtlı değil';

    public static function valid($t)
    {
        $t = (string)$t;
        if (!preg_match('/^[1-9][0-9]{10}$/', $t)) {
            return false;
        }
        $d = array_map('intval', str_split($t));
        $o = $d[0] + $d[2] + $d[4] + $d[6] + $d[8];
        $e = $d[1] + $d[3] + $d[5] + $d[7];
        if (((($o * 7 - $e) % 10) + 10) % 10 !== $d[9]) {
            return false;
        }
        return array_sum(array_slice($d, 0, 10)) % 10 === $d[10];
    }

    public static function mask($t)
    {
        return substr($t, 0, 3) . '******' . substr($t, -2);
    }

    public static function hash($t)
    {
        return hash_hmac('sha256', 'tc|' . $t, Store::pepper());
    }

    public static function clean($v)
    {
        return preg_replace('/\D/', '', is_scalar($v) ? (string)$v : '');
    }

    /** Üyenin tam numarası (çözülmüş) ya da null. Çağıran yetkiyi ve audit'i sağlar. */
    public static function full(array $u)
    {
        if (empty($u['tc_enc'])) {
            return null;
        }
        try {
            $t = yp_decrypt($u['tc_enc']);
        } catch (\Throwable $e) {
            Log::write('hata', 'TC çözülemedi u' . (int)$u['id']);
            return null;
        }
        return self::valid($t) ? $t : null;
    }

    public static function hasFull(array $u)
    {
        return !empty($u['tc_enc']);
    }

    /** Ön yüzdeki u.tc (maskeli). full: tam numara kayıtlı mı (numara değil) */
    public static function present(array $u)
    {
        $ok = (bool)(int)$u['tc_ok'];
        $st = isset($u['tc_state']) ? (string)$u['tc_state'] : '';
        if (!$ok && $st === '' && empty($u['tc_mask'])) {
            return null;
        }
        return ['ok' => $ok, 'mask' => (string)$u['tc_mask'], 'masked' => true, 'full' => self::hasFull($u), 'state' => $ok ? '' : $st,
            'yil' => $u['tc_year'] !== null ? (int)$u['tc_year'] : null, 't' => $u['tc_at'] !== null ? (int)$u['tc_at'] : null];
    }

    public static function needed(array $u, ?Db $db = null)
    {
        $tc = Settings::get('tc', $db);
        return !empty($tc['req']) && $u['role'] === 'member' && !(int)$u['tc_ok'];
    }

    private static function locked(array $u)
    {
        return $u['tc_lock_until'] !== null && (int)$u['tc_lock_until'] > yp_now_ms();
    }

    private static function lockMsg(array $u)
    {
        $t = (new \DateTime('@' . intdiv((int)$u['tc_lock_until'], 1000)))->setTimezone(new \DateTimeZone('Europe/Istanbul'))->format('d.m.Y H:i');
        return 'Çok fazla hatalı deneme yapıldı. ' . $t . ' sonrasında tekrar deneyin.';
    }

    /** Hatalı deneme: 5. denemede 24 saat kilit */
    private static function miss(Db $db, array $u)
    {
        $n = (int)$u['tc_tries'] + 1;
        if ($n >= self::MAX_TRIES) {
            $db->update('users', ['tc_tries' => 0, 'tc_lock_until' => yp_now_ms() + self::LOCK_MS], 'id=?', [(int)$u['id']]);
        } else {
            $db->update('users', ['tc_tries' => $n], 'id=?', [(int)$u['id']]);
        }
    }

    private static function takenBy(Db $db, $hash, $userId)
    {
        return $db->val('SELECT id FROM {users} WHERE tc_hash=? AND id<>?', [$hash, (int)$userId]);
    }

    /** Doğum tarihi (YYYY-MM-DD) ya da yıl → [yıl, 18 yaşında mı] */
    private static function birth($dt, $yil)
    {
        $now = new \DateTime('@' . intdiv(yp_now_ms(), 1000));
        $now->setTimezone(new \DateTimeZone('Europe/Istanbul'));
        if (is_string($dt) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dt, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
            $b = new \DateTime($dt, new \DateTimeZone('Europe/Istanbul'));
            return [(int)$m[1], $b->diff($now)->y >= 18 && $b <= $now];
        }
        $y = is_numeric($yil) ? (int)$yil : 0;
        return [$y, $y >= 1900 && $y <= (int)$now->format('Y') - 18];
    }

    /**
     * POST me/tc/verify {tc, dt|yil}. NVİ eşleşirse doğrulandı; eşleşmezse deneme sayılır; NVİ'ye ulaşılamazsa numara kaydedilir,
     * durum "inceleme" olur ve ekip elle onaylar. Dönüş: ['state'=>'ok'|'inceleme', 'msg'=>…]
     */
    public static function verify(Db $db, array $u, array $in)
    {
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
        if ((int)$u['tc_ok']) {
            throw HttpError::conflict('Kimliğiniz zaten doğrulandı.');
        }
        if ($u['tc_state'] === 'inceleme') {
            throw HttpError::conflict('Kimlik bilgileriniz ekibimizin incelemesinde. Onaylanınca bildirim alacaksınız.');
        }
        if (self::locked($u)) {
            throw new HttpError(429, self::lockMsg($u), 'tc_locked');
        }
        if (trim((string)$u['ad']) === '' || trim((string)$u['soyad']) === '') {
            throw HttpError::validation(['tc_no' => 'Önce profilinizde adınızı ve soyadınızı kimliğinizdeki gibi girin.']);
        }
        $tc = self::clean(isset($in['tc']) ? $in['tc'] : '');
        if (!self::valid($tc)) {
            throw HttpError::validation(['tc_no' => 'TC kimlik numarası geçersiz. 11 haneyi kontrol edin.']);
        }
        list($yil, $adult) = self::birth(isset($in['dt']) ? $in['dt'] : null, isset($in['yil']) ? $in['yil'] : null);
        if (!$yil) {
            throw HttpError::validation(['tc_dt' => 'Doğum tarihinizi seçin.']);
        }
        if (!$adult) {
            throw HttpError::validation(['tc_dt' => 'Para çekmek için 18 yaşını doldurmuş olmalısınız.']);
        }
        $h = self::hash($tc);
        if (self::takenBy($db, $h, $u['id'])) {
            throw HttpError::validation(['tc_no' => 'Bu TC kimlik numarası başka bir hesapta kullanılıyor.']);
        }
        RateLimit::enforce('tcv:' . (int)$u['id'], 10, 3600, true, 'Çok fazla doğrulama denemesi yaptınız. Lütfen bir saat sonra tekrar deneyin.');
        $res = Nvi::check($tc, $u['ad'], $u['soyad'], $yil);
        if ($res === 'fail') {
            self::miss($db, $u);
            Audit::log($db, $u['id'], 'tc_verify_fail', 'user', Ids::u($u['id']), ['mask' => self::mask($tc)]);
            throw HttpError::validation(['tc_no' => 'Bilgiler nüfus kayıtlarıyla eşleşmedi. Doğum tarihinizi ve profilinizdeki ad soyadı kimliğinizdeki gibi kontrol edin.'],
                'Bilgiler nüfus kayıtlarıyla eşleşmedi.');
        }
        $now = yp_now_ms();
        $ok = $res === 'ok';
        $set = ['tc_enc' => yp_encrypt($tc), 'tc_hash' => $h, 'tc_mask' => self::mask($tc), 'tc_year' => $yil, 'tc_at' => $now,
            'tc_tries' => 0, 'tc_lock_until' => null, 'tc_ask_at' => null, 'tc_by' => null,
            'tc_ok' => $ok ? 1 : 0, 'tc_state' => $ok ? '' : 'inceleme', 'tc_src' => $ok ? 'nvi' : 'manual'];
        try {
            $db->update('users', $set, 'id=?', [(int)$u['id']]);
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw HttpError::validation(['tc_no' => 'Bu TC kimlik numarası başka bir hesapta kullanılıyor.']);
            }
            throw $e;
        }
        Audit::log($db, $u['id'], $ok ? 'tc_verify' : 'tc_verify_pending', 'user', Ids::u($u['id']), ['mask' => self::mask($tc), 'nvi' => $res]);
        if ($ok) {
            Notify::send($db, $u['id'], 'Kimliğiniz doğrulandı. Artık para çekebilirsiniz.', '#hesabim', 'tc_ok');
            return ['state' => 'ok', 'msg' => 'Kimliğiniz doğrulandı. Artık para çekebilirsiniz.'];
        }
        foreach ($db->all("SELECT id, perms, role FROM {users} WHERE role IN ('admin','staff') AND status='active'") as $s) {
            if (Perm::has($s, 'cekim') || Perm::has($s, 'uye')) {
                Notify::send($db, $s['id'], $u['name'] . ' kimlik doğrulaması elle inceleme bekliyor (NVİ servisine ulaşılamadı).', '#yonetim/uye/uyeler?f=tcyok');
            }
        }
        return ['state' => 'inceleme', 'msg' => 'Nüfus (NVİ) servisine şu an ulaşılamıyor. Bilgileriniz kaydedildi; ekibimiz kimliğinizi elle kontrol edip onaylayacak. Onaylanınca bildirim alacaksınız.'];
    }

    /** Numara üyenin kayıtlı maskesi/özetiyle eşleşiyor mu ve başka hesapta mı? Hata metni ya da hash */
    private static function checkAgainst(Db $db, array $u, $tc)
    {
        if (!self::valid($tc)) {
            return [null, 'T.C. kimlik numarası geçersiz. 11 haneyi kontrol edin.'];
        }
        $m = (string)$u['tc_mask'];
        if ($m !== '' && (substr($tc, 0, 3) !== substr($m, 0, 3) || substr($tc, -2) !== substr($m, -2))) {
            return [null, 'Numara üyenin doğrulanmış kimliğiyle eşleşmiyor.'];
        }
        $h = self::hash($tc);
        if (!empty($u['tc_hash']) && !hash_equals((string)$u['tc_hash'], $h)) {
            return [null, 'Numara üyenin doğrulanmış kimliğiyle eşleşmiyor.'];
        }
        if (self::takenBy($db, $h, $u['id'])) {
            return [null, 'Bu T.C. kimlik numarası başka bir hesapta kayıtlı.'];
        }
        return [$h, null];
    }

    private static function saveFull(Db $db, array $u, $tc, $h, $byId)
    {
        $set = ['tc_enc' => yp_encrypt($tc), 'tc_hash' => $h, 'tc_mask' => self::mask($tc), 'tc_tries' => 0, 'tc_ask_at' => null];
        if ($byId) {
            $set['tc_by'] = (int)$byId;
        }
        if ($u['tc_at'] === null) {
            $set['tc_at'] = yp_now_ms();
        }
        try {
            $db->update('users', $set, 'id=?', [(int)$u['id']]);
        } catch (\PDOException $e) {
            if ($db->isDuplicate($e)) {
                throw HttpError::validation(['tc' => 'Bu T.C. kimlik numarası başka bir hesapta kayıtlı.']);
            }
            throw $e;
        }
    }

    /** POST me/tc/confirm {tc}: doğrulanmış ama tam numarası kayıtlı olmayan üye (eski kayıtlar) numarasını bir kez onaylar */
    public static function confirm(Db $db, array $u, $raw)
    {
        $u = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
        if (!(int)$u['tc_ok']) {
            throw HttpError::conflict('Önce kimliğinizi doğrulayın.');
        }
        if (self::hasFull($u)) {
            throw HttpError::conflict('T.C. kimlik numaranız zaten onaylı.');
        }
        if (self::locked($u)) {
            throw new HttpError(429, self::lockMsg($u), 'tc_locked');
        }
        $tc = self::clean($raw);
        list($h, $err) = self::checkAgainst($db, $u, $tc);
        if ($err) {
            if (strlen($tc) === 11) {
                self::miss($db, $u);
            }
            throw HttpError::validation(['tcc_no' => $err], $err);
        }
        self::saveFull($db, $u, $tc, $h, null);
        Audit::log($db, $u['id'], 'tc_confirm', 'user', Ids::u($u['id']), ['mask' => self::mask($tc)]);
        return 'T.C. kimlik numaranız onaylandı. Para çekme formuna devam edebilirsiniz.';
    }

    /** POST admin/users/{id}/tc-full {tc} [cekim|muhasebe]: çalışan üyenin tam numarasını girer (maske/özet ile doğrulanır) */
    public static function setFull(Db $db, array $staff, array $u, $raw)
    {
        $tc = self::clean($raw);
        list($h, $err) = self::checkAgainst($db, $u, $tc);
        if ($err) {
            throw HttpError::validation(['tc' => $err], $err);
        }
        self::saveFull($db, $u, $tc, $h, $staff['id']);
        Audit::log($db, $staff['id'], 'tc_set_full', 'user', Ids::u($u['id']), ['mask' => self::mask($tc)]);
        return (trim($u['ad'] . ' ' . $u['soyad']) ?: $u['name']) . ' için tam T.C. kimlik no kaydedildi.';
    }

    /** GET admin/users/{id}/tc-full [cekim|muhasebe]: tam numarayı gösterir; her gösterim audit */
    public static function reveal(Db $db, array $staff, array $u, $why = '')
    {
        $t = self::full($u);
        Audit::log($db, $staff['id'], 'tc_reveal', 'user', Ids::u($u['id']), ['why' => yp_str($why, 60), 'found' => $t !== null]);
        return $t;
    }

    /** POST admin/users/{id}/tc-reset [uye] */
    public static function reset(Db $db, array $staff, array $u)
    {
        $db->update('users', ['tc_ok' => 0, 'tc_enc' => null, 'tc_hash' => null, 'tc_mask' => null, 'tc_year' => null, 'tc_by' => null, 'tc_at' => null,
            'tc_tries' => 0, 'tc_lock_until' => null, 'tc_ask_at' => null, 'tc_state' => '', 'tc_src' => ''], 'id=?', [(int)$u['id']]);
        Audit::log($db, $staff['id'], 'tc_reset', 'user', Ids::u($u['id']), ['mask' => (string)$u['tc_mask']]);
        Notify::send($db, $u['id'], 'Kimlik doğrulamanız yönetim tarafından sıfırlandı. Para çekmek için tekrar doğrulayın.', '#hesabim');
    }

    /** POST admin/users/{id}/tc-ask [cekim|muhasebe] */
    public static function ask(Db $db, array $staff, array $u)
    {
        $db->update('users', ['tc_ask_at' => yp_now_ms()], 'id=?', [(int)$u['id']]);
        Audit::log($db, $staff['id'], 'tc_ask', 'user', Ids::u($u['id']));
        Notify::send($db, $u['id'], (int)$u['tc_ok']
            ? 'Çekim ödemelerinizin yapılabilmesi için T.C. kimlik numaranızı onaylamanız gerekiyor. Hesabım › Para Çek sayfasından numaranızı onaylayın.'
            : 'Çekim ödemelerinizin yapılabilmesi için kimliğinizi doğrulamanız gerekiyor. Hesabım › Para Çek sayfasından kimliğinizi doğrulayın.', '#hesabim', 'tc_ask');
    }

    /** POST admin/users/{id}/tc-approve [cekim|uye]: NVİ'ye ulaşılamadığında kaydedilen kimliği ekip elle onaylar */
    public static function approveManual(Db $db, array $staff, array $u)
    {
        if ((int)$u['tc_ok']) {
            throw HttpError::conflict('Bu üyenin kimliği zaten doğrulanmış.');
        }
        if ($u['tc_state'] !== 'inceleme' || empty($u['tc_enc'])) {
            throw HttpError::conflict('Elle onay bekleyen bir kimlik kaydı yok.');
        }
        $db->update('users', ['tc_ok' => 1, 'tc_state' => '', 'tc_src' => 'manual', 'tc_by' => (int)$staff['id'], 'tc_at' => yp_now_ms()], 'id=?', [(int)$u['id']]);
        Audit::log($db, $staff['id'], 'tc_approve_manual', 'user', Ids::u($u['id']), ['mask' => (string)$u['tc_mask']]);
        Notify::send($db, $u['id'], 'Kimliğiniz doğrulandı. Artık para çekebilirsiniz.', '#hesabim', 'tc_ok');
    }
}
