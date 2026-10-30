/**
 * County maps and field offices read the same persisted population stock.
 * loadCountyPopulationMap batches a state's counties; reference populations
 * are reserved for initialization and never substitute for missing runtime data.
 */
import { loadCountyReference } from "./reference";
import { countyPopulationTotal } from "./rules";
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
  const reference = await loadCountyReference(stateId);
  const ids = new Set(rows.map((c) => c._id));
  if (rows.length !== reference.length || reference.some((c) => !ids.has(c.fips)))
    throw new Error(`Incomplete county population coverage for ${stateId}`);
  countyPopulationTotal(rows.map((c) => ({ id: c._id, population: c.population })));
  return new Map(rows.map((c) => [c._id, c.population]));
}
