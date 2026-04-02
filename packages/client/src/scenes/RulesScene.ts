import Phaser from 'phaser'
import { t } from '../i18n'
import { createButton } from '../ui/Button'

// Tile types used in the mini-map demo
type DemoTile = 'B' | 'RE' | 'RW' | 'RS' | 'RN' | 'IN'

// 7×7 mini-map layout (B=building, RE/RW/RS/RN=road, IN=intersection)
const DEMO_MAP: DemoTile[][] = [
  ['B',  'B',  'RN', 'B',  'B',  'RS', 'B' ],
  ['B',  'B',  'RN', 'B',  'B',  'RS', 'B' ],
  ['RE', 'RE', 'IN', 'RE', 'RE', 'IN', 'RE'],
  ['B',  'B',  'RN', 'B',  'B',  'RS', 'B' ],
  ['B',  'B',  'RN', 'B',  'B',  'RS', 'B' ],
  ['RW', 'RW', 'IN', 'RW', 'RW', 'IN', 'RW'],
  ['B',  'B',  'RN', 'B',  'B',  'RS', 'B' ],
]

export class RulesScene extends Phaser.Scene {
  private callerKey = 'WelcomeScene'

  constructor() {
    super({ key: 'RulesScene' })
  }

  init(data: { caller?: string }): void {
    this.callerKey = data?.caller ?? 'WelcomeScene'
  }

  create(): void {
    const { width, height } = this.scale
    const cx = width / 2

    // Dim overlay
    const overlay = this.add.graphics()
    overlay.fillStyle(0x000000, 0.72)
    overlay.fillRect(0, 0, width, height)
    overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains,
    )

    // Panel
    const PW = Math.min(width - 32, 480)
    const PH = Math.min(height - 40, 820)
    const px = cx - PW / 2
    const py = (height - PH) / 2

    const panel = this.add.graphics()
    panel.fillStyle(0x1a1f2e, 1)
    panel.fillRoundedRect(px, py, PW, PH, 8)
    panel.lineStyle(2, 0x00ccaa, 1)
    panel.strokeRoundedRect(px, py, PW, PH, 8)

    // Scrollable content via camera offset
    let scrollY = 0
    const CONTENT_START = py + 16
    let curY = CONTENT_START

    const txt = (
      label: string,
      x: number,
      y: number,
      style: Phaser.Types.GameObjects.Text.TextStyle,
    ) => this.add.text(x, y, label, { fontFamily: 'monospace', ...style })

    // ── Title ─────────────────────────────────────────────────────────
    txt(t('rulesTitle'), cx, curY, { fontSize: '22px', color: '#ffdd00', align: 'center' }).setOrigin(0.5, 0)
    curY += 34

    this.addSeparator(px + 12, curY, PW - 24)
    curY += 14

    // ── Goal ──────────────────────────────────────────────────────────
    const goalText = this.add.text(cx, curY, t('rulesGoal'), {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ccddcc',
      align: 'center',
      wordWrap: { width: PW - 32 },
    }).setOrigin(0.5, 0)
    curY += goalText.height + 14

    this.addSeparator(px + 12, curY, PW - 24)
    curY += 14

    // ── Mini map ──────────────────────────────────────────────────────
    txt(t('rulesLegend'), cx, curY, { fontSize: '14px', color: '#00ccaa' }).setOrigin(0.5, 0)
    curY += 22

    const S = 18 // tile size in demo
    const COLS = DEMO_MAP[0].length
    const ROWS = DEMO_MAP.length
    const mapW = COLS * S
    const mapH = ROWS * S
    const mapX = cx - mapW / 2
    const mapY = curY

    const mg = this.add.graphics()
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const tile = DEMO_MAP[row][col]
        const tx = mapX + col * S
        const ty = mapY + row * S
        this.drawDemoTile(mg, tile, tx, ty, S)
      }
    }

    // Overlay icons on demo map
    // Car at road tile [2][3]
    this.drawDemoCar(mg, mapX + 3 * S + S / 2, mapY + 2 * S + S / 2, 0xc24040)

    // Pickup bag at road tile [0][2]
    this.drawDemoBag(mg, mapX + 2 * S + S / 2, mapY + 0 * S + S / 2)

    // My delivery at road tile [4][5]
    this.drawDemoDelivery(mg, mapX + 5 * S + S / 2, mapY + 4 * S + S / 2, 0xff3333)

    // Other delivery at road tile [6][2]
    this.drawDemoDelivery(mg, mapX + 2 * S + S / 2, mapY + 6 * S + S / 2, 0x3366ff)

    curY += mapH + 12

    // Map legend list
    const legendItems: Array<{ drawFn: (g: Phaser.GameObjects.Graphics, x: number, y: number) => void; label: string }> = [
      { drawFn: (g, x, y) => this.drawDemoTileIcon(g, 'B',  x, y, S), label: t('rulesBuilding') },
      { drawFn: (g, x, y) => this.drawDemoTileIcon(g, 'RE', x, y, S), label: t('rulesRoad')     },
      { drawFn: (g, x, y) => this.drawDemoTileIcon(g, 'IN', x, y, S), label: t('rulesInter')    },
      { drawFn: (g, x, y) => this.drawDemoCar(g, x + S / 2, y + S / 2, 0xc24040),              label: t('rulesCar')      },
      { drawFn: (g, x, y) => this.drawDemoBag(g, x + S / 2, y + S / 2),                         label: t('rulesPickup')   },
      { drawFn: (g, x, y) => this.drawDemoDelivery(g, x + S / 2, y + S / 2, 0xff3333),          label: t('rulesMyDel')    },
      { drawFn: (g, x, y) => this.drawDemoDelivery(g, x + S / 2, y + S / 2, 0x3366ff),          label: t('rulesOtherDel') },
    ]

    const COL_W = (PW - 24) / 2
    const lg = this.add.graphics()
    legendItems.forEach((item, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const lx = px + 12 + col * COL_W
      const ly = curY + row * 28
      item.drawFn(lg, lx, ly)
      txt(item.label, lx + S + 6, ly + 3, { fontSize: '12px', color: '#aaccaa' })
    })
    curY += Math.ceil(legendItems.length / 2) * 28 + 10

    this.addSeparator(px + 12, curY, PW - 24)
    curY += 14

    // ── Controls ──────────────────────────────────────────────────────
    txt(t('rulesControls'), cx, curY, { fontSize: '14px', color: '#00ccaa' }).setOrigin(0.5, 0)
    curY += 22
    ;[t('rulesKeys'), t('rulesJoystick'), t('rulesMouseJoystick'), t('rulesZoom')].forEach((line) => {
      txt(`• ${line}`, px + 20, curY, { fontSize: '12px', color: '#aaccaa' })
      curY += 20
    })
    curY += 6

    this.addSeparator(px + 12, curY, PW - 24)
    curY += 14

    // ── Scoring ───────────────────────────────────────────────────────
    txt(t('rulesScoring'), cx, curY, { fontSize: '14px', color: '#00ccaa' }).setOrigin(0.5, 0)
    curY += 22
    txt(`• ${t('rulesScoringText')}`, px + 20, curY, { fontSize: '12px', color: '#aaccaa' })
    curY += 28

    // ── Close button ──────────────────────────────────────────────────
    const closeY = Math.max(curY + 8, py + PH - 66)
    createButton(this, cx, closeY, t('rulesClose'), true, () => {
      this.scene.stop()
      this.scene.resume(this.callerKey)
    }, { width: 200, height: 44, fontSize: '18px' })

    // Close on overlay click outside panel
    overlay.on('pointerdown', (_ptr: Phaser.Input.Pointer) => {
      this.scene.stop()
      this.scene.resume(this.callerKey)
    })

    // Escape key
    const esc = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    esc.once('down', () => {
      this.scene.stop()
      this.scene.resume(this.callerKey)
    })

    // Scroll / swipe support
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, Math.max(0, curY - (py + PH - 80)))
      this.cameras.main.setScroll(0, scrollY)
    })
  }

  // ── Drawing helpers ────────────────────────────────────────────────

  private addSeparator(x: number, y: number, w: number): void {
    const g = this.add.graphics()
    g.lineStyle(1, 0x2a3a3a, 1)
    g.lineBetween(x, y, x + w, y)
  }

  private drawDemoTile(g: Phaser.GameObjects.Graphics, tile: DemoTile, x: number, y: number, S: number): void {
    const ASPHALT  = 0x585850
    const SIDEWALK = 0x9a9080
    const SW = 1

    switch (tile) {
      case 'B': {
        g.fillStyle(0x3a3228)
        g.fillRect(x, y, S, S)
        const M = 2
        g.fillStyle(0x786040)
        g.fillRect(x + M, y + M, S - M * 2, S - M * 2)
        break
      }
      case 'RE':
      case 'RW': {
        g.fillStyle(ASPHALT);  g.fillRect(x, y, S, S)
        g.fillStyle(SIDEWALK); g.fillRect(x, y, S, SW); g.fillRect(x, y + S - SW, S, SW)
        const mx = x + S / 2, my = y + S / 2
        g.fillStyle(0xffffff, 0.28)
        if (tile === 'RE') g.fillTriangle(mx + 5, my, mx - 3, my - 3, mx - 3, my + 3)
        else               g.fillTriangle(mx - 5, my, mx + 3, my - 3, mx + 3, my + 3)
        break
      }
      case 'RS':
      case 'RN': {
        g.fillStyle(ASPHALT);  g.fillRect(x, y, S, S)
        g.fillStyle(SIDEWALK); g.fillRect(x, y, SW, S); g.fillRect(x + S - SW, y, SW, S)
        const mx = x + S / 2, my = y + S / 2
        g.fillStyle(0xffffff, 0.28)
        if (tile === 'RS') g.fillTriangle(mx, my + 5, mx - 3, my - 3, mx + 3, my - 3)
        else               g.fillTriangle(mx, my - 5, mx - 3, my + 3, mx + 3, my + 3)
        break
      }
      case 'IN': {
        g.fillStyle(ASPHALT);  g.fillRect(x, y, S, S)
        g.fillStyle(SIDEWALK)
        g.fillRect(x, y, SW, SW); g.fillRect(x + S - SW, y, SW, SW)
        g.fillRect(x, y + S - SW, SW, SW); g.fillRect(x + S - SW, y + S - SW, SW, SW)
        break
      }
    }
  }

  private drawDemoTileIcon(g: Phaser.GameObjects.Graphics, tile: DemoTile, x: number, y: number, S: number): void {
    this.drawDemoTile(g, tile, x, y, S)
  }

  private drawDemoCar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    const W = 12, H = 8
    g.fillStyle(0x000000, 0.4)
    g.fillEllipse(cx + 1, cy + 2, W + 2, H * 0.4)
    g.fillStyle(0x111111)
    g.fillEllipse(cx - W / 2 + 2, cy - H / 2 + 1, 3, 3)
    g.fillEllipse(cx + W / 2 - 2, cy - H / 2 + 1, 3, 3)
    g.fillEllipse(cx - W / 2 + 2, cy + H / 2 - 1, 3, 3)
    g.fillEllipse(cx + W / 2 - 2, cy + H / 2 - 1, 3, 3)
    g.fillStyle(color)
    g.fillRoundedRect(cx - W / 2 + 1, cy - H / 2 + 1, W - 2, H - 2, 2)
    g.fillStyle(0x223344, 0.85)
    g.fillRect(cx + 2, cy - H / 2 + 2, 4, H - 4)
    g.fillStyle(0xffffcc, 0.9)
    g.fillEllipse(cx + W / 2 - 1, cy - H / 2 + 2, 2, 2)
    g.fillEllipse(cx + W / 2 - 1, cy + H / 2 - 2, 2, 2)
  }

  private drawDemoBag(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const W = 9, H = 11
    const bx = cx - W / 2, by = cy - H / 2
    g.fillStyle(0xc8913a); g.fillRect(bx, by, W, H)
    g.fillStyle(0xddb055); g.fillRect(bx, by, W, 3)
    g.lineStyle(1, 0x7a5018, 0.9); g.strokeRect(bx, by, W, H)
    g.lineStyle(1.5, 0x7a5018, 1)
    g.beginPath(); g.arc(bx + 3, by, 2, 0, Math.PI, true); g.strokePath()
    g.beginPath(); g.arc(bx + W - 3, by, 2, 0, Math.PI, true); g.strokePath()
  }

  private drawDemoDelivery(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    g.fillStyle(color, 0.2); g.fillRect(cx - 7, cy - 7, 14, 14)
    g.fillStyle(color, 1);   g.fillRect(cx - 5, cy - 5, 10, 10)
    g.lineStyle(1.5, 0xffffff, 0.9); g.strokeRect(cx - 5, cy - 5, 10, 10)
    g.lineStyle(1.5, 0xffffff, 0.8)
    g.lineBetween(cx - 3, cy - 3, cx + 3, cy + 3)
    g.lineBetween(cx + 3, cy - 3, cx - 3, cy + 3)
  }
}
