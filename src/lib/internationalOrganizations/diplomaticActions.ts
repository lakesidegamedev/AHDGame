import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { withSessionDb } from "@/lib/db/sessionDb";
import type { CountryId } from "@/lib/constants/countries";
import { DIPLOMATIC_ACTIONS_PER_TURN } from "@/lib/constants/internationalOrganizations";
import type { DiplomaticActionBudget } from "@/lib/db/types/diplomaticAction";
import { getDiplomaticActionsCollection } from "@/lib/db/collections";

/**
 * Actions left for a stored budget row at `currentTurn`. A missing or stale
 * (older-turn) row reads as a full budget — the refresh happens on the next
 * spend. Pure so the turn-refresh + clamping logic is unit-tested directly.
 */
export function remainingFromRow(
  row: Pick<DiplomaticActionBudget, "turn" | "remaining"> | null,
  currentTurn: number
): number {
  if (!Number.isSafeInteger(currentTurn) || currentTurn < 0) return 0;
  if (!row) return DIPLOMATIC_ACTIONS_PER_TURN;
  if (!Number.isSafeInteger(row.turn) || row.turn > currentTurn || !Number.isFinite(row.remaining))
    return 0;
  if (row.turn < currentTurn) return DIPLOMATIC_ACTIONS_PER_TURN;
  return Math.max(0, Math.min(DIPLOMATIC_ACTIONS_PER_TURN, row.remaining));
}

/** Actions a country has left this turn. */
export async function getDiplomaticActionsRemaining(
  db: Db,
  countryId: CountryId,
  currentTurn: number
): Promise<number> {
  const col = await getDiplomaticActionsCollection(db);
  const row = await col.findOne({ countryId });
  return remainingFromRow(row, currentTurn);
}

/** Serialize lazy refresh with consumption; never acknowledge an unclaimed action. */
export async function spendDiplomaticAction(
  db: Db,
  countryId: CountryId,
  currentTurn: number
): Promise<{ ok: boolean; remaining: number }> {
  return withSessionDb(db, async (db) => {
    const col = await getDiplomaticActionsCollection(db);
    const row = await col.findOne({ countryId });
    const current = remainingFromRow(row, currentTurn);
    if (current < 1) return { ok: false, remaining: 0 };
    const remaining = current - 1;
    const _id =
      row?._id ??
      new ObjectId(
        createHash("sha256").update(`diplomatic-actions:${countryId}`).digest("hex").slice(0, 24)
      );
    const claimed = await col.updateOne(
      row ? { _id, countryId, turn: row.turn, remaining: row.remaining } : { _id, countryId },
      { $set: { countryId, turn: currentTurn, remaining, updatedAt: new Date() } },
      { upsert: !row }
    );
    if (claimed.matchedCount !== 1 && claimed.upsertedCount !== 1)
      return { ok: false, remaining: 0 };
    return { ok: true, remaining };
  });
}
