import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { GameRoom } from './game/GameRoom'
import { generateId } from './game/IdGenerator'
import { BOT_SPEEDS } from '@delivery-city/shared'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// Serve client static files (path relative to compiled dist/index.js)
app.use(express.static(path.join(__dirname, '../../client/dist')))

const rooms = new Map<string, GameRoom>()
let defaultRoom: GameRoom

function getOrCreateDefaultRoom(): GameRoom {
  if (!defaultRoom) {
    defaultRoom = new GameRoom(io, 'main')
    rooms.set('main', defaultRoom)
  }
  return defaultRoom
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id)
  const room = getOrCreateDefaultRoom()

  socket.on('player:join', ({ nickname }) => {
    socket.join('main')
    room.addPlayer(socket.id, nickname || `Courier_${socket.id.slice(0, 4)}`)
    io.to('main').emit('lobby:update', { players: room.getLobbyPlayers() })

    if (room.getState().phase === 'playing') {
      // Опоздавший — отправить текущее состояние
      socket.emit('game:start', { map: room.getMap(), state: room.getState() })
    }
  })

  socket.on('player:leave', () => {
    room.removePlayer(socket.id)
    io.to('main').emit('lobby:update', { players: room.getLobbyPlayers() })
    socket.leave('main')
  })

  socket.on('player:input', ({ direction }) => {
    room.processInput(socket.id, direction)
  })

  socket.on('bot:add', ({ difficulty }) => {
    if (room.getState().phase !== 'lobby') return
    const botId = generateId('bot')
    const botNum = Object.values(room.getState().players).filter(p => p.isBot).length + 1
    const speedMap: Record<string, number> = { slow: BOT_SPEEDS[0], medium: BOT_SPEEDS[1], fast: BOT_SPEEDS[2] }
    room.addPlayer(botId, `Bot_${botNum}`, true, speedMap[difficulty] ?? BOT_SPEEDS[1])
    io.to('main').emit('lobby:update', { players: room.getLobbyPlayers() })
  })

  socket.on('bot:remove', () => {
    if (room.getState().phase !== 'lobby') return
    const bots = Object.values(room.getState().players).filter(p => p.isBot)
    if (bots.length === 0) return
    const last = bots[bots.length - 1]
    room.removePlayer(last.id)
    io.to('main').emit('lobby:update', { players: room.getLobbyPlayers() })
  })

  socket.on('session:start', () => {
    if (room.getState().phase !== 'lobby') return
    room.startSession()
    io.to('main').emit('game:start', { map: room.getMap(), state: room.getState() })
  })

  socket.on('disconnect', () => {
    room.removePlayer(socket.id)
    io.to('main').emit('player:disconnected', { playerId: socket.id })
    io.to('main').emit('lobby:update', { players: room.getLobbyPlayers() })
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
