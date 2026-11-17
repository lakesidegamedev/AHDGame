/**
 * Era baseline tech: owned from founding, kept outside the research caps.
 *
 * A world that starts in a late year founds every corporation with the baseline
 * nodes of every decade before the world's starting decade (see
 * autoGrantedNodeIds). Those nodes stay owned in every mode, so prerequisites,
 * strategy availability, history and display keep working. What changes is how
 * their running effects count (`gameConfig.legacyTechMode`):
 *
 *  - "baseline": the effects keep today's size but sit in their own layer,
 *    clamped to the caps by themselves and added on top of the researched
 *    layer (see aggregateTechEffectLayers). Research then has the full cap to
 *    work with. A world founded under the old single cap keeps its numbers.
 *  - "off": the effects give nothing. Fresh worlds run like this; absent
 *    config means "off".
 */
import { TECH_DECADES, getDecadeById, getDecadeForYear } from "@/lib/constants/techTree/decades";

/** `gameConfig.legacyTechMode`. Absent or anything else is "off". */
export type LegacyTechMode = "baseline" | "off";

/** What every tech effect aggregation needs to know about the world's era. */
export interface LegacyTechContext {
  /** Calendar year of turn 1 (the reset preset's starting year). */
  startingYear: number;
  /** How pre-start-decade node effects count. */
  mode: LegacyTechMode;
}

/** Read the stored mode: only the exact string "baseline" turns it on. */
export function resolveLegacyTechMode(raw: unknown): LegacyTechMode {
  return raw === "baseline" ? "baseline" : "off";
}

/** Build the context from the stored starting year and `gameConfig.legacyTechMode`. */
export function resolveLegacyTechContext(input: {
  startingYear: number;
  mode: unknown;
}): LegacyTechContext {
  return { startingYear: input.startingYear, mode: resolveLegacyTechMode(input.mode) };
}

/** True when `decadeId` is earlier than the decade of the world's starting year. */
export function isPreStartDecade(decadeId: string, startingYear: number): boolean {
  const decade = getDecadeById(decadeId);
  if (!decade) return false;
  return decade.startYear < getDecadeForYear(startingYear).startYear;
}

/** Decade ids earlier than the world's starting decade (1940 to 2009 for a 2027 start). */
export function preStartDecadeIds(startingYear: number): string[] {
  return TECH_DECADES.filter((d) => isPreStartDecade(d.id, startingYear)).map((d) => d.id);
}

/** True when a node of `decadeId` belongs to the era baseline layer of this world. */
export function isLegacyTechDecade(decadeId: string, legacy: LegacyTechContext): boolean {
  return isPreStartDecade(decadeId, legacy.startingYear);
}
