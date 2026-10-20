#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const envPath = resolve(projectRoot, '.env.deploy');
const usersPath = resolve(projectRoot, 'backups/users.tsv');
const argumentsList = process.argv.slice(2);
const dryRun = argumentsList.length === 1 && argumentsList[0] === '--dry-run';

if (argumentsList.length > 0 && !dryRun) {
  fail(`неизвестные аргументы: ${argumentsList.join(' ')}`);
}

if (!existsSync(envPath)) {
  fail(`не найден ${envPath}`);
}

if (!existsSync(usersPath)) {
  fail(`не найден ${usersPath}`);
}

const config = parseEnv(readFileSync(envPath, 'utf8'));
const requiredConfig = ['DEPLOY_HOST', 'DEPLOY_PORT', 'DEPLOY_USER', 'DEPLOY_SSH_KEY'];

for (const name of requiredConfig) {
  if (!config[name]) {
    fail(`в ${envPath} не задана переменная ${name}`);
  }
}

if (!/^[A-Za-z0-9._:-]+$/.test(config.DEPLOY_HOST)) {
  fail('недопустимое имя или IP сервера');
}

if (!/^[A-Za-z0-9._-]+$/.test(config.DEPLOY_USER)) {
  fail('недопустимое имя SSH-пользователя');
}

if (!/^\d+$/.test(config.DEPLOY_PORT)) {
  fail('DEPLOY_PORT должен содержать только цифры');
}

const sshKey = isAbsolute(config.DEPLOY_SSH_KEY)
  ? config.DEPLOY_SSH_KEY
  : resolve(projectRoot, config.DEPLOY_SSH_KEY);

if (!existsSync(sshKey)) {
  fail(`не найден SSH-ключ ${sshKey}`);
}

const users = parseUsers(readFileSync(usersPath, 'utf8'));

console.log(`TSV:              ${usersPath}`);
console.log(`База:            patterns`);
console.log(`Сервер:          ${config.DEPLOY_USER}@${config.DEPLOY_HOST}`);
console.log(`Пользователей:   ${users.length}`);

for (const user of users) {
  console.log(`  - ${user.login}`);
}

if (dryRun) {
  console.log('\nТестовый режим: SSH не запускался, база не изменялась.');
  console.log('Формат users.tsv проверен успешно.');
  process.exit(0);
}

const sqlValues = users
  .map(({ login, password }) => `(${sqlText(login)}, ${sqlText(password)})`)
  .join(',\n');

const sql = `
SET NAMES utf8mb4;
CREATE TEMPORARY TABLE deploy_users (
  login VARCHAR(255) NOT NULL PRIMARY KEY,
  password TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO deploy_users (login, password) VALUES
${sqlValues};

START TRANSACTION;

UPDATE users AS current_users
INNER JOIN deploy_users AS imported_users ON imported_users.login = current_users.login
SET current_users.password = imported_users.password;
SET @updated_users = ROW_COUNT();

INSERT INTO users (login, password)
SELECT imported_users.login, imported_users.password
FROM deploy_users AS imported_users
LEFT JOIN users AS current_users ON current_users.login = imported_users.login
WHERE current_users.id IS NULL;
SET @inserted_users = ROW_COUNT();

COMMIT;

SELECT @inserted_users AS inserted, @updated_users AS updated,
       (SELECT COUNT(*) FROM users) AS total_users;
`;

console.log('\nПодключение к MariaDB через SSH...');

const sshArguments = [
  '-i', sshKey,
  '-p', config.DEPLOY_PORT,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15',
  '-o', 'StrictHostKeyChecking=accept-new',
  `${config.DEPLOY_USER}@${config.DEPLOY_HOST}`,
  'mysql', '--batch', '--raw', '--show-warnings', 'patterns',
];

const result = spawnSync('ssh', sshArguments, {
  input: sql,
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.error) {
  fail(`не удалось запустить SSH: ${result.error.message}`);
}

if (result.status !== 0) {
  fail(`обновление базы завершилось с кодом ${result.status}`);
}

console.log('База patterns обновлена успешно.');

function parseEnv(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator < 1) {
      fail(`ошибка в .env.deploy: ${rawLine}`);
    }

    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    parsed[name] = value;
  }

  return parsed;
}

function parseUsers(contents) {
  const rows = [];
  const seenLogins = new Set();
  const seenPasswords = new Set();
  const lines = contents.replace(/^\uFEFF/u, '').split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) {
      continue;
    }

    const columns = lines[index].split('\t');
    if (columns.length !== 2) {
      fail(`users.tsv, строка ${index + 1}: ожидаются два поля, разделённых TAB`);
    }

    const login = columns[0].trim();
    const password = columns[1].trim().toLocaleUpperCase('ru-RU');

    if (!login || !password) {
      fail(`users.tsv, строка ${index + 1}: логин и код доступа не могут быть пустыми`);
    }

    if ([...login].length > 255) {
      fail(`users.tsv, строка ${index + 1}: логин длиннее 255 символов`);
    }

    const normalizedLogin = login.toLocaleLowerCase('ru-RU');
    if (seenLogins.has(normalizedLogin)) {
      fail(`users.tsv, строка ${index + 1}: повторяющийся логин ${login}`);
    }

    if (seenPasswords.has(password)) {
      fail(`users.tsv, строка ${index + 1}: повторяющийся код доступа`);
    }

    seenLogins.add(normalizedLogin);
    seenPasswords.add(password);
    rows.push({ login, password });
  }

  if (rows.length === 0) {
    fail('users.tsv не содержит пользователей');
  }

  return rows;
}

function sqlText(value) {
  const base64 = Buffer.from(value, 'utf8').toString('base64');
  return `CONVERT(FROM_BASE64('${base64}') USING utf8mb4)`;
}

function fail(message) {
  console.error(`Ошибка: ${message}`);
  process.exit(1);
}
