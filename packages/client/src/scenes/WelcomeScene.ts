import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'

export class WelcomeScene extends Phaser.Scene {
  private codeInput!: HTMLInputElement
  private errorText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'WelcomeScene' })
  }

  create(): void {
    const { width, height } = this.scale

    // Title
    this.add.text(width / 2, height * 0.13, 'DELIVERY CITY', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#ffdd00',
      stroke: '#aa8800',
      strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.23, 'Доставляй быстрее всех!', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5)

    // Create room button
    const createBtn = this.add.text(width / 2, height * 0.34, '[ СОЗДАТЬ КОМНАТУ ]', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#00ff88',
      backgroundColor: '#002244',
      padding: { x: 24, y: 14 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    createBtn.on('pointerover', () => createBtn.setColor('#ffffff'))
    createBtn.on('pointerout', () => createBtn.setColor('#00ff88'))
    createBtn.on('pointerdown', () => getSocket().emit('room:create'))

    // Divider
    this.add.text(width / 2, height * 0.46, '— или —', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#a8a8df',
    }).setOrigin(0.5)

    // Code input label
    this.add.text(width / 2, height * 0.57, 'Введи код комнаты:', {
      fontFamily: 'monospace',
      fontSize: '18px',
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
      border: '2px solid #4444aa',
      borderRadius: '4px',
      outline: 'none',
      textAlign: 'center',
      width: '10px',
      letterSpacing: '8px',
      textTransform: 'uppercase',
      zIndex: '10',
      marginTop: '-30px',
    })
    document.body.appendChild(this.codeInput)
    this.repositionInput()

    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoin()
    })

    // Join button
    const joinBtn = this.add.text(width / 2, height * 0.73, '[ ВОЙТИ ]', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffaa00',
      backgroundColor: '#332200',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    joinBtn.on('pointerover', () => joinBtn.setColor('#ffffff'))
    joinBtn.on('pointerout', () => joinBtn.setColor('#ffaa00'))
    joinBtn.on('pointerdown', () => this.handleJoin())

    // Error text
    this.errorText = this.add.text(width / 2, height * 0.82, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ff4444',
    }).setOrigin(0.5)

    const socket = getSocket()

    socket.on('room:created', ({ code, players, difficulty }) => {
      sessionStorage.setItem('roomCode', code)
      this.cleanup()
      this.scene.start('LobbyScene', { code, players, difficulty })
    })

    socket.on('room:joined', ({ code, players, difficulty, phase }) => {
      sessionStorage.setItem('roomCode', code)
      this.cleanup()
      this.scene.start('LobbyScene', { code, players, difficulty, phase })
    })

    socket.on('room:error', ({ message }) => {
      this.errorText.setText(message)
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
    const inputY = rect.top + height * 0.645 * scaleY

    this.codeInput.style.left = `${inputX}px`
    this.codeInput.style.top = `${inputY}px`
    this.codeInput.style.width = `${inputWidth}px`
  }

  private handleJoin(): void {
    const code = this.codeInput.value.trim().toUpperCase()
    if (code.length < 4) {
      this.errorText.setText('Введи 4-значный код')
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
