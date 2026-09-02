# Deploy BugEaters (production playtest)

Stack:
- **Race server:** Fly.io (Docker) — or Colyseus Cloud once account is paid
- **Mini App client:** Cloudflare Pages
- **Lobby / auth:** Supabase (unchanged)

## 1. Race server on Fly.io (~$5–15/mo)

### One-time on this PC

```powershell
# Install CLI if missing: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
cd D:\BE
fly apps create bugeaters-race --org personal
```

Generate a secret (keep it):

```powershell
# PowerShell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Set secrets (playtest keeps `/dev/ticket`):

```powershell
fly secrets set RACE_TOKEN_SECRET="PASTE_SECRET_HERE" RACE_DEV_MODE=1 WEB_ORIGIN="*"
fly deploy
```

Health check:

```text
https://bugeaters-race.fly.dev/healthz
```

WebSocket URL for the client:

```text
wss://bugeaters-race.fly.dev
```

## 2. Mini App on Cloudflare Pages ($0)

```powershell
cd D:\BE
npx wrangler login
```

Build with the Fly race URL:

```powershell
# .env.production.local (do not commit secrets you care about)
@"
VITE_RACE_SERVER_URL=wss://bugeaters-race.fly.dev
VITE_RACE_DEV_MODE=true
VITE_ALLOW_DEV_SESSION=true
"@ | Set-Content .env.production.local

npm run build
npx wrangler pages deploy dist --project-name bugeaters
```

Copy the `*.pages.dev` URL Wrangler prints.

## 3. BotFather

1. [@BotFather](https://t.me/BotFather) → your bot → Menu Button / Web App  
2. Paste the Cloudflare Pages URL  
3. On phone: open bot → Play → Testing

## 4. After every Fly deploy

```powershell
fly scale count 1 -a bugeaters-race
fly status -a bugeaters-race
```

Confirm **Machines = 1**. Two machines break joins (in-memory rooms + tickets).

Smoke (unit + optional live ticket check):

```powershell
node scripts/auth-race-smoke.mjs
$env:RACE_SMOKE_URL="https://bugeaters-race.fly.dev"; node scripts/auth-race-smoke.mjs
```

## 4b. TON pass NFTs (testnet)

Wallet link, pass mint, burn-to-enter and the champion token are wired end to
end; they stay dormant until the secrets exist. Follow
[`TON_TESTNET_RUNBOOK.md`](./TON_TESTNET_RUNBOOK.md): deploy the collection
(`npm run ton:deploy-collection`), set the Fly minter secrets
(`TON_TREASURY_MNEMONIC`, `NFT_COLLECTION_ADDRESS`, `NFT_META_BASE_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), the Supabase function secrets,
the Pages `VITE_TONCONNECT_*` vars, then flip `game_config.pass_required_onchain`.
The minter runs inside the race server — another reason to keep **1 machine**.

## 5. Redis later (multi-machine)

Not wired yet. When you need >1 Fly machine:

1. Add a Fly Redis / Upstash instance
2. Point Colyseus presence + driver at Redis (shared room registry)
3. Store `/dev/ticket` room params in Redis (or disable `/dev/ticket` in prod)
4. Then `fly scale count 2` is safe

Until then keep **exactly one** machine.

## 6. Optional: Colyseus Cloud instead of Fly

Requires paid account (from $15/mo), then:

```powershell
npm run build:race-server
npx @colyseus/cloud deploy
```

Server already uses `defineServer` + `ecosystem.config.cjs`. Set the same env vars in the Colyseus Cloud dashboard, then rebuild the client with that `wss://` URL.
