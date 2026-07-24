import Phaser from 'phaser';
import { BRIEFCASE_BOOSTER_TEXTURE_KEY, SLIDE_TRAIL_TEXTURE_KEY } from '../config/briefcaseAssets';

export function preloadBriefcaseAssets(scene: Phaser.Scene): void {
  scene.load.image(BRIEFCASE_BOOSTER_TEXTURE_KEY, 'assets/props/booster-burst.png');
  scene.load.image(SLIDE_TRAIL_TEXTURE_KEY, 'assets/props/slide-trail.png');
}
