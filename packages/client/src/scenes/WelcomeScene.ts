import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'
import { t } from '../i18n'
import { addLangSwitcher } from '../ui/LangSwitcher'
import { trackSceneEnter, trackSceneLeave, trackRoomCreated, trackRoomJoined } from '../telemetry'
import { showAdBanner, hideAdBanner } from '../ui/AdBanner'
import { createButton } from '../ui/Button'

export class WelcomeScene extends Phaser.Scene {
  private codeInput!: HTMLInputElement
  private errorText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'WelcomeScene' })
  }

  create(): void {
    trackSceneEnter('WelcomeScene')
    showAdBanner()
    const { width, height } = this.scale

    // Scanline texture over background
    this.addScanlines(width, height)

    // Animated car driving across the top
    this.createDrivingCar(width, height * 0.06)

    // Title — 40px to prevent clipping on narrow screens
    this.add.text(width / 2, height * 0.13, 'DELIVERY CITY', {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#ffdd00',
      stroke: '#aa8800',
      strokeThickness: 4,
    }).setOrigin(0.5)

    // Subtitle — brighter
    this.add.text(width / 2, height * 0.21, t('tagline'), {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffee88',
    }).setOrigin(0.5)

    // How to play button — bottom-left
    const helpBtn = this.add.text(16, height - 16, t('howToPlay'), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#00ccaa',
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true })
    helpBtn.on('pointerover', () => helpBtn.setColor('#ffffff'))
    helpBtn.on('pointerout',  () => helpBtn.setColor('#00ccaa'))
    helpBtn.on('pointerdown', () => {
      this.codeInput.style.display = 'none'
      this.scene.pause()
      this.scene.launch('RulesScene')
    })
    helpBtn.setDepth(50)

    this.events.on('resume', () => {
      this.codeInput.style.display = ''
    })

    // CREATE ROOM button — filled teal
    createButton(this, width / 2, height * 0.28, t('createRoom'), true, () => {
      getSocket().emit('room:create')
    })

    // Divider
    this.add.text(width / 2, height * 0.37, t('or'), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#a8a8df',
    }).setOrigin(0.5)

    // Code input label — close to the input
    this.add.text(width / 2, height * 0.43, t('enterCode'), {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#aaaacc',
    }).setOrigin(0.5)

    // HTML input for room code
    this.codeInput = document.createElement('input')
    this.codeInput.type = 'text'
    this.codeInput.placeholder = 'XXXX'
    this.codeInput.maxLength = 4
    Object.assign(this.codeInput.style, {
      position: 'fixed',
      fontFamily: 'monospace',
      fontSize: '28px',
      padding: '10px 16px',
      background: '#16213e',
      color: '#ffffff',
      border: '2px solid #00ccaa',
      borderRadius: '4px',
      outline: 'none',
      textAlign: 'center',
      width: '10px',
      letterSpacing: '8px',
      textTransform: 'uppercase',
      zIndex: '10',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    })
    this.codeInput.addEventListener('focus', () => {
      this.codeInput.style.borderColor = '#00ffcc'
      this.codeInput.style.boxShadow = '0 0 8px #00ccaa88'
    })
    this.codeInput.addEventListener('blur', () => {
      this.codeInput.style.borderColor = '#00ccaa'
      this.codeInput.style.boxShadow = 'none'
    })
    document.body.appendChild(this.codeInput)
    this.repositionInput()

    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoin()
    })

    // JOIN button — outlined teal, same width as CREATE ROOM
    createButton(this, width / 2, height * 0.62, t('join'), false, () => {
      this.handleJoin()
    })

    // Error text
    this.errorText = this.add.text(width / 2, height * 0.72, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ff4444',
    }).setOrigin(0.5)

    // Language switcher
    addLangSwitcher(this, () => {
      this.cleanup()
      this.scene.restart()
    })

    const socket = getSocket()

    socket.on('room:created', ({ code, players, difficulty }) => {
      trackRoomCreated()
      trackSceneLeave('WelcomeScene')
      hideAdBanner()
      sessionStorage.setItem('roomCode', code)
      this.cleanup()
      this.scene.start('LobbyScene', { code, players, difficulty })
    })

    socket.on('room:joined', ({ code, players, difficulty, phase }) => {
      trackRoomJoined()
      trackSceneLeave('WelcomeScene')
      hideAdBanner()
      sessionStorage.setItem('roomCode', code)
      this.cleanup()
      this.scene.start('LobbyScene', { code, players, difficulty, phase })
    })

    socket.on('room:error', ({ message }) => {
      this.errorText.setText(t(message))
    })
  }

  // Subtle horizontal scanlines for retro feel
  private addScanlines(width: number, height: number): void {
    const g = this.add.graphics()
    g.lineStyle(1, 0x000000, 0.12)
    for (let y = 0; y < height; y += 3) {
      g.lineBetween(0, y, width, y)
    }
    g.setDepth(100)
  }

  // Pixel-art car driving left→right on a loop
  private createDrivingCar(screenWidth: number, y: number): void {
    const g = this.add.graphics()
    // Body
    g.fillStyle(0xffdd00, 1)
    g.fillRect(-12, -5, 24, 10)
    // Roof
    g.fillStyle(0xaa9900, 1)
    g.fillRect(-7, -11, 14, 6)
    // Windshields
    g.fillStyle(0x88ccff, 1)
    g.fillRect(-5, -10, 4, 4)
    g.fillRect(1, -10, 4, 4)
    // Wheels
    g.fillStyle(0x222222, 1)
    g.fillRect(-10, 4, 7, 4)
    g.fillRect(3, 4, 7, 4)

    g.setPosition(-20, y)

    this.tweens.add({
      targets: g,
      x: screenWidth + 20,
      duration: 4000,
      repeat: -1,
      ease: 'Linear',
    })
  }

  private repositionInput(): void {
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    const { width, height } = this.scale
    const scaleX = rect.width / width
    const scaleY = rect.height / height

    const inputWidth = 140 * scaleX
    const inputX = rect.left + (width / 2) * scaleX - inputWidth / 2
    const inputY = rect.top + height * 0.50 * scaleY

    this.codeInput.style.left = `${inputX}px`
    this.codeInput.style.top = `${inputY}px`
    this.codeInput.style.width = `${inputWidth}px`
  }

  private handleJoin(): void {
    const code = this.codeInput.value.trim().toUpperCase()
    if (code.length < 4) {
      this.errorText.setText(t('invalidCode'))
      return
    }
    this.errorText.setText('')
    getSocket().emit('room:join', { code })
  }

  private cleanup(): void {
    this.codeInput.parentNode?.removeChild(this.codeInput)
    const socket = getSocket()
    socket.off('room:created')
    socket.off('room:joined')
    socket.off('room:error')
  }

  shutdown(): void {
    this.cleanup()
  }
}
