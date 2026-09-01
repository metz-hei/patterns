<?php
require __DIR__ . '/_bootstrap.php';

require_admin();
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query(
        'SELECT id, login, is_admin, created_date FROM users ORDER BY created_date DESC'
    );
    $rows = $stmt->fetchAll();
    $safe = array_map(static function ($row) {
        return [
            'id' => (int)$row['id'],
            'login' => $row['login'],
            'is_admin' => (bool)$row['is_admin'],
            'created_date' => $row['created_date'],
        ];
    }, $rows);
    send_json($safe);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = read_json_body();
    $password = normalize_password($body['password'] ?? '');
    $login = isset($body['login']) ? trim((string)$body['login']) : null;
    if ($password === '') {
        send_json(['error' => 'Пароль обязателен'], 400);
    }
    $stmt = $pdo->prepare('INSERT INTO users (password, login) VALUES (?, ?)');
    $stmt->execute([$password, $login]);
    send_json([
        'success' => true,
        'id' => (int)$pdo->lastInsertId(),
        'message' => 'Пользователь успешно добавлен',
    ], 201);
}

send_json(['error' => 'Method Not Allowed'], 405);
