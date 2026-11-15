/** Read the current disease pressure for ordinary health and population phases. */
import type { Db } from "mongodb";
import type { LivingConflictState } from "./types";
import { PANDEMIC_KEY } from "./rules/pandemic";
import { livingConflictsCollection } from "@/lib/db/repositories/livingConflicts";

export async function loadPandemicSignal(db: Db): Promise<LivingConflictState | null> {
  return livingConflictsCollection<LivingConflictState>(db).findOne(
    { defKey: PANDEMIC_KEY, hasOpened: true, status: { $ne: "closed" } },
    {
      projection: {
        hasOpened: 1,
        status: 1,
        tracks: 1,
        totalTurns: 1,
        phaseLevel: 1,
        pandemicOriginCountryId: 1,
      },
    }
  );
}
