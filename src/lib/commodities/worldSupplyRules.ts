/**
 * One world supply figure for every market screen: the traded market, the sum
 * of the funded country books, background economy included. The stored price
 * row's figure is what the price phase reads, and it leaves out the
 * background economy's sales; it travels as the pricing input and is never
 * shown as world supply. Pure.
 */

interface Totals {
  supply: number;
  demand: number;
}

export interface WorldSupplyFigures {
  /** World supply shown on every screen. */
  globalSupply: number;
  /** World demand shown on every screen. */
  globalDemand: number;
  /** Supply the price reads (stored), present only beside a funded world market. */
  pricingSupply?: number;
  /** Demand the price reads (stored), present only beside a funded world market. */
  pricingDemand?: number;
}

export function worldSupplyFigures(
  stored: Totals,
  world: Totals | null | undefined
): WorldSupplyFigures {
  if (!world) return { globalSupply: stored.supply, globalDemand: stored.demand };
  return {
    globalSupply: world.supply,
    globalDemand: world.demand,
    pricingSupply: stored.supply,
    pricingDemand: stored.demand,
  };
}

interface PooledFlows {
  clearedUnits: number;
  clearedUnitsPooled: number;
  unmetDemandUnits: number;
  unmetDemandUnitsPooled: number;
  surplusUnits: number;
  surplusUnitsPooled: number;
}

/**
 * The pooled world strip ("could sell", "orders above supply", "supply above
 * orders") from the same world totals the page shows, so it cannot carry a
 * second world supply figure. Stock and cover are kept as stored.
 */
export function flowsFromWorldMarket<F extends PooledFlows>(flows: F, world: Totals): F {
  const cleared = Math.min(world.supply, world.demand);
  const unmet = Math.max(0, world.demand - world.supply);
  const surplus = Math.max(0, world.supply - world.demand);
  return {
    ...flows,
    clearedUnits: cleared,
    clearedUnitsPooled: cleared,
    unmetDemandUnits: unmet,
    unmetDemandUnitsPooled: unmet,
    surplusUnits: surplus,
    surplusUnitsPooled: surplus,
  };
}
