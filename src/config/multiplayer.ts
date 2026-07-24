/**
 * Multiplayer / race-room settings (stub — local single-player for now).
 */
export const MULTIPLAYER_TUNING = {
  /** Max runners per room (matches design: 6 bugs + 2 humans + 1 klaus). */
  maxRunnersPerRoom: 9,
  /** Parallel rooms instead of one global server. */
  useRaceRooms: true,
  /** Placeholder room id for offline / solo play. */
  localSoloRoomId: 'local-solo',
} as const;

export type RaceRoomPhase = 'waiting' | 'countdown' | 'racing' | 'finished';

export interface RaceRoomState {
  roomId: string;
  phase: RaceRoomPhase;
  playerCount: number;
  startsAtMs: number | null;
}
