import { initSentry } from './telemetry'
initSentry()

import Phaser from 'phaser'
import { WelcomeScene } from './scenes/WelcomeScene'
import { LobbyScene } from './scenes/LobbyScene'
import { GameScene } from './scenes/GameScene'
import { ResultScene } from './scenes/ResultScene'
import { RulesScene } from './scenes/RulesScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#3a3228',
  scene: [WelcomeScene, LobbyScene, GameScene, ResultScene, RulesScene],
  parent: 'game',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}

new Phaser.Game(config)
