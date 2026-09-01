const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const NAMES = [
  'Смирнов',
  'Головин',
  'Лобанов',
  'Фёдоров',
  'Денисов',
  'Жукова',
  'Климов',
  'Куликов',
  'Поварков',
  'Шаймухаметова',
  'Шурлыгин',
  'Суслов',
  'Тихомирова',
  'Пятиков',
  'Анисимова',
  'Барылов',
  'Наумова',
  'Чесноков',
  'Эстеркин',
  'Симонова',
  'Алексеева',
  'Зигалов',
  'Клементьев',
  'Новикова',
  'Шеметова',
  'Созонтов',
  'Нечаева',
  'Шанаева',
  'Задорина',
  'Паутов',
  'Белова',
  'Коршунова',
  'Белоглазова',
  'Смирнова Марина',
  'Мельников',
  'Лола',
  'Цыганова',
  'Шамин',
  'Скляров',
  'Зыкова',
  'Белкина',
  'Новиков',
  'Смирнова Мария',
  'Денбновецкая',
  'Баринов',
];

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(used) {
  for (;;) {
    let out = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i += 1) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    if (!used.has(out)) {
      used.add(out);
      return out;
    }
  }
}

function normalizePassword(password) {
  return String(password).trim().toUpperCase();
}

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

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const env = loadEnv();
  const adminLogin = env.AUTH_ADMIN_LOGIN || 'admin';
  const adminPassword = env.AUTH_ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('Укажите AUTH_ADMIN_PASSWORD в .env перед запуском seed-users.cjs');
  }

  const used = new Set([normalizePassword(adminPassword)]);
  const users = NAMES.map((login) => ({login, password: generatePassword(used)}));
  const all = [{login: adminLogin, password: normalizePassword(adminPassword), is_admin: 1}, ...users.map((user) => ({...user, is_admin: 0}))];

  const conn = await mysql.createConnection({
    host: env.MYSQL_HOST || 'localhost',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE || 'patterns',
  });

  await conn.query('DELETE FROM sessions');
  await conn.query('DELETE FROM users');
  await conn.query(
    'INSERT INTO users (login, password, is_admin) VALUES ?',
    [all.map((user) => [user.login, user.password, user.is_admin])],
  );
  await conn.end();

  const writeExports = process.argv.includes('--write-exports');
  if (!writeExports) {
    process.stdout.write(
      `Создано пользователей: ${all.length}. Коды не выводятся. Используйте --write-exports для backups/users.tsv.\n`,
    );
    return;
  }

  const insertSql = all
    .map((user) => `  (${sqlString(user.login)}, ${sqlString(user.password)}, ${user.is_admin})`)
    .join(',\n');

  const initSql = `CREATE DATABASE IF NOT EXISTS patterns
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE patterns;

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

DELETE FROM sessions;
DELETE FROM users;
INSERT INTO users (login, password, is_admin) VALUES
${insertSql};
`;

  const backupsDir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(backupsDir, {recursive: true});
  fs.writeFileSync(path.join(backupsDir, 'init-patterns.sql'), initSql);
  fs.writeFileSync(
    path.join(backupsDir, 'users.tsv'),
    ['login\tpassword', ...all.map((user) => `${user.login}\t${user.password}`)].join('\n') + '\n',
  );
  process.stdout.write(`Экспортировано в backups/ для ${all.length} пользователей.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
