/**
 * Closing the German Question without deciding it. Cancelling a crisis changes
 * nothing in the world: no winner, no absorption, no history entry, and nothing
 * for the actuation sweep to enact.
 *
 * WHY A STATUS AND NOT A DELETE: deleting would strand `settlementPlay` rows
 * that record real money and actions spent. `cancelled` is terminal and inert;
 * every sweep and read filters positively on `open`/`frozen`/`resolved`, and the
 * unique partial index is on `open`, so a cancelled crisis does not block
 * reopening.
 *
 * NO REFUND: resolved plays spent real funds at the day's rates; unwinding that
 * is a separate, larger operation.
 *
 * A frozen crisis's declared war is a real conflict on the Conflicts board and
 * is NOT cancelled here, though this does stop its result from settling the
 * question. An ATTACHED war IS undone (war's name/hosts restored) since the
 * settlement renamed it; the war itself still runs.
 */
import type { Db, Filter } from "mongodb";
import { getSettlementCrisesCollection } from "@/lib/db/collections";
import { endWarAttachment } from "./attachToWar";
import type { SettlementCrisisDoc } from "@/lib/db/types/settlementCrisis";

export interface CloseCrisisResult {
  closed: boolean;
  /** Why it did not close. Null on success. */
  reason: string | null;
  /** Set when the crisis had already declared a war that outlives it. */
  orphanedConflictId: string | null;
}

export async function closeSettlementCrisis(
  db: Db,
  params: { turn: number }
): Promise<CloseCrisisResult> {
  const { turn } = params;
  const crises = await getSettlementCrisesCollection(db);

  const live = await crises.findOne({
    status: { $in: ["open", "frozen"] },
  } as Filter<SettlementCrisisDoc>);
  if (!live) {
    return { closed: false, reason: "No settlement crisis is live.", orphanedConflictId: null };
  }

  // Guarded on the status it was read at, so a tick that resolved the crisis
  // between the read and the write wins instead of being silently discarded —
  // a decided question must not be cancelled out from under its own outcome.
  const claimed = await crises.updateOne(
    { _id: live._id, status: live.status } as Filter<SettlementCrisisDoc>,
    {
      $set: {
        status: "cancelled",
        // Explicitly null: no side won. `resolvedTurn` records only that it
        // left play, which is why `outcome` is the field that says how.
        outcome: null,
        resolvedTurn: turn,
        cooldownUntilTurn: null,
        updatedAt: new Date(),
      },
    }
  );
  if (claimed.matchedCount !== 1) {
    return {
      closed: false,
      reason: "The crisis changed state before this landed. Reload and look again.",
      orphanedConflictId: null,
    };
  }

  // AFTER the claim, so only the runner that actually closed it touches the war.
  await endWarAttachment(db, live);

  return { closed: true, reason: null, orphanedConflictId: live.conflictId ?? null };
}
