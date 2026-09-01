const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function loadEnv() {
  const env = {...process.env};
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return env;
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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
    if (key && env[key] === undefined) env[key] = value;
  }
  return env;
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

  await conn.query('UPDATE users SET is_admin = 1 WHERE login = ?', [adminLogin]);
}

async function main() {
  const env = loadEnv();
  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST || 'localhost',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE || 'patterns',
  });

  const adminLogin = env.AUTH_ADMIN_LOGIN || 'admin';
  await ensureSchema(conn, adminLogin);
  await conn.query('DELETE FROM sessions');
  await conn.end();

  process.stdout.write('Схема обновлена. Все сессии инвалидированы.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
