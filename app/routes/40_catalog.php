<?php
/**
 * Katalog (PLAN §4 P1): serverlar, ilan listesi/arama/ayrıntı, ilan ver/düzenle/kaldır/ücretsiz üste taşı, öneri araması, üye profili.
 * Yanıtlar ön yüzün S şekliyle: listings[] (Catalog::presentListing), users[] (herkese açık alanlar), servers[].
 * Sayfalama anahtar kümesi (keyset): ?after=<next>&limit= (next, bir önceki yanıttan).
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Catalog;
use YP\Censor;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Idem;
use YP\Ids;
use YP\Perm;
use YP\Present;
use YP\RateLimit;
use YP\Settings;
use YP\Text;

return function (Router $r) {
    $limitOf = function (Req $q, $def = 24) {
        return max(1, min(60, (int)$q->q('limit', (string)$def)));
    };
    /** Tek ilan + görselleri + satıcı + server (ayrıntı/patch yanıtı) */
    $one = function (Db $db, $id) {
        $l = $db->one('SELECT * FROM {listings} WHERE id=?', [(int)$id]);
        $m = Catalog::mediaFor($db, [(int)$id]);
        return Catalog::presentListing($l, isset($m[(int)$id]) ? $m[(int)$id] : []);
    };
    /** Idempotency-Key varsa tekrar istekte ilk yanıt döner (çift tıklamayla iki ilan açılmasın) */
    $idem = function (Req $q, Db $db, callable $fn) {
        $key = $q->header('idempotency-key');
        if ($key === '' || !Auth::$user) {
            return $fn();
        }
        list(, $body) = Idem::run($db, Auth::$user['id'], $key, $q->method . ' ' . $q->path, $fn);
        return $body;
    };

    /* ---------------- serverlar ---------------- */

    $r->get('servers', function (Req $q, Db $db) {
        return ['data' => ['servers' => Catalog::servers($db)]];
    }, ['auth' => 'none', 'csrf' => false]);

    // sv12 ya da adres parçası (slug)
    $r->get('servers/{id}', function (Req $q, Db $db) {
        $id = $q->param('id');
        $s = preg_match('/^(sv)?[1-9][0-9]*$/', $id) ? $db->one('SELECT * FROM {servers} WHERE id=? AND deleted_at IS NULL AND active=1', [Ids::server($id)]) : null;
        if (!$s) {
            $s = $db->one('SELECT * FROM {servers} WHERE slug=? AND deleted_at IS NULL AND active=1', [strtolower($id)]);
        }
        if (!$s) {
            throw HttpError::notFound('Server bulunamadı.');
        }
        return ['data' => ['server' => Catalog::presentServer($s, Catalog::counts($db))]];
    }, ['auth' => 'none', 'csrf' => false]);

    /* ---------------- ilanlar: liste, ayrıntı ---------------- */

    // ?sec=tr|pvp &server=sv3 &cat=yang|item|karakter|ep &game= &q= &seller=u5 &sort=yeni|ucuz|pahali|eski &after= &limit=
    $r->get('listings', function (Req $q, Db $db) use ($limitOf) {
        $f = Catalog::filtersFrom($q->query);
        list($rows, $next) = Catalog::query($db, $f, $limitOf($q));
        list($L, $U) = Catalog::presentMany($db, $rows);
        return ['data' => ['listings' => $L, 'users' => $U, 'next' => $next]];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->get('listings/{id}', function (Req $q, Db $db) use ($one) {
        $u = Auth::$user;
        $l = Catalog::listingRow($db, $q->param('id'));
        if (!Catalog::visibleTo($l, $u)) {
            throw HttpError::notFound('İlan bulunamadı ya da yayından kaldırılmış.');
        }
        // görüntülenme: sahibi hariç, aynı IP için ilan başına 30 dakikada bir
        $own = $u && (int)$u['id'] === (int)$l['seller_id'];
        if (!$own && $l['status'] === 'aktif' && RateLimit::hit('view:' . $q->ip . ':' . (int)$l['id'], 1, 1800)['allowed']) {
            $db->exec('UPDATE {listings} SET views=views+1 WHERE id=?', [(int)$l['id']]);
        }
        $out = $one($db, $l['id']);
        $seller = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$l['seller_id']]);
        $srv = $l['server_id'] ? $db->one('SELECT * FROM {servers} WHERE id=?', [(int)$l['server_id']]) : null;
        return ['data' => [
            'listing' => $out,
            'users' => $seller ? [Present::publicUser($seller)] : [],
            'server' => $srv ? Catalog::presentServer($srv, Catalog::counts($db)) : null,
            'own' => $own,
        ]];
    }, ['auth' => 'none', 'csrf' => false]);

    // Üst arama kutusu önerileri (qSug): serverlar + ilanlar
    $r->get('search/suggest', function (Req $q, Db $db) {
        $s = yp_str(trim($q->q('q')), 60);
        if (yp_strlen($s) < 2) {
            return ['data' => ['servers' => [], 'listings' => [], 'users' => []]];
        }
        RateLimit::enforce('sug_ip:' . $q->ip, 120, 60);
        $like = '%' . Text::likeEscape(Text::fold($s)) . '%';
        $srv = $db->all("SELECT * FROM {servers} WHERE deleted_at IS NULL AND active=1 AND (slug LIKE ? ESCAPE '!' OR name LIKE ? ESCAPE '!') ORDER BY sort, id LIMIT 5",
            ['%' . Text::likeEscape(Text::slug($s)) . '%', $like]);
        list($rows) = Catalog::query($db, ['q' => $s, 'sort' => 'ucuz'], 6);
        list($L, $U) = Catalog::presentMany($db, $rows);
        $counts = Catalog::counts($db);
        return ['data' => [
            'servers' => array_map(function ($x) use ($counts) {
                return Catalog::presentServer($x, $counts);
            }, $srv),
            'listings' => $L, 'users' => $U,
        ]];
    }, ['auth' => 'none', 'csrf' => false]);

    // Herkese açık üye profili + aktif ilanları
    $r->get('users/{id}', function (Req $q, Db $db) use ($limitOf) {
        $u = $db->one("SELECT * FROM {users} WHERE id=? AND status='active'", [Ids::user($q->param('id'))]);
        if (!$u) {
            throw HttpError::notFound('Üye bulunamadı.');
        }
        list($rows, $next) = Catalog::query($db, ['seller_id' => (int)$u['id'], 'sort' => $q->q('sort', 'yeni'), 'after' => $q->q('after')], $limitOf($q));
        list($L) = Catalog::presentMany($db, $rows);
        return ['data' => [
            'user' => Present::publicUser($u), 'listings' => $L, 'next' => $next,
            'active' => (int)$db->val("SELECT COUNT(*) FROM {listings} WHERE seller_id=? AND status='aktif' AND stock>0", [(int)$u['id']]),
        ]];
    }, ['auth' => 'none', 'csrf' => false]);

    // Kendi ilanlarım (tüm durumlar: aktif, beklemede, satildi, kaldirildi)
    $r->get('me/listings', function (Req $q, Db $db) use ($limitOf) {
        $st = $q->q('status');
        $f = ['seller_id' => (int)Auth::$user['id'], 'status' => in_array($st, ['aktif', 'beklemede', 'satildi', 'kaldirildi'], true) ? [$st] : ['aktif', 'beklemede', 'satildi', 'kaldirildi'],
            'sort' => 'yeni', 'after' => $q->q('after')];
        list($rows, $next) = Catalog::query($db, $f, $limitOf($q, 50));
        list($L) = Catalog::presentMany($db, $rows);
        return ['data' => ['listings' => $L, 'next' => $next]];
    }, ['auth' => 'user', 'csrf' => false]);

    /* ---------------- ilan ver / düzenle ---------------- */

    // Yükle-önce: görseller önce POST media (kind=listing) ile yüklenir, burada yalnız kimlikleri gönderilir: media:["m4","m5"]
    // P2: dopingler (dop:{vitrin:3}) ilanla aynı işlemde bakiyeden alınır; Idempotency-Key işlem içinde (çift ücret yok)
    $r->post('listings', function (Req $q, Db $db) use ($one) {
        $u = Auth::$user;
        return YP\Money\IdemTx::run($db, $u['id'], YP\Money\IdemTx::key($q, false), 'POST listings', function (Db $db) use ($q, $u, $one) {
            RateLimit::enforce('listing_create:' . (int)$u['id'], 20, 3600, true, 'Bir saatte en fazla 20 ilan verebilirsiniz. Lütfen biraz sonra tekrar deneyin.');
            $site = Settings::get('site', $db);
            list($row, $flags, $mediaIds, $dops) = Catalog::listingInput($db, $q->body(), true, $site);
            $now = yp_now_ms();
            $mod = !empty($site['moderation']);
            $dopCost = 0;
            $id = $db->tx(function (Db $db) use ($row, $u, $now, $mod, $mediaIds, $dops, &$dopCost) {
                $id = $db->insert('listings', $row + [
                    'seller_id' => (int)$u['id'], 'status' => $mod ? 'beklemede' : 'aktif', 'views' => 0,
                    'bump_at' => $now, 'free_bump_at' => 0, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $db->update('listings', ['no' => 100000 + $id], 'id=?', [$id]);
                if ($mediaIds) {
                    Catalog::attachMedia($db, $id, $mediaIds, $u['id']);
                }
                if ($dops) {
                    $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
                    list($dopCost) = YP\Money\Wallet::applyDopings($db, $me, Catalog::listingRow($db, $id, true), $dops, 'sell');
                }
                return $id;
            });
            foreach ($flags as $k => $orig) {
                Censor::log($db, $u['id'], ($k === 'title' ? 'İlan başlığı' : 'İlan açıklaması') . ' #' . (100000 + $id), $orig);
            }
            $l = $one($db, $id);
            $msg = 'İlan #' . $l['no'] . ($mod ? ' onaya gönderildi. Onaylanınca yayına girecek.' : ' yayında!');
            if ($flags) {
                $msg .= ' İletişim bilgisi gizlendi.';
            }
            $patch = ['upsert' => ['listings' => [$l]]];
            if ($dops) {
                $patch['me'] = YP\Money\Api::me($db);
                $msg .= ' Doping ücreti: ' . YP\Money\Rules::tl($dopCost) . '.';
            }
            return ['msg' => $msg, 'data' => ['listing' => $l, 'flagged' => (bool)$flags], 'patch' => $patch];
        });
    }, ['auth' => 'user']);

    $r->put('listings/{id}', function (Req $q, Db $db) use ($one) {
        $u = Auth::$user;
        $l = Catalog::listingRow($db, $q->param('id'));
        if ((int)$l['seller_id'] !== (int)$u['id']) {
            throw HttpError::forbidden('Bu ilan size ait değil.');
        }
        if ($l['status'] === 'kaldirildi' && $l['removed_by'] !== null && (int)$l['removed_by'] !== (int)$u['id']) {
            throw HttpError::conflict('Bu ilan yönetim tarafından kaldırıldı; düzenlenemez.');
        }
        list($row, $flags, $mediaIds, $dops) = Catalog::listingInput($db, $q->body(), false, Settings::get('site', $db));
        if ($dops) {
            throw new HttpError(400, 'Doping için ilan sayfasındaki “Doping al” bölümünü kullanın.', 'use_dope');
        }
        $row['updated_at'] = yp_now_ms();
        if (isset($row['stock']) && (int)$row['stock'] > 0 && $l['status'] === 'satildi') {
            $row['status'] = 'aktif';
        }
        if (isset($row['stock']) && (int)$row['stock'] === 0 && $l['status'] === 'aktif') {
            $row['status'] = 'satildi';
        }
        $db->tx(function (Db $db) use ($l, $row, $mediaIds, $u) {
            $db->update('listings', $row, 'id=?', [(int)$l['id']]);
            if ($mediaIds !== null) {
                Catalog::attachMedia($db, $l['id'], $mediaIds, $u['id']);
            }
        });
        foreach ($flags as $k => $orig) {
            Censor::log($db, $u['id'], 'İlan düzenleme #' . (int)$l['no'], $orig);
        }
        $out = $one($db, $l['id']);
        return ['msg' => 'İlan güncellendi.' . ($flags ? ' İletişim bilgisi gizlendi.' : ''), 'data' => ['listing' => $out, 'flagged' => (bool)$flags],
            'patch' => ['upsert' => ['listings' => [$out]]]];
    }, ['auth' => 'user']);

    $r->post('listings/{id}/unlist', function (Req $q, Db $db) use ($one) {
        $u = Auth::$user;
        $l = Catalog::listingRow($db, $q->param('id'));
        if ((int)$l['seller_id'] !== (int)$u['id']) {
            throw HttpError::forbidden('Bu ilan size ait değil.');
        }
        if ($l['status'] !== 'kaldirildi') {
            $db->update('listings', ['status' => 'kaldirildi', 'removed_by' => (int)$u['id'], 'removed_reason' => 'Satıcı kaldırdı', 'updated_at' => yp_now_ms()], 'id=?', [(int)$l['id']]);
        }
        $out = $one($db, $l['id']);
        return ['msg' => 'İlan yayından kaldırıldı.', 'data' => ['listing' => $out], 'patch' => ['upsert' => ['listings' => [$out]]]];
    }, ['auth' => 'user']);

    // Ücretsiz üste taşı: 2 saatte bir (ön yüzdeki freeBumpBtn)
    $r->post('listings/{id}/free-bump', function (Req $q, Db $db) use ($one) {
        $u = Auth::$user;
        $res = $db->tx(function (Db $db) use ($q, $u) {
            $l = Catalog::listingRow($db, $q->param('id'), true);
            if ((int)$l['seller_id'] !== (int)$u['id']) {
                throw HttpError::forbidden('Bu ilan size ait değil.');
            }
            if ($l['status'] !== 'aktif') {
                throw HttpError::conflict('Yalnız yayındaki ilanlar üste taşınabilir.');
            }
            $now = yp_now_ms();
            $left = (int)$l['free_bump_at'] + Catalog::FREE_BUMP_MS - $now;
            if ($left > 0) {
                throw new HttpError(429, 'Bu ilanı ' . (int)ceil($left / 60000) . ' dk sonra tekrar taşıyabilirsiniz.', 'bump_wait', ['retry_after' => (int)ceil($left / 1000)]);
            }
            $db->update('listings', ['bump_at' => $now, 'free_bump_at' => $now, 'updated_at' => $now], 'id=?', [(int)$l['id']]);
            return $l;
        });
        $out = $one($db, $res['id']);
        return ['msg' => 'İlan #' . $out['no'] . ' listenin en üstüne taşındı.', 'data' => ['listing' => $out], 'patch' => ['upsert' => ['listings' => [$out]]]];
    }, ['auth' => 'user']);
};
