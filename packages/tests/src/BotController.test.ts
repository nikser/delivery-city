import { BotController } from '../../server/src/bots/BotController'
import { generateMap, getAllowedDirections, isWalkable } from '../../server/src/map/MapGenerator'
import { PlayerState, OrderState } from '../../shared/src/index'

const map = generateMap()

function makePlayer(id: string, x: number, y: number, carryingOrderId: string | null = null): PlayerState {
  return {
    id,
    nickname: 'Bot',
    tileX: x,
    tileY: y,
    direction: 'idle',
    isMoving: false,
    moveProgress: 1,
    fromTileX: x,
    fromTileY: y,
    carryingOrderId,
    score: 0,
    isBot: true,
    color: 0xFF4444,
  }
}

function makeOrder(
  id: string,
  px: number, py: number,
  dx: number, dy: number,
  status: OrderState['status'] = 'available',
  assignedPlayerId: string | null = null
): OrderState {
  return {
    id,
    pickupTile: { x: px, y: py },
    deliveryTile: { x: dx, y: dy },
    assignedPlayerId,
    spawnedAt: Date.now(),
    pickedUpAt: status === 'assigned' ? Date.now() : null,
    expiresAt: Date.now() + 45_000,
    status,
  }
}

describe('BotController.bfs', () => {
  const bot = new BotController(map)

  test('от INTERSECTION [0,0] до INTERSECTION [5,0]: путь не пустой', () => {
    const path = bot.bfs({ x: 0, y: 0 }, { x: 5, y: 0 })
    expect(path.length).toBeGreaterThan(0)
  })

  test('все тайлы в пути walkable', () => {
    const path = bot.bfs({ x: 0, y: 0 }, { x: 5, y: 0 })
    for (const tile of path) {
      expect(isWalkable(map.tiles[tile.y][tile.x])).toBe(true)
    }
  })

  test('путь соблюдает направления полос', () => {
    const path = bot.bfs({ x: 0, y: 0 }, { x: 5, y: 0 })
    const fullPath = [{ x: 0, y: 0 }, ...path]

    for (let i = 0; i < path.length; i++) {
      const from = fullPath[i]
      const to = fullPath[i + 1]
      const dx = to.x - from.x
      const dy = to.y - from.y

      let dir: 'right' | 'left' | 'down' | 'up'
      if (dx > 0) dir = 'right'
      else if (dx < 0) dir = 'left'
      else if (dy > 0) dir = 'down'
      else dir = 'up'

      const allowed = getAllowedDirections(map.tiles[from.y][from.x])
      expect(allowed).toContain(dir)
    }
  })

  test('нет пути к BUILDING → возвращает []', () => {
    // tiles[2][2] = BUILDING (x=2, y=2: оба не road-индексы)
    expect(map.tiles[2][2]).toBe('BUILDING')
    const path = bot.bfs({ x: 0, y: 0 }, { x: 2, y: 2 })
    expect(path).toEqual([])
  })
})

describe('BotController.tick', () => {
  test('без заказов: inputs пустой', () => {
    const bot = new BotController(map)
    const player = makePlayer('bot1', 0, 0)
    bot.addBot('bot1')
    const inputs = bot.tick({ bot1: player }, {})
    expect(inputs.has('bot1')).toBe(false)
  })

  test('есть доступный заказ: бот движется к нему (inputs не пустой)', () => {
    const bot = new BotController(map)
    const player = makePlayer('bot1', 0, 0)
    // Пикап на (5,0) INTERSECTION, доставка на (25,0)
    const orders = { order1: makeOrder('order1', 5, 0, 25, 0, 'available') }
    bot.addBot('bot1')
    const inputs = bot.tick({ bot1: player }, orders)
    expect(inputs.has('bot1')).toBe(true)
  })

  test('несёт заказ: бот движется к deliveryTile', () => {
    const bot = new BotController(map)
    // Бот в (0,0), несёт order1, доставка на (25,0)
    const player = makePlayer('bot1', 0, 0, 'order1')
    const orders = { order1: makeOrder('order1', 2, 0, 25, 0, 'assigned', 'bot1') }
    bot.addBot('bot1')
    const inputs = bot.tick({ bot1: player }, orders)
    expect(inputs.has('bot1')).toBe(true)
  })
})
