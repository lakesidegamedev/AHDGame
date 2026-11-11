import type { Db } from "mongodb";
import type { State } from "@/lib/db/types";
import type { StateMetrics } from "@/lib/db/types/stateMetrics";
import type { CountryId } from "@/lib/constants/countries";
import { getNationalDocId } from "@/lib/constants/nationalScope";
import { getEraTrendGdpGrowth } from "@/lib/constants/monetaryEra";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * GDP-weighted mean of regional growth rates. Null when nothing is weightable.
 *
 * GDP is the correct weight, not population: `metricEngine/phase.ts` compounds
 * each region's `state.gdp` by that region's OWN rate, so the growth of the
 * national total is the GDP-weighted mean by construction. Weighting by
 * population answers a different question and gives a different number (RU read
 * 6.56% population-weighted against 5.14% canonical at turn 364).
 */
export function gdpWeightedGrowth(rows: Array<{ growth?: number; gdp: number }>): number | null {
  let weighted = 0;
  let totalGdp = 0;

  for (const row of rows) {
    if (typeof row.growth !== "number" || !Number.isFinite(row.growth)) continue;
    if (!Number.isFinite(row.gdp) || row.gdp <= 0) continue;
    weighted += row.growth * row.gdp;
    totalGdp += row.gdp;
  }

  return totalGdp > 0 ? weighted / totalGdp : null;
}

/**
 * Default when a country has neither a national metrics doc nor a single
 * weightable region. Matches the long-standing `fiscalYear.ts` constant.
 */
const NEUTRAL_PIPELINE_GDP_GROWTH = 2.5;

/**
 * Resolve the growth rate the annual fiscal pass records on the budget, from
 * data the caller has already loaded. Pure, so the selection rule is testable
 * without standing up a whole fiscal-year pass.
 *
 * Steps 1 and 2 are identical to {@link loadNationalGdpGrowth}: national doc,
 * then the GDP-weighted regional mean. The middle step is the one that matters -
 * without it the 17 countries with no national doc recorded a flat +2.5% while
 * several were contracting 6-9%.
 *
 * The TERMINAL fallback deliberately differs, and the difference must not be
 * "unified" away:
 *
 *   this function          -> 2.5, because the annual pass must record a number,
 *                             and 2.5 is exactly what it recorded before, so an
 *                             unseeded world behaves identically to before.
 *   loadNationalGdpGrowth  -> the authored era trend, then null, because a
 *                             display surface may legitimately show nothing.
 *
 * Both terminal branches are unreachable on a seeded world (every country has
 * regional GDP and every region carries a gdpGrowth metric), so the divergence
 * costs nothing today; it exists so neither caller is forced into the other's
 * failure mode.
 */
export function resolvePipelineGdpGrowth(input: {
  nationalDocGrowth?: number;
  regions: Array<{ growth?: number; gdp: number }>;
}): number {
  const national = input.nationalDocGrowth;
  // `typeof`, not `??` or truthiness: a negative rate is real and so is 0.
  if (typeof national === "number" && Number.isFinite(national)) return national;
  return gdpWeightedGrowth(input.regions) ?? NEUTRAL_PIPELINE_GDP_GROWTH;
}

/**
 * The country's national GDP growth rate, in percent.
 *
 * Resolution order, all producing the same quantity:
 *   1. National `macroMetrics` document (a cache of step 2).
 *   2. GDP-weighted mean of the country's own regions.
 *   3. Authored era trend, only when no region carries a growth metric.
 *
 * Step 2 is load-bearing: many economies with no national document are
 * contracting while their era trends read positive. The era trend is an
 * authored assumption, never a substitute for measurable regions.
 */
export async function loadNationalGdpGrowth(
  db: Db,
  countryId: CountryId,
  currentYear?: number
): Promise<number | null> {
  const nationalDocId = getNationalDocId(countryId);

  if (nationalDocId) {
    const doc = await db
      .collection<StateMetrics>("macroMetrics")
      .findOne({ _id: nationalDocId }, { projection: { "economic.gdpGrowth.value": 1 } });
    const value = doc?.economic?.gdpGrowth?.value;
    // `typeof`, not `??` or truthiness: a negative rate is real (CN reads
    // -4.867) and so is an exact 0.
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  const states = await statesCollection(db)
    .find({ countryId })
    .project<{ _id: string; gdp?: number }>({ gdp: 1 })
    .toArray();

  if (states.length > 0) {
    const metrics = await db
      .collection<StateMetrics>("macroMetrics")
      .find({ _id: { $in: states.map((s) => s._id) } })
      .project<{ _id: string; economic?: { gdpGrowth?: { value?: number } } }>({
        "economic.gdpGrowth.value": 1,
      })
      .toArray();

    const gdpByStateId = new Map(states.map((s) => [s._id, s.gdp ?? 0]));
    const derived = gdpWeightedGrowth(
      metrics.map((m) => ({
        growth: m.economic?.gdpGrowth?.value,
        gdp: gdpByStateId.get(m._id) ?? 0,
      }))
    );
    if (derived !== null) return derived;
  }

  return getEraTrendGdpGrowth(countryId, currentYear) ?? null;
}
