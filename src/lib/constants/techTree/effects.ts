import { COMMODITY_TYPES } from "../commodities";
/**
 * Tech-tree effect types.
 *
 * Effects are pure, declarative descriptions of a bonus. The engine reads the
 * union and applies each kind at an existing injection point — no effect ever
 * mutates persisted margins or costs directly.
 *
 * Every per-turn effect acts on plants: what they cost to build, how many
 * workers and inputs they need, and how much they produce.
 *
 * Per-turn (recomputed from the unlocked set):
 *  - plantOutput         → raises every output rate of the sector's plants
 *  - inputEfficiency     → lowers every input rate of the sector's plants
 *  - laborCostReduction  → lowers the sector's labor bill
 *  - growthCostReduction → scales daily growth cost and, under plants, the
 *                          capacity build price and (at 60% weight) build time
 *                          (capped in aggregate)
 *  - dominanceShield     → under plants, cuts the dominance toll on new
 *                          capacity (the build price multiplier)
 *  - inputCost           → reduces a production method's demand rate for a commodity
 *  - outputRate          → raises a production method's supply rate for a commodity
 * One-time (applied at unlock):
 *  - marketingStrength / logisticsStrength → persisted strength fields
 *  - unlockStrategy → makes a gated production method available
 */

/**
 * Total tech plant-output bonus is capped. Output scales revenue and world
 * supply together, so the cap stays modest: it absorbed the old profit-margin
 * (8pp cap) and output-sale-price (6% cap) effects, so it sits between their sum
 * and the larger of the two.
 */
export const TECH_PLANT_OUTPUT_CAP = 0.12;
/** Total tech input-efficiency bonus is capped (every input rate floored at 1 − this). */
export const TECH_INPUT_EFFICIENCY_CAP = 0.3;
/** Total tech growth-cost reduction is capped (multiplier floored at 1 − this). */
export const TECH_GROWTH_REDUCTION_CAP = 0.5;
/**
 * Share of the growth-cost reduction that also shortens construction under
 * plants. A 20% reduction cuts build time by 12%; the 50% aggregate cap cuts it
 * by 30%. Deliberately smaller than the price leg: speed compounds (capacity
 * earns sooner), so it is the weaker benefit.
 */
export const TECH_BUILD_TIME_PER_GROWTH_REDUCTION = 0.6;
/** Total tech labor-cost reduction (automation) is capped (multiplier floored at 1 − this). */
export const TECH_LABOR_REDUCTION_CAP = 0.5;
/** Shield-style effects (dominance/tariff/expansion) cap at this fraction. */
export const TECH_SHIELD_CAP = 0.6;
/**
 * Corporate-lane effects apply to ALL of a corp's sectors but at this reduced
 * strength; Sector-lane effects apply only to the corp's PRIMARY sector type, at
 * full strength. See getSectorTechEffects in ./selectors.
 */
export const CORP_LANE_EFFECT_SCALE = 0.5;

/** Raises every output rate of the sector's plants (0.02 = 2% more output). */
export interface PlantOutputEffect {
  kind: "plantOutput";
  pct: number;
}

/** Lowers every input rate of the sector's plants (0.03 = 3% fewer inputs). */
export interface InputEfficiencyEffect {
  kind: "inputEfficiency";
  pct: number;
}

/**
 * Proportional reduction to a sector's capacity build cost (per turn). Under
 * plants it also shortens construction by `TECH_BUILD_TIME_PER_GROWTH_REDUCTION`
 * of the same fraction; the legacy growth slider is retired there.
 */
export interface GrowthCostReductionEffect {
  kind: "growthCostReduction";
  pct: number;
}

/**
 * Proportional reduction to a sector's labor cost (automation), per turn.
 * Only bites when the labour system is on (labourSystemMode ≥ "wages"); no-op
 * otherwise since labor isn't a separate cost line. 0.1 = labor 10% cheaper.
 */
export interface LaborCostReductionEffect {
  kind: "laborCostReduction";
  pct: number;
}

/** Cuts a production method's input (demand) rate for a commodity (e.g. 0.5 = halve it). */
export interface InputCostEffect {
  kind: "inputCost";
  commodity: string;
  /** Fraction of the input removed (0.5 = use half as much of this commodity). */
  pct: number;
}

/** Raises a production method's output (supply) rate for a commodity. */
export interface OutputRateEffect {
  kind: "outputRate";
  commodity: string;
  /** Fraction added to output (0.1 = +10% of this commodity produced). */
  pct: number;
}

/** One-time flat boost to the corp's marketing strength, applied at unlock. */
export interface MarketingStrengthEffect {
  kind: "marketingStrength";
  flat: number;
}

/**
 * One-time flat boost to the corp's logistics strength, applied at unlock.
 * Logistics strength eases the sprawl penalty and, under plants, cuts the
 * corporation's freight bill and landed-price surcharge on out-of-state inputs
 * (see `getLogisticsShippingMultiplier`).
 */
export interface LogisticsStrengthEffect {
  kind: "logisticsStrength";
  flat: number;
}

/**
 * Reduces the dominance toll. Under plants the toll is the build-price
 * multiplier on new capacity, so the shield cuts that multiplier's excess over
 * 1.0 (permanent, unlike the margin penalty and regulatory burden, which fade
 * out over the plants ramp). Outside plants it reduces the margin penalty and
 * regulatory burden as before.
 */
export interface DominanceShieldEffect {
  kind: "dominanceShield";
  /** Fraction of the dominance penalty neutralized (0.5 = halve it). */
  pct: number;
}

/** Reduces the foreign-tariff margin penalty (lobbying, local content, hedging). */
export interface TariffShieldEffect {
  kind: "tariffShield";
  pct: number;
}

/** Reduces the cash cost of expanding a sector into a new state. */
export interface ExpansionDiscountEffect {
  kind: "expansionDiscount";
  pct: number;
}

/** Unlocks a sector operating strategy (production method) for the corp. */
export interface UnlockStrategyEffect {
  kind: "unlockStrategy";
  strategyId: string;
}

export type TechEffect =
  | PlantOutputEffect
  | InputEfficiencyEffect
  | GrowthCostReductionEffect
  | LaborCostReductionEffect
  | InputCostEffect
  | OutputRateEffect
  | DominanceShieldEffect
  | TariffShieldEffect
  | ExpansionDiscountEffect
  | MarketingStrengthEffect
  | LogisticsStrengthEffect
  | UnlockStrategyEffect;

/** Category drives the UI icon for an effect (no emojis). */
export type TechEffectCategory =
  | "growth"
  | "input"
  | "output"
  | "dominance"
  | "tariff"
  | "expansion"
  | "marketing"
  | "logistics"
  | "method";

export function techEffectCategory(kind: TechEffect["kind"]): TechEffectCategory {
  switch (kind) {
    case "plantOutput":
      return "output";
    case "inputEfficiency":
      return "input";
    case "growthCostReduction":
      return "growth";
    case "laborCostReduction":
      // Reuse the "growth" cost-reduction icon — no new UI category needed.
      return "growth";
    case "inputCost":
      return "input";
    case "outputRate":
      return "output";
    case "dominanceShield":
      return "dominance";
    case "tariffShield":
      return "tariff";
    case "expansionDiscount":
      return "expansion";
    case "marketingStrength":
      return "marketing";
    case "logisticsStrength":
      return "logistics";
    case "unlockStrategy":
      return "method";
  }
}

/** Collect every strategy id unlocked by a flat list of effects. */
export function collectUnlockedStrategyIds(effects: TechEffect[]): string[] {
  const out: string[] = [];
  for (const e of effects) {
    if (e.kind === "unlockStrategy" && !out.includes(e.strategyId)) out.push(e.strategyId);
  }
  return out;
}

/** Aggregate of the per-turn effects, reduced to engine-ready scalars. */
export interface AggregatedTechEffects {
  /** Capped plant-output bonus folded into every `outputRateMult` entry. */
  plantOutputBonus: number;
  /** Capped input-efficiency bonus folded into every `inputRateMult` entry. */
  inputEfficiencyBonus: number;
  /** Combined growth-cost multiplier in [1−cap, 1]; 1 = no reduction. */
  growthCostMultiplier: number;
  /** Combined labor-cost multiplier in [1−cap, 1]; 1 = no reduction (automation). */
  laborCostMultiplier: number;
  /** commodity → input-demand multiplier (<1 reduces input). */
  inputRateMult: Record<string, number>;
  /** commodity → output-supply multiplier (>1 raises output). */
  outputRateMult: Record<string, number>;
  /** 0–TECH_SHIELD_CAP fraction of the dominance penalty neutralized. */
  dominanceShield: number;
  /** 0–TECH_SHIELD_CAP fraction of the foreign-tariff penalty neutralized. */
  tariffShield: number;
  /** 0–TECH_SHIELD_CAP fraction off sector expansion cost. */
  expansionDiscount: number;
}

/** Neutral aggregate (no tech effects) — used when the feature gate is off. */
export const NEUTRAL_TECH_EFFECTS: AggregatedTechEffects = {
  plantOutputBonus: 0,
  inputEfficiencyBonus: 0,
  growthCostMultiplier: 1,
  laborCostMultiplier: 1,
  inputRateMult: {},
  outputRateMult: {},
  dominanceShield: 0,
  tariffShield: 0,
  expansionDiscount: 0,
};

/** Scale a single effect's magnitude (corp-lane effects apply at reduced strength). */
export function scaleEffect(effect: TechEffect, scale: number): TechEffect {
  switch (effect.kind) {
    case "plantOutput":
    case "inputEfficiency":
      return { ...effect, pct: effect.pct * scale };
    case "growthCostReduction":
      return { ...effect, pct: effect.pct * scale };
    case "laborCostReduction":
      return { ...effect, pct: effect.pct * scale };
    case "inputCost":
    case "outputRate":
    case "dominanceShield":
    case "tariffShield":
    case "expansionDiscount":
      return { ...effect, pct: effect.pct * scale };
    default:
      return effect; // strength grants / unlockStrategy are not per-sector
  }
}

/** Reduce a flat list of effects to the per-turn scalars the turn engine applies. */
export function aggregateTechEffects(effects: TechEffect[]): AggregatedTechEffects {
  let plantOutputPct = 0;
  let inputEfficiencyPct = 0;
  let growthCostReductionPct = 0;
  let laborCostReductionPct = 0;
  let dominanceShield = 0;
  let tariffShield = 0;
  let expansionDiscount = 0;
  const inputRateMult: Record<string, number> = {};
  const outputRateMult: Record<string, number> = {};
  for (const effect of effects) {
    if (effect.kind === "plantOutput") {
      plantOutputPct += effect.pct;
    } else if (effect.kind === "inputEfficiency") {
      inputEfficiencyPct += effect.pct;
    } else if (effect.kind === "growthCostReduction") {
      growthCostReductionPct += effect.pct;
    } else if (effect.kind === "laborCostReduction") {
      laborCostReductionPct += effect.pct;
    } else if (effect.kind === "dominanceShield") {
      dominanceShield += effect.pct;
    } else if (effect.kind === "tariffShield") {
      tariffShield += effect.pct;
    } else if (effect.kind === "expansionDiscount") {
      expansionDiscount += effect.pct;
    } else if (effect.kind === "inputCost") {
      const cur = inputRateMult[effect.commodity] ?? 1;
      inputRateMult[effect.commodity] = cur * Math.max(0, 1 - effect.pct);
    } else if (effect.kind === "outputRate") {
      const cur = outputRateMult[effect.commodity] ?? 1;
      outputRateMult[effect.commodity] = cur * (1 + Math.max(0, effect.pct));
    }
  }
  const clampedReduction = Math.min(TECH_GROWTH_REDUCTION_CAP, Math.max(0, growthCostReductionPct));
  const clampedLaborReduction = Math.min(
    TECH_LABOR_REDUCTION_CAP,
    Math.max(0, laborCostReductionPct)
  );
  const shield = (v: number) => Math.min(TECH_SHIELD_CAP, Math.max(0, v));
  // The plant-wide effects fold into the per-commodity maps every consumer
  // already reads (supply, demand, unit yield, world ledger), so no consumer
  // needs a second code path. Applied to every commodity: a rate a recipe does
  // not use is never read.
  const plantOutputBonus = Math.min(TECH_PLANT_OUTPUT_CAP, Math.max(0, plantOutputPct));
  const inputEfficiencyBonus = Math.min(TECH_INPUT_EFFICIENCY_CAP, Math.max(0, inputEfficiencyPct));
  if (plantOutputBonus > 0 || inputEfficiencyBonus > 0) {
    for (const commodity of COMMODITY_TYPES) {
      if (plantOutputBonus > 0) {
        outputRateMult[commodity] = (outputRateMult[commodity] ?? 1) * (1 + plantOutputBonus);
      }
      if (inputEfficiencyBonus > 0) {
        inputRateMult[commodity] = (inputRateMult[commodity] ?? 1) * (1 - inputEfficiencyBonus);
      }
    }
  }
  return {
    plantOutputBonus,
    inputEfficiencyBonus,
    growthCostMultiplier: 1 - clampedReduction,
    laborCostMultiplier: 1 - clampedLaborReduction,
    inputRateMult,
    outputRateMult,
    dominanceShield: shield(dominanceShield),
    tariffShield: shield(tariffShield),
    expansionDiscount: shield(expansionDiscount),
  };
}

/** Strength grants on a single node, applied once at unlock time. */
export interface TechStrengthGrants {
  marketingStrength: number;
  logisticsStrength: number;
}

/** Sum the one-time strength grants from a node's effect list. */
export function sumStrengthGrants(effects: TechEffect[]): TechStrengthGrants {
  let marketingStrength = 0;
  let logisticsStrength = 0;
  for (const effect of effects) {
    if (effect.kind === "marketingStrength") marketingStrength += effect.flat;
    else if (effect.kind === "logisticsStrength") logisticsStrength += effect.flat;
  }
  return { marketingStrength, logisticsStrength };
}

function formatPct(fraction: number): string {
  const pct = fraction * 100;
  return Number.isInteger(Math.round(pct * 10) / 10)
    ? String(Math.round(pct))
    : (Math.round(pct * 10) / 10).toFixed(1);
}

function prettyCommodity(c: string): string {
  return c.replace(/_/g, " ");
}

/** Short human-readable summary of a single effect (for tooltips / UI). */
export function describeTechEffect(effect: TechEffect): string {
  switch (effect.kind) {
    case "plantOutput":
      return `+${formatPct(effect.pct)}% plant output`;
    case "inputEfficiency":
      return `−${formatPct(effect.pct)}% plant inputs`;
    case "growthCostReduction":
      return `−${formatPct(effect.pct)}% capacity build cost, −${formatPct(
        effect.pct * TECH_BUILD_TIME_PER_GROWTH_REDUCTION
      )}% build time`;
    case "laborCostReduction":
      return `−${formatPct(effect.pct)}% labor cost`;
    case "inputCost":
      return `−${Math.round(effect.pct * 100)}% ${prettyCommodity(effect.commodity)} input`;
    case "outputRate":
      return `+${Math.round(effect.pct * 100)}% ${prettyCommodity(effect.commodity)} output`;
    case "dominanceShield":
      return `−${Math.round(effect.pct * 100)}% market-dominance toll on new capacity`;
    case "tariffShield":
      return `−${Math.round(effect.pct * 100)}% foreign-tariff penalty`;
    case "expansionDiscount":
      return `−${Math.round(effect.pct * 100)}% sector expansion cost`;
    case "marketingStrength":
      return `+${effect.flat} marketing strength`;
    case "logisticsStrength":
      return `+${effect.flat} logistics strength (cheaper freight and landed inputs, less sprawl penalty)`;
    case "unlockStrategy":
      return `Unlocks production method: ${effect.strategyId}`;
  }
}
