import { DEFAULT_SEED_PRESET } from "@/lib/constants/seedPreset";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import {
  COMMODITY_LABELS,
  COMMODITY_PRESSURE_SOFT_KNEE,
  COMMODITY_TYPES,
  EXTRACTABLE_RESOURCES,
  computeEffectiveCommodityPressureRatio,
  type CommodityType,
  type ExtractableResource,
} from "@/lib/constants/commoditiesCore";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import type { CountryId } from "@/lib/constants/countries";
import {
  getEffectiveStrategyRatesForOperatingModel,
  getOperatingSectorType,
} from "@/lib/constants/sectorStrategies";
import {
  energyProductivityMultiplier,
  plantUtilizationForInputs,
} from "@/lib/corporations/rules/energyProductivityRamp";
import { getOutputMultiplier, getInputMultiplier } from "@/lib/utils/productionPolicy";
import { TRADE_EMBARGO_EXPORT_LOSS_SHARE } from "@/lib/trade/constants";
import {
  effectiveInputDemandRealPhase,
  inputDemandDeflator,
} from "@/lib/market/inputDemandRealPhase";
import {
  COUNTRY_COMMODITY_DEMAND_MULTIPLIER,
  EXTRACTION_OUTPUT_SCALE,
  COMMODITY_BASE_PRICES,
  COMMODITY_UNITS,
  BASE_COMMODITY_SUPPLY_DEMAND,
  COMMODITY_STABILIZER,
  DEMOGRAPHIC_GDP_PER_CAPITA_REF,
  DEMOGRAPHIC_WEALTH_MULT_MIN,
  DEMOGRAPHIC_WEALTH_MULT_MAX,
  STATE_COMMODITY_SUPPLY_DEMAND,
  EXTRACTABLE_RESOURCE_STATE_STABILIZER,
  UNOWNED_DRIFT_AMPLITUDE,
  UNOWNED_DRIFT_PERIOD_TURNS,
  EXTRACTABLE_PRESSURE_SOFT_KNEE,
  NETWORK_SERVICES_GDP_DEMAND_FRACTION,
  CONSTRUCTION_SERVICES_GDP_DEMAND_FRACTION,
  NATCORP_COMMODITY_MULTIPLIER,
  RETAIL_GDP_DEMAND_SCALE,
  RETAIL_GDP_NATIONAL_WEIGHT,
  RETAIL_GDP_REGIONAL_WEIGHT,
  RETAIL_GDP_MULTIPLIER_MIN,
  RETAIL_GDP_MULTIPLIER_MAX,
  BUILDING_MATERIALS_GDP_DEMAND_FRACTION,
  REAL_ESTATE_GDP_DEMAND_FRACTION,
  RETAIL_NEGATIVE_COMMODITY_PENALTY_FACTOR,
  FINANCIAL_DEMAND_ISSUANCE_FRACTION,
  FINANCIAL_NEUTRAL_RATE,
  FINANCIAL_RATE_SENSITIVITY,
  FINANCIAL_RATE_MULTIPLIER_MIN,
  FINANCIAL_RATE_MULTIPLIER_MAX,
  COMMODITY_LOG_K,
  COMMODITY_PER_ITEM_CAP,
  COMMODITY_AGGREGATE_INPUT_CAP,
  PLANTS_LEDGER_DEMAND_SUPPLY_CAP,
  COMMODITY_AGGREGATE_SURPLUS_CAP,
  COMMODITY_COMBINED_FLOOR,
  type CommodityFlow,
  SECTOR_SUPPLY,
  SECTOR_DEMAND,
} from "@/lib/constants/commoditiesTables";

/** The national demand multiplier for one (country, commodity); 1 when unset. */
export function countryCommodityDemandMultiplier(
  countryId: CountryId | string | undefined,
  commodity: CommodityType
): number {
  if (countryId == null) return 1;
  const value = COUNTRY_COMMODITY_DEMAND_MULTIPLIER[countryId as CountryId]?.[commodity];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Resolve the output-scale multiplier for one resource. Returns 1 (inert) when
 * the feature is disabled or the commodity isn't a scaled extractable, so
 * callers can multiply unconditionally.
 */
export function extractionOutputScaleFor(commodity: CommodityType, enabled: boolean): number {
  if (!enabled) return 1;
  return EXTRACTION_OUTPUT_SCALE[commodity as ExtractableResource] ?? 1;
}

/**
 * The base-price table on a world's ERA unit basis: every entry divided by the
 * era unit scale (`getEraUnitScale(preset)` — 1 for modern worlds, ~70 for
 * 1953). Dividing prices by the scale is exactly equivalent to multiplying
 * unit counts by it, so a pipeline that adopts this table wholesale moves ALL
 * of its ₳↔unit conversions, its ratio terms (which cancel) and its price
 * LEVELS onto the era basis in one substitution — which also lands the price
 * levels on the same magnitudes `seedCommodityPrices` era-seeds into the
 * commodity docs. Returns the shared modern table untouched at scale 1 so
 * every live world is byte-identical and no per-turn allocation happens.
 */
export function eraScaledBasePrices(unitScale: number): Record<CommodityType, number> {
  if (!(typeof unitScale === "number" && Number.isFinite(unitScale)) || unitScale === 1) {
    return COMMODITY_BASE_PRICES;
  }
  const scaled = {} as Record<CommodityType, number>;
  for (const key of Object.keys(COMMODITY_BASE_PRICES) as CommodityType[]) {
    scaled[key] = Math.max(0.01, COMMODITY_BASE_PRICES[key] / unitScale);
  }
  return scaled;
}

/** Wealth multiplier for a state from its GDP per capita (richer → more consumption). */
export function demographicWealthMultiplier(gdp: number, population: number): number {
  if (!(population > 0) || !(gdp > 0)) return DEMOGRAPHIC_WEALTH_MULT_MIN;
  const perCapita = gdp / population;
  const raw = Math.sqrt(perCapita / DEMOGRAPHIC_GDP_PER_CAPITA_REF);
  return Math.max(DEMOGRAPHIC_WEALTH_MULT_MIN, Math.min(DEMOGRAPHIC_WEALTH_MULT_MAX, raw));
}

/** Global stabilizer for a commodity — per-commodity value, flat fallback. */
export function getCommodityStabilizer(commodity: CommodityType): number {
  return COMMODITY_STABILIZER[commodity] ?? BASE_COMMODITY_SUPPLY_DEMAND;
}

/** Deterministic per-commodity phase offset in [0, 2π) so different commodities don't move in lockstep. */
function commodityDriftPhaseSeed(commodity: string): number {
  let hash = 0;
  for (let i = 0; i < commodity.length; i++) {
    hash = (hash * 31 + commodity.charCodeAt(i)) | 0;
  }
  const unit = (hash >>> 0) / 0xffffffff;
  return unit * 2 * Math.PI;
}

/**
 * Applies the bounded drift term in place to every commodity's global
 * supply/demand. No-op when `currentTurn` is unavailable (callers that don't
 * pass a turn number keep the pre-existing deterministic stabilizer-only
 * behavior, e.g. unit tests that don't care about turn-to-turn drift).
 */
function applyUnownedCommodityDrift(
  global: Map<CommodityType, { supply: number; demand: number }>,
  currentTurn: number | undefined
): void {
  if (currentTurn === undefined) return;
  for (const [commodity, balance] of global) {
    const stab = getCommodityStabilizer(commodity);
    const phase = commodityDriftPhaseSeed(commodity);
    const angle = (2 * Math.PI * currentTurn) / UNOWNED_DRIFT_PERIOD_TURNS + phase;
    // Opposite phase for supply vs. demand so the ratio itself oscillates,
    // not just both sides moving in lockstep (which would cancel out).
    balance.supply += stab * UNOWNED_DRIFT_AMPLITUDE * Math.sin(angle);
    balance.demand += stab * UNOWNED_DRIFT_AMPLITUDE * Math.sin(angle + Math.PI);
  }
}

/** The soft-knee to use for a commodity's PRICE computation. */
export function getPriceSoftKnee(commodity: CommodityType): number {
  return (EXTRACTABLE_RESOURCES as readonly string[]).includes(commodity)
    ? EXTRACTABLE_PRESSURE_SOFT_KNEE
    : COMMODITY_PRESSURE_SOFT_KNEE;
}

/**
 * First matching category amount from a budget's `byCategory` map, in alias
 * priority order. First match rather than a sum: a document carries one
 * spelling, and summing would double-count anything that somehow held both.
 */
export function govtSpendForCategory(
  byCategory: Record<string, number> | undefined | null,
  aliases: readonly string[]
): number {
  if (!byCategory) return 0;
  for (const key of aliases) {
    const amount = byCategory[key];
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

/**
 * Convert a dollar-equivalent flow to units at a given price.
 * units = dollarFlow / price
 */
export function dollarsToUnits(dollarFlow: number, price: number): number {
  if (price <= 0) return 0;
  return dollarFlow / price;
}

/**
 * The embargo write-off factor for a sector's SUPPLY leg, under plants.
 *
 * `0` under the legacy total-embargo suspension, otherwise
 * `1 − exportExposure × TRADE_EMBARGO_EXPORT_LOSS_SHARE`. Same shape as
 * `sectorTurn`'s `embargoRevenueFactor` and the ledger feed in
 * `commodityPriceTurn`, exported so the clearing offer cannot drift from the
 * world-supply ledger: goods that cannot be exported must disappear from both,
 * or the two disagree.
 *
 * Always returns a finite factor in [0, 1]; it never returns null.
 */
export function embargoSupplyFactorFor(sector: {
  embargoSuspended?: boolean | null;
  embargoExportExposure?: number | null;
}): number {
  // Same shape as sectorTurn's embargoRevenueFactor and the ledger feed in
  // commodityPriceTurn: a total-embargo suspension is a hard 0, otherwise the
  // exported share is written off. Exported so the clearing offer cannot drift
  // from the supply ledger.
  if (sector.embargoSuspended) return 0;
  return (
    1 -
    Math.max(0, Math.min(1, sector.embargoExportExposure ?? 0)) * TRADE_EMBARGO_EXPORT_LOSS_SHARE
  );
}

/**
 * Plants tier: the ONE canonical scaling chain applied on top of a sector's
 * measured `producedUnits` to get the units that actually reach the world
 * market.
 *
 * `producedUnits` is what the plant physically made. The production-policy
 * output multiplier is a PHYSICAL throttle applied in `sectorTurn`'s
 * `productionFactor`, so `producedUnits` already carries it; applying it here
 * again would build full tonnage and offer less than made, leaving permanently
 * unsold inventory the owner still paid to produce.
 *
 * `producedUnits` does NOT carry `natcorpScale` or the embargo write-off, so
 * both the world-supply ledger (`computeRawSupplyDemand`) and the clearing
 * OFFER (turn/corporation/index.ts) have to apply them. They MUST apply the
 * identical chain: the offer is flagged `realUnits` and is EXEMPT from
 * clearing's lagged-supply normalization, which would otherwise hide
 * divergence. Keep this the single source of the formula; a duplicated chain
 * is the bug.
 *
 * Returns null when there is no measured production to scale (the sector has
 * never run a plants turn), the caller's signal to fall back to the revenue
 * nameplate.
 */
export function plantsSupplyScaledUnits(args: {
  producedUnits: number | null | undefined;
  isNatcorp: boolean;
  /**
   * 0 under the legacy total-mothball suspension, else
   * 1 − exportExposure × TRADE_EMBARGO_EXPORT_LOSS_SHARE. Non-finite/absent ⇒ 1.
   */
  embargoSupplyFactor?: number | null;
}): number | null {
  if (typeof args.producedUnits !== "number" || !Number.isFinite(args.producedUnits)) return null;
  const embargo = Number.isFinite(args.embargoSupplyFactor)
    ? Math.max(0, Math.min(1, args.embargoSupplyFactor as number))
    : 1;
  return (
    Math.max(0, args.producedUnits) * (args.isNatcorp ? NATCORP_COMMODITY_MULTIPLIER : 1) * embargo
  );
}

/**
 * Same chain as `plantsSupplyScaledUnits`, but starting from NAMEPLATE CAPACITY
 * rather than measured production. Capacity is what the plant could make at
 * policy 0, so the production-policy output multiplier still has to be applied
 * here — a capacity figure has never been through `sectorTurn`.
 *
 * Used by the supply-agreement capacity validator, which sizes a proposed
 * contract against what the sector could deliver.
 */
export function plantsCapacityScaledUnits(args: {
  capacityUnits: number | null | undefined;
  isNatcorp: boolean;
  productionPolicyLevel: number | null | undefined;
  embargoSupplyFactor?: number | null;
}): number | null {
  if (typeof args.capacityUnits !== "number" || !Number.isFinite(args.capacityUnits)) return null;
  return plantsSupplyScaledUnits({
    producedUnits:
      Math.max(0, args.capacityUnits) * getOutputMultiplier(args.productionPolicyLevel ?? 0),
    isNatcorp: args.isNatcorp,
    embargoSupplyFactor: args.embargoSupplyFactor,
  });
}

/**
 * Scalar half of the canonical plants basis: measured output through the
 * shared scale chain plus the arsenal-retained share.
 *
 * The world supply ledger multiplies diverted output out of supply, so an
 * offer built without the same leg sits in a larger unit basis and trips the
 * clearing invariant while depressing fills. Defaults retain everything, so
 * callers that do not pass the leg are unchanged.
 */
export function scaleMeasuredProducedUnits(args: {
  producedUnits: number | null | undefined;
  isNatcorp: boolean;
  embargoSupplyFactor?: number | null;
  militaryRetainedFraction?: number | null;
}): number | null {
  const scaled = plantsSupplyScaledUnits({
    producedUnits: args.producedUnits,
    isNatcorp: args.isNatcorp,
    embargoSupplyFactor: args.embargoSupplyFactor,
  });
  if (scaled == null) return null;
  // Raw multiply, like the ledger leg this replaces: callers pass a [0,1]
  // retained share (the ledger builds 1 - clamped diversion), and absent
  // retains everything. NaN propagates to NaN so downstream `> 0` guards skip
  // exactly as before.
  return scaled * (args.militaryRetainedFraction ?? 1);
}

/**
 * THE canonical plants basis: measured output to per-commodity market units
 * through one chain (scale legs, mix split, arsenal retention).
 *
 * The world supply ledger and the clearing offer MUST both build plants units
 * through this function (or its scalar half plus commodityMixWeight on a
 * uniformly scaled base table) or the book and the ledger sit in different
 * units. Mix weights are ratios of rate/base terms, so any uniformly scaled
 * base table yields identical weights; callers pass their era table and the
 * basis stays one by construction.
 */
export function canonicalPlantsUnitsForCommodity(args: {
  producedUnits: number | null | undefined;
  isNatcorp: boolean;
  embargoSupplyFactor?: number | null;
  militaryRetainedFraction?: number | null;
  supplyRates: Partial<Record<CommodityType, number>>;
  basePrices: Record<CommodityType, number>;
  commodity: CommodityType;
}): number {
  const scaled = scaleMeasuredProducedUnits(args);
  if (!(scaled != null && scaled > 0)) return 0;
  return scaled * commodityMixWeight(args.supplyRates, args.basePrices, args.commodity);
}

/**
 * One commodity's share of a sector's output mix, by the same rate/basePrice
 * weights `impliedOutputUnits` (capacityEconomy) uses.
 *
 * This is the CANONICAL split for turning a scalar output-unit count (plants
 * `producedUnits`, `soldUnits`, a capacity figure) into per-commodity units.
 * Market clearing, the world supply ledger, the inventory advance and the
 * supply-agreement capacity check all call it, so a multi-output sector's mix
 * is identical everywhere and none of those surfaces can drift apart.
 *
 * Returns 0 when the commodity is not produced, has no base price, or the mix
 * is degenerate.
 */
export function commodityMixWeight(
  supplyRates: Partial<Record<CommodityType, number>>,
  basePrices: Record<CommodityType, number>,
  commodity: CommodityType
): number {
  let total = 0;
  for (const c of Object.keys(supplyRates) as CommodityType[]) {
    const r = supplyRates[c] ?? 0;
    const b = basePrices[c];
    if (r > 0 && b > 0) total += r / b;
  }
  const base = basePrices[commodity];
  const rate = supplyRates[commodity] ?? 0;
  if (!(total > 0) || !(base > 0) || rate <= 0) return 0;
  return rate / base / total;
}

/**
 * Compute the retail demand multiplier from blended GDP growth.
 * @param nationalGdpGrowth National average GDP growth (percentage points, e.g. 1.5)
 * @param stateGdpGrowth State-level GDP growth (percentage points)
 * @returns Multiplier on retail demand rates (0.5–2.0)
 */
export function computeRetailDemandMultiplier(
  nationalGdpGrowth: number,
  stateGdpGrowth: number,
  params: { scale: number; max: number } = {
    scale: RETAIL_GDP_DEMAND_SCALE,
    max: RETAIL_GDP_MULTIPLIER_MAX,
  }
): number {
  const blended =
    RETAIL_GDP_NATIONAL_WEIGHT * nationalGdpGrowth + RETAIL_GDP_REGIONAL_WEIGHT * stateGdpGrowth;
  const raw = 1 + (blended / 100) * params.scale;
  return Math.max(RETAIL_GDP_MULTIPLIER_MIN, Math.min(params.max, Math.round(raw * 1000) / 1000));
}

/**
 * Compute the rate environment multiplier for financial services demand.
 * Lower rates boost demand (cheap money → more financial activity).
 * Higher rates suppress demand (expensive money → less borrowing).
 *
 * @param primeRate The country's central bank prime rate (e.g. 2.5)
 * @returns Multiplier on financial services demand (0.5–1.5)
 */
export function computeRateEnvironmentMultiplier(primeRate: number): number {
  const deviation = FINANCIAL_NEUTRAL_RATE - primeRate;
  const raw = 1 + deviation * FINANCIAL_RATE_SENSITIVITY;
  return Math.max(
    FINANCIAL_RATE_MULTIPLIER_MIN,
    Math.min(FINANCIAL_RATE_MULTIPLIER_MAX, Math.round(raw * 1000) / 1000)
  );
}

/**
 * Data needed to compute latent financial services demand per country.
 */
export interface FinancialServicesDemandInput {
  /** Country's central bank prime rate */
  primeRate: number;
  /** Recent debt issuance in ₳ over the current demand window: stateId → issuance */
  stateDebtIssuance: Map<string, number>;
}

/**
 * Compute latent financial services demand per state for a country.
 * Demand = recentDebtIssuance × issuanceFraction × rateMultiplier / basePrice
 *
 * @returns Map of stateId → demand in units (contracts)
 */
export function computeLatentFinancialDemand(
  input: FinancialServicesDemandInput
): Map<string, number> {
  const rateMultiplier = computeRateEnvironmentMultiplier(input.primeRate);
  const basePrice = COMMODITY_BASE_PRICES["financial_services"];
  const result = new Map<string, number>();

  for (const [stateId, issuanceAnchor] of input.stateDebtIssuance) {
    const baseDemandDollars = issuanceAnchor * FINANCIAL_DEMAND_ISSUANCE_FRACTION;
    const adjustedDemandDollars = baseDemandDollars * rateMultiplier;
    const units = adjustedDemandDollars / basePrice;
    if (units > 0) {
      result.set(stateId, Math.round(units * 100) / 100);
    }
  }

  return result;
}

/**
 * A caller's era demand calibration for one commodity, guarded so a missing,
 * zero or non-finite value reads as 1 (no calibration). The supply caps divide
 * by this, so it must never be 0.
 */
export function calibrationMultiplier(
  demandCalibration: ((commodity: CommodityType) => number) | undefined,
  commodity: CommodityType
): number {
  const m = demandCalibration?.(commodity);
  return typeof m === "number" && Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * Compute commodity margin modifier for a sector that BUYS commodities (input costs).
 * Uses logarithmic scaling: penalty = -K × Σ(rate_i × ln(effectivePressure_i))
 *
 * Symmetric with the surplus bonus — same curve, opposite sign.
 * - Shortage (D > S): negative modifier (higher input costs compress margins)
 * - Oversupply (D < S): positive modifier (cheaper inputs boost margins)
 *
 * Returns a margin modifier in percentage points (e.g., -5.5 means -5.5% margin).
 */
/**
 * Accept either a `CommodityFlow[]` (matches SECTOR_DEMAND/SECTOR_SUPPLY) or
 * a `Partial<Record<CommodityType, number>>` (matches EffectiveStrategyRates),
 * returning the array form the per-commodity loops consume. Keeps callers
 * free to pass strategy rates directly without a conversion step.
 */
function normalizeFlows(
  input: Partial<Record<CommodityType, number>> | readonly CommodityFlow[]
): CommodityFlow[] {
  if (Array.isArray(input)) return input as CommodityFlow[];
  const record = input as Partial<Record<CommodityType, number>>;
  const out: CommodityFlow[] = [];
  for (const [commodity, rate] of Object.entries(record)) {
    if (typeof rate === "number" && rate > 0) {
      out.push({ commodity: commodity as CommodityType, rate });
    }
  }
  return out;
}

export function computeCommodityMarginModifier(
  sectorType: OperatingSectorType,
  /** Map of commodity -> { supplyUnits, demandUnits } for this state or global */
  commodityBalances: Map<CommodityType, { supply: number; demand: number }>,
  /**
   * Optional override flow rates — supersedes SECTOR_DEMAND[sectorType].
   * When a sector runs a non-standard operating strategy, callers must pass
   * the effective strategy's demand rates so the computed modifier matches
   * what the sector actually consumes (kept in sync with the per-row display
   * in the sector-detail API).
   */
  demandOverride?: Partial<Record<CommodityType, number>> | readonly CommodityFlow[]
): number {
  const demands =
    demandOverride != null ? normalizeFlows(demandOverride) : SECTOR_DEMAND[sectorType];
  if (!demands || demands.length === 0) return 0;

  let modifier = 0;

  for (const flow of demands) {
    const balance = commodityBalances.get(flow.commodity);
    if (!balance) continue;

    const demandPressure = computeEffectiveCommodityPressureRatio(balance.supply, balance.demand);
    const perCommodity = -COMMODITY_LOG_K * flow.rate * Math.log(demandPressure);
    // Soft cap: no single commodity can contribute more than ±COMMODITY_PER_ITEM_CAP
    modifier += Math.max(-COMMODITY_PER_ITEM_CAP, Math.min(COMMODITY_PER_ITEM_CAP, perCommodity));
  }

  return Math.round(modifier * 100) / 100;
}

/**
 * Compute commodity margin modifier for a sector that SELLS commodities (output demand).
 * Uses logarithmic scaling: bonus = +K × Σ(rate_i × ln(effectivePressure_i))
 *
 * Symmetric with the input cost modifier — same curve, opposite sign.
 * - Shortage (D > S): positive modifier (sellers benefit from premium pricing)
 * - Oversupply (D < S): negative modifier (sellers suffer from price pressure)
 *
 * Returns a margin modifier in percentage points (e.g., +5.5 means +5.5% margin).
 */
export function computeCommoditySurplusBonus(
  sectorType: OperatingSectorType,
  commodityBalances: Map<CommodityType, { supply: number; demand: number }>,
  /**
   * Optional override flow rates — supersedes SECTOR_SUPPLY[sectorType]. Pass
   * the sector's effective strategy supply rates when the sector is on a
   * non-standard strategy, otherwise the bonus is computed against the wrong
   * commodity set.
   */
  supplyOverride?: Partial<Record<CommodityType, number>> | readonly CommodityFlow[]
): number {
  const supplies =
    supplyOverride != null ? normalizeFlows(supplyOverride) : SECTOR_SUPPLY[sectorType];
  if (!supplies || supplies.length === 0) return 0;

  let bonus = 0;

  for (const flow of supplies) {
    const balance = commodityBalances.get(flow.commodity);
    if (!balance) continue;

    const demandPressure = computeEffectiveCommodityPressureRatio(balance.supply, balance.demand);
    const perCommodity = COMMODITY_LOG_K * flow.rate * Math.log(demandPressure);
    // Soft cap: no single commodity can contribute more than ±COMMODITY_PER_ITEM_CAP
    bonus += Math.max(-COMMODITY_PER_ITEM_CAP, Math.min(COMMODITY_PER_ITEM_CAP, perCommodity));
  }

  return Math.round(bonus * 100) / 100;
}

/**
 * Apply retail penalty reduction: retail sectors face only 25% of negative
 * commodity input penalties. Positive modifiers (oversupply benefits) are unaffected.
 */
export function applyRetailPenaltyFactor(
  sectorType: OperatingSectorType,
  commodityInputMod: number
): number {
  if (sectorType === "retail" && commodityInputMod < 0) {
    return commodityInputMod * RETAIL_NEGATIVE_COMMODITY_PENALTY_FACTOR;
  }
  return commodityInputMod;
}

type CommodityBalanceMap = Map<CommodityType, { supply: number; demand: number }>;

interface BlendedMarginModifiers {
  inputMod: number;
  surplusMod: number;
}

/**
 * A stabilised state book is a pure function of the raw state book. One turn
 * reads one raw book per state and hands that same map to every sector in it,
 * so caching the 27-commodity stabilised copy by map identity keeps it out of
 * the per-sector path. Entries die with the turn's lookups, which are rebuilt
 * every turn; a caller must not mutate a book map after passing it in.
 */
const stabilizedStateBooks = new WeakMap<object, CommodityBalanceMap>();

/**
 * A blended result is a pure function of the sector type, the three books, the
 * blend weights and the two flow sequences. Hundreds of sectors share all of
 * that (same state, strategy, tech and tariff posture), so the answer is
 * computed once and shared instead of rebuilt per sector. Same immutability
 * contract as the stabilised books above.
 */
const blendedResultCache = new WeakMap<
  object,
  WeakMap<object, WeakMap<object, Map<string, BlendedMarginModifiers>>>
>();

/** The exact flow sequence a leg loop reads, so equal rate objects share one answer. */
function commodityFlowKey(
  flows: Partial<Record<CommodityType, number>> | readonly CommodityFlow[]
): string {
  let key = "";
  if (Array.isArray(flows)) {
    for (const flow of flows) key += `${flow.commodity}:${flow.rate};`;
    return key;
  }
  // `for in` over the record keeps the signature allocation-free on the hot
  // path; own properties enumerated in the same order as Object.entries, which
  // is what normalizeFlows reads.
  for (const commodity in flows) {
    if (!Object.hasOwn(flows, commodity)) continue;
    const rate = (flows as Partial<Record<CommodityType, number>>)[commodity as CommodityType];
    if (typeof rate === "number" && rate > 0) key += `${commodity}:${rate};`;
  }
  return key;
}

/** The state book with its stabiliser added to both sides, built once per book. */
function stabilizedStateBook(stateBalances: CommodityBalanceMap): CommodityBalanceMap {
  const cached = stabilizedStateBooks.get(stateBalances);
  if (cached) return cached;
  // Extractable resources use a larger stabilizer because they are globally
  // traded: a state without local iron/oil/gas can import it, so pure
  // zero-supply local penalties over-penalise sectors in resource-poor states.
  const stabilized = new Map<CommodityType, { supply: number; demand: number }>();
  for (const c of COMMODITY_TYPES) {
    const s = stateBalances.get(c) ?? { supply: 0, demand: 0 };
    const stab = (EXTRACTABLE_RESOURCES as readonly string[]).includes(c)
      ? EXTRACTABLE_RESOURCE_STATE_STABILIZER
      : STATE_COMMODITY_SUPPLY_DEMAND;
    stabilized.set(c, {
      supply: s.supply + stab,
      demand: s.demand + stab,
    });
  }
  stabilizedStateBooks.set(stateBalances, stabilized);
  return stabilized;
}

/**
 * Compute blended commodity margin modifiers using the output-blend approach.
 * Computes modifiers at global, national, and state level independently, then blends
 * them with tariff-aware weights.
 *
 * State balances get STATE_COMMODITY_SUPPLY_DEMAND (or
 * EXTRACTABLE_RESOURCE_STATE_STABILIZER for extractables) added to both sides
 * to prevent extreme ratios when a state has zero supply. National balances
 * are used as-is.
 *
 * @returns { inputMod, surplusMod } — both in percentage points of margin
 */
export function computeBlendedMarginModifiers(
  sectorType: OperatingSectorType,
  globalBalances: Map<CommodityType, { supply: number; demand: number }>,
  nationalBalances: Map<CommodityType, { supply: number; demand: number }>,
  stateBalances: Map<CommodityType, { supply: number; demand: number }>,
  globalWeight: number = 0.5,
  nationalWeight: number = 0.25,
  localWeight: number = 0.25,
  /**
   * Optional effective supply/demand overrides — when the sector is on a
   * non-standard operating strategy, passing its current strategy rates keeps
   * the blended modifier consistent with the commodity rows displayed in the
   * sector-detail UI. Omit to fall back to SECTOR_SUPPLY/SECTOR_DEMAND
   * (appropriate only when the sector is on the default strategy).
   */
  supplyOverride?: Partial<Record<CommodityType, number>> | readonly CommodityFlow[],
  demandOverride?: Partial<Record<CommodityType, number>> | readonly CommodityFlow[]
): BlendedMarginModifiers {
  // The default flows depend only on the sector type, which is already in the
  // key, so a missing override needs no signature of its own.
  const cacheKey =
    `${sectorType}|${globalWeight}|${nationalWeight}|${localWeight}` +
    `|d${demandOverride == null ? "" : `o${commodityFlowKey(demandOverride)}`}` +
    `|s${supplyOverride == null ? "" : `o${commodityFlowKey(supplyOverride)}`}`;

  let byState = blendedResultCache.get(stateBalances);
  if (!byState) {
    byState = new WeakMap();
    blendedResultCache.set(stateBalances, byState);
  }
  let byNational = byState.get(nationalBalances);
  if (!byNational) {
    byNational = new WeakMap();
    byState.set(nationalBalances, byNational);
  }
  let byGlobal = byNational.get(globalBalances);
  if (!byGlobal) {
    byGlobal = new Map();
    byNational.set(globalBalances, byGlobal);
  }
  const cached = byGlobal.get(cacheKey);
  if (cached) return cached;

  // Normalise once, not once per level: the three levels read the same flows.
  const demandFlows =
    demandOverride != null ? normalizeFlows(demandOverride) : (SECTOR_DEMAND[sectorType] ?? []);
  const supplyFlows =
    supplyOverride != null ? normalizeFlows(supplyOverride) : (SECTOR_SUPPLY[sectorType] ?? []);
  const stabilizedState = stabilizedStateBook(stateBalances);

  // Compute modifiers at each level
  const globalInput = computeCommodityMarginModifier(sectorType, globalBalances, demandFlows);
  const nationalInput = computeCommodityMarginModifier(sectorType, nationalBalances, demandFlows);
  const stateInput = computeCommodityMarginModifier(sectorType, stabilizedState, demandFlows);
  const globalSurplus = computeCommoditySurplusBonus(sectorType, globalBalances, supplyFlows);
  const nationalSurplus = computeCommoditySurplusBonus(sectorType, nationalBalances, supplyFlows);
  const stateSurplus = computeCommoditySurplusBonus(sectorType, stabilizedState, supplyFlows);

  // Blend outputs using caller-supplied weights (default 50/25/25).
  const rawInput =
    globalWeight * globalInput + nationalWeight * nationalInput + localWeight * stateInput;
  // Apply retail penalty before aggregate cap (retail's reduced penalty is the
  // intended floor for retail, not a workaround to skip the aggregate cap).
  const penaltiedInput = applyRetailPenaltyFactor(sectorType, Math.round(rawInput * 100) / 100);
  // Aggregate cap: stacked multi-commodity pressure cannot collapse a sector
  // below −COMMODITY_AGGREGATE_INPUT_CAP regardless of how many inputs are scarce.
  const inputMod = Math.max(-COMMODITY_AGGREGATE_INPUT_CAP, penaltiedInput);

  const rawSurplus =
    globalWeight * globalSurplus + nationalWeight * nationalSurplus + localWeight * stateSurplus;
  // Aggregate ceiling: diversified extraction cannot exceed the surplus cap even
  // when selling into every scarce market simultaneously.
  const surplusMod = Math.min(COMMODITY_AGGREGATE_SURPLUS_CAP, Math.round(rawSurplus * 100) / 100);

  // Combined floor across BOTH legs: scale proportionally when
  // inputMod + surplusMod is below -COMMODITY_COMBINED_FLOOR so stacked
  // scarcity plus glut cannot exceed the floor that each leg's own cap misses.
  const combined = inputMod + surplusMod;
  const result: BlendedMarginModifiers =
    combined < -COMMODITY_COMBINED_FLOOR
      ? {
          inputMod:
            Math.round(inputMod * (COMMODITY_COMBINED_FLOOR / Math.abs(combined)) * 100) / 100,
          surplusMod:
            Math.round(surplusMod * (COMMODITY_COMBINED_FLOOR / Math.abs(combined)) * 100) / 100,
        }
      : { inputMod, surplusMod };
  const shared = Object.freeze(result);
  byGlobal.set(cacheKey, shared);
  return shared;
}

export interface CommoditySummaryRow {
  commodity: CommodityType;
  label: string;
  /** Supply in units/day */
  supply: number;
  /** Demand in units/day */
  demand: number;
  /** Balance in units/day (supply - demand) */
  balance: number;
  /** Base price for this commodity */
  basePrice: number;
  /** Unit label (tons, MWh, etc.) */
  unit: string;
}

/**
 * Compute aggregate commodity supply/demand for a set of owned sectors.
 * Returns values in UNITS (dollarFlow / basePrice).
 *
 * @param sectors Array of { sectorType, revenue } (revenue = daily)
 * @returns Array of commodity rows with supply, demand, and net balance in units
 */
export function computeCommoditySummary(
  sectors: { sectorType: string; revenue: number }[]
): CommoditySummaryRow[] {
  const supplyMap = new Map<CommodityType, number>();
  const demandMap = new Map<CommodityType, number>();

  for (const sector of sectors) {
    const st = sector.sectorType as OperatingSectorType;

    const supplies = SECTOR_SUPPLY[st];
    if (supplies) {
      for (const flow of supplies) {
        const dollarFlow = sector.revenue * flow.rate;
        const units = dollarsToUnits(dollarFlow, COMMODITY_BASE_PRICES[flow.commodity]);
        supplyMap.set(flow.commodity, (supplyMap.get(flow.commodity) ?? 0) + units);
      }
    }

    const demands = SECTOR_DEMAND[st];
    if (demands) {
      for (const flow of demands) {
        const dollarFlow = sector.revenue * flow.rate;
        const units = dollarsToUnits(dollarFlow, COMMODITY_BASE_PRICES[flow.commodity]);
        demandMap.set(flow.commodity, (demandMap.get(flow.commodity) ?? 0) + units);
      }
    }
  }

  const rows: CommoditySummaryRow[] = [];
  for (const commodity of COMMODITY_TYPES) {
    const supply = supplyMap.get(commodity) ?? 0;
    const demand = demandMap.get(commodity) ?? 0;
    if (supply > 0 || demand > 0) {
      rows.push({
        commodity,
        label: COMMODITY_LABELS[commodity],
        supply: Math.round(supply * 100) / 100,
        demand: Math.round(demand * 100) / 100,
        balance: Math.round((supply - demand) * 100) / 100,
        basePrice: COMMODITY_BASE_PRICES[commodity],
        unit: COMMODITY_UNITS[commodity],
      });
    }
  }

  return rows;
}

/**
 * GDP growth data used to scale retail consumer demand.
 * Retail demand multiplier = f(50% national + 50% regional GDP growth).
 */
export interface GdpGrowthData {
  /** National average GDP growth in percentage points (e.g. 1.5 = 1.5%) */
  nationalAverage: number;
  /** Per-state GDP growth: stateId → percentage points */
  byState: Map<string, number>;
}

/**
 * Compute raw supply/demand maps in units for price calculation.
 * Used by turn processing to calculate market prices.
 *
 * When gdpGrowthData is provided, retail sector demand is scaled by a multiplier
 * derived from GDP growth (50% national average + 50% state-level).
 *
 * When stateGdpMap is provided, building materials macro demand is generated
 * proportional to each state's GDP (construction/infrastructure spending).
 */
export interface SectorUnitsOut {
  supplyBySector: Map<string, Map<CommodityType, number>>;
  inputDemandBySector: Map<string, Map<CommodityType, number>>;
}

export function computeRawSupplyDemand(
  sectors: {
    sectorType: string;
    industryModel?: string | null;
    mediaDiscriminator?: string | null;
    revenue: number;
    stateId: string;
    /** Optional owner used to attribute this sector's realized ledger supply. */
    corporationId?: string | { toString(): string };
    sectorId?: string;
    isNatcorp?: boolean;
    strategyId?: string;
    transitionFromStrategyId?: string | null;
    transitionStartTurn?: number | null;
    productionPolicyLevel?: number;
    /** World Events v1 Phase 1: country the sector belongs to, used only to
     *  look up active `sectorDemandModifierPct` entries below. Optional so
     *  every existing caller (tests, other pricing paths) keeps compiling
     *  unchanged when it's omitted. */
    countryId?: string;
    /**
     * True when this sector sits in a command economy (caller resolves it via
     * `isPlannedEconomy`). Remaps media output off `advertising`, which is a
     * market institution a planned economy does not have.
     */
    plannedEconomy?: boolean;

    /**
     * Plants tier (`plantsEnabled`): the units this sector ACTUALLY produced
     * last turn (`sector.producedUnits`, daily, currency-free). When present the
     * sector's supply contribution is this number split across its output mix,
     * instead of the revenue×rate/basePrice nameplate derivation. Absent (a
     * sector that has never run a plants turn) falls back to the legacy
     * derivation, so the first plants turn is unchanged.
     */
    producedUnits?: number | null;
    /** Exact product output units, replacing the legacy mix split when present. */
    outputUnitsByCommodity?: Partial<Record<CommodityType, number>>;
    /**
     * Share of this plant's output (0..1) shipped to a government arsenal under a defence
     * procurement contract. That output was already paid for per lot and does not also
     * reach the world market, so it comes off this sector's supply contribution.
     *
     * Already resolved for staleness by the caller (`freshMilitaryDiversion`), which owns
     * the turn context — this function only multiplies. Absent/0 is a pure no-op.
     */
    militaryDivertedFraction?: number;
    /**
     * Plants tier: the sector's capacity in output units/day (`capitalStock`).
     * With `producedUnits` it gives the utilization ratio that scales INPUT
     * demand — a throttled plant buys fewer inputs. Absent ⇒ utilization 1.
     */
    capacityUnits?: number | null;
    /** Plants tier: mothballed plants are cold — zero supply AND zero inputs. */
    mothballed?: boolean;
    /**
     * Plants tier: the same factor the sector's REVENUE is scaled by under an
     * embargo (0 under the legacy total-mothball suspension, else
     * 1 − exportExposure × TRADE_EMBARGO_EXPORT_LOSS_SHARE). Applied to the
     * supply contribution for symmetry: goods that cannot be exported do not
     * reach the world market either, so the ledger must not keep counting them
     * as available supply while the revenue leg has already written them off.
     * Deliberately NOT applied to input demand — the plant still runs and still
     * buys its inputs; the embargo blocks the sale, not the production.
     * Absent/non-finite ⇒ 1 (unembargoed).
     */
    embargoSupplyFactor?: number | null;
    /**
     * Plants tier, EXTRACTION ONLY: realized ÷ nameplate output for this sector,
     * in [0,1]. Extraction keeps the legacy revenue-nameplate derivation below
     * (its rationing multipliers are applied in this loop and `producedUnits`
     * already carries its own capacity haircut, so the `producedUnits` override
     * would double-count the haircut) — but the nameplate is NOT what the plant
     * made. This fraction is the one the depletion booking in
     * `commodityPriceTurn.bookExtractionDepletion` charges reserves at, so
     * applying it here makes supply and depletion describe the same physical
     * units. Absent ⇒ 1, which is the pre-plants behaviour.
     */
    extractionRealizedFraction?: number | null;
    /**
     * Last turn's realized price leg (clearing factor / sold fraction). Divides
     * the revenue that drives input demand as `inputDemandRealPhase` advances,
     * so demand follows real output instead of the price level. Absent = 1.
     */
    priceLeg?: number | null;
  }[],
  gdpGrowthData?: GdpGrowthData,
  stateGdpMap?: Map<string, number>,
  currentTurn?: number,
  primeRates?: Map<string, number>,
  extractionMultipliers?: Map<string, Partial<Record<ExtractableResource, number>>>,
  extractionOutputScaleEnabled = false,
  /**
   * World Events v1 Phase 1: active `sectorDemandModifier` world-event
   * effects, keyed `${countryId}:${sectorType}` -> summed pct (e.g. a
   * royal-event's tourism bump). Additive on top of the existing
   * GDP-driven retail multiplier — see `getActiveSectorDemandModifierPctMap`
   * in `worldEvents/sectorDemandModifierMap.ts` for how this map is built.
   * Optional/absent is a pure no-op (all existing callers unaffected).
   */
  sectorDemandModifierPct?: Map<string, number>,
  /**
   * Household Ledger consolidation (`householdConsumptionEnabled`). When true,
   * retail's SECTOR_DEMAND inputs (food, electronics, …) are skipped — the
   * household basket owns those final-demand legs and would double-count them.
   *
   * Retail's legacy supply-derived output demand is controlled separately by
   * `retailLegacyDemandFactor` below. This flag only prevents the household
   * basket and Retail's old input proxy from double-counting the same purchases.
   */
  suppressRetailConsumerDemand = false,
  /**
   * Plants tier (marketSystemMode >= "plants"). When true, a sector carrying a
   * persisted `producedUnits` contributes REAL production to the world supply
   * ledger (split across its output mix) instead of the revenue nameplate, and
   * scales its INPUT demand by capacity utilization. Mothballed sectors drop out
   * of both sides entirely. False/omitted is a pure no-op — every non-plants
   * path stays byte-identical.
   */
  plantsEnabled = false,
  /**
   * Era unit-basis scale for plants worlds (~69.8 for 1953, 1 for modern).
   * Plants supply uses physical era-scaled units, but this function's
   * dollars-to-units legs divide era-nominal revenue by modern prices, so
   * without this they undercount ~70x and cause gluts and a price floor.
   * Multiplying every dollars-derived leg re-expresses the ledger in era
   * units; legacy-vs-legacy ratios stay identical since both sides scale.
   * Stabilizer and drift terms are deliberately NOT scaled: they are
   * modern-unit floors that shrink in relative terms.
   * Absent/1 is a no-op for legacy, modern, and below-plants callers.
   */
  ledgerUnitScale = 1,
  /**
   * Temporary demand for the named sector's outputs. The adjustment is based
   * on that sector's actual output units, so positive values raise demand for
   * what it sells and negative values lower it without changing input costs.
   */
  sectorOutputDemandModifierPct?: Map<string, number>,
  /**
   * Remaining share of Retail's legacy `demand = supply × GDP multiplier`
   * feedback loop. Defaults to 1 for worlds that have not started the bounded
   * transition. Production passes a factor that reaches exactly 0, after which
   * adding Retail supply can never create Retail demand.
   */
  retailLegacyDemandFactor = 1,
  /**
   * Base-price table for the plants measured-production mix split (issue
   * #2054). This is the ONE canonical basis the clearing offer splits on as
   * well: mix weights are ratios of rate/base terms, so any uniformly scaled
   * table gives identical weights, and passing the era table here keeps the
   * ledger and the book on literally the same table. Defaults to the modern
   * table, which is weight-identical, so every existing caller is unchanged.
   */
  ledgerBasePrices: Record<CommodityType, number> = COMMODITY_BASE_PRICES,
  /**
   * Era demand calibration the caller applies to the finished demand ledger
   * (`commodityDemandCalibration`), per commodity. The 1.5x cap below must
   * bound the CALIBRATED demand, so it is divided by this multiplier here.
   *
   * Without it the two corrections stack: the cap pins raw demand at 1.5x
   * supply and the calibration then multiplies that pinned figure, so a
   * commodity calibrated below 2/3 (1953 energy and oil 0.55, iron 0.45) reads
   * a permanent glut of 1/(1.5 x m) no matter how short it really is, and its
   * producers can never sell out. Absent means 1 for every commodity.
   */
  demandCalibration?: (commodity: CommodityType) => number,
  preset?: string,
  sectorUnitsOut?: SectorUnitsOut,
  /** Retail GDP amplifier override (commodity treadmill fix stage 2). */
  retailGdpParams?: { scale: number; max: number },
  /** Progress (0..1) of the input-demand-follows-real-output phase-in. */
  inputDemandRealPhase = 0,
  hardwareInputReliefStartTurn?: number
): {
  global: Map<CommodityType, { supply: number; demand: number }>;
  byState: Map<string, Map<CommodityType, { supply: number; demand: number }>>;
  /** Corporation id -> commodity -> realized units contributed to global supply. */
  supplyByCorporation: Map<string, Map<CommodityType, number>>;
  /** Sector intermediate-input demand by state and commodity, before calibration. */
  productionInputDemandByState: Map<string, Map<CommodityType, number>>;
  /**
   * commodity → demand units removed by the PLANTS_LEDGER_DEMAND_SUPPLY_CAP
   * pass this turn. Recorded, never applied. A capped commodity reports
   * supply/demand of exactly 2/3 no matter how short it is, so this is the
   * only surviving signal of the real gap.
   */
  demandTruncated: Map<CommodityType, number>;
} {
  const global = new Map<CommodityType, { supply: number; demand: number }>();
  const byState = new Map<string, Map<CommodityType, { supply: number; demand: number }>>();
  const supplyByCorporation = new Map<string, Map<CommodityType, number>>();
  const productionInputDemandByState = new Map<string, Map<CommodityType, number>>();
  const supplyBySector = sectorUnitsOut?.supplyBySector ?? new Map();
  const inputDemandBySector = sectorUnitsOut?.inputDemandBySector ?? new Map();
  const recordSectorUnits = (
    target: Map<string, Map<CommodityType, number>>,
    sectorId: string | undefined,
    commodity: CommodityType,
    units: number
  ): void => {
    if (!sectorId || !Number.isFinite(units) || units <= 0) return;
    let bySector = target.get(sectorId);
    if (!bySector) {
      bySector = new Map<CommodityType, number>();
      target.set(sectorId, bySector);
    }
    bySector.set(commodity, (bySector.get(commodity) ?? 0) + units);
  };
  const demandTruncated = new Map<CommodityType, number>();
  const recordCorporationSupply = (
    corporationId: string | { toString(): string } | undefined,
    commodity: CommodityType,
    units: number
  ): void => {
    if (corporationId == null || !Number.isFinite(units) || units <= 0) return;
    const id = corporationId.toString();
    if (!id) return;
    let output = supplyByCorporation.get(id);
    if (!output) {
      output = new Map<CommodityType, number>();
      supplyByCorporation.set(id, output);
    }
    output.set(commodity, (output.get(commodity) ?? 0) + units);
  };

  // Era ledger scale for every dollars-to-units leg (see `ledgerUnitScale` doc).
  // Garbage-tolerant like `safeUnitScale`: non-finite/non-positive means 1.
  const luScale =
    typeof ledgerUnitScale === "number" && Number.isFinite(ledgerUnitScale) && ledgerUnitScale > 0
      ? ledgerUnitScale
      : 1;
  // Parallel tally of what each demand leg would have been WITHOUT the era
  // rescale - the floor of the PLANTS_LEDGER_DEMAND_SUPPLY_CAP pass at the
  // bottom (a commodity in genuine shortage on the legacy basis keeps its full
  // pressure). Only allocated when the rescale is active.
  const demandUnscaled = luScale > 1 ? new Map<CommodityType, number>() : null;
  const addUnscaledDemand = (commodity: CommodityType, units: number) => {
    if (demandUnscaled) demandUnscaled.set(commodity, (demandUnscaled.get(commodity) ?? 0) + units);
  };
  const outputDemandDeltasByState = new Map<string, Map<CommodityType, number>>();
  const recordOutputDemandDelta = (
    sector: { countryId?: string; stateId: string; mediaDiscriminator?: string | null },
    sectorType: OperatingSectorType,
    commodity: CommodityType,
    outputUnits: number
  ) => {
    if (!sectorOutputDemandModifierPct || !sector.countryId || outputUnits <= 0) return;
    const pct = sectorOutputDemandModifierPct.get(`${sector.countryId}:${sectorType}`);
    if (!pct || !Number.isFinite(pct)) return;
    let stateDeltas = outputDemandDeltasByState.get(sector.stateId);
    if (!stateDeltas) {
      stateDeltas = new Map();
      outputDemandDeltasByState.set(sector.stateId, stateDeltas);
    }
    stateDeltas.set(commodity, (stateDeltas.get(commodity) ?? 0) + outputUnits * (pct / 100));
  };

  // Seed each type with its per-commodity stabilizer: thin markets need smaller values so the stabilizer doesn't flatten supply/demand ratio.
  for (const c of COMMODITY_TYPES) {
    const stab = getCommodityStabilizer(c);
    global.set(c, { supply: stab, demand: stab });
  }

  for (const sector of sectors) {
    // Persisted types are strings here; an unknown one simply has no recipe.
    const st = getOperatingSectorType(
      sector.sectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    ) as OperatingSectorType;

    // Ensure state map exists (no base stabilizer — state level is fully dynamic)
    if (!byState.has(sector.stateId)) {
      const stateMap = new Map<CommodityType, { supply: number; demand: number }>();
      for (const c of COMMODITY_TYPES) {
        stateMap.set(c, { supply: 0, demand: 0 });
      }
      byState.set(sector.stateId, stateMap);
    }
    const stateMap = byState.get(sector.stateId)!;

    const natcorpScale = sector.isNatcorp ? NATCORP_COMMODITY_MULTIPLIER : 1;
    // Production policy: asymmetric multipliers for output (supply) and input (demand)
    // High policy (+25): +15% output, +10% inputs, +10% revenue
    // Low policy (-25): -10% output, -15% inputs, -5% revenue
    const outputMultiplier = getOutputMultiplier(sector.productionPolicyLevel ?? 0);
    const inputMultiplier = getInputMultiplier(sector.productionPolicyLevel ?? 0);

    // Use operating strategy rates when available, fall back to hardcoded maps
    const hasStrategy = sector.strategyId && sector.strategyId !== "standard";
    const strategyRates =
      hasStrategy || sector.transitionFromStrategyId
        ? getEffectiveStrategyRatesForOperatingModel(
            st,
            sector.strategyId ?? "standard",
            sector.transitionFromStrategyId,
            sector.transitionStartTurn,
            currentTurn ?? 0,
            sector.industryModel,
            sector.mediaDiscriminator,
            preset,
            hardwareInputReliefStartTurn
          )
        : null;

    // Planned economies produce state information, not sold airtime. Applied to
    // BOTH the strategy path and the legacy SECTOR_SUPPLY fallback, and mirrored
    // on the clearing offer in turn/corporation/index.ts — the ledger and the
    // offered book must stay in the same commodities.
    const rawSupplyMix: Partial<Record<CommodityType, number>> = strategyRates
      ? strategyRates.supply
      : Object.fromEntries((SECTOR_SUPPLY[st] ?? []).map((f) => [f.commodity, f.rate]));
    const strategySupplyEntries = Object.entries(rawSupplyMix) as [CommodityType, number][];
    const supplyEntries = [...strategySupplyEntries];
    if (plantsEnabled && sector.outputUnitsByCommodity) {
      const existing = new Set(supplyEntries.map(([commodity]) => commodity));
      for (const commodity of Object.keys(sector.outputUnitsByCommodity) as CommodityType[]) {
        if (!existing.has(commodity)) supplyEntries.push([commodity, 0]);
      }
    }

    // ── Plants: real production replaces the revenue nameplate ────────────────
    // The nameplate derivation (revenue × rate / basePrice) is a PROXY for
    // output. Under plants the sector already measured what it made, so the
    // ledger reads that instead, which is what makes a throttled, mothballed or
    // capacity-constrained plant actually disappear from world supply.
    //
    // The scaling chain (natcorpScale × embargoSupplyFactor) is applied on top
    // because `producedUnits` does not carry those legs. The production-policy
    // output curve is NOT in this chain: it gates tonnage in `sectorTurn`, so
    // `producedUnits` already carries it. It lives in ONE place,
    // `plantsSupplyScaledUnits`, shared with the clearing offer in
    // turn/corporation/index.ts; the offered book and this ledger must stay in
    // the same units or clearing's lagged-supply reconciliation misfires (and
    // for `realUnits` offers it is switched off, so nothing catches a drift).
    //
    // EXTRACTION IS EXCLUDED on purpose: extraction supply carries the
    // per-resource output scale and deposit-capacity rationing multipliers
    // applied further down this loop, and `producedUnits` already contains its
    // own capacity haircut. Mixing the two would double-count the rationing, so
    // extraction keeps the legacy derivation. Mothballing still zeroes it below;
    // that is mode-level, not extraction math.
    // Output sold to a state arsenal never reaches the market. Applied to both supply
    // paths because a contracted plant diverts real production either way. The matching
    // cash deduction is the `hourlyRevenue` leg in `sectorTurn`; the two must move
    // together or the plant loses revenue for goods the world still received.
    const militaryRetained = 1 - Math.min(1, Math.max(0, sector.militaryDivertedFraction ?? 0));

    const plantsMothballed = plantsEnabled && sector.mothballed === true;
    const plantsSupplyUnits =
      plantsEnabled && st !== "extraction"
        ? plantsSupplyScaledUnits({
            producedUnits: sector.producedUnits,
            isNatcorp: sector.isNatcorp === true,
            embargoSupplyFactor: sector.embargoSupplyFactor,
          })
        : null;
    // Utilization scales INPUT demand: producedUnits / capacity. A plant running
    // at 60% of nameplate consumes ~60% of its inputs rather than 100%.
    // The energy productivity ramp lifts the cap with the output gain, so a plant
    // that makes more from the same capacity buys proportionally more inputs.
    const plantsUtilization =
      plantsEnabled &&
      typeof sector.producedUnits === "number" &&
      typeof sector.capacityUnits === "number" &&
      sector.capacityUnits > 0
        ? plantUtilizationForInputs(
            sector.producedUnits,
            sector.capacityUnits,
            energyProductivityMultiplier(sector.sectorType, currentTurn, preset)
          )
        : 1;
    const plantsSupplyRates: Partial<Record<CommodityType, number>> | null =
      plantsSupplyUnits != null ? Object.fromEntries(supplyEntries) : null;
    const hasExactOutputMap = plantsEnabled && sector.outputUnitsByCommodity != null;
    const exactOutputScale =
      plantsSupplyScaledUnits({
        producedUnits: 1,
        isNatcorp: sector.isNatcorp === true,
        embargoSupplyFactor: sector.embargoSupplyFactor,
      }) ?? 1;

    for (const [commodity, rate] of supplyEntries) {
      // D12: a mothballed plant is cold — it supplies nothing to the world.
      if (plantsMothballed) continue;
      if (hasExactOutputMap) {
        const rawUnits = sector.outputUnitsByCommodity?.[commodity] ?? 0;
        const units = Math.max(0, rawUnits) * exactOutputScale * militaryRetained;
        if (units > 0) {
          global.get(commodity)!.supply += units;
          stateMap.get(commodity)!.supply += units;
          recordCorporationSupply(sector.corporationId, commodity, units);
          recordSectorUnits(supplyBySector, sector.sectorId, commodity, units);
          recordOutputDemandDelta(sector, st, commodity, units);
        }
        continue;
      }
      if (plantsSupplyUnits != null && plantsSupplyRates) {
        // Canonical plants basis: same chain the clearing offer uses, so the
        // book and the ledger cannot drift into different units.
        const units = canonicalPlantsUnitsForCommodity({
          producedUnits: sector.producedUnits,
          isNatcorp: sector.isNatcorp === true,
          embargoSupplyFactor: sector.embargoSupplyFactor,
          militaryRetainedFraction: militaryRetained,
          supplyRates: plantsSupplyRates,
          basePrices: ledgerBasePrices,
          commodity,
        });
        if (units > 0) {
          global.get(commodity)!.supply += units;
          stateMap.get(commodity)!.supply += units;
          recordCorporationSupply(sector.corporationId, commodity, units);
          recordSectorUnits(supplyBySector, sector.sectorId, commodity, units);
          recordOutputDemandDelta(sector, st, commodity, units);
        }
        continue;
      }
      // `luScale` (era plants worlds): the nameplate is era-nominal ₳ against
      // the modern price table, so without the scale this leg is ~70x under the
      // plants unit basis - see the `ledgerUnitScale` doc above.
      // Plants, extraction only: bring the nameplate down to what the plant
      // actually made. The SAME fraction the depletion booking charges the
      // state's reserves at — see `extractionRealizedFraction`. Without it the
      // ledger counted a ramping or throughput-limited field at full nameplate
      // while the ground was only debited for the real output. nameplate x
      // fraction is already the real tonnage (policy curve included), so the
      // policy bonus and the output scale below do not apply to it.
      const f = plantsEnabled && st === "extraction" ? sector.extractionRealizedFraction : null;
      const realized =
        typeof f === "number" && Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : null;
      let units =
        dollarsToUnits(sector.revenue * rate, COMMODITY_BASE_PRICES[commodity]) *
        luScale *
        natcorpScale *
        (realized != null ? 1 : outputMultiplier) *
        militaryRetained;
      if (realized != null) units *= realized;

      // Structural extraction shortage stabilizer (audit t873): boost extraction
      // output per-resource BEFORE the capacity haircut, so the extra output
      // fills idle deposit capacity rather than exceeding it. Inert (×1) unless
      // gameConfig.extractionOutputScaleEnabled — see EXTRACTION_OUTPUT_SCALE.
      // Not applied to realized plant tonnage, which is already real.
      if (st === "extraction" && realized == null) {
        units *= extractionOutputScaleFor(commodity, extractionOutputScaleEnabled);
      }

      if (st === "extraction" && sector.sectorId && extractionMultipliers) {
        const sectorMults = extractionMultipliers.get(sector.sectorId);
        if (sectorMults && (EXTRACTABLE_RESOURCES as readonly string[]).includes(commodity)) {
          const mult = sectorMults[commodity as ExtractableResource] ?? 1;
          units *= mult;
        }
      }

      const g = global.get(commodity)!;
      g.supply += units;
      const s = stateMap.get(commodity)!;
      s.supply += units;
      recordCorporationSupply(sector.corporationId, commodity, units);
      recordSectorUnits(supplyBySector, sector.sectorId, commodity, units);
      recordOutputDemandDelta(sector, st, commodity, units);
    }

    const demandRates =
      strategyRates ??
      (eraForPreset(preset ?? DEFAULT_SEED_PRESET) === "1991"
        ? getEffectiveStrategyRatesForOperatingModel(
            st,
            "standard",
            null,
            null,
            currentTurn ?? 0,
            sector.industryModel,
            sector.mediaDiscriminator,
            preset,
            hardwareInputReliefStartTurn
          )
        : null);
    const demandEntries = demandRates
      ? (Object.entries(demandRates.demand) as [CommodityType, number][])
      : (SECTOR_DEMAND[st] ?? []).map((f) => [f.commodity, f.rate] as [CommodityType, number]);

    // For retail sectors, scale demand by GDP growth multiplier
    let demandMultiplier = 1;
    if (st === "retail" && gdpGrowthData) {
      const stateGdp = gdpGrowthData.byState.get(sector.stateId) ?? 0;
      demandMultiplier = computeRetailDemandMultiplier(
        gdpGrowthData.nationalAverage,
        stateGdp,
        retailGdpParams
      );
    }

    // World Events v1 Phase 1: temporary world-event sector demand bump
    // (e.g. royal-event's tourism bump, modeled on the media entertainment
    // sector — see worldEvents/handlers/royalEvent.ts). Additive with the
    // retail GDP multiplier above, not a replacement for it.
    if (sectorDemandModifierPct && sector.countryId) {
      const pct = sectorDemandModifierPct.get(`${sector.countryId}:${st}`);
      if (pct) {
        demandMultiplier *= 1 + pct / 100;
      }
    }

    // Skip retail consumer-input demand when the household pass owns final
    // demand, and skip mothballed plants, which buy nothing.
    if (!(suppressRetailConsumerDemand && st === "retail") && !plantsMothballed) {
      // Input demand follows real output. Legacy worlds deflate the revenue
      // anchor by the sector's realized price leg as the phase advances; plants
      // worlds already book the base-priced nameplate x utilization, which is
      // the billed input quantity, so they never deflate (inputDemandRealPhase.ts).
      const demandRevenue =
        sector.revenue /
        inputDemandDeflator(
          sector.priceLeg,
          effectiveInputDemandRealPhase(inputDemandRealPhase, plantsEnabled)
        );
      for (const [commodity, rate] of demandEntries) {
        const units =
          dollarsToUnits(
            demandRevenue * rate * demandMultiplier,
            COMMODITY_BASE_PRICES[commodity]
          ) *
          luScale *
          natcorpScale *
          inputMultiplier *
          plantsUtilization;
        const g = global.get(commodity)!;
        g.demand += units;
        addUnscaledDemand(commodity, units / luScale);
        const s = stateMap.get(commodity)!;
        s.demand += units;
        let stateInput = productionInputDemandByState.get(sector.stateId);
        if (!stateInput) {
          stateInput = new Map();
          productionInputDemandByState.set(sector.stateId, stateInput);
        }
        stateInput.set(commodity, (stateInput.get(commodity) ?? 0) + units);
        recordSectorUnits(inputDemandBySector, sector.sectorId, commodity, units);
      }
    }
  }

  // ── Temporary Retail legacy-demand unwind ──────────────────────────────────
  // This is intentionally the only supply-derived demand leg in the ledger and
  // it is temporary. Production fades it to zero through
  // `retailDemandTransition`; independent household demand remains downstream.
  // Clamp here as a final defence against a corrupt config amplifying the loop.
  const retailLegacyFactor = Number.isFinite(retailLegacyDemandFactor)
    ? Math.max(0, Math.min(1, retailLegacyDemandFactor))
    : 1;
  if (gdpGrowthData && retailLegacyFactor > 0) {
    for (const [stateId, stateMap] of byState) {
      const retailBal = stateMap.get("retail");
      if (!retailBal || retailBal.supply <= 0) continue;
      const stateGdp = gdpGrowthData.byState.get(stateId) ?? 0;
      const multiplier = computeRetailDemandMultiplier(
        gdpGrowthData.nationalAverage,
        stateGdp,
        retailGdpParams
      );
      const consumerDemand = retailBal.supply * multiplier * retailLegacyFactor;
      retailBal.demand += consumerDemand;
      const g = global.get("retail")!;
      g.demand += consumerDemand;
      // Supply-derived, already in the plants unit basis - not era-rescaled,
      // so its unscaled tally is the same value.
      addUnscaledDemand("retail", consumerDemand);
    }
  }

  // ── Real Estate Services: macro demand from GDP + Prime Rate ─────────────────
  // Each state generates real estate services demand proportional to its GDP,
  // scaled by the prime rate environment (lower rates → more demand).
  if (gdpGrowthData && stateGdpMap && primeRates) {
    const reBasePrice = COMMODITY_BASE_PRICES["real_estate_services"];
    for (const [stateId, gdp] of stateGdpMap) {
      if (gdp <= 0) continue;

      // We need the prime rate for the country this state belongs to.
      // To avoid a heavy lookup, we assume primeRates is passed as a Map of stateId -> primeRate.
      const primeRate = primeRates.get(stateId);
      if (primeRate === undefined) continue;

      const rateMultiplier = computeRateEnvironmentMultiplier(primeRate);
      const baseDemand = ((gdp * REAL_ESTATE_GDP_DEMAND_FRACTION) / reBasePrice) * luScale;
      const units = baseDemand * rateMultiplier;
      if (units <= 0) continue;

      // Add to global
      const g = global.get("real_estate_services")!;
      g.demand += units;
      addUnscaledDemand("real_estate_services", units / luScale);

      // Add to state
      if (!byState.has(stateId)) {
        const stateMap = new Map<CommodityType, { supply: number; demand: number }>();
        for (const c of COMMODITY_TYPES) {
          stateMap.set(c, { supply: 0, demand: 0 });
        }
        byState.set(stateId, stateMap);
      }
      const s = byState.get(stateId)!.get("real_estate_services")!;
      s.demand += units;
    }
  }

  // ── Network Services: macro demand from GDP (broadband/connectivity) ─────────
  if (stateGdpMap) {
    const nsBasePrice = COMMODITY_BASE_PRICES["network_services"];
    for (const [stateId, gdp] of stateGdpMap) {
      if (gdp <= 0) continue;
      const units = ((gdp * NETWORK_SERVICES_GDP_DEMAND_FRACTION) / nsBasePrice) * luScale;
      if (units <= 0) continue;
      global.get("network_services")!.demand += units;
      addUnscaledDemand("network_services", units / luScale);
      if (!byState.has(stateId)) {
        const stateMap = new Map<CommodityType, { supply: number; demand: number }>();
        for (const c of COMMODITY_TYPES) stateMap.set(c, { supply: 0, demand: 0 });
        byState.set(stateId, stateMap);
      }
      byState.get(stateId)!.get("network_services")!.demand += units;
    }
  }

  // ── Construction Services: macro demand from GDP (infrastructure investment) ─
  if (stateGdpMap) {
    const csBasePrice = COMMODITY_BASE_PRICES["construction_services"];
    for (const [stateId, gdp] of stateGdpMap) {
      if (gdp <= 0) continue;
      const units = ((gdp * CONSTRUCTION_SERVICES_GDP_DEMAND_FRACTION) / csBasePrice) * luScale;
      if (units <= 0) continue;
      global.get("construction_services")!.demand += units;
      addUnscaledDemand("construction_services", units / luScale);
      if (!byState.has(stateId)) {
        const stateMap = new Map<CommodityType, { supply: number; demand: number }>();
        for (const c of COMMODITY_TYPES) stateMap.set(c, { supply: 0, demand: 0 });
        byState.set(stateId, stateMap);
      }
      byState.get(stateId)!.get("construction_services")!.demand += units;
    }
  }

  // ── Building Materials: macro demand from GDP (construction/infrastructure) ─
  // Same shape as the sibling macro legs above. This buyer was disabled before
  // demand audit step 3; it now supplies the missing economy-wide demand.
  if (stateGdpMap) {
    const bmBasePrice = COMMODITY_BASE_PRICES["building_materials"];
    for (const [stateId, gdp] of stateGdpMap) {
      if (gdp <= 0) continue;
      const units = ((gdp * BUILDING_MATERIALS_GDP_DEMAND_FRACTION) / bmBasePrice) * luScale;
      if (units <= 0) continue;
      global.get("building_materials")!.demand += units;
      addUnscaledDemand("building_materials", units / luScale);
      if (!byState.has(stateId)) {
        const stateMap = new Map<CommodityType, { supply: number; demand: number }>();
        for (const c of COMMODITY_TYPES) stateMap.set(c, { supply: 0, demand: 0 });
        byState.set(stateId, stateMap);
      }
      byState.get(stateId)!.get("building_materials")!.demand += units;
    }
  }

  // Apply output-demand shifts after ordinary and macro demand is assembled.
  // Negative shocks cannot make a state's demand negative; the global ledger
  // receives the sum actually applied in each state so both views stay aligned.
  const appliedOutputDemandDelta = new Map<CommodityType, number>();
  for (const [stateId, deltas] of outputDemandDeltasByState) {
    const stateMap = byState.get(stateId);
    if (!stateMap) continue;
    for (const [commodity, requestedDelta] of deltas) {
      const balance = stateMap.get(commodity);
      if (!balance) continue;
      const nextDemand = Math.max(0, balance.demand + requestedDelta);
      const appliedDelta = nextDemand - balance.demand;
      balance.demand = nextDemand;
      appliedOutputDemandDelta.set(
        commodity,
        (appliedOutputDemandDelta.get(commodity) ?? 0) + appliedDelta
      );
    }
  }
  for (const [commodity, delta] of appliedOutputDemandDelta) {
    global.get(commodity)!.demand = Math.max(0, global.get(commodity)!.demand + delta);
    addUnscaledDemand(commodity, delta);
  }

  // ── Era-rescale demand cap (see PLANTS_LEDGER_DEMAND_SUPPLY_CAP) ──────────
  // Applied on the world total AFTER every demand leg has accumulated, and each
  // state's demand is scaled by the same factor so state shares are preserved -
  // the exact shape of the household supply clamp in householdConsumption.ts.
  // The floor is the unscaled (legacy-basis) demand plus the stabilizer both
  // tallies carry, so the cap can only ever bound the SCALE-UP, never cut a
  // commodity below the pressure it already had before this change.
  if (demandUnscaled) {
    for (const [commodity, bal] of global) {
      // The cap bounds demand AFTER the caller's era calibration, so a capped
      // commodity reads exactly 1.5x supply once calibrated, like every
      // uncalibrated one. Truncation is recorded in the same calibrated units
      // as the demand it is read beside.
      const calibration = calibrationMultiplier(demandCalibration, commodity);
      const cap = (bal.supply * PLANTS_LEDGER_DEMAND_SUPPLY_CAP) / calibration;
      if (bal.demand <= cap) continue;
      const unscaled = getCommodityStabilizer(commodity) + (demandUnscaled.get(commodity) ?? 0);
      const target = Math.max(unscaled, cap);
      if (target >= bal.demand) continue;
      const factor = target / bal.demand;
      demandTruncated.set(commodity, (bal.demand - target) * calibration);
      bal.demand = target;
      for (const stateMap of byState.values()) {
        const s = stateMap.get(commodity);
        if (s && s.demand > 0) s.demand *= factor;
      }
    }
  }

  applyUnownedCommodityDrift(global, currentTurn);

  return { global, byState, supplyByCorporation, productionInputDemandByState, demandTruncated };
}
