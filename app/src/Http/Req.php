<?php
namespace YP\Http;

if (!defined('YP_APP')) { http_response_code(404); exit; }

/** İstek nesnesi. Gövde JSON (ya da form) olarak okunur, 64 KB sınırı. */
final class Req
{
    public $method;
    public $path;
    public $query;
    public $params = [];
    public $headers = [];
    public $ip;
    private $body;
    private $rawBody;
    /** @var array|null */
    public $route;

    public function __construct($method, $path, array $query = [], $rawBody = null, array $headers = [], $ip = '0.0.0.0')
    {
        $this->method = strtoupper($method);
        $this->path = trim($path, '/');
        $this->query = $query;
        $this->rawBody = $rawBody;
        $this->headers = array_change_key_case($headers, CASE_LOWER);
        $this->ip = $ip;
    }

    public static function fromGlobals()
    {
        $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
        $uri = isset($_SERVER['REQUEST_URI']) ? (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) : '/';
        $path = '';
        $pos = strpos($uri, '/api/v1/');
        if ($pos !== false) {
            $path = substr($uri, $pos + 8);
        } elseif (isset($_GET['r']) && is_string($_GET['r'])) {
            $path = $_GET['r']; // mod_rewrite olmayan sunucular: /api/v1/index.php?r=auth/login
        }
        if ($path === 'index.php' && isset($_GET['r']) && is_string($_GET['r'])) {
            $path = $_GET['r'];
        }
        $path = rawurldecode($path);
        $headers = [];
        foreach ($_SERVER as $k => $v) {
            if (strncmp($k, 'HTTP_', 5) === 0) {
                $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string)$v;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string)$_SERVER['CONTENT_TYPE'];
        }
        if (isset($_SERVER['CONTENT_LENGTH'])) {
            $headers['content-length'] = (string)$_SERVER['CONTENT_LENGTH'];
        }
        $q = $_GET;
        unset($q['r']);
        $r = new self($method, $path, $q, null, $headers, yp_client_ip());
        return $r;
    }

    public function header($name, $default = '')
    {
        $n = strtolower($name);
        return isset($this->headers[$n]) ? $this->headers[$n] : $default;
    }

    public function body()
    {
        if ($this->body !== null) {
            return $this->body;
        }
        $len = (int)$this->header('content-length', '0');
        if ($len > YP_MAX_BODY) {
            throw new HttpError(413, 'İstek çok büyük.', 'too_large');
        }
        $ct = $this->header('content-type');
        $raw = $this->rawBody;
        if ($raw === null && stripos($ct, 'application/json') !== false) {
            $raw = (string)@file_get_contents('php://input', false, null, 0, YP_MAX_BODY + 1);
        }
        if ($raw !== null) {
            if (strlen($raw) > YP_MAX_BODY) {
                throw new HttpError(413, 'İstek çok büyük.', 'too_large');
            }
            if (trim($raw) === '') {
                $this->body = [];
            } else {
                $d = json_decode($raw, true);
                if (!is_array($d)) {
                    throw new HttpError(400, 'İstek gövdesi geçerli bir JSON değil.', 'bad_json');
                }
                $this->body = $d;
            }
        } else {
            $this->body = is_array($_POST) ? $_POST : [];
        }
        return $this->body;
    }

    public function param($k)
    {
        return isset($this->params[$k]) ? $this->params[$k] : null;
    }

    public function q($k, $default = '')
    {
        return isset($this->query[$k]) && is_scalar($this->query[$k]) ? (string)$this->query[$k] : $default;
    }
}
