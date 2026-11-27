/**
 * Executive political (favorability, infamy) impact per sovereign-default
 * resolution choice, anchored to real post-default incumbent outcomes.
 */

import type { Db, ObjectId } from "mongodb";
import type { SovereignResolutionChoice } from "@/lib/db/types/budget";
import { charactersCollection } from "@/lib/db/repositories/characters";

import { computeExecutivePoliticalImpact } from "./rules/executiveImpact";
export {
  computeExecutivePoliticalImpact,
  type ExecutivePoliticalImpact,
} from "./rules/executiveImpact";

/**
 * Apply the calibrated impact to the proposing character. No-op when
 * `characterId` is null (NPC executive — political impact for NPPs is
 * separate and runs through their own favorability system).
 */
export async function applyExecutivePoliticalImpact(
  db: Db,
  characterId: ObjectId | null | undefined,
  choice: SovereignResolutionChoice
): Promise<{ applied: boolean }> {
  if (!characterId) return { applied: false };
  const impact = computeExecutivePoliticalImpact(choice);
  await charactersCollection(db).updateOne({ _id: characterId }, [
    {
      $set: {
        favorability: {
          $min: [
            100,
            { $max: [0, { $add: [{ $ifNull: ["$favorability", 0] }, impact.favorabilityDelta] }] },
          ],
        },
        infamy: {
          $min: [100, { $max: [0, { $add: [{ $ifNull: ["$infamy", 0] }, impact.infamyDelta] }] }],
        },
      },
    },
  ]);
  return { applied: true };
}
