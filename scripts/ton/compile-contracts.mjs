/**
 * Compiles the vendored TEP-62 reference contracts with func-js and writes the
 * code BOCs to contracts/build/*.compiled.json (git-ignored).
 *
 *   npm run ton:compile
 */
import { compileFunc } from '@ton-community/func-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const funcDir = resolve(root, 'contracts', 'func');
const buildDir = resolve(root, 'contracts', 'build');

const INCLUDES = ['stdlib.fc', 'params.fc', 'op-codes.fc'];
const TARGETS = ['nft-collection.fc', 'nft-item.fc'];

mkdirSync(buildDir, { recursive: true });

for (const target of TARGETS) {
  const result = await compileFunc({
    targets: [...INCLUDES, target],
    sources: (path) => readFileSync(resolve(funcDir, path), 'utf8'),
  });
  if (result.status === 'error') {
    console.error(`[ton:compile] ${target} failed:\n${result.message}`);
    process.exit(1);
  }
  const out = resolve(buildDir, target.replace(/\.fc$/u, '.compiled.json'));
  writeFileSync(
    out,
    JSON.stringify({ source: target, codeBoc: result.codeBoc, codeHashHex: result.codeHashHex }, null, 2),
  );
  console.log(`[ton:compile] ${target} → ${out} (hash ${result.codeHashHex.slice(0, 16)}…)`);
}
