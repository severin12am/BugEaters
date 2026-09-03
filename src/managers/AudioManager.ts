import Phaser from 'phaser';
import { AUDIO_KEYS, PHRASE_AUDIO_KEYS, STEP_AUDIO_KEY } from '../config/audioAssets';
import { LIGHTING_TUNING } from '../config/lighting';
import { TUNING } from '../config/tuning';
import { CharacterType, ux } from '../utils/constants';
import { sampleLampLight, type LampPoint } from '../utils/lampLight';

/**
 * Unity-style race audio: random ambient phrases, footstep one-shots, lamp hum loop.
 */
/** Simultaneous footstep voices per character (steps are ~70ms clips). */
const STEP_VOICES_PER_CHARACTER = 3;

type SoundVoice = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

export class AudioManager {
  private phraseTimerMs = 0;
  private lampSound: SoundVoice | null = null;
  private readonly stepVoices = new Map<string, SoundVoice[]>();
  private stepVoiceCursor = 0;
  private active = false;
  private muted = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.scene.sound.pauseOnBlur = false;
  }

  /** Starts phrase scheduling and prepares the lamp loop. */
  startRace(): void {
    this.active = true;
    this.phraseTimerMs = TUNING.audio.phrases.firstDelaySec * 1000;
    this.ensureLampLoop();
  }

  stopRace(): void {
    this.active = false;
    this.lampSound?.stop();
    // Kill lamp + any one-shot phrases / footsteps so they never leak into menus.
    this.scene.sound.stopByKey(AUDIO_KEYS.lampBuzz);
    for (const key of PHRASE_AUDIO_KEYS) {
      this.scene.sound.stopByKey(key);
    }
    for (const key of Object.values(STEP_AUDIO_KEY)) {
      this.scene.sound.stopByKey(key);
    }
  }

  destroy(): void {
    this.stopRace();
    // Belt-and-suspenders: silence everything attached to this game's sound manager.
    this.scene.sound.stopAll();
    this.lampSound?.destroy();
    this.lampSound = null;
    for (const voices of this.stepVoices.values()) {
      voices.forEach((voice) => voice.destroy());
    }
    this.stepVoices.clear();
  }

  /**
   * Footstep one-shot synced to the walk animation (Unity Mover.Sound at volume 0.1).
   *
   * The Bug walk cycle fires ~19 steps/s. `sound.play(key)` would allocate a new
   * sound object (and audio graph) for every one, so steps rotate through a
   * small fixed set of voices per character instead.
   */
  playFootstep(character: CharacterType): void {
    if (!this.canPlaySfx()) {
      return;
    }

    const key = STEP_AUDIO_KEY[character];
    if (!this.scene.cache.audio.exists(key)) {
      return;
    }

    let voices = this.stepVoices.get(key);
    if (!voices) {
      voices = [];
      this.stepVoices.set(key, voices);
    }
    let voice = voices.find((v) => !v.isPlaying);
    if (!voice) {
      if (voices.length >= STEP_VOICES_PER_CHARACTER) {
        voice = voices[this.stepVoiceCursor++ % voices.length];
      } else {
        voice = this.scene.sound.add(key) as SoundVoice;
        voices.push(voice);
      }
    }
    voice.play({
      volume: TUNING.audio.steps.volume,
      detune: Phaser.Math.Between(-120, 120),
    });
  }

  /** Spatial lamp hum — volume follows nearest lamp brightness. */
  updateLampHum(playerX: number, playerFeetY: number, lamps: readonly LampPoint[]): void {
    if (!this.canPlaySfx()) {
      return;
    }

    const loop = this.ensureLampLoop();
    if (!loop) {
      return;
    }

    const radius = ux(LIGHTING_TUNING.lampInfluenceRadius);
    const { brightness } = sampleLampLight(playerX, playerFeetY, lamps, radius);
    const targetVolume = TUNING.audio.lamp.volume * brightness;

    if (targetVolume <= 0.01) {
      if (loop.isPlaying) {
        loop.stop();
      }
      return;
    }

    loop.setVolume(targetVolume);
    if (!loop.isPlaying) {
      loop.play();
    }
  }

  tick(deltaMs: number): void {
    if (!this.active || !this.canPlaySfx()) {
      return;
    }

    this.phraseTimerMs -= deltaMs;
    if (this.phraseTimerMs > 0) {
      return;
    }

    this.playRandomPhrase();
    this.phraseTimerMs = TUNING.audio.phrases.intervalSec * 1000;
  }

  private playRandomPhrase(): void {
    const loaded = PHRASE_AUDIO_KEYS.filter((key) => this.scene.cache.audio.exists(key));
    if (loaded.length === 0) {
      return;
    }

    const key = Phaser.Utils.Array.GetRandom(loaded);
    this.scene.sound.play(key, { volume: TUNING.audio.phrases.volume });
  }

  private ensureLampLoop(): SoundVoice | null {
    if (this.lampSound) {
      return this.lampSound;
    }
    if (!this.scene.cache.audio.exists(AUDIO_KEYS.lampBuzz)) {
      return null;
    }

    this.lampSound = this.scene.sound.add(AUDIO_KEYS.lampBuzz, {
      loop: true,
      volume: 0,
    }) as SoundVoice;
    return this.lampSound;
  }

  private canPlaySfx(): boolean {
    return this.active && !this.muted && !this.scene.sound.locked;
  }
}
