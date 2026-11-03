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
import type { OperatingSectorType } from "@/lib/constants/corporationsClient";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import type { CommodityPrice, CorporateSector, SectorBuildOrder, State } from "@/lib/db/types";
import { deliveredFraction } from "@/lib/corporations/buildDelivery";
import { sectorDemandGapUnits } from "@/lib/market/sectorDemandGap";
import { commodityDemandGap, isStateScopedCommodity } from "@/lib/market/commodityMarketScope";
import { commodityMarketScope } from "@/lib/market/rules/commodityMarketScope";
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

/**
 * True when every output of a lane's mix sells into the shared national book,
 * so its room to build is one country-wide figure rather than a per-state one.
 * The expansion picker and the state board both key on this.
 */
export function supplyMixSharesCountryDemand(
  supplyMix: Partial<Record<CommodityType, number>>
): boolean {
  const outputs = Object.entries(supplyMix).filter(([, rate]) => (rate ?? 0) > 0);
  return (
    outputs.length > 0 &&
    outputs.every(([commodity]) => commodityMarketScope(commodity as CommodityType) === "reachable")
  );
}

type LaneIdentity = Pick<CorporateSector, "sectorType" | "industryModel" | "mediaDiscriminator">;

/** Sectors with capacity on order in the given countries, optionally one lane only. */
async function loadBuildingSectors(
  db: Db,
  countryIds: readonly string[],
  lane: LaneIdentity | null
): Promise<{ countryId: string; sector: LaneIdentity & Pick<CorporateSector, "buildQueue"> }[]> {
  const uniqueCountries = [...new Set(countryIds)];
  if (uniqueCountries.length === 0) return [];
  const states = await db
    .collection<State>("states")
    .find(
      { countryId: { $in: uniqueCountries as State["countryId"][] } },
      { projection: { _id: 1, countryId: 1 } }
    )
    .toArray();
  const countryByState = new Map(states.map((s) => [s._id, s.countryId as string]));
  if (countryByState.size === 0) return [];
  const building = await db
    .collection<CorporateSector>("corporateSectors")
    .find(
      {
        stateId: { $in: [...countryByState.keys()] },
        ...(lane
          ? {
              sectorType: lane.sectorType,
              industryModel: lane.industryModel ?? null,
              mediaDiscriminator: lane.mediaDiscriminator ?? null,
            }
          : {}),
        "buildQueue.0": { $exists: true },
      },
      {
        projection: {
          stateId: 1,
          sectorType: 1,
          industryModel: 1,
          mediaDiscriminator: 1,
          buildQueue: 1,
        },
      }
    )
    .toArray();
  return building.flatMap((sector) => {
    const countryId = countryByState.get(sector.stateId);
    return countryId ? [{ countryId, sector }] : [];
  });
}

/**
 * Capacity still under construction in one lane across each country, so a
 * country-shared room to build nets off every plant being built for that book,
 * not only the ones in the state being viewed.
 */
export async function loadCountryQueuedUnits(
  db: Db,
  lane: LaneIdentity,
  countryIds: readonly string[],
  turn: number
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const { countryId, sector } of await loadBuildingSectors(db, countryIds, lane)) {
    const queued = queuedUndeliveredUnits(sector.buildQueue, turn);
    if (queued > 0) result.set(countryId, (result.get(countryId) ?? 0) + queued);
  }
  return result;
}

/** {@link loadCountryQueuedUnits} for every lane of one country, keyed by operating lane. */
export async function loadCountryQueuedUnitsByLane(
  db: Db,
  countryId: string,
  turn: number
): Promise<Map<OperatingSectorType, number>> {
  const result = new Map<OperatingSectorType, number>();
  for (const { sector } of await loadBuildingSectors(db, [countryId], null)) {
    const queued = queuedUndeliveredUnits(sector.buildQueue, turn);
    if (queued <= 0) continue;
    const lane = getOperatingSectorType(
      sector.sectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    );
    result.set(lane, (result.get(lane) ?? 0) + queued);
  }
  return result;
}
