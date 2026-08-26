import {
  ABILITY_DEFAULT_DURATION_SEC,
  ABILITY_FLIGHT_DURATION_SEC,
  ABILITY_SPEED_UP_DURATION_SEC,
  getAbility,
  type AbilityDef,
} from '../config/abilities';
import type { Player } from '../entities/Player';
import type { NpcManager } from './NpcManager';
import type { ObstacleManager } from './ObstacleManager';
import type { LampLightingManager } from './LampLightingManager';
import type { PassportPlacementManager } from './PassportPlacementManager';
import type { SyringeThrowManager } from './SyringeThrowManager';

export interface AbilityExecutorDeps {
  scene: Phaser.Scene;
  player: Player;
  npcManager: NpcManager | null;
  obstacleManager: ObstacleManager;
  lightingManager: LampLightingManager;
  syringeThrowManager: SyringeThrowManager | null;
  passportPlacementManager: PassportPlacementManager | null;
  getNowMs: () => number;
  getPlayerRaceDistance: () => number;
  getPlayerAnchorY: () => number;
  getPlayerMainLane: () => number;
  setLaneDividersForcedOpen: (open: boolean) => void;
  onSpeedBoost: (multiplier: number, durationSec: number) => void;
  showToast: (message: string) => void;
}

export interface AbilityEffectState {
  eatProtectedUntilMs: number;
  barriersDisabledUntilMs: number;
  blackrockUntilMs: number;
  hellModeUntilMs: number;
  flightModeUntilMs: number;
  flashlightUntilMs: number;
  idRevealUntilMs: number;
  npcSlowUntilMs: number;
}

export function createAbilityEffectState(): AbilityEffectState {
  return {
    eatProtectedUntilMs: 0,
    barriersDisabledUntilMs: 0,
    blackrockUntilMs: 0,
    hellModeUntilMs: 0,
    flightModeUntilMs: 0,
    flashlightUntilMs: 0,
    idRevealUntilMs: 0,
    npcSlowUntilMs: 0,
  };
}

export class AbilityExecutor {
  readonly effects = createAbilityEffectState();
  private barriersForcedOpen = false;

  constructor(private readonly deps: AbilityExecutorDeps) {}

  /**
   * @param authVisualOnly when true (authoritative races), only toast/VFX and
   *   arm deferred gestures — gameplay effects come from the server snapshot.
   */
  activate(abilityId: string, authVisualOnly = false): void {
    const ability = getAbility(abilityId);
    const now = this.deps.getNowMs();
    const durationSec = this.durationSec(ability);

    this.deps.showToast(`${ability.name} — ${ability.description}`);
    this.deps.player.showAbilityActivateVfx(ability.kind, durationSec);

    // Deferred gestures still need local arming so the player can aim/place.
    if (authVisualOnly) {
      switch (ability.kind) {
        case 'enableID':
          this.deps.passportPlacementManager?.armPassport(durationSec);
          break;
        case 'spawnNeedle':
          this.deps.syringeThrowManager?.arm();
          break;
        case 'spawnStraw':
          this.deps.passportPlacementManager?.armStraw(durationSec);
          break;
        default:
          break;
      }
      return;
    }

    switch (ability.kind) {
      case 'speedUp':
        this.deps.onSpeedBoost(ability.param, ABILITY_SPEED_UP_DURATION_SEC);
        break;
      case 'immortality':
        this.effects.eatProtectedUntilMs = now + durationSec * 1000;
        break;
      case 'slowDownOther':
        this.effects.npcSlowUntilMs = now + durationSec * 1000;
        this.deps.npcManager?.setSlowVisualActive(true);
        break;
      case 'hellMode':
        this.effects.hellModeUntilMs = now + durationSec * 1000;
        this.deps.obstacleManager.setHellModeLanes(this.deps.getPlayerMainLane(), true);
        break;
      case 'disableObstacles':
        this.effects.blackrockUntilMs = now + durationSec * 1000;
        break;
      case 'disableBarriers':
        this.effects.barriersDisabledUntilMs = now + durationSec * 1000;
        this.setBarriersForcedOpen(true);
        break;
      case 'enableFlashLight':
        this.effects.flashlightUntilMs = now + durationSec * 1000;
        this.deps.lightingManager.setFlashlightBoost(true);
        break;
      case 'enableID':
        this.deps.passportPlacementManager?.armPassport(durationSec);
        break;
      case 'posAligment':
        this.deps.npcManager?.alignRivalsToPlayer(
          this.deps.getPlayerRaceDistance(),
          this.deps.getPlayerAnchorY(),
          now,
        );
        break;
      case 'flightMode': {
        this.effects.flightModeUntilMs = now + durationSec * 1000;
        // Airborne only — do not wipe trash/hazards (no trash immunity).
        this.deps.player.setFlightModeVisual(true, durationSec);
        break;
      }
      case 'spawnNeedle':
        this.deps.syringeThrowManager?.arm();
        break;
      case 'spawnStraw':
        this.deps.passportPlacementManager?.armStraw(durationSec);
        break;
      default:
        break;
    }

    this.tickTimedEffects(now);
  }

  tickTimedEffects(nowMs: number): void {
    if (nowMs >= this.effects.flashlightUntilMs) {
      this.deps.lightingManager.setFlashlightBoost(false);
      this.deps.lightingManager.setFlashlightPoint(null);
    }

    if (nowMs >= this.effects.flightModeUntilMs) {
      this.deps.player.setFlightModeVisual(false);
    }

    if (nowMs >= this.effects.barriersDisabledUntilMs) {
      this.setBarriersForcedOpen(false);
    }

    if (nowMs >= this.effects.hellModeUntilMs) {
      this.deps.obstacleManager.setHellModeLanes(null, false);
    }

    if (nowMs >= this.effects.npcSlowUntilMs) {
      this.deps.npcManager?.setSlowVisualActive(false);
    }
  }

  private setBarriersForcedOpen(open: boolean): void {
    if (this.barriersForcedOpen === open) {
      return;
    }
    this.barriersForcedOpen = open;
    this.deps.setLaneDividersForcedOpen(open);
  }

  isEatProtected(nowMs: number): boolean {
    return nowMs < this.effects.eatProtectedUntilMs;
  }

  isBarriersDisabled(nowMs: number): boolean {
    return nowMs < this.effects.barriersDisabledUntilMs;
  }

  isBlackrockActive(nowMs: number): boolean {
    return nowMs < this.effects.blackrockUntilMs;
  }

  isHellMode(nowMs: number): boolean {
    return nowMs < this.effects.hellModeUntilMs;
  }

  isFlightMode(nowMs: number): boolean {
    return nowMs < this.effects.flightModeUntilMs;
  }

  isFlashlight(nowMs: number): boolean {
    return nowMs < this.effects.flashlightUntilMs;
  }

  isNpcSlow(nowMs: number): boolean {
    return nowMs < this.effects.npcSlowUntilMs;
  }

  /**
   * Authoritative races: keep timed flags alive from the server snapshot so
   * {@link tickTimedEffects} does not clear flight/flashlight/borders every frame
   * (local activate is visual-only and never sets these timers).
   */
  syncAuthServerFlags(
    nowMs: number,
    flags: {
      flashlight: boolean;
      flight: boolean;
      barriersOpen: boolean;
      blackrock: boolean;
      eatProtected: boolean;
      hellMode: boolean;
      slowed: boolean;
    },
  ): void {
    const hold = nowMs + 400;
    this.effects.flashlightUntilMs = flags.flashlight ? hold : 0;
    this.effects.flightModeUntilMs = flags.flight ? hold : 0;
    this.effects.barriersDisabledUntilMs = flags.barriersOpen ? hold : 0;
    this.effects.blackrockUntilMs = flags.blackrock ? hold : 0;
    this.effects.eatProtectedUntilMs = flags.eatProtected ? hold : 0;
    this.effects.hellModeUntilMs = flags.hellMode ? hold : 0;
    this.effects.npcSlowUntilMs = flags.slowed ? hold : 0;
  }

  reset(): void {
    Object.assign(this.effects, createAbilityEffectState());
    this.setBarriersForcedOpen(false);
    this.deps.obstacleManager.setHellModeLanes(null, false);
    this.deps.lightingManager.setFlashlightBoost(false);
    this.deps.lightingManager.setFlashlightPoint(null);
    this.deps.player.setFlightModeVisual(false);
    this.deps.npcManager?.setSlowVisualActive(false);
    this.deps.player.clearAbilityVfx();
  }

  destroy(): void {
    this.reset();
  }

  private durationSec(ability: AbilityDef): number {
    if (ability.kind === 'speedUp') {
      return ABILITY_SPEED_UP_DURATION_SEC;
    }
    if (ability.kind === 'flightMode') {
      return ABILITY_FLIGHT_DURATION_SEC;
    }
    return ABILITY_DEFAULT_DURATION_SEC;
  }
}
