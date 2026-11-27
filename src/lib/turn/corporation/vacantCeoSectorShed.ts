/**
 * Corporations without an active CEO cannot defend market share indefinitely.
 * Each turn, a fraction of each owned sector's capacity (revenue and workforce
 * below the plants tier) ceases; it is not handed to any pool.
 *
 * Runs immediately after `buildCorporationLookups` so we reuse the same corp/sector
 * snapshot (no second corporations query) and `processSectors` sees reduced revenue.
 */

import type { Db } from "mongodb";
import type { Corporation } from "@/lib/db/types";
import type { CorporationLookups } from "./types";
import { shedSectorsForCorps, type SectorShedResult } from "./corporationSectorShed";

/** Share of each corporate sector's revenue + workers shed per turn (10%). */
export const VACANT_CEO_SECTOR_SHED_RATE = 0.1;

/** Re-export for backwards compatibility with existing tests. */
export type VacantCeoShedResult = SectorShedResult;

function shouldShedSectors(
  corp: Pick<Corporation, "countryOwnerId" | "ceoId" | "ceoVacant" | "isNationalized" | "suspended">
): boolean {
  if (corp.countryOwnerId != null) return false;
  if (corp.isNationalized) return false;
  // A suspended corp is frozen from turn processing (e.g. a privatization-auction
  // shell awaiting sale) — it must not bleed its sectors away.
  if (corp.suspended) return false;
  return corp.ceoId == null || corp.ceoVacant === true;
}

export async function shedVacantCeoSectors(
  db: Db,
  lookups: CorporationLookups,
  now: Date,
  /** `marketSystemMode >= "plants"` — sheds capacity units instead of revenue. */
  plantsEnabled: boolean = false,
  currentTurn?: number
): Promise<VacantCeoShedResult> {
  const sheddingCorps = lookups.corporations.filter(shouldShedSectors);
  return shedSectorsForCorps(
    db,
    lookups,
    sheddingCorps,
    VACANT_CEO_SECTOR_SHED_RATE,
    now,
    "Vacant CEO",
    plantsEnabled,
    currentTurn
  );
}
