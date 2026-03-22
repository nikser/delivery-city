import Phaser from 'phaser'
import { LobbyScene } from './scenes/LobbyScene'
import { GameScene } from './scenes/GameScene'
import { ResultScene } from './scenes/ResultScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1a1a2e',
  scene: [LobbyScene, GameScene, ResultScene],
  parent: 'game',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}

new Phaser.Game(config)
