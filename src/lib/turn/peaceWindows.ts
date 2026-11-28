import { withTurnValueSettlement } from "./withTurnValueSettlement";
import type { Db, Filter } from "mongodb";
import type { ConflictDoc } from "@/lib/db/types/conflict";
import { getConflictsCollection } from "@/lib/db/collections/conflicts";
import { resolveConflict } from "@/lib/military/resolveConflict";

/**
 * Resolve every won war whose dictate window has lapsed, as a white peace.
 *
 * A real sweep, not lazy expiry: nothing forces anyone to open a conflict
 * document, so a victor who never logs in would leave a won war stuck in
 * `terms_pending` forever. Runs every tick regardless of activity.
 */
export async function resolvePeaceWindows(
  db: Db,
  currentTurn: number
): Promise<{ resolved: number }> {
  return withTurnValueSettlement(db, "peace-window-expiry", currentTurn, (db) =>
    settlePeaceWindows(db, currentTurn)
  );
}

async function settlePeaceWindows(db: Db, currentTurn: number): Promise<{ resolved: number }> {
  const lapsed = await getConflictsCollection(db)
    .find({
      status: "terms_pending",
      "termsWindow.closesTurn": { $lte: currentTurn },
    } as Filter<ConflictDoc>)
    .toArray();

  const valid = lapsed.filter(
    (conflict) =>
      conflict.termsWindow &&
      (conflict.termsWindow.victor === "A" || conflict.termsWindow.victor === "B")
  );
  if (!valid.length) return { resolved: 0 };
  await getConflictsCollection(db).bulkWrite(
    valid.map((conflict) => ({
      updateOne: {
        filter: { _id: conflict._id, status: "terms_pending" },
        update: {
          $set: {
            status: "resolved" as const,
            settlement: {
              term: { kind: "indemnity" as const, amount: 0, payer: conflict.termsWindow!.target },
              path: "dictated" as const,
              imposedBy: conflict.termsWindow!.imposer,
              target: conflict.termsWindow!.target,
              turn: currentTurn,
            },
          },
        },
      },
    }))
  );
  let resolved = 0;
  for (const conflict of valid) {
    await resolveConflict(db, conflict, conflict.termsWindow!.victor, currentTurn, {
      endingType: "expiry",
    });
    resolved++;
  }

  return { resolved };
}
