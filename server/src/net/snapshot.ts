/**
 * Snapshot builder — projects the authoritative WorldState into the flat,
 * network-friendly {@link SnapshotMessage} the client renders.
 *
 * This is a pure projection: it never mutates the world. Keeping it separate
 * from the simulation means we can change the wire format (e.g. add delta
 * compression) without touching gameplay code.
 */
import type { WorldState } from '../domain/types.js';
import type { SnapshotMessage } from './protocol.js';

export function buildSnapshot(world: WorldState, serverTimeMs: number): SnapshotMessage {
  return {
    serverTimeMs,
    startsAtMs: world.startsAtMs,
    phase: world.phase,
    elapsedMs: world.elapsedMs,
    players: [...world.players.values()].map((player) => ({
      userId: player.id,
      role: player.role,
      lane: player.lane,
      x: player.x,
      distance: player.distance,
      jumpUntilMs: player.jumpUntilMs,
      died: player.died,
      finished: player.finished,
      finishTimeMs: player.finishTimeMs,
      lastInputSeq: player.lastInputSeq,
      abilities: player.abilities,
      sliding: world.elapsedMs < player.slideUntilMs,
      stalled: player.stuck || world.elapsedMs < player.stallUntilMs,
      boosted: world.elapsedMs < player.boostUntilMs,
    })),
    hazards: world.hazards.map((hazard) => ({
      id: hazard.id,
      kind: hazard.kind,
      lane: hazard.lane,
      worldY: hazard.worldY,
      open: hazard.open,
      angle: hazard.angle,
      abilityId: hazard.abilityId,
    })),
    dividersOpen: world.dividersOpen,
  };
}
