/** Recoverable publication of the receipts stored with the treasury cash update. */
import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import type { FederalBudget, TreasuryAccrualReceipt } from "@/lib/db/types/budget";
import { treasuryAccrualLegs } from "./rules/treasuryAccrual";

/** One budget's accrual receipt, waiting to be witnessed in the ledger. */
export interface TreasuryAccrualPublication {
  budget: Pick<FederalBudget, "_id" | "countryId">;
  receipt: TreasuryAccrualReceipt;
}

type LedgerEntryOp = {
  updateOne: {
    filter: { _id: ObjectId };
    update: { $setOnInsert: Record<string, unknown> };
    upsert: true;
  };
};

/**
 * The witness row for one receipt, or null when the posture or the accrue
 * itself produced no ledger legs.
 */
function publicationOp(publication: TreasuryAccrualPublication): LedgerEntryOp | null {
  const { budget, receipt } = publication;
  if (!receipt.ledgerShadow) return null;
  const id = new ObjectId(
    createHash("sha256")
      .update(`treasury-accrual:${budget._id}:${receipt.turn}`)
      .digest("hex")
      .slice(0, 24)
  );
  const legs = treasuryAccrualLegs(budget.countryId, receipt);
  if (legs.length === 0) return null;
  return {
    updateOne: {
      filter: { _id: id },
      update: {
        $setOnInsert: {
          turn: receipt.turn,
          createdAt: new Date(),
          txType: "gov_fiscal_accrual",
          legs,
          balanced: true,
          emitSite: "turn/treasuryTurn:accrual",
        },
      },
      upsert: true,
    },
  };
}

/**
 * Publish a pass's accrual witnesses in one write.
 *
 * Each row is keyed by the budget and turn it belongs to, so the rows are
 * independent of each other; only the round trips are shared. Publishing them
 * after the lanes moved the cash is the same recovery point as publishing each
 * one before its own lane: a crash before this write leaves the receipt stored
 * on the budget, and the next pass republishes it from there.
 */
export async function publishTreasuryAccrualReceipts(
  db: Db,
  publications: readonly TreasuryAccrualPublication[]
): Promise<void> {
  const ops = new Map<string, LedgerEntryOp>();
  for (const publication of publications) {
    const op = publicationOp(publication);
    if (op) ops.set(op.updateOne.filter._id.toHexString(), op);
  }
  if (ops.size === 0) return;
  await db.collection("ledgerEntries").bulkWrite([...ops.values()], { ordered: false });
}
