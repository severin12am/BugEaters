import {
  PRISONERS_DILEMMA_TUNING,
  type DilemmaChoice,
  type DilemmaOutcome,
} from '../config/prisonersDilemma';
import type { Player } from '../entities/Player';
import type { RoomSession } from '../net/RoomSession';
import type { DilemmaChoiceEvent, DilemmaStartEvent } from '../net/types';
import { COLORS, GAME_HEIGHT, GAME_WIDTH, ux } from '../utils/constants';
import { gameText } from '../utils/display';
import { fontSize } from '../utils/layout';
import type { NpcEntry, NpcManager } from './NpcManager';
import type { RemoteEatTarget, RemoteRunnerManager } from './RemoteRunnerManager';
import { CharacterType } from '../utils/constants';

export interface DilemmaCallbacks {
  onPlayerDeath: () => void;
  onPlayerSpeedBoost: (multiplier: number, durationSec: number) => void;
  registerHudObject: (obj: Phaser.GameObjects.GameObject) => void;
  /** Race clock for referee claims (ms). */
  getRaceTimeMs: () => number;
}

interface RemoteEncounter {
  encounterId: string;
  initiatorId: string;
  targetId: string;
  myChoice: DilemmaChoice | null;
  theirChoice: DilemmaChoice | null;
  deadlineMs: number;
}

/**
 * Same-species proximity → Cooperate / Eat choice with outcomes.
 * Works against filler NPCs and real remote rivals (synced via broadcast).
 */
export class PrisonersDilemmaManager {
  private activeNpc: NpcEntry | null = null;
  private activeRemote: RemoteEatTarget | null = null;
  private activeEncounterId: string | null = null;
  private choiceDeadlineMs = 0;
  private overlayVisible = false;
  private autoCooperatePending = false;
  /** Each NPC slot can trigger at most one dilemma per race. */
  private readonly encounteredNpcSlots = new Set<number>();
  /** Each remote rival can trigger at most one dilemma per race. */
  private readonly encounteredRemoteIds = new Set<string>();
  private readonly pendingEncounters = new Map<string, RemoteEncounter>();
  /** Authoritative-race choice sink (server resolves outcomes). */
  private authChoiceHandler: ((choice: DilemmaChoice) => void) | null = null;
  private hud: {
    panel: Phaser.GameObjects.Rectangle;
    timer: Phaser.GameObjects.Text;
    cooperateBtn: Phaser.GameObjects.Rectangle;
    eatBtn: Phaser.GameObjects.Rectangle;
    cooperateLabel: Phaser.GameObjects.Text;
    eatLabel: Phaser.GameObjects.Text;
  } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly npcManager: NpcManager | null,
    private readonly callbacks: DilemmaCallbacks,
    private readonly remoteRunnerManager: RemoteRunnerManager | null = null,
    private readonly session: RoomSession | null = null,
    private readonly localUserId: string | null = null,
  ) {
    this.buildUi();
    this.wireNetwork();
  }

  private wireNetwork(): void {
    if (!this.session) {
      return;
    }

    this.session.onDilemmaStart((event) => this.handleRemoteStart(event));
    this.session.onDilemmaChoice((event) => this.handleRemoteChoice(event));
  }

  private buildUi(): void {
    const y = GAME_HEIGHT - ux(200);
    const panel = this.scene.add
      .rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - ux(40), ux(150), COLORS.darkGray, 0.92)
      .setDepth(200)
      .setVisible(false);

    const timer = gameText(this.scene, GAME_WIDTH / 2, y - ux(28), '', {
      fontSize: fontSize(14),
      color: '#888888',
    })
      .setOrigin(0.5)
      .setDepth(201)
      .setVisible(false);

    const btnW = ux(130);
    const btnH = ux(48);
    const cooperateBtn = this.scene.add
      .rectangle(GAME_WIDTH / 2 - ux(80), y + ux(28), btnW, btnH, COLORS.white)
      .setDepth(201)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    const eatBtn = this.scene.add
      .rectangle(GAME_WIDTH / 2 + ux(80), y + ux(28), btnW, btnH, COLORS.black)
      .setDepth(201)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });

    const cooperateLabel = gameText(this.scene, cooperateBtn.x, cooperateBtn.y, 'COOPERATE', {
      fontSize: fontSize(16),
      color: '#000000',
      fontStyle: 'bold',
    })
      .setOrigin(0.5)
      .setDepth(202)
      .setVisible(false);

    const eatLabel = gameText(this.scene, eatBtn.x, eatBtn.y, 'EAT', {
      fontSize: fontSize(16),
      color: '#ffffff',
      fontStyle: 'bold',
    })
      .setOrigin(0.5)
      .setDepth(202)
      .setVisible(false);

    cooperateBtn.on('pointerdown', () => this.resolveChoice('cooperate'));
    eatBtn.on('pointerdown', () => this.resolveChoice('eat'));

    for (const obj of [panel, timer, cooperateBtn, eatBtn, cooperateLabel, eatLabel]) {
      this.callbacks.registerHudObject(obj);
    }

    this.hud = {
      panel,
      timer,
      cooperateBtn,
      eatBtn,
      cooperateLabel,
      eatLabel,
    };
  }

  /**
   * Authoritative races: server starts the encounter; client only shows UI and
   * reports the choice. Outcomes come from elimination / snapshot events.
   */
  beginAuthEncounter(
    encounterId: string,
    rivalUserId: string,
    deadlineWallMs: number,
    onChoice: (choice: DilemmaChoice) => void,
  ): void {
    if (this.overlayVisible || this.authChoiceHandler) {
      return;
    }
    this.authChoiceHandler = onChoice;
    this.activeEncounterId = encounterId;
    this.activeNpc = null;
    this.activeRemote = {
      userId: rivalUserId,
      type: CharacterType.Human,
      x: 0,
      hitboxY: 0,
      globalSubLane: 0,
    };
    this.choiceDeadlineMs = deadlineWallMs;
    this.showOverlay();
  }

  /** Closes an auth dilemma overlay without applying local outcomes. */
  endAuthEncounter(): void {
    this.authChoiceHandler = null;
    this.activeEncounterId = null;
    this.activeRemote = null;
    this.hideOverlay();
  }

  tick(player: Player, nowMs: number): DilemmaOutcome | null {
    if (player.getIsDead()) {
      this.hideOverlay();
      return null;
    }

    // Auth encounters are driven by the server — only update the timer UI.
    if (this.authChoiceHandler && this.overlayVisible) {
      const remaining = Math.max(0, this.choiceDeadlineMs - nowMs);
      this.hud?.timer.setText(`Choose: ${(remaining / 1000).toFixed(1)}s`);
      if (remaining <= 0) {
        this.flashAutoCooperate(() => this.resolveChoice('cooperate', true));
      }
      return null;
    }

    // DAVOS — airborne; no same-species dilemma prompts (solo / legacy only).
    if (player.isFlightModeVisual()) {
      this.hideOverlay();
      return null;
    }

    if (this.overlayVisible) {
      if (this.autoCooperatePending) {
        return null;
      }

      const remaining = Math.max(0, this.choiceDeadlineMs - nowMs);
      this.hud?.timer.setText(`Choose: ${(remaining / 1000).toFixed(1)}s`);
      if (remaining <= 0) {
        this.flashAutoCooperate(() => this.resolveChoice('cooperate', true));
      }
      return null;
    }

    if (this.pendingEncounters.size > 0) {
      return null;
    }

    const nearNpc = this.npcManager?.findSameTypeNearPlayer(player) ?? null;
    if (nearNpc) {
      if (!this.encounteredNpcSlots.has(nearNpc.globalSubLane)) {
        this.startNpcEncounter(nearNpc, nowMs);
      }
      return null;
    }

    this.tryStartRemoteEncounter(player, nowMs);
    return null;
  }

  private tryStartRemoteEncounter(player: Player, nowMs: number): void {
    if (!this.remoteRunnerManager || !this.session || !this.localUserId) {
      return;
    }

    const near = this.remoteRunnerManager.findSameTypeNearPlayer(player);
    if (!near) {
      return;
    }

    if (this.encounteredRemoteIds.has(near.userId)) {
      return;
    }

    // One client initiates to avoid duplicate overlays.
    if (this.localUserId > near.userId) {
      return;
    }

    const encounterId = `${this.localUserId}:${near.userId}:${nowMs}`;
    this.session.sendDilemmaStart({
      encounterId,
      initiatorId: this.localUserId,
      targetId: near.userId,
    });
    this.beginRemoteEncounter(
      {
        encounterId,
        initiatorId: this.localUserId,
        targetId: near.userId,
        myChoice: null,
        theirChoice: null,
        deadlineMs: nowMs + PRISONERS_DILEMMA_TUNING.choiceTimeoutMs,
      },
      near,
      nowMs,
    );
  }

  private handleRemoteStart(event: DilemmaStartEvent): void {
    if (!this.localUserId || !this.remoteRunnerManager || this.overlayVisible) {
      return;
    }
    if (event.targetId !== this.localUserId && event.initiatorId !== this.localUserId) {
      return;
    }

    const rivalId =
      event.initiatorId === this.localUserId ? event.targetId : event.initiatorId;
    if (this.encounteredRemoteIds.has(rivalId)) {
      return;
    }

    const rival = this.remoteRunnerManager.getEatTargets().find((t) => t.userId === rivalId);
    if (!rival) {
      return;
    }

    const nowMs = this.scene.time.now;
    const existing = this.pendingEncounters.get(event.encounterId);
    if (existing) {
      return;
    }

    this.beginRemoteEncounter(
      {
        encounterId: event.encounterId,
        initiatorId: event.initiatorId,
        targetId: event.targetId,
        myChoice: null,
        theirChoice: null,
        deadlineMs: nowMs + PRISONERS_DILEMMA_TUNING.choiceTimeoutMs,
      },
      rival,
      nowMs,
    );
  }

  private handleRemoteChoice(event: DilemmaChoiceEvent): void {
    if (!this.localUserId || event.userId === this.localUserId) {
      return;
    }

    const encounter = this.pendingEncounters.get(event.encounterId);
    if (!encounter) {
      return;
    }

    encounter.theirChoice = event.choice;
    this.tryResolveRemoteEncounter(encounter);
  }

  private beginRemoteEncounter(
    encounter: RemoteEncounter,
    rival: RemoteEatTarget,
    nowMs: number,
  ): void {
    this.encounteredRemoteIds.add(rival.userId);
    this.pendingEncounters.set(encounter.encounterId, encounter);
    this.activeRemote = rival;
    this.activeEncounterId = encounter.encounterId;
    this.activeNpc = null;
    this.choiceDeadlineMs = encounter.deadlineMs || nowMs + PRISONERS_DILEMMA_TUNING.choiceTimeoutMs;
    this.showOverlay();
  }

  private startNpcEncounter(npc: NpcEntry, nowMs: number): void {
    this.encounteredNpcSlots.add(npc.globalSubLane);
    this.activeNpc = npc;
    this.activeRemote = null;
    this.activeEncounterId = null;
    this.choiceDeadlineMs = nowMs + PRISONERS_DILEMMA_TUNING.choiceTimeoutMs;
    this.showOverlay();
  }

  private flashAutoCooperate(onComplete: () => void): void {
    if (!this.hud || this.autoCooperatePending) {
      return;
    }

    this.autoCooperatePending = true;
    this.hud.timer.setText('COOPERATE');
    this.hud.timer.setColor('#ffffff');
    this.hud.cooperateBtn.setFillStyle(0x44cc66);
    this.hud.cooperateLabel.setColor('#ffffff');
    this.hud.eatBtn.setAlpha(0.35);
    this.hud.eatLabel.setAlpha(0.35);

    this.scene.time.delayedCall(PRISONERS_DILEMMA_TUNING.autoCooperateFlashMs, () => {
      this.autoCooperatePending = false;
      this.resetChoiceButtonStyles();
      onComplete();
    });
  }

  private resetChoiceButtonStyles(): void {
    if (!this.hud) {
      return;
    }

    this.hud.timer.setColor('#888888');
    this.hud.cooperateBtn.setFillStyle(COLORS.white);
    this.hud.cooperateLabel.setColor('#000000');
    this.hud.eatBtn.setAlpha(1);
    this.hud.eatLabel.setAlpha(1);
  }

  private resolveChoice(playerChoice: DilemmaChoice, isTimeout = false): DilemmaOutcome {
    if (this.autoCooperatePending) {
      return 'timeout-cooperate';
    }

    if (this.authChoiceHandler) {
      const choice = isTimeout ? 'cooperate' : playerChoice;
      const handler = this.authChoiceHandler;
      this.authChoiceHandler = null;
      this.hideOverlay();
      handler(choice);
      return isTimeout ? 'timeout-cooperate' : this.outcomeMatrix(choice, 'cooperate');
    }

    if (this.activeEncounterId && this.activeRemote && this.localUserId && this.session) {
      return this.resolveRemoteChoice(playerChoice, isTimeout);
    }

    const npc = this.activeNpc;
    if (!npc) {
      return 'timeout-cooperate';
    }

    const npcChoice: DilemmaChoice =
      Math.random() < PRISONERS_DILEMMA_TUNING.npcCooperateChance ? 'cooperate' : 'eat';

    const outcome = this.outcomeMatrix(playerChoice, npcChoice);
    this.applyNpcOutcome(outcome, npc);
    this.activeNpc = null;
    this.hideOverlay();
    return isTimeout ? 'timeout-cooperate' : outcome;
  }

  private resolveRemoteChoice(playerChoice: DilemmaChoice, isTimeout: boolean): DilemmaOutcome {
    const encounterId = this.activeEncounterId;
    const rival = this.activeRemote;
    if (!encounterId || !rival || !this.localUserId || !this.session) {
      return 'timeout-cooperate';
    }

    const encounter = this.pendingEncounters.get(encounterId);
    if (!encounter) {
      this.clearRemoteEncounter();
      return 'timeout-cooperate';
    }

    encounter.myChoice = isTimeout ? 'cooperate' : playerChoice;
    this.session.sendDilemmaChoice({
      encounterId,
      userId: this.localUserId,
      choice: encounter.myChoice,
    });
    this.hideOverlay();

    this.tryResolveRemoteEncounter(encounter);
    return isTimeout ? 'timeout-cooperate' : this.outcomeMatrix(encounter.myChoice, 'cooperate');
  }

  private tryResolveRemoteEncounter(encounter: RemoteEncounter): void {
    if (!encounter.myChoice || !encounter.theirChoice || !this.localUserId) {
      return;
    }

    const rivalId =
      encounter.initiatorId === this.localUserId
        ? encounter.targetId
        : encounter.initiatorId;

    const myChoice = encounter.myChoice;
    const theirChoice = encounter.theirChoice;
    const outcome = this.outcomeMatrix(myChoice, theirChoice);

    this.applyRemoteOutcome(outcome, rivalId);
    this.pendingEncounters.delete(encounter.encounterId);
    this.clearRemoteEncounter();
  }

  private clearRemoteEncounter(): void {
    this.activeRemote = null;
    this.activeEncounterId = null;
    this.hideOverlay();
  }

  private outcomeMatrix(player: DilemmaChoice, npc: DilemmaChoice): DilemmaOutcome {
    if (player === 'cooperate' && npc === 'cooperate') {
      return 'both-cooperate';
    }
    if (player === 'eat' && npc === 'cooperate') {
      return 'player-eats';
    }
    if (player === 'cooperate' && npc === 'eat') {
      return 'player-eaten';
    }
    return 'both-eat';
  }

  private applyNpcOutcome(outcome: DilemmaOutcome, npc: NpcEntry): void {
    const cfg = PRISONERS_DILEMMA_TUNING;

    switch (outcome) {
      case 'both-cooperate':
      case 'timeout-cooperate':
        this.callbacks.onPlayerSpeedBoost(
          cfg.cooperateBoostMultiplier,
          cfg.cooperateBoostDurationSec,
        );
        break;
      case 'player-eats':
        this.npcManager?.eliminateNpc(npc);
        this.callbacks.onPlayerSpeedBoost(
          cfg.betrayBoostMultiplier,
          cfg.betrayBoostDurationSec,
        );
        break;
      case 'player-eaten':
        this.callbacks.onPlayerDeath();
        break;
      case 'both-eat':
        this.npcManager?.eliminateNpc(npc);
        this.callbacks.onPlayerDeath();
        break;
    }
  }

  private applyRemoteOutcome(outcome: DilemmaOutcome, rivalId: string): void {
    const cfg = PRISONERS_DILEMMA_TUNING;
    const raceTimeMs = Math.floor(this.callbacks.getRaceTimeMs());

    switch (outcome) {
      case 'both-cooperate':
      case 'timeout-cooperate':
        this.callbacks.onPlayerSpeedBoost(
          cfg.cooperateBoostMultiplier,
          cfg.cooperateBoostDurationSec,
        );
        break;
      case 'player-eats':
        void this.session?.sendDilemmaElimination(rivalId, raceTimeMs);
        this.callbacks.onPlayerSpeedBoost(
          cfg.betrayBoostMultiplier,
          cfg.betrayBoostDurationSec,
        );
        break;
      case 'player-eaten':
        this.callbacks.onPlayerDeath();
        break;
      case 'both-eat':
        void this.session?.sendDilemmaElimination(rivalId, raceTimeMs);
        this.callbacks.onPlayerDeath();
        break;
    }
  }

  private showOverlay(): void {
    this.overlayVisible = true;
    this.resetChoiceButtonStyles();
    if (!this.hud) {
      return;
    }
    for (const key of Object.keys(this.hud) as (keyof typeof this.hud)[]) {
      this.hud[key].setVisible(true);
    }
  }

  private hideOverlay(): void {
    this.overlayVisible = false;
    this.autoCooperatePending = false;
    this.resetChoiceButtonStyles();
    if (!this.hud) {
      return;
    }
    for (const key of Object.keys(this.hud) as (keyof typeof this.hud)[]) {
      this.hud[key].setVisible(false);
    }
  }

  destroy(): void {
    this.hideOverlay();
    this.activeNpc = null;
    this.activeRemote = null;
    this.activeEncounterId = null;
    this.authChoiceHandler = null;
    this.encounteredNpcSlots.clear();
    this.encounteredRemoteIds.clear();
    this.pendingEncounters.clear();
  }
}
