/**
 * Snapshot builder — projects the authoritative WorldState into the flat,
 * network-friendly {@link SnapshotMessage} the client renders.
 */
import type { WorldState } from '../domain/types.js';
import { isSlowedByRival } from '../domain/systems/abilitySystem.js';
import type { SnapshotMessage } from './protocol.js';

export function buildSnapshot(world: WorldState, serverTimeMs: number): SnapshotMessage {
  const raceMs = world.elapsedMs;
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
      sliding: raceMs < player.slideUntilMs,
      stalled: player.stuck || raceMs < player.stallUntilMs,
      boosted: raceMs < player.boostUntilMs,
      eatProtected: raceMs < player.eatProtectedUntilMs,
      blackrock: raceMs < player.blackrockUntilMs,
      barriersOpen: raceMs < player.barriersOpenUntilMs,
      flight: raceMs < player.flightUntilMs,
      hellMode: raceMs < player.hellModeUntilMs,
      slowed: isSlowedByRival(player, world, raceMs),
      flashlight: raceMs < player.flashlightUntilMs,
    })),
    hazards: world.hazards.map((hazard) => ({
      id: hazard.id,
      kind: hazard.kind,
      lane: hazard.lane,
      worldY: hazard.worldY,
      open: hazard.open,
      angle: hazard.angle,
      abilityId: hazard.abilityId,
      resolvedBy: hazard.resolvedBy ? [...hazard.resolvedBy] : undefined,
    })),
    dividersOpen: world.dividersOpen,
  };
}
