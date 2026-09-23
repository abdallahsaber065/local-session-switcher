# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [Unreleased]

## [1.0.0] — 2026-09-23

First public release.

### Added

- Project-scoped test-user lists; the active project is chosen manually and persisted, never
  inferred from the URL (all local apps share `localhost`).
- One-click session swap: cookies + `localStorage`/`sessionStorage` written, configured
  pruning of leftovers, tabs reloaded — the session always transitions A → B, never through a
  logged-out wipe.
- Capture a live session as a user profile; JSON seed import/export with merge semantics and
  a standalone validator (`skills/session-switcher-seed/scripts/validate-seed.mjs`).
- Auth recipes: preflight → login → extract → outputs, refresh rotation, and a
  reuse → refresh → login lifecycle with an origin guard (recipe URLs must stay on the
  project's origins). Presets: session cookie, NextAuth, Laravel Sanctum, Django, JWT + refresh.
- Role tags, JWT expiry display, active-user detection, badge initials, keyboard user cycling,
  context menu, side panel.
- Dark "ledger" UI, seed-authoring agent skill (AGENTS.md convention), test harness with a
  fake auth API, CI + release pipelines, MIT license.
