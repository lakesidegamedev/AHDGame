import type { CommodityType } from "@/lib/constants/commodities";
import type { FreightClass } from "./freightClass";

type Balance = { supply: number; demand: number };

/**
 * Book the sourcing pass's price-tolerant haul TEU as freight demand.
 *
 * Includes both TEU that moved and final, price-tolerant requests refused by
 * the origin state's capacity. Enters all three levels the market reads before
 * clearing: byState (local seller's book and stored stateDemand), byCountry
 * (aggregated before sourcing, so it needs its own add), and global. Freight is
 * never itself shipped, so this cannot feed back into the same pass. Higher
 * freight prices damp the next turn's request through shipping cost. Money
 * still does not move; shipping stays unbilled to buyers.
 */
export function applyFreightHaulDemand(
  freightDemandTeuByState: ReadonlyMap<string, Record<FreightClass, number>>,
  balances: {
    global: Map<CommodityType, Balance>;
    byState: Map<string, Map<CommodityType, Balance>>;
    byCountry: Map<string, Map<CommodityType, Balance>>;
    stateToCountry: ReadonlyMap<string, string>;
  }
): void {
  const { global, byState, byCountry, stateToCountry } = balances;
  const globalBal = global.get("freight");
  for (const [stateId, demand] of freightDemandTeuByState) {
    const haulTeu = demand.bulk + demand.special;
    if (haulTeu <= 0) continue;
    const stateBal = byState.get(stateId)?.get("freight");
    if (stateBal) stateBal.demand += haulTeu;
    if (globalBal) globalBal.demand += haulTeu;
    const countryId = stateToCountry.get(stateId);
    const countryBal = countryId ? byCountry.get(countryId)?.get("freight") : undefined;
    if (countryBal) countryBal.demand += haulTeu;
  }
}

// Kept as a compatibility import path for callers that predate the map API
// contract moving into `types.ts`.
export type { FreightDemandEntry } from "./types";
