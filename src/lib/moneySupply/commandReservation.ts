/** Release only this terminal command's reservation after an overlapping retry. */
import type { Db } from "mongodb";
import { centralBanksCollection } from "@/lib/db/repositories/centralBanks";

export async function releaseMonetaryCommandReservation(
  db: Db,
  bankId: string,
  reservationId: string
): Promise<void> {
  await centralBanksCollection<{ _id: string; pendingLiquidityOperationId?: string }>(db).updateOne(
    { _id: bankId, pendingLiquidityOperationId: reservationId },
    { $unset: { pendingLiquidityOperationId: "" } }
  );
}
