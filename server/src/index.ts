/**
 * =============================================================================
 * Entrypoint — boots the authoritative race server.
 * =============================================================================
 */
import './runtime/loadEnv.bootstrap.js';

import cors from 'cors';
import express from 'express';
import { Server } from 'colyseus';
import { RaceRoom } from './net/RaceRoom.js';
import { getServerContext } from './runtime/serverContext.js';
import { isDevModeEnabled, mountDevTicketRoute } from './dev/devTicketRoute.js';

const ctx = getServerContext();
const port = Number(process.env.PORT ?? 2567);

const gameServer = new Server({
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

    // Local playtest only — mints signed tickets without Supabase.
    mountDevTicketRoute(app, { secret: ctx.ticketSecret, config: ctx.config });
  },
});

gameServer.define('race', RaceRoom).filterBy(['roomKey']);

await gameServer.listen(port);
console.info(
  `[race-server] listening on :${port} — rooms ${ctx.config.minPlayers}..${ctx.config.maxPlayers} players, ` +
    `${ctx.postRaceHooks.size} post-race hook(s) registered` +
    (isDevModeEnabled() ? ', DEV MODE ON' : ''),
);
