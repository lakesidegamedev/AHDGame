/**
 * Constituencies hold a proportional share of their game's regional population.
 * loadUkPopulationSubdivisions uses the complete 2024 map electorate as fallback
 * weights, not as measured resident headcounts or historical constituency boundaries.
 */
import { UK_REGION_NAMES } from "@/lib/constants/states";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PopulationSubdivisionReference } from "@/lib/counties/subdivisionReference";
export function hasUkPopulationSubdivisions(stateId: string): boolean {
  return Object.hasOwn(UK_REGION_NAMES, stateId);
}
const cache = new Map<string, Promise<PopulationSubdivisionReference[]>>();
export function loadUkPopulationSubdivisions(
  stateId: string
): Promise<PopulationSubdivisionReference[]> {
  if (!hasUkPopulationSubdivisions(stateId)) throw new Error("Invalid constituency region ID");
  let pending = cache.get(stateId);
  if (!pending) {
    pending = readFile(join(process.cwd(), "src/data/subdivisions/uk", `${stateId}.json`), "utf8")
      .then((raw) => {
        const data = JSON.parse(raw) as {
          subdivisions: { id: string; name: string; electorate: number }[];
        };
        if (!data.subdivisions?.length)
          throw new Error(`Missing constituency reference for ${stateId}`);
        return data.subdivisions.map((c) => ({ id: c.id, name: c.name, population: c.electorate }));
      })
      .catch((error) => {
        cache.delete(stateId);
        throw error;
      });
    cache.set(stateId, pending);
  }
  return pending;
}
