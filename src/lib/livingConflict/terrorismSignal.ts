/**
 * Counterterrorism budgets and political boards read the same standing national
 * powers and military commitments. Disabled or unopened worlds incur no cost.
 */
import type { Db } from "mongodb";
import type { LivingConflictState } from "./types";
import { TERRORISM_KEY, type TerrorismSignal } from "./rules/transnationalTerrorism";

export async function loadTerrorismSignal(db: Db): Promise<TerrorismSignal | null> {
  return db.collection<LivingConflictState>("livingConflicts").findOne(
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
