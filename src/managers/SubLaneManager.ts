import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { isMainBoundaryCrossing, MainDividerIndex } from './MainLaneDivider';
import { CharacterType, GAME_WIDTH, ux } from '../utils/constants';

/** Result of a horizontal lane-change attempt. */
export type LaneMoveResult = 'moved' | 'blocked' | 'death';

/** Sub-lanes per main lane (Bugs / Humans / Klaus). */
export const SUB_LANES_PER_MAIN = 3;

/** Main lane index: 0 = Bugs, 1 = Humans, 2 = Klaus. */
export const MAIN_LANE_COUNT = 3;

/** Global sub-lane index of the left death half-strip (Bugs only). */
export const LEFT_DEATH_GLOBAL = -1;

/** Global sub-lane index of the right death half-strip (Klaus only). */
export const RIGHT_DEATH_GLOBAL = 9;

/** Uniform width of every sub-lane in game coordinates. */
export function getSubLaneWidth(): number {
  return ux(TUNING.lanes.subLaneSpacing);
}

/** Width of one main lane (Bugs / Humans / Klaus) — always 3 sub-lanes. */
export function getMainLaneWidth(subLaneWidth = getSubLaneWidth()): number {
  return SUB_LANES_PER_MAIN * subLaneWidth;
}

/** Total world width: half-strip + 9 sub-lanes + half-strip. */
export function getWorldWidth(): number {
  return getSubLaneWidth() * 10;
}

/** Maps selected character to their main lane index. */
export function mainLaneFromCharacter(type: CharacterType): number {
  switch (type) {
    case CharacterType.Bug:
      return 0;
    case CharacterType.Human:
      return 1;
    case CharacterType.Klaus:
      return 2;
  }
}

/** Maps a global sub-lane index (0-8) to the character type that runs there. */
export function characterFromGlobalSubLane(globalSubLane: number): CharacterType {
  if (globalSubLane <= 2) {
    return CharacterType.Bug;
  }
  if (globalSubLane <= 5) {
    return CharacterType.Human;
  }
  return CharacterType.Klaus;
}

/** Maps server/ticket role string to CharacterType. */
export function characterFromRole(role: string | undefined | null): CharacterType | null {
  if (role === 'bug' || role === CharacterType.Bug) {
    return CharacterType.Bug;
  }
  if (role === 'klaus' || role === CharacterType.Klaus) {
    return CharacterType.Klaus;
  }
  if (role === 'human' || role === CharacterType.Human) {
    return CharacterType.Human;
  }
  return null;
}

export type DividerOpenCheck = (index: MainDividerIndex) => boolean;

/** Maps global sub-lane index (0–8) to world X center. */
export function subLaneCenterX(
  globalIndex: number,
  subLaneWidth = getSubLaneWidth(),
): number {
  const half = subLaneWidth / 2;
  return half + globalIndex * subLaneWidth + subLaneWidth / 2;
}

/** Middle sub-lane index inside a main lane (0 = Bugs, 1 = Humans, 2 = Klaus). */
export function getCenterGlobalSubLaneIndex(mainLane: number): number {
  return mainLane * SUB_LANES_PER_MAIN + 1;
}

/**
 * Manages sub-lane positions using a global index (0–8) so players can cross
 * main-lane boundaries when the divider is open.
 */
export class SubLaneManager {
  private readonly homeMainLane: number;
  private readonly subLaneWidth: number;
  private globalSubLaneIndex: number;
  /** Target X when tweening into an off-road death step. */
  private offRoadDeathX: number | null = null;

  constructor(characterType: CharacterType) {
    this.homeMainLane = mainLaneFromCharacter(characterType);
    this.subLaneWidth = getSubLaneWidth();
    this.globalSubLaneIndex = this.homeMainLane * SUB_LANES_PER_MAIN + 1;
  }

  /** Center X of a global sub-lane index (0–8). */
  getGlobalSubLaneCenterX(globalIndex: number): number {
    return subLaneCenterX(globalIndex, this.subLaneWidth);
  }

  getLeftDeathCenterX(): number {
    return this.subLaneWidth / 4;
  }

  getRightDeathCenterX(): number {
    return this.subLaneWidth * 9.75;
  }

  getCurrentX(): number {
    if (this.offRoadDeathX !== null) {
      return this.offRoadDeathX;
    }
    return subLaneCenterX(this.globalSubLaneIndex, this.subLaneWidth);
  }

  getViewportZoom(): number {
    const span = TUNING.lanes.onScreenLanesAcross * this.subLaneWidth;
    return GAME_WIDTH / span;
  }

  /**
   * Scroll X that keeps the player on screen.
   * Camera bounds extend past the road so the player never walks off-screen at edges.
   */
  getCameraScrollX(playerWorldX: number, playerHalfWidth = 0): number {
    const zoom = this.getViewportZoom();
    const viewWidth = GAME_WIDTH / zoom;
    const worldPad = (playerHalfWidth + ux(TUNING.lanes.cameraScreenPadding)) / zoom;

    let scrollX = playerWorldX - viewWidth / 2;
    scrollX = Math.min(scrollX, playerWorldX - worldPad);
    scrollX = Math.max(scrollX, playerWorldX + worldPad - viewWidth);
    return scrollX;
  }

  /** Extra horizontal room so the camera can follow the player past road edges. */
  getCameraBoundsPadding(): number {
    return GAME_WIDTH / this.getViewportZoom();
  }

  /** Sets the starting sub-lane (multiplayer roster slot from matchmaking). */
  setAssignedSubLane(globalSubLane: number): void {
    this.globalSubLaneIndex = Phaser.Math.Clamp(globalSubLane, 0, 8);
    this.offRoadDeathX = null;
  }

  /** True when the player has stepped into a deadly outer half-strip. */
  isPlayerOffRoad(playerX: number): boolean {
    const bounds = getDeathZoneBounds(this.subLaneWidth);
    return playerX <= bounds.left.end || playerX >= bounds.right.start;
  }

  /** Current main lane — follows an assigned role and crossings. */
  getMainLane(): number {
    return Math.floor(this.globalSubLaneIndex / 3);
  }

  getGlobalSubLaneIndex(): number {
    return this.globalSubLaneIndex;
  }

  moveLeft(isDividerOpen: DividerOpenCheck): LaneMoveResult {
    if (this.globalSubLaneIndex === 0) {
      this.offRoadDeathX = this.getLeftDeathCenterX();
      return 'death';
    }

    const boundary = isMainBoundaryCrossing(this.globalSubLaneIndex, 'left');
    if (boundary !== null) {
      if (!isDividerOpen(boundary)) {
        return 'blocked';
      }
      this.globalSubLaneIndex -= 1;
      return 'moved';
    }

    const localIndex = this.globalSubLaneIndex % SUB_LANES_PER_MAIN;
    if (localIndex > 0) {
      this.globalSubLaneIndex -= 1;
      return 'moved';
    }

    return 'blocked';
  }

  moveRight(isDividerOpen: DividerOpenCheck): LaneMoveResult {
    if (this.globalSubLaneIndex === 8) {
      this.offRoadDeathX = this.getRightDeathCenterX();
      return 'death';
    }

    const boundary = isMainBoundaryCrossing(this.globalSubLaneIndex, 'right');
    if (boundary !== null) {
      if (!isDividerOpen(boundary)) {
        return 'blocked';
      }
      this.globalSubLaneIndex += 1;
      return 'moved';
    }

    const localIndex = this.globalSubLaneIndex % SUB_LANES_PER_MAIN;
    if (localIndex < SUB_LANES_PER_MAIN - 1) {
      this.globalSubLaneIndex += 1;
      return 'moved';
    }

    return 'blocked';
  }

  /** Short nudge toward a blocked direction, then settle back on the current lane. */
  playLaneRepel(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Components.Transform,
    direction: 'left' | 'right',
  ): void {
    const cfg = TUNING.physics;
    const settleX = this.getCurrentX();
    const offset = ux(cfg.laneRepelPx) * (direction === 'right' ? 1 : -1);

    scene.tweens.killTweensOf(target);
    scene.tweens.add({
      targets: target,
      x: settleX + offset,
      duration: cfg.laneRepelMs,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => {
        target.x = settleX;
      },
    });
  }

  tweenToCurrentLane(
    scene: Phaser.Scene,
    target: Phaser.GameObjects.Components.Transform,
    durationMs = TUNING.physics.laneSwitchTweenMs,
  ): void {
    scene.tweens.add({
      targets: target,
      x: this.getCurrentX(),
      duration: durationMs,
      ease: 'Power2',
    });
  }
}

/** World X boundaries for the invisible off-road death zones (half-strip each side). */
export function getDeathZoneBounds(subLaneWidth: number): {
  left: { start: number; end: number };
  right: { start: number; end: number };
} {
  const half = subLaneWidth / 2;
  return {
    left: { start: 0, end: half },
    right: { start: half + 9 * subLaneWidth, end: 10 * subLaneWidth },
  };
}

export function getMainLaneDividerXs(subLaneWidth: number): number[] {
  const boundaries = getSubLaneBoundaryXs(subLaneWidth);
  return [boundaries[3], boundaries[6]];
}

export function getSubLaneBoundaryXs(subLaneWidth: number): number[] {
  const half = subLaneWidth / 2;
  const lines: number[] = [];
  for (let i = 0; i <= SUB_LANES_PER_MAIN * MAIN_LANE_COUNT; i++) {
    lines.push(half + i * subLaneWidth);
  }
  return lines;
}

export function getMainLaneCenterX(mainLane: number, subLaneWidth: number): number {
  const half = subLaneWidth / 2;
  const start = half + mainLane * SUB_LANES_PER_MAIN * subLaneWidth;
  return start + (SUB_LANES_PER_MAIN * subLaneWidth) / 2;
}
