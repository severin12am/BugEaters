export type TournamentWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type PassMintStatus = 'pending' | 'minting' | 'minted' | 'failed' | 'skipped';

export interface PassChip {
  id: string;
  grantsEntry: TournamentWeekday;
  wonOn: TournamentWeekday;
  weekId: string;
  /** TON item address once minted (null while the minter is still working). */
  nftAddress?: string | null;
  nftIndex?: number | null;
  mintStatus?: PassMintStatus;
}

/** Chain settings the server exposes so the client knows how a burn must happen. */
export interface ChainConfig {
  network: 'testnet' | 'mainnet';
  collectionAddress: string | null;
  burnAddress: string | null;
  /** When true a minted pass must be burned on TON (wallet signature) to race. */
  passRequiredOnchain: boolean;
  devMode: boolean;
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
