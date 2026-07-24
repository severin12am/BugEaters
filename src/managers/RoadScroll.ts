import { TUNING } from '../config/tuning';
import { ux } from '../utils/constants';

/** Callback invoked each frame with downward world scroll in pixels (always full speed). */
export type RoadScrollListener = (deltaY: number) => void;

/**
 * World scroll (visual, full speed) vs player race progress (can be slower).
 * NPCs use world pace so they pull ahead when the player is debuffed.
 */
export class RoadScroll {
  /** Player race progress (finish line, % HUD). */
  distanceTraveled = 0;

  /** Full-speed distance — NPCs and visuals follow this. */
  worldDistanceTraveled = 0;

  /** 0 = trash block; (0,1] = debuff; >1 = dilemma / cooperate boost. */
  playerProgressMultiplier = 1;

  private readonly listeners = new Set<RoadScrollListener>();

  get worldSpeedPxPerSec(): number {
    return ux(TUNING.physics.scrollSpeed);
  }

  onScroll(listener: RoadScrollListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setPlayerProgressMultiplier(multiplier: number): void {
    // Allow stacked boosts (e.g. puddle × CBDC = 2.25).
    this.playerProgressMultiplier = Math.max(0, Math.min(4, multiplier));
  }

  resetPlayerProgressMultiplier(): void {
    this.playerProgressMultiplier = 1;
  }

  /** How far ahead the world has moved vs the player's race progress (px). */
  getAheadGapPx(): number {
    return Math.max(0, this.worldDistanceTraveled - this.distanceTraveled);
  }

  /**
   * @param progressMult — multiplier for this frame's race progress (pass from
   *   GameScene so the value used matches what was just computed).
   */
  step(deltaMs: number, progressMult?: number): number {
    const dt = deltaMs / 1000;
    const worldDelta = this.worldSpeedPxPerSec * dt;
    if (worldDelta <= 0) {
      return 0;
    }

    const mult = progressMult ?? this.playerProgressMultiplier;
    this.playerProgressMultiplier = Math.max(0, Math.min(4, mult));

    this.worldDistanceTraveled += worldDelta;
    this.distanceTraveled += worldDelta * this.playerProgressMultiplier;
    this.listeners.forEach((listener) => listener(worldDelta));
    return worldDelta;
  }

  /**
   * Authoritative-room variant: bind world motion to the shared server clock
   * instead of a device's frame rate. This prevents low-FPS/late clients from
   * generating a different seeded obstacle and divider timeline.
   */
  stepToWorldDistance(worldDistance: number, progressMult?: number): number {
    const target = Math.max(this.worldDistanceTraveled, worldDistance);
    const worldDelta = target - this.worldDistanceTraveled;
    if (worldDelta <= 0) {
      return 0;
    }
    const mult = progressMult ?? this.playerProgressMultiplier;
    this.playerProgressMultiplier = Math.max(0, Math.min(4, mult));
    this.worldDistanceTraveled = target;
    this.distanceTraveled += worldDelta * this.playerProgressMultiplier;
    this.listeners.forEach((listener) => listener(worldDelta));
    return worldDelta;
  }

  reset(): void {
    this.distanceTraveled = 0;
    this.worldDistanceTraveled = 0;
    this.playerProgressMultiplier = 1;
  }
}
