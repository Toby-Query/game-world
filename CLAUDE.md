# The World

Desktop-browser 3D online game: an endless ocean of mythological islands around a futuristic
museum city (the Archive). Full spec: https://claude.ai/artifact/PSCBEiLPrjeJzxP13JFQHY

Work is driven by GitHub issues. Agents build issues labelled `build-me`, one PR per issue.

## Ticket loop

| Label         | Meaning                                                      |
| ------------- | ------------------------------------------------------------ |
| `build-me`    | Ready for an agent to build                                  |
| `needs-input` | Agent is blocked; its question is in the latest comment      |
| `epic`        | Planning issue for a phase; broken into tickets, never built |

1. Take the oldest open `build-me` issue whose "Depends on" issues are all closed.
2. Branch `issue-<number>-<slug>` from `main`; one PR per issue, body starts with `Closes #<number>`.
3. Build it and meet the definition of done below.
4. Merge when CI is green. Comment on the issue how to try it locally (and the live link once
   deployment exists), then close it.
5. If the ticket is unclear or blocked, do not guess: add `needs-input`, remove `build-me`, and ask
   the question in a comment.

New tickets use the issue form in `.github/ISSUE_TEMPLATE/feature.yml`.

## Layout

| Path                      | What lives there                                                     |
| ------------------------- | -------------------------------------------------------------------- |
| `apps/client`             | Vite + Three.js (WebGPU renderer, WebGL 2 fallback) + Rapier physics |
| `apps/server`             | Colyseus game server (authoritative rooms)                           |
| `packages/shared`         | Types, constants and rules used by client and server                 |
| `content/islands/<name>/` | One folder per island: rules, quests, artifacts, asset list          |
| `content/exhibits/`       | Museum exhibits as JSON                                              |
| `content/news/`           | News feed shown on in-world screens                                  |

## Commands

Node 22, pnpm 10.

| Command          | Does                                                                |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm install`   | Install everything                                                  |
| `pnpm dev`       | Client on http://localhost:5173 and server on ws://localhost:2567   |
| `pnpm build`     | Typecheck and build all packages                                    |
| `pnpm test`      | Unit tests (Vitest)                                                 |
| `pnpm lint`      | ESLint                                                              |
| `pnpm typecheck` | TypeScript, strict                                                  |
| `pnpm format`    | Prettier                                                            |
| `pnpm test:e2e`  | Headless browser tests of the built client and server (build first) |

## Conventions

- TypeScript strict everywhere, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Gameplay content is data in `content/`, never hard-coded. A new island, exhibit or headline
  should not need an engine change.
- Rules shared by client and server (physics zones, constants, network messages) live in
  `packages/shared`.
- The server is the only authority over money, items, health and positions.
- Desktop browsers only; touch devices get the gate screen in `apps/client/src/device.ts`.
- `window.__THE_WORLD__.ready` is set once the client renders its first frame; smoke tests wait on it.
  `?autostart=1` must always skip menus and drop straight into the world. `?offline=1` plays without
  the server (single-player e2e tests use it so other players and server corrections can't interfere).
- The client reads the server URL from `VITE_SERVER_URL` (see `apps/client/.env.example`), defaulting
  to `ws://<page host>:2567`. The server answers `GET /health`.
- Network messages and their validation live in `packages/shared/src/net.ts`; the server checks every
  move (`checkMove`) and only sends each player the others within `NET.interestRadius`.
- Accounts, characters, wallets, the money ledger and inventories live in Postgres
  (`apps/server/src/db/schema.ts`). Locally and in tests that is PGlite (embedded Postgres, stored in
  `apps/server/.data/`); set `DATABASE_URL` (see `apps/server/.env.example`) for a real one such as
  Neon. All money moves through `AccountStore.adjustBalance`, which writes a ledger row and never lets
  a balance go negative. There is no client route that writes money or items.
- Sign-in is a magic link. No email provider is wired up yet: outside production the server logs the
  link and returns it to the page, which shows it as "Open the sign-in link".
- Without a GPU, run the smoke test with `CHROME_PATH=/path/to/chrome` to reuse an installed Chrome.
- `pnpm-lock.yaml` is not committed yet (see `.gitignore`); CI installs with `--no-frozen-lockfile`.
- Files under `.github/workflows/` cannot be pushed through the GitHub connector (it lacks the
  `workflow` permission); commit workflow changes through the GitHub web editor instead.
- Keep pure logic (maths, rules, parsing) in small functions with unit tests next to them
  (`*.test.ts`).

## Definition of done

A PR is done when all of these hold:

1. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass.
2. `pnpm test:e2e` passes: the built client loads at `/?autostart=1`, renders, and logs no console
   errors. CI (`.github/workflows/ci.yml`) runs all of this on every PR; merge only when CI is green.
3. The PR description says what changed, how to try it locally, and includes a screenshot for
   anything visual.
4. The PR references its issue (`Closes #N`).

## Running it

Deployment is parked for now (#3). Everything runs locally: `pnpm install && pnpm dev`.
