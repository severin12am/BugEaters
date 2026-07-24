import { TUNING } from '../config/tuning';
import type { ObstacleHandle } from '../managers/ObstacleManager';
import { ux } from './constants';

/** Horizontal overlap between runner and trash (world bounds, lane-tween safe). */
export function trashHorizontalOverlap(
  obs: ObstacleHandle,
  runnerX: number,
  runnerHalfWidth: number,
  padX = ux(TUNING.collision.trashPadX),
): boolean {
  if (obs.type !== 'trash' && obs.type !== 'passport') {
    return false;
  }

  // Prefer local x + displayWidth — getBounds can be flaky on container children.
  const halfW = Math.max(obs.sprite.displayWidth, ux(12)) * 0.5;
  const left = obs.sprite.x - halfW + padX;
  const right = obs.sprite.x + halfW - padX;
  return runnerX + runnerHalfWidth >= left && runnerX - runnerHalfWidth <= right;
}

function puddleHorizontalOverlap(
  obs: ObstacleHandle,
  runnerX: number,
  runnerHalfWidth: number,
): boolean {
  const padX = ux(TUNING.collision.puddlePadX);
  const bounds = obs.sprite.getBounds();
  return (
    runnerX + runnerHalfWidth >= bounds.left + padX &&
    runnerX - runnerHalfWidth <= bounds.right - padX
  );
}

/**
 * Trash bin blocks a runner — tight overlap (feet + body vs bounds) in the
 * runner's current sub-lane only.
 */
export function trashBlocksRunner(
  obs: ObstacleHandle,
  runnerX: number,
  runnerFeetY: number,
  runnerHalfWidth: number,
  playerGlobalLane: number,
): boolean {
  if (obs.type !== 'trash' || !obs.globalSubLanes.includes(playerGlobalLane)) {
    return false;
  }
  if (!trashHorizontalOverlap(obs, runnerX, runnerHalfWidth)) {
    return false;
  }

  const col = TUNING.collision;
  const sprite = obs.sprite;
  const bounds = sprite.getBounds();
  const padY = ux(col.trashPadY);
  const bodyTop = runnerFeetY - ux(col.playerHitboxUp);
  const trashFeetY = sprite.y;

  const verticalOverlap =
    runnerFeetY >= bounds.top + padY && bodyTop <= bounds.bottom - padY;
  const feetContact =
    Math.abs(trashFeetY - runnerFeetY) <= ux(col.puddleFeetSlop);

  return verticalOverlap && feetContact;
}

/**
 * Player auto-jumps a bin — must share the runner's sub-lane, overlap tightly,
 * and have the bin approaching within the ahead window (early trigger).
 *
 * `runnerKey` is the runner instance — each character jumps independently.
 */
export function trashJumpContact(
  obs: ObstacleHandle,
  runnerX: number,
  runnerFeetY: number,
  runnerHalfWidth: number,
  playerGlobalLane: number,
  runnerKey?: object,
): boolean {
  if (obs.type !== 'trash' && obs.type !== 'passport') {
    return false;
  }
  if (runnerKey && obs.jumpClearedBy?.has(runnerKey)) {
    return false;
  }
  if (!obs.globalSubLanes.includes(playerGlobalLane)) {
    return false;
  }

  const padX = ux(TUNING.collision.trashJumpPadX);
  if (!trashHorizontalOverlap(obs, runnerX, runnerHalfWidth, padX)) {
    return false;
  }

  const obsCfg = TUNING.obstacles;
  const trashFeetY = obs.sprite.y;
  const ahead = ux(obsCfg.trashJumpTriggerAheadPx);
  const behind = ux(obsCfg.trashJumpTriggerBehindPx);
  const deltaY = trashFeetY - runnerFeetY;

  return deltaY >= -ahead && deltaY <= behind;
}

/** Mark that this runner has already hopped this obstacle. */
export function markTrashJumpCleared(obs: ObstacleHandle, runnerKey: object): void {
  if (!obs.jumpClearedBy) {
    obs.jumpClearedBy = new WeakSet<object>();
  }
  obs.jumpClearedBy.add(runnerKey);
}

/** @deprecated Use trashJumpContact for the player; kept for NPC brush checks. */
export function trashPickupContact(
  obs: ObstacleHandle,
  runnerX: number,
  runnerFeetY: number,
  runnerHalfWidth: number,
  playerGlobalLane: number,
): boolean {
  return trashJumpContact(obs, runnerX, runnerFeetY, runnerHalfWidth, playerGlobalLane);
}

/** @deprecated Use trashJumpContact for the player; kept for NPC brush checks. */
export function trashContactsRunner(
  obs: ObstacleHandle,
  runnerX: number,
  runnerFeetY: number,
  runnerHalfWidth: number,
  playerGlobalLane: number,
): boolean {
  return trashJumpContact(obs, runnerX, runnerFeetY, runnerHalfWidth, playerGlobalLane);
}

/** Ability briefcase pickup — same feet alignment as puddles (Unity OnTriggerEnter2D). */
export function abilityContact(
  obs: ObstacleHandle,
  runnerX: number,
  runnerFeetY: number,
  runnerHalfWidth: number,
  playerGlobalLane: number,
): boolean {
  if (obs.type !== 'ability' || obs.passed || !obs.globalSubLanes.includes(playerGlobalLane)) {
    return false;
  }
  if (!puddleHorizontalOverlap(obs, runnerX, runnerHalfWidth)) {
    return false;
  }

  const feetSlop = ux(TUNING.collision.puddleFeetSlop);
  const abilityFeetY = obs.sprite.y;
  return Math.abs(runnerFeetY - abilityFeetY) <= feetSlop;
}

/** @deprecated Use abilityContact */
export const briefcaseContact = abilityContact;

/**
 * Open manhole death. Sprite origin is the hole center, so sprite.x/y is the
 * danger point; lid rotates around it. Closed manholes have no opening.
 *
 * `runnerFeetY` must be the on-screen feet Y (solo race-lag offset included).
 * Optional `prevHoleY` enables a swept test so fast scroll can't skip the hole.
 * `runnerKey` — per-runner so one fall doesn't make the hole safe for others.
 */
export function manholeContact(
  obs: ObstacleHandle,
  runnerX: number,
  runnerFeetY: number,
  runnerHalfWidth = 0,
  playerGlobalLane?: number,
  prevHoleY?: number,
  runnerKey?: object,
): boolean {
  if (
    obs.type !== 'manhole' ||
    obs.manholeState !== 'open' ||
    obs.manholeOpening == null
  ) {
    return false;
  }
  if (runnerKey && obs.manholeFellInBy?.has(runnerKey)) {
    return false;
  }
  // Legacy single-shot (abilities etc.) — ignore when per-runner tracking is used.
  if (obs.passed && !runnerKey) {
    return false;
  }
  if (
    playerGlobalLane !== undefined &&
    !obs.globalSubLanes.includes(playerGlobalLane)
  ) {
    return false;
  }

  const hole = obs.manholeOpening;
  const dx = runnerX - obs.sprite.x;
  // Tight horizontally; hole radius only (+ small foot pad).
  const radius = hole.radiusX + Math.min(runnerHalfWidth * 0.35, ux(6));
  if (Math.abs(dx) > radius) {
    return false;
  }

  const holeY = obs.sprite.y;
  const dy = runnerFeetY - holeY;
  if (dy * dy <= radius * radius - dx * dx) {
    return true;
  }

  // Swept vertical: hole scrolled past the feet between frames.
  if (prevHoleY !== undefined && prevHoleY !== holeY) {
    const minY = Math.min(prevHoleY, holeY);
    const maxY = Math.max(prevHoleY, holeY);
    const band = Math.sqrt(Math.max(0, radius * radius - dx * dx));
    return runnerFeetY >= minY - band && runnerFeetY <= maxY + band;
  }

  return false;
}

/** Mark that this runner already fell in (or resolved) this manhole. */
export function markManholeFellIn(obs: ObstacleHandle, runnerKey: object): void {
  if (!obs.manholeFellInBy) {
    obs.manholeFellInBy = new WeakSet<object>();
  }
  obs.manholeFellInBy.add(runnerKey);
}

/** Ground-hugging puddle contact — feet must align with the puddle sprite. */
export function puddleContact(
  obs: ObstacleHandle,
  runnerX: number,
  runnerFeetY: number,
  runnerHalfWidth: number,
  playerGlobalLane: number,
): boolean {
  if (obs.type !== 'puddle' || !obs.globalSubLanes.includes(playerGlobalLane)) {
    return false;
  }
  if (!puddleHorizontalOverlap(obs, runnerX, runnerHalfWidth)) {
    return false;
  }

  const feetSlop = ux(TUNING.collision.puddleFeetSlop);
  const puddleFeetY = obs.sprite.y;
  return Math.abs(runnerFeetY - puddleFeetY) <= feetSlop;
}

/** Player overlaps an obstacle using world bounds (handles rotation & wide props). */
export function obstacleOverlapsPlayer(
  obs: ObstacleHandle,
  playerX: number,
  playerY: number,
  playerGlobalLane: number,
  groundY: number,
  runnerHalfWidth: number,
): boolean {
  if (!obs.globalSubLanes.includes(playerGlobalLane)) {
    return false;
  }

  const col = TUNING.collision;
  if (playerY <= groundY - ux(col.jumpClearance)) {
    return false;
  }

  const feetY = playerY;

  if (obs.type === 'trash') {
    return trashBlocksRunner(obs, playerX, feetY, runnerHalfWidth, playerGlobalLane);
  }

  if (obs.type === 'puddle') {
    return puddleContact(obs, playerX, feetY, runnerHalfWidth, playerGlobalLane);
  }

  if (obs.type === 'manhole') {
    return false;
  }

  const sprite = obs.sprite;
  const bounds = sprite.getBounds();
  const padX = ux(col.obstaclePadX);
  const padY = ux(col.obstaclePadY);
  const bodyTop = playerY - ux(col.playerHitboxUp);
  const horizontalHit =
    playerX + runnerHalfWidth >= bounds.left + padX &&
    playerX - runnerHalfWidth <= bounds.right - padX;
  const verticalHit =
    feetY >= bounds.top + padY && bodyTop <= bounds.bottom - padY;
  return horizontalHit && verticalHit;
}
