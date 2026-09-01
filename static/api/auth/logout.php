<?php
require dirname(__DIR__) . '/_bootstrap.php';

$token = get_auth_token_from_request();
if ($token) {
    $pdo = db();
    $stmt = $pdo->prepare('DELETE FROM sessions WHERE token = ?');
    $stmt->execute([$token]);
}

clear_auth_cookie();
send_json(['success' => true, 'message' => 'Выход выполнен']);
