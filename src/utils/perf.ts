/**
 * Performance profile for weak phones / Telegram WebView.
 *
 * Everything render-cost related that varies by device lives here so the rest
 * of the game reads one object instead of sniffing `navigator` in many places.
 *
 * Resolution order (first match wins):
 *   1. `?perf=low|high|auto` in the URL (also persisted for later launches)
 *   2. Persisted user choice (`bugeaters.perf.mode`)
 *   3. Persisted auto-learn result from a previous laggy race (`bugeaters.perf.auto`)
 *   4. Device heuristics (low RAM / few cores / old WebView)
 *
 * IMPORTANT: this module is imported by `layout.ts`, which sizes the canvas at
 * module-load time. Nothing here may import Phaser or scene code.
 */

export type PerfTier = 'low' | 'high';

export interface PerfProfile {
  tier: PerfTier;
  /** Upper bound for the internal canvas DPR (2 = retina-sharp, 1.5 = lighter). */
  dprCap: number;
  /** WebGL context MSAA. Off on low tier — it multiplies fill cost on tile GPUs. */
  antialiasGL: boolean;
  /** Cast shadows under runners (ellipse shapes, one per lit runner). */
  castShadows: boolean;
  /** Puffs per smoke tick on the DAVOS jet. */
  flightSmokePuffs: number;
  /** Where the tier came from — surfaced in the FPS HUD for diagnosis. */
  source: 'url' | 'stored' | 'auto' | 'heuristic' | 'default';
}

const MODE_KEY = 'bugeaters.perf.mode';
const AUTO_KEY = 'bugeaters.perf.auto';
const POOR_STREAK_KEY = 'bugeaters.perf.poorRaces';
const URL_PARAM = 'perf';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Private mode / blocked storage — the override simply does not persist.
  }
}

function parseTier(raw: string | null): PerfTier | null {
  if (raw === 'low' || raw === 'high') {
    return raw;
  }
  return null;
}

interface NavigatorHints {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgent?: string;
}

/**
 * Conservative low-end detection. Only flags devices that are very likely to
 * struggle with a DPR-2 full-screen blended scene; everything else stays sharp
 * and relies on the in-race auto-learn to downgrade if needed.
 */
export function detectLowEndDevice(nav: NavigatorHints = navigator as NavigatorHints): boolean {
  const memory = nav.deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory <= 3) {
    return true;
  }
  const cores = nav.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= 4) {
    // Chrome/Android only reports real core counts; Safari clamps or omits it.
    const ua = nav.userAgent ?? '';
    if (/Android/i.test(ua)) {
      return true;
    }
  }
  return false;
}

function resolveTier(): { tier: PerfTier; source: PerfProfile['source'] } {
  if (typeof window === 'undefined') {
    return { tier: 'high', source: 'default' };
  }

  const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM);
  if (fromUrl === 'auto') {
    writeStorage(MODE_KEY, null);
    writeStorage(AUTO_KEY, null);
    writeStorage(POOR_STREAK_KEY, null);
  } else {
    const urlTier = parseTier(fromUrl);
    if (urlTier) {
      writeStorage(MODE_KEY, urlTier);
      return { tier: urlTier, source: 'url' };
    }
  }

  const stored = parseTier(readStorage(MODE_KEY));
  if (stored) {
    return { tier: stored, source: 'stored' };
  }

  const learned = parseTier(readStorage(AUTO_KEY));
  if (learned) {
    return { tier: learned, source: 'auto' };
  }

  if (detectLowEndDevice()) {
    return { tier: 'low', source: 'heuristic' };
  }
  return { tier: 'high', source: 'default' };
}

function buildProfile(tier: PerfTier, source: PerfProfile['source']): PerfProfile {
  if (tier === 'low') {
    return {
      tier,
      dprCap: 1.5,
      antialiasGL: false,
      castShadows: false,
      flightSmokePuffs: 1,
      source,
    };
  }
  return {
    tier,
    dprCap: 2,
    antialiasGL: true,
    castShadows: true,
    flightSmokePuffs: 3,
    source,
  };
}

/**
 * Largest DPR at which the internal canvas still fits the PHYSICAL screen.
 *
 * The canvas is always laid out as 390×844 logical px × DPR, then FIT-scaled
 * into the viewport. On smaller phones (iPhone 8: 750×1334 device px) a DPR-2
 * canvas (780×1688) is rendered and then shrunk — ~30% of every frame's fill
 * is thrown away. Capping at the screen's real pixel size costs no sharpness.
 * `screen.*` is used (not the viewport) because Telegram resizes the viewport
 * after boot.
 */
export function screenPixelDprCap(
  logicalWidth: number,
  logicalHeight: number,
  screenLike: { width?: number; height?: number; dpr?: number } = {
    width: typeof screen !== 'undefined' ? screen.width : undefined,
    height: typeof screen !== 'undefined' ? screen.height : undefined,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio : undefined,
  },
): number {
  const w = screenLike.width ?? 0;
  const h = screenLike.height ?? 0;
  const dpr = screenLike.dpr ?? 1;
  if (!(w > 0) || !(h > 0) || !(dpr > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  // Portrait game: pair the short screen side with logical width.
  const physShort = Math.min(w, h) * dpr;
  const physLong = Math.max(w, h) * dpr;
  const cap = Math.min(physShort / logicalWidth, physLong / logicalHeight);
  // Never go below 1 (tiny screens still get a full-res logical canvas).
  return Math.max(1, Math.round(cap * 100) / 100);
}

const resolved = resolveTier();

/** The active profile for this page load. Canvas size is derived from it. */
export const PERF_PROFILE: PerfProfile = buildProfile(resolved.tier, resolved.source);

/** Consecutive poor races needed before the low tier is stored (one bad race can be a background download). */
export const POOR_RACES_TO_DOWNGRADE = 2;

/**
 * Called by the in-race frame monitor at the end of every race. After
 * {@link POOR_RACES_TO_DOWNGRADE} poor races in a row the low tier is stored and
 * takes effect on the next launch (the canvas size cannot change mid-session).
 * A smooth race resets the streak. Never overrides an explicit user/URL choice.
 *
 * @returns 'downgraded' when the low tier was just stored.
 */
export function recordRaceQuality(poor: boolean): 'downgraded' | 'poor' | 'ok' | 'ignored' {
  if (PERF_PROFILE.tier === 'low' || parseTier(readStorage(MODE_KEY))) {
    return 'ignored';
  }
  if (!poor) {
    writeStorage(POOR_STREAK_KEY, null);
    return 'ok';
  }
  const streak = Number(readStorage(POOR_STREAK_KEY) ?? '0') + 1;
  if (streak >= POOR_RACES_TO_DOWNGRADE) {
    writeStorage(POOR_STREAK_KEY, null);
    writeStorage(AUTO_KEY, 'low');
    return 'downgraded';
  }
  writeStorage(POOR_STREAK_KEY, String(streak));
  return 'poor';
}

/** Frame-time thresholds shared by the monitor and the HUD readout. */
export const FRAME_MONITOR = {
  /** A frame slower than this (ms) counts as a hitch. ~36 fps. */
  slowFrameMs: 28,
  /** Ignore the first part of a race (asset warm-up, shader compile). */
  warmupMs: 3000,
  /** Need at least this many sampled frames before drawing a conclusion. */
  minFrames: 600,
  /** Downgrade when this share of sampled frames were slow. */
  slowShareThreshold: 0.2,
} as const;

/** `?fps=1` shows the in-race frame readout (also on in the ability lab). */
export function isFpsHudRequested(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const raw = new URLSearchParams(window.location.search).get('fps');
  return raw === '1' || raw === 'true';
}

/**
 * Rolling race frame statistics. Fed with the RAW frame delta (not Phaser's
 * smoothed one) so real hitches are counted.
 */
export class FrameMonitor {
  private warmupLeftMs = FRAME_MONITOR.warmupMs;
  private frames = 0;
  private slowFrames = 0;
  private totalMs = 0;
  /** Short window for the live HUD readout. */
  private windowFrames = 0;
  private windowMs = 0;
  private windowSlow = 0;
  private lastFps = 0;
  private lastWindowSlowShare = 0;

  sample(rawDeltaMs: number): void {
    if (!(rawDeltaMs > 0) || rawDeltaMs > 1000) {
      return; // tab switch / background — not a render hitch
    }
    if (this.warmupLeftMs > 0) {
      this.warmupLeftMs -= rawDeltaMs;
      return;
    }
    this.frames++;
    this.totalMs += rawDeltaMs;
    const slow = rawDeltaMs > FRAME_MONITOR.slowFrameMs;
    if (slow) {
      this.slowFrames++;
    }
    this.windowFrames++;
    this.windowMs += rawDeltaMs;
    if (slow) {
      this.windowSlow++;
    }
    if (this.windowMs >= 500) {
      this.lastFps = (this.windowFrames * 1000) / this.windowMs;
      this.lastWindowSlowShare = this.windowSlow / this.windowFrames;
      this.windowFrames = 0;
      this.windowMs = 0;
      this.windowSlow = 0;
    }
  }

  /** Frames per second over the last ~half second (0 until warm). */
  get fps(): number {
    return this.lastFps;
  }

  /** Share of hitch frames over the last ~half second. */
  get recentSlowShare(): number {
    return this.lastWindowSlowShare;
  }

  get sampledFrames(): number {
    return this.frames;
  }

  get averageFps(): number {
    return this.totalMs > 0 ? (this.frames * 1000) / this.totalMs : 0;
  }

  get slowShare(): number {
    return this.frames > 0 ? this.slowFrames / this.frames : 0;
  }

  /** True when enough of the race was sampled and it ran badly. */
  ranPoorly(): boolean {
    return (
      this.frames >= FRAME_MONITOR.minFrames &&
      this.slowShare >= FRAME_MONITOR.slowShareThreshold
    );
  }
}
