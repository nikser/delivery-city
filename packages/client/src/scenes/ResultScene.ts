import Phaser from 'phaser'
import { getSocket } from '../network/SocketClient'

interface ResultEntry {
  id: string
  nickname: string
  score: number
  deliveries: number
}

export class ResultScene extends Phaser.Scene {
  private results: ResultEntry[] = []

  constructor() {
    super({ key: 'ResultScene' })
  }

  init(data: { results: ResultEntry[] }): void {
    this.results = (data.results || []).slice().sort((a, b) => b.score - a.score)
  }

  create(): void {
    const { width, height } = this.scale
    const results = this.results

    // Title
    this.add.text(width / 2, height * 0.08, 'РАУНД ЗАВЕРШЁН', {
      fontFamily: 'monospace',
      fontSize: '48px',
      color: '#ffdd00',
      stroke: '#aa8800',
      strokeThickness: 4,
    }).setOrigin(0.5)

    // Table headers
    const tableTop = height * 0.22
    const cols = {
      place: width * 0.12,
      nick: width * 0.38,
      deliveries: width * 0.62,
      score: width * 0.83,
    }

    const headerStyle = {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#888899',
    }

    this.add.text(cols.place, tableTop, 'Место', headerStyle).setOrigin(0.5)
    this.add.text(cols.nick, tableTop, 'Игрок', headerStyle).setOrigin(0.5)
    this.add.text(cols.deliveries, tableTop, 'Доставок', headerStyle).setOrigin(0.5)
    this.add.text(cols.score, tableTop, 'Очки', headerStyle).setOrigin(0.5)

    const lineG = this.add.graphics()
    lineG.lineStyle(1, 0x4444aa)
    lineG.lineBetween(width * 0.05, tableTop + 18, width * 0.95, tableTop + 18)

    // Result rows
    const medals = ['🥇', '🥈', '🥉']
    results.forEach((entry, i) => {
      const rowY = tableTop + 44 + i * 44
      const isWinner = i === 0
      const color = isWinner ? '#ffdd00' : i === 1 ? '#cccccc' : i === 2 ? '#cc9944' : '#aaaacc'
      const fontSize = isWinner ? '22px' : '18px'

      if (isWinner) {
        const glow = this.add.graphics()
        glow.fillStyle(0xffdd00, 0.07)
        glow.fillRect(width * 0.05, rowY - 16, width * 0.9, 36)
      }

      const style = { fontFamily: 'monospace', fontSize, color }
      const placeStr = medals[i] ?? `${i + 1}.`

      this.add.text(cols.place, rowY, placeStr, style).setOrigin(0.5)
      this.add.text(cols.nick, rowY, entry.nickname, style).setOrigin(0.5)
      this.add.text(cols.deliveries, rowY, String(entry.deliveries), style).setOrigin(0.5)
      this.add.text(cols.score, rowY, String(entry.score), style).setOrigin(0.5)
    })

    // Personal best
    const socket = getSocket()
    const myId = socket.id ?? ''
    const myResult = results.find((r) => r.id === myId)

    if (myResult) {
      const prevBest = parseInt(localStorage.getItem('bestScore') ?? '0', 10)
      const newBest = Math.max(myResult.score, prevBest)
      localStorage.setItem('bestScore', String(newBest))

      this.add.text(width / 2, height * 0.78, `Мой результат: ${myResult.score} очков`, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#aaaaff',
      }).setOrigin(0.5)

      const isNewBest = myResult.score > prevBest && myResult.score > 0
      this.add.text(width / 2, height * 0.84, `Лучший результат: ${newBest}${isNewBest ? ' 🏆' : ''}`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffaa00',
      }).setOrigin(0.5)
    }

    // Play again button
    const playBtn = this.add.text(width / 2, height * 0.93, '[ ИГРАТЬ СНОВА ]', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#00ff88',
      backgroundColor: '#002244',
      padding: { x: 22, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    playBtn.on('pointerover', () => playBtn.setColor('#ffffff'))
    playBtn.on('pointerout', () => playBtn.setColor('#00ff88'))
    playBtn.on('pointerdown', () => {
      const code = sessionStorage.getItem('roomCode')
      if (code) {
        this.scene.start('LobbyScene', { code })
      } else {
        this.scene.start('WelcomeScene')
      }
    })
  }
}
