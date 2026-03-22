import { Direction, MapData, PlayerState, OrderState } from '@delivery-city/shared'
import { getAllowedDirections, isWalkable } from '../map/MapGenerator'

type BotPhase = 'idle' | 'moving_to_pickup' | 'moving_to_delivery'

interface BotState {
  phase: BotPhase
  path: Array<{ x: number; y: number }>
  targetOrderId: string | null
  carryingOrderId: string | null
  lastTileX: number
  lastTileY: number
  blockedTicks: number
}

export class BotController {
  private bots = new Map<string, BotState>()
  private intersections: Array<{ x: number; y: number }> = []

  constructor(private map: MapData) {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x] === 'INTERSECTION') {
          this.intersections.push({ x, y })
        }
      }
    }
  }

  addBot(id: string): void {
    this.bots.set(id, {
      phase: 'idle',
      path: [],
      targetOrderId: null,
      carryingOrderId: null,
      lastTileX: -1,
      lastTileY: -1,
      blockedTicks: 0,
    })
  }

  removeBot(id: string): void {
    this.bots.delete(id)
  }

  // Вызывается каждый тик. Возвращает Map<botId, Direction>
  tick(
    players: Record<string, PlayerState>,
    orders: Record<string, OrderState>
  ): Map<string, Direction> {
    const inputs = new Map<string, Direction>()
    const now = Date.now()

    for (const [id, botState] of this.bots) {
      const player = players[id]
      if (!player) continue

      // Пересчёт пути только когда остановились и путь кончился или сменился заказ
      if (!player.isMoving) {
        const orderChanged = player.carryingOrderId !== botState.carryingOrderId

        // Определяем застревание: бот стоит на месте несколько тиков подряд
        if (player.tileX === botState.lastTileX && player.tileY === botState.lastTileY) {
          botState.blockedTicks++
        } else {
          botState.blockedTicks = 0
          botState.lastTileX = player.tileX
          botState.lastTileY = player.tileY
        }

        if (botState.path.length === 0 || orderChanged || botState.blockedTicks > 3) {
          if (botState.blockedTicks > 3) botState.blockedTicks = 0
          botState.carryingOrderId = player.carryingOrderId
          this.updateBotState(id, botState, player, orders)
        }
      }

      // Сдвигаем путь пока текущий тайл (включая destination при движении) уже пройден
      while (botState.path.length > 0 &&
        botState.path[0].x === player.tileX &&
        botState.path[0].y === player.tileY) {
        botState.path.shift()
      }

      // Всегда готовим следующее направление — даже во время движения,
      // чтобы оно было в очереди к моменту завершения текущего хода
      if (botState.path.length > 0) {
        const nextTile = botState.path[0]
        const dir = this.getDirectionTo(player.tileX, player.tileY, nextTile.x, nextTile.y)
        const destTile = this.map.tiles[player.tileY]?.[player.tileX]
        if (dir && destTile && getAllowedDirections(destTile).includes(dir)) {
          inputs.set(id, dir)
        } else {
          botState.path = []
        }
      }
    }

    return inputs
  }

  private updateBotState(
    _id: string,
    botState: BotState,
    player: PlayerState,
    orders: Record<string, OrderState>
  ): void {
    if (player.carryingOrderId) {
      // Несём заказ → идём на доставку
      const order = orders[player.carryingOrderId]
      if (order) {
        botState.phase = 'moving_to_delivery'
        botState.path = this.findPath(
          { x: player.tileX, y: player.tileY },
          order.deliveryTile
        )
      }
    } else {
      // Ищем ближайший доступный заказ
      const available = Object.values(orders).filter(o => o.status === 'available')
      if (available.length === 0) {
        botState.phase = 'idle'
        this.wanderToRandom(botState, player)
        return
      }

      // Ближайший по длине BFS пути
      let best: { order: OrderState; path: Array<{x:number;y:number}> } | null = null
      for (const order of available) {
        const path = this.findPath(
          { x: player.tileX, y: player.tileY },
          order.pickupTile
        )
        if (path.length > 0 && (!best || path.length < best.path.length)) {
          best = { order, path }
        }
      }

      if (best) {
        botState.phase = 'moving_to_pickup'
        botState.targetOrderId = best.order.id
        botState.path = best.path
      } else {
        // Заказы есть, но недостижимы — блуждаем
        this.wanderToRandom(botState, player)
      }
    }
  }

  // A* по тайловой карте с учётом направлений дорог
  private findPath(
    from: { x: number; y: number },
    to: { x: number; y: number }
  ): Array<{ x: number; y: number }> {
    const key = (x: number, y: number) => `${x},${y}`
    const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y)

    // open: [f, g, x, y, prevKey]
    type Node = { f: number; g: number; x: number; y: number }
    const open = new Map<string, Node>()
    const closed = new Set<string>()
    const cameFrom = new Map<string, string>()  // key → prevKey

    const startKey = key(from.x, from.y)
    open.set(startKey, { f: h(from.x, from.y), g: 0, x: from.x, y: from.y })

    while (open.size > 0) {
      // Берём узел с наименьшим f
      let bestKey = ''
      let bestNode: Node | null = null
      for (const [k, node] of open) {
        if (!bestNode || node.f < bestNode.f) { bestKey = k; bestNode = node }
      }
      open.delete(bestKey)
      closed.add(bestKey)

      const { x, y, g } = bestNode!

      if (x === to.x && y === to.y) {
        // Восстанавливаем путь
        const path: Array<{ x: number; y: number }> = []
        let cur = bestKey
        while (cameFrom.has(cur)) {
          const [cx, cy] = cur.split(',').map(Number)
          path.unshift({ x: cx, y: cy })
          cur = cameFrom.get(cur)!
        }
        return path
      }

      const tile = this.map.tiles[y]?.[x]
      if (!tile) continue

      for (const dir of getAllowedDirections(tile)) {
        let nx = x, ny = y
        if (dir === 'right') nx++
        else if (dir === 'left') nx--
        else if (dir === 'down') ny++
        else if (dir === 'up') ny--

        if (nx < 0 || nx >= this.map.width || ny < 0 || ny >= this.map.height) continue
        const nextTile = this.map.tiles[ny]?.[nx]
        if (!nextTile || !isWalkable(nextTile)) continue

        const nk = key(nx, ny)
        if (closed.has(nk)) continue

        const ng = g + 1
        const existing = open.get(nk)
        if (!existing || ng < existing.g) {
          cameFrom.set(nk, bestKey)
          open.set(nk, { f: ng + h(nx, ny), g: ng, x: nx, y: ny })
        }
      }
    }

    return []  // путь не найден
  }

  private getDirectionTo(
    fromX: number, fromY: number,
    toX: number, toY: number
  ): Direction | null {
    if (toX > fromX) return 'right'
    if (toX < fromX) return 'left'
    if (toY > fromY) return 'down'
    if (toY < fromY) return 'up'
    return null
  }

  private wanderToRandom(botState: BotState, player: PlayerState): void {
    if (this.intersections.length === 0) return
    // Выбираем случайный перекрёсток, не совпадающий с текущей позицией
    const candidates = this.intersections.filter(
      i => i.x !== player.tileX || i.y !== player.tileY
    )
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    botState.path = this.findPath({ x: player.tileX, y: player.tileY }, target)
  }

  hasBot(id: string): boolean {
    return this.bots.has(id)
  }
}
