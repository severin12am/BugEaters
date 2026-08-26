/**
 * First-run onboarding gate.
 *
 * Shown once after BootScene, then skipped forever unless reset
 * or forced with `?onboarding=1`.
 */

const STORAGE_KEY = 'bugeaters.onboarding.v2';

export function hasCompletedOnboarding(): boolean {
  if (typeof localStorage === 'undefined') {
    return true;
  }
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Restricted WebViews — don't trap the player in onboarding.
    return true;
  }
}

export function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore storage failures
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Force the flow (e.g. `?onboarding=1`) even if already completed. */
export function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const q = new URLSearchParams(window.location.search);
  if (q.get('onboarding') === '1' || q.get('onboarding') === 'true') {
    return true;
  }
  return !hasCompletedOnboarding();
}
