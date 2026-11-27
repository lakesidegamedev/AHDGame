import type { Db } from "mongodb";
import type {
  CountryLeaderState,
  LeaderConfidenceHistoryEntry,
} from "@/lib/db/types/countryLeaderState";
import { getCountryLeaderStatesCollection } from "@/lib/db/collections/countryLeaderState";

/** Publish the scalar and its exact receipt against the same observed version. */
export async function adjustLeaderScalar(
  db: Db,
  initial: CountryLeaderState,
  field: "partyConfidence" | "popularLegitimacy",
  historyField: "confidenceHistory" | "popularLegitimacyHistory",
  fallback: number,
  delta: number,
  clamp: (value: number) => number,
  reason: string,
  turn: number,
  limit: number
): Promise<CountryLeaderState | null> {
  if (!Number.isFinite(delta)) throw new Error("Invalid leader confidence adjustment");
  const collection = getCountryLeaderStatesCollection(db);
  let observed: CountryLeaderState | null = initial;
  // bounded-cas-retry(maxAttempts=8): Preserve accepted concurrent scalar changes and their histories.
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!observed) return null;
    const previous = observed[field] ?? fallback;
    const next = clamp(previous + delta);
    const entry: LeaderConfidenceHistoryEntry = {
      turn,
      previous,
      next,
      delta: next - previous,
      reason,
      at: new Date(),
    };
    const result = await collection.findOneAndUpdate(
      {
        _id: initial._id,
        [field]: observed[field] === undefined ? { $exists: false } : observed[field],
        [historyField]:
          observed[historyField] === undefined ? { $exists: false } : observed[historyField],
      },
      {
        $set: {
          [field]: next,
          [historyField]: [entry, ...(observed[historyField] ?? [])].slice(0, limit),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    if (result) return result;
    observed = await collection.findOne({ _id: initial._id });
  }
  if (!observed) return null;
  throw new Error("Leader confidence changed concurrently; retry the adjustment");
}
