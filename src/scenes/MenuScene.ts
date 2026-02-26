import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    const { width, height } = this.scale;

    // Solid dark background (so no black void)
    this.add.rectangle(width/2, height/2, width, height, 0x0a0a0a).setDepth(-1);

    // Title
    this.add.text(width/2, height * 0.28, '🐛 BUG EATERS', {
      fontSize: '72px', color: '#ffffff', fontStyle: 'bold', fontFamily: 'Arial'
    }).setOrigin(0.5);

    this.add.text(width/2, height * 0.38, 'Dystopian Lane Runner', {
      fontSize: '28px', color: '#f44336', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Daily info
    this.add.text(width/2, height * 0.48, 'Daily Race • 17:00 UTC • One Global World', {
      fontSize: '22px', color: '#bbbbbb'
    }).setOrigin(0.5);

    // Big green play button
    const btn = this.add.rectangle(width/2, height * 0.65, 320, 90, 0x4caf50)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);

    this.add.text(width/2, height * 0.65, 'PLAY AS BUG (GUEST)', {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(11);

    btn.on('pointerdown', () => this.scene.start('MainScene'));
    btn.on('pointerover', () => btn.setFillStyle(0x66bb6a));
    btn.on('pointerout', () => btn.setFillStyle(0x4caf50));

    // Small footer
    this.add.text(width/2, height - 40, 'Solana Graveyard Hackathon • Swipe to move', {
      fontSize: '16px', color: '#666666'
    }).setOrigin(0.5);
  }
}