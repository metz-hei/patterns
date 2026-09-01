const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {loadEnv, normalizePassword} = require('./auth-shared.cjs');

function loadEnvFile(filePath, env) {
  if (!fs.existsSync(filePath)) {
    return env;
  }
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

function resolveEnv(remote) {
  if (remote) {
    return loadEnvFile(path.join(__dirname, '..', '.env'), {...process.env});
  }
  return loadEnv();
}

function loadUsersFromTsv(adminLogin) {
  const tsvPath = path.join(__dirname, '..', 'backups', 'users.tsv');
  if (!fs.existsSync(tsvPath)) {
    throw new Error('Нет backups/users.tsv. Добавьте файл с колонками login и password.');
  }

  const seen = new Set();
  const users = [];

  for (const line of fs.readFileSync(tsvPath, 'utf8').trim().split('\n').slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tab = trimmed.indexOf('\t');
    if (tab === -1) {
      throw new Error(`Неверная строка в users.tsv (нужен таб): ${trimmed}`);
    }
    const login = trimmed.slice(0, tab).trim();
    const password = normalizePassword(trimmed.slice(tab + 1));
    if (!login || !password) {
      throw new Error(`Пустой login или password в users.tsv: ${trimmed}`);
    }
    if (seen.has(login)) {
      throw new Error(`Дублирующийся login в users.tsv: ${login}`);
    }
    seen.add(login);
    users.push({
      login,
      password,
      is_admin: login === adminLogin ? 1 : 0,
    });
  }

  if (!users.length) {
    throw new Error('В users.tsv нет пользователей.');
  }

  return users;
}

async function ensureSchema(conn, adminLogin) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      login VARCHAR(255),
      password TEXT NOT NULL,
      is_admin TINYINT(1) NOT NULL DEFAULT 0,
      created_date DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token CHAR(64) PRIMARY KEY,
      user_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      INDEX (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip VARCHAR(45) PRIMARY KEY,
      attempts INT NOT NULL DEFAULT 0,
      locked_until DATETIME NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [columns] = await conn.query('SHOW COLUMNS FROM users');
  const names = columns.map((col) => col.Field);
  if (!names.includes('is_admin')) {
    await conn.query('ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0');
  }

  await conn.query('UPDATE users SET is_admin = 0');
  await conn.query('UPDATE users SET is_admin = 1 WHERE login = ?', [adminLogin]);
}

async function syncUsers(env) {
  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE || 'patterns',
    ssl: false,
  });

  const adminLogin = env.AUTH_ADMIN_LOGIN || 'admin';
  const users = loadUsersFromTsv(adminLogin);

  await ensureSchema(conn, adminLogin);
  await conn.query('DELETE FROM sessions');
  await conn.query('DELETE FROM users');
  await conn.query('INSERT INTO users (login, password, is_admin) VALUES ?', [
    users.map((user) => [user.login, user.password, user.is_admin]),
  ]);

  const [countRows] = await conn.query('SELECT COUNT(*) AS count FROM users');
  await conn.end();

  return {
    database: env.MYSQL_DATABASE || 'patterns',
    count: countRows[0].count,
  };
}

function sqlString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function dumpSyncSql(env) {
  const adminLogin = env.AUTH_ADMIN_LOGIN || 'admin';
  const users = loadUsersFromTsv(adminLogin);
  const values = users
    .map((user) => `(${sqlString(user.login)}, ${sqlString(user.password)}, ${user.is_admin})`)
    .join(',\n');

  return `SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(255),
  password TEXT NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  created_date DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sessions (
  token CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  INDEX (user_id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS login_attempts (
  ip VARCHAR(45) PRIMARY KEY,
  attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SET @exist := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin'
);
SET @sql := IF(@exist = 0, 'ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
DELETE FROM sessions;
DELETE FROM users;
INSERT INTO users (login, password, is_admin) VALUES
${values};
SELECT COUNT(*) AS count FROM users;
`;
}

async function main() {
  const remote = process.argv.includes('--remote');
  const dumpSql = process.argv.includes('--sql');
  const env = resolveEnv(remote || dumpSql);
  if (dumpSql) {
    process.stdout.write(dumpSyncSql(env));
    return;
  }
  const result = await syncUsers(env);
  const target = remote ? 'серверная' : 'локальная';
  process.stdout.write(
    `${target} база ${result.database} обновлена: ${result.count} пользователей из backups/users.tsv.\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {syncUsers, loadUsersFromTsv, ensureSchema};
