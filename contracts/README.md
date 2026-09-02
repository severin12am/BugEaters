# BugEaters pass NFT contracts (TON, TEP-62)

The weekly-tournament passes and the champion token are **standard TEP-62 NFT
items** in one BugEaters collection. No custom on-chain logic is needed for v1
(see `docs/TON_CRYPTO_IMPLEMENTATION_PLAN.md` §7): standard items stay tradable
on Getgems / Tonkeeper, and "burn to enter" is a plain `transfer` of the item to
the burn address `0:0000…0000` (friendly form `EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c`,
workchain 0, all-zero hash) which no one controls.

## Sources

`func/` is the TON Foundation reference implementation, vendored verbatim from
[`ton-blockchain/token-contract`](https://github.com/ton-blockchain/token-contract)
at commit `1182ad99413242f09925d50e70ccb7e0e09f94d4` (MIT — see `func/NOTICE.md`).

| File | Role |
|------|------|
| `func/nft-collection.fc` | Collection: owner mints items (`op=1`), `get_nft_address_by_index`, `get_nft_content` |
| `func/nft-item.fc` | Item: ownership + `transfer` (0x5fcc3d14), `get_nft_data` |
| `func/stdlib.fc`, `params.fc`, `op-codes.fc` | Shared includes |

Compiled artifacts go to `build/` (git-ignored) via `npm run ton:compile`.

## Metadata (TEP-64, off-chain)

The collection stores a **common content prefix** (`NFT_META_BASE_URL`, e.g.
`https://<project>.functions.supabase.co/nft-meta/`) and every item stores only a
suffix:

| Item | Suffix | Served by |
|------|--------|-----------|
| Collection | `collection.json` | `supabase/functions/nft-meta` |
| Weekday / Sunday pass | `pass/<pass uuid>.json` | same — attributes `week_id`, `grants_entry`, `won_on` |
| Champion | `champion/<week_id>.json` | same — attributes `week_id`, `kind: champion` |

Metadata is display data only. Authorization always reads ownership on-chain
(`get_nft_data`) — never the JSON.

## Deploy to testnet

```bash
# 1. Treasury wallet (collection owner + minter). Fund it on testnet:
#    https://t.me/testgiver_ton_bot
export TON_NETWORK=testnet
export TON_TREASURY_MNEMONIC="word1 word2 ... word24"
export TON_API_KEY=...                        # optional, https://t.me/tontestnetapibot
export NFT_META_BASE_URL=https://<project>.functions.supabase.co/nft-meta/

# 2. Compile + deploy the collection (prints the collection address)
npm run ton:compile
npm run ton:deploy-collection

# 3. Point everything at it
#    Fly (race server minter):   fly secrets set NFT_COLLECTION_ADDRESS=EQ... TON_TREASURY_MNEMONIC="..." TON_NETWORK=testnet SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
#    Supabase (edge functions):  supabase secrets set NFT_COLLECTION_ADDRESS=EQ... TON_NETWORK=testnet TON_API_KEY=...
#    Postgres game_config:       update game_config set value = '"EQ..."' where key = 'nft_collection_address';
#                                update game_config set value = 'true'   where key = 'pass_required_onchain';

# 4. Inspect
npm run ton:collection-info
```

Who mints: the **race server** (`server/src/ton/NftMinter.ts`) — it already owns
the post-race hook slot the docs reserved for "nft-mint", holds the treasury
mnemonic as a Fly secret, and sweeps pending passes every 30s so Monday winners
who link a wallet later still receive their Tuesday pass.
