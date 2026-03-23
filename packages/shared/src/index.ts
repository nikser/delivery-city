export type Direction = 'up' | 'down' | 'left' | 'right' | 'idle'

export type TileType =
  | 'ROAD_EAST'
  | 'ROAD_WEST'
  | 'ROAD_SOUTH'
  | 'ROAD_NORTH'
  | 'INTERSECTION'
  | 'BUILDING'

export interface Tile {
  type: TileType
  x: number
  y: number
}

export interface MapData {
  width: number
  height: number
  tiles: TileType[][]
  spawnPoints: Array<{ x: number; y: number }>
}

export type OrderStatus = 'available' | 'assigned' | 'delivered' | 'expired'

export interface OrderState {
  id: string
  pickupTile: { x: number; y: number }
  deliveryTile: { x: number; y: number }
  assignedPlayerId: string | null
  spawnedAt: number
  pickedUpAt: number | null
  expiresAt: number
  status: OrderStatus
}

export interface PlayerState {
  id: string
  nickname: string
  tileX: number
  tileY: number
  direction: Direction
  isMoving: boolean
  moveProgress: number
  moveDuration: number
  fromTileX: number
  fromTileY: number
  carryingOrderId: string | null
  score: number
  isBot: boolean
  color: number
}

export interface GameState {
  tick: number
  sessionTimeLeft: number
  phase: 'lobby' | 'playing' | 'results'
  players: Record<string, PlayerState>
  orders: Record<string, OrderState>
}

export type BotDifficulty = 'slow' | 'medium' | 'fast'

export interface ClientToServerEvents {
  'room:create': () => void
  'room:join': (data: { code: string }) => void
  'player:join': (data: { nickname: string }) => void
  'player:leave': () => void
  'player:input': (data: { direction: Direction; inputSeq: number }) => void
  'session:start': () => void
  'bot:add': () => void
  'bot:remove': () => void
  'bot:difficulty': (data: { difficulty: BotDifficulty }) => void
}

export interface ServerToClientEvents {
  'room:created': (data: { code: string; players: Array<{ id: string; nickname: string; isBot: boolean }>; difficulty: BotDifficulty }) => void
  'room:joined': (data: { code: string; players: Array<{ id: string; nickname: string; isBot: boolean }>; difficulty: BotDifficulty; phase: 'lobby' | 'playing' | 'results' }) => void
  'room:error': (data: { message: string }) => void
  'lobby:update': (data: { players: Array<{ id: string; nickname: string; isBot: boolean }>; difficulty: BotDifficulty }) => void
  'game:start': (data: { map: MapData; state: GameState }) => void
  'game:tick': (data: { tick: number; players: Record<string, PlayerState>; orders: Record<string, OrderState>; sessionTimeLeft: number }) => void
  'order:spawned': (data: { order: OrderState }) => void
  'order:pickedUp': (data: { orderId: string; playerId: string }) => void
  'order:delivered': (data: { orderId: string; playerId: string; score: number; bonusScore: number }) => void
  'order:expired': (data: { orderId: string }) => void
  'session:end': (data: { results: Array<{ id: string; nickname: string; score: number; deliveries: number }> }) => void
  'player:disconnected': (data: { playerId: string }) => void
}

export const TILE_SIZE = 64
export const MAP_SIZE = 100
export const ROAD_BLOCK = 5
export const ORDER_MAX_DISTANCE = 30
export const SESSION_DURATION = 300
export const ORDER_TTL_MAP = 45_000
export const ORDER_TTL_HELD = 30_000
export const MOVE_SPEED = 2
export const MOVE_DURATION = 150
export const BOT_SPEEDS = [280, 180, 110] // slow, medium, fast (ms per tile)
