/**
 * Static archetype to Layer-1 bucket mapping for the granular vote path.
 *
 * Systems author effects against the 12 US voter ARCHETYPES (archetypeApprovals,
 * legislation demographicEffects, partyGroupFavorability, GOTV modifiers). When
 * voting runs over granular demographic cells, those archetype-keyed values
 * must still land. This table projects each archetype onto 2-3 census buckets
 * (race/age/education/wealth) with weights summing to 1.0 per archetype, so
 * an archetype-keyed value V distributes as V*w and a cell picks up the sum of
 * matching bucket values. Full match gets V, partial match gets a fraction,
 * unrelated cells get 0.
 *
 * - Based on, but simpler than, VOTER_GROUP_COMPOSITION: that table mixes in
 *   `ideology`, which is not a cell dimension. Ideology-dominant archetypes are
 *   approximated by their strongest census correlates.
 * - Weights are judgment calls; they shape diffusion of archetype effects, not
 *   cell shares or leans (those come from IPF-raked marginals).
 * - US vocabulary only. Non-US archetypes use `countryArchetypeBuckets.ts`.
 *   Do not add foreign groups here.
 *
 * Keys use "dim:key" matching the cell `buckets` record.
 */

import { getCountryArchetypeBuckets } from "./countryArchetypeBuckets";
import { isBucketTarget } from "./turnoutTarget";

export interface ArchetypeBucketWeight {
  /** Layer-1 cell dimension ("race" | "age" | "education" | "wealth"). */
  dim: string;
  /** Bucket key within the dimension (e.g. "senior", "no_college"). */
  key: string;
  /** Fraction of the archetype's effect allocated to this bucket. */
  w: number;
}

/*
 * The hand-authored UK / JP / DE / other-country tables that used to live here
 * are gone. They expressed non-US archetypes in the US bucket vocabulary
 * (`education:no_college`, `wealth:low`), which the international Layer-1 models
 * do not have — those use `ethnicity / age / education / income / urbanization`
 * with their own keys. Only `age` collided, so roughly 70-80% of every non-US
 * archetype's weight projected onto no bucket at all.
 *
 * Each country's seed already carries the authoritative decomposition in its own
 * vocabulary (`CountryLayer1Model.composition`), so `archetypeValuesToBuckets`
 * reads that instead — see `countryArchetypeBuckets.ts`. One source, no second
 * copy to drift.
 */

/** 12 US archetypes → 2-3 Layer-1 census buckets each; weights sum to 1.0. */
export const ARCHETYPE_BUCKET_MAP: Record<string, ArchetypeBucketWeight[]> = {
  young_renters: [
    { dim: "age", key: "young", w: 0.5 },
    { dim: "wealth", key: "low", w: 0.3 },
    { dim: "education", key: "no_college", w: 0.2 },
  ],
  // Ideology-dominant; approximated by strongest census correlates.
  evangelicals: [
    { dim: "race", key: "white", w: 0.6 },
    { dim: "education", key: "no_college", w: 0.4 },
  ],
  rural_traditionalists: [
    { dim: "education", key: "no_college", w: 0.5 },
    { dim: "race", key: "white", w: 0.3 },
    { dim: "age", key: "mature", w: 0.2 },
  ],
  union_trades: [
    { dim: "education", key: "no_college", w: 0.4 },
    { dim: "wealth", key: "low", w: 0.35 },
    { dim: "race", key: "black", w: 0.25 },
  ],
  soccer_moms: [
    { dim: "age", key: "mid", w: 0.5 },
    { dim: "wealth", key: "middle", w: 0.4 },
    { dim: "race", key: "white", w: 0.1 },
  ],
  college_liberals: [
    { dim: "education", key: "college", w: 0.4 },
    { dim: "education", key: "graduate", w: 0.3 },
    { dim: "age", key: "young", w: 0.3 },
  ],
  small_business: [
    { dim: "wealth", key: "high", w: 0.5 },
    { dim: "age", key: "mature", w: 0.3 },
    { dim: "race", key: "white", w: 0.2 },
  ],
  public_sector: [
    { dim: "education", key: "college", w: 0.4 },
    { dim: "wealth", key: "middle", w: 0.4 },
    { dim: "education", key: "graduate", w: 0.2 },
  ],
  retirees: [
    { dim: "age", key: "senior", w: 0.7 },
    { dim: "age", key: "mature", w: 0.3 },
  ],
  // Ideology-dominant; census proxy skews middle-income college-educated white.
  libertarians: [
    { dim: "race", key: "white", w: 0.4 },
    { dim: "education", key: "college", w: 0.3 },
    { dim: "wealth", key: "middle", w: 0.3 },
  ],
  new_immigrants: [
    { dim: "race", key: "hispanic", w: 0.5 },
    { dim: "race", key: "asian", w: 0.3 },
    { dim: "race", key: "other", w: 0.2 },
  ],
  secular_professionals: [
    { dim: "education", key: "graduate", w: 0.5 },
    { dim: "wealth", key: "high", w: 0.3 },
    { dim: "age", key: "mid", w: 0.2 },
  ],
};

/**
 * Distribute archetype-keyed numeric values onto Layer-1 buckets.
 *
 * Returns a sparse `"dim:key" → value` record where each archetype's value is
 * split across its mapped buckets by weight and summed across archetypes.
 * Archetypes missing from the map (non-US groups) contribute nothing.
 */
/**
 * Archetype ids seen with a real value but no bucket mapping, with the total
 * magnitude that was dropped on the floor.
 *
 * `ARCHETYPE_BUCKET_MAP` covers the 12 US archetypes only. On a UK, JP or DE
 * world every archetype-keyed approval and favorability effect therefore
 * projects onto nothing and vanishes — a Governor's Address can be delivered,
 * charged and expired while moving no votes at all, with no error anywhere.
 * (The GOTV path degrades more gracefully: it preserves total magnitude via an
 * aggregate ratio, losing only per-group targeting.)
 *
 * This is the measurement half of retiring archetypes: the effects that need
 * re-authoring into Layer-1 bucket space are exactly the ones counted here, and
 * a silent drop cannot be prioritised or regression-tested.
 */
const unmappedArchetypeDrops = new Map<string, { count: number; magnitude: number }>();

/** Record of archetype values dropped for want of a bucket mapping. */
export function getUnmappedArchetypeDrops(): Array<{
  archetypeId: string;
  count: number;
  magnitude: number;
}> {
  return [...unmappedArchetypeDrops.entries()]
    .map(([archetypeId, v]) => ({ archetypeId, ...v }))
    .sort((a, b) => b.magnitude - a.magnitude);
}

/** Clear the drop record. Call per run/per turn so counts stay scoped. */
export function resetUnmappedArchetypeDrops(): void {
  unmappedArchetypeDrops.clear();
}

/**
 * Project archetype-keyed values onto Layer-1 buckets.
 *
 * `countryId` selects the bucket vocabulary. Outside the US the country's own
 * seeded `composition` table is authoritative — it decomposes each archetype in
 * that country's dimensions and keys — so passing the country is what makes the
 * projection land on real voters. Omitting it (or passing US) uses the US table,
 * which is the historical behaviour.
 */
function mapArchetypeValuesToBuckets(
  valuesByArchetype: Record<string, number>,
  countryId?: string,
  onUnmapped?: (archetypeId: string, value: number) => void
): Record<string, number> {
  const countryTable =
    countryId && countryId.toUpperCase() !== "US" ? getCountryArchetypeBuckets(countryId) : null;
  const bucketValues: Record<string, number> = {};
  for (const [archetypeId, value] of Object.entries(valuesByArchetype)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) continue;
    // A key that is ALREADY a bucket passes through at full weight rather than
    // being counted as an unmapped drop. This is what lets a caller author in
    // the bucket vocabulary without every consumer of the projection having to
    // learn a second code path: an approval, a favorability delta or a lean
    // delta keyed `"education:no_college"` reaches the cells exactly, while one
    // keyed `"union_trades"` still fans out through the table below. Same loose
    // union `DemographicEffect` and `turnoutTarget` already carry.
    if (isBucketTarget(archetypeId)) {
      bucketValues[archetypeId] = (bucketValues[archetypeId] ?? 0) + value;
      continue;
    }
    const weights =
      countryTable?.[archetypeId] ?? (countryTable ? undefined : ARCHETYPE_BUCKET_MAP[archetypeId]);
    if (!weights) {
      onUnmapped?.(archetypeId, value);
      continue;
    }
    for (const { dim, key, w } of weights) {
      const k = `${dim}:${key}`;
      bucketValues[k] = (bucketValues[k] ?? 0) + value * w;
    }
  }
  return bucketValues;
}

/** Pure Layer-1 projection for rules code that must not update diagnostics. */
export function projectArchetypeValuesToBuckets(
  valuesByArchetype: Record<string, number>,
  countryId?: string
): Record<string, number> {
  return mapArchetypeValuesToBuckets(valuesByArchetype, countryId);
}

/** Instrumented Layer-1 projection used by runtime diagnostics and migrations. */
export function archetypeValuesToBuckets(
  valuesByArchetype: Record<string, number>,
  countryId?: string
): Record<string, number> {
  return mapArchetypeValuesToBuckets(valuesByArchetype, countryId, (archetypeId, value) => {
    const prev = unmappedArchetypeDrops.get(archetypeId) ?? { count: 0, magnitude: 0 };
    unmappedArchetypeDrops.set(archetypeId, {
      count: prev.count + 1,
      magnitude: prev.magnitude + Math.abs(value),
    });
  });
}
