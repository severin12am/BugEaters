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
  private lastPhraseKey: string | null = null;
  private lampSound: SoundVoice | null = null;
  private readonly stepVoices = new Map<string, SoundVoice[]>();
  private stepVoiceCursor = 0;
  private stepVolume: number = TUNING.audio.steps.volume;
  private active = false;
  private muted = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.scene.sound.pauseOnBlur = false;
  }

  /** Starts phrase scheduling and prepares the lamp loop. */
  startRace(): void {
    this.active = true;
    this.phraseTimerMs = this.nextPhraseDelayMs(TUNING.audio.phrases.firstDelaySec);
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
   * Footstep one-shots synced to the walk animation.
   *
   * The Bug walk cycle is 96 fps, so trigger frames can be skipped in a 60 fps
   * game loop — `RunnerCharacter.tickFootsteps` accounts for that. Voices rotate
   * through a small pool because a new `sound.play(key)` per step would allocate
   * an audio graph 19 times a second.
   */
  playFootstep(character: CharacterType, volumeScale = 1): void {
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
      volume: this.stepVolume * volumeScale,
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
    this.phraseTimerMs = this.nextPhraseDelayMs();
  }

  private nextPhraseDelayMs(minSec = TUNING.audio.phrases.intervalMinSec): number {
    const maxSec = Math.max(minSec, TUNING.audio.phrases.intervalMaxSec);
    return Phaser.Math.FloatBetween(minSec, maxSec) * 1000;
  }

  private playRandomPhrase(): void {
    const loaded = PHRASE_AUDIO_KEYS.filter((key) => this.scene.cache.audio.exists(key));
    if (loaded.length === 0) {
      return;
    }

    const pool = loaded.filter((key) => key !== this.lastPhraseKey);
    const key = Phaser.Utils.Array.GetRandom(pool.length > 0 ? pool : loaded);
    this.lastPhraseKey = key;
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
