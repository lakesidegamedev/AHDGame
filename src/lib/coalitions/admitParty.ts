import type { Db, Document, UpdateFilter } from "mongodb";
import type { Coalition } from "@/lib/db/types/coalition";
import type { PoliticalParty } from "@/lib/db/types/party";

/**
 * Move a party from a coalition's pending invites or join requests into its
 * members, and point the party at the coalition.
 *
 * Both writes are claims. The coalition entry is claimed first, only while the
 * party is still pending and not yet a member, so a double click admits once.
 * The party seat is then claimed only while it is empty or already this
 * coalition; if another coalition took it in between, the membership just
 * added is removed again so the party is never listed in two coalitions.
 */
export async function admitPartyToCoalition(
  db: Db,
  coalition: Pick<Coalition, "_id">,
  party: Pick<PoliticalParty, "_id" | "sequentialId">,
  from: "pendingInvites" | "joinRequests",
  now: Date
): Promise<boolean> {
  const coalitions = db.collection("coalitions");
  const moved = await coalitions.updateOne(
    {
      _id: coalition._id,
      [`${from}.partyId`]: party._id,
      "members.partyId": { $ne: party._id },
    },
    [
      {
        $set: {
          [from]: {
            $filter: {
              input: `$${from}`,
              as: "entry",
              cond: { $ne: ["$$entry.partyId", party._id] },
            },
          },
          members: {
            $concatArrays: [
              "$members",
              [{ partyId: party._id, partySequentialId: party.sequentialId, joinedAt: now }],
            ],
          },
          updatedAt: now,
        },
      },
    ]
  );
  if (moved.modifiedCount !== 1) return false;

  const seated = await db
    .collection<PoliticalParty>("politicalParties")
    .updateOne(
      { _id: party._id, coalitionId: { $in: [null, coalition._id] } },
      { $set: { coalitionId: coalition._id, updatedAt: now } }
    );
  if (seated.matchedCount === 1) return true;

  await coalitions.updateOne({ _id: coalition._id }, {
    $pull: { members: { partyId: party._id } },
    $set: { updatedAt: now },
  } as unknown as UpdateFilter<Document>);
  return false;
}
