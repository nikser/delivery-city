import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'
import type { MapData, GameState, PlayerState, OrderState, Direction, TileType } from '@delivery-city/shared'
import { TILE_SIZE, MOVE_DURATION } from '@delivery-city/shared'
import { t } from '../i18n'
import { trackSceneEnter, trackSceneLeave, trackGameStart, trackGameEnd, trackDelivery } from '../telemetry'

interface PlayerRender {
  graphics: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  packageIcon: Phaser.GameObjects.Text
  state: PlayerState
}

interface OrderRender {
  graphics: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text | null
  state: OrderState
}

export class GameScene extends Phaser.Scene {
  private mapData!: MapData
  private myId = ''
  private beforeUnloadHandler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
  private playerRenders = new Map<string, PlayerRender>()
  private orderRenders = new Map<string, OrderRender>()
  private sessionTimeLeft = 0

  private followTarget!: Phaser.GameObjects.Zone
  private cameraZoom = parseFloat(localStorage.getItem('cameraZoom') ?? '1')
  private cameraFollowing = true
  private panStart: { px: number; py: number; tx: number; ty: number } | null = null

  private hudCamera!: Phaser.Cameras.Scene2D.Camera
  private hudObjects: Phaser.GameObjects.GameObject[] = []
  private worldObjects: Phaser.GameObjects.GameObject[] = []

  private hudTimer!: Phaser.GameObjects.Text
  private hudScores!: Phaser.GameObjects.Text
  private hudMyScore!: Phaser.GameObjects.Text
  private hudOrderTimer!: Phaser.GameObjects.Text
  private hudNavArrow!: Phaser.GameObjects.Graphics
  private hudNavDist!: Phaser.GameObjects.Text

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }
  private inputSeq = 0
  private lastDirection: Direction = 'idle'
  private lastTickAt = 0
  private inputTimer = 0

  // Touch joystick
  private joystickGfx!: Phaser.GameObjects.Graphics
  private joystickPointer: Phaser.Input.Pointer | null = null
  private joystickCenter: { x: number; y: number } | null = null
  private touchDirection: Direction = 'idle'

  constructor() {
    super({ key: 'GameScene' })
  }

  init(data: { map: MapData; state: GameState }): void {
    this.mapData = data.map
    this.sessionTimeLeft = data.state.sessionTimeLeft
    this.inputSeq = 0
    this.lastDirection = 'idle'
    this.myId = ''

    // Initialize player renders from state
    this.playerRenders.clear()
    this.orderRenders.clear()

    // Store initial state for create()
    this._initState = data.state
  }

  private _initState!: GameState

  create(): void {
    trackSceneEnter('GameScene')
    const players = Object.values(this._initState.players)
    trackGameStart(
      players.filter(p => !p.isBot).length,
      players.filter(p =>  p.isBot).length,
    )

    const mapPixels = this.mapData.width * TILE_SIZE
    this.cameras.main.setBounds(0, 0, mapPixels, mapPixels)
    this.cameras.main.setZoom(this.cameraZoom)

    window.addEventListener('beforeunload', this.beforeUnloadHandler)

    this.renderMap()

    // Invisible follow target
    this.followTarget = this.add.zone(mapPixels / 2, mapPixels / 2, 1, 1)
    this.cameras.main.startFollow(this.followTarget, true, 0.08, 0.08)

    // Disable right-click context menu for panning
    this.input.mouse!.disableContextMenu()

    // Zoom with mouse wheel / trackpad (proportional to delta — gentle on trackpad)
    this.input.on('wheel', (_ptr: Phaser.Input.Pointer, _objs: unknown[], _dx: number, deltaY: number) => {
      this.applyZoom(Math.pow(0.999, deltaY))
    })

    // Pan with right mouse button drag
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.cameraFollowing = false
        this.panStart = { px: pointer.x, py: pointer.y, tx: this.followTarget.x, ty: this.followTarget.y }
      }
    })
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.panStart && pointer.rightButtonDown()) {
        const dx = (pointer.x - this.panStart.px) / this.cameraZoom
        const dy = (pointer.y - this.panStart.py) / this.cameraZoom
        const mapPx = this.mapData.width * TILE_SIZE
        this.followTarget.setPosition(
          Phaser.Math.Clamp(this.panStart.tx - dx, 0, mapPx),
          Phaser.Math.Clamp(this.panStart.ty - dy, 0, mapPx),
        )
      }
    })
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.rightButtonDown()) this.panStart = null
    })

    // Keyboard
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    this.createHUD()
    this.setupJoystick()

    // Two-camera setup: main camera zooms with the world; hudCamera is fixed (no zoom/scroll)
    const { width, height } = this.scale
    this.hudCamera = this.cameras.add(0, 0, width, height, false, 'hud')
    this.cameras.main.ignore(this.hudObjects)
    this.hudCamera.ignore(this.worldObjects)
    this.hudCamera.ignore([this.followTarget])

    const roomCode = sessionStorage.getItem('roomCode') ?? ''
    if (roomCode) {
      const roomCodeText = this.add.text(width / 2, 52, roomCode, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#44ccff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200)
      this.cameras.main.ignore(roomCodeText)
    }

    // Identify self
    const socket = getSocket()
    this.myId = socket.id ?? ''

    // Spawn initial entities
    Object.values(this._initState.players).forEach((p) => this.addPlayer(p))
    Object.values(this._initState.orders).forEach((o) => this.addOrderMarker(o))

    // Socket events
    socket.on('game:tick', (data) => {
      this.lastTickAt = Date.now()
      this.sessionTimeLeft = data.sessionTimeLeft
      this.myId = socket.id ?? this.myId

      Object.values(data.players).forEach((p) => {
        const render = this.playerRenders.get(p.id)
        if (render) {
          render.state = p
        } else {
          this.addPlayer(p)
        }
      })

      for (const id of this.playerRenders.keys()) {
        if (!data.players[id]) this.removePlayer(id)
      }

      Object.values(data.orders).forEach((o) => {
        if (!this.orderRenders.has(o.id)) {
          this.addOrderMarker(o)
        } else {
          this.orderRenders.get(o.id)!.state = o
        }
      })

      for (const id of this.orderRenders.keys()) {
        if (!data.orders[id]) this.removeOrderMarker(id)
      }
    })

    socket.on('order:spawned', (data) => {
      if (!this.orderRenders.has(data.order.id)) {
        this.addOrderMarker(data.order)
      }
    })

    socket.on('order:pickedUp', (data) => {
      const render = this.orderRenders.get(data.orderId)
      if (render) {
        render.state.assignedPlayerId = data.playerId
        render.state.status = 'assigned'
      }
    })

    socket.on('order:delivered', (data) => {
      this.removeOrderMarker(data.orderId)
      if (data.playerId === this.myId) {
        this.showScorePopup(data.score + data.bonusScore)
        trackDelivery(data.score, data.bonusScore)
      }
    })

    socket.on('order:expired', (data) => {
      this.removeOrderMarker(data.orderId)
    })

    socket.on('player:disconnected', (data) => {
      this.removePlayer(data.playerId)
    })

    socket.on('session:end', (data) => {
      const myResult = data.results.find(r => r.id === getSocket().id)
      const place = myResult ? data.results.indexOf(myResult) + 1 : 0
      trackGameEnd(myResult?.score ?? 0, place, data.results.length)
      trackSceneLeave('GameScene')
      this.cleanupSocket()
      this.scene.start('ResultScene', { results: data.results })
    })
  }

  // ── Map rendering ────────────────────────────────────────────────────

  private applyZoom(factor: number): void {
    this.cameraZoom = Phaser.Math.Clamp(this.cameraZoom * factor, 0.35, 3)
    this.cameras.main.setZoom(this.cameraZoom)
    localStorage.setItem('cameraZoom', String(this.cameraZoom))
  }

  private renderMap(): void {
    const { width, height } = this.mapData
    const g = this.add.graphics().setDepth(0)
    this.worldObjects.push(g)

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const tileType = this.mapData.tiles[row][col]
        this.drawTile(g, tileType, col * TILE_SIZE, row * TILE_SIZE)
      }
    }
  }

  private drawTile(g: Phaser.GameObjects.Graphics, tile: TileType, px: number, py: number): void {
    const S = TILE_SIZE
    const ASPHALT = 0x585850   // warm dark gray asphalt
    const SIDEWALK = 0x9a9080  // warm beige-gray concrete
    const SW = 2 // sidewalk width

    switch (tile) {
      case 'BUILDING': {
        // Ground gap between buildings — warm dark
        g.fillStyle(0x3a3228)
        g.fillRect(px, py, S, S)

        // Building footprint with margin
        const M = 3
        const hash = ((px / S) * 7 + (py / S) * 13) | 0
        // Warm, readable building colors: brick, tan, olive, slate, brown, stone
        const wallColors = [0x7a3f2d, 0x8a7050, 0x4a6040, 0x3a5060, 0x786040, 0x606878]
        g.fillStyle(wallColors[Math.abs(hash) % wallColors.length])
        g.fillRect(px + M, py + M, S - M * 2, S - M * 2)

        // Roof edge highlight
        g.fillStyle(0xffffff, 0.1)
        g.fillRect(px + M, py + M, S - M * 2, 3)
        g.fillRect(px + M, py + M, 3, S - M * 2)
        // Shadow edge
        g.fillStyle(0x000000, 0.15)
        g.fillRect(px + M, py + S - M - 3, S - M * 2, 3)
        g.fillRect(px + S - M - 3, py + M, 3, S - M * 2)

        // Windows — grid of 3×3
        const winW = 9, winH = 7, cols = 3, rows = 3
        const gapX = ((S - M * 2) - cols * winW) / (cols + 1)
        const gapY = ((S - M * 2) - rows * winH) / (rows + 1)
        // Soft warm window colors
        const winColors = [0xe0c870, 0xd4a848, 0xf0e8c0]
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const lit = ((Math.abs(hash) + col * 3 + row * 5) % 5) !== 0
            const wx = px + M + gapX + col * (winW + gapX)
            const wy = py + M + gapY + row * (winH + gapY)
            if (lit) {
              g.fillStyle(winColors[Math.abs(hash + col + row) % winColors.length], 0.85)
            } else {
              g.fillStyle(0x1a1510, 1)
            }
            g.fillRect(wx, wy, winW, winH)
          }
        }
        break
      }

      case 'ROAD_EAST':
      case 'ROAD_WEST': {
        // Asphalt
        g.fillStyle(ASPHALT)
        g.fillRect(px, py, S, S)
        // Sidewalks top & bottom
        g.fillStyle(SIDEWALK)
        g.fillRect(px, py, S, SW)
        g.fillRect(px, py + S - SW, S, SW)
        // Center dashes — soft off-white
        g.fillStyle(0xe0d8a0, 0.45)
        for (let i = 0; i < 5; i++) {
          g.fillRect(px + 4 + i * 13, py + S / 2, 8, 1)
        }
        // Direction arrow — very subtle
        const mx = px + S / 2, my = py + S / 2
        g.fillStyle(0xffffff, 0.12)
        if (tile === 'ROAD_EAST') {
          g.fillTriangle(mx + 10, my, mx - 4, my - 6, mx - 4, my + 6)
          g.fillRect(mx - 10, my - 1, 12, 3)
        } else {
          g.fillTriangle(mx - 10, my, mx + 4, my - 6, mx + 4, my + 6)
          g.fillRect(mx - 2, my - 1, 12, 3)
        }
        break
      }

      case 'ROAD_NORTH':
      case 'ROAD_SOUTH': {
        g.fillStyle(ASPHALT)
        g.fillRect(px, py, S, S)
        // Sidewalks left & right
        g.fillStyle(SIDEWALK)
        g.fillRect(px, py, SW, S)
        g.fillRect(px + S - SW, py, SW, S)
        // Center dashes
        g.fillStyle(0xe0d8a0, 0.45)
        for (let i = 0; i < 5; i++) {
          g.fillRect(px + S / 2, py + 4 + i * 13, 1, 8)
        }
        // Direction arrow — very subtle
        const mx = px + S / 2, my = py + S / 2
        g.fillStyle(0xffffff, 0.12)
        if (tile === 'ROAD_SOUTH') {
          g.fillTriangle(mx, my + 10, mx - 6, my - 4, mx + 6, my - 4)
          g.fillRect(mx - 1, my - 10, 3, 12)
        } else {
          g.fillTriangle(mx, my - 10, mx - 6, my + 4, mx + 6, my + 4)
          g.fillRect(mx - 1, my - 2, 3, 12)
        }
        break
      }

      case 'INTERSECTION': {
        g.fillStyle(ASPHALT)
        g.fillRect(px, py, S, S)
        // Corner sidewalk squares
        g.fillStyle(SIDEWALK)
        g.fillRect(px, py, SW, SW)
        g.fillRect(px + S - SW, py, SW, SW)
        g.fillRect(px, py + S - SW, SW, SW)
        g.fillRect(px + S - SW, py + S - SW, SW, SW)
        break
      }

      default: {
        g.fillStyle(0x3a3228)
        g.fillRect(px, py, S, S)
      }
    }
  }

  // ── Player rendering ─────────────────────────────────────────────────

  private addPlayer(state: PlayerState): void {
    const graphics = this.add.graphics().setDepth(10)

    const label = this.add.text(0, 0, state.nickname, {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(11)

    const packageIcon = this.add.text(0, 0, '[P]', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffdd00',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(12).setVisible(false)

    this.worldObjects.push(graphics, label, packageIcon)
    this.hudCamera?.ignore([graphics, label, packageIcon])

    this.playerRenders.set(state.id, { graphics, label, packageIcon, state })
  }

  private removePlayer(id: string): void {
    const render = this.playerRenders.get(id)
    if (render) {
      render.graphics.destroy()
      render.label.destroy()
      render.packageIcon.destroy()
      this.playerRenders.delete(id)
    }
  }

  private drawCar(
    g: Phaser.GameObjects.Graphics,
    color: number,
    direction: Direction,
    cx: number,
    cy: number,
  ): void {
    g.clear()

    const isVertical = direction === 'up' || direction === 'down'
    const W = isVertical ? 26 : 40
    const H = isVertical ? 40 : 26
    const hw = W / 2
    const hh = H / 2

    // Shadow
    g.fillStyle(0x000000, 0.35)
    g.fillEllipse(cx + 2, cy + 3, W + 4, H * 0.4)

    // Wheels
    const wr = 4
    g.fillStyle(0x111111)
    if (isVertical) {
      g.fillEllipse(cx - hw + 1, cy - hh + 7, wr * 2, wr * 2)
      g.fillEllipse(cx + hw - 1, cy - hh + 7, wr * 2, wr * 2)
      g.fillEllipse(cx - hw + 1, cy + hh - 7, wr * 2, wr * 2)
      g.fillEllipse(cx + hw - 1, cy + hh - 7, wr * 2, wr * 2)
    } else {
      g.fillEllipse(cx - hw + 7, cy - hh + 1, wr * 2, wr * 2)
      g.fillEllipse(cx - hw + 7, cy + hh - 1, wr * 2, wr * 2)
      g.fillEllipse(cx + hw - 7, cy - hh + 1, wr * 2, wr * 2)
      g.fillEllipse(cx + hw - 7, cy + hh - 1, wr * 2, wr * 2)
    }

    // Car body
    g.fillStyle(color)
    g.fillRoundedRect(cx - hw + 2, cy - hh + 2, W - 4, H - 4, 5)

    // Body highlight (top sheen)
    g.fillStyle(0xffffff, 0.18)
    g.fillRoundedRect(cx - hw + 4, cy - hh + 3, W - 8, (H - 6) * 0.45, 3)

    // Windshield & rear window
    g.fillStyle(0x223344, 0.85)
    switch (direction) {
      case 'right':
        g.fillRoundedRect(cx + 4,      cy - hh + 5, 12, H - 10, 2) // front
        g.fillRoundedRect(cx - hw + 4, cy - hh + 5, 7,  H - 10, 2) // rear
        break
      case 'left':
        g.fillRoundedRect(cx - hw + 4 + 8, cy - hh + 5, 12, H - 10, 2)
        g.fillRoundedRect(cx + hw - 11,    cy - hh + 5, 7,  H - 10, 2)
        break
      case 'up':
        g.fillRoundedRect(cx - hw + 5, cy - hh + 4, W - 10, 12, 2)
        g.fillRoundedRect(cx - hw + 5, cy + 4,      W - 10, 7,  2)
        break
      case 'down':
        g.fillRoundedRect(cx - hw + 5, cy + hh - 16, W - 10, 12, 2)
        g.fillRoundedRect(cx - hw + 5, cy - hh + 4,  W - 10, 7,  2)
        break
    }

    // Headlights
    g.fillStyle(0xffffcc, 0.95)
    switch (direction) {
      case 'right':
        g.fillEllipse(cx + hw - 3, cy - hh + 7, 5, 4)
        g.fillEllipse(cx + hw - 3, cy + hh - 7, 5, 4)
        break
      case 'left':
        g.fillEllipse(cx - hw + 3, cy - hh + 7, 5, 4)
        g.fillEllipse(cx - hw + 3, cy + hh - 7, 5, 4)
        break
      case 'up':
        g.fillEllipse(cx - hw + 7, cy - hh + 3, 4, 5)
        g.fillEllipse(cx + hw - 7, cy - hh + 3, 4, 5)
        break
      case 'down':
        g.fillEllipse(cx - hw + 7, cy + hh - 3, 4, 5)
        g.fillEllipse(cx + hw - 7, cy + hh - 3, 4, 5)
        break
    }

    // Tail lights
    g.fillStyle(0xff2222, 0.9)
    switch (direction) {
      case 'right':
        g.fillRect(cx - hw + 2, cy - hh + 6, 3, 3)
        g.fillRect(cx - hw + 2, cy + hh - 9, 3, 3)
        break
      case 'left':
        g.fillRect(cx + hw - 5, cy - hh + 6, 3, 3)
        g.fillRect(cx + hw - 5, cy + hh - 9, 3, 3)
        break
      case 'up':
        g.fillRect(cx - hw + 6, cy + hh - 5, 3, 3)
        g.fillRect(cx + hw - 9, cy + hh - 5, 3, 3)
        break
      case 'down':
        g.fillRect(cx - hw + 6, cy - hh + 2, 3, 3)
        g.fillRect(cx + hw - 9, cy - hh + 2, 3, 3)
        break
    }

    // Outline
    g.lineStyle(1.5, 0x000000, 0.5)
    g.strokeRoundedRect(cx - hw + 2, cy - hh + 2, W - 4, H - 4, 5)
  }

  private getPlayerPixelPos(state: PlayerState): { x: number; y: number } {
    let progress: number
    if (state.isMoving) {
      const timeSinceLastTick = Date.now() - this.lastTickAt
      progress = Math.min(1, state.moveProgress + timeSinceLastTick / state.moveDuration)
    } else {
      progress = 1
    }
    return {
      x: (state.fromTileX + (state.tileX - state.fromTileX) * progress) * TILE_SIZE + TILE_SIZE / 2,
      y: (state.fromTileY + (state.tileY - state.fromTileY) * progress) * TILE_SIZE + TILE_SIZE / 2,
    }
  }

  // ── Order markers ────────────────────────────────────────────────────

  private addOrderMarker(order: OrderState): void {
    const graphics = this.add.graphics().setDepth(5)
    let label: Phaser.GameObjects.Text | null = null

    if (order.status === 'available' || order.status === 'assigned') {
      label = this.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(6)
    }

    this.worldObjects.push(graphics)
    this.hudCamera?.ignore([graphics])
    if (label) {
      this.worldObjects.push(label)
      this.hudCamera?.ignore([label])
    }

    this.orderRenders.set(order.id, { graphics, label, state: order })
  }

  private drawOrderMarker(orderId: string): void {
    const render = this.orderRenders.get(orderId)
    if (!render) return

    const { graphics, label, state } = render
    const myId = this.myId
    graphics.clear()

    const drawPickup = (): void => {
      const cx = state.pickupTile.x * TILE_SIZE + TILE_SIZE / 2
      const cy = state.pickupTile.y * TILE_SIZE + TILE_SIZE / 2
      const W = 22, H = 28
      const bx = cx - W / 2
      const by = cy - H / 2 + 2

      // Shadow
      graphics.fillStyle(0x000000, 0.28)
      graphics.fillEllipse(cx + 1, by + H + 3, W + 4, 6)

      // Bag body (kraft paper)
      graphics.fillStyle(0xc8913a)
      graphics.fillRect(bx, by, W, H)

      // Top fold strip (lighter)
      graphics.fillStyle(0xddb055)
      graphics.fillRect(bx, by, W, 8)

      // Crease line
      graphics.lineStyle(1, 0x9a6820, 0.7)
      graphics.lineBetween(bx, by + 8, bx + W, by + 8)

      // Right-side shading
      graphics.fillStyle(0x000000, 0.1)
      graphics.fillRect(bx + W - 3, by, 3, H)

      // Outline
      graphics.lineStyle(1.5, 0x7a5018, 0.9)
      graphics.strokeRect(bx, by, W, H)

      // Handles (semicircle arcs)
      graphics.lineStyle(2, 0x7a5018, 1)
      graphics.beginPath()
      graphics.arc(bx + 7, by, 4, 0, Math.PI, true)
      graphics.strokePath()
      graphics.beginPath()
      graphics.arc(bx + W - 7, by, 4, 0, Math.PI, true)
      graphics.strokePath()

      label?.setPosition(cx, by + H + 5).setText('PICKUP')
    }

    const drawDelivery = (color: number, alpha: number): void => {
      const dx = state.deliveryTile.x * TILE_SIZE + TILE_SIZE / 2
      const dy = state.deliveryTile.y * TILE_SIZE + TILE_SIZE / 2
      // Glow
      graphics.fillStyle(color, 0.2 * alpha)
      graphics.fillRect(dx - 18, dy - 18, 36, 36)
      // Box
      graphics.fillStyle(color, alpha)
      graphics.fillRect(dx - 12, dy - 12, 24, 24)
      graphics.lineStyle(2, 0xffffff, alpha)
      graphics.strokeRect(dx - 12, dy - 12, 24, 24)
      // X mark
      graphics.lineStyle(2, 0xffffff, alpha * 0.8)
      graphics.lineBetween(dx - 8, dy - 8, dx + 8, dy + 8)
      graphics.lineBetween(dx + 8, dy - 8, dx - 8, dy + 8)
      if (label) {
        const timeLeft = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 1000))
        label.setPosition(dx, dy - 20).setText(`${timeLeft}s`)
      }
    }

    if (state.status === 'available') {
      drawPickup()
    } else if (state.status === 'assigned') {
      if (state.assignedPlayerId === myId) {
        drawDelivery(0xff3333, 1)
      } else {
        drawDelivery(0x3366ff, 0.65)
      }
    }
  }

  private removeOrderMarker(orderId: string): void {
    const render = this.orderRenders.get(orderId)
    if (render) {
      render.graphics.destroy()
      render.label?.destroy()
      this.orderRenders.delete(orderId)
    }
  }

  // ── Score popup ──────────────────────────────────────────────────────

  private showScorePopup(amount: number): void {
    const myRender = this.playerRenders.get(this.myId)
    const pos = myRender
      ? this.getPlayerPixelPos(myRender.state)
      : { x: this.cameras.main.scrollX + this.scale.width / 2, y: this.cameras.main.scrollY + this.scale.height / 2 }

    const txt = this.add.text(pos.x, pos.y - 20, `+${amount}`, {
      fontFamily: 'monospace',
      fontSize: '30px',
      color: '#00ff88',
      stroke: '#004422',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100)
    this.hudCamera?.ignore([txt])

    this.tweens.add({
      targets: txt,
      y: pos.y - 90,
      alpha: 0,
      duration: 1400,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  // ── HUD ──────────────────────────────────────────────────────────────

  private createHUD(): void {
    const { width, height } = this.scale

    this.hudTimer = this.add.text(width / 2, 14, '05:00', {
      fontFamily: 'monospace',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200)


    this.hudScores = this.add.text(width - 14, 14, '', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(200)

    this.hudMyScore = this.add.text(width / 2, height - 14, `${t('score')}: 0`, {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ffdd00',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(200)

    this.hudOrderTimer = this.add.text(width / 2, height - 54, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ff8844',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(200)

    this.hudNavArrow = this.add.graphics().setScrollFactor(0).setDepth(200)

    this.hudNavDist = this.add.text(50, height - 50, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200)

    // Zoom buttons — circles on the right side
    const R = 22
    const cx = width - R - 10
    const makeZoomBtn = (cy: number, label: string, factor: number) => {
      const bg = this.add.graphics().setScrollFactor(0).setDepth(201)
      const drawBg = (hover: boolean, pressed: boolean) => {
        bg.clear()
        bg.fillStyle(pressed ? 0xffffff : (hover ? 0x555555 : 0x222222), pressed ? 0.35 : 0.65)
        bg.fillCircle(cx, cy, R)
        bg.lineStyle(1.5, 0xffffff, hover ? 0.9 : 0.45)
        bg.strokeCircle(cx, cy, R)
      }
      drawBg(false, false)

      const lbl = this.add.text(cx, cy, label, {
        fontFamily: 'monospace', fontSize: '26px',
        color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(202)

      const zone = this.add.zone(cx, cy, R * 2, R * 2)
        .setScrollFactor(0).setDepth(203).setInteractive({ useHandCursor: true })
      zone.on('pointerover', () => drawBg(true, false))
      zone.on('pointerout',  () => drawBg(false, false))
      zone.on('pointerdown', () => { drawBg(true, true); this.applyZoom(factor) })
      zone.on('pointerup',   () => drawBg(true, false))

      return [bg, lbl, zone] as Phaser.GameObjects.GameObject[]
    }

    const plusObjs  = makeZoomBtn(height / 2 - R - 6, '+', 1.2)
    const minusObjs = makeZoomBtn(height / 2 + R + 6, '−', 1 / 1.2)

    this.joystickGfx = this.add.graphics().setScrollFactor(0).setDepth(300)

    this.hudObjects.push(
      this.hudTimer, this.hudScores, this.hudMyScore,
      this.hudOrderTimer, this.hudNavArrow, this.hudNavDist,
      ...plusObjs, ...minusObjs,
      this.joystickGfx,
    )
  }

  // ── Touch joystick ───────────────────────────────────────────────────

  private setupJoystick(): void {
    const BASE_R  = 72
    const KNOB_R  = 28
    const DEAD_R  = 14

    const draw = (cx: number, cy: number, kx: number, ky: number, dir: Direction) => {
      const g = this.joystickGfx
      g.clear()

      // Base
      g.fillStyle(0x000000, 0.30)
      g.fillCircle(cx, cy, BASE_R)
      g.lineStyle(1.5, 0xffffff, 0.18)
      g.strokeCircle(cx, cy, BASE_R)

      // Direction highlight arc
      if (dir !== 'idle') {
        const angles: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2, idle: 0 }
        const a = angles[dir]
        g.lineStyle(3, 0x44ccff, 0.6)
        g.beginPath()
        g.arc(cx, cy, BASE_R - 6, a - 0.55, a + 0.55, false)
        g.strokePath()
      }

      // Knob
      g.fillStyle(0xffffff, 0.82)
      g.fillCircle(kx, ky, KNOB_R)
      g.lineStyle(2, 0x44ccff, 1)
      g.strokeCircle(kx, ky, KNOB_R)
    }

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.rightButtonDown() || this.joystickPointer) return
      this.joystickPointer = ptr
      this.joystickCenter  = { x: ptr.x, y: ptr.y }
      this.cameraFollowing = true
      draw(ptr.x, ptr.y, ptr.x, ptr.y, 'idle')
    })

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (ptr !== this.joystickPointer || !this.joystickCenter) return
      const { x: cx, y: cy } = this.joystickCenter
      const dx = ptr.x - cx
      const dy = ptr.y - cy
      const dist = Math.hypot(dx, dy)
      const norm = dist > 0 ? 1 / dist : 0
      const clamp = Math.min(dist, BASE_R)
      const kx = cx + dx * norm * clamp
      const ky = cy + dy * norm * clamp

      if (dist > DEAD_R) {
        const a = Math.atan2(dy, dx)          // -π … π
        const Q = Math.PI / 4
        if (a > -Q && a <= Q)           this.touchDirection = 'right'
        else if (a > Q && a <= 3 * Q)   this.touchDirection = 'down'
        else if (a > -3 * Q && a <= -Q) this.touchDirection = 'up'
        else                             this.touchDirection = 'left'
      } else {
        this.touchDirection = 'idle'
      }

      draw(cx, cy, kx, ky, this.touchDirection)
    })

    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (ptr !== this.joystickPointer) return
      this.joystickPointer = null
      this.joystickCenter  = null
      this.touchDirection  = 'idle'
      this.joystickGfx.clear()
    })

    // Safety: if pointer is cancelled (e.g. phone call)
    this.input.on('pointercancel', (ptr: Phaser.Input.Pointer) => {
      if (ptr !== this.joystickPointer) return
      this.joystickPointer = null
      this.joystickCenter  = null
      this.touchDirection  = 'idle'
      this.joystickGfx.clear()
    })
  }

  private updateHUD(): void {
    const secs = Math.max(0, Math.round(this.sessionTimeLeft))
    const mm = String(Math.floor(secs / 60)).padStart(2, '0')
    const ss = String(secs % 60).padStart(2, '0')
    this.hudTimer.setText(`${mm}:${ss}`)
    this.hudTimer.setColor(secs < 30 ? '#ff4444' : '#ffffff')

    // Scoreboard — all players sorted by score
    const sorted = Array.from(this.playerRenders.values())
      .map((r) => r.state)
      .sort((a, b) => b.score - a.score)

    const lines = sorted.map((p, i) => {
      const nick = p.nickname.length > 10 ? p.nickname.slice(0, 10) + '…' : p.nickname
      return `${i + 1}. ${nick} ${p.score}`
    })
    this.hudScores.setText(lines.join('\n'))

    // My score
    const myRender = this.playerRenders.get(this.myId)
    if (myRender) {
      this.hudMyScore.setText(`${t('score')}: ${myRender.state.score}`)
    }

    // Carried order countdown
    if (myRender?.state.carryingOrderId) {
      const orderId = myRender.state.carryingOrderId
      const orderRender = this.orderRenders.get(orderId)
      if (orderRender) {
        const timeLeft = Math.max(0, Math.ceil((orderRender.state.expiresAt - Date.now()) / 1000))
        this.hudOrderTimer.setText(`${t('deliverIn')}: ${timeLeft}s`)
        this.hudOrderTimer.setColor(timeLeft < 10 ? '#ff0000' : '#ff8844')
      }
    } else {
      this.hudOrderTimer.setText('')
    }

    this.updateNavigator(myRender)
  }

  private updateNavigator(myRender: PlayerRender | undefined): void {
    this.hudNavArrow.clear()
    this.hudNavDist.setText('')

    if (!myRender) return

    const playerPos = this.getPlayerPixelPos(myRender.state)
    let destPx: number, destPy: number, arrowColor: number, label: string

    if (myRender.state.carryingOrderId) {
      // Carrying — point to delivery tile (red)
      const orderRender = this.orderRenders.get(myRender.state.carryingOrderId)
      if (!orderRender) return
      const dest = orderRender.state.deliveryTile
      destPx = dest.x * TILE_SIZE + TILE_SIZE / 2
      destPy = dest.y * TILE_SIZE + TILE_SIZE / 2
      arrowColor = 0xff3333
      label = t('delivery')
    } else {
      // No order — draw 3 arrows to nearest available pickups
      const available = Array.from(this.orderRenders.values())
        .filter(r => r.state.status === 'available')
        .map(r => {
          const px = r.state.pickupTile.x * TILE_SIZE + TILE_SIZE / 2
          const py = r.state.pickupTile.y * TILE_SIZE + TILE_SIZE / 2
          return { px, py, dist: Math.hypot(px - playerPos.x, py - playerPos.y) }
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)

      if (!available.length) return

      const { height } = this.scale
      const cx = 50, cy = height - 90, R = 30

      this.hudNavArrow.fillStyle(0x000000, 0.55)
      this.hudNavArrow.fillCircle(cx, cy, R + 4)
      this.hudNavArrow.lineStyle(2, 0xf0c030, 0.8)
      this.hudNavArrow.strokeCircle(cx, cy, R + 4)
      this.hudNavArrow.fillStyle(0xffffff, 0.35)
      this.hudNavArrow.fillCircle(cx, cy - R, 3)
      this.hudNavArrow.fillCircle(cx, cy + R, 3)
      this.hudNavArrow.fillCircle(cx - R, cy, 3)
      this.hudNavArrow.fillCircle(cx + R, cy, 3)

      // Opacity: nearest = 1.0, second = 0.6, third = 0.35
      const alphas = [1, 0.6, 0.35]
      const arrowLen = R - 6
      const headSize = 6
      available.forEach(({ px, py }, i) => {
        const angle = Math.atan2(py - playerPos.y, px - playerPos.x)
        const tipX = cx + Math.cos(angle) * arrowLen
        const tipY = cy + Math.sin(angle) * arrowLen
        this.hudNavArrow.lineStyle(2.5, 0xf0c030, alphas[i])
        this.hudNavArrow.lineBetween(cx, cy, tipX, tipY)
        this.hudNavArrow.fillStyle(0xf0c030, alphas[i])
        this.hudNavArrow.fillTriangle(
          tipX, tipY,
          tipX + Math.cos(angle + Math.PI * 0.75) * headSize, tipY + Math.sin(angle + Math.PI * 0.75) * headSize,
          tipX + Math.cos(angle - Math.PI * 0.75) * headSize, tipY + Math.sin(angle - Math.PI * 0.75) * headSize,
        )
      })

      const distTiles = Math.round(available[0].dist / TILE_SIZE)
      this.hudNavDist.setPosition(cx, cy + R + 10).setText(`${distTiles}${t('tileUnit')} · ${t('order')}`)
      return
    }

    const dx = destPx - playerPos.x
    const dy = destPy - playerPos.y
    const angle = Math.atan2(dy, dx)
    const distTiles = Math.round(Math.hypot(dx, dy) / TILE_SIZE)

    const { height } = this.scale
    const cx = 50
    const cy = height - 90
    const R = 30

    // Background
    this.hudNavArrow.fillStyle(0x000000, 0.55)
    this.hudNavArrow.fillCircle(cx, cy, R + 4)
    this.hudNavArrow.lineStyle(2, arrowColor, 0.8)
    this.hudNavArrow.strokeCircle(cx, cy, R + 4)

    // Cardinal dots
    this.hudNavArrow.fillStyle(0xffffff, 0.35)
    this.hudNavArrow.fillCircle(cx, cy - R, 3)
    this.hudNavArrow.fillCircle(cx, cy + R, 3)
    this.hudNavArrow.fillCircle(cx - R, cy, 3)
    this.hudNavArrow.fillCircle(cx + R, cy, 3)

    // Arrow
    const arrowLen = R - 6
    const tipX = cx + Math.cos(angle) * arrowLen
    const tipY = cy + Math.sin(angle) * arrowLen
    this.hudNavArrow.lineStyle(3, arrowColor, 1)
    this.hudNavArrow.lineBetween(cx, cy, tipX, tipY)
    const headSize = 7
    this.hudNavArrow.fillStyle(arrowColor, 1)
    this.hudNavArrow.fillTriangle(
      tipX, tipY,
      tipX + Math.cos(angle + Math.PI * 0.75) * headSize, tipY + Math.sin(angle + Math.PI * 0.75) * headSize,
      tipX + Math.cos(angle - Math.PI * 0.75) * headSize, tipY + Math.sin(angle - Math.PI * 0.75) * headSize,
    )

    this.hudNavDist.setPosition(cx, cy + R + 10).setText(`${distTiles}${t('tileUnit')} · ${label}`)
  }

  // ── Input ────────────────────────────────────────────────────────────

  private handleInput(delta: number): void {
    const up = this.cursors.up.isDown || this.wasd.up.isDown
    const down = this.cursors.down.isDown || this.wasd.down.isDown
    const left = this.cursors.left.isDown || this.wasd.left.isDown
    const right = this.cursors.right.isDown || this.wasd.right.isDown

    let direction: Direction = 'idle'
    if (up) direction = 'up'
    else if (down) direction = 'down'
    else if (left) direction = 'left'
    else if (right) direction = 'right'
    else if (this.touchDirection !== 'idle') direction = this.touchDirection

    if (direction !== 'idle') this.cameraFollowing = true

    this.inputTimer += delta
    if (direction !== this.lastDirection || this.inputTimer >= 50) {
      this.lastDirection = direction
      this.inputTimer = 0
      this.inputSeq++
      getSocket().emit('player:input', { direction, inputSeq: this.inputSeq })
    }
  }

  // ── Game loop ────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    this.handleInput(delta)

    for (const [id, render] of this.playerRenders) {
      const { state, graphics, label, packageIcon } = render
      const pos = this.getPlayerPixelPos(state)

      this.drawCar(graphics, state.color, state.direction, pos.x, pos.y)
      label.setPosition(pos.x, pos.y - 22)

      if (state.carryingOrderId) {
        packageIcon.setPosition(pos.x + 18, pos.y - 22).setVisible(true)
      } else {
        packageIcon.setVisible(false)
      }

      if (id === this.myId && this.cameraFollowing) {
        this.followTarget.setPosition(pos.x, pos.y)
      }
    }

    for (const orderId of this.orderRenders.keys()) {
      this.drawOrderMarker(orderId)
    }

    this.updateHUD()
  }

  // ── Cleanup ──────────────────────────────────────────────────────────

  private cleanupSocket(): void {
    window.removeEventListener('beforeunload', this.beforeUnloadHandler)
    const socket = getSocket()
    socket.off('game:tick')
    socket.off('order:spawned')
    socket.off('order:pickedUp')
    socket.off('order:delivered')
    socket.off('order:expired')
    socket.off('player:disconnected')
    socket.off('session:end')
  }

  shutdown(): void {
    this.cleanupSocket()
    for (const render of this.playerRenders.values()) {
      render.graphics.destroy()
      render.label.destroy()
      render.packageIcon.destroy()
    }
    for (const render of this.orderRenders.values()) {
      render.graphics.destroy()
      render.label?.destroy()
    }
    this.playerRenders.clear()
    this.orderRenders.clear()
  }
}
