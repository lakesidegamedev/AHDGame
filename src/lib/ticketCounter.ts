import { getDb } from "@/lib/mongodb";
import { countersCollection } from "@/lib/db/repositories/counters";
import { ticketsCollection } from "@/lib/db/repositories/tickets";

/**
 * Next display ticket number for the Discord support tickets (`tickets` collection).
 * Counter key `tickets`, independent from `suggestions` and legacy `feedback`.
 * Seeds from the current max so it stays correct even if the counter doc is
 * missing or behind.
 */
export async function getNextTicketNumber(discordFloor = 0): Promise<number> {
  const db = await getDb();

  const maxDoc = await ticketsCollection<{ ticketNumber?: number }>(db).findOne(
    { ticketNumber: { $exists: true } },
    { sort: { ticketNumber: -1 } }
  );
  const maxExisting = Math.max(maxDoc?.ticketNumber ?? 0, discordFloor);

  const result = await countersCollection<{ _id: string; seq: number }>(db).findOneAndUpdate(
    { _id: "tickets" },
    [
      { $set: { seq: { $max: [{ $ifNull: ["$seq", 0] }, maxExisting] } } },
      { $set: { seq: { $add: ["$seq", 1] } } },
    ],
    { upsert: true, returnDocument: "after" }
  );

  return result?.seq ?? maxExisting + 1;
}
