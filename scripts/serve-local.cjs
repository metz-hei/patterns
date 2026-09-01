const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  handleAuthRequest,
  validateSessionToken,
  getToken,
  isPublicPath,
  requestPath,
} = require('./local-auth-api.cjs');

const ROOT = path.join(__dirname, '..', 'build');
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.map': 'application/json',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
}

function resolveStatic(urlPath) {
  if (urlPath === '/login' || urlPath === '/login/') {
    urlPath = '/login.html';
  }
  const safe = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const direct = path.join(ROOT, safe);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return direct;
  }
  if (fs.existsSync(`${direct}.html`) && fs.statSync(`${direct}.html`).isFile()) {
    return `${direct}.html`;
  }
  const indexFile = path.join(direct, 'index.html');
  if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
    return indexFile;
  }
  return null;
}

if (!fs.existsSync(ROOT)) {
  console.error('Нет папки build/. Сначала: npm run build');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = requestPath(req);
  const method = (req.method || 'GET').toUpperCase();

  if (pathname.startsWith('/api/')) {
    await handleAuthRequest(req, res);
    return;
  }

  if (!isPublicPath(pathname, method)) {
    const session = await validateSessionToken(getToken(req));
    if (!session) {
      const returnUrl = encodeURIComponent(url.pathname + url.search + url.hash);
      res.statusCode = 302;
      res.setHeader('Location', `/login.html?return=${returnUrl}`);
      res.end();
      return;
    }
  }

  const filePath = resolveStatic(decodeURIComponent(url.pathname));
  if (filePath) {
    sendFile(res, filePath);
    return;
  }

  const fallback = path.join(ROOT, 'index.html');
  if (fs.existsSync(fallback)) {
    res.statusCode = 404;
    sendFile(res, fallback);
    return;
  }
  res.statusCode = 404;
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}`);
});
