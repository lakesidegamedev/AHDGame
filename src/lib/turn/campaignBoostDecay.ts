import type { Db, AnyBulkWriteOperation } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { decayBoostMap } from "@/lib/redistricting/campaignBoost";
import type { Election } from "@/lib/db/types";
import { electionsCollection } from "@/lib/db/repositories/elections";

/**
 * Decay Campaign Here boosts toward 0 each turn. Intentionally flag-agnostic:
 * US placement is flag-gated and Canadian Commons placement uses the shared
 * boost rules. Boosts must keep eroding if US placement is disabled so they cannot freeze and
 * resurface later. Once every boost prunes to 0 the field disappears and the
 * query matches nothing, so the steady-state cost when the feature is unused is nil.
 */
export async function processCampaignBoostDecay(
  currentTurn: number,
  now: Date = new Date(),
  injectedDb?: Db
): Promise<{ electionsDecayed: number }> {
  const db = injectedDb ?? (await getDb());

  const elections = (await electionsCollection(db)
    .find(
      {
        electionType: { $in: ["house", "caCommons", "snap_caCommons"] },
        status: { $in: ["active", "upcoming"] },
        districtCampaignBoosts: { $exists: true },
      },
      { projection: { _id: 1, districtCampaignBoosts: 1 } }
    )
    .toArray()) as Election[];

  const writes = elections.flatMap<AnyBulkWriteOperation<Election>>((e) => {
    if (!e.districtCampaignBoosts) return [];
    const next = decayBoostMap(e.districtCampaignBoosts);
    return [
      {
        updateOne: {
          filter: {
            _id: e._id,
            status: { $in: ["active", "upcoming"] },
            districtCampaignBoosts: e.districtCampaignBoosts,
          },
          update:
            Object.keys(next).length > 0
              ? { $set: { districtCampaignBoosts: next, updatedAt: now } }
              : { $unset: { districtCampaignBoosts: "" }, $set: { updatedAt: now } },
        },
      },
    ];
  });
  const written = writes.length
    ? await electionsCollection(db).bulkWrite(writes, { ordered: true })
    : null;
  return { electionsDecayed: written?.matchedCount ?? 0 };
}
