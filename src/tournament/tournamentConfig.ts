/**
 * Adaptive tournament parameters — client defaults only.
 *
 * Rules of thumb for balance changes later:
 * - Caps, ratios, gather windows, advancement → `game_config` in Supabase (already used server-side).
 * - Race feel (speed, lane physics) → `src/config/tuning.ts` / ability configs.
 * - Pass / NFT consumption → `ChainService` + burn RPCs (mock today).
 * - Do not hardcode week/day logic in scenes; use weekClock + tournamentApi.
 *
 * This object is the offline fallback when the backend is unavailable.
 */

export const TOURNAMENT_CONFIG = {
  maxSundaySlots: 6,
  maxSaturdayRooms: 6,
  speciesRatio: { bug: 3, human: 2, klaus: 1 },
  weekStartUtcHour: 0,
  mondayTimeSlots: [
    { id: 'slot-12', label: '12:00 UTC', hourUtc: 12, minuteUtc: 0 },
    { id: 'slot-16', label: '16:00 UTC', hourUtc: 16, minuteUtc: 0 },
    { id: 'slot-18', label: '18:00 UTC', hourUtc: 18, minuteUtc: 0 },
    { id: 'slot-21', label: '21:00 UTC', hourUtc: 21, minuteUtc: 0 },
  ],
  /** Minutes after slot time when lobby still accepts joins; then race starts. */
  mondayGatherMinutes: 5,
} as const;
