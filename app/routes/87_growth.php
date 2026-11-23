<?php
/**
 * Kampanyalar ve büyüme (PLAN §4 P5): şans çarkı (günde bir, sunucuda), çekilişler (ücretsiz bilet, yönetim: oluştur / çek /
 * sil / doğrula) [kampanya], çark ayarları ve hak yenileme [kampanya], VIP seviyeleri ve davet programı [vip],
 * geri kazanım kampanyası [uye] (+ hediye için [bakiye]), üyenin kampanya iletisi tercihi.
 * Açılış verisine (boot): çark ödülleri, bugünkü çevirme, aktif çekilişler + son kazananlar, kampanya iletisi tercihi.
 */
if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Auth;
use YP\Catalog;
use YP\Db;
use YP\Growth\Raffles;
use YP\Growth\Referral;
use YP\Growth\Vip;
use YP\Growth\Wheel;
use YP\Growth\Winback;
use YP\Hooks;
use YP\Http\HttpError;
use YP\Http\Req;
use YP\Http\Router;
use YP\Ids;
use YP\Money\Api;
use YP\Money\IdemTx;
use YP\Money\Rules;
use YP\Present;
use YP\RateLimit;
use YP\Text;

return function (Router $r) {
    /** Herkese açık kampanya dilimi: çark, çekilişler, kazananların herkese açık kaydı */
    $camp = function (Db $db, $u) {
        $rows = Raffles::publicRows($db);
        $out = [
            'wheel' => ['on' => Wheel::on($db), 'prizes' => Wheel::prizes($db)],
            'raffleOn' => Raffles::on($db),
            'raffles' => Raffles::present($db, $rows, $u ? $u['id'] : null),
            'winners' => Catalog::publicUsers($db, array_filter(array_map('intval', array_column($rows, 'winner_id')))),
        ];
        if ($u) {
            $s = Wheel::today($db, $u['id']);
            $out['spin'] = $s ? ['day' => $s['day'], 'idx' => (int)$s['idx'], 'prize' => $s['prize']] : null;
        }
        return $out;
    };
    Hooks::on('boot', function (array $data, Db $db, $u) use ($camp) {
        $c = $camp($db, $u);
        $data['camp'] = $c;
        if ($c['winners']) {
            $data['users'] = array_merge(isset($data['users']) ? $data['users'] : [], array_values($c['winners']));
        }
        if ($u) {
            $data['mkt'] = Winback::prefs($db, $u['id']);
        }
        return $data;
    }, 'growth');

    $S = function ($perm) {
        return ['auth' => 'staff', 'perm' => $perm];
    };
    $meOut = function (Db $db, $uid) {
        return Present::me($db, $db->one('SELECT * FROM {users} WHERE id=?', [(int)$uid]));
    };

    /* ---------------- üye ---------------- */

    $r->get('campaigns', function (Req $q, Db $db) use ($camp) {
        return ['data' => $camp($db, Auth::$user)];
    }, ['auth' => 'none', 'csrf' => false]);

    // Şans çarkı: günde bir (sunucuda), ödül sunucuda seçilir
    $r->post('spin', function (Req $q, Db $db) use ($meOut, $camp) {
        $u = Auth::$user;
        RateLimit::enforce('spin:' . (int)$u['id'], 10, 60, true, 'Çok hızlı deneme. Lütfen biraz bekleyin.');
        return IdemTx::run($db, $u['id'], IdemTx::key($q, false), 'POST spin', function (Db $db) use ($u, $meOut, $camp) {
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $x = Wheel::spin($db, $me);
            $p = $x['prize'];
            $msg = 'Tebrikler! ' . $p['l'] . ' kazandın.' . ($p['k'] === 'bal' ? ' (sadece alışverişte kullanılır)' : ($p['k'] === 'tk' && !$x['tickets'] ? ' Şu an katılabileceğin aktif çekiliş yok.' : ''));
            return ['msg' => $msg, 'data' => ['idx' => $x['idx'], 'prize' => $p, 'credit' => Text::tl($x['credit']), 'pts' => $x['pts'], 'tickets' => $x['tickets'], 'camp' => $camp($db, $me)],
                'patch' => ['me' => $meOut($db, $u['id'])]];
        });
    }, ['auth' => 'user']);

    $r->post('raffles/{id}/free-ticket', function (Req $q, Db $db) use ($camp) {
        $u = Auth::$user;
        return $db->tx(function (Db $db) use ($q, $u, $camp) {
            $rf = Raffles::lock($db, $q->param('id'));
            $me = $db->one('SELECT * FROM {users} WHERE id=?', [(int)$u['id']]);
            $n = Raffles::freeTicket($db, $me, $rf);
            return ['msg' => 'Ücretsiz biletin eklendi. Bol şans!', 'data' => ['tickets' => $n, 'camp' => $camp($db, $me)]];
        });
    }, ['auth' => 'user']);

    $r->get('me/referrals', function (Req $q, Db $db) {
        return ['data' => ['refs' => Referral::mine($db, Auth::$user['id'])]];
    }, ['auth' => 'user', 'csrf' => false]);

    // Kampanya iletisi tercihi: {mail:bool, sms:bool} (true = almak istiyorum)
    $r->put('me/marketing', function (Req $q, Db $db) {
        $p = $db->tx(function (Db $db) use ($q) {
            return Winback::setPrefs($db, Auth::$user['id'], Api::body($q));
        });
        return ['msg' => 'İleti tercihlerin kaydedildi.', 'data' => ['mkt' => $p]];
    }, ['auth' => 'user']);

    /* ---------------- çekilişler & çark [kampanya] ---------------- */

    $admRaffles = function (Db $db) {
        $rows = $db->all('SELECT * FROM {raffles} WHERE deleted_at IS NULL ORDER BY (winner_id IS NULL) DESC, id DESC LIMIT 100');
        $L = Raffles::present($db, $rows, null, true);
        $uids = [];
        foreach ($rows as $x) {
            if ($x['winner_id']) {
                $uids[] = (int)$x['winner_id'];
            }
        }
        $users = [];
        if ($uids) {
            foreach ($db->all('SELECT * FROM {users} WHERE id IN (' . implode(',', array_fill(0, count($uids), '?')) . ')', $uids) as $u) {
                $users[] = array_merge(Present::publicUser($u), ['ad' => $u['ad'], 'soyad' => $u['soyad']]);
            }
        }
        return ['raffles' => $L, 'users' => $users, 'raffleOn' => Raffles::on($db)];
    };
    $r->get('admin/raffles', function (Req $q, Db $db) use ($admRaffles) {
        return ['data' => $admRaffles($db)];
    }, ['auth' => 'staff', 'perm' => 'kampanya', 'csrf' => false]);

    $r->post('admin/raffles', function (Req $q, Db $db) use ($admRaffles) {
        $in = Api::body($q);
        return $db->tx(function (Db $db) use ($in, $admRaffles) {
            $x = Raffles::create($db, Auth::$user, $in);
            return ['msg' => 'Çekiliş başladı.', 'data' => ['raffle' => Raffles::present($db, [$x], null, true)[0]] + $admRaffles($db)];
        });
    }, $S('ui:form:raffle'));

    // Kazananı çek: denetim kaydı, tohum + bilet anlık görüntüsü saklanır
    $r->post('admin/raffles/{id}/draw', function (Req $q, Db $db) use ($admRaffles) {
        $staff = Auth::$user;
        return IdemTx::run($db, $staff['id'], IdemTx::key($q, false), 'POST ' . $q->path, function (Db $db) use ($q, $staff, $admRaffles) {
            $rf = Raffles::lock($db, $q->param('id'));
            list($row, $wu, $meta) = Raffles::draw($db, $staff, $rf);
            return ['msg' => 'Kazanan: ' . $wu['name'], 'data' => ['raffle' => Raffles::present($db, [$row], null, true)[0], 'winner' => Ids::u($wu['id']),
                'draw' => ['seed' => $meta['seed'], 'index' => $meta['index'], 'total' => $meta['total'], 'sha' => $meta['snapshotSha256']]] + $admRaffles($db)];
        });
    }, $S('ui:act:draw'));

    // Çekiliş sonucunu saklanan görüntü + tohumdan yeniden üret
    $r->get('admin/raffles/{id}/verify', function (Req $q, Db $db) {
        $rf = $db->one('SELECT * FROM {raffles} WHERE id=?', [Raffles::parseId($q->param('id'))]);
        if (!$rf) {
            throw HttpError::notFound('Çekiliş bulunamadı.');
        }
        return ['data' => Raffles::verify($rf)];
    }, ['auth' => 'staff', 'perm' => 'kampanya', 'csrf' => false]);

    $r->delete('admin/raffles/{id}', function (Req $q, Db $db) use ($admRaffles) {
        return $db->tx(function (Db $db) use ($q, $admRaffles) {
            $rf = Raffles::lock($db, $q->param('id'));
            Raffles::delete($db, Auth::$user, $rf);
            return ['msg' => 'Çekiliş silindi.', 'data' => $admRaffles($db), 'patch' => ['remove' => ['raffles' => ['r' . $rf['id']]]]];
        });
    }, $S('ui:act:r-del'));

    $r->get('admin/wheel', function (Req $q, Db $db) {
        return ['data' => ['on' => Wheel::on($db), 'raffleOn' => Raffles::on($db), 'prizes' => Wheel::prizes($db), 'gen' => Wheel::gen($db), 'stats' => Wheel::stats($db)]];
    }, ['auth' => 'staff', 'perm' => 'kampanya', 'csrf' => false]);

    // wheelon: {wheelOn?, raffleOn?, prizes?}
    $r->put('admin/settings/wheel', function (Req $q, Db $db) {
        $in = Api::body($q);
        $chg = $db->tx(function (Db $db) use ($in) {
            return Wheel::setCfg($db, Auth::$user, $in);
        });
        $set = [];
        foreach (['wheelOn', 'raffleOn'] as $k) {
            if (array_key_exists($k, $chg)) {
                $set[$k] = $chg[$k];
            }
        }
        $msg = isset($chg['prizes']) ? 'Çark ödülleri kaydedildi.' : (isset($chg['wheelOn']) ? ($chg['wheelOn'] ? 'Şans çarkı açıldı.' : 'Şans çarkı kapatıldı.') : ($chg['raffleOn'] ? 'Çekilişler açıldı.' : 'Çekilişler kapatıldı.'));
        return ['msg' => $msg, 'data' => ['on' => Wheel::on($db), 'raffleOn' => Raffles::on($db), 'prizes' => Wheel::prizes($db)], 'patch' => ['set' => $set]];
    }, $S('ui:chg:wheelon'));

    $r->post('admin/spins/reset', function (Req $q, Db $db) {
        $g = $db->tx(function (Db $db) {
            return Wheel::reset($db, Auth::$user);
        });
        return ['msg' => 'Günlük çark ve ücretsiz bilet hakları yenilendi.', 'data' => ['gen' => $g]];
    }, $S('ui:act:spin-reset'));

    /* ---------------- VIP & davet [vip] ---------------- */

    $r->put('admin/vip', function (Req $q, Db $db) {
        $in = Api::body($q);
        $L = $db->tx(function (Db $db) use ($in) {
            return Vip::set($db, Auth::$user, $in);
        });
        return ['msg' => 'VIP seviyeleri kaydedildi.', 'data' => ['vip' => $L], 'patch' => ['replace' => ['vip' => $L]]];
    }, $S('ui:form:vipset'));

    $r->put('admin/settings/referral', function (Req $q, Db $db) {
        $in = Api::body($q);
        $x = $db->tx(function (Db $db) use ($in) {
            return Referral::set($db, Auth::$user, $in);
        });
        return ['msg' => 'Davet programı kaydedildi.', 'data' => ['ref' => $x], 'patch' => ['set' => $x]];
    }, $S('ui:form:refset'));

    $r->get('admin/referrals', function (Req $q, Db $db) {
        return ['data' => Referral::adminList($db)];
    }, ['auth' => 'staff', 'perm' => 'vip', 'csrf' => false]);

    $r->post('admin/referrals/flags/{id}/seen', function (Req $q, Db $db) {
        $id = Ids::parse($q->param('id'), 'f');
        $n = $db->exec('UPDATE {ref_flags} SET seen=1, seen_by=? WHERE id=?', [(int)Auth::$user['id'], $id]);
        if (!$n) {
            throw HttpError::notFound('İşaret bulunamadı.');
        }
        \YP\Audit::log($db, Auth::$user['id'], 'ref_flag_seen', 'ref_flag', (string)$id);
        return ['msg' => 'İncelendi olarak işaretlendi.', 'data' => Referral::adminList($db)];
    }, ['auth' => 'staff', 'perm' => 'vip']);

    /* ---------------- geri kazan [uye] ---------------- */

    $r->get('admin/winback', function (Req $q, Db $db) {
        $days = (int)$q->q('days', '30');
        $days = in_array($days, [14, 30, 60, 90, 180], true) ? $days : 30;
        $wb = \YP\Settings::get('winback', $db);
        return ['data' => ['days' => $days, 'users' => Winback::inactive($db, $days), 'history' => Winback::history($db),
            'msg' => is_array($wb) && isset($wb['msg']) ? $wb['msg'] : '', 'mailOn' => !empty(\YP\Settings::get('mail', $db)['on']), 'smsOn' => \YP\Sms\Sms::canSend(\YP\Settings::get('sms', $db), 'winback'),
            'canGift' => \YP\Perm::has(Auth::$user, 'bakiye')]];
    }, ['auth' => 'staff', 'perm' => 'uye', 'csrf' => false]);

    $r->post('admin/winback', function (Req $q, Db $db) {
        $staff = Auth::$user;
        $in = Api::body($q);
        RateLimit::enforce('winback:' . (int)$staff['id'], 6, 3600, true, 'Bir saatte en fazla 6 geri kazanım kampanyası gönderilebilir.');
        return IdemTx::run($db, $staff['id'], IdemTx::key($q, false), 'POST admin/winback', function (Db $db) use ($staff, $in) {
            $x = Winback::send($db, $staff, $in);
            $parts = [$x['n'] . ' üyeye gönderildi'];
            if ($x['mail'] || $x['sms']) {
                $parts[] = ($x['mail'] ? $x['mail'] . ' e-posta' : '') . ($x['mail'] && $x['sms'] ? ', ' : '') . ($x['sms'] ? $x['sms'] . ' WhatsApp' : '') . ' sıraya alındı (saatlik sınırla)';
            }
            if ($x['skipped']) {
                $parts[] = $x['skipped'] . ' ileti üyenin tercihi nedeniyle gönderilmedi';
            }
            return ['msg' => implode(' · ', $parts) . '.', 'data' => $x];
        });
    }, $S('ui:form:winback'));
};
