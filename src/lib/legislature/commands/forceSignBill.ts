import type { Db, ObjectId } from "mongodb";
import { withSessionDb, afterCommit } from "@/lib/db/sessionDb";
import { billsCollection } from "@/lib/db/repositories/bills";
import { gameStateCollection } from "@/lib/db/repositories/gameState";
import { applyEnactedBillEffects } from "./applyEnactedBillEffects";
import { flushServerPosthog } from "@/lib/analytics/serverPosthog";

/** Staff assent uses the same atomic enactment boundary as player assent. */
export async function forceSignBill(db: Db, billId: ObjectId, now: Date): Promise<void> {
  await withSessionDb(db, async (tx) => {
    const bill = await billsCollection(tx).findOne({ _id: billId });
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "signed") return;
    const changed = await billsCollection(tx).updateOne(
      { _id: billId, status: bill.status },
      { $set: { status: "signed", presidentAction: "signed", enactedAt: now, updatedAt: now } }
    );
    if (changed.modifiedCount !== 1) throw new Error("Bill changed during staff assent");
    const state = await gameStateCollection(tx).findOne({ _id: "current" });
    await applyEnactedBillEffects(tx, bill, state?.currentTurn ?? 1, {
      effect: "Staff assent effect failed",
      enactment: "Staff assent enactment failed",
    });
    await afterCommit(tx, () => flushServerPosthog());
  });
}
