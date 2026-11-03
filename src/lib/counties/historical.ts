/** Server seed adapter for the audited, committed Census county snapshots. */
import history from "@/lib/countries/us/data/countyPopulationHistory.json";
import type { CountyPopulation, CountyBaselineYear } from "./rules";

type Snapshot = { populations: Readonly<Record<string, number>> };
const snapshots: Readonly<Record<string, Snapshot>> = history.snapshots;

export function historicalCountyWeights(
  stateFips: string | undefined,
  year: CountyBaselineYear
): CountyPopulation[] {
  if (year === 2019) return [];
  if (!stateFips || !/^\d{2}$/.test(stateFips)) throw new Error("Invalid county state FIPS");
  const snapshot = snapshots[year];
  if (!snapshot) throw new Error(`Missing county population snapshot ${year}`);
  return Object.entries(snapshot.populations)
    .filter(([id]) => id.startsWith(stateFips))
    .map(([id, population]) => ({ id, population }));
}
