# Delivery City — Claude Instructions

## Project overview

Online multiplayer arcade game. Top-down delivery cars, no registration required.
5-minute casual sessions, bot fill-in for missing players.

**Stack:** Node.js + Socket.io (server) · Vite + Phaser.js (client) · Jest (tests) · npm workspaces monorepo

```
packages/
  shared/   — types, constants, shared logic
  server/   — authoritative game server (20 ticks/sec)
  client/   — Phaser 3 client, pixel-art style
  tests/    — Jest integration/unit tests
```

## Architecture rules

- **Server-authoritative.** All game state lives on the server. The client only renders and sends inputs.
- **No sprites.** Visuals are drawn with Phaser Graphics API (pixel art).
- **Map:** 30×30 tiles. Block = 2 road + 3 building = 5 tiles. 6 blocks total.
  - Road column indices: 0,1 | 5,6 | 10,11 | 15,16 | 20,21 | 25,26
  - Lane types: `ROAD_EAST` / `ROAD_WEST` / `ROAD_NORTH` / `ROAD_SOUTH` / `INTERSECTION`
- **Collision:** cars never pass through each other.
- **Bots:** BFS navigation, seamlessly replaced by real players on join.
- **Records:** stored in `localStorage` (client-side only).

## Development conventions

- TypeScript everywhere. Shared types live in `packages/shared`.
- Validate movement against lane direction — always check `ROAD_*` direction when writing movement or BFS logic.
- Do not add auth, login, or session persistence — the game is intentionally anonymous.
- Do not add features beyond what is asked. No speculative abstractions.
- Keep server and client concerns strictly separated — no game logic in the client.
- Write tests for new server-side logic in `packages/tests`.

## Security

- Never trust client-supplied positions or scores — validate on the server.
- Do not introduce `eval`, `Function()`, or dynamic `require()`.
- No secrets, API keys, or credentials in source code or committed files.
- Socket.io event handlers must validate all incoming payloads before processing.

## Git workflow

**Small change** (bug fix, typo, config tweak) — commit directly to `main`.

**Big change** (new feature, refactor, multi-file work) — use a branch:

```bash
git checkout -b feat/short-description   # or fix/, refactor/, chore/
# ... make changes ...
git merge main --no-ff                   # merge back when done
git branch -d feat/short-description
```

### Commit message format

```
<type>: <what changed, plain English>
```

Types: `feat` · `fix` · `refactor` · `chore` · `test` · `docs`

Rules:
- Lowercase, no period at the end
- One line is enough for small commits
- Add a blank line + short body only if the why isn't obvious

**Good examples:**
```
feat: add delivery timer to HUD
fix: bots no longer freeze at intersections
chore: bump Socket.io to 4.7
refactor: extract BFS logic into separate module
```

**Avoid:**
```
fixed stuff
WIP
update
```

## Commands

```bash
npm run dev          # start server + client (hot reload)
npm run build        # full production build
npm run test         # run Jest suite
npm run build:image  # build Docker image (linux/amd64)
npm run image:build:push  # build + push to Docker Hub
```
