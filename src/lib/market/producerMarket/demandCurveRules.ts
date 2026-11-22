/**
 * Seller choice for one free-choice buyer order. Instead of the cheapest price
 * level taking everything, every eligible seller sells a share that falls
 * steeply with its price and rises with its brand and quality.
 */

/** How fast a seller's share falls as its price rises above the cheapest eligible seller. */
export const DEMAND_CURVE_PRICE_SENSITIVITY = 4;
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
  const pMin = Math.min(...live.map((offer) => offer.unitPrice));
  if (!(pMin > 0) || !Number.isFinite(pMin)) return null;

  type Group = { unitPrice: number; ids: string[]; remaining: number; weight: number };
  const byKey = new Map<string, Group & { factor: number }>();
  for (const offer of [...live].sort((a, b) => compareId(a.id, b.id))) {
    const factor = input.curve.preferenceByAccount[offer.accountId] ?? 1;
    const key = JSON.stringify([offer.unitPrice, factor]);
    const group = byKey.get(key) ?? {
      unitPrice: offer.unitPrice,
      ids: [],
      remaining: 0,
      weight: 0,
      factor,
    };
    group.ids.push(offer.id);
    group.remaining += offer.remaining;
    byKey.set(key, group);
  }
  const groups = [...byKey.values()].sort(
    (a, b) => a.unitPrice - b.unitPrice || a.factor - b.factor
  );
  for (const group of groups)
    group.weight =
      group.remaining *
      Math.pow(pMin / group.unitPrice, input.curve.priceSensitivity) *
      group.factor;
  if (groups.some((group) => !(group.weight > 0) || !Number.isFinite(group.weight))) return null;

  const supply = groups.reduce((sum, group) => sum + group.remaining, 0);
  const target = Math.min(input.wanted, supply);
  // A group whose offer is smaller than its share per unit of weight is capped
  // at what it has; the rest of the target is re-spread over the others.
  const byCapRatio = [...groups].sort(
    (a, b) => a.remaining / a.weight - b.remaining / b.weight || a.unitPrice - b.unitPrice
  );
  const taken = new Map<Group, number>();
  let free = target;
  let weight = groups.reduce((sum, group) => sum + group.weight, 0);
  for (const group of byCapRatio) {
    if ((free / weight) * group.weight >= group.remaining) {
      taken.set(group, group.remaining);
      free -= group.remaining;
      weight -= group.weight;
    } else {
      const lambda = free / weight;
      for (const rest of byCapRatio) if (!taken.has(rest)) taken.set(rest, lambda * rest.weight);
      break;
    }
  }
  let spend = 0;
  for (const [group, units] of taken) spend += units * group.unitPrice;
  const fit = spend > input.budget ? input.budget / spend : 1;
  return groups.flatMap((group) => {
    const units = Math.min(group.remaining, (taken.get(group) ?? 0) * fit);
    return units > 0 ? [{ unitPrice: group.unitPrice, offerIds: group.ids, units }] : [];
  });
}
