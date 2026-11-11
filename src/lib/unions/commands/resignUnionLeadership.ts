import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Character, Union } from "@/lib/db/types";
import { runWithOptionalTransaction } from "@/lib/db/runWithOptionalTransaction";
import { isUnionsBanned, UNIONS_BANNED_MESSAGE } from "@/lib/labour/unionLaws";
import {
  isUnionProsecutionBarred,
  UNION_PROSECUTION_MESSAGE,
} from "@/lib/unions/unionProsecutionBar";
import { charactersCollection } from "@/lib/db/repositories/characters";
import { unionsCollection } from "@/lib/db/repositories/unions";

export type ResignUnionLeadershipResult =
  { ok: true; status: 200 } | { ok: false; status: number; error: string };

/**
 * Leader-initiated, voluntary release of union leadership. `claimUnion`
 * unconditionally 409s when a union already has an owner, so without this an
 * inactive leader would permanently lock the industry's union. Mirrors CEO
 * vacancy: treasury and membershipPressure are untouched, the union simply
 * becomes unmanned (NPC drift resumes for its sectors).
 */
export async function resignUnionLeadership(
  db: Db,
  character: Character,
  unionId: string
): Promise<ResignUnionLeadershipResult> {
  if (await isUnionProsecutionBarred(db, character._id)) {
    return { ok: false, status: 403, error: UNION_PROSECUTION_MESSAGE };
  }
  if (!ObjectId.isValid(unionId)) {
    return { ok: false, status: 400, error: "Invalid union ID" };
  }
  const unionObjectId = new ObjectId(unionId);
  const union = await unionsCollection(db).findOne({ _id: unionObjectId });
  if (!union) {
    return { ok: false, status: 404, error: "Union not found" };
  }
  if (!union.ownerId || union.ownerId.toString() !== character._id.toString()) {
    return { ok: false, status: 403, error: "You do not lead this union." };
  }
  // Union ban: the union is suspended wholesale while
  // banned — leadership is frozen in place (not vacated) so a repeal restores
  // the union exactly as the ban found it.
  if (await isUnionsBanned(db, union.countryId)) {
    return { ok: false, status: 403, error: UNIONS_BANNED_MESSAGE };
  }

  const now = new Date();
  await runWithOptionalTransaction(
    async (session) => {
      await unionsCollection(db).updateOne(
        { _id: unionObjectId },
        {
          $set: { ownerId: null, updatedAt: now },
          $unset: { pendingLeaderCharacterId: "", ownerType: "" },
        },
        { session }
      );
      await charactersCollection(db).updateOne(
        { _id: character._id },
        { $set: { unionLeaderOf: null, updatedAt: now } },
        { session }
      );
      await db.collection("unionLeaderVotes").deleteMany({ unionId: unionObjectId }, { session });
    },
    async () => {
      await unionsCollection(db).updateOne(
        { _id: unionObjectId },
        {
          $set: { ownerId: null, updatedAt: now },
          $unset: { pendingLeaderCharacterId: "", ownerType: "" },
        }
      );
      await charactersCollection(db).updateOne(
        { _id: character._id },
        { $set: { unionLeaderOf: null, updatedAt: now } }
      );
      await db.collection("unionLeaderVotes").deleteMany({ unionId: unionObjectId });
    }
  );

  return { ok: true, status: 200 };
}
