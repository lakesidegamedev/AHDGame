/**
 * Opening regions for the long-run demographic checkpoints: the seeded 2027
 * region rosters, census age shares and seeded metrics for the five countries
 * with full demography, turned into cohort vectors the same way the seeder
 * does. Shell side of `rules/longRunCheckpoints.ts`; read-only, no database.
 */
import type { StateMetrics } from "@/lib/db/types";
import { getRegionCensusData } from "@/lib/seeds/regionCensusData";
import { getRegionMetricPresets } from "@/lib/seeds/metricPresets";
import { REGION_ROSTERS } from "./substrateCoverage";
import { synthesizeAgeSexVector } from "./seedSynthesis";
import type { CheckpointRegion } from "./rules/longRunCheckpoints";

export const CHECKPOINT_COUNTRIES = ["US", "UK", "DE", "JP", "CN"] as const;
export type CheckpointCountry = (typeof CHECKPOINT_COUNTRIES)[number];

const PRESET = "2027-default";

const METRICS: Record<CheckpointCountry, () => Promise<StateMetrics[]>> = {
  US: async () => (await import("@/lib/countries/us/data/usStateMetrics2027")).stateMetrics2027,
  UK: async () => (await import("@/lib/countries/uk/data/ukStateMetrics")).ukStateMetrics,
  DE: async () => (await import("@/lib/countries/de/data/deStateMetrics")).deStateMetrics,
  JP: async () => (await import("@/lib/countries/jp/data/jpStateMetrics")).jpStateMetrics,
  CN: async () => (await import("@/lib/countries/cn/data/cnStateMetrics")).cnStateMetrics,
};

export async function loadOpeningRegions(country: CheckpointCountry): Promise<{
  regions: CheckpointRegion[];
  seededPopulation: Record<string, number>;
}> {
  const roster = await REGION_ROSTERS[country]!["2027"]!();
  const metrics = new Map((await METRICS[country]()).map((m) => [String(m._id), m]));
  const regions: CheckpointRegion[] = [];
  const seededPopulation: Record<string, number> = {};
  for (const state of roster) {
    const id = String(state._id);
    const census = getRegionCensusData(country, id, PRESET) as {
      age: Record<string, number>;
    } | null;
    const m = metrics.get(id);
    if (!census?.age || !m) throw new Error(`${country}:${id} lacks 2027 census or metrics`);
    const overlay = getRegionMetricPresets(country, id, PRESET) ?? {};
    const medianAge = overlay["population.medianAge"] ?? m.population?.medianAge?.value ?? 38;
    const birthRate = overlay["population.birthRate"] ?? m.population?.birthRate?.value ?? 50;
    const migrationPct =
      overlay["population.migrationRate"] ?? m.population?.migrationRate?.value ?? 0;
    const vector = synthesizeAgeSexVector({
      adultShares: {
        young: census.age.young ?? 0,
        mid: census.age.mid ?? 0,
        mature: census.age.mature ?? 0,
        senior: census.age.senior ?? 0,
      },
      medianAge,
      birthRate,
      population: state.population,
      survivalSeniorTail: true,
    });
    seededPopulation[id] = state.population;
    regions.push({ id, vector, birthRateIndex: birthRate, migrationPct });
  }
  return { regions, seededPopulation };
}
