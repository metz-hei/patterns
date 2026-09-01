const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const {
  SESSION_TTL_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_SECONDS,
  normalizePassword,
  isPublicPath,
  loadEnv,
} = require('./auth-shared.cjs');

let pool;

async function ensureSchema(conn) {
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
  const env = loadEnv();
  const adminLogin = env.AUTH_ADMIN_LOGIN || 'admin';
  await conn.query('UPDATE users SET is_admin = 1 WHERE login = ?', [adminLogin]);
}

async function db() {
  if (pool) return pool;
  const env = loadEnv();
  pool = mysql.createPool({
    host: env.MYSQL_HOST || 'localhost',
    port: Number(env.MYSQL_PORT || 3306),
    user: env.MYSQL_USER || 'root',
    password: env.MYSQL_PASSWORD || '',
    database: env.MYSQL_DATABASE || 'patterns',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const conn = await pool.getConnection();
  try {
    await ensureSchema(conn);
  } finally {
    conn.release();
  }
  return pool;
}

function sendJson(res, data, status = 200) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function requestPath(req) {
  const raw = req.originalUrl || req.url || '/';
  return raw.split('?')[0].replace(/\/+$/, '') || '/';
}

function getToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)authToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isLocalRequest(req) {
  const host = String(req.headers.host || '');
  return host.includes('localhost') || host.startsWith('127.0.0.1');
}

function isProductionRequest(req) {
  const env = loadEnv();
  return env.APP_ENV === 'production' || env.NODE_ENV === 'production' || !isLocalRequest(req);
}

function setAuthCookie(req, res, token) {
  const parts = [
    `authToken=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isProductionRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(req, res) {
  const parts = [
    'authToken=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProductionRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '0.0.0.0';
}

async function checkLoginRateLimitForReq(req, database) {
  const ip = getClientIp(req);
  const [rows] = await database.query(
    'SELECT attempts, locked_until FROM login_attempts WHERE ip = ? LIMIT 1',
    [ip],
  );
  const row = rows[0];
  if (row && row.locked_until && new Date(row.locked_until) > new Date()) {
    return false;
  }
  return true;
}

async function recordFailedLogin(req, database) {
  const ip = getClientIp(req);
  await database.query(
    `INSERT INTO login_attempts (ip, attempts, locked_until) VALUES (?, 1, NULL)
     ON DUPLICATE KEY UPDATE
       attempts = IF(locked_until IS NOT NULL AND locked_until > NOW(), attempts + 1, attempts + 1),
       locked_until = IF(attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? SECOND), locked_until)`,
    [ip, LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_SECONDS],
  );
}

async function clearLoginAttempts(req, database) {
  const ip = getClientIp(req);
  await database.query('DELETE FROM login_attempts WHERE ip = ?', [ip]);
}

async function purgeExpiredSessions(database) {
  await database.query('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < NOW()');
}

async function findUserByAccessCode(database, password) {
  const normalized = normalizePassword(password);
  const [rows] = await database.query(
    'SELECT id, login, password, is_admin, created_date FROM users WHERE password = ? LIMIT 1',
    [normalized],
  );
  return rows[0] || null;
}

async function validateSessionToken(token) {
  if (!token) {
    return null;
  }
  const database = await db();
  await purgeExpiredSessions(database);
  const [rows] = await database.query(
    `SELECT s.token, s.expires_at, u.id, u.login, u.is_admin, u.created_date
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ?
     LIMIT 1`,
    [token],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    await database.query('DELETE FROM sessions WHERE token = ?', [token]);
    return null;
  }
  return {
    token,
    user: {
      id: row.id,
      username: row.login || 'user',
      is_admin: Boolean(row.is_admin),
      created_date: row.created_date,
    },
  };
}

async function requireAuth(req, res) {
  const session = await validateSessionToken(getToken(req));
  if (!session) {
    sendJson(res, {error: 'Unauthorized'}, 401);
    return null;
  }
  return session;
}

async function requireAdmin(req, res) {
  const session = await requireAuth(req, res);
  if (!session) {
    return null;
  }
  if (!session.user.is_admin) {
    sendJson(res, {error: 'Forbidden'}, 403);
    return null;
  }
  return session;
}

async function createSessionForUser(database, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await database.query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
    [token, userId, SESSION_TTL_SECONDS],
  );
  return token;
}

async function login(req, res) {
  const body = await readJsonBody(req);
  const password = normalizePassword(body.password);
  if (!password) {
    sendJson(res, {error: 'Пароль обязателен'}, 400);
    return;
  }

  const database = await db();
  const allowed = await checkLoginRateLimitForReq(req, database);
  if (!allowed) {
    sendJson(res, {success: false, error: 'Слишком много попыток. Попробуйте позже.'}, 429);
    return;
  }

  const user = await findUserByAccessCode(database, password);
  if (!user) {
    await recordFailedLogin(req, database);
    sendJson(res, {success: false, error: 'Неверный пароль'}, 401);
    return;
  }

  await clearLoginAttempts(req, database);
  const token = await createSessionForUser(database, user.id);
  setAuthCookie(req, res, token);
  sendJson(res, {success: true, message: 'Успешная авторизация'});
}

async function logout(req, res) {
  const token = getToken(req);
  if (token) {
    const database = await db();
    await database.query('DELETE FROM sessions WHERE token = ?', [token]);
  }
  clearAuthCookie(req, res);
  sendJson(res, {success: true, message: 'Выход выполнен'});
}

async function session(req, res) {
  const auth = await requireAuth(req, res);
  if (!auth) {
    return;
  }
  sendJson(res, {authenticated: true, user: auth.user});
}

async function passwords(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) {
    return;
  }
  const database = await db();
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const [rows] = await database.query(
      'SELECT id, login, is_admin, created_date FROM users ORDER BY created_date DESC',
    );
    sendJson(
      res,
      rows.map((row) => ({
        id: row.id,
        login: row.login,
        is_admin: Boolean(row.is_admin),
        created_date: row.created_date,
      })),
    );
    return;
  }

  if (method === 'POST') {
    const body = await readJsonBody(req);
    const password = normalizePassword(body.password);
    const loginName = body.login ? String(body.login).trim() : null;
    if (!password) {
      sendJson(res, {error: 'Пароль обязателен'}, 400);
      return;
    }
    const [result] = await database.query(
      'INSERT INTO users (password, login) VALUES (?, ?)',
      [password, loginName],
    );
    sendJson(
      res,
      {
        success: true,
        id: result.insertId,
        message: 'Пользователь успешно добавлен',
      },
      201,
    );
    return;
  }

  sendJson(res, {error: 'Method Not Allowed'}, 405);
}

async function stats(req, res) {
  const auth = await requireAdmin(req, res);
  if (!auth) {
    return;
  }
  const database = await db();
  const [countRows] = await database.query('SELECT COUNT(*) AS count FROM users');
  const [latestRows] = await database.query(
    'SELECT created_date FROM users ORDER BY created_date DESC LIMIT 1',
  );
  sendJson(res, {
    totalPasswords: countRows[0].count,
    latestEntry: latestRows[0] ? latestRows[0].created_date : null,
  });
}

async function handleAuthRequest(req, res) {
  const pathname = requestPath(req);
  const method = (req.method || 'GET').toUpperCase();

  try {
    if (
      method === 'POST' &&
      (pathname === '/api/auth/login' ||
        pathname === '/api/auth/login.php' ||
        pathname === '/api/auth_login.php')
    ) {
      await login(req, res);
      return true;
    }
    if (
      method === 'POST' &&
      (pathname === '/api/auth/logout' ||
        pathname === '/api/auth/logout.php' ||
        pathname === '/api/auth_logout.php')
    ) {
      await logout(req, res);
      return true;
    }
    if (
      method === 'GET' &&
      (pathname === '/api/auth/session' || pathname === '/api/auth/session.php')
    ) {
      await session(req, res);
      return true;
    }
    if (pathname === '/api/passwords' || pathname === '/api/passwords.php') {
      await passwords(req, res);
      return true;
    }
    if (pathname === '/api/stats' || pathname === '/api/stats.php') {
      await stats(req, res);
      return true;
    }
    sendJson(res, {error: 'Not Found'}, 404);
    return true;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[auth]', error);
    }
    sendJson(res, {error: 'Не удалось подключиться к базе данных'}, 500);
    return true;
  }
}

function attachAuthMiddleware(app) {
  app.use(async (req, res, next) => {
    const pathname = requestPath(req);
    const method = (req.method || 'GET').toUpperCase();

    if (pathname.startsWith('/api/')) {
      handleAuthRequest(req, res).catch(next);
      return;
    }

    if (isPublicPath(pathname, method)) {
      next();
      return;
    }

    const sessionData = await validateSessionToken(getToken(req));
    if (!sessionData) {
      const returnUrl = encodeURIComponent(req.originalUrl || req.url || '/');
      res.redirect(302, `/login.html?return=${returnUrl}`);
      return;
    }

    next();
  });
}

module.exports = {
  handleAuthRequest,
  attachAuthMiddleware,
  validateSessionToken,
  getToken,
  isPublicPath,
  requestPath,
};
