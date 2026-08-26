import Phaser from 'phaser';
import { CHARACTER_LABELS, CharacterType, GAME_WIDTH, ux } from '../utils/constants';
import { fontSize, getContentTopY, getMenuBottomY } from '../utils/layout';
import { gameText } from '../utils/display';
import type { RoomSession } from '../net/RoomSession';
import type { Standing } from '../net/types';
import { addMonoScreenBackground } from '../ui/grainBackground';
import {
  bindButtonClick,
  contentWidth,
  createMonoButton,
  createMonoDivider,
  createMonoPanel,
  createMonoText,
} from '../ui/UiChrome';
import { MONO, MONO_CSS } from '../ui/theme';
import {
  formatGrantsEntryLabel,
  recordResults,
  type RaceOutcome,
  weekContextFromState,
  fetchWeekState,
} from '../tournament/tournamentApi';
import { REGISTRY_KEYS, type AuthLocalRaceOptions } from './BootScene';
import {
  isRaceDevMode,
  isRaceServerConfigured,
  PLAYTEST_LOBBY_ROOM_ID,
  raceServerHttpBase,
} from '../net/authoritative/env';

/**
 * Post-race summary with tournament advancement framing.
 */
export class EndScene extends Phaser.Scene {
  private outcome: RaceOutcome | null = null;
  private practiceAgainBusy = false;

  constructor() {
    super({ key: 'EndScene' });
  }

  create(): void {
    const finished = this.registry.get(REGISTRY_KEYS.raceFinished) as boolean;
    const died = this.registry.get(REGISTRY_KEYS.playerDied) as boolean;
    const timeMs = (this.registry.get(REGISTRY_KEYS.raceTimeMs) as number) ?? 0;
    const session = (this.registry.get(REGISTRY_KEYS.roomSession) as RoomSession | null) ?? null;
    const isMultiplayer = session?.getRoomInfo() != null;

    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    createMonoText(this, cx, getContentTopY(this, 80), 'Race complete', 'label').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 120), 'Loading results…', 'caption').setOrigin(0.5);

    void this.loadResults(finished, died, timeMs, session, isMultiplayer);
  }

  private async loadResults(
    finished: boolean,
    died: boolean,
    timeMs: number,
    session: RoomSession | null,
    isMultiplayer: boolean,
  ): Promise<void> {
    if (isMultiplayer && session?.getRoomInfo()) {
      this.outcome = await this.waitForRoomResults(session.getRoomInfo()!.roomId);
      this.registry.set(REGISTRY_KEYS.raceOutcome, this.outcome);
    }

    const state = await fetchWeekState();
    const week = weekContextFromState(state);

    if (!this.scene.isActive()) {
      return;
    }

    this.children.removeAll(true);
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);

    let title: string;
    let titleColor: string;
    let subtitle: string;
    let advancement: string;

    if (died) {
      title = 'ELIMINATED';
      titleColor = MONO_CSS.blood;
      subtitle = finished
        ? 'You died before the finish line.'
        : 'You were eliminated.';
      advancement = week.isSundayFinale
        ? 'Finale run complete.'
        : 'Out of the tournament — see you next Monday.';
    } else if (finished) {
      title = 'FINISH';
      titleColor = MONO_CSS.text;
      subtitle = `Race time ${this.formatRaceTime(timeMs)}`;
      advancement = this.advancementCopy(this.outcome, week.maxSundaySlots);
    } else {
      title = 'TIME UP';
      titleColor = MONO_CSS.textMuted;
      subtitle = 'Timer ended — progress saved.';
      advancement = this.advancementCopy(this.outcome, week.maxSundaySlots);
    }

    gameText(this, cx, getContentTopY(this, 100), title, {
      fontFamily: MONO_CSS.fontDisplay,
      fontSize: fontSize(44),
      color: titleColor,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    createMonoText(this, cx, getContentTopY(this, 158), subtitle, 'body').setOrigin(0.5);

    if (died) {
      this.add.rectangle(cx, getContentTopY(this, 198), ux(100), ux(3), MONO.blood).setOrigin(0.5);
    }

    if (advancement) {
      const advY = getContentTopY(this, 228);
      createMonoPanel(this, pad, advY, { width: panelW, height: ux(72), raised: true });
      createMonoText(this, pad + ux(16), advY + ux(24), 'Advancement', 'label');
      createMonoText(this, pad + ux(16), advY + ux(44), advancement, 'caption').setWordWrapWidth(panelW - ux(32));
    }

    const soloPractice = this.registry.get(REGISTRY_KEYS.soloPractice) === true;
    const authStandings = this.registry.get(REGISTRY_KEYS.authStandings) as
      | Array<{
          userId: string;
          finished: boolean;
          died: boolean;
          finishTimeMs: number | null;
          placement: number;
        }>
      | null;

    const cleanup = (): void => {
      session?.destroy();
      this.registry.set(REGISTRY_KEYS.roomSession, null);
      this.registry.set(REGISTRY_KEYS.soloPractice, false);
      this.registry.set(REGISTRY_KEYS.authLocalRace, null);
      this.registry.set(REGISTRY_KEYS.authStandings, null);
    };

    if (authStandings && authStandings.length > 0) {
      this.renderAuthStandings(authStandings);
    } else if (isMultiplayer && session) {
      this.renderStandings(session);
    }

    const againY = getMenuBottomY(this, 148);
    const showRaceAgain = isMultiplayer && !week.isMondayWeb2;
    if (soloPractice) {
      const again = createMonoButton(this, cx, againY, 'Practice again', 'primary', panelW);
      bindButtonClick(again, () => {
        void this.practiceAgain();
      });
    } else if (showRaceAgain) {
      const again = createMonoButton(this, cx, againY, 'Race again', 'primary', panelW);
      bindButtonClick(again, () => {
        cleanup();
        this.registry.set(REGISTRY_KEYS.passBurnConfirmed, !week.requiresPass);
        this.scene.start('LobbyScene');
      });
    } else if (week.isMondayWeb2) {
      createMonoText(this, cx, againY, 'One Monday race per week', 'caption').setOrigin(0.5);
    }

    const hubY = getMenuBottomY(this, 72);
    const hub = createMonoButton(this, cx, hubY, 'Week hub', 'secondary', panelW);
    bindButtonClick(hub, () => {
      cleanup();
      // Prefer playtest menu when that is how the race was started.
      if (soloPractice) {
        this.scene.start('DevSessionScene');
      } else {
        this.scene.start('WeekHubScene');
      }
    });
  }

  /**
   * Mint a fresh /dev/ticket against the playtest lobby. Always use the lobby
   * id (not the previous wave's Colyseus room) so both phones can meet on a
   * new 15s countdown instead of rejoining a leftover live race.
   */
  private async practiceAgain(): Promise<void> {
    if (this.practiceAgainBusy) {
      return;
    }
    this.practiceAgainBusy = true;
    this.registry.set(REGISTRY_KEYS.authStandings, null);
    this.registry.set(REGISTRY_KEYS.soloPractice, true);

    const prev = this.registry.get(REGISTRY_KEYS.authLocalRace) as AuthLocalRaceOptions | null;
    if (!prev || !isRaceServerConfigured || !isRaceDevMode) {
      this.registry.set(REGISTRY_KEYS.authLocalRace, null);
      this.scene.start('GameScene');
      return;
    }

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
          maxPlayers: prev.maxPlayers ?? 6,
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
      console.warn('[end] practice again ticket failed', error);
      this.practiceAgainBusy = false;
      this.registry.set(REGISTRY_KEYS.authLocalRace, null);
      this.scene.start('DevSessionScene');
    }
  }

  /**
   * Every member must report either a finish or a death before the database
   * calculates placement. Wait briefly rather than recording a late peer as
   * eliminated; after the limit, present an honest pending state.
   */
  private async waitForRoomResults(roomId: string): Promise<RaceOutcome> {
    const attempts = 20;
    let outcome = await recordResults(roomId);
    for (let i = 1; outcome.outcome === 'pending' && i < attempts; i++) {
      await new Promise<void>((resolve) => this.time.delayedCall(750, resolve));
      if (!this.scene.isActive()) {
        break;
      }
      outcome = await recordResults(roomId);
    }
    return outcome;
  }

  private advancementCopy(outcome: RaceOutcome | null, maxSun: number): string {
    if (!outcome) {
      return 'Results pending — check week hub.';
    }
    switch (outcome.outcome) {
      case 'champion':
        return 'WORLD CHAMPION — Monday billboard rights unlocked.';
      case 'sunday_pass':
        return `You earned a Sunday pass · slot ${outcome.sundaySlot ?? '?'}/${maxSun}.`;
      case 'advanced':
        return `You won a ${formatGrantsEntryLabel(outcome.grantsEntry)} pass.`;
      case 'eliminated':
        return 'Did not advance — see you next Monday.';
      case 'pending':
        return 'Waiting for every racer to report. Check the week hub shortly.';
      default:
        return 'Did not advance — see you next Monday.';
    }
  }

  private renderStandings(session: RoomSession): void {
    const cx = GAME_WIDTH / 2;
    const y = getContentTopY(this, 320);
    createMonoDivider(this, ux(20), y, contentWidth(20));
    createMonoText(this, cx, y + ux(20), 'Room standings', 'label').setOrigin(0.5);

    const body = createMonoText(this, cx, y + ux(48), 'Loading…', 'mono').setOrigin(0.5, 0).setAlign('center');

    const selfId = session.getSelfUserId();
    void session.fetchStandings().then((standings) => {
      if (!this.scene.isActive()) {
        return;
      }
      if (standings.length === 0) {
        body.setVisible(false);
        return;
      }
      body.setText(this.formatStandings(this.rankStandings(standings), selfId));
    });
  }

  /** Standings sealed by the authoritative race server. */
  private renderAuthStandings(
    results: Array<{
      userId: string;
      finished: boolean;
      died: boolean;
      finishTimeMs: number | null;
      placement: number;
    }>,
  ): void {
    const cx = GAME_WIDTH / 2;
    const y = getContentTopY(this, 320);
    createMonoDivider(this, ux(20), y, contentWidth(20));
    createMonoText(this, cx, y + ux(20), 'Authoritative standings', 'label').setOrigin(0.5);
    const selfId =
      (this.registry.get(REGISTRY_KEYS.authLocalRace) as { userId?: string } | null)?.userId ?? null;
    const lines = [...results]
      .sort((a, b) => a.placement - b.placement)
      .map((r) => {
        const you = r.userId === selfId ? ' (you)' : '';
        const status = r.died
          ? 'eliminated'
          : r.finished
            ? this.formatRaceTime(r.finishTimeMs ?? 0)
            : 'DNF';
        return `${r.placement}. ${r.userId.slice(0, 8)}${you} — ${status}`;
      });
    createMonoText(this, cx, y + ux(48), lines.join('\n'), 'mono').setOrigin(0.5, 0).setAlign('center');
  }

  private rankStandings(standings: Standing[]): Standing[] {
    const score = (s: Standing): number => {
      if (s.finished && !s.died) {
        return 0;
      }
      if (!s.died) {
        return 1;
      }
      return 2;
    };
    return [...standings].sort((a, b) => {
      const d = score(a) - score(b);
      if (d !== 0) {
        return d;
      }
      return (a.finishTimeMs ?? Infinity) - (b.finishTimeMs ?? Infinity);
    });
  }

  private formatStandings(standings: Standing[], selfId: string | null): string {
    return standings
      .map((s, i) => {
        const you = s.userId === selfId ? ' (you)' : '';
        const status = s.died
          ? 'eliminated'
          : s.finished
            ? this.formatRaceTime(s.finishTimeMs ?? 0)
            : 'racing';
        return `${i + 1}. ${CHARACTER_LABELS[s.characterType]}${you} — ${status}`;
      })
      .join('\n');
  }

  private formatRaceTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const cs = Math.floor((ms % 1000) / 10);
    return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }
}
