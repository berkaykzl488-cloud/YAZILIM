<?php
/**
 * P7 bakım, yedek ve güvenli güncelleme [bakim] (PLAN §4 P7).
 *   GET    admin/maint                      bakım modu, sürüm, bekleyen göçler, yedek ayarı, son yedek, yayına alma özeti
 *   PUT    admin/settings/maint             {on, msg, until}
 *   GET    admin/backups                    yedek listesi + ayar
 *   POST   admin/backups                    şimdi yedek al
 *   GET    admin/backups/{id}/download      yalnız YÖNETİCİ; her indirme denetim kaydına yazılır
 *   DELETE admin/backups/{id}
 *   POST   admin/backups/{id}/restore       yalnız YÖNETİCİ ve yalnız bakım modunda; önce geri yükleme öncesi yedek alınır,
 *                                           sonra şema/göçler ve defter tutarlılık denetimi çalışır
 *   POST   admin/backups/upload             yalnız YÖNETİCİ: multipart file=<.sql.gz | .sql> (doğrulanıp listeye eklenir)
 *   PUT    admin/settings/backup            {auto: off|daily|12h|6h, keep: 1–60}
 *   POST   admin/update                     güvenli güncelleme: yedek → bakım açık → şema + göçler → bakım kapalı (önceden kapalıysa); sonuç günlüğü
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Admin\Backup;
use YP\Admin\GoLive;
use YP\Admin\Maint;
use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Raw;
use YP\Http\Req;
use YP\Http\Router;
use YP\Money\Ledger;
use YP\Perm;
use YP\Seo;
use YP\Settings;
use YP\Updater;
use YP\V;

return function (Router $r) {
    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $admin = function () {
        if (!Perm::isAdmin(Auth::$user)) {
            throw HttpError::forbidden('Bu işlemi yalnız yönetici (site sahibi) yapabilir.');
        }
    };
    /** Bekleyen göç dosyaları (uygulanmamış) */
    $pending = function (Db $db) {
        $applied = array_column($db->all('SELECT version FROM {schema_migrations}'), 'version');
        $out = [];
        foreach (glob(YP_APP . '/migrations/[0-9][0-9][0-9][0-9]_*.php') ?: [] as $f) {
            if (!in_array('m:' . basename($f, '.php'), $applied, true)) {
                $out[] = basename($f, '.php');
            }
        }
        sort($out);
        return $out;
    };
    $status = function (Db $db) use ($pending) {
        $u = Updater::status($db);
        $last = $db->one('SELECT * FROM {backups} ORDER BY t DESC, id DESC LIMIT 1');
        return ['maint' => Maint::get($db), 'active' => Maint::active($db), 'app' => YP_APP_VERSION, 'upToDate' => $u['upToDate'], 'pending' => $pending($db),
            'migrations' => array_slice($u['migrations'], 0, 12), 'db' => $u['db'], 'backup' => Backup::settings($db),
            'last' => $last ? Backup::present($db, $last) : null, 'count' => (int)$db->val('SELECT COUNT(*) FROM {backups}'),
            'isAdmin' => Perm::isAdmin(Auth::$user), 'cronLast' => GoLive::cronLast(),
            'limits' => ['upload' => (string)ini_get('upload_max_filesize'), 'post' => (string)ini_get('post_max_size'), 'memory' => (string)ini_get('memory_limit'),
                'time' => (int)ini_get('max_execution_time')]];
    };
    $list = function (Db $db) use ($status) {
        return ['backups' => Backup::listAll($db)] + $status($db);
    };

    $r->get('admin/maint', function (Req $q, Db $db) use ($status) {
        return ['data' => $status($db)];
    }, $S('bakim'));

    $r->put('admin/settings/maint', function (Req $q, Db $db) use ($status) {
        $in = $q->body();
        $v = new V($in);
        $on = $v->bool('on');
        $msg = $v->str('msg', 0, 300);
        if ($msg && preg_match('/[<>]/', $msg)) {
            $v->err('msg', '< ve > karakterleri kullanılamaz.');
        }
        $until = null;
        if (isset($in['until']) && $in['until'] !== null && $in['until'] !== '') {
            if (!is_numeric($in['until']) || (int)$in['until'] <= 0) {
                $v->err('until', 'Tahmini bitiş geçersiz.');
            } elseif ((int)$in['until'] <= yp_now_ms()) {
                $v->err('until', 'Tahmini bitiş ileri bir zaman olmalı.');
            } elseif ((int)$in['until'] > yp_now_ms() + 30 * 86400000) {
                $v->err('until', 'Tahmini bitiş en fazla 30 gün sonrası olabilir.');
            } else {
                $until = (int)$in['until'];
            }
        }
        $v->done();
        $m = Maint::set($db, $on, $msg !== null && $msg !== '' ? $msg : Maint::MSG, $until, (int)Auth::$user['id']);
        Audit::log($db, Auth::$user['id'], $on ? 'maint_on' : 'maint_off', 'settings', 'maint', ['until' => $until]);
        return ['msg' => $on ? 'Bakım modu açıldı. Ziyaretçiler bakım sayfasını görüyor; üye işlemleri durdu.' : 'Bakım modu kapatıldı. Site herkese açık.',
            'data' => $status($db), 'patch' => ['set' => ['maint' => Maint::publicView($db)]]];
    }, $S('bakim'));

    $r->get('admin/backups', function (Req $q, Db $db) use ($list) {
        return ['data' => $list($db)];
    }, $S('bakim'));

    $r->post('admin/backups', function (Req $q, Db $db) use ($list) {
        \YP\RateLimit::enforce('backup_now:' . (int)Auth::$user['id'], 10, 3600, true, 'Saatte en fazla 10 elle yedek alınabilir.');
        $b = Backup::create($db, 'manual', (int)Auth::$user['id']);
        Audit::log($db, Auth::$user['id'], 'backup_create', 'backup', 'bk' . (int)$b['id'], ['rows' => $b['_rows'], 'bytes' => (int)$b['bytes']]);
        return ['msg' => 'Yedek alındı (' . $b['_tables'] . ' tablo, ' . $b['_rows'] . ' satır).', 'data' => $list($db) + ['created' => Backup::present($db, $b)]];
    }, $S('bakim'));

    $r->get('admin/backups/{id}/download', function (Req $q, Db $db) use ($admin) {
        $admin();
        $b = Backup::row($db, $q->param('id'));
        $p = Backup::path($b);
        if (!is_file($p)) {
            throw HttpError::notFound('Yedek dosyası diskte yok.');
        }
        Audit::log($db, Auth::$user['id'], 'backup_download', 'backup', 'bk' . (int)$b['id'], ['file' => $b['file']], $q->ip);
        return Raw::file('application/gzip', $p, ['Content-Disposition' => 'attachment; filename="' . $b['file'] . '"', 'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'no-store']);
    }, $S('bakim') + ['csrf' => false]);

    $r->delete('admin/backups/{id}', function (Req $q, Db $db) use ($list) {
        $b = Backup::row($db, $q->param('id'));
        Backup::delete($db, $b);
        Audit::log($db, Auth::$user['id'], 'backup_delete', 'backup', 'bk' . (int)$b['id'], ['file' => $b['file'], 'kind' => $b['kind']]);
        return ['msg' => 'Yedek silindi.', 'data' => $list($db)];
    }, $S('bakim'));

    $r->post('admin/backups/{id}/restore', function (Req $q, Db $db) use ($admin, $list) {
        $admin();
        $b = Backup::row($db, $q->param('id'));
        $res = Backup::restore($db, $b, Auth::$user);
        return ['msg' => $res['check']['ok'] ? 'Yedek geri yüklendi; defter tutarlılık denetimi geçti. Siteyi kontrol edip bakımı kapatın.'
            : 'Yedek geri yüklendi ama defter tutarlılık denetimi BAŞARISIZ. Günlüğü inceleyin; gerekirse "Geri yükleme öncesi" yedeğine dönün.',
            'data' => $list($db) + ['restore' => $res]];
    }, $S('bakim'));

    $r->post('admin/backups/upload', function (Req $q, Db $db) use ($admin, $list) {
        $admin();
        $f = isset($_FILES['file']) && is_array($_FILES['file']) ? $_FILES['file'] : null;
        if (!$f || is_array($f['error'])) {
            if (empty($_FILES) && (int)$q->header('content-length', '0') > 0) {
                throw new HttpError(413, 'Dosya sunucunun yükleme sınırını (' . ini_get('upload_max_filesize') . ') aşıyor.', 'too_large');
            }
            throw HttpError::validation(['file' => 'Yedek dosyası seçilmedi (alan adı: file).']);
        }
        if ((int)$f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
            throw HttpError::validation(['file' => \YP\Media::uploadError($f['error'])]);
        }
        if (!preg_match('/\.(sql|sql\.gz|gz)$/i', (string)$f['name'])) {
            throw HttpError::validation(['file' => 'Yalnız .sql.gz ya da .sql yedek dosyası yüklenebilir.']);
        }
        list($b, $info) = Backup::upload($db, $f['tmp_name'], (string)$f['name'], (int)Auth::$user['id']);
        return ['msg' => 'Yedek dosyası doğrulandı ve listeye eklendi (' . count($info['tables']) . ' tablo, ' . $info['rows'] . ' satır). Geri yüklemek için bakım modunu açın.',
            'data' => $list($db) + ['created' => Backup::present($db, $b)]];
    }, $S('bakim'));

    $r->put('admin/settings/backup', function (Req $q, Db $db) use ($list) {
        $v = new V($q->body());
        $auto = $v->oneOf('auto', array_keys(Backup::AUTO));
        $keep = $v->int('keep', 1, 60);
        $v->done();
        $cur = Backup::settings($db);
        $new = ['auto' => $auto !== null ? $auto : $cur['auto'], 'keep' => $keep !== null ? $keep : $cur['keep']];
        Settings::set('backup', $new, Auth::$user['id'], $db);
        Backup::prune($db);
        Audit::log($db, Auth::$user['id'], 'settings_backup', 'settings', 'backup', $new);
        $L = ['off' => 'Otomatik yedek kapatıldı.', 'daily' => 'Her gün otomatik yedek alınacak.', '12h' => '12 saatte bir otomatik yedek alınacak.', '6h' => '6 saatte bir otomatik yedek alınacak.'];
        return ['msg' => $L[$new['auto']] . ($new['auto'] !== 'off' ? ' Son ' . $new['keep'] . ' otomatik yedek saklanır.' : ''), 'data' => $list($db)];
    }, $S('bakim'));

    // Güvenli güncelleme: dosyalar yüklendikten sonra (zip/FTP) panelden tek tuş. Göçler zaten ilk istekte otomatik uygulanır;
    // bu uç aynı işi önce yedek alıp bakım modunda yapar ve sonucu günlük olarak gösterir.
    $r->post('admin/update', function (Req $q, Db $db) use ($status, $pending) {
        \YP\RateLimit::enforce('safe_update:' . (int)Auth::$user['id'], 6, 3600, true, 'Saatte en fazla 6 kez güncelleme çalıştırılabilir.');
        $log = [];
        $t0 = microtime(true);
        $by = (int)Auth::$user['id'];
        $before = $pending($db);
        $log[] = 'Sürüm ' . YP_APP_VERSION . ' · bekleyen göç: ' . ($before ? implode(', ', $before) : 'yok') . '.';
        $b = Backup::create($db, 'pre_update', $by);
        $log[] = 'Güncelleme öncesi yedek alındı: ' . $b['file'] . ' (' . $b['_rows'] . ' satır).';
        $was = Maint::active($db);
        $prevMaint = Maint::get($db);
        if (!$was) {
            Maint::set($db, true, 'Site güncelleniyor. Birkaç dakika içinde geri döneceğiz.', yp_now_ms() + 900000, $by);
            $log[] = 'Bakım modu açıldı (en geç 15 dakika).';
        } else {
            $log[] = 'Bakım modu zaten açık.';
        }
        $ok = true;
        $done = [];
        try {
            $done = Updater::ensure($db, true);
            $log[] = $done ? 'Veritabanı güncellendi: ' . implode('; ', $done) : 'Veritabanı zaten güncel.';
            try {
                $sf = Seo::writeFiles($db);
                $log[] = 'Site haritası yazıldı (' . $sf['urls'] . ' adres).';
            } catch (\Throwable $e) {
            }
        } catch (\Throwable $e) {
            $ok = false;
            $log[] = 'HATA: ' . yp_str($e->getMessage(), 300) . ' — site bakım modunda bırakıldı; "Güncelleme öncesi" yedeğini geri yükleyebilirsiniz.';
            YP\Log::write('hata', 'Güvenli güncelleme başarısız: ' . $e->getMessage());
        }
        $chk = Ledger::check($db);
        $log[] = $chk['ok'] ? 'Defter tutarlılık denetimi: geçti.' : 'Defter tutarlılık denetimi BAŞARISIZ: ' . implode('; ', array_slice($chk['errors'], 0, 3));
        if ($ok && !$was) {
            Maint::set($db, false, $prevMaint['msg'], null, $by);
            $log[] = 'Bakım modu kapatıldı; site açık.';
        }
        $ms = (int)round((microtime(true) - $t0) * 1000);
        $log[] = 'Bitti (' . $ms . ' ms).';
        Audit::log($db, $by, 'safe_update', 'system', YP_APP_VERSION, ['ok' => $ok, 'done' => $done, 'backup' => $b['file'], 'ledger' => $chk['ok'], 'ms' => $ms]);
        return ['msg' => $ok ? 'Güncelleme tamamlandı.' : 'Güncelleme tamamlanamadı; site bakım modunda.', 'data' => ['log' => $log, 'ok' => $ok, 'done' => $done, 'check' => $chk] + $status($db),
            'patch' => ['set' => ['maint' => Maint::publicView($db)]]];
    }, $S('bakim'));
};
