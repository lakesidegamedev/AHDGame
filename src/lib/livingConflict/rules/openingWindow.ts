/**
 * When an unopened living conflict may open. Pure: the def, the stored state
 * and the in-game year in, a yes or no out.
 *
 * The calendar window is the def's `fromYear` and `untilYear`. A missing bound
 * never closes the window, so a family with no `untilYear` stays eligible
 * through 2050 and beyond. An unknown year only closes a bounded side: the
 * engine cannot prove that a 2029 family's era has begun in a world with no
 * clock, so it waits rather than opening early.
 *
 * Authored preset openings (for example a surviving federation in the 2027
 * world) are data on the def, matched against the state's recorded opening
 * provenance, instead of literal years in the driver.
 */
import type { LivingConflictDef, LivingConflictState } from "../types";

export function calendarWindowOpen(
  def: Pick<LivingConflictDef, "fromYear" | "untilYear">,
  year: number | null | undefined
): boolean {
  const known = typeof year === "number" && Number.isFinite(year);
  if (def.fromYear !== undefined && (!known || year < def.fromYear)) return false;
  if (def.untilYear !== undefined && (!known || year > def.untilYear)) return false;
  return true;
}

export function presetOpeningWindowOpen(
  def: Pick<LivingConflictDef, "presetOpeningWindows">,
  state: Pick<LivingConflictState, "openingProvenance" | "openingDisposition">,
  year: number | null | undefined
): boolean {
  if (typeof year !== "number" || !Number.isFinite(year)) return false;
  return (def.presetOpeningWindows ?? []).some(
    (window) =>
      state.openingProvenance?.preset === window.preset &&
      state.openingDisposition === window.disposition &&
      year >= window.fromYear &&
      year <= window.untilYear
  );
}

export function openingWindowOpen(
  def: Pick<LivingConflictDef, "fromYear" | "untilYear" | "presetOpeningWindows">,
  state: Pick<LivingConflictState, "openingProvenance" | "openingDisposition">,
  year: number | null | undefined
): boolean {
  return calendarWindowOpen(def, year) || presetOpeningWindowOpen(def, state, year);
}
