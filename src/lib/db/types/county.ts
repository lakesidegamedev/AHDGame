import type { CountyPopulationBaseline } from "@/lib/counties/rules";

/** Persisted US county stock. FIPS is stable across worlds using the committed map geometry. */
export interface County {
  _id: string;
  countryId: "US";
  stateId: string;
  name: string;
  population: number;
  baselinePopulation: number;
  populationBaseline: CountyPopulationBaseline;
  populationFlowStamp?: { worldEpochId: string; turn: number; batchId: string };
}
