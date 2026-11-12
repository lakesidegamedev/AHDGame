/**
 * 1953 era adjustments for a `StateMetrics` document.
 *
 * Without this, seeders with no bespoke 1953 metrics bundle seed modern values
 * into a 1953 world, so baselines decay while metrics stay modern forever.
 *
 * Mirrors the 1991 metrics adjuster's shape and the 1953 baseline adjuster's
 * economic ratios so metrics and decay targets agree.
 */
import { clamp } from "@/lib/numeric/rules";
import type { StateMetrics, StateMetricValue } from "@/lib/db/types";
import { getIncomeAnchor } from "@/lib/era/metricCatalog";

/**
 * Nominal income scale of 1953 relative to 2019, taken from the same anchor
 * table the baseline adjuster uses so the two cannot drift apart.
 */
const INCOME_ANCHOR_RATIO_1953 = getIncomeAnchor("US", 1953)! / getIncomeAnchor("US", 2019)!;

/** Preserve `trend` and any sibling fields; only move `value`. */
function shift(value: StateMetricValue | undefined, fn: (v: number) => number): StateMetricValue {
  if (!value) return { value: fn(50) };
  return { ...value, value: fn(value.value) };
}

/** Force a metric to an absolute era value (for things that did not exist). */
function pin(value: StateMetricValue | undefined, v: number): StateMetricValue {
  if (!value) return { value: v };
  return { ...value, value: v };
}

/**
 * Apply 1953 era adjustments to a modern (2019/2020-calibrated) metrics doc.
 *
 * `structuredClone` rather than a JSON round-trip so `Date` fields survive as
 * real Dates — a stringified timestamp crashes readers that call
 * `.toISOString()`.
 */
export function applyEra1953Adjustments(metrics: StateMetrics): StateMetrics {
  const adjusted: StateMetrics = structuredClone(metrics);

  // ── Economic ──────────────────────────────────────────────────────────────
  if (adjusted.economic) {
    // Nominal incomes deflate to the era anchor. This is the single most
    // important line: it is what stops a 1953 world pricing everything off a
    // 2019 wage.
    adjusted.economic.medianIncome = shift(adjusted.economic.medianIncome, (v) =>
      Math.round(v * INCOME_ANCHOR_RATIO_1953)
    );
    // Post-war full employment — the 1950s ran materially tighter than 2019.
    adjusted.economic.unemploymentRate = shift(adjusted.economic.unemploymentRate, (v) =>
      clamp(v - 1.5, 1.0, 6.0)
    );
    // Reconstruction-era growth, matching the baseline adjuster's 3-8 band.
    adjusted.economic.gdpGrowth = shift(adjusted.economic.gdpGrowth, (v) => clamp(v + 0.5, 3, 8));
    // Far higher absolute poverty before the post-war welfare build-out.
    adjusted.economic.povertyRate = shift(adjusted.economic.povertyRate, (v) =>
      clamp(v + 5, 15, 35)
    );
    // costOfLiving is a 100-CENTERED RELATIVE index (100 = national average),
    // not a price level. Scaling it nominally is wrong — the modern regional
    // tilts remain era-valid. Deliberately untouched; see the same note in
    // stateBaselines1953.
  }

  // ── Healthcare ────────────────────────────────────────────────────────────
  if (adjusted.healthcare) {
    // US life expectancy was ~68 in 1953 vs ~79 in 2019.
    // Band must admit the real 1953 spread, not just the Western one. An earlier
    // [62, 71] band forced Nigeria's authored 51 UP to 62 and China's 43 up with
    // it, reproducing exactly the flattening this adjuster exists to prevent —
    // the global gradient in 1953 ran from ~43 (China) to ~71 (Scandinavia).
    adjusted.healthcare.lifeExpectancy = shift(adjusted.healthcare.lifeExpectancy, (v) =>
      clamp(v - 11.0, 40.0, 72.0)
    );
    if (adjusted.healthcare.uninsuredRate !== undefined) {
      // Pre-Medicare, pre-NHS-maturity: most people carried no cover at all.
      adjusted.healthcare.uninsuredRate = shift(adjusted.healthcare.uninsuredRate, (v) =>
        clamp(v + 30.0, 35.0, 70.0)
      );
    }
  }

  // ── Infrastructure / technology: things that did not exist yet ────────────
  // These are the metrics that made the gap obvious — a 1953 London reporting
  // 97% broadband. Pinned to zero rather than scaled, because no multiple of a
  // 2019 value is a sane 1953 value for a technology that had not been invented.
  if (adjusted.infrastructure) {
    const infra = adjusted.infrastructure as Record<string, StateMetricValue | undefined>;
    for (const key of ["broadbandAccess", "internetAccess", "digitalInfrastructure"]) {
      if (infra[key] !== undefined) infra[key] = pin(infra[key], 0);
    }
    if (infra.renewableEnergy !== undefined) infra.renewableEnergy = pin(infra.renewableEnergy, 1);
  }

  // ── Environment ───────────────────────────────────────────────────────────
  if (adjusted.environment) {
    const env = adjusted.environment as Record<string, StateMetricValue | undefined>;
    // Recycling as a public programme is a 1970s invention.
    if (env.recyclingRate !== undefined) env.recyclingRate = pin(env.recyclingRate, 2);
    // Heavy coal industry, no emissions control.
    if (env.airQuality !== undefined) {
      env.airQuality = shift(env.airQuality, (v) => clamp(v - 25, 10, 60));
    }
  }

  // ── Media / information ───────────────────────────────────────────────────
  if (adjusted.mediaInformation) {
    const media = adjusted.mediaInformation as Record<string, StateMetricValue | undefined>;
    // No social platforms existed; a modern sentiment score is meaningless here.
    if (media.socialMediaSentiment !== undefined) {
      media.socialMediaSentiment = pin(media.socialMediaSentiment, 0);
    }
  }

  // ── Population ────────────────────────────────────────────────────────────
  if (adjusted.population) {
    // Baby boom: younger than 2019. Band [15, 36] must match stateBaselines1953.
    // Authored presets are applied after this adjuster and restored on overlay.
    // Pass-through guards against double-shifting already-young seeds.
    adjusted.population.medianAge = shift(adjusted.population.medianAge, (v) =>
      v >= 15 && v <= 24 ? v : clamp(v - 8, 15, 36)
    );
    const pop = adjusted.population as Record<string, StateMetricValue | undefined>;
    if (pop.birthRate !== undefined) {
      // birthRate is a 0–100 fertility INDEX (metricDefinitions unit: "index";
      // ukPopulationAnchors / seedCohortVectors), NOT a crude rate per 1000.
      // The old [14, 30] band was a crude-rate mistake: UK London's modern
      // index is ~46.75 (uniformStateMetrics: 65 − medianAge×0.5) and JP
      // authors 26–38 — both slammed into the 30 ceiling. Real 1953 index
      // spread: Western baby-boom ~34–55 (JP after +8; UK formula) up to
      // ~68–92 (RU CAS authored 68; NG 1991 anchors 82–92 as the high-fertility end).
      //
      // Pass-through: +8 assumes a modern (low-fertility) input. Skip it when
      // already high (≥50 — mid/high baby-boom index), so an authored 68 is
      // not pushed to 76 before overlay. Band [30, 95] — baselines have no
      // birthRate field; if one is added, mirror this band there.
      pop.birthRate = shift(pop.birthRate, (v) => (v >= 50 && v <= 95 ? v : clamp(v + 8, 30, 95)));
    }
    // Pre-suburbanisation: a smaller share of the population lived in cities.
    if (pop.urbanizationRate !== undefined) {
      pop.urbanizationRate = shift(pop.urbanizationRate, (v) => clamp(v - 12, 25, 80));
    }
  }

  return adjusted;
}
