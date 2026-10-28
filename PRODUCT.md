# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo developer testing local web projects. Situation: several projects share the same local origin
(`http://localhost:3000`), so cookies and storage collide, and acting as different test users
(admin, employee, customer…) normally means logging out and back in by hand. Job: put the browser
into a given test user's session on the currently selected local project, quickly and reliably.

## Product Purpose

A Chrome MV3 extension that keeps named test-user profiles per project and swaps the whole browser
session (cookies + localStorage/sessionStorage, plus sessions obtained from login APIs) on demand.
Success = switching users is one click and always ends with a working, fresh session on the
project's origin: no manual logout/login, no stale sessions, no cross-project pollution.

## Positioning

Session state is scoped to a manually selected project instead of the URL, because every local
project shares the same origin; and a profile can either be captured from a real login or produced
by a declarative auth recipe (preflight → login → extract → outputs, plus refresh) that the
extension replays and keeps fresh. A generic cookie editor can do neither.

## Operating Context

Local dev machines (Windows, Brave/Chrome). Projects served on localhost / 127.0.0.1, plus
optional extra local hosts (`*.test`, `*.local`, LAN IPs) across varying
ports, sometimes with multiple origins per project (frontend + API). Auth varies per project:
session cookies, NextAuth credentials, Laravel Sanctum, Django CSRF, custom JWT + refresh in
localStorage. The extension is reached from the toolbar popup, a side panel, or the right-click
menu; keyboard shortcuts cycle users. Test users are seeded by capture, manual JSON, or seed files
kept out of git.

## Capabilities and Constraints

Confirmed: multi-project profiles; manual persisted project selection; cookie + storage swap with
configurable clear scope; capture current session as a user; seed import/export; per-user tags;
JWT expiry display and active-user detection; badge; shortcuts; context menu; side panel.
Auth recipes run silently on switch (reuse → refresh → login), and a failed login aborts before
touching the browser session.

Constraints: Chrome MV3; local origins only (localhost by default; extra local hosts via optional
permissions); credentials and sessions are stored
unencrypted in `chrome.storage.local` (explicit user decision, warnings shown); exports strip
credentials and tokens by default; 2FA / social / OTP logins stay manual via capture; one session
per browser profile at a time.

## Brand Commitments

Name: Local Session Switcher. No logo or asset commitments. Voice: terse, factual dev-tool
language; no hype.

## Evidence on Hand

Working v1.1.0 implementation (popup, sidepanel, options, background, content script), unit tests
(`tests/`), a static test harness page (`test-harness/`), and a GitHub Pages homepage. No
marketing claims, customers, benchmarks, or press exist; future work must not invent them.

## Product Principles

1. The browser's session is the source of truth; the extension only moves it.
2. Never leave the browser in a worse session state than before an action — abort before mutating.
3. Project scope beats URL scope: selection is explicit, persisted, never inferred.
4. One click is the bar; every switch ends with a reloaded, working tab.
5. Secrets stay local and out of exports by default.

## Accessibility & Inclusion

Not formally specified; target (proposed, not yet confirmed): keyboard-reachable controls, visible
focus, WCAG AA contrast for text in the extension UI.
