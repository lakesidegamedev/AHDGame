import type { CountryId } from "@/lib/constants/countries";
import { ANNEXED_REGION_ADJACENCY } from "@/lib/constants/stateAdjacency";

/**
 * Neighbours `stateId` gained by annexation, restricted to `regions` (the
 * country's live region set). Symmetric: the annexed region lists its new
 * neighbours and each of them lists it. Empty while the region is still
 * abroad, so a world where the referendum has not happened is unchanged.
 */
export function annexedNeighbours(
  country: CountryId,
  stateId: string,
  regions: ReadonlySet<string>
): readonly string[] {
  const table = ANNEXED_REGION_ADJACENCY[country];
  if (!table) return [];
  const out = new Set<string>();
  if (regions.has(stateId)) for (const next of table[stateId] ?? []) out.add(next);
  for (const [annexed, neighbours] of Object.entries(table)) {
    if (neighbours.includes(stateId) && regions.has(annexed)) out.add(annexed);
  }
  return [...out].filter((next) => regions.has(next));
}
