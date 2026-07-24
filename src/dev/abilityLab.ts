/** Dev-only ability sandbox — open with `?abilityLab=1`. */
export const ABILITY_LAB_URL_PARAM = 'abilityLab';

export function isAbilityLabFromUrl(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const raw = new URLSearchParams(window.location.search).get(ABILITY_LAB_URL_PARAM);
  return raw === '1' || raw === 'true';
}

export function isAbilityLabActive(registry: { get: (key: string) => unknown }): boolean {
  return registry.get('abilityLab') === true;
}
