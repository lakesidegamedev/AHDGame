import type { HazardTag } from "@/lib/db/types/crisis";
import type { DisasterEffectEntry } from "@/lib/crises/disasterMarginPenalty";

/**
 * What climate pressure does beyond weather disasters (game design). Each
 * effect scales with world pressure above the 0.20 the 2027 world opens on
 * (losses up to that level are already in the opening data) and with a
 * region's exposure, read from its hazard tags. Plain data in, plain data out.
 */

/** Pressure already reflected in opening yields, prices and premiums. */
export const CLIMATE_EFFECT_PRESSURE_FLOOR = 0.2;

export interface ClimateExposure {
  /** Cooling demand in long hot summers. */
  heat: number;
  /** Farm exposure to heat stress and drought. */
  dry: number;
  /** Insured property exposure to storm, flood and fire. */
  property: number;
}

/** Contribution of each tag; a region sums its tags, capped at 1 per channel. */
export const CLIMATE_EXPOSURE_BY_TAG: Readonly<
  Partial<Record<HazardTag, Partial<ClimateExposure>>>
> = {
  hot: { heat: 1, dry: 0.25 },
  arid: { heat: 0.5, dry: 1 },
  wildfire: { dry: 0.5, property: 0.3 },
  coastal: { property: 0.5 },
  flood: { property: 0.5 },
  tornado: { property: 0.3 },
  wintry: { property: 0.1 },
};

const clamp = (value: number, lower: number, upper: number) =>
  Math.max(lower, Math.min(upper, value));

export function climateExposureFromTags(tags: readonly HazardTag[]): ClimateExposure {
  const exposure: ClimateExposure = { heat: 0, dry: 0, property: 0 };
  for (const tag of new Set(tags)) {
    const row = CLIMATE_EXPOSURE_BY_TAG[tag];
    if (!row) continue;
    exposure.heat += row.heat ?? 0;
    exposure.dry += row.dry ?? 0;
    exposure.property += row.property ?? 0;
  }
  return {
    heat: clamp(exposure.heat, 0, 1),
    dry: clamp(exposure.dry, 0, 1),
    property: clamp(exposure.property, 0, 1),
  };
}

/** Pressure above the floor as a share of the span to `anchor`, capped at `cap`. */
function pressureRamp(pressure: number, anchor: number, cap: number): number {
  const p = Number.isFinite(pressure) ? clamp(pressure, 0, 1) : 0;
  return clamp(
    (p - CLIMATE_EFFECT_PRESSURE_FLOOR) / (anchor - CLIMATE_EFFECT_PRESSURE_FLOOR),
    0,
    cap
  );
}

/** Farm yield lost in fully dry-exposed regions at pressure 0.6 and above. */
export const MAX_AGRICULTURE_YIELD_LOSS = 0.15;
const AGRICULTURE_LOSS_FULL_AT = 0.6;

/** Share of the climate yield loss a farming method avoids. */
export const AGRICULTURE_METHOD_CLIMATE_PROTECTION: Readonly<Record<string, number>> = {
  // Sensor-led irrigation and planting windows halve the loss.
  precision_ag: 0.5,
  // Bioreactors indoors do not see the weather.
  cellular_agriculture: 1,
};

/** Fraction of farm output lost (0 to 0.15) for a method in a region. */
export function agricultureYieldLoss(
  pressure: number,
  exposure: Pick<ClimateExposure, "dry">,
  strategyId: string | null = null
): number {
  const protection = strategyId ? (AGRICULTURE_METHOD_CLIMATE_PROTECTION[strategyId] ?? 0) : 0;
  return (
    MAX_AGRICULTURE_YIELD_LOSS *
    clamp(exposure.dry, 0, 1) *
    pressureRamp(pressure, AGRICULTURE_LOSS_FULL_AT, 1) *
    (1 - protection)
  );
}

/** Extra household energy demand in fully hot regions at pressure 0.5. */
export const ENERGY_DEMAND_UPLIFT_AT_ANCHOR = 0.05;
const ENERGY_DEMAND_ANCHOR = 0.5;

/** Multiplier on household energy demand: 1.05 at pressure 0.5 when fully hot, at most 1.1. */
export function energyDemandMultiplier(
  pressure: number,
  exposure: Pick<ClimateExposure, "heat">
): number {
  return (
    1 +
    ENERGY_DEMAND_UPLIFT_AT_ANCHOR *
      clamp(exposure.heat, 0, 1) *
      pressureRamp(pressure, ENERGY_DEMAND_ANCHOR, 2)
  );
}

/** Margin points premiums take at pressure 0.6 in fully exposed regions; doubles by 1.0. */
export const INSURANCE_MARGIN_POINTS_AT_ANCHOR: Readonly<Record<string, number>> = {
  agriculture: 1.5,
  real_estate: 2,
};
const INSURANCE_ANCHOR = 0.6;

/** Margin points (<= 0) lost to rising premiums for a sector in a region. */
export function insuranceMarginPenalty(
  pressure: number,
  exposure: Pick<ClimateExposure, "property" | "dry">,
  sectorType: string
): number {
  const points = INSURANCE_MARGIN_POINTS_AT_ANCHOR[sectorType] ?? 0;
  // Crop cover prices drought as well as storms.
  const exposed =
    sectorType === "agriculture" ? Math.max(exposure.property, exposure.dry) : exposure.property;
  const penalty = points * clamp(exposed, 0, 1) * pressureRamp(pressure, INSURANCE_ANCHOR, 2);
  return penalty > 0 ? -penalty : 0;
}

/**
 * Share of a weather disaster's damage that lands on the budget, relative to
 * the opening: insurers withdraw from exposed regions as pressure rises, so
 * the state carries more of the loss. 1.5x at pressure 0.6 when fully exposed.
 */
export function uninsuredLossMultiplier(
  pressure: number,
  exposure: Pick<ClimateExposure, "property">
): number {
  return 1 + 0.5 * clamp(exposure.property, 0, 1) * pressureRamp(pressure, INSURANCE_ANCHOR, 2);
}

/**
 * Standing margin and production effects for one region, in the disaster
 * effect shape the corporation turn already applies. The farm loss lands on
 * every agriculture method; protected methods get their share back through a
 * matching method-specific entry.
 */
export function climateEffectEntries(
  pressure: number,
  exposure: ClimateExposure
): DisasterEffectEntry[] {
  const entries: DisasterEffectEntry[] = [];
  const entry = (
    value: number,
    sectorType: string,
    strategyId: string | null,
    physicality: "physical" | "financial"
  ): DisasterEffectEntry => ({
    value,
    startTurn: 0,
    durationTurns: 0,
    sectorType,
    strategyId,
    physicality,
    persistent: true,
  });
  const loss = agricultureYieldLoss(pressure, exposure);
  if (loss > 0) {
    entries.push(entry(-loss * 100, "agriculture", null, "physical"));
    for (const [strategyId, protection] of Object.entries(AGRICULTURE_METHOD_CLIMATE_PROTECTION))
      if (protection > 0)
        entries.push(entry(loss * protection * 100, "agriculture", strategyId, "physical"));
  }
  for (const sectorType of Object.keys(INSURANCE_MARGIN_POINTS_AT_ANCHOR)) {
    const penalty = insuranceMarginPenalty(pressure, exposure, sectorType);
    if (penalty < 0) entries.push(entry(penalty, sectorType, null, "financial"));
  }
  return entries;
}
