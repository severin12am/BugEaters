/**
 * Unity-style street lighting: near-black unlit, intense pools, long cast shadows.
 */
export const LIGHTING_TUNING = {
  enabled: true,
  /** Max distance (logical px) from lamp — circular falloff. */
  lampInfluenceRadius: 680,
  /** Road light pool diameter (logical px) — width = height (circle). */
  poolDiameter: 680,
  /** Light falloff curve: lower = softer/longer tail (1 = linear, 3 = sharp). */
  poolFalloffExponent: 0.85,
  /** ADD blend strength on the light pool (higher = harsher hotspot). */
  poolMaxAlpha: 0.38,
  /** Full-screen multiply veil over road + characters (0–1). Lower = brighter world. */
  darknessVeilAlpha: 0.44,
  /** Cast shadow length at lamp (logical px). */
  castShadowLengthMin: 44,
  castShadowLengthMax: 200,
  /** Cast shadow width vs character display width. */
  castShadowWidthFactor: 0.72,
  /** Cast shadow opacity on lit ground. */
  castShadowAlpha: 0.94,
} as const;
