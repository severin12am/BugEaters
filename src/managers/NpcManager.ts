import Phaser from 'phaser';
import { getNpcSpawnSlotsForRace, type NpcSpawnSlot } from '../config/raceRoster';
import { LaneNpc } from '../entities/LaneNpc';
import { Player } from '../entities/Player';
import { TUNING } from '../config/tuning';
import { subLaneCenterX, getSubLaneWidth } from './SubLaneManager';
import { CharacterType, ux } from '../utils/constants';
import { canEat } from '../utils/eatingRules';
import { PRISONERS_DILEMMA_TUNING } from '../config/prisonersDilemma';
import { raceLagToVisualOffset, rivalProgressGapToScreenOffset } from '../utils/raceVisual';
import type { ObstacleManager } from './ObstacleManager';
import { getCharacterDisplaySize } from '../utils/characterSprites';
import {
  manholeContact,
  markManholeFellIn,
  obstacleOverlapsPlayer,
  puddleContact,
  trashContactsRunner,
  markTrashJumpCleared,
  trashJumpContact,
} from '../utils/obstacleCollision';

export type EatingOutcome =
  | { kind: 'player-died' }
  | { kind: 'npc-died'; globalSubLane: number }
  | null;

/** Options for {@link NpcManager} — solo vs multiplayer behaviour. */
export interface NpcManagerOptions {
  /**
   * When true, eaten bots stay dead for the rest of the race and
   * {@link onNpcEliminated} is invoked so GameScene can broadcast `npc:eat`.
   */
  multiplayer?: boolean;
  /** Called after a bot is permanently removed (local eat or dilemma kill). */
  onNpcEliminated?: (globalSubLane: number) => void;
  /** Dev lab — spawn exactly one filler bot instead of the full roster. */
  labNpc?: NpcSpawnSlot;
  /** Dev lab — start the lab bot this far along race progress (px ahead). */
  labNpcInitialRaceDistance?: number;
}

/** Per-NPC race progress + obstacle state (mirrors player logic). */
interface NpcRaceState {
  raceDistance: number;
  wasOnPuddle: boolean;
  puddleSlideEndMs: number;
  wasOnTrash: boolean;
  trashBrushEndMs: number;
}

interface NpcAlignTween {
  fromY: number;
  toY: number;
  startMs: number;
  durationMs: number;
}

export interface NpcEntry {
  type: CharacterType;
  runner: LaneNpc;
  globalSubLane: number;
  /** True when a real remote player took this slot — NPC stays hidden. */
  excluded?: boolean;
  race: NpcRaceState;
}

/**
 * Spawns the race roster (3 bugs, 2 humans, 1 klaus minus the player) and resolves eating.
 */
export class NpcManager {
  private readonly npcs: NpcEntry[] = [];
  private readonly alignTweens = new Map<NpcEntry, NpcAlignTween>();
  private readonly eliminatedSlots = new Set<number>();
  private readonly multiplayer: boolean;
  private readonly onNpcEliminated?: (globalSubLane: number) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
    _playerType: CharacterType,
    groundY: number,
    /** Sub-lanes taken by real players (local + remote) — bots fill the rest. */
    occupiedRealPlayerSlots: number[] = [],
    options: NpcManagerOptions = {},
  ) {
    this.multiplayer = options.multiplayer ?? false;
    this.onNpcEliminated = options.onNpcEliminated;
    const subLaneWidth = getSubLaneWidth();

    const slots = options.labNpc
      ? [options.labNpc]
      : getNpcSpawnSlotsForRace(occupiedRealPlayerSlots);

    for (const slot of slots) {
      const x = subLaneCenterX(slot.globalSubLane, subLaneWidth);
      const runner = new LaneNpc(this.scene, x, groundY, slot.type);
      this.container.add(runner);
      this.npcs.push({
        type: slot.type,
        runner,
        globalSubLane: slot.globalSubLane,
        race: createNpcRaceState(),
      });
    }

    if (options.labNpcInitialRaceDistance !== undefined && this.npcs[0]) {
      this.npcs[0].race.raceDistance = options.labNpcInitialRaceDistance;
    }
  }

  getNpcCount(): number {
    return this.npcs.length;
  }

  /**
   * Hides the filler NPC in a slot now occupied by a real remote player.
   * The NPC stays hidden (and is skipped by all interactions) for the race.
   */
  excludeSlot(globalSubLane: number): void {
    for (const npc of this.npcs) {
      if (npc.globalSubLane === globalSubLane && !npc.excluded) {
        npc.excluded = true;
        npc.runner.hideAfterDeath();
      }
    }
  }

  /** Active NPCs for obstacle / dilemma checks. */
  /** Same-species NPC within dilemma range (for Prisoner's Dilemma). */
  findSameTypeNearPlayer(player: Player): NpcEntry | null {
    if (!player.isGroundedOnTrack() || player.getIsDead()) {
      return null;
    }

    const reach = ux(PRISONERS_DILEMMA_TUNING.proximityReach);
    const playerX = player.x;
    const playerY = player.getHitboxY();

    for (const npc of this.npcs) {
      if (npc.excluded || npc.type !== player.characterType || npc.runner.getIsDead() || !npc.runner.visible) {
        continue;
      }

      const dx = Math.abs(playerX - npc.runner.x);
      const dy = Math.abs(playerY - npc.runner.getHitboxY());
      if (dx <= reach && dy <= reach) {
        return npc;
      }
    }

    return null;
  }

  /** All visible runners for lighting / shadows. */
  getVisibleRunners(): { x: number; y: number; runner: LaneNpc }[] {
    const list: { x: number; y: number; runner: LaneNpc }[] = [];
    for (const npc of this.npcs) {
      if (npc.excluded || !npc.runner.visible || npc.runner.getIsDead()) {
        continue;
      }
      list.push({ x: npc.runner.x, y: npc.runner.y, runner: npc.runner });
    }
    return list;
  }

  eliminateNpc(npc: NpcEntry): void {
    this.killNpc(npc, { broadcast: true });
  }

  /**
   * Applies a peer's `npc:eat` broadcast — hides the bot without re-broadcasting.
   * Idempotent: safe if the slot was already cleared locally.
   */
  applyRemoteNpcEat(globalSubLane: number): void {
    const npc = this.findNpcBySlot(globalSubLane);
    if (npc) {
      this.killNpc(npc, { broadcast: false });
    }
  }

  private findNpcBySlot(globalSubLane: number): NpcEntry | undefined {
    return this.npcs.find((npc) => npc.globalSubLane === globalSubLane);
  }

  /**
   * Removes a bot from the race for the rest of the run.
   * Multiplayer optionally notifies GameScene to broadcast the eat to peers.
   */
  private killNpc(
    npc: NpcEntry,
    options: { broadcast: boolean; blood?: boolean },
  ): void {
    if (npc.excluded || npc.runner.getIsDead() || this.eliminatedSlots.has(npc.globalSubLane)) {
      return;
    }

    this.eliminatedSlots.add(npc.globalSubLane);
    npc.runner.die({ blood: options.blood !== false });
    npc.runner.hideAfterDeath();

    if (this.multiplayer && options.broadcast) {
      this.onNpcEliminated?.(npc.globalSubLane);
    }
  }

  getActiveRunners(): { x: number; y: number; globalSubLane: number }[] {
    return this.npcs
      .filter((n) => n.runner.visible && !n.runner.getIsDead())
      .map((n) => ({
        x: n.runner.x,
        y: n.runner.y,
        globalSubLane: n.globalSubLane,
      }));
  }

  /**
   * Advances each NPC's race distance using the same trash/puddle/manhole rules
   * as the player (no trash-pin). Visual position then reflects their own lag vs
   * world scroll — puddles and trash visibly slow them too.
   */
  stepWorldProgress(
    worldDelta: number,
    groundY: number,
    nowMs: number,
    obstacleManager: ObstacleManager,
    npcSlowActive = false,
  ): void {
    if (worldDelta <= 0) {
      return;
    }

    const cfg = TUNING.obstacles;
    const obstacles = obstacleManager.getAll();

    for (const npc of this.npcs) {
      if (npc.excluded || npc.runner.getIsDead() || !npc.runner.visible) {
        continue;
      }

      const runnerHalfW = getCharacterDisplaySize(npc.type).width / 2;
      const feetY = groundY;
      let onPuddle = false;
      let blockingTrash = false;
      let fellInManhole = false;

      for (const obs of obstacles) {
        if (obs.type === 'trash' || obs.type === 'passport') {
          if (
            trashJumpContact(
              obs,
              npc.runner.x,
              feetY,
              runnerHalfW,
              npc.globalSubLane,
              npc.runner,
            )
          ) {
            markTrashJumpCleared(obs, npc.runner);
            npc.runner.autoJumpOverObstacle();
          } else if (
            obs.type === 'trash' &&
            trashContactsRunner(
              obs,
              npc.runner.x,
              feetY,
              runnerHalfW,
              npc.globalSubLane,
            )
          ) {
            blockingTrash = true;
          }
          continue;
        }

        if (obs.type === 'ability') {
          continue;
        }

        if (obs.type === 'puddle') {
          if (puddleContact(obs, npc.runner.x, feetY, runnerHalfW, npc.globalSubLane)) {
            onPuddle = true;
          }
          continue;
        }

        if (obs.type === 'manhole') {
          if (
            obs.manholeState === 'open' &&
            manholeContact(
              obs,
              npc.runner.x,
              feetY,
              runnerHalfW,
              npc.globalSubLane,
              obs.prevY,
              npc.runner,
            )
          ) {
            markManholeFellIn(obs, npc.runner);
            this.killNpc(npc, { broadcast: true, blood: false });
            fellInManhole = true;
            break;
          }
          continue;
        }

        if (
          !obstacleOverlapsPlayer(
            obs,
            npc.runner.x,
            feetY,
            npc.globalSubLane,
            groundY,
            runnerHalfW,
          )
        ) {
          continue;
        }
      }

      if (fellInManhole) {
        continue;
      }

      if (npc.race.wasOnTrash && !blockingTrash) {
        npc.race.trashBrushEndMs = nowMs + cfg.trashNpcBrushDurationMs;
      }
      npc.race.wasOnTrash = blockingTrash;

      if (onPuddle && !npc.race.wasOnPuddle) {
        npc.race.puddleSlideEndMs = nowMs + cfg.puddleSlideDurationSec * 1000;
        npc.runner.setPuddleSlideVisual(true);
      }
      if (nowMs >= npc.race.puddleSlideEndMs) {
        npc.runner.setPuddleSlideVisual(false);
      }
      npc.race.wasOnPuddle = onPuddle;

      const trashBrushActive =
        !blockingTrash && nowMs < npc.race.trashBrushEndMs;
      const puddleSlideActive = nowMs < npc.race.puddleSlideEndMs;
      let progressMult = 1;
      if (blockingTrash) {
        progressMult = cfg.trashNpcBrushMultiplier;
      } else if (trashBrushActive) {
        progressMult = cfg.trashNpcBrushMultiplier;
      } else if (puddleSlideActive) {
        progressMult = cfg.puddleSlideBoostMultiplier;
      } else if (npcSlowActive) {
        progressMult = TUNING.abilities.npcSlowProgressMultiplier;
      }

      // Shared speed / slow indicators — same look for every cause.
      npc.runner.setSpeedStreakVisual(progressMult > 1);
      npc.runner.setSlowStreakVisual(progressMult < 1);

      if (!this.alignTweens.has(npc)) {
        npc.race.raceDistance += worldDelta * progressMult;
      }
      if (npcSlowActive) {
        npc.runner.setSlowdownVisual(true);
      } else if (!blockingTrash) {
        npc.runner.setSlowdownVisual(false);
      }
      npc.runner.setTrashStruggleVisual(blockingTrash);
    }
  }

  /** Smooth GREAT RESET — lock rivals to your race row, ease Y onto the anchor line. */
  tickAlignTweens(nowMs: number, liveRaceDistance?: number, anchorY?: number): void {
    for (const [npc, tween] of this.alignTweens) {
      if (liveRaceDistance !== undefined) {
        npc.race.raceDistance = liveRaceDistance;
      }

      const t = Phaser.Math.Clamp((nowMs - tween.startMs) / tween.durationMs, 0, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const targetY = anchorY ?? tween.toY;
      npc.runner.y = Phaser.Math.Linear(tween.fromY, targetY, eased);
      if (t >= 1) {
        npc.runner.y = targetY;
        this.alignTweens.delete(npc);
      }
    }
  }

  /**
   * Positions filler bots on screen.
   *
   * Solo: each NPC vs world scroll (small capped lag — debuff feedback).
   * Multiplayer: each NPC vs **local race progress** (same band as real rivals)
   * so trash/puddle hits read as the pack pulling away from you.
   *
   * @param localRaceDistance when set (multiplayer), anchor rivals to the local player
   */
  applyAheadVisual(
    groundY: number,
    worldDistanceTraveled: number,
    localRaceDistance?: number,
  ): void {
    for (const npc of this.npcs) {
      if (npc.excluded || !npc.runner.visible || npc.runner.getIsDead()) {
        continue;
      }
      // Don't stomp the hop tween mid-jump.
      if (npc.runner.isObstacleJumpActive()) {
        continue;
      }

      if (localRaceDistance !== undefined) {
        if (this.alignTweens.has(npc)) {
          continue;
        }
        const progressGap = npc.race.raceDistance - localRaceDistance;
        const offset = rivalProgressGapToScreenOffset(progressGap, groundY);
        npc.runner.y = groundY - offset;
        continue;
      }

      const aheadGapPx = Math.max(0, worldDistanceTraveled - npc.race.raceDistance);
      const offset = raceLagToVisualOffset(aheadGapPx);
      npc.runner.y = aheadGapPx <= 0 ? groundY : groundY - offset;
    }
  }

  /**
   * Unity `posAligment` — snap rivals to your race progress and ease them onto your row.
   */
  alignRivalsToPlayer(targetRaceDistance: number, anchorY: number, nowMs: number): void {
    for (const npc of this.npcs) {
      if (npc.excluded || npc.runner.getIsDead() || !npc.runner.visible) {
        continue;
      }
      npc.race.raceDistance = targetRaceDistance;
      this.alignTweens.set(npc, {
        fromY: npc.runner.y,
        toY: anchorY,
        startMs: nowMs,
        durationMs: 1000,
      });
    }
  }

  /**
   * BLACKROCK — any runner overlapping the player dies (food chain ignored).
   * Deferred a frame so multiple touches in one update don't deadlock tweens.
   */
  touchKillNearPlayer(player: Player): void {
    const cfg = TUNING.eating;
    const playerX = player.x;
    const playerY = player.getHitboxY();
    const reachX = ux(cfg.horizontalReach);
    const reachY = ux(cfg.verticalReach);

    for (const npc of this.npcs) {
      if (npc.excluded || npc.runner.getIsDead() || !npc.runner.visible) {
        continue;
      }
      const dx = Math.abs(playerX - npc.runner.x);
      const dy = Math.abs(playerY - npc.runner.getHitboxY());
      if (dx > reachX || dy > reachY) {
        continue;
      }
      const target = npc;
      this.scene.time.delayedCall(0, () => {
        if (!target.runner.getIsDead()) {
          this.eliminateNpc(target);
        }
      });
    }
  }

  /** Syringe hit — any runner in range dies (deferred to next frame to avoid tween deadlock). */
  trySyringeHit(projectileX: number, projectileY: number): boolean {
    const reachX = ux(44);
    const reachY = ux(52);

    for (const npc of this.npcs) {
      if (npc.excluded || npc.runner.getIsDead() || !npc.runner.visible) {
        continue;
      }
      const dx = Math.abs(projectileX - npc.runner.x);
      const dy = Math.abs(projectileY - npc.runner.getHitboxY());
      if (dx <= reachX && dy <= reachY) {
        const target = npc;
        this.scene.time.delayedCall(0, () => {
          if (!target.runner.getIsDead()) {
            this.eliminateNpc(target);
          }
        });
        return true;
      }
    }
    return false;
  }

  /** TAXATION — purple tint + slower walk on rivals. */
  setSlowVisualActive(active: boolean): void {
    for (const npc of this.npcs) {
      if (npc.excluded || npc.runner.getIsDead() || !npc.runner.visible) {
        continue;
      }
      npc.runner.setSlowdownVisual(active);
    }
  }

  /** Unity `enableID` — passport barriers handled by ObstacleManager. */
  setIdRevealActive(_active: boolean): void {
    // Passports replace floating ID badges.
  }

  checkEating(player: Player, playerImmortal = false): EatingOutcome {
    if (player.getIsDead()) {
      return null;
    }

    const cfg = TUNING.eating;
    const playerX = player.x;
    const playerY = player.getHitboxY();

    if (cfg.requireGrounded && !player.isGroundedOnTrack()) {
      return null;
    }

    for (const npc of this.npcs) {
      if (npc.excluded || npc.runner.getIsDead() || !npc.runner.visible) {
        continue;
      }

      const dx = Math.abs(playerX - npc.runner.x);
      const dy = Math.abs(playerY - npc.runner.getHitboxY());
      if (dx > ux(cfg.horizontalReach) || dy > ux(cfg.verticalReach)) {
        continue;
      }

      if (canEat(player.characterType, npc.type)) {
        this.killNpc(npc, { broadcast: true });
        return { kind: 'npc-died', globalSubLane: npc.globalSubLane };
      }

      if (canEat(npc.type, player.characterType)) {
        if (playerImmortal) {
          continue;
        }
        return { kind: 'player-died' };
      }
    }

    return null;
  }

  destroy(): void {
    this.npcs.forEach(({ runner }) => runner.destroy());
    this.npcs.length = 0;
  }
}

function createNpcRaceState(): NpcRaceState {
  return {
    raceDistance: 0,
    wasOnPuddle: false,
    puddleSlideEndMs: 0,
    wasOnTrash: false,
    trashBrushEndMs: 0,
  };
}
