import { OrderManager } from '../../server/src/game/OrderManager'
import { generateMap, isWalkable } from '../../server/src/map/MapGenerator'
import { ORDER_TTL_MAP, ORDER_TTL_HELD } from '../../shared/src/index'

const map = generateMap()
const manager = new OrderManager(map)

describe('spawnOrder', () => {
  test('status = available', () => {
    const order = manager.spawnOrder({})
    expect(order.status).toBe('available')
  })

  test('pickupTile != deliveryTile', () => {
    const order = manager.spawnOrder({})
    const same = order.pickupTile.x === order.deliveryTile.x && order.pickupTile.y === order.deliveryTile.y
    expect(same).toBe(false)
  })

  test('manhattan-дистанция между pickup и delivery >= 5', () => {
    const order = manager.spawnOrder({})
    const dist = Math.abs(order.deliveryTile.x - order.pickupTile.x) + Math.abs(order.deliveryTile.y - order.pickupTile.y)
    expect(dist).toBeGreaterThanOrEqual(5)
  })

  test('expiresAt ≈ Date.now() + ORDER_TTL_MAP (±100ms)', () => {
    const before = Date.now()
    const order = manager.spawnOrder({})
    const after = Date.now()
    expect(order.expiresAt).toBeGreaterThanOrEqual(before + ORDER_TTL_MAP - 100)
    expect(order.expiresAt).toBeLessThanOrEqual(after + ORDER_TTL_MAP + 100)
  })

  test('pickupTile isWalkable = true', () => {
    const order = manager.spawnOrder({})
    expect(isWalkable(map.tiles[order.pickupTile.y][order.pickupTile.x])).toBe(true)
  })
})

describe('assignOrder', () => {
  test('status = assigned', () => {
    const order = manager.spawnOrder({})
    const assigned = manager.assignOrder(order, 'player1')
    expect(assigned.status).toBe('assigned')
  })

  test('assignedPlayerId установлен', () => {
    const order = manager.spawnOrder({})
    const assigned = manager.assignOrder(order, 'player1')
    expect(assigned.assignedPlayerId).toBe('player1')
  })

  test('pickedUpAt != null', () => {
    const order = manager.spawnOrder({})
    const assigned = manager.assignOrder(order, 'player1')
    expect(assigned.pickedUpAt).not.toBeNull()
  })

  test('expiresAt обновлён ≈ Date.now() + ORDER_TTL_HELD (±100ms)', () => {
    const order = manager.spawnOrder({})
    const before = Date.now()
    const assigned = manager.assignOrder(order, 'player1')
    const after = Date.now()
    expect(assigned.expiresAt).toBeGreaterThanOrEqual(before + ORDER_TTL_HELD - 100)
    expect(assigned.expiresAt).toBeLessThanOrEqual(after + ORDER_TTL_HELD + 100)
  })
})

describe('completeOrder', () => {
  test('status = delivered', () => {
    const order = manager.spawnOrder({})
    const assigned = manager.assignOrder(order, 'player1')
    const completed = manager.completeOrder(assigned)
    expect(completed.status).toBe('delivered')
  })
})

describe('expireOrder', () => {
  test('status = expired', () => {
    const order = manager.spawnOrder({})
    const expired = manager.expireOrder(order)
    expect(expired.status).toBe('expired')
  })
})

describe('getTargetOrderCount', () => {
  test('0 игроков → 3', () => expect(manager.getTargetOrderCount(0)).toBe(3))
  test('1 игрок → 3',   () => expect(manager.getTargetOrderCount(1)).toBe(3))
  test('2 игрока → 4',  () => expect(manager.getTargetOrderCount(2)).toBe(4))
  test('5 игроков → 10', () => expect(manager.getTargetOrderCount(5)).toBe(10))
})

describe('findRandomWalkableTile', () => {
  test('тайл isWalkable = true', () => {
    const tile = manager.findRandomWalkableTile([])
    expect(isWalkable(map.tiles[tile.y][tile.x])).toBe(true)
  })

  test('не возвращает тайл из exclude списка', () => {
    // Первый вызов — получаем тайл
    const tile = manager.findRandomWalkableTile([])
    // Второй вызов с этим тайлом в exclude
    const tile2 = manager.findRandomWalkableTile([tile])
    const same = tile2.x === tile.x && tile2.y === tile.y
    expect(same).toBe(false)
  })
})
