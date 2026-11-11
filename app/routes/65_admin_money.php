<?php
/**
 * Yönetim › Ödemeler ve finans (PLAN §4 P2). Her değişiklik audit_log'a yazılır.
 *   [odeme]    yükleme kuyruğu, onay/red; ödeme yöntemleri (komisyon, aç/kapat), havale hesapları, kripto ağları
 *   [bakiye]   üye bakiyesi ekleme/düşme (duzeltme kaydı, gerekçe zorunlu)
 *   [kampanya] kuponlar
 *   [ilan]     doping fiyatları
 *   [muhasebe] defter (S.ledger), gelir/havuz özeti, tutarlılık denetimi
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
use YP\Money\Api;
use YP\Money\Deposits;
use YP\Money\IdemTx;
use YP\Money\Jobs;
use YP\Money\Ledger;
use YP\Money\Paytr;
use YP\Money\Rules;
use YP\Money\View;
use YP\Money\Wallet;
use YP\Present;
use YP\Text;
use YP\V;

return function (Router $r) {
    $S = function ($perm, $csrf = true) {
        return ['auth' => 'staff', 'perm' => $perm, 'csrf' => $csrf];
    };
    $actor = function () {
        return Auth::$user;
    };

    /* ---------------- yüklemeler [odeme] ---------------- */

    // ?status=bekliyor|onaylandı|reddedildi|basarisiz|suresi_doldu|tumu &gw= &after=
    $r->get('admin/deposits', function (Req $q, Db $db) {
        $w = ['1=1'];
        $p = [];
        $st = $q->q('status', 'bekliyor');
        if (in_array($st, ['bekliyor', 'onaylandı', 'reddedildi', 'basarisiz', 'suresi_doldu'], true)) {
            $w[] = 'status=?';
            $p[] = $st;
        }
        if ($q->q('gw') !== '' && preg_match('/^[a-z_]{2,20}$/', $q->q('gw'))) {
            $w[] = 'gw=?';
            $p[] = $q->q('gw');
        }
        if ($a = Api::after($q)) {
            $w[] = 'id<?';
            $p[] = $a;
        }
        $lim = Api::limit($q, 50, 100);
        $rows = $db->all('SELECT * FROM {deposits} WHERE ' . implode(' AND ', $w) . ' ORDER BY id DESC LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        return ['data' => [
            'deps' => array_map(function ($d) use ($db) {
                return View::deposit($db, $d, true);
            }, $rows),
            'users' => Catalog::publicUsers($db, array_column($rows, 'user_id')),
            'next' => $more && $rows ? (string)end($rows)['id'] : null,
            'pending' => (int)$db->val("SELECT COUNT(*) FROM {deposits} WHERE status='bekliyor' AND gw IN (SELECT id FROM {gateways} WHERE manual=1)"),
        ]];
    }, $S('odeme', false));

    $r->post('admin/deposits/{id}/approve', function (Req $q, Db $db) use ($actor) {
        $d = $db->tx(function (Db $db) use ($q, $actor) {
            return Deposits::approve($db, $actor(), Deposits::ids($q->param('id')));
        });
        $p = View::deposit($db, $d, true);
        return ['msg' => 'Yükleme onaylandı.', 'data' => ['deposit' => $p], 'patch' => ['upsert' => ['deps' => [$p]]]];
    }, $S('ui:act:dep-ok'));

    $r->post('admin/deposits/{id}/reject', function (Req $q, Db $db) use ($actor) {
        $in = Api::body($q);
        $why = isset($in['reason']) && is_scalar($in['reason']) ? trim((string)$in['reason']) : '';
        $d = $db->tx(function (Db $db) use ($q, $actor, $why) {
            return Deposits::reject($db, $actor(), Deposits::ids($q->param('id')), $why);
        });
        $p = View::deposit($db, $d, true);
        return ['msg' => 'Yükleme reddedildi.', 'data' => ['deposit' => $p], 'patch' => ['upsert' => ['deps' => [$p]]]];
    }, $S('ui:act:dep-no'));

    /* ---------------- bakiye düzeltme [bakiye] ---------------- */

    // {user:'u5'|kullanıcı adı|telefon, amount, w:true (çekilebilir) | false (alışveriş), neg:false, note:'gerekçe'}
    $r->post('admin/balance', function (Req $q, Db $db) use ($actor) {
        $in = Api::body($q);
        $staff = $actor();
        $key = IdemTx::key($q, false);
        return IdemTx::run($db, $staff['id'], $key, 'POST admin/balance', function (Db $db) use ($in, $staff) {
            $U = Wallet::findMember($db, isset($in['user']) ? $in['user'] : '');
            if (!$U) {
                throw HttpError::validation(['user' => 'Bu kullanıcı adı veya telefonla üye bulunamadı.']);
            }
            $amount = Text::kurus(isset($in['amount']) ? $in['amount'] : null);
            $w = isset($in['w']) ? Api::bool($in['w']) : (isset($in['type']) && $in['type'] === 'w');
            $neg = isset($in['neg']) ? Api::bool($in['neg']) : (isset($in['dir']) && $in['dir'] === '-');
            Wallet::adjust($db, $staff, $U, (int)$amount, $w, $neg, isset($in['note']) && is_scalar($in['note']) ? (string)$in['note'] : '');
            $fresh = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$U['id']]);
            $su = Present::staffUser($db, $fresh);
            return ['msg' => $U['name'] . ' (' . trim($U['ad'] . ' ' . $U['soyad']) . '): ' . ($neg ? '−' : '+') . Rules::tl($amount) . ' ' . ($w ? 'çekilebilir' : 'çekilemez') . ' bakiye.',
                'data' => ['user' => $su], 'patch' => ['upsert' => ['users' => [$su]]]];
        });
    }, $S('ui:form:baladd'));

    /* ---------------- kuponlar [kampanya] ---------------- */

    $coupons = function (Db $db) {
        return array_map(function ($c) use ($db) {
            return View::coupon($db, $c);
        }, $db->all('SELECT * FROM {coupons} WHERE deleted_at IS NULL ORDER BY id'));
    };
    $r->get('admin/coupons', function (Req $q, Db $db) use ($coupons) {
        return ['data' => ['coupons' => $coupons($db)]];
    }, $S('kampanya', false));

    $r->post('admin/coupons', function (Req $q, Db $db) use ($coupons, $actor) {
        $in = Api::body($q);
        $code = strtoupper(trim(isset($in['code']) && is_scalar($in['code']) ? (string)$in['code'] : ''));
        if (!preg_match('/^[A-Z0-9_\-]{3,30}$/', $code)) {
            throw HttpError::validation(['code' => 'Kupon kodu 3-30 karakter; harf, rakam, - ve _ olabilir.']);
        }
        $pct = isset($in['pct']) && is_numeric($in['pct']) ? (float)$in['pct'] : 5;
        $max = Text::kurus(isset($in['max']) && $in['max'] !== '' ? $in['max'] : 50);
        if ($pct <= 0 || $pct > 100) {
            throw HttpError::validation(['pct' => 'Yüzde 0-100 arasında olmalı.']);
        }
        if ($max === null || $max <= 0 || $max > 100000000) {
            throw HttpError::validation(['max' => 'En fazla bonus tutarını girin.']);
        }
        if ($db->val('SELECT id FROM {coupons} WHERE code=?', [$code])) {
            throw HttpError::validation(['code' => 'Bu kod zaten var.']);
        }
        $id = $db->insert('coupons', ['code' => $code, 'pct_bp' => Rules::bp($pct), 'max' => $max, 'is_on' => 1, 'uses' => 0, 'created_by' => (int)$actor()['id'], 'created_at' => yp_now_ms()]);
        Audit::log($db, $actor()['id'], 'coupon_add', 'coupon', 'cp' . $id, ['code' => $code, 'pct' => $pct, 'max' => $max]);
        return ['msg' => 'Kupon eklendi.', 'data' => ['coupons' => $coupons($db)], 'patch' => ['replace' => ['coupons' => $coupons($db)]]];
    }, $S('ui:form:coupon'));

    $r->post('admin/coupons/{id}/toggle', function (Req $q, Db $db) use ($coupons, $actor) {
        $id = View::parse($q->param('id'), 'cp', 'Kupon');
        $c = $db->one('SELECT * FROM {coupons} WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$c) {
            throw HttpError::notFound('Kupon bulunamadı.');
        }
        $db->update('coupons', ['is_on' => (int)$c['is_on'] ? 0 : 1], 'id=?', [$id]);
        Audit::log($db, $actor()['id'], 'coupon_toggle', 'coupon', 'cp' . $id, ['on' => !(int)$c['is_on']]);
        return ['msg' => $c['code'] . ((int)$c['is_on'] ? ' pasif edildi.' : ' aktif edildi.'), 'data' => ['coupons' => $coupons($db)], 'patch' => ['replace' => ['coupons' => $coupons($db)]]];
    }, $S('ui:act:cp-toggle'));

    $r->delete('admin/coupons/{id}', function (Req $q, Db $db) use ($coupons, $actor) {
        $id = View::parse($q->param('id'), 'cp', 'Kupon');
        $c = $db->one('SELECT * FROM {coupons} WHERE id=? AND deleted_at IS NULL', [$id]);
        if (!$c) {
            throw HttpError::notFound('Kupon bulunamadı.');
        }
        $db->tx(function (Db $db) use ($c, $id) {
            if ((int)$db->val('SELECT COUNT(*) FROM {coupon_uses} WHERE coupon_id=?', [$id]) || (int)$db->val('SELECT COUNT(*) FROM {deposits} WHERE coupon_id=?', [$id])) {
                // geçmiş kayıtlar korunur; kod yeniden kullanılabilsin diye değiştirilir
                $db->update('coupons', ['deleted_at' => yp_now_ms(), 'is_on' => 0, 'code' => yp_str($c['code'] . '~' . $id, 40)], 'id=?', [$id]);
            } else {
                $db->exec('DELETE FROM {coupons} WHERE id=?', [$id]);
            }
        });
        Audit::log($db, $actor()['id'], 'coupon_del', 'coupon', 'cp' . $id, ['code' => $c['code']]);
        return ['msg' => 'Kupon silindi.', 'data' => ['coupons' => $coupons($db)], 'patch' => ['replace' => ['coupons' => $coupons($db)]]];
    }, $S('ui:act:cp-del'));

    /* ---------------- ödeme yöntemleri [odeme] ---------------- */

    $gws = function (Db $db) {
        return View::gateways($db, true);
    };
    $r->get('admin/gateways', function (Req $q, Db $db) use ($gws) {
        return ['data' => ['gws' => $gws($db), 'paytr' => ['configured' => Paytr::configured(), 'testMode' => (bool)Paytr::testMode()]]];
    }, $S('odeme', false));

    // {gws:[{id, fee, n?, t?, sort?}]}
    $r->put('admin/gateways', function (Req $q, Db $db) use ($gws, $actor) {
        $in = Api::body($q);
        $L = isset($in['gws']) && is_array($in['gws']) ? $in['gws'] : [];
        $changed = [];
        $db->tx(function (Db $db) use ($L, &$changed) {
            foreach ($L as $x) {
                if (!is_array($x) || !isset($x['id']) || !is_string($x['id'])) {
                    continue;
                }
                $g = $db->one('SELECT * FROM {gateways} WHERE id=?', [$x['id']]);
                if (!$g) {
                    throw HttpError::validation(['gws' => 'Ödeme yöntemi bulunamadı: ' . yp_str($x['id'], 20)]);
                }
                $set = ['updated_at' => yp_now_ms()];
                if (isset($x['fee'])) {
                    if (!is_numeric($x['fee']) || (float)$x['fee'] < 0 || (float)$x['fee'] > 50) {
                        throw HttpError::validation(['fee' => 'Hizmet bedeli %0-50 arasında olmalı.']);
                    }
                    $set['fee_bp'] = Rules::bp($x['fee']);
                }
                foreach (['n' => 60, 't' => 120] as $k => $mx) {
                    if (isset($x[$k]) && is_string($x[$k]) && trim($x[$k]) !== '') {
                        $set[$k] = yp_str(trim($x[$k]), $mx);
                    }
                }
                if (isset($x['sort']) && is_numeric($x['sort'])) {
                    $set['sort'] = (int)$x['sort'];
                }
                $db->update('gateways', $set, 'id=?', [$g['id']]);
                $changed[$g['id']] = $set;
            }
        });
        Audit::log($db, $actor()['id'], 'gateways_set', 'settings', 'gateways', ['changed' => $changed]);
        $L = $gws($db);
        return ['msg' => 'Ödeme ayarları kaydedildi.', 'data' => ['gws' => $L], 'patch' => ['replace' => ['gws' => $L]]];
    }, $S('ui:form:gws'));

    $r->post('admin/gateways/{id}/toggle', function (Req $q, Db $db) use ($gws, $actor) {
        $g = $db->one('SELECT * FROM {gateways} WHERE id=?', [(string)$q->param('id')]);
        if (!$g) {
            throw HttpError::notFound('Ödeme yöntemi bulunamadı.');
        }
        $on = (int)$g['is_on'] ? 0 : 1;
        $db->update('gateways', ['is_on' => $on, 'updated_at' => yp_now_ms()], 'id=?', [$g['id']]);
        Audit::log($db, $actor()['id'], 'gateway_toggle', 'gateway', $g['id'], ['on' => (bool)$on]);
        $msg = $g['n'] . ' ' . ($on ? 'aktif' : 'pasif') . ' edildi.';
        if ($on && in_array($g['id'], Deposits::PAYTR_GWS, true) && !Paytr::configured()) {
            $msg .= ' PayTR mağaza bilgileri Entegrasyonlar sayfasından girilene kadar üyelere gösterilmez.';
        }
        $L = $gws($db);
        return ['msg' => $msg, 'data' => ['gws' => $L], 'patch' => ['replace' => ['gws' => $L]]];
    }, $S('ui:act:gw-toggle'));

    /* ---------------- havale hesapları [odeme] ---------------- */

    $banks = function (Db $db) {
        return array_map([View::class, 'bank'], $db->all('SELECT * FROM {banks} ORDER BY sort, id'));
    };
    $r->post('admin/banks', function (Req $q, Db $db) use ($banks, $actor) {
        $v = new V(Api::body($q));
        $b = $v->str('b', 2, 60, null, 'Banka adını yazın.');
        $n = $v->str('n', 2, 120, null, 'Hesap sahibini yazın.');
        $i = $v->str('i', 6, 60, null, 'IBAN ya da hesap numarasını yazın.');
        $v->done();
        $id = $db->insert('banks', ['b' => $b, 'n' => $n, 'iban' => $i, 'sort' => (int)$db->val('SELECT COUNT(*) FROM {banks}'), 'created_at' => yp_now_ms()]);
        Audit::log($db, $actor()['id'], 'bank_add', 'bank', 'bk' . $id, ['b' => $b, 'n' => $n, 'i' => $i]);
        $L = $banks($db);
        return ['msg' => 'Banka hesabı eklendi.', 'data' => ['banks' => $L], 'patch' => ['replace' => ['banks' => $L]]];
    }, $S('ui:form:bank'));

    $r->delete('admin/banks/{id}', function (Req $q, Db $db) use ($banks, $actor) {
        $id = View::parse($q->param('id'), 'bk', 'Banka hesabı');
        $b = $db->one('SELECT * FROM {banks} WHERE id=?', [$id]);
        if (!$b) {
            throw HttpError::notFound('Banka hesabı bulunamadı.');
        }
        $db->exec('DELETE FROM {banks} WHERE id=?', [$id]);
        Audit::log($db, $actor()['id'], 'bank_del', 'bank', 'bk' . $id, ['b' => $b['b'], 'i' => $b['iban']]);
        $L = $banks($db);
        return ['msg' => 'Banka hesabı silindi.', 'data' => ['banks' => $L], 'patch' => ['replace' => ['banks' => $L]]];
    }, $S('ui:act:bank-del'));

    /* ---------------- kripto ağları [odeme] ---------------- */

    $nets = function (Db $db) {
        return array_map([View::class, 'cnet'], $db->all('SELECT * FROM {crypto_nets} ORDER BY sort, id'));
    };
    $cnetIn = function (array $in, $create) {
        $v = new V($in);
        $coin = $v->str('coin', $create ? 2 : 0, 20);
        $net = $v->str('net', $create ? 2 : 0, 60, null, 'Ağ adını yazın (ör. TRC20).');
        $addr = $v->str('addr', $create ? 10 : 0, 200, '/^[A-Za-z0-9:_\-]{10,200}$/', 'Cüzdan adresini kontrol edin.');
        $note = $v->str('note', 0, 200);
        $v->done();
        $row = [];
        foreach (['coin' => $coin === null ? null : strtoupper($coin), 'net' => $net, 'addr' => $addr, 'note' => $note] as $k => $x) {
            if ($x !== null && ($x !== '' || $k === 'note')) {
                $row[$k] = $x;
            }
        }
        return $row;
    };
    $r->get('admin/crypto-nets', function (Req $q, Db $db) use ($nets) {
        return ['data' => ['cryptoNets' => $nets($db)]];
    }, $S('odeme', false));

    $r->post('admin/crypto-nets', function (Req $q, Db $db) use ($nets, $cnetIn, $actor) {
        $row = $cnetIn(Api::body($q), true);
        $id = $db->insert('crypto_nets', $row + ['coin' => 'USDT', 'note' => '', 'is_on' => 1, 'sort' => (int)$db->val('SELECT COUNT(*) FROM {crypto_nets}'), 'created_at' => yp_now_ms()]);
        Audit::log($db, $actor()['id'], 'cnet_add', 'crypto_net', 'cn' . $id, $row);
        $L = $nets($db);
        return ['msg' => 'Ağ eklendi.', 'data' => ['cryptoNets' => $L], 'patch' => ['replace' => ['cryptoNets' => $L]]];
    }, $S('ui:form:cnetadd'));

    $r->put('admin/crypto-nets/{id}', function (Req $q, Db $db) use ($nets, $cnetIn, $actor) {
        $id = View::parse($q->param('id'), 'cn', 'Kripto ağı');
        if (!$db->val('SELECT id FROM {crypto_nets} WHERE id=?', [$id])) {
            throw HttpError::notFound('Kripto ağı bulunamadı.');
        }
        $row = $cnetIn(Api::body($q), false);
        if ($row) {
            $db->update('crypto_nets', $row, 'id=?', [$id]);
        }
        Audit::log($db, $actor()['id'], 'cnet_save', 'crypto_net', 'cn' . $id, $row);
        $L = $nets($db);
        return ['msg' => 'Ağ kaydedildi.', 'data' => ['cryptoNets' => $L], 'patch' => ['replace' => ['cryptoNets' => $L]]];
    }, $S('ui:form:cnetsave'));

    $r->post('admin/crypto-nets/{id}/toggle', function (Req $q, Db $db) use ($nets, $actor) {
        $id = View::parse($q->param('id'), 'cn', 'Kripto ağı');
        $n = $db->one('SELECT * FROM {crypto_nets} WHERE id=?', [$id]);
        if (!$n) {
            throw HttpError::notFound('Kripto ağı bulunamadı.');
        }
        $db->update('crypto_nets', ['is_on' => (int)$n['is_on'] ? 0 : 1], 'id=?', [$id]);
        Audit::log($db, $actor()['id'], 'cnet_toggle', 'crypto_net', 'cn' . $id, ['on' => !(int)$n['is_on']]);
        $L = $nets($db);
        return ['msg' => $n['coin'] . ' · ' . $n['net'] . ((int)$n['is_on'] ? ' pasif' : ' aktif') . ' edildi.', 'data' => ['cryptoNets' => $L], 'patch' => ['replace' => ['cryptoNets' => $L]]];
    }, $S('ui:act:cnet-toggle'));

    $r->delete('admin/crypto-nets/{id}', function (Req $q, Db $db) use ($nets, $actor) {
        $id = View::parse($q->param('id'), 'cn', 'Kripto ağı');
        $n = $db->one('SELECT * FROM {crypto_nets} WHERE id=?', [$id]);
        if (!$n) {
            throw HttpError::notFound('Kripto ağı bulunamadı.');
        }
        $db->exec('DELETE FROM {crypto_nets} WHERE id=?', [$id]);
        Audit::log($db, $actor()['id'], 'cnet_del', 'crypto_net', 'cn' . $id, ['coin' => $n['coin'], 'net' => $n['net'], 'addr' => $n['addr']]);
        $L = $nets($db);
        return ['msg' => 'Ağ silindi.', 'data' => ['cryptoNets' => $L], 'patch' => ['replace' => ['cryptoNets' => $L]]];
    }, $S('ui:act:cnet-del'));

    /* ---------------- dopingler [ilan] ---------------- */

    // {dopings:{vitrin:{desc, p (günlük TL), max}, …}}
    $r->put('admin/dopings', function (Req $q, Db $db) use ($actor) {
        $in = Api::body($q);
        $D = Wallet::setDopings($db, $actor(), isset($in['dopings']) ? $in['dopings'] : $in);
        return ['msg' => 'Doping fiyatları kaydedildi.', 'data' => ['dopings' => $D], 'patch' => ['replace' => ['dopings' => $D]]];
    }, $S('ui:form:dopset'));

    /* ---------------- muhasebe: defter ve özet [muhasebe] ---------------- */

    // ?k=yukleme &u=u5 &from=<ms> &to=<ms> &after=<id> &limit=
    $r->get('admin/ledger', function (Req $q, Db $db) {
        $w = ['1=1'];
        $p = [];
        if (preg_match('/^[a-z_]{2,30}$/', $q->q('k'))) {
            $w[] = 'kind=?';
            $p[] = $q->q('k');
        }
        if ($q->q('u') !== '') {
            $w[] = 'user_id=?';
            $p[] = Ids::user($q->q('u'));
        }
        foreach (['from' => '>=', 'to' => '<'] as $k => $op) {
            if (ctype_digit($q->q($k))) {
                $w[] = 't' . $op . '?';
                $p[] = (int)$q->q($k);
            }
        }
        if ($a = Api::after($q)) {
            $w[] = 'id<?';
            $p[] = $a;
        }
        $lim = Api::limit($q, 100, 500);
        $rows = $db->all('SELECT * FROM {journal} WHERE ' . implode(' AND ', $w) . ' ORDER BY id DESC LIMIT ' . ($lim + 1), $p);
        $more = count($rows) > $lim;
        $rows = array_slice($rows, 0, $lim);
        return ['data' => ['ledger' => array_map([View::class, 'ledgerRow'], $rows), 'users' => Catalog::publicUsers($db, array_column($rows, 'user_id')),
            'next' => $more && $rows ? (string)end($rows)['id'] : null]];
    }, $S('muhasebe', false));

    // Gelirler (S.rev), gelir günlüğü (S.revLog, günlük), havuz (escrowSum), cüzdan toplamları
    $r->get('admin/money/summary', function (Req $q, Db $db) {
        $rev = [];
        foreach (Ledger::balancesLike($db, 'REV:') as $code => $s) {
            $rev[substr($code, 4)] = Text::tl($s);
        }
        $from = ctype_digit($q->q('from')) ? (int)$q->q('from') : yp_now_ms() - 30 * Rules::D;
        $log = [];
        foreach ($db->all("SELECT a.code, p.t, p.amount FROM {postings} p JOIN {accounts} a ON a.id=p.account_id WHERE a.type='revenue' AND p.t>=? ORDER BY p.id", [$from]) as $x) {
            $log[] = ['t' => (int)$x['t'], 'k' => substr($x['code'], 4), 'a' => Text::tl($x['amount'])];
        }
        $w = $db->one('SELECT COALESCE(SUM(cash),0) AS c, COALESCE(SUM(credit),0) AS k FROM {wallets}');
        return ['data' => ['rev' => (object)$rev, 'revLog' => $log, 'escrow' => Text::tl(Ledger::balance($db, 'ESCROW:ORD')),
            'wallets' => ['cash' => Text::tl($w['c']), 'credit' => Text::tl($w['k'])],
            'lastCheck' => $db->one("SELECT last_ok, last_error FROM {cron_runs} WHERE task='ledger_check'")]];
    }, $S('muhasebe', false));

    // Defter tutarlılık denetimini şimdi çalıştır
    $r->post('admin/money/check', function (Req $q, Db $db) use ($actor) {
        $res = Jobs::ledgerCheck($db);
        Audit::log($db, $actor()['id'], 'ledger_check', 'system', 'ledger', ['ok' => $res['ok']]);
        return ['msg' => $res['ok'] ? 'Defter tutarlı.' : 'Defterde tutarsızlık var: ' . count($res['errors']) . ' sorun.', 'data' => $res];
    }, $S('muhasebe'));
};
