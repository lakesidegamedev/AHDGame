import { withSessionDb } from "@/lib/db/sessionDb";
import type { Db } from "mongodb";
import type { CorporationPrivatizationVote } from "@/lib/db/types";
import { refundCharacterCash } from "@/lib/financialTxLog/atomicCashGuard";
import { corporationPrivatizationVotesCollection } from "@/lib/db/repositories/corporationPrivatizationVotes";

export interface CancelInput {
  db: Db;
  vote: CorporationPrivatizationVote;
  forexEnabled: boolean;
}

export type CancelResult = { ok: false; error: string; status: number } | { ok: true };

/**
 * CEO-only cancel of an open privatization vote. Refunds reserved cash. Does
 * NOT apply the failed-vote cooldown — only failures (no votes / no majority
 * yes) trigger the 96-turn lockout.
 */
export async function cancelPrivatizationVote(input: CancelInput): Promise<CancelResult> {
  return withSessionDb(input.db, (db) => cancelInTransaction({ ...input, db }));
}

async function cancelInTransaction(input: CancelInput): Promise<CancelResult> {
  const { db, vote, forexEnabled } = input;
  if (vote.status !== "open") {
    return { ok: false, error: "Vote is no longer open", status: 400 };
  }
  const now = new Date();
  const claim = await corporationPrivatizationVotesCollection(db).updateOne(
    { _id: vote._id, status: "open" },
    { $set: { status: "cancelled", resolvedAt: now, updatedAt: now } }
  );
  if (claim.matchedCount === 0) {
    return { ok: false, error: "Vote state changed; retry", status: 409 };
  }
  const refunded = await refundCharacterCash(
    db,
    vote.openedByCharacterId,
    vote.reservedCashCurrency,
    vote.totalReservedCash,
    forexEnabled
  );
  if (!refunded && vote.totalReservedCash > 0)
    throw new Error("Reserved cash recipient is missing");
  return { ok: true };
}
