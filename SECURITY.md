# Security Policy

## Scope

Local Session Switcher is a **local development tool**. It stores test-user
credentials and session tokens unencrypted in `chrome.storage.local` by design
(see README — your browser profile already stores the same session). It never
sends data anywhere except the auth-recipe URLs configured on your own project,
and those are guarded: every recipe URL must resolve to one of the project's
origins. Default host permissions cover `localhost` / `127.0.0.1` / `[::1]`
only; extra local hosts (`*.test`, `*.local`, LAN IPs, …) are requested
per-origin and remote hosts are refused.

## Reporting a vulnerability

Please use **GitHub private vulnerability reporting** (Security tab → Report a
vulnerability) rather than a public issue — especially for anything involving
credential handling, the origin guard, or the seed import path.

## Using it safely

- Treat exported backups and `*.seed.json` files as **secrets** — they contain
  passwords and tokens. They are gitignored here; keep them ignored wherever
  you use them.
- Don't use real production credentials with it; it is built for local test
  accounts.
