# Authoritative Race Server

The web client and Supabase handle tournament entry. The dedicated Colyseus
service owns live race state: clock, inputs, hazards, eliminations, and final
standings.

> **Architecture:** this file covers deployment/ops only. For how the system is
> designed (modules, data flow, rooms, inputs→outcomes, extension points) see
> [`multiplayer/ARCHITECTURE.md`](./multiplayer/ARCHITECTURE.md) and the other
> docs in [`multiplayer/`](./multiplayer/). New tuning knobs
> (`RACE_MIN_PLAYERS`, `RACE_MAX_PLAYERS`, `RACE_DURATION_MS`, …) are documented
> in `server/.env.example` and `server/src/config/raceConfig.ts`.

## Required production environment

Set these values on the race-server host:

```text
PORT=2567
WEB_ORIGIN=https://<your Telegram web app host>
SUPABASE_URL=https://atbchikslcorzxrupwhy.supabase.co
RACE_TOKEN_SECRET=<shared secret>
```

`RACE_TOKEN_SECRET` must be identical on the race server and in Supabase Edge
Function secrets. Rotate it before first production deployment, then redeploy
`race-ticket` and `race-results`.

## Run locally

```powershell
npm run race-server
```

Health check:

```text
GET /healthz
```

## Container deployment

```powershell
docker compose -f docker-compose.race.yml up --build
```

Expose the service through TLS WebSockets (`wss://`) and set the resulting URL
as `VITE_RACE_SERVER_URL` for the Vite client.

## Release gate

Do not set `VITE_RACE_SERVER_URL` in production until the Phaser authoritative
snapshot renderer is enabled and the server simulation covers every gameplay
rule. Until then, the current client uses its legacy Supabase realtime fallback.
