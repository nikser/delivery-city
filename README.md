# Delivery City

Multiplayer top-down delivery game. Race against other players to pick up and deliver orders across a city grid as fast as possible.

![TypeScript](https://img.shields.io/badge/TypeScript-7.x-blue)
![Node.js](https://img.shields.io/badge/Node.js-26-green)
![Phaser](https://img.shields.io/badge/Phaser-3.x-orange)
![CI](https://github.com/nikser/delivery-city/actions/workflows/ci.yml/badge.svg)

## Gameplay

- Navigate a one-way road city grid
- Pick up orders (paper bag icons) and deliver them to marked destinations
- Score points for each delivery — speed bonuses for fast deliveries
- Compete with other players and bots in 5-minute sessions

## Stack

| Layer    | Tech                         |
| -------- | ---------------------------- |
| Client   | Phaser 3, TypeScript, Vite   |
| Server   | Node.js, Express, Socket.io  |
| Shared   | TypeScript types + constants |
| Monorepo | pnpm workspaces              |

## Project structure

```
packages/
  shared/   # Shared types, constants, game config
  server/   # Game server (authoritative, 20 ticks/sec)
  client/   # Phaser 3 browser client
  tests/    # Jest unit/integration tests
```

## pnpm

The repo uses pnpm (version pinned in `packageManager` in `package.json`). Install it:

- macOS: `brew install pnpm`
- any OS: `npm i -g pnpm` (Node 25+ has no built-in corepack)

Check with `pnpm -v`, then run `pnpm install`. Main commands: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm format:write`.

## Getting started

**Requirements:** Node.js 20+ (CI and Docker run on Node 26)

```bash
pnpm install
pnpm dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Testing & CI

```bash
pnpm lint         # oxlint (.oxlintrc.json)
pnpm format:check # prettier --check
pnpm test         # vitest, packages/tests
```

CI (`.github/workflows/ci.yml`) runs lint, format check, build, test and a
Docker build-validation on every PR and on push to `main`.

## Docker

```bash
docker compose up --build
```

Opens on port `3001` — server serves the built client as static files.

## How to play

| Key   | Action     |
| ----- | ---------- |
| `↑ W` | Move up    |
| `↓ S` | Move down  |
| `← A` | Move left  |
| `→ D` | Move right |

Roads are one-way — plan your route. Pick up a bag, follow the nav arrow to the delivery point.

## Lobby

- **ИГРАТЬ** — join the lobby with your nickname
- **+ БОТ / − БОТ** — add or remove AI bots
- **НАЧАТЬ ИГРУ** — start a session (any player can start)
