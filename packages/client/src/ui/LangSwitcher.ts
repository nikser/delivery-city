import Phaser from 'phaser'
import { ALL_LANGS, LANG_LABELS, getLang, setLang, LangCode } from '../i18n'

export function addLangSwitcher(scene: Phaser.Scene, onChanged: () => void): void {
  const { width, height } = scene.scale
  const btnW = 38
  const totalW = ALL_LANGS.length * btnW
  const startX = width - totalW - 8
  const y = height - 14

  ALL_LANGS.forEach((lang: LangCode, i) => {
    const active = lang === getLang()
    const x = startX + i * btnW + btnW / 2
    const btn = scene.add.text(x, y, LANG_LABELS[lang], {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: active ? '#000000' : '#444466',
      backgroundColor: active ? '#44ccff' : '#1a1a2e',
      padding: { x: 5, y: 3 },
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(300).setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => { if (lang !== getLang()) btn.setColor('#aaaaff') })
    btn.on('pointerout',  () => { if (lang !== getLang()) btn.setColor('#444466') })
    btn.on('pointerdown', () => {
      if (lang === getLang()) return
      setLang(lang)
      onChanged()
    })
  })
}
