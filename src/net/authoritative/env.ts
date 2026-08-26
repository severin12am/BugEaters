/**
 * Race server environment for the browser client.
 *
 * VITE_RACE_SERVER_URL — WebSocket URL of the Colyseus race service
 *   (e.g. ws://localhost:2567 or wss://race.example.com)
 *
 * VITE_RACE_DEV_MODE=true — fetch tickets from the race server's /dev/ticket
 *   endpoint instead of the Supabase race-ticket Edge Function. Requires the
 *   race server to run with RACE_DEV_MODE=1. Never enable for production builds.
 */

const raceServerUrl = (import.meta.env.VITE_RACE_SERVER_URL as string | undefined)?.trim() ?? '';
const raceDevModeRaw = (import.meta.env.VITE_RACE_DEV_MODE as string | undefined)?.trim().toLowerCase() ?? '';

export const RACE_SERVER_URL = raceServerUrl;
export const isRaceServerConfigured = raceServerUrl.length > 0;
export const isRaceDevMode =
  raceDevModeRaw === '1' || raceDevModeRaw === 'true' || raceDevModeRaw === 'yes';

/**
 * Shared playtest lobby. POST /dev/ticket with this id so two phones meet.
 * The ticket's `claims.roomId` is the Colyseus room for that wave — join with
 * that, not this lobby id, or rematch can land in a leftover live race.
 */
export const PLAYTEST_LOBBY_ROOM_ID = 'local-practice';

/** Converts a ws(s) race-server URL into the matching http(s) base for REST. */
export function raceServerHttpBase(wsUrl = RACE_SERVER_URL): string {
  return wsUrl.replace(/^ws:/u, 'http:').replace(/^wss:/u, 'https:').replace(/\/$/u, '');
}
