import { Server } from 'socket.io'
import {
  Direction,
  GameState,
  MapData,
  PlayerState,
  ORDER_TTL_HELD,
  SESSION_DURATION,
  MOVE_DURATION,
} from '@delivery-city/shared'
import { generateMap } from '../map/MapGenerator'
import { generateId } from './IdGenerator'
import { OrderManager } from './OrderManager'
import { canMove, applyDirection } from './MovementSystem'
import { calculateDeliveryScore } from './ScoreSystem'
import { BotController } from '../bots/BotController'

const PLAYER_COLORS = [0xFF4444, 0x44FF44, 0x4444FF, 0xFFFF44, 0xFF44FF, 0x44FFFF, 0xFFAA44, 0xAA44FF]

export class GameRoom {
  readonly id: string
  private state: GameState
  private map: MapData
  private orderManager: OrderManager
  private inputQueues: Map<string, Direction>
  private moveTimers: Map<string, number>
  private moveStart: Map<string, number>
  private botController: BotController
  private disconnectTimers: Map<string, NodeJS.Timeout>
  private deliveryCount: Map<string, number>
  private gameLoopInterval: NodeJS.Timeout | null = null
  private sessionTimerInterval: NodeJS.Timeout | null = null
  private resetTimeout: NodeJS.Timeout | null = null

  constructor(
    private io: Server,
    private roomId: string
  ) {
    this.id = roomId
    this.map = generateMap()
    this.state = { tick: 0, sessionTimeLeft: 0, phase: 'lobby', players: {}, orders: {} }
    this.orderManager = new OrderManager(this.map)
    this.inputQueues = new Map()
    this.moveTimers = new Map()
    this.moveStart = new Map()
    this.botController = new BotController(this.map)
    this.disconnectTimers = new Map()
    this.deliveryCount = new Map()
  }

  addPlayer(socketId: string, nickname: string, isBot = false): void {
    const playerIndex = Object.keys(this.state.players).length
    const spawnPoints = this.map.spawnPoints
    const spawn = spawnPoints[playerIndex % spawnPoints.length]

    const player: PlayerState = {
      id: socketId,
      nickname,
      tileX: spawn.x,
      tileY: spawn.y,
      direction: 'idle',
      isMoving: false,
      moveProgress: 1,
      fromTileX: spawn.x,
      fromTileY: spawn.y,
      carryingOrderId: null,
      score: 0,
      isBot,
      color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
    }

    this.state.players[socketId] = player
    this.deliveryCount.set(socketId, 0)

    if (isBot) {
      this.botController.addBot(socketId)
    }
  }

  removePlayer(socketId: string): void {
    const player = this.state.players[socketId]
    if (!player) return

    if (player.isBot) {
      this.botController.removeBot(socketId)
    }

    if (player.carryingOrderId) {
      const orderId = player.carryingOrderId
      const timer = setTimeout(() => {
        const order = this.state.orders[orderId]
        if (order && order.status === 'assigned') {
          this.state.orders[orderId] = {
            ...order,
            assignedPlayerId: null,
            pickedUpAt: null,
            status: 'available',
            expiresAt: Date.now() + 15_000,
          }
        }
        this.disconnectTimers.delete(socketId)
      }, 5000)
      this.disconnectTimers.set(socketId, timer)
    }

    delete this.state.players[socketId]
    this.inputQueues.delete(socketId)
    this.moveTimers.delete(socketId)
    this.moveStart.delete(socketId)
  }

  private clearAllTimers(): void {
    if (this.gameLoopInterval) { clearInterval(this.gameLoopInterval); this.gameLoopInterval = null }
    if (this.sessionTimerInterval) { clearInterval(this.sessionTimerInterval); this.sessionTimerInterval = null }
    if (this.resetTimeout) { clearTimeout(this.resetTimeout); this.resetTimeout = null }
  }

  startSession(): void {
    this.clearAllTimers()
    this.state.phase = 'playing'
    this.state.sessionTimeLeft = SESSION_DURATION

    const targetCount = this.orderManager.getTargetOrderCount(Object.keys(this.state.players).length)
    for (let i = 0; i < targetCount; i++) {
      const order = this.orderManager.spawnOrder(this.state.orders)
      this.state.orders[order.id] = order
    }

    this.gameLoopInterval = setInterval(() => this.tick(), 50)
    this.sessionTimerInterval = setInterval(() => {
      this.state.sessionTimeLeft--
      if (this.state.sessionTimeLeft <= 0) {
        this.endSession()
      }
    }, 1000)
  }

  processInput(socketId: string, direction: Direction): void {
    this.inputQueues.set(socketId, direction)
  }

  getState(): GameState {
    return this.state
  }

  getLobbyPlayers(): Array<{ id: string; nickname: string }> {
    return Object.values(this.state.players).map((p) => ({ id: p.id, nickname: p.nickname }))
  }

  getMap(): MapData {
    return this.map
  }

  private tick(): void {
    this.state.tick++
    this.processMovement()
    this.checkPickupsAndDeliveries()
    this.checkOrderTimers()
    this.spawnMissingOrders()
    this.updateBots()
    this.broadcastTick()
  }

  private processMovement(): void {
    const now = Date.now()

    for (const player of Object.values(this.state.players)) {
      if (player.isMoving) {
        const finishAt = this.moveTimers.get(player.id) ?? 0
        if (now >= finishAt) {
          // Movement complete
          player.isMoving = false
          player.moveProgress = 1
          player.fromTileX = player.tileX
          player.fromTileY = player.tileY
          // Check pickup/delivery before chaining next move
          this.checkPickupDeliveryForPlayer(player)
          // Try to chain next move immediately in the same tick
          this.tryStartMove(player, now)
        } else {
          const start = this.moveStart.get(player.id) ?? now
          player.moveProgress = Math.min(1, (now - start) / MOVE_DURATION)
        }
      } else {
        this.tryStartMove(player, now)
      }
    }
  }

  private tryStartMove(player: PlayerState, now: number): void {
    const direction = this.inputQueues.get(player.id)
    if (!direction || direction === 'idle') {
      this.inputQueues.delete(player.id)
      return
    }
    if (canMove(player.tileX, player.tileY, direction, this.map)) {
      const { x: toX, y: toY } = applyDirection(player.tileX, player.tileY, direction)
      const occupied = Object.values(this.state.players).some(
        (other) => other.id !== player.id && other.tileX === toX && other.tileY === toY
      )
      if (!occupied) {
        player.direction = direction
        player.isMoving = true
        player.moveProgress = 0
        player.fromTileX = player.tileX
        player.fromTileY = player.tileY
        player.tileX = toX
        player.tileY = toY
        this.moveStart.set(player.id, now)
        this.moveTimers.set(player.id, now + MOVE_DURATION)
      }
    }
    // Keep direction in queue for next tick (chaining or retry after block)
  }

  private checkPickupDeliveryForPlayer(player: PlayerState): void {
    if (!player.carryingOrderId) {
      for (const order of Object.values(this.state.orders)) {
        if (
          order.status === 'available' &&
          order.pickupTile.x === player.tileX &&
          order.pickupTile.y === player.tileY
        ) {
          const assigned = this.orderManager.assignOrder(order, player.id)
          this.state.orders[order.id] = assigned
          player.carryingOrderId = order.id
          this.io.to(this.roomId).emit('order:pickedUp', { orderId: order.id, playerId: player.id })
          break
        }
      }
    } else {
      const order = this.state.orders[player.carryingOrderId]
      if (
        order &&
        order.status === 'assigned' &&
        order.deliveryTile.x === player.tileX &&
        order.deliveryTile.y === player.tileY
      ) {
        const { base, speedBonus, total } = calculateDeliveryScore(order.pickedUpAt!, ORDER_TTL_HELD)
        this.state.orders[order.id] = this.orderManager.completeOrder(order)
        player.carryingOrderId = null
        player.score += total
        this.deliveryCount.set(player.id, (this.deliveryCount.get(player.id) ?? 0) + 1)
        this.io.to(this.roomId).emit('order:delivered', {
          orderId: order.id,
          playerId: player.id,
          score: base,
          bonusScore: speedBonus,
        })
      }
    }
  }

  private checkPickupsAndDeliveries(): void {
    for (const player of Object.values(this.state.players)) {
      if (player.isMoving) continue
      this.checkPickupDeliveryForPlayer(player)
    }
  }

  private checkOrderTimers(): void {
    const now = Date.now()
    for (const order of Object.values(this.state.orders)) {
      if ((order.status === 'available' || order.status === 'assigned') && now >= order.expiresAt) {
        this.state.orders[order.id] = this.orderManager.expireOrder(order)

        if (order.status === 'assigned' && order.assignedPlayerId) {
          const player = this.state.players[order.assignedPlayerId]
          if (player) {
            player.carryingOrderId = null
          }
        }

        this.io.to(this.roomId).emit('order:expired', { orderId: order.id })
      }
    }
  }

  private spawnMissingOrders(): void {
    const active = Object.values(this.state.orders).filter(
      (o) => o.status === 'available' || o.status === 'assigned'
    )
    const target = this.orderManager.getTargetOrderCount(Object.keys(this.state.players).length)
    const toSpawn = target - active.length

    for (let i = 0; i < toSpawn; i++) {
      const order = this.orderManager.spawnOrder(this.state.orders)
      this.state.orders[order.id] = order
      this.io.to(this.roomId).emit('order:spawned', { order })
    }
  }

  private updateBots(): void {
    const botInputs = this.botController.tick(this.state.players, this.state.orders)
    for (const [id, dir] of botInputs) {
      this.processInput(id, dir)
    }
  }

  private broadcastTick(): void {
    this.io.to(this.roomId).emit('game:tick', {
      tick: this.state.tick,
      players: this.state.players,
      orders: this.state.orders,
      sessionTimeLeft: this.state.sessionTimeLeft,
    })
  }

  private endSession(): void {
    this.state.phase = 'results'
    this.clearAllTimers()

    const results = Object.values(this.state.players)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        deliveries: this.deliveryCount.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score)

    this.io.to(this.roomId).emit('session:end', { results })

    // Reset to lobby after 15s so a new session can start
    this.resetTimeout = setTimeout(() => this.forceResetToLobby(), 15_000)
  }

  forceResetToLobby(): void {
    this.clearAllTimers()
    this.state.orders = {}
    this.state.tick = 0
    this.state.sessionTimeLeft = 0
    this.state.phase = 'lobby'
    this.inputQueues.clear()
    this.moveTimers.clear()
    this.moveStart.clear()
    this.deliveryCount.clear()

    // Reset player scores and positions
    const spawnPoints = this.map.spawnPoints
    let i = 0
    for (const player of Object.values(this.state.players)) {
      const spawn = spawnPoints[i % spawnPoints.length]
      player.score = 0
      player.tileX = spawn.x
      player.tileY = spawn.y
      player.fromTileX = spawn.x
      player.fromTileY = spawn.y
      player.isMoving = false
      player.moveProgress = 1
      player.carryingOrderId = null
      i++
    }

    this.io.to(this.roomId).emit('lobby:update', { players: this.getLobbyPlayers() })
  }
}
