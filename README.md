# Delivery City

Multiplayer top-down delivery game. Race against other players to pick up and deliver orders across a city grid as fast as possible.

![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Node.js](https://img.shields.io/badge/Node.js-20-green)
![Phaser](https://img.shields.io/badge/Phaser-3.x-orange)

## Gameplay

- Navigate a one-way road city grid
- Pick up orders (paper bag icons) and deliver them to marked destinations
- Score points for each delivery — speed bonuses for fast deliveries
- Compete with other players and bots in 5-minute sessions

## Stack

| Layer | Tech |
|-------|------|
| Client | Phaser 3, TypeScript, Vite |
| Server | Node.js, Express, Socket.io |
| Shared | TypeScript types + constants |
| Monorepo | npm workspaces |

## Project structure

```
packages/
  shared/   # Shared types, constants, game config
  server/   # Game server (authoritative, 20 ticks/sec)
  client/   # Phaser 3 browser client
```

## Getting started

**Requirements:** Node.js 20+

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Docker

```bash
docker compose up --build
```

Opens on port `3001` — server serves the built client as static files.

## How to play

| Key | Action |
|-----|--------|
| `↑ W` | Move up |
| `↓ S` | Move down |
| `← A` | Move left |
| `→ D` | Move right |

Roads are one-way — plan your route. Pick up a bag, follow the nav arrow to the delivery point.

## Lobby

- **ИГРАТЬ** — join the lobby with your nickname
- **+ БОТ / − БОТ** — add or remove AI bots
- **НАЧАТЬ ИГРУ** — start a session (any player can start)
