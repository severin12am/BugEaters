/**
 * =============================================================================
 * InputPredictor — client-side prediction + server reconciliation.
 * =============================================================================
 *
 * PROBLEM: on mobile, waiting a full round-trip before the local runner reacts
 * to a lane tap feels laggy.
 *
 * SOLUTION (standard authoritative-netcode pattern):
 *   1. PREDICT: when the player inputs, apply it locally *immediately* using the
 *      same rules the server uses, and remember the input (with its seq).
 *   2. RECONCILE: when an authoritative snapshot arrives, snap the local runner
 *      to the server's confirmed state, then RE-APPLY any inputs the server has
 *      not acknowledged yet (seq > server.lastInputSeq). The result is a
 *      responsive local runner that never drifts from the server's truth.
 *
 * Only the LOCAL player is predicted. Remote players are interpolated instead
 * (see SnapshotInterpolator) because we have no authority to predict them.
 */
import { CLIENT_RACE_CONFIG, laneCenterX } from './clientRaceConfig.js';
import type { PlayerInput, PlayerSnapshotDto } from './protocol.js';

/** The locally-predicted state of the player's own runner. */
export interface PredictedSelf {
  lane: number;
  x: number;
  /** Race time (ms) until which the runner is airborne (predicted). */
  jumpUntilMs: number;
  died: boolean;
  finished: boolean;
}

export class InputPredictor {
  private predicted: PredictedSelf | null = null;
  /** Inputs applied locally but not yet acknowledged by the server. */
  private pending: PlayerInput[] = [];
  private nextSeq = 0;

  /** Allocates the next monotonic input sequence number. */
  allocateSeq(): number {
    return ++this.nextSeq;
  }

  /**
   * Records + immediately applies a locally-generated input. Returns false if
   * prediction has no base state yet (before first snapshot) — the input is
   * still safe to send to the server.
   */
  predict(input: PlayerInput, raceMs: number): boolean {
    if (!this.predicted || this.predicted.died || this.predicted.finished) {
      // Keep the seq in the pending queue so reconcile can replay after spawn.
      this.pending.push(input);
      return false;
    }
    this.pending.push(input);
    applyInput(this.predicted, input, raceMs);
    return true;
  }

  /**
   * Reconciles against an authoritative snapshot of the local player. Snaps to
   * the confirmed state, drops acknowledged inputs, and replays the rest.
   */
  reconcile(self: PlayerSnapshotDto, raceMs: number): void {
    // Confirmed base state from the server.
    this.predicted = {
      lane: self.lane,
      x: self.x,
      jumpUntilMs: self.jumpUntilMs,
      died: self.died,
      finished: self.finished,
    };
    // Drop inputs the server has already applied.
    this.pending = this.pending.filter((input) => input.seq > self.lastInputSeq);
    // Replay the still-unacknowledged inputs on top of the confirmed base.
    for (const input of this.pending) {
      applyInput(this.predicted, input, raceMs);
    }
  }

  /** The current predicted local state, or null before the first snapshot. */
  getPredicted(): PredictedSelf | null {
    return this.predicted;
  }

  reset(): void {
    this.predicted = null;
    this.pending = [];
    this.nextSeq = 0;
  }
}

/**
 * Applies one input to a predicted state using the SAME rules as the server's
 * movement system. Keep this in sync with server/src/domain/systems/movementSystem.ts.
 */
function applyInput(state: PredictedSelf, input: PlayerInput, raceMs: number): void {
  switch (input.type) {
    case 'move': {
      const delta = input.direction === 'left' ? -1 : 1;
      state.lane = Math.max(0, Math.min(CLIENT_RACE_CONFIG.laneCount - 1, state.lane + delta));
      state.x = laneCenterX(state.lane);
      break;
    }
    case 'jump':
      state.jumpUntilMs = raceMs + CLIENT_RACE_CONFIG.jumpDurationMs;
      break;
    case 'activate':
      // Ability *effects* are server-authoritative; nothing to predict locally.
      break;
  }
}
