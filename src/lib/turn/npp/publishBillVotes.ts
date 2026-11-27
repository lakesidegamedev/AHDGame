import { ObjectId, type Db, type Document } from "mongodb";
import type { NPPVotePrediction } from "@/lib/db/types";
import { withSessionDb } from "@/lib/db/sessionDb";
import { billsCollection } from "@/lib/db/repositories/bills";
import { nppsCollection } from "@/lib/db/repositories/npps";
import { nppVotePredictionsCollection } from "@/lib/db/repositories/nppVotePredictions";
import { INTEREST_VOTE_FAVORABILITY_COST } from "@/lib/nppAutonomy/v6/rules/businessInterest";

export interface NppBillVotePublication {
  billId: ObjectId;
  status: string;
  observedVotes: Record<string, unknown>;
  setFields: Record<string, unknown>;
  incFields: Record<string, number>;
  predictions: Pick<
    NPPVotePrediction,
    "nppId" | "forces" | "donorsLabel" | "verdict" | "resolvedVote"
  >[];
  interestNppIds: ObjectId[];
  votesCast: number;
}
const BILL_BATCH = 16;
const filter = (plan: NppBillVotePublication) => ({
  _id: plan.billId,
  status: plan.status,
  ...plan.observedVotes,
});

/** A bounded batch commits ballots, their explanation and the once-per-turn cost together. */
async function publishBatch(
  db: Db,
  plans: NppBillVotePublication[],
  turn: number,
  now: Date
): Promise<{ count: number; stale: ObjectId[] }> {
  return withSessionDb(db, async (db) => {
    const eligible = await billsCollection<Document>(db)
      .find({ $or: plans.map(filter) }, { projection: { _id: 1 } })
      .toArray();
    const ids = new Set(eligible.map((row) => String(row._id)));
    const accepted = plans.filter((plan) => ids.has(plan.billId.toHexString()));
    const stale = plans
      .filter((plan) => !ids.has(plan.billId.toHexString()))
      .map((plan) => plan.billId);
    if (accepted.length === 0) return { count: 0, stale };
    const updated = await billsCollection<Document>(db).bulkWrite(
      accepted.map((plan) => ({
        updateOne: {
          filter: filter(plan),
          update: { $set: plan.setFields, $inc: plan.incFields },
        },
      }))
    );
    if (updated.matchedCount !== accepted.length)
      throw new Error("Bill ballots changed during publication");
    const predictions = accepted.flatMap((plan) =>
      plan.predictions.map((prediction) => ({
        updateOne: {
          filter: { nppId: prediction.nppId, billId: plan.billId },
          update: {
            $set: {
              computedAtTurn: turn,
              forces: prediction.forces,
              donorsLabel: prediction.donorsLabel,
              verdict: prediction.verdict,
              resolvedVote: prediction.resolvedVote,
              updatedAt: now,
            },
            $setOnInsert: { nppId: prediction.nppId, billId: plan.billId, createdAt: now },
          },
          upsert: true,
        },
      }))
    );
    if (predictions.length) await nppVotePredictionsCollection(db).bulkWrite(predictions);
    const interests = [...new Set(accepted.flatMap((plan) => plan.interestNppIds.map(String)))];
    if (interests.length)
      await nppsCollection(db).bulkWrite(
        interests.map((id) => ({
          updateOne: {
            filter: {
              _id: new ObjectId(id),
              $or: [
                { businessInterestVotePenaltyTurn: { $exists: false } },
                { businessInterestVotePenaltyTurn: { $lt: turn } },
              ],
            },
            update: [
              {
                $set: {
                  businessInterestVotePenaltyTurn: turn,
                  favorability: {
                    $max: [
                      0,
                      {
                        $subtract: [
                          { $ifNull: ["$favorability", 0] },
                          INTEREST_VOTE_FAVORABILITY_COST,
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        }))
      );
    return { count: accepted.reduce((sum, plan) => sum + plan.votesCast, 0), stale };
  });
}
export async function publishNppBillVotes(
  db: Db,
  plans: NppBillVotePublication[],
  turn: number,
  now: Date,
  options?: { staleBillIds: Set<string> }
): Promise<number> {
  if (!Number.isSafeInteger(turn) || turn < 0) throw new Error("Invalid bill vote turn");
  let count = 0;
  for (let offset = 0; offset < plans.length; offset += BILL_BATCH) {
    const result = await publishBatch(db, plans.slice(offset, offset + BILL_BATCH), turn, now);
    count += result.count;
    for (const id of result.stale) options?.staleBillIds.add(id.toHexString());
  }
  return count;
}
