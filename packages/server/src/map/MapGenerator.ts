import { Direction, MapData, TileType } from '@delivery-city/shared'

export function isRoadIndex(i: number): boolean {
  return i % 5 === 0 || i % 5 === 1
}

export function generateMap(): MapData {
  const size = 32
  const tiles: TileType[][] = []

  for (let y = 0; y < size; y++) {
    const row: TileType[] = []
    for (let x = 0; x < size; x++) {
      const rx = isRoadIndex(x)
      const ry = isRoadIndex(y)

      if (rx && ry) {
        row.push('INTERSECTION')
      } else if (ry && !rx) {
        row.push(y % 5 === 0 ? 'ROAD_EAST' : 'ROAD_WEST')
      } else if (rx && !ry) {
        row.push(x % 5 === 0 ? 'ROAD_SOUTH' : 'ROAD_NORTH')
      } else {
        row.push('BUILDING')
      }
    }
    tiles.push(row)
  }

  // Collect all INTERSECTION tiles across the whole map
  const allIntersections: Array<{ x: number; y: number }> = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (tiles[y][x] === 'INTERSECTION') allIntersections.push({ x, y })
    }
  }

  // Pick 16 evenly distributed spawn points from all intersections
  const spawnPoints: Array<{ x: number; y: number }> = []
  const count = 16
  const step = allIntersections.length / count
  for (let i = 0; i < count; i++) {
    spawnPoints.push(allIntersections[Math.floor(i * step)])
  }

  return { width: size, height: size, tiles, spawnPoints }
}

export function isWalkable(tile: TileType): boolean {
  return tile !== 'BUILDING'
}

export function getAllowedDirections(tile: TileType): Direction[] {
  switch (tile) {
    case 'ROAD_EAST':     return ['right']
    case 'ROAD_WEST':     return ['left']
    case 'ROAD_SOUTH':    return ['down']
    case 'ROAD_NORTH':    return ['up']
    case 'INTERSECTION':  return ['up', 'down', 'left', 'right']
    case 'BUILDING':      return []
  }
}
