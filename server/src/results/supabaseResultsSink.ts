/**
 * Supabase results sink — pushes sealed standings to the `race-results` Edge
 * Function, which applies tournament advancement exactly once.
 *
 * The payload is HMAC-signed with the shared `RACE_TOKEN_SECRET` so Supabase can
 * prove it came from the authoritative race server and not a spoofed client.
 * (See supabase/functions/race-results/index.ts for the verifying side.)
 */
import { createHmac } from 'node:crypto';
import type { ResultsSink, SealedRaceResult } from './ResultsSink.js';

export interface SupabaseResultsSinkOptions {
  readonly supabaseUrl: string;
  readonly secret: string;
}

export class SupabaseResultsSink implements ResultsSink {
  constructor(private readonly options: SupabaseResultsSinkOptions) {
    if (!options.supabaseUrl || !options.secret) {
      throw new Error('SupabaseResultsSink requires supabaseUrl and secret');
    }
  }

  async submit(result: SealedRaceResult): Promise<void> {
    // The wire shape matches what record_authoritative_results expects.
    const payload = JSON.stringify({
      roomId: result.roomId,
      results: result.results.map((r) => ({
        userId: r.userId,
        finished: r.finished,
        died: r.died,
        finishTimeMs: r.finishTimeMs,
      })),
    });
    const signature = createHmac('sha256', this.options.secret).update(payload).digest('base64url');

    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/race-results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Race-Signature': signature,
      },
      body: payload,
    });
    if (!response.ok) {
      throw new Error(`race-results rejected standings: ${await response.text()}`);
    }
  }
}
