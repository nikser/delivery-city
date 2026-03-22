import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'
import type { MapData, GameState, PlayerState, OrderState, Direction, TileType } from '@delivery-city/shared'
import { TILE_SIZE, MOVE_DURATION } from '@delivery-city/shared'

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
  private playerRenders = new Map<string, PlayerRender>()
  private orderRenders = new Map<string, OrderRender>()
  private sessionTimeLeft = 0

  private followTarget!: Phaser.GameObjects.Zone

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
    const mapPixels = this.mapData.width * TILE_SIZE
    this.cameras.main.setBounds(0, 0, mapPixels, mapPixels)

    this.renderMap()

    // Invisible follow target
    this.followTarget = this.add.zone(mapPixels / 2, mapPixels / 2, 1, 1)
    this.cameras.main.startFollow(this.followTarget, true, 0.08, 0.08)

    // Keyboard
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    this.createHUD()

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
      }
    })

    socket.on('order:expired', (data) => {
      this.removeOrderMarker(data.orderId)
    })

    socket.on('player:disconnected', (data) => {
      this.removePlayer(data.playerId)
    })

    socket.on('session:end', (data) => {
      this.cleanupSocket()
      this.scene.start('ResultScene', { results: data.results })
    })
  }

  // ── Map rendering ────────────────────────────────────────────────────

  private renderMap(): void {
    const { width, height } = this.mapData
    const g = this.add.graphics().setDepth(0)

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const tileType = this.mapData.tiles[row][col]
        this.drawTile(g, tileType, col * TILE_SIZE, row * TILE_SIZE)
      }
    }
  }

  private drawTile(g: Phaser.GameObjects.Graphics, tile: TileType, px: number, py: number): void {
    const S = TILE_SIZE
    const ASPHALT = 0x23232f
    const SIDEWALK = 0x3a3a4a
    const SW = 5 // sidewalk width

    switch (tile) {
      case 'BUILDING': {
        // Ground / gap between buildings
        g.fillStyle(0x14141c)
        g.fillRect(px, py, S, S)

        // Building footprint with margin
        const M = 3
        const hash = ((px / S) * 7 + (py / S) * 13) | 0
        const wallColors = [0x1e2a3d, 0x2d1e3a, 0x1a2e28, 0x2e2418, 0x2a1e35, 0x18252e]
        g.fillStyle(wallColors[Math.abs(hash) % wallColors.length])
        g.fillRect(px + M, py + M, S - M * 2, S - M * 2)

        // Roof edge highlight
        g.fillStyle(0xffffff, 0.06)
        g.fillRect(px + M, py + M, S - M * 2, 4)
        g.fillRect(px + M, py + M, 4, S - M * 2)

        // Windows — grid of 2×3
        const winW = 10, winH = 8, cols = 3, rows = 3
        const gapX = ((S - M * 2) - cols * winW) / (cols + 1)
        const gapY = ((S - M * 2) - rows * winH) / (rows + 1)
        const winColors = [0xffcc44, 0xffaa22, 0x88ccff, 0xffffff]
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const lit = ((Math.abs(hash) + col * 3 + row * 5) % 4) !== 0
            const wx = px + M + gapX + col * (winW + gapX)
            const wy = py + M + gapY + row * (winH + gapY)
            if (lit) {
              // Glow
              g.fillStyle(winColors[Math.abs(hash + col + row) % winColors.length], 0.15)
              g.fillRect(wx - 2, wy - 2, winW + 4, winH + 4)
              g.fillStyle(winColors[Math.abs(hash + col + row) % winColors.length], 0.9)
            } else {
              g.fillStyle(0x0a0a14, 1)
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
        // Center dashes
        g.fillStyle(0xf0f0c0, 0.7)
        for (let i = 0; i < 5; i++) {
          g.fillRect(px + 4 + i * 13, py + S / 2 - 1, 8, 2)
        }
        // Direction arrow
        const mx = px + S / 2, my = py + S / 2
        g.fillStyle(0xffffff, 0.25)
        if (tile === 'ROAD_EAST') {
          g.fillTriangle(mx + 10, my, mx - 4, my - 7, mx - 4, my + 7)
          g.fillRect(mx - 12, my - 2, 14, 4)
        } else {
          g.fillTriangle(mx - 10, my, mx + 4, my - 7, mx + 4, my + 7)
          g.fillRect(mx - 2, my - 2, 14, 4)
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
        g.fillStyle(0xf0f0c0, 0.7)
        for (let i = 0; i < 5; i++) {
          g.fillRect(px + S / 2 - 1, py + 4 + i * 13, 2, 8)
        }
        // Direction arrow
        const mx = px + S / 2, my = py + S / 2
        g.fillStyle(0xffffff, 0.25)
        if (tile === 'ROAD_SOUTH') {
          g.fillTriangle(mx, my + 10, mx - 7, my - 4, mx + 7, my - 4)
          g.fillRect(mx - 2, my - 12, 4, 14)
        } else {
          g.fillTriangle(mx, my - 10, mx - 7, my + 4, mx + 7, my + 4)
          g.fillRect(mx - 2, my - 2, 4, 14)
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
        // Center subtle grid dot
        g.fillStyle(0xffffff, 0.08)
        g.fillRect(px + S / 2 - 2, py + S / 2 - 2, 4, 4)
        break
      }

      default: {
        g.fillStyle(0x14141c)
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
      progress = Math.min(1, state.moveProgress + timeSinceLastTick / MOVE_DURATION)
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

    this.hudMyScore = this.add.text(width / 2, height - 14, 'Очки: 0', {
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
  }

  private updateHUD(): void {
    const secs = Math.max(0, Math.round(this.sessionTimeLeft))
    const mm = String(Math.floor(secs / 60)).padStart(2, '0')
    const ss = String(secs % 60).padStart(2, '0')
    this.hudTimer.setText(`${mm}:${ss}`)
    this.hudTimer.setColor(secs < 30 ? '#ff4444' : '#ffffff')

    // Top-4 scoreboard
    const sorted = Array.from(this.playerRenders.values())
      .map((r) => r.state)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)

    const lines = sorted.map((p, i) => {
      const medal = ['1.', '2.', '3.', '4.'][i]
      const nick = p.nickname.length > 10 ? p.nickname.slice(0, 10) + '…' : p.nickname
      return `${medal} ${nick} ${p.score}`
    })
    this.hudScores.setText(lines.join('\n'))

    // My score
    const myRender = this.playerRenders.get(this.myId)
    if (myRender) {
      this.hudMyScore.setText(`Очки: ${myRender.state.score}`)
    }

    // Carried order countdown
    if (myRender?.state.carryingOrderId) {
      const orderId = myRender.state.carryingOrderId
      const orderRender = this.orderRenders.get(orderId)
      if (orderRender) {
        const timeLeft = Math.max(0, Math.ceil((orderRender.state.expiresAt - Date.now()) / 1000))
        this.hudOrderTimer.setText(`Доставь за: ${timeLeft}s`)
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

    if (!myRender?.state.carryingOrderId) return
    const orderRender = this.orderRenders.get(myRender.state.carryingOrderId)
    if (!orderRender) return

    const playerPos = this.getPlayerPixelPos(myRender.state)
    const dest = orderRender.state.deliveryTile
    const destPx = dest.x * TILE_SIZE + TILE_SIZE / 2
    const destPy = dest.y * TILE_SIZE + TILE_SIZE / 2

    const dx = destPx - playerPos.x
    const dy = destPy - playerPos.y
    const angle = Math.atan2(dy, dx)
    const distTiles = Math.round(Math.sqrt(dx * dx + dy * dy) / TILE_SIZE)

    const { height } = this.scale
    const cx = 50
    const cy = height - 90
    const R = 30

    // Background
    this.hudNavArrow.fillStyle(0x000000, 0.55)
    this.hudNavArrow.fillCircle(cx, cy, R + 4)
    this.hudNavArrow.lineStyle(2, 0xff3333, 0.8)
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
    this.hudNavArrow.lineStyle(3, 0xff3333, 1)
    this.hudNavArrow.lineBetween(cx, cy, tipX, tipY)
    const headSize = 7
    this.hudNavArrow.fillStyle(0xff3333, 1)
    this.hudNavArrow.fillTriangle(
      tipX, tipY,
      tipX + Math.cos(angle + Math.PI * 0.75) * headSize, tipY + Math.sin(angle + Math.PI * 0.75) * headSize,
      tipX + Math.cos(angle - Math.PI * 0.75) * headSize, tipY + Math.sin(angle - Math.PI * 0.75) * headSize,
    )

    this.hudNavDist.setPosition(cx, cy + R + 10).setText(`${distTiles} тайл`)
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

      if (id === this.myId) {
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
