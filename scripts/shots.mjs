// Visual inspection helper. Expects a Chromium (Brave/Chrome) already running with:
//   --remote-debugging-port=9222 --load-extension=<repo>/.output/chrome-mv3
// and the harness server on :3456.
//
//   node scripts/shots.mjs [outDir]
//
// Seeds fixture state into the extension, then captures the popup, side panel, and
// settings surfaces at desktop and narrow widths.

import fs from 'node:fs';
import path from 'node:path';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const OUT = path.resolve(process.argv[2] ?? '.impeccable/shots');
const HARNESS = 'http://localhost:3456';

const HOUR = 3_600_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const jwt = (expSeconds) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: 'fixture', exp: expSeconds })).toString('base64url')}.sig`;

const FIXTURE = {
  schemaVersion: 1,
  activeProjectId: 'acme-store',
  activeUserByProject: { 'acme-store': 'u-alice' },
  projects: [
    {
      id: 'acme-store',
      name: 'Acme Store',
      origins: ['http://localhost:3456'],
      tags: [
        { name: 'admin', color: '#c0413a' },
        { name: 'employee', color: '#6e9bea' },
        { name: 'customer', color: '#55b183' },
      ],
      auth: {
        login: {
          method: 'POST',
          url: 'http://localhost:3456/api/auth/login',
          bodyType: 'json',
          headers: { 'Content-Type': 'application/json' },
          body: { email: '{{username}}', password: '{{password}}' },
          extract: { accessToken: { jsonPath: 'token' }, refreshToken: { jsonPath: 'refreshToken' } },
        },
        outputs: [{ kind: 'localStorage', key: 'harness-token', value: '{{accessToken}}' }],
        refresh: {
          method: 'POST',
          url: 'http://localhost:3456/api/auth/refresh',
          bodyType: 'json',
          headers: { 'Content-Type': 'application/json' },
          body: { refreshToken: '{{refreshToken}}' },
          extract: { accessToken: { jsonPath: 'token' }, refreshToken: { jsonPath: 'refreshToken' } },
        },
        session: { ttlMinutes: 30 },
      },
      clear: {
        cookies: 'all',
        localStorage: { mode: 'all', exclude: ['theme'] },
        sessionStorage: 'all',
      },
      reload: 'matching-tabs',
      users: [
        {
          id: 'u-alice',
          name: 'Alice Admin',
          tags: ['admin'],
          cookies: [{ name: 'harness-session', value: 'alice-live', domain: 'localhost', path: '/', hostOnly: true }],
          storage: { 'http://localhost:3456': { localStorage: { 'harness-user': '{"name":"Alice"}' }, sessionStorage: {} } },
          credentials: { username: 'alice@test.local', password: 'alice' },
          session: {
            accessToken: jwt(Math.floor((Date.now() + 20 * 60_000) / 1000)),
            refreshToken: 'r-alice',
            vars: {},
            obtainedAt: iso(-10 * 60_000),
            expiresAt: iso(20 * 60_000),
            source: 'login',
          },
          capturedAt: iso(-2 * HOUR),
          lastUsedAt: iso(-4 * 60_000),
        },
        {
          id: 'u-bob',
          name: 'Bob Employee',
          tags: ['employee'],
          cookies: [{ name: 'harness-session', value: 'bob-old', domain: 'localhost', path: '/', hostOnly: true }],
          storage: {},
          credentials: { username: 'bob@test.local', password: 'bob' },
          session: {
            accessToken: jwt(Math.floor((Date.now() - 5 * 60_000) / 1000)),
            refreshToken: 'r-bob',
            vars: {},
            obtainedAt: iso(-40 * 60_000),
            expiresAt: iso(-5 * 60_000),
            source: 'login',
          },
          capturedAt: iso(-26 * HOUR),
          lastUsedAt: iso(-2 * HOUR),
        },
        {
          id: 'u-carol',
          name: 'Carol Customer',
          tags: ['customer'],
          cookies: [{ name: 'harness-session', value: 'carol', domain: 'localhost', path: '/', hostOnly: true }],
          storage: {},
          credentials: { username: '', password: '' },
          session: { vars: {} },
          capturedAt: iso(-3 * 24 * HOUR),
        },
        {
          id: 'u-dave',
          name: 'Dave Nightshift',
          tags: ['employee'],
          cookies: [{ name: 'harness-session', value: 'dave', domain: 'localhost', path: '/', hostOnly: true }],
          storage: {},
          credentials: { username: 'dave@test.local', password: 'dave' },
          session: { vars: {} },
          capturedAt: iso(-6 * HOUR),
        },
        {
          id: 'u-eve',
          name: 'Eve QA',
          tags: ['admin', 'employee'],
          cookies: [{ name: 'harness-session', value: 'eve', domain: 'localhost', path: '/', hostOnly: true }],
          storage: {},
          credentials: { username: 'eve@test.local', password: 'eve' },
          session: { vars: {} },
          capturedAt: iso(-30 * 60_000),
        },
      ],
    },
    {
      id: 'ledger-api',
      name: 'Ledger API',
      origins: ['http://localhost:8000'],
      tags: [{ name: 'admin', color: '#c0413a' }],
      clear: { cookies: 'all', localStorage: 'all', sessionStorage: 'all' },
      reload: 'matching-tabs',
      users: [],
    },
  ],
};

async function targets() {
  return (await fetch(`${CDP}/json/list`)).json();
}

async function waitFor(fn, label, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  socket.onerror = () => {}; // surface connection loss as a rejected await, not an unhandled 'error'
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.addEventListener('error', () => reject(new Error(`websocket failed for ${wsUrl}`)), { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    } catch {
      // ignore malformed frames
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
      socket.send(JSON.stringify({ id, method, params }));
    });
  return { socket, send };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval failed');
  return result.result.value;
}

fs.mkdirSync(OUT, { recursive: true });

// 1. Seed the fixture through the extension's service worker.
const swTarget = await waitFor(
  async () => (await targets()).find((target) => target.type === 'service_worker' && target.url.includes('background.js')),
  'extension service worker',
);
const sw = await connect(swTarget.webSocketDebuggerUrl);
await evaluate(sw.send, `chrome.storage.local.set({ state: ${JSON.stringify(FIXTURE)} }).then(() => true)`);
console.log('seeded fixture state');

// 2. Make the live session match Alice so detection shows the ACTIVE stamp.
const harnessTab = await waitFor(
  async () => (await targets()).find((target) => target.type === 'page' && target.url.startsWith(HARNESS)),
  'harness page',
);
const harness = await connect(harnessTab.webSocketDebuggerUrl);
await evaluate(harness.send, `document.cookie = 'harness-session=alice-live; path=/'; true`);
console.log('set live cookie matching Alice');

// 3. Capture each surface.
const extensionId = new URL(swTarget.url).host;
const SHOTS = [
  { page: 'popup', width: 400, height: 640 },
  { page: 'sidepanel', width: 420, height: 900 },
  { page: 'options', width: 1280, height: 950 },
  { page: 'options', width: 400, height: 900, suffix: '-narrow' },
];

for (const shot of SHOTS) {
  const response = await fetch(`${CDP}/json/new?chrome-extension://${extensionId}/${shot.page}.html`, { method: 'PUT' });
  const target = await response.json();
  const session = await connect(target.webSocketDebuggerUrl);
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: shot.width,
    height: shot.height,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await waitFor(
    async () =>
      evaluate(session.send, `document.querySelector('[data-ready="1"]') || (document.querySelector('#root') && document.querySelector('#root').children.length > 0 && document.body.innerText.includes('Projects'))`),
    `${shot.page} render`,
    10000,
  );
  await new Promise((resolve) => setTimeout(resolve, 900));
  const capture = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = path.join(OUT, `${shot.page}${shot.suffix ?? ''}.png`);
  fs.writeFileSync(file, Buffer.from(capture.data, 'base64'));
  console.log(`wrote ${file} (${shot.width}x${shot.height})`);
  session.socket.close();
  await fetch(`${CDP}/json/close/${target.id}`);
}

console.log('done');

// 5. Empty-state pass: what a fresh install (or a wiped store) must look like.
await evaluate(sw.send, `chrome.storage.local.set({ state: { schemaVersion: 1, activeProjectId: null, activeUserByProject: {}, projects: [] } }).then(() => true)`);
{
  const response = await fetch(`${CDP}/json/new?chrome-extension://${extensionId}/options.html`, { method: 'PUT' });
  const target = await response.json();
  const session = await connect(target.webSocketDebuggerUrl);
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 950, deviceScaleFactor: 2, mobile: false });
  await waitFor(
    async () => evaluate(session.send, `document.querySelector('#root') && document.querySelector('#root').children.length > 0`),
    'empty options render',
    10000,
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  const capture = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(OUT, 'options-empty.png'), Buffer.from(capture.data, 'base64'));
  console.log(`wrote ${path.join(OUT, 'options-empty.png')}`);
  session.socket.close();
  await fetch(`${CDP}/json/close/${target.id}`);
}
// restore the fixture for the next run
await evaluate(sw.send, `chrome.storage.local.set({ state: ${JSON.stringify(FIXTURE)} }).then(() => true)`);
console.log('empty-state pass done, fixture restored');
