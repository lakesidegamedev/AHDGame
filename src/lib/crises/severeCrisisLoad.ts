import type { Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import type { SevereCrisisRow } from "./rules/severeLoad";

/** Active crises in the shape the stacking guard reads, in one round trip. */
export async function loadActiveSevereCrisisRows(db: Db): Promise<SevereCrisisRow[]> {
  return db
    .collection<Crisis>("crises")
    .find(
      { status: "active" },
      {
        projection: {
          _id: 0,
          scope: 1,
          countryIds: 1,
          opportunity: 1,
          livingConflictEventId: 1,
        },
      }
    )
    .toArray() as Promise<SevereCrisisRow[]>;
}
