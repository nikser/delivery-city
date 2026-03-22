import { MapData, OrderState, ORDER_TTL_MAP, ORDER_TTL_HELD, ORDER_MAX_DISTANCE } from '@delivery-city/shared'
import { isWalkable } from '../map/MapGenerator'
import { generateId } from './IdGenerator'

export class OrderManager {
  constructor(private map: MapData) {}

  spawnOrder(existingOrders: Record<string, OrderState>): OrderState {
    const usedTiles = Object.values(existingOrders).flatMap((o) => [o.pickupTile, o.deliveryTile])

    let pickup: { x: number; y: number }
    let delivery: { x: number; y: number }

    do {
      pickup = this.findRandomWalkableTile(usedTiles)
    } while (this.map.tiles[pickup.y][pickup.x] === 'INTERSECTION')

    do {
      delivery = this.findRandomWalkableTile([...usedTiles, pickup])
      const manhattan = Math.abs(delivery.x - pickup.x) + Math.abs(delivery.y - pickup.y)
      if (
        this.map.tiles[delivery.y][delivery.x] !== 'INTERSECTION' &&
        manhattan >= 5 &&
        manhattan <= ORDER_MAX_DISTANCE
      ) {
        break
      }
    } while (true)

    const order: OrderState = {
      id: generateId('order'),
      pickupTile: pickup,
      deliveryTile: delivery,
      assignedPlayerId: null,
      spawnedAt: Date.now(),
      pickedUpAt: null,
      expiresAt: Date.now() + ORDER_TTL_MAP,
      status: 'available',
    }

    return order
  }

  assignOrder(order: OrderState, playerId: string): OrderState {
    return {
      ...order,
      assignedPlayerId: playerId,
      pickedUpAt: Date.now(),
      status: 'assigned',
      expiresAt: Date.now() + ORDER_TTL_HELD,
    }
  }

  completeOrder(order: OrderState): OrderState {
    return { ...order, status: 'delivered' }
  }

  expireOrder(order: OrderState): OrderState {
    return { ...order, status: 'expired' }
  }

  getTargetOrderCount(playerCount: number): number {
    return Math.max(3, playerCount * 2)
  }

  findRandomWalkableTile(exclude: Array<{ x: number; y: number }>): { x: number; y: number } {
    const excludeSet = new Set(exclude.map((t) => `${t.x},${t.y}`))
    const { width, height, tiles } = this.map

    let attempts = 0
    while (attempts < 1000) {
      const x = Math.floor(Math.random() * width)
      const y = Math.floor(Math.random() * height)
      if (isWalkable(tiles[y][x]) && !excludeSet.has(`${x},${y}`)) {
        return { x, y }
      }
      attempts++
    }

    // Fallback: scan all tiles
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isWalkable(tiles[y][x]) && !excludeSet.has(`${x},${y}`)) {
          return { x, y }
        }
      }
    }

    throw new Error('No walkable tile found')
  }
}
