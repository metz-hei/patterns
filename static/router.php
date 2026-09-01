<?php
// Router for PHP built-in server: /api/* via api/*.php, static via gate.php

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (!is_string($uri) || $uri === '') {
    $uri = '/';
}
if ($uri !== '/' && substr($uri, -1) === '/') {
    $uri = rtrim($uri, '/');
}

if (strpos($uri, '/api/') === 0) {
    $path = substr($uri, 5);
    $script = __DIR__ . '/api/' . trim($path, '/');

    if (is_dir($script)) {
        $script = rtrim($script, '/') . '/index.php';
    } elseif (substr($script, -4) !== '.php') {
        $script .= '.php';
    }

    if (is_file($script)) {
        require $script;
        return true;
    }

    header('Content-Type: application/json');
    http_response_code(404);
    echo json_encode(['error' => 'Not Found']);
    return true;
}

require __DIR__ . '/gate.php';
return true;
