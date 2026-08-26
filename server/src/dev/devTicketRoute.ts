/**
 * Local playtest ticket minting.
 *
 * When `RACE_DEV_MODE=1`, the race server exposes `POST /dev/ticket` so you can
 * race without wiring Supabase Edge Function secrets first. NEVER enable this
 * in production — it lets anyone mint a valid race ticket.
 *
 * Tickets for the SAME lobby `roomId` share a 15s join window. Each wave gets
 * its own Colyseus room so rematch after death cannot rejoin a leftover race.
 * Seats follow the real track layout:
 *   Bug   → left  main lane (sub-lanes 0–2)
 *   Human → middle main lane (sub-lanes 3–5)
 *   Klaus → right main lane (sub-lanes 6–8)
 */
import type { Application, Request, Response } from 'express';
import { mintRaceTicket, type RaceTicketClaims } from '../admission/auth.js';
import { clampRoomCapacity, type RaceConfig } from '../config/raceConfig.js';
import type { PlayerRole } from '../domain/types.js';

/** Fixed practice seats: one per species, center sub-lane of each main lane. */
const PRACTICE_SEATS: ReadonlyArray<{ role: PlayerRole; lane: number }> = [
  { role: 'bug', lane: 1 }, // left main lane center
  { role: 'human', lane: 4 }, // middle main lane center
  { role: 'klaus', lane: 7 }, // right main lane center
];

/** How long two phones have to tap Testing / Practice again and still meet. */
export const PLAYTEST_JOIN_WAIT_MS = 15_000;

/** Shared immutable race params for a local lobby id. */
export interface DevRoomParams {
  seed: number;
  startsAtMs: number;
  maxPlayers: number;
  /** userId → seat index into PRACTICE_SEATS */
  seats: Map<string, number>;
  /** Colyseus roomKey for this wave — unique so rematch never hits a leftover live room. */
  raceRoomId: string;
}

/** roomId → first-joiner params (cleared after the planned race window ends). */
const roomParams = new Map<string, DevRoomParams>();

export interface DevTicketBody {
  roomId?: string;
  userId?: string;
  role?: PlayerRole;
  globalSubLane?: number;
  startsAtMs?: number;
  seed?: number;
  maxPlayers?: number;
}

export function isDevModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.RACE_DEV_MODE?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/** Dev-only ticket lifetime (10 min) — generous for manual playtesting. */
const DEV_TICKET_TTL_MS = 10 * 60 * 1000;

export function mountDevTicketRoute(
  app: Application,
  options: { secret: string; config: RaceConfig },
): void {
  if (!isDevModeEnabled()) {
    return;
  }
  if (!options.secret) {
    console.warn('[dev] RACE_DEV_MODE is on but RACE_TOKEN_SECRET is empty — /dev/ticket disabled');
    return;
  }

  app.post('/dev/ticket', (request: Request, response: Response) => {
    try {
      const body = (request.body ?? {}) as DevTicketBody;
      const roomId = body.roomId?.trim() || `local-${Date.now()}`;
      const userId = body.userId?.trim() || `dev-${crypto.randomUUID()}`;
      const shared = getOrCreateRoomParams(roomId, body, options.config);
      const seat = assignPracticeSeat(shared, userId, body.role);

      const claims: Omit<RaceTicketClaims, 'exp'> = {
        roomId: shared.raceRoomId,
        userId,
        role: seat.role,
        globalSubLane: seat.lane,
        startsAtMs: shared.startsAtMs,
        seed: shared.seed,
        maxPlayers: shared.maxPlayers,
      };
      // Dev tickets are long-lived so a tab left on the lobby (or reloaded)
      // during hand-playtesting doesn't get rejected. Production tickets are
      // minted by the Supabase edge function with the short default TTL.
      const exp = Date.now() + DEV_TICKET_TTL_MS;
      const token = mintRaceTicket({ ...claims, exp }, options.secret);
      response.status(200).json({
        token,
        claims: { ...claims, exp },
        expiresAtMs: exp,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ticket mint failed';
      response.status(400).json({ error: message });
    }
  });

  console.info('[dev] POST /dev/ticket enabled (RACE_DEV_MODE) — do not use in production');
}

/**
 * First ticket for a lobby id defines seed / start / capacity. Later tickets
 * for the same lobby reuse those values so two phones stay in sync.
 *
 * Wave reuse rules:
 *   - During the join window (before `startsAtMs`, default 15s) any new ticket
 *     lands in the SAME wave — time for a remote friend to tap Testing.
 *   - Once the race has started, the next ticket mints a FRESH wave with its
 *     own Colyseus room. Reusing a live race is what dumped "Practice again"
 *     back into a leftover timer after death.
 *   - Same userId may reconnect to their wave through the race + a short grace
 *     (page reload). Practice again / Testing mint a new userId, so they get
 *     the new wave instead.
 */
export function getOrCreateRoomParams(
  roomId: string,
  body: DevTicketBody,
  config: RaceConfig,
  now = Date.now(),
): DevRoomParams {
  const existing = roomParams.get(roomId);
  if (existing) {
    const userId = body.userId?.trim();
    const alreadySeated = userId ? existing.seats.has(userId) : false;
    const joinWindowOpen = now < existing.startsAtMs;
    const reconnectGrace = now < existing.startsAtMs + config.raceDurationMs + 15_000;
    if (joinWindowOpen || (alreadySeated && reconnectGrace)) {
      return existing;
    }
  }

  const startsAtMs =
    typeof body.startsAtMs === 'number' && Number.isFinite(body.startsAtMs) && body.startsAtMs > now + 2_000
      ? body.startsAtMs
      : now + PLAYTEST_JOIN_WAIT_MS;
  const seed =
    typeof body.seed === 'number' && Number.isFinite(body.seed)
      ? body.seed >>> 0
      : (Math.random() * 0xffffffff) >>> 0;
  const maxPlayers = clampRoomCapacity(
    typeof body.maxPlayers === 'number' ? body.maxPlayers : config.defaultPlayers,
    config,
  );

  const created: DevRoomParams = {
    seed,
    startsAtMs,
    maxPlayers,
    seats: new Map(),
    raceRoomId: `${roomId}-w${startsAtMs.toString(36)}-${(seed >>> 0).toString(36)}`,
  };
  roomParams.set(roomId, created);
  return created;
}

export function resetDevRoomParamsForTests(): void {
  roomParams.clear();
}

/**
 * Assigns Bug (left) / Human (middle) / Klaus (right) seats in join order.
 * Rejoining the same userId keeps their previous seat.
 */
function assignPracticeSeat(
  room: DevRoomParams,
  userId: string,
  preferredRole?: PlayerRole,
): { role: PlayerRole; lane: number } {
  const existing = room.seats.get(userId);
  if (existing !== undefined) {
    return PRACTICE_SEATS[existing]!;
  }

  const taken = new Set(room.seats.values());
  if (preferredRole && ROLES.includes(preferredRole)) {
    const preferredIndex = PRACTICE_SEATS.findIndex((s) => s.role === preferredRole);
    if (preferredIndex >= 0 && !taken.has(preferredIndex)) {
      room.seats.set(userId, preferredIndex);
      return PRACTICE_SEATS[preferredIndex]!;
    }
  }

  for (let i = 0; i < PRACTICE_SEATS.length; i++) {
    if (!taken.has(i)) {
      room.seats.set(userId, i);
      return PRACTICE_SEATS[i]!;
    }
  }

  // Room already has Bug/Human/Klaus — spill into next free sub-lane of Human.
  const overflowLane = 3 + (room.seats.size % 3);
  room.seats.set(userId, 1); // track as human seat for bookkeeping
  return { role: 'human', lane: overflowLane };
}

const ROLES: PlayerRole[] = ['bug', 'human', 'klaus'];
