<?php
define('AUTH_BOOTSTRAP_NO_HEADERS', true);
require __DIR__ . '/api/_bootstrap.php';

function gate_public_path($path) {
    return $path === '/login.html' || $path === '/login' || $path === '/login/';
}

function gate_request_path() {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (!is_string($uri) || $uri === '') {
        return '/';
    }
    if ($uri !== '/' && substr($uri, -1) === '/') {
        $uri = rtrim($uri, '/');
    }
    return $uri;
}

function gate_redirect_login() {
    $return = $_SERVER['REQUEST_URI'] ?? '/';
    $target = '/login.html';
    if ($return && $return !== '/' && !gate_public_path(parse_url($return, PHP_URL_PATH) ?: '/')) {
        $target .= '?return=' . rawurlencode($return);
    }
    header('Location: ' . $target, true, 302);
    exit;
}

function gate_mime_type($filePath) {
    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $map = [
        'html' => 'text/html; charset=utf-8',
        'js' => 'application/javascript; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'ico' => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf' => 'font/ttf',
        'pdf' => 'application/pdf',
        'map' => 'application/json',
        'txt' => 'text/plain; charset=utf-8',
    ];
    return $map[$ext] ?? 'application/octet-stream';
}

function gate_resolve_file($root, $path) {
    if ($path === '/login' || $path === '/login/') {
        $path = '/login.html';
    }

    $relative = ltrim($path, '/');
    if ($relative === '') {
        $relative = 'index.html';
    }

    $candidate = realpath($root . '/' . $relative);
    $rootReal = realpath($root);
    if ($candidate === false || $rootReal === false || strpos($candidate, $rootReal . DIRECTORY_SEPARATOR) !== 0) {
        if ($relative !== 'index.html') {
            $htmlCandidate = realpath($root . '/' . $relative . '.html');
            if ($htmlCandidate !== false && strpos($htmlCandidate, $rootReal . DIRECTORY_SEPARATOR) === 0 && is_file($htmlCandidate)) {
                return $htmlCandidate;
            }
            $indexCandidate = realpath($root . '/' . $relative . '/index.html');
            if ($indexCandidate !== false && strpos($indexCandidate, $rootReal . DIRECTORY_SEPARATOR) === 0 && is_file($indexCandidate)) {
                return $indexCandidate;
            }
        }
        $fallback = realpath($root . '/index.html');
        if ($fallback !== false && is_file($fallback)) {
            return $fallback;
        }
        return null;
    }

    if (is_file($candidate)) {
        return $candidate;
    }

    $htmlCandidate = realpath($root . '/' . $relative . '.html');
    if ($htmlCandidate !== false && strpos($htmlCandidate, $rootReal . DIRECTORY_SEPARATOR) === 0 && is_file($htmlCandidate)) {
        return $htmlCandidate;
    }

    $indexCandidate = realpath($root . '/' . $relative . '/index.html');
    if ($indexCandidate !== false && strpos($indexCandidate, $rootReal . DIRECTORY_SEPARATOR) === 0 && is_file($indexCandidate)) {
        return $indexCandidate;
    }

    $fallback = realpath($root . '/index.html');
    if ($fallback !== false && is_file($fallback)) {
        return $fallback;
    }

    return null;
}

$path = gate_request_path();
if (gate_public_path($path)) {
    $file = gate_resolve_file(__DIR__, $path);
    if ($file) {
        header('Content-Type: ' . gate_mime_type($file));
        readfile($file);
        exit;
    }
    http_response_code(404);
    echo 'Not Found';
    exit;
}

$session = validate_session_token(get_auth_token_from_request());
if (!$session) {
    gate_redirect_login();
}

$file = gate_resolve_file(__DIR__, $path);
if (!$file) {
    http_response_code(404);
    echo 'Not Found';
    exit;
}

header('Content-Type: ' . gate_mime_type($file));
readfile($file);
