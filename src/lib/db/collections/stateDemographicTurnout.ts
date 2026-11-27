import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { StateDemographicTurnout } from "../types";

/**
 * Get the stateDemographicTurnout collection.
 *
 * This collection stores state-level demographic turnout modifiers that affect
 * voter participation rates across different demographic groups.
 */
export async function getStateDemographicTurnoutCollection(providedDb?: Db) {
  const db = providedDb ?? (await getDb());
  return db.collection<StateDemographicTurnout>("stateDemographicTurnout");
}
