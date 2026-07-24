import Phaser from 'phaser';
import { LIGHTING_TUNING } from '../config/lighting';

export interface LampPoint {
  x: number;
  y: number;
  /** Optional pool diameter multiplier (flashlight uses ~2×). */
  poolScale?: number;
  /** Optional alpha multiplier on the ADD pool. */
  alphaScale?: number;
}

export interface LampLightSample {
  brightness: number;
  nearest: LampPoint | null;
}

/** Shared lamp falloff — used for pools, visibility, and cast shadows. */
export function sampleLampLight(
  x: number,
  feetY: number,
  lamps: readonly LampPoint[],
  radius: number,
): LampLightSample {
  let brightness = 0;
  let nearest: LampPoint | null = null;
  let nearestDist = Infinity;

  for (const lamp of lamps) {
    const dx = x - lamp.x;
    const dy = feetY - lamp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = lamp;
    }
    const t = 1 - Phaser.Math.Clamp(dist / radius, 0, 1);
    const soft = t * t * (3 - 2 * t);
    const falloff = Math.pow(soft, LIGHTING_TUNING.poolFalloffExponent);
    brightness = Math.max(brightness, falloff);
  }

  return { brightness, nearest };
}
