/**
 * Production-method sunsets.
 *
 * A method with `sunsetDecade` retires from that tier on: closed to new sites
 * and retools, existing sites keep running but pay a rising operating penalty,
 * and a retool to a named `successorIds` entry costs less than a normal retool.
 * Nothing is deleted; an old plant can run on, paying more each year, or convert.
 */
import type { SectorStrategy } from "../sectorStrategyTypes";
import { SECTOR_STRATEGIES } from "../sectorStrategyDefinitions";
import { COMMODITY_TYPES } from "../commodities";
import type { OperatingSectorType } from "../corporations";
import type { AggregatedTechEffects } from "./effects";
import { getDecadeById } from "./decades";

/**
 * Extra input use per year a site keeps running a sunset method, counted from
 * the sunset tier's first year (that year already pays one step). 1.5% a year
 * makes the old method visibly dearer each year without bankrupting a plant
 * that cannot afford to convert straight away.
 */
export const SUNSET_PENALTY_PER_YEAR = 0.015;

/**
 * Ceiling on the sunset penalty: inputs at most 15% above the recipe. Reached
 * ten years after the sunset, by which point the method is a clear loser
 * against its successors but still runs.
 */
export const SUNSET_PENALTY_CAP = 0.15;

/**
 * Share of the normal retool fee waived when a site on a sunset method
 * converts to one of its named successors. The fee is 25% of daily revenue
 * (STRATEGY_RETOOL_COST_FRACTION), so a conversion costs 10%.
 */
export const SUNSET_CONVERSION_DISCOUNT = 0.6;

type SunsetFields = Pick<SectorStrategy, "sunsetDecade" | "successorIds">;

/** First calendar year of the method's sunset tier, or null when it never sunsets. */
export function sunsetStartYear(strategy: SunsetFields): number | null {
  if (!strategy.sunsetDecade) return null;
  return getDecadeById(strategy.sunsetDecade)?.startYear ?? null;
}

/** True once the world has reached the method's sunset tier. */
export function isStrategySunset(strategy: SunsetFields, currentYear: number): boolean {
  const start = sunsetStartYear(strategy);
  return start != null && currentYear >= start;
}

/**
 * Operating penalty for a site running `strategy` at `currentYear`: the
 * fraction its inputs rise by. 0 before the sunset and for methods that never
 * sunset; grows by SUNSET_PENALTY_PER_YEAR to SUNSET_PENALTY_CAP.
 */
export function sunsetOperatingPenalty(strategy: SunsetFields, currentYear: number): number {
  const start = sunsetStartYear(strategy);
  if (start == null || currentYear < start) return 0;
  const yearsRun = Math.floor(currentYear - start) + 1;
  return Math.min(SUNSET_PENALTY_CAP, yearsRun * SUNSET_PENALTY_PER_YEAR);
}

/**
 * Fold a sunset penalty into a sector's tech aggregate as dearer inputs.
 * Every input-rate multiplier rises by the penalty, so the recipe's whole
 * input bill grows while output is unchanged. Returns the same object when
 * there is no penalty.
 */
export function applySunsetPenalty(
  effects: AggregatedTechEffects,
  penalty: number,
  commodities: readonly string[]
): AggregatedTechEffects {
  if (!(penalty > 0)) return effects;
  const inputRateMult: Record<string, number> = { ...effects.inputRateMult };
  for (const commodity of commodities) {
    inputRateMult[commodity] = (inputRateMult[commodity] ?? 1) * (1 + penalty);
  }
  return { ...effects, inputRateMult };
}

/** True when moving `from` to `to` is a sunset conversion that earns the discount. */
export function isSunsetConversion(
  from: SunsetFields | undefined,
  toStrategyId: string,
  currentYear: number
): boolean {
  if (!from || !isStrategySunset(from, currentYear)) return false;
  return (from.successorIds ?? []).includes(toStrategyId);
}

/** Multiplier on the retool fee: discounted for a sunset conversion, otherwise 1. */
export function sunsetRetoolCostMultiplier(
  from: SunsetFields | undefined,
  toStrategyId: string,
  currentYear: number
): number {
  return isSunsetConversion(from, toStrategyId, currentYear) ? 1 - SUNSET_CONVERSION_DISCOUNT : 1;
}

/**
 * The method a site should convert to, or run from founding, when `current`
 * is sunset: the first named successor `isAvailable` admits. Null when the
 * method is not sunset or no successor is open to this owner.
 */
export function sunsetSuccessorFor<S extends SunsetFields & { id: string }>(
  current: S | undefined,
  strategies: readonly S[],
  currentYear: number,
  isAvailable: (strategy: S) => boolean
): S | null {
  if (!current || !isStrategySunset(current, currentYear)) return null;
  for (const id of current.successorIds ?? []) {
    const candidate = strategies.find((s) => s.id === id);
    if (candidate && isAvailable(candidate)) return candidate;
  }
  return null;
}

/**
 * A sector's tech aggregate with the sunset penalty of the method it runs
 * folded in. The turn calls this wherever it reads tech effects for plant
 * inputs, so the penalty reaches the input bill and the world ledger alike.
 * A sector mid-retool runs its destination method, so converting ends the
 * penalty at once.
 */
export function withSunsetPenalty(
  effects: AggregatedTechEffects,
  operatingType: string,
  strategyId: string | null | undefined,
  currentYear: number | null | undefined
): AggregatedTechEffects {
  if (currentYear == null) return effects;
  const strategies = SECTOR_STRATEGIES[operatingType as OperatingSectorType] ?? [];
  const strategy = strategies.find((s) => s.id === (strategyId ?? "standard"));
  if (!strategy) return effects;
  return applySunsetPenalty(
    effects,
    sunsetOperatingPenalty(strategy, currentYear),
    COMMODITY_TYPES
  );
}
