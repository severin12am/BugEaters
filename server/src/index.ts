/**
 * =============================================================================
 * Entrypoint — boots the authoritative race server.
 * =============================================================================
 *
 * Uses Colyseus `defineServer` + `listen` so the same binary runs:
 *   - locally (`npm run race-server`)
 *   - on Colyseus Cloud (unix socket when COLYSEUS_CLOUD is set)
 *   - in Docker / Fly.io (TCP PORT)
 */
import './runtime/loadEnv.bootstrap.js';

import cors from 'cors';
import express from 'express';
import { defineRoom, defineServer, listen } from 'colyseus';
import { RaceRoom } from './net/RaceRoom.js';
import { getServerContext } from './runtime/serverContext.js';
import { isDevModeEnabled, mountDevTicketRoute } from './dev/devTicketRoute.js';

const ctx = getServerContext();

const gameServer = defineServer({
  rooms: {
    race: defineRoom(RaceRoom).filterBy(['roomKey']),
  },
  express: (app) => {
    app.use(cors({ origin: process.env.WEB_ORIGIN?.split(',') ?? true }));
    app.use(express.json({ limit: '32kb' }));

    app.get('/healthz', (_request, response) => {
      response.status(200).json({
        ok: true,
        service: 'bugeaters-race-server',
        rooms: { min: ctx.config.minPlayers, max: ctx.config.maxPlayers },
        devMode: isDevModeEnabled(),
      });
    });

    // Local / playtest only — mints signed tickets without Supabase.
    // Keep RACE_DEV_MODE=1 on the host until race-ticket Edge Function is wired.
    mountDevTicketRoute(app, { secret: ctx.ticketSecret, config: ctx.config });
  },
});

const port = Number(process.env.PORT ?? 2567);
await listen(gameServer, port);

console.info(
  `[race-server] listening on :${port} — rooms ${ctx.config.minPlayers}..${ctx.config.maxPlayers} players, ` +
    `${ctx.postRaceHooks.size} post-race hook(s) registered` +
    (isDevModeEnabled() ? ', DEV MODE ON' : ''),
);
