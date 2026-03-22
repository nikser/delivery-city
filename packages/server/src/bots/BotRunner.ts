import { io } from 'socket.io-client'
import type { Direction } from '@delivery-city/shared'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001'
const BOT_COUNT = parseInt(process.env.BOT_COUNT || '2')

for (let i = 0; i < BOT_COUNT; i++) {
  const socket = io(SERVER_URL)
  const nickname = `Bot_${i + 1}`

  socket.on('connect', () => {
    console.log(`${nickname} connected`)
    socket.emit('player:join', { nickname })
  })

  socket.on('lobby:update', (data: { players: Array<{ id: string; nickname: string }> }) => {
    // Первый бот запускает игру если в лобби 2+ игроков
    if (i === 0 && data.players.length >= 2) {
      setTimeout(() => socket.emit('session:start'), 1000)
    }
  })

  socket.on('game:start', () => {
    console.log(`${nickname} game started`)
  })

  socket.on('game:tick', (data: { players: Record<string, { isMoving: boolean }> }) => {
    const player = data.players[socket.id!]
    if (!player || player.isMoving) return

    // Простое движение: случайное направление для демонстрации
    // (настоящий AI работает на сервере)
    const dirs: Direction[] = ['up', 'down', 'left', 'right']
    const dir = dirs[Math.floor(Math.random() * dirs.length)]
    socket.emit('player:input', { direction: dir, inputSeq: Date.now() })
  })

  socket.on('session:end', (data: { results: Array<{ id: string; nickname: string; score: number; deliveries: number }> }) => {
    console.log(`${nickname} session ended:`, data.results)
  })
}

console.log(`Starting ${BOT_COUNT} bots connecting to ${SERVER_URL}`)
