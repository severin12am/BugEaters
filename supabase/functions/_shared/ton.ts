// Shared TON helpers for edge functions (Deno). Mirrors the byte layouts in
// server/src/ton/* — keep both in sync when changing the collection contract.
//
// Env (Supabase secrets):
//   TON_NETWORK              testnet | mainnet (default testnet)
//   TON_API_KEY              toncenter key (optional)
//   TONAPI_KEY               tonapi.io bearer (optional, for wallet NFT listing)
//   NFT_COLLECTION_ADDRESS   deployed pass collection
//   TON_PROOF_SECRET         HMAC secret for ton_proof payloads (falls back to RACE_TOKEN_SECRET)
//   TON_PROOF_DOMAINS        comma list of allowed dApp domains for ton_proof (e.g. bugeaters-cey.pages.dev)
import { Address, beginCell, Cell, contractAddress, loadStateInit } from 'npm:@ton/core@0.63.1';
import { sha256, signVerify } from 'npm:@ton/crypto@3.3.0';
import {
  TonClient,
  WalletContractV3R1,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from 'npm:@ton/ton@16.3.0';

export type TonNetwork = 'testnet' | 'mainnet';

export const BURN_ADDRESS_RAW = `0:${'0'.repeat(64)}`;
export const NFT_OP_TRANSFER = 0x5fcc3d14;
/** TON Connect CHAIN ids. */
export const CHAIN_ID: Record<TonNetwork, string> = { mainnet: '-239', testnet: '-3' };

export function tonNetwork(): TonNetwork {
  return Deno.env.get('TON_NETWORK')?.trim().toLowerCase() === 'mainnet' ? 'mainnet' : 'testnet';
}

export function toncenterEndpoint(network = tonNetwork()): string {
  return network === 'mainnet'
    ? 'https://toncenter.com/api/v2/jsonRPC'
    : 'https://testnet.toncenter.com/api/v2/jsonRPC';
}

export function tonapiBase(network = tonNetwork()): string {
  return network === 'mainnet' ? 'https://tonapi.io/v2' : 'https://testnet.tonapi.io/v2';
}

export function tonviewerUrl(address: string, network = tonNetwork()): string {
  return network === 'mainnet' ? `https://tonviewer.com/${address}` : `https://testnet.tonviewer.com/${address}`;
}

let cachedClient: TonClient | null = null;
export function tonClient(): TonClient {
  if (!cachedClient) {
    cachedClient = new TonClient({
      endpoint: toncenterEndpoint(),
      apiKey: Deno.env.get('TON_API_KEY')?.trim() || undefined,
    });
  }
  return cachedClient;
}

export function collectionAddress(): Address | null {
  const raw = Deno.env.get('NFT_COLLECTION_ADDRESS')?.trim();
  if (!raw) {
    return null;
  }
  try {
    return Address.parse(raw);
  } catch {
    return null;
  }
}

export function parseAddress(value: string): Address {
  return Address.parse(value.trim());
}

/** Friendly, non-bounceable form — how wallets show a user's own address. */
export function friendlyWallet(address: Address, network = tonNetwork()): string {
  return address.toString({ bounceable: false, testOnly: network === 'testnet' });
}

export interface NftData {
  initialized: boolean;
  index: bigint;
  collection: Address | null;
  owner: Address | null;
  individualContent: Cell | null;
}

/** Public toncenter allows ~1 req/s without a key — back off on 429/5xx instead of failing. */
export async function withRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const status =
        (error as { response?: { status?: number } }).response?.status ?? (error as { status?: number }).status;
      const retryable = status === 429 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt >= retries) {
        throw error;
      }
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, 1_200 * attempt));
    }
  }
}

/** `get_nft_data` on an item; null when the item contract is not deployed. */
export async function getNftData(item: Address): Promise<NftData | null> {
  const client = tonClient();
  if (!(await withRetry(() => client.isContractDeployed(item)))) {
    return null;
  }
  const { stack } = await withRetry(() => client.runMethod(item, 'get_nft_data'));
  const initialized = stack.readBigNumber() !== 0n;
  const index = stack.readBigNumber();
  const collection = stack.readAddressOpt();
  const owner = stack.readAddressOpt();
  const individualContent = stack.readCellOpt();
  return { initialized, index, collection, owner, individualContent };
}

/** True when the item belongs to OUR collection (anti-fake-NFT, plan §7). */
export async function isInCollection(item: Address, data: NftData): Promise<boolean> {
  const collection = collectionAddress();
  if (!collection || !data.collection || !data.collection.equals(collection)) {
    return false;
  }
  const { stack } = await withRetry(() =>
    tonClient().runMethod(collection, 'get_nft_address_by_index', [{ type: 'int', value: data.index }]),
  );
  return stack.readAddress().equals(item);
}

export function isBurned(data: NftData | null): boolean {
  return Boolean(data?.owner && data.owner.equals(Address.parseRaw(BURN_ADDRESS_RAW)));
}

/** Body for `transfer` to the burn address (same layout as server buildTransferBody). */
export function buildBurnTransferBody(responseTo: Address): Cell {
  return beginCell()
    .storeUint(NFT_OP_TRANSFER, 32)
    .storeUint(BigInt(Date.now()), 64)
    .storeAddress(Address.parseRaw(BURN_ADDRESS_RAW))
    .storeAddress(responseTo)
    .storeBit(false)
    .storeCoins(0n)
    .storeBit(false)
    .endCell();
}

/** Hash of an external message BOC as returned by TON Connect sendTransaction. */
export function bocHashHex(boc: string): string {
  return Cell.fromBase64(boc).hash().toString('hex');
}

/** NFT items of `owner` inside our collection, via TonAPI (indexer; may lag a few seconds). */
export async function listWalletPassNfts(owner: Address): Promise<Array<{ address: string; owner: string | null }>> {
  const collection = collectionAddress();
  if (!collection) {
    return [];
  }
  const url = new URL(`${tonapiBase()}/accounts/${owner.toRawString()}/nfts`);
  url.searchParams.set('collection', collection.toRawString());
  url.searchParams.set('limit', '200');
  url.searchParams.set('indirect_ownership', 'true');
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = Deno.env.get('TONAPI_KEY')?.trim();
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`tonapi ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as {
    nft_items?: Array<{ address: string; owner?: { address: string } }>;
  };
  return (body.nft_items ?? []).map((item) => ({
    address: Address.parseRaw(item.address).toString(),
    owner: item.owner?.address ? Address.parseRaw(item.owner.address).toString() : null,
  }));
}

// ---------------------------------------------------------------------------
// ton_proof (TON Connect) — https://docs.ton.org/v3/guidelines/ton-connect/guidelines/verifying-signed-in-users
// ---------------------------------------------------------------------------

export interface TonProof {
  timestamp: number;
  domain: { lengthBytes: number; value: string };
  signature: string; // base64
  payload: string;
  state_init?: string; // base64 BOC
}

function proofSecret(): string {
  const secret = Deno.env.get('TON_PROOF_SECRET')?.trim() || Deno.env.get('RACE_TOKEN_SECRET')?.trim();
  if (!secret) {
    throw new Error('TON_PROOF_SECRET (or RACE_TOKEN_SECRET) is not configured');
  }
  return secret;
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(proofSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Payload the client passes to TON Connect. Bound to the user, expires in 15 min. */
export async function issueProofPayload(userId: string, ttlSec = 15 * 60): Promise<{ payload: string; expiresAt: number }> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const mac = (await hmacHex(`${userId}.${exp}`)).slice(0, 32);
  return { payload: `${exp}.${mac}`, expiresAt: exp };
}

export async function verifyProofPayload(payload: string, userId: string): Promise<boolean> {
  const [expRaw, mac] = payload.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !mac || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = (await hmacHex(`${userId}.${exp}`)).slice(0, 32);
  return constantTimeEqual(expected, mac);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Public key of a wallet: from the deployed contract (`get_public_key`) or, for
 * a not-yet-deployed wallet, from the state init TON Connect sends along
 * (v3r1/v3r2/v4: seqno:32 subwallet:32 pubkey:256 · v5r1: flag:1 seqno:32 wallet_id:32 pubkey:256).
 */
export async function resolveWalletPublicKey(address: Address, stateInitBase64?: string): Promise<Uint8Array | null> {
  try {
    const client = tonClient();
    if (await withRetry(() => client.isContractDeployed(address))) {
      const { stack } = await withRetry(() => client.runMethod(address, 'get_public_key'));
      const key = stack.readBigNumber();
      return bigintTo32Bytes(key);
    }
  } catch {
    // fall through to state init
  }
  if (!stateInitBase64) {
    return null;
  }
  const init = loadStateInit(Cell.fromBase64(stateInitBase64).beginParse());
  if (!contractAddress(address.workChain, init).equals(address) || !init.data) {
    return null;
  }
  // Two candidate layouts; the right one is whichever rebuilds this exact
  // address with a standard wallet contract (so the key provably owns it).
  const candidates: Uint8Array[] = [];
  const v3v4 = init.data.beginParse();
  if (v3v4.remainingBits >= 32 + 32 + 256) {
    v3v4.loadUint(32);
    v3v4.loadUint(32);
    candidates.push(bigintTo32Bytes(v3v4.loadUintBig(256)));
  }
  const v5 = init.data.beginParse();
  if (v5.remainingBits >= 1 + 32 + 32 + 256) {
    v5.loadBit();
    v5.loadUint(32);
    v5.loadUint(32);
    candidates.push(bigintTo32Bytes(v5.loadUintBig(256)));
  }
  for (const candidate of candidates) {
    if (walletAddressesFor(candidate, address.workChain).some((a) => a.equals(address))) {
      return candidate;
    }
  }
  return null;
}

/** Addresses the standard wallet contracts would have for `publicKey`. */
function walletAddressesFor(publicKey: Uint8Array, workchain: number): Address[] {
  const key = Buffer.from(publicKey);
  const out: Address[] = [
    WalletContractV4.create({ workchain, publicKey: key }).address,
    WalletContractV3R2.create({ workchain, publicKey: key }).address,
    WalletContractV3R1.create({ workchain, publicKey: key }).address,
  ];
  for (const networkGlobalId of [-239, -3]) {
    out.push(
      WalletContractV5R1.create({
        publicKey: key,
        walletId: { networkGlobalId, context: { workchain, walletVersion: 'v5r1', subwalletNumber: 0 } },
      }).address,
    );
  }
  return out;
}

function bigintTo32Bytes(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export async function verifyTonProof(params: {
  address: Address;
  proof: TonProof;
  publicKey: Uint8Array;
  allowedDomains: string[];
  maxAgeSec?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const { address, proof, publicKey } = params;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - proof.timestamp) > (params.maxAgeSec ?? 15 * 60)) {
    return { ok: false, reason: 'proof_expired' };
  }
  if (params.allowedDomains.length > 0 && !params.allowedDomains.includes(proof.domain.value)) {
    return { ok: false, reason: 'domain_not_allowed' };
  }

  const wc = new Uint8Array(4);
  new DataView(wc.buffer).setInt32(0, address.workChain, false);
  const domainBytes = new TextEncoder().encode(proof.domain.value);
  const domainLen = new Uint8Array(4);
  new DataView(domainLen.buffer).setUint32(0, domainBytes.length, true);
  const ts = new Uint8Array(8);
  new DataView(ts.buffer).setBigUint64(0, BigInt(proof.timestamp), true);

  const message = concat(
    new TextEncoder().encode('ton-proof-item-v2/'),
    wc,
    new Uint8Array(address.hash),
    domainLen,
    domainBytes,
    ts,
    new TextEncoder().encode(proof.payload),
  );
  const messageHash = await sha256(Buffer.from(message));
  const full = concat(new Uint8Array([0xff, 0xff]), new TextEncoder().encode('ton-connect'), new Uint8Array(messageHash));
  const fullHash = await sha256(Buffer.from(full));
  const signature = Buffer.from(proof.signature, 'base64');
  const ok = signVerify(Buffer.from(fullHash), signature, Buffer.from(publicKey));
  return ok ? { ok: true } : { ok: false, reason: 'bad_signature' };
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function allowedProofDomains(): string[] {
  return (Deno.env.get('TON_PROOF_DOMAINS') ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
}
