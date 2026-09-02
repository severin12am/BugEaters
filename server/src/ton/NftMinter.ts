/**
 * =============================================================================
 * NftMinter — turns awarded passes (DB rows) into TEP-62 items on TON.
 * =============================================================================
 *
 * Product rule (APP_MASTER_SPEC §8): a pass is a week-scoped NFT minted to the
 * winner's linked wallet; the Sunday champion additionally receives a champion
 * token. Advancement itself is decided in Postgres (`record_results*`). This
 * class only does the on-chain half:
 *
 *   passes.mint_status = 'pending'  ──► mint item to profiles.wallet_address
 *                                   ──► passes.nft_address / nft_index / 'minted'
 *
 * It runs on the race server because that process already owns the post-race
 * hook slot reserved for "nft-mint" and is the only trusted Node process with
 * secrets. A periodic sweep (default 30s) also catches passes whose owner linked
 * a wallet later (Monday winners) and champion tokens.
 *
 * Failure model: every step is idempotent from the DB's point of view — a pass is
 * claimed with `nft_mark_minting` before any chain write, the planned item
 * address is stored, and a retry first checks whether that item already exists.
 */
import { Address } from '@ton/core';
import type { TonClient } from '@ton/ton';
import { NFT_MINT_MESSAGE_VALUE, buildMintBody, readContentString, sameAddress } from './nftCollection.js';
import { getCollectionData, getNftAddressByIndex, getNftData, waitUntil } from './tonClient.js';
import type { Treasury } from './treasury.js';

/** One pending pass as returned by the `nft_pending_mints` RPC. */
export interface PendingPassMint {
  readonly passId: string;
  readonly userId: string;
  readonly weekId: string;
  readonly grantsEntry: string;
  readonly wonOn: string;
  readonly walletAddress: string;
  /** Item address planned by a previous attempt (recovery), if any. */
  readonly plannedAddress: string | null;
}

/** One pending champion token as returned by `nft_pending_champions`. */
export interface PendingChampionMint {
  readonly weekId: string;
  readonly userId: string;
  readonly walletAddress: string;
  readonly plannedAddress: string | null;
}

/** Everything the minter needs from the database — implemented over Supabase, stubbed in tests. */
export interface MintStore {
  pendingPasses(limit: number): Promise<PendingPassMint[]>;
  pendingChampions(limit: number): Promise<PendingChampionMint[]>;
  /** Claims the row; returns false if someone else already did. */
  markPassMinting(passId: string, plannedAddress: string): Promise<boolean>;
  markPassMinted(passId: string, nftAddress: string, nftIndex: bigint, ownerWallet: string): Promise<void>;
  markPassFailed(passId: string, error: string): Promise<void>;
  markChampionMinting(weekId: string, plannedAddress: string): Promise<boolean>;
  markChampionMinted(weekId: string, nftAddress: string, nftIndex: bigint): Promise<void>;
  markChampionFailed(weekId: string, error: string): Promise<void>;
  /** Forfeits passes whose winner never linked a wallet (I17). Returns count. */
  expireUnlinkedPasses(): Promise<number>;
}

export interface NftMinterOptions {
  readonly client: TonClient;
  readonly treasury: Treasury;
  readonly collection: Address;
  readonly store: MintStore;
  /** How long to wait for the item contract to appear after the mint message. */
  readonly confirmTimeoutMs?: number;
  readonly log?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface SweepReport {
  readonly passesMinted: number;
  readonly championsMinted: number;
  readonly failures: number;
  readonly expired: number;
}

export function passContentSuffix(passId: string): string {
  return `pass/${passId}.json`;
}

export function championContentSuffix(weekId: string): string {
  return `champion/${weekId}.json`;
}

export class NftMinter {
  private sweeping: Promise<SweepReport> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly log: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly options: NftMinterOptions) {
    this.log = options.log ?? console;
  }

  /** Starts the periodic sweep. Safe to call once at boot. */
  start(intervalMs: number): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    void this.sweep();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * One pass over the queue. Concurrent calls (post-race hook + timer) share the
   * in-flight sweep so the treasury seqno is never raced.
   */
  sweep(): Promise<SweepReport> {
    if (!this.sweeping) {
      this.sweeping = this.runSweep().finally(() => {
        this.sweeping = null;
      });
    }
    return this.sweeping;
  }

  private async runSweep(): Promise<SweepReport> {
    const report = { passesMinted: 0, championsMinted: 0, failures: 0, expired: 0 };
    try {
      report.expired = await this.options.store.expireUnlinkedPasses();
    } catch (error) {
      this.log.warn('[nft-mint] expire_unlinked_passes failed', error);
    }

    let pending: PendingPassMint[] = [];
    try {
      pending = await this.options.store.pendingPasses(10);
    } catch (error) {
      this.log.warn('[nft-mint] could not read pending passes', error);
      return report;
    }
    for (const pass of pending) {
      try {
        await this.mintPass(pass);
        report.passesMinted += 1;
      } catch (error) {
        report.failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(`[nft-mint] pass ${pass.passId} failed: ${message}`);
        await this.options.store.markPassFailed(pass.passId, message).catch(() => undefined);
      }
    }

    let champions: PendingChampionMint[] = [];
    try {
      champions = await this.options.store.pendingChampions(3);
    } catch (error) {
      this.log.warn('[nft-mint] could not read pending champions', error);
      return report;
    }
    for (const champion of champions) {
      try {
        await this.mintChampion(champion);
        report.championsMinted += 1;
      } catch (error) {
        report.failures += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(`[nft-mint] champion ${champion.weekId} failed: ${message}`);
        await this.options.store.markChampionFailed(champion.weekId, message).catch(() => undefined);
      }
    }
    return report;
  }

  private async mintPass(pass: PendingPassMint): Promise<void> {
    const owner = Address.parse(pass.walletAddress);
    const suffix = passContentSuffix(pass.passId);

    const recovered = await this.recoverExisting(pass.plannedAddress, owner, suffix);
    if (recovered) {
      await this.options.store.markPassMinted(pass.passId, recovered.address, recovered.index, pass.walletAddress);
      this.log.info(`[nft-mint] pass ${pass.passId} recovered at ${recovered.address}`);
      return;
    }

    const { index, address } = await this.nextItem();
    const claimed = await this.options.store.markPassMinting(pass.passId, address.toString());
    if (!claimed) {
      return;
    }
    await this.deployItem(index, owner, suffix, address);
    await this.options.store.markPassMinted(pass.passId, address.toString(), index, pass.walletAddress);
    this.log.info(`[nft-mint] pass ${pass.passId} (${pass.weekId} ${pass.grantsEntry}) → ${address} #${index}`);
  }

  private async mintChampion(champion: PendingChampionMint): Promise<void> {
    const owner = Address.parse(champion.walletAddress);
    const suffix = championContentSuffix(champion.weekId);

    const recovered = await this.recoverExisting(champion.plannedAddress, owner, suffix);
    if (recovered) {
      await this.options.store.markChampionMinted(champion.weekId, recovered.address, recovered.index);
      return;
    }

    const { index, address } = await this.nextItem();
    const claimed = await this.options.store.markChampionMinting(champion.weekId, address.toString());
    if (!claimed) {
      return;
    }
    await this.deployItem(index, owner, suffix, address);
    await this.options.store.markChampionMinted(champion.weekId, address.toString(), index);
    this.log.info(`[nft-mint] champion ${champion.weekId} → ${address} #${index}`);
  }

  /** The collection's next index and the deterministic address the item will get. */
  private async nextItem(): Promise<{ index: bigint; address: Address }> {
    const data = await getCollectionData(this.options.client, this.options.collection);
    const address = await getNftAddressByIndex(this.options.client, this.options.collection, data.nextItemIndex);
    return { index: data.nextItemIndex, address };
  }

  private async deployItem(index: bigint, owner: Address, suffix: string, expected: Address): Promise<void> {
    await this.options.treasury.sendInternal({
      to: this.options.collection,
      value: NFT_MINT_MESSAGE_VALUE,
      body: buildMintBody({ itemIndex: index, owner, contentSuffix: suffix }),
    });
    const ok = await waitUntil(
      async () => {
        const data = await getNftData(this.options.client, expected);
        return Boolean(data?.initialized && sameAddress(data.owner, owner));
      },
      { timeoutMs: this.options.confirmTimeoutMs ?? 120_000, intervalMs: 3_000 },
    );
    if (!ok) {
      throw new Error(`item ${expected} did not initialize for ${owner}`);
    }
  }

  /**
   * A previous attempt may have sent the mint and then lost the confirmation.
   * If the planned item exists, is owned by the right wallet and carries our
   * suffix, reuse it instead of minting a duplicate.
   */
  private async recoverExisting(
    planned: string | null,
    owner: Address,
    suffix: string,
  ): Promise<{ address: string; index: bigint } | null> {
    if (!planned) {
      return null;
    }
    let address: Address;
    try {
      address = Address.parse(planned);
    } catch {
      return null;
    }
    const data = await getNftData(this.options.client, address);
    if (!data?.initialized || !sameAddress(data.owner, owner) || !data.individualContent) {
      return null;
    }
    const existingSuffix = readContentString(data.individualContent, false);
    if (existingSuffix !== suffix) {
      return null;
    }
    return { address: address.toString(), index: data.index };
  }
}
