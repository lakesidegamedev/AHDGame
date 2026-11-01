import type { CountyCountryId, CountyPopulationBaseline } from "@/lib/counties/rules";

/** Persisted map subdivision stock: US county, UK constituency or Japanese prefecture. */
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
