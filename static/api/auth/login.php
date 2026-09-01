<?php
require dirname(__DIR__) . '/_bootstrap.php';

$body = read_json_body();
$password = normalize_password($body['password'] ?? '');
if ($password === '') {
    send_json(['error' => 'Пароль обязателен'], 400);
}

$pdo = db();
check_login_rate_limit($pdo);

$user = find_user_by_access_code($pdo, $password);
if (!$user) {
    record_failed_login($pdo);
    send_json(['success' => false, 'error' => 'Неверный пароль'], 401);
}

clear_login_attempts($pdo);
$token = create_session_for_user($pdo, (int)$user['id']);
set_auth_cookie($token);

send_json([
    'success' => true,
    'message' => 'Успешная авторизация',
]);
