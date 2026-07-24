import { getWorldWidth, subLaneCenterX } from '../managers/SubLaneManager';
import { TUNING } from '../config/tuning';
import { ux } from './constants';

/** Full scrollable strip: shoulders + camera padding (no visible edge into the abyss). */
export function getWorldSurfaceWidth(worldWidth: number, cameraPad: number): number {
  return worldWidth + cameraPad * 2;
}

/** Playable road spans global sub-lanes 0–8. */
export function getRoadBounds(subLaneWidth: number): {
  left: number;
  right: number;
  width: number;
  centerX: number;
} {
  const left = subLaneCenterX(0, subLaneWidth) - subLaneWidth / 2;
  const right = subLaneCenterX(8, subLaneWidth) + subLaneWidth / 2;
  return {
    left,
    right,
    width: right - left,
    centerX: (left + right) / 2,
  };
}

/** Side strips outside the playable road (death-lane shoulders). */
export function getShoulderCenters(
  subLaneWidth: number,
  worldWidth = getWorldWidth(),
): { leftX: number; rightX: number } {
  const outset = ux(TUNING.lamps.shoulderOutset);
  return {
    leftX: subLaneWidth / 2 - outset,
    rightX: worldWidth - subLaneWidth / 2 + outset,
  };
}
