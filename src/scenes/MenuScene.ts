import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // BRIGHT RED BACKGROUND - impossible to miss
    this.cameras.main.setBackgroundColor('#ff0000');

    this.add.text(w / 2, h / 2 - 80, '🐛 BUG EATERS', {
      fontSize: '70px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(w / 2, h / 2, 'RED = SCENE LOADED', {
      fontSize: '40px', color: '#ffff00', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(w / 2, h / 2 + 80, 'TAP ANYWHERE TO PLAY', {
      fontSize: '32px', color: '#ffffff'
    }).setOrigin(0.5);

    this.input.on('pointerdown', () => this.scene.start('MainScene'));
  }
}