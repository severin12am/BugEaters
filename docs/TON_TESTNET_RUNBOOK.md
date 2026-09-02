# TON testnet runbook — wallet, passes, burn, champion NFT

**Status:** implemented (September 2026). Product law stays in
[`APP_MASTER_SPEC.md`](./APP_MASTER_SPEC.md) §8; the technical blueprint is
[`TON_CRYPTO_IMPLEMENTATION_PLAN.md`](./TON_CRYPTO_IMPLEMENTATION_PLAN.md). This
file is the *how to switch it on* for a non-coder.

---

## What runs where

```
Phone (Mini App)                 Supabase                          Race server (Fly)            TON testnet
──────────────────               ─────────────────────────         ───────────────────          ───────────────
Week hub "Connect"  ──► ton-proof-payload ─┐
TON Connect modal   ◄─────────────────────┘ payload
wallet signs proof  ──► link-wallet ──► link_wallet_verified ─► profiles.wallet_address
race ends           ──► record_results* ─► passes (mint_status=pending)
                                                                  NftMinter sweep ─► mint item ─► collection
                                            passes.nft_address ◄─ nft_mark_minted
Lobby "Burn & ready"──► pass-burn/prepare ─► transfer body
wallet signs        ─────────────────────────────────────────────────────────────► item → burn address
                    ──► pass-burn/confirm ─► get_nft_data == burn ─► confirm_pass_burn_verified ─► pass_burns
Sunday champion     ──► record_results* ─► tournament_weeks.champion_user_id
                                                                  NftMinter sweep ─► champion item
Hub "Import"        ──► sync-passes ─► tonapi + get_nft_data ─► claim_pass_by_nft (bought passes)
```

| Piece | Code |
|-------|------|
| Contracts (TEP-62 reference, vendored) | `contracts/` · `npm run ton:compile` · `npm run ton:deploy-collection` |
| Minter (treasury wallet, sequential mints, retries, forfeit sweep) | `server/src/ton/*`, hook `nft-mint` in `server/src/runtime/serverContext.ts` |
| Database (mint queue, verified link/burn, market claim, champion token) | `supabase/migrations/0015_ton_nft.sql` |
| Edge functions | `supabase/functions/{ton-proof-payload,link-wallet,pass-burn,sync-passes,nft-meta}` + `_shared/ton.ts` |
| Client | `src/ton/*`, `src/tournament/chain/*`, hub / lobby / end / champion scenes |

---

## Switch-on checklist (testnet)

1. **Database** — `supabase db push` (applies `0015_ton_nft.sql`).
2. **Treasury wallet** — create a fresh 24-word wallet (Tonkeeper → testnet, or
   `@ton/crypto` `mnemonicNew()`), fund it with ≥ 1 TON from
   [@testgiver_ton_bot](https://t.me/testgiver_ton_bot). Every mint costs ~0.1 TON.
3. **Deploy the collection**
   ```bash
   TON_NETWORK=testnet TON_TREASURY_MNEMONIC="…" \
   NFT_META_BASE_URL=https://<project-ref>.functions.supabase.co/nft-meta/ \
   npm run ton:deploy-collection
   ```
   Copy the printed `EQ…` collection address.
4. **Edge function secrets** (`supabase secrets set …`): `TON_NETWORK=testnet`,
   `NFT_COLLECTION_ADDRESS`, `TON_PROOF_DOMAINS=<your pages host>`,
   `PUBLIC_APP_URL`, optional `TON_API_KEY`, `TONAPI_KEY`.
   Deploy: `supabase functions deploy ton-proof-payload link-wallet pass-burn sync-passes`
   and `supabase functions deploy nft-meta --no-verify-jwt`.
5. **Race server secrets** (`fly secrets set -a bugeaters-race …`): `TON_NETWORK`,
   `TON_TREASURY_MNEMONIC`, `NFT_COLLECTION_ADDRESS`, `NFT_META_BASE_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Keep **1 machine**
   (the treasury seqno must not be raced). Boot log shows `[ton] NFT minter ON`.
6. **Client build env** (Pages): `VITE_TONCONNECT_MANIFEST_URL=https://<host>/tonconnect-manifest.json`,
   `VITE_TON_NETWORK=testnet`, `VITE_TELEGRAM_BOT_USERNAME`. Edit
   `public/tonconnect-manifest.json` `url`/`iconUrl` if the host changes.
7. **Game config** (SQL editor):
   ```sql
   update game_config set value = to_jsonb('EQ…'::text) where key = 'nft_collection_address';
   update game_config set value = 'true'  where key = 'pass_required_onchain'; -- minted passes must burn on TON
   update game_config set value = 'false' where key = 'dev_mode';             -- disables the mock wallet
   ```

Until step 7 flips `pass_required_onchain`, the whole weekly loop keeps working
with DB-only burns, so the tournament never blocks on chain setup.

---

## Player-visible flow to verify

| Step | Expect |
|------|--------|
| Hub → **Connect** | TON Connect picker (Tonkeeper testnet / Wallet). Wallet asks to sign a login request. Hub shows `UQ…` + **TON linked**. |
| Win Monday | End screen: "You won a Tuesday pass. The pass NFT mints to your wallet within a minute." (or "Link a TON wallet within 24h…"). |
| Hub passes | Chip flips `Minting NFT…` → `NFT #n · tap to view` (opens tonviewer testnet). |
| Tuesday → Ready → Lobby → **Burn & ready** | Copy warns the burn is irreversible; wallet asks to sign a 0.05 TON transfer; lobby shows "Pass NFT burned on TON". Item owner on tonviewer = `EQAAAA…AM9c`. |
| Leave lobby after on-chain burn | Pass stays burned (spec: no refund after burn; UI warned). |
| Buy a pass on Getgems testnet with a second wallet | Hub → **Import** on that account re-homes the pass row after on-chain owner check. |
| Sunday winner | Champion dashboard shows champion NFT `Minted · UQ…` with **View**; billboard creative / transfer use in-app inputs. |
| Monday winner never links | After `wallet_link_deadline_hours` (24) the pass shows **Forfeited** (`status = expired`). |

Ops sanity: `npm run ton:collection-info -- <index>` prints owner + metadata URL
for any item; `/healthz` on the race server reports `nftMinter`.

---

## Trust boundaries (unchanged from the plan)

- The client never decides ownership: `link-wallet` verifies `ton_proof`
  against the wallet's public key (from `get_public_key` or the state init that
  hashes to the address); `pass-burn` reads `get_nft_data` and refuses anything
  not minted by our collection (`get_nft_address_by_index` check).
- Only the race server holds the treasury mnemonic. Edge functions only read.
- `link_wallet` (unverified RPC) works solely while `game_config.dev_mode` is
  true — that is the playtest mock wallet.
