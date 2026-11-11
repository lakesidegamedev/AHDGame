/**
 * Support-mutation hooks for discrete events: scandals, endorsements,
 * debate outcomes. Each applies a calibrated delta to `support` for every
 * active candidate row of a character, clamping to [0, 100] post-write.
 *
 * Not idempotent: calling twice applies the bump twice. Callers must
 * rate-limit / dedupe at their level (e.g. an endorsement only fires once
 * per landing).
 */

import type { Db, ObjectId } from "mongodb";
import type { ElectionCandidate } from "@/lib/db/types";
import { SUPPORT_ENDORSEMENT_BUMP } from "@/lib/elections/engine/electionFormulaFactors";
import { electionCandidatesCollection } from "@/lib/db/repositories/electionCandidates";

/**
 * Apply a `delta` Support change to every active candidate row of the
 * given character, clamping to [0, 100]. Returns the count of rows
 * updated. Skips silently when no active candidate rows exist (e.g. the
 * character isn't currently running for anything).
 */
async function applySupportDelta(db: Db, characterId: ObjectId, delta: number): Promise<number> {
  if (delta === 0) return 0;
  const result = await electionCandidatesCollection(db)
    .updateMany({ characterId, status: "active" }, [
      {
        $set: {
          support: {
            $min: [100, { $max: [0, { $add: [{ $ifNull: ["$support", 50] }, delta] }] }],
          },
        },
      },
    ]);
  return result.modifiedCount;
}

/**
 * Apply the endorsement Support bump to all active candidate rows for
 * the endorsed character. Pass `revoking: true` to apply the negative
 * form (revocation cleanly reverses the bump from the original
 * landing).
 */
export async function applyEndorsementSupportBump(
  db: Db,
  characterId: ObjectId,
  revoking: boolean = false
): Promise<number> {
  const delta = revoking ? -SUPPORT_ENDORSEMENT_BUMP : SUPPORT_ENDORSEMENT_BUMP;
  return applySupportDelta(db, characterId, delta);
}
