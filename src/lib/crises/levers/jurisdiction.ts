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
