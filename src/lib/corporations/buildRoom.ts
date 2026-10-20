/**
 * Room to build: demand buyers in a market are not getting, in capacity units
 * of a lane's output mix, less capacity already under construction for it.
 *
 * Shared by the build planner and the state economy board so both show the
 * same figure. It is physical demand, never the legacy unowned market-share
 * pool: a market can be short with an empty pool. Supply is what buyers
 * received (imports included) when freight settlement records it. On a funded
 * world the price documents carry the settled market's supply and demand, so
 * this reads real buyers.
 */
import type { Db } from "mongodb";
import type { CommodityType } from "@/lib/constants/commodities";
import type { CommodityPrice, SectorBuildOrder } from "@/lib/db/types";
import { deliveredFraction } from "@/lib/corporations/buildDelivery";
import { sectorDemandGapUnits } from "@/lib/market/sectorDemandGap";
import { commodityDemandGap, isStateScopedCommodity } from "@/lib/market/commodityMarketScope";
import { latentTopUpForCountry, latentTopUpForState } from "@/lib/market/latentShortageSignal";
import { bookFor, loadReachableBooks } from "@/lib/trade/queries/loadReachableBooks";

type Balance = { supply: number; demand: number };

export interface BuildRoomContext {
  /** Unmet demand for an output mix in a state, in capacity units per day. */
  demandGapUnits(
    supplyMix: Partial<Record<CommodityType, number>>,
    stateId: string,
    countryId: string
  ): number;
}

export async function loadBuildRoomContext(db: Db): Promise<BuildRoomContext> {
  const [reachableBooks, priceDocs] = await Promise.all([
    loadReachableBooks(db),
    db
      .collection<CommodityPrice>("commodityPrices")
      .find(
        {},
        {
          projection: {
            commodity: 1,
            globalSupply: 1,
            globalDemand: 1,
            nationalDemand: 1,
            stateSupply: 1,
            stateDeliveredSupply: 1,
            stateDemand: 1,
            demandTruncatedUnits: 1,
          },
        }
      )
      .toArray(),
  ]);
  const globalBalances = new Map<CommodityType, Balance>(
    priceDocs.map((p) => [
      p.commodity,
      { supply: p.globalSupply ?? 0, demand: p.globalDemand ?? 0 },
    ])
  );
  const stateBalances = new Map<string, Map<CommodityType, Balance>>();
  for (const price of priceDocs)
    for (const stateId of new Set([
      ...Object.keys(price.stateSupply ?? {}),
      ...Object.keys(price.stateDemand ?? {}),
    ])) {
      const byCommodity = stateBalances.get(stateId) ?? new Map<CommodityType, Balance>();
      byCommodity.set(price.commodity, {
        supply: price.stateDeliveredSupply?.[stateId] ?? price.stateSupply?.[stateId] ?? 0,
        demand: price.stateDemand?.[stateId] ?? 0,
      });
      stateBalances.set(stateId, byCommodity);
    }
  const priceDocByCommodity = new Map(priceDocs.map((p) => [p.commodity, p]));
  return {
    demandGapUnits(supplyMix, stateId, countryId) {
      return sectorDemandGapUnits(supplyMix, (commodity) => {
        // Restore the cap-hidden demand: state share for local outputs,
        // country share for reachable ones (demand audit step 1).
        const doc = priceDocByCommodity.get(commodity);
        const latentDemandTopUp = doc
          ? isStateScopedCommodity(commodity)
            ? latentTopUpForState(doc, stateId)
            : latentTopUpForCountry(doc, countryId)
          : 0;
        return commodityDemandGap({
          commodity,
          stateBalance: stateBalances.get(stateId)?.get(commodity),
          reachableBook: bookFor(reachableBooks, countryId, commodity),
          globalBalance: globalBalances.get(commodity),
          latentDemandTopUp,
        });
      });
    },
  };
}

/** Capacity units an order book still has to deliver after `turn`. */
export function queuedUndeliveredUnits(
  queue: readonly SectorBuildOrder[] | null | undefined,
  turn: number
): number {
  return (queue ?? []).reduce(
    (sum, order) =>
      sum +
      (Number.isFinite(order.unitsOrdered) && order.unitsOrdered > 0
        ? order.unitsOrdered * (1 - deliveredFraction(order, turn))
        : 0),
    0
  );
}

/** Room to build: unmet demand less capacity already under construction, never negative. */
export function buildRoomUnits(demandGapUnits: number, queuedUnits: number): number {
  return Math.max(0, Math.round(demandGapUnits - Math.max(0, queuedUnits)));
}
