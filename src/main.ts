import Phaser from 'phaser';
import { MenuScene } from "./scenes/MenuScene";
import { MainScene } from "./scenes/MainScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Boot into the MenuScene first. MainScene and UIScene are loaded sequentially.
  scene: [MenuScene, MainScene] 
};

new Phaser.Game(config);