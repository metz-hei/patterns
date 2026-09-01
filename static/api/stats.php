<?php
require __DIR__ . '/_bootstrap.php';

require_admin();
$pdo = db();

$stmt = $pdo->query('SELECT COUNT(*) AS count FROM users');
$count = (int)$stmt->fetchColumn();

$stmt2 = $pdo->query('SELECT created_date FROM users ORDER BY created_date DESC LIMIT 1');
$row2 = $stmt2->fetch();
$latest = $row2 ? $row2['created_date'] : null;

send_json(['totalPasswords' => $count, 'latestEntry' => $latest]);
