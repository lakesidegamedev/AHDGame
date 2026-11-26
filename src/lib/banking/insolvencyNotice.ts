import * as Sentry from "@sentry/nextjs";
import type { Db, ObjectId } from "mongodb";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { formatCurrencyFaceAmount } from "@/lib/currency/formatCurrencyFaceAmount";
import { notificationsCollection } from "@/lib/db/repositories/notifications";

export interface BankInsolvencyCureNoticeInput {
  corporationId: ObjectId;
  bankName: string;
  userId?: ObjectId | null;
  currency: CurrencyCode;
  /** How far marked assets fall short of what the bank owes. */
  deficit: number;
  openedTurn: number;
  deadlineTurn: number;
}

const SYSTEM_USER_ID = "000000000000000000000000";

/** The player copy for a newly opened cure window. */
export function bankInsolvencyCureMessage(input: BankInsolvencyCureNoticeInput): string {
  const deficit = formatCurrencyFaceAmount(Math.ceil(input.deficit), input.currency);
  return (
    `${input.bankName} owes ${deficit} more than its assets are worth at today's prices. ` +
    `Post at least that much capital to the bank before turn ${input.deadlineTurn}, ` +
    `or it will be closed and its depositors paid from what it holds. ` +
    `Payouts to the owner are blocked until the gap is closed.`
  );
}

/**
 * Warn the owner the turn a bank's balance sheet goes negative while it is
 * still liquid. Written once per episode: the key is the bank plus the turn the
 * hole opened, so a replayed solvency pass never sends a second copy. Never
 * throws; a notice problem must not stop the turn.
 */
export async function notifyBankInsolvencyCure(
  db: Db,
  input: BankInsolvencyCureNoticeInput
): Promise<boolean> {
  if (!input.userId || input.userId.toString() === SYSTEM_USER_ID) return false;
  try {
    const res = await notificationsCollection(db).updateOne(
      {
        userId: input.userId,
        type: "bank_supervision_breach",
        "metadata.corporationId": input.corporationId.toHexString(),
        "metadata.insolventSinceTurn": input.openedTurn,
      },
      {
        $setOnInsert: {
          userId: input.userId,
          type: "bank_supervision_breach",
          title: "Bank assets below what it owes",
          message: bankInsolvencyCureMessage(input),
          read: false,
          metadata: {
            corporationId: input.corporationId.toHexString(),
            insolventSinceTurn: input.openedTurn,
            deadlineTurn: input.deadlineTurn,
            deficit: Math.ceil(input.deficit),
            reason: "bank_insolvency_cure",
          },
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    return res.upsertedCount === 1;
  } catch (err) {
    Sentry.captureException(err, { tags: { operation: "notify_bank_insolvency_cure" } });
    return false;
  }
}
