import type { CrisisBlameCountryModifier } from "@/lib/db/types/events";
import { boundPartyShift } from "@/lib/crises/v2/blame";

export type CrisisBlameShift = Pick<
  CrisisBlameCountryModifier,
  "partyId" | "regionIds" | "pct" | "expiresAtTurn"
>;

/**
 * Per-party nominal-share multiplier from crisis credit and blame. Shifts that
 * name regions only count in a race held in one of them. Each party's total is
 * bounded, and parties not in the race are left out.
 */
export function buildCrisisBlameModifierByParty(
  shifts: readonly CrisisBlameShift[],
  stateId: string | undefined,
  partyIdsInRace: ReadonlySet<string>,
  turn: number
): Map<string, number> {
  const totals = new Map<string, number>();
  const state = stateId?.toUpperCase();
  for (const shift of shifts) {
    if (shift.expiresAtTurn <= turn || !partyIdsInRace.has(shift.partyId)) continue;
    if (shift.regionIds.length > 0) {
      if (!state || !shift.regionIds.some((id) => id.toUpperCase() === state)) continue;
    }
    totals.set(shift.partyId, (totals.get(shift.partyId) ?? 0) + shift.pct);
  }
  const modifiers = new Map<string, number>();
  for (const [partyId, total] of totals) {
    const pct = boundPartyShift(total);
    if (pct !== 0) modifiers.set(partyId, 1 + pct / 100);
  }
  return modifiers;
}
