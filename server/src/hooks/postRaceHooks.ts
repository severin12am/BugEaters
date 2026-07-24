/**
 * =============================================================================
 * Post-race hooks — extension points that fire AFTER a race is sealed.
 * =============================================================================
 *
 * This is the requirement's "clear extension points or hooks after a race ends
 * (for future NFT minting, prize distribution, etc.) without hard-coding any
 * specific blockchain or NFT logic yet."
 *
 * HOW IT WORKS
 *   - A hook is just an async function that receives the sealed result.
 *   - You register hooks at startup (see runtime/serverContext.ts).
 *   - When a race ends, ALL registered hooks run. One hook failing does not
 *     stop the others (each is isolated + logged), so a flaky mint service can
 *     never corrupt the core result flow.
 *
 * WHY A REGISTRY INSTEAD OF INLINE CODE
 *   - The core game never imports blockchain/NFT/prize code.
 *   - Future work becomes "write a hook + register it" — a small, cheap task,
 *     ideal for a follow-up prompt to a faster model (see USER_INSTRUCTIONS.md).
 *
 * EXAMPLE (future, not implemented here):
 *
 *     hooks.register('nft-mint', async (result) => {
 *       const winner = result.results.find((r) => r.placement === 1);
 *       await mintService.mintReward(winner.userId, result.roomId);
 *     });
 */
import type { SealedRaceResult } from '../results/ResultsSink.js';

/** A single post-race extension. Keep hooks small and idempotent. */
export type PostRaceHook = (result: SealedRaceResult) => void | Promise<void>;

interface RegisteredHook {
  readonly name: string;
  readonly run: PostRaceHook;
}

/**
 * Ordered collection of post-race hooks. Register at startup; the transport
 * layer calls {@link runAll} once per finished race.
 */
export class PostRaceHooks {
  private readonly hooks: RegisteredHook[] = [];

  /** Registers a named hook. Names are for logging + future de-duplication. */
  register(name: string, run: PostRaceHook): this {
    this.hooks.push({ name, run });
    return this;
  }

  /** Number of registered hooks (handy for logging on boot). */
  get size(): number {
    return this.hooks.length;
  }

  /**
   * Runs every hook with the sealed result. Errors are isolated per hook so a
   * single failing extension never breaks result finalization or other hooks.
   */
  async runAll(result: SealedRaceResult): Promise<void> {
    await Promise.all(
      this.hooks.map(async (hook) => {
        try {
          await hook.run(result);
        } catch (error) {
          console.error(`[hooks] post-race hook "${hook.name}" failed`, error);
        }
      }),
    );
  }
}
