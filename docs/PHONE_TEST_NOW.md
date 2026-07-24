# Phone test (Telegram) — active session

## Game URL (paste into BotFather → Bot Settings → Menu Button → Configure menu button → Web App)

```
https://e9e2ad0abdcbf0.lhr.life
```

With `VITE_ALLOW_DEV_SESSION=true` in the build, the app opens a **week + day picker**.  
Use a new sandbox week to re-test Monday. Legacy: `?tournamentDay=monday` still works.

## BotFather (one time per ngrok URL)

1. Open [@BotFather](https://t.me/BotFather)
2. `/mybots` → your bot → **Bot Settings** → **Menu Button** → **Configure menu button**
3. Paste the URL above → save

Or set **Web App** URL the same way if your bot uses that instead of menu button.

## On your phone

1. Open your bot in Telegram
2. Tap the menu / Play button
3. Game loads — Week hub, register, race

## Keep running on PC

These two must stay open (already started):

- `vite preview` on port **4173**
- `ngrok http 4173`

If you close the PC or restart ngrok, the URL **changes** — update BotFather again.

## Supabase secrets (required for real Telegram login)

Dashboard → Project → Edge Functions → Secrets:

- `TELEGRAM_BOT_TOKEN` = token from BotFather

Without it, auth may fail on phone.

## After testing

For a **permanent** URL (no PC, no ngrok), deploy `dist/` to Vercel/Cloudflare and point the bot there.
