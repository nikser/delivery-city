import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'
import { t } from '../i18n'
import { addLangSwitcher } from '../ui/LangSwitcher'

export class LobbyScene extends Phaser.Scene {
  private nicknameInput!: HTMLInputElement
  private playerListRows: Phaser.GameObjects.Text[] = []
  private statusText!: Phaser.GameObjects.Text
  private roomCode: string = ''
  private initialPlayers: Array<{ id: string; nickname: string; isBot: boolean }> = []
  private initialDifficulty: 'slow' | 'medium' | 'fast' = 'medium'
  private initialPhase: 'lobby' | 'playing' | 'results' = 'lobby'

  constructor() {
    super({ key: 'LobbyScene' })
  }

  init(data: { code: string; players?: Array<{ id: string; nickname: string; isBot: boolean }>; difficulty?: 'slow' | 'medium' | 'fast'; phase?: 'lobby' | 'playing' | 'results' }): void {
    this.roomCode = data?.code ?? ''
    this.initialPlayers = data?.players ?? []
    this.initialDifficulty = data?.difficulty ?? 'medium'
    this.initialPhase = data?.phase ?? 'lobby'
  }

  create(): void {
    this.playerListRows = []
    const { width, height } = this.scale

    // Back button (top-left)
    const backBtn = this.add.text(24, 18, t('back'), {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#6666aa',
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true })
    backBtn.on('pointerover', () => backBtn.setColor('#aaaaff'))
    backBtn.on('pointerout', () => backBtn.setColor('#6666aa'))
    backBtn.on('pointerdown', () => {
      this.cleanup()
      this.scene.start('WelcomeScene')
    })

    // Room code display (top-right)
    if (this.roomCode) {
      const codeLabel = this.add.text(width - 16, 18, t('roomCodeLabel'), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#555577',
      }).setOrigin(1, 0)

      const codeText = this.add.text(width - 16, 34, this.roomCode, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#44ccff',
        stroke: '#0066aa',
        strokeThickness: 2,
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true })

      codeText.on('pointerover', () => codeText.setColor('#ffffff'))
      codeText.on('pointerout', () => codeText.setColor('#44ccff'))
      codeText.on('pointerdown', () => {
        navigator.clipboard?.writeText(this.roomCode)
        codeText.setText(t('copied'))
        this.time.delayedCall(1500, () => codeText.setText(this.roomCode))
      })
    }

    // Title
    this.add.text(width / 2, height * 0.08, 'DELIVERY CITY', {
      fontFamily: 'monospace',
      fontSize: '56px',
      color: '#ffdd00',
      stroke: '#aa8800',
      strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.16, t('tagline'), {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5)

    if (this.initialPhase === 'playing') {
      this.createMidGameJoinUI(width, height)
      return
    }

    // Nickname label
    this.add.text(width / 2, height * 0.23, t('enterNick'), {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5)

    // HTML input element
    this.nicknameInput = document.createElement('input')
    this.nicknameInput.type = 'text'
    this.nicknameInput.placeholder = t('nickPlaceholder')
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
    const playBtn = this.add.text(width / 2, height * 0.39, t('ready'), {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#00ff88',
      backgroundColor: '#002244',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    // Start session button
    const startBtn = this.add.text(width / 2, height * 0.49, t('startGame'), {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#ffaa00',
      backgroundColor: '#332200',
      padding: { x: 20, y: 10 },
    }).setOrigin(0.5)

    // Bot difficulty selector
    type Difficulty = 'slow' | 'medium' | 'fast'
    const difficulties: { key: Difficulty; label: string }[] = [
      { key: 'slow',   label: t('slow')   },
      { key: 'medium', label: t('medium') },
      { key: 'fast',   label: t('fast')   },
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
      diffBtns.forEach(({ btn, key }) => {
        btn.setColor(key === d ? '#000000' : '#aaaaaa')
        btn.setBackgroundColor(key === d ? '#44ccff' : '#223344')
      })
    }

    diffBtns.forEach(({ btn, key }) => {
      btn.setInteractive({ useHandCursor: true })
      btn.on('pointerdown', () => getSocket().emit('bot:difficulty', { difficulty: key }))
    })

    // Apply initial difficulty received from server
    selectDifficulty(this.initialDifficulty)

    // Bot buttons — disabled until joined
    const botAddBtn = this.add.text(width / 2 - 90, height * 0.57, t('addBot'), {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#44ccff',
      backgroundColor: '#002233',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5)

    const botRemoveBtn = this.add.text(width / 2 + 90, height * 0.57, t('removeBot'), {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#ff6644',
      backgroundColor: '#330800',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5)

    const setJoined = (value: boolean) => {
      joined = value
      if (joined) {
        playBtn.setText(t('cancel'))
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
        playBtn.setText(t('ready'))
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
    botAddBtn.on('pointerdown', () => getSocket().emit('bot:add'))

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

    this.add.text(tableX - TABLE_W / 2 + 14, tableY - 22, t('tableHeader'), {
      fontFamily: 'monospace', fontSize: '12px', color: '#555577',
    })

    for (let i = 0; i < MAX_ROWS; i++) {
      const row = this.add.text(tableX - TABLE_W / 2 + 14, tableY + i * ROW_H, '', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ccccff',
      })
      this.playerListRows.push(row)
    }

    // Render initial player list (received before this scene was created)
    this.renderPlayerList(this.initialPlayers)

    // Language switcher
    addLangSwitcher(this, () => {
      this.cleanup()
      this.scene.restart()
    })

    // Socket events
    const socket = getSocket()

    socket.on('lobby:update', (data) => {
      this.renderPlayerList(data.players)
      selectDifficulty(data.difficulty)
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
    this.statusText.setText(`${t('connecting')} ${nickname}...`)
    getSocket().emit('player:join', { nickname })
  }

  private cleanup(): void {
    this.nicknameInput.parentNode?.removeChild(this.nicknameInput)
    const socket = getSocket()
    socket.off('lobby:update')
    socket.off('game:start')
  }

  private createMidGameJoinUI(width: number, height: number): void {
    this.add.text(width / 2, height * 0.36, t('midGameTitle'), {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ffaa00',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.46, t('midGameDesc'), {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#aaaacc',
      align: 'center',
    }).setOrigin(0.5)

    // Nickname input
    this.add.text(width / 2, height * 0.56, t('enterNick'), {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
    }).setOrigin(0.5)

    this.nicknameInput = document.createElement('input')
    this.nicknameInput.type = 'text'
    this.nicknameInput.placeholder = t('nickPlaceholder')
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
      if (e.key === 'Enter') this.handleMidGameJoin()
    })

    const joinBtn = this.add.text(width / 2, height * 0.72, t('joinGame'), {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#00ff88',
      backgroundColor: '#002244',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    joinBtn.on('pointerover', () => joinBtn.setColor('#ffffff'))
    joinBtn.on('pointerout', () => joinBtn.setColor('#00ff88'))
    joinBtn.on('pointerdown', () => this.handleMidGameJoin())

    const socket = getSocket()
    socket.on('game:start', (data) => {
      this.cleanup()
      this.scene.start('GameScene', data)
    })
  }

  private handleMidGameJoin(): void {
    const nickname = this.nicknameInput.value.trim() || 'Player'
    localStorage.setItem('nickname', nickname)
    getSocket().emit('player:join', { nickname })
  }

  private renderPlayerList(players: Array<{ id: string; nickname: string; isBot: boolean }>): void {
    const MAX_ROWS = 10
    for (let i = 0; i < MAX_ROWS; i++) {
      const p = players[i]
      if (p) {
        const nick = p.nickname.length > 16 ? p.nickname.slice(0, 15) + '…' : p.nickname
        const nickPad = nick.padEnd(17)
        const type = p.isBot ? t('typeBot') : t('typeHuman')
        const color = p.isBot ? '#7799bb' : '#ccccff'
        this.playerListRows[i].setText(`${String(i + 1).padStart(2)}.  ${nickPad}${type}`)
        this.playerListRows[i].setColor(color)
      } else {
        this.playerListRows[i].setText(`${String(i + 1).padStart(2)}.  —`)
        this.playerListRows[i].setColor('#333355')
      }
    }
  }

  shutdown(): void {
    this.cleanup()
  }
}
