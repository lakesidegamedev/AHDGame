/**
 * Counterterrorism budgets and political boards read the same standing national
 * powers and military commitments. Disabled or unopened worlds incur no cost.
 */
import type { Db } from "mongodb";
import type { LivingConflictState } from "./types";
import { TERRORISM_KEY, type TerrorismSignal } from "./rules/transnationalTerrorism";
import { livingConflictsCollection } from "@/lib/db/repositories/livingConflicts";

export async function loadTerrorismSignal(db: Db): Promise<TerrorismSignal | null> {
  return livingConflictsCollection<LivingConflictState>(db).findOne(
    { defKey: TERRORISM_KEY },
    {
      projection: {
        hasOpened: 1,
        status: 1,
        phaseLevel: 1,
        tracks: 1,
        "campaign.countryMemory": 1,
      },
    }
  );
}
