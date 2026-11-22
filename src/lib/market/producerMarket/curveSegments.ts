import { allocateDemandCurve, type DemandCurveInput } from "./demandCurveRules";
import type { ProducerOffer } from "./producerQuotes";
import type { ProducerSupplyPool } from "./supplyPoolRules";

/** One (price, preference) group of sellers that a curve allocation draws from. */
export interface CurveSegment {
  price: number;
  pool: ProducerSupplyPool;
  offers: ProducerOffer[];
  /** Units the curve assigns to this group. */
  units: number;
  /** Units the group has left when the allocation is made. */
  total: number;
}

/**
 * Splits `wanted` units of an ordinary free-choice purchase across a book's
 * pooled sellers by the preference curve. Null means the curve cannot weigh
 * these offers and the caller keeps its cheapest-first pass.
 */
export function curveSegments(input: {
  pools: readonly (readonly [number, ProducerSupplyPool])[];
  offersByPool: ReadonlyMap<ProducerSupplyPool, readonly ProducerOffer[]>;
  remaining: { get(id: string): number };
  wanted: number;
  maximumUnitPrice: number;
  budget: number;
  curve: DemandCurveInput;
}): CurveSegment[] | null {
  const rows: ProducerOffer[] = [];
  const poolOf = new Map<string, ProducerSupplyPool>();
  for (const [price, pool] of input.pools) {
    if (price > input.maximumUnitPrice) break;
    for (const offer of input.offersByPool.get(pool) ?? []) {
      rows.push(offer);
      poolOf.set(offer.id, pool);
    }
  }
  const allocation = allocateDemandCurve({
    offers: rows.map((offer) => ({
      id: offer.id,
      accountId: offer.accountId,
      unitPrice: offer.unitPrice,
      remaining: input.remaining.get(offer.id),
    })),
    wanted: input.wanted,
    budget: input.budget,
    curve: input.curve,
  });
  if (!allocation) return null;
  const byId = new Map(rows.map((offer) => [offer.id, offer]));
  return allocation.flatMap((group) => {
    const offers = group.offerIds.map((id) => byId.get(id)!);
    const total = offers.reduce((sum, offer) => sum + input.remaining.get(offer.id), 0);
    return total > 0 && group.units > 0
      ? [
          {
            price: group.unitPrice,
            pool: poolOf.get(offers[0].id)!,
            offers,
            units: Math.min(group.units, total),
            total,
          },
        ]
      : [];
  });
}
