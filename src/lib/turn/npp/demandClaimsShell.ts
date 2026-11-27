/**
 * Shell for rules/demandClaims: reads the build queues once per turn and
 * hands the NPP pass a claim ledger. Nothing is persisted; the ledger only
 * makes unmet demand net of capacity already ordered and of foundings made
 * earlier in the same pass.
 */
import type { Db } from "mongodb";
import { getStrategy } from "@/lib/constants/sectorStrategies";
import { bucketKey } from "@/lib/market/marketBuckets";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { deliveredFraction } from "@/lib/corporations/buildDelivery";
import type { SectorBuildOrder } from "@/lib/db/types";
import { addDemandClaim, isRegionalBookSupplyMix } from "@/lib/turn/npp/rules/demandClaims";

export interface DemandClaimCell {
  stateId: string;
  countryId: string;
  sectorType: string;
  /** Extraction recipe; ignored for every other lane. */
  strategyId?: string | null;
}

/**
 * Ledger key: the bucket for regional service lanes, country and lane for the
 * rest, and country, lane and recipe for extraction, whose gap is read per
 * recipe.
 */
export function demandClaimKeyOf(cell: DemandClaimCell): string {
  const lane = cell.sectorType;
  // A missing recipe reads as the lane default, the recipe a strategy-less mine runs.
  if (lane === "extraction")
    return `${cell.countryId}|${lane}|${getStrategy(lane, cell.strategyId ?? "").id}`;
  return isRegionalBookSupplyMix(getStrategy(lane, "").supply)
    ? bucketKey(cell.stateId, cell.sectorType)
    : `${cell.countryId}|${lane}`;
}

/**
 * Units of an order still to land at `turn`. The delivered share is already
 * running and already in the measured supply, so counting it again would
 * understate the gap.
 */
export function undeliveredUnits(
  order: Pick<
    SectorBuildOrder,
    "unitsOrdered" | "startTurn" | "onlineTurn" | "smooth" | "deliveryBaseFraction"
  >,
  turn: number
): number {
  const units = Number.isFinite(order.unitsOrdered) ? Math.max(0, order.unitsOrdered) : 0;
  if (!(units > 0)) return 0;
  if (!Number.isFinite(order.startTurn) || !Number.isFinite(order.onlineTurn)) return units;
  const delivered = deliveredFraction(order as SectorBuildOrder, turn);
  return units * (1 - Math.min(1, Math.max(0, Number.isFinite(delivered) ? delivered : 0)));
}

/**
 * Units ordered and not yet delivered, by claim key. One projected read of the
 * sectors with queued orders; `countryOfState` supplies the country for sectors
 * that do not carry one.
 */
export async function loadInFlightDemandClaims(
  db: Db,
  countryOfState: ReadonlyMap<string, string>,
  turn: number
): Promise<Map<string, number>> {
  const queued = await corporateSectorsCollection(db)
    .find(
      { "buildQueue.0": { $exists: true } },
      {
        projection: {
          stateId: 1,
          countryId: 1,
          sectorType: 1,
          strategyId: 1,
          "buildQueue.unitsOrdered": 1,
          "buildQueue.startTurn": 1,
          "buildQueue.onlineTurn": 1,
          "buildQueue.smooth": 1,
          "buildQueue.deliveryBaseFraction": 1,
          "buildQueue.strategyId": 1,
        },
      }
    )
    .toArray();
  const claims = new Map<string, number>();
  for (const sector of queued) {
    const countryId = sector.countryId ?? countryOfState.get(sector.stateId);
    if (!countryId) continue;
    for (const order of sector.buildQueue ?? []) {
      addDemandClaim(
        claims,
        demandClaimKeyOf({
          stateId: sector.stateId,
          countryId,
          sectorType: sector.sectorType,
          strategyId: order.strategyId ?? sector.strategyId ?? null,
        }),
        undeliveredUnits(order, turn)
      );
    }
  }
  return claims;
}
