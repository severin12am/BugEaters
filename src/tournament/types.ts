export type TournamentWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface PassChip {
  id: string;
  grantsEntry: TournamentWeekday;
  wonOn: TournamentWeekday;
  weekId: string;
}

export interface WeekContext {
  weekId: string;
  weekday: TournamentWeekday;
  weekdayKey: WeekdayKey;
  weekdayLabel: string;
  isMondayWeb2: boolean;
  requiresPass: boolean;
  requiresWallet: boolean;
  isSundayFinale: boolean;
  maxSundaySlots: number;
  /** Copy for hub status card — driven by rules, not hardcoded in scenes */
  statusHeadline: string;
  statusDetail: string;
  primaryCta: string;
  passes: PassChip[];
  walletLinked: boolean;
  walletAddress: string | null;
  championBillboardActive: boolean;
}

export interface MondayTimeSlot {
  id: string;
  label: string;
  hourUtc: number;
  minuteUtc: number;
}
