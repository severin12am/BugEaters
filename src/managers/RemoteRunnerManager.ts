import Phaser from 'phaser';
import { RemotePlayer } from '../entities/RemotePlayer';
import { CharacterType, ux } from '../utils/constants';
import {
  characterFromGlobalSubLane,
  getSubLaneWidth,
  subLaneCenterX,
} from './SubLaneManager';
import { PRISONERS_DILEMMA_TUNING } from '../config/prisonersDilemma';
import type { Player } from '../entities/Player';
import { authRivalGapToScreenOffset, rivalProgressGapToScreenOffset } from '../utils/raceVisual';
import type { PlayerSnapshot } from '../net/types';

/** A remote runner exposed for eat-contact and dilemma checks. */
export interface RemoteEatTarget {
  userId: string;
  x: number;
  hitboxY: number;
  type: CharacterType;
  globalSubLane: number;
}

/**
 * Owns the real rival runners (one per remote player). Snapshots arrive from
 * the RoomSession broadcast; positions are interpolated and placed relative to
 * the local player's race distance (rivals ahead render higher on screen).
 */
export class RemoteRunnerManager {
  private readonly players = new Map<string, RemotePlayer>();
  private readonly subLaneWidth = getSubLaneWidth();
  /**
   * Authoritative mode uses a SYMMETRIC gap→offset mapping so both tabs render
   * the same distance between two runners. Solo/peer mode keeps the asymmetric
   * "rivals ahead climb, behind stay near" feel.
   */
  private symmetricGap = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly container: Phaser.GameObjects.Container,
    private readonly localUserId: string,
    private readonly groundY: number,
  ) {}

  handleSnapshot(incoming: PlayerSnapshot): void {
    if (!incoming?.userId || incoming.userId === this.localUserId) {
      return;
    }

    const existing = this.players.get(incoming.userId);
    if (existing?.getIsDead()) {
      return;
    }

    // Rebase onto the receiver's clock at arrival time so interpolation does
    // not depend on cross-client clock synchronization.
    const snapshot: PlayerSnapshot = { ...incoming, t: Date.now() };

    const type =
      snapshot.characterType ?? characterFromGlobalSubLane(snapshot.globalSubLane);

    let player = this.players.get(snapshot.userId);
    // Recreate if the first frame inferred the wrong species (lane vs role).
    if (player && player.characterType !== type) {
      player.destroy();
      this.players.delete(snapshot.userId);
      player = undefined;
    }
    if (!player) {
      const x = subLaneCenterX(snapshot.globalSubLane, this.subLaneWidth);
      player = new RemotePlayer(
        this.scene,
        x,
        this.groundY,
        type,
        snapshot.userId,
        snapshot.globalSubLane,
      );
      this.container.add(player);
      this.players.set(snapshot.userId, player);
    }
    player.pushSnapshot(snapshot);
  }

  /**
   * Interpolates and positions all rivals from **real race progress**.
   *
   * Each rival's broadcast `distance` is compared to the local player's
   * `distanceTraveled`. The signed gap drives vertical placement through
   * {@link rivalProgressGapToScreenOffset}: trash/puddle slowdown on either
   * side shows up as the other runner moving ahead on screen.
   *
   * @param renderTimeMs receiver-clock time to render at (now − interp delay)
   * @param localDistance local player's race progress (px)
   */
  update(renderTimeMs: number, localDistance: number): void {
    for (const player of this.players.values()) {
      if (player.getIsDead()) {
        continue;
      }
      const sample = player.sample(renderTimeMs);
      if (!sample) {
        continue;
      }
      if (!sample.alive) {
        player.die();
        player.hideAfterDeath();
        continue;
      }
      player.x = sample.x;
      const progressGap = sample.distance - localDistance;
      const offset = this.symmetricGap
        ? authRivalGapToScreenOffset(progressGap)
        : rivalProgressGapToScreenOffset(progressGap, this.groundY);
      player.y = this.groundY - offset - sample.height;
    }
  }

  /** Enables the symmetric gap mapping used by authoritative multiplayer. */
  setSymmetricGap(enabled: boolean): void {
    this.symmetricGap = enabled;
  }

  /**
   * Authoritative mode: place a rival DIRECTLY from a distance that was already
   * interpolated at the SAME render clock as the local player (see
   * SnapshotInterpolator). This is the key to consistent cross-screen distance —
   * we must NOT run a second, independent interpolation here (that was the bug:
   * self and rivals ended up sampled at different times, so the gap differed per
   * tab and a stuck rival never slid off screen).
   *
   * @param gap rival.distance − self.distance, both from one shared frame
   */
  placeRival(params: {
    userId: string;
    characterType: CharacterType;
    globalSubLane: number;
    x: number;
    height: number;
    gap: number;
    alive: boolean;
  }): void {
    if (params.userId === this.localUserId) {
      return;
    }
    let player = this.players.get(params.userId);
    if (player && player.characterType !== params.characterType) {
      player.destroy();
      this.players.delete(params.userId);
      player = undefined;
    }
    if (!player) {
      const x = subLaneCenterX(params.globalSubLane, this.subLaneWidth);
      player = new RemotePlayer(
        this.scene,
        x,
        this.groundY,
        params.characterType,
        params.userId,
        params.globalSubLane,
      );
      this.container.add(player);
      this.players.set(params.userId, player);
    }
    if (player.getIsDead()) {
      return;
    }
    if (!params.alive) {
      player.die();
      player.hideAfterDeath();
      return;
    }
    // ALWAYS place by sub-lane index with the same DPR-scaled centers as the
    // local runner. Server `x` is logical (subLaneWidth=40); using it raw on a
    // phone (DPR=2) parks every rival near the left — Bug + Human both look
    // like they spawned in Bugs' lane.
    player.x = subLaneCenterX(params.globalSubLane, this.subLaneWidth);
    // 1:1 faithful mapping (same scale as the world's obstacles): a rival who
    // pulls ahead climbs off the top; one who falls behind drops off the bottom.
    const offset = authRivalGapToScreenOffset(params.gap);
    player.y = this.groundY - offset - params.height;
  }

  getPlayer(userId: string): RemotePlayer | undefined {
    return this.players.get(userId);
  }

  /** Live rivals near the local player, for contested-eat detection. */
  getEatTargets(): RemoteEatTarget[] {
    const targets: RemoteEatTarget[] = [];
    for (const player of this.players.values()) {
      if (player.getIsDead() || !player.visible) {
        continue;
      }
      targets.push({
        userId: player.userId,
        x: player.x,
        hitboxY: player.getHitboxY(),
        type: player.characterType,
        globalSubLane: player.globalSubLane,
      });
    }
    return targets;
  }

  /** Same-species remote rival within dilemma range. */
  findSameTypeNearPlayer(player: Player): RemoteEatTarget | null {
    if (!player.isGroundedOnTrack() || player.getIsDead()) {
      return null;
    }

    const reach = ux(PRISONERS_DILEMMA_TUNING.proximityReach);
    const playerX = player.x;
    const playerY = player.getHitboxY();

    for (const target of this.getEatTargets()) {
      if (target.type !== player.characterType) {
        continue;
      }
      const dx = Math.abs(playerX - target.x);
      const dy = Math.abs(playerY - target.hitboxY);
      if (dx <= reach && dy <= reach) {
        return target;
      }
    }

    return null;
  }

  /** Applies an authoritative elimination to a rival. */
  eliminate(userId: string): void {
    const player = this.players.get(userId);
    if (player && !player.getIsDead()) {
      player.die();
      player.hideAfterDeath();
    }
  }

  /** Visible rivals for lighting/shadows. */
  getVisibleRunners(): { x: number; y: number; runner: RemotePlayer }[] {
    const list: { x: number; y: number; runner: RemotePlayer }[] = [];
    this.collectVisibleRunners((runner) => list.push({ x: runner.x, y: runner.y, runner }));
    return list;
  }

  /** Allocation-free variant of {@link getVisibleRunners} for the per-frame lighting pass. */
  collectVisibleRunners(visit: (runner: RemotePlayer) => void): void {
    for (const player of this.players.values()) {
      if (player.visible && !player.getIsDead()) {
        visit(player);
      }
    }
  }

  destroy(): void {
    this.players.forEach((player) => player.destroy());
    this.players.clear();
  }
}
