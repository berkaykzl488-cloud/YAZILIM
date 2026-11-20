<?php
/**
 * Yang Borsası (PLAN §4 P4). Para işlemleri YP\Exchange\Exchange + Ledger üzerinden, satır kilitli.
 *
 * Üye:
 *   GET  exchange                         pazarlar, satış sırası (satıcılar maskeli), stok; girişliyse kendi siparişleri ve emirleri
 *   GET  exchange/quote?m=&qty=           sunucu exQuote: sabit fiyatla tutar, stok, eksik adet
 *   POST exchange/orders                  {market, qty, f}  alım siparişi (Idempotency-Key ZORUNLU) — tutar ESCROW:EX'e
 *   POST exchange/offers                  {market, qty, price, f, ok}  satış emri (gizli alanlar şifreli)
 *   POST exchange/offers/{id}/cancel      sahibi ya da [borsa]
 *   PUT  exchange/orders/{id}/fields      {f}  bilgi istenen siparişte bilgileri güncelle
 *   POST exchange/orders/{id}/ready       "Geldim, hazırım"
 *   GET  me/exchange                      Hesabım › Borsa işlemlerim
 * Operatör [borsa]:
 *   GET  admin/ex/orders?f=&srv=&q=       sipariş listesi · GET admin/ex/orders/{id}[?reveal=1] ayrıntı (reveal: gizli bilgiler, audit'li)
 *   GET  admin/ex/offers?hist=            satış emirleri
 *   POST admin/ex/orders/{id}/claim | pair {offer,qty} | unpair {offer} | unpair-all | match | deliver {qty} | done | cancel | call {msg} | info {msg}
 *   POST admin/ex/power {on}  ·  PUT admin/ex/switch {k}  ·  PUT admin/ex/offmsg {msg}
 * Ayarlar [borsa_ayar]:
 *   GET  admin/ex/settings · PUT|POST admin/ex/markets · DELETE admin/ex/markets/{id}
 *   PUT|POST admin/ex/fields/{set} (set: buy|sell) · DELETE admin/ex/fields/{set}/{key} · POST admin/ex/fields/{set}/{key}/up
 *   PUT  admin/ex/notify {mail:{borsa,call,…}, sms:{…}}  borsa / EP e-posta ve SMS bildirimleri
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Auth;
use YP\Db;
use YP\Exchange\Ep;
use YP\Exchange\Exchange;
use YP\Exchange\Engine;
use YP\Hooks;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Money\Api;
use YP\Money\IdemTx;
use YP\Money\Rules;
use YP\Perm;
use YP\RateLimit;
use YP\Settings;
use YP\Text;

return function (Router $r) {
    $S = function ($perm, $csrf = true) {
        return ['auth' => 'staff', 'perm' => $perm, 'csrf' => $csrf];
    };
    $fieldsOut = function (Db $db) {
        return ['exFieldsBuy' => array_map([Exchange::class, 'presentField'], Exchange::fields($db, 'buy')),
            'exFields' => array_map([Exchange::class, 'presentField'], Exchange::fields($db, 'sell')), 'exRules' => (string)Exchange::cfg($db)['rules']];
    };

    // açılış: borsa ayarları + açık pazarlar + bilgi alanları, EP paketleri ve Happy Hour
    Hooks::on('boot', function (array $data, Db $db, $u) use ($fieldsOut) {
        if (!$db->tableExists('ex_markets')) {
            return $data;
        }
        $data['set'] = array_merge(isset($data['set']) ? $data['set'] : [], Exchange::publicCfg($db), ['hh' => Ep::hh($db)]);
        $data['exchange'] = array_map([Exchange::class, 'presentMarket'], Exchange::markets($db, true));
        $data += $fieldsOut($db);
        $data['epProducts'] = Ep::publicProducts($db);
        return $data;
    }, 'exchange');
    // yoklama: üyenin borsa kayıtları değiştiyse (imza) ön yüz yeniden yükler; [borsa] için açık sipariş sayısı
    Hooks::on('poll', function (array $data, Db $db, $u) {
        if ($u && $db->tableExists('ex_orders')) {
            $data['exSig'] = Exchange::memberSig($db, $u['id']);
            if (Perm::has($u, 'borsa')) {
                $data['exStaff'] = Exchange::staffSig($db);
            }
        }
        return $data;
    }, 'exchange');
    // Yönetim › Bugün: açık borsa siparişi, stoğu azalan EP paketi
    Hooks::on('admin_queues', function (array $q, Db $db, $u) {
        if (Perm::has($u, 'borsa')) {
            $q['borsa'] = (int)$db->val("SELECT COUNT(*) FROM {ex_orders} WHERE status IN ('bekliyor','islemde','bilgi','kismen')");
        }
        if (Perm::has($u, 'ep')) {
            $q['eplow'] = (int)$db->val("SELECT COUNT(*) FROM {ep_products} p WHERE p.is_on=1 AND p.deleted_at IS NULL AND (SELECT COUNT(*) FROM {ep_codes} c WHERE c.product_id=p.id AND c.status='stok')<3");
        }
        return $q;
    }, 'exchange');

    /* ---------------- üye ---------------- */

    $mine = function (Db $db, $uid) {
        $o = $db->all('SELECT * FROM {ex_orders} WHERE user_id=? ORDER BY id DESC LIMIT 100', [(int)$uid]);
        $f = $db->all('SELECT * FROM {ex_offers} WHERE user_id=? ORDER BY id DESC LIMIT 100', [(int)$uid]);
        return ['orders' => Exchange::presentOrders($db, $o, 'owner', true), 'offers' => Exchange::presentOffers($db, $f, 'owner', $uid)];
    };

    $r->get('exchange', function (Req $q, Db $db) use ($mine) {
        $u = Auth::$user;
        $mk = Exchange::markets($db, true);
        $book = [];
        $stock = [];
        foreach ($mk as $m) {
            $rows = $db->all("SELECT * FROM {ex_offers} WHERE market_id=? AND status='aktif' AND left_qty>0 ORDER BY price, created_at, id LIMIT 60", [(int)$m['id']]);
            $book = array_merge($book, $rows);
            $stock[Exchange::xid($m['id'])] = (int)$db->val("SELECT COALESCE(SUM(left_qty),0) FROM {ex_offers} WHERE market_id=? AND status='aktif' AND left_qty>0", [(int)$m['id']]);
        }
        $out = ['markets' => array_map([Exchange::class, 'presentMarket'], $mk), 'stock' => (object)$stock, 'set' => Exchange::publicCfg($db),
            'book' => Exchange::presentOffers($db, $book, 'public', $u ? $u['id'] : null), 'users' => Exchange::maskedSellers($db, $book, $u ? $u['id'] : null)];
        if ($u) {
            $out['mine'] = $mine($db, $u['id']);
        }
        return ['data' => $out];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->get('exchange/quote', function (Req $q, Db $db) {
        $m = Exchange::market($db, Exchange::parseMarket($q->q('m')));
        if (!$m || !(int)$m['is_on']) {
            throw HttpError::notFound('Bu server şu an borsada değil.');
        }
        $qty = max(1, min(Exchange::MAX_QTY, (int)$q->q('qty', '1')));
        $offers = [];
        foreach ($db->all("SELECT * FROM {ex_offers} WHERE market_id=? AND status='aktif' AND left_qty>0", [(int)$m['id']]) as $x) {
            $offers[(int)$x['id']] = Exchange::engOffer($x);
        }
        $qt = Engine::quote($offers, $qty, Engine::marginBp($m['margin_bp'], Exchange::globalMarginBp($db)));
        $stock = Engine::stock($offers);
        $price = $m['buy'] === null ? null : (int)$m['buy'];
        return ['data' => ['m' => Exchange::xid($m['id']), 'qty' => $qty, 'price' => $price === null ? null : Text::tl($price),
            'total' => $price === null ? null : Text::tl($price * $qty), 'stock' => $stock, 'miss' => max(0, $qty - $stock), 'ok' => $qt['ok'],
            'avg' => Text::tl($qt['avg'])]];
    }, ['auth' => 'none', 'csrf' => false]);

    $r->post('exchange/orders', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, true);
        $in = Api::body($q);
        RateLimit::enforce('exbuy:' . (int)$u['id'], 30, 60, true, 'Çok hızlı işlem yapıyorsunuz. Lütfen biraz bekleyin.');
        return IdemTx::run($db, $u['id'], $key, 'POST exchange/orders', function (Db $db) use ($u, $in) {
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $o = Exchange::placeOrder($db, $me, $in);
            $p = Exchange::presentOrders($db, [$o], 'owner', true)[0];
            return ['msg' => '#' . $p['id'] . ' sıraya alındı.', 'data' => ['order' => $p], 'patch' => ['upsert' => ['exOrders' => [$p]], 'me' => Api::me($db)]];
        });
    }, ['auth' => 'user']);

    $r->post('exchange/offers', function (Req $q, Db $db) {
        $u = Auth::$user;
        $key = IdemTx::key($q, false);
        $in = Api::body($q);
        RateLimit::enforce('exoffer:' . (int)$u['id'], 30, 3600, true, 'Bir saatte en fazla 30 satış emri verebilirsiniz.');
        return IdemTx::run($db, $u['id'], $key, 'POST exchange/offers', function (Db $db) use ($u, $in) {
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            list($of, $rank) = Exchange::placeOffer($db, $me, $in);
            $p = Exchange::presentOffers($db, [$of], 'owner', $u['id'])[0];
            return ['msg' => 'Emriniz yayında' . ($rank ? ', fiyat sıralamasında ' . $rank . '. sıradasınız' : '') . '.', 'data' => ['offer' => $p, 'rank' => $rank],
                'patch' => ['upsert' => ['exOffers' => [$p]]]];
        });
    }, ['auth' => 'user']);

    $r->post('exchange/offers/{id}/cancel', function (Req $q, Db $db) {
        $u = Auth::$user;
        return $db->tx(function (Db $db) use ($q, $u) {
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $of = Exchange::cancelOffer($db, $me, $q->param('id'));
            $p = Exchange::presentOffers($db, [$of], Perm::has($me, 'borsa') && (int)$of['user_id'] !== (int)$me['id'] ? 'staff' : 'owner', $me['id'])[0];
            return ['msg' => 'Emir iptal edildi.', 'data' => ['offer' => $p], 'patch' => ['upsert' => ['exOffers' => [$p]]]];
        });
    }, ['auth' => 'user']);

    $own = function (Req $q, Db $db, callable $fn) {
        $u = Auth::$user;
        return $db->tx(function (Db $db) use ($q, $u, $fn) {
            $o = Exchange::lockOrder($db, $q->param('id'));
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $msg = $fn($db, $me, $o, Api::body($q));
            $p = Exchange::presentOrders($db, [$db->one('SELECT * FROM {ex_orders} WHERE id=?', [(int)$o['id']])], 'owner', true)[0];
            return ['msg' => $msg, 'data' => ['order' => $p], 'patch' => ['upsert' => ['exOrders' => [$p]]]];
        });
    };
    $r->put('exchange/orders/{id}/fields', function (Req $q, Db $db) use ($own) {
        return $own($q, $db, function (Db $db, $me, $o, $in) {
            Exchange::fixFields($db, $me, $o, isset($in['f']) ? $in['f'] : $in);
            return 'Bilgiler güncellendi, sipariş tekrar sırada.';
        });
    }, ['auth' => 'user']);
    $r->post('exchange/orders/{id}/ready', function (Req $q, Db $db) use ($own) {
        return $own($q, $db, function (Db $db, $me, $o) {
            Exchange::ready($db, $me, $o);
            return 'Operatöre hazır olduğunuz bildirildi.';
        });
    }, ['auth' => 'user']);

    $r->get('me/exchange', function (Req $q, Db $db) use ($mine) {
        return ['data' => $mine($db, Auth::$user['id'])];
    }, ['auth' => 'user', 'csrf' => false]);

    /* ---------------- operatör [borsa] ---------------- */

    /** Sipariş ayrıntısı: sipariş (geçmişiyle), eşlenen + pazardaki aktif satış emirleri, üyeler. $reveal: gizli alanlar (audit) */
    $detail = function (Db $db, $orderId, $reveal = false) {
        $o = $db->one('SELECT * FROM {ex_orders} WHERE id=?', [(int)$orderId]);
        if (!$o) {
            throw HttpError::notFound('Borsa siparişi bulunamadı.');
        }
        $fills = Exchange::fillsOf($db, $o['id']);
        $fillIds = array_values(array_unique(array_map('intval', array_column($fills, 'offer_id'))));
        $book = $db->all("SELECT * FROM {ex_offers} WHERE market_id=? AND status='aktif' AND left_qty>0 ORDER BY price, created_at, id LIMIT 200", [(int)$o['market_id']]);
        $bookIds = array_map('intval', array_column($book, 'id'));
        $fo = $fillIds ? $db->all('SELECT * FROM {ex_offers} WHERE id IN (' . implode(',', array_fill(0, count($fillIds), '?')) . ')', $fillIds) : [];
        $offers = Exchange::presentOffers($db, $fo, 'staff', null, $reveal);
        $rest = array_values(array_filter($book, function ($b) use ($fillIds) {
            return !in_array((int)$b['id'], $fillIds, true);
        }));
        $offers = array_merge($offers, Exchange::presentOffers($db, $rest, 'staff'));
        $uids = array_merge([(int)$o['user_id']], array_map('intval', array_column($fills, 'seller_id')), array_map('intval', array_column($book, 'user_id')),
            $o['staff_id'] ? [(int)$o['staff_id']] : []);
        return ['order' => Exchange::presentOrders($db, [$o], 'staff', true)[0], 'offers' => $offers, 'users' => Exchange::staffUsers($db, $uids),
            'revealed' => (bool)$reveal, 'bookIds' => array_map([Exchange::class, 'ofid'], $bookIds)];
    };

    $r->get('admin/ex/orders', function (Req $q, Db $db) {
        $w = ['1=1'];
        $p = [];
        $f = $q->q('f', 'hepsi');
        $grp = ['bekliyor' => "o.status IN ('bekliyor','islemde','bilgi')", 'kismen' => "o.status='kismen'", 'tamam' => "o.status='tamam'", 'iptal' => "o.status='iptal'",
            'acik' => "o.status IN ('bekliyor','islemde','bilgi','kismen')"];
        if (isset($grp[$f])) {
            $w[] = $grp[$f];
        }
        if ($q->q('srv') !== '' && $q->q('srv') !== 'hepsi') {
            $w[] = 'o.server_id=?';
            $p[] = Ids::server($q->q('srv'));
        }
        $s = trim($q->q('q'));
        if ($s !== '') {
            if (preg_match('/^#?B([0-9]{4,12})$/i', $s, $m) && (int)$m[1] > 1000) {
                $w[] = 'o.id=?';
                $p[] = (int)$m[1] - 1000;
            } else {
                $like = '%' . Text::likeEscape(Text::fold(yp_str($s, 60))) . '%';
                $w[] = "EXISTS (SELECT 1 FROM {users} x WHERE x.id=o.user_id AND (x.name_norm LIKE ? ESCAPE '!' OR x.tel LIKE ? ESCAPE '!'))";
                array_push($p, $like, '%' . Text::likeEscape(yp_str($s, 30)) . '%');
            }
        }
        $wh = implode(' AND ', $w);
        // açık siparişlerin hepsi + kapanmışlardan son 200
        $open = $db->all("SELECT o.* FROM {ex_orders} o WHERE $wh AND o.status IN ('bekliyor','islemde','bilgi','kismen') ORDER BY o.id LIMIT 1000", $p);
        $closed = $db->all("SELECT o.* FROM {ex_orders} o WHERE $wh AND o.status IN ('tamam','iptal') ORDER BY o.id DESC LIMIT " . Api::limit($q, 200, 500), $p);
        $rows = array_merge($open, $closed);
        $counts = [];
        foreach ($db->all('SELECT status, COUNT(*) AS n FROM {ex_orders} GROUP BY status') as $c) {
            $counts[$c['status']] = (int)$c['n'];
        }
        return ['data' => ['orders' => Exchange::presentOrders($db, $rows, 'staff', false), 'counts' => $counts,
            'users' => Exchange::staffUsers($db, array_merge(array_column($rows, 'user_id'), array_column($rows, 'staff_id'))),
            'escrow' => Text::tl(\YP\Money\Ledger::balance($db, 'ESCROW:EX'))]];
    }, $S('borsa', false));

    $r->get('admin/ex/orders/{id}', function (Req $q, Db $db) use ($detail) {
        $id = Exchange::parseOrder($q->param('id'));
        $rev = $q->q('reveal') === '1';
        $d = $detail($db, $id, $rev);
        if ($rev) {
            Audit::log($db, Auth::$user['id'], 'ex_reveal', 'ex_order', Exchange::oid($id), ['offers' => array_values(array_map(function ($f) {
                return $f['of'];
            }, $d['order']['fills']))]);
        }
        return ['data' => $d];
    }, $S('borsa', false));

    $r->get('admin/ex/offers', function (Req $q, Db $db) {
        $hist = $q->q('hist') === '1';
        $rows = $hist ? $db->all("SELECT * FROM {ex_offers} WHERE status<>'aktif' ORDER BY id DESC LIMIT " . Api::limit($q, 200, 500))
            : $db->all("SELECT * FROM {ex_offers} WHERE status='aktif' ORDER BY market_id, price, created_at, id LIMIT 2000");
        return ['data' => ['offers' => Exchange::presentOffers($db, $rows, 'staff'), 'users' => Exchange::staffUsers($db, array_column($rows, 'user_id'))]];
    }, $S('borsa', false));

    $op = function (Req $q, Db $db, callable $fn) use ($detail) {
        $u = Auth::$user;
        $key = IdemTx::key($q, false);
        $in = Api::body($q);
        return IdemTx::run($db, $u['id'], $key, $q->method . ' ' . $q->path, function (Db $db) use ($q, $u, $in, $fn, $detail) {
            $o = Exchange::lockOrder($db, $q->param('id'));
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $msg = $fn($db, $me, $o, $in);
            $d = $detail($db, $o['id']);
            return ['msg' => $msg, 'data' => $d, 'patch' => ['upsert' => ['exOrders' => [$d['order']], 'exOffers' => $d['offers']]]];
        });
    };
    $r->post('admin/ex/orders/{id}/claim', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o) {
            Exchange::claim($db, $me, $o);
            return 'İşlemi üstlendiniz.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/pair', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o, $in) {
            $n = Exchange::pair($db, $me, $o, isset($in['offer']) ? $in['offer'] : '', isset($in['qty']) ? $in['qty'] : 0);
            return Rules::num($n) . ' adet #' . Exchange::ofid(Exchange::parseOffer($in['offer'])) . ' emriyle eşlendi.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/unpair', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o, $in) {
            $n = Exchange::unpair($db, $me, $o, isset($in['offer']) ? $in['offer'] : '');
            if (!$n) {
                throw HttpError::conflict('Silinecek eşleme yok.');
            }
            return 'Eşleme silindi, ' . Rules::num($n) . ' adet satış emrine geri döndü.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/unpair-all', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o) {
            $n = Exchange::unpair($db, $me, $o, null);
            return $n ? Rules::num($n) . ' adet eşleme silindi, satış emirlerine geri döndü.' : 'Silinecek eşleme yok.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/match', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o) {
            $n = Exchange::match($db, $me, $o['market_id']);
            return $n ? Rules::num($n) . ' adet en ucuz satış emirleriyle eşleşti.' : 'Şu an eşleşecek satış emri yok.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/deliver', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o, $in) {
            $res = Exchange::deliver($db, $me, $o, isset($in['qty']) ? $in['qty'] : null);
            if (!empty($res['same'])) {
                return 'Teslim edilen adet değişmedi.';
            }
            return $res['done'] ? 'Sipariş tamamlandı, satıcılara ödeme yapıldı.' . ($res['back'] ? ' ' . Rules::tl($res['back']) . ' fiyat farkı alıcıya iade edildi.' : '')
                : 'Kısmi teslim kaydedildi.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/done', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o) {
            $res = Exchange::deliver($db, $me, $o, (int)$o['qty']);
            return 'Sipariş tamamlandı, satıcılara ödeme yapıldı.' . (!empty($res['back']) ? ' ' . Rules::tl($res['back']) . ' fiyat farkı alıcıya iade edildi.' : '');
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/cancel', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o) {
            $b = Exchange::cancel($db, $me, $o);
            Audit::log($db, $me['id'], 'ex_cancel', 'ex_order', Exchange::oid($o['id']), ['refund' => $b]);
            return 'Sipariş iptal edildi, ' . Rules::tl($b) . ' alıcıya iade edildi.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/call', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o, $in) {
            Exchange::call($db, $me, $o, isset($in['msg']) ? $in['msg'] : '');
            return 'Alıcıya bildirim ve SMS gönderildi.';
        });
    }, $S('borsa'));
    $r->post('admin/ex/orders/{id}/info', function (Req $q, Db $db) use ($op) {
        return $op($q, $db, function (Db $db, $me, $o, $in) {
            Exchange::info($db, $me, $o, isset($in['msg']) ? $in['msg'] : '');
            return 'Üyeden bilgi istendi.';
        });
    }, $S('borsa'));

    $r->post('admin/ex/power', function (Req $q, Db $db) {
        $in = Api::body($q);
        $u = Auth::$user;
        return $db->tx(function (Db $db) use ($in, $u) {
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $on = !empty(Exchange::cfg($db)['exOn']);
            $want = array_key_exists('on', $in) ? yp_bool($in['on']) : !$on;
            if ($want === $on) {
                return ['msg' => $on ? 'Borsa zaten açık.' : 'Borsa zaten kapalı.', 'data' => ['set' => Exchange::publicCfg($db)], 'patch' => ['set' => Exchange::publicCfg($db)]];
            }
            if (!$want) {
                $res = Exchange::shutdown($db, $me);
                return ['msg' => 'Borsa kapatıldı. ' . $res['orders'] . ' sipariş ve ' . $res['offers'] . ' satış emri iptal edildi, üyelere bilgi verildi.',
                    'data' => ['shutdown' => $res + ['refundedTl' => Text::tl($res['refunded'])], 'set' => Exchange::publicCfg($db)], 'patch' => ['set' => Exchange::publicCfg($db)]];
            }
            $n = Exchange::powerOn($db, $me);
            return ['msg' => 'Borsa açıldı.', 'data' => ['notified' => $n, 'set' => Exchange::publicCfg($db)], 'patch' => ['set' => Exchange::publicCfg($db)]];
        });
    }, $S('borsa'));

    $r->put('admin/ex/switch', function (Req $q, Db $db) {
        $in = Api::body($q);
        $k = isset($in['k']) ? $in['k'] : '';
        if (!in_array($k, ['exBuyOn', 'exSellOn'], true)) {
            throw HttpError::validation(['k' => 'Geçersiz anahtar.']);
        }
        $c = Exchange::cfg($db);
        $v = array_key_exists('on', $in) ? yp_bool($in['on']) : empty($c[$k]);
        Exchange::setCfg($db, [$k => $v], Auth::$user['id']);
        Audit::log($db, Auth::$user['id'], 'ex_switch', 'settings', 'ex', [$k => $v]);
        return ['msg' => ($k === 'exBuyOn' ? 'Siteden yang alımı ' : 'Siteye satış emri ') . ($v ? 'açıldı.' : 'kapatıldı.'), 'patch' => ['set' => Exchange::publicCfg($db)]];
    }, $S('borsa'));

    $r->put('admin/ex/offmsg', function (Req $q, Db $db) {
        $in = Api::body($q);
        $m = isset($in['msg']) && is_scalar($in['msg']) ? trim((string)$in['msg']) : '';
        if (mb_strlen($m, 'UTF-8') > 300) {
            throw HttpError::validation(['exoff_msg' => 'Mesaj en fazla 300 karakter olabilir.']);
        }
        Exchange::setCfg($db, ['exOffMsg' => $m], Auth::$user['id']);
        return ['msg' => 'Mesaj kaydedildi.', 'patch' => ['set' => Exchange::publicCfg($db)]];
    }, $S('borsa'));

    /* ---------------- ayarlar [borsa_ayar] ---------------- */

    $settingsOut = function (Db $db) use ($fieldsOut) {
        $mail = Settings::get('mail', $db);
        $sms = Settings::get('sms', $db);
        $ev = function ($c, $k, $def) {
            return isset($c['ev'][$k]) ? (bool)$c['ev'][$k] : $def;
        };
        $stock = [];
        foreach ($db->all("SELECT market_id, COALESCE(SUM(left_qty),0) AS n, MIN(price) AS p FROM {ex_offers} WHERE status='aktif' AND left_qty>0 GROUP BY market_id") as $x) {
            $stock[Exchange::xid($x['market_id'])] = ['n' => (int)$x['n'], 'min' => Text::tl($x['p'])];
        }
        return array_merge(['markets' => array_map([Exchange::class, 'presentMarket'], Exchange::markets($db)), 'place' => (string)Exchange::cfg($db)['exPlace'],
            'stock' => (object)$stock,
            'notify' => ['mail' => ['borsa' => $ev($mail, 'borsa', false), 'call' => $ev($mail, 'call', false), 'ep_code' => $ev($mail, 'ep_code', false), 'borsa_off' => $ev($mail, 'borsa_off', false)],
                'sms' => ['borsa' => $ev($sms, 'borsa', false), 'call' => $ev($sms, 'call', false), 'ep_code' => $ev($sms, 'ep_code', false), 'borsa_off' => $ev($sms, 'borsa_off', false)],
                'mailOn' => !empty($mail['on']), 'smsOn' => !empty($sms['on'])]], $fieldsOut($db));
    };
    $r->get('admin/ex/settings', function (Req $q, Db $db) use ($settingsOut) {
        return ['data' => $settingsOut($db)];
    }, $S(['borsa_ayar', 'borsa'], false));

    $setsResp = function (Db $db, $msg) use ($settingsOut) {
        $d = $settingsOut($db);
        return ['msg' => $msg, 'data' => $d, 'patch' => ['replace' => ['exFields' => $d['exFields'], 'exFieldsBuy' => $d['exFieldsBuy'], 'exRules' => $d['exRules']],
            'set' => Exchange::publicCfg($db)]];
    };

    // exrates: {place, markets:[{id, on, server, unit, buy, max, margin}]}
    $r->put('admin/ex/markets', function (Req $q, Db $db) use ($setsResp) {
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($in, $setsResp) {
            $err = [];
            $place = isset($in['place']) && is_scalar($in['place']) ? trim((string)$in['place']) : null;
            if ($place !== null && ($place === '' || mb_strlen($place, 'UTF-8') > 160)) {
                $err['ex_pl'] = 'Teslimat yerini yazın (en fazla 160 karakter).';
            }
            $L = isset($in['markets']) && is_array($in['markets']) ? $in['markets'] : [];
            $seen = [];
            $up = [];
            foreach ($L as $x) {
                if (!is_array($x)) {
                    continue;
                }
                $id = Exchange::parseMarket(isset($x['id']) ? $x['id'] : '');
                $m = Exchange::market($db, $id);
                if (!$m) {
                    throw HttpError::notFound('Borsa satırı bulunamadı.');
                }
                $set = [];
                if (isset($x['server']) && $x['server'] !== '') {
                    $sid = Ids::server($x['server']);
                    if (!$db->val('SELECT id FROM {servers} WHERE id=?', [$sid])) {
                        $err['xr_s_' . Exchange::xid($id)] = 'Server bulunamadı.';
                        continue;
                    }
                    $set['server_id'] = $sid;
                }
                $sid = isset($set['server_id']) ? $set['server_id'] : (int)$m['server_id'];
                if (isset($seen[$sid])) {
                    $err['xr_s_' . Exchange::xid($id)] = 'Bu server birden fazla satırda var.';
                }
                $seen[$sid] = true;
                if (isset($x['unit'])) {
                    $u = trim((string)$x['unit']);
                    $set['unit'] = yp_str($u !== '' ? $u : $m['unit'], 40);
                }
                if (array_key_exists('buy', $x)) {
                    $b = $x['buy'] === null || $x['buy'] === '' ? null : Text::kurus($x['buy']);
                    if ($x['buy'] !== null && $x['buy'] !== '' && ($b === null || $b < 0)) {
                        $err['xr_bp_' . Exchange::xid($id)] = 'Fiyat geçersiz.';
                    }
                    $set['buy'] = $b > 0 ? $b : null;
                }
                if (array_key_exists('max', $x)) {
                    $mx = Text::kurus($x['max']);
                    if ($mx === null || $mx < 0 || $mx > 100000000) {
                        $err['xr_mx_' . Exchange::xid($id)] = 'Tavan fiyat geçersiz.';
                    }
                    $set['max'] = max(0, (int)$mx);
                }
                if (array_key_exists('margin', $x)) {
                    $set['margin_bp'] = $x['margin'] === null || $x['margin'] === '' ? null : max(0, min(10000, Rules::bp($x['margin'])));
                }
                if (array_key_exists('on', $x)) {
                    $set['is_on'] = yp_bool($x['on']) ? 1 : 0;
                }
                $buy = array_key_exists('buy', $set) ? $set['buy'] : $m['buy'];
                if (!empty($set['is_on']) && !$buy) {
                    $set['is_on'] = 0; // fiyatı olmayan satır açılamaz (demo xrApply)
                }
                $up[$id] = $set;
            }
            if ($err) {
                throw HttpError::validation($err);
            }
            foreach ($up as $id => $set) {
                if (isset($set['server_id'])) {
                    $dup = $db->val('SELECT id FROM {ex_markets} WHERE server_id=? AND id<>?', [$set['server_id'], $id]);
                    if ($dup && !isset($up[(int)$dup]['server_id'])) {
                        throw HttpError::validation(['xr_s_' . Exchange::xid($id) => 'Bu server zaten borsada.']);
                    }
                }
            }
            // benzersiz server_id çakışmasın: önce geçici değerler
            foreach ($up as $id => $set) {
                if (isset($set['server_id'])) {
                    $db->update('ex_markets', ['server_id' => -$id], 'id=?', [$id]);
                }
            }
            foreach ($up as $id => $set) {
                $set['updated_at'] = yp_now_ms();
                $db->update('ex_markets', $set, 'id=?', [$id]);
            }
            if ($place !== null) {
                Exchange::setCfg($db, ['exPlace' => yp_str($place, 160)], Auth::$user['id']);
            }
            Audit::log($db, Auth::$user['id'], 'ex_rates', 'ex_market', '', ['n' => count($up), 'place' => $place]);
            return $setsResp($db, 'Borsa fiyatları kaydedildi.');
        });
    }, $S('borsa_ayar'));

    $r->post('admin/ex/markets', function (Req $q, Db $db) use ($setsResp) {
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($in, $setsResp) {
            $sv = null;
            if (isset($in['server']) && $in['server'] !== '') {
                try {
                    $sv = $db->one('SELECT * FROM {servers} WHERE id=?', [Ids::server($in['server'])]);
                } catch (HttpError $e) {
                    $sv = null;
                }
                if (!$sv) {
                    throw HttpError::validation(['xa_srv' => 'Önce server seçin.']);
                }
                if ($db->val('SELECT id FROM {ex_markets} WHERE server_id=?', [(int)$sv['id']])) {
                    throw HttpError::validation(['xa_srv' => $sv['name'] . ' zaten borsada.']);
                }
            } else {
                $sv = $db->one('SELECT * FROM {servers} s WHERE NOT EXISTS (SELECT 1 FROM {ex_markets} m WHERE m.server_id=s.id) ORDER BY s.sec DESC, s.sort, s.id LIMIT 1');
                if (!$sv) {
                    throw HttpError::conflict('Tüm serverlar zaten borsada.');
                }
            }
            $now = yp_now_ms();
            $id = $db->insert('ex_markets', ['server_id' => (int)$sv['id'], 'unit' => $sv['sec'] === 'tr' ? '1 Won' : '100M', 'max' => 1000, 'buy' => null, 'margin_bp' => null,
                'is_on' => 0, 'sort' => (int)$db->val('SELECT COALESCE(MAX(sort),0)+1 FROM {ex_markets}'), 'created_at' => $now, 'updated_at' => $now]);
            Audit::log($db, Auth::$user['id'], 'ex_market_add', 'ex_market', Exchange::xid($id), ['server' => Ids::sv($sv['id'])]);
            return $setsResp($db, $sv['name'] . ' borsaya eklendi. Fiyatını girip açın ve kaydedin.');
        });
    }, $S('borsa_ayar'));

    $r->delete('admin/ex/markets/{id}', function (Req $q, Db $db) use ($setsResp) {
        return $db->tx(function (Db $db) use ($q, $setsResp) {
            $id = Exchange::parseMarket($q->param('id'));
            $m = $db->one('SELECT * FROM {ex_markets} WHERE id=?' . $db->forUpdate(), [$id]);
            if (!$m) {
                throw HttpError::notFound('Borsa satırı bulunamadı.');
            }
            $no = (int)$db->val("SELECT COUNT(*) FROM {ex_orders} WHERE market_id=? AND status IN ('bekliyor','islemde','bilgi','kismen')", [$id]);
            $nf = (int)$db->val("SELECT COUNT(*) FROM {ex_offers} WHERE market_id=? AND status='aktif'", [$id]);
            if ($no || $nf) {
                throw HttpError::conflict('Bu serverda ' . $no . ' açık sipariş ve ' . $nf . ' aktif satış emri var. Önce bunları tamamlayın ya da iptal edin; satırı kapatabilirsiniz.');
            }
            $db->exec('DELETE FROM {ex_markets} WHERE id=?', [$id]);
            Audit::log($db, Auth::$user['id'], 'ex_market_del', 'ex_market', Exchange::xid($id), ['server' => Ids::sv($m['server_id'])]);
            return $setsResp($db, 'Satır silindi.');
        });
    }, $S('borsa_ayar'));

    $setOf = function ($s) {
        $s = (string)$s;
        $map = ['buy' => 'buy', 'sell' => 'sell', 'exFieldsBuy' => 'buy', 'exFields' => 'sell'];
        if (!isset($map[$s])) {
            throw HttpError::notFound('Alan grubu bulunamadı.');
        }
        return $map[$s];
    };

    // exfields: {fields:[{id,label,type,opts,note,req,secret}], rules?}
    $r->put('admin/ex/fields/{set}', function (Req $q, Db $db) use ($setOf, $setsResp) {
        $set = $setOf($q->param('set'));
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($set, $in, $setsResp) {
            $L = isset($in['fields']) && is_array($in['fields']) ? array_values($in['fields']) : [];
            $err = [];
            foreach ($L as $i => $x) {
                if (!is_array($x) || !isset($x['id'])) {
                    continue;
                }
                $f = $db->one('SELECT * FROM {ex_fields} WHERE fset=? AND fkey=?', [$set, (string)$x['id']]);
                if (!$f) {
                    continue;
                }
                $row = ['pos' => $i, 'updated_at' => yp_now_ms()];
                if (isset($x['label'])) {
                    $l = trim((string)$x['label']);
                    if ($l === '' || mb_strlen($l, 'UTF-8') > 120) {
                        $err['f_' . $f['fkey']] = 'Alan adı 1–120 karakter olmalı.';
                    }
                    $row['label'] = yp_str($l, 120);
                }
                if (isset($x['type'])) {
                    $row['type'] = in_array($x['type'], Exchange::TYPES, true) ? $x['type'] : 'text';
                }
                foreach (['opts' => 500, 'note' => 255] as $k => $n) {
                    if (isset($x[$k])) {
                        $row[$k] = yp_str(trim((string)$x[$k]), $n);
                    }
                }
                foreach (['req', 'secret'] as $k) {
                    if (array_key_exists($k, $x)) {
                        $row[$k] = yp_bool($x[$k]) ? 1 : 0;
                    }
                }
                if ((isset($row['type']) ? $row['type'] : $f['type']) === 'select' && trim(isset($row['opts']) ? $row['opts'] : $f['opts']) === '') {
                    $err['f_' . $f['fkey']] = 'Seçenek türündeki alana virgülle ayrılmış seçenekler yazın.';
                }
                $db->update('ex_fields', $row, 'id=?', [(int)$f['id']]);
            }
            if ($err) {
                throw HttpError::validation($err);
            }
            $patch = [];
            if ($set === 'sell' && isset($in['rules']) && is_scalar($in['rules'])) {
                $lines = array_filter(array_map(function ($l) {
                    return yp_str($l, 400);
                }, preg_split('/\R/u', (string)$in['rules'])), 'strlen');
                $patch['rules'] = mb_substr(implode("\n", array_slice($lines, 0, 30)), 0, 4000, 'UTF-8');
            }
            if ($patch) {
                Exchange::setCfg($db, $patch, Auth::$user['id']);
            }
            Audit::log($db, Auth::$user['id'], 'ex_fields', 'ex_fields', $set, ['n' => count($L)]);
            return $setsResp($db, 'Bilgi alanları kaydedildi.');
        });
    }, $S('borsa_ayar'));

    $r->post('admin/ex/fields/{set}', function (Req $q, Db $db) use ($setOf, $setsResp) {
        $set = $setOf($q->param('set'));
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($set, $in, $setsResp) {
            if ((int)$db->val('SELECT COUNT(*) FROM {ex_fields} WHERE fset=?', [$set]) >= 20) {
                throw HttpError::conflict('En fazla 20 alan eklenebilir.');
            }
            $p = $set === 'buy' ? 'b' : 'f';
            $n = 1;
            while ($db->val('SELECT id FROM {ex_fields} WHERE fset=? AND fkey=?', [$set, $p . $n])) {
                $n++;
            }
            $label = isset($in['label']) && trim((string)$in['label']) !== '' ? yp_str(trim((string)$in['label']), 120) : 'Yeni alan';
            $db->insert('ex_fields', ['fset' => $set, 'fkey' => $p . $n, 'label' => $label, 'type' => 'text', 'opts' => '', 'note' => '', 'req' => 0, 'secret' => 0,
                'pos' => (int)$db->val('SELECT COALESCE(MAX(pos),0)+1 FROM {ex_fields} WHERE fset=?', [$set]), 'updated_at' => yp_now_ms()]);
            Audit::log($db, Auth::$user['id'], 'ex_field_add', 'ex_fields', $set, ['key' => $p . $n]);
            return $setsResp($db, 'Alan eklendi.');
        });
    }, $S('borsa_ayar'));

    $r->delete('admin/ex/fields/{set}/{key}', function (Req $q, Db $db) use ($setOf, $setsResp) {
        $set = $setOf($q->param('set'));
        return $db->tx(function (Db $db) use ($set, $q, $setsResp) {
            $n = $db->exec('DELETE FROM {ex_fields} WHERE fset=? AND fkey=?', [$set, $q->param('key')]);
            if (!$n) {
                throw HttpError::notFound('Alan bulunamadı.');
            }
            Audit::log($db, Auth::$user['id'], 'ex_field_del', 'ex_fields', $set, ['key' => $q->param('key')]);
            return $setsResp($db, 'Alan silindi.');
        });
    }, $S('borsa_ayar'));

    $r->post('admin/ex/fields/{set}/{key}/up', function (Req $q, Db $db) use ($setOf, $setsResp) {
        $set = $setOf($q->param('set'));
        return $db->tx(function (Db $db) use ($set, $q, $setsResp) {
            $L = Exchange::fields($db, $set);
            $i = array_search($q->param('key'), array_column($L, 'fkey'), true);
            if ($i === false) {
                throw HttpError::notFound('Alan bulunamadı.');
            }
            if ($i > 0) {
                $tmp = $L[$i - 1];
                $L[$i - 1] = $L[$i];
                $L[$i] = $tmp;
                foreach ($L as $pos => $f) {
                    $db->update('ex_fields', ['pos' => $pos], 'id=?', [(int)$f['id']]);
                }
            }
            return $setsResp($db, 'Sıra güncellendi.');
        });
    }, $S('borsa_ayar'));

    // borsa / EP bildirimleri: {mail:{borsa:true,…}, sms:{call:true,…}} — yalnız bu olay anahtarları değişir
    $r->put('admin/ex/notify', function (Req $q, Db $db) use ($settingsOut) {
        $in = Api::body($q);
        $keys = ['borsa', 'call', 'ep_code', 'borsa_off'];
        foreach (['mail', 'sms'] as $ch) {
            if (!isset($in[$ch]) || !is_array($in[$ch])) {
                continue;
            }
            $c = Settings::get($ch, $db);
            $ev = isset($c['ev']) && is_array($c['ev']) ? $c['ev'] : [];
            foreach ($keys as $k) {
                if (array_key_exists($k, $in[$ch])) {
                    $ev[$k] = yp_bool($in[$ch][$k]);
                }
            }
            $c['ev'] = $ev;
            Settings::set($ch, $c, Auth::$user['id'], $db);
        }
        Audit::log($db, Auth::$user['id'], 'ex_notify', 'settings', 'ev', array_intersect_key($in, ['mail' => 1, 'sms' => 1]));
        return ['msg' => 'Bildirim ayarları kaydedildi.', 'data' => $settingsOut($db)];
    }, $S('borsa_ayar'));
};
