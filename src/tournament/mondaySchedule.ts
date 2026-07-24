import { TOURNAMENT_CONFIG } from './tournamentConfig';
import type { MondayTimeSlot } from './types';

export interface SlotWindow {
  slotId: string;
  label: string;
  opensAtMs: number;
  closesAtMs: number;
}

export function findMondaySlot(slotId: string): MondayTimeSlot | undefined {
  return TOURNAMENT_CONFIG.mondayTimeSlots.find((s) => s.id === slotId);
}

/** Slot open/close times in UTC ms for the week's Monday date (week_id). */
export function getSlotWindow(weekId: string, slotId: string): SlotWindow | null {
  const slot = findMondaySlot(slotId);
  if (!slot) {
    return null;
  }

  const [y, m, d] = weekId.split('-').map(Number);
  const opensAtMs = Date.UTC(y, m - 1, d, slot.hourUtc, slot.minuteUtc, 0);
  const gatherMs = TOURNAMENT_CONFIG.mondayGatherMinutes * 60 * 1000;
  return {
    slotId,
    label: slot.label,
    opensAtMs,
    closesAtMs: opensAtMs + gatherMs,
  };
}

export type SlotPhase = 'before' | 'open' | 'closed';

export function getSlotPhase(nowMs: number, window: SlotWindow): SlotPhase {
  if (nowMs < window.opensAtMs) {
    return 'before';
  }
  if (nowMs <= window.closesAtMs) {
    return 'open';
  }
  return 'closed';
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
