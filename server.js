import { loadEnvFiles } from './server/env.js';
loadEnvFiles();

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachRoomWebSocketServer } from './server/wsRooms.js';
import { handleApiRequest } from './server/api.js';
import { applySecurityHeaders } from './server/security.js';
import { getDb } from './server/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendFile(res, filePath, customHeaders = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`);
    const isNoCacheFile =
      filePath.endsWith('index.html') ||
      filePath.endsWith('sw.js') ||
      filePath.endsWith('manifest.webmanifest');

    const cacheControl = isNoCacheFile
      ? 'public, max-age=0, must-revalidate'
      : isHashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': cacheControl,
      ...customHeaders
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // Render health check endpoint
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, service: 'mini-games-crossplay' }));
    return;
  }

  // REST Platform API routes
  if (pathname.startsWith('/api/')) {
    await handleApiRequest(req, res);
    return;
  }

  // Prevent path traversal
  const safeRel = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = path.join(DIST_DIR, safeRel === '/' ? 'index.html' : safeRel);

  if (!candidate.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (pathname === '/sw.js') {
    sendFile(res, candidate, { 'Service-Worker-Allowed': '/' });
    return;
  }

  fs.stat(candidate, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, candidate);
      return;
    }
    // SPA fallback to index.html
    sendFile(res, path.join(DIST_DIR, 'index.html'));
  });
});

getDb();
attachRoomWebSocketServer(server);

server.listen(PORT, HOST, () => {
  console.log(`Mini-Games Crossplay server listening on http://${HOST}:${PORT}`);
});
