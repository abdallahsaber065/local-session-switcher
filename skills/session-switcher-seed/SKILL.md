---
name: session-switcher-seed
description: Create, fix, or extend a seed JSON for the Local Session Switcher Chrome extension — projects, localhost origins, clearing rules, auth recipes (login/refresh endpoints), and test users. Use this skill whenever the user wants to set up or configure Local Session Switcher for one of their projects, author or repair a *.seed.json file, define test users or credentials for local testing, or wire up a login/refresh flow (NextAuth, Laravel Sanctum, Django, JWT + refresh, session cookies) — even if they only say "seed", "session switcher config", "test users for my local app", "auth recipe", or "switch users on localhost".
---

# Session Switcher seed authoring

A seed file is how the Local Session Switcher extension receives a whole project in one import:
origins, clearing rules, the auth recipe (how to log in and refresh), and the test users with their
cookies/credentials. Settings → **Import seed** merges it (projects by `id`/`name`, users by
`id`/`name`; missing user ids are generated).

Your job when this skill triggers: produce a `*.seed.json` that is **valid on the first import** —
validated with the bundled script — and matches the project's real authentication, not a guess.

## Workflow

1. **Gather the facts.** Ask only what you cannot find by reading the project's code/config:
   - Project name and every local origin it runs on (`http://localhost:3000`, `http://127.0.0.1:8000`).
     Origins have **no path and no trailing slash** beyond that.
   - How a user logs in: endpoint URL, HTTP method, request shape (JSON / form), and the exact
     field names for username and password (e.g. `email` vs `username`).
   - What the login response must deliver to the browser: an `HttpOnly` cookie (server-set — no
     config needed), a token in JSON, or both.
   - Which storage key the frontend reads the token from, when it is not a cookie (e.g.
     `localStorage["auth-token"]`).
   - Whether there is a refresh endpoint, and which fields carry the access/refresh tokens.
   - Any preflight step (CSRF token fetch, `sanctum/csrf-cookie`, NextAuth `/api/auth/csrf`).
   - The test users: username/password pairs and any roles to tag (`admin`, `employee`, …).

2. **Start from the right preset.** `references/schema.md` contains five ready recipes
   (session-cookie, NextAuth, Sanctum, Django, JWT + refresh). Pick the closest one and adapt
   field names and URLs to this project. A preset is a starting point, not gospel.

3. **Write the seed** following the schema reference. Constraints that cause imports or runtime to
   fail if violated:
   - Every auth recipe URL (preflight, login, refresh, verify) must live **on one of the project's
     origins** — the extension refuses anything else (exfiltration guard), and the host permission
     only covers `localhost` / `127.0.0.1`.
   - Templates use `{{username}}`, `{{password}}`, `{{accessToken}}`, `{{refreshToken}}`, plus
     whatever earlier steps extract (`{{csrfToken}}`, …). An unknown variable aborts the run —
     check every placeholder against the variables actually available at that point.
   - `clear` modes: `"all"` | `{"names": [...]}` | `{"prefixes": [...]}` for cookies;
     `"all"` | `{"mode": "all", "exclude": [...]}` | `{"mode": "keys", "keys": [...]}` for storage.
   - Extract rules: exactly one of `{"jsonPath"}` | `{"regex", "group"?}` | `{"header"}` |
     `{"cookie", "decode"?}`.
   - `sameSite`: `"no_restriction" | "lax" | "strict" | "unspecified"`.

4. **Validate before handing it over.** Run the bundled validator; it mirrors the extension's
   rules (origins, recipe-on-origins, template scope, shapes):

   ```bash
   node <skill-dir>/scripts/validate-seed.mjs path/to/your.seed.json
   ```

   Fix everything it reports, re-run until it exits 0.

5. **Hand over.** Write the file (suggest a name like `<project>.seed.json`), then tell the user:
   - **Import door:** extension Settings → **Global → Import seed** (shows a preview: counts of
     new/updated projects and users → *Apply import* → *Save changes*). The per-project **Data**
     tab also accepts either shape — a single project object or the whole seed — both route
     through the same preview; never tell the user to paste a seed into a plain project field.
   - The validator accepts both shapes too (seed document or single project object).
   - Seed files can contain live session cookies and passwords — keep them out of git (the
     extension's docs suggest `*.seed.json` is gitignored).

## Output contract

Always deliver:
1. The seed file at a path the user names (or `<project>.seed.json` in the current directory).
2. The validator's passing output (paste the summary line).
3. One short paragraph: which preset it started from, what was adapted, and any facts you had to
   assume (mark assumptions clearly — better to list open questions than to guess silently).

## Failure modes to avoid

- **Inventing endpoints.** Never fabricate a login URL or field name; if the repo doesn't reveal
  it, ask. A wrong URL fails at runtime with HTTP errors the user then has to debug.
- **Putting paths in origins** (`http://localhost:3000/app`) — rejected.
- **Recipe URLs on other hosts** (`https://api.example.com`) — rejected at switch time.
- **Assuming cookies when the app reads `localStorage`.** Check where the frontend actually reads
  its auth state before choosing `outputs`.
- **Over-clearing.** If the app persists non-auth UI state (theme, locale) in `localStorage`, set
  `clear.localStorage` to `{"mode": "all", "exclude": ["theme"]}` so switches don't reset it.

## Reference

Read `references/schema.md` before writing your first seed — it has the full annotated schema, all
five presets verbatim, and a complete worked example (`assets/example.seed.json` is the same
example as a ready-to-import file).
