#!/usr/bin/env node
// Capture README screenshots, store 1280x800 shots, and a short demo GIF.
// Requires Chromium on CDP_URL with the unpacked extension loaded, and the
// harness on http://localhost:3456.
//
//   node scripts/capture-launch-assets.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const HARNESS = 'http://localhost:3456';
const docsAssets = path.join(root, 'docs/assets');
const storeDir = path.join(root, 'store');
const framesDir = path.join(root, '.output/demo-frames');
fs.mkdirSync(docsAssets, { recursive: true });
fs.mkdirSync(storeDir, { recursive: true });
fs.mkdirSync(framesDir, { recursive: true });

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
      clear: {
        cookies: 'all',
        localStorage: { mode: 'all', exclude: ['harness-theme'] },
        sessionStorage: 'all',
      },
      reload: 'matching-tabs',
      users: [
        {
          id: 'u-alice',
          name: 'Alice Admin',
          tags: ['admin'],
          cookies: [{ name: 'harness-session', value: 'Alice Admin', path: '/', hostOnly: true }],
          storage: {
            'http://localhost:3456': {
              localStorage: {
                'harness-user': '{"name":"Alice Admin","role":"Admin"}',
                'harness-theme': 'dark',
              },
              sessionStorage: {},
            },
          },
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
          cookies: [{ name: 'harness-session', value: 'Bob Employee', path: '/', hostOnly: true }],
          storage: {
            'http://localhost:3456': {
              localStorage: { 'harness-user': '{"name":"Bob Employee","role":"Employee"}' },
              sessionStorage: {},
            },
          },
          credentials: { username: 'bob@test.local', password: 'bob' },
          session: { vars: {} },
          capturedAt: iso(-26 * HOUR),
        },
        {
          id: 'u-carol',
          name: 'Carol Customer',
          tags: ['customer'],
          cookies: [{ name: 'harness-session', value: 'Carol Customer', path: '/', hostOnly: true }],
          storage: {
            'http://localhost:3456': {
              localStorage: { 'harness-user': '{"name":"Carol Customer","role":"Customer"}' },
              sessionStorage: {},
            },
          },
          credentials: { username: '', password: '' },
          session: { vars: {} },
          capturedAt: iso(-3 * 24 * HOUR),
        },
      ],
    },
  ],
};

async function targets() {
  return (await fetch(`${CDP}/json/list`)).json();
}

async function waitFor(fn, label, timeoutMs = 25000) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  socket.onerror = () => {};
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
      // ignore
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (message) => {
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable').catch(() => {});
  return { socket, send };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval failed');
  return result.result.value;
}

async function screenshot(send, file) {
  const capture = await Promise.race([
    send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`screenshot timed out for ${file}`)), 8000)),
  ]);
  fs.writeFileSync(file, Buffer.from(capture.data, 'base64'));
  console.log('wrote', file);
}

async function browserSend(method, params = {}) {
  const version = await (await fetch(`${CDP}/json/version`)).json();
  const session = await connect(version.webSocketDebuggerUrl);
  try {
    return await session.send(method, params);
  } finally {
    session.socket.close();
  }
}

async function openPage(url, { width, height, dsf = 2 } = {}) {
  const response = await fetch(`${CDP}/json/new?${url}`, { method: 'PUT' });
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error(`json/new failed for ${url}: ${JSON.stringify(target)}`);
  const session = await connect(target.webSocketDebuggerUrl);
  await session.send('Page.enable').catch(() => {});
  if (width && height) {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dsf,
      mobile: false,
    });
  }
  return { target, session };
}

function padTo(src, dest, width, height) {
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      src,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:#0a0d0b`,
      '-frames:v',
      '1',
      '-update',
      '1',
      dest,
    ],
    { stdio: 'inherit' },
  );
}

// 1. Find / wake the service worker.
let swTarget = (await targets()).find((target) => target.type === 'service_worker' && target.url.includes('background.js'));
if (!swTarget) {
  const extPage = (await targets()).find((target) => target.url.startsWith('chrome-extension://') && target.url.includes('popup.html'));
  const extId = extPage ? new URL(extPage.url).host : process.env.EXT_ID;
  if (!extId) throw new Error('extension not loaded (no service worker, no popup, no EXT_ID)');
  await openPage(`chrome-extension://${extId}/popup.html`, { width: 400, height: 640 });
  swTarget = await waitFor(
    async () => (await targets()).find((target) => target.type === 'service_worker' && target.url.includes('background.js')),
    'service worker',
  );
}
const sw = await connect(swTarget.webSocketDebuggerUrl);
const extensionId = new URL(swTarget.url).host;
console.log('extension', extensionId);
await evaluate(sw.send, `chrome.storage.local.set({ state: ${JSON.stringify(FIXTURE)} }).then(() => true)`);
console.log('seeded fixture');

// 2. Harness tab
let harnessTarget = (await targets()).find((target) => target.type === 'page' && target.url.startsWith(HARNESS));
if (!harnessTarget) {
  const opened = await openPage(HARNESS, { width: 960, height: 720, dsf: 1 });
  harnessTarget = opened.target;
}
async function connectHarness() {
  const target = await waitFor(
    async () => (await targets()).find((entry) => entry.type === 'page' && entry.url.startsWith(HARNESS)),
    'harness page',
  );
  const session = await connect(target.webSocketDebuggerUrl);
  await session.send('Page.enable').catch(() => {});
  return session;
}

let harness = await connectHarness();
await evaluate(
  harness.send,
  `(function () {
    document.cookie = 'harness-session=' + encodeURIComponent('Alice Admin') + '; path=/';
    localStorage.setItem('harness-user', JSON.stringify({ name: 'Alice Admin', role: 'Admin' }));
    localStorage.setItem('harness-theme', 'dark');
    if (typeof render === 'function') render();
    else location.reload();
    return true;
  })()`,
);
await new Promise((resolve) => setTimeout(resolve, 600));
console.log('harness as Alice');

// 3. README / store screenshots of popup + options
const popup = await openPage(`chrome-extension://${extensionId}/popup.html`, { width: 400, height: 640, dsf: 2 });
await waitFor(
  async () =>
    evaluate(
      popup.session.send,
      `Boolean(document.querySelector('[data-ready="1"]') || (document.querySelector('#root') && document.body.innerText.includes('Alice')))`,
    ),
  'popup render',
);
await new Promise((resolve) => setTimeout(resolve, 500));
const popupPng = path.join(docsAssets, 'popup.png');
await screenshot(popup.session.send, popupPng);

const options = await openPage(`chrome-extension://${extensionId}/options.html`, { width: 1280, height: 800, dsf: 2 });
await waitFor(
  async () =>
    evaluate(options.session.send, `Boolean(document.querySelector('#root') && document.body.innerText.includes('Projects'))`),
  'options render',
);
await new Promise((resolve) => setTimeout(resolve, 700));
const optionsPng = path.join(docsAssets, 'options.png');
await screenshot(options.session.send, optionsPng);

padTo(popupPng, path.join(storeDir, 'screenshot-popup-1280x800.png'), 1280, 800);
padTo(optionsPng, path.join(storeDir, 'screenshot-options-1280x800.png'), 1280, 800);

// 4. Demo frames: harness + popup, Alice -> Carol -> Alice.
// Reconnect the harness session every shot — Page.captureScreenshot hangs on a
// websocket that survived a tab reload.
async function grabPair(name) {
  const harnessFile = path.join(framesDir, `${name}-harness.png`);
  const popupFile = path.join(framesDir, `${name}-popup.png`);
  harness = await connectHarness();
  await screenshot(harness.send, harnessFile);
  try {
    await screenshot(popup.session.send, popupFile);
  } catch (error) {
    console.warn('popup screenshot failed, reusing README popup', error.message);
    fs.copyFileSync(popupPng, popupFile);
  }
  const out = path.join(framesDir, `${name}.png`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      harnessFile,
      '-i',
      popupFile,
      '-filter_complex',
      "[0:v]scale=780:540:force_original_aspect_ratio=decrease,pad=780:540:(ow-iw)/2:(oh-ih)/2:#0a0d0b[h];[1:v]crop=w='if(gt(iw\\,600)\\,min(420\\,iw)\\,iw)':h='if(gt(iw\\,600)\\,min(700\\,ih)\\,ih)':x=0:y=0,scale=300:540:force_original_aspect_ratio=decrease,pad=300:540:(ow-iw)/2:(oh-ih)/2:#0a0d0b[p];[h][p]hstack=inputs=2",
      '-frames:v',
      '1',
      '-update',
      '1',
      out,
    ],
    { stdio: 'inherit' },
  );
  return out;
}

await grabPair('01-alice');

await evaluate(
  popup.session.send,
  `(async () => {
    const res = await chrome.runtime.sendMessage({ type: 'switchUser', projectId: 'acme-store', userId: 'u-carol' });
    return res;
  })()`,
);
await waitFor(async () => {
  try {
    harness = await connectHarness();
    const text = await evaluate(harness.send, `document.body.innerText`);
    return text.includes('Carol Customer') ? text : null;
  } catch {
    return null;
  }
}, 'harness Carol');
await new Promise((resolve) => setTimeout(resolve, 400));
await grabPair('02-carol');

await evaluate(
  popup.session.send,
  `(async () => {
    const res = await chrome.runtime.sendMessage({ type: 'switchUser', projectId: 'acme-store', userId: 'u-alice' });
    return res;
  })()`,
);
await waitFor(async () => {
  try {
    harness = await connectHarness();
    const text = await evaluate(harness.send, `document.body.innerText`);
    return text.includes('Alice Admin') ? text : null;
  } catch {
    return null;
  }
}, 'harness Alice again');
await new Promise((resolve) => setTimeout(resolve, 400));
await grabPair('03-alice');

// Duplicate frames so the GIF holds each state ~3s at 2 fps → ~9s plus transitions.
const sequence = [
  '01-alice',
  '01-alice',
  '01-alice',
  '01-alice',
  '01-alice',
  '01-alice',
  '02-carol',
  '02-carol',
  '02-carol',
  '02-carol',
  '02-carol',
  '02-carol',
  '03-alice',
  '03-alice',
  '03-alice',
  '03-alice',
  '03-alice',
  '03-alice',
];
sequence.forEach((name, index) => {
  fs.copyFileSync(path.join(framesDir, `${name}.png`), path.join(framesDir, `seq-${String(index).padStart(3, '0')}.png`));
});

const gif = path.join(docsAssets, 'demo.gif');
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-framerate',
    '2',
    '-i',
    path.join(framesDir, 'seq-%03d.png'),
    '-vf',
    'fps=2,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
    '-loop',
    '0',
    gif,
  ],
  { stdio: 'inherit' },
);
const size = fs.statSync(gif).size;
console.log(`demo gif ${(size / 1024).toFixed(0)} KB`);
if (size > 5 * 1024 * 1024) {
  console.error('WARN: demo.gif is larger than 5 MB');
}

// Promo tile
const tileHtml = path.join(storeDir, 'promo-tile.html');
const tilePng = path.join(storeDir, 'promo-small-440x280.png');
try {
  const tile = await openPage(`file://${tileHtml}`, { width: 440, height: 280, dsf: 1 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  await screenshot(tile.session.send, tilePng);
} catch (error) {
  console.warn('promo tile via Chrome failed, using ffmpeg', error.message);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x10140f:s=440x280',
      '-vf',
      "drawtext=text='Local Session Switcher':fontcolor=0xefebdd:fontsize=28:x=32:y=90,drawtext=text='One-click test users on localhost':fontcolor=0xc5c4b0:fontsize=16:x=32:y=140",
      '-frames:v',
      '1',
      '-update',
      '1',
      tilePng,
    ],
    { stdio: 'inherit' },
  );
}

fs.copyFileSync(path.join(root, 'public/icon/128.png'), path.join(storeDir, 'icon-128.png'));
console.log('done');
