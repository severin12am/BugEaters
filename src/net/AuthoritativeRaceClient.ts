/**
 * Backwards-compatible entrypoint for the authoritative race client.
 *
 * The implementation now lives in `./authoritative/`, split into small,
 * single-responsibility modules (transport, prediction, interpolation). This
 * file re-exports the facade so existing imports keep working and new code has
 * one obvious place to import from.
 *
 * See docs/multiplayer/CLIENT_PREDICTION.md.
 */
export {
  AuthoritativeRaceClient,
  type RaceRenderState,
  type SelfRenderState,
  type AuthoritativeRaceCallbacks,
} from './authoritative/AuthoritativeRaceClient';
export type { InterpolatedPlayer } from './authoritative/SnapshotInterpolator';
export type {
  SnapshotMessage as AuthoritativeRaceSnapshot,
  PlayerSnapshotDto,
  HazardSnapshotDto,
  AbilityMessage,
  FinalMessage,
} from './authoritative/protocol';
export type { DevTicketOptions } from './authoritative/RaceConnection';
export { isRaceServerConfigured, isRaceDevMode, RACE_SERVER_URL } from './authoritative/env';
