/**
 * Energy transition rules for worlds that opt in (the 2027 world). Game design,
 * not calibration to a real grid. Plain data in, plain data out: the year
 * arrives as an argument, law levels arrive already read.
 *
 * - Renewables without firming lose output: storage and smart grid capacity in
 *   the same region firm them.
 * - Plants past their design life cost more to keep running.
 * - Climate laws (carbon price, coal phase-out, clean power standard) raise
 *   the input bill of carbon-heavy production and cut regional emissions.
 * - Prospecting gets dearer as a deposit is worked out, from 2035.
 * - A recycling duty in the critical minerals law recovers part of every
 *   firm's rare earth demand.
 */

import type { AggregatedTechEffects } from "@/lib/constants/techTree/effects";

const clamp = (value: number, lower: number, upper: number) =>
  Math.max(lower, Math.min(upper, value));

const finite = (value: number | null | undefined): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

// ─── Energy mix: storage firms renewables ───────────────────────────────────

/** Methods that firm intermittent supply, weighted by how much each firms. */
export const FIRMING_WEIGHT_BY_METHOD: Readonly<Record<string, number>> = {
  grid_storage_utility: 1,
  // Demand response shifts load but stores nothing.
  smart_grid: 0.5,
};

/** Firming capacity per unit of renewables that removes the penalty entirely. */
export const STORAGE_RATIO_TARGET = 0.25;

/** Output lost by renewables that make up all of a region's power and have no firming. */
export const MAX_RENEWABLES_RELIABILITY_PENALTY = 0.15;

/** Renewables share of regional power below which intermittency costs nothing. */
const PENETRATION_FLOOR = 0.3;
/** Share at which the full penalty applies. */
const PENETRATION_FULL = 0.7;

export interface RegionalPowerMix {
  renewables: number;
  /** Firming capacity, already weighted by FIRMING_WEIGHT_BY_METHOD. */
  firming: number;
  total: number;
}

/** Sum a region's energy capacity by method into the mix the penalty reads. */
export function regionalPowerMix(
  sectors: ReadonlyArray<{ strategyId: string | null | undefined; capacity: number }>
): RegionalPowerMix {
  const mix: RegionalPowerMix = { renewables: 0, firming: 0, total: 0 };
  for (const sector of sectors) {
    const capacity = Math.max(0, finite(sector.capacity));
    const method = sector.strategyId ?? "standard";
    mix.total += capacity;
    if (method === "renewables") mix.renewables += capacity;
    mix.firming += capacity * (FIRMING_WEIGHT_BY_METHOD[method] ?? 0);
  }
  return mix;
}

/** Firming capacity relative to renewables: 0 with none, 1 at the target ratio. */
export function storageCoverage(mix: RegionalPowerMix): number {
  if (!(mix.renewables > 0)) return 1;
  return clamp(mix.firming / (STORAGE_RATIO_TARGET * mix.renewables), 0, 1);
}

/**
 * Fraction of renewables output lost to intermittency (0 to 0.15). Scales with
 * how much of the region's power is renewable and with the unfirmed share.
 */
export function renewablesReliabilityPenalty(mix: RegionalPowerMix): number {
  if (!(mix.renewables > 0) || !(mix.total > 0)) return 0;
  const penetration = mix.renewables / mix.total;
  const exposure = clamp(
    (penetration - PENETRATION_FLOOR) / (PENETRATION_FULL - PENETRATION_FLOOR),
    0,
    1
  );
  return MAX_RENEWABLES_RELIABILITY_PENALTY * exposure * (1 - storageCoverage(mix));
}

// ─── Ageing infrastructure ──────────────────────────────────────────────────

/** Years a plant runs at its design cost. Power 40, factories 30. */
export const DESIGN_LIFE_YEARS: Readonly<Record<string, number>> = {
  energy: 40,
  manufacturing: 30,
  manufacturing_vehicles: 30,
  chemical_industries: 30,
  defense: 30,
};

/** Extra input use per year past design life, and its ceiling. */
export const AGING_PENALTY_PER_YEAR = 0.015;
export const AGING_PENALTY_CAP = 0.2;

/**
 * Average fleet age on the opening day, for plants that carry no vintage of
 * their own. Conventional power is the oldest fleet; methods that only open in
 * later research tiers start new.
 */
const OPENING_AGE_BY_METHOD: Readonly<Record<string, number>> = {
  standard: 28,
  nuclear: 34,
  fracking: 12,
  renewables: 8,
  smart_grid: 6,
  grid_storage_utility: 0,
  advanced_fission: 0,
  fusion: 0,
  fusion_commercial: 0,
};
const OPENING_AGE_BY_TYPE: Readonly<Record<string, number>> = {
  energy: 20,
  manufacturing: 18,
  manufacturing_vehicles: 15,
  chemical_industries: 22,
  defense: 20,
};

/** Build year an untracked fleet is assumed to have. Null for types that do not age. */
export function openingVintageYear(
  operatingType: string,
  strategyId: string | null | undefined,
  startingYear: number
): number | null {
  if (DESIGN_LIFE_YEARS[operatingType] == null) return null;
  const age =
    (operatingType === "energy" ? OPENING_AGE_BY_METHOD[strategyId ?? "standard"] : undefined) ??
    OPENING_AGE_BY_TYPE[operatingType] ??
    0;
  return startingYear - age;
}

/** Capacity-weighted build year after `addedUnits` of new capacity land. */
export function blendVintageYear(
  priorVintage: number,
  priorUnits: number,
  currentYear: number,
  addedUnits: number
): number {
  const prior = Math.max(0, finite(priorUnits));
  const added = Math.max(0, finite(addedUnits));
  if (!(added > 0)) return priorVintage;
  if (!(prior > 0)) return currentYear;
  return (priorVintage * prior + currentYear * added) / (prior + added);
}

/** Fraction the input bill rises by for a fleet of this vintage (0 to 0.2). */
export function agingMaintenancePenalty(
  operatingType: string,
  vintageYear: number | null,
  currentYear: number
): number {
  const life = DESIGN_LIFE_YEARS[operatingType];
  if (life == null || vintageYear == null || !Number.isFinite(vintageYear)) return 0;
  const yearsPast = currentYear - vintageYear - life;
  if (!(yearsPast > 0)) return 0;
  return Math.min(AGING_PENALTY_CAP, yearsPast * AGING_PENALTY_PER_YEAR);
}

// ─── Climate laws ───────────────────────────────────────────────────────────

/** Enacted level (0 to 4) of each climate law in one country. */
export interface TransitionPolicy {
  carbonPrice: number;
  coalPhaseOut: number;
  cleanPowerStandard: number;
  mineralsRecycling: number;
}

export const NO_TRANSITION_POLICY: TransitionPolicy = {
  carbonPrice: 0,
  coalPhaseOut: 0,
  cleanPowerStandard: 0,
  mineralsRecycling: 0,
};

/** Law id slugs in each book; the shell prefixes the country. */
export const TRANSITION_LAW_SLUGS = {
  carbonPrice: { modern: "carbonPrice", legacy: "carbon_price" },
  coalPhaseOut: { modern: "coalPhaseOut", legacy: "coal_phase_out" },
  cleanPowerStandard: { modern: "cleanPowerStandard", legacy: "clean_power_standard" },
  mineralsRecycling: { modern: "criticalMineralsStockpile", legacy: "critical_minerals_stockpile" },
} as const;

/**
 * Legacy laws are seven-option ladders with the strongest reform at index 0
 * and the no-statute centre at index 3. Map an option index to the matching
 * new-generation level; the options right of centre carry no mechanics.
 */
export function legacyOptionLevel(optionIndex: number | null | undefined): number {
  if (typeof optionIndex !== "number") return 0;
  return [4, 3, 2][optionIndex] ?? 0;
}

/** Charge per ton of CO2, in anchor dollars, at each carbon price level. */
export const CARBON_PRICE_PER_TON = [0, 25, 50, 100, 175] as const;

/** Carbon price that raises a fully carbon-intense recipe's input bill by 100%. */
const CARBON_PRICE_FULL_BILL = 600;

/**
 * Relative tons of CO2 per unit of output: 1 for conventional coal and gas
 * power. Clean power methods are 0. Heavy industry burns fuel for heat and
 * process emissions; lighter sectors are outside the charge.
 */
const ENERGY_INTENSITY_BY_METHOD: Readonly<Record<string, number>> = {
  standard: 1,
  fracking: 0.8,
};
const INTENSITY_BY_TYPE: Readonly<Record<string, number>> = {
  chemical_industries: 0.5,
  manufacturing: 0.35,
  extraction: 0.3,
  construction: 0.25,
};

export function carbonIntensity(operatingType: string, strategyId: string | null | undefined) {
  if (operatingType === "energy") return ENERGY_INTENSITY_BY_METHOD[strategyId ?? "standard"] ?? 0;
  return INTENSITY_BY_TYPE[operatingType] ?? 0;
}

/** Fraction the input bill rises by under the carbon price. */
export function carbonPriceInputPenalty(
  level: number,
  operatingType: string,
  strategyId: string | null | undefined
): number {
  const price = CARBON_PRICE_PER_TON[clamp(Math.round(finite(level)), 0, 4)];
  return (carbonIntensity(operatingType, strategyId) * price) / CARBON_PRICE_FULL_BILL;
}

/** Year conventional coal power must close by, per coal phase-out level. */
export const COAL_PHASE_OUT_YEAR = [null, 2045, 2040, 2035, 2030] as const;

/** Years before the deadline the closure costs start to bite. */
const COAL_RAMP_YEARS = 10;
/** Input bill rise at and after the deadline: the plant runs on borrowed time. */
export const COAL_PHASE_OUT_PENALTY_AT_DEADLINE = 0.5;

/** Fraction the input bill of conventional power rises by under a phase-out. */
export function coalPhaseOutPenalty(
  level: number,
  currentYear: number,
  operatingType: string,
  strategyId: string | null | undefined
): number {
  if (operatingType !== "energy" || (strategyId ?? "standard") !== "standard") return 0;
  const deadline = COAL_PHASE_OUT_YEAR[clamp(Math.round(finite(level)), 0, 4)];
  if (deadline == null) return 0;
  const progress = clamp((currentYear - (deadline - COAL_RAMP_YEARS)) / COAL_RAMP_YEARS, 0, 1);
  return COAL_PHASE_OUT_PENALTY_AT_DEADLINE * progress;
}

/** Share of national power that must be clean at each clean power standard level. */
export const CLEAN_POWER_TARGET = [0, 0.4, 0.6, 0.8, 0.95] as const;

/** Power methods that count as clean. */
export const CLEAN_POWER_METHODS: ReadonlySet<string> = new Set([
  "renewables",
  "nuclear",
  "smart_grid",
  "fusion",
  "fusion_commercial",
  "advanced_fission",
  "grid_storage_utility",
]);

/** Clean share of a country's power capacity (0 to 1); 1 with no power at all. */
export function cleanPowerShare(
  sectors: ReadonlyArray<{ strategyId: string | null | undefined; capacity: number }>
): number {
  let clean = 0;
  let total = 0;
  for (const sector of sectors) {
    const capacity = Math.max(0, finite(sector.capacity));
    total += capacity;
    if (CLEAN_POWER_METHODS.has(sector.strategyId ?? "standard")) clean += capacity;
  }
  return total > 0 ? clean / total : 1;
}

/** Certificate cost per point of shortfall, as a share of the input bill. */
const CLEAN_POWER_SHORTFALL_RATE = 0.6;

/**
 * Fossil power buys certificates for the gap between the standard and the
 * country's clean share. Clean methods pay nothing.
 */
export function cleanPowerStandardPenalty(
  level: number,
  cleanShare: number,
  operatingType: string,
  strategyId: string | null | undefined
): number {
  if (operatingType !== "energy" || CLEAN_POWER_METHODS.has(strategyId ?? "standard")) return 0;
  const target = CLEAN_POWER_TARGET[clamp(Math.round(finite(level)), 0, 4)];
  const shortfall = Math.max(0, target - clamp(finite(cleanShare), 0, 1));
  return CLEAN_POWER_SHORTFALL_RATE * shortfall;
}

/** Share of regional emissions each law cuts at levels 1 to 4. */
const EMISSIONS_CUT_BY_LAW: Readonly<Record<keyof TransitionPolicy, readonly number[]>> = {
  carbonPrice: [0, 0.04, 0.08, 0.14, 0.2],
  coalPhaseOut: [0, 0.02, 0.04, 0.06, 0.08],
  cleanPowerStandard: [0, 0.03, 0.06, 0.1, 0.14],
  mineralsRecycling: [0, 0, 0, 0, 0],
};
export const MAX_POLICY_EMISSIONS_CUT = 0.35;

/** Fraction of a country's measured emissions its climate laws remove. */
export function policyEmissionsCut(policy: TransitionPolicy): number {
  let cut = 0;
  for (const key of Object.keys(EMISSIONS_CUT_BY_LAW) as Array<keyof TransitionPolicy>)
    cut += EMISSIONS_CUT_BY_LAW[key][clamp(Math.round(finite(policy[key])), 0, 4)] ?? 0;
  return Math.min(MAX_POLICY_EMISSIONS_CUT, cut);
}

// ─── Resources ──────────────────────────────────────────────────────────────

/** First year prospecting cost reflects how worked out a deposit is. */
export const PROSPECT_DEPLETION_FROM_YEAR = 2035;
/** Survey cost multiplier on a fully worked-out deposit. */
const PROSPECT_DEPLETION_MAX_UPLIFT = 2;

/** Multiplier (1 to 3) on a survey's cost from cumulative extraction. */
export function prospectDepletionMultiplier(
  extractedUnits: number,
  reserveUnits: number,
  currentYear: number
): number {
  if (currentYear < PROSPECT_DEPLETION_FROM_YEAR || !(reserveUnits > 0)) return 1;
  const workedOut = clamp(finite(extractedUnits) / reserveUnits, 0, 1);
  return 1 + PROSPECT_DEPLETION_MAX_UPLIFT * workedOut;
}

/** Share of rare earth demand recycling recovers at each minerals law level. */
export const RARE_EARTH_RECOVERY_BY_LEVEL = [0, 0, 0, 0.1, 0.2] as const;

export function rareEarthRecoveryShare(level: number): number {
  return RARE_EARTH_RECOVERY_BY_LEVEL[clamp(Math.round(finite(level)), 0, 4)];
}

// ─── One sector's input bill ────────────────────────────────────────────────

/** Ceiling on the combined transition rise in a sector's input bill. */
export const MAX_TRANSITION_INPUT_PENALTY = 0.8;

export interface SectorTransitionInput {
  operatingType: string;
  strategyId: string | null | undefined;
  currentYear: number;
  policy: TransitionPolicy;
  cleanShare: number;
  vintageYear: number | null;
}

export interface SectorTransitionAdjustment {
  /** Fraction every input rate rises by. */
  inputPenalty: number;
  /** Multiplier on the rare earth input rate after recycling. */
  rareEarthMult: number;
}

export function sectorTransitionAdjustment(
  input: SectorTransitionInput
): SectorTransitionAdjustment {
  const { operatingType, strategyId, currentYear, policy } = input;
  const inputPenalty = Math.min(
    MAX_TRANSITION_INPUT_PENALTY,
    agingMaintenancePenalty(operatingType, input.vintageYear, currentYear) +
      carbonPriceInputPenalty(policy.carbonPrice, operatingType, strategyId) +
      coalPhaseOutPenalty(policy.coalPhaseOut, currentYear, operatingType, strategyId) +
      cleanPowerStandardPenalty(
        policy.cleanPowerStandard,
        input.cleanShare,
        operatingType,
        strategyId
      )
  );
  return { inputPenalty, rareEarthMult: 1 - rareEarthRecoveryShare(policy.mineralsRecycling) };
}

/** Fold an adjustment into a tech aggregate. Returns the same object when neutral. */
export function applyTransitionAdjustment(
  effects: AggregatedTechEffects,
  adjustment: SectorTransitionAdjustment,
  commodities: readonly string[]
): AggregatedTechEffects {
  const { inputPenalty, rareEarthMult } = adjustment;
  if (!(inputPenalty > 0) && rareEarthMult === 1) return effects;
  const inputRateMult: Record<string, number> = { ...effects.inputRateMult };
  if (inputPenalty > 0)
    for (const commodity of commodities)
      inputRateMult[commodity] = (inputRateMult[commodity] ?? 1) * (1 + inputPenalty);
  if (rareEarthMult !== 1)
    inputRateMult.rare_earth = (inputRateMult.rare_earth ?? 1) * rareEarthMult;
  return { ...effects, inputRateMult };
}
