/**
 * Deploys the BugEaters pass collection (TEP-62 reference contract) from the
 * treasury wallet. Run `npm run ton:compile` first.
 *
 *   TON_NETWORK=testnet TON_TREASURY_MNEMONIC="..." NFT_META_BASE_URL=https://.../nft-meta/ \
 *   npm run ton:deploy-collection
 *
 * Optional: TON_API_KEY, NFT_ROYALTY_BPS (default 500 = 5%), NFT_COLLECTION_META_URL
 * (default <NFT_META_BASE_URL>collection.json).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Cell, toNano } from '@ton/core';
import {
  buildCollectionStateInit,
  collectionAddress,
  createTonClient,
  loadTonConfig,
  openTreasury,
  tonviewerUrl,
  type CollectionInit,
} from '../../server/src/ton/index.js';
import { loadEnvFile } from '../../server/src/runtime/loadEnv.js';

loadEnvFile('server/.env', false);
loadEnvFile('.env', false);

function loadCode(name: string): Cell {
  const path = resolve(process.cwd(), 'contracts', 'build', `${name}.compiled.json`);
  let json: { codeBoc: string };
  try {
    json = JSON.parse(readFileSync(path, 'utf8')) as { codeBoc: string };
  } catch {
    throw new Error(`${path} missing — run \`npm run ton:compile\` first`);
  }
  return Cell.fromBase64(json.codeBoc);
}

const config = loadTonConfig();
if (!config.treasuryMnemonic) {
  throw new Error('TON_TREASURY_MNEMONIC is required');
}
if (!config.metaBaseUrl) {
  throw new Error('NFT_META_BASE_URL is required (e.g. https://<ref>.functions.supabase.co/nft-meta/)');
}

const client = createTonClient(config);
const treasury = await openTreasury(client, config.treasuryMnemonic);
const balance = await treasury.balance();
console.log(`[ton:deploy] network ${config.network}`);
console.log(`[ton:deploy] treasury ${treasury.address.toString()} balance ${Number(balance) / 1e9} TON`);
if (balance < toNano('0.2')) {
  throw new Error('treasury needs at least 0.2 TON (testnet faucet: https://t.me/testgiver_ton_bot)');
}

const royaltyBps = Number(process.env.NFT_ROYALTY_BPS ?? '500');
const init: CollectionInit = {
  owner: treasury.address,
  collectionContentUrl: process.env.NFT_COLLECTION_META_URL?.trim() || `${config.metaBaseUrl}collection.json`,
  commonContentBaseUrl: config.metaBaseUrl,
  nftItemCode: loadCode('nft-item'),
  royalty: { factor: royaltyBps, base: 10_000, destination: treasury.address },
};
const collectionCode = loadCode('nft-collection');
const address = collectionAddress(init, collectionCode);
console.log(`[ton:deploy] collection address ${address.toString()}`);

if (await client.isContractDeployed(address)) {
  console.log('[ton:deploy] already deployed — nothing to do');
} else {
  await treasury.sendInternal({
    to: address,
    value: toNano('0.1'),
    init: buildCollectionStateInit(init, collectionCode),
    bounce: false,
  });
  for (let i = 0; i < 20 && !(await client.isContractDeployed(address)); i++) {
    await new Promise((r) => setTimeout(r, 3_000));
  }
  console.log(
    (await client.isContractDeployed(address))
      ? '[ton:deploy] deployed'
      : '[ton:deploy] sent — not yet visible, check the explorer in a minute',
  );
}

console.log(`\n${tonviewerUrl(config.network, address.toString())}`);
console.log('\nNext:');
console.log(`  fly secrets set -a bugeaters-race NFT_COLLECTION_ADDRESS=${address.toString()}`);
console.log(`  supabase secrets set NFT_COLLECTION_ADDRESS=${address.toString()} TON_NETWORK=${config.network}`);
console.log(
  `  update public.game_config set value = to_jsonb('${address.toString()}'::text) where key = 'nft_collection_address';`,
);
