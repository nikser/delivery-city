import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'
import { t } from '../i18n'
import { addLangSwitcher } from '../ui/LangSwitcher'
import { createButton } from '../ui/Button'

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

    // Scanlines — match WelcomeScene style
    const sg = this.add.graphics()
    sg.lineStyle(1, 0x000000, 0.12)
    for (let y = 0; y < height; y += 3) sg.lineBetween(0, y, width, y)
    sg.setDepth(100)

    // Back button (top-left)
    const backBtn = this.add.text(20, 16, t('back'), {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#6666aa',
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true })
    backBtn.on('pointerover', () => backBtn.setColor('#aaaaff'))
    backBtn.on('pointerout',  () => backBtn.setColor('#6666aa'))
    backBtn.on('pointerdown', () => {
      this.cleanup()
      this.scene.start('WelcomeScene')
    })

    // Room code (top-right) — compact to not clash with title
    if (this.roomCode) {
      this.add.text(width - 16, 12, t('roomCodeLabel'), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#555577',
      }).setOrigin(1, 0)

      const codeText = this.add.text(width - 16, 26, this.roomCode, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#44ccff',
        stroke: '#0066aa',
        strokeThickness: 2,
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true })

      codeText.on('pointerover', () => codeText.setColor('#ffffff'))
      codeText.on('pointerout',  () => codeText.setColor('#44ccff'))
      codeText.on('pointerdown', () => {
        navigator.clipboard?.writeText(this.roomCode)
        codeText.setText(t('copied'))
        this.time.delayedCall(1500, () => codeText.setText(this.roomCode))
      })
    }

    // Title — 40px, positioned below header area
    this.add.text(width / 2, height * 0.11, 'DELIVERY CITY', {
      fontFamily: 'monospace',
      fontSize: '40px',
      color: '#ffdd00',
      stroke: '#aa8800',
      strokeThickness: 4,
    }).setOrigin(0.5)

    if (this.initialPhase === 'playing') {
      this.createMidGameJoinUI(width, height)
      return
    }

    // Nickname label
    this.add.text(width / 2, height * 0.21, t('enterNick'), {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#aaaacc',
    }).setOrigin(0.5)

    // HTML nickname input
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
      border: '2px solid #00ccaa',
      borderRadius: '4px',
      outline: 'none',
      textAlign: 'center',
      width: '280px',
      zIndex: '10',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    })
    this.nicknameInput.addEventListener('focus', () => {
      this.nicknameInput.style.borderColor = '#00ffcc'
      this.nicknameInput.style.boxShadow = '0 0 8px #00ccaa88'
    })
    this.nicknameInput.addEventListener('blur', () => {
      this.nicknameInput.style.borderColor = '#00ccaa'
      this.nicknameInput.style.boxShadow = 'none'
    })
    document.body.appendChild(this.nicknameInput)
    this.repositionInput()

    this.nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoin()
    })

    // Status text
    this.statusText = this.add.text(width / 2, height * 0.33, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#aaaaff',
    }).setOrigin(0.5)

    // READY button — filled teal, switches to outlined on join
    let joined = false
    const ready = createButton(this, width / 2, height * 0.38, t('ready'), true, () => {
      if (!joined) {
        this.handleJoin()
        setJoined(true)
      } else {
        getSocket().emit('player:leave')
        this.statusText.setText('')
        setJoined(false)
      }
    })

    // START GAME button — outlined, disabled until joined
    const start = createButton(this, width / 2, height * 0.48, t('startGame'), false, () => {
      getSocket().emit('session:start')
    })

    // Bot buttons — side by side, smaller width
    const botAdd = createButton(this, width / 2 - 80, height * 0.57, t('addBot'), false, () => {
      getSocket().emit('bot:add')
    }, { width: 140, fontSize: '16px' })

    const botRemove = createButton(this, width / 2 + 80, height * 0.57, t('removeBot'), false, () => {
      getSocket().emit('bot:remove')
    }, { width: 140, fontSize: '16px', danger: true })

    // Difficulty selector
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
        color: '#aaaaaa',
        backgroundColor: '#223344',
        padding: { x: 8, y: 5 },
      }).setOrigin(0.5)
      return { btn, key }
    })

    const selectDifficulty = (d: Difficulty) => {
      diffBtns.forEach(({ btn, key }) => {
        btn.setColor(key === d ? '#000000' : '#aaaaaa')
        btn.setBackgroundColor(key === d ? '#00ccaa' : '#223344')
      })
    }

    diffBtns.forEach(({ btn, key }) => {
      btn.setInteractive({ useHandCursor: true })
      btn.on('pointerdown', () => getSocket().emit('bot:difficulty', { difficulty: key }))
    })

    selectDifficulty(this.initialDifficulty)

    const setJoined = (value: boolean) => {
      joined = value
      if (joined) {
        ready.setLabel(t('cancel'))
        ready.setFilled(false)
        ready.setDanger(true)
        this.nicknameInput.disabled = true
        this.nicknameInput.style.opacity = '0.45'
        this.nicknameInput.style.cursor = 'default'
        start.container.setInteractive({ useHandCursor: true })
        botAdd.container.setInteractive({ useHandCursor: true })
        botRemove.container.setInteractive({ useHandCursor: true })
        start.container.setAlpha(1)
        botAdd.container.setAlpha(1)
        botRemove.container.setAlpha(1)
        diffBtns.forEach(({ btn }) => btn.setAlpha(1))
      } else {
        ready.setLabel(t('ready'))
        ready.setFilled(true)
        ready.setDanger(false)
        this.nicknameInput.disabled = false
        this.nicknameInput.style.opacity = '1'
        this.nicknameInput.style.cursor = ''
        start.container.disableInteractive()
        botAdd.container.disableInteractive()
        botRemove.container.disableInteractive()
        start.container.setAlpha(0.35)
        botAdd.container.setAlpha(0.35)
        botRemove.container.setAlpha(0.35)
        diffBtns.forEach(({ btn }) => btn.setAlpha(0.35))
      }
    }

    setJoined(false)

    // Player list table
    const MAX_ROWS = 9
    const ROW_H = 22
    const TABLE_W = 320
    const tableX = width / 2
    const tableY = height * 0.71
    const tableH = ROW_H * MAX_ROWS + 32

    const tableBg = this.add.graphics()
    tableBg.fillStyle(0x08081a, 0.85)
    tableBg.fillRect(tableX - TABLE_W / 2, tableY - 26, TABLE_W, tableH)
    tableBg.lineStyle(1, 0x2a2a5a, 1)
    tableBg.strokeRect(tableX - TABLE_W / 2, tableY - 26, TABLE_W, tableH)
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

    this.renderPlayerList(this.initialPlayers)

    addLangSwitcher(this, () => {
      this.cleanup()
      this.scene.restart()
    })

    // How to play button — bottom-left
    const helpBtn = this.add.text(16, height - 16, t('howToPlay'), {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#00ccaa',
    }).setOrigin(0, 1).setInteractive({ useHandCursor: true }).setDepth(50)
    helpBtn.on('pointerover', () => helpBtn.setColor('#ffffff'))
    helpBtn.on('pointerout',  () => helpBtn.setColor('#00ccaa'))
    helpBtn.on('pointerdown', () => {
      this.nicknameInput.style.display = 'none'
      this.scene.pause()
      this.scene.launch('RulesScene', { caller: 'LobbyScene' })
    })

    this.events.on('resume', () => {
      this.nicknameInput.style.display = ''
    })

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

  private repositionInput(yFraction = 0.265): void {
    const canvas = this.game.canvas
    const rect = canvas.getBoundingClientRect()
    const { width, height } = this.scale
    const scaleX = rect.width / width

    const inputWidth = 280 * scaleX
    const inputX = rect.left + (width / 2) * scaleX - inputWidth / 2
    const inputY = rect.top + height * yFraction * (rect.height / height)

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
      fontSize: '24px',
      color: '#ffaa00',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.44, t('midGameDesc'), {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#aaaacc',
      align: 'center',
    }).setOrigin(0.5)

    this.add.text(width / 2, height * 0.53, t('enterNick'), {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#aaaacc',
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
      border: '2px solid #00ccaa',
      borderRadius: '4px',
      outline: 'none',
      textAlign: 'center',
      width: '280px',
      zIndex: '10',
      transition: 'border-color 0.15s, box-shadow 0.15s',
    })
    this.nicknameInput.addEventListener('focus', () => {
      this.nicknameInput.style.borderColor = '#00ffcc'
      this.nicknameInput.style.boxShadow = '0 0 8px #00ccaa88'
    })
    this.nicknameInput.addEventListener('blur', () => {
      this.nicknameInput.style.borderColor = '#00ccaa'
      this.nicknameInput.style.boxShadow = 'none'
    })
    document.body.appendChild(this.nicknameInput)
    this.repositionInput(0.56)

    const lockForm = () => {
      this.nicknameInput.disabled = true
      this.nicknameInput.style.opacity = '0.45'
      this.nicknameInput.style.cursor = 'default'
      joinBtn.container.disableInteractive()
      joinBtn.container.setAlpha(0.45)
    }

    this.nicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.handleMidGameJoin(); lockForm() }
    })

    const joinBtn = createButton(this, width / 2, height * 0.68, t('joinGame'), true, () => {
      this.handleMidGameJoin()
      lockForm()
    })

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
    const MAX_ROWS = 9
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
