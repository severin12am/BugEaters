/**
 * TON cell-layout tests — prove our builders match the vendored reference
 * contracts' storage/message schemas without touching the network.
 *
 * Runs with `npm run race-server:test`.
 */
import assert from 'node:assert/strict';
import { Address, beginCell, Cell, TupleBuilder, TupleReader } from '@ton/core';
import {
  BURN_ADDRESS,
  NFT_OP,
  buildCollectionData,
  buildMintBody,
  buildTransferBody,
  championContentSuffix,
  nftItemAddress,
  nftItemStateInit,
  offchainContent,
  parseCollectionData,
  parseNftData,
  passContentSuffix,
  readContentString,
  sameAddress,
  snakeString,
  NftMinter,
  type MintStore,
  type PendingPassMint,
} from '../src/ton/index.js';

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push({ name, fn });

const OWNER = Address.parse('EQBvW8Z5huBkMJYdnfAEM5JqTNkuWX3diqYENkWsIL0XggGG');
const COLLECTION = Address.parse('EQDrLq-X6jKZNHAScgghh0h1iog3StK71zn8dcmrOj8jPWRA');
const DUMMY_CODE = beginCell().storeUint(0xabcdef, 24).endCell();

test('burn address is the all-zero account in workchain 0', () => {
  const burn = Address.parseRaw(BURN_ADDRESS);
  assert.equal(burn.workChain, 0);
  assert.ok(burn.hash.every((byte) => byte === 0));
});

test('offchain content = 0x01 prefix + snake string, round-trips', () => {
  const url = 'https://example.functions.supabase.co/nft-meta/collection.json';
  const cell = offchainContent(url);
  const slice = cell.beginParse();
  assert.equal(slice.loadUint(8), 1);
  assert.equal(slice.loadStringTail(), url);
  assert.equal(readContentString(cell, true), url);
  assert.equal(readContentString(snakeString('pass/x.json'), false), 'pass/x.json');
});

test('long URLs chain into refs and still read back whole', () => {
  const long = `https://example.com/${'a'.repeat(300)}.json`;
  assert.equal(readContentString(offchainContent(long), true), long);
});

test('mint body matches nft-collection.fc op=1 layout', () => {
  const body = buildMintBody({
    itemIndex: 7,
    owner: OWNER,
    contentSuffix: passContentSuffix('abc'),
    queryId: 99n,
    itemAmount: 50_000_000n,
  });
  const s = body.beginParse();
  assert.equal(s.loadUint(32), NFT_OP.collectionMint);
  assert.equal(s.loadUintBig(64), 99n);
  assert.equal(s.loadUintBig(64), 7n);
  assert.equal(s.loadCoins(), 50_000_000n);
  const content = s.loadRef().beginParse();
  assert.ok(content.loadAddress().equals(OWNER));
  assert.equal(readContentString(content.loadRef(), false), 'pass/abc.json');
  assert.equal(s.remainingBits, 0);
});

test('transfer body matches nft-item.fc transfer layout (burn = new owner is burn address)', () => {
  const body = buildTransferBody({
    newOwner: Address.parseRaw(BURN_ADDRESS),
    responseDestination: OWNER,
    queryId: 5n,
  });
  const s = body.beginParse();
  assert.equal(s.loadUint(32), NFT_OP.transfer);
  assert.equal(s.loadUintBig(64), 5n);
  assert.ok(s.loadAddress().equals(Address.parseRaw(BURN_ADDRESS)));
  assert.ok(s.loadAddress().equals(OWNER));
  assert.equal(s.loadBit(), false, 'no custom payload');
  assert.equal(s.loadCoins(), 0n);
  assert.equal(s.loadBit(), false, 'inline empty forward payload');
  assert.equal(s.remainingBits, 0);
});

test('collection storage parses back (owner, next index, content refs, royalty)', () => {
  const data = buildCollectionData(
    {
      owner: OWNER,
      collectionContentUrl: 'https://x/collection.json',
      commonContentBaseUrl: 'https://x/',
      nftItemCode: DUMMY_CODE,
      royalty: { factor: 500, base: 10_000, destination: OWNER },
    },
    3,
  );
  const s = data.beginParse();
  assert.ok(s.loadAddress().equals(OWNER));
  assert.equal(s.loadUintBig(64), 3n);
  const content = s.loadRef().beginParse();
  assert.equal(readContentString(content.loadRef(), true), 'https://x/collection.json');
  assert.equal(readContentString(content.loadRef(), false), 'https://x/');
  assert.ok(s.loadRef().equals(DUMMY_CODE));
  const royalty = s.loadRef().beginParse();
  assert.equal(royalty.loadUint(16), 500);
  assert.equal(royalty.loadUint(16), 10_000);
  assert.ok(royalty.loadAddress().equals(OWNER));
});

test('item state init = index:uint64 + collection address (calculate_nft_item_state_init)', () => {
  const init = nftItemStateInit(COLLECTION, 42, DUMMY_CODE);
  const s = init.data!.beginParse();
  assert.equal(s.loadUintBig(64), 42n);
  assert.ok(s.loadAddress().equals(COLLECTION));
  // Deterministic and index-sensitive.
  assert.ok(nftItemAddress(COLLECTION, 42, DUMMY_CODE).equals(nftItemAddress(COLLECTION, 42, DUMMY_CODE)));
  assert.ok(!nftItemAddress(COLLECTION, 42, DUMMY_CODE).equals(nftItemAddress(COLLECTION, 43, DUMMY_CODE)));
});

test('get_nft_data / get_collection_data stacks parse', () => {
  const tb = new TupleBuilder();
  tb.writeNumber(-1);
  tb.writeNumber(9);
  tb.writeAddress(COLLECTION);
  tb.writeAddress(OWNER);
  tb.writeCell(snakeString('pass/p1.json'));
  const nft = parseNftData(new TupleReader(tb.build()));
  assert.equal(nft.initialized, true);
  assert.equal(nft.index, 9n);
  assert.ok(sameAddress(nft.collection, COLLECTION));
  assert.ok(sameAddress(nft.owner, OWNER));
  assert.equal(readContentString(nft.individualContent!, false), 'pass/p1.json');

  const cb = new TupleBuilder();
  cb.writeNumber(12);
  cb.writeCell(offchainContent('https://x/collection.json'));
  cb.writeAddress(OWNER);
  const col = parseCollectionData(new TupleReader(cb.build()));
  assert.equal(col.nextItemIndex, 12n);
  assert.ok(col.owner.equals(OWNER));
});

test('content suffixes are stable (metadata routes depend on them)', () => {
  assert.equal(passContentSuffix('11111111-2222'), 'pass/11111111-2222.json');
  assert.equal(championContentSuffix('2026-08-31'), 'champion/2026-08-31.json');
});

test('minter: sweep mints each pending pass once, sequentially, at the collection next index', async () => {
  const minted: Array<{ passId: string; address: string; index: bigint }> = [];
  const claimed: string[] = [];
  const pending: PendingPassMint[] = [
    { passId: 'p1', userId: 'u1', weekId: 'w', grantsEntry: 'tuesday', wonOn: 'monday', walletAddress: OWNER.toString(), plannedAddress: null },
    { passId: 'p2', userId: 'u2', weekId: 'w', grantsEntry: 'tuesday', wonOn: 'monday', walletAddress: OWNER.toString(), plannedAddress: null },
  ];
  const store: MintStore = {
    pendingPasses: async () => pending.splice(0),
    pendingChampions: async () => [],
    markPassMinting: async (id) => { claimed.push(id); return true; },
    markPassMinted: async (passId, address, index) => { minted.push({ passId, address, index }); },
    markPassFailed: async () => {},
    markChampionMinting: async () => true,
    markChampionMinted: async () => {},
    markChampionFailed: async () => {},
    expireUnlinkedPasses: async () => 0,
  };

  // Fake chain: collection index advances on each mint; items appear owned by the recipient.
  let nextIndex = 5n;
  const items = new Map<string, { owner: Address; index: bigint }>();
  const sent: Cell[] = [];
  const fakeClient = {
    async runMethod(address: Address, method: string, args?: Array<{ type: string; value?: bigint }>) {
      const tb = new TupleBuilder();
      if (method === 'get_collection_data') {
        tb.writeNumber(nextIndex);
        tb.writeCell(offchainContent('https://x/collection.json'));
        tb.writeAddress(OWNER);
      } else if (method === 'get_nft_address_by_index') {
        tb.writeAddress(nftItemAddress(COLLECTION, args![0].value!, DUMMY_CODE));
      } else if (method === 'get_nft_data') {
        const item = items.get(address.toString())!;
        tb.writeNumber(-1);
        tb.writeNumber(item.index);
        tb.writeAddress(COLLECTION);
        tb.writeAddress(item.owner);
        tb.writeCell(snakeString('x'));
      }
      return { stack: new TupleReader(tb.build()) };
    },
    async isContractDeployed(address: Address) {
      return items.has(address.toString());
    },
  };
  const treasury = {
    address: OWNER,
    keyPair: { publicKey: Buffer.alloc(32), secretKey: Buffer.alloc(64) },
    async balance() { return 0n; },
    async sendInternal(params: { body?: Cell }) {
      sent.push(params.body!);
      const s = params.body!.beginParse();
      s.loadUint(32); s.loadUintBig(64);
      const index = s.loadUintBig(64);
      items.set(nftItemAddress(COLLECTION, index, DUMMY_CODE).toString(), { owner: OWNER, index });
      nextIndex = index + 1n;
    },
  };

  const minter = new NftMinter({
    client: fakeClient as never,
    treasury,
    collection: COLLECTION,
    store,
    confirmTimeoutMs: 1_000,
    log: { info() {}, warn() {}, error() {} },
  });
  const report = await minter.sweep();
  assert.equal(report.passesMinted, 2);
  assert.equal(report.failures, 0);
  assert.deepEqual(claimed, ['p1', 'p2']);
  assert.deepEqual(minted.map((m) => m.index), [5n, 6n]);
  assert.equal(sent.length, 2);
  assert.equal(minted[0].address, nftItemAddress(COLLECTION, 5, DUMMY_CODE).toString());
});

let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    failed++;
    console.error(`  \u2717 ${name}`);
    console.error(`      ${(error as Error).stack ?? (error as Error).message}`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
