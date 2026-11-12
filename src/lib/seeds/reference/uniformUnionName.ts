import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";
import type { OperatingSectorType } from "@/lib/constants/corporations";

/**
 * One national labour body covering every sector.
 *
 * Used for state-directed single-federation systems and for countries whose only
 * safely attestable body for an era is the national confederation. Sectors
 * omitted from a country's map fall back to `genericUnionName`, preferred over
 * inventing a plausible-sounding but fake union.
 *
 * ⚠️ THIS LIVES IN ITS OWN MODULE TO BREAK A CYCLE: `unionNames.ts` imports the
 * per-country era maps, so it cannot export a helper those maps need. A shared
 * third module avoids both a runtime cycle and a drifting duplicate.
 */
export function uniform(name: string): Partial<Record<OperatingSectorType, string>> {
  const map: Partial<Record<OperatingSectorType, string>> = {};
  for (const type of OPERATING_SECTOR_TYPES) map[type] = name;
  return map;
}
