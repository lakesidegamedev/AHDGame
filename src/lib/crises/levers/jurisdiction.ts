import type { Db } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import type { State } from "@/lib/db/types/state";

/** Countries a crisis reaches; null when it reaches every country. */
export async function crisisCountryIds(
  db: Db,
  crisis: Pick<Crisis, "scope" | "countryIds" | "regionIds">
): Promise<string[] | null> {
  if (crisis.scope === "global") return null;
  if (crisis.countryIds.length > 0) return crisis.countryIds;
  if (crisis.regionIds.length === 0) return [];
  const states = await db
    .collection<State>("states")
    .find({ _id: { $in: crisis.regionIds } }, { projection: { countryId: 1 } })
    .toArray();
  return [...new Set(states.map((state) => state.countryId))];
}

/** A governor answers only for a regional crisis that reaches their own state. */
export function governsAffectedState(
  actor: { currentOffice?: { state?: string } | null },
  crisis: Pick<Crisis, "regionIds"> & { v2: { scope: string } }
): boolean {
  const regional = crisis.v2.scope === "local" || crisis.v2.scope === "state";
  if (!regional || crisis.regionIds.length === 0) return true;
  const state = actor.currentOffice?.state?.toUpperCase();
  return state !== undefined && crisis.regionIds.some((id) => id.toUpperCase() === state);
}
