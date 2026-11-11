<?php
/**
 * Yönetim › Katalog (PLAN §4 P1): ilan onay/kaldırma ve onay kuyruğu [ilan], ilan onayı ayarı [ilan],
 * hazır ilan görselleri [ilan], serverlar [server], engellenen içerik sayısı. Her değişiklik audit_log'a yazılır.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Catalog;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Media;
use YP\Notify;
use YP\Settings;

return function (Router $r) {
    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $one = function (Db $db, $id) {
        $l = $db->one('SELECT * FROM {listings} WHERE id=?', [(int)$id]);
        $m = Catalog::mediaFor($db, [(int)$id]);
        return Catalog::presentListing($l, isset($m[(int)$id]) ? $m[(int)$id] : []);
    };

    /* ---------------- ilanlar ---------------- */

    // Onay kuyruğu ve tüm ilanlar: ?status=beklemede|aktif|satildi|kaldirildi &q= &server= &seller= &after=
    $r->get('admin/listings', function (Req $q, Db $db) {
        $f = Catalog::filtersFrom($q->query);
        $st = $q->q('status', 'beklemede');
        $f['status'] = $st === 'hepsi' ? ['aktif', 'beklemede', 'satildi', 'kaldirildi'] : [in_array($st, ['aktif', 'beklemede', 'satildi', 'kaldirildi'], true) ? $st : 'beklemede'];
        list($rows, $next) = Catalog::query($db, $f, max(1, min(100, (int)$q->q('limit', '50'))));
        list($L, $U) = Catalog::presentMany($db, $rows);
        return ['data' => ['listings' => $L, 'users' => $U, 'next' => $next,
            'pending' => (int)$db->val("SELECT COUNT(*) FROM {listings} WHERE status='beklemede'")]];
    }, $S('ilan'));

    $r->post('admin/listings/{id}/approve', function (Req $q, Db $db) use ($one) {
        $actor = Auth::$user;
        $l = Catalog::listingRow($db, $q->param('id'));
        if ($l['status'] === 'aktif') {
            return ['msg' => 'İlan zaten yayında.', 'data' => ['listing' => $one($db, $l['id'])]];
        }
        if ($l['status'] === 'satildi') {
            throw HttpError::conflict('Stoku biten ilan onaylanamaz.');
        }
        $now = yp_now_ms();
        $db->update('listings', ['status' => (int)$l['stock'] > 0 ? 'aktif' : 'satildi', 'approved_by' => (int)$actor['id'], 'removed_by' => null, 'removed_reason' => null,
            'bump_at' => $l['status'] === 'beklemede' ? $now : (int)$l['bump_at'], 'updated_at' => $now], 'id=?', [(int)$l['id']]);
        Audit::log($db, $actor['id'], 'listing_approve', 'listing', $l['id'], ['from' => $l['status']]);
        Notify::send($db, $l['seller_id'], '“' . $l['title'] . '” ilanınız onaylandı ve yayında.', '#ilan-' . Ids::l($l['id']), 'listing_ok', ['ilan' => $l['title']]);
        $out = $one($db, $l['id']);
        return ['msg' => 'İlan onaylandı.', 'data' => ['listing' => $out], 'patch' => ['upsert' => ['listings' => [$out]]]];
    }, $S('ui:act:l-ok'));

    $r->post('admin/listings/{id}/remove', function (Req $q, Db $db) use ($one) {
        $actor = Auth::$user;
        $l = Catalog::listingRow($db, $q->param('id'));
        $in = $q->body();
        $why = yp_str(isset($in['reason']) ? $in['reason'] : '', 200);
        if ($l['status'] !== 'kaldirildi') {
            $db->update('listings', ['status' => 'kaldirildi', 'removed_by' => (int)$actor['id'], 'removed_reason' => $why !== '' ? $why : 'Yönetim kaldırdı',
                'updated_at' => yp_now_ms()], 'id=?', [(int)$l['id']]);
            Audit::log($db, $actor['id'], 'listing_remove', 'listing', $l['id'], ['from' => $l['status'], 'reason' => $why]);
            if ((int)$l['seller_id'] !== (int)$actor['id']) {
                Notify::send($db, $l['seller_id'], '“' . $l['title'] . '” ilanınız yayından kaldırıldı.' . ($why !== '' ? ' Gerekçe: ' . $why : ''), '#hesabim', 'listing_no', ['ilan' => $l['title']]);
            }
        }
        $out = $one($db, $l['id']);
        return ['msg' => 'İlan yayından kaldırıldı.', 'data' => ['listing' => $out], 'patch' => ['upsert' => ['listings' => [$out]]]];
    }, $S('ui:act:l-del'));

    // İlan onayı (moderasyon): açıkken yeni ilanlar "beklemede" başlar
    $r->put('admin/settings/moderation', function (Req $q, Db $db) {
        $actor = Auth::$user;
        $in = $q->body();
        if (!array_key_exists('on', $in) && !array_key_exists('moderation', $in)) {
            throw HttpError::validation(['on' => 'Açık/kapalı değeri gerekli.']);
        }
        $on = yp_bool(array_key_exists('on', $in) ? $in['on'] : $in['moderation']);
        $site = Settings::get('site', $db);
        $site['moderation'] = $on;
        Settings::set('site', $site, $actor['id'], $db);
        Audit::log($db, $actor['id'], 'setting_moderation', 'settings', 'site', ['on' => $on]);
        return ['msg' => $on ? 'Yeni ilanlar onaydan geçecek.' : 'İlanlar anında yayına girecek.', 'data' => ['moderation' => $on], 'patch' => ['set' => ['moderation' => $on]]];
    }, $S('ui:chg:mod'));

    /* ---------------- hazır ilan görselleri ---------------- */

    // Yükle-önce: POST media (kind=cover) → PUT admin/covers/yang-3 {media:"m9"}
    $r->put('admin/covers/{k}', function (Req $q, Db $db) {
        $actor = Auth::$user;
        $k = $q->param('k');
        if (!preg_match(Catalog::COVER_RX, $k)) {
            throw HttpError::notFound('Böyle bir hazır görsel yok.');
        }
        $in = $q->body();
        $m = $db->one("SELECT * FROM {media} WHERE id=? AND kind='cover' AND vis='public'", [Ids::media(isset($in['media']) ? $in['media'] : '')]);
        if (!$m) {
            throw HttpError::validation(['media' => 'Önce görseli yükleyin (tür: cover).']);
        }
        $old = $db->val('SELECT media_id FROM {covers} WHERE k=?', [$k]);
        $db->upsert('covers', ['k' => $k, 'media_id' => (int)$m['id'], 'updated_at' => yp_now_ms(), 'updated_by' => (int)$actor['id']], ['k']);
        $db->update('media', ['ref_type' => 'cover', 'ref_id' => null], 'id=?', [(int)$m['id']]);
        if ($old && (int)$old !== (int)$m['id']) {
            $db->update('media', ['ref_type' => '', 'created_at' => yp_now_ms()], 'id=?', [(int)$old]); // cron 24 saat sonra siler
        }
        Audit::log($db, $actor['id'], 'cover_set', 'cover', $k, ['media' => (int)$m['id']]);
        $covers = Catalog::covers($db);
        return ['msg' => 'Görsel güncellendi.', 'data' => ['covers' => $covers], 'patch' => ['replace' => ['covers' => $covers]]];
    }, $S('ui:chg:coverup'));

    $r->delete('admin/covers/{k}', function (Req $q, Db $db) {
        $actor = Auth::$user;
        $k = $q->param('k');
        if (!preg_match(Catalog::COVER_RX, $k)) {
            throw HttpError::notFound('Böyle bir hazır görsel yok.');
        }
        $old = $db->val('SELECT media_id FROM {covers} WHERE k=?', [$k]);
        if ($old) {
            $db->exec('DELETE FROM {covers} WHERE k=?', [$k]);
            $db->update('media', ['ref_type' => '', 'created_at' => yp_now_ms()], 'id=?', [(int)$old]);
            Audit::log($db, $actor['id'], 'cover_reset', 'cover', $k);
        }
        $covers = Catalog::covers($db);
        return ['msg' => 'Varsayılan görsele dönüldü.', 'data' => ['covers' => $covers], 'patch' => ['replace' => ['covers' => $covers]]];
    }, $S('ui:act:cover-reset'));

    /* ---------------- serverlar ---------------- */

    $r->get('admin/servers', function (Req $q, Db $db) {
        return ['data' => ['servers' => Catalog::servers($db, true)]];
    }, $S('server'));

    $r->post('admin/servers', function (Req $q, Db $db) {
        $actor = Auth::$user;
        $row = Catalog::serverInput($q->body());
        if (empty($row['name'])) {
            throw HttpError::validation(['name' => 'Server adı 2-60 karakter olmalı.']);
        }
        $now = yp_now_ms();
        $row['slug'] = Catalog::uniqueSlug($db, $row['name']);
        $row += ['type' => $row['sec'] === 'tr' ? 'Resmi' : 'PVP', 'lv' => '', 'url' => '', 'descr' => '', 'ep_on' => 0, 'active' => 1];
        if (!isset($row['sort'])) {
            $row['sort'] = (int)$db->val('SELECT COALESCE(MAX(sort),0)+1 FROM {servers} WHERE sec=?', [$row['sec']]);
        }
        if (!array_key_exists('open_at', $row)) {
            $row['open_at'] = $now;
        }
        $row['added_at'] = $now;
        $row['updated_at'] = $now;
        $id = $db->insert('servers', $row);
        Audit::log($db, $actor['id'], 'server_add', 'server', $id, ['name' => $row['name'], 'sec' => $row['sec']]);
        $s = Catalog::presentServer($db->one('SELECT * FROM {servers} WHERE id=?', [$id]));
        return ['msg' => $row['name'] . ' eklendi.', 'data' => ['server' => $s], 'patch' => ['upsert' => ['servers' => [$s]]]];
    }, $S('ui:form:srvadd'));

    $r->put('admin/servers/{id}', function (Req $q, Db $db) {
        $actor = Auth::$user;
        $old = Catalog::serverRow($db, $q->param('id'));
        $in = $q->body();
        $row = Catalog::serverInput($in, $old);
        if (isset($row['name']) && $row['name'] !== $old['name']) {
            $row['slug'] = Catalog::uniqueSlug($db, $row['name'], $old['id']);
        }
        if (array_key_exists('logo', $in)) {
            if ($in['logo'] === null || $in['logo'] === '') {
                $row['logo_media_id'] = null;
            } else {
                $m = $db->one("SELECT * FROM {media} WHERE id=? AND kind='logo'", [Ids::media($in['logo'])]);
                if (!$m) {
                    throw HttpError::validation(['logo' => 'Önce logoyu yükleyin (tür: logo).']);
                }
                $row['logo_media_id'] = (int)$m['id'];
                $db->update('media', ['ref_type' => 'server', 'ref_id' => (int)$old['id']], 'id=?', [(int)$m['id']]);
            }
        }
        $row['updated_at'] = yp_now_ms();
        $db->update('servers', $row, 'id=?', [(int)$old['id']]);
        // TR/PVP değişirse ilanların bölümü de değişir
        if ($row['sec'] !== $old['sec']) {
            $db->exec('UPDATE {listings} SET sec=?, updated_at=? WHERE server_id=?', [$row['sec'], yp_now_ms(), (int)$old['id']]);
        }
        $diff = [];
        foreach ($row as $k => $v) {
            if ($k !== 'updated_at' && array_key_exists($k, $old) && (string)$old[$k] !== (string)$v) {
                $diff[$k] = [$old[$k], $v];
            }
        }
        Audit::log($db, $actor['id'], 'server_save', 'server', $old['id'], $diff);
        $s = Catalog::presentServer($db->one('SELECT * FROM {servers} WHERE id=?', [(int)$old['id']]), Catalog::counts($db));
        return ['msg' => 'Server kaydedildi.', 'data' => ['server' => $s], 'patch' => ['upsert' => ['servers' => [$s]]]];
    }, $S('ui:form:srvsave'));

    // Aktif ilanı (ya da P2'den sonra siparişi) olan server silinemez; diğerleri yumuşak silinir (kayıt kalır, listelerden çıkar)
    $r->delete('admin/servers/{id}', function (Req $q, Db $db) {
        $actor = Auth::$user;
        $s = Catalog::serverRow($db, $q->param('id'));
        $n = (int)$db->val("SELECT COUNT(*) FROM {listings} WHERE server_id=? AND status IN ('aktif','beklemede')", [(int)$s['id']]);
        if ($n > 0) {
            throw HttpError::conflict($s['name'] . ' serverında ' . $n . ' aktif/bekleyen ilan var. Önce ilanları kaldırın ya da serverı gizleyin.');
        }
        if ($db->tableExists('orders') && (int)$db->val("SELECT COUNT(*) FROM {orders} o JOIN {listings} l ON l.id=o.listing_id WHERE l.server_id=? AND o.status IN ('odendi','teslim','itiraz')", [(int)$s['id']])) {
            throw HttpError::conflict($s['name'] . ' serverında süren siparişler var; siparişler bitince silebilirsiniz.');
        }
        $now = yp_now_ms();
        $db->update('servers', ['deleted_at' => $now, 'active' => 0, 'slug' => substr($s['slug'], 0, 70) . '-silindi-' . (int)$s['id'], 'updated_at' => $now], 'id=?', [(int)$s['id']]);
        Audit::log($db, $actor['id'], 'server_del', 'server', $s['id'], ['name' => $s['name']]);
        return ['msg' => $s['name'] . ' silindi.', 'patch' => ['remove' => ['servers' => [Ids::sv($s['id'])]]]];
    }, $S('ui:act:srv-del'));
};
