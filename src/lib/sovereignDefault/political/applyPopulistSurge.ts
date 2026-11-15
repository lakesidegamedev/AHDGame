/**
 * On crisis-fire, NPPs with populist/nationalist ideology get a bulk
 * favorability bump. Decay is handled by the existing favorability decay;
 * no separate decay system is needed.
 *
 * Idempotency relies on crisisDetection's `firedThisEvaluation` flag, so
 * re-runs of the same crisis-fire turn are bounded.
 */

import type { Db } from "mongodb";
import type { NPP } from "@/lib/db/types/npp";
import type { CountryId } from "@/lib/constants/countries";
import { deriveIdeology } from "@/lib/sovereignDefault/npc/getExecutiveLeaderProfile";
import { nppsCollection } from "@/lib/db/repositories/npps";

/** Magnitude of the favorability bump applied to qualifying NPPs. */
const POPULIST_SURGE_FAVORABILITY = 10;

export interface PopulistSurgeResult {
  npcsAffected: number;
}

export async function applyPopulistSurgeOnCrisis(
  db: Db,
  countryCode: CountryId
): Promise<PopulistSurgeResult> {
  const npps = await nppsCollection(db).find({ countryId: countryCode, retiredAt: null }).toArray();

  const qualifyingIds = npps
    .filter((n) => {
      const ideology = deriveIdeology(n.policies);
      return ideology === "populist" || ideology === "nationalist";
    })
    .map((n) => n._id);

  if (qualifyingIds.length === 0) return { npcsAffected: 0 };

  await nppsCollection(db).updateMany(
    { _id: { $in: qualifyingIds } },
    { $inc: { favorability: POPULIST_SURGE_FAVORABILITY } }
  );
  return { npcsAffected: qualifyingIds.length };
}
