import type { Db } from "mongodb";
import type { OrganizationLegislation } from "@/lib/db/types/internationalOrganization";
import { getOrganizationLegislationCollection } from "@/lib/db/collections";
import { withSessionDb } from "@/lib/db/sessionDb";

/** Re-read ballots and commit activation with every one-time effect. */
export async function withPendingOrganizationResolution(
  db: Db,
  observed: Pick<OrganizationLegislation, "_id">,
  apply: (db: Db, resolution: OrganizationLegislation) => Promise<void>
): Promise<boolean> {
  return withSessionDb(db, async (db) => {
    const resolution = await (
      await getOrganizationLegislationCollection(db)
    ).findOne({ _id: observed._id, status: "pending" });
    if (!resolution) return false;
    await apply(db, resolution);
    return true;
  });
}
