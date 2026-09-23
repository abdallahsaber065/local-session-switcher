# Seed schema reference (Local Session Switcher)

Complete, annotated shape of a seed file. Fields marked *(default)* may be omitted — the
extension fills them in on import. Unknown fields on a project/user are ignored, but typos in
known fields are not: name things exactly as written here.

Table of contents:
1. Top level
2. Project
3. Clear rules
4. Auth recipe
5. Extract rules
6. Sinks (outputs)
7. Users
8. Presets (five, verbatim)
9. Full worked example

---

## 1. Top level

```jsonc
{
  "schemaVersion": 1,          // optional number
  "projects": [ /* Project */ ] // required, ≥ 1
}
```

## 2. Project

```jsonc
{
  "id": "acme-store",           // optional for seeds; matched by id, else by name
  "name": "Acme Store",         // required
  "origins": ["http://localhost:5173"],  // required, ≥1 — scheme://host[:port], no path
  "tags": [ { "name": "admin", "color": "#c0413a" } ],  // (default: []) — color (default: "#64748b")
  "auth": { /* AuthRecipe */ }, // optional — without it, users rely on captured cookies only
  "clear": { /* ClearRules */ }, // (default: everything cleared)
  "reload": "matching-tabs",     // "matching-tabs" (default) | "active-tab" | "none"
  "users": [ /* User */ ]        // (default: [])
}
```

Origins that are not `localhost` / `127.0.0.1` need a manifest host-permission change; the
shipped extension only has those. A trailing slash is tolerated; a path (`/app`) is rejected.

## 3. Clear rules

Applied on every switch, **after** the new session is written (the new values are never pruned).

```jsonc
"clear": {
  "cookies": "all",                                        // or {"names": ["session"]} or {"prefixes": ["next-auth."]}
  "localStorage": {"mode": "all", "exclude": ["theme"]},   // or "all" (no exclusions) or {"mode": "keys", "keys": ["token"]}
  "sessionStorage": "all"
}
```

## 4. Auth recipe

Runs silently on switch: reuse cached tokens → refresh → full login. A failed login **aborts
before** the browser session is touched.

```jsonc
"auth": {
  "preflight": [ /* AuthStep — optional, ordered, for CSRF handshakes */ ],
  "login":     { /* AuthStep — required when auth exists */ },
  "outputs":   [ /* Sinks — where the session must live in the browser */ ],
  "refresh":   { /* AuthStep — optional; its outputs default to login's */ },
  "session": {                       // (default: {})
    "ttlMinutes": 15,                // fallback lifetime when the token is not a decodable JWT
    "verify": { "method": "GET", "url": "http://localhost:5173/api/me", "expectStatus": 200 }  // optional
  }
}
```

AuthStep:

```jsonc
{
  "method": "POST",                  // GET | POST | PUT | PATCH | DELETE  (default: POST)
  "url": "http://localhost:5173/api/auth/login",  // must be on one of the project's origins
  "headers": { "Content-Type": "application/json" },  // (default: {})
  "bodyType": "json",                // "json" (default) | "form" | "raw"
  "body": { "email": "{{username}}", "password": "{{password}}" },
  "credentials": "include",          // "include" (default — keeps the cookie jar) | "omit"
  "expectStatus": [200, 204],        // optional; default is any 2xx
  "extract": { "accessToken": { "jsonPath": "token" } }  // (default: {})
}
```

**Template variables available at each point** (an unknown `{{var}}` aborts the run):

- start: `{{username}}`, `{{password}}`, `{{accessToken}}`, `{{refreshToken}}`, plus anything in
  `credentials.extra`
- each preflight step may add its own `extract` names for later steps
- the login step sees everything above; its `extract` results become available to `outputs`
- `refresh` runs with start-vars + login extracts; its extracts feed its own `outputs`
- `outputs` are re-resolved on every switch, including the reuse path — always reference
  `{{accessToken}}` / `{{refreshToken}}` there, not step-local values that may not exist

## 5. Extract rules

Exactly one key per rule:

```jsonc
{ "jsonPath": "data.token" }                     // dot path into the JSON body, array indexes OK ($. prefix tolerated)
{ "regex": "name=\"csrf\" value=\"([^\"]+)\"", "group": 1 }  // against the raw body (group default 1)
{ "header": "x-csrf-token" }                     // response header
{ "cookie": "XSRF-TOKEN", "decode": "url" }      // from the browser's cookie jar; decode: "none"(default)|"url"|"base64"
```

A rule that matches nothing aborts with a clear error — prefer `jsonPath` when the response is
JSON.

## 6. Sinks (outputs)

```jsonc
{ "kind": "cookie", "name": "session", "value": "{{accessToken}}",
  "origin": "http://localhost:5173",   // (default: first project origin)
  "path": "/", "httpOnly": true, "secure": false,
  "sameSite": "lax",                    // no_restriction | lax | strict | unspecified (default: "lax")
  "expirationDate": 1735689600 }        // optional unix seconds

{ "kind": "localStorage", "key": "auth-token", "value": "{{accessToken}}", "origin": "..." }
{ "kind": "sessionStorage", "key": "csrf", "value": "{{csrfToken}}", "origin": "..." }
```

When the login response sets an `HttpOnly` cookie with `credentials: "include"` (the default),
**the browser stores it automatically** — `outputs: []` is correct for pure session-cookie apps.

## 7. User

```jsonc
{
  "id": "u-admin",                      // optional in seeds (generated when missing)
  "name": "Admin",                      // required
  "tags": ["admin"],                    // (default: [])
  "notes": "",                          // (default: "")
  "cookies": [                          // captured-style profile; replayed verbatim on switch
    { "name": "session", "value": "…", "path": "/", "hostOnly": true,
      "httpOnly": true, "secure": false, "sameSite": "lax",
      "domain": "localhost", "expirationDate": 1735689600 }
  ],
  "storage": {                          // per-origin injected storage
    "http://localhost:5173": { "localStorage": { "auth-token": "…" }, "sessionStorage": {} }
  },
  "credentials": {                      // used by the auth recipe; (default: {})
    "username": "alice@test.local", "password": "…", "extra": { "tenant": "acme" }
  },
  "capturedAt": "2026-09-23T12:00:00Z", // optional
  "lastUsedAt": "2026-09-23T13:00:00Z"  // optional
}
```

A user with `credentials` but no cookies is the normal recipe-driven setup: the extension logs
in on first switch and caches tokens into `session` (managed by the extension, not by seeds).

## 8. Presets (verbatim starting points)

Origin shown as `http://localhost:3000` — replace it for every project.

### Session cookie (Express / Passport / Rails)

```json
{
  "login": { "method": "POST", "url": "http://localhost:3000/api/login", "bodyType": "json",
    "headers": { "Content-Type": "application/json" },
    "body": { "email": "{{username}}", "password": "{{password}}" } },
  "outputs": [], "session": { "ttlMinutes": 60 }
}
```

### NextAuth credentials

```json
{
  "preflight": [ { "method": "GET", "url": "http://localhost:3000/api/auth/csrf",
    "extract": { "csrfToken": { "jsonPath": "csrfToken" } } } ],
  "login": { "method": "POST", "url": "http://localhost:3000/api/auth/callback/credentials",
    "bodyType": "form",
    "body": { "csrfToken": "{{csrfToken}}", "email": "{{username}}", "password": "{{password}}", "json": "true" } },
  "outputs": [], "session": { "ttlMinutes": 60 }
}
```

### Laravel Sanctum (SPA)

```json
{
  "preflight": [ { "method": "GET", "url": "http://localhost:3000/sanctum/csrf-cookie" } ],
  "login": { "method": "POST", "url": "http://localhost:3000/login", "bodyType": "json",
    "headers": { "Content-Type": "application/json", "X-XSRF-TOKEN": "{{xsrf}}" },
    "body": { "email": "{{username}}", "password": "{{password}}" },
    "extract": { "xsrf": { "cookie": "XSRF-TOKEN", "decode": "url" } } },
  "outputs": [], "session": { "ttlMinutes": 120 }
}
```

### Django session (CSRF form)

```json
{
  "preflight": [ { "method": "GET", "url": "http://localhost:8000/login/",
    "extract": { "csrfmiddlewaretoken": { "regex": "name=\"csrfmiddlewaretoken\" value=\"([^\"]+)\"", "group": 1 } } } ],
  "login": { "method": "POST", "url": "http://localhost:8000/login/", "bodyType": "form",
    "headers": { "Referer": "http://localhost:8000/login/" },
    "body": { "csrfmiddlewaretoken": "{{csrfmiddlewaretoken}}", "username": "{{username}}", "password": "{{password}}" } },
  "outputs": [], "session": { "ttlMinutes": 720 }
}
```

### JWT + refresh token (token in localStorage)

```json
{
  "login": { "method": "POST", "url": "http://localhost:3000/api/auth/login", "bodyType": "json",
    "headers": { "Content-Type": "application/json" },
    "body": { "email": "{{username}}", "password": "{{password}}" },
    "extract": { "accessToken": { "jsonPath": "token" }, "refreshToken": { "jsonPath": "refreshToken" } } },
  "outputs": [ { "kind": "localStorage", "key": "auth-token", "value": "{{accessToken}}" } ],
  "refresh": { "method": "POST", "url": "http://localhost:3000/api/auth/refresh", "bodyType": "json",
    "headers": { "Content-Type": "application/json" },
    "body": { "refreshToken": "{{refreshToken}}" },
    "extract": { "accessToken": { "jsonPath": "token" }, "refreshToken": { "jsonPath": "refreshToken" } } },
  "session": { "ttlMinutes": 15 }
}
```

## 9. Full worked example

Two accepted shapes, for the validator and both extension import doors (Settings → Global →
Import seed, and the per-project Data tab): the **seed document** `{ "schemaVersion": 1, "projects": [ … ] }`
and a **single project object** `{ "name": "…", "origins": [ … ], … }`.

See `assets/example.seed.json` — a complete, import-ready seed (two origins, JWT + refresh
recipe, excluded UI keys, tagged users with credentials). Validate any seed you write:

```bash
node skills/session-switcher-seed/scripts/validate-seed.mjs <file>
```
