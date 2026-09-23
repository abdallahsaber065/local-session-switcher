// Dev-only smoke test for the built extension.
//
// Usage (from the project root):
//   1. Build:            pnpm build
//   2. Static harness:   python -m http.server 3456 --directory test-harness
//   3. Headless Chrome:  chrome --headless=new --remote-debugging-port=9222 \
//        --user-data-dir=%TEMP%\lss-smoke --load-extension=.output\chrome-mv3 http://localhost:3456/
//   4. Run:              node scripts/smoke.mjs
//
// Verifies: service worker loads, cookies API works, content script answers
// messages, and the popup/options React pages render.

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const HARNESS = process.env.HARNESS_URL ?? 'http://localhost:3456/';

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`SMOKE OK: ${message}`);
}

async function targets() {
  const response = await fetch(`${CDP}/json/list`);
  return response.json();
}

async function waitFor(fn, label, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) fail(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function connect(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('websocket failed to open'));
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  return { socket, send };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

// 1. Service worker target
const swTarget = await waitFor(
  async () => (await targets()).find((target) => target.type === 'service_worker' && target.url.includes('background.js')),
  'background service worker (did the extension load?)',
);
pass('background service worker is registered');
const sw = await connect(swTarget.webSocketDebuggerUrl);

// 2. Extension APIs + content script round trip
const harnessTab = await waitFor(
  async () => (await targets()).find((target) => target.type === 'page' && target.url.startsWith(HARNESS)),
  'harness page tab',
);
pass(`harness page is open (${harnessTab.url})`);

const result = await evaluate(
  sw.send,
  `(async () => {
    const out = {};
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((entry) => entry.url && entry.url.startsWith(${JSON.stringify(HARNESS)}));
    out.tabFound = Boolean(tab);
    if (tab?.id != null) {
      try {
        out.contentScript = await chrome.tabs.sendMessage(tab.id, { type: 'readStorage' });
      } catch (error) {
        out.contentScriptError = String(error);
      }
    }
    out.cookies = (await chrome.cookies.getAll({ domain: 'localhost' })).map((cookie) => cookie.name);
    const stored = await chrome.storage.local.get('state');
    out.stateRead = typeof stored === 'object';
    const set = await chrome.cookies.set({ url: 'http://localhost:3456/', name: 'lss-smoke', value: 'ok', path: '/' });
    out.cookieSet = set !== null;
    await chrome.cookies.remove({ url: 'http://localhost:3456/', name: 'lss-smoke' });
    return out;
  })()`,
);

if (!result.tabFound) fail('service worker could not find the harness tab (tabs permission? host permissions?)');
pass('service worker can query tabs and reach the harness page');

if (result.contentScriptError) fail(`content script did not answer: ${result.contentScriptError}`);
if (!result.contentScript || typeof result.contentScript.localStorage !== 'object') {
  fail('content script returned an unexpected storage snapshot');
}
pass('content script answered readStorage');

if (!result.cookieSet) fail('chrome.cookies.set returned null (host permission missing?)');
pass('cookies API works (set + remove round trip)');

if (!result.stateRead) fail('chrome.storage.local read failed');
pass('chrome.storage.local works');

// 3. Extension pages render
const extensionId = new URL(swTarget.url).host;
for (const page of ['popup', 'options']) {
  const response = await fetch(`${CDP}/json/new?chrome-extension://${extensionId}/${page}.html`, { method: 'PUT' });
  const target = await response.json();
  const session = await connect(target.webSocketDebuggerUrl);
  const rendered = await waitFor(
    async () =>
      evaluate(
        session.send,
        `document.querySelector('#root') && document.querySelector('#root').children.length > 0`,
      ),
    `${page}.html to render`,
    10000,
  ).catch(() => false);
  if (!rendered) fail(`${page}.html did not render any React content`);
  pass(`${page}.html rendered`);
  session.socket.close();
}

console.log('Smoke test passed.');
