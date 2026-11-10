<?php
namespace YP\Http;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/**
 * Basit yol eşleyici. Desen: 'admin/staff/{id}'. Seçenekler:
 *   auth  => 'none' | 'user' | 'staff'   (varsayılan: GET için 'none', diğerleri 'user')
 *   perm  => 'uye' | ['uye','ara'] | 'ui:form:staffadd'   (staff rotalarında; PermMap'ten çözülür)
 *   csrf  => bool (varsayılan: GET dışı true)
 *   write => bool  oturuma yazacak mı (giriş/çıkış)
 */
final class Router
{
    private $routes = [];

    public function add($method, $pattern, callable $fn, array $opt = [])
    {
        $method = strtoupper($method);
        $pattern = trim($pattern, '/');
        $rx = '#^' . preg_replace_callback('/\{([a-z_]+)\}/', function ($m) {
            return '(?P<' . $m[1] . '>[A-Za-z0-9_\-]{1,64})';
        }, $pattern) . '$#';
        $opt += [
            'auth'  => $method === 'GET' ? 'none' : 'user',
            'perm'  => null,
            'csrf'  => $method !== 'GET',
            'write' => false,
        ];
        $this->routes[] = ['method' => $method, 'pattern' => $pattern, 'rx' => $rx, 'fn' => $fn, 'opt' => $opt];
        return $this;
    }

    public function get($p, callable $fn, array $o = [])
    {
        return $this->add('GET', $p, $fn, $o);
    }

    public function post($p, callable $fn, array $o = [])
    {
        return $this->add('POST', $p, $fn, $o);
    }

    public function put($p, callable $fn, array $o = [])
    {
        return $this->add('PUT', $p, $fn, $o);
    }

    public function delete($p, callable $fn, array $o = [])
    {
        return $this->add('DELETE', $p, $fn, $o);
    }

    /** @return array [route|null, params, allowedMethods] */
    public function match($method, $path)
    {
        $allowed = [];
        foreach ($this->routes as $r) {
            if (!preg_match($r['rx'], $path, $m)) {
                continue;
            }
            if ($r['method'] !== $method) {
                $allowed[] = $r['method'];
                continue;
            }
            $params = [];
            foreach ($m as $k => $v) {
                if (is_string($k)) {
                    $params[$k] = $v;
                }
            }
            return [$r, $params, []];
        }
        return [null, [], array_values(array_unique($allowed))];
    }

    public function all()
    {
        return $this->routes;
    }

    /** app/routes/NN_*.php dosyalarını yükler; her dosya function (Router $r) {…} döndürür. */
    public static function loadDir($dir = null)
    {
        $r = new self();
        $dir = $dir ?: YP_APP . '/routes';
        $files = glob($dir . '/[0-9][0-9]_*.php') ?: [];
        sort($files, SORT_STRING);
        foreach ($files as $f) {
            $fn = require $f;
            if (is_callable($fn)) {
                $fn($r);
            }
        }
        return $r;
    }
}
