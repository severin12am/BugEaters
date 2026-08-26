import Phaser from 'phaser';
import {
  bakeCharacterAtlases,
  preloadCharacterAssets,
  registerCharacterAnimations,
} from '../utils/characterSprites';
import { createGrainTextures } from '../utils/grainTexture';
import { preloadAbilityAssets } from '../config/abilities';
import { preloadBriefcaseAssets } from '../utils/briefcaseSprites';
import { preloadPropAssets } from '../utils/propSprites';
import { preloadAudioAssets } from '../utils/audioAssets';
import { preloadGuideShots } from '../ui/encyclopediaShots';
import { isAbilityLabFromUrl } from '../dev/abilityLab';
import { CharacterType } from '../utils/constants';
import { isDevSessionUiEnabled } from '../tournament/devSession';
import { shouldShowOnboarding } from '../tournament/onboarding';

/**
 * Boot scene — loads character sprites, then onboarding / playtest / week hub.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    preloadCharacterAssets(this);
    preloadAbilityAssets(this);
    preloadBriefcaseAssets(this);
    preloadPropAssets(this);
    preloadAudioAssets(this);
    preloadGuideShots(this);
  }

  create(): void {
    bakeCharacterAtlases(this);
    registerCharacterAnimations(this);
    createGrainTextures(this);
    if (isAbilityLabFromUrl()) {
      this.registry.set(REGISTRY_KEYS.abilityLab, true);
      this.registry.set(REGISTRY_KEYS.selectedCharacter, CharacterType.Human);
      this.scene.start('GameScene');
      return;
    }
    if (shouldShowOnboarding()) {
      this.scene.start('OnboardingScene');
      return;
    }
    // Playtest builds always open the session picker first.
    if (isDevSessionUiEnabled()) {
      this.scene.start('DevSessionScene');
      return;
    }
    this.scene.start('WeekHubScene');
  }
}

/** Keys stored in the Phaser registry between scenes. */
export const REGISTRY_KEYS = {
  selectedCharacter: 'selectedCharacter',
  raceFinished: 'raceFinished',
  raceTimeMs: 'raceTimeMs',
  playerDied: 'playerDied',
  /** Live multiplayer RoomSession (or null in solo mode). */
  roomSession: 'roomSession',
  /** Authoritative room roster fetched before the race starts. */
  roomMembers: 'roomMembers',
  /** Monday UTC slot id from registration. */
  tournamentTimeSlot: 'tournamentTimeSlot',
  /** Pass burned and ready in lobby (Monday skips burn). */
  passBurnConfirmed: 'passBurnConfirmed',
  /** Role assigned after pass burn Tue–Sun. */
  assignedRole: 'assignedRole',
  /** Blocked state reason (no-pass, no-wallet, wrong-day, forfeit). */
  blockedReason: 'blockedReason',
  /** Wallet link attempt logged in registry. */
  walletLinked: 'walletLinked',
  /** Active pass id for lobby burn (Tue–Sun). */
  activePassId: 'activePassId',
  /** Server race outcome from record_results. */
  raceOutcome: 'raceOutcome',
  /** Whether current user is week champion. */
  isChampion: 'isChampion',
  /** Dev ability sandbox (`?abilityLab=1`). */
  abilityLab: 'abilityLab',
  /** Offline practice race (no room) — leftover flag; playtest menu no longer offers Solo. */
  soloPractice: 'soloPractice',
  /**
   * Local authoritative race options (dev playtest). When set, GameScene joins
   * the Colyseus race server with a /dev/ticket instead of (or in addition to)
   * a Supabase RoomSession.
   */
  authLocalRace: 'authLocalRace',
  /** Sealed standings from the authoritative race server (EndScene). */
  authStandings: 'authStandings',
} as const;

/** Options for a local/dev authoritative race (see LobbyScene). `roomId` is the Colyseus wave room from the ticket. */
export interface AuthLocalRaceOptions {
  roomId: string;
  userId: string;
  role: 'bug' | 'human' | 'klaus';
  globalSubLane: number;
  startsAtMs: number;
  seed: number;
  maxPlayers: number;
  /** Prefetched signed ticket from /dev/ticket (avoids a second mint). */
  token?: string;
}
