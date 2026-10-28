# Contributing

Thanks for considering a contribution.

## Development

```bash
pnpm install        # also runs `wxt prepare`
pnpm dev            # dev build with HMR → load .output/chrome-mv3-dev unpacked
pnpm compile        # type-check (must be 0 errors)
pnpm test           # unit tests (planner, schema, auth lifecycle, seed import, local hosts)
pnpm build          # production build → .output/chrome-mv3
pnpm store-pack     # Chrome Web Store zip + verify
```

Load the extension unpacked from `chrome://extensions` (Developer mode → Load unpacked).

## Ground rules

- **Keep `pnpm compile` at 0 type errors and `pnpm test` green** — CI enforces both plus the build.
- Non-trivial logic (switch planner, auth lifecycle, seed merge) needs a test that fails if the behavior breaks.
- Conventional commits: `feat|fix|test|docs|chore(scope): summary`.
- Don't commit secrets: seed/backup files contain live session data and are gitignored (`*.seed.json`) — keep it that way for new patterns too.
- The extension must stay local-only: no network calls beyond the auth recipe URLs the *user* configures (enforced by the origin guard). Extra hosts must stay on the local allowlist in `lib/hosts.ts` — never grant `example.com`.
- Be kind: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Versions & releases

- **SemVer on `package.json`** — `version` is the single source of truth: WXT copies it into
  the extension's `manifest.version`, so it must stay plain `x.y.z` (no prerelease suffixes).
  - **MAJOR** — breaking changes to the seed/schema contract. Bump `schemaVersion` in seeds
    too and document the migration in the README + CHANGELOG.
  - **MINOR** — new features, new auth presets, backwards-compatible schema *additions*
    (older seeds must keep importing).
  - **PATCH** — fixes, UI polish, docs.
- Keep `CHANGELOG.md` current (Keep a Changelog format); fold `Unreleased` into a versioned
  section at release time.
- **To release:** bump `version` in `package.json`, update `CHANGELOG.md`, commit to `main`,
  then tag and push:

  ```bash
  git tag v1.1.0 && git push origin v1.1.0
  ```

  The **Release** workflow (`.github/workflows/release.yml`) re-runs type-check + tests +
  build, **fails if the tag doesn't match `package.json`**, zips the extension, verifies the
  store package, and publishes a GitHub Release with the zip attached. Notes come from
  `docs/release-notes/<version>.md` when that file exists.

## Where to help

Ideas: auth presets for more stacks, IndexedDB support, side-panel refinements, docs.
Open an issue first for anything that changes the seed schema or permissions.

Chrome Web Store listing copy lives in [`store/listing.md`](store/listing.md).
