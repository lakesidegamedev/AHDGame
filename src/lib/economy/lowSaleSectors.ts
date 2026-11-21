import type { CorporateSector } from "@/lib/db/types";
import { fundedSaleRecord } from "@/lib/corporations/rules/fundedSaleRecord";
import {
  STRANDED_DIVEST_TURNS,
  STRANDED_LOW_FILL_THRESHOLD,
} from "@/lib/corporations/strandedPlant";

type LowSaleSector = Pick<
  CorporateSector,
  "lowFillTurns" | "soldByCommodityTurn" | "producerSettlement"
>;

export interface LowSaleCount {
  count: number;
  /** What was counted, recorded as the metric's basis. */
  basis: string;
}

/**
 * Sectors that are not selling most of their output, for the vital signs.
 *
 * A sector with a funded sale record counts when less than half of what it
 * offered on its latest settled turn found a taker (sold, or delivered to its
 * own company's sites). The settlement keeps no count of consecutive low turns,
 * so this is the latest turn only. A sector with no funded record counts on the
 * legacy streak, as before: `lowFillTurns` at the divest threshold.
 */
export function countLowSaleSectors(sectors: readonly LowSaleSector[]): LowSaleCount {
  let settled = 0;
  let legacy = 0;
  let settledSeen = false;
  let legacySeen = false;
  for (const sector of sectors) {
    const record = fundedSaleRecord(sector.producerSettlement, sector.soldByCommodityTurn);
    if (record) settledSeen = true;
    else legacySeen = true;
    if (record) {
      let offered = 0;
      let taken = 0;
      for (const p of record.products ?? []) {
        offered += positive(p.offeredUnits);
        taken += positive(p.soldUnits) + positive(p.internalDeliveredUnits);
      }
      if (offered > 0 && taken / offered < STRANDED_LOW_FILL_THRESHOLD) settled += 1;
    } else if ((sector.lowFillTurns ?? 0) >= STRANDED_DIVEST_TURNS) {
      legacy += 1;
    }
  }
  const basis =
    settledSeen && legacySeen
      ? "sector_count_latest_settled_sale_under_half_or_legacy_low_fill_12_turns"
      : settledSeen
        ? "sector_count_latest_settled_sale_under_half"
        : "sector_count_low_fill_12_turns";
  return { count: settled + legacy, basis };
}

function positive(x: number | null | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}
