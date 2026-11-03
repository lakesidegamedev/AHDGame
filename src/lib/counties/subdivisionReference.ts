/**
 * Population subdivisions use the committed map roster beneath each game region.
 * loadPopulationSubdivisionReference keeps country weights in country-owned adapters;
 * the shared seed and demographic journal conserve the same integer stocks.
 */
import { loadCountyReference } from "./reference";
import {
  loadUkPopulationSubdivisions,
  hasUkPopulationSubdivisions,
} from "@/lib/countries/uk/populationSubdivisions";
import {
  loadJpPopulationSubdivisions,
  hasJpPopulationSubdivisions,
} from "@/lib/countries/jp/populationSubdivisions";
import type { CountyCountryId, CountyPopulationBaseline } from "./rules";

/** Newly acquired regions keep their own geography; a country flag does not create map data. */
export function hasPopulationSubdivisionReference(
  stateId: string,
  countryId: CountyCountryId
): boolean {
  switch (countryId) {
    case "US":
      return /^[A-Z]{2}$/.test(stateId);
    case "UK":
      return hasUkPopulationSubdivisions(stateId);
    case "JP":
      return hasJpPopulationSubdivisions(stateId);
  }
}
export interface PopulationSubdivisionReference {
  id: string;
  name: string;
  population: number;
}
export async function loadPopulationSubdivisionReference(
  stateId: string,
  countryId: CountyCountryId
): Promise<PopulationSubdivisionReference[]> {
  switch (countryId) {
    case "US":
      return (await loadCountyReference(stateId)).map((c) => ({
        id: c.fips,
        name: c.name,
        population: c.population,
      }));
    case "UK":
      return loadUkPopulationSubdivisions(stateId);
    case "JP":
      return loadJpPopulationSubdivisions(stateId);
  }
}
export function referencePopulationBaseline(countryId: CountyCountryId): CountyPopulationBaseline {
  switch (countryId) {
    case "US":
      return "census-vintage-2019";
    case "UK":
      return "uk-electorate-2024-proportional";
    case "JP":
      return "jp-reference-2020-proportional";
  }
}
