import Phaser from 'phaser';
import { CharacterType, GAME_WIDTH, ux } from '../utils/constants';
import { getContentTopY, getMenuBottomY } from '../utils/layout';
import { unlockGameAudio } from '../utils/audioAssets';
import { addMonoScreenBackground } from '../ui/grainBackground';
import {
  bindButtonClick,
  contentWidth,
  createMonoButton,
  createMonoDivider,
  createMonoPanel,
  createMonoText,
} from '../ui/UiChrome';
import { MONO } from '../ui/theme';
import {
  DEV_WEEKDAYS,
  resetDevSessionChoice,
  saveDevSessionChoice,
  type DevSessionChoice,
} from '../tournament/devSession';
import { LABEL_MAP } from '../tournament/weekClock';
import type { TournamentWeekday } from '../tournament/types';
import { REGISTRY_KEYS, type AuthLocalRaceOptions } from './BootScene';
import {
  isRaceDevMode,
  isRaceServerConfigured,
  PLAYTEST_LOBBY_ROOM_ID,
  raceServerHttpBase,
} from '../net/authoritative/env';

/**
 * Playtest entry — Testing (authoritative race) plus optional sandbox week / day.
 */
export class DevSessionScene extends Phaser.Scene {
  private choice: DevSessionChoice = resetDevSessionChoice();
  private weekLabel!: Phaser.GameObjects.Text;
  private dayHighlights: Map<TournamentWeekday, Phaser.GameObjects.Rectangle> = new Map();

  constructor() {
    super({ key: 'DevSessionScene' });
  }

  create(): void {
    unlockGameAudio(this);
    // Fresh week/day every open so playtests don't stick on a stale sandbox day.
    this.choice = resetDevSessionChoice();
    this.render();
  }

  /**
   * Authoritative race via the Colyseus race server (/dev/ticket).
   * Mints the ticket FIRST so species + lane are known before GameScene builds
   * the local runner (Bug left / Human middle / Klaus right).
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
          // No role — server assigns next free seat: Bug → Human → Klaus.
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

      this.registry.set(REGISTRY_KEYS.roomSession, null);
      this.registry.set(REGISTRY_KEYS.roomMembers, null);
      this.registry.set(REGISTRY_KEYS.soloPractice, true);
      this.registry.set(REGISTRY_KEYS.selectedCharacter, character);
      this.registry.set(REGISTRY_KEYS.passBurnConfirmed, true);
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
      console.warn('[dev] local multiplayer ticket failed', error);
    }
  }

  private render(): void {
    addMonoScreenBackground(this);

    const cx = GAME_WIDTH / 2;
    const pad = ux(20);
    const panelW = contentWidth(20);
    const authReady = isRaceServerConfigured && isRaceDevMode;

    const guide = createMonoButton(
      this,
      pad + ux(40),
      getContentTopY(this, 36),
      'Guide',
      'ghost',
      ux(80),
      ux(40),
    );
    bindButtonClick(guide, () =>
      this.scene.start('EncyclopediaScene', { sectionId: 'first-steps', from: 'DevSessionScene' }),
    );

    createMonoText(this, cx, getContentTopY(this, 32), 'BUG EATERS', 'display').setOrigin(0.5);
    createMonoText(this, cx, getContentTopY(this, 72), 'Playtest', 'caption').setOrigin(0.5);

    let tournamentTop = 188;
    if (authReady) {
      const testing = createMonoButton(
        this,
        cx,
        getContentTopY(this, 118),
        'Testing',
        'primary',
        panelW,
      );
      bindButtonClick(testing, () => void this.startLocalAuthRace());
      createMonoText(
        this,
        cx,
        getContentTopY(this, 152),
        'Two phones · 15s wait · Bug then Human',
        'caption',
      ).setOrigin(0.5);
      tournamentTop = 188;
    } else {
      createMonoText(
        this,
        cx,
        getContentTopY(this, 118),
        'Race server offline — start npm run race-server',
        'caption',
      ).setOrigin(0.5);
      tournamentTop = 160;
    }

    createMonoDivider(this, pad, getContentTopY(this, tournamentTop), panelW);
    createMonoText(this, pad, getContentTopY(this, tournamentTop + 18), 'Tournament sandbox', 'label');

    // --- Week ---
    const weekY = getContentTopY(this, tournamentTop + 48);
    createMonoPanel(this, pad, weekY, { width: panelW, height: ux(72), raised: true });
    createMonoText(this, pad + ux(16), weekY + ux(12), 'Week', 'caption');
    this.weekLabel = createMonoText(
      this,
      cx,
      weekY + ux(44),
      `Week ${this.choice.weekIndex}`,
      'title',
    ).setOrigin(0.5);

    const minus = createMonoButton(this, pad + ux(36), weekY + ux(44), '−', 'secondary', ux(44), ux(36));
    const plus = createMonoButton(
      this,
      pad + panelW - ux(36),
      weekY + ux(44),
      '+',
      'secondary',
      ux(44),
      ux(36),
    );
    bindButtonClick(minus, () => {
      this.choice.weekIndex = Math.max(1, this.choice.weekIndex - 1);
      this.weekLabel.setText(`Week ${this.choice.weekIndex}`);
    });
    bindButtonClick(plus, () => {
      this.choice.weekIndex = Math.min(99, this.choice.weekIndex + 1);
      this.weekLabel.setText(`Week ${this.choice.weekIndex}`);
    });

    // --- Day ---
    const dayY = weekY + ux(88);
    createMonoText(this, pad, dayY, 'Day', 'caption');
    this.renderDayGrid(pad, dayY + ux(18), panelW);

    const hub = createMonoButton(
      this,
      cx,
      getMenuBottomY(this, 110),
      'Enter week hub',
      'secondary',
      panelW,
    );
    bindButtonClick(hub, () => {
      saveDevSessionChoice(this.choice);
      this.registry.set(REGISTRY_KEYS.soloPractice, false);
      this.registry.set(REGISTRY_KEYS.authLocalRace, null);
      this.scene.start('WeekHubScene');
    });

    createMonoText(
      this,
      cx,
      getMenuBottomY(this, 52),
      'Dev only · week/day reset on each open',
      'caption',
    ).setOrigin(0.5);
  }

  private renderDayGrid(x: number, y: number, width: number): void {
    const cols = 2;
    const gap = ux(8);
    const btnW = (width - gap) / cols;
    const btnH = ux(36);

    DEV_WEEKDAYS.forEach((day, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = x + col * (btnW + gap);
      const by = y + row * (btnH + gap);

      const bg = this.add
        .rectangle(bx, by, btnW, btnH, MONO.surfaceRaised, 1)
        .setOrigin(0)
        .setStrokeStyle(ux(1.5), this.choice.weekday === day ? MONO.borderStrong : MONO.border);
      bg.setInteractive({ useHandCursor: true });
      this.dayHighlights.set(day, bg);

      createMonoText(this, bx + btnW / 2, by + btnH / 2, LABEL_MAP[day], 'mono').setOrigin(0.5);

      bg.on('pointerup', () => {
        this.choice.weekday = day;
        this.dayHighlights.forEach((rect, d) => {
          rect.setStrokeStyle(ux(1.5), d === day ? MONO.borderStrong : MONO.border);
        });
      });
    });
  }
}
