/**
 * =============================================================================
 * TEP-62 cell builders for the BugEaters pass collection.
 * =============================================================================
 *
 * Pure functions over @ton/core cells — no network. They mirror the storage and
 * message layouts of the vendored reference contracts in contracts/func so the
 * deploy script, the minter and the tests all agree on the byte layout.
 *
 * Layouts (from nft-collection.fc / nft-item.fc):
 *   collection storage  = owner:MsgAddress next_item_index:uint64
 *                         ^[collection_content:^Cell common_content:^Cell]
 *                         ^nft_item_code ^royalty_params
 *   royalty_params      = factor:uint16 base:uint16 address:MsgAddress
 *   mint (op=1) body    = op:uint32 query_id:uint64 item_index:uint64
 *                         amount:Coins ^[owner:MsgAddress ^individual_content]
 *   item storage        = index:uint64 collection:MsgAddress [owner:MsgAddress ^content]
 *   transfer body       = op:uint32 query_id:uint64 new_owner:MsgAddress
 *                         response_destination:MsgAddress custom_payload:(Maybe ^Cell)
 *                         forward_amount:Coins forward_payload:(Either Cell ^Cell)
 */
import {
  Address,
  beginCell,
  Cell,
  contractAddress,
  toNano,
  type StateInit,
  type TupleReader,
} from '@ton/core';
import { NFT_OP, OFFCHAIN_CONTENT_PREFIX } from './constants.js';

/** Value the minter forwards to each new item so it can pay its own storage. */
export const NFT_ITEM_DEPLOY_AMOUNT = toNano('0.05');
/** Value attached to the mint message (item deploy amount + gas headroom). */
export const NFT_MINT_MESSAGE_VALUE = toNano('0.1');
/** Value attached to a burn transfer (gas for the item + response). */
export const NFT_TRANSFER_MESSAGE_VALUE = toNano('0.05');

export interface CollectionInit {
  readonly owner: Address;
  /** Absolute URL of the collection metadata JSON. */
  readonly collectionContentUrl: string;
  /** Prefix prepended to every item's content suffix (usually ends with "/"). */
  readonly commonContentBaseUrl: string;
  readonly nftItemCode: Cell;
  readonly royalty: RoyaltyParams;
}

export interface RoyaltyParams {
  /** royalty = factor / base (e.g. 50 / 1000 = 5%). */
  readonly factor: number;
  readonly base: number;
  readonly destination: Address;
}

/** TEP-64 off-chain content cell: 0x01 + snake-encoded URL. */
export function offchainContent(url: string): Cell {
  return beginCell().storeUint(OFFCHAIN_CONTENT_PREFIX, 8).storeStringTail(url).endCell();
}

/** Bare snake string cell (no prefix) — used for common_content and item suffixes. */
export function snakeString(text: string): Cell {
  return beginCell().storeStringTail(text).endCell();
}

export function buildRoyaltyParams(royalty: RoyaltyParams): Cell {
  return beginCell()
    .storeUint(royalty.factor, 16)
    .storeUint(royalty.base, 16)
    .storeAddress(royalty.destination)
    .endCell();
}

export function buildCollectionContent(collectionContentUrl: string, commonContentBaseUrl: string): Cell {
  return beginCell()
    .storeRef(offchainContent(collectionContentUrl))
    .storeRef(snakeString(commonContentBaseUrl))
    .endCell();
}

export function buildCollectionData(init: CollectionInit, nextItemIndex = 0): Cell {
  return beginCell()
    .storeAddress(init.owner)
    .storeUint(nextItemIndex, 64)
    .storeRef(buildCollectionContent(init.collectionContentUrl, init.commonContentBaseUrl))
    .storeRef(init.nftItemCode)
    .storeRef(buildRoyaltyParams(init.royalty))
    .endCell();
}

export function buildCollectionStateInit(init: CollectionInit, collectionCode: Cell): StateInit {
  return { code: collectionCode, data: buildCollectionData(init) };
}

export function collectionAddress(init: CollectionInit, collectionCode: Cell, workchain = 0): Address {
  return contractAddress(workchain, buildCollectionStateInit(init, collectionCode));
}

/** Body of the owner → collection message that deploys item `itemIndex` to `owner`. */
export function buildMintBody(params: {
  readonly itemIndex: number | bigint;
  readonly owner: Address;
  /** Metadata suffix appended to the collection's common content, e.g. `pass/<id>.json`. */
  readonly contentSuffix: string;
  readonly queryId?: bigint;
  readonly itemAmount?: bigint;
}): Cell {
  const nftContent = beginCell()
    .storeAddress(params.owner)
    .storeRef(snakeString(params.contentSuffix))
    .endCell();
  return beginCell()
    .storeUint(NFT_OP.collectionMint, 32)
    .storeUint(params.queryId ?? BigInt(Date.now()), 64)
    .storeUint(BigInt(params.itemIndex), 64)
    .storeCoins(params.itemAmount ?? NFT_ITEM_DEPLOY_AMOUNT)
    .storeRef(nftContent)
    .endCell();
}

/** Body of the owner → item `transfer` message (used for burns: newOwner = BURN_ADDRESS). */
export function buildTransferBody(params: {
  readonly newOwner: Address;
  /** Who receives leftover TON; usually the current owner's wallet. */
  readonly responseDestination: Address | null;
  readonly queryId?: bigint;
  readonly forwardAmount?: bigint;
}): Cell {
  return beginCell()
    .storeUint(NFT_OP.transfer, 32)
    .storeUint(params.queryId ?? BigInt(Date.now()), 64)
    .storeAddress(params.newOwner)
    .storeAddress(params.responseDestination)
    .storeBit(false) // no custom_payload
    .storeCoins(params.forwardAmount ?? 0n)
    .storeBit(false) // forward_payload inline, empty
    .endCell();
}

/** Item state init exactly as `calculate_nft_item_state_init` builds it on-chain. */
export function nftItemStateInit(collection: Address, itemIndex: number | bigint, nftItemCode: Cell): StateInit {
  const data = beginCell().storeUint(BigInt(itemIndex), 64).storeAddress(collection).endCell();
  return { code: nftItemCode, data };
}

/** Deterministic item address for (collection, index) — matches `get_nft_address_by_index`. */
export function nftItemAddress(
  collection: Address,
  itemIndex: number | bigint,
  nftItemCode: Cell,
  workchain = 0,
): Address {
  return contractAddress(workchain, nftItemStateInit(collection, itemIndex, nftItemCode));
}

export interface NftData {
  readonly initialized: boolean;
  readonly index: bigint;
  readonly collection: Address | null;
  readonly owner: Address | null;
  readonly individualContent: Cell | null;
}

/** Parses the `get_nft_data` result stack. */
export function parseNftData(stack: TupleReader): NftData {
  const initialized = stack.readBigNumber() !== 0n;
  const index = stack.readBigNumber();
  const collection = stack.readAddressOpt();
  const owner = stack.readAddressOpt();
  const individualContent = stack.readCellOpt();
  return { initialized, index, collection, owner, individualContent };
}

export interface CollectionData {
  readonly nextItemIndex: bigint;
  readonly content: Cell;
  readonly owner: Address;
}

/** Parses the `get_collection_data` result stack. */
export function parseCollectionData(stack: TupleReader): CollectionData {
  const nextItemIndex = stack.readBigNumber();
  const content = stack.readCell();
  const owner = stack.readAddress();
  return { nextItemIndex, content, owner };
}

/** Reads a snake/tail string out of a content cell (optionally skipping the TEP-64 prefix byte). */
export function readContentString(cell: Cell, skipPrefix: boolean): string {
  const slice = cell.beginParse();
  if (skipPrefix) {
    slice.loadUint(8);
  }
  return slice.loadStringTail();
}

/** True when two addresses refer to the same account (ignores bounceable/testnet flags). */
export function sameAddress(a: Address | null | undefined, b: Address | null | undefined): boolean {
  if (!a || !b) {
    return false;
  }
  return a.equals(b);
}
