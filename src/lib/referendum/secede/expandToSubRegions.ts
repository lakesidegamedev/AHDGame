/**
 * Expand a single live region (the UK's `"SCO"` / `"WAL"`) into its successor
 * country's full set of sub-regions when it secedes:
 *
 *   1. Insert the seed `State[]` for the successor (`scoRegions`/`walRegions`).
 *   2. Fan the aggregate's dynamic per-region data out across the sub-regions
 *      (metrics/demographics/budgets/sectors/registration/residents/devolved
 *      artifacts), per the declarative `SECEDE_FANOUT` policy table.
 *   3. Delete the old single-region `states` aggregate.
 *
 * Idempotent — re-firing on an already-expanded region is a no-op (the capital
 * sub-region already present). The fan-out step is added in subsequent tasks.
 */
import type { ConflictCapacityObligation } from "@/lib/db/types/conflictCapacity";
import type { Db } from "mongodb";
import type { State, GameState } from "@/lib/db/types";
import {
  SUB_REGION_SEEDS,
  CAPITAL_SUBREGION,
  secessionSource,
  type SecedingCountryId,
} from "./subRegions";
import { expandLiveRegions } from "./rules/liveRegions";
import { SECEDE_FANOUT, type FanoutPolicy } from "./fanoutPolicy";
import { applyFanout, buildFanoutContext } from "./fanoutDriver";
import { planSectorFanout } from "./planSectorFanout";
import { migrateProducerWallets } from "./migrateProducerWallets";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { statesCollection } from "@/lib/db/repositories/states";
import { nppsCollection } from "@/lib/db/repositories/npps";
import type { Document } from "mongodb";

export interface ExpandToSubRegionsResult {
  inserted: number;
  skipped?: "already-expanded";
  fannedOut: Array<{ collection: string; policy: FanoutPolicy; writes: number }>;
}

export async function expandToSubRegions(
  db: Db,
  countryId: SecedingCountryId
): Promise<ExpandToSubRegionsResult> {
  const seeds = SUB_REGION_SEEDS[countryId];
  const capital = CAPITAL_SUBREGION[countryId];
  const { fromCountryId, regionId } = secessionSource(countryId);

  // Idempotency: if the capital sub-region already exists, the region was expanded.
  const already = await statesCollection(db).findOne({ _id: capital });
  if (already) return { inserted: 0, skipped: "already-expanded", fannedOut: [] };

  const aggregate = await statesCollection(db).findOne({ _id: regionId });
  if (!aggregate) throw new Error(`${countryId} live aggregate is missing`);
  const liveRegions = expandLiveRegions(aggregate, seeds);
  const now = new Date();
  await statesCollection(db).insertMany(
    liveRegions.map((s) => ({ ...s, countryId, updatedAt: now }) as State)
  );

  // Fan the aggregate's dynamic per-region data out across the sub-regions.
  // The reset preset selects the era demographic pattern (1991 vs 2019).
  const gameState = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { preset: 1, currentTurn: 1 } }
  );
  const ctx = buildFanoutContext(countryId, seeds, gameState?.preset);
  await planSectorFanout(db, ctx, gameState?.currentTurn ?? 0);
  await migrateProducerWallets(db, countryId, liveRegions, gameState?.currentTurn ?? 0);
  const fannedOut: ExpandToSubRegionsResult["fannedOut"] = [];
  for (const scope of SECEDE_FANOUT) {
    const writes = await applyFanout(db, scope, ctx);
    fannedOut.push({ collection: scope.collection, policy: scope.policy, writes });
  }

  // Repair obligations and their applied amounts must retain the same identity.
  const obligations = await db
    .collection<ConflictCapacityObligation>("conflictCapacityObligations")
    .find({ regionId })
    .toArray();
  if (obligations.length) {
    const weights = buildFanoutContext(countryId, seeds).gdpWeights;
    await db.collection<ConflictCapacityObligation>("conflictCapacityObligations").insertMany(
      obligations.flatMap((obligation) =>
        liveRegions.map((region) => ({
          ...obligation,
          _id: `${obligation._id}:${region._id}`,
          regionId: region._id,
          regionName: region.name,
          capitalStockBefore: obligation.capitalStockBefore * weights[region._id],
          destroyedCapital: obligation.destroyedCapital * weights[region._id],
        }))
      )
    );
    await db
      .collection<ConflictCapacityObligation>("conflictCapacityObligations")
      .deleteMany({ regionId });
  }
  await nppsCollection<Document>(db).updateMany(
    { homeState: regionId },
    { $set: { homeState: capital, countryId } }
  );
  await corporationsCollection(db).updateMany(
    { headquartersState: regionId },
    { $set: { headquartersState: capital, countryId } }
  );

  // The parent's constituency layer ends with the aggregate geography. Its
  // residents are conserved by the cohort fan-out above; independent regions
  // have their own map tier, not duplicated stocks attached to the retired parent.
  await db.collection("counties").deleteMany({ countryId: fromCountryId, stateId: regionId });

  // Drop the single-region aggregate once its sub-regions exist.
  await statesCollection(db).deleteOne({ _id: regionId });

  return { inserted: seeds.length, fannedOut };
}
