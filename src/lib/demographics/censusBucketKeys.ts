/**
 * The `dim:bucket` keys of one census dimension for a region, for effects that
 * must act on the whole electorate (the newsroom pull). Each unit's weights
 * over a single dimension sum to one, so a uniform overlay step over these
 * keys moves the region's mean lean by exactly that step.
 */
import { deriveGranularElectorateUnits } from "./granularElectorate";
import type { CachedStateLeanContext } from "./cachedStateLean";

/** Bucket keys of the alphabetically first dimension, sorted. Empty when the region has no census. */
export function censusBucketKeys(context: CachedStateLeanContext): string[] {
  const derived = deriveGranularElectorateUnits(
    context.countryId,
    context.stateId,
    context.preset ?? undefined,
    context.turnoutDoc,
    context.demographicDefaults?.layer1PositionOverrides,
    context.demographicDefaults?.layer1TurnoutOverrides,
    { year: context.year ?? null, startingYear: context.startingYear ?? null }
  );
  if (!derived) return [];
  const keys = new Set<string>();
  for (const unit of derived.units) {
    for (const key of Object.keys(unit.bucketWeights)) keys.add(key);
  }
  const sorted = [...keys].sort();
  if (sorted.length === 0) return [];
  const dim = sorted[0].slice(0, sorted[0].indexOf(":"));
  return sorted.filter((key) => key.startsWith(`${dim}:`));
}
