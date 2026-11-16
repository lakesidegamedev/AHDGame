import { ObjectId, type Db, type Document } from "mongodb";
import { afterCommit } from "@/lib/db/sessionDb";
import { computeNationalMetrics } from "@/lib/nationalMetrics";
import { recordCountryEvent } from "@/lib/turn/history/recordCountryEvent";
import { organizationMembershipsCollection } from "@/lib/db/repositories/organizationMemberships";
/**
 * The steps every secession ends with: UN membership for the new country, a
 * national metrics recompute after commit, and history events on both sides.
 */
export async function finishSecession(
  db: Db,
  originalDb: Db,
  args: {
    label: string;
    title: string;
    details: Record<string, unknown>;
    fromCountryId: string;
    toCountryId: string;
    currentTurn: number;
  }
): Promise<void> {
  const { label, title, details, fromCountryId, toCountryId, currentTurn } = args;
  await organizationMembershipsCollection<Document>(db).updateOne(
    { organizationId: "UN", countryId: toCountryId },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        organizationId: "UN",
        countryId: toCountryId,
        status: "active",
        joinedAt: new Date(),
        joinedTurn: currentTurn,
      },
    },
    { upsert: true }
  );
  await afterCommit(db, async () => {
    await computeNationalMetrics(originalDb).catch((err) =>
      console.error(`${label} secession national-metrics recompute failed:`, err)
    );
  });
  await recordCountryEvent(db, {
    countryId: fromCountryId,
    turn: currentTurn,
    eventType: "region_seceded",
    title: `${title} secedes from ${fromCountryId}`,
    details,
  }).catch((err) => console.error(`${label} secession history (from) failed:`, err));
  await recordCountryEvent(db, {
    countryId: toCountryId,
    turn: currentTurn,
    eventType: "region_seceded",
    title: `${title} becomes an independent country`,
    details,
  }).catch((err) => console.error(`${label} secession history (to) failed:`, err));
}
