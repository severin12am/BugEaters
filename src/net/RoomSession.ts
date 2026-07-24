import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ensureSession } from './auth';
import { getSupabase } from './supabaseClient';
import type {
  DilemmaChoiceEvent,
  DilemmaStartEvent,
  EatClaim,
  EliminationEvent,
  NpcEatEvent,
  PlayerSnapshot,
  RoomInfo,
  RoomMember,
  Standing,
} from './types';
import { getDevOverrideParam } from '../tournament/weekClock';
import type { CharacterType } from '../utils/constants';
import type { RaceRoomPhase } from '../config/multiplayer';

type MembersHandler = (members: RoomMember[]) => void;
type SnapshotHandler = (snapshot: PlayerSnapshot) => void;
type EliminationHandler = (event: EliminationEvent) => void;
type PhaseHandler = (phase: RaceRoomPhase) => void;
type StartsAtHandler = (startsAtMs: number | null) => void;
type DilemmaStartHandler = (event: DilemmaStartEvent) => void;
type DilemmaChoiceHandler = (event: DilemmaChoiceEvent) => void;
type NpcEatHandler = (event: NpcEatEvent) => void;
type AbilityHandler = (event: { actorId: string; abilityId: string; playerMainLane: number }) => void;

/**
 * One live race room over a single Supabase Realtime channel:
 * - Presence: who is in the room (lobby roster).
 * - Broadcast: ~10-12Hz player movement snapshots + lightweight game events.
 * - Postgres changes: authoritative race_events (eliminations) + room phase.
 *
 * All networking for a race funnels through here; the rest of the game talks to
 * it via small typed callbacks.
 */
export class RoomSession {
  private readonly supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private info: RoomInfo | null = null;
  private username: string | null = null;
  private joinErrorCode: string | null = null;
  /** Local clock minus server clock, measured at join. */
  private clockOffsetMs = 0;
  private selfReady = false;

  private membersHandler: MembersHandler | null = null;
  private startsAtHandler: StartsAtHandler | null = null;
  private snapshotHandler: SnapshotHandler | null = null;
  private eliminationHandler: EliminationHandler | null = null;
  private phaseHandler: PhaseHandler | null = null;
  private dilemmaStartHandler: DilemmaStartHandler | null = null;
  private dilemmaChoiceHandler: DilemmaChoiceHandler | null = null;
  private npcEatHandler: NpcEatHandler | null = null;
  private abilityHandler: AbilityHandler | null = null;

  private constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /** Returns a session only when Supabase is configured; null = solo mode. */
  static tryCreate(): RoomSession | null {
    const supabase = getSupabase();
    return supabase ? new RoomSession(supabase) : null;
  }

  getRoomInfo(): RoomInfo | null {
    return this.info;
  }

  getJoinErrorCode(): string | null {
    return this.joinErrorCode;
  }

  /**
   * Authenticates, matchmakes into a room, and subscribes to its channel.
   * Returns the room info (seed, synchronized start, assigned slot).
   */
  async join(characterType: CharacterType): Promise<RoomInfo | null> {
    const auth = await ensureSession();
    if (!auth.session || !auth.userId) {
      return null;
    }
    this.username = auth.username;
    this.joinErrorCode = null;

    const { data, error } = await this.supabase.functions.invoke('join-room', {
      body: {
        characterType,
        override: getDevOverrideParam(),
      },
    });
    if (error || !data?.roomId) {
      this.joinErrorCode = (data?.code as string | undefined) ?? (data?.error as string | undefined) ?? error?.message ?? null;
      console.warn('[room] join failed', this.joinErrorCode ?? 'no room');
      return null;
    }

    // Convert the server start time into the client's clock using the offset
    // measured from the response (serverNow vs local now).
    const serverNowMs = data.serverNow ? new Date(data.serverNow).getTime() : Date.now();
    const startsAtServerMs = data.startsAt ? new Date(data.startsAt).getTime() : null;
    const offset = Date.now() - serverNowMs;
    this.clockOffsetMs = offset;
    const startsAtMs = startsAtServerMs !== null ? startsAtServerMs + offset : null;

    this.info = {
      roomId: data.roomId,
      seed: Number(data.seed) >>> 0,
      startsAtMs,
      phase: data.phase as RaceRoomPhase,
      self: { characterType, globalSubLane: data.globalSubLane },
      userId: auth.userId,
    };

    await this.subscribe();
    return this.info;
  }

  private async subscribe(): Promise<void> {
    if (!this.info) {
      return;
    }
    const { roomId, userId } = this.info;

    this.channel = this.supabase.channel(`room:${roomId}`, {
      config: {
        presence: { key: userId },
        broadcast: { self: false },
      },
    });

    this.channel
      .on('presence', { event: 'sync' }, () => this.emitMembers())
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (this.snapshotHandler && payload?.userId && payload.userId !== userId) {
          this.snapshotHandler(payload as PlayerSnapshot);
        }
      })
      .on('broadcast', { event: 'dilemma:start' }, ({ payload }) => {
        if (
          this.dilemmaStartHandler &&
          payload?.encounterId &&
          payload?.initiatorId &&
          payload?.targetId
        ) {
          this.dilemmaStartHandler(payload as DilemmaStartEvent);
        }
      })
      .on('broadcast', { event: 'dilemma:choice' }, ({ payload }) => {
        if (
          this.dilemmaChoiceHandler &&
          payload?.encounterId &&
          payload?.userId &&
          (payload?.choice === 'cooperate' || payload?.choice === 'eat')
        ) {
          this.dilemmaChoiceHandler(payload as DilemmaChoiceEvent);
        }
      })
      .on('broadcast', { event: 'npc:eat' }, ({ payload }) => {
        if (
          this.npcEatHandler &&
          payload?.eaterId &&
          typeof payload?.globalSubLane === 'number'
        ) {
          this.npcEatHandler(payload as NpcEatEvent);
        }
      })
      .on('broadcast', { event: 'ability:activate' }, ({ payload }) => {
        if (
          this.abilityHandler &&
          payload?.actorId &&
          typeof payload?.abilityId === 'string' &&
          typeof payload?.playerMainLane === 'number'
        ) {
          this.abilityHandler(payload as { actorId: string; abilityId: string; playerMainLane: number });
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'race_events', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as {
            type: string;
            actor_id: string | null;
            target_id: string | null;
            race_time_ms: number | null;
          };
          if (row.type === 'elimination' && this.eliminationHandler) {
            this.eliminationHandler({
              actorId: row.actor_id,
              targetId: row.target_id,
              raceTimeMs: row.race_time_ms,
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { phase: RaceRoomPhase; starts_at: string | null };
          if (this.info) {
            this.info.phase = row.phase;
            if (row.starts_at) {
              this.info.startsAtMs = new Date(row.starts_at).getTime() + this.clockOffsetMs;
              this.startsAtHandler?.(this.info.startsAtMs);
            }
          }
          this.phaseHandler?.(row.phase);
        },
      );

    await new Promise<void>((resolve) => {
      this.channel!.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void this.channel!.track({
            userId,
            username: this.username,
            characterType: this.info!.self.characterType,
            globalSubLane: this.info!.self.globalSubLane,
          });
          resolve();
        }
      });
    });
  }

  private emitMembers(): void {
    const members = this.getPresentMembers();
    this.membersHandler?.(members);
  }

  /** Presence roster (sync, available once subscribed). */
  getPresentMembers(): RoomMember[] {
    if (!this.channel) {
      return [];
    }
    const state = this.channel.presenceState<{
      userId: string;
      username: string | null;
      characterType: CharacterType;
      globalSubLane: number;
      ready?: boolean;
    }>();

    const members: RoomMember[] = [];
    for (const key of Object.keys(state)) {
      const entry = state[key][0];
      if (entry) {
        members.push({
          userId: entry.userId,
          username: entry.username ?? null,
          characterType: entry.characterType,
          globalSubLane: entry.globalSubLane,
          ready: entry.ready ?? false,
        });
      }
    }
    return members;
  }

  /** Authoritative roster from the database (includes members not yet on presence). */
  async fetchMembers(): Promise<RoomMember[]> {
    if (!this.info) {
      return [];
    }
    const { data } = await this.supabase
      .from('room_members')
      .select('user_id, character_type, global_sub_lane')
      .eq('room_id', this.info.roomId);
    if (!data) {
      return [];
    }
    return data.map((row) => ({
      userId: row.user_id as string,
      username: null,
      characterType: row.character_type as CharacterType,
      globalSubLane: row.global_sub_lane as number,
    }));
  }

  onMembers(handler: MembersHandler): void {
    this.membersHandler = handler;
    this.emitMembers();
  }

  onSnapshot(handler: SnapshotHandler): void {
    this.snapshotHandler = handler;
  }

  onElimination(handler: EliminationHandler): void {
    this.eliminationHandler = handler;
  }

  onPhase(handler: PhaseHandler): void {
    this.phaseHandler = handler;
  }

  /** Fired when the server moves the room's start time (e.g. all-ready fast start). */
  onStartsAt(handler: StartsAtHandler): void {
    this.startsAtHandler = handler;
  }

  isSelfReady(): boolean {
    return this.selfReady;
  }

  /**
   * Marks self ready. When every member is ready the server pulls the start
   * forward to a short countdown; the new starts_at streams back via the
   * rooms UPDATE subscription (and is also applied from the RPC response).
   */
  async tapReady(): Promise<boolean> {
    if (!this.info || this.selfReady) {
      return this.selfReady;
    }

    const { data, error } = await this.supabase.rpc('tap_room_ready', {
      p_room_id: this.info.roomId,
    });
    if (error) {
      console.warn('[room] tap_room_ready failed', error.message);
      return false;
    }
    this.selfReady = true;
    void this.channel?.track({
      userId: this.info.userId,
      username: this.username,
      characterType: this.info.self.characterType,
      globalSubLane: this.info.self.globalSubLane,
      ready: true,
    });
    const startsAt = data?.starts_at as string | undefined;
    if (startsAt && this.info) {
      this.info.startsAtMs = new Date(startsAt).getTime() + this.clockOffsetMs;
      this.startsAtHandler?.(this.info.startsAtMs);
    }
    return true;
  }

  onDilemmaStart(handler: DilemmaStartHandler): void {
    this.dilemmaStartHandler = handler;
  }

  onDilemmaChoice(handler: DilemmaChoiceHandler): void {
    this.dilemmaChoiceHandler = handler;
  }

  /** Fired when any peer eats an NPC bot (`npc:eat` broadcast). */
  onNpcEat(handler: NpcEatHandler): void {
    this.npcEatHandler = handler;
  }

  onAbility(handler: AbilityHandler): void {
    this.abilityHandler = handler;
  }

  /** Fire-and-forget movement broadcast. */
  sendSnapshot(snapshot: PlayerSnapshot): void {
    this.channel?.send({ type: 'broadcast', event: 'state', payload: snapshot });
  }

  /** Ask the referee to resolve a contested eat. */
  async sendEatClaim(claim: Omit<EatClaim, 'roomId'>): Promise<void> {
    if (!this.info) {
      return;
    }
    await this.supabase.functions.invoke('referee', {
      body: { roomId: this.info.roomId, kind: 'food-chain', ...claim },
    });
  }

  /** Broadcast the start of a Prisoner's Dilemma encounter. */
  sendDilemmaStart(event: DilemmaStartEvent): void {
    this.channel?.send({ type: 'broadcast', event: 'dilemma:start', payload: event });
  }

  /** Broadcast this client's dilemma choice. */
  sendDilemmaChoice(event: DilemmaChoiceEvent): void {
    this.channel?.send({ type: 'broadcast', event: 'dilemma:choice', payload: event });
  }

  /**
   * Tell every other client to hide the NPC in `globalSubLane`.
   * Fire-and-forget; receivers apply locally (no referee — bots are not players).
   */
  sendNpcEat(event: NpcEatEvent): void {
    this.channel?.send({ type: 'broadcast', event: 'npc:eat', payload: event });
  }

  /** Broadcast world-affecting abilities so every racer sees the same effect. */
  sendAbility(event: { abilityId: string; playerMainLane: number }): void {
    if (!this.info) {
      return;
    }
    this.channel?.send({
      type: 'broadcast',
      event: 'ability:activate',
      payload: { actorId: this.info.userId, ...event },
    });
  }

  /** Ask the referee to eliminate a rival after a dilemma betrayal. */
  async sendDilemmaElimination(targetId: string, raceTimeMs: number): Promise<void> {
    if (!this.info) {
      return;
    }
    await this.supabase.functions.invoke('referee', {
      body: {
        roomId: this.info.roomId,
        kind: 'dilemma',
        actorId: this.info.userId,
        targetId,
        raceTimeMs,
      },
    });
  }

  /** Ask the referee to apply a syringe hit to a real rival. */
  async sendSyringeElimination(targetId: string, raceTimeMs: number): Promise<void> {
    if (!this.info) {
      return;
    }
    await this.supabase.functions.invoke('referee', {
      body: {
        roomId: this.info.roomId,
        kind: 'syringe',
        actorId: this.info.userId,
        targetId,
        raceTimeMs,
      },
    });
  }

  /** Records this player's race outcome on their room_members row. */
  async reportResult(finished: boolean, died: boolean, finishTimeMs: number | null): Promise<void> {
    if (!this.info) {
      return;
    }
    await this.supabase
      .from('room_members')
      .update({ finished, died, finish_time_ms: finishTimeMs })
      .eq('room_id', this.info.roomId)
      .eq('user_id', this.info.userId);
  }

  /** Reads the final standings for the end screen. */
  async fetchStandings(): Promise<Standing[]> {
    if (!this.info) {
      return [];
    }
    const { data } = await this.supabase
      .from('room_members')
      .select('user_id, character_type, global_sub_lane, finished, finish_time_ms, died')
      .eq('room_id', this.info.roomId);
    if (!data) {
      return [];
    }
    return data.map((row) => ({
      userId: row.user_id as string,
      characterType: row.character_type as CharacterType,
      globalSubLane: row.global_sub_lane as number,
      finished: row.finished as boolean,
      died: row.died as boolean,
      finishTimeMs: (row.finish_time_ms as number | null) ?? null,
    }));
  }

  getSelfUserId(): string | null {
    return this.info?.userId ?? null;
  }

  /**
   * Syncs self role/lane after server-side `assign_roles` — the values from
   * join time are stale once species and lanes are reassigned at race start.
   */
  applySelfAssignment(characterType: CharacterType, globalSubLane: number): void {
    if (this.info) {
      this.info.self = { characterType, globalSubLane };
    }
  }

  /** Advances the room to racing once the start time has passed (idempotent). */
  async markRacing(): Promise<void> {
    if (!this.info) {
      return;
    }
    await this.supabase.rpc('mark_room_racing', { p_room: this.info.roomId });
  }

  /** Finishes the room once the race window has elapsed (idempotent). */
  async finishRoom(): Promise<void> {
    if (!this.info) {
      return;
    }
    await this.supabase.rpc('mark_room_finished', { p_room: this.info.roomId });
  }

  destroy(): void {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.membersHandler = null;
    this.snapshotHandler = null;
    this.eliminationHandler = null;
    this.phaseHandler = null;
    this.startsAtHandler = null;
    this.dilemmaStartHandler = null;
    this.dilemmaChoiceHandler = null;
    this.npcEatHandler = null;
    this.abilityHandler = null;
  }
}
