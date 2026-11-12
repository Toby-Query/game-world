# The World

A desktop-browser online world where every mythology is real and the old world has drowned.
Players sail an endless ocean between islands that each break a different rule of physics.

## Run it locally

Requires Node 22 and pnpm 10 (`corepack enable` installs pnpm).

```bash
pnpm install
pnpm dev
```

- Game client: http://localhost:5173
- Game server: ws://localhost:2567

Open the client in a desktop browser. Chrome or Edge use WebGPU; other browsers fall back to WebGL 2.

## Other commands

```bash
pnpm build      # typecheck and build everything
pnpm test       # unit tests
pnpm lint       # lint
```

## Project structure

See [CLAUDE.md](./CLAUDE.md) for the layout, conventions and how work is organised.
