/**
 * Shell for rules/stateServiceHeadroom: reads the build queues of local
 * service sectors once and lifts the NPP pass's in-memory pool rows. The
 * persisted pool is never written here.
 */
import type { Db } from "mongodb";
import type { CorporateSector } from "@/lib/db/types";
import type { UnownedSector } from "@/lib/db/types/unownedSector";
import { getOperatingSectorType, getStrategy } from "@/lib/constants/sectorStrategies";
import { unownedHeadroomUnitsOf } from "@/lib/corporations/marketShare";
import { bucketKey } from "@/lib/nationalization/stateControlledBuckets";
import type { PlacementSignals } from "@/lib/turn/npp/marketSignals";
import {
  isStateServiceSupplyMix,
  stateServiceHeadroomUnits,
} from "@/lib/turn/npp/rules/stateServiceHeadroom";

/**
 * Raise each local service pool row the cohort ranks to the state book's unmet
 * demand net of in-flight builds. Mutates the shared row objects, so founding
 * candidacy, founding size, autopilot growth and in-pass draws all read the
 * same figure. One projected read of the queued sectors.
 */
export async function liftStateServiceHeadroom(
  db: Db,
  unownedByCountry: ReadonlyMap<string, UnownedSector[]>,
  placementSignals: PlacementSignals,
  eraUnitScale: number
): Promise<number> {
  const unmetOf = placementSignals.unmetDemandUnitsOf;
  if (!unmetOf) return 0;
  const rows: UnownedSector[] = [];
  for (const countryRows of unownedByCountry.values()) {
    for (const row of countryRows) {
      const lane = getOperatingSectorType(
        row.sectorType,
        row.industryModel,
        row.mediaDiscriminator
      );
      if (isStateServiceSupplyMix(getStrategy(lane, "").supply)) rows.push(row);
    }
  }
  if (rows.length === 0) return 0;
  const queued = await db
    .collection<CorporateSector>("corporateSectors")
    .find(
      {
        sectorType: { $in: [...new Set(rows.map((row) => row.sectorType))] },
        "buildQueue.0": { $exists: true },
      },
      {
        projection: {
          stateId: 1,
          sectorType: 1,
          industryModel: 1,
          mediaDiscriminator: 1,
          "buildQueue.unitsOrdered": 1,
        },
      }
    )
    .toArray();
  const inFlightByCell = new Map<string, number>();
  for (const sector of queued) {
    const key = bucketKey(
      sector.stateId,
      sector.sectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    );
    const units = (sector.buildQueue ?? []).reduce(
      (sum, order) =>
        sum + (Number.isFinite(order.unitsOrdered) ? Math.max(0, order.unitsOrdered) : 0),
      0
    );
    inFlightByCell.set(key, (inFlightByCell.get(key) ?? 0) + units);
  }
  let lifted = 0;
  for (const row of rows) {
    const poolUnits = unownedHeadroomUnitsOf(
      row.sectorType,
      row.headroomUnits,
      row.revenue,
      eraUnitScale,
      row.industryModel,
      row.mediaDiscriminator
    );
    const units = stateServiceHeadroomUnits({
      poolUnits,
      unmetUnits: unmetOf(row),
      inFlightUnits:
        inFlightByCell.get(
          bucketKey(row.stateId, row.sectorType, row.industryModel, row.mediaDiscriminator)
        ) ?? 0,
    });
    if (units > poolUnits) {
      row.headroomUnits = units;
      lifted += 1;
    }
  }
  return lifted;
}
