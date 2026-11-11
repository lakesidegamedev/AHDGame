import { getDb } from "@/lib/mongodb";
import { countersCollection } from "@/lib/db/repositories/counters";
import { suggestionsCollection } from "@/lib/db/repositories/suggestions";

/**
 * Next display issue number for the player suggestions forum (`suggestions` collection).
 * Counter key `suggestions` — independent from legacy `feedback` numbering.
 */
export async function getNextSuggestionNumber(): Promise<number> {
  const db = await getDb();

  const maxDoc = await suggestionsCollection<{ issueNumber?: number }>(db).findOne(
    { issueNumber: { $exists: true } },
    { sort: { issueNumber: -1 } }
  );
  const maxExisting = maxDoc?.issueNumber ?? 0;

  const result = await countersCollection<{ _id: string; seq: number }>(db).findOneAndUpdate(
    { _id: "suggestions" },
    [
      { $set: { seq: { $max: [{ $ifNull: ["$seq", 0] }, maxExisting] } } },
      { $set: { seq: { $add: ["$seq", 1] } } },
    ],
    { upsert: true, returnDocument: "after" }
  );

  return result?.seq ?? maxExisting + 1;
}
