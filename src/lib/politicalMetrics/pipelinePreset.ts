/**
 * The ONE gate for the political-metrics / political-legislation pipeline.
 *
 * Currently always true: baselines and law levels resolve by in-game YEAR,
 * so the pipeline is not tied to the 1953 seed preset. Kept as a function
 * rather than inlined because the seed gates read it, and non-playable
 * conversion will need a scope check here instead of a new gate.
 */
import { MECHANICAL_RETAINED_IDS } from "@/lib/mechanicalLaws/legislation";
import {
  REDISTRICT_AUTHORITY_LAW,
  REDISTRICT_COMPACTNESS_LAW,
  REDISTRICT_FAIRNESS_LAW,
} from "@/lib/redistricting/caps";
import { POLITICAL_METRIC_COUNTRY_IDS } from "./types";

export function isPoliticalPipelinePreset(_preset: string | undefined): boolean {
  return true;
}

/**
 * The `countryScope` values whose OLD legislation catalogs are superseded by
 * the new-generation political law book, and so must never seed.
 *
 * Derived from POLITICAL_METRIC_COUNTRY_IDS rather than written out, because
 * this list was previously duplicated across three seeders — the same
 * copy-and-drift shape that let the preset gates diverge in the first place.
 * `countryScope` is the lowercase form of the country id.
 */
export const POLITICAL_LEGISLATION_EXCLUDED_SCOPES: ReadonlySet<string> = new Set(
  POLITICAL_METRIC_COUNTRY_IDS.map((id) => id.toLowerCase())
);

/**
 * Old-catalog `_id`s that survive the exclusion sweep above.
 *
 * The three US state redistricting levers are mechanical who-may-draw
 * switches, not metric-moving programs: `src/lib/redistricting/caps.ts`
 * reads them BY ID out of `statePolicies` and turns the enacted option
 * INDEX into the caps the map editor enforces. A `PoliticalLaw` is a
 * five-level program with a political-metric target, which does not
 * substitute for them. Excluding them by `countryScope` removed the only
 * lever, leaving every state on the index-1 default.
 *
 * Sourced from caps.ts so the retained set and the consumer cannot drift.
 */
export const POLITICAL_LEGISLATION_RETAINED_OLD_IDS: ReadonlySet<string> = new Set([
  REDISTRICT_AUTHORITY_LAW,
  REDISTRICT_COMPACTNESS_LAW,
  REDISTRICT_FAIRNESS_LAW,
  // Subsidiary Limits and Foreign Investment laws: mechanical, read by game
  // code, and with no new-generation counterpart in these four countries.
  ...MECHANICAL_RETAINED_IDS,
]);

/**
 * Whether an old-generation legislation type must not seed.
 *
 * The ONE place the exclusion is decided. The three seeders that apply it
 * (`runCoreSeed`, `seedLegislationTypes`, `seedStatePolicies`) previously each
 * tested `EXCLUDED_SCOPES.has(countryScope ?? "us")` inline — the same
 * copy-and-drift shape this module already exists to prevent — so a carve-out
 * added to one would silently miss the others.
 */
export function isOldLegislationTypeExcluded(lt: { _id: string; countryScope?: string }): boolean {
  if (POLITICAL_LEGISLATION_RETAINED_OLD_IDS.has(lt._id.split(/__(?:income|capital)_/)[0]))
    return false;
  return POLITICAL_LEGISLATION_EXCLUDED_SCOPES.has(lt.countryScope ?? "us");
}
