# The World

Desktop-browser 3D online game: an endless ocean of mythological islands around a futuristic
museum city (the Archive). Full spec: https://claude.ai/artifact/PSCBEiLPrjeJzxP13JFQHY

Work is driven by GitHub issues. Agents build issues labelled `build-me`, one PR per issue.

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

| Command          | Does                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `pnpm install`   | Install everything                                                |
| `pnpm dev`       | Client on http://localhost:5173 and server on ws://localhost:2567 |
| `pnpm build`     | Typecheck and build all packages                                  |
| `pnpm test`      | Unit tests (Vitest)                                               |
| `pnpm lint`      | ESLint                                                            |
| `pnpm typecheck` | TypeScript, strict                                                |
| `pnpm format`    | Prettier                                                          |

## Conventions

- TypeScript strict everywhere, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Gameplay content is data in `content/`, never hard-coded. A new island, exhibit or headline
  should not need an engine change.
- Rules shared by client and server (physics zones, constants, network messages) live in
  `packages/shared`.
- The server is the only authority over money, items, health and positions.
- Desktop browsers only; touch devices get the gate screen in `apps/client/src/device.ts`.
- `window.__THE_WORLD__.ready` is set once the client renders its first frame; smoke tests wait on it.
- Keep pure logic (maths, rules, parsing) in small functions with unit tests next to them
  (`*.test.ts`).

## Definition of done

A PR is done when all of these hold:

1. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass.
2. The client loads without console errors and renders (the smoke test, once #2 lands).
3. The PR description says what changed, how to try it locally, and includes a screenshot for
   anything visual.
4. The PR references its issue (`Closes #N`).

## Running it

Deployment is parked for now (#3). Everything runs locally: `pnpm install && pnpm dev`.
