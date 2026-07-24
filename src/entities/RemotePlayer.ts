import Phaser from 'phaser';
import { CharacterType } from '../utils/constants';
import { RunnerCharacter } from './RunnerCharacter';
import type { PlayerSnapshot } from '../net/types';

interface BufferedSnapshot {
  t: number;
  x: number;
  height: number;
  distance: number;
  alive: boolean;
}

/** Interpolated sample at a given render time. */
export interface RemoteSample {
  x: number;
  height: number;
  distance: number;
  alive: boolean;
}

/**
 * A rival driven by network snapshots. Buffers incoming state and renders it
 * slightly in the past so motion stays smooth despite jitter. Authoritative
 * events (eliminations) are applied via {@link die}.
 */
export class RemotePlayer extends RunnerCharacter {
  readonly userId: string;
  readonly globalSubLane: number;
  private readonly buffer: BufferedSnapshot[] = [];
  private latestDistance = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    groundY: number,
    characterType: CharacterType,
    userId: string,
    globalSubLane: number,
  ) {
    super(scene, x, groundY, characterType);
    this.userId = userId;
    this.globalSubLane = globalSubLane;
  }

  pushSnapshot(snapshot: PlayerSnapshot): void {
    if (this.getIsDead()) {
      return;
    }
    if (!snapshot.alive) {
      this.die();
      this.hideAfterDeath();
      return;
    }

    // Ignore out-of-order/stale packets.
    const last = this.buffer[this.buffer.length - 1];
    if (last && snapshot.t <= last.t) {
      return;
    }
    this.buffer.push({
      t: snapshot.t,
      x: snapshot.x,
      height: snapshot.height,
      distance: snapshot.distance,
      alive: snapshot.alive,
    });
    this.latestDistance = snapshot.distance;

    // Keep ~1s of history.
    const cutoff = snapshot.t - 1000;
    while (this.buffer.length > 2 && this.buffer[0].t < cutoff) {
      this.buffer.shift();
    }
  }

  getLatestDistance(): number {
    return this.latestDistance;
  }

  /** Interpolates buffered state at the given render time (ms, sender clock). */
  sample(renderTimeMs: number): RemoteSample | null {
    if (this.buffer.length === 0) {
      return null;
    }
    if (this.buffer.length === 1 || renderTimeMs <= this.buffer[0].t) {
      const s = this.buffer[0];
      return { x: s.x, height: s.height, distance: s.distance, alive: s.alive };
    }

    const last = this.buffer[this.buffer.length - 1];
    if (renderTimeMs >= last.t) {
      return { x: last.x, height: last.height, distance: last.distance, alive: last.alive };
    }

    for (let i = 0; i < this.buffer.length - 1; i++) {
      const a = this.buffer[i];
      const b = this.buffer[i + 1];
      if (renderTimeMs >= a.t && renderTimeMs <= b.t) {
        const span = b.t - a.t;
        const f = span > 0 ? (renderTimeMs - a.t) / span : 0;
        return {
          x: Phaser.Math.Linear(a.x, b.x, f),
          height: Phaser.Math.Linear(a.height, b.height, f),
          distance: Phaser.Math.Linear(a.distance, b.distance, f),
          alive: b.alive,
        };
      }
    }

    return { x: last.x, height: last.height, distance: last.distance, alive: last.alive };
  }

  /** Hide the rival after an authoritative death so they don't keep running. */
  hideAfterDeath(): void {
    this.scene.time.delayedCall(600, () => {
      if (this.getIsDead()) {
        this.setVisible(false);
        this.setActive(false);
      }
    });
  }
}
