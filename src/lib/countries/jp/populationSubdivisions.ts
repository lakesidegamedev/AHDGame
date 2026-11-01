/**
 * Prefectures hold the population beneath Japan's eight playable regions.
 * loadJpPopulationSubdivisions supplies the directory's approximate 2020 weights;
 * initialization scales them to the selected preset's regional headcounts.
 */
import { JP_PREFECTURES, JP_REGION_IDS } from "./data/jpRegionDirectory";
import type { PopulationSubdivisionReference } from "@/lib/counties/subdivisionReference";
export function hasJpPopulationSubdivisions(stateId: string): boolean {
  return JP_REGION_IDS.includes(stateId);
}
export function loadJpPopulationSubdivisions(stateId: string): PopulationSubdivisionReference[] {
  const rows = JP_PREFECTURES.filter((p) => p.regionId === stateId);
  if (!rows.length) throw new Error(`Missing prefecture reference for ${stateId}`);
  return rows.map((p) => ({
    id: `JP-${String(p.id).padStart(2, "0")}`,
    name: p.name,
    population: p.population,
  }));
}
