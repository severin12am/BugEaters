/**
 * =============================================================================
 * Admission: ticket verification.
 * =============================================================================
 *
 * The game server does NOT do matchmaking, auth, or payments — Supabase does.
 * Instead, when a client wants to join a race it first asks Supabase for a
 * short-lived, HMAC-signed "race ticket" (see supabase/functions/race-ticket).
 * The client then presents that ticket here. This module verifies it.
 *
 * This is the trust boundary: past this point the server treats the claims as
 * true and simulates accordingly. The secret (`RACE_TOKEN_SECRET`) must be
 * identical on the race server and in the Supabase Edge Function.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PlayerRole } from '../domain/types.js';

/** The verified contents of a race ticket. Mirrors supabase/functions/race-ticket. */
export interface RaceTicketClaims {
  /** The room this ticket admits the holder to. */
  readonly roomId: string;
  /** The authenticated Supabase user id. */
  readonly userId: string;
  /** GAME-SPECIFIC role assigned by the lobby. */
  readonly role: PlayerRole;
  /** Global sub-lane assigned at matchmaking time. */
  readonly globalSubLane: number;
  /** When racing begins (absolute ms). */
  readonly startsAtMs: number;
  /** Shared deterministic world seed. */
  readonly seed: number;
  /** Room capacity chosen by the lobby (clamped into 3..12 by the server). */
  readonly maxPlayers: number;
  /** Ticket expiry (absolute ms). */
  readonly exp: number;
}

/** Fields required to mint a ticket (expiry is added automatically). */
export type RaceTicketMintInput = Omit<RaceTicketClaims, 'exp'> & {
  /** Absolute expiry ms. Defaults to now + 90s. */
  readonly exp?: number;
};

/**
 * Mints a signed race ticket. Used by the Supabase Edge Function in production
 * and by the local `/dev/ticket` endpoint during playtesting.
 */
export function mintRaceTicket(claims: RaceTicketMintInput, secret: string): string {
  const full: RaceTicketClaims = {
    roomId: claims.roomId,
    userId: claims.userId,
    role: claims.role,
    globalSubLane: claims.globalSubLane,
    startsAtMs: claims.startsAtMs,
    seed: claims.seed,
    maxPlayers: claims.maxPlayers,
    exp: claims.exp ?? Date.now() + 90_000,
  };
  const payload = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Verifies a `payload.signature` ticket and returns its claims. Throws on any
 * tampering, expiry, or missing fields. Never trust a ticket that does not pass
 * through here.
 */
export function verifyRaceTicket(token: string, secret: string): RaceTicketClaims {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw new Error('malformed race ticket');
  }
  const expected = sign(payload, secret);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new Error('invalid race ticket signature');
  }

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RaceTicketClaims;
  if (!claims.exp || Date.now() >= claims.exp) {
    throw new Error('expired race ticket');
  }
  if (!claims.roomId || !claims.userId || !Number.isInteger(claims.globalSubLane)) {
    throw new Error('invalid race ticket claims');
  }
  return claims;
}

function sign(payload: string, secret: string): string {
  if (!secret) {
    throw new Error('RACE_TOKEN_SECRET is required to verify tickets');
  }
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
