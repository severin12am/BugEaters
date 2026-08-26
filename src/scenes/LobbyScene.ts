import Phaser from 'phaser';
import {
  CharacterType,
  CHARACTER_LABELS,
  GAME_HEIGHT,
  GAME_WIDTH,
  ux,
} from '../utils/constants';
import { fontSize, getContentTopY, getMenuBottomY } from '../utils/layout';
import { gameText } from '../utils/display';
import { RoomSession } from '../net/RoomSession';
import type { RoomMember } from '../net/types';
import { addMonoScreenBackground } from '../ui/grainBackground';
import {
  bindButtonClick,
  contentWidth,
  createMonoButton,
  createMonoPanel,
  createMonoText,
  createStatusPill,
  createWeekStrip,
  type UiButtonResult,
} from '../ui/UiChrome';
import { MONO, MONO_CSS } from '../ui/theme';
import { getChainService } from '../tournament/chain/MockChainService';
import {
  assignRoles,
  confirmPassBurn,
  fetchMyAssignedRole,
  fetchWeekState,
  mapJoinErrorCode,
  refundPassBurn,
  weekContextFromState,
} from '../tournament/tournamentApi';
import { REGISTRY_KEYS, type AuthLocalRaceOptions } from './BootScene';
import { isDevSessionUiEnabled } from '../tournament/devSession';
import { isRaceDevMode, isRaceServerConfigured } from '../net/AuthoritativeRaceClient';
import { PLAYTEST_LOBBY_ROOM_ID, raceServerHttpBase } from '../net/authoritative/env';

/**
 * Tournament lobby — matchmaking, pass burn, role reveal, synchronized start.
 */
export class LobbyScene extends Phaser.Scene {
  private session: RoomSession | null = null;
  private startsAtMs: number | null = null;
  private starting = false;
  private live = true;
  private burning = false;
  private burnConfirmed = false;
  private assignedRole: CharacterType | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private countdownHint!: Phaser.GameObjects.Text;
  private membersText!: Phaser.GameObjects.Text;
  private readyBtn: UiButtonResult | null = null;
  private burnOverlay: Phaser.GameObjects.Container | null = null;
  private week = weekContextFromState(null);
  private passId: string | null = null;
  private soloBtn: UiButtonResult | null = null;

  constructor() {
    super({ key: 'LobbyScene' });
  }

  create(): void {
    this.session?.destroy();
    this.session = null;
    this.live = true;
    this.starting = false;
    this.burning = false;
    this.burnConfirmed = false;
    this.startsAtMs = null;
    this.readyBtn = null;
    this.burnOverlay = null;
    this.soloBtn = null;
    this.assignedRole = null;
    this.passId = (this.registry.get(REGISTRY_KEYS.activePassId) as string | null) ?? null;

    // Paint UI immediately — do not wait on network (hangs looked like a dead button).
    this.week = weekContextFromState(null);
    this.burnConfirmed =
      (this.registry.get(REGISTRY_KEYS.passBurnConfirmed) as boolean) ?? true;
    this.assignedRole =
      (this.registry.get(REGISTRY_KEYS.assignedRole) as CharacterType | null) ?? null;
    this.renderLobbyShell();
    this.offerTesting();
    void this.initLobby();
  }

  private async initLobby(): Promise<void> {
    const state = await Promise.race([
      fetchWeekState(),
      new Promise<null>((resolve) => {
        this.time.delayedCall(8000, () => resolve(null));
      }),
    ]);
    if (!this.scene.isActive() || !this.live) {
      return;
    }

    this.week = weekContextFromState(state);

    if (!this.passId && this.week.requiresPass) {
      const todayPass = this.week.passes.find((p) => p.grantsEntry === this.week.weekday);
      this.passId = todayPass?.id ?? null;
    }

    this.burnConfirmed =
      (this.registry.get(REGISTRY_KEYS.passBurnConfirmed) as boolean) ??
      !this.week.requiresPass;
    this.assignedRole =
      (this.registry.get(REGISTRY_KEYS.assignedRole) as CharacterType | null) ?? null;

    let character =
      (this.registry.get(REGISTRY_KEYS.selectedCharacter) as CharacterType | null) ??
      CharacterType.Human;

    if (this.week.isMondayWeb2) {
      character = CharacterType.Human;
    } else if (this.week.requiresPass) {
      if (this.burnConfirmed && this.assignedRole) {
        character = this.assignedRole;
        this.showRoleBadge(this.assignedRole);
      }
    } else {
      this.registry.set(REGISTRY_KEYS.selectedCharacter, character);
    }

    const session = RoomSession.tryCreate();
    if (!session) {
      this.registry.set(REGISTRY_KEYS.roomSession, null);
      this.registry.set(REGISTRY_KEYS.roomMembers, null);
      this.statusText.setText(
        isDevSessionUiEnabled()
          ? 'No live lobby — use Testing'
          : 'Offline — connect Supabase to race',
      );
      return;
    }

    this.session = session;
    this.statusText.setText('Finding a race…');
    void this.startMatchmaking(character);
  }

  private renderLobbyShell(): void {
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    createMonoText(this, cx, getContentTopY(this, 36), 'RACE LOBBY', 'label').setOrigin(0.5);
    createWeekStrip(this, cx, getContentTopY(this, 78), this.week.weekdayKey);

    this.statusText = createMonoText(this, cx, getContentTopY(this, 130), 'Connecting…', 'body').setOrigin(
      0.5,
    );

    this.countdownText = gameText(this, cx, getContentTopY(this, 200), '', {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(52),
      color: MONO_CSS.text,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.countdownHint = createMonoText(this, cx, getContentTopY(this, 236), '', 'caption').setOrigin(0.5);

    const membersPanelY = getContentTopY(this, 260);
    const panelW = contentWidth(20);
    createMonoPanel(this, ux(20), membersPanelY, { width: panelW, height: ux(200), raised: true });
    this.membersText = createMonoText(this, cx, membersPanelY + ux(24), '', 'mono').setOrigin(0.5, 0).setAlign(
      'center',
    );

    this.createCancelButton();
  }

  /** Always available in playtest builds so a hung join cannot block racing. */
  private offerTesting(): void {
    if (!isDevSessionUiEnabled() || this.soloBtn) {
      return;
    }
    if (!(isRaceServerConfigured && isRaceDevMode)) {
      return;
    }
    this.soloBtn = createMonoButton(
      this,
      GAME_WIDTH / 2,
      getMenuBottomY(this, 148),
      'Testing',
      'primary',
      ux(220),
      ux(48),
    );
    bindButtonClick(this.soloBtn, () => void this.startLocalAuthRace());
  }

  /**
   * Starts a playable race against the local Colyseus server (dev tickets).
   * Open a second browser tab and tap the same button to join the same room.
   * Prefetches the ticket so Bug/Human/Klaus + lanes are known before GameScene.
   */
  private async startLocalAuthRace(): Promise<void> {
    const userId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `dev-${crypto.randomUUID()}`
        : `dev-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    try {
      const response = await fetch(`${raceServerHttpBase()}/dev/ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: PLAYTEST_LOBBY_ROOM_ID,
          userId,
          maxPlayers: 6,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as {
        token: string;
        claims: {
          roomId: string;
          userId: string;
          role: 'bug' | 'human' | 'klaus';
          globalSubLane: number;
          startsAtMs: number;
          seed: number;
          maxPlayers: number;
        };
      };
      const character =
        data.claims.role === 'bug'
          ? CharacterType.Bug
          : data.claims.role === 'klaus'
            ? CharacterType.Klaus
            : CharacterType.Human;

      this.session?.destroy();
      this.session = null;
      this.registry.set(REGISTRY_KEYS.roomSession, null);
      this.registry.set(REGISTRY_KEYS.roomMembers, null);
      this.registry.set(REGISTRY_KEYS.soloPractice, true);
      this.registry.set(REGISTRY_KEYS.selectedCharacter, character);
      this.registry.set(REGISTRY_KEYS.authLocalRace, {
        roomId: data.claims.roomId || PLAYTEST_LOBBY_ROOM_ID,
        userId: data.claims.userId,
        role: data.claims.role,
        globalSubLane: data.claims.globalSubLane,
        startsAtMs: data.claims.startsAtMs,
        seed: data.claims.seed,
        maxPlayers: data.claims.maxPlayers ?? 6,
        token: data.token,
      } satisfies AuthLocalRaceOptions);
      this.scene.start('GameScene');
    } catch (error) {
      console.warn('[lobby] local multiplayer ticket failed', error);
    }
  }

  private async startMatchmaking(character: CharacterType): Promise<void> {
    const session = this.session!;
    const info = await Promise.race([
      session.join(character),
      new Promise<null>((resolve) => {
        this.time.delayedCall(10000, () => resolve(null));
      }),
    ]);

    if (!this.live) {
      return;
    }

    if (!info) {
      const code = session.getJoinErrorCode();
      session.destroy();
      this.session = null;
      if (code && !isDevSessionUiEnabled()) {
        this.registry.set(REGISTRY_KEYS.blockedReason, mapJoinErrorCode(code));
        this.scene.start('BlockedStateScene');
        return;
      }
      this.statusText.setText(
        code
          ? `Join blocked (${code}) — use Testing`
          : 'Could not join — use Testing',
      );
      this.offerTesting();
      return;
    }

    this.registry.set(REGISTRY_KEYS.roomSession, session);
    this.startsAtMs = info.startsAtMs;
    this.statusText.setText(`Room ${info.roomId.slice(0, 8)} · waiting for racers`);
    // Live lobby joined — free the bottom CTA strip for Ready.
    this.soloBtn?.container.destroy();
    this.soloBtn = null;

    session.onMembers((members) => {
      if (this.live) {
        this.renderMembers(members);
        this.onMembersUpdated(members);
      }
    });

    // Server can pull the start forward when everyone readies up.
    session.onStartsAt((startsAtMs) => {
      if (this.live && startsAtMs !== null) {
        this.startsAtMs = startsAtMs;
      }
    });

    if (!this.week.requiresPass || this.burnConfirmed) {
      this.showReadyButton();
    }
  }

  private showReadyButton(): void {
    if (this.readyBtn) {
      return;
    }
    const btn = createMonoButton(
      this,
      GAME_WIDTH / 2,
      getMenuBottomY(this, 132),
      "I'm ready",
      'primary',
      contentWidth(20),
    );
    bindButtonClick(btn, () => void this.onReadyTapped());
    this.readyBtn = btn;
  }

  private async onReadyTapped(): Promise<void> {
    if (!this.session || this.session.isSelfReady()) {
      return;
    }
    this.readyBtn?.label.setText('SETTING READY…');
    const ready = await this.session.tapReady();
    if (!ready) {
      this.readyBtn?.label.setText("I'M READY");
      this.statusText.setText('Could not set ready — try again');
      return;
    }
    this.readyBtn?.label.setText('READY ✓');
    this.readyBtn?.background.setFillStyle(MONO.surface);
    this.readyBtn?.background.disableInteractive();
  }

  private onMembersUpdated(members: RoomMember[]): void {
    if (this.week.requiresPass && !this.burnConfirmed && members.length >= 1) {
      this.statusText.setText('Ready to start — burn your pass');
      this.showBurnOverlay();
    }
  }

  private showBurnOverlay(): void {
    if (this.burnOverlay) {
      return;
    }

    const cx = GAME_WIDTH / 2;
    const overlay = this.add.container(0, 0);
    const dim = this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, MONO.ink, 0.72);
    const panelW = contentWidth(24);
    const panelH = ux(220);
    const panelY = GAME_HEIGHT / 2 - panelH / 2;
    const panel = createMonoPanel(this, cx - panelW / 2, panelY, {
      width: panelW,
      height: panelH,
      raised: true,
      border: true,
    });

    createMonoText(this, cx, panelY + ux(36), 'Burn pass', 'title').setOrigin(0.5);
    createMonoText(this, cx, panelY + ux(72), `${this.week.weekdayLabel} entry · one race`, 'body').setOrigin(
      0.5,
    );
    createMonoText(
      this,
      cx,
      panelY + ux(102),
      'Pass is destroyed when the race starts. Role is assigned 3:2:1.',
      'caption',
    )
      .setOrigin(0.5)
      .setAlign('center')
      .setWordWrapWidth(panelW - ux(32));

    const burnBtn = createMonoButton(this, cx, panelY + panelH - ux(48), 'Burn & ready', 'primary', panelW - ux(32));
    bindButtonClick(burnBtn, () => void this.confirmBurn());

    overlay.add([dim, panel, burnBtn.container]);
    overlay.setDepth(100);
    this.burnOverlay = overlay;
  }

  private async confirmBurn(): Promise<void> {
    if (this.burning || !this.session?.getRoomInfo()) {
      return;
    }
    if (!this.passId) {
      this.registry.set(REGISTRY_KEYS.blockedReason, 'no-pass');
      this.scene.start('BlockedStateScene');
      return;
    }

    this.burning = true;
    const roomId = this.session.getRoomInfo()!.roomId;

    const cx = GAME_WIDTH / 2;
    const signing = createMonoText(this, cx, GAME_HEIGHT / 2, 'Confirm transaction in wallet…', 'body').setOrigin(
      0.5,
    ).setDepth(110);

    try {
      const chain = getChainService();
      const { txHash } = await chain.requestBurnSignature(this.passId);
      await confirmPassBurn(roomId, txHash);

      this.burnConfirmed = true;
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, true);
      this.registry.set(REGISTRY_KEYS.assignedRole, null);

      this.burnOverlay?.destroy();
      this.burnOverlay = null;
      signing.destroy();

      this.statusText.setText('Pass burned · role assigned at race start');
      this.showReadyButton();
      await this.onReadyTapped();
    } catch (err) {
      signing.destroy();
      console.warn('[lobby] burn failed', err);
      this.statusText.setText('Burn failed — try again');
    } finally {
      this.burning = false;
    }
  }

  private showRoleBadge(role: CharacterType): void {
    createStatusPill(this, GAME_WIDTH - ux(28), getContentTopY(this, 36), CHARACTER_LABELS[role], true, 'right');
  }

  private renderMembers(members: RoomMember[]): void {
    // Monday roles are assigned server-side at race start; the presence
    // roster only knows the join-time placeholder, so don't show it.
    const rolesKnown = !this.week.isMondayWeb2;
    const lines = members.map((m) => {
      const name = m.username ?? m.userId.slice(0, 6);
      const role = rolesKnown ? ` · ${CHARACTER_LABELS[m.characterType]}` : '';
      const ready = m.ready ? ' · READY' : '';
      return `${name}${role}${ready}`;
    });
    const hint = rolesKnown ? [] : ['', 'Roles are assigned at start'];
    this.membersText.setText(['Racers', '', ...lines, ...hint].join('\n'));

    const allReady = members.length > 0 && members.every((m) => m.ready);
    if (allReady) {
      this.statusText.setText('Everyone ready — starting!');
    }
  }

  private createCancelButton(): void {
    const btn = createMonoButton(
      this,
      GAME_WIDTH / 2,
      getMenuBottomY(this, 72),
      'Leave lobby',
      'ghost',
      ux(180),
      ux(44),
    );
    bindButtonClick(btn, () => {
      const roomId = this.session?.getRoomInfo()?.roomId;
      if (roomId) {
        void refundPassBurn(roomId);
      }
      this.session?.destroy();
      this.session = null;
      this.registry.set(REGISTRY_KEYS.roomSession, null);
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, false);
      this.registry.set(REGISTRY_KEYS.assignedRole, null);
      this.registry.set(REGISTRY_KEYS.activePassId, null);
      this.scene.start('WeekHubScene');
    });
  }

  update(): void {
    if (this.starting) {
      return;
    }

    if (this.week.requiresPass && !this.burnConfirmed) {
      this.countdownText.setText('');
      return;
    }

    if (this.startsAtMs === null) {
      return;
    }

    const remainingMs = this.startsAtMs - Date.now();
    if (remainingMs <= 0) {
      this.starting = true;
      this.countdownText.setText('GO');
      this.countdownHint.setText('');
      void this.beginRace();
      return;
    }

    const totalSec = Math.ceil(remainingMs / 1000);
    if (totalSec >= 60) {
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      this.countdownText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    } else {
      this.countdownText.setText(totalSec.toString());
    }
    this.countdownHint.setText(
      this.session?.isSelfReady()
        ? 'Race starts when timer ends — or when everyone is ready'
        : "Tap I'm ready — all ready starts the race sooner",
    );
  }

  private async beginRace(): Promise<void> {
    const roomId = this.session?.getRoomInfo()?.roomId;
    if (roomId) {
      await assignRoles(roomId);
      const roleStr = await fetchMyAssignedRole(roomId);
      if (roleStr) {
        const role = roleStr as CharacterType;
        this.assignedRole = role;
        this.registry.set(REGISTRY_KEYS.assignedRole, role);
        this.registry.set(REGISTRY_KEYS.selectedCharacter, role);
      }
    }

    const members = (await this.session?.fetchMembers()) ?? [];
    if (!this.live) {
      return;
    }

    // Sync our own post-assignment role + lane; the join-time values in
    // RoomInfo.self are stale after assign_roles (GameScene reads them).
    const selfId = this.session?.getSelfUserId();
    const selfMember = members.find((m) => m.userId === selfId);
    if (selfMember && this.session) {
      this.session.applySelfAssignment(selfMember.characterType, selfMember.globalSubLane);
      this.assignedRole = selfMember.characterType;
      this.registry.set(REGISTRY_KEYS.assignedRole, selfMember.characterType);
      this.registry.set(REGISTRY_KEYS.selectedCharacter, selfMember.characterType);
    }

    this.registry.set(REGISTRY_KEYS.roomMembers, members);
    this.registry.set(REGISTRY_KEYS.soloPractice, false);
    void this.session?.markRacing();
    this.scene.start('GameScene');
  }

  shutdown(): void {
    this.live = false;
    this.session?.onMembers(() => {});
  }
}
