/**
 * In-game Guide photos — real race screenshots with callout chips.
 * PNGs live in public/assets/guide/. Capture with scripts/capture-guide-shots.mjs.
 * nx/ny mark the object; `place` puts the name beside it so the sprite stays visible.
 */
export type CalloutPlace = 'above' | 'below' | 'left' | 'right';

export interface GuideShotCallout {
  /** Label drawn on the photo. */
  readonly text: string;
  /** 0–1 across the image (left → right) — object, not the chip. */
  readonly nx: number;
  /** 0–1 down the image (top → bottom) — object, not the chip. */
  readonly ny: number;
  /** Side of the object to sit the name on. Ignored when chipNx/chipNy are set. */
  readonly place?: CalloutPlace;
  /** Optional explicit chip position (0–1). When set, `place` is ignored. */
  readonly chipNx?: number;
  readonly chipNy?: number;
}

export interface GuideShotDef {
  readonly id: string;
  readonly key: string;
  readonly path: string;
  readonly callouts: readonly GuideShotCallout[];
}

export const GUIDE_SHOTS: readonly GuideShotDef[] = [
  {
    id: 'runner',
    key: 'guide-shot-runner',
    path: 'assets/guide/runner.png',
    callouts: [],
  },
  {
    id: 'you',
    key: 'guide-shot-you',
    path: 'assets/guide/you.png',
    callouts: [{ text: 'YOU', nx: 0.5, ny: 0.78, chipNx: 0.22, chipNy: 0.28 }],
  },
  {
    id: 'others',
    key: 'guide-shot-others',
    path: 'assets/guide/others.png',
    callouts: [
      { text: 'YOU', nx: 0.5, ny: 0.82, chipNx: 0.18, chipNy: 0.72 },
      { text: 'OTHERS', nx: 0.39, ny: 0.48, chipNx: 0.62, chipNy: 0.28 },
    ],
  },
  {
    id: 'obstacles',
    key: 'guide-shot-obstacles',
    path: 'assets/guide/obstacles.png',
    callouts: [
      { text: 'TRASH', nx: 0.27, ny: 0.3, chipNx: 0.27, chipNy: 0.52 },
      { text: 'HOLE', nx: 0.62, ny: 0.28, chipNx: 0.82, chipNy: 0.48 },
    ],
  },
  {
    id: 'boosts',
    key: 'guide-shot-boosts',
    path: 'assets/guide/boosts.png',
    callouts: [
      { text: 'PUDDLE', nx: 0.56, ny: 0.37, chipNx: 0.82, chipNy: 0.5 },
      { text: 'BRIEFCASE', nx: 0.5, ny: 0.2, chipNx: 0.22, chipNy: 0.38 },
    ],
  },
] as const;

export function getGuideShot(id: string): GuideShotDef | undefined {
  return GUIDE_SHOTS.find((shot) => shot.id === id);
}

export function isGuideShotId(id: string): boolean {
  return getGuideShot(id) !== undefined;
}
