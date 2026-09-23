# Contributing

Thanks for considering a contribution.

## Development

```bash
pnpm install        # also runs `wxt prepare`
pnpm dev            # dev build with HMR → load .output/chrome-mv3-dev unpacked
pnpm compile        # type-check (must be 0 errors)
pnpm test           # unit tests (planner, schema, auth lifecycle, seed import)
pnpm build          # production build → .output/chrome-mv3
```

Load the extension unpacked from `chrome://extensions` (Developer mode → Load unpacked).

## Ground rules

- **Keep `pnpm compile` at 0 type errors and `pnpm test` green** — CI enforces both plus the build.
- Non-trivial logic (switch planner, auth lifecycle, seed merge) needs a test that fails if the behavior breaks.
- Conventional commits: `feat|fix|test|docs|chore(scope): summary`.
- Don't commit secrets: seed/backup files contain live session data and are gitignored (`*.seed.json`) — keep it that way for new patterns too.
- The extension must stay local-only: no network calls beyond the auth recipe URLs the *user* configures (enforced by the origin guard).

## Where to help

Ideas: auth presets for more stacks, IndexedDB support, side-panel refinements, docs.
Open an issue first for anything that changes the seed schema or permissions.
