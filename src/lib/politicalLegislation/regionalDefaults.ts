/**
 * Regional default law for new-generation `both` laws.
 *
 * A `both` law may be enacted nationally OR supplemented by a region. The
 * regional side seeded nothing, so every `both` law was proposable in a
 * region that had no current law for it, blanking the fiscal comparison
 * and political-metric chips (`LawProvisionComparison` bails on
 * `currentIndex === undefined`).
 *
 * The level is 0 by engine rule: `getEnactedLevel` treats a region with no
 * record as 0, and day-one equilibrium composes from the national law book
 * plus sidecar baselines only. Seeding at `baselineLevelFor` would
 * double-count every `both` law into every region's target.
 */

import { getCatalog, getLaw } from "./catalog";
import type { PoliticalLaw } from "./types";

/** A region starts with no program of its own on top of the national law. */
export const REGIONAL_DEFAULT_LEVEL = 0;

/**
 * The non-tax `both` laws of a country — the ones a region may legislate on
 * top of the national law, and so the ones needing a regional default row.
 *
 * Regional sidecars (`allowedScope: "regional"`) are deliberately absent: they
 * seed their own authored `baselineLevelFor` baseline through the existing
 * path, and must never be flattened to 0 by this one. Tax laws are absent
 * because their state lives in `federalBudget.taxRates`, not `statePolicies`.
 *
 * Omitting `year` returns the unfiltered set; passing one applies the same era
 * window `getCatalog` applies everywhere else.
 */
export function regionalDefaultLaws(countryId: string, year?: number): PoliticalLaw[] {
  return getCatalog(countryId, year).filter(
    (law) => law.kind !== "tax" && law.allowedScope === "both"
  );
}

/**
 * The level a law sits at in a region with no statePolicies row, or
 * `undefined` when the id is not a law this rule covers.
 *
 * Read-path fallback so a region added after seeding, or a world seeded before
 * the backfill, still renders a current law instead of a blank provision.
 * Apply only at region scope; at national scope a missing row means something
 * else is wrong and should not be papered over.
 *
 * Deliberately not narrowed by country: law ids are globally unique across
 * the four catalogs, so the id alone identifies the country. A country filter
 * could only wrongly reject: `resolveBillCountryId` falls back to "US" for a
 * legacy bill it cannot place, silently dropping a RU/UK/DD region.
 */
export function regionalDefaultLevel(lawId: string): number | undefined {
  const law = getLaw(lawId);
  if (!law || law.kind === "tax") return undefined;
  return law.allowedScope === "both" ? REGIONAL_DEFAULT_LEVEL : undefined;
}
