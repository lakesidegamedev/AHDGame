import type { ClientSession, Db, ObjectId } from "mongodb";
import type { IndexFund } from "@/lib/db/types/indexFund";
import { sponsorUnitsLocked } from "./rules/accounting";
import { indexFundPositionsCollection } from "@/lib/db/repositories/indexFundPositions";
import type { Document } from "mongodb";
import { indexFundRedemptionQueueCollection } from "@/lib/db/repositories/indexFundRedemptionQueue";
import { indexFundCommandsCollection } from "@/lib/db/repositories/indexFundCommands";

/** Shared capability for the account menu and the redemption mutation. */
export async function canRedeemSponsorUnits(
  db: Db,
  fund: IndexFund,
  corporationId: ObjectId,
  options?: { session?: ClientSession }
): Promise<boolean> {
  if (fund.seedAccounting !== "paid_units" || !fund.sponsorCorporationId?.equals(corporationId))
    return true;
  const otherHolders = await indexFundPositionsCollection<Document>(db).countDocuments(
    {
      fundId: fund._id,
      units: { $gt: 0 },
      corporationId: { $ne: corporationId },
    },
    options
  );
  const pendingSubscriptions = await indexFundCommandsCollection<Document>(db).countDocuments(
    { "subscription.fundId": fund._id, "subscription.status": "queued" },
    options
  );
  const pendingWithdrawals = await indexFundRedemptionQueueCollection<Document>(db).countDocuments(
    {
      fundId: fund._id,
      status: { $in: ["queued", "partial", "processing"] },
    },
    options
  );
  return !sponsorUnitsLocked({
    accounting: fund.seedAccounting,
    isSponsor: true,
    otherHolders: otherHolders + pendingSubscriptions,
    pendingWithdrawals,
  });
}
