/**
 * Thin read helpers over toncenter (via @ton/ton's TonClient).
 *
 * Every function here is a chain READ. Writes go through `treasury.ts`.
 */
import { Address, type Cell } from '@ton/core';
import { TonClient } from '@ton/ton';
import type { TonConfig } from './config.js';
import {
  parseCollectionData,
  parseNftData,
  type CollectionData,
  type NftData,
} from './nftCollection.js';

export function createTonClient(config: TonConfig): TonClient {
  return new TonClient({ endpoint: config.endpoint, apiKey: config.apiKey ?? undefined });
}

export async function getCollectionData(client: TonClient, collection: Address): Promise<CollectionData> {
  const { stack } = await client.runMethod(collection, 'get_collection_data');
  return parseCollectionData(stack);
}

export async function getNftAddressByIndex(
  client: TonClient,
  collection: Address,
  index: number | bigint,
): Promise<Address> {
  const { stack } = await client.runMethod(collection, 'get_nft_address_by_index', [
    { type: 'int', value: BigInt(index) },
  ]);
  return stack.readAddress();
}

/** Returns null when the item contract does not exist yet (not deployed). */
export async function getNftData(client: TonClient, item: Address): Promise<NftData | null> {
  if (!(await client.isContractDeployed(item))) {
    return null;
  }
  const { stack } = await client.runMethod(item, 'get_nft_data');
  return parseNftData(stack);
}

/** Full item metadata URL = collection common content + item suffix (via `get_nft_content`). */
export async function getNftContentUrl(
  client: TonClient,
  collection: Address,
  index: bigint,
  individualContent: Cell,
): Promise<string> {
  const { stack } = await client.runMethod(collection, 'get_nft_content', [
    { type: 'int', value: index },
    { type: 'cell', cell: individualContent },
  ]);
  const content = stack.readCell().beginParse();
  content.loadUint(8); // TEP-64 off-chain prefix
  return content.loadStringTail();
}

/** Polls until `predicate` is true or the deadline passes. */
export async function waitUntil(
  predicate: () => Promise<boolean>,
  options: { timeoutMs: number; intervalMs?: number },
): Promise<boolean> {
  const deadline = Date.now() + options.timeoutMs;
  const interval = options.intervalMs ?? 2_500;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return predicate();
}

export function parseAddress(value: string): Address {
  return Address.parse(value.trim());
}
