import type { Db, ObjectId } from "mongodb";
import type { Corporation, CeoTenure } from "@/lib/db/types";

export type { CeoTenure };

/**
 * Open a new CEO tenure: close any currently-open tenure (stamp endTurn) and
 * append a fresh open one. Two writes so a single open-tenure invariant holds
 * even if a previous departure site missed its close.
 */
export async function openCeoTenure(
  db: Db,
  corpId: ObjectId,
  args: { holderId: ObjectId; ceoType: "character" | "imperial" | "npp"; turn: number }
): Promise<void> {
  // Gate the $set on ceoHistory existing: positional updates on an absent array throw. The filter no-ops for new and legacy corps; the $push below creates it.
  await db
    .collection<Corporation>("corporations")
    .updateOne(
      { _id: corpId, ceoHistory: { $exists: true } },
      { $set: { "ceoHistory.$[t].endTurn": args.turn } },
      { arrayFilters: [{ "t.endTurn": { $exists: false } }] }
    );
  await db.collection<Corporation>("corporations").updateOne(
    { _id: corpId },
    {
      $push: {
        ceoHistory: { holderId: args.holderId, ceoType: args.ceoType, startTurn: args.turn },
      },
    }
  );
}

/**
 * Close the open tenure for a departing CEO (stamp endTurn). Targets only the
 * matching holder's still-open entry; a no-op if none exists.
 */
export async function closeCeoTenure(
  db: Db,
  corpId: ObjectId,
  args: { holderId: ObjectId; turn: number }
): Promise<void> {
  // Gate on the array existing — a positional array update on an absent
  // `ceoHistory` throws (see openCeoTenure). Nothing to close on a corp that
  // never had a tenure recorded, so a no-op is the correct outcome.
  await db
    .collection<Corporation>("corporations")
    .updateOne(
      { _id: corpId, ceoHistory: { $exists: true } },
      { $set: { "ceoHistory.$[t].endTurn": args.turn } },
      { arrayFilters: [{ "t.holderId": args.holderId, "t.endTurn": { $exists: false } }] }
    );
}

/**
 * True if `holderId` held the CEO seat at any point within the last `window`
 * turns (open tenure, or a tenure whose endTurn is >= currentTurn - window).
 */
export function wasCeoWithinTurns(
  corp: Pick<Corporation, "ceoHistory">,
  holderId: ObjectId,
  currentTurn: number,
  window: number
): boolean {
  const history = corp.ceoHistory ?? [];
  return history.some((t) => {
    if (!t.holderId?.equals(holderId)) return false;
    if (t.endTurn == null) return true;
    return t.endTurn >= currentTurn - window;
  });
}
