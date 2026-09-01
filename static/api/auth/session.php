<?php
require dirname(__DIR__) . '/_bootstrap.php';

$session = require_auth();
send_json([
    'authenticated' => true,
    'user' => $session['user'],
]);
