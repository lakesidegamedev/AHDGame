import type { CountyCountryId, CountyPopulationBaseline } from "@/lib/counties/rules";

/** Persisted stock: US county, UK constituency, Japanese prefecture or Canadian census division. */
export interface County {
  _id: string;
  countryId: CountyCountryId;
  stateId: string;
  name: string;
  population: number;
  baselinePopulation: number;
  populationBaseline: CountyPopulationBaseline;
  populationFlowStamp?: { worldEpochId: string; turn: number; batchId: string };
}
