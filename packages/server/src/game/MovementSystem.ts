import { Direction, MapData } from '@delivery-city/shared'
import { getAllowedDirections, isWalkable } from '../map/MapGenerator'

export function applyDirection(
  x: number,
  y: number,
  direction: Direction
): { x: number; y: number } {
  switch (direction) {
    case 'up':    return { x, y: y - 1 }
    case 'down':  return { x, y: y + 1 }
    case 'left':  return { x: x - 1, y }
    case 'right': return { x: x + 1, y }
    case 'idle':  return { x, y }
  }
}

export function canMove(
  fromX: number,
  fromY: number,
  direction: Direction,
  map: MapData
): boolean {
  const { x: toX, y: toY } = applyDirection(fromX, fromY, direction)

  if (toX < 0 || toX >= map.width || toY < 0 || toY >= map.height) {
    return false
  }

  const currentTile = map.tiles[fromY][fromX]
  const allowedDirs = getAllowedDirections(currentTile)
  if (!allowedDirs.includes(direction)) {
    return false
  }

  const targetTile = map.tiles[toY][toX]
  if (!isWalkable(targetTile)) {
    return false
  }

  return true
}
