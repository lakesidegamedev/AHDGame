/**
 * Seller choice for one free-choice buyer order. Instead of the cheapest price
 * level taking everything, every eligible seller sells a share that falls
 * steeply with its price and, optionally, rises with its brand and quality.
 */
import { SELLER_PRICE_PREFERENCE_EXPONENT } from "@/lib/constants/sellerPricePreference";

/** How fast a seller's share falls as its price rises above the cheapest eligible seller. */
export const DEMAND_CURVE_PRICE_SENSITIVITY = SELLER_PRICE_PREFERENCE_EXPONENT;
/** Largest swing of the preference factor either side of 1 at the extremes of brand and quality. */
export const DEMAND_CURVE_BRAND_WEIGHT = 0.25;

const NEUTRAL_SCORE = 50;

function score(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : NEUTRAL_SCORE;
}

/** Share multiplier for a company seller: 1 at brand and quality 50, within 0.75 to 1.25. */
export function sellerPreferenceFactor(
  brandLoyalty: number | null | undefined,
  averageQuality: number | null | undefined
): number {
  const brand = (score(brandLoyalty) - NEUTRAL_SCORE) / NEUTRAL_SCORE;
  const quality = (score(averageQuality) - NEUTRAL_SCORE) / NEUTRAL_SCORE;
  const factor = 1 + (DEMAND_CURVE_BRAND_WEIGHT * (brand + quality)) / 2;
  return Math.min(1 + DEMAND_CURVE_BRAND_WEIGHT, Math.max(1 - DEMAND_CURVE_BRAND_WEIGHT, factor));
}

export interface DemandCurveInput {
  priceSensitivity: number;
  /** Preference factor per selling account; an account that is absent counts as 1. */
  preferenceByAccount: Readonly<Record<string, number>>;
}

export interface DemandCurveOffer {
  id: string;
  accountId: string;
  unitPrice: number;
  /** Units the seller still has. */
  remaining: number;
}

/** Sellers sharing one price and one preference factor, who split their fill pro rata by remaining. */
export interface DemandCurveGroup {
  unitPrice: number;
  offerIds: string[];
  units: number;
}

const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Sellers the curve weighs as one: one price, one preference factor, stock pooled. */
export interface PreferenceGroup {
  unitPrice: number;
  factor: number;
  /** Units the group still has. */
  remaining: number;
}

/**
 * Units of `wanted` each group sells, in input order. Each group draws in
 * proportion to remaining x (cheapest / price) ^ sensitivity x factor; a group
 * whose share exceeds its stock sells all of it and the rest is re-spread over
 * the others until stable. Spend above `budget` scales every group down
 * together, so the buyer never spends more than it has. Null means the curve
 * cannot weigh the groups (a free or invalid cheapest price).
 */
export function allocatePreferenceGroups(input: {
  groups: readonly PreferenceGroup[];
  wanted: number;
  budget: number;
  priceSensitivity: number;
}): number[] | null {
  const { groups } = input;
  const units = groups.map(() => 0);
  const live = groups.flatMap((group, index) => (group.remaining > 0 ? [index] : []));
  if (live.length === 0 || !(input.wanted > 0) || !(input.budget > 0)) return units;
  const pMin = Math.min(...live.map((i) => groups[i].unitPrice));
  if (!(pMin > 0) || !Number.isFinite(pMin)) return null;
  const weight = groups.map((group) =>
    group.remaining > 0
      ? group.remaining * Math.pow(pMin / group.unitPrice, input.priceSensitivity) * group.factor
      : 0
  );
  if (live.some((i) => !(weight[i] > 0) || !Number.isFinite(weight[i]))) return null;
  const supply = live.reduce((sum, i) => sum + groups[i].remaining, 0);
  let free = Math.min(input.wanted, supply);
  // Water-fill: the group that runs out first at a common rate per unit of
  // weight is capped at its stock, then the rate is recomputed for the rest.
  const byCapRatio = [...live].sort(
    (a, b) =>
      groups[a].remaining / weight[a] - groups[b].remaining / weight[b] ||
      groups[a].unitPrice - groups[b].unitPrice ||
      a - b
  );
  let open = live.reduce((sum, i) => sum + weight[i], 0);
  for (let n = 0; n < byCapRatio.length; n++) {
    const i = byCapRatio[n];
    if ((free / open) * weight[i] >= groups[i].remaining) {
      units[i] = groups[i].remaining;
      free -= groups[i].remaining;
      open -= weight[i];
      continue;
    }
    const rate = free / open;
    for (const rest of byCapRatio.slice(n)) units[rest] = rate * weight[rest];
    break;
  }
  const spend = units.reduce((sum, u, i) => sum + u * groups[i].unitPrice, 0);
  // A hair under the budget, so float rounding can never spend past it.
  const fit = spend > input.budget ? (input.budget / spend) * (1 - 1e-12) : 1;
  return units.map((u, i) => Math.min(groups[i].remaining, u * fit));
}

/**
 * Splits `wanted` units across the offers. Returns null when the curve cannot
 * weigh the offers (a free or invalid cheapest price), so the caller keeps the
 * cheapest-first rule. The result is deterministic and exact: no sampling.
 */
export function allocateDemandCurve(input: {
  offers: readonly DemandCurveOffer[];
  wanted: number;
  /** Most the buyer may spend on this order. */
  budget: number;
  curve: DemandCurveInput;
}): DemandCurveGroup[] | null {
  const live = input.offers.filter((offer) => offer.remaining > 0);
  if (live.length === 0 || !(input.wanted > 0) || !(input.budget > 0)) return [];
  const byKey = new Map<string, PreferenceGroup & { ids: string[] }>();
  for (const offer of [...live].sort((a, b) => compareId(a.id, b.id))) {
    const factor = input.curve.preferenceByAccount[offer.accountId] ?? 1;
    const key = JSON.stringify([offer.unitPrice, factor]);
    const group = byKey.get(key) ?? { unitPrice: offer.unitPrice, factor, remaining: 0, ids: [] };
    group.ids.push(offer.id);
    group.remaining += offer.remaining;
    byKey.set(key, group);
  }
  const groups = [...byKey.values()].sort(
    (a, b) => a.unitPrice - b.unitPrice || a.factor - b.factor
  );
  const units = allocatePreferenceGroups({
    groups,
    wanted: input.wanted,
    budget: input.budget,
    priceSensitivity: input.curve.priceSensitivity,
  });
  if (!units) return null;
  return groups.flatMap((group, i) =>
    units[i] > 0 ? [{ unitPrice: group.unitPrice, offerIds: group.ids, units: units[i] }] : []
  );
}
