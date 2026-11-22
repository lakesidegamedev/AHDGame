import { allocatePreferenceGroups, type DemandCurveInput } from "./demandCurveRules";
import type { ProducerOffer } from "./producerQuotes";
import type { ProducerSupplyPool } from "./supplyPoolRules";

/** One (price, preference) group of sellers that a curve allocation draws from. */
export interface CurveSegment {
  price: number;
  pool: ProducerSupplyPool;
  /** Live offers in the group; for a whole pool, the pool's offers. */
  offers: readonly ProducerOffer[];
  /**
   * The group is every live offer in its price pool, so a plain pooled draw
   * on the pool sells exactly these offers pro rata and the fill needs no
   * supplier list.
   */
  wholePool: boolean;
  /** Units the curve assigns to this group. */
  units: number;
  /** Units the group has left when the allocation is made. */
  total: number;
}

/**
 * Splits `wanted` units of an ordinary free-choice purchase across a book's
 * pooled sellers by the preference curve. Null means the curve has nothing to
 * weigh (fewer than two seller groups with stock) or cannot weigh these offers,
 * and the caller keeps its cheapest-first pass, which then gives the same
 * result as today.
 */
export function curveSegments(input: {
  pools: readonly (readonly [number, ProducerSupplyPool])[];
  offersByPool: ReadonlyMap<ProducerSupplyPool, readonly ProducerOffer[]>;
  remaining: { get(id: string): number };
  wanted: number;
  maximumUnitPrice: number;
  budget: number;
  curve: DemandCurveInput;
  /** Route filter: only offers some buyer may draw on. Absent = every offer. */
  reachable?: (offer: ProducerOffer) => boolean;
}): CurveSegment[] | null {
  if (!(input.wanted > 0) || !(input.budget > 0)) return null;
  const factors = input.curve.preferenceByAccount;
  const perOffer = input.reachable !== undefined || Object.keys(factors).length > 0;
  type Group = Omit<CurveSegment, "units" | "total" | "offers"> & {
    offers: ProducerOffer[] | readonly ProducerOffer[];
    factor: number;
    remaining: number;
  };
  const groups: Group[] = [];
  for (const [price, pool] of input.pools) {
    if (price > input.maximumUnitPrice) break;
    const offers = input.offersByPool.get(pool) ?? [];
    if (!perOffer) {
      // Every seller weighs the same at one price: the pool is the group.
      if (pool.total > 0)
        groups.push({ price, pool, offers, wholePool: true, factor: 1, remaining: pool.total });
      continue;
    }
    const byFactor = new Map<number, Group & { offers: ProducerOffer[] }>();
    let live = 0;
    for (const offer of offers) {
      const units = input.remaining.get(offer.id);
      if (!(units > 0)) continue;
      live++;
      if (input.reachable && !input.reachable(offer)) continue;
      const factor = factors[offer.accountId] ?? 1;
      const group = byFactor.get(factor) ?? {
        price,
        pool,
        offers: [],
        wholePool: false,
        factor,
        remaining: 0,
      };
      group.offers.push(offer);
      group.remaining += units;
      byFactor.set(factor, group);
    }
    for (const group of [...byFactor.values()].sort((a, b) => a.factor - b.factor)) {
      group.wholePool = group.offers.length === live;
      groups.push(group);
    }
  }
  if (groups.length < 2) return null;
  const units = allocatePreferenceGroups({
    groups: groups.map((group) => ({
      unitPrice: group.price,
      factor: group.factor,
      remaining: group.remaining,
    })),
    wanted: input.wanted,
    budget: input.budget,
    priceSensitivity: input.curve.priceSensitivity,
  });
  if (!units) return null;
  return groups.flatMap((group, i) =>
    units[i] > 0
      ? [
          {
            price: group.price,
            pool: group.pool,
            offers: group.offers,
            wholePool: group.wholePool,
            units: Math.min(units[i], group.remaining),
            total: group.remaining,
          },
        ]
      : []
  );
}
