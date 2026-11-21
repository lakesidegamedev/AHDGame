/**
 * Era baseline tech: owned from founding, kept outside the research caps.
 *
 * A late-start world founds every corporation with the baseline nodes of each
 * decade before the starting decade (autoGrantedNodeIds). The nodes stay owned
 * in every mode; `gameConfig.legacyTechMode` sets how their running effects count:
 *  - "baseline": the effects keep their size but sit in a layer of their own,
 *    clamped by the caps alone and added to the researched layer
 *    (aggregateTechEffectLayers). Research keeps the full cap.
 *  - "off": the effects give nothing. Fresh worlds run like this, and absent
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
