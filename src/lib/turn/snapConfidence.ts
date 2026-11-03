/**
 * Post-snap government confidence. resetCompletedSnapConfidence sets confidence to 50
 * after a full dissolution election and records it once per snap election.
 */
import type { Db } from "mongodb";
import { getGovernmentFormationsCollection } from "@/lib/db/collections/governmentFormation";
import { snapConfidenceReset } from "./rules/snapConfidence";

export interface CompletedSnapConfidence {
  countryId: string;
  startTurn: number;
  turn: number;
}

/** One atomic update per country, batched into one command; retries cannot renew confidence. */
export async function resetCompletedSnapConfidence(
  db: Db,
  completed: readonly CompletedSnapConfidence[],
  now: Date
): Promise<void> {
  const latest = new Map<string, CompletedSnapConfidence>();
  for (const event of completed) {
    if (
      !event.countryId ||
      !Number.isSafeInteger(event.turn) ||
      event.turn < 1 ||
      !snapConfidenceReset(event.startTurn)
    )
      throw new Error("Invalid completed snap election");
    if (!latest.has(event.countryId) || latest.get(event.countryId)!.startTurn < event.startTurn) {
      latest.set(event.countryId, event);
    }
  }
  if (latest.size === 0) return;
  const operations = [...latest.values()].map((event) => {
    const reset = snapConfidenceReset(event.startTurn)!;
    return {
      updateOne: {
        filter: {
          _id: event.countryId,
          $or: [
            { confidenceSnapStartTurn: { $exists: false } },
            { confidenceSnapStartTurn: { $lt: reset.startTurn } },
          ],
        },
        update: {
          $set: {
            confidenceGauge: reset.value,
            confidenceSnapStartTurn: reset.startTurn,
            confidenceGaugeUpdatedAt: now,
            updatedAt: now,
          },
          $push: {
            confidenceGaugeHistory: {
              $each: [
                { turn: event.turn, value: reset.value, at: now, reason: "snapElectionCompleted" },
              ],
              $slice: -500,
            },
          },
        },
      },
    };
  });
  await getGovernmentFormationsCollection(db).bulkWrite(operations, { ordered: false });
}
