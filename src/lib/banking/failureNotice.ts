import type { Db, ObjectId } from "mongodb";
import { notificationsCollection } from "@/lib/db/repositories/notifications";

export interface BankFailureNoticeInput {
  corporationId: ObjectId;
  bankName: string;
  userId?: ObjectId | null;
  turn: number;
  depositTaking: boolean;
}

const SYSTEM_USER_ID = "000000000000000000000000";

/**
 * Tell the operator their bank was closed by the automatic solvency check.
 * Written once per failure: the upsert key is the bank plus the failure turn,
 * so a replayed pass or a retry never sends a second copy. Never throws; a
 * notice problem must not undo the closure.
 */
export async function notifyBankFailure(db: Db, input: BankFailureNoticeInput): Promise<boolean> {
  if (!input.userId || input.userId.toString() === SYSTEM_USER_ID) return false;
  const reason = input.depositTaking
    ? "Depositors withdrew more than its cash and liquid securities could cover, or its assets no longer covered what it owed."
    : "Its trading losses wiped out its capital.";
  try {
    const res = await notificationsCollection(db).updateOne(
      {
        userId: input.userId,
        type: "bank_supervision_breach",
        "metadata.corporationId": input.corporationId.toHexString(),
        "metadata.failedTurn": input.turn,
      },
      {
        $setOnInsert: {
          userId: input.userId,
          type: "bank_supervision_breach",
          title: "Bank closed",
          message: `${input.bankName} was closed on turn ${input.turn}. ${reason} Its charter is archived and depositors are paid from what the bank held. You can apply for a new charter.`,
          read: false,
          metadata: {
            corporationId: input.corporationId.toHexString(),
            failedTurn: input.turn,
            reason: "bank_failed",
          },
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    return res.upsertedCount === 1;
  } catch (err) {
    console.error("[notifyBankFailure] Failed:", err);
    return false;
  }
}
