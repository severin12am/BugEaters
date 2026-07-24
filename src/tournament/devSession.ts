/**
 * Dev / playtest session controls.
 *
 * When enabled (see isDevSessionUiEnabled), the player picks a weekday +
 * sandbox tournament week. Sandbox weeks isolate progress so Monday race
 * limits do not block re-testing.
 *
 * Production: leave VITE_ALLOW_DEV_SESSION unset/false and set game_config
 * dev_mode=false — overrides are ignored server-side.
 */

import type { TournamentWeekday } from './types';

const STORAGE_KEY = 'bugeaters.devSession.v1';
const CONFIRMED_KEY = 'bugeaters.devSession.confirmed';

/** Reserved Monday for sandbox week 1 — must match SQL 0009. */
export const SANDBOX_WEEK_ANCHOR = '2090-01-04';

export const DEV_WEEKDAYS: TournamentWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export interface DevSessionChoice {
  /** 1-based sandbox tournament index (isolated progress). */
  weekIndex: number;
  weekday: TournamentWeekday;
}

export function isDevSessionUiEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const envFlag = import.meta.env.VITE_ALLOW_DEV_SESSION?.trim().toLowerCase();
  if (envFlag === 'false' || envFlag === '0') {
    return false;
  }
  if (envFlag === 'true' || envFlag === '1') {
    return true;
  }
  if (import.meta.env.DEV) {
    return true;
  }
  const q = new URLSearchParams(window.location.search);
  return q.get('devSession') === '1' || q.get('devSession') === 'true';
}

export function isDevSessionConfirmed(): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }
  return sessionStorage.getItem(CONFIRMED_KEY) === '1';
}

export function clearDevSessionConfirmation(): void {
  sessionStorage.removeItem(CONFIRMED_KEY);
}

/** Clear stored week/day and confirmation — back to Week 1 / Monday. */
export function resetDevSessionChoice(): DevSessionChoice {
  const fresh: DevSessionChoice = { weekIndex: 1, weekday: 'monday' };
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CONFIRMED_KEY);
  } catch {
    // ignore storage failures in restricted WebViews
  }
  return fresh;
}

export function loadDevSessionChoice(): DevSessionChoice {
  const fallback: DevSessionChoice = { weekIndex: 1, weekday: 'monday' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<DevSessionChoice>;
    const weekIndex = Number(parsed.weekIndex);
    const weekday = parsed.weekday as TournamentWeekday | undefined;
    if (!Number.isFinite(weekIndex) || weekIndex < 1 || weekIndex > 99) {
      return fallback;
    }
    if (!weekday || !DEV_WEEKDAYS.includes(weekday)) {
      return fallback;
    }
    return { weekIndex: Math.floor(weekIndex), weekday };
  } catch {
    return fallback;
  }
}

export function saveDevSessionChoice(choice: DevSessionChoice): void {
  const safe: DevSessionChoice = {
    weekIndex: Math.max(1, Math.min(99, Math.floor(choice.weekIndex))),
    weekday: choice.weekday,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  sessionStorage.setItem(CONFIRMED_KEY, '1');
}

/** Map sandbox index → week_id date string (mirrors SQL sandbox_week_id_from_index). */
export function sandboxWeekIdFromIndex(index: number): string {
  const n = Math.max(1, Math.floor(index));
  const [y, m, d] = SANDBOX_WEEK_ANCHOR.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + (n - 1) * 7));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function sandboxIndexFromWeekId(weekId: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekId)) {
    return null;
  }
  const [y, m, d] = weekId.split('-').map(Number);
  const [ay, am, ad] = SANDBOX_WEEK_ANCHOR.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const anchor = Date.UTC(ay, am - 1, ad);
  const dayMs = 86400000;
  const days = Math.round((target - anchor) / dayMs);
  if (days < 0 || days % 7 !== 0) {
    return null;
  }
  if (y < 2090 || y >= 2100) {
    return null;
  }
  return days / 7 + 1;
}

export function isSandboxWeekId(weekId: string): boolean {
  return sandboxIndexFromWeekId(weekId) != null;
}

/**
 * Token sent as RPC p_override / join-room override.
 * Format: "tuesday|sandbox:3" — only honored when server dev_mode=true.
 */
export function getTournamentOverrideToken(): string | null {
  if (!isDevSessionUiEnabled() || !isDevSessionConfirmed()) {
    // URL-only day override (legacy) still works without full session UI.
    const urlDay = new URLSearchParams(window.location.search).get('tournamentDay')?.toLowerCase();
    if (urlDay && DEV_WEEKDAYS.some((d) => d === urlDay || d.startsWith(urlDay))) {
      const day = DEV_WEEKDAYS.find((d) => d === urlDay || d.startsWith(urlDay))!;
      return day;
    }
    return null;
  }

  const choice = loadDevSessionChoice();
  return `${choice.weekday}|sandbox:${choice.weekIndex}`;
}

export function getActiveDevSession(): DevSessionChoice | null {
  if (!isDevSessionUiEnabled() || !isDevSessionConfirmed()) {
    return null;
  }
  return loadDevSessionChoice();
}
