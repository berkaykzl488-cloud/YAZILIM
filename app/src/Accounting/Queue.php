<?php
namespace YP\Accounting;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Integrations;
use YP\Kimlik;
use YP\Log;
use YP\Money\Jobs;
use YP\Money\Withdraw;
use YP\Text;

/**
 * accounting_jobs kuyruğu (PLAN §1.6): çekim onayında kesilen e-Gider Pusulası için Paraşüt / Bizim Hesap kaydı.
 * Eski api/cekim_onayla.php mantığı: aynı çekim için başarılı kayıt YENİDEN oluşturulmaz (kind+ref+service benzersiz).
 * Hata olursa artan bekleme: 1, 2, 4, 8 … dk (en çok 6 saat); 8 denemeden sonra "hata" olur ve yöneticilere bildirilir.
 * Yönetim › Muhasebe'den "Yeniden dene" ile kuyruğa geri alınır.
 */
final class Queue
{
    const MAX_TRIES = 8;
    const BASE_MS = 60000;
    const MAX_WAIT_MS = 21600000;

    public static function enqueue(Db $db, $kind, $ref, $service)
    {
        return $db->insertIgnore('accounting_jobs', ['kind' => $kind, 'ref_id' => (string)$ref, 'service' => $service, 'status' => 'bekliyor',
            'tries' => 0, 'next_at' => yp_now_ms(), 'created_at' => yp_now_ms()]);
    }

    public static function backoff($tries)
    {
        return (int)min(self::MAX_WAIT_MS, self::BASE_MS * (2 ** max(0, (int)$tries - 1)));
    }

    /** Cron: zamanı gelen işleri çalıştırır. Dönüş: ['done'=>n, 'failed'=>n, 'gaveUp'=>n] */
    public static function run(Db $db, $deadline = null, $limit = 20)
    {
        $out = ['done' => 0, 'failed' => 0, 'gaveUp' => 0];
        $now = yp_now_ms();
        $rows = $db->all("SELECT * FROM {accounting_jobs} WHERE status='bekliyor' AND next_at<=? AND lock_until<? ORDER BY next_at, id LIMIT " . (int)$limit, [$now, $now]);
        foreach ($rows as $j) {
            if ($deadline && microtime(true) > $deadline) {
                break;
            }
            // kısa kilit: aynı işi iki cron aynı anda göndermesin
            if ($db->exec("UPDATE {accounting_jobs} SET lock_until=? WHERE id=? AND status='bekliyor' AND lock_until<?", [yp_now_ms() + 120000, (int)$j['id'], yp_now_ms()]) !== 1) {
                continue;
            }
            $r = self::runOne($db, $j);
            $out[$r]++;
        }
        return $out;
    }

    /** Tek iş. Dönüş: done | failed | gaveUp */
    public static function runOne(Db $db, array $j)
    {
        try {
            $res = self::call($db, $j);
        } catch (\Throwable $e) {
            Log::write('hata', 'Muhasebe işi #' . $j['id'] . ': ' . $e->getMessage());
            $res = ['ok' => false, 'msg' => 'Beklenmeyen hata oluştu.'];
        }
        $now = yp_now_ms();
        if (!empty($res['ok'])) {
            $db->update('accounting_jobs', ['status' => 'tamam', 'tries' => (int)$j['tries'] + 1, 'last_error' => '', 'result' => json_encode($res, JSON_UNESCAPED_UNICODE),
                'done_at' => $now, 'lock_until' => 0], 'id=?', [(int)$j['id']]);
            self::mark($db, $j, $res);
            return 'done';
        }
        $tries = (int)$j['tries'] + 1;
        $msg = yp_str(isset($res['msg']) ? (string)$res['msg'] : 'Bilinmeyen hata', 255);
        $give = $tries >= self::MAX_TRIES || !empty($res['permanent']);
        $db->update('accounting_jobs', ['status' => $give ? 'hata' : 'bekliyor', 'tries' => $tries, 'last_error' => $msg,
            'next_at' => $now + self::backoff($tries), 'lock_until' => 0], 'id=?', [(int)$j['id']]);
        self::mark($db, $j, $res);
        if ($give) {
            Audit::log($db, null, 'acct_job_failed', 'accounting_job', (string)$j['id'], ['service' => $j['service'], 'ref' => $j['ref_id'], 'msg' => $msg]);
            Jobs::alertAdmins($db, Integrations::NAMES[$j['service']] . ' muhasebe kaydı ' . $tries . ' denemede gönderilemedi (' . $j['ref_id'] . '): ' . $msg
                . ' Yönetim › Muhasebe › Muhasebe kuyruğu bölümünden yeniden deneyin.');
            return 'gaveUp';
        }
        return 'failed';
    }

    /** withdrawals.acct alanına servis sonucunu yazar (sır yok) */
    private static function mark(Db $db, array $j, array $res)
    {
        if ($j['kind'] !== 'cekim') {
            return;
        }
        $id = Withdraw::id($j['ref_id']);
        $w = $db->one('SELECT acct FROM {withdrawals} WHERE id=?', [$id]);
        if (!$w) {
            return;
        }
        $a = $w['acct'] ? (json_decode($w['acct'], true) ?: []) : [];
        $a[$j['service']] = ['ok' => !empty($res['ok']), 'msg' => yp_str(isset($res['msg']) ? (string)$res['msg'] : '', 200), 't' => yp_now_ms()];
        $db->update('withdrawals', ['acct' => json_encode($a, JSON_UNESCAPED_UNICODE)], 'id=?', [$id]);
    }

    private static function call(Db $db, array $j)
    {
        if (!Integrations::configured($j['service'], $db)) {
            return ['ok' => false, 'msg' => Integrations::NAMES[$j['service']] . ' bağlantısı ayarlı değil (Yönetim › Entegrasyonlar).'];
        }
        $cfg = Integrations::raw($j['service'], $db);
        $client = $j['service'] === 'parasut' ? new Parasut($cfg) : new BizimHesap($cfg);
        if ($j['kind'] === 'cekim') {
            $w = $db->one('SELECT * FROM {withdrawals} WHERE id=?', [Withdraw::id($j['ref_id'])]);
            $d = $w ? Withdraw::doc($w) : null;
            if (!$d || !Kimlik::valid($d['tckn'])) {
                return ['ok' => false, 'msg' => 'Çekim kaydı veya belge bulunamadı.', 'permanent' => true];
            }
            $p = ['ad' => $d['sellerName'], 'tckn' => $d['tckn'], 'iban' => preg_replace('/\s+/', '', $d['iban']), 'brut' => Text::tl($d['brut']),
                'stopaj' => Text::tl($d['stopaj']), 'net' => Text::tl($d['net']), 'aciklama' => yp_str($d['desc'], 200), 'belge_no' => $d['no'],
                'ettn' => $d['ettn'], 'tarih' => Withdraw::tz($d['t'], 'Y-m-d')];
            return $client->createGiderPusulasi($p);
        }
        if ($j['kind'] === 'hakedis' && $client instanceof Parasut) {
            $x = json_decode((string)$j['result'], true) ?: [];
            return $client->createTahsilatGirisi(isset($x['amount']) ? $x['amount'] : 0, isset($x['date']) ? $x['date'] : date('Y-m-d'),
                isset($x['desc']) ? $x['desc'] : 'PayTR tahsilatı');
        }
        return ['ok' => false, 'msg' => 'Bilinmeyen iş türü.', 'permanent' => true];
    }

    public static function view(array $j)
    {
        return ['id' => 'aj' . (int)$j['id'], 'kind' => $j['kind'], 'ref' => $j['ref_id'], 'service' => $j['service'], 'n' => Integrations::NAMES[$j['service']],
            'status' => $j['status'], 'tries' => (int)$j['tries'], 'error' => $j['last_error'], 'next' => (int)$j['next_at'],
            't' => (int)$j['created_at'], 'done' => $j['done_at'] ? (int)$j['done_at'] : null];
    }

    public static function retry(Db $db, array $staff, $id)
    {
        $n = $db->exec("UPDATE {accounting_jobs} SET status='bekliyor', next_at=?, lock_until=0 WHERE id=? AND status<>'tamam'", [yp_now_ms(), (int)$id]);
        Audit::log($db, $staff['id'], 'acct_job_retry', 'accounting_job', (string)$id);
        return $n === 1;
    }

    /**
     * Hakediş (PayTR tahsilatı → Paraşüt kasa/banka girişi): PayTR en son bağlanacağı için (§10) şimdilik yalnız saplama.
     * PayTR ve Paraşüt ayarlı, "PayTR tahsilatlarını otomatik kaydet" açıksa önceki günün başarılı PayTR yüklemelerinin toplamı
     * günde bir iş olarak kuyruğa eklenir.
     */
    public static function hakedis(Db $db)
    {
        if (!\YP\Money\Paytr::configured()) {
            return ['skip' => 'PayTR ayarlı değil'];
        }
        $p = Integrations::raw('parasut', $db);
        if (!Integrations::configured('parasut', $db) || !yp_bool($p['hakedis_kaydi'])) {
            return ['skip' => 'Paraşüt tahsilat kaydı kapalı'];
        }
        $day = Withdraw::dayStart(yp_now_ms()) - 86400000;
        $key = Withdraw::tz($day, 'Y-m-d');
        $sum = (int)$db->val("SELECT COALESCE(SUM(amount+fee),0) FROM {deposits} WHERE gw IN ('paytr','paytr_eft') AND status='onaylandı' AND decided_at>=? AND decided_at<?",
            [$day, $day + 86400000]);
        if ($sum <= 0) {
            return ['skip' => 'Tahsilat yok', 'day' => $key];
        }
        $db->insertIgnore('accounting_jobs', ['kind' => 'hakedis', 'ref_id' => $key, 'service' => 'parasut', 'status' => 'bekliyor', 'tries' => 0,
            'next_at' => yp_now_ms(), 'created_at' => yp_now_ms(),
            'result' => json_encode(['amount' => Text::tl($sum), 'date' => $key, 'desc' => 'PayTR tahsilatları ' . $key])]);
        return ['day' => $key, 'sum' => $sum];
    }
}
