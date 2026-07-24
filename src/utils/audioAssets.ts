import Phaser from 'phaser';
import { AUDIO_KEYS, AUDIO_PATHS } from '../config/audioAssets';

/** Loads race SFX extracted from the original Unity WebGL build. */
export function preloadAudioAssets(scene: Phaser.Scene): void {
  for (const [key, path] of Object.entries(AUDIO_PATHS)) {
    scene.load.audio(key, path);
  }
}

/** Unlocks Web Audio after the first user gesture (required on mobile webviews). */
export function unlockGameAudio(scene: Phaser.Scene): void {
  const unlock = (): void => {
    const sound = scene.sound;
    if (sound.locked) {
      sound.unlock();
    }
    scene.input.off('pointerdown', unlock);
    scene.input.keyboard?.off('keydown', unlock);
  };

  scene.input.once('pointerdown', unlock);
  scene.input.keyboard?.once('keydown', unlock);
}

/** Returns true when the lamp hum loop is ready to play. */
export function isLampBuzzLoaded(scene: Phaser.Scene): boolean {
  return scene.cache.audio.exists(AUDIO_KEYS.lampBuzz);
}
