import Phaser from 'phaser';
import { TUNING } from '../config/tuning';
import { GAME_HEIGHT, ux } from '../utils/constants';
import { RoadScroll } from './RoadScroll';
import { createRng, deriveSeed, type Rng } from '../utils/rng';

/** Side of a main-lane divider relative to world X. */
export type DividerSide = 'left' | 'right';

/** Index of the two main-lane dividers: 0 = Bugs|Humans, 1 = Humans|Klaus. */
export type MainDividerIndex = 0 | 1;

/** Visual + physical states for a main-lane divider line. */
enum DividerPhase {
  Solid,
  /** Line scrolling down off the screen (road speed). */
  Exiting,
  /** Line fully gone; boundary still passable until restore begins. */
  OpenGap,
  /** Full line scrolling down into place from above the screen. */
  Entering,
}

/**
 * Main-lane divider driven by RoadScroll.
 * Solid by default; exits and re-enters at road speed like painted lines on the track.
 */
export class MainLaneDivider {
  private line: Phaser.GameObjects.Rectangle | null = null;
  private readonly unsubscribeScroll: () => void;
  private phase = DividerPhase.Solid;
  /** Top Y of the line rect — used for exit (increases) and enter (starts negative). */
  private lineTopY = 0;
  /** Seeded PRNG so open/close timing is identical on every client. */
  private readonly rng: Rng;
  private readonly speedPxPerSec: number;
  /** Accumulated world scroll distance — the deterministic clock for timing. */
  private worldDist = 0;
  /** World distance at which the next interrupt begins. */
  private nextInterruptDist = 0;
  /** World distance at which an open gap should start restoring. */
  private restoreAtDist = 0;
  /** Ability override — dividers fully open and non-blocking. */
  private forcedOpen = false;
  /**
   * Authoritative mode: open/close transitions are triggered by the server
   * (via {@link setServerOpen}) instead of the local seeded schedule. The scroll
   * animation (line entering from the top / exiting off the bottom) still runs so
   * it looks like painted road lines rather than lines that pop in and out.
   */
  private serverDriven = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    readonly side: DividerSide,
    readonly dividerIndex: MainDividerIndex,
    private readonly worldContainer: Phaser.GameObjects.Container,
    roadScroll: RoadScroll,
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.speedPxPerSec = roadScroll.worldSpeedPxPerSec;
    this.unsubscribeScroll = roadScroll.onScroll((deltaY) => this.onRoadScroll(deltaY));
  }

  create(): void {
    const cfg = TUNING.laneDividers;
    this.line = this.scene.add
      .rectangle(this.x, 0, ux(cfg.width), GAME_HEIGHT, cfg.color, cfg.alpha)
      .setDepth(1)
      .setOrigin(0.5, 0);
    this.worldContainer.add(this.line);
    this.applyLineGeometry();
    this.scheduleNextInterrupt();
  }

  getX(): number {
    return this.x;
  }

  /** True only when the full-height line is in place (legacy checks). */
  isSolid(): boolean {
    return this.phase === DividerPhase.Solid;
  }

  /** Whether the divider blocks crossing at a given world Y (e.g. player feet). */
  blocksCrossingAtY(y: number): boolean {
    if (this.forcedOpen) {
      return false;
    }
    if (this.phase === DividerPhase.Solid) {
      return true;
    }
    if (this.phase === DividerPhase.OpenGap) {
      return false;
    }
    if (this.phase === DividerPhase.Exiting) {
      // Visible paint covers [lineTopY, GAME_HEIGHT] — gap above is passable.
      return y >= this.lineTopY;
    }
    // Entering — full-height segment from lineTopY; only block where paint actually is.
    return y >= this.lineTopY && y <= this.lineTopY + GAME_HEIGHT;
  }

  clampPlayerX(
    playerX: number,
    globalSubLaneIndex: number,
    playerY: number,
  ): number {
    if (!this.blocksCrossingAtY(playerY)) {
      return playerX;
    }

    const margin = ux(TUNING.laneDividers.collisionMargin);
    const onLeftSide = this.isGlobalIndexOnLeftSide(globalSubLaneIndex);

    if (onLeftSide) {
      return Math.min(playerX, this.x - margin);
    }
    return Math.max(playerX, this.x + margin);
  }

  /** OPENED BORDERS — keep both dividers fully open. */
  setForcedOpen(open: boolean): void {
    this.forcedOpen = open;
    if (open) {
      this.phase = DividerPhase.OpenGap;
      this.applyLineGeometry();
      return;
    }
    this.phase = DividerPhase.Solid;
    this.applyLineGeometry();
    this.scheduleNextInterrupt();
  }

  /**
   * Switches this divider to server-driven mode. The local seeded schedule is
   * disabled; call {@link setServerOpen} every frame with the authoritative
   * open/closed state and the line will scroll in/out to match.
   */
  setServerDriven(enabled: boolean): void {
    this.serverDriven = enabled;
  }

  /**
   * Authoritative open/closed state for this tick. Triggers the scroll-out
   * (opening) or scroll-in (closing) animation on the transition edges. The
   * animation itself is advanced by {@link onRoadScroll}.
   */
  setServerOpen(open: boolean): void {
    if (!this.serverDriven || this.forcedOpen) {
      return;
    }
    if (open) {
      // Begin opening: line scrolls off the bottom (only from a closed/settling state).
      if (this.phase === DividerPhase.Solid || this.phase === DividerPhase.Entering) {
        this.beginInterrupt();
      }
    } else {
      // Begin closing: full line scrolls in from the top.
      if (this.phase === DividerPhase.OpenGap || this.phase === DividerPhase.Exiting) {
        this.startEntering();
      }
    }
  }

  private onRoadScroll(deltaY: number): void {
    if (this.forcedOpen) {
      return;
    }
    this.worldDist += deltaY;

    // Server-driven: only advance the scroll animation; never self-schedule the
    // open/close timing (the server owns that via setServerOpen).
    if (this.serverDriven) {
      switch (this.phase) {
        case DividerPhase.Exiting:
          this.lineTopY += deltaY;
          if (this.lineTopY >= GAME_HEIGHT) {
            this.phase = DividerPhase.OpenGap;
          }
          this.applyLineGeometry();
          return;
        case DividerPhase.Entering:
          this.lineTopY += deltaY;
          if (this.lineTopY >= 0) {
            this.lineTopY = 0;
            this.phase = DividerPhase.Solid;
          }
          this.applyLineGeometry();
          return;
        default:
          return; // Solid / OpenGap: wait for the next server transition.
      }
    }

    switch (this.phase) {
      case DividerPhase.Solid:
        if (this.worldDist >= this.nextInterruptDist) {
          this.beginInterrupt();
        }
        return;

      case DividerPhase.Exiting:
        this.lineTopY += deltaY;
        if (this.lineTopY >= GAME_HEIGHT) {
          this.phase = DividerPhase.OpenGap;
          if (this.worldDist >= this.restoreAtDist) {
            this.startEntering();
          }
        }
        this.applyLineGeometry();
        return;

      case DividerPhase.OpenGap:
        if (this.worldDist >= this.restoreAtDist) {
          this.startEntering();
        }
        return;

      case DividerPhase.Entering:
        this.lineTopY += deltaY;
        if (this.lineTopY >= 0) {
          this.lineTopY = 0;
          this.phase = DividerPhase.Solid;
          this.scheduleNextInterrupt();
        }
        this.applyLineGeometry();
        return;
    }
  }

  private isGlobalIndexOnLeftSide(globalSubLaneIndex: number): boolean {
    if (this.dividerIndex === 0) {
      return globalSubLaneIndex <= 2;
    }
    return globalSubLaneIndex <= 5;
  }

  private applyLineGeometry(): void {
    if (!this.line) {
      return;
    }

    const width = ux(TUNING.laneDividers.width);

    if (this.phase === DividerPhase.Solid) {
      this.line.setVisible(true);
      this.line.setSize(width, GAME_HEIGHT);
      this.line.setPosition(this.x, 0);
      return;
    }

    if (this.phase === DividerPhase.OpenGap) {
      this.line.setVisible(false);
      return;
    }

    if (this.phase === DividerPhase.Exiting) {
      const height = Math.max(GAME_HEIGHT - this.lineTopY, 0);
      this.line.setVisible(height > 0);
      this.line.setSize(width, height);
      this.line.setPosition(this.x, this.lineTopY);
      return;
    }

    // Entering — full-height segment sliding down from above the screen.
    this.line.setVisible(true);
    this.line.setSize(width, GAME_HEIGHT);
    this.line.setPosition(this.x, this.lineTopY);
  }

  private scheduleNextInterrupt(): void {
    const cfg = TUNING.laneDividers;
    const delaySec = this.rng.between(cfg.interruptIntervalMinSec, cfg.interruptIntervalMaxSec);
    this.nextInterruptDist = this.worldDist + delaySec * this.speedPxPerSec;
  }

  private beginInterrupt(): void {
    const cfg = TUNING.laneDividers;
    this.phase = DividerPhase.Exiting;
    this.lineTopY = 0;

    const durationSec = this.rng.between(
      cfg.interruptDurationMinSec,
      cfg.interruptDurationMaxSec,
    );
    // Open window starts counting from the moment the interrupt begins (matches
    // the original timer behaviour), measured in world distance.
    this.restoreAtDist = this.worldDist + durationSec * this.speedPxPerSec;
    this.applyLineGeometry();
  }

  private startEntering(): void {
    this.phase = DividerPhase.Entering;
    this.lineTopY = -GAME_HEIGHT;
    this.applyLineGeometry();
  }

  destroy(): void {
    this.unsubscribeScroll();
    this.line?.destroy();
    this.line = null;
  }
}

export function createMainLaneDividers(
  scene: Phaser.Scene,
  dividerXs: number[],
  worldContainer: Phaser.GameObjects.Container,
  roadScroll: RoadScroll,
  seed: number,
): MainLaneDivider[] {
  const sides: DividerSide[] = ['left', 'right'];
  return dividerXs.map((x, index) => {
    const divider = new MainLaneDivider(
      scene,
      x,
      sides[index],
      index as MainDividerIndex,
      worldContainer,
      roadScroll,
      // Independent stream per divider so the two lines don't open in lockstep.
      deriveSeed(seed, 100 + index),
    );
    divider.create();
    return divider;
  });
}

export function isMainBoundaryCrossing(
  globalSubLaneIndex: number,
  direction: 'left' | 'right',
): MainDividerIndex | null {
  if (direction === 'right' && globalSubLaneIndex === 2) {
    return 0;
  }
  if (direction === 'left' && globalSubLaneIndex === 3) {
    return 0;
  }
  if (direction === 'right' && globalSubLaneIndex === 5) {
    return 1;
  }
  if (direction === 'left' && globalSubLaneIndex === 6) {
    return 1;
  }
  return null;
}
