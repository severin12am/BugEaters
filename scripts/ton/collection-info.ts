/**
 * Prints the on-chain state of the pass collection and, optionally, one item.
 *
 *   npm run ton:collection-info            # collection summary
 *   npm run ton:collection-info -- 12      # + item #12 owner / metadata URL
 */
import { Address } from '@ton/core';
import {
  createTonClient,
  getCollectionData,
  getNftAddressByIndex,
  getNftContentUrl,
  getNftData,
  loadTonConfig,
  readContentString,
  tonviewerUrl,
} from '../../server/src/ton/index.js';
import { loadEnvFile } from '../../server/src/runtime/loadEnv.js';

loadEnvFile('server/.env', false);
loadEnvFile('.env', false);

const config = loadTonConfig();
if (!config.collectionAddress) {
  throw new Error('NFT_COLLECTION_ADDRESS is required');
}
const client = createTonClient(config);
const collection = Address.parse(config.collectionAddress);
const data = await getCollectionData(client, collection);

console.log(`[ton] ${config.network} collection ${collection.toString()}`);
console.log(`[ton] owner            ${data.owner.toString()}`);
console.log(`[ton] next_item_index  ${data.nextItemIndex}`);
console.log(`[ton] metadata         ${readContentString(data.content, true)}`);
console.log(`[ton] explorer         ${tonviewerUrl(config.network, collection.toString())}`);

const indexArg = process.argv[2];
if (indexArg !== undefined) {
  const index = BigInt(indexArg);
  const itemAddress = await getNftAddressByIndex(client, collection, index);
  const item = await getNftData(client, itemAddress);
  console.log(`\n[ton] item #${index} ${itemAddress.toString()}`);
  if (!item) {
    console.log('[ton] not deployed');
  } else {
    console.log(`[ton] initialized ${item.initialized}`);
    console.log(`[ton] owner       ${item.owner?.toString() ?? '-'}`);
    if (item.individualContent) {
      console.log(`[ton] metadata    ${await getNftContentUrl(client, collection, index, item.individualContent)}`);
    }
  }
}
