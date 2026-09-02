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
import { createTonRuntime, type TonRuntime } from '../ton/index.js';
import { loadServerEnv } from './loadEnv.js';

export interface ServerContext {
  readonly config: RaceConfig;
  /** Shared secret used to verify race tickets. Empty in unconfigured dev. */
  readonly ticketSecret: string;
  /** Where sealed standings are written. */
  readonly resultsSink: ResultsSink;
  /** Extension hooks that run after a race is sealed. */
  readonly postRaceHooks: PostRaceHooks;
  /** TON pass/champion NFT minter — null until the operator sets the TON secrets. */
  ton: TonRuntime | null;
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
  const context: ServerContext = {
    config,
    ticketSecret,
    resultsSink,
    postRaceHooks: new PostRaceHooks(),
    ton: null,
  };
  registerPostRaceHooks(context);

  if (!ticketSecret) {
    console.warn(
      '[serverContext] RACE_TOKEN_SECRET is not set — ticket verification will fail. ' +
        'Set it for anything beyond local smoke tests.',
    );
  }

  return context;
}

/**
 * Connects the TON minter (async: derives the treasury wallet). Called once from
 * the entrypoint after the HTTP server is up so a slow RPC never blocks boot.
 */
export async function startTonRuntime(context: ServerContext = getServerContext()): Promise<void> {
  if (context.ton) {
    return;
  }
  try {
    const runtime = await createTonRuntime();
    if (runtime) {
      context.ton = runtime;
      runtime.minter.start(runtime.config.mintIntervalMs);
    }
  } catch (error) {
    console.error('[ton] minter failed to start — passes stay database rows', error);
  }
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
 * Registers post-race extension hooks — WITHOUT touching the simulation.
 *
 *   - `log-winner`  reference hook.
 *   - `nft-mint`    the pass / champion NFT mint. Advancement has already been
 *                   written by Supabase (`record_authoritative_results`) when
 *                   hooks run, so the minter just sweeps the pending queue.
 *
 * TODO(extension): `prize-payout` etc. follow the same pattern; see
 * hooks/postRaceHooks.ts for the contract.
 */
function registerPostRaceHooks(context: ServerContext): void {
  context.postRaceHooks.register('log-winner', (result) => {
    const winner = result.results.find((r) => r.placement === 1);
    if (winner) {
      console.info(`[hooks] room ${result.roomId} winner: ${winner.userId}`);
    }
  });
  context.postRaceHooks.register('nft-mint', () => {
    if (!context.ton) {
      return;
    }
    // Kick the sweep but do not hold the finished room open while TON confirms.
    void context.ton.minter.sweep().then((report) => {
      if (report.passesMinted || report.championsMinted || report.failures) {
        console.info('[hooks] nft-mint sweep', report);
      }
    });
  });
}
