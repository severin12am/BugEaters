/**
 * Console results sink — a no-backend fallback used for local development.
 *
 * When SUPABASE_URL / RACE_TOKEN_SECRET are not set (e.g. running the server on
 * your laptop to test the loop), sealed results are simply logged instead of
 * pushed anywhere. This keeps `npm run race-server` working with zero setup.
 */
import type { ResultsSink, SealedRaceResult } from './ResultsSink.js';

export class ConsoleResultsSink implements ResultsSink {
  async submit(result: SealedRaceResult): Promise<void> {
    console.info(
      `[results] (local) sealed room ${result.roomId} — standings:`,
      result.results.map((r) => `#${r.placement} ${r.userId}${r.died ? ' (died)' : ''}`).join(', '),
    );
  }
}
