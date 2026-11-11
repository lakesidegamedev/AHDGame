import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { State } from "@/lib/db/types";
import { NATIONAL_SCOPE_IDS } from "@/lib/constants/nationalScope";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * Seed-time regional-GDP to national-GDP reconciliation.
 *
 * The fiscal-year rollover replaces federalBudget.gdp with the sum of state.gdp
 * (millions x 1e6). If an era's regional seeds are not denominated consistently
 * with the authored national GDP config, the first rollover snaps national GDP by
 * the full inconsistency. This normalizes each country's regional gdp values by a
 * single per-country scalar so the sum matches the authored national GDP, preserving
 * every region's relative share.
 *
 * Era-agnostic mechanism, seed-path only, with two guards:
 * 1. Era gate: only pre-1999 eras (1953/1979/1991) are reconciled. Modern presets
 *    have their own state-sum vs authored-GDP disagreements whose resolution is a
 *    pending design decision, so a modern reseed must not re-scale regions. The
 *    reconciler is a no-op for 1999+.
 * 2. Tolerance guard: within a gated era, only countries deviating from the
 *    authored national GDP by more than STATE_GDP_RECONCILE_TOLERANCE (2%) are
 *    rescaled.
 *
 * Runtime turn processing is never touched; after reconciliation both sources agree
 * from turn 1.
 *
 * Ordering: must run after a country's regions are seeded and before anything that
 * derives absolute values from state.gdp (state-budget seeders, country-owned corp
 * sizing, seedUnownedSectors). One call site: the end of seedAllCountryData for
 * every country on both bootstrap and in-world reset paths. state.capitalStock is
 * not seeded (the metric engine cold-starts it from gdp), so scaling gdp alone keeps
 * downstream consumers coherent.
 */
export const STATE_GDP_RECONCILE_TOLERANCE = 0.02;

/**
 * Era gate: pre-1999 eras plus the explicitly modeled 2027 US opening.
 * Derived from the preset via {@link eraForPreset} — no ad-hoc preset
 * string-matching — so preset aliases (e.g. `empty`, `2019-no-parties`
 * → era 2019) follow their era family. See the module doc for why modern
 * other modern eras are excluded (pending a canonical GDP decision).
 */
export function shouldReconcileStateGdpForPreset(preset: string): boolean {
  return Number(eraForPreset(preset)) < 1999 || eraForPreset(preset) === "2027";
}

export interface CountryGdpScalar {
  countryId: CountryId;
  /** Authored national GDP (absolute units) from the preset's national-budget seed config. */
  nationalGdp: number;
  /** Σ regional state.gdp before scaling, converted to absolute units (millions × 1e6). */
  regionalSum: number;
  /** |regionalSum − nationalGdp| / nationalGdp before scaling. */
  deviation: number;
  /** Multiplier applied to every region's gdp (1 when within tolerance). */
  scalar: number;
  /** True when the scalar was (or should be) applied. */
  applied: boolean;
}

/**
 * Pure core: compute the per-country normalization scalar from region rows and
 * the authored national GDPs. Mirrors the fiscal-year SSOT sum exactly —
 * every row of the country except national-scope docs, `gdp || 0`, in millions.
 */
export function computeStateGdpScalars(
  regionRows: Array<Pick<State, "_id" | "countryId" | "gdp">>,
  nationalGdpByCountry: ReadonlyMap<string, number>,
  tolerance: number = STATE_GDP_RECONCILE_TOLERANCE
): CountryGdpScalar[] {
  const sumsByCountry = new Map<string, number>();
  for (const row of regionRows) {
    if (NATIONAL_SCOPE_IDS.has(String(row._id))) continue;
    sumsByCountry.set(row.countryId, (sumsByCountry.get(row.countryId) ?? 0) + (row.gdp || 0));
  }

  const results: CountryGdpScalar[] = [];
  for (const [countryId, nationalGdp] of nationalGdpByCountry) {
    const sumMillions = sumsByCountry.get(countryId);
    // No regional rows / zero sum: nothing to scale — fiscalYear falls back to
    // compounding the authored national GDP, which is already consistent.
    if (!sumMillions || sumMillions <= 0 || !Number.isFinite(sumMillions)) continue;
    if (!Number.isFinite(nationalGdp) || nationalGdp <= 0) continue;

    const regionalSum = sumMillions * 1_000_000;
    const deviation = Math.abs(regionalSum - nationalGdp) / nationalGdp;
    const applied = deviation > tolerance;
    results.push({
      countryId: countryId as CountryId,
      nationalGdp,
      regionalSum,
      deviation,
      scalar: applied ? nationalGdp / regionalSum : 1,
      applied,
    });
  }
  return results;
}

/**
 * Normalize the `states` collection so each country's Σ regional gdp matches the
 * authored national GDP of the given preset's national-budget seed configs.
 * Idempotent: once normalized, the deviation is ~0 and re-runs are no-ops.
 * No-op for 1999+ eras (see {@link shouldReconcileStateGdpForPreset}).
 *
 * @param countryIds restrict to these countries (used by the eastern-bloc lane,
 *   whose regions seed after the main reconciliation pass); omit for all
 *   countries in the preset's configs.
 */
export async function reconcileStateGdpWithNationalSeeds(
  db: Db,
  log: (msg: string) => void,
  preset: string,
  countryIds?: CountryId[]
): Promise<CountryGdpScalar[]> {
  if (!shouldReconcileStateGdpForPreset(preset)) {
    log(
      `[GdpReconcile] skipped — era ${eraForPreset(preset)} (${preset}) is not gated for ` +
        `seed-time regional-GDP reconciliation (pre-1999 and 2027 US only)`
    );
    return [];
  }
  const { getNationalBudgetSeedConfigsForPreset } = await import("@/lib/seeds/reference/budgets");
  const configs = getNationalBudgetSeedConfigsForPreset(preset).filter(
    (c) =>
      (!countryIds || countryIds.includes(c.countryId as CountryId)) &&
      (eraForPreset(preset) !== "2027" || c.countryId === "US")
  );
  if (configs.length === 0) return [];

  const nationalGdpByCountry = new Map<string, number>(
    configs.map((c) => [c.countryId as string, c.gdp])
  );
  const regionRows = await statesCollection(db)
    .find(
      { countryId: { $in: configs.map((c) => c.countryId as CountryId) } },
      { projection: { countryId: 1, gdp: 1 } }
    )
    .toArray();

  const scalars = computeStateGdpScalars(regionRows, nationalGdpByCountry);
  const toApply = scalars.filter((s) => s.applied);
  if (toApply.length > 0) {
    await statesCollection(db).bulkWrite(
      toApply.map((entry) => ({
        updateMany: {
          filter: {
            countryId: entry.countryId,
            _id: { $nin: [...NATIONAL_SCOPE_IDS] },
            // $gt is type-bracketed in MongoDB: matches only numeric gdp > 0, so
            // rows with missing/zero gdp are left untouched (never $mul'd to 0/NaN).
            gdp: { $gt: 0 },
          },
          update: { $mul: { gdp: entry.scalar } },
        },
      }))
    );
  }
  for (const entry of toApply) {
    log(
      `[GdpReconcile] ${entry.countryId}: Σ regions ${Math.round(entry.regionalSum / 1e6).toLocaleString("en-US")}M ` +
        `vs authored ${Math.round(entry.nationalGdp / 1e6).toLocaleString("en-US")}M ` +
        `(dev ${(entry.deviation * 100).toFixed(1)}%) → scaled regional gdp ×${entry.scalar.toPrecision(6)}`
    );
  }
  if (toApply.length === 0) {
    log(`[GdpReconcile] all countries within ${STATE_GDP_RECONCILE_TOLERANCE * 100}% (${preset})`);
  }
  return scalars;
}
