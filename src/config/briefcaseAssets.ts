/** Briefcase pickup art exported from Unity (`чемодан` walk cycle). */
export const BRIEFCASE_FRAME_COUNT = 11;
export const BRIEFCASE_FRAME_RATE = 12;
export const BRIEFCASE_ATLAS_KEY = 'prop-briefcase-atlas';
export const BRIEFCASE_ANIM_KEY = 'prop-briefcase-walk';
export const BRIEFCASE_BOOSTER_TEXTURE_KEY = 'prop-booster-burst';
export const SLIDE_TRAIL_TEXTURE_KEY = 'prop-slide-trail';
export const PASSPORT_TEXTURE_KEY = 'prop-passport';

export const BOOSTER_TEXTURE_KEYS = [
  'prop-booster-9',
  'prop-booster-12',
  'prop-booster-13',
  'prop-booster-17',
] as const;

export function briefcaseFramePath(index: number): string {
  return `assets/props/briefcase/${String(index).padStart(2, '0')}.png`;
}
