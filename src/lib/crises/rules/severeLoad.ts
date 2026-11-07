/**
 * Cross-system stacking guard: at most two severe crises may hold a country at
 * once, counting crisis templates and living conflicts together. A third is
 * deferred, not dropped: the spawner leaves it pending and it lands once one of
 * the two ends.
 *
 * Plain data in, plain data out. The shell reads active crises and living
 * conflict memberships and passes them here.
 */
import { SEVERE_CONFLICT_LIMIT, stackingAllows } from "@/lib/livingConflict/rules/futureConflicts";

/** The same limit the living-conflict families already respect. */
export const SEVERE_CRISIS_LIMIT = SEVERE_CONFLICT_LIMIT;

/** The fields of an active crisis the guard reads. */
export interface SevereCrisisRow {
  scope: "country" | "region" | "global";
  countryIds: readonly string[];
  opportunity?: boolean;
  /** Living-conflict response windows are counted through the conflict itself. */
  livingConflictEventId?: string;
}

/**
 * Whether an active crisis counts toward its countries' severe load.
 *
 * Every national or regional crisis counts, except opportunities and the
 * response windows a living conflict opens (the conflict is counted once,
 * through its own membership, not once per window). World-scoped crises hit
 * every country alike, so they cannot be the reason one country is held back.
 */
export function countsAsSevereCrisis(row: SevereCrisisRow): boolean {
  if (row.opportunity === true) return false;
  if (row.livingConflictEventId) return false;
  return row.scope !== "global";
}

/**
 * Severe load per country: active severe crises plus the living conflicts that
 * hold each country in a severe role. A country appears once per crisis or
 * conflict, however many of its regions are hit.
 */
export function severeLoadByCountry(
  crises: readonly SevereCrisisRow[],
  livingConflictCountryIds: readonly (readonly string[])[]
): Map<string, number> {
  const load = new Map<string, number>();
  const add = (ids: readonly string[]) => {
    for (const countryId of new Set(ids)) load.set(countryId, (load.get(countryId) ?? 0) + 1);
  };
  for (const crisis of crises) if (countsAsSevereCrisis(crisis)) add(crisis.countryIds);
  for (const ids of livingConflictCountryIds) add(ids);
  return load;
}

/** Add one load map into another, returning a new map. */
export function mergeSevereLoads(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>
): Map<string, number> {
  const out = new Map(a);
  for (const [countryId, count] of b) out.set(countryId, (out.get(countryId) ?? 0) + count);
  return out;
}

/** True when a country has room for one more severe crisis. */
export function severeSlotFree(countryId: string, load: ReadonlyMap<string, number>): boolean {
  return stackingAllows(countryId, load);
}

/** Record a newly spawned severe crisis so later spawns in the same turn see it. */
export function occupySevereSlot(countryId: string, load: Map<string, number>): void {
  load.set(countryId, (load.get(countryId) ?? 0) + 1);
}
