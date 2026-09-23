// Zero-dependency harness server: serves the fake-login page plus a fake auth API
// so auth recipes can be exercised end to end.
//
//   node test-harness/server.mjs [port]      (default 3456)
//
// API:
//   GET  /api/auth/csrf     → { csrfToken } + XSRF-TOKEN cookie
//   POST /api/auth/login    → { token, refreshToken, user } + HttpOnly session cookie (JWT expires in 45s)
//   POST /api/auth/refresh  → new token pair from a refresh token
//   GET  /api/auth/me       → 200 with the user, or 401 when the cookie session is gone

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3456);

const USERS = {
  'alice@test.local': { password: 'alice', name: 'Alice Admin', role: 'admin' },
  'bob@test.local': { password: 'bob', name: 'Bob Employee', role: 'employee' },
};

const sessions = new Map();
const refreshTokens = new Map();
const csrfTokens = new Set();

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const makeJwt = (email, ttlSec) =>
  `eyJhbGciOiJIUzI1NiJ9.${b64url({ sub: email, exp: Math.floor(Date.now() / 1000) + ttlSec })}.harness`;
const random = () => `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(body));
}

function cookiesOf(req) {
  const header = req.headers.cookie ?? '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => {
        const [key, ...rest] = part.trim().split('=');
        return [key, rest.join('=')];
      })
      .filter(([key]) => key),
  );
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => resolve(raw));
  });
}

function parseBody(req, raw) {
  const type = String(req.headers['content-type'] ?? '');
  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return {};
}

function issueSession(email) {
  const sid = random();
  sessions.set(sid, { email, expiresAt: Date.now() + 45_000 });
  const refreshToken = random();
  refreshTokens.set(refreshToken, email);
  return { sid, refreshToken };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const route = url.pathname;

  if (route === '/api/auth/csrf' && req.method === 'GET') {
    const token = random();
    csrfTokens.add(token);
    return sendJson(res, 200, { csrfToken: token }, { 'Set-Cookie': `XSRF-TOKEN=${token}; Path=/; SameSite=Lax` });
  }

  if (route === '/api/auth/login' && req.method === 'POST') {
    const body = parseBody(req, await readBody(req));
    const email = String(body.email ?? body.username ?? '');
    const password = String(body.password ?? '');
    const expected = USERS[email];
    const headerToken = req.headers['x-xsrf-token'];
    if (headerToken && !csrfTokens.has(String(headerToken))) return sendJson(res, 403, { error: 'bad csrf token' });
    if (!expected || expected.password !== password) return sendJson(res, 401, { error: 'bad credentials' });

    const { sid, refreshToken } = issueSession(email);
    return sendJson(
      res,
      200,
      { token: makeJwt(email, 45), refreshToken, user: { email, name: expected.name, role: expected.role } },
      { 'Set-Cookie': `harness-session=${sid}; Path=/; HttpOnly; SameSite=Lax` },
    );
  }

  if (route === '/api/auth/refresh' && req.method === 'POST') {
    const body = parseBody(req, await readBody(req));
    const email = refreshTokens.get(String(body.refreshToken ?? ''));
    if (!email) return sendJson(res, 401, { error: 'bad refresh token' });
    const { sid, refreshToken } = issueSession(email);
    return sendJson(
      res,
      200,
      { token: makeJwt(email, 45), refreshToken },
      { 'Set-Cookie': `harness-session=${sid}; Path=/; HttpOnly; SameSite=Lax` },
    );
  }

  if (route === '/api/auth/me' && req.method === 'GET') {
    const sid = cookiesOf(req)['harness-session'];
    const session = sid ? sessions.get(sid) : null;
    if (!session || session.expiresAt < Date.now()) return sendJson(res, 401, { error: 'unauthenticated' });
    const user = USERS[session.email];
    return sendJson(res, 200, { email: session.email, name: user?.name ?? '', role: user?.role ?? '' });
  }

  if (route.startsWith('/api/')) return sendJson(res, 404, { error: 'not found' });

  const file = route === '/' ? 'index.html' : route.replace(/^\//, '');
  const target = path.join(dir, path.normalize(file));
  if (!target.startsWith(dir)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  try {
    const content = fs.readFileSync(target);
    res.writeHead(200, {
      'Content-Type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`Session Switcher harness on http://localhost:${PORT}`);
  console.log('Users: alice@test.local / alice · bob@test.local / bob — tokens expire after 45s to exercise refresh.');
});
