<?php
/**
 * P7 içerik (PLAN §4 P7) — rehber yazıları, kurumsal/yasal sayfalar, backlink ve ortaklık başvuruları.
 *   GET  posts                         herkese açık: yayındaki yazılar (özet)
 *   GET  posts/{slug}                  herkese açık: yazı (sunucuda üretilmiş güvenli HTML); taslak yalnız [seo]
 *   GET  pages/{k}                     herkese açık: yasal / kurumsal sayfa (şirket bilgisi yer tutucuları dolu; eksikse nötr metin)
 *   POST partner-apps                  herkese açık ortaklık başvurusu (IP başına günde 3; "web" bal küpü alanı doluysa kaydedilmez)
 *   [seo]  GET admin/posts · POST admin/posts · PUT admin/posts/{id} · DELETE admin/posts/{id}
 *   [seo]  GET admin/backlinks (başvurularla) · POST admin/backlinks · PUT admin/backlinks/{id} · DELETE admin/backlinks/{id}
 *   [seo]  POST admin/partner-apps/{id}/approve · POST admin/partner-apps/{id}/reject
 *   [ayar] GET admin/pages · PUT admin/pages/{k} · POST admin/pages/{k}/reset (taslak metne dön)
 *   boot: set.maint (bakım), posts (son yazılar: alt bilgi ve rehber), pages (sayfa listesi); admin_queues: partners
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Admin\Content;
use YP\Admin\Maint;
use YP\Admin\Markdown;
use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Hooks;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Perm;
use YP\RateLimit;
use YP\Seo;
use YP\V;

return function (Router $r) {
    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };

    Hooks::on('boot', function (array $data, Db $db, $u) {
        try {
            if (isset($data['set']) && is_array($data['set'])) {
                $data['set']['maint'] = Maint::publicView($db);
            }
            $data['posts'] = array_map(function ($p) use ($db) {
                return Content::presentPost($db, $p);
            }, Content::publishedPosts($db, 8));
            $data['pages'] = array_map(function ($row) {
                return ['k' => $row['k'], 'title' => $row['title']];
            }, $db->all('SELECT k, title FROM {pages} ORDER BY k'));
        } catch (\Throwable $e) {
            YP\Log::write('hata', 'P7 açılış verisi: ' . $e->getMessage());
        }
        return $data;
    }, 'p7content');

    Hooks::on('admin_queues', function (array $q, Db $db, $u) {
        if (Perm::has($u, 'seo')) {
            $q['partners'] = (int)$db->val("SELECT COUNT(*) FROM {partner_apps} WHERE st='bekliyor'");
        }
        return $q;
    }, 'p7partners');

    /* ================= herkese açık ================= */

    $r->get('posts', function (Req $q, Db $db) {
        return ['data' => ['posts' => array_map(function ($p) use ($db) {
            return Content::presentPost($db, $p);
        }, Content::publishedPosts($db, 100))]];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->get('posts/{slug}', function (Req $q, Db $db) {
        $staff = Perm::has(Auth::$user, 'seo');
        $p = Content::postBySlug($db, $q->param('slug'), $staff);
        if (!$p) {
            throw HttpError::notFound('Yazı bulunamadı.');
        }
        return ['data' => ['post' => Content::presentPost($db, $p, true, false)]];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->get('pages/{k}', function (Req $q, Db $db) {
        $row = Content::pageRow($db, $q->param('k'));
        if (!$row) {
            throw HttpError::notFound('Sayfa bulunamadı.');
        }
        $admin = Perm::has(Auth::$user, 'ayar');
        return ['data' => ['page' => Content::presentPage($db, $row, $admin, Content::linkMap($db))]];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->post('partner-apps', function (Req $q, Db $db) {
        $in = $q->body();
        $ipKey = 'partner_ip:' . $q->ip;
        RateLimit::enforce($ipKey, 3, 86400, true, 'Bugün bu bağlantıdan çok fazla başvuru gönderildi. Lütfen yarın tekrar deneyin.');
        $ok = ['msg' => 'Başvurunuz alındı. İnceleyip e-posta ya da Discord üzerinden size döneceğiz.', 'data' => ['sent' => true]];
        // bal küpü: insanların görmediği "web" alanı doluysa bot sayılır; başarı yanıtı verilir ama kaydedilmez
        if (isset($in['web']) && is_scalar($in['web']) && trim((string)$in['web']) !== '') {
            YP\Log::write('bilgi', 'Ortaklık başvurusu bal küpüne takıldı', ['ip' => Content::ipHash($q->ip)]);
            return $ok;
        }
        $v = new V($in);
        $tp = $v->oneOf('tp', Content::PA_TP, 'site');
        $n = $v->str('n', 2, 60, null, 'Ad soyad veya ekip adı 2–60 karakter olmalı.');
        $s = $v->str('s', 0, 40);
        $u = $v->str('u', 8, 300, null, 'Site / kanal adresini yazın.');
        $l = $v->str('l', 0, 300);
        $c = $v->str('c', 3, 80, null, 'E-posta veya Discord adınızı yazın.');
        $x = $v->str('x', 0, 200);
        if ($u && !yp_valid_url($u)) {
            $v->err('u', 'Adres https:// ile başlamalı.');
        }
        if ($l && !yp_valid_url($l)) {
            $v->err('l', 'Bağlantı sayfası https:// ile başlamalı.');
        }
        foreach (['n' => $n, 's' => $s, 'c' => $c, 'x' => $x] as $k => $val) {
            if ($val && preg_match('/[<>]/', $val)) {
                $v->err($k, '< ve > karakterleri kullanılamaz.');
            }
        }
        $v->done();
        $id = $db->insert('partner_apps', ['tp' => $tp, 'n' => $n, 's' => (string)$s, 'u' => $u, 'l' => (string)$l, 'c' => $c, 'x' => (string)$x,
            'st' => 'bekliyor', 'ip_hash' => Content::ipHash($q->ip), 'user_id' => Auth::$user ? (int)Auth::$user['id'] : null, 'created_at' => yp_now_ms()]);
        foreach ($db->all("SELECT * FROM {users} WHERE role IN ('admin','staff') AND status='active'") as $st) {
            if (Perm::has($st, 'seo')) {
                YP\Notify::send($db, $st['id'], 'Yeni ortaklık başvurusu: ' . $n . ($s ? ' (' . $s . ')' : ''), '#yonetim/seo/backlink', 'system');
            }
        }
        $ok['data']['id'] = 'pa' . $id;
        return $ok;
    }, ['auth' => 'none']);

    /* ================= [seo] rehber yazıları ================= */

    $list = function (Db $db) {
        return array_map(function ($p) use ($db) {
            return Content::presentPost($db, $p, false, true);
        }, $db->all('SELECT * FROM {posts} ORDER BY created_at DESC, id DESC LIMIT 500'));
    };
    $postRow = function (Db $db, $id) {
        $p = $db->one('SELECT * FROM {posts} WHERE id=?', [Content::postId($id)]);
        if (!$p) {
            throw HttpError::notFound('Yazı bulunamadı.');
        }
        return $p;
    };
    $after = function (Db $db) {
        try {
            Seo::writeFiles($db); // site haritası yeni/silinen yazıyla
        } catch (\Throwable $e) {
        }
    };
    $bindCover = function (Db $db, $pid, $cover) {
        if ($cover) {
            $db->update('media', ['ref_type' => 'post', 'ref_id' => (int)$pid], 'id=?', [(int)$cover]);
        }
    };

    $r->get('admin/posts', function (Req $q, Db $db) use ($list) {
        return ['data' => ['posts' => $list($db)]];
    }, $S('seo'));

    $r->post('admin/posts', function (Req $q, Db $db) use ($list, $after, $bindCover) {
        $row = Content::postInput($db, $q->body(), Auth::$user);
        $row += ['author_id' => (int)Auth::$user['id'], 'created_at' => yp_now_ms()];
        $id = $db->insert('posts', $row);
        $bindCover($db, $id, $row['cover_id']);
        Audit::log($db, Auth::$user['id'], 'post_add', 'post', 'p' . $id, ['slug' => $row['slug'], 'status' => $row['status']]);
        $after($db);
        $p = $db->one('SELECT * FROM {posts} WHERE id=?', [$id]);
        return ['msg' => $row['status'] === 'yayinda' ? 'Yazı yayınlandı: /rehber/' . $row['slug'] : 'Yazı taslak olarak kaydedildi.',
            'data' => ['post' => Content::presentPost($db, $p, false, true), 'posts' => $list($db)]];
    }, $S('seo'));

    $r->put('admin/posts/{id}', function (Req $q, Db $db) use ($list, $after, $postRow, $bindCover) {
        $cur = $postRow($db, $q->param('id'));
        $row = Content::postInput($db, $q->body(), Auth::$user, $cur);
        $db->update('posts', $row, 'id=?', [(int)$cur['id']]);
        $bindCover($db, $cur['id'], $row['cover_id']);
        if ($cur['cover_id'] && (int)$cur['cover_id'] !== (int)$row['cover_id']) {
            $db->update('media', ['ref_type' => '', 'ref_id' => null], 'id=?', [(int)$cur['cover_id']]); // eski kapak sahipsiz: cron temizler
        }
        Audit::log($db, Auth::$user['id'], 'post_save', 'post', 'p' . (int)$cur['id'], ['slug' => $row['slug'], 'status' => $row['status']]);
        $after($db);
        $p = $db->one('SELECT * FROM {posts} WHERE id=?', [(int)$cur['id']]);
        return ['msg' => 'Yazı kaydedildi.', 'data' => ['post' => Content::presentPost($db, $p, false, true), 'posts' => $list($db)]];
    }, $S('seo'));

    $r->delete('admin/posts/{id}', function (Req $q, Db $db) use ($list, $after, $postRow) {
        $cur = $postRow($db, $q->param('id'));
        $db->exec('DELETE FROM {posts} WHERE id=?', [(int)$cur['id']]);
        if ($cur['cover_id']) {
            $db->update('media', ['ref_type' => '', 'ref_id' => null], 'id=?', [(int)$cur['cover_id']]);
        }
        Audit::log($db, Auth::$user['id'], 'post_del', 'post', 'p' . (int)$cur['id'], ['slug' => $cur['slug'], 'title' => $cur['title']]);
        $after($db);
        return ['msg' => 'Yazı silindi.', 'data' => ['posts' => $list($db)]];
    }, $S('seo'));

    /* ================= [seo] backlink ve ortaklık ================= */

    $blData = function (Db $db) {
        $apps = $db->all('SELECT * FROM {partner_apps} ORDER BY created_at DESC, id DESC LIMIT 300');
        return [
            'backlinks' => array_map([Content::class, 'presentBacklink'], $db->all('SELECT * FROM {backlinks} ORDER BY created_at DESC, id DESC LIMIT 1000')),
            'partnerApps' => array_map([Content::class, 'presentApp'], $apps),
            'partners' => (int)$db->val('SELECT COUNT(*) FROM {servers} WHERE partner_at IS NOT NULL AND deleted_at IS NULL'),
        ];
    };
    $blRow = function (Db $db, $id) {
        $b = $db->one('SELECT * FROM {backlinks} WHERE id=?', [\YP\Ids::parse($id, 'bl')]);
        if (!$b) {
            throw HttpError::notFound('Backlink bulunamadı.');
        }
        return $b;
    };
    $blIn = function (array $in, $partial) {
        $v = new V($in);
        $out = [];
        if (!$partial || $v->has('url')) {
            $u = $v->str('url', 8, 400, null, 'Bağlantının bulunduğu sayfanın adresini yazın.');
            if ($u && !yp_valid_url($u)) {
                $v->err('url', 'Adres https:// ile başlamalı.');
            }
            $out['url'] = $u;
        }
        if (!$partial || $v->has('target')) {
            try {
                $out['target'] = Content::target($v->raw('target'));
            } catch (HttpError $e) {
                $v->err('target', 'Hedef sayfa / ile başlayan bir yol ya da https:// adresi olmalı.');
            }
        }
        if (!$partial || $v->has('anchor')) {
            $a = $v->str('anchor', 0, 120);
            if ($a && preg_match('/[<>]/', $a)) {
                $v->err('anchor', '< ve > karakterleri kullanılamaz.');
            }
            $out['anchor'] = (string)$a;
        }
        if (!$partial || $v->has('k')) {
            $out['k'] = $v->oneOf('k', Content::BL_KINDS, 'diger');
        }
        if (!$partial || $v->has('nf')) {
            $out['nf'] = $v->bool('nf') ? 1 : 0;
        }
        if ($v->has('st')) {
            $out['st'] = $v->oneOf('st', Content::BL_ST);
            $out['ck'] = yp_now_ms();
        }
        $v->done();
        return $out;
    };

    $r->get('admin/backlinks', function (Req $q, Db $db) use ($blData) {
        return ['data' => $blData($db)];
    }, $S('seo'));

    $r->post('admin/backlinks', function (Req $q, Db $db) use ($blData, $blIn) {
        $row = $blIn($q->body(), false);
        $row += ['st' => 'kontrol', 'created_by' => (int)Auth::$user['id'], 'created_at' => yp_now_ms()];
        $id = $db->insert('backlinks', $row);
        Audit::log($db, Auth::$user['id'], 'backlink_add', 'backlink', 'bl' . $id, ['url' => $row['url']]);
        return ['msg' => 'Backlink eklendi.', 'data' => $blData($db)];
    }, $S('seo'));

    $r->put('admin/backlinks/{id}', function (Req $q, Db $db) use ($blData, $blIn, $blRow) {
        $b = $blRow($db, $q->param('id'));
        $set = $blIn($q->body(), true);
        if (!$set) {
            throw HttpError::validation(['_' => 'Değiştirilecek alan gönderilmedi.']);
        }
        $db->update('backlinks', $set, 'id=?', [(int)$b['id']]);
        Audit::log($db, Auth::$user['id'], 'backlink_save', 'backlink', 'bl' . (int)$b['id'], ['keys' => array_keys($set), 'st' => isset($set['st']) ? $set['st'] : null]);
        return ['msg' => 'Backlink güncellendi.', 'data' => $blData($db)];
    }, $S('seo'));

    $r->delete('admin/backlinks/{id}', function (Req $q, Db $db) use ($blData, $blRow) {
        $b = $blRow($db, $q->param('id'));
        $db->exec('DELETE FROM {backlinks} WHERE id=?', [(int)$b['id']]);
        Audit::log($db, Auth::$user['id'], 'backlink_del', 'backlink', 'bl' . (int)$b['id'], ['url' => $b['url']]);
        return ['msg' => 'Backlink silindi.', 'data' => $blData($db)];
    }, $S('seo'));

    $decide = function ($ok) use ($blData) {
        return function (Req $q, Db $db) use ($ok, $blData) {
            $id = \YP\Ids::parse($q->param('id'), 'pa');
            $msg = '';
            $db->tx(function (Db $db) use ($id, $ok, &$msg) {
                $a = $db->one('SELECT * FROM {partner_apps} WHERE id=?' . $db->forUpdate(), [$id]);
                if (!$a) {
                    throw HttpError::notFound('Başvuru bulunamadı.');
                }
                if ($a['st'] !== 'bekliyor') {
                    throw HttpError::conflict('Bu başvuru zaten ' . ($a['st'] === 'onay' ? 'onaylandı' : 'reddedildi') . '.');
                }
                $now = yp_now_ms();
                $db->update('partner_apps', ['st' => $ok ? 'onay' : 'red', 'by_id' => (int)Auth::$user['id'], 'decided_at' => $now], 'id=?', [$id]);
                if (!$ok) {
                    $msg = 'Başvuru reddedildi.';
                    return;
                }
                $msg = 'Başvuru onaylandı.';
                if ($a['tp'] === 'server' && $a['s'] !== '') {
                    $want = mb_strtolower($a['s'], 'UTF-8');
                    foreach ($db->all('SELECT id, name FROM {servers} WHERE deleted_at IS NULL') as $s) {
                        if (mb_strtolower($s['name'], 'UTF-8') === $want) {
                            $db->update('servers', ['partner_url' => yp_str($a['l'] !== '' ? $a['l'] : $a['u'], 255), 'partner_at' => $now, 'updated_at' => $now], 'id=?', [(int)$s['id']]);
                            $msg .= ' ' . $s['name'] . ' artık Partner server.';
                            break;
                        }
                    }
                }
                if ($a['l'] !== '' && !$db->val('SELECT id FROM {backlinks} WHERE url=?', [$a['l']])) {
                    $db->insert('backlinks', ['url' => $a['l'], 'target' => '/', 'anchor' => yp_str($a['s'] !== '' ? $a['s'] : $a['n'], 120),
                        'k' => ['server' => 'rozet', 'yayinci' => 'yayinci', 'site' => 'forum'][$a['tp']], 'nf' => 0, 'st' => 'kontrol', 'app_id' => $id,
                        'created_by' => (int)Auth::$user['id'], 'created_at' => $now]);
                    $msg .= ' Bağlantı "kontrol edilecek" olarak backlink listesine eklendi.';
                }
            });
            Audit::log($db, Auth::$user['id'], $ok ? 'partner_ok' : 'partner_no', 'partner_app', 'pa' . $id);
            return ['msg' => $msg, 'data' => $blData($db)];
        };
    };
    $r->post('admin/partner-apps/{id}/approve', $decide(true), $S('seo'));
    $r->post('admin/partner-apps/{id}/reject', $decide(false), $S('seo'));

    /* ================= [ayar] yasal / kurumsal sayfalar ================= */

    $pagesOut = function (Db $db) {
        Content::seedPages($db); // silinmiş/eksik sayfa olursa taslakla geri gelir
        $out = [];
        foreach (array_keys(Content::PAGES) as $k) {
            $row = Content::pageRow($db, $k);
            if ($row) {
                $out[] = Content::presentPage($db, $row, true);
            }
        }
        return ['pages' => $out, 'company' => Content::company($db), 'legal' => Content::legalStatus($db),
            'fields' => array_map(function ($x) {
                return $x[0];
            }, Content::COMPANY)];
    };
    $r->get('admin/pages', function (Req $q, Db $db) use ($pagesOut) {
        return ['data' => $pagesOut($db)];
    }, $S('ayar'));

    $r->put('admin/pages/{k}', function (Req $q, Db $db) use ($pagesOut) {
        $k = $q->param('k');
        if (!isset(Content::PAGES[$k])) {
            throw HttpError::notFound('Sayfa bulunamadı.');
        }
        $in = $q->body();
        $v = new V($in);
        $title = $v->str('title', 2, 120, null, 'Başlık 2–120 karakter olmalı.');
        $body = Markdown::strip(isset($in['body']) && is_string($in['body']) ? $in['body'] : '', 60000);
        if (mb_strlen($body, 'UTF-8') < 20) {
            $v->err('body', 'Sayfa metni en az 20 karakter olmalı.');
        }
        $v->done();
        Content::seedPages($db);
        $db->update('pages', ['title' => $title, 'body' => $body, 'updated_at' => yp_now_ms(), 'updated_by' => (int)Auth::$user['id']], 'k=?', [$k]);
        Audit::log($db, Auth::$user['id'], 'page_save', 'page', $k, ['len' => mb_strlen($body, 'UTF-8')]);
        return ['msg' => $title . ' kaydedildi.', 'data' => $pagesOut($db)];
    }, $S('ayar'));

    $r->post('admin/pages/{k}/reset', function (Req $q, Db $db) use ($pagesOut) {
        $k = $q->param('k');
        if (!isset(Content::PAGES[$k])) {
            throw HttpError::notFound('Sayfa bulunamadı.');
        }
        Content::seedPages($db);
        $db->update('pages', ['title' => Content::PAGES[$k][0], 'body' => Content::seedBody($k), 'updated_at' => yp_now_ms(), 'updated_by' => (int)Auth::$user['id']], 'k=?', [$k]);
        Audit::log($db, Auth::$user['id'], 'page_reset', 'page', $k);
        return ['msg' => 'Sayfa taslak metne döndürüldü.', 'data' => $pagesOut($db)];
    }, $S('ayar'));
};
