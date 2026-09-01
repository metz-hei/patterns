<?php
// Shared bootstrap: env, DB, auth helpers

if (!defined('AUTH_BOOTSTRAP_NO_HEADERS')) {
    header('Content-Type: application/json; charset=utf-8');
}

if (getenv('APP_ENV') === 'development') {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
}

const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_SECONDS = 15 * 60;

function load_env_file() {
    $candidates = [
        dirname(__DIR__) . '/.env',
        dirname(__DIR__) . '/private/.env',
        dirname(__DIR__, 2) . '/.env',
        __DIR__ . '/config.local.php',
    ];
    foreach ($candidates as $file) {
        if (!is_file($file)) {
            continue;
        }
        if (substr($file, -4) === '.php') {
            $config = include $file;
            if (!is_array($config)) {
                continue;
            }
            foreach ($config as $key => $value) {
                $key = (string)$key;
                if ($key === '' || getenv($key) !== false) {
                    continue;
                }
                $value = (string)$value;
                putenv("{$key}={$value}");
                $_ENV[$key] = $value;
            }
            continue;
        }
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            continue;
        }
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (strpos($line, '=') === false) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            if ($value !== '' && ($value[0] === '"' || $value[0] === "'")) {
                $value = trim($value, $value[0]);
            }
            if ($key === '') {
                continue;
            }
            if (getenv($key) === false) {
                putenv("{$key}={$value}");
                $_ENV[$key] = $value;
            }
        }
    }
}

load_env_file();

function env_value($key, $default = '') {
    $value = getenv($key);
    if ($value === false || $value === '') {
        return $default;
    }
    return $value;
}

function normalize_password($password) {
    return strtoupper(trim((string)$password));
}

function read_json_body() {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function send_json($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function is_production_env() {
    return env_value('APP_ENV') === 'production' || env_value('NODE_ENV') === 'production';
}

function db() {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = env_value('MYSQL_HOST', 'localhost');
    $port = env_value('MYSQL_PORT', '3306');
    $user = env_value('MYSQL_USER', 'root');
    $pass = env_value('MYSQL_PASSWORD', '');
    $dbName = env_value('MYSQL_DATABASE', 'patterns');

    $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    try {
        $pdo = new PDO($dsn, $user, $pass, $options);
    } catch (PDOException $e) {
        send_json(['error' => 'Не удалось подключиться к базе данных'], 500);
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            login VARCHAR(255),
            password TEXT NOT NULL,
            is_admin TINYINT(1) NOT NULL DEFAULT 0,
            created_date DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS sessions (
            token CHAR(64) PRIMARY KEY,
            user_id INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            INDEX (user_id),
            CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS login_attempts (
            ip VARCHAR(45) PRIMARY KEY,
            attempts INT NOT NULL DEFAULT 0,
            locked_until DATETIME NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    ensure_users_schema($pdo);

    return $pdo;
}

function ensure_users_schema(PDO $pdo) {
    $columns = $pdo->query('SHOW COLUMNS FROM users')->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('is_admin', $columns, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0');
    }
    $adminLogin = env_value('AUTH_ADMIN_LOGIN', 'admin');
    $stmt = $pdo->prepare('UPDATE users SET is_admin = 1 WHERE login = ?');
    $stmt->execute([$adminLogin]);
}

function get_client_ip() {
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($parts[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function check_login_rate_limit(PDO $pdo) {
    $ip = get_client_ip();
    $stmt = $pdo->prepare('SELECT attempts, locked_until FROM login_attempts WHERE ip = ? LIMIT 1');
    $stmt->execute([$ip]);
    $row = $stmt->fetch();
    if ($row && !empty($row['locked_until']) && strtotime($row['locked_until']) > time()) {
        send_json(['success' => false, 'error' => 'Слишком много попыток. Попробуйте позже.'], 429);
    }
}

function record_failed_login(PDO $pdo) {
    $ip = get_client_ip();
    $stmt = $pdo->prepare(
        'INSERT INTO login_attempts (ip, attempts, locked_until) VALUES (?, 1, NULL)
         ON DUPLICATE KEY UPDATE
           attempts = IF(locked_until IS NOT NULL AND locked_until > NOW(), attempts + 1, attempts + 1),
           locked_until = IF(attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? SECOND), locked_until)'
    );
    $stmt->execute([$ip, LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_SECONDS]);
}

function clear_login_attempts(PDO $pdo) {
    $ip = get_client_ip();
    $stmt = $pdo->prepare('DELETE FROM login_attempts WHERE ip = ?');
    $stmt->execute([$ip]);
}

function purge_expired_sessions(PDO $pdo) {
    $pdo->exec('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < NOW()');
}

function get_auth_token_from_request() {
    if (!empty($_COOKIE['authToken'])) {
        return $_COOKIE['authToken'];
    }

    $headers = function_exists('apache_request_headers') ? apache_request_headers() : [];
    $authHeader = '';
    if (isset($headers['Authorization'])) {
        $authHeader = $headers['Authorization'];
    }
    if ($authHeader === '' && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }

    if ($authHeader && stripos($authHeader, 'Bearer ') === 0) {
        return substr($authHeader, 7);
    }

    return null;
}

function find_user_by_access_code(PDO $pdo, $password) {
    $normalized = normalize_password($password);
    $stmt = $pdo->prepare(
        'SELECT id, login, password, is_admin, created_date FROM users WHERE password = ? LIMIT 1'
    );
    $stmt->execute([$normalized]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function validate_session_token($token) {
    if (!$token) {
        return null;
    }

    $pdo = db();
    purge_expired_sessions($pdo);

    $stmt = $pdo->prepare(
        'SELECT s.token, s.expires_at, u.id, u.login, u.is_admin, u.created_date
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
         LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    if (!empty($row['expires_at']) && strtotime($row['expires_at']) < time()) {
        $pdo->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
        return null;
    }

    return [
        'token' => $token,
        'user' => [
            'id' => (int)$row['id'],
            'username' => $row['login'] ?: 'user',
            'is_admin' => (bool)$row['is_admin'],
            'created_date' => $row['created_date'],
        ],
    ];
}

function require_auth() {
    $token = get_auth_token_from_request();
    $session = validate_session_token($token);
    if (!$session) {
        send_json(['error' => 'Unauthorized'], 401);
    }
    return $session;
}

function require_admin() {
    $session = require_auth();
    if (empty($session['user']['is_admin'])) {
        send_json(['error' => 'Forbidden'], 403);
    }
    return $session;
}

function create_session_for_user(PDO $pdo, $userId) {
    $token = bin2hex(random_bytes(32));
    $expiresAt = (new DateTime('+' . SESSION_TTL_SECONDS . ' seconds'))->format('Y-m-d H:i:s');
    $insert = $pdo->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
    $insert->execute([$token, (int)$userId, $expiresAt]);
    return $token;
}

function set_auth_cookie($token) {
    setcookie('authToken', $token, [
        'expires' => time() + SESSION_TTL_SECONDS,
        'path' => '/',
        'secure' => is_production_env(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function clear_auth_cookie() {
    setcookie('authToken', '', [
        'expires' => time() - 3600,
        'path' => '/',
        'secure' => is_production_env(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function invalidate_user_sessions(PDO $pdo, $userId) {
    $stmt = $pdo->prepare('DELETE FROM sessions WHERE user_id = ?');
    $stmt->execute([(int)$userId]);
}
