import * as Sentry from '@sentry/node'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.2,
  })
}

import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import fs from 'fs'
import { GameRoom } from './game/GameRoom'
import { generateId } from './game/IdGenerator'
import { BOT_SPEEDS, BotDifficulty } from '@delivery-city/shared'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// Serve client static files (path relative to compiled dist/index.js)
const clientDistPath = path.join(__dirname, '../../client/dist')
app.use(express.static(clientDistPath))

const gaId = process.env.GA_MEASUREMENT_ID
let indexHtml = fs.readFileSync(path.join(clientDistPath, 'index.html'), 'utf-8')
if (gaId) {
  indexHtml = indexHtml.replace(
    '</head>',
    `  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaId}');
  </script>
</head>`
  )
}

app.get('*', (_req, res) => res.send(indexHtml))

const rooms = new Map<string, GameRoom>()
// Maps socketId → roomCode
const socketRooms = new Map<string, string>()

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  // Ensure uniqueness
  if (rooms.has(code)) return generateCode()
  return code
}

function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code)
}

function hasHumanPlayers(room: GameRoom): boolean {
  return Object.values(room.getState().players).some((p) => !p.isBot)
}

function cleanupRoomIfEmpty(code: string, room: GameRoom): void {
  if (!hasHumanPlayers(room)) {
    rooms.delete(code)
  }
}

function lobbyBroadcast(code: string, room: GameRoom): void {
  io.to(code).emit('lobby:update', {
    players: room.getLobbyPlayers(),
    difficulty: room.getLobbyDifficulty(),
  })
}

// Detaches socket from its current room (socket.io membership + socketRooms map).
// Does NOT delete the room — callers that permanently leave handle that separately.
function leaveCurrentRoom(socketId: string): void {
  const code = socketRooms.get(socketId)
  if (!code) return
  const room = rooms.get(code)
  if (room) {
    room.removePlayer(socketId)
    lobbyBroadcast(code, room)
  }
  const socket = io.sockets.sockets.get(socketId)
  socket?.leave(code)
  socketRooms.delete(socketId)
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id)
  if (process.env.SENTRY_DSN) Sentry.addBreadcrumb({ category: 'socket', message: 'client connected', data: { id: socket.id } })

  socket.on('room:create', () => {
    const prevCode = socketRooms.get(socket.id)
    leaveCurrentRoom(socket.id)
    if (prevCode) {
      const prevRoom = rooms.get(prevCode)
      if (prevRoom && !hasHumanPlayers(prevRoom)) rooms.delete(prevCode)
    }
    const code = generateCode()
    const room = new GameRoom(io, code)
    rooms.set(code, room)
    socket.join(code)
    socketRooms.set(socket.id, code)
    socket.emit('room:created', { code, players: room.getLobbyPlayers(), difficulty: room.getLobbyDifficulty() })
  })

  socket.on('room:join', ({ code }) => {
    const normalised = code.trim().toUpperCase()
    const room = getRoom(normalised)
    if (!room) {
      socket.emit('room:error', { message: 'Комната не найдена' })
      return
    }
    leaveCurrentRoom(socket.id)
    socket.join(normalised)
    socketRooms.set(socket.id, normalised)
    socket.emit('room:joined', {
      code: normalised,
      players: room.getLobbyPlayers(),
      difficulty: room.getLobbyDifficulty(),
      phase: room.getState().phase,
    })
    if (room.getState().phase === 'lobby') {
      lobbyBroadcast(normalised, room)
    }
  })

  socket.on('player:join', ({ nickname }) => {
    const code = socketRooms.get(socket.id)
    if (!code) return
    const room = getRoom(code)
    if (!room) return
    room.addPlayer(socket.id, nickname || `Courier_${socket.id.slice(0, 4)}`)
    lobbyBroadcast(code, room)

    if (room.getState().phase === 'playing') {
      socket.emit('game:start', { map: room.getMap(), state: room.getState() })
    }
  })

  socket.on('player:leave', () => {
    const code = socketRooms.get(socket.id)
    if (!code) return
    const room = getRoom(code)
    if (!room) return
    room.removePlayer(socket.id)
    lobbyBroadcast(code, room)
  })

  socket.on('player:input', ({ direction }) => {
    const code = socketRooms.get(socket.id)
    if (!code) return
    getRoom(code)?.processInput(socket.id, direction)
  })

  socket.on('bot:difficulty', ({ difficulty }) => {
    const code = socketRooms.get(socket.id)
    if (!code) return
    const room = getRoom(code)
    if (!room || room.getState().phase !== 'lobby') return
    if (!room.getState().players[socket.id]) return
    room.setLobbyDifficulty(difficulty as BotDifficulty)
    lobbyBroadcast(code, room)
  })

  socket.on('bot:add', () => {
    const code = socketRooms.get(socket.id)
    if (!code) return
    const room = getRoom(code)
    if (!room || room.getState().phase !== 'lobby') return
    if (!room.getState().players[socket.id]) return
    const botId = generateId('bot')
    const botNum = Object.values(room.getState().players).filter(p => p.isBot).length + 1
    const speedMap: Record<string, number> = { slow: BOT_SPEEDS[0], medium: BOT_SPEEDS[1], fast: BOT_SPEEDS[2] }
    room.addPlayer(botId, `Bot_${botNum}`, true, speedMap[room.getLobbyDifficulty()] ?? BOT_SPEEDS[1])
    lobbyBroadcast(code, room)
  })

  socket.on('bot:remove', () => {
    const code = socketRooms.get(socket.id)
    if (!code) return
    const room = getRoom(code)
    if (!room || room.getState().phase !== 'lobby') return
    if (!room.getState().players[socket.id]) return
    const bots = Object.values(room.getState().players).filter(p => p.isBot)
    if (bots.length === 0) return
    const last = bots[bots.length - 1]
    room.removePlayer(last.id)
    lobbyBroadcast(code, room)
  })

  socket.on('session:start', () => {
    const code = socketRooms.get(socket.id)
    if (!code) return
    const room = getRoom(code)
    if (!room || room.getState().phase !== 'lobby') return
    if (!room.getState().players[socket.id]) return
    room.startSession()
    if (process.env.SENTRY_DSN) {
      const state = room.getState()
      const players = Object.values(state.players)
      Sentry.captureEvent({
        message: 'game_session_started',
        level: 'info',
        extra: {
          roomCode: code,
          playerCount: players.filter(p => !p.isBot).length,
          botCount: players.filter(p => p.isBot).length,
        },
      })
    }
    io.to(code).emit('game:start', { map: room.getMap(), state: room.getState() })
  })

  socket.on('disconnect', () => {
    const code = socketRooms.get(socket.id)
    if (code) {
      const room = getRoom(code)
      if (room) {
        room.removePlayer(socket.id)
        io.to(code).emit('player:disconnected', { playerId: socket.id })
        lobbyBroadcast(code, room)
        // Clean up rooms with no human players
        cleanupRoomIfEmpty(code, room)
      }
    }
    socketRooms.delete(socket.id)
  })
})

// Sentry error handler must be registered after routes
if (process.env.SENTRY_DSN) {
  app.use(Sentry.expressErrorHandler())
}

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
  if (process.env.SENTRY_DSN) Sentry.captureException(reason)
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
