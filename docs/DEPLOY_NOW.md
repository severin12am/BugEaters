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
3. On phone: open bot → Play → Solo practice or Local multiplayer race

## 4. Optional: Colyseus Cloud instead of Fly

Requires paid account (from $15/mo), then:

```powershell
npm run build:race-server
npx @colyseus/cloud deploy
```

Server already uses `defineServer` + `ecosystem.config.cjs`. Set the same env vars in the Colyseus Cloud dashboard, then rebuild the client with that `wss://` URL.
