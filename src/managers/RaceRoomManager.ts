import { MULTIPLAYER_TUNING, type RaceRoomPhase, type RaceRoomState } from '../config/multiplayer';
import { CharacterType } from '../utils/constants';
import { RACE_COMPOSITION } from '../config/raceRoster';
import { getForcedSeed } from '../net/env';
import { randomSeed } from '../utils/rng';
import type { RoomSession } from '../net/RoomSession';
import type { RosterSlot } from '../net/types';

/**
 * Race room lifecycle for a single race.
 *
 * In multiplayer it wraps a live {@link RoomSession} (created in the lobby and
 * shared via the registry) and surfaces the room's seed, synchronized start,
 * and assigned roster slot. In solo mode it falls back to a locally generated
 * seed so the game runs identically without a backend.
 */
export class RaceRoomManager {
  private state: RaceRoomState;
  private seed: number;
  private readonly session: RoomSession | null;

  constructor(session: RoomSession | null = null) {
    this.session = session;
    const info = session?.getRoomInfo() ?? null;

    this.seed = info ? info.seed : getForcedSeed() ?? randomSeed();
    this.state = {
      roomId: info?.roomId ?? MULTIPLAYER_TUNING.localSoloRoomId,
      phase: info?.phase ?? 'racing',
      playerCount: 1,
      startsAtMs: info?.startsAtMs ?? null,
    };
  }

  /** True when this race is backed by a real multiplayer room. */
  isMultiplayer(): boolean {
    return this.session?.getRoomInfo() != null;
  }

  getSession(): RoomSession | null {
    return this.session;
  }

  /** Seed that drives deterministic obstacles + lane dividers for this race. */
  getSeed(): number {
    return this.seed;
  }

  /** Overrides the world seed (used once the room seed is known). */
  setSeed(seed: number): void {
    this.seed = seed >>> 0;
  }

  /** Synchronized race start (client clock), or null in solo. */
  getStartsAtMs(): number | null {
    return this.state.startsAtMs;
  }

  /** This player's assigned slot (multiplayer only). */
  getSelfSlot(): RosterSlot | null {
    return this.session?.getRoomInfo()?.self ?? null;
  }

  getState(): Readonly<RaceRoomState> {
    return this.state;
  }

  getPhase(): RaceRoomPhase {
    return this.state.phase;
  }

  /** Expected roster for the room (for UI / sync). */
  getExpectedComposition(): Record<CharacterType, number> {
    return { ...RACE_COMPOSITION };
  }

  /** Join is performed in the lobby; kept for solo callers / compatibility. */
  async joinRoom(_roomId?: string): Promise<RaceRoomState> {
    return this.state;
  }

  setPhase(phase: RaceRoomPhase): void {
    this.state = { ...this.state, phase };
  }

  /**
   * Per-race teardown. The underlying RoomSession outlives the GameScene (the
   * end screen still reads standings from it), so it is NOT destroyed here.
   */
  destroy(): void {
    // Intentionally does not tear down the shared RoomSession.
  }
}
