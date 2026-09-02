import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../utils/constants';
import { MONO } from './theme';

const UI_GRAIN_KEY = 'ui-grain';

/** Subtle film grain overlay for menu / hub screens. */
export function ensureUiGrainTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(UI_GRAIN_KEY)) {
    return;
  }

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);
    const light = Math.random() > 0.5;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(x, y, 1, 1);
  }

  scene.textures.addCanvas(UI_GRAIN_KEY, canvas);
}

/** Full-screen void fill + scrolling grain tile. */
export function addMonoScreenBackground(scene: Phaser.Scene): Phaser.GameObjects.Container {
  ensureUiGrainTexture(scene);
  const root = scene.add.container(0, 0);

  const base = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, MONO.void);
  root.add(base);

  if (scene.textures.exists(UI_GRAIN_KEY)) {
    const grain = scene.add
      .tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, UI_GRAIN_KEY)
      .setAlpha(MONO.grainAlpha)
      .setTileScale(2, 2);
    root.add(grain);
    const drift = (_time: number, delta: number): void => {
      if (grain.active) {
        grain.tilePositionY += delta * 0.012;
      }
    };
    scene.events.on('update', drift);
    // Menus rebuild this background often; drop the listener with the grain so
    // dead callbacks don't pile up on the scene's update event.
    grain.once('destroy', () => scene.events.off('update', drift));
  }

  return root;
}
