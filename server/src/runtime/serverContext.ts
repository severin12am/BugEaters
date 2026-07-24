/**
 * =============================================================================
 * ServerContext — the composition root (dependency wiring).
 * =============================================================================
 *
 * This is the ONE place where concrete implementations are chosen and wired
 * together: which config to use, which results sink to write to, and which
 * post-race hooks to run. Everything else depends on interfaces, not on these
 * choices, which is what keeps the system modular and easy to change.
 *
 * The context is built once at startup and shared with every race room. Colyseus
 * constructs rooms itself, so rooms read the already-built context from here
 * rather than receiving it via a constructor.
 */
import { loadRaceConfig, type RaceConfig } from '../config/raceConfig.js';
import {
  ConsoleResultsSink,
  SupabaseResultsSink,
  type ResultsSink,
} from '../results/index.js';
import { PostRaceHooks } from '../hooks/index.js';
import { loadServerEnv } from './loadEnv.js';

export interface ServerContext {
  readonly config: RaceConfig;
  /** Shared secret used to verify race tickets. Empty in unconfigured dev. */
  readonly ticketSecret: string;
  /** Where sealed standings are written. */
  readonly resultsSink: ResultsSink;
  /** Extension hooks that run after a race is sealed. */
  readonly postRaceHooks: PostRaceHooks;
}

let cached: ServerContext | null = null;

/** Builds (once) and returns the shared server context. */
export function getServerContext(): ServerContext {
  if (cached) {
    return cached;
  }
  // Prefer server/.env (overwrite) so local PORT / secrets always win.
  loadServerEnv();
  cached = buildServerContext();
  return cached;
}

function buildServerContext(): ServerContext {
  const config = loadRaceConfig();
  const ticketSecret = process.env.RACE_TOKEN_SECRET ?? '';
  const resultsSink = chooseResultsSink();
  const postRaceHooks = registerPostRaceHooks(new PostRaceHooks());

  if (!ticketSecret) {
    console.warn(
      '[serverContext] RACE_TOKEN_SECRET is not set — ticket verification will fail. ' +
        'Set it for anything beyond local smoke tests.',
    );
  }

  return { config, ticketSecret, resultsSink, postRaceHooks };
}

/**
 * Picks the results sink based on the environment. If Supabase is configured we
 * push real results; otherwise we log locally so the loop still runs with no
 * setup.
 */
function chooseResultsSink(): ResultsSink {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secret = process.env.RACE_TOKEN_SECRET;
  if (supabaseUrl && secret) {
    return new SupabaseResultsSink({ supabaseUrl, secret });
  }
  console.warn('[serverContext] SUPABASE_URL not set — using local console results sink.');
  return new ConsoleResultsSink();
}

/**
 * Registers post-race extension hooks. This is where future NFT minting / prize
 * distribution will be plugged in — WITHOUT touching the simulation.
 *
 * TODO(extension): register real hooks here, e.g.:
 *
 *   hooks.register('nft-mint', async (result) => { ... });
 *   hooks.register('prize-payout', async (result) => { ... });
 *
 * Each hook is an isolated async function; see hooks/postRaceHooks.ts.
 */
function registerPostRaceHooks(hooks: PostRaceHooks): PostRaceHooks {
  // Reference hook: log the sealed winner. Safe to remove.
  hooks.register('log-winner', (result) => {
    const winner = result.results.find((r) => r.placement === 1);
    if (winner) {
      console.info(`[hooks] room ${result.roomId} winner: ${winner.userId}`);
    }
  });
  return hooks;
}
