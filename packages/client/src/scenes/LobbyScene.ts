import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'

export class LobbyScene extends Phaser.Scene {
  private nicknameInput!: HTMLInputElement
  private playerListText!: Phaser.GameObjects.Text
  private statusText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'LobbyScene' })
  }

  create(): void {
    const { width, height } = this.scale

    // Title
    this.add.text(width / 2, height * 0.1, 'DELIVERY CITY', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#ffdd00',
      stroke: '#aa8800',
      strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.2, 'Доставляй быстрее всех!', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5)

    // Nickname label
    this.add.text(width / 2, height * 0.31, 'Введи ник:', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5)

    // HTML input element
    this.nicknameInput = document.createElement('input')
    this.nicknameInput.type = 'text'
    this.nicknameInput.placeholder = 'Твой ник...'
    this.nicknameInput.maxLength = 16
    this.nicknameInput.value = localStorage.getItem('nickname') || ''
    Object.assign(this.nicknameInput.style, {
      position: 'fixed',
      fontFamily: 'monospace',
      fontSize: '20px',
      padding: '10px 16px',
      background: '#16213e',
      color: '#ffffff',
      border: '2px solid #4444aa',
      borderRadius: '4px',
      outline: 'none',
      textAlign: 'center',
      width: '280px',
      zIndex: '10',
    })
    document.body.appendChild(this.nicknameInput)
    this.repositionInput()

    this.nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoin()
    })

    // Status text
    this.statusText = this.add.text(width / 2, height * 0.43, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#aaaaff',
    }).setOrigin(0.5)

    // Play button
    const playBtn = this.add.text(width / 2, height * 0.5, '[ ИГРАТЬ ]', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#00ff88',
      backgroundColor: '#002244',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    playBtn.on('pointerover', () => playBtn.setColor('#ffffff'))
    playBtn.on('pointerout', () => playBtn.setColor('#00ff88'))
    playBtn.on('pointerdown', () => this.handleJoin())

    // Start session button
    const startBtn = this.add.text(width / 2, height * 0.62, '[ НАЧАТЬ ИГРУ ]', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffaa00',
      backgroundColor: '#332200',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    startBtn.on('pointerover', () => startBtn.setColor('#ffffff'))
    startBtn.on('pointerout', () => startBtn.setColor('#ffaa00'))
    startBtn.on('pointerdown', () => {
      getSocket().emit('session:start')
    })

    // Add bot button
    const botAddBtn = this.add.text(width / 2 - 70, height * 0.7, '[ + БОТ ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#44ccff',
      backgroundColor: '#002233',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    botAddBtn.on('pointerover', () => botAddBtn.setColor('#ffffff'))
    botAddBtn.on('pointerout', () => botAddBtn.setColor('#44ccff'))
    botAddBtn.on('pointerdown', () => getSocket().emit('bot:add'))

    // Remove bot button
    const botRemoveBtn = this.add.text(width / 2 + 70, height * 0.7, '[ - БОТ ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ff6644',
      backgroundColor: '#330800',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    botRemoveBtn.on('pointerover', () => botRemoveBtn.setColor('#ffffff'))
    botRemoveBtn.on('pointerout', () => botRemoveBtn.setColor('#ff6644'))
    botRemoveBtn.on('pointerdown', () => getSocket().emit('bot:remove'))

    // Lobby list header
    this.add.text(width / 2, height * 0.8, 'Игроки в лобби:', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#888899',
    }).setOrigin(0.5)

    this.playerListText = this.add.text(width / 2, height * 0.88, '—', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ccccff',
      align: 'center',
    }).setOrigin(0.5)

    // Socket events
    const socket = getSocket()

    socket.on('lobby:update', (data) => {
      const names = data.players.map((p) => `• ${p.nickname}`).join('\n')
      this.playerListText.setText(names || '—')
    })

    socket.on('game:start', (data) => {
      this.cleanup()
      this.scene.start('GameScene', data)
    })
  }

  private repositionInput(): void {
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    const { width, height } = this.scale
    const scaleX = rect.width / width

    const inputWidth = 280 * scaleX
    const inputX = rect.left + (width / 2) * scaleX - inputWidth / 2
    const inputY = rect.top + height * 0.365 * (rect.height / height)

    this.nicknameInput.style.left = `${inputX}px`
    this.nicknameInput.style.top = `${inputY}px`
    this.nicknameInput.style.width = `${inputWidth}px`
  }

  private handleJoin(): void {
    const nickname = this.nicknameInput.value.trim() || 'Player'
    localStorage.setItem('nickname', nickname)
    this.statusText.setText(`Подключаемся как ${nickname}...`)
    getSocket().emit('player:join', { nickname })
  }

  private cleanup(): void {
    this.nicknameInput.parentNode?.removeChild(this.nicknameInput)
    const socket = getSocket()
    socket.off('lobby:update')
    socket.off('game:start')
  }

  shutdown(): void {
    this.cleanup()
  }
}
