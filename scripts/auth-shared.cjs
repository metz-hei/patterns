const fs = require('fs');
const path = require('path');

const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_SECONDS = 15 * 60;

function normalizePassword(password) {
  return String(password || '').trim().toUpperCase();
}

function isPublicPath(pathname, method = 'GET') {
  if (pathname === '/login.html' || pathname === '/login' || pathname === '/login/') {
    return true;
  }
  if (
    method === 'POST' &&
    (pathname === '/api/auth/login' ||
      pathname === '/api/auth/login.php' ||
      pathname === '/api/auth_login.php')
  ) {
    return true;
  }
  return false;
}

function parseEnvFile(filePath, env) {
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

function loadEnv() {
  const root = path.join(__dirname, '..');
  let env = {...process.env};
  env = parseEnvFile(path.join(root, '.env'), env);
  env = parseEnvFile(path.join(root, '.env.local'), env);
  return env;
}

module.exports = {
  SESSION_TTL_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_SECONDS,
  normalizePassword,
  isPublicPath,
  loadEnv,
};
