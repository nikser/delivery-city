import Phaser from 'phaser'

interface ButtonOptions {
  width?: number
  height?: number
  fontSize?: string
  danger?: boolean
}

export interface ButtonHandle {
  container: Phaser.GameObjects.Container
  setLabel(label: string): void
  setFilled(filled: boolean): void
  setDanger(danger: boolean): void
}

export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  filled: boolean,
  onClick: () => void,
  opts: ButtonOptions = {},
): ButtonHandle {
  const btnWidth = opts.width ?? 240
  const btnHeight = opts.height ?? 50
  const fontSize = opts.fontSize ?? '22px'
  const borderColor = opts.danger ? 0xcc2244 : 0x00ccaa
  const textColor = opts.danger ? '#ff4466' : '#00ff88'
  const fillColor = opts.danger ? 0x220011 : 0x003333
  const hoverColor = opts.danger ? 0x440022 : 0x005544

  let currentFilled = filled
  let currentBorderColor = borderColor
  let currentTextColor = textColor
  let currentFillColor = fillColor
  let currentHoverColor = hoverColor

  const bg = scene.add.graphics()
  const draw = (hover: boolean, isFilled = currentFilled) => {
    bg.clear()
    bg.lineStyle(2, currentBorderColor, 1)
    bg.fillStyle(
      isFilled
        ? (hover ? currentHoverColor : currentFillColor)
        : (hover ? currentFillColor : 0x111a22),
      1,
    )
    bg.fillRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight)
    bg.strokeRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight)
  }
  draw(false)

  const text = scene.add.text(0, 0, label, {
    fontFamily: 'monospace',
    fontSize,
    color: textColor,
  }).setOrigin(0.5)

  const container = scene.add.container(x, y, [bg, text])
  container.setSize(btnWidth, btnHeight)
  container.setInteractive({ useHandCursor: true })

  container.on('pointerover', () => { draw(true); text.setColor('#ffffff') })
  container.on('pointerout', () => { draw(false); text.setColor(currentTextColor) })
  container.on('pointerdown', onClick)

  return {
    container,
    setLabel: (newLabel: string) => text.setText(newLabel),
    setFilled: (newFilled: boolean) => {
      currentFilled = newFilled
      draw(false)
    },
    setDanger: (isDanger: boolean) => {
      currentBorderColor = isDanger ? 0xcc2244 : 0x00ccaa
      currentTextColor   = isDanger ? '#ff4466' : '#00ff88'
      currentFillColor   = isDanger ? 0x220011 : 0x003333
      currentHoverColor  = isDanger ? 0x440022 : 0x005544
      text.setColor(currentTextColor)
      draw(false)
    },
  }
}
