/**
 * Household demand curves (issue #5448, stage `producerDemandCurveStage`).
 *
 * Without this a household order is one budget at one ceiling price, and the
 * book fills it by units: `budget / ceiling`. A cheaper seller sells the same
 * units at a lower price and the household keeps the change, so more supply in
 * a market could never sell more, and every good took a fixed share of income
 * however rich the household was or how its prices moved.
 *
 * Two changes, both pure:
 *
 * - **Price.** Each good's order becomes a short ladder. The top step is the
 *   old order, unchanged. Each lower step adds the extra units a household
 *   buys at that lower price, `Q(p) = Q0 * (p / p0) ^ -elasticity`. A lower step
 *   only fills when a seller asks that little, and only what it buys counts as
 *   demand, so a cheap step never shows up as a shortage at a higher price.
 * - **Income.** Basket weights shift with the household's income against the
 *   world reference, `w * incomeIndex ^ (incomeElasticity - 1)`, renormalised so
 *   total spending is unchanged: richer households spend a larger share on
 *   discretionary goods and a smaller one on essentials.
 *
 * Elasticities are long-run estimates in the usual empirical ranges, kept low
 * for essentials and above one for discretionary goods. Tunable; balance
 * changes need a worldsim report.
 */
import type { CommodityType } from "@/lib/constants/commodities";

export interface DemandElasticity {
  /** How much quantity falls as price rises: Q ~ p^-price. */
  price: number;
  /** How a good's budget share moves with income: share ~ income^(income - 1). */
  income: number;
}

export const DEMAND_ELASTICITY: Partial<Record<CommodityType, DemandElasticity>> = {
  food: { price: 0.25, income: 0.5 },
  energy: { price: 0.3, income: 0.6 },
  pharmaceuticals: { price: 0.3, income: 0.9 },
  healthcare_services: { price: 0.35, income: 1.1 },
  real_estate_services: { price: 0.4, income: 0.9 },
  freight: { price: 0.5, income: 1.0 },
  chemicals: { price: 0.6, income: 1.0 },
  network_services: { price: 0.6, income: 1.1 },
  plastics: { price: 0.7, income: 1.0 },
  retail: { price: 0.8, income: 1.0 },
  building_materials: { price: 0.8, income: 1.2 },
  financial_services: { price: 0.9, income: 1.4 },
  software: { price: 1.0, income: 1.3 },
  electronics: { price: 1.2, income: 1.4 },
  consulting_services: { price: 1.2, income: 1.5 },
  vehicles: { price: 1.3, income: 1.5 },
};

const NEUTRAL: DemandElasticity = { price: 0, income: 1 };

export function demandElasticity(commodity: string): DemandElasticity {
  return DEMAND_ELASTICITY[commodity as CommodityType] ?? NEUTRAL;
}

/** Price of each ladder step as a share of the top step's ceiling. */
export const DEMAND_CURVE_STEPS = [1, 0.85, 0.7, 0.55] as const;

/**
 * Extra spending the lower steps may reserve, as a share of the good's own
 * budget. Bounds how far cheap prices can pull a household into its savings.
 */
export const DEMAND_CURVE_MAX_EXTRA_SPEND = 0.5;

/** The income index is clamped so a degenerate reading cannot zero a good. */
export const INCOME_INDEX_MIN = 0.25;
export const INCOME_INDEX_MAX = 4;

export interface DemandStep {
  /** 0 is the top step, the order the market always placed. */
  step: number;
  maximumUnitPrice: number;
  units: number;
  maximumSpend: number;
}

function positive(x: number): number {
  return Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * One good's ladder. The top step keeps today's ceiling and units; each lower
 * step carries only the extra units bought at its lower price.
 */
export function demandSteps(input: {
  budget: number;
  maximumUnitPrice: number;
  priceElasticity: number;
}): DemandStep[] {
  const budget = positive(input.budget);
  const top = positive(input.maximumUnitPrice);
  if (budget <= 0 || top <= 0) return [];
  const baseUnits = budget / top;
  const steps: DemandStep[] = [
    { step: 0, maximumUnitPrice: top, units: baseUnits, maximumSpend: budget },
  ];
  const elasticity = positive(input.priceElasticity);
  if (elasticity <= 0) return steps;
  let previousUnits = baseUnits;
  let extraSpend = 0;
  const extraCap = budget * DEMAND_CURVE_MAX_EXTRA_SPEND;
  for (let k = 1; k < DEMAND_CURVE_STEPS.length; k++) {
    const share = DEMAND_CURVE_STEPS[k]!;
    const price = top * share;
    const unitsAtPrice = baseUnits * Math.pow(share, -elasticity);
    let units = unitsAtPrice - previousUnits;
    previousUnits = unitsAtPrice;
    if (!(units > 0)) continue;
    let spend = units * price;
    if (extraSpend + spend > extraCap) {
      spend = Math.max(0, extraCap - extraSpend);
      units = spend / price;
    }
    if (!(units > 0)) break;
    extraSpend += spend;
    steps.push({ step: k, maximumUnitPrice: price, units, maximumSpend: spend });
  }
  return steps;
}

/** Prime rate (percent) at which households spend the base share of their cash. */
export const NEUTRAL_PRIME_RATE_PCT = 5;
/** Change in the spent share per percentage point of prime rate above neutral. */
export const SPEND_RATE_SENSITIVITY = 0.01;
export const SPEND_FRACTION_MIN = 0.75;
export const SPEND_FRACTION_MAX = 0.97;

/**
 * Share of its cash a household spends this turn, given the country's prime
 * rate: dearer money means more saving, cheaper money more spending. A missing
 * rate keeps the base share.
 */
export function householdSpendFraction(base: number, primeRatePct: number | undefined): number {
  if (typeof primeRatePct !== "number" || !Number.isFinite(primeRatePct)) return base;
  const shifted = base - SPEND_RATE_SENSITIVITY * (primeRatePct - NEUTRAL_PRIME_RATE_PCT);
  return Math.min(SPEND_FRACTION_MAX, Math.max(SPEND_FRACTION_MIN, shifted));
}

/**
 * Each state's household income against the median across the states given:
 * 1 is a median-income state, 2 earns twice the median. Incomes must share one
 * currency. States with no usable income are left out (they read as 1).
 */
export function incomeIndexByState(
  rows: readonly { stateId: string; income: number }[]
): Map<string, number> {
  const usable = rows.filter((r) => Number.isFinite(r.income) && r.income > 0);
  const out = new Map<string, number>();
  if (usable.length === 0) return out;
  const sorted = usable.map((r) => r.income).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  if (!(median > 0)) return out;
  for (const r of usable) out.set(r.stateId, r.income / median);
  return out;
}

/**
 * Basket weights for a household at `incomeIndex` (its income over the world
 * reference). Renormalised to the same total, so only the mix moves.
 */
export function incomeAdjustedWeights<T extends { commodity: string; weight: number }>(
  products: readonly T[],
  incomeIndex: number
): T[] {
  const index = Number.isFinite(incomeIndex)
    ? Math.min(INCOME_INDEX_MAX, Math.max(INCOME_INDEX_MIN, incomeIndex))
    : 1;
  if (index === 1) return products.map((p) => ({ ...p }));
  const total = products.reduce((n, p) => n + positive(p.weight), 0);
  if (!(total > 0)) return products.map((p) => ({ ...p }));
  const shifted = products.map((p) => ({
    product: p,
    weight: positive(p.weight) * Math.pow(index, demandElasticity(p.commodity).income - 1),
  }));
  const shiftedTotal = shifted.reduce((n, p) => n + p.weight, 0);
  if (!(shiftedTotal > 0)) return products.map((p) => ({ ...p }));
  return shifted.map(({ product, weight }) => ({
    ...product,
    weight: (weight * total) / shiftedTotal,
  }));
}
