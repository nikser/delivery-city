import { generateMap, isWalkable, isRoadIndex } from '../../server/src/map/MapGenerator'
import { TileType } from '../../shared/src/index'

describe('MapGenerator', () => {
  const map = generateMap()

  test('map is 30x30', () => {
    expect(map.width).toBe(30)
    expect(map.height).toBe(30)
    expect(map.tiles.length).toBe(30)
    expect(map.tiles[0].length).toBe(30)
  })

  test('tiles[0][0] == INTERSECTION (x=0 road, y=0 road)', () => {
    expect(map.tiles[0][0]).toBe('INTERSECTION')
  })

  test('tiles[1][0] == INTERSECTION (x=0 road, y=1 road)', () => {
    expect(map.tiles[1][0]).toBe('INTERSECTION')
  })

  test('tiles[2][0] == ROAD_SOUTH (x=0 road, y=2 building, x%5==0)', () => {
    expect(map.tiles[2][0]).toBe('ROAD_SOUTH')
  })

  test('tiles[0][2] == ROAD_EAST (y=0 road, x=2 building, y%5==0)', () => {
    expect(map.tiles[0][2]).toBe('ROAD_EAST')
  })

  test('tiles[0][1] == INTERSECTION (x=1 road, y=0 road)', () => {
    expect(map.tiles[0][1]).toBe('INTERSECTION')
  })

  test('tiles[2][2] == BUILDING', () => {
    expect(map.tiles[2][2]).toBe('BUILDING')
  })

  test('all walkable tiles are connected (BFS from [0][0])', () => {
    const { tiles, width, height } = map
    const visited = Array.from({ length: height }, () => new Array(width).fill(false))
    const queue: Array<[number, number]> = [[0, 0]]
    visited[0][0] = true

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
    while (queue.length > 0) {
      const [y, x] = queue.shift()!
      for (const [dy, dx] of dirs) {
        const ny = y + dy
        const nx = x + dx
        if (ny >= 0 && ny < height && nx >= 0 && nx < width && !visited[ny][nx] && isWalkable(tiles[ny][nx])) {
          visited[ny][nx] = true
          queue.push([ny, nx])
        }
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isWalkable(tiles[y][x])) {
          expect(visited[y][x]).toBe(true)
        }
      }
    }
  })

  test('spawnPoints.length == 8, all coordinates are INTERSECTION', () => {
    expect(map.spawnPoints.length).toBe(8)
    for (const { x, y } of map.spawnPoints) {
      expect(map.tiles[y][x]).toBe('INTERSECTION')
    }
  })
})
