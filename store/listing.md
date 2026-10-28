# Chrome Web Store listing

Use this copy when submitting or updating the listing. Short description must stay ≤ 132 characters.

**Homepage:** https://abdallahsaber065.github.io/local-session-switcher/
**Privacy policy:** https://abdallahsaber065.github.io/local-session-switcher/privacy/
**Support:** https://github.com/abdallahsaber065/local-session-switcher/issues

## Name

Local Session Switcher

## Short description (108 / 132)

One-click test-user switching for apps on localhost. Swaps cookies and storage; nothing leaves your machine.

## Category

Developer Tools

## Language

English

## Single-purpose statement

This extension swaps the browser session (cookies and `localStorage` / `sessionStorage`) of a local development site to a selected test user so developers can test roles without signing out.

## Full description

Local Session Switcher keeps a list of test users (admin, employee, customer, …) for each local project and swaps the whole browser session in one click.

Every local app shares localhost, so they share one cookie jar. Testing a role-based app usually means logging out and back in, juggling incognito windows, or pasting tokens into DevTools. This extension writes the target user's cookies and web storage, prunes leftovers inside a scope you configure, and reloads the project's tabs. The session goes from A to B directly — it is never fully cleared in between, so auth guards do not flash a logged-out screen.

You pick the project. The extension never guesses from the URL, because every local app looks like localhost.

Optional auth recipes can log in or refresh tokens for you (reuse → refresh → login) with presets for session cookies, NextAuth credentials, Laravel Sanctum, Django CSRF, and JWT + refresh. A failed login aborts before the browser session is touched. Recipe URLs must stay on the project's own origins.

Default host access is localhost, 127.0.0.1, and [::1]. Extra local hosts (*.test, *.local, *.localhost, LAN IPs) are requested only when you add them to a project.

Nothing is collected. There is no account, no analytics, and no server. Sessions live in chrome.storage.local on this machine.

Install from this listing, or load the release zip unpacked (Developer mode) from GitHub.

Keyboard: Alt+Shift+U / Alt+Shift+Y cycle users. Also a toolbar popup, side panel, and right-click menu.

Limits: Chromium browsers (Chrome, Brave, Edge). One active user per browser profile, because cookies are shared across ports of a host. IndexedDB is not touched. chrome.storage.local is not encrypted — use test accounts, not production secrets.

Open source (MIT): https://github.com/abdallahsaber065/local-session-switcher

## Permission justifications

Every permission below is required for the single purpose. None are used for advertising, analytics, or remote telemetry.

| Permission | Manifest | Why |
|---|---|---|
| `storage` | `permissions` | Persist projects, users, captured cookies/storage, and auth-recipe config in `chrome.storage.local`. Nothing is synced or uploaded. |
| `cookies` | `permissions` | Read, set, and remove cookies on the project's origins so a switch can replay a captured or freshly logged-in session. |
| `contextMenus` | `permissions` | Right-click → Session Switcher lists the active project's users. |
| `sidePanel` | `permissions` | Optional side panel with the same switcher as the popup, so it can stay open while you work. |
| Host access `http(s)://localhost/*`, `http(s)://127.0.0.1/*`, `http(s)://[::1]/*` | `host_permissions` | Default local origins. Needed to inject storage, set cookies, and run content scripts on the app under test. |
| Optional host access `http://*/*`, `https://*/*` | `optional_host_permissions` | **Not granted at install.** Requested one origin at a time when you add a local host such as `http://myapp.test` or a LAN IP. The extension refuses non-local hosts in code (no `example.com`). Chrome only injects the content script on origins you have actually granted. |

The extension does **not** use `tabs`, `scripting`, `webRequest`, `debugger`, `identity`, `history`, or `<all_urls>` as an install-time host permission.

## Data usage disclosures (store questionnaire)

Answer the Chrome Web Store privacy fields as follows.

- **Does this extension collect or use any user data?** No.
- **Remote code:** None. All logic ships in the package.
- **Sale of data:** No.
- **Use of data for credit-worthiness, or lending:** No.
- **Personal communications:** Not collected.
- **Health / financial / authentication data:** The extension stores test-user credentials and session tokens **locally** in `chrome.storage.local` if you choose to save them. They are not transmitted except to the login/refresh URLs **you** configure on the same project's origins. Disclose this as locally stored developer test credentials, not collected by the developer.
- **Location / web history / user activity:** Not collected. The content script runs only on granted local origins to read/write `localStorage` and `sessionStorage` for the switch.
- **Website content:** Read/change only on user-configured local origins, to swap the session.
- **Personally identifiable information:** Not collected by the developer. Any names/emails you type as test users stay on the machine.

Single-purpose certification: the permissions above are used only to swap local test-user sessions.

## Assets in this folder

| File | Store field |
|---|---|
| `store/icon-128.png` | Store icon (copied from `public/icon/128.png`) |
| `store/screenshot-popup-1280x800.png` | Screenshot 1 |
| `store/screenshot-options-1280x800.png` | Screenshot 2 |
| `store/promo-small-440x280.png` | Small promotional tile |
| `local-session-switcher-<version>.zip` | Upload package (`pnpm store-pack`) |
