<?php
namespace YP\Growth;

if (!defined('YP_APP')) { http_response_code(404); exit; }

use YP\Audit;
use YP\Db;
use YP\Http\HttpError;
use YP\Ids;

/** Site görselleri (ana sayfa slider'ı): slideadd / slide-toggle / slide-del / slidemedia / slide-clear. [reklam] */
final class Slides
{
    const MAX_MEDIA = 6;

    public static function parseId($v)
    {
        return Ids::parse($v, 'sl');
    }

    public static function lock(Db $db, $ref)
    {
        $s = $db->one('SELECT * FROM {slides} WHERE id=?' . $db->forUpdate(), [self::parseId($ref)]);
        if (!$s) {
            throw HttpError::notFound('Site görseli bulunamadı.');
        }
        return $s;
    }

    private static function media(Db $db, $raw, $slideId = 0)
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return [];
        }
        $L = is_array($raw) ? array_values($raw) : [$raw];
        if (count($L) > self::MAX_MEDIA) {
            throw HttpError::validation(['media' => 'En fazla ' . self::MAX_MEDIA . ' görsel/video ekleyebilirsiniz.']);
        }
        $out = [];
        foreach ($L as $x) {
            try {
                $mid = Ids::media(is_array($x) && isset($x['id']) ? $x['id'] : $x);
            } catch (HttpError $e) {
                throw HttpError::validation(['media' => 'Dosya bulunamadı.']);
            }
            $m = $db->one('SELECT * FROM {media} WHERE id=?', [$mid]);
            if (!$m || $m['kind'] !== 'slide') {
                throw HttpError::validation(['media' => 'Dosya bulunamadı.']);
            }
            if ($m['ref_type'] !== '' && !($m['ref_type'] === 'slide' && (int)$m['ref_id'] === (int)$slideId)) {
                throw HttpError::validation(['media' => 'Bu dosya başka bir kayıtta kullanılıyor.']);
            }
            $out[$mid] = $m;
        }
        return array_values($out);
    }

    private static function attach(Db $db, $id, array $media)
    {
        $pos = (int)$db->val('SELECT COALESCE(MAX(pos)+1,0) FROM {slide_media} WHERE slide_id=?', [(int)$id]);
        foreach ($media as $m) {
            if ($db->val('SELECT 1 FROM {slide_media} WHERE slide_id=? AND media_id=?', [(int)$id, (int)$m['id']])) {
                continue;
            }
            $db->insert('slide_media', ['slide_id' => (int)$id, 'media_id' => (int)$m['id'], 'pos' => $pos++]);
            $db->update('media', ['ref_type' => 'slide', 'ref_id' => (int)$id], 'id=?', [(int)$m['id']]);
        }
    }

    private static function col($c, $def)
    {
        $c = is_string($c) ? strtolower(trim($c)) : '';
        return preg_match('/^#[0-9a-f]{6}$/', $c) ? $c : $def;
    }

    private static function link($l)
    {
        $l = trim(is_scalar($l) ? (string)$l : '');
        if ($l === '') {
            return '';
        }
        if (!preg_match('#^(https?://[^\s<>"\']+|\#[A-Za-z0-9_\-/?=&]+|/[^\s<>"\']*)$#i', $l)) {
            throw HttpError::validation(['link' => 'Bağlantı https://… , /… ya da #… biçiminde olmalı.']);
        }
        return yp_str($l, 255);
    }

    /** slideadd: {title, text, link, btn, c:[c1,c2], media:[…]} */
    public static function create(Db $db, array $staff, array $in)
    {
        $s = function ($k, $max) use ($in) {
            return isset($in[$k]) && is_scalar($in[$k]) ? yp_str(trim((string)$in[$k]), $max) : '';
        };
        $media = self::media($db, isset($in['media']) ? $in['media'] : []);
        $title = $s('title', 80);
        if (!$media && $title === '') {
            throw HttpError::validation(['title' => 'Bir görsel yükleyin veya başlık yazın.']);
        }
        $c = isset($in['c']) && is_array($in['c']) ? array_values($in['c']) : [isset($in['c1']) ? $in['c1'] : '', isset($in['c2']) ? $in['c2'] : ''];
        $now = yp_now_ms();
        $id = $db->insert('slides', [
            'is_on' => 1, 'title' => $title, 'text' => $s('text', 200), 'link' => self::link(isset($in['link']) ? $in['link'] : ''), 'btn' => $s('btn', 40),
            'c1' => self::col(isset($c[0]) ? $c[0] : '', '#121a2a'), 'c2' => self::col(isset($c[1]) ? $c[1] : '', '#b46800'),
            'sort' => (int)$db->val('SELECT COALESCE(MAX(sort),0)+1 FROM {slides}'), 'created_by' => (int)$staff['id'], 'created_at' => $now, 'updated_at' => $now,
        ]);
        self::attach($db, $id, $media);
        Audit::log($db, $staff['id'], 'slide_add', 'slide', 'sl' . $id, ['title' => $title, 'media' => count($media)]);
        return $db->one('SELECT * FROM {slides} WHERE id=?', [$id]);
    }

    public static function toggle(Db $db, array $staff, array $s)
    {
        $db->update('slides', ['is_on' => (int)$s['is_on'] ? 0 : 1, 'updated_at' => yp_now_ms()], 'id=?', [(int)$s['id']]);
        Audit::log($db, $staff['id'], 'slide_toggle', 'slide', 'sl' . $s['id'], ['on' => !(int)$s['is_on']]);
        return $db->one('SELECT * FROM {slides} WHERE id=?', [(int)$s['id']]);
    }

    private static function release(Db $db, $id)
    {
        $mids = array_column($db->all('SELECT media_id FROM {slide_media} WHERE slide_id=?', [(int)$id]), 'media_id');
        $db->exec('DELETE FROM {slide_media} WHERE slide_id=?', [(int)$id]);
        foreach ($mids as $mid) {
            $db->update('media', ['ref_type' => '', 'ref_id' => null], 'id=?', [(int)$mid]);
        }
        return count($mids);
    }

    public static function delete(Db $db, array $staff, array $s)
    {
        self::release($db, $s['id']);
        $db->exec('DELETE FROM {slides} WHERE id=?', [(int)$s['id']]);
        Audit::log($db, $staff['id'], 'slide_delete', 'slide', 'sl' . $s['id'], ['title' => $s['title']]);
    }

    public static function mediaAdd(Db $db, array $staff, array $s, $raw)
    {
        $media = self::media($db, $raw, $s['id']);
        if (!$media) {
            throw HttpError::validation(['media' => 'Dosya seçin.']);
        }
        if ((int)$db->val('SELECT COUNT(*) FROM {slide_media} WHERE slide_id=?', [(int)$s['id']]) + count($media) > self::MAX_MEDIA) {
            throw HttpError::validation(['media' => 'Bir site görselinde en fazla ' . self::MAX_MEDIA . ' dosya olabilir.']);
        }
        self::attach($db, $s['id'], $media);
        Audit::log($db, $staff['id'], 'slide_media_add', 'slide', 'sl' . $s['id'], ['n' => count($media)]);
        return $db->one('SELECT * FROM {slides} WHERE id=?', [(int)$s['id']]);
    }

    public static function mediaClear(Db $db, array $staff, array $s)
    {
        $n = self::release($db, $s['id']);
        Audit::log($db, $staff['id'], 'slide_media_clear', 'slide', 'sl' . $s['id'], ['n' => $n]);
        return $db->one('SELECT * FROM {slides} WHERE id=?', [(int)$s['id']]);
    }

    /** S.slides şekli */
    public static function present(Db $db, array $rows)
    {
        $media = Ads::mediaFor($db, array_column($rows, 'id'), 'slide_media', 'slide_id');
        return array_map(function ($s) use ($media) {
            return ['id' => 'sl' . (int)$s['id'], 'on' => (bool)(int)$s['is_on'], 'title' => $s['title'], 'text' => $s['text'], 'link' => $s['link'], 'btn' => $s['btn'],
                'c' => [$s['c1'] ?: '#121a2a', $s['c2'] ?: '#b46800'], 'media' => isset($media[(int)$s['id']]) ? $media[(int)$s['id']] : []];
        }, $rows);
    }

    public static function all(Db $db, $onlyOn = false)
    {
        return self::present($db, $db->all('SELECT * FROM {slides}' . ($onlyOn ? ' WHERE is_on=1' : '') . ' ORDER BY sort, id LIMIT 50'));
    }
}
