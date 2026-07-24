import Phaser from 'phaser';
import { PROP_TEXTURE_KEYS, PROP_TEXTURE_PATHS } from '../config/propAssets';

export function preloadPropAssets(scene: Phaser.Scene): void {
  for (const key of Object.values(PROP_TEXTURE_KEYS)) {
    scene.load.image(key, PROP_TEXTURE_PATHS[key]);
  }
}
