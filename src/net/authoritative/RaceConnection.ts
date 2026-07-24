/**
 * =============================================================================
 * RaceConnection — the raw transport to the authoritative race server.
 * =============================================================================
 *
 * Responsibilities (only transport, no game logic):
 *   1. Obtain a signed race ticket (Supabase in production, /dev/ticket locally).
 *   2. Join the Colyseus race room with that ticket.
 *   3. Forward server messages to callbacks and send player inputs.
 */
import { Client, type Room } from '@colyseus/sdk';
import { ensureSession } from '../auth';
import { getSupabase } from '../supabaseClient';
import {
  isRaceDevMode,
  raceServerHttpBase,
  RACE_SERVER_URL,
} from './env';
import {
  CHANNEL,
  type AbilityMessage,
  type EliminationMessage,
  type FinalMessage,
  type PlayerInput,
  type SnapshotMessage,
} from './protocol';

export interface DevTicketOptions {
  readonly userId?: string;
  readonly role?: 'bug' | 'human' | 'klaus';
  readonly globalSubLane?: number;
  readonly startsAtMs?: number;
  readonly seed?: number;
  readonly maxPlayers?: number;
  /** Prefetched ticket — skips /dev/ticket when already minted (e.g. DevSession). */
  readonly token?: string;
  readonly claims?: {
    userId?: string;
    role?: string;
    globalSubLane?: number;
    startsAtMs?: number;
    seed?: number;
  };
}

export interface RaceConnectionHandlers {
  onSnapshot: (snapshot: SnapshotMessage) => void;
  onAbility?: (event: AbilityMessage) => void;
  onElimination?: (event: EliminationMessage) => void;
  onFinal?: (event: FinalMessage) => void;
  onError?: (error: unknown) => void;
  onLeave?: (code: number) => void;
}

/** Ticket claims returned after a successful join (useful for syncing the clock). */
export interface JoinedRaceInfo {
  userId: string;
  role?: 'bug' | 'human' | 'klaus';
  startsAtMs?: number;
  seed?: number;
  globalSubLane?: number;
}

export class RaceConnection {
  private room: Room | null = null;
  private joinedUserId: string | null = null;
  private joinedInfo: JoinedRaceInfo | null = null;

  constructor(private readonly serverUrl = RACE_SERVER_URL || undefined) {}

  /** True only when a race-server URL has been configured. */
  isConfigured(): boolean {
    return Boolean(this.serverUrl);
  }

  getJoinedUserId(): string | null {
    return this.joinedUserId;
  }

  getJoinedInfo(): JoinedRaceInfo | null {
    return this.joinedInfo;
  }

  /**
   * Fetches a ticket, then joins the room. In `VITE_RACE_DEV_MODE` the ticket
   * comes from the race server itself; otherwise from Supabase `race-ticket`.
   */
  async join(
    roomId: string,
    handlers: RaceConnectionHandlers,
    devOptions: DevTicketOptions = {},
  ): Promise<void> {
    if (!this.serverUrl) {
      throw new Error('VITE_RACE_SERVER_URL is not configured');
    }

    const ticket = isRaceDevMode
      ? devOptions.token
        ? {
            token: devOptions.token,
            userId: devOptions.claims?.userId ?? devOptions.userId ?? `dev-${crypto.randomUUID()}`,
            claims: devOptions.claims as Record<string, unknown> | undefined,
          }
        : await this.fetchDevTicket(roomId, devOptions)
      : await this.fetchSupabaseTicket(roomId);

    this.joinedUserId = ticket.userId;
    const claims = ticket.claims as
      | {
          userId?: string;
          role?: 'bug' | 'human' | 'klaus';
          startsAtMs?: number;
          seed?: number;
          globalSubLane?: number;
        }
      | undefined;
    this.joinedInfo = {
      userId: ticket.userId,
      role: claims?.role,
      startsAtMs: typeof claims?.startsAtMs === 'number' ? claims.startsAtMs : undefined,
      seed: typeof claims?.seed === 'number' ? claims.seed : undefined,
      globalSubLane: typeof claims?.globalSubLane === 'number' ? claims.globalSubLane : undefined,
    };

    const client = new Client(this.serverUrl);
    this.room = await client.joinOrCreate('race', {
      token: ticket.token,
      roomKey: roomId,
    });

    this.room.onMessage(CHANNEL.Snapshot, handlers.onSnapshot);
    if (handlers.onAbility) {
      this.room.onMessage(CHANNEL.Ability, handlers.onAbility);
    }
    if (handlers.onElimination) {
      this.room.onMessage(CHANNEL.Elimination, handlers.onElimination);
    }
    if (handlers.onFinal) {
      this.room.onMessage(CHANNEL.Final, handlers.onFinal);
    }
    this.room.onError((code, message) => handlers.onError?.(new Error(`${code}: ${message ?? ''}`)));
    this.room.onLeave((code) => handlers.onLeave?.(code));
  }

  sendInput(input: PlayerInput): void {
    this.room?.send(CHANNEL.Input, input);
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  leave(): void {
    this.room?.leave();
    this.room = null;
    this.joinedUserId = null;
    this.joinedInfo = null;
  }

  private async fetchSupabaseTicket(
    roomId: string,
  ): Promise<{ token: string; userId: string; claims?: Record<string, unknown> }> {
    const auth = await ensureSession();
    if (!auth.session || !auth.userId) {
      throw new Error('sign in is required to join a race');
    }
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error('Supabase is not configured');
    }
    const { data, error } = await supabase.functions.invoke('race-ticket', {
      body: { roomId },
    });
    if (error || !data?.token) {
      throw new Error(error?.message ?? 'could not obtain a race ticket');
    }
    return { token: data.token as string, userId: auth.userId };
  }

  private async fetchDevTicket(
    roomId: string,
    options: DevTicketOptions,
  ): Promise<{ token: string; userId: string; claims?: Record<string, unknown> }> {
    const base = raceServerHttpBase(this.serverUrl);
    const userId = options.userId ?? `dev-${crypto.randomUUID()}`;
    const body: Record<string, unknown> = {
      roomId,
      userId,
      maxPlayers: options.maxPlayers ?? 6,
    };
    // Do NOT default role to human — that made every tab fight for the middle
    // lane while sprites still showed Human. Omit role so /dev/ticket assigns
    // Bug (left) → Human (mid) → Klaus (right) in join order.
    if (options.role) {
      body.role = options.role;
    }
    // Only send these when the client has real values — otherwise the race
    // server assigns shared seed/start for the roomId (multi-tab sync).
    if (typeof options.globalSubLane === 'number' && options.globalSubLane >= 0) {
      body.globalSubLane = options.globalSubLane;
    }
    if (typeof options.startsAtMs === 'number' && options.startsAtMs > Date.now()) {
      body.startsAtMs = options.startsAtMs;
    }
    if (typeof options.seed === 'number' && options.seed > 0) {
      body.seed = options.seed;
    }

    const response = await fetch(`${base}/dev/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`dev ticket failed: ${await response.text()}`);
    }
    const data = (await response.json()) as {
      token?: string;
      claims?: { userId?: string; startsAtMs?: number; seed?: number; globalSubLane?: number };
    };
    if (!data.token) {
      throw new Error('dev ticket response missing token');
    }
    return {
      token: data.token,
      userId: data.claims?.userId ?? userId,
      claims: data.claims as Record<string, unknown> | undefined,
    };
  }
}
