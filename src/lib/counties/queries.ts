/**
 * County maps and field offices read the same persisted population stock.
 * loadCountyPopulationMap batches a state's counties; reference populations
 * are reserved for initialization and never substitute for missing runtime data.
 */
import type { Db } from "mongodb";
import type { County } from "@/lib/db/types/county";
export async function loadCountyPopulationMap(
  db: Db,
  stateId: string
): Promise<Map<string, number>> {
  const rows = await db
    .collection<County>("counties")
    .find({ countryId: "US", stateId }, { projection: { _id: 1, population: 1 } })
    .toArray();
  if (!rows.length) throw new Error(`County populations not initialized for ${stateId}`);
  return new Map(rows.map((c) => [c._id, c.population]));
}
