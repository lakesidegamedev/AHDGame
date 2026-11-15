/**
 * Shell for rules/demandClaims: reads the build queues once per turn and
 * hands the NPP pass a claim ledger. Nothing is persisted; the ledger only
 * makes unmet demand net of capacity already ordered and of foundings made
 * earlier in the same pass.
 */
import type { Db } from "mongodb";
import { getOperatingSectorType, getStrategy } from "@/lib/constants/sectorStrategies";
import { bucketKey } from "@/lib/market/marketBuckets";
import { corporateSectorsCollection } from "@/lib/db/repositories/corporateSectors";
import { addDemandClaim, isStateServiceSupplyMix } from "@/lib/turn/npp/rules/demandClaims";

export interface DemandClaimCell {
  stateId: string;
  countryId: string;
  sectorType: string;
  industryModel?: string | null;
  mediaDiscriminator?: string | null;
}

/** Ledger key: the bucket for local service lanes, country and lane for the rest. */
export function demandClaimKeyOf(cell: DemandClaimCell): string {
  const lane = getOperatingSectorType(cell.sectorType, cell.industryModel, cell.mediaDiscriminator);
  return isStateServiceSupplyMix(getStrategy(lane, "").supply)
    ? bucketKey(cell.stateId, cell.sectorType, cell.industryModel, cell.mediaDiscriminator)
    : `${cell.countryId}|${lane}`;
}

/**
 * Units already ordered and still in a build queue, by claim key. One
 * projected read of the sectors with queued orders; `countryOfState` supplies
 * the country for sectors that do not carry one.
 */
export async function loadInFlightDemandClaims(
  db: Db,
  countryOfState: ReadonlyMap<string, string>
): Promise<Map<string, number>> {
  const queued = await corporateSectorsCollection(db)
    .find(
      { "buildQueue.0": { $exists: true } },
      {
        projection: {
          stateId: 1,
          countryId: 1,
          sectorType: 1,
          industryModel: 1,
          mediaDiscriminator: 1,
          "buildQueue.unitsOrdered": 1,
        },
      }
    )
    .toArray();
  const claims = new Map<string, number>();
  for (const sector of queued) {
    const countryId = sector.countryId ?? countryOfState.get(sector.stateId);
    if (!countryId) continue;
    const units = (sector.buildQueue ?? []).reduce(
      (sum, order) =>
        sum + (Number.isFinite(order.unitsOrdered) ? Math.max(0, order.unitsOrdered) : 0),
      0
    );
    addDemandClaim(claims, demandClaimKeyOf({ ...sector, countryId }), units);
  }
  return claims;
}
