/**
 * BugEaters Mono — universal black/white UI tokens.
 * Gameplay blood red is the only saturated accent outside grayscale.
 */

export const MONO = {
  /** Near-black — matches road / `#080808` shell */
  void: 0x080808,
  bg: 0x0a0a0a,
  surface: 0x111111,
  surfaceRaised: 0x161616,
  border: 0x2e2e2e,
  borderStrong: 0xffffff,
  text: 0xf2f2f2,
  textSecondary: 0x8a8a8a,
  textMuted: 0x525252,
  ink: 0x000000,
  white: 0xffffff,
  blood: 0xcc0000,
  grainAlpha: 0.045,
} as const;

export const MONO_CSS = {
  fontDisplay: '"Space Mono", "Courier New", monospace',
  fontBody: '"Inter", "Segoe UI", system-ui, sans-serif',
  text: '#f2f2f2',
  textSecondary: '#8a8a8a',
  textMuted: '#525252',
  ink: '#000000',
  blood: '#cc0000',
} as const;

export type UiButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type UiTextVariant = 'display' | 'title' | 'label' | 'body' | 'caption' | 'mono';
