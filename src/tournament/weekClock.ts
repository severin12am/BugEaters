import type { TournamentWeekday, WeekContext, PassChip } from './types';
import { TOURNAMENT_CONFIG } from './tournamentConfig';
import {
  getActiveDevSession,
  getTournamentOverrideToken,
  isDevSessionUiEnabled,
  loadDevSessionChoice,
  sandboxWeekIdFromIndex,
  type DevSessionChoice,
} from './devSession';

const WEEKDAY_ORDER: TournamentWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const KEY_MAP = {
  monday: 'mon',
  tuesday: 'tue',
  wednesday: 'wed',
  thursday: 'thu',
  friday: 'fri',
  saturday: 'sat',
  sunday: 'sun',
} as const;

export const LABEL_MAP: Record<TournamentWeekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

/** Active weekday for client UI (dev session / URL / real clock). */
export function getDevWeekdayOverride(): TournamentWeekday | null {
  const session = getActiveDevSession();
  if (session) {
    return session.weekday;
  }

  const raw = new URLSearchParams(window.location.search).get('tournamentDay')?.toLowerCase();
  if (!raw) {
    return null;
  }
  const found = WEEKDAY_ORDER.find((d) => d === raw || d.startsWith(raw));
  return found ?? null;
}

/** Packed override for RPCs: "monday|sandbox:2" or "tuesday" or null. */
export function getDevOverrideParam(): string | null {
  return getTournamentOverrideToken();
}

export function getWeekId(now = new Date()): string {
  const session = getActiveDevSession();
  if (session) {
    return sandboxWeekIdFromIndex(session.weekIndex);
  }

  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTournamentWeekday(now = new Date()): TournamentWeekday {
  const override = getDevWeekdayOverride();
  if (override) {
    return override;
  }
  const days: TournamentWeekday[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  return days[now.getUTCDay()];
}

function buildStatusCopy(
  weekday: TournamentWeekday,
  maxSun: number,
): Pick<WeekContext, 'statusHeadline' | 'statusDetail' | 'primaryCta'> {
  switch (weekday) {
    case 'monday':
      return {
        statusHeadline: 'Open registration',
        statusDetail: 'Free race — pick a time slot. No wallet needed.',
        primaryCta: 'Register for Monday',
      };
    case 'sunday':
      return {
        statusHeadline: 'Global finale',
        statusDetail: `Up to ${maxSun} finalists worldwide · one race · one champion.`,
        primaryCta: 'Enter Sunday finale',
      };
    case 'saturday':
      return {
        statusHeadline: 'Elimination day',
        statusDetail: `Win your room → earn 1 of ${maxSun} Sunday passes minted tonight.`,
        primaryCta: 'Ready for Saturday',
      };
    default:
      return {
        statusHeadline: `${LABEL_MAP[weekday]} pass required`,
        statusDetail: 'Burn your pass in the lobby to lock your role and start.',
        primaryCta: `Ready for ${LABEL_MAP[weekday]}`,
      };
  }
}

/** Client-side week context; pass inventory comes from tournament API when online. */
export function getWeekContext(options?: {
  walletLinked?: boolean;
  walletAddress?: string | null;
  championBillboard?: boolean;
  passes?: PassChip[];
  weekdayOverride?: TournamentWeekday;
  weekIdOverride?: string;
}): WeekContext {
  const weekday = options?.weekdayOverride ?? getTournamentWeekday();
  const weekId = options?.weekIdOverride ?? getWeekId();
  const weekdayKey = KEY_MAP[weekday];
  const isMonday = weekday === 'monday';
  const requiresPass = !isMonday;
  const maxSundaySlots = TOURNAMENT_CONFIG.maxSundaySlots;

  return {
    weekId,
    weekday,
    weekdayKey,
    weekdayLabel: LABEL_MAP[weekday],
    isMondayWeb2: isMonday,
    requiresPass,
    requiresWallet: requiresPass,
    isSundayFinale: weekday === 'sunday',
    maxSundaySlots,
    ...buildStatusCopy(weekday, maxSundaySlots),
    passes: options?.passes ?? [],
    walletLinked: options?.walletLinked ?? false,
    walletAddress: options?.walletAddress ?? null,
    championBillboardActive: options?.championBillboard ?? false,
  };
}

export function grantsEntryLabel(day: TournamentWeekday): string {
  return LABEL_MAP[day];
}

function entryForWeekday(day: TournamentWeekday): TournamentWeekday | null {
  const i = WEEKDAY_ORDER.indexOf(day);
  if (i <= 0) {
    return null;
  }
  return WEEKDAY_ORDER[i];
}

/** Label for hub: "Week 3 · Tuesday" when in sandbox. */
export function formatDevSessionBanner(): string | null {
  if (!isDevSessionUiEnabled()) {
    return null;
  }
  const session = getActiveDevSession();
  if (!session) {
    const day = getDevWeekdayOverride();
    return day ? `Dev day: ${LABEL_MAP[day]}` : null;
  }
  return `Playtest · Week ${session.weekIndex} · ${LABEL_MAP[session.weekday]}`;
}

export function peekSavedDevSession(): DevSessionChoice | null {
  if (!isDevSessionUiEnabled()) {
    return null;
  }
  return loadDevSessionChoice();
}

export { entryForWeekday, WEEKDAY_ORDER };
