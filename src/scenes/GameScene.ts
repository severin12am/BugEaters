import Phaser from 'phaser';
import { Player } from '../entities/Player';
import { createMainLaneDividers, MainLaneDivider } from '../managers/MainLaneDivider';
import { InputManager } from '../managers/InputManager';
import { LampLightingManager, type RunnerPoint } from '../managers/LampLightingManager';
import type { RunnerCharacter } from '../entities/RunnerCharacter';
import { ObstacleManager } from '../managers/ObstacleManager';
import { PrisonersDilemmaManager } from '../managers/PrisonersDilemmaManager';
import { RaceRoomManager } from '../managers/RaceRoomManager';
import { RemoteRunnerManager } from '../managers/RemoteRunnerManager';
import { AuthWorldRenderer } from '../managers/AuthWorldRenderer';
import { AudioManager } from '../managers/AudioManager';
import { RoadScroll } from '../managers/RoadScroll';
import type { RoomSession } from '../net/RoomSession';
import type { EliminationEvent, PlayerSnapshot } from '../net/types';
import {
  AuthoritativeRaceClient,
  isRaceServerConfigured,
  type FinalMessage,
} from '../net/AuthoritativeRaceClient';
import { RoadSurface } from '../managers/RoadSurface';
import { RoadEdgeMarkers } from '../managers/RoadEdgeMarkers';
import { RoadsideLampManager } from '../managers/RoadsideLampManager';
import {
  characterFromGlobalSubLane,
  characterFromRole,
  getMainLaneDividerXs,
  getSubLaneWidth,
  getWorldWidth,
  SubLaneManager,
} from '../managers/SubLaneManager';
import { TUNING } from '../config/tuning';
import {
  CharacterType,
  COLORS,
  DISPLAY_DPR,
  GAME_HEIGHT,
  GAME_WIDTH,
  RACE_DISTANCE,
  RACE_DURATION_SEC,
  ux,
} from '../utils/constants';
import { gameText } from '../utils/display';
import { fontSize, getHudSecondRowY, getHudTopY, isPointerInAbilityHud } from '../utils/layout';
import { getCharacterDisplaySize } from '../utils/characterSprites';
import { ABILITY_DEFAULT_DURATION_SEC, getAbility } from '../config/abilities';
import {
  abilityContact,
  manholeContact,
  markManholeFellIn,
  obstacleOverlapsPlayer,
  puddleContact,
  markTrashJumpCleared,
  trashJumpContact,
} from '../utils/obstacleCollision';
import type { ObstacleHandle } from '../managers/ObstacleManager';
import { AbilityInventory } from '../managers/AbilityInventory';
import { AbilityHud } from '../managers/AbilityHud';
import { AbilityExecutor } from '../managers/AbilityExecutor';
import { AbilityLabPanel } from '../managers/AbilityLabPanel';
import { NpcManager } from '../managers/NpcManager';
import { canEat } from '../utils/eatingRules';
import { getRoadBounds, getWorldSurfaceWidth } from '../utils/roadBounds';
import { PassportPlacementManager } from '../managers/PassportPlacementManager';
import { SyringeThrowManager } from '../managers/SyringeThrowManager';
import { raceProgressGapToVisualOffset } from '../utils/raceVisual';
import { getForcedSeed } from '../net/env';
import { isAbilityLabActive } from '../dev/abilityLab';
import {
  FrameMonitor,
  isFpsHudRequested,
  PERF_PROFILE,
  recordRaceQuality,
} from '../utils/perf';
import { REGISTRY_KEYS, type AuthLocalRaceOptions } from './BootScene';

/**
 * Core runner gameplay scene with 3 main lanes × 3 sub-lanes each.
 * All road motion goes through RoadScroll — track, obstacles, and lane lines.
 */
export class GameScene extends Phaser.Scene {
  private laneManager!: SubLaneManager;
  private roadScroll!: RoadScroll;
  private obstacleManager!: ObstacleManager;
  private roadSurface!: RoadSurface;
  private roadEdgeMarkers!: RoadEdgeMarkers;
  private roadBackdrop: Phaser.GameObjects.Rectangle | null = null;
  private lampManager!: RoadsideLampManager;
  private lightingManager!: LampLightingManager;
  private dilemmaManager!: PrisonersDilemmaManager;
  private raceRoomManager!: RaceRoomManager;
  private audioManager!: AudioManager;
  /** Networking session for multiplayer (null in solo). */
  private session: RoomSession | null = null;
  /** Authoritative Colyseus race client (null when not configured / not joined). */
  private authRace: AuthoritativeRaceClient | null = null;
  /** True once the authoritative room is connected — remotes + outcomes come from it. */
  private authRaceActive = false;
  /** Local/dev race: wait for server join + shared startsAt before the clock runs. */
  private authRaceWaiting = false;
  private authRaceStatusText: Phaser.GameObjects.Text | null = null;
  /** Local/dev race options from the lobby (null in tournament / solo practice). */
  private authLocal: AuthLocalRaceOptions | null = null;
  /** Real rivals (multiplayer only). */
  private remoteRunnerManager: RemoteRunnerManager | null = null;
  /**
   * True when this race renders the SERVER's authoritative world locally (server
   * hazards/dividers/progress/death) instead of the solo sim. Set for local
   * multiplayer; solo practice + tournament legacy path leave it false.
   */
  private authWorld = false;
  /** Draws server hazards + dividers in authoritative mode. */
  private authWorldRenderer: AuthWorldRenderer | null = null;
  /** Latest server divider open/closed state, used to gate local move prediction. */
  private authDividersOpen: boolean[] = [true, true];
  /** OPENED BORDERS from the server — must also unlock local cross prediction. */
  private authBarriersOpen = false;
  /** Throttle for outgoing movement broadcasts (~12Hz). */
  private broadcastAccumMs = 0;
  /** Movement broadcast cadence (~12 updates/sec). */
  private readonly broadcastIntervalMs = 1000 / 12;
  /** Render rivals this far in the past (ms) to smooth network jitter. */
  private readonly interpDelayMs = 90;
  /** Min gap between repeat eat claims for the same target. */
  private readonly eatClaimCooldownMs = 1500;
  private readonly nextClaimByTarget = new Map<string, number>();
  private inputManager!: InputManager;
  private player!: Player;
  private worldContainer!: Phaser.GameObjects.Container;
  /** Props (road, obstacles, light pools) — below runners. */
  private propsLayer!: Phaser.GameObjects.Container;
  /** Player + NPCs — above road props, below lamp posts. */
  private actorsLayer!: Phaser.GameObjects.Container;
  /** Multiply darkness over road + runners (Unity unlit look). */
  private darknessLayer!: Phaser.GameObjects.Container;
  /** Intense ADD lamp pools on top of darkness. */
  private lightLayer!: Phaser.GameObjects.Container;
  /** Street lamp sprites — above runners so they pass under the pole. */
  private lampLayer!: Phaser.GameObjects.Container;
  private wasOnPuddle = false;
  private puddleSlideEndMs = 0;
  private speedBoostEndMs = 0;
  private speedBoostMultiplier = 1;
  private abilityInventory!: AbilityInventory;
  private abilityHud!: AbilityHud;
  private abilityExecutor!: AbilityExecutor;
  private syringeThrowManager: SyringeThrowManager | null = null;
  private passportPlacementManager: PassportPlacementManager | null = null;
  private npcManager: NpcManager | null = null;
  private abilityLabPanel: AbilityLabPanel | null = null;
  private isLab = false;
  private labGodMode = true;
  private uiCamera!: Phaser.Cameras.Scene2D.Camera;
  private hudObjects: Phaser.GameObjects.GameObject[] = [];
  private laneDividers: MainLaneDivider[] = [];
  private elapsedMs = 0;
  private raceFinished = false;
  private playerDied = false;
  private timerText!: Phaser.GameObjects.Text;
  private distanceText!: Phaser.GameObjects.Text;
  private timerPulseTween: Phaser.Tweens.Tween | null = null;
  private groundY = 0;
  /** Seed for deterministic obstacles + dividers (shared across a room). */
  private worldSeed = 0;
  /** In multiplayer the race clock is driven by the shared start time. */
  private useWallClock = false;
  private raceStartMs = 0;
  private readonly subLaneWidth = getSubLaneWidth();
  private readonly worldWidth = getWorldWidth();
  /** Scratch list handed to the lighting manager each frame (no per-frame allocs). */
  private readonly lightingRunners: RunnerPoint[] = [];
  private readonly lightingRunnerPool: RunnerPoint[] = [];
  /** Race frame statistics — auto-learns the low perf tier for weak phones. */
  private frameMonitor = new FrameMonitor();
  private frameMonitorConcluded = false;
  private fpsText: Phaser.GameObjects.Text | null = null;
  private fpsTextAccumMs = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.isLab = isAbilityLabActive(this.registry);
    this.authLocal =
      (this.registry.get(REGISTRY_KEYS.authLocalRace) as AuthLocalRaceOptions | null) ?? null;
    // Local multiplayer renders the SERVER world (hazards/dividers/death) locally.
    this.authWorld = this.authLocal != null;
    // Prefer ticket role so local sprite matches what rivals see (lane/role).
    const character =
      characterFromRole(this.authLocal?.role) ??
      (this.registry.get(REGISTRY_KEYS.selectedCharacter) as CharacterType) ??
      CharacterType.Human;
    this.registry.set(REGISTRY_KEYS.selectedCharacter, character);

    this.groundY = GAME_HEIGHT - ux(TUNING.physics.groundOffset);
    this.elapsedMs = 0;
    this.raceFinished = false;
    this.playerDied = false;
    this.wasOnPuddle = false;
    this.puddleSlideEndMs = 0;
    this.hudObjects = [];
    this.timerPulseTween = null;
    this.frameMonitor = new FrameMonitor();
    this.frameMonitorConcluded = false;
    this.fpsText = null;
    this.fpsTextAccumMs = 0;

    this.laneManager = new SubLaneManager(character);
    const session = (this.registry.get(REGISTRY_KEYS.roomSession) as RoomSession | null) ?? null;
    this.session = session;
    const roomInfo = session?.getRoomInfo() ?? null;
    if (roomInfo) {
      this.laneManager.setAssignedSubLane(roomInfo.self.globalSubLane);
    } else if (this.authLocal && this.authLocal.globalSubLane >= 0) {
      this.laneManager.setAssignedSubLane(this.authLocal.globalSubLane);
    }
    this.broadcastAccumMs = 0;
    this.raceRoomManager = new RaceRoomManager(session);
    this.worldSeed =
      this.authLocal && this.authLocal.seed > 0
        ? this.authLocal.seed
        : this.raceRoomManager.getSeed();
    if (this.authLocal && this.authLocal.seed > 0) {
      this.raceRoomManager.setSeed(this.worldSeed);
    }
    if (this.isLab) {
      this.worldSeed = getForcedSeed() ?? 42;
      this.raceRoomManager.setSeed(this.worldSeed);
    }

    const startsAtMs =
      this.authLocal && this.authLocal.startsAtMs > 0
        ? this.authLocal.startsAtMs
        : this.raceRoomManager.getStartsAtMs();
    // Local authoritative races MUST wait for the shared server start — never
    // fall through to the solo delta clock (that made every tab its own race).
    if (this.authLocal) {
      this.authRaceWaiting = true;
      this.useWallClock = true;
      this.raceStartMs = startsAtMs && startsAtMs > 0 ? startsAtMs : Number.POSITIVE_INFINITY;
    } else {
      this.useWallClock = this.raceRoomManager.isMultiplayer() && startsAtMs !== null;
      this.raceStartMs = startsAtMs ?? Date.now();
    }

    if (
      this.useWallClock &&
      startsAtMs !== null &&
      Date.now() - startsAtMs > RACE_DURATION_SEC * 1000
    ) {
      this.session?.destroy();
      this.registry.set(REGISTRY_KEYS.roomSession, null);
      this.scene.start('WeekHubScene');
      return;
    }

    this.roadScroll = new RoadScroll();
    this.worldContainer = this.add.container(0, 0);
    this.propsLayer = this.add.container(0, 0);
    this.actorsLayer = this.add.container(0, 0);
    this.darknessLayer = this.add.container(0, 0);
    this.lightLayer = this.add.container(0, 0);
    this.lampLayer = this.add.container(0, 0);
    this.worldContainer.add([
      this.propsLayer,
      this.actorsLayer,
      this.darknessLayer,
      this.lightLayer,
      this.lampLayer,
    ]);

    this.setupGameCamera();
    this.buildWorld(character);
    this.createHud();

    this.player = new Player(
      this,
      this.laneManager.getCurrentX(),
      this.groundY,
      character,
    );
    this.actorsLayer.add(this.player);

    this.inputManager = new InputManager(
      this,
      {
        onMoveLeft: () => this.handleMoveLeft(),
        onMoveRight: () => this.handleMoveRight(),
        onJump: () => {
          if (this.isAuthCountdown()) {
            return;
          }
          // Only tell the server about a jump the local runner actually did
          // (grounded + alive). Otherwise the server would mark us airborne and
          // rivals would see a phantom jump we never performed.
          const canJump = this.player.isGroundedOnTrack() && !this.player.getIsDead();
          this.player.jump();
          if (canJump) {
            this.authRace?.jump();
          }
        },
      },
      {
        shouldConsumePointer: (pointer) =>
          isPointerInAbilityHud(this, pointer.x, pointer.y) ||
          (this.abilityLabPanel?.containsPointer(pointer.x, pointer.y) ?? false) ||
          (this.syringeThrowManager?.isArmed() ?? false) ||
          (this.passportPlacementManager?.isArmed() ?? false),
      },
    );

    // In authoritative mode all hazards come from the server — never spawn local ones.
    if (!this.authWorld) {
      this.obstacleManager.spawnInitial();
    }

    const isMultiplayer = this.raceRoomManager.isMultiplayer();
    const soloPractice = this.registry.get(REGISTRY_KEYS.soloPractice) === true;
    const localAuthRace = this.authLocal != null;
    // Tournament races require a room; solo practice / ability lab / local auth are escapes.
    if (!isMultiplayer && !this.isLab && !soloPractice && !localAuthRace) {
      this.registry.set(REGISTRY_KEYS.raceFinished, false);
      this.registry.set(REGISTRY_KEYS.playerDied, false);
      this.scene.start('WeekHubScene');
      return;
    }

    const playerSlot = this.laneManager.getGlobalSubLaneIndex();
    if (this.isLab) {
      this.npcManager = new NpcManager(
        this,
        this.actorsLayer,
        character,
        this.groundY,
        [playerSlot],
        {
          labNpc: { type: CharacterType.Bug, globalSubLane: 1 },
          labNpcInitialRaceDistance: ux(120),
        },
      );
    } else if (soloPractice && !localAuthRace) {
      // Offline practice needs rivals so eat / syringe / slow have targets.
      // Local authoritative races skip NPCs so the other tab is the clear rival.
      this.npcManager = new NpcManager(
        this,
        this.actorsLayer,
        character,
        this.groundY,
        [playerSlot],
      );
    }

    this.initGameplaySystems(this.npcManager);

    if (this.isLab) {
      this.setupAbilityLab();
    } else {
      this.setupMultiplayer();
      void this.connectAuthoritativeRace();
    }

    this.setupUiCamera();
  }

  /** Ability inventory, executor, audio, dilemma — shared by race and lab modes. */
  private initGameplaySystems(npcManager: NpcManager | null): void {
    this.abilityInventory = new AbilityInventory();
    this.abilityHud = new AbilityHud(this, this.abilityInventory, {
      onActivate: () => this.tryActivateArmedAbility(),
      onArm: (slotIndex) => {
        if (this.abilityInventory.armAt(slotIndex)) {
          const id = this.abilityInventory.getArmedId();
          const ability = id ? getAbility(id) : null;
          this.abilityHud.refresh();
          if (ability) {
            this.abilityHud.showToast(`${ability.name} armed — tap to use`);
          }
        }
      },
    });
    this.hudObjects.push(...this.abilityHud.getHudObjects());

    const ignoreHudPointer = (x: number, y: number) =>
      isPointerInAbilityHud(this, x, y) ||
      (this.abilityLabPanel?.containsPointer(x, y) ?? false);

    this.syringeThrowManager = new SyringeThrowManager(
      this,
      this.player,
      this.actorsLayer,
      (worldX, worldY) => this.trySyringeHitAt(worldX, worldY),
      ignoreHudPointer,
      (message) => this.abilityHud.showToast(message),
    );

    this.passportPlacementManager = new PassportPlacementManager(
      this,
      this.obstacleManager,
      this.groundY,
      ignoreHudPointer,
      (message) => this.abilityHud.showToast(message),
    );

    this.abilityExecutor = new AbilityExecutor({
      scene: this,
      player: this.player,
      npcManager,
      obstacleManager: this.obstacleManager,
      lightingManager: this.lightingManager,
      syringeThrowManager: this.syringeThrowManager,
      passportPlacementManager: this.passportPlacementManager,
      getNowMs: () => this.time.now,
      getPlayerRaceDistance: () => this.roadScroll.distanceTraveled,
      getPlayerAnchorY: () => this.groundY,
      getPlayerMainLane: () => this.laneManager.getMainLane(),
      setLaneDividersForcedOpen: (open) => {
        for (const divider of this.laneDividers) {
          divider.setForcedOpen(open);
        }
      },
      onSpeedBoost: (multiplier, durationSec) => {
        this.speedBoostMultiplier = multiplier;
        this.speedBoostEndMs = this.time.now + durationSec * 1000;
      },
      showToast: (message) => this.abilityHud.showToast(message),
    });
    this.abilityHud.refresh();

    this.audioManager = new AudioManager(this);
    this.audioManager.startRace();
    this.player.onFootstep = () => {
      this.audioManager.playFootstep(this.player.characterType);
    };

    this.dilemmaManager = new PrisonersDilemmaManager(
      this,
      npcManager,
      {
        registerHudObject: (obj) => {
          this.hudObjects.push(obj);
          this.cameras.main.ignore(obj);
        },
        onPlayerDeath: () => this.triggerDeath(),
        onPlayerSpeedBoost: (multiplier, durationSec) => {
          this.speedBoostMultiplier = multiplier;
          this.speedBoostEndMs = this.time.now + durationSec * 1000;
        },
        getRaceTimeMs: () => this.elapsedMs,
      },
      this.remoteRunnerManager,
      this.session,
      this.session?.getRoomInfo()?.userId ?? null,
    );
  }

  private setupAbilityLab(): void {
    this.labGodMode = true;
    this.abilityLabPanel = new AbilityLabPanel(this, {
      onActivate: (abilityId) => {
        this.abilityExecutor.activate(abilityId);
      },
      onExit: () => {
        this.registry.set(REGISTRY_KEYS.abilityLab, false);
        this.scene.start('WeekHubScene');
      },
      isGodMode: () => this.labGodMode,
      onGodModeChange: (enabled) => {
        this.labGodMode = enabled;
      },
    });
    this.hudObjects.push(...this.abilityLabPanel.getHudObjects());
  }


  private syncRealPlayerSlots(): void {}

  /**
   * Joins the authoritative Colyseus race when a race-server URL is configured.
   * Tournament rooms use a Supabase ticket; local playtest uses /dev/ticket.
   * Failures fall back to the legacy RoomSession peer path (still playable).
   */
  private async connectAuthoritativeRace(): Promise<void> {
    if (!isRaceServerConfigured || this.isLab) {
      return;
    }
    const roomId = this.authLocal?.roomId ?? this.session?.getRoomInfo()?.roomId;
    if (!roomId) {
      return;
    }

    const client = new AuthoritativeRaceClient();
    this.authRace = client;
    this.authRaceStatusText?.setText('Getting race ticket…');
    try {
      await client.join(
        roomId,
        {
          onFinal: (event) => this.handleAuthFinal(event),
          onAbility: (event) => this.handleAuthAbilityEvent(event),
          onDilemma: (event) => this.handleAuthDilemmaEvent(event),
          onElimination: (event) => {
            const selfId = this.authRace?.getSelfUserId();
            if (event.targetId === selfId) {
              if (!this.playerDied) {
                this.triggerDeath();
              }
            } else {
              this.remoteRunnerManager?.eliminate(event.targetId);
            }
          },
          onError: (error) => {
            console.warn('[auth-race] connection error', error);
          },
        },
        this.authLocal
          ? {
              userId: this.authLocal.userId,
              role: this.authLocal.role,
              globalSubLane:
                this.authLocal.globalSubLane >= 0 ? this.authLocal.globalSubLane : undefined,
              startsAtMs: this.authLocal.startsAtMs > 0 ? this.authLocal.startsAtMs : undefined,
              seed: this.authLocal.seed > 0 ? this.authLocal.seed : undefined,
              maxPlayers: this.authLocal.maxPlayers,
              token: this.authLocal.token,
              claims: {
                userId: this.authLocal.userId,
                role: this.authLocal.role,
                globalSubLane: this.authLocal.globalSubLane,
                startsAtMs: this.authLocal.startsAtMs,
                seed: this.authLocal.seed,
              },
            }
          : {},
      );
      if (!this.scene.isActive()) {
        client.leave();
        return;
      }
      this.authRaceActive = true;
      this.authRaceWaiting = false;
      const info = client.getJoinedInfo();
      if (info?.startsAtMs && info.startsAtMs > 0) {
        this.raceStartMs = info.startsAtMs;
        this.useWallClock = true;
        if (this.authLocal) {
          this.registry.set(REGISTRY_KEYS.authLocalRace, {
            ...this.authLocal,
            startsAtMs: info.startsAtMs,
            seed: info.seed ?? this.authLocal.seed,
            globalSubLane: info.globalSubLane ?? this.authLocal.globalSubLane,
          });
        }
      }
      if (info?.seed && info.seed > 0) {
        this.worldSeed = info.seed;
        this.raceRoomManager.setSeed(info.seed);
      }
      if (typeof info?.globalSubLane === 'number' && info.globalSubLane >= 0) {
        this.laneManager.setAssignedSubLane(info.globalSubLane);
        this.player.x = this.laneManager.getCurrentX();
      }
      const joinedType = characterFromRole(info?.role);
      if (joinedType && joinedType !== this.player.characterType) {
        // Ticket seat won over a stale menu pick — rebuild local sprite.
        const x = this.player.x;
        const y = this.player.y;
        this.player.destroy();
        this.player = new Player(this, x, this.groundY, joinedType);
        this.player.y = y;
        this.actorsLayer.add(this.player);
        this.registry.set(REGISTRY_KEYS.selectedCharacter, joinedType);
        if (this.authLocal) {
          this.authLocal = {
            ...this.authLocal,
            role: joinedType as AuthLocalRaceOptions['role'],
            globalSubLane:
              typeof info?.globalSubLane === 'number'
                ? info.globalSubLane
                : this.authLocal.globalSubLane,
          };
          this.registry.set(REGISTRY_KEYS.authLocalRace, this.authLocal);
        }
      }
      const selfId = client.getSelfUserId();
      if (selfId && !this.remoteRunnerManager) {
        this.remoteRunnerManager = new RemoteRunnerManager(this, this.actorsLayer, selfId, this.groundY);
        // Fair PvP: symmetric gap so both tabs show the same distance between runners.
        if (this.authWorld) {
          this.remoteRunnerManager.setSymmetricGap(true);
        }
      }
      this.wireAuthAbilityGestures();
      const waitSec = Math.max(0, Math.ceil((this.raceStartMs - Date.now()) / 1000));
      this.authRaceStatusText?.setText(
        waitSec > 0 ? `Joined · starting in ${waitSec}s` : 'Joined · GO',
      );
      console.info('[auth-race] joined room', roomId, info);
    } catch (error) {
      console.warn('[auth-race] join failed', error);
      this.authRace?.leave();
      this.authRace = null;
      this.authRaceActive = false;
      // Local multiplayer must not silently become a solo race.
      if (this.authLocal) {
        this.authRaceStatusText?.setText('Join failed — back to menu');
        this.time.delayedCall(1200, () => {
          if (!this.scene.isActive()) {
            return;
          }
          this.registry.set(REGISTRY_KEYS.authLocalRace, null);
          this.scene.start('DevSessionScene');
        });
        return;
      }
    }
  }

  /** Applies sealed standings from the race server and ends the race. */
  private handleAuthFinal(event: FinalMessage): void {
    this.registry.set(REGISTRY_KEYS.authStandings, event.results);
    const selfId = this.authRace?.getSelfUserId();
    const self = event.results.find((r) => r.userId === selfId);
    if (self?.died && !this.playerDied) {
      this.triggerDeath();
      return;
    }
    if (!this.raceFinished) {
      void this.exitToEndScreen(!self?.died);
    }
  }

  /** Wires real-rival rendering + networking handlers when in a room. */
  private setupMultiplayer(): void {
    const info = this.session?.getRoomInfo();
    const localAuthUserId = this.authLocal?.userId;
    if (!info && !localAuthUserId) {
      return;
    }

    this.syncRealPlayerSlots();
    if (this.session && info) {
      void this.session.fetchMembers().then((members) => {
        if (this.scene.isActive()) {
          this.registry.set(REGISTRY_KEYS.roomMembers, members);
          this.syncRealPlayerSlots();
        }
      });

      this.session.onMembers((members) => {
        this.registry.set(REGISTRY_KEYS.roomMembers, members);
        this.syncRealPlayerSlots();
      });
    }

    const localUserId = info?.userId ?? localAuthUserId!;
    this.remoteRunnerManager = new RemoteRunnerManager(
      this,
      this.actorsLayer,
      localUserId,
      this.groundY,
    );

    // Legacy peer snapshots only when the authoritative client is not in use.
    this.session?.onSnapshot((snapshot) => {
      if (this.authRaceActive) {
        return;
      }
      this.remoteRunnerManager?.handleSnapshot(snapshot);
    });
    this.session?.onElimination((event) => this.handleElimination(event));
    this.session?.onAbility((event) => {
      if (event.abilityId !== 'hell-mode') {
        return;
      }
      this.obstacleManager.setHellModeLanes(event.playerMainLane, true);
      this.time.delayedCall(ABILITY_DEFAULT_DURATION_SEC * 1000, () => {
        this.obstacleManager.setHellModeLanes(null, false);
      });
    });
  }


  /** Applies an authoritative elimination from the referee to the right runner. */
  private handleElimination(event: EliminationEvent): void {
    const info = this.session?.getRoomInfo();
    if (!info || !event.targetId) {
      return;
    }
    if (event.targetId === info.userId) {
      this.triggerDeath();
    } else {
      this.remoteRunnerManager?.eliminate(event.targetId);
    }
  }

  /** Builds the local player's broadcast snapshot. */
  private buildSnapshot(info: { userId: string }): PlayerSnapshot {
    return {
      userId: info.userId,
      globalSubLane: this.laneManager.getGlobalSubLaneIndex(),
      x: this.player.x,
      height: Math.max(0, this.groundY - this.player.y),
      distance: this.roadScroll.distanceTraveled,
      alive: !this.playerDied,
      t: Date.now(),
    };
  }

  /** Broadcasts local state at ~12Hz and interpolates rivals every frame. */
  private updateMultiplayer(delta: number): void {
    if (this.authRaceActive && this.authRace && this.remoteRunnerManager) {
      const view = this.authRace.getRenderState();
      // Drive the race clock from the authoritative server when available.
      if (view.phase === 'racing' || view.phase === 'finished') {
        this.elapsedMs = view.raceMs;
      }
      for (const remote of view.remotePlayers) {
        this.remoteRunnerManager.handleSnapshot({
          userId: remote.userId,
          globalSubLane: remote.lane,
          characterType: characterFromRole(remote.role) ?? undefined,
          x: remote.x,
          height: remote.jumpUntilMs > view.raceMs ? ux(28) : 0,
          distance: remote.distance,
          alive: !remote.died && !remote.finished,
          t: Date.now(),
        });
      }
      this.remoteRunnerManager.update(Date.now() - this.interpDelayMs, this.roadScroll.distanceTraveled);

      const self = view.self;
      if (self?.died && !this.playerDied) {
        this.triggerDeath();
      }
      return;
    }

    const info = this.session?.getRoomInfo();
    if (!this.session || !info || !this.remoteRunnerManager) {
      return;
    }

    this.broadcastAccumMs += delta;
    if (this.broadcastAccumMs >= this.broadcastIntervalMs) {
      this.broadcastAccumMs = 0;
      this.session.sendSnapshot(this.buildSnapshot(info));
    }

    const renderTime = Date.now() - this.interpDelayMs;
    this.remoteRunnerManager.update(renderTime, this.roadScroll.distanceTraveled);

    if (!this.playerDied) {
      this.checkRemoteEating(info);
    }
  }

  /**
   * Contested eats vs real players are server-authoritative. Either the eater
   * or the victim may report overlap; the referee validates food-chain rules.
   */
  private checkRemoteEating(info: { userId: string }): void {
    if (!this.session || !this.remoteRunnerManager) {
      return;
    }
    const nowMs = this.time.now;
    if (this.abilityExecutor.isFlightMode(nowMs) || this.abilityExecutor.isBlackrockActive(nowMs)) {
      return;
    }
    if (TUNING.eating.requireGrounded && !this.player.isGroundedOnTrack()) {
      return;
    }

    const px = this.player.x;
    const py = this.player.getHitboxY();
    const now = this.time.now;
    const hReach = ux(TUNING.eating.horizontalReach);
    const vReach = ux(TUNING.eating.verticalReach);
    const immortal = this.abilityExecutor.isEatProtected(nowMs);

    for (const target of this.remoteRunnerManager.getEatTargets()) {
      const dx = Math.abs(px - target.x);
      const dy = Math.abs(py - target.hitboxY);
      if (dx > hReach || dy > vReach) {
        continue;
      }

      const localEatsRemote = canEat(this.player.characterType, target.type);
      const remoteEatsLocal = canEat(target.type, this.player.characterType);
      if (!localEatsRemote && !remoteEatsLocal) {
        continue;
      }
      // SHAREHOLDER — cannot be eaten by rivals.
      if (remoteEatsLocal && !localEatsRemote && immortal) {
        continue;
      }

      const actorId = localEatsRemote ? info.userId : target.userId;
      const targetId = localEatsRemote ? target.userId : info.userId;
      const claimKey = `${actorId}->${targetId}`;
      const next = this.nextClaimByTarget.get(claimKey) ?? 0;
      if (now < next) {
        continue;
      }
      this.nextClaimByTarget.set(claimKey, now + this.eatClaimCooldownMs);
      void this.session.sendEatClaim({
        actorId,
        targetId,
        raceTimeMs: Math.floor(this.elapsedMs),
      });
    }
  }

  private setupGameCamera(): void {
    const camera = this.cameras.main;
    camera.setBackgroundColor(COLORS.road);
    const zoom = this.laneManager.getViewportZoom();
    const pad = this.laneManager.getCameraBoundsPadding();
    camera.setBounds(-pad, 0, this.worldWidth + pad * 2, GAME_HEIGHT);
    camera.setZoom(zoom);
    camera.setScroll(
      this.laneManager.getCameraScrollX(this.laneManager.getCurrentX(), ux(18)),
      0,
    );
  }

  private setupUiCamera(): void {
    this.uiCamera = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.uiCamera.setName('ui');
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    this.cameras.main.ignore(this.hudObjects);
    this.uiCamera.ignore(this.worldContainer);
  }

  private buildWorld(_playerType: CharacterType): void {
    const surfacePad = this.laneManager.getCameraBoundsPadding();
    const surfaceWidth = getWorldSurfaceWidth(this.worldWidth, surfacePad);
    const surfaceCenterX = this.worldWidth / 2;

    this.drawBackground(surfaceWidth, surfaceCenterX);

    const roadBounds = getRoadBounds(this.subLaneWidth);
    this.roadSurface = new RoadSurface(
      this,
      this.propsLayer,
      this.roadScroll,
      roadBounds.width,
      roadBounds.centerX,
    );

    this.roadEdgeMarkers = new RoadEdgeMarkers(
      this,
      this.propsLayer,
      this.roadScroll,
      roadBounds.left,
      roadBounds.right,
    );

    this.lampManager = new RoadsideLampManager(
      this,
      this.lampLayer,
      this.roadScroll,
      this.subLaneWidth,
      this.worldWidth,
    );

    this.laneDividers = createMainLaneDividers(
      this,
      getMainLaneDividerXs(this.subLaneWidth),
      this.propsLayer,
      this.roadScroll,
      this.worldSeed,
    );
    if (this.authWorld) {
      // Reuse the scrolling divider visual, but let the SERVER drive its
      // open/close timing so both tabs agree and lines glide in/out (not pop).
      for (const divider of this.laneDividers) {
        divider.setServerDriven(true);
      }
      this.authWorldRenderer = new AuthWorldRenderer(
        this,
        this.propsLayer,
        this.groundY,
        this.subLaneWidth,
      );
    }

    this.obstacleManager = new ObstacleManager(
      this,
      this.propsLayer,
      this.roadScroll,
      this.worldSeed,
    );
    if (this.registry.get(REGISTRY_KEYS.soloPractice) === true) {
      // Temporary playtest filter.
      this.obstacleManager.setAbilitySpawnFilter([
        'hell-mode',
        'slowdown-other',
        'speed-up',
      ]);
      this.obstacleManager.reset();
    }
    this.lightingManager = new LampLightingManager(
      this,
      this.propsLayer,
      this.darknessLayer,
      this.lightLayer,
      surfaceWidth,
      surfaceCenterX,
    );

  }

  private createHud(): void {
    this.timerText = gameText(this, GAME_WIDTH / 2, getHudTopY(this), this.formatTime(RACE_DURATION_SEC), {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: fontSize(32),
      color: '#ffffff',
      fontStyle: 'bold',
    })
      .setOrigin(0.5)
      .setDepth(100);

    this.distanceText = gameText(this, GAME_WIDTH / 2, getHudSecondRowY(this), '0%', {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: fontSize(16),
      color: '#888888',
    })
      .setOrigin(0.5)
      .setDepth(100);

    this.hudObjects.push(this.timerText, this.distanceText);

    if (isFpsHudRequested() || this.isLab) {
      this.fpsText = gameText(this, ux(8), getHudTopY(this) - ux(14), '', {
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: fontSize(10),
        color: '#9be29b',
        backgroundColor: '#000000aa',
        padding: { x: ux(4), y: ux(2) },
      })
        .setOrigin(0, 0)
        .setDepth(101);
      this.hudObjects.push(this.fpsText);
      this.refreshFpsHud();
    }

    if (this.authLocal) {
      this.authRaceStatusText = gameText(
        this,
        GAME_WIDTH / 2,
        getHudSecondRowY(this) + ux(28),
        'Connecting to race server…',
        {
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: fontSize(14),
          color: '#cccccc',
        },
      )
        .setOrigin(0.5)
        .setDepth(100);
      this.hudObjects.push(this.authRaceStatusText);
    }
  }

  private updateCameraFollow(): void {
    const camera = this.cameras.main;
    const zoom = this.laneManager.getViewportZoom();
    const playerHalfWidth = ux(18);
    const targetScrollX = this.laneManager.getCameraScrollX(this.player.x, playerHalfWidth);
    const viewWidth = GAME_WIDTH / zoom;
    const scrollGap = Math.abs(targetScrollX - camera.scrollX);
    const lerp =
      scrollGap > viewWidth * 0.08
        ? TUNING.lanes.cameraFollowLerpFast
        : TUNING.lanes.cameraFollowLerp;

    camera.setZoom(zoom);
    camera.setScroll(
      Phaser.Math.Linear(camera.scrollX, targetScrollX, lerp),
      0,
    );

    this.lightingManager?.syncToCamera(camera.scrollX, viewWidth);
    if (this.roadBackdrop) {
      const width = viewWidth + ux(16);
      this.roadBackdrop.setPosition(camera.scrollX + viewWidth / 2, GAME_HEIGHT / 2);
      this.roadBackdrop.setSize(width, GAME_HEIGHT);
    }
  }

  private drawBackground(surfaceWidth: number, surfaceCenterX: number): void {
    this.roadBackdrop = this.add
      .rectangle(surfaceCenterX, GAME_HEIGHT / 2, surfaceWidth, GAME_HEIGHT, COLORS.road)
      .setDepth(-3);
    this.propsLayer.add(this.roadBackdrop);
  }

  private handleMoveLeft(): void {
    if (this.raceFinished || this.playerDied || this.isAuthCountdown()) {
      return;
    }
    const result = this.laneManager.moveLeft((index) => this.canCrossDivider(index));
    // Report to the server ONLY the moves the client actually made. Dividers are
    // deterministic (shared seed) so every client agrees; sending a move the
    // divider blocked would desync the authoritative lane from what we render.
    if (result === 'moved') {
      this.authRace?.move('left');
      this.laneManager.tweenToCurrentLane(this, this.player);
    } else if (result === 'blocked') {
      this.laneManager.playLaneRepel(this, this.player, 'left');
    } else if (result === 'death') {
      this.laneManager.tweenToCurrentLane(this, this.player);
      if (this.authWorld) {
        // Off-road death is decided by the server: report the step and wait for
        // the authoritative `died` in the next snapshot (keeps all tabs in sync).
        this.authRace?.move('left');
      } else {
        this.triggerDeath();
      }
    }
  }

  private handleMoveRight(): void {
    if (this.raceFinished || this.playerDied || this.isAuthCountdown()) {
      return;
    }
    const result = this.laneManager.moveRight((index) => this.canCrossDivider(index));
    if (result === 'moved') {
      this.authRace?.move('right');
      this.laneManager.tweenToCurrentLane(this, this.player);
    } else if (result === 'blocked') {
      this.laneManager.playLaneRepel(this, this.player, 'right');
    } else if (result === 'death') {
      this.laneManager.tweenToCurrentLane(this, this.player);
      if (this.authWorld) {
        this.authRace?.move('right');
      } else {
        this.triggerDeath();
      }
    }
  }

  private canCrossDivider(index: 0 | 1): boolean {
    if (this.authWorld) {
      // OPENED BORDERS: server allows the cross even while dividersOpen is false.
      // Without this, the line disappears visually but local prediction still
      // blocks — so the move never even gets sent.
      if (this.authBarriersOpen) {
        return true;
      }
      return this.authDividersOpen[index] ?? true;
    }
    return !this.laneDividers[index]?.blocksCrossingAtY(this.groundY);
  }

  /** True while a local authoritative race is waiting to connect or count down. */
  private isAuthCountdown(): boolean {
    if (!this.authLocal) {
      return false;
    }
    if (this.authRaceWaiting || !this.authRaceActive) {
      return true;
    }
    return this.useWallClock && Date.now() < this.raceStartMs;
  }

  update(_time: number, delta: number): void {
    if (this.raceFinished) {
      return;
    }
    this.sampleFrame(delta);

    // Local authoritative: freeze the world until joined + shared countdown elapses.
    if (this.authLocal && (this.authRaceWaiting || !this.authRaceActive)) {
      this.elapsedMs = 0;
      this.timerText.setText(this.formatTime(RACE_DURATION_SEC));
      this.setTimerUrgency(false);
      this.updateMultiplayer(delta);
      return;
    }

    // Authoritative world: render exactly what the server simulates.
    if (this.authWorld && this.authRaceActive) {
      this.updateAuthoritative(delta);
      return;
    }

    if (this.useWallClock) {
      const untilStart = this.raceStartMs - Date.now();
      if (untilStart > 0) {
        this.elapsedMs = 0;
        const sec = Math.ceil(untilStart / 1000);
        this.timerText.setText(`${sec}`);
        this.setTimerUrgency(false);
        this.authRaceStatusText?.setText(`Starting in ${sec}…`);
        this.distanceText.setText('0%');
        this.updateMultiplayer(delta);
        return;
      }
      this.authRaceStatusText?.setText('');
      this.elapsedMs = Math.max(0, Date.now() - this.raceStartMs);
    } else {
      this.elapsedMs += delta;
    }
    const remainingSec = Math.max(0, RACE_DURATION_SEC - this.elapsedMs / 1000);
    if (this.isLab) {
      this.timerText.setText(`LAB ${this.formatTime(Math.floor(this.elapsedMs / 1000))}`);
      this.setTimerUrgency(false);
    } else {
      this.timerText.setText(this.formatTime(remainingSec));
      this.setTimerUrgency(remainingSec <= 10 && remainingSec > 0);
    }

    const progress = Math.min(1, this.roadScroll.distanceTraveled / RACE_DISTANCE);
    this.distanceText.setText(`${Math.floor(progress * 100)}%`);

    if (!this.playerDied) {
      const nowMs = this.time.now;
      this.abilityExecutor.tickTimedEffects(nowMs);
      this.syringeThrowManager?.update(nowMs);
      this.passportPlacementManager?.update(nowMs);

      const { progressMult } = this.applyPlayerObstacleEffects();
      const worldDelta = this.useWallClock
        ? this.roadScroll.stepToWorldDistance(
            (this.elapsedMs / 1000) * this.roadScroll.worldSpeedPxPerSec,
            progressMult,
          )
        : this.roadScroll.step(delta, progressMult);
      this.obstacleManager.tickSpawning(delta, RACE_DISTANCE);
      this.lampManager.tickSpawning(delta, RACE_DISTANCE);
      this.player.updatePhysics(delta);
      this.applyPlayerRaceVisual();
      if (this.npcManager) {
        this.npcManager.stepWorldProgress(
          worldDelta,
          this.groundY,
          nowMs,
          this.obstacleManager,
          this.abilityExecutor.isNpcSlow(nowMs),
        );
        this.npcManager.tickAlignTweens(
          nowMs,
          this.roadScroll.distanceTraveled,
          this.groundY,
        );
        const playerAnchor = this.raceRoomManager.isMultiplayer() || this.npcManager
          ? this.roadScroll.distanceTraveled
          : undefined;
        this.npcManager.applyAheadVisual(
          this.groundY,
          this.roadScroll.worldDistanceTraveled,
          playerAnchor,
        );
      }
      this.updateCameraFollow();
      this.enforceDividerCollisions();
      this.checkOffRoadDeath();
      this.checkEating();
      this.dilemmaManager.tick(this.player, this.time.now);
      this.updateLighting();
      this.player.tickFootsteps();
      this.audioManager.tick(delta);
      this.checkCollisions();
    }

    this.updateMultiplayer(delta);

    if (this.isLab) {
      return;
    }

    // All rooms share a fixed 60-second window. A speed boost may reach 100%
    // early, but it must not end one client's race while peers still race.
    if (remainingSec <= 0 && !this.playerDied) {
      this.completeRace();
    }
  }

  /**
   * The authoritative render loop. The client is a pure renderer here: the whole
   * world (hazards, dividers, progress, death) comes from the server; we only
   * predict our own lane/jump for responsiveness and send eat/ability intents.
   */
  private updateAuthoritative(delta: number): void {
    if (!this.authRace || !this.remoteRunnerManager) {
      return;
    }
    const view = this.authRace.getRenderState();
    this.authDividersOpen = view.dividersOpen;
    const self = view.self;

    // ---- Countdown (world frozen) ----
    if (view.phase !== 'racing' && view.phase !== 'finished') {
      const untilStart = Math.max(0, view.startsAtMs - Date.now());
      const sec = Math.ceil(untilStart / 1000);
      this.elapsedMs = 0;
      this.timerText.setText(sec > 0 ? `${sec}` : this.formatTime(RACE_DURATION_SEC));
      this.setTimerUrgency(false);
      this.authRaceStatusText?.setText(sec > 0 ? `Starting in ${sec}…` : '');
      this.distanceText.setText('0%');
      this.driveDividers(view.dividersOpen);
      this.renderRivals(view.remotePlayers, view.raceMs, self ? self.distance : 0);
      this.authWorldRenderer?.render(view.hazards, 0, this.authRace.getSelfUserId());
      return;
    }
    this.authRaceStatusText?.setText('');
    this.elapsedMs = view.raceMs;

    // ---- Drive the visual world from the shared extrapolated distance ----
    // self + rivals all advance from the same snapshot age, so the road is
    // smooth between 20Hz packets and the gap matches on both screens.
    // Server distances are logical px; road scroll / screen space are DPR-scaled.
    const renderDistance = self
      ? self.distance
      : this.roadScroll.distanceTraveled / Math.max(DISPLAY_DPR, 1);
    this.roadScroll.stepToWorldDistance(ux(renderDistance), 1);
    this.driveDividers(view.dividersOpen);

    // ---- HUD ----
    const remainingSec = Math.max(0, RACE_DURATION_SEC - this.elapsedMs / 1000);
    this.timerText.setText(this.formatTime(remainingSec));
    this.setTimerUrgency(remainingSec <= 10 && remainingSec > 0);
    const progress = Math.min(1, ux(renderDistance) / RACE_DISTANCE);
    this.distanceText.setText(`${Math.floor(progress * 100)}%`);

    // ---- Local runner: predicted lane + jump physics, authoritative status ----
    if (self && !this.playerDied) {
      this.player.updatePhysics(delta);
      // Prefer predicted lane (includes unacked moves). Soft-correct without
      // killing an in-flight lane tween every frame (that felt like lag).
      const localLane = this.laneManager.getGlobalSubLaneIndex();
      if (self.lane !== localLane) {
        this.laneManager.setAssignedSubLane(self.lane);
        this.player.x = this.laneManager.getCurrentX();
      }
      if (this.player.isGroundedOnTrack() && !this.player.isFlightModeVisual()) {
        this.player.y = this.groundY;
      }
      this.applyAuthSelfVisual(self);
      this.syncAuthAbilities(self.abilities);
    }

    // ---- Rivals + world (both anchored to the same smoothed distance) ----
    this.renderRivals(view.remotePlayers, view.raceMs, renderDistance);
    this.authWorldRenderer?.render(view.hazards, renderDistance, this.authRace.getSelfUserId());
    this.lampManager.tickSpawning(delta, RACE_DISTANCE);

    // ---- Intents + presentation ----
    if (self && !this.playerDied) {
      this.checkAuthEating();
      const nowMs = this.time.now;
      this.abilityExecutor.tickTimedEffects(nowMs);
      this.syringeThrowManager?.update(nowMs);
      this.passportPlacementManager?.update(nowMs);
      // Auth dilemma overlay timer only (server owns start/resolve).
      this.dilemmaManager.tick(this.player, nowMs);
    }
    this.updateCameraFollow();
    this.player.tickFootsteps();
    this.updateLighting();
    this.audioManager.tick(delta);

    // ---- Authoritative death ----
    if (self?.died && !this.playerDied) {
      this.triggerDeath();
    }
  }

  /** Drives the scrolling divider lines from the authoritative open/closed state. */
  private driveDividers(dividersOpen: boolean[]): void {
    this.laneDividers.forEach((divider, index) => {
      divider.setServerOpen(dividersOpen[index] ?? true);
    });
  }

  /** Reflects server-side effect flags on the local runner's visuals. */
  private applyAuthSelfVisual(self: {
    sliding: boolean;
    stalled: boolean;
    boosted: boolean;
    barriersOpen: boolean;
    flight: boolean;
    flashlight: boolean;
    slowed: boolean;
    blackrock: boolean;
    eatProtected: boolean;
    hellMode: boolean;
  }): void {
    this.authBarriersOpen = self.barriersOpen;
    const nowMs = this.time.now;
    // Refresh local timers from the server — otherwise tickTimedEffects clears
    // flight/flashlight every frame (auth activate is visual-only).
    this.abilityExecutor.syncAuthServerFlags(nowMs, {
      flashlight: self.flashlight,
      flight: self.flight,
      barriersOpen: self.barriersOpen,
      blackrock: self.blackrock,
      eatProtected: self.eatProtected,
      hellMode: self.hellMode,
      slowed: self.slowed,
    });
    this.player.setPuddleSlideVisual(self.sliding);
    this.player.setSpeedBoostVisual(self.boosted);
    this.player.setSpeedStreakVisual(self.boosted || self.sliding);
    // Stuck / stalled / rival slow reads as a slow streak.
    this.player.setSlowStreakVisual(self.stalled || self.slowed);
    this.player.setFlightModeVisual(self.flight);
    for (const divider of this.laneDividers) {
      divider.setForcedOpen(self.barriersOpen);
    }
    this.lightingManager.setFlashlightBoost(self.flashlight);
  }

  /**
   * Mirror server ability inventory into the HUD. Solo collects via ObstacleManager;
   * authoritative races grant on the server — without this, briefcases never appear.
   */
  private syncAuthAbilities(serverAbilities: string[]): void {
    const local = this.abilityInventory.readonlySlots();
    if (
      local.length === serverAbilities.length &&
      local.every((id, index) => id === serverAbilities[index])
    ) {
      return;
    }
    const prevCount = local.length;
    this.abilityInventory.reset();
    for (const id of serverAbilities) {
      this.abilityInventory.add(id);
    }
    this.abilityHud.refresh();
    if (serverAbilities.length > prevCount) {
      const newest = serverAbilities[serverAbilities.length - 1];
      try {
        this.abilityHud.showToast(`${getAbility(newest).name} armed — tap to use`);
      } catch {
        this.abilityHud.showToast('Ability armed — tap to use');
      }
    }
  }

  /**
   * Places rivals for authoritative mode. Rival + self distances come from the
   * same snapshot + elapsed time (getRenderState), so the gap is identical on
   * both screens and a stuck rival genuinely climbs off the top. We intentionally
   * do NOT run RemotePlayer's own interpolation here — that second, jitter-based
   * pass was what made the two tabs disagree.
   */
  private renderRivals(
    remotePlayers: ReturnType<AuthoritativeRaceClient['getRenderState']>['remotePlayers'],
    raceMs: number,
    selfDistance: number,
  ): void {
    if (!this.remoteRunnerManager) {
      return;
    }
    for (const remote of remotePlayers) {
      const characterType =
        characterFromRole(remote.role) ?? characterFromGlobalSubLane(remote.lane);
      this.remoteRunnerManager.placeRival({
        userId: remote.userId,
        characterType,
        globalSubLane: remote.lane,
        x: remote.x,
        height: remote.jumpUntilMs > raceMs ? ux(28) : 0,
        gap: remote.distance - selfDistance,
        alive: !remote.died && !remote.finished,
      });
    }
  }

  /** Sends an eat intent when the local runner overlaps valid prey. Server decides. */
  private checkAuthEating(): void {
    if (!this.authRace || !this.remoteRunnerManager) {
      return;
    }
    if (TUNING.eating.requireGrounded && !this.player.isGroundedOnTrack()) {
      return;
    }
    const px = this.player.x;
    const py = this.player.getHitboxY();
    const hReach = ux(TUNING.eating.horizontalReach);
    const vReach = ux(TUNING.eating.verticalReach);
    const now = this.time.now;
    for (const target of this.remoteRunnerManager.getEatTargets()) {
      if (!canEat(this.player.characterType, target.type)) {
        continue;
      }
      if (Math.abs(px - target.x) > hReach || Math.abs(py - target.hitboxY) > vReach) {
        continue;
      }
      const next = this.nextClaimByTarget.get(target.userId) ?? 0;
      if (now < next) {
        continue;
      }
      this.nextClaimByTarget.set(target.userId, now + this.eatClaimCooldownMs);
      this.authRace.eat(target.userId);
    }
  }

  private enforceDividerCollisions(): void {
    const previousX = this.player.x;
    let x = previousX;
    const globalIndex = this.laneManager.getGlobalSubLaneIndex();

    for (const divider of this.laneDividers) {
      x = divider.clampPlayerX(x, globalIndex, this.groundY);
    }

    if (x !== previousX) {
      const direction = x < previousX ? 'right' : 'left';
      this.player.x = x;
      this.tweens.killTweensOf(this.player);
      this.laneManager.playLaneRepel(this, this.player, direction);
    }
  }

  private checkOffRoadDeath(): void {
    if (this.isLab && this.labGodMode) {
      return;
    }
    if (this.abilityExecutor.isBarriersDisabled(this.time.now)) {
      return;
    }
    if (this.laneManager.isPlayerOffRoad(this.player.x)) {
      this.triggerDeath();
    }
  }

  private checkEating(): void {
    if (this.playerDied) {
      return;
    }
    const nowMs = this.time.now;
    // DAVOS — above the pack; no eat interactions.
    if (this.abilityExecutor.isFlightMode(nowMs)) {
      return;
    }

    // BLACKROCK — anyone who touches you dies; no normal food-chain eats.
    if (this.abilityExecutor.isBlackrockActive(nowMs)) {
      this.npcManager?.touchKillNearPlayer(this.player);
      this.touchKillRemotesBlackrock();
      return;
    }

    if (!this.npcManager) {
      return;
    }
    const immortal =
      this.abilityExecutor.isEatProtected(nowMs) || (this.isLab && this.labGodMode);
    const outcome = this.npcManager.checkEating(this.player, immortal);
    if (outcome?.kind === 'player-died') {
      this.triggerDeath();
    }
  }

  /** BLACKROCK vs real rivals — same touch reach as eats, instant eliminate. */
  private touchKillRemotesBlackrock(): void {
    if (!this.session || !this.remoteRunnerManager) {
      return;
    }
    const px = this.player.x;
    const py = this.player.getHitboxY();
    const hReach = ux(TUNING.eating.horizontalReach);
    const vReach = ux(TUNING.eating.verticalReach);
    for (const target of this.remoteRunnerManager.getEatTargets()) {
      if (
        Math.abs(px - target.x) <= hReach &&
        Math.abs(py - target.hitboxY) <= vReach
      ) {
        void this.session.sendSyringeElimination(target.userId, Math.floor(this.elapsedMs));
      }
    }
  }

  private updateLighting(): void {
    const nowMs = this.time.now;
    const flashlightActive = this.abilityExecutor.isFlashlight(nowMs);
    this.lightingManager.updateFlashlightCone(
      flashlightActive,
      this.player.x,
      this.player.y,
      getSubLaneWidth(),
      getCharacterDisplaySize(this.player.characterType).height,
    );

    // Reuse one array per frame — the old spread of three lists allocated
    // several short-lived arrays/objects every frame (GC hitches on phones).
    const runners = this.lightingRunners;
    runners.length = 0;
    this.pushRunnerPoint(this.player);
    this.remoteRunnerManager?.collectVisibleRunners((runner) => this.pushRunnerPoint(runner));
    this.npcManager?.collectVisibleRunners((runner) => this.pushRunnerPoint(runner));
    const lamps = this.lampManager.getActiveLamps();
    this.lightingManager.update(lamps, runners);
    this.audioManager.updateLampHum(this.player.x, this.groundY, lamps);
  }

  private pushRunnerPoint(runner: RunnerCharacter): void {
    const list = this.lightingRunners;
    let point = this.lightingRunnerPool[list.length];
    if (!point) {
      point = { x: 0, y: 0, runner };
      this.lightingRunnerPool[list.length] = point;
    }
    point.x = runner.x;
    point.y = runner.y;
    point.runner = runner;
    list.push(point);
  }

  /**
   * Solo: shift the player up when race progress lags the scrolling world (trash/puddle).
   *
   * Multiplayer: local player stays on the anchor line at `groundY`; rivals and bots
   * move relative to your broadcast progress instead — slowdown reads as others passing you.
   */
  private applyPlayerRaceVisual(): void {
    if (!this.player.isGroundedOnTrack() || this.player.getIsDead()) {
      return;
    }

    this.player.y = this.getPlayerFeetYForObstacles();
  }

  /**
   * Where the runner's feet are on screen.
   *
   * With rivals present (solo NPCs or multiplayer), stay on the ground anchor —
   * pack order is shown by moving others relative to you. Applying a world
   * lead/lag offset here while tied rivals stay on `groundY` makes a shared
   * puddle boost look like they pulled ahead (you drop below the pack line).
   *
   * True solo / no rivals: keep world lead/lag offset for feedback.
   */
  private getPlayerFeetYForObstacles(): number {
    if (this.raceRoomManager.isMultiplayer() || this.npcManager) {
      return this.groundY;
    }
    if (!this.player.isGroundedOnTrack()) {
      return this.player.y;
    }
    const progressGap =
      this.roadScroll.worldDistanceTraveled - this.roadScroll.distanceTraveled;
    return this.groundY - raceProgressGapToVisualOffset(progressGap);
  }

  /**
   * Player-only obstacle effects; road + NPCs always scroll at full speed.
   * Trash auto-jumps (progress lags while airborne); puddles slide-boost briefly.
   */
  private applyPlayerObstacleEffects(): { progressMult: number } {
    const cfg = TUNING.obstacles;
    const nowMs = this.time.now;
    const playerGlobalLane = this.laneManager.getGlobalSubLaneIndex();
    const shareholder = this.abilityExecutor.isEatProtected(nowMs);
    const flying = this.abilityExecutor.isFlightMode(nowMs);
    const grounded = this.player.isGroundedOnTrack();
    const runnerHalfW = getCharacterDisplaySize(this.player.characterType).width / 2;
    // Solo shifts the sprite with race lag/lead; manhole hits must use that Y or
    // death reads early/late vs the hole on screen.
    const feetY = this.getPlayerFeetYForObstacles();
    let onPuddle = false;

    // DAVOS — airborne: no hazards, no briefcase pickups. Trash stays in the world.
    if (flying) {
      this.player.setPuddleSlideVisual(false);
      this.player.setSpeedStreakVisual(false);
      this.player.setSlowStreakVisual(false);
      this.wasOnPuddle = false;
      return this.applyProgressMultipliers(nowMs);
    }

    if (grounded) {
      for (const obs of this.obstacleManager.getAll()) {
        if (
          (obs.type === 'trash' || obs.type === 'passport') &&
          trashJumpContact(
            obs,
            this.player.x,
            feetY,
            runnerHalfW,
            playerGlobalLane,
            this.player,
          )
        ) {
          markTrashJumpCleared(obs, this.player);
          this.player.autoJumpOverTrash();
        } else if (
          obs.type === 'ability' &&
          abilityContact(obs, this.player.x, feetY, runnerHalfW, playerGlobalLane)
        ) {
          this.collectAbility(obs);
          break;
        }
      }
    }

    for (const obs of this.obstacleManager.getAll()) {
      if (obs.type === 'trash' || obs.type === 'ability' || obs.type === 'passport' || obs.type === 'straw') {
        continue;
      }

      if (obs.type === 'puddle') {
        if (puddleContact(obs, this.player.x, feetY, runnerHalfW, playerGlobalLane)) {
          onPuddle = true;
        }
        continue;
      }

      if (obs.type === 'manhole') {
        // SHAREHOLDER ignores open manholes. Closed = always safe.
        if (
          grounded &&
          obs.manholeState === 'open' &&
          !shareholder &&
          !(this.isLab && this.labGodMode) &&
          manholeContact(
            obs,
            this.player.x,
            feetY,
            runnerHalfW,
            playerGlobalLane,
            obs.prevY,
            this.player,
          )
        ) {
          markManholeFellIn(obs, this.player);
          this.triggerDeath({ blood: false });
          return { progressMult: 1 };
        }
        continue;
      }

      if (
        !obstacleOverlapsPlayer(
          obs,
          this.player.x,
          this.player.y,
          playerGlobalLane,
          this.groundY,
          runnerHalfW,
        )
      ) {
        continue;
      }
    }

    if (onPuddle && !this.wasOnPuddle) {
      this.puddleSlideEndMs = nowMs + cfg.puddleSlideDurationSec * 1000;
      this.player.setPuddleSlideVisual(true);
    }
    if (this.time.now >= this.puddleSlideEndMs) {
      this.player.setPuddleSlideVisual(false);
    }
    this.wasOnPuddle = onPuddle;

    return this.applyProgressMultipliers(nowMs);
  }

  private applyProgressMultipliers(nowMs: number): { progressMult: number } {
    const cfg = TUNING.obstacles;
    const puddleSlideActive = nowMs < this.puddleSlideEndMs;
    const boostActive = nowMs < this.speedBoostEndMs;

    let progressMult = 1;
    if (this.player.isTrashAutoJumpInAir()) {
      progressMult = cfg.trashJumpProgressMultiplier;
    } else if (puddleSlideActive) {
      progressMult = cfg.puddleSlideBoostMultiplier;
    }

    if (boostActive) {
      progressMult *= this.speedBoostMultiplier;
      this.player.setSpeedBoostVisual(true, this.speedBoostMultiplier);
    } else {
      this.speedBoostMultiplier = 1;
      this.player.setSpeedBoostVisual(false);
    }

    // Shared speed / slow indicators — same look for every cause.
    this.player.setSpeedStreakVisual(progressMult > 1);
    this.player.setSlowStreakVisual(progressMult < 1);

    this.roadScroll.setPlayerProgressMultiplier(progressMult);
    return { progressMult };
  }

  /** Unity `AbilityTrigger` — store in inventory; newest is armed. */
  private collectAbility(obs: ObstacleHandle): void {
    if (!obs.abilityId) {
      return;
    }
    if (this.abilityInventory.isFull) {
      return;
    }
    const ability = getAbility(obs.abilityId);
    if (!this.abilityInventory.add(obs.abilityId)) {
      return;
    }
    this.obstacleManager.removeObstacle(obs);
    this.abilityHud.refresh();
    this.abilityHud.showToast(`${ability.name} armed — tap to use`);
  }

  private tryActivateArmedAbility(): void {
    const abilityId = this.abilityInventory.consumeArmed();
    if (!abilityId) {
      return;
    }
    // Auth: local VFX / arm gestures only; server owns gameplay effects.
    this.abilityExecutor.activate(abilityId, this.authWorld);
    if (this.authWorld && this.authRace) {
      // Deferred abilities arm without aim; throw/place sends aim next.
      this.authRace.activate(abilityId);
    }
    if (getAbility(abilityId).kind === 'hellMode') {
      this.session?.sendAbility({
        abilityId,
        playerMainLane: this.laneManager.getMainLane(),
      });
    }
    this.abilityHud.refresh();
  }

  /** Syringe / passport / straw aim → logical coords for the race server. */
  private wireAuthAbilityGestures(): void {
    this.syringeThrowManager?.setOnThrowLand((worldX, worldY) => {
      if (!this.authRace) {
        return;
      }
      const aimX = worldX / DISPLAY_DPR;
      // Approximate rival distance from screen Y relative to ground.
      const aheadScreen = this.groundY - worldY;
      const selfDist = this.authRace.getRenderState().self?.distance ?? 0;
      const aimY = selfDist + aheadScreen / DISPLAY_DPR;
      this.authRace.activate('needle-spawner', aimX, aimY);
    });
    this.passportPlacementManager?.setAuthPlaceHandler((kind, logicalX, aheadLogical) => {
      if (!this.authRace) {
        return;
      }
      const abilityId = kind === 'passport' ? 'enable-id' : 'straw-spawner';
      this.authRace.activate(abilityId, logicalX, aheadLogical);
    });
  }

  private handleAuthAbilityEvent(event: {
    actorId: string;
    abilityId: string;
    eliminatedIds?: string[];
  }): void {
    const selfId = this.authRace?.getSelfUserId();
    // Local activate already toasted/VFX'd; rivals get a short notice.
    if (event.actorId !== selfId) {
      try {
        this.abilityHud.showToast(getAbility(event.abilityId).name);
      } catch {
        // Unknown ability id.
      }
    }
    for (const id of event.eliminatedIds ?? []) {
      if (id === selfId) {
        if (!this.playerDied) {
          this.triggerDeath();
        }
      } else {
        this.remoteRunnerManager?.eliminate(id);
      }
    }
  }

  private handleAuthDilemmaEvent(event: {
    type: 'start' | 'resolve';
    encounterId: string;
    aId: string;
    bId: string;
    deadlineRaceMs?: number;
  }): void {
    const selfId = this.authRace?.getSelfUserId();
    if (!selfId) {
      return;
    }
    if (event.type === 'start') {
      if (event.aId !== selfId && event.bId !== selfId) {
        return;
      }
      const rivalId = event.aId === selfId ? event.bId : event.aId;
      const raceMs = this.authRace?.raceMs() ?? 0;
      const remaining = Math.max(500, (event.deadlineRaceMs ?? raceMs + 2000) - raceMs);
      this.dilemmaManager.beginAuthEncounter(
        event.encounterId,
        rivalId,
        this.time.now + remaining,
        (choice) => this.authRace?.dilemmaChoice(event.encounterId, choice),
      );
      return;
    }
    this.dilemmaManager.endAuthEncounter();
  }

  /** Wuhan Lab Juice can hit a bot or a real rival across open/closed lane lines. */
  private trySyringeHitAt(worldX: number, worldY: number): boolean {
    if (this.npcManager?.trySyringeHit(worldX, worldY)) {
      return true;
    }

    const reachX = ux(44);
    const reachY = ux(52);
    const target = this.remoteRunnerManager
      ?.getEatTargets()
      .find((rival) => Math.abs(worldX - rival.x) <= reachX && Math.abs(worldY - rival.hitboxY) <= reachY);
    if (!target) {
      return false;
    }

    void this.session?.sendSyringeElimination(target.userId, Math.floor(this.elapsedMs));
    return true;
  }

  private checkCollisions(): void {
    // Puddles and manholes handled in applyPlayerObstacleEffects.
  }

  /**
   * Feeds the frame monitor while the world is actually moving (not during the
   * lobby countdown) and refreshes the optional FPS readout twice a second.
   */
  private sampleFrame(delta: number): void {
    const racing = this.elapsedMs > 0 || this.isLab;
    if (racing && !this.playerDied) {
      // rawDelta = real frame gap; `delta` is Phaser's smoothed value.
      this.frameMonitor.sample(this.game.loop.rawDelta || delta);
    }
    if (!this.fpsText) {
      return;
    }
    this.fpsTextAccumMs += delta;
    if (this.fpsTextAccumMs >= 500) {
      this.fpsTextAccumMs = 0;
      this.refreshFpsHud();
    }
  }

  private refreshFpsHud(): void {
    if (!this.fpsText) {
      return;
    }
    const fps = this.frameMonitor.fps;
    const slowPct = Math.round(this.frameMonitor.recentSlowShare * 100);
    this.fpsText.setText([
      `${fps > 0 ? Math.round(fps) : '--'} fps · ${slowPct}% slow`,
      `DPR ${DISPLAY_DPR.toFixed(2)} · ${PERF_PROFILE.tier} (${PERF_PROFILE.source})`,
    ]);
  }

  /**
   * End of race: if most of it ran with hitches, remember the low tier so the
   * next launch renders at a lighter resolution. Explicit `?perf=` wins.
   */
  private concludeFrameMonitor(): void {
    if (this.frameMonitorConcluded || this.isLab) {
      return;
    }
    this.frameMonitorConcluded = true;
    const monitor = this.frameMonitor;
    if (monitor.sampledFrames === 0) {
      return;
    }
    const summary =
      `avg ${monitor.averageFps.toFixed(1)} fps, ` +
      `${Math.round(monitor.slowShare * 100)}% slow frames over ${monitor.sampledFrames} frames`;
    const verdict = recordRaceQuality(monitor.ranPoorly());
    if (verdict === 'downgraded') {
      console.info(`[perf] race ran poorly (${summary}) — next launch uses the low tier`);
      return;
    }
    if (verdict === 'poor') {
      console.info(`[perf] race ran poorly (${summary}) — one more and the low tier kicks in`);
      return;
    }
    console.info(`[perf] race frames: ${summary} (tier ${PERF_PROFILE.tier})`);
  }

  /** Last 10s — larger timer with a soft pulse. */
  private setTimerUrgency(urgent: boolean): void {
    if (urgent) {
      if (this.timerPulseTween) {
        return;
      }
      this.timerText.setFontSize(fontSize(48));
      this.timerText.setScale(1);
      this.timerText.setAlpha(1);
      this.timerPulseTween = this.tweens.add({
        targets: this.timerText,
        scaleX: 1.14,
        scaleY: 1.14,
        alpha: 0.72,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return;
    }

    if (!this.timerPulseTween) {
      return;
    }
    this.timerPulseTween.stop();
    this.timerPulseTween = null;
    this.timerText.setFontSize(fontSize(32));
    this.timerText.setScale(1);
    this.timerText.setAlpha(1);
  }

  private triggerDeath(options?: { blood?: boolean }): void {
    if (this.playerDied) {
      return;
    }
    if (this.isLab && this.labGodMode) {
      return;
    }
    this.playerDied = true;
    this.player.onFootstep = null;
    this.roadScroll.setPlayerProgressMultiplier(1);
    this.player.die(options);
    this.audioManager.stopRace();
    this.concludeFrameMonitor();
    // Make local deaths visible to standings immediately; the death animation
    // still gets its full screen delay before opening EndScene.
    // Authoritative races seal standings on the server — do not client-report.
    if (!this.authRaceActive) {
      void this.session?.reportResult(false, true, null);
    }

    this.time.delayedCall(TUNING.death.screenDelayMs, () => {
      void this.exitToEndScreen(false);
    });
  }

  private completeRace(): void {
    this.raceFinished = true;
    this.player.onFootstep = null;
    this.audioManager.stopRace();
    this.concludeFrameMonitor();
    // Race window elapsed — close the room for everyone (idempotent, guarded).
    // Authoritative races are sealed by the race server; skip client finishRoom.
    if (!this.authRaceActive) {
      void this.session?.finishRoom();
    }
    void this.exitToEndScreen(true);
  }

  private async exitToEndScreen(finished: boolean): Promise<void> {
    this.concludeFrameMonitor();
    this.registry.set(REGISTRY_KEYS.raceFinished, finished);
    this.registry.set(REGISTRY_KEYS.raceTimeMs, this.elapsedMs);
    this.registry.set(REGISTRY_KEYS.playerDied, this.playerDied);

    if (this.raceRoomManager.isMultiplayer() && !this.authRaceActive) {
      await this.session?.reportResult(
        finished,
        this.playerDied,
        finished && !this.playerDied ? Math.floor(this.elapsedMs) : null,
      );
    }

    if (!this.scene.isActive()) {
      return;
    }

    this.inputManager.destroy();
    this.scene.start('EndScene');
  }

  private formatTime(totalSec: number): string {
    const sec = Math.ceil(totalSec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  shutdown(): void {
    this.setTimerUrgency(false);
    // Detach networking handlers before tearing down rivals so a late packet
    // doesn't touch destroyed objects. The session itself outlives the scene.
    if (this.session) {
      this.session.onSnapshot(() => {});
      this.session.onElimination(() => {});
      this.session.onMembers(() => {});
      this.session.onDilemmaStart(() => {});
      this.session.onDilemmaChoice(() => {});
      this.session.onAbility(() => {});
    }
    this.authRace?.leave();
    this.authRace = null;
    this.authRaceActive = false;
    // Keep authLocalRace / authStandings for EndScene; cleared there.
    this.remoteRunnerManager?.destroy();
    this.remoteRunnerManager = null;
    this.authWorldRenderer?.destroy();
    this.authWorldRenderer = null;
    this.inputManager?.destroy();
    this.obstacleManager?.destroy();
    this.roadSurface?.destroy();
    this.roadEdgeMarkers?.destroy();
    this.lampManager?.destroy();
    this.lightingManager?.destroy();
    this.dilemmaManager?.destroy();
    this.raceRoomManager?.destroy();
    this.laneDividers.forEach((divider) => divider.destroy());
    this.audioManager?.destroy();
    this.abilityLabPanel?.destroy();
    this.abilityLabPanel = null;
    this.syringeThrowManager?.destroy();
    this.syringeThrowManager = null;
    this.passportPlacementManager?.destroy();
    this.passportPlacementManager = null;
    this.abilityExecutor?.destroy();
  }
}
