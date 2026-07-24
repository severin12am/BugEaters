import { ABILITY_MAX_SLOTS } from '../config/abilities';

/** Unity `Ability table` — max 3 stored; newest pickup is armed by default. */
export class AbilityInventory {
  private readonly slots: string[] = [];
  private selectedArmedIndex = -1;

  get count(): number {
    return this.slots.length;
  }

  get armedIndex(): number {
    if (this.slots.length === 0) {
      return -1;
    }
    if (this.selectedArmedIndex < 0 || this.selectedArmedIndex >= this.slots.length) {
      return this.slots.length - 1;
    }
    return this.selectedArmedIndex;
  }

  getArmedId(): string | null {
    const idx = this.armedIndex;
    return idx >= 0 ? this.slots[idx] : null;
  }

  readonlySlots(): readonly string[] {
    return this.slots;
  }

  get isFull(): boolean {
    return this.slots.length >= ABILITY_MAX_SLOTS;
  }

  /** Adds pickup if a slot is free. Newest becomes armed. Returns false when full. */
  add(abilityId: string): boolean {
    if (this.slots.length >= ABILITY_MAX_SLOTS) {
      return false;
    }
    this.slots.push(abilityId);
    this.selectedArmedIndex = this.slots.length - 1;
    return true;
  }

  /** Select which stored ability is armed (tap a different slot). */
  armAt(index: number): boolean {
    if (index < 0 || index >= this.slots.length) {
      return false;
    }
    this.selectedArmedIndex = index;
    return true;
  }

  /** Consumes and returns the currently armed ability id. */
  consumeArmed(): string | null {
    const idx = this.armedIndex;
    if (idx < 0) {
      return null;
    }
    const id = this.slots.splice(idx, 1)[0] ?? null;
    if (this.slots.length === 0) {
      this.selectedArmedIndex = -1;
    } else if (this.selectedArmedIndex >= this.slots.length) {
      this.selectedArmedIndex = this.slots.length - 1;
    }
    return id;
  }

  reset(): void {
    this.slots.length = 0;
    this.selectedArmedIndex = -1;
  }
}
