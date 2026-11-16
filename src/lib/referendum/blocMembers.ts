/**
 * Reads the member states behind a referendum's region key. A single region is
 * a bloc of one, so callers do not branch on the kind of entry.
 */
import type { Db } from "mongodb";
import type { MacroMetricsDoc } from "@/lib/db/types/macroMetrics";
import { macroMetricsCollection } from "@/lib/db/repositories/macroMetrics";
import { statesCollection } from "@/lib/db/repositories/states";
import { pooledDesire, type PooledMember } from "./rules/pooledElectorate";
import { sovereigntyMemberRegionIds } from "./rules/sovereigntyRegions";

export interface BlocMemberReading extends PooledMember {
  desire: number;
}

/** Each member's population and current independence desire, in registry order. */
export async function loadBlocMembers(
  db: Db,
  regionKey: string,
  fallbackDesire = 0
): Promise<BlocMemberReading[]> {
  const ids = sovereigntyMemberRegionIds(regionKey);
  if (ids.length === 1) {
    const doc = await macroMetricsCollection<MacroMetricsDoc>(db).findOne({ _id: ids[0] });
    return [
      { regionId: ids[0], population: 0, desire: doc?.independenceDesire?.value ?? fallbackDesire },
    ];
  }
  const [metrics, states] = await Promise.all([
    macroMetricsCollection<MacroMetricsDoc>(db)
      .find({ _id: { $in: ids } }, { projection: { "independenceDesire.value": 1 } })
      .toArray(),
    ids.length > 1
      ? statesCollection(db)
          .find({ _id: { $in: ids } }, { projection: { population: 1 } })
          .toArray()
      : Promise.resolve([]),
  ]);
  const desireById = new Map(metrics.map((doc) => [doc._id, doc.independenceDesire?.value]));
  const populationById = new Map(states.map((doc) => [doc._id, doc.population ?? 0]));
  return ids.map((regionId) => ({
    regionId,
    population: populationById.get(regionId) ?? 0,
    desire: desireById.get(regionId) ?? fallbackDesire,
  }));
}

/** The pooled desire of a region or bloc, or null when no member has a reading. */
export async function loadPooledDesire(db: Db, regionKey: string): Promise<number | null> {
  const members = await loadBlocMembers(db, regionKey, Number.NaN);
  if (members.every((member) => Number.isNaN(member.desire))) return null;
  return pooledDesire(
    members.map((member) => ({
      ...member,
      desire: Number.isNaN(member.desire) ? 0 : member.desire,
    }))
  );
}
