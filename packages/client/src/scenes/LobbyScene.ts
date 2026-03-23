import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'

export class LobbyScene extends Phaser.Scene {
  private nicknameInput!: HTMLInputElement
  private playerListRows: Phaser.GameObjects.Text[] = []
  private statusText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'LobbyScene' })
  }

  create(): void {
    const { width, height } = this.scale

    // Title
    this.add.text(width / 2, height * 0.08, 'DELIVERY CITY', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#ffdd00',
      stroke: '#aa8800',
      strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.16, 'Доставляй быстрее всех!', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5)

    // Nickname label
    this.add.text(width / 2, height * 0.23, 'Введи ник:', {
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
    this.statusText = this.add.text(width / 2, height * 0.32, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#aaaaff',
    }).setOrigin(0.5)

    // Ready button
    let joined = false
    const playBtn = this.add.text(width / 2, height * 0.39, '[ ГОТОВ ]', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#00ff88',
      backgroundColor: '#002244',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    // Start session button
    const startBtn = this.add.text(width / 2, height * 0.49, '[ НАЧАТЬ ИГРУ ]', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffaa00',
      backgroundColor: '#332200',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5)

    // Bot difficulty selector
    type Difficulty = 'slow' | 'medium' | 'fast'
    let botDifficulty: Difficulty = 'medium'
    const difficulties: { key: Difficulty; label: string }[] = [
      { key: 'slow',   label: 'МЕД' },
      { key: 'medium', label: 'СР'  },
      { key: 'fast',   label: 'БЫС' },
    ]
    const diffBtns = difficulties.map(({ key, label }, i) => {
      const btn = this.add.text(width / 2 - 44 + i * 44, height * 0.645, label, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: key === 'medium' ? '#000000' : '#aaaaaa',
        backgroundColor: key === 'medium' ? '#44ccff' : '#223344',
        padding: { x: 8, y: 5 },
      }).setOrigin(0.5)
      return { btn, key }
    })

    const selectDifficulty = (d: Difficulty) => {
      botDifficulty = d
      diffBtns.forEach(({ btn, key }) => {
        btn.setColor(key === d ? '#000000' : '#aaaaaa')
        btn.setBackgroundColor(key === d ? '#44ccff' : '#223344')
      })
    }

    diffBtns.forEach(({ btn, key }) => {
      btn.setInteractive({ useHandCursor: true })
      btn.on('pointerdown', () => selectDifficulty(key))
    })

    // Bot buttons — disabled until joined
    const botAddBtn = this.add.text(width / 2 - 90, height * 0.57, '[ + БОТ ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#44ccff',
      backgroundColor: '#002233',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5)

    const botRemoveBtn = this.add.text(width / 2 + 90, height * 0.57, '[ - БОТ ]', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ff6644',
      backgroundColor: '#330800',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5)

    const setJoined = (value: boolean) => {
      joined = value
      if (joined) {
        playBtn.setText('[ отмена ]')
        playBtn.setFontSize('18px')
        playBtn.setColor('#888888')
        playBtn.setBackgroundColor('#1a1a1a')

        startBtn.setInteractive({ useHandCursor: true })
        botAddBtn.setInteractive({ useHandCursor: true })
        botRemoveBtn.setInteractive({ useHandCursor: true })
        startBtn.setAlpha(1)
        botAddBtn.setAlpha(1)
        botRemoveBtn.setAlpha(1)
        diffBtns.forEach(({ btn }) => btn.setAlpha(1))
      } else {
        playBtn.setText('[ ГОТОВ ]')
        playBtn.setFontSize('32px')
        playBtn.setColor('#00ff88')
        playBtn.setBackgroundColor('#002244')

        startBtn.disableInteractive()
        botAddBtn.disableInteractive()
        botRemoveBtn.disableInteractive()
        startBtn.setAlpha(0.35)
        botAddBtn.setAlpha(0.35)
        botRemoveBtn.setAlpha(0.35)
        diffBtns.forEach(({ btn }) => btn.setAlpha(0.35))
      }
    }

    // Initial state — not joined yet
    setJoined(false)

    playBtn.on('pointerover', () => { if (!joined) playBtn.setColor('#ffffff') })
    playBtn.on('pointerout',  () => { if (!joined) playBtn.setColor('#00ff88') })
    playBtn.on('pointerdown', () => {
      if (!joined) {
        this.handleJoin()
        setJoined(true)
      } else {
        getSocket().emit('player:leave')
        this.statusText.setText('')
        setJoined(false)
      }
    })

    startBtn.on('pointerover', () => startBtn.setColor('#ffffff'))
    startBtn.on('pointerout',  () => startBtn.setColor('#ffaa00'))
    startBtn.on('pointerdown', () => getSocket().emit('session:start'))

    botAddBtn.on('pointerover', () => botAddBtn.setColor('#ffffff'))
    botAddBtn.on('pointerout',  () => botAddBtn.setColor('#44ccff'))
    botAddBtn.on('pointerdown', () => getSocket().emit('bot:add', { difficulty: botDifficulty }))

    botRemoveBtn.on('pointerover', () => botRemoveBtn.setColor('#ffffff'))
    botRemoveBtn.on('pointerout',  () => botRemoveBtn.setColor('#ff6644'))
    botRemoveBtn.on('pointerdown', () => getSocket().emit('bot:remove'))

    // Player list table
    const MAX_ROWS = 10
    const ROW_H = 22
    const TABLE_W = 320
    const tableX = width / 2
    const tableY = height * 0.72
    const tableH = ROW_H * MAX_ROWS + 32

    const tableBg = this.add.graphics()
    tableBg.fillStyle(0x08081a, 0.85)
    tableBg.fillRect(tableX - TABLE_W / 2, tableY - 26, TABLE_W, tableH)
    tableBg.lineStyle(1, 0x2a2a5a, 1)
    tableBg.strokeRect(tableX - TABLE_W / 2, tableY - 26, TABLE_W, tableH)
    // Header separator
    tableBg.lineStyle(1, 0x2a2a5a, 1)
    tableBg.lineBetween(tableX - TABLE_W / 2 + 8, tableY - 4, tableX + TABLE_W / 2 - 8, tableY - 4)

    this.add.text(tableX - TABLE_W / 2 + 14, tableY - 22, '#   ИМЯ ИГРОКА          ТИП', {
      fontFamily: 'monospace', fontSize: '12px', color: '#555577',
    })

    for (let i = 0; i < MAX_ROWS; i++) {
      const row = this.add.text(tableX - TABLE_W / 2 + 14, tableY + i * ROW_H, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ccccff',
      })
      this.playerListRows.push(row)
    }

    // Socket events
    const socket = getSocket()

    socket.on('lobby:update', (data) => {
      const MAX_ROWS = 10
      for (let i = 0; i < MAX_ROWS; i++) {
        const p = data.players[i]
        if (p) {
          const nick = p.nickname.length > 16 ? p.nickname.slice(0, 15) + '…' : p.nickname
          const nickPad = nick.padEnd(17)
          const type = p.isBot ? 'бот ' : 'игрок'
          const color = p.isBot ? '#7799bb' : '#ccccff'
          this.playerListRows[i].setText(`${String(i + 1).padStart(2)}.  ${nickPad}${type}`)
          this.playerListRows[i].setColor(color)
        } else {
          this.playerListRows[i].setText(`${String(i + 1).padStart(2)}.  —`)
          this.playerListRows[i].setColor('#333355')
        }
      }
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
    const inputY = rect.top + height * 0.275 * (rect.height / height)

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
