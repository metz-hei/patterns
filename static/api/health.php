<?php
// Проверка живости: подтверждает, что PHP отвечает И что БД доступна.
// Используется деплоем как smoke-проверка: статический healthcheck
// (login.html) не замечает недоступную из PHP базу.
require __DIR__ . '/_bootstrap.php';

$pdo = db();
$pdo->query('SELECT 1');

send_json(['ok' => true]);
