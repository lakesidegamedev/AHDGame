import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";
import { gameStateCollection } from "@/lib/db/repositories/gameState";

export interface WorldResetReservation {
  readonly id: string;
}

/** Reserve an idle world before teardown; turn acquisition checks the same document. */
export async function withWorldResetAdmission<T>(
  db: Db,
  work: (reservation?: WorldResetReservation) => Promise<T>,
  reservation?: WorldResetReservation
): Promise<T> {
  if (reservation) {
    const owned = await gameStateCollection(db).findOne(
      { _id: "current", resetAdmissionId: reservation.id, isProcessing: { $ne: true } },
      { projection: { _id: 1 } }
    );
    if (!owned) throw new Error("World reset admission was lost before teardown");
    return work(reservation);
  }
  const current = await gameStateCollection(db).findOne(
    { _id: "current" },
    { projection: { _id: 1 } }
  );
  if (!current) return work();
  const id = randomUUID();
  try {
    const claim = await gameStateCollection(db).updateOne(
      {
        _id: "current",
        isProcessing: { $ne: true },
        resetAdmissionId: null,
        processingKind: { $nin: ["economyReset", "stockTaxMigration"] },
      },
      { $set: { isActive: false, resetAdmissionId: id, updatedAt: new Date() } }
    );
    if (claim.matchedCount !== 1)
      throw new Error(
        "A turn, migration or reset is processing. Finish its recovery before resetting the world."
      );
    return await work({ id });
  } finally {
    await gameStateCollection(db).updateOne(
      { _id: "current", resetAdmissionId: id },
      { $set: { resetAdmissionId: null, updatedAt: new Date() } }
    );
  }
}
