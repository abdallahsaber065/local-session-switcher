# AGENTS.md

Guidance for AI coding agents working in this repository, following the
[AGENTS.md](https://agents.md) open convention (plain Markdown, no required fields; the
closest file to the file being edited wins). Human-facing docs live in `README.md`.

## Project overview

**Local Session Switcher** — a Chrome MV3 extension that lets a developer swap the whole
browser session (cookies + `localStorage`/`sessionStorage`) for a selected test user of a
selected project in one click — so testing different roles/permissions doesn't need incognito
juggling or sign-out cycles. Optional **auth recipes** obtain sessions by calling the project's
own login/refresh endpoints (reuse → refresh → login).

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Dependencies (+ `wxt prepare` postinstall) |
| `pnpm dev` | Dev build with HMR → load `.output/chrome-mv3-dev` unpacked |
| `pnpm compile` | Type-check — **must end with 0 errors** |
| `pnpm test` | Vitest unit tests — **all must pass** |
| `pnpm build` | Production build → `.output/chrome-mv3` |
| `pnpm zip` | Store zip (used by the Release workflow) |
| `SEED_FIXTURE_PATH=/abs/path.seed.json pnpm test` | Opt-in external seed regression (skipped when unset) |
| `node test-harness/server.mjs` | Fake login page + auth API on `localhost:3456` |
| `node skills/session-switcher-seed/scripts/validate-seed.mjs <file>` | Validate a seed (accepts seed doc or single project) |

CI (`.github/workflows/ci.yml`) runs compile + test + build on every push/PR.
`.github/workflows/release.yml` runs on `v*.*.*` tags and publishes a GitHub Release with the zip.

## Architecture

- `entrypoints/background.ts` — orchestration: auth lifecycle, switch execution, badge, menus, keyboard commands, message handlers.
- `entrypoints/content.ts` — storage read/write/prune + pending injection for `localhost`/`127.0.0.1` pages (`document_start`).
- `entrypoints/popup|sidepanel|options` — React UI; HTML files carry the design contract comment as the first child of `<body>`.
- `lib/schema.ts` — Zod schemas for app state, projects, users, seeds (`StateSchema`, `ProjectSchema`, `Seed*`).
- `lib/planner.ts` — **pure** switch planner (cookies to set/remove, storage applies, reload targets) + `detectActiveUser`.
- `lib/executor.ts` — Chrome-API execution of a plan; enforces **set-new → prune-old → reload**.
- `lib/auth/` — recipe system: `schema` (Zod), `template` (`{{var}}` interpolation), `extract` (jsonPath/regex/header/cookie), `lifecycle` (reuse/refresh/login decision), `runner` (execute + origin guard), `presets` (5 stacks), `browser` (SW deps).
- `lib/seed.ts` — seed merge (projects by id/name, users by id/name) + `stripSecrets` for exports.
- `components/` — shared UI: `Switcher`, `ui` primitives, hand-authored `icons` (SVG only).
- `skills/session-switcher-seed/` — seed-authoring agent skill: SKILL.md, `references/schema.md`, `scripts/validate-seed.mjs`, `assets/example.seed.json`.
- `test-harness/` — fake login page + zero-dependency auth API for e2e.
- `tests/` — Vitest: planner, schema, auth lifecycle/runner, seed import.
- `assets/app.css` — Tailwind v4 `@theme` design tokens (dark "ledger" world).

## Invariants — do not break

1. **Origin guard**: every auth-recipe URL must resolve to one of the project's origins (`assertRecipeOrigins` in `lib/auth/runner.ts`); host permissions cover `localhost`/`127.0.0.1` only (`wxt.config.ts`). Never loosen this — it is the exfiltration defense for seed files.
2. **Switch order**: write the new session first, prune leftovers second, reload last. Never wipe-first; the session must transition A → B without a logged-out window.
3. **No network** beyond user-configured recipe URLs. No analytics, no telemetry.
4. **Seed compatibility**: additive schema changes only, without bumping `schemaVersion`. Breaking seed shape = MAJOR bump + `schemaVersion` bump + migration notes in README and CHANGELOG. Zod strips unknown keys — a field missing from `SeedProjectSchema` is *silently dropped on import* (this bug shipped once; add a test when touching seed schemas).
5. **Secrets**: `*.seed.json`, `session-switcher-backup-*.json`, `web-ext.config.ts` stay gitignored; never hardcode credentials. Exports blank passwords/tokens unless explicitly opted in.
6. **Gates before finishing any task**: `pnpm compile` (0 errors) + `pnpm test` (green) + `pnpm build`. CI enforces the same.
7. **Design system**: colors/typography live in `assets/app.css` `@theme` — don't reintroduce default Tailwind/slate palettes or emoji/unicode icons (icons are authored SVGs in `components/icons.tsx`).

## Conventions

- Conventional commits: `feat|fix|docs|test|chore(scope): summary`.
- Zod validates every trust boundary (state load/save, seed import, recipe save); surface errors with `errorLines()` so users see field paths.
- Pure logic (planner, lifecycle, seed merge, template/extract) gets Vitest coverage that fails if the behavior breaks; keep Chrome-API wiring thin.
- Copy tone: terse, factual dev-tool language (see `PRODUCT.md`).

## Where to look

- `PRODUCT.md` — product truth (users, capabilities, constraints, principles).
- `README.md` — user docs: install, seed JSON schema, permissions, limits.
- `CONTRIBUTING.md` — dev workflow, **versioning & release process**.
- `CHANGELOG.md` — released versions (Keep a Changelog format).
