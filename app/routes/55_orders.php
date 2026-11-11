<?php
/**
 * Siparişler (PLAN §4 P2): satın al (havuz), teslime hazır, teslim et (kanıt medyası), onay, teslim garantisi, itiraz, mesaj;
 * yönetim: sipariş listesi ve itiraz kararı [siparis]. Para hareketleri YP\Money\Orders + Ledger üzerinden, satır kilitli.
 * Yanıt: data.order (S.orders şekli), patch {upsert:{orders,listings}, me}.
 * Satın almada Idempotency-Key ZORUNLU; diğer işlemlerde varsa aynı anahtarla tekrar istek ilk yanıtı döndürür.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Db;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Money\Api;
use YP\Money\IdemTx;
use YP\Money\Orders;
use YP\Money\Rules;
use YP\Money\View;
use YP\RateLimit;
use YP\Text;

return function (Router $r) {
    // Satın al: {listing:'l12', qty, info, ch, place}
    $r->post('orders', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        RateLimit::enforce('buy:' . (int)$u['id'], 30, 60, true, 'Çok hızlı işlem yapıyorsunuz. Lütfen biraz bekleyin.');
        return IdemTx::run($db, $u['id'], $key, 'POST orders', function (Db $db) use ($u, $in) {
            $buyer = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $o = Orders::buy($db, $buyer, isset($in['listing']) ? $in['listing'] : (isset($in['lid']) ? $in['lid'] : ''), $in);
            return Api::orderBody($db, $o['id'], 'Ödeme alındı. Satıcıya bildirim gönderildi.');
        });
    }, ['auth' => 'user']);

    $r->get('orders/{id}', function (Req $q, Db $db) {
        $u = Auth::$user;
        $o = $db->one('SELECT * FROM {orders} WHERE id=?', [View::parseOrder($q->param('id'))]);
        if (!$o) {
            throw HttpError::notFound('Sipariş bulunamadı.');
        }
        if (!Orders::canView($o, $u)) {
            throw HttpError::forbidden('Sipariş yalnızca alıcı, satıcı ve yetkili ekibe açıktır.');
        }
        $l = Api::listing($db, $o['listing_id']);
        return ['data' => ['order' => View::order($db, $o, $u), 'users' => View::orderUsers($db, [$o], $u), 'listing' => $l, 'now' => yp_now_ms()]];
    }, ['auth' => 'user', 'csrf' => false]);

    // Siparişlerim: ?role=buyer|seller|all &status= &after=<id> &limit=
    $r->get('me/orders', function (Req $q, Db $db) {
        $u = Auth::$user;
        $role = $q->q('role', 'all');
        $w = $role === 'buyer' ? 'buyer_id=?' : ($role === 'seller' ? 'seller_id=?' : '(buyer_id=? OR seller_id=?)');
        $p = $role === 'buyer' || $role === 'seller' ? [(int)$u['id']] : [(int)$u['id'], (int)$u['id']];
        $st = $q->q('status');
        if (in_array($st, ['odendi', 'teslim', 'itiraz', 'tamam', 'iade'], true)) {
            $w .= ' AND status=?';
            $p[] = $st;
        }
        $after = Api::after($q);
        if ($after) {
            $w .= ' AND id<?';
            $p[] = $after;
        }
        $lim = Api::limit($q, 30, 100);
        $rows = $db->all('SELECT * FROM {orders} WHERE ' . $w . ' ORDER BY id DESC LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        return ['data' => [
            'orders' => array_map(function ($o) use ($db, $u) {
                return View::order($db, $o, $u);
            }, $rows),
            'users' => View::orderUsers($db, $rows, $u), 'next' => $more && $rows ? (string)end($rows)['id'] : null,
        ]];
    }, ['auth' => 'user', 'csrf' => false]);

    /** Sipariş işlemi: kilitli satır üzerinde $fn; isteğe bağlı Idempotency-Key */
    $act = function (Req $q, Db $db, callable $fn) {
        $u = Auth::$user;
        $key = IdemTx::key($q, false);
        $in = Api::body($q);
        return IdemTx::run($db, $u['id'], $key, $q->method . ' ' . $q->path, function (Db $db) use ($q, $u, $in, $fn) {
            $o = Orders::lock($db, $q->param('id'));
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $res = $fn($db, $o, $me, $in);
            $msg = is_array($res) ? $res[0] : $res;
            $extra = is_array($res) ? $res[1] : [];
            return Api::orderBody($db, $o['id'], $msg, $extra);
        });
    };

    $r->post('orders/{id}/ready', function (Req $q, Db $db) use ($act) {
        return $act($q, $db, function (Db $db, $o, $u) {
            return Orders::ready($db, $o, $u) ? 'Alıcıya haber verildi.' : 'Alıcıya zaten haber verildi.';
        });
    }, ['auth' => 'user']);

    // Teslim ettim: {dpre:['m1'], dpost:['m2'], dvid:'m3'?, note?} — dosyalar önce POST media kind=proof ile yüklenir
    $r->post('orders/{id}/deliver', function (Req $q, Db $db) use ($act) {
        return $act($q, $db, function (Db $db, $o, $u, $in) {
            Orders::deliver($db, $o, $u, $in);
            return 'Teslim bildirildi, görsel yönetime iletildi.';
        });
    }, ['auth' => 'user']);

    $r->post('orders/{id}/confirm', function (Req $q, Db $db) use ($act) {
        return $act($q, $db, function (Db $db, $o, $u, $in) {
            $stars = isset($in['stars']) && is_numeric($in['stars']) ? (int)$in['stars'] : null;
            Orders::confirm($db, $o, $u, $stars);
            return 'Teşekkürler! Ödeme satıcıya aktarıldı.';
        });
    }, ['auth' => 'user']);

    $r->post('orders/{id}/guarantee', function (Req $q, Db $db) use ($act) {
        return $act($q, $db, function (Db $db, $o, $u) {
            Orders::guarantee($db, $o, $u);
            return Rules::tl($o['total']) . ' bakiyenize iade edildi.';
        });
    }, ['auth' => 'user']);

    // İtiraz: {r:'Ürün teslim edilmedi', d:'açıklama', media:['m5']} (kanıt: POST media kind=dispute)
    $r->post('orders/{id}/dispute', function (Req $q, Db $db) use ($act) {
        return $act($q, $db, function (Db $db, $o, $u, $in) {
            Orders::dispute($db, $o, $u, $in);
            return 'İtiraz açıldı, destek ekibi inceleyecek.';
        });
    }, ['auth' => 'user']);

    $r->post('orders/{id}/messages', function (Req $q, Db $db) use ($act) {
        RateLimit::enforce('ochat:' . (int)Auth::$user['id'], 20, 60, true, 'Çok hızlı mesaj gönderiyorsunuz. Lütfen biraz bekleyin.');
        return $act($q, $db, function (Db $db, $o, $u, $in) {
            $flag = Orders::chat($db, $o, $u, isset($in['x']) && is_scalar($in['x']) ? (string)$in['x'] : '');
            return [$flag ? 'İletişim bilgisi gizlendi. Site dışı ticaret yasaktır.' : null, ['flagged' => $flag]];
        });
    }, ['auth' => 'user']);

    /* ---------------- yönetim [siparis] ---------------- */

    // ?status=itiraz|odendi|teslim|tamam|iade|acik|tumu &q= (sipariş no, başlık, üye adı) &after=<id>
    $r->get('admin/orders', function (Req $q, Db $db) {
        $u = Auth::$user;
        $w = ['1=1'];
        $p = [];
        $st = $q->q('status', 'tumu');
        if (in_array($st, ['odendi', 'teslim', 'itiraz', 'tamam', 'iade'], true)) {
            $w[] = 'o.status=?';
            $p[] = $st;
        } elseif ($st === 'acik') {
            $w[] = "o.status IN ('odendi','teslim','itiraz')";
        }
        $s = trim($q->q('q'));
        if ($s !== '') {
            if (preg_match('/^#?S?([0-9]{6,12})$/i', $s, $m) && (int)$m[1] > 100000) {
                $w[] = 'o.id=?';
                $p[] = (int)$m[1] - 100000;
            } else {
                $like = '%' . Text::likeEscape(Text::fold(yp_str($s, 60))) . '%';
                $w[] = "(o.title LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM {users} x WHERE x.name_norm LIKE ? ESCAPE '!' AND (x.id=o.buyer_id OR x.id=o.seller_id)))";
                array_push($p, '%' . Text::likeEscape(yp_str($s, 60)) . '%', $like);
            }
        }
        $after = Api::after($q);
        if ($after) {
            $w[] = 'o.id<?';
            $p[] = $after;
        }
        $lim = Api::limit($q, 50, 100);
        $rows = $db->all('SELECT o.* FROM {orders} o WHERE ' . implode(' AND ', $w) . ' ORDER BY o.id DESC LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        $counts = [];
        foreach ($db->all('SELECT status, COUNT(*) AS n FROM {orders} GROUP BY status') as $c) {
            $counts[$c['status']] = (int)$c['n'];
        }
        return ['data' => [
            'orders' => array_map(function ($o) use ($db, $u) {
                return View::order($db, $o, $u);
            }, $rows),
            'users' => View::orderUsers($db, $rows, $u), 'next' => $more && $rows ? (string)end($rows)['id'] : null, 'counts' => $counts,
            'escrow' => Text::tl((int)$db->val("SELECT COALESCE(SUM(total),0) FROM {orders} WHERE status IN ('odendi','teslim','itiraz')")),
        ]];
    }, ['auth' => 'staff', 'perm' => 'siparis', 'csrf' => false]);

    // İtiraz kararı / teslim edilmemiş siparişi iptal: {to:'seller'|'buyer'}
    $r->post('admin/orders/{id}/resolve', function (Req $q, Db $db) use ($act) {
        return $act($q, $db, function (Db $db, $o, $u, $in) {
            Orders::resolve($db, $o, $u, isset($in['to']) && is_string($in['to']) ? $in['to'] : '');
            return 'Karar uygulandı.';
        });
    }, ['auth' => 'staff', 'perm' => 'ui:act:resolve']);
};
