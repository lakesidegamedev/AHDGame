import type { CrisisEffect } from "@/lib/db/types/crisis";
import { toNativeEffectValue } from "@/lib/crises/effectScale";

// Designer vocabulary → canonical stateMetrics schema (see src/lib/db/types/stateMetrics.ts).
// Crisis effects are applied with $inc on `${category}.${field}.value`, so a name that
// doesn't exist in the schema would silently create a dead, unread field. This table binds
// the human-readable concepts used in the templates below to real metric paths. Consumer and
// investor confidence are real per-state metrics (economic.consumerConfidence /
// economic.investorConfidence, engine-computed in registry/economic.ts), so crisis shocks
// land on the same fields the margin/valuation systems read. Inflation is national, not a
// stateMetric, and is handled separately in fx() (see below).
const METRIC_ALIASES: Record<string, { category: string; field: string }> = {
  "economy.gdp": { category: "economic", field: "gdpGrowth" },
  "economy.unemployment": { category: "economic", field: "unemploymentRate" },
  "economy.consumerConfidence": { category: "economic", field: "consumerConfidence" },
  "economy.investorConfidence": { category: "economic", field: "investorConfidence" },
  "economy.exports": { category: "economic", field: "tradeBalance" },
  "economy.realWages": { category: "economic", field: "medianIncome" },
  "economy.renewableShare": { category: "environment", field: "renewableEnergy" },
  "economy.foodPrices": { category: "economic", field: "costOfLiving" },
  "economy.housing": { category: "economic", field: "propertyValueIndex" },
  "infrastructure.damage": { category: "infrastructure", field: "infrastructureInvestmentGap" },
  "infrastructure.power": { category: "infrastructure", field: "powerGridReliability" },
  "publicsafety.confidence": { category: "publicSafety", field: "publicSafetyConfidence" },
};

export function fx(
  effectType: "flat" | "tick",
  targetType: "metric" | "approval" | "profitMargin" | "stat",
  metricCategory: string,
  metricField: string,
  // Authored as a FRACTIONAL swing (e.g. -0.02 = "a 2% swing"). The turn engine
  // applies effects as a raw $inc in native metric units (gdpGrowth ~1.5,
  // approvalRating 0-100, inflationRate ~2.5), so we convert here via
  // toNativeEffectValue (×100 flat, ×30 tick). See effectScale.ts.
  swing: number,
  label: string
): CrisisEffect {
  const value = toNativeEffectValue(effectType, swing);
  // Inflation is national (federalBudget.economicFactors.inflationRate), not a per-state metric,
  // so route "economy.inflation" to the dedicated inflation target. The per-turn inflation
  // recalc blends the shock through ~35% inertia, so it decays naturally over following turns.
  if (targetType === "metric" && metricCategory === "economy" && metricField === "inflation") {
    return {
      effectType,
      targetType: "inflation",
      metricCategory: null,
      metricField: null,
      value,
      sectorType: null,
      strategyId: null,
      label,
    };
  }
  // Stat effects bypass metric aliases, they target character stats directly.
  if (targetType === "stat") {
    return {
      effectType,
      targetType: "stat",
      statKey: metricCategory, // e.g. "charisma", "statecraft"
      metricCategory: null,
      metricField: null,
      value,
      sectorType: null,
      strategyId: null,
      label,
    };
  }
  // Only metric effects are written by path; approval/profitMargin ignore category/field.
  const resolved =
    targetType === "metric" ? METRIC_ALIASES[`${metricCategory}.${metricField}`] : undefined;
  return {
    effectType,
    targetType,
    metricCategory: resolved?.category ?? metricCategory,
    metricField: resolved?.field ?? metricField,
    value,
    sectorType: null,
    strategyId: null,
    label,
  };
}

/**
 * One-time, real GDP output loss for physical-destruction disasters. `fraction`
 * is the share of the affected region's GDP destroyed at onset (0.005-0.03 →
 * 0.5%-3%), applied once as a multiplicative cut to `state.gdp`. Surfaced in the
 * UI as "X% of GDP lost · $Ybn". Prefer this over a `economy.gdp` growth-rate
 * shock for earthquakes/hurricanes/etc., the growth-rate path is for persistent
 * economic crises, not one-off destruction.
 */
export function gdpLoss(fraction: number, label: string): CrisisEffect {
  return {
    effectType: "flat",
    targetType: "gdpLoss",
    metricCategory: null,
    metricField: null,
    value: fraction,
    sectorType: null,
    strategyId: null,
    label,
  };
}

/**
 * A single, steady profit-margin shock for economic crises. Authored in
 * percentage points (NOT scaled, bypasses fx()), it lands at full `value` on the
 * onset turn and ramps linearly to 0 at expiry, exactly like the infrastructure-
 * disaster margin penalty. Applied as a read-time blend on every corp in the
 * crisis's scope (see disasterMarginPenalty.ts / buildLookups resolveCrisisStateIds),
 * so unlike the per-turn `tick` metric effects it is one sustained, decaying hit
 * rather than a repeated nibble. `value` should be negative (a margin loss).
 *
 * `physicality` (P3.5) decides how the shock bites under the plants tier:
 * "physical" converts the percentage points into a production haircut (less
 * tonnage), "financial" keeps it a margin hit at unchanged tonnage. Default is
 * "financial", the conservative choice, and the only one that is safe for
 * already-spawned crises, which carry no flag. Classify a template "physical"
 * only when the event plainly STOPS output (power cut, plant halt, port shut,
 * inputs unavailable); anything that is a price, credit, demand or sentiment
 * shock stays financial.
 */
export function marginShock(
  value: number,
  label: string,
  physicality: "physical" | "financial" = "financial",
  /** Restrict the shock to one corporation sector type (e.g. "manufacturing").
   *  The per-turn margin/production application (crisisTurn.ts) already filters
   *  on `sectorType`, so this concentrates the hit on the struck industry
   *  instead of every corp in scope. Absent = economy-wide (legacy). */
  sectorType: string | null = null
): CrisisEffect {
  return {
    effectType: "decay",
    targetType: "profitMargin",
    metricCategory: null,
    metricField: null,
    value,
    sectorType,
    strategyId: null,
    label,
    physicality,
  };
}
