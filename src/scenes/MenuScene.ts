import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    // Solid background (double protection)
    this.cameras.main.setBackgroundColor('#111111');
    this.add.rectangle(0, 0, width, height, 0x111111).setOrigin(0);

    // Title
    this.add.text(width / 2, height * 0.32, 'BugEaters', {
      fontSize: '58px',
      color: '#4caf50',
      fontStyle: 'bold'
    }).setOrigin(0.5).setShadow(4, 4, '#000000', 5);

    // Subtitle
    this.add.text(width / 2, height * 0.43, 'Survival of the Fittest', {
      fontSize: '26px',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Play Button
    const btnBg = this.add.rectangle(width / 2, height * 0.63, 320, 78, 0x4caf50)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(6, 0xffffff);

    this.add.text(width / 2, height * 0.63, 'Play as Bug (Guest)', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Button effects
    btnBg.on('pointerover', () => btnBg.setFillStyle(0x66bb6a));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x4caf50));
    btnBg.on('pointerdown', () => {
      this.scene.start('MainScene');
    });

    // Footer
    this.add.text(width / 2, height * 0.9, 'Join @BugEatersBot', {
      fontSize: '18px',
      color: '#666666'
    }).setOrigin(0.5);
  }
}