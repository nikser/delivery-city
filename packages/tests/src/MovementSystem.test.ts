import { applyDirection, canMove } from '../../server/src/game/MovementSystem'
import { generateMap } from '../../server/src/map/MapGenerator'
import { MapData } from '../../shared/src/index'

describe('applyDirection', () => {
  test('right: x+1', () => expect(applyDirection(5, 5, 'right')).toEqual({ x: 6, y: 5 }))
  test('left: x-1',  () => expect(applyDirection(5, 5, 'left')).toEqual({ x: 4, y: 5 }))
  test('down: y+1',  () => expect(applyDirection(5, 5, 'down')).toEqual({ x: 5, y: 6 }))
  test('up: y-1',    () => expect(applyDirection(5, 5, 'up')).toEqual({ x: 5, y: 4 }))
  test('idle: без изменений', () => expect(applyDirection(5, 5, 'idle')).toEqual({ x: 5, y: 5 }))
})

describe('canMove — блокировки', () => {
  const map = generateMap()

  test('выход за границу: x < 0',  () => expect(canMove(0, 0, 'left', map)).toBe(false))
  test('выход за границу: y < 0',  () => expect(canMove(0, 0, 'up', map)).toBe(false))
  test('выход за границу: x >= 30', () => expect(canMove(29, 0, 'right', map)).toBe(false))
  test('выход за границу: y >= 30', () => expect(canMove(0, 29, 'down', map)).toBe(false))

  test('движение в BUILDING → false', () => {
    // Конструируем минимальную карту с BUILDING справа от INTERSECTION
    const buildingMap: MapData = {
      width: 3,
      height: 1,
      tiles: [['INTERSECTION', 'BUILDING', 'INTERSECTION']],
      spawnPoints: [],
    }
    expect(canMove(0, 0, 'right', buildingMap)).toBe(false)
  })

  // tiles[0][2] = ROAD_EAST → разрешено только 'right'
  test('ROAD_EAST: left → false',  () => expect(canMove(2, 0, 'left', map)).toBe(false))
  test('ROAD_EAST: up → false',    () => expect(canMove(2, 0, 'up', map)).toBe(false))
  test('ROAD_EAST: down → false',  () => expect(canMove(2, 0, 'down', map)).toBe(false))
})

describe('canMove — разрешения', () => {
  const map = generateMap()

  // ROAD_EAST at (2,0): y=0 road (y%5=0), x=2 non-road → ROAD_EAST
  test('ROAD_EAST: right → true', () => expect(canMove(2, 0, 'right', map)).toBe(true))

  // ROAD_WEST at (2,1): y=1 road (y%5=1), x=2 non-road → ROAD_WEST
  test('ROAD_WEST: left → true', () => expect(canMove(2, 1, 'left', map)).toBe(true))

  // ROAD_SOUTH at (0,2): x=0 road (x%5=0), y=2 non-road → ROAD_SOUTH
  test('ROAD_SOUTH: down → true', () => expect(canMove(0, 2, 'down', map)).toBe(true))

  // ROAD_NORTH at (1,2): x=1 road (x%5=1), y=2 non-road → ROAD_NORTH
  test('ROAD_NORTH: up → true', () => expect(canMove(1, 2, 'up', map)).toBe(true))

  // INTERSECTION at (1,1): x=1 road, y=1 road → все 4 направления ведут на walkable тайлы
  test('INTERSECTION: right → true', () => expect(canMove(1, 1, 'right', map)).toBe(true))
  test('INTERSECTION: left → true',  () => expect(canMove(1, 1, 'left', map)).toBe(true))
  test('INTERSECTION: up → true',    () => expect(canMove(1, 1, 'up', map)).toBe(true))
  test('INTERSECTION: down → true',  () => expect(canMove(1, 1, 'down', map)).toBe(true))
})

describe('canMove — реальная карта', () => {
  const map = generateMap()

  test('tiles[0][0] = INTERSECTION: right → true', () => expect(canMove(0, 0, 'right', map)).toBe(true))
  test('tiles[0][0] = INTERSECTION: down → true',  () => expect(canMove(0, 0, 'down', map)).toBe(true))
  test('tiles[0][2] = ROAD_EAST: right → true',    () => expect(canMove(2, 0, 'right', map)).toBe(true))
  test('tiles[0][2] = ROAD_EAST: left → false',    () => expect(canMove(2, 0, 'left', map)).toBe(false))
})
