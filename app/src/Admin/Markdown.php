<?php
namespace YP\Admin;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Güvenli, küçük Markdown (rehber yazıları ve yasal sayfalar). Ham HTML hiçbir zaman sayfaya geçmez:
 *   - kayıtta strip(): <script>/<style>/<iframe>… blokları İÇERİKLERİYLE, kalan tüm HTML etiketleri ve yorumları atılır;
 *   - gösterimde html(): metin önce kaçışlanır, yalnız aşağıdaki biçimler etikete dönüşür.
 * Desteklenen: # / ## / ### başlık (sayfada h1 olduğundan # → h2), paragraf (boş satır), - / * madde, 1. numaralı liste,
 * > alıntı, --- çizgi, | tablo |, **kalın**, *eğik*, `kod`, [metin](https://… | /yol | #rota). Bağlantılarda javascript:,
 * data: vb. şemalar reddedilir; dış bağlantılar rel="noopener nofollow" ile yeni sekmede açılır.
 */
final class Markdown
{
    /** İçerikleriyle birlikte atılan etiketler */
    const DROP_BLOCKS = 'script|style|iframe|object|embed|template|noscript|svg|math|xmp|textarea|select|form|frameset|frame|applet|base|link|meta|title|head';

    /** Kayıt öncesi: satır sonlarını düzeltir, kontrol karakterlerini ve tüm HTML'i atar. */
    public static function strip($src, $max = 100000)
    {
        $s = str_replace(["\r\n", "\r"], "\n", (string)$src);
        $s = (string)preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
        if (!mb_check_encoding($s, 'UTF-8')) {
            $s = mb_convert_encoding($s, 'UTF-8', 'UTF-8');
        }
        $s = (string)preg_replace('/<!--[\s\S]*?(-->|$)/', '', $s);
        // tehlikeli bloklar içerikleriyle; kapanmamışsa metnin sonuna kadar
        $s = (string)preg_replace('#<\s*(' . self::DROP_BLOCKS . ')\b[^>]*>[\s\S]*?(<\s*/\s*\1\s*>|$)#i', '', $s);
        $s = (string)preg_replace('#<\s*/?\s*(' . self::DROP_BLOCKS . ')\b[^>]*>#i', '', $s);
        // kalan etiketler (içerik kalır): <b>, <a href=…>, <img onerror=…> …
        $s = (string)preg_replace('#</?[A-Za-z!?][^<>]*>#', '', $s);
        $s = (string)preg_replace("/\n{4,}/", "\n\n\n", $s);
        if (mb_strlen($s, 'UTF-8') > $max) {
            $s = mb_substr($s, 0, $max, 'UTF-8');
        }
        return trim($s, "\n ");
    }

    private static function e($s)
    {
        return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /** Bağlantı adresi güvenli mi? Dönüş: [href, dış mı] ya da null */
    public static function safeHref($u, $map = null)
    {
        $u = trim(html_entity_decode((string)$u, ENT_QUOTES, 'UTF-8'));
        if ($u === '' || preg_match('/[\s<>"\'`]/', $u)) {
            return null;
        }
        if (preg_match('#^https?://[^/\s]+#i', $u)) {
            return filter_var($u, FILTER_VALIDATE_URL) ? [$u, true] : null;
        }
        if (preg_match('#^\#[A-Za-z0-9][A-Za-z0-9_/\-?=&.]*$#', $u)) {
            return [$map ? $map($u) : $u, false];
        }
        if (preg_match('#^/(?!/)[A-Za-z0-9_\-./?=&%]*$#', $u)) {
            return [$u, false];
        }
        if (preg_match('/^mailto:[^\s@]+@[^\s@]+$/i', $u)) {
            return [$u, false];
        }
        return null;
    }

    /** Satır içi biçimler (metin henüz kaçışlanmamış) */
    public static function inline($t, $map = null)
    {
        $links = [];
        // önce bağlantıları yer tutucuya al (adresler kaçışlanmadan doğrulanır)
        $t = preg_replace_callback('/\[([^\]\n]{1,200})\]\(([^)\s]{1,400})\)/u', function ($m) use (&$links, $map) {
            $h = self::safeHref($m[2], $map);
            if (!$h) {
                return $m[1];
            }
            $links[] = [$m[1], $h[0], $h[1]];
            return "\u{E010}" . (count($links) - 1) . "\u{E011}";
        }, (string)$t);
        $t = self::e($t);
        $t = preg_replace('/`([^`\n]{1,200})`/u', '<code>$1</code>', $t);
        $t = preg_replace('/\*\*(?=\S)(.+?)(?<=\S)\*\*/u', '<b>$1</b>', $t);
        $t = preg_replace('/(?<![\*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\*\w])/u', '<i>$1</i>', $t);
        return preg_replace_callback('/\x{E010}(\d+)\x{E011}/u', function ($m) use ($links) {
            $l = $links[(int)$m[1]];
            $txt = preg_replace('/\*\*(?=\S)(.+?)(?<=\S)\*\*/u', '<b>$1</b>', self::e($l[0]));
            return '<a href="' . self::e($l[1]) . '"' . ($l[2] ? ' target="_blank" rel="noopener nofollow"' : '') . '>' . $txt . '</a>';
        }, $t);
    }

    private static function cells($line)
    {
        $l = trim($line);
        $l = preg_replace('/^\||\|$/', '', $l);
        return array_map('trim', explode('|', $l));
    }

    /**
     * Markdown → HTML. $opt: map (iç bağlantı #rota → adres dönüştürücü), h1 ('h2': # başlık h2 olur; varsayılan)
     */
    public static function html($src, array $opt = [])
    {
        $map = isset($opt['map']) ? $opt['map'] : null;
        $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", (string)$src));
        $out = '';
        $para = [];
        $list = null; // 'ul' | 'ol'
        $quote = [];
        $n = count($lines);
        $flushP = function () use (&$para, &$out, $map) {
            if ($para) {
                $out .= '<p>' . implode('<br>', array_map(function ($x) use ($map) {
                    return self::inline($x, $map);
                }, $para)) . '</p>';
                $para = [];
            }
        };
        $flushL = function () use (&$list, &$out) {
            if ($list) {
                $out .= '</' . $list . '>';
                $list = null;
            }
        };
        $flushQ = function () use (&$quote, &$out, $map) {
            if ($quote) {
                $out .= '<blockquote><p>' . implode('<br>', array_map(function ($x) use ($map) {
                    return self::inline($x, $map);
                }, $quote)) . '</p></blockquote>';
                $quote = [];
            }
        };
        for ($i = 0; $i < $n; $i++) {
            $raw = rtrim($lines[$i]);
            $t = trim($raw);
            if ($t === '') {
                $flushP();
                $flushL();
                $flushQ();
                continue;
            }
            if (preg_match('/^(#{1,3})\s+(.+)$/u', $t, $m)) {
                $flushP();
                $flushL();
                $flushQ();
                $lv = strlen($m[1]) === 3 ? 'h3' : 'h2';
                $out .= '<' . $lv . '>' . self::inline(rtrim($m[2], " #"), $map) . '</' . $lv . '>';
                continue;
            }
            if (preg_match('/^(-{3,}|\*{3,}|_{3,})$/', $t)) {
                $flushP();
                $flushL();
                $flushQ();
                $out .= '<hr>';
                continue;
            }
            if ($t[0] === '|' && substr_count($t, '|') >= 2) {
                $flushP();
                $flushL();
                $flushQ();
                $rows = [];
                while ($i < $n && ($x = trim($lines[$i])) !== '' && $x[0] === '|') {
                    $rows[] = $x;
                    $i++;
                }
                $i--;
                $head = null;
                if (count($rows) >= 2 && preg_match('/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/', $rows[1])) {
                    $head = self::cells($rows[0]);
                    array_splice($rows, 0, 2);
                }
                $tb = '<div class="md-tbl"><table>';
                if ($head && implode('', $head) !== '') {
                    $tb .= '<thead><tr>' . implode('', array_map(function ($c) use ($map) {
                        return '<th>' . self::inline($c, $map) . '</th>';
                    }, $head)) . '</tr></thead>';
                }
                $tb .= '<tbody>';
                foreach ($rows as $r) {
                    $tb .= '<tr>' . implode('', array_map(function ($c) use ($map) {
                        return '<td>' . self::inline($c, $map) . '</td>';
                    }, self::cells($r))) . '</tr>';
                }
                $out .= $tb . '</tbody></table></div>';
                continue;
            }
            if (preg_match('/^>\s?(.*)$/u', $t, $m)) {
                $flushP();
                $flushL();
                $quote[] = $m[1];
                continue;
            }
            $kind = null;
            if (preg_match('/^[-*]\s+(.+)$/u', $t, $m)) {
                $kind = 'ul';
                $txt = $m[1];
            } elseif (preg_match('/^\d{1,3}[.)]\s+(.+)$/u', $t, $m)) {
                $kind = 'ol';
                $txt = $m[1];
            }
            if ($kind) {
                $flushP();
                $flushQ();
                if ($list !== $kind) {
                    $flushL();
                    $out .= '<' . $kind . '>';
                    $list = $kind;
                }
                $out .= '<li>' . self::inline($txt, $map) . '</li>';
                continue;
            }
            $flushL();
            $flushQ();
            $para[] = $t;
        }
        $flushP();
        $flushL();
        $flushQ();
        return $out;
    }

    /** Düz metin (özet, meta açıklama): biçim işaretleri atılır */
    public static function text($src, $max = 300)
    {
        $s = (string)$src;
        $s = preg_replace('/\[([^\]]+)\]\([^)]*\)/u', '$1', $s);
        $s = preg_replace('/^\s*(#{1,3}|>|[-*]|\d+[.)])\s+/mu', '', $s);
        $s = preg_replace('/^\s*\|?\s*:?-{2,}.*$/mu', '', $s);
        $s = str_replace(['**', '`', '|'], ['', '', ' '], $s);
        $s = trim(preg_replace('/\s+/u', ' ', $s));
        return \YP\Text::cut($s, $max);
    }
}
