import { npcscChairNominationsCollection } from "@/lib/db/repositories/npcscChairNominations";
import { cppccChairNominationsCollection } from "@/lib/db/repositories/cppccChairNominations";
import { bundestagspraesidentNominationsCollection } from "@/lib/db/repositories/bundestagspraesidentNominations";
import { senateLeadershipNominationsCollection } from "@/lib/db/repositories/senateLeadershipNominations";
import { houseLeadershipNominationsCollection } from "@/lib/db/repositories/houseLeadershipNominations";
import { speakerNominationsCollection } from "@/lib/db/repositories/speakerNominations";
import { type ObjectId, type Db, type Document, type AnyBulkWriteOperation } from "mongodb";
import { withSessionDb } from "@/lib/db/sessionDb";

export interface LeadershipVoteIntent {
  voterKey: string;
  nominationId: ObjectId;
  seatWeight: number;
}

function nominationsCollection(db: Db, name: string) {
  switch (name) {
    case "speakerNominations":
      return speakerNominationsCollection<Document>(db);
    case "houseLeadershipNominations":
      return houseLeadershipNominationsCollection<Document>(db);
    case "senateLeadershipNominations":
      return senateLeadershipNominationsCollection<Document>(db);
    case "bundestagspraesidentNominations":
      return bundestagspraesidentNominationsCollection<Document>(db);
    case "cppccChairNominations":
      return cppccChairNominationsCollection<Document>(db);
    case "npcscChairNominations":
      return npcscChairNominationsCollection<Document>(db);
    default:
      throw new Error("Unsupported leadership nomination collection");
  }
}

/** Serialize a race before moving ballots so two first votes cannot both survive. */
export async function castLeadershipVoteBatch(
  db: Db,
  collectionName: string,
  intents: readonly LeadershipVoteIntent[],
  now: Date
): Promise<number> {
  if (!intents.length) return 0;
  return withSessionDb(db, async (db) => {
    const collection = nominationsCollection(db, collectionName);
    const nominations = await collection
      .find({ status: { $in: ["open", "voting"] } }, { projection: { _id: 1, role: 1, votes: 1 } })
      .toArray();
    const byId = new Map(nominations.map((row) => [String(row._id), row]));
    const scopes = new Set(
      intents.flatMap((vote) => {
        const target = byId.get(String(vote.nominationId));
        return target ? [target.role ?? ""] : [];
      })
    );
    const anchors = [...scopes].flatMap((role) =>
      nominations
        .filter((row) => (row.role ?? "") === role)
        .sort((a, b) => String(a._id).localeCompare(String(b._id)))
        .slice(0, 1)
    );
    if (anchors.length)
      await collection.bulkWrite(
        anchors.map((row) => ({
          updateOne: {
            filter: { _id: row._id, status: { $in: ["open", "voting"] } },
            update: { $inc: { leadershipBallotRevision: 1 } },
          },
        }))
      );
    const ops: AnyBulkWriteOperation<Document>[] = [];
    let changed = 0;
    for (const intent of intents) {
      if (!intent.voterKey || /[.$]/.test(intent.voterKey))
        throw new Error("Invalid leadership voter key");
      const target = byId.get(String(intent.nominationId));
      if (!target) continue;
      const weight = Math.max(1, intent.seatWeight);
      for (const previous of nominations) {
        if (
          String(previous._id) === String(target._id) ||
          (previous.role ?? "") !== (target.role ?? "") ||
          !previous.votes?.[intent.voterKey]
        )
          continue;
        ops.push({
          updateOne: {
            filter: { _id: previous._id, [`votes.${intent.voterKey}`]: { $exists: true } },
            update: {
              $unset: { [`votes.${intent.voterKey}`]: "" },
              $inc: { votesFor: -weight },
              $set: { updatedAt: now },
            },
          },
        });
        delete previous.votes[intent.voterKey];
      }
      if (target.votes?.[intent.voterKey]) continue;
      ops.push({
        updateOne: {
          filter: { _id: target._id, [`votes.${intent.voterKey}`]: { $exists: false } },
          update: {
            $set: { [`votes.${intent.voterKey}`]: "for", status: "voting", updatedAt: now },
            $inc: { votesFor: weight },
          },
        },
      });
      target.votes = { ...target.votes, [intent.voterKey]: "for" };
      changed++;
    }
    if (ops.length) await collection.bulkWrite(ops, { ordered: true });
    return changed;
  });
}

export async function castLeadershipVote(
  db: Db,
  collectionName: string,
  _nominations: Array<{ _id: ObjectId; votes?: Record<string, string> }>,
  nppKey: string,
  bestId: ObjectId,
  now: Date,
  seatWeight = 1
): Promise<boolean> {
  return (
    (await castLeadershipVoteBatch(
      db,
      collectionName,
      [{ voterKey: nppKey, nominationId: bestId, seatWeight }],
      now
    )) > 0
  );
}
