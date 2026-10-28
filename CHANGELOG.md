# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [Unreleased]

## [1.1.0] — 2026-10-28

Launch-readiness: extra local hosts, store package, public docs site, demo.

### Added

- Optional host permissions for user-configured **local** origins (`*.test`, `*.local`,
  `*.localhost`, `*.internal`, loopback, RFC1918 / link-local IPs). Default grants stay
  `localhost` / `127.0.0.1` / `[::1]`. Remote hosts are refused so a seed cannot widen
  access to the public internet. Chrome prompts per origin on save or the first switch.
- GitHub Pages homepage + privacy policy (`site/`).
- Chrome Web Store listing copy, promo tile, and `pnpm store-pack` (zip + verify).
- Bundled example seed at `skills/session-switcher-seed/assets/example.seed.json`.
- Demo GIF and refreshed README screenshots.
- Community files: issue templates, pull request template, code of conduct.

### Changed

- README is pitch-first (GIF, badges, FAQ, extra hosts, privacy).
- Seed validator accepts extra local hosts and warns that Chrome will prompt for them.
- Test harness shows a large “Signed in as …” line so a switch is obvious.

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

[Unreleased]: https://github.com/abdallahsaber065/local-session-switcher/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/abdallahsaber065/local-session-switcher/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/abdallahsaber065/local-session-switcher/releases/tag/v1.0.0
