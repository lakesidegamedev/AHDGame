/**
 * Population subdivisions use the committed map roster beneath each game region.
 * loadPopulationSubdivisionReference keeps country weights in country-owned adapters;
 * the shared seed and demographic journal conserve the same integer stocks.
 */
import { loadCountyReference } from "./reference";
import { loadCaPopulationSubdivisions } from "@/lib/countries/ca/populationSubdivisions";
import { hasCanadianLocalGeography } from "@/lib/countries/ca/rules/localGeography";
import {
  loadUkPopulationSubdivisions,
  hasUkPopulationSubdivisions,
} from "@/lib/countries/uk/populationSubdivisions";
import {
  loadJpPopulationSubdivisions,
  hasJpPopulationSubdivisions,
} from "@/lib/countries/jp/populationSubdivisions";
import type { CountyCountryId, CountyPopulationBaseline } from "./rules";

export interface PopulationSubdivisionReference {
  id: string;
  name: string;
  population: number;
}
interface ReferenceAdapter {
  has: (stateId: string) => boolean;
  load: (stateId: string) => Promise<PopulationSubdivisionReference[]>;
  baseline: CountyPopulationBaseline;
}
const REFERENCES: Record<CountyCountryId, ReferenceAdapter> = {
  US: {
    has: (stateId) => /^[A-Z]{2}$/.test(stateId),
    load: async (stateId) =>
      (await loadCountyReference(stateId)).map((c) => ({
        id: c.fips,
        name: c.name,
        population: c.population,
      })),
    baseline: "census-vintage-2019",
  },
  UK: {
    has: hasUkPopulationSubdivisions,
    load: loadUkPopulationSubdivisions,
    baseline: "uk-electorate-2024-proportional",
  },
  JP: {
    has: hasJpPopulationSubdivisions,
    load: async (stateId) => loadJpPopulationSubdivisions(stateId),
    baseline: "jp-reference-2020-proportional",
  },
  CA: {
    has: hasCanadianLocalGeography,
    load: loadCaPopulationSubdivisions,
    baseline: "ca-census-2021-proportional",
  },
};

/** Newly acquired regions retain their own geography instead of acquiring invented map units. */
export function hasPopulationSubdivisionReference(
  stateId: string,
  countryId: CountyCountryId
): boolean {
  return REFERENCES[countryId].has(stateId);
}
export function loadPopulationSubdivisionReference(
  stateId: string,
  countryId: CountyCountryId
): Promise<PopulationSubdivisionReference[]> {
  return REFERENCES[countryId].load(stateId);
}
export function referencePopulationBaseline(countryId: CountyCountryId): CountyPopulationBaseline {
  return REFERENCES[countryId].baseline;
}
